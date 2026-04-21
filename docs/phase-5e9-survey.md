# Phase 5-E-9-1: grades.js / features.js KV 関連関数リスト

> 5-E-8 と同じ分割手法で進めるための下準備。関数名・所属ファイル・開始行番号・書込/読取の別・1 行要約のみを記録する。詳細調査（KV キー / 認証 / Admin 判定 / 依存関係）は次セッション（5-E-9-2 以降）で行う。

## 対象

`main/grades.js`（約 730 行）と `main/features.js`（約 5200 行）から、Cloudflare KV（`prop:*`）への読み書きを主軸とする関数を抽出した。

- 書込系・読取系の両方を対象（5-E-8 は書込系のみだったが、5-E-9 は KV 専用関数「群」単位の扱いなので読取も含める）
- 5-E-0 の D 分類削除後の現存関数
- **Firestore / Supabase 主軸の関数は除外**（5-E-10 で扱う）
- **Drive / Gemini 主軸の関数は除外**（Workers 化の対象外・将来判断）
- 内部 `_` ヘルパーは、KV I/O を直接行うものだけ含める（AI プロンプト文字列構築など KV を副次的に読むだけのものは除外）

## grades.js（23 件）

### 内部アクセサ（2 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| G1 | `getScriptProperty` | 14 | 読取 | `getProperty_()` の grades.js 内ファイルローカル別名（KV 読み取り・空文字フォールバック） |
| G2 | `setScriptProperty` | 27 | 書込 | `setProperty_()` の grades.js 内ファイルローカル別名（KV 書き込み・常に true を返す） |

### 初期化系（1 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| G3 | `initializeGradesConfig` | 37 | 書込 | テスト名・校舎・学年のデフォルト値を未設定のキーにだけ書き込む defensive init |

### 設定 CRUD（12 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| G4 | `addTestName` | 68 | 書込 | KV `TEST_NAMES_CONFIG` にテスト名を追加（Admin のみ） |
| G5 | `deleteTestName` | 102 | 書込 | KV `TEST_NAMES_CONFIG` からテスト名を削除（Admin のみ・使用中グレードを Supabase で事前チェック） |
| G6 | `updateTestName` | 136 | 書込 | KV `TEST_NAMES_CONFIG` の既存テスト名をリネーム（Admin のみ） |
| G7 | `addSchool` | 164 | 書込 | KV `SCHOOL_CONFIG` に志望校を追加（Admin のみ） |
| G8 | `deleteSchool` | 206 | 書込 | KV `SCHOOL_CONFIG` から志望校を削除（Admin のみ・使用中グレードを Supabase で事前チェック） |
| G9 | `updateSchool` | 237 | 書込 | KV `SCHOOL_CONFIG` の学校名・学科情報を更新（Admin のみ） |
| G10 | `addCampus` | 281 | 書込 | KV `CAMPUS_CODES_CONFIG` に校舎を追加（Admin のみ） |
| G11 | `deleteCampus` | 323 | 書込 | KV `CAMPUS_CODES_CONFIG` から校舎を削除（Admin のみ・生徒在籍を Supabase で事前チェック） |
| G12 | `updateCampusDetails` | 368 | 書込 | KV `CAMPUS_CODES_CONFIG` の校舎詳細（TEL/FAX/責任者等）を更新（Admin のみ） |
| G13 | `updateVisibleGrades` | 397 | 書込 | KV `GRADE_VISIBLE_CONFIG` に表示する学年コード配列を保存（Admin のみ） |
| G14 | `updateGradeAnalysisSigmaConfig` | 607 | 書込 | KV `SIGMA_CONFIG` に分析のシグマ閾値設定を保存（Admin のみ） |
| G15 | `resetGradeAnalysisSigmaConfig` | 628 | 書込 | KV `SIGMA_CONFIG` を削除してデフォルトに戻す（Admin のみ） |

### 読取（8 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| G16 | `getCampusConfigForWeb` | 427 | 読取 | KV `CAMPUS_CODES_CONFIG` をフロント向けに整形して返す |
| G17 | `getGradesConfigForWeb` | 442 | 読取 | KV `CAMPUS_CODES_CONFIG` + `GRADE_VISIBLE_CONFIG` を合成してフロント向けに返す |
| G18 | `getTestNamesConfig` | 494 | 読取 | KV `TEST_NAMES_CONFIG` を JSON パースして配列で返す（内部ヘルパー） |
| G19 | `getSchoolConfig` | 509 | 読取 | KV `SCHOOL_CONFIG` を JSON パースして配列で返す（内部ヘルパー） |
| G20 | `getCampusConfig` | 523 | 読取 | KV `CAMPUS_CODES_CONFIG` を JSON パースして `{code, name}` 配列で返す（内部ヘルパー） |
| G21 | `getCampusDetailsConfig` | 545 | 読取 | KV `CAMPUS_CODES_CONFIG` を JSON パースして詳細付き配列で返す（内部ヘルパー） |
| G22 | `getGradeConfig` | 571 | 読取 | KV `GRADE_VISIBLE_CONFIG` を JSON パースして表示学年コード配列で返す（内部ヘルパー） |
| G23 | `getGradeAnalysisSigmaConfig` | 586 | 読取 | KV `SIGMA_CONFIG` を読み、未設定時はデフォルト値を返す |

### 書込/読取 内訳（grades.js）

- 書込: **15 件**（`G2`, `G3`, `G4`〜`G15`）
- 読取: **8 件**（`G16`〜`G23`）
- うち `G1` は読取系の内部アクセサ。実質カウントは書込 15 + 読取 9 = 24 だが、`G1` は `G18`〜`G22` の実装経路として共有されるため重複カウントを避けて 23 件に集計。

## features.js（17 件）

### AI 知識ベース（KV 単独・3 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F1 | `getAiKnowledgeBase` | 1872 | 読取 | KV `AI_KNOWLEDGE_BASE` を JSON パースして手動 KB エントリ配列で返す |
| F2 | `saveAiKnowledgeEntry` | 1892 | 書込 | KV `AI_KNOWLEDGE_BASE` に KB エントリを追加/更新（Admin のみ） |
| F3 | `deleteAiKnowledgeEntry` | 1945 | 書込 | KV `AI_KNOWLEDGE_BASE` から KB エントリを削除（Admin のみ） |

### 料金表（KV 単独・1 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F4 | `getPricingConfigForWeb` | 2435 | 読取 | KV `PRICING_CONFIG` を整形してフロント向けに返す（未設定時はデフォルトを返す） |

### 講習期間（KV 単独・3 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F5 | `getLecturePeriods` | 2762 | 読取 | KV `LECTURE_PERIODS_CONFIG` から講習期間配列を返す（未設定時は自動計算値） |
| F6 | `saveLectureDates` | 2825 | 書込 | KV `LECTURE_PERIODS_CONFIG` に特定年度・講習種別の期間を保存（Admin のみ） |
| F7 | `resetLectureDates` | 2855 | 書込 | KV `LECTURE_PERIODS_CONFIG` から特定年度・講習種別の上書きを削除して自動計算に戻す（Admin のみ） |

### 講習料金（KV 単独・3 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F8 | `getLecturePricingConfig` | 4232 | 読取 | KV `LECTURE_PRICING_CONFIG` を JSON パースして講習料金設定を返す（未設定時はデフォルト） |
| F9 | `saveLecturePricing` | 4266 | 書込 | KV `LECTURE_PRICING_CONFIG` に講習料金を保存＋`PRICING_CONFIG` にもシンクして料金表を更新（Admin のみ） |
| F10 | `saveUnifiedLecturePricing` | 4305 | 書込 | KV `LECTURE_PRICING_CONFIG` に統合ペイロードを保存＋`PRICING_CONFIG` シンク（Admin のみ・F9 の上位） |

### 講習挨拶文（KV 単独・2 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F11 | `getLectureGreetings` | 4344 | 読取 | KV `LECTURE_GREETINGS_CONFIG` を返す（未設定時は空オブジェクト） |
| F12 | `saveLectureGreetings` | 4361 | 書込 | KV `LECTURE_GREETINGS_CONFIG` に講習挨拶文を保存（Admin のみ） |

### 通常授業コマ設定（KV 単独・3 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F13 | `getNormalClassConfig` | 4608 | 読取 | KV `NORMAL_CLASS_CONFIG` を返す（未設定時はデフォルト値） |
| F14 | `saveNormalClassConfig` | 4637 | 書込 | KV `NORMAL_CLASS_CONFIG` に通常コマ設定を保存＋`PRICING_CONFIG` シンク（Admin のみ） |
| F15 | `getNormalClassSectionsForWeb` | 4716 | 読取 | KV `NORMAL_CLASS_CONFIG` を校舎コードでフィルタしたセクション配列を返す |

### 内部 KV シンクヘルパー（2 件）

| # | 関数名 | 開始行 | 種別 | 1 行要約 |
|---|--------|-------|-----|---------|
| F16 | `syncLecturePricingToTable_` | 4382 | 書込 | KV `PRICING_CONFIG` を更新して講習タブを自動生成（F9/F10 から呼出） |
| F17 | `syncNormalConfigToPricingTable_` | 4658 | 書込 | KV `PRICING_CONFIG` を更新して通常授業タブを自動生成（F14 から呼出） |

### 書込/読取 内訳（features.js）

- 書込: **10 件**（`F2`, `F3`, `F6`, `F7`, `F9`, `F10`, `F12`, `F14`, `F16`, `F17`）
- 読取: **7 件**（`F1`, `F4`, `F5`, `F8`, `F11`, `F13`, `F15`）

## 合計

- grades.js: **23 件**（書込 15・読取 8）
- features.js: **17 件**（書込 10・読取 7）
- **合計: 40 件**（書込 25・読取 15）

## 除外した関数（参考・5-E-10 以降の対象）

明示的に KV でないと判定した関数群。詳細調査は 5-E-10 で行う。

### grades.js の除外（3 件・Supabase 主軸）

- `countStudentsByCampus_`（649）— Supabase `students` 件数カウント
- `countGradesByTestName_`（668）— Supabase `grades` 件数カウント
- `countGradesBySchool_`（686）— Supabase `grades` 件数カウント

### features.js の除外（概数・主要カテゴリ）

| カテゴリ | 概数 | 代表関数 |
|---------|------|---------|
| AI パイプライン（Gemini + KV 副次利用） | 約 15 件 | `requestAIAssistant`, `requestAIAssistantFast_`, `buildSystemInstruction_`, `classifyMessageIntent_`, `getAiKnowledgeBaseForPrompt_` 等 |
| AI 自動学習・フィードバック（Supabase 主軸） | 約 10 件 | `getAutoLearnedKnowledge`, `editAutoLearnedKnowledge`, `deleteAutoLearnedKnowledge`, `getAiFeedback`, `resolveAiFeedback`, `deleteAiFeedback`, `saveAutoLearnedKnowledge_`, `isDuplicateKnowledge_` 等 |
| 講習日程 CRUD（Firestore `lectureEntries` 主軸） | 約 10 件 | `getLectureScheduleEntries`, `saveLectureScheduleEntries`, `createLectureEntryAI_`, `editLectureEntryAI_`, `deleteLectureEntryAI_`, `bulkLectureOperationsAI_`, `multiCampusBulkOperationsAI_` 等 |
| 講師名マップ（Supabase `staffs`） | 1 件 | `getTeacherNamesMap` |
| AI アクション・設定反映 | 約 3 件 | `executeAiAction`, `applyConfigChange_` 等（UserProperties + Supabase + Gemini のハイブリッド） |
| 日付/学期計算ユーティリティ（純関数・非 I/O） | 約 10 件 | `addDaysLec_`, `formatDateStrLec_`, `computeBasicTestDateLec_`, `getPublicHighSchoolExamDateLec_`, `computeDefaultLectureDates_` 等 |
| 配布物・チラシ画像（Drive + Gemini） | 約 12 件 | `getFlyerImages`, `uploadFlyerImage`, `analyzeFlyerImageMeta`, `deleteFlyerImage`, `saveFlyerImageTags`, `generateFlyerWithAI`, `saveFlyerAiData`, `loadFlyerAiData` 等 |
| OCR / 画像生成（Gemini） | 3 件 | `ocrLectureSchedule`, `parseLectureScheduleFromText`, `generateImageWithImagen` |
| デフォルト値/マイグレーションヘルパー（純関数） | 約 8 件 | `getDefaultPricingData_`, `getDefaultGradeSettings_`, `getDefaultLecturePricing_`, `migrateLecturePricingData_`, `getDefaultNormalClassConfig_`, `migrateNormalClassConfig_` 等 |

## 次セッション（5-E-9-2）で調査すべき分割案

### 提案：2 サブセッションに分割

40 件を一度に詳細調査すると 5-E-8a-2 と同じ中程度の粒度だが、ファイル横断の観点とキー体系の多さから、ファイル別に分けることを推奨する。

#### 5-E-9-2（前半・grades.js 23 件）

- ファイル単位でまとまり、KV キー名も `TEST_NAMES_CONFIG` / `SCHOOL_CONFIG` / `CAMPUS_CODES_CONFIG` / `GRADE_VISIBLE_CONFIG` / `SIGMA_CONFIG` の 5 キー系に整理される
- 内部アクセサ `getScriptProperty` / `setScriptProperty` の扱い（別名化の要否）も同時判断
- 書込 15 件の Admin 判定パターンが `'管理者権限が必要です'`（schedule 系の `'Admin のみアクセス可能'` と異なる）のため、settings パターン完全同質性の評価をやり直す必要あり

#### 5-E-9-3（後半・features.js 17 件）

- KV キーが 7 キー系（`AI_KNOWLEDGE_BASE` / `PRICING_CONFIG` / `LECTURE_PERIODS_CONFIG` / `LECTURE_PRICING_CONFIG` / `LECTURE_GREETINGS_CONFIG` / `NORMAL_CLASS_CONFIG`）に整理される
- 料金表シンクヘルパー（`F16` / `F17`）が `PRICING_CONFIG` に対する副作用を持つため、グループ B 相当の「条件付き同質」寄り
- `saveLecturePricing` / `saveUnifiedLecturePricing` / `saveNormalClassConfig` は 2 キー同時書込のため整合性確認が必要

### 代替案（1 セッションに統合）

調査内容は schedule 系と同じフォーマットで進むため 1 セッションで 40 件を調査する案もあるが、ファイル間の依存関係（特に `PRICING_CONFIG` の共有）が features.js 内で完結するため、分割した方が文脈の切替コストが低いと判断。
