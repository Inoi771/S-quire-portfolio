DATA.mdです。

markdown# DATA.md — データ構造・プロパティ一覧

> このファイルは Claude が必要時に自動で読み込む。
> スクリプトプロパティ・データ構造の詳細はすべてここを参照。

---

## スクリプトプロパティ（ScriptProperties）

| キー | 内容 |
|------|------|
| `GEMINI_API_KEY` | Gemini API キー |
| `APP_FOLDER_ID` | Google Drive ルートフォルダID（必須・未設定時全機能停止） |
| `THEME_COLOR` | UIテーマカラー（デフォルト: `#43e97b`） |
| `ADMIN_EMAILS` | Adminユーザーのメール（カンマ区切り） |
| `ACCESS_FOLDER_ID` | アクセス許可フォルダID（設定時は APP_FOLDER_ID より優先） |
| `BASIC_TEST_DATES` | 基礎学力テスト日程上書き（JSON: `{"2025-1": "2025/10/01"}`） |
| `BASIC_TEST_DETAILS` | 基礎学力テスト詳細テキスト上書き（JSON） |
| `PUBLIC_HIGH_EXAM_DATES` | 公立高校一般選抜日程上書き（JSON: `{"2025": "2026/03/11"}`） |
| `JUKU_EVENT_OVERRIDES` | 塾内部イベント上書き（JSON） |
| `CLOSED_DAYS_OVERRIDES` | 休校日上書き（JSON: `{"add":[], "del":[]}`） |
| `HOLIDAY_CACHE` | 祝日キャッシュ（JSON。毎日自動更新） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API トークン |
| `LINE_USER_MAPPING` | LINE UserID マッピング（JSON。Webhookで自動登録） |
| `NOTIFICATION_METHODS` | 通知方法設定（JSON: `{"teacherId": "gmail"/"line"/"both"/"none"}`） |
| `CAMPUS_NOTIFICATION_ROUTING` | 校舎別通知振り分け（JSON: `{"campusCode": ["teacherId1"]}`） |
| `LINE_SCHEDULER_SETTINGS` | LINEスケジューラー設定（JSON） |
| `LINE_SCHEDULER_NOTIF_PREFS` | ユーザー別通知方法設定（JSON） |
| `FLYER_ALL_CONFIGS` | チラシ設定一括保存（JSON） |
| `FORM_EMAIL_SENDER` | フォームメール送信元フィルター（デフォルト: `noreply@web-cms.jp`） |
| `AI_KNOWLEDGE_BASE` | AIナレッジベース（JSON配列） |
| `LECTURE_DEADLINE_OVERRIDES` | 講習日程締切手動上書き（JSON: `{"2025-summer": "2025-06-15"}`） |

---

## 成績管理設定プロパティ（CONFIG_PROP_KEYS）

| キー | 内容 |
|------|------|
| `GRADES_TEST_NAMES_CONFIG` | テスト名リスト（JSON配列） |
| `GRADES_CAMPUS_CODES_CONFIG` | 校舎コード・名前リスト（JSON: `[{code, name}]`） |
| `GRADES_VISIBLE_CONFIG` | 表示する学年コードの配列（例: `["13","14","15"]`） |
| `GRADES_SCHOOL_CONFIG` | 志望校リスト（JSON） |
| `PRICING_TABLE_CONFIG` | 料金表データ（JSON） |
| `LECTURE_PERIODS_CONFIG` | 講習期間設定（JSON: `[{id, name, startDate, endDate, gradeSettings}]`） |
| `LECTURE_PRICING_CONFIG` | 講習別料金設定（JSON） |
| `NORMAL_CLASS_CONFIG` | 通常授業設定（JSON） |

---

## UserProperties（ユーザーごと）

⚠️ `PropertiesService.getUserProperties()` は直接使用禁止。必ず `getUserProperty()` / `setUserProperty()` ヘルパーを使うこと（`_UP_{safeEmail}_{key}` 形式でScriptPropertiesに保存）。

| キー | 内容 |
|------|------|
| `DISPLAY_NAME` | 表示名 |
| `SUBJECTS` | 担当教科（JSON配列） |
| `TEACHER_ID` | 講師ID（`T{timestamp}_{random}`） |
| `REGISTERED_EMAIL` | 登録メールアドレス |
| `AI_ASSISTANT_NAME` | AIアシスタント名（デフォルト: `イノイマン`） |
| `AI_PERSONALITY` | 喋り方（polite/friendly/energetic/cool/kansai/hakata/tohoku/nagoya/awa） |
| `USER_THEME_COLOR` | ユーザー個別テーマカラー |
| `PREFERRED_CAMPUSES` | 配属校舎コード配列（JSON） |
| `GEMINI_DAILY_DATE` | Gemini使用量：今日の日付 |
| `GEMINI_DAILY_CALLS` | Gemini使用量：今日の呼び出し回数 |
| `GEMINI_DAILY_TOKENS` | Gemini使用量：今日のトークン数 |
| `GEMINI_DAILY_OPS` | Gemini使用量：直近20件の操作一覧 |
| `GEMINI_MONTHLY_KEY` | Gemini使用量：今月のキー |
| `GEMINI_MONTHLY_CALLS` | Gemini使用量：今月の呼び出し回数 |
| `GEMINI_MONTHLY_TOKENS` | Gemini使用量：今月のトークン数 |

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
| `students` | `{campus2}{year4}{grade2}{seq2}` | 生徒情報 |
| `grades` | `{studentId}_{safe(testName)}` | 成績データ |
| `schoolAverages` | `{year}_{safe(school)}_{safe(testName)}` | 学校別平均点 |
| `testAnalysis` | `{year}_{safe(testName)}` | テスト全体AI分析 |
| `studentAnalysis` | `{studentId}_{safe(testName)}` | 生徒別AI分析 |
| `schedules` | `{year}_admin_{ms}` / `{year}_{school}_{type}_{date}` | 月間スケジュール |
| `lectureEntries` | `{lectureId}_{campusCode}_{entryId}` | 講習日程 |
| `lineSchedules` | `sch_{YYYYMM}_{type}` | LINEスケジューラー |
| `flyerAi` | `{lectureId}_{campusCode}` | AIチラシHTML |
| `imageTags` | `{driveFileId}` | チラシ用画像タグ |
| `operationLogs` | `log_{ms}_{random5}` | 操作ログ |

**Firestore利用上の注意：**
- 複合クエリ（AND）はコンポジットインデックスが必要なため、フィルターは1条件にしてクライアント側で追加フィルタリングすること
- `firestoreQuery_` の結果には `_id` フィールドが自動付加される
