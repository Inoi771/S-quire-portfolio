
// ========================================
// 【セクション2】認証・ロール管理
// ========================================
// ユーザー認証、Admin 判定、メール管理、ユーザー情報取得

// Firebase Auth メールコンテキスト（同一GAS実行内でのみ有効）
// Session.getActiveUser() が空のときのフォールバックとして使用する
// Phase2では doPost() でトークン検証後にセットする
var _firebaseEmailContext_ = null;

/**
 * Firebase Auth から得たメールアドレスをこの実行コンテキストに設定する
 * google.script.run 経由でクライアントから渡されたメールをセットする
 * Session.getActiveUser() が空の場合のフォールバックとして使用する
 * @param {string} email Firebase Auth で確認済みのメールアドレス
 */
function setFirebaseEmailContext_(email) {
  _firebaseEmailContext_ = email ? email.toLowerCase() : null;
}

/**
 * Firebase IDトークンをFirebase REST APIで検証し、メールアドレスを返す（Phase2認証準備）
 * Phase2（Firebase Hosting移行後）の doPost() API認証に使用する
 * @param {string} idToken Firebase IDトークン（JWTフォーマット）
 * @return {string|null} 検証済みメールアドレス（失敗時はnull）
 */
function verifyFirebaseIdToken_(idToken) {
  try {
    if (!idToken) return null;
    // FIREBASE_WEB_API_KEY がスクリプトプロパティに設定されていない場合はデフォルト値を使用
    // Firebase Web API Key はクライアント側にも公開済みの値のため非秘密情報
    var firebaseApiKey = getProperty('FIREBASE_WEB_API_KEY') || 'AIzaSyDGxhgsCbpgJuXm6PzY1WcR8a4QOtfJBiU';
    var response = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + firebaseApiKey,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
      }
    );
    var result = safeJsonParse_(response.getContentText(), null);
    if (!result || result.error || !Array.isArray(result.users) || !result.users.length) {
      Logger.log('⚠ verifyFirebaseIdToken_: 検証失敗 ' + JSON.stringify(result && result.error));
      return null;
    }
    var user = result.users[0];
    Logger.log('verifyFirebaseIdToken_: localId=' + (user.localId || '(空)') + ' email=' + (user.email || '(空)'));
    return { email: user.email || null, uid: user.localId || null };
  } catch (e) {
    Logger.log('❌ verifyFirebaseIdToken_エラー: ' + e);
    return null;
  }
}

/**
 * スクリプトプロパティから値を取得
 * Phase 5-E-4 以降は Workers 経由の Cloudflare KV から取得する（失敗時は
 * ScriptProperties にフォールバック）。キャッシュは getProperty_ 内で実施。
 * @param {string} key プロパティキー
 * @return {string} 値（存在しない場合は空文字列）
 */
function getProperty(key) {
  var val = getProperty_(key);
  return val == null ? '' : val;
}

/**
 * スクリプトプロパティに値を設定
 * Phase 5-E-4 以降は Workers 経由の Cloudflare KV に書き込みつつ、
 * ScriptProperties にも同期する（Dual-write・移行期間中の安全網）。
 * @param {string} key プロパティキー
 * @param {string} value 設定する値
 * @return {boolean} 常に true
 */
function setProperty(key, value) {
  setProperty_(key, value);
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
 * 現在のユーザーが Admin かどうかをチェック
 * ADMIN_EMAILS に含まれるか、隠し管理者モードが有効な場合に true を返す
 * @return {boolean} true=Admin, false=一般ユーザー
 */
function isAdmin() {
  try {
    var userEmail = getCurrentUserEmail().toLowerCase();
    if (!userEmail || userEmail === 'unknown@example.com') return false;

    // 隠し管理者モード（CacheService）のチェック
    try {
      var cache = CacheService.getScriptCache();
      if (cache.get('hiddenAdmin_' + userEmail) === 'true') return true;
    } catch (cacheErr) {
      Logger.log('⚠ hiddenAdmin キャッシュ読み取りエラー: ' + cacheErr);
    }

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
 * 隠し管理者モードを有効化する（ロゴタップ認証からフロントエンドが呼び出す）
 * パスワードが正しければ CacheService に6時間有効のフラグを保存する
 * @param {string} password 入力されたパスワード
 * @return {Object} { success:boolean, error?:string }
 */
function activateHiddenAdminMode(password) {
  try {
    if (password !== 'inoiman') {
      return { success: false, error: 'パスワードが違います' };
    }
    var userEmail = getCurrentUserEmail().toLowerCase();
    if (!userEmail || userEmail === 'unknown@example.com') {
      return { success: false, error: 'ユーザーを識別できません' };
    }
    var cache = CacheService.getScriptCache();
    cache.put('hiddenAdmin_' + userEmail, 'true', 21600); // 6時間（秒）
    Logger.log('✓ 隠し管理者モード有効化: ' + userEmail);
    return { success: true };
  } catch (error) {
    Logger.log('❌ activateHiddenAdminModeエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在のユーザーのメールアドレスを取得
 * Session.getActiveUser() を優先。空の場合は Firebase Auth コンテキストにフォールバック。
 * Phase2では doPost() で verifyFirebaseIdToken_() 検証後に setFirebaseEmailContext_() を呼ぶ。
 * @return {string} メールアドレス（取得失敗時は 'unknown@example.com'）
 */
function getCurrentUserEmail() {
  try {
    var sessionEmail = Session.getActiveUser().getEmail();
    if (sessionEmail) return sessionEmail;
    // セッションが空の場合（executeAs の設定変更・権限エラー等）は Firebase Auth コンテキストにフォールバック
    if (_firebaseEmailContext_) return _firebaseEmailContext_;
    return 'unknown@example.com';
  } catch (error) {
    return _firebaseEmailContext_ || 'unknown@example.com';
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
    var email = getCurrentUserEmail();
    if (!email || email === 'unknown@example.com') return false;
    email = email.toLowerCase();

    // 1. Adminメールチェック（常に優先許可）
    var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '').split(',')
      .map(function(e) { return e.trim().toLowerCase(); })
      .filter(function(e) { return e.length > 0; });
    if (adminEmails.indexOf(email) !== -1) return true;

    // 2. 初期設定モード（フォルダ未設定）：全員許可
    var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) return true;

    // 3. Supabase RPC で UID + メール一括検索（1クエリで4パターンを検索）
    try {
      var staffRows = supabaseRpc_('find_staff_by_auth', {
        p_uid: _firebaseUidContext_ || null,
        p_email: email || null
      });
      if (staffRows && staffRows.length > 0) {
        Logger.log('✓ isAllowedUser: Supabase staffs で許可');
        return true;
      }
    } catch (staffErr) {
      Logger.log('⚠ isAllowedUser: staffs チェックエラー（スキップ）: ' + staffErr);
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

    // Supabase staffs テーブルから登録スタッフを取得
    try {
      var allRows = supabaseSelect_('staffs', null, { select: 'id,email,display_name,name,subjects' });
      (allRows || []).forEach(function(row) {
        var staffEmail = row.email || '';
        if (!staffEmail) return;
        usersMap[staffEmail] = {
          email: staffEmail,
          name: row.display_name || row.name || '',
          role: '登録済み',
          teacherId: row.id || '',
          subjects: row.subjects || []
        };
      });
    } catch (staffErr) {
      Logger.log('⚠ getAllowedUsers: staffs 取得エラー: ' + staffErr);
    }

    // Adminメール（staffs に含まれない場合も表示）
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

    // Supabase staffs に新規スタッフを作成
    try {
      var existingStaff = supabaseSelect_('staffs', 'email=eq.' + email, { limit: 1 });
      if (!existingStaff || existingStaff.length === 0) {
        var newTeacherId = 'T' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        supabaseUpsert_('staffs', {
          id: newTeacherId,
          email: email,
          emails: [email],
          name: '',
          firebase_uid: null,
          firebase_uids: [],
          line_user_id: null,
          display_name: '',
          subjects: [],
          preferred_campuses: [],
          ai_assistant_name: '',
          ai_personality: '',
          theme_color: '',
          notification_method: 'gmail',
          notification_email: '',
          added_at: new Date().toISOString()
        }, 'id');
        Logger.log('✓ addUserAccess: staffs に新規登録 teacherId=' + newTeacherId);
      }
    } catch (staffErr) {
      Logger.log('⚠ addUserAccess: staffs 登録失敗: ' + staffErr);
    }

    // Firestore の allowedUsers に自動登録（セキュリティルール用）
    try {
      firestoreSet_('allowedUsers', email, { email: email, addedAt: new Date().toISOString() });
    } catch (fsErr) {
      Logger.log('⚠ addUserAccess: Firestore allowedUsers 登録失敗（機能への影響なし）: ' + fsErr);
    }

    logAdminAction('addUserAccess', { email: email });
    return { success: true, message: email + ' にアクセスを許可しました' };
  } catch (error) {
    Logger.log('❌ addUserAccessエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ユーザーのアプリアクセスを削除する（Admin のみ）
 * 自分自身は削除不可
 * @param {string} email 削除するメールアドレス
 * @return {Object} { success, message, error }
 */
function removeUserAccess(email) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    email = email.trim().toLowerCase();

    var currentUser = getCurrentUserEmail().toLowerCase();
    if (email === currentUser) {
      return { success: false, error: '自分自身のアクセスは削除できません' };
    }

    // Supabase staffs からスタッフを検索
    var staff = null;
    try {
      var staffRows = supabaseRpc_('find_staff_by_auth', { p_uid: null, p_email: email });
      if (staffRows && staffRows.length > 0) staff = staffFromSupabase_(staffRows[0]);
    } catch (staffErr) {
      Logger.log('⚠ removeUserAccess: staffs 検索エラー: ' + staffErr);
    }

    // スタッフの全メールアドレスを収集
    var allEmails = [email];
    if (staff) {
      var staffEmails = Array.isArray(staff.emails) ? staff.emails : (staff.email ? [staff.email] : []);
      staffEmails.forEach(function(e) {
        if (e && allEmails.indexOf(e) === -1) allEmails.push(e);
      });
    }

    // Supabase staffs レコードを削除
    if (staff) {
      var teacherId = staff.teacherId || staff._id;
      try {
        supabaseDelete_('staffs', 'id=eq.' + teacherId);
        Logger.log('✓ removeUserAccess: staffs/' + teacherId + ' を削除');
      } catch (sbErr) {
        Logger.log('⚠ removeUserAccess: staffs 削除失敗: ' + sbErr);
      }

      // 通知振り分け設定からも自動削除
      try {
        var routingMap = getCampusRoutingMap_();
        var routingChanged = false;
        Object.keys(routingMap).forEach(function(campusCode) {
          var ids = routingMap[campusCode];
          if (Array.isArray(ids)) {
            var idx = ids.indexOf(teacherId);
            if (idx !== -1) {
              ids.splice(idx, 1);
              routingChanged = true;
            }
          }
        });
        if (routingChanged) {
          setCampusRoutingMap_(routingMap);
          Logger.log('✓ removeUserAccess: 通知振り分けから ' + teacherId + ' を削除');
        }
      } catch (routingErr) {
        Logger.log('⚠ removeUserAccess: 通知振り分け削除失敗: ' + routingErr);
      }
    }

    // Firestore allowedUsers から全メールを削除
    allEmails.forEach(function(em) {
      try {
        firestoreDelete_('allowedUsers', em);
      } catch (fsErr) {
        Logger.log('⚠ removeUserAccess: allowedUsers 削除失敗（' + em + '）: ' + fsErr);
      }
    });

    // ADMIN_EMAILS からも全メールを削除
    var adminRaw = getProperty(PROP_KEYS.ADMIN_EMAILS) || '';
    var adminList = adminRaw.split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(function(e) { return e.length > 0; });
    var newAdminList = adminList.filter(function(e) { return allEmails.indexOf(e) === -1; });
    if (newAdminList.length !== adminList.length) {
      setProperty(PROP_KEYS.ADMIN_EMAILS, newAdminList.join(','));
    }

    logAdminAction('removeUserAccess', { email: email, allEmails: allEmails });
    return { success: true, message: email + ' のアクセスを削除しました（全メール・通知設定も解除されました）' };
  } catch (error) {
    Logger.log('❌ removeUserAccessエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在の講師のメールアドレスを取得する
 * 設定タブのメールアドレス管理UIで使用
 * @aiCallable
 * @return {Object} { success, emails: string[], teacherId, error }
 */
function getTeacherEmails() {
  try {
    var staff = getCurrentStaff_();
    if (!staff) return { success: false, error: '講師情報が見つかりません' };

    var teacherId = staff.teacherId || staff._id;
    var currentEmail = getCurrentUserEmail().toLowerCase();
    var emails = Array.isArray(staff.emails) ? staff.emails.slice() : (staff.email ? [staff.email] : []);
    return { success: true, emails: emails, teacherId: teacherId, currentEmail: currentEmail };
  } catch (error) {
    Logger.log('❌ getTeacherEmailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 現在の講師のメールアドレスを変更する
 * 設定タブのメールアドレス管理UIで使用
 * @aiCallable
 * @param {string} newEmail 新しいメールアドレス
 * @return {Object} { success, emails, message, error }
 */
function addEmailToTeacher(newEmail) {
  try {
    var staff = getCurrentStaff_();
    if (!staff) return { success: false, error: '講師情報が見つかりません' };

    newEmail = (newEmail || '').trim().toLowerCase();
    if (!newEmail || newEmail.indexOf('@') === -1) {
      return { success: false, error: '正しいメールアドレスを入力してください' };
    }

    var teacherId = staff.teacherId || staff._id;

    // 自分の emails 配列に既にあるか確認
    if (!Array.isArray(staff.emails)) staff.emails = staff.email ? [staff.email] : [];
    if (staff.emails.indexOf(newEmail) !== -1) {
      return { success: false, error: 'このメールアドレスは既に登録されています' };
    }

    // 他のスタッフに登録されていないか確認
    var existing = supabaseRpc_('find_staff_by_auth', { p_uid: null, p_email: newEmail });
    if (existing && existing.length > 0) {
      if (existing[0].id !== teacherId) {
        return { success: false, error: 'このメールアドレスは既に別の講師に登録されています' };
      }
    }

    // emails 配列に追加
    staff.emails.push(newEmail);
    writeStaffToSupabase_(staff);
    Logger.log('✓ addEmailToTeacher: ' + newEmail + ' を ' + teacherId + ' に追加');

    // allowedUsers にも追加
    try {
      firestoreSet_('allowedUsers', newEmail, { email: newEmail, addedAt: new Date().toISOString() });
    } catch (fsErr) {
      Logger.log('⚠ addEmailToTeacher: allowedUsers 登録失敗: ' + fsErr);
    }

    return { success: true, message: 'メールアドレスを追加しました', emails: staff.emails.slice() };
  } catch (error) {
    Logger.log('❌ addEmailToTeacherエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * メールアドレスの削除（staffs は1ドキュメント1メールのため、変更で対応）
 * 設定タブのメールアドレス管理UIで使用
 * @aiCallable
 * @param {string} emailToRemove 削除するメールアドレス
 * @return {Object} { success, emails, message, error }
 */
function removeEmailFromTeacher(emailToRemove) {
  try {
    var staff = getCurrentStaff_();
    if (!staff) return { success: false, error: '講師情報が見つかりません' };

    emailToRemove = (emailToRemove || '').trim().toLowerCase();
    if (!emailToRemove) return { success: false, error: 'メールアドレスを指定してください' };

    if (!Array.isArray(staff.emails)) staff.emails = staff.email ? [staff.email] : [];

    // 最低1件は残す
    if (staff.emails.length <= 1) {
      return { success: false, error: 'メールアドレスは最低1つ必要です。削除する前に別のメールアドレスを追加してください' };
    }

    var idx = staff.emails.indexOf(emailToRemove);
    if (idx === -1) return { success: false, error: 'このメールアドレスは登録されていません' };

    staff.emails.splice(idx, 1);
    // スカラー email が削除対象だった場合、残りの先頭に更新
    if (staff.email === emailToRemove) {
      staff.email = staff.emails[0];
    }
    writeStaffToSupabase_(staff);
    Logger.log('✓ removeEmailFromTeacher: ' + emailToRemove + ' を削除');

    // allowedUsers からも削除
    try {
      firestoreDelete_('allowedUsers', emailToRemove);
    } catch (fsErr) {
      Logger.log('⚠ removeEmailFromTeacher: allowedUsers 削除失敗: ' + fsErr);
    }

    return { success: true, message: 'メールアドレスを削除しました', emails: staff.emails.slice() };
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
 * 最初の管理者を登録する
 * ADMIN_EMAILS が空の場合のみ実行可能（2回目以降は拒否される）
 * staffs コレクションにドキュメントを作成し、firebaseUid も保存する
 * @param {string} [displayName] 表示名（省略可）
 * @return {Object} { success, message/error }
 */
function initializeFirstAdmin(displayName) {
  try {
    if (getProperty(PROP_KEYS.ADMIN_EMAILS)) {
      return { success: false, error: '管理者は既に登録されています' };
    }
    var email = getCurrentUserEmail();
    if (!email || email === 'unknown@example.com') {
      return { success: false, error: 'Googleアカウントにログインしてください' };
    }
    var emailLower = email.toLowerCase();
    var name = (displayName || '').trim();

    // 1. ADMIN_EMAILS に登録
    setProperty(PROP_KEYS.ADMIN_EMAILS, emailLower);

    // 2. 既存の staffs ドキュメントを検索して再利用（リセット後の再登録でも重複を作らない）
    var firebaseUid = _firebaseUidContext_ || null;
    Logger.log('initializeFirstAdmin: firebaseUid=' + (firebaseUid || '(空)') + ' uidContext=' + (_firebaseUidContext_ || '(空)'));
    var existingStaff = resolveStaffByUid_(firebaseUid, emailLower);
    var teacherId;
    if (existingStaff) {
      // 既存ドキュメントの名前を更新して再利用
      teacherId = existingStaff.teacherId || existingStaff._id;
      existingStaff.name = name;
      existingStaff.displayName = name;
      existingStaff.email = emailLower;
      if (!existingStaff.emails) existingStaff.emails = [];
      if (existingStaff.emails.indexOf(emailLower) === -1) existingStaff.emails.push(emailLower);
      if (firebaseUid) {
        if (!existingStaff.firebaseUids) existingStaff.firebaseUids = [];
        if (existingStaff.firebaseUids.indexOf(firebaseUid) === -1) existingStaff.firebaseUids.push(firebaseUid);
        existingStaff.firebaseUid = firebaseUid;
      }
      existingStaff.updatedAt = new Date().toISOString();
      writeStaffToSupabase_(existingStaff);
      Logger.log('✓ initializeFirstAdmin: 既存 staffs を更新 teacherId=' + teacherId);
    } else {
      // 新規作成
      teacherId = 'T' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      supabaseUpsert_('staffs', {
        id: teacherId,
        email: emailLower,
        emails: [emailLower],
        name: name,
        firebase_uid: firebaseUid,
        firebase_uids: firebaseUid ? [firebaseUid] : [],
        line_user_id: null,
        display_name: name,
        subjects: [],
        preferred_campuses: [],
        ai_assistant_name: '',
        ai_personality: '',
        theme_color: '',
        notification_method: 'gmail',
        notification_email: '',
        added_at: new Date().toISOString()
      }, 'id');
    }

    // 3. allowedUsers に登録
    firestoreSet_('allowedUsers', emailLower, { email: emailLower, addedAt: new Date().toISOString() });

    Logger.log('✓ initializeFirstAdmin: 管理者登録完了 email=' + emailLower + ' teacherId=' + teacherId);
    return { success: true, message: emailLower + ' を管理者として登録しました' };
  } catch (error) {
    Logger.log('❌ initializeFirstAdminエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
