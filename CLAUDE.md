改訂版 CLAUDE.md です。

markdown# S-quire — プロジェクト設計書

> このファイルは Claude Code がセッション開始時に自動で読み込む設計書。
> ユーザーはプログラミング完全初心者。常に日本語で返答すること。

---

## 0. Claude への自動実行ルール

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

### 作業完了後に毎回行うこと

1. 変更内容を日本語で報告
2. プッシュ後の報告文ルールに従って案内
3. `.js` `.html` `appsscript.json` を含む変更をプッシュした場合、GASデプロイカウンターを +1 して更新
   - 180以上: 警告文を追記し「現在N回目です。⚠️ GASプロジェクトの履歴が限界に近づいています。GASエディタの『デプロイを管理』から古いバージョンを削除してください。」と報告
   - ユーザーが「削除しました」と伝えた場合のみ: カウンターを1にリセット

---

## GASデプロイカウンター

**現在のデプロイ回数: 28**

> GASプロジェクト履歴の上限は200件。180回で警告。

---

## 1. アプリ概要

| 項目 | 内容 |
|------|------|
| アプリ名 | S-quire |
| 種別 | Firebase Hosting（フロント） + Google Apps Script（バックエンドAPI） |
| 用途 | 個別指導スクエア（個別指導塾）向け業務管理ダッシュボード |
| 言語 | JavaScript (GAS) / HTML / CSS |

> ⚠️ このアプリは「学校」向けではなく「個別指導スクエア」という「個別指導塾」のもの。「学校」と呼ばないこと。

### できること
- **月間スケジュール** — カレンダー表示・Gemini AIで自動抽出・登録
- **成績管理** — 生徒情報CRUD・成績入力・Gemini OCRで一括取り込み
- **設定** — テーマカラー・プロフィール・AIアシスタント名
- **管理（Admin のみ）** — スクリプトプロパティ管理・Driveファイル操作・ログ閲覧
- **AI アシスタント** — ヘッダーのウィジェットから Gemini に質問・設定変更依頼

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
├── settings.js          設定・プロフィール・引き継ぎ・Gemini使用量（約830行）
├── admin.js             Admin API・初期化・ユーティリティ（約1700行）
├── line.js              LINE通知・LINEスケジューラー（約1700行）
├── features.js          AIアシスタント・料金表・講習管理（約3510行）
├── backup.js            Firestoreバックアップ機能（Firestore→スプレッドシート定時バックアップ）（約330行）
├── index.html           HTMLシェル（約3120行）
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
├── js-admin-chatbot.html JS: チャットボット管理（約230行）
├── gas-bridge.html      JS: google.script.run → fetch() 変換シム
├── firebase.js          Firestore REST APIクライアント
├── firebase-init.html   Firebase 初期化（<head>内ロード）
├── firebase-auth.html   Firebase Auth管理（<head>内ロード）
├── firebase-schedule.html Firebase スケジュール・講習クライアント関数
├── firebase-students.html Firebase 生徒データクライアント関数
├── migrate.js           移行スクリプト（完了済み・削除不要）
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
- `APP_FOLDER_ID` — **必須**。未設定時は全機能停止
- `ADMIN_EMAILS` — Admin権限管理

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
| `settings.js` | S5+S6+S16+S17 | 設定・プロフィール・Gemini使用量 |
| `admin.js` | S10+S11+S12 | Admin API・初期化・ユーティリティ |
| `line.js` | S15+S18 | LINE通知・LINEスケジューラー |
| `features.js` | S9+S19+S20 | AIアシスタント・料金表・講習管理 |

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
| `admin-drive` | 📁 Drive |
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
| `univ-placement` | 👨‍🏫 講師配置 | スタブ |
| `univ-minutes` | 📝 議事録 | スタブ |

---

## 9. 重要な設計判断（概要）

詳細は `DESIGN.md` 参照。

- **ID管理**: 全エンティティを不変IDで管理。名前・メールを主キーに使わない
- **padStart問題**: Sheetsの数値自動変換に注意。生徒ID・校舎コードは必ず正規化
- **fitToScreen**: 新しい `position:fixed` 要素追加時は必ず補正処理を追加
- **UserProperties禁止**: `PropertiesService.getUserProperties()` 直接使用禁止。`getUserProperty()` / `setUserProperty()` を使うこと
- **ANYONE_ANONYMOUS**: GASデプロイは1つのみ。アクセス設定の変更に注意

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
| 資料 > 講師配置・議事録 | スタブ |
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

---

## 14. バグブラックリスト

詳細は `BUGS.md` 参照（Claude が新機能実装前に必ず自動で読み込む）

---

## 英単語アプリとの連携

英単語アプリのパス：`/home/user/englishtest`
```
cd /home/user/englishtest && CLAUDECODE= claude -p '質問内容' --output-format stream-json --verbose --allowedTools "Read,Grep,Glob" --max-turns 5 | jq -rj '(.event.delta.text? // empty), (.message.content[]?.text? // empty)'
```
