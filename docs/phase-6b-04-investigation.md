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

## 5. 推奨案とその理由

### 5.1 推奨: **案 C（段階移行・フィーチャーフラグ併用）** を基本とし、**関数単位で案 A の個別エンドポイント化を実施**する

具体的には以下のハイブリッド方針:

1. Workers 側: 5 関数（+ `multiCampusBulkOperationsAI_` の扱いは 7 章参照）を **個別エンドポイント** として実装（案 A のエンドポイント構成を採用）
2. GAS 側: `executeAiAction` は GAS に残し、各 action 分岐に **フィーチャーフラグ（KV）による GAS/Workers 切替**を挟む（案 C の切替機構を採用）
3. 関数を **1 つずつ Workers に切替え**、各関数で本番動作確認後に次へ進む（案 C の段階移行）

### 5.2 この方針を推奨する理由

#### 5.2.1 本番稼働中のプロジェクトとして安全性が最優先

`CLAUDE.md` 冒頭の「🚨 本番環境移行済み」セクションで **「大きな修正の禁止」「スコープを最小に」「確認を強化」「プラン先行」** が明示されている。案 B（`executeAiAction` 丸ごと Workers 化）は 5 関数以外の非 AI lecture action（`submit_grade` / `submit_student` / `add_schedule` / `edit_schedule` / `delete_schedule`）を巻き込む設計変更を伴い、**スコープが対象 5 関数を大きく超える**。本番稼働ポリシーに適合しない。

#### 5.2.2 Phase 6-B-09 ロールバック（2026-04-24）の教訓

Phase 6-B-09 は LINE 配信エンジンを丸ごと Workers に移行しようとしたが、Cloudflare Dashboard 上で Cron 実行確認ができず緊急ロールバックとなった。この経験から **「一括切替ではなく段階切替・観測可能な単位で進める」** という教訓が得られている。案 C はこの教訓を直接反映する。

#### 5.2.3 `saveLectureScheduleEntries` Workers 版の再利用性

Phase 6-B-03 で `saveLectureScheduleEntries` を Workers 化した際、以下のパターンが確立している:

- `isAdminUser(env, user)` での Admin 判定
- `supabaseRpc('find_staff_by_auth', ...)` での teacherId 解決
- `firestoreTransaction` で RMW atomic 保証
- `user.email` / `user.uid` を Firebase ID トークンから受取

**5 関数とも同じ Firestore ドキュメント `lectureEntries/{lectureId}_{campusCode}` に対する RMW** であるため、このパターンをそのままコピペ再利用できる。案 A の個別エンドポイント化が最も素直な選択肢（案 B の統合分岐よりコードがシンプル）。

#### 5.2.4 フィーチャーフラグによるロールバックの速さ

- 案 A 単独だと git revert + GAS redeploy で **1-2 分**（反映時間含む）
- 案 B だと gas-bridge.html 1 行変更 + Firebase Hosting redeploy で **2-3 分**
- 案 C の KV フラグだと **即時**（KV Put 後、次のリクエストから適用）

本番で問題が出た場合の MTTR（Mean Time To Recovery）を最小化するには KV フラグが最適。

#### 5.2.5 非 AI lecture action との分離

`executeAiAction` には AI lecture 5 種以外に `submit_grade` / `submit_student` / `add_schedule` / `edit_schedule` / `delete_schedule` の 5 種を含むが、これらは **Phase 6-B-04 のスコープ外**。案 C だとこれらの action を完全に GAS 側に残したまま AI lecture 5 種だけを切替えできる。案 B は非 AI lecture action の挙動テストも必要になる。

### 5.3 この方針で採用しない要素

- **案 A の「GAS 版ラッパー即置換」は採用しない**: 5 関数を一括で Workers に切替えると、Workers 側のバグで 5 種類の AI 操作が同時に全滅するリスクがある
- **案 C の「完全に案 A を使わず GAS 版を残す両立運用」は採用しない**: GAS 側の LockService バグや挙動差が残ると parity 検証が難しくなるため、最終的には GAS 版を dead code 化する

### 5.4 想定フロー（ハイブリッド方針）

```
Phase 6-B-04-01: Workers 実装 & デプロイ（GAS 側は未接続・KV フラグ OFF）
  ↓
Phase 6-B-04-02: createLectureEntryAI のみ KV フラグ ON → 本番観測 1-3 日
  ↓ 問題なければ
Phase 6-B-04-03: editLectureEntryAI の KV フラグ ON → 本番観測 1-3 日
  ↓ 問題なければ
Phase 6-B-04-04: deleteLectureEntryAI の KV フラグ ON → 本番観測 1-3 日
  ↓ 問題なければ
Phase 6-B-04-05: bulkLectureOperationsAI + multiCampusBulkOperationsAI_ の
                 KV フラグ ON → 本番観測 1-3 日
  ↓ 問題なければ
Phase 6-B-04-06: createWeeklyLectureEntriesAI の KV フラグ ON → 本番観測 1-3 日
  ↓ 最後に
Phase 6-B-04-07: GAS 版 5 関数を dead code として残置（実質無効）→
                 次フェーズで削除
```

詳細な順序の根拠は 7 章参照。

### 5.5 定量的な比較（参考）

| 観点 | 案 A 単独 | 案 B 単独 | 案 C 単独 | **ハイブリッド（推奨）** |
|------|:--:|:--:|:--:|:--:|
| 実装工数（動作確認込み） | 3-4 日 | 3-5 日 | 1-2 週間 | 1-2 週間 |
| 本番リスク | 中 | 中-高 | 低 | **低** |
| MTTR（ロールバック所要） | 1-2 分 | 2-3 分 | 即時 | **即時** |
| スコープの最小性 | ○ | △（非 AI action も巻込） | ○ | **◎** |
| Phase 6-B-09 教訓の反映 | △ | × | ◎ | **◎** |

---

## 6. リスク評価と回避策

### 6.1 リスクマトリクス

| # | リスク | 発生可能性 | 影響度 | 総合 | 回避策 |
|---|-------|----------|-------|------|-------|
| R1 | Workers 側で teacherId 解決が GAS 版と一致しない | 中 | 大 | 高 | 6.2.1 |
| R2 | Firestore Transaction ABORTED 頻発でレイテンシ悪化 | 低 | 中 | 中 | 6.2.2 |
| R3 | 戻り値メッセージの character-for-character 不一致 | 中 | 中 | 中 | 6.2.3 |
| R4 | KV フィーチャーフラグの読取遅延・一時障害 | 低 | 大 | 中 | 6.2.4 |
| R5 | `createWeeklyLectureEntriesAI_` の休校日計算で日付ズレ | 中 | 大 | 高 | 6.2.5 |
| R6 | GAS 側 `executeAiAction` の auth context と Workers 側の不一致 | 中 | 大 | 高 | 6.2.6 |
| R7 | フロント側 `lectureEntries` キャッシュクリアの不整合 | 低 | 中 | 中 | 6.2.7 |
| R8 | `multiCampusBulkOperationsAI_` の部分失敗時の整合性 | 中 | 中 | 中 | 6.2.8 |
| R9 | `bulkLectureOperationsAI_` の長時間実行で Workers 時間制限超過 | 低 | 大 | 中 | 6.2.9 |
| R10 | デプロイ中の半期状態（新旧関数が混在）で Firestore に破損書込 | 低 | 大 | 中 | 6.2.10 |

### 6.2 回避策

#### 6.2.1 R1: teacherId 解決の不一致

**懸念**: GAS 版 `getOrCreateTeacherId()` → `getCurrentStaff_()` → `resolveStaffByUid_(uid, email)` の解決ロジックと、Workers 版 `supabaseRpc('find_staff_by_auth', { p_uid, p_email })` の結果が異なる可能性。

**回避策**:
- Phase 6-B-03 `saveLectureScheduleEntries` Workers 版（`workers/src/functions/features.js:1476-1490`）の実装パターンをそのまま踏襲する
- 実装時に同一ユーザーの GAS 版 / Workers 版 teacherId を並列に取得し、**ログで一致を確認**（デバッグログは Phase 完了後に削除）
- `find_staff_by_auth` RPC は既に本番稼働中の関数であり、新規導入による挙動差のリスクは低い

#### 6.2.2 R2: Firestore Transaction ABORTED 頻発

**懸念**: LockService は逐次化だが Transaction は楽観ロック。同一 `lectureEntries/{docId}` に対して短時間で連打すると ABORTED（409）が発生。自動リトライはされるが、最大 5 回のリトライで exponential backoff（100ms × 2^n + jitter）によりレイテンシが 1-2 秒まで増加する可能性。

**回避策**:
- Workers 実装で **tx 内処理を極力短く保つ**（認証・teacherId 解決は tx 外で済ませる・`saveLectureScheduleEntries` Workers 版のパターン踏襲）
- AI は通常 1 発話で 1 操作、連打は稀。LLM 応答の遅延が自然なレートリミッターとして働く
- リトライ上限 5 回で失敗した場合は GAS 版と同様に `error.toString()` を返す（parity 維持）
- Workers ログに ABORTED 発生率を記録し、異常値（例: 5% 超）なら原因調査

#### 6.2.3 R3: 戻り値メッセージの不一致

**懸念**: フロント `js-ai-actions.html:232-233` は `'✅ ' + (result.message || '処理が完了しました')` で表示し、ユーザーはメッセージ本文で成否・対象を認識する。character-for-character の不一致があると UX が変化する。

**回避策**:
- 1 章で記録したエラーメッセージ一覧を **Workers 実装のテストフィクスチャ** として使う
- Jest テスト（`__tests__/workers-helpers/` と同じ形式）で Workers 版の成功・失敗メッセージを GAS 版と比較
- 特に注意: `editLectureEntryAI_` の成功メッセージ `'エントリを更新しました'` は特定フィールド名を含まないため変更容易だが、あえて現状維持

#### 6.2.4 R4: KV フィーチャーフラグの読取遅延・一時障害

**懸念**: Cloudflare KV の eventually consistent 書込（グローバル伝播に最大 60 秒）。フラグ ON 直後は一部リクエストが古い値（GAS 経路）を見る可能性。

**回避策**:
- フラグ読取失敗時は **GAS 版（既存安定経路）にフォールバック**する設計（fail-safe）
- フラグ ON/OFF の反映時間を「最大 60 秒」と明記し、運用手順に含める
- `INTERNAL_API_KEY` 同様、フラグ書込後は **1-2 分待機** してから動作確認する
- KV 障害時はフラグ未設定扱い（= GAS 経路）となるため、Workers 全面停止でも GAS で業務継続可能

#### 6.2.5 R5: `createWeeklyLectureEntriesAI_` の休校日計算の日付ズレ

**懸念**: GAS（JST native）と Workers（UTC native）の `new Date()` 挙動差。`new Date(date + 'T00:00:00')` は TZ 未指定のため、GAS では JST 00:00、Workers では UTC 00:00（= JST 09:00）として parse される。これが `.getDay()` / `.getMonth()` / 月跨ぎ計算に影響する可能性。

**回避策**:
- Phase 6-B-05 で整備した `workers/src/helpers/datetime-helpers.js` の **`toJstDate(str)` / `jstDate(y,m,d)` / `getJstDayOfWeek(d)` / `addDays(d,n)` を必ず使う**
- `CLAUDE.md` の「Workers 内 Date 操作は必ず JST 補正する」方針を実装時に遵守
- Jest テストで月跨ぎ・年末年始・うるう年・GW 曜日切替などの境界ケースを網羅（Phase 6-B-05 の helpers test と同形式）
- GAS 版の実行結果と Workers 版の実行結果を実データで並列比較（最低 1 件ずつの春期・夏期・冬期講習でテスト）

#### 6.2.6 R6: GAS→Workers 間の認証コンテキスト引継ぎ

**懸念**: GAS `executeAiAction` は `getFirebaseEmailContext_()` で認証済 email を取得済だが、Workers を呼ぶ際にこのコンテキストを Workers の `user.email` / `user.uid` に正しく引き継ぐ必要がある。直接 ID トークン検証のフローではないため、**内部 API キー方式**（`INTERNAL_FUNCTIONS` セット）で呼ぶことになる。

**回避策**:
- router.js の `INTERNAL_FUNCTIONS` セットに 5 関数を追加し、`INTERNAL_API_KEY` + `email` + `uid` を body で渡す
- GAS 側のヘルパー `callWorkersInternal_(functionName, args)` を新設し、`PropertiesService.getScriptProperties().getProperty('INTERNAL_API_KEY')` で取得した秘密鍵と `getFirebaseEmailContext_()` の結果を body に埋込
- Workers 側で `user = { email: body.email, uid: body.uid }` を組立てて既存 handler に渡す（既存 `INTERNAL_FUNCTIONS` の扱いと同じ）
- 代替案: `google.script.run` を fetch に置換（現在の gas-bridge ルートと同様）だが、GAS→Workers の `UrlFetchApp.fetch` なら内部 API キー方式の方がシンプル

#### 6.2.7 R7: フロント側 `lectureEntries` キャッシュクリアの不整合

**懸念**: `js-ai-actions.html:237-260` で成功時に `lectureEntries[campus]` / `dirtyCampuses[campus]` / `allCampusEntriesCache` をクリアし `refreshLecEntries()` を呼ぶ。Workers 移行で処理時間が変動するとキャッシュクリアのタイミングが変化し、一時的に古いデータが表示される可能性。

**回避策**:
- フロント側のロジックは **変更しない**（スコープ外・既存パターン維持）
- Workers 側の成功応答は必ず同じ形式 `{ success: true, message: '...' }` を返す（キャッシュクリアの判定は `result.success` のみに依存）
- ネットワーク遅延で `withSuccessHandler` 実行前にユーザーが別操作をした場合の挙動は GAS 版と同じ（既存の仕様）

#### 6.2.8 R8: `multiCampusBulkOperationsAI_` の部分失敗

**懸念**: 複数校舎に跨る操作で、1 校舎目は成功し 2 校舎目で失敗した場合、Firestore は 1 校舎目のみ書込済の中間状態になる。Transaction は 1 ドキュメント単位なので cross-campus atomic にはできない。

**回避策**:
- GAS 版も同じ挙動（各校舎ごとに別 LockService 獲得→別 Firestore 書込）であり、**既存仕様をそのまま踏襲**（parity 維持）
- Workers 実装でも校舎ごとにループし、各校舎で独立した `bulkLectureOperationsAI` を呼ぶ設計を踏襲
- 戻り値の `messages` / `errors` 集約ロジックも原文一致（`' / '` 区切り・`' ⚠️ 一部エラー: '` 接頭辞）
- 必要であれば将来的に Firestore batch write で改善検討（Phase 6-B-04 のスコープ外）

#### 6.2.9 R9: `bulkLectureOperationsAI_` の Workers 時間制限超過

**懸念**: Cloudflare Workers 無料プランは CPU time 10ms（Unbound は 30 秒）。`bulkLectureOperationsAI_` で 100 件の操作を 1 トランザクションで処理すると、tx 内の配列走査と Firestore fields 変換で CPU time を圧迫する可能性。

**回避策**:
- 現状 AI が生成する操作件数は通常 10 件以下（1 発話で大量操作は稀）
- Unbound プラン（月 $5）は既に Phase 5 で検討済。`migration-plan.md` の「Cloudflare Workers subrequest 数の問題」セクション参照
- **通常プランのままでもランタイム計測を行い、90% の操作が 100ms 未満に収まることを確認**
- 上限超過時はエラーを GAS 相当に翻訳（`error.toString()`）し、フロント側のエラー表示で通知

#### 6.2.10 R10: デプロイ中の半期状態（Firestore 破損書込）

**懸念**: Workers デプロイと GAS デプロイが同時に反映される途中で、一部リクエストが Workers 版（新 schema）、一部が GAS 版（旧 schema）で書込むと Firestore `lectureEntries/{docId}` が混在状態になる可能性。

**回避策**:
- Workers 版 `saveLectureScheduleEntries`（Phase 6-B-03）の schema は GAS 版と完全一致を確認済（`features.js:3044-3049` と `workers/src/functions/features.js:1562-1567`）
- 5 関数も同じ schema で書込む設計（`entries` 配列のフィールド構造が同一）
- デプロイ順序: **Workers 先行 → KV フラグ OFF → GAS デプロイ → KV フラグ ON** の順で進める
- KV フラグ OFF のまま Workers をデプロイすれば、Workers 側の関数は呼ばれないため破損リスク 0

### 6.3 リスク低減のための事前作業

Phase 6-B-04 着手前に以下を整備することを推奨:

| # | 事前作業 | 目的 |
|---|---------|------|
| P1 | GAS/Workers 共通の teacherId 解決テストケース（10 ユーザー分） | R1 検証 |
| P2 | GAS 版の戻り値サンプル集（成功・失敗メッセージ文字列の実データ） | R3 比較基準 |
| P3 | `createWeeklyLectureEntriesAI_` の境界ケースフィクスチャ（月跨ぎ・年跨ぎ・うるう年・GW） | R5 Jest テスト用 |
| P4 | `INTERNAL_API_KEY` の GAS ScriptProperties 設定確認（R6 の前提） | R6 実装容易化 |
| P5 | KV フラグ `prop:FF_AI_LECTURE_*` キー設計（命名規約） | R4 運用手順 |

P1-P5 はいずれも 1-2 時間で完了する軽量タスク。

### 6.4 動作確認チェックリスト（Phase 6-B 規約準拠）

`CLAUDE.md` の「Phase 移行 コミットメッセージルール」に従い、各サブフェーズのコミット body に以下のタスクリストを含める:

- [ ] AI ウィジェットから「○月○日○時 数学 小学生で授業追加して」→ 成功メッセージが GAS 版と完全一致すること
- [ ] AI ウィジェットから「毎週同じ時間で数学の授業を 4 回追加して」→ 休校日スキップが GAS 版と同一件数になること
- [ ] AI ウィジェットから「○○のエントリを削除して」→ Admin/Non-Admin で権限チェックが GAS 版と一致すること
- [ ] AI ウィジェットから「複数の操作をまとめて実行して」→ bulk_lecture_operations が正常に Firestore に反映されること
- [ ] 他講師のエントリ改ざん試行時のエラーメッセージ（`'他の講師のエントリは編集できません'` / `'他の講師のエントリは削除できません'`）が GAS 版と完全一致すること
- [ ] エントリ ID 不一致時のエラーメッセージ（`'指定されたエントリが見つかりません（ID: ...）'`）が GAS 版と完全一致すること
- [ ] KV フラグ OFF → ON → OFF の切替えで GAS ↔ Workers 経路がそれぞれ使われること
- [ ] Firestore `lectureEntries/{docId}` の entries 配列 schema が変化しないこと
- [ ] `refreshLecEntries()` 呼出後に UI に反映されること

---

## 7. 段階移行する場合の推奨順序

推奨方針（5 章）に従い、関数を **以下の順序** で Workers に切替える。各サブフェーズは独立したコミットとし、本番観測期間を挟む。

### 7.1 推奨順序の原則

1. **シンプルな関数から始める**: RMW ロジックが単純で、依存ヘルパーが少ない関数を先行
2. **書込量が小さい関数から始める**: 1 件単位で書込む関数を優先し、複数件バルクは最後
3. **日付計算が絡む関数は最後**: JST/UTC 差分のリスクが最も高い `createWeeklyLectureEntriesAI_` は最終段
4. **依存関係のあるラッパーは被依存側の安定後**: `multiCampusBulkOperationsAI_` は `bulkLectureOperationsAI_` 安定後

### 7.2 推奨順序

| サブフェーズ | 関数 | 理由 | 想定観測期間 |
|------------|------|------|------------|
| **6-B-04-00**（事前準備） | 6.3 の事前作業 P1-P5 実施 + Workers 側 5 関数実装 + router 登録 + KV フラグ OFF デプロイ | Workers 実装完了・未接続状態でデプロイ安定性を確認 | 1-2 日 |
| **6-B-04-01** | `createLectureEntryAI` | **最もシンプルな RMW（1 件追加のみ）**。teacherId / displayName / teacherEmail の解決パターン・firestoreTransaction の挙動を本番で最初に検証する | 2-3 日 |
| **6-B-04-02** | `editLectureEntryAI` | 権限チェックロジックを本番で初めて検証。`existing.length` で対象検索する単純 in-place 更新。createLecture 成功で teacherId 解決ロジックが安定していることが前提 | 2-3 日 |
| **6-B-04-03** | `deleteLectureEntryAI` | edit と同型の RMW（権限チェック + splice）。edit 成功後ならリスク小 | 1-2 日 |
| **6-B-04-04** | `bulkLectureOperationsAI` | 複数操作を 1 トランザクションで処理するため Firestore Transaction の atomicity を最大限活用する関数。create / edit / delete を混在するため、前 3 段で個別動作を確認済であることが前提 | 3-5 日（本番観測を長めに） |
| **6-B-04-05** | `multiCampusBulkOperationsAI` | `bulkLectureOperationsAI` を校舎ごとにループ呼出するラッパー。被依存側（bulk）の安定後に実施 | 2-3 日 |
| **6-B-04-06** | `createWeeklyLectureEntriesAI` | **最もリスクが高い**（JST/UTC 日付計算・休校日マージ・毎週繰返し・安全ガード）。最終段で実施し、他関数で Workers ↔ Firestore のパイプラインが全て動作確認済であることを前提 | 5-7 日（最も長めに） |
| **6-B-04-07**（クローズ） | GAS 側 5 関数を **dead code 化**（削除ではなく呼出経路のみ無効化） | 全関数の本番安定確認後、GAS 版を削除すると緊急ロールバックができなくなるため、まず「到達不能だが存在する」状態にする | 1-2 週間 |
| **6-B-04-08**（将来・別フェーズ） | GAS 側 5 関数の完全削除 | Phase 6-B-04 クローズから 2-4 週間安定稼働を確認後、別サブフェーズとして GAS から削除 | 別フェーズ |

### 7.3 各サブフェーズで守るべきチェックポイント

各サブフェーズでフラグを ON にする前に以下を確認:

- [ ] Workers 側の該当関数が **KV フラグ OFF のまま 3 日以上** デプロイ済で安定していること（ルーター登録・認証経路の安定化）
- [ ] 直前サブフェーズが **本番で 2-3 日以上の観測期間を経過** していること
- [ ] Jest テスト（該当関数のパラメータ parity テスト）が全パスしていること
- [ ] `docs/migration-plan.md` の Phase 6-B 進捗ログを更新済であること
- [ ] 本番ログで ABORTED エラー率 < 1% を確認（Workers dashboard または logging）
- [ ] Firestore の `lectureEntries/{docId}` schema が変化していないことを任意 1 件で確認

### 7.4 各サブフェーズでのコミット構成

各サブフェーズで作るコミット（例: 6-B-04-02 `editLectureEntryAI`）:

1. **実装コミット**: Workers 側に関数追加・router 登録（フラグは OFF のまま）
   - メッセージ: `Phase 6-B-04-02 Stage 1: editLectureEntryAI を Workers 実装（未接続）`
2. **フラグ ON コミット**: GAS 側 shim 追加 + KV キー更新手順をドキュメント化
   - メッセージ: `Phase 6-B-04-02 Stage 2: editLectureEntryAI を Workers 経路に切替え`
3. （必要なら）**ロールバックコミット**: 問題発生時
   - メッセージ: `リバート: Phase 6-B-04-02 Workers 切替 - ○○ エラーで GAS に戻す`

### 7.5 ロールバック判定基準

以下のいずれかが発生したら **即座に KV フラグを OFF** に戻す:

- ABORTED エラー率が 5% を超える
- 戻り値メッセージの不一致がユーザーから報告される
- Firestore 書込で schema 不整合が検知される
- Workers レスポンス 90pct レイテンシが GAS の 2 倍超
- ユーザー数名から連続して AI 操作失敗の報告がある

### 7.6 全フェーズ完了の判定

Phase 6-B-04 完了の条件:

- [ ] 5 関数 + `multiCampusBulkOperationsAI_` の計 6 関数すべてが KV フラグ ON で 2 週間以上安定稼働
- [ ] GAS 側の 5 関数（+ ラッパー）が dead code 化済（呼出経路が無効）
- [ ] 動作確認チェックリスト（6.4）が全項目 ✅
- [ ] `docs/migration-plan.md` に Phase 6-B-04 クローズ記録が追記されている
- [ ] `CLAUDE.md` の「Phase 6-A' クローズ」記述に続いて Phase 6-B-04 クローズが記載されている

### 7.7 想定実施スケジュール（参考）

| Week | 内容 |
|------|-----|
| W1 | Phase 6-B-04-00（事前準備・Workers 実装・未接続デプロイ） |
| W2 | Phase 6-B-04-01（createLectureEntryAI 切替・観測） |
| W3 | Phase 6-B-04-02（editLectureEntryAI 切替・観測） |
| W4 | Phase 6-B-04-03（deleteLectureEntryAI 切替・観測） |
| W5-W6 | Phase 6-B-04-04（bulkLectureOperationsAI 切替・長期観測） |
| W7 | Phase 6-B-04-05（multiCampusBulkOperationsAI 切替・観測） |
| W8-W9 | Phase 6-B-04-06（createWeeklyLectureEntriesAI 切替・長期観測） |
| W10-W11 | Phase 6-B-04-07（GAS 側 dead code 化・クローズ） |

合計 **約 10-11 週間**（観測期間を長めに取った場合）。最短で **6-7 週間**（問題なく順調に進んだ場合）。

---

## 付録: 関連ドキュメント

- `CLAUDE.md` — Phase 6-A' クローズ記述・「Workers 化時の設計ルール」セクション
- `docs/migration-plan.md` — Phase 6-B 全体計画・Phase 6-B-09 ロールバック記録
- `docs/remaining-functions-inventory.md` — 関数分類の原本（C 分類 79 関数の原資料）
- `workers/src/firebase.js:275` — `firestoreTransaction` 実装
- `workers/src/functions/features.js:1461` — `saveLectureScheduleEntries` Workers 版（Phase 6-B-03 の参考実装）
- `workers/src/helpers/datetime-helpers.js` — JST 安全な日付処理（Phase 6-B-05）
- `workers/src/functions/auth.js:50` — `isAdminUser`（隠し Admin 対応済）
- `features.js:1779` — `executeAiAction`（GAS 版・Phase 6-B-04 の境界）
- `features.js:3079` / `:3135` / `:3239` / `:3289` / `:3332` / `:3445` — 対象 5+1 関数の GAS 版原本

---

**本レポート作成者**: Claude Code (Phase 6-B 継続担当)
**最終更新**: 2026-04-24

