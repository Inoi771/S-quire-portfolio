# 📷 S-quire SNS投稿機能 設計書（最終確定版）

> **このファイルはセッションを跨いで参照する全体計画書です。**
> Phase 1 着手以降、各セッションの開始時に必ず読み込んでください。

| 項目 | 内容 |
|------|------|
| バージョン | 1.0（最終確定） |
| 確定日 | 2026-05-21 |
| 作成 | Claude Code（オーナーとの対話による） |
| 運用前提 | 完全無料運用（Firebase Storage 無料枠・Cloudflare Workers 無料枠厳守） |
| 作業ブランチ | `claude/design-instagram-post-page-p8CpD`（設計フェーズ）／Phase 1 以降は新規ブランチ |
| 関連ファイル | `CLAUDE.md`（プロジェクト全体設計書）／本ファイル（SNS投稿機能の詳細） |

---

## 0. 進捗ステータス

| Phase | 内容 | 状態 |
|-------|------|------|
| **設計** | 全体設計の確定・本ファイル作成 | ✅ 完了（2026-05-21） |
| **Phase 1 前準備** | ユーザー側でFacebook/Instagram/Meta Businessの下準備 | 🔄 ユーザー作業中 |
| **Phase 1** | Meta for Developers アプリ作成・トークン取得 | ⏸ ユーザー作業完了待ち |
| **Phase 2-a** | KV キー設計・トークン状態取得API・初期投入手順 | ⏸ 未着手 |
| **Phase 2-b** | Workers Cron 実装（トークンリフレッシュ + メディア削除 + 期限警告） | ⏸ 未着手 |
| **Phase 2-c** | LINE 通知連携（リフレッシュ失敗・期限警告・投稿失敗） | ⏸ 未着手 |
| **Phase 2-d** | Admin設定タブ実装（トークン状態・メディア削除設定・SNS担当者指定） | ⏸ 未着手 |
| **Phase 3** | フィード1枚画像 即時投稿 | ⏸ 未着手 |
| **Phase 4** | 新規作成タブUI（プレビュー・文字数カウンター・クライアントサイドリサイズ） | ⏸ 未着手 |
| **Phase 5-a** | カルーセル投稿 | ⏸ 未着手 |
| **Phase 5-b** | リール投稿 | ⏸ 未着手 |
| **Phase 6** | 予約投稿 | ⏸ 未着手 |
| **Phase 7-a** | ハッシュタグ管理 | ⏸ 未着手 |
| **Phase 7-b** | 履歴・統計・SNS担当者管理の最終調整 | ⏸ 未着手 |

> Phase 1 着手時にこの表の状態を更新してください。

---

## 1. 機能概要

| 項目 | 内容 |
|------|------|
| メインタブ名 | **「📷 SNS投稿」** |
| 命名理由 | 将来 X(Twitter)・TikTok 等の追加に備え、Instagram 専用としない |
| 対象ユーザー | Admin が指定した「SNS担当スタッフ」のみ |
| 初期対応SNS | Instagram（ビジネスアカウント） |
| 対応投稿タイプ | フィード（1枚）／カルーセル（最大10枚）／リール（動画） |
| 投稿方法 | 即時投稿 + 予約投稿 |
| メディア由来 | 手元アップロード（クライアントサイドリサイズ後） |
| 運用ポリシー | 自動トークンリフレッシュ + メディア24時間自動削除 |

---

## 2. ユーザー側の下準備（Phase 1 着手前）

オーナーが Phase 1 着手前に以下を完了させてください：

1. **Facebook 個人アカウント作成**（個人メール使用・本名登録）
2. **Facebook ページ作成**（S-quire / 個別指導スクエア 用）
3. **Instagram アカウントのプロアカウント（ビジネス）化** + Facebook ページとの連携
4. **Meta Business Suite でビジネスアカウント「S-quire」作成**

> 上記4つが完了したら新しいセッションで Phase 1 を開始します。

---

## 3. Phase 1 開始時の Web 検索チェックリスト

Phase 1 を開始するセッションの**最初に必ず Web 検索で再確認**すること（Meta API は仕様変更頻繁）：

- [ ] **Instagram Login / Facebook Login** の現在の推奨（2024年以降の二系統のうち、自社ビジネスアカウント投稿で Meta が推奨する方式）
- [ ] **Graph API の最新バージョン**（例: `v23.0` など、半年〜1年で更新される）
- [ ] **`instagram_content_publish` の最新 App Review 要件・必要書類**
- [ ] **ビジネス確認（Business Verification）の最新フロー**
- [ ] **`refresh_access_token` エンドポイントの現在のパラメータ・必要権限・成功レスポンスのスキーマ**
- [ ] **メディア公開フロー**（`POST /{ig-user-id}/media` → `POST /{ig-user-id}/media_publish` の2段階フローが現在も標準か）
- [ ] **動画/リールのアップロード仕様**（Resumable Upload Protocol の最新化要否）

> 案内方針: スクリーンショット付きで段階的に・各ステップで「ここまで完了」と確認を取る・S-quire 用途（自社ビジネスアカウント投稿）に最適な経路を選ぶ。

---

## 4. Instagram API 連携の前提条件

### 4-A. 必須条件
1. Instagram アカウントが **ビジネス／クリエイター** であること
2. そのアカウントが **Facebook ページとリンク済み** であること
3. Meta for Developers で **アプリ作成**
   - 権限: `instagram_basic` / `instagram_content_publish` / `pages_show_list` / `pages_read_engagement`
4. **長期アクセストークン取得**（60日有効・自動リフレッシュ対象）
5. App Review が必要な場合は申請・承認

### 4-B. アクセストークン自動管理

#### KV キー一覧
| キー | 内容 |
|------|------|
| `prop:INSTAGRAM_ACCESS_TOKEN` | 長期トークン本体 |
| `prop:INSTAGRAM_TOKEN_ISSUED_AT` | 発行/最終リフレッシュ日時 (ISO 8601) |
| `prop:INSTAGRAM_TOKEN_LAST_REFRESH_AT` | 直近のリフレッシュ成功日時 |
| `prop:INSTAGRAM_TOKEN_LAST_ERROR` | 直近のエラー内容（成功時クリア） |
| `prop:INSTAGRAM_BUSINESS_ACCOUNT_ID` | ビジネスアカウントID |
| `prop:INSTAGRAM_APP_ID` / `prop:INSTAGRAM_APP_SECRET` | アプリ認証情報 |
| `prop:INSTAGRAM_MEDIA_RETENTION_DAYS` | 投稿成功後の保持日数（デフォルト `1`、範囲 `1〜30`） |

#### 自動リフレッシュ
- **Cloudflare Workers Cron Triggers**（日次・03:00 JST = UTC 18:00）
- 50日以上経過していたら `GET /refresh_access_token` でリフレッシュ
- 成功 → KV 上書き・タイムスタンプ更新
- 失敗 → エラーを KV に保存 + LINE 通知

#### LINE 通知（既存 `line.js` を利用・新規連携は作らない）
| シナリオ | タイミング | 通知先 |
|---------|----------|-------|
| リフレッシュ成功 | 通知なし（ログのみ） | — |
| リフレッシュ失敗 | 即時 | SNS担当者 + Admin全員 |
| 期限7日前の警告 | 日次Cron判定 | SNS担当者 + Admin全員 |
| 期限切れ | 残日数 ≤ 0 で通知 | SNS担当者 + Admin全員 |
| **投稿失敗** | 即時 | SNS担当者 + Admin全員 |

### 4-C. メディアファイル自動削除

#### 削除ポリシー
| 投稿ステータス | 保持期間 | 設定変更 |
|--------------|---------|---------|
| `published` | デフォルト 1日（24時間） | Admin が 1〜30日で変更可 |
| `failed` | 30日（固定） | 変更不可 |
| `scheduled` | 投稿成功まで保持 | — |
| `draft` | 明示削除まで保持 | — |

#### 削除フロー（Cron 03:00 JST に同居）
```
Firestore instagramPosts クエリ:
  status='published' AND publishedAt < (now - retentionDays日) AND mediaDeletedAt IS NULL
  status='failed'    AND createdAt   < (now - 30日)            AND mediaDeletedAt IS NULL
  ↓
Firebase Storage の対応パスを削除
  ↓
Firestore 更新:
  mediaUrls: []
  mediaDeletedAt: now
```

#### 履歴表示ロジック
```
1. mediaDeletedAt == null  → Firebase Storage の画像表示
2. instagramMediaUrl あり → Instagram 永続URLで表示 + リンク
3. instagramPermalink あり → 「Instagram で見る」リンクのみ
4. それ以外               → 「📭 メディアは削除されました」
```

---

## 5. 画像・動画ホスティング（Firebase Storage）

| 項目 | 内容 |
|------|------|
| 採用理由 | S-quire で既に Firebase 使用中・認証/課金/管理を一元化 |
| バケットパス | `instagram-posts/{postId}/{filename}` |
| 公開設定 | 投稿用に署名付き公開URL（または時限公開） |
| 容量見込み | 24時間保持 × 1日数件 → 常時 1GB 未満（無料枠 5GB の20%以下） |
| Storage Rules | SNS担当のみ書き込み・読み取りは公開URL経由 |

---

## 6. データ構造

### 6-A. Firestore `instagramPosts`（新規コレクション）
| フィールド | 型 | 内容 |
|----------|------|------|
| `id` | string | ドキュメントID |
| `status` | string | `draft` / `scheduled` / `published` / `failed` |
| `postType` | string | `feed` / `carousel` / `reel` |
| `caption` | string | キャプション本文 |
| `hashtags` | array | ハッシュタグ配列（caption と分離管理） |
| `mediaUrls` | array | Firebase Storage の公開URL配列 |
| `mediaStoragePaths` | array | Storage オブジェクトパス（削除用） |
| `mediaAspectRatio` | string | `1:1` / `4:5` / `1.91:1` |
| `scheduledAt` | timestamp | 予約日時（即時投稿は null） |
| `publishedAt` | timestamp | 実投稿日時 |
| `mediaDeletedAt` | timestamp | メディア削除日時 |
| `instagramMediaId` | string | 投稿成功時に取得 |
| `instagramMediaUrl` | string | Instagram 側永続URL（履歴表示用） |
| `instagramPermalink` | string | `https://www.instagram.com/p/XXX/` |
| `createdBy` | string | 作成者メール |
| `createdAt` | timestamp | 作成日時 |
| `errorMessage` | string | 失敗時のエラー |

### 6-B. Firestore `instagramHashtagSets`（新規コレクション）
| フィールド | 型 | 内容 |
|----------|------|------|
| `id` | string | ドキュメントID |
| `name` | string | セット名（例: 「勝瑞校・通常投稿」） |
| `campusCode` | string | 校舎コード（共通セットは `'common'`） |
| `hashtags` | array | ハッシュタグ配列 |
| `createdBy` | string | 作成者メール |
| `createdAt` | timestamp | 作成日時 |
| `updatedAt` | timestamp | 更新日時 |

### 6-C. Supabase `staffs` テーブル（既存に1列追加）
| カラム | 型 | 内容 |
|-------|------|------|
| `is_sns_manager` | boolean | SNS担当フラグ（追加） |

> マイグレーション SQL は Phase 2-a で必ずユーザー確認のうえ実行（CLAUDE.md「データ変更の慎重化」遵守）。

---

## 7. UI構成

### 7-A. メインタブ「📷 SNS投稿」のサブタブ
| サブタブID | 表示名 | 内容 |
|-----------|--------|------|
| `sns-create` | ✏️ 新規作成 | 投稿タイプ選択 → 画像アップ → キャプション → プレビュー → 即時/予約 |
| `sns-scheduled` | 📅 予約一覧 | 予約済みをカレンダー＋リスト表示・編集・取り消し |
| `sns-history` | 📋 履歴 | 投稿済み・失敗ログ |
| `sns-hashtags` | 🏷️ ハッシュタグ管理 | セットの作成・編集・校舎別管理 |
| `sns-settings` | ⚙️ 設定 | **Admin のみ表示**。トークン状態・メディア削除設定・SNS担当者指定 |

### 7-B. 新規作成画面の流れ
```
1. 投稿タイプ選択（フィード / カルーセル / リール）
       ↓
2. メディアアップロード
   - クライアントサイドリサイズ（Canvas API）
   - アスペクト比ガイド表示（1:1 / 4:5 / 1.91:1）
   - リール時は動画ファイル選択
       ↓
3. キャプション入力
   - 文字数カウンター: ◯◯◯ / 2,200 文字
   - ハッシュタグ数カウンター: ◯ / 30 個
   - 制限80%超で黄色・100%超で赤色警告
   - 「🏷️ ハッシュタグセットから挿入」ボタン
       ↓
4. プレビュー（実際のInstagram風の表示）
   - 正方形/縦長/横長カードのレイアウト切替
   - キャプション省略表示（「…続きを読む」のシミュレーション）
   - ハッシュタグはリンク色で表示
       ↓
5. 投稿方法選択（今すぐ / 日時を指定して予約）
       ↓
6. 確認 → 送信
```

### 7-C. 設定タブ（Admin のみ）の表示項目
```
┌────────────────────────────────────────┐
│ Instagram API 接続ステータス             │
├────────────────────────────────────────┤
│ ● 接続中  /  トークン残日数: 42日        │
│ トークン期限:        2026-07-01 03:00    │
│ 最終リフレッシュ:    2026-05-12 03:00    │
│ 次回リフレッシュ予定: 2026-07-01 03:00    │
│ 直近のエラー:        なし                │
│ [手動でリフレッシュ] [トークン再発行]    │
├────────────────────────────────────────┤
│ メディア自動削除設定                     │
│ 投稿成功後の保持日数:  [ 1 ] 日 (1〜30)  │
│ 投稿失敗時の保持日数:  30日（固定）       │
│ 現在のStorage使用量: 約 0.12 GB / 5 GB   │
│ [今すぐクリーンアップ実行]               │
├────────────────────────────────────────┤
│ SNS担当者                                │
│ ☑ オーナー  ☐ 鈴木  ☐ 田中 ...             │
│ [変更を保存]                             │
└────────────────────────────────────────┘
```

---

## 8. 追加機能の詳細

### 8-A. 投稿前プレビュー
- 正方形/縦長/横長の3アスペクト比に応じた Instagram 風レイアウト
- アカウント名・アイコンはダミー表示
- キャプション 125文字目以降は省略表記でシミュレーション

### 8-B. キャプション文字数カウンター
- リアルタイム表示
- 本文文字数 / 2,200
- ハッシュタグ数 / 30
- 80%超 → 黄色、100%超 → 赤色 + 送信ボタン無効化

### 8-C. ハッシュタグ管理
- セット保存・呼び出し・編集・削除
- 校舎別セット（`campusCode` で絞り込み・共通セットあり）
- 挿入時に重複チェック・30個超過防止
- 並び替え（よく使う順）

### 8-D. 画像リサイズ・トリミング補助
- **完全クライアントサイド**（サーバー負荷ゼロ）
- HTML5 Canvas API でリサイズ・クロップ
- アスペクト比固定モード（1:1 / 4:5 / 1.91:1 ガイド枠表示）
- Instagram 推奨解像度に自動調整（最長辺 1080px）
- 動画はリサイズせず仕様チェックのみ

### 8-E. 投稿失敗時の LINE 通知
- 既存 `line.js` 関数を利用
- 通知文言例:
  ```
  ⚠️ Instagram投稿が失敗しました
  投稿者: オーナー
  失敗時刻: 2026-05-20 14:30
  エラー: <APIエラーメッセージ>
  → 管理タブで詳細確認・再投稿してください
  ```

---

## 9. ファイル構成（既存に触れない・新規追加のみ）

### バックエンド（GAS）
| ファイル | 役割 |
|---------|------|
| `instagram.js` | Instagram関連 GAS API（フォールバック・補助系） |

### Workers
| ファイル | 役割 |
|---------|------|
| `workers/src/functions/instagram.js` | Instagram投稿実行・トークン管理 |
| `workers/src/functions/instagram-cron.js` | 日次Cron（トークンリフレッシュ + メディア削除 + 期限警告） |
| `workers/src/helpers/instagram-helpers.js` | Graph API 呼出・公開URL生成・エラーパース |
| `workers/wrangler.toml` | Cron Triggers `0 18 * * *`（UTC 18:00 = JST 03:00）追加 |

### フロントエンド
| ファイル | 役割 |
|---------|------|
| `js-sns.html` | SNS投稿タブのUI制御（新規作成・予約一覧・履歴） |
| `js-sns-hashtags.html` | ハッシュタグ管理サブタブ |
| `js-sns-settings.html` | Admin専用設定サブタブ |
| `js-sns-preview.html` | プレビュー専用JS（画像処理含む） |
| `index.html` | メインタブ追加（最小限の追記） |
| `styles.html` | SNS投稿関連スタイル追加 |

> CLAUDE.md「新機能追加の原則」遵守:
> - 既存ファイル変更は `index.html` のタブ追加と `styles.html` の追記のみ
> - それ以外は新規ファイルとして追加し、既存コードに触れない
> - 既存関数・処理は書き換えない

---

## 10. 完全無料運用の根拠

| サービス | 無料枠 | 想定使用量 | 余裕度 |
|---------|-------|----------|--------|
| Firebase Storage 容量 | 5 GB | 24時間保持 × 数件 = 1 GB 未満 | ◎ |
| Firebase Storage DL | 1 GB/日 | プレビュー・UL時のみ | ◎ |
| Firebase Storage UL | 20,000/日 | 1日数十回 | ◎ |
| Cloudflare Workers リクエスト | 100,000/日 | 1日数百回 | ◎ |
| Cloudflare Workers Cron | 5/アカウント | 1本のみ使用 | ◎ |
| Cloudflare KV 読取 | 100,000/日 | トークン取得程度 | ◎ |
| Cloudflare KV 書込 | 1,000/日 | リフレッシュ時 + 設定変更時のみ | ◎ |
| Firestore 読取 | 50,000/日 | 既存使用量 + 数百回 | ○ |
| Firestore 書込 | 20,000/日 | 1日数十回 | ◎ |
| Meta Graph API | 無料（投稿 200/24h制限） | 1日数件 | ◎ |

---

## 11. リスク・既知の制約

| 項目 | リスク | 対策 |
|------|-------|------|
| Meta API 仕様変更 | 突然動かなくなる | 実装時に最新ドキュメント確認・エラー時 LINE 通知で即気づける |
| App Review 不承認 | 投稿APIが使えない | Phase 1 で承認まで完了させる |
| トークン期限切れ | 投稿不能 | 自動リフレッシュ + 7日前警告 + 期限切れ通知 |
| Storage 無料枠超過 | 課金発生 | 24時間自動削除 + 設定タブで使用量常時表示 |
| 動画ファイルサイズ大 | UL 容量圧迫 | 動画はサイズ制限（例: 100MB 上限）でUI警告 |
| Firestore 読み取り急増 | 既存機能に影響 | 履歴は必要時のみ読み込み・ページネーション実装 |

---

## 12. 各 Phase の運用ルール

### Phase 開始時
1. 本ファイル「0. 進捗ステータス」を確認
2. その Phase が依存する Web 情報を **Web 検索で再確認**（特に Meta API）
3. CLAUDE.md「作業前バックアップ」コミットを作成
4. 新規ブランチで作業（`claude/sns-phase-N-XXXX` 形式）

### Phase 完了時
1. 動作確認をユーザーに依頼
2. ユーザー承認後、本ファイル「0. 進捗ステータス」を ✅ に更新
3. CLAUDE.md のセクション 8（タブ・サブタブ構成）等、関連 .md を更新
4. 完了報告は日本語で「何を変えたか」をユーザー視点で

### セッションが変わったとき
1. **最初に本ファイル全文を読む**
2. 「0. 進捗ステータス」で次に着手する Phase を確認
3. Phase 1 の場合は「3. Web 検索チェックリスト」を実行
4. 着手前にユーザーに Phase 内容と作業計画を提示して承認を得る

---

## 13. 確定事項（変更時は本ファイルを更新すること）

- ✅ メインタブ名: **「📷 SNS投稿」**（Instagram 専用と決め打ちしない）
- ✅ 画像ホスティング: **Firebase Storage**
- ✅ Meta アプリ作成: Claude が**スクリーンショット付き手順案内**で進行・各ステップで確認取得
- ✅ 実装優先順位: **フィード1枚 → カルーセル → リール → 予約投稿**
- ✅ 追加機能:
  - (a) 投稿前プレビュー（Instagram 風表示）
  - (b) キャプション文字数カウンター（本文 2,200 / タグ 30）
  - (c) ハッシュタグ管理（`instagramHashtagSets` コレクション・校舎別対応）
  - (d) 画像リサイズ・トリミング補助（クライアントサイド）
  - (e) 投稿失敗時の LINE 通知（既存 `line.js` 利用）
  - (f) トークン期限切れアラート（Phase 2-B に組込済み）
- ✅ 自動運用:
  - トークン自動リフレッシュ（50日経過時・Cloudflare Workers Cron）
  - メディア自動削除（成功 1日 / 失敗 30日・Admin で変更可）
  - LINE 通知（リフレッシュ失敗・期限7日前警告・期限切れ・投稿失敗）

---

## 14. 関連ドキュメント

- `CLAUDE.md` — プロジェクト全体設計書（本番環境ルール・コーディング規約・既存タブ構成等）
- `DATA.md` — スクリプトプロパティ・シート列構成・Firestore コレクション
- `DESIGN.md` — ID管理・既知の設計判断
- `BUGS.md` — バグブラックリスト
- `FUNCTIONS-frontend.md` / `FUNCTIONS-backend.md` — 全関数リスト

---

**承認者**: オーナー（S-quire 従業員・経営者から運用承認取得済み）
**承認日**: 2026-05-21
**次のアクション**: ユーザー側下準備完了 → 新セッションで Phase 1 着手
