DESIGN.mdです。

markdown# DESIGN.md — 設計判断・アーキテクチャ詳細

> このファイルは Claude が必要時に自動で読み込む。
> 設計方針・重要な実装ルールはすべてここを参照。

---

## IDによるデータ管理方針

**すべての人物・エンティティを「不変のID」で管理する。名前・メールを主キーに使うことは禁止。**

### 講師ID発行フロー
```
①LINE自己登録 → doPost() → Firestore staffs に新規ドキュメント作成
②管理者手動追加 → addAllowedUser() → Firestore staffs に新規ドキュメント作成
③初回アプリ起動 → getUserProfile() → Firestore staffs を検索、なければ新規作成
```

### staffs コレクション構造（Firestore）
```json
{
  "teacherId": "T1707123456789_abc123def",
  "emails": ["teacher@example.com", "personal@gmail.com"],
  "firebaseUids": ["uid_abc123", "uid_def456"],
  "email": "teacher@example.com",
  "firebaseUid": "uid_abc123",
  "name": "田中 花子",
  "notificationEmail": "",
  "notificationMethod": "gmail",
  "lineUserId": null
}
```

- `emails` / `firebaseUids`: 配列。1人のスタッフが複数 Google アカウントでアクセス可能
- `email` / `firebaseUid`: スカラー（後方互換）。最新ログイン値を常に反映
- `notificationEmail`: 通知先メール（アクセス制御とは別概念）

### 認証・照合フロー

```
isAllowedUser(): ADMIN_EMAILS → firebaseUids ARRAY_CONTAINS → emails ARRAY_CONTAINS → Drive編集者
resolveStaffByUid_(): firebaseUids → email配列 → レガシースカラー → 配列自動マイグレーション
```

### 新機能実装時のルール

1. 人物の参照はIDで行う（名前・メールを外部キーにしない）
2. 表示名は動的に解決する（Firestore staffs から毎回引く）
3. IDは一度発行したら変更しない（ソフトデリートで対応）
4. 新エンティティにも必ずIDをふる

### 所有者判定は講師IDのみ

**エントリ・データの所有者判定は必ず `teacherId` のみで行う。`teacherEmail` でのフォールバック判定は禁止。**

理由：
- 1人の講師が複数のメールアドレスでログインする可能性がある
- メールアドレスは変更・追加される可能性があるが、講師IDは不変
- 管理者が他の講師として作成したエントリも、対象講師の `teacherId` で紐づけられるため正しく判定される

---

## ソフトデリート

生徒の削除は `isDeleted` フラグを `true` にするだけ。復元は `restoreStudent()` でフラグを `false` に戻す。

---

## 成績データの Upsert パターン

`submitGradeData()` は「生徒ID + テスト名」で既存行を検索し、あれば上書き・なければ `appendRow()` で追加。

---

## OCR補完マージ戦略

- 既存データあり: 0または空のフィールドのみOCR値で補完（既存の有効値は上書きしない）
- 新規: OCR値をそのまま保存

---

## 年度・月日の判定ロジック
```javascript
// 4月始まりの年度判定
if (month >= 4) return year; else return year - 1;

// スケジュールの月日処理（1〜3月は次年度扱い）
var actualYear = (month >= 1 && month <= 3) ? baseYear + 1 : baseYear;
```

---

## 「学校平均」の定義

学校名に「平均」が含まれるエントリ。`schoolName.indexOf('平均') !== -1` でマッチングすること。

---

## モバイル対応（zoom スケーリング）

`fitToScreen()` が `window.innerWidth` と `screen.width` を比較してズーム比率を計算し `.app-container` に `zoom` を適用。

### 【必須】新しい `position: fixed` 要素を追加するとき

`position: fixed` 要素は親の zoom が引き継がれないため、`fitToScreen()` に補正処理を追加すること。追加しないとスマートフォンで位置・サイズがずれる。

**補正パターン：**

| パターン | 対象 | 処理 |
|---------|------|------|
| 全画面オーバーレイ | `width:100%; height:100%` 等 | `zoom: ratio; width: (100/ratio)vw; height: (100/ratio)vh` |
| センタリングモーダル | `top:50%; left:50%; transform:translate(-50%,-50%)` | `zoom: ratio; width: (元width/ratio)vw; maxWidth: 'none'` |
| 特殊配置 | px固定のドロワー等 | `zoom: ratio` ＋ px指定を `ratio` 倍に換算 |

**現在対応済みの要素：**

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
| `ocrModal` | センタリングモーダル（90%） |
| `schedulerEditModal` | センタリングモーダル（92%） |
| `lecHelpModal` | センタリングモーダル（90%） |
| `flyerHelpModal` | センタリングモーダル（90%） |
| `aiWidgetModal` | zoom なし |
| `drawerPanel` | zoom なし |
| `drawerSwipeZone` | zoom なし |
| `appDialogOverlay` | 全画面オーバーレイ |
| `appDialogModal` | センタリングモーダル（85%） |
| `toastNotification` | ボトム固定（zoom のみ） |
| `hiddenAdminOverlay` | 全画面オーバーレイ |
| `hiddenAdminModal` | センタリングモーダル（85%） |

**チェックリスト（新しい `position: fixed` 要素追加時）：**
- 上記の表に要素IDを追記したか？
- `fitToScreen()` 関数の対応ブロックに追記したか？
- DESIGN.md のこの一覧表を更新したか？

---

## Google Sheets 数値自動変換問題（先頭ゼロの消失）

`setValues()` で `"04"` を書き込むと Sheets が `4` に自動変換する。後で `getValues()` で読み戻すと比較が失敗する。

**対策：**
```javascript
// ✅ 生徒ID（10桁）の正規化
var sid = String(rows[i][0] || '').trim();
if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

// ✅ 校舎コード（2桁）の正規化
var code = String(rows[i][2] || '').trim();
if (/^\d+$/.test(code) && code.length < 2) code = code.padStart(2, '0');
```

**修正済み箇所：**
- `features.js`: `saveLectureScheduleEntries`・`getLectureScheduleEntries`
- `students.js`: `submitStudentInfo`・`getMasterData`・`getDeletedStudents`・`getStudentNameById`・`getStudentsForDropdown`・`updateStudentInfo`
- `analysis.js`: `getStudentAnalysis`・`generateStudentAnalyses`・`saveStudentAnalyses_`
- `js-grades-list.html`: `getFilteredListData`

新機能で生徒ID・校舎コードをシートに書き込んだ場合は必ず上記リストに追記すること。

---

## マスターデータ削除時の参照チェック

| 削除対象 | チェック関数 |
|---------|------------|
| 校舎 | `countStudentsByCampus_()` |
| テスト名 | `countGradesByTestName_()` |
| 志望校 | `countGradesBySchool_()` |

新しいマスターデータの削除機能を実装する際も同様の参照チェックを必ず入れること。

---

## 講習管理エントリの権限制御

| 操作 | 一般ユーザー | Admin |
|------|------------|-------|
| 閲覧 | 全員分表示（他人のは薄く） | 全員分表示 |
| 選択・移動・削除 | 自分のみ | 全員操作可 |

- フロント: `onEntryClick()` で `teacherId` 比較・`lec-entry-readonly` クラス付与
- バックエンド: `saveLectureScheduleEntries()` で他人エントリの改ざん検証

---

## Drive フォルダ作成ポリシー

**「今の実装で実際に使うものだけを作る」**

### 現在作成しているもの

| フォルダ/ファイル | 作成関数 |
|---|---|
| 月間スケジュール/ + 年度フォルダ + 予定データ.gs | `initializeScheduleFolder()` |
| 成績管理/ + 年度フォルダ + 成績データ.gs | `initializeGradesFolder()` |
| 設定/ + システム設定.gs | `initializeSettingsFolder()` |

### 年度フォルダ作成ルール

- 4〜12月: 今年度のみ
- 1〜3月: 今年度＋次年度

### 新機能実装時の手順

1. フォルダ・シート作成関数を `initializeAllSheets()` と `manualInitializeSheets()` の両方に追加
2. `checkInitializationStatus()` のフォルダ確認リストに追加
3. 管理タブの `checkInitStatus()` 表示に追加
4. DESIGN.md のこのセクションを更新

---

## @aiCallable タグ規約

- `isAdmin()` チェックがない Web API 関数には `@aiCallable` を付与
- Admin専用関数には付与しない
