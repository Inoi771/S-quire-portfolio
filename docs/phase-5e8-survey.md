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

---

## 後半 9 関数 詳細調査（Phase 5-E-8a-3）

### 共通前提

- 調査対象は Firestore `schedules` コレクションに書き込みを行う関数群 + Drive 系の `updateSchedules` + 内部ヘルパー `saveScheduleEntryToFirestore_`。
- Workers 側の Firestore 書込は `workers/src/firebase.js` の `firestoreSet` を利用可能（既存実装）。
- `firestoreGet_` / `firestoreDelete_` / `firestoreQuery_` / `fsFilter_` の Workers 版は `workers/src/firebase.js` にある `firestoreGet` / `firestoreDelete` / `firestoreQuery` / `fsFilter` に相当。
- 認証経路は 13 関数と同じく `verifyFirebaseIdToken`（router.js 既定）。
- 呼び出し元の確認（`features.js` 内 grep）:
  - `addScheduleEntryAI_` → `features.js:1808`
  - `editScheduleEntryAI_Extended_` → `features.js:1820`
  - `deleteScheduleEntryAI_Extended_` → `features.js:1824`
  - `getAllScheduleEntriesForAI_`（読取・対象外）→ `features.js:1352`
  - `editScheduleEntryAI_` / `deleteScheduleEntryAI_`（非 Extended）は現状呼び出し元なし（参考情報・本調査では 5-E-0 D 分類削除後の定義ファイルを信頼しそのまま扱う）

### 調査結果表

| # | 関数名 | データソース | 認証 | Admin 判定 | 主な依存 | Workers 化難易度 | 5-E-7 乖離度 |
|---|--------|-------------|------|-----------|---------|------------------|------------|
| 14 | `addCustomScheduleEntry` | Firestore `schedules` コレクション | Firebase IDトークン必須 | 必要 | `isAdmin()`, `saveScheduleEntryToFirestore_` → `firestoreSet_` | **中** | **大**（KV でなく Firestore、docId 合成・source 分岐） |
| 15 | `deleteCustomScheduleEntry` | Firestore `schedules` コレクション | Firebase IDトークン必須 | 必要 | `isAdmin()`, `makeScheduleSafeId_`（内部）, `firestoreDelete_` | **易** | **中** |
| 16 | `updateSchedules` | 実質 no-op（`getScheduleFolder()` が `null` を返すため早期 return）。仮想的には Drive + Firestore + Gemini API | Firebase IDトークン必須 | 不要 | `getScheduleFolder()`（常に null）, `autoImportAllSchedules`（Drive/Gemini 依存） | **Workers 化対象外**（DriveApp 必須・実質デッドコード） | **最大** |
| 17 | `saveScheduleEntryToFirestore_` | Firestore `schedules` コレクション | 内部ヘルパー（呼出元の権限に従う） | 不要（ヘルパー内判定なし） | `makeScheduleSafeId_`, `firestoreSet_` | **中** | **大**（docId 合成ロジックの移植要） |
| 18 | `addScheduleEntryAI_` | Firestore `schedules` コレクション（source='AI入力'） | `_` サフィックスだが `executeAiAction` 経由で全ユーザー呼出 | 不要（AI 経由・全ユーザー） | `saveScheduleEntryToFirestore_` | **中** | **大** |
| 19 | `editScheduleEntryAI_` | Firestore `schedules` コレクション | `_` ヘルパー | 不要（source='Admin 直接入力'/'AI入力' のみ許可するフィールドチェック） | `firestoreGet_`, `firestoreSet_` | **中** | **大** |
| 20 | `deleteScheduleEntryAI_` | Firestore `schedules` コレクション | `_` ヘルパー | 不要（同上・source チェックのみ） | `firestoreGet_`, `firestoreDelete_` | **易** | **大** |
| 21 | `editScheduleEntryAI_Extended_` | Firestore `schedules` コレクション | `_` ヘルパー | 不要（source 制限なし） | `firestoreGet_`, `firestoreSet_`, `firestoreDelete_`, `makeScheduleSafeId_`（import 系は新 docId 合成 + 旧 docId 削除） | **中〜難**（2 操作の順次実行・弱整合） | **最大** |
| 22 | `deleteScheduleEntryAI_Extended_` | Firestore `schedules` コレクション | `_` ヘルパー | 不要 | `firestoreGet_`（存在確認）, `firestoreDelete_` | **易** | **大** |

### 難易度の根拠

- **易（#15, #20, #22）**: 単一の Firestore read + delete。Workers 側に既存 helper あり、ロジックは 10 行以内。
- **中（#14, #17, #18, #19）**: `saveScheduleEntryToFirestore_` 相当の共通ヘルパー（docId 合成・source 別ルール・fiscalYear 算出）を Workers 側に 1 本追加する必要あり。本体は ±30 行程度。
- **中〜難（#21）**: import 系エントリの「旧 docId 削除 + 新 docId 作成」のシーケンス。Firestore には真のトランザクションがないため、片側成功・片側失敗のケアが必要（ただし既存 GAS コードもベストエフォート運用なので、Workers 側でも同じ順序で実行すれば挙動は同等）。
- **Workers 化対象外（#16）**: `updateSchedules` は DriveApp 依存の `getScheduleFolder` が常に `null` を返し、実質 no-op。Workers 化は不要。GAS 残し確定扱い。

---

## 全 22 関数 最終分類

| グループ | 定義 | 件数 | 対象関数 |
|---------|------|------|---------|
| **A** | settings パターン完全同質（KV 純粋・副作用なし） | **7** | `setBasicTestDateOverride`, `deleteBasicTestDateOverride`, `setBasicTestDetails`, `deleteBasicTestDetails`, `setPublicHighExamDateOverride`, `deletePublicHighExamDateOverride`, `deleteJukuEventOverride` |
| **B** | 条件付き同質（軽微な特殊ロジック・KV 中心） | **4** | `setJukuEventOverride`（`'none'` 分岐）, `addClosedDayExtra`, `removeComputedClosedDay`, `deleteClosedDayOverride`（いずれも `add`/`del` デュアルリスト管理） |
| **C** | Firestore 副作用あり（ログ書込など従属的・KV 書込が主） | **2** | `setLectureDeadlineOverride`, `deleteLectureDeadlineOverride`（いずれも `logAdminAction` → Firestore `operationLogs`） |
| **D** | Firestore/Supabase 主軸（本丸・KV でない） | **4** | `addCustomScheduleEntry`, `deleteCustomScheduleEntry`, `saveScheduleEntryToFirestore_`（内部ヘルパー）, `updateSchedules`（Workers 化対象外・GAS 残し） |
| **E** | AI 系（Workers 化に特殊考慮が要る） | **5** | `addScheduleEntryAI_`, `editScheduleEntryAI_`, `deleteScheduleEntryAI_`, `editScheduleEntryAI_Extended_`, `deleteScheduleEntryAI_Extended_` |

合計: 7 + 4 + 2 + 4 + 5 = **22 件**（一致）

### グループ別の Admin 判定内訳

| グループ | Admin 判定必須 | Admin 判定不要 |
|---------|-------------|---------------|
| A | 7 | 0 |
| B | 4 | 0 |
| C | 2 | 0 |
| D | 2（`addCustomScheduleEntry`, `deleteCustomScheduleEntry`）| 2（`saveScheduleEntryToFirestore_` 内部, `updateSchedules` 判定なし）|
| E | 0（AI 経由・全ユーザー） | 5 |
| **合計** | **15** | **7** |

---

## auth.js 昇格判断

### 推奨: **yes**（`workers/src/auth.js` への昇格を推奨）

### 理由

1. **対象範囲が広い**: Admin 判定を必要とする関数は 22 関数中 **15 件**（68%）。settings 系以外の schedule 系 Workers ファイル（5-E-8b 以降の新規 `schedule-overrides.js` 等）からも再利用されることが確定している。
2. **既存の 5-E-7 `isAdminUser_` は `workers/src/functions/settings.js` の private ヘルパー**（settings.js:14-23）。現状のまま import すると双方向依存を生みやすく、schedule 系専用の別実装を書くのも重複コードを生む。
3. **既存 `workers/src/auth.js` には `verifyFirebaseIdToken` が既にある**。Admin 判定は本質的に「認証済みユーザーが特権を持つか」の判定であり、認証関連ヘルパーとして同じファイルに置くのが意味論的に自然。
4. **他の B→A 昇格候補（講師配置・料金表・成績マスタ等）でも再利用見込み**。5-E-8 以降の Phase 全体に効く汎用化。

### 具体的な昇格手順（5-E-8b-1 で実施提案）

- `workers/src/auth.js` に `isAdminUser(env, user)` を新設（`settings.js` の `isAdminUser_` とシグネチャ・挙動は完全互換）。
- `workers/src/functions/settings.js` の `isAdminUser_` を削除し、`auth.js` から `import { isAdminUser }` に差し替え。
- 既存の `updateSettings` / `getSettings` の挙動に差分が出ないことを回帰テスト（手動・Admin 判定分岐）。
- 以降の schedule 系 Workers ファイルは `auth.js` の `isAdminUser` を使う。

> 昇格と同時にリネーム（`_` サフィックス撤廃）することで、Workers 内部ヘルパーからファイル間公開ヘルパーへの意味変更を名前にも反映させる。

---

## 5-E-8b 実装フェーズの分割提案

### 推奨: **4 サブフェーズに分割**

段階的リリースでリグレッションリスクを抑え、各サブフェーズを「動く最小単位」として main に独立デプロイ可能にする。グループ C 以降は前サブフェーズの基盤（auth.js 昇格 / Firestore ヘルパー）に乗るため、順序依存あり。

| サブフェーズ | 扱うグループ | 件数 | 主な成果物 | 備考 |
|------------|-------------|------|-----------|------|
| **5-E-8b-1** | **A + B** | **11** | `workers/src/auth.js` に `isAdminUser` 昇格 / `workers/src/functions/schedule-overrides.js` を新設（A の 7 関数 + B の 4 関数）/ `gas-bridge.html` に 11 関数分のルート追加 | settings パターン直適用。KV I/O のみ。リスク最小。**auth.js 昇格もここで実施** |
| **5-E-8b-2** | **C** | **2** | `schedule-overrides.js` に `setLectureDeadlineOverride` / `deleteLectureDeadlineOverride` を追加。`workers/src/firebase.js` 等に `operationLogs` 書込ヘルパーを（必要なら）整備 | Firestore 副作用の扱いを確立する小さめの回。`logAdminAction` 相当の Workers ヘルパー設計も兼ねる |
| **5-E-8b-3** | **D**（`updateSchedules` 除く） | **3** | `workers/src/functions/schedule-entries.js`（仮）を新設し `addCustomScheduleEntry` / `deleteCustomScheduleEntry` を Workers 化 / 内部ヘルパー `saveScheduleEntryToFirestore` を Workers 側に用意 / docId 合成・source 分岐ロジック移植 | `updateSchedules` は Workers 化対象外として明示的に GAS 残し宣言。Firestore 主軸の回でテスト観点が変わる |
| **5-E-8b-4** | **E** | **5** | `schedule-entries.js` に AI 系 5 関数を追加。`features.js` 側の呼出経路との整合性確認 | AI アシスタント本体（`requestAIAssistant` / `executeAiAction`）がまだ Workers 化されていないため、**「Workers 化しない」判断の余地もあり**（5-E-8b-4 を保留して 5-E-9 以降に回す選択肢を検討推奨） |

### 代替案（3 サブフェーズ）

D と E をまとめて **5-E-8b-3 + 5-E-8b-4** を統合する案もあるが、E の扱いに未確定要素（AI 経由呼出の Workers 化全体設計）があるため、切り離した 4 分割を推奨する。

### 件数まとめ

- 5-E-8b-1: 11 件（A7 + B4）
- 5-E-8b-2: 2 件（C）
- 5-E-8b-3: 3 件（D から `updateSchedules` を除く）
- 5-E-8b-4: 5 件（E・保留可）
- 小計: 21 件（`updateSchedules` は対象外）

---

## 5-E-10 への宿題

### グループ C の `operationLogs` 書込欠落

Phase 5-E-8b-2 で以下 2 関数を Workers 化したが、GAS 版の副作用である
`logAdminAction()` → Firestore `operationLogs` コレクションへの監査ログ書込は
Workers 側では実装していない。

- `setLectureDeadlineOverride`
- `deleteLectureDeadlineOverride`

#### 現状の挙動

| 経路 | KV 書込 | operationLogs 書込 |
|-----|--------|------------------|
| フロント → Workers（WORKERS_FUNCTIONS に登録済・通常の経路） | ✅ 実行 | ❌ **残らない** |
| フロント → GAS フォールバック（Workers 未登録クライアント・Workers 障害時のリトライ等） | ✅ 実行 | ✅ 残る |

Workers 経由での講習締切上書き／削除操作は監査ログに記録されないため、
「いつ・誰が・どの講習の締切をいつに変更したか」が `operationLogs` から
遡及できない期間が発生する。

#### 解消予定

**Phase 5-E-10（Firestore 系 Workers 化）** で以下いずれかの対応を行う：

- **案 A**: Workers 側で `firestoreSet` を直接呼んで `operationLogs` に書き込む
  （既存の `workers/src/firebase.js` を利用）。
- **案 B**: Admin 監査ログ専用の共通 Workers ヘルパー（`logAdminAction` 相当）を
  新設して、schedule-overrides.js から呼ぶ。他の B 分類関数の Workers 化でも
  再利用可能。

現時点で案 A/B の判断は保留し、5-E-10 着手時に Firestore 書込の全体設計と
合わせて決定する。

#### 備考

- KV 書込自体は成功するため、機能面の動作には影響しない。
- GAS 側 `schedule.js` の `setLectureDeadlineOverride` / `deleteLectureDeadlineOverride`
  は `logAdminAction` を保持したまま残存しているため、フォールバック経路
  では監査ログが引き続き残る。この二重実装は 5-E-10 で解消する。

---

## Phase 5-E-8 完了記録

### 完了日

2026-04-21

### Workers 化の進捗

| 分類 | 件数 | 対応状況 | 実装コミット |
|------|------|---------|------------|
| グループ A（settings パターン完全同質） | **7** | ✅ Workers 化完了 | `8e24a9d` |
| グループ B（条件付き同質・特殊ロジックあり） | **4** | ✅ Workers 化完了 | `5a6c7ad` |
| グループ C（Firestore 副作用あり・KV 部分のみ） | **2** | ✅ Workers 化完了（`operationLogs` 書込は保留） | `0e73679` |
| **小計（5-E-8 で Workers 化）** | **13** | — | — |
| グループ D（Firestore/Supabase 主軸） | 4（うち `updateSchedules` は対象外扱い） | ⏭️ **5-E-10 に持ち越し** | — |
| グループ E（AI 系 `_` ヘルパー） | 5 | ⏭️ **5-E-10 に持ち越し** | — |

### 持ち越し理由（グループ D・E）

- **グループ D**（`addCustomScheduleEntry` / `deleteCustomScheduleEntry` / `saveScheduleEntryToFirestore_` / `updateSchedules`）は Firestore `schedules` コレクションへの書込が本体。docId 合成・source 分岐・fiscalYear 算出など、Firestore REST 認証基盤とのセットで設計すべきロジックを多く含む。
- **グループ E**（AI 系 `_` ヘルパー 5 件）は `executeAiAction`（`features.js`）から呼ばれる内部関数。AI アシスタント本体がまだ Workers 化されていないため、単独で先行移行しても呼び出し経路が整合しない。
- よって、両グループは Phase 5-E-10（Firestore 系 Workers 化）の Firestore REST 認証基盤設計と統合して扱うのが自然。

### 新規資産

| ファイル | 役割 |
|---------|------|
| `workers/src/functions/auth.js` | `isAdminUser(env, user)` を共通ヘルパーとして公開。`verifyFirebaseIdToken`（`workers/src/auth.js`）と棲み分け、今後の B→A 昇格関数全般から再利用される |
| `workers/src/functions/schedule-overrides.js` | schedule.js 上書き系 13 関数の Workers ポート（グループ A+B+C）。内部ヘルパー `readKvJson_` / `writeKvJson_` / `denyIfNotAdmin_` / `readClosedDays_` を提供 |

### 既存宿題

- **グループ C の `operationLogs` 書込欠落** — Workers 経由では監査ログが残らない。GAS フォールバック経路では残る。詳細は本ドキュメント「5-E-10 への宿題」セクション参照。Phase 5-E-10 で `firestoreSet` 直呼び or 共通 `logAdminAction` 相当 Workers ヘルパーを新設する形で解消する。

### GAS 側の扱い

- 13 関数すべての GAS 実装（`schedule.js`）はフォールバック保険として保持。5-E-8 では 1 行も削除していない。
- 削除判断は 5-E-10 完了後、Workers ルートが十分に成熟してから別フェーズで行う。

