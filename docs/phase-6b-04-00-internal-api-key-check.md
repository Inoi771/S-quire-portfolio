# Phase 6-B-04-00 P4: INTERNAL_API_KEY 設定状況の確認

> 作成日: 2026-04-24
> 目的: GAS→Workers 内部呼出で必要な `INTERNAL_API_KEY` が両側に正しく設定されていることを確認する
> リスク参照: 6.2.6（R6: GAS→Workers 認証コンテキスト引継ぎ）

---

## 0. なぜ確認が必要か

Phase 6-B-04 の AI lecture 5 関数を Workers 化すると、`executeAiAction`（GAS）が Workers 関数を呼ぶ際に **内部 API キー方式**で認証する必要がある。

呼出経路:
```
フロント
  → google.script.run.executeAiAction (GAS)
  → callWorkersInternal_('createLectureEntryAI', args, email, uid) (GAS)
  → UrlFetchApp.fetch(WORKERS_URL, { internalApiKey: '...', email, uid, args })
  → Workers router (env.INTERNAL_API_KEY と比較)
  → handler(args, env, { email, uid })
```

このチェーンが成立するには **GAS 側 ScriptProperties** と **Workers 側環境変数** の両方に同じ `INTERNAL_API_KEY` が設定されている必要がある。

---

## 1. 既存の使用状況（Phase 6-B-04 着手前）

`INTERNAL_API_KEY` は **既に本番稼働中**である（`kv-props.js:51-115` 参照）。
確認の根拠:

| 項目 | 確認内容 | 結論 |
|-----|---------|-----|
| GAS 側参照 | `kv-props.js:69-70` で `PropertiesService.getScriptProperties().getProperty('INTERNAL_API_KEY')` | 設定済み（本番で kv_get / kv_set が動作中） |
| Workers 側参照 | `workers/src/router.js:277` で `env.INTERNAL_API_KEY` | 設定済み（本番で kv_get / kv_set が動作中） |
| 一致確認 | KV 経由のすべてのプロパティ取得が成功している（`getAllScriptPropertiesForGUI` 等） | 両者一致確認済（一致しなければ kv_get が 401 で失敗していたはず） |

→ **Phase 6-B-04 で新たに設定する必要はない**。既存キーをそのまま流用できる。

---

## 2. 確認方法（実値は記録しない）

### 2.1 GAS 側（ScriptProperties）

GAS エディタ「プロジェクトの設定」→「スクリプト プロパティ」で `INTERNAL_API_KEY` の存在のみ確認:

- ✅ キーが存在し、値が空文字列でない
- ✅ 値の長さが 32 文字以上（推奨）

> **値そのものはドキュメントに記録しない**。コピー＆ペーストもしない。

### 2.2 Workers 側（Cloudflare Dashboard）

Cloudflare Dashboard → Workers & Pages → s-quire-api → Settings → Variables and Secrets で `INTERNAL_API_KEY` の存在のみ確認:

- ✅ Secret として登録済み（Type: Encrypted）
- ✅ wrangler.toml の `[vars]` セクションには記載されていない（Secret は Dashboard で別管理）

`wrangler.toml` の `[vars]` セクション（公開値のみ）:
```toml
[vars]
FIREBASE_WEB_API_KEY = "..."  # フロント公開値
```

Secret として登録されているもの（Dashboard 確認）:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- **`INTERNAL_API_KEY`** ← 本確認の対象

### 2.3 一致確認（軽量テスト）

両者が一致していることを確認する一番簡単な方法は、**既存の kv_get が動作していることの確認**:

1. GAS エディタで以下を実行:
   ```js
   function _testInternalApiKey() {
     return getProperty_('GEMINI_API_KEY') ? 'OK: KV 経由で取得成功' : 'NG: KV 取得失敗';
   }
   ```
2. 戻り値が `'OK: KV 経由で取得成功'` なら一致確認 OK

> 既に kv-props.js は本番で稼働中なので、このテストを **Phase 6-B-04 の着手前に再実行する必要はない**（既に毎回の起動で動作確認済）。
> 万が一 kv_get が失敗するようになった場合は別 Issue として対応。

---

## 3. Phase 6-B-04-00 ステップ4 で追加するヘルパー設計

### 3.1 GAS 側ヘルパー: `callWorkersInternal_(functionName, args, opts)`

既存の `_postToKvProxy_`（`kv-props.js:86-116`）と同じパターンで新規追加。**kv-props.js とは別ファイル**（依存関係を分離するため `code.js` 末尾 or `features.js` 末尾を想定。実装時に最終決定）。

設計案:

```js
/**
 * GAS から Workers の内部 API（INTERNAL_FUNCTIONS セット）を呼ぶ汎用ヘルパー。
 * INTERNAL_API_KEY + email + uid を body に埋込んで認証する。
 * Phase 6-B-04 で AI lecture 5 関数の Workers 化に伴い新設。
 *
 * @param {string} functionName Workers 側 router の関数名
 * @param {Array}  args         関数引数
 * @return {Object} Workers のパース済みレスポンス
 */
function callWorkersInternal_(functionName, args) {
  var apiKey = _getInternalApiKey_();  // kv-props.js の既存関数を再利用
  if (!apiKey) {
    throw new Error('INTERNAL_API_KEY が ScriptProperties に未設定');
  }

  // 認証コンテキスト（GAS の現在ユーザー）
  var email = '';
  try { email = getFirebaseEmailContext_() || ''; } catch (_) {}
  var uid = (typeof _firebaseUidContext_ !== 'undefined') ? _firebaseUidContext_ || '' : '';

  var response = UrlFetchApp.fetch(KV_PROPS_CONFIG.WORKERS_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      functionName: functionName,
      args: args || [],
      internalApiKey: apiKey,
      email: email,  // ← 追加: 既存の kv_get/kv_set には不要だが AI 関数には必要
      uid: uid       // ← 追加
    }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code !== 200) {
    throw new Error('Workers HTTP ' + code + ': ' + String(text).substring(0, 200));
  }
  return JSON.parse(text);
}
```

### 3.2 Workers 側 router 拡張: AI 関数のみ email/uid を user に組立てる

`workers/src/router.js:275-287` の INTERNAL_FUNCTIONS 分岐を拡張:

```js
const INTERNAL_FUNCTIONS = new Set([
  'kv_get', 'kv_set', 'kv_delete', 'kv_list',
  // Phase 6-B-04 で追加
  'createLectureEntryAI',
  'createWeeklyLectureEntriesAI',
  'editLectureEntryAI',
  'deleteLectureEntryAI',
  'bulkLectureOperationsAI'
  // multiCampusBulkOperationsAI は Phase 6-B-04-05 で追加
]);

// AI 関数は email/uid から user オブジェクトを組立てる必要がある
const INTERNAL_FUNCTIONS_NEED_USER = new Set([
  'createLectureEntryAI',
  'createWeeklyLectureEntriesAI',
  'editLectureEntryAI',
  'deleteLectureEntryAI',
  'bulkLectureOperationsAI'
]);

// ...router 内の認証ブロック
if (INTERNAL_FUNCTIONS.has(functionName)) {
  // INTERNAL_API_KEY 認証
  if (!internalApiKey || internalApiKey !== env.INTERNAL_API_KEY) {
    const err = new Error('内部APIキーが一致しません');
    err.status = 401;
    throw err;
  }
  // AI 関数は body から user を組立てる
  if (INTERNAL_FUNCTIONS_NEED_USER.has(functionName)) {
    user = {
      email: body.email || '',
      uid: body.uid || ''
    };
    if (!user.email && !user.uid) {
      const err = new Error('AI 関数の呼出に email/uid が必要です');
      err.status = 400;
      throw err;
    }
  }
}
```

### 3.3 セキュリティ上の留意点

| 項目 | 留意事項 |
|-----|---------|
| INTERNAL_API_KEY の取扱 | ログに出力しない（Logger.log / console.log で文字列に含めない） |
| email/uid の信頼レベル | Firebase ID トークン検証経由ではないため**「GAS が主張する値」**であり、Firebase の検証済 email/uid よりは信頼度が低い |
| 結果として | INTERNAL_API_KEY を持つのは GAS のみ（フロントには配布しない）。GAS が自ら正しい email/uid を渡すことを信頼する設計 |
| 漏洩リスク | INTERNAL_API_KEY が漏洩した場合、第三者が任意ユーザーに成り済まして AI 操作可能。鍵管理は GAS ScriptProperties + Cloudflare Secret の二重管理を継続 |

---

## 4. 動作確認チェックリスト

Phase 6-B-04-00 ステップ4 で `callWorkersInternal_` を追加した後（KV フラグ OFF のまま）:

- [ ] GAS エディタから `callWorkersInternal_('ping', [])` を実行 → 成功レスポンス（既存の ping 関数経由）
  - ※ ping は PUBLIC_FUNCTIONS なので INTERNAL_API_KEY 認証パスは通らないが、HTTP 経路の動作確認に使える
- [ ] GAS エディタから `callWorkersInternal_('kv_get', ['GEMINI_API_KEY'])` を実行 → 既存 kv_get と同じ結果
- [ ] エラーケース: `_kvPropsApiKey_` を一時的に無効化して呼出 → 「INTERNAL_API_KEY が未設定」例外
- [ ] エラーケース: 不正なキーを渡して呼出 → HTTP 401 + 「内部APIキーが一致しません」

> AI 関数本体の動作確認は Phase 6-B-04-01 以降のサブフェーズで実施。Phase 6-B-04-00 では**ヘルパーが正しく動作すること**のみ確認する。

---

## 5. 関連ドキュメント

- `docs/phase-6b-04-investigation.md` セクション 6.2.6（R6: 認証コンテキスト引継ぎ）
- `kv-props.js:60-116`（既存の `_getInternalApiKey_` / `_postToKvProxy_` パターン）
- `workers/src/router.js:120 / 275-287`（既存 INTERNAL_FUNCTIONS 分岐）
- `wrangler.toml`（公開 vars と Secret の管理境界）
- CLAUDE.md「Workers 直 KV アクセス（Phase 5-E-7〜）」

---

## 6. 確認結果（着手時に追記）

| 項目 | 確認日 | 確認者 | 結果 |
|-----|-------|-------|------|
| GAS ScriptProperties 設定 | _Phase 6-B-04-00 ステップ4 着手前にユーザーに確認_ | - | - |
| Cloudflare Secret 設定 | _同上_ | - | - |
| kv_get 動作確認 | _継続稼働中につき OK と推定_ | - | - |
