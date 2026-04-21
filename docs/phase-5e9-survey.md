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

---

## 書込系関数 詳細調査（Phase 5-E-9-2a）

### 対象件数の訂正

5-E-9-1 の集計で grades.js 書込を「15 件」と記載したのはオフバイワン。
実数は grades.js 14 件 + features.js 10 件 = **24 件**。本セクションは 24 件
すべてを対象に詳細調査する（task 記載の 25 と 1 件の差異）。

### 共通前提

- **KV キー**: GAS 側は `getProperty()` / `setProperty()`（さらに grades.js は `getScriptProperty` / `setScriptProperty` の同ファイル内別名）経由で `kv-props.js` の `kv-proxy` に繋がり、最終的に `prop:<KEY>` として KV に書かれる。
- **認証**: 全 24 関数ともフロントエンド呼出の公開関数 or それらから呼ばれる `_` 内部ヘルパー。Workers 化時は settings 5-E-7 と同じく **Firebase ID トークン必須**。
- **Admin 判定**: GAS 側は `isAdmin()`。Workers 側では `workers/src/functions/auth.js` の `isAdminUser(env, user)` を使う（5-E-8b-1a で昇格済）。

### Admin エラーメッセージの差異

| メッセージ文言 | 件数 | 主な関数 |
|------------|------|---------|
| `'管理者権限が必要です'` | **11**（grades.js のみ） | `addTestName`, `deleteTestName`, `updateTestName`, `addSchool`, `deleteSchool`, `updateSchool`, `addCampus`, `deleteCampus`, `updateCampusDetails`, `updateVisibleGrades`, `addCampus` |
| `'Admin のみアクセス可能'` | **11** | grades.js 2 件（`updateGradeAnalysisSigmaConfig` / `resetGradeAnalysisSigmaConfig`）＋ features.js 9 件 |
| Admin 判定なし | **2** | `setScriptProperty`（wrapper）, `initializeGradesConfig`（defensive init） |
| 内部 `_` ヘルパー（Admin 判定なし・呼出元の権限に従う） | **2** | `syncLecturePricingToTable_`, `syncNormalConfigToPricingTable_` |

### 詳細表（grades.js 14 件）

| # | 関数名 | KV キー | Admin メッセージ | 依存 | 特殊ロジック | 分類 |
|---|--------|---------|----------------|------|------------|------|
| G2 | `setScriptProperty` | 任意（引数） | なし（wrapper） | `setProperty_`（`kv-props.js`） | 他ファイル向けのファイルローカル別名 | **D'** |
| G3 | `initializeGradesConfig` | `prop:GRADES_TEST_NAMES_CONFIG`, `prop:GRADES_CAMPUS_CODES_CONFIG` | なし | `getScriptProperty`, `setScriptProperty`, 定数 `TEST_NAMES` / `CAMPUSES` | 既存値があれば書込しない defensive init。初回セットアップ時のみ書込 | **D'** |
| G4 | `addTestName` | `prop:GRADES_TEST_NAMES_CONFIG` | `'管理者権限が必要です'` | `getTestNamesConfig`, `setScriptProperty` | 重複チェック・50 文字制限 | **B'** |
| G5 | `deleteTestName` | `prop:GRADES_TEST_NAMES_CONFIG` | `'管理者権限が必要です'` | `getTestNamesConfig`, `countGradesByTestName_`（Supabase）, `setScriptProperty` | 使用中グレードを Supabase で事前チェックして削除拒否 | **B'** |
| G6 | `updateTestName` | `prop:GRADES_TEST_NAMES_CONFIG` | `'管理者権限が必要です'` | `getTestNamesConfig`, `setScriptProperty` | リネーム時の重複チェック | **B'** |
| G7 | `addSchool` | `prop:GRADES_SCHOOL_CONFIG` | `'管理者権限が必要です'` | `getSchoolConfig`, `setScriptProperty` | 学科文字列 `"名:偏差値"` 形式のパース・重複チェック | **B'** |
| G8 | `deleteSchool` | `prop:GRADES_SCHOOL_CONFIG` | `'管理者権限が必要です'` | `getSchoolConfig`, `countGradesBySchool_`（Supabase）, `setScriptProperty` | 使用中グレードを Supabase で事前チェックして削除拒否 | **B'** |
| G9 | `updateSchool` | `prop:GRADES_SCHOOL_CONFIG` | `'管理者権限が必要です'` | `getSchoolConfig`, `setScriptProperty` | 学科文字列のパース・リネーム時の重複チェック | **B'** |
| G10 | `addCampus` | `prop:GRADES_CAMPUS_CODES_CONFIG` | `'管理者権限が必要です'` | `getScriptProperty`, `setScriptProperty` | コード正規化（upper）・コード 10 字/名前 30 字の長さ制限・重複チェック | **B'** |
| G11 | `deleteCampus` | `prop:GRADES_CAMPUS_CODES_CONFIG` | `'管理者権限が必要です'` | `getScriptProperty`, `countStudentsByCampus_`（Supabase）, `setScriptProperty` | 在籍生徒を Supabase で事前チェックして削除拒否。フィルタ前にカウント（beforeCount 比較）で「見つからない」判定 | **B'** |
| G12 | `updateCampusDetails` | `prop:GRADES_CAMPUS_CODES_CONFIG` | `'管理者権限が必要です'` | `getScriptProperty`, `setScriptProperty` | `tel/fax/principal/mobile` は `null` 指定で変更スキップ（部分更新）。コードは変更不可 | **B'** |
| G13 | `updateVisibleGrades` | `prop:GRADES_VISIBLE_CONFIG` | `'管理者権限が必要です'` | `setScriptProperty`, 定数 `GRADES` | 全コードが `GRADES` 定数に存在するかバリデーション | **B'** |
| G14 | `updateGradeAnalysisSigmaConfig` | `prop:GRADES_SIGMA_CONFIG` | `'Admin のみアクセス可能'` | `setScriptProperty`, 定数 `DEFAULT_SIGMA` | 各キーを `Number()` で検証して正の数値のみ保存。schedule 系 A と同質 | **A'** |
| G15 | `resetGradeAnalysisSigmaConfig` | `prop:GRADES_SIGMA_CONFIG` | `'Admin のみアクセス可能'` | `deleteProperty_`（`kv-props.js`） | `setProperty_` でなく **`deleteProperty_` を直接呼ぶ**（空文字列ではなく KV エントリ自体を削除）。schedule 系の delete と同質 | **A'** |

### 詳細表（features.js 10 件）

| # | 関数名 | KV キー | Admin メッセージ | 依存 | 特殊ロジック | 分類 |
|---|--------|---------|----------------|------|------------|------|
| F2 | `saveAiKnowledgeEntry` | `prop:AI_KNOWLEDGE_BASE` | `'Admin のみアクセス可能'` | `getProperty`, `setProperty` | id 指定あり→update、なし→新規追加（id=`'kb_' + Date.now()`）。`updatedAt` を ISO 文字列で付与 | **B'** |
| F3 | `deleteAiKnowledgeEntry` | `prop:AI_KNOWLEDGE_BASE` | `'Admin のみアクセス可能'` | `getProperty`, `setProperty` | id で filter 除去・差分がなければ `'エントリが見つかりません'` エラー | **A'** |
| F6 | `saveLectureDates` | `prop:LECTURE_PERIODS_CONFIG` | `'Admin のみアクセス可能'` | `getScriptProperty`, `setScriptProperty`, `getDefaultGradeSettings_`, 定数 `LEC_TYPE_NAMES` | id = `fiscalYear + '-' + typeId` で upsert。新規時は `gradeSettings` にデフォルト値を埋める | **B'** |
| F7 | `resetLectureDates` | `prop:LECTURE_PERIODS_CONFIG` | `'Admin のみアクセス可能'` | `getScriptProperty`, `setScriptProperty`, `computeDefaultLectureDates_` | `gradeSettings` が残っていれば日程だけを自動計算値に置換（エントリ保持）、なければエントリ自体を削除 | **B'** |
| F9 | `saveLecturePricing` | `prop:LECTURE_PRICING_CONFIG` ＋ `prop:PRICING_TABLE_CONFIG`（sync経由） | `'Admin のみアクセス可能'` | `getProperty_`, `setProperty_`, `getDefaultLecturePricing_`, `migrateLecturePricingData_`, **`syncLecturePricingToTable_`** | 旧フォーマット（`all[typeId]` が配列）の自動移行 → `all[typeId] = lectureData` で 1 タイプ更新 → `PRICING_CONFIG` に sync | **C'** |
| F10 | `saveUnifiedLecturePricing` | `prop:LECTURE_PRICING_CONFIG` ＋ `prop:PRICING_TABLE_CONFIG`（sync経由） | `'Admin のみアクセス可能'` | F9 と同じ＋`payload.allTypes` を使って 6 タイプ一括更新 | F9 のバルク版（6 タイプ `['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi']` を同時更新） | **C'** |
| F12 | `saveLectureGreetings` | `prop:LECTURE_GREETINGS_CONFIG` | `'Admin のみアクセス可能'` | `setProperty_` | JSON パース → setProperty の 2 行。最も単純 | **A'** |
| F14 | `saveNormalClassConfig` | `prop:NORMAL_CLASS_CONFIG` ＋ `prop:PRICING_TABLE_CONFIG`（sync経由） | `'Admin のみアクセス可能'` | `setProperty_`, **`syncNormalConfigToPricingTable_`** | `data.version = 2` を強制付与 → setProperty → `PRICING_CONFIG` に sync | **C'** |
| F16 | `syncLecturePricingToTable_` | `prop:PRICING_TABLE_CONFIG` | なし（内部ヘルパー） | `getProperty_`, `setProperty_`, `getCampusConfig`, 定数 `LECTURE_GRADE_LABELS_` / `LECTURE_TYPE_DISPLAY_NAMES_` | PRICING_CONFIG 未設定時はスキップ（ログのみ）。既存 `auto_*` + 旧 `seasonal`/`seasonal_high`/`mock` セクションを filter 除去 → 6 タイプの rows から新しい `auto_<typeId>` / `auto_<typeId>_shozui` / `auto_<typeId>_custom` セクションを再生成。例外は catch でログのみ | **C'** |
| F17 | `syncNormalConfigToPricingTable_` | `prop:PRICING_TABLE_CONFIG` | なし（内部ヘルパー） | `getProperty_`, `setProperty_`, `getCampusConfig` | PRICING_CONFIG 未設定時はスキップ。既存 `_fromNormalConfig` + 旧 `regular`/`shozui`/`individual`/`enrollment` セクションを filter 除去 → `nc_<id>` セクションを**先頭**に挿入し他タブを後ろに結合 | **C'** |

### PRICING_CONFIG シンクの整合性担保方式

#### 2 キー同時書込の対象

`saveLecturePricing` (F9) / `saveUnifiedLecturePricing` (F10) は
`LECTURE_PRICING_CONFIG` → `PRICING_TABLE_CONFIG` の順に書く。
`saveNormalClassConfig` (F14) は `NORMAL_CLASS_CONFIG` →
`PRICING_TABLE_CONFIG` の順。

#### 整合性担保ロジック

1. **書込順序の固定**: メインキー（講習料金 / 通常授業設定）を先に書き込み、
   その後に内部シンクヘルパー（F16 / F17）が `PRICING_TABLE_CONFIG` を更新する。
2. **差分置換方式**: シンクヘルパーは `PRICING_TABLE_CONFIG.sections` 全体を
   上書きするのではなく、**「自動生成マーカー付きセクションだけを filter 除去
   して再構築」**する。対象マーカー：
   - F16: `auto_` プレフィックス + 旧 ID（`seasonal` / `seasonal_high` / `mock`）
   - F17: `_fromNormalConfig: true` フラグ + 旧 ID（`regular` / `shozui` / `individual` / `enrollment`）

   他のセクション（管理者が直接編集した手動セクション等）には一切触れない。
3. **PRICING_CONFIG 未設定時はスキップ**: シンクヘルパーは冒頭で
   `PRICING_TABLE_CONFIG` の存在を確認し、未設定なら警告ログを出してリターン。
   メインキーの書込は成功済みなので機能面は壊れない。
4. **失敗時の扱い**: シンクヘルパーは `try/catch` でエラーをログに留めるだけ。
   メインキー書込はすでに完了しているため、呼出元の戻り値は success のまま。
   次回保存時のシンクで自動復旧する「eventually consistent」方式。

#### 影響範囲と再現可能性

- シンクは再入可能（冪等）: 何度呼んでも同じ結果になる（マーカー付きセクションを除去 → 最新データから再生成）。
- Workers 化する際もこの順序・冪等性を保てば挙動は同等。2 キー書込がトランザクションでないことの許容は GAS 版でも同じ。

### グループ分類の集計

| グループ | 件数 | 定義 | 対象関数 |
|---------|------|------|---------|
| **A'** | **4** | settings / schedule-overrides パターン完全同質（単一 KV キー・Admin 判定のみ・副作用なし・ロジック単純） | `G14`, `G15`, `F3`, `F12` |
| **B'** | **13** | 条件付き同質（軽微な特殊ロジック: 重複チェック・バリデーション・Supabase guard・部分更新・upsert 分岐） | `G4`〜`G13`, `F2`, `F6`, `F7` |
| **C'** | **5** | 2 キー同時書込・整合性論点あり（`PRICING_TABLE_CONFIG` シンクが絡む） | `F9`, `F10`, `F14`, `F16`, `F17` |
| **D'** | **2** | 初期化・内部アクセサ等で通常 CRUD と性質が異なる（Admin 判定なし・wrapper） | `G2`, `G3` |
| **合計** | **24** | — | — |

### Admin メッセージ差異に関する推奨

**推奨：Workers 化時に現行メッセージを各関数ごとに忠実に移植し、統一はしない。**

#### 理由

1. **挙動パリティの最優先**: 本フェーズは「既存を壊さない」が最優先。フロントの
   表示メッセージに依存したテスト・スクリーンショット・ユーザーの慣れがあり得る
   ため、文言変更は独立したクリーンアップフェーズで扱うべき。
2. **差異は文言のみで意味論は同じ**: `'管理者権限が必要です'` と
   `'Admin のみアクセス可能'` はどちらも Admin 拒否メッセージであり、
   機能的な違いはない。統一は「一貫性の改善」であり「互換性の担保」とは別課題。
3. **統一するならプロジェクト全体で**: grades.js 系の 11 件だけでなく、
   auth.js / schedule 系との整合性も含めて一度に変更すべき。Workers 化と同時に
   行うとリグレッション調査の範囲が拡がる。

#### 将来のクリーンアップ手順（参考）

1. 全 GAS/Workers コードで Admin 拒否メッセージをグローバル検索
2. 統一先文言を決定（候補: `'この操作には管理者権限が必要です'` 等）
3. GAS と Workers の両実装を同時に差し替え
4. フロント側のエラー表示テストを実施

このクリーンアップは Phase 5-E 完了後の独立フェーズに回すのが妥当。

---

## 読取系関数 詳細調査（Phase 5-E-9-2b）

### 対象件数

5-E-9-1 の集計通り、grades.js 読取 8 件（`G16`〜`G23`）＋ features.js 読取 7 件
（`F1`, `F4`, `F5`, `F8`, `F11`, `F13`, `F15`）＝ **15 件**。加えて wrapper
`G1` `getScriptProperty` も KV 読み取り経路として追加集計し、総計 **16 件**を調査対象とする。

### 共通前提

- **認証**: 読取系は **Firebase ID トークンのみ**でアクセス可能（Admin 判定不要）が基本。例外は `F1 getAiKnowledgeBase` のみで、これは Admin 限定。
- **依存**: GAS 側はいずれも `getProperty()` / `getScriptProperty` 経由で `kv-props.js` → KV を読む。defensive init や migration 書込の副作用を持つものがあり、以下で個別に記録する。

### 詳細表（grades.js 9 件：G1 含む）

| # | 関数名 | KV キー | Admin | 呼出元 | 整形・副作用 | 分類 |
|---|--------|---------|-------|-------|------------|------|
| G1 | `getScriptProperty` | 任意（引数） | 不要 | grades.js 内部（G3/G18/G20/G21/G22 経由など） | wrapper: `getProperty_()` の空文字フォールバック | **R-内部** |
| G16 | `getCampusConfigForWeb` | `prop:GRADES_CAMPUS_CODES_CONFIG` | 不要 | **フロント: js-lectures-admin** | `getCampusConfig()` を `{ success, data }` でラップして返す | **R-Web** |
| G17 | `getGradesConfigForWeb` | `prop:GRADES_TEST_NAMES_CONFIG`, `prop:GRADES_CAMPUS_CODES_CONFIG`, `prop:GRADES_VISIBLE_CONFIG`, `prop:GRADES_SCHOOL_CONFIG` | 不要 | **フロント: 複数画面** | 複合読取 + `GRADES` 定数 + 表示学年フィルター + **Supabase `staffs` の display_name/name セレクト**。`initializeGradesConfig()` を冒頭で呼ぶ書込副作用あり | **R-Web**（KV 単独でない・Supabase 併用） |
| G18 | `getTestNamesConfig` | `prop:GRADES_TEST_NAMES_CONFIG` | 不要 | `addTestName` / `deleteTestName` / `updateTestName` / `getGradesConfigForWeb` | 先頭で `initializeGradesConfig()` 呼出（初回のみ書込副作用）。失敗時は `TEST_NAMES` デフォルト定数を返す | **R-内部** |
| G19 | `getSchoolConfig` | `prop:GRADES_SCHOOL_CONFIG` | 不要 | `addSchool` / `deleteSchool` / `updateSchool` / `getGradesConfigForWeb` | 純粋 KV 読取 + JSON.parse・失敗時は空配列 | **R-内部** |
| G20 | `getCampusConfig` | `prop:GRADES_CAMPUS_CODES_CONFIG` | 不要 | `syncLecturePricingToTable_` / `syncNormalConfigToPricingTable_` / `getCampusConfigForWeb` / `getPricingConfigForWeb` など多数 | `initializeGradesConfig()` 副作用あり。配列 → `{code: name}` 辞書変換 | **R-内部** |
| G21 | `getCampusDetailsConfig` | `prop:GRADES_CAMPUS_CODES_CONFIG` | 不要 | `getStaffPlacementForWeb`（admin.js:1339）のみ | `initializeGradesConfig()` 副作用あり。配列の各要素を `{code,name,tel,fax,principal,mobile}` に正規化 | **R-内部** |
| G22 | `getGradeConfig` | **なし（KV 読まない）** | 不要 | 内部複数 | `GRADES` 定数を返すだけ。KV アクセスなし | **R-内部（KV 不要）** |
| G23 | `getGradeAnalysisSigmaConfig` | `prop:GRADES_SIGMA_CONFIG` | 不要 | **フロント: js-admin-ext** | KV 読取 + `DEFAULT_SIGMA` 定数でのキー単位デフォルト補完。エラー時も `DEFAULT_SIGMA` を返す | **R-Web** |

### 詳細表（features.js 7 件）

| # | 関数名 | KV キー | Admin | 呼出元 | 整形・副作用 | 分類 |
|---|--------|---------|-------|-------|------------|------|
| F1 | `getAiKnowledgeBase` | `prop:AI_KNOWLEDGE_BASE` | **必要**（`'Admin のみアクセス可能'`） | フロント: js-admin-chatbot | Admin 判定 → KV 読取 → JSON.parse → `{ success, entries }`。読取でも Admin 必須という珍しい例 | **R-例外** |
| F4 | `getPricingConfigForWeb` | `prop:PRICING_TABLE_CONFIG` + 返却時 `prop:GRADES_CAMPUS_CODES_CONFIG`（`getCampusConfig()` 経由） | 不要 | フロント: js-pricing | **重い書込副作用あり**: v2 未満 → デフォルト書込、v3 未満 → tabs フィールド追加書込、`mock` セクション残存 → 除去書込。最大 3 回の setProperty が発生（自動マイグレーション） | **R-Web（整合性維持書込あり）** |
| F5 | `getLecturePeriods` | `prop:LECTURE_PERIODS_CONFIG` | 不要 | フロント: 複数画面 | `computeDefaultLectureDates_` / `getDefaultGradeSettings_` を使って、保存済み上書き＋現・次年度×6 種の自動計算値を結合。旧フォーマット `lp_xxx` 互換処理あり | **R-Web（計算併合）** |
| F8 | `getLecturePricingConfig` | `prop:LECTURE_PRICING_CONFIG` | 不要 | フロント: 複数画面 | 旧フォーマット（typeId が配列）自動移行 → setProperty 書込副作用。未設定時はデフォルト書込 | **R-Web（マイグレーション書込あり）** |
| F11 | `getLectureGreetings` | `prop:LECTURE_GREETINGS_CONFIG` | 不要 | フロント: js-lectures-materials | 純粋 KV 読取 + JSON.parse・未設定時は `{}`。副作用なし | **R-Web（純粋）** |
| F13 | `getNormalClassConfig` | `prop:NORMAL_CLASS_CONFIG` + `prop:NORMAL_CLASS_CONFIG_LEGACY`（退避先） | 不要 | フロント: js-lectures-admin | 旧形式（配列）検出 → レガシー退避キーに old を書き込み + 新形式を書き込む。未設定時はデフォルト書込 | **R-Web（マイグレーション書込あり）** |
| F15 | `getNormalClassSectionsForWeb` | `prop:NORMAL_CLASS_CONFIG`（F13 経由） | 不要 | フロント: js-lectures-flyer | `getNormalClassConfig()` をラップして `campusCode` でフィルタ | **R-Web** |

### 分類集計

| 分類 | 件数 | 定義 | 対象関数 |
|------|------|------|---------|
| **R-Web** | **9** | フロントエンドから直接呼び出されるゲッター。Workers 化必須 | `G16`, `G17`, `G23`, `F4`, `F5`, `F8`, `F11`, `F13`, `F15` |
| **R-内部** | **6** | GAS 内部ヘルパー（呼出元は他 GAS 関数のみ）。Workers 化時に独立エクスポートするかインライン展開するかは判断対象 | `G1`, `G18`, `G19`, `G20`, `G21`, `G22` |
| **R-例外** | **1** | Admin 判定必須の読取（F1 のみ） | `F1` |
| **合計** | **16** | — | — |

### 書込副作用を持つ読取関数

読取のふりをして裏で KV に書き込むパターンが以下 5 件。Workers 化時は設計判断が必要：

| 関数 | 副作用 | Workers 化時の扱い |
|-----|--------|------------------|
| `G17` `getGradesConfigForWeb` | 初回のみ `initializeGradesConfig`（TEST_NAMES_CONFIG + CAMPUS_CODES_CONFIG の defensive init）。KV なし → 書込、KV あり → スキップ | defensive init を Workers 側にも実装（副作用を保持）。もしくは初期化は別の明示的なフローに分離する（要検討） |
| `G18` `getTestNamesConfig` | 同上（initializeGradesConfig 呼出） | 同上 |
| `G20` `getCampusConfig` | 同上 | 同上 |
| `G21` `getCampusDetailsConfig` | 同上 | 同上 |
| `F4` `getPricingConfigForWeb` | v2→v3 マイグレーション・`mock` 除去・未設定時デフォルト書込（最大 3 回の setProperty） | Workers 側でも同等の migrate-on-read を実装（副作用を保持）。あるいは migrate を独立関数化して「初回起動時だけ呼ぶ」運用に変更（別 PR 案件） |
| `F8` `getLecturePricingConfig` | 旧フォーマット自動移行・未設定時デフォルト書込 | 同上 |
| `F13` `getNormalClassConfig` | 旧形式（配列）→ 新形式マイグレーション・`NORMAL_CLASS_CONFIG_LEGACY` への退避書込・未設定時デフォルト書込 | 同上（2 キー書込となる点に注意） |

### インライン展開の判断材料

#### Workers 化不要（インライン展開 or 定数化）候補

| 関数 | 理由 |
|-----|------|
| `G1` `getScriptProperty` | `getProperty_` の空文字フォールバック別名。Workers 側では `env.KV.get(...) ?? ''` でインライン展開可能 |
| `G2` `setScriptProperty` | `setProperty_` のエイリアス。Workers 側では `env.KV.put(...)` で十分 |
| `G3` `initializeGradesConfig` | defensive init。Workers 化時は「KV が空なら初期化」の 3-5 行を書込関数と読取関数にインライン展開、または 1 本の Workers 内部 private ヘルパーに集約 |
| `G22` `getGradeConfig` | KV 読まず `GRADES` 定数を返すだけ。Workers 側ではモジュールレベル `const` に置けば十分。router 公開不要 |

= **4 件が Workers 化不要**（ただし G22 以外は Workers 側に同等機能の private helper を持つ前提）

#### Workers 内部 private helper 化候補（router には公開しない）

| 関数 | 理由 |
|-----|------|
| `G18` `getTestNamesConfig` | `addTestName` / `deleteTestName` / `updateTestName` / `getGradesConfigForWeb` から使われる。Workers では 4 関数間で共有する private helper として配置 |
| `G19` `getSchoolConfig` | `addSchool` / `deleteSchool` / `updateSchool` / `getGradesConfigForWeb` から使われる。同様 |
| `G20` `getCampusConfig` | `syncLecturePricingToTable_` / `syncNormalConfigToPricingTable_` / `getCampusConfigForWeb` / `getPricingConfigForWeb` 等から使われる。辞書変換含め Workers 内 private helper 化 |
| `G21` `getCampusDetailsConfig` | `getStaffPlacementForWeb`（admin.js）のみで使用。`getStaffPlacementForWeb` の Workers 化時に一緒に移植（5-E-9 の範囲外・講師配置系として別フェーズ対応） |

= **4 件が Workers 内部 private helper 化**（router 経由の公開は不要）

### 5-E-9 全体の実数確定

| 分類 | 件数 |
|------|------|
| 書込 A'（完全同質） | 4 |
| 書込 B'（条件付き同質） | 13 |
| 書込 C'（2 キー同時書込） | 5 |
| 書込 D'（初期化・内部アクセサ） | 2 |
| 書込 小計 | **24** |
| 読取 R-Web（フロント公開） | 9 |
| 読取 R-内部（GAS 内部ヘルパー） | 6 |
| 読取 R-例外（Admin 必須） | 1 |
| 読取 小計 | **16** |
| **5-E-9 総計** | **40** |

---

## 5-E-9 実装フェーズの分割提案

### 推奨: **3 サブフェーズに分割**

40 件を一度に Workers 化するとレビュー負荷・リグレッションリスクが大きいため、
ファイル境界 + キーファミリ境界で 3 分割する。

| サブフェーズ | 扱う関数 | 件数 | 主な成果物 | 備考 |
|------------|---------|------|----------|------|
| **5-E-9b-1** | grades.js 全体 | **20** | `workers/src/functions/grades-config.js` 新設。書込 CRUD 12（G4-G13, G14, G15）＋ Web 読取 3（G16, G17, G23）＋ Workers 内部 private helper 4（G18-G21 相当） + 定数化 1（G22 相当） + defensive init helper（G3 相当）。`isAdminUser` は既存 auth.js 流用 | Admin メッセージの差異（`'管理者権限が必要です'` vs `'Admin のみアクセス可能'`）は現行忠実に移植。`G17 getGradesConfigForWeb` は Supabase `staffs` 参照を含むため staffs 読取基盤（既存）との統合テストが要 |
| **5-E-9b-2** | features.js 単純 KV（AI KB + 講習期間 + 挨拶文 + 通常授業読取） | **12** | `workers/src/functions/features-config-simple.js`（仮）新設。F1 R-例外（Admin 必須読取）・F2/F3 AI KB 書込・F5/F6/F7 講習期間・F11/F12 挨拶文・F13/F15 通常授業・F8 講習料金読取（マイグレ書込副作用含む） | F1 は Admin 判定を忘れず。F8/F13 はマイグレ書込の二重発火防止に注意（同期 await） |
| **5-E-9b-3** | features.js PRICING シンク群 | **8** | `workers/src/functions/features-pricing-sync.js`（仮）新設。F4 R-Web（マイグレ書込含む）・F9/F10/F14 書込（2 キー同時）・F16/F17 内部シンクヘルパー（Workers 内 private）。G20 `getCampusConfig` 相当（grades-config.js から import）を使って `campusScope` 解決 | PRICING シンクの整合性ロジック（マーカー付きセクションのみ filter 置換・PRICING 未設定時スキップ・eventually consistent）を GAS 版と完全一致させる。シンク失敗時の戻り値扱いも現行通り |

### サブフェーズ別の件数

- 5-E-9b-1: 20 件（grades.js 全 KV 関連）
- 5-E-9b-2: 12 件（features.js 単純 KV + R-例外）
- 5-E-9b-3: 8 件（features.js PRICING シンク）
- 小計: **40 件**

### Workers 化不要（インライン展開・定数化）の件数

- **4 件**: `G1`, `G2`, `G3`, `G22`（上記「インライン展開の判断材料」参照）
- これらは Workers 側にコピー実装せず、各 Workers ファイルでインライン処理 or モジュール定数として取り込む
- router.js の HANDLERS には登録しない（独立エクスポート不要）

### Workers 内部 private helper 化（非公開）

- **4 件**: `G18`, `G19`, `G20`, `G21`（router 公開不要、Workers ファイル内の private 関数として配置）
- gas-bridge.html の `WORKERS_FUNCTIONS` セットにも追加しない

### 5-E-9 全体の router 公開関数数

- 書込: 24 - 2（D' の G2/G3 除外）= **22 件**
- 読取: 16 - 4（R-内部の G1/G18-G21 と G22 は非公開）= **10 件**（R-Web 9 + R-例外 1）
- **合計: 32 件を router に公開**（8 件はインライン化・private helper 化）

### 代替案（2 サブフェーズ統合）

5-E-9b-2 と 5-E-9b-3 を 1 本にまとめて features.js 全 17 件を一気に移行する案も
あるが、PRICING シンク群は特殊ロジック（2 キー同時・マーカー置換・eventually
consistent）を含み、単純 KV とテスト観点が異なるため、切り離した 3 分割を推奨する。

---

## 実装上の決定記録

### G5 `deleteTestName` / G8 `deleteSchool` / G11 `deleteCampus` の Supabase ガード扱い（5-E-9b-1 セッション 2）

#### 選択肢

- **α**: Workers 側で Supabase REST API を直接叩いて count を発行
- **β**: Supabase 依存部分は GAS 側に残し、Workers 経由ではガード未実装・GAS フォールバック経由のみ守る（5-E-10 で解消する宿題化）
- **γ**: ガード処理は Workers 側だが Supabase 呼出は新設せず既存パターン踏襲

#### 決定：**α（Workers 側で直接 supabaseSelect 呼出）**

#### 理由

1. **Workers 側の Supabase REST アクセスは既に確立済み**:
   `workers/src/supabase.js` の `supabaseSelect(env, table, query)` は 5-E-7 `settings.js`
   および 5-E-8 の `students.js` で既に利用実績あり（`students.js:63 / 137 / 172` など）。
2. **count guard は単純な SELECT のみ**: フィルタ式（例: `test_name=eq.<val>`）で
   `select=id` すれば `.length` でカウント可能。新規インフラ・RPC・ビュー等は不要。
3. **β（ガード先送り）は運用リスクが大きい**: Workers 経由の削除でガードが外れると、
   使用中のテスト名／志望校／校舎コードを誤削除し、後続の成績・生徒データ参照で
   整合性不正が発生する恐れがある。フォールバック経路だけに依存するのは脆弱。
4. **γ（既存パターン踏襲）は α と実質同じ**: 既に `supabaseSelect` が確立パターンなので
   γ は α と区別する意味がない。

#### 適用範囲

- **G5 `deleteTestName`**（本セッションで実装）: Supabase `grades` テーブルの
  `test_name=eq.<name>` で count。
- **G8 `deleteSchool`**（セッション 3 で同じ α を適用する推奨）: `shogaku1` / `shogaku2`
  の両カラムで count し、`id` でユニーク化してから合計件数を算出。
- **G11 `deleteCampus`**（セッション 4 で同じ α を適用する推奨）: `students` テーブルを
  `campus=eq.<code2桁>&is_deleted=eq.false` で count。

### features.js 講習期間系（F5/F6/F7）のタイムゾーン扱い（5-E-9b-2a-2）

#### 差異の発生条件

- GAS の実行環境は Asia/Tokyo（スクリプトタイムゾーン設定による・本アプリは JST 固定）。
- Cloudflare Workers のデフォルトは UTC。
- `new Date(y, m-1, d)` 構築時はローカル時刻の 00:00 を表すため、Y/M/D を読み直すと同値となり**タイムゾーン非依存**。`getDay()` も同様に Y/M/D が同じなら同じ曜日を返すため、曜日計算・休校日判定等の結果は **両環境で完全一致**する。
- **唯一差異が出る経路**は `new Date()`（現在時刻）を使って「いまの月」「いまの年度」を判定する箇所。F5 `getLecturePeriods` のみ該当。日本時間 00:00〜09:00 の間、Workers は前日の年月を返してしまう。

#### 対応

`getJstNow_()` ヘルパーを新設し、`Date.now() + 9h` を UTC ゲッタ経由で読むことで JST 壁時計時刻を取得。F5 で `currentFy` 決定時に使用。

```js
function getJstNow_() {
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: nowJst.getUTCFullYear(), month: nowJst.getUTCMonth() + 1 };
}
```

F6/F7 は引数で `fiscalYear` を受け取るため現在時刻に依存せず、この調整は不要。

#### 備考

- `isHolidayLec_` 等の休校日判定はすべて特定日付（Y/M/D）に対する判定で、タイムゾーン非依存。
- `isHolidayLec_` の実装内キャッシュ（`holidayCacheLec_`）はモジュール変数。Workers のインスタンス再利用で状態が持ち越される可能性があるため、F5/F7 の先頭で `holidayCacheLec_ = null` にリセットして最新 KV 値を確実に反映する（GAS の「同一実行内キャッシュ」と同じ挙動を再現）。

### features.js の PRICING シンクで `getCampusConfig_` を共有する方式（5-E-9b-3a）

#### 選択肢

- **α**: `workers/src/functions/grades.js` から `getCampusConfig_` を `export` して features.js で `import`
- **β**: features.js 内に同等の private helper を再実装（重複だが結合なし）
- **γ**: `workers/src/functions/shared.js` 等に切り出して双方から import

#### 決定：**α（grades.js からエクスポート + features.js で import）**

#### 理由

1. **Workers モジュール間の import は既に実績あり**:
   `workers/src/functions/settings.js` が `./auth.js` から `isAdminUser` を import、
   `workers/src/functions/features.js` も同じく `auth.js` 参照など、横断 import は確立パターン。
2. **単一ソース維持**: GAS 側も `getCampusConfig()` は grades.js に 1 本しかなく、features.js の `syncLecturePricingToTable_` / `syncNormalConfigToPricingTable_` から呼んでいる。Workers も同じ依存関係（grades.js が提供、features.js が利用）を維持するのが自然。
3. **β は重複コスト**: `ensureGradesConfigInit_` と `readCampusConfigArray_` の依存まで重複することになり、保守時にどちらかを更新し忘れるリスク。
4. **γ は現時点で前倒し**: 共有ヘルパーを必要とするファイルがまだ 2 つだけで、専用モジュールを切るメリットが薄い。将来 3 つ以上になれば γ に格上げする判断も可能（`getTeacherEmails` 等が同様の共有候補）。

#### 実装

- grades.js の `async function getCampusConfig_` に `export` を付与（他の private helper は非エクスポートのまま）
- features.js の先頭 import に `getCampusConfig_` を追加
- 関数本体・挙動・副作用は変更なし（`ensureGradesConfigInit_` が呼ばれる点も grades.js 側の挙動を踏襲）


