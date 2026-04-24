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

## 3. 既存 `firestoreTransaction` ヘルパー仕様

### 3.1 実装場所

`workers/src/firebase.js:275`（Phase 6-B-03 で新設）。

### 3.2 関数シグネチャ

```js
export async function firestoreTransaction(env, callback)
```

- `env`: Cloudflare Workers の environment（`env.FIREBASE_PROJECT_ID` を使用）
- `callback`: `async (tx) => any` 形式。`tx` オブジェクトが渡される
- 戻り値: `Promise<any>`（callback の戻り値をそのまま返す）

### 3.3 `tx` オブジェクトの API

| メソッド | 戻り値 | 用途 |
|---------|-------|------|
| `await tx.get(collection, docId)` | `Promise<Object \| null>` | Read（404 時は null） |
| `tx.set(collection, docId, data)` | 同期・void | 全置換 Write をキューに追加 |
| `tx.update(collection, docId, fields)` | 同期・void | updateMask 付き部分更新 Write をキューに追加 |
| `tx.delete(collection, docId)` | 同期・void | delete Write をキューに追加 |

### 3.4 動作仕様

- Firestore REST `beginTransaction` で txId 取得 → callback 実行 → `:commit` で一括 atomic commit
- ABORTED（HTTP 409）または UNAVAILABLE（HTTP 503）で失敗した場合、**最大 5 回・指数バックオフ（100ms × 2^attempt + jitter 100ms）で自動リトライ**
- writes 配列が空でも `:commit` で transaction をクローズする必要あり（実装済み）
- callback 内で throw された場合は `firestoreTransaction` も throw（呼出元の try-catch 要）

### 3.5 Phase 6-B-03 `saveLectureScheduleEntries` での使用例

```js
// workers/src/functions/features.js:1492-1574 を抜粋
const result = await firestoreTransaction(env, async (tx) => {
  const existingDoc = await tx.get('lectureEntries', docId);
  const existingEntries = (existingDoc && existingDoc.entries) || [];

  // 権限チェック: Admin 以外は他人のエントリを改ざんできない
  if (!isAdmin) {
    // existingOtherEntries / incomingOtherIds を組立て逐一比較
    // 不一致なら即座に return { success: false, error: '…' }
  }

  // エントリ ID 確定 + 保存データ構築（略）
  const newEntries = entries.map(...);

  tx.set('lectureEntries', docId, {
    lectureId:  String(lectureId),
    campusCode: normalizedCampus,
    entries:    newEntries,
    updatedAt:  new Date().toISOString()
  });

  return { success: true, message: '…', entries: savedEntries };
});
```

### 3.6 `saveLectureScheduleEntries` Workers 版の前置処理（重要な設計パターン）

`firestoreTransaction` 呼出前に以下を済ませる設計:

```js
// tx 内は極力短くするため、認証・teacherId 解決は先にやっておく
const isAdmin = await isAdminUser(env, user);
let myTid = '';
if (!isAdmin) {
  const rows = await supabaseRpc(env, 'find_staff_by_auth', {
    p_uid:   (user && user.uid)   || null,
    p_email: (user && user.email) ? user.email.toLowerCase() : null
  });
  const staff = rows && rows[0];
  myTid = staff ? (staff.teacherId || staff._id || '') : '';
}
```

Phase 6-B-04 の 5 関数でもこの前置処理を踏襲することで、tx 内の処理時間を短縮し ABORTED 発生率を下げられる。

### 3.7 GAS 版 LockService との挙動差

| 項目 | GAS `LockService` | Workers `firestoreTransaction` |
|------|-------------------|-------------------------------|
| スコープ | ScriptLock（全関数横断・グローバル 1 本） | 特定ドキュメントの RMW スナップショット |
| タイムアウト | 10 秒（waitLock） | Firestore 側で ~60 秒 |
| 失敗時挙動 | throw → `error.toString()` を返す | 5 回リトライ後 throw |
| 並列ライター競合 | 逐次化（後続は待機） | 楽観ロック（`ABORTED` で自動リトライ） |
| 講習+校舎を跨ぐ同時操作 | 1 本のロックで逐次化（ボトルネック） | 別ドキュメントなら並列可能 |

**副次効果**: Workers 化により講習・校舎を跨ぐ並列操作の性能が向上する一方、同一ドキュメントへの短時間連打では ABORTED リトライが発生する可能性がある（自動リトライされるため最終的には成功するが、レイテンシは増える）。

---

## 4. 移行設計 3 案の比較

### 4.1 案 A: 5 関数を個別エンドポイントとして Workers 化（`executeAiAction` は GAS に残す）

**エンドポイント構成**:

gas-bridge.html の `WORKERS_FUNCTIONS` に以下 5 件（+ multi-campus 検討分 1 件）を追加し、Workers `router.js` に登録:

- `createLectureEntryAI`（`_` サフィックスは gas-bridge 経由で外部公開可能にする際に除去検討）
- `createWeeklyLectureEntriesAI`
- `editLectureEntryAI`
- `deleteLectureEntryAI`
- `bulkLectureOperationsAI`
- （`multiCampusBulkOperationsAI`）

**`executeAiAction` 側の変更**:

`executeAiAction`（`features.js:1779`）は GAS に残す。各 action 分岐から GAS 版のラッパー関数を呼出（現状維持）。

GAS 版のラッパー関数を **Workers 呼出への薄い shim に置換**する。例:

```js
// 置換前（現状）
function createLectureEntryAI_(...) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { /* RMW 本体 */ } finally { lock.releaseLock(); }
}

// 置換後（案 A）
function createLectureEntryAI_(lectureId, campusCode, date, startTime, durationSlots, subject, grade, classLabel) {
  // Workers Functions URL へ内部 API として POST
  return callWorkersInternal_('createLectureEntryAI',
    [lectureId, campusCode, date, startTime, durationSlots, subject, grade, classLabel]);
}
```

`executeAiAction` 全体は GAS で稼働。5 関数ラッパーだけ Workers に委譲するため、認証コンテキストは GAS 側の `getFirebaseEmailContext_()` 結果を Workers に引き継ぐ必要がある（内部 API キー + email を body に含める形）。

**GAS 側に残すラッパーの要否**: **必要**。`executeAiAction` が GAS 側にある以上、同 GAS プロセスから呼べる関数名が必要。

**実装工数の概算**:
- Workers 側 5 関数新規実装: 中（~400 行）。`saveLectureScheduleEntries` Workers 版のパターンを踏襲すれば比較的シンプル
- GAS 側 shim 置換: 小（各関数 5-10 行）
- router / gas-bridge WORKERS_FUNCTIONS 登録: 小
- **合計: 1.5-2 日**

**本番稼働中のリスク**:
- 中。ラッパー置換時点で Workers エンドポイントが動作していないと AI 操作が即座に全滅（フォールバック無しの切替えはリスク高）
- 逆に Workers 側を先に実装・デプロイしてから shim 置換する 2 段デプロイなら安全

**ロールバック手順**:
- GAS 側ラッパーを git revert（`shim` → 元の本体に戻す）
- Workers 側は temporarily dead code 化。次回デプロイまで温存しても課金影響なし

### 4.2 案 B: `executeAiAction` 自体を Workers 化（統合エンドポイント 1 本）

**エンドポイント構成**:

- `executeAiAction`（1 関数のみ）を Workers に追加（router に登録）
- 内部で action 分岐（5+1 種）して各 helper を呼ぶ

**`executeAiAction` 側の変更**:

- gas-bridge.html の `WORKERS_FUNCTIONS` に `executeAiAction` を追加
- フロント `js-ai-actions.html:275` の `google.script.run.executeAiAction(...)` は gas-bridge 経由で自動的に Workers にルートされる（既存の透過ルーティング機構）
- GAS 側 `executeAiAction`（`features.js:1779`）は **fallback として残置**（WORKERS_FUNCTIONS 未登録時 or Workers 障害時のフェイルオーバー）

**GAS 側に残すラッパーの要否**: **5 関数本体は GAS に残す必要あり**（GAS `executeAiAction` fallback 経路で使われる）。Workers 化後は GAS 側が dead code になるが、緊急ロールバック用に 1 Phase は残す推奨。

**実装工数の概算**:
- Workers 側 `executeAiAction` + 5 関数本体新規実装: 中-大（~500 行）
- gas-bridge WORKERS_FUNCTIONS 登録: 小（1 件）
- フロント側変更: なし
- **合計: 2-2.5 日**

**本番稼働中のリスク**:
- 中-高。`executeAiAction` は 5 種類の action 以外にも `submit_grade` / `submit_student` / `add_schedule` / `edit_schedule` / `delete_schedule` を含む（features.js:1790-1825）。これらは GAS 側の関数（`submitGradeData`, `submitStudentInfo`, `addScheduleEntryAI_` 等）を呼ぶため、**Workers 版 `executeAiAction` は非 AI lecture action もハンドリングする必要がある**
- 既存 Workers 化済関数（`submitGradeData` / `submitStudentInfo`）の呼出経路を追加実装する必要あり

**ロールバック手順**:
- gas-bridge.html の `WORKERS_FUNCTIONS` から `executeAiAction` を外すだけ
- 1 行の変更で GAS に戻る
- **ロールバック性は案 A より高い**

### 4.3 案 C: 段階移行（1 関数ずつ切り替え・フィーチャーフラグ併用）

**エンドポイント構成**:

- まず `createLectureEntryAI` のみを Workers 化（router 登録）
- 残り 4 関数は GAS 継続
- 動作確認後、次の関数を 1 つずつ Workers に移す

**`executeAiAction` 側の変更**:

`executeAiAction` の各 action 分岐で、KV 上のフィーチャーフラグを参照して GAS / Workers を切替:

```js
if (action === 'create_lecture_entry') {
  if (shouldUseWorkers_('create_lecture_entry')) {
    return callWorkersInternal_('createLectureEntryAI', [...]);
  }
  return createLectureEntryAI_(...);  // 既存 GAS 版
}
```

フィーチャーフラグは `prop:FF_AI_LECTURE_CREATE = 'workers'` のような Cloudflare KV キーで管理。

**GAS 側に残すラッパーの要否**: **必要**。移行中は GAS 版と Workers 版の両方が並行稼働。

**実装工数の概算**:
- フラグ読取ヘルパー: 小
- Workers 側関数を 1 つずつ追加: 各 0.5 日 × 5 = 2.5 日
- GAS 側ラッパーに分岐を差し込む: 小
- 各関数の動作確認期間: 各 1-2 日
- **合計: 3-4 日（動作確認期間を含めると 1-2 週間）**

**本番稼働中のリスク**:
- 低。フィーチャーフラグで即座にロールバック可能
- 1 関数ずつ検証できるため、問題発生時の切分けが容易

**ロールバック手順**:
- 該当関数の FF を `'workers'` → `'gas'` に変更（KV 書換のみ）
- 関数単位でロールバック可能・再デプロイ不要

### 4.4 3 案の比較表

| 観点 | 案 A: 個別エンドポイント（GAS `executeAiAction` 残置） | 案 B: 統合エンドポイント（`executeAiAction` 丸ごと Workers 化） | 案 C: 段階移行（FF 併用） |
|------|:--:|:--:|:--:|
| Workers 新規実装行数 | ~400 行 | ~500 行 | ~400 行 |
| GAS 側変更規模 | 5 関数 shim 置換 | ほぼ変更なし（fallback として残置） | 5 関数に FF 分岐追加 |
| フロント側変更 | なし | なし | なし |
| 認証コンテキストの受渡し | 内部 API キー + email を Workers body に埋込（GAS→Workers） | gas-bridge が自動で ID トークン転送 | 内部 API キー + email を Workers body に埋込 |
| 非 AI lecture action（submit_grade 等）への影響 | なし | あり（案 B は `executeAiAction` 全 action の対応が必要） | なし |
| ロールバック容易性 | 中（git revert + redeploy） | 高（gas-bridge 1 行変更） | 高（KV フラグ変更のみ） |
| 実装工数 | 1.5-2 日 | 2-2.5 日 | 3-4 日（検証期間込みで 1-2 週間） |
| 動作確認の粒度 | 5 関数を一括で切替 | `executeAiAction` 全体を一括で切替 | 1 関数ずつ個別に検証 |
| 本番リスク | 中（5 関数一括切替） | 中-高（非 AI lecture action への影響） | 低（関数単位で切戻し可能） |
| GAS プロジェクトのデプロイ必要回数 | 1 回（shim 置換） | 0-1 回（fallback 残置なら 0 回） | 5 回（各関数置換ごと） |
| 本番稼働中の AI 一時停止リスク | 中（一括切替時に 5 関数全滅の可能性） | 中-高（一括切替時に全 AI action 全滅の可能性） | 低（関数単位切戻しで最小化） |

---
