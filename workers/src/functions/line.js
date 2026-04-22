// line.js 関連関数の Workers ポート
//
// Phase 6-A-8：Admin 専用の LINE 自己登録ユーザー一覧取得を Workers 化
//   - getLineRegisteredUsers  → Supabase `staffs` 読み取り（Admin のみ）
//
// 実装方針（Phase 6-A-5 notifications.js / 6-A-7 ai-learning.js と同型）:
//   - Admin 判定は isAdminUser 経由の denyIfNotAdmin_ ヘルパー
//     （GAS line.js:499 と同一文言 'Admin のみアクセス可能' を返す）
//   - Supabase REST は既存の supabaseSelect のみ使用
//   - 戻り値の形状（success / users: {teacherId, email, name, method, lineRegistered}）
//     と email 小文字化重複排除ロジックは GAS line.js:498-528 と厳密一致

import { isAdminUser } from './auth.js';
import { supabaseSelect } from '../supabase.js';

// ─── Admin 判定ヘルパー（ai-learning.js:19 / schedule-overrides.js:95 と同一文言） ───
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

/**
 * getLineRegisteredUsers — GAS line.js:498 の Workers 版
 *
 * LINE 経由で自己登録済みのユーザー一覧を取得する（Admin のみ）。
 * 通知振り分け設定 UI のドロップダウン用。
 * Supabase `staffs` から全スタッフを取得し、LINE 未登録ユーザーも候補に含める。
 * email の小文字化キーで重複排除する（GAS 版と同一ロジック）。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args 未使用
 * @return {Object} { success, users: [{teacherId, email, name, method, lineRegistered}] }
 *                  | { success:false, error }
 */
export async function getLineRegisteredUsers(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const rows = await supabaseSelect(env, 'staffs',
      'select=id,email,display_name,name,notification_method,line_user_id');

    const seenEmails = {};
    const users = (rows || [])
      .filter((row) => {
        const emailKey = (row.email || '').toLowerCase();
        if (!emailKey || seenEmails[emailKey]) return false;
        seenEmails[emailKey] = true;
        return true;
      })
      .map((row) => ({
        teacherId: row.id || '',
        email: row.email || '',
        name: row.display_name || row.name || '',
        method: row.notification_method || 'gmail',
        lineRegistered: !!row.line_user_id
      }));

    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
