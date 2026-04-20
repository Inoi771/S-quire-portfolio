// settings 関連ハンドラー（GAS settings.js の Workers ポート）
import { supabaseRpc, supabaseSelect, supabaseUpsert, supabaseUpdate, staffFromSupabase } from '../supabase.js';
import { firestoreSet } from '../firebase.js';

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
