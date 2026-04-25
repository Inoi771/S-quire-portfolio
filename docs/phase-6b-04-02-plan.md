# Phase 6-B-04-02 実施記録: editLectureEntryAI の Workers 切替

> 作成日: 2026-04-25（Phase 6-B-04-01 観測中の並行作業として作成）
> 対象関数: `editLectureEntryAI_`（features.js:3239）
> KV フラグ: `prop:FF_AI_LECTURE_EDIT`
> 速度重視モード（社内 15 名運用前提）
> 前提: Phase 6-B-04-01 完了（createLectureEntryAI が Workers 経路で安定稼働）

---

## 0. 進捗ステータス

| 項目 | ステータス |
|-----|----------|
| Stage 1: shim 差込 + デプロイ | _Phase 6-B-04-01 観測中に並行実装可能（§5.4 並行作業ルール）_ |
| Stage 2.0: フラグ ON | _Phase 6-B-04-01 クローズ後_ |
| Stage 2.1: Admin 編集カナリア | _Stage 2.0 直後_ |
| Stage 2.2: 権限拒否カナリア | _Stage 2.1 直後_ |
| テストエントリ削除 | _カナリア完了直後_ |
| Stage 2.4: 本番利用観測（24h） | _カナリア完了後_ |
| Phase 6-B-04-02 クローズ判定 | _24h 観測後_ |

---

## 1. 設計サマリー

### 1.1 shim 差込位置

`features.js:1851-1853`（`executeAiAction` 内 `edit_lecture_entry` 分岐）の単一 return を以下に置換:

```js
if (action === 'edit_lecture_entry') {
  var _editArgs = [params.lectureId, params.campusCode, params.entryId, params.changes || {}];
  if (shouldUseWorkersForAiAction_('FF_AI_LECTURE_EDIT')) {
    try {
      return callWorkersInternal_('editLectureEntryAI', _editArgs);
    } catch (e) {
      Logger.log('⚠ editLectureEntryAI Workers 経路失敗 → GAS fallback: ' + e);
    }
  }
  return editLectureEntryAI_.apply(null, _editArgs);
}
```

**変更行数**: 1 行 → 11 行（+10 行）。Phase 6-B-04-01 の create shim と同パターン。

### 1.2 createLectureEntryAI との差分

| 観点 | createLectureEntryAI（6-B-04-01） | editLectureEntryAI（6-B-04-02） |
|-----|---------------------------------|-------------------------------|
| RMW 種別 | append（既存に push） | in-place 更新（ID 一致検索 + フィールド部分更新） |
| 権限チェック | なし（自分の新規 entry なので不要） | ⚠️ あり（Admin 以外は他者の entry を編集不可） |
| 戻り値メッセージ | F01（変動部 date/startTime/subject） | F03（**固定**: `エントリを更新しました`） |
| 失敗メッセージ | F21 のみ（save 失敗） | **F04**（entry ID 不一致）/ **F05**（権限拒否）/ F21 |
| 検証フォーカス | F01 バイトレベル一致 / Firestore 副作用 | F05 バイトレベル一致（権限拒否ロジックの新規性） |

**最重要新ロジック**: **権限拒否（F05）**。Workers 版の `_resolveAiLectureContext_` が Admin 判定 + teacherId 解決を行い、tx 内で `existing[targetIdx].teacherId !== ctx.teacherId` 比較で判定する。GAS 版（features.js:3256）と同等。

### 1.3 Workers 側実装

Phase 6-B-04-00（コミット `ceb3028`）で実装済。**追加実装は不要**。
- 関数: `workers/src/functions/features.js` の `editLectureEntryAI`
- router 登録: 済（HANDLERS / INTERNAL_FUNCTIONS / INTERNAL_FUNCTIONS_NEED_USER）
- 戻り値: F03（成功）/ F04（不一致）/ F05（権限）/ F21（fallback）

### 1.4 関連ドキュメント

- `docs/phase-6b-04-investigation.md` セクション 1.1（戻り値）/ 1.7（権限チェック）
- `docs/phase-6b-04-00-message-fixtures.md` F03 / F04 / F05
- `docs/phase-6b-04-01-plan.md` Phase 6-B-04-01 設計（shim パターンの参考）

---

## 2. Stage 1 実施記録

### 2.1 並行作業ルール

Phase 6-B-04-01 観測（24h）中に Stage 1 のみ並行実装可能:
- ✅ 可: edit_lecture_entry 分岐の shim 追加（create_lecture_entry には触れない）
- ✅ 可: workers-bridge.js 末尾に `_flagOn_EDIT` / `_flagOff_EDIT` スタブ追加
- ❌ 不可: フラグ ON（Phase 6-B-04-01 クローズ判定後まで待機）

### 2.2 Stage 1 実装内容

| 変更ファイル | 内容 |
|------------|-----|
| `features.js` | `executeAiAction` 内 `edit_lecture_entry` 分岐に shim 10 行追加 |
| `workers-bridge.js` | 末尾に `_flagOn_EDIT` / `_flagOff_EDIT` スタブ 2 関数追加 |
| `CLAUDE.md` | デプロイカウンター +1 |

### 2.3 コミット情報

- コミット: _実装後追記_
- push 時刻: _追記_
- GAS 反映確認: _追記_

### 2.4 Stage 1 動作確認（KV OFF のまま）

- [ ] `_testCheckAllFlags()` で `FF_AI_LECTURE_EDIT = (unset)` 維持
- [ ] AI ウィジェットで edit_lecture_entry 1 件成功（GAS 経路で実行）
- [ ] AI 表示メッセージが既存通り（`✅ エントリを更新しました`）
- [ ] Cloudflare Workers ログで `editLectureEntryAI` 呼出記録なし
- [ ] 既存機能（create / delete / bulk）に影響なし

---

## 3. Stage 2.0 フラグ ON 実施記録

### 3.1 前提条件

- Phase 6-B-04-01 クローズ済（`FF_AI_LECTURE_CREATE = workers` で 24h 安定稼働）
- Stage 1 動作確認 OK
- `FF_AI_LECTURE_EDIT = (unset)` 状態

### 3.2 ON 実施

- 実施時刻: _追記_
- 実施方法: GAS エディタから `_flagOn_EDIT()` 関数実行
- 戻り値: _追記_
- 2 分待機完了: _追記_

---

## 4. Stage 2.x カナリア実施記録（速度重視モード・必須 2 件）

### 4.1 事前準備: テスト用 Admin entry 作成

1 件のテスト entry を Admin で新規作成（2.1/2.2 のテスト対象として共用）:

| 項目 | 値 |
|-----|-----|
| 経路 | Phase 6-B-04-01 が Workers 化済なので `createLectureEntryAI` 経由（Workers） |
| `lectureId` | _Stage 2.0 直前にヒアリング_ |
| `campusCode` | `'01'` 想定（直前確認） |
| `date` | `'2026-12-29'`（Phase 6-B-04-01 のテストと衝突回避） |
| `startTime` | `'15:00'` |
| `subject` | `'edit検証元'` |
| `grade` | `'中1'` |

期待: F01 メッセージで成功・Firestore に entry 追加・**作成された `entryId` を控える**（Stage 2.1/2.2 で使用）。

### 4.2 Stage 2.1: Admin 自分の entry を編集

| 項目 | 内容 |
|-----|-----|
| アカウント | Shinji さん Admin |
| 操作 | AI ウィジェットで `「edit検証元の subject を『edit成功テスト』に変更して」` |
| 内部処理 | `executeAiAction('edit_lecture_entry', {entryId: <控えた値>, changes: {subject: 'edit成功テスト'}})` |
| 期待結果 | AI 表示: `✅ エントリを更新しました` |
| 検証 1（F03 一致） | バイトレベル一致 `エントリを更新しました`（変動部なし・固定文字列） |
| 検証 2（Workers 到達） | Cloudflare Logs で `editLectureEntryAI` 呼出記録あり |
| 検証 3（GAS 非到達） | GAS Logs で `editLectureEntryAI_` 呼出なし（executeAiAction のみ） |
| 検証 4（Firestore 副作用） | `entries[idx].subject` が `'edit成功テスト'` に更新・他フィールド不変 / `id` 不変 / `teacherId` 不変 |

成功判定: 4 検証すべて OK。

### 4.3 Stage 2.2: 個人アカウントが Admin の entry を編集試行（権限拒否検証）

⚠️ **本フェーズ最重要テスト**: F05 権限拒否ロジックの parity を検証する唯一のカナリア。

| 項目 | 内容 |
|-----|-----|
| アカウント | Shinji さん個人（**ログアウト → 個人で再ログイン**） |
| 操作 | AI ウィジェットで `「edit検証元の startTime を '16:00' に変更して」`（Admin が作成した entry を編集試行） |
| 期待結果 | AI 表示: `❌ 他の講師のエントリは編集できません`（または同等の失敗メッセージ表示） |
| 検証 1（F05 一致） | エラーメッセージのバイトレベル一致 `他の講師のエントリは編集できません` |
| 検証 2（Workers 到達） | Cloudflare Logs で `editLectureEntryAI` 呼出記録あり（権限チェックは Workers 内で実行） |
| 検証 3（Firestore 副作用なし） | `entries[idx].startTime` が **変更されていない** こと（編集が拒否されたため） |
| 検証 4（teacherId 比較） | Workers 内で `existing[targetIdx].teacherId !== ctx.teacherId` の判定が正しく動作 |

成功判定: 4 検証すべて OK。

### 4.4 テストエントリ削除（cleanup）

| 項目 | 内容 |
|-----|-----|
| アカウント | Admin に戻る |
| 経路 | GAS `deleteLectureEntryAI_`（Phase 6-B-04-03 まで未切替） |
| 操作 | AI ウィジェットで `「edit検証元 を削除して」` |
| 確認 | Firestore で entry 消滅 |

---

## 5. Stage 2.4 本番利用観測（24h）

### 5.1 観測項目（Phase 6-B-04-01 と同枠組み）

| # | 項目 | 確認方法 | 正常範囲 |
|---|-----|---------|---------|
| 1 | Workers `editLectureEntryAI` 呼出数 | Cloudflare Dashboard → Logs（24h アグリゲート） | 5-30 件/日 |
| 2 | Workers 関数失敗率（500 系） | `console.error` 出現率 | < 1% |
| 3 | F05 権限拒否の正常応答数 | `{success:false, error:'他の講師のエントリは編集できません'}` 出現数 | 業務に応じる（誤表示でなければ問題なし） |
| 4 | GAS Logger.log の `Workers 経路失敗 → GAS fallback` | GAS ダッシュボード | 0-2 件/日 |
| 5 | スタッフからの編集エラー報告 | Slack / 対面 | 0 件 |

### 5.2 日次ログ

| 確認時刻 | 呼出数 | 失敗率 | fallback 件数 | F05 件数 | 特記事項 |
|---------|-------|------|-----------|--------|--------|
| _追記_ | _-_ | _-_ | _-_ | _-_ | _-_ |

### 5.3 クローズ判定（24h 後）

- [ ] 24h 内呼出数 > 10 件
- [ ] 失敗率 0%
- [ ] fallback 0 件
- [ ] F03 / F05 メッセージ差異報告 0 件
- [ ] スタッフ報告 0 件
- [ ] `_testCheckAllFlags()` で `FF_AI_LECTURE_EDIT = workers` 維持

すべて OK で **Phase 6-B-04-02 クローズ**。

---

## 6. クローズ総括

_クローズ時に追記_

### 6.1 実績サマリー

- 観測期間: _-_
- 総呼出数: _-_
- F03 成功件数 / F05 権限拒否件数 / F04 ID 不一致件数 / その他失敗件数: _-_
- fallback 件数: _-_
- スタッフ報告: _-_

---

## 7. 次フェーズ準備メモ

### 7.1 Phase 6-B-04-03（deleteLectureEntryAI）への引継ぎ

- shim パターンが create / edit で確立済み・delete は同型
- 権限チェックロジックも edit と同じ（features.js:3306）
- カナリア構成も Phase 6-B-04-02 と同様（Admin 自削除 + 個人で Admin entry 削除試行）
- 並行作業: Phase 6-B-04-02 観測中に Phase 6-B-04-03 Stage 1 実装可能（§5.4）

### 7.2 並行可能な低優先度タスク（観測期間中）

- [ ] **テストスタブに Logger.log を追加**（運用改善）
  - 対象: `_testCheckAllFlags` / `_testCallWorkersInternal` / `_flagOn_*` / `_flagOff_*`
  - 現状: 戻り値で結果取得するため、GAS エディタの実行ログから確認できない（手動ラッパーが必要）
  - 改善案: 関数内で `Logger.log(result)` を追加し、戻り値とログ両方で確認可能にする
  - 優先度: 低（ラッパー回避策で対応可能）
  - 実施タイミング: Stage 1 動作確認再開後の落ち着いたタイミングで別 commit
  - 影響範囲: workers-bridge.js の数行修正のみ

### 7.3 Phase 6-B-04-06 着手前 TODO（再掲）

- [ ] `gradeToSettingsKey` に日本語キー追加（GAS + Workers 同 commit）
- [ ] Jest フィクスチャ C01-C12 整備
- 詳細: `docs/phase-6b-04-01-plan.md` § 6.2

---

## 8. ロールバック手順（緊急時・3-5 分）

1. GAS エディタで `_flagOff_EDIT()` 実行
2. `_testCheckAllFlags()` で `FF_AI_LECTURE_EDIT = (unset)` 確認
3. 2 分待機（KV 伝播）
4. AI ウィジェットで edit テスト 1 件 → GAS 経路で成功確認
5. Cloudflare logs で `editLectureEntryAI` 呼出停止確認
6. 原因調査・修正後に再着手

ロールバック判定基準: `docs/phase-6b-04-01-plan.md` § 7.3 と同じ。

---

## 【中止】2026-04-26 追記

### 中止理由

並行作成された Phase 6-B-04-01 が 2026-04-25 深夜の Stage 2.1 試行で 3 件の問題を抱えて中断したため、本 plan（edit Stage）も着手前に中止となった。

2026-04-26 に方針再検討を実施し、**案 2（AI write 系廃止）** を採用。`editLectureEntryAI_` も含めた AI write 系全体を次フェーズで削除する。

### 残置物の扱い

`docs/phase-6b-04-01-plan.md` の中止追記と同じ:
- `features.js` の `editLectureEntryAI_` は次フェーズで削除
- Workers 側の対応関数も dead endpoint として残置・次フェーズで削除
- KV フラグ `FF_AI_LECTURE_EDIT` は unset 状態で残置

### 次フェーズでの一括削除予定

詳細は `docs/phase-6b-04-completion-2026-04-26.md` § 4 参照。

### 学びの保持

本 plan 自体は削除しない。speed mode（並行作成）の運用パターンは今後の Workers 移行で再利用できる。
