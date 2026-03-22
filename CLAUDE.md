# CLAUDE.md — Claude Code 作業ガイド

## プロジェクト概要

**Google Apps Script (GAS) ベースの英語学習 Web アプリケーション**

中学校の英単語・英文の学習支援システム。2つのユーザーロールがある：

- **教師** — `editor.html` でレッスン・語彙の管理・PDF生成
- **生徒** — `index.html` で発音練習（音声付きフラッシュカード）

**技術スタック:**
- バックエンド: Google Apps Script (V8 ランタイム)
- フロントエンド: HTML / CSS / JavaScript（バニラ、ライブラリなし）
- データ: Google Sheets（語彙データ）+ Google Drive（フォルダ管理）
- 音声: GitHub にホスト（URL は Script Properties で管理）
- デプロイ: `clasp` + GitHub Actions

---

## ファイル構成

```
englishtest/
├── code.js               # メインバックエンド（~1007行）doGet・階層取得・保存処理
├── code_lesson.js        # レッスン名変更・一覧・不規則動詞保存（~814行）
├── code_data.js          # 入試対策・マスターCRUD・レッスン順序・変換（~1280行）
├── code_pdf.js           # PDF生成全関数（~1020行）
├── code_student.js       # 生徒向けAPI（~317行）
├── code_tts.js           # TTS音声生成・GitHubアップロード（~719行）
├── code_init.js          # 初期セットアップ・年度フォルダ作成（~200行）
├── subcode.js            # 生徒向けサブバックエンド（~485行）※ GAS 未デプロイ
├── editor-header.html    # HTML構造 + CSS全スタイル + script開始タグ（~1788行）
├── editor-js1.html       # グローバル変数・状態・ダイアログ・初期化（~1025行）
├── editor-js2.html       # エディタ描画・タブ・単語リスト（~972行）
├── editor-js3.html       # テーブル描画・特殊レイアウト・キーボード（~1853行）
├── editor-js4.html       # データ読込・インライン編集・D&D（~1408行）
├── editor-js5.html       # 保存処理・単語登録・英文登録（~813行）
├── editor-js5b.html      # 単語帳タブ・PDF出力・トースト通知（~1228行）
├── editor-js6.html       # 設定タブ全関数（~325行）
├── editor-footer.html    # script終了タグ + HTML終了タグ（5行）
├── editor.html           # ビルド生成物（deploy.yml が8ファイルを結合して作成）
├── index.html            # 生徒用発音練習 UI（~1163行）
├── appsscript.json       # GAS マニフェスト（OAuthスコープ・タイムゾーン等）
├── .clasp.json           # clasp 設定（scriptId）
├── .claspignore          # GAS プッシュ除外ファイル一覧（subcode.js のみ）
└── .github/workflows/
    ├── deploy.yml        # GAS デプロイ（.js/.html 変更時のみ起動）
    └── merge-to-master.yml  # claude/* → master 自動マージ
```

### 重要な注意点
- `subcode.js` は `.claspignore` に含まれており **GAS にはデプロイされない**（意図的な分離）
- `editor.html` は deploy.yml のビルドステップで生成される（直接編集しない）
- 教師UI の編集対象: `editor-header.html`（CSS）または `editor-js1〜5b.html`（JS）
- `code.js` の `doGet()` が唯一のエントリポイント。`subcode.js` の `doGet()` は別 GAS プロジェクト用
- **ファイル検索の手順**: 対象関数を `Grep` で探す → ファイル名とオフセットを確認 → `Read` で該当箇所のみ読む

---

## デプロイ・開発フロー

### 自動デプロイ（通常の方法）
1. `claude/*` ブランチに push する
2. `merge-to-master.yml` が起動 → master へ自動マージ（`-X theirs` 戦略）
3. `deploy.yml` が起動 → `clasp push --force` で GAS に自動反映
4. 続いて GAS の Deployment が更新される（`GAS_DEPLOYMENT_ID` Secret 使用）

### デプロイ設定
- GAS Script ID: `.clasp.json` の `scriptId` を参照（`1JuDkNKc2Nq-5NE2ZXPKACuroWgBhzqQVED0ioPDdVGuXsICiS3xesO8e`）
- タイムゾーン: `Etc/GMT-9`（JST）
- 実行ユーザー: `USER_DEPLOYING`（デプロイしたユーザーとして実行）
- アクセス: `ANYONE_ANONYMOUS`（認証不要で誰でもアクセス可能）
- OAuth スコープ: spreadsheets / drive / documents / script.external_request

### ローカルテスト環境
- **ローカルテスト環境は存在しない**
- デバッグは GAS の Stackdriver ログで行う（Apps Script エディタ → 実行数）
- HTML の動作確認は GAS デプロイ後にブラウザで確認する

---

## ルーティング

`code.js` の `doGet(e)` 関数がエントリポイント：

```js
// ?page=student → index.html（生徒用）
// それ以外       → editor.html（教師用）
```

---

## データ構造・階層

### カリキュラム階層
```
年度（Year）: "2024年度版" 形式（フォルダ名）
  └── 教科書（Textbook）: 新教科書版 / 旧教科書版 / 入試対策編
        └── 学年（Grade）: 中学1年 / 中学2年 / 中学3年
              └── レッスン（Lesson）
```

### Google Drive フォルダ構成

```
ENGLISHWORDS_FOLDER_ID/
├── 2024年度版/（年度フォルダ: /\d{4}年度版/ で一致）
│   ├── 新教科書版.sheets
│   │   ├── 中学1年（シート）
│   │   ├── 中学2年（シート）
│   │   ├── 中学3年（シート）
│   │   └── レッスン順序（シート）
│   ├── 旧教科書版.sheets（同上構成）
│   ├── 入試対策編.sheets
│   │   ├── 不規則動詞①（シート、14列）
│   │   ├── 不規則動詞②（シート、18列）
│   │   └── 通常（シート、7列）
│   ├── 生成PDF/（PDF保存先フォルダ）
│   └── logo.png
└── ENGLISHWORDS_SHEET_ID.sheets（マスターデータ）
    ├── 英単語（シート）
    └── 英文（シート）
```

### シート列構造（全タイプ）

**通常教科書（7列）:**
```
word_id | english | pronunciation | japanese | audio | lesson | cell_id
```

**入試対策 不規則動詞①（14列）:**
```
7列 + past_word_id | past_english | past_pronunciation | past_audio | (空3列)
```

**入試対策 不規則動詞②（18列）:**
```
14列の不規則動詞①構造 + past_part_word_id | past_part_english | past_part_pronunciation | past_part_audio | (空3列)
```

**マスターデータ「英単語」シート（5列）:**
```
id | english | pronunciation | japanese | audio
```
※ id は 1〜10000。「英文」シートは id 10001〜。

### Script Properties（設定値）

> **⚙️ 設定方法**: Script Properties はすべて **教師用ページの「⚙️ 設定」タブ** からブラウザで設定できる。
> GAS エディタの「プロジェクトの設定 → スクリプトプロパティ」を直接操作する必要はない。

| キー | 設定方法 | 内容 |
|------|----------|------|
| `ENGLISHWORDS_FOLDER_ID` | ✅ 自動作成可（設定タブ） | Google Drive ルートフォルダID（年度フォルダの親） |
| `ENGLISHWORDS_SHEET_ID` | ✅ 自動作成可（設定タブ） | マスターデータスプレッドシートID（英単語・英文シート） |
| `VOCABULARY_FOLDER_ID` | 自動（UI 非表示） | `ENGLISHWORDS_FOLDER_ID` の別名（保存時に自動同期） |
| `GITHUB_BASE_URL` | ❌ 手動（設定タブ） | 音声ファイルの GitHub ベース URL |
| `HOMEPAGE_URL` | ❌ 手動（設定タブ） | ロゴクリック時のリンク先 URL（例: 塾のホームページ URL） |
| `GOOGLE_CLOUD_TTS_API_KEY` | ❌ 手動（設定タブ） | Google Cloud TTS API キー（音声自動生成用） |
| `GITHUB_TOKEN` | ❌ 手動（設定タブ） | GitHub Personal Access Token（音声ファイルアップロード用、repoスコープ） |
| `TEACHER_ACCESS_KEY` | ❌ 手動（GASエディタ直接） | 教師用ページのアクセスキー（設定タブ非対応・`doGet` のルーティングに使用） |
| `STUDENT_HOMEPAGE_URL` | ❌ 手動（設定タブ） | 生徒向けホームページ URL |

#### 新規プロパティを設定タブに追加するとき
1. `code.js` の `getScriptPropertiesForSettings()` と `saveScriptProperties()` の `keys` 配列に追加
2. `editor.html` の設定タブ HTML に入力フィールドを追加（`id="setting-プロパティ名"` 形式）
3. `editor-js6.html` の `loadSettingsValues()` と `saveSettings()` 内のキー配列に追加
4. この表を更新

---

## 重要な設計パターン

### 48セルレイアウト（通常レイアウト）

**16行 × 3列 = 48セル**のグリッドにワード・英文を配置する。

```
cellId  1-16  → 左列（colIdx=0、rowIdx=0-15）
cellId 17-32  → 中列（colIdx=1、rowIdx=0-15）
cellId 33-48  → 右列（colIdx=2、rowIdx=0-15）
```

**変換式:**
- `rowIdx = (cellId - 1) % 16`
- `colIdx = Math.floor((cellId - 1) / 16)`
- `cellId = rowIdx + colIdx * 16 + 1`

**バリデーション:** `validateCellId(cellId)` で 1〜48 の範囲を検証。

### レイアウトタイプ（4種類）

| タイプ | 対象レッスン | セル構成 |
|--------|------------|---------|
| `'normal'` | 通常語彙レッスン | 16×3、cellId 1-48 |
| `'fukisoku1'` | 不規則動詞①（現在形・過去形） | 16×1、cellId 1-16 |
| `'fukisoku2'` | 不規則動詞②（現在形・過去形・過去分詞） | 16×1、cellId 1-16 |
| `'special'` | 曜日・月・季節・代名詞 | 特殊10×3 |

`determineLayoutType(lessonName)` でレッスン名から判定。

### 不規則動詞（福速データ）

- `isFukisoku(lessonName)` — レッスン名が不規則動詞かどうか判定
- `saveFukisokuData()` / `loadFukisokuData()` — 専用処理
- 不規則動詞① : 意味masterId + present + past の2形式
- 不規則動詞② : 意味masterId + present + past + pastPart の3形式
- `getMaxColumnsForSheet(textbook, grade)` — 7/14/18を返す

### 音声ファイル URL 構築

```
${GITHUB_BASE_URL}/audio/${fileName[0].toLowerCase()}/${fileName}?v=${Date.now()}
```

- ファイル名の先頭1文字をディレクトリとして使用（例: `a/apple.mp3`）
- `?v=タイムスタンプ` でキャッシュバスター

### キャッシュ戦略

- `CacheService.getScriptCache()` を使用、TTL 3600秒（1時間）
- **code.js** : `getStudentYears()` / `getStudentTextbooks()` / `getStudentGrades()` がキャッシュを使用
- **subcode.js** : `getYears()` のみキャッシュ
- `clearCache()` / `manualCacheClear()` で手動クリア可能

### 生徒向け年度エイリアス

- 最新2件の年度フォルダのみ生徒に公開
- Index 0（最新）→ "新教科書版" として表示
- Index 1（次点）→ "旧教科書版" として表示
- 生徒には実際の年度番号（"2024年度版"等）を見せない

### Dual-Source データ取得

`getLessonDataFromBoth()` でテキストブック + 入試対策編の両方からデータをマージ。各アイテムに `source: 'textbook' | 'examPrep'` フィールドを持つ。

### 一括更新

`updateAllLessonDataInYear(year, masterId, ...)` — マスターデータ変更時に年度内の全レッスンを一括更新。`updateFukisokuTableByMasterId(masterId)` で不規則動詞テーブルも更新。

---

## データ構造詳細

### tableData（エディタのグリッド状態）

```js
// 16行 × 3列の2次元配列
tableData[rowIdx][colIdx] = {
  type: 'word' | 'sentence' | null,
  english: string,
  japanese: string,
  pronunciation: string,
  audio: string,          // ファイル名のみ
  masterWordId: number,   // マスターID（英文は 10001+）
  cellId: number          // 1-48
}
```

### マスターデータ

```js
// 英単語（id: 1-10000）
{ id, english, pronunciation, japanese, audio }

// 英文（id: 10001+）
{ id, text, pronunciation, japanese, audio }
```

### 不規則動詞データマップ

```js
fukisokuDataMap[meaningMasterId] = {
  meaningMasterId: number,
  present: string,
  presentPronunciation: string,
  meaning: string,
  past: string,
  pastPronunciation: string,
  pastMasterId: number,
  // 不規則動詞② のみ:
  pastPart: string,
  pastPartPronunciation: string,
  pastPartMasterId: number,
  cellId: number
}
```

### 練習問題オブジェクト（生徒用）

```js
{
  wordId: string,       // マスターID
  cellId: string,       // グリッド内の位置
  english: string,
  japanese: string,
  pronunciation: string,
  audio: string,        // 完全な URL（タイムスタンプ付き）
  formType: 'present' | 'past' | 'past_participle',
  isPronoun: boolean,
  pronounColumn: 'nominative' | 'genitive' | 'objective' | 'possessive'
}
```

---

## PDF 生成ワークフロー

`generateAndSavePdf(year, textbook, grade, displayItems, lessonsData, pdfSuffix, isSpecialLayout, allWords)`

1. `generatePdfLayout()` で HTML 文字列を生成
   - レイアウトタイプに応じてページ生成関数を呼び分け:
     - `generatePdfPage()` — 通常
     - `generatePdfPageFukisoku()` — 不規則動詞
     - `generatePdfPageSpecialLayout()` — 特殊レイアウト
2. `Utilities.newBlob(html).getAs('application/pdf')` で PDF Blob を生成
3. 年度フォルダ内の「生成PDF」フォルダに保存
4. 同名ファイルが存在する場合は削除してから新規作成

**ファイル命名:** `${year}_${textbook}_${grade}_${pdfSuffix}.pdf`
（例: `2024年度版_新教科書版_中学1年_単語.pdf`）

---
## フロントエンド詳細

### 教師UI のJSファイルと主要関数の対応

| ファイル | 主要関数 |
|---------|---------|
| editor-js1.html | `loadYears()`, `handleYearChange()`, `handleLessonChange()`, `showLoadingIndicator()`, `hideLoadingIndicator()`, `loadEditorData()` |
| editor-js2.html | `renderEditor()`, `renderTabs()`, `renderWordList()`, `closeEditor()`, `updateCounts()` |
| editor-js3.html | `renderTable()`, `renderFukisokuTable()`, `renderSpecialLayout_DayMonthSeason()`, `renderPronounTable()`, `handleRightPanelKeyDown()`, `calculateCellId()`, `getCellIndices()` |
| editor-js4.html | `loadExistingData()`, `editWordItem()`, `editSentenceItem()`, `setupRightPanelDragDrop()`, `setupWordCellDragDrop()` |
| editor-js5.html | `handleSave()`, `startRegisterWord()`, `performNewRegistrationWord()`, `startRegisterSentence()`, `performNewRegistrationSentence()` |
| editor-js5b.html | `initWordbook()`, `renderLessonPanels()`, `handleSaveOrderWB()`, `initPdfExport()`, `handleExportPdf()`, `showToast()`, `showSaveCompletedMessage()` |
| editor-js6.html | `initSettingsTab()`, `loadSettingsValues()`, `saveSettings()`, `runAutoSetup()`, `showTtsRetryNotification()` |

### editor.html（教師用）主要状態管理

```js
// グローバル状態
let allWords = [];          // マスター単語リスト
let allSentences = [];      // マスター英文リスト
let tableData = [];         // 16×3 グリッド
let activeTab = 'A';        // 'A'=単語タブ / 'B'=英文タブ
let draggedItem = null;     // ドラッグ中のアイテム
let hasChanges = false;     // 未保存変更フラグ

const state = {
  year: '', textbook: '', grade: '', lesson: '',
  isCustomLesson: false,
  isEditorOpen: false
};
```

**UI 構成（2タブ）:**
1. **エディタータブ** — ドロップダウン選択 → 左パネル（単語/英文リスト）+ 右パネル（16×3グリッド）+ ドラッグ&ドロップで配置
2. **単語帳作成タブ** — レッスンを選択して PDF エクスポート

**GAS 呼び出しパターン:**
```js
google.script.run
  .withSuccessHandler(data => { /* ... */ })
  .withFailureHandler(err => { /* ... */ })
  .functionName(params);
```

### index.html（生徒用）主要動作

**初期データ埋め込み:**
```js
// doGet() が HTML にインライン挿入
const yearsJsonString = '<?= yearsJson ?>';
years = JSON.parse(yearsJsonString);
```

**問題グループ化ロジック:**
- `cellId` でグループ化（同じ cellId = 同じカード）
- 不規則動詞は formType（present/past/past_participle）で複数行表示
- `isPronoun: true` の場合は 9×4 の代名詞テーブルを生成

**特殊ケース（入試対策編）:**
- 学年選択なし（`grade = '入試対策編'` に固定）
- ドロップダウンに「（学年不要）」と表示

---

## 作業時の注意事項

1. **大きなファイルを Read する際はオフセットと行数を指定する**
   - 教師UI: CSS は `editor-header.html`、JS は `editor-js1〜5b.html` に分割済み
   - バックエンド: `code.js` は ~1007行。関連処理は `code_lesson.js` / `code_data.js` / `code_pdf.js` / `code_student.js` に分割済み
   - **必ず Grep で関数名を探してファイル・行番号を特定してから Read すること**

2. **GAS 固有の制限**
   - GAS の実行時間制限は6分（長い処理は分割が必要）
   - `UrlFetchApp`, `SpreadsheetApp`, `DriveApp` 等の GAS サービスを使用
   - `console.log()` ではなく `Logger.log()` または `console.log()`（V8では両方可）
   - デバッグ emoji マーカー（✅❌⚠️📌）をログに使用している

3. **デプロイ対象の確認**
   - `.claspignore` で除外されているファイルを変更した場合、GAS には反映されない
   - `subcode.js` の変更は手動で別途 GAS プロジェクトに反映が必要（または `.claspignore` から削除）

4. **日本語コンテンツ**
   - シート名・学年名・教科書名はすべて日本語
   - ファイル内のコメントも日本語が混在している

5. **エラー処理パターン（code.js 全体で統一）**
   ```js
   try {
     // 処理
     return { success: true, data };
   } catch (e) {
     Logger.log('Error functionName: ' + e);
     return { success: false, error: e.toString() };
   }
   ```

6. **複数の修正を依頼された場合でも、必ず1つずつ順番に実行すること。次の作業は前の作業が完了してからユーザーに確認を取った上で進めること。**

---

## ファイル分割ポリシー

コンテキスト制限（Claude 無料プラン）内で作業できるよう、ファイルサイズを管理する。

### ファイルサイズ上限
- **原則: 1ファイル 2000行以内**（GAS 実行時間制限と Claude コンテキスト制限の両方に対応）
- 超過したら、論理的なグループ単位で新ファイルに切り出す

### GAS バックエンド（.js ファイル）の分割方法
- GAS では複数の `.js` ファイルがすべて **同一グローバルスコープ** で動作 → `import/export` 不要
- 関数をそのまま新ファイルへ切り出すだけでよい（`doGet()` が必要なのは `code.js` のみ）
- 新規ファイルはデフォルトで clasp によりデプロイされる（`.claspignore` 変更不要）
- **命名規則:** `code_<グループ名>.js`（例: `code_lesson.js`, `code_pdf.js`）

```
// 分割の例
// code.js から PDF 生成関数を code_pdf.js に移動するだけ
// code.js 側: 関数定義を削除
// code_pdf.js 側: 関数定義を貼り付け（インポート文なし）
```

### HTML ファイル（editor.html 等）の分割方法
- `doGet()` で `HtmlService.createTemplateFromFile('editor').evaluate()` を使用（テンプレートモード必須）
- `HtmlService.createHtmlOutputFromFile` では scriplet（`<?!= ?>`）が使えないので注意

**インクルード構文（editor.html 内で使用）:**
```html
<?!= HtmlService.createHtmlOutputFromFile('editor-css').getContent() ?>
```

**分割パターン:**
- CSS → `<ファイル名>-css.html`（`<style>` タグごと移動）
- JS → `<ファイル名>-js1.html`, `<ファイル名>-js2.html` ...（`<script>` タグなし、純粋なJSのみ）
- メインの HTML（editor.html）に IIFE の `(() => {` と `})();` を残し、JS ファイルをその中にインクルード

**現在の分割済み構成（editor.html）:**
```
editor-header.html — CSS + HTMLヘッダー + script開始タグ（~1788行）
editor-footer.html — script終了タグ + HTML終了タグ（5行）
editor-js1.html   — グローバル変数・状態 + ダイアログ + 初期化 + データ階層 + カスタムレッスン（~1025行）
editor-js2.html   — エディタ読込 + renderEditor + renderTabs + renderWordList + テーブル操作（~972行）
editor-js3.html   — renderTable + 特殊レイアウト + 代名詞テーブル + キーボード + セルID計算（~1853行）
editor-js4.html   — 既存データ読込 + インライン編集 + D&D全関数（~1408行）
editor-js5.html   — 保存処理（handleSave） + 単語登録 + 英文登録（~813行）
editor-js5b.html  — 単語帳タブ（initWordbook〜） + PDF出力（initPdfExport〜） + トースト通知（~1228行）
editor-js6.html   — 設定タブ全関数（initSettingsTab, loadSettingsValues, saveSettings, runAutoSetup, QRコード, TTS通知UI）（~325行）
```

**deploy.yml ビルドコマンド（ファイル順序が重要）:**
```bash
cat editor-header.html editor-js1.html editor-js2.html editor-js3.html editor-js4.html editor-js5.html editor-js5b.html editor-js6.html editor-footer.html > editor.html
```
⚠️ 新しいファイルを追加する場合は deploy.yml のこのコマンドも更新すること。

**現在の分割済み構成（code.js）:**
```
code.js           — doGet + 基本ユーティリティ + 階層取得 + マスターデータ + レッスン取得 + 保存処理（~700行）
code_lesson.js    — レッスン名変更 + レッスン一覧 + 不規則動詞保存・読込
code_data.js      — 入試対策データ + マスターCRUD + レッスン順序 + レイアウト変換
code_pdf.js       — PDF生成全関数（generateAndSavePdf〜generatePdfPage）
code_student.js   — 生徒向け全API（getStudentYears〜extractQuestionsFromSheet）
code_tts.js       — Google Cloud TTS音声生成 + GitHubアップロード + 一括生成
code_init.js      — 初期化・セットアップ・年度フォルダ作成（setupScriptProperties, validateScriptProperties, createYearResources）
```

### 新しいコードを追加するとき
1. 既存の分割ファイルのどのグループに属するか判断する
2. そのファイルに追加後、2000行を超えるなら新ファイルに切り出す
3. 切り出す場合は命名規則に従い、このセクションの構成表を更新する

---

## 自律作業ガイド（よくある修正パターン）

このセクションは Claude が最小限のコンテキストで自律的に作業できるよう、典型的な修正タスクの手順を記録している。

---

### パターン1: バックエンドに新しい関数を追加する

1. 追加する関数の役割が既存グループに合うファイルを選ぶ
   - レッスン操作 → `code_lesson.js`
   - データ変換・CRUD → `code_data.js`
   - PDF関連 → `code_pdf.js`
   - 生徒向けAPI → `code_student.js`
   - TTS/音声 → `code_tts.js`
   - どれにも合わない → `code.js`
2. 対象ファイルを `wc -l` で行数確認
3. ファイル末尾に追加（2000行を超えるなら新ファイルへ切り出し）
4. エラー処理パターン（try/catch + `{ success, data/error }` 返却）は「作業時の注意事項 #5」を参照

---

### パターン2: 教師UIに新しいUI要素を追加する

1. **HTML構造** → `editor-header.html` の `<body>` 内の該当箇所に追加
2. **CSS** → `editor-header.html` の `<style>` セクションに追加
3. **JS（初期化・データ取得）** → `editor-js1.html`（グローバル状態に追加する場合はここ）
4. **JS（描画ロジック）** → `editor-js2.html` または `editor-js3.html`
5. **JS（保存・登録ロジック）** → `editor-js5.html`
6. **JS（単語帳・PDF関連）** → `editor-js5b.html`
7. **JS（設定タブ）** → `editor-js6.html`

**GAS呼び出し:**
```js
google.script.run
  .withSuccessHandler(data => { /* 成功時処理 */ })
  .withFailureHandler(err => { showToast('エラー: ' + err.message, true); })
  .backendFunctionName(param1, param2);
```

**ダイアログ表示パターン（editor-js1.html の既存ダイアログを参考に）:**
```js
// オーバーレイ表示
document.getElementById('overlay').style.display = 'flex';
document.getElementById('my-dialog').style.display = 'block';
// 閉じる
document.getElementById('overlay').style.display = 'none';
document.getElementById('my-dialog').style.display = 'none';
```

**ローディング表示パターン:**
```js
showLoadingIndicator('処理中...');
// 処理後
hideLoadingIndicator();
```

**トースト通知パターン（editor-js5b.html の showToast を使用）:**
```js
showToast('保存しました');          // 通常
showToast('エラーが発生しました', true); // エラー（赤）
```

---

### パターン3: 生徒UI（index.html）を修正する

- `index.html` は単一ファイル（~1163行）。CSS・HTML・JS がすべて含まれる
- GAS呼び出しは `google.script.run` を使用（教師UIと同じパターン）
- 初期データは `<?= yearsJson ?>` でサーバーサイドから注入される

---

### パターン4: 設定タブに新しいScript Propertyを追加する

以下の4箇所を同時に変更する：
1. `code.js` の `getScriptPropertiesForSettings()` — `keys` 配列にキー追加
2. `code.js` の `saveScriptProperties()` — `keys` 配列にキー追加
3. `editor-header.html` — 設定タブの `<div id="settings-tab">` 内にフィールド追加
   ```html
   <div class="setting-row">
     <label>説明テキスト</label>
     <input type="text" id="setting-PROPERTY_KEY" placeholder="値">
   </div>
   ```
4. `editor-js6.html` の `loadSettingsValues()` と `saveSettings()` — キー配列に追加

---

### パターン5: 関数の場所を素早く特定する

```bash
# バックエンド関数
Grep pattern="^function 関数名" path="/home/user/englishtest" type="js"

# フロントエンドJS関数
Grep pattern="^function 関数名" path="/home/user/englishtest" glob="*.html"

# CSSクラス
Grep pattern="\.クラス名" path="/home/user/englishtest/editor-header.html"
```

---

### パターン6: 主要CSSクラス一覧（UI修正時の参照用）

| クラス名 | 場所 | 役割 |
|---------|------|------|
| `.editor-container` | editor-header | メインコンテナ（flex、縦方向） |
| `.top-bar` | editor-header | 上部バー（ドロップダウン類） |
| `.left-panel` | editor-header | 左パネル（単語/英文リスト） |
| `.right-panel` | editor-header | 右パネル（グリッド） |
| `.word-table` | editor-header | 16×3グリッドテーブル |
| `.word-item` | editor-header | 左パネルの単語1件 |
| `.cell-word` | editor-header | グリッドセル（単語） |
| `.cell-sentence` | editor-header | グリッドセル（英文） |
| `.overlay` | editor-header | ダイアログオーバーレイ |
| `.dialog-box` | editor-header | ダイアログ本体 |
| `.tab-button` | editor-header | タブボタン |
| `.tab-active` | editor-header | アクティブタブ |
| `.toast` | editor-header | トースト通知 |
| `.loading-overlay` | editor-header | ローディング画面 |
| `.fukisoku-table` | editor-header | 不規則動詞テーブル |
| `.pronoun-table` | editor-header | 代名詞テーブル |
| `.settings-tab` | editor-header | 設定タブコンテナ |
| `.wordbook-tab` | editor-header | 単語帳タブコンテナ |

---

### パターン7: 新しい年度リソースを追加する手順

1. 教師用ページの「⚙️ 設定」タブ →「新年度の作成」セクションを開く
2. 年度名（例: `2025年度版`）を入力して「📁 年度フォルダを作成」ボタンを押す
3. 入試対策編は最新既存年度からデータごとコピーされる（既存年度なしの場合は空作成）
4. バックエンド関数: `createYearResources(year)` in `code_init.js`

---

## Git・デプロイ規則（重要）

### 基本ワークフロー
**ユーザーから修正依頼 → コード修正 → `claude/xxx` ブランチへプッシュ → GitHub Actions が自動デプロイ → アプリに反映**

ユーザーは何もしなくてよい。Claude がすべて完結させる。

### ブランチルール
- Claude エージェント環境は **セキュリティ上の制約** により `claude/` で始まるブランチにしかプッシュできない（`master` への直接プッシュは HTTP 403）
- ブランチ名: `claude/<作業内容>-<セッションID末尾>` 形式
- `git push -u origin claude/<branch-name>` で完了

### 自動化の仕組み（2ワークフロー構成）

| ワークフロー | トリガー | 役割 |
|---|---|---|
| `merge-to-master.yml` | `claude/*` への全プッシュ | master への自動マージのみ（`-X theirs` 戦略） |
| `deploy.yml` | `.js` `.html` `appsscript.json` `.github/workflows/*.yml` の変更時のみ | GAS へのデプロイのみ |

**必要な GitHub Secrets（設定済み・変更不要）:**
| Secret 名 | 内容 |
|---|---|
| `CLASPRC_JSON` | clasp 認証情報（`~/.clasprc.json` の内容） |
| `GAS_DEPLOYMENT_ID` | GAS のデプロイメント ID |

### Claude が毎回すること
1. `claude/<task>-<sessionId>` ブランチで作業
2. 修正が完了したら `git push -u origin <branch-name>`
3. GitHub Actions が自動実行（ユーザー操作不要）

### ⚠️ Claude がやってはいけないこと
- `clasp` のインストール・ログインをユーザーに案内すること（GitHub Actions が自動実行）
- GAS エディタでの手動デプロイをユーザーに案内すること（自動化済み）
- `clasp push` を手動実行しようとすること

### プッシュ後の報告文ルール（必ず使い分けること）

| 変更したファイル | GAS デプロイ | 報告文 |
|---|---|---|
| `.js` `.html` `appsscript.json` `.github/workflows/*.yml` を含む | ✅ 実行 | 「GitHubにプッシュしました。1〜2分後にアプリに反映されます。」 |
| `CLAUDE.md` のみなど上記以外 | ❌ 非実行 | 「GitHubにプッシュしました。今回はコードに変更がないためデプロイは実行されません。」 |

### 大きな変更前のバックアップルール
新機能追加・大幅修正・複数ファイル変更の前に、確認なしでコミットを作成すること。
- コミットメッセージ形式: `作業前バックアップ: [作業内容]`
- 例: `作業前バックアップ: PDF生成機能の追加前`
- コミット後「バックアップを作成しました」とユーザーに報告してから作業開始

---

## メインアプリとの連携
メインアプリのパス：/home/user/gas-App
別プロジェクトを参照する場合は以下のコマンドを使う：
cd /home/user/gas-App && CLAUDECODE= claude -p '質問内容' --output-format stream-json --verbose --allowedTools "Read,Grep,Glob" --max-turns 5 | jq -rj '(.event.delta.text? // empty), (.message.content[]?.text? // empty)'
