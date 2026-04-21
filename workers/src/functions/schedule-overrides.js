// schedule.js 上書き系関数の Workers ポート（Phase 5-E-8b-1a：グループ A 7 関数）
//
// 対象（グループ A・settings パターン完全同質）：
//   - setBasicTestDateOverride / deleteBasicTestDateOverride        → KV `prop:BASIC_TEST_DATES`
//   - setBasicTestDetails / deleteBasicTestDetails                   → KV `prop:BASIC_TEST_DETAILS`
//   - setPublicHighExamDateOverride / deletePublicHighExamDateOverride → KV `prop:PUBLIC_HIGH_EXAM_DATES`
//   - deleteJukuEventOverride                                        → KV `prop:JUKU_EVENT_OVERRIDES`
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
 * `setJukuEventOverride` は 'none' 分岐があるためグループ B として後続フェーズで扱う。
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
