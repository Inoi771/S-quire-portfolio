/**
 * code_init.js — Drive リソース自動作成・初期セットアップ・年度フォルダ作成
 * 役割: ルートフォルダ+マスターシート自動作成 / 年度フォルダ+スプレッドシート作成
 * 主要関数: setupScriptProperties, validateScriptProperties, createYearResources
 */

/**
 * Drive フォルダとマスタースプレッドシートを自動作成し Script Properties に保存する
 * 既に設定済みの項目はスキップする（べき等）
 * @returns {{ success: boolean, created: string[], existing: string[], manualRequired: string[], error?: string }}
 */
function setupScriptProperties() {
  try {
    const props = PropertiesService.getScriptProperties();
    const created = [];
    const existing = [];
    const manualRequired = [];

    // 1. ENGLISHWORDS_FOLDER_ID — 未設定なら Drive フォルダを作成
    let folderId = props.getProperty('ENGLISHWORDS_FOLDER_ID');
    if (!folderId) {
      const folder = DriveApp.createFolder('英語学習アプリ');
      folderId = folder.getId();
      props.setProperty('ENGLISHWORDS_FOLDER_ID', folderId);
      props.setProperty('VOCABULARY_FOLDER_ID', folderId);
      created.push('ENGLISHWORDS_FOLDER_ID（フォルダ名: 英語学習アプリ）');
    } else {
      existing.push('ENGLISHWORDS_FOLDER_ID');
    }

    // 2. ENGLISHWORDS_SHEET_ID — 未設定ならマスタースプレッドシートを作成
    let sheetId = props.getProperty('ENGLISHWORDS_SHEET_ID');
    if (!sheetId) {
      const ss = SpreadsheetApp.create('英語学習マスターデータ');

      // 「英単語」シート（デフォルトシートをリネーム）
      const wordSheet = ss.getActiveSheet();
      wordSheet.setName('英単語');
      wordSheet.appendRow(['id', 'english', 'pronunciation', 'japanese', 'audio']);

      // 「英文」シートを追加
      const sentSheet = ss.insertSheet('英文');
      sentSheet.appendRow(['id', 'english', 'pronunciation', 'japanese', 'audio']);

      // Drive フォルダに移動（マイドライブのルートから）
      const file = DriveApp.getFileById(ss.getId());
      DriveApp.getFolderById(folderId).addFile(file);
      DriveApp.getRootFolder().removeFile(file);

      sheetId = ss.getId();
      props.setProperty('ENGLISHWORDS_SHEET_ID', sheetId);
      created.push('ENGLISHWORDS_SHEET_ID（スプレッドシート名: 英語学習マスターデータ）');
    } else {
      existing.push('ENGLISHWORDS_SHEET_ID');
    }

    // 手動設定が必要な項目を通知
    if (!props.getProperty('GITHUB_BASE_URL')) manualRequired.push('GITHUB_BASE_URL');
    if (!props.getProperty('GITHUB_TOKEN')) manualRequired.push('GITHUB_TOKEN');
    if (!props.getProperty('GOOGLE_CLOUD_TTS_API_KEY')) manualRequired.push('GOOGLE_CLOUD_TTS_API_KEY');

    Logger.log('✅ setupScriptProperties 完了: created=' + JSON.stringify(created) + ', existing=' + JSON.stringify(existing));
    return { success: true, created: created, existing: existing, manualRequired: manualRequired };
  } catch (e) {
    Logger.log('Error setupScriptProperties: ' + e);
    return { success: false, error: e.toString(), created: [], existing: [], manualRequired: [] };
  }
}

/**
 * 必須 Script Properties の存在確認
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateScriptProperties() {
  const required = ['ENGLISHWORDS_FOLDER_ID', 'ENGLISHWORDS_SHEET_ID'];
  const missing = required.filter(function(k) {
    return !PropertiesService.getScriptProperties().getProperty(k);
  });
  return { valid: missing.length === 0, missing: missing };
}

/**
 * 新年度のフォルダとスプレッドシートを作成する
 * 入試対策編は最新既存年度からデータごとコピー（なければ空作成）
 * @param {string} year - 年度名（例: "2027年度版"）
 * @returns {{ success: boolean, year?: string, error?: string }}
 */
function createYearResources(year) {
  try {
    // 1. 年度名バリデーション
    if (!year || !/^\d{4}年度版$/.test(year)) {
      return { success: false, error: '年度名は「2027年度版」の形式で入力してください。' };
    }

    // 2. ルートフォルダ取得
    const folderId = PropertiesService.getScriptProperties().getProperty('ENGLISHWORDS_FOLDER_ID');
    if (!folderId) {
      return { success: false, error: 'ENGLISHWORDS_FOLDER_ID が設定されていません。先に「Drive リソースを自動作成」を実行してください。' };
    }
    const rootFolder = DriveApp.getFolderById(folderId);

    // 3. 同名フォルダの存在確認
    const existing = rootFolder.getFoldersByName(year);
    if (existing.hasNext()) {
      return { success: false, error: '「' + year + '」フォルダはすでに存在します。' };
    }

    // 4. 年度フォルダ作成
    const yearFolder = rootFolder.createFolder(year);

    // 5. 新教科書版・旧教科書版スプレッドシートを作成
    createTextbookSpreadsheet_('新教科書版', yearFolder);
    createTextbookSpreadsheet_('旧教科書版', yearFolder);

    // 6. 入試対策編：最新既存年度からコピー、なければ空作成
    const latestYearFolder = getLatestYearFolder_(rootFolder, year);
    if (latestYearFolder) {
      const examFiles = latestYearFolder.getFilesByName('入試対策編');
      if (examFiles.hasNext()) {
        examFiles.next().makeCopy('入試対策編', yearFolder);
      } else {
        createEmptyExamPrepSpreadsheet_(yearFolder);
      }
    } else {
      createEmptyExamPrepSpreadsheet_(yearFolder);
    }

    Logger.log('✅ createYearResources 完了: ' + year);
    return { success: true, year: year };
  } catch (e) {
    Logger.log('Error createYearResources: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 新教科書版/旧教科書版スプレッドシートを作成（中学1〜3年 + レッスン順序シート）
 * @param {string} name - スプレッドシート名（「新教科書版」または「旧教科書版」）
 * @param {Folder} yearFolder - 年度フォルダ
 */
function createTextbookSpreadsheet_(name, yearFolder) {
  const ss = SpreadsheetApp.create(name);
  const header = ['word_id', 'english', 'pronunciation', 'japanese', 'audio', 'lesson', 'cell_id'];

  // デフォルトシートを「中学1年」にリネーム
  const sheet1 = ss.getActiveSheet();
  sheet1.setName('中学1年');
  sheet1.appendRow(header);

  ss.insertSheet('中学2年').appendRow(header);
  ss.insertSheet('中学3年').appendRow(header);
  ss.insertSheet('レッスン順序');

  // 年度フォルダに移動
  const file = DriveApp.getFileById(ss.getId());
  yearFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
}

/**
 * 入試対策編スプレッドシートを空で作成（通常/不規則動詞①/②シート）
 * @param {Folder} yearFolder - 年度フォルダ
 */
function createEmptyExamPrepSpreadsheet_(yearFolder) {
  const ss = SpreadsheetApp.create('入試対策編');
  const header7  = ['word_id', 'english', 'pronunciation', 'japanese', 'audio', 'lesson', 'cell_id'];
  const header14 = header7.concat(['past_word_id', 'past_english', 'past_pronunciation', 'past_audio', '', '', '']);
  const header18 = header14.concat(['past_part_word_id', 'past_part_english', 'past_part_pronunciation', 'past_part_audio', '', '', '']);

  const sheetTsujo = ss.getActiveSheet();
  sheetTsujo.setName('通常');
  sheetTsujo.appendRow(header7);

  ss.insertSheet('不規則動詞①').appendRow(header14);
  ss.insertSheet('不規則動詞②').appendRow(header18);

  const file = DriveApp.getFileById(ss.getId());
  yearFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
}

/**
 * ルートフォルダ内の既存年度フォルダのうち最新のものを返す
 * @param {Folder} rootFolder - ルートフォルダ
 * @param {string} excludeYear - 除外する年度名（新規作成中の年度）
 * @returns {Folder|null}
 */
function getLatestYearFolder_(rootFolder, excludeYear) {
  const folders = rootFolder.getFolders();
  let latestFolder = null;
  let latestYear = 0;
  while (folders.hasNext()) {
    const folder = folders.next();
    const name = folder.getName();
    const match = name.match(/^(\d{4})年度版$/);
    if (match && name !== excludeYear) {
      const yr = parseInt(match[1], 10);
      if (yr > latestYear) {
        latestYear = yr;
        latestFolder = folder;
      }
    }
  }
  return latestFolder;
}
