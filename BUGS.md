# S-quire バグブラックリスト

> このファイルは CLAUDE.md から分離したバグ防止リファレンスです。
> 新機能を実装する前に Claude が必ず参照します。
> 新しいバグパターンを発見したら必ずここに追記すること。

---

## 14. よくある間違いのブラックリスト（絶対やってはいけないパターン集）

> このセクションは過去に実際に発生したバグや設計上の失敗パターンをまとめたもの。
> 新機能を実装する前に必ず確認すること。同じミスが繰り返されないよう、
> 新たなバグを修正したときは必ずここに追記すること。

---

### ❌ パターン1: Sheets の先頭ゼロ消失を考慮しない（最重要・繰り返し発生）

**発生した問題**: `setValues()` / `appendRow()` で `"04"` などの数字文字列を書き込むと、
Google Sheets が自動的に数値 `4` に変換して保存する。その後 `getValues()` で読み戻すと
`"04" !== "4"` となり、校舎コード・生徒IDの比較が全て失敗した。

**やってはいけないコード:**
```javascript
// ❌ "04" !== "4" になり比較が失敗する
String(rows[i][2]) === String(campusCode)

// ❌ "0123456789" → 123456789 になり生徒が見つからなくなる
var sid = String(studentId);
if (rows[i][0] === sid) { ... }
```

**正しいコード:**
```javascript
// ✅ parseInt で正規化（校舎コードの比較）
parseInt(rows[i][2], 10) === parseInt(campusCode, 10)

// ✅ padStart で正規化（生徒ID 10桁）
var sid = String(studentId).trim();
if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
var rowId = String(rows[i][0] || '').trim();
if (/^\d+$/.test(rowId) && rowId.length < 10) rowId = rowId.padStart(10, '0');
if (rowId === sid) { ... }

// ✅ 書き込み後に setNumberFormat('@') でテキスト形式を強制
sheet.getRange('A:A').setNumberFormat('@');  // 生徒ID列
sheet.getRange('B:B').setNumberFormat('@');  // 校舎CD列
```

**チェックポイント**: スプレッドシートに生徒ID・校舎コード・学年コード（先頭ゼロを含む数字文字列）を
書き込んで後で比較する処理を実装したら、必ず `padStart` / `parseInt` 正規化を入れること。
実装後はセクション9「修正済み箇所」リストに追記すること。

---

### ❌ パターン2: JSON.parse を try/catch なしで呼ぶ（アプリ全体クラッシュ）

**発生した問題**: スクリプトプロパティに保存された JSON が何らかの理由で破損・切り詰められた際に
`JSON.parse()` が例外を投げ、バックエンド関数全体がクラッシュしてアプリが応答しなくなった。
LINE_USER_MAPPING・TEACHER_ID_MAP など、複数箇所で同じ問題が繰り返し発生した。

**やってはいけないコード:**
```javascript
// ❌ パース失敗でアプリ全体がクラッシュする
var teacherMap = JSON.parse(getProperty(PROP_KEYS.TEACHER_ID_MAP) || '{}');
var lineMapping = JSON.parse(getProperty(PROP_KEYS.LINE_USER_MAPPING) || '{}');
```

**正しいコード:**
```javascript
// ✅ safeJsonParse_() ヘルパーを使う（code.js に実装済み）
var teacherMap = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
var lineMapping = safeJsonParse_(getProperty(PROP_KEYS.LINE_USER_MAPPING), {});

// ✅ 配列の場合のデフォルト値
var entries = safeJsonParse_(getProperty(PROP_KEYS.SOME_LIST), []);
```

**チェックポイント**: スクリプトプロパティやシートから読んだ値を JSON としてパースする箇所は
すべて `safeJsonParse_()` に置き換えること。バックエンドで `JSON.parse()` を直接呼ぶことは禁止。

---

### ❌ パターン3: LockService なしで共有リソースを更新する（データ消失）

**発生した問題**: 複数ユーザーが同時にアプリを操作した際、TEACHER_ID_MAP の更新が競合し
片方の書き込みが上書き消滅した。講習エントリの全置換処理でも同様の問題が発生する可能性があった。

**やってはいけないコード:**
```javascript
// ❌ ロックなしで read-modify-write する（競合状態が発生する）
var map = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
map[newId] = { email: email, name: name };
setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(map));
```

**正しいコード:**
```javascript
// ✅ LockService で排他制御する
var lock = LockService.getScriptLock();
try {
  lock.waitLock(10000);  // 最大10秒待機
} catch (e) {
  throw new Error('ロック取得タイムアウト。時間をおいて再試行してください。');
}
try {
  var map = safeJsonParse_(getProperty(PROP_KEYS.TEACHER_ID_MAP), {});
  map[newId] = { email: email, name: name };
  setProperty(PROP_KEYS.TEACHER_ID_MAP, JSON.stringify(map));
} finally {
  lock.releaseLock();  // 必ず解放（例外発生時も）
}
```

**チェックポイント**: 複数ユーザーが同時に呼び出す可能性がある関数で、スクリプトプロパティへの
read-modify-write や、シートの全行削除→追加（全置換）を行う場合は LockService を使うこと。

---

### ❌ パターン4: innerHTML にユーザー入力を直接埋め込む（XSS脆弱性）

**発生した問題**: 管理タブでスクリプトプロパティの値をそのまま `innerHTML` に埋め込んでいた箇所で、
`<script>alert(1)</script>` 等を入力すると JavaScript が実行できる状態だった。

**やってはいけないコード:**
```javascript
// ❌ 危険：スクリプトが実行される可能性がある
html += '<li>' + testName + '</li>';
html += '<span>' + campusName + '</span>';
html += '<td>' + propertyValue + '</td>';
```

**正しいコード:**
```javascript
// ✅ escapeHtml_() ヘルパーで無害化する（admin.js に実装済み）
html += '<li>' + escapeHtml_(testName) + '</li>';
html += '<span>' + escapeHtml_(campusName) + '</span>';
html += '<td>' + escapeHtml_(propertyValue) + '</td>';
```

**チェックポイント**: スクリプトプロパティ・スプレッドシートから読んだ値・ユーザー入力値を
`innerHTML` で画面に表示するときは必ず `escapeHtml_()` を通すこと。特に管理タブ内の一覧表示に注意。

---

### ❌ パターン5: `parseInt(str) || defaultValue` で 0 が消える

**発生した問題**: 偏差値・コマ数などが `0` の場合に、`parseInt('0', 10) || null` が
`0 || null → null` となり、有効な値 `0` がデフォルト値に上書きされる静かなバグが発生した。
`grades.js` の偏差値パース処理で実際に発見された。

**やってはいけないコード:**
```javascript
// ❌ 0 が null に化ける（偏差値・コマ数・回数などで問題になる）
var deviation = parseInt(deviationStr, 10) || null;
var duration = parseInt(row.duration, 10) || 1;  // "0" が "1" になる
```

**正しいコード:**
```javascript
// ✅ isNaN() で明示的にチェックする
var deviation = deviationStr !== '' ? parseInt(deviationStr, 10) : null;
if (deviation !== null && isNaN(deviation)) deviation = null;

// ✅ 数値確定が必要な場合
var duration = parseInt(row.duration, 10);
if (isNaN(duration)) duration = 1;  // NaN の場合のみデフォルト値
```

**チェックポイント**: `parseInt(...) || デフォルト値` パターンは、`0` が有効値である可能性がある
あらゆる箇所で使ってはいけない。コマ数・回数・偏差値・得点・金額は全て `0` が有効値。

---

### ❌ パターン6: Gemini API で `responseMimeType` を設定しない（JSONパースエラー）

**発生した問題**: `generationConfig` に `responseMimeType: 'application/json'` を設定しないと、
Gemini が ` ```json\n{...}\n``` ` というマークダウン形式で返してくることがある。
これを `JSON.parse()` すると必ず失敗する。複数の Gemini 呼び出し箇所で同じ問題が発生した。

**やってはいけないコード:**
```javascript
// ❌ responseMimeType 未設定 → マークダウン返却 → JSON.parse 失敗
generationConfig: {
  thinkingConfig: { thinkingBudget: 0 }
}
```

**正しいコード:**
```javascript
// ✅ 必ず responseMimeType を設定する
generationConfig: {
  responseMimeType: 'application/json',  // ← 必須（マークダウン防止）
  thinkingConfig: { thinkingBudget: 0 }
}

// ✅ thinking パーツの除外処理も必ず入れる（安全網）
var parts = (result.candidates[0].content.parts || []);
var textPart = parts.filter(function(p) { return !p.thought; }).pop();
var rawText = textPart ? (textPart.text || '') : '';
```

**チェックポイント**: JSON を期待して Gemini API を呼ぶ際は必ず `responseMimeType: 'application/json'`
を設定すること。thinking パーツの除外処理もセットで実装すること。

---

### ❌ パターン7: Gemini API を1回の操作で複数回呼ぶ（レート制限超過）

**発生した問題**: 意図判定と回答生成を別々の API コールで実装していた際に、RPM 制限（15回/分）を
すぐ超過して 429 エラーが頻発した。バッチ処理でも待機なしで連続呼び出しして同様の問題が発生した。

**やってはいけないコード:**
```javascript
// ❌ 意図判定と回答生成を2回に分けて呼ぶ（RPM を2倍消費）
var intent = callGemini(intentPrompt);    // 1回目
var answer = callGemini(answerPrompt);    // 2回目

// ❌ バッチ処理で待機なし（429 エラーが連発する）
for (var i = 0; i < students.length; i++) {
  callGemini(prompt);
}
```

**正しいコード:**
```javascript
// ✅ 意図判定と回答生成を1回のプロンプトに統合する
var result = callGemini('意図を判定し、その意図に応じた回答をそのままJSONで返してください。...');

// ✅ バッチ処理では必ず待機を入れる（4500ms = 15回/分の余裕確保）
for (var bi = 0; bi < students.length; bi += BATCH_SIZE) {
  // ... バッチ処理 ...
  if (bi + BATCH_SIZE < students.length) {
    Utilities.sleep(4500);
  }
}

// ✅ 429 エラー時は 30 秒待機してリトライ（fetchGeminiWithRetry_() を使う）
var res = fetchGeminiWithRetry_(url, options);
```

**チェックポイント**: 「1ユーザー操作 = 1 API コール」を原則とする。バッチ処理では
`Utilities.sleep(4500)` を、単発呼び出しでは `fetchGeminiWithRetry_()` を使うこと。

---

### ❌ パターン8: `window.open()` を非同期処理の中で呼ぶ（ポップアップブロック）

**発生した問題**: PDF 出力時に `html2canvas(...).then(...)` のコールバック内で `window.open()` を
呼んでいたため、ポップアップブロッカーに引っかかり印刷ウィンドウが開かなかった。

**やってはいけないコード:**
```javascript
// ❌ 非同期処理の中で window.open() を呼ぶ（ポップアップブロック）
html2canvas(container, { scale: 2 }).then(function(canvas) {
  var printWindow = window.open('', '_blank');  // ← ブロックされる
  printWindow.document.write('...');
});
```

**正しいコード:**
```javascript
// ✅ ボタンクリックハンドラーの先頭（非同期処理の前）で同期的に呼ぶ
function generatePDF(mode) {
  var printWindow = null;
  if (mode === 'print') {
    printWindow = window.open('', '_blank');  // ← ユーザー操作直後・非同期処理の前に呼ぶ
    if (printWindow) { printWindow.document.write('⏳ 生成中...'); }
  }
  // その後で非同期処理
  html2canvas(container, { scale: 2 }).then(function(canvas) {
    finalizePdf(mode, [canvas], printWindow, restoreStyles);
  });
}
```

**チェックポイント**: `window.open()` はユーザーのクリックイベントと同じコールスタック内（同期処理中）に
呼ぶこと。`setTimeout()` / `Promise.then()` / `google.script.run` のコールバック内から呼ぶことは禁止。

---

### ❌ パターン9: `position: fixed` 要素を `fitToScreen()` に登録しない（モバイルレイアウト崩れ）

**発生した問題**: 新しいモーダルやオーバーレイを追加した際に `fitToScreen()` への追記を忘れ、
スマートフォンで位置・サイズがずれて操作不能になった。PC では問題なく見えるため発見が遅れた。

**やってはいけないこと:**
- `position: fixed` の要素を新たに追加して `fitToScreen()` の補正処理を追加しない
- DESIGN.md の「現在対応済みの要素」一覧を更新しない

**正しい対応（3ステップ必須）:**
```javascript
// ✅ ステップ1: fitToScreen() に補正処理を追加する
// 全画面オーバーレイの場合
var el = document.getElementById('myNewOverlay');
if (el) { el.style.zoom = ratio; el.style.width = (100/ratio)+'vw'; el.style.height = (100/ratio)+'vh'; }

// センタリングモーダルの場合（top:50%; left:50%; transform:translate(-50%,-50%)）
var modal = document.getElementById('myNewModal');
if (modal) { modal.style.zoom = ratio; modal.style.width = (90/ratio)+'vw'; modal.style.maxWidth = 'none'; }

// ✅ ステップ2: CLAUDE.md セクション9「対応済みの要素一覧」に要素IDとパターンを追記する
// ✅ ステップ3: スマートフォン実機または DevTools モバイルエミュレーターで動作確認する
```

**チェックポイント**: `position: fixed` を持つ要素を追加したら、この3ステップを必ず実行すること。
PC で確認しても問題は見えないので、スマートフォンでの確認が必須。

---

### ❌ パターン10: 校舎ドロップダウンを `forEach` で直接生成する（配属校舎が先頭に来ない）

**発生した問題**: 新しいタブに校舎選択欄を追加した際に `forEach` で直接 `<option>` を生成したため、
ユーザーが設定した「配属校舎」が先頭に表示されず、毎回スクロールして選択する必要があった。

**やってはいけないコード:**
```javascript
// ❌ 配属校舎（preferredCampuses）が先頭に来ない
result.campuses.forEach(function(c) {
  html += '<option value="' + c.code + '">' + c.name + '</option>';
});
document.getElementById('myCampusSelect').innerHTML = html;
```

**正しいコード:**
```javascript
// ✅ buildCampusOptions() ヘルパーを必ず使う（配属校舎が自動で先頭に来る）
document.getElementById('myCampusSelect').innerHTML = buildCampusOptions(result.campuses);

// ✅ campusData（オブジェクト形式）から変換する場合
var arr = Object.keys(campusData).map(function(code) {
  return { code: code, name: campusData[code] };
});
document.getElementById('myCampusSelect').innerHTML = buildCampusOptions(arr);

// ✅ プロフィール読み込み後は rebuildCampusDropdowns() を必ず呼ぶ
preferredCampuses = profile.preferredCampuses || [];
renderPreferredCampusCheckboxes();
rebuildCampusDropdowns();  // ← これを忘れると配属校舎が先頭に来ない
```

**チェックポイント**: 校舎選択欄（`<select>`）を新たに作る場合は `buildCampusOptions()` を
使っていることを必ず確認すること。直接 `forEach` でオプションを生成することは禁止。

---

### ❌ パターン11: Firestore クライアント SDK で認証なし読み取り（permissions エラー・繰り返し発生）

**発生した問題**: 成績管理タブの年度一覧取得で「Missing or insufficient permissions」エラーが
繰り返し発生した。原因は Firebase Hosting のデプロイワークフローが `--only hosting` で
Firestore セキュリティルールをデプロイしていなかったため、ルールがリセットされると
クライアント側の読み取りが全てブロックされた。

**やってはいけないこと:**
```yaml
# ❌ hosting のみデプロイ → Firestore ルールがデプロイされない
firebase deploy --only hosting --project fir-quire
```

```javascript
// ❌ 認証チェックなしでFirestoreを直接読む
function fbGetSomething() {
  return fbDb.collection('myCollection').get()  // 未認証だと失敗する
}
```

**正しいコード:**
```yaml
# ✅ hosting と Firestore ルールを同時にデプロイ
firebase deploy --only hosting,firestore:rules --project fir-quire
```

```javascript
// ✅ Firestore 読み取り前に認証チェックを入れる
function fbGetSomething() {
  if (!window.fbCurrentUser) {
    return Promise.resolve({ success: false, error: '認証されていません。' });
  }
  return fbDb.collection('myCollection').get()
}
```

**チェックポイント**:
- `deploy-firebase.yml` の deploy コマンドは `--only hosting` のみ。`firestore:rules` を含めてはいけない（サービスアカウントに権限がなく 403 エラーになる）
- Firestore Rules を変更する場合は Firebase コンソールから手動でデプロイすること
- クライアント側の Firestore 読み取り関数には `fbCurrentUser` の認証チェックを入れること

---

