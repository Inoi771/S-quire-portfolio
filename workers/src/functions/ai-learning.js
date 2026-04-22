// AI 自動学習管理 6 関数（GAS features.js:2152-2292 の Workers ポート）
// Phase 6-A-7: getAutoLearnedKnowledge / editAutoLearnedKnowledge /
//              deleteAutoLearnedKnowledge / getAiFeedback /
//              resolveAiFeedback / deleteAiFeedback
//
// 実装方針（Phase 6-A-5 / features.js:107 と同型）:
//   - 全関数 Admin 必須 → denyIfNotAdmin_() で features.js と同じ
//     メッセージ 'Admin のみアクセス可能' を返す
//   - Supabase REST は supabaseSelect/Update/Delete の既存ヘルパーのみ使用
//     （新規 RPC・新規ヘルパーなし）
//   - キャメル↔スネーク変換は関数内インラインマッパー
//     （GAS features.js:2159-2164, 2240-2244 と厳密一致）
//   - 戻り値形状（success / error / message / entries）は GAS 版と完全一致

import { isAdminUser } from './auth.js';
import { supabaseSelect, supabaseUpdate, supabaseDelete } from '../supabase.js';

// ─── Admin 判定ヘルパー（features.js:107 と同一文言・同一構造） ───
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─── 行マッパー（GAS features.js の手書きマッピングと厳密一致） ───
function mapLearnedRow_(r) {
  return {
    _id: r.id,
    category: r.category,
    content: r.content,
    reason: r.reason,
    source: r.source,
    learnedAt: r.learned_at,
    updatedAt: r.updated_at
  };
}
function mapFeedbackRow_(r) {
  return {
    _id: r.id,
    type: r.type,
    summary: r.summary,
    userQuery: r.user_query,
    resolved: r.resolved,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at
  };
}

/**
 * getAutoLearnedKnowledge — GAS features.js:2152 の Workers 版
 *
 * AI 自動学習エントリ一覧を取得する（Admin のみ）。
 * Supabase ai_learned_knowledge テーブルから learned_at 降順で取得し、
 * フロントエンド互換のキャメルケースに変換して返す。
 *
 * GAS 版との差分: なし（Logger.log は Workers 環境制約により省略）
 *
 * @param {Array} args 未使用
 * @return {Object} { success, entries } | { success:false, error }
 */
export async function getAutoLearnedKnowledge(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const rows = await supabaseSelect(env, 'ai_learned_knowledge', 'order=learned_at.desc');
    const entries = (rows || []).map(mapLearnedRow_);
    return { success: true, entries };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * editAutoLearnedKnowledge — GAS features.js:2179 の Workers 版
 *
 * AI 自動学習エントリを編集する（Admin のみ）。
 * 存在確認 → category/content/updated_at を部分更新。
 *
 * GAS 版との差分: なし（URL エンコードを Select にも適用、動作は同等）
 *
 * @param {Array} args [docId, entryJson]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function editAutoLearnedKnowledge(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [docId, entryJson] = args || [];
    const entry = JSON.parse(entryJson);
    if (!entry.category || !entry.content) {
      return { success: false, error: 'カテゴリと内容は必須です' };
    }
    // 既存レコードを確認（GAS features.js:2190-2193 と同一）
    const rows = await supabaseSelect(env, 'ai_learned_knowledge',
      'id=eq.' + encodeURIComponent(docId));
    if (!rows || rows.length === 0) {
      return { success: false, error: '指定されたエントリが見つかりません' };
    }
    await supabaseUpdate(env, 'ai_learned_knowledge', {
      category: entry.category,
      content: entry.content,
      updated_at: new Date().toISOString()
    }, 'id=eq.' + encodeURIComponent(docId));
    return { success: true, message: '更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * deleteAutoLearnedKnowledge — GAS features.js:2211 の Workers 版
 *
 * AI 自動学習エントリを削除する（Admin のみ）。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args [docId]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function deleteAutoLearnedKnowledge(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [docId] = args || [];
    await supabaseDelete(env, 'ai_learned_knowledge',
      'id=eq.' + encodeURIComponent(docId));
    return { success: true, message: '削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getAiFeedback — GAS features.js:2232 の Workers 版
 *
 * AI フィードバック一覧を取得する（Admin のみ）。
 * Supabase ai_feedback テーブルから created_at 降順で取得し、
 * フロントエンド互換のキャメルケースに変換して返す。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args 未使用
 * @return {Object} { success, entries } | { success:false, error }
 */
export async function getAiFeedback(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const rows = await supabaseSelect(env, 'ai_feedback', 'order=created_at.desc');
    const entries = (rows || []).map(mapFeedbackRow_);
    return { success: true, entries };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * resolveAiFeedback — GAS features.js:2258 の Workers 版
 *
 * AI フィードバックを解決済みにする（Admin のみ）。
 * 存在確認 → resolved=true / resolved_at を部分更新。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args [docId]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function resolveAiFeedback(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [docId] = args || [];
    const rows = await supabaseSelect(env, 'ai_feedback',
      'id=eq.' + encodeURIComponent(docId));
    if (!rows || rows.length === 0) {
      return { success: false, error: 'エントリが見つかりません' };
    }
    await supabaseUpdate(env, 'ai_feedback', {
      resolved: true,
      resolved_at: new Date().toISOString()
    }, 'id=eq.' + encodeURIComponent(docId));
    return { success: true, message: '解決済みにしました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * deleteAiFeedback — GAS features.js:2281 の Workers 版
 *
 * AI フィードバックを削除する（Admin のみ）。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args [docId]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function deleteAiFeedback(args, env, user) {
  throw new Error('test 5xx');  // ← この1行を追加（テスト用・後で削除）
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [docId] = args || [];
    await supabaseDelete(env, 'ai_feedback',
      'id=eq.' + encodeURIComponent(docId));
    return { success: true, message: 'フィードバックを削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
