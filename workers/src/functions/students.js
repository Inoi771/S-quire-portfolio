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

// GAS makeGradeDocId_() と同一ロジック（studentId_safe_year 形式）
// makeStudentAnalysisDocId（analysis.js）とロジックは同一だが、独立した別関数として定義
function makeGradeDocId(studentId, testName, year) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(studentId) + '_' + safe + '_' + String(year);
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

/**
 * getGradeDataByStudentAndTest — GAS getGradeDataByStudentAndTest(year, studentId, testName) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック）
 * args: [year, studentId, testName]
 *
 * 戻り値（GAS 版とバイト単位で一致）:
 *   存在: { success: true, found: true, data: {...} }
 *   不在: { success: true, found: false }
 *   エラー: { success: false, error: "..." }
 *   ※ B-⑩の getStudentAnalysis は exists だが、本関数は found フィールド名
 */
export async function getGradeDataByStudentAndTest(args, env, user) {
  const year      = parseInt(args && args[0], 10);
  const studentId = args && args[1];
  const testName  = args && args[2];

  // studentId 正規化（先頭ゼロ消失バグ対策: GAS students.js:1080-1081 と完全同一）
  let sid = String(studentId || '').trim();
  if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

  try {
    const docId = makeGradeDocId(sid, testName, year);
    const rows = await supabaseSelect(env, 'grades',
      'id=eq.' + encodeURIComponent(docId));
    const doc = (rows && rows.length > 0) ? rows[0] : null;

    if (!doc) return { success: true, found: false };

    return {
      success: true,
      found: true,
      data: {
        kokugo:         doc.kokugo  !== null && doc.kokugo  !== undefined ? doc.kokugo  : '',
        shakai:         doc.shakai  !== null && doc.shakai  !== undefined ? doc.shakai  : '',
        sugaku:         doc.sugaku  !== null && doc.sugaku  !== undefined ? doc.sugaku  : '',
        rika:           doc.rika    !== null && doc.rika    !== undefined ? doc.rika    : '',
        eigo:           doc.eigo    !== null && doc.eigo    !== undefined ? doc.eigo    : '',
        gokei:          doc.total   !== null && doc.total   !== undefined ? doc.total   : '',
        shogaku1:       String(doc.shogaku1       || ''),
        shogaku1_gakka: String(doc.shogaku1_gakka || ''),
        shogaku2:       String(doc.shogaku2       || ''),
        shogaku2_gakka: String(doc.shogaku2_gakka || '')
      }
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getDeletedStudents — GAS getDeletedStudents(campusCode, gradeCode, selectedYear) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック・順序）
 * args: [campusCode, gradeCode, selectedYear]
 *
 * is_deleted=true の生徒を全件取得し、メモリ側で校舎/年度/学年フィルタを適用。
 * ふりがな順（'ja' ロケール）でソートして返す。
 */
export async function getDeletedStudents(args, env, user) {
  const campusCode   = args && args[0];
  const gradeCode    = args && args[1];
  const selectedYear = args && args[2];

  try {
    const rows = await supabaseSelect(env, 'students', 'is_deleted=eq.true');
    const docs = rows.map(studentFromSupabase);
    const students = [];

    docs.forEach(doc => {
      const studentId = String(doc.studentId || '').trim();
      if (!studentId || studentId.length < 10) return;

      const regYear  = parseInt(studentId.substring(2, 6), 10);
      const regGrade = parseInt(studentId.substring(6, 8), 10);

      // 校舎フィルタ
      const rowCampus = String(doc.campus || '').padStart(2, '0');
      if (campusCode && rowCampus !== String(campusCode).padStart(2, '0')) return;

      // 年度フィルタ
      if (selectedYear && regYear !== parseInt(selectedYear, 10)) return;

      // 学年フィルタ（GAS students.js:591-596 と完全同一）
      if (gradeCode && selectedYear) {
        const calcGrade = regGrade + (parseInt(selectedYear, 10) - regYear);
        if (String(calcGrade).padStart(2, '0') !== String(gradeCode).padStart(2, '0')) return;
      } else if (gradeCode && !selectedYear) {
        if (String(regGrade).padStart(2, '0') !== String(gradeCode).padStart(2, '0')) return;
      }

      students.push({
        studentId:         studentId,
        campus:            rowCampus,
        name:              String(doc.sei || '') + String(doc.mei || ''),
        furigana:          String(doc.seiFurigana || '') + String(doc.meiFurigana || ''),
        schoolName:        String(doc.schoolName || ''),
        registrationYear:  regYear,
        registrationGrade: regGrade
      });
    });

    students.sort((a, b) => (a.furigana || '').localeCompare(b.furigana || '', 'ja'));

    return { success: true, students };
  } catch (error) {
    return { success: false, error: error.toString(), students: [] };
  }
}
