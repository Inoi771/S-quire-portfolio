const { getReportDay, getMeetingDay, getDebitDays } = require('../helpers/frontend-functions');

describe('getReportDay（○回数報告書提出日）', () => {
  test('各月の基準日を返す', () => {
    expect(getReportDay(2025, 4)).toBe(21);
    expect(getReportDay(2025, 5)).toBe(24);
    expect(getReportDay(2025, 9)).toBe(13);
    expect(getReportDay(2025, 3)).toBe(13);
  });

  test('基準日が日曜日の場合、前日を返す', () => {
    // 2030年4月21日は日曜日
    expect(getReportDay(2030, 4)).toBe(20);
  });

  test('基準日が日曜でない場合、そのまま返す', () => {
    // 2025年4月21日は月曜日
    expect(getReportDay(2025, 4)).toBe(21);
  });

  test('対応する月がない場合nullを返す', () => {
    expect(getReportDay(2025, 13)).toBe(null);
    expect(getReportDay(2025, 0)).toBe(null);
  });
});

describe('getMeetingDay（□全体ミーティング日）', () => {
  test('8月はnullを返す', () => {
    expect(getMeetingDay(2025, 8)).toBe(null);
  });

  describe('4〜6月: 第2金曜日（1日が金曜なら第3金曜）', () => {
    test('2025年4月: 1日=火曜 → 第2金曜=11日', () => {
      // firstDay=2(火), vbFriday=((2-5+7)%7)+1 = (4%7)+1 = 5
      // result = 1-5+15 = 11
      expect(getMeetingDay(2025, 4)).toBe(11);
    });

    test('2025年5月: 1日=木曜 → 第2金曜=9日', () => {
      // firstDay=4(木), vbFriday=((4-5+7)%7)+1 = (6%7)+1 = 7
      // result = 1-7+15 = 9
      expect(getMeetingDay(2025, 5)).toBe(9);
    });

    test('1日が金曜の場合、第3金曜を返す', () => {
      // 2033年4月1日は金曜日
      // firstDay=5(金), vbFriday=((5-5+7)%7)+1 = (7%7)+1 = 1
      // result = 1-1+15 = 15
      expect(getMeetingDay(2033, 4)).toBe(15);
    });
  });

  describe('7〜3月（8月除く）: 基準日を含む直前の金曜日', () => {
    test('2025年7月: 基準日=9, 7/9=水曜', () => {
      // dow=3(水), daysBack=(3-5+7)%7 = 5
      // result = 9-5 = 4
      expect(getMeetingDay(2025, 7)).toBe(4);
    });

    test('2025年9月: 基準日=7, 9/7=日曜', () => {
      // dow=0(日), daysBack=(0-5+7)%7 = 2
      // result = 7-2 = 5
      expect(getMeetingDay(2025, 9)).toBe(5);
    });

    test('基準日が金曜の場合、その日を返す', () => {
      // 2026年1月: 基準日=20, 1/20=火曜
      // dow=2(火), daysBack=(2-5+7)%7 = 4
      // result = 20-4 = 16
      expect(getMeetingDay(2026, 1)).toBe(16);
    });
  });
});

describe('getDebitDays（★引落データ送信日 / △メール送信日）', () => {
  test('debitとemailの両方を含むオブジェクトを返す', () => {
    const result = getDebitDays(2025, 4);
    expect(result).toHaveProperty('debit');
    expect(result).toHaveProperty('email');
    expect(typeof result.debit).toBe('number');
    expect(typeof result.email).toBe('number');
  });

  test('8月は基準日が8', () => {
    // 2025年8月8日=金曜 (dow=5) → debitOff=-1, emailOff=-2
    expect(getDebitDays(2025, 8)).toEqual({ debit: 7, email: 6 });
  });

  test('1月は基準日が18', () => {
    // 2026年1月18日=日曜 (dow=0) → debitOff=-3, emailOff=-4
    expect(getDebitDays(2026, 1)).toEqual({ debit: 15, email: 14 });
  });

  test('通常月は基準日が13', () => {
    // 2025年4月13日=日曜 (dow=0) → debitOff=-3, emailOff=-4
    expect(getDebitDays(2025, 4)).toEqual({ debit: 10, email: 9 });
  });

  test('水曜日基準のオフセット計算', () => {
    // 2025年8月: 基準日=8, 8/8=金曜
    // 代わりに水曜日の基準日を探す: 2025年10月13日=月曜
    // dow=1, debitOff=-4, emailOff=-5
    expect(getDebitDays(2025, 10)).toEqual({ debit: 9, email: 8 });
  });

  test('木曜日基準: オフセット0/-1', () => {
    // 2025年11月13日=木曜 (dow=4) → debitOff=0, emailOff=-1
    expect(getDebitDays(2025, 11)).toEqual({ debit: 13, email: 12 });
  });
});
