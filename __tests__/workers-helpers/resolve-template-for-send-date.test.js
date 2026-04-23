// resolveTemplateForSendDate の API レベル統合テスト（Phase 6-B-06 で新規追加）
//
// workers/src/functions/line.js の resolveTemplateForSendDate は Phase 6-B-05 helpers を
// ラップする薄い API だが、以下の 3 点で独自の JST 補正パスを通るため重点検証する:
//   1. datetime-local 文字列（'YYYY-MM-DDTHH:mm' = TZ 無し）の toJstDate parse
//   2. meeting/report の `sendDay + 1` 翌日計算（jstDate の overflow 正規化で月跨ぎ）
//   3. shitsucho の {翌月}/{引落日付} 年跨ぎ計算（12月送信 → 翌年1月引落）
//
// helpers 単体テストは line-template-helpers.test.js で網羅済みのため、ここでは
// GAS 版 line.js:1335-1410 との 1:1 一致を代表ケースで確認する。

import { resolveTemplateForSendDate } from '../../workers/src/functions/line.js';

// ─── KV mock ヘルパー ─────────────────────────────────────────────────────

/**
 * env.KV.get のみ持つ最小限の Cloudflare Workers 環境 mock を返す。
 * Admin 判定（functions/auth.js isAdminUser）は prop:ADMIN_EMAILS を読むため
 * 合わせて mock する。
 * @param {Record<string, string>} kvData キー → 値 のマップ
 */
const mockEnv = (kvData = {}) => ({
  KV: {
    get: async (key) => (kvData[key] !== undefined ? kvData[key] : null)
  }
});

const ADMIN_USER = { email: 'admin@example.com' };
const ADMIN_KV = { 'prop:ADMIN_EMAILS': 'admin@example.com' };

// ─── (a) meeting 種別 × 月跨ぎ検証 ───────────────────────────────────────

describe('resolveTemplateForSendDate — meeting 種別（月跨ぎ）', () => {
  test('sendDateStr="2026-04-30T16:00" でイベント日翌日の {日付} が "5月1日(金)" になる', async () => {
    // 2026-05-01 は金曜（Jan 1, 2026 = 木 → +120 日後 = 120%7=1 → 金）
    const settings = {
      meeting: { messageTemplate: '{日付}' }
    };
    const env = mockEnv({
      ...ADMIN_KV,
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(settings)
    });

    const result = await resolveTemplateForSendDate(
      ['meeting', '2026-04-30T16:00'],
      env,
      ADMIN_USER
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('5月1日(金)');
  });
});

// ─── (b) report 種別 × report 分岐 + getReportExtras 検証 ───────────────

describe('resolveTemplateForSendDate — report 種別（月跨ぎ + 講習追記）', () => {
  test('sendDateStr="2026-03-31T16:00" で {報告月}=4, {講習追記}=と春期講習', async () => {
    // 2026-04-01 は水曜（Jan 1, 2026 = 木 → +90 日後 = 90%7=6 → 水）
    // getReportExtras(4) = '春期講習' → {講習追記} = 'と春期講習'
    const settings = {
      report: { messageTemplate: '{日付} 報告月={報告月} 講習追記={講習追記}' }
    };
    const env = mockEnv({
      ...ADMIN_KV,
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(settings)
    });

    const result = await resolveTemplateForSendDate(
      ['report', '2026-03-31T16:00'],
      env,
      ADMIN_USER
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('4月1日(水) 報告月=4 講習追記=と春期講習');
  });
});

// ─── (c) shitsucho 種別 × 年跨ぎ検証 ─────────────────────────────────────

describe('resolveTemplateForSendDate — shitsucho 種別（年跨ぎ）', () => {
  test('sendDateStr="2026-12-25T14:00" で {翌月}=1, {引落日付}=翌年1月分', async () => {
    // sendMonth=12 → nextMonth=1 / nextYear=2027
    // getDebitDay(2027, 1): baseDay=18, Jan 18,2027=月(dow=1) → debitOff=-4 → debitDay=14
    // Jan 14, 2027 = 木 → {引落日付} = "14日(木)"
    // month が 3/7/11 以外なので messageTemplate_default を使用
    const settings = {
      shitsucho: { messageTemplate_default: '{翌月}月 {引落日付}' }
    };
    const env = mockEnv({
      ...ADMIN_KV,
      'prop:LINE_SCHEDULER_SETTINGS': JSON.stringify(settings)
    });

    const result = await resolveTemplateForSendDate(
      ['shitsucho', '2026-12-25T14:00'],
      env,
      ADMIN_USER
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('1月 14日(木)');
  });
});
