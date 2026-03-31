/**
 * index.html から抽出した純粋関数（テスト用）
 * これらはindex.htmlに埋め込まれたJavaScript関数のコピーで、
 * Node.js環境でテストできるようにmodule.exportsを付与している。
 */

// index.html のグローバル変数をシミュレート
var googleCalendarHolidays = null;
var preferredCampuses = [];
var basicTestDateOverrides = {};
var basicTestDetailsOverrides = {};

// === getReportDay (index.html:3186) ===
function getReportDay(year, month) {
  var base = { 4:21,5:24,6:23,7:24,8:24,9:13,10:20,11:23,12:21,1:24,2:21,3:13 };
  var day = base[month];
  if (!day) return null;
  var d = new Date(year, month - 1, day);
  if (d.getDay() === 0) day -= 1; // 日曜→前日
  return day;
}

// === getMeetingDay (index.html:3202) ===
function getMeetingDay(year, month) {
  if (month === 8) return null;

  // 4・5・6月: 第2金曜日（1日が金曜なら第3金曜）
  if (month === 4 || month === 5 || month === 6) {
    var firstDay = new Date(year, month - 1, 1).getDay();
    var vbFriday = ((firstDay - 5 + 7) % 7) + 1;
    return 1 - vbFriday + 15;
  }

  // それ以外: 基準日を含む直前の金曜日
  var refDays = { 7:9, 9:7, 10:9, 11:19, 12:10, 1:20, 2:7, 3:14 };
  var refDay = refDays[month];
  var d = new Date(year, month - 1, refDay);
  var dow = d.getDay();
  var daysBack = (dow - 5 + 7) % 7;
  return refDay - daysBack;
}

// === getDebitDays (index.html:3226) ===
function getDebitDays(year, month) {
  var baseDay = (month === 8) ? 8 : (month === 1) ? 18 : 13;
  var d1 = new Date(year, month - 1, baseDay);
  var dow = d1.getDay();
  var debitOff, emailOff;
  if (dow === 3 || dow === 4) { debitOff = 0;  emailOff = -1; }
  else if (dow === 5)         { debitOff = -1; emailOff = -2; }
  else if (dow === 6)         { debitOff = -2; emailOff = -3; }
  else if (dow === 0)         { debitOff = -3; emailOff = -4; }
  else if (dow === 1)         { debitOff = -4; emailOff = -5; }
  else                        { debitOff = 0;  emailOff = -5; }
  return { debit: baseDay + debitOff, email: baseDay + emailOff };
}

// === getClosedDays (index.html:3252) ===
function getClosedDays(fiscalYear) {
  var y = fiscalYear;
  var n = fiscalYear + 1;
  var c = {};
  var add = function(yr, mo, da) {
    var mm = mo < 10 ? '0' + mo : '' + mo;
    var dd = da < 10 ? '0' + da : '' + da;
    c[yr + '-' + mm + '-' + dd] = true;
  };

  // ゴールデンウィーク: 4/30〜5/5 固定
  add(y, 4, 30);
  add(y, 5, 1); add(y, 5, 2); add(y, 5, 3); add(y, 5, 4); add(y, 5, 5);
  if (new Date(y, 4, 7).getDay() === 0) { add(y, 5, 6); } else { add(y, 4, 29); }

  // お盆: 8/10〜8/15 固定
  add(y, 8, 10); add(y, 8, 11); add(y, 8, 12); add(y, 8, 13); add(y, 8, 14); add(y, 8, 15);
  if (new Date(y, 7, 17).getDay() === 0) { add(y, 8, 16); } else { add(y, 8, 9); }

  // 秋季休校: 10/28〜11/2 固定
  add(y, 10, 28); add(y, 10, 29); add(y, 10, 30); add(y, 10, 31);
  add(y, 11, 1); add(y, 11, 2);

  // 年末年始: 12/29〜翌1/3 固定
  add(y, 12, 29); add(y, 12, 30); add(y, 12, 31);
  add(n, 1, 1); add(n, 1, 2); add(n, 1, 3);

  // 春季休校: 翌3/15〜17 固定。翌年がうるう年なら3/14も追加
  add(n, 3, 15); add(n, 3, 16); add(n, 3, 17);
  var isLeapN = (n % 4 === 0 && (n % 100 !== 0 || n % 400 === 0));
  if (isLeapN) add(n, 3, 14);

  return c;
}

// === getJapaneseHolidays (index.html:3294) ===
function getJapaneseHolidays(year) {
  var h = {};
  function fmt(y, m, d) {
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function addH(y, m, d) { h[fmt(y, m, d)] = true; }
  function dowOf(y, m, d) { return new Date(y, m - 1, d).getDay(); }
  function nthMonday(y, m, n) {
    var first = dowOf(y, m, 1);
    var diff = (1 - first + 7) % 7;
    return 1 + diff + (n - 1) * 7;
  }
  function shunbun(y) { return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
  function shubun(y)  { return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }

  // 固定祝日
  addH(year, 1, 1);  addH(year, 2, 11);
  if (year >= 2020) addH(year, 2, 23);
  addH(year, 4, 29); addH(year, 5, 3);  addH(year, 5, 4);  addH(year, 5, 5);
  if (year >= 2016) addH(year, 8, 11);
  addH(year, 11, 3); addH(year, 11, 23);

  // 可変祝日
  addH(year, 1,  nthMonday(year, 1, 2));
  addH(year, 3,  shunbun(year));
  addH(year, 7,  nthMonday(year, 7, 3));
  addH(year, 9,  nthMonday(year, 9, 3));
  addH(year, 9,  shubun(year));
  addH(year, 10, nthMonday(year, 10, 2));

  // 国民の休日
  for (var m = 1; m <= 12; m++) {
    var dInM = new Date(year, m, 0).getDate();
    for (var d = 2; d < dInM; d++) {
      if (h[fmt(year, m, d)]) continue;
      if (dowOf(year, m, d) === 0) continue;
      if (h[fmt(year, m, d - 1)] && h[fmt(year, m, d + 1)]) addH(year, m, d);
    }
  }

  // 振替休日
  var snap = Object.keys(h).sort();
  snap.forEach(function(key) {
    var p = key.split('-');
    var ky = +p[0], km = +p[1], kd = +p[2];
    if (dowOf(ky, km, kd) === 0) {
      var next = new Date(ky, km - 1, kd + 1);
      while (h[fmt(next.getFullYear(), next.getMonth() + 1, next.getDate())]) {
        next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
      }
      addH(next.getFullYear(), next.getMonth() + 1, next.getDate());
    }
  });

  return h;
}

// === isWeekendOrHoliday (index.html:3358) ===
function isWeekendOrHoliday(date) {
  var dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  var y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  var key = y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  if (googleCalendarHolidays !== null) {
    return !!googleCalendarHolidays[key];
  }
  return !!getJapaneseHolidays(y)[key];
}

// === getNextWeekday (index.html:3375) ===
function getNextWeekday(date) {
  var d = new Date(date.getTime());
  while (isWeekendOrHoliday(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// === getFirstWednesdayOnOrAfter (index.html:3388) ===
function getFirstWednesdayOnOrAfter(date) {
  var d = new Date(date.getTime());
  var daysUntilWed = (3 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + daysUntilWed);
  return d;
}

// === getComputedBasicTestDate (index.html:3401) ===
function getComputedBasicTestDate(academicYear, testNum) {
  if (testNum === 1) {
    return getFirstWednesdayOnOrAfter(new Date(academicYear, 8, 30));
  } else if (testNum === 2) {
    return getFirstWednesdayOnOrAfter(new Date(academicYear, 10, 11));
  } else {
    var jan8 = new Date(academicYear + 1, 0, 8);
    var firstWeekday = getNextWeekday(new Date(academicYear + 1, 0, 9));
    if (isWeekendOrHoliday(jan8)) {
      var dayAfterFirst = new Date(firstWeekday.getTime());
      dayAfterFirst.setDate(dayAfterFirst.getDate() + 1);
      return getNextWeekday(dayAfterFirst);
    }
    return firstWeekday;
  }
}

// === getChuu12BasicTestDate (index.html:3427) ===
function getChuu12BasicTestDate(academicYear) {
  var feb1 = new Date(academicYear + 1, 1, 1);
  var firstWed = getFirstWednesdayOnOrAfter(feb1);
  var secondWed = new Date(firstWed.getTime());
  secondWed.setDate(secondWed.getDate() + 7);
  return secondWed;
}

// === buildCampusOptions (index.html:2863) ===
function buildCampusOptions(campuses, placeholder) {
  var pref = preferredCampuses || [];
  var preferred = campuses.filter(function(c) { return pref.indexOf(c.code) !== -1; });
  var others    = campuses.filter(function(c) { return pref.indexOf(c.code) === -1; });
  var sorted    = preferred.concat(others);
  var html = '<option value="">' + (placeholder || '選択してください') + '</option>';
  sorted.forEach(function(c) {
    html += '<option value="' + c.code + '">' + c.name + '</option>';
  });
  return html;
}

// グローバル変数のセッター（テスト用）
function _setGlobal(name, value) {
  if (name === 'googleCalendarHolidays') googleCalendarHolidays = value;
  if (name === 'preferredCampuses') preferredCampuses = value;
  if (name === 'basicTestDateOverrides') basicTestDateOverrides = value;
  if (name === 'basicTestDetailsOverrides') basicTestDetailsOverrides = value;
}

module.exports = {
  getReportDay: getReportDay,
  getMeetingDay: getMeetingDay,
  getDebitDays: getDebitDays,
  getClosedDays: getClosedDays,
  getJapaneseHolidays: getJapaneseHolidays,
  isWeekendOrHoliday: isWeekendOrHoliday,
  getNextWeekday: getNextWeekday,
  getFirstWednesdayOnOrAfter: getFirstWednesdayOnOrAfter,
  getComputedBasicTestDate: getComputedBasicTestDate,
  getChuu12BasicTestDate: getChuu12BasicTestDate,
  buildCampusOptions: buildCampusOptions,
  _setGlobal: _setGlobal
};
