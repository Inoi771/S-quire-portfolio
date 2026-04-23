改訂版 CLAUDE.md です。

markdown# S-quire — プロジェクト設計書

> このファイルは Claude Code がセッション開始時に自動で読み込む設計書。
> ユーザーはプログラミング完全初心者。常に日本語で返答すること。

---

## 0. Claude への自動実行ルール

### 🚨 本番環境移行済み（2026-04-10〜）

**このアプリは本番環境で実際に使用されています。以下のルールを最優先で守ること。**

| ルール | 内容 |
|--------|------|
| **大きな修正の禁止** | 不具合が起きるリスクのある大規模なコード変更・リファクタリング・機能の大幅な改修はしない |
| **データ変更の慎重化** | Firestore・Supabase・スプレッドシートのスキーマ変更・マイグレーション・データ削除は原則禁止。どうしても必要な場合はユーザーに必ず確認する |
| **スコープを最小に** | 修正は「要求された箇所だけ」に限定する。ついでに周辺コードを整理・改善しない |
| **確認を強化** | 既存の動作に少しでも影響する可能性がある変更は、必ずユーザーに確認してから実施する |
| **プラン先行** | ユーザーが最初にプランの提示を求めていない場合でも、大きな修正となるときはコードを書く前に必ずプランを提示し、承認を得てから実施する |

> 「動いているものを壊さない」を最優先とすること。

#### 不具合発生時の対応方針

何か壊れた・動かなくなった場合は、以下の順で対応する：

1. **直前のコミットを特定する** — `git log --oneline -10` で直前の変更を確認
2. **該当ファイルを元に戻す** — `git show <コミットID>:<ファイル名>` で旧内容を確認し、Edit ツールで戻す
3. **修正コミットをプッシュ** — 「リバート: ○○」のメッセージでコミットしてプッシュ
4. **原因を特定してから再実装** — 同じ方法で再実装せず、原因を確認してから慎重に再挑戦する

> ⚠️ `git reset --hard` や `git push --force` はデータ消失のリスクがあるため、ユーザーの明示的な許可なく実行しない。

#### 新機能追加の原則

新機能を追加する際は、以下を守ること：

| 原則 | 内容 |
|------|------|
| **既存コードに触れない** | 既存の関数・処理は書き換えず、新しい関数・ファイルとして追加する |
| **呼び出し箇所を最小に** | 既存コードへの接続は「呼び出しを追加するだけ」に留め、既存ロジックを変更しない |
| **段階的に実装** | 大きな機能は小さなステップに分けて1つずつ実装・確認する |
| **独立して動作させる** | 新機能が壊れても既存機能に影響しない設計を選ぶ |

#### プッシュ前チェックリスト

コードをプッシュする前に、以下を必ず確認する：

- [ ] **`git fetch origin && git merge origin/main` を実行して最新の main を取り込んだか？**（他ブランチの変更が上書きされるのを防ぐため、プッシュ直前に必ず実行する）
- [ ] 既存の機能を壊していないか？（変更していないファイルは触っていないか）
- [ ] 修正スコープは要求された箇所だけに限定されているか？
- [ ] 大きな変更の場合、ユーザーのプラン承認を得ているか？
- [ ] データの削除・スキーマ変更を伴う場合、ユーザーに確認したか？
- [ ] 関連する `.md` ファイルの更新が必要な場合、更新したか？

> **なぜ必要か**: このプロジェクトは複数の `claude/` ブランチが並行してデプロイする。各ブランチは自分のファイルだけを Firebase に上書きするため、他ブランチの変更を取り込まずにプッシュすると、その変更が消えてしまう。`git merge origin/main` で常に最新の状態を確保してからプッシュすること。

---

### 大前提：このプロジェクトはセットアップ完了済み

**Claude がやることは「コードを編集して git push するだけ」。**

| 状態 | 詳細 |
|------|------|
| リポジトリ | `square1995/S-quire` |
| デプロイ | `claude/` で始まるブランチへのプッシュで自動デプロイ |
| アプリURL | `https://fir-quire.web.app` |
| 反映時間 | GAS: 約1〜2分 / Firebase Hosting: 約2〜3分 |

**絶対禁止：** clasp インストール案内・clasp login 実行・GASエディタでの手動デプロイ案内・scriptId の確認・認証操作。詳細は `DEPLOY.md` 参照。

---

### コミュニケーションルール

| ルール | 内容 |
|--------|------|
| 言語 | 常に日本語 |
| 専門用語 | 避ける。使う場合は平易な言葉で補足 |
| 作業報告 | 完了後は「何を変えたか」をユーザーへの影響中心に箇条書き |
| 画面テキスト | 技術的詳細は表示しない（管理タブ内は例外） |

---

### 確認が必要なケース

作業前にユーザーに確認すること：
- 要求が曖昧で複数の実装方法がある
- 既存の動作を変更する可能性がある
- データの削除・リセットを伴う

確認不要で自動実行：コードのバグ修正・gitバックアップ・CLAUDE.md の更新

---

### 自動化・モバイルUXの提案

作業完了後、自動化できる余地やスマートフォン操作性の改善点があれば以下の形式で提案する：
```
💡 **自動化の提案** / 📱 **スマートフォン操作性の提案**
・現状: 〜
・改善案: 〜
・メリット: 〜
やってみますか？
```

---

### 大きな変更前の自動バックアップ

以下の作業前は確認なしに git コミットを作成する：
新機能追加・既存機能の大幅修正・関数の削除リネーム・ファイル構造変更・複数ファイルにまたがる変更
```
作業前バックアップ: [作業内容]
```

不要なケース：コメントのみの変更・CLAUDE.md のみの更新・軽微な誤字修正

---

### 参照ファイルの自動読み込みルール

| ファイル | 読み込むタイミング |
|---------|-----------------|
| `FUNCTIONS-frontend.md` | index.html / js-*.html の関数を呼び出す・修正する・新関数を追加する前 |
| `FUNCTIONS-backend.md` | *.js GAS の関数を呼び出す・修正する・新関数を追加する前 |
| `BUGS.md` | 新機能を実装する前（Sheets書き込み・JSON処理・非同期処理・UI追加を含む場合は必ず） |
| `DEPLOY.md` | デプロイ設定・appsscript.json・認証情報を確認する必要があるとき |
| `CODING.md` | 新関数追加・PDF出力・校舎ドロップダウン実装時 |
| `DATA.md` | スクリプトプロパティ・シート列構成・Firestoreコレクションを確認するとき |
| `DESIGN.md` | ID管理・fitToScreen・padStart問題・Drive作成ポリシーを確認するとき |

---

### プッシュ後の報告文ルール

| 変更ファイル | 報告文 |
|------------|--------|
| `.js` `.html` `appsscript.json` `.github/workflows/*.yml` を含む | 「GitHubにプッシュしました。1〜2分後にアプリに反映されます。」 |
| `README.md` `CLAUDE.md` 等のみ | 「GitHubにプッシュしました。今回はデプロイは実行されませんが、変更は自動で main ブランチに保存されます。」 |

ユーザーが「デプロイしてほしい」と明示したがトリガー対象外の場合は `code.js` 末尾に `// 更新 YYYY-MM-DD` を追加してデプロイを発火させること。

---

### ドキュメント自動更新ルール

**大原則：コードを変更したら、関連するすべての .md ファイルの記載内容を最新の状態に更新すること。**
特定のトリガーに限らず、.md ファイルに記載されている内容と実際のコードに差異が生じた場合は、確認なしに更新する。
対象: `CLAUDE.md` / `DATA.md` / `DESIGN.md` / `CODING.md` / `BUGS.md` / `README.md` / `FUNCTIONS-frontend.md` / `FUNCTIONS-backend.md`

以下のトリガーで確認なしに更新する：

| トリガー | 更新箇所 |
|---------|---------|
| 新しいフロントエンド関数を追加 | `FUNCTIONS-frontend.md` を更新 |
| 新しいバックエンド関数を追加 | `FUNCTIONS-backend.md` を更新 |
| タブ・サブタブを追加 | CLAUDE.md セクション8 ＋ 管理ガイド（index.html `admin-guide`） |
| スクリプトプロパティの追加・変更・削除・移行 | DATA.md ＋ 管理ガイド（index.html `admin-guide` のプロパティ一覧） |
| Firestoreコレクションの追加・変更 | DATA.md（Firestoreコレクション構成） |
| Driveフォルダ構成変更 | CLAUDE.md セクション4 ＋ 管理ガイド（index.html `admin-guide`） |
| 未実装機能を実装 | CLAUDE.md セクション11 |
| 新たな設計判断・制約 | DESIGN.md |
| ファイルを追加・削除 | CLAUDE.md セクション2（ファイル構成）＋ README.md のファイル構成 |
| 機能を追加・変更 | README.md の「できること」セクション |
| 技術スタック変更（モデル名等） | CLAUDE.md セクション3 ＋ README.md の技術情報 |

更新後「CLAUDE.md / README.md / 管理ガイドを更新しました（理由: ○○）」と報告する。

---

### Phase 移行 コミットメッセージルール

Workers 移行 Phase（Phase 6-A-N 等）のコミットメッセージ body 末尾には必ず以下を含める：

- **動作確認チェックリスト** — 対象関数ごとに UI 操作手順・想定成功表示・想定エラー文言を
  Markdown タスクリスト（`- [ ]`）形式で記載
- **GAS 版との差分** — 意図的に変えた挙動があれば明記。無い場合は「完全一致」と明記

このリポジトリは `claude/**` への push 時に `merge-to-main.yml` が自動で main へ merge するため
PR は作成されない。チェックリストは PR description ではなく commit message body に置く。

---

### 作業完了後に毎回行うこと

1. 変更内容を日本語で報告
2. プッシュ後の報告文ルールに従って案内
3. `.js` `.html` `appsscript.json` を含む変更をプッシュした場合、GASデプロイカウンターを +1 して更新
   - 180以上: 警告文を追記し「現在N回目です。⚠️ GASプロジェクトの履歴が限界に近づいています。GASエディタの『デプロイを管理』から古いバージョンを削除してください。」と報告
   - ユーザーが「削除しました」と伝えた場合のみ: カウンターを1にリセット

---

## GASデプロイカウンター

**現在のデプロイ回数: 38**

> GASプロジェクト履歴の上限は200件。180回で警告。

---

## 1. アプリ概要

| 項目 | 内容 |
|------|------|
| アプリ名 | S-quire（読み：**スクワイア**） |
| 名前の由来 | 「**Square**（個別指導スクエア）」＋「**Esquire**（従者・見習い騎士）」の造語。塾名を含みつつ、生徒を支える存在という意味 |
| 種別 | Firebase Hosting（フロント） + Google Apps Script（バックエンドAPI） |
| 用途 | 個別指導スクエア（個別指導塾）向け業務管理ダッシュボード |
| 言語 | JavaScript (GAS) / HTML / CSS |

> ⚠️ このアプリは「学校」向けではなく「個別指導スクエア」という「個別指導塾」のもの。「学校」と呼ばないこと。

### できること
- **月間スケジュール** — カレンダー表示・Gemini AIで自動抽出・登録
- **成績管理** — 生徒情報CRUD・成績入力・Gemini OCRで一括取り込み
- **設定** — テーマカラー・プロフィール・AIアシスタント名
- **管理（Admin のみ）** — スクリプトプロパティ管理・Driveファイル操作・ログ閲覧
- **AI アシスタント** — ヘッダーのウィジェットから Gemini に質問・設定変更依頼・会話から自動学習（自己成長機能）・講師配置の照会（「○○先生は今日どこ？」「今日○○校には誰がいる？」等）・講習日程の照会（「私のコマを教えて」「自分の講習日程は？」等）・講習カレンダーエクスポート（「カレンダーに追加して」でICSダウンロード＋Googleカレンダーインポート）

### 利用者
- **管理者（Admin）**: アプリの設定・ユーザー管理を行う（通常1〜2名）
- **スタッフ（講師）**: 日常業務で使用する主要ユーザー。スケジュール確認・成績入力・AI機能等を利用
- **全員がスマートフォンで操作**。ITに不慣れなスタッフが多いため、UIは直感的・シンプルであること
- 管理者以外のスタッフも全機能（管理タブ以外）にアクセスできる

---

## 2. ファイル構成
```
MyProject/
├── code.js              定数・doGet/doPost・include()（約430行）
├── auth.js              認証・ロール管理（約770行）
├── schedule.js          スケジュール管理・基礎学力テスト・公立平均点（約930行）
├── grades.js            成績マスタ設定CRUD（約630行）
├── students.js          生徒CRUD・成績データ（約1940行）
├── analysis.js          AI成績分析・生徒別AI分析（約1660行）
├── settings.js          設定・プロフィール・引き継ぎ（約760行）
├── admin.js             Admin API・初期化・ユーティリティ（約1700行）
├── line.js              LINE通知・LINEスケジューラー（約1700行）
├── features.js          AIアシスタント・料金表・講習管理・AI自動学習（約4360行）
├── backup.js            Firestoreバックアップ機能（Firestore→スプレッドシート定時バックアップ）（約330行）
├── index.html           HTMLシェル（約3240行）
├── styles.html          CSS（約1920行）
├── js-core.html         JS: 初期化・タブ制御・スケジュール・設定（約2340行）
├── js-lectures.html          JS: 講習管理タブ（約1660行）
├── js-lectures-admin.html    JS: 管理タブ 通常設定・講習設定（約780行）
├── js-lectures-materials.html JS: 内部配布物（約980行）
├── js-lectures-flyer.html    JS: 外部チラシ（約1200行）
├── js-lectures-imagen.html   JS: 画像生成（約290行）
├── js-pricing.html      JS: 料金表・年間カレンダー（約1510行）
├── js-grades.html       JS: 成績管理・分析（約1910行）
├── js-grades-list.html  JS: 一覧表タブ（約1800行）
├── js-grades-placement.html JS: 進学先タブ（約340行）
├── js-grades-report-pdf.html JS: 成績表PDF出力（約660行）
├── js-admin.html        JS: Admin管理・LINEスケジューラー（約1550行）
├── js-admin-ext.html    JS: Admin続き・固定イベント・AIアシスタント（約2270行）
├── js-admin-lec-deadline.html JS: 講習日程締切管理（約200行）
├── js-ai-actions.html   JS: AIアシスタント アクション実行（約350行）
├── js-admin-chatbot.html JS: チャットボット管理・AI自動学習管理（約490行）
├── js-easter-egg.html   JS: イースターエッグ（隠し機能・Clockwork Wonderland）（約310行）
├── js-placement.html    JS: 講師配置表・曜日別配置・PDF出力（約380行）
├── js-minutes.html      JS: 議事録管理・音声文字起こし・要約（約350行）
├── gas-bridge.html      JS: google.script.run → fetch() 変換シム
├── firebase.js          Firestore REST APIクライアント
├── supabase.js          Supabase REST APIクライアント（成績データ用）
├── firebase-init.html   Firebase 初期化（<head>内ロード）
├── firebase-auth.html   Firebase Auth管理（<head>内ロード）
├── firebase-schedule.html Firebase スケジュール・講習クライアント関数
├── firebase-students.html Firebase 生徒データクライアント関数（成績関連はGAS API経由）
├── minutes.js           議事録管理・AI文字起こし＋要約（約250行）
├── kv-props.js          Phase 5-E-4/5: ScriptProperties ラッパー（getProperty_/setProperty_/deleteProperty_ + 5-E-5 で getAllProperties_ 追加）— Workers KV 経由に切替え・SP フォールバック付き（約330行）
├── migrate.js           移行スクリプト（完了済み・削除不要）
├── migrate-to-supabase.js Firestore→Supabase移行スクリプト（一度だけ実行）
├── migrate-props-to-kv.js Phase 5-E-3: ScriptProperties→Cloudflare KV 一括コピー（一度だけ実行）
└── CLAUDE.md            この設計書
```

**バックエンド設計:** GAS では全 `.js` ファイルが同じグローバル名前空間を共有。定数は `code.js` 内で `var` 宣言（`const` はファイルスコープのため禁止）。

---

## 3. 技術スタック

| 技術 | 用途 |
|------|------|
| Google Apps Script | サーバーサイド処理 |
| Firebase Hosting | フロントエンド配信 |
| SpreadsheetApp | データ読み書き |
| DriveApp | Drive操作 |
| PropertiesService | 設定値の永続化 |
| UrlFetchApp | Gemini API呼び出し |
| Gemini API (gemini-3.1-flash-lite-preview) | スケジュール抽出・OCR・AIアシスタント |
| Firebase Auth | ユーザー認証（Googleログイン） |
| Firestore | クライアント直接読み書き＋セキュリティルール（生徒マスタ・スケジュール等） |
| Supabase (PostgreSQL) | 成績データ・分析結果の保存（REST API経由、Firestore読み取り上限対策） |

---

## 4. Google Drive フォルダ構成
```
[ルートフォルダ] (APP_FOLDER_ID)
├── 月間スケジュール/ → 年度フォルダ → 予定データ.gs
├── 成績管理/ → 年度フォルダ → 成績データ.gs
├── 講習管理/ （将来実装）
├── 高校別進学先/ （将来実装）
├── 設定/ → システム設定.gs
├── 生徒マスタ/ → 生徒マスタ.gs
├── 配布物/ → {lectureId}/ → {campusCode}/ → *.pdf
└── assets/ → logo.png・favicon.png
```

---

## 5. スクリプトプロパティ

詳細は `DATA.md` 参照。

主要プロパティ：
- `GEMINI_API_KEY` — AI機能全般
- `GEMINI_API_KEY_BACKUP` — 予備AIキー（レート制限時に自動切替・任意）
- `APP_FOLDER_ID` — **必須**。未設定時は全機能停止
- `ADMIN_EMAILS` — Admin権限管理
- `SUPABASE_URL` — Supabase プロジェクトURL（成績データ用）
- `SUPABASE_ANON_KEY` — Supabase anon（公開）キー（成績データ用）
- `SUPABASE_SERVICE_KEY` — Supabase service_role キー（成績データ用）

---

## 6. データ構造

詳細は `DATA.md` 参照。

- 生徒ID形式: `{校舎CD2桁}{登録年度4桁}{登録学年コード2桁}{連番2桁}`
- Firestoreコレクション: `students` / `grades` / `schedules` 等

---

## 7. バックエンド セクション配置

| ファイル | セクション | 内容 |
|---------|-----------|------|
| `code.js` | S1+S3 | 定数・`doGet()`・`doPost()` |
| `auth.js` | S2 | 認証・ロール管理 |
| `schedule.js` | S4+S13+S14 | スケジュール・基礎学力テスト・公立平均点 |
| `grades.js` | S7 | 成績マスタ設定CRUD |
| `students.js` | S8 | 生徒CRUD・成績upsert・OCR |
| `analysis.js` | S8-B | AI成績分析・生徒別AI分析 |
| `settings.js` | S5+S6+S16 | 設定・プロフィール・引き継ぎ |
| `admin.js` | S10+S11+S12 | Admin API・初期化・ユーティリティ |
| `line.js` | S15+S17 | LINE通知・LINEスケジューラー |
| `features.js` | S9+S18+S19 | AIアシスタント・料金表・講習管理 |
| `minutes.js` | S20 | 議事録管理・AI文字起こし＋要約 |

---

## 8. タブ・サブタブ構成

### メインタブ

| タブID | 表示名 | 状態 |
|--------|--------|------|
| `schedule` | 予定 | 実装済み |
| `grades` | 成績管理 | 実装済み |
| `lectures` | 講習管理 | 実装済み |
| `universities` | 資料 | 実装済み |
| `settings` | 設定 | 実装済み |
| `admin` | 管理 | 実装済み（isAdminのみ） |

### 講習管理サブタブ

| サブタブID | 表示名 |
|-----------|--------|
| `lectures-schedule` | 📅 日程作成 |
| `lectures-materials` | 📄 内部配布物 |
| `lectures-flyer` | 🎨 外部チラシ |
| `lectures-imagen` | 🖼️ 画像生成 |

### 成績管理サブタブ

| サブタブID | 表示名 |
|-----------|--------|
| `grades-score` | ✏️ 成績入力 |
| `grades-list` | 📋 一覧表 |
| `grades-analysis` | 📈 分析 |
| `grades-report` | 📄 成績表 |
| `grades-input` | 📝 情報入力 |
| `grades-placement` | 🎓 進学先 |

### 管理タブ サブタブ

| サブタブID | 表示名 |
|-----------|--------|
| `admin-users` | 👥 ユーザー管理 |
| `admin-properties` | ⚙️ 設定 |
| `admin-logs` | 📋 ログ |
| `admin-fixed-events` | 📅 固定イベント |
| `admin-normal-config` | 📋 通常設定 |
| `admin-scheduler` | 📩 LINE通知 |
| `admin-chatbot` | 🤖 チャットボット |
| `admin-guide` | 📖 管理ガイド |
| `admin-lectures-config` | 📚 講習設定 |

### 資料タブ サブタブ

| サブタブID | 表示名 | 状態 |
|-----------|--------|------|
| `univ-calendar` | 📅 カレンダー | 実装済み |
| `univ-pricing` | 💰 料金表 | 実装済み |
| `univ-placement` | 👨‍🏫 講師配置 | 実装済み |
| `univ-minutes` | 📝 議事録 | 実装済み |

---

## 9. 重要な設計判断（概要）

詳細は `DESIGN.md` 参照。

- **ID管理**: 全エンティティを不変IDで管理。名前・メールを主キーに使わない
- **padStart問題**: Sheetsの数値自動変換に注意。生徒ID・校舎コードは必ず正規化
- **fitToScreen**: 新しい `position:fixed` 要素追加時は必ず補正処理を追加
- **UserProperties禁止**: `PropertiesService.getUserProperties()` 直接使用禁止。`getUserProperty()` / `setUserProperty()` を使うこと
- **ANYONE_ANONYMOUS**: GASデプロイは1つのみ。アクセス設定の変更に注意
- **allowedUsers ホワイトリスト**: Firestoreセキュリティルールは `allowedUsers` コレクションにメールが登録されたユーザーのみアクセス許可。アプリ起動時（`getAppStartupData`）・ユーザー追加時・メール追加時に自動登録される
- **gas-bridge タイムアウト**: GAS APIコールは90秒でタイムアウト（GASコールドスタートで30秒以上かかることがある）。タイムアウト・通信エラー時はトースト通知を表示
- **firebase-init.html の制約**: Firestore SDKのプロトタイプ（Query.prototype.get 等）を書き換えてはいけない（enablePersistence との干渉でエラーが発生する）
- **Firestore読み取り最小化**: Firestoreは読み取り回数を最小化する設計を必ず検討すること。具体的には、集計・一覧用の読み取り専用ドキュメントを活用し、書き込み時に+1回で読み取り時に数百回→1回にする設計を優先する。サブコレクション＋親ドキュメントに集計を持たせる構造が有効
- **成績データはSupabase**: grades・schoolAverages・testAnalysis・studentAnalysis はすべてSupabase（PostgreSQL）に保存。Firestoreのキャッシュコレクション（gradeSummaries・gradeListCache・gradeReportCache・distCache・gradesMeta）は廃止済み。SQL集計関数（get_campus_averages等）で代替。フロントエンドの成績読み取りはGAS API経由（gas-bridge）で行う
- **AIアシスタントデータもSupabase**: aiLearnedKnowledge・aiFeedback はSupabase（`ai_learned_knowledge`・`ai_feedback` テーブル）に保存。Firestoreの読み取り回数削減のため移行
- **スタッフデータもSupabase**: staffs コレクションは Supabase `staffs` テーブルに移行。認証時の検索は RPC関数 `find_staff_by_auth` で1クエリに統合。allowedUsers コレクション（Firestoreセキュリティルール用）のみFirestoreに残す。Firestoreに残すのは講習日程（`lectureEntries`）・スケジュール・allowedUsers等のリアルタイム性またはセキュリティルールが必要なデータのみ
- **講師配置は年度別キー＋自動切替**: 講師配置（`STAFF_PLACEMENT_{year}`）は ScriptProperties に年度別キーで保存。`getCurrentFiscalYear()`（4月起算）に基づき表示年度を自動決定し、4月1日で新年度に切替、旧年度は `STAFF_PLACEMENT_ARCHIVE_{year}` へ自動退避される。1〜3月のみ編集画面で翌年度の並行編集が可能。詳細は `admin.js` の講師配置セクション参照
- **ScriptProperties アクセスはラッパー経由（Phase 5-E-4〜6）**: GAS コード内の単一キー get/set/delete は `getProperty_()` / `setProperty_()` / `deleteProperty_()`（`kv-props.js`）経由で行うこと。Phase 5-E-6 で ScriptProperties は凍結され、書込・削除は Cloudflare KV のみに行う（SP への Dual-write は停止済）。読み取りのみ、KV 一時障害時の可用性保険として SP 直読へフォールバックする。`INTERNAL_API_KEY` のみ無限ループ回避のため ScriptProperties から直接取得する（KV 認証に必要なため SP に残置）。enumerate 系は `getAllProperties_()`（`kv_list` + `UrlFetchApp.fetchAll(kv_get)` + SP ユニオン・Phase 5-E-5 実装）を使うこと。`.getKeys()` / `.getProperties()` の新規直読は禁止。凍結後の SP は古い値のまま残るが、KV が唯一の正。`PropertiesService.getScriptProperties().getProperty(...)` の新規追加も禁止（既存ラッパーを使う）
- **Workers 直 KV アクセス（Phase 5-E-7〜）**: Workers 関数内の単一キー get/set/delete は `env.KV.get('prop:...')` / `env.KV.put('prop:...', value)` / `env.KV.delete('prop:...')` のように KV バインディングを直接使うこと（kv-props.js / kv_get / kv_set プロキシ経由は GAS 側専用）。キー名は必ず `'prop:'` プレフィックスを付ける（`workers/src/functions/kv.js` の `PROP_PREFIX` と一致）。Admin 判定は `prop:ADMIN_EMAILS` を優先し、未設定時のみ `env.ADMIN_EMAILS` にフォールバックすること。B 分類関数の Workers 化時はこのパターンに従う（`workers/src/functions/settings.js` の `getSettings` / `updateSettings` が参考実装）
- **Workers からの Gemini API 呼出は `workers/src/gemini.js` 経由（Phase 6-B-02〜）**: Gemini API 呼出は `fetchGeminiWithRetry(env, model, payload)` を使うこと。リトライ戦略は GAS 版（`analysis.js:20-102`）と完全一致（500/503→5 秒待機 + BACKUP key / 429→3 秒待機 + BACKUP key / 全失敗→`gemini-2.5-flash` モデル fallback）。API キーは `env.KV.get('prop:GEMINI_API_KEY')` から取得し、`env.GEMINI_API_KEY` への fallback も念のため保持する。エラーレスポンスは `parseGeminiErrorMessage(response)` で日本語メッセージに変換する（PT タイムゾーン判定は `Intl.DateTimeFormat` で行う）。`thinkingConfig` の thought parts フィルタは `extractGeminiText(result)` で集約する。Imagen（`:predict` endpoint）は payload 構造が異なるため本ヘルパーの対象外。
- **Firestore の RMW は `firestoreTransaction` 経由（Phase 6-B-03〜）**: GAS `LockService` で保護されていた Read-Modify-Write パターンは Workers 版では `firestoreTransaction(env, async (tx) => { ... })` を使うこと（`workers/src/firebase.js`）。Firestore REST `:commit` endpoint + read-write transaction で atomic 保証し、`ABORTED`（409）/ `UNAVAILABLE`（503）エラー時は最大 5 回・指数バックオフ + jitter で自動リトライする。tx 内では `tx.get(coll, id)` / `tx.set(coll, id, data)` / `tx.update(coll, id, fields)` / `tx.delete(coll, id)` を使う。新規ドキュメント作成・単一ドキュメントの単純 RMW どちらも対応。`firestoreBatchWrite`（`:batchWrite` endpoint）とは atomicity の強度が異なるため、非 atomic でよい大量書込のみ `firestoreBatchWrite` を使い、RMW は必ず `firestoreTransaction` を使うこと。
- **`workers/src/helpers/` は純関数ヘルパーの集積地（Phase 6-B-05〜）**: `functions/` は API ハンドラ（router に登録される公開関数）、`helpers/` は複数ハンドラから再利用される純関数ユーティリティ。`helpers/datetime-helpers.js` は JST 安全な日付処理（`jstDate(y,m,d)` / `getJstDayOfWeek(d)` / `formatMdw(d)` / `addDays(d,n)` / `getFiscalYear(y,m)` 等）を集約し、Workers 環境（UTC native）で GAS 相当の JST 挙動を再現する。`helpers/line-template-helpers.js` は LINE スケジューラ専用のテンプレート展開ロジック（`computeClosedDaysForMonth` / `resolveTemplatePlaceholders` / `buildMessageFromTemplate` 等）を集約する。KV アクセスを伴う関数は async + env パラメータ、純関数は同期。新規の日付関連ヘルパーは原則 `datetime-helpers.js` に追加し、`new Date(y, m-1, d)` や `.getDay()` 等のタイムゾーン依存メソッドの素朴な使用は禁止（必ず `jstDate()` / `getJstDayOfWeek()` 経由）。なお `workers/src/functions/features.js:247-417` に同名の `computeClosedDaysForMonth_` が並行存在しているが、これは Phase 5-E-9b-2a-2 で講習日程管理用に port されたもの。Phase 6-C で統合リファクタ予定。
- **Workers 内 Date 操作は必ず JST 補正する（Phase 6-B-05〜）**: Workers は UTC native のため、`new Date(2026, 3, 1)` は `2026-04-01 00:00 UTC` = `2026-04-01 09:00 JST` になり、GAS（JST 前提）との挙動差が生じる。特に `.getDay()` / `.getMonth()` / `.getDate()` / `.getFullYear()` はローカル tz（UTC）で値を返すため、曜日判定や月境界計算で 1 日ズレが発生する。新規コードでは `workers/src/helpers/datetime-helpers.js` の `jstDate(y,m,d)` / `getJstDayOfWeek(d)` / `getJstYear(d)` / `getJstMonth(d)` / `getJstDay(d)` / `formatMdw(d)` を使うこと。`Intl.DateTimeFormat('Asia/Tokyo')` 経由で実装されているため tz-safe。`date.setDate(d.getDate() + n)` のような mutation は `addDays(d, n)`（UTC 空間で加算するため tz 非依存）を使う。ISO 8601 文字列 `YYYY-MM-DDTHH:mm:ss+09:00` の `new Date()` parse は tz-aware で正常動作するが、`YYYY-MM-DD` 単体や `YYYY-MM-DDTHH:mm`（TZ 未指定）は `toJstDate(str)` で変換すること。
- **隠し Admin モードは Workers KV TTL で管理（Phase 6-B-01 で実装）**: `activateHiddenAdminMode` は Workers KV `prop:hiddenAdmin_{email}` に値 `'true'` を `expirationTtl: 21600`（6 時間）で書込む。`isAdminUser`（`workers/src/functions/auth.js`）が起動時にこのキーを読み、存在すれば true を返すため、`getUserRoleInfo` 等の呼出元は自動的に隠し Admin 対応となる（呼出元のコード変更不要）。フロント側の `sessionStorage.hiddenAdminMode`（`js-core.html:1000`）はリロード後の即時 UI 復元用で並行運用継続。GAS 版（`auth.js:99-147`）は `WORKERS_FUNCTIONS` セット経由で Workers ルーティングに切替済みのため呼ばれないが、フォールバック保険として残置する（Phase 6-B 完了後の整理対象）。
- **Phase 6-A' クローズ（2026-04-23）**: Phase 6-A-15 〜 6-A-20 で 17 関数を Workers 化。進捗率は 40.5% → 46.6%（フロント呼出ベース 59.9% → 68.9%）。Phase 6-B-01（2026-04-23）で `activateHiddenAdminMode` を Workers 化し KV TTL パターンを確立。Phase 6-B-02（2026-04-23）で `workers/src/gemini.js` を新規整備し `analyzeFlyerImageMeta` を Workers 化。Gemini API リトライ戦略（500/503→5s / 429→3s / BACKUP key fallback / gemini-2.5-flash モデル fallback）と `parseGeminiErrorMessage` を共通ヘルパー化し、Phase 6-C 以降で残る 19 箇所の Gemini 呼出の Workers 化コストを大幅削減した。Phase 6-B-03（2026-04-23）で `workers/src/firebase.js` に `firestoreTransaction` を追加し `saveLectureScheduleEntries` を Workers 化。GAS LockService → Firestore Transaction（`:commit` endpoint + ABORTED 時自動リトライ）パターンを確立し、Phase 6-B-04 で AI 系 5 関数（`createLectureEntryAI_` 等）の Workers 化で再利用する。Phase 6-B-05（2026-04-23）で `workers/src/helpers/` ディレクトリを新設し `datetime-helpers.js`（JST 安全な汎用日付処理・14 関数）と `line-template-helpers.js`（LINE スケジューラ専用・21 関数）を整備。Phase 6-B-06/07/08 の前提基盤を確立し、以降の日付・テンプレート系 Workers 化の工数を大幅削減。テスト 2 ファイル（計 84 test case）を `__tests__/workers-helpers/` に追加し JST 境界ケース（月跨ぎ・年末年始・うるう年・GW 曜日切替）を網羅。babel-jest を導入し Jest 環境で ESM モジュールの import に対応。Phase 6-B-06（2026-04-23）で `previewTemplateMessage` / `resolveTemplateForSendDate` を Workers 化。Phase 6-B-05 で整備した `resolveTemplatePlaceholders` / `computeClosedDaysForMonth` 等の helpers をラップする薄い API として実装。`sendDateStr`（datetime-local 形式・TZ 無し文字列）の JST parse は `toJstDate` 経由で実施し、`sendDay + 1` の翌日計算（meeting/report イベント日）は `jstDate(y, m, d+1)` で月跨ぎを tz-safe に処理。テスト 1 ファイル（3 test case・月跨ぎ / 講習追記 / 年跨ぎ）を `__tests__/workers-helpers/resolve-template-for-send-date.test.js` に追加。jest.config.js の transform 範囲を `workers/src/helpers/` から `workers/src/` 全体に拡張し API 層のテストにも対応。残存 Phase 6-B 対象は `getScheduledLineMessages` / `resetAndRegenerateSchedule`（Firestore batch write + 生成ロジック）の 2 関数。

---

## 10. 全関数リスト

- フロントエンド（index.html 系）: `FUNCTIONS-frontend.md`
- バックエンド（GAS）: `FUNCTIONS-backend.md`

（Claude が作業内容に応じて必要なファイルを自動で読み込む）

---

## 11. 未実装・スタブ機能

| 機能 | 状態 |
|------|------|
| 講習管理 > エントリのリサイズ・ドラッグ移動 | 将来実装 |
| 講習管理 > 配布物 他種PDFボタン | 将来追加予定 |
| ~~資料 > 議事録~~ | 実装済み |
| 分析 > テスト間推移折れ線グラフ | 将来実装 |

---

## 12. コーディング規約

詳細は `CODING.md` 参照（Claude が必要時に自動で読み込む）

---

## 13. 既知の制約・注意点

- GAS実行時間上限: 6分（無料）/ 30分（Workspace）
- `google.script.run` は非同期。必ず `withSuccessHandler` / `withFailureHandler` を付ける
- ロゴが表示されない場合: `APP_FOLDER_ID` → `assets/` フォルダ → `logo.png` の順で確認
- Excel (.xlsx/.xls) は自動インポート非対応（CSV か Google Sheets に変換が必要）
- `Session.getActiveUser().getEmail()` は常に空文字列を返す。ユーザー識別は Firebase ID トークン検証（`verifyFirebaseIdToken_`）＋ `setFirebaseEmailContext_()` で行う
- `deploy-to-gas.yml` は `.js`/`.html`/`appsscript.json` が変更された時のみ実行。新ファイル種別を追加する場合は `paths` への追記も必要
- `deploy-firebase.yml` は必ず `--only hosting` のみ。`firestore:rules` を含めると403エラーでデプロイ全体が失敗する（サービスアカウントに権限がない）
- `deploy-firebase.yml` の `paths` トリガーに `firestore.rules` を含めてはいけない
- Firestoreセキュリティルールの変更は Firebase コンソールから手動でのみ可能
- Firestoreセキュリティルールは `request.auth != null` だけでなく `allowedUsers` コレクションのホワイトリストも確認する。リポジトリの `firestore.rules` は本番と一致させること

---

## 14. バグブラックリスト

詳細は `BUGS.md` 参照（Claude が新機能実装前に必ず自動で読み込む）

---

## 英単語アプリとの連携

英単語アプリのパス：`/home/user/englishtest`
```
cd /home/user/englishtest && CLAUDECODE= claude -p '質問内容' --output-format stream-json --verbose --allowedTools "Read,Grep,Glob" --max-turns 5 | jq -rj '(.event.delta.text? // empty), (.message.content[]?.text? // empty)'
```
