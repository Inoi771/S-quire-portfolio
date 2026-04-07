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
 * @return {{url: string, anonKey: string, serviceKey: string}}
 */
function getSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var anonKey = props.getProperty('SUPABASE_ANON_KEY');
  var serviceKey = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !serviceKey) {
    throw new Error(
      'Supabase設定が不完全です。Script Properties に SUPABASE_URL / SUPABASE_SERVICE_KEY を設定してください。'
    );
  }
  // anon キーが未設定の場合は service_role キーをフォールバックとして使用
  return { url: url.replace(/\/+$/, ''), anonKey: anonKey || serviceKey, serviceKey: serviceKey };
}

/**
 * 共通リクエストヘッダーを返す
 * apikey ヘッダーには anon キー、Authorization には service_role キーを使用
 * （service_role を apikey に使うとSupabaseがブラウザ使用と判定してブロックする）
 * @param {Object} config getSupabaseConfig_() の戻り値
 * @param {Object} [extra] 追加ヘッダー
 * @return {Object} ヘッダーオブジェクト
 */
function supabaseHeaders_(config, extra) {
  var headers = {
    'apikey': config.anonKey,
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
