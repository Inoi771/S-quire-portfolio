# Phase 6-B-04-01 実施記録: createLectureEntryAI の Workers 切替

> 作成日: 2026-04-25
> 対象関数: `createLectureEntryAI_`（非 weekly 経路のみ）
> KV フラグ: `prop:FF_AI_LECTURE_CREATE`
> 速度重視モード（社内 15 名運用前提）
>
> 設計の詳細は本ファイル末尾の「設計サマリー」または会話履歴の §1〜§5 を参照。

---

## 0. 進捗ステータス

| 項目 | ステータス |
|-----|----------|
| Stage 1: shim 差込 + デプロイ | _Stage 1 commit 直後に追記_ |
| Stage 2.0: フラグ ON | _Stage 2.0 完了直後に追記_ |
| Stage 2.1: Admin カナリア 1 件 | _Stage 2.1 完了直後に追記_ |
| テストエントリ削除 | _完了直後に追記_ |
| Stage 2.4: 本番利用開始 | _開始直後に追記_ |
| Phase 6-B-04-01 クローズ判定 | _24h 観測後に追記_ |

---

## 1. Stage 1 実施記録

### 1.1 実装内容

| 変更ファイル | 内容 |
|------------|-----|
| `features.js` | `executeAiAction` 内 `create_lecture_entry` 分岐に shim 差込（非 weekly のみ）。weekly 経路と他 action は無変更 |
| `workers-bridge.js` | 末尾に `_flagOn_CREATE` / `_flagOff_CREATE` スタブ追加（Phase 6-B-04 クローズ時削除） |
| `CLAUDE.md` | デプロイカウンター 46 → 47 |
| `docs/phase-6b-04-01-plan.md` | 本ファイル新規作成 |

### 1.2 コミット情報

- コミット: _push 後追記_
- push 時刻: _push 後追記_
- GAS 反映確認時刻: _動作確認後追記_

### 1.3 Stage 1 動作確認チェックリスト（KV OFF のまま既存挙動維持）

- [ ] GAS デプロイ反映確認（1-2 分後）
- [ ] `_testCheckAllFlags()` で `FF_AI_LECTURE_CREATE = (unset)` 維持
- [ ] AI ウィジェットでテスト 1 件作成 → 成功（GAS 経路で実行されること）
- [ ] AI 表示メッセージが既存通り（`✅ ${date} ${startTime}〜 ${subject} の授業を追加しました`）
- [ ] GAS Apps Script ログで `createLectureEntryAI_` が呼ばれていること
- [ ] Cloudflare Workers ログで `createLectureEntryAI` が呼ばれて**いない**こと

---

## 2. Stage 2.0 フラグ ON 実施記録

### 2.1 ON 実施

- 実施時刻: _実施後追記_
- 実施方法: GAS エディタから `_flagOn_CREATE()` 関数実行
- 戻り値: _実施後追記（`_testCheckAllFlags()` の出力）_

### 2.2 伝播確認

- 2 分待機完了時刻: _追記_
- 伝播確認: `_testCheckAllFlags()` で `FF_AI_LECTURE_CREATE = workers` 維持

---

## 3. Stage 2.1 カナリア（Admin 1 件）実施記録

### 3.1 テスト条件（着手時に Shinji さんと最終確定）

| 項目 | 値 |
|-----|-----|
| アカウント | Shinji さん Admin アカウント |
| `lectureId` | _Stage 1 直前にヒアリング_ |
| `campusCode` | `'01'` 想定（Stage 2.1 直前に再確認） |
| `date` | `'2026-12-28'` |
| `startTime` | `'15:00'` |
| `durationSlots` | `9`（デフォルト） |
| `subject` | `'パリティ検証A'` |
| `grade` | `'中1'`（実運用に合わせた日本語表記） |
| `classLabel` | `''`（任意） |

### 3.2 期待結果

- AI ウィジェット表示: `✅ 2026-12-28 15:00〜 パリティ検証A の授業を追加しました`

### 3.3 検証ログ

| 検証項目 | 結果 | 備考 |
|---------|-----|-----|
| F01 メッセージのバイトレベル一致 | _実施後追記_ | 波ダッシュ「〜」U+301C・スペース位置含む |
| Cloudflare Logs で `createLectureEntryAI` 呼出記録 | _追記_ | Workers 到達確認 |
| GAS Logs で `createLectureEntryAI_` 呼出**なし** | _追記_ | GAS 非到達確認 |
| Firestore `entries[末尾]` の 12 フィールド | _追記_ | §2.4 のチェックリスト |
| `grade` フィールドが `"中1"`（日本語） | _追記_ | 数値ではないこと |
| `teacherId` が Admin アカウントの ID | _追記_ | P1 parity 確認結果と一致 |
| `teacherEmail` が小文字 | _追記_ | toLowerCase 確認 |
| 既存 entries 非破壊 | _追記_ | 配列長が 1 増加・既存要素は不変 |

### 3.4 テストエントリ削除

- 削除発話: 「12 月 28 日の『パリティ検証 A』を削除して」
- 削除経路: GAS `deleteLectureEntryAI_`（Phase 6-B-04-03 まで未切替）
- 削除完了時刻: _追記_
- Firestore 確認: _追記_

---

## 4. Stage 2.4 本番利用開始 + 観測（24 時間）

### 4.1 観測開始時刻

_Stage 2.1 完了 + テストエントリ削除完了直後に追記_

### 4.2 日次ログ

#### Day 1（観測開始から 24h）

| 確認時刻 | 呼出数（Workers） | 失敗率 | fallback 件数 | 特記事項 |
|---------|---------------|------|-----------|--------|
| _追記_ | _-_ | _-_ | _-_ | _-_ |

### 4.3 観測中の異常事象

_異常があれば追記。なければ「異常なし」_

### 4.4 クローズ判定（24h 後）

§3.5 短縮条件チェック:

- [ ] 24h 内呼出数 > 10 件
- [ ] 失敗率 0%
- [ ] fallback 0 件
- [ ] F01 メッセージ差異報告 0 件
- [ ] スタッフからの作成エラー報告 0 件
- [ ] `_testCheckAllFlags()` で `FF_AI_LECTURE_CREATE = workers` 維持

すべて OK で **Phase 6-B-04-01 クローズ**。

---

## 5. クローズ総括

_クローズ時に追記_

### 5.1 実績サマリー

- 観測期間: _-_
- 総呼出数: _-_
- fallback 件数: _-_
- F01 不一致件数: _-_
- スタッフ報告: _-_

### 5.2 振り返り

_想定外の事象 / 学び / 次フェーズへの引継ぎ事項_

---

## 6. 次フェーズ準備メモ

### 6.1 Phase 6-B-04-02（editLectureEntryAI）への引継ぎ

- shim パターンが本フェーズで確立
- 観測中に Phase 6-B-04-02 Stage 1 を並行実装可能（§5.4 の並行作業ルール）
- 並行実装する場合は edit 分岐のみ touch・create 分岐は無変更

### 6.2 Phase 6-B-04-06（createWeeklyLectureEntriesAI）着手前 TODO

- [ ] **gradeToSettingsKey に日本語キー追加**（GAS 版 + Workers 版を**同 commit** で・parity 維持）
  - 対象: `features.js:3156-3162` と `workers/src/functions/features.js` の同テーブル
  - 追加キー: `'中1':'中1'`, `'中2':'中2'`, `'中3':'中3'`, `'高1':'高1'`, `'高2':'高2'`, `'高3':'高3'`（`'小':'小'` は既存）
  - 修正タイミング: Phase 6-B-04-05 クローズ後・6-B-04-06 Stage 1 着手前の単独 commit
- [ ] Jest フィクスチャ C01-C12 整備（境界ケースは `docs/phase-6b-04-00-weekly-boundary-cases.md` 参照）
- [ ] C11/C12（春期 grade key 変換）は実 grade 値（日本語キー）でテスト

### 6.3 Phase 6-B-04-07（GAS 側 dead code 化）着手前 TODO

- [ ] `workers-bridge.js` 末尾のテストスタブ削除（`_testCallWorkersInternal` / `_testCheckAllFlags` / `_flagOn_*` / `_flagOff_*` 系）
- [ ] GAS 版 `createLectureEntryAI_` / `editLectureEntryAI_` / `deleteLectureEntryAI_` / `bulkLectureOperationsAI_` / `multiCampusBulkOperationsAI_` / `createWeeklyLectureEntriesAI_` の 6 関数を削除
- [ ] `executeAiAction` 内の shim 経路を直接 `callWorkersInternal_` 呼出のみに整理（フラグ判定撤去）
- [ ] KV フラグ `prop:FF_AI_LECTURE_*` 6 個削除（Phase 6-B-04-08 と同タイミング）

---

## 7. 設計サマリー（参照）

### 7.1 shim 設計（features.js:1827-1838 周辺）

`create_lecture_entry` 分岐の非 weekly パスにフラグ判定を差込:

```js
if (shouldUseWorkersForAiAction_('FF_AI_LECTURE_CREATE')) {
  try {
    return callWorkersInternal_('createLectureEntryAI', _createArgs);
  } catch (e) {
    Logger.log('⚠ createLectureEntryAI Workers 経路失敗 → GAS fallback: ' + e);
  }
}
return createLectureEntryAI_.apply(null, _createArgs);
```

- フラグ OFF: GAS 経路（既存挙動）
- フラグ ON + Workers 成功: Workers 戻り値をそのまま返す
- フラグ ON + Workers throw: GAS フォールバック（HTTP レベル失敗のみ）
- フラグ ON + Workers `{success:false}`: そのまま返す（フォールバックしない）

### 7.2 関連ドキュメント

- `docs/phase-6b-04-investigation.md`（Phase 6-B-04 全体調査）
- `docs/phase-6b-04-00-message-fixtures.md`（F01-F21 戻り値メッセージ）
- `docs/phase-6b-04-00-internal-api-key-check.md`（INTERNAL_API_KEY）
- `docs/phase-6b-04-00-ff-naming.md`（KV フラグ命名規約）
- `docs/phase-6b-04-00-teacherid-parity.md`（teacherId 並列比較）
- `docs/phase-6b-04-00-weekly-boundary-cases.md`（C01-C12・6-B-04-06 用）

### 7.3 ロールバック手順（緊急時）

1. GAS エディタで `_flagOff_CREATE()` 実行
2. `_testCheckAllFlags()` で `FF_AI_LECTURE_CREATE = (unset)` 確認
3. 2 分待機（KV 伝播）
4. AI ウィジェットでテスト 1 件 → GAS 経路で成功確認
5. Cloudflare logs で Workers 呼出停止確認
6. 原因調査・修正後に再着手

所要時間: **3-5 分**
