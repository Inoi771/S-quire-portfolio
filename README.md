# 英単語学習アプリ

Google Apps Script ベースの中学校向け英語学習 Web アプリケーション。

- **教師** — 語彙の管理・レッスン編集・PDF単語帳の生成
- **生徒** — 音声付きフラッシュカードで発音練習

---

## 初期セットアップ（新規インストール）

### Step 1: GAS プロジェクトを作成

1. [Google Apps Script](https://script.google.com) を開く
2. 「新しいプロジェクト」を作成
3. 「プロジェクトの設定」からスクリプト ID を控える

### Step 2: マスタースプレッドシートを作成

1. Google スプレッドシートを新規作成
2. シート「英単語」を作成（列: id, english, pronunciation, japanese, audio）
3. シート「英文」を作成（列: id, text, pronunciation, japanese, audio）
4. URL からスプレッドシート ID を控える（`/d/` と `/edit` の間の文字列）

> 英単語の id は 1〜10000、英文の id は 10001〜 を使用する。

### Step 3: ルートフォルダを作成

1. Google Drive にアプリ用のフォルダを作成（例:「英単語アプリ」）
2. URL からフォルダ ID を控える

### Step 4: Script Properties を設定

GAS エディタの「プロジェクトの設定」→「スクリプト プロパティ」で以下を追加:

| プロパティ名 | 必須 | 説明 |
|---|:---:|---|
| `ENGLISHWORDS_FOLDER_ID` | ✅ | Step 3 で作成したフォルダ ID |
| `ENGLISHWORDS_SHEET_ID` | ✅ | Step 2 で作成したスプレッドシート ID |
| `TEACHER_ACCESS_KEY` | ✅ | 教師用ページのアクセスキー（任意の文字列）※GASエディタから手動設定 |
| `GITHUB_BASE_URL` | ✅ | 音声ファイルの GitHub ベース URL |
| `VOCABULARY_FOLDER_ID` | | 手動設定不要（`ENGLISHWORDS_FOLDER_ID` 保存時に自動同期） |
| `HOMEPAGE_URL` | | アプリのホームページ URL |
| `STUDENT_HOMEPAGE_URL` | | 生徒向けホームページ URL |
| `GOOGLE_CLOUD_TTS_API_KEY` | | Google Cloud TTS API キー（音声自動生成用） |
| `GITHUB_TOKEN` | | GitHub PAT（音声ファイルアップロード用、repo スコープ） |

> **補足:** 初回デプロイ後は教師用ページの「⚙️ 設定」タブからほとんどのプロパティを設定できます（`TEACHER_ACCESS_KEY` は設定タブ非対応のため GAS エディタから手動設定が必要）。

### Step 5: 年度リソースを初期化

GAS エディタで以下の関数を実行する:

```js
initializeAllResources('2026年度版')
```

この関数が自動で以下を作成する:
- 年度フォルダ（例:「2026年度版」）
- 教科書スプレッドシート（新教科書版・旧教科書版・入試対策編）
- 各学年シート（中学1年・中学2年・中学3年）
- レッスン順序シート
- 入試対策用シート（通常・不規則動詞①・不規則動詞②）

> べき等設計のため、何度実行しても安全（既存リソースはスキップされる）。

### Step 6: デプロイ

1. GAS エディタで「デプロイ」→「新しいデプロイ」
2. 種類: 「ウェブアプリ」
3. 次のユーザーとして実行: 「自分」
4. アクセスできるユーザー: 「全員」
5. デプロイ URL を控える

---

## アクセス URL

### 生徒用（発音練習）— デフォルト
```
https://script.google.com/macros/s/〈デプロイID〉/exec
```

### 教師用（エディター）
```
https://script.google.com/macros/s/〈デプロイID〉/exec?key=〈TEACHER_ACCESS_KEY の値〉
```

> **注意:** 教師用 URL は生徒に教えないこと。パラメータなしの URL は生徒用ページを表示する。

### デプロイ URL の確認方法

1. [Google Apps Script](https://script.google.com) を開く
2. スクリプト ID `1JuDkNKc2Nq-5NE2ZXPKACuroWgBhzqQVED0ioPDdVGuXsICiS3xesO8e` のプロジェクトを開く
3. 「デプロイ」→「デプロイを管理」→ ウェブアプリの URL を確認

---

## 新年度の追加

GAS エディタで以下を実行するだけ:

```js
initializeYearResources('2027年度版')
```

必要なフォルダ・スプレッドシート・シートがすべて自動作成される。

---

## 自動デプロイ（GitHub Actions）

`claude/*` ブランチに push すると自動的にデプロイされる:

1. `merge-to-master.yml` — master へ自動マージ
2. `deploy.yml` — GAS への自動デプロイ（`.js`/`.html` 変更時のみ）

**必要な GitHub Secrets:**
- `CLASPRC_JSON` — clasp 認証情報
- `GAS_DEPLOYMENT_ID` — GAS デプロイメント ID
