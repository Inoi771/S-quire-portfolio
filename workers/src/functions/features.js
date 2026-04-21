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
// 以降のサブセッションで追加予定：
//   5-E-9b-2b:     F8/F13/F15（マイグレ書込副作用あり 3 件）
//   5-E-9b-3:      F9/F10/F14/F16/F17（PRICING シンク群 5 件）
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
