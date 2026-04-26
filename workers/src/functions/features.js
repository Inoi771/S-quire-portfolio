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
// Phase 5-E-9b-3a（本コミット）:
//       F16 syncLecturePricingToTable_ (private・PRICING_TABLE_CONFIG の auto_* 再生成)
//       F17 syncNormalConfigToPricingTable_ (private・_fromNormalConfig 再生成)
//       F14 saveNormalClassConfig      (書込・NORMAL_CLASS_CONFIG + PRICING_TABLE_CONFIG 2 キー)
//       + LECTURE_GRADE_LABELS_ 定数
//       + KEY_PRICING_TABLE 定数
//       + `getCampusConfig_` を grades.js から import（α 方式・docs 参照）
//
// Phase 5-E-9b-3b（本コミット・features.js 全体クローズ）:
//       F4  getPricingConfigForWeb     (読取・v2→v3 マイグレ + mock 除去書込あり)
//       F9  saveLecturePricing         (書込・単一 typeId update + F16 シンク)
//       F10 saveUnifiedLecturePricing  (書込・6 typeId 一括更新 + F16 シンク 1 回)
//       + getDefaultPricingData_       (F4 用デフォルト・約 125 行の静的データ)
//
// これで 5-E-9b-3 / 5-E-9b-2 / 5-E-9b / 5-E-9 全体（features.js 17 件 +
// grades.js 20 件 = 計 40 件）の Workers 化が完了。
//
// grades.js（5-E-9b-1）で確立した「低レベル KV ラッパー + denyIfNotAdmin_ +
// KV キー定数」の構造を features.js でも再現する。Admin メッセージは
// features.js 側が一貫して `'Admin のみアクセス可能'` なので 1 系統のみ。

import { isAdminUser } from './auth.js';
import { getCampusConfig_ } from './grades.js';
import { supabaseSelect, supabaseRpc } from '../supabase.js';
import { firestoreGet, firestoreUpdateFields, firestoreTransaction } from '../firebase.js';
import { fetchGeminiWithRetry, parseGeminiErrorMessage, extractGeminiText } from '../gemini.js';
import {
  getCurrentFiscalYear,
  toJstDate, getJstYear, getJstMonth, getJstDay, getJstDayOfWeek,
  addDays, getFiscalYear
} from '../helpers/datetime-helpers.js';

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
const KEY_PRICING_TABLE          = 'PRICING_TABLE_CONFIG';

// 講習料金系の定数（GAS features.js:4103-4112 と一致）
const LECTURE_GRADE_KEYS_ALL   = ['sho', 'chu1', 'chu2', 'chu3', 'ko1', 'ko2', 'ko3'];
const LECTURE_CHU3_ONLY_TYPES_ = ['kiso1', 'kiso2', 'nyushi'];
const LECTURE_GRADE_LABELS_    = { sho: '小学生', chu1: '中1', chu2: '中2', chu3: '中3', ko1: '高1', ko2: '高2', ko3: '高3' };
// 注: `LECTURE_TYPE_DISPLAY_NAMES_`（GAS 4112）は `LEC_TYPE_NAMES`（2485）と
//     同一内容のため、Workers では `LEC_TYPE_NAMES` を共用する。

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
    const currentFy = getCurrentFiscalYear();
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

// ═══════════════════════════════════════════════════════════════════════════
// PRICING シンク（F14/F16/F17）— 5-E-9b-3a
// ═══════════════════════════════════════════════════════════════════════════
//
// 整合性担保: 書込順序固定（メインキー先 → PRICING_TABLE_CONFIG シンク後）。
// マーカー付きセクション（auto_* / _fromNormalConfig）のみ filter 置換し、
// 他セクションには触れない。PRICING_TABLE_CONFIG 未設定時はシンクスキップ。
// シンク内部の失敗は try/catch で握り潰し、呼出元の成功応答を維持する
// eventually consistent 方式（GAS 現行挙動を踏襲）。

// GAS features.js:4382 syncLecturePricingToTable_ 相当（internal）
async function syncLecturePricingToTable_(env, pricingData) {
  try {
    const tableRaw = await readKv_(env, KEY_PRICING_TABLE);
    if (!tableRaw) return; // PRICING_CONFIG 未設定はスキップ（GAS と一致）
    const tableData = JSON.parse(tableRaw);

    if (!tableData.tabs) tableData.tabs = ['通常授業', '講習'];
    if (tableData.tabs.indexOf('講習') === -1) tableData.tabs.push('講習');

    // auto_* + 旧 seasonal/seasonal_high/mock セクションを除去
    tableData.sections = (tableData.sections || []).filter((s) => {
      return !/^auto_/.test(s.id) && s.id !== 'seasonal' && s.id !== 'seasonal_high' && s.id !== 'mock';
    });

    const typeOrder = ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'];
    const lecCampusConfig = await getCampusConfig_(env);
    const resolveNames = (codes) => (codes || []).map((code) => lecCampusConfig[code] || code);

    typeOrder.forEach((typeId) => {
      const typeData = pricingData[typeId];
      if (!typeData || !Array.isArray(typeData.rows)) return;

      const standardRows  = typeData.rows.filter((r) => r.type === 'standard');
      const shozuiRows    = typeData.rows.filter((r) => r.type === 'shozui');
      const allCustomRows = typeData.rows.filter((r) => r.type === 'custom');
      // 中3追加行と高校生行をラベル文字列で分離（GAS features.js:4412-4413 の注意書きに従う）
      const chu3CustomRows = allCustomRows.filter((r) => (r.label || '').indexOf('中3') !== -1);
      const koCustomRows   = allCustomRows.filter((r) => (r.label || '').indexOf('中3') === -1);
      const typeName = LEC_TYPE_NAMES[typeId] || typeId;
      const sectionScopes = typeData.sectionScopes || {};
      const stdScope = sectionScopes.standard || { campusScope: 'all', campusCodes: [] };
      const shzScope = sectionScopes.shozui   || { campusScope: 'specific', campusCodes: ['08'] };
      const cstScope = sectionScopes.custom   || { campusScope: 'all', campusCodes: [] };

      const rowsToTableRows = (rows) => rows.map((r) => {
        const intTax = Math.floor((r.internal || 0) * 1.1);
        const extTax = Math.floor((r.external || 0) * 1.1);
        const mins = (r.duration || 0) * 10;
        const label = (r.type === 'custom')
          ? (r.label || '')
          : (LECTURE_GRADE_LABELS_[r.gradeKey] || r.gradeKey || '');
        return [label, mins + '分', String(r.count || 0) + '回',
                intTax.toLocaleString() + '円', extTax.toLocaleString() + '円'];
      });

      if (standardRows.length > 0) {
        // 中3標準行直後に中3追加行を挿入（春期は要件上非表示）
        const mergedStandardRows = [];
        standardRows.forEach((r) => {
          mergedStandardRows.push(r);
          if (r.gradeKey === 'chu3' && typeId !== 'spring' && chu3CustomRows.length > 0) {
            chu3CustomRows.forEach((cr) => mergedStandardRows.push(cr));
          }
        });
        tableData.sections.push({
          id: 'auto_' + typeId, tab: '講習', name: typeName,
          headers: ['学年', '1コマ', '回数', '内部生(税込)', '外部生(税込)'],
          rows: rowsToTableRows(mergedStandardRows),
          notes: [], _autoGenerated: true,
          campusScope: stdScope.campusScope,
          campusCodes: stdScope.campusCodes,
          campusResolvedNames: resolveNames(stdScope.campusCodes)
        });
      }
      if (shozuiRows.length > 0) {
        tableData.sections.push({
          id: 'auto_' + typeId + '_shozui', tab: '講習', name: typeName + '(勝瑞校・高校生)',
          headers: ['学年', '1コマ', '回数', '内部生(税込)', '外部生(税込)'],
          rows: rowsToTableRows(shozuiRows),
          notes: [], _autoGenerated: true,
          campusScope: shzScope.campusScope,
          campusCodes: shzScope.campusCodes,
          campusResolvedNames: resolveNames(shzScope.campusCodes)
        });
      }
      if (koCustomRows.length > 0) {
        tableData.sections.push({
          id: 'auto_' + typeId + '_custom', tab: '講習', name: typeName + '(追加)',
          headers: ['学年/コース', '1コマ', '回数', '内部生(税込)', '外部生(税込)'],
          rows: rowsToTableRows(koCustomRows),
          notes: [], _autoGenerated: true,
          campusScope: cstScope.campusScope,
          campusCodes: cstScope.campusCodes,
          campusResolvedNames: resolveNames(cstScope.campusCodes)
        });
      }
    });

    await writeJson_(env, KEY_PRICING_TABLE, tableData);
  } catch (e) { /* eventually consistent: 失敗はログ相当で握り潰す */ }
}

// GAS features.js:4658 syncNormalConfigToPricingTable_ 相当（internal）
async function syncNormalConfigToPricingTable_(env, normalData) {
  try {
    const tableRaw = await readKv_(env, KEY_PRICING_TABLE);
    if (!tableRaw) return; // 未設定時はスキップ
    const tableData = JSON.parse(tableRaw);

    if (!tableData.tabs) tableData.tabs = ['通常授業', '講習'];
    if (tableData.tabs.indexOf('通常授業') === -1) tableData.tabs.unshift('通常授業');

    // _fromNormalConfig + 旧手動通常授業セクションを除去
    const LEGACY_NORMAL_IDS = ['regular', 'shozui', 'individual', 'enrollment'];
    tableData.sections = (tableData.sections || []).filter((s) => {
      if (s._fromNormalConfig) return false;
      if (s.tab === '通常授業' && LEGACY_NORMAL_IDS.indexOf(s.id) !== -1) return false;
      return true;
    });

    const campusConfig = await getCampusConfig_(env);
    const newSections = (normalData.sections || []).map((sec) => {
      const resolvedNames = (sec.campusCodes || []).map((code) => campusConfig[code] || code);
      return {
        id: 'nc_' + sec.id, tab: '通常授業', name: sec.name,
        headers: sec.headers, rows: sec.rows,
        notes: (sec.notes || []),
        _fromNormalConfig: true,
        campusScope: sec.campusScope,
        campusCodes: sec.campusCodes,
        campusResolvedNames: resolvedNames
      };
    });

    // 通常授業セクションを先頭、その他（講習等）を後ろに
    const otherSections = tableData.sections.filter((s) => s.tab !== '通常授業');
    tableData.sections = newSections.concat(otherSections);

    await writeJson_(env, KEY_PRICING_TABLE, tableData);
  } catch (e) { /* eventually consistent: 失敗はログ相当で握り潰す */ }
}

/**
 * 通常授業の設定データを保存する（F14 の Workers 版・Admin のみ）
 * GAS features.js:4637 と同じ。NORMAL_CLASS_CONFIG を書いた後、
 * PRICING_TABLE_CONFIG にシンク（2 キー書込・順序固定）。
 *
 * メインキー書込が失敗した場合は outer catch で return し、sync は呼ばれない。
 * sync が失敗しても eventually consistent（次回保存で復旧）として success を返す。
 *
 * @param {Array} args [jsonData]
 */
export async function saveNormalClassConfig(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [jsonData] = args || [];
    const data = JSON.parse(jsonData);
    if (!data || !Array.isArray(data.sections)) {
      return { success: false, error: 'データの形式が不正です' };
    }
    data.version = 2;
    await writeJson_(env, KEY_NORMAL_CLASS, data);  // メインキー先
    await syncNormalConfigToPricingTable_(env, data); // PRICING シンク後
    return { success: true, message: '通常授業設定を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 料金表（F4/F9/F10）— 5-E-9b-3b
// ═══════════════════════════════════════════════════════════════════════════

// GAS features.js:2302 getDefaultPricingData_ 相当（PRICING_TABLE_CONFIG 初期値）
function getDefaultPricingData_() {
  return {
    version: 3,
    title: '通常授業料金',
    tabs: ['通常授業', '講習'],
    sections: [
      {
        id: 'regular', tab: '通常授業', name: '個別指導料金',
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
        id: 'shozui', tab: '通常授業', name: '※勝瑞校',
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
        id: 'individual', tab: '通常授業', name: '完全個別',
        headers: ['', '1科目', '2科目', '3科目', 'テキスト代'],
        rows: [
          ['小学生', '12,000 (13,200)', '', '', '1,750 (1,925)'],
          ['中学生', '18,000 (19,800)', '', '', '1,750 (1,925)'],
          ['高校生', '24,000 (26,400)', '46,000 (50,600)', '68,000 (74,800)', '毎月 500 (550)']
        ],
        notes: ['※高校生は1科目を週2回受講した場合は2科目として計算すること']
      },
      {
        id: 'enrollment', tab: '通常授業', name: '入塾金・諸経費',
        headers: ['項目', '対象', '金額', '', ''],
        rows: [
          ['入塾金', '全学年・全クラス', '10,000 (11,000)', '兄弟姉妹割引', ''],
          ['諸経費', '小学生', '2,000 (2,200)', '2人同時通塾', '3,000 (3,300)'],
          ['', '中学生・高校生', '3,000 (3,300)', '3人同時通塾', '6,000 (6,600)'],
          ['', '', '', '※上の子の料金から割引', '']
        ],
        notes: []
      },
      {
        id: 'seasonal', tab: '講習', name: '講習料金',
        headers: ['学年', '期間', '内部生', '外部生'],
        rows: [
          ['小学生', '春期・夏期・冬期', '4,000 (4,400)', '5,000 (5,500)'],
          ['中学生(1・2年生)', '春期・夏期・冬期', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '春期', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '第1回基礎学対策', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '第2回基礎学対策', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '夏・冬・直前(6回)', '12,000 (13,200)', '13,500 (14,850)'],
          ['中学生(3年生)', '冬(4回)', '', '9,000 (9,900)'],
          ['', '2科目受講(6回)', '1科目 11,500円で、23,000 (25,300)', ''],
          ['', '3科目受講(6回)', '1科目 11,000円で、33,000 (36,300)', ''],
          ['', '4科目受講(6回)', '1科目 10,500円で、42,000 (46,200)', ''],
          ['', '5科目受講(6回)', '1科目 10,000円で、50,000 (55,000)', ''],
          ['中学生', '定期テスト対策(4回)', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '定期テスト対策(6回)', '12,000 (13,200)', '13,500 (14,850)']
        ],
        notes: [
          '※外部生は割引なし',
          '高1準備講座は 1科目 1,000円(2科目セット税込 2,200円)外部生は無料'
        ]
      },
      {
        id: 'seasonal_high', tab: '講習', name: '高校生 講習料金(回数別)',
        headers: ['学年', '1回', '2回', '3回', '4回', '外部生(1科目)'],
        rows: [
          ['高校生(1・2年生)', '2,625 (2,887)', '5,250 (5,775)', '7,875 (8,662)', '10,500 (11,550)', '12,500 (13,750)'],
          ['春期・夏期・冬期', '3,875 (4,262)', '7,750 (8,525)', '11,625 (12,787)', '15,500 (17,050)', ''],
          ['高校生(3年生)', '1科目受講(4回)', '', '2科目受講(各4回)', '', '外部生(1科目)'],
          ['春期・夏期・冬期', '1科目 15,500 (17,050)', '', '1科目 14,000円で、28,000 (30,800)', '', '16,500 (18,150)']
        ],
        notes: []
      }
    ],
    footerNotes: [
      '※すべての料金において、1円未満の端数は切り捨てること。',
      '例えば、中学1・2年に社会のテキストを1冊だけ渡す場合など。'
    ]
  };
}

/**
 * 料金表データを取得する（F4 の Workers 版・Admin 判定なし）
 * GAS features.js:2435 と同じ。v2 未満→最新デフォルト / v3 未満→tabs 追加 /
 * mock セクション除去 の段階的マイグレ書込を同一リクエスト内で実行。
 *
 * 戻り値には `campusMap: getCampusConfig_()` を付与（GAS 現行 line 2467 と一致）。
 */
export async function getPricingConfigForWeb(args, env, user) {
  try {
    const raw = await readKv_(env, KEY_PRICING_TABLE);
    let data;
    if (raw) {
      data = JSON.parse(raw);
      if (!data.version || data.version < 2) {
        data = getDefaultPricingData_();
        await writeJson_(env, KEY_PRICING_TABLE, data);
      }
      if (data.version < 3) {
        data.version = 3;
        data.tabs = ['通常授業', '講習'];
        const lectureIds = ['seasonal', 'seasonal_high', 'mock'];
        data.sections.forEach((s) => {
          if (!s.tab) {
            s.tab = (lectureIds.indexOf(s.id) >= 0) ? '講習' : '通常授業';
          }
        });
        await writeJson_(env, KEY_PRICING_TABLE, data);
      }
    } else {
      data = getDefaultPricingData_();
      await writeJson_(env, KEY_PRICING_TABLE, data);
    }
    if (data.sections && data.sections.some((s) => s.id === 'mock')) {
      data.sections = data.sections.filter((s) => s.id !== 'mock');
      await writeJson_(env, KEY_PRICING_TABLE, data);
    }
    return { success: true, data, campusMap: await getCampusConfig_(env) };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 単一講習タイプの料金設定を保存する（F9・Admin のみ）
 * GAS features.js:4266 と同じ。旧フォーマット自動移行後に 1 typeId を更新し、
 * PRICING_TABLE_CONFIG にシンク（F16 を 1 回だけ呼ぶ）。
 * @param {Array} args [typeId, lectureDataJson]
 */
export async function saveLecturePricing(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [typeId, lectureDataJson] = args || [];
    if (!typeId) return { success: false, error: 'typeId は必須です' };
    const lectureData = JSON.parse(lectureDataJson);
    if (!lectureData || !Array.isArray(lectureData.rows)) {
      return { success: false, error: '料金データの形式が不正です({rows:[...]}形式が必要)' };
    }
    const raw = await readKv_(env, KEY_LECTURE_PRICING);
    let all = raw ? JSON.parse(raw) : getDefaultLecturePricing_();
    // 旧フォーマット自動移行
    let needsMigration = false;
    ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach((tid) => {
      if (Array.isArray(all[tid])) needsMigration = true;
    });
    if (needsMigration) all = migrateLecturePricingData_(all);

    all[typeId] = lectureData;
    await writeJson_(env, KEY_LECTURE_PRICING, all);
    await syncLecturePricingToTable_(env, all);
    return { success: true, message: typeId + ' の料金を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 全講習タイプの料金設定を一括保存する（F10・Admin のみ）
 * GAS features.js:4305 と同じ。payload.allTypes から 6 typeId を一括で更新し、
 * 最後に F16 シンクを **1 回だけ** 呼ぶ（ループ内で呼ばない）。
 * @param {Array} args [payloadJson]
 */
export async function saveUnifiedLecturePricing(args, env, user) {
  try {
    const denied = await denyIfNotAdmin_(env, user);
    if (denied) return denied;
    const [payloadJson] = args || [];
    const payload = JSON.parse(payloadJson);
    if (!payload || !payload.allTypes) {
      return { success: false, error: 'データ形式が不正です' };
    }
    const raw = await readKv_(env, KEY_LECTURE_PRICING);
    let all = raw ? JSON.parse(raw) : getDefaultLecturePricing_();
    let needsMigration = false;
    ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach((tid) => {
      if (Array.isArray(all[tid])) needsMigration = true;
    });
    if (needsMigration) all = migrateLecturePricingData_(all);

    ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach((typeId) => {
      const typePayload = payload.allTypes[typeId];
      if (typePayload && Array.isArray(typePayload.rows)) {
        all[typeId] = typePayload;
      }
    });

    await writeJson_(env, KEY_LECTURE_PRICING, all);
    await syncLecturePricingToTable_(env, all);
    return { success: true, message: '全講習の料金設定を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-15】getTeacherNamesMap — GAS features.js:3474 の Workers 版
 *
 * Supabase staffs から teacherId → {email, name} マップを返す。アプリ起動時
 * に講習管理タブから呼ばれ、グリッド上の講師名を常に最新の表示名で描画する
 * ために使われる。
 *
 * 認証:
 *   Firebase ID トークン検証のみ（Admin ガードなし）。一般スタッフからも
 *   呼ばれる参照系関数のため。
 *
 * Supabase クエリ:
 *   GET /rest/v1/staffs?select=id,email,display_name,name
 *   フィルタなし（is_deleted 等は付けない・GAS 版と一致）。
 *
 * name の優先順位（厳守）:
 *   display_name → name → ''（逆順禁止）
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, map: { teacherId: { email, name } } }
 *   失敗: { success: false, map: {} }
 *   ※ 失敗時の error フィールドは付けない（GAS 版と一致）
 */
export async function getTeacherNamesMap(args, env, user) {
  try {
    const rows = await supabaseSelect(env, 'staffs', 'select=id,email,display_name,name');
    const map = {};
    (rows || []).forEach((row) => {
      map[row.id] = {
        email: row.email || '',
        name: row.display_name || row.name || ''
      };
    });
    return { success: true, map };
  } catch (error) {
    return { success: false, map: {} };
  }
}

/**
 * 【Phase 6-A-18】getLectureScheduleEntries — GAS features.js:2930 の Workers 版
 *
 * 指定の講習・校舎の Firestore `lectureEntries` ドキュメントからエントリ配列を
 * 取得する。features.js 初の Firestore 利用。
 *
 * 認証: Firebase ID トークン検証のみ（Admin ガードなし・GAS 版踏襲）
 *
 * Firestore doc id 構成: `${lectureId}_${campusCode.padStart(2, '0')}`
 *
 * 戻り値: **生配列**（success ラップなし・GAS 版と完全一致）
 *   doc なし / entries 未定義 / 失敗時はすべて `[]`（空配列）
 *   各エントリの整形:
 *     - `id`: entry.entryId（**entryId → id にリネーム**）
 *     - `durationSlots`: `Number(x) || 9` でデフォルト 9
 *     - `classLabel`: `|| null`（他フィールドは `|| ''`）
 *
 * 呼出元（GAS 経由の現役）: js-lectures.html:3054 の OCR 取込 merge
 * その他の呼出は fb SDK（fbGetLectureScheduleEntries/fbGetAllLectureEntries）で代替済
 */
export async function getLectureScheduleEntries(args, env, user) {
  try {
    const [lectureId, campusCode] = args || [];
    const normalizedCampus = String(campusCode || '').padStart(2, '0');
    const docId = String(lectureId) + '_' + normalizedCampus;
    const doc = await firestoreGet(env, 'lectureEntries', docId);
    if (!doc || !Array.isArray(doc.entries)) return [];
    return doc.entries.map((e) => ({
      id:            e.entryId        || '',
      lectureId:     String(lectureId),
      campusCode:    normalizedCampus,
      date:          e.date          || '',
      startTime:     e.startTime     || '',
      durationSlots: Number(e.durationSlots) || 9,
      subject:       e.subject       || '',
      grade:         e.grade         || '',
      teacherName:   e.teacherName   || '',
      teacherEmail:  e.teacherEmail  || '',
      classLabel:    e.classLabel    || null,
      teacherId:     e.teacherId     || ''
    }));
  } catch (error) {
    return [];
  }
}

/**
 * 【Phase 6-B-02】analyzeFlyerImageMeta — GAS features.js:3666 の Workers 版
 *
 * uploadFlyerImage() 成功後にフロント（js-lectures-flyer.html:691）から
 * fire-and-forget で呼ばれる。Gemini Vision で画像を解析し、
 * Firestore `imageTags/{storageKey}` にファイル名とタグを書込む。
 *
 * GAS 版（features.js:3553-3606 の analyzeUploadedImageMetadata_ と
 * features.js:3666-3689 の analyzeFlyerImageMeta）を 1 関数に統合。
 * Gemini 呼出は workers/src/gemini.js 経由。プロンプト文言・payload・
 * ファイル名サニタイズ・Firestore 書込スキーマは GAS 版と完全一致。
 *
 * 失敗時は silent skip（Firestore 書込もスキップ）。フロントは戻り値を
 * 見ないため { success: true } を返すだけで互換性に問題なし。
 *
 * @param {Array}  args [storageKey, base64, mimeType]
 * @return {{ success: boolean }}
 */
export async function analyzeFlyerImageMeta(args, env, user) {
  try {
    const [storageKey, base64, mimeType] = args || [];
    if (!storageKey || !base64) return { success: true };

    const dotIdx = storageKey.lastIndexOf('.');
    const ext = dotIdx !== -1 ? storageKey.substring(dotIdx) : '';

    let aiFileName = '';
    let aiTags = '';
    try {
      const meta = await analyzeUploadedImageMetadata_(env, base64, mimeType);
      aiFileName = meta.fileName || '';
      aiTags = meta.tags || '';
    } catch (metaErr) {
      console.log('⚠ analyzeFlyerImageMeta: Gemini解析スキップ:', metaErr);
      return { success: true };
    }

    const updateData = { updatedAt: new Date().toISOString() };
    if (aiTags) updateData.tags = aiTags;
    if (aiFileName) updateData.originalName = aiFileName + ext;
    await firestoreUpdateFields(env, 'imageTags', storageKey, updateData);
    console.log(`✅ analyzeFlyerImageMeta: ${storageKey} → ${aiFileName + ext} / ${aiTags}`);
    return { success: true };
  } catch (error) {
    console.error('❌ analyzeFlyerImageMetaエラー:', error);
    return { success: true };
  }
}

/**
 * Gemini Vision で画像を解析し { fileName, tags } を返す内部ヘルパー。
 * GAS features.js:3553-3606 の analyzeUploadedImageMetadata_ と完全互換。
 * API キー未設定時・非 200 応答時は throw（呼出元の catch で silent skip される）。
 */
async function analyzeUploadedImageMetadata_(env, base64, mimeType) {
  const prompt = 'この画像を分析して、保存用のファイル名とタグキーワードを日本語で生成してください。\n\n' +
    '要件:\n' +
    '- fileName: 画像の内容を端的に表す日本語のファイル名（拡張子なし、スペースなし、アンダースコア区切り、20文字以内）\n' +
    '  例: イラスト_走る男子学生、写真_桜と校舎、水彩_勉強する生徒たち\n' +
    '- tags: 画像を検索するのに役立つキーワードを読点（、）区切りで8〜12個\n' +
    '  例: イラスト、男子学生、走る、勢い、躍動感、水彩風、元気、疾走\n\n' +
    'JSON形式のみで返してください（説明文・マークダウン不要）:\n' +
    '{"fileName":"...","tags":"..."}';

  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 200,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };

  const response = await fetchGeminiWithRetry(env, 'gemini-3.1-flash-lite-preview', payload);
  if (response.status !== 200) {
    throw new Error(await parseGeminiErrorMessage(response));
  }

  const result = await response.json();
  const rawText = extractGeminiText(result);

  let metadata = {};
  try {
    metadata = JSON.parse(rawText) || {};
  } catch (_) {
    metadata = {};
  }

  // ファイル名の安全化（Drive で使えない文字を除去）
  const safeName = (metadata.fileName || '').replace(/[\/\\:*?"<>|]/g, '').trim();
  return {
    fileName: safeName || '',
    tags: (metadata.tags || '').trim()
  };
}

/**
 * 【Phase 6-B-03】saveLectureScheduleEntries — GAS features.js:2966 の Workers 版
 *
 * 指定の講習・校舎のスケジュールエントリを一括保存する（`entries` 配列の全置換）。
 * GAS 版は `LockService.getScriptLock()` + 10 秒 waitLock で Read-Modify-Write を
 * 逐次化していたが、Workers 版では `firestoreTransaction`（`:commit` endpoint +
 * read-write transaction）で atomic 保証する。ABORTED/UNAVAILABLE 時は最大 5 回
 * 自動リトライされる。
 *
 * 権限チェック: Admin 以外は他講師の entry を改ざん/削除できない（teacherId で判定）。
 *
 * GAS 版との差分: 完全一致（戻り値・entryId 自動生成・型正規化・書込スキーマ）。
 * GAS 版（features.js:2966-3060）は AI 系 5 関数（Phase 6-B-04 対象）が GAS 内部
 * から直接呼ぶため、Phase 6-B-03 時点では残置必須。
 *
 * @param {Array}  args [lectureId, campusCode, entriesJson]
 * @return {{ success: boolean, message?: string, entries?: Array, error?: string }}
 */
export async function saveLectureScheduleEntries(args, env, user) {
  try {
    const [lectureId, campusCode, entriesJson] = args || [];

    let entries;
    try {
      entries = JSON.parse(entriesJson || '[]');
      if (!Array.isArray(entries)) entries = [];
    } catch (_) {
      entries = [];
    }

    const normalizedCampus = String(campusCode || '').padStart(2, '0');
    const docId = String(lectureId) + '_' + normalizedCampus;

    // Admin 判定と自分の teacherId を先に解決（tx 内は極力短く）
    const isAdmin = await isAdminUser(env, user);
    let myTid = '';
    if (!isAdmin) {
      try {
        const rows = await supabaseRpc(env, 'find_staff_by_auth', {
          p_uid: (user && user.uid) || null,
          p_email: (user && user.email) ? user.email.toLowerCase() : null
        });
        const staff = rows && rows[0];
        myTid = staff ? (staff.teacherId || staff._id || '') : '';
      } catch (_) {
        myTid = '';
      }
    }

    const result = await firestoreTransaction(env, async (tx) => {
      const existingDoc = await tx.get('lectureEntries', docId);
      const existingEntries = (existingDoc && existingDoc.entries) || [];

      // 権限チェック: Admin 以外は他人のエントリを改ざんできない（講師 ID のみで判定）
      if (!isAdmin) {
        const existingOtherEntries = {};
        existingEntries.forEach((e) => {
          const tid = e.teacherId || '';
          if (tid && tid !== myTid) {
            existingOtherEntries[e.entryId || ''] = {
              date: String(e.date || ''), startTime: String(e.startTime || ''),
              durationSlots: String(Number(e.durationSlots) || 9),
              subject: String(e.subject || ''), grade: String(e.grade || ''), teacherId: tid
            };
          }
        });
        const incomingOtherIds = {};
        entries.forEach((e) => {
          const eTid = e.teacherId || '';
          if (eTid && eTid !== myTid) {
            incomingOtherIds[e.id] = {
              date: String(e.date || ''), startTime: String(e.startTime || ''),
              durationSlots: String(Number(e.durationSlots) || 9),
              subject: String(e.subject || ''), grade: String(e.grade || ''), teacherId: eTid
            };
          }
        });
        const otherKeys = Object.keys(existingOtherEntries);
        for (let m = 0; m < otherKeys.length; m++) {
          const eid = otherKeys[m];
          if (!incomingOtherIds[eid]) {
            return { success: false, error: '他のユーザーのエントリは削除できません' };
          }
          const orig = existingOtherEntries[eid];
          const inc = incomingOtherIds[eid];
          if (orig.date !== inc.date || orig.startTime !== inc.startTime ||
              orig.durationSlots !== inc.durationSlots || orig.subject !== inc.subject ||
              orig.grade !== inc.grade) {
            return { success: false, error: '他のユーザーのエントリは変更できません' };
          }
        }
      }

      // エントリ ID を確定して保存データを構築
      const savedEntries = [];
      const newEntries = entries.map((e) => {
        const entryId = e.id || ('ent_' + Date.now() + '_' + Math.floor(Math.random() * 10000));
        const eData = {
          entryId:       entryId,
          date:          String(e.date      || ''),
          startTime:     String(e.startTime || ''),
          durationSlots: Number(e.durationSlots) || 9,
          subject:       String(e.subject   || ''),
          grade:         String(e.grade     || ''),
          teacherName:   String(e.teacherName  || ''),
          teacherEmail:  String(e.teacherEmail || ''),
          classLabel:    e.classLabel || null,
          teacherId:     String(e.teacherId || '')
        };
        savedEntries.push({
          id: entryId, lectureId: String(lectureId), campusCode: normalizedCampus,
          date: eData.date, startTime: eData.startTime, durationSlots: eData.durationSlots,
          subject: eData.subject, grade: eData.grade, teacherName: eData.teacherName,
          teacherEmail: eData.teacherEmail, classLabel: eData.classLabel, teacherId: eData.teacherId
        });
        return eData;
      });

      // 1 ドキュメントに entries 配列として全置換保存
      tx.set('lectureEntries', docId, {
        lectureId:  String(lectureId),
        campusCode: normalizedCampus,
        entries:    newEntries,
        updatedAt:  new Date().toISOString()
      });

      return {
        success: true,
        message: entries.length + '件を保存しました',
        entries: savedEntries
      };
    });

    console.log(`✓ saveLectureScheduleEntries: ${entries.length}件保存 (${lectureId}/${normalizedCampus})`);
    return result;
  } catch (error) {
    console.error('❌ saveLectureScheduleEntriesエラー:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ocrLectureSchedule — GAS features.js:4343-4435 の Workers 版
 * 講習日程の画像/PDF を Gemini OCR で読み取りエントリ配列を返す（保存はしない）。
 * GAS 版との差分: なし（プロンプト・モデル・generationConfig・戻り値形状すべて完全一致）
 * - Gemini モデル: gemini-3.1-flash-lite-preview
 * - safeJsonParse_() は try/catch + デフォルト値で代替（同一挙動）
 * - 保存は呼出元（フロント側で別途 saveLectureScheduleEntries 呼出）
 *
 * args: [base64Image, mimeType, lectureYear, campusCodesJson, campusNamesJson, gradeSettingsJson]
 *
 * 戻り値（GAS 版と完全一致）:
 *   成功: { success: true, entries: [...] }
 *   失敗: { success: false, error: <文言> }
 */
export async function ocrLectureSchedule(args, env, user) {
  try {
    const [base64Image, mimeType, lectureYear, campusCodesJson, campusNamesJson, gradeSettingsJson] = args || [];

    let campusNames = {};
    try { campusNames = JSON.parse(campusNamesJson || '{}') || {}; } catch (_) { campusNames = {}; }
    let gradeSettings = {};
    try { gradeSettings = JSON.parse(gradeSettingsJson || '{}') || {}; } catch (_) { gradeSettings = {}; }

    let gradeDefaultText = '';
    const gsParts = Object.keys(gradeSettings)
      .filter(k => gradeSettings[k] && gradeSettings[k].duration > 0)
      .map(k => k + '=' + (gradeSettings[k].duration * 10) + '分');
    if (gsParts.length > 0) gradeDefaultText = '学年別デフォルト授業時間: ' + gsParts.join(', ') + '。';

    const mediaLabel = mimeType === 'application/pdf'
      ? 'このPDF（複数ページある場合は全ページを確認してください）'
      : 'この画像';

    let campusText = '';
    const campusKeys = Object.keys(campusNames);
    if (campusKeys.length === 1) {
      campusText = '担当者の配属校舎は「' + campusNames[campusKeys[0]] + '」（コード: ' + campusKeys[0] + '）のみです。campusCode はすべて "' + campusKeys[0] + '" としてください。';
    } else if (campusKeys.length > 1) {
      const nameList = campusKeys.map(k => '"' + campusNames[k] + '": "' + k + '"').join(', ');
      campusText = '校舎コード一覧（画像に校舎名がある場合は対応コードを使用してください）: ' + nameList + '。不明な場合は campusCode を null としてください。';
    }

    const prompt = mediaLabel + 'は学習塾の講習日程表です。\n' +
      '授業コマを読み取り、JSON 配列のみで返してください。マークダウンなし。\n\n' +
      '年度: ' + lectureYear + '年（月日のみ記載の場合はこの年で補完）\n' +
      campusText + '\n\n' +
      '【重要】日付の省略記法を正しく展開してください:\n' +
      '- "7/15,30" → 7月15日と7月30日の2エントリ\n' +
      '- "8/1.6" や "8/1・6" → 8月1日と8月6日の2エントリ\n' +
      '- "7/15,30,8/1.6" → 7月15日・7月30日・8月1日・8月6日の4エントリ\n' +
      '- "7/15〜8/5 毎週水" → 期間内の毎週水曜日を個別エントリに展開\n' +
      '省略された日付は前の月を引き継ぐ。各日付を必ず別々のエントリとして出力すること。\n\n' +
      '【操作タイプの判別ルール】\n' +
      '各エントリに "op" フィールドを追加すること:\n' +
      '- "create"（デフォルト）: 注釈なしの通常エントリ → 新規追加\n' +
      '- "edit": 変更を示す記号・文言がある場合\n' +
      '  例: "7/17→18"（日付変更）、"数学→英語"（科目変更）、"10:00→14:00"（時刻変更）、"変更"の文字\n' +
      '  → "op":"edit" とし、変更前の値をメインフィールド(date,startTime等)に、変更後の値を "changes" オブジェクトに入れる\n' +
      '- "delete": 削除を示す記号・文言がある場合\n' +
      '  例: "7/17×"、取り消し線、"削除"の文字、"✕"マーク\n' +
      '  → "op":"delete" とし、削除対象の情報をメインフィールドに入れる\n\n' +
      '講師名・担当者名が記載されている場合は teacherName として抽出する。不明な場合は null とする。\n\n' +
      'createの場合:\n' +
      '{"op":"create","date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":90,"subject":"科目またはnull","grade":"学年（小/中1/中2/中3/高1/高2/高3）またはnull","classLabel":"A/B/Cまたはnull","campusCode":"コードまたはnull","teacherName":"講師名またはnull"}\n' +
      'editの場合（変更前の値 + changesに変更後の値）:\n' +
      '{"op":"edit","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull","changes":{"date":"YYYY-MM-DD"}}\n' +
      'deleteの場合:\n' +
      '{"op":"delete","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull"}\n\n' +
      '読み取れない項目はnullとする。授業時間が不明な場合は' + (gradeDefaultText ? gradeDefaultText + 'この学年別時間をdurationMinutesに使用すること。学年不明の場合は90。' : 'durationMinutes:90とする。') + '"op"が省略された場合は"create"として扱われる。';

    const payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    let response;
    try {
      response = await fetchGeminiWithRetry(env, 'gemini-3.1-flash-lite-preview', payload);
    } catch (e) {
      return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };
    }

    if (!response.ok) {
      const msg = await parseGeminiErrorMessage(response);
      return { success: false, error: msg };
    }

    const json = await response.json();
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    let text = extractGeminiText(json);
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

    let entries;
    try {
      entries = JSON.parse(text);
    } catch (e) {
      return { success: false, error: '日程データを読み取れませんでした' };
    }

    if (!Array.isArray(entries)) {
      return { success: false, error: '日程データを読み取れませんでした' };
    }

    console.log('✓ ocrLectureSchedule: ' + entries.length + '件読み取り (year=' + lectureYear + ')');
    return { success: true, entries };
  } catch (error) {
    console.error('❌ ocrLectureSchedule エラー:', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * parseLectureScheduleFromText — GAS features.js:4446-4529 の Workers 版
 * 貼り付けテキストから講習日程を Gemini で解析しエントリ配列を返す（保存はしない）。
 * GAS 版との差分: なし（プロンプト・モデル・generationConfig・戻り値形状すべて完全一致）
 * - Gemini モデル: gemini-3.1-flash-lite-preview
 * - safeJsonParse_() は try/catch + デフォルト値で代替（同一挙動）
 * - 保存は呼出元（フロント側で別途 saveLectureScheduleEntries 呼出）
 * - ocrLectureSchedule との違い: 入力が base64Image+mimeType ではなくテキスト（5 引数）
 *
 * args: [scheduleText, lectureYear, campusCodesJson, campusNamesJson, gradeSettingsJson]
 *
 * 戻り値（GAS 版と完全一致）:
 *   成功: { success: true, entries: [...] }
 *   失敗: { success: false, error: <文言> }
 */
export async function parseLectureScheduleFromText(args, env, user) {
  try {
    const [scheduleText, lectureYear, campusCodesJson, campusNamesJson, gradeSettingsJson] = args || [];

    if (!scheduleText || !String(scheduleText).trim()) {
      return { success: false, error: 'テキストが空です' };
    }

    let campusNames = {};
    try { campusNames = JSON.parse(campusNamesJson || '{}') || {}; } catch (_) { campusNames = {}; }
    let gradeSettings = {};
    try { gradeSettings = JSON.parse(gradeSettingsJson || '{}') || {}; } catch (_) { gradeSettings = {}; }

    let gradeDefaultText = '';
    const gsParts = Object.keys(gradeSettings)
      .filter(k => gradeSettings[k] && gradeSettings[k].duration > 0)
      .map(k => k + '=' + (gradeSettings[k].duration * 10) + '分');
    if (gsParts.length > 0) gradeDefaultText = '学年別デフォルト授業時間: ' + gsParts.join(', ') + '。';

    let campusText = '';
    const campusKeys = Object.keys(campusNames);
    if (campusKeys.length === 1) {
      campusText = '担当者の配属校舎は「' + campusNames[campusKeys[0]] + '」（コード: ' + campusKeys[0] + '）のみです。campusCode はすべて "' + campusKeys[0] + '" としてください。';
    } else if (campusKeys.length > 1) {
      const nameList = campusKeys.map(k => '"' + campusNames[k] + '": "' + k + '"').join(', ');
      campusText = '校舎コード一覧（テキストに校舎名がある場合は対応コードを使用してください）: ' + nameList + '。不明な場合は campusCode を null としてください。';
    }

    const prompt = '以下は学習塾の講習日程テキストです。\n' +
      '授業コマを読み取り、JSON 配列のみで返してください。マークダウンなし。\n\n' +
      '年度: ' + lectureYear + '年（月日のみ記載の場合はこの年で補完）\n' +
      campusText + '\n\n' +
      '【重要】日付の省略記法を正しく展開してください:\n' +
      '- "7/15,30" → 7月15日と7月30日の2エントリ\n' +
      '- "8/1.6" や "8/1・6" → 8月1日と8月6日の2エントリ\n' +
      '- "7/15,30,8/1.6" → 7月15日・7月30日・8月1日・8月6日の4エントリ\n' +
      '- "7/15〜8/5 毎週水" → 期間内の毎週水曜日を個別エントリに展開\n' +
      '省略された日付は前の月を引き継ぐ。各日付を必ず別々のエントリとして出力すること。\n\n' +
      '【操作タイプの判別ルール】\n' +
      '各エントリに "op" フィールドを追加すること:\n' +
      '- "create"（デフォルト）: 注釈なしの通常エントリ → 新規追加\n' +
      '- "edit": 変更を示す記号・文言がある場合\n' +
      '  例: "7/17→18"（日付変更）、"数学→英語"（科目変更）、"10:00→14:00"（時刻変更）、"変更"の文字\n' +
      '  → "op":"edit" とし、変更前の値をメインフィールド(date,startTime等)に、変更後の値を "changes" オブジェクトに入れる\n' +
      '- "delete": 削除を示す記号・文言がある場合\n' +
      '  例: "7/17×"、取り消し線、"削除"の文字、"✕"マーク\n' +
      '  → "op":"delete" とし、削除対象の情報をメインフィールドに入れる\n\n' +
      '講師名・担当者名が記載されている場合は teacherName として抽出する。不明な場合は null とする。\n\n' +
      'createの場合:\n' +
      '{"op":"create","date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":90,"subject":"科目またはnull","grade":"学年（小/中1/中2/中3/高1/高2/高3）またはnull","classLabel":"A/B/Cまたはnull","campusCode":"コードまたはnull","teacherName":"講師名またはnull"}\n' +
      'editの場合（変更前の値 + changesに変更後の値）:\n' +
      '{"op":"edit","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull","changes":{"date":"YYYY-MM-DD"}}\n' +
      'deleteの場合:\n' +
      '{"op":"delete","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull"}\n\n' +
      '読み取れない項目はnullとする。授業時間が不明な場合は' + (gradeDefaultText ? gradeDefaultText + 'この学年別時間をdurationMinutesに使用すること。学年不明の場合は90。' : 'durationMinutes:90とする。') + '"op"が省略された場合は"create"として扱われる。\n\n' +
      '--- 日程テキスト ---\n' + scheduleText;

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    let response;
    try {
      response = await fetchGeminiWithRetry(env, 'gemini-3.1-flash-lite-preview', payload);
    } catch (e) {
      return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };
    }

    if (!response.ok) {
      const msg = await parseGeminiErrorMessage(response);
      return { success: false, error: msg };
    }

    const json = await response.json();
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    let text = extractGeminiText(json);
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

    let entries;
    try {
      entries = JSON.parse(text);
    } catch (e) {
      return { success: false, error: '日程データを読み取れませんでした' };
    }

    if (!Array.isArray(entries)) {
      return { success: false, error: '日程データを読み取れませんでした' };
    }

    console.log('✓ parseLectureScheduleFromText: ' + entries.length + '件読み取り (year=' + lectureYear + ')');
    return { success: true, entries };
  } catch (error) {
    console.error('❌ parseLectureScheduleFromText エラー:', error);
    return { success: false, error: error.toString() };
  }
}

