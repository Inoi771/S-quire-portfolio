// Gemini API 共通ヘルパー（Phase 6-B-02 で新規整備）
//
// Workers 内の全 Gemini 呼出はこのモジュール経由で行うこと。
// GAS 版（analysis.js:20-102 の fetchGeminiWithRetry_ と
// admin.js:1180-1212 の parseGeminiErrorMessage_）と完全互換。
//
// 主な export:
//   - fetchGeminiWithRetry(env, model, payload)
//   - parseGeminiErrorMessage(response)
//   - extractGeminiText(result)
//
// API キーは `env.KV.get('prop:GEMINI_API_KEY')` を優先し、
// `env.GEMINI_API_KEY` への fallback を念のため保持する。
// Imagen（:predict endpoint）は payload 構造が異なるため本ヘルパーの対象外。

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const PROP_PREFIX = 'prop:';

/**
 * Gemini API キーを取得する（KV 優先・env fallback）。
 *
 * @param {Object}  env    Cloudflare Workers 環境
 * @param {boolean} backup true の場合は BACKUP キーを取得
 * @return {Promise<string>} APIキー文字列（未設定時は空文字）
 */
async function getGeminiApiKey(env, backup) {
  const kvKey = backup ? 'GEMINI_API_KEY_BACKUP' : 'GEMINI_API_KEY';
  try {
    const v = await env.KV.get(PROP_PREFIX + kvKey);
    if (v) return v;
  } catch (e) {
    /* KV エラー時は env にフォールバック */
  }
  return (env[kvKey] || '');
}

/**
 * ms ミリ秒だけ sleep する。
 */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * 指定モデル + APIキーで generateContent の URL を組み立てる。
 */
function buildGeminiUrl(model, apiKey) {
  return `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
}

/**
 * 共通 fetch（payload は都度 JSON 文字列化するため呼び毎に使い回し安全）。
 */
function fetchGemini(url, payload) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

/**
 * Gemini API を呼出してエラー種別に応じて自動リトライする。
 * GAS analysis.js:20-102 の fetchGeminiWithRetry_ と完全互換。
 *
 * リトライ戦略:
 *   1. 500/503 → 5 秒待機 → 1 回リトライ → まだ 500/503 なら BACKUP key に切替
 *   2. 429（レート制限）→ 3 秒待機 → 1 回リトライ → まだ 429 なら BACKUP key に切替
 *   3. 全リトライ失敗時 → gemini-2.5-flash へモデル fallback（同 key）
 *   4. フォールバックモデルも失敗 → フォールバックモデル + BACKUP key で最終試行
 *
 * @param {Object} env     Cloudflare Workers 環境
 * @param {string} model   モデル名（例: 'gemini-3.1-flash-lite-preview'）
 * @param {Object} payload generateContent 用 JSON payload
 * @return {Promise<Response>} fetch Response（非 200 も含む・throw しない）
 * @throws API キー未設定時のみ Error を throw
 */
export async function fetchGeminiWithRetry(env, model, payload) {
  const apiKey = await getGeminiApiKey(env, false);
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

  let res = await fetchGemini(buildGeminiUrl(model, apiKey), payload);
  let code = res.status;

  // 503・500（高負荷・一時障害）: 5 秒待機 1 回リトライ → まだ続くなら予備キー
  if (code === 503 || code === 500) {
    console.log(`⚠ Gemini API高負荷/障害(${code})。5秒後に1回リトライします...`);
    await sleep(5000);
    res = await fetchGemini(buildGeminiUrl(model, apiKey), payload);
    code = res.status;
    if (code === 503 || code === 500) {
      const backupKey = await getGeminiApiKey(env, true);
      if (backupKey) {
        console.log('🔄 500/503継続のため予備キーに切り替えます...');
        res = await fetchGemini(buildGeminiUrl(model, backupKey), payload);
        code = res.status;
        console.log(code < 500 ? `✓ 予備キーで回復（HTTP ${code}）` : '⚠ 予備キーも500/503です');
      }
    }
  }

  // 429（レート制限）: 1 回だけ短い待機でリトライし、解消しなければ即座に予備キーへ切り替え
  // GAS 版のバグ的挙動（retryWaits = [3000, 8000, 15000] だが i>=1 で break するため
  // 実際に使われるのは [0] の 3 秒だけ）を完全互換で port する
  const retryWaits = [3000, 8000, 15000];
  for (let i = 0; i < 3; i++) {
    if (code !== 429) break;
    if (i >= 1) {
      console.log('⚠ Gemini API 2回目のレート制限(429)。予備キーへ早期切り替えします...');
      break;
    }
    const waitMs = retryWaits[i];
    console.log(`⚠ Gemini APIレート制限(429)。${waitMs / 1000}秒後にリトライ（${i + 1}/3）...`);
    await sleep(waitMs);
    res = await fetchGemini(buildGeminiUrl(model, apiKey), payload);
    code = res.status;
  }

  // 予備キーへのフォールバック（メインキーで 429 が解消しなかった場合）
  if (code === 429) {
    const backupKey = await getGeminiApiKey(env, true);
    if (backupKey) {
      console.log('🔄 予備キーに切り替えます...');
      res = await fetchGemini(buildGeminiUrl(model, backupKey), payload);
      code = res.status;
      console.log(code !== 429 ? `✓ 予備キーで成功（HTTP ${code}）` : '⚠ 予備キーもレート制限(429)です');
    }
  }

  // 全リトライ失敗時: gemini-2.5-flash へモデルフォールバック
  if (code !== 200 && model !== FALLBACK_MODEL) {
    console.log(`🔄 最終フォールバック: ${FALLBACK_MODEL} に切り替え（元エラー: HTTP ${code}）`);
    res = await fetchGemini(buildGeminiUrl(FALLBACK_MODEL, apiKey), payload);
    code = res.status;
    if (code !== 200) {
      const backupKey = await getGeminiApiKey(env, true);
      if (backupKey) {
        console.log('🔄 フォールバック予備キーに切り替えます...');
        res = await fetchGemini(buildGeminiUrl(FALLBACK_MODEL, backupKey), payload);
        code = res.status;
        console.log(code === 200 ? '✓ フォールバック予備キーで成功' : `⚠ 全フォールバック失敗（HTTP ${code}）`);
      }
    } else {
      console.log(`✓ ${FALLBACK_MODEL} で成功`);
    }
  }

  return res;
}

/**
 * Gemini レスポンスから content.parts のテキストを抽出する。
 * thinkingConfig の thought parts をフィルタし、残った最後のパートの text を返す。
 *
 * @param {Object} result JSON.parse 済みレスポンスボディ
 * @return {string} テキスト本文（空文字になり得る）
 */
export function extractGeminiText(result) {
  const parts = (result && result.candidates && result.candidates[0] &&
                 result.candidates[0].content && result.candidates[0].content.parts) || [];
  const visible = parts.filter(p => !p.thought);
  const textPart = visible[visible.length - 1];
  return textPart ? (textPart.text || '').trim() : '';
}

/**
 * PT タイムゾーンのサマータイム判定。
 * GAS admin.js:1201 の `Utilities.formatDate(new Date(), 'America/Los_Angeles', 'Z')` 相当。
 *
 * @return {string} '-0700' (DST) または '-0800' (標準時)
 */
function getPtOffset() {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'shortOffset'
    });
    const parts = fmt.formatToParts(new Date());
    const tz = (parts.find(p => p.type === 'timeZoneName') || {}).value || '';
    // 'GMT-7' / 'GMT-07:00' / 'UTC-7' 等を許容
    return tz.includes('-7') ? '-0700' : '-0800';
  } catch (_) {
    return '-0800';
  }
}

/**
 * JST 現在時刻の「時」を取得する（0-23）。
 * GAS admin.js:1203 の `parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'), 10)` 相当。
 */
function getJstHour() {
  try {
    const fmt = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      hour12: false
    });
    return parseInt(fmt.format(new Date()), 10);
  } catch (_) {
    return 0;
  }
}

/**
 * Gemini API のエラーレスポンスを日本語メッセージに変換する。
 * GAS admin.js:1180-1212 の parseGeminiErrorMessage_ の完全移植。
 *
 * @param {Response} response fetch Response（body 未消費）
 * @return {Promise<string>} ユーザー向けエラーメッセージ
 */
export async function parseGeminiErrorMessage(response) {
  const code = response.status;
  let body = '';
  try {
    body = await response.text();
    const errJson = JSON.parse(body);
    body = (errJson.error && errJson.error.message) ? errJson.error.message : body;
  } catch (_) {
    /* body は text() の結果のまま使う */
  }
  console.error(`❌ Gemini API Error [${code}]: ${body}`);

  if (code === 429) {
    const bodyLower = body.toLowerCase();
    const isRpmLimit = bodyLower.indexOf('per 1.0m') !== -1 ||
                       bodyLower.indexOf('per minute') !== -1 ||
                       bodyLower.indexOf('rate limit') !== -1;
    if (isRpmLimit) {
      return 'AIへのリクエストが集中しています。1〜2分ほどお待ちの上、再度お試しください。';
    }
    const ptOff = getPtOffset();
    const resetHour = (ptOff === '-0700') ? 16 : 17;
    const nowHour = getJstHour();
    const when = nowHour >= resetHour ? '明日の' : '今日の';
    return 'AIの1日の利用上限に達しました。' + when + resetHour + ':00頃に制限が解除されます。';
  }
  if (code === 401) return 'Gemini APIキーが正しくありません。管理者に報告してご確認いただくようお願いします';
  if (code === 403) return 'Gemini APIキーに権限がありません。管理者に報告してご確認いただくようお願いします';
  if (code === 404) return 'AIモデルが見つかりません。管理者に報告してください';
  if (code >= 500) return 'Gemini API障害 (HTTP ' + code + '): ' + body.substring(0, 120) + '。しばらくお待ちください';
  return '予期しないAPIエラーが発生しました (HTTP ' + code + ')。管理者に報告してください';
}
