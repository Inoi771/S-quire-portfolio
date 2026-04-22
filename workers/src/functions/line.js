// line.js 関連関数の Workers ポート
//
// Phase 6-A-8：Admin 専用の LINE 自己登録ユーザー一覧取得を Workers 化
//   - getLineRegisteredUsers  → Supabase `staffs` 読み取り（Admin のみ）
//
// Phase 6-A-9：校舎別 LINE 通知振り分け設定の取得／更新を Workers 化
//   - getCampusNotificationRouting    → Firestore `config/notification_routing`
//                                       + KV `prop:GRADES_CAMPUS_CODES_CONFIG`
//   - updateCampusNotificationRouting → Firestore `config/notification_routing`
//                                       書込 + Firestore `operationLogs` 監査ログ
//
// 実装方針（Phase 6-A-5 notifications.js / 6-A-7 ai-learning.js と同型）:
//   - Admin 判定は isAdminUser 経由の denyIfNotAdmin_ ヘルパー
//     （GAS line.js:499/536/562 と同一文言 'Admin のみアクセス可能' を返す）
//   - Supabase REST は既存の supabaseSelect のみ使用
//   - Firestore ヘルパー（firestoreGet / firestoreSet）は firebase.js の既存公開関数を使用
//   - 通知振り分け用の内部ヘルパー（getCampusRoutingMap_ / setCampusRoutingMap_ /
//     logAdminActionToFirestore / makeScheduleSafeId_）は notifications.js /
//     schedule-overrides.js と同じパターンでモジュール内にインライン定義する
//     （GAS line.js:29 / 43 / admin.js:90 / schedule.js:49 と厳密一致）

import { isAdminUser } from './auth.js';
import { supabaseSelect } from '../supabase.js';
import { firestoreGet, firestoreSet } from '../firebase.js';

const PROP_PREFIX = 'prop:';
const KEY_CAMPUS_CODES = 'GRADES_CAMPUS_CODES_CONFIG';

// ─── Admin 判定ヘルパー（ai-learning.js:19 / schedule-overrides.js:95 と同一文言） ───
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─── Firestore config/notification_routing 読取（GAS line.js:29 と同等） ───
// notifications.js 内の同名 private helper と厳密一致。
async function getCampusRoutingMap_(env) {
  const doc = await firestoreGet(env, 'config', 'notification_routing');
  if (!doc) return {};
  const map = {};
  Object.keys(doc).forEach((k) => {
    if (k !== '_id' && k !== 'updatedAt') map[k] = doc[k];
  });
  return map;
}

// ─── Firestore config/notification_routing 書込（GAS line.js:43 と同等） ───
// updatedAt を付与してドキュメント全体を置換する（GAS setCampusRoutingMap_ と厳密一致）。
async function setCampusRoutingMap_(env, routingMap) {
  routingMap.updatedAt = new Date().toISOString();
  await firestoreSet(env, 'config', 'notification_routing', routingMap);
}

// ─── Firestore DocId 用 safe ID 変換（schedule-overrides.js:40 と同一） ───
function makeScheduleSafeId_(s) {
  return String(s || '').replace(/[^a-zA-Z0-9぀-鿿゠-ヿ]/g, '_').substring(0, 40);
}

// ─── 監査ログ書込（schedule-overrides.js:53 logAdminActionToFirestore と同一） ───
// GAS admin.js:90 `logAdminAction` の Workers 版（スプレッドシート記録は省略）。
// 失敗時はスローせずログ出力のみ（監査ログ失敗でメイン処理を止めない）。
async function logAdminActionToFirestore(env, action, details) {
  try {
    const now = new Date();
    const timestampMs = now.getTime();
    const docId = timestampMs + '_' + makeScheduleSafeId_(action);
    await firestoreSet(env, 'operationLogs', docId, {
      action: action || '',
      details: details || '',
      result: '成功',
      timestamp: now.toISOString(),
      operator: 'Workers'
    });
  } catch (error) {
    console.log('logAdminActionToFirestore エラー: ' + (error && error.toString ? error.toString() : error));
  }
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

/**
 * getCampusNotificationRouting — GAS line.js:535 の Workers 版
 *
 * 校舎ごとの通知振り分け設定を全件取得する（Admin のみ）。
 * KV `prop:GRADES_CAMPUS_CODES_CONFIG` に登録された校舎すべてに対して、
 * 通知を受け取る講師ID配列を Firestore `config/notification_routing` から取り出し合成する。
 *
 * GAS 版との差分: なし
 *   - 非 Admin 時は {success:false, error:'Admin のみアクセス可能'}
 *   - 例外時は {success:false, error: error.toString()}
 *   - KV 未設定・パース失敗時は GAS 版と同じく空配列を起点とする
 *     （routing 配列が空で返る）
 *
 * @param {Array} args 未使用
 * @return {Object} { success, routing: [{code, name, teacherIds}] }
 *                  | { success:false, error }
 */
export async function getCampusNotificationRouting(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const routingMap = await getCampusRoutingMap_(env);
    const raw = await env.KV.get(PROP_PREFIX + KEY_CAMPUS_CODES);
    let campuses = [];
    if (raw) {
      try { campuses = JSON.parse(raw); } catch (_) { campuses = []; }
    }
    const routing = (campuses || []).map((campus) => ({
      code: campus.code,
      name: campus.name,
      teacherIds: routingMap[campus.code] || []
    }));
    return { success: true, routing };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * updateCampusNotificationRouting — GAS line.js:561 の Workers 版
 *
 * 指定した校舎の通知振り分け先講師ID一覧を更新する（Admin のみ）。
 * Firestore `config/notification_routing` の該当校舎キーを
 * 新しい teacherIds 配列で置換し、`logAdminActionToFirestore` で
 * 監査ログ（Firestore `operationLogs`）を記録する。
 *
 * GAS 版との差分: なし（監査ログは GAS のスプレッドシート記録に代わり
 * schedule-overrides.js と同型の Firestore operationLogs 書込）
 *
 * @param {Array} args [campusCode, teacherIds]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function updateCampusNotificationRouting(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [campusCode, teacherIds] = args || [];
    if (!campusCode) return { success: false, error: '校舎コードを指定してください' };
    const routingMap = await getCampusRoutingMap_(env);
    routingMap[campusCode] = teacherIds || [];
    await setCampusRoutingMap_(env, routingMap);
    await logAdminActionToFirestore(env, '通知振り分け更新',
      '校舎コード: ' + campusCode + ', 受信者数: ' + (teacherIds || []).length);
    return { success: true, message: '通知振り分け設定を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
