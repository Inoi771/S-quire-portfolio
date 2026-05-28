CODING.mdです。

markdown# CODING.md — コーディング規約

> このファイルは Claude が必要時に自動で読み込む。
> 新機能実装・関数追加時は必ずこのファイルを参照すること。

---

## JSDoc の書き方
```javascript
/**
 * 関数の説明（日本語1〜2文）
 * @aiCallable           ← Admin不要のWeb API関数にのみ付与
 * @param {型} 引数名 説明
 * @return {型} 説明
 */
function myFunction(arg) {
```

- 説明・@param・@return はすべて日本語
- `@aiCallable` は `isAdmin()` チェックがない Web API 関数にのみ付与

---

## エラーハンドリング
```javascript
function myFunction(arg) {
  try {
    Logger.log('✓ myFunction: 完了');
    return { success: true, message: '○○しました' };
  } catch (error) {
    Logger.log('❌ myFunctionエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}
```

**Logger.log 絵文字ルール：** `✓` 正常完了 ／ `❌` エラー ／ `⚠` 警告

---

## 戻り値の形式
```javascript
// 読み取り専用
return [];      // 配列
return null;    // 単一オブジェクトで見つからない場合

// 書き込み・更新・削除
return { success: true, message: '○○しました' };
return { success: true, message: '○○しました', studentId: studentId };
return { success: false, error: '理由を日本語で' };

// Admin権限チェック（Admin専用関数の冒頭）
if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
```

---

## 命名規則

| 対象 | 形式 | 例 |
|------|------|-----|
| 関数名 | camelCase | `getScheduleData` |
| グローバル定数 | UPPER_SNAKE_CASE | `PROP_KEYS` |
| ローカル変数 | camelCase | `yearFolder` |
| エラー変数 | `error` / `e`（ネスト内） | `catch (error)` |

---

## google.script.run のパターン
```javascript
google.script.run
  .withSuccessHandler(function(result) { /* 成功処理 */ })
  .withFailureHandler(function(err) {
    console.error('エラー:', err);
  })
  .backendFunctionName(arg1, arg2);
```

---

## 校舎ドロップダウンの作り方（必須）

配属校舎を先頭に表示するため、必ず `buildCampusOptions()` を使うこと。直接 `forEach` でオプション生成することは禁止。
```javascript
// ✅ 正しい
var opts = buildCampusOptions(result.campuses);
document.getElementById('my-campus-select').innerHTML = opts;

// ❌ 禁止
result.campuses.forEach(function(c) {
  html += '' + c.name + '';
});
```

`displayProfileInfo()` 内で `preferredCampuses` をセットした後は必ず `rebuildCampusDropdowns()` を呼ぶこと。

---

## PDF出力パターン（html2canvas + jsPDF）
```javascript
// 1. 印刷モードはユーザー操作内（同期的に）ウィンドウを開く
var printWindow = null;
if (mode === 'print') {
  printWindow = window.open('', '_blank'); // 必ず非同期処理の前に呼ぶ
}

// 2. オフスクリーンコンテナにHTMLを注入
var container = document.createElement('div');
container.style.cssText = 'position:fixed;left:-9999px;top:0;width:820px;background:white;';
document.body.appendChild(container);
container.innerHTML = buildDocHTML(...);

// 3. Google Fonts使用時は fonts.ready を待つ
document.fonts.ready.then(function() {
  html2canvas(container, { scale: 2, backgroundColor: '#ffffff', windowWidth: 860 }).then(function(canvas) {
    document.body.removeChild(container);
    // 4. download or print で出力
  });
});
```

**注意：** `window.open()` は必ず同期的（非同期処理の前）に呼ぶこと。`finalizePdf()`は料金表専用。他機能では専用のfinalize関数を作ること。

---

## デバッグログ規約（GAS iframe環境）
```javascript
var FEATURE_DEBUG = true;
function featureDebug_(label, msg) {
  if (!FEATURE_DEBUG) return;
  var text = '[' + label + '] ' + msg;
  console.log(text);
  if (typeof showToast === 'function') showToast(text, 'success');
}
```

- フラグ命名: `{機能名}_DEBUG`、関数命名: `{機能名}Debug_`
- デバッグ終了後はフラグを `false` に変更（コードは残してよい）
- 現在定義済み: `FLYER_DEBUG` / `flyerDebug_()` （`js-lectures-flyer.html`）

---

## ファイルサイズ制限（2,000行ルール）

編集完了後に `wc -l` で確認し、2,000行超の場合はセクション境界で分割すること。
HTML分割は `<script>` で包み `index.html` に `<?!= include() ?>` を追加。
分割した場合は「○○を分割しました」と報告する。

---

## 新しいタブを追加するとき

1. `.tab-button` と `.tab-content` div を追加
2. `switchTab()` に `else if` ブロックを追加
3. Admin専用なら `checkAdminTabVisibility()` に追加
4. CLAUDE.md セクション8のタブ一覧を更新

---

## code.js セクション配置ルール

| 機能の性質 | セクション |
|-----------|----------|
| 認証・Admin判定 | S2 |
| スケジュール | S4 |
| 設定の取得・保存 | S5 |
| プロフィール | S6 |
| マスター設定 | S7 |
| 生徒・成績データ | S8 |
| Gemini AI | S9 |
| Admin専用操作 | S10 |
| フォルダ・シート初期化 | S11 |
| ユーティリティ | S12 |

新セクションはS12の直後に追加。区切り形式：
```javascript
// ========================================
// 【セクション13】○○機能
// ========================================
```

---

## allowedUsers 自動登録ルール

ユーザーにアプリアクセスを付与する新しい関数を追加する場合、以下を必ず含めること：
- `firestoreSet_('allowedUsers', email.toLowerCase(), { email: email.toLowerCase(), addedAt: new Date().toISOString() })`

ユーザーのアクセスを削除する関数では：
- `firestoreDelete_('allowedUsers', email)`

`firebase-init.html` で Firestore SDK のプロトタイプ（`Query.prototype.get` 等）を書き換えてはいけない（`enablePersistence` との干渉でエラーが発生する）。

---

## フロントエンド実装の基本原則（クロスブラウザ・エンコード）

新規HTML/CSS/JSを実装するとき、また既存ページを修正するときは、以下を必ず守ること。
利用者は「全員がスマートフォンで操作」かつ「ITに不慣れなスタッフが多い」ため、
端末・ブラウザによって表示が壊れることは避けなければならない。

### 1. 文字エンコード（必須）

| 項目 | ルール |
|------|--------|
| ファイル本体の保存形式 | **UTF-8（BOMなし）** |
| HTML head での宣言 | `<meta charset="UTF-8">` を必ず最初に書く |
| 言語属性 | `<html lang="ja">` を指定 |

> 文字化けの主因は「ファイル自体は Shift-JIS なのに meta は UTF-8」のような不一致。
> 新規HTMLは必ず UTF-8 で保存する。`file -i` コマンドで確認できる。

### 2. モバイル対応（必須）

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` を必ず指定する
- すべての機能をスマートフォン1つで操作可能にする
- タップターゲットは最低 **44×44px** を確保（iOS Human Interface Guideline 準拠）
- ボタン・リンク・チェックボックスなど操作要素は十分な間隔をあける

### 3. ブラウザ対応範囲

| ブラウザ | バージョン |
|---------|----------|
| iOS Safari | **15.4 以上**（2022年3月以降） |
| Android Chrome | 最新版 |
| デスクトップ Chrome / Edge / Firefox / Safari | 最新版 |

> iOS 15.4 未満（iPhone 6 以前など）はサポート対象外。

### 4. 日本語フォント指定

```css
font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif;
```

- Hiragino Sans … iOS / macOS の標準
- Yu Gothic … Windows の標準
- sans-serif … 最終フォールバック

### 5. 注意が必要なCSS機能

| 機能 | 対応状況 | 注意 |
|------|---------|------|
| `aspect-ratio` | iOS 15.4+ | 古い iOS では効かない。必要なら `padding-top: 100%` フォールバックを併用 |
| `inset` | 主要ブラウザ対応済み | 通常はそのまま使ってよい |
| CSS Grid | iOS 10.3+ で対応 | そのまま使ってよい |
| `clamp()` / `min()` / `max()` | iOS 13.1+ | そのまま使ってよい |

### 6. iframe で配信する公開ページの注意

公開用埋め込みページ（`static/embed/` 配下など）を作るときは特に：

- 認証なしで動作する自己完結型として作る
- `pdf.save()` などの**自動ダウンロード系APIは iframe 内では動作しないことがある**ため使わない
- 必要な場合は「新しいタブで開く」方式（`<a target="_blank">` + Blob URL）にする
- ホームページ側の `<iframe>` 高さは固定px指定が無難（端末別の自動調整は postMessage が必要）

### 7. 実装後のチェックリスト

新規ページ・大幅修正後は以下を確認すること：

- [ ] `file -i ファイル名` で UTF-8 と表示される
- [ ] `<meta charset="UTF-8">` と `<html lang="ja">` を宣言した
- [ ] viewport meta を入れた
- [ ] iPhone Safari と Android Chrome で実機確認した
- [ ] スマホ・タブレット・PC のレイアウトが崩れない
- [ ] タップ操作が44px以上のターゲットになっている

---

## コード品質の最低ライン（実験ルール）

「動けばよい」ではなく、後から読める・直せるコードを書く。
オーナーはコードを読めないため、これらは Claude Code が能動的に守る必要がある。

### 関数の長さ

| 言語 | 目安 | 上限の警告ライン |
|---|---|---|
| JavaScript | 50行以内 | 150行を超えたら分割を提案 |
| Google Apps Script | 50行以内 | 150行を超えたら分割を提案 |

1つの関数は1つのことだけをする。長くなったら、内部処理を別関数に切り出す。既存の「ファイルサイズ制限（2,000行ルール）」と組み合わせ、ファイルだけでなく関数単位でも肥大化を防ぐ。

### エラーの握りつぶし禁止

既存の「エラーハンドリング」セクションのテンプレートに加えて、内部で呼び出す処理（LockService・JSON.parse・Drive操作など）の try-catch では必ず以下のいずれかを行う:

1. ログに出力する（`Logger.log('❌ ...: ' + error)` など）
2. 上位の戻り値に反映する（`return { success: false, error: ... }`）
3. 上位に再スローする（`throw error`）

**禁止例:**

```javascript
try { something(); } catch (e) {}                    // ❌ 完全に無視
try { something(); } catch (e) { /* 非致命的 */ }    // ❌ コメントだけで無視
```

**最低限の許容例:**

```javascript
try {
  something();
} catch (e) {
  Logger.log('⚠ something failed (非致命的): ' + e);
}
```

「ここは握りつぶしてよい」と判断する場合は、その理由をコメントに具体的に書く（例: `// ユーザーがログアウト済みの場合は無視してよい`）。

参考: BUGS.md パターン2 で `safeJsonParse_()` の使用が必須化されているのも同じ思想（握りつぶさず、デフォルト値で復旧する）。

### グローバル変数を増やさない

**原則: グローバル変数（どのファイルからでも書き換えられる変数）は最小限に留める。**

GAS環境では全 `.js` ファイルが同じグローバル名前空間を共有するため（CLAUDE.md セクション2「バックエンド設計」参照）、変数を無造作に増やすと「どの関数がどの変数を変えているか」追跡不能になる。

#### ルール

| ルール | 内容 |
|---|---|
| 用途別に集約 | グローバル状態は用途別にオブジェクトでまとめる（認証関連は1つ、UI状態は1つ、など） |
| 新規追加時は必ず確認 | グローバル変数を新たに追加する場合、Claude Code は実装前にオーナーに確認する |
| 目安は20個まで | グローバル変数（またはオブジェクトのトップレベルキー）が20個を超えたら、設計を見直すサインとして報告する |

#### 良い例（フロント `js-core.html` の場合）

```javascript
// 用途別に集約
var AppState = {
  user: { id: null, email: null, role: null },
  ui:   { currentTab: 'schedule', isLoading: false },
  data: { students: [], schedule: [] },
};
```

#### 悪い例

```javascript
// バラバラに散在
var currentUserId = null;
var currentUserEmail = null;
var currentUserRole = null;
var currentTab = 'schedule';
var isLoading = false;
var students = [];
// ... 30個続く
```

「とりあえずグローバルに置く」は禁止。スコープを限定できるならローカル変数・関数引数で済ませる。
