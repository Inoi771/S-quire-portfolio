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
**現在のコード**:
```javascript
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
```

**修正後**:
```javascript
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
```

**追加行**: 2 行（`lectureId` / `campusCode`）

#### 修正箇所 2: OCR existing transform（commit 2 で対応）

**ファイル**: `js-lectures.html`
**行**: 3036-3044
**現在のコード**:
```javascript
var existEnts = (res && res.entries) ? res.entries.map(function(e) {
  return { id: e.entryId || '', date: e.date || '', startTime: e.startTime || '',
           durationSlots: Number(e.durationSlots) || 9, subject: e.subject || '',
           grade: e.grade || '', teacherName: e.teacherName || '',
           teacherEmail: e.teacherEmail || '', classLabel: e.classLabel || null,
           teacherId: e.teacherId || '' };
}) : [];
```

**修正後**:
```javascript
var existEnts = (res && res.entries) ? res.entries.map(function(e) {
  return { id: e.entryId || '', lectureId: currentLectureId, campusCode: campusCode,
           date: e.date || '', startTime: e.startTime || '',
           durationSlots: Number(e.durationSlots) || 9, subject: e.subject || '',
           grade: e.grade || '', teacherName: e.teacherName || '',
           teacherEmail: e.teacherEmail || '', classLabel: e.classLabel || null,
           teacherId: e.teacherId || '' };
}) : [];
```

**追加行**: 同行に `lectureId` / `campusCode` を 2 フィールド追加

---

### 3.2 B 案: OCR 保存後にサーバー応答（result.entries）を採用

#### 修正箇所 3: OCR 保存後の in-memory 反映（commit 3 で対応）

**ファイル**: `js-lectures.html`
**行**: 3097-3127 付近
**現在のコード（doOcrSave_ 内）**:
```javascript
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
        var msg = ...;
        showToast(msg, 'success');
        keys.forEach(function(cc) { lectureEntries[cc] = mergedByCampus[cc]; });  // ← ここ
        renderLecEntries(currentLectureCampus);
        closeLecOcrModalDirect_();
      }
    }
  })
  ...
  .saveLectureScheduleEntries(currentLectureId, campusCode, JSON.stringify(mergedByCampus[campusCode]));
```

**修正方針**:
- 各 campus の保存応答 `result.entries`（lectureId / campusCode 付きで返ってくる）を campus 別に蓄積
- 全保存完了後、`lectureEntries[cc] = savedByCampus[cc]` で**サーバー応答を採用**
- ローカル merge 結果（`mergedByCampus`）を捨て、サーバー応答のみを真とする

**修正後の擬似コード**:
```javascript
var savedByCampus = {};

keys.forEach(function(campusCode) {
  google.script.run
    .withSuccessHandler(function(result) {
      completed++;
      if (!result || !result.success) {
        failed++;
      } else if (Array.isArray(result.entries)) {
        savedByCampus[campusCode] = result.entries;  // ← サーバー応答を蓄積
      }
      if (completed === keys.length) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'このまま保存';
        if (failed > 0) {
          showToast('一部の保存に失敗しました', 'error');
        } else {
          var msg = ...;
          showToast(msg, 'success');
          keys.forEach(function(cc) {
            // サーバー応答があればそれを採用、なければ merge 結果に fallback
            lectureEntries[cc] = savedByCampus[cc] || mergedByCampus[cc];
          });
          renderLecEntries(currentLectureCampus);
          closeLecOcrModalDirect_();
        }
      }
    })
    ...
    .saveLectureScheduleEntries(currentLectureId, campusCode, JSON.stringify(mergedByCampus[campusCode]));
});
```

**根拠**:
- `saveLectureScheduleEntries` (features.js:3045-3050) は応答に `savedEntries` 配列を含めており、各エントリに `id` / `lectureId` / `campusCode` がセット済み
- 手動 UI の `autoSaveCampus()` (js-lectures.html:1561) も `lectureEntries[campusCode] = result.entries;` でサーバー応答を採用しており、**OCR を同じパターンに揃える**
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

### 6.1 commit 1 後（A 案-1 のみ）

- OCR で 1 件のエントリを既存エントリのある校舎に保存
- 保存直後に新規エントリがカレンダーに表示されること（リロード不要）
- 既存エントリと同時刻なら別 lane に表示されること

### 6.2 commit 2 後（A 案-2 追加）

- 別校舎（cache miss する campus）で OCR 保存
- existing transform 経路を通っても新規エントリが表示されること

### 6.3 commit 3 後（B 案追加）

- 同一時刻に 3 件の OCR エントリを一括保存
- 3 件すべてが**異なる lane に表示される**こと
- リロードしても表示が崩れないこと

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
