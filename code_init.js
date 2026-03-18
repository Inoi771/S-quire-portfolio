/**
 * code_init.js — Drive リソース自動作成・初期セットアップ
 *
 * 設定タブの「🔧 Drive リソースを自動作成」ボタンから
 * code.js の runSetupScriptProperties() 経由で呼ばれる。
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
