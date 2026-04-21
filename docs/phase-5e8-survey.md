# Phase 5-E-8a-1: schedule.js 上書き系関数リスト

> Phase 5-E-8a の調査を分割実行するための下準備。
> 関数名・開始行番号・1行要約のみを記録する。詳細調査（KV キー / 認証 / Admin 判定 / 依存関係 / 5-E-7 適合可否）は次セッション（5-E-8a-2 以降）で行う。

## 対象

`main/schedule.js`（980 行・2026-04-21 時点）で KV / ScriptProperties / Firestore いずれかに書き込みを行う関数を全量抽出した。

- 5-E-0 の D 分類削除後の現存関数
- `_` サフィックスの内部ヘルパーも、書き込みを行うものは対象に含める（5-E-8b の Workers 化で公開関数から呼ばれる可能性があるため）
- 読取専用のゲッター（`getBasicTestDateOverrides` 等）や `getScheduleOverridesBundle` は本リストの対象外（別途 5-E-7 読取パターンで扱う想定）

## 抽出結果（22 件）

### 公開関数（非 `_` サフィックス・16 件）

| # | 関数名 | 開始行 | 1 行要約 |
|---|--------|-------|---------|
| 1 | `addCustomScheduleEntry` | 198 | Firestore `schedules` に Admin 直接入力のカスタム予定を追加 |
| 2 | `deleteCustomScheduleEntry` | 488 | Firestore `schedules` から Admin 直接入力の予定を 1 件削除 |
| 3 | `updateSchedules` | 509 | Drive 年度フォルダを走査して `autoImportAllSchedules` を呼び出す（現状 `getScheduleFolder` が null を返すため実質 no-op） |
| 4 | `setBasicTestDateOverride` | 588 | KV `BASIC_TEST_DATES` に基礎学力テスト日程の上書き設定を保存 |
| 5 | `deleteBasicTestDateOverride` | 610 | KV `BASIC_TEST_DATES` から該当テスト回の上書き設定を削除 |
| 6 | `setBasicTestDetails` | 647 | KV `BASIC_TEST_DETAILS` に基礎学力テストの詳細テキスト上書きを保存 |
| 7 | `deleteBasicTestDetails` | 667 | KV `BASIC_TEST_DETAILS` から詳細テキスト上書きを削除してデフォルト（中 3）に戻す |
| 8 | `setPublicHighExamDateOverride` | 702 | KV `PUBLIC_HIGH_EXAM_DATES` に公立高校一般選抜日程の上書きを保存 |
| 9 | `deletePublicHighExamDateOverride` | 721 | KV `PUBLIC_HIGH_EXAM_DATES` から該当年度の上書きを削除 |
| 10 | `setJukuEventOverride` | 759 | KV `JUKU_EVENT_OVERRIDES` に塾内部イベントの上書きを保存（`'none'` 指定で `false` を格納し無効化） |
| 11 | `deleteJukuEventOverride` | 785 | KV `JUKU_EVENT_OVERRIDES` から該当月の上書きを削除して自動計算に戻す |
| 12 | `addClosedDayExtra` | 821 | KV `CLOSED_DAYS_OVERRIDES.add` に臨時休校日を追加し `del` から除外 |
| 13 | `removeComputedClosedDay` | 843 | KV `CLOSED_DAYS_OVERRIDES.del` に計算上の休校日を除外対象として追加 |
| 14 | `deleteClosedDayOverride` | 865 | KV `CLOSED_DAYS_OVERRIDES.add/del` 両方から対象日を削除して元の計算値に戻す |
| 15 | `setLectureDeadlineOverride` | 907 | KV `LECTURE_DEADLINE_OVERRIDES` に講習締切日の上書きを保存 + `logAdminAction` |
| 16 | `deleteLectureDeadlineOverride` | 926 | KV `LECTURE_DEADLINE_OVERRIDES` から該当講習の上書きを削除 + `logAdminAction` |

### 内部ヘルパー（`_` サフィックス・6 件）

| # | 関数名 | 開始行 | 1 行要約 |
|---|--------|-------|---------|
| 17 | `saveScheduleEntryToFirestore_` | 66 | Firestore `schedules` に予定エントリを保存する共通ヘルパー（docId 合成・source 別ルール付き） |
| 18 | `addScheduleEntryAI_` | 226 | AI アシスタント経由で Firestore `schedules` に予定を追加（`source='AI入力'`） |
| 19 | `editScheduleEntryAI_` | 277 | Firestore `schedules` の既存エントリを AI 経由で更新（Admin 直接入力 / AI 入力のみ対象） |
| 20 | `deleteScheduleEntryAI_` | 322 | Firestore `schedules` から AI 経由でエントリを削除（Admin 直接入力 / AI 入力のみ対象） |
| 21 | `editScheduleEntryAI_Extended_` | 381 | Firestore `schedules` の任意エントリを AI 経由で更新（`source` 制限なし・import 系は新 docId に移行） |
| 22 | `deleteScheduleEntryAI_Extended_` | 441 | Firestore `schedules` の任意エントリを AI 経由で削除（`source` 制限なし） |

## 次セッション（5-E-8a-2）での調査対象

本抽出結果をもとに、以下のように前半・後半に分けて詳細調査を進める予定。

### 5-E-8a-2（前半・KV 系 13 件）

ScriptProperties（KV）上書き管理に集中する 13 関数：

1. `setBasicTestDateOverride`
2. `deleteBasicTestDateOverride`
3. `setBasicTestDetails`
4. `deleteBasicTestDetails`
5. `setPublicHighExamDateOverride`
6. `deletePublicHighExamDateOverride`
7. `setJukuEventOverride`
8. `deleteJukuEventOverride`
9. `addClosedDayExtra`
10. `removeComputedClosedDay`
11. `deleteClosedDayOverride`
12. `setLectureDeadlineOverride`
13. `deleteLectureDeadlineOverride`

### 5-E-8a-3（後半・Firestore 系 9 件）

Firestore `schedules` コレクション書き込みの 9 関数（`updateSchedules` は Drive 依存のためここに含める）：

1. `addCustomScheduleEntry`
2. `deleteCustomScheduleEntry`
3. `updateSchedules`
4. `saveScheduleEntryToFirestore_`
5. `addScheduleEntryAI_`
6. `editScheduleEntryAI_`
7. `deleteScheduleEntryAI_`
8. `editScheduleEntryAI_Extended_`
9. `deleteScheduleEntryAI_Extended_`
