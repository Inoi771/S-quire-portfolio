// Admin 系ハンドラー
//
// Phase 5-E-11 で getAdminEmails に加え ScriptProperties GUI 操作 3 関数を
// 完全 Workers 化した。KV が一次ソース（Phase 5-E-6 以降）なので KV の
// get/put/delete/list で完結する。Admin 判定は `./auth.js` の isAdminUser
// に集約（prop:ADMIN_EMAILS 優先、未設定時のみ env.ADMIN_EMAILS フォールバック）。

import { isAdminUser, getAdminEmailList } from './auth.js';
import { firestoreSet } from '../firebase.js';
import { supabaseSelect } from '../supabase.js';
import { getCampusConfig_, getCampusDetailsConfig_ } from './grades.js';

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

/**
 * 現行の会計年度（4月起算）を返す。
 * GAS students.js:104 `getCurrentFiscalYear()` と完全一致:
 *   - 4月〜12月 → 当年
 *   - 1月〜3月 → 前年
 * エラー時のフォールバックも GAS 版と揃える（当年を返す）。
 * @private
 * @return {number}
 */
function getCurrentFiscalYear_() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    if (month >= 4) return year;
    return year - 1;
  } catch (e) {
    return new Date().getFullYear();
  }
}

/**
 * 【Phase 6-A-20】_placementEditableYears_ — GAS admin.js:1305 の Workers 版（純関数）
 *
 * 講師配置の編集可能年度リストを返す。
 * - 常に現行年度
 * - JST で 1〜3 月は翌年度（来年度の準備期間）も含める
 *
 * JST 補正:
 *   Workers は UTC で動作するため、`new Date()` だと日本時間 9:00 以降で
 *   UTC 日付が前日になるケースがある。`Date.now() + 9h` で JST 壁時計を取得し、
 *   `getUTCMonth()` で JST 月を得る（Phase 6-A-11 `getCurrentFiscalYear_` と同方針）。
 *
 * @private
 * @param {number} currentFY
 * @returns {Array<{year:number, label:string, isNext:boolean}>}
 */
function _placementEditableYears_(currentFY) {
  const list = [{ year: currentFY, label: currentFY + '年度（現行）', isNext: false }];
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const month = jstNow.getUTCMonth() + 1;
  if (month >= 1 && month <= 3) {
    list.push({ year: currentFY + 1, label: (currentFY + 1) + '年度（来年度）', isNext: true });
  }
  return list;
}

/**
 * 【Phase 6-A-11】getPlacementTeacherNames — GAS admin.js:1425 の Workers 版
 *
 * 講師配置表（`STAFF_PLACEMENT_{year}`）から講師名・担当科目のペアを返す。
 * 講習管理タブの「講師ドロップダウン」用（js-lectures.html:475）。
 *
 * 認証:
 *   Firebase ID トークン検証のみ（router.js で実施）。Admin ガードは付けない
 *   — GAS 版も一般スタッフから呼び出される参照系関数のため。
 *
 * GAS 版との差分:
 *   - `_placementMigrateLegacyKey()` 相当の旧単一キー `STAFF_PLACEMENT` の
 *     現行年度キーへのコピー／削除は省略（既に移行は一巡済みで、現行年度
 *     キーのみを読むだけで機能的に一致する。Phase 6-A-11 調査レポート参照）。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   - 成功（データあり）: { success: true, teachers: [{name, subject}, ...] }
 *   - 成功（データ無し）: { success: true, teachers: [] }
 *   - 失敗: { success: false, teachers: [], error: <文言> }
 */
export async function getPlacementTeacherNames(args, env, user) {
  try {
    const currentFY = getCurrentFiscalYear_();
    const json = await env.KV.get(PROP_PREFIX + 'STAFF_PLACEMENT_' + currentFY);
    if (!json) return { success: true, teachers: [] };
    const data = JSON.parse(json);
    const teachers = (data.teachers || [])
      .map((t) => ({ name: t.name || '', subject: t.subject || '' }))
      .filter((t) => t.name);
    return { success: true, teachers };
  } catch (e) {
    return { success: false, teachers: [], error: e.toString() };
  }
}

/**
 * 【Phase 6-A-20】getStaffPlacementForWeb — GAS admin.js:1320 の Workers 版
 *
 * 講師配置データを取得する（資料タブ → 講師配置）。年度別キー
 * `STAFF_PLACEMENT_{year}` で保存された配置データ + 校舎設定 + スタッフ一覧 +
 * 編集可能年度 を合成して返す。
 *
 * 認証:
 *   Firebase ID トークン検証のみ（Admin ガードなし・GAS 版踏襲）。
 *   一般スタッフも閲覧可能、フロント側で編集ボタンを制御。
 *
 * GAS 版との差分（Phase 6-A-11 系譜）:
 *   - `_placementMigrateLegacyKey()` 相当の旧単一キー migration を **完全省略**
 *   - `_placementArchiveOldYears()` 相当の旧年度アーカイブを **完全省略**
 *     いずれも本番で 1 年以上前から GAS 側で発火済みの副作用のため。
 *   - 第 1 段の KV/Supabase/校舎情報取得を Promise.all で **4 並列化**
 *     （GAS 版は逐次、Workers 版は並列化で体感速度向上）
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, data, year, currentFiscalYear, editableYears,
 *           campusConfig, campusDetailsMap, staffList }
 *     - data: KV JSON.parse 結果（null 可）。data.campuses に campusDetailsMap の
 *       tel/fax/principal/mobile をデフォルトとしてマージ
 *   失敗: { success: false, error: <文言> }
 */
export async function getStaffPlacementForWeb(args, env, user) {
  try {
    const currentFY = getCurrentFiscalYear_();
    // 旧キー migration / 旧年度アーカイブは完全省略（Phase 6-A-11 系譜）

    const editableYears = _placementEditableYears_(currentFY);
    const [requestedYear] = args || [];
    let year = parseInt(requestedYear, 10);
    if (isNaN(year) || !editableYears.some((e) => e.year === year)) {
      year = currentFY;
    }

    // 第 1 段: KV 読取 + 校舎 config + 校舎詳細 + Supabase staffs を 4 並列
    const [json, campusConfig, campusDetails, staffRows] = await Promise.all([
      env.KV.get(PROP_PREFIX + 'STAFF_PLACEMENT_' + year),
      getCampusConfig_(env),
      getCampusDetailsConfig_(env),
      supabaseSelect(env, 'staffs',
        'select=id,display_name,name,preferred_campuses,subjects')
    ]);

    // 校舎詳細を辞書化（{code: {code, name, tel, fax, principal, mobile}}）
    const campusDetailsMap = {};
    (campusDetails || []).forEach((c) => { campusDetailsMap[c.code] = c; });

    // スタッフ一覧を整形 + ソート（配属あり優先・同グループ内は五十音順）
    const staffList = (staffRows || [])
      .map((r) => ({
        id: r.id,
        name: r.display_name || r.name || '',
        preferredCampuses: r.preferred_campuses || [],
        subjects: r.subjects || []
      }))
      .filter((s) => s.name)
      .sort((a, b) => {
        const aHas = (a.preferredCampuses.length > 0) ? 0 : 1;
        const bHas = (b.preferredCampuses.length > 0) ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return a.name.localeCompare(b.name, 'ja');
      });

    // KV JSON.parse（null 可）
    let data = null;
    if (json) {
      try { data = JSON.parse(json); } catch (_) { data = null; }
    }

    // 保存済みデータの campuses にデフォルト値をマージ
    if (data && data.campuses) {
      Object.keys(data.campuses).forEach((code) => {
        const def = campusDetailsMap[code] || {};
        const c = data.campuses[code];
        if (!c.tel && def.tel) c.tel = def.tel;
        if (!c.fax && def.fax) c.fax = def.fax;
        if (!c.principal && def.principal) c.principal = def.principal;
        if (!c.mobile && def.mobile) c.mobile = def.mobile;
      });
    }
    // year フィールドを確実に付与
    if (data && !data.year) data.year = year;

    return {
      success: true,
      data,
      year,
      currentFiscalYear: currentFY,
      editableYears,
      campusConfig,
      campusDetailsMap,
      staffList
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 【Phase 6-A-20】saveStaffPlacementForWeb — GAS admin.js:1389 の Workers 版
 *
 * 講師配置データを保存する（Admin のみ）。編集可能年度を検証した上で
 * KV `STAFF_PLACEMENT_{targetYear}` に書込する。
 *
 * 認証:
 *   `isAdminUser(env, user)` を直接 await（assertAdmin_ の throw 403 ではなく
 *   200 + success:false を返すため・GAS 版挙動踏襲）。
 *
 * GAS 版の潜在バグ:
 *   GAS 版は `isAdmin_(email)` / `getFirebaseEmailContext_()` を呼ぶが、これらは
 *   コードベース内に未定義。Workers 版では `isAdminUser` で正しく判定するため、
 *   暗黙的に「save が確実に動くようになる」改善となる。
 *
 * GAS 版との差分:
 *   - Admin 判定は `isAdminUser(env, user)` で実施（GAS 版の未定義関数を回避）
 *   - 旧キー migration / アーカイブは完全省略
 *   - dataJson 破損時は GAS 版と同じく**そのまま保存**（catch 内で toSave 維持）
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, year: targetYear }
 *   失敗: { success: false, error: <文言> }
 *     - 非 Admin: '管理者のみ編集できます'
 *     - 編集不可年度: '{year}年度は現在編集できません（編集可能年度: {list}）'
 */
export async function saveStaffPlacementForWeb(args, env, user) {
  try {
    if (!(await isAdminUser(env, user))) {
      return { success: false, error: '管理者のみ編集できます' };
    }
    const [dataJson, year] = args || [];

    const currentFY = getCurrentFiscalYear_();
    const editableYears = _placementEditableYears_(currentFY);
    const parsedYear = parseInt(year, 10);
    const targetYear = (!isNaN(parsedYear)) ? parsedYear : currentFY;

    const allowed = editableYears.some((e) => e.year === targetYear);
    if (!allowed) {
      return {
        success: false,
        error: targetYear + '年度は現在編集できません（編集可能年度: '
          + editableYears.map((e) => e.year).join(', ') + '）'
      };
    }

    // year フィールドを揃えて保存（GAS 版と同じく破損時はそのまま保存）
    let toSave = dataJson;
    try {
      const parsed = JSON.parse(dataJson);
      parsed.year = targetYear;
      toSave = JSON.stringify(parsed);
    } catch (_) { /* JSON 破損時はそのまま保存（GAS 版と同挙動） */ }

    await env.KV.put(PROP_PREFIX + 'STAFF_PLACEMENT_' + targetYear, toSave);
    return { success: true, year: targetYear };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * 【Phase 6-A-15】getCachedHolidays — GAS admin.js:1145 の Workers 版
 *
 * KV `HOLIDAY_CACHE` にキャッシュされた祝日データを返す。アプリ起動時に
 * フロントエンドが呼び出す高頻度関数（CalendarApp 直アクセスより高速）。
 *
 * 認証:
 *   Firebase ID トークン検証のみ（Admin ガードなし）。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   生のオブジェクト `{ "YYYY-MM-DD": "祝日名", ... }` を直接返す
 *   （`{success, holidays}` 等でラップしない）。
 *   未キャッシュ時・JSON パース失敗時は `{}`（空オブジェクト）を返す。
 *   フロントは `Object.keys(holidays).length > 0` でチェックするため、
 *   必ずオブジェクトを返し null/undefined は返さない。
 *
 * キャッシュ更新:
 *   GAS 側 refreshHolidayCache（CalendarApp 依存・日次トリガー）が担当。
 *   Workers 側は読取専用。
 */
export async function getCachedHolidays(args, env, user) {
  try {
    const raw = await env.KV.get(PROP_PREFIX + 'HOLIDAY_CACHE');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}
