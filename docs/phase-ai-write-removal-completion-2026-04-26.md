# AI write 系廃止 完了サマリー（2026-04-26）

> 作成日: 2026-04-26  
> 目的: AI write 系廃止フェーズの実施結果を記録する  
> 対象ブランチ: `claude/plan-ai-write-removal-kY56I`（main にマージ済）

---

## 1. 背景

Phase 6-B-04 で AI 講習エントリ操作（create/edit/delete）の Workers 化を試みたが、
以下の問題が発覚し中止・ロールバックした（詳細: `docs/phase-6b-04-completion-2026-04-26.md`）：

- 問題 1: `grade='13'`（数値コード）で保存される（AI プロンプト由来）
- 問題 2: 重複チェックなし
- 問題 3: `teacherId` 空（supabaseRpc 失敗）

OCR 行重なりを修正した上で、AI write 系そのものを廃止する方針に決定した。

---

## 2. 実施内容（5 コミット）

| commit | hash | 内容 |
|--------|------|------|
| 1 | `06e3dea` | Gemini プロンプトから AI write 系 action 削除 |
| 2 | `cc07f7e` | フロント dispatch + GAS executeAiAction 5 分岐削除 |
| 3 | `9aab597` | GAS AI write 本体関数を全削除 |
| 4 | `d38a13f` | workers-bridge.js 全削除 + Workers AI 5 関数 + router 登録削除 |
| 5 | 本コミット | 完了 doc 作成 |

---

## 3. 削除対象の一覧

### 3.1 features.js（GAS）

| 削除内容 | 行数（削除前） |
|---------|--------------|
| Gemini プロンプト write 系 5 action の定義 | 約 30 行 |
| [Lecture Schedule Entry Method] 第 3 選択肢「AIに直接入れてもらう」 | 3 行 |
| AI Capabilities「講習日程の登録」 | 1 行 |
| `executeAiAction` 内 write 系 6 分岐（Workers 経路含む） | 39 行 |
| `createLectureEntryAI_` | 42 行 |
| `createWeeklyLectureEntriesAI_` | 94 行 |
| `editLectureEntryAI_` | 45 行 |
| `deleteLectureEntryAI_` | 34 行 |
| `bulkLectureOperationsAI_` | 107 行 |
| `multiCampusBulkOperationsAI_`（完了サマリー未記載だが write 系ラッパー） | 22 行 |
| セクションヘッダー | 3 行 |

### 3.2 js-ai-actions.html（フロント）

| 削除内容 |
|---------|
| `executeConfirmedAiAction_` 内 write 系 5 分岐の execParams 構築（37 行） |
| 成功ハンドラ内の講習エントリキャッシュクリアブロック（25 行） |

### 3.3 workers/src/functions/features.js

| 削除内容 | 行数（削除前） |
|---------|--------------|
| Phase 6-B-04 セクションヘッダー + コメント | 10 行 |
| `_resolveAiLectureContext_` | 18 行 |
| `createLectureEntryAI` | 47 行 |
| `editLectureEntryAI` | 52 行 |
| `deleteLectureEntryAI` | 42 行 |
| `bulkLectureOperationsAI` | 97 行 |
| `createWeeklyLectureEntriesAI` | 97 行 |
| **合計** | **409 行** |

### 3.4 workers/src/router.js

- `import` から AI 5 関数を削除
- `INTERNAL_FUNCTIONS` から AI 5 エントリを削除（kv_* のみ残存）
- `INTERNAL_FUNCTIONS_NEED_USER` Set と参照ロジックを全削除
- `HANDLERS` マップから AI 5 関数を削除

### 3.5 workers-bridge.js

- ファイル全体を削除（156 行）
  - `callWorkersInternal_` / `shouldUseWorkersForAiAction_`
  - テストスタブ `_testCallWorkersInternal` / `_testCheckAllFlags` / `_flagOn_CREATE` / `_flagOff_CREATE`

### 3.6 ドキュメント

- `CLAUDE.md`: ファイル構成から `workers-bridge.js` の記述を削除
- `README.md`: ファイル構成から `workers-bridge.js` の記述を削除
- `FUNCTIONS-backend.md`: 削除済み AI write 5 関数の記述を削除・`executeAiAction` の説明を更新

---

## 4. 維持対象（削除しなかったもの）

| 対象 | 理由 |
|------|------|
| `executeAiAction` 関数本体 | submit_grade / submit_student / add_schedule / edit_schedule / delete_schedule は継続動作 |
| `parse_lecture_schedule`（OCR 経路） | 手動確認画面を通じた正常経路として維持 |
| `export_lecture_calendar` | read 系（ICS ダウンロード） |
| `lectureEntriesContext` の構築 | AI プロンプトの read 系照会で利用継続 |
| `getTeacherNamesMap` / `getOrCreateTeacherId` | 他箇所で利用継続 |
| `saveLectureScheduleEntries` / `getLectureScheduleEntries` | OCR・手動 UI で利用継続 |
| `firestoreTransaction`（Workers 共通基盤） | 他関数で利用継続 |

---

## 5. Phase 6-B-04 での未解決問題との対応

| 問題 | 対応 |
|------|------|
| 問題 1: `grade='13'`（AI プロンプト由来） | AI write 系廃止で **消滅** |
| 問題 2: 重複チェックなし | 手動 UI は警告表示・OCR は saveLectureScheduleEntries 経由。AI write 廃止で全経路カバー |
| 問題 3: `teacherId` 空（supabaseRpc 失敗） | AI write 系廃止で **消滅** |

---

## 6. KV フラグの扱い

`FF_AI_LECTURE_CREATE` 等 6 種は Cloudflare KV 上で unset 状態のまま放置。  
コード上の参照はすべて削除済みのため、実運用への影響はない。  
KV 上のキーは自然期限切れ待ち（または将来の整理時に削除）。

---

## 7. 関連ドキュメント

- `docs/phase-6b-04-completion-2026-04-26.md`（廃止決定の経緯）
- `docs/phase-6b-04-01-plan.md`（**中止**済み）
- `docs/phase-6b-04-02-plan.md`（**中止**済み）

---

**本ドキュメントの末尾**

AI write 系廃止フェーズ完了。講習エントリの登録は手動 UI と OCR の 2 経路のみになった。
