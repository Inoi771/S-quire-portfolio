// 認証関連の共通ヘルパー（Phase 5-E-8b-1a で settings.js から昇格）
//
// `verifyFirebaseIdToken`（`../auth.js`）が Firebase ID トークンの検証を担う
// のに対し、こちらは検証済みユーザーの「権限」を判定するヘルパーを提供する。
// schedule 系の上書き管理など、複数の functions/ ファイルから再利用される。

const PROP_PREFIX = 'prop:';

/**
 * Admin メール一覧を取得する（Phase 5-E-11 で isAdminUser から共通化）。
 *
 * 取得順序:
 *   1. KV `prop:ADMIN_EMAILS` を試行
 *   2. 空 / null / 取得失敗なら `env.ADMIN_EMAILS` にフォールバック
 *
 * @param {Object} env Cloudflare Workers 環境（KV バインディング必須）
 * @param {{lowercase?: boolean}} [opts] 返却値を全て小文字化するか（既定: true）
 * @return {Promise<string[]>} カンマ区切りを trim／空要素除去した配列
 */
export async function getAdminEmailList(env, opts) {
  const lowercase = !opts || opts.lowercase !== false;
  let raw = '';
  try {
    raw = (await env.KV.get(PROP_PREFIX + 'ADMIN_EMAILS')) || '';
  } catch (e) { /* KV エラー時は env にフォールバック */ }
  if (!raw) raw = env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => (lowercase ? e.trim().toLowerCase() : e.trim()))
    .filter(Boolean);
}

/**
 * 認証済みユーザーが Admin かを判定する。
 *
 * Phase 5-E-6 で ScriptProperties は凍結され KV が唯一の正になったため、
 * `prop:ADMIN_EMAILS` を優先して読む。KV が未設定（初回セットアップ直後など）
 * か読み取りに失敗した場合のみ `env.ADMIN_EMAILS` にフォールバックする。
 *
 * 値はカンマ区切りのメールアドレス文字列で、GAS `isAdmin()` と同じ粒度。
 *
 * @param {Object} env Cloudflare Workers 環境（KV バインディング必須）
 * @param {{ email?: string, uid?: string }|null} user 認証済みユーザー
 * @return {Promise<boolean>}
 */
export async function isAdminUser(env, user) {
  if (!user || !user.email) return false;
  const list = await getAdminEmailList(env, { lowercase: true });
  return list.includes(user.email.toLowerCase());
}
