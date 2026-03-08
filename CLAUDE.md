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
├── code.js               # メインバックエンド（約4400行）教師向け API・データ管理
├── code_tts.js           # TTS音声生成・GitHubアップロード（Google Cloud TTS連携）
├── subcode.js            # 生徒向けサブバックエンド（約485行）※ GAS 未デプロイ
├── editor.html           # 教師用エディタ UI（約8500行）
├── index.html            # 生徒用発音練習 UI（約976行）
├── appsscript.json       # GAS マニフェスト（OAuthスコープ・タイムゾーン等）
├── .clasp.json           # clasp 設定（scriptId）
├── .claspignore          # GAS プッシュ除外ファイル一覧
└── .github/workflows/
    ├── deploy.yml        # GAS デプロイ（.js/.html 変更時のみ起動）
    └── merge-to-master.yml  # claude/* → master 自動マージ
```

### 重要な注意点
- `subcode.js` は `.claspignore` に含まれており **GAS にはデプロイされない**（意図的な分離）
- `editor.html` / `index.html` の両ファイルは非常に大きい（8500行・976行）。編集時は対象箇所を絞って Read すること
- `code.js` の `doGet()` が唯一のエントリポイント。`subcode.js` の `doGet()` は別 GAS プロジェクト用

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
│   │   ├── 不規則動詞①（シート、10列）
│   │   ├── 不規則動詞②（シート、13列）
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

**入試対策 不規則動詞①（10列）:**
```
7列 + past_word_id | past_english | past_pronunciation
```

**入試対策 不規則動詞②（13列）:**
```
10列 + past_part_word_id | past_part_english | past_part_pronunciation
```

**マスターデータ「英単語」シート（5列）:**
```
id | english | pronunciation | japanese | audio
```
※ id は 1〜10000。「英文」シートは id 10001〜。

### Script Properties（設定値）

| キー | 内容 |
|------|------|
| `ENGLISHWORDS_FOLDER_ID` | Google Drive ルートフォルダID（年度フォルダの親） |
| `ENGLISHWORDS_SHEET_ID` | マスターデータスプレッドシートID（英単語・英文シート） |
| `VOCABULARY_FOLDER_ID` | `ENGLISHWORDS_FOLDER_ID` の別名（同じ値） |
| `GITHUB_BASE_URL` | 音声ファイルの GitHub ベース URL |
| `HOMEPAGE_URL` | アプリのホームページ URL |
| `GOOGLE_CLOUD_TTS_API_KEY` | Google Cloud TTS API キー（音声自動生成用） |
| `GITHUB_TOKEN` | GitHub Personal Access Token（音声ファイルアップロード用、repoスコープ） |

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
- `getMaxColumnsForSheet(textbook, grade)` — 7/10/13を返す

### 音声ファイル URL 構築

```
${GITHUB_BASE_URL}/sounds/${fileName[0].toLowerCase()}/${fileName}?v=${Date.now()}
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

## 全関数リファレンス

### code.js（教師向け API・主要関数）

**ルーティング・設定:**
| 関数 | 役割 |
|------|------|
| `doGet(e)` | エントリポイント。`?page=student` → index.html、それ以外 → editor.html |
| `getScriptProperty(key)` | Script Properties から値取得 |
| `getAppConfig()` | `{ VOCABULARY_FOLDER_ID, GITHUB_BASE_URL, HOMEPAGE_URL }` を返す |
| `clearCache()` | years/textbooks/grades のキャッシュ削除 |
| `escapeHtml(s)` | HTML エスケープ（&<>"'） |

**階層データ取得（教師用）:**
| 関数 | 役割 |
|------|------|
| `getEditorYears()` | 年度フォルダ一覧（降順） |
| `getEditorTextbooks(year)` | 教科書スプレッドシート一覧 |
| `getEditorGrades(year, textbook)` | 学年シート名一覧（'レッスン順序'を除く） |
| `getEditorLessons(year, textbook, grade)` | レッスン名一覧 |
| `getEditorLogoUrl()` | logo.png を base64 Data URL で返す |

**レッスンデータ操作:**
| 関数 | 役割 |
|------|------|
| `getExistingData(year, textbook, grade, lesson)` | 既存レッスンデータ読み込み |
| `loadDataIntoTable(rawData, lesson)` | シートの生データ → tableData 変換 |
| `saveLessonData(year, textbook, grade, lesson, tableData, allWords, allSentences)` | レッスンデータ保存（福速対応、7/10/13列） |
| `updateLessonName(year, textbook, grade, oldName, newName)` | レッスン名変更（シート全体を更新） |
| `getLessonList(year, textbook, grade)` | レッスン一覧（別形式） |
| `getLessonListForSave(year, textbook, grade)` | 保存ダイアログ用レッスン一覧 |
| `getMaxColumnsForSheet(textbook, grade)` | 7/10/13を返す（シート種別判定） |

**不規則動詞（福速）:**
| 関数 | 役割 |
|------|------|
| `isFukisoku(lessonName)` | 不規則動詞レッスン判定 |
| `saveFukisokuData(...)` | 不規則動詞データ保存（①14列 or ②18列） |
| `loadFukisokuData(...)` | 不規則動詞データ読み込み |
| `updateFukisokuTableByMasterId(masterId)` | マスター変更時の全福速シート更新 |

**マスターデータ CRUD:**
| 関数 | 役割 |
|------|------|
| `getAllWordsAndSentences()` | 英単語・英文マスター全取得 |
| `saveWords(words)` | 英単語シートへ書き込み |
| `saveSentences(sentences)` | 英文シートへ書き込み |
| `updateMasterWord(wordId, english, pronunciation, japanese)` | マスター単語更新 |
| `updateMasterSentence(sentenceId, text, pronunciation, japanese)` | マスター英文更新 |
| `addMasterWord(english, pronunciation, japanese)` | マスター単語追加 |
| `addMasterSentence(text, pronunciation, japanese)` | マスター英文追加 |
| `updateAllLessonDataInYear(year, masterId, ...)` | 年度内全レッスンの一括更新 |
| `updateLessonWord(...)` | 特定レッスンの単語更新 |
| `updateLessonSentence(...)` | 特定レッスンの英文更新 |

**レイアウト・変換:**
| 関数 | 役割 |
|------|------|
| `determineLayoutType(lessonName)` | 'normal' / 'fukisoku1' / 'fukisoku2' / 'special' を返す |
| `convertToTableDataNormal(items)` | 通常レイアウトに変換（16×3） |
| `convertToTableDataFukisoku(items)` | 福速レイアウトに変換（16×1） |
| `convertToTableData(items, isFukisoku)` | ルーター関数 |
| `validateCellId(cellId)` | cellId 1〜48 の範囲検証 |

**入試対策:**
| 関数 | 役割 |
|------|------|
| `getExamPrepLessons(year)` | 入試対策編のレッスン一覧 |
| `getAllLessonsDataForExamPrep(year, textbook, grade)` | 入試対策データ全取得（レイアウトタイプ付き） |
| `getLessonDataFromExamPrep(year, lesson, sheetName)` | 入試対策シートからデータ取得 |
| `getLessonDataFromBoth(year, textbook, grade, lesson)` | テキスト + 入試対策のマージ取得 |
| `isExamPrepLessonName(lessonName)` | 入試対策レッスン名判定 |

**レッスン順序:**
| 関数 | 役割 |
|------|------|
| `initializeLessonOrderSheet(year, textbook)` | 'レッスン順序' シート作成 |
| `getSavedLessonOrder(year, textbook, grade)` | 保存済みレッスン順序取得 |
| `saveLessonOrder(year, textbook, grade, lessonOrder)` | レッスン順序保存 |
| `getAvailableLessons(year, textbook, grade)` | 未割り当てレッスン取得 |

**PDF 生成:**
| 関数 | 役割 |
|------|------|
| `generateAndSavePdf(...)` | PDF 生成・Drive 保存 |
| `generatePdfLayout(...)` | PDF 全体の HTML 生成 |
| `generatePdfPage(...)` | 通常レイアウトのページ HTML |
| `generatePdfPageFukisoku(...)` | 不規則動詞ページ HTML |
| `generatePdfPageSpecialLayout(...)` | 特殊レイアウトのページ HTML |
| `generatePronounTableHtml(allWords, displayItems)` | 代名詞テーブル HTML |
| `findPronounData(englishWord, allWords)` | 代名詞データ検索 |
| `isSpecialLayoutLessonGAS(lessonName)` | 特殊レイアウト判定（福速含む） |
| `formatGrade(grade)` | 学年の表示用フォーマット |

**生徒向け API:**
| 関数 | 役割 |
|------|------|
| `getStudentLogoUrls()` | 生徒用ロゴ URL 取得 |
| `getStudentYears()` | 上位2年度（'新教科書版'/'旧教科書版'にリネーム） |
| `getStudentTextbooks(year)` | 教科書一覧（キャッシュあり） |
| `getStudentGrades(year, textbook)` | 学年一覧 |
| `getStudentLessons(year, textbook, grade)` | レッスン一覧（入試対策除外） |
| `getPracticeQuestions(year, textbook, grade, lesson)` | 練習問題取得（音声URL付き） |
| `generatePronounQuestions(githubBase, startNumber)` | 代名詞問題を動的生成（9種×4形式） |
| `extractQuestionsFromSheet(sheet, targetLesson, lessonCol)` | シートから問題行を抽出 |

---

### subcode.js（生徒向け別 GAS プロジェクト用）

> ⚠️ `.claspignore` で除外済み。変更した場合は別途手動で GAS に反映が必要。

| 関数 | 役割 |
|------|------|
| `doGet(e)` | 生徒用エントリポイント（index.html に yearsJson を埋め込み） |
| `getScriptProperty(key)` | Script Properties 値取得 |
| `getConfig()` | 3つの必須設定値取得（不足時はエラー） |
| `getLogoUrl()` | GitHub URL からロゴ取得 |
| `manualCacheClear()` | years/textbooks/grades キャッシュ削除 |
| `getYears()` | 年度フォルダ2件取得（キャッシュ1時間） |
| `getTextbooks(year)` | 教科書一覧取得 |
| `getGrades(year, textbook)` | 学年シート名取得 |
| `getLessons(year, textbook, grade)` | レッスン一覧（'レッスン順序' シートから取得） |
| `getPracticeQuestions(year, textbook, grade, lesson)` | 練習問題取得（音声URL付き） |
| `generatePronounQuestions(githubBase, startNumber)` | 代名詞36問を動的生成 |
| `extractQuestionsFromSheetByColumn(sheet, targetLesson, lessonCol)` | シートから問題抽出（7列まで対応） |

---

## フロントエンド詳細

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

## よく使う関数（code.js）

| 関数 | 役割 |
|------|------|
| `doGet(e)` | エントリポイント・ルーティング |
| `getEditorYears()` | 年度一覧取得 |
| `getEditorTextbooks(year)` | 教科書一覧取得 |
| `getEditorGrades(year, textbook)` | 学年一覧取得 |
| `getEditorLessons(year, textbook, grade)` | レッスン一覧取得 |
| `getAllWordsAndSentences()` | 単語・英文マスターデータ取得 |
| `saveLessonData()` | レッスンデータ保存 |
| `generateAndSavePdf()` | PDF語彙リスト生成・保存 |
| `determineLayoutType()` | レッスンのレイアウト種別判定 |
| `isFukisoku()` | 不規則動詞レッスン判定 |
| `getPracticeQuestions()` | 生徒用練習問題取得 |
| `updateAllLessonDataInYear()` | 年度内全レッスン一括更新 |

---

## 作業時の注意事項

1. **大きなファイルを Read する際はオフセットと行数を指定する**
   - `editor.html` はスケルトン化済み（~400行）。CSS は `editor-css.html`、JS は `editor-js1〜5.html` に分割済み
   - `code.js` は ~700行に削減済み。残りは `code_lesson.js` / `code_data.js` / `code_pdf.js` / `code_student.js` に分割済み
   - 各分割ファイルは ~1000〜1600行。対象関数を Grep で探してから Read する

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
editor.html       — スケルトン（~400行）HTMLボディ + IIFE 枠組み
editor-css.html   — CSS（<style>タグ込み）
editor-js1.html   — グローバル変数・状態 + ダイアログ + 初期化 + データ階層 + カスタムレッスン
editor-js2.html   — エディタ読込 + renderEditor + renderTabs + renderWordList + テーブル操作
editor-js3.html   — renderTable + 特殊レイアウト + 代名詞テーブル + キーボード + セルID計算
editor-js4.html   — 既存データ読込 + インライン編集 + D&D全関数
editor-js5.html   — 保存処理 + 単語登録 + 英文登録 + 単語帳タブ
```

**現在の分割済み構成（code.js）:**
```
code.js           — doGet + 基本ユーティリティ + 階層取得 + マスターデータ + レッスン取得 + 保存処理（~700行）
code_lesson.js    — レッスン名変更 + レッスン一覧 + 不規則動詞保存・読込
code_data.js      — 入試対策データ + マスターCRUD + レッスン順序 + レイアウト変換
code_pdf.js       — PDF生成全関数（generateAndSavePdf〜generatePdfPage）
code_student.js   — 生徒向け全API（getStudentYears〜extractQuestionsFromSheet）
code_tts.js       — Google Cloud TTS音声生成 + GitHubアップロード + 一括生成
```

### 新しいコードを追加するとき
1. 既存の分割ファイルのどのグループに属するか判断する
2. そのファイルに追加後、2000行を超えるなら新ファイルに切り出す
3. 切り出す場合は命名規則に従い、このセクションの構成表を更新する

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
