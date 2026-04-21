// schedule.js 上書き系関数の Workers ポート
//
// Phase 5-E-8b-1a：グループ A 7 関数（settings パターン完全同質）
//   - setBasicTestDateOverride / deleteBasicTestDateOverride        → KV `prop:BASIC_TEST_DATES`
//   - setBasicTestDetails / deleteBasicTestDetails                   → KV `prop:BASIC_TEST_DETAILS`
//   - setPublicHighExamDateOverride / deletePublicHighExamDateOverride → KV `prop:PUBLIC_HIGH_EXAM_DATES`
//   - deleteJukuEventOverride                                        → KV `prop:JUKU_EVENT_OVERRIDES`
//
// Phase 5-E-8b-1b：グループ B 4 関数（条件付き同質・特殊ロジックあり）
//   - setJukuEventOverride             → KV `prop:JUKU_EVENT_OVERRIDES`（'none' 分岐で false 格納）
//   - addClosedDayExtra                → KV `prop:CLOSED_DAYS_OVERRIDES`（add/del デュアルリスト）
//   - removeComputedClosedDay          → KV `prop:CLOSED_DAYS_OVERRIDES`（add/del デュアルリスト）
//   - deleteClosedDayOverride          → KV `prop:CLOSED_DAYS_OVERRIDES`（add/del デュアルリスト）
//
// いずれも「KV から JSON を読む → フィールドを追加/削除 → JSON として書き戻す」
// 構造で、5-E-7 `updateSettings` と同質（単一キー・Admin 判定のみ・副作用なし）。
// 戻り値・エラーメッセージは GAS 側 `schedule.js` と完全一致させる。

import { isAdminUser } from './auth.js';

const PROP_PREFIX = 'prop:';

/**
 * 指定 KV キーから JSON を読み、オブジェクトとして返す。
 * 未設定・パース失敗時は空オブジェクト。
 * @private
 */
async function readKvJson_(env, key) {
  const raw = await env.KV.get(PROP_PREFIX + key);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

/**
 * 指定 KV キーにオブジェクトを JSON として書き込む。
 * @private
 */
async function writeKvJson_(env, key, obj) {
  await env.KV.put(PROP_PREFIX + key, JSON.stringify(obj));
}

/**
 * Admin 判定失敗時の拒否レスポンスを返す。成功時は null。
 * GAS `schedule.js` の `if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };`
 * と完全一致。
 * @private
 */
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─────────────────────────────────────────────────────────────
// BASIC_TEST_DATES（基礎学力テスト日程の上書き）
// ─────────────────────────────────────────────────────────────

/**
 * 基礎学力テスト日程を上書き設定する（Admin のみ）
 * GAS schedule.js:588 の Workers 版。
 * @param {Array} args [academicYear, testNum, dateStr]
 */
export async function setBasicTestDateOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [academicYear, testNum, dateStr] = args || [];
    const overrides = await readKvJson_(env, 'BASIC_TEST_DATES');
    overrides[academicYear + '-' + testNum] = dateStr;
    await writeKvJson_(env, 'BASIC_TEST_DATES', overrides);
    return { success: true, message: '日程を設定しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テスト日程の上書き設定を削除する（Admin のみ）
 * GAS schedule.js:610 の Workers 版。
 * @param {Array} args [academicYear, testNum]
 */
export async function deleteBasicTestDateOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [academicYear, testNum] = args || [];
    const overrides = await readKvJson_(env, 'BASIC_TEST_DATES');
    delete overrides[academicYear + '-' + testNum];
    await writeKvJson_(env, 'BASIC_TEST_DATES', overrides);
    return { success: true, message: '上書き設定を削除しました（自動計算に戻ります）' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// BASIC_TEST_DETAILS（基礎学力テスト詳細テキストの上書き）
// ─────────────────────────────────────────────────────────────

/**
 * 基礎学力テストの詳細テキストを上書き保存する（Admin のみ）
 * GAS schedule.js:647 の Workers 版。
 * @param {Array} args [academicYear, testNum, details]
 */
export async function setBasicTestDetails(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [academicYear, testNum, details] = args || [];
    const obj = await readKvJson_(env, 'BASIC_TEST_DETAILS');
    obj[academicYear + '-' + testNum] = details || '';
    await writeKvJson_(env, 'BASIC_TEST_DETAILS', obj);
    return { success: true, message: '保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テストの詳細テキスト上書きを削除してデフォルト（中3）に戻す（Admin のみ）
 * GAS schedule.js:667 の Workers 版。
 * @param {Array} args [academicYear, testNum]
 */
export async function deleteBasicTestDetails(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [academicYear, testNum] = args || [];
    const obj = await readKvJson_(env, 'BASIC_TEST_DETAILS');
    delete obj[academicYear + '-' + testNum];
    await writeKvJson_(env, 'BASIC_TEST_DETAILS', obj);
    return { success: true, message: 'デフォルト（中3）に戻しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC_HIGH_EXAM_DATES（公立高校一般選抜日程の上書き）
// ─────────────────────────────────────────────────────────────

/**
 * 公立高校一般選抜の日程を上書き保存する（Admin のみ）
 * GAS schedule.js:702 の Workers 版。
 * @param {Array} args [academicYear, dateStr]
 */
export async function setPublicHighExamDateOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [academicYear, dateStr] = args || [];
    const overrides = await readKvJson_(env, 'PUBLIC_HIGH_EXAM_DATES');
    overrides[String(academicYear)] = dateStr;
    await writeKvJson_(env, 'PUBLIC_HIGH_EXAM_DATES', overrides);
    return { success: true, message: '日程を設定しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 公立高校一般選抜の日程上書き設定を削除し自動計算に戻す（Admin のみ）
 * GAS schedule.js:721 の Workers 版。
 * @param {Array} args [academicYear]
 */
export async function deletePublicHighExamDateOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [academicYear] = args || [];
    const overrides = await readKvJson_(env, 'PUBLIC_HIGH_EXAM_DATES');
    delete overrides[String(academicYear)];
    await writeKvJson_(env, 'PUBLIC_HIGH_EXAM_DATES', overrides);
    return { success: true, message: '上書き設定を削除しました（自動計算に戻ります）' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// JUKU_EVENT_OVERRIDES（塾内部イベントの上書き削除のみ）
// ─────────────────────────────────────────────────────────────

/**
 * 塾内部イベントの上書き設定を削除して自動計算に戻す（Admin のみ）
 * GAS schedule.js:785 の Workers 版。
 * @param {Array} args [type, year, month]
 */
export async function deleteJukuEventOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [type, year, month] = args || [];
    const key = type + '_' + year + '_' + month;
    const overrides = await readKvJson_(env, 'JUKU_EVENT_OVERRIDES');
    delete overrides[key];
    await writeKvJson_(env, 'JUKU_EVENT_OVERRIDES', overrides);
    return { success: true, message: '自動計算に戻しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 塾内部イベントの上書き設定を保存する（Admin のみ）
 * GAS schedule.js:759 の Workers 版。
 *
 * 特殊ロジック：`dateStr === 'none'` のとき値を `false`（無効化フラグ）で
 * 格納する。それ以外は `{ date, details }` オブジェクトを格納。
 * `details` は省略時に空文字列にフォールバック。
 *
 * @param {Array} args [type, year, month, dateStr, details]
 */
export async function setJukuEventOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [type, year, month, dateStr, details] = args || [];
    const key = type + '_' + year + '_' + month;
    const overrides = await readKvJson_(env, 'JUKU_EVENT_OVERRIDES');
    if (dateStr === 'none') {
      overrides[key] = false; // 無効化（その月はイベントなし）
    } else {
      overrides[key] = { date: dateStr, details: details || '' };
    }
    await writeKvJson_(env, 'JUKU_EVENT_OVERRIDES', overrides);
    return { success: true, message: '保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ─────────────────────────────────────────────────────────────
// CLOSED_DAYS_OVERRIDES（休校日の add/del デュアルリスト管理）
// ─────────────────────────────────────────────────────────────
//
// 値の形状は `{ add: [...], del: [...] }`。
//   - `add`: 計算上は開校日だが臨時休校にする日
//   - `del`: 計算上は休校日だが開校日にする日
// どの関数も片方への追加と同時にもう片方から同じ日付を除外することで、
// 同一日付が add と del に同時に存在しない（＝排他）不変条件を維持する。

/**
 * add/del 両配列を defensive に初期化した状態で CLOSED_DAYS_OVERRIDES を読む。
 * 既存値の形状が壊れていても `{ add: [], del: [] }` に正規化する。
 * @private
 */
async function readClosedDays_(env) {
  const obj = await readKvJson_(env, 'CLOSED_DAYS_OVERRIDES');
  obj.add = Array.isArray(obj.add) ? obj.add : [];
  obj.del = Array.isArray(obj.del) ? obj.del : [];
  return obj;
}

/**
 * 予定タブに休校日を追加（計算外の臨時休校など）（Admin のみ）
 * GAS schedule.js:821 の Workers 版。
 *
 * 特殊ロジック：`add` に dateStr を push（重複チェック付き）すると同時に
 * `del` から同じ dateStr を filter 除去する（排他不変条件の維持）。
 *
 * @param {Array} args [dateStr]
 */
export async function addClosedDayExtra(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [dateStr] = args || [];
    const obj = await readClosedDays_(env);
    if (obj.add.indexOf(dateStr) === -1) obj.add.push(dateStr);
    obj.del = obj.del.filter((d) => d !== dateStr);
    await writeKvJson_(env, 'CLOSED_DAYS_OVERRIDES', obj);
    return { success: true, message: dateStr + ' を休校日に追加しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 計算上は休校日だが予定タブでは開校日とする（Admin のみ）
 * GAS schedule.js:843 の Workers 版。
 *
 * 特殊ロジック：`del` に dateStr を push（重複チェック付き）すると同時に
 * `add` から同じ dateStr を filter 除去する（`addClosedDayExtra` の対称）。
 *
 * @param {Array} args [dateStr]
 */
export async function removeComputedClosedDay(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [dateStr] = args || [];
    const obj = await readClosedDays_(env);
    if (obj.del.indexOf(dateStr) === -1) obj.del.push(dateStr);
    obj.add = obj.add.filter((d) => d !== dateStr);
    await writeKvJson_(env, 'CLOSED_DAYS_OVERRIDES', obj);
    return { success: true, message: dateStr + ' を開校日に変更しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 休校日の上書き設定を削除して元の計算値に戻す（Admin のみ）
 * GAS schedule.js:865 の Workers 版。
 *
 * 特殊ロジック：add/del 両配列から dateStr を filter 除去する
 * （どちらに入っていても確実にクリア）。
 *
 * @param {Array} args [dateStr]
 */
export async function deleteClosedDayOverride(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [dateStr] = args || [];
    const obj = await readClosedDays_(env);
    obj.add = obj.add.filter((d) => d !== dateStr);
    obj.del = obj.del.filter((d) => d !== dateStr);
    await writeKvJson_(env, 'CLOSED_DAYS_OVERRIDES', obj);
    return { success: true, message: '元の設定に戻しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
