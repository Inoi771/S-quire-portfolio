// ========================================
// 【migrate-to-supabase.js】Firestore → Supabase データ移行スクリプト
// ========================================
// 実行方法: GASエディタで migrateGradesToSupabase() を手動実行
// ※ 一度だけ実行すること。冪等（再実行しても既存データを上書き）

/**
 * Firestore の grades コレクション全件を Supabase の grades テーブルに移行する
 * @return {Object} { success, total, errors }
 */
function migrateGradesToSupabase() {
  Logger.log('=== grades 移行開始 ===');

  var allData = [];

  // Firestore の grades コレクションから全データを一括取得（移行元）
  try {
    var docs = firestoreQuery_('grades', []);
    Logger.log('Firestoreから ' + docs.length + '件の成績データを取得');

    docs.forEach(function(doc) {
      var sid = String(doc.studentId || '').trim();
      if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
      var yr = parseInt(doc.fiscalYear, 10) || 0;

      var testName = String(doc.testName || '').trim();
      var safe = testName.replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
      var docId = sid + '_' + safe + '_' + String(yr);

      allData.push({
        id:             docId,
        student_id:     sid,
        test_name:      testName,
        fiscal_year:    yr,
        kokugo:         doc.kokugo  || 0,
        shakai:         doc.shakai  || 0,
        sugaku:         doc.sugaku  || 0,
        rika:           doc.rika    || 0,
        eigo:           doc.eigo    || 0,
        total:          doc.total   || 0,
        average:        doc.average || 0,
        shogaku1:       String(doc.shogaku1       || ''),
        shogaku1_gakka: String(doc.shogaku1_gakka || ''),
        shogaku2:       String(doc.shogaku2       || ''),
        shogaku2_gakka: String(doc.shogaku2_gakka || ''),
        student_name:   String(doc.studentName    || ''),
        recorded_at:    doc.recordedAt || new Date().toISOString(),
        campus:         sid.substring(0, 2)  // 生徒IDの先頭2桁
      });
    });
  } catch (e) {
    Logger.log('❌ Firestore grades 取得エラー: ' + e);
    return { success: false, error: e.toString() };
  }

  Logger.log('合計: ' + allData.length + '件');

  if (allData.length === 0) {
    return { success: true, total: 0, errors: [] };
  }

  var result = supabaseBatchUpsert_('grades', allData);
  Logger.log('=== grades 移行完了: ' + JSON.stringify(result) + ' ===');
  return result;
}

/**
 * Firestore の schoolAverages コレクションを Supabase に移行する
 * @return {Object} { success, total, errors }
 */
function migrateSchoolAveragesToSupabase() {
  Logger.log('=== schoolAverages 移行開始 ===');

  var docs = firestoreQuery_('schoolAverages', []);
  var allData = docs.map(function(doc) {
    return {
      id:         doc._id || (String(doc.year) + '_' + String(doc.testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_')),
      year:       doc.year || 0,
      test_name:  String(doc.testName || ''),
      averages:   doc.averages || [],
      updated_at: doc.updatedAt || new Date().toISOString()
    };
  });

  Logger.log('合計: ' + allData.length + '件');

  if (allData.length === 0) {
    return { success: true, total: 0, errors: [] };
  }

  var result = supabaseBatchUpsert_('school_averages', allData);
  Logger.log('=== schoolAverages 移行完了: ' + JSON.stringify(result) + ' ===');
  return result;
}

/**
 * Firestore の testAnalysis コレクションを Supabase に移行する
 * @return {Object} { success, total, errors }
 */
function migrateTestAnalysisToSupabase() {
  Logger.log('=== testAnalysis 移行開始 ===');

  var docs = firestoreQuery_('testAnalysis', []);
  var allData = docs.map(function(doc) {
    var analysisData = null;
    if (doc.analysisJson) {
      try {
        analysisData = (typeof doc.analysisJson === 'string') ? JSON.parse(doc.analysisJson) : doc.analysisJson;
      } catch (e) {
        analysisData = doc.analysisJson;
      }
    }

    return {
      id:            doc._id || (String(doc.year) + '_' + String(doc.testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_')),
      year:          doc.year || 0,
      test_name:     String(doc.testName || ''),
      analysis_json: analysisData || {},
      generated_at:  doc.generatedAt || new Date().toISOString()
    };
  });

  Logger.log('合計: ' + allData.length + '件');

  if (allData.length === 0) {
    return { success: true, total: 0, errors: [] };
  }

  var result = supabaseBatchUpsert_('test_analysis', allData);
  Logger.log('=== testAnalysis 移行完了: ' + JSON.stringify(result) + ' ===');
  return result;
}

/**
 * Firestore の studentAnalysis コレクションを Supabase に移行する
 * @return {Object} { success, total, errors }
 */
function migrateStudentAnalysisToSupabase() {
  Logger.log('=== studentAnalysis 移行開始 ===');

  var docs = firestoreQuery_('studentAnalysis', []);
  var allData = docs.map(function(doc) {
    var analysisData = null;
    if (doc.analysisJson) {
      try {
        analysisData = (typeof doc.analysisJson === 'string') ? JSON.parse(doc.analysisJson) : doc.analysisJson;
      } catch (e) {
        analysisData = doc.analysisJson;
      }
    }

    var sid = String(doc.studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    return {
      id:            doc._id || (sid + '_' + String(doc.testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_') + '_' + String(doc.year)),
      student_id:    sid,
      test_name:     String(doc.testName || ''),
      year:          doc.year || 0,
      analysis_json: analysisData || {},
      generated_at:  doc.generatedAt || new Date().toISOString()
    };
  });

  Logger.log('合計: ' + allData.length + '件');

  if (allData.length === 0) {
    return { success: true, total: 0, errors: [] };
  }

  var result = supabaseBatchUpsert_('student_analysis', allData);
  Logger.log('=== studentAnalysis 移行完了: ' + JSON.stringify(result) + ' ===');
  return result;
}

/**
 * 全コレクションを一括移行する（メインエントリポイント）
 * @return {Object} 各テーブルの移行結果
 */
function migrateAllToSupabase() {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };

  Logger.log('========= Supabase 一括移行開始 =========');

  var results = {
    grades:          migrateGradesToSupabase(),
    schoolAverages:  migrateSchoolAveragesToSupabase(),
    testAnalysis:    migrateTestAnalysisToSupabase(),
    studentAnalysis: migrateStudentAnalysisToSupabase()
  };

  Logger.log('========= Supabase 一括移行完了 =========');
  Logger.log(JSON.stringify(results, null, 2));

  return results;
}
