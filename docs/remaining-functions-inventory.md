# Phase 5-B 残関数棚卸し（2026-04-21 作成）

> Workers 経由化されていない GAS 公開関数（`_` サフィックスなしの関数）を全量把握し、Phase 5-E（ScriptProperties 移行）の設計材料を揃えるための台帳。

## 前提

- 本台帳の作成時点での Workers 経由関数は **19 個**（`ping` + 読取 12 + 書込 6）。
- 除外対象：`_` サフィックスの内部ユーティリティ関数・Workers 移行済み 19 関数。
- `editAutoLearnedKnowledge` / `resolveAiFeedback` は B-⑱ で PATCH 化済みの「GAS 内部完結」として台帳に残す。
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
| getAppMetadata | 読取 | なし | 呼出元なし(要確認) | なし | D | | 静的値を返すのみ |
| testApiEndpoint | 読取 | なし | 呼出元なし(要確認) | なし | D | | 疎通確認用テスト関数 |
| isAdmin | 認証系 | ScriptProperties | フロント: 複数画面 | ADMIN_EMAILS | A | 高 | 高頻度・起動時判定 |
| activateHiddenAdminMode | 認証系 | ScriptProperties | フロント: js-core | ADMIN_EMAILS | B | | 隠し機能・Admin 昇格 |
| getCurrentUserEmail | 認証系 | Firebase email context | GAS 内部のみ | なし | C | | 内部コンテキスト取得 |
| getUserRoleInfo | 読取 | ScriptProperties | フロント: js-admin-ext, js-core | ADMIN_EMAILS | A | 高 | 起動時判定 |
| getDisplayName | 読取 | なし | GAS 内部のみ | なし | C | | 内部ヘルパー |
| addAdminEmail | 書込 | ScriptProperties, allowedUsers | フロント: js-admin | ADMIN_EMAILS | B | | Admin 専用・5-E 後 |
| isAllowedUser | 認証系 | ScriptProperties, allowedUsers | GAS 内部のみ | ADMIN_EMAILS, ACCESS_FOLDER_ID, APP_FOLDER_ID | C | | 認証内部処理 |
| getAllowedUsers | 読取 | allowedUsers, staffs | フロント: js-admin, js-lectures | ADMIN_EMAILS | A | 中 | Admin 表示＋講習管理 |
| addUserAccess | 書込 | allowedUsers, staffs | GAS 内部のみ | ADMIN_EMAILS | C | | doPost 自己登録経由 |
| removeUserAccess | 書込 | allowedUsers, staffs | フロント: js-admin | ADMIN_EMAILS | B | | Admin 専用 |
| linkUserById | 書込 | staffs | 呼出元なし(要確認) | なし | D | | フロント参照なし |
| getTeacherEmails | 読取 | staffs | フロント: js-core | なし | A | 中 | 引き継ぎ画面 |
| addEmailToTeacher | 書込 | staffs, allowedUsers | フロント: js-core | なし | A | 中 | 引き継ぎフロー |
| removeEmailFromTeacher | 書込 | staffs, allowedUsers | フロント: js-core | なし | A | 中 | 引き継ぎフロー |
| removeAdminEmail | 書込 | ScriptProperties | フロント: js-admin | ADMIN_EMAILS | B | | Admin 専用・5-E 後 |
| getSetupStatus | 読取 | ScriptProperties | 呼出元なし(要確認) | ADMIN_EMAILS, APP_FOLDER_ID | D | | 呼出元なし |
| initializeFirstAdmin | 書込 | ScriptProperties, staffs, allowedUsers | フロント: js-core (初期化) | ADMIN_EMAILS | B | | 初回セットアップのみ |
| initFirestoreAllowedUsers | 書込 | allowedUsers | 呼出元なし(要確認) | ADMIN_EMAILS | D | | 移行系・完了済み |


### 2. 設定・プロフィール（settings.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getSettings | 読取 | ScriptProperties | フロント: 設定/管理 | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, APP_FOLDER_ID, THEME_COLOR | B | | Admin 設定表示用・5-E 後 |
| updateSettings | 書込 | ScriptProperties | フロント: 設定画面 | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, APP_FOLDER_ID, ACCESS_FOLDER_ID, THEME_COLOR | B | | Admin 操作・5-E 後 |
| getUserProperty | 読取 | UserProperties / staffs | GAS 内部のみ | なし | C | | UserProperties 依存・GAS 固有 |
| setUserProperty | 書込 | UserProperties / staffs | GAS 内部のみ | なし | C | | UserProperties 依存・GAS 固有 |
| getRegisteredEmail | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパーのみ |
| getOrCreateTeacherId | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパーのみ |
| updateEmailAddress | 書込 | staffs(Supabase) | 呼出元なし(要確認) | なし | D | | 死コード候補 |
| updateUserProfile | 書込 | staffs(Supabase) | フロント: 設定画面 | なし | A | 高 | ユーザー全員が叩く |
| resetUserThemeColor | 書込 | UserProperties, staffs | フロント: 設定 | THEME_COLOR | 要相談 | | UserProperties 依存。Workers 化時は staffs のみで完結可能か要判断 |
| savePreferredCampuses | 書込 | UserProperties / staffs | フロント: 設定 | なし | C | | UserProperties 経由。staffs ルーティング済みだが共通パスが UserProperties |
| getSubjectOptions | 読取 | 静的配列 | フロント: 設定画面 | なし | A | 低 | 単純関数 |


### 3. スケジュール（schedule.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getScheduleData | 読取 | schedules(Firestore) | フロント: js-core | なし | A | 高 | 予定タブ高頻度 |
| getScheduleDropdownData | 読取 | schedules(Firestore) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| addScheduleEntry | 書込 | schedules(Firestore) | 呼出元なし(要確認) | なし | D | | 廃止候補 |
| addCustomScheduleEntry | 書込 | schedules(Firestore) | フロント: js-admin-ext | なし | B | | Admin 操作 |
| getAdminScheduleEntries | 読取 | schedules(Firestore) | フロント: js-admin-ext | なし | B | | Admin 操作 |
| deleteCustomScheduleEntry | 書込 | schedules(Firestore) | フロント: js-admin-ext | なし | B | | Admin 操作 |
| updateSchedules | 書込 | schedules(Firestore), Drive | フロント: js-core | APP_FOLDER_ID | C | | DriveApp 使用 |
| getBasicTestDateOverrides | 読取 | ScriptProperties | フロント: js-admin-ext | BASIC_TEST_DATES | B | | Admin 設定・5-E 後 |
| setBasicTestDateOverride | 書込 | ScriptProperties | フロント: js-admin-ext | BASIC_TEST_DATES | B | | Admin 設定・5-E 後 |
| deleteBasicTestDateOverride | 書込 | ScriptProperties | フロント: js-admin-ext | BASIC_TEST_DATES | B | | Admin 設定・5-E 後 |
| getBasicTestDetails | 読取 | ScriptProperties | フロント: js-admin-ext | BASIC_TEST_DETAILS | B | | Admin 設定・5-E 後 |
| setBasicTestDetails | 書込 | ScriptProperties | フロント: js-admin-ext | BASIC_TEST_DETAILS | B | | Admin 設定・5-E 後 |
| deleteBasicTestDetails | 書込 | ScriptProperties | フロント: js-admin-ext | BASIC_TEST_DETAILS | B | | Admin 設定・5-E 後 |
| getPublicHighExamDateOverrides | 読取 | ScriptProperties | フロント: js-admin-ext, GAS 内 | PUBLIC_HIGH_EXAM_DATES | B | | Admin 設定・5-E 後 |
| setPublicHighExamDateOverride | 書込 | ScriptProperties | フロント: js-admin-ext | PUBLIC_HIGH_EXAM_DATES | B | | Admin 設定・5-E 後 |
| deletePublicHighExamDateOverride | 書込 | ScriptProperties | フロント: js-admin-ext | PUBLIC_HIGH_EXAM_DATES | B | | Admin 設定・5-E 後 |
| getJukuEventOverrides | 読取 | ScriptProperties | GAS 内部のみ | JUKU_EVENT_OVERRIDES | B | | 5-E 後に移行可 |
| setJukuEventOverride | 書込 | ScriptProperties | フロント: js-admin-ext | JUKU_EVENT_OVERRIDES | B | | Admin 設定・5-E 後 |
| deleteJukuEventOverride | 書込 | ScriptProperties | フロント: js-admin-ext | JUKU_EVENT_OVERRIDES | B | | Admin 設定・5-E 後 |
| getClosedDayOverrides | 読取 | ScriptProperties | GAS 内部のみ | CLOSED_DAYS_OVERRIDES | B | | 5-E 後に移行可 |
| addClosedDayExtra | 書込 | ScriptProperties | フロント: js-admin-ext | CLOSED_DAYS_OVERRIDES | B | | Admin 設定・5-E 後 |
| removeComputedClosedDay | 書込 | ScriptProperties | フロント: js-admin-ext | CLOSED_DAYS_OVERRIDES | B | | Admin 設定・5-E 後 |
| deleteClosedDayOverride | 書込 | ScriptProperties | フロント: js-admin-ext | CLOSED_DAYS_OVERRIDES | B | | Admin 設定・5-E 後 |
| getLectureDeadlineOverrides | 読取 | ScriptProperties | フロント: js-admin-lec-deadline | LECTURE_DEADLINE_OVERRIDES | B | | Admin 設定・5-E 後 |
| setLectureDeadlineOverride | 書込 | ScriptProperties | フロント: js-admin-lec-deadline | LECTURE_DEADLINE_OVERRIDES | B | | Admin 設定・5-E 後 |
| deleteLectureDeadlineOverride | 書込 | ScriptProperties | フロント: js-admin-lec-deadline | LECTURE_DEADLINE_OVERRIDES | B | | Admin 設定・5-E 後 |
| testFetchPublicAverageScorePage | その他 | UrlFetchApp | 呼出元なし(要確認) | なし | D | | 手動テスト関数 |
| getScheduleOverridesBundle | 読取 | ScriptProperties(複数) | フロント: js-core | BASIC_TEST_DATES, BASIC_TEST_DETAILS, PUBLIC_HIGH_EXAM_DATES, JUKU_EVENT_OVERRIDES, CLOSED_DAYS_OVERRIDES, LECTURE_DEADLINE_OVERRIDES | A | 高 | 起動時全員読み・5-E 後 |


### 4. 成績マスタ設定（grades.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| initializeGradesConfig | 書込 | ScriptProperties | 呼出元なし(要確認) | GRADES_TEST_NAMES_CONFIG, GRADES_CAMPUS_CODES_CONFIG | D | | 初期化系・手動実行のみ |
| addTestName | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_TEST_NAMES_CONFIG | B | | Admin 設定・5-E 後 |
| deleteTestName | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_TEST_NAMES_CONFIG | B | | Admin 設定・5-E 後 |
| updateTestName | 書込 | ScriptProperties, grades | フロント: js-admin-ext | GRADES_TEST_NAMES_CONFIG | B | | Admin 設定・5-E 後 |
| addSchool | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_SCHOOL_CONFIG | B | | Admin 設定・5-E 後 |
| deleteSchool | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_SCHOOL_CONFIG | B | | Admin 設定・5-E 後 |
| updateSchool | 書込 | ScriptProperties, grades | フロント: js-admin-ext | GRADES_SCHOOL_CONFIG | B | | Admin 設定・5-E 後 |
| addCampus | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_CAMPUS_CODES_CONFIG | B | | Admin 設定・5-E 後 |
| deleteCampus | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_CAMPUS_CODES_CONFIG | B | | Admin 設定・5-E 後 |
| updateCampusName | 書込 | ScriptProperties | 呼出元なし(要確認) | GRADES_CAMPUS_CODES_CONFIG | D | | updateCampusDetails に置換済み |
| updateCampusDetails | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_CAMPUS_CODES_CONFIG | B | | Admin 設定・5-E 後 |
| updateVisibleGrades | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_VISIBLE_CONFIG | B | | Admin 設定・5-E 後 |
| getCampusConfigForWeb | 読取 | ScriptProperties | フロント: js-lectures-admin | GRADES_CAMPUS_CODES_CONFIG | A | 高 | 講習管理画面読込頻度高 |
| getGradesConfigForWeb | 読取 | ScriptProperties | フロント: 複数画面 | GRADES_CAMPUS_CODES_CONFIG, GRADES_VISIBLE_CONFIG | A | 高 | 複数画面で頻繁呼出 |
| getTestNamesConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_TEST_NAMES_CONFIG | C | | 内部ヘルパー |
| getSchoolConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_SCHOOL_CONFIG | C | | 内部ヘルパー |
| getCampusConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_CAMPUS_CODES_CONFIG | C | | 内部ヘルパー |
| getCampusDetailsConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_CAMPUS_CODES_CONFIG | C | | 内部ヘルパー |
| getGradeConfig | 読取 | ScriptProperties | GAS 内部のみ | GRADES_VISIBLE_CONFIG | C | | 内部ヘルパー |
| getGradeAnalysisSigmaConfig | 読取 | ScriptProperties | フロント: js-admin-ext | GRADES_SIGMA_CONFIG | B | | Admin 設定・5-E 後 |
| updateGradeAnalysisSigmaConfig | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_SIGMA_CONFIG | B | | Admin 設定・5-E 後 |
| resetGradeAnalysisSigmaConfig | 書込 | ScriptProperties | フロント: js-admin-ext | GRADES_SIGMA_CONFIG | B | | Admin 設定・5-E 後 |


### 5. 生徒・成績データ（students.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getStudentNameById | 読取 | students(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getDataSheetData | 読取 | students, grades(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getStudentsForDropdown | 読取 | students(Supabase) | フロント: firebase-students 経由 | なし | A | 高 | ドロップダウン高頻度 |
| submitStudentInfo | 書込 | students(Supabase) | フロント: js-grades | なし | A | 高 | 生徒登録・LockService 使用（移行時に要対応） |
| ocrAndSaveGradeSheet | 書込 | grades(Supabase), Gemini API | フロント: js-grades | GEMINI_API_KEY | A | 中 | OCR 機能 |
| parseGradeDataFromText | 読取 | Gemini API | フロント: js-grades | GEMINI_API_KEY | A | 中 | Gemini テキストパース |
| getStudentGradeReport | 読取 | students, grades(Supabase) | フロント: firebase-students 経由 | なし | A | 高 | 成績表表示 |
| getSchoolListForAverages | 読取 | schoolAverages(Supabase) | GAS 内部のみ | なし | C | | 内部のみ |
| saveSchoolAverages | 書込 | schoolAverages(Supabase) | フロント: js-grades-list | なし | A | 中 | 平均点入力。全カラム指定で UPSERT 可だが予防的に PATCH 化推奨 |
| parseAndSaveAveragesFromText | 書込 | schoolAverages, Gemini API | フロント: js-grades-list | GEMINI_API_KEY | A | 中 | テキストパース |
| getCampusAverages | 読取 | schoolAverages(Supabase) | フロント: firebase-students 経由 | なし | A | 中 | 分析画面 |
| getGradeSummary | 読取 | 集計(Supabase) | フロント: firebase-students 経由 | なし | A | 中 | SQL 集計関数呼出 |
| rebuildGradeSummary | 書込 | なし | 呼出元なし(要確認) | なし | D | | 旧 Firestore キャッシュ・廃止済み |
| rebuildAllGradeSummaries | 書込 | なし | 呼出元なし(要確認) | なし | D | | 旧 Firestore キャッシュ・廃止済み |
| rebuildGradeListCache | 書込 | なし | 呼出元なし(要確認) | なし | D | | 旧 Firestore キャッシュ・廃止済み |
| rebuildGradeReportCache | 書込 | なし | フロント: firebase-students 経由 | なし | D | | 旧 Firestore キャッシュ・呼出のみ残存 |
| rebuildAllCaches | 書込 | なし | 呼出元なし(要確認) | なし | D | | 旧 Firestore キャッシュ・廃止済み |
| ocrAndExtractAverages | 読取 | Gemini API | フロント: js-grades-list | GEMINI_API_KEY | A | 中 | OCR・平均点抽出 |
| getStudentExamData | 読取 | students(Supabase) | フロント: js-grades | なし | A | 中 | 情報入力画面 |
| getStudentPlacementData | 読取 | students(Supabase) | フロント: js-grades-placement | なし | A | 中 | 進学先タブ |


### 6. AI 成績分析（analysis.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getLatestGradeAnalysisMeta | 読取 | testAnalysis(Supabase) | 呼出元なし(要確認) | なし | D | | 呼出元なし |
| generateGradeAnalysis | 書込 | testAnalysis, Gemini API | フロント: js-grades | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, GRADES_SIGMA_CONFIG | A | 中 | テスト全体 AI 分析生成 |
| generateStudentAnalyses | 書込 | studentAnalysis, Gemini API | GAS 内部のみ | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP | C | | 内部ヘルパー |
| generateAllAnalyses | 書込 | testAnalysis, studentAnalysis, Gemini API | フロント: js-admin-ext | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP | A | 中 | 一括分析・長時間処理（Workers CPU 時間上限に注意） |


### 7. Admin API・初期化・講師配置（admin.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getAllScriptPropertiesForGUI | 読取 | ScriptProperties(全て) | フロント: js-admin-ext | 全て | B | | Admin 専用・5-E 後 |
| logAdminAction | 書込 | operationLogs(Firestore) | GAS 内部のみ | なし | C | | 内部ログ記録 |
| updateScriptPropertyFromGUI | 書込 | ScriptProperties | フロント: js-admin-ext | 任意 | B | | Admin 専用・5-E 後 |
| deleteScriptPropertyFromGUI | 書込 | ScriptProperties | フロント: js-admin-ext | 任意 | B | | Admin 専用・5-E 後 |
| initializeAllSheets | 書込 | Drive | GAS 内部のみ | APP_FOLDER_ID | C | | DriveApp 必須 |
| recordOperationLog | 書込 | operationLogs(Firestore) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| recordInitializationLog | 書込 | operationLogs(Firestore) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| checkInitializationStatus | 読取 | Drive | フロント: js-admin-ext | なし | C | | DriveApp フォルダ確認 |
| autoImportAllSchedules | 書込 | schedules, Drive, Gemini API | フロント: js-admin-ext | APP_FOLDER_ID, GEMINI_API_KEY | C | | DriveApp 必須・長時間 |
| importScheduleFromGoogleSheetsWithAI | 読取 | SpreadsheetApp, Gemini API | 呼出元なし(要確認) | GEMINI_API_KEY | D | | 呼出なし |
| importScheduleFromCSVWithAI | 書込 | Gemini API | 呼出元なし(要確認) | GEMINI_API_KEY | D | | 呼出なし |
| importScheduleFromPDFWithAI | 書込 | Gemini API | 呼出元なし(要確認) | GEMINI_API_KEY | D | | 呼出なし |
| scheduledInitializeSheets | 書込 | Drive, ScriptApp | トリガー(time) | APP_FOLDER_ID | C | | ScriptApp time トリガー |
| setupDailyMaintenanceTrigger | 書込 | ScriptApp | フロント: js-admin-ext | なし | C | | ScriptApp 必須 |
| deleteDailyMaintenanceTrigger | 書込 | ScriptApp | フロント: js-admin-ext | なし | C | | ScriptApp 必須 |
| getAllTriggerStatuses | 読取 | ScriptApp | フロント: js-admin-ext | なし | C | | ScriptApp 必須 |
| manualInitializeSheets | 書込 | Drive | フロント: js-admin-ext, js-core | APP_FOLDER_ID | C | | DriveApp 必須 |
| initializeApplication | 書込 | ScriptProperties | 呼出元なし(要確認) | GEMINI_API_KEY, APP_FOLDER_ID, THEME_COLOR | D | | 初期化専用・呼出なし |
| getJapaneseHolidaysFromCalendar | 読取 | CalendarApp 相当 | GAS 内部のみ | なし | C | | GAS Calendar 固有 |
| refreshHolidayCache | 書込 | ScriptProperties | GAS 内部のみ | HOLIDAY_CACHE | C | | 内部ヘルパー |
| getCachedHolidays | 読取 | ScriptProperties | フロント: js-core | HOLIDAY_CACHE | A | 中 | 起動時参照・5-E 後 |
| getReAuthorizationUrl | その他 | ScriptApp | フロント: js-admin | なし | C | | ScriptApp 固有 |
| migrateStudentsToSupabase | 書込 | students(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateLectureEntriesToCampusDocs | 書込 | lectureEntries(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| getStaffPlacementForWeb | 読取 | ScriptProperties, staffs | フロント: js-placement | STAFF_PLACEMENT_{year}, STAFF_PLACEMENT_ARCHIVE_{year} | A | 高 | 講師配置・高頻度 |
| saveStaffPlacementForWeb | 書込 | ScriptProperties | フロント: js-placement | STAFF_PLACEMENT_{year} | B | | Admin 編集・5-E 後 |
| getPlacementTeacherNames | 読取 | ScriptProperties | フロント: js-lectures | STAFF_PLACEMENT_{year} | A | 中 | 講習管理ドロップダウン |


### 8. LINE 通知・スケジューラー（line.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| sendLineMessage | 書込 | UrlFetchApp(LINE API) | GAS 内部のみ | LINE_CHANNEL_ACCESS_TOKEN | C | | 内部通知（Webhook 経由） |
| sendNotification | 書込 | GmailApp, LINE API | GAS 内部のみ | LINE_CHANNEL_ACCESS_TOKEN | C | | GmailApp 依存 |
| getNotificationSettings | 読取 | staffs(Supabase) | フロント: js-admin, js-core | なし | A | 中 | 設定画面 |
| updateNotificationSettings | 書込 | staffs(Supabase) | フロント: js-admin | なし | A | 中 | 設定画面。PATCH 必須（partial staff 禁止） |
| getLineSchedulerNotifPrefs | 読取 | staffs(Supabase) | フロント: js-admin, js-core | なし | A | 中 | 通知設定 |
| updateLineSchedulerNotifPref | 書込 | staffs(Supabase) | フロント: js-admin | なし | A | 中 | 通知設定。PATCH 必須 |
| getNotificationMembers | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getLineUserMapping | 読取 | staffs(Supabase) | GAS 内部のみ | なし | C | | 内部ヘルパー |
| getLineRegisteredUsers | 読取 | staffs(Supabase) | フロント: js-admin | なし | B | | Admin 表示 |
| getCampusNotificationRouting | 読取 | Firestore(config/notification_routing) | フロント: js-admin | なし | B | | Admin 設定 |
| updateCampusNotificationRouting | 書込 | Firestore(config/notification_routing) | フロント: js-admin | なし | B | | Admin 設定 |
| sendNotificationByContent | 書込 | Gmail, LINE | GAS 内部のみ | LINE_CHANNEL_ACCESS_TOKEN | C | | GmailApp 依存 |
| checkAndForwardFormEmails | その他 | GmailApp | フロント: js-admin, トリガー(time) | FORM_EMAIL_SENDER | C | | GmailApp 必須 |
| getFormEmailFilterSettings | 読取 | ScriptProperties | フロント: js-admin | FORM_EMAIL_SENDER | B | | Admin 設定・5-E 後 |
| saveFormEmailFilterSettings | 書込 | ScriptProperties | フロント: js-admin | FORM_EMAIL_SENDER | B | | Admin 設定・5-E 後 |
| setupFormEmailTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | C | | ScriptApp 必須 |
| deleteFormEmailTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | C | | ScriptApp 必須 |
| getFormEmailTriggerStatus | 読取 | ScriptApp | フロント: js-admin | なし | C | | ScriptApp 必須 |
| previewTemplateMessage | 読取 | ScriptProperties | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 設定・5-E 後 |
| resolveTemplateForSendDate | 読取 | ScriptProperties | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 設定・5-E 後 |
| getLineSchedulerSettings | 読取 | ScriptProperties | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 設定・5-E 後 |
| saveLineSchedulerSettings | 書込 | ScriptProperties | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 設定・5-E 後 |
| getScheduledLineMessages | 読取 | lineSchedules(Firestore) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 表示 |
| resetAndRegenerateSchedule | 書込 | lineSchedules(Firestore) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 操作・長時間処理 |
| saveScheduledLineMessage | 書込 | lineSchedules(Firestore) | フロント: js-admin | LINE_SCHEDULER_SETTINGS | B | | Admin 操作 |
| deleteScheduledLineMessage | 書込 | lineSchedules(Firestore) | フロント: js-admin | なし | B | | Admin 操作 |
| sendScheduledLineMessageNow | 書込 | MailApp, LINE, lineSchedules | フロント: js-admin | LINE_CHANNEL_ACCESS_TOKEN | C | | MailApp 使用 |
| checkAndSendDueLineMessages | 書込 | MailApp, LINE, Firestore | トリガー(time) | LINE_CHANNEL_ACCESS_TOKEN | C | | MailApp・定時トリガー |
| setupScheduledLineTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | C | | ScriptApp 必須 |
| deleteScheduledLineTrigger | 書込 | ScriptApp | フロント: js-admin, js-admin-ext | なし | C | | ScriptApp 必須 |
| getScheduledLineTriggerStatus | 読取 | ScriptApp | フロント: js-admin | なし | C | | ScriptApp 必須 |


### 9. AI アシスタント・料金表・講習管理・チラシ（features.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getPersonalityInstruction | 読取 | 静的値 | GAS 内部のみ | なし | C | | 内部ヘルパー |
| requestAIAssistant | 書込 | Gemini API, 多くのデータ | フロント: js-admin-ext（AI ウィジェット） | GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, AI_KNOWLEDGE_BASE, PRICING_TABLE_CONFIG | A | 高 | AI 会話・高頻度・主力機能 |
| executeAiAction | 書込 | 多くのデータ | フロント: js-ai-actions | GEMINI_API_KEY 等 | A | 高 | AI アクション実行 |
| getAiKnowledgeBase | 読取 | ScriptProperties | フロント: js-admin-chatbot | AI_KNOWLEDGE_BASE | B | | Admin・5-E 後 |
| saveAiKnowledgeEntry | 書込 | ScriptProperties | フロント: js-admin-chatbot | AI_KNOWLEDGE_BASE | B | | Admin・5-E 後 |
| deleteAiKnowledgeEntry | 書込 | ScriptProperties | フロント: js-admin-chatbot | AI_KNOWLEDGE_BASE | B | | Admin・5-E 後 |
| getAutoLearnedKnowledge | 読取 | aiLearnedKnowledge(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | AI 自動学習一覧 |
| editAutoLearnedKnowledge | 書込 | aiLearnedKnowledge(Supabase) | フロント: js-admin-chatbot | なし | 要相談 | | B-⑱ で PATCH 化済み・GAS 内部完結扱い |
| deleteAutoLearnedKnowledge | 書込 | aiLearnedKnowledge(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | 削除操作 |
| getAiFeedback | 読取 | aiFeedback(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | フィードバック一覧 |
| resolveAiFeedback | 書込 | aiFeedback(Supabase) | フロント: js-admin-chatbot | なし | 要相談 | | B-⑱ で PATCH 化済み・GAS 内部完結扱い |
| deleteAiFeedback | 書込 | aiFeedback(Supabase) | フロント: js-admin-chatbot | なし | A | 中 | 削除操作 |
| getPricingConfigForWeb | 読取 | ScriptProperties | フロント: js-pricing | PRICING_TABLE_CONFIG | A | 中 | 料金表閲覧 |
| savePricingConfig | 書込 | ScriptProperties | 呼出元なし(要確認) | PRICING_TABLE_CONFIG | D | | フロント参照なし |
| addPricingSection | 書込 | ScriptProperties | 呼出元なし(要確認) | PRICING_TABLE_CONFIG | D | | フロント参照なし |
| deletePricingSection | 書込 | ScriptProperties | 呼出元なし(要確認) | PRICING_TABLE_CONFIG | D | | フロント参照なし |
| updatePricingTitle | 書込 | ScriptProperties | 呼出元なし(要確認) | PRICING_TABLE_CONFIG | D | | フロント参照なし |
| updatePricingFooterNotes | 書込 | ScriptProperties | 呼出元なし(要確認) | PRICING_TABLE_CONFIG | D | | フロント参照なし |
| getLecturePeriods | 読取 | ScriptProperties | フロント: 複数画面 | LECTURE_PERIODS_CONFIG | A | 高 | 講習タブ読込時 |
| saveLectureDates | 書込 | ScriptProperties | フロント: js-lectures-admin | LECTURE_PERIODS_CONFIG | B | | Admin 設定・5-E 後 |
| resetLectureDates | 書込 | ScriptProperties | フロント: js-lectures-admin | LECTURE_PERIODS_CONFIG | B | | Admin 設定・5-E 後 |
| saveLecturePeriod | 書込 | ScriptProperties | 呼出元なし(要確認) | LECTURE_PERIODS_CONFIG | D | | フロント参照なし |
| deleteLecturePeriod | 書込 | ScriptProperties | 呼出元なし(要確認) | LECTURE_PERIODS_CONFIG | D | | フロント参照なし |
| saveLectureGradeSettings | 書込 | ScriptProperties | 呼出元なし(要確認) | LECTURE_PERIODS_CONFIG | D | | フロント参照なし |
| getLectureScheduleEntries | 読取 | lectureEntries(Firestore) | フロント: js-lectures | なし | A | 高 | 講習日程表示 |
| saveLectureScheduleEntries | 書込 | lectureEntries(Firestore), LockService | フロント: js-lectures | なし | A | 高 | 講習日程保存（LockService 使用・移行時に要対応） |
| getTeacherNamesMap | 読取 | staffs(Supabase) | フロント: js-core, js-lectures | なし | A | 高 | 教員名マップ・起動時 |
| getLectureTeachers | 読取 | staffs(Supabase) | 呼出元なし(要確認) | なし | D | | フロント参照なし |
| getFlyerImages | 読取 | Drive, Spreadsheet | フロント: js-lectures-flyer, imagen | APP_FOLDER_ID | C | | DriveApp 使用 |
| getFlyerImageBase64 | 読取 | Drive | フロント: js-lectures-flyer, imagen | APP_FOLDER_ID | C | | DriveApp 使用 |
| uploadFlyerImage | 書込 | Drive, Gemini API | フロント: js-lectures-flyer | APP_FOLDER_ID, GEMINI_API_KEY | C | | DriveApp 使用 |
| analyzeFlyerImageMeta | 書込 | Drive, Spreadsheet | フロント: js-lectures-flyer | GEMINI_API_KEY | C | | SpreadsheetApp 使用 |
| deleteFlyerImage | 書込 | Drive, Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | DriveApp 使用 |
| saveFlyerImageTags | 書込 | Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | SpreadsheetApp 使用 |
| generateFlyerWithAI | 書込 | Gemini API, Spreadsheet | フロント: js-lectures-flyer | GEMINI_API_KEY | C | | SpreadsheetApp 使用 |
| saveFlyerAiData | 書込 | Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | SpreadsheetApp 使用 |
| loadFlyerAiData | 読取 | Spreadsheet | フロント: js-lectures-flyer | APP_FOLDER_ID | C | | SpreadsheetApp 使用 |
| getLecturePricingConfig | 読取 | ScriptProperties | フロント: 複数画面 | LECTURE_PRICING_CONFIG | A | 中 | 講習料金設定読込 |
| saveLecturePricing | 書込 | ScriptProperties | フロント: js-lectures-admin | LECTURE_PRICING_CONFIG, PRICING_TABLE_CONFIG | B | | Admin 設定・5-E 後 |
| saveUnifiedLecturePricing | 書込 | ScriptProperties | フロント: js-lectures-admin | LECTURE_PRICING_CONFIG, PRICING_TABLE_CONFIG | B | | Admin 設定・5-E 後 |
| getLectureGreetings | 読取 | ScriptProperties | フロント: js-lectures-materials | LECTURE_GREETINGS_CONFIG | A | 中 | 挨拶文読込 |
| saveLectureGreetings | 書込 | ScriptProperties | フロント: js-lectures-materials | LECTURE_GREETINGS_CONFIG | B | | Admin 設定・5-E 後 |
| getNormalClassConfig | 読取 | ScriptProperties | フロント: js-lectures-admin | NORMAL_CLASS_CONFIG | B | | Admin 設定・5-E 後 |
| saveNormalClassConfig | 書込 | ScriptProperties | フロント: js-lectures-admin | NORMAL_CLASS_CONFIG, PRICING_TABLE_CONFIG | B | | Admin 設定・5-E 後 |
| getNormalClassSectionsForWeb | 読取 | ScriptProperties | フロント: js-lectures-flyer | NORMAL_CLASS_CONFIG | A | 中 | チラシ表示時 |
| ocrLectureSchedule | 書込 | Gemini API | フロント: js-lectures | GEMINI_API_KEY | A | 中 | OCR 機能 |
| parseLectureScheduleFromText | 書込 | Gemini API | フロント: js-lectures | GEMINI_API_KEY | A | 中 | テキストパース |
| generateImageWithImagen | 書込 | Gemini/Imagen API | フロント: js-lectures-imagen | GEMINI_API_KEY | A | 低 | 画像生成・低頻度 |


### 10. 議事録（minutes.js）

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| getMinutesList | 読取 | meeting_minutes(Supabase) | フロント: js-minutes | なし | A | 中 | 議事録一覧 |
| saveMinutes | 書込 | meeting_minutes(Supabase) | フロント: js-minutes | なし | A | 中 | INSERT/UPDATE 両対応・全 8 カラム指定で安全（B-⑱ 調査） |
| deleteMinutes | 書込 | meeting_minutes(Supabase) | フロント: js-minutes | なし | A | 中 | 議事録削除 |
| transcribeAndSummarizeAudio | 書込 | Gemini API | フロント: js-minutes | GEMINI_API_KEY | A | 中 | 音声文字起こし |
| mergeTranscriptsAndSummarize | 書込 | Gemini API | フロント: js-minutes | GEMINI_API_KEY | A | 中 | 要約マージ |


### 11. 移行スクリプト（migrate.js / migrate-to-supabase.js / migrate-lec-grades.js）

すべて一度きりの実行を前提とした移行スクリプト。呼出元なし・再実行リスクあり・全て削除候補。

| 関数名 | 種別 | 対象テーブル/データ | 呼出元 | ScriptProperties依存 | 分類 | 優先度 | 備考 |
|--------|------|-------------------|--------|-------------------|------|--------|------|
| migrateLecGradesDryRun | 書込 | (dry-run) | 呼出元なし(要確認) | なし | D | | migrate-lec-grades.js 一回限り |
| migrateLecGrades | 書込 | staffs | 呼出元なし(要確認) | なし | D | | migrate-lec-grades.js 一回限り |
| migrateStudentsToFirestore | 書込 | students(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateGradesToFirestore | 書込 | grades(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| verifyStudentMigration | 読取 | students(Firestore) | 呼出元なし(要確認) | なし | D | | 検証系・完了済み |
| verifyGradesMigration | 読取 | grades(Firestore) | 呼出元なし(要確認) | なし | D | | 検証系・完了済み |
| migrateSchoolAveragesToFirestore | 書込 | schoolAverages(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateTestAnalysisToFirestore | 書込 | testAnalysis(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateStudentAnalysisToFirestore | 書込 | studentAnalysis(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateAllGradeDataToFirestore | 書込 | 複数コレクション | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateSchedulesToFirestore | 書込 | schedules(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateLectureEntriesToFirestore | 書込 | lectureEntries(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateLineSchedulesToFirestore | 書込 | lineSchedules(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateFlyerAiToFirestore | 書込 | flyerAi(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateImageTagsToFirestore | 書込 | imageTags(Firestore) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateAllPhase5ToFirestore | 書込 | 複数コレクション | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateGradesToSupabase | 書込 | grades(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateSchoolAveragesToSupabase | 書込 | schoolAverages(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateTestAnalysisToSupabase | 書込 | testAnalysis(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateStudentAnalysisToSupabase | 書込 | studentAnalysis(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateAllToSupabase | 書込 | 複数テーブル(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateAiDataToSupabase | 書込 | aiLearnedKnowledge, aiFeedback(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |
| migrateStaffsToSupabase | 書込 | staffs(Supabase) | 呼出元なし(要確認) | なし | D | | 移行系・完了済み |



---

## 集計サマリー

### 総関数数

| 分類 | 件数 |
|------|------|
| A — Workers 化必須 | 57 |
| B — Workers 化推奨（5-E 後） | 60 |
| C — GAS 完結で可 | 44 |
| D — 削除候補 | 37 |
| 要相談（PATCH 化済みで GAS 内部完結扱い） | 2 |
| **合計** | **200** |

> 内訳は概算（前セッション見積り「A 約 40 / B 約 70 / C 約 30 / D 約 25 ≈ 165」に対して、PATCH 化済み 2 件＋移行系 D の網羅的計上で増加）。

### 分類別の優先度内訳（A のみ）

| 優先度 | 件数 | 代表例 |
|--------|------|--------|
| 高 | 17 | `isAdmin`, `getUserRoleInfo`, `getScheduleData`, `getScheduleOverridesBundle`, `getStudentsForDropdown`, `submitStudentInfo`, `getStudentGradeReport`, `getCampusConfigForWeb`, `getGradesConfigForWeb`, `updateUserProfile`, `requestAIAssistant`, `executeAiAction`, `getLecturePeriods`, `getLectureScheduleEntries`, `saveLectureScheduleEntries`, `getTeacherNamesMap`, `getStaffPlacementForWeb` |
| 中 | 38 | `addEmailToTeacher`, `removeEmailFromTeacher`, `ocrAndSaveGradeSheet`, `saveSchoolAverages`, `generateGradeAnalysis`, `generateAllAnalyses`, 成績関連読取多数、`requestAIAssistant` 周辺、`getMinutesList` / `saveMinutes` 等 |
| 低 | 2 | `getSubjectOptions`, `generateImageWithImagen` |

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

### 削除候補（D）の詳細理由

| カテゴリ | 関数 | 理由 |
|----------|------|------|
| 呼出元なし・静的値 | `getAppMetadata`, `testApiEndpoint` | 本番フローで未使用 |
| 呼出元なし・置換済み | `updateEmailAddress`, `linkUserById`, `addScheduleEntry`, `updateCampusName` | 後続関数に置換済み |
| 呼出元なし・初期化/セットアップ系 | `getSetupStatus`, `initFirestoreAllowedUsers`, `initializeGradesConfig`, `initializeApplication` | 初期化は `initializeFirstAdmin` / `manualInitializeSheets` 系に統合 |
| 呼出元なし・手動テスト | `testFetchPublicAverageScorePage` | デバッグ用 |
| 旧 Firestore キャッシュ（廃止済み） | `rebuildGradeSummary`, `rebuildAllGradeSummaries`, `rebuildGradeListCache`, `rebuildGradeReportCache`, `rebuildAllCaches` | Supabase SQL 集計に置換済み。`rebuildGradeReportCache` のみフロント呼出残存するが中身は no-op |
| 分析メタ・呼出元なし | `getLatestGradeAnalysisMeta` | 呼出なし |
| Import 系・呼出元なし | `importScheduleFromGoogleSheetsWithAI`, `importScheduleFromCSVWithAI`, `importScheduleFromPDFWithAI` | `autoImportAllSchedules` に集約されフロント参照なし |
| Pricing API・呼出元なし | `savePricingConfig`, `addPricingSection`, `deletePricingSection`, `updatePricingTitle`, `updatePricingFooterNotes` | 料金表は `getPricingConfigForWeb` 読取のみ。編集は `saveUnifiedLecturePricing` 経由 |
| 講習 Period API・呼出元なし | `saveLecturePeriod`, `deleteLecturePeriod`, `saveLectureGradeSettings` | 編集は `saveLectureDates` / `resetLectureDates` 経由 |
| 講師一覧・呼出元なし | `getLectureTeachers` | `getTeacherNamesMap` / `getStaffPlacementForWeb` に置換 |
| 移行スクリプト（migrate.js） | 14 関数 | Firestore 移行時の一回限り・完了済み |
| 移行スクリプト（migrate-to-supabase.js） | 7 関数 | Supabase 移行時の一回限り・完了済み |
| 移行スクリプト（migrate-lec-grades.js） | 2 関数 | B-⑥ 時の講習担当学年一回限り移行・完了済み |
| 移行スクリプト（admin.js 内） | `migrateStudentsToSupabase`, `migrateLectureEntriesToCampusDocs` | 移行系・完了済み |

---

## 次フェーズへの引き継ぎ

### Phase 5-E（ScriptProperties 移行）の対象

- **分類 B の 60 関数が主対象**。ScriptProperties 依存を KV または Supabase（新規テーブル）に移行することで、Workers 化可能に変わる。
- **5-E 完了後、B → A に昇格させて Workers 移行**する流れ。
- 統合キャッシュ系（`getScheduleOverridesBundle`, `getCachedHolidays`）は A 優先度高で分類済みだが実質 5-E 後の Workers 化が望ましい。

### 次セッションの推奨作業順序

1. **D の削除**（37 関数）
   - 移行系 23 関数 + 呼出元なし 14 関数を削除。
   - `migrate.js` / `migrate-to-supabase.js` / `migrate-lec-grades.js` はファイルごと削除可能（ファイル自体が移行系専用）。
   - `rebuildGradeReportCache` は `firebase-students.html` 側の呼出を先に外してから削除。
2. **A の段階的 Workers 化**（B-⑲ 以降）
   - ScriptProperties 非依存のものから順に着手。
   - 優先度「高」17 件の内、複雑度の低いもの（`getMinutesList` / `saveMinutes` / `deleteMinutes` 等）を早期移行。
3. **B は Phase 5-E でまとめて対応**。
4. **C は Phase 5 完全移行後に判断**（GAS 残し確定 or Workers 代替設計）。

### A 分類の書込系での注意

Workers 化する際は全て **PATCH + 事前 SELECT** パターン（B-⑭〜⑰ で確立）で実装すること。該当候補：

- `updateUserProfile`（staffs）
- `submitStudentInfo`（students）
- `saveSchoolAverages`（schoolAverages）
- `updateNotificationSettings`（staffs）
- `updateLineSchedulerNotifPref`（staffs）
- `saveLectureScheduleEntries`（lectureEntries）— LockService 削除も合わせて検討
- `saveMinutes`（meeting_minutes）

staffs テーブル書込はすべて partial payload 直渡し禁止。`staffToSupabase_` の JSDoc 警告に従うこと。

### 要相談の 2 件

- `editAutoLearnedKnowledge` / `resolveAiFeedback`: B-⑱ で PATCH 化済み・Admin 機能・低頻度。Workers 化しないで GAS 内部完結のまま維持する方針だが、将来 Admin 機能も Workers 側に揃える段階で改めて判断する。

