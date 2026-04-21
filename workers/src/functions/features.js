// features.js AI 知識ベース / 講習挨拶文 / 講習期間 / 通常授業設定 の Workers ポート
//
// Phase 5-E-9b-2a（コミット b13f148）:
//       F1  getAiKnowledgeBase        (読取・R-例外・Admin 必須)
//       F2  saveAiKnowledgeEntry      (書込・id 指定で upsert)
//       F3  deleteAiKnowledgeEntry    (書込・filter 除去)
//       F11 getLectureGreetings       (読取・単純 KV)
//       F12 saveLectureGreetings      (書込・単純 KV)
// Phase 5-E-9b-2a-2（本コミット・5-E-9b-2a クローズ）:
//       F5  getLecturePeriods         (読取・6 種×2 年度×合成・日付計算ヘルパーチェイン)
//       F6  saveLectureDates          (書込・upsert + gradeSettings デフォルト埋め)
//       F7  resetLectureDates         (書込・hasCustomGrades 分岐で再計算 or 削除)
//       + LEC_TYPE_IDS / LEC_TYPE_NAMES 定数
//       + 日付計算ヘルパー 11 件（addDaysLec_ / formatDateStrLec_ / getNthWeekdayOfMonth_ /
//         isHolidayLec_ / isWeekendOrHolidayLec_ / getNextWeekdayLec_ /
//         getFirstWedOnOrAfterLec_ / computeBasicTestDateLec_ /
//         getPublicHighSchoolExamDateLec_ / countBackSchoolDays_ /
//         computeClosedDaysForMonth_）
//       + getDefaultGradeSettings_ / getJstNow_ 補助
//
// タイムゾーン注記: GAS（Asia/Tokyo）と Workers（UTC）の差は `new Date()`
// 使用時のみ発生。`new Date(y,m-1,d)` で特定日を作成し同じオブジェクトから
// Y/M/D を読む経路はタイムゾーン非依存のため影響なし。F5 の現時点判定だけ
// `getJstNow_()` で JST 壁時計に揃える。詳細は docs/phase-5e9-survey.md
// の「実装上の決定記録」セクション参照。
//
// Phase 5-E-9b-2b（本コミット・5-E-9b-2b クローズ）:
//       F8  getLecturePricingConfig     (読取・旧フォーマット自動移行書込あり)
//       F13 getNormalClassConfig        (読取・旧配列 LEGACY 退避書込 + 新キー書込)
//       F15 getNormalClassSectionsForWeb (F13 を呼び campusCode でフィルタ)
//       + getDefaultLecturePricing_     (F8 用デフォルト値 + 自動移行ベース)
//       + migrateLecturePricingData_    (F8 旧→新変換)
//       + getDefaultNormalClassConfig_  (F13 用デフォルト値)
//       + migrateNormalClassConfig_     (F13 旧→新変換・デフォルト値で置き換え)
//       + LECTURE_GRADE_KEYS_ALL / LECTURE_CHU3_ONLY_TYPES_ 定数
//
// F8/F13 とも GAS 側で Admin 判定を行っていないため、Workers 版でも
// Admin 判定なしで動作する（マイグレ書込は暗黙の自己修復として任意の
// 認証ユーザーが発火可能・初回起動時のみ実行）。
//
// 以降のサブセッションで追加予定：
//   5-E-9b-3:      F4/F9/F10/F14/F16/F17（PRICING シンク群）
//
// grades.js（5-E-9b-1）で確立した「低レベル KV ラッパー + denyIfNotAdmin_ +
// KV キー定数」の構造を features.js でも再現する。Admin メッセージは
// features.js 側が一貫して `'Admin のみアクセス可能'` なので 1 系統のみ。

import { isAdminUser } from './auth.js';

const PROP_PREFIX = 'prop:';

// ─── KV キー名（GAS code.js の PROP_KEYS / CONFIG_PROP_KEYS と一致） ───
const KEY_AI_KNOWLEDGE_BASE      = 'AI_KNOWLEDGE_BASE';
const KEY_LECTURE_GREETINGS      = 'LECTURE_GREETINGS_CONFIG';
const KEY_LECTURE_PERIODS        = 'LECTURE_PERIODS_CONFIG';
const KEY_HOLIDAY_CACHE          = 'HOLIDAY_CACHE';
const KEY_BASIC_TEST_DATES       = 'BASIC_TEST_DATES';
const KEY_PUB_HIGH_EXAM_DATES    = 'PUBLIC_HIGH_EXAM_DATES';
const KEY_CLOSED_DAYS_OVERRIDES  = 'CLOSED_DAYS_OVERRIDES';
const KEY_LECTURE_PRICING        = 'LECTURE_PRICING_CONFIG';
const KEY_NORMAL_CLASS           = 'NORMAL_CLASS_CONFIG';
const KEY_NORMAL_CLASS_LEGACY    = 'NORMAL_CLASS_CONFIG_LEGACY';

// 講習料金系の定数（GAS features.js:4103-4110 と一致）
const LECTURE_GRADE_KEYS_ALL   = ['sho', 'chu1', 'chu2', 'chu3', 'ko1', 'ko2', 'ko3'];
const LECTURE_CHU3_ONLY_TYPES_ = ['kiso1', 'kiso2', 'nyushi'];

// 講習タイプ定数（GAS features.js:2482-2492 と一致）
const LEC_TYPE_IDS = ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'];
const LEC_TYPE_NAMES = {
  spring: '春期講習',
  summer: '夏期講習',
  kiso1:  '第1回基礎学力テスト対策講座',
  kiso2:  '第2回基礎学力テスト対策講座',
  winter: '冬期講習',
  nyushi: '入試直前講習'
};

// ─── 低レベル KV ラッパー（grades.js と同パターン） ───
async function readKv_(env, key) {
  return (await env.KV.get(PROP_PREFIX + key)) ?? '';
}
async function writeJson_(env, key, obj) {
  await env.KV.put(PROP_PREFIX + key, JSON.stringify(obj));
}

// ─── Admin 判定ヘルパー（features.js は 1 系統） ───
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─── 公開関数 ───

/**
 * AI ナレッジベース（手動 KB）の全エントリを取得する（F1・Admin 必須）
 * GAS features.js:1872 と同じ。R-例外で読取でも Admin 判定あり。
 */
export async function getAiKnowledgeBase(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const raw = await readKv_(env, KEY_AI_KNOWLEDGE_BASE);
    const entries = raw ? JSON.parse(raw) : [];
    return { success: true, entries };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * AI ナレッジベースのエントリを追加・更新する（F2・Admin のみ）
 * GAS features.js:1892 と同じ。id 指定で既存更新、未指定で新規追加。
 * 新規時 id = `'kb_' + Date.now()`。`updatedAt` は ISO 文字列を常に付与。
 * @param {Array} args [entryJson]
 */
export async function saveAiKnowledgeEntry(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [entryJson] = args || [];
    const entry = JSON.parse(entryJson);
    if (!entry.category || !entry.content) {
      return { success: false, error: 'カテゴリと内容は必須です' };
    }
    const raw = await readKv_(env, KEY_AI_KNOWLEDGE_BASE);
    const entries = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();

    if (entry.id) {
      // 既存 id の update（見つからなければエラー）
      let found = false;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].id === entry.id) {
          entries[i].category  = entry.category;
          entries[i].content   = entry.content;
          entries[i].updatedAt = now;
          found = true;
          break;
        }
      }
      if (!found) {
        return { success: false, error: '指定されたエントリが見つかりません' };
      }
    } else {
      // 新規追加
      entries.push({
        id:        'kb_' + Date.now(),
        category:  entry.category,
        content:   entry.content,
        updatedAt: now
      });
    }

    await writeJson_(env, KEY_AI_KNOWLEDGE_BASE, entries);
    return { success: true, message: entry.id ? '更新しました' : '追加しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * AI ナレッジベースのエントリを削除する（F3・Admin のみ）
 * GAS features.js:1945 と同じ。filter 除去・差分がなければ「見つかりません」。
 * @param {Array} args [entryId]
 */
export async function deleteAiKnowledgeEntry(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [entryId] = args || [];
    const raw = await readKv_(env, KEY_AI_KNOWLEDGE_BASE);
    const entries = raw ? JSON.parse(raw) : [];
    const newEntries = entries.filter((e) => e.id !== entryId);
    if (newEntries.length === entries.length) {
      return { success: false, error: '指定されたエントリが見つかりません' };
    }
    await writeJson_(env, KEY_AI_KNOWLEDGE_BASE, newEntries);
    return { success: true, message: '削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別学年挨拶文を取得する（F11）
 * GAS features.js:4344 と同じ。純粋 KV 読取・未設定時は空オブジェクト。
 * 戻り値の shape: `{ success, data: { typeId: { gradeKey: "挨拶文", ... } } }`
 */
export async function getLectureGreetings(args, env, user) {
  try {
    const raw = await readKv_(env, KEY_LECTURE_GREETINGS);
    const data = raw ? JSON.parse(raw) : {};
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別学年挨拶文を保存する（F12・Admin のみ）
 * GAS features.js:4361 と同じ。JSON パース + 型チェック + setProperty のみ。
 * @param {Array} args [dataJson]
 */
export async function saveLectureGreetings(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [dataJson] = args || [];
    const data = JSON.parse(dataJson);
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'データ形式が不正です' };
    }
    await writeJson_(env, KEY_LECTURE_GREETINGS, data);
    return { success: true, message: '挨拶文を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 講習期間（F5/F6/F7）とその日付計算ヘルパー群
// ═══════════════════════════════════════════════════════════════════════════

// 実行内メモリキャッシュ（同一リクエスト内で HOLIDAY_CACHE を再読しない）
let holidayCacheLec_ = null;

// ─── 日付ユーティリティ（GAS features.js 2550-2633 の再実装） ───
function addDaysLec_(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
function formatDateStrLec_(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function getNthWeekdayOfMonth_(year, month, n, dayOfWeek) {
  const date = new Date(year, month - 1, 1);
  const diff = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(1 + diff + (n - 1) * 7);
  return date;
}

// GAS isHolidayLec_ 相当。HOLIDAY_CACHE を 1 リクエスト内で 1 回だけ読む。
async function isHolidayLec_(env, dateStr) {
  try {
    if (holidayCacheLec_ === null) {
      const raw = await readKv_(env, KEY_HOLIDAY_CACHE);
      holidayCacheLec_ = raw ? JSON.parse(raw) : {};
    }
    return !!holidayCacheLec_[dateStr];
  } catch (e) { return false; }
}
async function isWeekendOrHolidayLec_(env, date) {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  return await isHolidayLec_(env, formatDateStrLec_(date));
}
async function getNextWeekdayLec_(env, date) {
  const d = new Date(date.getTime());
  while (await isWeekendOrHolidayLec_(env, d)) { d.setDate(d.getDate() + 1); }
  return d;
}
function getFirstWedOnOrAfterLec_(date) {
  const d = new Date(date.getTime());
  while (d.getDay() !== 3) { d.setDate(d.getDate() + 1); }
  return d;
}

// GAS computeBasicTestDateLec_ 相当。BASIC_TEST_DATES 上書き設定を優先。
async function computeBasicTestDateLec_(env, fiscalYear, testNum) {
  const key = fiscalYear + '-' + testNum;
  try {
    const raw = await readKv_(env, KEY_BASIC_TEST_DATES);
    if (raw) {
      const ov = JSON.parse(raw);
      if (ov[key]) {
        const p = ov[key].split('/');
        return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      }
    }
  } catch (e) {}
  if (testNum === 1) return getFirstWedOnOrAfterLec_(new Date(fiscalYear, 8, 30));
  if (testNum === 2) return getFirstWedOnOrAfterLec_(new Date(fiscalYear, 10, 11));
  const jan8 = new Date(fiscalYear + 1, 0, 8);
  const firstWeekday = await getNextWeekdayLec_(env, new Date(fiscalYear + 1, 0, 9));
  if (await isWeekendOrHolidayLec_(env, jan8)) {
    return await getNextWeekdayLec_(env, addDaysLec_(firstWeekday, 1));
  }
  return firstWeekday;
}

// GAS getPublicHighSchoolExamDateLec_ 相当。PUBLIC_HIGH_EXAM_DATES 上書き優先。
async function getPublicHighSchoolExamDateLec_(env, fiscalYear) {
  try {
    const raw = await readKv_(env, KEY_PUB_HIGH_EXAM_DATES);
    if (raw) {
      const ov = JSON.parse(raw);
      const key = String(fiscalYear);
      if (ov[key]) {
        const p = ov[key].split('/');
        return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      }
    }
  } catch (e) {}
  let firstTue = getNthWeekdayOfMonth_(fiscalYear + 1, 3, 1, 2);
  if (firstTue.getDate() <= 2) firstTue = addDaysLec_(firstTue, 7);
  return firstTue;
}

// GAS line.js:938 computeClosedDaysForMonth_ 相当（休校日マップ生成）
async function computeClosedDaysForMonth_(env, year, month) {
  const fiscalYear = (month >= 4) ? year : year - 1;
  const y = fiscalYear;
  const n = fiscalYear + 1;
  const c = {};
  const add = (yr, mo, da) => {
    const mm = String(mo).padStart(2, '0');
    const dd = String(da).padStart(2, '0');
    c[`${yr}-${mm}-${dd}`] = true;
  };
  // GW / お盆 / 秋季 / 年末年始 / 春季（GAS 現行と同じ日程）
  add(y,4,30); add(y,5,1); add(y,5,2); add(y,5,3); add(y,5,4); add(y,5,5);
  if (new Date(y,4,7).getDay() === 0) add(y,5,6); else add(y,4,29);
  add(y,8,10); add(y,8,11); add(y,8,12); add(y,8,13); add(y,8,14); add(y,8,15);
  if (new Date(y,7,17).getDay() === 0) add(y,8,16); else add(y,8,9);
  add(y,10,28); add(y,10,29); add(y,10,30); add(y,10,31); add(y,11,1); add(y,11,2);
  add(y,12,29); add(y,12,30); add(y,12,31);
  add(n,1,1); add(n,1,2); add(n,1,3);
  add(n,3,15); add(n,3,16); add(n,3,17);
  const isLeapN = (n % 4 === 0 && (n % 100 !== 0 || n % 400 === 0));
  if (isLeapN) add(n,3,14);
  try {
    const raw = await readKv_(env, KEY_CLOSED_DAYS_OVERRIDES);
    if (raw) {
      const ov = JSON.parse(raw);
      (ov.add || []).forEach((d) => { c[d] = true; });
      (ov.del || []).forEach((d) => { delete c[d]; });
    }
  } catch (e) {}
  return c;
}

// GAS countBackSchoolDays_ 相当（endDate の前日から遡って日曜以外の休校日を除いて count 日）
async function countBackSchoolDays_(env, endDate, count) {
  let current = addDaysLec_(endDate, -1);
  const closedDays = await computeClosedDaysForMonth_(env, endDate.getFullYear(), endDate.getMonth() + 1);
  let counted = 0;
  for (let i = 0; i < 365; i++) {
    const mo = current.getMonth() + 1, da = current.getDate();
    const mm = String(mo).padStart(2, '0');
    const dd = String(da).padStart(2, '0');
    const key = `${current.getFullYear()}-${mm}-${dd}`;
    if (!closedDays[key] || current.getDay() === 0) {
      counted++;
      if (counted >= count) break;
    }
    current = addDaysLec_(current, -1);
  }
  return current;
}

// GAS computeDefaultLectureDates_ 相当（6 種ごとの開始/終了日計算）
async function computeDefaultLectureDates_(env, typeId, fiscalYear) {
  const fy = fiscalYear;
  let s, e;
  if (typeId === 'spring') {
    s = getNthWeekdayOfMonth_(fy, 3, 1, 6);
    e = getNthWeekdayOfMonth_(fy, 4, 2, 6);
  } else if (typeId === 'summer') {
    s = getNthWeekdayOfMonth_(fy, 7, 3, 6);
    const aug31 = new Date(fy, 7, 31);
    e = (aug31.getDay() === 5) ? new Date(fy, 8, 1) : aug31;
  } else if (typeId === 'kiso1') {
    e = addDaysLec_(await computeBasicTestDateLec_(env, fy, 1), -1);
    s = addDaysLec_(e, -28);
  } else if (typeId === 'kiso2') {
    e = addDaysLec_(await computeBasicTestDateLec_(env, fy, 2), -1);
    s = await countBackSchoolDays_(env, e, 28);
  } else if (typeId === 'winter') {
    s = getNthWeekdayOfMonth_(fy, 12, 1, 6);
    e = addDaysLec_(await computeBasicTestDateLec_(env, fy, 3), -1);
  } else if (typeId === 'nyushi') {
    const examDay = await getPublicHighSchoolExamDateLec_(env, fy);
    e = addDaysLec_(examDay, -1);
    s = addDaysLec_(e, -41);
  } else {
    throw new Error('未知の講習タイプ: ' + typeId);
  }
  return { startDate: formatDateStrLec_(s), endDate: formatDateStrLec_(e) };
}

// GAS features.js:2501 getDefaultGradeSettings_ 相当（講習タイプ別の学年デフォルト）
function getDefaultGradeSettings_(lectureName) {
  const spring     = lectureName.indexOf('春期') !== -1;
  const isKiso     = lectureName.indexOf('基礎学力テスト対策') !== -1;
  const isNyushi   = lectureName.indexOf('入試直前') !== -1;
  const multiCount = lectureName.indexOf('夏期') !== -1 || lectureName.indexOf('冬期') !== -1;
  if (isKiso || isNyushi) {
    const z = { duration: 0, count: 0 };
    return { '小': z, '中1': z, '中2': z, '中3': { duration: 8, count: isNyushi ? 6 : 4 }, '高1': z, '高2': z, '高3': z };
  }
  if (spring) {
    return {
      '小':    { duration: 5,  count: 4 },
      '新中1': { duration: 5,  count: 2 },
      '新中2': { duration: 8,  count: 4 },
      '新中3': { duration: 8,  count: 4 },
      '新高1': { duration: 9,  count: 4 },
      '新高2': { duration: 9,  count: 4 },
      '新高3': { duration: 12, count: 4 }
    };
  }
  return {
    '小':  { duration: 5,  count: 4 },
    '中1': { duration: 8,  count: 4 },
    '中2': { duration: 8,  count: 4 },
    '中3': { duration: 8,  count: multiCount ? 6 : 4 },
    '高1': { duration: 9,  count: 4 },
    '高2': { duration: 9,  count: 4 },
    '高3': { duration: 12, count: 4 }
  };
}

// JST 壁時計時刻を { year, month } で返す（タイムゾーン差吸収）
function getJstNow_() {
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: nowJst.getUTCFullYear(), month: nowJst.getUTCMonth() + 1 };
}

/**
 * 登録済みの講習期間一覧を取得する（F5 の Workers 版）
 * GAS features.js:2762 と同じ。現年度・翌年度×6 種を自動計算し、保存済みと合成。
 */
export async function getLecturePeriods(args, env, user) {
  try {
    holidayCacheLec_ = null; // 各呼出で最新の HOLIDAY_CACHE を反映
    const raw = await readKv_(env, KEY_LECTURE_PERIODS);
    const stored = raw ? JSON.parse(raw) : [];
    const storedMap = {};
    stored.forEach((lp) => { storedMap[lp.id] = lp; });

    // 現在 JST 基準で年度を決定
    const { year, month } = getJstNow_();
    const currentFy = (month >= 4) ? year : year - 1;
    const fys = [currentFy, currentFy + 1];
    const result = [];

    for (const fy of fys) {
      for (const typeId of LEC_TYPE_IDS) {
        const id = fy + '-' + typeId;
        if (storedMap[id]) {
          const entry = storedMap[id];
          entry._isOverridden = true;
          result.push(entry);
        } else {
          try {
            const dates = await computeDefaultLectureDates_(env, typeId, fy);
            result.push({
              id, name: LEC_TYPE_NAMES[typeId],
              startDate: dates.startDate, endDate: dates.endDate,
              gradeSettings: getDefaultGradeSettings_(LEC_TYPE_NAMES[typeId]),
              _isOverridden: false
            });
          } catch (e) { /* 計算失敗はスキップ（GAS と同じ） */ }
        }
      }
    }

    // 旧フォーマット ID（lp_xxx 形式）の後方互換エントリを追加
    const standardNames = {};
    LEC_TYPE_IDS.forEach((t) => { standardNames[LEC_TYPE_NAMES[t]] = true; });
    stored.forEach((lp) => {
      const isNew = LEC_TYPE_IDS.some((t) => /^\d{4}-/.test(lp.id) && lp.id.endsWith('-' + t));
      if (!isNew && !standardNames[lp.name]) result.push(lp);
    });

    result.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    return result;
  } catch (error) {
    return [];
  }
}

/**
 * 指定年度・種別の講習日程を保存する（F6 の Workers 版・Admin のみ）
 * GAS features.js:2825 と同じ。id=`${fy}-${typeId}` で upsert。
 * 新規時は gradeSettings に getDefaultGradeSettings_ の値を埋める。
 */
export async function saveLectureDates(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [fiscalYear, typeId, startDate, endDate] = args || [];
    if (!LEC_TYPE_NAMES[typeId]) {
      return { success: false, error: '無効な講習種別です' };
    }
    const id = fiscalYear + '-' + typeId;
    const raw = await readKv_(env, KEY_LECTURE_PERIODS);
    const data = raw ? JSON.parse(raw) : [];
    let found = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i].id === id) {
        data[i].startDate = startDate;
        data[i].endDate   = endDate;
        found = true;
        break;
      }
    }
    if (!found) {
      data.push({
        id, name: LEC_TYPE_NAMES[typeId],
        startDate, endDate,
        gradeSettings: getDefaultGradeSettings_(LEC_TYPE_NAMES[typeId])
      });
    }
    await writeJson_(env, KEY_LECTURE_PERIODS, data);
    return { success: true, message: '日程を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定年度・種別の講習日程をリセットして自動計算に戻す（F7・Admin のみ）
 * GAS features.js:2855 と同じ。gradeSettings が保存済みなら日程だけ再計算、
 * そうでなければエントリ自体を削除。
 */
export async function resetLectureDates(args, env, user) {
  try {
    holidayCacheLec_ = null;
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [fiscalYear, typeId] = args || [];
    const id = fiscalYear + '-' + typeId;
    const raw = await readKv_(env, KEY_LECTURE_PERIODS);
    const data = raw ? JSON.parse(raw) : [];
    let idx = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i].id === id) { idx = i; break; }
    }
    if (idx === -1) {
      return { success: true, message: 'すでにデフォルト設定です' };
    }
    const gs = data[idx].gradeSettings;
    const hasCustomGrades = gs && Object.keys(gs).length > 0;
    if (hasCustomGrades) {
      const dates = await computeDefaultLectureDates_(env, typeId, parseInt(fiscalYear));
      data[idx].startDate = dates.startDate;
      data[idx].endDate   = dates.endDate;
    } else {
      data.splice(idx, 1);
    }
    await writeJson_(env, KEY_LECTURE_PERIODS, data);
    return { success: true, message: 'デフォルト日程に戻しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 講習料金（F8）・通常授業設定（F13/F15）とそのマイグレヘルパー
// ═══════════════════════════════════════════════════════════════════════════

// GAS features.js:4120 getDefaultLecturePricing_ 相当
function getDefaultLecturePricing_() {
  const result = {};
  const KO2_ROWS = [
    { label: '高2 1回', count: 1, internal: 2875 },
    { label: '高2 2回', count: 2, internal: 5740 },
    { label: '高2 3回', count: 3, internal: 8625 },
    { label: '高2 4回', count: 4, internal: 11500 },
    { label: '高2 2科目×4回セット', count: 4, internal: 21000 }
  ];
  const KO3_ROWS = [
    { label: '高3 1回', count: 1, internal: 3875 },
    { label: '高3 2回', count: 2, internal: 7750 },
    { label: '高3 3回', count: 3, internal: 11625 },
    { label: '高3 4回', count: 4, internal: 15500 },
    { label: '高3 2科目×4回セット', count: 4, internal: 28000 }
  ];
  const KO1_ROWS = [
    { label: '高1 1回', count: 1, internal: 2875 },
    { label: '高1 2回', count: 2, internal: 5740 },
    { label: '高1 3回', count: 3, internal: 8625 },
    { label: '高1 4回', count: 4, internal: 11500 },
    { label: '高1 2科目×4回セット', count: 4, internal: 21000 }
  ];
  const CHU3_MULTI_ROWS = [
    { label: '中3 2教科', count: 2, internal: 23000 },
    { label: '中3 3教科', count: 3, internal: 33000 },
    { label: '中3 4教科', count: 4, internal: 42000 },
    { label: '中3 5教科', count: 5, internal: 50000 }
  ];
  ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach((typeId) => {
    const isChuu3Only = LECTURE_CHU3_ONLY_TYPES_.indexOf(typeId) !== -1;
    const gradeKeys = isChuu3Only ? ['chu3'] : LECTURE_GRADE_KEYS_ALL;
    const rows = gradeKeys.map((gk) => {
      const dur = (gk === 'sho') ? 5 : (['ko1', 'ko2', 'ko3'].indexOf(gk) !== -1) ? 9 : 8;
      return { type: 'standard', gradeKey: gk, duration: dur, count: 2, internal: 0, external: 0 };
    });
    if (!isChuu3Only) {
      ['ko1', 'ko2', 'ko3'].forEach((gk) => {
        rows.push({ type: 'shozui', gradeKey: gk, duration: 9, count: 2, internal: 0, external: 0 });
      });
    }
    if (['spring', 'summer', 'winter'].indexOf(typeId) !== -1) {
      KO2_ROWS.forEach((t) => { rows.push({ type: 'custom', label: t.label, duration: 9, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
      KO3_ROWS.forEach((t) => { rows.push({ type: 'custom', label: t.label, duration: 9, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
    }
    if (['summer', 'winter'].indexOf(typeId) !== -1) {
      KO1_ROWS.forEach((t) => { rows.push({ type: 'custom', label: t.label, duration: 9, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
    }
    if (['summer', 'winter', 'nyushi'].indexOf(typeId) !== -1) {
      CHU3_MULTI_ROWS.forEach((t) => { rows.push({ type: 'custom', label: t.label, duration: 8, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
    }
    result[typeId] = { rows };
  });
  return result;
}

// GAS features.js:4187 migrateLecturePricingData_ 相当
function migrateLecturePricingData_(oldData) {
  const newData = getDefaultLecturePricing_();
  const labelMap = [
    { pattern: '小学生',       gradeKeys: ['sho'] },
    { pattern: '中学1・2年生', gradeKeys: ['chu1', 'chu2'] },
    { pattern: '中学1・2年',   gradeKeys: ['chu1', 'chu2'] },
    { pattern: '中1・2年生',   gradeKeys: ['chu1', 'chu2'] },
    { pattern: '中学3年生',    gradeKeys: ['chu3'] },
    { pattern: '中学3年',      gradeKeys: ['chu3'] },
    { pattern: '中3',          gradeKeys: ['chu3'] },
    { pattern: '高校生',       gradeKeys: ['ko1', 'ko2', 'ko3'] }
  ];
  ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach((typeId) => {
    const oldRows = oldData[typeId];
    if (!Array.isArray(oldRows)) return;
    oldRows.forEach((oldRow) => {
      const label = String(oldRow.label || '');
      let matchedKeys = null;
      for (let i = 0; i < labelMap.length; i++) {
        if (label.indexOf(labelMap[i].pattern) !== -1) {
          matchedKeys = labelMap[i].gradeKeys;
          break;
        }
      }
      if (!matchedKeys) return;
      matchedKeys.forEach((gk) => {
        const row = newData[typeId].rows.find((r) => r.type === 'standard' && r.gradeKey === gk);
        if (row) {
          row.internal = oldRow.internal || 0;
          row.external = oldRow.external || 0;
        }
      });
    });
  });
  return newData;
}

// GAS features.js:4506 getDefaultNormalClassConfig_ 相当
function getDefaultNormalClassConfig_() {
  return {
    version: 2,
    sections: [
      {
        id: 'regular', name: '個別指導料金',
        campusScope: 'all', campusCodes: [],
        headers: ['学年', 'コース', '1科目', 'テキスト代'],
        rows: [
          ['小学生', '算・国・英', '6,000 (6,600)', '1,750 (1,925)'],
          ['', '英・数・国(3人)', '11,000 (12,100)', '1,750 (1,925)'],
          ['', '英・数・国(6人)', '9,500 (10,450)', '1,750 (1,925)'],
          ['中学生', '理', '8,000 (8,800)', '1,750 (1,925)'],
          ['', '社', '8,000 (8,800)', '2,250 (2,475)'],
          ['', '英単語テスト', '1,000 (1,100)', '1,000 (1,100)'],
          ['', '基礎数学', '3,500 (3,850)', ''],
          ['高校生', '1年・2年', '13,500 (14,850)', '毎月1,000 (1,100)'],
          ['', '3年', '14,500 (15,950)', '毎月1,000 (1,100)']
        ],
        notes: [
          '※割引',
          '小学生…3科目受講で、2,000 (2,200) 円割引',
          '中学生…3人クラス3科目受講で、2,000 (2,200)円割引',
          '3人クラス2科目・6人クラス1科目受講で、1,500 (1,650) 円割引',
          '3人クラス1科目・6人クラス2科目受講で、1,000 (1,100) 円割引',
          '高校生…3科目受講で、2,000 (2,200) 円割引',
          '4科目受講で、4,000 (4,400) 円割引',
          '5科目受講で、6,000 (6,600) 円割引'
        ]
      },
      {
        id: 'shozui', name: '※勝瑞校',
        campusScope: 'specific', campusCodes: ['08'],
        headers: ['学年', '科目', '月額', '教材費'],
        rows: [
          ['高1', '英語', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '数学', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '5,000 (5,500)', '毎月1,000 (1,100)'],
          ['高2', '英語', '14,000 (15,400)', '毎月1,000 (1,100)'],
          ['', '数学', '15,000 (16,500)', '毎月1,000 (1,100)'],
          ['', '理科(物・化)', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '6,000 (6,600)', '毎月1,000 (1,100)'],
          ['高3', '英語', '16,000 (17,600)', '毎月1,000 (1,100)'],
          ['', '数学', '17,000 (18,700)', '毎月1,000 (1,100)'],
          ['', '理科(物・化)', '14,000 (15,400)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '7,000 (7,700)', '毎月1,000 (1,100)']
        ],
        notes: ['※演習クラスは、授業料に含まれている。別で受講することも可。']
      },
      {
        id: 'individual', name: '完全個別',
        campusScope: 'all', campusCodes: [],
        headers: ['', '1科目', '2科目', '3科目', 'テキスト代'],
        rows: [
          ['小学生', '12,000 (13,200)', '', '', '1,750 (1,925)'],
          ['中学生', '18,000 (19,800)', '', '', '1,750 (1,925)'],
          ['高校生', '24,000 (26,400)', '46,000 (50,600)', '68,000 (74,800)', '毎月 500 (550)']
        ],
        notes: ['※高校生は1科目を週2回受講した場合は2科目として計算すること']
      },
      {
        id: 'enrollment', name: '入塾金・諸経費',
        campusScope: 'all', campusCodes: [],
        headers: ['項目', '対象', '金額', '', ''],
        rows: [
          ['入塾金', '全学年・全クラス', '10,000 (11,000)', '兄弟姉妹割引', ''],
          ['諸経費', '小学生', '2,000 (2,200)', '2人同時通塾', '3,000 (3,300)'],
          ['', '中学生・高校生', '3,000 (3,300)', '3人同時通塾', '6,000 (6,600)'],
          ['', '', '', '※上の子の料金から割引', '']
        ],
        notes: []
      }
    ]
  };
}

// GAS features.js:4595 migrateNormalClassConfig_ 相当（旧データを捨ててデフォルトを返す）
function migrateNormalClassConfig_(_oldRows) {
  return getDefaultNormalClassConfig_();
}

/**
 * 講習別料金設定を取得する（F8 の Workers 版）
 * GAS features.js:4232 と同じ。Admin 判定なし。
 *
 * マイグレ発火条件:
 *   - 設定あり + いずれかの typeId が配列（旧フォーマット）→ 移行 + 書き戻し
 *   - 設定なし → デフォルト値で初期化書込
 * 新フォーマット（`{typeId: {rows: [...]}}`）なら書き込みなしで返す。
 */
export async function getLecturePricingConfig(args, env, user) {
  try {
    const raw = await readKv_(env, KEY_LECTURE_PRICING);
    let data;
    if (raw) {
      const parsed = JSON.parse(raw);
      let needsMigration = false;
      ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach((typeId) => {
        if (Array.isArray(parsed[typeId])) needsMigration = true;
      });
      if (needsMigration) {
        data = migrateLecturePricingData_(parsed);
        await writeJson_(env, KEY_LECTURE_PRICING, data);
      } else {
        data = parsed;
      }
    } else {
      data = getDefaultLecturePricing_();
      await writeJson_(env, KEY_LECTURE_PRICING, data);
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 通常授業の設定データを取得する（F13 の Workers 版）
 * GAS features.js:4608 と同じ。Admin 判定なし。
 *
 * マイグレ書込順序（GAS 現行と一致）:
 *   旧配列検出 → 1) LEGACY キーに **元の raw JSON 文字列をそのまま** 退避
 *               2) `migrateNormalClassConfig_` で新形式に変換
 *               3) 新キーに JSON として書き込み
 * 設定なし → デフォルトで初期化書込（1 キー）
 */
export async function getNormalClassConfig(args, env, user) {
  try {
    const raw = await readKv_(env, KEY_NORMAL_CLASS);
    let data;
    if (raw) {
      data = JSON.parse(raw);
      if (Array.isArray(data)) {
        // 旧形式（配列）→ LEGACY 退避 → 新形式への変換
        // GAS 側は raw JSON 文字列をそのまま LEGACY に書くため、env.KV.put を直接呼ぶ
        await env.KV.put(PROP_PREFIX + KEY_NORMAL_CLASS_LEGACY, raw);
        data = migrateNormalClassConfig_(data);
        await writeJson_(env, KEY_NORMAL_CLASS, data);
      }
    } else {
      data = getDefaultNormalClassConfig_();
      await writeJson_(env, KEY_NORMAL_CLASS, data);
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 通常設定の全セクションを返す（F15 の Workers 版）
 * GAS features.js:4716 と同じ。F13 を呼んで campusCode でフィルタするだけ。
 * `campusCode` が falsy なら全セクション、指定があれば `campusScope === 'all'`
 * か `campusCodes` に含まれるセクションだけを返す。
 * @param {Array} args [campusCode]
 */
export async function getNormalClassSectionsForWeb(args, env, user) {
  try {
    const [campusCode] = args || [];
    const result = await getNormalClassConfig([], env, user);
    if (!result.success) return result;
    let sections = result.data.sections || [];
    if (campusCode) {
      sections = sections.filter((sec) => {
        if (sec.campusScope === 'all') return true;
        return (sec.campusCodes || []).indexOf(String(campusCode)) !== -1;
      });
    }
    return { success: true, data: sections };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
