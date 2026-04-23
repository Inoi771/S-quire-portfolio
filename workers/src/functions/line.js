// line.js 関連関数の Workers ポート
//
// Phase 6-A-8：Admin 専用の LINE 自己登録ユーザー一覧取得を Workers 化
//   - getLineRegisteredUsers  → Supabase `staffs` 読み取り（Admin のみ）
//
// Phase 6-A-9：校舎別 LINE 通知振り分け設定の取得／更新を Workers 化
//   - getCampusNotificationRouting    → Firestore `config/notification_routing`
//                                       + KV `prop:GRADES_CAMPUS_CODES_CONFIG`
//   - updateCampusNotificationRouting → Firestore `config/notification_routing`
//                                       書込 + Firestore `operationLogs` 監査ログ
//
// 実装方針（Phase 6-A-5 notifications.js / 6-A-7 ai-learning.js と同型）:
//   - Admin 判定は isAdminUser 経由の denyIfNotAdmin_ ヘルパー
//     （GAS line.js:499/536/562 と同一文言 'Admin のみアクセス可能' を返す）
//   - Supabase REST は既存の supabaseSelect のみ使用
//   - Firestore ヘルパー（firestoreGet / firestoreSet）は firebase.js の既存公開関数を使用
//   - 通知振り分け用の内部ヘルパー（getCampusRoutingMap_ / setCampusRoutingMap_ /
//     logAdminActionToFirestore / makeScheduleSafeId_）は notifications.js /
//     schedule-overrides.js と同じパターンでモジュール内にインライン定義する
//     （GAS line.js:29 / 43 / admin.js:90 / schedule.js:49 と厳密一致）

import { isAdminUser } from './auth.js';
import { supabaseSelect } from '../supabase.js';
import { firestoreGet, firestoreSet, firestoreDelete } from '../firebase.js';

const PROP_PREFIX = 'prop:';
const KEY_CAMPUS_CODES = 'GRADES_CAMPUS_CODES_CONFIG';
const KEY_LINE_SCHEDULER_SETTINGS = 'LINE_SCHEDULER_SETTINGS';
const KEY_FORM_EMAIL_SENDER       = 'FORM_EMAIL_SENDER';

// ─── LINE スケジューラのデフォルト設定（GAS line.js:1738-1742 と 1 字一句一致） ───
// Phase 6-A-17: 3 種別（shitsucho/meeting/report）のデフォルトテンプレート定数。
// 関数内で使う際は JSON.parse(JSON.stringify(LINE_SCHEDULER_DEFAULTS[t])) で
// deep copy すること（共有参照による mutation 防止）。
const LINE_SCHEDULER_DEFAULTS = {
  shitsucho: {
    recipients: [],
    messageTemplate_march: '新年度の継続申込書が未提出の場合は、3月{締切日}日({締切曜日})までに提出をお願いいたします。\nなお4月の引落データ送信は{引落日付}です。',
    messageTemplate_simple: '{翌月}月の引落データ送信は{引落日付}です。\nよろしくお願いいたします。',
    messageTemplate_default: '{翌月}月は{講習名}の引落があります。\n実施校舎で名簿が未提出の場合は{締切日付}までに提出をお願いいたします。\n外部生で振込用紙を郵送する場合は講習申込書の提出も合わせてお願いいたします。\nなお、{翌月}月の引落データ送信は{引落日付}です。',
    sendHour: 14
  },
  meeting: {
    recipients: [],
    messageTemplate: '明日{日付}は14時から北島校で正社員ミーティングがあります。\nよろしくお願いいたします。',
    sendHour: 16
  },
  report: {
    recipients: [],
    messageTemplate: '明日{日付}は{報告月}月分の回数報告書{講習追記}の提出日です。\nよろしくお願いいたします。',
    sendHour: 16
  }
};

// ─── Admin 判定ヘルパー（ai-learning.js:19 / schedule-overrides.js:95 と同一文言） ───
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─── Firestore config/notification_routing 読取（GAS line.js:29 と同等） ───
// notifications.js 内の同名 private helper と厳密一致。
async function getCampusRoutingMap_(env) {
  const doc = await firestoreGet(env, 'config', 'notification_routing');
  if (!doc) return {};
  const map = {};
  Object.keys(doc).forEach((k) => {
    if (k !== '_id' && k !== 'updatedAt') map[k] = doc[k];
  });
  return map;
}

// ─── Firestore config/notification_routing 書込（GAS line.js:43 と同等） ───
// updatedAt を付与してドキュメント全体を置換する（GAS setCampusRoutingMap_ と厳密一致）。
async function setCampusRoutingMap_(env, routingMap) {
  routingMap.updatedAt = new Date().toISOString();
  await firestoreSet(env, 'config', 'notification_routing', routingMap);
}

// ─── Firestore DocId 用 safe ID 変換（schedule-overrides.js:40 と同一） ───
function makeScheduleSafeId_(s) {
  return String(s || '').replace(/[^a-zA-Z0-9぀-鿿゠-ヿ]/g, '_').substring(0, 40);
}

// ─── 監査ログ書込（schedule-overrides.js:53 logAdminActionToFirestore と同一） ───
// GAS admin.js:90 `logAdminAction` の Workers 版（スプレッドシート記録は省略）。
// 失敗時はスローせずログ出力のみ（監査ログ失敗でメイン処理を止めない）。
async function logAdminActionToFirestore(env, action, details) {
  try {
    const now = new Date();
    const timestampMs = now.getTime();
    const docId = timestampMs + '_' + makeScheduleSafeId_(action);
    await firestoreSet(env, 'operationLogs', docId, {
      action: action || '',
      details: details || '',
      result: '成功',
      timestamp: now.toISOString(),
      operator: 'Workers'
    });
  } catch (error) {
    console.log('logAdminActionToFirestore エラー: ' + (error && error.toString ? error.toString() : error));
  }
}

/**
 * getLineRegisteredUsers — GAS line.js:498 の Workers 版
 *
 * LINE 経由で自己登録済みのユーザー一覧を取得する（Admin のみ）。
 * 通知振り分け設定 UI のドロップダウン用。
 * Supabase `staffs` から全スタッフを取得し、LINE 未登録ユーザーも候補に含める。
 * email の小文字化キーで重複排除する（GAS 版と同一ロジック）。
 *
 * GAS 版との差分: なし
 *
 * @param {Array} args 未使用
 * @return {Object} { success, users: [{teacherId, email, name, method, lineRegistered}] }
 *                  | { success:false, error }
 */
export async function getLineRegisteredUsers(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const rows = await supabaseSelect(env, 'staffs',
      'select=id,email,display_name,name,notification_method,line_user_id');

    const seenEmails = {};
    const users = (rows || [])
      .filter((row) => {
        const emailKey = (row.email || '').toLowerCase();
        if (!emailKey || seenEmails[emailKey]) return false;
        seenEmails[emailKey] = true;
        return true;
      })
      .map((row) => ({
        teacherId: row.id || '',
        email: row.email || '',
        name: row.display_name || row.name || '',
        method: row.notification_method || 'gmail',
        lineRegistered: !!row.line_user_id
      }));

    return { success: true, users };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-17】getFormEmailFilterSettings — GAS line.js:743 の Workers 版
 *
 * フォームメール自動転送の送信元フィルター設定を取得する（Admin のみ）。
 * KV `prop:FORM_EMAIL_SENDER` の単一文字列を返す（JSON 不要）。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, sender: string }  // 未設定時は sender: ''
 *   失敗: { success: false, error: <文言> }
 */
export async function getFormEmailFilterSettings(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const sender = (await env.KV.get(PROP_PREFIX + KEY_FORM_EMAIL_SENDER)) || '';
    return { success: true, sender };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-17】saveFormEmailFilterSettings — GAS line.js:761 の Workers 版
 *
 * フォームメール自動転送の送信元フィルター設定を保存する（Admin のみ）。
 * 空文字送信時は KV から削除（env.KV.put(key, '') ではなく env.KV.delete）。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, message: 'フィルター設定を保存しました' }
 *   失敗: { success: false, error: <文言> }
 *
 * @param {Array} args [sender: string]
 */
export async function saveFormEmailFilterSettings(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [sender] = args || [];
    const trimmed = String(sender || '').trim();
    if (trimmed) {
      await env.KV.put(PROP_PREFIX + KEY_FORM_EMAIL_SENDER, trimmed);
    } else {
      await env.KV.delete(PROP_PREFIX + KEY_FORM_EMAIL_SENDER);
    }
    return { success: true, message: 'フィルター設定を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getCampusNotificationRouting — GAS line.js:535 の Workers 版
 *
 * 校舎ごとの通知振り分け設定を全件取得する（Admin のみ）。
 * KV `prop:GRADES_CAMPUS_CODES_CONFIG` に登録された校舎すべてに対して、
 * 通知を受け取る講師ID配列を Firestore `config/notification_routing` から取り出し合成する。
 *
 * GAS 版との差分: なし
 *   - 非 Admin 時は {success:false, error:'Admin のみアクセス可能'}
 *   - 例外時は {success:false, error: error.toString()}
 *   - KV 未設定・パース失敗時は GAS 版と同じく空配列を起点とする
 *     （routing 配列が空で返る）
 *
 * @param {Array} args 未使用
 * @return {Object} { success, routing: [{code, name, teacherIds}] }
 *                  | { success:false, error }
 */
export async function getCampusNotificationRouting(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const routingMap = await getCampusRoutingMap_(env);
    const raw = await env.KV.get(PROP_PREFIX + KEY_CAMPUS_CODES);
    let campuses = [];
    if (raw) {
      try { campuses = JSON.parse(raw); } catch (_) { campuses = []; }
    }
    const routing = (campuses || []).map((campus) => ({
      code: campus.code,
      name: campus.name,
      teacherIds: routingMap[campus.code] || []
    }));
    return { success: true, routing };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * updateCampusNotificationRouting — GAS line.js:561 の Workers 版
 *
 * 指定した校舎の通知振り分け先講師ID一覧を更新する（Admin のみ）。
 * Firestore `config/notification_routing` の該当校舎キーを
 * 新しい teacherIds 配列で置換し、`logAdminActionToFirestore` で
 * 監査ログ（Firestore `operationLogs`）を記録する。
 *
 * GAS 版との差分: なし（監査ログは GAS のスプレッドシート記録に代わり
 * schedule-overrides.js と同型の Firestore operationLogs 書込）
 *
 * @param {Array} args [campusCode, teacherIds]
 * @return {Object} { success, message } | { success:false, error }
 */
export async function updateCampusNotificationRouting(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [campusCode, teacherIds] = args || [];
    if (!campusCode) return { success: false, error: '校舎コードを指定してください' };
    const routingMap = await getCampusRoutingMap_(env);
    routingMap[campusCode] = teacherIds || [];
    await setCampusRoutingMap_(env, routingMap);
    await logAdminActionToFirestore(env, '通知振り分け更新',
      '校舎コード: ' + campusCode + ', 受信者数: ' + (teacherIds || []).length);
    return { success: true, message: '通知振り分け設定を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-17】getLineSchedulerSettings — GAS line.js:1727 の Workers 版
 *
 * LINE スケジューラのデフォルト設定（宛先・メッセージテンプレート・送信時刻）を
 * 取得する（Admin のみ）。3 種別（shitsucho / meeting / report）のデフォルト値を
 * 補完して返す。
 *
 * 旧キー migration（方針 A-1）:
 *   `shimurocho`（旧キー）が残存している場合、インメモリで `shitsucho` に
 *   リネームする。**KV への書戻しはしない**（Phase 6-A-11 getPlacementTeacherNames
 *   と同じ方針・本番データは 1 年以上前から GAS 側で migration 発火済）。
 *   GAS 側 saveLineSchedulerSettings / checkAndSendDueLineMessages 等は
 *   引き続き migration ロジックを含むため、万一の旧キー残存時も GAS 側で吸収。
 *
 * デフォルト補完（GAS line.js:1743-1757 と 1:1 一致）:
 *   各種別について:
 *     - 種別自体が未設定 → デフォルト丸ごと（deep copy）
 *     - 存在する場合:
 *       - sendHour === undefined → デフォルト補完
 *       - recipients が falsy → [] 補完
 *       - messageTemplate* で始まるキーのうち undefined → デフォルト補完
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, settings: { shitsucho, meeting, report } }
 *   失敗: { success: false, error: <文言> }
 */
export async function getLineSchedulerSettings(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const json = await env.KV.get(PROP_PREFIX + KEY_LINE_SCHEDULER_SETTINGS);
    const settings = json ? JSON.parse(json) : {};

    // 旧キー互換: shimurocho のみの場合 shitsucho として扱う（KV 書戻しはしない）
    if (settings.shimurocho && !settings.shitsucho) {
      settings.shitsucho = settings.shimurocho;
      delete settings.shimurocho;
    }

    ['shitsucho', 'meeting', 'report'].forEach((t) => {
      const defaults = LINE_SCHEDULER_DEFAULTS[t];
      if (!settings[t]) {
        // deep copy で mutation 防止
        settings[t] = JSON.parse(JSON.stringify(defaults));
      } else {
        if (settings[t].sendHour === undefined) settings[t].sendHour = defaults.sendHour;
        if (!settings[t].recipients) settings[t].recipients = [];
        const dKeys = Object.keys(defaults);
        for (let i = 0; i < dKeys.length; i++) {
          const k = dKeys[i];
          if (k.indexOf('messageTemplate') === 0 && settings[t][k] === undefined) {
            settings[t][k] = defaults[k];
          }
        }
      }
    });

    return { success: true, settings };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-17】saveLineSchedulerSettings — GAS line.js:1771 の Workers 版
 *
 * LINE スケジューラの指定種別のデフォルト設定を保存する（Admin のみ）。
 * 種別単位で全置換（種別内のフィールド merge はしない・GAS 版と同一挙動）。
 *
 * 旧キー migration（方針 A-1）:
 *   **完全省略**。本番データは 1 年以上前から GAS 側 getLineSchedulerSettings /
 *   saveLineSchedulerSettings で migration 発火済。Workers 側では余分な分岐を
 *   持たない（Phase 6-A-11 の先例に沿う）。
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, message: '設定を保存しました' }
 *   失敗: { success: false, error: <文言> }
 *
 * @param {Array} args [type: string, newSettings: Object]
 */
export async function saveLineSchedulerSettings(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [type, newSettings] = args || [];
    const json = await env.KV.get(PROP_PREFIX + KEY_LINE_SCHEDULER_SETTINGS);
    const settings = json ? JSON.parse(json) : {};
    settings[type] = newSettings;
    await env.KV.put(PROP_PREFIX + KEY_LINE_SCHEDULER_SETTINGS, JSON.stringify(settings));
    return { success: true, message: '設定を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-18】deleteScheduledLineMessage — GAS line.js:1957 の Workers 版
 *
 * 指定 id の LINE スケジュールを Firestore `lineSchedules` から削除する（Admin のみ）。
 * 存在確認 → DELETE の 2 ステップ。
 *
 * 認証: denyIfNotAdmin_
 *
 * 戻り値形状（GAS 版完全一致）:
 *   成功: { success: true, message: '削除しました' }
 *   失敗（存在しない）: { success: false, error: '対象IDが見つかりません: ' + id }
 *   失敗（その他）: { success: false, error: <文言> }
 *
 * ※ エラー文言は半角コロン + 半角スペース + id の形式（GAS 版 L1961 と一致）
 *
 * @param {Array} args [id: string]
 */
export async function deleteScheduledLineMessage(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [id] = args || [];
    const existing = await firestoreGet(env, 'lineSchedules', id);
    if (!existing) return { success: false, error: '対象IDが見つかりません: ' + id };
    await firestoreDelete(env, 'lineSchedules', id);
    return { success: true, message: '削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-18】saveScheduledLineMessage — GAS line.js:1897 の Workers 版
 *
 * 指定 id の LINE スケジュールを Firestore `lineSchedules` に保存する（Admin のみ）。
 * 既存ドキュメントがあれば sent / sentAt / createdAt / lectureId / lectureName を
 * 維持しつつ他フィールドを上書き、無ければ新規追加。
 *
 * 認証: denyIfNotAdmin_
 *
 * 保持フィールド（GAS 版 L1905-1920 と完全一致）:
 *   - type / yearMonth    : data 優先、existing fallback、最終 ''
 *   - recipients          : data 優先、existing fallback、最終 []
 *   - scheduledAt         : data 優先、existing fallback、最終 ''
 *   - message             : **data.message !== undefined ? data.message : (existing.message || '')**
 *                           （三項式の順序が他フィールドと異なる・重要）
 *   - sent / sentAt       : 常に existing を維持（送信済フラグを書き換えない）
 *   - createdAt           : existing.createdAt or now
 *   - lectureId/Name      : existing にあれば維持（data 側は無視）
 *
 * shitsucho 同期書込（data.type === 'shitsucho' の場合・GAS L1937-1944 と一致）:
 *   KV `LINE_SCHEDULER_SETTINGS` を読取 → shitsucho.recipients のみ上書き
 *   → 旧キー shimurocho 残存なら削除 → KV 書戻し
 *
 *   ※ 直書きで実装（saveLineSchedulerSettings を呼ぶと messageTemplate 等を
 *     誤上書きするため再利用禁止）。Firestore 書込と KV 書込は直列実行
 *     （Promise.all 並列化せず GAS 版 1:1 一致優先）。
 *
 * 戻り値形状（GAS 版完全一致）:
 *   成功: { success: true, message: '保存しました' }
 *   失敗: { success: false, error: <文言> }
 *
 * @param {Array} args [data: {id, type, yearMonth, recipients, scheduledAt, message}]
 */
export async function saveScheduledLineMessage(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [data] = args || [];
    const docId = data.id;
    const existing = await firestoreGet(env, 'lineSchedules', docId);
    const now = new Date().toISOString();

    let saveData;
    if (existing) {
      saveData = {
        id: docId,
        type:        existing.type || data.type || '',
        yearMonth:   existing.yearMonth || data.yearMonth || '',
        recipients:  data.recipients || existing.recipients || [],
        scheduledAt: data.scheduledAt || existing.scheduledAt || '',
        message:     data.message !== undefined ? data.message : (existing.message || ''),
        sent:        existing.sent === true,
        sentAt:      existing.sentAt || '',
        createdAt:   existing.createdAt || now
      };
      // 講習締切メッセージは lectureId / lectureName を維持
      if (existing.lectureId)   saveData.lectureId   = existing.lectureId;
      if (existing.lectureName) saveData.lectureName = existing.lectureName;
    } else {
      saveData = {
        id: docId,
        type:        data.type || '',
        yearMonth:   data.yearMonth || '',
        recipients:  data.recipients || [],
        scheduledAt: data.scheduledAt || '',
        message:     data.message || '',
        sent:        false,
        sentAt:      '',
        createdAt:   now
      };
    }

    await firestoreSet(env, 'lineSchedules', docId, saveData);

    // shitsucho 同期書込（recipients のみ更新・直列実行）
    if (data.type === 'shitsucho') {
      const sRaw = await env.KV.get(PROP_PREFIX + KEY_LINE_SCHEDULER_SETTINGS);
      let sSettings = {};
      try { sSettings = sRaw ? JSON.parse(sRaw) : {}; } catch (_) { sSettings = {}; }
      if (!sSettings.shitsucho) sSettings.shitsucho = {};
      sSettings.shitsucho.recipients = data.recipients || [];
      if (sSettings.shimurocho) delete sSettings.shimurocho;
      await env.KV.put(PROP_PREFIX + KEY_LINE_SCHEDULER_SETTINGS, JSON.stringify(sSettings));
    }

    return { success: true, message: '保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
