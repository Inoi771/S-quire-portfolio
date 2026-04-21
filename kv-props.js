// ========================================
// 【Phase 5-E-4】Workers KV プロキシ用 ScriptProperties ラッパー
// ========================================
//
// 役割:
//   GAS の PropertiesService.getScriptProperties().getProperty / setProperty /
//   deleteProperty を Workers 経由の Cloudflare KV 読み書きに置き換える。
//   既存呼出を機械的に置換するための薄いラッパー。
//
// 動作:
//   - 読み取り (getProperty_) : KV 優先 → 失敗時 ScriptProperties にフォールバック
//   - 書き込み (setProperty_) : KV と ScriptProperties の両方へ書く（Dual-write）
//                               → 5-E-6 で ScriptProperties 凍結するまでの移行期間は
//                                 フォールバック用の ScriptProperties を同期し続ける
//   - 削除     (deleteProperty_) : KV と ScriptProperties の両方から削除
//
// 認証:
//   Workers の KV プロキシは INTERNAL_API_KEY 共有シークレットで認証する。
//   このキーだけは ScriptProperties から直接取得する（ラッパー経由にすると無限ループ）。
//
// キャッシュ:
//   同一 GAS 実行（doGet / doPost / トリガー 1 回分）内で参照したキーは
//   インメモリにキャッシュする。KV の往復レイテンシを削る目的。
//   Firestore/Supabase の他フローでも同一実行内に複数回参照されるキー
//   （APP_FOLDER_ID / THEME_COLOR / ADMIN_EMAILS など）があるため有効。
//
// 範囲外:
//   - PropertiesService.getScriptProperties().getProperties()
//     および .getKeys() は Workers 側に 1 コール相当の API がないため、
//     引き続き ScriptProperties を直接参照する（Dual-write で同期済）。
//   - migrate-props-to-kv.js は移行スクリプト自身の都合で ScriptProperties を
//     直接読むため、このラッパーを使わない。
// ========================================

/**
 * Phase 5-E-4 ラッパー設定。
 * WORKERS_URL は gas-bridge.html / migrate-props-to-kv.js と同一値。
 */
var KV_PROPS_CONFIG = {
  WORKERS_URL: 'https://s-quire-api.square1995square.workers.dev',
  INTERNAL_API_KEY_PROP: 'INTERNAL_API_KEY'
};

// 同一実行内メモリキャッシュ（キー → 値）。null は「キー未設定」を示す
var _kvPropsCache_ = {};

// INTERNAL_API_KEY の取得結果を実行内で 1 回だけ ScriptProperties から取る
var _kvPropsApiKey_ = undefined;

/**
 * INTERNAL_API_KEY を ScriptProperties から直接取得する（キャッシュ付き）。
 * ラッパー経由にしない点が重要（Workers 呼出自身の認証に使うため）。
 * @return {string|null}
 * @private
 */
function _getInternalApiKey_() {
  if (_kvPropsApiKey_ === undefined) {
    try {
      _kvPropsApiKey_ = PropertiesService.getScriptProperties()
        .getProperty(KV_PROPS_CONFIG.INTERNAL_API_KEY_PROP) || null;
    } catch (e) {
      _kvPropsApiKey_ = null;
    }
  }
  return _kvPropsApiKey_;
}

/**
 * Workers の KV プロキシ API を叩く内部ヘルパー。
 * 失敗時は例外を投げる（呼出側で catch して SP フォールバックを実施）。
 * @param {string} functionName "kv_get" / "kv_set" / "kv_delete"
 * @param {Array}  args
 * @return {Object} Workers からのパース済みレスポンス
 * @private
 */
function _postToKvProxy_(functionName, args) {
  var apiKey = _getInternalApiKey_();
  if (!apiKey) {
    throw new Error('INTERNAL_API_KEY が ScriptProperties に未設定');
  }
  var response = UrlFetchApp.fetch(KV_PROPS_CONFIG.WORKERS_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      functionName: functionName,
      args: args || [],
      internalApiKey: apiKey
    }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) {
    throw new Error('Workers HTTP ' + code + ': ' + String(text).substring(0, 200));
  }
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Workers レスポンスパース失敗: ' + String(text).substring(0, 200));
  }
  if (parsed && parsed.__gasError) {
    throw new Error('Workers エラー: ' + parsed.__gasError);
  }
  return parsed;
}

/**
 * KV（→ 失敗時 ScriptProperties）から値を取得する。
 * 返り値は raw ScriptProperties の getProperty と同じく、未設定なら null、
 * 存在するなら文字列。呼出側で '' にコアースしたい場合は `(getProperty_(k) || '')` で。
 * @param {string} key プロパティキー
 * @return {string|null}
 */
function getProperty_(key) {
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(_kvPropsCache_, key)) {
    return _kvPropsCache_[key];
  }

  // KV 優先
  try {
    var res = _postToKvProxy_('kv_get', [key]);
    if (res && res.success) {
      var v = (res.value == null) ? null : String(res.value);
      _kvPropsCache_[key] = v;
      return v;
    }
    Logger.log('⚠ getProperty_: KV 応答異常（SP フォールバック）: ' + key + ' → ' + JSON.stringify(res));
  } catch (e) {
    Logger.log('⚠ getProperty_: KV 呼出失敗（SP フォールバック）: ' + key + ' → ' + e);
  }

  // ScriptProperties フォールバック（移行期間中の安全網）
  try {
    var sv = PropertiesService.getScriptProperties().getProperty(key);
    var fallback = (sv == null) ? null : String(sv);
    _kvPropsCache_[key] = fallback;
    return fallback;
  } catch (e2) {
    Logger.log('❌ getProperty_: SP 取得も失敗: ' + key + ' → ' + e2);
    return null;
  }
}

/**
 * KV と ScriptProperties の両方に値を書き込む（Dual-write）。
 * KV 書込が失敗しても、ScriptProperties への書込は継続する。
 * 両方失敗した場合のみ例外を投げる。
 * @param {string} key プロパティキー
 * @param {string} value 値（文字列。オブジェクトは事前に JSON.stringify すること）
 * @return {boolean} 少なくとも片方が成功した場合 true
 */
function setProperty_(key, value) {
  if (!key) return false;
  var v = (value == null) ? '' : String(value);

  // KV 書き込み
  var kvOk = false;
  try {
    var res = _postToKvProxy_('kv_set', [key, v]);
    kvOk = !!(res && res.success);
    if (!kvOk) {
      Logger.log('⚠ setProperty_: KV 応答異常: ' + key + ' → ' + JSON.stringify(res));
    }
  } catch (e) {
    Logger.log('⚠ setProperty_: KV 書込失敗（SP は継続）: ' + key + ' → ' + e);
  }

  // ScriptProperties 書き込み（移行期間中の整合性維持）
  var spOk = false;
  try {
    PropertiesService.getScriptProperties().setProperty(key, v);
    spOk = true;
  } catch (e2) {
    Logger.log('❌ setProperty_: SP 書込失敗: ' + key + ' → ' + e2);
    if (!kvOk) throw e2;
  }

  // キャッシュ更新（どちらか成功していれば値は信頼できる）
  if (kvOk || spOk) _kvPropsCache_[key] = v;
  return kvOk || spOk;
}

/**
 * KV と ScriptProperties の両方から値を削除する。
 * どちらかが失敗しても片方は試みる（best-effort）。
 * @param {string} key プロパティキー
 * @return {boolean} 少なくとも片方が成功した場合 true
 */
function deleteProperty_(key) {
  if (!key) return false;

  var kvOk = false;
  try {
    var res = _postToKvProxy_('kv_delete', [key]);
    kvOk = !!(res && res.success);
    if (!kvOk) {
      Logger.log('⚠ deleteProperty_: KV 応答異常: ' + key + ' → ' + JSON.stringify(res));
    }
  } catch (e) {
    Logger.log('⚠ deleteProperty_: KV 削除失敗（SP は継続）: ' + key + ' → ' + e);
  }

  var spOk = false;
  try {
    PropertiesService.getScriptProperties().deleteProperty(key);
    spOk = true;
  } catch (e2) {
    Logger.log('❌ deleteProperty_: SP 削除失敗: ' + key + ' → ' + e2);
  }

  // キャッシュから除去
  if (Object.prototype.hasOwnProperty.call(_kvPropsCache_, key)) {
    delete _kvPropsCache_[key];
  }
  return kvOk || spOk;
}
