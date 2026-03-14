/**
 * 初期セットアップ・年度リソース自動作成
 *
 * 使い方:
 *   GAS エディタで initializeAllResources('2026年度版') を実行
 *   新年度追加時は initializeYearResources('2027年度版') を実行
 */

// ════════════════════════════════════════════════════════
// プライベートヘルパー（GAS 規約: 末尾 _ で非公開）
// ════════════════════════════════════════════════════════

/**
 * フォルダ内からスプレッドシートを名前で検索
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {string} name
 * @returns {GoogleAppsScript.Drive.File|null}
 */
function findSpreadsheetInFolder_(folder, name) {
  var files = folder.getFilesByName(name);
  while (files.hasNext()) {
    var file = files.next();
    if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return file;
    }
  }
  return null;
}

/**
 * フォルダ内からサブフォルダを名前で検索
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {string} name
 * @returns {GoogleAppsScript.Drive.Folder|null}
 */
function findSubfolderInFolder_(folder, name) {
  var folders = folder.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

/**
 * スプレッドシートのデフォルトシート（シート1/Sheet1）を削除
 * 他にシートが存在する場合のみ削除する
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function removeDefaultSheet_(ss) {
  var sheets = ss.getSheets();
  if (sheets.length <= 1) return;

  var defaultNames = ['シート1', 'Sheet1'];
  for (var i = 0; i < defaultNames.length; i++) {
    var defaultSheet = ss.getSheetByName(defaultNames[i]);
    if (defaultSheet) {
      ss.deleteSheet(defaultSheet);
      return;
    }
  }
}

/**
 * レッスン順序シートのヘッダーを設定（新規作成時のみ）
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function setupLessonOrderHeader_(sheet) {
  if (sheet.getLastRow() > 0) return; // 既にデータがある場合はスキップ

  var grades = ['中学1年', '中学2年', '中学3年'];
  sheet.getRange(1, 1, 1, 3).setValues([grades]);
  var headerRange = sheet.getRange(1, 1, 1, 3);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#e8e8e8');
}

// ════════════════════════════════════════════════════════
// 公開関数
// ════════════════════════════════════════════════════════

/**
 * Script Properties の検証
 * 必須プロパティの存在確認とマスタースプレッドシートのアクセスチェック
 * @returns {Object} { valid: boolean, missing: string[], warnings: string[] }
 */
function validateScriptProperties() {
  var required = ['ENGLISHWORDS_FOLDER_ID', 'ENGLISHWORDS_SHEET_ID', 'GITHUB_BASE_URL'];
  var optional = ['VOCABULARY_FOLDER_ID', 'HOMEPAGE_URL', 'GOOGLE_CLOUD_TTS_API_KEY', 'GITHUB_TOKEN'];

  var missing = [];
  var warnings = [];

  // 必須プロパティチェック
  for (var i = 0; i < required.length; i++) {
    var val = getScriptProperty(required[i]);
    if (!val) {
      missing.push(required[i]);
    }
  }

  // 任意プロパティチェック
  for (var j = 0; j < optional.length; j++) {
    var val2 = getScriptProperty(optional[j]);
    if (!val2) {
      warnings.push(optional[j] + ' が未設定です（任意）');
    }
  }

  if (missing.length > 0) {
    Logger.log('❌ 必須プロパティが未設定: ' + missing.join(', '));
    return { valid: false, missing: missing, warnings: warnings };
  }

  // マスタースプレッドシートのアクセス確認
  try {
    var masterSs = SpreadsheetApp.openById(getScriptProperty('ENGLISHWORDS_SHEET_ID'));
    if (!masterSs.getSheetByName('英単語')) {
      missing.push('マスタースプレッドシートに「英単語」シートがありません');
    }
    if (!masterSs.getSheetByName('英文')) {
      missing.push('マスタースプレッドシートに「英文」シートがありません');
    }
  } catch (e) {
    missing.push('マスタースプレッドシート（ENGLISHWORDS_SHEET_ID）にアクセスできません: ' + e);
  }

  if (missing.length > 0) {
    Logger.log('❌ 検証失敗: ' + missing.join(', '));
    return { valid: false, missing: missing, warnings: warnings };
  }

  Logger.log('✅ Script Properties の検証OK');
  if (warnings.length > 0) {
    Logger.log('⚠️ 警告: ' + warnings.join(', '));
  }
  return { valid: true, missing: [], warnings: warnings };
}

/**
 * 年度リソースの自動作成（べき等: 既存はスキップ）
 * 年度フォルダ・教科書スプレッドシート・学年シートを作成する
 * @param {string} year - "2026年度版" 形式
 * @returns {Object} { success: boolean, created: string[], existing: string[], error?: string }
 */
function initializeYearResources(year) {
  try {
    // 年度フォーマットの検証
    if (!/^\d{4}年度版$/.test(year)) {
      return { success: false, created: [], existing: [], error: '年度は "2026年度版" の形式で指定してください' };
    }

    var folderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    if (!folderId) {
      return { success: false, created: [], existing: [], error: 'ENGLISHWORDS_FOLDER_ID が未設定です' };
    }

    var rootFolder = DriveApp.getFolderById(folderId);
    var created = [];
    var existing = [];

    // ── 年度フォルダ ──
    var yearFolder = findSubfolderInFolder_(rootFolder, year);
    if (yearFolder) {
      existing.push('フォルダ: ' + year);
    } else {
      yearFolder = rootFolder.createFolder(year);
      created.push('フォルダ: ' + year);
    }

    // ── 教科書スプレッドシート定義 ──
    var textbookConfigs = [
      {
        name: '新教科書版',
        sheets: ['中学1年', '中学2年', '中学3年', 'レッスン順序']
      },
      {
        name: '旧教科書版',
        sheets: ['中学1年', '中学2年', '中学3年', 'レッスン順序']
      },
      {
        name: '入試対策編',
        sheets: ['通常', '不規則動詞①', '不規則動詞②']
      }
    ];

    // ── 各教科書スプレッドシートの作成 ──
    for (var t = 0; t < textbookConfigs.length; t++) {
      var config = textbookConfigs[t];
      var ssFile = findSpreadsheetInFolder_(yearFolder, config.name);
      var ss;

      if (ssFile) {
        existing.push('スプレッドシート: ' + config.name);
        ss = SpreadsheetApp.open(ssFile);
      } else {
        // SpreadsheetApp.create() はルートDriveに作成されるため、年度フォルダに移動
        ss = SpreadsheetApp.create(config.name);
        var newFile = DriveApp.getFileById(ss.getId());
        newFile.moveTo(yearFolder);
        created.push('スプレッドシート: ' + config.name);
      }

      // ── 各シートの作成 ──
      for (var s = 0; s < config.sheets.length; s++) {
        var sheetName = config.sheets[s];
        var sheet = ss.getSheetByName(sheetName);

        if (sheet) {
          existing.push('  シート: ' + config.name + ' > ' + sheetName);
        } else {
          sheet = ss.insertSheet(sheetName);
          created.push('  シート: ' + config.name + ' > ' + sheetName);

          // レッスン順序シートのみヘッダー設定
          if (sheetName === 'レッスン順序') {
            setupLessonOrderHeader_(sheet);
          }
        }
      }

      // デフォルトシート（シート1/Sheet1）を削除
      removeDefaultSheet_(ss);
    }

    // ── 結果ログ出力 ──
    Logger.log('✅ 年度リソース初期化完了: ' + year);
    if (created.length > 0) {
      Logger.log('📌 新規作成: \n  ' + created.join('\n  '));
    }
    if (existing.length > 0) {
      Logger.log('📌 既存（スキップ）: \n  ' + existing.join('\n  '));
    }

    return { success: true, created: created, existing: existing };

  } catch (e) {
    Logger.log('❌ Error initializeYearResources: ' + e);
    return { success: false, created: [], existing: [], error: e.toString() };
  }
}

/**
 * Script Properties を自動セットアップする
 * Driveフォルダ・マスタースプレッドシートを自動作成してIDをプロパティに保存する。
 * GITHUB_BASE_URL / GITHUB_TOKEN / GOOGLE_CLOUD_TTS_API_KEY は外部サービスのため手動設定が必要。
 *
 * GAS エディタで実行: setupScriptProperties()
 *
 * @returns {Object} { success, created, existing, manualRequired }
 */
function setupScriptProperties() {
  var props = PropertiesService.getScriptProperties();
  var created = [];
  var existing = [];

  // ── ENGLISHWORDS_FOLDER_ID ──
  var folderId = props.getProperty('ENGLISHWORDS_FOLDER_ID');
  if (!folderId) {
    var folder = DriveApp.createFolder('ENGLISHWORDS');
    folderId = folder.getId();
    props.setProperty('ENGLISHWORDS_FOLDER_ID', folderId);
    props.setProperty('VOCABULARY_FOLDER_ID', folderId);
    created.push('ENGLISHWORDS_FOLDER_ID = ' + folderId + '（Drive フォルダ「ENGLISHWORDS」を作成）');
    created.push('VOCABULARY_FOLDER_ID = ' + folderId + '（ENGLISHWORDS_FOLDER_ID と同値）');
  } else {
    existing.push('ENGLISHWORDS_FOLDER_ID は設定済み');
    // VOCABULARY_FOLDER_ID が未設定なら同じ値をセット
    if (!props.getProperty('VOCABULARY_FOLDER_ID')) {
      props.setProperty('VOCABULARY_FOLDER_ID', folderId);
      created.push('VOCABULARY_FOLDER_ID = ' + folderId + '（ENGLISHWORDS_FOLDER_ID と同値）');
    } else {
      existing.push('VOCABULARY_FOLDER_ID は設定済み');
    }
  }

  // ── ENGLISHWORDS_SHEET_ID ──
  var sheetId = props.getProperty('ENGLISHWORDS_SHEET_ID');
  if (!sheetId) {
    var ss = SpreadsheetApp.create('マスターデータ（英単語・英文）');
    // 英単語シート
    var wordSheet = ss.insertSheet('英単語');
    wordSheet.getRange(1, 1, 1, 5).setValues([['id', 'english', 'pronunciation', 'japanese', 'audio']]);
    wordSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e8e8e8');
    // 英文シート
    var sentenceSheet = ss.insertSheet('英文');
    sentenceSheet.getRange(1, 1, 1, 5).setValues([['id', 'text', 'pronunciation', 'japanese', 'audio']]);
    sentenceSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e8e8e8');
    // デフォルトシート削除
    removeDefaultSheet_(ss);
    sheetId = ss.getId();
    props.setProperty('ENGLISHWORDS_SHEET_ID', sheetId);
    created.push('ENGLISHWORDS_SHEET_ID = ' + sheetId + '（マスタースプレッドシートを作成）');
  } else {
    existing.push('ENGLISHWORDS_SHEET_ID は設定済み');
  }

  // ── 手動設定が必要なプロパティ ──
  var manualRequired = [];
  var manualProps = ['GITHUB_BASE_URL', 'GITHUB_TOKEN', 'GOOGLE_CLOUD_TTS_API_KEY', 'HOMEPAGE_URL'];
  for (var i = 0; i < manualProps.length; i++) {
    if (!props.getProperty(manualProps[i])) {
      manualRequired.push(manualProps[i]);
    }
  }

  Logger.log('✅ setupScriptProperties 完了');
  if (created.length > 0) Logger.log('📌 自動設定済み:\n  ' + created.join('\n  '));
  if (existing.length > 0) Logger.log('📌 設定済み（スキップ）:\n  ' + existing.join('\n  '));
  if (manualRequired.length > 0) {
    Logger.log('⚠️ 手動設定が必要なプロパティ: ' + manualRequired.join(', '));
    Logger.log('   GAS エディタ → プロジェクトの設定 → スクリプトプロパティ で手動設定してください');
  }

  return {
    success: true,
    created: created,
    existing: existing,
    manualRequired: manualRequired
  };
}

/**
 * 全リソースの初期化（メインエントリポイント）
 * Script Properties の検証 → 年度リソースの作成
 * @param {string} year - "2026年度版" 形式
 * @returns {Object} 実行結果
 */
function initializeAllResources(year) {
  Logger.log('🚀 初期化開始: ' + year);

  // Step 1: Script Properties の検証
  var validation = validateScriptProperties();
  if (!validation.valid) {
    return {
      success: false,
      error: '必須設定が不足しています: ' + validation.missing.join(', '),
      warnings: validation.warnings
    };
  }

  // Step 2: 年度リソースの作成
  var result = initializeYearResources(year);

  // 警告情報をマージ
  result.warnings = validation.warnings;

  if (result.success) {
    Logger.log('🎉 初期化完了: ' + year);
  }

  return result;
}
