// ========================================
// 【移行スクリプト】チラシ画像 Drive → Supabase Storage
// ========================================
//
// 実行方法（GASエディタ）:
//   ドライラン（変更なし・確認のみ）: migrateFlyerImagesToSupabaseDryRun を選択して実行
//   本番移行（実際に移行を実行）    : migrateFlyerImagesToSupabase を選択して実行
//
// 実行後はログ（表示→ログ）で結果を確認する
//
// 設計:
//   storageKey   = UUID + 拡張子（例: "a3f8c9e1-b2d4-12d3-a456.jpg"）
//   originalName = Drive ファイル名（例: "春_桜の前でジャンプする女子高生.jpg"）
//   Supabase Storage は日本語パスを拒否するため UUID を使用。
//   日本語表示名は Firestore imageTags の originalName フィールドで保持。
//
// 冪等設計:
//   Firestore imageTags に originalName フィールドが存在するドキュメント = 移行済み
//   同じ originalName が既に Firestore にあればスキップ（重複アップロードしない）
//
// Drive ファイルは削除しない（切り戻し用に残す）

/**
 * ドライラン: 実際には何も変更せず、移行予定の内容をログ出力する
 */
function migrateFlyerImagesToSupabaseDryRun() {
  migrateFlyerImagesToSupabase_(true);
}

/**
 * 本番移行: Drive → Supabase Storage へ実際にファイルをコピーし、Firestore タグを移行する
 */
function migrateFlyerImagesToSupabase() {
  migrateFlyerImagesToSupabase_(false);
}

function migrateFlyerImagesToSupabase_(dryRun) {
  var log = [];
  var DR = dryRun ? '[ドライラン] ' : '';
  log.push(DR + '=== チラシ画像移行スクリプト v2 (' + new Date().toLocaleString('ja-JP') + ') ===');
  log.push('設計: storageKey = UUID + 拡張子 / originalName = 日本語表示名');

  // ========================================
  // Step 1: Drive の flyer フォルダからファイル一覧を取得
  // ========================================
  var folderId = PropertiesService.getScriptProperties().getProperty('APP_FOLDER_ID');
  if (!folderId) {
    Logger.log('❌ APP_FOLDER_ID がスクリプトプロパティに設定されていません。中断します。');
    return;
  }

  var ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  var driveFiles = []; // [{id, name, mimeType}]

  try {
    var rootFolder = DriveApp.getFolderById(folderId);
    var assetsIter = rootFolder.getFoldersByName('assets');
    if (!assetsIter.hasNext()) {
      log.push('⚠ Drive に assets フォルダがありません。移行対象はゼロ件です。');
      Logger.log(log.join('\n'));
      return;
    }
    var assetsFolder = assetsIter.next();
    var flyerIter = assetsFolder.getFoldersByName('flyer');
    if (!flyerIter.hasNext()) {
      log.push('⚠ Drive に assets/flyer フォルダがありません。移行対象はゼロ件です。');
      Logger.log(log.join('\n'));
      return;
    }
    var flyerFolder = flyerIter.next();

    var files = flyerFolder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (ALLOWED_MIME.indexOf(f.getMimeType()) !== -1) {
        driveFiles.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType() });
      }
    }
    log.push('Drive flyer ファイル数: ' + driveFiles.length + ' 件');
  } catch (e) {
    Logger.log('❌ Drive ファイル取得エラー: ' + e);
    return;
  }

  // ========================================
  // Step 2: Firestore imageTags を全件読み込んで状態分析
  // ========================================
  // 移行済み: originalName フィールドあり → {originalName: storageKey(UUID)} マップ
  // 旧形式:   originalName フィールドなし → {driveFileId: tags} マップ
  var existingByOriginalName = {}; // {originalName: storageKey(UUID)}
  var oldTagsByDocId = {};         // {driveFileId or oldKey: tags}（旧ドキュメント）
  var oldDocIds = [];              // 移行後に削除する旧ドキュメントID

  try {
    var allTags = firestoreQuery_('imageTags', []);
    log.push('Firestore imageTags ドキュメント数: ' + allTags.length + ' 件');

    allTags.forEach(function(doc) {
      if (!doc.fileId) return;
      if (doc.originalName) {
        // 移行済みドキュメント（UUID形式）
        existingByOriginalName[doc.originalName] = doc.fileId;
      } else {
        // 旧形式ドキュメント（DriveFileID or 日本語名キー）
        oldTagsByDocId[doc.fileId] = doc.tags || '';
        // fileNameがあればそれも旧タグのキーとして登録（DriveFileId→filename参照用）
        if (doc.fileName && doc.fileName !== doc.fileId) {
          oldTagsByDocId[doc.fileName] = doc.tags || '';
        }
        oldDocIds.push(doc.fileId);
      }
    });

    log.push('  移行済みドキュメント: ' + Object.keys(existingByOriginalName).length + ' 件');
    log.push('  旧形式ドキュメント: ' + oldDocIds.length + ' 件');
  } catch (e) {
    Logger.log('❌ Firestore imageTags 取得エラー: ' + e);
    return;
  }

  // ========================================
  // Step 3: Drive → Supabase Storage アップロード
  // ========================================
  var uploaded = 0, skipped = 0, uploadErrors = 0;
  // {driveFileId: storageKey} のマップ（Step 4 のタグ移行で使用）
  var driveIdToStorageKey = {};

  driveFiles.forEach(function(f) {
    // 冪等チェック: 同名 originalName が Firestore に既存 → スキップ
    if (existingByOriginalName[f.name]) {
      log.push('⏭ スキップ（移行済み）: ' + f.name + ' → ' + existingByOriginalName[f.name]);
      skipped++;
      driveIdToStorageKey[f.id] = existingByOriginalName[f.name];
      return;
    }

    // 新規移行: UUID storageKey を生成
    var dotIdx = f.name.lastIndexOf('.');
    var ext = dotIdx !== -1 ? f.name.substring(dotIdx) : '';
    var storageKey = Utilities.getUuid() + ext;

    if (dryRun) {
      log.push('📤 [予定] アップロード: ' + f.name + ' → ' + storageKey);
      uploaded++;
      driveIdToStorageKey[f.id] = storageKey;
      return;
    }

    try {
      var driveFile = DriveApp.getFileById(f.id);
      var bytes = driveFile.getBlob().getBytes();
      supabaseStorageUpload_('flyer-images', storageKey, bytes, f.mimeType, false);

      // 旧ドキュメントのタグを引き継ぐ（DriveFileID → ファイル名 → 空文字の優先度）
      var inheritedTags = oldTagsByDocId[f.id] || oldTagsByDocId[f.name] || '';

      // Firestore に新ドキュメント（UUID キー + originalName + タグ）を書き込む
      firestoreSet_('imageTags', storageKey, {
        fileId: storageKey,
        fileName: storageKey,
        originalName: f.name,
        tags: inheritedTags,
        updatedAt: new Date().toISOString()
      });

      log.push('✅ アップロード成功: ' + f.name + ' → ' + storageKey + (inheritedTags ? ' [タグ引継]' : ''));
      uploaded++;
      driveIdToStorageKey[f.id] = storageKey;
    } catch (uploadErr) {
      log.push('❌ アップロードエラー: ' + f.name + ' → ' + uploadErr);
      uploadErrors++;
    }
  });

  // ========================================
  // Step 4: 旧 Firestore ドキュメントを削除
  // ========================================
  var deletedOldDocs = 0, deleteErrors = 0;

  if (!dryRun) {
    oldDocIds.forEach(function(oldId) {
      try {
        firestoreDelete_('imageTags', oldId);
        log.push('🗑 旧ドキュメント削除: ' + oldId);
        deletedOldDocs++;
      } catch (delErr) {
        log.push('❌ 旧ドキュメント削除エラー: ' + oldId + ' → ' + delErr);
        deleteErrors++;
      }
    });
  } else if (oldDocIds.length > 0) {
    log.push('🗑 [予定] 旧ドキュメント削除: ' + oldDocIds.length + ' 件');
  }

  // ========================================
  // サマリー
  // ========================================
  log.push('');
  log.push('=== 結果サマリー ===');
  log.push('Drive → Supabase: アップロード ' + uploaded + ' 件 / スキップ ' + skipped + ' 件 / エラー ' + uploadErrors + ' 件');
  if (!dryRun) {
    log.push('旧 Firestore ドキュメント削除: ' + deletedOldDocs + ' 件 / エラー ' + deleteErrors + ' 件');
  }

  if (dryRun) {
    log.push('');
    log.push('※ ドライランのため実際の変更は行っていません。');
    log.push('  本番移行は migrateFlyerImagesToSupabase() を実行してください。');
  } else {
    var hasError = uploadErrors > 0 || deleteErrors > 0;
    log.push('');
    if (hasError) {
      log.push('⚠ エラーがあります。ログを確認してから動作確認してください。');
      log.push('  エラーになったファイルのみ再実行できます（冪等設計）。');
    } else {
      log.push('✅ 移行完了。アプリの外部チラシタブで画像一覧が表示されることを確認してください。');
    }
  }

  Logger.log(log.join('\n'));
}
