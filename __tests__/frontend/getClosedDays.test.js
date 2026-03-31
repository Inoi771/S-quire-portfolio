const { getClosedDays } = require('../helpers/frontend-functions');

describe('getClosedDays', () => {
  describe('ゴールデンウィーク', () => {
    test('4/30〜5/5が必ず含まれる', () => {
      const c = getClosedDays(2025);
      expect(c['2025-04-30']).toBe(true);
      expect(c['2025-05-01']).toBe(true);
      expect(c['2025-05-02']).toBe(true);
      expect(c['2025-05-03']).toBe(true);
      expect(c['2025-05-04']).toBe(true);
      expect(c['2025-05-05']).toBe(true);
    });

    test('5/7が日曜の年は5/6も休校（4/29は含まない）', () => {
      // 2023年: 5/7は日曜日
      const c = getClosedDays(2023);
      expect(c['2023-05-06']).toBe(true);
      expect(c['2023-04-29']).toBeUndefined();
    });

    test('5/7が日曜でない年は4/29も休校（5/6は含まない）', () => {
      // 2025年: 5/7は水曜日
      const c = getClosedDays(2025);
      expect(c['2025-04-29']).toBe(true);
      expect(c['2025-05-06']).toBeUndefined();
    });
  });

  describe('お盆', () => {
    test('8/10〜8/15が必ず含まれる', () => {
      const c = getClosedDays(2025);
      for (let d = 10; d <= 15; d++) {
        expect(c['2025-08-' + String(d).padStart(2, '0')]).toBe(true);
      }
    });

    test('8/17が日曜の年は8/16も休校', () => {
      // 2025年: 8/17は日曜日
      const c = getClosedDays(2025);
      expect(c['2025-08-16']).toBe(true);
      expect(c['2025-08-09']).toBeUndefined();
    });

    test('8/17が日曜でない年は8/9も休校', () => {
      // 2024年: 8/17は土曜日
      const c = getClosedDays(2024);
      expect(c['2024-08-09']).toBe(true);
      expect(c['2024-08-16']).toBeUndefined();
    });
  });

  describe('秋季休校', () => {
    test('10/28〜11/2が含まれる', () => {
      const c = getClosedDays(2025);
      expect(c['2025-10-28']).toBe(true);
      expect(c['2025-10-29']).toBe(true);
      expect(c['2025-10-30']).toBe(true);
      expect(c['2025-10-31']).toBe(true);
      expect(c['2025-11-01']).toBe(true);
      expect(c['2025-11-02']).toBe(true);
    });
  });

  describe('年末年始', () => {
    test('12/29〜翌1/3が年度をまたいで含まれる', () => {
      const c = getClosedDays(2025);
      expect(c['2025-12-29']).toBe(true);
      expect(c['2025-12-30']).toBe(true);
      expect(c['2025-12-31']).toBe(true);
      expect(c['2026-01-01']).toBe(true);
      expect(c['2026-01-02']).toBe(true);
      expect(c['2026-01-03']).toBe(true);
    });
  });

  describe('春季休校', () => {
    test('翌年3/15〜17が含まれる', () => {
      const c = getClosedDays(2025);
      expect(c['2026-03-15']).toBe(true);
      expect(c['2026-03-16']).toBe(true);
      expect(c['2026-03-17']).toBe(true);
    });

    test('翌年がうるう年なら3/14も追加される', () => {
      // 2027年度 → 翌年=2028（うるう年）
      const c = getClosedDays(2027);
      expect(c['2028-03-14']).toBe(true);
      expect(c['2028-03-15']).toBe(true);
    });

    test('翌年がうるう年でなければ3/14は含まない', () => {
      const c = getClosedDays(2025);
      expect(c['2026-03-14']).toBeUndefined();
    });
  });

  describe('戻り値の形式', () => {
    test('キーがYYYY-MM-DD形式のオブジェクトを返す', () => {
      const c = getClosedDays(2025);
      const keys = Object.keys(c);
      expect(keys.length).toBeGreaterThan(0);
      keys.forEach(key => {
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });
});
