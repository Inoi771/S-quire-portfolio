// ========================================
// 【Phase 5-E-3】ScriptProperties → Cloudflare KV 移行スクリプト
// ========================================
//
// 役割:
//   GAS の PropertiesService.getScriptProperties() に保存されている全プロパティを
//   Workers の KV プロキシ API 経由で Cloudflare KV に一括コピーする。
//   今回は「コピー」のみ。ScriptProperties 側は一切変更しない（5-E-6 で別途凍結）。
//
// 使い方:
//   1. ScriptProperties に `INTERNAL_API_KEY` を登録しておく（5-E-2 で
//      Cloudflare に登録した値と同一のもの）
//   2. GAS エディタで本ファイルを開き、関数 `migratePropertiesToKV` を選択して実行
//   3. 実行後、関数 `verifyPropertiesToKVDiff` を実行して差分を確認
//
// ログのマスク方針:
//   機微情報（API キー等）が値に含まれるため、値は平文で出力しない。
//   - キー名はログに出力する
//   - 値はマスクプレビュー（先頭2文字 + *** + 長さ）のみ出力する
//
// 依存:
//   - Workers 側: kv_get / kv_set / kv_list（Phase 5-E-1 実装済み）
//   - 本番 URL: gas-bridge.html の WORKERS_URL と同一値
// ========================================

/**
 * 移行スクリプト設定
 * ここをいじれば挙動を変えられる（原則編集不要）
 */
var KV_MIGRATION_CONFIG = {
  // Workers エンドポイント（gas-bridge.html の WORKERS_URL と同一）
  WORKERS_URL: 'https://s-quire-api.square1995square.workers.dev',
  // INTERNAL_API_KEY を格納する ScriptProperties キー名
  INTERNAL_API_KEY_PROP: 'INTERNAL_API_KEY',
  // 移行対象から除外するキー（ScriptProperties に残す・KV に送らない）
  //   - INTERNAL_API_KEY: 移行スクリプト自身の認証用。KV に入れても使わない
  EXCLUDED_KEYS: ['INTERNAL_API_KEY'],
  // kv_list の 1 ページ取得上限（Workers 側の上限 1000 と揃える）
  LIST_PAGE_LIMIT: 1000,
  // 無限ループ保険
  MAX_LIST_PAGES: 100
};

/**
 * 【メイン】ScriptProperties の全プロパティを KV にコピーする
 *
 * @return {Object} 実行結果サマリー
 *   {
 *     total:     全プロパティ数
 *     succeeded: KV への書込に成功した件数
 *     failed:    失敗件数
 *     skipped:   除外対象（EXCLUDED_KEYS に含まれるもの）
 *     failures:  [{ key, error }, ...] 失敗したキーの一覧
 *   }
 */
function migratePropertiesToKV() {
  var result = {
    total: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    failures: []
  };

  var apiKey = PropertiesService.getScriptProperties()
    .getProperty(KV_MIGRATION_CONFIG.INTERNAL_API_KEY_PROP);
  if (!apiKey) {
    throw new Error(
      'INTERNAL_API_KEY が ScriptProperties に未設定です。' +
      '事前に ScriptProperties に "' + KV_MIGRATION_CONFIG.INTERNAL_API_KEY_PROP + '" を登録してください。'
    );
  }

  var allProps = PropertiesService.getScriptProperties().getProperties();
  var keys = Object.keys(allProps);
  result.total = keys.length;

  Logger.log('=== KV 移行開始: ' + keys.length + ' 件のプロパティ ===');
  Logger.log('Workers URL: ' + KV_MIGRATION_CONFIG.WORKERS_URL);
  Logger.log('除外対象キー: ' + KV_MIGRATION_CONFIG.EXCLUDED_KEYS.join(', '));

  var startMs = Date.now();

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var progress = '[' + (i + 1) + '/' + keys.length + ']';

    if (KV_MIGRATION_CONFIG.EXCLUDED_KEYS.indexOf(key) !== -1) {
      Logger.log('⏭  ' + progress + ' スキップ: ' + key + '（除外対象）');
      result.skipped++;
      continue;
    }

    var value = allProps[key] == null ? '' : String(allProps[key]);
    var preview = maskKvValue_(value);

    try {
      var res = postToWorkersKV_('kv_set', [key, value], apiKey);
      if (res && res.success) {
        Logger.log('✓ ' + progress + ' ' + key + ' (' + preview + ')');
        result.succeeded++;
      } else {
        var errMsg = (res && res.error) || '不明なエラー（レスポンス: ' + JSON.stringify(res) + '）';
        Logger.log('❌ ' + progress + ' ' + key + ' 失敗: ' + errMsg);
        result.failed++;
        result.failures.push({ key: key, error: String(errMsg) });
      }
    } catch (e) {
      Logger.log('❌ ' + progress + ' ' + key + ' 例外: ' + e);
      result.failed++;
      result.failures.push({ key: key, error: String(e) });
    }
  }

  var elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  Logger.log('=== KV 移行完了（' + elapsedSec + ' 秒）===');
  Logger.log('合計: ' + result.total +
             '  成功: ' + result.succeeded +
             '  失敗: ' + result.failed +
             '  スキップ: ' + result.skipped);

  if (result.failures.length > 0) {
    Logger.log('--- 失敗キー一覧 ---');
    for (var k = 0; k < result.failures.length; k++) {
      Logger.log('  - ' + result.failures[k].key + ': ' + result.failures[k].error);
    }
  }

  return result;
}

/**
 * 【検証】ScriptProperties と KV の差分を確認する
 *
 * @return {Object} 差分結果
 *   {
 *     matched:      キー一致かつ値一致した件数
 *     onlyInProps:  ScriptProperties にしか無いキーの配列
 *     onlyInKV:     KV にしか無いキーの配列
 *     valueDiffs:   [{ key, propsPreview, kvPreview }, ...] 値が一致しなかったキー
 *     excluded:     除外対象として比較から除いたキーの配列
 *     kvListPages:  kv_list を叩いたページ数
 *   }
 */
function verifyPropertiesToKVDiff() {
  var result = {
    matched: 0,
    onlyInProps: [],
    onlyInKV: [],
    valueDiffs: [],
    excluded: [],
    kvListPages: 0
  };

  var apiKey = PropertiesService.getScriptProperties()
    .getProperty(KV_MIGRATION_CONFIG.INTERNAL_API_KEY_PROP);
  if (!apiKey) {
    throw new Error(
      'INTERNAL_API_KEY が ScriptProperties に未設定です。' +
      '事前に ScriptProperties に "' + KV_MIGRATION_CONFIG.INTERNAL_API_KEY_PROP + '" を登録してください。'
    );
  }

  Logger.log('=== 差分確認開始 ===');

  // 1) ScriptProperties 側を取得（除外キーを除く）
  var allProps = PropertiesService.getScriptProperties().getProperties();
  var propMap = {};
  Object.keys(allProps).forEach(function(k) {
    if (KV_MIGRATION_CONFIG.EXCLUDED_KEYS.indexOf(k) !== -1) {
      result.excluded.push(k);
      return;
    }
    propMap[k] = allProps[k] == null ? '' : String(allProps[k]);
  });
  Logger.log('ScriptProperties（除外後）: ' + Object.keys(propMap).length + ' 件');

  // 2) KV 側の全キーをページネーションで取得
  var kvKeySet = {};
  var cursor = null;
  while (true) {
    result.kvListPages++;
    var listRes = postToWorkersKV_(
      'kv_list',
      ['', cursor, KV_MIGRATION_CONFIG.LIST_PAGE_LIMIT],
      apiKey
    );
    if (!listRes || !listRes.success) {
      throw new Error('kv_list 失敗: ' + JSON.stringify(listRes));
    }
    var pageKeys = listRes.keys || [];
    for (var i = 0; i < pageKeys.length; i++) {
      kvKeySet[pageKeys[i].name] = true;
    }
    Logger.log('  kv_list ページ ' + result.kvListPages + ': ' + pageKeys.length + ' 件');
    if (listRes.list_complete) break;
    cursor = listRes.cursor;
    if (!cursor) break;
    if (result.kvListPages >= KV_MIGRATION_CONFIG.MAX_LIST_PAGES) {
      Logger.log('⚠ kv_list ページ数上限（' + KV_MIGRATION_CONFIG.MAX_LIST_PAGES + '）に達したため中断');
      break;
    }
  }
  Logger.log('KV: ' + Object.keys(kvKeySet).length + ' 件');

  // 3) キーの集合差分を算出
  Object.keys(propMap).forEach(function(key) {
    if (!kvKeySet[key]) result.onlyInProps.push(key);
  });
  Object.keys(kvKeySet).forEach(function(key) {
    if (!propMap.hasOwnProperty(key)) result.onlyInKV.push(key);
  });

  // 4) 共通キーの値比較
  Object.keys(propMap).forEach(function(key) {
    if (!kvKeySet[key]) return;
    try {
      var getRes = postToWorkersKV_('kv_get', [key], apiKey);
      if (!getRes || !getRes.success) {
        Logger.log('⚠ kv_get 失敗 ' + key + ': ' + JSON.stringify(getRes));
        result.valueDiffs.push({
          key: key,
          propsPreview: maskKvValue_(propMap[key]),
          kvPreview: '(kv_get 失敗)'
        });
        return;
      }
      var kvVal = getRes.value == null ? '' : String(getRes.value);
      if (kvVal === propMap[key]) {
        result.matched++;
      } else {
        result.valueDiffs.push({
          key: key,
          propsPreview: maskKvValue_(propMap[key]),
          kvPreview: maskKvValue_(kvVal)
        });
      }
    } catch (e) {
      Logger.log('⚠ kv_get 例外 ' + key + ': ' + e);
      result.valueDiffs.push({
        key: key,
        propsPreview: maskKvValue_(propMap[key]),
        kvPreview: '(例外: ' + e + ')'
      });
    }
  });

  Logger.log('=== 差分確認結果 ===');
  Logger.log('  値一致: ' + result.matched);
  Logger.log('  ScriptProperties のみ: ' + result.onlyInProps.length +
             (result.onlyInProps.length > 0 ? ' → ' + result.onlyInProps.join(', ') : ''));
  Logger.log('  KV のみ: ' + result.onlyInKV.length +
             (result.onlyInKV.length > 0 ? ' → ' + result.onlyInKV.join(', ') : ''));
  Logger.log('  値不一致: ' + result.valueDiffs.length);
  for (var j = 0; j < result.valueDiffs.length; j++) {
    var d = result.valueDiffs[j];
    Logger.log('    - ' + d.key + ' | props=' + d.propsPreview + ' | kv=' + d.kvPreview);
  }
  Logger.log('  除外（比較せず）: ' + result.excluded.join(', '));

  return result;
}

/**
 * Workers KV プロキシ API を叩く内部ヘルパー
 * INTERNAL_FUNCTIONS として扱われるため body.internalApiKey で認証される
 */
function postToWorkersKV_(functionName, args, apiKey) {
  var payload = {
    functionName: functionName,
    args: args || [],
    internalApiKey: apiKey
  };
  var response = UrlFetchApp.fetch(KV_MIGRATION_CONFIG.WORKERS_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) {
    throw new Error('HTTP ' + code + ': ' + String(text).substring(0, 300));
  }
  var parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('レスポンスパース失敗: ' + String(text).substring(0, 200));
  }
  if (parsed && parsed.__gasError) {
    throw new Error('Workers エラー: ' + parsed.__gasError);
  }
  return parsed;
}

/**
 * 値をログ出力する際のマスク処理。平文は絶対に出さない。
 */
function maskKvValue_(value) {
  if (value === null || value === undefined) return '(null)';
  var s = String(value);
  var len = s.length;
  if (len === 0) return '(空)';
  if (len <= 4) return '*** (長さ=' + len + ')';
  return s.substring(0, 2) + '*** (長さ=' + len + ')';
}
