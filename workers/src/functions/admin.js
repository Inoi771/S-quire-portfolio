// 管理者メール一覧取得
export async function getAdminEmails(args, env, user) {
  const adminEmailsStr = env.ADMIN_EMAILS || '';
  const adminEmails = adminEmailsStr.split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  if (!adminEmails.includes(user.email.toLowerCase())) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }

  // GAS版と同じく trim のみ（lowercase しない）で返す
  const emails = adminEmailsStr.split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);

  return { success: true, emails: emails };
}
