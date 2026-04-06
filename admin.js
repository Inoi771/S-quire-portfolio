
// ========================================
// 【セクション10】Admin 専用 API
// ========================================
// スクリプトプロパティ管理、ファイル操作（Admin のみ）

/**
 * すべてのスクリプトプロパティを取得（Admin のみ）
 * 「管理」タブの「設定」で表示するデータ
 * APIキーなどはマスク処理
 * @return {Object} { success, properties, error }
 */
function getAllScriptPropertiesForGUI() {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }

    // Firestore 移行済みで不要になった廃止キー → 存在すれば自動削除
    var DEPRECATED_KEYS = [
      'TEACHER_ID_MAP',
      'LINE_USER_MAPPING',
      'NOTIFICATION_METHODS',
      'NOTIFICATION_EMAILS',
      'LINE_SCHEDULER_NOTIF_PREFS',
      'CAMPUS_NOTIFICATION_ROUTING',
      'GRADES_GRADE_CODES_CONFIG'   // 定義のみで未使用
    ];
    var scriptProps = PropertiesService.getScriptProperties();
    DEPRECATED_KEYS.forEach(function(k) {
      try { scriptProps.deleteProperty(k); } catch(e) {}
    });
    // GEMINI_TEAM_* はチーム全体使用量追跡の廃止機能 → プレフィックスで一括削除
    var allPropsForCleanup = scriptProps.getProperties();
    Object.keys(allPropsForCleanup).forEach(function(k) {
      if (k.indexOf('GEMINI_TEAM_') === 0) {
        try { scriptProps.deleteProperty(k); } catch(e) {}
      }
    });

    var props = getAllProperties();
    var safProps = [];

    for (var key in props) {
      // 廃止キー・内部自動管理キーは表示しない
      if (DEPRECATED_KEYS.indexOf(key) !== -1) continue;
      if (key === 'HOLIDAY_CACHE') continue;           // 祝日キャッシュ（自動更新・編集不要）
      if (key.indexOf('_UP_') === 0) continue;        // ユーザー個別データ（内部管理）
      if (key.indexOf('GEMINI_TEAM_') === 0) continue; // 廃止済み（上で削除済みのため通常到達しない）

      var value = props[key];
      var displayValue = value;
      var isMasked = false;

      // API キーなどはマスク
      if (key.indexOf('KEY') !== -1 || key.indexOf('SECRET') !== -1 || key.indexOf('PASSWORD') !== -1) {
        displayValue = '***マスク済み***';
        isMasked = true;
      }

      // 長い値は省略
      if (displayValue.length > 50) {
        displayValue = displayValue.substring(0, 47) + '...';
      }

      safProps.push({
        key: key,
        value: displayValue,
        isMasked: isMasked,
        actualLength: value.length
      });
    }

    return { success: true, properties: safProps };

  } catch (error) {
    Logger.log('❌ getAllScriptPropertiesForGUIエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Admin 操作をログに記録
 * @param {string} action Admin が実行したアクション
 * @param {Object} details 詳細情報
 */
function logAdminAction(action, details) {
  try {
    var userEmail = getCurrentUserEmail();
    var timestamp = new Date().toISOString();
    
    // スプレッドシートに記録
    recordOperationLog(action, details, '成功');
    
  } catch (error) {
    Logger.log('❌ logAdminActionエラー: ' + error);
  }
}

/**
 * スクリプトプロパティを更新（GUI経由）
 * @param {string} key プロパティキー
 * @param {string} newValue 新しい値
 * @return {Object} { success, message, error }
 */
function updateScriptPropertyFromGUI(key, newValue) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    var oldValue = getProperty(key);
    setProperty(key, newValue);
    
    logAdminAction('updateScriptProperty', {
      key: key,
      oldValueLength: oldValue ? oldValue.length : 0,
      newValueLength: newValue.length
    });
    
    return { success: true, message: 'プロパティを更新しました' };
    
  } catch (error) {
    Logger.log('❌ updateScriptPropertyFromGUIエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * スクリプトプロパティを削除（GUI経由）
 * @param {string} key 削除するプロパティキー
 * @return {Object} { success, message, error }
 */
function deleteScriptPropertyFromGUI(key) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    PropertiesService.getScriptProperties().deleteProperty(key);
    
    logAdminAction('deleteScriptProperty', { key: key });
    
    return { success: true, message: 'プロパティを削除しました' };
    
  } catch (error) {
    Logger.log('❌ deleteScriptPropertyFromGUIエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Google Drive フォルダ内を探索（Admin のみ）
 * @param {string} folderId フォルダID（未指定ならルート）
 * @return {Object} { success, folders, files, folderName, folderId, error }
 */
function getDriveContents(folderId) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    if (!folderId) {
      folderId = DriveApp.getRootFolder().getId();
    }
    
    var folder = DriveApp.getFolderById(folderId);
    var contents = {
      folders: [],
      files: [],
      folderName: folder.getName(),
      folderId: folderId
    };
    
    // サブフォルダを取得
    var subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      var subFolder = subFolders.next();
      contents.folders.push({
        name: subFolder.getName(),
        id: subFolder.getId(),
        type: 'folder'
      });
    }
    
    // ファイルを取得
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      contents.files.push({
        name: file.getName(),
        id: file.getId(),
        type: file.getMimeType(),
        size: file.getSize(),
        modifiedDate: file.getLastUpdated().toISOString(),
        url: file.getUrl()
      });
    }
    
    Logger.log('✓ getDriveContents: ' + contents.folders.length + ' フォルダ, ' + contents.files.length + ' ファイルを取得');

    return { success: true, folders: contents.folders, files: contents.files, folderName: contents.folderName, folderId: contents.folderId };
    
  } catch (error) {
    Logger.log('❌ getDriveContentsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * PDF を Google Drive にアップロード（Admin のみ）
 * @param {string} pdfBase64 Base64 エンコードされた PDF
 * @param {string} fileName ファイル名
 * @param {string} targetFolderId アップロード先フォルダID
 * @return {Object} { success, message, fileId, fileName, url, error }
 */
function uploadPDFToFolder(pdfBase64, fileName, targetFolderId) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    if (!targetFolderId) {
      targetFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID) || DriveApp.getRootFolder().getId();
    }
    
    var folder = DriveApp.getFolderById(targetFolderId);
    
    // Base64 をデコード
    var decodedBytes = Utilities.newBlob(Utilities.base64Decode(pdfBase64), 'application/pdf').getBytes();
    var blob = Utilities.newBlob(decodedBytes, 'application/pdf', fileName);
    
    var file = folder.createFile(blob);
    
    logAdminAction('uploadPDFToFolder', {
      fileName: fileName,
      folderId: targetFolderId,
      fileId: file.getId()
    });
    
    
    return { 
      success: true, 
      message: 'ファイルをアップロードしました',
      fileId: file.getId(),
      fileName: file.getName(),
      url: file.getUrl()
    };
    
  } catch (error) {
    Logger.log('❌ uploadPDFToFolderエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Google Drive のファイルを削除（ゴミ箱へ）（Admin のみ）
 * @param {string} fileId 削除するファイルID
 * @return {Object} { success, message, error }
 */
function deleteFileFromDrive(fileId) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    var file = DriveApp.getFileById(fileId);
    var fileName = file.getName();
    
    file.setTrashed(true);
    
    logAdminAction('deleteFileFromDrive', {
      fileId: fileId,
      fileName: fileName
    });
    
    return { success: true, message: 'ファイルを削除しました' };
    
  } catch (error) {
    Logger.log('❌ deleteFileFromDriveエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【セクション11】フォルダ・シート自動初期化
// ========================================
// 初回起動時の自動初期化、フォルダ・シート作成

/**
 * アプリケーション全体の初期化処理
 * doGet() から自動呼び出し
 * - 月間スケジュール、成績管理、講習管理フォルダを作成
 * - 各タブに年度別フォルダを作成
 * @return {Object} { success, message, error }
 */
function initializeAllSheets() {
  try {
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return { success: false, error: 'フォルダIDが未設定' };
    }
    
    var rootFolder = DriveApp.getFolderById(appFolderId);
    
    
    // Firestore移行済み。スプレッドシートフォルダの作成は不要。
    // assets フォルダのみ確保（ロゴ・ファビコン・プロフィール写真・チラシ用画像に使用）
    getOrCreateTabFolder(rootFolder, 'assets');

    return { success: true, message: '初期化が完了しました（Firestore移行済み）' };
    
  } catch (error) {
    Logger.log('❌ initializeAllSheetsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * タブフォルダを取得または作成
 * @param {Folder} parentFolder 親フォルダ
 * @param {string} folderName 作成するフォルダ名
 * @return {Folder} タブフォルダ
 */
function getOrCreateTabFolder(parentFolder, folderName) {
  try {
    var folders = parentFolder.getFoldersByName(folderName);
    
    if (folders.hasNext()) {
      return folders.next();
    } else {
      return parentFolder.createFolder(folderName);
    }
  } catch (error) {
    Logger.log('❌ getOrCreateTabFolderエラー: ' + error);
    return null;
  }
}

/**
 * 月間スケジュールフォルダの初期化
 * 今年度のフォルダを作成。1〜3月はカレンダー年≠年度のため次年度フォルダも作成。
 * 例: 4〜12月 → 今年度のみ / 1〜3月 → 今年度＋次年度（新年度の準備）
 * @param {Folder} scheduleFolder 月間スケジュールフォルダ
 */
function initializeScheduleFolder(scheduleFolder) {
  try {

    var fiscalYear = getCurrentFiscalYear();
    var calendarYear = new Date().getFullYear();

    // 今年度フォルダを作成
    var yearFolder = getOrCreateYearFolder(scheduleFolder, String(fiscalYear));
    getOrCreateSpreadsheet(yearFolder, fiscalYear);

    // 1〜3月（年度とカレンダー年がずれる期間）は次年度フォルダも作成
    if (calendarYear !== fiscalYear) {
      var nextYearFolder = getOrCreateYearFolder(scheduleFolder, String(calendarYear));
      getOrCreateSpreadsheet(nextYearFolder, calendarYear);
    }

  } catch (error) {
    Logger.log('❌ initializeScheduleFolderエラー: ' + error);
  }
}

/**
 * 成績管理フォルダの初期化
 * 今年度のフォルダを作成。1〜3月はカレンダー年≠年度のため次年度フォルダも作成。
 * 例: 4〜12月 → 今年度のみ / 1〜3月 → 今年度＋次年度（新年度の準備）
 * @param {Folder} gradesFolder 成績管理フォルダ
 */
function initializeGradesFolder(gradesFolder) {
  try {

    var fiscalYear = getCurrentFiscalYear();
    var calendarYear = new Date().getFullYear();

    // 今年度フォルダを作成（生徒マスタはアプリフォルダ直下の単一ファイルで管理）
    var yearFolder = getOrCreateYearFolder(gradesFolder, String(fiscalYear));
    createGradeDataSheet(yearFolder, fiscalYear);

    // 1〜3月（年度とカレンダー年がずれる期間）は次年度フォルダも作成
    if (calendarYear !== fiscalYear) {
      var nextYearFolder = getOrCreateYearFolder(gradesFolder, String(calendarYear));
      createGradeDataSheet(nextYearFolder, calendarYear);
    }

  } catch (error) {
    Logger.log('❌ initializeGradesFolderエラー: ' + error);
  }
}

/**
 * 講習管理フォルダの初期化
 * 今年度のフォルダを作成。1〜3月はカレンダー年≠年度のため次年度フォルダも作成。
 * 例: 4〜12月 → 今年度のみ / 1〜3月 → 今年度＋次年度（新年度の準備）
 * @param {Folder} lecturesFolder 講習管理フォルダ
 */
function initializeLecturesFolder(lecturesFolder) {
  try {

    var fiscalYear = getCurrentFiscalYear();
    var calendarYear = new Date().getFullYear();

    // 今年度フォルダを作成
    var yearFolder = getOrCreateYearFolder(lecturesFolder, String(fiscalYear));
    createLectureSheet(yearFolder, fiscalYear);

    // 1〜3月（年度とカレンダー年がずれる期間）は次年度フォルダも作成
    if (calendarYear !== fiscalYear) {
      var nextYearFolder = getOrCreateYearFolder(lecturesFolder, String(calendarYear));
      createLectureSheet(nextYearFolder, calendarYear);
    }

  } catch (error) {
    Logger.log('❌ initializeLecturesFolderエラー: ' + error);
  }
}

/**
 * 高校別進学先フォルダの初期化
 * 今年度のフォルダを作成。1〜3月はカレンダー年≠年度のため次年度フォルダも作成。
 * 例: 4〜12月 → 今年度のみ / 1〜3月 → 今年度＋次年度（新年度の準備）
 * @param {Folder} universitiesFolder 高校別進学先フォルダ
 */
function initializeUniversitiesFolder(universitiesFolder) {
  try {

    var fiscalYear = getCurrentFiscalYear();
    var calendarYear = new Date().getFullYear();

    // 今年度フォルダを作成
    var yearFolder = getOrCreateYearFolder(universitiesFolder, String(fiscalYear));
    createUniversitySheet(yearFolder, fiscalYear);

    // 1〜3月（年度とカレンダー年がずれる期間）は次年度フォルダも作成
    if (calendarYear !== fiscalYear) {
      var nextYearFolder = getOrCreateYearFolder(universitiesFolder, String(calendarYear));
      createUniversitySheet(nextYearFolder, calendarYear);
    }

  } catch (error) {
    Logger.log('❌ initializeUniversitiesFolderエラー: ' + error);
  }
}

/**
 * 設定フォルダの初期化
 * @param {Folder} settingsFolder 設定フォルダ
 */
function initializeSettingsFolder(settingsFolder) {
  try {
    
    // システム設定シート
    createSystemSettingsSheet(settingsFolder);
    
  } catch (error) {
    Logger.log('❌ initializeSettingsFolderエラー: ' + error);
  }
}

/**
 * 年度フォルダを取得または作成
 * @param {Folder} parentFolder 親フォルダ
 * @param {string} year 年度（4桁の数字）
 * @return {Folder} 年度フォルダ
 */
function getOrCreateYearFolder(parentFolder, year) {
  try {
    var yearFolderName = String(year);
    var folders = parentFolder.getFoldersByName(yearFolderName);
    
    if (folders.hasNext()) {
      return folders.next();
    } else {
      return parentFolder.createFolder(yearFolderName);
    }
  } catch (error) {
    Logger.log('❌ getOrCreateYearFolderエラー: ' + error);
    return null;
  }
}

/**
 * 予定データシートを取得または作成
 * @param {Folder} yearFolder 年度フォルダ
 * @param {number} year 年度
 * @return {Spreadsheet} スプレッドシート
 */
function getOrCreateSpreadsheet(yearFolder, year) {
  try {
    var sheetName = year + '年度_予定データ';
    var file = getFileByName(yearFolder, sheetName);
    
    if (file) {
      return SpreadsheetApp.openById(file.getId());
    } else {
      var ss = SpreadsheetApp.create(sheetName);
      var createdFile = DriveApp.getFileById(ss.getId());
      
      createdFile.moveTo(yearFolder);
      
      var sheet = ss.getSheets()[0];
      sheet.setName('予定一覧');
      sheet.appendRow(['更新日時', '学校名', '予定種類', '月日', '詳細', '情報源']);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#43e97b').setFontColor('white');
      
      // 列幅設定
      sheet.setColumnWidth(1, 150);  // 更新日時
      sheet.setColumnWidth(2, 100);  // 学校名
      sheet.setColumnWidth(3, 100);  // 予定種類
      sheet.setColumnWidth(4, 80);   // 月日
      sheet.setColumnWidth(5, 150);  // 詳細
      sheet.setColumnWidth(6, 200);  // 情報源
      
      return ss;
    }
  } catch (error) {
    Logger.log('❌ getOrCreateSpreadsheetエラー: ' + error);
    return null;
  }
}


/**
 * 成績データシート作成
 * @param {Folder} yearFolder 年度フォルダ
 * @param {number} year 年度
 */
function createGradeDataSheet(yearFolder, year) {
  try {
    var sheetName = year + '年度_成績データ';
    var files = yearFolder.getFilesByName(sheetName);
    
    if (files.hasNext()) {
      return;
    }
    
    var ss = SpreadsheetApp.create(sheetName);
    var file = DriveApp.getFileById(ss.getId());
    file.moveTo(yearFolder);
    
    var sheet = ss.getSheets()[0];
    sheet.setName('成績一覧');

    // 生徒IDをテキスト形式に設定（先頭ゼロがSheetsで数値変換されないように）
    sheet.getRange('A:A').setNumberFormat('@');

    var headers = ['生徒ID', 'テスト名', '国語', '社会', '数学', '理科', '英語', '合計', '平均', '志望1', '志望1学科', '志望2', '志望2学科', '記録日時', '氏名'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#667eea').setFontColor('white');

    // 列幅設定
    sheet.setColumnWidth(1, 120);  // 生徒ID
    sheet.setColumnWidth(2, 100);  // テスト名
    sheet.setColumnWidth(3, 60);   // 国語
    sheet.setColumnWidth(4, 60);   // 社会
    sheet.setColumnWidth(5, 60);   // 数学
    sheet.setColumnWidth(6, 60);   // 理科
    sheet.setColumnWidth(7, 60);   // 英語
    sheet.setColumnWidth(8, 60);   // 合計
    sheet.setColumnWidth(9, 60);   // 平均
    sheet.setColumnWidth(10, 100); // 志望1
    sheet.setColumnWidth(11, 80);  // 志望1学科
    sheet.setColumnWidth(12, 100); // 志望2
    sheet.setColumnWidth(13, 80);  // 志望2学科
    sheet.setColumnWidth(14, 150); // 記録日時
    
  } catch (error) {
    Logger.log('❌ createGradeDataSheetエラー: ' + error);
  }
}

/**
 * 講習管理シート作成（プレースホルダー）
 * @param {Folder} yearFolder 年度フォルダ
 * @param {number} year 年度
 */
function createLectureSheet(yearFolder, year) {
  try {
    var sheetName = year + '年度_講習管理';
    var files = yearFolder.getFilesByName(sheetName);
    
    if (files.hasNext()) {
      return;
    }
    
    var ss = SpreadsheetApp.create(sheetName);
    var file = DriveApp.getFileById(ss.getId());
    file.moveTo(yearFolder);
    
    var sheet = ss.getSheets()[0];
    sheet.setName('講習一覧');
    
    var headers = ['講習ID', '講習名', '開始日', '終了日', '対象学年', '講師', '受講者数', 'ステータス'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f093fb').setFontColor('white');
    
  } catch (error) {
    Logger.log('❌ createLectureSheetエラー: ' + error);
  }
}

/**
 * 高校別進学先シート作成（プレースホルダー）
 * @param {Folder} yearFolder 年度フォルダ
 * @param {number} year 年度
 */
function createUniversitySheet(yearFolder, year) {
  try {
    var sheetName = year + '年度_高校別進学先';
    var files = yearFolder.getFilesByName(sheetName);
    
    if (files.hasNext()) {
      return;
    }
    
    var ss = SpreadsheetApp.create(sheetName);
    var file = DriveApp.getFileById(ss.getId());
    file.moveTo(yearFolder);
    
    var sheet = ss.getSheets()[0];
    sheet.setName('進学先一覧');
    
    var headers = ['高校名', '合格者数', '進学者数', '進学率%', '偏差値', 'エリア'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#38f9d7').setFontColor('white');
    
  } catch (error) {
    Logger.log('❌ createUniversitySheetエラー: ' + error);
  }
}

/**
 * システム設定シート作成
 * @param {Folder} settingsFolder 設定フォルダ
 */
function createSystemSettingsSheet(settingsFolder) {
  try {
    var sheetName = 'システム設定';
    var files = settingsFolder.getFilesByName(sheetName);
    
    if (files.hasNext()) {
      return;
    }
    
    var ss = SpreadsheetApp.create(sheetName);
    var file = DriveApp.getFileById(ss.getId());
    file.moveTo(settingsFolder);
    
    // Sheet1: 操作ログ
    var sheet1 = ss.getSheets()[0];
    sheet1.setName('操作ログ');
    
    var headers1 = ['日時', 'ユーザー', 'ロール', '操作', '詳細', 'ステータス'];
    sheet1.appendRow(headers1);
    sheet1.getRange(1, 1, 1, headers1.length).setFontWeight('bold').setBackground('#ff6b6b').setFontColor('white');
    
    // Sheet2: システム情報
    var sheet2 = ss.insertSheet('システム情報');
    sheet2.appendRow(['項目', '値']);
    sheet2.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#ff6b6b').setFontColor('white');
    
    sheet2.appendRow(['最終更新', new Date().toISOString()]);
    sheet2.appendRow(['バージョン', '1.0.0']);
    sheet2.appendRow(['作成者', 'Admin']);
    
  } catch (error) {
    Logger.log('❌ createSystemSettingsSheetエラー: ' + error);
  }
}

// ========================================
// 【セクション12】ユーティリティ関数
// ========================================
// 日付処理、ログ記録、エラーハンドリング

/**
 * 志望校マッチング用のルックアップテーブルを構築する
 * schoolConfig（[{name, departments}]）から正式名称と略称のマッピングを生成
 * @param {Array} schoolConfig 志望校設定配列 [{name: "鳴門渦潮高校", departments: ["普通科", "体育科"]}, ...]
 * @return {Object} { schools: [{name, departments, keywords}], nameMap: {略称→正式名称} }
 */
function buildSchoolLookup(schoolConfig) {
  if (!schoolConfig || schoolConfig.length === 0) {
    return { schools: [], nameMap: {} };
  }

  var nameMap = {};

  var schools = schoolConfig.map(function(s) {
    var name = String(s.name || '').trim();
    var depts = (s.departments || []).map(function(d) {
      return typeof d === 'string' ? d : (d.name || '');
    });

    // 正式名称そのものをマップに登録
    nameMap[name] = name;

    // 略称パターンを生成してマップに登録
    // 例: "鳴門渦潮高校" → "鳴門渦潮", "渦潮高校", "渦潮", "鳴門渦潮高等学校"
    var base = name;
    // 「高校」「高等学校」の除去/変換パターン
    if (base.indexOf('高校') >= 0) {
      var withoutKoukou = base.replace(/高校$/, '');
      nameMap[withoutKoukou] = name;
      nameMap[base.replace(/高校$/, '高等学校')] = name;
    }
    if (base.indexOf('高等学校') >= 0) {
      var withoutKoutou = base.replace(/高等学校$/, '');
      nameMap[withoutKoutou] = name;
      nameMap[base.replace(/高等学校$/, '高校')] = name;
    }
    // 「中学校」「中学」の変換パターン
    if (base.indexOf('中学校') >= 0) {
      nameMap[base.replace(/中学校$/, '')] = name;
      nameMap[base.replace(/中学校$/, '中学')] = name;
    }
    if (base.indexOf('中学') >= 0 && base.indexOf('中学校') < 0) {
      nameMap[base.replace(/中学$/, '')] = name;
    }

    return { name: name, departments: depts };
  });

  return { schools: schools, nameMap: nameMap };
}

/**
 * OCRで読み取った志望校名を設定データの正式名称にマッチングする
 * 完全一致 → 略称一致 → 部分一致（設定名を含む、または設定名の一部を含む）の優先順で照合
 * @param {string} ocrName OCRで読み取った志望校名（null/空なら空を返す）
 * @param {Object} schoolLookup buildSchoolLookup() の戻り値
 * @return {Object} { name: "正式名称または空", dept: "学科名または空" }
 */
function matchSchoolName(ocrName, schoolLookup) {
  var empty = { name: '', dept: '' };
  if (!ocrName || !schoolLookup || !schoolLookup.schools || schoolLookup.schools.length === 0) {
    return ocrName ? { name: String(ocrName).trim(), dept: '' } : empty;
  }

  var input = String(ocrName).trim();
  if (!input) return empty;

  // 1. nameMap で完全一致・略称一致を試みる
  if (schoolLookup.nameMap[input]) {
    var matchedName = schoolLookup.nameMap[input];
    return { name: matchedName, dept: getDefaultDept(matchedName, schoolLookup) };
  }

  // 2. 部分一致: 入力に設定名の一部（高校/中学を除いた核）が含まれるか、または設定名に入力が含まれるか
  var bestMatch = null;
  var bestScore = 0;

  schoolLookup.schools.forEach(function(school) {
    var sName = school.name;
    // 核となる部分（「高校」「高等学校」「中学校」「中学」を除去）
    var core = sName.replace(/高等学校$|高校$|中学校$|中学$/, '');

    // 入力がcoreを含む（例: "渦潮" が "鳴門渦潮" のcore に一致）
    if (core && input.indexOf(core) >= 0) {
      var score = core.length;
      if (score > bestScore) { bestScore = score; bestMatch = sName; }
    }
    // coreが入力を含む（例: "鳴門渦潮" が "渦潮" を含む）
    if (core && core.indexOf(input) >= 0) {
      var score2 = input.length;
      if (score2 > bestScore) { bestScore = score2; bestMatch = sName; }
    }
    // 入力が正式名称を含む
    if (input.indexOf(sName) >= 0) {
      var score3 = sName.length;
      if (score3 > bestScore) { bestScore = score3; bestMatch = sName; }
    }
  });

  if (bestMatch) {
    return { name: bestMatch, dept: getDefaultDept(bestMatch, schoolLookup) };
  }

  // 3. マッチなし → 元の名前をそのまま返す（その他扱い）
  return { name: input, dept: '' };
}

/**
 * 指定校のデフォルト学科を返す（学科が1つだけの場合にそれを返す）
 * @param {string} schoolName 正式校名
 * @param {Object} schoolLookup buildSchoolLookup() の戻り値
 * @return {string} 学科名（デフォルトなしなら空文字）
 */
function getDefaultDept(schoolName, schoolLookup) {
  for (var i = 0; i < schoolLookup.schools.length; i++) {
    if (schoolLookup.schools[i].name === schoolName) {
      var depts = schoolLookup.schools[i].departments;
      // 学科が1つだけなら自動選択
      if (depts && depts.length === 1) {
        return depts[0];
      }
      return '';
    }
  }
  return '';
}

/**
 * 操作ログを記録
 * ユーザーの操作や Admin アクション、システムログを記録
 * @param {string} action 操作内容（例: "addAdmin", "updateSchedule"）
 * @param {Object} details 詳細情報
 * @param {string} status ステータス（例: "成功", "失敗"）
 */
function recordOperationLog(action, details, status) {
  try {
    var now = new Date();
    var teacherId = getCurrentTeacherId_() || '';
    var userRole = isAdmin() ? '🔐 Admin' : '👤 User';
    // タイムスタンプ＋ランダム文字列でユニークなDocID生成
    var docId = 'log_' + now.getTime() + '_' + Math.random().toString(36).substring(2, 7);
    firestoreSet_('operationLogs', docId, {
      timestamp: now.toISOString(),
      userId: teacherId,
      userRole: userRole,
      action: action || '',
      details: JSON.stringify(details),
      status: status || '成功'
    });
  } catch (error) {
    Logger.log('❌ recordOperationLogエラー: ' + error);
  }
}

/**
 * 操作ログシートを取得または作成
 * @return {Spreadsheet|null} スプレッドシート
 */
function getOrCreateOperationLogSheet() {
  try {
    var settingsFolder = getSettingsFolder();
    if (!settingsFolder) {
      Logger.log('❌ 設定フォルダが見つかりません');
      return null;
    }
    
    var sheetName = 'システム設定';
    var file = getFileByName(settingsFolder, sheetName);
    
    if (file) {
      return SpreadsheetApp.openById(file.getId());
    } else {
      var ss = SpreadsheetApp.create(sheetName);
      var createdFile = DriveApp.getFileById(ss.getId());
      
      createdFile.moveTo(settingsFolder);
      
      // Sheet1: 操作ログ
      var sheet1 = ss.getSheets()[0];
      sheet1.setName('操作ログ');
      
      var headers1 = ['日時', 'ユーザー', 'ロール', '操作', '詳細', 'ステータス'];
      sheet1.appendRow(headers1);
      sheet1.getRange(1, 1, 1, headers1.length).setFontWeight('bold').setBackground('#ff6b6b').setFontColor('white');
      
      // Sheet2: システム情報
      var sheet2 = ss.insertSheet('システム情報');
      sheet2.appendRow(['項目', '値']);
      sheet2.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#ff6b6b').setFontColor('white');
      
      sheet2.appendRow(['最終更新', new Date().toISOString()]);
      sheet2.appendRow(['バージョン', '1.0.0']);
      sheet2.appendRow(['作成者', 'Admin']);
      
      return ss;
    }
  } catch (error) {
    Logger.log('❌ getOrCreateOperationLogSheetエラー: ' + error);
    return null;
  }
}

/**
 * 初期化ログを記録
 * @param {string} status 成功/失敗
 * @param {string} details 詳細
 */
function recordInitializationLog(status, details) {
  try {
    var now = new Date();
    var docId = 'log_' + now.getTime() + '_' + Math.random().toString(36).substring(2, 7);
    firestoreSet_('operationLogs', docId, {
      timestamp: now.toISOString(),
      userId: 'system',
      userRole: 'システム',
      action: '初期化',
      details: String(details || ''),
      status: status || '成功'
    });
  } catch (error) {
    Logger.log('❌ recordInitializationLogエラー: ' + error);
  }
}

/**
 * 初期化の実行状態を確認する関数
 * Admin タブから呼び出し可能
 * @return {Object} { success, status, message, folders, requiredAction, error }
 */
function checkInitializationStatus() {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      return {
        success: false,
        status: '未設定',
        message: 'APP_FOLDER_IDが設定されていません',
        requiredAction: 'フォルダIDを設定してください'
      };
    }
    
    try {
      var rootFolder = DriveApp.getFolderById(appFolderId);

      // Firestore移行済み。スプレッドシートフォルダの存在チェックは不要。
      // assets フォルダのみ確認（ロゴ・ファビコン・チラシ画像に使用）
      var assetsExists = getFolderByName(rootFolder, 'assets') !== null;

      return {
        success: true,
        status: '初期化完了（Firestore移行済み）',
        folders: { assets: assetsExists },
        message: 'データはFirestoreで管理されています' + (assetsExists ? '。assetsフォルダあり。' : '。assetsフォルダなし（手動初期化で作成されます）。'),
        requiredAction: assetsExists ? null : '手動初期化を実行してassetsフォルダを作成してください'
      };
    } catch (error) {
      return {
        success: false,
        status: '確認失敗',
        message: error.toString(),
        requiredAction: 'フォルダIDを確認してください'
      };
    }
    
  } catch (error) {
    Logger.log('❌ checkInitializationStatusエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ファイル名から学校情報を抽出
 * 「○○中学校」「○○高校」「塾」を検出
 * 
 * @param {string} fileName ファイル名
 * @return {Object|null} { school: "学校名", type: "中学" | "高校" | "塾" }
 */
function extractSchoolFromFileName(fileName) {
  try {
    // 「塾」を優先的に確認（「○○塾」などの紛らわしいケースを避ける）
    if (fileName.includes('塾')) {
      return { school: '塾', type: '塾' };
    }
    
    // 「高校」を確認
    var highSchoolMatch = fileName.match(/(.+?)高校/);
    if (highSchoolMatch) {
      return {
        school: highSchoolMatch[1] + '高校',
        type: '高校'
      };
    }
    
    // 「中学校」または「中学」を確認
    var middleSchoolMatch = fileName.match(/(.+?)(中学校|中学)/);
    if (middleSchoolMatch) {
      return {
        school: middleSchoolMatch[1] + middleSchoolMatch[2],
        type: '中学'
      };
    }
    
    return null;
    
  } catch (error) {
    Logger.log('❌ extractSchoolFromFileName エラー: ' + error);
    return null;
  }
}

/**
 * Gemini 用の予定抽出プロンプトを生成
 * @param {string} content 抽出対象テキスト
 * @param {Object} schoolInfo { school, type }
 * @param {number} year 年度
 */
function createExtractSchedulePrompt(content, schoolInfo, year) {
  var schoolLabel = '';
  if (schoolInfo.type === '塾') {
    schoolLabel = '塾';
  } else if (schoolInfo.type === '中学') {
    schoolLabel = '中学 ' + schoolInfo.school;
  } else if (schoolInfo.type === '高校') {
    schoolLabel = '高校 ' + schoolInfo.school;
  }

  var yearLabel = year ? year + '年度の' : '';

  var prompt = `あなたは学校や塾の年間予定表から、重要な予定情報を抽出するAIアシスタントです。

【対象】${yearLabel}${schoolLabel}

【タスク】
以下のテキスト/テーブルから、すべての予定（イベント）を抽出してください。
複雑な表形式でも、「これは予定では？」と思われるものはすべて抽出してください。

【テキスト内容】
${content}

【抽出方法】
1. 各予定のイベント名（例：定期テスト、夏期講習、修学旅行など）
2. 日程（例：6月10日、7月19日～8月31日など）
3. 詳細情報があれば（対象学年など）

【出力形式】
必ず、以下の形式で JSON 配列として返してください。
マークダウン記号やコード記号（\`\`\`）は使用しないでください。
純粋な JSON のみを返してください。

[
  {
    "eventName": "イベント名",
    "schedule": "日程",
    "details": "詳細情報"
  }
]

【重要】
- schedule は「月日形式」で記入（例：6月10日、7月19日～8月31日）
- 空配列 [] の場合でも必ず JSON を返す
- マークダウン記号なしで、純粋な JSON のみ
- 開始括弧 [ から終了括弧 ] までのみを返す`;

  return prompt;
}

/**
 * Gemini API を呼び出して予定を抽出
 */
function callGeminiForScheduleExtraction(prompt) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    
    if (!apiKey) {
      Logger.log('❌ Gemini API キーが設定されていません');
      return [];
    }
    
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    
    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000,  // 最適化：16000 → 4000（30件程度なら十分、トークン節約）
        thinkingConfig: { thinkingBudget: 0 }
      }
    };
    
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    var responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log('❌ Gemini API エラー ' + responseCode + ': ' + response.getContentText());
      return [];
    }
    
    var result = JSON.parse(response.getContentText());

    if (!result.candidates || !result.candidates[0]) {
      Logger.log('⚠ Gemini から応答がありません');
      return [];
    }

    var rawText = result.candidates[0].content.parts[0].text;

    // JSON を抽出（[ から最後の ] まで）
    var startIdx = rawText.indexOf('[');
    var lastIdx = rawText.lastIndexOf(']');
    
    if (startIdx === -1 || lastIdx === -1 || startIdx > lastIdx) {
      Logger.log('⚠ JSON 配列が見つかりません');
      return [];
    }
    
    var cleanedText = rawText.substring(startIdx, lastIdx + 1);
    
    try {
      var events = JSON.parse(cleanedText);
      
      if (!Array.isArray(events)) {
        Logger.log('⚠ 応答が配列ではありません');
        return [];
      }
      
      return events;
      
    } catch (parseError) {
      Logger.log('❌ JSON パースエラー: ' + parseError);
      return [];
    }
    
  } catch (error) {
    Logger.log('❌ callGeminiForScheduleExtraction エラー: ' + error);
    return [];
  }
}

/**
 * すべてのファイル形式から自動でスケジュールをインポート
 * ファイル名から学校を判定し、形式を自動判定
 * PDF・CSV・Google Sheets に対応
 * 
 * 【使用例】
 * - Admin タブの「スケジュール自動インポート」ボタンから呼び出し
 * - 時間トリガーで自動実行
 * 
 * ファイル名の例：
 *   - A中学校_年間予定.pdf → 中学、A中学校
 *   - B高校_スケジュール.xlsx → 高校、B高校
 *   - 塾_年間計画.csv → 塾
 * 
 * 【注意】
 * - 「年度_予定データ」という名前のファイルはスキップ（出力用）
 * - 同じフォルダ内に入力ファイルと出力シートが混在する場合、
 *   ファイル名で自動判定して出力用を除外する
 * 
 * @param {number} year 学年年度（例: 2025）
 * @return {Object} { success, totalCount, results, message }
 */
function autoImportAllSchedules(year) {
  try {
    
    var yearFolder = getOrCreateYearFolder(getScheduleFolder(), String(year));
    var allFiles = yearFolder.getFiles();
    
    var totalCount = 0;
    var results = [];
    
    while (allFiles.hasNext()) {
      var file = allFiles.next();
      var fileName = file.getName();
      var mimeType = file.getMimeType();
      
      
      // 0. 出力用ファイルをスキップ
      // 「2025年度_予定データ」などの出力用スプレッドシートを除外
      if (fileName.includes('予定データ')) {
        Logger.log('⚠ スキップ: 出力用スプレッドシート（' + fileName + '）');
        continue;
      }
      
      // 1. ファイル名から学校を判定
      var schoolInfo = extractSchoolFromFileName(fileName);
      
      if (!schoolInfo) {
        Logger.log('⚠ スキップ: 学校名が見つかりません');
        continue;
      }
      
      
      try {
        var result;
        
        // 2. ファイル形式を判定して処理
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          // Google Sheets
          result = importScheduleFromGoogleSheetsWithAI(
            file.getId(),
            schoolInfo,
            year
          );
        }
        else if (fileName.toLowerCase().endsWith('.csv')) {
          // CSV
          result = importScheduleFromCSVWithAI(
            file,
            schoolInfo,
            year
          );
        }
        else if (mimeType === MimeType.PDF) {
          // PDF
          result = importScheduleFromPDFWithAI(
            file,
            schoolInfo,
            year
          );
        }
        else if (fileName.toLowerCase().endsWith('.xlsx') || 
                 fileName.toLowerCase().endsWith('.xls')) {
          // Excel（対応外）
          Logger.log('⚠ Excel 形式は対応していません: ' + fileName);
          continue;
        }
        else {
          Logger.log('⚠ 未対応の形式: ' + mimeType);
          continue;
        }
        
        if (result && result.success) {
          totalCount += result.count;
          results.push({
            fileName: fileName,
            school: schoolInfo.school,
            type: schoolInfo.type,
            count: result.count
          });
        } else {
          Logger.log('  ❌ インポート失敗: ' + (result ? result.error : '不明なエラー'));
        }
        
      } catch (error) {
        Logger.log('  ❌ ファイル処理エラー: ' + error);
      }
    }
    
    
    recordInitializationLog('成功', 'autoImportAllSchedules: ' + totalCount + '件');
    
    return {
      success: true,
      totalCount: totalCount,
      results: results,
      message: 'スケジュール自動インポート完了: ' + totalCount + '件'
    };
    
  } catch (error) {
    Logger.log('❌ autoImportAllSchedules エラー: ' + error);
    recordInitializationLog('失敗', 'autoImportAllSchedules: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Gemini が返したイベントデータを正規化
 * - 年の重複除去（Gemini が "2025年6月10日" と返した場合に "6月10日" に統一）
 * - 範囲指定（"7月19日～8月31日"）の場合、最初の日付をスケジュール、範囲を詳細に移動
 * @param {Object} event { eventName, schedule, details }
 * @return {Object} { eventName, schedule, details }
 */
function normalizeScheduleEvent(event) {
  var schedule = String(event.schedule || '').trim();
  var details = String(event.details || '').trim();

  // Gemini が含めた可能性のある年（例: "2025年"）を除去
  schedule = schedule.replace(/\d{4}年/g, '');

  // 範囲指定の検出（～ 〜 ~ - など）
  var isRange = /[～〜~]/.test(schedule) ||
    (/\d{1,2}日/.test(schedule) && schedule.indexOf('月') !== schedule.lastIndexOf('月'));

  if (isRange) {
    var firstDateMatch = schedule.match(/(\d{1,2}月\d{1,2}日)/);
    if (firstDateMatch) {
      // 範囲全体を詳細欄に追記
      details = details ? details + '（' + schedule + '）' : schedule;
      schedule = firstDateMatch[1];
    }
  }

  return {
    eventName: event.eventName || '',
    schedule: schedule,
    details: details
  };
}

/**
 * Google Sheets から予定を抽出（学校情報付き）
 * @param {string} sheetId スプレッドシートID
 * @param {Object} schoolInfo { school, type }
 * @param {number} year 年度
 */
function importScheduleFromGoogleSheetsWithAI(sheetId, schoolInfo, year) {
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheets()[0];

    var data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();

    // テーブルを文字列化
    var tableText = '';
    for (var i = 0; i < data.length; i++) {
      tableText += data[i].join(',') + '\n';
    }

    var prompt = createExtractSchedulePrompt(tableText, schoolInfo, year);
    var events = callGeminiForScheduleExtraction(prompt);

    if (!events || events.length === 0) {
      return { success: false, error: '予定が抽出されませんでした' };
    }

    // Firestore にバッチ書き込み（コンテンツ由来 DocId で重複除去）
    var writes = [];
    events.forEach(function(event) {
      var normalized = normalizeScheduleEvent(event);
      saveScheduleEntryToFirestore_(year, schoolInfo.school, normalized.eventName,
        normalized.schedule, normalized.details, 'Google Sheets import', writes);
    });
    if (writes.length > 0) firestoreBatchWrite_(writes);

    return { success: true, count: events.length };

  } catch (error) {
    Logger.log('❌ importScheduleFromGoogleSheetsWithAI: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * CSV から予定を抽出（学校情報付き）
 * @param {File} file CSV ファイル
 * @param {Object} schoolInfo { school, type }
 * @param {number} year 年度
 */
function importScheduleFromCSVWithAI(file, schoolInfo, year) {
  try {
    var csv = file.getBlob().getDataAsString('UTF-8');
    var rows = Utilities.parseCsv(csv);

    // テーブルを文字列化
    var tableText = '';
    for (var i = 0; i < rows.length; i++) {
      tableText += rows[i].join(',') + '\n';
    }

    var prompt = createExtractSchedulePrompt(tableText, schoolInfo, year);
    var events = callGeminiForScheduleExtraction(prompt);

    if (!events || events.length === 0) {
      return { success: false, error: '予定が抽出されませんでした' };
    }

    // シートに書き込み（フォルダの年度に合わせて書き込み先を決定）
    // Firestore にバッチ書き込み（コンテンツ由来 DocId で重複除去）
    var writes = [];
    events.forEach(function(event) {
      var normalized = normalizeScheduleEvent(event);
      saveScheduleEntryToFirestore_(year, schoolInfo.school, normalized.eventName,
        normalized.schedule, normalized.details, 'CSV import', writes);
    });
    if (writes.length > 0) firestoreBatchWrite_(writes);

    return { success: true, count: events.length };

  } catch (error) {
    Logger.log('❌ importScheduleFromCSVWithAI: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * PDF から予定を抽出（学校情報付き）
 * @param {File} file PDF ファイル
 * @param {Object} schoolInfo { school, type }
 * @param {number} year 年度
 */
function importScheduleFromPDFWithAI(file, schoolInfo, year) {
  try {
    var pdfText = extractTextFromPDF(file);

    if (!pdfText || pdfText.length === 0) {
      return { success: false, error: 'PDF からテキストを抽出できません' };
    }

    var prompt = createExtractSchedulePrompt(pdfText, schoolInfo, year);
    var events = callGeminiForScheduleExtraction(prompt);

    if (!events || events.length === 0) {
      return { success: false, error: '予定が抽出されませんでした' };
    }

    // Firestore にバッチ書き込み（コンテンツ由来 DocId で重複除去）
    var writes = [];
    events.forEach(function(event) {
      var normalized = normalizeScheduleEvent(event);
      saveScheduleEntryToFirestore_(year, schoolInfo.school, normalized.eventName,
        normalized.schedule, normalized.details, 'PDF import', writes);
    });
    if (writes.length > 0) firestoreBatchWrite_(writes);

    return { success: true, count: events.length };

  } catch (error) {
    Logger.log('❌ importScheduleFromPDFWithAI: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 時間トリガー用の初期化関数
 * Google Apps Script の「トリガー」設定から 24時間ごとに実行
 * 
 * 【セットアップ方法】
 * 1. Google Apps Script エディタを開く
 * 2. 左側の「トリガー」（⏰）をクリック
 * 3. 「トリガーを作成」をクリック
 * 4. 以下の設定で作成：
 *    - 実行する関数: scheduledInitializeSheets
 *    - イベントのソース: 時間主動型
 *    - 時間ベースのトリガーのタイプ: 日付ベース（毎日）
 *    - 実行時間: 午前 2時（深夜の低トラフィック時が推奨）
 * 
 * @return {Object} { success, message, executedAt }
 */
function scheduledInitializeSheets() {
  try {
    
    // フォルダ・シート初期化を実行
    var result = initializeAllSheets();

    // 祝日キャッシュを更新（Googleカレンダーから取得してスクリプトプロパティに保存）
    refreshHolidayCache();

    // 今月・来月のLINEスケジュールを自動生成（未生成の場合のみ）
    try {
      var _now = new Date();
      var _cy = _now.getFullYear(), _cm = _now.getMonth() + 1;
      generateMonthlySchedule_(_cy, _cm);
      var _ny = _cm === 12 ? _cy + 1 : _cy, _nm = _cm === 12 ? 1 : _cm + 1;
      generateMonthlySchedule_(_ny, _nm);
    } catch(e) { Logger.log('⚠ LINEスケジュール自動生成: ' + e); }

    // Firestoreバックアップ（backup.js）
    try {
      runFirestoreBackup();
    } catch(e) { Logger.log('⚠ Firestoreバックアップ: ' + e); }

    recordInitializationLog('成功', '定時初期化処理（scheduledInitializeSheets）');
    
    return {
      success: true,
      message: '初期化が完了しました',
      executedAt: new Date().toISOString()
    };
    
  } catch (error) {
    Logger.log('❌ scheduledInitializeSheets エラー: ' + error);
    recordInitializationLog('失敗', 'scheduledInitializeSheets: ' + error.toString());
    
    return {
      success: false,
      error: error.toString(),
      executedAt: new Date().toISOString()
    };
  }
}

/**
 * 毎日メンテナンストリガー（scheduledInitializeSheets）を設定する
 * 毎日午前2時に実行：祝日キャッシュ更新 + LINEスケジュール自動生成 + Firestoreバックアップ
 * @return {Object} { success, message, error }
 */
function setupDailyMaintenanceTrigger() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'scheduledInitializeSheets') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('scheduledInitializeSheets').timeBased().everyDays(1).atHour(2).create();
    return { success: true, message: '毎日メンテナンストリガーを設定しました（毎日午前2時）' };
  } catch (e) {
    Logger.log('❌ setupDailyMaintenanceTriggerエラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 毎日メンテナンストリガーを削除する
 * @return {Object} { success, message, error }
 */
function deleteDailyMaintenanceTrigger() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var triggers = ScriptApp.getProjectTriggers();
    var deleted = 0;
    triggers.forEach(function(t) {
      if (t.getHandlerFunction() === 'scheduledInitializeSheets') { ScriptApp.deleteTrigger(t); deleted++; }
    });
    return { success: true, message: deleted > 0 ? 'トリガーを削除しました' : 'トリガーは設定されていません' };
  } catch (e) {
    Logger.log('❌ deleteDailyMaintenanceTriggerエラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 全トリガーの稼働状態を一括取得する（Admin のみ）
 * @return {Object} { success, triggers: { daily, lineScheduler, formEmail, backup } }
 */
function getAllTriggerStatuses() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var all = ScriptApp.getProjectTriggers();
    var status = { daily: false, lineScheduler: false, formEmail: false, backup: false };
    all.forEach(function(t) {
      var fn = t.getHandlerFunction();
      if (fn === 'scheduledInitializeSheets')  status.daily         = true;
      if (fn === 'checkAndSendDueLineMessages') status.lineScheduler = true;
      if (fn === 'checkAndForwardFormEmails')   status.formEmail     = true;
      if (fn === 'runFirestoreBackup')           status.backup        = true;
    });
    return { success: true, triggers: status };
  } catch (e) {
    Logger.log('❌ getAllTriggerStatusesエラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 手動初期化用関数（Admin のみ）
 * 必要に応じて手動で実行可能
 * Admin タブから「手動初期化」ボタンなどで呼び出す
 *
 * @return {Object} { success, message, error }
 */
function manualInitializeSheets() {
  try {
    // Admin チェック
    if (!isAdmin()) {
      Logger.log('❌ Admin のみ実行可能');
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return { success: false, error: 'フォルダIDが未設定' };
    }
    
    var rootFolder = DriveApp.getFolderById(appFolderId);

    // Firestore移行済み。スプレッドシートフォルダの作成は不要。
    // assets フォルダのみ確保（ロゴ・ファビコン・プロフィール写真・チラシ用画像に使用）
    getOrCreateTabFolder(rootFolder, 'assets');

    recordInitializationLog('成功', '手動初期化処理（manualInitializeSheets）');

    return { success: true, message: '初期化が完了しました（Firestore移行済み）' };
    
  } catch (error) {
    Logger.log('❌ manualInitializeSheets エラー: ' + error);
    recordInitializationLog('失敗', 'manualInitializeSheets: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * 初めて使用する際の初期化処理
 * スクリプトプロパティのデフォルト値を設定
 * @return {Object} { success, message, error }
 */
function initializeApplication() {
  
  try {
    var defaults = {
      [PROP_KEYS.GEMINI_API_KEY]: '',
      [PROP_KEYS.APP_FOLDER_ID]: '',
      [PROP_KEYS.THEME_COLOR]: '#43e97b'
    };
    
    for (var key in defaults) {
      if (!getProperty(key)) {
        setProperty(key, defaults[key]);
      }
    }
    
    return { success: true, message: 'アプリケーションを初期化しました' };

  } catch (error) {
    Logger.log('❌ 初期化エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Googleカレンダーの「日本の祝日」カレンダーから祝日データを取得する
 * 政府が新しい祝日を追加・変更した場合も自動で反映される
 * @aiCallable
 * @param {number} startYear 取得開始年
 * @param {number} endYear 取得終了年
 * @return {Object} {"YYYY-MM-DD": "祝日名", ...} の形式 / 取得失敗時は {}
 */
function getJapaneseHolidaysFromCalendar(startYear, endYear) {
  try {
    var calId = 'ja.japanese#holiday@group.v.calendar.google.com';
    var cal = CalendarApp.getCalendarById(calId);
    if (!cal) {
      Logger.log('⚠ getJapaneseHolidaysFromCalendar: 祝日カレンダーにアクセスできません');
      return {};
    }
    var startDate = new Date(startYear, 0, 1);
    var endDate = new Date(endYear, 11, 31, 23, 59, 59);
    var events = cal.getEvents(startDate, endDate);
    var holidays = {};
    events.forEach(function(event) {
      var d = event.getStartTime();
      var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
      var key = y + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
      holidays[key] = event.getTitle();
    });
    return holidays;
  } catch (error) {
    Logger.log('❌ getJapaneseHolidaysFromCalendar エラー: ' + error);
    return {};
  }
}

/**
 * Googleカレンダーから祝日を取得し、スクリプトプロパティにキャッシュする
 * scheduledInitializeSheets() から日次で呼ばれるため手動実行は不要
 * @return {Object} { success: boolean, message: string }
 */
function refreshHolidayCache() {
  try {
    var nowYear = new Date().getFullYear();
    var holidays = getJapaneseHolidaysFromCalendar(nowYear - 1, nowYear + 5);
    setProperty(PROP_KEYS.HOLIDAY_CACHE, JSON.stringify(holidays));
    return { success: true, message: '祝日キャッシュを更新しました（' + Object.keys(holidays).length + '件）' };
  } catch (error) {
    Logger.log('❌ refreshHolidayCache エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * スクリプトプロパティにキャッシュされた祝日データを返す
 * アプリ起動時にフロントエンドから呼び出す（CalendarApp への直接アクセスより高速）
 * @aiCallable
 * @return {Object} {"YYYY-MM-DD": "祝日名", ...} の形式 / 未キャッシュ時は {}
 */
function getCachedHolidays() {
  try {
    var raw = getProperty(PROP_KEYS.HOLIDAY_CACHE);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getCachedHolidays エラー: ' + error);
    return {};
  }
}

/**
 * GAS アプリの権限承認URL を取得する
 * appsscript.json に新しいスコープを追加した際に、オーナーが再認証するために使用する
 * @aiCallable
 * @return {Object} { success, required: boolean, url: string }
 */
function getReAuthorizationUrl() {
  try {
    var authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    var status = authInfo.getAuthorizationStatus();
    var required = status !== ScriptApp.AuthorizationStatus.NOT_REQUIRED;
    var url = authInfo.getAuthorizationUrl();
    return { success: true, required: required, url: url };
  } catch (error) {
    Logger.log('❌ getReAuthorizationUrl エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Gemini API のエラーレスポンスを解析して日本語メッセージに変換するヘルパー
 * muteHttpExceptions: true で取得したレスポンスを渡すこと
 * @param {HTTPResponse} response UrlFetchApp のレスポンス
 * @return {string} ユーザー向けの日本語エラーメッセージ
 */
function parseGeminiErrorMessage_(response) {
  var code = response.getResponseCode();
  var body = '';
  try {
    var errJson = JSON.parse(response.getContentText());
    body = errJson.error ? errJson.error.message : response.getContentText();
  } catch (e) {
    body = response.getContentText();
  }
  Logger.log('❌ Gemini API Error [' + code + ']: ' + body);

  if (code === 429) {
    var ptOff = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'Z');
    var resetHour = (ptOff === '-0700') ? 16 : 17;
    var nowHour = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'), 10);
    var when = nowHour >= resetHour ? '明日の' : '今日の';
    return 'AIの1日の利用上限に達しました。' + when + resetHour + ':00頃に制限が解除されます。';
  }
  if (code === 401) return 'Gemini APIキーが正しくありません。管理者に報告してご確認いただくようお願いします';
  if (code === 403) return 'Gemini APIキーに権限がありません。管理者に報告してご確認いただくようお願いします';
  if (code === 404) return 'AIモデルが見つかりません。管理者に報告してください';
  if (code >= 500) return 'Gemini APIサーバーで一時的な障害が発生しています。しばらくお待ちください';
  return '予期しないAPIエラーが発生しました (HTTP ' + code + ')。管理者に報告してください';
}


// ========================================
// テスト用エクスポート（GAS環境では無視される）
// ========================================
if (typeof module !== 'undefined') {
  module.exports = {
    normalizeScheduleEvent: normalizeScheduleEvent,
    buildSchoolLookup: buildSchoolLookup,
    matchSchoolName: matchSchoolName,
    getDefaultDept: getDefaultDept
  };
}
