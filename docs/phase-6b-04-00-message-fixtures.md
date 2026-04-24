# Phase 6-B-04-00 P2: GAS 版 5 関数の戻り値メッセージ原文集

> 作成日: 2026-04-24
> 目的: Workers 版実装時の **character-for-character 一致** の比較基準として、GAS 版の戻り値メッセージを原文のまま列挙する
> 出典: `features.js:3079-3466`（GAS 版 5+1 関数）と `docs/phase-6b-04-investigation.md` セクション 1.1
> リスク参照: 6.2.3（R3: 戻り値メッセージの不一致）

---

## 0. 重要な原則

- メッセージは**全て JavaScript 文字列リテラル**として原文のまま記録（前後のクォート / バッククォートは除く）
- 全角・半角・絵文字・スペースの数も**完全一致**を求める
- フロント `js-ai-actions.html:232-233` は `'✅ ' + (result.message || '処理が完了しました')` で表示するため、変動部（日付・時刻・教科名等）は `${VAR}` プレースホルダで示す
- `${VAR}` は実装時に元の式と完全一致するよう注意（例: `date + ' ' + startTime + '〜 ' + subject` の順序・スペース）

---

## 1. `createLectureEntryAI_`（features.js:3079）

### 1.1 成功

| 戻り値 | パターン |
|--------|---------|
| `{ success: true, message: '${date} ${startTime}〜 ${subject} の授業を追加しました' }` | 1 件追加成功 |

**変動部の式**:
```js
date + ' ' + startTime + '〜 ' + subject + ' の授業を追加しました'
```

**注意**:
- `${date}` と `${startTime}` の間は **半角スペース 1 つ**
- `${startTime}` の直後は **波ダッシュ U+301C「〜」** + **半角スペース 1 つ**
- `${subject}` の直後は **半角スペース 1 つ** + 「の授業を追加しました」

### 1.2 失敗

| 戻り値 | 発生条件 |
|--------|---------|
| `{ success: false, error: '保存に失敗しました' }` | `saveLectureScheduleEntries` が `success: false` を返し、かつ `result.error` が空 |
| `{ success: false, error: ${result.error} }` | `saveLectureScheduleEntries` が `success: false` で `error` を含む |
| `{ success: false, error: ${error.toString()} }` | catch 句（LockService 失敗・その他例外） |

---

## 2. `createWeeklyLectureEntriesAI_`（features.js:3135）

### 2.1 成功

| 戻り値 | パターン |
|--------|---------|
| `{ success: true, message: '${created}件の授業コマを作成しました（毎週・休校日除く）' }` | 1 件以上作成成功 |

**変動部の式**:
```js
created + '件の授業コマを作成しました（毎週・休校日除く）'
```

**注意**:
- `${created}` は数字のみ（0 でも空文字でもなく Number そのまま）
- `件` の前後にスペースなし
- 全角括弧 `（）` を使用（半角 `()` ではない）
- `毎週` と `休校日除く` の間は **中黒 U+30FB「・」**

### 2.2 失敗

`createLectureEntryAI_` と同じ 3 パターン（1.2 参照）。

---

## 3. `editLectureEntryAI_`（features.js:3239）

### 3.1 成功

| 戻り値 | パターン |
|--------|---------|
| `{ success: true, message: 'エントリを更新しました' }` | 編集成功（固定文字列） |

**注意**:
- 変動部なし・完全な固定文字列
- 「更新」であって「変更」「修正」「編集」ではない

### 3.2 失敗

| 戻り値 | 発生条件 |
|--------|---------|
| `{ success: false, error: '指定されたエントリが見つかりません（ID: ${entryId}）' }` | entryId 不一致 |
| `{ success: false, error: '他の講師のエントリは編集できません' }` | 権限チェック失敗（非 Admin が他者の entry を編集） |
| `{ success: false, error: '保存に失敗しました' }` | save 失敗 + error 空 |
| `{ success: false, error: ${result.error} }` | save 失敗 + error あり |
| `{ success: false, error: ${error.toString()} }` | catch 句 |

**変動部の式**:
```js
'指定されたエントリが見つかりません（ID: ' + entryId + '）'
```

**注意**:
- 全角括弧 `（）` を使用
- `ID:` は **半角コロン + 半角スペース 1 つ** + `${entryId}`
- 末尾の `）` の後ろにスペースなし

---

## 4. `deleteLectureEntryAI_`（features.js:3289）

### 4.1 成功

| 戻り値 | パターン |
|--------|---------|
| `{ success: true, message: '${deleted.date} ${deleted.startTime}〜 ${deleted.subject} を削除しました' }` | 削除成功 |

**変動部の式**:
```js
deleted.date + ' ' + deleted.startTime + '〜 ' + deleted.subject + ' を削除しました'
```

**注意**:
- `${deleted}` は **削除された entry オブジェクト**（splice の戻り値 `[0]`）
- フォーマットは createLectureEntryAI と同型（1.1 と同じスペース規約）
- 「を削除しました」であって「削除しました」（「を」が必須）

### 4.2 失敗

| 戻り値 | 発生条件 |
|--------|---------|
| `{ success: false, error: '指定されたエントリが見つかりません（ID: ${entryId}）' }` | entryId 不一致（3.2 と同型） |
| `{ success: false, error: '他の講師のエントリは削除できません' }` | 権限チェック失敗（**「編集」ではなく「削除」**） |
| `{ success: false, error: '保存に失敗しました' }` | 同上 |
| `{ success: false, error: ${result.error} }` | 同上 |
| `{ success: false, error: ${error.toString()} }` | 同上 |

---

## 5. `bulkLectureOperationsAI_`（features.js:3332）

### 5.1 成功

| 戻り値 | パターン |
|--------|---------|
| `{ success: true, message: '${parts.join('、')}を処理しました' }` | 全件成功 |
| `{ success: true, message: '${parts.join('、')}を処理しました（${errors.length}件スキップ）' }` | 一部スキップあり |

**変動部の式**:
```js
var parts = [];
if (createdCount > 0) parts.push('追加' + createdCount + '件');
if (editedCount > 0) parts.push('変更' + editedCount + '件');
if (deletedCount > 0) parts.push('削除' + deletedCount + '件');
var msg = parts.join('、') + 'を処理しました';
if (errors.length > 0) msg += '（' + errors.length + '件スキップ）';
```

**注意**:
- 区切り文字は **読点 U+3001「、」**（カンマ `,` ではない）
- 順序固定: **追加 → 変更 → 削除** の順（操作の実行順ではなく出力順）
- スキップ件数は全角括弧 `（）` で囲む
- `件スキップ` の前後にスペースなし

### 5.2 失敗

| 戻り値 | 発生条件 |
|--------|---------|
| `{ success: false, error: '操作がありません' }` | `operations` が空配列 or null |
| `{ success: false, error: '処理できる操作がありませんでした' }` | 全件スキップ + errors 空 |
| `{ success: false, error: '処理できる操作がありませんでした（${errors.join('、')}）' }` | 全件スキップ + errors あり |
| `{ success: false, error: '保存に失敗しました' }` | save 失敗 + error 空 |
| `{ success: false, error: ${result.error} }` | save 失敗 + error あり |
| `{ success: false, error: ${error.toString()} }` | catch 句 |

### 5.3 errors に push されるメッセージ（4 種・スキップ扱い）

これらは戻り値の `error` 文字列に `'、'` 区切りで埋め込まれる:

- `'編集: エントリが見つかりません'`（半角コロン + 半角スペース 1 つ）
- `'編集: 他の講師のエントリ'`（末尾「が見つかりません」「は編集できません」**等は付かない**・原文のまま）
- `'削除: エントリが見つかりません'`
- `'削除: 他の講師のエントリ'`

**注意**: 単発関数（`editLectureEntryAI_` / `deleteLectureEntryAI_`）の権限エラーメッセージとは**文言が異なる**ので注意。
単発: `'他の講師のエントリは編集できません'` / bulk: `'編集: 他の講師のエントリ'`

---

## 6. `multiCampusBulkOperationsAI_`（features.js:3445）

### 6.1 成功

| 戻り値 | パターン |
|--------|---------|
| `{ success: true, message: '${messages.join(' / ')}' }` | 全校舎成功 |
| `{ success: true, message: '${messages.join(' / ')} ⚠️ 一部エラー: ${errors.join(', ')}' }` | 一部校舎エラー（成功も 1 件以上あり） |

**変動部の式**:
```js
var msg = messages.join(' / ');
if (errors.length > 0) msg += ' ⚠️ 一部エラー: ' + errors.join(', ');
```

**注意**:
- 校舎間の区切りは **半角スペース + スラッシュ + 半角スペース `' / '`**
- 警告アイコン **U+26A0 + U+FE0F「⚠️」**（VS16 セレクタ付き）
- `一部エラー:` の後は **半角スペース 1 つ**
- エラー間の区切りは **半角カンマ + 半角スペース `', '`**（成功時の `' / '` とは異なる）
- `messages` 配列の各要素は `bulkLectureOperationsAI_` の `result.message`（5.1 のフォーマット）

### 6.2 失敗

| 戻り値 | 発生条件 |
|--------|---------|
| `{ success: false, error: '校舎グループがありません' }` | `campusGroups` が空配列 or null |
| `{ success: false, error: '${errors.join(' / ')}' }` | 全校舎エラー（成功 0 件） |

**変動部の式（全エラー時）**:
```js
errors.push((group.campusCode || '?') + '校: ' + (r && r.error || 'エラー'));
// ...
return { success: false, error: errors.join(' / ') };
```

**注意**:
- 各エラーは `'${campusCode}校: ${error}'` 形式（`?校` は campusCode 不明時のフォールバック）
- `校:` は **半角コロン + 半角スペース 1 つ**
- 成功時の区切り `', '` とは異なり、全エラー時の区切りは `' / '`（成功内訳と同じ）
- errors の最終要素のフォールバック `'エラー'` は固定 4 文字（句読点なし）

---

## 7. クイックリファレンス: 文字パターン一覧

Workers 実装時にコピペで使えるよう、変動なしの固定文字列をまとめる:

| ID | 出現関数 | 文字列 |
|----|---------|--------|
| F01 | createLectureEntryAI | `' の授業を追加しました'`（先頭スペース 1） |
| F02 | createWeeklyLectureEntriesAI | `'件の授業コマを作成しました（毎週・休校日除く）'` |
| F03 | editLectureEntryAI | `'エントリを更新しました'` |
| F04 | edit/delete/bulk | `'指定されたエントリが見つかりません（ID: '` + entryId + `'）'` |
| F05 | editLectureEntryAI | `'他の講師のエントリは編集できません'` |
| F06 | deleteLectureEntryAI | `'他の講師のエントリは削除できません'` |
| F07 | bulkLectureOperationsAI | `'編集: エントリが見つかりません'` |
| F08 | bulkLectureOperationsAI | `'編集: 他の講師のエントリ'` |
| F09 | bulkLectureOperationsAI | `'削除: エントリが見つかりません'` |
| F10 | bulkLectureOperationsAI | `'削除: 他の講師のエントリ'` |
| F11 | bulkLectureOperationsAI | `'操作がありません'` |
| F12 | bulkLectureOperationsAI | `'処理できる操作がありませんでした'` |
| F13 | bulkLectureOperationsAI | `'を処理しました'`（変動 parts.join('、') の後に連結） |
| F14 | bulkLectureOperationsAI | `'件スキップ）'`（前は変動 errors.length） |
| F15 | bulkLectureOperationsAI | `'追加'` / `'変更'` / `'削除'` + Number + `'件'`（順序固定） |
| F16 | multiCampusBulkOperationsAI | `'校舎グループがありません'` |
| F17 | multiCampusBulkOperationsAI | `' ⚠️ 一部エラー: '`（前後スペース・コロンの後スペース） |
| F18 | multiCampusBulkOperationsAI | `'校: '`（半角コロン + スペース） |
| F19 | multiCampusBulkOperationsAI | `'?'`（campusCode 不明時のフォールバック） |
| F20 | multiCampusBulkOperationsAI | `'エラー'`（result.error 不在時のフォールバック） |
| F21 | 全関数 | `'保存に失敗しました'`（save 失敗 + error 空時のフォールバック） |

---

## 8. Jest テスト時の使い方

各サブフェーズの parity テストで以下のように使う想定:

```js
// 例: createLectureEntryAI parity test
test('成功メッセージが GAS 版と完全一致', async () => {
  const result = await createLectureEntryAI(
    ['lec_2026spring', '01', '2026-03-25', '14:00', 9, '数学', '13', null],
    env, mockUser
  );
  expect(result.success).toBe(true);
  expect(result.message).toBe('2026-03-25 14:00〜 数学 の授業を追加しました');
  // ↑ F01 と date/startTime/subject の組み合わせ
});

test('権限エラーメッセージ F05 と完全一致', async () => {
  // ... 非 Admin が他者 entry を編集
  expect(result.error).toBe('他の講師のエントリは編集できません');
});
```

---

## 9. 関連ドキュメント

- `docs/phase-6b-04-investigation.md` セクション 1.1（戻り値・失敗戻り値）/ 6.2.3（R3 回避策）
- `features.js:3079-3466`（GAS 版本体）
- `js-ai-actions.html:229-267`（フロント側のメッセージ表示処理）
