# Phase 6-B-04-00 P1: teacherId 解決の GAS/Workers 並列比較

> 作成日: 2026-04-24
> 目的: GAS 版 `getOrCreateTeacherId()` と Workers 版 `supabaseRpc('find_staff_by_auth')` の解決結果が一致することを本番ログで確認する
> 結果記録欄は本ドキュメント末尾の「7. 並列比較ログ」に追記する（Workers 実装後・各サブフェーズ着手前）

---

## 1. 比較対象

| 項目 | GAS 版 | Workers 版 |
|-----|--------|-----------|
| 入力 | `getFirebaseEmailContext_()` + `_firebaseUidContext_` | `user.email` + `user.uid`（router で Firebase ID トークン検証済） |
| 解決経路 | `getOrCreateTeacherId()` → `getCurrentStaff_()` → `resolveStaffByUid_(uid, email)` → `supabaseRpc_('find_staff_by_auth', { p_uid, p_email })` | `supabaseRpc(env, 'find_staff_by_auth', { p_uid, p_email })` 直呼出 |
| 実装位置 | `settings.js:478` (getOrCreate), `settings.js:146` (resolve) | `workers/src/functions/features.js:1481-1490`（`saveLectureScheduleEntries` 内パターン） |
| キャッシュ | `_currentStaff_`（GAS 実行内でメモ化） | なし（リクエストごとに RPC 呼出） |
| 戻り値の優先順 | `staff.teacherId \|\| staff._id` | `staff.teacherId \|\| staff._id`（Workers 版も同じ優先順） |
| 副次効果 | 配列フィールド自動マイグレーション（`emails` / `firebaseUids` push）あり | **なし**（読取専用） |

> ⚠️ GAS 版にある「emails / firebaseUids 配列の自動マイグレーション」は Workers 版に**意図的に存在しない**。
> staffs テーブルの読取頻度が高くなる Workers 環境で書込が走るとレースしやすいため、登録系（既存の GAS フロー）で済ませる方針。
> Phase 6-B-04 のスコープでは AI lecture 操作のみが Workers 化されるため、登録経路は GAS のまま稼働継続する。

---

## 2. 一致確認の条件

以下が全て成立する場合のみ「一致」と判定:

- [ ] 同一 Firebase UID + email で GAS / Workers それぞれを呼出
- [ ] GAS 版の戻り値（`teacherId` 文字列 or null）と Workers 版の戻り値が**完全一致**
- [ ] Supabase RPC `find_staff_by_auth` が両者で**同じ行**を返す（行の `id` カラムで比較）
- [ ] `null` 返却時も両者一致（未登録ユーザーで両方 null）

---

## 3. 比較対象ユーザー候補（10 名）

実本番ユーザーから以下のパターンを抜粋して比較する。Phase 完了後にログを削除する前提。

| # | パターン | 期待値 |
|---|---------|-------|
| U1 | 通常の Admin（`ADMIN_EMAILS` に含まれる） | teacherId 取得・両者一致 |
| U2 | 通常の講師（staffs に登録済・主たる UID 一致） | teacherId 取得・両者一致 |
| U3 | サブメール登録ユーザー（`emails` 配列に複数含まれる） | サブメールでも一致 |
| U4 | サブ UID 登録ユーザー（`firebaseUids` 配列に複数含まれる） | サブ UID でも一致 |
| U5 | UID のみ登録（email カラム空） | UID 経由で一致 |
| U6 | email のみ登録（firebaseUid カラム空） | email 経由で一致 |
| U7 | 大文字メールでログイン（`Foo@example.com`） | 小文字化して一致 |
| U8 | 末尾改行・前後スペースありメール | RPC 側でトリム想定・一致確認 |
| U9 | staffs に未登録のメール（新規ログイン直後） | 両者 null |
| U10 | 隠し Admin モード適用中ユーザー | teacherId 取得・両者一致（権限フラグは別経路） |

> 実ユーザー名・実 UID・実メールは本ドキュメントには記載しない（個人情報保護のため）。
> 7. 並列比較ログ にはハッシュ化または「U1」のような匿名 ID で記録する。

---

## 4. 比較スクリプトの設計

### 4.1 GAS 側ログ採取（既存関数に一時 Logger.log を追加）

`features.js` の各 AI 関数（`createLectureEntryAI_` 等）の冒頭に以下を一時的に追加:

```js
// [Phase 6-B-04-00 P1] 削除予定: teacherId 並列比較用ログ
try {
  var __pid = getOrCreateTeacherId();
  var __pemail = getFirebaseEmailContext_() || '';
  Logger.log('[P1-teacherId-GAS] uid=' + (_firebaseUidContext_ || '') +
    ' email=' + __pemail + ' teacherId=' + (__pid || 'null'));
} catch (__e) { Logger.log('[P1-teacherId-GAS-err] ' + __e); }
```

### 4.2 Workers 側ログ採取（KV フラグ ON 後の Workers 関数に一時 console.log を追加）

`workers/src/functions/features.js` の各 AI 関数（Phase 6-B-04-00 ステップ2 で実装）の冒頭に:

```js
// [Phase 6-B-04-00 P1] 削除予定: teacherId 並列比較用ログ
try {
  const rows = await supabaseRpc(env, 'find_staff_by_auth', {
    p_uid: (user && user.uid) || null,
    p_email: (user && user.email) ? user.email.toLowerCase() : null
  });
  const tid = rows && rows[0] ? (rows[0].teacherId || rows[0]._id || '') : null;
  console.log('[P1-teacherId-Workers] uid=' + ((user && user.uid) || '') +
    ' email=' + ((user && user.email) || '') + ' teacherId=' + (tid || 'null'));
} catch (e) { console.log('[P1-teacherId-Workers-err] ' + e); }
```

### 4.3 ログの突合手順

1. Phase 6-B-04-01 〜 06 の各サブフェーズで「KV フラグ OFF（GAS 経路）→ ON（Workers 経路）→ OFF」を順に切替
2. 各経路で同一ユーザーが同じ AI 操作を実行（例: 「テスト用エントリを追加して」）
3. GAS 側ログは Apps Script ダッシュボード「実行数」から取得
4. Workers 側ログは Cloudflare Dashboard → Workers → Logs（または `wrangler tail`）から取得
5. uid + email + teacherId の三組が完全一致することを確認

---

## 5. 不一致が見つかった場合の対応

| 不一致の種類 | 想定原因 | 対応 |
|------------|---------|-----|
| GAS=teacherId / Workers=null | Workers 側で `user.email` / `user.uid` が router 由来でない（呼出経路バグ） | router の `INTERNAL_FUNCTIONS` 内で email/uid を body から復元する処理が漏れている → 修正してから再テスト |
| GAS=null / Workers=teacherId | GAS 側 `_firebaseUidContext_` が未設定（`setFirebaseEmailContext_` の呼出漏れ） | 既存 GAS フローの問題なので Phase 6-B-04 では触らず別 Issue 化 |
| 両者 teacherId が異なる ID | RPC `find_staff_by_auth` が複数行返している（重複登録） | データ重複として別 Issue 化（Phase 6-B-04 では対応せず、ユーザー報告） |
| 大文字メールで Workers=null | Workers 側の `email.toLowerCase()` 漏れ | Workers 実装で必ず `email.toLowerCase()` を通すこと（4.2 参照） |

---

## 6. ログ削除のチェックリスト（Phase 6-B-04 クローズ時）

- [ ] `features.js` の `[P1-teacherId-GAS]` ログを全削除
- [ ] `workers/src/functions/features.js` の `[P1-teacherId-Workers]` ログを全削除
- [ ] 本ドキュメントに「ログ削除済」を追記
- [ ] 7. 並列比較ログ の生データは保持（匿名化済のため）

---

## 7. 並列比較ログ（Phase 6-B-04-01 以降に追記）

> 実装後、各サブフェーズで観測した結果をここに追記する。
> フォーマット: `YYYY-MM-DD HH:MM | ユーザー区分 | uid_hash | email_hash | GAS_tid | Workers_tid | 一致/不一致`
> 個人情報は SHA1 prefix 8 文字で匿名化する想定。

| 日時 | ユーザー区分 | uid_hash | email_hash | GAS_tid | Workers_tid | 結果 |
|------|------------|----------|-----------|---------|-------------|------|
| _未取得_ | _Phase 6-B-04-01 着手後に追記_ | - | - | - | - | - |

---

## 8. 関連ドキュメント

- `docs/phase-6b-04-investigation.md` セクション 6.2.1（R1: teacherId 解決の不一致）
- `settings.js:146` `resolveStaffByUid_`（GAS 版本体）
- `workers/src/functions/features.js:1476-1490`（Workers 版参考実装）
- `workers/src/supabase.js` `supabaseRpc`
