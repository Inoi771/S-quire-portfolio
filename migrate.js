
// ========================================
// 【migrate.js】Firestore 移行スクリプト
// ========================================
// スプレッドシートのデータを Firestore へ一括移行するためのユーティリティ
// 移行完了後もロールバック用に削除しないこと
//
// 実行順序（Admin スクリプトエディタから手動実行）:
//   Phase 2: migrateStudentsToFirestore()
//   Phase 3: migrateGradesToFirestore()
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

    // 列構成:
    //   [0] 生徒ID  [1] テスト名  [2] 国語  [3] 社会  [4] 数学  [5] 理科  [6] 英語
    //   [7] 合計点  [8] 平均点  [9] 第1志望校  [10] 第2志望校  [11] 記録日時
    //   [12] 志望1学科  [13] 志望2学科  [14] 氏名
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
          recordedAt = row[11] ? new Date(row[11]).toISOString() : new Date().toISOString();
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
          shogaku2:       String(row[10] || '').trim(),
          recordedAt:     recordedAt,
          shogaku1_gakka: numCols >= 13 ? String(row[12] || '').trim() : '',
          shogaku2_gakka: numCols >= 14 ? String(row[13] || '').trim() : '',
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
