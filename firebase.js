// ========================================
// 【firebase.js】Firestore クライアント
// ========================================
// GAS から Firestore REST API へアクセスするための基盤ユーティリティ
// 依存: code.js の isAdmin()
//
// 必要な Script Properties:
//   FIREBASE_PROJECT_ID    — Firebase プロジェクトID（例: fir-quire）
//   FIREBASE_CLIENT_EMAIL  — サービスアカウントのメール
//   FIREBASE_PRIVATE_KEY   — サービスアカウントの秘密鍵（PEM形式）

// ========================================
// 内部定数
// ========================================
var FIRESTORE_SCOPE_ = 'https://www.googleapis.com/auth/datastore';
var GOOGLE_TOKEN_URL_ = 'https://oauth2.googleapis.com/token';
var FIRESTORE_TOKEN_CACHE_KEY_ = 'FIRESTORE_ACCESS_TOKEN';

// ========================================
// 認証
// ========================================

/**
 * サービスアカウントJWTを生成してFirestoreアクセストークンを取得
 * CacheServiceで最大50分キャッシュ（トークン有効期限は1時間）
 * @return {string} アクセストークン
 */
function getFirestoreAccessToken_() {
  // キャッシュを確認
  var cache = CacheService.getScriptCache();
  var cached = cache.get(FIRESTORE_TOKEN_CACHE_KEY_);
  if (cached) return cached;

  var props = PropertiesService.getScriptProperties();
  var projectId  = props.getProperty('FIREBASE_PROJECT_ID');
  var clientEmail = props.getProperty('FIREBASE_CLIENT_EMAIL');
  var privateKey  = props.getProperty('FIREBASE_PRIVATE_KEY');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase設定が不完全です。Script Properties に ' +
      'FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY を設定してください。'
    );
  }

  // JWT ヘッダー（base64url）
  var header = Utilities.base64EncodeWebSafe(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT'
  })).replace(/=+$/, '');

  // JWT ペイロード（base64url）
  var now = Math.floor(Date.now() / 1000);
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    scope: FIRESTORE_SCOPE_,
    aud: GOOGLE_TOKEN_URL_,
    iat: now,
    exp: now + 3600
  })).replace(/=+$/, '');

  // RSA-SHA256 署名
  var signingInput = header + '.' + payload;
  var key = privateKey.replace(/\\n/g, '\n'); // ScriptProperties内の \n を実改行に変換
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(signingInput, key)
  ).replace(/=+$/, '');

  var jwt = signingInput + '.' + signature;

  // アクセストークン取得
  var response = UrlFetchApp.fetch(GOOGLE_TOKEN_URL_, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt,
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (!result.access_token) {
    throw new Error('Firestoreトークン取得失敗: ' + JSON.stringify(result));
  }

  // 50分キャッシュ（3000秒）
  cache.put(FIRESTORE_TOKEN_CACHE_KEY_, result.access_token, 3000);
  return result.access_token;
}

// ========================================
// URL ヘルパー
// ========================================

/**
 * FirestoreドキュメントのベースURLを返す
 * @return {string} ベースURL
 */
function firestoreBaseUrl_() {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  return 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';
}

/**
 * Firestore REST API のベースパス（commit/runQueryに使用）
 * @return {string} ベースパス（v1/projects/...）
 */
function firestoreBasePath_() {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  return 'projects/' + projectId + '/databases/(default)/documents';
}

// ========================================
// 基本 CRUD
// ========================================

/**
 * Firestoreにドキュメントを書き込む（upsert）
 * ドキュメントが存在しない場合は作成、存在する場合は全フィールドを上書き
 * @param {string} collection コレクション名
 * @param {string} docId      ドキュメントID
 * @param {Object} data       書き込むデータオブジェクト
 * @return {Object} Firestoreレスポンス
 */
function firestoreSet_(collection, docId, data) {
  var token = getFirestoreAccessToken_();
  var url = firestoreBaseUrl_() + '/' + collection + '/' + encodeURIComponent(docId);

  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ fields: toFirestoreFields_(data) }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Firestore書き込みエラー(' + code + '): ' + body);
  }
  return JSON.parse(body);
}

/**
 * Firestoreからドキュメントを1件取得
 * @param {string} collection コレクション名
 * @param {string} docId      ドキュメントID
 * @return {Object|null} データオブジェクト、存在しない場合は null
 */
function firestoreGet_(collection, docId) {
  var token = getFirestoreAccessToken_();
  var url = firestoreBaseUrl_() + '/' + collection + '/' + encodeURIComponent(docId);

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() === 404) return null;
  var doc = JSON.parse(response.getContentText());
  if (!doc.fields) return null;
  return fromFirestoreFields_(doc.fields);
}

/**
 * Firestoreドキュメントを削除
 * @param {string} collection コレクション名
 * @param {string} docId      ドキュメントID
 */
function firestoreDelete_(collection, docId) {
  var token = getFirestoreAccessToken_();
  var url = firestoreBaseUrl_() + '/' + collection + '/' + encodeURIComponent(docId);

  UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
}

// ========================================
// クエリ
// ========================================

/**
 * Firestoreコレクションをクエリで検索（全件取得またはフィルター付き）
 * @param {string} collection コレクション名
 * @param {Array}  [filters]  fsFilter_() で作成したフィルター配列（省略で全件取得）
 * @param {number} [limit]    取得上限件数（省略で無制限）
 * @return {Array} ドキュメント配列（各要素に _id フィールドを付加）
 */
function firestoreQuery_(collection, filters, limit) {
  var token = getFirestoreAccessToken_();
  var projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID');
  var url = 'https://firestore.googleapis.com/v1/projects/' + projectId +
            '/databases/(default)/documents:runQuery';

  var structuredQuery = {
    from: [{ collectionId: collection }]
  };

  if (filters && filters.length > 0) {
    structuredQuery.where = filters.length === 1
      ? filters[0]
      : { compositeFilter: { op: 'AND', filters: filters } };
  }

  if (limit) {
    structuredQuery.limit = limit;
  }

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ structuredQuery: structuredQuery }),
    muteHttpExceptions: true
  });

  var results = JSON.parse(response.getContentText());
  if (!Array.isArray(results)) return [];

  return results
    .filter(function(r) { return r.document && r.document.fields; })
    .map(function(r) {
      var data = fromFirestoreFields_(r.document.fields);
      data._id = r.document.name.split('/').pop(); // ドキュメントIDを付加
      return data;
    });
}

/**
 * Firestoreフィルター条件を作成するヘルパー
 * @param {string} field フィールド名
 * @param {string} op    演算子（'EQUAL' / 'LESS_THAN' / 'GREATER_THAN' / 'ARRAY_CONTAINS' 等）
 * @param {*}      value 比較値
 * @return {Object} firestoreQuery_() の filters 配列に渡せるオブジェクト
 */
function fsFilter_(field, op, value) {
  return {
    fieldFilter: {
      field: { fieldPath: field },
      op: op,
      value: toFirestoreValue_(value)
    }
  };
}

// ========================================
// バッチ書き込み（移行・一括処理用）
// ========================================

/**
 * Firestoreにドキュメントを一括書き込み（バッチコミット）
 * 500件ずつ分割して送信（Firestore上限対策）
 * @param {Array} writes オブジェクト配列。各要素: { collection, docId, data }
 *                       削除の場合: { collection, docId, delete: true }
 * @return {Object} { success: boolean, total: number, errors: string[] }
 */
function firestoreBatchWrite_(writes) {
  var token = getFirestoreAccessToken_();
  var basePath = firestoreBasePath_();
  var url = 'https://firestore.googleapis.com/v1/' + basePath + ':commit';

  var CHUNK_SIZE = 400; // Firestoreの上限500より余裕を持たせる
  var errors = [];
  var total = writes.length;

  for (var i = 0; i < writes.length; i += CHUNK_SIZE) {
    var chunk = writes.slice(i, i + CHUNK_SIZE);

    var body = {
      writes: chunk.map(function(w) {
        if (w.delete) {
          return { delete: basePath + '/' + w.collection + '/' + w.docId };
        }
        return {
          update: {
            name: basePath + '/' + w.collection + '/' + w.docId,
            fields: toFirestoreFields_(w.data)
          }
        };
      })
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code >= 400) {
      errors.push('バッチ' + (Math.floor(i / CHUNK_SIZE) + 1) + '失敗(HTTP ' + code + '): ' +
                  response.getContentText().substring(0, 200));
    }

    // レート制限対策（最終チャンク以外は待機）
    if (i + CHUNK_SIZE < writes.length) {
      Utilities.sleep(300);
    }
  }

  Logger.log(errors.length === 0
    ? '✓ firestoreBatchWrite_: ' + total + '件完了'
    : '❌ firestoreBatchWrite_: エラーあり - ' + errors.join(' / '));

  return { success: errors.length === 0, total: total, errors: errors };
}

// ========================================
// 型変換（JS ↔ Firestore）
// ========================================

/**
 * JSオブジェクトをFirestoreフィールド形式 { key: {型Value} } に変換
 * @param {Object} data 変換するオブジェクト
 * @return {Object} Firestoreフィールド形式
 */
function toFirestoreFields_(data) {
  var fields = {};
  Object.keys(data).forEach(function(key) {
    fields[key] = toFirestoreValue_(data[key]);
  });
  return fields;
}

/**
 * JS値をFirestore値形式に変換
 * @param {*} val 変換する値
 * @return {Object} Firestore値オブジェクト
 */
function toFirestoreValue_(val) {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(function(v) { return toFirestoreValue_(v); })
      }
    };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'object') {
    return { mapValue: { fields: toFirestoreFields_(val) } };
  }
  return { stringValue: String(val) };
}

/**
 * Firestoreフィールド形式 { key: {型Value} } をJSオブジェクトに変換
 * @param {Object} fields Firestoreフィールド形式
 * @return {Object} JSオブジェクト
 */
function fromFirestoreFields_(fields) {
  var obj = {};
  Object.keys(fields).forEach(function(key) {
    obj[key] = fromFirestoreValue_(fields[key]);
  });
  return obj;
}

/**
 * Firestore値形式をJS値に変換
 * @param {Object} val Firestore値オブジェクト
 * @return {*} JS値
 */
function fromFirestoreValue_(val) {
  if ('nullValue'      in val) return null;
  if ('booleanValue'   in val) return val.booleanValue;
  if ('integerValue'   in val) return parseInt(val.integerValue, 10);
  if ('doubleValue'    in val) return val.doubleValue;
  if ('stringValue'    in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue'     in val) {
    if (!val.arrayValue.values) return [];
    return val.arrayValue.values.map(function(v) { return fromFirestoreValue_(v); });
  }
  if ('mapValue' in val) {
    if (!val.mapValue.fields) return {};
    return fromFirestoreFields_(val.mapValue.fields);
  }
  return null;
}

// ========================================
// 接続テスト
// ========================================

/**
 * Firestore接続テスト（Admin のみ）
 * テスト用ドキュメントの書き込み・読み取り・削除を実行して動作確認する
 * @return {Object} { success: boolean, message: string }
 */
function testFirestoreConnection() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };
  try {
    var ts = new Date().toISOString();
    firestoreSet_('_test', 'ping', { message: 'hello', ts: ts });
    var data = firestoreGet_('_test', 'ping');
    firestoreDelete_('_test', 'ping');

    if (!data || data.message !== 'hello') {
      throw new Error('読み取った値が一致しません: ' + JSON.stringify(data));
    }

    Logger.log('✓ testFirestoreConnection: 接続OK');
    return { success: true, message: 'Firestore接続OK (' + ts + ')' };
  } catch (e) {
    Logger.log('❌ testFirestoreConnection: ' + e);
    return { success: false, error: e.toString() };
  }
}
