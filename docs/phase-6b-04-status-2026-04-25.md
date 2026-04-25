# Phase 6-B-04 中断時点スナップショット（2026-04-25）

> 作成日: 2026-04-25 深夜
> 目的: Phase 6-B-04 関連の作業を一旦中断し、明日新しい会話で再開するための状態保全
> 次回再開時の最初に本ドキュメントを参照すること

---

## 1. 今夜実施した作業のサマリー

### 1.1 完了済みの作業

| # | 内容 | 関連コミット |
|---|-----|-----------|
| 1 | **Phase 6-B-04-00 クローズ** | 観測 4 時間で問題なし → 速度重視モード移行で即時クローズ判定 |
| 2 | **Phase 6-B-04-01 Stage 1 実装** | `76e3c10` `features.js` に create shim 差込 + `workers-bridge.js` に `_flagOn_CREATE` / `_flagOff_CREATE` スタブ追加 |
| 3 | **Phase 6-B-04-01 Stage 2.0 フラグ ON** | `_flagOn_CREATE()` 実行で `FF_AI_LECTURE_CREATE = workers` 設定（21:28 JST） |
| 4 | **Phase 6-B-04-01 Stage 2.1 試行** | Admin カナリア 1 件作成（subject='数学' / date='2026-07-14' / time='14:00' / grade='中1' / lectureId='2026-summer' / campusCode='04'）→ **問題 3 件発見** |
| 5 | **緊急ロールバック** | `_flagOff_CREATE()` 実行 → `FF_AI_LECTURE_CREATE = (unset)` 復帰 |
| 6 | **テストエントリ削除** | Firebase Console で手動削除完了 |
| 7 | **`getFirebaseEmailContext_` pre-existing bug 修正** | `1dd38aa` auth.js に getter 関数 4 行追加（AI 廃止後も他箇所で使用継続のため維持必須） |
| 8 | **Phase 6-B-04-02 plan 並行作成** | `775672c` `docs/phase-6b-04-02-plan.md`（speed mode 併用） |
| 9 | **テストスタブに Logger.log 追加** | `5e9018b` `_testCheckAllFlags` / `_testCallWorkersInternal` / `_flagOn_CREATE` / `_flagOff_CREATE` で実行ログ可視化 |

---

## 2. 発見された 3 つの問題（Stage 2.1 試行時）

### 問題 1: `grade` フィールド不整合

| 観点 | 内容 |
|-----|-----|
| 期待 | `grade='中1'`（既存 entries の慣習） |
| 実際 | `grade='13'`（数値コード）で保存された |
| 原因 | AI Gemini が grade を 2 桁コードに変換して送信。プロンプト仕様（features.js:470）に `code 13-18 for 中1-高3` の指定があり、AI はこれに従って数値で渡す |
| 影響 | 既存 entries の表示・分析・filter で grade 値の混在が起き、整合性が崩れる |

### 問題 2: 重複検出機能が動かない

| 観点 | 内容 |
|-----|-----|
| 検証内容 | 同一日時・同一講師・同一校舎の entry を 3 件連続作成試行 |
| 期待 | 2 件目以降が「時間重複」で reject される |
| 実際 | **3 件すべて Firestore に保存された** |
| 原因 | バックエンド `createLectureEntryAI_` / `saveLectureScheduleEntries` 共に重複チェックロジックなし。AI プロンプトにも重複検出指示なし |

### 問題 3: `teacherId` が空文字

| 観点 | 内容 |
|-----|-----|
| 期待 | Admin / 個人アカウントそれぞれの `teacherId` が `T<数字>_<英数>` 形式で保存される |
| 実際 | **両アカウントで `teacherId=''`（空文字）** |
| 原因（推定） | Stage 2.1 では Workers 経路を経由したが、`_resolveAiLectureContext_` 内の `supabaseRpc('find_staff_by_auth', ...)` の応答で `staff.teacherId` も `staff._id` も取得できなかった可能性。Phase 6-B-04-00 P1（teacherId parity）で残されていた検証が未完だった |
| 影響 | edit / delete の権限チェック（`existing.teacherId === myTid`）が機能しなくなる |

---

## 3. 判明した設計上の真実

### 3.1 手動 UI（カレンダー画面・js-lectures.html）

- **物理的に重複エントリ不可**: クリック仕様で同一セルに 2 件以上を入れられない
- **「学年重複」「講師重複」「回数不足」警告**: 画面上で表示されるが、**保存をブロックしない**（情報提示のみ）
- バックエンド関数（`saveLectureScheduleEntries` / `createLectureEntryAI_` 等）にも**重複チェックなし**

### 3.2 OCR 機能（Shinji さん情報・詳細未確認）

- **手動編集画面が存在する**: OCR 読取 → 確認・編集 → 保存というフロー
- 既存エントリとの**重複表示有無は未確認**
- 保存時に呼ぶバックエンド関数も未確認
- → 明日 H で詳細調査

### 3.3 AI アシスタント

- **確認応答**（`needsConfirmation: true` + `「はい」` で承認）はある
- しかし**重複情報・既存 entries の状況提示なし**
- そのまま保存実行すると重複・整合性違反が起きる

---

## 4. Claude Code の調査結果（本日実施）

> 詳細: `docs/phase-6b-04-investigation.md` / `docs/phase-6b-04-00-*.md` / 本日のセッション履歴

### 4.1 廃止アプローチ A/B/C 比較結果

- **A: 完全削除** — 推奨。5 commits / 約 2.5 時間。dead code ゼロ・KV フラグ削除
- B: プロンプト除外のみ — 不採用（dead code 残置）
- C: 関数本体に廃止エラー — 不採用（中途半端）

### 4.2 `getFirebaseEmailContext_` バグ修正（`1dd38aa`）

- **維持必須**
- 廃止後も使用継続箇所: `auth.js:22`（定義） / `admin.js:1391` / `features.js:1511, 1781`
- 廃止対象内の使用箇所（削除候補）: `features.js:3101, 3157, 3357` / `workers-bridge.js:52`

### 4.3 `gradeToSettingsKey` pre-existing bug

- **対応不要**（AI 廃止により bug 自体が消滅）
- 使用箇所は `createWeeklyLectureEntriesAI_`（廃止対象）内のみ
- 手動 UI（js-lectures.html）は `lp.gradeSettings[grade]` で直接参照しており bug の影響を受けない

### 4.4 ドキュメント整理方針

- **残置 + 「中止記録」追記推奨**
- 削除しない理由: 学びを未来に残す・git log と一致・再開判断材料

---

## 5. 方針再検討中（Shinji さんからの追加情報による）

### 5.1 当初の方針（A 完全削除）

AI / OCR write 系を全廃止する想定で進めていた。

### 5.2 追加情報（Shinji さん）

- **OCR には既に「手動編集画面」が存在**（OCR 読取 → 確認・編集 → 保存フロー）
- ただし重複表示有無は未確認

### 5.3 更新された方針

> 「OCR には修正が必要。同じ設計で AI アシスタントにも対応できるなら対応したい。
>  できないなら AI アシスタントについて講習の入力は諦める」

整理すると:

| 機能 | 方針 |
|-----|-----|
| OCR | **改善必須**（廃止しない）。既存編集画面に重複チェック等を追加 |
| AI アシスタント | OCR 同様の確認画面が**実装可能なら維持・不可能なら廃止** |

→ アプローチ A（完全削除）は**変更が必要**。AI 廃止判断は H-K の調査結果次第。

---

## 6. 明日新しい会話で実施する未完了調査（H-K）

### H. OCR 機能の詳細調査

調査対象:
- [ ] 手動編集画面の具体的な実装場所（ファイル・関数名）
- [ ] UI 仕様（フォーム形式 / カレンダー形式 / その他）
- [ ] 既存エントリとの重複表示有無
- [ ] 保存時に呼ぶバックエンド関数の特定
- [ ] 重複チェック機能の有無
- [ ] OCR が呼出すバックエンド関数の現状（saveLectureScheduleEntries 経由か独自か）

調査ファイル候補:
- `js-lectures.html`（手動UI 全般）
- `features.js`（OCR 関連: `parse_lecture_schedule` / `extractLectureScheduleFromText` 等）
- バックエンドの OCR 結果適用関数

### I. OCR 編集画面の改修可能性

調査対象:
- [ ] 重複チェック機能追加の工数見積もり
- [ ] 既存エントリと並べて表示する設計変更の工数
- [ ] 改修箇所のレベル（フロント／バックエンド／両方）

### J. AI アシスタントへの確認画面追加可能性

調査対象:
- [ ] 現状の確認応答（`needsConfirmation: true` + 「はい」承認）に重複警告を追加できるか
- [ ] バックエンド側で重複チェック → AI 応答に組込む設計の可否
- [ ] 改修工数の見積もり
- [ ] 技術的制約（Gemini API のコンテキスト長・レスポンス遅延等）

### K. 改善案の整理（案 1-3）

候補:
- 案 1: **OCR と AI 両方を改善**（OCR 編集画面 + AI 確認応答に重複警告追加）
- 案 2: **OCR のみ改善・AI は廃止**（H/I/J 結果次第）
- 案 3: **OCR 編集画面を手動UI カレンダーと統合**（OCR 結果を手動UI に流し込む設計）

各案について:
- メリット・デメリット
- 工数見積もり
- 本番影響
- ロールバック容易性

---

## 7. 現在のシステム状態

| 項目 | 状態 |
|-----|-----|
| KV フラグ `FF_AI_LECTURE_CREATE` | **(unset)**（GAS 経路稼働中） |
| KV フラグ他 5 件 | (unset)（最初から） |
| GAS `executeAiAction` create_lecture_entry shim（76e3c10） | dead code として残置中（フラグ unset のため GAS 経路に流れる） |
| Workers 版 5 関数（features.js / Phase 6-B-04-00 で実装） | dead endpoint として残置中（呼出されない） |
| `workers-bridge.js`（callWorkersInternal_ / shouldUseWorkersForAiAction_ / テストスタブ） | dead code として残置中 |
| `auth.js getFirebaseEmailContext_`（1dd38aa） | **稼働中**（admin.js / features.js:1511, 1781 で使用継続） |
| AI アシスタント講習作成機能（write 系 5 種） | 利用可能だが**問題 3 件あり**（Stage 2.1 で発見） |
| OCR 機能 | 通常稼働中（重複チェック有無は明日 H で確認） |
| 手動 UI（カレンダー） | 通常稼働中（クリック仕様で重複防止・ただし警告は表示のみ） |
| 本番への影響 | **なし** |
| スタッフへの影響 | **なし** |

---

## 8. 重要な関連コミット履歴（本日分・時系列）

| コミット | 時刻（JST） | 内容 |
|---------|-----------|------|
| `f50c400` | 01:31 | Phase 6-B-04-00 P1-P5 docs 追加（5 ファイル・1157 行） |
| `ceb3028` | 03:27 | Workers 5 関数実装（未接続） |
| `1dd38aa` | 03:49 | `getFirebaseEmailContext_` pre-existing bug 修正（auth.js +4 行） |
| `689c85d` | 〜04:00 | カウンター 44→45 |
| `6c6cb3e` | 〜04:13 | `workers-bridge.js` 新規作成（未接続） |
| `76e3c10` | 〜04:30 | Phase 6-B-04-01 Stage 1: shim 差込（KV OFF） |
| `775672c` | 〜05:00 | Phase 6-B-04-02 plan 作成（並行作業） |
| `5e9018b` | 〜05:15 | テストスタブに Logger.log 追加 |

> ↑↑↑ 上記コミットは全て `claude/review-investigation-doc-mU4BT` ブランチ → `merge-to-main.yml` で main に自動マージ済。
> ロールバックする場合は対象コミットを `git revert` で個別に戻す。

---

## 9. 明日の新しい会話で再開する手順

1. **Shinji さんから「Phase 6-B-04 再開」の合図**
2. Claude が**本ドキュメント `docs/phase-6b-04-status-2026-04-25.md` を最初に読み込む**
3. **未完了調査 H-K から開始**
   - H: OCR 機能の詳細調査
   - I: OCR 編集画面の改修可能性
   - J: AI アシスタントへの確認画面追加可能性
   - K: 改善案 1-3 の整理
4. 調査結果を踏まえて**方針確定**（案 1 / 2 / 3 のいずれか）
5. 確定後に**コード修正着手**

### 推奨: 調査着手前に確認すること

- 本日のロールバック後、**`_testCheckAllFlags()` で `FF_AI_LECTURE_CREATE = (unset)` 維持**を再確認
- 本日のテストエントリが完全に削除されていることを Firebase Console で再確認
- 既存 AI 機能（read 系含む）が問題なく動作していること

---

## 10. 重要な未決定事項

| # | 未決定事項 | 決定タイミング |
|---|---------|------------|
| 1 | **OCR 改善 + AI 改善の両立は可能か?**（技術的制約・工数次第） | H-K 調査結果後 |
| 2 | 不可能なら **AI のみ廃止** か | 1 が「不可」なら確定 |
| 3 | OCR の重複チェックはどこに実装するか?（バックエンド / UI / 両方） | I 調査結果後 |
| 4 | `gradeToSettingsKey` の修正範囲（AI 廃止なら不要・OCR 経路で必要なら修正必須） | H 調査で OCR が gradeToSettingsKey を使うか判明後 |
| 5 | 本日作成した `docs/phase-6b-04-01-plan.md` / `docs/phase-6b-04-02-plan.md` の取扱い（中止記録 / 案 1 採用なら継続記録） | 方針確定後 |

---

## 11. 補足: 本ドキュメントの位置づけ

- **再開用スナップショット**: 明日の新しい会話で Claude が即座に状況把握できるよう作成
- **コード変更を含まない**: docs/ への新規ファイル追加のみ・GAS デプロイ発火なし
- **本日の作業履歴の正本**: git log と本ドキュメントの両方を参照することで完全な状況再現が可能

---

## 12. 参照ドキュメント

- `docs/phase-6b-04-investigation.md`（Phase 6-B-04 全体調査）
- `docs/phase-6b-04-00-teacherid-parity.md`（teacherId 並列比較・**問題 3 と関連**）
- `docs/phase-6b-04-00-message-fixtures.md`（F01-F21 戻り値メッセージ）
- `docs/phase-6b-04-00-internal-api-key-check.md`（INTERNAL_API_KEY）
- `docs/phase-6b-04-00-ff-naming.md`（KV フラグ命名規約）
- `docs/phase-6b-04-00-weekly-boundary-cases.md`（C01-C12・gradeToSettingsKey 関連）
- `docs/phase-6b-04-01-plan.md`（Stage 1 実施記録・Stage 2.x テンプレート）
- `docs/phase-6b-04-02-plan.md`（並行作成・edit Stage テンプレート）
- `docs/migration-plan.md`（プロジェクト全体 migration 計画）

---

**本ドキュメントの末尾**

明日の Claude セッションへ: 本ファイルを読んだら、次のメッセージで Shinji さんに「Phase 6-B-04 再開を確認しました。H-K のどれから着手しますか?」と確認してください。

---

## 13. 2026-04-26 追記: 翌日セッションでの結末

### 13.1 H〜K 調査の結果

| 項目 | 結論 |
|-----|-----|
| H. OCR 機能の詳細調査 | 表形式で複数件編集可・`saveLectureScheduleEntries` 経由で保存・**OCR 確認画面では既存エントリ重複表示なし** |
| I. OCR 編集画面の改修可能性 | 重複チェック追加: 1-2 commits / 既存 chunk + transform で対処可能 |
| J. AI アシスタントへの確認画面追加可能性 | パターン A/B/C で技術的には可能だが、grade='13' / teacherId 空 を含む 3 問題の修正範囲が広い |
| K. 改善案の整理 | 案 1 / 2 / 3 を提示 |

### 13.2 方針確定: 案 2 採用

- **OCR のみ改善**（行重なり問題を修正）
- **AI write 系は次フェーズで廃止**
- **AI read 系は維持**（先生検索・自分のコマ・カレンダーエクスポート等）

### 13.3 「真の問題」の修正

Shinji さんの指摘で、当初の「重複データ保存」ではなく**「カレンダー UI 上の行重なり」が真の問題**と判明。

### 13.4 完了した修正

| commit | hash | 内容 |
|--------|------|------|
| 1 | `68871d0` | OCR `creates` に `lectureId` / `campusCode` 追加（A 案-1） |
| 2 | `2d7166f` | OCR existing transform に `lectureId` / `campusCode` 追加（A 案-2） |
| 3 | `09b916b` | OCR 保存後にサーバー応答採用（B 案） |
| 4 | `5962371` | 既存 bug 1 修正: `window.fitToScreen` 公開 |
| 5 | `503944e` | 既存 bug 2 修正: OCR cache miss 経路を `Array.isArray` パターンに |

### 13.5 検証結果

- ✅ OCR 確認画面でエラー消失
- ✅ 同時刻 3 件 OCR 一括保存で別 lane 表示成功
- ✅ 「1 件しか表示されない」は既存の正常動作（講師の担当外科目登録防止）と判明・バグではない

### 13.6 中止した作業

- **Phase 6-B-04-01**（Stage 1 実施記録）→ 中止
- **Phase 6-B-04-02**（edit Stage 並行 plan）→ 中止
- 詳細は両 plan ドキュメントの末尾追記参照

### 13.7 詳細サマリー

`docs/phase-6b-04-completion-2026-04-26.md` を参照。
