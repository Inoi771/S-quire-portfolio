// students 関連ハンドラー（GAS students.js の Workers ポート）
import { supabaseSelect, supabaseRpc } from '../supabase.js';

// GAS getCurrentFiscalYear() と同一ロジック（4月起算）
// GAS は JST サーバーで動くため、Workers(UTC) では +9h 補正する
function getCurrentFiscalYearJST() {
  const jstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year  = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth() + 1; // 1-12
  return month >= 4 ? year : year - 1;
}

// GAS makeSchoolAveDocId_() と同一ロジック
function makeSchoolAveDocId(year, testName) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(year) + '_' + safe;
}

// GAS toStudentCamel_() と同一マッピング（snake_case → camelCase）
function studentFromSupabase(row) {
  return {
    id:                row.id,
    studentId:         row.student_id || row.id,
    campus:            String(row.campus || '').padStart(2, '0'),
    registrationYear:  row.registration_year,
    registrationGrade: row.registration_grade,
    sei:               row.sei             || '',
    mei:               row.mei             || '',
    seiFurigana:       row.sei_furigana    || '',
    meiFurigana:       row.mei_furigana    || '',
    schoolName:        row.school_name     || '',
    isDeleted:         row.is_deleted,
    createdAt:         row.created_at      || '',
    jukoukou1:         row.jukoukou1          || '',
    jukoukou1_gakka:   row.jukoukou1_gakka    || '',
    jukoukou1_gokaku:  row.jukoukou1_gokaku   || '',
    ikusei:            row.ikusei              || '',
    jukoukou2:         row.jukoukou2          || '',
    jukoukou2_gakka:   row.jukoukou2_gakka    || '',
    jukoukou2_gokaku:  row.jukoukou2_gokaku   || ''
  };
}

/**
 * getMasterData — GAS getMasterData(year) の Workers 版
 * GAS 版との差分:
 *   - プロセス内メモリキャッシュなし（リクエストごとに実行のため不要）
 *   - 戻り値は plain Array（{ success } ラッパーなし — GAS と同一形式）
 *   - 学年フィルター: currentGrade < 7 || > 18 を除外（GAS と同一）
 */
export async function getMasterData(args, env, user) {
  const year = parseInt(args && args[0], 10);
  if (isNaN(year)) return [];

  try {
    const rows = await supabaseSelect(env, 'students', 'is_deleted=eq.false');
    const results = [];

    for (const row of rows) {
      const doc = studentFromSupabase(row);
      const studentId = String(doc.studentId || '').trim();
      if (!studentId || studentId.length < 10) continue;

      const registrationYear  = parseInt(studentId.substring(2, 6), 10);
      const registrationGrade = parseInt(studentId.substring(6, 8), 10);
      if (isNaN(registrationYear) || isNaN(registrationGrade)) continue;

      const currentGrade = registrationGrade + (year - registrationYear);
      if (currentGrade < 7 || currentGrade > 18) continue;

      const sei         = String(doc.sei         || '');
      const mei         = String(doc.mei         || '');
      const seiFurigana = String(doc.seiFurigana || '');
      const meiFurigana = String(doc.meiFurigana || '');
      const campus      = String(doc.campus      || '').padStart(2, '0');

      results.push({
        studentId,
        campus,
        grade:          String(currentGrade).padStart(2, '0'),
        sei,
        mei,
        name:           sei + mei,
        seiFurigana,
        meiFurigana,
        furigana:       seiFurigana + meiFurigana,
        schoolName:     String(doc.schoolName || ''),
        registeredDate: doc.createdAt || new Date().toISOString()
      });
    }

    return results;
  } catch (error) {
    console.error('getMasterData error:', error);
    return [];
  }
}

/**
 * getGradesYearFolders — GAS getGradesYearFolders() の Workers 版
 * GAS 版との差分: getCurrentFiscalYear() を JST 補正版に置き換え
 */
export async function getGradesYearFolders(args, env, user) {
  try {
    const currentFy = getCurrentFiscalYearJST();
    const dbYears = await supabaseRpc(env, 'get_grades_years');
    const yearSet = {};
    if (Array.isArray(dbYears)) {
      dbYears.forEach(y => { yearSet[String(y)] = true; });
    }
    yearSet[String(currentFy)] = true;
    const years = Object.keys(yearSet)
      .filter(y => /^\d{4}$/.test(y))
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    return { success: true, years };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getSchoolAverages — GAS getSchoolAverages(year, testName) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック）
 */
export async function getSchoolAverages(args, env, user) {
  const year     = parseInt(args && args[0], 10);
  const testName = String((args && args[1]) || '').trim();
  try {
    const docId = makeSchoolAveDocId(year, testName);
    const rows = await supabaseSelect(env, 'school_averages',
      'id=eq.' + encodeURIComponent(docId));
    if (!rows || rows.length === 0 || !rows[0].averages) {
      return { success: true, averages: [] };
    }
    let averages = rows[0].averages;
    if (typeof averages === 'string') averages = JSON.parse(averages);
    return { success: true, averages };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
