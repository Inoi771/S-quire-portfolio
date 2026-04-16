# S-quire

> **読み方:** スクワイア
> **名前の由来:** 「Square（個別指導スクエア）」＋「Esquire（従者・見習い騎士）」の造語。塾名を含みつつ、生徒を支える存在という意味を込めています。

学習塾向けダッシュボードアプリ（Google Apps Script 製）

このアプリは個別指導スクエアの **全スタッフ（講師）** が日常業務で使用します。
管理者だけでなく、ITに不慣れなスタッフもスマートフォンで操作するため、UIはシンプルで直感的である必要があります。

---

## このアプリでできること

- **月間スケジュール** — 学校・塾の行事予定をカレンダー表示。PDF/CSV/Google Sheets から Gemini AI で自動取り込み。春期・夏期・冬期講習は日程締切日（T日）と理科・社会の日程締切日（T-7日）の2段階でマーカー表示
- **成績管理** — 生徒情報の登録・編集・削除、成績入力、AI OCR による一括取り込み、AI成績分析・生徒別分析
- **講習管理** — 講習期間・料金の設定、校舎別週間タイムグリッドで日程作成、カレンダーエクスポート（ICS/Googleカレンダー）、保護者向け配布物PDF生成、AIチラシ自動生成・Imagen画像生成
- **資料** — 年間カレンダー生成・PDF出力、料金表の管理・PDF出力
- **設定** — テーマカラー、表示名・担当教科の変更、LINE通知方法の設定、引き継ぎコード発行
- **管理（Admin のみ）** — ユーザーアクセス管理、スクリプトプロパティ管理、Drive操作、固定イベント管理、通常授業・講習設定、LINEスケジューラー自動送信（全体ミーティング・回数報告書・室長用連絡・春期/夏期/冬期講習の日程締切2段階通知）、AIナレッジベース管理
- **AI アシスタント** — Gemini に質問・設定変更の依頼が可能（ナレッジベースの情報を参照して回答）

---

## 仕組みの全体像

```
あなた（日本語で話しかけるだけ）
        ↓
 Claude Code（AI がコードを編集）
        ↓
 GitHub（コードを保存・管理）
        ↓  ← ここが自動！（GitHub Actions）
 Google Apps Script（GAS）
        ↓
 ブラウザでアプリを確認するだけ
```

- **Claude Code** = AI アシスタント。日本語で「こうして」と伝えるとコードを書いてくれる
- **GitHub** = コードの保管場所。変更履歴も残る。Claude が書いたコードを自動でここに送る
- **GitHub Actions** = GitHub に登録できる「自動作業ロボット」。コードが届いたら GAS へ自動転送してくれる
- **Google Apps Script（GAS）** = Googleが提供するプログラム実行環境。スプレッドシートと連携できるアプリを作れる

---

## ファイル構成

```
MyProject/
├── code.js               定数・doGet/doPost・ヘルパー関数
├── auth.js               認証・ロール管理
├── schedule.js           スケジュール管理・基礎学力テスト日程
├── grades.js             成績マスタ設定CRUD
├── students.js           生徒CRUD・成績データ
├── analysis.js           AI成績分析・生徒別AI分析
├── settings.js           設定・プロフィール・Gemini使用量
├── admin.js              Admin API・初期化・ユーティリティ
├── line.js               LINE通知・LINEスケジューラー
├── features.js           AIアシスタント・料金表・講習管理
├── backup.js             Firestoreバックアップ（定時自動実行）
├── index.html            HTMLシェル（画面構造）
├── styles.html           CSS（スタイル定義）
├── js-core.html          JS: 初期化・タブ制御・スケジュール・設定
├── js-grades.html        JS: 成績管理
├── js-grades-list.html   JS: 成績一覧表
├── js-grades-placement.html JS: 進学先
├── js-grades-report-pdf.html JS: 成績表PDF出力
├── js-lectures.html      JS: 講習管理
├── js-lectures-admin.html JS: 通常設定・講習設定
├── js-lectures-materials.html JS: 内部配布物
├── js-lectures-flyer.html JS: 外部チラシ
├── js-lectures-imagen.html JS: 画像生成
├── js-pricing.html       JS: 料金表・年間カレンダー
├── js-admin.html         JS: Admin管理・LINEスケジューラー
├── js-admin-ext.html     JS: Admin続き・固定イベント・AIアシスタント
├── js-admin-lec-deadline.html JS: 講習日程締切管理
├── js-ai-actions.html    JS: AIアシスタント アクション実行
├── js-admin-chatbot.html JS: チャットボット管理
├── gas-bridge.html       JS: google.script.run → fetch() 変換シム
├── firebase.js           Firestore REST APIクライアント
├── firebase-init.html    Firebase 初期化
├── firebase-auth.html    Firebase Auth管理
├── firebase-schedule.html Firebase スケジュール・講習クライアント
├── firebase-students.html Firebase 生徒データクライアント
├── appsscript.json       GAS の設定ファイル（権限・タイムゾーン等）
├── .clasp.json           GASプロジェクトとの紐付け設定（スクリプトID）
├── .github/
│   └── workflows/
│       ├── deploy-to-gas.yml   自動デプロイの設定（GitHub Actions）
│       └── merge-to-main.yml   claudeブランチをmainへ自動マージ
├── CLAUDE.md             Claude（AI）向けの設計書・指示書（詳細はこちら）
└── README.md             このファイル
```

> 詳細なファイル構成・関数一覧・データ構造は `CLAUDE.md` を参照してください。

---

## 日常の使い方（セットアップ完了後）

1. Claude Code を開く
2. 日本語で「○○してほしい」と伝える
3. Claude がコードを修正して GitHub に送る
4. 1〜2分後にアプリを開いて確認する

**それだけです。コードを書く必要はありません。**

---

---

# 初回セットアップ完全ガイド

> ここからは**新しいプロジェクトをゼロから作る場合**の手順です。
> すでにセットアップが完了しているプロジェクトでは不要です。

---

## 事前に必要なもの

| 必要なもの | 説明 |
|-----------|------|
| Google アカウント | Gmail のアカウント。GAS・Google Drive の操作に必要 |
| GitHub アカウント | [github.com](https://github.com) で無料登録できる |
| パソコン | Windows / Mac どちらでもOK。初回のみ作業が必要 |
| Node.js | パソコンにインストールするツール（後述）。初回のみ必要 |

---

## ステップ1: GAS プロジェクトを作る

### 1-1. Google Apps Script を開く

ブラウザで [https://script.google.com](https://script.google.com) を開く。
Google アカウントでログインした状態で「新しいプロジェクト」をクリック。

### 1-2. スクリプト ID を確認する

プロジェクトが開いたら、ブラウザの URL を見る：

```
https://script.google.com/home/projects/【ここがスクリプトID】/edit
```

この長い文字列（例: `1-cACamYh4J8n3S4Zm0OJQySKOLId1Ds3cCPLGIH6HXxHHhmQzknajVzy`）をメモしておく。

### 1-3. Drive API を有効にする

左側の「サービス」横の「＋」をクリック → 「Drive API」を探して選択 → 追加。

---

## ステップ2: GitHub リポジトリを作る

### 2-1. 新しいリポジトリを作成する

[https://github.com/new](https://github.com/new) を開いて：
- **Repository name**: 好きな名前（例: `my-gas-app`）
- **Public / Private**: どちらでもOK（Private のほうが安全）
- 「Create repository」をクリック

### 2-2. リポジトリの URL を確認する

作成後のページに `https://github.com/あなたのユーザー名/リポジトリ名` という URL が表示される。これをメモしておく。

---

## ステップ3: 必要なファイルを準備する

以下のファイルをリポジトリに作成する。Claude Code を使う場合は「このファイルを作って」と伝えるだけでOK。

### 3-1. `.clasp.json`（GASとの紐付け）

```json
{
  "scriptId": "←ステップ1-2でメモしたスクリプトIDに書き換える",
  "rootDir": "./"
}
```

### 3-2. `appsscript.json`（GASの基本設定）

```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {
    "enabledAdvancedServices": [
      {
        "userSymbol": "Drive",
        "serviceId": "drive",
        "version": "v2"
      }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE_ANONYMOUS",
    "executeAs": "USER_DEPLOYING"
  }
}
```

> ※ `oauthScopes` は使う機能に応じて増やす（Gmail 送信や LINE 通知を使うなら追加が必要）。

### 3-3. `.github/workflows/deploy-to-gas.yml`（自動デプロイの設定）

```yaml
name: GASへ自動デプロイ

on:
  push:
    branches:
      - main
      - 'claude/**'
    paths:
      - '*.js'
      - '*.html'
      - 'appsscript.json'
      - '.github/workflows/*.yml'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: コードを取得
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Node.js をセットアップ
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: clasp をインストール
        run: npm install -g @google/clasp

      - name: 認証情報を作成
        run: |
          cat > ~/.clasprc.json << 'CLASPRC'
          {
            "tokens": {
              "default": {
                "type": "authorized_user",
                "client_id": "REDACTED_CLIENT_ID",
                "client_secret": "REDACTED_CLIENT_SECRET",
                "refresh_token": "${{ secrets.CLASP_REFRESH_TOKEN }}"
              }
            }
          }
          CLASPRC

      - name: GASへプッシュ
        run: clasp push --force

      - name: デプロイバージョンを更新（/exec URLに反映）
        run: |
          DEPLOY_ID="←ステップ7でメモしたデプロイIDに書き換える"
          clasp deploy --deploymentId "$DEPLOY_ID" -d "Auto deploy $(date '+%Y-%m-%d %H:%M')"

      - name: 古いデプロイを自動削除（上限対策）
        run: |
          FIXED_DEPLOY_ID="←ステップ7でメモしたデプロイIDに書き換える"
          clasp deployments 2>&1 | grep -oE 'AKfyc[A-Za-z0-9_-]+' | while IFS= read -r id; do
            if [ "$id" != "$FIXED_DEPLOY_ID" ]; then
              clasp undeploy "$id" || true
            fi
          done

      - name: mainに自動マージ（claudeブランチの場合のみ）
        if: startsWith(github.ref, 'refs/heads/claude/')
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git fetch origin main
          git checkout -B main origin/main
          git merge -X theirs --no-ff --allow-unrelated-histories origin/${{ github.ref_name }} -m "自動マージ: ${{ github.ref_name }} → main"
          git push --force-with-lease origin main
```

---

## ステップ4: CLASP_REFRESH_TOKEN を取得する（最重要）

> これが一番難しいステップです。**初回のみ**行えば、以後は不要です。

### 4-1. Node.js をインストールする

[https://nodejs.org/ja](https://nodejs.org/ja) を開いて「LTS版」をダウンロード・インストール。
インストール後、ターミナル（またはコマンドプロンプト）を開いて確認：

```bash
node -v
# → v20.x.x のように表示されればOK
```

### 4-2. clasp をインストールする

ターミナルで以下を実行：

```bash
npm install -g @google/clasp
```

### 4-3. Google アカウントにログインする

```bash
clasp login
```

実行するとブラウザが開く。GAS に使う Google アカウントでログインして「許可」をクリック。
「Logged in! You may close this tab.」と表示されたらOK。

### 4-4. リフレッシュトークンを取り出す

ログインが完了すると、パソコンの隠しファイルに認証情報が保存される。

**Mac / Linux の場合：**
```bash
cat ~/.clasprc.json
```

**Windows の場合：**
```
type %USERPROFILE%\.clasprc.json
```

表示された内容の中から `"refresh_token"` の値（`"1//..."` から始まる長い文字列）をコピーする：

```json
{
  "tokens": {
    "default": {
      ...
      "refresh_token": "1//←この部分をコピーする"
    }
  }
}
```

> ⚠️ このトークンは**パスワードと同じくらい大切な情報**です。他人に見せないこと。

---

## ステップ5: GitHub シークレットに登録する

> シークレット = GitHub に安全に保管できる「秘密の値」。コードに直接書かずに済む。

1. GitHub のリポジトリページを開く
2. 上部の「**Settings**」タブをクリック
3. 左メニューの「**Secrets and variables**」→「**Actions**」をクリック
4. 「**New repository secret**」ボタンをクリック
5. 以下の通り入力して「Add secret」をクリック：

| 項目 | 入力値 |
|------|--------|
| Name | `CLASP_REFRESH_TOKEN` |
| Secret | ステップ4-4でコピーしたトークン |

---

## ステップ6: GitHub Actions の権限を設定する（403エラー対策）

> これをしないと Claude が変更をプッシュしたとき「403 エラー」が出てデプロイが失敗します。

1. GitHub のリポジトリページを開く
2. 上部の「**Settings**」タブをクリック
3. 左メニューの「**Actions**」→「**General**」をクリック
4. 下にスクロールして「**Workflow permissions**」セクションを探す
5. 「**Read and write permissions**」を選択（デフォルトは Read only なので変更が必要）
6. 「**Allow GitHub Actions to create and approve pull requests**」にチェックを入れる
7. 「**Save**」ボタンをクリック

---

## ステップ7: GAS の初回デプロイを行ってデプロイ ID を固定する

> デプロイ ID = アプリの URL に対応する固有番号。これが変わるとアプリの URL も変わってしまう。
> 一度作ってしまえば以後は変更不要。

### 7-1. コードを GAS にアップロードする

ステップ3で作ったファイルを GitHub にプッシュすると自動で GAS へ転送される。
または、ターミナルで以下を実行：

```bash
clasp push --force
```

### 7-2. GAS エディタでウェブアプリとしてデプロイする

1. [https://script.google.com](https://script.google.com) でプロジェクトを開く
2. 右上の「**デプロイ**」→「**新しいデプロイ**」をクリック
3. 「種類の選択」で「**ウェブアプリ**」を選ぶ
4. 以下の通り設定する：

| 項目 | 設定値 |
|------|--------|
| 説明 | （何でもOK。例: `初回デプロイ`） |
| 次のユーザーとして実行 | **自分**（デプロイしたアカウント） |
| アクセスできるユーザー | **全員** |

5. 「**デプロイ**」をクリック
6. 「ウェブアプリ URL」と「デプロイ ID」が表示される。**デプロイ ID をコピーしてメモする**

デプロイ ID の例：
```
AKfycbyqwdCCeypXH5A-JjK6zphkAYRs4m5CIUySzKcn7dlKqZXF-1jKKT7U4YXmJl1xgquCqQ
```

### 7-3. ワークフローファイルにデプロイ ID を書き込む

ステップ3-3 で作った `.github/workflows/deploy-to-gas.yml` の中の
`←ステップ7でメモしたデプロイIDに書き換える` という部分（2箇所）を、コピーしたデプロイ ID に書き換える。

---

## ステップ8: GAS スクリプトプロパティを設定する

> スクリプトプロパティ = アプリの設定値を安全に保管する場所（コードに直接書かない）。

1. GAS エディタを開く
2. 左側の歯車アイコン「**プロジェクトの設定**」をクリック
3. 下にスクロールして「**スクリプトプロパティ**」セクションを探す
4. 「**プロパティを追加**」で以下を登録する：

| プロパティ名 | 内容 | 取得方法 |
|------------|------|---------|
| `APP_FOLDER_ID` | Google Drive のフォルダ ID | Drive でフォルダを開き URL の `folders/` の後の文字列 |
| `GEMINI_API_KEY` | Gemini API キー | [Google AI Studio](https://aistudio.google.com/apikey) で取得 |
| `ADMIN_EMAILS` | 管理者のメールアドレス | 自分の Gmail アドレス（例: `you@gmail.com`） |

> `APP_FOLDER_ID` は必須。これがないとアプリのデータが保存できません。

### Google Drive のフォルダ ID の確認方法

1. [drive.google.com](https://drive.google.com) でアプリ用のフォルダを作る（または既存フォルダを使う）
2. そのフォルダを開いたときの URL を確認：
   ```
   https://drive.google.com/drive/folders/【ここがフォルダID】
   ```
3. `folders/` の後の文字列をコピーして `APP_FOLDER_ID` に登録する

---

## ステップ9: CLAUDE.md を書く（Claude への指示書）

> CLAUDE.md = Claude Code が毎回セッション開始時に自動で読む「このプロジェクトのルール書き」。
> ここに書いた内容を Claude は必ず守る。

### 最低限書くべき内容

```markdown
# アプリ名 — プロジェクト設計書

## このプロジェクトについて

| 項目 | 内容 |
|------|------|
| GitHub リポジトリ | ✅ 設定済み（`あなたのユーザー名/リポジトリ名`） |
| デプロイ先ブランチ | ✅ `claude/` で始まるブランチへのプッシュで自動デプロイ |
| clasp（GAS連携ツール） | ✅ GitHub Actions が自動でインストール・実行（ローカル不要） |
| Google認証 | ✅ `CLASP_REFRESH_TOKEN` シークレットで管理済み（ログイン不要） |
| GASプロジェクトID | ✅ `.clasp.json` に記載済み（変更不要） |
| デプロイID（固定） | ✅ `ここにデプロイIDを書く`（ワークフローに直接書いてある・変更不要） |
| 自動デプロイ | ✅ git push → 約1〜2分でアプリに反映 |

**Claudeがやることは「コードを編集して git push するだけ」。**
ユーザーに clasp のインストール・ログイン・手動デプロイを案内することは禁止。

## ユーザーへのコミュニケーションルール

- 常に**日本語**で返答する
- 専門用語は平易な言葉で補足する
- 作業完了後は「何を変えたか」を箇条書きで報告する

## アプリの目的

（ここにアプリが何をするものか書く。例:「個別指導塾向けの業務管理アプリ」）

## ファイル構成と役割

（どのファイルが何をするか書く）

## データ保存先

（スプレッドシートの構造や Drive フォルダの構成を書く）
```

### Claude に伝えると便利な情報

| 情報 | なぜ役立つか |
|------|------------|
| アプリの用途・対象ユーザー | 機能提案が的外れにならない |
| 使用しているスプレッドシートの列構成 | データ読み書きのコードが正確になる |
| 実装済みの機能一覧 | 重複実装を防げる |
| 未実装・将来やりたい機能 | 見越した設計を提案してくれる |
| 操作してほしくないファイル・設定 | 意図しない変更を防げる |

---

## ステップ10: 動作確認

### 10-1. コードを GitHub にプッシュする

ターミナルで：

```bash
git add .
git commit -m "初回セットアップ"
git push origin main
```

### 10-2. GitHub Actions の動作を確認する

1. GitHub のリポジトリページを開く
2. 上部の「**Actions**」タブをクリック
3. 実行中のワークフローが表示される（黄色のぐるぐる = 実行中、緑のチェック = 成功、赤のバツ = 失敗）

### 10-3. アプリを開く

GAS エディタで確認した「ウェブアプリ URL」（`https://script.google.com/macros/s/デプロイID/exec`）をブラウザで開く。

---

## よくあるエラーと対処法

### ❌ GitHub Actions が「403」エラーで失敗する

**原因:** GitHub Actions に書き込み権限が与えられていない。

**対処:** ステップ6をやり直す。
- Settings → Actions → General → Workflow permissions → **Read and write permissions** を選択

---

### ❌ `clasp push` が失敗する / 認証エラーが出る

**原因:** `CLASP_REFRESH_TOKEN` が正しく登録されていない、またはトークンが期限切れ。

**対処:**
1. ステップ4をやり直してトークンを再取得する
2. GitHub シークレットの値を新しいトークンで上書きする（ステップ5）

---

### ❌ アプリを開いても変更が反映されていない

**原因:** デプロイ ID が間違っている、またはワークフローのデプロイ手順が失敗している。

**対処:**
1. Actions タブでワークフローのログを確認する
2. `.github/workflows/deploy-to-gas.yml` の `DEPLOY_ID` がステップ7でメモした値と一致しているか確認する

---

### ❌ GAS エディタで「権限のエラー」が出る

**原因:** `appsscript.json` に書いた `oauthScopes` に追加があった場合、再承認が必要。

**対処:** アプリ URL（`/exec`）を Google アカウントでログインした状態で開き、「追加の権限を許可する」画面で承認する。

---

### ❌ スクリプトプロパティが保存できない / 読み込めない

**原因:** `APP_FOLDER_ID` が未設定、または Drive フォルダが存在しない。

**対処:** ステップ8を確認し、Drive フォルダ ID が正しく登録されているか確認する。

---

## セットアップ後のチェックリスト

```
□ .clasp.json にスクリプト ID が設定されている
□ deploy-to-gas.yml にデプロイ ID が設定されている（2箇所）
□ GitHub シークレットに CLASP_REFRESH_TOKEN が登録されている
□ GitHub Actions の権限が「Read and write permissions」になっている
□ GAS スクリプトプロパティに APP_FOLDER_ID が登録されている
□ CLAUDE.md にアプリの情報と自動デプロイ設定済みの旨が書かれている
□ GitHub Actions が緑のチェック（成功）になっている
□ アプリ URL（/exec）をブラウザで開けることを確認した
```

すべてにチェックが入ったら、あとは Claude に日本語で話しかけるだけで開発が進みます。

---

## Firestore コレクション構成

| コレクション | DocId形式 | 用途 |
|------------|---------|------|
| ~~`staffs`~~ | — | **Supabaseに移行済み** |
| `allowedUsers` | `{email}` | セキュリティルール用ホワイトリスト |
| `config` | `notification_routing` | システム設定（校舎別通知振り分け等） |
| `students` | `{campus2}{year4}{grade2}{seq2}` | 生徒情報 |
| `grades` | `{studentId}_{testName}` | 成績データ |
| `schoolAverages` | `{year}_{testName}` | 学校別平均点 |
| `testAnalysis` | `{year}_{testName}` | テスト全体AI分析 |
| `studentAnalysis` | `{studentId}_{testName}` | 生徒別AI分析 |
| `distCache` | `{year}_{testName}_dist` | 成績分析の分布キャッシュ |
| `schedules` | `{year}_admin_{ms}` / `{year}_{school}_{type}_{date}` | 月間スケジュール |
| `lectureEntries` | `{lectureId}_{campusCode}_{entryId}` | 講習日程 |
| `lineSchedules` | `sch_{YYYYMM}_{type}` | LINEスケジューラー |
| `flyerAi` | `{lectureId}_{campusCode}` | AIチラシHTML |
| `imageTags` | `{driveFileId}` | チラシ用画像タグ |
| `operationLogs` | `log_{ms}_{random5}` | 操作ログ |
| ~~`aiLearnedKnowledge`~~ | — | **Supabaseに移行済み** |
| ~~`gradesMeta`~~ | — | **廃止（Supabase SQL集計で代替）** |
| ~~`gradeSummaries`~~ | — | **廃止（Supabase SQL集計で代替）** |
| ~~`gradeListCache`~~ | — | **廃止（GAS API経由で取得）** |
| ~~`gradeReportCache`~~ | — | **廃止（GAS API経由で取得）** |

> 詳細なフィールド構成は `DATA.md` を参照してください。

---

## 技術情報

| 項目 | 内容 |
|------|------|
| 実行環境 | Google Apps Script（V8 ランタイム） |
| フロントエンド | HTML + CSS + JavaScript |
| データ保存先 | Google スプレッドシート / Google Drive |
| AI 機能 | Gemini API（gemini-3.1-flash-lite-preview）・Imagen 4.0 Ultra |
| Firestore | クライアント直接読み書き＋allowedUsersホワイトリストによるアクセス制御 |
| Firebase Auth | Googleアカウントによるユーザー認証 |
| 自動デプロイ | GitHub Actions + clasp |

詳細な設計情報は `CLAUDE.md` を参照してください。
