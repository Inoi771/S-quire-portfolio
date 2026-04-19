// ヘルスチェック（認証不要）
export async function ping(args, env) {
  return { success: true, message: 'pong', timestamp: new Date().toISOString() };
}
