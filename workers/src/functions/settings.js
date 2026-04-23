// settings 関連ハンドラー（GAS settings.js の Workers ポート）
import { supabaseRpc, supabaseSelect, supabaseUpsert, supabaseUpdate, staffFromSupabase } from '../supabase.js';
import { firestoreSet } from '../firebase.js';
import { isAdminUser } from './auth.js';

// Phase 5-E-7: KV 直接アクセス用プレフィックス（kv.js の PROP_PREFIX と一致）
const PROP_PREFIX = 'prop:';

/**
 * getUserProfile — GAS getUserProfile() の Workers 版
 * GAS 版との差分：
 *   - themeColor fallback は '#43e97b' 固定（ScriptProperties 不使用）
 *   - displayName fallback は user.email（getDisplayName() 不使用）
 *   - 自動マイグレーション書き戻しロジックなし
 */
export async function getUserProfile(args, env, user) {
  try {
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });

    if (!rows || rows.length === 0) {
      return { success: false, error: '未登録のユーザーです' };
    }

    const staff = staffFromSupabase(rows[0]);

    let subjects = staff.subjects || [];
    if (typeof subjects === 'string') {
      try { subjects = JSON.parse(subjects); } catch(e) { subjects = []; }
    }

    let preferredCampuses = staff.preferredCampuses || [];
    if (typeof preferredCampuses === 'string') {
      try { preferredCampuses = JSON.parse(preferredCampuses); } catch(e) { preferredCampuses = []; }
    }

    const teacherId = staff.teacherId || staff._id;
    const displayName = staff.displayName || staff.name || user.email;
    const aiAssistantName = staff.aiAssistantName || 'イノイマン';
    const aiPersonality = staff.aiPersonality || 'polite';
    const themeColor = staff.themeColor || '#43e97b';
    const lecGrades = staff.lecGrades || [];

    return {
      success: true,
      currentEmail: user.email,
      registeredEmail: staff.email || user.email,
      teacherId,
      registeredName: staff.name || '',
      displayName,
      isDisplayNameSet: !!staff.displayName,
      subjects,
      subjectsDisplay: subjects.join(', ') || 'なし',
      aiAssistantName,
      aiPersonality,
      themeColor,
      preferredCampuses,
      lecGrades,
      lastUpdated: staff.updatedAt || staff.addedAt || new Date().toISOString()
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getAppStartupData — GAS getAppStartupData() の Workers 版
 * GAS 版との差分：
 *   - cleanupMigratedUserProperties_() 省略（ScriptProperties が存在しないため）
 *   - THEME_COLOR global default は '#43e97b' 固定
 *   - UID 補完 + allowedUsers 書き込みを Promise.all で並列実行
 *   - lastAnalysisMeta 取得失敗は null を返して起動を継続
 */
export async function getAppStartupData(args, env, user) {
  try {
    const email = user.email ? user.email.toLowerCase() : '';
    const uid = user.uid || null;

    // Admin 判定
    const adminEmailsRaw = env.ADMIN_EMAILS || '';
    const adminList = adminEmailsRaw.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
    const isAdmin = email ? adminList.includes(email) : false;
    const isFirstSetup = adminList.length === 0;

    // Staff 照合
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: uid,
      p_email: email || null
    });
    let staff = rows && rows.length > 0 ? staffFromSupabase(rows[0]) : null;

    // UID 補完 + allowedUsers 書き込みを並列実行（失敗しても起動をブロックしない）
    const sideEffects = [];

    if (staff && uid && !staff.firebaseUid) {
      const updatedUids = Array.isArray(staff.firebaseUids) ? [...staff.firebaseUids] : [];
      if (!updatedUids.includes(uid)) updatedUids.push(uid);
      sideEffects.push(
        supabaseUpsert(env, 'staffs', { id: staff._id, firebase_uid: uid, firebase_uids: updatedUids }, 'id')
          .then(() => { staff.firebaseUid = uid; staff.firebaseUids = updatedUids; })
          .catch(() => {})
      );
    }

    if (email && (staff || isAdmin)) {
      sideEffects.push(
        firestoreSet(env, 'allowedUsers', email, { email, addedAt: new Date().toISOString() })
          .catch(() => {})
      );
    }

    await Promise.all(sideEffects);

    // Staff フィールド展開
    let preferredCampuses = staff ? (staff.preferredCampuses || []) : [];
    if (typeof preferredCampuses === 'string') {
      try { preferredCampuses = JSON.parse(preferredCampuses); } catch(e) { preferredCampuses = []; }
    }

    const teacherId        = staff ? (staff.teacherId || staff._id || '') : '';
    const displayName      = staff ? (staff.displayName || staff.name || '') : '';
    const themeColor       = staff ? (staff.themeColor || '#43e97b') : '#43e97b';
    const aiAssistantName  = staff ? (staff.aiAssistantName || 'イノイマン') : 'イノイマン';
    const aiPersonality    = staff ? (staff.aiPersonality || 'polite') : 'polite';
    const lecGrades        = staff ? (staff.lecGrades || []) : [];
    const isUnregistered   = !isFirstSetup && !isAdmin && !staff;

    // env vars からキー状態文字列生成（実際の値は返さない）
    const geminiApiKey        = env.GEMINI_API_KEY        ? '***設定済み***' : '未設定';
    const geminiApiKeyBackup  = env.GEMINI_API_KEY_BACKUP ? '***設定済み***' : '未設定';
    const appFolderId         = env.APP_FOLDER_ID    || '';
    const accessFolderId      = env.ACCESS_FOLDER_ID || '';

    // lastAnalysisMeta（失敗しても null を返すだけ、起動全体を失敗させない）
    let lastAnalysisMeta = null;
    try {
      const docs = await supabaseSelect(env, 'test_analysis',
        'select=year,test_name&order=generated_at.desc&limit=1');
      if (docs && docs.length > 0 && docs[0].year && docs[0].test_name) {
        lastAnalysisMeta = { year: docs[0].year, testName: docs[0].test_name };
      }
    } catch(e) { /* 成績分析メタ取得失敗は起動継続 */ }

    return {
      success: true,
      isFirstSetup,
      currentUserEmail: email,
      isAdmin,
      needsIdInput: isUnregistered,   // 後方互換
      isUnregistered,
      teacherId,
      themeColor,
      displayName,
      geminiApiKey,
      geminiApiKeyBackup,
      appFolderId,
      accessFolderId,
      aiAssistantName,
      aiPersonality,
      preferredCampuses,
      lecGrades,
      lastAnalysisMeta
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * saveLecGrades — GAS saveLecGrades() の Workers 版
 * 講習担当学年の配列を staffs.lec_grades に保存。
 * B-⑭/⑯ と同型の NOT NULL 違反を避けるため PATCH 方式で実装。
 * staffId は frontend から受けず、認証済み user から find_staff_by_auth で導出する。
 */
export async function saveLecGrades(args, env, user) {
  try {
    const [grades] = args || [];
    const list = Array.isArray(grades) ? grades : [];

    // 認証済みユーザーから staffId を導出
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });
    if (!rows || rows.length === 0) {
      return { success: false, error: 'スタッフ情報が取得できません' };
    }
    const staffId = rows[0].id;
    if (!staffId) {
      return { success: false, error: 'スタッフ情報が取得できません' };
    }

    // 事前 SELECT は RPC が既に存在確認を兼ねているため省略
    await supabaseUpdate(env, 'staffs', { lec_grades: list }, 'id=eq.' + encodeURIComponent(staffId));

    return { success: true, message: '保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * savePreferredCampuses — GAS savePreferredCampuses() の Workers 版
 * 配属校舎コードの配列を staffs.preferred_campuses に保存。
 * saveLecGrades と同型で、find_staff_by_auth で staffId を解決し PATCH で更新する。
 * GAS 版は UserProperty ('PREFERRED_CAMPUSES') に JSON 保存するフォールバックとして温存。
 */
export async function savePreferredCampuses(args, env, user) {
  try {
    const [campusCodes] = args || [];
    const list = Array.isArray(campusCodes) ? campusCodes : [];

    // 認証済みユーザーから staffId を導出
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });
    if (!rows || rows.length === 0) {
      return { success: false, error: 'スタッフ情報が取得できません' };
    }
    const staffId = rows[0].id;
    if (!staffId) {
      return { success: false, error: 'スタッフ情報が取得できません' };
    }

    await supabaseUpdate(env, 'staffs', { preferred_campuses: list }, 'id=eq.' + encodeURIComponent(staffId));

    return { success: true, message: '保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-15】getSubjectOptions — GAS settings.js:633 の Workers 版
 *
 * プロフィール設定画面の担当教科チェックボックスで使う教科名配列を返す。
 * GAS 版と同じく生の配列を直接返す（`{success, options}` 等でラップしない）。
 * 順序・表記は GAS 版と完全一致。
 */
export async function getSubjectOptions(args, env, user) {
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
 * 【Phase 5-E-7】getSettings — GAS settings.js getSettings() の Workers 版
 *
 * 設定画面・初期化フロー向けに、現在のユーザーが見られる設定をまとめて返す。
 * ScriptProperties 由来のキー（GEMINI_API_KEY / GEMINI_API_KEY_BACKUP /
 * APP_FOLDER_ID / THEME_COLOR）は Cloudflare KV から直接読み取る（Phase
 * 5-E-6 以降 KV が唯一の一次ソース）。
 *
 * GAS 版との差分:
 *   - KV I/O は `env.KV.get('prop:...')` で並列化（kv-props.js 不使用）
 *   - themeColor / displayName はユーザーの staffs 行から取得
 *     （GAS は getUserProperty → staffs or 旧 _UP_ の経路。Workers 側は
 *      staffs のみ参照し、staff が無い場合は KV の THEME_COLOR fallback）
 *   - API キー本体は返さず、存在有無のみを '***設定済み***' / '未設定' で示す
 *   - logoUrl は GAS 版に合わせて常に空文字列を返す（将来拡張用）
 *
 * @param {Array} args 未使用
 * @param {Object} env Cloudflare Workers 環境（KV バインディング含む）
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} 設定オブジェクト（GAS 版と同じキー形状）
 */
export async function getSettings(args, env, user) {
  try {
    const [geminiKey, geminiBackupKey, appFolderId, themeColorProp] = await Promise.all([
      env.KV.get(PROP_PREFIX + 'GEMINI_API_KEY'),
      env.KV.get(PROP_PREFIX + 'GEMINI_API_KEY_BACKUP'),
      env.KV.get(PROP_PREFIX + 'APP_FOLDER_ID'),
      env.KV.get(PROP_PREFIX + 'THEME_COLOR')
    ]);

    // staffs からユーザー個別のテーマカラー / 表示名を取得
    let userThemeColor = '';
    let displayName = '';
    try {
      const rows = await supabaseRpc(env, 'find_staff_by_auth', {
        p_uid: user.uid || null,
        p_email: user.email ? user.email.toLowerCase() : null
      });
      if (rows && rows.length > 0) {
        const staff = staffFromSupabase(rows[0]);
        userThemeColor = staff.themeColor || '';
        displayName    = staff.displayName || '';
      }
    } catch (e) { /* staff 解決失敗時は fallback で継続 */ }

    return {
      geminiApiKey:        geminiKey       ? '***設定済み***' : '未設定',
      geminiApiKeyBackup:  geminiBackupKey ? '***設定済み***' : '未設定',
      appFolderId:         appFolderId || '',
      themeColor:          userThemeColor || themeColorProp || '#43e97b',
      currentUser:         user.email || '',
      displayName:         displayName || '',
      logoUrl:             ''
    };
  } catch (error) {
    return { error: error.toString() };
  }
}

/**
 * 【Phase 5-E-7】updateSettings — GAS settings.js updateSettings() の Workers 版
 *
 * 設定保存フローの保存先。ScriptProperties 互換キー（API キー・フォルダ ID・
 * テーマカラー）はすべて KV（prop:...）にのみ書き込む。
 *
 * 権限チェック:
 *   Admin 限定項目は isAdminUser() を使って KV(prop:ADMIN_EMAILS) で判定。
 *   GAS isAdmin() と同じ粒度・同じエラーメッセージを返す。
 *
 * GAS 版との差分:
 *   - setProperty_ 経由ではなく `env.KV.put('prop:...')` で直接書込
 *   - geminiApiKeyBackup の空文字指定による削除（GAS は setProperty に空文字
 *     書込）と同じ挙動を KV.put('') で再現
 *   - バリデーションと戻り値形状は GAS 版と完全一致
 *
 * @param {Array<Object>} args [settingsData]
 * @param {Object} env Cloudflare Workers 環境（KV バインディング含む）
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, message? , error? }
 */
export async function updateSettings(args, env, user) {
  try {
    const [settingsData = {}] = args || [];

    // Admin 判定は必要時のみ評価（キャッシュ）
    let _adminChecked = false;
    let _isAdmin = false;
    async function ensureAdmin() {
      if (!_adminChecked) {
        _isAdmin = await isAdminUser(env, user);
        _adminChecked = true;
      }
      return _isAdmin;
    }

    // GEMINI_API_KEY（Admin のみ）
    if (settingsData.geminiApiKey && settingsData.geminiApiKey !== '***設定済み***') {
      if (!(await ensureAdmin())) {
        return { success: false, error: 'APIキーの更新は Admin のみ可能です' };
      }
      await env.KV.put(PROP_PREFIX + 'GEMINI_API_KEY', String(settingsData.geminiApiKey));
    }

    // GEMINI_API_KEY_BACKUP（Admin のみ）
    if (settingsData.geminiApiKeyBackup && settingsData.geminiApiKeyBackup !== '***設定済み***') {
      if (!(await ensureAdmin())) {
        return { success: false, error: '予備APIキーの更新は Admin のみ可能です' };
      }
      await env.KV.put(PROP_PREFIX + 'GEMINI_API_KEY_BACKUP', String(settingsData.geminiApiKeyBackup));
    }
    // 予備APIキーの削除（空文字送信時・Admin のみ適用）
    if (settingsData.geminiApiKeyBackup === '') {
      if (await ensureAdmin()) {
        await env.KV.put(PROP_PREFIX + 'GEMINI_API_KEY_BACKUP', '');
      }
    }

    // APP_FOLDER_ID（Admin のみ）
    if (settingsData.appFolderId) {
      if (!(await ensureAdmin())) {
        return { success: false, error: 'フォルダIDの更新は Admin のみ可能です' };
      }
      await env.KV.put(PROP_PREFIX + 'APP_FOLDER_ID', String(settingsData.appFolderId));
    }

    // ACCESS_FOLDER_ID（Admin のみ）
    if (settingsData.accessFolderId) {
      if (!(await ensureAdmin())) {
        return { success: false, error: 'アクセスフォルダIDの更新は Admin のみ可能です' };
      }
      await env.KV.put(PROP_PREFIX + 'ACCESS_FOLDER_ID', String(settingsData.accessFolderId));
    }

    // THEME_COLOR（非 Admin 可・ScriptProperties グローバル）
    if (settingsData.themeColor) {
      await env.KV.put(PROP_PREFIX + 'THEME_COLOR', String(settingsData.themeColor));
    }

    return { success: true, message: '設定を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-4】updateUserProfile — GAS settings.js:496 の Workers 版
 *
 * プロフィール情報（displayName / subjects / aiAssistantName / aiPersonality /
 * themeColor）を Supabase staffs に保存する。
 *
 * 書込方式:
 *   - supabaseUpdate による部分更新（CLAUDE.md settings.js:109 の教訓、
 *     B-⑭/⑯/⑰ の partial UPSERT NOT NULL 違反回避）。Phase 6-A-3
 *     auth-emails.js と同型。
 *
 * バリデーション（GAS 版と完全一致・順序厳守）:
 *   1. displayName 空/空白のみ → 「名前は必須です」
 *   2. subjects は string なら ','分割 + trim + 空要素除去で array 化
 *   3. displayName.trim().length > 50 → 「名前は50文字以下にしてください」
 *   4. subjects.length > 10 → 「担当教科は最大10個までです」
 *   5. aiPersonality は 9 種 enum 外なら 'polite' にフォールバック（エラーにしない）
 *   6. themeColor は /^#[0-9a-fA-F]{6}$/ に合致するときのみ payload に含める
 *      （不正値は theme_color を PATCH payload に含めず、既存値を維持）
 *
 * aiAssistantName が空なら 'イノイマン' で保存する。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   - 成功: { success: true, message: 'プロフィールを更新しました',
 *            profile: { displayName, subjects } }
 *   - 失敗: { success: false, error: <文言> }
 *
 * @param {Array<Object>} args [profileData]
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object}
 */
export async function updateUserProfile(args, env, user) {
  try {
    const [profileData = {}] = args || [];

    // 現在のログイン中講師を解決
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });
    if (!rows || rows.length === 0) {
      return { success: false, error: '未登録のユーザーです' };
    }
    const staff = staffFromSupabase(rows[0]);
    const teacherId = staff.teacherId || staff._id;

    // 1. displayName 必須チェック（trim 前の生値で空判定）
    if (!profileData.displayName || String(profileData.displayName).trim().length === 0) {
      return { success: false, error: '名前は必須です' };
    }
    const displayName = String(profileData.displayName).trim();

    // 2. subjects: string → array
    let subjects = profileData.subjects || [];
    if (typeof subjects === 'string') {
      subjects = subjects.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    // 3. displayName 長さチェック
    if (displayName.length > 50) {
      return { success: false, error: '名前は50文字以下にしてください' };
    }
    // 4. subjects 個数チェック
    if (subjects.length > 10) {
      return { success: false, error: '担当教科は最大10個までです' };
    }

    // AIアシスタント名（空なら既定値）
    const aiName = (String(profileData.aiAssistantName || '').trim()) || 'イノイマン';

    // 5. aiPersonality enum 外は 'polite' にフォールバック
    const validPersonalities = ['polite', 'friendly', 'energetic', 'cool', 'kansai', 'hakata', 'tohoku', 'nagoya', 'awa'];
    const aiPersonality = validPersonalities.indexOf(profileData.aiPersonality) !== -1
      ? profileData.aiPersonality
      : 'polite';

    // 6. themeColor は正規表現合致時のみ payload に含める
    const themeColor = String(profileData.themeColor || '').trim();

    const payload = {
      display_name: displayName,
      name: displayName,
      subjects,
      ai_assistant_name: aiName,
      ai_personality: aiPersonality,
      updated_at: new Date().toISOString()
    };
    if (/^#[0-9a-fA-F]{6}$/.test(themeColor)) {
      payload.theme_color = themeColor;
    }

    await supabaseUpdate(env, 'staffs', payload,
      'id=eq.' + encodeURIComponent(teacherId)
    );

    return {
      success: true,
      message: 'プロフィールを更新しました',
      profile: { displayName, subjects }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-15】resetUserThemeColor — GAS settings.js:568 の Workers 版
 *
 * ユーザー個別のテーマカラー設定をリセットし、システムデフォルトに戻す。
 * Supabase staffs の theme_color を空にし、KV `THEME_COLOR` の値（or '#43e97b'）を返す。
 *
 * 書込方式:
 *   GAS 版は supabaseUpsert で全フィールド置換だが、Workers 版では PATCH 化
 *   （CLAUDE.md settings.js:109 の partial UPSERT NOT NULL 違反回避指針 /
 *    Phase 6-A-4 updateUserProfile と同型）。
 *
 * 認証:
 *   Firebase ID トークン検証のみ（Admin ガードなし）。自分の設定のみ変更。
 *
 * 挙動:
 *   - staff 未解決（未登録ユーザー）でも KV fallback のみで success:true を返す
 *     （GAS 版 `if (staff) { ... }` と一致）。
 *   - staff 解決と KV 読取を Promise.all で並列化（GAS 版は順次）。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   - 成功: { success: true, themeColor: '#RRGGBB' }
 *   - 失敗: { success: false, error: <文言> }
 */
export async function resetUserThemeColor(args, env, user) {
  try {
    const [rows, themeColorProp] = await Promise.all([
      supabaseRpc(env, 'find_staff_by_auth', {
        p_uid: user.uid || null,
        p_email: user.email ? user.email.toLowerCase() : null
      }),
      env.KV.get(PROP_PREFIX + 'THEME_COLOR')
    ]);

    if (rows && rows.length > 0) {
      const staff = staffFromSupabase(rows[0]);
      const teacherId = staff.teacherId || staff._id;
      if (teacherId) {
        await supabaseUpdate(env, 'staffs', {
          theme_color: '',
          updated_at: new Date().toISOString()
        }, 'id=eq.' + encodeURIComponent(teacherId));
      }
    }

    const effectiveColor = themeColorProp || '#43e97b';
    return { success: true, themeColor: effectiveColor };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
