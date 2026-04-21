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
//   - PropertiesService.getScriptProperties().getKeys() は Workers 側に 1 コール
//     相当の API がないため、引き続き ScriptProperties を直接参照する（Dual-write
//     で同期済）。
//   - migrate-props-to-kv.js は移行スクリプト自身の都合で ScriptProperties を
//     直接読むため、このラッパーを使わない。
//
// Phase 5-E-5 追加:
//   - getAllProperties_() : kv_list + UrlFetchApp.fetchAll(kv_get) で全プロパティ
//     をまとめて取得するラッパー。ScriptProperties の getProperties() 互換。
//     KV 失敗時は SP 直読にフォールバック。INTERNAL_API_KEY のような SP-only キー
//     が抜け落ちないよう、正常時も SP とのユニオンで返す。
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

/**
 * 【Phase 5-E-5】Workers KV に保存された全プロパティをまとめて取得する。
 * 返り値は { key: value } のオブジェクト（ScriptProperties.getProperties() 互換）。
 *
 * 動作:
 *   1) KV 一次: kv_list で全キー列挙（ページネーション）→ UrlFetchApp.fetchAll で
 *      各キーの値を並列 kv_get（HTTP ラウンドトリップ節約）
 *   2) SP ユニオン: KV 経由で取れなかったキー（INTERNAL_API_KEY 等の KV 移行対象外）
 *      を ScriptProperties の値で補完
 *   3) KV 失敗時フォールバック: 例外時は ScriptProperties を直読して返す
 *
 * 主な利用者は Admin GUI の `getAllScriptPropertiesForGUI`。
 * 単一キー取得しか要らない呼出は `getProperty_` を使うこと。
 *
 * @return {Object<string, string>} キー→値のマップ
 */
function getAllProperties_() {
  var merged = {};
  var kvOk = false;

  try {
    var apiKey = _getInternalApiKey_();
    if (!apiKey) throw new Error('INTERNAL_API_KEY 未設定');

    // 1) kv_list で全キー列挙（ページネーション）
    var keyNames = [];
    var cursor = null;
    var pages = 0;
    var MAX_PAGES = 100;
    while (pages < MAX_PAGES) {
      pages++;
      var listRes = _postToKvProxy_('kv_list', ['', cursor, 1000]);
      if (!listRes || !listRes.success) {
        throw new Error('kv_list 失敗: ' + JSON.stringify(listRes));
      }
      (listRes.keys || []).forEach(function(k) { keyNames.push(k.name); });
      if (listRes.list_complete) break;
      cursor = listRes.cursor;
      if (!cursor) break;
    }

    // 2) 各キーの値を UrlFetchApp.fetchAll で並列取得
    if (keyNames.length > 0) {
      var requests = keyNames.map(function(k) {
        return {
          url: KV_PROPS_CONFIG.WORKERS_URL,
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify({
            functionName: 'kv_get',
            args: [k],
            internalApiKey: apiKey
          }),
          muteHttpExceptions: true
        };
      });
      var responses = UrlFetchApp.fetchAll(requests);
      for (var i = 0; i < responses.length; i++) {
        var name = keyNames[i];
        try {
          var code = responses[i].getResponseCode();
          var text = responses[i].getContentText();
          if (code !== 200) {
            Logger.log('⚠ getAllProperties_: kv_get HTTP ' + code + ' for ' + name);
            continue;
          }
          var parsed = JSON.parse(text);
          if (parsed && parsed.success) {
            var v = (parsed.value == null) ? '' : String(parsed.value);
            merged[name] = v;
            _kvPropsCache_[name] = v;
          } else {
            Logger.log('⚠ getAllProperties_: kv_get fail ' + name + ' → ' + JSON.stringify(parsed));
          }
        } catch (e) {
          Logger.log('⚠ getAllProperties_: kv_get parse fail for ' + name + ': ' + e);
        }
      }
    }
    kvOk = true;
  } catch (e) {
    Logger.log('⚠ getAllProperties_: KV 一次取得失敗（SP 直読にフォールバック）: ' + e);
  }

  // 3) SP 側をユニオン（または全フォールバック）
  try {
    var spProps = PropertiesService.getScriptProperties().getProperties();
    Object.keys(spProps).forEach(function(k) {
      if (kvOk) {
        if (!Object.prototype.hasOwnProperty.call(merged, k)) {
          merged[k] = spProps[k];
        }
      } else {
        merged[k] = spProps[k];
      }
    });
  } catch (e2) {
    Logger.log('❌ getAllProperties_: SP 読取失敗: ' + e2);
  }

  return merged;
}
