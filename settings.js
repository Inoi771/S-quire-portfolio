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
 * @return {string} "_UP_{safeEmail}_" 形式の文字列
 */
function getSafeUserKey_() {
  if (_safeUserKey_) return _safeUserKey_;
  try {
    // getCurrentUserEmail() を使用することで Firebase Auth フォールバックが適用される
    var email = getCurrentUserEmail() || 'anonymous';
    if (email === 'unknown@example.com') email = 'anonymous';
    _safeUserKey_ = '_UP_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_';
  } catch(e) {
    _safeUserKey_ = '_UP_anonymous_';
  }
  return _safeUserKey_;
}

/**
 * 設定を取得（Web UI用）
 * 現在のユーザーが見られる設定を返す
 * APIキーなどはマスク処理済み
 * @return {Object} 設定オブジェクト
 */
function getSettings() {
  try {
    // アプリフォルダ直下の assets フォルダから favicon.png と logo.png の公開URLを取得
    var faviconUrl = '';
    var logoUrl = '';
    try {
      var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
      if (rootFolderId) {
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var assetsFolders = rootFolder.getFoldersByName('assets');
        if (assetsFolders.hasNext()) {
          var assetsFolder = assetsFolders.next();
          var faviconFiles = assetsFolder.getFilesByName('favicon.png');
          if (faviconFiles.hasNext()) {
            var faviconFile = faviconFiles.next();
            var faviconBlob = faviconFile.getBlob();
            var faviconBase64 = Utilities.base64Encode(faviconBlob.getBytes());
            faviconUrl = 'data:image/png;base64,' + faviconBase64;
          }
          // favicon.png がない場合も logo.png をファビコンとして使用
          if (!faviconUrl) {
            var logoFilesForFavicon = assetsFolder.getFilesByName('logo.png');
            if (logoFilesForFavicon.hasNext()) {
              var logoFileForFavicon = logoFilesForFavicon.next();
              var logoFaviconBlob = logoFileForFavicon.getBlob();
              faviconUrl = 'data:image/png;base64,' + Utilities.base64Encode(logoFaviconBlob.getBytes());
            }
          }
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
    // Drive にファビコン画像がない場合、外部URLから取得してCacheServiceでキャッシュ
    if (!faviconUrl) {
      try {
        var faviconCache = CacheService.getScriptCache();
        var cachedFavicon = faviconCache.get('FAVICON_BASE64');
        if (cachedFavicon) {
          faviconUrl = cachedFavicon;
        } else {
          var externalFaviconUrl = 'https://raw.githubusercontent.com/square1995/pronunciation-audio/main/images/gaslogo.png';
          var faviconResp = UrlFetchApp.fetch(externalFaviconUrl, {muteHttpExceptions: true});
          if (faviconResp.getResponseCode() === 200) {
            faviconUrl = 'data:image/png;base64,' + Utilities.base64Encode(faviconResp.getContent());
            faviconCache.put('FAVICON_BASE64', faviconUrl, 21600); // 6時間キャッシュ
          }
        }
      } catch (e2) {
        Logger.log('⚠ 外部ファビコン取得エラー: ' + e2);
      }
    }

    var settings = {
      geminiApiKey: getProperty(PROP_KEYS.GEMINI_API_KEY) ? '***設定済み***' : '未設定',
      appFolderId: getProperty(PROP_KEYS.APP_FOLDER_ID) || '',
      themeColor: getUserProperty('USER_THEME_COLOR') || getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b',
      currentUser: getCurrentUserEmail(),
      displayName: getUserProperty('DISPLAY_NAME') || '',
      faviconUrl: faviconUrl,
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
 * @param {string} key プロパティキー
 * @return {string} 値（存在しない場合は空文字列）
 */
function getUserProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(getSafeUserKey_() + key) || '';
}

/**
 * ユーザープロパティを設定
 * USER_DEPLOYING環境でもユーザーごとに独立したデータを保持するため
 * ScriptPropertiesにメールアドレスをプレフィックスとして保存する
 * @param {string} key プロパティキー
 * @param {string} value 設定する値
 * @return {boolean} 常に true
 */
function setUserProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(getSafeUserKey_() + key, value);
  return true;
}

/**
 * ユーザーが登録したメールアドレスを取得
 * 初回はGoogle アカウントのメール
 * @return {string} メールアドレス
 */
function getRegisteredEmail() {
  try {
    var registeredEmail = getUserProperty('REGISTERED_EMAIL');
    
    // 初回はGoogle アカウントのメール
    if (!registeredEmail) {
      registeredEmail = getCurrentUserEmail();
      setUserProperty('REGISTERED_EMAIL', registeredEmail);
    }
    
    return registeredEmail;
    
  } catch (error) {
    Logger.log('❌ getRegisteredEmailエラー: ' + error);
    return getCurrentUserEmail();
  }
}

/**
 * ユーザーのプロフィール情報を取得
 * 設定タブ表示用に個人情報を返す
 * @aiCallable
 * @return {Object} プロフィール情報
 */
function getUserProfile() {
  try {
    var currentEmail = getCurrentUserEmail();
    var registeredEmail = getRegisteredEmail();
    var teacherId = getUserProperty('TEACHER_ID') || '';

    var displayName = getUserProperty('DISPLAY_NAME');
    // DISPLAY_NAME 未設定の場合、TEACHER_ID_MAP の表示名を自動引き継ぎ
    if (!displayName && teacherId) {
      var tidMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
      var tidEntry = tidMap[teacherId];
      if (tidEntry && tidEntry.name) {
        displayName = tidEntry.name;
        setUserProperty('DISPLAY_NAME', displayName);
      }
    }
    if (!displayName) displayName = getDisplayName(currentEmail);

    // 担当教科（複数）を取得
    var subjectsJson = getUserProperty('SUBJECTS') || '[]';
    var subjects = [];
    try {
      subjects = JSON.parse(subjectsJson);
    } catch (e) {
      subjects = [];
    }
    
    var aiAssistantName = getUserProperty('AI_ASSISTANT_NAME') || 'イノイマン';
    var aiPersonality = getUserProperty('AI_PERSONALITY') || 'polite';
    var themeColor = getUserProperty('USER_THEME_COLOR') || getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b';
    var preferredCampuses = safeJsonParse_(getUserProperty('PREFERRED_CAMPUSES'), []);

    // TEACHER_ID_MAP の name を最新表示名で更新（名前変更があった場合）
    if (teacherId && displayName) {
      try {
        var profileMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
        if (profileMap[teacherId] && profileMap[teacherId].name !== displayName) {
          profileMap[teacherId].name = displayName;
          setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(profileMap));
        }
      } catch (mapErr) {
        Logger.log('⚠ getUserProfile: TEACHER_ID_MAP 名前同期エラー: ' + mapErr);
      }
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
      registeredEmail: registeredEmail,
      teacherId: teacherId,
      displayName: displayName,
      isDisplayNameSet: !!getUserProperty('DISPLAY_NAME'),
      subjects: subjects,
      subjectsDisplay: subjects.join(', ') || 'なし',
      aiAssistantName: aiAssistantName,
      aiPersonality: aiPersonality,
      themeColor: themeColor,
      preferredCampuses: preferredCampuses,
      lastUpdated: getUserProperty('PROFILE_UPDATED') || new Date().toISOString(),
      profilePhotoUrl: profilePhotoUrl
    };
    
  } catch (error) {
    Logger.log('❌ getUserProfileエラー: ' + error);
    return { success: false, error: error.toString() };
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
 * 表示名、担当教科を保存
 * @aiCallable
 * @param {Object} profileData { displayName, subjects }
 * @return {Object} { success, message, profile, error }
 */
function updateUserProfile(profileData) {
  try {
    var teacherId = getUserProperty('TEACHER_ID') || '';

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
    
    // AIアシスタント名の保存（任意。未指定またはデフォルト値ならリセット）
    var aiName = (profileData.aiAssistantName || '').trim();
    if (aiName && aiName !== 'イノイマン') {
      setUserProperty('AI_ASSISTANT_NAME', aiName);
    } else {
      setUserProperty('AI_ASSISTANT_NAME', 'イノイマン');
    }

    // AIアシスタントの喋り方を保存
    var validPersonalities = ['polite', 'friendly', 'energetic', 'cool', 'kansai', 'hakata', 'tohoku', 'nagoya', 'awa'];
    var aiPersonality = validPersonalities.indexOf(profileData.aiPersonality) !== -1 ? profileData.aiPersonality : 'polite';
    setUserProperty('AI_PERSONALITY', aiPersonality);

    // テーマカラーを保存（#xxxxxx形式のみ受け付ける）
    var themeColor = (profileData.themeColor || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
      setUserProperty('USER_THEME_COLOR', themeColor);
    }

    // 保存
    setUserProperty('DISPLAY_NAME', profileData.displayName);
    setUserProperty('SUBJECTS', JSON.stringify(subjects));
    setUserProperty('PROFILE_UPDATED', new Date().toISOString());

    // TEACHER_ID_MAP の名前も最新に同期する
    if (teacherId) {
      try {
        var upMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
        if (upMap[teacherId]) {
          upMap[teacherId].name = profileData.displayName;
          setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(upMap));
        }
      } catch (e) {
        Logger.log('⚠ updateUserProfile: TEACHER_ID_MAP同期失敗: ' + e);
      }
    }

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
 * @aiCallable
 * @return {Object} { success, themeColor } themeColor はリセット後の有効カラー
 */
function resetUserThemeColor() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(getSafeUserKey_() + 'USER_THEME_COLOR');
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
    var teacherId = getUserProperty('TEACHER_ID') || '';
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

// ========================================
// 【セクション17】Gemini API 使用量トラッキング
// ========================================
// アプリ内でのGemini API呼び出し回数・トークン数をユーザーごとにUserPropertiesに記録する。
// チーム全体の集計はScriptPropertiesにLockService排他制御で記録する。
// Google APIには「残り使用量」を取得するエンドポイントが存在しないため、自己トラッキングによる近似値。

/**
 * Gemini API呼び出し後に使用量をUserProperties（個人）とScriptProperties（チーム）に記録する
 * 日次・月次で自動リセット。直近20件の操作履歴を保持。
 * @param {string} operationName 操作名（表示用日本語）
 * @param {Object} usageMetadata APIレスポンスのusageMetadataオブジェクト
 */
function logGeminiUsage(operationName, usageMetadata) {
  try {
    if (!usageMetadata) return;
    var tokens = usageMetadata.totalTokenCount || 0;
    var today    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var monthKey = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');
    var timeStr  = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm');

    // ── 個人（UserProperties）の更新 ──

    // 日次リセット（日付が変わっていれば0にリセット）
    var savedDate = getUserProperty('GEMINI_DAILY_DATE');
    if (savedDate !== today) {
      setUserProperty('GEMINI_DAILY_DATE',   today);
      setUserProperty('GEMINI_DAILY_CALLS',  '0');
      setUserProperty('GEMINI_DAILY_TOKENS', '0');
      setUserProperty('GEMINI_DAILY_OPS',    '[]');
    }

    // 月次リセット（月が変わっていれば0にリセット）
    var savedMonth = getUserProperty('GEMINI_MONTHLY_KEY');
    if (savedMonth !== monthKey) {
      setUserProperty('GEMINI_MONTHLY_KEY',    monthKey);
      setUserProperty('GEMINI_MONTHLY_CALLS',  '0');
      setUserProperty('GEMINI_MONTHLY_TOKENS', '0');
    }

    // 日次カウント更新
    var dailyCalls  = parseInt(getUserProperty('GEMINI_DAILY_CALLS')  || '0') + 1;
    var dailyTokens = parseInt(getUserProperty('GEMINI_DAILY_TOKENS') || '0') + tokens;
    setUserProperty('GEMINI_DAILY_CALLS',  String(dailyCalls));
    setUserProperty('GEMINI_DAILY_TOKENS', String(dailyTokens));

    // 操作履歴（直近20件を保持）
    var ops = JSON.parse(getUserProperty('GEMINI_DAILY_OPS') || '[]');
    ops.push({ name: operationName, tokens: tokens, ts: timeStr });
    if (ops.length > 20) ops = ops.slice(ops.length - 20);
    setUserProperty('GEMINI_DAILY_OPS', JSON.stringify(ops));

    // 月次カウント更新
    var monthlyCalls  = parseInt(getUserProperty('GEMINI_MONTHLY_CALLS')  || '0') + 1;
    var monthlyTokens = parseInt(getUserProperty('GEMINI_MONTHLY_TOKENS') || '0') + tokens;
    setUserProperty('GEMINI_MONTHLY_CALLS',  String(monthlyCalls));
    setUserProperty('GEMINI_MONTHLY_TOKENS', String(monthlyTokens));

    // ── チーム全体（ScriptProperties）の更新 ─ LockServiceで競合を防止 ──
    try {
      var lock = LockService.getScriptLock();
      lock.waitLock(5000);
      try {
        // チーム日次リセット
        var teamDate = getProperty('GEMINI_TEAM_DAILY_DATE');
        if (teamDate !== today) {
          setProperty('GEMINI_TEAM_DAILY_DATE',   today);
          setProperty('GEMINI_TEAM_DAILY_CALLS',  '0');
          setProperty('GEMINI_TEAM_DAILY_TOKENS', '0');
        }
        // チーム月次リセット
        var teamMonthKey = getProperty('GEMINI_TEAM_MONTHLY_KEY');
        if (teamMonthKey !== monthKey) {
          setProperty('GEMINI_TEAM_MONTHLY_KEY',    monthKey);
          setProperty('GEMINI_TEAM_MONTHLY_CALLS',  '0');
          setProperty('GEMINI_TEAM_MONTHLY_TOKENS', '0');
        }
        // チームカウント更新
        setProperty('GEMINI_TEAM_DAILY_CALLS',   String(parseInt(getProperty('GEMINI_TEAM_DAILY_CALLS')   || '0') + 1));
        setProperty('GEMINI_TEAM_DAILY_TOKENS',  String(parseInt(getProperty('GEMINI_TEAM_DAILY_TOKENS')  || '0') + tokens));
        setProperty('GEMINI_TEAM_MONTHLY_CALLS', String(parseInt(getProperty('GEMINI_TEAM_MONTHLY_CALLS') || '0') + 1));
        setProperty('GEMINI_TEAM_MONTHLY_TOKENS',String(parseInt(getProperty('GEMINI_TEAM_MONTHLY_TOKENS')|| '0') + tokens));
      } finally {
        lock.releaseLock();
      }
    } catch (lockErr) {
      Logger.log('⚠ チーム使用量の記録をスキップ（ロック取得失敗）: ' + lockErr);
    }

  } catch (e) {
    Logger.log('⚠ logGeminiUsage エラー: ' + e);
  }
}

/**
 * 現在ユーザーのGemini API使用量（個人 + チーム全体）を取得する
 * 設定タブのフロントエンドから呼び出される。
 * @aiCallable
 * @return {Object} { mine: { today, month }, team: { today, month } }
 *   today: { calls, tokens, ops[] }  month: { calls, tokens }
 */
function getMyGeminiUsage() {
  try {
    var today    = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var monthKey = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM');

    // 個人データ（UserProperties）
    var savedDate  = getUserProperty('GEMINI_DAILY_DATE');
    var savedMonth = getUserProperty('GEMINI_MONTHLY_KEY');

    var mineTodayCalls  = savedDate  === today    ? parseInt(getUserProperty('GEMINI_DAILY_CALLS')   || '0') : 0;
    var mineTodayTokens = savedDate  === today    ? parseInt(getUserProperty('GEMINI_DAILY_TOKENS')  || '0') : 0;
    var mineTodayOps    = savedDate  === today    ? JSON.parse(getUserProperty('GEMINI_DAILY_OPS')   || '[]') : [];
    var mineMonthCalls  = savedMonth === monthKey ? parseInt(getUserProperty('GEMINI_MONTHLY_CALLS') || '0') : 0;
    var mineMonthTokens = savedMonth === monthKey ? parseInt(getUserProperty('GEMINI_MONTHLY_TOKENS')|| '0') : 0;

    // チームデータ（ScriptProperties）
    var teamDate  = getProperty('GEMINI_TEAM_DAILY_DATE');
    var teamMonth = getProperty('GEMINI_TEAM_MONTHLY_KEY');

    var teamTodayCalls  = teamDate  === today    ? parseInt(getProperty('GEMINI_TEAM_DAILY_CALLS')   || '0') : 0;
    var teamTodayTokens = teamDate  === today    ? parseInt(getProperty('GEMINI_TEAM_DAILY_TOKENS')  || '0') : 0;
    var teamMonthCalls  = teamMonth === monthKey ? parseInt(getProperty('GEMINI_TEAM_MONTHLY_CALLS') || '0') : 0;
    var teamMonthTokens = teamMonth === monthKey ? parseInt(getProperty('GEMINI_TEAM_MONTHLY_TOKENS')|| '0') : 0;

    return {
      mine: {
        today: { calls: mineTodayCalls, tokens: mineTodayTokens, ops: mineTodayOps },
        month: { calls: mineMonthCalls, tokens: mineMonthTokens }
      },
      team: {
        today: { calls: teamTodayCalls, tokens: teamTodayTokens },
        month: { calls: teamMonthCalls, tokens: teamMonthTokens }
      }
    };
  } catch (e) {
    Logger.log('❌ getMyGeminiUsage エラー: ' + e);
    return {
      mine: { today: { calls: 0, tokens: 0, ops: [] }, month: { calls: 0, tokens: 0 } },
      team: { today: { calls: 0, tokens: 0 }, month: { calls: 0, tokens: 0 } }
    };
  }
}

/**
 * アプリ起動時の初期データを一括取得する（高速起動用）
 * checkAccountBlocked / getSetupStatus / 管理者判定 / 基本設定を1回のAPI呼び出しで返す。
 * Drive API（ロゴ・ファビコン）は含まない。
 * @return {Object} 起動に必要なデータ一式
 */
function getAppStartupData(firebaseEmail, firebaseUid) {
  try {
    // Firebase Auth から渡されたメールをコンテキストにセット（Session が空の場合のフォールバック）
    if (firebaseEmail) setFirebaseEmailContext_(firebaseEmail);
    var email = getCurrentUserEmail();

    // 管理者かどうかを素早く判定（ScriptProperties の文字列比較のみ・Drive API不要）
    var adminEmailsRaw = getProperty(PROP_KEYS.ADMIN_EMAILS) || '';
    var adminList = adminEmailsRaw.split(',').map(function(e) { return e.trim().toLowerCase(); }).filter(function(e) { return e; });
    var isAdminResult = email && adminList.indexOf(email.toLowerCase()) !== -1;

    // 初回セットアップチェック（Admin未登録なら true）
    var isFirstSetup = adminList.length === 0;

    // 基本設定（ScriptProperties / UserProperties のみ・Drive API不要）
    var themeColor      = getUserProperty('USER_THEME_COLOR') || getProperty(PROP_KEYS.THEME_COLOR) || '#43e97b';
    var displayName     = getUserProperty('DISPLAY_NAME') || '';
    var geminiApiKey    = getProperty(PROP_KEYS.GEMINI_API_KEY) ? '***設定済み***' : '未設定';
    var appFolderId     = getProperty(PROP_KEYS.APP_FOLDER_ID) || '';
    var aiAssistantName    = getUserProperty('AI_ASSISTANT_NAME') || 'イノイマン';
    var aiPersonality      = getUserProperty('AI_PERSONALITY') || 'polite';
    var preferredCampuses  = safeJsonParse_(getUserProperty('PREFERRED_CAMPUSES'), []);

    // 講師IDの判定（Firebase UID をキーとして TEACHER_ID_MAP を参照）
    var uid = (firebaseUid || '').trim();
    var teacherId = getUserProperty('TEACHER_ID') || '';

    if (!teacherId && !isFirstSetup && !isAdminResult && uid) {
      var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});

      if (teacherMap[uid]) {
        // UID が既に登録済み → 自動紐付け
        teacherId = uid;
        setUserProperty('TEACHER_ID', uid);
        var tEntry = teacherMap[uid];
        if (!displayName && tEntry.name) {
          displayName = tEntry.name;
          setUserProperty('DISPLAY_NAME', tEntry.name);
        }
        Logger.log('✓ getAppStartupData: UID ' + uid + ' を自動紐付け');
      } else if (email) {
        var emailLower = email.toLowerCase();

        // UID 未登録 → メールで逆引き（旧データ移行 or 別端末ログイン）
        var allUids = Object.keys(teacherMap);
        for (var ti = 0; ti < allUids.length; ti++) {
          var oldEntry = teacherMap[allUids[ti]];
          var entryEmail = (oldEntry && oldEntry.email) ? oldEntry.email.toLowerCase() : '';
          if (entryEmail === emailLower) {
            teacherId = allUids[ti];
            setUserProperty('TEACHER_ID', teacherId);
            if (!displayName && oldEntry.name) {
              displayName = oldEntry.name;
              setUserProperty('DISPLAY_NAME', oldEntry.name);
            }
            Logger.log('✓ getAppStartupData: ' + emailLower + ' をメールで自動紐付け → ' + teacherId);
            break;
          }
        }

        // まだ見つからなければ: Firestore allowedUsers に登録済みなら新規UID登録
        if (!teacherId && uid) {
          try {
            var allowed = firestoreGet_('allowedUsers', emailLower);
            if (allowed) {
              var lock = LockService.getScriptLock();
              lock.waitLock(5000);
              try {
                var freshMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
                if (!freshMap[uid]) {
                  freshMap[uid] = { email: emailLower, name: displayName || '' };
                  setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(freshMap));
                  Logger.log('✓ getAppStartupData: allowedUsers 確認済み → UID ' + uid + ' を新規登録');
                }
              } finally {
                lock.releaseLock();
              }
              teacherId = uid;
              setUserProperty('TEACHER_ID', uid);
            }
          } catch (fsErr) {
            Logger.log('⚠ getAppStartupData: Firestore allowedUsers チェック失敗: ' + fsErr);
          }
        }
      }
    }

    var needsIdInput = !isFirstSetup && !isAdminResult && !teacherId;

    Logger.log('✓ getAppStartupData: 完了（admin=' + isAdminResult + ', firstSetup=' + isFirstSetup + ', needsIdInput=' + needsIdInput + '）');
    return {
      success: true,
      isFirstSetup: isFirstSetup,
      currentUserEmail: email,
      isAdmin: isAdminResult,
      needsIdInput: needsIdInput,
      teacherId: teacherId,
      themeColor: themeColor,
      displayName: displayName,
      geminiApiKey: geminiApiKey,
      appFolderId: appFolderId,
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
