// 講師メールアドレス管理 CRUD（GAS auth.js のメール管理 3 関数の Workers ポート）
// Phase 6-A-3: getTeacherEmails / addEmailToTeacher / removeEmailFromTeacher
// Phase 6-A-10: getAllowedUsers を追加（Admin 専用・ユーザー一覧表示）
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
//   - getAllowedUsers（6-A-10）は Admin 判定を isAdminUser で先に済ませ、
//     Supabase staffs の SELECT と KV `prop:ADMIN_EMAILS` のマージで
//     GAS auth.js:294-336 と同一ロジックを再現する
import { supabaseRpc, supabaseSelect, supabaseUpdate, staffFromSupabase } from '../supabase.js';
import { firestoreSet, firestoreDelete } from '../firebase.js';
import { isAdminUser, getAdminEmailList } from './auth.js';

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

/**
 * getAllowedUsers — GAS auth.js:294 の Workers 版（Phase 6-A-10）
 *
 * アプリアクセス可能ユーザーの一覧を返す（Admin のみ）。
 * Supabase `staffs` の登録スタッフを起点に、KV `prop:ADMIN_EMAILS` に含まれる
 * Admin メールをマージする：
 *   - staffs に含まれる Admin → role を '登録済み・Admin' に変更
 *   - staffs に含まれない Admin → role='Admin', teacherId='' の最小エントリを追加
 *
 * GAS 版との差分: なし
 *   - 非 Admin 時は {success:false, error:'Admin のみアクセス可能'}
 *   - Supabase 取得失敗時は try-catch で握り潰し、Admin メールのみから一覧を構築
 *     （GAS auth.js:313-315 と同等・Logger.log 相当を console.log で代替）
 *   - 例外時は {success:false, error: error.toString()}
 *   - usersMap のキーは GAS と同じく staffs.email は素のまま、Admin メールは
 *     小文字化した値を使う（GAS `adminEmails.map(...toLowerCase())` と一致）
 *
 * @param {Array} args 未使用
 * @param {Object} env Cloudflare Workers 環境
 * @param {Object} user 認証済みユーザー { email, uid }
 * @return {Object} { success, users: [{email, name, role, teacherId, subjects}] }
 *                  | { success:false, error }
 */
export async function getAllowedUsers(args, env, user) {
  if (!(await isAdminUser(env, user))) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    const usersMap = {};

    // Supabase staffs テーブルから登録スタッフを取得（失敗時は握り潰し）
    try {
      const allRows = await supabaseSelect(env, 'staffs',
        'select=id,email,display_name,name,subjects');
      (allRows || []).forEach((row) => {
        const staffEmail = row.email || '';
        if (!staffEmail) return;
        usersMap[staffEmail] = {
          email: staffEmail,
          name: row.display_name || row.name || '',
          role: '登録済み',
          teacherId: row.id || '',
          subjects: row.subjects || []
        };
      });
    } catch (staffErr) {
      console.log('⚠ getAllowedUsers: staffs 取得エラー: ' + staffErr);
    }

    // Admin メール（staffs に含まれない場合も表示）
    const adminEmails = await getAdminEmailList(env, { lowercase: true });
    adminEmails.forEach((adminEmail) => {
      if (usersMap[adminEmail]) {
        usersMap[adminEmail].role = usersMap[adminEmail].role + '・Admin';
      } else {
        usersMap[adminEmail] = { email: adminEmail, name: '', role: 'Admin', teacherId: '' };
      }
    });

    const users = Object.keys(usersMap).map((k) => usersMap[k]);
    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-19】getDisplayName_ — GAS auth.js:200 の Workers 版（純関数ヘルパー）
 *
 * メールアドレスから表示名を生成する。例: 'taro.tanaka@example.com' → 'Taro Tanaka'
 * DB ルックアップ一切なし。@ の前をピリオドで分割して各セグメントを Capitalize する。
 * catch 時は @ の前の文字列をそのまま返す。
 *
 * @param {string} userEmail
 * @returns {string}
 */
function getDisplayName_(userEmail) {
  try {
    const parts = String(userEmail || '').split('@')[0].split('.');
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  } catch (_) {
    return String(userEmail || '').split('@')[0];
  }
}

/**
 * 【Phase 6-A-19】getUserRoleInfo — GAS auth.js:171 の Workers 版
 *
 * 認証済みユーザーのロール情報（Admin 判定・表示名・メール・ラベル）を返す。
 * 起動時の Admin タブ表示制御・ログサブタブ・設定タブの API キー表示で使用。
 *
 * 認証: Firebase ID トークン検証のみ（Admin ガードなし・GAS 版踏襲）。
 *
 * Phase 6-B-01 で対応済み: isAdminUser が `prop:hiddenAdmin_{email}` を
 * 先にチェックするよう拡張されたため、本関数は自動的に隠し Admin 対応となる
 * （本関数のコードは変更不要）。activateHiddenAdminMode ハンドラも本ファイル
 * 末尾に追加済み。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { isAdmin, displayName, email, roleLabel: '🔐 Admin' or '👤 一般ユーザー' }
 *   失敗: { isAdmin: false, displayName: 'Unknown',
 *           email: 'unknown@example.com', roleLabel: '❌ エラー' }
 */
export async function getUserRoleInfo(args, env, user) {
  try {
    const email = (user && user.email) || '';
    const isAdmin = await isAdminUser(env, user);
    const displayName = getDisplayName_(email);
    return {
      isAdmin,
      displayName,
      email,
      roleLabel: isAdmin ? '🔐 Admin' : '👤 一般ユーザー'
    };
  } catch (error) {
    return {
      isAdmin: false,
      displayName: 'Unknown',
      email: 'unknown@example.com',
      roleLabel: '❌ エラー'
    };
  }
}

/**
 * 【Phase 6-B-01】activateHiddenAdminMode — GAS auth.js:130 の Workers 版
 *
 * 隠し管理者モードを有効化する（ロゴタップ認証からフロントエンドが呼び出す）。
 * パスワードが正しければ Workers KV `prop:hiddenAdmin_{email}` に
 * 値 `'true'` を TTL 21600 秒（6 時間）で書込む。
 *
 * GAS 版（auth.js:130-147）は CacheService.getScriptCache().put(..., 21600) で
 * 同一挙動を実現していた。Phase 6-B-01 で KV TTL に置換。
 *
 * 呼出元: js-core.html:1012（初回有効化）・js-core.html:1031（リロード時再設定）
 * 連動: isAdminUser（workers/src/functions/auth.js）が起動時に本キーを読む
 *
 * @param {Array} args [password] — パスワード文字列
 * @return {{ success: boolean, error?: string }}
 */
export async function activateHiddenAdminMode(args, env, user) {
  try {
    const password = (args && args[0]) || '';
    if (password !== 'inoiman') {
      return { success: false, error: 'パスワードが違います' };
    }
    const email = ((user && user.email) || '').toLowerCase();
    if (!email || email === 'unknown@example.com') {
      return { success: false, error: 'ユーザーを識別できません' };
    }
    await env.KV.put('prop:hiddenAdmin_' + email, 'true', { expirationTtl: 21600 });
    console.log('✓ 隠し管理者モード有効化:', email);
    return { success: true };
  } catch (error) {
    console.error('❌ activateHiddenAdminModeエラー:', error);
    return { success: false, error: error.toString() };
  }
}
