# 残関数棚卸し（2026-04-21 作成 / 2026-04-26 更新）

> Workers 経由化されていない GAS 公開関数（`_` サフィックスなしの関数）を全量把握し、Phase 5-E〜6-C の設計材料を揃えるための台帳。

## 🔴 重要方針（2026-04-26 確定）

### GAS トリガー系は全て GAS 残置確定

Phase 6-B-09 ロールバック（Cloudflare Cron Invocations 表示問題）を契機に、**ScriptApp time トリガーで実行される GAS 関数は全て GAS 残置で確定**。Workers 化対象から除外する。該当関数は分類「**C（GAS 残置確定）**」とする：

| トリガー関数 | 場所 | 役割 |
|------------|------|------|
| `scheduledInitializeSheets` | admin.js | 日次シート初期化（time トリガー） |
| `checkAndSendDueLineMessages` | line.js | LINE 配信定時チェック（time トリガー・1時間毎） |
| `checkAndForwardFormEmails` | line.js | フォームメール転送（time トリガー） |

トリガーセットアップ系（`setup*Trigger` / `delete*Trigger` / `get*TriggerStatus`）も全て C 残置（ScriptApp 必須）。

## 前提

- 本台帳の作成時点（2026-04-21）での Workers 経由関数は **19 個**。
- **2026-04-26 時点では Phase 6-A〜6-C-01 完了で Workers 経由関数は 127 個**（`gas-bridge.html` の `WORKERS_FUNCTIONS` Set 参照）。
- 除外対象：`_` サフィックスの内部ユーティリティ関数。
- `editAutoLearnedKnowledge` / `resolveAiFeedback` は B-⑱ で PATCH 化済み・Phase 6-A-1 で Workers 化済み。
- 書込系の絶対ルール（B-⑭〜⑱ で確立）：全 PATCH 方式 + 事前 SELECT、部分 payload UPSERT 禁止、`staffToSupabase_` に partial staff 渡し禁止。

## 分類ルール（B-⑱ 引き継ぎメモと合意済み）

| 分類 | 定義 |
|------|------|
| **A** | Workers 化必須。一般ユーザーが叩く・高頻度。Supabase/Firestore のみで完結し、ScriptProperties 依存が軽い |
| **B** | Workers 化推奨。Admin 操作中心だが将来的に Workers 経由が望ましい。ScriptProperties 依存が本体 → Phase 5-E 後に移行可能 |
| **C** | GAS 完結で可。Admin 専用かつ低頻度、または GAS 専用 API（Gmail/Drive/Script/HtmlService/LockService 等）に依存 |
| **D** | 削除候補。呼出元なし・廃止された migrate 系・死コード・テスト用 |

- 優先度（A のみ）: 高 / 中 / 低
- 判断に迷った関数は分類を「要相談」とし、理由を備考に記載

---

## 関数一覧

### 1. 認証・エントリポイント（code.js / auth.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| doGet | その他 | HtmlService | GAS Webエントリ | なし | C | | HtmlService 必須・GAS 固有 |
| doPost | Webhook | ContentService | GAS Web エントリ / LINE Webhook | ADMIN_EMAILS | C | | GAS エンドポイント自体 |
| isAdmin | 認証系 | ScriptProperties | GAS 内部のみ（grades.js 等の権限チェック） | ADMIN_EMAILS | C | | フロント呼出は `getAdminEmails`（Workers 化済）に置換済み。GAS 内部の権限チェックでは継続使用 |
| getAdminEmails | 読取 | KV (`prop:ADMIN_EMAILS`) | フロント: js-core, js-admin 等 | ADMIN_EMAILS | A | 高 | ✅ Workers 化済み（Phase 5-E-7 系）— Admin 判定の正式 API |
| activateHiddenAdminMode | 認証系 | Workers KV (`prop:hiddenAdmin_*`) | フロント: js-core | ADMIN_EMAILS | B | | ✅ Workers 化済み（Phase 6-B-01）— KV TTL 6h |
| getCurrentUserEmail | 認証系 | Firebase email context | GAS 内部のみ | なし | C | | 内部コンテキスト取得 |
| getUserRoleInfo | 読取 | ScriptProperties | フロント: js-admin-ext, js-core | ADMIN_EMAILS | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| getDisplayName | 読取 | なし | GAS 内部のみ | なし | C | | 内部ヘルパー |
| addAdminEmail | 書込 | ScriptProperties, allowedUsers | フロント: js-admin | ADMIN_EMAILS | B | | スタブ化済（即エラー返却・1行）。Workers 化対象外 |
| isAllowedUser | 認証系 | ScriptProperties, allowedUsers | GAS 内部のみ | ADMIN_EMAILS, ACCESS_FOLDER_ID, APP_FOLDER_ID | C | | 認証内部処理 |
| getAllowedUsers | 読取 | allowedUsers, staffs | フロント: js-admin, js-lectures | ADMIN_EMAILS | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| addUserAccess | 書込 | allowedUsers, staffs | GAS 内部のみ | ADMIN_EMAILS | C | | doPost 自己登録経由 |
| removeUserAccess | 書込 | allowedUsers, staffs | フロント: js-admin | ADMIN_EMAILS | B | | ✅ Workers 化済み（Phase 6-C-01） |
| getTeacherEmails | 読取 | staffs | フロント: js-core | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| addEmailToTeacher | 書込 | staffs, allowedUsers | フロント: js-core | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| removeEmailFromTeacher | 書込 | staffs, allowedUsers | フロント: js-core | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| removeAdminEmail | 書込 | ScriptProperties | フロント: js-admin | ADMIN_EMAILS | B | | スタブ化済（即エラー返却・1行）。Workers 化対象外 |
| initializeFirstAdmin | 書込 | ScriptProperties, staffs, allowedUsers | フロント: js-core (初期化) | ADMIN_EMAILS | B | | 初回セットアップのみ・呼出 1 回限り。Workers 化スキップ |


### 2. 設定・プロフィール（settings.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getSettings | 読取 | Cloudflare KV（`prop:...`）＋ Supabase staffs | フロント: 設定/管理 | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, APP_FOLDER_ID, THEME_COLOR | A | 高 | ✅ Workers 化済み（Phase 5-E-7） |
| updateSettings | 書込 | Cloudflare KV（`prop:...`） | フロント: 設定画面 | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, APP_FOLDER_ID, ACCESS_FOLDER_ID, THEME_COLOR | A | 高 | ✅ Workers 化済み（Phase 5-E-7） |
| getUserProperty | 読取 | UserProperties / staffs | GAS 内部のみ | なし | C | | UserProperties 依存・GAS 固有 |
| setUserProperty | 書込 | UserProperties / staffs | GAS 内部のみ | なし | C | | UserProperties 依存・GAS 固有 |
| getRegisteredEmail | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパーのみ |
| getOrCreateTeacherId | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパーのみ |
| getUserProfile | 読取 | staffs(Supabase) | フロント: 設定画面, js-core | なし | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| updateUserProfile | 書込 | staffs(Supabase) | フロント: 設定画面 | なし | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| resetUserThemeColor | 書込 | UserProperties, staffs | フロント: 設定 | THEME_COLOR | 要相談 | | ✅ Workers 化済み（Phase 6-A 期） |
| savePreferredCampuses | 書込 | UserProperties / staffs | フロント: 設定 | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-2） |
| getSubjectOptions | 読取 | 静的配列 | フロント: 設定画面 | なし | A | 低 | ✅ Workers 化済み（Phase 6-A 期） |


### 3. スケジュール（schedule.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getScheduleData | 読取 | schedules(Firestore) | GAS 内部のみ（@aiCallable・AI 経由） | なし | C | | フロント呼出は `fbGetScheduleData()` (Firebase SDK 直) に置換済み。AI assistant 内部用として残置 |
| getScheduleDropdownData | 読取 | schedules(Firestore) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| addCustomScheduleEntry | 書込 | schedules(Firestore) | フロント: js-admin-ext | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getAdminScheduleEntries | 読取 | schedules(Firestore) | フロント: js-admin-ext | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteCustomScheduleEntry | 書込 | schedules(Firestore) | フロント: js-admin-ext | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateSchedules | 書込 | schedules(Firestore), Drive | フロント: js-core | APP_FOLDER_ID | C | | DriveApp 使用 |
| getBasicTestDateOverrides | 読取 | KV (`prop:BASIC_TEST_DATES`) | フロント: js-admin-ext | BASIC_TEST_DATES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| setBasicTestDateOverride | 書込 | KV (`prop:BASIC_TEST_DATES`) | フロント: js-admin-ext | BASIC_TEST_DATES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteBasicTestDateOverride | 書込 | KV (`prop:BASIC_TEST_DATES`) | フロント: js-admin-ext | BASIC_TEST_DATES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getBasicTestDetails | 読取 | KV (`prop:BASIC_TEST_DETAILS`) | フロント: js-admin-ext | BASIC_TEST_DETAILS | B | | ✅ Workers 化済み（Phase 6-A 期） |
| setBasicTestDetails | 書込 | KV (`prop:BASIC_TEST_DETAILS`) | フロント: js-admin-ext | BASIC_TEST_DETAILS | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteBasicTestDetails | 書込 | KV (`prop:BASIC_TEST_DETAILS`) | フロント: js-admin-ext | BASIC_TEST_DETAILS | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getPublicHighExamDateOverrides | 読取 | KV (`prop:PUBLIC_HIGH_EXAM_DATES`) | フロント: js-admin-ext, GAS 内 | PUBLIC_HIGH_EXAM_DATES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| setPublicHighExamDateOverride | 書込 | KV (`prop:PUBLIC_HIGH_EXAM_DATES`) | フロント: js-admin-ext | PUBLIC_HIGH_EXAM_DATES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deletePublicHighExamDateOverride | 書込 | KV (`prop:PUBLIC_HIGH_EXAM_DATES`) | フロント: js-admin-ext | PUBLIC_HIGH_EXAM_DATES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getJukuEventOverrides | 読取 | KV (`prop:JUKU_EVENT_OVERRIDES`) | GAS 内部のみ | JUKU_EVENT_OVERRIDES | C | | GAS 内部ヘルパー化（Workers 側は schedule-overrides.js に同型再実装） |
| setJukuEventOverride | 書込 | KV (`prop:JUKU_EVENT_OVERRIDES`) | フロント: js-admin-ext | JUKU_EVENT_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteJukuEventOverride | 書込 | KV (`prop:JUKU_EVENT_OVERRIDES`) | フロント: js-admin-ext | JUKU_EVENT_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getClosedDayOverrides | 読取 | KV (`prop:CLOSED_DAYS_OVERRIDES`) | GAS 内部のみ | CLOSED_DAYS_OVERRIDES | C | | GAS 内部ヘルパー化（Workers 側は schedule-overrides.js に同型再実装） |
| addClosedDayExtra | 書込 | KV (`prop:CLOSED_DAYS_OVERRIDES`) | フロント: js-admin-ext | CLOSED_DAYS_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| removeComputedClosedDay | 書込 | KV (`prop:CLOSED_DAYS_OVERRIDES`) | フロント: js-admin-ext | CLOSED_DAYS_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteClosedDayOverride | 書込 | KV (`prop:CLOSED_DAYS_OVERRIDES`) | フロント: js-admin-ext | CLOSED_DAYS_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getLectureDeadlineOverrides | 読取 | KV (`prop:LECTURE_DEADLINE_OVERRIDES`) | フロント: js-admin-lec-deadline | LECTURE_DEADLINE_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| setLectureDeadlineOverride | 書込 | KV (`prop:LECTURE_DEADLINE_OVERRIDES`) | フロント: js-admin-lec-deadline | LECTURE_DEADLINE_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteLectureDeadlineOverride | 書込 | KV (`prop:LECTURE_DEADLINE_OVERRIDES`) | フロント: js-admin-lec-deadline | LECTURE_DEADLINE_OVERRIDES | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getScheduleOverridesBundle | 読取 | KV(複数 prop:*) | フロント: js-core | BASIC_TEST_DATES, BASIC_TEST_DETAILS, PUBLIC_HIGH_EXAM_DATES, JUKU_EVENT_OVERRIDES, CLOSED_DAYS_OVERRIDES, LECTURE_DEADLINE_OVERRIDES | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |


### 4. 成績マスタ設定（grades.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| initializeGradesConfig | 書込 | ScriptProperties | GAS 内部のみ（getGradesConfigForWeb 等から呼出） | GRADES_TEST_NAMES_CONFIG, GRADES_CAMPUS_CODES_CONFIG | C | | live 関数 4 箇所から呼ばれる defensive init・GAS 内部のみ |
| addTestName | 書込 | KV (`prop:GRADES_TEST_NAMES_CONFIG`) | フロント: js-admin-ext | GRADES_TEST_NAMES_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteTestName | 書込 | KV (`prop:GRADES_TEST_NAMES_CONFIG`) | フロント: js-admin-ext | GRADES_TEST_NAMES_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateTestName | 書込 | KV (`prop:GRADES_TEST_NAMES_CONFIG`), grades | フロント: js-admin-ext | GRADES_TEST_NAMES_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| addSchool | 書込 | KV (`prop:GRADES_SCHOOL_CONFIG`) | フロント: js-admin-ext | GRADES_SCHOOL_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteSchool | 書込 | KV (`prop:GRADES_SCHOOL_CONFIG`) | フロント: js-admin-ext | GRADES_SCHOOL_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateSchool | 書込 | KV (`prop:GRADES_SCHOOL_CONFIG`), grades | フロント: js-admin-ext | GRADES_SCHOOL_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| addCampus | 書込 | KV (`prop:GRADES_CAMPUS_CODES_CONFIG`) | フロント: js-admin-ext | GRADES_CAMPUS_CODES_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteCampus | 書込 | KV (`prop:GRADES_CAMPUS_CODES_CONFIG`) | フロント: js-admin-ext | GRADES_CAMPUS_CODES_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateCampusDetails | 書込 | KV (`prop:GRADES_CAMPUS_CODES_CONFIG`) | フロント: js-admin-ext | GRADES_CAMPUS_CODES_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateVisibleGrades | 書込 | KV (`prop:GRADES_VISIBLE_CONFIG`) | フロント: js-admin-ext | GRADES_VISIBLE_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getCampusConfigForWeb | 読取 | KV (`prop:GRADES_CAMPUS_CODES_CONFIG`) | フロント: js-lectures-admin | GRADES_CAMPUS_CODES_CONFIG | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| getGradesConfigForWeb | 読取 | KV (`prop:GRADES_CAMPUS_CODES_CONFIG`, `prop:GRADES_VISIBLE_CONFIG`) | フロント: 複数画面 | GRADES_CAMPUS_CODES_CONFIG, GRADES_VISIBLE_CONFIG | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| getTestNamesConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_TEST_NAMES_CONFIG | C | | 内部ヘルパー |
| getSchoolConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_SCHOOL_CONFIG | C | | 内部ヘルパー |
| getCampusConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_CAMPUS_CODES_CONFIG | C | | 内部ヘルパー |
| getCampusDetailsConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_CAMPUS_CODES_CONFIG | C | | 内部ヘルパー |
| getGradeConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_VISIBLE_CONFIG | C | | 内部ヘルパー |
| getGradeAnalysisSigmaConfig | 読取 | KV (`prop:GRADES_SIGMA_CONFIG`) | フロント: js-admin-ext | GRADES_SIGMA_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateGradeAnalysisSigmaConfig | 書込 | KV (`prop:GRADES_SIGMA_CONFIG`) | フロント: js-admin-ext | GRADES_SIGMA_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| resetGradeAnalysisSigmaConfig | 書込 | KV (`prop:GRADES_SIGMA_CONFIG`) | フロント: js-admin-ext | GRADES_SIGMA_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |


### 5. 生徒・成績データ（students.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getStudentNameById | 読取 | students(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getDataSheetData | 読取 | students, grades(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getStudentsForDropdown | 読取 | students(Supabase) | GAS 内部のみ（@aiCallable・AI 経由） | なし | C | | フロント呼出は `fbGetStudentsForDropdown()` (Firebase SDK 直) に置換済み |
| submitStudentInfo | 書込 | students(Supabase) | フロント: js-grades | なし | A | 高 | ✅ Workers 化済み（Phase 6-C-02）— PK 衝突時リトライで LockService 置換 |
| ocrAndSaveGradeSheet | 書込 | grades(Supabase), Gemini API | フロント: js-grades | GEMINI_API_KEY | **A** | **中** | **未移行**。OCR 機能（Gemini Workers helper 流用可） |
| parseGradeDataFromText | 読取 | Gemini API | フロント: js-grades | GEMINI_API_KEY | **A** | **中** | **未移行**。Gemini テキストパース |
| getStudentGradeReport | 読取 | students, grades(Supabase) | フロント: firebase-students 経由 | なし | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| getSchoolListForAverages | 読取 | schoolAverages(Supabase) | GAS 内部のみ | なし | C | | 内部のみ |
| saveSchoolAverages | 書込 | schoolAverages(Supabase) | フロント: js-grades-list | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| parseAndSaveAveragesFromText | 書込 | schoolAverages, Gemini API | フロント: js-grades-list | GEMINI_API_KEY | **A** | **中** | **未移行**。Gemini Workers helper 流用可 |
| getCampusAverages | 読取 | schoolAverages(Supabase) | フロント: firebase-students 経由 | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| getGradeSummary | 読取 | 集計(Supabase) | フロント: firebase-students 経由 | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| ocrAndExtractAverages | 読取 | Gemini API | フロント: js-grades-list | GEMINI_API_KEY | A | 中 | ✅ Workers 化済み（Phase 6-C-03）— `workers/src/gemini.js` 経由 |
| getStudentExamData | 読取 | students(Supabase) | フロント: js-grades | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| getStudentPlacementData | 読取 | students(Supabase) | フロント: js-grades-placement | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |


### 6. AI 成績分析（analysis.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getLatestGradeAnalysisMeta | 読取 | testAnalysis(Supabase) | GAS 内部のみ（getAppStartupData GAS フォールバック内） | なし | C | | Workers fallback 経路で参照・GAS 内部のみ |
| generateGradeAnalysis | 書込 | testAnalysis, Gemini API | フロント: js-grades | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, GRADES_SIGMA_CONFIG | **A** | **中** | **未移行**。テスト全体 AI 分析生成（Gemini Workers helper 流用可） |
| generateStudentAnalyses | 書込 | studentAnalysis, Gemini API | GAS 内部のみ | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP | C | | 内部ヘルパー |
| generateAllAnalyses | 書込 | testAnalysis, studentAnalysis, Gemini API | フロント: js-admin-ext | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP | **A** | **中** | **未移行**。一括分析・長時間処理（Workers CPU 時間上限に注意） |


### 7. Admin API・初期化・講師配置（admin.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getAllScriptPropertiesForGUI | 読取 | Cloudflare KV（一次）+ ScriptProperties（SP-only 補完/フォールバック） | フロント: js-admin-ext | 全て | B | | ✅ Workers 化済み（Phase 5-E-5）— `kv_list` + `fetchAll(kv_get)` + SP ユニオン |
| logAdminAction | 書込 | operationLogs(Firestore) | GAS 内部のみ | なし | C | | 内部ログ記録 |
| updateScriptPropertyFromGUI | 書込 | Cloudflare KV のみ | フロント: js-admin-ext | 任意 | B | | ✅ Workers 化済み（Phase 5-E-6）— SP 凍結・KV のみ書込 |
| deleteScriptPropertyFromGUI | 書込 | Cloudflare KV のみ | フロント: js-admin-ext | 任意 | B | | ✅ Workers 化済み（Phase 5-E-6）— SP 凍結・KV のみ削除 |
| initializeAllSheets | 書込 | Drive | GAS 内部のみ | APP_FOLDER_ID | C | | DriveApp 必須 |
| recordOperationLog | 書込 | operationLogs(Firestore) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| recordInitializationLog | 書込 | operationLogs(Firestore) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| checkInitializationStatus | 読取 | Drive | フロント: js-admin-ext | なし | C | | DriveApp フォルダ確認 |
| autoImportAllSchedules | 書込 | schedules, Drive, Gemini API | フロント: js-admin-ext | APP_FOLDER_ID, GEMINI_API_KEY | C | | DriveApp 必須・長時間 |
| importScheduleFromGoogleSheetsWithAI | 読取 | SpreadsheetApp, Gemini API | GAS 内部のみ（autoImportAllSchedules から呼出） | GEMINI_API_KEY | C | | SpreadsheetApp 依存・GAS 残置確定 |
| importScheduleFromCSVWithAI | 書込 | Gemini API | GAS 内部のみ（autoImportAllSchedules から呼出） | GEMINI_API_KEY | C | | autoImportAllSchedules から呼出・GAS 残置確定 |
| importScheduleFromPDFWithAI | 書込 | Gemini API | GAS 内部のみ（autoImportAllSchedules から呼出） | GEMINI_API_KEY | C | | autoImportAllSchedules から呼出・GAS 残置確定 |
| scheduledInitializeSheets | 書込 | Drive, ScriptApp | トリガー(time) | APP_FOLDER_ID | **C** | | 🔴 **GAS トリガー残置確定** |
| setupDailyMaintenanceTrigger | 書込 | ScriptApp | フロント: js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| deleteDailyMaintenanceTrigger | 書込 | ScriptApp | フロント: js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| getAllTriggerStatuses | 読取 | ScriptApp | フロント: js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| manualInitializeSheets | 書込 | Drive | フロント: js-admin-ext, js-core | APP_FOLDER_ID | C | | DriveApp 必須 |
| getJapaneseHolidaysFromCalendar | 読取 | CalendarApp 相当 | GAS 内部のみ | なし | C | | GAS Calendar 固有 |
| refreshHolidayCache | 書込 | ScriptProperties | GAS 内部のみ | HOLIDAY_CACHE | C | | 内部ヘルパー |
| getCachedHolidays | 読取 | KV (`prop:HOLIDAY_CACHE`) | フロント: js-core | HOLIDAY_CACHE | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| getReAuthorizationUrl | その他 | ScriptApp | フロント: js-admin | なし | C | | ScriptApp 固有 |
| getStaffPlacementForWeb | 読取 | KV (`prop:STAFF_PLACEMENT_*`), staffs | フロント: js-placement | STAFF_PLACEMENT_{year}, STAFF_PLACEMENT_ARCHIVE_{year} | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| saveStaffPlacementForWeb | 書込 | KV (`prop:STAFF_PLACEMENT_*`) | フロント: js-placement | STAFF_PLACEMENT_{year} | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getPlacementTeacherNames | 読取 | KV (`prop:STAFF_PLACEMENT_*`) | フロント: js-lectures | STAFF_PLACEMENT_{year} | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |


### 8. LINE 通知・スケジューラー（line.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| sendLineMessage | 書込 | UrlFetchApp(LINE API) | GAS 内部のみ | LINE_CHANNEL_ACCESS_TOKEN | C | | 内部通知（Webhook 経由） |
| sendNotification | 書込 | GmailApp, LINE API | GAS 内部のみ | LINE_CHANNEL_ACCESS_TOKEN | C | | GmailApp 依存 |
| getNotificationSettings | 読取 | staffs(Supabase) | フロント: js-admin, js-core | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| updateNotificationSettings | 書込 | staffs(Supabase) | フロント: js-admin | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期）— PATCH 化済み |
| getLineSchedulerNotifPrefs | 読取 | staffs(Supabase) | フロント: js-admin, js-core | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| updateLineSchedulerNotifPref | 書込 | staffs(Supabase) | フロント: js-admin | なし | A | 中 | ✅ Workers 化済み（Phase 6-A 期）— PATCH 化済み |
| getNotificationMembers | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getLineUserMapping | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getLineRegisteredUsers | 読取 | staffs(Supabase) | フロント: js-admin | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getCampusNotificationRouting | 読取 | Firestore(config/notification_routing) | フロント: js-admin | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| updateCampusNotificationRouting | 書込 | Firestore(config/notification_routing) | フロント: js-admin | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| sendNotificationByContent | 書込 | Gmail, LINE | GAS 内部のみ | LINE_CHANNEL_ACCESS_TOKEN | C | | GmailApp 依存 |
| checkAndForwardFormEmails | その他 | GmailApp | トリガー(time) | FORM_EMAIL_SENDER | **C** | | 🔴 GmailApp 必須・**GAS トリガー残置確定** |
| getFormEmailFilterSettings | 読取 | KV (`prop:FORM_EMAIL_SENDER`) | フロント: js-admin | FORM_EMAIL_SENDER | B | | ✅ Workers 化済み（Phase 6-A 期） |
| saveFormEmailFilterSettings | 書込 | KV (`prop:FORM_EMAIL_SENDER`) | フロント: js-admin | FORM_EMAIL_SENDER | B | | ✅ Workers 化済み（Phase 6-A 期） |
| setupFormEmailTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| deleteFormEmailTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| getFormEmailTriggerStatus | 読取 | ScriptApp | フロント: js-admin | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| previewTemplateMessage | 読取 | KV (`prop:LINE_SCHEDULER_SETTINGS`) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-B-06） |
| resolveTemplateForSendDate | 読取 | KV (`prop:LINE_SCHEDULER_SETTINGS`) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-B-06） |
| getLineSchedulerSettings | 読取 | KV (`prop:LINE_SCHEDULER_SETTINGS`) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-A 期） |
| saveLineSchedulerSettings | 書込 | KV (`prop:LINE_SCHEDULER_SETTINGS`) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getScheduledLineMessages | 読取 | lineSchedules(Firestore) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-B-07） |
| resetAndRegenerateSchedule | 書込 | lineSchedules(Firestore) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-B-07） |
| saveScheduledLineMessage | 書込 | lineSchedules(Firestore) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteScheduledLineMessage | 書込 | lineSchedules(Firestore) | フロント: js-admin | なし | B | | ✅ Workers 化済み（Phase 6-A 期） |
| sendScheduledLineMessageNow | 書込 | MailApp, LINE, lineSchedules | フロント: js-admin | LINE_CHANNEL_ACCESS_TOKEN | C | | ✅ Workers 化済み（Phase 6-A 期）— Admin 手動即時送信のみ Workers 稼働 |
| checkAndSendDueLineMessages | 書込 | MailApp, LINE, Firestore | トリガー(time) | LINE_CHANNEL_ACCESS_TOKEN | **C** | | 🔴 MailApp・**GAS トリガー残置確定**（Phase 6-B-09 ロールバック） |
| setupScheduledLineTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| deleteScheduledLineTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |
| getScheduledLineTriggerStatus | 読取 | ScriptApp | フロント: js-admin | なし | **C** | | 🔴 ScriptApp 必須・**GAS 残置確定** |


### 9. AI アシスタント・料金表・講習管理・チラシ（features.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getPersonalityInstruction | 読取 | 静的値 | GAS 内部のみ | なし | C | | 内部ヘルパー |
| requestAIAssistant | 書込 | Gemini API, 多くのデータ | フロント: js-admin-ext（AI ウィジェット） | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, AI_KNOWLEDGE_BASE, PRICING_TABLE_CONFIG | **A** | **高** | **未移行**。AI 会話・高頻度・主力機能（Gemini Workers helper 流用可） |
| executeAiAction | 書込 | 多くのデータ | フロント: js-ai-actions | GEMINI_API_KEY 等 | **A** | **高** | **未移行**。AI アクション実行・dispatcher。Workers 化要設計 |
| getAiKnowledgeBase | 読取 | KV (`prop:AI_KNOWLEDGE_BASE`) | フロント: js-admin-chatbot | AI_KNOWLEDGE_BASE | B | | ✅ Workers 化済み（Phase 6-A 期） |
| saveAiKnowledgeEntry | 書込 | KV (`prop:AI_KNOWLEDGE_BASE`) | フロント: js-admin-chatbot | AI_KNOWLEDGE_BASE | B | | ✅ Workers 化済み（Phase 6-A 期） |
| deleteAiKnowledgeEntry | 書込 | KV (`prop:AI_KNOWLEDGE_BASE`) | フロント: js-admin-chatbot | AI_KNOWLEDGE_BASE | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getAutoLearnedKnowledge | 読取 | aiLearnedKnowledge(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-1） |
| editAutoLearnedKnowledge | 書込 | aiLearnedKnowledge(Supabase) | フロント: js-admin-chatbot | なし | 要相談 | | ✅ Workers 化済み（Phase 6-A-1）— B-⑱ PATCH 化済み |
| deleteAutoLearnedKnowledge | 書込 | aiLearnedKnowledge(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-1） |
| getAiFeedback | 読取 | aiFeedback(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-1） |
| resolveAiFeedback | 書込 | aiFeedback(Supabase) | フロント: js-admin-chatbot | なし | 要相談 | | ✅ Workers 化済み（Phase 6-A-1）— B-⑱ PATCH 化済み |
| deleteAiFeedback | 書込 | aiFeedback(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-1） |
| getPricingConfigForWeb | 読取 | KV (`prop:PRICING_TABLE_CONFIG`) | フロント: js-pricing | PRICING_TABLE_CONFIG | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| getLecturePeriods | 読取 | KV (`prop:LECTURE_PERIODS_CONFIG`) | フロント: 複数画面 | LECTURE_PERIODS_CONFIG | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| saveLectureDates | 書込 | KV (`prop:LECTURE_PERIODS_CONFIG`) | フロント: js-lectures-admin | LECTURE_PERIODS_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| resetLectureDates | 書込 | KV (`prop:LECTURE_PERIODS_CONFIG`) | フロント: js-lectures-admin | LECTURE_PERIODS_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getLectureScheduleEntries | 読取 | lectureEntries(Firestore) | フロント: js-lectures | なし | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| saveLectureScheduleEntries | 書込 | lectureEntries(Firestore) | フロント: js-lectures | なし | A | 高 | ✅ Workers 化済み（Phase 6-B-03）— `firestoreTransaction` 経由で LockService 置換 |
| getTeacherNamesMap | 読取 | staffs(Supabase) | フロント: js-core, js-lectures | なし | A | 高 | ✅ Workers 化済み（Phase 6-A 期） |
| getFlyerImages | 読取 | Drive, Spreadsheet | フロント: js-lectures-flyer, imagen | APP_FOLDER_ID | C | | DriveApp 使用 |
| getFlyerImageBase64 | 読取 | Drive | フロント: js-lectures-flyer, imagen | APP_FOLDER_ID | C | | DriveApp 使用 |
| uploadFlyerImage | 書込 | Drive, Gemini API | フロント: js-lectures-flyer | APP_FOLDER_ID, GEMINI_API_KEY | C | | DriveApp 使用 |
| analyzeFlyerImageMeta | 書込 | Firestore (`imageTags`), Gemini API | フロント: js-lectures-flyer | GEMINI_API_KEY | B | | ✅ Workers 化済み（Phase 6-B-02）— `workers/src/gemini.js` 経由 |
| deleteFlyerImage | 書込 | Drive, Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | DriveApp 使用 |
| saveFlyerImageTags | 書込 | Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | SpreadsheetApp 使用 |
| generateFlyerWithAI | 書込 | Gemini API, Spreadsheet | フロント: js-lectures-flyer | GEMINI_API_KEY | C | | SpreadsheetApp 使用 |
| saveFlyerAiData | 書込 | Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | SpreadsheetApp 使用 |
| loadFlyerAiData | 読取 | Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | SpreadsheetApp 使用 |
| getLecturePricingConfig | 読取 | KV (`prop:LECTURE_PRICING_CONFIG`) | フロント: 複数画面 | LECTURE_PRICING_CONFIG | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| saveLecturePricing | 書込 | KV (`prop:LECTURE_PRICING_CONFIG`) | フロント: js-lectures-admin | LECTURE_PRICING_CONFIG, PRICING_TABLE_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| saveUnifiedLecturePricing | 書込 | KV (`prop:LECTURE_PRICING_CONFIG`) | フロント: js-lectures-admin | LECTURE_PRICING_CONFIG, PRICING_TABLE_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getLectureGreetings | 読取 | KV (`prop:LECTURE_GREETINGS_CONFIG`) | フロント: js-lectures-materials | LECTURE_GREETINGS_CONFIG | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| saveLectureGreetings | 書込 | KV (`prop:LECTURE_GREETINGS_CONFIG`) | フロント: js-lectures-materials | LECTURE_GREETINGS_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getNormalClassConfig | 読取 | KV (`prop:NORMAL_CLASS_CONFIG`) | フロント: js-lectures-admin | NORMAL_CLASS_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| saveNormalClassConfig | 書込 | KV (`prop:NORMAL_CLASS_CONFIG`) | フロント: js-lectures-admin | NORMAL_CLASS_CONFIG, PRICING_TABLE_CONFIG | B | | ✅ Workers 化済み（Phase 6-A 期） |
| getNormalClassSectionsForWeb | 読取 | KV (`prop:NORMAL_CLASS_CONFIG`) | フロント: js-lectures-flyer | NORMAL_CLASS_CONFIG | A | 中 | ✅ Workers 化済み（Phase 6-A 期） |
| ocrLectureSchedule | 書込 | Gemini API | フロント: js-lectures | GEMINI_API_KEY | A | 中 | ✅ Workers 化済み（Phase 6-C-04）— `workers/src/gemini.js` 経由 |
| parseLectureScheduleFromText | 書込 | Gemini API | フロント: js-lectures | GEMINI_API_KEY | **A** | **中** | **未移行**。テキストパース（Gemini Workers helper 流用可） |
| generateImageWithImagen | 書込 | Gemini/Imagen API | フロント: js-lectures-imagen | GEMINI_API_KEY | **A** | **低** | **未移行**。画像生成・低頻度。Imagen API は Gemini helper の対象外 |


### 10. 議事録（minutes.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getMinutesList | 読取 | meeting_minutes(Supabase) | フロント: js-minutes | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-2） |
| saveMinutes | 書込 | meeting_minutes(Supabase) | フロント: js-minutes | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-2）— 全 8 カラム指定 UPSERT |
| deleteMinutes | 書込 | meeting_minutes(Supabase) | フロント: js-minutes | なし | A | 中 | ✅ Workers 化済み（Phase 6-A-2） |
| transcribeAndSummarizeAudio | 書込 | Gemini API | フロント: js-minutes | GEMINI_API_KEY | **A** | **中** | **未移行**。音声文字起こし（Gemini Workers helper 流用可） |
| mergeTranscriptsAndSummarize | 書込 | Gemini API | フロント: js-minutes | GEMINI_API_KEY | **A** | **中** | **未移行**。要約マージ（Gemini Workers helper 流用可） |


### 11. 移行スクリプト（migrate.js）

Phase 5-E-0 で `migrate-to-supabase.js` / `migrate-lec-grades.js` はファイルごと削除済み。残る `migrate.js` は L7 の「移行完了後もロールバック用に削除しないこと」警告を尊重してファイル残置。全 14 関数を D → C に再分類。

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| migrateStudentsToFirestore | 書込 | students(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateGradesToFirestore | 書込 | grades(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| verifyStudentMigration | 読取 | students(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| verifyGradesMigration | 読取 | grades(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateSchoolAveragesToFirestore | 書込 | schoolAverages(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateTestAnalysisToFirestore | 書込 | testAnalysis(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateStudentAnalysisToFirestore | 書込 | studentAnalysis(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateAllGradeDataToFirestore | 書込 | 複数コレクション | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateSchedulesToFirestore | 書込 | schedules(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateLectureEntriesToFirestore | 書込 | lectureEntries(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateLineSchedulesToFirestore | 書込 | lineSchedules(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateFlyerAiToFirestore | 書込 | flyerAi(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateImageTagsToFirestore | 書込 | imageTags(Firestore) | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |
| migrateAllPhase5ToFirestore | 書込 | 複数コレクション | 呼出元なし（手動実行のみ） | なし | C | | ロールバック用保持（migrate.js L7 警告尊重） |


### 12. 旧台帳未掲載の Workers 化済み関数（2026-04-26 追記）

5-E-0 時点の本台帳にエントリのなかった関数のうち、Phase 6-A 期に Workers 化されたもの。フロントから `gasApiPromise_()` 経由で呼ばれている主要 API。

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | 分類 | 備考 |
|--------|------|-------------------|--------|------|------|
| getAppStartupData | 読取 | 複数（KV+Supabase+Firestore 集約） | フロント: js-core 起動時 | A | ✅ Workers 化済み |
| getMasterData | 読取 | students(Supabase) | フロント: 複数画面 | A | ✅ Workers 化済み |
| getGradesYearFolders | 読取 | 静的計算 | フロント: js-grades | A | ✅ Workers 化済み |
| getSchoolAverages | 読取 | schoolAverages(Supabase) | フロント: js-grades-list | A | ✅ Workers 化済み |
| getGradeAnalysis | 読取 | testAnalysis(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| getStudentAnalysis | 読取 | studentAnalysis(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| getGradeDataByStudentAndTest | 読取 | grades(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| getDeletedStudents | 読取 | students(Supabase) | フロント: firebase-students 経由 | A | ✅ Workers 化済み |
| getStudentsWithGradesByTest | 読取 | students+grades(Supabase) | フロント: js-grades-list | A | ✅ Workers 化済み |
| getStudentListWithGrades | 読取 | students+grades(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| updateStudentInfo | 書込 | students(Supabase) | フロント: js-grades | A | ✅ Workers 化済み（PATCH） |
| deleteStudent | 書込 | students(Supabase) | フロント: js-grades | A | ✅ Workers 化済み（論理削除） |
| restoreStudent | 書込 | students(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| submitGradeData | 書込 | grades(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| saveExamResult | 書込 | grades(Supabase) | フロント: js-grades | A | ✅ Workers 化済み |
| saveLecGrades | 書込 | grades(Supabase) | フロント: js-lectures | A | ✅ Workers 化済み（Phase 6-A-2） |


---

## 集計サマリー

### 総関数数（2026-04-26 更新）

| 分類 | 件数 | 内訳 |
|------|------|------|
| ✅ Workers 化済み | 約 113 | 旧台帳掲載 97 + 旧台帳未掲載 16 |
| **未移行 A** | **11** | ocrAndSaveGradeSheet, parseGradeDataFromText, parseAndSaveAveragesFromText, generateGradeAnalysis, generateAllAnalyses, requestAIAssistant, executeAiAction, parseLectureScheduleFromText, generateImageWithImagen, transcribeAndSummarizeAudio, mergeTranscriptsAndSummarize（残り 11 件・うち AI 系 全件） |
| C — GAS 残置確定 | 約 80 | DriveApp / SpreadsheetApp / GmailApp / ScriptApp / CalendarApp 依存・トリガー系・migrate.js 14 件等 |
| 要相談（PATCH 化済み・Workers 化済） | 2 | `editAutoLearnedKnowledge` / `resolveAiFeedback`（Workers 化済） |
| スタブ化済（Workers 化対象外） | 2 | `addAdminEmail` / `removeAdminEmail` |

> 数値は概算。`gas-bridge.html` の `WORKERS_FUNCTIONS` Set（127 件）が信頼できる Workers 化済関数の実態。

### 未移行 A 分類の詳細（2026-04-26 時点・実残）

ScriptProperties 依存はすべて KV 経由化済（Phase 5-E-7 で完了）のため、未移行関数の障壁は **Gemini API 呼出 / LockService / 長時間処理** のいずれか。

| 関数 | 場所 | 主な障壁 | 優先度 |
|------|------|---------|--------|
| `ocrAndSaveGradeSheet` | students.js | Gemini API + Supabase 書込 | 中 |
| `parseGradeDataFromText` | students.js | Gemini API | 中 |
| `parseAndSaveAveragesFromText` | students.js | Gemini API | 中 |
| `generateGradeAnalysis` | analysis.js | Gemini API + 長時間 | 中 |
| `generateAllAnalyses` | analysis.js | Gemini API + 長時間（Workers CPU 上限注意） | 中 |
| `requestAIAssistant` | features.js | Gemini API + 多データ依存 | 高 |
| `executeAiAction` | features.js | dispatcher 設計 | 高 |
| `parseLectureScheduleFromText` | features.js | Gemini API | 中 |
| `generateImageWithImagen` | features.js | Imagen API（Gemini helper 対象外） | 低 |
| `transcribeAndSummarizeAudio` | minutes.js | Gemini API（音声） | 中 |
| `mergeTranscriptsAndSummarize` | minutes.js | Gemini API | 中 |

> Gemini API 系は Phase 6-B-02 で `workers/src/gemini.js` のリトライ helper が確立済のため、移植コストは大幅低減済。Imagen のみ helper 対象外。

### ScriptProperties 使用関数の総数

- **使用している関数**: 約 **75 関数**（B の大半が該当）
- **キー一覧（重複排除）**: 以下 36 キー（年度サフィックス付きは 1 件として計上）

```
ADMIN_EMAILS
ACCESS_FOLDER_ID
AI_KNOWLEDGE_BASE
APP_FOLDER_ID
BASIC_TEST_DATES
BASIC_TEST_DETAILS
CLOSED_DAYS_OVERRIDES
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_PROJECT_ID
FIREBASE_WEB_API_KEY
FORM_EMAIL_SENDER
GEMINI_API_KEY
GEMINI_API_KEY_BACKUP
GRADES_CAMPUS_CODES_CONFIG   (CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG)
GRADES_SCHOOL_CONFIG         (CONFIG_PROP_KEYS.SCHOOL_CONFIG)
GRADES_SIGMA_CONFIG          (CONFIG_PROP_KEYS.SIGMA_CONFIG)
GRADES_TEST_NAMES_CONFIG     (CONFIG_PROP_KEYS.TEST_NAMES_CONFIG)
GRADES_VISIBLE_CONFIG        (CONFIG_PROP_KEYS.GRADE_VISIBLE_CONFIG)
HOLIDAY_CACHE
JUKU_EVENT_OVERRIDES
LECTURE_DEADLINE_OVERRIDES
LECTURE_GREETINGS_CONFIG
LECTURE_PERIODS_CONFIG
LECTURE_PRICING_CONFIG
LINE_CHANNEL_ACCESS_TOKEN
LINE_SCHEDULER_SETTINGS
NORMAL_CLASS_CONFIG
PRICING_TABLE_CONFIG         (CONFIG_PROP_KEYS.PRICING_CONFIG)
PUBLIC_HIGH_EXAM_DATES
STAFF_PLACEMENT              (旧・移行用)
STAFF_PLACEMENT_{year}
STAFF_PLACEMENT_ARCHIVE_{year}
SUPABASE_SERVICE_KEY
SUPABASE_URL
THEME_COLOR
```

UserProperties（`getUserProperty()` 経由でルーティング）:
```
USER_THEME_COLOR
PREFERRED_CAMPUSES
（他は STAFF_FIELD_MAP_ 経由で staffs テーブルに自動ルーティング）
```

### Phase 5-E-0 実施記録

| 項目 | 内容 |
|------|------|
| 実施日 | 2026-04-21 |
| 実削除関数 | **35 件** |
| 実削除行数 | **1193 行**（insertion 1 行を含む net 1192 行） |
| D→C 再分類 | **19 関数**（migrate.js 14 + 削除保留 5） |

#### コミット履歴

| コミット | 内容 | 削除行 |
|---------|------|--------|
| `dc210e3` | remove completed migration scripts（migrate-to-supabase.js + migrate-lec-grades.js の 2 ファイル削除・9 関数） | 393 |
| `e3a6014` | remove no-op rebuild cache calls（students.js の rebuild* 呼出 6 行除去・関数削除なし） | 7 |
| `fa54360` | remove rebuild cache function definitions（students.js の rebuild* 5 関数削除） | 94 |
| `a620198` | remove dead code in features.js（Pricing 5 + Lecture Period 3 + getLectureTeachers = 9 関数） | 230 |
| `1a573c6` | remove scattered dead code（code.js 2 + auth.js 3 + settings.js 1 + schedule.js 2 + grades.js 1 + admin.js 3 = 12 関数） | 469 |

#### 削除した 35 関数の内訳

| カテゴリ | 関数 |
|----------|------|
| 呼出元なし・静的値 | `getAppMetadata`, `testApiEndpoint` |
| 呼出元なし・置換済み | `updateEmailAddress`, `linkUserById`, `addScheduleEntry`, `updateCampusName`, `getLectureTeachers` |
| 呼出元なし・初期化/セットアップ系 | `getSetupStatus`, `initFirestoreAllowedUsers`, `initializeApplication` |
| 呼出元なし・手動テスト | `testFetchPublicAverageScorePage` |
| 旧 Firestore キャッシュ（no-op 化済み） | `rebuildGradeSummary`, `rebuildAllGradeSummaries`, `rebuildGradeListCache`, `rebuildGradeReportCache`, `rebuildAllCaches`（呼出元 2 箇所を先に除去してから削除） |
| Pricing API（saveUnifiedLecturePricing に統合済み） | `savePricingConfig`, `addPricingSection`, `deletePricingSection`, `updatePricingTitle`, `updatePricingFooterNotes` |
| 講習 Period API（saveLectureDates に統合済み） | `saveLecturePeriod`, `deleteLecturePeriod`, `saveLectureGradeSettings` |
| 移行系（admin.js 内の一回限り） | `migrateStudentsToSupabase`, `migrateLectureEntriesToCampusDocs` |
| 移行系（migrate-to-supabase.js 全 7 関数・ファイルごと削除） | `migrateGradesToSupabase`, `migrateSchoolAveragesToSupabase`, `migrateTestAnalysisToSupabase`, `migrateStudentAnalysisToSupabase`, `migrateAllToSupabase`, `migrateAiDataToSupabase`, `migrateStaffsToSupabase` |
| 移行系（migrate-lec-grades.js 全 2 関数 + 1 ヘルパー・ファイルごと削除） | `migrateLecGradesDryRun`, `migrateLecGrades`, `migrateLecGrades_` |

#### D → C 再分類 19 関数

**migrate.js 内 14 関数**（備考: ロールバック用保持・migrate.js L7 警告尊重）
`migrateStudentsToFirestore`, `migrateGradesToFirestore`, `verifyStudentMigration`, `verifyGradesMigration`, `migrateSchoolAveragesToFirestore`, `migrateTestAnalysisToFirestore`, `migrateStudentAnalysisToFirestore`, `migrateAllGradeDataToFirestore`, `migrateSchedulesToFirestore`, `migrateLectureEntriesToFirestore`, `migrateLineSchedulesToFirestore`, `migrateFlyerAiToFirestore`, `migrateImageTagsToFirestore`, `migrateAllPhase5ToFirestore`

**削除保留 5 関数**（備考: 5-E 移行時に再判断・呼出元あり）
- `initializeGradesConfig` — grades.js の 4 live 関数から呼ばれる defensive init
- `importScheduleFromGoogleSheetsWithAI` / `importScheduleFromCSVWithAI` / `importScheduleFromPDFWithAI` — `autoImportAllSchedules`（C）から呼出
- `getLatestGradeAnalysisMeta` — `getAppStartupData` GAS フォールバック内で参照

---

## 次フェーズへの引き継ぎ（2026-04-26 更新）

### 完了済みフェーズ

- ✅ **Phase 5-E-0**（D 削除）— 35 関数削除 + 19 関数 D→C 再分類
- ✅ **Phase 5-E-1〜7**（KV プロキシ + ScriptProperties 移行）— SP 凍結・KV のみ書込
- ✅ **Phase 6-A 全期**（A 分類大量 Workers 化）— 80+ 関数移行
- ✅ **Phase 6-B 全期**（残存 B + 高難度ヘルパー）— `gemini.js` / `firestoreTransaction` / `helpers/datetime-helpers.js` / `helpers/line-template-helpers.js` 整備
- ✅ **Phase 6-C-01**（B 分類クローズ）— `removeUserAccess` 移行で B 分類 100%完了
- ✅ **Phase 6-C-02**（生徒登録）— `submitStudentInfo` 移行（PK 衝突時リトライで LockService 置換）
- ✅ **Phase 6-C-03**（OCR 第一弾）— `ocrAndExtractAverages` 移行（Gemini Workers helper 初の本番実績）
- ✅ **Phase 6-C-04**（OCR 第二弾）— `ocrLectureSchedule` 移行（講習日程 OCR・features.js 初の Gemini 移行）

### 次の Workers 化候補（Phase 6-C-05 以降）

未移行 A 分類 13 件（上記「未移行 A 分類の詳細」表参照）から選定。**優先度「高」2 件**：

1. **`requestAIAssistant`**（features.js）
   - 障壁: Gemini API + 多データ依存（KB / Pricing / Schedule 等）
   - 解法案: Phase 6-B-02 の `workers/src/gemini.js` を流用。`getAppStartupData` の bundle pattern を活用
   - 主力機能・高頻度のため移行価値大

2. **`executeAiAction`**（features.js）
   - 障壁: dispatcher 設計（複数 action 分岐）
   - 解法案: action 分岐をワーカー側に移植。AI write 系は Phase ai-write-removal で削除済のため対象 action は read 系中心

### 🔴 GAS 残置確定の方針（再掲）

| カテゴリ | 関数群 |
|---------|--------|
| GAS time トリガー | `scheduledInitializeSheets` / `checkAndSendDueLineMessages` / `checkAndForwardFormEmails` |
| トリガーセットアップ | `setup*Trigger` / `delete*Trigger` / `get*TriggerStatus`（全 9 件） |
| GAS 専用 API 依存 | DriveApp / SpreadsheetApp / GmailApp / CalendarApp 使用関数 |
| Imagen API | `generateImageWithImagen`（Workers helper 対象外・移行可能だが優先度低） |

### 書込系の絶対ルール（再掲）

Workers 化する際は全て **PATCH + 事前 SELECT** パターン（B-⑭〜⑰ で確立）。staffs テーブル書込は partial payload 直渡し禁止。`staffToSupabase_` の JSDoc 警告に従うこと。

### 要相談 2 件の現況

- `editAutoLearnedKnowledge` / `resolveAiFeedback`: ✅ Phase 6-A-1 で Workers 化済み（PATCH 化済み）
- `resetUserThemeColor`: ✅ Phase 6-A 期で Workers 化済み（staffs 経路で完結）

