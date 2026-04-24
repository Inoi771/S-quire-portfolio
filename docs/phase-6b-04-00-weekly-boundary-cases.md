# Phase 6-B-04-00 P3: createWeeklyLectureEntriesAI 境界ケース設計

> 作成日: 2026-04-24
> 目的: `createWeeklyLectureEntriesAI_` の Workers 化（Phase 6-B-04-06）で**最もリスクが高い**日付計算の境界ケースをフィクスチャとして整理する
> リスク参照: 6.2.5（R5: 休校日計算の日付ズレ）/ CLAUDE.md「Workers 内 Date 操作は必ず JST 補正する」
> 関連: Phase 6-B-05 で整備済の `workers/src/helpers/datetime-helpers.js`

---

## 0. なぜ境界ケースが重要か

GAS は **JST native**、Workers は **UTC native**。GAS 版 `createWeeklyLectureEntriesAI_`（`features.js:3135-3228`）には以下の TZ 依存表現が複数含まれる:

| GAS 版表現 | TZ 挙動 | Workers での影響 |
|----------|--------|----------------|
| `new Date(date + 'T00:00:00')` | JST 00:00 として parse | UTC 00:00（= JST 09:00）になり 9 時間ズレる |
| `startDate.getMonth()` | JST 月（1〜12 を 0〜11） | UTC 月（境界日で 1 日ズレる可能性） |
| `startDate.getFullYear()` | JST 年 | UTC 年（年末年始境界でズレる） |
| `cur.getDay()` | JST 曜日（日=0） | UTC 曜日（深夜帯で曜日が前日扱い） |
| `cur.getDate()` | JST 日 | UTC 日（同上） |
| `cur.setDate(cur.getDate() + 7)` | JST 空間で 7 日加算 | DST のない JP では問題ないが、TZ ナイーブのまま加算で計算ズレ |

**回避策**: 全て `workers/src/helpers/datetime-helpers.js` の関数で書換える。

---

## 1. 必須使用 helpers と置換マッピング

| GAS 版表現 | Workers 版置換先 | 補足 |
|----------|-----------------|-----|
| `new Date(date + 'T00:00:00')` | `toJstDate(date)` | YYYY-MM-DD を JST 00:00 として parse |
| `startDate.getMonth()` | `getJstMonth(startDate) - 1` または `getJstMonth(startDate)` | helpers は 1〜12 を返すので GAS の 0〜11 と差に注意 |
| `startDate.getFullYear()` | `getJstYear(startDate)` | |
| `(startDate.getMonth() >= 3) ? startDate.getFullYear() : startDate.getFullYear() - 1` | `getFiscalYear(getJstYear(d), getJstMonth(d))` | helpers の `getFiscalYear` は 1〜12 月入力前提 |
| `cur.getDay()` | `getJstDayOfWeek(cur)` | 日=0（GAS と同じ） |
| `cur.getDate()` | `getJstDay(cur)` | |
| `cur.setDate(cur.getDate() + 7)` | `cur = addDays(cur, 7)` | mutation でなく**新しい Date 返却** |
| 月 padStart 自前実装 | `formatJstDateStr(date)` または手動 | YYYY-MM-DD を JST 値で返す |
| `cur.getFullYear() > fiscalYear + 2` 安全ガード | `getJstYear(cur) > fiscalYear + 2` | |

> ⚠️ `getJstMonth()` は **1-indexed（1〜12）** を返す。GAS の `Date.prototype.getMonth()` は **0-indexed（0〜11）** なので、置換時に **+1 / -1 のオフセット**に注意する。

---

## 2. フィクスチャ: 境界ケース 12 件

各ケースは **GAS 版を基準値**とし、Workers 版が同じ件数・同じ日付を返すかを Jest で検証する。

### 2.1 月跨ぎ（標準ケース）

| # | ID | 入力（date / count / closedDays） | 期待される作成日 | 備考 |
|---|----|--------------------------------|---------------|-----|
| C01 | weekly-month-cross-1 | `2026-03-25` / `4` / なし | `[2026-03-25, 2026-04-01, 2026-04-08, 2026-04-15]` | 3 月→4 月跨ぎ |
| C02 | weekly-month-cross-2 | `2026-07-29` / `5` / なし | `[2026-07-29, 2026-08-05, 2026-08-12, 2026-08-19, 2026-08-26]` | 7 月→8 月跨ぎ（夏期講習想定） |

### 2.2 年跨ぎ

| # | ID | 入力 | 期待される作成日 | 備考 |
|---|----|------|---------------|-----|
| C03 | weekly-year-cross-1 | `2025-12-24` / `4` / なし | `[2025-12-24, 2025-12-31, 2026-01-07, 2026-01-14]` | 12 月→1 月跨ぎ・冬期講習想定 |
| C04 | weekly-year-cross-2 | `2026-12-30` / `3` / なし | `[2026-12-30, 2027-01-06, 2027-01-13]` | 開始日が年末・水曜 |

### 2.3 うるう年（2028 年がうるう年）

| # | ID | 入力 | 期待される作成日 | 備考 |
|---|----|------|---------------|-----|
| C05 | weekly-leap-year | `2028-02-22` / `3` / なし | `[2028-02-22, 2028-02-29, 2028-03-07]` | 2 月 29 日を含む |

### 2.4 GW・祝日（休校日スキップ）

| # | ID | 入力 | closedDays | 期待される作成日（4 件） | 備考 |
|---|----|------|-----------|---------------------|-----|
| C06 | weekly-gw-skip | `2026-04-22` / `4` / `{2026-04-29:true, 2026-05-06:true}` | `[2026-04-22, 2026-05-13, 2026-05-20, 2026-05-27]` | 4/29（祝）と 5/6（GW 振替）を 2 週連続スキップ |
| C07 | weekly-gw-partial | `2026-04-29` / `3` / `{2026-04-29:true}` | `[2026-05-06, 2026-05-13, 2026-05-20]` | 開始日自体が休校日（即スキップ） |

### 2.5 日曜スキップ（GAS の `cur.getDay() !== 0` ガード）

| # | ID | 入力 | 期待される作成日（4 件） | 備考 |
|---|----|------|---------------------|-----|
| C08 | weekly-sunday-skip-start | `2026-04-26` / `4` / なし | `[2026-05-03, 2026-05-10, 2026-05-17, 2026-05-24]` | 開始日が日曜 → 即スキップ・翌週から開始 |
| C09 | weekly-sunday-only | `2026-04-26` / `1` / なし | `[2026-05-03]` | 1 件指定で日曜開始 → 翌週日曜は休校日でなくとも `getDay() !== 0` でスキップ続行 → さらに翌週日曜 ... 安全ガード |

> ⚠️ C09 は GAS 版の `cur.getDay() !== 0` で**永久に日曜を回避**する。`cur.setDate(cur.getDate() + 7)` で常に日曜のままなので、安全ガード `cur.getFullYear() > fiscalYear + 2` で抜ける。
> Workers 実装でも**同じ挙動**にすること（無限ループにならないこと）。

### 2.6 安全ガード（2 年超で打切り）

| # | ID | 入力 | 期待される作成数 | 備考 |
|---|----|------|---------------|-----|
| C10 | weekly-safety-guard | `2026-04-01` / `200` / **全週日曜化された極端なケース** | 安全ガードで 2 年以内に打切り（具体的な件数は実装依存） | 無限ループ防止が機能するか |

### 2.7 春期講習の「新○○」キー変換

| # | ID | 入力 | 期待される動作 | 備考 |
|---|----|------|-------------|-----|
| C11 | weekly-spring-grade-key | `lectureId='spring2026'`, `grade='14'`（中 2） | `gradeSettings['新中2']` を参照（春期は「新」プレフィクス） | gradeSettings から count/duration を上書き取得 |
| C12 | weekly-non-spring-grade-key | `lectureId='summer2026'`, `grade='14'`（中 2） | `gradeSettings['中2']` を参照（プレフィクスなし） | 通常講習 |

> ⚠️ 春期判定は `lp.name.indexOf('春期') !== -1` で行う（`lectureId` ではなく **講習名**で判定）。Workers 版でも同じ仕様にすること。

---

## 3. 入力データの組立て方（Jest フィクスチャ）

```js
// __tests__/workers-features/create-weekly-lecture-entries.test.js（Phase 6-B-04-06 で実装予定）
const cases = [
  {
    id: 'C01',
    name: 'month cross',
    args: ['summer2026', '01', '2026-03-25', '14:00', 9, '数学', '13', null],
    closedDays: {},
    expectedCount: 4,
    expectedDates: ['2026-03-25', '2026-04-01', '2026-04-08', '2026-04-15']
  },
  // ... C02-C12
];
```

**Mock すべきヘルパー**:
- `getLecturePeriods(env)` → 固定の `lp` オブジェクト
- `computeClosedDaysForMonth_(env, y, m)` → 固定の closedDays オブジェクト
- `supabaseRpc(env, 'find_staff_by_auth', ...)` → 固定の teacherId
- `firestoreTransaction(env, callback)` → callback を直接呼出（Firestore 書込は省略・最終 entries 配列を assert）

---

## 4. C09 の特殊性（永久日曜ループの安全ガード検証）

C09 は実装上のトラップになりやすい:

```js
// GAS 版（features.js:3187-3215）
var cur = new Date(startDate.getTime());  // 例: 2026-04-26 日曜
var created = 0;
while (created < count) {
  // ...
  if (!closedDays[dateKey] && cur.getDay() !== 0) {  // ←日曜は常にスキップ
    // push
    created++;
  }
  cur.setDate(cur.getDate() + 7);  // ←常に +7 で日曜のまま
  if (cur.getFullYear() > fiscalYear + 2) break;  // ←2 年超で抜ける
}
```

開始日が日曜の場合、**安全ガード（fiscalYear + 2）で抜けるまで created は 0 のまま**。
その結果、戻り値は `'0件の授業コマを作成しました（毎週・休校日除く）'`（success=true）になる。

Workers 版で `addDays(cur, 7)` を使う場合も**同じ挙動**を再現すること:
- `created` は 0 のまま
- `getJstYear(cur) > fiscalYear + 2` で while を抜ける
- 戻り値 `{ success: true, message: '0件の授業コマを作成しました（毎週・休校日除く）' }`

この挙動はバグに見えるが GAS 版の仕様であり、Phase 6-B-04 ではあえて修正しない（parity 維持）。
別 Issue としてユーザーに報告するかは Phase クローズ後に判断。

---

## 5. fiscalYear の計算境界

GAS 版:
```js
var fiscalYear = (startDate.getMonth() >= 3) ? startDate.getFullYear() : startDate.getFullYear() - 1;
```

`getMonth()` は 0-indexed なので `>= 3` は **4 月以降**を意味する（4 月始まりの会計年度）。

| 入力日 | GAS startDate | startDate.getMonth() | fiscalYear |
|-------|--------------|---------------------|-----------|
| 2026-03-31 | JST 3 月 31 日 | 2 | 2025（旧年度） |
| 2026-04-01 | JST 4 月 1 日 | 3 | 2026（新年度） |
| 2027-01-15 | JST 1 月 15 日 | 0 | 2026 |
| 2026-12-31 | JST 12 月 31 日 | 11 | 2026 |

Workers 版で `helpers/datetime-helpers.js` の `getFiscalYear(year, month)` を使う場合:
```js
const startDate = toJstDate(date);
const fiscalYear = getFiscalYear(getJstYear(startDate), getJstMonth(startDate));
```

`getFiscalYear(year, month)` の引数 `month` は **1-indexed（1〜12）**なので、`getJstMonth()` の戻り値（1-indexed）をそのまま渡せる。GAS 版の `>= 3`（0-indexed）と Workers 版の `>= 4`（1-indexed）が等価になる点に注意。

helpers 内で正しく実装されていることを `__tests__/workers-helpers/` で既に検証済（Phase 6-B-05）だが、Phase 6-B-04-06 でも 2026-03-31 / 2026-04-01 の境界をフィクスチャに含める。

---

## 6. closedDays の年度跨ぎループ

GAS 版（`features.js:3179-3184`）:
```js
var closedDays = {};
for (var m = 1; m <= 12; m++) {
  var monthClosed = computeClosedDaysForMonth_(fiscalYear + (m >= 4 ? 0 : 1), m);
  Object.keys(monthClosed).forEach(function(k) { closedDays[k] = true; });
}
```

会計年度の 4 月〜翌年 3 月の 12 ヶ月分の休校日を 1 つの map にマージ。
Workers 版でも同じループを書く（`computeClosedDaysForMonth_` は Workers 版が `workers/src/functions/features.js:338` に既に存在）。

**注意**: `m >= 4` の判定は **1-indexed の月**を前提（GAS 版でも Workers 版でも同じ）。`m = 4` で `fiscalYear + 0`、`m = 1` で `fiscalYear + 1`（翌年 1 月）。

---

## 7. テスト時の Mock 戦略

```js
// __tests__/workers-features/create-weekly-lecture-entries.test.js
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../workers/src/functions/features.js', () => ({
  ...jest.requireActual('../../workers/src/functions/features.js'),
  // computeClosedDaysForMonth_ は内部関数のため、モジュール全体 mock ではなく
  // env オブジェクトに mock 関数を渡す形で注入する
}));

// Firestore Transaction のモック
const mockTx = {
  get: jest.fn().mockResolvedValue({ entries: [] }),
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};

// firestoreTransaction を「callback を直接呼ぶ」モックに置き換え
jest.unstable_mockModule('../../workers/src/firebase.js', () => ({
  firestoreTransaction: async (env, callback) => callback(mockTx)
}));
```

→ tx.set に渡された entries 配列を assert することで、日付計算の正しさを検証する。

---

## 8. Phase 6-B-04-06 での Jest テスト構成案

```
__tests__/
└── workers-features/
    └── create-weekly-lecture-entries.test.js
        ├── describe('月跨ぎ', () => { test C01, test C02 })
        ├── describe('年跨ぎ', () => { test C03, test C04 })
        ├── describe('うるう年', () => { test C05 })
        ├── describe('GW・祝日スキップ', () => { test C06, test C07 })
        ├── describe('日曜スキップ', () => { test C08, test C09 })
        ├── describe('安全ガード', () => { test C10 })
        └── describe('春期 grade key 変換', () => { test C11, test C12 })
```

各 test は **GAS 版の動作と等価な Workers 版実装に対する assert** を行う。GAS 版自体は Jest からは呼べないが、本ドキュメントの「期待される作成日」リストが GAS 版の正解値である。

---

## 9. 関連ドキュメント

- `docs/phase-6b-04-investigation.md` セクション 6.2.5（R5: 日付ズレ回避策）
- `workers/src/helpers/datetime-helpers.js`（Phase 6-B-05 で整備）
- `workers/src/functions/features.js:338`（`computeClosedDaysForMonth_` Workers 版）
- `workers/src/functions/features.js:455`（`getLecturePeriods` Workers 版）
- `features.js:3135-3228`（GAS 版本体）
- `__tests__/workers-helpers/`（Phase 6-B-05 の helpers test 形式）
