
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
    DEPRECATED_KEYS.forEach(function(k) {
      try { deleteProperty_(k); } catch(e) {}
    });

    // Phase 5-E-5: Workers KV を一次ソースとして全プロパティを取得
    // （KV 失敗時は SP 直読にフォールバック・SP-only キーはユニオンで補完）
    var props = getAllProperties_();

    // GEMINI_TEAM_* はチーム全体使用量追跡の廃止機能 → プレフィックスで一括削除
    Object.keys(props).forEach(function(k) {
      if (k.indexOf('GEMINI_TEAM_') === 0) {
        try { deleteProperty_(k); } catch(e) {}
        delete props[k];
      }
    });

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
 * Phase 5-E-4 以降：getProperty / setProperty は auth.js 側で
 * getProperty_ / setProperty_ ラッパー経由に置換済みのため、本関数の書込は
 * Workers KV を一次ソースとして更新され、ScriptProperties にも Dual-write される。
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
 * Phase 5-E-4 以降：deleteProperty_ ラッパーで Workers KV と ScriptProperties の
 * 両方から削除される（Dual-delete）。
 * @param {string} key 削除するプロパティキー
 * @return {Object} { success, message, error }
 */
function deleteScriptPropertyFromGUI(key) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }

    deleteProperty_(key);

    logAdminAction('deleteScriptProperty', { key: key });
    
    return { success: true, message: 'プロパティを削除しました' };
    
  } catch (error) {
    Logger.log('❌ deleteScriptPropertyFromGUIエラー: ' + error);
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
    
    var response = fetchGeminiWithRetry_(url, {
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

    // Supabase停止防止（7日間アクセスなしで停止されるため毎日軽量クエリを実行）
    try {
      supabaseRpc_('get_grades_years');
      Logger.log('✓ Supabase keepalive OK');
    } catch(e) { Logger.log('⚠ Supabase keepalive: ' + e); }

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
    // bodyにRPM制限のキーワードが含まれる場合は一時的なレート制限
    var bodyLower = body.toLowerCase();
    var isRpmLimit = bodyLower.indexOf('per 1.0m') !== -1 ||
                     bodyLower.indexOf('per minute') !== -1 ||
                     bodyLower.indexOf('rate limit') !== -1;
    if (isRpmLimit) {
      return 'AIへのリクエストが集中しています。1〜2分ほどお待ちの上、再度お試しください。';
    }
    // それ以外（RPD制限または不明）は1日の利用上限として扱う
    var ptOff = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'Z');
    var resetHour = (ptOff === '-0700') ? 16 : 17;
    var nowHour = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'), 10);
    var when = nowHour >= resetHour ? '明日の' : '今日の';
    return 'AIの1日の利用上限に達しました。' + when + resetHour + ':00頃に制限が解除されます。';
  }
  if (code === 401) return 'Gemini APIキーが正しくありません。管理者に報告してご確認いただくようお願いします';
  if (code === 403) return 'Gemini APIキーに権限がありません。管理者に報告してご確認いただくようお願いします';
  if (code === 404) return 'AIモデルが見つかりません。管理者に報告してください';
  if (code >= 500) return 'Gemini API障害 (HTTP ' + code + '): ' + body.substring(0, 120) + '。しばらくお待ちください';
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

// ===== 【講師配置表】=====
//
// 年度別キー保存モデル（2027/04/01 以降の自動切替対応）：
//   ScriptProperties: STAFF_PLACEMENT_{fiscalYear} → { campuses, teachers, supervisors, year }
//   旧単一キー      : STAFF_PLACEMENT（初回読み込み時に現行年度キーへ移行）
//   アーカイブキー  : STAFF_PLACEMENT_ARCHIVE_{fiscalYear}（旧年度を退避）
//
// 表示年度は getCurrentFiscalYear()（4月起算）で決定。
// 1〜3月のみ、編集画面で翌年度の並行編集が可能。

/**
 * 講師配置：旧単一キー `STAFF_PLACEMENT` を現行年度キーへ移行する（1回限り）。
 * @private
 */
function _placementMigrateLegacyKey(currentFY) {
  try {
    var legacy = getProperty_('STAFF_PLACEMENT');
    if (!legacy) return;
    var currentKey = 'STAFF_PLACEMENT_' + currentFY;
    var existing = getProperty_(currentKey);
    if (!existing) {
      // 旧データ内の year を優先（無ければ currentFY を付与）
      try {
        var parsed = JSON.parse(legacy);
        if (!parsed.year) parsed.year = currentFY;
        setProperty_(currentKey, JSON.stringify(parsed));
      } catch (e) {
        setProperty_(currentKey, legacy);
      }
      Logger.log('✓ 講師配置: 旧 STAFF_PLACEMENT を ' + currentKey + ' へ移行');
    }
    deleteProperty_('STAFF_PLACEMENT');
    // インメモリキャッシュも無効化
    if (getScriptProperty._cache) {
      delete getScriptProperty._cache['STAFF_PLACEMENT'];
      delete getScriptProperty._cache[currentKey];
    }
  } catch (e) {
    Logger.log('❌ _placementMigrateLegacyKey エラー: ' + e);
  }
}

/**
 * 講師配置：旧年度（currentFY 未満）のキーを STAFF_PLACEMENT_ARCHIVE_{year} に退避し、元キーを削除する。
 * @private
 */
function _placementArchiveOldYears(currentFY) {
  try {
    // getKeys() は Workers 側に対応 API がないため ScriptProperties を直接参照。
    // Dual-write で SP も同期済みのため現役年度キーはすべてここから列挙できる。
    var keys = PropertiesService.getScriptProperties().getKeys();
    var re = /^STAFF_PLACEMENT_(\d{4})$/;
    keys.forEach(function(k) {
      var m = k.match(re);
      if (!m) return;
      var y = parseInt(m[1], 10);
      if (isNaN(y) || y >= currentFY) return;
      var archiveKey = 'STAFF_PLACEMENT_ARCHIVE_' + y;
      var val = getProperty_(k);
      if (val) {
        // 既存アーカイブを上書きしないよう、未設定のときのみコピー
        if (!getProperty_(archiveKey)) {
          setProperty_(archiveKey, val);
        }
      }
      // アーカイブ成功（または値無し）を確認してから現役キー削除
      deleteProperty_(k);
      if (getScriptProperty._cache) delete getScriptProperty._cache[k];
      Logger.log('✓ 講師配置: ' + y + '年度データを ' + archiveKey + ' に退避・現役キーを削除');
    });
  } catch (e) {
    Logger.log('❌ _placementArchiveOldYears エラー: ' + e);
  }
}

/**
 * 講師配置：編集可能な年度リストを返す。
 * - 常に現行年度
 * - 1〜3月は翌年度（来年度の準備期間）も含める
 * @private
 * @param {number} currentFY 現行年度
 * @returns {Array<{year:number, label:string, isNext:boolean}>}
 */
function _placementEditableYears(currentFY) {
  var list = [{ year: currentFY, label: currentFY + '年度（現行）', isNext: false }];
  var month = new Date().getMonth() + 1;
  if (month >= 1 && month <= 3) {
    list.push({ year: currentFY + 1, label: (currentFY + 1) + '年度（来年度）', isNext: true });
  }
  return list;
}

/**
 * 講師配置データを取得する（フロントエンド向け）
 * 現在は年度別キー（STAFF_PLACEMENT_{year}）で保存。引数なしなら現行年度。
 * 呼び出し時に (1) 旧単一キーの移行 (2) 旧年度データの自動アーカイブ を実施する。
 * @param {number=} requestedYear 取得したい年度（省略時は現行年度）
 */
function getStaffPlacementForWeb(requestedYear) {
  try {
    var currentFY = getCurrentFiscalYear();
    // (1) 旧単一キー移行（1回限り）
    _placementMigrateLegacyKey(currentFY);
    // (2) 旧年度データを自動アーカイブ
    _placementArchiveOldYears(currentFY);

    var editableYears = _placementEditableYears(currentFY);
    var year = (requestedYear && !isNaN(parseInt(requestedYear, 10))) ? parseInt(requestedYear, 10) : currentFY;
    // 閲覧表示は現行年度のみ許可（編集中の翌年度取得はフロントから明示指定）
    // ただし editableYears に含まれる年度なら許可
    var allowed = editableYears.some(function(e) { return e.year === year; });
    if (!allowed) year = currentFY;

    var key = 'STAFF_PLACEMENT_' + year;
    var json = getProperty_(key);
    var campusConfig = getCampusConfig() || {};
    // 校舎詳細（TEL/FAX/責任者）をデフォルト値として取得
    var campusDetails = getCampusDetailsConfig();
    var campusDetailsMap = {};
    campusDetails.forEach(function(c) { campusDetailsMap[c.code] = c; });
    // スタッフ一覧をSupabaseから取得（preferred_campuses/subjects含む）
    var staffRows = supabaseSelect_('staffs', null, { select: 'id,display_name,name,preferred_campuses,subjects' }) || [];
    var staffList = staffRows
      .map(function(r) { return { id: r.id, name: r.display_name || r.name || '', preferredCampuses: r.preferred_campuses || [], subjects: r.subjects || [] }; })
      .filter(function(s) { return s.name; })
      .sort(function(a, b) {
        // 配属設定あり（preferredCampuses）を上位に、同グループ内は五十音順
        var aHas = (a.preferredCampuses.length > 0) ? 0 : 1;
        var bHas = (b.preferredCampuses.length > 0) ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return a.name.localeCompare(b.name, 'ja');
      });
    var data = json ? JSON.parse(json) : null;
    // 保存済みデータの campuses に campus config のデフォルト値をマージ
    if (data && data.campuses) {
      Object.keys(data.campuses).forEach(function(code) {
        var def = campusDetailsMap[code] || {};
        var c = data.campuses[code];
        if (!c.tel && def.tel) c.tel = def.tel;
        if (!c.fax && def.fax) c.fax = def.fax;
        if (!c.principal && def.principal) c.principal = def.principal;
        if (!c.mobile && def.mobile) c.mobile = def.mobile;
      });
    }
    // year フィールドを確実に付与（表示ヘッダー・印刷で使用）
    if (data && !data.year) data.year = year;
    return {
      success: true,
      data: data,
      year: year,
      currentFiscalYear: currentFY,
      editableYears: editableYears,
      campusConfig: campusConfig,
      campusDetailsMap: campusDetailsMap,
      staffList: staffList
    };
  } catch (e) {
    Logger.log('❌ getStaffPlacementForWeb エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 講師配置データを保存する（管理者のみ）
 * @param {string} dataJson - JSON文字列（campuses/teachers/supervisors を含む）
 * @param {number=} year  - 保存先年度（省略時は現行年度）。編集可能年度のみ許可。
 */
function saveStaffPlacementForWeb(dataJson, year) {
  try {
    var email = getFirebaseEmailContext_();
    if (!isAdmin_(email)) return { success: false, error: '管理者のみ編集できます' };

    var currentFY = getCurrentFiscalYear();
    var editableYears = _placementEditableYears(currentFY);
    var targetYear = (year && !isNaN(parseInt(year, 10))) ? parseInt(year, 10) : currentFY;
    var allowed = editableYears.some(function(e) { return e.year === targetYear; });
    if (!allowed) {
      return { success: false, error: targetYear + '年度は現在編集できません（編集可能年度: ' + editableYears.map(function(e){return e.year;}).join(', ') + '）' };
    }

    // year フィールドを揃えて保存（互換のためデータ内にも保持）
    var toSave = dataJson;
    try {
      var parsed = JSON.parse(dataJson);
      parsed.year = targetYear;
      toSave = JSON.stringify(parsed);
    } catch (_) { /* JSON破損時はそのまま保存 */ }

    var key = 'STAFF_PLACEMENT_' + targetYear;
    setProperty_(key, toSave);
    if (getScriptProperty._cache) delete getScriptProperty._cache[key];
    Logger.log('✓ saveStaffPlacementForWeb: ' + key + ' を保存');
    return { success: true, year: targetYear };
  } catch (e) {
    Logger.log('❌ saveStaffPlacementForWeb エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 講師配置表に登録されている講師名一覧を返す（講習管理ドロップダウン用）
 * 現行年度のデータから取得する。
 * @returns {{ success: boolean, teachers: Array<{name: string, subject: string}> }}
 */
function getPlacementTeacherNames() {
  try {
    var currentFY = getCurrentFiscalYear();
    // 旧単一キーがまだ残っていれば移行（読み取り副作用を最小化するため try-catch で囲む）
    _placementMigrateLegacyKey(currentFY);
    var json = getProperty_('STAFF_PLACEMENT_' + currentFY);
    if (!json) return { success: true, teachers: [] };
    var data = JSON.parse(json);
    var teachers = (data.teachers || [])
      .map(function(t) { return { name: t.name || '', subject: t.subject || '' }; })
      .filter(function(t) { return t.name; });
    return { success: true, teachers: teachers };
  } catch (e) {
    Logger.log('❌ getPlacementTeacherNames エラー: ' + e);
    return { success: false, teachers: [], error: e.toString() };
  }
}
