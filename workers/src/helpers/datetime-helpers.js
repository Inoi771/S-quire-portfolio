// JST 安全な日付処理ユーティリティ（Phase 6-B-05 で新規整備）
//
// Workers は UTC native なため、GAS（JST 前提）と同じ挙動を得るには
// tz-aware な Date 操作が必須。本モジュールは `Intl.DateTimeFormat('Asia/Tokyo')`
// および ISO 8601 + `+09:00` を経由することで JST を常に明示化する。
//
// 【禁止事項】
//   - `new Date(y, m-1, d)` の直接使用（ローカル tz = UTC 解釈になる）→ `jstDate()` を使う
//   - `date.getDay() / getMonth() / getDate() / getFullYear()` の直接使用 → `getJst*()` を使う
//   - `date.setDate(date.getDate() + n)` の直接使用 → `addDays()` を使う
//   - `new Date('YYYY-MM-DD')` の直接使用（UTC 解釈になる）→ `toJstDate()` を使う
//
// 【OK なパターン】
//   - ISO 8601 with TZ: `new Date('2026-04-01T00:00:00+09:00')` は tz-aware
//   - `date.getTime()` / `new Date(ms)` は UTC absolute time なので tz 非依存

/**
 * `YYYY-MM-DD` または `YYYY-MM-DDTHH:mm` 文字列を JST として解釈し Date を返す。
 * GAS の `new Date('2026-04-30')` = JST 解釈 を Workers でも再現する。
 *
 * - `YYYY-MM-DD` → `YYYY-MM-DDT00:00:00+09:00` として parse
 * - `YYYY-MM-DDTHH:mm` → `YYYY-MM-DDTHH:mm+09:00` として parse
 * - TZ 付き文字列（`+09:00` / `Z` 等）はそのまま parse（tz-aware）
 *
 * @param {string} dateStr
 * @return {Date} Invalid Date（NaN）になり得る
 */
export function toJstDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const s = String(dateStr);
  const hasTz = /([+-]\d{2}:?\d{2}|Z)$/.test(s);
  if (hasTz) return new Date(s);
  const hasTime = /T\d{2}:\d{2}/.test(s);
  if (hasTime) return new Date(s + '+09:00');
  return new Date(s + 'T00:00:00+09:00');
}

/**
 * year/month/day 数値から JST 基準の Date を生成する。
 * GAS の `new Date(year, month-1, day, hour, minute)` の JST 安全版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @param {number} [hour=0]
 * @param {number} [minute=0]
 * @return {Date}
 */
export function jstDate(year, month, day, hour = 0, minute = 0) {
  // month / day / hour / minute の overflow を JST 空間で正規化するため、
  // 入力が 1-12 や 1-31 の範囲外でも Date コンストラクタに任せる形で
  // ISO 文字列を組み立てる。overflow 正規化が必要な場合は一旦 Date.UTC
  // 経由で絶対時刻を計算し、+9h を引いて JST 壁時計を得る。
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  return new Date(utcMs - 9 * 3600 * 1000);
}

/**
 * 指定 Date を JST タイムゾーンで分解する内部ヘルパー。
 * year / month / day / hour / minute / dayOfWeek（0=日, 6=土）を返す。
 */
function _jstParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short'
  });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Intl.DateTimeFormat の hour は 24 表記で '24' を返すケースあり（深夜 0 時）
  const hourStr = parts.hour === '24' ? '0' : parts.hour;
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(hourStr, 10),
    dayOfWeek: dowMap[parts.weekday]
  };
}

/** JST タイムゾーンでの年（4 桁）を返す */
export function getJstYear(date) { return _jstParts(date).year; }

/** JST タイムゾーンでの月（1-12）を返す */
export function getJstMonth(date) { return _jstParts(date).month; }

/** JST タイムゾーンでの日（1-31）を返す */
export function getJstDay(date) { return _jstParts(date).day; }

/** JST タイムゾーンでの曜日（0=日, 1=月, ..., 6=土）を返す */
export function getJstDayOfWeek(date) { return _jstParts(date).dayOfWeek; }

/** JST タイムゾーンでの時（0-23）を返す */
export function getJstHour(date) { return _jstParts(date).hour; }

/**
 * Date に日数を加算して新しい Date を返す（tz 非依存）。
 * GAS の `d.setDate(d.getDate() + n)` の副作用なし版。
 * UTC 空間で加算するため JST / UTC どちらの壁時計でも同じ壁時計分だけ進む。
 *
 * @param {Date} date
 * @param {number} n 加算日数（負数可）
 * @return {Date} 新しい Date（元の date は変更しない）
 */
export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

/**
 * Date に月数を加算して新しい Date を返す（JST 空間で計算）。
 * 月末日の扱いは `Date.UTC` の overflow ロジックに準じる
 * （例: 1/31 + 1ヶ月 → 3/3、JS Date の標準挙動）。
 *
 * @param {Date} date
 * @param {number} n 加算月数（負数可）
 * @return {Date}
 */
export function addMonths(date, n) {
  const p = _jstParts(date);
  return jstDate(p.year, p.month + n, p.day, p.hour);
}

/**
 * 会計年度（4 月起算）を返す。
 * 4-12 月 → その年、1-3 月 → 前年。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @return {number}
 */
export function getFiscalYear(year, month) {
  return (month >= 4) ? year : year - 1;
}

/**
 * 日本語曜日名（'日'〜'土'）を返す（year/month/day 指定版）。
 * GAS `getDayOfWeekJa_(year, month, day)` の Workers 版。
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day 1-31
 * @return {string}
 */
export function getDayOfWeekJa(year, month, day) {
  const DOW = ['日','月','火','水','木','金','土'];
  return DOW[getJstDayOfWeek(jstDate(year, month, day))];
}

/**
 * Date を `"M月D日(曜)"` 形式に整形する。
 * GAS `formatMdw_(date)` の Workers 版。
 *
 * @param {Date} date
 * @return {string} 例: "4月23日(木)"
 */
export function formatMdw(date) {
  const DOW = ['日','月','火','水','木','金','土'];
  const p = _jstParts(date);
  return `${p.month}月${p.day}日(${DOW[p.dayOfWeek]})`;
}

/**
 * Date を `"YYYY-MM-DD"` 形式に整形する（JST 基準）。
 *
 * @param {Date} date
 * @return {string} 例: "2026-04-23"
 */
export function formatJstDateStr(date) {
  const p = _jstParts(date);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

/**
 * うるう年判定（グレゴリオ暦）。
 *
 * @param {number} year
 * @return {boolean}
 */
export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
