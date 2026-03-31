# LINEメッセージスケジューラー実装計画

## 概要
管理タブに「📩 LINE通知」サブタブを新設。3種類の予定LINE通知（室長用連絡・全体ミーティング連絡・回数報告書提出日連絡）を管理・編集・自動送信できる機能を実装する。

---

## 1. データ設計

### 1-1. シート（システム設定.gs 内に新規シート追加）
シート名: `LINEスケジューラー`

| 列 | 内容 | 例 |
|----|------|-----|
| 1 | ID | `sch_20250401_meeting` |
| 2 | 種別 | `shimurocho` / `meeting` / `report` |
| 3 | 年月 | `202504` |
| 4 | 宛先 (JSON) | `["a@ex.com","b@ex.com"]` |
| 5 | 送信予定日時 | `2025-04-17T16:00:00` |
| 6 | メッセージ本文 | `【スクエア】明日は...` |
| 7 | 送信済み | `false` / `true` |
| 8 | 送信日時 | `2025-04-17T16:01:03` |
| 9 | 作成日時 | `2025-03-28T10:00:00` |

### 1-2. スクリプトプロパティ
`LINE_SCHEDULER_SETTINGS`: 各種別のデフォルト設定（JSON）
```json
{
  "shimurocho": {
    "recipients": [],
    "messageTemplate": "【スクエア】今月の室長用連絡です。ご確認をよろしくお願いいたします。",
    "sendHour": 14
  },
  "meeting": {
    "recipients": [],
    "messageTemplate": "【スクエア】明日（{date}）は全体ミーティングです。出席をよろしくお願いいたします。",
    "sendHour": 16
  },
  "report": {
    "recipients": [],
    "messageTemplate": "【スクエア】明日（{date}）は○回数報告書の提出日です。提出をよろしくお願いいたします。",
    "sendHour": 16
  }
}
```

---

## 2. バックエンド (code.js — セクション18新設)

### 2-1. 内部ヘルパー（`_` 末尾・非公開）

| 関数名 | 役割 |
|--------|------|
| `getLineSchedulerSheet_()` | LINEスケジューラーシート取得/作成 |
| `computeClosedDaysForMonth_(year, month)` | 休校日計算（index.html の `getClosedDays` をバックエンドで再現 + CLOSED_DAYS_OVERRIDES 適用） |
| `computeShimurochoSendDate_(year, month)` | 最終週の火〜木から休校日を除いた最後の日（14時送信用） |
| `computeMeetingNotifDate_(year, month)` | getMeetingDay前日 → 休校日なら前日へ遡る（16時送信用） |
| `computeReportNotifDate_(year, month)` | getReportDay前日 → 休校日なら前日へ遡る（16時送信用） |
| `generateMonthlySchedule_(year, month)` | 3種別のスケジュール自動生成（既存エントリがなければ作成） |

### 2-2. 公開API関数

| 関数名 | 権限 | 説明 |
|--------|------|------|
| `getLineSchedulerSettings()` | Admin | デフォルト設定取得 |
| `saveLineSchedulerSettings(type, settings)` | Admin | デフォルト設定保存 |
| `getScheduledLineMessages(year, month)` | Admin | 指定月のスケジュール一覧取得 |
| `saveScheduledLineMessage(data)` | Admin | スケジュール保存（新規/更新） |
| `deleteScheduledLineMessage(id)` | Admin | スケジュール削除 |
| `sendScheduledLineMessageNow(id)` | Admin | 今すぐ手動送信 |
| `checkAndSendDueLineMessages()` | trigger | 期限到来した未送信を一括送信 |
| `setupScheduledLineTrigger()` | Admin | 毎時トリガー設定 |
| `deleteScheduledLineTrigger()` | Admin | トリガー削除 |
| `getScheduledLineTriggerStatus()` | Admin | トリガー状態確認 |

### 2-3. scheduledInitializeSheets() への追加
毎日実行されるトリガーの中で、**今月・来月のスケジュールが未生成なら自動生成** する処理を追加。

---

## 3. フロントエンド (index.html)

### 3-1. 管理タブにボタン追加
```html
<button class="admin-tab-btn" onclick="switchAdminTab(this, 'scheduler'); initLineScheduler();">📩 LINE通知</button>
```
`switchAdminTab()` に `scheduler` ケースも追加。

### 3-2. admin-scheduler コンテンツ構造

**① トリガー管理セクション**
- 稼働中/停止中 ステータス表示
- 「開始」「停止」ボタン
- 説明文：「毎時チェックして送信時刻になったメッセージを自動送信します」

**② デフォルト設定セクション**
種別ごとにカード表示（shimurocho / meeting / report）
- 宛先: LINE登録済みユーザーのチェックボックス一覧
- メッセージテンプレート: textarea（{date} プレースホルダー説明付き）
- 「保存」ボタン

**③ スケジュール一覧セクション**
- 年・月ドロップダウン
- 3件のスケジュール表示テーブル

| 種別 | 送信予定日時 | 宛先 | メッセージ（冒頭30字） | 状態 | 操作 |
|------|-------------|------|----------------------|------|------|
| 室長用連絡 | 4/24(木) 14:00 | 3人 | 【スクエア】... | 未送信 | 編集 / 今すぐ送信 |
| 全体ミーティング連絡 | 4/17(木) 16:00 | 全員 | ... | 送信済み | （グレー） |
| 回数報告書提出日連絡 | 4/20(日) → 4/19(土) に計算 | ... | ... | 未送信 | 編集 / 今すぐ送信 |

### 3-3. 編集モーダル
- 種別ラベル（変更不可）
- 送信日時（`datetime-local` input）
- 宛先（LINE登録済みユーザーのチェックボックス）
- メッセージ本文（textarea）
- 「保存」「キャンセル」ボタン

### 3-4. 新規JS関数

| 関数名 | 役割 |
|--------|------|
| `initLineScheduler()` | タブ初期化（設定・一覧・トリガー状態を読み込む） |
| `loadSchedulerSettings()` | デフォルト設定UIを描画 |
| `saveSchedulerSettings(type)` | 種別のデフォルト設定を保存 |
| `loadScheduledMessages()` | 選択月のスケジュール一覧を取得・描画 |
| `renderScheduledMessagesTable(messages)` | テーブルHTML生成 |
| `openSchedulerEditModal(id)` | 編集モーダルを開く |
| `saveSchedulerEditModal()` | モーダルから保存 |
| `deleteScheduledMsg(id)` | 削除（確認あり） |
| `sendScheduledMsgNow(id)` | 今すぐ送信（確認あり） |
| `loadScheduledLineTriggerStatus()` | トリガー状態表示 |
| `startScheduledLineTrigger()` | トリガー開始 |
| `stopScheduledLineTrigger()` | トリガー停止 |

---

## 4. 3種別の日付計算ロジック（バックエンド）

### 室長用連絡（shimurocho）
```
1. その月の最終日を取得
2. 最終日を含む週の月曜日を算出
3. その週の火・水・木のうち、休校日でないものを抽出
4. 最も遅い日（最後の日）を採用
5. 14:00 に設定
```

### 全体ミーティング連絡（meeting）
```
1. getMeetingDay(year, month) でミーティング日を算出
2. その前日（-1日）を通知日候補とする
3. 通知日候補が休校日 or 日曜なら -1 してループ
4. 16:00 に設定
```
※ getMeetingDay が null（8月）の場合はスケジュール未生成

### 回数報告書提出日連絡（report）
```
1. getReportDay(year, month) で報告書提出日を算出
2. その前日（-1日）を通知日候補とする
3. 通知日候補が休校日 or 日曜なら -1 してループ
4. 16:00 に設定
```

---

## 5. CLAUDE.md 更新箇所
- セクション5: `LINE_SCHEDULER_SETTINGS` プロパティを追加
- セクション7: セクション18の関数リストを追加
- セクション8: `admin-scheduler` サブタブ行を追加

---

## 6. 作業順序
1. git バックアップコミット作成
2. code.js にセクション18を追加
3. `scheduledInitializeSheets()` に月次自動生成処理を追加
4. index.html に admin-scheduler サブタブ追加
5. CLAUDE.md 更新
6. git push
