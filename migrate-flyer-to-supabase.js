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
// 冪等設計: Supabase に同名ファイルが既にあればスキップ（重複アップロードしない）
// Drive ファイルは削除しない（切り戻し用に残す）
//
// 移行後の storageKey = Drive ファイル名（例: イラスト_桜.png）

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
  log.push(DR + '=== チラシ画像移行スクリプト (' + new Date().toLocaleString('ja-JP') + ') ===');

  // --- Step 1: Drive の flyer フォルダからファイル一覧を取得 ---
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
      log.push('⚠ Drive に assets フォルダがありません。移行対象ファイルはゼロ件です。');
      Logger.log(log.join('\n'));
      return;
    }
    var assetsFolder = assetsIter.next();
    var flyerIter = assetsFolder.getFoldersByName('flyer');
    if (!flyerIter.hasNext()) {
      log.push('⚠ Drive に assets/flyer フォルダがありません。移行対象ファイルはゼロ件です。');
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

  // --- Step 2: Supabase Storage の既存ファイルを取得（冪等性チェック用）---
  var existingInSupabase = {}; // {name: true}
  try {
    var existing = supabaseStorageList_('flyer-images', '');
    existing.forEach(function(f) {
      if (f.name) existingInSupabase[f.name] = true;
    });
    log.push('Supabase Storage 既存ファイル数: ' + existing.length + ' 件');
  } catch (e) {
    Logger.log('❌ Supabase Storage 一覧取得エラー: ' + e);
    Logger.log('バケット "flyer-images" が存在するか、SUPABASE_URL / SUPABASE_SERVICE_KEY を確認してください。');
    return;
  }

  // --- Step 3: Drive → Supabase Storage アップロード ---
  var uploaded = 0, skipped = 0, uploadErrors = 0;
  // driveId → storageKey のマップ（Step 4 で使用）
  var driveIdToStorageKey = {}; // {driveFileId: storageKey}

  driveFiles.forEach(function(f) {
    var storageKey = f.name; // storageKey = Drive ファイル名

    if (existingInSupabase[storageKey]) {
      log.push('⏭ スキップ（Supabase に既存）: ' + storageKey);
      skipped++;
      driveIdToStorageKey[f.id] = storageKey;
      return;
    }

    if (dryRun) {
      log.push('📤 [予定] アップロード: ' + storageKey + ' (' + f.mimeType + ')');
      uploaded++;
      driveIdToStorageKey[f.id] = storageKey;
      return;
    }

    try {
      var driveFile = DriveApp.getFileById(f.id);
      var bytes = driveFile.getBlob().getBytes();
      supabaseStorageUpload_('flyer-images', storageKey, bytes, f.mimeType, false);
      log.push('✅ アップロード成功: ' + storageKey);
      uploaded++;
      driveIdToStorageKey[f.id] = storageKey;
    } catch (uploadErr) {
      log.push('❌ アップロードエラー: ' + storageKey + ' → ' + uploadErr);
      uploadErrors++;
    }
  });

  // --- Step 4: Firestore imageTags を DriveFileId → storageKey に移行 ---
  var tagsMigrated = 0, tagsSkipped = 0, tagsErrors = 0;

  try {
    var allTags = firestoreQuery_('imageTags', []);
    log.push('Firestore imageTags ドキュメント数: ' + allTags.length + ' 件');

    allTags.forEach(function(doc) {
      var oldId = doc.fileId; // DriveFileId（ドキュメントID = fileId フィールド）
      if (!oldId) return;

      var storageKey = driveIdToStorageKey[oldId];
      if (!storageKey) {
        log.push('⚠ 対応 Drive ファイルなし（孤立タグ）: ' + oldId + ' → スキップ');
        tagsSkipped++;
        return;
      }

      if (oldId === storageKey) {
        log.push('⏭ タグは既に storageKey 形式: ' + oldId);
        tagsSkipped++;
        return;
      }

      if (dryRun) {
        log.push('📝 [予定] Firestore タグ移行: ' + oldId + ' → ' + storageKey + ' (タグ: ' + (doc.tags || '') + ')');
        tagsMigrated++;
        return;
      }

      try {
        // 新ドキュメントを storageKey で作成
        firestoreSet_('imageTags', storageKey, {
          fileId: storageKey,
          fileName: storageKey,
          tags: doc.tags || '',
          updatedAt: new Date().toISOString()
        });
        // 旧ドキュメント（DriveFileId）を削除
        firestoreDelete_('imageTags', oldId);
        log.push('✅ Firestore タグ移行: ' + oldId + ' → ' + storageKey);
        tagsMigrated++;
      } catch (tagErr) {
        log.push('❌ Firestore タグ移行エラー: ' + oldId + ' → ' + tagErr);
        tagsErrors++;
      }
    });
  } catch (e) {
    log.push('❌ Firestore imageTags 取得エラー: ' + e);
  }

  // --- サマリー ---
  log.push('');
  log.push('=== 結果サマリー ===');
  log.push('Drive → Supabase: アップロード ' + uploaded + ' 件 / スキップ ' + skipped + ' 件 / エラー ' + uploadErrors + ' 件');
  log.push('Firestore タグ移行: 移行 ' + tagsMigrated + ' 件 / スキップ ' + tagsSkipped + ' 件 / エラー ' + tagsErrors + ' 件');
  if (dryRun) {
    log.push('');
    log.push('※ ドライランのため実際の変更は行っていません。');
    log.push('  本番移行は migrateFlyerImagesToSupabase() を実行してください。');
  } else {
    log.push('');
    log.push('移行完了。features.js の新バージョンをデプロイしてから動作確認してください。');
  }

  Logger.log(log.join('\n'));
}
