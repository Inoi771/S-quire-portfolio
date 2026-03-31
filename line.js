// ========================================
// 【セクション15】LINE通知・お問い合わせ通知機能
// ========================================
// LINE Messaging API と Gmail を使った通知送信・通知設定管理
// すべてのデータは teacherId をキーに管理される

/**
 * 現在ログイン中のユーザーの teacherId を取得する内部ヘルパー
 * UserProperties の TEACHER_ID を優先し、なければ TEACHER_ID_MAP から逆引き
 * @return {string} teacherId
 */
function getCurrentTeacherId_() {
  var tid = getUserProperty('TEACHER_ID');
  if (tid) return tid;
  // フォールバック: TEACHER_ID_MAP からメールで逆引き
  var email = getCurrentUserEmail().toLowerCase();
  return getOrCreateTeacherIdForEmail_(email, '');
}

/**
 * teacherId からメールアドレスを逆引きする内部ヘルパー
 * NOTIFICATION_EMAILS に個別設定があればそちらを優先し、なければ TEACHER_ID_MAP の先頭メールを返す
 * @param {string} teacherId 講師ID
 * @return {string} メールアドレス（見つからない場合は空文字）
 */
function getEmailByTeacherId_(teacherId) {
  if (!teacherId) return '';
  // 通知専用メールが設定されている場合はそちらを優先
  var notifEmails = safeJsonParse_(getProperty(PROP_KEYS.NOTIFICATION_EMAILS), {});
  if (notifEmails[teacherId]) return notifEmails[teacherId];
  // TEACHER_ID_MAP から先頭メールを返す（新フォーマット: emails[]、旧フォーマット: email）
  var map = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
  var entry = normalizeTeacherEntry_(map[teacherId]);
  return entry.emails.length > 0 ? entry.emails[0] : '';
}

/**
 * LINE の replyToken を使って返信メッセージを送信（内部ヘルパー）
 * doPost() 内からのみ呼び出す。replyToken は1回限り有効。
 * @param {string} replyToken LINE の返信トークン
 * @param {string} message 送信するメッセージ
 * @return {boolean} 送信成功かどうか
 */
function sendLineReply_(replyToken, message) {
  try {
    var token = getProperty(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
    if (!token) {
      Logger.log('⚠ LINE_CHANNEL_ACCESS_TOKEN が未設定のため返信スキップ');
      return false;
    }

    var url = 'https://api.line.me/v2/bot/message/reply';
    var payload = {
      replyToken: replyToken,
      messages: [{ type: 'text', text: message }]
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('⚠ LINE返信失敗: ' + response.getResponseCode() + ' ' + response.getContentText());
      return false;
    }

    return true;

  } catch (error) {
    Logger.log('❌ sendLineReply_エラー: ' + error);
    return false;
  }
}

/**
 * LINE の userId を指定してプッシュメッセージを送信
 * @param {string} lineUserId LINE ユーザーID（"U" で始まる文字列）
 * @param {string} message 送信するメッセージ本文
 * @return {boolean} 送信成功かどうか
 */
function sendLineMessage(lineUserId, message) {
  try {
    var token = getProperty(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
    if (!token) {
      Logger.log('⚠ LINE_CHANNEL_ACCESS_TOKEN が未設定のため送信スキップ');
      return false;
    }
    if (!lineUserId) {
      Logger.log('⚠ lineUserId が空のため送信スキップ');
      return false;
    }

    var url = 'https://api.line.me/v2/bot/message/push';
    var payload = {
      to: lineUserId,
      messages: [{ type: 'text', text: message }]
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('⚠ LINEプッシュ失敗: ' + response.getResponseCode() + ' ' + response.getContentText());
      return false;
    }

    return true;

  } catch (error) {
    Logger.log('❌ sendLineMessageエラー: ' + error);
    return false;
  }
}

/**
 * 指定 teacherId の講師へ通知を送信する（Gmail / LINE / 両方を自動判定）
 * 通知対象者の設定に応じて送信先を切り替える。
 * @aiCallable
 * @param {string} teacherId 送信先の講師ID
 * @param {string} subject メール件名（Gmail 送信時に使用）
 * @param {string} body メッセージ本文（Gmail・LINE 共通）
 * @return {Object} { success, sentGmail, sentLine, error }
 */
function sendNotification(teacherId, subject, body) {
  try {
    teacherId = (teacherId || '').trim();
    if (!teacherId) return { success: false, error: '送信先の講師IDが空です' };

    // teacherId からメールアドレスを取得
    var toEmail = getEmailByTeacherId_(teacherId);

    // 通知方法を取得（teacherId をキーに）
    var methodsRaw = getProperty(PROP_KEYS.NOTIFICATION_METHODS);
    var methods = methodsRaw ? JSON.parse(methodsRaw) : {};
    var method = methods[teacherId] || 'gmail'; // デフォルトは Gmail

    if (method === 'none') {
      Logger.log('⚠ sendNotification: ' + teacherId + ' は通知オフ設定');
      return { success: true, sentGmail: false, sentLine: false };
    }

    var sentGmail = false;
    var sentLine = false;

    // Gmail 送信
    if (method === 'gmail' || method === 'both') {
      if (toEmail) {
        try {
          MailApp.sendEmail(toEmail, subject, body);
          sentGmail = true;
        } catch (mailError) {
          Logger.log('❌ Gmail送信失敗: ' + mailError);
        }
      } else {
        Logger.log('⚠ メールアドレス未登録: ' + teacherId);
      }
    }

    // LINE 送信
    if (method === 'line' || method === 'both') {
      var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
      var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
      var lineUserId = mapping[teacherId];
      if (lineUserId) {
        sentLine = sendLineMessage(lineUserId, subject + '\n\n' + body);
      } else {
        Logger.log('⚠ LINE User ID 未登録: ' + teacherId);
      }
    }

    return { success: true, sentGmail: sentGmail, sentLine: sentLine };

  } catch (error) {
    Logger.log('❌ sendNotificationエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在ログイン中のユーザーの通知設定を取得
 * 設定タブの通知設定セクション表示用
 * @aiCallable
 * @return {Object} { isEligible, method, lineRegistered, lineUserIdMasked }
 */
function getNotificationSettings() {
  try {
    var teacherId = getCurrentTeacherId_();
    var email = getCurrentUserEmail().toLowerCase();

    // 通知振り分け設定に含まれているか（= 通知設定を表示するか）
    var routingRaw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    var routingMap = routingRaw ? JSON.parse(routingRaw) : {};
    var isEligible = Object.keys(routingMap).some(function(code) {
      var arr = routingMap[code] || [];
      return arr.indexOf(teacherId) !== -1;
    });

    // 通知方法（teacherId をキーに取得）
    var methodsRaw = getProperty(PROP_KEYS.NOTIFICATION_METHODS);
    var methods = methodsRaw ? JSON.parse(methodsRaw) : {};
    var method = methods[teacherId] || 'gmail';

    // LINE User ID 登録状態（teacherId をキーに取得）
    var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
    var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
    var lineUserId = mapping[teacherId] || '';
    var lineRegistered = !!lineUserId;
    var lineUserIdMasked = lineRegistered ? '****' + lineUserId.slice(-4) : '';

    // 登録メールアドレス（LINE登録ガイドのヒント表示用）
    var registeredEmail = '';
    try {
      registeredEmail = getUserProperty('REGISTERED_EMAIL') || email;
    } catch (e) {
      registeredEmail = email;
    }

    // 講師の全登録メールリスト（Gmail通知先選択用）
    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
    var teacherEntry = normalizeTeacherEntry_(teacherMap[teacherId]);
    var emails = teacherEntry.emails.length > 0 ? teacherEntry.emails : (email ? [email] : []);

    // 現在の通知先メール（NOTIFICATION_EMAILS に保存済みの個別設定）
    var notifEmails = safeJsonParse_(getProperty(PROP_KEYS.NOTIFICATION_EMAILS), {});
    var notificationEmail = notifEmails[teacherId] || (emails.length > 0 ? emails[0] : '');

    return {
      success: true,
      isEligible: isEligible,
      method: method,
      lineRegistered: lineRegistered,
      lineUserIdMasked: lineUserIdMasked,
      registeredEmail: registeredEmail,
      emails: emails,
      notificationEmail: notificationEmail
    };

  } catch (error) {
    Logger.log('❌ getNotificationSettingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在ログイン中のユーザーの通知方法を更新
 * @aiCallable
 * @param {string} method "gmail" / "line" / "both" / "none"
 * @param {string} [notificationEmail] Gmail通知先メールアドレス（省略可）
 * @return {Object} { success, message, error }
 */
function updateNotificationSettings(method, notificationEmail) {
  try {
    var validMethods = ['gmail', 'line', 'both', 'none'];
    if (validMethods.indexOf(method) === -1) {
      return { success: false, error: '無効な通知方法です: ' + method };
    }

    var teacherId = getCurrentTeacherId_();

    // 通知振り分け設定に含まれているか確認
    var routingRaw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    var routingMap = routingRaw ? JSON.parse(routingRaw) : {};
    var isEligible = Object.keys(routingMap).some(function(code) {
      var arr = routingMap[code] || [];
      return arr.indexOf(teacherId) !== -1;
    });
    if (!isEligible) {
      return { success: false, error: 'このアカウントは通知設定の対象ではありません' };
    }

    // 通知方法を保存（teacherId をキーに）
    var methodsRaw = getProperty(PROP_KEYS.NOTIFICATION_METHODS);
    var methods = methodsRaw ? JSON.parse(methodsRaw) : {};
    methods[teacherId] = method;
    setProperty(PROP_KEYS.NOTIFICATION_METHODS, JSON.stringify(methods));

    // Gmail通知先メールアドレスを保存（指定があれば）
    if (notificationEmail && (method === 'gmail' || method === 'both')) {
      var notifEmails = safeJsonParse_(getProperty(PROP_KEYS.NOTIFICATION_EMAILS), {});
      notifEmails[teacherId] = notificationEmail.toLowerCase();
      setProperty(PROP_KEYS.NOTIFICATION_EMAILS, JSON.stringify(notifEmails));
    }

    var methodLabel = { gmail: 'Gmailのみ', line: 'LINEのみ', both: 'Gmail + LINE 両方', none: '通知しない' };
    return { success: true, message: '通知方法を「' + (methodLabel[method] || method) + '」に変更しました' };

  } catch (error) {
    Logger.log('❌ updateNotificationSettingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在ユーザーのLINEスケジューラー通知方法設定を種別ごとに取得する
 * @aiCallable
 * @return {Object} { success, lineRegistered, prefs: {meeting,report,shitsucho}, eligible: {meeting,report,shitsucho} }
 */
function getLineSchedulerNotifPrefs() {
  try {
    var teacherId = getCurrentTeacherId_();
    var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
    var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
    var lineRegistered = !!mapping[teacherId];

    // 宛先はシートから読む（管理タブの保存先がシートのため LINE_SCHEDULER_SETTINGS は不正確）
    var shitsuchoRecipients = getShitsuchoRecipientsFromSheet_();
    var isShitsuchoRecipient = shitsuchoRecipients.indexOf(teacherId) >= 0;

    var eligible = {
      meeting: lineRegistered,
      report: lineRegistered,
      shitsucho: isShitsuchoRecipient
    };

    var prefsRaw = getProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS);
    var allPrefs = prefsRaw ? JSON.parse(prefsRaw) : {};
    var myPrefs = allPrefs[teacherId] || {};
    var prefs = {
      meeting: myPrefs.meeting || 'line',
      report: myPrefs.report || 'line',
      shitsucho: myPrefs.shitsucho || 'line'
    };

    return { success: true, lineRegistered: lineRegistered, prefs: prefs, eligible: eligible };
  } catch (error) {
    Logger.log('❌ getLineSchedulerNotifPrefs エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在ユーザーのLINEスケジューラー通知方法を種別ごとに更新する
 * @aiCallable
 * @param {string} type 種別 ('meeting'/'report'/'shitsucho')
 * @param {string} method 通知方法 ('line'/'gmail'/'both'/'none')
 * @return {Object} { success, message }
 */
function updateLineSchedulerNotifPref(type, method) {
  try {
    var validTypes = ['meeting', 'report', 'shitsucho'];
    var validMethods = ['line', 'gmail', 'both', 'none'];
    if (validTypes.indexOf(type) === -1) return { success: false, error: '無効な種別: ' + type };
    if (validMethods.indexOf(method) === -1) return { success: false, error: '無効な通知方法: ' + method };
    var teacherId = getCurrentTeacherId_();
    var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
    var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
    var lineRegistered = !!mapping[teacherId];
    if (type === 'meeting' || type === 'report') {
      if (!lineRegistered) return { success: false, error: 'LINE未登録のため設定できません' };
    } else if (type === 'shitsucho') {
      var shitsuchoRecipients = getShitsuchoRecipientsFromSheet_();
      if (shitsuchoRecipients.indexOf(teacherId) < 0) return { success: false, error: '設定権限がありません' };
    }
    var prefsRaw = getProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS);
    var allPrefs = prefsRaw ? JSON.parse(prefsRaw) : {};
    if (!allPrefs[teacherId]) allPrefs[teacherId] = {};
    allPrefs[teacherId][type] = method;
    setProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS, JSON.stringify(allPrefs));
    var methodLabel = { line: 'LINEのみ', gmail: 'メールのみ', both: 'LINE+メール両方', none: '通知しない' };
    return { success: true, message: (methodLabel[method] || method) + 'に変更しました' };
  } catch (error) {
    Logger.log('❌ updateLineSchedulerNotifPref エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 通知振り分け設定に含まれる全講師の情報を取得（Admin のみ）
 * 各講師のメール・表示名・通知方法・LINE登録状態を返す
 * @return {Object} { success, members }
 */
function getNotificationMembers() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var routingRaw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    var routingMap = routingRaw ? JSON.parse(routingRaw) : {};
    var methodsRaw = getProperty(PROP_KEYS.NOTIFICATION_METHODS);
    var methods = methodsRaw ? JSON.parse(methodsRaw) : {};
    var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
    var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});

    // 振り分け設定内の全 teacherId をユニークに収集
    var allIds = {};
    Object.keys(routingMap).forEach(function(code) {
      (routingMap[code] || []).forEach(function(tid) { allIds[tid] = true; });
    });

    var result = Object.keys(allIds).map(function(tid) {
      var info = teacherMap[tid] || {};
      return {
        teacherId: tid,
        email: info.email || '',
        name: info.name || '',
        method: methods[tid] || 'gmail',
        lineRegistered: !!mapping[tid]
      };
    });

    return { success: true, members: result };

  } catch (error) {
    Logger.log('❌ getNotificationMembersエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * LINE User ID のマッピング一覧を取得（Admin のみ・デバッグ・確認用）
 * teacherId → LINE User ID のマッピングを返す
 * @return {Object} { success, mapping }
 */
function getLineUserMapping() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
    var mapping = raw ? JSON.parse(raw) : {};
    return { success: true, mapping: mapping };
  } catch (error) {
    Logger.log('❌ getLineUserMappingエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * LINE 経由で自己登録済みのユーザー一覧を取得する（Admin専用）
 * 通知振り分け設定UIのドロップダウン用
 * @return {Object} { success, users: [{teacherId, email, name, method, lineRegistered}] }
 */
function getLineRegisteredUsers() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
    var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
    var methodsRaw = getProperty(PROP_KEYS.NOTIFICATION_METHODS);
    var methods = methodsRaw ? JSON.parse(methodsRaw) : {};
    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});

    // 現在アクセス権があるユーザーのメールを収集
    var allowedEmails = {};
    var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (folderId) {
      var folder = DriveApp.getFolderById(folderId);
      var owner = folder.getOwner();
      if (owner) allowedEmails[owner.getEmail().toLowerCase()] = true;
      var editors = folder.getEditors();
      for (var i = 0; i < editors.length; i++) {
        allowedEmails[editors[i].getEmail().toLowerCase()] = true;
      }
      var adminRaw = getProperty(PROP_KEYS.ADMIN_EMAILS) || '';
      adminRaw.split(',').forEach(function(e) {
        e = e.trim().toLowerCase();
        if (e) allowedEmails[e] = true;
      });
    }

    // TEACHER_ID_MAP ベースでイテレート（LINE未登録ユーザーも候補に含める）
    var users = Object.keys(teacherMap)
      .filter(function(tid) {
        if (!folderId) return true;
        var entry = normalizeTeacherEntry_(teacherMap[tid] || {});
        return entry.emails.some(function(e) { return allowedEmails[e]; });
      })
      .map(function(tid) {
        var entry = normalizeTeacherEntry_(teacherMap[tid] || {});
        return {
          teacherId: tid,
          email: entry.emails[0] || '',
          name: entry.name || '',
          method: methods[tid] || 'gmail',
          lineRegistered: !!mapping[tid]
        };
      });

    return { success: true, users: users };
  } catch (error) {
    Logger.log('❌ getLineRegisteredUsersエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎ごとの通知振り分け設定を全件取得する（Admin専用）
 * 各校舎に対して、通知を受け取る講師IDのリストを返す
 * @return {Object} 処理結果（routing: [{code, name, teacherIds}]）
 */
function getCampusNotificationRouting() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    var routingMap = raw ? JSON.parse(raw) : {};
    var campusConfigJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    var campuses = campusConfigJson ? JSON.parse(campusConfigJson) : [];
    var result = campuses.map(function(campus) {
      return {
        code: campus.code,
        name: campus.name,
        teacherIds: routingMap[campus.code] || []
      };
    });
    return { success: true, routing: result };
  } catch (error) {
    Logger.log('❌ getCampusNotificationRoutingエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定した校舎の通知振り分け先講師ID一覧を更新する（Admin専用）
 * @param {string} campusCode 校舎コード
 * @param {Array} teacherIds 通知先の講師ID配列
 * @return {Object} 処理結果
 */
function updateCampusNotificationRouting(campusCode, teacherIds) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    if (!campusCode) return { success: false, error: '校舎コードを指定してください' };
    var raw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    var routingMap = raw ? JSON.parse(raw) : {};
    routingMap[campusCode] = teacherIds || [];
    setProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING, JSON.stringify(routingMap));
    logAdminAction('通知振り分け更新', '校舎コード: ' + campusCode + ', 受信者数: ' + (teacherIds || []).length);
    return { success: true, message: '通知振り分け設定を更新しました' };
  } catch (error) {
    Logger.log('❌ updateCampusNotificationRoutingエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * メール本文の「校舎名:」から校舎を特定し、振り分け設定に従って通知を送信する
 * 本文に「校舎名: XX校」が含まれている場合、その校舎の担当者に通知を自動送信する
 * @aiCallable
 * @param {string} subject 件名
 * @param {string} body 本文（「校舎名: XX校」を含む）
 * @return {Object} 処理結果（送信先・送信結果を含む）
 */
function sendNotificationByContent(subject, body) {
  try {
    // 本文から「校舎名:」を抽出（全角・半角コロン、全角・半角スペース対応）
    var match = body.match(/校舎名[:：][\s\u3000]*([^\s\u3000\r\n]+)/);
    if (!match) {
      return { success: false, error: '本文に「校舎名:」が見つかりませんでした' };
    }
    var campusName = match[1].trim().replace(/[\s\u3000]+/g, '');

    // 校舎名からコードを検索
    var campuses = getCampusConfig();
    var campusCode = null;
    var campusCodes = Object.keys(campuses);
    for (var i = 0; i < campusCodes.length; i++) {
      if (campuses[campusCodes[i]] === campusName) {
        campusCode = campusCodes[i];
        break;
      }
    }
    if (!campusCode) {
      return { success: false, error: '校舎「' + campusName + '」が見つかりませんでした' };
    }

    // 振り分け設定を取得
    var raw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    var routingMap = raw ? JSON.parse(raw) : {};
    var recipients = routingMap[campusCode] || [];
    if (recipients.length === 0) {
      return { success: false, error: '校舎「' + campusName + '」の通知受信者が設定されていません' };
    }

    // 「お問合せ受付ページ」の行と「===...===」ブロック全体を抽出して通知本文を作成
    var pageLineMatch = body.match(/お問合せ受付ページ[^\r\n]+/);
    var pageLine = pageLineMatch ? pageLineMatch[0].trim() : '';
    var blockMatch = body.match(/={3,}[\s\S]+?={3,}/);
    var block = blockMatch ? blockMatch[0].trim() : '';
    var trimmedBody = pageLine ? pageLine + '\n' + block : block || body;

    // 各受信者（teacherId）にそれぞれの通知方法（Gmail/LINE/両方）で送信
    var results = [];
    for (var j = 0; j < recipients.length; j++) {
      var r = sendNotification(recipients[j], subject, trimmedBody);
      results.push({ teacherId: recipients[j], result: r });
    }
    return { success: true, campusName: campusName, sentCount: recipients.length, results: results };
  } catch (error) {
    Logger.log('❌ sendNotificationByContentエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * noreply@web-cms.jp からの未処理メールをGmailで検索し、
 * 校舎名を読み取って担当者へ自動振り分け送信する
 * 処理済みのメールには「振り分け済み」ラベルを付けて重複送信を防ぐ
 * 時間トリガー（5分ごと）から自動実行される
 */
function checkAndForwardFormEmails() {
  try {
    // 送信時間帯チェック（JST 14:00〜23:00 のみ処理）
    var now = new Date();
    var hour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'H'), 10);
    if (hour < 14 || hour >= 23) {
      Logger.log('⚠ checkAndForwardFormEmails: 送信時間外（' + hour + '時）のためスキップ');
      return { success: true, processed: 0, skipped: 'time' };
    }

    // 休校日チェック（日曜・計算上の休校日・登録追加の休校日はスキップ。祝日は休校日扱いしない）
    var dateKey = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
    // 日曜チェック（u: 1=月〜7=日）
    var jstDayNum = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'u'), 10);
    if (jstDayNum === 7) {
      Logger.log('⚠ checkAndForwardFormEmails: 日曜日のためスキップ');
      return { success: true, processed: 0, skipped: 'sunday' };
    }
    // 計算上の休校日（フロントエンド getClosedDays() と同ロジック）
    var jstYear = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy'), 10);
    var jstMonth = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'M'), 10);
    var fy = jstMonth >= 4 ? jstYear : jstYear - 1; // 年度
    var ny = fy + 1; // 翌年
    var p = function(x) { return x < 10 ? '0' + x : '' + x; };
    var mk = function(yr, mo, da) { return yr + '-' + p(mo) + '-' + p(da); };
    var computedClosed = {};
    // GW（4/30〜5/5。5/7が日曜なら5/6も、それ以外は4/29も）
    computedClosed[mk(fy,4,30)] = computedClosed[mk(fy,5,1)] = computedClosed[mk(fy,5,2)] =
    computedClosed[mk(fy,5,3)] = computedClosed[mk(fy,5,4)] = computedClosed[mk(fy,5,5)] = true;
    if (new Date(fy, 4, 7).getDay() === 0) { computedClosed[mk(fy,5,6)] = true; } else { computedClosed[mk(fy,4,29)] = true; }
    // お盆（8/10〜8/15。8/17が日曜なら8/16も、それ以外は8/9も）
    computedClosed[mk(fy,8,10)] = computedClosed[mk(fy,8,11)] = computedClosed[mk(fy,8,12)] =
    computedClosed[mk(fy,8,13)] = computedClosed[mk(fy,8,14)] = computedClosed[mk(fy,8,15)] = true;
    if (new Date(fy, 7, 17).getDay() === 0) { computedClosed[mk(fy,8,16)] = true; } else { computedClosed[mk(fy,8,9)] = true; }
    // 秋季休校（10/28〜11/2）
    computedClosed[mk(fy,10,28)] = computedClosed[mk(fy,10,29)] = computedClosed[mk(fy,10,30)] =
    computedClosed[mk(fy,10,31)] = computedClosed[mk(fy,11,1)] = computedClosed[mk(fy,11,2)] = true;
    // 年末年始（12/29〜翌1/3）
    computedClosed[mk(fy,12,29)] = computedClosed[mk(fy,12,30)] = computedClosed[mk(fy,12,31)] =
    computedClosed[mk(ny,1,1)] = computedClosed[mk(ny,1,2)] = computedClosed[mk(ny,1,3)] = true;
    // 春季休校（翌3/15〜17。翌年うるう年なら3/14も）
    computedClosed[mk(ny,3,15)] = computedClosed[mk(ny,3,16)] = computedClosed[mk(ny,3,17)] = true;
    if (ny % 4 === 0 && (ny % 100 !== 0 || ny % 400 === 0)) { computedClosed[mk(ny,3,14)] = true; }
    // CLOSED_DAYS_OVERRIDES の適用（追加・削除）
    var closedRaw = getProperty('CLOSED_DAYS_OVERRIDES');
    var closedOverrides = closedRaw ? JSON.parse(closedRaw) : { add: [], del: [] };
    var addedClosedDays = closedOverrides.add || [];
    var removedClosedDays = closedOverrides.del || [];
    for (var ci = 0; ci < addedClosedDays.length; ci++) { computedClosed[addedClosedDays[ci]] = true; }
    for (var di = 0; di < removedClosedDays.length; di++) { delete computedClosed[removedClosedDays[di]]; }
    if (computedClosed[dateKey]) {
      Logger.log('⚠ checkAndForwardFormEmails: 休校日のためスキップ（' + dateKey + '）');
      return { success: true, processed: 0, skipped: 'closed' };
    }

    // 処理済みラベルを取得（なければ作成）
    var labelName = '振り分け済み';
    var label = GmailApp.getUserLabelByName(labelName);
    if (!label) {
      label = GmailApp.createLabel(labelName);
    }

    // 設定値から送信元を取得（未設定時はデフォルト値を使用）
    var sender = getProperty('FORM_EMAIL_SENDER') || 'noreply@web-cms.jp';
    var query = 'from:' + sender + ' -label:振り分け済み';
    var threads = GmailApp.search(query, 0, 20);

    if (threads.length === 0) {
      return { success: true, processed: 0 };
    }

    var processedCount = 0;
    var errorCount = 0;
    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      var messages = thread.getMessages();
      for (var j = 0; j < messages.length; j++) {
        var msg = messages[j];
        var subject = msg.getSubject();
        var body = msg.getPlainBody();
        var result = sendNotificationByContent(subject, body);
        if (result.success) {
          processedCount++;
        } else {
          Logger.log('⚠ 振り分け失敗: ' + result.error + ' (件名: ' + subject + ')');
          errorCount++;
        }
      }
      // 処理済みラベルを付ける（成否にかかわらず再処理しない）
      thread.addLabel(label);
    }

    return { success: true, processed: processedCount, errors: errorCount };
  } catch (error) {
    Logger.log('❌ checkAndForwardFormEmailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * フォームメール自動転送の送信元フィルター設定を取得する（Admin専用）
 * @return {Object} { success, sender }
 */
function getFormEmailFilterSettings() {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var sender = getProperty('FORM_EMAIL_SENDER') || '';
    return { success: true, sender: sender };
  } catch (error) {
    Logger.log('❌ getFormEmailFilterSettingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * フォームメール自動転送の送信元フィルター設定を保存する（Admin専用）
 * @param {string} sender 送信元メールアドレス（空文字の場合はプロパティを削除してデフォルトに戻す）
 * @return {Object} 処理結果
 */
function saveFormEmailFilterSettings(sender) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var props = PropertiesService.getScriptProperties();
    sender = (sender || '').trim();
    if (sender) {
      props.setProperty('FORM_EMAIL_SENDER', sender);
    } else {
      props.deleteProperty('FORM_EMAIL_SENDER');
    }
    return { success: true, message: 'フィルター設定を保存しました' };
  } catch (error) {
    Logger.log('❌ saveFormEmailFilterSettingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Gmailの自動チェックトリガーを設定する（Admin専用）
 * 5分ごとに checkAndForwardFormEmails() が実行されるようになる
 * @return {Object} 処理結果
 */
function setupFormEmailTrigger() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    // 既存の同名トリガーを削除（重複防止）
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkAndForwardFormEmails') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    // 5分ごとのトリガーを新規作成
    ScriptApp.newTrigger('checkAndForwardFormEmails')
      .timeBased()
      .everyMinutes(5)
      .create();
    logAdminAction('フォームメールトリガー設定', '5分ごとの自動チェックを開始');
    return { success: true, message: '5分ごとに自動チェックするよう設定しました' };
  } catch (error) {
    Logger.log('❌ setupFormEmailTriggerエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Gmailの自動チェックトリガーを削除する（Admin専用）
 * @return {Object} 処理結果
 */
function deleteFormEmailTrigger() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var deleted = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'checkAndForwardFormEmails') {
        ScriptApp.deleteTrigger(triggers[i]);
        deleted++;
      }
    }
    logAdminAction('フォームメールトリガー削除', deleted + '件削除');
    return { success: true, message: '自動チェックを停止しました' };
  } catch (error) {
    Logger.log('❌ deleteFormEmailTriggerエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Gmailの自動チェックトリガーが稼働中かどうかを取得する（Admin専用）
 * @return {Object} { success, active: boolean }
 */
function getFormEmailTriggerStatus() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var active = triggers.some(function(t) {
      return t.getHandlerFunction() === 'checkAndForwardFormEmails';
    });
    return { success: true, active: active };
  } catch (error) {
    Logger.log('❌ getFormEmailTriggerStatusエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================

// 【セクション18】LINEメッセージスケジューラー
// ========================================
// 3種類の予定LINE通知（室長用連絡・全体ミーティング連絡・回数報告書提出日連絡）を
// 管理・自動送信する機能。毎月スケジュールを自動生成し、管理者が編集可能。

// ---- 内部ヘルパー ----

/**
 * LINEスケジューラーシートを取得または作成する内部ヘルパー
 * システム設定.gs 内の「LINEスケジューラー」シートを返す
 * @return {Sheet|null} スプレッドシートのシートオブジェクト
 */
function getLineSchedulerSheet_() {
  var settingsFolder = getSettingsFolder();
  if (!settingsFolder) return null;
  var sheetName = 'システム設定';
  var file = getFileByName(settingsFolder, sheetName);
  var ss;
  if (file) {
    ss = SpreadsheetApp.openById(file.getId());
  } else {
    return null; // システム設定シートがなければスキップ
  }
  var sheet = ss.getSheetByName('LINEスケジューラー');
  if (!sheet) {
    sheet = ss.insertSheet('LINEスケジューラー');
    var headers = ['ID', '種別', '年月', '宛先(JSON)', '送信予定日時', 'メッセージ本文', '送信済み', '送信日時', '作成日時'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#43e97b').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * LINEスケジューラーシートから shitsucho 行の全宛先teacherIdを取得する内部ヘルパー
 * LINE_SCHEDULER_SETTINGS ではなくシートが宛先の正（管理タブの保存先がシートのため）
 * @return {Array<string>} teacherId の配列（重複排除済み）
 */
function getShitsuchoRecipientsFromSheet_() {
  var sheet = getLineSchedulerSheet_();
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var recipients = [];
  for (var i = 1; i < data.length; i++) {
    var type = String(data[i][1] || '');
    if (type !== 'shitsucho' && type !== 'shimurocho') continue;
    var arr = [];
    try { arr = JSON.parse(data[i][3] || '[]'); } catch(e) {}
    arr.forEach(function(r) { if (r && recipients.indexOf(r) < 0) recipients.push(r); });
  }
  return recipients;
}

/**
 * 指定種別・年月の送信予定日時文字列を再計算して返す内部ヘルパー
 * scheduledAt が空になってしまった行の復元に使用
 * @param {string} type 種別 ('shitsucho'/'meeting'/'report')
 * @param {number} year 年
 * @param {number} month 月 (1-12)
 * @return {string} "YYYY-MM-DDTHH:MM:SS" 形式、計算不可なら空文字
 */
function recalcScheduledAt_(type, year, month) {
  try {
    var mm = month < 10 ? '0' + month : '' + month;
    var closedDays = computeClosedDaysForMonth_(year, month);
    var settingsJson = getProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS);
    var settings = settingsJson ? JSON.parse(settingsJson) : {};
    if (type === 'meeting') {
      var r = computeMeetingNotifDate_(year, month, closedDays);
      if (!r) return '';
      var h = (settings.meeting && settings.meeting.sendHour !== undefined) ? settings.meeting.sendHour : 16;
      var dd = r.day < 10 ? '0' + r.day : '' + r.day;
      var hh = h < 10 ? '0' + h : '' + h;
      return year + '-' + mm + '-' + dd + 'T' + hh + ':00:00';
    } else if (type === 'report') {
      var r2 = computeReportNotifDate_(year, month, closedDays);
      if (!r2) return '';
      var h2 = (settings.report && settings.report.sendHour !== undefined) ? settings.report.sendHour : 16;
      var dd2 = r2.day < 10 ? '0' + r2.day : '' + r2.day;
      var hh2 = h2 < 10 ? '0' + h2 : '' + h2;
      return year + '-' + mm + '-' + dd2 + 'T' + hh2 + ':00:00';
    } else if (type === 'shitsucho' || type === 'shimurocho') {
      var sDay = computeShimurochoSendDate_(year, month, closedDays);
      if (!sDay) return '';
      var h3 = (settings.shitsucho && settings.shitsucho.sendHour !== undefined) ? settings.shitsucho.sendHour : (settings.shimurocho && settings.shimurocho.sendHour !== undefined) ? settings.shimurocho.sendHour : 14;
      var dd3 = sDay < 10 ? '0' + sDay : '' + sDay;
      var hh3 = h3 < 10 ? '0' + h3 : '' + h3;
      return year + '-' + mm + '-' + dd3 + 'T' + hh3 + ':00:00';
    }
    return '';
  } catch(e) {
    Logger.log('⚠ recalcScheduledAt_ エラー: ' + e);
    return '';
  }
}

/**
 * 指定年月の休校日セットを計算して返す内部ヘルパー
 * index.html の getClosedDays(fiscalYear) を GAS 側で再実装 + CLOSED_DAYS_OVERRIDES 適用
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月 (1-12)
 * @return {Object} { 'YYYY-MM-DD': true } 形式の休校日セット
 */
function computeClosedDaysForMonth_(year, month) {
  var fiscalYear = (month >= 4) ? year : year - 1;
  var y = fiscalYear;
  var n = fiscalYear + 1;
  var c = {};
  var add = function(yr, mo, da) {
    var mm = mo < 10 ? '0' + mo : '' + mo;
    var dd = da < 10 ? '0' + da : '' + da;
    c[yr + '-' + mm + '-' + dd] = true;
  };
  // ゴールデンウィーク: 4/30〜5/5 固定
  add(y,4,30); add(y,5,1); add(y,5,2); add(y,5,3); add(y,5,4); add(y,5,5);
  if (new Date(y,4,7).getDay() === 0) { add(y,5,6); } else { add(y,4,29); }
  // お盆: 8/10〜8/15 固定
  add(y,8,10); add(y,8,11); add(y,8,12); add(y,8,13); add(y,8,14); add(y,8,15);
  if (new Date(y,7,17).getDay() === 0) { add(y,8,16); } else { add(y,8,9); }
  // 秋季休校: 10/28〜11/2
  add(y,10,28); add(y,10,29); add(y,10,30); add(y,10,31); add(y,11,1); add(y,11,2);
  // 年末年始: 12/29〜翌1/3
  add(y,12,29); add(y,12,30); add(y,12,31);
  add(n,1,1); add(n,1,2); add(n,1,3);
  // 春季休校: 翌3/15〜17（うるう年は3/14も）
  add(n,3,15); add(n,3,16); add(n,3,17);
  var isLeapN = (n % 4 === 0 && (n % 100 !== 0 || n % 400 === 0));
  if (isLeapN) add(n,3,14);
  // CLOSED_DAYS_OVERRIDES を適用
  try {
    var overrides = getProperty('CLOSED_DAYS_OVERRIDES');
    if (overrides) {
      var ov = JSON.parse(overrides);
      (ov.add || []).forEach(function(d) { c[d] = true; });
      (ov.del || []).forEach(function(d) { delete c[d]; });
    }
  } catch(e) {}
  return c;
}

/**
 * 指定日が休校日または日曜日かどうか判定する内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {number} day カレンダー日
 * @param {Object} closedDays computeClosedDaysForMonth_ の戻り値
 * @return {boolean} 休校日または日曜なら true
 */
function isClosedOrSunday_(year, month, day, closedDays) {
  var d = new Date(year, month - 1, day);
  if (d.getDay() === 0) return true;
  var mm = month < 10 ? '0' + month : '' + month;
  var dd = day < 10 ? '0' + day : '' + day;
  return !!(closedDays[year + '-' + mm + '-' + dd]);
}

/**
 * startDay から遡って最初の開校日（日曜・休校日でない日）を返す内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {number} startDay 起算日（この日から遡る）
 * @param {Object} closedDays computeClosedDaysForMonth_ の戻り値
 * @return {number|null} 開校日の日付、見つからなければ null
 */
function findPrevOpenDay_(year, month, startDay, closedDays) {
  var d = startDay;
  var maxAttempts = 14;
  while (maxAttempts-- > 0 && d >= 1) {
    if (!isClosedOrSunday_(year, month, d, closedDays)) return d;
    d--;
  }
  return null;
}

/**
 * 全体ミーティング日を計算する内部ヘルパー（index.html の getMeetingDay を再実装）
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @return {number|null} ミーティング日の日付、8月または計算不能なら null
 */
function getMeetingDay_(year, month) {
  if (month === 8) return null;
  if (month === 4 || month === 5 || month === 6) {
    var firstDay = new Date(year, month - 1, 1).getDay();
    var vbFriday = ((firstDay - 5 + 7) % 7) + 1;
    return 1 - vbFriday + 15;
  }
  var refDays = {7:9, 9:7, 10:9, 11:19, 12:10, 1:20, 2:7, 3:14};
  var refDay = refDays[month];
  if (!refDay) return null;
  var d = new Date(year, month - 1, refDay);
  var dow = d.getDay();
  var daysBack = (dow - 5 + 7) % 7;
  return refDay - daysBack;
}

/**
 * 回数報告書提出日を計算する内部ヘルパー（index.html の getReportDay を再実装）
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @return {number|null} 報告書提出日の日付
 */
function getReportDay_(year, month) {
  var base = {4:21, 5:24, 6:23, 7:24, 8:24, 9:13, 10:20, 11:23, 12:21, 1:24, 2:21, 3:13};
  var day = base[month];
  if (!day) return null;
  var d = new Date(year, month - 1, day);
  if (d.getDay() === 0) day -= 1;
  return day;
}

/**
 * 引落データ送信日を計算する内部ヘルパー（index.html の getDebitDays(y,m).debit を再実装）
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @return {number} 引落データ送信日の日付
 */
function getDebitDay_(year, month) {
  var baseDay = (month === 8) ? 8 : (month === 1) ? 18 : 13;
  var d1 = new Date(year, month - 1, baseDay);
  var dow = d1.getDay();
  var debitOff;
  if (dow === 3 || dow === 4) { debitOff = 0; }
  else if (dow === 5) { debitOff = -1; }
  else if (dow === 6) { debitOff = -2; }
  else if (dow === 0) { debitOff = -3; }
  else if (dow === 1) { debitOff = -4; }
  else { debitOff = 0; } // 火曜
  return baseDay + debitOff;
}

/**
 * 曜日名（日本語）を返す内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {number} day カレンダー日
 * @return {string} 曜日名（例: '月', '火'）
 */
function getDayOfWeekJa_(year, month, day) {
  return ['日','月','火','水','木','金','土'][new Date(year, month - 1, day).getDay()];
}

/**
 * 室長用連絡の送信日を計算する内部ヘルパー
 * その月の最後の開校日から7日前（休校日なら前の開校日）
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {Object} closedDays computeClosedDaysForMonth_ の戻り値
 * @return {number|null} 送信日の日付
 */
function computeShimurochoSendDate_(year, month, closedDays) {
  var lastDay = new Date(year, month, 0).getDate();
  var lastOpenDay = findPrevOpenDay_(year, month, lastDay, closedDays);
  if (!lastOpenDay) return null;
  var targetDay = lastOpenDay - 7;
  if (targetDay < 1) return null;
  return findPrevOpenDay_(year, month, targetDay, closedDays);
}

/**
 * 全体ミーティング通知日（前日）を計算する内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {Object} closedDays computeClosedDaysForMonth_ の戻り値
 * @return {Object|null} { day: 通知日, meetingDay: ミーティング日 } または null
 */
function computeMeetingNotifDate_(year, month, closedDays) {
  var meetingDay = getMeetingDay_(year, month);
  if (!meetingDay) return null;
  var notifDay = meetingDay - 1;
  if (notifDay < 1) return null;
  var resultDay = findPrevOpenDay_(year, month, notifDay, closedDays);
  if (!resultDay) return null;
  return { day: resultDay, meetingDay: meetingDay };
}

/**
 * 回数報告書提出日通知日（前日）を計算する内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {Object} closedDays computeClosedDaysForMonth_ の戻り値
 * @return {Object|null} { day: 通知日, reportDay: 提出日 } または null
 */
function computeReportNotifDate_(year, month, closedDays) {
  var reportDay = getReportDay_(year, month);
  if (!reportDay) return null;
  var notifDay = reportDay - 1;
  if (notifDay < 1) return null;
  var resultDay = findPrevOpenDay_(year, month, notifDay, closedDays);
  if (!resultDay) return null;
  return { day: resultDay, reportDay: reportDay };
}

/**
 * 全体ミーティング連絡のデフォルトメッセージを生成する内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @param {number} meetingDay ミーティング日
 * @return {string} メッセージ本文
 */
function buildMeetingMessage_(year, month, meetingDay) {
  var dow = getDayOfWeekJa_(year, month, meetingDay);
  return '明日' + month + '月' + meetingDay + '日(' + dow + ')は14時から北島校で正社員ミーティングがあります。\nよろしくお願いいたします。';
}

/**
 * 回数報告書提出日連絡のデフォルトメッセージを生成する内部ヘルパー
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月（報告書提出月 = 通知送信月）
 * @param {number} reportDay 提出日
 * @param {number} sendMonth 送信月（month と同じ）
 * @return {string} メッセージ本文
 */
function buildReportMessage_(year, month, reportDay, sendMonth) {
  var dow = getDayOfWeekJa_(year, month, reportDay);
  var extras = {4:'春期講習', 9:'夏期講習', 10:'第1回基礎学力テスト対策', 11:'第2回基礎学力テスト対策', 1:'冬期講習', 3:'直前講習'};
  var extra = extras[sendMonth];
  var base = '明日' + month + '月' + reportDay + '日(' + dow + ')は' + sendMonth + '月分の回数報告書';
  if (extra) base += 'と' + extra;
  base += 'の提出日です。\nよろしくお願いいたします。';
  return base;
}

/**
 * 室長用連絡のデフォルトメッセージを生成する内部ヘルパー
 * @param {number} sendYear 送信年
 * @param {number} sendMonth 送信月
 * @param {number} sendDay 送信日
 * @param {Object} closedDays computeClosedDaysForMonth_ の戻り値
 * @return {string} メッセージ本文
 */
function buildShimurochoMessage_(sendYear, sendMonth, sendDay, closedDays) {
  var nextMonth = sendMonth === 12 ? 1 : sendMonth + 1;
  var nextYear  = sendMonth === 12 ? sendYear + 1 : sendYear;
  var lectureNames = {4:'春期講習', 5:'中間テスト対策', 6:'期末テスト対策', 8:'夏期講習', 9:'第1回基礎学力テスト', 10:'第2回基礎学力テスト', 12:'冬期講習', 1:'直前講習', 2:'高校準備講座'};
  var lectureName = lectureNames[sendMonth];
  var debitDay = getDebitDay_(nextYear, nextMonth);
  var debitDow = getDayOfWeekJa_(nextYear, nextMonth, debitDay);
  // 締切日 = sendDay + 5、月末を超えない、休校日なら前の開校日
  var lastDay = new Date(sendYear, sendMonth, 0).getDate();
  var rawDeadline = Math.min(sendDay + 5, lastDay);
  var deadlineDay = findPrevOpenDay_(sendYear, sendMonth, rawDeadline, closedDays) || rawDeadline;
  var deadlineDow = getDayOfWeekJa_(sendYear, sendMonth, deadlineDay);

  if (sendMonth === 3) {
    return '新年度の継続申込書が未提出の場合は、3月' + deadlineDay + '日(' + deadlineDow + ')までに提出をお願いいたします。\nなお4月の引落データ送信は' + debitDay + '日(' + debitDow + ')です。';
  }
  if (sendMonth === 7 || sendMonth === 11) {
    return nextMonth + '月の引落データ送信は' + debitDay + '日(' + debitDow + ')です。\nよろしくお願いいたします。';
  }
  return nextMonth + '月は' + lectureName + 'の引落があります。\n実施校舎で名簿が未提出の場合は' + sendMonth + '月' + deadlineDay + '日(' + deadlineDow + ')までに提出をお願いいたします。\n外部生で振込用紙を郵送する場合は講習申込書の提出も合わせてお願いいたします。\nなお、' + nextMonth + '月の引落データ送信は' + debitDay + '日(' + debitDow + ')です。';
}

/**
 * LINE_USER_MAPPING に登録されている全 teacherId を返す内部ヘルパー
 * meeting/report の全員送信用
 * @return {Array<string>} teacherId 配列
 */
function getAllLineRegisteredTeacherIds_() {
  var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
  var mapping = mappingRaw ? JSON.parse(mappingRaw) : {};
  return Object.keys(mapping);
}

/**
 * 指定年月のLINEスケジュール3件を自動生成する内部ヘルパー
 * 既に同じ種別のエントリが存在する場合はスキップする
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @return {number} 作成件数
 */
function generateMonthlySchedule_(year, month) {
  try {
    var sheet = getLineSchedulerSheet_();
    if (!sheet) { Logger.log('⚠ generateMonthlySchedule_: スケジューラーシートなし'); return 0; }
    var mm = month < 10 ? '0' + month : '' + month;
    var yearMonth = '' + year + mm;

    // 既存エントリの種別を確認
    var data = sheet.getDataRange().getValues();
    var existingTypes = {};
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][2]) === yearMonth) existingTypes[data[i][1]] = true;
    }

    var settingsJson = getProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS);
    var settings = settingsJson ? JSON.parse(settingsJson) : {};
    var closedDays = computeClosedDaysForMonth_(year, month);
    var now = new Date();
    var nowIso = now.toISOString();
    var created = 0;

    // 全体ミーティング連絡
    if (!existingTypes['meeting']) {
      var meetingResult = computeMeetingNotifDate_(year, month, closedDays);
      if (meetingResult) {
        var mSettings = settings.meeting || {};
        var mHour = mSettings.sendHour !== undefined ? mSettings.sendHour : 16;
        var mDd = meetingResult.day < 10 ? '0' + meetingResult.day : '' + meetingResult.day;
        var mHh = mHour < 10 ? '0' + mHour : '' + mHour;
        var mScheduledAt = year + '-' + mm + '-' + mDd + 'T' + mHh + ':00:00+09:00';
        if (new Date(mScheduledAt) <= now) {
          Logger.log('⚠ generateMonthlySchedule_: 送信予定日時が過去のためスキップ (meeting ' + mScheduledAt + ')');
        } else {
          sheet.appendRow([
            'sch_' + yearMonth + '_meeting', 'meeting', yearMonth,
            JSON.stringify(['__ALL__']),
            mScheduledAt,
            buildMeetingMessage_(year, month, meetingResult.meetingDay),
            false, '', nowIso
          ]);
          created++;
        }
      }
    }

    // 回数報告書提出日連絡
    if (!existingTypes['report']) {
      var reportResult = computeReportNotifDate_(year, month, closedDays);
      if (reportResult) {
        var rSettings = settings.report || {};
        var rHour = rSettings.sendHour !== undefined ? rSettings.sendHour : 16;
        var rDd = reportResult.day < 10 ? '0' + reportResult.day : '' + reportResult.day;
        var rHh = rHour < 10 ? '0' + rHour : '' + rHour;
        var rScheduledAt = year + '-' + mm + '-' + rDd + 'T' + rHh + ':00:00+09:00';
        if (new Date(rScheduledAt) <= now) {
          Logger.log('⚠ generateMonthlySchedule_: 送信予定日時が過去のためスキップ (report ' + rScheduledAt + ')');
        } else {
          sheet.appendRow([
            'sch_' + yearMonth + '_report', 'report', yearMonth,
            JSON.stringify(['__ALL__']),
            rScheduledAt,
            buildReportMessage_(year, month, reportResult.reportDay, month),
            false, '', nowIso
          ]);
          created++;
        }
      }
    }

    // 室長用連絡
    if (!existingTypes['shitsucho'] && !existingTypes['shimurocho']) {
      var sDay = computeShimurochoSendDate_(year, month, closedDays);
      if (sDay) {
        var sSettings = settings.shitsucho || settings.shimurocho || {};
        var sHour = sSettings.sendHour !== undefined ? sSettings.sendHour : 14;
        var sDd = sDay < 10 ? '0' + sDay : '' + sDay;
        var sHh = sHour < 10 ? '0' + sHour : '' + sHour;
        var sScheduledAt = year + '-' + mm + '-' + sDd + 'T' + sHh + ':00:00+09:00';
        if (new Date(sScheduledAt) <= now) {
          Logger.log('⚠ generateMonthlySchedule_: 送信予定日時が過去のためスキップ (shitsucho ' + sScheduledAt + ')');
        } else {
          sheet.appendRow([
            'sch_' + yearMonth + '_shitsucho', 'shitsucho', yearMonth,
            JSON.stringify(sSettings.recipients || []),
            sScheduledAt,
            buildShimurochoMessage_(year, month, sDay, closedDays),
            false, '', nowIso
          ]);
          created++;
        }
      }
    }

    return created;
  } catch(e) {
    Logger.log('❌ generateMonthlySchedule_ エラー: ' + e);
    return 0;
  }
}

// ---- 公開API関数 ----

/**
 * LINEスケジューラーのデフォルト設定（宛先・メッセージテンプレート・送信時刻）を取得する
 * @return {Object} { success, settings: { shimurocho, meeting, report } }
 */
function getLineSchedulerSettings() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS);
    var settings = json ? JSON.parse(json) : {};
    // 旧キー shimurocho が残っていれば shitsucho に永続移行（保存も行う）
    if (settings.shimurocho && !settings.shitsucho) {
      settings.shitsucho = settings.shimurocho;
      delete settings.shimurocho;
      setProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS, JSON.stringify(settings));
    }
    var defaults = {
      shitsucho: { recipients: [], messageTemplate: '', sendHour: 14 },
      meeting:   { recipients: [], messageTemplate: '明日{date}は14時から北島校で正社員ミーティングがあります。\nよろしくお願いいたします。', sendHour: 16 },
      report:    { recipients: [], messageTemplate: '明日{date}は{month}月分の回数報告書の提出日です。\nよろしくお願いいたします。', sendHour: 16 }
    };
    ['shitsucho','meeting','report'].forEach(function(t) {
      if (!settings[t]) settings[t] = defaults[t];
      else {
        if (settings[t].sendHour === undefined) settings[t].sendHour = defaults[t].sendHour;
        if (!settings[t].recipients) settings[t].recipients = [];
      }
    });
    return { success: true, settings: settings };
  } catch(e) {
    Logger.log('❌ getLineSchedulerSettings エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * LINEスケジューラーの指定種別のデフォルト設定を保存する
 * @param {string} type 種別 ('shitsucho'/'meeting'/'report')
 * @param {Object} newSettings { recipients, messageTemplate, sendHour }
 * @return {Object} { success, message }
 */
function saveLineSchedulerSettings(type, newSettings) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS);
    var settings = json ? JSON.parse(json) : {};
    // 旧キー shimurocho → shitsucho に永続移行
    if (settings.shimurocho && !settings.shitsucho) {
      settings.shitsucho = settings.shimurocho;
      delete settings.shimurocho;
    }
    settings[type] = newSettings;
    setProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS, JSON.stringify(settings));
    return { success: true, message: '設定を保存しました' };
  } catch(e) {
    Logger.log('❌ saveLineSchedulerSettings エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 指定年月のスケジュール一覧を取得する（未生成の場合は自動生成してから返す）
 * @param {number} year カレンダー年
 * @param {number} month カレンダー月
 * @return {Object} { success, messages: Array }
 */
function getScheduledLineMessages(year, month) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var sheet = getLineSchedulerSheet_();
    if (!sheet) return { success: false, error: 'スケジューラーシートを取得できません' };
    var mm = month < 10 ? '0' + month : '' + month;
    var yearMonth = '' + year + mm;

    // 既存エントリを確認し、なければ自動生成
    var data = sheet.getDataRange().getValues();
    var existing = data.slice(1).filter(function(r) { return String(r[2]) === yearMonth; });
    if (existing.length === 0) {
      generateMonthlySchedule_(year, month);
      data = sheet.getDataRange().getValues();
      existing = data.slice(1).filter(function(r) { return String(r[2]) === yearMonth; });
    }

    // 種別ごとに重複がある場合は最初の1件のみ採用（重複防止）
    var seenTypes = {};
    var messages = [];
    existing.forEach(function(r) {
      var type = r[1];
      if (type === 'shimurocho') type = 'shitsucho'; // 旧名称の後方互換
      if (seenTypes[type]) return;
      seenTypes[type] = true;
      var recipientsArr = [];
      try { recipientsArr = JSON.parse(r[3] || '[]'); } catch(e) {}
      // scheduledAt: Sheets が ISO文字列を日付型として読み込む場合があるため Date オブジェクトにも対応
      var rawSat = r[4];
      var scheduledAt;
      if (rawSat instanceof Date) {
        scheduledAt = Utilities.formatDate(rawSat, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss");
      } else {
        scheduledAt = rawSat ? String(rawSat) : '';
      }
      messages.push({
        id: r[0], type: type, yearMonth: r[2],
        recipients: recipientsArr,
        scheduledAt: scheduledAt,
        message: r[5], sent: r[6] === true || r[6] === 'TRUE',
        sentAt: r[7] ? String(r[7]) : '',
        createdAt: r[8] ? String(r[8]) : ''
      });
    });
    return { success: true, messages: messages };
  } catch(e) {
    Logger.log('❌ getScheduledLineMessages エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 指定年月のスケジュールを全削除して再生成する（Admin のみ）
 * @param {number} year 年
 * @param {number} month 月
 * @return {Object} { success, created, message }
 */
function resetAndRegenerateSchedule(year, month) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var sheet = getLineSchedulerSheet_();
    if (!sheet) return { success: false, error: 'スケジューラーシートを取得できません' };
    var mm = month < 10 ? '0' + month : '' + month;
    var yearMonth = '' + year + mm;
    // 該当年月の行を後ろから削除
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][2]) === yearMonth) {
        sheet.deleteRow(i + 1);
      }
    }
    // 再生成
    var created = generateMonthlySchedule_(year, month);
    return { success: true, created: created, message: created + '件のスケジュールを再生成しました' };
  } catch(e) {
    Logger.log('❌ resetAndRegenerateSchedule エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * スケジュール1件を保存（id 一致する行を更新、なければ追加）する
 * @param {Object} data { id, type, yearMonth, recipients, scheduledAt, message }
 * @return {Object} { success, message }
 */
function saveScheduledLineMessage(data) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var sheet = getLineSchedulerSheet_();
    if (!sheet) return { success: false, error: 'スケジューラーシートを取得できません' };
    var sheetData = sheet.getDataRange().getValues();
    var foundRow = -1;
    for (var i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] === data.id) { foundRow = i + 1; break; }
    }
    var recipientsJson = JSON.stringify(data.recipients || []);
    if (foundRow > 0) {
      // 更新（送信済みフラグは維持）
      sheet.getRange(foundRow, 4).setValue(recipientsJson);
      // scheduledAt が指定されている場合のみ上書き（空の場合は既存値を維持）
      if (data.scheduledAt) sheet.getRange(foundRow, 5).setValue(data.scheduledAt);
      sheet.getRange(foundRow, 6).setValue(data.message);
    } else {
      // 新規追加
      var now = new Date().toISOString();
      var mm = data.yearMonth ? String(data.yearMonth).slice(4) : '01';
      sheet.appendRow([data.id, data.type, data.yearMonth, recipientsJson, data.scheduledAt, data.message, false, '', now]);
    }
    // shitsucho 保存時は LINE_SCHEDULER_SETTINGS の recipients も同期
    // （generateMonthlySchedule_() が新月生成時に参照するため）
    if (data.type === 'shitsucho') {
      var sSettingsRaw = getProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS);
      var sSettings = sSettingsRaw ? JSON.parse(sSettingsRaw) : {};
      if (!sSettings.shitsucho) sSettings.shitsucho = {};
      sSettings.shitsucho.recipients = data.recipients || [];
      if (sSettings.shimurocho) delete sSettings.shimurocho; // 旧キーも削除
      setProperty(PROP_KEYS.LINE_SCHEDULER_SETTINGS, JSON.stringify(sSettings));
    }
    return { success: true, message: '保存しました' };
  } catch(e) {
    Logger.log('❌ saveScheduledLineMessage エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * スケジュール1件を削除する
 * @param {string} id スケジュールID
 * @return {Object} { success, message }
 */
function deleteScheduledLineMessage(id) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var sheet = getLineSchedulerSheet_();
    if (!sheet) return { success: false, error: 'スケジューラーシートを取得できません' };
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === id) { sheet.deleteRow(i + 1); return { success: true, message: '削除しました' }; }
    }
    return { success: false, error: '対象IDが見つかりません: ' + id };
  } catch(e) {
    Logger.log('❌ deleteScheduledLineMessage エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 指定IDのスケジュールを今すぐ送信する（Admin 手動実行用）
 * @param {string} id スケジュールID
 * @return {Object} { success, sentCount, failedEmails }
 */
function sendScheduledLineMessageNow(id) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var sheet = getLineSchedulerSheet_();
    if (!sheet) return { success: false, error: 'スケジューラーシートを取得できません' };
    var data = sheet.getDataRange().getValues();
    var foundRow = -1;
    var rowData;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === id) { foundRow = i + 1; rowData = data[i]; break; }
    }
    if (foundRow < 0) return { success: false, error: '対象IDが見つかりません' };

    var recipientsArr = [];
    try { recipientsArr = JSON.parse(rowData[3] || '[]'); } catch(e) {}
    var msgType = rowData[1];
    if (msgType === 'shimurocho') msgType = 'shitsucho'; // 旧名称の後方互換
    var lineMapping = {};
    try { lineMapping = JSON.parse(getProperty(PROP_KEYS.LINE_USER_MAPPING) || '{}'); } catch(e) {}
    if (msgType === 'meeting' || msgType === 'report' || recipientsArr.indexOf('__ALL__') >= 0) {
      recipientsArr = getAllLineRegisteredTeacherIds_();
    }
    // LINE User ID で重複排除（同じ人に複数回届かないように）
    var seenLineIds = {};
    var deduped = [];
    recipientsArr.forEach(function(tid) {
      var lid = lineMapping[tid];
      if (lid) {
        if (!seenLineIds[lid]) { seenLineIds[lid] = true; deduped.push(tid); }
      } else {
        deduped.push(tid); // LINE未登録はGmail送信のために残す
      }
    });
    recipientsArr = deduped;
    var message = rowData[5];
    var notifPrefsRaw = getProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS);
    var notifPrefs = notifPrefsRaw ? JSON.parse(notifPrefsRaw) : {};
    var typeSubjects = { meeting: '全体ミーティングのお知らせ', report: '回数報告書提出日のお知らせ', shitsucho: '室長用連絡' };

    var sentCount = 0;
    var failedRecipients = [];
    recipientsArr.forEach(function(tid) {
      var pref = (notifPrefs[tid] && notifPrefs[tid][msgType]) || 'line';
      if (pref === 'none') return;
      if (pref === 'line' || pref === 'both') {
        var lineUserId = lineMapping[tid];
        if (lineUserId) {
          var ok = sendLineMessage(lineUserId, message);
          if (ok) sentCount++; else failedRecipients.push(tid);
        } else {
          failedRecipients.push(tid + '(LINE未登録)');
        }
      }
      if (pref === 'gmail' || pref === 'both') {
        var toEmail = getEmailByTeacherId_(tid);
        if (toEmail) {
          try {
            MailApp.sendEmail(toEmail, '【スクエア】' + (typeSubjects[msgType] || 'お知らせ'), message);
            sentCount++;
          } catch(e) { failedRecipients.push(tid + '(mail): ' + e); }
        }
      }
    });

    // 送信済みフラグを更新
    sheet.getRange(foundRow, 7).setValue(true);
    sheet.getRange(foundRow, 8).setValue(new Date().toISOString());
    return { success: true, sentCount: sentCount, failedRecipients: failedRecipients };
  } catch(e) {
    Logger.log('❌ sendScheduledLineMessageNow エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 送信予定時刻を過ぎた未送信メッセージを一括送信する（時間トリガーから呼ばれる）
 * @return {Object} { success, sentCount, errors }
 */
function checkAndSendDueLineMessages() {
  try {
    var sheet = getLineSchedulerSheet_();
    if (!sheet) return { success: false, error: 'スケジューラーシートを取得できません' };

    // 今月・来月のスケジュールを自動生成（未生成の場合のみ）
    var now = new Date();
    var cy = now.getFullYear();
    var cm = now.getMonth() + 1;
    generateMonthlySchedule_(cy, cm);
    var ny = cm === 12 ? cy + 1 : cy;
    var nm = cm === 12 ? 1 : cm + 1;
    generateMonthlySchedule_(ny, nm);

    var data = sheet.getDataRange().getValues();
    var lineMapping = {};
    try { lineMapping = JSON.parse(getProperty(PROP_KEYS.LINE_USER_MAPPING) || '{}'); } catch(e) {}
    var notifPrefsRaw = getProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS);
    var notifPrefs = notifPrefsRaw ? JSON.parse(notifPrefsRaw) : {};
    var typeSubjects = { meeting: '全体ミーティングのお知らせ', report: '回数報告書提出日のお知らせ', shitsucho: '室長用連絡' };

    var sentCount = 0;
    var errors = [];
    for (var i = 1; i < data.length; i++) {
      var sent = data[i][6];
      if (sent === true || sent === 'TRUE') continue;
      var rawSat = data[i][4];
      if (!rawSat) continue;
      var scheduledAtStr;
      if (rawSat instanceof Date) {
        scheduledAtStr = Utilities.formatDate(rawSat, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss+09:00");
      } else {
        scheduledAtStr = String(rawSat);
      }
      var scheduledDate = new Date(scheduledAtStr);
      if (isNaN(scheduledDate.getTime()) || scheduledDate > now) continue;

      var recipientsArr = [];
      try { recipientsArr = JSON.parse(data[i][3] || '[]'); } catch(e) {}
      var msgType = data[i][1];
      if (msgType === 'shimurocho') msgType = 'shitsucho'; // 旧名称の後方互換
      if (msgType === 'meeting' || msgType === 'report' || recipientsArr.indexOf('__ALL__') >= 0) {
        recipientsArr = getAllLineRegisteredTeacherIds_();
      }
      // LINE User ID で重複排除（同じ人に複数回届かないように）
      var seenLineIds = {};
      var deduped = [];
      recipientsArr.forEach(function(tid) {
        var lid = lineMapping[tid];
        if (lid) {
          if (!seenLineIds[lid]) { seenLineIds[lid] = true; deduped.push(tid); }
        } else {
          deduped.push(tid); // LINE未登録はGmail送信のために残す
        }
      });
      recipientsArr = deduped;
      var message = data[i][5];
      var rowSent = 0;
      recipientsArr.forEach(function(tid) {
        var pref = (notifPrefs[tid] && notifPrefs[tid][msgType]) || 'line';
        if (pref === 'none') return;
        if (pref === 'line' || pref === 'both') {
          var lineUserId = lineMapping[tid];
          if (lineUserId) {
            try { if (sendLineMessage(lineUserId, message)) rowSent++; } catch(e) { errors.push(tid + ': ' + e); }
          }
        }
        if (pref === 'gmail' || pref === 'both') {
          var toEmail = getEmailByTeacherId_(tid);
          if (toEmail) {
            try {
              MailApp.sendEmail(toEmail, '【スクエア】' + (typeSubjects[msgType] || 'お知らせ'), message);
              rowSent++;
            } catch(e) { errors.push(tid + '(mail): ' + e); }
          }
        }
      });
      sheet.getRange(i + 1, 7).setValue(true);
      sheet.getRange(i + 1, 8).setValue(new Date().toISOString());
      sentCount += rowSent;
    }
    return { success: true, sentCount: sentCount, errors: errors };
  } catch(e) {
    Logger.log('❌ checkAndSendDueLineMessages エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * checkAndSendDueLineMessages を毎時実行するトリガーを設定する
 * @return {Object} { success, message }
 */
function setupScheduledLineTrigger() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    // 既存トリガーを削除
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'checkAndSendDueLineMessages') ScriptApp.deleteTrigger(t);
    });
    ScriptApp.newTrigger('checkAndSendDueLineMessages').timeBased().everyHours(1).create();
    return { success: true, message: 'LINEスケジューラーを開始しました（毎時チェック）' };
  } catch(e) {
    Logger.log('❌ setupScheduledLineTrigger エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * checkAndSendDueLineMessages のトリガーをすべて削除する
 * @return {Object} { success, message }
 */
function deleteScheduledLineTrigger() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var count = 0;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'checkAndSendDueLineMessages') { ScriptApp.deleteTrigger(t); count++; }
    });
    return { success: true, message: 'LINEスケジューラーを停止しました' };
  } catch(e) {
    Logger.log('❌ deleteScheduledLineTrigger エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * checkAndSendDueLineMessages トリガーの稼働状態を確認する
 * @return {Object} { success, active, nextRun }
 */
function getScheduledLineTriggerStatus() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var triggers = ScriptApp.getProjectTriggers().filter(function(t) {
      return t.getHandlerFunction() === 'checkAndSendDueLineMessages';
    });
    var active = triggers.length > 0;
    return { success: true, active: active };
  } catch(e) {
    Logger.log('❌ getScheduledLineTriggerStatus エラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ========================================
