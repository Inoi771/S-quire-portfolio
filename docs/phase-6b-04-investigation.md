# Phase 6-B-04 実装プラン調査レポート

> 作成日: 2026-04-24
> 対象: AI系講習エントリ操作 5 関数の Cloudflare Workers 化
> 前提: Phase 6-B-03（`saveLectureScheduleEntries` の Workers 化）完了済み
> 稼働状況: 本番稼働中。本レポートは調査・設計のみを目的とし、実コード変更は伴わない。

---

## 0. 対象関数

| # | 関数名 | ファイル:行 |
|---|--------|-----------|
| 1 | `createLectureEntryAI_` | `features.js:3079` |
| 2 | `createWeeklyLectureEntriesAI_` | `features.js:3135` |
| 3 | `editLectureEntryAI_` | `features.js:3239` |
| 4 | `deleteLectureEntryAI_` | `features.js:3289` |
| 5 | `bulkLectureOperationsAI_` | `features.js:3332` |

> 付随: `multiCampusBulkOperationsAI_`（`features.js:3445`）は #5 をループで呼ぶラッパーで、AI action の受け口としては独立（`multi_campus_bulk_operations`）。
> Phase 6-B-04 の扱いについては 4 章・7 章で触れる。

---

## 1. 5 関数それぞれの現状サマリー

### 1.1 引数・戻り値

| # | 関数 | 引数 | 成功戻り値 | 失敗戻り値（原文のまま） |
|---|------|------|-----------|-------------------------|
| 1 | `createLectureEntryAI_` | `(lectureId, campusCode, date, startTime, durationSlots, subject, grade, classLabel)` | `{ success: true, message: date + ' ' + startTime + '〜 ' + subject + ' の授業を追加しました' }` | `{ success: false, error: (result && result.error) \|\| '保存に失敗しました' }` / `{ success: false, error: error.toString() }` |
| 2 | `createWeeklyLectureEntriesAI_` | 同上（毎週繰返し用途） | `{ success: true, message: created + '件の授業コマを作成しました（毎週・休校日除く）' }` | 同上 |
| 3 | `editLectureEntryAI_` | `(lectureId, campusCode, entryId, changes)` | `{ success: true, message: 'エントリを更新しました' }` | `{ success: false, error: '指定されたエントリが見つかりません（ID: ' + entryId + '）' }` / `{ success: false, error: '他の講師のエントリは編集できません' }` / `{ success: false, error: (result && result.error) \|\| '保存に失敗しました' }` / `{ success: false, error: error.toString() }` |
| 4 | `deleteLectureEntryAI_` | `(lectureId, campusCode, entryId)` | `{ success: true, message: deleted.date + ' ' + deleted.startTime + '〜 ' + deleted.subject + ' を削除しました' }` | `{ success: false, error: '指定されたエントリが見つかりません（ID: ' + entryId + '）' }` / `{ success: false, error: '他の講師のエントリは削除できません' }` / `{ success: false, error: (result && result.error) \|\| '保存に失敗しました' }` / `{ success: false, error: error.toString() }` |
| 5 | `bulkLectureOperationsAI_` | `(lectureId, campusCode, operations)` | `{ success: true, message: parts.join('、') + 'を処理しました' + (errors.length > 0 ? '（' + errors.length + '件スキップ）' : '') }` | `{ success: false, error: '操作がありません' }` / `{ success: false, error: '処理できる操作がありませんでした' + (errors.length > 0 ? '（' + errors.join('、') + '）' : '') }` / `{ success: false, error: (result && result.error) \|\| '保存に失敗しました' }` / `{ success: false, error: error.toString() }` |

補足: `bulkLectureOperationsAI_` は内部で `errors.push(...)` で以下のメッセージを蓄積する（スキップ扱い）。これらは最終戻り値の `error` 文字列に埋め込まれる:

- `'編集: エントリが見つかりません'`
- `'編集: 他の講師のエントリ'`
- `'削除: エントリが見つかりません'`
- `'削除: 他の講師のエントリ'`

### 1.2 引数の必須/任意・デフォルト値

| 関数 | パラメータ | 必須 | 型変換・デフォルト |
|------|-----------|------|-------------------|
| #1, #2 | `lectureId` | R | `String(...)` |
| #1, #2 | `campusCode` | R | `String(campusCode \|\| '').padStart(2, '0')` で 2 桁正規化 |
| #1, #2 | `date` | R | `String(date \|\| '')`（#2 では `new Date(date + 'T00:00:00')` で parse） |
| #1, #2 | `startTime` | R | `String(startTime \|\| '')` |
| #1, #2 | `durationSlots` | R | `Number(durationSlots) \|\| 9`（#2 では `gradeSettings` から上書きあり） |
| #1, #2 | `subject` | R | `String(subject \|\| '')` |
| #1, #2 | `grade` | R | `String(grade \|\| '')` |
| #1, #2 | `classLabel` | O | `classLabel \|\| null` |
| #3 | `entryId` | R | ID 一致検索 |
| #3 | `changes` | R | `.date / .startTime / .durationSlots / .subject / .grade / .classLabel` のみ `undefined` チェックで部分適用 |
| #4 | `entryId` | R | ID 一致検索 |
| #5 | `operations` | R | 空配列なら早期 return。`op.op === 'create' \| 'edit' \| 'delete'` 以外は無視（errors にも積まない） |

### 1.3 LockService の使用

5 関数とも共通のパターン:

```js
var lock = LockService.getScriptLock();
lock.waitLock(10000);  // 10 秒
try {
  // RMW 本体
} finally {
  lock.releaseLock();
}
```

ロック対象はグローバル（全講習・全校舎で 1 本のロック）。10 秒以内にロック獲得できない場合は throw され、`catch` で `{ success: false, error: error.toString() }` を返す。

### 1.4 RMW（Read-Modify-Write）対象

全 5 関数とも同じ Firestore ドキュメント 1 件を操作:

- **コレクション**: `lectureEntries`
- **ドキュメント ID**: `${String(lectureId)}_${normalizedCampus}`（例: `spring2026_01`）
- **フィールド**: `entries`（配列・全置換）, `lectureId`, `campusCode`, `updatedAt`

| 関数 | Read | Modify | Write |
|------|------|--------|-------|
| #1 | `getLectureScheduleEntries(lectureId, normalizedCampus)` で既存配列取得 | 新規 `newEntry` を push | `saveLectureScheduleEntries(lectureId, normalizedCampus, JSON.stringify(existing))` で全置換 |
| #2 | 同上 | 毎週同曜日 `count` 回（日曜・休校日スキップ・安全ガード 2 年）push | 同上 |
| #3 | 同上 | `entryId` 一致する要素を部分更新（in-place） | 同上 |
| #4 | 同上 | `entryId` 一致する要素を `splice(targetIdx, 1)` で除去 | 同上 |
| #5 | 同上 | `operations` 配列をループ・create/edit/delete を順次適用 | 同上 |

Supabase テーブルへの書込は **なし**（全て Firestore `lectureEntries/{docId}` の上書き）。

### 1.5 外部 API 呼出

全 5 関数とも **Gemini / Supabase への直接呼出は無し**。
内部ヘルパー経由で以下に間接的に触れる:

- `getOrCreateTeacherId()` → `getCurrentStaff_()` → `resolveStaffByUid_(...)` → Supabase `staffs` テーブル（`find_staff_by_auth` RPC）
- `getUserProfile()` → 同上（`staffs` テーブル読取）
- `saveLectureScheduleEntries(...)` → `firestoreSet_('lectureEntries', docId, ...)`
- #2 のみ `getLecturePeriods()`（ScriptProperties → Workers KV 経由で `LECTURE_PERIODS_CONFIG` 読取）と `computeClosedDaysForMonth_(y, m)`（祝日計算 + `CLOSED_DAYS_OVERRIDES` 読取）

### 1.6 依存している内部ヘルパー関数（GAS 側）

| # | 関数 | 依存ヘルパー |
|---|------|------------|
| 1 | `createLectureEntryAI_` | `getLectureScheduleEntries`, `getOrCreateTeacherId`, `getUserProfile`, `getFirebaseEmailContext_`, `saveLectureScheduleEntries` |
| 2 | `createWeeklyLectureEntriesAI_` | #1 の全て + `getLecturePeriods`, `computeClosedDaysForMonth_` |
| 3 | `editLectureEntryAI_` | `getLectureScheduleEntries`, `getOrCreateTeacherId`, `isAdmin`, `saveLectureScheduleEntries` |
| 4 | `deleteLectureEntryAI_` | 同 #3 |
| 5 | `bulkLectureOperationsAI_` | `getLectureScheduleEntries`, `getOrCreateTeacherId`, `getUserProfile`, `getFirebaseEmailContext_`, `isAdmin`, `saveLectureScheduleEntries` |

### 1.7 権限チェック（Admin 以外の改ざん制御）

| # | 権限チェック |
|---|-------------|
| 1, 2 | なし（新規作成なので、作成者＝自分のエントリになる） |
| 3, 4 | 対象エントリの `teacherId` が自分の teacherId 以外で、かつ `isAdmin()` が false なら 拒否 |
| 5 | op === 'edit' / 'delete' の各々で同じ判定。違反はスキップ（errors に追加・処理は継続） |

### 1.8 GAS 版との差分ポイント（Workers 化時の注意）

- **LockService → Firestore Transaction**: RMW は `saveLectureScheduleEntries` 内で保護されている。Phase 6-B-03 Workers 版は既に `firestoreTransaction` 化済み。AI 系 5 関数を Workers 化する場合、**自関数側でもう一段ロックを張るか、保存関数内のトランザクションに一本化するか**の設計判断が必要（詳細は 4-5 章）。
- **teacherId 取得**: GAS は `PropertiesService.getUserProperties()` 由来の UID context を前提に動く。Workers では `supabaseRpc('find_staff_by_auth', ...)` が正。既に `saveLectureScheduleEntries` Workers 版（`workers/src/functions/features.js:1476-1490`）で確立済み。
- **displayName / teacherEmail**: GAS は `getUserProfile()` + `getFirebaseEmailContext_()` から取得。Workers では `user` 引数（Firebase ID トークン検証結果）+ Supabase `staffs` 行から取得可能。
- **#2 の `computeClosedDaysForMonth_` 同名関数**: GAS 版は `line.js:938`、Workers 版は `workers/src/functions/features.js:338` に既に移植済み（Phase 5-E-9b-2a-2）。仕様一致済。ただし `new Date(y, m-1, d)` の tz 挙動差（UTC native vs JST）に注意。
- **#2 の `getLecturePeriods`**: Workers 版は `workers/src/functions/features.js:455`（Phase 5-E-9b-2a-2）に存在。`gradeSettings` 含む構造を返す。
- **日付処理**: #2 の `new Date(date + 'T00:00:00')`、`startDate.getMonth()`、`cur.setDate(cur.getDate() + 7)` は GAS（JST）と Workers（UTC）で挙動差あり。Phase 6-B-05 で整備した `workers/src/helpers/datetime-helpers.js` の `jstDate` / `addDays` を使う必要あり。

---

## 2. 呼出経路図

### 2.1 全体フロー

```
┌─────────────────────────────────────────────────────────────────┐
│ 1) ユーザー発話（AI ウィジェット）                              │
│    「○月○日の△時から数学の授業を小学生で追加して」等            │
└─────────────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2) requestAIAssistant (features.js:909)                          │
│    - Gemini API 呼出                                             │
│    - 応答例: { type: 'app_action', action: 'create_lecture_entry',│
│              lectureId, campusCode, date, startTime, ... ,       │
│              needsConfirmation: true, message: '…確認文…' }       │
│    - 現状の呼出経路: google.script.run（GAS 直）                 │
└─────────────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3) フロント js-ai-actions.html（AI 応答ハンドラ）                │
│    ・応答 JSON を解析                                            │
│    ・needsConfirmation=true なら確認ボタン UI を表示             │
│    ・ユーザー承認後に execParams を組立（L190-226）              │
│      action ごとに必要フィールドを抜き出す                       │
└─────────────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4) google.script.run.executeAiAction(action, paramsJson)         │
│    L275 で呼出                                                   │
│    ⚠ 現状 gas-bridge.html の WORKERS_FUNCTIONS に含まれていない  │
│       ため GAS Exec URL に直接ルートされる                       │
└─────────────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5) executeAiAction (features.js:1779)  [GAS 実行]                │
│    - getFirebaseEmailContext_ で認証確認                         │
│    - action 値で分岐（対象 5+1 種）                              │
└─────────────────────────────────────────────────────────────────┘
         ↓
         ├── 'create_lecture_entry' & weekly=true  → createWeeklyLectureEntriesAI_
         ├── 'create_lecture_entry' & weekly=false → createLectureEntryAI_
         ├── 'edit_lecture_entry'                  → editLectureEntryAI_
         ├── 'delete_lecture_entry'                → deleteLectureEntryAI_
         ├── 'bulk_lecture_operations'             → bulkLectureOperationsAI_
         └── 'multi_campus_bulk_operations'        → multiCampusBulkOperationsAI_
                                                     └→ bulkLectureOperationsAI_
                                                        を校舎ごとにループ呼出
         ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6) 各 AI 関数の RMW                                             │
│    LockService 獲得（10s）                                       │
│    ↓                                                            │
│    getLectureScheduleEntries(lectureId, normalizedCampus)        │
│    → Firestore lectureEntries/{docId} 読取                       │
│    ↓                                                            │
│    既存配列を in-memory で追加/編集/削除                         │
│    ↓                                                            │
│    saveLectureScheduleEntries(lectureId, normalizedCampus, json) │
│    → 権限チェック + Firestore set（全置換）                      │
│    ↓                                                            │
│    LockService 解放                                              │
└─────────────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7) フロント側 withSuccessHandler（js-ai-actions.html L229-267）  │
│    - 成功: AI ウィジェットに "✅" メッセージ追加                 │
│    - 失敗: AI ウィジェットに "❌" メッセージ追加                 │
│    - 成功時はキャッシュクリア（lectureEntries / dirtyCampuses /  │
│      allCampusEntriesCache）+ refreshLecEntries() 呼出で画面再描画│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Phase 6-B-04 で変更される境界

- `executeAiAction` 自体の Workers 化（可能性あり・案 A-2）
- または 5 関数を個別エンドポイントにした上で `executeAiAction` は GAS に残す（案 A-1）
- または `executeAiAction` ごと Workers に移す（案 B）
- 比較は 4 章。

### 2.3 関連する呼出経路で Workers 化済み（Phase 6-B 以前）の関数

- `getLectureScheduleEntries`（Workers 版: `workers/src/functions/features.js:1315`）
- `saveLectureScheduleEntries`（Workers 版: `workers/src/functions/features.js:1461`・Phase 6-B-03）
- `getLecturePeriods`（Workers 版: `workers/src/functions/features.js:455`・Phase 5-E-9b-2a-2）
- `getTeacherNamesMap`（Workers 版: `workers/src/functions/features.js:1279`）
- `computeClosedDaysForMonth_`（Workers 内部ヘルパー: `workers/src/functions/features.js:338`）
- `firestoreTransaction`（`workers/src/firebase.js:275`）
- `isAdminUser`（`workers/src/functions/auth.js:50`・Phase 6-B-01 で隠し Admin 対応済）
- `supabaseRpc('find_staff_by_auth', ...)`（`workers/src/supabase.js`）

Phase 6-B-04 で新規実装する必要があるのは原則 **5 関数本体のみ**（ヘルパーは既存を再利用）。

---
