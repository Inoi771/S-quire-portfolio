// ========================================
// 【S-quire - Google Apps Script】
// 個別指導スクエア向けダッシュボード バックエンド
// 更新: 2026-04-07
// バージョン: 1.0.3
// 最終更新: 2026年3月31日
// ========================================

// ========================================
// 【セクション1】定数・初期化
// ========================================
// スクリプトプロパティのキー定義とデフォルト設定

/**
 * スクリプトプロパティで使用するキー定数
 * Admin が設定画面から管理できる項目
 */
var PROP_KEYS = {
  GEMINI_API_KEY: 'GEMINI_API_KEY',           // AI機能用（Gemini API キー）
  APP_FOLDER_ID: 'APP_FOLDER_ID',             // Google Drive アプリフォルダID
  THEME_COLOR: 'THEME_COLOR',                 // UI テーマカラー
  ADMIN_EMAILS: 'ADMIN_EMAILS',               // Admin メール（カンマ区切り）
  HOLIDAY_CACHE: 'HOLIDAY_CACHE',             // 祝日キャッシュ（Googleカレンダーから取得・JSON）
  ACCESS_FOLDER_ID: 'ACCESS_FOLDER_ID',       // アクセス許可フォルダID（このフォルダの共有者がアプリ利用可能）
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',          // LINE Messaging API チャンネルアクセストークン
  LINE_SCHEDULER_SETTINGS: 'LINE_SCHEDULER_SETTINGS',                     // JSON: LINEスケジューラーの種別ごとデフォルト設定
  AI_KNOWLEDGE_BASE: 'AI_KNOWLEDGE_BASE',                                   // JSON: [{id, category, content, updatedAt}] AIナレッジベース
  LECTURE_DEADLINE_OVERRIDES: 'LECTURE_DEADLINE_OVERRIDES',                 // JSON: { "lectureId": "YYYY-MM-DD" } 講習日程締切の手動上書き設定
  // Firebase / Firestore 設定
  FIREBASE_PROJECT_ID: 'FIREBASE_PROJECT_ID',       // Firebase プロジェクトID（例: fir-quire）
  FIREBASE_CLIENT_EMAIL: 'FIREBASE_CLIENT_EMAIL',   // サービスアカウントのメールアドレス
  FIREBASE_PRIVATE_KEY: 'FIREBASE_PRIVATE_KEY',     // サービスアカウントの秘密鍵（PEM形式・GASエディタから直接入力）
  // Supabase 設定（成績データ用）
  SUPABASE_URL: 'SUPABASE_URL',                     // Supabase プロジェクトURL（例: https://xxxxx.supabase.co）
  SUPABASE_SERVICE_KEY: 'SUPABASE_SERVICE_KEY'      // Supabase service_role キー
};

/**
 * 成績管理用のマスター設定キー
 * テスト名、校舎、学年をグローバルで管理
 */
var CONFIG_PROP_KEYS = {
  TEST_NAMES_CONFIG: 'GRADES_TEST_NAMES_CONFIG',      // JSON: テスト名リスト
  CAMPUS_CODES_CONFIG: 'GRADES_CAMPUS_CODES_CONFIG',  // JSON: 校舎コード・名前
  GRADE_CODES_CONFIG: 'GRADES_GRADE_CODES_CONFIG',    // JSON: 学年コード・名前
  SCHOOL_CONFIG: 'GRADES_SCHOOL_CONFIG',              // JSON: [{name, departments:[]}]
  SIGMA_CONFIG:  'GRADES_SIGMA_CONFIG',                 // JSON: 成績分析の標準偏差設定
  PRICING_CONFIG: 'PRICING_TABLE_CONFIG',               // JSON: 料金表データ
  LECTURE_PERIODS_CONFIG: 'LECTURE_PERIODS_CONFIG',      // JSON: 講習期間設定 [{id, name, startDate, endDate}]
  LECTURE_PRICING_CONFIG: 'LECTURE_PRICING_CONFIG',      // JSON: 講習別料金設定 {typeId: [{label, internal, external}]}
  GRADE_VISIBLE_CONFIG: 'GRADES_VISIBLE_CONFIG',         // JSON: 表示する学年コードの配列（例: ["13","14","15"]）
  NORMAL_CLASS_CONFIG: 'NORMAL_CLASS_CONFIG',             // JSON: 通常授業設定 [{grade, duration, count, internal, external}]
  LECTURE_GREETINGS_CONFIG: 'LECTURE_GREETINGS_CONFIG'    // JSON: 講習別学年挨拶文 {typeId: {gradeKey: "挨拶文"}}
};

/**
 * デフォルトのテスト名（初期化時のみ使用）
 */
var TEST_NAMES = ['4月実力', '5月実力', '6月実力', '期末テスト', '実力テスト'];

/**
 * デフォルトの校舎マップ（初期化時のみ使用）
 * コードは01始まりの2桁数字
 */
var CAMPUSES = {
  '01': '校舎A',
  '02': '校舎B',
  '03': '校舎C'
};

/**
 * 学年マップ（固定値・アプリから変更不可）
 * コードはその学年の年齢（2桁）。生徒IDの一部として使用される
 * 小1=07, 小2=08, ..., 小6=12, 中1=13, 中2=14, 中3=15, 高1=16, 高2=17, 高3=18
 * 管理画面ではどの学年をドロップダウンに表示するかのみ設定可能（GRADES_VISIBLE_CONFIG）
 */
var GRADES = {
  '07': '小1',
  '08': '小2',
  '09': '小3',
  '10': '小4',
  '11': '小5',
  '12': '小6',
  '13': '中1',
  '14': '中2',
  '15': '中3',
  '16': '高1',
  '17': '高2',
  '18': '高3'
};

/**
 * 抽出対象の予定種類
 * 「スケジュール更新」で PDF から抽出される予定タイプ
 */
var EVENT_TYPES = [
  '定期テスト', '中間テスト', '期末テスト', '実力テスト', '基礎学力テスト',
  '体育祭', '文化祭', '修学旅行', '合唱コンクール',
  '卒業式', '入学式', '始業式', '終業式'
];

/**
 * HTMLテンプレートのインクルード用ヘルパー
 * index.html 内で <?!= include('filename') ?> として使用する
 * @param {string} filename 読み込むHTMLファイル名（拡張子なし）
 * @return {string} ファイルの内容（HTMLとして展開される）
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * JSON.parse の安全なラッパー。パース失敗時はデフォルト値を返す
 * @param {string} str パース対象の文字列
 * @param {*} defaultValue パース失敗時に返す値（デフォルト: null）
 * @return {*} パース結果またはデフォルト値
 */
function safeJsonParse_(str, defaultValue) {
  if (defaultValue === undefined) defaultValue = null;
  if (!str) return defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    Logger.log('⚠ JSON.parseエラー: ' + e + ' (入力先頭: ' + String(str).substring(0, 50) + ')');
    return defaultValue;
  }
}

// 【セクション3】Web APP エントリーポイント
// ========================================
// HTML UI の配信、アプリケーション初期化、ページタイトル設定

/**
 * Web App のエントリーポイント
 * ユーザーがアプリにアクセスしたときに最初に実行される
 * HTML ファイル（index.html）を返す
 * 
 * ⚠️ 注意：フォルダ・シート初期化は doGet() から削除
 * 理由：毎回のアクセスで 17秒程度のオーバーヘッドが発生
 * 解決策：時間トリガー（24時間ごと）で initializeAllSheets() を実行する
 * @return {HtmlOutput} index.html のコンテンツ
 */
function doGet() {
  try {
    // アクセス制限なし：URLを知っている全員がアクセス可能
    // 初回アクセス時の名前入力・TEACHER_IDマッピングはフロントエンド側で処理する
    var html = HtmlService.createTemplateFromFile('index').evaluate();

    // ブックマーク時にアプリ名「S-quire」が正しく表示されるよう setTitle で設定
    html.setTitle("S-quire");
    html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    return html;

  } catch (error) {
    Logger.log('❌ doGetエラー: ' + error);
    return HtmlService.createHtmlOutput('<p>エラーが発生しました: ' + error + '</p>');
  }
}

/**
 * LINE Messaging API の Webhook または Firebase Hosting からの API コールを受け取る
 * - body.type === 'gasApi': Firebase Hosting からの google.script.run 代替API呼び出し
 * - body.events が配列: LINE Webhook（メール自己登録フロー）
 * @param {Object} e GAS のイベントオブジェクト（e.postData.contents に JSON が入る）
 * @return {TextOutput} JSON レスポンス
 */
function doPost(e) {
  try {
    Logger.log('=== doPost 開始 ===');
    Logger.log('postData あり: ' + !!(e && e.postData));

    var body = safeJsonParse_(e.postData.contents, null);
    if (!body) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: '不正なリクエスト' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Firebase Hosting からの API コール
    if (body.type === 'gasApi') {
      return handleApiCall_(body);
    }

    var events = body.events || [];
    Logger.log('受信イベント数: ' + events.length);

    for (var i = 0; i < events.length; i++) {
      var event = events[i];
      Logger.log('イベント[' + i + '] type=' + event.type);

      if (event.type !== 'message') {
        Logger.log('→ message以外のイベントのためスキップ');
        continue;
      }
      if (!event.message || event.message.type !== 'text') {
        Logger.log('→ テキストメッセージ以外のためスキップ (messageType=' + (event.message ? event.message.type : 'なし') + ')');
        continue;
      }

      var lineUserId = event.source.userId;
      var rawText = (event.message.text || '').trim();
      var replyToken = event.replyToken;
      Logger.log('受信テキスト: "' + rawText + '"');
      Logger.log('LINE User ID: ' + lineUserId);
      Logger.log('replyToken あり: ' + !!replyToken);

      // 半角・全角スペースで分割し、メールアドレスと表示名を識別（順序不問）
      var parts = rawText.split(/[\s　]+/);
      var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      var emailPart = null;
      var nameParts = [];
      for (var j = 0; j < parts.length; j++) {
        var p = parts[j];
        if (!emailPart && emailPattern.test(p.toLowerCase())) {
          emailPart = p.toLowerCase();
        } else if (p) {
          nameParts.push(p);
        }
      }
      var text = emailPart;
      var displayName = nameParts.join(' ');
      var isEmail = !!text;
      Logger.log('メールアドレス判定: ' + isEmail + ' (email=' + text + ', name=' + displayName + ')');

      if (isEmail) {
        // Firestore staffs で重複チェック
        var existingStaff = firestoreQuery_('staffs', [fsFilter_('email', 'EQUAL', text)], 1);
        var dupEmail = existingStaff && existingStaff.length > 0;
        Logger.log('重複チェック: dupEmail=' + dupEmail);

        if (dupEmail) {
          // 既存スタッフなら lineUserId を更新
          var existStaff = existingStaff[0];
          if (existStaff.lineUserId === lineUserId) {
            sendLineMessage(lineUserId, '✅ すでに登録済みです。引き続きご利用ください。\n\nアプリURL:\nhttps://fir-quire.web.app\n\n⚠️ LINE内で開くとログインできない場合があります。その場合は上のURLをコピーして、ChromeやSafariなどのブラウザから開いてください。');
            Logger.log('⚠ LINE登録済みのため案内のみ: ' + text);
          } else {
            // lineUserId を更新
            existStaff.lineUserId = lineUserId;
            if (displayName && !existStaff.displayName) existStaff.displayName = displayName;
            if (displayName && !existStaff.name) existStaff.name = displayName;
            writeStaffToFirestore_(existStaff);
            var tid = existStaff.teacherId || existStaff._id;
            var replyMsg = '✅ LINE連携が完了しました！';
            if (displayName) replyMsg += '\n表示名: ' + (existStaff.displayName || displayName);
            replyMsg += '\n\nアプリURL:\nhttps://fir-quire.web.app';
            replyMsg += '\n\n⚠️ LINE内で開くとログインできない場合があります。その場合は上のURLをコピーして、ChromeやSafariなどのブラウザから開いてください。';
            sendLineMessage(lineUserId, replyMsg);
            Logger.log('✓ 既存スタッフの lineUserId を更新: ' + tid);
          }
        } else {
          // 新規スタッフを staffs に作成
          var teacherId = 'T' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          Logger.log('teacherId 発行: ' + teacherId);

          firestoreSet_('staffs', teacherId, {
            teacherId: teacherId,
            email: text,
            emails: [text],
            name: displayName || '',
            firebaseUid: null,
            firebaseUids: [],
            lineUserId: lineUserId,
            displayName: displayName || '',
            subjects: [],
            preferredCampuses: [],
            aiAssistantName: '',
            aiPersonality: '',
            themeColor: '',
            notificationMethod: 'gmail',
            notificationEmail: '',
            addedAt: new Date().toISOString()
          });
          Logger.log('✓ staffs に新規登録完了');

          // LINE User ID で直接プッシュ送信（replyToken の30秒制限を回避）
          var replyMsg = '✅ 登録が完了しました！';
          replyMsg += '\n\nアプリにアクセスしたら、左上のメニューから「設定」を開き、名前・担当教科・所属校舎を設定してください。';
          replyMsg += '\n\nアプリURL:\nhttps://fir-quire.web.app';
          replyMsg += '\n⚠️ LINE内で開くとログインできない場合があります。その場合は上のURLをコピーして、ChromeやSafariなどのブラウザから開いてください。';
          Logger.log('プッシュ送信開始...');
          var sent = sendLineMessage(lineUserId, replyMsg);
          Logger.log('sendLineMessage 結果: ' + sent);

          // 返信後に時間のかかる処理（Drive権限付与・管理者メール）を実行
          var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
          Logger.log('Driveフォルダ付与: folderId=' + (folderId || 'なし'));
          if (folderId) {
            try {
              DriveApp.getFolderById(folderId).addEditor(text);
              Logger.log('✓ Drive Editor 権限付与完了');
            } catch (folderErr) {
              Logger.log('⚠ doPost: addEditor 失敗: ' + folderErr);
            }
          }

          try {
            var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '').split(',').map(function(a) { return a.trim(); }).filter(Boolean);
            if (adminEmails.length > 0) {
              var adminBody = '以下のメールアドレスが LINE 経由で自己登録しました。\n\nメール: ' + text;
              if (displayName) adminBody += '\n表示名: ' + displayName;
              adminBody += '\n講師ID: ' + teacherId;
              adminBody += '\n\n不審な登録の場合は管理タブ → ユーザー管理から削除してください。';
              GmailApp.sendEmail(adminEmails[0], '[S-quire] 新しいスタッフが自己登録しました', adminBody);
              Logger.log('✓ 管理者通知メール送信完了');
            }
          } catch (mailErr) {
            Logger.log('⚠ doPost: 管理者通知メール送信失敗: ' + mailErr);
          }
        }
      } else {
        // メールアドレス以外のメッセージ → 未登録ユーザーにのみ案内を送信
        var knownStaff = firestoreQuery_('staffs', [fsFilter_('lineUserId', 'EQUAL', lineUserId)], 1);
        if (knownStaff && knownStaff.length > 0) {
          Logger.log('登録済みユーザーのため案内スキップ: ' + lineUserId);
        } else {
          Logger.log('未登録ユーザー → 案内メッセージを送信');
          sendLineMessage(lineUserId, '📧 登録するには、このアカウントにメールアドレスを送信してください。\n表示名も一緒に送ると管理画面に名前が表示されます。\n\n例（メールのみ）:\ntanaka@example.com\n\n例（表示名あり）:\ntanaka@example.com 田中花子\n田中花子 tanaka@example.com');
        }
      }
    }

    Logger.log('=== doPost 正常終了 ===');
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'OK' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('❌ doPostエラー: ' + error);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Firebase Hosting からの API コールを処理する（doPost 内部ヘルパー）
 * body: { type:'gasApi', function:string, args:Array, idToken:string }
 * @param {Object} body  パース済みリクエストボディ
 * @return {TextOutput}  JSON レスポンス
 */
function handleApiCall_(body) {
  try {
    var funcName = String(body.function || '');
    var args     = Array.isArray(body.args) ? body.args : [];
    var idToken  = String(body.idToken || '');
    Logger.log('=== API コール: ' + funcName + ' ===');

    // 末尾 _ の内部ヘルパーは呼び出し禁止
    if (!funcName || funcName.charAt(funcName.length - 1) === '_') {
      return ContentService
        .createTextOutput(JSON.stringify({ __gasError: '許可されていない関数です: ' + funcName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Firebase ID トークンを検証してユーザーコンテキストを設定
    if (idToken) {
      var authResult = verifyFirebaseIdToken_(idToken);
      if (authResult) {
        setFirebaseEmailContext_(authResult.email);
        if (authResult.uid) setFirebaseUidContext_(authResult.uid);
        Logger.log('✓ Firebase Auth 確認: ' + authResult.email + ' uid=' + (authResult.uid || ''));
      } else {
        Logger.log('⚠ Firebase トークン検証失敗 - 匿名として処理');
      }
    }

    // グローバルスコープから関数を取得して実行
    var fn = globalThis[funcName];
    if (typeof fn !== 'function') {
      return ContentService
        .createTextOutput(JSON.stringify({ __gasError: '関数が見つかりません: ' + funcName }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var result = fn.apply(null, args);
    Logger.log('✓ API コール完了: ' + funcName);

    // undefined は null に変換（JSON.stringify の安全対策）
    var jsonResult = result !== undefined ? result : null;
    return ContentService
      .createTextOutput(JSON.stringify(jsonResult))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('❌ handleApiCall_エラー (' + (body.function || '') + '): ' + error);
    return ContentService
      .createTextOutput(JSON.stringify({ __gasError: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web App のタイトルを取得（メタ情報用）
 * ブックマーク表示時に使用される情報を返す
 * @return {Object} { appName, version, description }
 */
function getAppMetadata() {
  return {
    appName: 'S-quire',
    version: '1.0.0',
    description: '教育機関向けダッシュボード',
    lastUpdated: new Date().toISOString()
  };
}

/**
 * APIエンドポイント疎通確認用（認証なしで呼べることを確認）
 * @return {Object} 疎通確認結果
 */
function testApiEndpoint() {
  return { ok: true, timestamp: new Date().toISOString() };
}

// ========================================
// テスト用エクスポート（GAS環境では無視される）
// ========================================
if (typeof module !== 'undefined') {
  module.exports = {
    PROP_KEYS: PROP_KEYS,
    CONFIG_PROP_KEYS: CONFIG_PROP_KEYS,
    TEST_NAMES: TEST_NAMES,
    CAMPUSES: CAMPUSES,
    GRADES: GRADES,
    EVENT_TYPES: EVENT_TYPES
  };
}
// 更新 2026-03-31
