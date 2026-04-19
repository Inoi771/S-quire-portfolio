// analysis 関連ハンドラー（GAS analysis.js の Workers ポート）
import { supabaseSelect } from '../supabase.js';

// GAS makeTestAnalysisDocId_() と同一ロジック
function makeDocId(year, testName) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(year) + '_' + safe;
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
