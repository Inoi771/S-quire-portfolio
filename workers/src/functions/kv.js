// KV プロキシ API — GAS PropertiesService の置換用
//
// 認証: router.js で INTERNAL_FUNCTIONS として扱われ body.internalApiKey で認証済み
// キー命名: 呼出側はキー名のみ渡す。内部で "prop:" プレフィックスを自動付与
// 値の型: string のみ。JSON 化 / パースは呼出側の責任（GAS PropertiesService 互換）

const PROP_PREFIX = 'prop:';

/**
 * kv_get(key) — KV から値を取得
 * args: [key: string]
 * return: { success: true, value: string | null }  (存在しない場合は value=null)
 *         { success: false, error: string }
 */
export async function kv_get(args, env) {
  const [key] = args || [];
  if (!key || typeof key !== 'string') {
    return { success: false, error: 'キー名が指定されていません' };
  }
  const value = await env.KV.get(PROP_PREFIX + key);
  return { success: true, value };
}

/**
 * kv_set(key, value) — KV に値を保存
 * args: [key: string, value: string]
 * return: { success: true, message: string }
 *         { success: false, error: string }
 */
export async function kv_set(args, env) {
  const [key, value] = args || [];
  if (!key || typeof key !== 'string') {
    return { success: false, error: 'キー名が指定されていません' };
  }
  if (typeof value !== 'string') {
    return { success: false, error: '値は文字列である必要があります（JSON 化は呼出側で実施）' };
  }
  await env.KV.put(PROP_PREFIX + key, value);
  return { success: true, message: 'KV に保存しました' };
}

/**
 * kv_delete(key) — KV から値を削除
 * args: [key: string]
 * return: { success: true, message: string }
 *         { success: false, error: string }
 */
export async function kv_delete(args, env) {
  const [key] = args || [];
  if (!key || typeof key !== 'string') {
    return { success: false, error: 'キー名が指定されていません' };
  }
  await env.KV.delete(PROP_PREFIX + key);
  return { success: true, message: 'KV から削除しました' };
}

/**
 * kv_list(prefix, cursor, limit) — KV のキー一覧を取得（ページネーション対応）
 * args: [prefix?: string, cursor?: string, limit?: number]
 *   prefix: "prop:" の後に追加するフィルタ文字列（未指定時は全 prop 取得）
 *   cursor: 前回レスポンスの cursor を渡すと続きを取得
 *   limit:  1〜1000（未指定時 1000・KV 上限）
 * return: {
 *   success: true,
 *   keys: [{ name: string }, ...],   ← "prop:" プレフィックス除去済みのキー名
 *   cursor: string | null,            ← 次ページ取得用。list_complete=true なら null
 *   list_complete: boolean            ← 全件取得完了フラグ
 * }
 */
export async function kv_list(args, env) {
  const [prefix = '', cursor = null, limit = 1000] = args || [];
  const effectiveLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 1000);
  const listOpts = {
    prefix: PROP_PREFIX + (prefix || ''),
    limit: effectiveLimit
  };
  if (cursor && typeof cursor === 'string') listOpts.cursor = cursor;

  const result = await env.KV.list(listOpts);
  const keys = (result.keys || []).map((k) => ({
    name: k.name.startsWith(PROP_PREFIX) ? k.name.substring(PROP_PREFIX.length) : k.name
  }));
  return {
    success: true,
    keys,
    cursor: result.list_complete ? null : (result.cursor || null),
    list_complete: !!result.list_complete
  };
}
