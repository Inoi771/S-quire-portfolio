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
