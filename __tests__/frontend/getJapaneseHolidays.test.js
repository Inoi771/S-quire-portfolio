const { getJapaneseHolidays } = require('../helpers/frontend-functions');

describe('getJapaneseHolidays', () => {
  describe('固定祝日', () => {
    test('元日（1/1）が含まれる', () => {
      const h = getJapaneseHolidays(2025);
      expect(h['2025-01-01']).toBe(true);
    });

    test('建国記念の日（2/11）が含まれる', () => {
      const h = getJapaneseHolidays(2025);
      expect(h['2025-02-11']).toBe(true);
    });

    test('天皇誕生日（2/23）は2020年以降のみ', () => {
      expect(getJapaneseHolidays(2025)['2025-02-23']).toBe(true);
      expect(getJapaneseHolidays(2019)['2019-02-23']).toBeUndefined();
    });

    test('昭和の日（4/29）が含まれる', () => {
      expect(getJapaneseHolidays(2025)['2025-04-29']).toBe(true);
    });

    test('5/3, 5/4, 5/5が含まれる', () => {
      const h = getJapaneseHolidays(2025);
      expect(h['2025-05-03']).toBe(true);
      expect(h['2025-05-04']).toBe(true);
      expect(h['2025-05-05']).toBe(true);
    });

    test('山の日（8/11）は2016年以降のみ', () => {
      expect(getJapaneseHolidays(2025)['2025-08-11']).toBe(true);
      expect(getJapaneseHolidays(2015)['2015-08-11']).toBeUndefined();
    });

    test('文化の日（11/3）と勤労感謝の日（11/23）が含まれる', () => {
      const h = getJapaneseHolidays(2025);
      expect(h['2025-11-03']).toBe(true);
      expect(h['2025-11-23']).toBe(true);
    });
  });

  describe('ハッピーマンデー（可変祝日）', () => {
    test('成人の日は1月第2月曜日', () => {
      // 2025年1月: 1日=水曜、第2月曜=13日
      expect(getJapaneseHolidays(2025)['2025-01-13']).toBe(true);
    });

    test('海の日は7月第3月曜日', () => {
      // 2025年7月: 1日=火曜、第3月曜=21日
      expect(getJapaneseHolidays(2025)['2025-07-21']).toBe(true);
    });

    test('敬老の日は9月第3月曜日', () => {
      // 2025年9月: 1日=月曜、第3月曜=15日
      expect(getJapaneseHolidays(2025)['2025-09-15']).toBe(true);
    });

    test('スポーツの日は10月第2月曜日', () => {
      // 2025年10月: 1日=水曜、第2月曜=13日
      expect(getJapaneseHolidays(2025)['2025-10-13']).toBe(true);
    });
  });

  describe('春分の日・秋分の日（近似式）', () => {
    test('2025年の春分の日は3/20', () => {
      expect(getJapaneseHolidays(2025)['2025-03-20']).toBe(true);
    });

    test('2025年の秋分の日は9/23', () => {
      expect(getJapaneseHolidays(2025)['2025-09-23']).toBe(true);
    });

    test('2024年の春分の日は3/20', () => {
      expect(getJapaneseHolidays(2024)['2024-03-20']).toBe(true);
    });

    test('2024年の秋分の日は9/22', () => {
      expect(getJapaneseHolidays(2024)['2024-09-22']).toBe(true);
    });
  });

  describe('振替休日', () => {
    test('祝日が日曜の場合、翌月曜が振替休日になる', () => {
      // 2025年2月23日は日曜日→2/24が振替休日
      const h = getJapaneseHolidays(2025);
      expect(h['2025-02-23']).toBe(true);
      expect(h['2025-02-24']).toBe(true);
    });

    test('振替休日が祝日と重なる場合、さらに翌日にずれる', () => {
      // 2025年5月: 5/3=土, 5/4=日, 5/5=月（こどもの日）, 5/6=振替休日
      const h = getJapaneseHolidays(2025);
      expect(h['2025-05-06']).toBe(true);
    });
  });

  describe('国民の休日', () => {
    test('祝日に挟まれた平日が国民の休日になる', () => {
      // 2026年9月: 敬老の日=9/21(月), 秋分の日=9/23(水), 9/22=火曜→国民の休日
      const h = getJapaneseHolidays(2026);
      expect(h['2026-09-22']).toBe(true);
    });
  });

  describe('複数年の一貫性', () => {
    test('毎年、少なくとも15日以上の祝日がある', () => {
      for (let year = 2020; year <= 2030; year++) {
        const h = getJapaneseHolidays(year);
        const count = Object.keys(h).length;
        expect(count).toBeGreaterThanOrEqual(15);
      }
    });
  });
});
