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

/**
 * ヘテロニムの正確な発音を指定するための IPA マップ。
 * キー: ファイル名（拡張子なし）
 * 値: IPA 発音記号文字列（en-US-Neural2-F 向け）
 * SSML <phoneme> タグで使用し、TTS API に正確な発音を伝える。
 */
var HETERONYM_IPA_MAP = {
  'read':       'riːd',
  'read_past':  'rɛd',
  'lead':       'liːd',
  'lead_past':  'lɛd',
  'live':       'lɪv',
  'live_adj':   'laɪv',
  'tear':       'tɪr',
  'tear_verb':  'tɛr',
  'wound':      'wuːnd',
  'wound_verb': 'waʊnd',
  'bow':        'boʊ',
  'bow_verb':   'baʊ',
  'row':        'roʊ',
  'row_verb':   'raʊ',
  'sow':        'soʊ',
  'sow_noun':   'saʊ'
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

function isUrlFetchLimitError(e) {
  var msg = String(e).toLowerCase();
  return msg.indexOf('too many times') !== -1 || msg.indexOf('urlfetch') !== -1;
}

// ────────────────────────────────────────────
// 月間使用量の追跡・制限
// ────────────────────────────────────────────

/** 月間文字数の上限（Neural2/WaveNet音声の無料枠100万文字） */
var TTS_MONTHLY_CHAR_LIMIT = 1000000;

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
 * テキストの記号系クリーンアップ（角括弧処理を除く共通処理）
 *
 * プレースホルダー記号（～ … － ~ ...）は一旦すべてカンマに変換する。
 * これにより文中にあるものはポーズになり、先頭・末尾のものは後のトリムで除去される。
 *
 * 例:
 *   "～ times as ... as"  → "times as, as"  （中間の ... → カンマ＝ポーズ）
 *   "～, and so on"       → "and so on"     （先頭 ～ → トリムで除去）
 *   "kind(s) of"          → "kinds of"
 *
 * @param {string} t
 * @returns {string}
 */
function cleanupTtsText(t) {
  // プレースホルダー記号をカンマに変換（文中→ポーズ、先頭末尾→後でトリム）
  t = t.replace(/[～〜~]/g, ',');  // チルダ系
  t = t.replace(/－/g, ',');       // 全角ハイフン
  t = t.replace(/…/g, ',');        // 水平省略記号
  t = t.replace(/\.{2,}/g, ',');   // 連続ドット（..., ....）

  // 語尾括弧を展開
  t = t.replace(/\(s\)/gi, 's');   // kind(s) → kinds
  t = t.replace(/\(es\)/gi, 'es');
  t = t.replace(/\([^)]*\)/g, '');

  // カンマ前後のスペースを正規化し、連続カンマをひとつに
  t = t.replace(/\s*,\s*/g, ', ');
  t = t.replace(/(?:,\s*){2,}/g, ', ');

  // 先頭・末尾のカンマ・ハイフン・スペースを除去
  t = t.replace(/^[\-\s,]+/, '');
  t = t.replace(/[\-\s,]+$/, '');

  // 連続スペースを1つに
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/**
 * TTS に送る前に英語テキストを前処理する。
 * 日本語由来のプレースホルダー記号（～ … － 等）や接頭辞ハイフンを除去し、
 * Google Cloud TTS が正しく読み上げられる形に整える。
 *
 * 省略可能な語の表記がある場合は両方の読み方を生成する:
 *   角括弧:      "a [one] hundred"     → "a hundred, one hundred"
 *   独立括弧:    "It is said (that) ～" → "It is said, It is said that"
 *   ※ 語尾括弧: "kind(s)"             → "kinds"（両形式生成しない）
 *
 * その他の例:
 *   "～ times as ... as －" → "times as as"
 *   "-based"               → "based"
 *   "… kind(s) of ~"      → "kinds of"
 *
 * @param {string} text - 元の英語テキスト
 * @returns {string} 前処理後のテキスト（空文字の場合はTTSスキップ）
 */
function preprocessTextForTts(text) {
  if (!text) return '';

  // 独立した括弧（スペース or 文頭の後にある括弧）= 省略可能な語
  // 例: "said (that)" の (that) → 独立括弧
  // 例: "kind(s)"     の (s)   → 語尾括弧（対象外）
  var hasBrackets      = /\[[^\]]+\]/.test(text);
  var hasStandaloneParens = /(?:^|[\s,])\([^)]+\)/.test(text);

  if (hasBrackets || hasStandaloneParens) {
    // form1: 省略形（角括弧・独立括弧を除去）
    //   "a [one] hundred"     → "a hundred"
    //   "It is said (that) ～" → "It is said"
    var t1 = text
      .replace(/\[[^\]]*\]/g, '')               // [alt] を除去（前の語は残す）
      .replace(/(?:^|[\s,])\([^)]*\)/g, ' ');   // 独立 (...) を除去
    var form1 = cleanupTtsText(t1);

    // form2: 展開形（括弧を外してその内容を使う）
    //   "a [one] hundred"     → "one hundred"（直前語を角括弧内容で置換）
    //   "It is said (that) ～" → "It is said that"（括弧を外して内容を残す）
    var t2 = text
      .replace(/\S+\s*\[([^\]]+)\]/g, '$1')         // word [alt] → alt
      .replace(/(?:^|[\s,])\(([^)]+)\)/g, ' $1');   // 独立 (word) → word
    var form2 = cleanupTtsText(t2);

    if (form1 && form2 && form1 !== form2) {
      return form1 + ', ' + form2;
    }
    return form1 || form2;
  }

  return cleanupTtsText(text);
}

/**
 * Google Cloud TTS API を呼び出して音声を生成する
 * @param {string} text      - 読み上げるテキスト（前処理を自動適用）
 * @param {string} [ipa]     - IPA発音記号（ヘテロニム用、省略可）。指定時は SSML phoneme を使用
 * @returns {string|null} base64エンコードされた音声データ、失敗時は null
 */
function callGoogleCloudTts(text, ipa) {
  try {
    // TTS に送る前にプレースホルダー記号等を除去
    var cleanedText = preprocessTextForTts(text);
    if (!cleanedText) {
      Logger.log('⏭️ TTS スキップ（前処理後に空になりました）: ' + text);
      return null;
    }
    text = cleanedText;

    // 単独の "a" はアルファベット読み（エイ）になるのを防ぐため、
    // IPA未指定の場合はシュワー /ə/ を自動設定（冠詞として発音）
    if (!ipa && text.toLowerCase() === 'a') {
      ipa = 'ə';
    }

    if (!checkAndUpdateCharUsage(text)) return null;

    var apiKey = getScriptProperty('GOOGLE_CLOUD_TTS_API_KEY');
    if (!apiKey) {
      Logger.log('⚠️ GOOGLE_CLOUD_TTS_API_KEY が未設定です');
      return null;
    }

    // IPA が指定されている場合は SSML phoneme で正確な発音を指定する
    var inputPayload;
    if (ipa) {
      var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      inputPayload = { ssml: '<speak><phoneme alphabet="ipa" ph="' + ipa + '">' + escaped + '</phoneme></speak>' };
    } else {
      inputPayload = { text: text };
    }

    var url = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + apiKey;
    var payload = {
      input: inputPayload,
      voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
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
    if (isUrlFetchLimitError(e)) throw e;
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
      content: Utilities.base64Encode(Utilities.newBlob(' ').getBytes())  // 1バイトの空コンテンツ
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
    } catch (e) { if (isUrlFetchLimitError(e)) throw e; /* 新規の場合は無視 */ }

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
    if (isUrlFetchLimitError(e)) throw e;
    Logger.log('❌ GitHub アップロードエラー: ' + e);
    return false;
  }
}

// ────────────────────────────────────────────
// GitHub 上のファイル存在確認
// ────────────────────────────────────────────

/**
 * GitHub audio/ フォルダ以下の全ファイル名を一括取得する（Git Trees API）
 * 1回のAPIコールで完結するため、個別チェックより大幅に高速。
 * @param {string} repo    - "owner/repo" 形式
 * @param {Object} headers - GitHub API 認証ヘッダー
 * @returns {Object|null}  { filename: true } のマップ、失敗時は null（フォールバック用）
 */
function fetchExistingAudioFilesFromGithub(repo, headers) {
  try {
    var treeUrl = 'https://api.github.com/repos/' + repo + '/git/trees/HEAD?recursive=1';
    var response = UrlFetchApp.fetch(treeUrl, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('⚠️ GitHub Tree API エラー: ' + response.getResponseCode());
      return { map: {}, complete: false };
    }

    var treeData = JSON.parse(response.getContentText());
    var existingFiles = {};

    if (treeData.tree) {
      treeData.tree.forEach(function(item) {
        if (item.type === 'blob' && item.path.indexOf('audio/') === 0) {
          var parts = item.path.split('/');
          if (parts.length >= 3) {
            existingFiles[parts[parts.length - 1]] = true;
          }
        }
      });
    }

    if (treeData.truncated) {
      // truncated でも部分マップを返す（マップに含まれるファイルは確実にスキップ可能）
      // マップに含まれないファイルのみ個別チェックにフォールバック
      Logger.log('⚠️ Tree API: truncated=true。部分マップ（' + Object.keys(existingFiles).length + ' 件）を使用。残りは個別チェック');
      return { map: existingFiles, complete: false };
    }

    Logger.log('📋 既存音声ファイル数（一括取得・完全）: ' + Object.keys(existingFiles).length);
    return { map: existingFiles, complete: true };
  } catch (e) {
    if (isUrlFetchLimitError(e)) throw e;
    Logger.log('⚠️ fetchExistingAudioFilesFromGithub エラー: ' + e);
    return { map: {}, complete: false };
  }
}

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
    if (isUrlFetchLimitError(e)) throw e;
    return false;
  }
}

/**
 * マスターシート（英単語・英文）で指定ファイル名を参照している行数を返す
 * @param {string} filename - 確認するファイル名（例: "man.mp3"）
 * @param {number} excludeId - チェック対象外のID（更新元の行自身）
 * @returns {number} 参照件数
 */
function countAudioReferences(filename, excludeId) {
  try {
    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);
    var count = 0;
    var sheetNames = ['英単語', '英文'];

    sheetNames.forEach(function(name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) return;
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;
      var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      data.forEach(function(row) {
        var id = row[0] ? parseInt(row[0]) : null;
        if (id === excludeId) return; // 更新元の行は除外
        if (String(row[4] || '').trim() === filename) count++;
      });
    });

    return count;
  } catch (e) {
    Logger.log('⚠️ countAudioReferences エラー: ' + e);
    return 1; // エラー時は安全側（削除しない）
  }
}

/**
 * GitHub の audio/{firstChar}/{filename} を削除する
 * ファイルの SHA を取得してから DELETE リクエストを送る
 * @param {string} filename - 削除するファイル名
 * @param {string} repo     - "owner/repo" 形式
 * @param {Object} headers  - GitHub API 認証ヘッダー
 * @returns {boolean} 削除成功なら true
 */
function deleteAudioFromGithub(filename, repo, headers) {
  try {
    var firstChar = filename.charAt(0).toLowerCase();
    var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/audio/' + firstChar + '/' + filename;

    // まず SHA を取得
    var getResp = UrlFetchApp.fetch(apiUrl, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });
    if (getResp.getResponseCode() !== 200) {
      Logger.log('⚠️ 削除対象ファイルが見つかりません: ' + filename);
      return false;
    }
    var sha = JSON.parse(getResp.getContentText()).sha;

    // DELETE リクエスト
    var deleteResp = UrlFetchApp.fetch(apiUrl, {
      method: 'delete',
      headers: headers,
      payload: JSON.stringify({
        message: 'Remove unused audio: ' + filename,
        sha: sha
      }),
      contentType: 'application/json',
      muteHttpExceptions: true
    });

    if (deleteResp.getResponseCode() === 200 || deleteResp.getResponseCode() === 204) {
      Logger.log('🗑️ 未参照音声を削除: ' + filename);
      return true;
    } else {
      Logger.log('⚠️ 音声削除失敗 (' + deleteResp.getResponseCode() + '): ' + filename);
      return false;
    }
  } catch (e) {
    Logger.log('⚠️ deleteAudioFromGithub エラー: ' + e);
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

    // ヘテロニムの場合はファイル名（拡張子なし）で IPA を検索し、正確な発音を指定する
    var baseName = filename.replace(/\.mp3$/, '');
    var ipa = HETERONYM_IPA_MAP[baseName] || null;

    var base64Audio = callGoogleCloudTts(englishText, ipa);
    if (!base64Audio) return '';

    var uploaded = uploadAudioToGithub(filename, base64Audio);
    if (!uploaded) return '';

    Logger.log('✅ TTS音声生成完了: ' + englishText + (ipa ? ' [IPA: /' + ipa + '/]' : '') + ' → ' + filename);
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
function bulkGenerateAudio(type, batchSize, cumulativeProcessed, startIndex, cumulativeSkipped) {
  var cache = CacheService.getScriptCache();
  var progressKey = 'TTS_PROGRESS';

  try {
    batchSize = batchSize || 50;
    cumulativeProcessed = cumulativeProcessed || 0;
    startIndex = startIndex || 0; // どの行から再開するか（前バッチの続き）
    cumulativeSkipped = cumulativeSkipped || 0; // 前バッチまでの累積スキップ数
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

    // 既存ファイルを一括取得（truncated時は部分マップ+個別チェックのハイブリッド）
    var audioFileResult = fetchExistingAudioFilesFromGithub(repo, headers);
    var existingAudioMap = audioFileResult.map;
    var mapComplete = audioFileResult.complete;
    Logger.log(mapComplete ? '✅ 一括ファイルリスト取得成功（完全）' : '⚠️ 部分マップ取得（ハイブリッドモード）: ' + Object.keys(existingAudioMap).length + ' 件');

    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);

    var processed = 0;
    var skippedCount = 0;
    var remaining = 0;
    var nextStartIndex = startIndex; // 次バッチの開始位置
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

    // 初期進捗をキャッシュに書き込み
    cache.put(progressKey, JSON.stringify({
      status: 'running',
      processed: cumulativeProcessed,
      skipped: cumulativeSkipped,
      errors: 0,
      currentItem: ''
    }), 600);

    var absoluteIndex = 0; // シート全体を通じた行の絶対インデックス

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

        absoluteIndex++;

        // 前バッチで処理済みの行はスキップ（無限ループ防止）
        if (absoluteIndex <= startIndex) continue;

        // 処理上限チェック（生成件数上限）
        if (processed >= batchSize) { if (remaining === 0) nextStartIndex = absoluteIndex - 1; remaining++; continue; }
        // 実行時間上限チェック
        if (Date.now() - startTime > MAX_RUNTIME_MS) { if (remaining === 0) nextStartIndex = absoluteIndex - 1; remaining++; continue; }

        var filename = String(audio).trim();

        // GitHub ファイル存在確認
        // - マップに含まれる → 確実に存在 → スキップ
        // - マップに含まれないかつマップ完全 → 存在しない → 生成
        // - マップに含まれないかつマップ不完全（truncated） → 個別チェック
        var fileExists;
        if (existingAudioMap[filename] === true) {
          fileExists = true;
        } else if (mapComplete) {
          fileExists = false;
        } else {
          fileExists = checkAudioExistsOnGithub(filename, repo, headers);
        }

        if (fileExists) {
          Logger.log('⏭️ スキップ（既存）: ' + filename);
          skippedCount++;
          cache.put(progressKey, JSON.stringify({
            status: 'running',
            processed: cumulativeProcessed + processed,
            skipped: cumulativeSkipped + skippedCount,
            errors: errors.length
          }), 600);
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

        // 進捗をキャッシュに更新
        cache.put(progressKey, JSON.stringify({
          status: 'running',
          processed: cumulativeProcessed + processed,
          skipped: skippedCount,
          errors: errors.length,
          currentItem: String(english).trim()
        }), 600);

        // レート制限回避のためリクエスト間に 0.5 秒の間隔を入れる
        Utilities.sleep(500);
      }
    }

    // 完了状態をキャッシュに書き込み
    cache.put(progressKey, JSON.stringify({
      status: 'complete',
      processed: cumulativeProcessed + processed,
      skipped: skippedCount,
      errors: errors.length,
      currentItem: ''
    }), 60);

    Logger.log('✅ bulkGenerateAudio 完了: 処理=' + processed + ', スキップ=' + skippedCount + ', 残り=' + remaining + ', 次開始=' + nextStartIndex + ', エラー=' + errors.length);
    return { success: true, processed: processed, skipped: skippedCount, remaining: remaining, nextStartIndex: nextStartIndex, errors: errors };
  } catch (e) {
    Logger.log('❌ bulkGenerateAudio エラー: ' + e);
    var urlLimit = isUrlFetchLimitError(e);
    cache.put(progressKey, JSON.stringify({
      status: urlLimit ? 'url_limit' : 'error',
      processed: cumulativeProcessed + processed,
      skipped: cumulativeSkipped + skippedCount,
      errors: (errors || []).length + 1,
      currentItem: ''
    }), 60);
    return { success: false, urlLimitReached: urlLimit, processed: 0, remaining: 0, errors: [e.toString()] };
  }
}

/**
 * 音声生成対象のアイテム数をカウントする（english と audio が両方設定済みの行）
 */
function countAudioItems(type) {
  try {
    var englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    var ss = SpreadsheetApp.openById(englishwordsSheetId);
    var total = 0;
    var sheets = [];
    if (type === 'words' || type === 'all') {
      var ws = ss.getSheetByName('英単語');
      if (ws) sheets.push(ws);
    }
    if (type === 'sentences' || type === 'all') {
      var ss2 = ss.getSheetByName('英文');
      if (ss2) sheets.push(ss2);
    }
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) continue;
      var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      for (var i = 0; i < data.length; i++) {
        var english = data[i][1];
        var audio = data[i][4];
        if (english && String(english).trim() !== '' &&
            audio && String(audio).trim() !== '') {
          total++;
        }
      }
    }
    return { success: true, total: total };
  } catch (e) {
    Logger.log('❌ countAudioItems エラー: ' + e);
    return { success: false, total: 0, error: e.toString() };
  }
}

/**
 * 音声生成の進捗状況をキャッシュから取得する（ポーリング用軽量関数）
 */
function getAudioGenerationProgress() {
  var cache = CacheService.getScriptCache();
  var data = cache.get('TTS_PROGRESS');
  if (!data) return null;
  return JSON.parse(data);
}
