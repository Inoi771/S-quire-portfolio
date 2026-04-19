// analysis 関連ハンドラー（GAS analysis.js の Workers ポート）
import { supabaseSelect } from '../supabase.js';

// GAS makeTestAnalysisDocId_() と同一ロジック（year_safe 形式）
function makeDocId(year, testName) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(year) + '_' + safe;
}

// GAS makeStudentAnalysisDocId_() と同一ロジック（studentId_safe_year 形式）
// ※ makeDocId とは引数順・フォーマットが異なるため別関数として定義
function makeStudentAnalysisDocId(studentId, testName, year) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(studentId) + '_' + safe + '_' + String(year);
}

/**
 * getGradeAnalysis — GAS getGradeAnalysis(year, testName) の Workers 版
 * GAS 版との差分: safeJsonParse_() を try-catch に置き換え（同一挙動）
 */
export async function getGradeAnalysis(args, env, user) {
  const year     = parseInt(args && args[0], 10);
  const testName = String((args && args[1]) || '').trim();
  try {
    const docId = makeDocId(year, testName);
    const rows = await supabaseSelect(env, 'test_analysis',
      'id=eq.' + encodeURIComponent(docId));
    if (!rows || rows.length === 0 || !rows[0].analysis_json) {
      return { success: true, exists: false, analysis: null, generatedAt: '' };
    }
    const raw = rows[0].analysis_json;
    let analysis = raw;
    if (typeof raw === 'string') {
      try { analysis = JSON.parse(raw); } catch(e) { analysis = null; }
    }
    if (!analysis) {
      return { success: true, exists: false, analysis: null, generatedAt: '' };
    }
    return { success: true, exists: true, analysis, generatedAt: rows[0].generated_at || '' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getStudentAnalysis — GAS getStudentAnalysis(year, studentId, testName) の Workers 版
 * GAS 版との差分:
 *   - safeJsonParse_() を try-catch に置き換え（同一挙動）
 *   - 基礎学力テストフォールバック処理は GAS と完全同一
 */
export async function getStudentAnalysis(args, env, user) {
  const year      = parseInt(args && args[0], 10);
  const studentId = args && args[1];
  const testName  = args && args[2];

  // studentId 正規化（先頭ゼロ消失バグ対策: GAS 版 analysis.js:756-757 と完全同一）
  let sid = String(studentId || '').trim();
  if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
  const targetTest = String(testName || '').trim();

  try {
    // 完全一致でまず取得
    const docId = makeStudentAnalysisDocId(sid, targetTest, year);
    const rows = await supabaseSelect(env, 'student_analysis',
      'id=eq.' + encodeURIComponent(docId));
    if (rows && rows.length > 0 && rows[0].analysis_json) {
      const raw = rows[0].analysis_json;
      let analysisData = raw;
      if (typeof raw === 'string') {
        try { analysisData = JSON.parse(raw); } catch(e) { analysisData = null; }
      }
      if (analysisData) {
        return { success: true, exists: true, analysis: analysisData, generatedAt: rows[0].generated_at || '' };
      }
    }

    // 基礎学力テストの特例：完全一致がない場合、N回以上のデータにフォールバック
    // GAS 版 analysis.js:770-783 と完全同一ロジック
    const basicMatch = targetTest.match(/^第(\d+)回基礎学力テスト$/);
    if (basicMatch) {
      const targetNum = parseInt(basicMatch[1], 10);
      // 高い回数から順に試みる（第3回 → 第targetNum+1回）
      for (let r = 3; r > targetNum; r--) {
        const fallbackTest  = '第' + r + '回基礎学力テスト';
        const fallbackDocId = makeStudentAnalysisDocId(sid, fallbackTest, year);
        const fbRows = await supabaseSelect(env, 'student_analysis',
          'id=eq.' + encodeURIComponent(fallbackDocId));
        if (fbRows && fbRows.length > 0 && fbRows[0].analysis_json) {
          const fbRaw = fbRows[0].analysis_json;
          let fbData = fbRaw;
          if (typeof fbRaw === 'string') {
            try { fbData = JSON.parse(fbRaw); } catch(e) { fbData = null; }
          }
          if (fbData) {
            return { success: true, exists: true, analysis: fbData, generatedAt: fbRows[0].generated_at || '' };
          }
        }
      }
    }

    return { success: true, exists: false };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
