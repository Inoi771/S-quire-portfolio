DATA.mdです。

markdown# DATA.md — データ構造・プロパティ一覧

> このファイルは Claude が必要時に自動で読み込む。
> スクリプトプロパティ・データ構造の詳細はすべてここを参照。

---

## スクリプトプロパティ（ScriptProperties）

### PROP_KEYS（code.js で定数定義）

| キー | 内容 |
|------|------|
| `GEMINI_API_KEY` | Gemini API キー |
| `GEMINI_API_KEY_BACKUP` | 予備 Gemini API キー（レート制限時に自動切替・任意） |
| `APP_FOLDER_ID` | Google Drive ルートフォルダID（必須・未設定時全機能停止） |
| `THEME_COLOR` | UIテーマカラー（デフォルト: `#43e97b`） |
| `ADMIN_EMAILS` | Adminユーザーのメール（カンマ区切り） |
| `HOLIDAY_CACHE` | 祝日キャッシュ（JSON。Googleカレンダーから毎日自動更新） |
| `ACCESS_FOLDER_ID` | アクセス許可フォルダID（設定時は APP_FOLDER_ID より優先） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API トークン |
| `LINE_SCHEDULER_SETTINGS` | LINEスケジューラー設定（JSON） |
| `AI_KNOWLEDGE_BASE` | AIナレッジベース（JSON配列: `[{id, category, content, updatedAt}]`） |
| `LECTURE_DEADLINE_OVERRIDES` | 講習日程締切手動上書き（JSON: `{"2025-summer": "2025-06-15"}`） |
| `FIREBASE_PROJECT_ID` | Firebase プロジェクトID（例: `fir-quire`） |
| `FIREBASE_CLIENT_EMAIL` | Firebase サービスアカウントメール |
| `FIREBASE_PRIVATE_KEY` | Firebase サービスアカウント秘密鍵（PEM形式） |
| `SUPABASE_URL` | Supabase プロジェクトURL（例: `https://xxxxx.supabase.co`）— 成績データ用 |
| `SUPABASE_ANON_KEY` | Supabase anon（公開）キー — 成績データ用 |
| `SUPABASE_SERVICE_KEY` | Supabase service_role キー — 成績データ用 |

> **Firestore に移行済み（PROP_KEYS から削除）:**
> `TEACHER_ID_MAP` → `staffs` コレクション / `LINE_USER_MAPPING` → `staffs.lineUserId` / `NOTIFICATION_METHODS` → `staffs.notificationMethod` / `NOTIFICATION_EMAILS` → `staffs.notificationEmail` / `LINE_SCHEDULER_NOTIF_PREFS` → `staffs.schedulerNotifPrefs` / `CAMPUS_NOTIFICATION_ROUTING` → `config/notification_routing`

### 文字列リテラルで使用（PROP_KEYS 未定義だがコードで直接使用）

| キー | 内容 | 使用ファイル |
|------|------|------------|
| `FIREBASE_WEB_API_KEY` | Firebase Web API キー（未設定時はハードコードのフォールバック使用） | auth.js |
| `BASIC_TEST_DATES` | 基礎学力テスト日程上書き（JSON: `{"2025-1": "2025/10/01"}`） | schedule.js, features.js |
| `BASIC_TEST_DETAILS` | 基礎学力テスト詳細テキスト上書き（JSON） | schedule.js |
| `PUBLIC_HIGH_EXAM_DATES` | 公立高校一般選抜日程上書き（JSON: `{"2025": "2026/03/11"}`） | schedule.js, features.js |
| `JUKU_EVENT_OVERRIDES` | 塾内部イベント上書き（JSON） | schedule.js |
| `CLOSED_DAYS_OVERRIDES` | 休校日上書き（JSON: `{"add":[], "del":[]}`） | schedule.js, line.js |
| `FORM_EMAIL_SENDER` | フォームメール送信元フィルター（デフォルト: `noreply@web-cms.jp`） | line.js |

---

## 成績管理設定プロパティ（CONFIG_PROP_KEYS）

| キー | 内容 |
|------|------|
| `GRADES_TEST_NAMES_CONFIG` | テスト名リスト（JSON配列） |
| `GRADES_CAMPUS_CODES_CONFIG` | 校舎コード・名前リスト（JSON: `[{code, name}]`） |
| `GRADES_GRADE_CODES_CONFIG` | 学年コード・名前リスト（JSON: `[{code, name}]`） |
| `GRADES_VISIBLE_CONFIG` | 表示する学年コードの配列（例: `["13","14","15"]`） |
| `GRADES_SCHOOL_CONFIG` | 志望校リスト（JSON: `[{name, departments:[]}]`） |
| `GRADES_SIGMA_CONFIG` | 偏差値計算用の標準偏差設定（JSON） |
| `PRICING_TABLE_CONFIG` | 料金表データ（JSON） |
| `LECTURE_PERIODS_CONFIG` | 講習期間設定（JSON: `[{id, name, startDate, endDate, gradeSettings}]`） |
| `LECTURE_PRICING_CONFIG` | 講習別料金設定（JSON: `{typeId: [{label, internal, external}]}`） |
| `LECTURE_GREETINGS_CONFIG` | 講習別学年挨拶文（JSON: `{typeId: {gradeKey: "挨拶文", ...}, ...}`）。typeId: spring/summer/kiso1/kiso2/winter/nyushi。gradeKey: sho/chu1/chu2/chu3/ko1/ko2/ko3（kiso1/kiso2/nyushi は chu3 のみ）。年度不問・永続保存。使用: `getLectureGreetings()` / `saveLectureGreetings()` |
| `NORMAL_CLASS_CONFIG` | 通常授業設定（JSON: `{version:2, sections:[{id, name, campusScope:"all"\|"specific", campusCodes:[], headers:[], rows:[][], notes:[]}]}`）。保存時に料金表へ自動同期。 |

---

## UserProperties（ユーザーごと）

⚠️ `PropertiesService.getUserProperties()` は直接使用禁止。必ず `getUserProperty()` / `setUserProperty()` ヘルパーを使うこと。

`STAFF_FIELD_MAP_`（settings.js）で定義された項目は Supabase `staffs` テーブルに自動ルーティングされる。それ以外は従来通り `_UP_{safeEmail}_{key}` 形式で ScriptProperties に保存。

### Supabase `staffs` に移行済み（`getUserProperty()`/`setUserProperty()` 経由で自動ルーティング）

| キー | Supabase カラム | 内容 |
|------|---------------------|------|
| `DISPLAY_NAME` | `displayName` | 表示名 |
| `SUBJECTS` | `subjects` | 担当教科（JSON配列） |
| `PREFERRED_CAMPUSES` | `preferredCampuses` | 配属校舎コード配列（JSON） |
| `AI_ASSISTANT_NAME` | `aiAssistantName` | AIアシスタント名（デフォルト: `イノイマン`） |
| `AI_PERSONALITY` | `aiPersonality` | 喋り方（polite/friendly/energetic/cool/kansai/hakata/tohoku/nagoya/awa） |
| `USER_THEME_COLOR` | `themeColor` | ユーザー個別テーマカラー |
| `TEACHER_ID` | `teacherId` | 講師ID（`T{timestamp}_{random}`） |
| `REGISTERED_EMAIL` | `email` | 登録メールアドレス |

---

## シート列構成

### 生徒マスタ（`生徒一覧`）

| 列 | 内容 |
|----|------|
| 1 | 生徒ID |
| 2 | 校舎CD |
| 3 | 姓（漢字） |
| 4 | 名（漢字） |
| 5 | 姓ふりがな |
| 6 | 名ふりがな |
| 7 | 学校名 |
| 8 | 削除済み（true/false） |
| 9 | 登録日時 |
| 10〜16 | 受験校1・2（中3専用） |

### 成績データ（`成績一覧`）

| 列 | 内容 |
|----|------|
| 1 | 生徒ID |
| 2 | テスト名 |
| 3〜7 | 国語・社会・数学・理科・英語 |
| 8 | 合計点 |
| 9 | 平均点 |
| 10〜13 | 志望校1・2（名前・学科） |
| 14 | 記録日時 |
| 15 | 氏名 |

### 予定データ（`予定一覧`）

| 列 | 内容 |
|----|------|
| 1 | 更新日時 |
| 2 | 学校名 |
| 3 | 予定種類 |
| 4 | 月日 |
| 5 | 詳細 |
| 6 | 情報源 |

---

## 生徒ID体系

形式: `{校舎CD2桁}{登録年度4桁}{登録学年コード2桁}{連番2桁}`
例: `012025130X` → 校舎01・2025年度・中1・連番01

学年コード: 小1=07〜小6=12、中1=13〜中3=15、高1=16〜高3=18

現在学年の動的計算:
```
現在学年 = 登録学年コード + (現在年度 - 登録年度)
有効範囲: 07〜18
```

---

## Firestore コレクション構成

| コレクション | DocId形式 | 用途 |
|------------|---------|------|
| ~~`staffs`~~ | — | **Supabaseに移行済み**（`staffs` テーブル） |
| `allowedUsers` | `{email}`（小文字メールアドレス） | Firestoreセキュリティルール用ホワイトリスト。登録されたメールのユーザーのみFirestoreデータにアクセス可。フィールド: `email`(string), `addedAt`(ISO 8601文字列)。自動登録: `getAppStartupData()`, `addUserAccess()`, `linkUserById()`, `addEmailToTeacher()`。自動削除: `removeUserAccess()`, `removeEmailFromTeacher()`。GASサーバー側（サービスアカウント）からのみ書き込み可。クライアントSDKからは書き込み不可（`allow write: if false`） |
| `config` | `notification_routing` | システム設定（校舎別通知振り分け: `{"campusCode": ["teacherId1"]}`） |
| ~~`students`~~ | — | **Supabaseに移行済み**（Firestoreのコレクションはバックアップとして残存・読み書き不使用） |
| ~~`grades`~~ | — | **Supabaseに移行済み** |
| ~~`schoolAverages`~~ | — | **Supabaseに移行済み** |
| ~~`testAnalysis`~~ | — | **Supabaseに移行済み** |
| ~~`studentAnalysis`~~ | — | **Supabaseに移行済み** |
| ~~`distCache`~~ | — | **廃止（SQL集計で代替）** |
| `schedules` | `{year}_admin_{ms}` / `{year}_{school}_{type}_{date}` | 月間スケジュール |
| `lectureEntries` | `{lectureId}_{campusCode}_{entryId}` | 講習日程 |
| `lineSchedules` | `sch_{YYYYMM}_{type}` | LINEスケジューラー |
| `flyerAi` | `{lectureId}_{campusCode}` | AIチラシHTML |
| `imageTags` | `{driveFileId}` | チラシ用画像タグ |
| `operationLogs` | `log_{ms}_{random5}` | 操作ログ |
| ~~`aiLearnedKnowledge`~~ | — | **Supabaseに移行済み**（`ai_learned_knowledge` テーブル） |
| ~~`aiFeedback`~~ | — | **Supabaseに移行済み**（`ai_feedback` テーブル） |
| ~~`gradesMeta`~~ | — | **廃止（Supabase SQL集計で代替: `get_grades_years()`）** |
| ~~`gradeSummaries`~~ | — | **廃止（Supabase SQL集計で代替: `get_campus_averages()`）** |
| ~~`gradeListCache`~~ | — | **廃止（フロントがGAS API経由で取得）** |
| ~~`gradeReportCache`~~ | — | **廃止（フロントがGAS API経由で取得）** |

---

## Supabase（PostgreSQL）テーブル構成

Firestore Spark無料プランの読み取り上限対策として、成績関連データ・生徒マスタ・AIアシスタントデータをSupabaseに移行。

| テーブル | 主キー | 用途 |
|---------|--------|------|
| `students` | `id` (`{campus2}{year4}{grade2}{seq2}`) | 生徒マスタ。`student_id`, `campus`, `registration_year`, `registration_grade`, `sei`, `mei`, `sei_furigana`, `mei_furigana`, `school_name`, `is_deleted`, `created_at`, 受験情報7フィールド |
| `grades` | `id` (`{studentId}_{safeTestName}_{fiscalYear}`) | 成績データ。`student_id`, `test_name`, `fiscal_year`, 5教科+合計+平均, 志望校, `campus`, `student_name`, `recorded_at` |
| `school_averages` | `id` (`{year}_{safeTestName}`) | 学校別平均点。`year`, `test_name`, `averages`(JSONB: `[{schoolName, kokugo, shakai, ...}]`), `updated_at` |
| `test_analysis` | `id` (`{year}_{safeTestName}`) | テスト全体AI分析。`year`, `test_name`, `analysis_json`(JSONB), `generated_at` |
| `student_analysis` | `id` (`{studentId}_{safeTestName}_{year}`) | 生徒別AI分析。`student_id`, `test_name`, `year`, `analysis_json`(JSONB), `generated_at` |
| `ai_learned_knowledge` | `id` (`lk_{ms}`) | AI自動学習ナレッジ。`category`, `content`, `reason`, `source`, `learned_at`, `updated_at` |
| `ai_feedback` | `id` (`fb_{ms}`) | AIフィードバック。`type`, `summary`, `user_query`, `resolved`, `created_at`, `resolved_at` |
| `staffs` | `id` (`{teacherId}`) | スタッフ情報。`email`, `emails`(TEXT[]), `firebase_uid`, `firebase_uids`(TEXT[]), `display_name`, `line_user_id`, `notification_method`, `ai_assistant_name`, `ai_personality`, `theme_color` 等 |

### SQL関数（RPC）

| 関数名 | 代替対象 | 用途 |
|--------|---------|------|
| `get_campus_averages(p_year, p_test)` | gradeSummaries | 校舎別5教科平均（campus カラムで GROUP BY） |
| `get_grades_years()` | gradesMeta | `SELECT DISTINCT fiscal_year` で年度リスト |
| `get_grade_breakdown(p_year, p_test)` | gradeSummaries.gradeBreakdown | 学年コード別人数 |
| `get_distribution(p_year, p_test)` | distCache | 教科別10点刻み＋合計50点刻みヒストグラム |
| `get_deviation_stats(p_year, p_test)` | gradeReportCache | 偏差値計算用の平均・標準偏差 |

---

**Firestore利用上の注意：**
- 複合クエリ（AND）はコンポジットインデックスが必要なため、フィルターは1条件にしてクライアント側で追加フィルタリングすること
- `firestoreQuery_` の結果には `_id` フィールドが自動付加される

---

## Firestore セキュリティルール

本番のFirestoreルールは以下の構成（Firebase コンソールで管理。CIからはデプロイ不可）：

1. `allowedUsers/{email}`: 自分のドキュメントのみ読み取り可。書き込みはサービスアカウント（GAS）のみ
2. その他全コレクション: `request.auth != null` かつ `allowedUsers` にメールが存在するユーザーのみアクセス可

リポジトリの `firestore.rules` は本番と一致させること（ただしCIからはデプロイされない）。
ルールの変更は必ず Firebase コンソールから手動で行うこと。
