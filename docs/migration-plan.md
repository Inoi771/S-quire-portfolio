# GAS → Cloudflare Workers 移行プラン

---

## B-⑬ 方向性調査・推奨（2026-04-19）

### 未移行のgasApiPromise_呼び出し関数（firebase-students.html）

| 関数名 | 種別 | ScriptProperties | LockService | 結論 |
|--------|------|-----------------|------------|------|
| `getStudentListWithGrades` | 読取 | **なし** ✅ | なし | **移行可能** |
| `getStudentGradeReport` | 読取 | getTestNamesConfig ❌ | なし | **ブロック** |
| `updateStudentInfo` | 書込 | **なし** ✅ | なし | **移行可能** |
| `deleteStudent` | 書込 | **なし** ✅ | なし | **移行可能** |
| `restoreStudent` | 書込 | **なし** ✅ | なし | **移行可能** |
| `submitGradeData` | 書込 | **なし** ✅ | なし | **移行可能** |
| `getGradeSummary` | 読取 | getCampusAverages経由 ❌ | なし | **ブロック** |
| `getCampusAverages` | 読取 | CAMPUS_CODES_CONFIG ❌ | なし | **ブロック** |

### 方向性の評価

| 方向 | メリット | デメリット |
|------|---------|-----------|
| **A: Firestore関数** | Supabaseと独立して動く | gasApiPromise_で呼ばれるFirestore専用読取関数は実質ゼロ。効果なし |
| **B: Phase 5-E（ScriptProperties設計）** | 8関数のブロックが一気に解除 | スキーマ設計＋既存データ移行が重い。別セッション向け |
| **C: 書き込み操作（Phase 5-D）** | ScriptProperties不要・即実装可能・関数数が多い | 書き込みのため読取より影響大（ただし切り戻し容易） |

### 推奨ロードマップ

| ステップ | 関数 | 種別 | 難易度 |
|---------|------|------|-------|
| **B-⑬** | `getStudentListWithGrades` | 読取 | 低（B-⑫と同パターン） |
| **B-⑭** | `updateStudentInfo` + `deleteStudent` + `restoreStudent` | 書込 | 低（Supabase UPSERT/UPDATE） |
| **B-⑮** | `submitGradeData` | 書込 | 中（成績保存の核心・慎重に） |
| **Phase 5-E** | Supabase app_configテーブル設計 → ブロック解除 | 設計 | 高（別セッション） |

### B-⑬実装詳細（getStudentListWithGrades）

#### GAS版実装フロー（students.js L271-360）

**引数**: `year` (number), `testName` (string)

**内部呼び出し順序**:
1. `getMasterData(year)` → Supabase `students`（移行済み ✅）
2. `getDataSheetData(year)` → Supabase `grades` テーブル（ScriptProperties不要 ✅）
   - クエリ: `fiscal_year=eq.{year}`
   - snake_case→camelCase: student_id→studentId（padStart(10,'0')正規化）, test_name→testName, recorded_at→recordedDate, student_name→studentName
   - 数値: `!== null && !== undefined ? 値 : ''`（0が有効値のため注意）
3. Supabase `student_analysis` → `test_name=eq.{testName}&year=eq.{year}`
   - analysis_json をパース → passAssessment[].schoolName→percent を抽出
   - **try-catch で失敗してもスキップ**（生徒情報は必ず返す）

**結合ロジック**:
- gradeMap: `{sid → row}` （testNameが一致する最初の行のみ保持）
- analysisPassMap: `{sid|testName → {schoolName: percent}}`
- masterDataをベースにmap → 成績なしは全フィールド `''`

**戻り値の student 1件**:
```
studentId, name, furigana, seiFurigana, meiFurigana,
campus, grade, schoolName,
kokugo/shakai/sugaku/rika/eigo/total/average: number|'',
shogaku1/2: string, shogaku1/2_gakka: string,
hasGrade: boolean,
passPercent1/2: number|null  （合格可能性%、なければnull）
```

**ソートなし**: masterDataの順序をそのまま使う（getMasterData側でふりがな順ソート済み）

**エラー時**: `{ success: false, error: '...' }`（studentsフィールドなし）

#### フロントエンドの呼び出し

- **唯一の呼び出し元**: `js-grades-list.html:180`（一覧表タブ）
- `fbGetStudentListWithGrades` → `fbCachedFetch_` → `gasApiPromise_('getStudentListWithGrades', ...)`
- **localStorageキャッシュあり**: キー `s-quire-g-list-{year}-{testName}`
  - 成功時にキャッシュ保存、次回即返却＋バックグラウンド更新（onRefresh）
  - Workers移行後もキャッシュキーは同じ → 既存キャッシュがそのまま使われる（問題なし）

#### 落とし穴チェック

| 落とし穴 | 有無 | 対処 |
|----------|------|------|
| JST タイムゾーン | **なし** | grades.fiscal_year で保存済み。日時計算不要 |
| studentId padStart(10, '0') | **あり** | getDataSheetData内 + analysisPassMap内で正規化必要 |
| campus padStart(2, '0') | **なし** | getMasterDataの結果をそのまま渡す |
| localeCompare('ja') | **なし** | ソートはgetMasterData済み。本関数はmapのみ |
| エラー時students:[] | **なし** | GAS版エラー時は`{success:false,error:'...'}` のみ（workers版も同一） |
| ScriptProperties間接依存 | **なし** | 3クエリ全てSupabase |
| 死関数 | **ライブ ✅** | js-grades-list.html:180 から実際に呼ばれている |

#### Workers実装方針

**内部ヘルパー `getDataSheetData(year, env)`（非公開）**:
```javascript
async function getDataSheetData(year, env) {
  const docs = await supabaseSelect(env, 'grades', 'fiscal_year=eq.' + parseInt(year, 10));
  return docs.map(doc => {
    let sid = String(doc.student_id || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    return {
      studentId: sid, testName: String(doc.test_name || '').trim(),
      kokugo: doc.kokugo != null ? doc.kokugo : '',
      shakai: doc.shakai != null ? doc.shakai : '',
      sugaku: doc.sugaku != null ? doc.sugaku : '',
      rika:   doc.rika   != null ? doc.rika   : '',
      eigo:   doc.eigo   != null ? doc.eigo   : '',
      total:  doc.total  != null ? doc.total  : '',
      average: doc.average != null ? doc.average : '',
      shogaku1: String(doc.shogaku1 || ''),
      shogaku1_gakka: String(doc.shogaku1_gakka || ''),
      shogaku2: String(doc.shogaku2 || ''),
      shogaku2_gakka: String(doc.shogaku2_gakka || ''),
    };
  });
}
```
（recordedDate と studentName は結合には使わないため省略可）

**`getStudentListWithGrades(args, env, user)`**:
- `Promise.all([getMasterData([year],env,user), getDataSheetData(year,env), supabaseSelect(env,'student_analysis',...).catch(()=>[])])`
- 3クエリ並列実行でレスポンス改善
- getMasterDataはPlain Array（workers版）を返すので直接mapできる

#### 動作確認手順

1. 成績管理 → 一覧表タブ → 年度・テスト名を選択 → 表が表示されること
2. DevTools Network → `workers.dev` への POST が 200 OK
3. `passPercent1/2` が表示される生徒がいること（AI分析済みの場合）
4. 成績なし生徒が空欄で表示されること（hasGrade=false）
5. localStorageに `s-quire-g-list-{year}-{testName}` が保存されていること

#### 切り戻し手順

`gas-bridge.html` の WORKERS_FUNCTIONS から `'getStudentListWithGrades'` を削除してコミット・プッシュ → 約2分でGASにフォールバック。

---

## B-⑥ getUserProfile 移行プラン（確定版）

### ⚠️ 関数名の修正

プラン文書では `getStaffProfile` と記載していたが、**実際の GAS 関数名は `getUserProfile`**（settings.js L409）。
フロントエンド（js-core.html L2141）も `.getUserProfile()` で呼んでいる。
→ Workers 側・gas-bridge 側ともに **`getUserProfile`** を使う。

---

### ① Supabase に追加すべきカラム（洗い出し結果）

#### 全 UserProperties の調査結果

| キー（_UP_ 形式） | camelCase | 型 | 現在の保存先 | Supabase に存在するか |
|------|-----------|-----|----------|-------------------|
| `DISPLAY_NAME` | displayName | string | Supabase ✅ | display_name ✅ |
| `SUBJECTS` | subjects | JSON配列 | Supabase ✅ | subjects ✅ |
| `PREFERRED_CAMPUSES` | preferredCampuses | JSON配列 | Supabase ✅ | preferred_campuses ✅ |
| `AI_ASSISTANT_NAME` | aiAssistantName | string | Supabase ✅ | ai_assistant_name ✅ |
| `AI_PERSONALITY` | aiPersonality | string | Supabase ✅ | ai_personality ✅ |
| `USER_THEME_COLOR` | themeColor | string | Supabase ✅ | theme_color ✅ |
| `TEACHER_ID` | teacherId | string | Supabase ✅ | id ✅ |
| `REGISTERED_EMAIL` | email | string | Supabase ✅ | email ✅ |
| **`LEC_GRADES`** | **lecGrades** | **JSON配列** | **ScriptProperties ❌** | **なし → 追加必要** |
| `EMAIL_UPDATED` | emailUpdated | ISO8601 | ScriptProperties | なし → **今回は追加しない**（メタデータのみ、Workers 移行に不要） |

**→ 今回追加するカラムは `lec_grades` の 1 つだけ。**

#### ② Supabase SQL（ユーザーが手動で実行）

```sql
ALTER TABLE staffs ADD COLUMN lec_grades JSONB DEFAULT '[]'::jsonb;
```

---

### ③ GAS 移行スクリプト（`migrate-lec-grades.js` を新規作成）

全スタッフの `_UP_{email}_LEC_GRADES` を ScriptProperties から読み込み、staffs テーブルに書き込む一回限りのスクリプト。

**ドライラン関数**: `migrateLecGradesDryRun()` — 変更予定のみログ出力、DB 書き込みなし  
**本番実行関数**: `migrateLecGrades()` — 実際に staffs テーブルを更新

```javascript
// migrate-lec-grades.js
function migrateLecGradesDryRun() { migrateLecGrades_(true); }
function migrateLecGrades()       { migrateLecGrades_(false); }

function migrateLecGrades_(dryRun) {
  var allStaff = supabaseSelect_('staffs', 'select=id,email,emails');
  var props = PropertiesService.getScriptProperties().getProperties();
  var updated = 0, skipped = 0;

  allStaff.forEach(function(row) {
    var emails = row.emails || (row.email ? [row.email] : []);
    var grades = null;

    // email の全バリエーションで検索
    emails.forEach(function(email) {
      if (grades) return;
      var safeKey = '_UP_' + email.toLowerCase().replace(/[@.]/g, '_') + '_LEC_GRADES';
      if (props[safeKey]) grades = safeJsonParse_(props[safeKey], null);
    });

    if (grades && grades.length > 0) {
      Logger.log((dryRun ? '[DRY] ' : '') + '更新: id=' + row.id + ' grades=' + JSON.stringify(grades));
      if (!dryRun) {
        supabaseUpdate_('staffs', { lec_grades: grades }, 'id=eq.' + row.id);
      }
      updated++;
    } else {
      skipped++;
    }
  });
  Logger.log('完了: 更新=' + updated + ' スキップ=' + skipped + (dryRun ? '（ドライラン）' : ''));
}
```

> **未設定スタッフの扱い**: `lec_grades` が未設定（空配列）のスタッフはスキップ。カラムのデフォルト `'[]'` のまま。GAS 版の挙動と同一（`safeJsonParse_(..., [])` → `[]`）。

---

### ④ GAS `settings.js` の更新（同一コミット）

`staffFromSupabase_` に `lec_grades` → `lecGrades` マッピングを追加し、GAS 側も Supabase から読むように変更。

```javascript
// staffFromSupabase_ に追加（L92付近）
lecGrades: row.lec_grades || [],
```

`getUserProfile()` と `getAppStartupData()` の `getUserProperty('LEC_GRADES')` 呼び出しを `staff.lecGrades` に変更。

```javascript
// 変更前（getUserProfile L435、getAppStartupData L731）
lecGrades = safeJsonParse_(getUserProperty('LEC_GRADES'), []);

// 変更後
lecGrades = staff.lecGrades || [];
```

`saveLecGrades()` も Supabase への書き込みに変更（デュアルライト → Supabase のみ）。

---

### ⑤ Workers 側 `getUserProfile` 実装（`workers/src/functions/settings.js`）

```
getUserProfile(args, env, user)
  ↓
supabaseRpc(env, 'find_staff_by_auth', { p_uid: user.uid, p_email: user.email.toLowerCase() })
  ↓
rows[0] が null → { success: false, error: '未登録のユーザーです' }
  ↓
staffFromSupabase(row): Supabase カラム → JS オブジェクト変換（lecGrades を含む）
  ↓
subjects / preferredCampuses の JSON パース
  ↓
themeColor fallback: staff.themeColor || '#43e97b'
  ↓
lecGrades: staff.lecGrades（Supabase の lec_grades から）
  ↓
GAS 版と同一構造のオブジェクトを return
```

**GAS 版との差分**

| 項目 | GAS 版 | Workers 版 |
|------|--------|-----------|
| lecGrades | `getUserProperty('LEC_GRADES')` | `staff.lec_grades`（Supabase から） |
| themeColor fallback | `getProperty(PROP_KEYS.THEME_COLOR)` | `'#43e97b'`（固定、Supabase 優先） |
| 自動マイグレーション書き戻し | あり | **スキップ**（全スタッフ移行済みのため不要） |

---

### ⑥ 新規 Secret の要否

追加登録なし（`SUPABASE_URL` / `SUPABASE_SERVICE_KEY` は登録済み）。

---

### コミット構成（確定版・データ先行順序）

| ステップ | 誰が | 内容 |
|---------|------|------|
| ① | **ユーザー手動** | `ALTER TABLE staffs ADD COLUMN lec_grades JSONB DEFAULT '[]'::jsonb;` |
| prep-a | Claude | `migrate-lec-grades.js` のみをコミット（staffFromSupabase_ 等の変更は含めない） |
| — | **ユーザー手動** | GAS エディタで `migrateLecGradesDryRun()` → 確認 → `migrateLecGrades()` 実行 |
| prep-b | Claude | `settings.js` 更新: `staffFromSupabase_` + `getUserProfile` + `getAppStartupData` + `saveLecGrades` |
| B-⑥a | Claude | `workers/src/functions/settings.js` + `router.js` 更新 |
| B-⑥b | Claude | `gas-bridge.html` に `'getUserProfile'` 追加 |

> **データが先に揃ってから読み取り元を切り替える。一瞬も空配列にならない。**

---

### 動作確認手順

| # | 操作 | 確認内容 |
|---|------|---------|
| 1 | 設定タブを開く | プロフィールが正常表示（名前・担当科目・テーマカラー・**講習担当学年**） |
| 2 | Network タブ | `s-quire-api.square1995square.workers.dev` への POST が 200 |
| 3 | Console で `preloadedProfile` | `lecGrades` が正しい値（以前 ScriptProperties にあった値） |
| 4 | 設定タブで講習担当学年を変更 | 保存 → リロード後も値が保持されること（Supabase 書き込み確認） |

### 切り戻し方法

`gas-bridge.html` の `WORKERS_FUNCTIONS` から `'getUserProfile'` を削除してプッシュ → 即 GAS にフォールバック。

---

## Context

S-quireのバックエンドをGoogle Apps Script（GAS）からCloudflare Workersへ移行する。
GASには200回のデプロイ上限・6分の実行時間制限があり、Cloudflare Workersへの移行でこれらの制約を解消する。
移行にあたり、実際には不要になったDrive/Sheets依存機能を先に削除し、スモールステップで進める。

本番稼働中のため、各フェーズは独立して完結し、前フェーズが壊れた場合でも切り戻せる設計にすること。

---

## 移行の全体像

```
Phase 1: Drive/Sheets不要機能の削除（GAS上）          ✅ 完了
Phase 2: チラシ画像をSupabase Storageへ移行（GAS上）  ✅ 完了
Phase 3: スクリプトプロパティをSupabaseへ移行         ⏭ スキップ（Phase 5に統合）
Phase 4: Cloudflare Workers環境セットアップ           ✅ 完了
Phase 5: GASバックエンドをCloudflare Workersへ移行    進行中（5-E-11 まで完了）
Phase 6-A: C 分類関数の Workers 移行                  ← 次（着手前）
Phase 6-B: デプロイ設定の切替（旧 Phase 6）
```

> **Phase 6 分割の経緯**: 旧 Phase 6「デプロイ設定の切替」を **Phase 6-B** にリネームし、
> その前段として **Phase 6-A: C 分類関数の Workers 移行** を新設（2026-04-22 合意）。
> Phase 6-A の対象は `docs/remaining-functions-inventory.md` の C 分類のうち、フロント
> エンドから呼ばれ・GAS 固有 API 依存がないもの。**チラシ系 9 関数**（`getFlyerImages` /
> `getFlyerImageBase64` / `uploadFlyerImage` / `analyzeFlyerImageMeta` / `deleteFlyerImage`
> / `saveFlyerImageTags` / `generateFlyerWithAI` / `saveFlyerAiData` / `loadFlyerAiData`）は
> Drive/Spreadsheet → Supabase Storage/テーブル移行が未完のため **Phase 6-A のスコープ外**
> として後続フェーズに先送り。

---

## Phase 1: Drive/Sheets不要機能の削除 ✅ 完了

### 削除対象一覧（すべて完了）

| 機能 | バックエンド | フロントエンド | 状態 |
|------|------------|--------------|------|
| J: PDF→OCR | `schedule.js`: `extractTextFromPDF()`、`extractEventsFromText()` | 呼び出しなし | ✅ |
| K: Driveブラウザ | `admin.js`: `getDriveContents()`、`uploadPDFToFolder()`、`deleteFileFromDrive()` | `js-admin-ext.html` Drive UI削除 | ✅ |
| A: 配布物PDF保存 | `features.js`: `saveDistributionFile()`、`listDistributionFiles()`、`deleteDistributionFile()` | `js-lectures-materials.html` UI削除 + 呼び出し漏れ修正 | ✅ |
| C: プロフィール写真 | `settings.js`: `saveProfilePhoto()`、`getUserProfile()`のDrive部分 | `js-core.html` + `index.html` UI削除 | ✅ |
| D: 成績表PDF保存 | `students.js`: `saveGradeReportPdf()` | `js-grades-report-pdf.html` 「Driveに保存」ボタン削除 | ✅ |
| E: 月間スケジュールSheets | `schedule.js`: `getScheduleFolder()`をnullスタブ化、`admin.js`: `getOrCreateSpreadsheet()`削除 | UIは変更なし（Firestoreで動作中） | ✅ |
| G: バックアップ | `backup.js`: ファイル全体削除 | `js-admin-ext.html` バックアップUI削除 | ✅ |
| H/I: Drive権限管理 | `auth.js`: DriveApp行3箇所削除 | 呼び出しは残す（Drive部分のみ削除） | ✅ |
| F: 講習スケジュールSheets | `features.js`: `getLectureScheduleSpreadsheet_()` 削除 | 呼び出しなし（実データはFirestoreに移行済み） | ✅ |

### Phase 1 で判明した教訓
- 関数削除時は**呼び出し元をすべて検索**して削除すること（`js-lectures-materials.html` の `loadDistributionFilesList()` 呼び出し漏れでタブ初期化が全滅するバグを発生させた）
- `getScheduleFolder()` は呼び出し元（`updateSchedules()`等）が残っているためnullスタブに変更（完全削除不可）

---

## appsscript.json スコープ削除（Phase 1完了後）

### 現状調査結果: drive・spreadsheets スコープはまだ削除できない

Phase 1完了後に調査した結果、以下のコードが **まだ DriveApp / SpreadsheetApp を使っている**：

| ファイル | 箇所 | 内容 |
|---------|------|------|
| `auth.js` | `isAllowedUser()`、`addUserAccess()`、`removeUserAccess()` | DriveApp（アクセス共有管理）|
| `code.js:293` | `doPost()` LINE登録処理 | DriveApp.addEditor |
| `line.js:508` | `getLineRegisteredUsers()` | DriveApp |
| `line.js:893` | `getLineSchedulerSheet_()` | SpreadsheetApp（LINE通知スケジューラー）|
| `admin.js:174` | `initializeAllSheets()` | DriveApp（assetsフォルダ初期化）|
| `features.js` | チラシ画像関連4関数 + `generateImageWithImagen()` | DriveApp（Phase 2で移行）|

→ **`drive` スコープ・`spreadsheets` スコープは Phase 2完了後まで削除不可**

### 今すぐ削除できるもの

`enabledAdvancedServices` の Drive v2 Advanced API エントリのみ削除可能：

```json
// 削除対象（使用コードなし）
"enabledAdvancedServices": [
  { "userSymbol": "Drive", "serviceId": "drive", "version": "v2" }
]
```

- `DriveApp`（基本API）は多数が使用中で削除不可
- `Drive`（Advanced API v2）は全コードを検索しても使用箇所なし → **安全に削除可能**

### 実施内容（別コミット予定）
- `appsscript.json` の `dependencies.enabledAdvancedServices` ブロック全体を削除
- `oauthScopes` の `drive` と `spreadsheets` は **変更しない**（Phase 2+ 完了後に削除）

---

## Phase 1 動作確認チェックリスト

Phase 1完了後に本番で確認すべき項目：

| カテゴリ | 確認項目 | 確認方法 |
|---------|---------|---------|
| **配布物タブ** | 内部配布物タブが開けてFirestoreのファイル一覧が表示される | 講習管理→内部配布物 |
| **配布物タブ** | 「PDFをDriveに保存」ボタンが消えている | 配布物UIに保存ボタンがないこと |
| **プロフィール** | 設定タブでプロフィールが表示される（アイコンは👤静止画） | 設定→プロフィール |
| **成績表PDF** | 成績表PDFが生成できる（「Driveに保存」ボタンが消えている） | 成績管理→成績表→PDF生成 |
| **月間スケジュール** | スケジュール一覧・新規登録が動作する | 予定タブ |
| **AI自動抽出** | スケジュールのAI取り込みが動作する | 予定→AI取り込み |
| **ユーザー管理** | 管理タブでユーザー追加・削除ができる | 管理→ユーザー管理 |
| **LINEスケジューラー** | LINE通知設定画面が開ける | 管理→LINE通知 |
| **バックアップUI** | 「今すぐバックアップ」ボタンが消えている | 管理→ログ |
| **Driveブラウザ** | Driveブラウザ（Drive操作ボタン）が消えている | 管理タブ |
| **AIアシスタント** | チャットで質問ができる | ヘッダーのAIウィジェット |
| **講習管理** | 講習日程の作成・編集ができる | 講習管理→日程作成 |
| **チラシ画像** | 外部チラシタブで既存画像が表示される（Drive経由のまま・Phase 2前） | 講習管理→外部チラシ |

---

## Phase 2-C: チラシ画像 表示・アップロードタイムアウト修正

### 根本原因

gas-bridge のタイムアウトは **90秒**（行38: `setTimeout(..., 90000)`）。

| 処理 | 所要時間（概算） |
|-----|----------------|
| GAS コールドスタート | 15〜30s（最初の呼び出し時） |
| `getFlyerImageBase64`: signed URL 取得（Supabase API） | 1〜2s |
| `getFlyerImageBase64`: 画像ダウンロード（1〜5MB） | 5〜20s |
| **`getFlyerImageBase64` 合計（コールドスタート含む）** | **21〜52s（最悪 82s）** |
| `uploadFlyerImage`: Gemini Vision 解析（画像付き API） | 15〜45s |
| `uploadFlyerImage`: Supabase アップロード | 5〜15s |
| **`uploadFlyerImage` 合計（コールドスタート含む）** | **35〜90s（最悪 105s）** |

`AbortError: signal is aborted without reason` = `controller.abort()` が引数なしで呼ばれた状態 = **90秒タイムアウト発火**。

---

### 修正方針

#### 修正A: `getFlyerImageBase64` — 画像ダウンロードをなくす

**変更前（遅い）**: GAS が signed URL 取得 → 画像ダウンロード → base64 変換 → 返却  
**変更後（速い）**: GAS が signed URL 取得のみ → URL 返却 → ブラウザが Supabase から直接読み込む

```
変更前: GAS 2回 HTTP + base64 エンコード（最大 80s）
変更後: GAS 1回 HTTP のみ（2〜5s）
```

**PDFへの影響**: `generateFlyerAiPDF` は `html2canvas({ useCORS: true })` でクライアントサイド生成。
`useCORS: true` は設定済みのため、`<img src="signedURL">` を html2canvas でレンダリング可能（CORS不要）。

**変更ファイル:**

- `features.js` — `getFlyerImageBase64(storageKey)`:
  ```javascript
  // 変更前: signed URL 取得 → fetch → base64 encode → return {base64, mimeType}
  // 変更後:
  function getFlyerImageBase64(storageKey) {
    var signedUrl = supabaseStorageSignedUrl_('flyer-images', storageKey, 3600);
    return { success: true, url: signedUrl };
  }
  ```

- `js-lectures-flyer.html` — `onFlyerImageChange()` の GAS コールバック（行 769〜776）:
  ```javascript
  // 変更前:
  // var dataUrl = 'data:' + result.mimeType + ';base64,' + result.base64;
  // flyerImageCache[fileId] = dataUrl; flyerImageBase64 = dataUrl; preview.src = dataUrl;
  // 変更後:
  flyerImageCache[fileId] = result.url;
  flyerImageBase64 = result.url;
  if (preview) { preview.src = result.url; preview.style.display = 'block'; }
  ```

- `js-lectures-flyer.html` — `autoSelectFlyerImage_()` の GAS コールバック（行 827〜840):
  ```javascript
  // 同様に result.url を使用するよう変更
  ```

#### 修正B: `uploadFlyerImage` — AI 解析を切り離す（2段階呼び出し）

**問題**: Gemini Vision API（画像付き）が 15〜45s かかるため、コールドスタートと合わせて 90s を超える。

**方針**: アップロード本体からAI解析を切り離し、アップロードを即時返却。  
AI解析（タグ自動生成）はアップロード成功後にバックグラウンドで呼ぶ。

**変更ファイル:**

- `features.js` — `uploadFlyerImage(base64, fileName, mimeType)`:
  - `analyzeUploadedImageMetadata_` 呼び出しを **削除**
  - `displayName = fileName`（元ファイル名をそのまま使用）
  - Supabase アップロード → Firestore 書き込み → 即時 `return`

- `features.js` — 新関数 `analyzeFlyerImageMeta(storageKey, base64, mimeType)` を追加:
  - `analyzeUploadedImageMetadata_` を呼んでタグ・displayName を生成
  - Firestore `imageTags/{storageKey}` を部分更新（`tags` と `originalName`）
  - アップロード成功後にフロントから fire-and-forget で呼び出す

- `js-lectures-flyer.html` — `uploadFlyerImageUI()` 内のコールバック（行 685〜697）:
  ```javascript
  // アップロード成功後に解析をバックグラウンド起動
  if (result.success) {
    lastUploadedId = result.fileId;
    uploaded++;
    // fire-and-forget: エラー無視でAI解析を実行
    google.script.run.analyzeFlyerImageMeta(result.fileId, base64, file.type);
  }
  ```

---

### 変更の影響範囲

| 変更 | 影響 | 対処 |
|------|------|------|
| `getFlyerImageBase64` が URL を返す | `flyerImageCache` に URL が入る | ✅ `img.src` はURL可 |
| `flyerImageBase64` が URL になる | `injectFlyerImage_` の置換後は URL | ✅ html2canvas useCORS:true で対応済み |
| `uploadFlyerImage` が AI 解析しない | 即時返却になる | ✅ 体感速度改善 |
| AI 解析が遅延する | タグ・表示名が遅れて付く | ✅ バックグラウンドで非同期更新 |

---

### コミット計画

| コミット | ファイル | 内容 |
|---------|---------|------|
| ① | `features.js` | `getFlyerImageBase64` を signed URL 返却に変更 + `analyzeFlyerImageMeta` 追加 + `uploadFlyerImage` から AI 解析除去 |
| ② | `js-lectures-flyer.html` | `onFlyerImageChange` / `autoSelectFlyerImage_` を URL 対応に変更 + アップロード後バックグラウンド解析呼び出し追加 |

---

### 検証方法

1. 「外部チラシ」タブで画像一覧（7件）が表示されること
2. 画像をクリック → **3〜5秒以内**にプレビューが表示されること
3. 新規画像アップロード → **10〜20秒以内**に成功 toast が出ること
4. アップロード後、数十秒待ってから画像一覧を再読み込み → タグが更新されていること（AI解析完了後）
5. 「PDFを生成」ボタン → 画像付きのチラシPDFが正常に生成されること

---

## Phase 2-B: チラシ画像移行スクリプト修正（日本語ファイル名 → UUID キー）

### 背景

本番移行実行で「`InvalidKey: Invalid key: 春_桜の前でジャンプする女子高生.jpg`」が全7件エラー。
Supabase Storage は日本語を含むパスを拒否するため、storageKey を UUID + 拡張子に変更する。

### 設計方針

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| Supabase Storage パス（storageKey） | 日本語ファイル名（例: `春_桜.jpg`） | UUID + 拡張子（例: `a3f8c9e1.jpg`） |
| Firestore `imageTags` docId | 日本語ファイル名 → storageKey | UUID（storageKeyと同じ） |
| Firestore `imageTags.fileId` | 日本語ファイル名 | UUID |
| Firestore `imageTags.fileName` | 日本語ファイル名 | UUID |
| **Firestore `imageTags.originalName`（新規追加）** | なし | 日本語ファイル名（表示・検索用） |
| フロントの表示名（`img.name`） | 日本語ファイル名 | Firestoreの`originalName`から取得 |
| フロントの識別子（`img.id`） | 日本語ファイル名 | UUID（キャッシュキー等） |

UUIDは GAS の `Utilities.getUuid()` で生成。

### 変更ファイルと内容

#### 1. `firebase.js` — `firestoreUpdateFields_` を追加（新規関数）

`firestoreSet_` は `PATCH` without `updateMask` = 全フィールド上書きのため、
`originalName` を保持したままタグだけ更新できる部分更新関数が必要。

追加箇所: `firestoreSet_` の直後（行144の後）

```javascript
function firestoreUpdateFields_(collection, docId, data) {
  var token = getFirestoreAccessToken_();
  var fieldPaths = Object.keys(data).map(function(k) {
    return 'updateMask.fieldPaths=' + encodeURIComponent(k);
  }).join('&');
  var url = firestoreBaseUrl_() + '/' + collection + '/' + encodeURIComponent(docId) + '?' + fieldPaths;
  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ fields: toFirestoreFields_(data) }),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  if (code >= 400) throw new Error('Firestore部分更新エラー(' + code + '): ' + response.getContentText());
}
```

#### 2. `features.js` — 5関数変更

**`saveFlyerImageTags(storageKey, tags, originalName)` — 変更**

- `originalName` が省略された場合（AIがタグだけ更新）: `firestoreUpdateFields_` で `tags` と `updatedAt` のみ部分更新
- `originalName` が渡された場合（新規作成・移行）: `firestoreSet_` で全フィールドを書き込む

```javascript
function saveFlyerImageTags(storageKey, tags, originalName) {
  if (!storageKey) return { success: false, error: 'storageKey が空です' };
  var tagsStr = (tags || '').trim();
  if (originalName !== undefined) {
    firestoreSet_('imageTags', storageKey, {
      fileId: storageKey, fileName: storageKey, originalName: originalName,
      tags: tagsStr, updatedAt: new Date().toISOString()
    });
  } else {
    firestoreUpdateFields_('imageTags', storageKey, {
      tags: tagsStr, updatedAt: new Date().toISOString()
    });
  }
  return { success: true, message: 'タグを保存しました' };
}
```

**`getAllFlyerImageTags_()` — 変更**

戻り値を `{uuid: tags}` → `{uuid: {tags, originalName}}` に変更。

```javascript
function getAllFlyerImageTags_() {
  var map = {};
  try {
    var docs = firestoreQuery_('imageTags', []);
    docs.forEach(function(doc) {
      if (doc.fileId) map[doc.fileId] = { tags: doc.tags || '', originalName: doc.originalName || '' };
    });
  } catch (e) { Logger.log('⚠ getAllFlyerImageTags_: ' + e); }
  return map;
}
```

**`getFlyerImages()` — 変更**

`id` = UUID（storageKey）、`name` = `originalName`（日本語表示名）で返す。
ソートも `originalName` 基準に変更。

```javascript
// tagMap = {uuid: {tags, originalName}}
images.forEach(function(img) {
  var meta = tagMap[img.id] || {};
  img.tags = meta.tags || '';
  img.name = meta.originalName || img.id; // 日本語名（なければUUID）
});
images.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });
```

**`uploadFlyerImage(base64, fileName, mimeType)` — 変更**

- `storageKey = Utilities.getUuid() + ext`（UUID化）
- `displayName = aiFileName + ext || fileName`（日本語表示名）
- `saveFlyerImageTags(storageKey, aiTags, displayName)` を呼ぶ（originalName渡す）
- 戻り値: `{ fileId: storageKey, fileName: displayName }` （displayNameはユーザーへの表示用）

**`generateImageWithImagen()` — 変更（後半の保存部分のみ）**

- `storageKey = Utilities.getUuid() + ext`
- `displayName = (autoFileName || 'AI生成_' + timestamp) + ext`
- `saveFlyerImageTags(storageKey, autoTags || japanesePrompt, displayName)` を呼ぶ
- 戻り値: `{ fileId: storageKey, fileName: displayName, ... }`

#### 3. `migrate-flyer-to-supabase.js` — 移行ロジック全面改訂

**冪等性の変更:**
- 旧: `existingInSupabase[f.name]` で重複チェック（日本語名で照合 → 機能しなかった）
- 新: Firestore imageTags の `originalName` フィールドで照合（`existingByOriginalName[f.name]` → UUID）

**UUID生成:**
```javascript
var ext = f.name.substring(f.name.lastIndexOf('.'));
var storageKey = Utilities.getUuid() + ext; // 例: "a3f8c9e1-b2d4-12d3.jpg"
```

**移行フロー:**
1. 既存 Firestore imageTags を全件取得
   - `originalName` フィールドありのドキュメント → 移行済み（`existingByOriginalName` マップを構築）
   - `originalName` フィールドなしのドキュメント → 旧DriveFileIDキー（`oldTagsByDocId` マップを構築）
2. Drive ファイル一覧取得
3. 各 Drive ファイルに対して:
   - `existingByOriginalName[f.name]` が存在 → スキップ（既に移行済み）
   - 存在しない → UUID生成 → Supabaseアップロード → Firestore書き込み（`originalName = f.name`、`tags = oldTagsByDocId[driveId] || ''`）
4. 旧ドキュメント（DriveFileIDキー、`originalName`なし）を削除
5. 結果ログ出力

### コミット計画

| コミット | 内容 |
|---------|------|
| コミット①: `firebase.js` | `firestoreUpdateFields_` 追加（単独で安全な変更） |
| コミット②: `features.js` | 5関数修正（UUID化 + originalName対応） |
| コミット③: `migrate-flyer-to-supabase.js` | 移行スクリプト全面改訂 |

### 検証方法

1. `migrateFlyerImagesToSupabaseDryRun()` で7件の「アップロード予定」が表示されること
2. `migrateFlyerImagesToSupabase()` で全件成功ログが出ること
3. Supabase Storage の `flyer-images` バケットに UUID.jpg ファイルが7件存在すること
4. Firestore `imageTags` ドキュメントが `originalName: "日本語名.jpg"` フィールドを持つこと
5. アプリの「外部チラシ」タブで日本語表示名の画像一覧が表示されること
6. 画像をクリックしてプレビューが表示されること（base64取得OK）
7. 新規アップロード → 日本語表示名で一覧に追加されること
8. 削除 → 一覧から消えること
9. 再実行したときに全件「スキップ（既に移行済み）」となること（冪等性確認）

---

## Phase 2: チラシ画像をSupabase Storageへ移行

### 現状（詳細調査結果）

| 項目 | 現状 |
|-----|------|
| 画像ファイル本体 | Google Drive `assets/flyer/` フォルダ |
| メタデータ | Firestore `imageTags` コレクション（**DriveFileId** をドキュメントIDとして使用） |
| 画像アクセス方法 | `getFlyerImageBase64(fileId)` → Drive fileId → base64返却 |
| フロントエンドの使い方 | `flyerImageCache[fileId]` にbase64キャッシュ、HTMLテンプレートに `{{IMAGE_PLACEHOLDER}}` で埋め込み |

### 移行先設計

| 項目 | 移行後 |
|-----|--------|
| 画像ファイル本体 | Supabase Storage `flyer-images` バケット（**private**） |
| アクセス方式 | signed URL（有効期限付き）→ GAS側でbase64変換して返却 |
| メタデータ | Firestore `imageTags`（ドキュメントIDを **storageKey**（Storageのパス文字列）に変更） |
| フロントエンド変更 | **なし**（`flyerImageCache[id]` のキーが DriveFileId→storageKey に変わるだけ） |

#### フロントエンドを変更しない理由
- `getFlyerImageBase64()` の返却値（`{success, base64, mimeType}`）を維持すれば、`js-lectures-flyer.html` の `flyerImageCache` ・HTMLテンプレート置換ロジックは無変更
- GAS側で signed URL → base64変換を行うことで吸収

### 手順

#### ステップ1: Supabase Storageバケット作成（ユーザーが実施）
- Supabase ダッシュボード → Storage → New bucket
- バケット名: `flyer-images`
- Public: **OFF**（private）

#### ステップ2: 移行スクリプト作成（GAS, 1回のみ実行）

新規ファイル `migrate-flyer-to-supabase.js` を追加：

```javascript
// Drive assets/flyer/ の画像をSupabase Storageに移行する一回限りのスクリプト
function migrateFlyerImagesToSupabase() {
  // 1. Drive assets/flyer/ フォルダの全ファイル取得
  // 2. 各ファイルをbytes取得 → Supabase Storage POST /object/flyer-images/{fileName}
  // 3. Firestore imageTags の全ドキュメントを取得
  // 4. 旧DriveFileId → 新storageKey（例: "flyer/abc.png"）にドキュメントIDを移行
  //    （新ドキュメント作成→旧ドキュメント削除）
  // 5. 実行ログを出力
}
```

Supabase Storage APIエンドポイント（GASから `UrlFetchApp.fetch` で呼び出す）：
- アップロード: `POST {SUPABASE_URL}/storage/v1/object/flyer-images/{fileName}`
- 一覧: `GET {SUPABASE_URL}/storage/v1/object/list/flyer-images`
- 署名付きURL: `POST {SUPABASE_URL}/storage/v1/object/sign/flyer-images/{fileName}` （body: `{"expiresIn": 3600}`）
- 削除: `DELETE {SUPABASE_URL}/storage/v1/object/flyer-images` （body: `{"prefixes": [fileName]}`）
- ヘッダー: `Authorization: Bearer {SUPABASE_SERVICE_KEY}`

#### ステップ3: features.js のチラシ画像関数を更新

変更対象（現在の行番号は調査時点のもの。実装時は要確認）：

| 関数 | 変更内容 |
|-----|---------|
| `getFlyerImages()` | Drive一覧 → Supabase Storage一覧API + Firestore imageTags（storageKeyで検索） |
| `getFlyerImageBase64(storageKey)` | DriveApp取得 → Supabase signed URL取得 → URLFetch → base64変換して返却 |
| `uploadFlyerImage(base64, fileName, mimeType)` | Drive保存 → Supabase Storageアップロード + Firestore imageTags（storageKeyをIDとして保存） |
| `deleteFlyerImage(storageKey)` | DriveApp.setTrashed → Supabase Storage削除 + Firestore imageTags削除 |
| `generateImageWithImagen()` | AI生成画像をDrive保存 → Supabase Storageにアップロード |

#### ステップ4: フロントエンドの呼び出し確認

`js-lectures-flyer.html` の変更は**原則なし**。ただし：
- `loadFlyerImages()` が返す画像IDが DriveFileId → storageKey（例: `flyer/abc.png`）に変わるため、キャッシュキー形式が変わる
- 画像削除・アップロードも同様にIDが変わるが、関数インターフェースは変えない
- `getFlyerImages()` の返値 `[{id, name, mimeType, tags}]` の `id` が storageKey になるだけ

### 切り戻し方針
- Drive 側のファイルは移行後も**削除しない**（しばらく残しておく）
- 移行スクリプト失敗時は `migrateFlyerImagesToSupabase()` を再実行可能にする（冪等設計）
- features.js を旧バージョンに `git revert` すれば即切り戻し可能

### Phase 2完了後にスコープ削除できるもの
チラシ画像（DriveApp）と AI生成画像（DriveApp）の移行完了後、features.js から DriveApp 使用がなくなる。
ただし auth.js・line.js・code.js のDriveApp使用が残るため、`drive` スコープ削除は Phase 5以降。

---

## Phase 3: スクリプトプロパティ移行 ⏭ スキップ（Phase 5に統合）

### スキップ理由

1. **鶏卵問題**: Supabase 接続情報（SUPABASE_URL / SUPABASE_SERVICE_KEY）自体が PropertiesService にあるため、他の設定を Supabase から読む起動ロジックが成立しない
2. **二度手間**: Phase 5 で全 GAS ファイルを書き直す際にまとめて移行する方が効率的
3. **リスク不均衡**: 移行コスト（本番環境への影響）vs メリット（GAS再デプロイ不要）の比率が悪い

### Phase 5 での振り分け方針（確定）

| 種別 | 具体的なキー | Phase 5 での移行先 |
|------|------------|------------------|
| APIシークレット | `GEMINI_API_KEY`、`GEMINI_API_KEY_BACKUP`、`SUPABASE_*`、`FIREBASE_*`、`LINE_CHANNEL_ACCESS_TOKEN`、`FIREBASE_WEB_API_KEY` | Cloudflare Workers Secrets（`wrangler secret put KEY`） |
| 管理者設定 | `ADMIN_EMAILS` | Cloudflare Workers Secrets |
| Drive設定 | `APP_FOLDER_ID`、`ACCESS_FOLDER_ID` | Phase 5 時点で不要なら削除 |
| JSON設定（大） | `STAFF_PLACEMENT_{year}`、`STAFF_PLACEMENT_ARCHIVE_{year}`、`LECTURE_PERIODS_CONFIG`、`GRADES_*_CONFIG`、`NORMAL_CLASS_CONFIG`、`LECTURE_PRICING_CONFIG`、`LECTURE_GREETINGS_CONFIG`、`PRICING_TABLE_CONFIG` | Cloudflare KV（`env.KV.put(key, json)`） |
| キャッシュ | `HOLIDAY_CACHE`、`LECTURE_DEADLINE_OVERRIDES`、`BASIC_TEST_DATES`、`PUBLIC_HIGH_EXAM_DATES` | Cloudflare KV（TTL付き） |
| ユーザー個別設定 | `_UP_{safeEmail}_*`（DISPLAY_NAME, SUBJECTS, PREFERRED_CAMPUSES, AI_ASSISTANT_NAME, AI_PERSONALITY, USER_THEME_COLOR 等） | Supabase `staffs` テーブル（既存マッピング層を活用） |
| AI設定 | `AI_KNOWLEDGE_BASE`、`LAST_ANALYSIS_META` | Supabase `ai_learned_knowledge` テーブル（既存）/ `app_config` |
| その他 | `THEME_COLOR`、`FORM_EMAIL_SENDER`、`LINE_SCHEDULER_SETTINGS` | Cloudflare KV |
| CacheService | Firebase トークン（50分）、隠し管理者（6時間）、テスト分析（5分） | Cloudflare KV（TTL付き） |

---

## Phase 4: Cloudflare Workers環境セットアップ ← 現在

### 目的

Phase 5（GAS→CF移行）に入る前に、Cloudflare Workers のインフラ（Workers本体・KV・CI/CD）を整備する。
**Phase 4 ではスタブ Workers をデプロイするだけ。実際のトラフィックは Phase 5/6 まで流さない。**

### Phase 4 完了の定義

- Cloudflare Workers が `https://s-quire-api.{サブドメイン}.workers.dev` でレスポンスを返す
- GitHub プッシュで自動デプロイされる
- KV ネームスペースが作成され wrangler.toml に設定されている
- GAS・Firebase Hosting・既存ユーザー体験に一切影響なし

---

### ユーザーが手動で実施する作業（Step 1〜4）

#### Step 1: Cloudflare アカウント作成

1. https://dash.cloudflare.com/sign-up にアクセス
2. メールアドレスとパスワードを入力して登録
3. メール認証を完了する
4. プラン選択は **Free（無料）** でOK

#### Step 2: Workers & KV を有効化

1. Cloudflare ダッシュボード左メニュー「**Workers & Pages**」をクリック
2. 初回アクセス時に有効化の確認画面が出る → 「Get started」
3. サブドメイン（`your-name.workers.dev`）を設定する（後で変更不可）
4. 左メニュー「**KV**」をクリック → 「Create namespace」
   - Name: `S_QUIRE_KV`
   - 作成後に表示される **Namespace ID**（例: `abc123...`）をメモ

#### Step 3: API トークン発行

1. ダッシュボード右上のアカウントアイコン → 「**My Profile**」
2. 左メニュー「**API Tokens**」→「**Create Token**」
3. 「**Edit Cloudflare Workers**」テンプレートを選択
4. 以下の権限が付いていることを確認：
   - Account > Workers KV Storage: **Edit**
   - Account > Workers Scripts: **Edit**
   - User > User Details: **Read**（自動付与）
5. 「Continue to summary」→「Create Token」
6. 表示されたトークン（`a1b2c3...`）を**今だけコピーしてメモ**（再表示不可）

ダッシュボード右上のアカウントアイコン → 「My Profile」 → 下部の **Account ID** もメモする。

#### Step 4: GitHub Secrets に登録

1. GitHub リポジトリ `square1995/S-quire` を開く
2. 「**Settings**」→「**Secrets and variables**」→「**Actions**」
3. 「**New repository secret**」を 2 回クリックして以下を登録：

| Secret 名 | 値 |
|----------|----|
| `CLOUDFLARE_API_TOKEN` | Step 3 でコピーしたトークン |
| `CLOUDFLARE_ACCOUNT_ID` | Step 3 でメモした Account ID |

---

### Claude が実施する作業（ユーザーの Step 1〜4 完了後）

ユーザーから「**KV の Namespace ID**」を教えてもらったら以下を実施する。

#### 作成ファイル一覧

| ファイル | 内容 |
|---------|------|
| `wrangler.toml` | Workers 設定（名前・KV・互換日付） |
| `workers/src/index.js` | スタブ Workers（常に `{"status":"ok"}` を返す） |
| `.github/workflows/deploy-workers.yml` | CI/CD（`workers/**` 変更時に自動デプロイ） |

#### `wrangler.toml`

```toml
name = "s-quire-api"
main = "workers/src/index.js"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "KV"
id = "（ユーザーが教えてくれた KV Namespace ID）"
preview_id = "（同じIDでOK）"
```

#### `workers/src/index.js`（スタブ）

```javascript
export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({ status: 'ok', message: 'S-quire API Phase 4 stub' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
```

#### `.github/workflows/deploy-workers.yml`

```yaml
name: Cloudflare Workers デプロイ
on:
  push:
    branches:
      - main
      - 'claude/**'
    paths:
      - 'workers/**'
      - 'wrangler.toml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

### Phase 5 開始前チェックリスト ✅ 完了

| 確認項目 | 結果 |
|---------|------|
| Workers URL でレスポンスが返る | ✅ https://s-quire-api.square1995square.workers.dev |
| GitHub Actions が成功している | ✅ 緑チェック確認済み |
| KV が wrangler.toml に設定されている | ✅ ID: 8dcb25efee404474a9e1f948d59bb477 |
| GAS・アプリが従来通り動作している | ✅ 確認済み |

---

## Phase 5-B: Workers 基盤構築 → 段階的関数移行（並行稼働方式）← 現在

### 前提：調査で判明した重要事実

| 発見 | 内容 | 影響 |
|------|------|------|
| **認証は REST API 検証** | `verifyFirebaseIdToken_` は `identitytoolkit.googleapis.com/v1/accounts:lookup` を呼ぶだけ（JWT署名ローカル検証なし） | Web Crypto API の PEM/RSA は**不要**。最難関が消えた |
| **RSA署名が必要なのは Firestore トークン生成のみ** | `getFirestoreAccessToken_` がサービスアカウント JWT を生成する際に `Utilities.computeRsaSha256Signature` を使用 | Workers では `crypto.subtle.sign(RSASSA-PKCS1-v1_5)` で代替可能。ライブラリ不要 |
| **Supabase は完全に fetch() 対応** | `UrlFetchApp.fetch()` と `fetch()` の違いのみ | そのままポート可能 |
| **CORS 注意点** | GAS は `Content-Type: text/plain` でプリフライトを回避。Workers も同じ形式を受け取れるが、レスポンスに `Access-Control-Allow-Origin` ヘッダーが必要 | Workers に CORS ヘッダーを追加するだけ（OPTIONS 不要） |

---

### アーキテクチャ設計

#### gas-bridge.html ルーティング層

```javascript
// 追加する2定数
var WORKERS_URL = 'https://s-quire-api.square1995square.workers.dev';
var WORKERS_FUNCTIONS = new Set([
  // 移行済み関数名をここに追加していく（最初は空）
  // 例: 'ping', 'getAdminEmails', 'getAppStartupData'
]);

// callGas_() の先頭でルーティング
function callGas_(funcName, args, successFn, failureFn) {
  var targetUrl = WORKERS_FUNCTIONS.has(funcName) ? WORKERS_URL : GAS_EXEC_URL;
  // ... 以降は現行ロジックそのまま（idToken送信・タイムアウト・リトライ）
}
```

**フォールバック戦略**: 手動切り戻し。Workers が壊れたら `WORKERS_FUNCTIONS` から関数名を削除してデプロイするだけ。自動フォールバックは実装しない（複雑性を避けるため）。

**認証**: 同じ `idToken` を GAS・Workers どちらにも送る。Workers 側も同じ REST API で検証するため互換。

---

#### Workers ファイル構成

```
workers/src/
├── index.js          # fetch ハンドラー（CORS・ルーティング）
├── router.js         # functionName → handler 動的ディスパッチ
├── auth.js           # Firebase ID トークン REST API 検証
├── firebase.js       # Firestore REST クライアント（GAS版をポート）
├── supabase.js       # Supabase REST クライアント（GAS版をポート）
└── functions/
    ├── ping.js       # ヘルスチェック（最初に実装・認証なし）
    └── (以降順次追加)
```

---

### 各ファイルの実装要点

#### `workers/src/index.js`
```javascript
export default {
  async fetch(request, env) {
    // CORS（プリフライトなし・text/plain を維持するためシンプル）
    const CORS = { 'Access-Control-Allow-Origin': 'https://fir-quire.web.app' };
    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404, headers: CORS });
    }
    try {
      const body = await request.json();
      const result = await handleApiCall(body, env);
      return new Response(JSON.stringify(result), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ __gasError: e.message }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }
  }
};
```

#### `workers/src/auth.js`
```javascript
// GAS: UrlFetchApp.fetch → Workers: fetch()
// 検証方式は同じ（Firebase REST API）。変更点はほぼなし
export async function verifyFirebaseIdToken(idToken, env) {
  const apiKey = env.FIREBASE_WEB_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    { method: 'POST', body: JSON.stringify({ idToken }),
      headers: { 'Content-Type': 'application/json' } }
  );
  const data = await res.json();
  if (!data.users?.[0]) return null;
  return { email: data.users[0].email, uid: data.users[0].localId };
}
```

#### `workers/src/firebase.js` — Firestore アクセストークン生成（最重要実装）

```javascript
// GAS: Utilities.computeRsaSha256Signature + Utilities.base64EncodeWebSafe
// Workers: Web Crypto API（外部ライブラリ不要）

async function getFirestoreAccessToken(env) {
  // KV キャッシュ確認（GAS の CacheService に相当）
  const cached = await env.KV.get('firestore_token');
  if (cached) return cached;

  // JWT 生成
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  }));

  // PEM → DER 変換（atob だけで可能）
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const der = pemToDer(pem);
  const key = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(`${header}.${payload}`)
  );

  // トークン取得・KV キャッシュ（50分）
  const jwt = `${header}.${payload}.${b64url(sig)}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt
    })
  });
  const { access_token } = await tokenRes.json();
  await env.KV.put('firestore_token', access_token, { expirationTtl: 2940 }); // 49分
  return access_token;
}

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(data) {
  const str = typeof data === 'string' ? data
    : String.fromCharCode(...new Uint8Array(data));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
```

#### `workers/src/supabase.js`
```javascript
// GAS版からの変更点:
// - UrlFetchApp.fetch() → fetch()
// - PropertiesService → env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY
// - Logger.log() → console.log()
// - Utilities.sleep() → await new Promise(r => setTimeout(r, ms))
// 関数シグネチャは GAS版と同一を維持
```

---

### 移行優先順位と根拠

| 優先度 | 関数 | 理由 |
|--------|------|------|
| **1. 最初** | `ping`（新規） | インフラ検証。DB接続・認証なし。失敗しても影響ゼロ |
| **2. 次** | `getAdminEmails` | Admin API。管理者のみ使用。Supabaseなし（PropertiesServiceだけ） |
| **3.** | `getStaffProfile` | Supabase 単純SELECT。読み取りのみ。認証必須だが影響範囲小 |
| **4.** | `getAppStartupData` | アプリ起動時の最重要関数。Firestore + Supabase 両方使用。基盤が安定したら移行 |
| **5.以降** | 成績入力・スケジュール等の書き込み系 | 最後に移行。トランザクション・LockService代替も必要 |

`getAppStartupData` を「すぐに」動かさない理由: 起動時に全ユーザーが使うため、バグの影響が最大。基盤（auth + firebase + supabase）が本番で実証されてから移行する。

---

### Phase 5-B コミット分割

#### サブフェーズ 5-B-1: Workers 基盤（Secrets + クライアント実装）

| コミット | 内容 | 動作確認 |
|---------|------|---------|
| B-①  | `wrangler.toml` に Secrets 定義追記（`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_WEB_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`） | wrangler deploy が通ること |
| B-② | `workers/src/auth.js` + `workers/src/firebase.js` + `workers/src/supabase.js` 追加 | ファイル追加のみ（まだ index.js からは呼ばない） |
| B-③ | `workers/src/router.js` + `workers/src/index.js` 更新（`ping` エンドポイント追加・CORS対応） | `curl -X POST https://s-quire-api.square1995square.workers.dev` で `{"status":"ok"}` が返ること |
| B-④ | `gas-bridge.html` にルーティング層追加（`WORKERS_URL` + `WORKERS_FUNCTIONS` Set）、`ping` を WORKERS_FUNCTIONS に追加 | アプリから `google.script.run.ping()` を呼んで Workers が応答すること |

#### サブフェーズ 5-B-2: 最初の実関数移行

| コミット | 内容 | 動作確認 |
|---------|------|---------|
| B-⑤ | `workers/src/functions/admin.js` — `getAdminEmails` 実装 + WORKERS_FUNCTIONS 追加 | 管理タブ → 設定 が正常表示 |
| B-⑥ | `workers/src/functions/settings.js` — `getStaffProfile` 実装 + WORKERS_FUNCTIONS 追加 | 設定タブでプロフィール表示 |
| B-⑦ | `workers/src/functions/startup.js` — `getAppStartupData` 実装 + WORKERS_FUNCTIONS 追加 | アプリ起動・全タブ表示・ユーザー認証 |

#### B-① wrangler.toml 変更内容（完了後すぐ実装）

```toml
# 追加する [vars] セクション（公開値）
[vars]
FIREBASE_WEB_API_KEY = "AIzaSyDGxhgsCbpgJuXm6PzY1WcR8a4QOtfJBiU"

# Secrets はダッシュボード登録済み（ここには値を書かない）
# 登録済み: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
#           SUPABASE_URL / SUPABASE_SERVICE_KEY
```

動作確認: `wrangler deploy` が通ること（GitHub Actions 緑チェック）

---

#### 期間見積もり

| サブフェーズ | 作業内容 | 見積もり |
|------------|---------|---------|
| 5-B-1 | 基盤（Secrets登録含む）+ ping 疎通確認 | 3〜5日 |
| 5-B-2（前半） | getAdminEmails + getStaffProfile | 2〜3日 |
| 5-B-2（後半） | getAppStartupData（最複雑） | 3〜5日 |
| **合計** | | **1.5〜2週間** |

長くなる理由: GAS と Workers で `async/await` パターンが根本的に違う。GAS の同期スタイルを全関数で非同期化する必要があり、移行ごとに実際のアプリでの動作確認が必要。

---

### Secrets の登録方法（ユーザー手動作業）

B-① のデプロイ前に、以下を GitHub Secrets に登録が必要（Cloudflare の Secrets は wrangler CLI または GitHub Actions 経由）:

```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_WEB_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
```

現在 GAS のスクリプトプロパティに入っている値をそのまま使用する。登録方法は2通り:
1. `wrangler secret put KEY_NAME`（ターミナルから対話入力）
2. Cloudflare ダッシュボード → Workers → s-quire-api → Settings → Variables and Secrets

---

## Phase 5: GASバックエンドをCloudflare Workersへ移行 ← 現在

---

## Phase 5-A 詳細作業リスト（レビュー用）

### 前提判断（調査完了）

| 判断 | 結論 | 根拠 |
|------|------|------|
| Cloudflare Freeプラン | ✅ 十分 | `bulkImportStudents`/`bulkImportGrades` にHTML UIなし（grep確認済）→ 削除してOK |
| `generateStudentAnalyses` CPU | ✅ 問題なし | 300K反復 ≈ 3ms、Free制限10ms以内 |
| GAS残存機能 | ✅ 確定 | GmailApp監視・LINE Webhook・`generateStudentAnalyses`/`generateAllAnalyses` |

---

### コミット分割計画

#### コミット① — `migrate-flyer-to-supabase.js` 全削除
- Phase 2完了済みの一回限り移行スクリプト。再実行不要
- ファイル全体（2301行）を削除

#### コミット② — `students.js` bulkImport削除
- `bulkImportStudents` (行1853〜1903) を削除
- `bulkImportGrades` (行1912〜1995) を削除
- ⚠️ `getSettingsFolder()` (行75〜94) は `generateStudentAnalyses` の依存関数（GAS残し）→ **削除しない**

#### コミット④ — `auth.js` DriveApp削除（次のコミット）

**変更1: `isAllowedUser`（行281〜292）**
- 削除: `// 5. Driveフォルダのオーナー・編集者チェック` ブロック全体
- 維持: `folderId` 宣言（行264）と `!folderId` 初期設定モードチェック（行265）

**変更2: `addUserAccess`（行365〜371）**
- 削除: `var folderId = ...` 宣言・早期returnガード・`DriveApp.getFolderById`・`folder.addEditor` の7行
- 維持: Supabase staffs登録・Firestore allowedUsers登録（行373〜）
- JSDoc更新: "DriveフォルダにEditorとして追加する（Drive共有通知メールが相手に届きます）" → 削除
- 成功メッセージ更新（行410）: "（Drive共有通知が届きます）" → 削除

**変更3: `removeUserAccess`（行433〜470）**
- 削除: `var folderId = ...` + 早期returnガード（行433〜436）
- 削除: `var folder = DriveApp...` + オーナーチェック（行438〜444）
- 維持: `allEmails` 収集（行455〜462）← Firestore cleanup で使用
- 削除: `// Drive 共有から全メールを解除` + `ownerEmail` + `folder.removeEditor` ループ（行464〜470）
- 成功メッセージ更新（行523）: "Drive共有・" を削除
- ✅ Supabase staffs が主系のため、Drive削除後も動作に影響なし

#### コミット④ — `code.js` DriveApp削除
- `doPost()` 内 LINE登録時 DriveApp.addEditor ブロック (行289〜298) を削除
- 行307 `GmailApp.sendEmail` 管理者通知: 削除（または空のコメントに）
  - ⚠️ GmailApp.sendEmail はLineとは別のメール通知。削除しても動作影響を確認

#### コミット⑤ — `line.js` DriveApp/SpreadsheetApp削除（次のコミット）

**変更1: `getLineRegisteredUsers`（行504〜528）**
- 削除: `allowedEmails`辞書 + `folderId`宣言 + DriveApp ブロック（行504〜520）
- 削除: allowedEmails を使う最初の `.filter()` チェーン（行525〜528）
- 維持: 重複排除の2つ目の `.filter()`（行529〜534）と `.map()`
- 理由: Supabase staffs が唯一の正規アクセス管理。Drive二重フィルタ不要

**変更2: `getLineSchedulerSheet_`（行885〜906）をスタブ化**
- `SpreadsheetApp.openById` を含む関数本体を `return null;` に変換
- 理由: 唯一の呼び出し元 `migrate.js:947` が `null` 返却を正常系として処理済み（行948-951）
- 関数自体は残す（migrate.js 側の変更を最小に留めるため）

#### コミット⑥ — `admin.js` SpreadsheetApp/DriveApp削除（次のコミット）

**削除対象: 9関数（呼び出し元なしの死コード）**

| 関数 | 行 | 削除理由 |
|------|-----|---------|
| `initializeGradesFolder` | 216〜235 | 呼び出し元なし。`createGradeDataSheet` を呼ぶだけ |
| `initializeLecturesFolder` | 243〜261 | 呼び出し元なし。`createLectureSheet` を呼ぶだけ |
| `initializeUniversitiesFolder` | 270〜288 | 呼び出し元なし。`createUniversitySheet` を呼ぶだけ |
| `initializeSettingsFolder` | 295〜304 | 呼び出し元なし。`createSystemSettingsSheet` を呼ぶだけ |
| `createGradeDataSheet` | 333〜375 | SpreadsheetApp.create。上記から呼ばれる死コード |
| `createLectureSheet` | 382〜405 | SpreadsheetApp.create。上記から呼ばれる死コード |
| `createUniversitySheet` | 412〜435 | SpreadsheetApp.create。上記から呼ばれる死コード |
| `createSystemSettingsSheet` | 441〜474 | SpreadsheetApp.create。上記から呼ばれる死コード |
| `getOrCreateOperationLogSheet` | 639〜681 | SpreadsheetApp.openById/create。呼び出し元ゼロ |

**維持（削除しない）**

| 関数 | 理由 |
|------|------|
| `importScheduleFromGoogleSheetsWithAI` (行1095) | SpreadsheetApp使用だが UI-active（`autoImportAllSchedules`→`js-admin-ext.html:800`） |
| `getOrCreateTabFolder` (行195) | assets フォルダ管理に必要（DriveApp）|
| `checkInitializationStatus` (行710) | `js-admin-ext.html:750` から呼ばれる UI-active |
| `manualInitializeSheets` (行1341) | `js-admin-ext.html:770`・`js-core.html:625` から呼ばれる UI-active |
| `initializeAllSheets` (行165) | doGet() から自動呼び出し。assets フォルダ確保に必要 |

**⚠️ スコープ削除プランの修正（新発見）**
- `spreadsheets` スコープ: `importScheduleFromGoogleSheetsWithAI`（SpreadsheetApp.openById）が残るため**コミット⑥後も削除不可**
- `drive` スコープ: assets フォルダ管理用 DriveApp が残るため削除不可

#### コミット⑦ — `appsscript.json` スコープ削除（コミット⑥完了後）
- `spreadsheets` スコープ: コミット⑥完了後に削除可能
- `drive` スコープ: `line.js:508`（buildUserListForNotification）と `students.js:84`（getSettingsFolder）がまだ残るため **削除不可の可能性あり** → 実装時に確認

---

### 動作確認チェックリスト（Phase 5-A 完了後）

| # | 確認項目 | タイミング |
|---|---------|-----------|
| 1 | GAS デプロイ成功（GitHub Actions 緑チェック） | 各コミット後 |
| 2 | ユーザー追加・削除が正常動作（auth.js変更後） | コミット③後 |
| 3 | LINE登録フロー（code.js変更後） | コミット④後 |
| 4 | LINE通知設定画面が開ける（line.js変更後） | コミット⑤後 |
| 5 | 管理タブ > 設定 サブタブ表示（admin.js変更後） | コミット⑥後 |
| 6 | 外部チラシ画像一覧・プレビュー表示 | 全コミット後 |
| 7 | 成績入力・スケジュール登録 | 全コミット後 |
| 8 | AIアシスタント動作 | 全コミット後 |

---

### 論点1確定: Cloudflare **Free プランで可**

| 処理 | 状況 | 結論 |
|------|------|------|
| `bulkImportGrades`（300件） | フロントエンドUIなし → Phase 5-A で削除 | ❌ 移行不要 |
| `bulkImportStudents`（100件） | フロントエンドUIなし → Phase 5-A で削除 | ❌ 移行不要 |
| `generateStudentAnalyses`（AI一括） | 長時間バッチ → Workers不向き → **GAS残し** | ❌ 移行しない |
| 通常API（成績入力・取得等） | subrequest 最大 4〜5回 | ✅ Free 50 以内で余裕 |

→ **Unbound（$5/月）不要。Free プランで全対応可能。**

---

### Phase 5-A: 残存 GAS 固有機能の削除（Phase 5 最初のステップ）

#### 削除確定（コミット分割）

| コミット | ファイル | 削除対象 | 根拠 |
|---------|---------|---------|------|
| ① | `students.js` | `bulkImportStudents`（行1853〜1903）、`bulkImportGrades`（行1912〜1995） | フロントエンドUIなし。OCRで代替可。過去データ移行専用の死コード |
| ② | `auth.js` | `isAllowedUser` DriveApp フォールバックブロック（行283〜292付近）、`addUserAccess` DriveApp.addEditor ブロック（行370付近）・成功メッセージ更新、`removeUserAccess` DriveApp.removeEditor ブロック（行438付近） | Supabase staffs + Firestore allowedUsers が主系。DriveApp は通知の副作用のみ |
| ③ | `code.js` | `doPost` LINE登録時 DriveApp.addEditor ブロック（行293付近） | Firestore allowedUsers で代替済み |
| ④ | `line.js` | `getLineSchedulerSheet_` の SpreadsheetApp 行（行893付近）と関連 SpreadsheetApp 使用 | Supabase staffs が主系。Sheets フォールバック不要 |
| ⑤ | `migrate-flyer-to-supabase.js` | ファイル全体削除 | Phase 2完了済み移行スクリプト。再実行不要 |
| ⑥ | `admin.js` | `createStudentScoreSheet`・`createStudentMasterSheet`・`createStudentDataSheet`・`copyDataSheetTemplate`・`openOrCreateDataSheet`・`getGradeDataSourceInfo`・`updateDataFromSheet`・`initializeAllSheets` の SpreadsheetApp/DriveApp ブロック | Supabase移行済み。実施前に呼び出し元確認を行う（別コミット） |

#### GAS 残し（削除しない）

| 機能 | ファイル | 理由 |
|-----|---------|------|
| Gmail 監視（5分トリガー） | `line.js` GmailApp | GAS 限定 API。Workers 化不可 |
| LINE 通知メール | `line.js` MailApp | LINE機能はGAS残し |
| Admin 通知メール | `code.js` GmailApp.sendEmail（行307） | LINE機能と同ファイル |
| `generateStudentAnalyses` | `analysis.js` | 長時間バッチ。Workers 壁時間超過リスク |
| `generateAllAnalyses` | `analysis.js` | 同上 |
| `getSettingsFolder` | `students.js` | `generateStudentAnalyses` の依存関数（GAS残し側） |

#### Phase 5-A 完了後の動作確認

| # | 確認項目 | 操作 |
|---|---------|------|
| 1 | ユーザー追加 | 管理タブ → ユーザー管理 → 追加 |
| 2 | ユーザー削除 | 管理タブ → ユーザー管理 → 削除 |
| 3 | 成績入力（1件） | 成績管理 → 入力 |
| 4 | 外部チラシ画像表示 | 講習管理 → 外部チラシ |
| 5 | GAS デプロイ成功 | GitHub Actions → GASへ自動デプロイ → 緑チェック |
| 6 | ログにエラーなし | 管理タブ → ログ |

#### Phase 5-A 後の appsscript.json スコープ状況

| スコープ | 状態 |
|---------|------|
| `spreadsheets` | admin.js削除（コミット⑥）確認後に削除可能 |
| `drive` | `line.js:508`（buildUserListForNotification）DriveApp が残るため、まだ削除不可 |
| `gmail` / `mail` | GmailApp・MailApp が残るため削除不可 |

---

### Phase 5-B〜F: Workers 基盤〜フロントエンド切替（Phase 5-A 完了後に詳細化）

#### ファイル構成（新規）

```
workers/
├── src/
│   ├── index.js          # fetch handler（doPost相当）
│   ├── auth.js           # Firebase IDトークン検証
│   ├── router.js         # 関数ルーティング
│   ├── firebase.js       # Firestore REST APIクライアント（流用）
│   ├── supabase.js       # Supabase REST APIクライアント（流用）
│   └── functions/        # 各機能モジュール
│       ├── schedule.js
│       ├── students.js
│       ├── analysis.js
│       ├── settings.js
│       ├── admin.js
│       ├── grades.js
│       ├── line.js
│       ├── features.js
│       ├── auth-functions.js
│       ├── minutes.js
│       └── backup.js
└── wrangler.toml
```

### GAS固有API → Cloudflare Workers 対応表

| GAS API | 使用数 | Cloudflare代替 |
|---------|--------|---------------|
| `UrlFetchApp.fetch()` | 27回 | `fetch()`（標準） |
| `PropertiesService` | 52回 | Supabase + KV + env変数 |
| `CacheService` | 9回 | Cloudflare KV（TTL付き） |
| `LockService` | 10回 | Supabase行ロック or KVによるlock |
| `Utilities.base64*` | 多数 | `btoa()`/`atob()` |
| `Utilities.formatDate()` | 多数 | `Intl.DateTimeFormat` |
| `Utilities.computeRsaSha256Signature()` | 2回 | Web Crypto API |
| `Logger.log()` | 523回 | `console.log()` |
| `ContentService` | 4回 | `new Response()` |
| `HtmlService` | 2回 | 静的ファイル（Firebase Hosting） |
| `LockService`（排他） | 10回 | Supabase `SELECT FOR UPDATE` |

### doPost → Workers fetch handler

```javascript
// 現在のGAS（code.js）
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  return handleApiCall_(body);
}

// Cloudflare Workers
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Not Found', { status: 404 });
    const body = await request.json();
    return handleApiCall(body, env);
  }
};
```

### フロントエンド（gas-bridge.html）の変更

```javascript
// 現在: GAS Web App URL
const GAS_URL = 'https://script.google.com/macros/s/...';

// 変更後: Cloudflare Workers URL
const GAS_URL = 'https://s-quire-api.your-subdomain.workers.dev';
```

---

## Phase 6-A: C 分類関数の Workers 移行

### 対象

`docs/remaining-functions-inventory.md` の C 分類 79 関数のうち、以下 3 条件を満たす
関数を Phase 6-A の対象とする:

1. フロントエンドから呼ばれる（GAS 内部ヘルパーは対象外）
2. GAS 固有 API（DriveApp / SpreadsheetApp / CalendarApp / GmailApp / MailApp /
   ScriptApp / HtmlService / ContentService / LockService）に依存しない
3. データ移行などの前提条件がクリア済み

### 確定対象関数

- `savePreferredCampuses`（`settings.js:590`）— `setUserProperty('PREFERRED_CAMPUSES', ...)`
  経由で `staffs.preferred_campuses` に保存。Workers 版は `saveLecGrades`
  （`workers/src/functions/settings.js:177`）と同型の PATCH で実装可能。

> Phase 6-A のサブフェーズ構成・要相談 3 関数（`resetUserThemeColor` /
> `editAutoLearnedKnowledge` / `resolveAiFeedback`）の取扱いは着手前に別途決定する。

### スコープ外（後続フェーズに先送り）

- **チラシ系 9 関数**（`features.js`）— DriveApp / SpreadsheetApp 依存。前提として
  Drive → Supabase Storage、Spreadsheet（imageTags / flyerAi）→ Firestore or Supabase
  テーブルへの移行が必要（現状 `features.js` 内に DriveApp 参照残存）
- **Drive / Spreadsheet / Calendar / Gmail / MailApp / ScriptApp 依存関数群**（約 25 関数）
  — それぞれ Google API への差し替え・Workers Cron Triggers 設計等が必要
- **migrate.js 14 関数** — 手動実行のロールバック用。Workers 化不要

---

## Phase 6-B: デプロイ設定の切替（旧 Phase 6）

### 新規追加: `.github/workflows/deploy-workers.yml`

```yaml
name: Cloudflare Workers デプロイ
on:
  push:
    branches: [main, 'claude/**']
    paths:
      - 'workers/**'
      - 'wrangler.toml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### 変更: `.github/workflows/deploy-to-gas.yml`
- GASデプロイを廃止（Workers移行完了後）
- `appsscript.json` の不要スコープ削除

### 変更: `appsscript.json`
- Phase 1完了後: `spreadsheets`、`drive` スコープを削除
- Phase 5完了後: GASデプロイ自体を廃止

---

## 実施順序とリスク評価

| Phase | 作業 | リスク | 切り戻し |
|-------|------|--------|----------|
| 1 | 不要機能削除 | 低（削除のみ） | git revert |
| 2 | チラシ画像移行 | 中（データ移行） | Drive側を残しておく |
| 3 | プロパティ移行 | 中（設定変更） | PropertiesService併用 |
| 4 | CF環境構築 | 低（既存に影響なし） | 不要なら削除のみ |
| 5 | Workers移行 | 高（大規模書き換え） | GAS URLを一時的に戻す |
| 6-A | C 分類関数の Workers 移行 | 低（小スコープ・GAS フォールバック温存） | WORKERS_FUNCTIONS から除去 |
| 6-B | デプロイ切替 | 低（設定変更） | yml削除 |

---

## 調査結果による追加判明事項

### LockService 使用箇所（8箇所）

| # | ファイル:行 | 関数名 | ロック種類 | 待機時間 | 守っている処理 | Workers移行時の代替案 |
|---|---|---|---|---|---|---|
| 1 | students.js:432 | submitStudentInfo | getScriptLock | 15秒 | 生徒ID自動採番（maxSeq計算）＋Supabase書き込み | Supabase SELECT FOR UPDATE |
| 2 | students.js:2015 | saveExamResult | getScriptLock | 10秒 | 受験情報をSupabaseに更新 | Supabase ON CONFLICT DO UPDATE |
| 3 | features.js:3203 | saveLectureScheduleEntries | getScriptLock | 10秒 | Firestoreの講習エントリ配列を一括置換 | Firestore Transactions |
| 4 | features.js:3315 | createLectureEntryAI_ | getScriptLock | 10秒 | 既存エントリ読込→追加→全置換のRMW処理 | Firestore Transactions |
| 5 | features.js:3371 | createWeeklyLectureEntriesAI_ | getScriptLock | 10秒 | 複数週分エントリ追加→全置換 | Firestore Transactions |
| 6 | features.js:3475 | editLectureEntryAI_ | getScriptLock | 10秒 | エントリ更新→全置換 | Firestore Transactions |
| 7 | features.js:3525 | deleteLectureEntryAI_ | getScriptLock | 10秒 | エントリ削除→全置換 | Firestore Transactions |
| 8 | features.js:3571 | bulkLectureOperationsAI_ | getScriptLock | 10秒 | 複数操作→全置換 | Firestore Transactions |

→ #3〜#8はFirestore Transactionsで自然に解決。#1〜#2はSupabase側で対応。

---

### Cloudflare Workers subrequest数の問題（⚠️重要）

Cloudflare Workers無料プラン上限: **1リクエストあたり50回**（有料Unbound: 1000回）

| 処理 | APIコール数 | 判定 |
|------|-----------|------|
| AI分析バッチ（120人） | 21回 | ✅ 安全 |
| OCR講習スケジュール（10講習） | 30回 | ✅ 安全 |
| **成績一括インポート（300行）** | **320回** | ❌ 超過 |
| **生徒一括インポート（100人）** | **100回** | ❌ 超過 |

→ **一括インポート処理は有料プラン（Unbound）必須**、またはバッチAPI化が必要。
→ Cloudflare Workers有料プラン: 月$5（10Mリクエスト）。

---

### チラシ画像の機密性

- **用途**: 塾の宣伝チラシ素材（AI生成チラシに埋め込む背景・イラスト）
- **現在の仕組み**: GAS経由でbase64返却（公開URLは存在しない）
- **個人情報リスク**: 中〜高（ユーザーが誤って生徒顔写真をアップロードする可能性あり）
- **判定**: **非公開バケット＋署名付きURL**（Supabase Storage signed URL）が適切
  - 公開バケットは不可（誤アップロードされた個人写真が外部流出するリスク）

→ Phase 2での移行先はSupabase Storage **非公開バケット**＋signed URLアクセスに変更。

---

### backup.jsの実態

- `runFirestoreBackup`のみ2箇所から呼ばれる
  - `admin.js:1448`（scheduledInitializeSheets内、毎日午前2時の定時実行）
  - `js-admin-ext.html:1011`（管理タブ→ログセクション→「💾 今すぐバックアップ」ボタン）
- `setupBackupTrigger`/`deleteBackupTrigger`/`getBackupTriggerStatus`は**呼び出し元なし**（安全に削除可能）
- `ScriptApp.newTrigger`は`setupBackupTrigger()`内に定義されているが実際には呼ばれていない
- `scheduledInitializeSheets`のトリガー削除も必要（backup.js削除時）

---

## 重要ファイル一覧

| ファイル | Phase | 変更内容 |
|---------|-------|---------|
| `schedule.js` | 1 | L44,L610,L650 削除 |
| `admin.js` | 1 | L157,L217,L261,L493 削除 |
| `features.js` | 1,2 | L3095,L5021,L5049,L5100 削除; L3754,L3794,L3879,L3948 Supabase Storage対応 |
| `settings.js` | 1 | L437-459,L685 削除 |
| `students.js` | 1 | L2303 削除 |
| `auth.js` | 1 | L664,L719,L911 DriveApp行削除 |
| `backup.js` | 1 | ファイル全体削除 |
| `js-admin-ext.html` | 1 | DriveBrowser UI削除(L718,L762,L789)、Backup UI削除(L1011) |
| `js-lectures-materials.html` | 1 | PDF保存UI削除(L1270,L1344,L1399) |
| `js-core.html` | 1 | プロフィール写真UI削除(L2279) |
| `js-grades-report-pdf.html` | 1 | 「Driveに保存」ボタン削除(L568) |
| `js-lectures-flyer.html` | 2 | Storage URL対応 |
| `gas-bridge.html` | 5 | Workers URL変更 |
| `wrangler.toml` | 4 | 新規作成 |
| `workers/src/index.js` | 5 | 新規作成 |
| `.github/workflows/deploy-workers.yml` | 6 | 新規作成 |
| `.github/workflows/deploy-to-gas.yml` | 6 | 廃止 |
| `appsscript.json` | 1,6 | スコープ削除、最終廃止 |

---

## スクリプトプロパティの扱い（補足）

スクリプトプロパティに保存されているデータは以下のように移行：

- **Phase 1完了後**: `APP_FOLDER_ID`、`ACCESS_FOLDER_ID`（Drive用）は不要になる
- **Phase 3**: 残りをSupabase + Cloudflare KV + Workers Secretsに移行
- **Phase 5**: GAS上のPropertiesServiceへのアクセスがすべてなくなる

移行時はPropertiesServiceとSupabaseを一時的に併用し、動作確認後にPropertiesService側を削除する。

---

## 進め方の提案

まずPhase 1（削除作業）から着手するのが最もリスクが低い。
削除は元に戻せるため、本番環境への影響を最小にしながら進められる。

Phase 1完了後、現行GASの動作を確認してからPhase 2以降に進む。

---

## B-⑦ getAppStartupData Workers 移行プラン（調査結果）

> 調査日: 2026-04-19
> 前提: B-⑥ 完了（getUserProfile Workers 動作確認済み）

---

### 1. 現状分析

#### GAS getAppStartupData の処理フロー（settings.js L682-765）

```
引数: (firebaseEmail, firebaseUid)
  ↓
①  Admin 判定: env.ADMIN_EMAILS（ScriptProperties）をカンマ分割して比較
②  isFirstSetup: adminList.length === 0
③  Staff 照合: supabaseRpc('find_staff_by_auth', {p_uid, p_email})
④  UID 補完: staff が見つかり firebase_uid 未登録なら Supabase に upsert
⑤  Staff フィールド展開: teacherId / displayName / themeColor 等
⑥  ScriptProperties 読み取り: GEMINI_API_KEY / GEMINI_API_KEY_BACKUP / APP_FOLDER_ID / ACCESS_FOLDER_ID / THEME_COLOR
⑦  isUnregistered: !isFirstSetup && !isAdmin && !staff
⑧  cleanupMigratedUserProperties_(): 旧 _UP_ ScriptProperties 一括削除（GAS 専用）
⑨  Firestore 書き込み: allowedUsers コレクションに email を自動登録
⑩  getLatestGradeAnalysisMeta(): Supabase test_analysis テーブルから最新1件取得
  ↓
戻り値オブジェクト（16 フィールド）
```

#### 戻り値の全フィールド

| フィールド | 型 | フロントでの使用目的 |
|-----------|-----|------------------|
| `success` | boolean | 起動分岐判定 |
| `isFirstSetup` | boolean | セットアップウィザード表示 |
| `currentUserEmail` | string | ログ・内部保持 |
| `isAdmin` | boolean | 管理タブ表示制御・`isAdminUser` 代入 |
| `needsIdInput` | boolean | 後方互換（isUnregistered と同値） |
| `isUnregistered` | boolean | 講師ID入力画面表示 |
| `teacherId` | string | プロフィール表示 |
| `themeColor` | string | UI テーマカラー即時適用 |
| `displayName` | string | ヘッダー表示名 |
| `geminiApiKey` | string | `'***設定済み***'` or `'未設定'` の状態文字列のみ |
| `geminiApiKeyBackup` | string | 同上 |
| `appFolderId` | string | 初回セットアップウィザードの事前入力 |
| `accessFolderId` | string | 同上 |
| `aiAssistantName` | string | AI ウィジェット名 |
| `aiPersonality` | string | AI 性格設定 |
| `preferredCampuses` | Array | 配属校舎設定 |
| `lecGrades` | Array | 講習担当学年設定 |
| `lastAnalysisMeta` | `{year, testName}` \| null | localStorage に保存（成績分析タブ用） |

#### データソース別まとめ

| データ | GAS のソース | Workers のソース（予定） |
|--------|-------------|----------------------|
| スタッフ情報（名前・テーマ等） | Supabase RPC `find_staff_by_auth` | 同じ |
| 最新成績分析メタ | Supabase `test_analysis` | 同じ |
| Admin判定 | ScriptProperties `ADMIN_EMAILS` | `env.ADMIN_EMAILS`（既存シークレット） |
| テーマカラー default | ScriptProperties `THEME_COLOR` | `'#43e97b'` 固定（staff.themeColor 優先のため実質未使用） |
| geminiApiKey 状態 | ScriptProperties `GEMINI_API_KEY` 存否 | **新シークレット** `env.GEMINI_API_KEY` 存否 |
| geminiApiKeyBackup 状態 | ScriptProperties `GEMINI_API_KEY_BACKUP` 存否 | **新シークレット** `env.GEMINI_API_KEY_BACKUP` 存否 |
| appFolderId | ScriptProperties `APP_FOLDER_ID` | **新シークレット** `env.APP_FOLDER_ID` |
| accessFolderId | ScriptProperties `ACCESS_FOLDER_ID` | **新シークレット** `env.ACCESS_FOLDER_ID` |
| allowedUsers 登録 | Firestore `allowedUsers` 書き込み | `firestoreSet(env, 'allowedUsers', ...)` |

---

### 2. Workers 実装設計

#### 2-① 新規追加が必要な Cloudflare Secrets（4件）

| シークレット名 | 用途 | 判定方法 |
|-------------|------|---------|
| `GEMINI_API_KEY` | geminiApiKey の状態文字列生成 | `env.GEMINI_API_KEY ? '***設定済み***' : '未設定'` |
| `GEMINI_API_KEY_BACKUP` | geminiApiKeyBackup の状態文字列生成 | 同上 |
| `APP_FOLDER_ID` | appFolderId として返す（ウィザード用） | `env.APP_FOLDER_ID \|\| ''` |
| `ACCESS_FOLDER_ID` | accessFolderId として返す（ウィザード用） | `env.ACCESS_FOLDER_ID \|\| ''` |

> **設定場所**: Cloudflare Dashboard → Workers & Pages → s-quire-api → Settings → Variables and Secrets

> **ユーザー作業が必要**: これらは Claude がコミットで追加できない。事前に手動で追加してもらう必要がある。

#### 2-② workers/src/functions/settings.js に追加する関数

```
getAppStartupData(args, env, user)
  ├─ user.email / user.uid を利用（verifyFirebaseIdToken 済み）
  ├─ Admin 判定: env.ADMIN_EMAILS
  ├─ isFirstSetup: adminEmails.length === 0
  ├─ Staff 照合: supabaseRpc(env, 'find_staff_by_auth', {...})
  ├─ UID 補完（省略 不要処理を除く）:
  │    staff が見つかり staff.firebaseUid 未設定 → supabaseUpsert でサイレント更新
  ├─ Staff フィールド展開（getUserProfile と同一ロジック）
  ├─ geminiApiKey / appFolderId 等: env.GEMINI_API_KEY など存否チェック
  ├─ isUnregistered: !isFirstSetup && !isAdmin && !staff
  ├─ allowedUsers 書き込み: firestoreSet(env, 'allowedUsers', email, {...})
  │    ※ UID 補完 + Firestore 書き込みを Promise.all で並列実行してレスポンスを早くする
  └─ lastAnalysisMeta:
       supabaseSelect(env, 'test_analysis', 'select=year,test_name&order=generated_at.desc&limit=1')
       → { year, testName } or null
```

**GAS 版との差分まとめ:**

| 処理 | GAS 版 | Workers 版 |
|------|--------|-----------|
| cleanupMigratedUserProperties_() | 実行 | **省略**（ScriptProperties が存在しないため不要） |
| THEME_COLOR global default | ScriptProperties 読み取り | `'#43e97b'` 固定（staff.themeColor 優先で実質差異なし） |
| displayName fallback | `getDisplayName(email)` | `user.email`（DB 未設定ユーザーは実質いない） |
| UID 補完 | resolveStaffByUid_ 内の複雑なマイグレーション処理 | 単純な UID 未設定チェック + upsert のみ |
| Logger.log | GAS ログ | なし（エラー時のみ throw） |

#### 2-③ workers/src/router.js への追加

`getUserProfile` と同じパターンで `getAppStartupData` を HANDLERS に追加。

#### 2-④ gas-bridge.html への追加（本番切り替え）

```javascript
var WORKERS_FUNCTIONS = new Set([
  'ping',
  'getAdminEmails',
  'getUserProfile',
  'getAppStartupData'  // ← 追加
]);
```

---

### 3. フロント側の変更点

**変更なし。** 現在 `getAppStartupData` は gas-bridge 経由で呼ばれており、WORKERS_FUNCTIONS への追加だけで切り替わる。引数形式（email, uid）も Workers 側で `user` オブジェクトから取得するため、呼び出し側コードの変更は不要。

---

### 4. リスクと検証計画

#### リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| Workers が 500 エラーを返す | アプリが起動しない（フォールバックあり） | ① gas-bridge の失敗ハンドラでフォールバック起動 ②WORKERS_FUNCTIONS から削除で即切り戻し |
| allowedUsers 書き込み失敗 | Firestore セキュリティルールによりその後のスケジュール等の読み書きが失敗 | try-catch でエラーを握りつぶさず、失敗ログを残す（GAS 版も同様） |
| 4 シークレット未設定 | appFolderId 等が空文字になる | アプリは起動するが初回セットアップウィザードで正常動作しない可能性あり（本番は初回セットアップ済みのため影響小） |
| Supabase test_analysis テーブル SELECT 失敗 | lastAnalysisMeta が null になる | try-catch で null を返すだけ（GAS 版と同じ挙動） |

#### 切り戻し手順

gas-bridge.html の `WORKERS_FUNCTIONS` から `'getAppStartupData'` の1行を削除してコミット・プッシュ。約2〜3分で GAS にフォールバック。

#### 動作確認チェックリスト（移行後）

1. ハードリロード → スプラッシュ画面が正常に消える
2. DevTools Network → `workers.dev` への POST が 200 OK
3. 管理者アカウントでログイン → `isAdmin: true` が返り管理タブが表示される
4. 非登録メールでログイン → `isUnregistered: true` が返り ID 入力画面が表示される
5. Firestore allowedUsers コレクションに email が登録されていること（ブラウザの後続リクエストが 403 にならないこと）
6. 成績分析タブを開く → `localStorage.getItem('s-quire-last-analysis')` に値がある

---

### 5. 実装ステップ（確認待ち）

| ステップ | 誰が | 内容 |
|---------|------|------|
| **事前①** | **ユーザー手動** | Cloudflare Dashboard で 4 シークレット追加（GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, APP_FOLDER_ID, ACCESS_FOLDER_ID） |
| **B-⑦a** | Claude | `workers/src/functions/settings.js` に `getAppStartupData` 追加 + `workers/src/router.js` 更新 |
| **B-⑦b** | Claude | `gas-bridge.html` に `'getAppStartupData'` 追加（本番切り替え） |

> **ユーザーの判断が必要な点（次セクション参照）**

---

### 6. ユーザーへの確認事項

**Q1: 4 シークレットの追加タイミング**
B-⑦a コミット前に追加するか、B-⑦a コミット後・B-⑦b 切り替え前に追加するか？
（B-⑦a 単体ではフロントに影響なし。B-⑦b 前までに追加すれば OK。）

**Q2: appFolderId / accessFolderId の重要度確認**
本番環境は初回セットアップ済みのため、これらが空文字でも通常利用には影響なし。
ただし管理タブの「設定リセット」機能を使う場合は再セットアップウィザードが動く可能性あり。
→ 念のため追加を推奨。空文字でも許容できるならシークレット登録をスキップ可。

**Q3: Supabase test_analysis テーブルのカラム名確認**
GAS の `getLatestGradeAnalysisMeta` は `select: 'year,test_name'`、`order: 'generated_at.desc'` で取得。
Workers 側も同じクエリを使う予定。Supabase のテーブル構造に変更はないか？

---

# B-⑭ 書込3点セット移行プラン（updateStudentInfo / deleteStudent / restoreStudent）

## 移行概要

| 項目 | 内容 |
|------|------|
| 対象関数 | `updateStudentInfo` / `deleteStudent` / `restoreStudent` |
| 種別 | 書込（Supabase UPSERT） |
| LockService | **不使用**（直接・間接ともになし） |
| ScriptProperties | **不使用**（直接依存なし。Workers は env Secrets に既登録済み） |
| Firestore | **不使用**（Supabase `students` テーブルのみ） |
| 難易度 | 低 |
| 呼び出し元 | `js-grades.html`（成績管理タブ） |

---

## GAS版の仕様

### 1. `updateStudentInfo` — 生徒情報の更新

**引数**: `studentId, campusCode, sei, mei, seiFurigana, meiFurigana, schoolName`

**処理フロー** (`students.js` L512-537):
1. `studentId` を trim して `padStart(10, '0')` で正規化
2. `supabaseSelect_('students', 'id=eq.{sid}', { select: 'id' })` で存在確認
3. 存在しない → `{ success: false, error: '生徒が見つかりません' }`
4. `supabaseUpsert_('students', { id, campus, sei, mei, sei_furigana, mei_furigana, school_name })`
   - `campus` は `padStart(2, '0')` で2桁正規化
   - 各文字列フィールドは `.trim()` 処理
5. 成功 → `{ success: true, message: '生徒情報を更新しました' }`
6. 例外 → `{ success: false, error: error.toString() }`

### 2. `deleteStudent` — 生徒のソフトデリート

**引数**: `studentId`

**処理フロー** (`students.js` L545-561):
1. `studentId` を trim して `padStart(10, '0')` で正規化
2. 存在確認（同上）
3. 存在しない → `{ success: false, error: '生徒が見つかりません' }`
4. `supabaseUpsert_('students', { id: sid, is_deleted: true })`
5. 成功 → `{ success: true, message: '生徒を削除しました' }`
6. 例外 → `{ success: false, error: error.toString() }`

> **注意**: GAS 版では `deleted_at` 等のタイムスタンプフィールドは書き込んでいない（`is_deleted` フラグのみ）。Workers 版も同じ挙動を保つ。

### 3. `restoreStudent` — 削除済み生徒の復元

**引数**: `studentId`

**処理フロー** (`students.js` L626-642):
1. `studentId` を trim して `padStart(10, '0')` で正規化
2. 存在確認（同上）
3. 存在しない → `{ success: false, error: '生徒が見つかりません' }`
4. `supabaseUpsert_('students', { id: sid, is_deleted: false })`
5. 成功 → `{ success: true, message: '生徒情報を復元しました' }`
6. 例外 → `{ success: false, error: error.toString() }`

---

## Workers 実装方針

### 配置

`workers/src/functions/students.js`（既存）の末尾に3関数を追加。

### import の追加

```javascript
// 現在: import { supabaseSelect, supabaseRpc } from '../supabase.js';
// 変更: import { supabaseSelect, supabaseRpc, supabaseUpsert } from '../supabase.js';
```

### 共通パターン

各関数とも以下の順序:
1. 引数を `args` 配列から分解
2. `studentId` を `padStart(10, '0')` で正規化（B-⑩/⑪/⑬ と同一）
3. `supabaseSelect(env, 'students', 'id=eq.{sid}&select=id')` で存在確認
4. 存在しない → GAS 版と同じエラーメッセージ `'生徒が見つかりません'` を返す
5. `supabaseUpsert(env, 'students', {...}, 'id')` で更新（**`'id'` 明示必須**）
6. 成功メッセージは GAS 版と一字一句同一
7. try-catch で例外を `{ success: false, error: error.toString() }` に変換

### 個別注意

| 関数 | 個別処理 |
|------|---------|
| `updateStudentInfo` | `campus` を `padStart(2, '0')` で2桁化 |
| `deleteStudent` | `{ id, is_deleted: true }` のみ送る（他フィールド含めない） |
| `restoreStudent` | `{ id, is_deleted: false }` のみ送る（他フィールド含めない） |

### ルーター登録

`workers/src/router.js` に3関数を追加:
- `import { ..., updateStudentInfo, deleteStudent, restoreStudent } from './functions/students.js';`
- `HANDLERS` に3関数追加

---

## 書込系特有論点への対応

### 冪等性

3関数とも Supabase UPSERT（`ON CONFLICT (id) DO UPDATE`）を使うため、同じリクエストが2回届いても同じ結果になる:
- `updateStudentInfo`: 同じ値で上書き（変化なし）
- `deleteStudent`: `is_deleted=true` が再度 `true` にセット（変化なし）
- `restoreStudent`: `is_deleted=false` が再度 `false` にセット（変化なし）

### 切り戻し時のGAS/Workers混在リスク

`gas-bridge.html` の `WORKERS_FUNCTIONS` が関数名単位で振り分けるため、**1関数につき「全てWorkers」か「全てGAS」**のどちらか。ユーザー単位で混在することはない。

両経路とも同じ Supabase `students` テーブルに書き込むため、切り戻し前後のデータ整合性に影響なし。

### 部分書き込み失敗時のエラーハンドリング

各関数は「SELECT（存在確認）→ UPSERT（単一）」の2ステップのみ:
- 複数テーブルへの同時書き込みなし
- トランザクションなし（単一UPSERTのため不要）
- UPSERT 失敗時はエラーを即返却 → 中間状態が残る余地なし

---

## 実装上の最重要注意点

### GAS版とWorkers版の `supabaseUpsert` シグネチャ差異

**GAS版** (`supabase.js` L103-124):
```javascript
function supabaseUpsert_(table, data, onConflict) {
  var conflict = onConflict || 'id';  // ← デフォルトで 'id'
  var url = ... + '?on_conflict=' + conflict;
  headers['Prefer'] = 'resolution=merge-duplicates,return=representation';  // ← 常にセット
  ...
}
```

**Workers版** (`workers/src/supabase.js` L53-64):
```javascript
export async function supabaseUpsert(env, table, data, onConflict = null) {
  if (onConflict) headers['Prefer'] = '...';  // ← onConflict 未指定ならセットしない
  const url = ... + (onConflict ? '?on_conflict=...' : '');  // ← パラメータなし
  ...
}
```

**結論**: Workers版は `onConflict` 未指定だと **plain INSERT** になる。これを忘れると:
- 既存レコード更新時: 一意制約違反で HTTP 409 エラー
- データ不整合の可能性

### 必須の実装パターン

```javascript
await supabaseUpsert(env, 'students', {
  id: sid,
  is_deleted: true
}, 'id');  // ← 第4引数 'id' を絶対に忘れない
```

3関数すべてでこのパターンを適用する。

---

## 呼び出し元（フロントエンド）

| 関数 | 呼び出し元 | UI 経路 |
|------|----------|---------|
| `updateStudentInfo` | `js-grades.html:517` `fbUpdateStudentInfo` | 成績管理 → 生徒入力フォーム → 既存生徒選択 → 「更新」ボタン |
| `deleteStudent` | `js-grades.html:540` `fbDeleteStudent` | 成績管理 → 生徒入力フォーム → 「削除」ボタン |
| `restoreStudent` | `js-grades.html:902` `fbRestoreStudent` | 成績管理 → 削除済み生徒一覧（折りたたみ） → 「復元」ボタン |

3関数とも `gasApiPromise_` 経由（gas-bridge を通る）。

---

## 動作確認手順

推奨順序: `updateStudentInfo` → `deleteStudent` → `restoreStudent`

### 1. `updateStudentInfo`
1. 成績管理タブ → 生徒入力フォームを開く
2. 既存生徒を選択 → 校舎・名前・ふりがな・学校名のいずれかを編集
3. 「更新」ボタンをクリック
4. DevTools Network → `workers.dev` への POST が **200 OK**
5. トースト「生徒情報を更新しました」表示
6. 生徒を再選択 → 編集内容が保持されている
7. **異常系**: 存在しない ID を DevTools から送信 → `{ success: false, error: '生徒が見つかりません' }` が返る

### 2. `deleteStudent`
1. 成績管理タブ → 生徒入力フォーム → 対象生徒を選択
2. 「削除」ボタンをクリック → 確認ダイアログで OK
3. DevTools Network → `workers.dev` POST 200 OK
4. 通常生徒一覧から消える
5. 「削除済み生徒一覧」（`getDeletedStudents` 経由）に表示される
6. Supabase ダッシュボードで `students.is_deleted=true` になっていることを確認

### 3. `restoreStudent`
1. 成績管理タブ → 削除済み生徒一覧を開く
2. 対象生徒の「復元」ボタンをクリック → 確認ダイアログで OK
3. DevTools Network → `workers.dev` POST 200 OK
4. 通常生徒一覧に戻る
5. 削除済み生徒一覧から消える
6. Supabase ダッシュボードで `students.is_deleted=false` になっていることを確認

---

## 切り戻し手順

`gas-bridge.html` の `WORKERS_FUNCTIONS` Set から該当行を削除してプッシュ → 約2分で GAS にフォールバック。

```javascript
var WORKERS_FUNCTIONS = new Set([
  ...,
  'updateStudentInfo',   // ← 該当行を削除
  'deleteStudent',       // ← 該当行を削除
  'restoreStudent'       // ← 該当行を削除
]);
```

**1関数ずつ個別切り戻しも可能**: 問題が出た関数名のみを削除すれば、他の2関数は Workers で動き続ける。

---

## コミット構成

| コミット | 内容 | 状態 |
|---------|------|------|
| B-⑭a | `workers/src/functions/students.js` に3関数追加 + `supabaseUpsert` import 追加 + `router.js` 更新 | ✅ 完了（499b0d6） |
| B-⑭b（初回） | `gas-bridge.html` の `WORKERS_FUNCTIONS` に3関数追加 | ✅ 完了（76e9bfb）→ 不具合で即切り戻し |
| 切り戻し | `gas-bridge.html` から3関数を一時削除 | ✅ 完了（31266d7 + 785e469） |
| fix | UPSERT → PATCH 修正（Workers/GAS 両方）+ `supabaseUpdate_` 新規追加 | ✅ 完了（67ac633） |
| B-⑭b（再） | `gas-bridge.html` の `WORKERS_FUNCTIONS` に3関数を再追加 | ✅ 完了（584586d） |

---

## 不具合発覚と修正（B-⑭ 実施中）

### 発覚した不具合

B-⑭b（初回）デプロイ直後、`updateStudentInfo` で以下のエラーが発生：

```
Supabase UPSERT エラー(400): {
  "code": "23502",
  "details": "Failing row contains (0420261501, null, 04, null, null, ***, ***, ...)",
  "message": "null value in column \"student_id\" of relation \"students\" violates not-null constraint"
}
```

### 原因

**PostgreSQL の NOT NULL 制約チェックは、ON CONFLICT より先に発火する。**

PostgREST の UPSERT（`INSERT ... ON CONFLICT (id) DO UPDATE`）では、
まず INSERT 用のタプルが構築される。このとき `student_id` が payload に含まれておらず NULL 扱いになる。
PostgreSQL は ON CONFLICT 分岐へ移る前に NOT NULL チェックを実施するため、
既存行（`id = '0420261501'` の行は実際に存在する）であっても エラーが発生する。

`students` テーブルの `student_id` カラムは `is_nullable = NO`（NOT NULL 制約あり）。
このカラムは `id`（PK）と同値が前提だが、更新系では省略されていた。

### 事前調査と確認

- Supabase で `SELECT COUNT(*) FROM students WHERE student_id IS NULL` → **0件**
  - データ異常ではなく、PostgREST の挙動が原因と確定
- `toStudentCamel_`（students.js:21）に `row.student_id || row.id` のフォールバックが存在
  - 実装当初から `student_id = null` ケースを想定していた可能性あり

### 修正方針: UPSERT → PATCH

| 観点 | 理由 |
|------|------|
| 意味的に正しい | `updateStudentInfo` は純粋な「更新」操作。INSERT は不要 |
| NOT NULL 安全 | PATCH（HTTP PATCH）は指定カラムのみ更新し、他の既存値を保持する |
| 存在確認済み | `supabaseSelect_` で行の存在を確認済みのため UPSERT の INSERT 路は不要 |

### 修正内容（コミット 67ac633）

1. **`supabase.js`（GAS）に `supabaseUpdate_` を新規追加**
   - `method: 'patch'`、`Prefer: return=representation`
   - 未指定カラムの既存値を保持

2. **`students.js`（GAS）3関数を修正**
   - `updateStudentInfo`、`deleteStudent`、`restoreStudent`
   - `supabaseUpsert_({id, ...})` → `supabaseUpdate_({...}, 'id=eq.{sid}')`
   - payload から `id` を除去（WHERE フィルタに移動）

3. **`workers/src/functions/students.js`（Workers）3関数を修正**
   - import を `supabaseUpsert` → `supabaseUpdate` に変更
   - 同様に PATCH 方式へ変更

### 潜在バグ: saveExamResult（未対応）

`students.js:1876` の `saveExamResult` も同じパターン（`supabaseUpsert_` で `student_id` を省略）。
未移行関数だが同じ NOT NULL 違反が発生しうる。
**B-⑮ 以降で Workers 移行時に合わせて修正予定。**

---

## 動作確認結果

### GAS 経由（切り戻し中）— コミット 67ac633 後

| 操作 | 結果 |
|------|------|
| `updateStudentInfo` | ✅ 成功トースト表示・Supabase 実データ更新確認 |
| `deleteStudent` | ✅ 成功 |
| `restoreStudent` | ✅ 成功 |

### Workers 経由（584586d で再切り替え後）

| 操作 | 結果 |
|------|------|
| `updateStudentInfo` | ✅ `workers.dev` への POST 200 OK・`success:true`・Supabase 実データ更新確認 |
| `deleteStudent` | 未確認（実装は `updateStudentInfo` と同型。後日自然に検証される想定） |
| `restoreStudent` | 未確認（同上） |

### 動作確認中に発見した一時的現象

`updateStudentInfo` 直後に campus 欄が「00」と表示される現象を1回確認。
再確認では正常値に戻っており、通信タイミングの問題と推測。
Supabase のデータは常に正常。

### 既知バグ: UI 即時反映問題（別タスク）

更新操作後、画面上の表示が変更前のまま残る（ハードリロードで解消）。
**GAS 経由でも同症状が発生** → Workers 移行以前からの既存バグ。
キャッシュクリアまたはフロントの状態更新処理の問題と推測。
B-⑭ の範囲外として、**Phase 5-B 完了後に別タスクとして対応予定**。

---

# B-⑮ submitGradeData 移行（2026-04-20 完了）

## 対象・方針

| 項目 | 内容 |
|------|------|
| 対象関数 | `submitGradeData`（成績入力の保存処理） |
| 対象テーブル | Supabase `grades` |
| 実装方式 | **UPSERT 維持**（B-⑭ の PATCH 切替とは異なる） |
| フロント変更 | なし（`gas-bridge.html` の `WORKERS_FUNCTIONS` 追加のみ） |

## 判断根拠：なぜ UPSERT で良かったか

B-⑭ で発覚した NOT NULL 違反（PostgreSQL は ON CONFLICT 判定より前に NOT NULL チェックを行う）の再発リスクは、B-⑮ では存在しない。理由：

| 項目 | B-⑭（students） | B-⑮（grades） |
|------|----------------|---------------|
| payload 構成 | 一部カラムのみ（更新対象だけ） | 全カラム指定（初回保存と再保存で同一構造） |
| NOT NULL カラム充足 | ❌ 欠落あり（`student_id` 等） | ✅ 全て送信 |
| INSERT 路 | 通らない想定（既存行前提） | 初回保存で通る必要あり |
| UPDATE 路 | 常にこちら | 再保存で通る必要あり |
| 結論 | **PATCH へ切替** | **UPSERT 維持で安全** |

→ **判断基準**: 「payload に NOT NULL カラムが全て含まれているか」を確認する。B-⑯ 以降もこの基準で UPSERT／PATCH を選択する。

## 省略した GAS 側内部処理

Workers 版では以下を省略してもロジック同等になることを確認：

| GAS 処理 | Workers 側の対応 |
|---------|---------------|
| `getStudentNameById(sid)` | `scores.studentName` から取得（フロントが必ず注入している） |
| `getMasterData(year)` → campus 引き当て | `sid.substring(0, 2)` で取得（studentId フォーマットが `{campus2}{year4}{grade2}{seq2}` のため決定論的） |
| `skipCacheUpdate` フラグ | 削除（Workers にリクエスト間共有のインメモリキャッシュが無い） |

→ 1件の UPSERT だけでリクエスト完結。不要な読取クエリがない分、GAS 版より高速。

## コミット

| コミット | 内容 |
|---------|------|
| 414fd19 | Workers 側実装（`workers/src/functions/students.js` に `submitGradeData` 追加＋`router.js` 登録） |
| c2424bc | `gas-bridge.html` の `WORKERS_FUNCTIONS` に `'submitGradeData'` 追加（切替） |

## 動作確認結果

4 ケース × 2 段階（GAS 経由 → Workers 経由）で全て成功：

| ケース | 内容 | GAS 経由 | Workers 経由 |
|--------|------|---------|--------------|
| ① INSERT | 新規テスト名で初回保存 | ✅ | ✅ |
| ② UPDATE | 既存レコードの点数を書き換え | ✅ | ✅ |
| ③ 別テスト名 | 同一生徒×別テストで追加行 | ✅ | ✅ |
| ④ 空欄0点 | 全科目未入力（合計 0） | ✅ | ✅ |

## 現時点の Workers 経由関数数：17 個

| 種別 | 関数 |
|------|------|
| ヘルスチェック | `ping` |
| 読取（12 個） | `getAdminEmails`, `getUserProfile`, `getAppStartupData`, `getMasterData`, `getGradesYearFolders`, `getSchoolAverages`, `getGradeAnalysis`, `getStudentAnalysis`, `getGradeDataByStudentAndTest`, `getDeletedStudents`, `getStudentsWithGradesByTest`, `getStudentListWithGrades` |
| 書込（4 個） | `updateStudentInfo`, `deleteStudent`, `restoreStudent`, **`submitGradeData`** |

## B-⑯ 以降への引き継ぎメモ

- `saveExamResult`: 受験結果を `students` テーブルに部分 UPSERT する関数。B-⑭ と同じ NOT NULL 違反リスクあり → **PATCH 方式で実装**する必要あり。合わせて LockService 依存の除去も必要。
- 書込関数を追加する前に必ず対象テーブルの NOT NULL カラム一覧を確認し、payload が全てを満たすかで UPSERT／PATCH を選ぶ。

---

# B-⑯ saveExamResult 移行（2026-04-20 完了）

## 対象・方針

| 項目 | 内容 |
|------|------|
| 対象関数 | `saveExamResult`（中3 受験結果保存・UI ボタン / `@aiCallable`） |
| 対象テーブル | Supabase `students` |
| 実装方式 | **UPSERT → PATCH 切替**（B-⑭ と同型） |
| フロント変更 | なし（`gas-bridge.html` の `WORKERS_FUNCTIONS` 追加のみ） |

## 判断根拠

| 項目 | 内容 |
|------|------|
| `students` テーブルの NOT NULL | `student_id` / `sei` / `mei` / `campus` 等が NOT NULL（B-⑭ で確認済み） |
| payload 構成 | 7 カラムのみ（`jukoukou1` 系 3 + `ikusei` + `jukoukou2` 系 3） |
| UPSERT 時のリスク | INSERT 路で NOT NULL 違反（B-⑭ と同一メカニズム） |
| 結論 | **PATCH 方式を採用** |

## 事前 SELECT の扱い

Workers 側・GAS 側とも **維持**。PostgREST の PATCH は WHERE 句に一致する行がなくても 204 で成功を返すため、存在しない id に対するサイレント成功を防ぐ目的で事前チェックを行う。

## LockService の扱い

Workers 側・GAS 側ともに **削除**。理由：

- 同一生徒の受験結果を複数ユーザーが同時保存するシナリオは現実的にゼロ
- payload は last-write-wins で安全（7 カラム全体を一括上書き）
- Workers には LockService 相当が無く、追加実装の価値がない

## GAS 側関数は PATCH 化して維持（Option C 採用）

gas-bridge.html の `WORKERS_FUNCTIONS` から `'saveExamResult'` を 1 行削除するだけで即 GAS 経路に戻せるよう、GAS 側の関数も PATCH 化して残した。B-⑭ の `updateStudentInfo` / `deleteStudent` / `restoreStudent` と同じフォールバック構造。

## コミット

| コミット | 内容 |
|---------|------|
| 0b23e95 | Workers 側実装（`workers/src/functions/students.js` + `router.js` 登録） |
| d748813 | `gas-bridge.html` の `WORKERS_FUNCTIONS` に `'saveExamResult'` 追加（切替） |
| 2f03594 | GAS 側 `saveExamResult` を PATCH 化（`supabaseUpdate_` + 事前 SELECT 維持 + LockService 削除） |

## 動作確認結果

Workers 経由で正常保存を確認。

## 事件記録：Step A で NOT NULL 違反を発見

B-⑯ 着手前は「潜在バグ」として認識されていたが、実装中の Step A（gas-bridge OFF = GAS 経由）動作確認で実際にエラーが顕在化した。
これは B-⑯ 実装前から潜在していた既存バグで、今回の PATCH 化で解決。

### 履歴調査結果

| コミット | 日付 | 事象 |
|---------|------|------|
| `836874a` | 2026-04-01 | saveExamResult に LockService 追加（Firestore 時代） |
| **`7998955`** | **2026-04-07** | **バグ混入**。Supabase 移行で `firestoreGet_` → 全フィールド書き戻し RMW が `supabaseUpsert_` 部分 payload に単純置換された |
| `67ac633` | 2026-04-20 | B-⑭ 修正。このとき saveExamResult も「潜在バグ」として migration-plan に明記されていたが、意図的に先送り（B-⑮以降で対応の方針） |
| `2f03594` | 2026-04-20 | **解決（B-⑯）** |

**潜伏期間**: 約 13 日（04-07 → 04-20）。中3 の受験結果入力は年数回〜数十回と低頻度のため、この期間内に本機能が使用されなかった可能性が高い。

**B-⑭ 時に気付けた機会**:
1. B-⑭ 修正ドキュメントの「潜在バグ」節に `saveExamResult` が明記されていた
2. `students.js` 内の `supabaseUpsert_('students', ...)` が 5 箇所あり、4 箇所が部分 payload の更新用途（B-⑭ で修正された L521/L553/L634 と同型の L1876）
3. 「NOT NULL カラム全充足かで UPSERT/PATCH を選ぶ」という B-⑭ の判断基準を全 UPSERT 呼び出しに横展開すれば自動的に発見できた

### 類似バグが他にないかの横断調査

`grep supabaseUpsert_\\(` の全数調査結果：

| 場所 | 判定 |
|------|------|
| `students.js:474` submitStudentInfo | ✅ 全カラム指定・INSERT 路想定 |
| `students.js:1160` submitGradeData | ✅ 全カラム指定（B-⑮ で Workers 側移行済み） |
| `students.js:1503` school_averages | ✅ 全カラム指定想定（要確認） |
| `analysis.js:663` test_analysis | ✅ 生成時全書き換え想定 |
| `auth.js:356` / `auth.js:787` / `code.js:259` staffs 新規作成 | ✅ 全カラム指定・INSERT 用途 |
| **`settings.js:647` saveLecGrades** | **⚠️ 潜在バグ**。staffs に `{id, lec_grades}` のみの部分 UPSERT。既存行更新時に email/display_name の NOT NULL 違反リスク。**実運用で発火しうる最右翼候補**（設定タブの講習担当学年保存時） |
| **`settings.js:202` writeStaffToSupabase_**（15 箇所から呼び出し） | **⚠️ 条件付き潜在バグ**。`staffToSupabase_` が `!== undefined` でフィールド抽出するため、呼び出し側が partial staff を渡すと同型バグ発生 |
| `features.js:1716` / `:2051` / `:2194` / `:2266` ai_feedback / ai_learned_knowledge | ❓ 要確認（テーブル NOT NULL 制約次第） |
| `minutes.js:70` meeting_minutes | ❓ 要確認 |
| `migrate-lec-grades.js:61` staffs（一回限り） | ⚠️ 同型だが実行済みで再発火なし |

**後続タスクの優先候補**: `settings.js:647 saveLecGrades` の PATCH 化。講師が設定タブで講習担当学年を保存するたびに発火する可能性があるため、B-⑰ で修正を検討。

## 現時点の Workers 経由関数数：18 個

| 種別 | 関数 |
|------|------|
| ヘルスチェック | `ping` |
| 読取（12 個） | `getAdminEmails`, `getUserProfile`, `getAppStartupData`, `getMasterData`, `getGradesYearFolders`, `getSchoolAverages`, `getGradeAnalysis`, `getStudentAnalysis`, `getGradeDataByStudentAndTest`, `getDeletedStudents`, `getStudentsWithGradesByTest`, `getStudentListWithGrades` |
| 書込（5 個） | `updateStudentInfo`, `deleteStudent`, `restoreStudent`, `submitGradeData`, **`saveExamResult`** |

## 横断的な観測事実（別件・別タスクで扱う）

Step B（Workers 経由）動作確認中に以下の間欠的現象が発生：

- 保存成功直後、同条件で再保存するとエラー
- エラー内容は Step A で見た NOT NULL 違反（GAS 側 UPSERT 由来）
- ハードリロードで解消

これは `saveExamResult` 固有の問題ではなく、**gas-bridge.html の切替機構または Firebase Hosting のキャッシュ**に起因する横断的現象と推測。B-⑯ 完了扱いとし、別タスクで扱う。

---

# B-⑰ saveLecGrades 移行（2026-04-20 完了）

## 対象・方針

| 項目 | 内容 |
|------|------|
| 対象関数 | `saveLecGrades`（設定タブ → 講習担当学年チェックボックス保存） |
| 対象テーブル | Supabase `staffs` |
| 実装方式 | **UPSERT → PATCH 切替**（B-⑭/⑯ と同型） |
| フロント変更 | なし（`gas-bridge.html` の `WORKERS_FUNCTIONS` 追加のみ） |
| 呼び出し頻度 | **高頻度**（チェックボックス変更ごとに発火） |

## 判断根拠

| 項目 | 内容 |
|------|------|
| payload 構成 | `{id, lec_grades}` の 2 フィールドのみ（部分 payload） |
| 実運用での発火 | **Step A（GAS 経由）でも保存は成功**。`staffs` テーブルの NOT NULL 制約が `students` より緩く、部分 payload UPSERT でも通ってしまっていた |
| 予防的改修の理由 | 将来 NOT NULL 制約が追加される可能性への備え・ポリシー統一（B-⑭/⑯ と同じ PATCH 方式で全書込関数を揃える） |
| 結論 | **PATCH 方式を採用**（予防的） |

## 事前 SELECT の扱い

| 実装 | 方式 |
|------|------|
| Workers 側 | `find_staff_by_auth` RPC の結果が空配列のときにエラー返却（RPC が存在確認を兼ねる。B-⑥/⑦ と同パターン） |
| GAS 側 | 明示的に `supabaseSelect_('staffs', 'id=eq.{staffId}')` で存在確認 |

## 横断調査で判明した事実（B-⑰ の契機）

B-⑯ 完了時、`grep supabaseUpsert_\(` で全箇所を横断調査し、`writeStaffToSupabase_`（14 箇所）と `saveLecGrades`（1 箇所）が候補として浮上。詳細調査の結果：

| 分類 | 件数 | 詳細 |
|------|------|------|
| 同型バグ確定 | **0** 件 | — |
| 条件付きリスク（将来的な予防対象） | **14** 件 | `writeStaffToSupabase_` の呼び出し全 14 箇所。いずれも `staffFromSupabase_` 由来の完全な staff を渡しているため現状安全。将来 partial staff を直接渡すコードが書かれた瞬間に破綻 |
| 安全な実装済み書込 | — | `submitStudentInfo` (L474), `submitGradeData` (L1160, B-⑮ 済), `school_averages` (L1503), `test_analysis` (L663), staffs 新規作成 3 箇所 |
| B-⑰ 対象 | **1** 件 | `saveLecGrades`（部分 payload 直接 UPSERT） |

## 予防策（コミット 4 で実施）

`staffToSupabase_` の JSDoc に警告コメントを追加：

- 呼び出し側は **必ず `staffFromSupabase_` 由来の完全な staff** を渡すよう明記
- 過去のバグ事例（B-⑭/B-⑯/B-⑰）を列挙
- 部分更新が必要な場合は `supabaseUpdate_` を直接使うよう誘導

`writeStaffToSupabase_` の 14 箇所は現状安全のため変更せず、将来のリファクタ機会（Phase 5-C 以降の Workers 個別移行時）で再精査する方針。

## コミット

| コミット | 内容 |
|---------|------|
| `45e7e63` | Workers 側実装（`workers/src/functions/settings.js` + `router.js` 登録） |
| `7e51d84` | `gas-bridge.html` の `WORKERS_FUNCTIONS` に `'saveLecGrades'` 追加（切替） |
| `ee5c048` | GAS 側 `saveLecGrades` を PATCH 化（`supabaseUpdate_` + 事前 SELECT 維持） |
| `32b9fee` | `staffToSupabase_` に partial payload 警告 JSDoc を追加 |

## 動作確認結果

| ステップ | 経路 | 結果 |
|---------|------|------|
| Step A | GAS 経由 | **想定外に成功**（`staffs` の NOT NULL 制約が `students` より緩いため。他カラム破損もなし） |
| Step B | Workers 経由 | **全項目 OK**（チェックボックス単発・連続操作・空配列・状態保持すべて正常） |

## 観測された既存横断バグ（B-⑰ 派生ではない）

Step B 動作確認中、以下の挙動を確認：

- 読み込み中に操作した場合の race condition
- 画面表示と DB の不整合、読み込み失敗時のエラー

これは `saveLecGrades` 固有ではなく、`updateStudentInfo` 等でも発生する横断的な既存問題。**Phase 5 完全移行後に横断的に対応予定**。

## 現時点の Workers 経由関数数：19 個

| 種別 | 関数 |
|------|------|
| ヘルスチェック | `ping` |
| 読取（12 個） | `getAdminEmails`, `getUserProfile`, `getAppStartupData`, `getMasterData`, `getGradesYearFolders`, `getSchoolAverages`, `getGradeAnalysis`, `getStudentAnalysis`, `getGradeDataByStudentAndTest`, `getDeletedStudents`, `getStudentsWithGradesByTest`, `getStudentListWithGrades` |
| 書込（6 個） | `updateStudentInfo`, `deleteStudent`, `restoreStudent`, `submitGradeData`, `saveExamResult`, **`saveLecGrades`** |

## B-⑱ 以降への引き継ぎメモ

- 書込関数を追加する前に `grep supabaseUpsert_\\(` で全数調査を習慣化する
- 「NOT NULL カラム全充足か」で UPSERT / PATCH を選ぶ判断基準を維持
- `writeStaffToSupabase_` の 14 箇所はガードレール不足だが現状安全。Workers 個別移行時に PATCH 化を再検討

---

# B-⑱ AI 管理系 UPSERT の PATCH 化（2026-04-20 完了）

## 対象・方針

| 項目 | 内容 |
|------|------|
| 対象関数 | `editAutoLearnedKnowledge`, `resolveAiFeedback`（Admin 機能・`js-admin-chatbot.html` から呼び出し） |
| 対象テーブル | `ai_learned_knowledge`, `ai_feedback` |
| 実装方式 | **UPSERT → PATCH 切替**（予防的改修・B-⑭/⑯/⑰ と同型） |
| Workers 移行 | **スコープ外**（Admin 機能・低頻度・成績業務に関与しないため） |
| フロント変更 | なし |

## 判断根拠

| 項目 | 内容 |
|------|------|
| payload 構成 | `editAutoLearnedKnowledge`: 4 フィールド（部分）<br>`resolveAiFeedback`: 3 フィールド（部分） |
| UPSERT 意図 | 両関数とも **UPDATE 路のみ**（事前 SELECT でガード） |
| 潜在リスク | `ai_learned_knowledge.source` / `learned_at` や `ai_feedback.type` / `summary` / `created_at` が NOT NULL なら B-⑭ 同型バグ発生 |
| 実害 | 未観測（SQL 未確認・両機能とも低頻度のため発火事例なし） |
| 対応方針 | **予防的改修**（B-⑰ と同じポリシー：NOT NULL がゆるくても PATCH 化で統一） |

## 横断調査で判明した事実（B-⑱ の契機）

`features.js` / `minutes.js` の UPSERT 5 箇所を精査：

| # | 場所 | 関数 | テーブル | 意図 | 判定 |
|---|------|------|----------|------|------|
| 1 | `features.js:1716` | `requestAIAssistant`（feedback 保存） | `ai_feedback` | INSERT のみ | ✅ 安全 |
| 2 | `features.js:2051` | `saveAutoLearnedKnowledge_` | `ai_learned_knowledge` | INSERT のみ | ✅ 安全 |
| 3 | `features.js:2194` | `editAutoLearnedKnowledge` | `ai_learned_knowledge` | UPDATE のみ | ⚠️ 条件付きリスク → **B-⑱ 対応** |
| 4 | `features.js:2266` | `resolveAiFeedback` | `ai_feedback` | UPDATE のみ | ⚠️ 条件付きリスク → **B-⑱ 対応** |
| 5 | `minutes.js:70` | `saveMinutes` | `meeting_minutes` | INSERT/UPDATE 両対応 | ✅ 安全（全 8 カラム指定） |

### 集計

| 分類 | 件数 |
|------|------|
| 同型バグ確定 | **0** 件 |
| 条件付きリスク（本件対応） | **2** 件 |
| 安全 | **3** 件 |

### 安全と判定された 3 件の詳細

- **`requestAIAssistant` の feedback 保存** (L1716): docId が毎回 `fb_${Date.now()}` で新規。INSERT 路専用で payload 全 6 フィールド指定
- **`saveAutoLearnedKnowledge_`** (L2051): docId が毎回 `lk_${Date.now()}` で新規。INSERT 路専用で payload 全 6 フィールド指定
- **`saveMinutes`** (minutes.js:70): `data.id` 有無で INSERT / UPDATE 分岐するが、両路とも payload 全 8 カラム（`id`, `fiscal_year`, `month`, `title`, `summary`, `created_by`, `created_at`, `updated_at`）を指定。更新時も `created_at \|\| now` fallback で NOT NULL 違反を回避

## コミット

| コミット | 内容 |
|---------|------|
| `7149a89` | `editAutoLearnedKnowledge` を PATCH 化（`ai_learned_knowledge`） |
| `6ee9499` | `resolveAiFeedback` を PATCH 化（`ai_feedback`） |
| （本コミット） | `docs/migration-plan.md` B-⑱ セクション追記 |

## 動作確認

**不要**（予防的改修・Admin 機能・低頻度）。次回 Admin が以下を操作した際に動作確認される：
- チャットボット管理タブで自動学習エントリを編集
- AI フィードバック管理画面で「解決済み」ボタン

## Phase 5 書込系の現状

| 項目 | 状態 |
|------|------|
| Workers 経由関数数 | **19 個**（変更なし） |
| Workers 経由の書込（6 関数） | 全て PATCH + 事前 SELECT |
| GAS 内部完結の書込（本件 2 関数） | 全て PATCH + 事前 SELECT |
| **書込系のポリシー統一** | **✅ 完全達成** |
| UPSERT 系の潜在バグ精査 | **✅ 全件完了** |

## Phase 5 の次フェーズへの引き継ぎ

- **UPSERT 系の技術的負債は完全解消**
- 既存横断バグ（gas-bridge キャッシュ問題 / 読み込み中の race condition）は Phase 5 完全移行後に横断的に対応
- **Phase 5-E（ScriptProperties 移行）へ進める状態**
- `writeStaffToSupabase_` の 14 箇所はガードレール不足だが現状安全。Workers 個別移行時に PATCH 化を再検討

---

# 次セッション引き継ぎ：Phase 5-B 残関数棚卸し

## 次フェーズ

**Phase 5-B 残関数棚卸し** — 未移行の GAS 公開関数を全量把握し、Phase 5-E（ScriptProperties 移行）の設計材料を揃える。

## 成果物

- **新規作成**: `docs/remaining-functions-inventory.md`
- **書式**: 本ファイル（`docs/migration-plan.md`）と同じ体裁で作成
- **列構成**: 関数名 / 種別 / 対象テーブル・データ / 呼出元 / ScriptProperties 依存 / 分類（A/B/C/D） / 優先度 / 備考
- **サマリ**: 総数・A/B/C/D 内訳・ScriptProperties キー一覧（重複排除）・削除候補

## 分類ルール（合意済み）

| 分類 | 定義 |
|------|------|
| **A** | Workers 移行可能（ScriptProperties 依存なし・GAS 専用 API なし・Supabase/Firestore のみ） |
| **B** | Phase 5-E 後に移行可能（ScriptProperties 依存あり → KV or Supabase 移行後に解除） |
| **C** | GAS 残し（GmailApp / ScriptApp / DriveApp / HtmlService / 長時間バッチ等の GAS 専用機能） |
| **D** | 削除候補（migrate 系一回限りスクリプト / 呼出元なし死コード / テスト用） |

## 作業順序（合意済み）

**B → D の順で進める。C は Phase 5 完全移行後に判断。**

| ステップ | 対象 | 目的 |
|---------|------|------|
| 1 | **分類 B の洗い出し** | Phase 5-E（ScriptProperties 移行）の対象 key を全量把握 |
| 2 | **分類 D の削除** | 棚卸し時点で削除可能な死コード・旧 migrate を整理 |
| 3 | （Phase 5-E 終了後） | 分類 C の個別判断（GAS 残し確定 or Workers 代替設計） |

### A 分類の扱い

分類 A（Workers 即移行可能）は棚卸し文書で把握のみ行い、個別の B-⑲ 以降として従来通り進める（B-⑮〜⑰ と同パターン）。

## 調査済み事実（次セッションで再利用）

前セッションで以下を確認済み（`Explore` Agent 実行結果より）：

- GAS 公開関数（`_` サフィックスなし）の全量を収集済み
- Workers 移行済み 19 関数の除外済み
- 各関数の ScriptProperties 依存・呼出元（google.script.run / gasApiPromise_）を特定済み
- 概算: A 約 40 / B 約 70 / C 約 30 / D 約 25 関数（合計 ≈ 165 関数）

## 次セッションでの着手方法

```
指示例: 「docs/remaining-functions-inventory.md を作成して」
```

前セッションの調査データから文書生成のみ実施する（追加調査は不要）。


---

# Phase 6-B-09 ロールバック記録（2026-04-24）

## 決定

**LINE 通知スケジュール配信の Workers 移行（Phase 6-B-09）を中止し、GAS 運用を継続する。**

## 背景

- Cloudflare Workers 側の Cron Trigger 実装は完了（Step 2〜4）済み
- Step 5 で GAS の 5 関数（`sendScheduledLineMessageNow` / `checkAndSendDueLineMessages` / `setupScheduledLineTrigger` / `deleteScheduledLineTrigger` / `getScheduledLineTriggerStatus`）を削除
- Step 6 でフロント UI の「▶ 開始する / ■ 停止する」ボタンを非表示化し、案内 div に置換
- Step 7 への移行手順中、Cloudflare Dashboard の **Invocations ビューに Cron Trigger の起動履歴が表示されず**、Cron が実際に発火しているか確認できない問題が発生
- 本番環境で配信停止が続くリスクを回避するため、GAS 運用への緊急ロールバックを決定

## 実施内容

| 操作 | コミット | 内容 |
|------|----------|------|
| Step 5 revert | `622721a`（merge 後 `3c730c7`） | GAS の 5 関数を `line.js` に復元（+219 行） |
| Step 6 revert（部分） | 本セッション | UI「開始/停止」ボタン・`TRIGGER_DEFS_` の `lineScheduler` エントリ・JS 3 関数を復活。ただし `gas-bridge.html` の `WORKERS_FUNCTIONS` からは 3 トリガー関数を除外した状態を維持（ボタンが GAS 関数を直接呼ぶようにするため） |

## Workers 側の扱い

- `workers/src/cron.js` / `workers/src/functions/line.js` の実装は **温存**
- Kill switch `prop:WORKERS_LINE_CRON_ENABLED` は **未設定のまま**（= Cron が発火しても早期 return で no-op）
- `wrangler.toml` の `[triggers] crons = ["0 * * * *"]` も維持（課金影響なし／将来再移行時に即使える状態）
- `sendScheduledLineMessageNow` のみ Workers 実装が実稼働（gas-bridge の `WORKERS_FUNCTIONS` に残置、「今すぐ送信」ボタンから呼ばれる）。Firestore `lineSchedules` コレクションは GAS・Workers 両方から同じデータを読み書きするため整合性に問題なし

## 配信経路（ロールバック後の最終状態）

| 機能 | 実行エンジン |
|------|--------------|
| 毎時自動配信（`checkAndSendDueLineMessages`） | GAS（時間トリガー） |
| トリガー開始・停止・状態確認 | GAS（フロント UI → gas-bridge → GAS） |
| 今すぐ手動送信（`sendScheduledLineMessageNow`） | Workers（gas-bridge の WORKERS_FUNCTIONS 経由） |
| Workers Cron | **kill switch OFF で no-op**（実質停止中・温存のみ） |

## 今後の方針

本トリガーは **GAS に残す**（再移行は行わない）。詳細は後述の「トリガー関数の扱い方針」セクション参照。

Workers 実装コード・`wrangler.toml` の `[triggers]` 設定は当面温存するが、将来的な撤去も視野に入れる。

## 関連情報

- ロールバック実施時点の GAS デプロイカウンター: **43**
- ロールバック実施日: **2026-04-24**
- 関連コミット: `622721a`（Step 5 revert）/ `a98781d`（Step 6 revert）

---

# トリガー関数の扱い方針（2026-04-24 決定）

## 方針

**GAS の時間主導トリガーは Workers に移行せず、すべて GAS に残す。**

## 対象トリガー（全 3 件）

| # | トリガー | 関数名 | 頻度 | 方針 |
|---|---------|-------|------|------|
| 1 | daily（毎日メンテナンス） | `scheduledInitializeSheets` | 毎日 | **GAS 継続**（移行検討せず） |
| 2 | lineScheduler（LINE自動送信） | `checkAndSendDueLineMessages` | 毎時 | **GAS 継続**（Phase 6-B-09 ロールバックで確定） |
| 3 | formEmail（フォームメール転送） | `checkAndForwardFormEmails` | 5分 | **GAS 継続**（移行検討せず） |

> 注: `admin.js:1040` の `runFirestoreBackup` は関数本体が存在しない参照切れ（稼働していない）。

## 判断理由

1. **運用安定性優先** — GAS のトリガー機構は長期実運用の実績があり挙動が安定している
2. **Workers Cron の可観測性の課題** — Cloudflare Dashboard の Invocation 表示等、実稼働状況の把握が GAS に比べて難しい（Phase 6-B-09 で顕在化）
3. **GAS 実行時間枠の余裕** — 各トリガーは GAS 実行時間の 6 分制限に十分収まっており、Workers 化の緊急性が低い
4. **分散化の弊害** — トリガーを GAS / Workers 両方に分散させるとデバッグ・運用手順が複雑化する

## Workers 側コードの扱い

- `workers/src/cron.js` / `workers/src/functions/line.js` の Cron 関連実装は **当面温存**（kill switch OFF で no-op）
- `wrangler.toml` の `[triggers] crons = ["0 * * * *"]` も維持（課金影響なし）
- 将来的に Workers 化を再検討しないと判断した段階で、これらのコード・設定を撤去する（そのとき別フェーズとして整理）

## 再検討の条件（例）

以下のいずれかに該当する場合のみ、再移行を検討する:

- GAS トリガー実行枠で処理しきれない量の配信が必要になった場合
- GAS プロジェクト履歴の逼迫で Workers へ退避せざるを得なくなった場合
- Cloudflare Cron の可観測性・安定性が Phase 6-B-09 時点から大きく改善された場合

上記に該当しない限り、**GAS 運用を継続する**。

---

# Phase 6-C-01 完了記録（2026-04-26）

## 概要

**B 分類 Admin 系の `removeUserAccess` を Workers 化。**

`docs/remaining-functions-inventory.md` の B 分類 68 関数のうち、フロントから呼ばれているが Workers 未登録だった 4 件（`addAdminEmail` / `removeAdminEmail` / `removeUserAccess` / `initializeFirstAdmin`）の調査結果を踏まえ、実装意義のある `removeUserAccess` 1 件のみを移行した。

## 移行した関数

| 関数 | GAS 場所 | 役割 |
|------|---------|------|
| `removeUserAccess` | `auth.js:405-489` | Admin が指定メールアドレスのユーザーアクセスを完全に削除する |

### Workers 側の処理内容（GAS 版と完全等価）

1. Supabase `staffs` レコード削除（teacherId 経由）
2. Firestore `config/notification_routing` から teacherId を全 campus から除外
3. Firestore `allowedUsers/{email}` を全関連メール分削除
4. KV `prop:ADMIN_EMAILS` から全関連メールを除外（RMW）
5. Firestore `operationLogs` に監査ログ書込

## 変更ファイル（3 ファイル・1 コミット）

| ファイル | 変更内容 |
|---------|---------|
| `workers/src/functions/auth-emails.js` | import に `supabaseDelete` / `firestoreGet` 追加。末尾に private helper 4 種（`getCampusRoutingMap_` / `setCampusRoutingMap_` / `makeSafeId_` / `logAdminActionToFirestore_`）と `removeUserAccess` 本体を追加。+156 行 |
| `workers/src/router.js` | import + HANDLERS マップに `removeUserAccess` を登録 |
| `gas-bridge.html` | `WORKERS_FUNCTIONS` Set に `'removeUserAccess'` を追加（`getAllowedUsers` の直後） |

## ヘルパーの再利用方針

`removeUserAccess` が必要とする 3 つの private helper（`getCampusRoutingMap_` / `setCampusRoutingMap_` / `logAdminActionToFirestore_`）は `workers/src/functions/line.js` に同名で実装済みだが export されていなかった。

採用案: **`auth-emails.js` 内に private 再実装**（line.js からの import 依存を避ける）。
- Phase 6-A/6-B での通例パターン（`line.js` / `notifications.js` / `schedule-overrides.js` が同型ヘルパーをコメント上「同一」明記で再実装）を踏襲
- 公開 API の境界を変えずスコープを最小化

## GAS 版との差分

**なし（完全等価）**:
- 戻り値形状・エラーメッセージ・try-catch 握り潰し粒度・ログ文言まで一致
- 自分自身の削除は拒否（`'自分自身のアクセスは削除できません'`）
- staffs 検索失敗・削除失敗・通知振り分け削除失敗・allowedUsers 削除失敗はいずれも握り潰しで処理続行

GAS 版（`auth.js:405-489`）はフォールバック保険として残置（`gas-bridge.html` の `WORKERS_FUNCTIONS` から `'removeUserAccess'` を 1 行除外して Hosting 再デプロイすれば即座に GAS 経路へロールバック可能）。

## 動作確認チェックリスト

- [ ] 管理タブ → ユーザー管理 → 任意のテストユーザーの「アクセス削除」ボタン押下 → 「○○ のアクセスを削除しました（全メール・通知設定も解除されました）」トースト
- [ ] 削除後、ユーザー一覧から該当行が消える
- [ ] `allowedUsers` Firestore コレクションから該当 doc が消える
- [ ] `staffs` Supabase テーブルから該当行が消える
- [ ] 通知振り分け設定画面で削除済 teacherId が表示されない
- [ ] 自分自身の削除を試行 → 「自分自身のアクセスは削除できません」エラー
- [ ] 存在しないメール削除 → success（GAS 版と同じく握り潰し）
- [ ] Admin でないユーザーの呼出 → 「Admin のみアクセス可能」
- [ ] `operationLogs` Firestore に `'removeUserAccess'` 監査ログが記録される

## 残存スタブ関数の扱い

| 関数 | GAS 場所 | 状態 | 今後の方針 |
|------|---------|------|-----------|
| `addAdminEmail` | `auth.js:243-245` | **スタブ**（即エラー返却・1 行） | Workers 化対象外。「管理者の追加はできません。管理者は GAS のデプロイアカウントに固定されています。」を返すだけのため Workers 化の実利益なし |
| `removeAdminEmail` | `auth.js:658-660` | **スタブ**（即エラー返却・1 行） | Workers 化対象外。同上 |
| `initializeFirstAdmin` | `auth.js:669-` | 本実装あり | 当面スキップ。初回セットアップ専用で呼出 1 回限り（既に登録済の場合は早期 return）のため、Workers 化の優先度は極めて低い |

スタブ 2 関数は将来「フロント UI からボタン削除＋GAS 関数削除」の独立フェーズで撤去を検討する余地あり（本フェーズのスコープ外）。

## B 分類完了状態

`docs/remaining-functions-inventory.md` の B 分類 68 関数の Workers 化状況:

| 状態 | 件数 |
|------|------|
| Workers 化済（router 登録済） | 63 |
| 移行不要（GAS 内部ヘルパー） | 2（`getJukuEventOverrides` / `getClosedDayOverrides`） |
| 移行不要（スタブ化済） | 2（`addAdminEmail` / `removeAdminEmail`） |
| 当面スキップ（極低頻度） | 1（`initializeFirstAdmin`） |
| **B 分類実質完了率** | **68/68（100%）** |

> 「B 分類の実質的な Workers 化対象はこれで完了」とする。残存 3 件は構造的に Workers 化が無意味または不要。

## 関連コミット

- `ffdc0c3` Phase 6-C-01: removeUserAccess を Workers 化

---

# Phase 6-C-02 完了記録（2026-04-26）

## 概要

**A 分類「優先度: 高」の `submitStudentInfo` を Workers 化。**

`docs/remaining-functions-inventory.md` の更新で実残候補が 14 件に絞り込まれた中で、優先度「高」の最簡候補（姉妹関数 `updateStudentInfo` が既に Workers 化済み）として選定。

## 移行した関数

| 関数 | GAS 場所 | 役割 |
|------|---------|------|
| `submitStudentInfo` | `students.js:419-498` | 生徒情報の新規登録（成績管理タブ → 情報入力フォーム → 「登録」ボタン） |

## LockService の代替設計

GAS 版は `LockService.getScriptLock()` で同時登録時の ID 採番衝突を防いでいたが、Workers には同等機能がない。**PK 衝突時リトライ方式**を採用：

| ステップ | 内容 |
|---------|------|
| 1 | バリデーション（必須項目・形式） |
| 2 | `students` 全 active を取得し氏名+ふりがな完全一致で重複チェック |
| 3 | 同プレフィックス（校舎+年度+学年）の `student_id` を取得し maxSeq+1 で採番 |
| 4 | `supabaseInsert` で INSERT（PK 違反時はステップ 3 から最大 3 回リトライ） |
| 5 | 3 回失敗したら「同時操作による競合が発生しました」エラー |

PostgreSQL の `unique_violation` エラーコード `23505` を捕捉してリトライする。GAS 版の LockService より厳格な保証（PK 制約による DB レベルの一意性）が得られる。

## 変更ファイル（3 ファイル・1 コミット）

| ファイル | 変更内容 |
|---------|---------|
| `workers/src/functions/students.js` | import に `supabaseInsert` 追加。`updateStudentInfo` の直前に `submitStudentInfo` を追加。+90 行 |
| `workers/src/router.js` | import + HANDLERS マップに `submitStudentInfo` を登録 |
| `gas-bridge.html` | `WORKERS_FUNCTIONS` Set に `'submitStudentInfo'` を追加（`updateStudentInfo` の直前） |

## GAS 版との差分

**意図的差分: LockService → PK 衝突リトライ**
- 同時登録時の保証粒度: GAS 版は LockService（プロセス単位）/ Workers 版は PostgreSQL UNIQUE 制約（DB 単位）
- ロック獲得失敗時のメッセージ: GAS 版「同時操作による競合が発生しました。時間をおいて再試行してください。」/ Workers 版も同一文言（リトライ枯渇時）
- その他のロジック（バリデーション・重複チェック・ID 採番・INSERT 内容）は完全一致

## 動作確認チェックリスト

- [ ] 成績管理タブ → 情報入力サブタブ → 校舎・学年・氏名・ふりがな入力 → 「登録」ボタン → 「生徒情報を登録しました」トースト表示
- [ ] 生徒IDが `{校舎2桁}{年度4桁}{学年2桁}{連番2桁}` の 10 桁形式で採番される
- [ ] 既存の同一氏名・ふりがなを再登録 → 「同じ氏名・ふりがなの生徒がすでに登録されています（ID: ○○）」エラー
- [ ] 必須項目（校舎・学年・姓・姓ふりがな）欠落 → 「必須項目（校舎、学年、姓、姓ふりがな）を入力してください」エラー
- [ ] 登録直後に成績管理画面から該当生徒が選択可能（fbGetStudentsForDropdown 経由で表示される）
- [ ] PK 衝突は実環境では極めて稀のため目視確認困難。Supabase Logs で INSERT INTO students の successful 行を確認

## ロールバック手順

`gas-bridge.html` の `WORKERS_FUNCTIONS` Set から `'submitStudentInfo'` の 1 行を除外して Hosting 再デプロイすれば即座に GAS 経路へロールバック可能。GAS 版 `submitStudentInfo`（students.js L419-498）はフォールバック保険として残置。

## A 分類の進捗

| 状態 | 件数 |
|------|------|
| Workers 化済 | 約 111（旧台帳掲載 95 + 旧台帳未掲載 16） |
| 未移行 A | **13**（うち Gemini API 系 12 件） |
| 残存「高」優先度 | 2（`requestAIAssistant` / `executeAiAction`） |

## 関連コミット

- （本コミット） Phase 6-C-02: submitStudentInfo を Workers 化
