
// ========================================
// 【セクション8】成績管理（生徒・成績データ）
// ========================================
// 生徒情報登録、成績入力、データ取得・分析

/**
 * 成績管理用フォルダを取得
 * 「成績管理」フォルダへのアクセスポイント
 * @return {Folder|null} 成績管理フォルダ
 */
function getGradesFolder() {
  try {
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return null;
    }
    
    var rootFolder = DriveApp.getFolderById(appFolderId);
    var gradesFolder = getFolderByName(rootFolder, '成績管理');
    
    if (!gradesFolder) {
      Logger.log('❌ 成績管理フォルダが見つかりません');
      return null;
    }
    
    return gradesFolder;
  } catch (error) {
    Logger.log('❌ getGradesFolderエラー: ' + error);
    return null;
  }
}

/**
 * 成績管理フォルダ内の年度フォルダ一覧を取得
 * フォルダ名が4桁数字のものを年度フォルダとして扱い降順で返す
 * @aiCallable
 * @return {Object} { success, years, error }
 */
function getGradesYearFolders() {
  try {
    // Firestore移行済み。grades コレクションから fiscalYear の一覧を返す。
    var docs = firestoreQuery_('grades', []);
    var yearSet = {};
    docs.forEach(function(doc) {
      if (doc.fiscalYear) yearSet[String(doc.fiscalYear)] = true;
    });
    var years = Object.keys(yearSet).filter(function(y) { return /^\d{4}$/.test(y); });
    years.sort(function(a, b) { return parseInt(b, 10) - parseInt(a, 10); });
    return { success: true, years: years };
  } catch (error) {
    Logger.log('❌ getGradesYearFoldersエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 設定用フォルダを取得
 * 「設定」フォルダへのアクセスポイント
 * @return {Folder|null} 設定フォルダ
 */
function getSettingsFolder() {
  try {
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return null;
    }
    
    var rootFolder = DriveApp.getFolderById(appFolderId);
    var settingsFolder = getFolderByName(rootFolder, '設定');
    
    if (!settingsFolder) {
      Logger.log('❌ 設定フォルダが見つかりません');
      return null;
    }
    
    return settingsFolder;
  } catch (error) {
    Logger.log('❌ getSettingsFolderエラー: ' + error);
    return null;
  }
}

/**
 * 現在の学年年度を取得
 * 4月以降は該当年度、1-3月は前年度を返す
 * @return {number} 学年年度（例: 2025）
 */
function getCurrentFiscalYear() {
  try {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth() + 1;  // 1-12
    
    // 4月以降は該当年度、1-3月は前年度
    if (month >= 4) {
      return year;
    } else {
      return year - 1;
    }
  } catch (error) {
    Logger.log('❌ getCurrentFiscalYearエラー: ' + error);
    return new Date().getFullYear();
  }
}

/**
 * 生徒一覧シートから生徒IDで行番号を検索する内部ヘルパー。
 * 【レガシー】migrate.js でのみ使用。Firestore 移行後は不要。
 * Google Sheetsの数値自動変換で先頭ゼロが消えた場合にも正しくマッチするよう padStart で正規化する。
 * @param {Sheet} sheet 生徒一覧シート
 * @param {string} studentId 検索対象の生徒ID（10桁）
 * @return {number} 行番号（1-based）。見つからない場合は -1
 */
function findStudentRowIndex_(sheet, studentId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var sheetId = String(ids[i][0] || '');
    if (sheetId && /^\d+$/.test(sheetId) && sheetId.length < 10) {
      sheetId = sheetId.padStart(10, '0');
    }
    if (sheetId === studentId) return i + 2;
  }
  return -1;
}

/**
 * 生徒マスタスプレッドシートを取得（なければ自動作成）
 * 【レガシー】migrate.js の migrateStudentsToFirestore() からのみ使用する。
 * 通常の生徒マスタ操作は Firestore 経由の関数を使用すること。
 * @return {Spreadsheet|null} スプレッドシート（必ず「生徒一覧」シートあり）
 */
function getStudentMasterSpreadsheet() {
  try {
    var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!rootFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return null;
    }

    // 常に「生徒マスタ/」サブフォルダを確保（キャッシュヒット時も実行してフォルダ存在を保証）
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var masterFolder = getOrCreateTabFolder(rootFolder, '生徒マスタ');

    var ss = null;

    // ① IDがキャッシュされていれば直接開く（最速・最確実）
    var cachedId = PropertiesService.getScriptProperties().getProperty('STUDENT_MASTER_SS_ID');
    if (cachedId) {
      try {
        ss = SpreadsheetApp.openById(cachedId);
      } catch (e) {
        Logger.log('⚠ キャッシュIDが無効なため削除: ' + e);
        PropertiesService.getScriptProperties().deleteProperty('STUDENT_MASTER_SS_ID');
        ss = null;
      }
    }

    if (!ss) {
      // ② 「生徒マスタ/」サブフォルダ内を検索
      var file = getFileByName(masterFolder, '生徒マスタ');

      if (file) {
        PropertiesService.getScriptProperties().setProperty('STUDENT_MASTER_SS_ID', file.getId());
        ss = SpreadsheetApp.openById(file.getId());
      } else {
        // ③ 見つからない場合はサブフォルダ内に新規作成
        Logger.log('⚠ 生徒マスタが見つかりません。新規作成します');
        ss = createStudentMasterSpreadsheet(masterFolder);
        if (ss) {
          PropertiesService.getScriptProperties().setProperty('STUDENT_MASTER_SS_ID', ss.getId());
        }
        return ss;
      }
    }

    // ④ 「生徒一覧」シートが存在しない場合は修復
    if (ss && !ss.getSheetByName('生徒一覧')) {
      Logger.log('⚠ 「生徒一覧」シートが存在しません。修復します');
      var firstSheet = ss.getSheets()[0];
      firstSheet.setName('生徒一覧');
      if (firstSheet.getLastRow() < 1) {
        var headers = ['生徒ID', '校舎CD', '姓', '名', '姓ふりがな', '名ふりがな', '学校名', '削除済み', '登録日時'];
        firstSheet.appendRow(headers);
        firstSheet.getRange(1, 1, 1, headers.length)
          .setFontWeight('bold').setBackground('#667eea').setFontColor('white');
      }
    }

    // ⑤ A列・B列をテキスト形式に設定（先頭ゼロのSheetsによる数値変換を防ぐ）
    var gradeSheet = ss ? ss.getSheetByName('生徒一覧') : null;
    if (gradeSheet) {
      gradeSheet.getRange('A:A').setNumberFormat('@');
      gradeSheet.getRange('B:B').setNumberFormat('@');
    }

    return ss;

  } catch (error) {
    Logger.log('❌ getStudentMasterSpreadsheetエラー: ' + error);
    return null;
  }
}

/**
 * 生徒IDから氏名を取得する（Firestore）
 * @param {string} studentId 生徒ID
 * @return {string} 氏名（見つからない場合は空文字）
 */
function getStudentNameById(studentId) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    if (!sid) return '';

    var doc = firestoreGet_('students', sid);
    if (!doc) return '';
    return String(doc.sei || '') + String(doc.mei || '');
  } catch (e) {
    Logger.log('⚠ getStudentNameByIdエラー: ' + e);
    return '';
  }
}

/**
 * 生徒マスタスプレッドシートを新規作成
 * 「生徒マスタ/」サブフォルダ内に作成する（サブフォルダへの moveTo は動作確認済み）
 * 列構成: 生徒ID | 校舎CD | 姓 | 名 | 姓ふりがな | 名ふりがな | 学校名 | 削除済み | 登録日時
 * @param {Folder} masterFolder 「生徒マスタ/」サブフォルダ
 * @return {Spreadsheet|null} 作成したスプレッドシート
 */
function createStudentMasterSpreadsheet(masterFolder) {
  try {
    var ss = SpreadsheetApp.create('生徒マスタ');
    var file = DriveApp.getFileById(ss.getId());
    file.moveTo(masterFolder);

    var sheet = ss.getSheets()[0];
    sheet.setName('生徒一覧');

    // 生徒IDと校舎CDの列をテキスト形式に設定（先頭ゼロがSheetsで数値変換されないように）
    sheet.getRange('A:A').setNumberFormat('@');
    sheet.getRange('B:B').setNumberFormat('@');

    var headers = ['生徒ID', '校舎CD', '姓', '名', '姓ふりがな', '名ふりがな', '学校名', '削除済み', '登録日時'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#667eea')
      .setFontColor('white');

    sheet.setColumnWidth(1, 130);
    sheet.setColumnWidth(2, 70);
    sheet.setColumnWidth(3, 100);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 130);
    sheet.setColumnWidth(6, 80);
    sheet.setColumnWidth(7, 160);

    return ss;
  } catch (error) {
    Logger.log('❌ createStudentMasterSpreadsheetエラー: ' + error);
    return null;
  }
}

/**
 * 成績データシートを取得
 * @param {number} year 学年年度
 * @return {Spreadsheet|null} スプレッドシート
 */
function getGradeDataSheet(year) {
  try {
    var gradesFolder = getGradesFolder();
    if (!gradesFolder) {
      Logger.log('❌ 成績管理フォルダが取得できません');
      return null;
    }
    
    var yearFolder = getFolderByName(gradesFolder, String(year));
    if (!yearFolder) {
      Logger.log('⚠ ' + year + '年度フォルダが見つかりません');
      return null;
    }
    
    var sheetName = year + '年度_成績データ';
    var file = getFileByName(yearFolder, sheetName);
    
    if (!file) {
      Logger.log('⚠ ' + sheetName + ' が見つかりません');
      return null;
    }
    
    return SpreadsheetApp.openById(file.getId());
  } catch (error) {
    Logger.log('❌ getGradeDataSheetエラー: ' + error);
    return null;
  }
}

/**
 * 生徒マスタデータを取得（Firestore）
 * 指定年度でアクティブな生徒のみ返す（削除済み除外・学年を動的計算）
 * @param {number} year 対象年度
 * @return {Array} 生徒データ配列
 */
function getMasterData(year) {
  try {
    var docs = firestoreQuery_('students', [
      fsFilter_('isDeleted', 'EQUAL', false)
    ]);

    var results = [];
    docs.forEach(function(doc) {
      try {
        var studentId = String(doc.studentId || doc._id || '').trim();
        if (!studentId || studentId.length < 10) return;

        // IDから登録年度・登録学年を抽出
        var registrationYear  = parseInt(studentId.substring(2, 6), 10);
        var registrationGrade = parseInt(studentId.substring(6, 8), 10);
        if (isNaN(registrationYear) || isNaN(registrationGrade)) return;

        // 指定年度での学年を計算
        var currentGrade = registrationGrade + (parseInt(year, 10) - registrationYear);

        // 有効学年範囲（07〜18）外は除外
        if (currentGrade < 7 || currentGrade > 18) return;

        var sei         = String(doc.sei         || '');
        var mei         = String(doc.mei         || '');
        var seiFurigana = String(doc.seiFurigana || '');
        var meiFurigana = String(doc.meiFurigana || '');
        var campus      = String(doc.campus      || '').padStart(2, '0');

        results.push({
          studentId:      studentId,
          campus:         campus,
          grade:          String(currentGrade).padStart(2, '0'),
          sei:            sei,
          mei:            mei,
          name:           sei + mei,
          seiFurigana:    seiFurigana,
          meiFurigana:    meiFurigana,
          furigana:       seiFurigana + meiFurigana,
          schoolName:     String(doc.schoolName  || ''),
          registeredDate: doc.createdAt || new Date().toISOString()
        });
      } catch (rowError) {}
    });

    return results;
  } catch (error) {
    Logger.log('❌ getMasterDataエラー: ' + error);
    return [];
  }
}

/**
 * 成績ドキュメントIDを生成する内部ヘルパー
 * docId: {studentId}_{safeTestName}_{fiscalYear}
 * @param {string} studentId 生徒ID（10桁）
 * @param {string} testName  テスト名
 * @param {number} year      学年年度
 * @return {string} ドキュメントID
 */
function makeGradeDocId_(studentId, testName, year) {
  var safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(studentId) + '_' + safe + '_' + String(year);
}

/**
 * 成績データを取得（Firestore）
 * @param {number} year 学年年度
 * @return {Array} 成績データ配列
 */
function getDataSheetData(year) {
  try {
    var docs = firestoreQuery_('grades', [
      fsFilter_('fiscalYear', 'EQUAL', parseInt(year, 10))
    ]);

    return docs.map(function(doc) {
      var sid = String(doc.studentId || '').trim();
      if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
      return {
        studentId:      sid,
        testName:       String(doc.testName    || '').trim(),
        kokugo:         doc.kokugo  !== null && doc.kokugo  !== undefined ? doc.kokugo  : '',
        shakai:         doc.shakai  !== null && doc.shakai  !== undefined ? doc.shakai  : '',
        sugaku:         doc.sugaku  !== null && doc.sugaku  !== undefined ? doc.sugaku  : '',
        rika:           doc.rika    !== null && doc.rika    !== undefined ? doc.rika    : '',
        eigo:           doc.eigo    !== null && doc.eigo    !== undefined ? doc.eigo    : '',
        total:          doc.total   !== null && doc.total   !== undefined ? doc.total   : '',
        average:        doc.average !== null && doc.average !== undefined ? doc.average : '',
        shogaku1:       String(doc.shogaku1       || ''),
        shogaku1_gakka: String(doc.shogaku1_gakka || ''),
        shogaku2:       String(doc.shogaku2       || ''),
        shogaku2_gakka: String(doc.shogaku2_gakka || ''),
        recordedDate:   doc.recordedAt || new Date().toISOString(),
        studentName:    String(doc.studentName    || '')
      };
    });
  } catch (error) {
    Logger.log('❌ getDataSheetDataエラー: ' + error);
    return [];
  }
}

/**
 * 一覧表用：生徒マスタと成績データを結合して返す
 * 指定年度のアクティブ生徒全員と、指定テストの成績（なければnull）を返す
 * @aiCallable
 * @param {number} year 年度
 * @param {string} testName テスト名
 * @return {Object} { success, students } 生徒ごとの成績データ
 */
function getStudentListWithGrades(year, testName) {
  try {

    var masterData = getMasterData(year);
    var gradeRows = getDataSheetData(year);

    // テスト名でフィルタしてstudentId→成績のマップを作成（前後の空白を除去して比較）
    // 最初の一致行を優先する（getGradeDataByStudentAndTestと同じ動作）
    var targetTest = String(testName || '').trim();
    var gradeMap = {};
    gradeRows.forEach(function(row) {
      if (String(row.testName || '').trim() === targetTest) {
        var sid = String(row.studentId);
        // 最初の一致を保持し、後続の重複行で上書きしない
        if (!gradeMap[sid]) {
          gradeMap[sid] = row;
        }
      }
    });


    // Firestore studentAnalysis から合格可能性（%）を一括ロード
    // {studentId|testName: {schoolName: percent}} の形式でマップ化
    var analysisPassMap = {};
    try {
      var aDocs = firestoreQuery_('studentAnalysis', [
        fsFilter_('testName', 'EQUAL', targetTest),
        fsFilter_('year', 'EQUAL', parseInt(year, 10))
      ]);
      aDocs.forEach(function(doc) {
        var sid = String(doc.studentId || '').trim();
        if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
        var tname = String(doc.testName || '').trim();
        if (!sid || !tname) return;
        var data = safeJsonParse_(doc.analysisJson, null);
        if (!data || !Array.isArray(data.passAssessment)) return;
        var m = {};
        data.passAssessment.forEach(function(pa) {
          if (pa.schoolName && pa.probability && pa.probability.percent != null) {
            m[pa.schoolName] = pa.probability.percent;
          }
        });
        analysisPassMap[sid + '|' + tname] = m;
      });
    } catch (e) {
      Logger.log('⚠ getStudentListWithGrades 合格可能性ロードスキップ: ' + e);
    }

    // 生徒マスタと成績を結合
    // GASシリアライゼーションはnullプロパティを削除するため、nullは使わない
    // 成績なし → 空文字''を返す（フロントエンドで判定可能）
    var students = masterData.map(function(student) {
      var g = gradeMap[String(student.studentId)] || null;
      var aKey = String(student.studentId) + '|' + targetTest;
      var aEntry = analysisPassMap[aKey] || {};
      return {
        studentId:     student.studentId,
        name:          student.name,
        furigana:      student.furigana,
        seiFurigana:   student.seiFurigana,
        meiFurigana:   student.meiFurigana,
        campus:        student.campus,
        grade:         student.grade,
        schoolName:    student.schoolName,
        kokugo:        g ? g.kokugo  : '',
        shakai:        g ? g.shakai  : '',
        sugaku:        g ? g.sugaku  : '',
        rika:          g ? g.rika    : '',
        eigo:          g ? g.eigo    : '',
        total:         g ? g.total   : '',
        average:       g ? g.average : '',
        shogaku1:      g ? (g.shogaku1 || '')      : '',
        shogaku1_gakka: g ? (g.shogaku1_gakka || '') : '',
        shogaku2:      g ? (g.shogaku2 || '')      : '',
        shogaku2_gakka: g ? (g.shogaku2_gakka || '') : '',
        hasGrade:      g !== null,
        passPercent1:  (g && g.shogaku1 && aEntry[g.shogaku1] != null) ? aEntry[g.shogaku1] : null,
        passPercent2:  (g && g.shogaku2 && aEntry[g.shogaku2] != null) ? aEntry[g.shogaku2] : null
      };
    });

    return { success: true, students: students };
  } catch (error) {
    Logger.log('❌ getStudentListWithGradesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * ドロップダウン用の生徒一覧を取得
 * @aiCallable
 * @param {string} campusCode 校舎コード
 * @param {string|null} gradeCode 学年コード（null/空の場合は全学年）
 * @param {number} selectedYear 選択年度
 * @return {Object} { success, students, error }
 */
function getStudentsForDropdown(campusCode, gradeCode, selectedYear) {
  try {

    var masterData = getMasterData(selectedYear);
    var targetGrade = gradeCode ? String(gradeCode).padStart(2, '0') : null;

    var students = masterData.filter(function(student) {
      var campusMatch = String(student.campus).padStart(2, '0') === String(campusCode).padStart(2, '0');
      var gradeMatch  = !targetGrade || student.grade === targetGrade;
      return campusMatch && gradeMatch;
    }).map(function(student) {
      return {
        studentId:   student.studentId,
        sei:         student.sei,
        mei:         student.mei,
        name:        student.name,
        seiFurigana: student.seiFurigana,
        meiFurigana: student.meiFurigana,
        furigana:    student.furigana,
        schoolName:  student.schoolName
      };
    });

    // ④ ふりがな順ソート（日本語ロケール）
    students.sort(function(a, b) {
      return (a.furigana || '').localeCompare(b.furigana || '', 'ja');
    });

    return { success: true, students: students };
  } catch (error) {
    Logger.log('❌ getStudentsForDropdownエラー: ' + error);
    return { success: false, error: error.toString(), students: [] };
  }
}

/**
 * 生徒情報を登録（新規）（Firestore）
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} campusCode 校舎コード
 * @param {string} gradeCode 学年コード
 * @param {string} sei 姓（漢字）
 * @param {string} mei 名（漢字）
 * @param {string} seiFurigana 姓ふりがな
 * @param {string} meiFurigana 名ふりがな
 * @param {string} schoolName 学校名
 * @return {Object} { success, message, studentId, error }
 */
function submitStudentInfo(year, campusCode, gradeCode, sei, mei, seiFurigana, meiFurigana, schoolName) {
  try {
    if (!sei || !seiFurigana || !campusCode || !gradeCode) {
      return { success: false, error: '必須項目（校舎、学年、姓、姓ふりがな）を入力してください' };
    }

    var campus    = String(campusCode).padStart(2, '0');
    var grade     = String(gradeCode).padStart(2, '0');
    var prefix    = campus + String(year) + grade;
    var fullName     = sei.trim() + (mei ? mei.trim() : '');
    var fullFurigana = seiFurigana.trim() + (meiFurigana ? meiFurigana.trim() : '');

    // LockService で同時登録による ID 重複を防ぐ
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (lockErr) {
      return { success: false, error: '同時操作による競合が発生しました。時間をおいて再試行してください。' };
    }

    try {
      // 同じプレフィックスを持つ生徒を Firestore から取得して maxSeq を計算
      var existing = firestoreQuery_('students', [
        fsFilter_('studentId', 'GREATER_THAN_OR_EQUAL', prefix + '00'),
        fsFilter_('studentId', 'LESS_THAN_OR_EQUAL',    prefix + '99')
      ]);

      // 重複チェック（削除済みを除く同一氏名・ふりがな）
      // 全生徒から同一氏名を検索（プレフィックス絞り込みでは不十分）
      var allActive = firestoreQuery_('students', [
        fsFilter_('isDeleted', 'EQUAL', false)
      ]);
      for (var i = 0; i < allActive.length; i++) {
        var s = allActive[i];
        var existName     = String(s.sei || '').trim() + String(s.mei || '').trim();
        var existFurigana = String(s.seiFurigana || '').trim() + String(s.meiFurigana || '').trim();
        if (existName === fullName && existFurigana === fullFurigana) {
          return { success: false, error: '同じ氏名・ふりがなの生徒がすでに登録されています（ID: ' + (s.studentId || s._id) + '）' };
        }
      }

      var maxSeq = 0;
      existing.forEach(function(doc) {
        var id = String(doc.studentId || doc._id || '');
        if (id.indexOf(prefix) === 0) {
          var seq = parseInt(id.slice(prefix.length), 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      });

      var studentId  = prefix + String(maxSeq + 1).padStart(2, '0');
      var registrationYear  = parseInt(String(year), 10);
      var registrationGrade = parseInt(grade, 10);
      var now = new Date().toISOString();

      firestoreSet_('students', studentId, {
        studentId:         studentId,
        campus:            campus,
        sei:               sei.trim(),
        mei:               mei.trim() || '',
        seiFurigana:       seiFurigana.trim(),
        meiFurigana:       meiFurigana.trim() || '',
        schoolName:        schoolName.trim() || '',
        isDeleted:         false,
        createdAt:         now,
        registrationYear:  registrationYear,
        registrationGrade: registrationGrade
      });

      Logger.log('✓ submitStudentInfo: 登録完了 ' + studentId);
      return { success: true, message: '生徒情報を登録しました', studentId: studentId };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log('❌ submitStudentInfoエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒情報を更新（Firestore）
 * @aiCallable
 * @param {string} studentId 生徒ID
 * @param {string} campusCode 校舎コード（転校舎対応）
 * @param {string} sei 姓（漢字）
 * @param {string} mei 名（漢字）
 * @param {string} seiFurigana 姓ふりがな
 * @param {string} meiFurigana 名ふりがな
 * @param {string} schoolName 学校名
 * @return {Object} { success, message, error }
 */
function updateStudentInfo(studentId, campusCode, sei, mei, seiFurigana, meiFurigana, schoolName) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    var doc = firestoreGet_('students', sid);
    if (!doc) return { success: false, error: '生徒が見つかりません' };

    doc.campus      = String(campusCode).padStart(2, '0');
    doc.sei         = sei.trim();
    doc.mei         = mei.trim() || '';
    doc.seiFurigana = seiFurigana.trim();
    doc.meiFurigana = meiFurigana.trim() || '';
    doc.schoolName  = schoolName.trim() || '';

    firestoreSet_('students', sid, doc);

    Logger.log('✓ updateStudentInfo: 更新完了 ' + sid);
    return { success: true, message: '生徒情報を更新しました' };
  } catch (error) {
    Logger.log('❌ updateStudentInfoエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒を削除（ソフトデリート）（Firestore）
 * @aiCallable
 * @param {string} studentId 生徒ID
 * @return {Object} { success, message, error }
 */
function deleteStudent(studentId) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    var doc = firestoreGet_('students', sid);
    if (!doc) return { success: false, error: '生徒が見つかりません' };

    doc.isDeleted = true;
    firestoreSet_('students', sid, doc);

    Logger.log('✓ deleteStudent: 削除完了 ' + sid);
    return { success: true, message: '生徒を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteStudentエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 削除済み生徒を取得（復元UI用）（Firestore）
 * @aiCallable
 * @param {string} campusCode 校舎コード（空=全校舎）
 * @param {string|null} gradeCode 学年コード（null=全学年）
 * @param {number|null} selectedYear 年度（null=全年度）
 * @return {Object} { success, students, error }
 */
function getDeletedStudents(campusCode, gradeCode, selectedYear) {
  try {
    var docs = firestoreQuery_('students', [
      fsFilter_('isDeleted', 'EQUAL', true)
    ]);

    var students = [];
    docs.forEach(function(doc) {
      var studentId = String(doc.studentId || doc._id || '').trim();
      if (!studentId || studentId.length < 10) return;

      var regYear  = parseInt(studentId.substring(2, 6), 10);
      var regGrade = parseInt(studentId.substring(6, 8), 10);

      // 校舎フィルタ
      var rowCampus = String(doc.campus || '').padStart(2, '0');
      if (campusCode && rowCampus !== String(campusCode).padStart(2, '0')) return;

      // 年度フィルタ
      if (selectedYear && regYear !== parseInt(selectedYear, 10)) return;

      // 学年フィルタ
      if (gradeCode && selectedYear) {
        var calcGrade = regGrade + (parseInt(selectedYear, 10) - regYear);
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

    students.sort(function(a, b) {
      return (a.furigana || '').localeCompare(b.furigana || '', 'ja');
    });

    return { success: true, students: students };
  } catch (error) {
    Logger.log('❌ getDeletedStudentsエラー: ' + error);
    return { success: false, error: error.toString(), students: [] };
  }
}

/**
 * 削除済み生徒を復元（Firestore）
 * @aiCallable
 * @param {string} studentId 生徒ID
 * @return {Object} { success, message, error }
 */
function restoreStudent(studentId) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    var doc = firestoreGet_('students', sid);
    if (!doc) return { success: false, error: '生徒が見つかりません' };

    doc.isDeleted = false;
    firestoreSet_('students', sid, doc);

    Logger.log('✓ restoreStudent: 復元完了 ' + sid);
    return { success: true, message: '生徒情報を復元しました' };
  } catch (error) {
    Logger.log('❌ restoreStudentエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績一覧表画像を Gemini API で OCR し全生徒分を一括保存する
 * @aiCallable
 * @param {string} base64Image base64エンコードされた画像データ
 * @param {string} mimeType 画像の MIME タイプ（例: image/jpeg）
 * @param {number} year 対象年度
 * @return {Object} { success, testName, totalRows, savedCount, skippedCount, skipped[], error }
 */
function ocrAndSaveGradeSheet(base64Image, mimeType, year) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;

    // 設定済み志望校リストを取得してプロンプトに含める
    var schoolConfig = getSchoolConfig();
    var schoolListText = '';
    if (schoolConfig && schoolConfig.length > 0) {
      var schoolNames = schoolConfig.map(function(s) { return s.name; });
      schoolListText = '\n\n【重要】志望校名は以下のリストから最も近いものを正式名称で返してください。' +
        '略称や部分一致でも該当する学校があればリストの正式名称を使ってください。' +
        '例: "渦潮" → "鳴門渦潮高校", "城北" → "城北高校" など。' +
        'リストに該当がない場合のみ、画像に書かれている通りの名前を返してください。\n' +
        '志望校リスト: ' + schoolNames.join(', ');
    }

    var mediaLabel = mimeType === 'application/pdf' ? 'このPDF（複数ページある場合は全ページを確認してください）' : 'この画像';
    var prompt = mediaLabel + 'は学習塾の成績一覧表です。' +
      '表のタイトルまたはヘッダーからテスト名を取得し、各生徒行のデータをJSONのみで返してください。' +
      '存在しない値はnullにしてください。' + schoolListText + '\n' +
      '{"testName":"テスト名","students":[{' +
      '"studentId":"生徒ID",' +
      '"kokugo":国語点数,"shakai":社会点数,"sugaku":数学点数,' +
      '"rika":理科点数,"eigo":英語点数,"total":合計点,' +
      '"shogaku1":"第1志望校名または null",' +
      '"shogaku2":"第2志望校名または null"' +
      '}]}';

    var payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (json.usageMetadata) logGeminiUsage('成績OCR', json.usageMetadata);
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    var text = json.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    var data = JSON.parse(text);

    if (!data.testName || !data.students || !Array.isArray(data.students)) {
      return { success: false, error: 'テスト名または生徒データが読み取れませんでした' };
    }

    var testName = data.testName;
    var savedCount  = 0;
    var updatedCount = 0;
    var skipped = [];

    // 志望校マッチング用のルックアップを構築
    // schoolConfig: [{name: "鳴門渦潮高校", departments: ["普通科", "体育科"]}, ...]
    var schoolLookup = buildSchoolLookup(schoolConfig);

    // 既存データをマップとして構築（studentId+testName → フィールド値）
    // ※ 単純な存在チェックではなく「どのフィールドが0/空か」も判定するために値ごと保持する
    var existingDataMap = {};
    try {
      var existingRows = getDataSheetData(year);
      existingRows.forEach(function(row) {
        var key = String(row.studentId).trim() + '||' + String(row.testName).trim();
        existingDataMap[key] = row;
      });
    } catch (e) {
      Logger.log('⚠ 既存データ取得エラー: ' + e);
    }

    data.students.forEach(function(student) {
      try {
        var sid = String(student.studentId || '').trim();
        // AIが先頭ゼロなしで返した場合に10桁へ補完（例: '120251301' → '0120251301'）
        if (sid && /^\d+$/.test(sid) && sid.length < 10) {
          sid = sid.padStart(10, '0');
        }
        if (sid.length < 3) {
          skipped.push('生徒IDが不明な行をスキップしました');
          return;
        }

        var dupKey  = sid + '||' + testName;
        var existing = existingDataMap[dupKey] || null;

        // OCRで読み取った志望校名を設定データの正式名称にマッチングする
        var matched1 = matchSchoolName(student.shogaku1, schoolLookup);
        var matched2 = matchSchoolName(student.shogaku2, schoolLookup);
        student.shogaku1       = matched1.name;
        student.shogaku1_gakka = matched1.dept;
        student.shogaku2       = matched2.name;
        student.shogaku2_gakka = matched2.dept;

        // 数値フィールドのマージ判定:
        //   既存が 0（未入力）かつ OCR で読み取れた値がある → OCR 値を採用
        //   既存に値がある（≠0）→ 変更しない（上書きしない）
        //   OCR が null → 既存値をそのまま保持（新規なら 0 として保存）
        function pickNum(existVal, ocrVal) {
          if (existing && existVal !== 0) return existVal;
          if (ocrVal !== null && ocrVal !== undefined) return ocrVal;
          return existing ? existVal : ocrVal;
        }

        // テキストフィールドのマージ判定:
        //   既存が空かつ OCR に値があれば採用、既存値があれば保持
        function pickText(existVal, ocrVal) {
          if (existing && existVal) return existVal;
          return ocrVal || existVal || '';
        }

        var scores;
        if (existing) {
          // ── 既存データあり: 0/空のフィールドだけ補完 ──
          scores = {
            kokugo:         pickNum(existing.kokugo,  student.kokugo),
            shakai:         pickNum(existing.shakai,  student.shakai),
            sugaku:         pickNum(existing.sugaku,  student.sugaku),
            rika:           pickNum(existing.rika,    student.rika),
            eigo:           pickNum(existing.eigo,    student.eigo),
            gokei:          pickNum(existing.total,   student.total),
            shogaku1:       pickText(existing.shogaku1,  student.shogaku1),
            shogaku1_gakka: pickText(existing.shogaku1_gakka, student.shogaku1_gakka),
            shogaku2:       pickText(existing.shogaku2,  student.shogaku2),
            shogaku2_gakka: pickText(existing.shogaku2_gakka, student.shogaku2_gakka)
          };

          // 補完できる内容があるか確認（何も変わらないならスキップ）
          var changed = (
            scores.kokugo         !== existing.kokugo         ||
            scores.shakai         !== existing.shakai         ||
            scores.sugaku         !== existing.sugaku         ||
            scores.rika           !== existing.rika           ||
            scores.eigo           !== existing.eigo           ||
            scores.gokei          !== existing.total          ||
            scores.shogaku1       !== existing.shogaku1       ||
            scores.shogaku1_gakka !== (existing.shogaku1_gakka || '') ||
            scores.shogaku2       !== existing.shogaku2       ||
            scores.shogaku2_gakka !== (existing.shogaku2_gakka || '')
          );

          if (!changed) {
            skipped.push('ID:' + sid + ' - データ完全のためスキップ');
            return;
          }

        } else {
          // ── 新規: OCR 値をそのまま使用（null は submitGradeData 内で 0 に変換）──
          // ※ 一部フィールドが読み取れなくても生徒レコード自体はスキップしない
          scores = {
            kokugo:         student.kokugo,
            shakai:         student.shakai,
            sugaku:         student.sugaku,
            rika:           student.rika,
            eigo:           student.eigo,
            gokei:          student.total,
            shogaku1:       student.shogaku1 || '',
            shogaku1_gakka: student.shogaku1_gakka || '',
            shogaku2:       student.shogaku2 || '',
            shogaku2_gakka: student.shogaku2_gakka || ''
          };
        }

        var result = submitGradeData(year, sid, testName, scores);
        if (result.success) {
          if (existing) {
            updatedCount++;
          } else {
            savedCount++;
          }
          existingDataMap[dupKey] = scores; // 同一バッチ内での重複を防ぐ
        } else {
          skipped.push('ID:' + sid + ' → ' + result.error);
        }
      } catch (rowErr) {
        skipped.push('ID:' + (student.studentId || '?') + ' → エラー: ' + rowErr);
      }
    });

    return {
      success: true,
      testName:     testName,
      totalRows:    data.students.length,
      savedCount:   savedCount,
      updatedCount: updatedCount,
      skippedCount: skipped.length,
      skipped:      skipped
    };

  } catch (error) {
    Logger.log('❌ ocrAndSaveGradeSheetエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒IDとテスト名で既存の成績データを1件取得（Firestore）
 * @aiCallable
 * @param {number} year 対象年度
 * @param {string} studentId 生徒ID
 * @param {string} testName テスト名
 * @return {Object} { success, found, data, error }
 */
function getGradeDataByStudentAndTest(year, studentId, testName) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    var docId = makeGradeDocId_(sid, testName, year);
    var doc = firestoreGet_('grades', docId);

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
    Logger.log('❌ getGradeDataByStudentAndTestエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績データを登録（Firestore upsert）
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} studentId 生徒ID
 * @param {string} testName テスト名
 * @param {Object} scores スコアオブジェクト
 * @return {Object} { success, message, error }
 */
function submitGradeData(year, studentId, testName, scores) {
  try {
    if (!studentId || !testName) {
      return { success: false, error: '生徒IDとテスト名は必須です' };
    }

    var sid = String(studentId).trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    // スコア値を数値に変換（0 が有効値なので isNaN チェックを使う）
    var kokugo = parseInt(scores.kokugo, 10); if (isNaN(kokugo)) kokugo = 0;
    var shakai = parseInt(scores.shakai, 10); if (isNaN(shakai)) shakai = 0;
    var sugaku = parseInt(scores.sugaku, 10); if (isNaN(sugaku)) sugaku = 0;
    var rika   = parseInt(scores.rika,   10); if (isNaN(rika))   rika   = 0;
    var eigo   = parseInt(scores.eigo,   10); if (isNaN(eigo))   eigo   = 0;
    var calcTotal = kokugo + shakai + sugaku + rika + eigo;
    var gokei = parseInt(scores.gokei, 10);
    var total   = (!isNaN(gokei) && gokei > 0) ? gokei : calcTotal;
    var average = total > 0 ? parseFloat((total / 5).toFixed(1)) : 0;

    var studentName = scores.studentName || getStudentNameById(sid);

    var docId = makeGradeDocId_(sid, testName, year);
    var isNew = !firestoreGet_('grades', docId);

    firestoreSet_('grades', docId, {
      studentId:      sid,
      testName:       String(testName).trim(),
      fiscalYear:     parseInt(year, 10),
      kokugo:         kokugo,
      shakai:         shakai,
      sugaku:         sugaku,
      rika:           rika,
      eigo:           eigo,
      total:          total,
      average:        average,
      shogaku1:       scores.shogaku1       || '',
      shogaku1_gakka: scores.shogaku1_gakka || '',
      shogaku2:       scores.shogaku2       || '',
      shogaku2_gakka: scores.shogaku2_gakka || '',
      recordedAt:     new Date().toISOString(),
      studentName:    studentName
    });

    Logger.log('✓ submitGradeData: ' + (isNew ? '新規' : '更新') + ' ' + docId);
    return { success: true, message: isNew ? '成績データを新規保存しました' : '成績データを上書き更新しました' };
  } catch (error) {
    Logger.log('❌ submitGradeDataエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定テスト名の成績がある生徒一覧を校舎コードでフィルタして返す（成績表タブ用）
 * @aiCallable
 * @param {number} year 年度
 * @param {string} campusCode 校舎コード
 * @param {string} testName テスト名
 * @return {Object} { success, students: [{studentId, name, furigana, schoolName}], error }
 */
function getStudentsWithGradesByTest(year, campusCode, testName) {
  try {

    var targetTest = String(testName || '').trim();
    if (!targetTest || !campusCode) {
      return { success: true, students: [] };
    }

    // 1. 成績データから該当テストの生徒IDセットを収集
    var gradeRows = getDataSheetData(year);
    var studentIdSet = {};
    gradeRows.forEach(function(row) {
      if (String(row.testName || '').trim() === targetTest) {
        studentIdSet[String(row.studentId)] = true;
      }
    });

    // 2. 生徒マスタから校舎フィルタ＋成績あり生徒のみ抽出
    var masterData = getMasterData(year);
    var students = masterData.filter(function(student) {
      return student.campus === String(campusCode) && studentIdSet[String(student.studentId)];
    }).map(function(student) {
      return {
        studentId: student.studentId,
        name: student.name,
        furigana: student.furigana,
        schoolName: student.schoolName
      };
    });

    // 3. ふりがな順ソート
    students.sort(function(a, b) {
      return (a.furigana || '').localeCompare(b.furigana || '', 'ja');
    });

    return { success: true, students: students };
  } catch (error) {
    Logger.log('❌ getStudentsWithGradesByTestエラー: ' + error);
    return { success: false, error: error.toString(), students: [] };
  }
}

/**
 * 成績表用：指定生徒の全テスト成績と学校別平均を取得する
 * 年度内の全成績データから生徒IDで絞り込み、テスト名設定順に返す
 * 学校別平均も各テストごとに返し、生徒の点数との比較が可能
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} studentId 生徒ID
 * @return {Object} { success, student, grades, testNames, schoolAverages, error }
 */
function getStudentGradeReport(year, studentId) {
  try {

    if (!studentId) {
      return { success: false, error: '生徒IDが指定されていません' };
    }

    // 1. 生徒マスタから生徒情報を取得
    var masterData = getMasterData(year);
    var student = null;
    var targetId = String(studentId).trim();
    for (var i = 0; i < masterData.length; i++) {
      if (String(masterData[i].studentId) === targetId) {
        student = masterData[i];
        break;
      }
    }

    if (!student) {
      return { success: false, error: '生徒が見つかりません（ID: ' + studentId + '）' };
    }

    // 2. 全成績データから該当生徒の成績を抽出
    var allGrades = getDataSheetData(year);
    var studentGrades = [];
    allGrades.forEach(function(row) {
      if (String(row.studentId) === targetId) {
        studentGrades.push({
          testName:       row.testName,
          kokugo:         row.kokugo,
          shakai:         row.shakai,
          sugaku:         row.sugaku,
          rika:           row.rika,
          eigo:           row.eigo,
          total:          row.total,
          average:        row.average,
          shogaku1:       row.shogaku1 || '',
          shogaku1_gakka: row.shogaku1_gakka || '',
          shogaku2:       row.shogaku2 || '',
          shogaku2_gakka: row.shogaku2_gakka || ''
        });
      }
    });

    // 3. テスト名設定の順序で並べ替え
    var configTestNames = getTestNamesConfig();
    var testOrder = {};
    configTestNames.forEach(function(name, idx) { testOrder[name] = idx; });
    studentGrades.sort(function(a, b) {
      var orderA = testOrder[a.testName] !== undefined ? testOrder[a.testName] : 9999;
      var orderB = testOrder[b.testName] !== undefined ? testOrder[b.testName] : 9999;
      return orderA - orderB;
    });

    // 4. 各テストの学校別平均を取得（生徒の学校名でフィルタ）
    var schoolAverages = {};
    var studentSchool = (student.schoolName || '').trim();
    var testNamesWithGrades = studentGrades.map(function(g) { return g.testName; });
    // 重複除去
    var uniqueTests = [];
    testNamesWithGrades.forEach(function(t) {
      if (uniqueTests.indexOf(t) === -1) uniqueTests.push(t);
    });

    uniqueTests.forEach(function(testName) {
      var avgResult = getSchoolAverages(year, testName);
      if (avgResult.success && avgResult.averages) {
        var fallback = null;
        for (var j = 0; j < avgResult.averages.length; j++) {
          var sn = (avgResult.averages[j].schoolName || '').trim();
          if (studentSchool && sn === studentSchool) {
            schoolAverages[testName] = avgResult.averages[j];
            fallback = null;
            break;
          }
          if (!fallback && sn.indexOf('平均') !== -1) {
            fallback = avgResult.averages[j];
          }
        }
        if (fallback) {
          schoolAverages[testName] = fallback;
        }
      }
    });

    // 5. 偏差値を計算（学校平均が登録されているテスト・教科のみ）
    var deviationValues = {};
    var sigmaResult = getGradeAnalysisSigmaConfig();
    var sigma = sigmaResult.sigma;
    var subjKeys = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];
    studentGrades.forEach(function(g) {
      var avg = schoolAverages[g.testName];
      if (!avg) return;
      var devs = {};
      subjKeys.forEach(function(subj) {
        devs[subj] = calcDeviationValue_(g[subj], avg[subj], sigma[subj]);
      });
      deviationValues[g.testName] = devs;
    });

    return {
      success: true,
      student: {
        studentId:  student.studentId,
        name:       student.name,
        furigana:   student.furigana,
        campus:     student.campus,
        grade:      student.grade,
        schoolName: student.schoolName
      },
      grades: studentGrades,
      testNames: configTestNames,
      schoolAverages: schoolAverages,
      deviationValues: deviationValues
    };
  } catch (error) {
    Logger.log('❌ getStudentGradeReportエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// 学校別平均点管理（セクション8 追加）
// ----------------------------------------

/**
 * 学校別平均点の Firestore ドキュメントIDを生成する内部ヘルパー
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @return {string} docId
 */
function makeSchoolAveDocId_(year, testName) {
  var safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(year) + '_' + safe;
}

/**
 * 指定年度の生徒マスタから学校名の一覧を取得する
 * @aiCallable
 * @param {number} year 学年年度
 * @return {Object} { success, schools: string[] }
 */
function getSchoolListForAverages(year) {
  try {
    var students = getMasterData(year);
    var schoolSet = {};
    students.forEach(function(s) {
      if (s.schoolName && s.schoolName.trim()) {
        schoolSet[s.schoolName.trim()] = true;
      }
    });
    var schools = Object.keys(schoolSet).sort();
    return { success: true, schools: schools };
  } catch (error) {
    Logger.log('❌ getSchoolListForAveragesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定テストの学校別平均点を取得する
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @return {Object} { success, averages: [{schoolName, kokugo, shakai, sugaku, rika, eigo, total}] }
 */
function getSchoolAverages(year, testName) {
  try {
    var docId = makeSchoolAveDocId_(year, testName);
    var doc = firestoreGet_('schoolAverages', docId);
    if (!doc || !doc.averages) return { success: true, averages: [] };
    return { success: true, averages: doc.averages };
  } catch (error) {
    Logger.log('❌ getSchoolAveragesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 学校別平均点を保存する（upsert）
 * Firestore の schoolAverages コレクションに docId={year}_{safeTestName} で保存
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @param {Array} dataArray [{schoolName, kokugo, shakai, sugaku, rika, eigo, total}] totalは任意（指定時優先）
 * @param {boolean} skipExisting trueの場合、既存の非ゼロ値はスキップ（OCRモード）
 * @return {Object} { success, savedCount, updatedCount }
 */
function saveSchoolAverages(year, testName, dataArray, skipExisting) {
  try {
    var docId = makeSchoolAveDocId_(year, testName);
    var now = new Date().toISOString();
    var savedCount = 0;
    var updatedCount = 0;

    // 既存ドキュメントを取得して既存 averages マップを構築
    var existingDoc = firestoreGet_('schoolAverages', docId);
    var existingAverages = (existingDoc && existingDoc.averages) ? existingDoc.averages : [];
    var existingMap = {};
    existingAverages.forEach(function(a) {
      existingMap[String(a.schoolName || '')] = a;
    });

    dataArray.forEach(function(d) {
      var schoolName = String(d.schoolName || '').trim();
      if (!schoolName) return;

      var kokugo = d.kokugo === '' || d.kokugo === null || d.kokugo === undefined ? null : Number(d.kokugo);
      var shakai = d.shakai === '' || d.shakai === null || d.shakai === undefined ? null : Number(d.shakai);
      var sugaku = d.sugaku === '' || d.sugaku === null || d.sugaku === undefined ? null : Number(d.sugaku);
      var rika   = d.rika   === '' || d.rika   === null || d.rika   === undefined ? null : Number(d.rika);
      var eigo   = d.eigo   === '' || d.eigo   === null || d.eigo   === undefined ? null : Number(d.eigo);
      var providedTotal = (d.total === '' || d.total === null || d.total === undefined) ? null : Number(d.total);
      var totalNums = [kokugo, shakai, sugaku, rika, eigo].filter(function(v) { return v !== null; });
      var calcTotal = totalNums.length === 5 ? totalNums.reduce(function(a, b) { return a + b; }, 0) : null;
      var total = providedTotal !== null ? providedTotal : calcTotal;

      if (existingMap[schoolName]) {
        if (skipExisting) {
          // OCRモード: 既存の非ゼロ値はスキップして空/ゼロのみ補完
          var existing = existingMap[schoolName];
          var merged = {
            schoolName: schoolName,
            kokugo: (existing.kokugo && existing.kokugo !== 0) ? existing.kokugo : (kokugo !== null ? kokugo : existing.kokugo),
            shakai: (existing.shakai && existing.shakai !== 0) ? existing.shakai : (shakai !== null ? shakai : existing.shakai),
            sugaku: (existing.sugaku && existing.sugaku !== 0) ? existing.sugaku : (sugaku !== null ? sugaku : existing.sugaku),
            rika:   (existing.rika   && existing.rika   !== 0) ? existing.rika   : (rika   !== null ? rika   : existing.rika),
            eigo:   (existing.eigo   && existing.eigo   !== 0) ? existing.eigo   : (eigo   !== null ? eigo   : existing.eigo)
          };
          var mergedNums = [merged.kokugo, merged.shakai, merged.sugaku, merged.rika, merged.eigo]
            .filter(function(v) { return v !== null && v !== ''; });
          merged.total = mergedNums.length === 5
            ? mergedNums.reduce(function(a, b) { return Number(a) + Number(b); }, 0) : null;
          existingMap[schoolName] = merged;
        } else {
          existingMap[schoolName] = { schoolName: schoolName, kokugo: kokugo, shakai: shakai, sugaku: sugaku, rika: rika, eigo: eigo, total: total };
        }
        updatedCount++;
      } else {
        existingMap[schoolName] = { schoolName: schoolName, kokugo: kokugo, shakai: shakai, sugaku: sugaku, rika: rika, eigo: eigo, total: total };
        savedCount++;
      }
    });

    var finalAverages = Object.keys(existingMap).map(function(name) { return existingMap[name]; });
    firestoreSet_('schoolAverages', docId, {
      year:      parseInt(year, 10),
      testName:  String(testName),
      updatedAt: now,
      averages:  finalAverages
    });

    return { success: true, savedCount: savedCount, updatedCount: updatedCount };
  } catch (error) {
    Logger.log('❌ saveSchoolAveragesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * コピーしたテキストから学校別平均点をAI（Gemini）で解析し保存する
 * ホームページなどからコピーした生テキストに対応。既存データがある場合はスキップ（補完のみ）
 * @aiCallable
 * @param {string} text 貼り付けたテキスト
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @param {boolean} skipExisting trueの場合、既存の非ゼロ値はスキップ
 * @return {Object} { success, savedCount, updatedCount, extracted[], error }
 */
function parseAndSaveAveragesFromText(text, year, testName, skipExisting) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;

    var prompt = '以下のテキストは模擬試験・学力テストの学校別平均点一覧をウェブページからコピーしたものです。\n' +
      '各学校の教科別平均点（国語・社会・数学・理科・英語）を読み取り、以下のJSON配列形式のみで返してください。\n' +
      '「平均点」「全体平均」「合計」などの行は schoolName:"平均" として扱ってください。\n' +
      '値が読み取れない場合は null にしてください。小数点以下1桁の数値もそのまま読み取ってください。\n\n' +
      '[{"schoolName":"学校名","kokugo":国語平均,"shakai":社会平均,"sugaku":数学平均,"rika":理科平均,"eigo":英語平均},...]\n\n' +
      '対象テキスト:\n' + text;

    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    var responseText = json.candidates[0].content.parts[0].text.trim();
    responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    var extracted = JSON.parse(responseText);

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return { success: false, error: '平均点データが読み取れませんでした' };
    }

    var saveResult = saveSchoolAverages(year, testName, extracted, skipExisting !== false);
    if (!saveResult.success) return saveResult;

    return {
      success: true,
      savedCount: saveResult.savedCount,
      updatedCount: saveResult.updatedCount,
      extracted: extracted
    };
  } catch (error) {
    Logger.log('❌ parseAndSaveAveragesFromTextエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎別の平均点を生徒の成績データから自動計算して返す
 * 全校舎合計＋各校舎ごとの平均を返す
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @return {Object} { success, campuses: [{campusCode, campusName, kokugo, shakai, sugaku, rika, eigo, total, count}] }
 */
function getCampusAverages(year, testName) {
  try {
    var result = getStudentListWithGrades(year, testName);
    if (!result.success) return result;

    var students = result.students.filter(function(s) { return s.hasGrade; });

    var campusMap = getCampusConfig(); // {code: name} の辞書形式

    var subjects = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo'];

    function calcAvg(arr, subj) {
      var vals = arr.map(function(s) { return s[subj]; })
        .filter(function(v) { return v !== null && v !== undefined && v !== '' && !isNaN(Number(v)); });
      if (vals.length === 0) return '';
      return Math.round(vals.reduce(function(a, b) { return a + Number(b); }, 0) / vals.length * 10) / 10;
    }

    var campuses = [];

    // 全校舎合計
    var allAvg = { campusCode: 'all', campusName: '全校舎', count: students.length };
    subjects.forEach(function(s) { allAvg[s] = calcAvg(students, s); });
    var allTotals = subjects.map(function(s) { return allAvg[s]; }).filter(function(v) { return v !== '' && v !== null && v !== undefined; });
    allAvg.total = allTotals.length === 5 ? Math.round(allTotals.reduce(function(a, b) { return a + b; }, 0) * 10) / 10 : '';
    campuses.push(allAvg);

    // 校舎ごと
    var groups = {};
    students.forEach(function(s) {
      var code = String(s.campus || 'unknown');
      if (!groups[code]) groups[code] = [];
      groups[code].push(s);
    });

    Object.keys(groups).sort().forEach(function(code) {
      var arr = groups[code];
      var avg = { campusCode: code, campusName: campusMap[code] || code, count: arr.length };
      subjects.forEach(function(s) { avg[s] = calcAvg(arr, s); });
      var totals = subjects.map(function(s) { return avg[s]; }).filter(function(v) { return v !== '' && v !== null && v !== undefined; });
      avg.total = totals.length === 5 ? Math.round(totals.reduce(function(a, b) { return a + b; }, 0) * 10) / 10 : '';
      campuses.push(avg);
    });

    return { success: true, campuses: campuses };
  } catch (error) {
    Logger.log('❌ getCampusAveragesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 画像から学校別平均点をAI（Gemini）で読み取り保存する
 * 既存データがある学校・教科はスキップ（補完のみ）
 * @aiCallable
 * @param {string} base64Image Base64エンコードされた画像データ
 * @param {string} mimeType 画像のMIMEタイプ
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @return {Object} { success, savedCount, updatedCount, extracted[], error }
 */
function ocrAndExtractAverages(base64Image, mimeType, year, testName) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;

    var prompt = 'この画像は模擬試験・学力テストの学校別平均点一覧です。' +
      '各学校（または「県平均」「全体平均」など）の教科別平均点を読み取り、' +
      '以下のJSON配列形式のみで返してください。教科が読み取れない場合は null にしてください。\n' +
      '「平均点」「全体平均」「合計平均」などの全体平均行は schoolName:"平均" として統一してください。\n' +
      '[{"schoolName":"学校名","kokugo":国語平均点,"shakai":社会平均点,"sugaku":数学平均点,"rika":理科平均点,"eigo":英語平均点},' +
      '{"schoolName":"県平均","kokugo":...}]';

    var payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    var text = json.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    var extracted = JSON.parse(text);

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return { success: false, error: '平均点データが読み取れませんでした' };
    }

    var saveResult = saveSchoolAverages(year, testName, extracted, true);
    if (!saveResult.success) return saveResult;

    return {
      success: true,
      savedCount: saveResult.savedCount,
      updatedCount: saveResult.updatedCount,
      extracted: extracted
    };
  } catch (error) {
    Logger.log('❌ ocrAndExtractAveragesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}


/**
 * 生徒を一括インポートする（ふりがな省略可・Admin のみ）（Firestore）
 * @param {string} studentsJson JSON文字列 [{campusCode, gradeCode, sei, mei}]
 * @param {number} [importYear] 登録年度（省略時は現在の学年年度）
 * @return {Object} { success, total, savedCount, skippedCount, errors[] }
 */
function bulkImportStudents(studentsJson, importYear) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }

    var students = safeJsonParse_(studentsJson, null);
    if (!Array.isArray(students) || students.length === 0) {
      return { success: false, error: 'インポートデータが空です' };
    }

    var year = importYear ? parseInt(importYear, 10) : getCurrentFiscalYear();
    var savedCount   = 0;
    var skippedCount = 0;
    var errors = [];

    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var sei        = (s.sei        || '').trim();
      var mei        = (s.mei        || '').trim();
      var campusCode = (s.campusCode || '').trim();
      var gradeCode  = (s.gradeCode  || '').trim();

      if (!sei || !campusCode || !gradeCode) {
        errors.push({ row: i + 1, name: sei || '（空）', reason: '必須項目が不足しています' });
        skippedCount++;
        continue;
      }

      // submitStudentInfo を呼ぶ（重複チェック・連番採番・Firestore書込みを一括処理）
      var result = submitStudentInfo(year, campusCode, gradeCode, sei, mei, '', '', '');
      if (result && result.success) {
        savedCount++;
      } else {
        errors.push({ row: i + 1, name: sei + ' ' + mei, reason: (result && result.error) || '登録に失敗しました' });
        skippedCount++;
      }
    }

    return {
      success: true,
      total:        students.length,
      savedCount:   savedCount,
      skippedCount: skippedCount,
      errors:       errors
    };
  } catch (error) {
    Logger.log('❌ bulkImportStudentsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績データを一括インポートする（Admin のみ）
 * 氏名・校舎・学年で生徒マスタを検索して生徒IDを解決し、成績をupsertする
 * @param {string} gradesJson JSON文字列 [{testName, campusCode, gradeCode, name, kokugo, shakai, sugaku, rika, eigo, gokei}]
 * @param {number} [importYear] 対象年度（省略時は現在の学年年度）
 * @return {Object} { success, total, savedCount, skippedCount, errors[] }
 */
function bulkImportGrades(gradesJson, importYear) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }

    var records = JSON.parse(gradesJson);
    if (!Array.isArray(records) || records.length === 0) {
      return { success: false, error: 'インポートデータが空です' };
    }

    var year = importYear ? parseInt(importYear, 10) : getCurrentFiscalYear();

    // 生徒マスタをすべて読み込んで名前→ID の逆引きマップを作成
    var masterStudents = getMasterData(year);
    // キー: "氏名（スペースなし）_校舎コード_学年コード" → studentId
    var studentMap = {};
    masterStudents.forEach(function(s) {
      var key = (String(s.sei || '') + String(s.mei || '')).replace(/\s+/g, '')
              + '_' + String(s.campus || '').padStart(2, '0')
              + '_' + String(s.grade || '');
      studentMap[key] = s.studentId;
    });

    var savedCount = 0;
    var skippedCount = 0;
    var errors = [];

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var fullName = String(r.name || '').replace(/\s+/g, '');
      var campusCode = String(r.campusCode || '').padStart(2, '0');
      var gradeCode = String(r.gradeCode || '');
      var testName = String(r.testName || '').trim();

      if (!fullName || !campusCode || !gradeCode || !testName) {
        errors.push({ row: i + 1, name: fullName || '（空）', reason: '必須項目が不足しています' });
        skippedCount++;
        continue;
      }

      // 生徒IDを氏名＋校舎＋学年で解決
      // 学年コードは動的計算後のコードなので、getMasterData の grade と比較
      var studentId = null;
      var lookupKey = fullName + '_' + campusCode + '_' + gradeCode;
      if (studentMap[lookupKey]) {
        studentId = studentMap[lookupKey];
      } else {
        // 学年が見つからない場合、氏名と校舎だけで再検索（学年を緩めて探す）
        for (var k in studentMap) {
          var parts = k.split('_');
          var mapName = parts[0];
          var mapCampus = parts[1];
          if (mapName === fullName && mapCampus === campusCode) {
            studentId = studentMap[k];
            break;
          }
        }
      }

      if (!studentId) {
        errors.push({ row: i + 1, name: fullName, reason: '生徒マスタに見つかりません（' + year + '年度・' + campusCode + '校舎）' });
        skippedCount++;
        continue;
      }

      var scores = {
        kokugo: String(r.kokugo || ''),
        shakai: String(r.shakai || ''),
        sugaku: String(r.sugaku || ''),
        rika: String(r.rika || ''),
        eigo: String(r.eigo || ''),
        gokei: String(r.gokei || '')
      };

      var result = submitGradeData(year, studentId, testName, scores);
      if (result && result.success) {
        savedCount++;
      } else {
        errors.push({ row: i + 1, name: fullName, reason: (result && result.error) || '成績登録に失敗しました' });
        skippedCount++;
      }
    }

    return {
      success: true,
      total: records.length,
      savedCount: savedCount,
      skippedCount: skippedCount,
      errors: errors
    };
  } catch (error) {
    Logger.log('❌ bulkImportGradesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 受験情報（中3専用）
// ========================================

/**
 * 生徒の受験情報を Firestore の生徒ドキュメントに保存する（中3専用）
 * @aiCallable
 * @param {string} studentId 生徒ID（10桁）
 * @param {string} examDataJson JSON文字列 {jukoukou1, jukoukou1_gakka, jukoukou1_gokaku, ikusei, jukoukou2, jukoukou2_gakka, jukoukou2_gokaku}
 * @return {Object} {success, message}
 */
function saveExamResult(studentId, examDataJson) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    var examData = safeJsonParse_(examDataJson, {});
    var doc = firestoreGet_('students', sid);
    if (!doc) return { success: false, error: '生徒が見つかりません: ' + sid };

    doc.jukoukou1        = examData.jukoukou1        || '';
    doc.jukoukou1_gakka  = examData.jukoukou1_gakka  || '';
    doc.jukoukou1_gokaku = examData.jukoukou1_gokaku || '';
    doc.ikusei           = examData.ikusei            || '';
    doc.jukoukou2        = examData.jukoukou2        || '';
    doc.jukoukou2_gakka  = examData.jukoukou2_gakka  || '';
    doc.jukoukou2_gokaku = examData.jukoukou2_gokaku || '';

    firestoreSet_('students', sid, doc);
    Logger.log('✓ saveExamResult: 保存完了 ' + sid);
    return { success: true, message: '受験情報を保存しました' };
  } catch (error) {
    Logger.log('❌ saveExamResultエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒の受験情報と最新テストの第1志望校を取得する（中3専用）（Firestore）
 * @aiCallable
 * @param {string} studentId 生徒ID（10桁）
 * @param {number} fiscalYear 年度（例: 2025）
 * @return {Object} {success, examData: {jukoukou1,...}, latestGrade: {shogaku1, shogaku1_gakka}}
 */
function getStudentExamData(studentId, fiscalYear) {
  try {
    var sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    // Firestore から受験情報を取得
    var doc = firestoreGet_('students', sid);
    var emptyExam = { jukoukou1: '', jukoukou1_gakka: '', jukoukou1_gokaku: '', ikusei: '', jukoukou2: '', jukoukou2_gakka: '', jukoukou2_gokaku: '' };
    var examData = doc ? {
      jukoukou1:        String(doc.jukoukou1        || ''),
      jukoukou1_gakka:  String(doc.jukoukou1_gakka  || ''),
      jukoukou1_gokaku: String(doc.jukoukou1_gokaku || ''),
      ikusei:           String(doc.ikusei            || ''),
      jukoukou2:        String(doc.jukoukou2        || ''),
      jukoukou2_gakka:  String(doc.jukoukou2_gakka  || ''),
      jukoukou2_gokaku: String(doc.jukoukou2_gokaku || '')
    } : emptyExam;

    // 成績データから最新テストの第1志望校を取得
    var latestGrade = { shogaku1: '', shogaku1_gakka: '' };
    var gradeRows = getDataSheetData(fiscalYear);
    var studentRows = gradeRows.filter(function(r) {
      var rowSid = String(r.studentId || '').trim();
      if (/^\d+$/.test(rowSid) && rowSid.length < 10) rowSid = rowSid.padStart(10, '0');
      return rowSid === sid;
    });
    if (studentRows.length > 0) {
      studentRows.sort(function(a, b) {
        return new Date(b.recordedDate) - new Date(a.recordedDate);
      });
      latestGrade = {
        shogaku1:       String(studentRows[0].shogaku1       || ''),
        shogaku1_gakka: String(studentRows[0].shogaku1_gakka || '')
      };
    }

    return { success: true, examData: examData, latestGrade: latestGrade };
  } catch (error) {
    Logger.log('❌ getStudentExamDataエラー: ' + error);
    return { success: false, error: error.toString(), examData: {}, latestGrade: {} };
  }
}

/**
 * 進学先一覧データを取得する（中3生の基礎学力テスト成績＋受験情報）
 * 指定年度の中3生全員について、第1〜第3回基礎学力テストの合計点と進学先を返す
 * @aiCallable
 * @param {string} year 年度（例: "2025"）
 * @return {Array} 進学先データ配列 [{studentId, name, campus, score1, score2, score3, avg, placement, placementSchool}]
 */
function getStudentPlacementData(year) {
  try {
    // 1. その年度の全生徒を取得して中3（学年コード15）でフィルタ
    var allStudents = getMasterData(year);
    var chuu3Students = allStudents.filter(function(s) {
      return parseInt(s.grade, 10) === 15;
    });

    if (chuu3Students.length === 0) {
      return [];
    }

    // 2. 成績データから基礎学力テストのスコアを取得
    // generateStudentAnalyses と同じ getDataSheetData() を使い、'成績一覧' シートを正確に参照する
    var allGradeData = getDataSheetData(String(year));

    // gradeMap: studentId -> { '第1回基礎学力テスト': score, ... }
    var gradeMap = {};
    allGradeData.forEach(function(row) {
      var sid = String(row.studentId || '').trim();
      if (!sid) return;
      var testName = String(row.testName || '').trim();
      if (!/^第(\d+)回基礎学力テスト$/.test(testName)) return;
      var total = (row.total !== '' && row.total !== null && !isNaN(Number(row.total)))
                  ? Number(row.total) : null;
      if (!gradeMap[sid]) gradeMap[sid] = {};
      gradeMap[sid][testName] = total;
    });

    // 3. 生徒マスタから受験情報を Firestore で一括取得（中3生のみ）
    var examMap = {};
    var allDocs = firestoreQuery_('students', [
      fsFilter_('isDeleted', 'EQUAL', false)
    ]);
    allDocs.forEach(function(doc) {
      var mSid = String(doc.studentId || doc._id || '').trim();
      if (!mSid) return;
      if (doc.jukoukou1 || doc.jukoukou1_gokaku || doc.jukoukou2) {
        examMap[mSid] = {
          jukoukou1:        String(doc.jukoukou1        || '').trim(),
          jukoukou1_gakka:  String(doc.jukoukou1_gakka  || '').trim(),
          jukoukou1_gokaku: String(doc.jukoukou1_gokaku || '').trim(),
          ikusei:           String(doc.ikusei            || '').trim(),
          jukoukou2:        String(doc.jukoukou2        || '').trim(),
          jukoukou2_gakka:  String(doc.jukoukou2_gakka  || '').trim(),
          jukoukou2_gokaku: String(doc.jukoukou2_gokaku || '').trim()
        };
      }
    });

    // 4. 合格可能性計算の準備（志望校設定・塾全体平均・sigmaを使ってon-the-flyで計算）
    //    AI分析シートに頼らないため、進学先が志望校と異なる場合でも計算可能
    var sigmaConfig = getGradeAnalysisSigmaConfig();
    var sigmaTotal = (sigmaConfig && sigmaConfig.sigma) ? sigmaConfig.sigma.total : 100;

    // 各基礎学力テストの平均（合計点）を取得
    // 成績表タブのAI分析と同じ計算式にするため「学校別平均シートの平均行」を優先して使用し、
    // 未入力の場合のみ塾全体平均（getCampusAverages）にフォールバックする
    var jukuTestAvgTotal = {};
    ['第1回基礎学力テスト', '第2回基礎学力テスト', '第3回基礎学力テスト'].forEach(function(tn) {
      var schoolAvgResult = getSchoolAverages(year, tn);
      if (schoolAvgResult.success && schoolAvgResult.averages) {
        var avgRow = schoolAvgResult.averages.filter(function(a) {
          return (a.schoolName || '').trim().indexOf('平均') !== -1;
        })[0];
        if (avgRow && avgRow.total != null) {
          jukuTestAvgTotal[tn] = avgRow.total;
          return;
        }
      }
      // フォールバック：塾全体平均
      var campusResult = getCampusAverages(year, tn);
      if (campusResult.success && campusResult.campuses) {
        for (var ci = 0; ci < campusResult.campuses.length; ci++) {
          if (campusResult.campuses[ci].campusCode === 'all') {
            jukuTestAvgTotal[tn] = campusResult.campuses[ci].total;
            break;
          }
        }
      }
    });

    // 志望校設定から学校名 → 学科別偏差値マップを構築
    var schoolConfig = getSchoolConfig();
    var schoolDevMapForPlacement = {};
    schoolConfig.forEach(function(sc) {
      var deptMap = {};
      (sc.departments || []).forEach(function(d) { deptMap[d.name] = d.deviation; });
      schoolDevMapForPlacement[sc.name] = deptMap;
    });

    // 5. データを結合
    var result = chuu3Students.map(function(student) {
      var sid = student.studentId;
      var grades = gradeMap[sid] || {};
      var exam = examMap[sid] || {};

      var score1 = (grades['第1回基礎学力テスト'] !== undefined && grades['第1回基礎学力テスト'] !== null)
                   ? grades['第1回基礎学力テスト'] : null;
      var score2 = (grades['第2回基礎学力テスト'] !== undefined && grades['第2回基礎学力テスト'] !== null)
                   ? grades['第2回基礎学力テスト'] : null;
      var score3 = (grades['第3回基礎学力テスト'] !== undefined && grades['第3回基礎学力テスト'] !== null)
                   ? grades['第3回基礎学力テスト'] : null;

      // 第1〜第3回の平均（入力済みのもののみで計算）
      var validScores = [score1, score2, score3].filter(function(s) { return s !== null; });
      var avg = validScores.length > 0
              ? validScores.reduce(function(a, b) { return a + b; }, 0) / validScores.length
              : null;

      // 進学先を決定（合否情報から最終進学先を特定）
      var placementSchool = '';
      var placementDept = '';
      if (exam.ikusei === 'true') {
        // 育成型推薦 → 第1志望校へ進学
        placementSchool = exam.jukoukou1;
        placementDept = exam.jukoukou1_gakka;
      } else if (exam.jukoukou1_gokaku === '合格') {
        placementSchool = exam.jukoukou1;
        placementDept = exam.jukoukou1_gakka;
      } else if (exam.jukoukou2_gokaku === '合格') {
        placementSchool = exam.jukoukou2;
        placementDept = exam.jukoukou2_gakka;
      } else if (exam.jukoukou1) {
        // 合否未入力でも学校名がある場合は暫定表示
        placementSchool = exam.jukoukou1;
        placementDept = exam.jukoukou1_gakka;
      }

      var placement = placementSchool
                    ? (placementDept ? placementSchool + ' ' + placementDept : placementSchool)
                    : '';

      // 進学先に対する合格可能性（%）をon-the-flyで計算
      // 第1〜第3回の累積平均（生徒がデータを持つ回のみ）から偏差値を算出し、
      // 志望校設定の偏差値と比較して合格可能性を計算する
      var passPercent = null;
      if (placementSchool && validScores.length > 0) {
        // 生徒がデータを持つ回の学校平均（「平均」行合計）を収集して平均化
        var validTestNamesForCalc = [];
        if (score1 !== null) validTestNamesForCalc.push('第1回基礎学力テスト');
        if (score2 !== null) validTestNamesForCalc.push('第2回基礎学力テスト');
        if (score3 !== null) validTestNamesForCalc.push('第3回基礎学力テスト');

        var schoolAvgTotalsForCalc = validTestNamesForCalc
          .filter(function(tn) { return jukuTestAvgTotal[tn] != null; })
          .map(function(tn) { return jukuTestAvgTotal[tn]; });

        var cumulativeSchoolAvgForCalc = schoolAvgTotalsForCalc.length > 0
          ? schoolAvgTotalsForCalc.reduce(function(a, b) { return a + b; }, 0) / schoolAvgTotalsForCalc.length
          : null;

        // 生徒の累積平均スコア（avg）と累積学校平均から偏差値を算出
        var studentDev = calcDeviationValue_(avg, cumulativeSchoolAvgForCalc, sigmaTotal);

        // 進学先学校の偏差値を取得（学科一致 → 最初の学科 の順でフォールバック）
        var deptMapForCalc = schoolDevMapForPlacement[placementSchool] || {};
        var schoolDev = null;
        if (placementDept && deptMapForCalc[placementDept] != null) {
          schoolDev = deptMapForCalc[placementDept];
        } else {
          var dKeys = Object.keys(deptMapForCalc);
          if (dKeys.length > 0 && deptMapForCalc[dKeys[0]] != null) schoolDev = deptMapForCalc[dKeys[0]];
        }

        var probResult = calcPassProbability_(studentDev, schoolDev);
        if (probResult) passPercent = probResult.percent;
      }

      return {
        studentId:      sid,
        name:           student.name,
        campus:         student.campus,
        score1:         score1,
        score2:         score2,
        score3:         score3,
        avg:            avg,
        placement:      placement,
        placementSchool: placementSchool,
        passPercent:    passPercent,
        ikusei:         exam.ikusei === 'true'
      };
    });

    return result;
  } catch (error) {
    Logger.log('❌ getStudentPlacementDataエラー: ' + error);
    return [];
  }
}

/**
 * 生徒成績表PDFをDriveの 成績管理/{year}/{校舎名}/ フォルダに保存する
 * @aiCallable
 * @param {number} year 年度
 * @param {string} campusName 校舎名（フォルダ名として使用）
 * @param {string} studentName 生徒名（ファイル名として使用）
 * @param {string} pdfBase64 PDFのbase64文字列
 * @return {Object} {success, fileId, fileName, message}
 */
function saveGradeReportPdf(year, campusName, studentName, pdfBase64) {
  try {
    // Firestore移行済み。成績管理フォルダは廃止。ルートフォルダ配下の grade-reports に保存する。
    var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!rootFolderId) return { success: false, error: 'APP_FOLDER_IDが未設定' };
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var reportsFolder = getOrCreateTabFolder(rootFolder, 'grade-reports');
    var yearFolder = getOrCreateYearFolder(reportsFolder, year);

    // 校舎名サブフォルダを取得または作成
    var campusFolder;
    var subFolders = yearFolder.getFoldersByName(campusName);
    if (subFolders.hasNext()) {
      campusFolder = subFolders.next();
    } else {
      campusFolder = yearFolder.createFolder(campusName);
    }

    // 同名ファイルが既にあれば上書き（ゴミ箱へ）
    var fileName = studentName + '.pdf';
    var existing = campusFolder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    var pdfBlob = Utilities.newBlob(
      Utilities.base64Decode(pdfBase64),
      'application/pdf',
      fileName
    );
    var file = campusFolder.createFile(pdfBlob);

    return { success: true, fileId: file.getId(), fileName: fileName, message: fileName + ' を保存しました' };
  } catch (error) {
    Logger.log('❌ saveGradeReportPdfエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// テスト用エクスポート（GAS環境では無視される）
// ========================================
if (typeof module !== 'undefined') {
  module.exports = {
    getCurrentFiscalYear: getCurrentFiscalYear
  };
}
