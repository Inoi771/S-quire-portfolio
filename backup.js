// ========================================
// 【バックアップ機能】Firestore → スプレッドシート バックアップ
// ========================================
// 毎日定時トリガーで Firestore の主要コレクションをスプレッドシートに書き出す。
// 対象: students（生徒一覧）/ grades（成績データ）/ lectureEntries（講習日程）
// スプレッドシートはルートフォルダ直下の「Firestoreバックアップ.gs」に保存する。

/**
 * バックアップ用スプレッドシートを取得または作成する内部ヘルパー
 * ルートフォルダ直下に「Firestoreバックアップ」という名前で作成する
 * @return {Spreadsheet|null}
 */
function getOrCreateBackupSpreadsheet_() {
  try {
    var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!rootFolderId) return null;
    var rootFolder = DriveApp.getFolderById(rootFolderId);

    // 既存ファイルを検索
    var iter = rootFolder.getFilesByName('Firestoreバックアップ');
    if (iter.hasNext()) {
      return SpreadsheetApp.openById(iter.next().getId());
    }

    // 新規作成
    var ss = SpreadsheetApp.create('Firestoreバックアップ');
    DriveApp.getFileById(ss.getId()).moveTo(rootFolder);
    Logger.log('✓ バックアップスプレッドシートを新規作成しました');
    return ss;
  } catch (e) {
    Logger.log('❌ getOrCreateBackupSpreadsheet_エラー: ' + e);
    return null;
  }
}

/**
 * 指定シートを取得し、既存データをすべてクリアしてヘッダーを設定する内部ヘルパー
 * @param {Spreadsheet} ss スプレッドシート
 * @param {string} sheetName シート名
 * @param {Array} headers ヘッダー行の配列
 * @return {Sheet|null}
 */
function prepareBackupSheet_(ss, sheetName, headers) {
  try {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clearContents();
    }
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#43e97b')
      .setFontColor('white');
    sheet.setFrozenRows(1);
    return sheet;
  } catch (e) {
    Logger.log('❌ prepareBackupSheet_エラー: ' + e);
    return null;
  }
}

/**
 * Firestore の students コレクションをスプレッドシートにバックアップする内部ヘルパー
 * @param {Spreadsheet} ss バックアップ先スプレッドシート
 * @return {number} 書き込んだ件数
 */
function backupStudents_(ss) {
  var headers = [
    '生徒ID', '校舎CD', '姓', '名', '姓ふりがな', '名ふりがな',
    '学校名', '削除済み', '登録日時', '登録年度', '登録学年CD',
    '受験校1', '受験校1学科', '受験校1合否', '育成型推薦',
    '受験校2', '受験校2学科', '受験校2合否'
  ];
  var sheet = prepareBackupSheet_(ss, '生徒一覧', headers);
  if (!sheet) return 0;

  var rawDocs = supabaseSelect_('students', '');
  if (!rawDocs || rawDocs.length === 0) return 0;
  var docs = rawDocs.map(toStudentCamel_);

  var rows = docs.map(function(doc) {
    var sid = String(doc.studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    return [
      sid,
      String(doc.campus       || '').padStart(2, '0'),
      String(doc.sei          || ''),
      String(doc.mei          || ''),
      String(doc.seiFurigana  || ''),
      String(doc.meiFurigana  || ''),
      String(doc.schoolName   || ''),
      doc.isDeleted ? 'true' : 'false',
      String(doc.createdAt    || ''),
      String(doc.registrationYear  || ''),
      String(doc.registrationGrade || ''),
      String(doc.jukoukou1        || ''),
      String(doc.jukoukou1_gakka  || ''),
      String(doc.jukoukou1_gokaku || ''),
      String(doc.ikusei           || ''),
      String(doc.jukoukou2        || ''),
      String(doc.jukoukou2_gakka  || ''),
      String(doc.jukoukou2_gokaku || '')
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    // 生徒ID列・校舎CD列をテキスト形式に設定（先頭ゼロの消失防止）
    sheet.getRange('A:A').setNumberFormat('@');
    sheet.getRange('B:B').setNumberFormat('@');
  }
  return rows.length;
}

/**
 * Firestore の grades コレクションをスプレッドシートにバックアップする内部ヘルパー
 * @param {Spreadsheet} ss バックアップ先スプレッドシート
 * @return {number} 書き込んだ件数
 */
function backupGrades_(ss) {
  var headers = [
    '生徒ID', 'テスト名', '年度',
    '国語', '社会', '数学', '理科', '英語', '合計', '平均',
    '志望1', '志望1学科', '志望2', '志望2学科',
    '記録日時', '氏名'
  ];
  var sheet = prepareBackupSheet_(ss, '成績データ', headers);
  if (!sheet) return 0;

  // Supabase から全成績データを取得
  var docs = supabaseSelect_('grades', null, { order: 'fiscal_year.desc,student_id.asc' });
  if (!docs || docs.length === 0) return 0;

  var rows = docs.map(function(doc) {
    var sid = String(doc.student_id || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    return [
      sid,
      String(doc.test_name    || ''),
      String(doc.fiscal_year  || ''),
      doc.kokugo  !== null && doc.kokugo  !== undefined ? doc.kokugo  : '',
      doc.shakai  !== null && doc.shakai  !== undefined ? doc.shakai  : '',
      doc.sugaku  !== null && doc.sugaku  !== undefined ? doc.sugaku  : '',
      doc.rika    !== null && doc.rika    !== undefined ? doc.rika    : '',
      doc.eigo    !== null && doc.eigo    !== undefined ? doc.eigo    : '',
      doc.total   !== null && doc.total   !== undefined ? doc.total   : '',
      doc.average !== null && doc.average !== undefined ? doc.average : '',
      String(doc.shogaku1       || ''),
      String(doc.shogaku1_gakka || ''),
      String(doc.shogaku2       || ''),
      String(doc.shogaku2_gakka || ''),
      String(doc.recorded_at     || ''),
      String(doc.student_name    || '')
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange('A:A').setNumberFormat('@');
  }
  return rows.length;
}

/**
 * Firestore の lectureEntries コレクションをスプレッドシートにバックアップする内部ヘルパー
 * @param {Spreadsheet} ss バックアップ先スプレッドシート
 * @return {number} 書き込んだ件数
 */
function backupLectureEntries_(ss) {
  var headers = [
    'エントリID', '講習ID', '校舎CD', '日付', '開始時刻', 'コマ数',
    '教科', '学年', '担当講師名', '担当講師メール', 'クラスラベル', '講師ID'
  ];
  var sheet = prepareBackupSheet_(ss, '講習日程', headers);
  if (!sheet) return 0;

  var docs = firestoreQuery_('lectureEntries', []);
  if (!docs || docs.length === 0) return 0;

  var rows = docs.map(function(doc) {
    return [
      String(doc.entryId      || doc._id  || ''),
      String(doc.lectureId    || ''),
      String(doc.campusCode   || '').padStart(2, '0'),
      String(doc.date         || ''),
      String(doc.startTime    || ''),
      doc.durationSlots !== null && doc.durationSlots !== undefined ? doc.durationSlots : '',
      String(doc.subject      || ''),
      String(doc.grade        || ''),
      String(doc.teacherName  || ''),
      String(doc.teacherEmail || ''),
      String(doc.classLabel   || ''),
      String(doc.teacherId    || '')
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.getRange('C:C').setNumberFormat('@'); // 校舎CD
  }
  return rows.length;
}

/**
 * Firestore の主要3コレクションをスプレッドシートにバックアップする
 * 毎日定時トリガーから呼ばれる（scheduledInitializeSheets内）
 * @return {Object} { success, message, counts }
 */
function runFirestoreBackup() {
  try {
    var ss = getOrCreateBackupSpreadsheet_();
    if (!ss) {
      return { success: false, error: 'APP_FOLDER_IDが未設定またはフォルダにアクセスできません' };
    }

    var counts = {};
    counts.students       = backupStudents_(ss);
    counts.grades         = backupGrades_(ss);
    counts.lectureEntries = backupLectureEntries_(ss);

    // 最終バックアップ日時をシートのタイトル行に記録
    try {
      var summarySheet = ss.getSheetByName('バックアップ情報');
      if (!summarySheet) summarySheet = ss.insertSheet('バックアップ情報');
      summarySheet.clearContents();
      summarySheet.appendRow(['最終バックアップ日時', new Date().toLocaleString('ja-JP')]);
      summarySheet.appendRow(['生徒一覧', counts.students + '件']);
      summarySheet.appendRow(['成績データ', counts.grades + '件']);
      summarySheet.appendRow(['講習日程', counts.lectureEntries + '件']);
      summarySheet.getRange('A:A').setFontWeight('bold');
    } catch (e) { /* サマリー記録失敗は無視 */ }

    var msg = 'バックアップ完了：生徒' + counts.students + '件、成績' + counts.grades + '件、講習日程' + counts.lectureEntries + '件';
    Logger.log('✓ ' + msg);
    recordOperationLog('Firestoreバックアップ', msg, '成功');
    return { success: true, message: msg, counts: counts };

  } catch (error) {
    Logger.log('❌ runFirestoreBackupエラー: ' + error);
    recordOperationLog('Firestoreバックアップ', error.toString(), '失敗');
    return { success: false, error: error.toString() };
  }
}

/**
 * バックアップ用の独立トリガーを設定する（非推奨）
 * scheduledInitializeSheets に統合済みのため通常は不要。
 * getAllTriggerStatuses() が存在チェックするため関数は残す。
 * @return {Object} { success, message, error }
 */
function setupBackupTrigger() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };

    // 既存の同名トリガーを削除（重複防止）
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'runFirestoreBackup') {
        ScriptApp.deleteTrigger(t);
      }
    });

    ScriptApp.newTrigger('runFirestoreBackup')
      .timeBased()
      .everyDays(1)
      .atHour(3)
      .create();

    Logger.log('✓ バックアップトリガーを設定しました（毎日午前3時）');
    return { success: true, message: 'バックアップトリガーを設定しました（毎日午前3時に自動実行）' };
  } catch (error) {
    Logger.log('❌ setupBackupTriggerエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * バックアップ用のトリガーを削除する（Admin のみ）
 * @return {Object} { success, message, error }
 */
function deleteBackupTrigger() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };

    var triggers = ScriptApp.getProjectTriggers();
    var deleted = 0;
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'runFirestoreBackup') {
        ScriptApp.deleteTrigger(t);
        deleted++;
      }
    });

    var msg = deleted > 0 ? 'バックアップトリガーを削除しました' : 'バックアップトリガーは設定されていません';
    return { success: true, message: msg };
  } catch (error) {
    Logger.log('❌ deleteBackupTriggerエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * バックアップトリガーの稼働状態を確認する（Admin のみ）
 * @return {Object} { success, active, nextRun }
 */
function getBackupTriggerStatus() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };

    var triggers = ScriptApp.getProjectTriggers();
    var backupTrigger = null;
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'runFirestoreBackup') {
        backupTrigger = t;
      }
    });

    return {
      success: true,
      active: backupTrigger !== null,
      message: backupTrigger ? '毎日午前3時に自動バックアップが設定されています' : '自動バックアップは設定されていません'
    };
  } catch (error) {
    Logger.log('❌ getBackupTriggerStatusエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}
