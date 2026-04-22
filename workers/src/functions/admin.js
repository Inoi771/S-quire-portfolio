// Admin 系ハンドラー
//
// Phase 5-E-11 で getAdminEmails に加え ScriptProperties GUI 操作 3 関数を
// 完全 Workers 化した。KV が一次ソース（Phase 5-E-6 以降）なので KV の
// get/put/delete/list で完結する。Admin 判定は `./auth.js` の isAdminUser
// に集約（prop:ADMIN_EMAILS 優先、未設定時のみ env.ADMIN_EMAILS フォールバック）。

import { isAdminUser, getAdminEmailList } from './auth.js';
import { firestoreSet } from '../firebase.js';

const PROP_PREFIX = 'prop:';

// GAS admin.js:20-28 と一致
const DEPRECATED_KEYS = [
  'TEACHER_ID_MAP',
  'LINE_USER_MAPPING',
  'NOTIFICATION_METHODS',
  'NOTIFICATION_EMAILS',
  'LINE_SCHEDULER_NOTIF_PREFS',
  'CAMPUS_NOTIFICATION_ROUTING',
  'GRADES_GRADE_CODES_CONFIG'
];

/**
 * Admin 専用操作の入口で Admin 判定を行い、非 Admin は 403 で reject する。
 * throw した Error の `.status = 403` が `workers/src/index.js` で HTTP 403 に変換される。
 * @param {Object} env
 * @param {{email?:string, uid?:string}} user
 */
async function assertAdmin_(env, user) {
  if (await isAdminUser(env, user)) return;
  const err = new Error('管理者権限が必要です');
  err.status = 403;
  throw err;
}

/**
 * operationLogs に Admin 操作ログを書き込む。
 * GAS 側 admin.js `recordOperationLog()` と同じフィールド構成で揃える。
 * 書込失敗は console.error のみで飲み込み、本処理の戻り値に影響させない。
 * @param {Object} env
 * @param {{email?:string}} user
 * @param {string} action
 * @param {Object} details
 * @param {string} [status='成功']
 */
async function recordOperationLog_(env, user, action, details, status) {
  try {
    const now = new Date();
    const docId = 'log_' + now.getTime() + '_' + Math.random().toString(36).substring(2, 7);
    await firestoreSet(env, 'operationLogs', docId, {
      timestamp: now.toISOString(),
      userId: user && user.email ? user.email : '',
      userRole: '🔐 Admin',
      action: action || '',
      details: JSON.stringify(details || {}),
      status: status || '成功'
    });
  } catch (e) {
    console.error('recordOperationLog_ failed:', e && e.message ? e.message : e);
  }
}

/**
 * 管理者メール一覧取得
 * Phase 5-E-11: isAdminUser と同じ取得源（prop:ADMIN_EMAILS → env.ADMIN_EMAILS）に統一。
 */
export async function getAdminEmails(args, env, user) {
  if (!(await isAdminUser(env, user))) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  // GAS 版と同じく trim のみ（lowercase しない）で返す
  const raw = await getAdminEmailList(env, { lowercase: false });
  return { success: true, emails: raw };
}

/**
 * すべての ScriptProperties を取得（Admin のみ）
 * GAS admin.js `getAllScriptPropertiesForGUI()` の Workers 版。
 *
 * GAS 版との挙動一致ポイント：
 *  - DEPRECATED_KEYS の自動削除
 *  - `GEMINI_TEAM_*` プレフィックスの自動削除
 *  - `HOLIDAY_CACHE` と `_UP_*` プレフィックスは表示から除外
 *  - マスク: key に `KEY` / `SECRET` / `PASSWORD` が含まれる場合 `***マスク済み***`
 *  - 長い値（>50 文字）は `substring(0, 47) + '...'`
 *  - 返却形式: `{ success, properties: [{key, value, isMasked, actualLength}, ...] }`
 */
export async function getAllScriptPropertiesForGUI(args, env, user) {
  await assertAdmin_(env, user);

  // KV 全キー列挙（ページネーション対応）
  const keys = [];
  let cursor = undefined;
  do {
    const listOpts = { prefix: PROP_PREFIX, limit: 1000 };
    if (cursor) listOpts.cursor = cursor;
    const result = await env.KV.list(listOpts);
    (result.keys || []).forEach((k) => {
      if (k.name && k.name.startsWith(PROP_PREFIX)) {
        keys.push(k.name.substring(PROP_PREFIX.length));
      }
    });
    cursor = result.list_complete ? null : (result.cursor || null);
  } while (cursor);

  // 値を並列取得
  const values = await Promise.all(
    keys.map((k) => env.KV.get(PROP_PREFIX + k))
  );
  const props = {};
  keys.forEach((k, i) => {
    if (values[i] !== null && values[i] !== undefined) props[k] = values[i];
  });

  // 廃止キー・GEMINI_TEAM_* プレフィックスを KV から自動削除（GAS 版と一致）
  const deleteOps = [];
  DEPRECATED_KEYS.forEach((k) => {
    if (k in props) {
      deleteOps.push(env.KV.delete(PROP_PREFIX + k).catch(() => {}));
    }
  });
  Object.keys(props).forEach((k) => {
    if (k.indexOf('GEMINI_TEAM_') === 0) {
      deleteOps.push(env.KV.delete(PROP_PREFIX + k).catch(() => {}));
      delete props[k];
    }
  });
  if (deleteOps.length > 0) {
    await Promise.all(deleteOps);
  }

  // 表示用リスト生成（GAS admin.js:46-75 とフィルタ・マスク順を一致）
  const safProps = [];
  for (const key of Object.keys(props)) {
    if (DEPRECATED_KEYS.indexOf(key) !== -1) continue;
    if (key === 'HOLIDAY_CACHE') continue;
    if (key.indexOf('_UP_') === 0) continue;
    if (key.indexOf('GEMINI_TEAM_') === 0) continue;

    const value = props[key];
    let displayValue = value;
    let isMasked = false;

    if (key.indexOf('KEY') !== -1 || key.indexOf('SECRET') !== -1 || key.indexOf('PASSWORD') !== -1) {
      displayValue = '***マスク済み***';
      isMasked = true;
    }

    if (displayValue.length > 50) {
      displayValue = displayValue.substring(0, 47) + '...';
    }

    safProps.push({
      key: key,
      value: displayValue,
      isMasked: isMasked,
      actualLength: value.length
    });
  }

  return { success: true, properties: safProps };
}

/**
 * ScriptProperty を更新（Admin のみ）
 * GAS admin.js `updateScriptPropertyFromGUI()` の Workers 版。
 *
 * Phase 5-E-6 以降、書込先は KV のみ（SP への Dual-write は凍結済み）。
 * @param {Array} args [key: string, newValue: string]
 */
export async function updateScriptPropertyFromGUI(args, env, user) {
  await assertAdmin_(env, user);

  const [key, newValue] = args || [];
  if (!key || typeof key !== 'string') {
    return { success: false, error: 'プロパティキーが指定されていません' };
  }
  if (typeof newValue !== 'string') {
    return { success: false, error: '値は文字列である必要があります' };
  }

  const oldValue = await env.KV.get(PROP_PREFIX + key);
  await env.KV.put(PROP_PREFIX + key, newValue);

  await recordOperationLog_(env, user, 'updateScriptProperty', {
    key: key,
    oldValueLength: oldValue ? oldValue.length : 0,
    newValueLength: newValue.length
  }, '成功');

  return { success: true, message: 'プロパティを更新しました' };
}

/**
 * ScriptProperty を削除（Admin のみ）
 * GAS admin.js `deleteScriptPropertyFromGUI()` の Workers 版。
 *
 * Phase 5-E-6 以降、削除先は KV のみ。
 * @param {Array} args [key: string]
 */
export async function deleteScriptPropertyFromGUI(args, env, user) {
  await assertAdmin_(env, user);

  const [key] = args || [];
  if (!key || typeof key !== 'string') {
    return { success: false, error: 'プロパティキーが指定されていません' };
  }

  await env.KV.delete(PROP_PREFIX + key);

  await recordOperationLog_(env, user, 'deleteScriptProperty', { key: key }, '成功');

  return { success: true, message: 'プロパティを削除しました' };
}
