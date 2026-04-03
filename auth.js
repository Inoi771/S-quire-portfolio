
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
    return { email: user.email || null, uid: user.localId || null };
  } catch (e) {
    Logger.log('❌ verifyFirebaseIdToken_エラー: ' + e);
    return null;
  }
}

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

    // 3. Firebase UID で staffs 検索（2回目以降の最速パス）
    if (_firebaseUidContext_) {
      try {
        var staffByUids = firestoreQuery_('staffs', [fsFilter_('firebaseUids', 'ARRAY_CONTAINS', _firebaseUidContext_)], 1);
        if (staffByUids && staffByUids.length > 0) {
          Logger.log('✓ isAllowedUser: firebaseUids で許可: ' + _firebaseUidContext_);
          return true;
        }
        // レガシーフォールバック
        var staffByUid = firestoreQuery_('staffs', [fsFilter_('firebaseUid', 'EQUAL', _firebaseUidContext_)], 1);
        if (staffByUid && staffByUid.length > 0) {
          Logger.log('✓ isAllowedUser: firebaseUid(legacy) で許可');
          return true;
        }
      } catch (uidErr) {
        Logger.log('⚠ isAllowedUser: UID チェックエラー（スキップ）: ' + uidErr);
      }
    }

    // 4. Firestore staffs の emails 配列でメールチェック
    try {
      var staffByEmails = firestoreQuery_('staffs', [fsFilter_('emails', 'ARRAY_CONTAINS', email)], 1);
      if (staffByEmails && staffByEmails.length > 0) {
        Logger.log('✓ isAllowedUser: emails で許可: ' + email);
        return true;
      }
      // レガシーフォールバック
      var staffByEmail = firestoreQuery_('staffs', [fsFilter_('email', 'EQUAL', email)], 1);
      if (staffByEmail && staffByEmail.length > 0) {
        Logger.log('✓ isAllowedUser: email(legacy) で許可: ' + email);
        return true;
      }
    } catch (staffErr) {
      Logger.log('⚠ isAllowedUser: staffs チェックエラー（スキップ）: ' + staffErr);
    }

    // 5. Driveフォルダのオーナー・編集者チェック（管理者が手動追加したユーザーの対応）
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

    // Firestore staffs コレクションから登録スタッフを取得
    try {
      var allStaffs = firestoreQuery_('staffs', [], 500);
      (allStaffs || []).forEach(function(staff) {
        var staffEmail = staff.email || '';
        if (!staffEmail) return;
        usersMap[staffEmail] = {
          email: staffEmail,
          name: staff.displayName || staff.name || '',
          role: '登録済み',
          teacherId: staff.teacherId || staff._id || ''
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

    // Firestore staffs に新規スタッフドキュメントを作成
    try {
      var existingStaff = firestoreQuery_('staffs', [fsFilter_('email', 'EQUAL', email)], 1);
      if (!existingStaff || existingStaff.length === 0) {
        var newTeacherId = 'T' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        firestoreSet_('staffs', newTeacherId, {
          teacherId: newTeacherId,
          email: email,
          emails: [email],
          name: '',
          firebaseUid: null,
          firebaseUids: [],
          lineUserId: null,
          displayName: '',
          subjects: [],
          preferredCampuses: [],
          aiAssistantName: '',
          aiPersonality: '',
          themeColor: '',
          notificationMethod: 'gmail',
          notificationEmail: '',
          addedAt: new Date().toISOString()
        });
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

    var currentUser = getCurrentUserEmail().toLowerCase();
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

    // Firestore staffs からスタッフを検索（emails 配列 → レガシー email の順）
    var staff = null;
    try {
      var staffResult = firestoreQuery_('staffs', [fsFilter_('emails', 'ARRAY_CONTAINS', email)], 1);
      if (!staffResult || staffResult.length === 0) {
        staffResult = firestoreQuery_('staffs', [fsFilter_('email', 'EQUAL', email)], 1);
      }
      if (staffResult && staffResult.length > 0) staff = staffResult[0];
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

    // Drive 共有から全メールを解除
    var ownerEmail = folder.getOwner() ? folder.getOwner().getEmail().toLowerCase() : '';
    allEmails.forEach(function(em) {
      if (em !== ownerEmail) {
        try { folder.removeEditor(em); } catch (e) { Logger.log('⚠ removeEditor スキップ: ' + em + ' / ' + e); }
      }
    });

    // Firestore staffs ドキュメントを削除
    if (staff) {
      var teacherId = staff.teacherId || staff._id;
      try {
        firestoreDelete_('staffs', teacherId);
        Logger.log('✓ removeUserAccess: staffs/' + teacherId + ' を削除');
      } catch (fsErr) {
        Logger.log('⚠ removeUserAccess: staffs 削除失敗: ' + fsErr);
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
    return { success: true, message: email + ' のアクセスを削除しました（全メール・Drive共有・通知設定も解除されました）' };
  } catch (error) {
    Logger.log('❌ removeUserAccessエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講師IDで Firestore staffs を検索し、見つかれば現在のユーザーに紐付ける
 * 初回アクセス時の講師ID入力認証に使用。紐付け時に firebaseUid を staffs に書き込む
 * @aiCallable
 * @param {string} inputId 入力された講師ID（例: T1707123456789_abc123def）
 * @return {Object} { success, found, teacherId, displayName, isAdmin, error }
 */
function linkUserById(inputId) {
  try {
    inputId = (inputId || '').trim();
    if (!inputId) return { success: false, found: false, error: '講師IDを入力してください' };

    // Firestore staffs から講師IDでドキュメントを取得
    var staff = firestoreGet_('staffs', inputId);
    if (!staff) {
      return { success: true, found: false };
    }

    // 配列フィールドの初期化（レガシードキュメント対応）
    var updated = false;
    if (!Array.isArray(staff.emails)) { staff.emails = staff.email ? [staff.email] : []; updated = true; }
    if (!Array.isArray(staff.firebaseUids)) { staff.firebaseUids = staff.firebaseUid ? [staff.firebaseUid] : []; updated = true; }

    // 現在のメールアドレスを staffs に反映
    var currentEmail = getCurrentUserEmail();
    if (currentEmail && currentEmail !== 'unknown@example.com') {
      var emailLower = currentEmail.toLowerCase();
      if (staff.emails.indexOf(emailLower) === -1) { staff.emails.push(emailLower); updated = true; }
      staff.email = emailLower; // スカラーも最新値に
      // allowedUsers にも追加
      try {
        firestoreSet_('allowedUsers', emailLower, { email: emailLower, addedAt: new Date().toISOString() });
      } catch (fsErr) {
        Logger.log('⚠ linkUserById: allowedUsers 登録失敗: ' + fsErr);
      }
    }

    // firebaseUid をコンテキストから取得して配列に追加
    if (_firebaseUidContext_) {
      if (staff.firebaseUids.indexOf(_firebaseUidContext_) === -1) { staff.firebaseUids.push(_firebaseUidContext_); updated = true; }
      staff.firebaseUid = _firebaseUidContext_; // スカラーも最新値に
      updated = true;
    }

    if (updated) {
      writeStaffToFirestore_(staff);
      Logger.log('✓ linkUserById: staffs/' + inputId + ' を更新');
    }

    // Admin かどうか確認
    var adminEmails = (getProperty(PROP_KEYS.ADMIN_EMAILS) || '').split(',')
      .map(function(e) { return e.trim().toLowerCase(); })
      .filter(function(e) { return e.length > 0; });
    var isAdminUser = currentEmail && adminEmails.indexOf(currentEmail.toLowerCase()) !== -1;

    var displayName = staff.displayName || staff.name || '';
    Logger.log('✓ linkUserById: ' + inputId + ' に紐付け完了（名前: ' + displayName + '）');
    return { success: true, found: true, teacherId: inputId, displayName: displayName, isAdmin: isAdminUser };

  } catch (error) {
    Logger.log('❌ linkUserByIdエラー: ' + error);
    return { success: false, found: false, error: error.toString() };
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

    // 他のスタッフに登録されていないか確認（配列＋レガシー両方）
    var existing = firestoreQuery_('staffs', [fsFilter_('emails', 'ARRAY_CONTAINS', newEmail)], 1);
    if (!existing || existing.length === 0) {
      existing = firestoreQuery_('staffs', [fsFilter_('email', 'EQUAL', newEmail)], 1);
    }
    if (existing && existing.length > 0) {
      var existTid = existing[0].teacherId || existing[0]._id;
      if (existTid !== teacherId) {
        return { success: false, error: 'このメールアドレスは既に別の講師に登録されています' };
      }
    }

    // emails 配列に追加
    staff.emails.push(newEmail);
    writeStaffToFirestore_(staff);
    Logger.log('✓ addEmailToTeacher: ' + newEmail + ' を ' + teacherId + ' に追加');

    // allowedUsers にも追加
    try {
      firestoreSet_('allowedUsers', newEmail, { email: newEmail, addedAt: new Date().toISOString() });
    } catch (fsErr) {
      Logger.log('⚠ addEmailToTeacher: allowedUsers 登録失敗: ' + fsErr);
    }

    // Drive 共有フォルダにも追加
    try {
      var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
      if (folderId) DriveApp.getFolderById(folderId).addEditor(newEmail);
    } catch (driveErr) {
      Logger.log('⚠ addEmailToTeacher: Drive 共有追加失敗: ' + driveErr);
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
    writeStaffToFirestore_(staff);
    Logger.log('✓ removeEmailFromTeacher: ' + emailToRemove + ' を削除');

    // allowedUsers からも削除
    try {
      firestoreDelete_('allowedUsers', emailToRemove);
    } catch (fsErr) {
      Logger.log('⚠ removeEmailFromTeacher: allowedUsers 削除失敗: ' + fsErr);
    }

    // Drive 共有フォルダからも削除
    try {
      var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
      if (folderId) DriveApp.getFolderById(folderId).removeEditor(emailToRemove);
    } catch (driveErr) {
      Logger.log('⚠ removeEmailFromTeacher: Drive 共有削除失敗: ' + driveErr);
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
 * 初回セットアップが必要かどうかを確認する
 * ADMIN_EMAILS が空の場合、初回セットアップが必要と判断する
 * @return {Object} { isFirstSetup, currentUserEmail, hasAppFolder }
 */
function getSetupStatus() {
  try {
    return {
      isFirstSetup: !getProperty(PROP_KEYS.ADMIN_EMAILS),
      currentUserEmail: getCurrentUserEmail(),
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

    // 2. 講師ID発行 & Firestore staffs に登録
    var teacherId = 'T' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    var firebaseUid = _firebaseUidContext_ || null;
    firestoreSet_('staffs', teacherId, {
      teacherId: teacherId,
      email: emailLower,
      emails: [emailLower],
      name: name,
      firebaseUid: firebaseUid,
      firebaseUids: firebaseUid ? [firebaseUid] : [],
      lineUserId: null,
      displayName: name,
      subjects: [],
      preferredCampuses: [],
      aiAssistantName: '',
      aiPersonality: '',
      themeColor: '',
      notificationMethod: 'gmail',
      notificationEmail: '',
      addedAt: new Date().toISOString()
    });

    // 3. allowedUsers に登録
    firestoreSet_('allowedUsers', emailLower, { email: emailLower, addedAt: new Date().toISOString() });

    Logger.log('✓ initializeFirstAdmin: 管理者登録完了 email=' + emailLower + ' teacherId=' + teacherId);
    return { success: true, message: emailLower + ' を管理者として登録しました' };
  } catch (error) {
    Logger.log('❌ initializeFirstAdminエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 既存の許可ユーザー全員を Firestore allowedUsers コレクションに一括登録する
 * Firestoreセキュリティルール強化前に一度だけ実行する（Admin のみ）
 * 登録対象: ADMIN_EMAILS / Firestore staffs の全メール / Drive共有フォルダのエディター
 * @aiCallable
 * @return {Object} { success, registered, skipped, message, error }
 */
function initFirestoreAllowedUsers() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };
  try {
    var emails = [];

    // 1. ADMIN_EMAILS から取得
    var adminRaw = getProperty(PROP_KEYS.ADMIN_EMAILS) || '';
    adminRaw.split(',').forEach(function(e) {
      var em = e.trim().toLowerCase();
      if (em && emails.indexOf(em) === -1) emails.push(em);
    });

    // 2. Firestore staffs コレクションから全メールアドレスを取得
    try {
      var allStaffs = firestoreQuery_('staffs', [], 500);
      (allStaffs || []).forEach(function(staff) {
        var em = (staff.email || '').toLowerCase();
        if (em && emails.indexOf(em) === -1) emails.push(em);
      });
    } catch (staffErr) {
      Logger.log('⚠ initFirestoreAllowedUsers: staffs 取得失敗: ' + staffErr);
    }

    // 3. Drive共有フォルダのエディター一覧からも取得
    var folderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (folderId) {
      try {
        var folder = DriveApp.getFolderById(folderId);
        folder.getEditors().forEach(function(user) {
          var em = user.getEmail().toLowerCase();
          if (em && emails.indexOf(em) === -1) emails.push(em);
        });
      } catch (e) {
        Logger.log('⚠ initFirestoreAllowedUsers: Drive取得失敗: ' + e);
      }
    }

    // 4. Firestoreに一括登録
    var now = new Date().toISOString();
    var registered = 0;
    var skipped = 0;
    emails.forEach(function(email) {
      try {
        firestoreSet_('allowedUsers', email, { email: email, addedAt: now });
        registered++;
      } catch (e) {
        Logger.log('⚠ initFirestoreAllowedUsers: ' + email + ' 登録失敗: ' + e);
        skipped++;
      }
    });

    var msg = registered + '人をFirestoreに登録しました' + (skipped > 0 ? '（' + skipped + '人失敗）' : '');
    Logger.log('✓ initFirestoreAllowedUsers: ' + msg);
    logAdminAction('initFirestoreAllowedUsers', { registered: registered, skipped: skipped });
    return { success: true, registered: registered, skipped: skipped, message: msg };
  } catch (error) {
    Logger.log('❌ initFirestoreAllowedUsersエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
