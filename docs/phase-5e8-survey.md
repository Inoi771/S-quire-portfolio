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

---

## 前半 13 関数 詳細調査（Phase 5-E-8a-2）

### 共通前提

- **KV キー名規約**: GAS 側の `getProperty()` / `setProperty()` は `kv-props.js` 経由で `prop:<KEY>` に書き込む。Workers 側で直接アクセスする場合も `PROP_PREFIX = 'prop:'` を付与する（`workers/src/functions/kv.js` / `workers/src/functions/settings.js` と一致）。
- **認証要件**: 13 関数すべてフロントエンド（`js-admin-ext` / `js-admin-lec-deadline`）から呼ばれる公開関数。Workers 化した場合は router.js の既定ルート（`PUBLIC_FUNCTIONS` にも `INTERNAL_FUNCTIONS` にも属さない）となるため、**Firebase ID トークン必須**（`verifyFirebaseIdToken`）。5-E-7 `getSettings` / `updateSettings` と同じ認証経路。
- **Admin 判定規約**: GAS 側は `isAdmin()`（`auth.js`）。Workers 側では 5-E-7 で導入した `isAdminUser_(env, user)`（`workers/src/functions/settings.js` 内 private ヘルパー）と同じパターンで `env.KV.get('prop:ADMIN_EMAILS')` → `env.ADMIN_EMAILS` フォールバックを利用できる。
- **共通依存**: `isAdmin()`（`auth.js:99`）, `getProperty()` / `setProperty()`（`auth.js:64,77` → `kv-props.js:125,163`）。

### 調査結果表

| # | 関数名 | KV キー | 認証 | Admin 判定 | 追加依存 | 5-E-7 同質 |
|---|--------|---------|------|-----------|---------|-----------|
| 1 | `setBasicTestDateOverride` | `prop:BASIC_TEST_DATES` | Firebase IDトークン必須 | 必要 | なし（JSON.parse / stringify のみ） | **yes** |
| 2 | `deleteBasicTestDateOverride` | `prop:BASIC_TEST_DATES` | Firebase IDトークン必須 | 必要 | なし | **yes** |
| 3 | `setBasicTestDetails` | `prop:BASIC_TEST_DETAILS` | Firebase IDトークン必須 | 必要 | なし | **yes** |
| 4 | `deleteBasicTestDetails` | `prop:BASIC_TEST_DETAILS` | Firebase IDトークン必須 | 必要 | なし | **yes** |
| 5 | `setPublicHighExamDateOverride` | `prop:PUBLIC_HIGH_EXAM_DATES` | Firebase IDトークン必須 | 必要 | なし | **yes** |
| 6 | `deletePublicHighExamDateOverride` | `prop:PUBLIC_HIGH_EXAM_DATES` | Firebase IDトークン必須 | 必要 | なし | **yes** |
| 7 | `setJukuEventOverride` | `prop:JUKU_EVENT_OVERRIDES` | Firebase IDトークン必須 | 必要 | なし（`'none'` 分岐で `false` を格納する特殊ロジック内包） | **条件付き yes** |
| 8 | `deleteJukuEventOverride` | `prop:JUKU_EVENT_OVERRIDES` | Firebase IDトークン必須 | 必要 | なし | **yes** |
| 9 | `addClosedDayExtra` | `prop:CLOSED_DAYS_OVERRIDES` | Firebase IDトークン必須 | 必要 | なし（`add`/`del` デュアルリスト管理） | **条件付き yes** |
| 10 | `removeComputedClosedDay` | `prop:CLOSED_DAYS_OVERRIDES` | Firebase IDトークン必須 | 必要 | なし（`add`/`del` デュアルリスト管理） | **条件付き yes** |
| 11 | `deleteClosedDayOverride` | `prop:CLOSED_DAYS_OVERRIDES` | Firebase IDトークン必須 | 必要 | なし（`add`/`del` 両方から filter 除去） | **条件付き yes** |
| 12 | `setLectureDeadlineOverride` | `prop:LECTURE_DEADLINE_OVERRIDES` | Firebase IDトークン必須 | 必要 | `PROP_KEYS`（`code.js:29`）, `safeJsonParse_`（`code.js:121`）, **`logAdminAction`（`admin.js:90` → Firestore `operationLogs` 書込）** | **条件付き no** |
| 13 | `deleteLectureDeadlineOverride` | `prop:LECTURE_DEADLINE_OVERRIDES` | Firebase IDトークン必須 | 必要 | `PROP_KEYS`, `safeJsonParse_`, **`logAdminAction`** | **条件付き no** |

### 同質性判定の根拠

#### yes（完全同質・7 件）

`#1`, `#2`, `#3`, `#4`, `#5`, `#6`, `#8` は `updateSettings` と同じ 4 手順で Workers 化できる：

1. `isAdminUser_(env, user)` で Admin 判定
2. `await env.KV.get(PROP_PREFIX + KEY)` で現在値を取得
3. `JSON.parse` → プロパティ更新（add/delete by composite key）→ `JSON.stringify`
4. `await env.KV.put(PROP_PREFIX + KEY, ...)` で書き戻し

戻り値形状（`{ success, message?, error? }`）も既存 GAS 関数と `updateSettings` で一致。

#### 条件付き yes（軽微な特殊ロジック・4 件）

`#7`, `#9`, `#10`, `#11` は KV I/O 自体は単純だが、値の構造に特殊ロジックがある：

- **`#7 setJukuEventOverride`**: `dateStr === 'none'` のとき値を `false`（無効化フラグ）で格納、それ以外は `{ date, details }` オブジェクト。→ Workers 側で同じ分岐をそのまま移植すれば OK。
- **`#9 addClosedDayExtra`**: `add` 配列に追加しつつ `del` 配列から同じ日付を除外（両リストを同期）。
- **`#10 removeComputedClosedDay`**: `del` 配列に追加しつつ `add` 配列から除外（`#9` の対称）。
- **`#11 deleteClosedDayOverride`**: `add`/`del` 両方から filter 除去。

いずれも KV 読込 → JavaScript で配列操作 → KV 書込、という settings パターンの素直な拡張。Workers 移行時に特殊ロジックをそのまま移植できる。

#### 条件付き no（Firestore 副作用あり・2 件）

`#12 setLectureDeadlineOverride` / `#13 deleteLectureDeadlineOverride` は KV 書込後に `logAdminAction()` を呼ぶ。`logAdminAction` は `recordOperationLog` 経由で **Firestore `operationLogs` コレクションへの書き込み**を行うため、settings パターンの単純 KV 書込だけでは完結しない。

対応方針の選択肢（実装は 5-E-8b で決定）：

- **A**: Workers 側でも `firestoreSet` を呼んで `operationLogs` に書き込む（既存 `workers/src/firebase.js` の `firestoreSet` を利用可能）。
- **B**: 今回の Workers 移行では `logAdminAction` 相当の副作用をスキップし、GAS フォールバックに残す（Admin 操作の監査ログ粒度が下がる点に注意）。
- **C**: `operationLogs` 書込を Workers 共通の Admin 書込ラッパーに切り出す（5-E-8b 以降で新規ヘルパー化）。

### 備考

- `PROP_KEYS.LECTURE_DEADLINE_OVERRIDES` は `code.js:29` で `'LECTURE_DEADLINE_OVERRIDES'` に展開されるため、Workers 側では即値 `'LECTURE_DEADLINE_OVERRIDES'` を使えば十分。`PROP_KEYS` 定数を Workers 側に持ち込む必要はない。
- `safeJsonParse_` は失敗時のみデフォルト値を返す防御的ラッパー。Workers 側では `try/catch` で代替可能（5-E-7 `updateSettings` も明示 try/catch）。
- 13 関数すべて **Admin 判定必須**（一般ユーザーはアクセス不可）。`isAdminUser_` の呼び出しは 13 回発生するため、5-E-7 と同様 lazy evaluation（`ensureAdmin()` クロージャ）で 1 回に絞る最適化は不要（各関数は Admin 判定 1 回で完結するため）。

### 集計

| 分類 | 件数 | 関数 |
|------|------|------|
| 5-E-7 完全同質（yes） | **7** | `#1` `#2` `#3` `#4` `#5` `#6` `#8` |
| 条件付き同質（軽微な特殊ロジック） | **4** | `#7` `#9` `#10` `#11` |
| 条件付き非同質（Firestore 副作用） | **2** | `#12` `#13` |
| Admin 判定必須 | **13**（全件） | ─ |
