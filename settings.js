// ========================================
// 【セクション5】設定管理
// ========================================
// ユーザー設定の取得・更新、プロパティ管理
// 更新 2026-03-29b

// ユーザーキャッシュ（同一GAS実行内でのみ有効）
// USER_DEPLOYING環境でもSession.getActiveUser().getEmail()は正しく返るためこれで識別
var _safeUserKey_ = null;

/**
 * 現在ユーザーのScriptPropertyキープレフィックスを返す内部ヘルパー
 * staffs にマッピングされないキーで引き続き使用
 * @return {string} "_UP_{safeEmail}_" 形式の文字列
 */
function getSafeUserKey_() {
  if (_safeUserKey_) return _safeUserKey_;
  try {
    var email = getCurrentUserEmail() || 'anonymous';
    if (email === 'unknown@example.com') email = 'anonymous';
    _safeUserKey_ = '_UP_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_';
  } catch(e) {
    _safeUserKey_ = '_UP_anonymous_';
  }
  return _safeUserKey_;
}

// ========================================
// Firestore staffs コレクション連携
// ========================================
// スタッフ情報は Firestore staffs/{teacherId} に集約。
// getUserProperty / setUserProperty はスタッフ系キーを自動的に Firestore へ振り分ける。

/** スタッフドキュメントキャッシュ（同一GAS実行内でのみ有効） */
var _currentStaff_ = null;

/** Firebase UID コンテキスト（handleApiCall_ 等から設定される） */
var _firebaseUidContext_ = null;

/** _UP_ キー → staffs フィールド名のマッピング */
var STAFF_FIELD_MAP_ = {
  'DISPLAY_NAME':       'displayName',
  'SUBJECTS':           'subjects',
  'PREFERRED_CAMPUSES': 'preferredCampuses',
  'AI_ASSISTANT_NAME':  'aiAssistantName',
  'AI_PERSONALITY':     'aiPersonality',
  'USER_THEME_COLOR':   'themeColor',
  'TEACHER_ID':         'teacherId',
  'REGISTERED_EMAIL':   'email'
};

/** JSON配列として保存されるフィールド（getUserProperty は文字列で返す必要がある） */
var STAFF_ARRAY_FIELDS_ = { 'SUBJECTS': true, 'PREFERRED_CAMPUSES': true };

/**
 * Firebase UID をこの実行コンテキストに設定する
 * @param {string} uid Firebase UID
 */
function setFirebaseUidContext_(uid) {
  _firebaseUidContext_ = uid || null;
}

/**
 * Firebase UID またはメールアドレスで staffs コレクションからスタッフを照合する
 * 照合順序: firebaseUids 配列 → firebaseUid スカラー → emails 配列 → email スカラー
 * マッチ後、現在の UID/メールが配列に未登録なら自動追加（レガシー自動マイグレーション）
 * @param {string} firebaseUid Firebase UID（省略可）
 * @param {string} email メールアドレス（省略可）
 * @return {Object|null} スタッフドキュメント or null
 */
function resolveStaffByUid_(firebaseUid, email) {
  if (_currentStaff_) return _currentStaff_;

  var staff = null;
  var emailLower = email ? email.toLowerCase() : '';

  // 1. firebaseUids 配列で検索（最速パス）
  if (!staff && firebaseUid) {
    var byUids = firestoreQuery_('staffs', [fsFilter_('firebaseUids', 'ARRAY_CONTAINS', firebaseUid)], 1);
    if (byUids && byUids.length > 0) staff = byUids[0];
  }

  // 2. レガシー: firebaseUid スカラーで検索
  if (!staff && firebaseUid) {
    var byUid = firestoreQuery_('staffs', [fsFilter_('firebaseUid', 'EQUAL', firebaseUid)], 1);
    if (byUid && byUid.length > 0) staff = byUid[0];
  }

  // 3. emails 配列で検索
  if (!staff && emailLower) {
    var byEmails = firestoreQuery_('staffs', [fsFilter_('emails', 'ARRAY_CONTAINS', emailLower)], 1);
    if (byEmails && byEmails.length > 0) staff = byEmails[0];
  }

  // 4. レガシー: email スカラーで検索
  if (!staff && emailLower) {
    var byEmail = firestoreQuery_('staffs', [fsFilter_('email', 'EQUAL', emailLower)], 1);
    if (byEmail && byEmail.length > 0) staff = byEmail[0];
  }

  // 5. マッチ後: 配列フィールドの自動マイグレーション＆現在の UID/メール追加
  if (staff) {
    var updated = false;
    // emails 配列がなければ作成
    if (!Array.isArray(staff.emails)) {
      staff.emails = staff.email ? [staff.email] : [];
      updated = true;
    }
    // firebaseUids 配列がなければ作成
    if (!Array.isArray(staff.firebaseUids)) {
      staff.firebaseUids = staff.firebaseUid ? [staff.firebaseUid] : [];
      updated = true;
    }
    // 現在のメールが配列に未登録なら追加
    if (emailLower && staff.emails.indexOf(emailLower) === -1) {
      staff.emails.push(emailLower);
      updated = true;
    }
    // 現在の UID が配列に未登録なら追加
    if (firebaseUid && staff.firebaseUids.indexOf(firebaseUid) === -1) {
      staff.firebaseUids.push(firebaseUid);
      updated = true;
    }
    // スカラーフィールドを最新値で更新（後方互換）
    if (emailLower && staff.email !== emailLower) { staff.email = emailLower; updated = true; }
    if (firebaseUid && staff.firebaseUid !== firebaseUid) { staff.firebaseUid = firebaseUid; updated = true; }

    if (updated) {
      writeStaffToFirestore_(staff);
      Logger.log('✓ resolveStaffByUid_: 配列更新 teacherId=' + (staff.teacherId || staff._id));
    }
    _currentStaff_ = staff;
  }
  return staff;
}

/**
 * 現在のコンテキストからスタッフを解決する内部ヘルパー
 * @return {Object|null} スタッフドキュメント or null
 */
function getCurrentStaff_() {
  if (_currentStaff_) return _currentStaff_;
  var email = getCurrentUserEmail();
  return resolveStaffByUid_(_firebaseUidContext_, email);
}

/**
 * スタッフドキュメントを Firestore に書き込む内部ヘルパー
 * _id フィールド（firestoreQuery_ が付加するメタ情報）は除外して書き込む
 * @param {Object} staff スタッフドキュメント
 */
function writeStaffToFirestore_(staff) {
  var docId = staff.teacherId || staff._id;
  var writeData = {};
  Object.keys(staff).forEach(function(k) {
    if (k !== '_id') writeData[k] = staff[k];
  });
  firestoreSet_('staffs', docId, writeData);
}

/**
 * 設定を取得（Web UI用）
 * 現在のユーザーが見られる設定を返す
 * APIキーなどはマスク処理済み
 * @return {Object} 設定オブジェクト
 */
function getSettings() {
  try {
    // アプリフォルダ直下の assets フォルダから logo.png の公開URLを取得
    var logoUrl = '';
    try {
      var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
      if (rootFolderId) {
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var assetsFolders = rootFolder.getFoldersByName('assets');
        if (assetsFolders.hasNext()) {
          var assetsFolder = assetsFolders.next();
          var logoFiles = assetsFolder.getFilesByName('logo.png');
          if (logoFiles.hasNext()) {
            var logoFile = logoFiles.next();
            var logoBlob = logoFile.getBlob();
            var logoBase64 = Utilities.base64Encode(logoBlob.getBytes());
            logoUrl = 'data:image/png;base64,' + logoBase64;
          }
        }
      }
    } catch (e) {
      Logger.log('❌ assets取得エラー: ' + e);
    }

    var settings = {
      geminiApiKey: getProperty(PROP_KEYS.GEMINI_API_KEY) ? '***設定済み***' : '未設定',
      appFolderId: getProperty(PROP_KEYS.APP_FOLDER_ID) || '',
      themeColor: getUserProperty('USER_THEME_COLOR') || getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b',
      currentUser: getCurrentUserEmail(),
      displayName: getUserProperty('DISPLAY_NAME') || '',
      logoUrl: logoUrl
    };

    return settings;
  } catch (error) {
    Logger.log('❌ getSettingsエラー: ' + error);
    return { error: error.toString() };
  }
}

/**
 * 設定を更新
 * Admin のみが設定の保存を実行可能
 * @param {Object} settingsData 更新するデータ
 * @return {Object} { success, message, error }
 */
function updateSettings(settingsData) {
  try {
    // APIキーの更新（Admin のみ）
    if (settingsData.geminiApiKey && settingsData.geminiApiKey !== '***設定済み***') {
      if (!isAdmin()) {
        return { success: false, error: 'APIキーの更新は Admin のみ可能です' };
      }
      setProperty(PROP_KEYS.GEMINI_API_KEY, settingsData.geminiApiKey);
    }

    // フォルダIDの更新（Admin のみ）
    if (settingsData.appFolderId) {
      if (!isAdmin()) {
        return { success: false, error: 'フォルダIDの更新は Admin のみ可能です' };
      }
      setProperty(PROP_KEYS.APP_FOLDER_ID, settingsData.appFolderId);
    }

    // アクセス許可フォルダIDの更新（Admin のみ）
    if (settingsData.accessFolderId) {
      if (!isAdmin()) {
        return { success: false, error: 'アクセスフォルダIDの更新は Admin のみ可能です' };
      }
      setProperty(PROP_KEYS.ACCESS_FOLDER_ID, settingsData.accessFolderId);
    }

    // テーマカラーの更新
    if (settingsData.themeColor) {
      setProperty(PROP_KEYS.THEME_COLOR, settingsData.themeColor);
    }

    return { success: true, message: '設定を更新しました' };

  } catch (error) {
    Logger.log('❌ updateSettingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【セクション6】プロフィール管理
// ========================================
// ユーザープロフィール、表示名、職位、教科管理

/**
 * ユーザープロパティを取得
 * スタッフ系キー（DISPLAY_NAME, SUBJECTS 等）→ Firestore staffs から取得
 * その他のキー → 従来の _UP_ ScriptProperties から取得
 * @param {string} key プロパティキー
 * @return {string} 値（存在しない場合は空文字列）
 */
function getUserProperty(key) {
  var firestoreField = STAFF_FIELD_MAP_[key];
  if (firestoreField) {
    var staff = getCurrentStaff_();
    if (staff) {
      var val = staff[firestoreField];
      if (val === undefined || val === null) return '';
      if (STAFF_ARRAY_FIELDS_[key]) return JSON.stringify(val);
      return String(val);
    }
    return '';
  }
  // staffs にマッピングされないキーは従来の _UP_ から取得
  return PropertiesService.getScriptProperties().getProperty(getSafeUserKey_() + key) || '';
}

/**
 * ユーザープロパティを設定
 * スタッフ系キー → Firestore staffs/{teacherId} に書き込み
 * その他のキー → 従来の _UP_ ScriptProperties に書き込み
 * @param {string} key プロパティキー
 * @param {string} value 設定する値
 * @return {boolean} 常に true
 */
function setUserProperty(key, value) {
  var firestoreField = STAFF_FIELD_MAP_[key];
  if (firestoreField) {
    var staff = getCurrentStaff_();
    if (staff) {
      var writeVal = value;
      if (STAFF_ARRAY_FIELDS_[key]) {
        try { writeVal = JSON.parse(value); } catch(e) { writeVal = []; }
      }
      staff[firestoreField] = writeVal;
      writeStaffToFirestore_(staff);
      // 古い _UP_ スクリプトプロパティを削除（移行クリーンアップ）
      try {
        var sp = PropertiesService.getScriptProperties();
        sp.deleteProperty(getSafeUserKey_() + key);
        sp.deleteProperty('_UP_anonymous_' + key);
      } catch(e) {}
      return true;
    }
  }
  // staffs にマッピングされないキーは従来の _UP_ へ保存
  PropertiesService.getScriptProperties().setProperty(getSafeUserKey_() + key, value);
  return true;
}

/**
 * Firestore 移行済みの _UP_ スクリプトプロパティを一括削除
 * STAFF_FIELD_MAP_ のキーに対応する古い _UP_ キーをすべて削除する。
 * アプリ起動時（getAppStartupData）に呼び出される。
 */
function cleanupMigratedUserProperties_() {
  try {
    var sp = PropertiesService.getScriptProperties();
    var all = sp.getProperties();
    var migratedKeys = Object.keys(STAFF_FIELD_MAP_);
    // 廃止済みの _UP_ キー（コードから削除済みで使われていないもの）
    var obsoleteKeys = [
      'PROFILE_UPDATED',
      'GEMINI_DAILY_DATE', 'GEMINI_DAILY_CALLS', 'GEMINI_DAILY_TOKENS', 'GEMINI_DAILY_OPS',
      'GEMINI_MONTHLY_KEY', 'GEMINI_MONTHLY_CALLS', 'GEMINI_MONTHLY_TOKENS'
    ];
    var toDelete = Object.keys(all).filter(function(propKey) {
      if (propKey.indexOf('_UP_') !== 0) return false;
      // STAFF_FIELD_MAP_ に含まれるキーの旧 _UP_ バージョン
      if (migratedKeys.some(function(mk) {
        return propKey.slice(-(mk.length + 1)) === '_' + mk;
      })) return true;
      // その他の廃止済みキー
      return obsoleteKeys.some(function(ok) {
        return propKey.slice(-(ok.length + 1)) === '_' + ok;
      });
    });
    toDelete.forEach(function(k) {
      try { sp.deleteProperty(k); } catch(e) {}
    });
    if (toDelete.length > 0) {
      Logger.log('✓ cleanupMigratedUserProperties_: ' + toDelete.length + ' 件の古い _UP_ キーを削除');
    }
  } catch(e) {
    // クリーンアップ失敗はサイレントに無視
  }
}

/**
 * ユーザーが登録したメールアドレスを取得
 * staffs コレクションの email フィールドから取得する
 * @return {string} メールアドレス
 */
function getRegisteredEmail() {
  try {
    var staff = getCurrentStaff_();
    if (staff && staff.email) return staff.email;
    return getCurrentUserEmail();
  } catch (error) {
    Logger.log('❌ getRegisteredEmailエラー: ' + error);
    return getCurrentUserEmail();
  }
}

/**
 * ユーザーのプロフィール情報を取得
 * Firestore staffs/{teacherId} から直接読み取る
 * @aiCallable
 * @return {Object} プロフィール情報
 */
function getUserProfile() {
  try {
    var currentEmail = getCurrentUserEmail();
    var staff = getCurrentStaff_();

    if (!staff) {
      return { success: false, error: '未登録のユーザーです' };
    }

    var teacherId = staff.teacherId || staff._id;
    var displayName = staff.displayName || staff.name || getDisplayName(currentEmail);

    var subjects = staff.subjects || [];
    if (typeof subjects === 'string') {
      try { subjects = JSON.parse(subjects); } catch(e) { subjects = []; }
    }

    var aiAssistantName = staff.aiAssistantName || 'イノイマン';
    var aiPersonality = staff.aiPersonality || 'polite';
    var themeColor = staff.themeColor || getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b';
    var preferredCampuses = staff.preferredCampuses || [];
    if (typeof preferredCampuses === 'string') {
      preferredCampuses = safeJsonParse_(preferredCampuses, []);
    }

    // プロフィール写真の取得（Drive の assets/profile-photos/{teacherId}.jpg）
    var profilePhotoUrl = '';
    try {
      var photoRootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
      if (photoRootFolderId) {
        var photoRootFolder = DriveApp.getFolderById(photoRootFolderId);
        var photoAssetsFolders = photoRootFolder.getFoldersByName('assets');
        if (photoAssetsFolders.hasNext()) {
          var photoAssetsFolder = photoAssetsFolders.next();
          var pfFolders = photoAssetsFolder.getFoldersByName('profile-photos');
          if (pfFolders.hasNext()) {
            var pfFolder = pfFolders.next();
            var photoFiles = pfFolder.getFilesByName(teacherId + '.jpg');
            if (photoFiles.hasNext()) {
              var photoBlob = photoFiles.next().getBlob();
              profilePhotoUrl = 'data:image/jpeg;base64,' + Utilities.base64Encode(photoBlob.getBytes());
            }
          }
        }
      }
    } catch (photoErr) {
      Logger.log('⚠ getUserProfile: プロフィール写真読み込みエラー: ' + photoErr);
    }

    return {
      success: true,
      currentEmail: currentEmail,
      registeredEmail: staff.email || currentEmail,
      teacherId: teacherId,
      displayName: displayName,
      isDisplayNameSet: !!staff.displayName,
      subjects: subjects,
      subjectsDisplay: subjects.join(', ') || 'なし',
      aiAssistantName: aiAssistantName,
      aiPersonality: aiPersonality,
      themeColor: themeColor,
      preferredCampuses: preferredCampuses,
      lastUpdated: staff.updatedAt || staff.addedAt || new Date().toISOString(),
      profilePhotoUrl: profilePhotoUrl
    };

  } catch (error) {
    Logger.log('❌ getUserProfileエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ユーザーの講師IDを取得
 * Firestore staffs コレクションから解決する（自動生成はしない）
 * @return {string|null} 講師ID（未登録の場合は null）
 */
function getOrCreateTeacherId() {
  try {
    var staff = getCurrentStaff_();
    if (staff) return staff.teacherId || staff._id;
    return null;
  } catch (error) {
    Logger.log('❌ getOrCreateTeacherIdエラー: ' + error);
    return null;
  }
}

/**
 * メールアドレスを変更
 * @aiCallable
 * @param {string} newEmail 新しいメールアドレス
 * @return {Object} { success, message, oldEmail, newEmail, note, error }
 */
function updateEmailAddress(newEmail) {
  try {
    newEmail = (newEmail || '').trim().toLowerCase();
    
    // バリデーション
    if (!newEmail) {
      return { success: false, error: 'メールアドレスを入力してください' };
    }
    
    // メール形式チェック
    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return { success: false, error: '有効なメールアドレスを入力してください' };
    }
    
    var oldEmail = getRegisteredEmail();
    
    if (newEmail === oldEmail) {
      return { success: false, error: 'このメールアドレスは既に登録されています' };
    }
    
    // メール変更を保存
    setUserProperty('REGISTERED_EMAIL', newEmail);
    setUserProperty('EMAIL_UPDATED', new Date().toISOString());
    
    
    return {
      success: true,
      message: 'メールアドレスを変更しました',
      oldEmail: oldEmail,
      newEmail: newEmail,
      note: '※ 新しいメールアドレスでログインすることで機能します'
    };
    
  } catch (error) {
    Logger.log('❌ updateEmailAddressエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * プロフィール情報を更新
 * Firestore staffs/{teacherId} に直接書き込む
 * @aiCallable
 * @param {Object} profileData { displayName, subjects, aiAssistantName, aiPersonality, themeColor }
 * @return {Object} { success, message, profile, error }
 */
function updateUserProfile(profileData) {
  try {
    var staff = getCurrentStaff_();
    if (!staff) {
      return { success: false, error: '未登録のユーザーです' };
    }

    // バリデーション
    if (!profileData.displayName || profileData.displayName.trim().length === 0) {
      return { success: false, error: '名前は必須です' };
    }

    profileData.displayName = profileData.displayName.trim();

    // 担当教科の処理
    var subjects = profileData.subjects || [];
    if (typeof subjects === 'string') {
      subjects = subjects.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
    }

    // 長さチェック
    if (profileData.displayName.length > 50) {
      return { success: false, error: '名前は50文字以下にしてください' };
    }
    if (subjects.length > 10) {
      return { success: false, error: '担当教科は最大10個までです' };
    }

    // AIアシスタント名
    var aiName = (profileData.aiAssistantName || '').trim() || 'イノイマン';

    // AIアシスタントの喋り方
    var validPersonalities = ['polite', 'friendly', 'energetic', 'cool', 'kansai', 'hakata', 'tohoku', 'nagoya', 'awa'];
    var aiPersonality = validPersonalities.indexOf(profileData.aiPersonality) !== -1 ? profileData.aiPersonality : 'polite';

    // テーマカラー（#xxxxxx形式のみ受け付ける）
    var themeColor = (profileData.themeColor || '').trim();

    // staffs ドキュメントを更新（一括書き込み）
    staff.displayName = profileData.displayName;
    staff.name = profileData.displayName;
    staff.subjects = subjects;
    staff.aiAssistantName = aiName;
    staff.aiPersonality = aiPersonality;
    if (/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
      staff.themeColor = themeColor;
    }
    staff.updatedAt = new Date().toISOString();

    writeStaffToFirestore_(staff);

    return {
      success: true,
      message: 'プロフィールを更新しました',
      profile: {
        displayName: profileData.displayName,
        subjects: subjects
      }
    };

  } catch (error) {
    Logger.log('❌ updateUserProfileエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ユーザー個別のテーマカラー設定をリセットし、システムデフォルトに戻す
 * Firestore staffs/{teacherId} の themeColor を空にする
 * @aiCallable
 * @return {Object} { success, themeColor } themeColor はリセット後の有効カラー
 */
function resetUserThemeColor() {
  try {
    var staff = getCurrentStaff_();
    if (staff) {
      staff.themeColor = '';
      writeStaffToFirestore_(staff);
    }
    var effectiveColor = getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b';
    return { success: true, themeColor: effectiveColor };
  } catch (error) {
    Logger.log('❌ resetUserThemeColorエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 配属校舎リストを保存（ユーザーごと）
 * チェックボックス変更時に自動で呼ばれる
 * @aiCallable
 * @param {Array} campusCodes 校舎コードの配列（例: ['01', '03']）
 * @return {Object} 成功/失敗
 */
function savePreferredCampuses(campusCodes) {
  try {
    var codes = Array.isArray(campusCodes) ? campusCodes : [];
    setUserProperty('PREFERRED_CAMPUSES', JSON.stringify(codes));
    return { success: true, message: '保存しました' };
  } catch (error) {
    Logger.log('❌ savePreferredCampusesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * プロフィール写真を Drive に保存する
 * assets/profile-photos/{teacherId}.jpg として保存（既存ファイルは上書き）
 * @aiCallable
 * @param {string} base64Image base64エンコードされた画像データ
 * @param {string} mimeType 画像のMIMEタイプ（例: 'image/jpeg'）
 * @return {Object} { success, message, error }
 */
function saveProfilePhoto(base64Image, mimeType) {
  try {
    var teacherId = getOrCreateTeacherId();
    var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!rootFolderId) {
      return { success: false, error: 'アプリフォルダが設定されていません' };
    }

    var rootFolder = DriveApp.getFolderById(rootFolderId);

    // assets フォルダ取得/作成
    var assetsFolders = rootFolder.getFoldersByName('assets');
    var assetsFolder = assetsFolders.hasNext() ? assetsFolders.next() : rootFolder.createFolder('assets');

    // profile-photos フォルダ取得/作成
    var pfFolders = assetsFolder.getFoldersByName('profile-photos');
    var pfFolder = pfFolders.hasNext() ? pfFolders.next() : assetsFolder.createFolder('profile-photos');

    // 既存ファイルをゴミ箱へ
    var fileName = teacherId + '.jpg';
    var existing = pfFolder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    // 新規保存
    var imageBytes = Utilities.base64Decode(base64Image);
    var blob = Utilities.newBlob(imageBytes, mimeType || 'image/jpeg', fileName);
    pfFolder.createFile(blob);

    Logger.log('✓ saveProfilePhoto: 保存完了 teacherId=' + teacherId);
    return { success: true, message: '写真を保存しました' };
  } catch (error) {
    Logger.log('❌ saveProfilePhotoエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 教科リスト（選択肢）を取得
 * プロフィール設定で使用
 * @aiCallable
 * @return {Array} 教科名配列
 */
function getSubjectOptions() {
  return [
    '英語',
    '数学',
    '国語',
    '理科',
    '物理',
    '化学',
    '社会'
  ];
}

/**
 * アプリ起動時の初期データを一括取得する（高速起動用）
 * Firestore staffs コレクションからスタッフを照合し、基本設定を返す。
 * Drive API（ロゴ・ファビコン）は含まない。
 * @param {string} firebaseEmail Firebase Auth のメールアドレス
 * @param {string} firebaseUid Firebase Auth の UID（省略可）
 * @return {Object} 起動に必要なデータ一式
 */
function getAppStartupData(firebaseEmail, firebaseUid) {
  try {
    // Firebase Auth コンテキストをセット
    if (firebaseEmail) setFirebaseEmailContext_(firebaseEmail);
    if (firebaseUid) setFirebaseUidContext_(firebaseUid);
    var email = getCurrentUserEmail();

    // 管理者かどうかを素早く判定（ScriptProperties の文字列比較のみ・Drive API不要）
    var adminEmailsRaw = getProperty(PROP_KEYS.ADMIN_EMAILS) || '';
    var adminList = adminEmailsRaw.split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(function(e) { return e; });
    var isAdminResult = email && adminList.indexOf(email.toLowerCase()) !== -1;

    // 初回セットアップチェック（Admin未登録なら true）
    var isFirstSetup = adminList.length === 0;

    // Firestore staffs からスタッフを照合
    var staff = resolveStaffByUid_(firebaseUid || _firebaseUidContext_, email);

    var teacherId       = '';
    var displayName     = '';
    var themeColor      = getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b';
    var aiAssistantName = 'イノイマン';
    var aiPersonality   = 'polite';
    var preferredCampuses = [];

    if (staff) {
      teacherId       = staff.teacherId || staff._id || '';
      displayName     = staff.displayName || staff.name || '';
      themeColor      = staff.themeColor || themeColor;
      aiAssistantName = staff.aiAssistantName || aiAssistantName;
      aiPersonality   = staff.aiPersonality || aiPersonality;
      preferredCampuses = staff.preferredCampuses || [];
      if (typeof preferredCampuses === 'string') {
        preferredCampuses = safeJsonParse_(preferredCampuses, []);
      }
    }

    var geminiApiKey   = getProperty(PROP_KEYS.GEMINI_API_KEY) ? '***設定済み***' : '未設定';
    var appFolderId    = getProperty(PROP_KEYS.APP_FOLDER_ID) || '';
    var accessFolderId = getProperty(PROP_KEYS.ACCESS_FOLDER_ID) || '';

    // 未登録スタッフ判定（Admin と初回セットアップは除く）
    var isUnregistered = !isFirstSetup && !isAdminResult && !staff;

    // 移行済み _UP_ キーの一括クリーンアップ（スタッフ登録済みの場合のみ）
    if (staff) cleanupMigratedUserProperties_();

    // Firestore allowedUsers に自動登録（スタッフまたはAdminの場合）
    if (email && (staff || isAdminResult)) {
      try {
        firestoreSet_('allowedUsers', email.toLowerCase(), { email: email.toLowerCase(), addedAt: new Date().toISOString() });
      } catch (e) {
        Logger.log('⚠ getAppStartupData: allowedUsers 自動登録失敗（機能への影響なし）: ' + e);
      }
    }

    Logger.log('✓ getAppStartupData: 完了（admin=' + isAdminResult + ', firstSetup=' + isFirstSetup + ', staff=' + !!staff + '）');
    return {
      success: true,
      isFirstSetup: isFirstSetup,
      currentUserEmail: email,
      isAdmin: isAdminResult,
      needsIdInput: isUnregistered,  // 後方互換（将来削除予定）
      isUnregistered: isUnregistered,
      teacherId: teacherId,
      themeColor: themeColor,
      displayName: displayName,
      geminiApiKey: geminiApiKey,
      appFolderId: appFolderId,
      accessFolderId: accessFolderId,
      aiAssistantName: aiAssistantName,
      aiPersonality: aiPersonality,
      preferredCampuses: preferredCampuses
    };
  } catch (error) {
    Logger.log('❌ getAppStartupDataエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
