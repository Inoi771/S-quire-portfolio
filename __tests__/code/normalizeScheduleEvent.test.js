require('../helpers/gas-mocks');
const { normalizeScheduleEvent } = require('../../admin');

describe('normalizeScheduleEvent', () => {
  test('年号（2025年）を除去する', () => {
    const result = normalizeScheduleEvent({
      eventName: 'テスト',
      schedule: '2025年6月10日',
      details: ''
    });
    expect(result.schedule).toBe('6月10日');
  });

  test('複数の年号を除去する', () => {
    const result = normalizeScheduleEvent({
      eventName: 'テスト',
      schedule: '2025年6月10日2026年',
      details: ''
    });
    expect(result.schedule).toBe('6月10日');
  });

  test('～による範囲を検出し、初日を抽出する', () => {
    const result = normalizeScheduleEvent({
      eventName: '夏期講習',
      schedule: '7月19日～8月31日',
      details: ''
    });
    expect(result.schedule).toBe('7月19日');
    expect(result.details).toContain('7月19日～8月31日');
  });

  test('〜（全角チルダ）による範囲を検出する', () => {
    const result = normalizeScheduleEvent({
      eventName: '夏期講習',
      schedule: '7月19日〜8月31日',
      details: ''
    });
    expect(result.schedule).toBe('7月19日');
  });

  test('~（半角チルダ）による範囲を検出する', () => {
    const result = normalizeScheduleEvent({
      eventName: '講習',
      schedule: '7月1日~7月5日',
      details: ''
    });
    expect(result.schedule).toBe('7月1日');
  });

  test('既存のdetailsがある場合、範囲情報を追記する', () => {
    const result = normalizeScheduleEvent({
      eventName: 'テスト',
      schedule: '7月1日～7月5日',
      details: '全学年'
    });
    expect(result.details).toContain('全学年');
    expect(result.details).toContain('7月1日～7月5日');
  });

  test('範囲でないスケジュールはそのまま通す', () => {
    const result = normalizeScheduleEvent({
      eventName: '定期テスト',
      schedule: '6月10日',
      details: '中3対象'
    });
    expect(result.schedule).toBe('6月10日');
    expect(result.details).toBe('中3対象');
  });

  test('空のオブジェクトを渡しても安全に処理する', () => {
    const result = normalizeScheduleEvent({});
    expect(result.eventName).toBe('');
    expect(result.schedule).toBe('');
    expect(result.details).toBe('');
  });

  test('null/undefinedフィールドを安全に処理する', () => {
    const result = normalizeScheduleEvent({
      eventName: null,
      schedule: undefined,
      details: null
    });
    expect(result.eventName).toBe('');
    expect(result.schedule).toBe('');
    expect(result.details).toBe('');
  });

  test('年号付き範囲を正しく処理する', () => {
    const result = normalizeScheduleEvent({
      eventName: '夏休み',
      schedule: '2025年7月19日～2025年8月31日',
      details: ''
    });
    expect(result.schedule).toBe('7月19日');
  });
});
