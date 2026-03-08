/**
 * ============================================================
 * code_tts.js — Google Cloud TTS 音声生成・GitHub アップロード
 * ============================================================
 *
 * 必要な Script Properties:
 *   GOOGLE_CLOUD_TTS_API_KEY — Google Cloud TTS API キー
 *   GITHUB_TOKEN — GitHub Personal Access Token（repo スコープ）
 *   GITHUB_BASE_URL — 音声ファイルのベースURL（owner/repo の抽出に使用）
 */

// ────────────────────────────────────────────
// ファイル名生成
// ────────────────────────────────────────────

/**
 * 英語テキストから音声ファイル名を生成する
 * @param {string} englishText - 英語テキスト
 * @param {number} masterId - マスターID（衝突回避用）
 * @returns {string} ファイル名（例: "apple.mp3", "i_am_a_student.mp3"）
 */
function generateAudioFilename(englishText, masterId) {
  if (!englishText || !englishText.trim()) return '';

  var name = englishText.trim().toLowerCase();

  // スペース・記号をアンダースコアに変換（英数字とアンダースコア・ハイフン以外）
  name = name.replace(/[^a-z0-9_\-]/g, '_');

  // 連続するアンダースコアをまとめる
  name = name.replace(/_+/g, '_');

  // 先頭・末尾のアンダースコアを除去
  name = name.replace(/^_+|_+$/g, '');

  // 空になった場合はmasterIdのみ
  if (!name) {
    return 'word_' + masterId + '.mp3';
  }

  // 80文字で切り詰め
  if (name.length > 80) {
    name = name.substring(0, 80);
    // 途中で切れたアンダースコアを除去
    name = name.replace(/_+$/, '');
  }

  // 短い単語（1-2文字）はmasterIdを付加して衝突回避
  if (name.length <= 2) {
    name = name + '_' + masterId;
  }

  return name + '.mp3';
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

  // raw.githubusercontent.com/owner/repo/branch/... のパターン
  var match = githubBaseUrl.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return match[1] + '/' + match[2];
  }

  // github.com/owner/repo のパターン
  match = githubBaseUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return match[1] + '/' + match[2].replace(/\.git$/, '');
  }

  return null;
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
    var apiKey = getScriptProperty('GOOGLE_CLOUD_TTS_API_KEY');
    if (!apiKey) {
      Logger.log('⚠️ GOOGLE_CLOUD_TTS_API_KEY が未設定です');
      return null;
    }

    var url = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + apiKey;

    var payload = {
      input: { text: text },
      voice: {
        languageCode: 'en-US',
        ssmlGender: 'FEMALE'
      },
      audioConfig: {
        audioEncoding: 'MP3'
      }
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();

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
// GitHub へのアップロード
// ────────────────────────────────────────────

/**
 * GitHub Contents API を使って音声ファイルをアップロードする
 * @param {string} filename - ファイル名（例: "apple.mp3"）
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

    var firstChar = filename.charAt(0).toLowerCase();
    var filePath = 'sounds/' + firstChar + '/' + filename;
    var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/' + filePath;

    var headers = {
      'Authorization': 'token ' + githubToken,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GAS-EnglishTest-TTS'
    };

    // 既存ファイルのSHAを取得（上書き用）
    var existingSha = null;
    try {
      var getResponse = UrlFetchApp.fetch(apiUrl, {
        method: 'get',
        headers: headers,
        muteHttpExceptions: true
      });
      if (getResponse.getResponseCode() === 200) {
        var existingFile = JSON.parse(getResponse.getContentText());
        existingSha = existingFile.sha;
      }
    } catch (e) {
      // ファイルが存在しない場合は無視（新規作成）
    }

    // ファイルをアップロード（PUT）
    var putPayload = {
      message: 'Add TTS audio: ' + filename,
      content: base64Content
    };
    if (existingSha) {
      putPayload.sha = existingSha;
      putPayload.message = 'Update TTS audio: ' + filename;
    }

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
// オーケストレーション
// ────────────────────────────────────────────

/**
 * TTS音声を生成してGitHubにアップロードする
 * @param {string} englishText - 英語テキスト
 * @param {number} masterId - マスターID
 * @returns {string} 生成されたファイル名、失敗時は空文字
 */
function generateAndUploadAudio(englishText, masterId) {
  try {
    var filename = generateAudioFilename(englishText, masterId);
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
 * @param {number} masterId - マスターID
 * @param {string} englishText - 英語テキスト
 * @returns {Object} { success, audio, error }
 */
function regenerateAudio(masterId, englishText) {
  try {
    var filename = generateAndUploadAudio(englishText, masterId);
    if (!filename) {
      return { success: false, error: 'TTS生成またはアップロードに失敗しました' };
    }

    // マスターシートのaudio列を更新
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
// 一括生成
// ────────────────────────────────────────────

/**
 * 音声が未設定の単語・英文に対してTTS音声を一括生成する
 * @param {string} type - 'words' / 'sentences' / 'all'
 * @param {number} batchSize - 1回の実行で処理する件数（デフォルト50）
 * @returns {Object} { success, processed, remaining, errors }
 */
function bulkGenerateAudio(type, batchSize) {
  try {
    batchSize = batchSize || 50;
    var MAX_RUNTIME_MS = 4.5 * 60 * 1000; // 4.5分
    var startTime = Date.now();

    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);

    var processed = 0;
    var remaining = 0;
    var errors = [];

    // 処理対象のシートを収集
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

      // 全データを読み込み（id, english, pronunciation, japanese, audio）
      var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var id = row[0];
        var english = row[1];
        var audio = row[4];

        // 音声が既に設定されている場合はスキップ
        if (audio && String(audio).trim() !== '') continue;

        // 英語テキストがない場合はスキップ
        if (!english || String(english).trim() === '') continue;

        // 処理上限チェック
        if (processed >= batchSize) {
          // 残りをカウント
          remaining++;
          continue;
        }

        // タイムアウトチェック
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          remaining++;
          continue;
        }

        // TTS生成・アップロード
        var filename = generateAndUploadAudio(String(english).trim(), id);

        if (filename) {
          // シートに即座に書き込み
          sheet.getRange(i + 2, 5).setValue(filename);
          processed++;
          Logger.log('📌 一括生成 [' + processed + ']: ' + english + ' → ' + filename);
        } else {
          errors.push(sheetInfo.name + ' ID=' + id + ' (' + english + ')');
        }
      }
    }

    Logger.log('✅ 一括生成完了: 処理=' + processed + ', 残り=' + remaining + ', エラー=' + errors.length);

    return {
      success: true,
      processed: processed,
      remaining: remaining,
      errors: errors
    };

  } catch (e) {
    Logger.log('❌ bulkGenerateAudio エラー: ' + e);
    return { success: false, processed: 0, remaining: 0, errors: [e.toString()] };
  }
}
