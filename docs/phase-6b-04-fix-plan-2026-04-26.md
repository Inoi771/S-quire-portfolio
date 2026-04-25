# Phase 6-B-04 OCR 行重なり修正 計画書（2026-04-26）

> 作成日: 2026-04-26
> 目的: OCR 経路で複数エントリがカレンダー UI 上で「同じ行に重なって表示される」問題の修正計画
> 対象ブランチ: `claude/phase-6b-04-ocr-fix-2026-04-26`

---

## 1. 背景

### 1.1 全体方針（確定済み）

| 項目 | 方針 |
|------|------|
| 採用案 | **案 2**: OCR のみ改善・AI write 系は廃止 |
| 今回の修正範囲 | **OCR の「行重なり」問題のみ**（C 案 = A + B 併用） |
| AI write 系廃止 | **次フェーズで実施**（今回は対象外） |
| AI read 系（先生検索・自分のコマ等） | **維持** |

### 1.2 なぜ今回 AI 経路を触らないか

- AI write 系（`createLectureEntryAI_` 等 5 関数）は次フェーズで**完全削除**予定
- 同じ問題（`lectureId`/`campusCode` 欠落）が AI 経路にも存在するが、削除予定のコードに修正を入れるのは無駄
- 問題 1（`grade='13'`）・問題 3（`teacherId` 空）も AI 廃止で同時に解消する

---

## 2. 真の問題（再確認）

| 観点 | 内容 |
|------|------|
| 表面的問題 | OCR で複数エントリを保存すると、カレンダー UI 上で **全エントリが行 0（最上段）に重なって表示される** |
| 期待動作 | 手動 UI と同様、`computeOverlapGroups()` が動的に行（lane）を割り当てて視覚分離する |
| 根本原因 | OCR が作成するエントリオブジェクトに `lectureId` / `campusCode` が含まれていない → `renderLecEntries()` のフィルタ（`e.lectureId === currentLectureId`）で除外され、結果として `computeOverlapGroups()` への入力データが不完全になる |

### 2.1 データ構造の真実

- 講習エントリのスキーマには **`row` / `rowIndex` / `lane` フィールドは存在しない**
- 行（lane）はレンダリング時に `computeOverlapGroups()` (js-lectures.html:1607-1622) が**動的計算**する
- → 「保存時に行を採番する」案は不要・不可能

### 2.2 手動 UI が成立する理由

`createLecEntry()` (js-lectures.html:1854-1876) は新規エントリに **`lectureId` と `campusCode` を含めて** push する。
そのため `renderLecEntries()` のフィルタを通過し、`computeOverlapGroups()` で正しく行割当される。

---

## 3. 修正対象（C 案 = A + B 併用）

### 3.1 A 案: OCR 関連オブジェクトに `lectureId` / `campusCode` を追加

#### 修正箇所 1: OCR `creates` 構造（commit 1 で対応）

**ファイル**: `js-lectures.html`
**行**: 2978-2989
**スコープ**: `rows.forEach(function(tr) { ... })` 内（行 2946-3010）

**追加する値の取得元**:
| フィールド | 値 | 取得元 |
|----------|-----|-------|
| `lectureId` | `currentLectureId` | グローバル変数（js-lectures.html 全体で参照可能。例: 行 1859 の `createLecEntry` でも同じ値を使用） |
| `campusCode` | `campusCode` | 同 forEach 内のローカル変数（行 2954 で `tr.querySelector('[data-field="campusCode"]').value` から取得済み・null チェック済み） |

**Before** (js-lectures.html:2976-2989):
```javascript
if (op === 'create') {
  if (!date || !startTime) return;
  opsByCampus[campusCode].creates.push({
    id:            'ent_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    date:          date,
    startTime:     startTime,
    durationSlots: Math.max(1, Math.round(durationM / 10)),
    subject:       subject || '',
    grade:         grade || '',
    classLabel:    classLabel,
    teacherName:   rowTeacherName,
    teacherEmail:  rowTeacherEmail,
    teacherId:     rowTeacherId
  });
}
```

**After**:
```javascript
if (op === 'create') {
  if (!date || !startTime) return;
  opsByCampus[campusCode].creates.push({
    id:            'ent_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
    lectureId:     currentLectureId,
    campusCode:    campusCode,
    date:          date,
    startTime:     startTime,
    durationSlots: Math.max(1, Math.round(durationM / 10)),
    subject:       subject || '',
    grade:         grade || '',
    classLabel:    classLabel,
    teacherName:   rowTeacherName,
    teacherEmail:  rowTeacherEmail,
    teacherId:     rowTeacherId
  });
}
```

**diff サマリー**: +2 行（`lectureId` / `campusCode` フィールド追加のみ）

**手動 UI との整合**: `createLecEntry()` (js-lectures.html:1857-1870) の entry オブジェクトと同じフィールドセットになる。

---

#### 修正箇所 2: OCR existing transform（commit 2 で対応）

**ファイル**: `js-lectures.html`
**行**: 3036-3044
**スコープ**: `(function(campusCode, campusOps) { google.script.run.withSuccessHandler(function(res) { ... }) })(code, ops)` 内（IIFE・行 3035-3055）

**追加する値の取得元**:
| フィールド | 値 | 取得元 |
|----------|-----|-------|
| `lectureId` | `currentLectureId` | グローバル変数 |
| `campusCode` | `campusCode` | IIFE の引数（行 3035 で `(function(campusCode, campusOps) {` として渡される。元は `code` 変数 = `Object.keys(opsByCampus)` の各要素） |

**Before** (js-lectures.html:3036-3044):
```javascript
google.script.run
  .withSuccessHandler(function(res) {
    var existEnts = (res && res.entries) ? res.entries.map(function(e) {
      return { id: e.entryId || '', date: e.date || '', startTime: e.startTime || '',
               durationSlots: Number(e.durationSlots) || 9, subject: e.subject || '',
               grade: e.grade || '', teacherName: e.teacherName || '',
               teacherEmail: e.teacherEmail || '', classLabel: e.classLabel || null,
               teacherId: e.teacherId || '' };
    }) : [];
```

**After**:
```javascript
google.script.run
  .withSuccessHandler(function(res) {
    var existEnts = (res && res.entries) ? res.entries.map(function(e) {
      return { id: e.entryId || '', lectureId: currentLectureId, campusCode: campusCode,
               date: e.date || '', startTime: e.startTime || '',
               durationSlots: Number(e.durationSlots) || 9, subject: e.subject || '',
               grade: e.grade || '', teacherName: e.teacherName || '',
               teacherEmail: e.teacherEmail || '', classLabel: e.classLabel || null,
               teacherId: e.teacherId || '' };
    }) : [];
```

**diff サマリー**: 1 行目末尾に `lectureId: currentLectureId, campusCode: campusCode,` を挿入のみ

**整合性**: バックエンド版 `getLectureScheduleEntries` (features.js:2947-2962) は `lectureId` / `campusCode` を返す map 構造になっており、OCR 経路だけが省略していた。**バックエンド・Firebase クライアント・OCR の 3 経路すべてで同じスキーマに揃う**。

---

### 3.2 B 案: OCR 保存後にサーバー応答（result.entries）を採用

#### 修正箇所 3: OCR 保存後の in-memory 反映（commit 3 で対応）

**ファイル**: `js-lectures.html`
**行**: 3092-3128（`doOcrSave_()` 関数全体）
**目的**: `autoSaveCampus()` (js-lectures.html:1548-1565) と同じ「サーバー応答を真とする」パターンに揃える

**Before** (js-lectures.html:3092-3128 全文):
```javascript
function doOcrSave_() {
  var keys = Object.keys(mergedByCampus);
  var completed = 0;
  var failed = 0;
  keys.forEach(function(campusCode) {
    google.script.run
      .withSuccessHandler(function(result) {
        completed++;
        if (!result || !result.success) failed++;
        if (completed === keys.length) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'このまま保存';
          if (failed > 0) {
            showToast('一部の保存に失敗しました', 'error');
          } else {
            var msg = (lecOcrHasNullCampus ? '校舎未設定の行はスキップして、' : '') +
              keys.length + '校舎分を保存しました';
            if (ocrSkipped > 0) msg += '（' + ocrSkipped + '件の変更・削除対象が見つかりませんでした）';
            showToast(msg, 'success');
            keys.forEach(function(cc) { lectureEntries[cc] = mergedByCampus[cc]; });
            renderLecEntries(currentLectureCampus);
            closeLecOcrModalDirect_();
          }
        }
      })
      .withFailureHandler(function(err) {
        completed++;
        failed++;
        if (completed === keys.length) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'このまま保存';
          showToast('保存エラー: ' + (err.message || err), 'error');
        }
      })
      .saveLectureScheduleEntries(currentLectureId, campusCode, JSON.stringify(mergedByCampus[campusCode]));
  });
}
```

**After**:
```javascript
function doOcrSave_() {
  var keys = Object.keys(mergedByCampus);
  var completed = 0;
  var failed = 0;
  var savedByCampus = {};  // ← 追加: サーバー応答の蓄積
  keys.forEach(function(campusCode) {
    google.script.run
      .withSuccessHandler(function(result) {
        completed++;
        if (!result || !result.success) {
          failed++;
        } else if (Array.isArray(result.entries)) {
          savedByCampus[campusCode] = result.entries;  // ← 追加: 各campusの応答を保存
        }
        if (completed === keys.length) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'このまま保存';
          if (failed > 0) {
            showToast('一部の保存に失敗しました', 'error');
          } else {
            var msg = (lecOcrHasNullCampus ? '校舎未設定の行はスキップして、' : '') +
              keys.length + '校舎分を保存しました';
            if (ocrSkipped > 0) msg += '（' + ocrSkipped + '件の変更・削除対象が見つかりませんでした）';
            showToast(msg, 'success');
            keys.forEach(function(cc) {
              // サーバー応答があればそれを採用（lectureId/campusCode 付きで返る）。
              // 万一応答が空なら merge 結果に fallback（A 案で lectureId 補完済み）。
              lectureEntries[cc] = savedByCampus[cc] || mergedByCampus[cc];
            });
            renderLecEntries(currentLectureCampus);
            closeLecOcrModalDirect_();
          }
        }
      })
      .withFailureHandler(function(err) {
        completed++;
        failed++;
        if (completed === keys.length) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'このまま保存';
          showToast('保存エラー: ' + (err.message || err), 'error');
        }
      })
      .saveLectureScheduleEntries(currentLectureId, campusCode, JSON.stringify(mergedByCampus[campusCode]));
  });
}
```

**diff サマリー**:
- +1 行: `var savedByCampus = {};`
- 変更 +2 行: `if (!result || !result.success) failed++;` を if/else if 構造に展開し `savedByCampus[campusCode] = result.entries;` を追加
- 変更 +3 行: `lectureEntries[cc] = mergedByCampus[cc]` を `lectureEntries[cc] = savedByCampus[cc] || mergedByCampus[cc]` に変更（コメント 2 行込み）

**`autoSaveCampus()` との比較**:
| 項目 | `autoSaveCampus()` (1548-1565) | OCR 修正後 |
|------|-------------------------------|----------|
| サーバー応答の採用 | `if (Array.isArray(result.entries)) lectureEntries[campusCode] = result.entries;` | 同等（複数 campus の応答を蓄積後に一括反映） |
| fallback の有無 | なし（`Array.isArray(result.entries)` が false なら何もしない） | あり（`savedByCampus[cc] \|\| mergedByCampus[cc]`） |
| サーバー応答の検証 | `result && result.success` チェックあり | 同等 |

**fallback を残す理由**:
- 万が一 GAS 側の `saveLectureScheduleEntries` の応答形式が変わって `result.entries` が undefined になっても、A 案で補完した merge 結果が in-memory に残るため UI が空にならない（二重防衛）
- `autoSaveCampus()` は単一 campus のみだが、OCR は複数 campus 同時保存のため、一部 campus だけ応答が空になったケースに対処

**根拠**:
- `saveLectureScheduleEntries` (features.js:3045-3050) は応答に `savedEntries` 配列を含めており、各エントリに `id` / `lectureId` / `campusCode` がセット済み
- 手動 UI の `autoSaveCampus()` (js-lectures.html:1561) も `lectureEntries[campusCode] = result.entries;` でサーバー応答を採用
- 仮に A 案の `lectureId` 追加を忘れた場合でも、B 案で確実に正しいデータが in-memory に入る（二重防衛）

---

## 4. コミット計画

| # | コミット内容 | 対象 | 推定行数 |
|---|------------|------|---------|
| 1 | A 案-1: OCR `creates` に `lectureId`/`campusCode` 追加 | js-lectures.html:2978-2989 | +2 行 |
| 2 | A 案-2: OCR existing transform に `lectureId`/`campusCode` 追加 | js-lectures.html:3036-3044 | +2 フィールド |
| 3 | B 案: OCR 保存後にサーバー応答（`result.entries`）を採用 | js-lectures.html:3097-3127 付近 | +5〜10 行（変数追加・代入変更） |

**各コミット後に即 `git push origin claude/phase-6b-04-ocr-fix-2026-04-26` を実行**してリモート保存。

---

## 5. 修正対象外（明記）

以下は今回触らない:

| 項目 | 理由 |
|------|------|
| `features.js:3105-3117`（AI `createLectureEntryAI_`） | AI write 系は次フェーズで廃止予定 |
| `features.js:3146-3228`（AI `createWeeklyLectureEntriesAI_`） | 同上 |
| `features.js:3343-3431`（AI `bulkLectureOperationsAI_`） | 同上 |
| `js-ai-actions.html:190-258`（AI write 系の dispatch） | 同上 |
| `workers/src/functions/features.js`（Workers 側 5 関数） | 同上 |
| `computeOverlapGroups()` 自体の改修 | 仮説 B（id 衝突）が真因と確定するまで保留 |

---

## 6. 検証手順（各コミット後）

### 6.1 共通: 「lane 分離」の判定基準

`renderLecEntries()` (js-lectures.html:1629-1764) は同時刻の重なりを `computeOverlapGroups()` で検出して lane 分離する。具体的な視覚指標:

| 指標 | 成功時 | 失敗時 |
|-----|-------|-------|
| 同時刻エントリの **`top` 位置** | 各エントリで異なる（`ENTRY_PAD + g.index * ENTRY_H` の式で 0/48/96px... と変化） | 全エントリが同じ `top` 位置（`ENTRY_PAD = 4px`）に重なる |
| 行（`.lec-day-row`）の **高さ** | レーン数に応じて拡張（`ENTRY_H * (maxLanes + 1) + ENTRY_PAD * 2`） | `BASE_ROW_H = 56px`（基本高さ）のまま |
| DevTools で各エントリの `style.top` | 4px / 52px / 100px... と段階的 | 全部 4px |
| 視覚 | 縦に並んで全エントリが見える | カードが完全に重なり、最前面しか読めない |

**判定方法**: ブラウザ DevTools で同時刻の `.lec-entry` 要素を選択し、`style.top` の値を比較する。

---

### 6.2 commit 1 後（A 案-1 のみ）の検証

**前提**: GAS デプロイ完了後（プッシュから 1〜2 分）

**手順**:
1. 既存講習を 1 つ選択（例: 2026-summer）
2. 適当な校舎（例: 04）に手動 UI で 1 件エントリ作成（例: 14:00 数学・中1）→ 保存
3. 同じ校舎で **OCR モーダル**を開き、テキスト入力経由で 1 件追加（例: 14:00 英語・中2）→ 「このまま保存」
4. **保存直後**（リロード前）にカレンダーを観察

**成功基準**:
- ✅ 新規 OCR エントリが**保存直後にカレンダーに表示される**（リロード不要）
- ✅ 手動エントリと OCR エントリが**異なる lane**（縦位置が 48px ずれている）に配置される
- ✅ DevTools で 2 つの `.lec-entry` の `style.top` が `4px` と `52px` になっている

**失敗パターン**:
- ❌ OCR エントリが表示されない → A 案-1 が効いていない（フィルタで除外されている）
- ❌ 2 つのエントリが同じ `top` で重なる → `computeOverlapGroups` の問題（仮説 B が真因）

---

### 6.3 commit 2 後（A 案-2 追加）の検証

**前提**: cache miss する条件 = 当該講習×校舎の `lectureEntries[campusCode]` が `undefined` の状態（タブ切替後やページ初期表示直後など）

**手順**:
1. 講習選択直後（cache が空の状態）に **別校舎**を選択（例: 06）
2. その校舎では手動 UI でも何も操作せず、いきなり OCR モーダルを開く
3. テキスト入力で 2 件追加（例: 14:00 数学・中1 と 14:00 英語・中2）→ 「このまま保存」

**成功基準**:
- ✅ existing transform 経路（js-lectures.html:3036-3044）を通っても、保存直後に 2 件とも表示される
- ✅ 2 件が異なる lane に配置される（`top: 4px` と `top: 52px`）

**確認方法**: 保存処理のログを `console.log` で追って、`else { (function(campusCode, campusOps) { ... })` ブロック（cache miss path）が実行されたことを確認。あるいは事前に DevTools Console で `lectureEntries['06'] = undefined` を実行してから OCR を開くと確実に cache miss を再現できる。

---

### 6.4 commit 3 後（B 案追加）の検証

**手順**:
1. 同一時刻に 3 件の OCR エントリを一括作成（例: 14:00 数学・中1 / 14:00 英語・中2 / 14:00 国語・中3、すべて同校舎）
2. 「このまま保存」
3. 保存直後・リロード後の両方でカレンダーを観察

**成功基準**:
- ✅ 保存直後に 3 件すべて表示される
- ✅ 3 件すべてが**異なる lane**（`top: 4px` / `52px` / `100px`）に配置される
- ✅ 行の高さが `48 * 4 + 4 * 2 = 200px` 程度に拡張される
- ✅ リロード後も同じ表示（lane 順序は id sort 順なので変化しない）

**失敗パターン**:
- ❌ 3 件のうち一部だけ重なる → A/B 案のいずれかが部分的に効いていない
- ❌ リロード後に lane 順序が変わる → 想定内（id の localeCompare 順なので不変だが、保存タイミングで Date.now() が異なれば順序ありうる）

---

### 6.5 リグレッション確認（全 commit 後）

OCR 以外の経路を壊していないかを確認:

| 経路 | 確認内容 |
|------|---------|
| 手動 UI（`createLecEntry`） | クリック→新規作成→保存→表示が従来通り動作 |
| 手動 UI のドラッグ移動（`moveLecEntry`） | エントリ移動→ lane 再計算→正しく表示 |
| 削除（`deleteLecEntry` 系） | エントリ削除→残ったエントリが正しく表示 |
| AI 経路（read 系のみ） | 「私のコマを教えて」「○○先生は今日どこ?」が従来通り |
| 別校舎へのタブ切替 | `lectureEntries` の cache が校舎ごとに正しく管理される |
| ページ再ロード | `fbGetLectureScheduleEntries` 経由で全エントリが lectureId 付きで取得・表示される |

**失敗時の対応**: 該当 commit を `git revert` で個別に戻す（commit 1〜3 は独立しているため部分 revert 可能）。

---

## 7. ロールバック方針

- 各コミットは独立しているため、問題発生時は対象コミットを `git revert` で個別に戻す
- B 案の `result.entries` 採用で予期せぬ挙動があれば commit 3 のみ revert（A 案だけでも基本問題は解消するはず）

---

## 8. 次フェーズ予告（今回は実施しない）

| # | タスク | 概要 |
|---|--------|------|
| 1 | AI write 系の廃止 | `features.js` の `createLectureEntryAI_` / `editLectureEntryAI_` / `deleteLectureEntryAI_` / `createWeeklyLectureEntriesAI_` / `bulkLectureOperationsAI_` を削除 |
| 2 | AI dispatch 系の整理 | `js-ai-actions.html` の write 系アクション分岐を削除 |
| 3 | Workers 側 5 関数の削除 | `workers/src/functions/features.js` の対応関数を削除（dead endpoint 化を経て削除） |
| 4 | KV フラグ `FF_AI_LECTURE_*` 削除 | `kv-props.js` 経由でクリア |
| 5 | プロンプト整理 | features.js の Gemini プロンプト（write 系の指示）を削除 |
| 6 | docs 整理 | Phase 6-B-04 / 6-B-04-01 / 6-B-04-02 に「中止」記録を追記 |

---

## 9. 関連ドキュメント

- `docs/phase-6b-04-status-2026-04-25.md`（昨夜の中断時点スナップショット）
- `docs/phase-6b-04-investigation.md`（Phase 6-B-04 全体調査）
- `docs/phase-6b-04-01-plan.md`（Stage 1 実施記録・→ 中止予定）
- `docs/phase-6b-04-02-plan.md`（並行作成・→ 中止予定）

---

**本計画書の末尾**

承認後にコード修正に着手する。
