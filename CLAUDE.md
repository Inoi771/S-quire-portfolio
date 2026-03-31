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
| GitHub リポジトリ | ✅ 設定済み（`square1995/gas-App`） |
| デプロイ先ブランチ | ✅ `claude/` で始まるブランチへのプッシュで自動デプロイ |
| clasp（GAS連携ツール） | ✅ GitHub Actions が自動でインストール・実行（ローカル不要） |
| Google認証 | ✅ `CLASP_REFRESH_TOKEN` シークレットで管理済み（ログイン不要） |
| GASプロジェクトID | ✅ `.clasp.json` に記載済み（変更不要） |
| デプロイID（固定） | ✅ `AKfycbyqwdCCeypXH5A-JjK6zphkAYRs4m5CIUySzKcn7dlKqZXF-1jKKT7U4YXmJl1xgquCqQ`（ワークフローに直接書いてある・変更不要） |
| 自動デプロイ | ✅ git push → 約1〜2分でアプリに反映 |

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

#### ⚠️【重要】デプロイIDは固定値を使うこと
GASのウェブアプリには「デプロイID」があり、これがアプリのURLに対応している。
**このIDが変わるとアプリのURLも変わってしまう**ため、固定値をワークフローに直書きしている。

| 項目 | 値 |
|------|-----|
| デプロイID | `AKfycbyqwdCCeypXH5A-JjK6zphkAYRs4m5CIUySzKcn7dlKqZXF-1jKKT7U4YXmJl1xgquCqQ` |
| アプリURL | `https://script.google.com/macros/s/AKfycbyqwdCCeypXH5A-JjK6zphkAYRs4m5CIUySzKcn7dlKqZXF-1jKKT7U4YXmJl1xgquCqQ/exec` |

**Claude がやってはいけないこと：**
- `clasp deploy`（IDなし）で新規デプロイを作ること → 別URLが生成されてしまう
- ワークフロー内の `DEPLOY_ID` を動的に取得しようとすること → 誤ったIDを拾う場合がある
- 上記のデプロイIDを変更・削除すること
- **LINE Webhook用デプロイ（`AKfycbx94J2E...`）に対して `clasp deploy --deploymentId` を実行すること** → `appsscript.json` の設定が上書きされ「アクセスできるユーザー：全員→Googleアカウント必須」に変わり、LINEからのWebhookが401エラーで弾かれて完全に動かなくなる

#### ⚠️【重要】2デプロイ構成とLINE Webhook専用デプロイの注意事項

| デプロイID（先頭） | 用途 | アクセス設定 | バージョン |
|---|---|---|---|
| `AKfycbyqwdCC...` | 通常アプリ | Googleアカウント必須（ANYONE） | 自動更新（clasp deployで更新） |
| `AKfycbx94J2E...` | LINE Webhook専用 | **全員（ANYONE_ANONYMOUS）** | **Head（最新のコード）** |

**LINE Webhook専用デプロイのルール（絶対に守ること）：**
- GASエディタの「デプロイを管理」で `AKfycbx94J2E...` のバージョンは常に「**Head（最新のコード）**」にしておく
- `clasp push --force` でコードをプッシュするだけで自動的に最新コードが反映される
- ワークフロー（`deploy-to-gas.yml`）でこのデプロイIDに対して `clasp deploy` を実行してはいけない
- もしGASエディタで設定を確認して「アクセスできるユーザー」が「Googleアカウントを持つ全員」になっていたら、即座に「全員」に戻すこと（LINEが動かなくなっている）

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

**現在のデプロイ回数: 17**

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
| 種別 | Google Apps Script (GAS) Web App |
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

### index.html 主要 JavaScript 関数（セクション番号付き）

**【1】グローバル変数**
- `allSchedules`, `currentSettings`, `selectedStudentId`, `currentStudentList` など

**【2】初期化**
- `initializeApp()` — `getSettings()` と `getScheduleData()` を並列で呼び出し
- `setupTabNavigation()`, `checkAdminTabVisibility()`
- `showAccountBlockedScreen(newEmail)` — 引き継ぎ済みアカウントでアクセスした場合にブロック画面を表示
- `appConfirm(message)` — ブラウザ標準 `confirm()` の代替。カスタムモーダルを表示し `Promise<boolean>` を返す（URL非表示）
- `appAlert(message)` — ブラウザ標準 `alert()` の代替。カスタムモーダルを表示し `Promise<void>` を返す（URL非表示）
- `showToast(msg, type)` — 画面下部にトースト通知を一時表示する（type: 'success' / 'error'。2.5秒後に自動消去）
- `applyThemeColor(color)` — CSS変数 `--theme-color` / `--theme-color-light` を更新してアプリ全体の色を変える
- `buildCampusOptions(campuses, placeholder)` — **【必須】** 校舎 `{code,name}[]` から `<option>` HTML を生成。配属校舎（preferredCampuses）が先頭に来る。新たに校舎ドロップダウンを作るときは必ずこれを使う
- `rebuildCampusDropdowns()` — 既存の校舎ドロップダウンをすべて `buildCampusOptions()` で再描画（配属校舎変更後に必ず呼ぶ）
- `renderPreferredCampusCheckboxes()` — プロフィール欄の「配属校舎」チェックボックスを描画
- `onPreferredCampusChange()` — チェックボックス変更時の自動保存ハンドラー（保存後に `rebuildCampusDropdowns()` を呼ぶ）

**【3】タブ制御**
- `switchTab(tabName)` — タブ切り替え。各タブ固有の初期化も行う
- `switchSubTab(event, subTabName)` — 成績管理のサブタブ切り替え（`event` は必須引数。`data-subtab` 属性でクローンボタンのアクティブ状態も同期）
- `initSubTabLoop(containerId)` — サブタブバーの無限ループスクロールを初期化（汎用）。ボタンを前後にクローンし、端に達したら本物の位置にジャンプ。対象: `gradesSubTabs`・`lecSubTabNav`・`univSubTabs`・`adminSubTabs`

**【4】スケジュール関連**
- `onScheduleDataLoaded()`, `renderCalendar()`
- `classifyEvent(event)` — イベントの種類（juku/junior/high）を判定して返す
- `buildMonthHTML(year, month)` — 指定月の全日を4列テーブル（日付|塾|中学校|高校）で生成。全タイプのイベント+仮想イベントを列ごとに分類表示
- `buildMonthDrumHTML()` — 月ドラムピッカーHTML生成（前後18ヶ月）
- `initMonthDrum()` — 月ドラムピッカーのスクロール動作初期化
- `changeMonth(delta)` — 月を前後に移動
- `getClosedDays(fiscalYear)` — Excelの条件付き書式ロジックを再現。年度の休校日（日曜以外の特定日）をdateKeyオブジェクトで返す
- `computePeriodBorders(fiscalYear, closedDays)` — 授業日24日ごとの期間枠線（左上・右下）を計算して返す
- `getReportDay(year, month)` — ○回数報告書提出日。月ごとの固定日付（日曜なら前日）
- `getMeetingDay(year, month)` — □全体ミーティング日。4〜6月は第2金曜（1日が金曜なら第3金曜）。7〜3月（8月除く）は月別基準日を含む直前の金曜日（7月=9日基準, 9月=7日基準, 10月=9日基準, 11月=19日基準, 12月=10日基準, 1月=20日基準, 2月=7日基準, 3月=14日基準）
- `getDebitDays(year, month)` — ★引落データ送信日 / △メール送信日を返す `{debit, email}`
- `renderFiscalMonth(year, month, closedDays, periodBorders)` — 月曜始まりでカレンダーHTML生成。closedDaysで休校日グレー表示、periodBordersで期間枠線表示
- `generateFiscalCalendar()` — HP用（薄いグレー・カラー記号）で年間カレンダーを画面表示
- `downloadFiscalCalendarPDF()` — 室長用（濃いグレー・モノクロ記号）でPDF出力（print-modeクラスで切替）
- `loadPricingTable()` — 料金表データをバックエンドから読み込んで表示
- `computeRowSpans(rows)` — 1列目のセル結合（rowspan）を計算。空文字列が続く行を直前の非空セルに吸収
- `renderPricingTable(data)` — 料金表をHTMLテーブルでレンダリング（閲覧モード/編集モード対応。閲覧モードでは1列目をrowspanで結合）
- `togglePricingEditMode()` — 管理者用編集モードの切り替え（保存も兼ねる）
- `downloadPricingPDF(mode)` — 料金表をPDFでダウンロードまたは印刷（A4に収まらない場合は「講習料金」セクションで2ページ分割）
- `handlePdfError(e, printWindow, restoreStyles)` — PDF生成エラー時の共通処理
- `finalizePdf(mode, canvases, printWindow, restoreStyles)` — キャプチャ済みcanvas配列からPDF/印刷を実行
- `isWeekendOrHoliday(date)` — 土日・祝日判定。`googleCalendarHolidays` が取得済みならGoogleカレンダーデータを優先、未取得なら `getJapaneseHolidays()` アルゴリズムにフォールバック
- `getNextWeekday(date)` — 指定日以降（含む）で最初の平日を返す
- `getFirstWednesdayOnOrAfter(date)` — 指定日以降（含む）で最初の水曜日を返す
- `getComputedBasicTestDate(academicYear, testNum)` — 基礎学力テストの自動計算日（第3回は翌年1月8日の次の平日。ただし1月8日が土日祝日なら次の次の平日）
- `getChuu12BasicTestDate(academicYear)` — 中1・中2対象の基礎学力テスト日（翌年2月の第2水曜日）を返す
- `getBasicTestEventsForMonth(calYear, calMonth)` — 指定カレンダー月に含まれる基礎学力テスト仮想イベントを返す（上書き優先。中1・中2対象の回数なしイベントも含む・中1・中2キー: `{academicYear}-chuu12`）
- `countBackLecDeadline_(startDate, count, closedDays)` — 開始日の前日からcount日前を出し、その日が日曜・休校日なら前の営業日に調整して返す（講習日程締切日計算用内部ヘルパー）
- `getLectureDeadlineEventsForMonth(calYear, calMonth)` — 指定カレンダー月に含まれる講習日程締切仮想イベントを返す（`lectureDeadlineOverrides` で手動上書き優先、なければ `countBackLecDeadline_` で自動計算。春期・夏期・冬期は42日前（28+14）、その他は28日前。塾列に表示）

**【5】設定管理**
- `onSettingsLoaded(settings)` — ロゴ・ファビコン設定、ユーザー情報表示
- `saveSettings()`, `updateApiKeyStatus()`
- `exportSettings()` — 引き継ぎコード発行ボタンのハンドラー。`exportUserSettings()` を呼び出す
- `copyTransferCode()` — 引き継ぎコードをクリップボードにコピー
- `importSettings()` — 引き継ぎコード入力→復元ボタンのハンドラー。`importUserSettings()` を呼び出す

**【6】プロフィール管理**
- `loadProfileInfo()`, `saveProfile()`

**【7・8】成績管理**
- `loadGradesConfig()`, `loadStudentList()`
- `filterStudents()`, `selectStudentFromCard()` — ふりがなインクリメンタル検索
- `submitStudentForm()`, `submitGradeForm()`
- `showOcrModal()`, `handleOcrSubmit()`
- `updateGradeTemplateBtnState()` — 校舎・学年・テスト名が全選択済みかチェックしてテンプレートボタンの有効/無効を切り替える
- `toggleGradeTemplatePdfMenu()` / `closeGradeTemplatePdfMenu()` — テンプレートPDFドロップダウンメニューの表示切替
- `generateGradeTemplate(mode)` — 選択校舎・学年・テスト名で生徒一覧を取得し、成績入力テンプレートを新ウィンドウで開く（mode='print'で自動印刷、'download'で手動）
- `buildGradeTemplateHtml(students, year, testName, campusName, gradeName, mode)` — 成績入力テンプレートHTML生成（A4横向き・氏名左端・「折って隠す」注意書き付き）
- `onScoreGradeChanged()` — 成績入力タブの学年ドロップダウン変更時に校舎＋学年で生徒一覧を取得
- `initGradesList()` — 一覧表タブのフィルター選択肢を初期化（campusData/schoolsDataから生成）
- `onListCampusAllChange()` — 「全校舎」チェックボックスで全個別校舎を一括切り替え
- `onListCampusChange()` — 個別校舎チェックボックス変更時に「全校舎」チェックを更新
- `loadGradesList()` — バックエンドから `getStudentListWithGrades` を呼び出してテーブル描画
- `getFilteredListData()` — 選択校舎・志望校フィルターを適用したデータを返す
- `renderGradesTable()` — 一覧表テーブルをHTMLで描画（ソート列に▲▼を表示）
- `sortGradesList(col)` — 列ヘッダークリック時のソート処理（同列クリックで昇順/降順切替）
- `initGradesAnalysis()` — 分析タブ初期化（テスト名ドロップダウン構築）
- `loadGradeAnalysis()` — 分析タブ：保存済み分析の有無を確認して表示/生成ボタンを出す
- `generateAndDisplayAnalysis()` — 分析タブ：AIで分析生成して表示
- `renderAnalysisResult(analysis, generatedAt, testName)` — 分析タブ：分析結果HTML描画（テキスト＋CSSバーチャート）
- `initGradesReport()` — 成績表タブ初期化（校舎・テスト名・生徒ドロップダウン設定）
- `onReportCampusChanged()` — 成績表：校舎変更時にリセット
- `onReportTestChanged()` — 成績表：テスト名変更時に生徒リスト取得（`getStudentsWithGradesByTest` を呼び出し）
- `getDisplayTestNames(selectedTestName, allTestNames)` — 選択テスト名に対して表示すべきテスト名リストを返す（基礎学力テストは累積表示）
- `loadStudentReport()` — 成績表：生徒選択時にレポートデータ取得（`getDisplayTestNames` で表示テストをフィルタ）
- `renderReportCard(student, grades, testNames, schoolAverages)` — 成績表：生徒情報＋全テスト成績テーブル描画（学校平均との差分色分け付き）
- `printReportCard()` — 成績表：印刷用ウィンドウを開く

**【進学先タブ】** (`js-grades-placement.html`)
- `initGradesPlacement()` — 進学先サブタブ初期化（校舎チェックボックスを campusData から生成）
- `onPlacementCampusAllChange()` — 「全校舎」チェックボックス変更時：全個別校舎チェックを同期
- `onPlacementCampusChange()` — 個別校舎チェックボックス変更時：「全校舎」チェックを更新
- `loadGradesPlacement()` — 「表示する」ボタン：2月以降チェック → `getStudentPlacementData` 呼び出し → テーブル描画
- `buildPlacementSchoolFilter_()` — 取得データから進学先絞り込みドロップダウンを動的構築（内部）
- `getPlacementFilteredData_()` — 校舎・進学先フィルターを適用したデータを返す（内部）
- `getPlacementSortIcon_(col)` — ソートアイコンHTML生成（内部）
- `sortPlacementData(col)` — 列ヘッダークリック時のソート処理（同列クリックで昇順/降順切替）
- `renderPlacementTable_()` — フィルター済みデータをHTMLテーブルとして描画（内部）

**【講習管理タブ】**
- `initLecturesTab()` — `switchTab('lectures')` から呼ばれる初期化。`getLecturePeriods()` をロードし年度セレクトを構築
- `buildLectureYearSelect()` — lecturePeriods から年度一覧を構築してセレクトを描画
- `onLectureYearChange()` — 年度変更時ハンドラー
- `onLectureChange()` — 講習変更時ハンドラー（開始週にリセット）
- `buildLectureNameSelect(fy)` — 指定年度の講習セレクトを構築
- `updateLecturePeriodLabel()` — 期間ラベル（YYYY/MM/DD 〜 YYYY/MM/DD）を更新
- `switchLectureSubTab(event, name)` — `.lecture-sub-content` / `.lecture-sub-tab` にスコープしたサブタブ切り替え
- `initLecturesSchedule()` — 日程作成サブタブ初期化（校舎チェックボックス構築）
- `buildLectureCampusCheckboxes()` — preferredCampuses が先にチェック済みで校舎チェックボックスを生成
- `onLecCampusAllChange()` — 全校舎チェックボックス変更ハンドラー
- `onLecCampusChange()` — 個別校舎チェックボックス変更ハンドラー
- `showLectureCampusTabs()` — 表示ボタン押下時：チェック済み校舎タブ＋グリッドを構築
- `switchLectureCampusTab(campusCode)` — 校舎タブ切り替え（週位置・スクロール位置を維持）
- `renderLectureWeekGrid(campusCode)` — 週間タイムグリッド描画（0〜24時・10分ごと・開始/終了予定日バッジ付き）
- `navigateLectureWeek(dir)` — ±1週移動（範囲制限なし）
- `updateLectureWeekLabel()` — 週ラベル（YYYY/MM/DD〜YYYY/MM/DD）を更新
- `getLectureWeekMonday(dateStr)` — 指定日が属する週の月曜日（Dateオブジェクト）を返すヘルパー
- `formatLecDate(d)` — Date → YYYY/MM/DD(曜) 形式
- `formatDateKey(d)` — Date → YYYY-MM-DD 形式（開始/終了日との比較用）
- `isSpringLecture()` — 現在選択中の講習名に「春期」が含まれるか判定
- `buildLecSubjectButtons()` — selectedSubjects から教科ボタンを構築。1教科なら自動選択
- `buildLecGradeButtons()` — 学年ボタンを構築（春期なら「新」付与）
- `applyLecBtnActive(btn, active)` — ボタンのアクティブスタイルを適用・解除
- `toggleLecSubjectBtn(subject)` — 教科ボタン排他選択（同ボタン再押しで解除）
- `toggleLecGradeBtn(grade)` — 学年ボタン排他選択（同ボタン再押しで解除）
- `timeToSlot(timeStr)` — HH:MM → スロット番号変換
- `slotToTimeStr(slot)` — スロット番号 → HH:MM変換
- `getEntryColors(subject, grade)` — 教科・学年から HSL カラーセットを返す（solid/bg/text の3値。5教科色相×7学年明度）
- `getTeacherColor(email)` — 先生ごとの色を取得（未割当なら自動割当）
- `updateLecToolbarState()` — 削除ボタンの有効/無効を更新
- `updateSaveButtonLabel()` — 保存ボタンの件数バッジを更新
- `showLecStatusMsg(msg, color)` — ステータスメッセージを一時表示
- `computeOverlapGroups(entries)` — 同日内の重なるエントリのグループ（幅/位置計算用）を返す
- `renderLecEntries(campusCode)` — エントリを絶対配置で描画
- `onLecColClick(event, date)` — グリッド列クリック時：新規作成 or 移動
- `onEntryClick(event, entryId)` — エントリクリック時：選択 or 解除（所有者チェック付き：管理者以外は自分のエントリのみ選択可能）
- `getDefaultGradeSettingsJS(lectureName, grade)` — 講習名・学年コードからデフォルトのコマ設定を返す（フロントエンド版。duration: スロット数、count: 回数。基礎学力テスト対策・入試直前は中3のみ有効、他学年は0）
- `getLecGradeSettings(grade)` — 現在選択中の講習の学年別設定を取得（gradeSettings があればそちらを優先、なければ名前ベースのデフォルト）
- `createLecEntry(date, startSlot)` — 選択中の教科・学年でエントリを新規作成（学年ごとのコマ時間を自動適用）
- `createWeeklyLecEntries(date, startSlot)` — 「毎週」チェック時の一括作成：同じ曜日・時刻で count 回分のエントリを毎週作成（休校日を自動スキップ）
- `moveLecEntry(entryId, date, startSlot)` — 選択中エントリを指定日時に移動
- `deleteLecEntry()` — 選択中エントリを削除
- `refreshLecEntries()` — バックエンドからエントリを再取得して描画
- `saveLecEntries()` — 現在の校舎のエントリをバックエンドに保存
- `initLecturesAdmin()` — 管理タブ：講習設定パネル初期化（年度セレクト構築→一覧ロード）
- `buildAdminLecYearSelect()` — 管理タブ：年度セレクトを構築（現在FYと翌FY）
- `loadLecturePeriodsAdmin()` — 管理タブ：選択年度の講習期間一覧描画（6種固定・削除なし・「日程を編集」「学年別設定」ボタン付き）
- `editLectureDatesAdmin(lectureId, currentStart, currentEnd)` — 管理タブ：日程編集インラインUIを表示
- `saveLectureDatesAdmin(fiscalYear, typeId)` — 管理タブ：日程上書き保存
- `resetLectureDatesAdmin(fiscalYear, typeId)` — 管理タブ：日程をデフォルト（自動計算）に戻す
- `showLecGradeSettingsPanel(lectureId)` — 学年別設定パネルを表示（コマ時間・回数の入力テーブル）
- `saveLecGradeSettingsAdmin(lectureId)` — 学年別設定パネルの入力値をバックエンドに保存
- `showLecPricingPanel(typeId)` — 講習別料金設定パネルを表示（バックエンドから料金データを取得して描画）
- `renderLecPricingPanel_(typeId, typeName, rows)` — 料金設定パネルの中身を描画（テーブル＋行追加/削除＋保存ボタン）
- `buildLecPricingRowHtml_(idx, row)` — 料金設定の1行分のHTML生成（税抜き入力・税込み自動計算表示）
- `updateLecPricingTax_(input)` — 税抜き金額入力時に税込み表示を自動更新するハンドラー
- `addLecPricingRow_(typeId)` — 料金設定テーブルに空の行を追加
- `removeLecPricingRow_(btn)` — 料金設定テーブルから行を削除（最低1行は維持）
- `saveLecPricingAdmin_(typeId)` — 料金設定をバックエンドに保存

**【配布物サブタブ】**
- `initLecturesMaterials()` — 内部配布物サブタブ初期化（校舎セレクト・学年別挨拶文textarea構築、料金表データキャッシュ取得）
- `buildMatCampusSelect()` — `buildCampusOptions()` を使って校舎セレクトを構築（配属校舎が先頭）
- `buildMatGreetingTextareas_()` — `MAT_GRADE_GROUPS_` をループして `#mat-greetings-container` に学年別textareaを動的生成（既に子要素があればスキップ）
- `getMatGreeting_(gradeKey)` — `mat-greeting-{key}` textareaの値を返すヘルパー（未生成時はデフォルト文にフォールバック）
- `generateMaterialsPDF(mode)` — 学年ページを逐次 html2canvas → canvases[] に積んで `finalizeMaterialsPdf_` で出力（mode='download'/'print'）
- `finalizeMaterialsPdf_(mode, canvases, printWindow, docTitle)` — 配布物PDF/印刷出力（`finalizePdf` の配布物専用版。`docTitle` 引数でタイトルを動的指定）
- `buildMaterialsDocHTML(entries, campusName, campusCode, fy, lecName, typeData, isSpring)` — 学年グループをループして学年ごとのページHTMLを連結（データなし学年はスキップ）
- `buildMatOnePage_(gradeGroup, entries, campusName, campusCode, lecName, greeting, typeData, isSpring)` — 1学年分のA4ページHTML生成（ヘッダー・タイトル・挨拶文・敬具・日程表・料金枠・切り取り線・申込欄）
- `buildMatScheduleTable_(entries)` — 科目×開始時刻×コマ数でグルーピングして日付を集約した3列（科目/日程/時間）テーブルを生成
- `buildMatApplicationSlip_(subjects, campusName, gradeGroup, lecName)` — 切り取り後の申込欄HTML生成（中学生/小学生:科目に○形式、高校生:希望回数・日程記入形式）
- `buildMatLecPricingTable_(rows, campusCode, isSpring)` — 講習別料金データからHTMLテーブルを生成（勝瑞校高校生の特別料金対応・連続学年グループ化）
- `buildMatGradeSettingsTable(gradeSettings)` — 料金表データがない場合のフォールバック：gradeSettings から時間・回数のみの表を生成
- `matFormatDate_(dateStr)` — YYYY-MM-DD → "M/D(曜)" 形式に変換
- `matCalcEndTime_(startTime, durationSlots)` — 開始時刻とスロット数から終了時刻を計算（1スロット=10分）
- `escapeHtmlMat_(str)` — HTML特殊文字をエスケープ（配布物内部用）
- `saveMatPDFToDrive()` — 「Driveに保存」ボタンのハンドラー。学年ページを逐次描画してjsPDF多ページ保存し `saveDistributionFile` を呼び出す
- `loadDistributionFilesList()` — Drive保存済みファイル一覧を `listDistributionFiles` から取得して `#mat-files-list` に描画する
- `renderDistributionFilesList(files)` — 保存済みファイル一覧HTMLを生成して `#mat-files-list` に注入する（「開く」リンク・「削除」ボタン付き）
- `deleteDistributionFileUI(fileId)` — 確認ダイアログ後に `deleteDistributionFile` を呼び出してファイルを削除し、一覧を再取得する

**【外部チラシサブタブ（AI生成方式）】** (`js-lectures-flyer.html`)
- `TYPE_TEMPLATE_MAP` — 講習typeId → 季節キーのマッピング（seasonKey算出・画像自動選択に使用）
- `showFlyerHelpModal()` — チラシ操作方法モーダルを表示
- `closeFlyerHelpModal()` — チラシ操作方法モーダルを閉じる
- `initFlyerAi()` — AIチラシサブタブ初期化（講習バッジ更新・校舎セレクト・画像ロード）
- `buildFlyerAiCampusSelect()` — `buildCampusOptions()` + 先頭に「📋 共通」option を追加
- `onFlyerAiCampusChange()` — 校舎変更→保存データをロード→プレビュー・チャット復元
- `sendFlyerAiMessage()` — チャット入力を送信→編集モード同期→コンテキスト収集→`seasonKey` 算出→`generateFlyerWithAI` 呼び出し
- `collectFlyerAiContext_(campusCode, callback)` — チェックボックスに応じて講習情報・日程・料金データをマークダウンテーブル形式で収集（季節テーマはバックエンド側で処理）
- `onFlyerAiResponse_(result)` — Geminiレスポンス処理→画像プレースホルダー置換→プレビュー注入→チャット更新
- `injectFlyerImage_(html)` — `{{IMAGE_PLACEHOLDER}}` を実base64に置換
- `renderFlyerAiChat_(role, text)` — チャットバブル追加（user=右寄せ、ai=左寄せ、error=赤）
- `resizeFlyerAiPreview()` — プレビューをコンテナ幅に合わせてスケーリング（794px→scale係数で transform）
- `saveFlyerAiUI()` — 編集モード同期→HTML＋会話履歴をバックエンドに保存
- `clearFlyerAiChat()` — チャット履歴・プレビューをリセット（確認ダイアログ付き）
- `toggleFlyerEditMode()` — 直接編集モードのON/OFF切り替え
- `enableFlyerEditMode_()` — プレビュー内テキスト要素に `contenteditable` 設定＋ホバー枠線
- `disableFlyerEditMode_()` — `contenteditable` 解除＋変更をHTMLに同期
- `syncFlyerEdits_()` — プレビューDOM → `flyerAiCurrentHtml` に同期（contenteditable属性をstrip）
- `showFlyerEditToolbar_(el)` / `hideFlyerEditToolbar_()` — フローティングツールバーの表示/非表示
- `flyerEditFontSize_(delta)` — フォントサイズ変更
- `flyerEditBold_()` — 太字トグル
- `flyerEditColor_(color)` — テキスト色変更
- `hasDirectText_(el)` — 要素が直接テキストを含むか判定するヘルパー
- `loadFlyerImageList()` — Drive assets/flyer フォルダから画像一覧を取得してセレクトを構築
- `uploadFlyerImageUI()` — 画像ファイルをFileReaderでbase64変換してバックエンドにアップロード
- `deleteFlyerImageUI()` — 選択中の画像を確認ダイアログ後に削除してリストを再取得
- `onFlyerImageChange()` — 画像選択変更時：base64プリロード・プレビュー表示・削除ボタン連動・タグ入力欄更新
- `autoSelectFlyerImage_(seasonKey, callback)` — 画像未選択時に季節キーワード（`FLYER_SEASON_KEYWORDS`）で画像タグをスコアリングし最適な画像を自動選択してbase64をロード。選択済みならスキップ
- `saveFlyerImageTagsUI()` — 画像の説明タグをバックエンドに保存してキャッシュ更新
- `generateFlyerAiPDF()` — 編集モード同期→プレビューHTMLからhtml2canvas→jsPDF→A4 PDF出力（トンボ対応）
- `outputFlyerPDF_(canvases, fileName, withTombo)` — canvas配列からjsPDF出力（トンボ対応）
- `addFlyerCropMarks_(pdf, ox, oy, w, h)` — PDFにトンボ（仕上がり線）を描画

**【画像生成サブタブ】** (`js-lectures-imagen.html`)
- `initImagenTab()` — 画像生成サブタブ初期化（初回のみ履歴をロード）
- `selectImagenRatio(btn)` — アスペクト比ボタンの選択切り替え（縦長/横長/正方形）
- `generateImagenImage()` — 画像生成を実行（`generateImageWithImagen` を呼び出し）
- `showImagenStatus(msg, bgColor, textColor)` — ステータスメッセージを表示
- `loadImagenHistory()` — チラシ用画像フォルダの画像一覧を読み込んで履歴表示
- `loadImagenThumbnail_(fileId)` — サムネイル画像を非同期で読み込む
- `previewImagenHistoryItem(fileId, fileName, tags)` — 履歴アイテムをクリックしてプレビュー表示
- `escapeHtmlImagen_(str)` — HTML特殊文字をエスケープ（画像生成タブ用）

**【9】AI アシスタント**
- `sendAiMessage()` — `requestAIAssistant()` を呼び出す
- `handleAiResponse()`, `renderChatBubble()`
- `toggleVoiceInput()` — マイクボタンの ON/OFF 制御
- `checkMicPermissionAndStart()` — マイク権限を事前確認し、拒否なら案内モーダルを表示して false を返す
- `startVoiceRecognition()` — 実際の音声認識セッション開始
- `showMicPermissionModal()` — OS/ブラウザ別（PC / Android / iPhone）のマイク許可手順モーダルを表示

**【10】Admin**
- `loadScriptProperties()`, `loadSheetsList()`, `exploreDriveFolder()`
- `initStudentAnalysisPanel()` — 生徒別AI分析パネルの年度・テスト名ドロップダウン初期化
- `generateAllAnalysesAdmin()` — テスト全体分析＋生徒別AI分析を1回のAPIコールで一括生成するボタンハンドラー（確認ダイアログ付き）

**【講習日程締切管理】** (`js-admin-lec-deadline.html`)
- `initLectureDeadlineDatesAdmin()` — 講習日程締切管理セクションの年度セレクタ初期化・データ読み込み
- `loadLectureDeadlineDates()` — バックエンドから上書き設定を取得してテーブル描画
- `renderLectureDeadlineDateTable(overrides, yr)` — 各講習の自動計算日 / 上書き日 / 変更・リセットボタンを描画
- `saveLectureDeadlineDate(lectureId)` — 上書き保存（`setLectureDeadlineOverride` を呼び出し）
- `resetLectureDeadlineDate(lectureId)` — 上書き削除（`deleteLectureDeadlineOverride` を呼び出し・自動計算に戻す）

**【チャットボット管理】** (`js-admin-chatbot.html`)
- `initChatbotAdmin()` — チャットボット管理サブタブ初期化（ナレッジベースエントリ取得→描画）
- `renderKbEntries(entries)` — カテゴリ別にグループ化してエントリ一覧を描画
- `showKbEntryForm()` — 新規追加フォーム表示
- `editKbEntry(entryId)` — 編集フォーム表示（既存エントリ）
- `hideKbForm()` — フォームを閉じる
- `onKbCategorySelectChange()` — カテゴリセレクト変更時ハンドラー（自由入力切替）
- `saveKbEntry()` — エントリ保存（追加/更新）
- `deleteKbEntry(entryId)` — エントリ削除（確認ダイアログ付き）

**【AIアシスタント アクション実行】** (`js-ai-actions.html`)
- `dispatchAiAction_(result)` — app_actionのメインディスパッチャー。handleAIWidgetResponseから呼ばれる
- `checkPendingAiAction_(userMessage)` — 確認待ちアクションがあれば「はい/いいえ」をローカル処理。sendAIWidgetMessageから呼ばれる
- `executeConfirmedAiAction_(action, params, thinkingId)` — 確認済み書き込みアクションをバックエンドで実行
- `navigateToSchedule_fromAI(year, month)` — 予定タブへ自動ナビゲート・指定月に移動
- `navigateToTab_fromAI(tab, subTab)` — 任意のタブ・サブタブへ自動ナビゲート
- `triggerAdminSubTabInit_(tabName)` — 管理サブタブの初期化関数をトリガーする内部ヘルパー
- `navigateToGradeAnalysis_fromAI(year, testName)` — 分析タブへ自動ナビゲート・テスト名選択・分析ロード
- `navigateToLectures_fromAI(lectureId, campusCode)` — 講習管理タブへ自動ナビゲート・講習選択・校舎チェック

---

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

## 10. 全関数リスト（code.js）

### セクション2: 認証・ロール管理
- `getProperty(key)` — スクリプトプロパティ取得
- `setProperty(key, value)` — スクリプトプロパティ設定
- `getAllProperties()` — 全プロパティ取得
- `isAdmin()` — Admin 判定
- `getCurrentUserEmail()` — 現在のユーザーメール取得
- `getUserRoleInfo()` — ロール情報取得（`@aiCallable` ではない）
- `getDisplayName(userEmail)` — メールから表示名を生成
- `getAdminEmails()` — Admin メール一覧（Admin のみ）
- `addAdminEmail(newEmail)` — Admin 追加（Admin のみ）
- `removeAdminEmail(emailToRemove)` — Admin 削除（自分自身は不可、最低1人保持）
- `getSetupStatus()` — 初回セットアップが必要かを返す（`isFirstSetup`, `currentUserEmail`, `hasAppFolder`）。ADMIN_EMAILS が空なら `isFirstSetup: true`
- `initializeFirstAdmin()` — ADMIN_EMAILS が空の場合のみ現在ユーザーを管理者として登録する（2回目以降は拒否）
- `getAllowedUsers()` — Driveフォルダの共有ユーザー一覧を取得（Admin のみ。ACCESS_FOLDER_ID 優先）
- `addUserAccess(email)` — ユーザーにアプリアクセスを付与（Admin のみ。DriveフォルダにEditor追加）
- `removeUserAccess(email)` — ユーザーのアプリアクセスを削除（Admin のみ。オーナーと自分自身は削除不可）
- `createAccessDeniedHtml(email)` — アクセス拒否ページのHTMLを生成

### セクション3: Web App エントリーポイント
- `doGet()` — index.html を配信
- `getAppMetadata()` — アプリ名・バージョン情報

### セクション4: スケジュール管理
- `getFolderByName(parentFolder, folderName)` — フォルダ取得ヘルパー
- `getFileByName(parentFolder, fileName)` — ファイル取得ヘルパー
- `getScheduleFolder()` — 月間スケジュールフォルダ取得
- `getScheduleData()` — `@aiCallable` 全スケジュール取得
- `getScheduleDropdownData()` — `@aiCallable` フォーム用ドロップダウン
- `addScheduleEntry(schoolName, eventName, dateStr, details)` — `@aiCallable` 予定追加
- `updateSchedules()` — 全年度フォルダをスキャンして `autoImportAllSchedules()` を呼ぶ
- `extractTextFromPDF(file)` — PDF → テキスト（Google Docs OCR）
- `extractEventsFromText(schoolName, text, year)` — テキスト → イベント配列（Gemini API）

### セクション5: 設定管理
- `getSettings()` — `@aiCallable` 設定取得（ロゴ・ファビコンを base64 で返す）
- `updateSettings(settingsData)` — 設定更新（APIキー・フォルダIDは Admin のみ）。受け付けるキー: `geminiApiKey`, `appFolderId`, `accessFolderId`, `themeColor`

### セクション6: プロフィール管理
- `getUserProperty(key)` — ユーザープロパティ取得
- `setUserProperty(key, value)` — ユーザープロパティ設定
- `getRegisteredEmail()` — 登録メール取得（初回はGoogle アカウントのメール）
- `getUserProfile()` — `@aiCallable` プロフィール取得
- `getOrCreateTeacherId()` — 講師ID取得（初回自動生成）
- `updateEmailAddress(newEmail)` — `@aiCallable` メール変更
- `updateUserProfile(profileData)` — `@aiCallable` プロフィール更新
- `getSubjectOptions()` — `@aiCallable` 教科リスト
- `savePreferredCampuses(campusCodes)` — `@aiCallable` 配属校舎リストを保存（UserProperties `PREFERRED_CAMPUSES`）
- `resetUserThemeColor()` — `@aiCallable` ユーザー個別テーマカラー（`USER_THEME_COLOR`）を削除してシステムデフォルトに戻す。戻り値: `{ success, themeColor }`
- `saveProfilePhoto(base64Image, mimeType)` — `@aiCallable` プロフィール写真をDriveの`assets/profile-photos/{teacherId}.jpg`に保存（既存ファイルは上書き）。戻り値: `{ success, message }`

### セクション7: 成績管理（マスター設定）
- `getScriptProperty(key)` / `setScriptProperty(key, value)` — セクション7専用のプロパティラッパー
- `initializeGradesConfig()` — 初回のデフォルト値設定
- `addTestName(newTestName)` / `deleteTestName(testNameToDelete)` — テスト名 CRUD（Admin のみ。削除時は成績データの参照チェックあり）
- `addSchool(schoolName, departmentsStr)` / `deleteSchool(schoolName)` — 志望校 CRUD（Admin のみ。削除時は成績データの参照チェックあり）
- `addCampus(campusCode, campusName)` / `deleteCampus(campusCode)` — 校舎 CRUD（Admin のみ。削除時は生徒データの参照チェックあり）
- `updateVisibleGrades(visibleCodes)` — 表示する学年コードの配列を保存（Admin のみ。学年コードは GRADES 定数で固定）
- `countStudentsByCampus_(campusCode)` — 校舎コードを使用中のアクティブ生徒数を返す内部ヘルパー
- `countGradesByTestName_(testName)` — テスト名を使用中の成績データ件数を全年度から返す内部ヘルパー
- `countGradesBySchool_(schoolName)` — 志望校名を使用中の成績データ件数を全年度から返す内部ヘルパー
- `getGradesConfigForWeb()` — `@aiCallable` 成績管理設定取得
- `getTestNamesConfig()` / `getCampusConfig()` / `getGradeConfig()` / `getSchoolConfig()` — 各設定取得

### セクション8: 成績管理（生徒・成績データ）
- `getGradesFolder()` — 成績管理フォルダ取得
- `getGradesYearFolders()` — `@aiCallable` 年度フォルダ一覧
- `getSettingsFolder()` — 設定フォルダ取得
- `getCurrentFiscalYear()` — 現在の学年年度（4月始まり）
- `getStudentNameById(studentId)` — 生徒IDから氏名取得
- `getMasterData(year)` — アクティブ生徒一覧（削除済み除外・学年動的計算）
- `getDataSheetData(year)` — 成績データ配列取得
- `getStudentListWithGrades(year, testName)` — `@aiCallable` 生徒マスタと成績を結合して返す（一覧表タブ用）
- `getStudentsForDropdown(campusCode, gradeCode, selectedYear)` — `@aiCallable` ドロップダウン用生徒一覧
- `submitStudentInfo(year, campusCode, gradeCode, nameKanji, nameFurigana, schoolName)` — `@aiCallable` 生徒登録（重複チェックあり）
- `updateStudentInfo(studentId, campusCode, name, furigana, schoolName)` — `@aiCallable` 生徒情報更新
- `deleteStudent(studentId)` — `@aiCallable` 生徒ソフトデリート
- `getDeletedStudents(campusCode, gradeCode, selectedYear)` — `@aiCallable` 削除済み生徒取得
- `restoreStudent(studentId)` — `@aiCallable` 生徒復元
- `ocrAndSaveGradeSheet(base64Image, mimeType, year)` — `@aiCallable` 成績画像OCR一括保存
- `getGradeDataByStudentAndTest(year, studentId, testName)` — `@aiCallable` 既存成績1件取得
- `submitGradeData(year, studentId, testName, scores)` — `@aiCallable` 成績 upsert
- `getStudentsWithGradesByTest(year, campusCode, testName)` — `@aiCallable` 指定テスト名の成績がある生徒一覧を校舎でフィルタして返す（成績表タブ用）
- `getStudentGradeReport(year, studentId)` — `@aiCallable` 成績表用：指定生徒の全テスト成績と学校別平均を取得
- `bulkImportStudents(studentsJson, importYear)` — 生徒を一括インポート（Admin のみ。ふりがな省略可。JSON文字列 `[{campusCode, gradeCode, sei, mei}]`。importYear 省略時は現在年度。戻り値: `{ success, total, savedCount, skippedCount, errors[] }`）
- `bulkImportGrades(gradesJson, importYear)` — 成績を一括インポート（Admin のみ。氏名・校舎・学年で生徒IDを解決してupsert。JSON文字列 `[{testName, campusCode, gradeCode, name, kokugo, shakai, sugaku, rika, eigo, gokei}]`。戻り値: `{ success, total, savedCount, skippedCount, errors[] }`）
- `saveExamResult(studentId, examDataJson)` — `@aiCallable` 中3生徒の受験情報を生徒マスタ列10〜16に保存。`examDataJson`: `{jukoukou1, jukoukou1_gakka, jukoukou1_gokaku, ikusei, jukoukou2, jukoukou2_gakka, jukoukou2_gokaku}`
- `getStudentExamData(studentId, fiscalYear)` — `@aiCallable` 生徒の受験情報（生徒マスタ列10〜16）と最新テストの第1志望校を取得。戻り値: `{ success, examData: {...}, latestGrade: {shogaku1, shogaku1_gakka} }`
- `getStudentPlacementData(year)` — `@aiCallable` 進学先一覧取得。指定年度の中3生（学年コード15）全員について第1〜第3回基礎学力テストの合計点・平均・進学先を返す。戻り値: `[{studentId, name, campus, score1, score2, score3, avg, placement, placementSchool}]`
### セクション8-B: AI成績分析・生徒別AI分析（analysis.js）
- `getAnalysisSheet(year)` — AI分析シート取得/作成ヘルパー
- `getGradeAnalysis(year, testName)` — `@aiCallable` 保存済みAI分析データの取得（`{ exists, analysis, generatedAt }`）
- `getYearTestAvgs_(year, testName)` — 塾全体平均（getCampusAverages の "all" エントリ）と学校「平均」行を取得して返す内部ヘルパー（`{ jukuAvg, schoolAvg }`）
- `generateGradeAnalysis(year, testName, skipIfExists)` — `@aiCallable` AI分析の生成・保存・返却（Gemini API使用。塾平均・学校平均のみを渡し、過去3年分の推移・前回テスト比較を含む。`skipIfExists=true` のとき既存データがあれば生成をスキップして返す）
- `calcDeviationValue_(score, average, sigma)` — 偏差値計算ヘルパー（50 + 10 × (得点 - 平均) / σ）
- `normalCDF_(z)` — 正規分布の累積分布関数（近似）ヘルパー
- `calcPassProbability_(studentDev, schoolDev)` — 合格可能性計算ヘルパー（A〜E判定 + パーセント）
- `getStudentAnalysisSheet_(year)` — 生徒別AI分析シート取得/作成ヘルパー
- `getStudentAnalysis(year, studentId, testName)` — `@aiCallable` 生徒別AI分析コメント取得（成績表タブ用）
- `generateStudentAnalyses(year, testName)` — 全対象生徒のAI分析を一括生成（Admin のみ。偏差値・合格判定・AIコメントを含む）
- `generateAllAnalyses(year, testName, skipExisting)` — テスト全体分析と生徒別AI分析を1回のGemini APIコールで同時生成・保存（Admin のみ。`generateGradeAnalysis` と `generateStudentAnalyses` を統合。`skipExisting=true` のとき既存データがある分析をスキップして未分析のみ生成）

### セクション9: AI アシスタント
- `replaceOutsideTokens_(text, needle, replacement)` — `[生徒ID:...]`/`[個人名:...]` トークンの外側だけ文字列置換する内部ヘルパー（苗字マッチングで置換済みトークンを二重置換しないために使用）
- `detectGradeFromMessage_(message)` — メッセージ内の学年キーワード（中1〜高3等・全角半角対応）から gradeCode（2桁文字列）を検出する内部ヘルパー
- `detectCampusFromMessage_(message, campusConfig)` — メッセージ内の校舎名から campusCode を検出する内部ヘルパー
- `resolveStudentNamesInMessage_(message, students, campusConfig)` — メッセージ内の生徒氏名を生徒IDまたは伏字に置き換える内部ヘルパー（個人情報保護用）。Phase 1: フルネームマッチング（1人→ID、複数→全ID列挙）。Phase 2: 苗字のみマッチング（学年・校舎の文脈で絞り込み。1人→ID、複数→`[個人名:田中]` 伏字）
- `restoreStudentNamesInResponse_(text, students)` — Geminiの応答テキスト内の `[生徒ID:XXXX]` を氏名に、`[個人名:田中]` を苗字に戻す内部ヘルパー（ユーザー表示用。バックエンドで完結するため氏名が外部に渡ることはない）
- `requestAIAssistant(userMessage, chatHistory)` — `@aiCallable` メインエントリー（意図判定と回答生成を1回のAPI呼び出しで完結。送信前に生徒氏名をIDへ自動置換して個人情報を保護）
- `getAiKnowledgeBase()` — AIナレッジベースの全エントリ取得（Admin のみ）
- `saveAiKnowledgeEntry(entryJson)` — ナレッジベースのエントリ追加・更新（Admin のみ。idがあれば更新、なければ新規）
- `deleteAiKnowledgeEntry(entryId)` — ナレッジベースのエントリ削除（Admin のみ）
- `getAiKnowledgeBaseForPrompt_()` — プロンプト用にナレッジベースをテキスト形式で返す内部ヘルパー
- `applyConfigChange_(settings)` — config_changeの推奨設定をバックエンドで実際に適用する内部ヘルパー（themeColor, aiAssistantName, aiPersonality, displayName）
- `executeAiAction(action, paramsJson)` — `@aiCallable` AIアシスタントの確認済みアクションを実行するエントリーポイント（submit_grade / submit_student / add_schedule）

#### ⚠️【重要】Gemini API 呼び出し時の設計ルール

##### 【最優先原則】API呼び出し回数を最小にすること

Gemini APIには1日・1分あたりの呼び出し回数に制限がある。
**「1つのユーザー操作 = 1回のAPI呼び出し」を原則とし、統合できる処理は必ず統合する。**

| 禁止パターン | 理由 |
|------------|------|
| 意図判定を別コールで先に行い、結果を見てから本処理コール | 2コール消費。1コールで両方できる |
| 前処理・後処理でそれぞれ別コール | 1コールで統合できる場合は必ず統合する |

**統合の方法：** プロンプトに「まず意図を判定し、その意図に応じた回答をそのままJSONで返してください」と指示する。判定と回答が同時に返ってくる。

**ただし、以下の場合は複数回のAPI呼び出しを使ってよい（品質上の理由が明確な場合のみ）：**

| 許可パターン | 具体例 |
|------------|--------|
| 複数回に分けることで明確に精度・品質が上がる処理 | 曖昧な操作指示の解釈（1回目：意図確認 → ユーザー返答 → 2回目：実行） |
| 段階的な処理が必然的に必要なもの | 入力データ検証コールの後に処理コールが必要なケース |
| 1コールに収めるとプロンプトが肥大化して精度が下がる | 非常に複雑な複合タスク |

**判断の目安：** 「統合したほうが速くて同等以上の精度が出るか？」を先に検討し、Yesなら統合する。Noのときだけ複数回を選ぶ。

##### thinkingBudget の使い分け

```javascript
generationConfig: {
  responseMimeType: 'application/json',  // 必須（マークダウン防止）
  thinkingConfig: { thinkingBudget: 0 }  // 下表を参照
}
```

| 用途 | thinkingBudget | 理由 |
|------|---------------|------|
| AIアシスタント（意図判定＋回答を統合） | `0` | 分類＋定型回答。思考不要 |
| 成績AIコメント生成 | `0` | 品質はthinkingより「渡すデータの豊富さ」で決まる |
| チラシAI生成（`generateFlyerWithAI`） | `0` | HTMLテンプレート生成。プロンプトと温度設定で品質が決まる |
| **将来：`handleAppAction`（操作指示）** | **`-1`（自動）** | **曖昧な指示を解釈し聞き返す処理が必要なため** |

**`responseMimeType: 'application/json'` は必須。** これを設定しないと Gemini がマークダウン（```json...```）を返し、JSONパースエラーが発生する。

**thinking パーツの除外処理も必須（安全網として維持する）：**
```javascript
var parts = (result.candidates[0].content.parts || []);
var textPart = parts.filter(function(p) { return !p.thought; }).pop();
var rawText = textPart ? (textPart.text || '') : '';
```

#### 将来の `handleAppAction` 実装時の注意

操作指示（「成績を登録して」「スケジュールを追加して」など）を受け付ける際は：
1. `requestAIAssistant()` のプロンプトに `app_action` の応答形式を追加する（コールは増やさない）
2. 必要なら `handleAppAction_()` を内部ヘルパーとして切り出し、`thinkingBudget: -1` を使う
3. 曖昧なときは `"needsClarification": true` + `"question"` を返してユーザーに聞き返す
4. フロントエンドで `type === "app_action"` かつ `needsClarification === true` のときは質問バブルを表示する

### セクション10: Admin 専用 API
- `getAllScriptPropertiesForGUI()` — 全プロパティ取得（マスク済み）
- `logAdminAction(action, details)` — Admin 操作ログ記録
- `updateScriptPropertyFromGUI(key, newValue)` — プロパティ更新（Admin のみ）
- `deleteScriptPropertyFromGUI(key)` — プロパティ削除（Admin のみ）
- `getDriveContents(folderId)` — Drive フォルダ探索（Admin のみ）
- `uploadPDFToFolder(pdfBase64, fileName, targetFolderId)` — PDF アップロード（Admin のみ）
- `deleteFileFromDrive(fileId)` — ファイル削除（Admin のみ）

### セクション11: フォルダ・シート自動初期化
- `initializeAllSheets()` — 全フォルダ・シート初期化
- `getOrCreateTabFolder(parentFolder, folderName)` — タブフォルダ取得/作成
- `initializeScheduleFolder(scheduleFolder)` — スケジュールフォルダ初期化
- `initializeGradesFolder(gradesFolder)` — 成績管理フォルダ初期化
- `initializeLecturesFolder(lecturesFolder)` — 講習フォルダ初期化
- `initializeUniversitiesFolder(universitiesFolder)` — 進学先フォルダ初期化
- `initializeSettingsFolder(settingsFolder)` — 設定フォルダ初期化
- `getOrCreateYearFolder(parentFolder, year)` — 年度フォルダ取得/作成
- `getOrCreateSpreadsheet(yearFolder, year)` — 予定データシート取得/作成
- `createGradeDataSheet(yearFolder, year)` — 成績データシート作成
- `createAnalysisReportSheet(yearFolder, year)` — 分析レポートシート作成（未使用。AI分析は成績データSS内の「AI分析」シートに保存）
- `createLectureSheet(yearFolder, year)` — 講習管理シート作成（プレースホルダー）
- `createUniversitySheet(yearFolder, year)` — 進学先シート作成（プレースホルダー）
- `createSystemSettingsSheet(settingsFolder)` — システム設定シート作成
- `scheduledInitializeSheets()` — 時間トリガー用（24時間ごと推奨）
- `manualInitializeSheets()` — 手動初期化（Admin のみ）
- `initializeApplication()` — スクリプトプロパティのデフォルト値設定

### セクション12: ユーティリティ
- `recordOperationLog(action, details, status)` — 操作ログ記録
- `getOrCreateOperationLogSheet()` — 操作ログシート取得/作成
- `recordInitializationLog(status, details)` — 初期化ログ記録
- `checkInitializationStatus()` — 初期化状態確認（Admin のみ）
- `extractSchoolFromFileName(fileName)` — ファイル名から学校情報抽出
- `createExtractSchedulePrompt(content, schoolInfo, year)` — Gemini プロンプト生成
- `callGeminiForScheduleExtraction(prompt)` — Gemini API 呼び出し
- `autoImportAllSchedules(year)` — 全形式自動インポート（PDF/CSV/Sheets）
- `normalizeScheduleEvent(event)` — イベントデータ正規化（年除去・範囲処理）
- `importScheduleFromGoogleSheetsWithAI(sheetId, schoolInfo, year)` — Sheets インポート
- `importScheduleFromCSVWithAI(file, schoolInfo, year)` — CSV インポート
- `importScheduleFromPDFWithAI(file, schoolInfo, year)` — PDF インポート
- `getJapaneseHolidaysFromCalendar(startYear, endYear)` — Googleカレンダーの日本祝日を取得（内部ヘルパー・`refreshHolidayCache()` から使用）
- `refreshHolidayCache()` — Googleカレンダーから祝日を取得しスクリプトプロパティ `HOLIDAY_CACHE` にJSON保存（`scheduledInitializeSheets()` から日次で呼ばれる）
- `getCachedHolidays()` — `@aiCallable` キャッシュ済み祝日データを返す（アプリ起動時にフロントエンドが使用）
- `getReAuthorizationUrl()` — GAS権限承認URLを取得する（oauthScopes追加後の再認証用。管理タブ「権限を承認する」ボタンから呼び出される）

### セクション17: Gemini API 使用量トラッキング
- `logGeminiUsage(operationName, usageMetadata)` — Gemini API呼び出し後に使用量をUserPropertiesに記録（日次・月次・操作一覧20件）。各API呼び出し関数の直後に挿入
- `getMyGeminiUsage()` — `@aiCallable` 現在ユーザーのGemini API使用量（個人+チーム）を取得して返す（`{ mine: { today, month }, team: { today, month } }`）。AIアシスタントのプロンプト構築時にバックエンドから直接呼び出して使用量・解除時刻情報を注入

### セクション18: LINEメッセージスケジューラー
#### 内部ヘルパー（`_` 末尾・非公開）
- `getLineSchedulerSheet_()` — システム設定.gs 内の「LINEスケジューラー」シートを取得/作成
- `computeClosedDaysForMonth_(year, month)` — 指定年月の休校日セットを計算（index.html の getClosedDays を再実装 + CLOSED_DAYS_OVERRIDES 適用）
- `isClosedOrSunday_(year, month, day, closedDays)` — 日曜または休校日なら true を返す
- `findPrevOpenDay_(year, month, startDay, closedDays)` — startDay から遡り最初の開校日を返す
- `getMeetingDay_(year, month)` — 全体ミーティング日を計算（index.html の getMeetingDay を再実装）
- `getReportDay_(year, month)` — 回数報告書提出日を計算（index.html の getReportDay を再実装）
- `getDebitDay_(year, month)` — 引落データ送信日を計算（index.html の getDebitDays().debit を再実装）
- `getDayOfWeekJa_(year, month, day)` — 曜日名（日本語）を返す
- `computeShimurochoSendDate_(year, month, closedDays)` — 室長用連絡の送信日（月の最後の開校日から7日前）を計算
- `computeMeetingNotifDate_(year, month, closedDays)` — 全体ミーティング通知日（前日）を計算。戻り値: `{ day, meetingDay }`
- `computeReportNotifDate_(year, month, closedDays)` — 報告書通知日（前日）を計算。戻り値: `{ day, reportDay }`
- `buildMeetingMessage_(year, month, meetingDay)` — 全体ミーティング連絡のデフォルトメッセージを生成
- `buildReportMessage_(year, month, reportDay, sendMonth)` — 回数報告書提出日連絡のデフォルトメッセージを生成（送信月に応じた講習名追加あり）
- `buildShimurochoMessage_(sendYear, sendMonth, sendDay, closedDays)` — 室長用連絡のデフォルトメッセージを生成（月ごとの講習名・引落データ送信日・締切日を動的計算）
- `generateMonthlySchedule_(year, month)` — 指定年月の3種別スケジュールを自動生成（既存エントリがあればスキップ）。meeting/reportは `recipients: ['__ALL__']` で全LINE登録ユーザーへ自動送信。shitsucho のみ手動選択
- `getAllLineRegisteredTeacherIds_()` — LINE_USER_MAPPING に登録されている全 teacherId を返す（meeting/report の全員送信用）

#### 公開API関数（Admin のみ）
- `getLineSchedulerSettings()` — LINEスケジューラーの種別ごとデフォルト設定取得
- `saveLineSchedulerSettings(type, settings)` — 指定種別のデフォルト設定保存（Admin のみ）
- `getScheduledLineMessages(year, month)` — 指定年月のスケジュール一覧取得（未生成なら自動生成して返す）
- `saveScheduledLineMessage(data)` — スケジュール1件を保存（id 一致する行を更新・なければ追加）
- `deleteScheduledLineMessage(id)` — スケジュール1件を削除（Admin のみ）
- `sendScheduledLineMessageNow(id)` — 指定スケジュールを今すぐ手動送信（Admin のみ）。戻り値: `{ success, sentCount, failedEmails }`
- `checkAndSendDueLineMessages()` — 送信予定時刻を過ぎた未送信メッセージを一括送信（時間トリガーから呼ばれる）
- `setupScheduledLineTrigger()` — checkAndSendDueLineMessages を毎時実行するトリガーを設定（Admin のみ）
- `deleteScheduledLineTrigger()` — checkAndSendDueLineMessages のトリガーをすべて削除（Admin のみ）
- `getScheduledLineTriggerStatus()` — トリガーの稼働状態を確認。戻り値: `{ success, active }`
- `getLineSchedulerNotifPrefs()` — `@aiCallable` 現在ユーザーのLINEスケジューラー通知方法設定を種別ごとに取得。戻り値: `{ success, lineRegistered, prefs: {meeting,report,shitsucho}, eligible: {meeting,report,shitsucho} }`
- `updateLineSchedulerNotifPref(type, method)` — `@aiCallable` 現在ユーザーのLINEスケジューラー通知方法を種別ごとに更新（type: 'meeting'/'report'/'shitsucho'、method: 'line'/'gmail'/'both'/'none'）。戻り値: `{ success, message }`

### セクション20: 講習管理

#### 日程自動計算ヘルパー（内部）
- `addDaysLec_(date, days)` — 日数加算して新しいDateを返す
- `formatDateStrLec_(date)` — DateをYYYY-MM-DD文字列に変換
- `getNthWeekdayOfMonth_(year, month, n, dayOfWeek)` — 指定月のN番目の曜日のDateを返す（dayOfWeek: 0=日〜6=土）
- `isHolidayLec_(dateStr)` — HOLIDAY_CACHEを使って祝日判定
- `isWeekendOrHolidayLec_(date)` — 土日祝判定
- `getNextWeekdayLec_(date)` — 指定日以降の最初の平日を返す
- `getFirstWedOnOrAfterLec_(date)` — 指定日以降の最初の水曜日を返す
- `computeBasicTestDateLec_(fiscalYear, testNum)` — 基礎学力テスト日を計算（BASIC_TEST_DATESオーバーライド対応）
- `getPublicHighSchoolExamDateLec_(fiscalYear)` — 公立高校一般選抜日を計算（PUBLIC_HIGH_EXAM_DATESオーバーライド対応。翌年3月第1火曜、1日/2日なら第2火曜）
- `countBackSchoolDays_(endDate, count)` — 終了日前日から遡り日曜・休校日を除いてcount日数えた日を返す（kiso2用）
- `computeDefaultLectureDates_(typeId, fiscalYear)` — タイプ・年度から自動計算日程を返す（`{startDate, endDate}`）

#### 固定種別定数
- `LEC_TYPE_IDS` — 6種別キー配列: `['spring','summer','kiso1','kiso2','winter','nyushi']`
- `LEC_TYPE_NAMES` — 種別キー→表示名マッピング

#### 公開API関数
- `getDefaultGradeSettings_(lectureName)` — 講習名から学年別デフォルト設定を生成（内部ヘルパー。春期: 新中1が50分・2回。夏期/冬期: 中3が6回。基礎学力テスト対策(kiso1/kiso2)・入試直前: 中3のみ有効、他学年は0）
- `getLecturePeriods()` — `@aiCallable` 講習期間一覧取得（現年度・翌年度の6種を自動計算し保存済みオーバーライドをマージ。`_isOverridden`フラグで手動/自動を区別）
- `saveLectureDates(fiscalYear, typeId, startDate, endDate)` — 指定年度・種別の日程を上書き保存（Admin のみ）
- `resetLectureDates(fiscalYear, typeId)` — 指定年度・種別の日程をリセットして自動計算に戻す（gradeSettingsがある場合はエントリを残して日程のみリセット）（Admin のみ）
- `saveLecturePeriod(lectureData)` — 旧フォーマット互換：講習期間保存（Admin のみ。新規時は `gradeSettings` を自動生成、更新時は既存 `gradeSettings` を保持）
- `deleteLecturePeriod(lectureId)` — 旧フォーマット互換：講習期間削除（Admin のみ）
- `saveLectureGradeSettings(lectureId, gradeSettingsJson)` — 指定講習の学年別設定（コマ時間・回数）を上書き保存（Admin のみ。新フォーマットIDで未保存の場合は自動計算日程でエントリを作成）
- `getTeacherNamesMap()` — `@aiCallable` 講師ID→情報マッピングを全ユーザーに返す（グリッド上の講師名解決用）
- `getLectureTeachers()` — 講師一覧取得（Admin のみ。getAllowedUsers ベースで teacherId 付加）
- `getFlyerImages()` — `@aiCallable` チラシ用画像一覧を Drive の assets/flyer フォルダから取得（{id, name, mimeType, tags}[]。tagsは画像タグシートから取得）
- `getFlyerImageBase64(fileId)` — `@aiCallable` DriveファイルIDから画像をbase64エンコードして返す
- `uploadFlyerImage(base64, fileName, mimeType)` — `@aiCallable` チラシ用画像をDriveのassets/flyerフォルダにアップロード（フォルダがなければ自動作成。JPEG/PNG/GIF/WebPのみ許可）。戻り値: `{success, fileId, fileName}`
- `deleteFlyerImage(fileId)` — `@aiCallable` Driveからチラシ用画像をゴミ箱に移動して削除する（画像タグも同時削除）。戻り値: `{success, message}`
- `getFlyerImageTagSheet_()` — 画像タグデータ保存用シート「画像タグ」を取得/作成する内部ヘルパー
- `saveFlyerImageTags(fileId, tags)` — `@aiCallable` チラシ画像の説明タグを保存する（upsert）。戻り値: `{success, message}`
- `getAllFlyerImageTags_()` — 画像タグシートから全タグを一括取得してマップで返す内部ヘルパー
- `deleteFlyerImageTags_(fileId)` — 画像タグシートから指定ファイルIDの行を削除する内部ヘルパー
- `getFlyerConfig(lectureId, campusCode)` — 【非推奨】旧チラシ設定取得（AI生成方式に移行済み）
- `saveFlyerConfig(lectureId, campusCode, configJson)` — 【非推奨】旧チラシ設定保存（AI生成方式に移行済み）
- `getFlyerAiSheet_()` — AIチラシデータ保存用シート「チラシAI」を取得/作成する内部ヘルパー
- `FLYER_DESIGN_PALETTE_` — チラシAI生成用の季節コンテキスト定数（バックエンド専用。spring/summer/winter/general。季節の雰囲気（mood）をAIに伝えるが、配色はAIが自由に選択）
- `FLYER_TYPE_SEASON_MAP_` — 講習typeId → 季節キーのマッピング定数（バックエンド用）
- `buildFlyerDesignPrompt_(seasonKey, hasImage, imageTags, isEditMode)` — 印刷物デザイナー向けの構造化プロンプトを構築する内部ヘルパー（ROLE=紙チラシ専門の印刷物デザイナー / チラシの設計方針=サイズ・ゾーン構成・季節テーマ・紙チラシとしての方針・タイポグラフィ・表スタイル・画像配置・キャッチコピー指針 / MODE / 出力ルール。配色はAIが季節の雰囲気に合わせて自由に選択。ウェブUIではなく印刷用紙チラシである点を明示）
- `generateFlyerWithAI(params)` — `@aiCallable` Gemini APIでA4チラシHTML生成。params: `{ userMessage, chatHistory, systemContext, hasImage, imageTags, currentHtml, seasonKey }`。戻り値: `{ success, html, explanation }`
- `saveFlyerAiData(lectureId, campusCode, html, chatHistoryJson)` — `@aiCallable` スプレッドシートにチラシHTML＋会話履歴保存。campusCode `'common'` = 共通
- `loadFlyerAiData(lectureId, campusCode)` — `@aiCallable` 保存済みAIチラシデータ読み込み。戻り値: `{ success, html, chatHistory, updatedAt }`
- `getDefaultLecturePricing_()` — 講習タイプ別のデフォルト料金データを返す内部ヘルパー（税抜き金額。spring/summer/kiso1/kiso2/winter/nyushi）
- `getLecturePricingConfig()` — `@aiCallable` 講習別料金設定を取得（未設定ならデフォルトで初期化）。戻り値: `{ success, data: { typeId: [{label, internal, external}] } }`
- `saveLecturePricing(typeId, rowsJson)` — 指定講習タイプの料金設定を保存（Admin のみ。rowsJson: `[{label, internal, external}]`）
- `normalizeLecDate_(val)` — Sheets日付値をYYYY-MM-DD文字列に正規化する内部ヘルパー
- `normalizeLecTime_(val)` — Sheets時刻値をHH:MM文字列に正規化する内部ヘルパー
- `getLectureScheduleSpreadsheet_()` — 講習スケジュール用スプレッドシートを取得/作成する内部ヘルパー
- `saveLectureScheduleEntries(lectureId, campusCode, entriesJson)` — 講習スケジュールエントリ一括保存（全置換・LockService使用）
- `getLectureScheduleEntries(lectureId, campusCode)` — `@aiCallable` 講習スケジュールエントリ取得
- `getDistributionFilesFolder_(lectureId, campusCode)` — 配布物PDF保存フォルダを取得/作成する内部ヘルパー（ルート→配布物/{lectureId}/{campusCode}/）
- `saveDistributionFile(lectureId, campusCode, fileName, pdfBase64)` — `@aiCallable` 配布物PDFをDriveに保存する。戻り値: `{success, fileId, fileName, message}`
- `listDistributionFiles(lectureId, campusCode)` — `@aiCallable` 指定講習・校舎の保存済み配布物PDF一覧を取得する（フォルダ未存在時は空配列。新しい順）。戻り値: `[{id, name, createdDate, size}]`
- `deleteDistributionFile(fileId)` — `@aiCallable` 配布物PDFをDriveのゴミ箱に移動して削除する。戻り値: `{success, message}`
- `translateToImagePrompt_(japanesePrompt)` — 日本語プロンプトをGemini Flashで画像生成用の英語プロンプトに翻訳する内部ヘルパー
- `generateImageWithImagen(japanesePrompt, aspectRatio)` — `@aiCallable` Imagen 4.0 Ultra で画像を生成し、Drive の assets/flyer フォルダに保存する。日本語プロンプトを受け取り英語に翻訳してから Imagen に渡す。戻り値: `{success, fileId, fileName, base64, mimeType, englishPrompt}`

### セクション19: 料金表管理
- `getDefaultPricingData_()` — デフォルトの料金表データを返す内部ヘルパー
- `getPricingConfigForWeb()` — `@aiCallable` 料金表データを取得（未初期化ならデフォルトで初期化）
- `savePricingConfig(jsonData)` — 料金表データを一括保存（Admin のみ）
- `addPricingSection(sectionName, headersJson)` — セクション追加（Admin のみ）
- `deletePricingSection(sectionId)` — セクション削除（Admin のみ）
- `updatePricingTitle(newTitle)` — タイトル更新（Admin のみ）
- `updatePricingFooterNotes(notesJson)` — フッター注記更新（Admin のみ）

### セクション13: 基礎学力テスト日程管理 / 予定タブ固定イベント上書き管理
- `getBasicTestDateOverrides()` — `@aiCallable` 上書き設定を全取得（`{"2025-1": "2025/10/01", ...}`）
- `setBasicTestDateOverride(academicYear, testNum, dateStr)` — 上書き設定を保存（Admin のみ）
- `deleteBasicTestDateOverride(academicYear, testNum)` — 上書き設定を削除し自動計算に戻す（Admin のみ）
- `getBasicTestDetails()` — `@aiCallable` 基礎学力テスト詳細テキストの上書き設定を取得（`{"2025-1": "中3 全員", ...}`）
- `setBasicTestDetails(academicYear, testNum, details)` — 詳細テキスト上書き保存（Admin のみ）
- `deleteBasicTestDetails(academicYear, testNum)` — 詳細テキスト上書き削除してデフォルト（中3）に戻す（Admin のみ）
- `getPublicHighExamDateOverrides()` — `@aiCallable` 公立高校一般選抜の日程上書き設定を全取得（`{"2025": "2026/03/11"}`）
- `setPublicHighExamDateOverride(academicYear, dateStr)` — 上書き保存（Admin のみ）
- `deletePublicHighExamDateOverride(academicYear)` — 上書き削除して自動計算に戻す（Admin のみ）
- `getJukuEventOverrides()` — `@aiCallable` 塾内部イベント（○□★△）上書き設定を全取得（`{"report_2025_4": {"date":"2025/4/21","details":""}, "meeting_2025_4": false, ...}`）
- `setJukuEventOverride(type, year, month, dateStr, details)` — 上書き保存。`dateStr="none"` で無効化（Admin のみ）
- `deleteJukuEventOverride(type, year, month)` — 上書き削除して自動計算に戻す（Admin のみ）
- `getClosedDayOverrides()` — `@aiCallable` 予定タブ専用の休校日上書き設定取得（`{add:["YYYY-MM-DD",...], del:[...]}`）
- `addClosedDayExtra(dateStr)` — 臨時休校日を追加（Admin のみ）
- `removeComputedClosedDay(dateStr)` — 計算上の休校日を開校日に変更（Admin のみ）
- `deleteClosedDayOverride(dateStr)` — 休校日の上書き設定を削除して元に戻す（Admin のみ）
- `getLectureDeadlineOverrides()` — `@aiCallable` 講習日程締切の手動上書き設定を全件取得（`{"lectureId": "YYYY-MM-DD"}`）
- `setLectureDeadlineOverride(lectureId, dateStr)` — 指定講習の締切日を手動上書き保存（Admin のみ）
- `deleteLectureDeadlineOverride(lectureId)` — 指定講習の締切日上書き設定を削除して自動計算に戻す（Admin のみ）

### セクション15: LINE通知・お問い合わせ通知機能
- `doPost(e)` — LINE Webhook ハンドラー。ユーザーがメールアドレスを送ると LINE User ID 自動登録・Drive フォルダに Editor 権限付与・管理者へ通知メール送信（自己登録方式）。セクション3（Web App エントリーポイント）内に配置
- `sendLineReply_(replyToken, message)` — LINE 返信送信（内部ヘルパー・doPost 内のみ使用）
- `sendLineMessage(lineUserId, message)` — LINE プッシュ通知送信
- `sendNotification(teacherId, subject, body)` — `@aiCallable` 通知送信（teacherId からメールを解決し Gmail/LINE/両方を自動判定）
- `getNotificationSettings()` — `@aiCallable` 現在ユーザーの通知設定取得（isEligible・method・lineRegistered・registeredEmail）。isEligible は CAMPUS_NOTIFICATION_ROUTING に自分の teacherId が含まれるかで判定
- `updateNotificationSettings(method)` — `@aiCallable` 通知方法更新（gmail/line/both/none）
- `getNotificationMembers()` — CAMPUS_NOTIFICATION_ROUTING 内の全 teacherId を重複排除で取得（Admin のみ）
- `getLineRegisteredUsers()` — LINE 経由で自己登録済みのユーザー一覧取得（Admin のみ・teacherId ベース）。TEACHER_ID_MAP から名前を取得
- `getLineUserMapping()` — LINE User ID マッピング一覧取得（Admin のみ・確認用）
- `getCampusNotificationRouting()` — 校舎ごとの通知振り分け設定を全件取得（Admin のみ・teacherIds 配列を返す）
- `updateCampusNotificationRouting(campusCode, teacherIds)` — 指定校舎の通知振り分け先 teacherId 一覧を更新（Admin のみ）
- `sendNotificationByContent(subject, body)` — `@aiCallable` 本文の「校舎名:」から校舎を特定して自動振り分け送信
- `checkAndForwardFormEmails()` — noreply@web-cms.jp（設定変更可能）からの未処理メールを検索し校舎別に自動転送（時間トリガーから呼ばれる）
- `getFormEmailFilterSettings()` — フォームメール自動転送の送信元フィルター設定を取得（Admin のみ）
- `saveFormEmailFilterSettings(sender)` — フォームメール自動転送の送信元フィルター設定を保存（Admin のみ）
- `setupFormEmailTrigger()` — フォームメール自動転送の5分間隔トリガーを設定（Admin のみ）
- `deleteFormEmailTrigger()` — フォームメール自動転送のトリガーを削除（Admin のみ）
- `getFormEmailTriggerStatus()` — フォームメール自動転送トリガーの稼働状態を確認

### セクション16: 設定引き継ぎ機能
- `exportUserSettings()` — `@aiCallable` 引き継ぎコード発行。UserPropertiesの全設定をシステム設定シート「引き継ぎデータ」に保存し、講師IDを返す
- `importUserSettings(transferCode)` — `@aiCallable` 引き継ぎコードで設定復元。スプレッドシートから講師IDで検索し、UserPropertiesに全設定を復元。別アカウントからの引き継ぎ時は旧アカウントを自動ブロック
- `registerBlockedAccount_(ss, oldEmail, newEmail, transferCode)` — 旧アカウントをブロック対象として記録する内部ヘルパー
- `checkAccountBlocked()` — `@aiCallable` 現在のアカウントがブロック済みかチェック。アプリ起動時にフロントエンドから呼び出される
- `unblockAccount(email)` — ブロック済みアカウントを解除する（Admin のみ。誤ブロック時の復旧用）

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
- **`appsscript.json` の `webapp` 設定はGASの既存デプロイには反映されない**: `clasp deploy --deploymentId <ID>` で既存デプロイを更新する場合、`appsscript.json` の `webapp.access` / `webapp.executeAs` はコードには反映されるが、デプロイの実行設定（誰が実行・誰がアクセス可）には反映されない。これらを変更するにはGASエディタの「デプロイを管理」から手動で変更する必要がある。**2デプロイ構成**（理由: `ANYONE` と `ANYONE_ANONYMOUS` の両立が単一デプロイでは不可能なため）: アプリ用デプロイ `AKfycbyqwdCC...` は `access=ANYONE`（Googleアカウントが必要）＋**`executeAs=USER_ACCESSING`（アクセスしているユーザーとして実行）** で動作し `Session.getActiveUser().getEmail()` と `PropertiesService.getUserProperties()` が各ユーザー固有のデータを返す。LINE Webhook専用デプロイ `AKfycbx94J2E...` は `access=ANYONE_ANONYMOUS`（Googleアカウント不要）で動作しLINEの未認証POSTリクエストを受け取る。⚠️ `ANYONE_ANONYMOUS` のデプロイでは `Session.getActiveUser().getEmail()` が常に空文字列を返すため、アプリのアクセスチェック（`isAllowedUser()`）で全員が拒否される。LINE Webhook専用以外の用途には絶対に使わないこと。
- **⚠️【重要】`PropertiesService.getUserProperties()` は `USER_DEPLOYING` では全ユーザーで管理者データを返す**: このため、ユーザーごとのデータ（プロフィール・設定など）は `getUserProperty()` / `setUserProperty()` ヘルパーを通じて ScriptProperties に `_UP_{safeEmail}_{key}` 形式で保存している（`settings.js` の `getSafeUserKey_()` ヘルパー参照）。`PropertiesService.getUserProperties()` を直接使うことは禁止。ユーザーデータの読み書きは必ず `getUserProperty()` / `setUserProperty()` を使うこと。
- **デプロイの `paths` フィルター**: `deploy-to-gas.yml` は `*.js`/`*.html`/`appsscript.json`/`.github/workflows/*.yml` が変更されたときのみ GAS デプロイを実行する。`README.md`/`CLAUDE.md` のみの変更ではデプロイは実行されない（ただし `merge-to-main.yml` が main へのマージは行う）。新しいファイル種別を GAS に送る必要がある場合は `paths` への追記も忘れないこと。報告文の使い分けはセクション0「プッシュ後の報告文ルール」を参照。

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
- CLAUDE.md セクション9「対応済みの要素一覧」を更新しない

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

---

## Firebase 完全移行ロードマップ

> **Claudeへの指示：** このセクションのタスクを上から順番に実施すること。
> 完了したタスクは削除する。ユーザーへの確認が必要な場合はその旨を伝えてから作業する。
> 新しいセッションが始まったら、このセクションを確認して未完了タスクから再開すること。

### 背景・方針
- **フェーズ1**（GAS配信のまま）: Firebase Auth + Firestore直接アクセスを追加。`google.script.run` はそのまま使い続ける。
- **フェーズ2**（完全移行）: フロントを Firebase Hosting に移行し、GAS をAPIサーバーとして整備。`google.script.run` を fetch() に置き換える。

### firebaseConfig（設定済み）
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDGxhgsCbpgJuXm6PzY1WcR8a4QOtfJBiU",
  authDomain: "fir-quire.firebaseapp.com",
  projectId: "fir-quire",
  storageBucket: "fir-quire.firebasestorage.app",
  messagingSenderId: "132033293964",
  appId: "1:132033293964:web:13ec63fbda39e82e5995a9"
};
```

---

### フェーズ1: Firebase Auth + Firestore直接アクセス（GAS配信のまま）

- [ ] **1-1. Firestoreセキュリティルールの更新**
  - `firestore.rules` ファイルを作成（Firebase Auth で認証済みユーザーのみ読み書き可能）
  - `firebase.json` を作成
  - GitHub Actions ワークフロー（`deploy-firebase.yml`）を作成してルールを自動デプロイ
  - 完了条件: GitHub Actions が成功し Firebase console でルールが反映されていること

- [ ] **1-2. Firebase SDK を GAS の HTML に追加**
  - `index.html` に Firebase App・Auth・Firestore の CDN script タグを追加
  - `firebase-init.html` を新規作成（初期化コード）
  - `index.html` に `<?!= include('firebase-init') ?>` を追加

- [ ] **1-3. Firebase Auth（Googleログイン・アカウント切り替え）の実装**
  - アプリ起動時に Firebase Auth の状態を確認
  - 未ログイン → Googleログインボタンを表示
  - ログイン済み → 現在の GAS 認証フローの代わりに Firebase Auth のメールアドレスを使用
  - ヘッダーのプロフィールアイコンにアカウント切り替え機能を追加（signInWithPopup + prompt: select_account）
  - ログアウトボタンを追加

- [ ] **1-4. Firestore直接READ: 生徒データ**
  - `getStudentListWithGrades` → Firebase SDK に移行
  - `getStudentsForDropdown` → Firebase SDK に移行
  - `getMasterData` → Firebase SDK に移行
  - `getStudentNameById` → Firebase SDK に移行

- [ ] **1-5. Firestore直接READ: 成績データ**
  - `getGradeDataByStudentAndTest` → Firebase SDK に移行
  - `getStudentGradeReport` → Firebase SDK に移行
  - `getStudentsWithGradesByTest` → Firebase SDK に移行
  - `getStudentListWithGrades` → Firebase SDK に移行

- [ ] **1-6. Firestore直接READ: スケジュール・その他**
  - `getScheduleData` → Firebase SDK に移行
  - `getLectureScheduleEntries` → Firebase SDK に移行
  - `getLineSchedulerMessages` 系 → Firebase SDK に移行

- [ ] **1-7. Firestore直接WRITE: 生徒・成績**
  - `submitStudentInfo` → Firebase SDK に移行
  - `submitGradeData` → Firebase SDK に移行
  - `updateStudentInfo` → Firebase SDK に移行
  - `deleteStudent` / `restoreStudent` → Firebase SDK に移行

- [ ] **1-8. GAS関数の認証モデル更新（フェーズ1最終）**
  - `Session.getActiveUser().getEmail()` を使っている関数を Firebase Auth のメールに対応させる
  - `isAdmin()` / `getCurrentUserEmail()` をトークン検証ベースに更新
  - フェーズ1完了確認

---

### フェーズ2: Firebase Hosting への完全移行（フェーズ1完了後に着手）

- [ ] **2-1. ビルドスクリプト作成**
  - GAS HTML テンプレート（`<?!= include(...) ?>`）を展開して静的 HTML に変換する Node.js スクリプト（`build.js`）を作成
  - `public/` ディレクトリに出力

- [ ] **2-2. Firebase Hosting デプロイ設定**
  - `firebase.json` に Hosting 設定を追加
  - `deploy-firebase.yml` に Firebase Hosting デプロイステップを追加

- [ ] **2-3. `google.script.run` の fetch() シム実装**
  - `public/js/gas-bridge.js` を作成（既存の全 `google.script.run` 呼び出しをそのまま動かすプロキシ）
  - GAS `doPost()` に外部からの API コール受付ロジックを追加（LINE Webhook と共存）
  - Firebase ID トークンをリクエストに含めて GAS 側で検証

- [ ] **2-4. GAS 認証モデルの更新**
  - `doPost()` で Firebase ID トークンを検証する `verifyFirebaseToken_()` 関数を追加
  - `isAdmin()` / `getCurrentUserEmail()` をトークンベースに完全移行
  - `Session.getActiveUser()` への依存を全廃

- [ ] **2-5. 全機能の動作確認・本番切り替え**
  - Firebase Hosting URL（`fir-quire.web.app`）で全タブ・全機能をテスト
  - GAS の `doGet()` による HTML 配信コードを削除
  - CLAUDE.md のこのセクションを削除して移行完了を記録

---

## 英単語アプリとの連携
英単語アプリのパス：/home/user/englishtest
別プロジェクトを参照する場合は以下のコマンドを使う：
cd /home/user/englishtest && CLAUDECODE= claude -p '質問内容' --output-format stream-json --verbose --allowedTools "Read,Grep,Glob" --max-turns 5 | jq -rj '(.event.delta.text? // empty), (.message.content[]?.text? // empty)'
