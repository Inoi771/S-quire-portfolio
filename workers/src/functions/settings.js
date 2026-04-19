// settings 関連ハンドラー（GAS settings.js の Workers ポート）
import { supabaseRpc } from '../supabase.js';
import { staffFromSupabase } from '../supabase.js';

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
