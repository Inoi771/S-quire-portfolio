// 講師メールアドレス管理 CRUD（GAS auth.js のメール管理 3 関数の Workers ポート）
// Phase 6-A-3: getTeacherEmails / addEmailToTeacher / removeEmailFromTeacher
//
// Phase 6-A-2 の議事録 CRUD と同型パターン:
//   find_staff_by_auth → supabaseUpdate（部分更新） → firestoreSet/Delete
//
// 実装方針:
//   - Supabase staffs への書き込みは `supabaseUpdate` による部分更新を使用
//     （CLAUDE.md settings.js:109 の教訓および saveLecGrades / savePreferredCampuses
//      と同一パターン。B-⑭/⑯/⑰ の NOT NULL 違反を回避するため）
//   - Firestore allowedUsers への書込/削除失敗は try-catch で握り潰し
//     （getAppStartupData の allowedUsers 書き込みと同じ扱い。GAS 版も同等）
//   - 戻り値形状は GAS 版と完全一致させる
import { supabaseRpc, supabaseUpdate, staffFromSupabase } from '../supabase.js';
import { firestoreSet, firestoreDelete } from '../firebase.js';

/**
 * getTeacherEmails — GAS auth.js:493 の Workers 版
 * 現在のログイン中講師のメールアドレス一覧を返す（読取のみ）。
 *
 * GAS 版との差分なし:
 *   - staff.emails が配列でない場合は staff.email を配列化するレガシー後方互換を維持
 *   - currentEmail は Firebase 認証済みメールを小文字化して返却
 *
 * @param {Array} args 未使用
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, emails, teacherId, currentEmail } | { success:false, error }
 */
export async function getTeacherEmails(args, env, user) {
  try {
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });
    if (!rows || rows.length === 0) {
      return { success: false, error: '講師情報が見つかりません' };
    }

    const staff = staffFromSupabase(rows[0]);
    const teacherId = staff.teacherId || staff._id;
    const currentEmail = (user.email || '').toLowerCase();
    const emails = Array.isArray(staff.emails) && staff.emails.length > 0
      ? staff.emails.slice()
      : (staff.email ? [staff.email] : []);

    return { success: true, emails, teacherId, currentEmail };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * addEmailToTeacher — GAS auth.js:515 の Workers 版
 * 現在のログイン中講師の emails 配列に新しいメールアドレスを追加する。
 *
 * バリデーション（GAS 版と完全一致）:
 *   1. 空 or '@' を含まない → 「正しいメールアドレスを入力してください」
 *   2. 自分の emails に既に存在 → 「このメールアドレスは既に登録されています」
 *   3. 他の講師に登録済み → 「既に別の講師に登録されています」
 *
 * 他人登録チェックは find_staff_by_auth に p_uid: null を渡して email のみで検索
 * （GAS 版 auth.js:534 と同等）。ヒットした staffId が自分と異なる場合のみエラー。
 *
 * 成功時:
 *   - staffs.emails に追加（supabaseUpdate で部分更新、updated_at も同時更新）
 *   - allowedUsers/{email} に書き込み（失敗は握り潰し）
 *
 * @param {Array} args [newEmail]
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, message, emails } | { success:false, error }
 */
export async function addEmailToTeacher(args, env, user) {
  try {
    let [newEmail] = args || [];
    newEmail = (newEmail || '').trim().toLowerCase();
    if (!newEmail || newEmail.indexOf('@') === -1) {
      return { success: false, error: '正しいメールアドレスを入力してください' };
    }

    // ログイン中の staff を解決
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });
    if (!rows || rows.length === 0) {
      return { success: false, error: '講師情報が見つかりません' };
    }

    const staff = staffFromSupabase(rows[0]);
    const teacherId = staff.teacherId || staff._id;

    // emails 配列を整備（レガシー後方互換: 配列でなければ scalar email を配列化）
    const emails = Array.isArray(staff.emails) && staff.emails.length > 0
      ? staff.emails.slice()
      : (staff.email ? [staff.email] : []);

    // 自分の emails に既にあるか
    if (emails.indexOf(newEmail) !== -1) {
      return { success: false, error: 'このメールアドレスは既に登録されています' };
    }

    // 他の staff に登録されていないか（p_uid: null は他人登録検知のため意図的）
    const existing = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: null,
      p_email: newEmail
    });
    if (existing && existing.length > 0 && existing[0].id !== teacherId) {
      return { success: false, error: 'このメールアドレスは既に別の講師に登録されています' };
    }

    // 追加 → 部分更新（新規ヘルパーを作らず supabaseUpdate を直接使う）
    emails.push(newEmail);
    await supabaseUpdate(env, 'staffs',
      { emails, updated_at: new Date().toISOString() },
      'id=eq.' + encodeURIComponent(teacherId)
    );

    // allowedUsers にも追加（失敗しても成功扱い — GAS 版 auth.js:547-551 と同等）
    try {
      await firestoreSet(env, 'allowedUsers', newEmail, {
        email: newEmail,
        addedAt: new Date().toISOString()
      });
    } catch (fsErr) { /* allowedUsers 登録失敗は握り潰し */ }

    return { success: true, message: 'メールアドレスを追加しました', emails: emails.slice() };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * removeEmailFromTeacher — GAS auth.js:567 の Workers 版
 * 現在のログイン中講師の emails 配列からメールアドレスを削除する。
 *
 * バリデーション（GAS 版と完全一致）:
 *   1. 空指定 → 「メールアドレスを指定してください」
 *   2. emails.length <= 1 → 「メールアドレスは最低1つ必要です…」
 *   3. emails に存在しない → 「このメールアドレスは登録されていません」
 *
 * 成功時:
 *   - emails から該当要素を splice
 *   - 削除対象が scalar staff.email と一致する場合、scalar も emails[0] に更新
 *   - staffs を部分更新（emails + 必要なら email + updated_at）
 *   - allowedUsers/{email} を削除（失敗は握り潰し）
 *
 * @param {Array} args [emailToRemove]
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, message, emails } | { success:false, error }
 */
export async function removeEmailFromTeacher(args, env, user) {
  try {
    let [emailToRemove] = args || [];
    emailToRemove = (emailToRemove || '').trim().toLowerCase();
    if (!emailToRemove) {
      return { success: false, error: 'メールアドレスを指定してください' };
    }

    // ログイン中の staff を解決
    const rows = await supabaseRpc(env, 'find_staff_by_auth', {
      p_uid: user.uid || null,
      p_email: user.email ? user.email.toLowerCase() : null
    });
    if (!rows || rows.length === 0) {
      return { success: false, error: '講師情報が見つかりません' };
    }

    const staff = staffFromSupabase(rows[0]);
    const teacherId = staff.teacherId || staff._id;

    // emails 配列を整備（レガシー後方互換）
    const emails = Array.isArray(staff.emails) && staff.emails.length > 0
      ? staff.emails.slice()
      : (staff.email ? [staff.email] : []);

    // 最低1件は残す
    if (emails.length <= 1) {
      return { success: false, error: 'メールアドレスは最低1つ必要です。削除する前に別のメールアドレスを追加してください' };
    }

    const idx = emails.indexOf(emailToRemove);
    if (idx === -1) {
      return { success: false, error: 'このメールアドレスは登録されていません' };
    }

    emails.splice(idx, 1);

    // スカラー email が削除対象だった場合、残りの先頭に更新
    const payload = { emails, updated_at: new Date().toISOString() };
    if (staff.email === emailToRemove) {
      payload.email = emails[0];
    }

    await supabaseUpdate(env, 'staffs', payload,
      'id=eq.' + encodeURIComponent(teacherId)
    );

    // allowedUsers からも削除（失敗しても成功扱い — GAS 版 auth.js:594-598 と同等）
    try {
      await firestoreDelete(env, 'allowedUsers', emailToRemove);
    } catch (fsErr) { /* allowedUsers 削除失敗は握り潰し */ }

    return { success: true, message: 'メールアドレスを削除しました', emails: emails.slice() };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
