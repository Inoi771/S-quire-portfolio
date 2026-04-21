// grades.js 成績マスタ設定の Workers ポート
//
// Phase 5-E-9b-1（分割実行）
//   セッション 1（コミット 01d2b23）:
//       G14 updateGradeAnalysisSigmaConfig    (書込・σ)
//       G15 resetGradeAnalysisSigmaConfig     (書込・σ)
//       G23 getGradeAnalysisSigmaConfig       (読取・σ)
//       G16 getCampusConfigForWeb             (読取・校舎)
//       getCampusConfig_（private）           (G20 相当)
//       ensureGradesConfigInit_（private）    (G3 相当)
//   セッション 2（コミット 56b18b9）:
//       G4  addTestName                       (書込・テスト名)
//       G5  deleteTestName                    (書込・テスト名 + Supabase count guard)
//       G6  updateTestName                    (書込・テスト名)
//       getTestNamesConfig_（private）        (G18 相当)
//       countGradesByTestName_（private）     (Supabase count guard・α 方式)
//   セッション 3（本コミット）:
//       G7  addSchool                         (書込・志望校)
//       G8  deleteSchool                      (書込・志望校 + Supabase OR count guard)
//       G9  updateSchool                      (書込・志望校)
//       getSchoolConfig_（private）           (G19 相当)
//       countGradesBySchool_（private）       (Supabase shogaku1/shogaku2 OR・α 方式)
//       parseDepartments_（private）          (G7/G9 共用の学科文字列パーサ)
//
// 以降のサブセッションで追加予定（残り 9 件）：
//   G10-G13 校舎書込 + 表示学年（4 件）
//   G17     getGradesConfigForWeb  （Supabase 併用）
//   G21     getCampusDetailsConfig_（private）
//
// インライン展開/定数化（Workers では独立定義しない）:
//   G1  getScriptProperty         → `env.KV.get('prop:' + key) ?? ''`
//   G2  setScriptProperty         → `env.KV.put('prop:' + key, value)`
//   G3  initializeGradesConfig    → `ensureGradesConfigInit_` に集約
//   G22 getGradeConfig            → モジュール定数 `GRADES`

import { isAdminUser } from './auth.js';
import { supabaseSelect } from '../supabase.js';

const PROP_PREFIX = 'prop:';

// ─── CONFIG_PROP_KEYS 相当（GAS code.js:45〜57 と一致） ───
const KEY_TEST_NAMES    = 'GRADES_TEST_NAMES_CONFIG';
const KEY_CAMPUS_CODES  = 'GRADES_CAMPUS_CODES_CONFIG';
const KEY_SCHOOL        = 'GRADES_SCHOOL_CONFIG';
const KEY_SIGMA         = 'GRADES_SIGMA_CONFIG';
const KEY_GRADE_VISIBLE = 'GRADES_VISIBLE_CONFIG';

// ─── デフォルト定数（GAS code.js:62-92 / grades.js:579 と一致） ───
const TEST_NAMES = ['4月実力', '5月実力', '6月実力', '期末テスト', '実力テスト'];
const CAMPUSES   = { '01': '校舎A', '02': '校舎B', '03': '校舎C' };
const GRADES     = {
  '07': '小1', '08': '小2', '09': '小3', '10': '小4', '11': '小5', '12': '小6',
  '13': '中1', '14': '中2', '15': '中3', '16': '高1', '17': '高2', '18': '高3'
};
const DEFAULT_SIGMA = { kokugo: 15, shakai: 18, sugaku: 23, rika: 20, eigo: 20, total: 100 };

// ─── 低レベル KV ラッパー（G1/G2 のインライン相当） ───
async function readKv_(env, key) {
  return (await env.KV.get(PROP_PREFIX + key)) ?? '';
}
async function writeJson_(env, key, obj) {
  await env.KV.put(PROP_PREFIX + key, JSON.stringify(obj));
}
async function deleteKv_(env, key) {
  await env.KV.delete(PROP_PREFIX + key);
}

// ─── defensive init（G3 initializeGradesConfig 相当・空なら初期値を書く） ───
async function ensureGradesConfigInit_(env) {
  const testNamesRaw = await readKv_(env, KEY_TEST_NAMES);
  if (!testNamesRaw) {
    await writeJson_(env, KEY_TEST_NAMES, TEST_NAMES);
  }
  const campusRaw = await readKv_(env, KEY_CAMPUS_CODES);
  if (!campusRaw) {
    const init = Object.keys(CAMPUSES).map((code) => ({ code, name: CAMPUSES[code] }));
    await writeJson_(env, KEY_CAMPUS_CODES, init);
  }
}

// ─── Admin 判定ラッパー（メッセージは GAS 現行を維持） ───
// grades.js の CRUD 系: '管理者権限が必要です'
async function denyIfNotAdminGradesCrud_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: '管理者権限が必要です' };
}
// grades.js の σ 系 (G14/G15) と schedule 系 と同じ
async function denyIfNotAdminSigma_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─── Workers 内部 private reader: G20 getCampusConfig 相当 ───
// GAS 側は配列 `[{code,name,...}]` → `{code: name}` 辞書に変換する。
// エラー時は `CAMPUSES` デフォルト定数を返す（defensive）。
async function getCampusConfig_(env) {
  try {
    await ensureGradesConfigInit_(env);
    const raw = await readKv_(env, KEY_CAMPUS_CODES);
    const config = raw ? JSON.parse(raw) : [];
    const result = {};
    config.forEach((item) => { result[item.code] = item.name; });
    return result;
  } catch (e) {
    return { ...CAMPUSES };
  }
}

// ─── 公開関数（Workers router に登録） ───

/**
 * 校舎設定を Web 向けに返す（G16 getCampusConfigForWeb の Workers 版）
 * GAS grades.js:427 と同じ戻り値形状 `{ success, data }`
 */
export async function getCampusConfigForWeb(args, env, user) {
  try {
    return { success: true, data: await getCampusConfig_(env) };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績分析σ設定を取得する（G23 getGradeAnalysisSigmaConfig の Workers 版）
 * GAS grades.js:586 と同じ挙動：
 *   - 未設定キーは `DEFAULT_SIGMA` で補完
 *   - JSON パース失敗時も `success: true` + DEFAULT_SIGMA を返す
 */
export async function getGradeAnalysisSigmaConfig(args, env, user) {
  try {
    const raw = await readKv_(env, KEY_SIGMA);
    let config = {};
    if (raw) {
      try { config = JSON.parse(raw); } catch (e) { config = {}; }
    }
    const result = {};
    Object.keys(DEFAULT_SIGMA).forEach((k) => {
      const v = config[k];
      result[k] = (v !== undefined && !isNaN(Number(v))) ? Number(v) : DEFAULT_SIGMA[k];
    });
    return { success: true, sigma: result, defaults: DEFAULT_SIGMA };
  } catch (error) {
    // GAS 版は catch でも success:true + DEFAULT を返すため忠実に再現
    return { success: true, sigma: DEFAULT_SIGMA, defaults: DEFAULT_SIGMA };
  }
}

/**
 * 成績分析σ設定を保存する（G14 updateGradeAnalysisSigmaConfig の Workers 版）
 * Admin のみ。全 6 キー（kokugo/shakai/sugaku/rika/eigo/total）を検証。
 * 1 つでも不正値があれば書き込まずエラー。
 */
export async function updateGradeAnalysisSigmaConfig(args, env, user) {
  try {
    const denied = await denyIfNotAdminSigma_(env, user);
    if (denied) return denied;
    const [sigmaData = {}] = args || [];
    const config = {};
    const keys = Object.keys(DEFAULT_SIGMA);
    for (const k of keys) {
      const v = Number(sigmaData[k]);
      if (isNaN(v) || v <= 0) {
        return { success: false, error: k + ' の値が不正です（正の数値を入力してください）' };
      }
      config[k] = v;
    }
    await writeJson_(env, KEY_SIGMA, config);
    return { success: true, message: 'σ設定を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績分析σ設定をデフォルト値にリセットする（G15 resetGradeAnalysisSigmaConfig の Workers 版）
 * Admin のみ。KV エントリ自体を削除（空文字書込ではない）することで
 * getGradeAnalysisSigmaConfig がデフォルト値を返すようにする。
 */
export async function resetGradeAnalysisSigmaConfig(args, env, user) {
  try {
    const denied = await denyIfNotAdminSigma_(env, user);
    if (denied) return denied;
    await deleteKv_(env, KEY_SIGMA);
    return { success: true, message: 'σ設定をデフォルト値に戻しました', sigma: DEFAULT_SIGMA };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ─── Workers 内部 private reader: G18 getTestNamesConfig 相当 ───
// GAS 版は JSON.parse 失敗時に `TEST_NAMES` デフォルト定数を返す（defensive）。
async function getTestNamesConfig_(env) {
  await ensureGradesConfigInit_(env);
  const raw = await readKv_(env, KEY_TEST_NAMES);
  try {
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [...TEST_NAMES];
  }
}

// ─── Supabase count guard（GAS countGradesByTestName_ 相当・選択肢α） ───
// 指定テスト名を使用している Supabase `grades` 件数を返す（エラー時は 0）。
// α 方式の決定理由は docs/phase-5e9-survey.md の「実装上の決定記録」参照。
async function countGradesByTestName_(env, testName) {
  try {
    const rows = await supabaseSelect(
      env,
      'grades',
      'select=id&test_name=eq.' + encodeURIComponent(testName)
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * テスト名を追加（G4 の Workers 版）
 * GAS grades.js:68 と同じバリデーション・エラーメッセージ・戻り値形状。
 * @param {Array} args [newTestName]
 */
export async function addTestName(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [newTestName] = args || [];
    if (!newTestName || newTestName.trim().length === 0) {
      return { success: false, error: 'テスト名を入力してください' };
    }
    newTestName = newTestName.trim();
    const testNames = await getTestNamesConfig_(env);
    if (testNames.includes(newTestName)) {
      return { success: false, error: 'このテスト名は既に存在します' };
    }
    if (newTestName.length > 50) {
      return { success: false, error: 'テスト名は50文字以下にしてください' };
    }
    testNames.push(newTestName);
    await writeJson_(env, KEY_TEST_NAMES, testNames);
    return { success: true, message: 'テスト名を追加しました', testName: newTestName };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * テスト名を削除（G5 の Workers 版）
 * GAS grades.js:102 と同じ。削除前に Supabase `grades` 使用件数を count し、
 * 1 件でも使われていれば削除を拒否する（α 方式）。
 * @param {Array} args [testNameToDelete]
 */
export async function deleteTestName(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [testNameToDelete] = args || [];
    testNameToDelete = (testNameToDelete || '').trim();
    const testNames = await getTestNamesConfig_(env);
    const index = testNames.indexOf(testNameToDelete);
    if (index === -1) {
      return { success: false, error: 'テスト名が見つかりません' };
    }
    const gradeCount = await countGradesByTestName_(env, testNameToDelete);
    if (gradeCount > 0) {
      return { success: false, error: 'このテスト名は ' + gradeCount + ' 件の成績データで使用されているため削除できません' };
    }
    testNames.splice(index, 1);
    await writeJson_(env, KEY_TEST_NAMES, testNames);
    return { success: true, message: 'テスト名を削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * テスト名を変更（G6 の Workers 版）
 * GAS grades.js:136 と同じ。リネーム時は重複チェック（自分自身へのリネームは許容）。
 * @param {Array} args [oldName, newName]
 */
export async function updateTestName(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [oldName, newName] = args || [];
    newName = (newName || '').trim();
    if (!newName) {
      return { success: false, error: '新しいテスト名を入力してください' };
    }
    const testNames = await getTestNamesConfig_(env);
    const idx = testNames.indexOf(oldName);
    if (idx === -1) {
      return { success: false, error: 'テスト名が見つかりません' };
    }
    if (newName !== oldName && testNames.indexOf(newName) !== -1) {
      return { success: false, error: 'このテスト名は既に登録されています' };
    }
    testNames[idx] = newName;
    await writeJson_(env, KEY_TEST_NAMES, testNames);
    return { success: true, message: 'テスト名を変更しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ─── Workers 内部 private reader: G19 getSchoolConfig 相当 ───
// GAS grades.js:509 と同じ。純粋 KV 読取 + JSON.parse、失敗時は空配列。
async function getSchoolConfig_(env) {
  try {
    const raw = await readKv_(env, KEY_SCHOOL);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ─── 学科文字列パーサ（GAS G7/G9 内の共通ロジックを抽出） ───
// 入力例: "普通科:55, 理数科:60, 商業科"
// 戻り値: [{ name: '普通科', deviation: 55 }, { name: '理数科', deviation: 60 }, { name: '商業科', deviation: null }]
// 偏差値が非数値または省略の場合は deviation = null。空要素は除外。
function parseDepartments_(departmentsStr) {
  return (departmentsStr || '').split(',')
    .map((d) => {
      d = d.trim();
      if (!d) return null;
      const colonIdx = d.indexOf(':');
      if (colonIdx === -1) return { name: d, deviation: null };
      const deptName = d.substring(0, colonIdx).trim();
      const deviationStr = d.substring(colonIdx + 1).trim();
      let deviation = deviationStr ? parseInt(deviationStr, 10) : null;
      if (deviation !== null && isNaN(deviation)) deviation = null;
      return { name: deptName, deviation };
    })
    .filter((d) => d !== null && d.name.length > 0);
}

// ─── Supabase count guard（GAS countGradesBySchool_ 相当・選択肢α） ───
// 指定志望校名を使用している Supabase `grades` 件数を返す（エラー時は 0）。
// shogaku1 / shogaku2 の両カラムを対象に OR 検索。GAS 実装と同じく 2 回の
// SELECT を個別発行し、id で union して重複を排除する（REST の `or` 構文は
// 使わない）。GAS 挙動との完全一致を優先した。
async function countGradesBySchool_(env, schoolName) {
  try {
    const [rows1, rows2] = await Promise.all([
      supabaseSelect(env, 'grades', 'select=id&shogaku1=eq.' + encodeURIComponent(schoolName)),
      supabaseSelect(env, 'grades', 'select=id&shogaku2=eq.' + encodeURIComponent(schoolName))
    ]);
    const seen = {};
    (Array.isArray(rows1) ? rows1 : []).forEach((d) => { seen[d.id] = true; });
    (Array.isArray(rows2) ? rows2 : []).forEach((d) => { seen[d.id] = true; });
    return Object.keys(seen).length;
  } catch (e) {
    return 0;
  }
}

/**
 * 志望校を追加（G7 の Workers 版）
 * GAS grades.js:164 と同じ。学科文字列のパースと重複チェック付き。
 * @param {Array} args [schoolName, departmentsStr]
 */
export async function addSchool(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [schoolName, departmentsStr] = args || [];
    if (!schoolName || schoolName.trim().length === 0) {
      return { success: false, error: '学校名を入力してください' };
    }
    schoolName = schoolName.trim();
    const departments = parseDepartments_(departmentsStr);
    const schools = await getSchoolConfig_(env);
    if (schools.some((s) => s.name === schoolName)) {
      return { success: false, error: 'この学校名は既に登録されています' };
    }
    schools.push({ name: schoolName, departments });
    await writeJson_(env, KEY_SCHOOL, schools);
    return { success: true, message: '学校を追加しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 志望校を削除（G8 の Workers 版）
 * GAS grades.js:206 と同じ。削除前に shogaku1/shogaku2 を OR 検索して count し、
 * 1 件でも使われていれば削除を拒否する（α 方式・GAS と同じ 2 回 SELECT）。
 * @param {Array} args [schoolName]
 */
export async function deleteSchool(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    const [schoolName] = args || [];
    const schools = await getSchoolConfig_(env);
    const index = schools.findIndex((s) => s.name === schoolName);
    if (index === -1) {
      return { success: false, error: '学校が見つかりません' };
    }
    const gradeCount = await countGradesBySchool_(env, schoolName);
    if (gradeCount > 0) {
      return { success: false, error: 'この志望校は ' + gradeCount + ' 件の成績データで使用されているため削除できません' };
    }
    schools.splice(index, 1);
    await writeJson_(env, KEY_SCHOOL, schools);
    return { success: true, message: '学校を削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 志望校を更新（G9 の Workers 版）
 * GAS grades.js:237 と同じ。リネーム時の重複チェック（自分自身は許容）、
 * 学科文字列を parseDepartments_ で解析して置換する。
 * @param {Array} args [oldName, newName, departmentsStr]
 */
export async function updateSchool(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [oldName, newName, departmentsStr] = args || [];
    newName = (newName || '').trim();
    if (!newName) {
      return { success: false, error: '学校名を入力してください' };
    }
    const schools = await getSchoolConfig_(env);
    const idx = schools.findIndex((s) => s.name === oldName);
    if (idx === -1) {
      return { success: false, error: '学校が見つかりません' };
    }
    const dupIdx = schools.findIndex((s) => s.name === newName);
    if (dupIdx !== -1 && dupIdx !== idx) {
      return { success: false, error: 'この学校名は既に登録されています' };
    }
    const departments = parseDepartments_(departmentsStr);
    schools[idx] = { name: newName, departments };
    await writeJson_(env, KEY_SCHOOL, schools);
    return { success: true, message: '志望校を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
