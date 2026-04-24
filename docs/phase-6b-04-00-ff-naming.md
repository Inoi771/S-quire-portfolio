# Phase 6-B-04-00 P5: KV フィーチャーフラグ命名規約

> 作成日: 2026-04-24
> 目的: Phase 6-B-04 段階移行で使う KV フィーチャーフラグの命名・値・運用手順を確定する
> 関連: 5.1 推奨案ハイブリッド方針 / 6.2.4（R4: KV 読取遅延・一時障害）/ 7.4 サブフェーズコミット構成

---

## 1. 命名規約

### 1.1 キー名

| 関数名（GAS） | KV キー名 | サブフェーズ |
|------------|----------|------------|
| `createLectureEntryAI_` | `prop:FF_AI_LECTURE_CREATE` | 6-B-04-01 |
| `editLectureEntryAI_` | `prop:FF_AI_LECTURE_EDIT` | 6-B-04-02 |
| `deleteLectureEntryAI_` | `prop:FF_AI_LECTURE_DELETE` | 6-B-04-03 |
| `bulkLectureOperationsAI_` | `prop:FF_AI_LECTURE_BULK` | 6-B-04-04 |
| `multiCampusBulkOperationsAI_` | `prop:FF_AI_LECTURE_MULTI_CAMPUS` | 6-B-04-05 |
| `createWeeklyLectureEntriesAI_` | `prop:FF_AI_LECTURE_WEEKLY` | 6-B-04-06 |

### 1.2 命名規約の理由

| 要素 | 規約 | 理由 |
|-----|-----|-----|
| プレフィクス `prop:` | 必須 | `workers/src/functions/kv.js` の `PROP_PREFIX` と一致（kv-props.js 経由のキーと同列に管理） |
| `FF_` | フィーチャーフラグ識別子 | 通常のプロパティ（`GEMINI_API_KEY` 等）と区別 |
| `AI_LECTURE_` | 機能カテゴリ | Phase 6-B-04 は AI 系講習エントリ操作。他の Phase で別カテゴリ（例: `FF_AI_GRADE_*`）が増えた時に区別容易 |
| 操作名（CREATE / EDIT / DELETE / BULK / MULTI_CAMPUS / WEEKLY） | 大文字スネーク | 既存の ScriptProperties 命名と統一（`GEMINI_API_KEY` 等） |

### 1.3 キー一覧（即コピー用）

```
prop:FF_AI_LECTURE_CREATE
prop:FF_AI_LECTURE_EDIT
prop:FF_AI_LECTURE_DELETE
prop:FF_AI_LECTURE_BULK
prop:FF_AI_LECTURE_MULTI_CAMPUS
prop:FF_AI_LECTURE_WEEKLY
```

---

## 2. 値の規約

### 2.1 取りうる値

| 値 | 意味 | デフォルト |
|----|-----|----------|
| `'workers'` | Workers 経路を使用 | - |
| `'gas'` | GAS 経路を使用 | - |
| **未設定（KV にキー不在）** | GAS 経路（後方互換） | ← デフォルト |
| その他の任意文字列 | GAS 経路（fail-safe） | - |

### 2.2 fail-safe の挙動

`shouldUseWorkersForAiAction_(flagKey)` は厳密に `'workers'` の場合のみ true を返す:

```js
function shouldUseWorkersForAiAction_(flagKey) {
  try {
    var v = getProperty_(flagKey);  // KV → SP フォールバック
    return v === 'workers';
  } catch (e) {
    return false;  // KV 障害時は GAS 経路
  }
}
```

**意図**:
- KV 取得が失敗した場合は GAS 経路（既存安定パス）にフォールバック
- 想定外の値（typo 等）でも GAS 経路に倒す
- `'workers'` に明示設定された時のみ Workers 経路へ切替

---

## 3. KV 書込・削除の手順

### 3.1 フラグ ON（Workers 経路に切替）

**前提**: Workers 側に該当関数の実装がデプロイ済（KV フラグ OFF のまま 3 日以上稼働）。

```bash
# Cloudflare wrangler CLI 経由（ユーザーの環境で実行）
wrangler kv key put --namespace-id=8dcb25efee404474a9e1f948d59bb477 "prop:FF_AI_LECTURE_CREATE" "workers"
```

または GAS エディタから:
```js
function _flagOn_create() {
  return setProperty_('FF_AI_LECTURE_CREATE', 'workers');
}
```

> ⚠️ `setProperty_` は kv-props.js の既存ラッパーを使う。引数のキーには `prop:` プレフィクスを**含めない**（ラッパーが内部で付与する）。

### 3.2 フラグ OFF（GAS 経路に戻す・ロールバック）

```bash
wrangler kv key delete --namespace-id=8dcb25efee404474a9e1f948d59bb477 "prop:FF_AI_LECTURE_CREATE"
```

または GAS エディタから:
```js
function _flagOff_create() {
  return deleteProperty_('FF_AI_LECTURE_CREATE');
}
```

または値を `'gas'` に変更:
```js
function _flagToGas_create() {
  return setProperty_('FF_AI_LECTURE_CREATE', 'gas');
}
```

> 削除と `'gas'` 設定は機能的に等価（fail-safe で両者とも GAS 経路）。
> **トラブル時の最速ロールバックは削除**（KV API 1 リクエストで即時反映）。

---

## 4. 反映時間の運用ルール

### 4.1 KV の eventually consistent

Cloudflare KV の書込はグローバル伝播に**最大 60 秒**かかる（リージョンによっては数秒〜十数秒で反映）。

### 4.2 推奨運用手順

| シナリオ | 待機時間 | 動作確認方法 |
|---------|---------|------------|
| フラグ ON 後の動作確認 | **2 分以上** | AI ウィジェットから対象操作を実行 → Workers ダッシュボードで該当関数のリクエスト数増加を確認 |
| フラグ OFF 後の動作確認 | **2 分以上** | AI ウィジェットから対象操作を実行 → GAS Apps Script ダッシュボードで該当関数の呼出を確認 |
| 緊急ロールバック | 即削除 | エラー報告後、即削除し、伝播完了まで 2 分は問題発生継続を許容（GAS 完全切替後に再確認） |

### 4.3 反映確認のクエリ

```js
// GAS エディタで現在の有効値を確認
function _checkAllFlags() {
  var keys = [
    'FF_AI_LECTURE_CREATE', 'FF_AI_LECTURE_EDIT', 'FF_AI_LECTURE_DELETE',
    'FF_AI_LECTURE_BULK', 'FF_AI_LECTURE_MULTI_CAMPUS', 'FF_AI_LECTURE_WEEKLY'
  ];
  return keys.map(function(k) { return k + ' = ' + (getProperty_(k) || '(unset)'); }).join('\n');
}
```

---

## 5. サブフェーズと有効化タイミング

| サブフェーズ | フラグキー | アクション | 期待結果 |
|------------|----------|-----------|---------|
| 6-B-04-00 | 全 6 個 | **未設定のまま**デプロイ | 全 AI 操作が GAS 経路（変化なし） |
| 6-B-04-01 | `prop:FF_AI_LECTURE_CREATE` | `'workers'` に設定 | createLectureEntry のみ Workers 経路 |
| 6-B-04-02 | `prop:FF_AI_LECTURE_EDIT` | `'workers'` に追加設定 | create + edit が Workers 経路 |
| 6-B-04-03 | `prop:FF_AI_LECTURE_DELETE` | `'workers'` に追加設定 | create + edit + delete が Workers 経路 |
| 6-B-04-04 | `prop:FF_AI_LECTURE_BULK` | `'workers'` に追加設定 | bulk も Workers 経路 |
| 6-B-04-05 | `prop:FF_AI_LECTURE_MULTI_CAMPUS` | `'workers'` に追加設定 | multi-campus も Workers 経路 |
| 6-B-04-06 | `prop:FF_AI_LECTURE_WEEKLY` | `'workers'` に追加設定 | weekly も Workers 経路（全 6 関数完了） |

各サブフェーズで **2-3 日の本番観測**を挟む（6-B-04-04 と 06 は **3-5 日 / 5-7 日**と長め）。

---

## 6. ロールバック判定基準（再掲）

`docs/phase-6b-04-investigation.md` セクション 7.5 から再掲。以下のいずれかが発生したら**該当フラグを即削除**:

- ABORTED エラー率が 5% を超える
- 戻り値メッセージの不一致がユーザーから報告される
- Firestore 書込で schema 不整合が検知される
- Workers レスポンス 90pct レイテンシが GAS の 2 倍超
- ユーザー数名から連続して AI 操作失敗の報告がある

ロールバック手順:
1. 該当フラグを KV から削除
2. 2 分待機（伝播完了）
3. AI ウィジェットから該当操作を実行 → GAS Apps Script ダッシュボードで GAS 関数の呼出を確認
4. ロールバックコミット作成（`git revert` ではなく KV 操作のみ・コードは変更しない）
5. Slack/対面でユーザーに報告

---

## 7. クリーンアップ手順（Phase 6-B-04 全完了後）

Phase 6-B-04-07（GAS 側 dead code 化）完了後、フラグ自体は**そのまま残置**する:

| フラグ | クリーンアップタイミング |
|-------|---------------------|
| `prop:FF_AI_LECTURE_*`（6 個） | Phase 6-B-04-08（GAS 側完全削除）と同タイミングで削除 |

**理由**: GAS 側 shim が残っている間はフラグも有効。完全削除時に shim とフラグを同時に消す。

クリーンアップ時のチェックリスト:
- [ ] GAS 側 shim 関数（`callWorkersInternal_('createLectureEntryAI', ...)`）を削除
- [ ] GAS 側 dead code（旧 `createLectureEntryAI_` 等）を削除
- [ ] KV から `prop:FF_AI_LECTURE_*` を 6 個削除
- [ ] 本ドキュメントに「クリーンアップ完了」を追記

---

## 8. KV キー設計の代替案検討（不採用理由）

### 8.1 単一フラグでまとめる案（不採用）

`prop:FF_AI_LECTURE_ALL` 1 個で 6 関数を一括切替。

**不採用理由**:
- 関数単位のロールバックができない（CLAUDE.md 段階移行原則違反）
- 7.5 ロールバック判定基準で「該当フラグのみ OFF」が不可能になり、巻添えで全 6 関数が GAS に戻る

### 8.2 関数名と完全一致させる案（不採用）

`prop:FF_createLectureEntryAI` のように関数名そのまま。

**不採用理由**:
- 関数名は `_` サフィックスで内部関数を示す慣習があるが、フラグキーには馴染まない
- 既存 KV キーは大文字スネーク（`GEMINI_API_KEY` 等）。命名統一性のため `FF_AI_LECTURE_*` が望ましい

### 8.3 値に JSON を入れる案（不採用）

`prop:FF_AI_LECTURE_CONFIG = {"create":"workers","edit":"gas",...}`

**不採用理由**:
- 1 個のキーで 6 関数管理できるが、JSON parse エラー時のフォールバックが複雑
- 部分書換の atomic 性が KV では保証されない（KV は楽観ロックなし）
- シンプルさ最優先で 6 個別キーに分離

---

## 9. 関連ドキュメント

- `docs/phase-6b-04-investigation.md` セクション 4.3（案 C 段階移行）/ 5.4 想定フロー / 7 段階移行順序
- `kv-props.js`（`getProperty_` / `setProperty_` / `deleteProperty_` の実装）
- `workers/src/functions/kv.js`（`PROP_PREFIX = 'prop:'` の定義元）
- CLAUDE.md「ScriptProperties アクセスはラッパー経由（Phase 5-E-4〜6）」
