// ========================================
// 【supabase.js】Supabase REST API クライアント
// ========================================
// GAS から Supabase（PostgreSQL）へアクセスするための基盤ユーティリティ
// 成績データの読み書き・集計に使用
//
// 必要な Script Properties:
//   SUPABASE_URL         — Supabase プロジェクトURL（例: https://xxxxx.supabase.co）
//   SUPABASE_ANON_KEY    — anon（公開）キー（Settings > API から取得）
//   SUPABASE_SERVICE_KEY — service_role キー（Settings > API から取得）

// ========================================
// 内部ヘルパー
// ========================================

/**
 * Supabase設定を取得
 * @return {{url: string, serviceKey: string}}
 */
function getSupabaseConfig_() {
  var url = getProperty_('SUPABASE_URL');
  var serviceKey = getProperty_('SUPABASE_SERVICE_KEY');
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase設定が不完全です。Script Properties に SUPABASE_URL / SUPABASE_SERVICE_KEY を設定してください。'
    );
  }
  return { url: url.replace(/\/+$/, ''), serviceKey: serviceKey };
}

/**
 * 共通リクエストヘッダーを返す
 * GAS はサーバーサイドのため apikey・Authorization ともに service_role キーで統一する
 * （anon キーはブラウザクライアント用。GAS では不要）
 * @param {Object} config getSupabaseConfig_() の戻り値
 * @param {Object} [extra] 追加ヘッダー
 * @return {Object} ヘッダーオブジェクト
 */
function supabaseHeaders_(config, extra) {
  var headers = {
    'apikey': config.serviceKey,
    'Authorization': 'Bearer ' + config.serviceKey,
    'Content-Type': 'application/json'
  };
  if (extra) {
    var keys = Object.keys(extra);
    for (var i = 0; i < keys.length; i++) {
      headers[keys[i]] = extra[keys[i]];
    }
  }
  return headers;
}

// ========================================
// 基本 CRUD
// ========================================

/**
 * テーブルからデータを取得（SELECT）
 * PostgREST フィルタークエリをそのまま渡す
 * @param {string} table テーブル名（例: 'grades'）
 * @param {string} [query] PostgRESTクエリ文字列（例: 'fiscal_year=eq.2025&test_name=eq.テスト'）
 * @param {Object} [options] { limit, offset, order, select }
 * @return {Array} 結果の配列
 */
function supabaseSelect_(table, query, options) {
  var config = getSupabaseConfig_();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table);

  var params = [];
  if (query) params.push(query);
  if (options) {
    if (options.select) params.push('select=' + encodeURIComponent(options.select));
    if (options.order) params.push('order=' + encodeURIComponent(options.order));
    if (options.limit) params.push('limit=' + options.limit);
    if (options.offset) params.push('offset=' + options.offset);
  }
  if (params.length > 0) url += '?' + params.join('&');

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: supabaseHeaders_(config),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase SELECT エラー(' + code + '): ' + body);
  }
  return JSON.parse(body);
}

/**
 * テーブルにデータを挿入/更新（UPSERT）
 * 主キーの重複時はマージ更新する
 * @param {string} table テーブル名
 * @param {Object|Array} data 挿入するデータ（単一オブジェクトまたは配列）
 * @param {string} [onConflict] 競合解決カラム（デフォルト: 'id'）
 * @return {Array} 挿入/更新されたレコードの配列
 */
function supabaseUpsert_(table, data, onConflict) {
  var config = getSupabaseConfig_();
  var conflict = onConflict || 'id';
  var url = config.url + '/rest/v1/' + encodeURIComponent(table) +
            '?on_conflict=' + encodeURIComponent(conflict);

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: supabaseHeaders_(config, {
      'Prefer': 'resolution=merge-duplicates,return=representation'
    }),
    payload: JSON.stringify(Array.isArray(data) ? data : [data]),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase UPSERT エラー(' + code + '): ' + body);
  }
  return body ? JSON.parse(body) : [];
}

/**
 * テーブルのレコードを更新（UPDATE / PATCH）
 * PATCH は未指定カラムの既存値を保持するため、NOT NULL 違反を起こさない
 * （UPSERT は ON CONFLICT より先に NOT NULL チェックが発火するため要注意）
 * @param {string} table テーブル名
 * @param {Object} data 更新するフィールドのオブジェクト
 * @param {string} query PostgRESTフィルター（例: 'id=eq.xxx'）
 * @return {Array} 更新されたレコードの配列
 */
function supabaseUpdate_(table, data, query) {
  var config = getSupabaseConfig_();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table);
  if (query) url += '?' + query;

  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: supabaseHeaders_(config, {
      'Prefer': 'return=representation'
    }),
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase UPDATE エラー(' + code + '): ' + body);
  }
  return body ? JSON.parse(body) : [];
}

/**
 * テーブルからデータを削除（DELETE）
 * @param {string} table テーブル名
 * @param {string} query PostgRESTフィルター（例: 'id=eq.xxx'）
 * @return {Array} 削除されたレコードの配列
 */
function supabaseDelete_(table, query) {
  var config = getSupabaseConfig_();
  var url = config.url + '/rest/v1/' + encodeURIComponent(table);
  if (query) url += '?' + query;

  var response = UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: supabaseHeaders_(config, {
      'Prefer': 'return=representation'
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase DELETE エラー(' + code + '): ' + body);
  }
  return body ? JSON.parse(body) : [];
}

/**
 * RPCを実行（PostgreSQL関数を呼び出す）
 * @param {string} functionName 関数名（例: 'get_campus_averages'）
 * @param {Object} [params] パラメータオブジェクト（例: {p_year: 2025, p_test: 'テスト名'}）
 * @return {*} 関数の戻り値（JSONパース済み）
 */
function supabaseRpc_(functionName, params) {
  var config = getSupabaseConfig_();
  var url = config.url + '/rest/v1/rpc/' + encodeURIComponent(functionName);

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: supabaseHeaders_(config),
    payload: JSON.stringify(params || {}),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase RPC エラー(' + code + ', ' + functionName + '): ' + body);
  }
  return body ? JSON.parse(body) : null;
}

// ========================================
// バッチ操作
// ========================================

// ========================================
// Supabase Storage API
// ========================================

/**
 * Supabase Storage にファイルをアップロードする
 * @param {string} bucket バケット名
 * @param {string} path ファイルパス（バケット内、例: 'image.png'）
 * @param {byte[]} bytes バイト配列（Utilities.base64Decode の戻り値）
 * @param {string} mimeType MIMEタイプ（例: 'image/png'）
 * @param {boolean} [upsert=false] 同名ファイルを上書きするか
 */
function supabaseStorageUpload_(bucket, path, bytes, mimeType, upsert) {
  var config = getSupabaseConfig_();
  var url = config.url + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + path;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + config.serviceKey,
      'x-upsert': upsert ? 'true' : 'false'
    },
    contentType: mimeType,
    payload: bytes,
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code >= 400) {
    throw new Error('Supabase Storage アップロードエラー(' + code + '): ' + response.getContentText());
  }
}

/**
 * Supabase Storage のファイル一覧を取得する
 * @param {string} bucket バケット名
 * @param {string} [prefix=''] フォルダプレフィックス
 * @return {Array} ファイル情報の配列 [{name, id, metadata, ...}]
 */
function supabaseStorageList_(bucket, prefix) {
  var config = getSupabaseConfig_();
  var url = config.url + '/storage/v1/object/list/' + encodeURIComponent(bucket);
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + config.serviceKey
    },
    contentType: 'application/json',
    payload: JSON.stringify({
      prefix: prefix || '',
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase Storage 一覧エラー(' + code + '): ' + body);
  }
  return body ? JSON.parse(body) : [];
}

/**
 * Supabase Storage の署名付きURL（有効期限付き）を取得する
 * @param {string} bucket バケット名
 * @param {string} path ファイルパス（バケット内）
 * @param {number} [expiresIn=3600] 有効期限（秒）
 * @return {string} 署名付き完全URL
 */
function supabaseStorageSignedUrl_(bucket, path, expiresIn) {
  var config = getSupabaseConfig_();
  var url = config.url + '/storage/v1/object/sign/' + encodeURIComponent(bucket) + '/' + path;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + config.serviceKey
    },
    contentType: 'application/json',
    payload: JSON.stringify({ expiresIn: expiresIn || 3600 }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code >= 400) {
    throw new Error('Supabase Storage 署名付きURLエラー(' + code + '): ' + body);
  }
  var result = body ? JSON.parse(body) : {};
  var signedUrl = result.signedURL || result.signedUrl || '';
  if (!signedUrl) throw new Error('署名付きURLが空でした: ' + body);
  // 相対パスの場合はベースURLを付ける（Supabase は /object/sign/... を返すため /storage/v1 を補う）
  if (signedUrl.charAt(0) === '/') signedUrl = config.url + '/storage/v1' + signedUrl;
  return signedUrl;
}

/**
 * Supabase Storage からファイルを削除する
 * @param {string} bucket バケット名
 * @param {string[]} paths 削除するファイルパスの配列
 */
function supabaseStorageDelete_(bucket, paths) {
  var config = getSupabaseConfig_();
  var url = config.url + '/storage/v1/object/' + encodeURIComponent(bucket);
  var response = UrlFetchApp.fetch(url, {
    method: 'delete',
    headers: {
      'Authorization': 'Bearer ' + config.serviceKey
    },
    contentType: 'application/json',
    payload: JSON.stringify({ prefixes: paths }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code >= 400) {
    throw new Error('Supabase Storage 削除エラー(' + code + '): ' + response.getContentText());
  }
}

// ========================================
// バッチ操作
// ========================================

/**
 * 大量データを一括UPSERT（チャンク分割）
 * Supabaseのリクエストサイズ制限に対応して500件ずつ分割
 * @param {string} table テーブル名
 * @param {Array} dataArray データ配列
 * @param {string} [onConflict] 競合解決カラム（デフォルト: 'id'）
 * @return {Object} { success: boolean, total: number, errors: string[] }
 */
function supabaseBatchUpsert_(table, dataArray, onConflict) {
  var CHUNK_SIZE = 500;
  var errors = [];
  var total = dataArray.length;

  for (var i = 0; i < dataArray.length; i += CHUNK_SIZE) {
    var chunk = dataArray.slice(i, i + CHUNK_SIZE);
    try {
      supabaseUpsert_(table, chunk, onConflict);
    } catch (e) {
      errors.push('チャンク ' + Math.floor(i / CHUNK_SIZE) + ': ' + e.message);
    }
  }

  return {
    success: errors.length === 0,
    total: total,
    errors: errors
  };
}
