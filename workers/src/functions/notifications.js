// 通知設定 4 関数（GAS line.js の通知設定 get/set の Workers ポート）
// Phase 6-A-5: getNotificationSettings / updateNotificationSettings /
//              getLineSchedulerNotifPrefs / updateLineSchedulerNotifPref
//
// 実装方針（Phase 6-A-3 / 6-A-4 と同型パターン）:
//   find_staff_by_auth → supabaseUpdate（部分更新）
//   + 振り分け設定は firestoreGet('config', 'notification_routing') をインライン呼び出し
//   + shitsucho 受信者は firestoreQuery('lineSchedules', type=shitsucho) をインライン呼び出し
//
//   - Supabase staffs への書き込みは `supabaseUpdate` による部分更新を使用
//     （CLAUDE.md settings.js:109 の教訓、saveLecGrades / savePreferredCampuses
//      と同一パターン。B-⑭/⑯/⑰ の NOT NULL 違反を回避するため全件書き戻しは避ける）
//   - 新規ヘルパーは追加しない（getCampusRoutingMap_ / getShitsuchoRecipientsFromSheet_
//     相当はそれぞれの関数内でインライン実装）
//   - 戻り値形状は GAS 版と完全一致させる
import { supabaseRpc, supabaseUpdate, staffFromSupabase } from '../supabase.js';
import { firestoreGet, firestoreQuery } from '../firebase.js';

/**
 * 認証済みユーザーから Supabase staffs レコードを解決する内部ヘルパー
 * @return {Object|null} staff（camelCase）or null
 */
async function findStaffByUser_(env, user) {
  const rows = await supabaseRpc(env, 'find_staff_by_auth', {
    p_uid: user.uid || null,
    p_email: user.email ? user.email.toLowerCase() : null
  });
  return (rows && rows.length > 0) ? staffFromSupabase(rows[0]) : null;
}

/**
 * Firestore config/notification_routing を読み取り routingMap を返す内部ヘルパー
 * GAS 版 line.js:29 getCampusRoutingMap_ と同等
 * @return {Object} 校舎コード → 講師ID配列 のマップ
 */
async function getCampusRoutingMap_(env) {
  const doc = await firestoreGet(env, 'config', 'notification_routing');
  if (!doc) return {};
  const map = {};
  Object.keys(doc).forEach(k => {
    if (k !== '_id' && k !== 'updatedAt') map[k] = doc[k];
  });
  return map;
}

/**
 * Firestore lineSchedules から shitsucho 受信者 teacherId 一覧を取得する内部ヘルパー
 * GAS 版 line.js:872 getShitsuchoRecipientsFromSheet_ と同等（失敗時は空配列）
 * @return {Array<string>} teacherId の配列（重複排除済み）
 */
async function getShitsuchoRecipients_(env) {
  try {
    const docs = await firestoreQuery(env, 'lineSchedules', [
      { field: 'type', op: 'EQUAL', value: 'shitsucho' }
    ]);
    const recipients = [];
    docs.forEach(doc => {
      const arr = doc.recipients || [];
      arr.forEach(r => {
        if (r && recipients.indexOf(r) < 0) recipients.push(r);
      });
    });
    return recipients;
  } catch (e) {
    // GAS 版 line.js:883 と同等：Firestore 失敗時は空配列を返す
    return [];
  }
}

/**
 * getNotificationSettings — GAS line.js:223 の Workers 版
 *
 * お問い合わせ通知の設定（method / lineRegistered / 通知先メール一覧）を取得。
 * 認証済みユーザーの teacherId を find_staff_by_auth で解決し、振り分け設定
 * （config/notification_routing）に含まれるかを isEligible として返す。
 *
 * GAS 版との差分: なし（キャッシュ層 _staffCache_ は Workers 単発実行のため削除）
 *
 * @param {Array} args 未使用
 * @return {Object} { success, isEligible, method, lineRegistered, lineUserIdMasked,
 *                    registeredEmail, emails, notificationEmails }
 */
export async function getNotificationSettings(args, env, user) {
  try {
    const email = (user.email || '').toLowerCase();
    const staff = await findStaffByUser_(env, user);
    const teacherId = staff ? (staff.teacherId || staff._id) : '';

    // 通知振り分け設定に含まれているか（= 通知設定を表示するか）
    const routingMap = await getCampusRoutingMap_(env);
    const isEligible = Object.keys(routingMap).some(code => {
      const arr = routingMap[code] || [];
      return arr.indexOf(teacherId) !== -1;
    });

    // 通知方法（'none' 既存設定はデフォルト 'line' に戻す — GAS line.js:239 と同一）
    let method = (staff && staff.notificationMethod) ? staff.notificationMethod : 'line';
    if (method === 'none') method = 'line';

    const lineUserId = staff ? (staff.lineUserId || '') : '';
    const lineRegistered = !!lineUserId;
    const lineUserIdMasked = lineRegistered ? '****' + lineUserId.slice(-4) : '';

    // 登録メールアドレス
    const registeredEmail = (staff && staff.email) ? staff.email : email;

    // メールリスト（staffs.emails 配列があればそちらを使用、後方互換）
    let emails = [];
    if (staff && Array.isArray(staff.emails) && staff.emails.length > 0) {
      emails = staff.emails.slice();
    } else if (registeredEmail) {
      emails = [registeredEmail];
    } else if (email) {
      emails = [email];
    }

    // 現在の通知先メール（notificationEmails 配列 → notificationEmail → emails[0]）
    // GAS line.js:259-262 と同一フォールバック順
    let notificationEmails;
    if (staff && Array.isArray(staff.notificationEmails) && staff.notificationEmails.length > 0) {
      notificationEmails = staff.notificationEmails;
    } else if (staff && staff.notificationEmail) {
      notificationEmails = [staff.notificationEmail];
    } else {
      notificationEmails = emails.length > 0 ? [emails[0]] : [];
    }

    return {
      success: true,
      isEligible,
      method,
      lineRegistered,
      lineUserIdMasked,
      registeredEmail,
      emails,
      notificationEmails
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * updateNotificationSettings — GAS line.js:288 の Workers 版
 *
 * お問い合わせ通知の method ('gmail'/'line'/'both') を更新。
 * notificationEmail を指定された場合は staffs.notification_emails / notification_email
 * にも部分更新で保存する（後方互換のため scalar notification_email は配列先頭を入れる）。
 *
 * GAS 版との差分:
 *   - staff 未解決時は GAS では if(staff) で no-op、Workers では先頭で
 *     "講師情報が見つかりません" を返す（Phase 6-A-3/6-A-4 と同一の防御パターン）。
 *     実運用では find_staff_by_auth が空を返すのは認証不整合時のみのため影響軽微。
 *
 * @param {Array} args [method, notificationEmail]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function updateNotificationSettings(args, env, user) {
  try {
    const [method, notificationEmail] = args || [];
    const validMethods = ['gmail', 'line', 'both'];
    if (validMethods.indexOf(method) === -1) {
      return { success: false, error: '無効な通知方法です: ' + method };
    }

    const staff = await findStaffByUser_(env, user);
    if (!staff) {
      return { success: false, error: '講師情報が見つかりません' };
    }
    const teacherId = staff.teacherId || staff._id;

    // 通知振り分け設定に含まれているか確認
    const routingMap = await getCampusRoutingMap_(env);
    const isEligible = Object.keys(routingMap).some(code => {
      const arr = routingMap[code] || [];
      return arr.indexOf(teacherId) !== -1;
    });
    if (!isEligible) {
      return { success: false, error: 'このアカウントは通知設定の対象ではありません' };
    }

    // 部分更新 payload（method は必ず、notification_emails は method 条件時のみ）
    const payload = {
      notification_method: method,
      updated_at: new Date().toISOString()
    };

    if (notificationEmail && (method === 'gmail' || method === 'both')) {
      // カンマ区切り文字列 or 配列 → 配列として保存
      let emailArr = [];
      if (typeof notificationEmail === 'string') {
        emailArr = notificationEmail.split(',')
          .map(e => e.trim().toLowerCase())
          .filter(Boolean);
      } else if (Array.isArray(notificationEmail)) {
        emailArr = notificationEmail
          .map(e => String(e).trim().toLowerCase())
          .filter(Boolean);
      }
      if (emailArr.length > 0) {
        payload.notification_emails = emailArr;
        payload.notification_email = emailArr[0]; // 後方互換
      }
    }

    await supabaseUpdate(env, 'staffs', payload,
      'id=eq.' + encodeURIComponent(teacherId)
    );

    const methodLabel = { gmail: 'Gmailのみ', line: 'LINEのみ', both: 'Gmail + LINE 両方' };
    return {
      success: true,
      message: '通知方法を「' + (methodLabel[method] || method) + '」に変更しました'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getLineSchedulerNotifPrefs — GAS line.js:346 の Workers 版
 *
 * LINEスケジューラー通知方法設定を種別ごとに取得する。
 * meeting/report の eligibility は LINE 登録有無、shitsucho は Firestore
 * lineSchedules の受信者に含まれるかで判定する。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args 未使用
 * @return {Object} { success, lineRegistered, prefs, eligible, emails, schedulerNotifEmails }
 */
export async function getLineSchedulerNotifPrefs(args, env, user) {
  try {
    const staff = await findStaffByUser_(env, user);
    const teacherId = staff ? (staff.teacherId || staff._id) : '';
    const lineRegistered = !!(staff && staff.lineUserId);

    // 宛先はシート（Firestore lineSchedules）から読む
    const shitsuchoRecipients = await getShitsuchoRecipients_(env);
    const isShitsuchoRecipient = shitsuchoRecipients.indexOf(teacherId) >= 0;

    const eligible = {
      meeting: lineRegistered,
      report: lineRegistered,
      shitsucho: isShitsuchoRecipient
    };

    const myPrefs = (staff && staff.schedulerNotifPrefs) ? staff.schedulerNotifPrefs : {};
    const prefs = {
      meeting: myPrefs.meeting || 'line',
      report: myPrefs.report || 'line',
      shitsucho: myPrefs.shitsucho || 'line'
    };

    // メールアドレス一覧（チェックボックス表示用）
    let emails = [];
    if (staff && Array.isArray(staff.emails) && staff.emails.length > 0) {
      emails = staff.emails.slice();
    } else if (staff && staff.email) {
      emails = [staff.email];
    }

    const schedulerNotifEmails = (staff && staff.schedulerNotifEmails)
      ? staff.schedulerNotifEmails
      : {};

    return {
      success: true,
      lineRegistered,
      prefs,
      eligible,
      emails,
      schedulerNotifEmails
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * updateLineSchedulerNotifPref — GAS line.js:394 の Workers 版
 *
 * LINEスケジューラー通知方法を種別ごとに更新する。
 *   - meeting/report: LINE 未登録なら拒否
 *   - shitsucho: Firestore lineSchedules の受信者に含まれていなければ拒否
 * method が 'gmail'/'both' かつ notifEmails 指定時は scheduler_notif_emails も
 * 種別別に部分更新する（他種別の値は既存を維持）。
 *
 * GAS 版との差分:
 *   - staff 未解決時は "講師情報が見つかりません" を返す
 *     （updateNotificationSettings と同じ Phase 6-A-3/6-A-4 パターン）
 *
 * @param {Array} args [type, method, notifEmails]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function updateLineSchedulerNotifPref(args, env, user) {
  try {
    const [type, method, notifEmails] = args || [];
    const validTypes = ['meeting', 'report', 'shitsucho'];
    const validMethods = ['line', 'gmail', 'both', 'none'];
    if (validTypes.indexOf(type) === -1) {
      return { success: false, error: '無効な種別: ' + type };
    }
    if (validMethods.indexOf(method) === -1) {
      return { success: false, error: '無効な通知方法: ' + method };
    }

    const staff = await findStaffByUser_(env, user);
    if (!staff) {
      return { success: false, error: '講師情報が見つかりません' };
    }
    const teacherId = staff.teacherId || staff._id;
    const lineRegistered = !!staff.lineUserId;

    // 種別別 eligibility チェック
    if (type === 'meeting' || type === 'report') {
      if (!lineRegistered) {
        return { success: false, error: 'LINE未登録のため設定できません' };
      }
    } else if (type === 'shitsucho') {
      const shitsuchoRecipients = await getShitsuchoRecipients_(env);
      if (shitsuchoRecipients.indexOf(teacherId) < 0) {
        return { success: false, error: '設定権限がありません' };
      }
    }

    // scheduler_notif_prefs を種別別にマージして部分更新
    const newPrefs = Object.assign({}, staff.schedulerNotifPrefs || {});
    newPrefs[type] = method;

    const payload = {
      scheduler_notif_prefs: newPrefs,
      updated_at: new Date().toISOString()
    };

    // 種別ごとの通知先メール保存（method='gmail'|'both' のみ、それ以外は既存維持）
    if (notifEmails && (method === 'gmail' || method === 'both')) {
      let emailArr = [];
      if (typeof notifEmails === 'string') {
        emailArr = notifEmails.split(',')
          .map(e => e.trim().toLowerCase())
          .filter(Boolean);
      } else if (Array.isArray(notifEmails)) {
        emailArr = notifEmails
          .map(e => String(e).trim().toLowerCase())
          .filter(Boolean);
      }
      if (emailArr.length > 0) {
        const newEmails = Object.assign({}, staff.schedulerNotifEmails || {});
        newEmails[type] = emailArr;
        payload.scheduler_notif_emails = newEmails;
      }
    }

    await supabaseUpdate(env, 'staffs', payload,
      'id=eq.' + encodeURIComponent(teacherId)
    );

    const methodLabel = {
      line: 'LINEのみ',
      gmail: 'メールのみ',
      both: 'LINE+メール両方',
      none: '通知しない'
    };
    return {
      success: true,
      message: (methodLabel[method] || method) + 'に変更しました'
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
