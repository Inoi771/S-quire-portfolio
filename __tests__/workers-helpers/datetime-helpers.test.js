// datetime-helpers.js のユニットテスト（Phase 6-B-05 で新規整備）
//
// babel-jest 経由で workers/src/helpers/ の ESM モジュールを CommonJS にトランスパイル
// してから読み込む（jest.config.js の transform 設定で本ファイルと helpers 双方を対象化）。
// 既存テスト（__tests__/code/ / __tests__/frontend/）は transform 対象外のため
// CommonJS のまま影響なし。
//
// テストの主眼は「Workers UTC 実行環境でも GAS 相当の JST 挙動を得られること」の検証。
// 特に JST 境界日（例: JST 00:00 = UTC 前日 15:00）で曜日・日付が正しく返ることを確認。

import * as h from '../../workers/src/helpers/datetime-helpers.js';

describe('datetime-helpers', () => {

  // ─── jstDate + getJstDayOfWeek の組合せ ───

  describe('jstDate + getJstDayOfWeek', () => {
    test('JST 2026-04-01（水曜）を正しく曜日判定する — UTC では 3/31 15:00 になる境界日', () => {
      // 2026-04-01 00:00 JST = 2026-03-31 15:00 UTC
      // 素朴な new Date(2026, 3, 1).getDay() は UTC で読むと前日の曜日になるリスクがあるが、
      // jstDate + getJstDayOfWeek は JST の曜日を返す。
      expect(h.getJstDayOfWeek(h.jstDate(2026, 4, 1))).toBe(3); // 水曜
    });

    test('JST 2026-01-01（木曜）を正しく曜日判定する — 年跨ぎの境界', () => {
      expect(h.getJstDayOfWeek(h.jstDate(2026, 1, 1))).toBe(4); // 木曜
    });

    test('jstDate の month overflow 正規化（月 13 → 翌年 1 月）', () => {
      // month=13 は翌年 1 月として正規化される（Date.UTC の標準挙動）
      const d = h.jstDate(2026, 13, 15);
      expect(h.getJstYear(d)).toBe(2027);
      expect(h.getJstMonth(d)).toBe(1);
      expect(h.getJstDay(d)).toBe(15);
    });

    test('jstDate(y, m, 0) で前月末日を取得できる（computeShimurochoSendDate で使用）', () => {
      // 5 月 0 日 = 4 月末（30 日）
      expect(h.getJstDay(h.jstDate(2026, 5, 0))).toBe(30);
      // 3 月 0 日 = 2 月末（2026 年は非閏年なので 28 日）
      expect(h.getJstDay(h.jstDate(2026, 3, 0))).toBe(28);
      // 3 月 0 日 = 2 月末（2024 年は閏年なので 29 日）
      expect(h.getJstDay(h.jstDate(2024, 3, 0))).toBe(29);
    });
  });

  // ─── getDayOfWeekJa ───

  describe('getDayOfWeekJa', () => {
    test('2026-04-01（水）→ "水"', () => {
      expect(h.getDayOfWeekJa(2026, 4, 1)).toBe('水');
    });

    test('2026-04-05（日）→ "日"', () => {
      expect(h.getDayOfWeekJa(2026, 4, 5)).toBe('日');
    });

    test('2026-04-04（土）→ "土"', () => {
      expect(h.getDayOfWeekJa(2026, 4, 4)).toBe('土');
    });

    test('JST 境界日 2026-04-01 は UTC では 3/31 15:00 だが JST 曜日「水」を返す', () => {
      // 素朴な new Date(2026, 3, 1).getDay() は Workers (UTC) で 2 (火) になる可能性があるが、
      // getDayOfWeekJa は JST の曜日を返すため「水」。
      expect(h.getDayOfWeekJa(2026, 4, 1)).toBe('水');
    });
  });

  // ─── toJstDate ───

  describe('toJstDate', () => {
    test('YYYY-MM-DD 形式（TZ 未指定）は JST 00:00 として解釈される', () => {
      const d = h.toJstDate('2026-04-01');
      // JST 00:00 = UTC 前日 15:00 に相当する UNIX 時刻
      expect(d.getTime()).toBe(Date.UTC(2026, 3, 1) - 9 * 3600 * 1000);
      expect(h.getJstYear(d)).toBe(2026);
      expect(h.getJstMonth(d)).toBe(4);
      expect(h.getJstDay(d)).toBe(1);
    });

    test('YYYY-MM-DDTHH:mm 形式（TZ 未指定）は JST として解釈される', () => {
      const d = h.toJstDate('2026-04-30T16:00');
      expect(h.getJstYear(d)).toBe(2026);
      expect(h.getJstMonth(d)).toBe(4);
      expect(h.getJstDay(d)).toBe(30);
      expect(h.getJstHour(d)).toBe(16);
    });

    test('TZ 明示（+09:00）は指定オフセットのまま parse', () => {
      const d = h.toJstDate('2026-04-01T00:00:00+09:00');
      expect(d.getTime()).toBe(Date.UTC(2026, 3, 1) - 9 * 3600 * 1000);
    });

    test('TZ 明示（Z = UTC）は UTC として parse され JST ではない', () => {
      const d = h.toJstDate('2026-04-01T00:00:00Z');
      // UTC 2026-04-01 00:00 = JST 2026-04-01 09:00
      expect(d.getTime()).toBe(Date.UTC(2026, 3, 1));
      expect(h.getJstHour(d)).toBe(9);
    });

    test('不正文字列 → Invalid Date', () => {
      const d = h.toJstDate('invalid');
      expect(isNaN(d.getTime())).toBe(true);
    });

    test('空文字 / null → Invalid Date', () => {
      expect(isNaN(h.toJstDate('').getTime())).toBe(true);
      expect(isNaN(h.toJstDate(null).getTime())).toBe(true);
    });
  });

  // ─── addDays ───

  describe('addDays', () => {
    test('正数加算', () => {
      const d = h.addDays(h.jstDate(2026, 4, 15), 7);
      expect(h.getJstDay(d)).toBe(22);
      expect(h.getJstMonth(d)).toBe(4);
    });

    test('負数加算', () => {
      const d = h.addDays(h.jstDate(2026, 4, 15), -7);
      expect(h.getJstDay(d)).toBe(8);
      expect(h.getJstMonth(d)).toBe(4);
    });

    test('月跨ぎ（4/30 + 1 → 5/1）', () => {
      const d = h.addDays(h.jstDate(2026, 4, 30), 1);
      expect(h.getJstMonth(d)).toBe(5);
      expect(h.getJstDay(d)).toBe(1);
    });

    test('年跨ぎ（12/31 + 1 → 翌年 1/1）', () => {
      const d = h.addDays(h.jstDate(2026, 12, 31), 1);
      expect(h.getJstYear(d)).toBe(2027);
      expect(h.getJstMonth(d)).toBe(1);
      expect(h.getJstDay(d)).toBe(1);
    });

    test('元の Date は mutation されない（tz-safe 保証）', () => {
      const original = h.jstDate(2026, 4, 15);
      const originalMs = original.getTime();
      h.addDays(original, 10);
      expect(original.getTime()).toBe(originalMs);
    });
  });

  // ─── addMonths ───

  describe('addMonths', () => {
    test('通常の月加算（4 月 + 2 → 6 月）', () => {
      const d = h.addMonths(h.jstDate(2026, 4, 15), 2);
      expect(h.getJstMonth(d)).toBe(6);
      expect(h.getJstDay(d)).toBe(15);
    });

    test('年跨ぎ（12 月 + 1 → 翌年 1 月）', () => {
      const d = h.addMonths(h.jstDate(2026, 12, 15), 1);
      expect(h.getJstYear(d)).toBe(2027);
      expect(h.getJstMonth(d)).toBe(1);
    });

    test('負数加算（4 月 - 5 → 前年 11 月）', () => {
      const d = h.addMonths(h.jstDate(2026, 4, 15), -5);
      expect(h.getJstYear(d)).toBe(2025);
      expect(h.getJstMonth(d)).toBe(11);
    });

    test('月末日の overflow 挙動（1/31 + 1 → 3/3、JS Date 標準挙動）', () => {
      // JS Date.UTC(2026, 1, 31) は 2/31 = 3/3 に overflow 正規化される
      // 2026 年 2 月は 28 日までなので 31 → +3 日分 → 3 月 3 日
      const d = h.addMonths(h.jstDate(2026, 1, 31), 1);
      expect(h.getJstMonth(d)).toBe(3);
      expect(h.getJstDay(d)).toBe(3);
    });
  });

  // ─── getJstYear / getJstMonth / getJstDay ───

  describe('getJstYear / getJstMonth / getJstDay', () => {
    test('通常日（2026-06-15）の年月日', () => {
      const d = h.jstDate(2026, 6, 15, 12, 0);
      expect(h.getJstYear(d)).toBe(2026);
      expect(h.getJstMonth(d)).toBe(6);
      expect(h.getJstDay(d)).toBe(15);
    });

    test('JST 境界日 2026-04-01 00:00 — UTC では 3/31 15:00 だが JST では 4/1', () => {
      const d = h.jstDate(2026, 4, 1);
      expect(h.getJstYear(d)).toBe(2026);
      expect(h.getJstMonth(d)).toBe(4);
      expect(h.getJstDay(d)).toBe(1);
    });

    test('JST 境界日 2026-01-01 00:00 — UTC では 2025-12-31 15:00 だが JST では 2026/1/1', () => {
      const d = h.jstDate(2026, 1, 1);
      expect(h.getJstYear(d)).toBe(2026);
      expect(h.getJstMonth(d)).toBe(1);
      expect(h.getJstDay(d)).toBe(1);
    });
  });

  // ─── getFiscalYear ───

  describe('getFiscalYear', () => {
    test('4 月は当年度', () => {
      expect(h.getFiscalYear(2026, 4)).toBe(2026);
    });

    test('3 月は前年度', () => {
      expect(h.getFiscalYear(2026, 3)).toBe(2025);
    });

    test('1 月は前年度', () => {
      expect(h.getFiscalYear(2026, 1)).toBe(2025);
    });

    test('12 月は当年度', () => {
      expect(h.getFiscalYear(2026, 12)).toBe(2026);
    });

    test('4/1 境界: month=4 → 当年', () => {
      expect(h.getFiscalYear(2026, 4)).toBe(2026);
    });
  });

  // ─── formatMdw ───

  describe('formatMdw', () => {
    test('水曜日を "4月1日(水)" 形式で整形', () => {
      expect(h.formatMdw(h.jstDate(2026, 4, 1))).toBe('4月1日(水)');
    });

    test('日曜日を "4月5日(日)" 形式で整形', () => {
      expect(h.formatMdw(h.jstDate(2026, 4, 5))).toBe('4月5日(日)');
    });

    test('12 月末日を "12月31日(木)" 形式で整形', () => {
      expect(h.formatMdw(h.jstDate(2026, 12, 31))).toBe('12月31日(木)');
    });
  });

  // ─── isLeapYear ───

  describe('isLeapYear', () => {
    test('2024 は閏年（4 で割れる）', () => {
      expect(h.isLeapYear(2024)).toBe(true);
    });

    test('2025 は非閏年', () => {
      expect(h.isLeapYear(2025)).toBe(false);
    });

    test('2028 は閏年', () => {
      expect(h.isLeapYear(2028)).toBe(true);
    });

    test('2100 は非閏年（100 で割れるが 400 で割れない）', () => {
      expect(h.isLeapYear(2100)).toBe(false);
    });

    test('2400 は閏年（400 で割れる）', () => {
      expect(h.isLeapYear(2400)).toBe(true);
    });

    test('2000 は閏年（400 で割れる）', () => {
      expect(h.isLeapYear(2000)).toBe(true);
    });
  });

  // ─── formatJstDateStr ───

  describe('formatJstDateStr', () => {
    test('通常日 "2026-04-01" 形式で整形', () => {
      expect(h.formatJstDateStr(h.jstDate(2026, 4, 1))).toBe('2026-04-01');
    });

    test('月末日 "2026-12-31" 形式で整形', () => {
      expect(h.formatJstDateStr(h.jstDate(2026, 12, 31))).toBe('2026-12-31');
    });

    test('月日が 1 桁でも zero-padding される', () => {
      expect(h.formatJstDateStr(h.jstDate(2026, 1, 5))).toBe('2026-01-05');
    });
  });
});
