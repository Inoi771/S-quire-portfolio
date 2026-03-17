/**
 * ============================================================
 * code_tts.js — Google Cloud TTS 音声生成・GitHub アップロード
 * ============================================================
 *
 * 必要な Script Properties:
 *   GOOGLE_CLOUD_TTS_API_KEY — Google Cloud TTS API キー
 *   GITHUB_TOKEN             — GitHub Personal Access Token（repo スコープ）
 *   GITHUB_BASE_URL          — 音声ファイルのベースURL（owner/repo の抽出に使用）
 */

// ────────────────────────────────────────────
// 同綴り異発音語マップ（ヘテロニム）
// ────────────────────────────────────────────

/**
 * 同じ綴りで発音が異なる単語と、日本語での判別キーワードのマップ。
 * キー: 英単語（小文字）
 * 値: { 日本語キーワード: ファイル名サフィックス }
 * 日本語にキーワードが含まれる場合は english_suffix.mp3 形式になる。
 * 一致しない場合はデフォルト（サフィックスなし）で生成する。
 *
 * NOTE: キーワードが実際のマスターシートの日本語データに合っているか
 * 実装後に確認すること。
 */
var HETERONYM_MAP = {
  'read':  { '過去': 'past' },
  'lead':  { '過去': 'past' },
  'live':  { '放送': 'adj', '生き': 'adj' },
  'tear':  { '裂': 'verb', '破': 'verb' },
  'wound': { '巻': 'verb' },
  'bow':   { '辞儀': 'verb', '頭': 'verb' },
  'row':   { '口論': 'verb', '言い争': 'verb' },
  'sow':   { '雌豚': 'noun' }
};

// ────────────────────────────────────────────
// ファイル名生成
// ────────────────────────────────────────────

/**
 * 英語テキストと日本語訳から音声ファイル名を生成する。
 * HETERONYM_MAP を使って同綴り異発音語を区別する。
 *
 * @param {string} englishText - 英語テキスト（例: "read"）
 * @param {number} masterId    - マスターID（短語の衝突回避用）
 * @param {string} japanese    - 日本語訳（ヘテロニム判定用）
 * @returns {string} ファイル名（例: "read.mp3", "read_past.mp3"）
 */
function generateAudioFilename(englishText, masterId, japanese) {
  if (!englishText || !englishText.trim()) return '';

  var name = englishText.trim().toLowerCase();

  // 記号をアンダースコアに変換（英数字・アンダースコア・ハイフン以外）
  name = name.replace(/[^a-z0-9_\-]/g, '_');

  // 連続するアンダースコアをまとめる
  name = name.replace(/_+/g, '_');

  // 先頭・末尾のアンダースコアを除去
  name = name.replace(/^_+|_+$/g, '');

  // 空になった場合は masterId のみ
  if (!name) return 'word_' + masterId + '.mp3';

  // 80文字で切り詰め
  if (name.length > 80) {
    name = name.substring(0, 80).replace(/_+$/, '');
  }

  // ─── ヘテロニム判定 ───
  var suffix = '';
  if (HETERONYM_MAP[name] && japanese) {
    var keywords = HETERONYM_MAP[name];
    for (var keyword in keywords) {
      if (japanese.indexOf(keyword) !== -1) {
        suffix = '_' + keywords[keyword];
        break;
      }
    }
  }

  // ─── 短語の衝突回避（ヘテロニムサフィックスがない場合のみ） ───
  if (!suffix && name.length <= 2) {
    suffix = '_' + masterId;
  }

  return name + suffix + '.mp3';
}

// ────────────────────────────────────────────
// GitHub URL パース
// ────────────────────────────────────────────

/**
 * GITHUB_BASE_URL から owner/repo を抽出する
 * @param {string} githubBaseUrl - 例: "https://raw.githubusercontent.com/owner/repo/main"
 * @returns {string|null} "owner/repo" 形式、失敗時は null
 */
function parseGithubRepoFromUrl(githubBaseUrl) {
  if (!githubBaseUrl) return null;

  var match = githubBaseUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)/);
  if (match) return match[1] + '/' + match[2];

  match = githubBaseUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) return match[1] + '/' + match[2].replace(/\.git$/, '');

  return null;
}

// ────────────────────────────────────────────
// 月間使用量の追跡・制限
// ────────────────────────────────────────────

/** 月間文字数の上限（Standard音声の無料枠400万文字に対し、安全マージン込み） */
var TTS_MONTHLY_CHAR_LIMIT = 3500000;

/**
 * 月間使用文字数をチェックし、上限以内なら加算して true を返す
 * @param {string} text - 今回生成するテキスト
 * @returns {boolean} 生成可能なら true、上限超過なら false
 */
function checkAndUpdateCharUsage(text) {
  try {
    var props = PropertiesService.getScriptProperties();
    var now = new Date();
    var currentMonth = Utilities.formatDate(now, 'Etc/GMT-9', 'yyyy-MM');

    var savedMonth = props.getProperty('TTS_CHAR_MONTH') || '';
    var charCount = parseInt(props.getProperty('TTS_CHAR_COUNT') || '0', 10);

    if (savedMonth !== currentMonth) {
      charCount = 0;
      props.setProperty('TTS_CHAR_MONTH', currentMonth);
    }

    var textLength = text ? text.length : 0;

    if (charCount + textLength > TTS_MONTHLY_CHAR_LIMIT) {
      Logger.log('⚠️ TTS月間文字数上限に達しました: ' + charCount + '/' + TTS_MONTHLY_CHAR_LIMIT + ' (今回: ' + textLength + '文字)');
      return false;
    }

    props.setProperty('TTS_CHAR_COUNT', String(charCount + textLength));
    return true;
  } catch (e) {
    Logger.log('⚠️ TTS使用量チェックでエラー（生成は続行）: ' + e);
    return true;
  }
}

// ────────────────────────────────────────────
// Google Cloud TTS API 呼び出し
// ────────────────────────────────────────────

/**
 * Google Cloud TTS API を呼び出して音声を生成する
 * @param {string} text - 読み上げるテキスト
 * @returns {string|null} base64エンコードされた音声データ、失敗時は null
 */
function callGoogleCloudTts(text) {
  try {
    if (!checkAndUpdateCharUsage(text)) return null;

    var apiKey = getScriptProperty('GOOGLE_CLOUD_TTS_API_KEY');
    if (!apiKey) {
      Logger.log('⚠️ GOOGLE_CLOUD_TTS_API_KEY が未設定です');
      return null;
    }

    var url = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + apiKey;
    var payload = {
      input: { text: text },
      voice: { languageCode: 'en-US', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3' }
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();

    // レート制限（429）の場合、2秒待ってから1回リトライ
    if (responseCode === 429) {
      Logger.log('⚠️ TTS API レート制限 (429)。2秒後にリトライします...');
      Utilities.sleep(2000);
      response = UrlFetchApp.fetch(url, options);
      responseCode = response.getResponseCode();
    }

    if (responseCode !== 200) {
      Logger.log('❌ TTS API エラー (HTTP ' + responseCode + '): ' + response.getContentText());
      return null;
    }

    var result = JSON.parse(response.getContentText());
    return result.audioContent || null;
  } catch (e) {
    Logger.log('❌ TTS API 呼び出し失敗: ' + e);
    return null;
  }
}

// ────────────────────────────────────────────
// GitHub フォルダ確認・作成
// ────────────────────────────────────────────

/**
 * audio/{firstChar}/ フォルダが GitHub に存在するか確認し、
 * なければ .gitkeep を置いて作成する。
 * 既に存在する場合はスキップ。
 * @param {string} repo      - "owner/repo" 形式
 * @param {string} firstChar - フォルダ名（例: "r"）
 * @param {Object} headers   - GitHub API 認証ヘッダー
 */
function ensureGithubAudioFolder(repo, firstChar, headers) {
  var folderApiUrl = 'https://api.github.com/repos/' + repo + '/contents/audio/' + firstChar;
  var checkResponse = UrlFetchApp.fetch(folderApiUrl, {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  });

  if (checkResponse.getResponseCode() === 200) return; // フォルダ存在

  // .gitkeep を作成してフォルダを生成
  var gitkeepUrl = folderApiUrl + '/.gitkeep';
  var putResponse = UrlFetchApp.fetch(gitkeepUrl, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify({
      message: 'Create audio/' + firstChar + '/ folder',
      content: Utilities.base64Encode(' ')  // 1バイトの空コンテンツ
    }),
    muteHttpExceptions: true
  });

  var putCode = putResponse.getResponseCode();
  if (putCode === 200 || putCode === 201) {
    Logger.log('✅ フォルダ作成: audio/' + firstChar + '/');
  } else {
    Logger.log('⚠️ フォルダ作成失敗 (HTTP ' + putCode + '): audio/' + firstChar + '/');
  }
}

// ────────────────────────────────────────────
// GitHub へのアップロード
// ────────────────────────────────────────────

/**
 * GitHub Contents API を使って音声ファイルをアップロードする
 * パス: audio/{firstChar}/{filename}
 * @param {string} filename     - ファイル名（例: "read.mp3"）
 * @param {string} base64Content - base64エンコードされたファイル内容
 * @returns {boolean} 成功時 true
 */
function uploadAudioToGithub(filename, base64Content) {
  try {
    var githubToken = getScriptProperty('GITHUB_TOKEN');
    if (!githubToken) {
      Logger.log('⚠️ GITHUB_TOKEN が未設定です');
      return false;
    }

    var githubBaseUrl = getScriptProperty('GITHUB_BASE_URL');
    var repo = parseGithubRepoFromUrl(githubBaseUrl);
    if (!repo) {
      Logger.log('❌ GITHUB_BASE_URL からリポジトリ情報を抽出できません: ' + githubBaseUrl);
      return false;
    }

    var headers = {
      'Authorization': 'token ' + githubToken,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GAS-EnglishTest-TTS'
    };

    var firstChar = filename.charAt(0).toLowerCase();
    var filePath = 'audio/' + firstChar + '/' + filename;
    var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + filePath;

    // フォルダが存在しなければ作成
    ensureGithubAudioFolder(repo, firstChar, headers);

    // 既存ファイルの SHA を取得（上書き用）
    var existingSha = null;
    try {
      var getResponse = UrlFetchApp.fetch(apiUrl, {
        method: 'get',
        headers: headers,
        muteHttpExceptions: true
      });
      if (getResponse.getResponseCode() === 200) {
        existingSha = JSON.parse(getResponse.getContentText()).sha;
      }
    } catch (e) { /* 新規の場合は無視 */ }

    var putPayload = {
      message: existingSha ? 'Update TTS audio: ' + filename : 'Add TTS audio: ' + filename,
      content: base64Content
    };
    if (existingSha) putPayload.sha = existingSha;

    var putResponse = UrlFetchApp.fetch(apiUrl, {
      method: 'put',
      headers: headers,
      contentType: 'application/json',
      payload: JSON.stringify(putPayload),
      muteHttpExceptions: true
    });

    var putCode = putResponse.getResponseCode();
    if (putCode === 200 || putCode === 201) {
      Logger.log('✅ GitHub に音声をアップロードしました: ' + filePath);
      return true;
    } else {
      Logger.log('❌ GitHub アップロード失敗 (HTTP ' + putCode + '): ' + putResponse.getContentText());
      return false;
    }
  } catch (e) {
    Logger.log('❌ GitHub アップロードエラー: ' + e);
    return false;
  }
}

// ────────────────────────────────────────────
// GitHub 上のファイル存在確認
// ────────────────────────────────────────────

/**
 * 指定ファイルが GitHub の audio/{firstChar}/ に存在するか確認する
 * @param {string} filename - ファイル名（例: "read.mp3"）
 * @param {string} repo     - "owner/repo" 形式
 * @param {Object} headers  - GitHub API 認証ヘッダー
 * @returns {boolean} 存在すれば true
 */
function checkAudioExistsOnGithub(filename, repo, headers) {
  try {
    var firstChar = filename.charAt(0).toLowerCase();
    var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/audio/' + firstChar + '/' + filename;
    var response = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    return response.getResponseCode() === 200;
  } catch (e) {
    return false;
  }
}

// ────────────────────────────────────────────
// TTS 生成 + アップロード（単体）
// ────────────────────────────────────────────

/**
 * TTS音声を生成して GitHub にアップロードする
 * @param {string} englishText - 英語テキスト
 * @param {number} masterId    - マスターID
 * @param {string} japanese    - 日本語訳（ヘテロニム判定用）
 * @returns {string} 生成されたファイル名、失敗時は空文字
 */
function generateAndUploadAudio(englishText, masterId, japanese) {
  try {
    var filename = generateAudioFilename(englishText, masterId, japanese);
    if (!filename) return '';

    var base64Audio = callGoogleCloudTts(englishText);
    if (!base64Audio) return '';

    var uploaded = uploadAudioToGithub(filename, base64Audio);
    if (!uploaded) return '';

    Logger.log('✅ TTS音声生成完了: ' + englishText + ' → ' + filename);
    return filename;
  } catch (e) {
    Logger.log('⚠️ TTS音声生成失敗: ' + e);
    return '';
  }
}

// ────────────────────────────────────────────
// 単一アイテムの音声再生成
// ────────────────────────────────────────────

/**
 * 指定されたマスターIDの音声を再生成する
 * @param {number} masterId    - マスターID
 * @param {string} englishText - 英語テキスト
 * @param {string} japanese    - 日本語訳（ヘテロニム判定用）
 * @returns {Object} { success, audio, error }
 */
function regenerateAudio(masterId, englishText, japanese) {
  try {
    var filename = generateAndUploadAudio(englishText, masterId, japanese || '');
    if (!filename) {
      return { success: false, error: 'TTS生成またはアップロードに失敗しました' };
    }

    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);
    var sheetName = masterId >= 10001 ? '英文' : '英単語';
    var sheet = ss.getSheetByName(sheetName);

    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < ids.length; i++) {
          if (parseInt(ids[i][0]) === parseInt(masterId)) {
            sheet.getRange(i + 2, 5).setValue(filename);
            Logger.log('✅ マスターシート更新: ID=' + masterId + ', audio=' + filename);
            break;
          }
        }
      }
    }

    return { success: true, audio: filename };
  } catch (e) {
    Logger.log('❌ regenerateAudio エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ────────────────────────────────────────────
// audio 列が空の行にファイル名を一括付与（TTS 生成なし）
// ────────────────────────────────────────────

/**
 * マスターシートの audio 列が空の行にファイル名を生成して書き込む。
 * TTS 生成・GitHub アップロードは行わない。
 * この関数の後に bulkGenerateAudio() を実行すると音声ファイルが生成される。
 * @returns {Object} { success, filled, errors }
 */
function fillMissingAudioFilenames() {
  try {
    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);
    var filled = 0;
    var errors = [];

    ['英単語', '英文'].forEach(function(sheetName) {
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;

      // id | english | pronunciation | japanese | audio (1〜5列)
      var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var id       = row[0];
        var english  = row[1];
        var japanese = row[3];
        var audio    = row[4];

        // audio が既に設定されているか、英語テキストがない行はスキップ
        if (audio && String(audio).trim() !== '') continue;
        if (!english || String(english).trim() === '') continue;

        try {
          var filename = generateAudioFilename(
            String(english).trim(),
            id,
            String(japanese || '')
          );
          if (filename) {
            sheet.getRange(i + 2, 5).setValue(filename);
            filled++;
            Logger.log('📝 ファイル名付与 [' + sheetName + ']: ' + english + ' → ' + filename);
          }
        } catch (e) {
          errors.push(sheetName + ' ID=' + id + ': ' + e);
        }
      }
    });

    Logger.log('✅ fillMissingAudioFilenames 完了: 付与=' + filled + ', エラー=' + errors.length);
    return { success: true, filled: filled, errors: errors };
  } catch (e) {
    Logger.log('❌ fillMissingAudioFilenames エラー: ' + e);
    return { success: false, filled: 0, errors: [e.toString()] };
  }
}

// ────────────────────────────────────────────
// TTS 一括生成（ファイル名あり・mp3 なしの行を対象）
// ────────────────────────────────────────────

/**
 * audio 列にファイル名が設定されているが、GitHub 上に mp3 が存在しない行に
 * TTS 音声を生成してアップロードする。
 * 既に mp3 が存在する行はスキップする。
 *
 * 実行順序: fillMissingAudioFilenames() → bulkGenerateAudio() の順に実行すること。
 *
 * @param {string} type      - 'words' / 'sentences' / 'all'
 * @param {number} batchSize - 1回の実行で処理する件数（デフォルト 50）
 * @returns {Object} { success, processed, remaining, errors }
 */
function bulkGenerateAudio(type, batchSize) {
  try {
    batchSize = batchSize || 50;
    var MAX_RUNTIME_MS = 4.5 * 60 * 1000; // 4.5分
    var startTime = Date.now();

    var githubToken = getScriptProperty('GITHUB_TOKEN');
    var githubBaseUrl = getScriptProperty('GITHUB_BASE_URL');
    var repo = parseGithubRepoFromUrl(githubBaseUrl);

    if (!repo || !githubToken) {
      return {
        success: false,
        processed: 0,
        remaining: 0,
        errors: ['GITHUB_TOKEN または GITHUB_BASE_URL が未設定です']
      };
    }

    var headers = {
      'Authorization': 'token ' + githubToken,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GAS-EnglishTest-TTS'
    };

    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);

    var processed = 0;
    var remaining = 0;
    var errors = [];

    var sheets = [];
    if (type === 'words' || type === 'all') {
      var wordSheet = ss.getSheetByName('英単語');
      if (wordSheet) sheets.push({ sheet: wordSheet, name: '英単語' });
    }
    if (type === 'sentences' || type === 'all') {
      var sentenceSheet = ss.getSheetByName('英文');
      if (sentenceSheet) sheets.push({ sheet: sentenceSheet, name: '英文' });
    }

    for (var s = 0; s < sheets.length; s++) {
      var sheetInfo = sheets[s];
      var sheet = sheetInfo.sheet;
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) continue;

      // id | english | pronunciation | japanese | audio
      var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var id       = row[0];
        var english  = row[1];
        var audio    = row[4];

        // ファイル名が設定されていない行はスキップ（先に fillMissingAudioFilenames を実行すること）
        if (!audio || String(audio).trim() === '') continue;
        if (!english || String(english).trim() === '') continue;

        // 処理上限チェック
        if (processed >= batchSize) { remaining++; continue; }
        if (Date.now() - startTime > MAX_RUNTIME_MS) { remaining++; continue; }

        var filename = String(audio).trim();

        // GitHub に既にファイルが存在する場合はスキップ
        if (checkAudioExistsOnGithub(filename, repo, headers)) {
          Logger.log('⏭️ スキップ（既存）: ' + filename);
          continue;
        }

        // TTS 生成・アップロード
        var base64Audio = callGoogleCloudTts(String(english).trim());
        if (base64Audio) {
          var uploaded = uploadAudioToGithub(filename, base64Audio);
          if (uploaded) {
            processed++;
            Logger.log('📌 一括生成 [' + processed + ']: ' + english + ' → ' + filename);
          } else {
            errors.push(sheetInfo.name + ' ID=' + id + ' (' + english + '): アップロード失敗');
          }
        } else {
          errors.push(sheetInfo.name + ' ID=' + id + ' (' + english + '): TTS生成失敗');
        }

        // レート制限回避のためリクエスト間に 0.5 秒の間隔を入れる
        Utilities.sleep(500);
      }
    }

    Logger.log('✅ bulkGenerateAudio 完了: 処理=' + processed + ', 残り=' + remaining + ', エラー=' + errors.length);
    return { success: true, processed: processed, remaining: remaining, errors: errors };
  } catch (e) {
    Logger.log('❌ bulkGenerateAudio エラー: ' + e);
    return { success: false, processed: 0, remaining: 0, errors: [e.toString()] };
  }
}
