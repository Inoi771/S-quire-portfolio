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
├── subcode.js            # 生徒向けサブバックエンド（約485行）※ GAS 未デプロイ
├── editor.html           # 教師用エディタ UI（約8500行）
├── index.html            # 生徒用発音練習 UI（約976行）
├── appsscript.json       # GAS マニフェスト（OAuthスコープ・タイムゾーン等）
├── .clasp.json           # clasp 設定（scriptId）
├── .claspignore          # GAS プッシュ除外ファイル一覧
└── .github/workflows/
    └── deploy.yml        # GitHub Actions 自動デプロイ設定
```

### 重要な注意点
- `subcode.js` は `.claspignore` に含まれており **GAS にはデプロイされない**（意図的な分離）
- `editor.html` / `index.html` の両ファイルは非常に大きい（8500行・976行）。編集時は対象箇所を絞って Read すること

---

## デプロイ・開発フロー

### 自動デプロイ（通常の方法）
1. `master` ブランチに push する
2. GitHub Actions が起動 → `clasp push --force` で GAS に自動反映
3. 続いて GAS の Deployment が更新される（`GAS_DEPLOYMENT_ID` Secret 使用）

### デプロイ設定
- GAS Script ID: `.clasp.json` の `scriptId` を参照
- タイムゾーン: `Etc/GMT-9`（JST）
- 実行ユーザー: `USER_DEPLOYING`（デプロイしたユーザーとして実行）
- アクセス: `ANYONE_ANONYMOUS`（認証不要で誰でもアクセス可能）

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
年度（Year）
  └── 教科書（Textbook）: 新教科書版 / 旧教科書版
        └── 学年（Grade）: 中学1年 / 中学2年 / 中学3年
              └── レッスン（Lesson）
```

### Google Sheets 構造
- **「英単語」シート** — 単語マスターデータ（48セルレイアウト）
- **「英文」シート** — 英文マスターデータ
- 各レッスンのデータは Google Drive フォルダ内のスプレッドシートで管理

### Script Properties（設定値）
| キー | 内容 |
|------|------|
| `VOCABULARY_FOLDER_ID` | 語彙データのGoogle DriveフォルダID |
| `GITHUB_BASE_URL` | 音声ファイルのGitHub ベースURL |
| `HOMEPAGE_URL` | アプリのホームページURL |

---

## 重要な設計パターン

### 48セルレイアウト
`getAllWordsAndSentences()` などでシートを読み込む際、48セルの厳密なレイアウト検証が行われる。シートの列構成を変更する際は注意。

### キャッシュ（subcode.js）
`CacheService` で1時間 TTL のキャッシュを使用。生徒向けデータは頻繁な変更がないことを前提としている。

### 不規則動詞（福田データ）
- `isFukisoku(lessonName)` でレッスンが不規則動詞かどうか判定
- `saveFukisokuData()` / `loadFukisokuData()` で専用処理
- 原形・過去形・過去分詞の3形式を管理

### 音声ファイル URL 構築
音声ファイルは GitHub にホストされ、URL はタイムスタンプ付きで構築される（キャッシュバスター）。

---

## よく使う関数（code.js）

| 関数 | 役割 |
|------|------|
| `doGet(e)` | エントリポイント・ルーティング |
| `getEditorYears()` | 年度一覧取得 |
| `getEditorTextbooks()` | 教科書一覧取得 |
| `getEditorGrades()` | 学年一覧取得 |
| `getEditorLessons()` | レッスン一覧取得 |
| `getAllWordsAndSentences()` | 単語・英文マスターデータ取得 |
| `saveLessonData()` | レッスンデータ保存 |
| `generateAndSavePdf()` | PDF語彙リスト生成・保存 |
| `determineLayoutType()` | レッスンのレイアウト種別判定 |
| `isFukisoku()` | 不規則動詞レッスン判定 |

---

## 作業時の注意事項

1. **大きなファイルを Read する際はオフセットと行数を指定する**
   - `editor.html` は8500行あるため、全読みは避ける
   - `code.js` も4400行あるため、対象関数を Grep で探してから Read する

2. **GAS 固有の制限**
   - GAS の実行時間制限は6分（長い処理は分割が必要）
   - `UrlFetchApp`, `SpreadsheetApp`, `DriveApp` 等の GAS サービスを使用
   - `console.log()` ではなく `Logger.log()` または `console.log()`（V8では両方可）

3. **デプロイ対象の確認**
   - `.claspignore` で除外されているファイルを変更した場合、GAS には反映されない
   - `subcode.js` の変更は手動で別途 GAS プロジェクトに反映が必要（または `.claspignore` から削除）

4. **日本語コンテンツ**
   - シート名・学年名・教科書名はすべて日本語
   - ファイル内のコメントも日本語が混在している

---

## Git・デプロイ規則（重要）

### 基本ワークフロー
**ユーザーから修正依頼 → コード修正 → `claude/xxx` ブランチへプッシュ → GitHub Actions が自動デプロイ → アプリに反映**

ユーザーは何もしなくてよい。Claude がすべて完結させる。

### ブランチルール
- Claude エージェント環境は **セキュリティ上の制約** により `claude/` で始まるブランチにしかプッシュできない（`master` への直接プッシュは HTTP 403）
- ブランチ名: `claude/<作業内容>-<セッションID末尾>` 形式
- `git push -u origin claude/<branch-name>` で完了

### 自動デプロイの仕組み
`claude/*` または `master` へのプッシュで GitHub Actions (`.github/workflows/deploy.yml`) が自動起動：

1. `clasp push --force` — コードを Google Apps Script へ転送
2. `clasp deploy` — GAS のデプロイメントを更新（`GAS_DEPLOYMENT_ID` Secret 使用）

**必要な GitHub Secrets（リポジトリ管理者が設定済み）:**
| Secret 名 | 内容 |
|---|---|
| `CLASPRC_JSON` | clasp 認証情報（`~/.clasprc.json` の内容） |
| `GAS_DEPLOYMENT_ID` | GAS のデプロイメント ID |

### Claude が毎回すること
1. `claude/<task>-<sessionId>` ブランチで作業
2. 修正が完了したら `git push -u origin <branch-name>`
3. GitHub Actions のデプロイが自動実行される（ユーザー操作不要）
