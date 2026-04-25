# Phase 6-B-04 完了サマリー（2026-04-26）

> 作成日: 2026-04-26
> 目的: Phase 6-B-04 の最終結果を記録し、次フェーズ（AI write 系廃止）に引き継ぐ
> 対象ブランチ: `claude/phase-6b-04-ocr-fix-2026-04-26`（main にマージ済）

---

## 1. Phase 6-B-04 全体の経緯

### 1.1 当初計画（2026-04-23 開始）

- Phase 6-B-04-00 の準備調査（5 ファイル・1157 行）→ Phase 6-B-04-01 で AI 講習作成 5 関数を Workers 化する計画
- KV フラグ `FF_AI_LECTURE_CREATE` 等で段階的にトラフィック切替

### 1.2 中断（2026-04-25 深夜）

- Stage 2.1 試行（Admin カナリア 1 件作成）で **3 件の問題が発覚**:
  1. `grade='13'`（数値コード）で保存される（プロンプト指定の影響）
  2. **重複検出機能が動かない**（バックエンド・AI プロンプト共に重複チェックなし）
  3. `teacherId` が空文字（`_resolveAiLectureContext_` の supabaseRpc 失敗）
- 緊急ロールバック実施（`_flagOff_CREATE()` 実行・KV フラグ unset 復帰）
- テストエントリ Firebase Console で削除
- 詳細スナップショット: `docs/phase-6b-04-status-2026-04-25.md`

### 1.3 方針再検討（2026-04-26）

- Shinji さんからの追加情報: **OCR には既に「手動編集画面」が存在**
- H〜K の追加調査実施:
  - **H**: OCR 機能の詳細（手動編集画面・表形式・既存重複表示なし・`saveLectureScheduleEntries` 経由）
  - **I**: OCR 編集画面の改修可能性（小〜中規模）
  - **J**: AI 経路の確認画面追加可能性（パターン A/B/C 検討）
  - **K**: 改善案 1〜3 の整理
- **方針確定: 案 2 採用**
  - OCR のみ改善（行重なり問題を修正）
  - AI write 系は次フェーズで廃止
  - AI read 系（先生検索・自分のコマ等）は維持

### 1.4 「真の問題」の特定（Shinji さんによる修正）

当初は「重複データが保存される」が問題と認識していたが、Shinji さんの指摘で:
- 真の問題は **「カレンダー UI 上で同じ行に重なって表示される」**
- 手動 UI は `computeOverlapGroups()` で動的に lane 割当→ OCR/AI もこれを通れば自動的に解消する

調査の結果、OCR 経路は `lectureId` / `campusCode` 欠落により render フィルタを通過できない設計上の漏れが原因と判明。

---

## 2. 完了した修正

### 2.1 OCR 行重なり修正（C 案 = A + B 併用）

ブランチ: `claude/phase-6b-04-ocr-fix-2026-04-26`

| commit | hash | 内容 |
|--------|------|------|
| 1 | `68871d0` | OCR `creates` に `lectureId` / `campusCode` 追加（A 案-1） |
| 2 | `2d7166f` | OCR existing transform に `lectureId` / `campusCode` 追加（A 案-2） |
| 3 | `09b916b` | OCR 保存後にサーバー応答（`result.entries`）を採用（B 案） |

**計画書**: `docs/phase-6b-04-fix-plan-2026-04-26.md`

### 2.2 既存バグ 2 件修正（Phase A）

検証中に発見した、Apr 22 のリポジトリ作成時から潜伏していたバグ 2 件:

| commit | hash | 内容 |
|--------|------|------|
| 4 | `5962371` | bug 1 修正: `window.fitToScreen` 公開（IIFE 内に閉じ込められていた） |
| 5 | `503944e` | bug 2 修正: `getLectureScheduleEntries` 戻り値受取りを `Array.isArray(res)` パターンに（OCR cache miss 経路） |

**計画書**: `docs/phase-6b-04-existing-bugs-fix-2026-04-26.md`

### 2.3 検証結果（2026-04-26）

- **OCR 確認画面でエラー消失**: ✅ `fitToScreen is not defined` / `res.entries.map is not a function` 両方とも解消
- **同時刻 3 件 OCR 一括保存で別 lane 表示**: ✅ 計画通り 3 件すべてが縦に並んで表示される
- **「確認画面で 1 件しか表示されない」**: 既存の正常動作（講師の担当外科目登録防止）と判明・バグではない

---

## 3. 中止した作業（次フェーズに移管）

### 3.1 AI write 系の Workers 化（Phase 6-B-04-01・02）

| 関連ドキュメント | 状態 |
|---------------|-----|
| `docs/phase-6b-04-01-plan.md`（Stage 1 実施記録） | **中止**（末尾に追記済み） |
| `docs/phase-6b-04-02-plan.md`（edit Stage 並行 plan） | **中止**（末尾に追記済み） |

### 3.2 残った dead code（次フェーズで削除予定）

| ファイル | 内容 |
|---------|------|
| `features.js` create shim（76e3c10 で導入） | dead code として残置中（KV フラグ unset で GAS 経路稼働） |
| `workers/src/functions/features.js` の AI 5 関数 | dead endpoint として残置中（呼出されない） |
| `workers-bridge.js`（callWorkersInternal_ / shouldUseWorkersForAiAction_ / テストスタブ） | dead code として残置中 |
| KV フラグ `FF_AI_LECTURE_CREATE` 等 6 種 | unset 状態で残置（次フェーズで命名空間整理） |

### 3.3 残された問題（次フェーズで自動解消予定）

| 問題 | 解消条件 |
|-----|---------|
| 問題 1: `grade='13'`（AI プロンプト由来） | AI write 系廃止で消滅 |
| 問題 2: 重複チェックなし | 手動 UI / OCR は警告表示・AI 廃止で全経路カバー |
| 問題 3: `teacherId` 空（`_resolveAiLectureContext_` の supabaseRpc 失敗） | AI write 系廃止で消滅 |

---

## 4. 次フェーズ予告: AI write 系廃止

### 4.1 削除対象（次フェーズで実施・本フェーズでは触らない）

| # | 対象 | 理由 |
|---|------|------|
| 1 | `features.js`: `createLectureEntryAI_` / `editLectureEntryAI_` / `deleteLectureEntryAI_` / `createWeeklyLectureEntriesAI_` / `bulkLectureOperationsAI_`（5 関数） | AI write 系本体 |
| 2 | `js-ai-actions.html` の write 系アクション分岐（190-258 付近） | フロント dispatch |
| 3 | `workers/src/functions/features.js` の AI 5 関数 | Workers 側 dead endpoint |
| 4 | KV フラグ `FF_AI_LECTURE_CREATE` 等 6 種 | 不要 |
| 5 | `features.js` の Gemini プロンプト（write 系の指示部分） | 削除 |
| 6 | `workers-bridge.js`（callWorkersInternal_ / テストスタブ） | dead code |
| 7 | `features.js:3074-3431` の AI 講習エントリ個別 CRUD セクション全体 | 一括削除 |

### 4.2 維持対象（AI read 系・触らない）

- `features.js` の AI アシスタント read 系（先生検索・自分のコマ・カレンダーエクスポート等）
- `executeAiAction` の read 系分岐
- `lectureEntriesContext` の構築（プロンプトで利用継続）
- `getOrCreateTeacherId` / `getFirebaseEmailContext_` 等のヘルパー（admin.js / features.js 他で使用継続）

### 4.3 次フェーズの実施タイミング

- **別セッション**で仕切り直し
- 計画書は次フェーズ開始時に新規作成
- 削除は段階的に実施（read 系を破壊しないことを最優先）

---

## 5. 関連コミット履歴（時系列・Phase 6-B-04 全体）

| 日付 | コミット | 内容 |
|------|---------|------|
| 2026-04-23 01:31 | `f50c400` | Phase 6-B-04-00 P1-P5 docs 追加 |
| 2026-04-23 03:27 | `ceb3028` | Workers 5 関数実装（未接続） |
| 2026-04-23 03:49 | `1dd38aa` | `getFirebaseEmailContext_` pre-existing bug 修正 |
| 2026-04-23 04:13 | `6c6cb3e` | `workers-bridge.js` 新規作成（未接続） |
| 2026-04-23 04:30 | `76e3c10` | Phase 6-B-04-01 Stage 1: shim 差込（KV OFF） |
| 2026-04-23 05:00 | `775672c` | Phase 6-B-04-02 plan 作成（並行作業） |
| 2026-04-23 05:15 | `5e9018b` | テストスタブに Logger.log 追加 |
| 2026-04-25 深夜 | `edb55e9` | 中断時点スナップショット記録 |
| 2026-04-26 | `6e230e1` | OCR 行重なり修正 計画書 |
| 2026-04-26 | `eb52025` | 計画書に変数取得元・Before/After 追記 |
| 2026-04-26 | `68871d0` | **commit 1: OCR creates lectureId/campusCode 追加（A 案-1）** |
| 2026-04-26 | `2d7166f` | **commit 2: OCR existing transform lectureId/campusCode 追加（A 案-2）** |
| 2026-04-26 | `09b916b` | **commit 3: OCR 保存後にサーバー応答採用（B 案）** |
| 2026-04-26 | `c84e47e` | 既存バグ 2 件修正計画書（Phase A） |
| 2026-04-26 | `5962371` | **commit 4: fitToScreen を window に公開（既存 bug 1）** |
| 2026-04-26 | `503944e` | **commit 5: res.entries.map を Array.isArray パターンに修正（既存 bug 2）** |

太字 commit は本フェーズの本体修正（5 件）。すべて main にマージ済み（`merge-to-main.yml` 経由）。

---

## 6. 学び・反省

### 6.1 「真の問題」を特定する重要性

- 当初は「重複データ」を問題と認識していた
- 実際は「カレンダー UI 上の行重なり」が真の問題
- データ構造の調査が浅く、表面的な観察だけで判断していた
- → **次フェーズではデータ構造（field 構成・rendering ロジック）を最初に確認する**

### 6.2 既存バグの発見

- OCR 修正の検証で Apr 22 から潜伏していたバグ 2 件を発見
- これらは事前調査では気付けなかった
- → **修正後の検証では「修正範囲外」の挙動も観察対象とする**

### 6.3 ドキュメント先行のリスク管理

- Phase 6-B-04-01 / 02 の plan は実装前に作成され、結果として中止になった
- ただし「中止」が記録できることはドキュメントの価値を損なわない
- → **計画変更時は「中止」記録を明確に残し、git log と一致させる**

---

## 7. 関連ドキュメント

- `docs/phase-6b-04-status-2026-04-25.md`（中断時点スナップショット・本日 2026-04-26 追記済み）
- `docs/phase-6b-04-fix-plan-2026-04-26.md`（OCR 行重なり修正計画）
- `docs/phase-6b-04-existing-bugs-fix-2026-04-26.md`（既存バグ修正計画）
- `docs/phase-6b-04-investigation.md`（Phase 6-B-04 全体調査）
- `docs/phase-6b-04-01-plan.md`（**中止**・末尾追記済み）
- `docs/phase-6b-04-02-plan.md`（**中止**・末尾追記済み）
- `docs/phase-6b-04-00-*.md`（5 ファイル・準備調査）
- `docs/migration-plan.md`（プロジェクト全体 migration 計画）

---

**本ドキュメントの末尾**

Phase 6-B-04 完了。次フェーズ（AI write 系廃止）は別セッションで実施。
