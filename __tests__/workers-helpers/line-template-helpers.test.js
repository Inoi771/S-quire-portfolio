// line-template-helpers.js のユニットテスト（Phase 6-B-05 で新規整備）
//
// babel-jest 経由で workers/src/helpers/ の ESM モジュールを CommonJS にトランスパイル
// してから読み込む（jest.config.js の transform 設定済み）。
// KV 読取を伴う async 関数は mock env を注入してテスト。
//
// テストの主眼:
//   - GAS 版（line.js:938-1515）と出力・挙動が一致すること
//   - 月跨ぎ・年末年始・うるう年・GW 曜日切替などの境界ケース
//   - CLOSED_DAYS_OVERRIDES / LINE_SCHEDULER_SETTINGS / LECTURE_DEADLINE_OVERRIDES
//     の KV データ形式がそのまま解釈されること

import * as h from '../../workers/src/helpers/line-template-helpers.js';
import { jstDate, getJstYear, getJstMonth, getJstDay } from '../../workers/src/helpers/datetime-helpers.js';

// ─── KV mock ヘルパー ─────────────────────────────────────────────────────

/**
 * env.KV.get のみ持つ最小限の Cloudflare Workers 環境 mock を返す。
 * @param {Record<string, string>} kvData キー → 値 のマップ
 */
const mockEnv = (kvData = {}) => ({
  KV: {
    get: async (key) => (kvData[key] !== undefined ? kvData[key] : null)
  }
});

// ─── computeClosedDaysForMonth ────────────────────────────────────────────

describe('computeClosedDaysForMonth', () => {
  test('年末年始（fiscal year 2026）の 12/29-12/31 + 翌 1/1-1/3 が休校日', async () => {
    const c = await h.computeClosedDaysForMonth(mockEnv(), 2026, 12);
    expect(c['2026-12-29']).toBe(true);
    expect(c['2026-12-30']).toBe(true);
    expect(c['2026-12-31']).toBe(true);
    expect(c['2027-01-01']).toBe(true);
    expect(c['2027-01-02']).toBe(true);
    expect(c['2027-01-03']).toBe(true);
  });

  test('うるう年（2028 年）の春季休校に 3/14 が追加される', async () => {
    // fiscal year 2027 → n = 2028（うるう年）→ 3/14 が追加
    const c = await h.computeClosedDaysForMonth(mockEnv(), 2028, 3);
    expect(c['2028-03-14']).toBe(true);
    expect(c['2028-03-15']).toBe(true);
    expect(c['2028-03-16']).toBe(true);
    expect(c['2028-03-17']).toBe(true);
  });

  test('非うるう年（2027 年）の春季休校に 3/14 は追加されない', async () => {
    // fiscal year 2026 → n = 2027（非うるう年）→ 3/14 は追加されない
    const c = await h.computeClosedDaysForMonth(mockEnv(), 2027, 3);
    expect(c['2027-03-14']).toBeUndefined();
    expect(c['2027-03-15']).toBe(true);
    expect(c['2027-03-16']).toBe(true);
    expect(c['2027-03-17']).toBe(true);
  });

  test('CLOSED_DAYS_OVERRIDES の add リストが適用される', async () => {
    const env = mockEnv({
      'prop:CLOSED_DAYS_OVERRIDES': JSON.stringify({ add: ['2026-06-15'], del: [] })
    });
    const c = await h.computeClosedDaysForMonth(env, 2026, 6);
    expect(c['2026-06-15']).toBe(true);
  });

  test('CLOSED_DAYS_OVERRIDES の del リストで既存休校日が削除される', async () => {
    // GW 初日 4/30 は固定休校日だが、del で削除できる
    const env = mockEnv({
      'prop:CLOSED_DAYS_OVERRIDES': JSON.stringify({ add: [], del: ['2026-04-30'] })
    });
    const c = await h.computeClosedDaysForMonth(env, 2026, 4);
    expect(c['2026-04-30']).toBeUndefined();
    // 他の GW 日は残る
    expect(c['2026-05-01']).toBe(true);
  });

  test('GW 切替: 5/7 が平日の年（2026）は 4/29 が追加、5/6 は追加されない', async () => {
    // 2026-05-07 は木曜（非日曜）→ add(y, 4, 29) 分岐
    const c = await h.computeClosedDaysForMonth(mockEnv(), 2026, 5);
    expect(c['2026-04-29']).toBe(true);
    expect(c['2026-05-06']).toBeUndefined();
  });

  test('GW 切替: 5/7 が日曜の年（2028）は 5/6 が追加、4/29 は追加されない', async () => {
    // 2028-05-07 は日曜 → add(y, 5, 6) 分岐（fiscal year = 2028）
    const c = await h.computeClosedDaysForMonth(mockEnv(), 2028, 5);
    expect(c['2028-05-06']).toBe(true);
    expect(c['2028-04-29']).toBeUndefined();
  });

  test('KV 読取エラー時でも固定休校日は返される（例外無しで graceful）', async () => {
    const env = {
      KV: {
        get: async () => { throw new Error('KV unavailable'); }
      }
    };
    const c = await h.computeClosedDaysForMonth(env, 2026, 12);
    // 固定休校日は返る
    expect(c['2026-12-29']).toBe(true);
  });
});

// ─── findPrevOpenDayDate ──────────────────────────────────────────────────

describe('findPrevOpenDayDate', () => {
  test('通常の開校日（2026-04-15 水曜・非休校）はそのまま返却', async () => {
    const d = await h.findPrevOpenDayDate(mockEnv(), jstDate(2026, 4, 15));
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(4);
    expect(getJstDay(d)).toBe(15);
  });

  test('年末年始を跨いで遡る: 2027-01-01（金・休校日）→ 2026-12-28（月・開校日）', async () => {
    // 1/1 金（休校）→ 1/2 土（休校） wait, 土は休校ではない
    // → 1/2 土（closedDays に土は含まれない、ただし 1/2 は年末年始休校日として登録済）
    // → 1/1, 1/2, 1/3 は休校日、12/31, 12/30, 12/29 も休校日、12/28 月は開校日
    const d = await h.findPrevOpenDayDate(mockEnv(), jstDate(2027, 1, 1));
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(12);
    expect(getJstDay(d)).toBe(28);
  });

  test('通常の日曜日（2026-04-05）→ 前日土曜（2026-04-04）が返る', async () => {
    // 4/5 日曜 → 4/4 土曜（土は休校日ではないため開校日扱い）
    const d = await h.findPrevOpenDayDate(mockEnv(), jstDate(2026, 4, 5));
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(4);
    expect(getJstDay(d)).toBe(4);
  });
});

// ─── getMeetingDay ────────────────────────────────────────────────────────

describe('getMeetingDay', () => {
  test('4/1 が水曜の年（2026）→ 第 2 金曜 = 4/10', () => {
    // firstDay(2026-04-01) = 3 (水), vbFriday = ((3-5+7)%7)+1 = 6, 1-6+15 = 10
    expect(h.getMeetingDay(2026, 4)).toBe(10);
  });

  test('4/1 が金曜の年（2022）→ 第 2 金曜 = 4/15', () => {
    // firstDay(2022-04-01) = 5 (金), vbFriday = ((5-5+7)%7)+1 = 1, 1-1+15 = 15
    expect(h.getMeetingDay(2022, 4)).toBe(15);
  });

  test('4/1 が月曜の年（2024）→ 第 2 金曜 = 4/12', () => {
    // firstDay(2024-04-01) = 1 (月), vbFriday = ((1-5+7)%7)+1 = 4, 1-4+15 = 12
    expect(h.getMeetingDay(2024, 4)).toBe(12);
  });

  test('8 月は meetingDay なし → null 返却', () => {
    expect(h.getMeetingDay(2026, 8)).toBeNull();
    expect(h.getMeetingDay(2027, 8)).toBeNull();
  });

  test('7 月（refDay=9）: 9 日から金曜まで遡る → 2026-07-03', () => {
    // 2026-07-09 = 木曜(4), daysBack = (4-5+7)%7 = 6, 9 - 6 = 3
    expect(h.getMeetingDay(2026, 7)).toBe(3);
  });
});

// ─── getDebitDay ──────────────────────────────────────────────────────────

describe('getDebitDay', () => {
  test('2026-04 (baseDay=13, 月曜) → -4 調整で 9', () => {
    // 2026-04-13 = 月(1), debitOff = -4, 結果 = 9
    expect(h.getDebitDay(2026, 4)).toBe(9);
  });

  test('2026-05 (baseDay=13, 水曜) → 調整なしで 13', () => {
    // 2026-05-13 = 水(3), debitOff = 0, 結果 = 13
    expect(h.getDebitDay(2026, 5)).toBe(13);
  });

  test('2027-01 (baseDay=18, 月曜) → -4 調整で 14', () => {
    // 2027-01-18 = 月(1), debitOff = -4, 結果 = 14
    expect(h.getDebitDay(2027, 1)).toBe(14);
  });
});

// ─── computeLectureDeadlineDate ───────────────────────────────────────────

describe('computeLectureDeadlineDate', () => {
  const springLp = { id: 'spring2026', name: '春期講習', startDate: '2026-04-01' };

  test('overrides 明示指定時は KV 読取せず指定値を返す', async () => {
    const env = mockEnv({
      // KV に別の値があっても overrides 引数が優先される
      'prop:LECTURE_DEADLINE_OVERRIDES': JSON.stringify({ spring2026: '2026-01-01' })
    });
    const overrides = { spring2026: '2026-03-20' };
    const d = await h.computeLectureDeadlineDate(env, springLp, overrides);
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(3);
    expect(getJstDay(d)).toBe(20);
  });

  test('overrides 未指定（undefined）時は KV から自動取得', async () => {
    const env = mockEnv({
      'prop:LECTURE_DEADLINE_OVERRIDES': JSON.stringify({ spring2026: '2026-03-15' })
    });
    const d = await h.computeLectureDeadlineDate(env, springLp, undefined);
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(3);
    expect(getJstDay(d)).toBe(15);
  });

  test('override 文字列が不正なら自動計算（countBack）に fall-through', async () => {
    const overrides = { spring2026: 'invalid-date' };
    const d = await h.computeLectureDeadlineDate(mockEnv(), springLp, overrides);
    // 春期講習 → 42 日前、startDate=2026-04-01 の前日 = 3/31、そこから -42 日 = 2/17
    // → 2/17 から findPrevOpenDayDate で開校日を取得
    // 2026-02-17 は火曜（開校日）→ そのまま 2/17
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(2);
    expect(getJstDay(d)).toBe(17);
  });

  test('override 未登録（新規講習）→ 自動計算（春期は 42 日前）', async () => {
    const newLp = { id: 'new_lecture', name: '春期講習', startDate: '2026-04-01' };
    const d = await h.computeLectureDeadlineDate(mockEnv(), newLp, {});
    expect(getJstYear(d)).toBe(2026);
    expect(getJstMonth(d)).toBe(2);
    expect(getJstDay(d)).toBe(17);
  });

  test('lp.startDate 不正時は null を返す', async () => {
    const badLp = { id: 'x', name: '春期講習', startDate: 'not-a-date' };
    const d = await h.computeLectureDeadlineDate(mockEnv(), badLp, {});
    expect(d).toBeNull();
  });

  test('lp 自体が null/空なら null を返す', async () => {
    expect(await h.computeLectureDeadlineDate(mockEnv(), null, {})).toBeNull();
    expect(await h.computeLectureDeadlineDate(mockEnv(), {}, {})).toBeNull();
  });
});

// ─── resolveTemplatePlaceholders ──────────────────────────────────────────

describe('resolveTemplatePlaceholders', () => {
  test('meeting 種別: 2026-04 の {日付}{月}{日}{曜日} 展開', async () => {
    // meetingDay=10, 4/10=金
    const closedDays = await h.computeClosedDaysForMonth(mockEnv(), 2026, 4);
    const result = h.resolveTemplatePlaceholders(
      '日={日付} 月={月} 日={日} 曜={曜日}',
      'meeting',
      2026, 4, closedDays
    );
    expect(result).toBe('日=4月10日(金) 月=4 日=10 曜=金');
  });

  test('report 種別: 2026-04 の {日付}{報告月}{講習追記} 展開', async () => {
    // reportDay=21, 4/21=火, extra='春期講習'
    const closedDays = await h.computeClosedDaysForMonth(mockEnv(), 2026, 4);
    const result = h.resolveTemplatePlaceholders(
      '{日付} 報告月={報告月}{講習追記}',
      'report',
      2026, 4, closedDays
    );
    expect(result).toBe('4月21日(火) 報告月=4と春期講習');
  });

  test('report 種別: extras のない月（例: 5 月）では {講習追記} が空文字', async () => {
    const closedDays = await h.computeClosedDaysForMonth(mockEnv(), 2026, 5);
    const result = h.resolveTemplatePlaceholders(
      '報告月={報告月}{講習追記}',
      'report',
      2026, 5, closedDays
    );
    expect(result).toBe('報告月=5');
  });

  test('shitsucho 種別: 2026-04 で {翌月}{講習名}{引落日付} 展開', async () => {
    const closedDays = await h.computeClosedDaysForMonth(mockEnv(), 2026, 4);
    // nextYear=2026, nextMonth=5, debitDay(2026,5)=13 (水), 講習名(4)='春期講習'
    const result = h.resolveTemplatePlaceholders(
      '{翌月}月は{講習名}、引落={引落日付}',
      'shitsucho',
      2026, 4, closedDays
    );
    expect(result).toBe('5月は春期講習、引落=13日(水)');
  });

  test('shitsucho 種別: 月境界 12 月 → 翌 1 月の {翌月}{引落日付}', async () => {
    // month=12 → nextMonth=1, nextYear=2027
    // debitDay(2027,1): baseDay=18、2027-01-18=月曜 → -4 調整で 14
    // 2027-01-14 の曜日 = 木
    const closedDays = await h.computeClosedDaysForMonth(mockEnv(), 2026, 12);
    const result = h.resolveTemplatePlaceholders(
      '翌={翌月} 引落={引落日付}',
      'shitsucho',
      2026, 12, closedDays
    );
    expect(result).toBe('翌=1 引落=14日(木)');
  });

  test('meeting 種別で month=8 は meetingDay=null → 空文字返却', async () => {
    const closedDays = await h.computeClosedDaysForMonth(mockEnv(), 2026, 8);
    const result = h.resolveTemplatePlaceholders(
      '明日は{日付}',
      'meeting',
      2026, 8, closedDays
    );
    expect(result).toBe('');
  });

  test('template 空文字 → 空文字返却', () => {
    expect(h.resolveTemplatePlaceholders('', 'meeting', 2026, 4, {})).toBe('');
  });
});

// ─── buildMessageFromTemplate ─────────────────────────────────────────────

describe('buildMessageFromTemplate', () => {
  const baseSettings = {
    meeting: { messageTemplate: 'M: {日付}' },
    report: { messageTemplate: 'R: {日付} sendMonth={報告月}' },
    shitsucho: {
      messageTemplate_march: 'S-march: 締切{締切日}',
      messageTemplate_simple: 'S-simple: 引落{引落日付}',
      messageTemplate_default: 'S-default: {翌月}月'
    }
  };

  test('meeting 種別: settings.meeting.messageTemplate を展開', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(baseSettings)
    });
    const closedDays = await h.computeClosedDaysForMonth(env, 2026, 4);
    const msg = await h.buildMessageFromTemplate(env, 'meeting', 2026, 4, closedDays);
    expect(msg).toBe('M: 4月10日(金)');
  });

  test('report 種別: settings.report.messageTemplate を展開', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(baseSettings)
    });
    const closedDays = await h.computeClosedDaysForMonth(env, 2026, 4);
    const msg = await h.buildMessageFromTemplate(env, 'report', 2026, 4, closedDays);
    expect(msg).toBe('R: 4月21日(火) sendMonth=4');
  });

  test('shitsucho 3 月: messageTemplate_march が選択される', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(baseSettings)
    });
    const closedDays = await h.computeClosedDaysForMonth(env, 2026, 3);
    const msg = await h.buildMessageFromTemplate(env, 'shitsucho', 2026, 3, closedDays);
    expect(msg.startsWith('S-march:')).toBe(true);
  });

  test('shitsucho 7 月: messageTemplate_simple が選択される', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(baseSettings)
    });
    const closedDays = await h.computeClosedDaysForMonth(env, 2026, 7);
    const msg = await h.buildMessageFromTemplate(env, 'shitsucho', 2026, 7, closedDays);
    expect(msg.startsWith('S-simple:')).toBe(true);
  });

  test('shitsucho 11 月: messageTemplate_simple が選択される', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(baseSettings)
    });
    const closedDays = await h.computeClosedDaysForMonth(env, 2026, 11);
    const msg = await h.buildMessageFromTemplate(env, 'shitsucho', 2026, 11, closedDays);
    expect(msg.startsWith('S-simple:')).toBe(true);
  });

  test('shitsucho 4 月: messageTemplate_default が選択される', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(baseSettings)
    });
    const closedDays = await h.computeClosedDaysForMonth(env, 2026, 4);
    const msg = await h.buildMessageFromTemplate(env, 'shitsucho', 2026, 4, closedDays);
    expect(msg.startsWith('S-default:')).toBe(true);
  });

  test('KV が null（設定なし）→ 空文字返却', async () => {
    const env = mockEnv();
    const msg = await h.buildMessageFromTemplate(env, 'meeting', 2026, 4, {});
    expect(msg).toBe('');
  });

  test('KV 不正 JSON → 空文字返却（例外は throw しない）', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': 'not-valid-json{{'
    });
    const msg = await h.buildMessageFromTemplate(env, 'meeting', 2026, 4, {});
    expect(msg).toBe('');
  });

  test('messageTemplate 未設定 → 空文字返却', async () => {
    const env = mockEnv({
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify({ meeting: {} })
    });
    const msg = await h.buildMessageFromTemplate(env, 'meeting', 2026, 4, {});
    expect(msg).toBe('');
  });
});
