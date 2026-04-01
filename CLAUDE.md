# S-quire — プロジェクト設計書

> このファイルは Claude Code が毎回セッション開始時に自動で読み込む設計書です。
> ユーザーは更新タイミングを気にしなくてよい。Claude が下記ルールに従い自動で更新する。

---

## 0. Claude への自動実行ルール（必読）

### 🚨 このプロジェクトについての大前提（新しいセッションで必ず確認すること）

**このプロジェクトは、すべての設定がすでに完了しています。**
Claude がやることは「コードを編集して git push するだけ」です。
それ以外のセットアップ作業は一切発生しません。

| 状態 | 詳細 |
|------|------|
| GitHub リポジトリ | ✅ 設定済み（`square1995/S-quire`） |
| デプロイ先ブランチ | ✅ `claude/` で始まるブランチへのプッシュで自動デプロイ |
| clasp（GAS連携ツール） | ✅ GitHub Actions が自動でインストール・実行（ローカル不要） |
| Google認証 | ✅ `CLASP_REFRESH_TOKEN` シークレットで管理済み（ログイン不要） |
| GASプロジェクトID | ✅ `.clasp.json` に記載済み（変更不要） |
| GASデプロイID（LINE/API用・固定） | ✅ `AKfycbzrzZkyS42v_-kNNrmR4NumrVxfjdwNeJ0uCk3k5mha88Dm7ZarVzjVAkDY8WIqpKybWw`（ANYONE_ANONYMOUS・変更不要） |
| アプリURL | ✅ `https://fir-quire.web.app`（Firebase Hosting） |
| 自動デプロイ | ✅ git push → GAS: 約1〜2分で反映 / Firebase Hosting: 約2〜3分で反映 |

**ユーザーに「claspをインストールしてください」「ログインしてください」「GASエディタでデプロイしてください」などを案内することは絶対に禁止。**

---

### ユーザーへのコミュニケーションルール

**このアプリの開発者はプログラミング完全初心者であり、日本語でやりたいことを伝えることしかできない。以下のルールに必ず従うこと。**

| ルール | 内容 |
|--------|------|
| 返答言語 | 常に**日本語**で返答する |
| 専門用語 | 避ける。使う場合は必ず平易な言葉で補足する |
| 作業報告 | 作業完了後は「何を変えたか」を箇条書きで、技術的詳細より**ユーザーへの影響**を中心に説明する |
| エラー報告 | エラーが発生した場合は「何が起きたか」「どうすればよいか」を日本語で簡潔に説明する |
| 画面上のテキスト | 画面に表示する説明・ラベル・リンクはユーザーに必要な情報のみに限定する。技術的な詳細（外部サービスのリンク・API名・内部処理の説明など）は表示しない。**ただし管理タブ内は例外**として、管理者向けの技術情報を含めてよい |

---

### 確認が必要なケース（作業前にユーザーに聞くこと）

**以下の場合は作業を始める前にユーザーに確認すること：**

| 状況 | 例 |
|------|-----|
| 要求が曖昧で複数の実装方法がある | 「どんな見た目にしますか？」「AとBどちらにしますか？」 |
| 既存の動作を変更する可能性がある | 「この変更をすると〇〇の動作が変わりますが大丈夫ですか？」 |
| データの削除・リセットを伴う | 「この操作は元に戻せませんが続けますか？」 |

**確認不要で自動実行してよいケース：**
- コードのバグ修正（明らかなミス）
- git バックアップの作成
- CLAUDE.md の更新

---

### 自動化の提案ルール（積極的に提案すること）

**ユーザーはプログラミング初心者のため、自動化できる可能性に気づいていないことが多い。Claude は作業の中で自動化の余地を見つけたら、作業完了後に積極的に提案すること。**

#### 提案すべき自動化の例

| 気づきのきっかけ | 提案内容の例 |
|----------------|------------|
| ユーザーが毎回手動で行っている操作がある | 「この操作は時間トリガーで自動化できます」 |
| データが定期的に古くなる性質のもの | 「毎日自動更新するキャッシュにできます」 |
| 複数ステップを踏んでいる操作 | 「ボタン1つでまとめて実行できるようにできます」 |
| 入力ミスが起きやすそうな箇所 | 「バリデーション（入力チェック）を追加できます」 |
| 同じデータを複数の画面で使っている | 「1か所更新するだけで全体に反映させられます」 |

#### 提案の書き方

作業完了の報告の後に、以下の形式で提案する：

```
💡 **自動化の提案**
○○を自動化することができます。
・現状: 〜〜〜（手動でやっていること）
・改善案: 〜〜〜（どう変わるか）
・メリット: 〜〜〜（ユーザーへの具体的なメリット）
やってみますか？
```

**提案は押しつけない。「やってみますか？」と聞いて、ユーザーの判断に委ねること。**

---

### スマートフォン操作性の提案ルール（積極的に提案すること）

**このアプリはスマートフォンでの利用が主である。Claude はコードを変更する際、モバイルでの使いやすさに気を配り、改善できる点があれば作業完了後に積極的に提案すること。**

#### 提案すべきモバイルUX改善の例

| 気づきのきっかけ | 提案内容の例 |
|----------------|------------|
| 画面を切り替える操作がある | 「スワイプ（横にスライド）で切り替えられるようにできます」 |
| ボタンが小さい・密集している | 「スマートフォンで押しやすいサイズに大きくできます」 |
| 入力フォームが多い画面 | 「入力欄をスマートフォン向けに縦並びに整理できます」 |
| テキストが小さくて読みにくい可能性がある | 「文字サイズをスマートフォン向けに調整できます」 |
| スクロールが深い画面 | 「よく使う操作をページ上部にまとめられます」 |
| 画面遷移が多い | 「戻るボタンや固定ナビゲーションを追加できます」 |

#### 提案の書き方

作業完了の報告の後に、以下の形式で提案する：

```
📱 **スマートフォン操作性の提案**
○○をスマートフォンでより使いやすくできます。
・現状: 〜〜〜
・改善案: 〜〜〜
・メリット: 〜〜〜
やってみますか？
```

**提案は押しつけない。「やってみますか？」と聞いて、ユーザーの判断に委ねること。**

---

**GitHub Actions による自動デプロイが設定済み。** コピー＆ペーストは不要。

---

#### ⚠️【最重要】ローカル環境へのセットアップは一切不要

**以下のことを Claude は絶対にやってはいけない・ユーザーに求めてはいけない：**

| 禁止事項 | 理由 |
|---------|------|
| `npm install -g @google/clasp` の実行 | clasp は GitHub Actions 側で自動インストールされる |
| `clasp login` の実行 | 認証情報は GitHub シークレット（`CLASP_REFRESH_TOKEN`）で管理済み |
| `.clasprc.json` の作成・編集 | GitHub Actions が自動生成する |
| `clasp push` の手動実行 | GitHub へのプッシュで自動的にトリガーされる |
| GAS エディタを開いての手動デプロイ | 不要。`/exec` URL には自動で反映される |
| ユーザーへの「claspをインストールしてください」案内 | 完全に自動化済みのため不要 |

**Claude がやるべきことは「コードを編集して git push するだけ」。それ以外は不要。**

---

#### 自動化の仕組み
1. Claude が `code.js` / `index.html` / `appsscript.json` のいずれかを修正してGitHubにプッシュする
2. GitHub Actions が自動的に検知して以下を実行する（Claude は何もしなくてよい）：
   - `npm install -g @google/clasp`（clasp のインストール）
   - `~/.clasprc.json` の作成（認証情報セット）
   - `clasp push --force`（GASへのコードアップロード）
   - `clasp deploy`（`/exec` URL への反映）
   - `clasp undeploy`（固定ID以外の古いデプロイを自動削除 ← GAS上限20件対策）
3. 約1〜2分でGASの `/exec` URLに反映される
4. ユーザーはアプリを開いて確認するだけでよい

#### 現在の設定状態（設定済み・変更不要）
| 項目 | 状態 |
|------|------|
| 自動デプロイ | ✅ 設定済み・動作確認済み |
| clasp インストール | ✅ GitHub Actions が毎回自動実行（ローカル不要） |
| Google 認証 | ✅ `CLASP_REFRESH_TOKEN` シークレットで管理済み（手動ログイン不要） |
| デプロイ種別 | ウェブアプリ（ライブラリではない） |
| アクセス権限 | 全員（Googleアカウント不要） |
| 実行アカウント | デプロイしたユーザー（オーナー） |
| Drive API | ✅ 有効化済み（PDF OCRに使用） |

#### 関連ファイル（すべて設定済み・編集不要）
| ファイル | 役割 |
|---------|------|
| `.github/workflows/deploy-to-gas.yml` | 自動デプロイのワークフロー定義（clasp インストールも含む） |
| `.clasp.json` | GASプロジェクトとの紐付け設定（設定済み・変更不要） |
| `appsscript.json` | GASマニフェスト（ウェブアプリ設定・API有効化） |

#### ⚠️【重要】GASデプロイIDは固定値を使うこと（ANYONE_ANONYMOUS・1つのみ）

Firebase Hosting 移行後、GASデプロイは**1つのみ**（LINE Webhook・Firebase API兼用）。

| 項目 | 値 |
|------|-----|
| GASデプロイID | `AKfycbzrzZkyS42v_-kNNrmR4NumrVxfjdwNeJ0uCk3k5mha88Dm7ZarVzjVAkDY8WIqpKybWw` |
| 用途 | LINE Webhook受信 ＋ Firebase HostingからのAPIコール |
| アクセス設定 | **全員（ANYONE_ANONYMOUS）** — Googleアカウント不要 |
| アプリURL（ユーザー向け） | `https://fir-quire.web.app`（Firebase Hosting） |
| LINE Webhook URL | `https://script.google.com/macros/s/AKfycbzrzZkyS42v_-kNNrmR4NumrVxfjdwNeJ0uCk3k5mha88Dm7ZarVzjVAkDY8WIqpKybWw/exec` |

**Claude がやってはいけないこと：**
- `clasp deploy`（IDなし）で新規デプロイを作ること → 不要なデプロイが増える
- ワークフロー内の `DEPLOY_ID` を動的に取得しようとすること → 誤ったIDを拾う場合がある
- 上記のデプロイIDを変更・削除すること
- **`appsscript.json` が ANYONE のまま `clasp deploy --deploymentId AKfycbzrzZkyS42v...` を実行すること** → アクセス設定が ANYONE に上書きされLINEとFirebase APIが401エラーになる（ワークフローは必ず一時的に ANYONE_ANONYMOUS に変更してから deploy し、その後元に戻す）

**ANYONE_ANONYMOUSデプロイのルール（絶対に守ること）：**
- ワークフロー（`deploy-to-gas.yml`）の「ANYONE_ANONYMOUSデプロイを更新」ステップが毎回正しく処理する
- もしGASエディタで「アクセスできるユーザー」が「Googleアカウントを持つ全員」になっていたら、即座に「全員」に戻すこと（LINEとFirebase APIが動かなくなっている）

##### `.clasp.json` の内容（設定済み・変更不要）
```json
{
  "scriptId": "1INhrY1K41tbSel-KrCCpPbZvJ12A-nCP6WuU5jNLOFee-OXNngwdnNjC",
  "rootDir": "./"
}
```
このファイルはGitリポジトリに含まれており、GASプロジェクトとの接続は完了済み。
`scriptId` の変更・`clasp login` の実行・新たな認証操作は一切不要。

#### GitHubシークレット（設定済み）
| シークレット名 | 内容 |
|--------------|------|
| `CLASP_REFRESH_TOKEN` | Google OAuth リフレッシュトークン（GitHub Actions が使用。手動設定不要） |

#### プッシュ後の報告文ルール（必ず使い分けること）

変更したファイルによって GitHub Actions の動作が異なる。ユーザーへの報告文を必ず使い分けること。

| 変更したファイル | GAS デプロイ | main マージ | ユーザーへの報告文 |
|----------------|------------|-----------|-----------------|
| `.js` `.html` `appsscript.json` `.github/workflows/*.yml` を**含む** | ✅ 実行される | ✅ 実行される | 「GitHubにプッシュしました。1〜2分後にアプリに反映されます。」 |
| `README.md` `CLAUDE.md` `.gitignore` 等**のみ** | ❌ 実行されない | ✅ 実行される | 「GitHubにプッシュしました。今回はアプリのコードに変更がないためデプロイは実行されませんが、変更は自動で main ブランチに保存されます。」 |
| 上記の両方を同時に変更 | ✅ 実行される | ✅ 実行される | 「GitHubにプッシュしました。1〜2分後にアプリに反映されます。」 |

**補足ルール：**
- CLAUDE.md のみ更新した場合 → 「デプロイなし・main への保存あり」のケース。「1〜2分後にアプリに反映されます」と案内するのは誤りなので絶対に使わないこと
- ユーザーが「デプロイしてほしい」と明示したが変更ファイルがトリガー対象外の場合 → `code.js` の末尾にコメント（例: `// 更新 YYYY-MM-DD`）を1行追加してデプロイを発火させること

**仕組みの説明（Claude が理解しておくこと）：**
- `merge-to-main.yml` — `claude/*` ブランチへの**あらゆるプッシュ**で起動。ファイル種別を問わず main へ自動マージする
- `deploy-to-gas.yml` — `.js`/`.html`/`appsscript.json`/`.github/workflows/*.yml` が変更されたときのみ起動。GAS へのデプロイを担当

#### Claude が作業完了後に毎回行うこと
1. 変更内容をユーザーに日本語で報告する
2. 上記の「プッシュ後の報告文ルール」に従って適切な案内文を使う
3. `.js` `.html` `appsscript.json` `.github/workflows/*.yml` を含む変更をプッシュした場合、CLAUDE.md の「GASデプロイカウンター」を +1 して更新する
   - カウンターが **180以上** の場合: 警告文を CLAUDE.md に追記/維持し、ユーザーへ「現在 N回目のデプロイです。⚠️ GASプロジェクトの履歴が限界に近づいています。GASエディタの『デプロイを管理』から古いバージョンを削除してください。削除後に『削除しました』とお知らせください。」と口頭でも報告する
   - カウンターが **180未満** の場合: 警告不要
   - ユーザーが「削除しました」と伝えた場合のみ: カウンターを 1 にリセットし、警告コメントを削除して CLAUDE.md をプッシュする

**以下は絶対にやってはいけない（自動化済みのため不要）：**
- 手動コピー＆ペーストをユーザーに案内すること
- GASエディタでのデプロイ操作をユーザーに案内すること
- clasp のインストール・ログインをユーザーに求めること
- scriptId を聞いたり確認したりすること（`.clasp.json` に設定済み）
- 認証状態を確認・設定しようとすること（GitHub Actionsが自動処理）

#### appsscript.json の内容（変更時は必ずこの状態を維持すること）
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
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE",
    "executeAs": "USER_DEPLOYING"
  }
}
```

**`oauthScopes` の各権限の意味：**
| スコープ | 用途 |
|---------|------|
| `spreadsheets` | 成績・生徒データの読み書き |
| `drive` | Google Drive フォルダ・ファイル操作 |
| `gmail.modify` | お問い合わせメールの検索・ラベル付け |
| `gmail.send` | 通知メールの送信 |
| `script.external_request` | Gemini API・LINE API などへの通信 |
| `script.scriptapp` | 時間トリガーの作成・管理（自動転送機能に必要） |
| `userinfo.email` | ログインユーザーのメールアドレス取得 |

**⚠️ `oauthScopes` を変更した場合の注意：**
新しいスコープを追加・削除した後は、アプリのオーナーがアプリURL
（`/exec`）を Google アカウントでログインした状態で開き、
「追加の権限を許可する」画面で承認する必要がある。

---

### 【最優先】大きな変更前の自動バックアップ（gitコミット）

**以下に該当する作業を開始する前に、必ずユーザーへの確認なしに git コミットを作成すること。**

| バックアップが必要な作業 |
|------------------------|
| 新しい機能の追加 |
| 既存機能の大幅な修正・リファクタリング |
| 関数の削除・リネーム |
| ファイル構造・データ構造の変更 |
| 複数ファイルにまたがる変更 |

**コミットの手順：**
1. `git add code.js index.html CLAUDE.md` で対象ファイルをステージング
2. 以下の形式でコミットメッセージを作成して実行する

```
作業前バックアップ: [これから行う作業の内容]

例：
作業前バックアップ: 講習管理機能の追加前
作業前バックアップ: 成績データ構造の変更前
作業前バックアップ: switchSubTab バグ修正前
```

3. コミット後「バックアップを作成しました（コミット: ○○）」とユーザーに報告してから作業を開始する

**バックアップが不要なケース（スキップしてよい）：**
- コメント・JSDoc のみの変更
- CLAUDE.md のみの更新
- 誤字修正などの軽微な変更

---

### 参照ファイルの自動読み込みルール

**以下のファイルは Claude が自分で判断して読み込む。ユーザーへの確認は不要。**

| ファイル | 読み込むタイミング |
|---------|-----------------|
| `FUNCTIONS.md` | 既存関数を呼び出す・修正する・新関数をリストに追加する前 |
| `BUGS.md` | 新機能を実装する前（Sheets書き込み・JSON処理・非同期処理・UI追加を含む場合は必ず） |

---

### CLAUDE.md の自動更新ルール

**Claude はコード編集を完了した後、以下のいずれかに該当する場合、ユーザーへの確認なしに CLAUDE.md を自動で更新すること。**

### 更新が必要なトリガー

| トリガー | 更新箇所の目安 |
|---------|--------------|
| 新しい関数を `code.js` に追加した | セクション10（全関数リスト）に追記 |
| 既存の関数を削除・リネームした | セクション10から削除・修正 |
| 関数の引数・戻り値が変わった | セクション10の該当行を修正 |
| 新しいタブ・サブタブを追加した | セクション8（index.html 構造）を修正 |
| Drive のフォルダ構成が変わった | セクション4（Drive フォルダ構成）を修正 |
| スプレッドシートの列構成が変わった | セクション6（データ構造）を修正 |
| 新しいスクリプトプロパティを追加した | セクション5（スクリプトプロパティ）に追記 |
| 未実装だった機能を実装した | セクション11（未実装機能）から削除 |
| 新たな設計判断・制約が生じた | セクション9または13に追記 |
| バグ修正で既存の動作仕様が変わった | 該当箇所を修正 |

### 更新が不要なケース（スキップしてよい）
- コメントや JSDoc だけの変更
- コードの内部ロジック変更で、関数名・引数・動作仕様が変わらないもの
- バグ修正で外から見た動作が変わらないもの

### 更新時の注意
- 更新後、「CLAUDE.md を更新しました（理由: ○○）」と一言ユーザーに報告すること
- 大幅な構造変更の場合は、更新内容の概要も添えること

---

## GASデプロイカウンター

**現在のデプロイ回数: 21**

> GASプロジェクト履歴の上限は200件。180回に達したら下記の警告が表示される。

<!-- 180回以上になったら以下の警告を追記/維持すること:
**⚠️ 警告: デプロイ回数が180回に達しました。GASプロジェクトの履歴を削除してください！**
**GAS エディタ → 左端のメニュー →「プロジェクト履歴」→ 下のごみ箱マークで古いバージョンを削除してください。**
**削除が完了したら「削除しました」と教えてください。カウントを1にリセットします。**
**このまま放置すると200回でデプロイ不能になります。**
-->

---

## 1. アプリ概要

| 項目 | 内容 |
|------|------|
| アプリ名 | S-quire |
| アプリURL | `https://fir-quire.web.app` |
| 種別 | Firebase Hosting（フロント） + Google Apps Script（バックエンドAPI） |
| 用途 | **個別指導スクエア**（個別指導塾）向け業務管理ダッシュボード |
| 運営主体 | 個別指導スクエア（学校ではなく学習塾。個別指導形式） |
| バージョン | 1.0.0 |
| 言語 | JavaScript (GAS) / HTML / CSS |

> ⚠️ このアプリは**学校**向けではなく「**個別指導スクエア**」という**個別指導塾**のために開発・運用されている。
> Claude は「学校」ではなく「塾」「スクエア」「個別指導スクエア」として認識・回答すること。

### できること
- **月間スケジュール** — 学校・塾の行事予定をカレンダー表示。PDF/CSV/Google Sheets から Gemini AI で自動抽出・登録も可能
- **成績管理** — 生徒情報の登録・編集・削除（ソフトデリート）、成績入力、Gemini OCR による一括取り込み
- **設定** — テーマカラー、プロフィール（表示名・担当教科・AIアシスタント名）
- **管理（Admin のみ）** — スクリプトプロパティ管理、Drive ファイル操作、ログ閲覧、手動初期化
- **AI アシスタント** — ヘッダーのウィジェットから Gemini に質問・設定変更依頼

---

## 2. ファイル構成

```
MyProject/
├── code.js              定数・doGet/doPost・include()ヘルパー（約300行）
├── auth.js              認証・ロール管理（セクション2、約550行）
├── schedule.js          スケジュール管理・基礎学力テスト・公立平均点（セクション4+13+14、約960行）
├── grades.js            成績マスタ設定CRUD（セクション7、約650行）
├── students.js          生徒CRUD・成績データ（セクション8、約1720行）
├── analysis.js          AI成績分析・生徒別AI分析（セクション8-B、約860行）
├── settings.js          設定・プロフィール・引き継ぎ・Gemini使用量（セクション5+6+16+17、約900行）
├── admin.js             Admin API・初期化・ユーティリティ（セクション10+11+12、約1860行）
├── line.js              LINE通知・LINEスケジューラー（セクション15+18、約1470行）
├── features.js          AIアシスタント・料金表・講習管理・通常授業設定（セクション9+19+20+21、約1960行）
├── index.html           HTMLシェル（body構造 + includeタグ、約2100行）
├── styles.html          CSS（メインスタイル + アニメーション、約1500行）
├── js-core.html         JS: グローバル変数・初期化・タブ制御・スケジュール・設定・プロフィール（【1】〜【6】、約1900行）
├── js-lectures.html          JS: 講習管理タブ（約1570行）
├── js-lectures-admin.html    JS: 管理タブ 通常設定・講習設定（initNormalConfigAdmin・initLecturesAdmin 等、約810行）
├── js-lectures-materials.html JS: 内部配布物サブタブ（保護者向けPDF生成、約390行）
├── js-lectures-flyer.html    JS: 外部チラシサブタブ（Gemini AIチラシHTML生成・チャットUI・画像管理・直接編集・A4 PDF出力、約950行）
├── js-lectures-imagen.html   JS: 画像生成サブタブ（Imagen 4.0 Ultra AI画像生成・履歴表示、約170行）
├── js-pricing.html      JS: 料金表・年間カレンダー（約1420行）
├── js-grades.html       JS: 成績管理・分析（【7】+【8-B】、約1590行）
├── js-grades-list.html  JS: 一覧表タブ（約1310行）
├── js-grades-placement.html JS: 進学先タブ（中3生の基礎学力テスト成績＋進学先一覧、約180行）
├── js-admin.html        JS: Admin管理・LINEスケジューラー・ユーティリティ（【8】、約990行）
├── js-admin-ext.html    JS: Admin続き・固定イベント・AIアシスタント（【9】〜【10】、約2180行）
├── js-admin-lec-deadline.html JS: 管理タブ 講習日程締切管理（initLectureDeadlineDatesAdmin 等、約190行）
├── js-ai-actions.html   JS: AIアシスタント アクション実行・ナビゲーション・確認フロー（約280行）
├── js-admin-chatbot.html JS: チャットボット管理（AIナレッジベースCRUD、約200行）
├── gas-bridge.html      JS: google.script.run → fetch() 変換シム（Firebase Hosting用。GAS環境では何もしない）
├── firebase.js          Firestore REST APIクライアント（認証・CRUD・クエリ・バッチ書き込み）
├── migrate.js           スプレッドシート→Firestore 一括移行スクリプト（移行完了済み・削除不要）
└── CLAUDE.md            この設計書
```

### バックエンド（.js ファイル）の設計
- GAS では全 `.js` ファイルが同じグローバル名前空間を共有する
- `code.js` に定数を `var` で宣言（`const` はファイルスコープのため使用禁止）
- 関数はどのファイルからでも呼び出し可能（import/export 不要）
- `doGet()` でアプリを配信し、クライアントからは `google.script.run` 経由で関数を呼び出す

### フロントエンド（.html ファイル）の設計
- `doGet()` が `HtmlService.createTemplateFromFile('index').evaluate()` で配信
- `index.html` 内の `<?!= include('filename') ?>` で CSS・JS ファイルを読み込む
- `include()` ヘルパー関数が `code.js` に定義されている
- クライアント側の UI ロジック、タブ制御、グラフ描画などを担当

---

## 3. 技術スタック

| 技術 | 用途 |
|------|------|
| Google Apps Script | サーバーサイド処理エンジン |
| HtmlService | HTML を Web アプリとして配信 |
| SpreadsheetApp | スプレッドシートへのデータ読み書き |
| DriveApp | Google Drive フォルダ・ファイル操作 |
| PropertiesService | 設定値の永続化（スクリプト/ユーザー単位） |
| UrlFetchApp | Gemini API 呼び出し |
| Utilities.base64Encode | ロゴ・ファビコンを base64 で配信 |
| DocumentApp + Drive.Files.copy | PDF OCR（Google Docs 経由） |
| Gemini API (gemini-3.1-flash-lite-preview) | スケジュール抽出・成績OCR・AIアシスタント |

---

## 4. Google Drive フォルダ構成

アプリは `APP_FOLDER_ID` スクリプトプロパティで指定されたルートフォルダを起点にする。

```
[ルートフォルダ] (APP_FOLDER_ID)
├── 月間スケジュール/
│   ├── 2024/
│   │   └── 2024年度_予定データ.gs  （シート名: 予定一覧）
│   └── 2025/
│       └── 2025年度_予定データ.gs
├── 成績管理/
│   ├── 2024/
│   │   └── 2024年度_成績データ.gs  （シート名: 成績一覧 / 学校別平均点 / AI分析 / 生徒別AI分析）
│   └── 2025/
│       └── ...
├── 講習管理/      （将来実装予定・現在はプレースホルダー）
├── 高校別進学先/   （将来実装予定・現在はプレースホルダー）
├── 設定/
│   └── システム設定.gs  （シート: 操作ログ / システム情報 / LINEスケジューラー / チラシAI）
├── 生徒マスタ/    ← サブフォルダ内に管理（ルート直下への書き込み制限を回避）
│   └── 生徒マスタ.gs  （シート名: 生徒一覧）
├── 配布物/         ← 内部配布物タブで「Driveに保存」した際に自動作成
│   └── {lectureId}/    （例: 2025-summer）
│       └── {campusCode}/  （例: 01）
│           └── *.pdf   ← 生成した配布物PDFが保存される
└── assets/
    ├── logo.png    ← ヘッダーのロゴ画像
    └── favicon.png ← ファビコン
```

---

## 5. スクリプトプロパティ（設定値）

### PROP_KEYS（`PropertiesService.getScriptProperties()`）
| キー | 内容 |
|------|------|
| `GEMINI_API_KEY` | Gemini API キー（AIアシスタント・OCR・スケジュール抽出に必要） |
| `APP_FOLDER_ID` | Google Drive ルートフォルダのID（これが設定されていないと全機能が動かない） |
| `THEME_COLOR` | UIテーマカラー（デフォルト: `#43e97b`） |
| `ADMIN_EMAILS` | Adminユーザーのメール（カンマ区切り） |
| `ACCESS_FOLDER_ID` | アクセス許可フォルダID（このフォルダのオーナー・編集者がアプリ利用可能。設定済みの場合は APP_FOLDER_ID より優先） |
| `BASIC_TEST_DATES` | 基礎学力テスト日程の上書き設定（JSON: `{"2025-1": "2025/10/01", ...}`） |
| `BASIC_TEST_DETAILS` | 基礎学力テスト詳細テキストの上書き設定（JSON: `{"2025-1": "中3 全員", ...}`） |
| `PUBLIC_HIGH_EXAM_DATES` | 公立高校一般選抜の日程上書き設定（JSON: `{"2025": "2026/03/11"}`。キーは学年年度、値は試験1日目の日付） |
| `JUKU_EVENT_OVERRIDES` | 塾内部イベント（○□★△）上書き設定（JSON: `{"report_2025_4": {"date":"2025/4/21","details":""}, ...}`） |
| `CLOSED_DAYS_OVERRIDES` | 予定タブ専用の休校日上書き設定（JSON: `{"add":["YYYY-MM-DD",...], "del":[...]}`） |
| `HOLIDAY_CACHE` | 祝日キャッシュ（JSON: `{"YYYY-MM-DD": "祝日名", ...}`。`scheduledInitializeSheets()` が毎日更新） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API チャンネルアクセストークン（LINE Official Account Manager で取得） |
| `LINE_USER_MAPPING` | LINE User ID マッピング（JSON: `{"teacherId": "LINE_USER_ID", ...}`。Webhook で自動登録） |
| `NOTIFICATION_METHODS` | 通知方法設定（JSON: `{"teacherId": "gmail"/"line"/"both"/"none", ...}`） |
| `CAMPUS_NOTIFICATION_ROUTING` | 校舎別通知振り分け設定（JSON: `{"campusCode": ["teacherId1", "teacherId2"], ...}`。管理者が設定） |
| `LINE_SCHEDULER_SETTINGS` | LINEスケジューラーの種別ごとデフォルト設定（JSON: `{"shitsucho":{"recipients":[],"messageTemplate":"","sendHour":14},"meeting":{...},"report":{...}}`。meeting/reportは受信者不要（全LINE登録ユーザーに自動送信）） |
| `LINE_SCHEDULER_NOTIF_PREFS` | LINE通知スケジューラーのユーザー別・種別別通知方法設定（JSON: `{"teacherId": {"meeting": "line"/"gmail"/"both"/"none", "report": "...", "shitsucho": "..."}}`。デフォルト（未設定時）: `"line"`） |
| `GEMINI_TEAM_DAILY_DATE` | Gemini API使用量トラッキング（チーム全体）：今日の日付（リセット判定用） |
| `GEMINI_TEAM_DAILY_CALLS` | Gemini API使用量トラッキング（チーム全体）：今日の呼び出し回数（LockServiceで排他更新） |
| `GEMINI_TEAM_DAILY_TOKENS` | Gemini API使用量トラッキング（チーム全体）：今日の合計トークン数 |
| `GEMINI_TEAM_MONTHLY_KEY` | Gemini API使用量トラッキング（チーム全体）：今月のキー（リセット判定用） |
| `GEMINI_TEAM_MONTHLY_CALLS` | Gemini API使用量トラッキング（チーム全体）：今月の呼び出し回数 |
| `GEMINI_TEAM_MONTHLY_TOKENS` | Gemini API使用量トラッキング（チーム全体）：今月の合計トークン数 |
| `FLYER_ALL_CONFIGS` | チラシ設定の一括保存（JSON: `{"lectureId_campusCode": {catchcopy, deadline, contact, appealPoints, bgPattern, imageLayout, imageFileId}, ...}`） |
| `FORM_EMAIL_SENDER` | フォームメール自動転送の送信元フィルター（未設定時デフォルト: `noreply@web-cms.jp`） |
| `AI_KNOWLEDGE_BASE` | AIナレッジベース（JSON: `[{id, category, content, updatedAt}]`。管理タブから登録した塾の情報。AIアシスタントのプロンプトに注入される） |
| `LECTURE_DEADLINE_OVERRIDES` | 講習日程締切の手動上書き設定（JSON: `{"2025-summer": "2025-06-15", ...}`。lectureId → YYYY-MM-DD。未設定なら自動計算） |

### CONFIG_PROP_KEYS（成績管理設定）
| キー | 内容 |
|------|------|
| `GRADES_TEST_NAMES_CONFIG` | テスト名リスト（JSON配列） |
| `GRADES_CAMPUS_CODES_CONFIG` | 校舎コード・名前リスト（JSON: `[{code, name}]`） |
| `GRADES_GRADE_CODES_CONFIG` | 【非推奨】学年コード・名前リスト。学年は `code.js` の `GRADES` 定数で固定管理。表示切替は `GRADES_VISIBLE_CONFIG` を使用 |
| `GRADES_VISIBLE_CONFIG` | 表示する学年コードのJSON配列（例: `["13","14","15"]`）。未設定時は全12学年を表示 |
| `GRADES_SCHOOL_CONFIG` | 志望校リスト（JSON: `[{name, departments:[]}]`） |
| `PRICING_TABLE_CONFIG` | 料金表データ（JSON: `{title, sections:[], footerNotes:[]}`） |
| `LECTURE_PERIODS_CONFIG` | 講習期間設定（JSON: `[{id, name, startDate, endDate, gradeSettings}, ...]`。IDは `{fiscalYear}-{typeId}` 形式（例: `2026-spring`）。6種類固定（spring/summer/kiso1/kiso2/winter/nyushi）の自動計算日程が手動上書きされた場合のみ保存される） |
| `LECTURE_PRICING_CONFIG` | 講習別料金設定（JSON: `{typeId: [{label, internal, external}, ...], ...}`。typeId は spring/summer/kiso1/kiso2/winter/nyushi。internal/external は税抜き金額（数値）。年度をまたいで共通で使用される） |
| `NORMAL_CLASS_CONFIG` | 通常授業設定（JSON: `[{grade, duration, count, internal, external}, ...]`。grade は 小1〜小6・中1〜中3・高1〜高3。duration はスロット数（×10分）。internal/external は税抜き金額） |

### UserProperties（`PropertiesService.getUserProperties()`）
ユーザーごとに保存される（ログインしているアカウント単位）
| キー | 内容 |
|------|------|
| `DISPLAY_NAME` | 表示名 |
| `SUBJECTS` | 担当教科（JSON配列） |
| `TEACHER_ID` | 講師ID（自動生成: `T{timestamp}_{random}`） |
| `REGISTERED_EMAIL` | 登録メールアドレス |
| `PROFILE_UPDATED` | プロフィール最終更新日時 |
| `AI_ASSISTANT_NAME` | AIアシスタントの名前（未設定時デフォルト: `イノイマン`） |
| `AI_PERSONALITY` | AIアシスタントの喋り方（`polite` / `friendly` / `energetic` / `cool` / `kansai` / `hakata` / `tohoku` / `nagoya` / `awa`。未設定時デフォルト: `polite`） |
| `USER_THEME_COLOR` | ユーザー個別のテーマカラー（16進数。未設定時はスクリプトプロパティ `THEME_COLOR` → `#43e97b` の順でフォールバック） |
| `PREFERRED_CAMPUSES` | 配属校舎コードの配列（JSON: `["01","03"]`。未設定時は空配列） |
| `GEMINI_DAILY_DATE` | Gemini API使用量トラッキング：今日の日付（リセット判定用） |
| `GEMINI_DAILY_CALLS` | Gemini API使用量トラッキング：今日の呼び出し回数 |
| `GEMINI_DAILY_TOKENS` | Gemini API使用量トラッキング：今日の合計トークン数 |
| `GEMINI_DAILY_OPS` | Gemini API使用量トラッキング：直近20件の操作一覧（JSON配列） |
| `GEMINI_MONTHLY_KEY` | Gemini API使用量トラッキング：今月のキー（リセット判定用） |
| `GEMINI_MONTHLY_CALLS` | Gemini API使用量トラッキング：今月の呼び出し回数 |
| `GEMINI_MONTHLY_TOKENS` | Gemini API使用量トラッキング：今月の合計トークン数 |

---

## 6. データ構造

### 生徒ID体系
形式: `{校舎CD2桁}{登録年度4桁}{登録学年コード2桁}{連番2桁}`
例: `012025130X` → 校舎01、2025年度登録、学年コード13（中1）、連番01

**学年コード（年齢ベース）:**
小1=07, 小2=08, 小3=09, 小4=10, 小5=11, 小6=12,
中1=13, 中2=14, 中3=15, 高1=16, 高2=17, 高3=18

**年度に応じた学年の動的計算:**
```
現在学年 = 登録学年コード + (現在年度 - 登録年度)
有効範囲: 07〜18（範囲外は自動除外）
```

### 生徒マスタシート列構成（`生徒一覧` シート）
| 列 | 内容 |
|----|------|
| 1 | 生徒ID |
| 2 | 校舎CD |
| 3 | 姓（漢字） |
| 4 | 名（漢字） |
| 5 | 姓ふりがな |
| 6 | 名ふりがな |
| 7 | 学校名 |
| 8 | 削除済み（true/false）← ソフトデリートフラグ |
| 9 | 登録日時（ISO文字列） |
| 10 | 受験校1（中3専用。学校名） |
| 11 | 受験校1学科 |
| 12 | 受験校1合否（"合格" / "不合格"） |
| 13 | 育成型推薦（"true" / "false"） |
| 14 | 受験校2（受験校1が不合格の場合のみ。学校名） |
| 15 | 受験校2学科 |
| 16 | 受験校2合否（"合格" / "不合格"） |

### 成績データシート列構成（`成績一覧` シート）
| 列 | 内容 |
|----|------|
| 1 | 生徒ID |
| 2 | テスト名 |
| 3〜7 | 国語・社会・数学・理科・英語 |
| 8 | 合計点 |
| 9 | 平均点 |
| 10 | 第1志望校名 |
| 11 | 志望1学科 |
| 12 | 第2志望校名 |
| 13 | 志望2学科 |
| 14 | 記録日時 |
| 15 | 氏名 |

### 予定データシート列構成（`予定一覧` シート）
| 列 | 内容 |
|----|------|
| 1 | 更新日時 |
| 2 | 学校名 |
| 3 | 予定種類 |
| 4 | 月日（例: 7月19日） |
| 5 | 詳細 |
| 6 | 情報源 |

---

## 6-B. Firestore コレクション構成（移行完了済み）

> スプレッドシートから Firestore への移行は完了済み。新規データはすべて Firestore に書き込まれる。
> `firebase.js` の CRUD ヘルパー（`firestoreSet_` / `firestoreGet_` / `firestoreQuery_` / `firestoreDelete_` / `firestoreBatchWrite_`）を使うこと。

| コレクション名 | 旧保存先 | 主な DocId形式 | 用途 |
|--------------|---------|--------------|------|
| `students` | 生徒マスタ.gs `生徒一覧` | `{campusCode2}{year4}{gradeCode2}{seq2}` | 生徒情報 |
| `grades` | 成績データ.gs `成績一覧` | `{studentId}_{safe(testName)}` | 成績データ |
| `schoolAverages` | 成績データ.gs `学校別平均点` | `{year}_{safe(school)}_{safe(testName)}` | 学校別平均点 |
| `testAnalysis` | 成績データ.gs `AI分析` | `{year}_{safe(testName)}` | テスト全体AI分析 |
| `studentAnalysis` | 成績データ.gs `生徒別AI分析` | `{studentId}_{safe(testName)}` | 生徒別AI分析 |
| `schedules` | 予定データ.gs `予定一覧` | Admin: `{year}_admin_{ms}` / import: `{year}_{school}_{type}_{date}` | 月間スケジュール |
| `lectureEntries` | 講習管理SS `スケジュール一覧` | `{lectureId}_{campusCode}_{entryId}` | 講習日程エントリ |
| `lineSchedules` | システム設定.gs `LINEスケジューラー` | `sch_{YYYYMM}_{type}` | LINEスケジューラー |
| `flyerAi` | システム設定.gs `チラシAI` | `{lectureId}_{campusCode}` | AIチラシHTML・会話履歴 |
| `imageTags` | システム設定.gs `画像タグ` | `{driveFileId}` | チラシ用画像タグ |
| `operationLogs` | システム設定.gs `操作ログ` | `log_{ms}_{random5}` | 操作ログ（追記のみ） |

### Firestore 利用上の注意
- `firestoreQuery_(collection, [])` で空フィルターを渡すと全件取得
- `sent == false` のような boolean フィルターは `fsFilter_('sent', 'EQUAL', false)` で可能
- 複数フィールドへの複合クエリ（AND）は `Firestore` コンポジットインデックスが必要なため、フィルターは1条件にしてクライアント側で追加フィルタリングすること
- `firestoreQuery_` の結果には `_id` フィールドが自動付加される（`r.document.name.split('/').pop()`）

---

## 7. バックエンド セクション配置

| ファイル | セクション | 内容 |
|---------|-----------|------|
| `code.js` | S1 + S3 | 定数定義（`PROP_KEYS` 等）、`include()`、`doGet()`、`doPost()`、`getAppMetadata()` |
| `auth.js` | S2 | 認証・ロール管理: `isAdmin()`, `getUserRoleInfo()`, `getAdminEmails()` 等 |
| `schedule.js` | S4 + S13 + S14 | スケジュール管理、基礎学力テスト日程、公立平均点 |
| `grades.js` | S7 | 成績マスタ設定 CRUD（テスト名・校舎・学年・志望校） |
| `students.js` | S8 | 生徒 CRUD、成績 upsert、OCR、学校平均、成績表 |
| `analysis.js` | S8-B | AI成績分析（テスト全体）、生徒別AI分析（偏差値・合格判定・一括生成） |
| `settings.js` | S5 + S6 + S16 + S17 | 設定・プロフィール・引き継ぎ・Gemini使用量トラッキング |
| `admin.js` | S10 + S11 + S12 | Admin API、フォルダ・シート初期化、ユーティリティ |
| `line.js` | S15 + S18 | LINE通知、通知ルーティング、LINEスケジューラー |
| `features.js` | S9 + S19 + S20 | AIアシスタント、料金表管理、講習管理 |

**重要**: GAS V8ランタイムでは `const`/`let` はファイルスコープ。定数は `code.js` 内で `var` として宣言し、全ファイルから参照可能にしている。

---

## 8. index.html 構造

### タブ一覧
| タブID | 表示名 | 状態 |
|--------|--------|------|
| `schedule` | 予定 | 実装済み（カレンダー表示） |
| `grades` | 成績管理 | 実装済み（サブタブあり） |
| `lectures` | 講習管理 | 実装済み（日程作成サブタブ：年度/講習選択・校舎チェックボックス・週間タイムグリッド） |
| `universities` | 資料 | 実装済み（サブタブあり） |
| `settings` | 設定 | 実装済み |
| `admin` | 管理 | 実装済み（isAdmin のみ表示） |

### 管理タブ サブタブ
| サブタブID | 表示名 | 内容 |
|-----------|--------|------|
| `admin-users` | 👥 ユーザー管理 | Admin メール管理 |
| `admin-properties` | ⚙️ 設定 | スクリプトプロパティ管理・成績マスタ設定・基礎学力テスト日程管理 |
| `admin-drive` | 📁 Drive | Driveフォルダ探索・PDFアップロード |
| `admin-logs` | 📋 ログ | 実行ログ案内・手動初期化・自動インポート |
| `admin-fixed-events` | 📅 固定イベント | 予定タブ固定イベント管理（塾○□★△・休校日・基礎学力テスト詳細） |
| `admin-normal-config` | 📋 通常設定 | 通常授業の学年別コマ時間・回数・料金設定 |
| `admin-scheduler` | 📩 LINE通知 | LINEメッセージスケジューラー（室長用・ミーティング・報告書の3種別を毎月自動生成・編集・送信） |
| `admin-chatbot` | 🤖 チャットボット | AIアシスタントのナレッジベース管理（カテゴリ別に塾の情報を登録・編集・削除。AIが質問への回答に使用） |
| `admin-guide` | 📖 管理ガイド | スクリプトプロパティ一覧・フォルダ構成・LINE設定手順・固定イベント操作方法・よくある操作（静的コンテンツのみ・code.js変更不要） |
| `admin-lectures-config` | 📚 講習設定 | 講習期間（名前・開始日・終了日）の登録・削除 |

### 講習管理サブタブ
| サブタブID | 表示名 | 状態 |
|-----------|--------|------|
| `lectures-schedule` | 📅 日程作成 | 実装済み（校舎チェックボックス・週間タイムグリッド） |
| `lectures-materials` | 📄 内部配布物 | 実装済み（年度・講習・校舎選択 + 塾生保護者向けPDFダウンロード/印刷） |
| `lectures-flyer` | 🎨 外部チラシ | 実装済み（Gemini AIでA4チラシHTML生成・チャットUI・画像管理・トンボ対応PDF出力・校舎別/共通保存。Google Fonts: Noto Serif JP（見出し明朝体）+ Noto Sans JP（本文ゴシック体）で環境依存なし） |
| `lectures-imagen` | 🖼️ 画像生成 | 実装済み（Imagen 4.0 Ultra でAI画像生成。日本語プロンプト→英語翻訳→画像生成→assets/flyerフォルダに自動保存） |

### 成績管理サブタブ
| サブタブID | 表示名 |
|-----------|--------|
| `grades-score` | ✏️ 成績入力 |
| `grades-list` | 📋 一覧表 |
| `grades-analysis` | 📈 分析 |
| `grades-report` | 📄 成績表 |
| `grades-input` | 📝 情報入力 |
| `grades-placement` | 🎓 進学先 |

### 資料タブ サブタブ
| サブタブID | 表示名 | 状態 |
|-----------|--------|------|
| `univ-calendar` | 📅 カレンダー | 実装済み（年度カレンダー生成） |
| `univ-pricing` | 💰 料金表 | 実装済み（料金表表示・管理者編集・PDF出力） |
| `univ-placement` | 👨‍🏫 講師配置 | スタブ（将来実装） |
| `univ-minutes` | 📝 議事録 | スタブ（将来実装） |

### index.html 主要 JavaScript 関数

> 詳細は `FUNCTIONS.md` を参照（Claude が必要時に自動で読み込む）

## 9. 重要な設計判断

### 【最重要】IDによるデータ管理の設計方針

**このアプリでは、すべての人物・エンティティを「不変のID」で管理する。**
名前・メールアドレスなど変更される可能性のある値を主キーとして使うことは禁止。

#### IDの種類と発行タイミング

| 対象 | ID形式 | 発行タイミング | 保存場所 |
|------|--------|--------------|---------|
| 講師 | `T{timestamp}_{random9文字}` | LINE自己登録・管理者手動追加・初回アプリ起動のいずれか早い方 | ScriptProperties `TEACHER_ID_MAP` + UserProperties `TEACHER_ID` |
| 生徒 | `{校舎CD2桁}{登録年度4桁}{登録学年コード2桁}{連番2桁}` | 生徒登録時（`submitStudentInfo()`） | スプレッドシート「生徒マスタ」 |

#### 講師ID（teacherId）の発行フロー

```
①LINE自己登録（doPost()）
  → getOrCreateTeacherIdForEmail_(email, name) 呼び出し
  → TEACHER_ID_MAP に teacherId 登録（この時点で確定）

②管理者手動追加（addUserAccess()）
  → getOrCreateTeacherIdForEmail_(email, '') 呼び出し
  → TEACHER_ID_MAP に teacherId 登録

③初回アプリ起動（getUserProfile()）
  → getOrCreateTeacherIdForEmail_(registeredEmail, displayName) 呼び出し
  → TEACHER_ID_MAP に既存IDがあればそれを採用（①②と同じIDになる）
  → なければ新規生成
  → UserProperties TEACHER_ID に保存（以後 getOrCreateTeacherId() で取得可能）
```

#### TEACHER_ID_MAP の構造（ScriptProperties）

```json
{
  "T1707123456789_abc123def": { "email": "teacher@example.com", "name": "田中 花子" },
  "T1707123500000_xyz789ghi": { "email": "other@example.com",   "name": "山田 太郎" }
}
```

- `getOrCreateTeacherIdForEmail_(email, name)` でメールアドレスを逆引き検索して既存IDを再利用
- `getTeacherNamesMap()` (@aiCallable) で全ユーザーがこのマップを取得可能
- アプリ起動ごとに `getUserProfile()` が最新の表示名でマップを更新する

#### 新機能を実装するときのルール

1. **人物の参照はIDで行う** — 名前・メールでなくIDを外部キーとして使う
2. **表示名は動的に解決する** — 保存時の名前ではなく、TEACHER_ID_MAP やマスタから毎回引いて表示
3. **IDは一度発行したら変更しない** — 削除・再発行は禁止（ソフトデリート等で対応）
4. **新しいエンティティにもIDをふる** — 将来「校舎」「講習」以外のエンティティを追加する場合も同様

---

### ロゴ・ファビコンの配信方法
Drive の `assets/logo.png` を base64 エンコードして `getSettings()` で返す。
`onSettingsLoaded(settings)` で `if (settings.logoUrl)` が truthy なら `#appLogoImg` に設定。
**ロゴが表示されない場合のチェックリスト:**
1. `APP_FOLDER_ID` スクリプトプロパティが設定されているか
2. そのフォルダに `assets/` サブフォルダが存在するか
3. `assets/logo.png` ファイルが存在するか

### ソフトデリート（論理削除）
生徒の削除は物理削除ではなく、`isDeleted` フラグ（列6）を `true` に設定するだけ。
復元は `restoreStudent()` で同フラグを `false` に戻す。

### 成績データの Upsert パターン
`submitGradeData()` は「生徒ID + テスト名」の組み合わせで既存行を検索し、
あれば行を上書き、なければ `appendRow()` で追加する。

### OCR の補完マージ戦略（`ocrAndSaveGradeSheet()`）
- 既存データがある場合: 0 または空のフィールドのみ OCR 値で補完（既存の有効値は上書きしない）
- 新規の場合: OCR 値をそのまま保存

### 年度の判定ロジック
日本の学年年度（4月始まり）に対応。
```javascript
// 4月以降 → 当該年, 1〜3月 → 前年
if (month >= 4) return year; else return year - 1;
```

### スケジュールの月日処理
1〜3月のデータは「次年度」として扱う。
```javascript
var actualYear = (month >= 1 && month <= 3) ? baseYear + 1 : baseYear;
```

### `doGet()` の注意点
初回アクセス時の初期化（`initializeAllSheets()`）は `doGet()` から削除済み。
理由: 毎回 17秒程度のオーバーヘッドが発生するため。
代替: 時間トリガー（24時間ごと）で `scheduledInitializeSheets()` を実行。

### Admin タブ表示
`checkAdminTabVisibility()` が `getUserRoleInfo()` を呼び出し、
`roleInfo.isAdmin` が `true` のときだけ管理タブを表示する。

### Google Sheets の数値自動変換問題（先頭ゼロの消失）
`setValues()` で `"04"` などの数字文字列を書き込むと、Sheets が自動的に数値 `4` に変換して保存する。
`getValues()` で読み戻したとき `String(4) !== String("04")` となり比較が失敗する。

**影響を受けるコード例：** 校舎コード（`"01"` → `1`）、学年コード（`"13"` → `13`）など先頭ゼロを含む可能性があるすべての数字文字列。

**対策：** Sheets に書き込んで後で比較するコードには必ず `parseInt()` で正規化する。
```javascript
// ❌ 失敗する（"04" !== "4"）
String(rows[i][2]) === String(campusCode)

// ✓ 正しい（4 === 4）
parseInt(rows[i][2], 10) === parseInt(campusCode, 10)
```

**修正済み箇所：**
- `features.js`: `saveLectureScheduleEntries`・`getLectureScheduleEntries`（commit 86ff820）
- `students.js`: `submitStudentInfo`・`getMasterData`（padStart で正規化済み）
- `students.js`: `getDeletedStudents` → studentId と校舎コードの padStart 正規化
- `analysis.js`: `getStudentAnalysis`・`generateStudentAnalyses`・`saveStudentAnalyses_` の existingMap 構築 → padStart で正規化
- `students.js`: `getStudentNameById` → studentId の padStart 正規化（シート値・入力値の両方）
- `students.js`: `getStudentsForDropdown` → campusCode の padStart 正規化
- `students.js`: `updateStudentInfo` → campusCode を padStart + setNumberFormat('@') でテキスト書式設定
- `js-grades-list.html`: `getFilteredListData` → checkedCodes と s.campus の padStart 正規化

### ⚠️【必須チェックリスト】スプレッドシートに生徒ID・校舎コードを書き込む新機能を実装したとき

**同じバグが繰り返し発生しているため、以下のチェックを必ず行うこと。**

スプレッドシートに数字のみの文字列（生徒ID・校舎コード・学年コード）を `appendRow()` / `setValues()` で書き込んで、後で `getValues()` で読み出して比較する場合は、**必ず padStart または parseInt で正規化してから比較すること。**

```javascript
// ✅ 生徒ID（10桁）の正規化パターン
var sid = String(rows[i][0] || '').trim();
if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

// ✅ 校舎コード（2桁）の正規化パターン
var code = String(rows[i][2] || '').trim();
if (/^\d+$/.test(code) && code.length < 2) code = code.padStart(2, '0');
```

実装完了後は必ず上記「修正済み箇所」リストに追記すること。

---

### 「学校平均」の定義
「学校平均」とは、学校別平均点シートにおいて学校名に「平均」と入っているエントリを指す。
個々の生徒が通う学校の平均ではなく、テスト全体の平均点データである。
コード内で学校平均を検索する際は `schoolName.indexOf('平均') !== -1` でマッチングすること。

---

### モバイル対応（zoom スケーリング）
GAS の Web App は仮想ビューポートの問題があり、画面が小さく見える場合がある。
`fitToScreen()` 関数が `window.innerWidth` と `screen.width` を比較し、
ズーム比率を計算して `.app-container` に `zoom` を適用して調整する。

#### 【必須】新しい `position: fixed` 要素を追加するときのルール

`position: fixed` の要素は親の zoom が引き継がれない。
新しいモーダル・オーバーレイ・ドロワーなどを追加した場合は、
**必ず `index.html` の `fitToScreen()` 関数にその要素の補正処理を追加すること。**
追加しないとスマートフォンで位置・サイズがずれて操作できなくなる。

**補正パターン（3種類）：**

| パターン | 対象の条件 | 処理内容 |
|---------|-----------|---------|
| 全画面オーバーレイ | 背景黒幕・全画面UI（`width:100%; height:100%` 等） | `zoom: ratio; width: (100/ratio)vw; height: (100/ratio)vh` |
| センタリングモーダル | `top:50%; left:50%; transform:translate(-50%,-50%)` | `zoom: ratio; width: (元のwidth/ratio)vw; maxWidth: 'none'` |
| 特殊配置 | px 固定のドロワー・上部固定モーダルなど | `zoom: ratio` ＋ px 指定の位置値を `ratio` 倍に換算 |

**現在 `fitToScreen()` で対応済みの要素一覧：**

| 要素ID | パターン |
|--------|---------|
| `aiWidgetOverlay` | 全画面オーバーレイ |
| `schedulerEditOverlay` | 全画面オーバーレイ |
| `lecHelpOverlay` | 全画面オーバーレイ |
| `flyerHelpOverlay` | 全画面オーバーレイ |
| `ocrOverlay` | 全画面オーバーレイ |
| `drawerOverlay` | 全画面オーバーレイ |
| `setupWizard` | 全画面オーバーレイ |
| `splashScreen` | 全画面オーバーレイ |
| `ocrModal` | センタリングモーダル（width 90%） |
| `schedulerEditModal` | センタリングモーダル（width 92%） |
| `lecHelpModal` | センタリングモーダル（width 90%） |
| `flyerHelpModal` | センタリングモーダル（width 90%） |
| `aiWidgetModal` | **zoom なし**（元サイズがモバイルでちょうどよいため除外） |
| `drawerPanel` | **zoom なし**（元サイズがモバイルでちょうどよいため除外） |
| `drawerSwipeZone` | **zoom なし**（元サイズがモバイルでちょうどよいため除外） |
| `appDialogOverlay` | 全画面オーバーレイ |
| `appDialogModal` | センタリングモーダル（width 85%） |
| `toastNotification` | ボトム固定（zoom のみ） |
| `hiddenAdminOverlay` | 全画面オーバーレイ（隠し管理者モード） |
| `hiddenAdminModal` | センタリングモーダル（width 85%）（隠し管理者モード） |

**チェックリスト（新しい `position: fixed` 要素を追加したとき）：**
- 上記の表に要素 ID を追記したか？
- `fitToScreen()` 関数の対応するブロックに追記したか？
- CLAUDE.md のこの一覧表を更新したか？

### マスターデータ削除時の参照チェック（重要）
校舎・学年・テスト名・志望校のマスターデータを削除する際は、既存の生徒データ・成績データがそのコードを使用していないか必ずチェックし、使用中であれば削除を拒否する。

| 削除対象 | チェック対象 | チェック関数 |
|---------|------------|------------|
| 校舎 | 生徒マスタの校舎CD列（列2） | `countStudentsByCampus_()` |
| 学年 | コード内固定（GRADES定数）のため削除不可。表示切替のみ可能 | — |
| テスト名 | 全年度の成績一覧シートのテスト名列（列2） | `countGradesByTestName_()` |
| 志望校 | 全年度の成績一覧シートの志望校列（列10・11） | `countGradesBySchool_()` |

**新しいマスターデータを追加して削除機能を実装する際も、同様の参照チェックを必ず入れること。**

### 講習管理エントリの所有者権限制御
講習管理タブの日程作成グリッドでは、全ユーザーのエントリが表示されるが、操作権限は所有者に限定される。

| 操作 | 一般ユーザー | 管理者（Admin） |
|------|------------|---------------|
| 閲覧 | 全員のエントリを表示（他人のは薄く表示） | 全員のエントリを表示 |
| 選択・移動・削除 | 自分のエントリのみ | 全員のエントリを操作可能 |

**実装箇所：**
- フロントエンド: `onEntryClick()` で `teacherId` を比較し、他人のエントリは選択不可。`renderLecEntries()` で `lec-entry-readonly` CSSクラスを付与（`pointer-events: none`。見た目は自分のエントリと同じ）
- バックエンド: `saveLectureScheduleEntries()` で Admin 以外の場合、既存の他人エントリが改ざん・削除されていないかを検証

### @aiCallable タグ規約
AIアシスタント（`requestAIAssistant()`）がアプリ内の処理を呼び出せるよう、
対象関数の JSDoc に `@aiCallable` タグを付与する。

**ルール：**
- `isAdmin()` チェックが**ない** Web API 関数には `@aiCallable` を付与する
- `isAdmin()` で保護された Admin 専用関数には**付与しない**
- 新規関数を追加する際も同じルールに従うこと

**例：**
```javascript
/**
 * スケジュールデータを取得
 * @aiCallable
 * @return {Array} スケジュール配列
 */
function getScheduleData() { ... }
```

---

## 10. 全関数リスト

> 詳細は `FUNCTIONS.md` を参照（Claude が必要時に自動で読み込む）

---

## 11. 未実装・スタブ機能

| 機能 | 状態 |
|------|------|
| 講習管理タブ > 日程作成 | 校舎チェックボックス・週間タイムグリッド・教科/学年ボタン・エントリ作成/移動/削除/保存/更新 実装済み。エントリのリサイズ・ドラッグ移動は将来実装 |
| 講習管理タブ > 配布物 | 年度・講習・校舎選択、注記テキスト編集、メール送信用PDFダウンロード/印刷 実装済み。今後 他種PDFボタンを追加予定 |
| 資料タブ > 講師配置・議事録 | カレンダーは実装済み。講師配置・議事録はスタブ。Driveフォルダは不要 |
| 分析タブの過去テスト推移グラフ | AI分析コメントとバーチャートは実装済み。テスト間の推移折れ線グラフは将来実装 |

---

## 11-A. Drive フォルダ・シート作成ポリシー（重要）

### 基本方針
**「今の実装で実際に使うものだけを作る」**

機能を新しく実装するときに、そのタイミングで必要なフォルダ・シート作成を追加する。
未実装の機能のためのフォルダ・シートを先に作ることはしない。

### 現在作成しているもの（実装済み機能のみ）

| フォルダ/ファイル | 用途 | 作成関数 |
|---|---|---|
| 月間スケジュール/ + 年度フォルダ + 予定データ.gs | 予定タブで使用 | `initializeScheduleFolder()` |
| 成績管理/ + 年度フォルダ + 成績データ.gs | 成績管理タブで使用 | `initializeGradesFolder()` |
| 設定/ + システム設定.gs | 操作ログの保存 | `initializeSettingsFolder()` |

### 現在作成していないもの（未実装機能）

| フォルダ/ファイル | 未実装機能 | 実装時に追加する関数 |
|---|---|---|
| 講習管理/ + 年度フォルダ + 講習管理.gs | 講習管理タブ | `initializeLecturesFolder()` を init に追加 |
| 高校別進学先/ + 年度フォルダ + 高校別進学先.gs | 資料タブ（講師配置・議事録） | `initializeUniversitiesFolder()` を init に追加 |

### 年度フォルダの作成ルール
- **4〜12月**: 今年度のフォルダのみ作成
- **1〜3月**: 今年度 + 次年度フォルダを作成（カレンダー年 ≠ 年度のため新年度を先取り）
- 毎日深夜の自動実行（`scheduledInitializeSheets()`）で自動的に管理される

### 新機能を実装するときの手順
1. 機能のUI・バックエンドを実装する
2. 必要なフォルダ・シート作成関数を `initializeAllSheets()` と `manualInitializeSheets()` の両方に追加する
3. `checkInitializationStatus()` のフォルダ確認リストにも追加する
4. 管理タブの `checkInitStatus()` 表示にも追加する
5. CLAUDE.md のこのセクションを更新する

---

## 12. コーディング規約（Claude が自動で守ること）

新機能の追加・修正を行う際は、以下の規約に従うこと。ユーザーへの確認は不要。

---

### code.js — セクション構成ルール

#### 既存セクションへの追加
新しい関数を追加するときは、機能の性質に応じて下記のセクションに配置する。

| 追加する機能の性質 | 配置するセクション |
|-------------------|------------------|
| 認証・Admin判定に関するもの | セクション2 |
| スケジュール取得・更新・抽出 | セクション4 |
| 設定の取得・保存 | セクション5 |
| ユーザープロフィール | セクション6 |
| テスト名・校舎・学年などマスター設定 | セクション7 |
| 生徒情報・成績データの読み書き | セクション8 |
| Gemini AI との対話・意図判定 | セクション9 |
| Admin専用のファイル・プロパティ操作 | セクション10 |
| フォルダ・シートの作成・初期化 | セクション11 |
| ユーティリティ・ログ・データ変換など | セクション12 |

#### 新しいセクションを追加するとき
既存の12セクションに収まらない独立した機能群（例: 将来の講習管理機能）を実装する場合は、セクション12の直後に追加し、セクション番号を採番する。

**セクション区切りのフォーマット（必ずこの形式を使う）:**
```javascript
// ========================================
// 【セクション13】○○機能
// ========================================
// 機能の概要説明（1〜2行）
```

---

### code.js — JSDoc の書き方

すべての `function` に JSDoc を付ける。フォーマットは以下を厳守する。

```javascript
/**
 * 関数の説明（何をする関数か、1〜2文で日本語で書く）
 * 必要に応じて補足説明を追加
 * @aiCallable               ← Admin不要のWeb API関数にのみ付与
 * @param {型} 引数名 説明
 * @return {型} 説明
 */
function myFunction(arg) {
```

- 説明・`@param`・`@return` はすべて**日本語**で書く
- `@param` の型は `{string}` `{number}` `{boolean}` `{Array}` `{Object}` `{Folder}` `{Spreadsheet}` など実態に合わせる
- 引数・戻り値がない場合は対応する行を省略してよい

---

### code.js — エラーハンドリングのパターン

すべての公開関数（`google.script.run` から呼ばれるもの）は `try/catch` で囲む。

```javascript
function myFunction(arg) {
  try {
    // 処理
    Logger.log('✓ myFunction: 完了');
    return { success: true, message: '○○しました' };
  } catch (error) {
    Logger.log('❌ myFunctionエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}
```

**Logger.log の絵文字ルール:**
| 絵文字 | 意味 |
|--------|------|
| `✓` | 正常完了 |
| `❌` | エラー発生 |
| `⚠` | 警告（処理は継続） |
| `===...===` | 処理ブロックの開始・終了（大きな処理のみ） |

---

### code.js — 戻り値の形式

**データを返すだけの関数（読み取り専用）:**
```javascript
return [];          // 配列の場合
return null;        // 単一オブジェクトで見つからない場合
```

**処理結果を返す関数（書き込み・更新・削除など）:**
```javascript
// 成功時
return { success: true, message: '○○しました' };
// 成功＋追加データあり
return { success: true, message: '○○しました', studentId: studentId };
// 失敗時（必ず error キーを含める）
return { success: false, error: '理由を日本語で' };
```

**Admin権限チェックのパターン（Admin専用関数の冒頭に必ず入れる）:**
```javascript
if (!isAdmin()) {
  return { success: false, error: 'Admin のみアクセス可能' };
}
```

---

### code.js — 命名規則

| 対象 | 形式 | 例 |
|------|------|-----|
| 関数名 | camelCase | `getScheduleData`, `submitStudentInfo` |
| 定数（グローバル） | UPPER_SNAKE_CASE | `PROP_KEYS`, `TEST_NAMES` |
| ローカル変数 | camelCase | `yearFolder`, `campusCode` |
| エラー変数 | `error` または `e`（ネスト内） | `catch (error)` / `catch (e)` |

---

### index.html — セクション構成ルール

JavaScript 関数はコメントでセクション分けされている。新しい関数を追加するときは対応するセクションコメントの中に入れる。

```javascript
// ===== 【番号】セクション名 =====
```

| セクション番号 | 内容 |
|--------------|------|
| 【1】 | グローバル変数 |
| 【2】 | 初期化関数 |
| 【3】 | タブ制御 |
| 【4】 | スケジュール関連 |
| 【5】 | 設定管理 |
| 【6】 | プロフィール管理 |
| 【7】〜【8】 | 成績管理 |
| 【9】 | AI アシスタント |
| 【10】 | Admin |

---

### index.html — 校舎ドロップダウンの作り方（必須ルール）

**【設計方針】各ユーザーが設定タブで設定した「配属校舎」は、すべての校舎選択欄で常に先頭に表示すること。**
これはユーザーがよく使う校舎をすぐ選べるようにするための設計。
新しくタブや機能を追加して校舎選択欄を作る際も、必ずこのルールに従うこと。

**校舎選択欄を作る際は必ず `buildCampusOptions(campuses, placeholder)` ヘルパーを使うこと。**
直接 `forEach` でオプションを生成することは禁止。
これにより「配属校舎」（`preferredCampuses`）が常に先頭に表示される。

```javascript
// ✅ 正しい書き方
var opts = buildCampusOptions(result.campuses);
document.getElementById('my-campus-select').innerHTML = opts;

// ❌ やってはいけない書き方（配属校舎が先頭に来ない）
result.campuses.forEach(function(c) {
  html += '<option value="' + c.code + '">' + c.name + '</option>';
});
```

`campuses` は `{code, name}` の配列。`campusData`（オブジェクト）から変換する場合:
```javascript
var arr = Object.keys(campusData).map(function(code) { return { code: code, name: campusData[code] }; });
var opts = buildCampusOptions(arr);
```

#### 配属校舎の優先表示を維持するための必須パターン

プロフィール読み込み（`displayProfileInfo()`）で `preferredCampuses` をセットした後は、
**必ず `rebuildCampusDropdowns()` を呼ぶこと**。
これにより、アプリ起動時・プロフィール読み込み時に全校舎ドロップダウンが再描画され、
配属校舎が先頭に来る状態が保たれる。

```javascript
// displayProfileInfo() 内の必須パターン
preferredCampuses = profile.preferredCampuses || [];
renderPreferredCampusCheckboxes();
rebuildCampusDropdowns(); // ← これを忘れると配属校舎が先頭に来ない
```

チェックボックス変更時（`onPreferredCampusChange()`）も保存成功後に `rebuildCampusDropdowns()` を呼ぶこと。

---

### index.html — `google.script.run` のパターン

GAS バックエンドを呼び出す際は必ず `withSuccessHandler` と `withFailureHandler` を両方付ける。

```javascript
google.script.run
  .withSuccessHandler(function(result) {
    // 成功時の処理
  })
  .withFailureHandler(function(err) {
    console.error('エラー:', err);
    // ユーザーへのエラー表示
  })
  .backendFunctionName(arg1, arg2);
```

---

### index.html — 新しいタブを追加するとき

1. HTML 側: `.tab-button` ボタンと対応する `.tab-content` div を既存のタブと同じ構造で追加する
2. JavaScript 側: `switchTab()` 関数内に `else if (tabName === '新タブ名')` のブロックを追加する
3. Admin 専用タブの場合: `checkAdminTabVisibility()` に表示/非表示ロジックを追加する
4. CLAUDE.md セクション8のタブ一覧を更新する

---

### ファイルサイズ制限（2,000行ルール）

**コード編集を完了した後、変更したファイルの行数を確認し、2,000行を超えた場合はセクション境界で分割すること。**

| 項目 | 内容 |
|------|------|
| 上限目安 | 各ファイル **2,000行以下** |
| チェック | 編集完了後に `wc -l` で確認 |
| 分割単位 | セクションコメント（`// ===== 【】 =====`）を境界とする |
| HTML分割 | `<script>...</script>` で包み、`index.html` に `<?!= include() ?>` 追加 |
| JS分割 | 新ファイルに関数を移動（GAS グローバル名前空間で自動的に参照可能） |
| include順序 | グローバル変数・初期化関数を含むファイル（`js-core.html`）を先に読み込む |
| 報告 | 分割した場合は「○○を分割しました（理由: ○○行超過）」と報告 |

---

### PDF出力の共通パターン（html2canvas + jsPDF）

アプリ内のすべてのPDF出力機能は以下のパターンで実装する。

#### ライブラリ
- **html2canvas** — DOMをcanvasに変換
- **jsPDF** — canvasからPDFファイルを生成
- **window.print()** — ブラウザ印刷（印刷モード時）

#### 共通フロー

```javascript
// 1. 印刷モードはユーザー操作内（同期的に）ウィンドウを開く（ポップアップブロック回避）
var printWindow = null;
if (mode === 'print') {
  printWindow = window.open('', '_blank');  // ← 必ずボタンクリックの直後（非同期前）に呼ぶ
  if (printWindow) { printWindow.document.write('⏳ 生成中...'); }
}

// 2. オフスクリーンコンテナにHTMLを注入
var container = document.createElement('div');
container.style.cssText = 'position:fixed;left:-9999px;top:0;width:820px;background:white;';
document.body.appendChild(container);
container.innerHTML = buildDocHTML(...);

// 3. html2canvas でキャプチャ（scale:2 で高解像度）
html2canvas(container, { scale: 2, backgroundColor: '#ffffff', windowWidth: 860 }).then(function(canvas) {
  document.body.removeChild(container);
  // 4. 出力
  finalizePdf(mode, [canvas], printWindow, restoreStyles);  // または各機能の finalize 関数
});
```

#### mode='download' の出力
```javascript
var pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
// margin=7mm で画像を配置
pdf.addImage(imgData, 'JPEG', 7, 7, drawW, drawH);
pdf.save('ファイル名.pdf');
```

#### mode='print' の出力
```javascript
printWindow.document.write(
  '<!DOCTYPE html><html><head>' +
  '<style>@page { size: A4 portrait; margin: 7mm; }</style>' +
  '</head><body>' +
  '<img src="' + pngData + '" style="width:100%;" onload="window.print();">' +
  '</body></html>'
);
```

#### 実装済みPDF機能一覧

| 機能 | ファイル | 主要関数 | finalize関数 |
|------|---------|---------|-------------|
| 料金表 | js-pricing.html | `downloadPricingPDF(mode)` | `finalizePdf(mode, canvases, printWindow, restoreStyles)` |
| 年間カレンダー | js-pricing.html | `downloadFiscalCalendarPDF()` | インライン |
| 成績入力テンプレート | js-grades.html | `generateGradeTemplate(mode)` | インライン |
| 講習案内（配布物） | js-lectures-materials.html | `generateMaterialsPDF(mode)` | `finalizeMaterialsPdf_(mode, canvases, printWindow, docTitle)` |

#### ⚠️ 注意点
- **`window.open()` は必ず同期的（非同期処理の前）に呼ぶこと** → ユーザー操作直後でないとポップアップがブロックされる
- **`finalizePdf()`（js-pricing.html）は `pricingData.title` を参照するため料金表専用**。他機能では `finalizeMaterialsPdf_` のように `docTitle` を引数で受け取る専用関数を作ること
- html2canvas は `position:fixed` や一部CSSが描画されない場合がある → Flexbox や table レイアウトを優先
- 複数ページが必要な場合は html2canvas を複数回呼んで `canvases` 配列に格納し `finalize` 関数に渡す
- **Google Fonts を使う場合は `document.fonts.ready.then(...)` で待機してから html2canvas を呼ぶこと** → フォント未ロード時にフォールバックフォントでキャプチャされるのを防止（チラシPDF生成で使用中）

---

### フロントエンドのデバッグログ規約（GAS iframe環境対応）

GAS WebApp は iframe 内で動作するため、`console.log()` がブラウザの開発者ツールに表示されないことがある。
デバッグ時は以下のパターンを使うこと。

#### デバッグヘルパーのパターン

各機能ファイルの先頭に以下のデバッグフラグとヘルパーを定義する：

```javascript
// デバッグモード（trueで画面にトースト表示。調査完了後にfalseにする）
var FEATURE_DEBUG = true;
function featureDebug_(label, msg) {
  if (!FEATURE_DEBUG) return;
  var text = '[' + label + '] ' + msg;
  console.log(text);
  if (typeof showToast === 'function') showToast(text, 'success');
}
```

#### ルール

| ルール | 内容 |
|--------|------|
| 命名規則 | フラグ: `{機能名}_DEBUG`（例: `FLYER_DEBUG`）、関数: `{機能名}Debug_`（例: `flyerDebug_`） |
| 表示方法 | `showToast()` で画面下部にトースト通知として表示する（`console.log` も併用） |
| デバッグ終了後 | フラグを `false` に変更する（コードは残してよい。次回の調査で再利用できる） |
| ログ内容 | `[関数名] 要点のみ` の形式。長い文字列は切り詰める |
| 使用場面 | iframe内で `console.log` が見えない場合のデバッグ。通常の開発では `console.log` でよい |

#### 現在定義済みのデバッグヘルパー

| フラグ | ヘルパー関数 | ファイル | 対象機能 |
|--------|------------|---------|---------|
| `FLYER_DEBUG` | `flyerDebug_()` | `js-lectures-flyer.html` | チラシAI生成・画像置換 |

---

## 13. 既知の制約・注意点

- GAS の実行時間上限は 6分（無料）/ 30分（Workspace）。大量データ処理時は注意
- `google.script.run` の呼び出しは非同期。`withSuccessHandler` / `withFailureHandler` で処理
- `onSettingsLoaded()` でのエラー（`getSettings()` が `{ error: '...' }` を返した場合）は静かに失敗する
- ロゴが表示されない場合は Drive の `assets/logo.png` とスクリプトプロパティを確認
- `addCampus()` で `.toUpperCase()` を適用しているが、コードは数値文字列（例: `'01'`）なので実質影響なし
- スケジュール抽出でファイル名に学校名が含まれていないファイルはスキップされる
- Excel (.xlsx/.xls) 形式のファイルは自動インポート非対応（CSV か Google Sheets に変換が必要）
- **GASデプロイは1つのみ（ANYONE_ANONYMOUS）**: Firebase Hosting 移行後、GASはAPIサーバーとして動作する。デプロイ `AKfycbzrzZkyS42v...` が `access=ANYONE_ANONYMOUS` で LINE Webhook と Firebase Hosting からの API コール（`body.type === 'gasApi'`）を両方受け取る。`Session.getActiveUser().getEmail()` は常に空文字列を返すため、ユーザー識別は Firebase ID トークン検証（`verifyFirebaseIdToken_`）＋ `setFirebaseEmailContext_()` で行う。`appsscript.json` の `webapp` 設定変更時はワークフローが自動で一時的に ANYONE_ANONYMOUS に変更してデプロイし元に戻す。
- **⚠️【重要】`PropertiesService.getUserProperties()` は `USER_DEPLOYING` では全ユーザーで管理者データを返す**: このため、ユーザーごとのデータ（プロフィール・設定など）は `getUserProperty()` / `setUserProperty()` ヘルパーを通じて ScriptProperties に `_UP_{safeEmail}_{key}` 形式で保存している（`settings.js` の `getSafeUserKey_()` ヘルパー参照）。`PropertiesService.getUserProperties()` を直接使うことは禁止。ユーザーデータの読み書きは必ず `getUserProperty()` / `setUserProperty()` を使うこと。
- **デプロイの `paths` フィルター**: `deploy-to-gas.yml` は `*.js`/`*.html`/`appsscript.json`/`.github/workflows/*.yml` が変更されたときのみ GAS デプロイを実行する。`README.md`/`CLAUDE.md` のみの変更ではデプロイは実行されない（ただし `merge-to-main.yml` が main へのマージは行う）。新しいファイル種別を GAS に送る必要がある場合は `paths` への追記も忘れないこと。報告文の使い分けはセクション0「プッシュ後の報告文ルール」を参照。

---

## 14. バグブラックリスト

> 詳細は `BUGS.md` を参照（Claude が新機能実装前に必ず自動で読み込む）

---

## 英単語アプリとの連携
英単語アプリのパス：/home/user/englishtest
別プロジェクトを参照する場合は以下のコマンドを使う：
cd /home/user/englishtest && CLAUDECODE= claude -p '質問内容' --output-format stream-json --verbose --allowedTools "Read,Grep,Glob" --max-turns 5 | jq -rj '(.event.delta.text? // empty), (.message.content[]?.text? // empty)'
