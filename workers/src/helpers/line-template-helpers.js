// LINE スケジューラ専用のテンプレート展開・日付計算ヘルパー（Phase 6-B-05 で新規整備）
//
// GAS `line.js:900-1520` 付近のヘルパー群を Workers に port する。
// 純関数は同期、KV 読取を伴う関数は async + env パラメータ。
//
// 【対応表】
//   GAS line.js:938  computeClosedDaysForMonth_    → computeClosedDaysForMonth (async)
//   GAS line.js:983  isClosedOrSunday_             → isClosedOrSunday          (pure)
//   GAS line.js:999  findPrevOpenDay_              → findPrevOpenDay           (pure)
//   GAS line.js:1435 findPrevOpenDayDate_          → findPrevOpenDayDate       (async)
//
// 【JST 安全性】
//   GAS 版の `new Date(y, m-1, d)` / `.getDay()` / `.getMonth()` / `.getDate()` /
//   `.getFullYear()` / `.setDate()` は全て datetime-helpers.js 経由に置換済み。
//   素朴な Date 操作は使わない（CLAUDE.md セクション 9 のルール準拠）。

import {
  jstDate,
  getJstYear,
  getJstMonth,
  getJstDay,
  getJstDayOfWeek,
  addDays,
  getFiscalYear,
  isLeapYear,
  toJstDate,
  getDayOfWeekJa,
  formatMdw
} from './datetime-helpers.js';

const PROP_PREFIX = 'prop:';

/**
 * 指定年月の休校日セットを計算して返す。
 * 年度（4 月起算）ベースで GW / お盆 / 秋季 / 年末年始 / 春季（うるう年補正付き）の
 * 固定休校日を算出し、最後に KV `prop:CLOSED_DAYS_OVERRIDES` の add/del リストを適用する。
 *
 * GAS `computeClosedDaysForMonth_(year, month)`（line.js:938）の Workers 版。
 * 戻り値のキー形式は GAS 版と完全互換（`YYYY-MM-DD` → true）。
 *
 * @param {Object} env Cloudflare Workers 環境（KV バインディング必須）
 * @param {number} year  カレンダー年
 * @param {number} month カレンダー月（1-12）
 * @return {Promise<Record<string, boolean>>} 休校日セット（キー: `YYYY-MM-DD`）
 */
export async function computeClosedDaysForMonth(env, year, month) {
  const fiscalYear = getFiscalYear(year, month);
  const y = fiscalYear;
  const n = fiscalYear + 1;
  const c = {};
  const add = (yr, mo, da) => {
    const mm = String(mo).padStart(2, '0');
    const dd = String(da).padStart(2, '0');
    c[`${yr}-${mm}-${dd}`] = true;
  };

  // ゴールデンウィーク: 4/30〜5/5 固定
  add(y, 4, 30); add(y, 5, 1); add(y, 5, 2); add(y, 5, 3); add(y, 5, 4); add(y, 5, 5);
  // GAS: new Date(y, 4, 7).getDay() === 0 → JST 5月7日 が日曜なら 5/6 を追加、そうでなければ 4/29 を追加
  if (getJstDayOfWeek(jstDate(y, 5, 7)) === 0) { add(y, 5, 6); } else { add(y, 4, 29); }

  // お盆: 8/10〜8/15 固定
  add(y, 8, 10); add(y, 8, 11); add(y, 8, 12); add(y, 8, 13); add(y, 8, 14); add(y, 8, 15);
  // GAS: new Date(y, 7, 17).getDay() === 0 → JST 8月17日 が日曜なら 8/16、そうでなければ 8/9
  if (getJstDayOfWeek(jstDate(y, 8, 17)) === 0) { add(y, 8, 16); } else { add(y, 8, 9); }

  // 秋季休校: 10/28〜11/2
  add(y, 10, 28); add(y, 10, 29); add(y, 10, 30); add(y, 10, 31); add(y, 11, 1); add(y, 11, 2);

  // 年末年始: 12/29〜翌 1/3
  add(y, 12, 29); add(y, 12, 30); add(y, 12, 31);
  add(n, 1, 1); add(n, 1, 2); add(n, 1, 3);

  // 春季休校: 翌 3/15〜17（うるう年は 3/14 も）
  add(n, 3, 15); add(n, 3, 16); add(n, 3, 17);
  if (isLeapYear(n)) add(n, 3, 14);

  // CLOSED_DAYS_OVERRIDES を適用
  try {
    const raw = await env.KV.get(PROP_PREFIX + 'CLOSED_DAYS_OVERRIDES');
    if (raw) {
      const ov = JSON.parse(raw);
      (ov.add || []).forEach((d) => { c[d] = true; });
      (ov.del || []).forEach((d) => { delete c[d]; });
    }
  } catch (_) { /* KV エラーは無視して固定休校日のみ返す */ }

  return c;
}

/**
 * 指定日が日曜日または休校日かを判定する（純関数）。
 *
 * GAS `isClosedOrSunday_(year, month, day, closedDays)`（line.js:983）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day   1-31
 * @param {Record<string, boolean>} closedDays `computeClosedDaysForMonth` の戻り値
 * @return {boolean} 日曜または休校日なら true
 */
export function isClosedOrSunday(year, month, day, closedDays) {
  if (getJstDayOfWeek(jstDate(year, month, day)) === 0) return true;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return !!(closedDays && closedDays[`${year}-${mm}-${dd}`]);
}

/**
 * startDay から遡って最初の開校日（日曜・休校日でない日）を返す（月内のみ・純関数）。
 * 月を跨ぐ必要がある場合は `findPrevOpenDayDate` を使う。
 *
 * GAS `findPrevOpenDay_(year, month, startDay, closedDays)`（line.js:999）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} startDay 起算日（この日から遡る）
 * @param {Record<string, boolean>} closedDays
 * @return {number | null} 開校日の日付（1-31）、月内に見つからなければ null
 */
export function findPrevOpenDay(year, month, startDay, closedDays) {
  let d = startDay;
  let maxAttempts = 14;
  while (maxAttempts-- > 0 && d >= 1) {
    if (!isClosedOrSunday(year, month, d, closedDays)) return d;
    d--;
  }
  return null;
}

/**
 * 指定 Date を起算日として、日曜・休校日なら前の開校日まで遡った Date を返す。
 * 月を跨いで遡ることも可能（最大 21 日 = 3 週間分まで）。
 *
 * GAS `findPrevOpenDayDate_(date)`（line.js:1435）の Workers 版。
 * 月が変わるたびに `computeClosedDaysForMonth` を再計算する（GAS 版と同じ挙動）。
 *
 * @param {Object} env Cloudflare Workers 環境
 * @param {Date} date 起算日
 * @return {Promise<Date>} 開校日の Date（元の date は変更しない）
 */
export async function findPrevOpenDayDate(env, date) {
  let d = new Date(date.getTime());
  let maxAttempts = 21;
  while (maxAttempts-- > 0) {
    const y = getJstYear(d);
    const m = getJstMonth(d);
    const day = getJstDay(d);
    const closedDays = await computeClosedDaysForMonth(env, y, m);
    if (!isClosedOrSunday(y, m, day, closedDays)) return d;
    d = addDays(d, -1);
  }
  return d;
}

// ─── イベント日計算（純関数・jstDate 経由で JST 安全化） ──────────────────────

/**
 * 全体ミーティング日を計算する。
 * 4-6 月: 第 2 金曜（月初 1 日の曜日から逆算）/ 7 月: 第 2 火曜（9 日から金曜まで遡る）/
 * 8 月: null（休場）/ 9-3 月: 基準日テーブルから該当金曜日を計算。
 *
 * GAS `getMeetingDay_(year, month)`（line.js:1015）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @return {number | null} ミーティング日（1-31）、8 月または計算不能なら null
 */
export function getMeetingDay(year, month) {
  if (month === 8) return null;
  if (month === 4 || month === 5 || month === 6) {
    const firstDay = getJstDayOfWeek(jstDate(year, month, 1));
    const vbFriday = ((firstDay - 5 + 7) % 7) + 1;
    return 1 - vbFriday + 15;
  }
  const refDays = { 7: 9, 9: 7, 10: 9, 11: 19, 12: 10, 1: 20, 2: 7, 3: 14 };
  const refDay = refDays[month];
  if (!refDay) return null;
  const dow = getJstDayOfWeek(jstDate(year, month, refDay));
  const daysBack = (dow - 5 + 7) % 7;
  return refDay - daysBack;
}

/**
 * 回数報告書の提出日を計算する。
 * 月別基準日テーブルから取得し、日曜なら前日（土曜）に繰り上げる。
 *
 * GAS `getReportDay_(year, month)`（line.js:1037）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @return {number | null} 提出日（1-31）、計算不能なら null
 */
export function getReportDay(year, month) {
  const base = { 4: 21, 5: 24, 6: 23, 7: 24, 8: 24, 9: 13, 10: 20, 11: 23, 12: 21, 1: 24, 2: 21, 3: 13 };
  let day = base[month];
  if (!day) return null;
  if (getJstDayOfWeek(jstDate(year, month, day)) === 0) day -= 1;
  return day;
}

/**
 * 引落データ送信日を計算する。
 * 基準日（8 月=8 / 1 月=18 / その他=13）から曜日に応じて ±N 日調整し、水曜日に揃える。
 *
 * GAS `getDebitDay_(year, month)`（line.js:1052）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @return {number} 引落データ送信日
 */
export function getDebitDay(year, month) {
  const baseDay = (month === 8) ? 8 : (month === 1) ? 18 : 13;
  const dow = getJstDayOfWeek(jstDate(year, month, baseDay));
  let debitOff;
  if (dow === 3 || dow === 4) { debitOff = 0; }      // 水・木: そのまま
  else if (dow === 5) { debitOff = -1; }              // 金: -1 → 木
  else if (dow === 6) { debitOff = -2; }              // 土: -2 → 木
  else if (dow === 0) { debitOff = -3; }              // 日: -3 → 木
  else if (dow === 1) { debitOff = -4; }              // 月: -4 → 木
  else { debitOff = 0; }                              // 火: そのまま
  return baseDay + debitOff;
}

// ─── 送信日計算（純関数・findPrevOpenDay に依存） ────────────────────────────

/**
 * 室長用連絡の送信日を計算する。
 * その月の最終日（月末）から findPrevOpenDay で最後の開校日を求め、その 7 日前を起点に
 * さらに前の開校日に繰り上げる。
 *
 * GAS `computeShimurochoSendDate_(year, month, closedDays)`（line.js:1085）の Workers 版。
 * `new Date(year, month, 0).getDate()` による月末日取得は、JST の次月 0 日を作って
 * getJstDay で取る方式に置換（結果は同値）。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {Record<string, boolean>} closedDays `computeClosedDaysForMonth` の戻り値
 * @return {number | null} 送信日（1-31）、計算不能なら null
 */
export function computeShimurochoSendDate(year, month, closedDays) {
  // GAS: new Date(year, month, 0).getDate() = 当月末日
  // Workers: jstDate(year, month+1, 0) → JST 空間で次月 0 日 = 当月末の JST 壁時計
  const lastDay = getJstDay(jstDate(year, month + 1, 0));
  const lastOpenDay = findPrevOpenDay(year, month, lastDay, closedDays);
  if (!lastOpenDay) return null;
  const targetDay = lastOpenDay - 7;
  if (targetDay < 1) return null;
  return findPrevOpenDay(year, month, targetDay, closedDays);
}

/**
 * 全体ミーティング通知日（ミーティング日の前日・休校日なら繰り上げ）を計算する。
 *
 * GAS `computeMeetingNotifDate_(year, month, closedDays)`（line.js:1101）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {Record<string, boolean>} closedDays
 * @return {{ day: number, meetingDay: number } | null} 通知日とミーティング日、計算不能なら null
 */
export function computeMeetingNotifDate(year, month, closedDays) {
  const meetingDay = getMeetingDay(year, month);
  if (!meetingDay) return null;
  const notifDay = meetingDay - 1;
  if (notifDay < 1) return null;
  const resultDay = findPrevOpenDay(year, month, notifDay, closedDays);
  if (!resultDay) return null;
  return { day: resultDay, meetingDay };
}

/**
 * 回数報告書提出日の通知日（前日・休校日なら繰り上げ）を計算する。
 *
 * GAS `computeReportNotifDate_(year, month, closedDays)`（line.js:1118）の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {Record<string, boolean>} closedDays
 * @return {{ day: number, reportDay: number } | null} 通知日と提出日、計算不能なら null
 */
export function computeReportNotifDate(year, month, closedDays) {
  const reportDay = getReportDay(year, month);
  if (!reportDay) return null;
  const notifDay = reportDay - 1;
  if (notifDay < 1) return null;
  const resultDay = findPrevOpenDay(year, month, notifDay, closedDays);
  if (!resultDay) return null;
  return { day: resultDay, reportDay };
}

// ─── 講習締切計算（async・KV 読取あり） ──────────────────────────────────────

/**
 * 講習開始日から count 日前を計算し、日曜・休校日なら前営業日まで遡った Date を返す。
 * 内部処理: 開始日の前日 → さらに count 日前 → `findPrevOpenDayDate` で開校日に調整。
 *
 * GAS `countBackLecDeadlineDate_(startDate, count)`（line.js:1456）の Workers 版。
 * GAS 版の `d.setDate(d.getDate() - 1)` + `d.setDate(d.getDate() - count)` の 2 段階 mutation は
 * `addDays(startDate, -1)` + `addDays(d, -count)` に置換。
 *
 * @param {Object} env
 * @param {Date} startDate 講習開始日
 * @param {number} count 遡る日数
 * @return {Promise<Date>} 締切日（日曜・休校日を除いた開校日）
 */
export async function countBackLecDeadlineDate(env, startDate, count) {
  let d = addDays(startDate, -1);   // 開始日の前日
  d = addDays(d, -count);            // さらに count 日前
  return findPrevOpenDayDate(env, d);
}

/**
 * 講習期間データから T 日（講習日程締切日）を算出する。
 * 手動上書き（KV `prop:LECTURE_DEADLINE_OVERRIDES`）を優先し、無ければ講習名から
 * 春期/夏期/冬期=42 日前 / その他=28 日前で自動計算する。
 *
 * GAS `computeLectureDeadlineDate_(lp, overrides)`（line.js:1470）の Workers 版。
 * GAS 版の `new Date(parseInt(y), parseInt(m)-1, parseInt(d))` による `YYYY-MM-DD` parse は
 * `toJstDate(str)` に置換（JST 安全）。
 *
 * `overrides` は optional。未指定（undefined）時は KV から自動取得する。
 * 既に取得済みの overrides を渡すことで重複 KV 読取を避けられる。
 *
 * @param {Object} env
 * @param {{ id?: string, name?: string, startDate?: string } | null} lp 講習期間オブジェクト
 * @param {Record<string, string>} [overrides] `{ [lectureId]: 'YYYY-MM-DD' }`（optional）
 * @return {Promise<Date | null>} T 日の Date、計算不能なら null
 */
export async function computeLectureDeadlineDate(env, lp, overrides) {
  if (!lp || !lp.startDate) return null;

  // overrides が渡されていなければ KV から自動取得
  let ov = overrides;
  if (ov === undefined) {
    try {
      const raw = await env.KV.get(PROP_PREFIX + 'LECTURE_DEADLINE_OVERRIDES');
      ov = raw ? JSON.parse(raw) : {};
    } catch (_) {
      ov = {};
    }
  }

  // 手動上書きがあればそれを使用
  if (lp.id && ov && ov[lp.id]) {
    const d = toJstDate(ov[lp.id]);
    if (!isNaN(d.getTime())) return d;
    // override 文字列が不正なら自動計算に fall-through
  }

  // `lp.startDate` を JST 解釈で parse
  const startDate = toJstDate(lp.startDate);
  if (isNaN(startDate.getTime())) return null;

  const name = lp.name || '';
  const daysBack = (name.indexOf('春期') !== -1 ||
                    name.indexOf('夏期') !== -1 ||
                    name.indexOf('冬期') !== -1) ? 42 : 28;
  return countBackLecDeadlineDate(env, startDate, daysBack);
}

// ─── メッセージ定数（純関数） ──────────────────────────────────────────────

/**
 * report 種別の月別特別講習名（提出報告メッセージに併記する）を返す。
 *
 * GAS `getReportExtras_(month)`（line.js:1195）の Workers 版。
 *
 * @param {number} month 1-12
 * @return {string} 特別講習名、該当月なしは空文字
 */
export function getReportExtras(month) {
  const m = {
    4: '春期講習',
    9: '夏期講習',
    10: '第1回基礎学力テスト対策',
    11: '第2回基礎学力テスト対策',
    1: '冬期講習',
    3: '直前講習'
  };
  return m[month] || '';
}

/**
 * shitsucho 種別の月別講習名（室長連絡メッセージに含める）を返す。
 *
 * GAS `getLectureNames_(month)`（line.js:1205）の Workers 版。
 *
 * @param {number} month 1-12
 * @return {string} 講習名、該当月なしは空文字
 */
export function getLectureNames(month) {
  const m = {
    4: '春期講習',
    5: '中間テスト対策',
    6: '期末テスト対策',
    8: '夏期講習',
    9: '第1回基礎学力テスト',
    10: '第2回基礎学力テスト',
    12: '冬期講習',
    1: '直前講習',
    2: '高校準備講座'
  };
  return m[month] || '';
}

// ─── メッセージ生成（純関数） ────────────────────────────────────────────────

/**
 * 全体ミーティング連絡のデフォルトメッセージを生成する。
 * テンプレート未設定時のフォールバック用。
 *
 * GAS `buildMeetingMessage_(year, month, meetingDay)`（line.js:1135）の Workers 版。
 * 出力文字列は GAS 版と完全一致。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} meetingDay ミーティング日
 * @return {string} メッセージ本文
 */
export function buildMeetingMessage(year, month, meetingDay) {
  const dow = getDayOfWeekJa(year, month, meetingDay);
  return `明日${month}月${meetingDay}日(${dow})は14時から北島校で正社員ミーティングがあります。\nよろしくお願いいたします。`;
}

/**
 * 回数報告書提出日連絡のデフォルトメッセージを生成する。
 * `sendMonth` に応じた特別講習名（春期・夏期・基礎学力テスト対策・冬期・直前）を併記する。
 *
 * GAS `buildReportMessage_(year, month, reportDay, sendMonth)`（line.js:1148）の Workers 版。
 * GAS 版は inline で extras マップを定義していたが、Workers 版は既実装の `getReportExtras` を
 * 呼ぶ（内容完全同一・出力文字列は GAS 版と一致）。
 *
 * @param {number} year
 * @param {number} month 通知送信月（reportDay の月）
 * @param {number} reportDay 提出日
 * @param {number} sendMonth 報告対象月（通常 month と同じ）
 * @return {string} メッセージ本文
 */
export function buildReportMessage(year, month, reportDay, sendMonth) {
  const dow = getDayOfWeekJa(year, month, reportDay);
  const extra = getReportExtras(sendMonth);
  let base = `明日${month}月${reportDay}日(${dow})は${sendMonth}月分の回数報告書`;
  if (extra) base += `と${extra}`;
  base += 'の提出日です。\nよろしくお願いいたします。';
  return base;
}

/**
 * 室長用連絡のデフォルトメッセージを生成する。
 * 月別テンプレート分岐:
 *   - 3 月: 新年度の継続申込書締切 + 4 月引落データ送信日
 *   - 7・11 月: 翌月の引落データ送信日のみ
 *   - その他: 翌月の講習名 + 名簿提出締切 + 引落データ送信日
 *
 * GAS `buildShimurochoMessage_(sendYear, sendMonth, sendDay, closedDays)`（line.js:1166）の
 * Workers 版。「翌月」計算（12 月 → 翌年 1 月）・月末日計算・出力文字列は GAS 版と完全一致。
 * GAS 版の `new Date(sendYear, sendMonth, 0).getDate()` による月末日取得は
 * `getJstDay(jstDate(sendYear, sendMonth + 1, 0))` に置換（Group 2 と同方式）。
 * inline `lectureNames` マップは既実装の `getLectureNames` を呼ぶ形に差し替え（内容同一）。
 *
 * @param {number} sendYear 送信年
 * @param {number} sendMonth 送信月 1-12
 * @param {number} sendDay 送信日
 * @param {Record<string, boolean>} closedDays
 * @return {string} メッセージ本文
 */
export function buildShimurochoMessage(sendYear, sendMonth, sendDay, closedDays) {
  const nextMonth = sendMonth === 12 ? 1 : sendMonth + 1;
  const nextYear = sendMonth === 12 ? sendYear + 1 : sendYear;
  const lectureName = getLectureNames(sendMonth);
  const debitDay = getDebitDay(nextYear, nextMonth);
  const debitDow = getDayOfWeekJa(nextYear, nextMonth, debitDay);

  // 締切日 = sendDay + 5、月末を超えない、休校日なら前の開校日
  const lastDay = getJstDay(jstDate(sendYear, sendMonth + 1, 0));
  const rawDeadline = Math.min(sendDay + 5, lastDay);
  const deadlineDay = findPrevOpenDay(sendYear, sendMonth, rawDeadline, closedDays) || rawDeadline;
  const deadlineDow = getDayOfWeekJa(sendYear, sendMonth, deadlineDay);

  if (sendMonth === 3) {
    return `新年度の継続申込書が未提出の場合は、3月${deadlineDay}日(${deadlineDow})までに提出をお願いいたします。\nなお4月の引落データ送信は${debitDay}日(${debitDow})です。`;
  }
  if (sendMonth === 7 || sendMonth === 11) {
    return `${nextMonth}月の引落データ送信は${debitDay}日(${debitDow})です。\nよろしくお願いいたします。`;
  }
  return `${nextMonth}月は${lectureName}の引落があります。\n実施校舎で名簿が未提出の場合は${sendMonth}月${deadlineDay}日(${deadlineDow})までに提出をお願いいたします。\n外部生で振込用紙を郵送する場合は講習申込書の提出も合わせてお願いいたします。\nなお、${nextMonth}月の引落データ送信は${debitDay}日(${debitDow})です。`;
}

/**
 * 講習日程締切（T-7 日当日）通知メッセージを生成する。
 * 「本日」スペース + 日付 + スペース + 「は〜の日程締切日です。」形式。
 *
 * GAS `buildLecDeadline7Message_(lectureName, sendDate)`（line.js:1503）の Workers 版。
 * 出力文字列は GAS 版と完全一致（冒頭「本日」の後の半角スペース、日付前後の半角スペース含む）。
 *
 * @param {string} lectureName 講習名（例: '春期講習'）
 * @param {Date} sendDate 送信日（= T-7 日）
 * @return {string} メッセージ本文
 */
export function buildLecDeadline7Message(lectureName, sendDate) {
  return `本日 ${formatMdw(sendDate)} は${lectureName}の日程締切日です。\nよろしくお願いいたします。`;
}

/**
 * 講習日程締切（T-14 日 = 1 週間前）通知メッセージを生成する。
 * 先頭に「本日」等の prefix は無く、日付 + スペース + 「は〜の理科・社会の日程締切日です。」形式。
 *
 * GAS `buildLecDeadline14Message_(lectureName, t7Date)`（line.js:1513）の Workers 版。
 * 出力文字列は GAS 版と完全一致。
 *
 * @param {string} lectureName 講習名
 * @param {Date} t7Date T-7 日（理科・社会の締切日）
 * @return {string} メッセージ本文
 */
export function buildLecDeadline14Message(lectureName, t7Date) {
  return `${formatMdw(t7Date)} は${lectureName}の理科・社会の日程締切日です。\nよろしくお願いいたします。`;
}

// ─── テンプレート展開 ──────────────────────────────────────────────────────

/**
 * メッセージテンプレート内の `{key}` プレースホルダを実際の値に置換する（純関数）。
 *
 * type 別に有効なプレースホルダが異なる:
 *   - meeting:   `{日付}` `{月}` `{日}` `{曜日}`
 *   - report:    `{日付}` `{月}` `{日}` `{曜日}` `{報告月}` `{講習追記}`
 *   - shitsucho: `{翌月}` `{月}` `{引落日}` `{引落曜日}` `{引落日付}` `{締切日}` `{締切曜日}` `{締切日付}` `{講習名}`
 *
 * 対象 type で key 算出が不能な場合（例: meeting の 8 月で meetingDay=null）は空文字を返す。
 * template 自体が空文字なら空文字を返す。
 *
 * GAS `resolveTemplatePlaceholders_(template, type, year, month, closedDays)`（line.js:1219）の Workers 版。
 * GAS 版の `new Date(y, m-1, d).getDay()` / `new Date(year, month, 0).getDate()` 等は
 * datetime-helpers.js 経由に置換。プレースホルダ名・出力文字列は GAS 版と完全一致。
 *
 * @param {string} template テンプレート文字列（例: "明日{日付}は..."）
 * @param {'meeting' | 'report' | 'shitsucho'} type
 * @param {number} year
 * @param {number} month 1-12
 * @param {Record<string, boolean>} closedDays `computeClosedDaysForMonth` の戻り値
 * @return {string} 解決済みメッセージ（テンプレート空・解決不能時は空文字）
 */
export function resolveTemplatePlaceholders(template, type, year, month, closedDays) {
  if (!template) return '';

  const vars = {};

  if (type === 'meeting') {
    const meetingDay = getMeetingDay(year, month);
    if (!meetingDay) return '';
    const mDow = getDayOfWeekJa(year, month, meetingDay);
    vars['日付'] = `${month}月${meetingDay}日(${mDow})`;
    vars['月'] = String(month);
    vars['日'] = String(meetingDay);
    vars['曜日'] = mDow;
  } else if (type === 'report') {
    const reportDay = getReportDay(year, month);
    if (!reportDay) return '';
    const rDow = getDayOfWeekJa(year, month, reportDay);
    vars['日付'] = `${month}月${reportDay}日(${rDow})`;
    vars['月'] = String(month);
    vars['日'] = String(reportDay);
    vars['曜日'] = rDow;
    vars['報告月'] = String(month);
    const extra = getReportExtras(month);
    vars['講習追記'] = extra ? `と${extra}` : '';
  } else if (type === 'shitsucho') {
    const sDay = computeShimurochoSendDate(year, month, closedDays);
    if (!sDay) return '';
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    vars['翌月'] = String(nextMonth);
    vars['月'] = String(month);
    const debitDay = getDebitDay(nextYear, nextMonth);
    const debitDow = getDayOfWeekJa(nextYear, nextMonth, debitDay);
    vars['引落日'] = String(debitDay);
    vars['引落曜日'] = debitDow;
    vars['引落日付'] = `${debitDay}日(${debitDow})`;
    // 月末日取得（GAS: `new Date(year, month, 0).getDate()` と同値）
    const lastDay = getJstDay(jstDate(year, month + 1, 0));
    const rawDeadline = Math.min(sDay + 5, lastDay);
    const deadlineDay = findPrevOpenDay(year, month, rawDeadline, closedDays) || rawDeadline;
    const deadlineDow = getDayOfWeekJa(year, month, deadlineDay);
    vars['締切日'] = String(deadlineDay);
    vars['締切曜日'] = deadlineDow;
    vars['締切日付'] = `${month}月${deadlineDay}日(${deadlineDow})`;
    vars['講習名'] = getLectureNames(month);
  }

  // プレースホルダ置換
  let result = template;
  for (const key in vars) {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const value = vars[key] !== undefined ? String(vars[key]) : '';
      result = result.split(`{${key}}`).join(value);
    }
  }
  return result;
}

/**
 * KV `prop:LINE_SCHEDULER_SETTINGS` からテンプレート文字列を取得し、
 * `resolveTemplatePlaceholders` でプレースホルダを展開したメッセージを返す。
 *
 * shitsucho 種別は月別テンプレート分岐:
 *   - 3 月:        `messageTemplate_march`
 *   - 7 / 11 月:   `messageTemplate_simple`
 *   - それ以外:    `messageTemplate_default`
 * meeting / report 種別は単一の `messageTemplate` フィールドを使用。
 *
 * テンプレート未設定（空文字）時は空文字を返す（呼出元でデフォルトメッセージに fallback）。
 * KV 読取失敗時も空テンプレートとして扱う（throw しない）。
 *
 * GAS `buildMessageFromTemplate_(type, year, month, closedDays)`（line.js:1284）の Workers 版。
 *
 * @param {Object} env
 * @param {'meeting' | 'report' | 'shitsucho'} type
 * @param {number} year
 * @param {number} month 1-12
 * @param {Record<string, boolean>} closedDays
 * @return {Promise<string>} 解決済みメッセージ（テンプレート未設定なら空文字）
 */
export async function buildMessageFromTemplate(env, type, year, month, closedDays) {
  let settings = {};
  try {
    const raw = await env.KV.get(PROP_PREFIX + 'LINE_SCHEDULER_SETTINGS');
    if (raw) settings = JSON.parse(raw) || {};
  } catch (_) {
    settings = {};
  }
  const typeSettings = settings[type] || {};

  if (type === 'shitsucho') {
    let tmpl;
    if (month === 3) {
      tmpl = typeSettings.messageTemplate_march || '';
    } else if (month === 7 || month === 11) {
      tmpl = typeSettings.messageTemplate_simple || '';
    } else {
      tmpl = typeSettings.messageTemplate_default || '';
    }
    if (!tmpl) return '';
    return resolveTemplatePlaceholders(tmpl, type, year, month, closedDays);
  }

  const template = typeSettings.messageTemplate || '';
  if (!template) return '';
  return resolveTemplatePlaceholders(template, type, year, month, closedDays);
}
