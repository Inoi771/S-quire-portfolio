// ========================================
// workers-bridge.js
// ----------------------------------------
// GAS から Cloudflare Workers の内部 API 関数（INTERNAL_FUNCTIONS セット）を
// 呼ぶための共有ヘルパー。Phase 6-B-04 で新設。
//
// 責務:
//   - callWorkersInternal_(functionName, args)
//       GAS 内部から Workers の INTERNAL_FUNCTIONS 関数を呼ぶ汎用ルーター。
//       INTERNAL_API_KEY 認証 + 現在ユーザーの email / uid を body に埋込む。
//   - shouldUseWorkersForAiAction_(flagKey)
//       KV フィーチャーフラグが 'workers' に設定されているかを判定する。
//       fail-safe で未設定・エラー時は false（GAS 経路）。
//
// 依存:
//   - kv-props.js: _getInternalApiKey_ / KV_PROPS_CONFIG.WORKERS_URL / getProperty_
//   - auth.js:    getFirebaseEmailContext_
//   - settings.js: _firebaseUidContext_（グローバル変数）
//
// 設計背景:
//   - フロント → GAS executeAiAction → Workers という経路で AI 講習操作を
//     Workers 化するため、GAS 側から Workers 関数を呼ぶパスが必要。
//   - 認証は既存 kv_get / kv_set と同じ INTERNAL_API_KEY 共有シークレット方式を踏襲。
//   - AI 関数は teacherId 解決・権限チェックに email/uid が必要なため、
//     Workers 側 INTERNAL_FUNCTIONS_NEED_USER で body から user を組立てる。
//
// 関連ドキュメント:
//   - docs/phase-6b-04-investigation.md 6.2.6 (R6: 認証コンテキスト引継ぎ)
//   - docs/phase-6b-04-00-internal-api-key-check.md
//   - docs/phase-6b-04-00-ff-naming.md
// ========================================

/**
 * GAS から Workers の INTERNAL_FUNCTIONS 関数を呼ぶ汎用ヘルパー。
 * INTERNAL_API_KEY + email + uid を body に埋込んで認証する。
 *
 * ping のような PUBLIC_FUNCTIONS も呼出可能（internalApiKey は Workers 側で無視される）。
 * AI 関数呼出時は Workers 側 router で email/uid から user オブジェクトが組立てられる。
 *
 * @param {string} functionName Workers 側 router の関数名（例: 'createLectureEntryAI'）
 * @param {Array}  args         関数引数（Workers handler の第 1 引数に渡される）
 * @return {Object} Workers のパース済みレスポンス
 * @throws {Error} INTERNAL_API_KEY 未設定 / HTTP 非 200 / JSON パース失敗時
 */
function callWorkersInternal_(functionName, args) {
  var apiKey = _getInternalApiKey_();
  if (!apiKey) {
    throw new Error('INTERNAL_API_KEY が ScriptProperties に未設定');
  }

  var email = '';
  try { email = getFirebaseEmailContext_() || ''; } catch (_e1) {}
  var uid = '';
  try { uid = _firebaseUidContext_ || ''; } catch (_e2) {}

  var response = UrlFetchApp.fetch(KV_PROPS_CONFIG.WORKERS_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      functionName: functionName,
      args: args || [],
      internalApiKey: apiKey,
      email: email,
      uid: uid
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) {
    throw new Error('Workers HTTP ' + code + ': ' + String(text).substring(0, 200));
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Workers レスポンスパース失敗: ' + String(text).substring(0, 200));
  }
}

/**
 * KV フィーチャーフラグが 'workers' に設定されているかを判定する。
 * KV 取得失敗時・想定外の値の場合は false（GAS 経路フォールバック）。
 *
 * 対象フラグ（Phase 6-B-04）:
 *   FF_AI_LECTURE_CREATE  / FF_AI_LECTURE_EDIT    / FF_AI_LECTURE_DELETE
 *   FF_AI_LECTURE_BULK    / FF_AI_LECTURE_WEEKLY  / FF_AI_LECTURE_MULTI_CAMPUS
 *
 * @param {string} flagKey 'FF_AI_LECTURE_CREATE' など（prop: プレフィクス不要）
 * @return {boolean} 'workers' 経路を使う場合 true、それ以外（未設定・'gas'・エラー）false
 */
function shouldUseWorkersForAiAction_(flagKey) {
  try {
    return getProperty_(flagKey) === 'workers';
  } catch (e) {
    return false;
  }
}

// ========================================
// テストスタブ（Phase 6-B-04 クローズ時（Phase 6-B-04-06 完了時）に削除）
// ----------------------------------------
// 本節の 2 関数は Phase 6-B-04-00 ステップ2 の動作確認用。
// 実運用コードからは呼ばれない。GAS エディタから手動実行して使う。
// ========================================

/**
 * [Phase 6-B-04 クローズ時削除] Workers 疎通確認用スタブ。
 * ping 関数（PUBLIC_FUNCTIONS）経由で HTTP 経路のみ確認する。
 * 期待結果: { success: true, message: 'pong', ... } 相当
 */
function _testCallWorkersInternal() {
  return callWorkersInternal_('ping', []);
}

/**
 * [Phase 6-B-04 クローズ時削除] KV フラグ現状確認用スタブ。
 * 6 個の FF_AI_LECTURE_* キーを順に getProperty_ で取得して表示する。
 * Phase 6-B-04-00 時点では全キー (unset) が期待値。
 */
function _testCheckAllFlags() {
  var keys = [
    'FF_AI_LECTURE_CREATE',
    'FF_AI_LECTURE_EDIT',
    'FF_AI_LECTURE_DELETE',
    'FF_AI_LECTURE_BULK',
    'FF_AI_LECTURE_MULTI_CAMPUS',
    'FF_AI_LECTURE_WEEKLY'
  ];
  return keys.map(function(k) { return k + ' = ' + (getProperty_(k) || '(unset)'); }).join('\n');
}

/**
 * [Phase 6-B-04 クローズ時削除] FF_AI_LECTURE_CREATE を 'workers' に設定。
 * 戻り値は _testCheckAllFlags() の出力で反映確認用。
 * 実行後 2 分待機してから動作確認すること（KV 伝播）。
 */
function _flagOn_CREATE() {
  setProperty_('FF_AI_LECTURE_CREATE', 'workers');
  return _testCheckAllFlags();
}

/**
 * [Phase 6-B-04 クローズ時削除] FF_AI_LECTURE_CREATE を削除（GAS 経路に戻す）。
 * 緊急ロールバック用。実行後 2 分待機で全 node に伝播。
 */
function _flagOff_CREATE() {
  deleteProperty_('FF_AI_LECTURE_CREATE');
  return _testCheckAllFlags();
}
