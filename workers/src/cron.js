/**
 * Phase 6-B-09: Cloudflare Cron Triggers エントリポイント
 *
 * GAS 版の time-driven trigger を Cloudflare Cron に移行。
 * 毎時実行: LINE スケジュール配信の未送信メッセージを一括送信する。
 *
 * 対応する GAS 関数: checkAndSendDueLineMessages (line.js)
 */

export async function handleScheduled(event, env) {
  const cron = event && event.cron;
  const scheduledTime = event && event.scheduledTime;
  console.log('[cron] triggered:', cron, 'scheduledTime:', scheduledTime);

  try {
    const { checkAndSendDueLineMessagesCron } = await import('./functions/line.js');
    if (typeof checkAndSendDueLineMessagesCron === 'function') {
      const result = await checkAndSendDueLineMessagesCron(env);
      console.log('[cron] checkAndSendDueLineMessagesCron result:', JSON.stringify(result));
    } else {
      console.warn('[cron] checkAndSendDueLineMessagesCron not yet implemented (Phase 6-B-09 Step 3)');
    }
  } catch (e) {
    console.error('[cron] error:', (e && e.message) || e);
    throw e;
  }
}
