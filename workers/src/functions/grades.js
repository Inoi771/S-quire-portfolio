// grades.js 成績マスタ設定の Workers ポート
//
// Phase 5-E-9b-1（分割実行・その1）
//   - 実装済み：
//       G14 updateGradeAnalysisSigmaConfig    (書込・σ)
//       G15 resetGradeAnalysisSigmaConfig     (書込・σ)
//       G23 getGradeAnalysisSigmaConfig       (読取・σ)
//       G16 getCampusConfigForWeb             (読取・校舎)
//       getCampusConfig_（private）           (G20 相当)
//       ensureGradesConfigInit_（private）    (G3 相当)
//
// 以降のサブセッションで追加予定（残り 15 件）：
//   G4-G13 grades CRUD（テスト名・志望校・校舎の 10 件）
//   G17    getGradesConfigForWeb  （Supabase 併用）
//   G18    getTestNamesConfig_    （private）
//   G19    getSchoolConfig_       （private）
//   G21    getCampusDetailsConfig_（private）
//
// インライン展開/定数化（Workers では独立定義しない）:
//   G1  getScriptProperty         → `env.KV.get('prop:' + key) ?? ''`
//   G2  setScriptProperty         → `env.KV.put('prop:' + key, value)`
//   G3  initializeGradesConfig    → `ensureGradesConfigInit_` に集約
//   G22 getGradeConfig            → モジュール定数 `GRADES`

import { isAdminUser } from './auth.js';

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
