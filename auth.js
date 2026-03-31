
// ========================================
// 【セクション2】認証・ロール管理
// ========================================
// ユーザー認証、Admin 判定、メール管理、ユーザー情報取得

/**
 * スクリプトプロパティから値を取得
 * @param {string} key プロパティキー
 * @return {string} 値（存在しない場合は空文字列）
 */
function getProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * スクリプトプロパティに値を設定
 * @param {string} key プロパティキー
 * @param {string} value 設定する値
 * @return {boolean} 常に true
 */
function setProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  return true;
}

/**
 * すべてのスクリプトプロパティを取得
 * @return {Object} キーと値のペア
 */
function getAllProperties() {
  return PropertiesService.getScriptProperties().getProperties();
}

/**
 * TEACHER_ID_MAP のエントリを新フォーマット（emails配列）に正規化する内部ヘルパー
 * 旧フォーマット { email: "...", name: "..." } → 新フォーマット { emails: ["..."], name: "..." }
 * @param {Object} entry TEACHER_ID_MAP の1エントリ
 * @return {Object} 正規化済みエントリ { emails: string[], name: string }
 */
function normalizeTeacherEntry_(entry) {
  if (!entry) return { emails: [], name: '' };
  if (Array.isArray(entry.emails)) return entry; // 既に新フォーマット
  // 旧フォーマット: email (単一文字列) → emails (配列) に変換
  var emailsList = [];
  if (entry.email) emailsList.push(entry.email.toLowerCase());
  return { emails: emailsList, name: entry.name || '' };
}

/**
 * 現在のユーザーが Admin かどうかをチェック
 * @return {boolean} true=Admin, false=一般ユーザー
 */
function isAdmin() {
  try {
    var userEmail = Session.getActiveUser().getEmail().toLowerCase();
    var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '')
      .split(',')
      .map(function(email) { return email.trim().toLowerCase(); })
      .filter(function(email) { return email.length > 0; });
    
    return adminEmails.includes(userEmail);
  } catch (error) {
    Logger.log('❌ isAdminエラー: ' + error);
    return false;
  }
}

/**
 * 現在のユーザーのメールアドレスを取得
 * @return {string} メールアドレス（取得失敗時は 'unknown@example.com'）
 */
function getCurrentUserEmail() {
  try {
    return Session.getActiveUser().getEmail();
  } catch (error) {
    return 'unknown@example.com';
  }
}

/**
 * ユーザーロール情報を取得（Web UI用）
 * @return {Object} { isAdmin, displayName, email, roleLabel }
 */
function getUserRoleInfo() {
  try {
    var email = getCurrentUserEmail();
    var admin = isAdmin();
    var displayName = getDisplayName(email);
    
    return {
      isAdmin: admin,
      displayName: displayName,
      email: email,
      roleLabel: admin ? '🔐 Admin' : '👤 一般ユーザー'
    };
  } catch (error) {
    Logger.log('❌ getUserRoleInfoエラー: ' + error);
    return {
      isAdmin: false,
      displayName: 'Unknown',
      email: 'unknown@example.com',
      roleLabel: '❌ エラー'
    };
  }
}

/**
 * メールアドレスから表示名を生成
 * 例: user.name@example.com → User Name
 * @param {string} userEmail メールアドレス
 * @return {string} 表示用の名前
 */
function getDisplayName(userEmail) {
  try {
    var parts = userEmail.split('@')[0].split('.');
    return parts.map(function(part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(' ');
  } catch (error) {
    return userEmail.split('@')[0];
  }
}

/**
 * Admin メール一覧を取得（Admin のみ）
 * @return {Object} { success, emails, error }
 */
function getAdminEmails() {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }
    
    var emailsStr = getProperty(PROP_KEYS.ADMIN_EMAILS) || '';
    var emails = emailsStr.split(',')
      .map(function(email) { return email.trim(); })
      .filter(function(email) { return email.length > 0; });
    
    return { success: true, emails: emails };
    
  } catch (error) {
    Logger.log('❌ getAdminEmailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Admin メール追加（無効化済み — 管理者はGASデプロイアカウントに固定）
 * @param {string} newEmail 追加するメールアドレス
 * @return {Object} { success, error }
 */
function addAdminEmail(newEmail) {
  return { success: false, error: '管理者の追加はできません。管理者はGASのデプロイアカウントに固定されています。' };
}

/**
 * 現在のユーザーがアプリアクセスを許可されているか確認する
 * ACCESS_FOLDER_ID が設定されている場合はそのフォルダの共有者を優先。
 * 未設定の場合は APP_FOLDER_ID のフォルダで確認。
 * どちらも未設定なら初期設定モードとして全員を許可する。
 * Adminメールに含まれる場合は常に許可。
 * @return {boolean} true=許可, false=拒否
 */
function isAllowedUser() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (!email) return false;
    email = email.toLowerCase();

    // 1. Adminメールチェック（常に優先許可）
    var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '').split(',')
      .map(function(e) { return e.trim().toLowerCase(); })
      .filter(function(e) { return e.length > 0; });
    if (adminEmails.indexOf(email) !== -1) return true;

    // 2. 初期設定モード（フォルダ未設定）：全員許可
    var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) return true;

    // 3. TEACHER_ID_MAP チェック（LINE自己登録ユーザー・Drive API不要で高速）
    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
    var keys = Object.keys(teacherMap);
    for (var j = 0; j < keys.length; j++) {
      var entry = normalizeTeacherEntry_(teacherMap[keys[j]]);
      if (entry.emails.indexOf(email) !== -1) {
        Logger.log('✓ isAllowedUser: TEACHER_ID_MAP で許可: ' + email);
        return true;
      }
    }

    // 4. Driveフォルダのオーナー・編集者チェック（管理者が手動追加したユーザーの対応）
    try {
      var folder = DriveApp.getFolderById(folderId);
      var owner = folder.getOwner();
      if (owner && owner.getEmail().toLowerCase() === email) return true;
      var editors = folder.getEditors();
      for (var i = 0; i < editors.length; i++) {
        if (editors[i].getEmail().toLowerCase() === email) return true;
      }
    } catch (driveErr) {
      Logger.log('⚠ isAllowedUser: Drive チェックエラー（スキップ）: ' + driveErr);
    }

    return false;
  } catch (error) {
    Logger.log('❌ isAllowedUserエラー: ' + error);
    return false;
  }
}

/**
 * Driveフォルダの共有ユーザー一覧を取得（Admin のみ）
 * オーナー・編集者・Adminメールを含む全アクセス許可ユーザーを返す
 * ACCESS_FOLDER_ID が設定されている場合はそちらを優先して使用する
 * @return {Object} { success, users: [{email, name, role}], error }
 */
function getAllowedUsers() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var usersMap = {};

    // TEACHER_ID_MAP からLINE登録ユーザーを取得（複数メール対応）
    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
    Object.keys(teacherMap).forEach(function(tid) {
      var entry = normalizeTeacherEntry_(teacherMap[tid]);
      if (entry.emails.length === 0) return;
      // 代表メール（最初のメール）をキーに登録
      var primaryEmail = entry.emails[0];
      usersMap[primaryEmail] = {
        email: primaryEmail,
        emails: entry.emails,
        name: entry.name || '',
        role: 'LINE登録',
        teacherId: tid
      };
    });

    // Adminメール（TEACHER_ID_MAP に含まれない場合も表示）
    var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '').split(',')
      .map(function(e) { return e.trim().toLowerCase(); })
      .filter(function(e) { return e.length > 0; });
    adminEmails.forEach(function(adminEmail) {
      if (usersMap[adminEmail]) {
        usersMap[adminEmail].role = usersMap[adminEmail].role + '・Admin';
      } else {
        usersMap[adminEmail] = { email: adminEmail, name: '', role: 'Admin', teacherId: '' };
      }
    });

    var users = Object.keys(usersMap).map(function(k) { return usersMap[k]; });
    Logger.log('✓ getAllowedUsers: ' + users.length + ' 件');
    return { success: true, users: users };
  } catch (error) {
    Logger.log('❌ getAllowedUsersエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ユーザーにアプリアクセスを付与する（Admin のみ）
 * DriveフォルダにEditorとして追加する（Drive共有通知メールが相手に届きます）
 * @param {string} email 追加するメールアドレス
 * @return {Object} { success, message, error }
 */
function addUserAccess(email) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    email = email.trim().toLowerCase();
    if (!email.includes('@')) {
      return { success: false, error: '有効なメールアドレスではありません' };
    }

    var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) {
      return { success: false, error: 'ACCESS_FOLDER_ID・APP_FOLDER_IDともに未設定です。先に管理タブの設定で入力してください' };
    }

    var folder = DriveApp.getFolderById(folderId);
    folder.addEditor(email);

    // teacherId を TEACHER_ID_MAP に登録（手動追加時点でIDを確定）
    try {
      getOrCreateTeacherIdForEmail_(email, '');
    } catch (tidErr) {
      Logger.log('⚠ addUserAccess: teacherId 登録失敗: ' + tidErr);
    }

    logAdminAction('addUserAccess', { email: email });
    return { success: true, message: email + ' にアクセスを許可しました（Drive共有通知が届きます）' };
  } catch (error) {
    Logger.log('❌ addUserAccessエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ユーザーのアプリアクセスを削除する（Admin のみ）
 * DriveフォルダのEditor権限を削除する（オーナーと自分自身は削除不可）
 * @param {string} email 削除するメールアドレス
 * @return {Object} { success, message, error }
 */
function removeUserAccess(email) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    email = email.trim().toLowerCase();

    var currentUser = Session.getActiveUser().getEmail().toLowerCase();
    if (email === currentUser) {
      return { success: false, error: '自分自身のアクセスは削除できません' };
    }

    var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) {
      return { success: false, error: 'ACCESS_FOLDER_ID・APP_FOLDER_IDともに未設定です' };
    }

    var folder = DriveApp.getFolderById(folderId);

    // オーナーは削除不可
    var owner = folder.getOwner();
    if (owner && owner.getEmail().toLowerCase() === email) {
      return { success: false, error: 'フォルダのオーナーは削除できません' };
    }

    // teacherId を取得して紐づく全メールアドレスを Drive から一括解除
    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
    var teacherId = null;
    var allEmails = [email];
    Object.keys(teacherMap).forEach(function(tid) {
      var entry = normalizeTeacherEntry_(teacherMap[tid]);
      if (entry.emails.indexOf(email) !== -1) {
        teacherId = tid;
        allEmails = entry.emails.length > 0 ? entry.emails : [email];
      }
    });

    // 講師IDに紐づく全メールアドレスを Drive 共有から解除
    allEmails.forEach(function(addr) {
      var ownerEmail = folder.getOwner() ? folder.getOwner().getEmail().toLowerCase() : '';
      if (addr !== ownerEmail) {
        try { folder.removeEditor(addr); } catch (e) { Logger.log('⚠ removeEditor スキップ: ' + addr + ' / ' + e); }
      }
    });

    if (teacherId) {
      // TEACHER_ID_MAP から削除
      delete teacherMap[teacherId];
      setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(teacherMap));
      // LINE_USER_MAPPING から削除（teacherId キー）
      var mappingRaw = getProperty(PROP_KEYS.LINE_USER_MAPPING);
      if (mappingRaw) {
        var mapping = safeJsonParse_(mappingRaw, {});
        if (mapping[teacherId]) {
          delete mapping[teacherId];
          setProperty(PROP_KEYS.LINE_USER_MAPPING, JSON.stringify(mapping));
        }
      }
      // NOTIFICATION_METHODS から削除（teacherId キー）
      var methodsRaw = getProperty(PROP_KEYS.NOTIFICATION_METHODS);
      if (methodsRaw) {
        var methods = safeJsonParse_(methodsRaw, {});
        if (methods[teacherId]) {
          delete methods[teacherId];
          setProperty(PROP_KEYS.NOTIFICATION_METHODS, JSON.stringify(methods));
        }
      }
      // LINE_SCHEDULER_NOTIF_PREFS から削除（teacherId キー）
      var notifPrefsRaw = getProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS);
      if (notifPrefsRaw) {
        var notifPrefs = safeJsonParse_(notifPrefsRaw, {});
        if (notifPrefs[teacherId]) {
          delete notifPrefs[teacherId];
          setProperty(PROP_KEYS.LINE_SCHEDULER_NOTIF_PREFS, JSON.stringify(notifPrefs));
        }
      }
    }
    // CAMPUS_NOTIFICATION_ROUTING から削除（teacherId ベース）
    var routingRaw = getProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING);
    if (routingRaw && teacherId) {
      var routing = safeJsonParse_(routingRaw, {});
      var routingChanged = false;
      Object.keys(routing).forEach(function(campusCode) {
        var ids = routing[campusCode];
        if (Array.isArray(ids) && ids.indexOf(teacherId) !== -1) {
          routing[campusCode] = ids.filter(function(tid) { return tid !== teacherId; });
          routingChanged = true;
        }
      });
      if (routingChanged) {
        setProperty(PROP_KEYS.CAMPUS_NOTIFICATION_ROUTING, JSON.stringify(routing));
      }
    }

    logAdminAction('removeUserAccess', { email: email });
    return { success: true, message: email + ' のアクセスを削除しました（Drive共有・通知設定も解除されました）' };
  } catch (error) {
    Logger.log('❌ removeUserAccessエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講師IDでTEACHER_ID_MAPを検索し、見つかればUserPropertiesに保存して紐付ける
 * 初回アクセス時の講師ID入力認証に使用。紐付け時に現在のGoogleアカウントのメールをemailsリストに追加する
 * @aiCallable
 * @param {string} inputId 入力された講師ID（例: T1707123456789_abc123def）
 * @return {Object} { success, found, teacherId, displayName, isAdmin, error }
 */
function linkUserById(inputId) {
  try {
    inputId = (inputId || '').trim();
    if (!inputId) return { success: false, found: false, error: '講師IDを入力してください' };

    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
    if (!teacherMap[inputId]) {
      return { success: true, found: false };
    }

    var entry = normalizeTeacherEntry_(teacherMap[inputId]);

    // ユーザープロパティに TEACHER_ID と DISPLAY_NAME を保存（このGoogleアカウントに紐付け）
    setUserProperty('TEACHER_ID', inputId);
    setUserProperty('DISPLAY_NAME', entry.name || '');
    if (entry.emails.length > 0) setUserProperty('REGISTERED_EMAIL', entry.emails[0]);

    // 現在のGoogleアカウントのメールをemailsリストに追加（未登録の場合のみ）
    var currentEmail = Session.getActiveUser().getEmail();
    if (currentEmail) {
      var emailLower = currentEmail.toLowerCase();
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);
        // 再取得してから更新（競合対策）
        var freshMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
        var freshEntry = normalizeTeacherEntry_(freshMap[inputId]);
        if (freshEntry.emails.indexOf(emailLower) === -1) {
          freshEntry.emails.push(emailLower);
          freshMap[inputId] = freshEntry;
          setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(freshMap));
          Logger.log('✓ linkUserById: ' + emailLower + ' を ' + inputId + ' のemailsに追加');
        }
      } finally {
        lock.releaseLock();
      }
    }

    // Admin かどうか確認
    var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '').split(',')
      .map(function(e) { return e.trim().toLowerCase(); })
      .filter(function(e) { return e.length > 0; });
    var isAdminUser = currentEmail && adminEmails.indexOf(currentEmail.toLowerCase()) !== -1;

    Logger.log('✓ linkUserById: ' + inputId + ' に紐付け完了（名前: ' + entry.name + '）');
    return { success: true, found: true, teacherId: inputId, displayName: entry.name || '', isAdmin: isAdminUser };

  } catch (error) {
    Logger.log('❌ linkUserByIdエラー: ' + error);
    return { success: false, found: false, error: error.toString() };
  }
}

/**
 * 現在の講師のemailsリストを取得する
 * 設定タブのメールアドレス管理UIで使用
 * @aiCallable
 * @return {Object} { success, emails: string[], teacherId, error }
 */
function getTeacherEmails() {
  try {
    var teacherId = getUserProperty('TEACHER_ID');
    if (!teacherId) return { success: false, error: '講師IDが設定されていません' };

    var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
    if (!teacherMap[teacherId]) return { success: false, error: '講師情報が見つかりません' };

    var entry = normalizeTeacherEntry_(teacherMap[teacherId]);
    var currentEmail = (Session.getActiveUser().getEmail() || '').toLowerCase();
    return { success: true, emails: entry.emails, teacherId: teacherId, currentEmail: currentEmail };
  } catch (error) {
    Logger.log('❌ getTeacherEmailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在の講師のemailsリストにメールアドレスを追加する
 * 設定タブのメールアドレス管理UIで使用
 * @aiCallable
 * @param {string} newEmail 追加するメールアドレス
 * @return {Object} { success, emails, message, error }
 */
function addEmailToTeacher(newEmail) {
  try {
    var teacherId = getUserProperty('TEACHER_ID');
    if (!teacherId) return { success: false, error: '講師IDが設定されていません' };

    newEmail = (newEmail || '').trim().toLowerCase();
    if (!newEmail || newEmail.indexOf('@') === -1) {
      return { success: false, error: '正しいメールアドレスを入力してください' };
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (e) {
      return { success: false, error: 'しばらくしてから再試行してください' };
    }
    try {
      var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});

      // 他の講師に既に登録されていないか確認
      var allTids = Object.keys(teacherMap);
      for (var i = 0; i < allTids.length; i++) {
        var entry = normalizeTeacherEntry_(teacherMap[allTids[i]]);
        if (allTids[i] !== teacherId && entry.emails.indexOf(newEmail) !== -1) {
          return { success: false, error: 'このメールアドレスは既に別の講師に登録されています' };
        }
      }

      var myEntry = normalizeTeacherEntry_(teacherMap[teacherId]);
      if (!teacherMap[teacherId]) return { success: false, error: '講師情報が見つかりません' };

      if (myEntry.emails.indexOf(newEmail) !== -1) {
        return { success: false, error: 'このメールアドレスは既に登録されています' };
      }

      myEntry.emails.push(newEmail);
      teacherMap[teacherId] = myEntry;
      setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(teacherMap));
      Logger.log('✓ addEmailToTeacher: ' + newEmail + ' を ' + teacherId + ' に追加');
      return { success: true, message: 'メールアドレスを追加しました', emails: myEntry.emails };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log('❌ addEmailToTeacherエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在の講師のemailsリストからメールアドレスを削除する
 * 設定タブのメールアドレス管理UIで使用。現在のGoogleアカウントのメールは削除不可
 * @aiCallable
 * @param {string} emailToRemove 削除するメールアドレス
 * @return {Object} { success, emails, message, error }
 */
function removeEmailFromTeacher(emailToRemove) {
  try {
    var teacherId = getUserProperty('TEACHER_ID');
    if (!teacherId) return { success: false, error: '講師IDが設定されていません' };

    emailToRemove = (emailToRemove || '').trim().toLowerCase();
    if (!emailToRemove) return { success: false, error: 'メールアドレスを指定してください' };

    // 現在のGoogleアカウントのメールは削除不可（ロックアウト防止）
    var currentEmail = (Session.getActiveUser().getEmail() || '').toLowerCase();
    if (emailToRemove === currentEmail) {
      return { success: false, error: '現在ログイン中のメールアドレスは削除できません' };
    }

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (e) {
      return { success: false, error: 'しばらくしてから再試行してください' };
    }
    try {
      var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
      if (!teacherMap[teacherId]) return { success: false, error: '講師情報が見つかりません' };

      var myEntry = normalizeTeacherEntry_(teacherMap[teacherId]);
      var idx = myEntry.emails.indexOf(emailToRemove);
      if (idx === -1) return { success: false, error: 'このメールアドレスは登録されていません' };
      if (myEntry.emails.length <= 1) return { success: false, error: 'メールアドレスは最低1件必要です' };

      myEntry.emails.splice(idx, 1);
      teacherMap[teacherId] = myEntry;
      setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(teacherMap));
      Logger.log('✓ removeEmailFromTeacher: ' + emailToRemove + ' を ' + teacherId + ' から削除');
      return { success: true, message: 'メールアドレスを削除しました', emails: myEntry.emails };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log('❌ removeEmailFromTeacherエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * アクセス拒否ページのHTMLを生成する
 * @param {string} email アクセスを試みたユーザーのメールアドレス
 * @return {string} HTML文字列
 */
function createAccessDeniedHtml(email) {
  var appUrl = ScriptApp.getService().getUrl();
  var switchUrl = appUrl + '?forceAuth=true';

  return '<!DOCTYPE html>' +
    '<html lang="ja">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>アクセスできません - S-quire</title>' +
    '<style>' +
    'body{font-family:"Helvetica Neue",sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}' +
    '.card{background:white;border-radius:16px;padding:40px 32px;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.2);}' +
    '.icon{font-size:64px;margin-bottom:16px;}' +
    'h1{color:#333;font-size:20px;margin:0 0 12px 0;}' +
    'p{color:#666;font-size:14px;line-height:1.7;margin:0 0 16px 0;}' +
    '.email-box{background:#f5f5f5;border-radius:8px;padding:12px;margin:16px 0;font-size:12px;color:#444;word-break:break-all;}' +
    '.switch-btn{display:inline-block;background:#4285f4;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin:16px 0 8px;transition:background 0.2s;}' +
    '.switch-btn:hover{background:#3367d6;}' +
    '.footer{font-size:11px;color:#bbb;margin-top:24px;}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="card">' +
    '<div class="icon">🔒</div>' +
    '<h1>アクセスできません</h1>' +
    '<p>このアプリを使用する権限がありません。<br>管理者にお問い合わせください。</p>' +
    '<div class="email-box">ログイン中のアカウント<br><strong>' + (email || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</strong></div>' +
    '<a href="' + switchUrl + '" class="switch-btn" target="_top">別のアカウントでログイン</a>' +
    '<a href="' + appUrl + '" class="switch-btn" target="_top" style="margin-top:10px;background:#555;">このアカウントで再試行</a>' +
    '<p style="font-size:13px;">管理者がGoogleアカウントを許可リストに追加することでアクセスできます。</p>' +
    '<div class="footer">S-quire — 個別指導スクエア</div>' +
    '</div>' +
    '</body>' +
    '</html>';
}

/**
 * Admin メール削除（無効化済み — 管理者はGASデプロイアカウントに固定）
 * @param {string} emailToRemove 削除するメールアドレス
 * @return {Object} { success, error }
 */
function removeAdminEmail(emailToRemove) {
  return { success: false, error: '管理者の削除はできません。管理者はGASのデプロイアカウントに固定されています。' };
}

/**
 * 初回セットアップが必要かどうかを確認する
 * ADMIN_EMAILS が空の場合、初回セットアップが必要と判断する
 * @return {Object} { isFirstSetup, currentUserEmail, hasAppFolder }
 */
function getSetupStatus() {
  try {
    return {
      isFirstSetup: !getProperty(PROP_KEYS.ADMIN_EMAILS),
      currentUserEmail: Session.getActiveUser().getEmail(),
      hasAppFolder: !!getProperty(PROP_KEYS.APP_FOLDER_ID)
    };
  } catch (error) {
    Logger.log('❌ getSetupStatusエラー: ' + error);
    return { isFirstSetup: false, currentUserEmail: '', hasAppFolder: false };
  }
}

/**
 * 最初の管理者を登録する
 * ADMIN_EMAILS が空の場合のみ実行可能（2回目以降は拒否される）
 * @return {Object} { success, message/error }
 */
function initializeFirstAdmin() {
  try {
    if (getProperty(PROP_KEYS.ADMIN_EMAILS)) {
      return { success: false, error: '管理者は既に登録されています' };
    }
    var email = Session.getActiveUser().getEmail();
    if (!email) {
      return { success: false, error: 'Googleアカウントにログインしてください' };
    }
    setProperty(PROP_KEYS.ADMIN_EMAILS, email);
    return { success: true, message: email + ' を管理者として登録しました' };
  } catch (error) {
    Logger.log('❌ initializeFirstAdminエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
