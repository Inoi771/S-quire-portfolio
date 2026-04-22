// 議事録 CRUD（GAS minutes.js の Workers ポート）
// Phase 6-A-2: 議事録 3 関数の Workers 化
// saveLecGrades / savePreferredCampuses と同型パターン：
//   find_staff_by_auth → supabaseSelect / supabaseUpsert / supabaseDelete
import { supabaseSelect, supabaseUpsert, supabaseDelete, supabaseRpc } from '../supabase.js';
import { isAdminUser } from './auth.js';

/**
 * getMinutesList — GAS minutes.js:17 の Workers 版
 * 年度ごとの議事録一覧を meeting_minutes から取得する。
 * GAS 版と同一の並び順（month.asc）・同一 8 カラムの select を使用。
 *
 * @param {Array} args [fiscalYear]
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Array} 議事録一覧（年度不正なら空配列）
 */
export async function getMinutesList(args, env, user) {
  const [fiscalYear] = args || [];
  const fy = parseInt(fiscalYear, 10);
  if (isNaN(fy)) return [];

  const rows = await supabaseSelect(
    env,
    'meeting_minutes',
    'fiscal_year=eq.' + fy +
    '&order=month.asc' +
    '&select=id,fiscal_year,month,title,summary,created_by,created_at,updated_at'
  );
  return rows || [];
}

/**
 * saveMinutes — GAS minutes.js:32 の Workers 版
 * 議事録を新規作成 or 更新する。
 * saveLecGrades と同型：find_staff_by_auth で created_by を導出し UPSERT。
 * バリデーション・ID 自動採番・戻り値形状を GAS 版と完全一致させる。
 *
 * @param {Array} args [minutesDataJson] JSON 文字列 {id?, fiscal_year, month, title, summary}
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, message | error }
 */
export async function saveMinutes(args, env, user) {
  try {
    const [minutesDataJson] = args || [];
    let data;
    try {
      data = typeof minutesDataJson === 'string' ? JSON.parse(minutesDataJson) : minutesDataJson;
    } catch (e) {
      return { success: false, error: 'データの形式が正しくありません' };
    }
    if (!data) return { success: false, error: 'データの形式が正しくありません' };

    const fy = parseInt(data.fiscal_year, 10);
    const month = parseInt(data.month, 10);
    if (isNaN(fy) || isNaN(month) || month < 1 || month > 12) {
      return { success: false, error: '年度または月が正しくありません' };
    }
    if (!data.title || !String(data.title).trim()) {
      return { success: false, error: 'タイトルを入力してください' };
    }

    const now = new Date().toISOString();

    // 新規作成時のみ ID 採番と created_by 設定
    if (!data.id) {
      data.id = 'min_' + fy + '_' + String(month).padStart(2, '0') + '_' + Date.now();
      data.created_at = now;
      try {
        const rows = await supabaseRpc(env, 'find_staff_by_auth', {
          p_uid: user.uid || null,
          p_email: user.email ? user.email.toLowerCase() : null
        });
        data.created_by = (rows && rows.length > 0 && rows[0].id) ? rows[0].id : (user.email || '');
      } catch (e) {
        data.created_by = user.email || '';
      }
    }

    // 全 8 カラム明示指定で UPSERT（partial payload 回避）
    const record = {
      id: data.id,
      fiscal_year: fy,
      month,
      title: String(data.title).trim(),
      summary: String(data.summary || '').trim(),
      created_by: data.created_by || '',
      created_at: data.created_at || now,
      updated_at: now
    };

    await supabaseUpsert(env, 'meeting_minutes', record, 'id');
    return { success: true, message: '議事録を保存しました' };
  } catch (error) {
    return { success: false, error: '議事録の保存に失敗しました: ' + error.toString() };
  }
}

/**
 * deleteMinutes — GAS minutes.js:85 の Workers 版
 * 議事録を削除する（Admin 限定）。
 * isAdminUser による権限チェック後、meeting_minutes から DELETE。
 *
 * @param {Array} args [minutesId]
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, message | error }
 */
export async function deleteMinutes(args, env, user) {
  try {
    const isAdmin = await isAdminUser(env, user);
    if (!isAdmin) return { success: false, error: '削除は管理者のみ実行できます' };

    const [minutesId] = args || [];
    if (!minutesId) return { success: false, error: '議事録IDが指定されていません' };

    await supabaseDelete(env, 'meeting_minutes', 'id=eq.' + encodeURIComponent(minutesId));
    return { success: true, message: '議事録を削除しました' };
  } catch (error) {
    return { success: false, error: '議事録の削除に失敗しました: ' + error.toString() };
  }
}
