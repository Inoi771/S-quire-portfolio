
// ========================================
// 【migrate.js】Firestore 移行スクリプト
// ========================================
// スプレッドシートのデータを Firestore へ一括移行するためのユーティリティ
// 移行完了後もロールバック用に削除しないこと
//
// 実行順序（Admin スクリプトエディタから手動実行）:
//   Phase 2: migrateStudentsToFirestore()
//   Phase 3: migrateAllGradeDataToFirestore()  ← 全成績関連データを一括移行
//     内部で以下を順に実行:
//       migrateGradesToFirestore()         成績一覧 → grades
//       migrateSchoolAveragesToFirestore() 学校別平均点 → schoolAverages
//       migrateTestAnalysisToFirestore()   AI分析 → testAnalysis
//       migrateStudentAnalysisToFirestore() 生徒別AI分析 → studentAnalysis
// ========================================

// ========================================
// Phase 2: 生徒マスタ移行
// ========================================

/**
 * スプレッドシートの生徒マスタを Firestore へ一括移行する
 * 「students」コレクションに各生徒を upsert する（べき等・再実行可能）
 * Admin のみ実行可能
 * @return {Object} { success, total, savedCount, skippedCount, errors }
 */
function migrateStudentsToFirestore() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  Logger.log('=== migrateStudentsToFirestore 開始 ===');

  try {
    var ss = getStudentMasterSpreadsheet();
    if (!ss) return { success: false, error: '生徒マスタスプレッドシートが見つかりません' };

    var sheet = ss.getSheetByName('生徒一覧');
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('⚠ 生徒マスタにデータがありません');
      return { success: true, total: 0, savedCount: 0, skippedCount: 0, errors: [] };
    }

    // 列構成:
    //   [0] 生徒ID  [1] 校舎CD  [2] 姓  [3] 名  [4] 姓ふりがな  [5] 名ふりがな
    //   [6] 学校名  [7] 削除済み  [8] 登録日時
    //   [9] 受験校1  [10] 受験校1学科  [11] 受験校1合否  [12] 育成型推薦
    //   [13] 受験校2  [14] 受験校2学科  [15] 受験校2合否
    var lastRow = sheet.getLastRow();
    var numCols = Math.min(sheet.getLastColumn(), 16);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    var writes = [];
    var skippedCount = 0;
    var errors = [];

    rows.forEach(function(row, idx) {
      try {
        var studentId = String(row[0] || '').trim();
        // Google Sheets が先頭ゼロを数値変換した場合に補完
        if (studentId && /^\d+$/.test(studentId) && studentId.length < 10) {
          studentId = studentId.padStart(10, '0');
        }
        if (!studentId || studentId.length < 10) {
          skippedCount++;
          Logger.log('⚠ 行' + (idx + 2) + ': 生徒IDが不正のためスキップ: "' + row[0] + '"');
          return;
        }

        // IDから登録年度・登録学年を抽出
        var registrationYear  = parseInt(studentId.substring(2, 6), 10);
        var registrationGrade = parseInt(studentId.substring(6, 8), 10);
        if (isNaN(registrationYear) || isNaN(registrationGrade)) {
          skippedCount++;
          errors.push('行' + (idx + 2) + ': 年度/学年コードが不正: ' + studentId);
          return;
        }

        var campus = String(row[1] || '').trim();
        if (campus && /^\d+$/.test(campus) && campus.length < 2) {
          campus = campus.padStart(2, '0');
        }

        var isDeleted = (row[7] === true || row[7] === 'TRUE' || row[7] === true);

        var createdAt;
        try {
          createdAt = row[8] ? new Date(row[8]).toISOString() : new Date().toISOString();
        } catch (e) {
          createdAt = new Date().toISOString();
        }

        var data = {
          studentId:         studentId,
          campus:            campus,
          sei:               String(row[2] || '').trim(),
          mei:               String(row[3] || '').trim(),
          seiFurigana:       String(row[4] || '').trim(),
          meiFurigana:       String(row[5] || '').trim(),
          schoolName:        String(row[6] || '').trim(),
          isDeleted:         !!isDeleted,
          createdAt:         createdAt,
          registrationYear:  registrationYear,
          registrationGrade: registrationGrade
        };

        // 受験情報（列10〜16）が存在する場合は追加（中3生）
        if (numCols >= 10 && (row[9] || row[11] || row[13])) {
          if (row[9])  data.jukoukou1        = String(row[9]).trim();
          if (row[10]) data.jukoukou1_gakka  = String(row[10]).trim();
          if (row[11]) data.jukoukou1_gokaku = String(row[11]).trim();
          if (numCols >= 13 && row[12] !== '' && row[12] !== undefined) {
            data.ikusei = (row[12] === true || row[12] === 'TRUE' || row[12] === 'true') ? 'true' : 'false';
          }
          if (numCols >= 14 && row[13]) data.jukoukou2        = String(row[13]).trim();
          if (numCols >= 15 && row[14]) data.jukoukou2_gakka  = String(row[14]).trim();
          if (numCols >= 16 && row[15]) data.jukoukou2_gokaku = String(row[15]).trim();
        }

        writes.push({ collection: 'students', docId: studentId, data: data });
      } catch (rowErr) {
        skippedCount++;
        errors.push('行' + (idx + 2) + ': ' + rowErr.toString());
      }
    });

    if (writes.length === 0) {
      Logger.log('⚠ 移行対象データが 0 件です');
      return { success: true, total: rows.length, savedCount: 0, skippedCount: skippedCount, errors: errors };
    }

    var result = firestoreBatchWrite_(writes);

    Logger.log('=== migrateStudentsToFirestore 完了 ===');
    Logger.log('total: ' + rows.length + ', saved: ' + writes.length + ', skipped: ' + skippedCount);

    return {
      success:      result.success,
      total:        rows.length,
      savedCount:   writes.length,
      skippedCount: skippedCount,
      errors:       errors.concat(result.errors || [])
    };
  } catch (error) {
    Logger.log('❌ migrateStudentsToFirestoreエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// Phase 3: 成績データ移行
// ========================================

/**
 * 全年度の成績データを Firestore へ一括移行する
 * 「grades」コレクションへ upsert する（べき等・再実行可能）
 * ドキュメントID: {studentId}_{testName}_{fiscalYear}
 * Admin のみ実行可能
 * @return {Object} { success, totalYears, totalRows, savedCount, skippedCount, errors }
 */
function migrateGradesToFirestore() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  Logger.log('=== migrateGradesToFirestore 開始 ===');

  try {
    var yearResult = getGradesYearFolders();
    if (!yearResult.success || !yearResult.years || yearResult.years.length === 0) {
      Logger.log('⚠ 成績年度フォルダが見つかりません');
      return { success: true, totalYears: 0, totalRows: 0, savedCount: 0, skippedCount: 0, errors: [] };
    }

    var totalRows    = 0;
    var savedCount   = 0;
    var skippedCount = 0;
    var errors       = [];

    yearResult.years.forEach(function(year) {
      Logger.log('--- 年度 ' + year + ' の成績を移行中 ---');
      var result = migrateGradesForYear_(parseInt(year, 10));
      totalRows    += result.totalRows    || 0;
      savedCount   += result.savedCount   || 0;
      skippedCount += result.skippedCount || 0;
      if (result.errors && result.errors.length > 0) {
        errors = errors.concat(result.errors.map(function(e) { return year + '年度: ' + e; }));
      }
      // 年度間にレート制限対策のウェイト
      Utilities.sleep(500);
    });

    Logger.log('=== migrateGradesToFirestore 完了 ===');
    Logger.log('totalYears: ' + yearResult.years.length + ', totalRows: ' + totalRows + ', saved: ' + savedCount);

    return {
      success:     errors.length === 0,
      totalYears:  yearResult.years.length,
      totalRows:   totalRows,
      savedCount:  savedCount,
      skippedCount: skippedCount,
      errors:      errors
    };
  } catch (error) {
    Logger.log('❌ migrateGradesToFirestoreエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定年度の成績データを Firestore へ移行する（内部ヘルパー）
 * @param {number} year 学年年度
 * @return {Object} { totalRows, savedCount, skippedCount, errors }
 */
function migrateGradesForYear_(year) {
  try {
    var ss = getGradeDataSheet(year);
    if (!ss) {
      Logger.log('⚠ ' + year + '年度の成績シートが見つかりません');
      return { totalRows: 0, savedCount: 0, skippedCount: 0, errors: [] };
    }

    var sheet = ss.getSheetByName('成績一覧');
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('⚠ ' + year + '年度: データが0件');
      return { totalRows: 0, savedCount: 0, skippedCount: 0, errors: [] };
    }

    // 列構成（旧コード実装に基づく実際の順序）:
    //   [0] 生徒ID  [1] テスト名  [2] 国語  [3] 社会  [4] 数学  [5] 理科  [6] 英語
    //   [7] 合計点  [8] 平均点  [9] 第1志望校  [10] 志望1学科  [11] 第2志望校
    //   [12] 志望2学科  [13] 記録日時  [14] 氏名
    var lastRow = sheet.getLastRow();
    var numCols = Math.min(sheet.getLastColumn(), 15);
    var rows = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    var writes  = [];
    var skipped = 0;
    var errs    = [];

    rows.forEach(function(row, idx) {
      try {
        var studentId = String(row[0] || '').trim();
        if (studentId && /^\d+$/.test(studentId) && studentId.length < 10) {
          studentId = studentId.padStart(10, '0');
        }
        var testName = String(row[1] || '').trim();

        if (!studentId || studentId.length < 3 || !testName) {
          skipped++;
          return;
        }

        // ドキュメントID: studentId_testName_year（テスト名にスラッシュ等が含まれる場合を考慮してエスケープ）
        var safeTestName = testName.replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
        var docId = studentId + '_' + safeTestName + '_' + year;

        var recordedAt;
        try {
          recordedAt = row[13] ? new Date(row[13]).toISOString() : new Date().toISOString();
        } catch (e) {
          recordedAt = new Date().toISOString();
        }

        var data = {
          studentId:   studentId,
          testName:    testName,
          fiscalYear:  year,
          kokugo:      (row[2] !== '' && row[2] !== null && row[2] !== undefined) ? Number(row[2]) : null,
          shakai:      (row[3] !== '' && row[3] !== null && row[3] !== undefined) ? Number(row[3]) : null,
          sugaku:      (row[4] !== '' && row[4] !== null && row[4] !== undefined) ? Number(row[4]) : null,
          rika:        (row[5] !== '' && row[5] !== null && row[5] !== undefined) ? Number(row[5]) : null,
          eigo:        (row[6] !== '' && row[6] !== null && row[6] !== undefined) ? Number(row[6]) : null,
          total:       (row[7] !== '' && row[7] !== null && row[7] !== undefined) ? Number(row[7]) : null,
          average:     (row[8] !== '' && row[8] !== null && row[8] !== undefined) ? Number(row[8]) : null,
          shogaku1:       String(row[9]  || '').trim(),
          shogaku1_gakka: String(row[10] || '').trim(),
          shogaku2:       String(row[11] || '').trim(),
          shogaku2_gakka: String(row[12] || '').trim(),
          recordedAt:     recordedAt,
          studentName:    numCols >= 15 ? String(row[14] || '').trim() : ''
        };

        writes.push({ collection: 'grades', docId: docId, data: data });
      } catch (rowErr) {
        skipped++;
        errs.push('行' + (idx + 2) + ': ' + rowErr.toString());
      }
    });

    if (writes.length === 0) {
      return { totalRows: rows.length, savedCount: 0, skippedCount: skipped, errors: errs };
    }

    var result = firestoreBatchWrite_(writes);
    return {
      totalRows:   rows.length,
      savedCount:  writes.length,
      skippedCount: skipped,
      errors:      errs.concat(result.errors || [])
    };
  } catch (error) {
    Logger.log('❌ migrateGradesForYear_(' + year + ')エラー: ' + error);
    return { totalRows: 0, savedCount: 0, skippedCount: 0, errors: [error.toString()] };
  }
}

// ========================================
// 移行検証ユーティリティ
// ========================================

/**
 * Firestore の生徒数をカウントして移行状況を確認する
 * Admin のみ実行可能
 * @return {Object} { success, firestoreCount, spreadsheetCount, message }
 */
function verifyStudentMigration() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  try {
    // Firestoreの件数（isDeleted問わず全件）
    var fsStudents = firestoreQuery_('students');
    var fsCount    = fsStudents.length;

    // スプレッドシートの件数
    var ss    = getStudentMasterSpreadsheet();
    var ssCount = 0;
    if (ss) {
      var sheet = ss.getSheetByName('生徒一覧');
      if (sheet && sheet.getLastRow() >= 2) {
        ssCount = sheet.getLastRow() - 1;
      }
    }

    var message = 'Firestore: ' + fsCount + '件 / スプレッドシート: ' + ssCount + '件';
    Logger.log('✓ verifyStudentMigration: ' + message);
    return { success: true, firestoreCount: fsCount, spreadsheetCount: ssCount, message: message };
  } catch (e) {
    Logger.log('❌ verifyStudentMigrationエラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Firestore の成績データ件数をカウントして移行状況を確認する
 * Admin のみ実行可能
 * @return {Object} { success, firestoreCount, message }
 */
function verifyGradesMigration() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  try {
    var fsGrades = firestoreQuery_('grades');
    var fsCount  = fsGrades.length;
    var message  = 'Firestore grades コレクション: ' + fsCount + '件';
    Logger.log('✓ verifyGradesMigration: ' + message);
    return { success: true, firestoreCount: fsCount, message: message };
  } catch (e) {
    Logger.log('❌ verifyGradesMigrationエラー: ' + e);
    return { success: false, error: e.toString() };
  }
}

// ========================================
// Phase 3-B: 学校別平均点移行
// ========================================

/**
 * 全年度の「学校別平均点」シートを Firestore「schoolAverages」コレクションへ移行
 * べき等・再実行可能（同じ docId で上書き）
 * Admin のみ実行可能
 * @return {Object} { success, totalYears, savedDocs, errors }
 */
function migrateSchoolAveragesToFirestore() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  Logger.log('=== migrateSchoolAveragesToFirestore 開始 ===');

  try {
    var yearResult = getGradesYearFolders();
    if (!yearResult.success || !yearResult.years || yearResult.years.length === 0) {
      Logger.log('⚠ 成績年度フォルダが見つかりません');
      return { success: true, totalYears: 0, savedDocs: 0, errors: [] };
    }

    var savedDocs = 0;
    var errors    = [];

    yearResult.years.forEach(function(year) {
      Logger.log('--- 年度 ' + year + ' の学校別平均点を移行中 ---');
      try {
        var ss = getGradeDataSheet(parseInt(year, 10));
        if (!ss) { Logger.log('⚠ ' + year + '年度シートなし'); return; }

        var sheet = ss.getSheetByName('学校別平均点');
        if (!sheet || sheet.getLastRow() < 2) {
          Logger.log('⚠ ' + year + '年度: 学校別平均点シートが空または存在しない');
          return;
        }

        // 列: [0]テスト名 [1]学校名 [2]国語 [3]社会 [4]数学 [5]理科 [6]英語 [7]合計 [8]更新日時
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();

        // テスト名ごとにグループ化
        var testMap = {};
        rows.forEach(function(row) {
          var testName  = String(row[0] || '').trim();
          var schoolName = String(row[1] || '').trim();
          if (!testName || !schoolName) return;

          if (!testMap[testName]) testMap[testName] = { entries: [], updatedAt: '' };

          testMap[testName].entries.push({
            schoolName: schoolName,
            kokugo: (row[2] !== '' && row[2] !== null) ? Number(row[2]) : null,
            shakai: (row[3] !== '' && row[3] !== null) ? Number(row[3]) : null,
            sugaku: (row[4] !== '' && row[4] !== null) ? Number(row[4]) : null,
            rika:   (row[5] !== '' && row[5] !== null) ? Number(row[5]) : null,
            eigo:   (row[6] !== '' && row[6] !== null) ? Number(row[6]) : null,
            total:  (row[7] !== '' && row[7] !== null) ? Number(row[7]) : null
          });

          // 更新日時は行ごとに異なる可能性があるが最新行を使う
          if (row[8]) {
            try {
              testMap[testName].updatedAt = new Date(row[8]).toISOString();
            } catch (e) {}
          }
        });

        var writes = [];
        Object.keys(testMap).forEach(function(testName) {
          var safe  = testName.replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
          var docId = String(year) + '_' + safe;
          writes.push({
            collection: 'schoolAverages',
            docId: docId,
            data: {
              year:      parseInt(year, 10),
              testName:  testName,
              updatedAt: testMap[testName].updatedAt || new Date().toISOString(),
              averages:  testMap[testName].entries
            }
          });
        });

        if (writes.length > 0) {
          var result = firestoreBatchWrite_(writes);
          savedDocs += writes.length;
          if (result.errors && result.errors.length > 0) {
            errors = errors.concat(result.errors.map(function(e) { return year + '年度: ' + e; }));
          }
          Logger.log('✓ ' + year + '年度: ' + writes.length + '件の学校別平均点を保存');
        }
      } catch (e) {
        Logger.log('❌ ' + year + '年度の学校別平均点移行エラー: ' + e);
        errors.push(year + '年度: ' + e.toString());
      }
    });

    Logger.log('=== migrateSchoolAveragesToFirestore 完了: ' + savedDocs + '件 ===');
    return { success: errors.length === 0, totalYears: yearResult.years.length, savedDocs: savedDocs, errors: errors };
  } catch (error) {
    Logger.log('❌ migrateSchoolAveragesToFirestoreエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// Phase 3-C: テスト全体AI分析移行
// ========================================

/**
 * 全年度の「AI分析」シートを Firestore「testAnalysis」コレクションへ移行
 * べき等・再実行可能（同じ docId で上書き）
 * Admin のみ実行可能
 * @return {Object} { success, totalYears, savedDocs, errors }
 */
function migrateTestAnalysisToFirestore() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  Logger.log('=== migrateTestAnalysisToFirestore 開始 ===');

  try {
    var yearResult = getGradesYearFolders();
    if (!yearResult.success || !yearResult.years || yearResult.years.length === 0) {
      return { success: true, totalYears: 0, savedDocs: 0, errors: [] };
    }

    var savedDocs = 0;
    var errors    = [];

    yearResult.years.forEach(function(year) {
      try {
        var ss = getGradeDataSheet(parseInt(year, 10));
        if (!ss) return;

        var sheet = ss.getSheetByName('AI分析');
        if (!sheet || sheet.getLastRow() < 2) {
          Logger.log('⚠ ' + year + '年度: AI分析シートが空または存在しない');
          return;
        }

        // 列: [0]テスト名 [1]分析コメントJSON [2]生成日時
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
        var writes = [];

        rows.forEach(function(row) {
          var testName    = String(row[0] || '').trim();
          var analysisRaw = String(row[1] || '').trim();
          var generatedAt = row[2] ? String(row[2]) : new Date().toISOString();
          if (!testName || !analysisRaw) return;

          // 既に有効な JSON か確認
          try { JSON.parse(analysisRaw); } catch (e) { return; }

          var safe  = testName.replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
          var docId = String(year) + '_' + safe;
          writes.push({
            collection: 'testAnalysis',
            docId: docId,
            data: {
              year:         parseInt(year, 10),
              testName:     testName,
              analysisJson: analysisRaw,
              generatedAt:  generatedAt
            }
          });
        });

        if (writes.length > 0) {
          var result = firestoreBatchWrite_(writes);
          savedDocs += writes.length;
          if (result.errors && result.errors.length > 0) {
            errors = errors.concat(result.errors.map(function(e) { return year + '年度: ' + e; }));
          }
          Logger.log('✓ ' + year + '年度: ' + writes.length + '件のAI分析を保存');
        }
      } catch (e) {
        Logger.log('❌ ' + year + '年度のAI分析移行エラー: ' + e);
        errors.push(year + '年度: ' + e.toString());
      }
    });

    Logger.log('=== migrateTestAnalysisToFirestore 完了: ' + savedDocs + '件 ===');
    return { success: errors.length === 0, totalYears: yearResult.years.length, savedDocs: savedDocs, errors: errors };
  } catch (error) {
    Logger.log('❌ migrateTestAnalysisToFirestoreエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// Phase 3-D: 生徒別AI分析移行
// ========================================

/**
 * 全年度の「生徒別AI分析」シートを Firestore「studentAnalysis」コレクションへ移行
 * べき等・再実行可能（同じ docId で上書き）
 * Admin のみ実行可能
 * @return {Object} { success, totalYears, savedDocs, errors }
 */
function migrateStudentAnalysisToFirestore() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  Logger.log('=== migrateStudentAnalysisToFirestore 開始 ===');

  try {
    var yearResult = getGradesYearFolders();
    if (!yearResult.success || !yearResult.years || yearResult.years.length === 0) {
      return { success: true, totalYears: 0, savedDocs: 0, errors: [] };
    }

    var savedDocs = 0;
    var errors    = [];

    yearResult.years.forEach(function(year) {
      try {
        var ss = getGradeDataSheet(parseInt(year, 10));
        if (!ss) return;

        var sheet = ss.getSheetByName('生徒別AI分析');
        if (!sheet || sheet.getLastRow() < 2) {
          Logger.log('⚠ ' + year + '年度: 生徒別AI分析シートが空または存在しない');
          return;
        }

        // 列: [0]生徒ID [1]テスト名 [2]分析データJSON [3]生成日時
        var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
        var writes = [];

        rows.forEach(function(row) {
          var sid         = String(row[0] || '').trim();
          var testName    = String(row[1] || '').trim();
          var analysisRaw = String(row[2] || '').trim();
          var generatedAt = row[3] ? String(row[3]) : new Date().toISOString();
          if (!sid || !testName || !analysisRaw) return;

          // 先頭ゼロを補完
          if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

          // 既に有効な JSON か確認
          try { JSON.parse(analysisRaw); } catch (e) { return; }

          var safe  = testName.replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
          var docId = sid + '_' + safe + '_' + String(year);
          writes.push({
            collection: 'studentAnalysis',
            docId: docId,
            data: {
              studentId:    sid,
              testName:     testName,
              year:         parseInt(year, 10),
              analysisJson: analysisRaw,
              generatedAt:  generatedAt
            }
          });
        });

        if (writes.length === 0) return;

        // バッチサイズを 400 に分割（Firestore 書き込み上限対策）
        var BATCH = 400;
        for (var i = 0; i < writes.length; i += BATCH) {
          var chunk  = writes.slice(i, i + BATCH);
          var result = firestoreBatchWrite_(chunk);
          savedDocs += chunk.length;
          if (result.errors && result.errors.length > 0) {
            errors = errors.concat(result.errors.map(function(e) { return year + '年度: ' + e; }));
          }
          if (i + BATCH < writes.length) Utilities.sleep(500);
        }
        Logger.log('✓ ' + year + '年度: ' + writes.length + '件の生徒別AI分析を保存');
      } catch (e) {
        Logger.log('❌ ' + year + '年度の生徒別AI分析移行エラー: ' + e);
        errors.push(year + '年度: ' + e.toString());
      }
    });

    Logger.log('=== migrateStudentAnalysisToFirestore 完了: ' + savedDocs + '件 ===');
    return { success: errors.length === 0, totalYears: yearResult.years.length, savedDocs: savedDocs, errors: errors };
  } catch (error) {
    Logger.log('❌ migrateStudentAnalysisToFirestoreエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 一括実行（Phase 3 全体）
// ========================================

/**
 * 成績関連の全シートを Firestore へ一括移行する（べき等・再実行可能）
 * 実行順: 成績一覧 → 学校別平均点 → AI分析 → 生徒別AI分析
 * Admin のみ実行可能
 * @return {Object} { success, grades, schoolAverages, testAnalysis, studentAnalysis }
 */
function migrateAllGradeDataToFirestore() {
  if (!isAdmin()) return { success: false, error: 'Admin のみ実行可能' };

  Logger.log('========================================');
  Logger.log('=== migrateAllGradeDataToFirestore 開始 ===');
  Logger.log('========================================');

  var grades         = migrateGradesToFirestore();
  Logger.log('--- 成績一覧完了 ---');

  var schoolAverages = migrateSchoolAveragesToFirestore();
  Logger.log('--- 学校別平均点完了 ---');

  var testAnalysis   = migrateTestAnalysisToFirestore();
  Logger.log('--- AI分析完了 ---');

  var studentAnalysis = migrateStudentAnalysisToFirestore();
  Logger.log('--- 生徒別AI分析完了 ---');

  var allOk = grades.success && schoolAverages.success && testAnalysis.success && studentAnalysis.success;

  Logger.log('========================================');
  Logger.log('=== migrateAllGradeDataToFirestore 完了: ' + (allOk ? 'OK' : 'エラーあり') + ' ===');
  Logger.log('========================================');

  return {
    success:        allOk,
    grades:         grades,
    schoolAverages: schoolAverages,
    testAnalysis:   testAnalysis,
    studentAnalysis: studentAnalysis
  };
}
