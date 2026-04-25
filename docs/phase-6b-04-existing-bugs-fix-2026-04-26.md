# Phase 6-B-04 既存バグ 2 件修正 計画書（2026-04-26）

> 作成日: 2026-04-26
> 目的: OCR 行重なり修正（commit 1〜3）の検証中に発見された 2 件の既存バグを修正する
> 対象ブランチ: `claude/phase-6b-04-ocr-fix-2026-04-26`（OCR 修正と同じブランチで継続）
> Phase A: 既存バグ修正（本計画）／Phase B: 「確認画面で 1 件しか表示されない」問題の切り分け（次フェーズ）

---

## 1. 背景

### 1.1 OCR 修正検証で発見した 2 つのエラー

Shinji さんによる commit 1〜3 の検証時、以下のエラーが発生:

| エラー | 発生箇所 |
|------|---------|
| `fitToScreen is not defined` | `openLecOcrModal` / `toggleLecOcrTextArea` / `renderLecOcrResult_` / `showAppConfirm_` の 4 箇所 |
| `res.entries.map is not a function` | `getLectureScheduleEntries` の successHandler 内（OCR cache miss 経路） |

### 1.2 調査結論: いずれも commit 1〜3 とは無関係の **既存バグ**

`git diff main..HEAD --stat` で確認の通り、今回の修正は以下のみ:
- `CLAUDE.md`（カウンター更新）
- `docs/phase-6b-04-fix-plan-2026-04-26.md`（計画書）
- `js-lectures.html`（OCR 関連 15 行）

`index.html` も `fitToScreen` 周辺も触っておらず、`res.entries.map` の外側構造（`(res && res.entries) ? res.entries.map(...)`）も変更していない。両バグとも Apr 22 のリポジトリ作成時から潜伏していた。

---

## 2. バグ 1: `fitToScreen is not defined`

### 2.1 既存バグである根拠

**`fitToScreen` は IIFE 内に閉じ込められている** (`index.html:28-92`):

```html
<script>
  (function () {
    function fitToScreen() {
      ...
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fitToScreen);
    } else {
      fitToScreen();
    }
    window.addEventListener('resize', fitToScreen);
  })();
</script>
```

- IIFE 内の `function fitToScreen` は IIFE スコープのみ
- `window.fitToScreen = ...` の代入はリポジトリ全体に**一切存在しない**（grep 検証済み）
- IIFE 自身が DOMContentLoaded / resize に登録するためだけに使われている

### 2.2 呼出側 5 箇所はすべてグローバル参照を期待

| ファイル | 行 | 関数 |
|---------|----|----|
| `js-core.html` | 980 | （汎用ダイアログ表示後） |
| `js-lectures.html` | 2354 | `openLecOcrModal` |
| `js-lectures.html` | 2367 | `showAppConfirm_` |
| `js-lectures.html` | 2537 | `toggleLecOcrTextArea` |
| `js-lectures.html` | 2897 | `renderLecOcrResult_` |

各呼出は **関数の末尾**にあり、`fitToScreen()` が throw しても**前段の主要処理（モーダル表示・テーブル生成等）は完了する**。そのため、これまで「気付かれていなかった」可能性がある。

### 2.3 修正方針: IIFE 内部から `window.fitToScreen` で公開

**方針**: IIFE のクロージャ構造を壊さず、最小変更で全呼出を救う

**修正対象ファイル**: `index.html`
**修正対象行**: `index.html:84` 付近（`}` 直後・自動実行ブロックの前）

**Before** (index.html:28-92):
```html
<script>
  // GAS環境でvirtualビューポート(980px)が使われている場合に
  // app-container を zoom でスケール補正してスマートフォン画面に合わせる
  // ※ transform と違い zoom はレイアウトに影響するためスクロールが維持される
  (function () {
    function fitToScreen() {
      var vw = window.innerWidth;
      var sw = window.screen.width;
      if (sw <= 0 || vw <= sw * 1.2) return;
      ...
      // ※ AIウィジェット（#aiWidgetModal）・ドロワーパネル（#drawerPanel）・
      //   スワイプゾーン（#drawerSwipeZone）は zoom なしの元サイズが適切なため除外している
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fitToScreen);
    } else {
      fitToScreen();
    }
    window.addEventListener('resize', fitToScreen);
  })();
</script>
```

**After**:
```html
<script>
  // GAS環境でvirtualビューポート(980px)が使われている場合に
  // app-container を zoom でスケール補正してスマートフォン画面に合わせる
  // ※ transform と違い zoom はレイアウトに影響するためスクロールが維持される
  (function () {
    function fitToScreen() {
      var vw = window.innerWidth;
      var sw = window.screen.width;
      if (sw <= 0 || vw <= sw * 1.2) return;
      ...
      // ※ AIウィジェット（#aiWidgetModal）・ドロワーパネル（#drawerPanel）・
      //   スワイプゾーン（#drawerSwipeZone）は zoom なしの元サイズが適切なため除外している
    }
    // 他の .html ファイル (js-core / js-lectures など) から呼べるように window に公開
    window.fitToScreen = fitToScreen;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fitToScreen);
    } else {
      fitToScreen();
    }
    window.addEventListener('resize', fitToScreen);
  })();
</script>
```

**diff サマリー**: +2 行（コメント 1 行 + `window.fitToScreen = fitToScreen;` 1 行）

**変更箇所の詳細**:
- IIFE のクロージャ構造（`(function () { ... })();`）はそのまま維持
- `function fitToScreen()` の定義もそのまま
- DOMContentLoaded / resize リスナー登録もそのまま
- **追加するのは `window.fitToScreen = fitToScreen;` の 1 行のみ**

### 2.4 影響範囲

- 5 箇所の `fitToScreen()` 呼出がすべて成功するようになる
- IIFE 内部の動作は不変（DOMContentLoaded / resize での呼出も継続）
- `window.fitToScreen` のグローバル名は他に衝突なし（リポジトリ全体で grep して確認済み）

---

## 3. バグ 2: `res.entries.map is not a function`

### 3.1 既存バグである根拠

**GAS `getLectureScheduleEntries` は Array を直接返す** (features.js:2941-2967):
```javascript
function getLectureScheduleEntries(lectureId, campusCode) {
  try {
    ...
    if (!doc) return [];
    return (doc.entries || []).map(function(e) {
      return { id: ..., ... };
    });
  } catch (error) {
    return [];
  }
}
```

→ 戻り値は**常に Array**（`{entries: [...]}` ではない）

**OCR cache miss 経路の受取り側** (js-lectures.html:3040):
```javascript
.withSuccessHandler(function(res) {
  var existEnts = (res && res.entries) ? res.entries.map(function(e) { ... }) : [];
```

`res` が Array の場合:
- `res.entries` は **`Array.prototype.entries`（イテレータ関数）が返ってくる** → truthy
- `res.entries.map(...)` は **関数オブジェクトに `.map()` を呼ぶ** ので TypeError

### 3.2 正しいパターンは既に同ファイル内にある

`js-lectures.html:1975-1981`（`refreshLecEntries` 内・`fbGetLectureScheduleEntries` を呼ぶ箇所）:
```javascript
fbGetLectureScheduleEntries(currentLectureId, campusCode)
  .then(function(result) {
    ...
    lectureEntries[campusCode] = Array.isArray(result) ? result : [];
```

→ `Array.isArray(result)` で正しく Array として扱っている。OCR cache miss 経路（line 3040）だけが間違ったパターンを使っていた。

### 3.3 commit 2 の影響範囲（無関係である根拠）

commit 2 は `.map` callback の **内部のみ**変更:

**main 状態（commit 2 適用前）**:
```javascript
var existEnts = (res && res.entries) ? res.entries.map(function(e) {
  return { id: e.entryId || '', date: e.date || '', startTime: e.startTime || '', ... };
}) : [];
```

**commit 2 適用後**:
```javascript
var existEnts = (res && res.entries) ? res.entries.map(function(e) {
  return { id: e.entryId || '', lectureId: currentLectureId, campusCode: campusCode,
           date: e.date || '', startTime: e.startTime || '', ... };
}) : [];
```

→ 外側の `(res && res.entries) ? res.entries.map(` は **両者で完全に同一**。bug は前から存在していた。

### 3.4 修正方針: `Array.isArray(res)` パターンに揃える

**修正対象ファイル**: `js-lectures.html`
**修正対象行**: `js-lectures.html:3040`

**Before** (js-lectures.html:3040-3047 / commit 2 適用後の現状):
```javascript
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

**After**:
```javascript
.withSuccessHandler(function(res) {
  var existEnts = Array.isArray(res) ? res.map(function(e) {
    return { id: e.entryId || '', lectureId: currentLectureId, campusCode: campusCode,
             date: e.date || '', startTime: e.startTime || '',
             durationSlots: Number(e.durationSlots) || 9, subject: e.subject || '',
             grade: e.grade || '', teacherName: e.teacherName || '',
             teacherEmail: e.teacherEmail || '', classLabel: e.classLabel || null,
             teacherId: e.teacherId || '' };
  }) : [];
```

**diff サマリー**:
- `(res && res.entries) ? res.entries.map(` → `Array.isArray(res) ? res.map(` に変更
- 行数の増減なし（1 行内で書換のみ）

**変更箇所の詳細**:
- 三項演算子の条件部を `(res && res.entries)` → `Array.isArray(res)` に変更
- map 呼出を `res.entries.map(` → `res.map(` に変更
- `.map` callback 内部 / `: [];` 部分はそのまま（commit 2 で追加した `lectureId` / `campusCode` 含む）

### 3.5 整合性

修正後の構造は `js-lectures.html:1981` の `fbGetLectureScheduleEntries` 経路と完全に同じパターン:
```javascript
// fbGetLectureScheduleEntries 経路 (1981)
lectureEntries[campusCode] = Array.isArray(result) ? result : [];

// OCR cache miss 経路 (3040 修正後)
var existEnts = Array.isArray(res) ? res.map(...) : [];
```

GAS / Firebase クライアント両方の API が Array を返すため、これで両者が同じ受け取り方を採用する。

---

## 4. コミット計画

| # | コミット内容 | 対象 | 推定行数 |
|---|------------|------|---------|
| 4 | bug 1 修正: `window.fitToScreen` 公開 | index.html:84 付近 | +2 行 |
| 5 | bug 2 修正: `Array.isArray(res)` パターン採用 | js-lectures.html:3040 | 1 行内書換 |

**各コミット後に即 `git push origin claude/phase-6b-04-ocr-fix-2026-04-26` を実行**してリモート保存。

---

## 5. 修正対象外（明記）

- `index.html` のその他の処理（IIFE 構造・DOMContentLoaded/resize 登録など）
- `js-lectures.html` の他の successHandler / fbGetLectureScheduleEntries 経路
- 「確認画面で 1 件しか表示されない」問題（**Phase B で別途切り分け**）
- AI write 系（次フェーズで廃止予定・対象外）

---

## 6. 検証手順

### 6.1 Phase A 完了後の検証

#### ステップ 1: fitToScreen エラー消失確認
1. ブラウザリロード（**Service Worker キャッシュも更新**: DevTools → Application → Service Workers → Unregister → リロード、または Ctrl+Shift+R）
2. 講習管理タブ → 「📥 日程を読み込む（AI）」ボタンクリック
3. **DevTools コンソールに `fitToScreen is not defined` が出ないこと** を確認

#### ステップ 2: res.entries.map エラー消失確認
1. **cache miss を意図的に作る**: DevTools コンソールで `lectureEntries['XX'] = undefined` を実行（XX は対象校舎コード）
2. 同校舎で OCR モーダルを開いてテキスト入力 → 1 件追加 → 「このまま保存」
3. **DevTools コンソールに `res.entries.map is not a function` が出ないこと** を確認

#### ステップ 3: OCR 行重なり修正の検証（前回失敗した分の再実施）
- 計画書 `docs/phase-6b-04-fix-plan-2026-04-26.md` の 6.4 を再実施
  - 同時刻 3 件の OCR 一括保存
  - 3 件すべてが別 lane に表示されるか
  - リロード後も表示が維持されるか

### 6.2 Phase A で観察すべき残存問題

`fitToScreen` / `res.entries.map` のエラーが消えた後でも以下の問題が残る可能性:
- **「確認画面で 1 件しか表示されない」問題** → 残れば Phase B で `console.log` を追加して切り分け

---

## 7. ロールバック方針

- 各コミット（4・5）は独立しているため、問題発生時は個別に `git revert` で戻す
- bug 1 修正（commit 4）でもし副作用があれば revert（既存挙動に戻る）
- bug 2 修正（commit 5）でもし副作用があれば revert（cache miss 時に再び TypeError になるが、cache hit 時は問題なし）

---

## 8. Phase B（次フェーズ）予告

「確認画面で 1 件しか表示されない」問題の切り分け:

1. **`console.log(res)` を `parseLectureScheduleFromText` の successHandler に追加**
   - js-lectures.html:2568 付近（推定）
2. AI 解析結果が 1 件か複数かを確認
3. **複数返っているなら**: `renderLecOcrResult_()` の中で描画ループのバグ → 修正
4. **1 件しか返っていないなら**: AI プロンプト or テキスト形式の問題 → プロンプト調整 or 既存問題として記録

---

## 9. 関連ドキュメント

- `docs/phase-6b-04-fix-plan-2026-04-26.md`（OCR 行重なり修正・Phase A の前段）
- `docs/phase-6b-04-status-2026-04-25.md`（昨日の中断時点スナップショット）
- `docs/phase-6b-04-investigation.md`（Phase 6-B-04 全体調査）

---

**本計画書の末尾**

承認後にコード修正に着手する。
