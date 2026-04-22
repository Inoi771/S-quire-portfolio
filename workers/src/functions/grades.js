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
//   セッション 3（コミット 4408ad7）:
//       G7  addSchool                         (書込・志望校)
//       G8  deleteSchool                      (書込・志望校 + Supabase OR count guard)
//       G9  updateSchool                      (書込・志望校)
//       getSchoolConfig_（private）           (G19 相当)
//       countGradesBySchool_（private）       (Supabase shogaku1/shogaku2 OR・α 方式)
//       parseDepartments_（private）          (G7/G9 共用の学科文字列パーサ)
//   セッション 4（コミット 3e7aac1）:
//       G10 addCampus                         (書込・校舎)
//       G11 deleteCampus                      (書込・校舎 + Supabase count guard)
//       G12 updateCampusDetails               (書込・校舎・部分更新)
//       G13 updateVisibleGrades               (書込・表示学年)
//       getCampusDetailsConfig_（private）    (G21 相当・将来の getStaffPlacementForWeb 用の備え)
//       countStudentsByCampus_（private）     (Supabase `students` count guard・α 方式)
//       readCampusConfigArray_（private）     (G10/G11/G12 共用の配列読取)
//   セッション 5（本コミット・grades.js Workers 化クローズ）:
//       G17 getGradesConfigForWeb             (読取・KV 4 キー合成 + Supabase `staffs`)
//
// これで 5-E-9b-1（grades.js）の Workers 化対象 20 件はすべて完了。
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
// Phase 5-E-9b-3a 以降: features.js の PRICING シンクが同じ辞書を使うため
// `export` して共有する（α 方式）。
export async function getCampusConfig_(env) {
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
 * 【Phase 6-A-14】fetchSigmaConfig_ — σ設定のコアロジック（private）
 *
 * getGradeAnalysisSigmaConfig と getStudentGradeReport の共通処理として切出し。
 * sigma オブジェクト（6教科キー）のみを返す。success ラッパーは呼出側で付ける。
 * エラー時は DEFAULT_SIGMA を返す（GAS 版の defensive 挙動踏襲）。
 *
 * @param {Object} env
 * @returns {Promise<{kokugo:number, shakai:number, sugaku:number, rika:number, eigo:number, total:number}>}
 */
async function fetchSigmaConfig_(env) {
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
    return result;
  } catch (error) {
    return { ...DEFAULT_SIGMA };
  }
}

// cross-module 使用のため export（students.js の getStudentGradeReport から参照）
export { fetchSigmaConfig_ };

/**
 * 成績分析σ設定を取得する（G23 getGradeAnalysisSigmaConfig の Workers 版）
 * GAS grades.js:586 と同じ挙動：
 *   - 未設定キーは `DEFAULT_SIGMA` で補完
 *   - JSON パース失敗時も `success: true` + DEFAULT_SIGMA を返す
 *
 * Phase 6-A-14 リファクタ: コアを fetchSigmaConfig_ に切出し。外部 API 完全互換。
 */
export async function getGradeAnalysisSigmaConfig(args, env, user) {
  const sigma = await fetchSigmaConfig_(env);
  return { success: true, sigma, defaults: DEFAULT_SIGMA };
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
// Phase 6-A-14: cross-module 使用のため export（students.js の getStudentGradeReport から参照）。
export async function getTestNamesConfig_(env) {
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

// ─── 校舎 CRUD 共用の配列読取（G10/G11/G12 は GAS 版と同じく dict 変換せず配列を扱う） ───
// GAS 現行の addCampus/deleteCampus/updateCampusDetails は getCampusConfig（dict 化）を
// 使わず、`getScriptProperty` で生配列を取得してから操作している。同じ意味論を維持する。
async function readCampusConfigArray_(env) {
  const raw = await readKv_(env, KEY_CAMPUS_CODES);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

// ─── Workers 内部 private reader: G21 getCampusDetailsConfig 相当 ───
// GAS grades.js:545 と同じ。現時点で Workers の他関数から参照はないが、
// 将来の getStaffPlacementForWeb（admin.js）Workers 化時の備えとして定義。
// ensureGradesConfigInit_ 呼出は GAS 版と同じく冒頭で行う。
async function getCampusDetailsConfig_(env) {
  try {
    await ensureGradesConfigInit_(env);
    const config = await readCampusConfigArray_(env);
    return config.map((item) => ({
      code:      item.code,
      name:      item.name      || '',
      tel:       item.tel       || '',
      fax:       item.fax       || '',
      principal: item.principal || '',
      mobile:    item.mobile    || ''
    }));
  } catch (e) {
    return [];
  }
}

// ─── Supabase count guard（GAS countStudentsByCampus_ 相当・選択肢α） ───
// 指定校舎コードに在籍する削除済みでない生徒の件数を返す（エラー時は 0）。
// コードは 2 桁ゼロ埋め正規化（GAS 側と一致）。
async function countStudentsByCampus_(env, campusCode) {
  try {
    const targetCode = String(campusCode).padStart(2, '0');
    const rows = await supabaseSelect(
      env,
      'students',
      'select=id&campus=eq.' + encodeURIComponent(targetCode) + '&is_deleted=eq.false'
    );
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * 校舎を追加（G10 の Workers 版）
 * GAS grades.js:281 と同じ。コード正規化（upper）・長さ制限・重複チェック付き。
 * @param {Array} args [campusCode, campusName, tel, fax, principal, mobile]
 */
export async function addCampus(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [campusCode, campusName, tel, fax, principal, mobile] = args || [];
    if (!campusCode || !campusName) {
      return { success: false, error: 'コードと名前を入力してください' };
    }
    campusCode = campusCode.trim().toUpperCase();
    campusName = campusName.trim();
    const campusConfig = await readCampusConfigArray_(env);
    if (campusConfig.some((c) => c.code === campusCode)) {
      return { success: false, error: 'このコードは既に使用されています' };
    }
    if (campusCode.length > 10 || campusName.length > 30) {
      return { success: false, error: 'コードは10文字、名前は30文字以下にしてください' };
    }
    const newCampus = {
      code:      campusCode,
      name:      campusName,
      tel:       (tel       || '').trim(),
      fax:       (fax       || '').trim(),
      principal: (principal || '').trim(),
      mobile:    (mobile    || '').trim()
    };
    campusConfig.push(newCampus);
    await writeJson_(env, KEY_CAMPUS_CODES, campusConfig);
    return { success: true, message: '校舎を追加しました', campus: newCampus };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎を削除（G11 の Workers 版）
 * GAS grades.js:323 と同じ。filter で存在確認 → 在籍生徒が 1 名以上なら拒否（α 方式）。
 * GAS の順序どおり「存在チェック → Supabase count → 書込」で実装し、
 * filter 後の length 比較で「見つからない」を判定する挙動も踏襲。
 * @param {Array} args [campusCode]
 */
export async function deleteCampus(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [campusCode] = args || [];
    campusCode = (campusCode || '').trim();
    let campusConfig = await readCampusConfigArray_(env);
    const beforeCount = campusConfig.length;
    campusConfig = campusConfig.filter((c) => c.code !== campusCode);
    if (beforeCount === campusConfig.length) {
      return { success: false, error: '校舎が見つかりません' };
    }
    const studentCount = await countStudentsByCampus_(env, campusCode);
    if (studentCount > 0) {
      return { success: false, error: 'この校舎には ' + studentCount + ' 名の生徒が登録されているため削除できません' };
    }
    await writeJson_(env, KEY_CAMPUS_CODES, campusConfig);
    return { success: true, message: '校舎を削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎詳細を変更（G12 の Workers 版）
 * GAS grades.js:368 と同じ。`tel/fax/principal/mobile` は `null` 指定で変更スキップ
 * （部分更新）。コードは変更不可。
 * @param {Array} args [campusCode, name, tel, fax, principal, mobile]
 */
export async function updateCampusDetails(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    let [campusCode, name, tel, fax, principal, mobile] = args || [];
    name = (name || '').trim();
    if (!name) {
      return { success: false, error: '校舎名を入力してください' };
    }
    const campusConfig = await readCampusConfigArray_(env);
    const idx = campusConfig.findIndex((c) => c.code === campusCode);
    if (idx === -1) {
      return { success: false, error: '校舎が見つかりません' };
    }
    campusConfig[idx].name = name;
    if (tel       !== null) campusConfig[idx].tel       = (tel       || '').trim();
    if (fax       !== null) campusConfig[idx].fax       = (fax       || '').trim();
    if (principal !== null) campusConfig[idx].principal = (principal || '').trim();
    if (mobile    !== null) campusConfig[idx].mobile    = (mobile    || '').trim();
    await writeJson_(env, KEY_CAMPUS_CODES, campusConfig);
    return { success: true, message: '校舎情報を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 表示する学年を更新する（G13 の Workers 版）
 * GAS grades.js:397 と同じ。ドロップダウンに表示する学年コード配列を KV に保存。
 * 全コードが GRADES 定数に存在することをバリデーション。
 * @param {Array} args [visibleCodes]
 */
export async function updateVisibleGrades(args, env, user) {
  try {
    const denied = await denyIfNotAdminGradesCrud_(env, user);
    if (denied) return denied;
    const [visibleCodes] = args || [];
    if (!Array.isArray(visibleCodes) || visibleCodes.length === 0) {
      return { success: false, error: '少なくとも1つの学年を選択してください' };
    }
    for (let i = 0; i < visibleCodes.length; i++) {
      const code = String(visibleCodes[i]);
      if (!GRADES[code]) {
        return { success: false, error: '無効な学年コードです: ' + code };
      }
    }
    await writeJson_(env, KEY_GRADE_VISIBLE, visibleCodes);
    return { success: true, message: '表示学年を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績管理設定を取得（G17 getGradesConfigForWeb の Workers 版）
 * 成績管理タブで使用するドロップダウンデータを返す（GAS grades.js:442 相当）。
 *
 * 読み取り対象:
 *   - KV `prop:GRADES_TEST_NAMES_CONFIG`   （`getTestNamesConfig_` 経由）
 *   - KV `prop:GRADES_CAMPUS_CODES_CONFIG` （`readCampusConfigArray_` 経由・配列のまま）
 *   - KV `prop:GRADES_VISIBLE_CONFIG`      （表示学年フィルター・未設定時は全学年）
 *   - モジュール定数 `GRADES`                 （全 12 学年の code→name マップ）
 *   - Supabase `staffs` テーブルの `display_name` / `name`（校舎責任者選択用）
 *
 * 副作用: 冒頭で `ensureGradesConfigInit_` を呼ぶ defensive init（GAS と同じ）。
 * マイグレーション書込は持たない。
 *
 * Supabase エラー時は GAS 版と同じく外側 catch に伝播させ
 * `{ success: false, error }` を返す（静かなフォールバックは行わない）。
 */
export async function getGradesConfigForWeb(args, env, user) {
  try {
    await ensureGradesConfigInit_(env);

    // テスト名
    const testNames = await getTestNamesConfig_(env);

    // 校舎（GAS と同じく dict 化せず配列のまま返す）
    const campusConfig = await readCampusConfigArray_(env);

    // 学年（GRADES 定数から全 12 学年を数値順でソート）
    const allGrades = Object.keys(GRADES)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((code) => ({ code, name: GRADES[code] }));

    // 表示学年フィルター（未設定時は全学年を表示・初回デプロイ互換）
    const visibleRaw = await readKv_(env, KEY_GRADE_VISIBLE);
    let visibleCodes = null;
    if (visibleRaw) {
      try { visibleCodes = JSON.parse(visibleRaw); } catch (e) { visibleCodes = null; }
    }
    const grades = visibleCodes
      ? allGrades.filter((g) => visibleCodes.indexOf(g.code) !== -1)
      : allGrades;

    // スタッフ一覧（校舎責任者選択用）
    const staffRows = await supabaseSelect(env, 'staffs', 'select=display_name,name') || [];
    const staffNames = staffRows
      .map((r) => r.display_name || r.name || '')
      .filter((n) => n)
      .sort((a, b) => a.localeCompare(b, 'ja'));

    // 志望校
    const schools = await getSchoolConfig_(env);

    return {
      success: true,
      testNames,
      campuses: campusConfig,
      grades,
      allGrades,
      visibleGradeCodes: visibleCodes || allGrades.map((g) => g.code),
      schools,
      staffNames
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
