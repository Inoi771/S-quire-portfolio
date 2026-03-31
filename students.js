
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
    var gradesFolder = getGradesFolder();
    if (!gradesFolder) {
      return { success: false, error: '成績管理フォルダが見つかりません' };
    }

    var years = [];
    var folders = gradesFolder.getFolders();
    while (folders.hasNext()) {
      var folder = folders.next();
      var name = folder.getName();
      if (/^\d{4}$/.test(name)) {
        years.push(name);
      }
    }

    years.sort(function(a, b) { return parseInt(b) - parseInt(a); });

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
 * 「生徒マスタ/」サブフォルダ内の「生徒マスタ」ファイルを使用
 * IDをスクリプトプロパティにキャッシュして次回から確実に取得する
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
 * 生徒IDから氏名を取得する
 * @param {string} studentId 生徒ID
 * @return {string} 氏名（見つからない場合は空文字）
 */
function getStudentNameById(studentId) {
  try {
    var ss = getStudentMasterSpreadsheet();
    if (!ss) return '';
    var sheet = ss.getSheetByName('生徒一覧');
    if (!sheet || sheet.getLastRow() < 2) return '';
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    var sid = String(studentId).trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    for (var i = 0; i < data.length; i++) {
      var rowId = String(data[i][0] || '').trim();
      if (/^\d+$/.test(rowId) && rowId.length < 10) rowId = rowId.padStart(10, '0');
      if (rowId === sid) return String(data[i][2] || '') + String(data[i][3] || '');
    }
    return '';
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
 * 生徒マスタデータを取得
 * 指定年度でアクティブな生徒のみ返す（削除済み除外・学年を動的計算）
 * @param {number} year 対象年度
 * @return {Array} 生徒データ配列
 */
function getMasterData(year) {
  try {

    var ss = getStudentMasterSpreadsheet();
    if (!ss) {
      Logger.log('❌ 生徒マスタが取得できません');
      return [];
    }

    var sheet = ss.getSheetByName('生徒一覧');
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('⚠ データが0件');
      return [];
    }

    // 列構成: studentId(1), campusCode(2), sei(3), mei(4), seiFurigana(5), meiFurigana(6), schoolName(7), isDeleted(8), createdAt(9)
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    var results = [];

    data.forEach(function(row) {
      try {
        var studentId = String(row[0] || '');
        // Google Sheetsが数値変換で先頭ゼロを除いた場合、10桁に補完する（例: 120251301 → 0120251301）
        if (studentId && /^\d+$/.test(studentId) && studentId.length < 10) {
          studentId = studentId.padStart(10, '0');
        }
        if (!studentId || studentId.length < 10) return;

        // 削除済みは除外
        if (row[7] === true || row[7] === 'TRUE') return;

        // IDから登録年度・登録学年を抽出
        var registrationYear  = parseInt(studentId.substring(2, 6));
        var registrationGrade = parseInt(studentId.substring(6, 8));

        // 指定年度での学年を計算
        var currentGrade = registrationGrade + (parseInt(year) - registrationYear);

        // 有効学年範囲（07〜18）外は除外
        if (currentGrade < 7 || currentGrade > 18) return;

        var sei         = String(row[2] || '');
        var mei         = String(row[3] || '');
        var seiFurigana = String(row[4] || '');
        var meiFurigana = String(row[5] || '');

        // 校舎CDも数値変換で先頭ゼロが消えた場合に補完する（例: 1 → '01'）
        var campusRaw = String(row[1] || '');
        var campus = campusRaw ? campusRaw.padStart(2, '0') : '';

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
          schoolName:     String(row[6] || ''),
          registeredDate: row[8] ? new Date(row[8]).toISOString() : new Date().toISOString()
        });
      } catch (rowError) {
      }
    });

    return results;
  } catch (error) {
    Logger.log('❌ getMasterDataエラー: ' + error);
    return [];
  }
}

/**
 * 成績データを取得
 * @param {number} year 学年年度
 * @return {Array} 成績データ配列
 */
function getDataSheetData(year) {
  try {

    var ss = getGradeDataSheet(year);
    if (!ss) {
      Logger.log('❌ スプレッドシートが取得できません');
      return [];
    }

    var sheet = ss.getSheetByName('成績一覧');
    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('⚠ データが0件');
      return [];
    }

    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15).getValues();
    var results = [];

    data.forEach(function(row) {
      try {
        // Sheetsの数値変換で先頭ゼロが消えた場合、10桁に補完する
        var studentIdRaw = String(row[0] || '');
        if (studentIdRaw && /^\d+$/.test(studentIdRaw) && studentIdRaw.length < 10) {
          studentIdRaw = studentIdRaw.padStart(10, '0');
        }

        // getValues()の生の値をそのまま使用（数値はNumber、空セルは''）
        // ※ nullを返すとGASシリアライゼーションで削除されるため、生の値を保持する
        results.push({
          studentId: studentIdRaw,
          testName: String(row[1] || '').trim(),
          kokugo:  row[2],
          shakai:  row[3],
          sugaku:  row[4],
          rika:    row[5],
          eigo:    row[6],
          total:   row[7],
          average: row[8],
          shogaku1:       row[9]  || '',
          shogaku1_gakka: row[10] || '',
          shogaku2:       row[11] || '',
          shogaku2_gakka: row[12] || '',
          recordedDate:   row[13] ? new Date(row[13]).toISOString() : new Date().toISOString(),
          studentName:    String(row[14] || '')
        });
      } catch (rowError) {
      }
    });

    return results;
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


    // AI分析シートから合格可能性（%）を一括ロード
    // {studentId|testName: {schoolName: percent}} の形式でマップ化
    var analysisPassMap = {};
    var analysisSheet = getStudentAnalysisSheet_(year);
    if (analysisSheet && analysisSheet.getLastRow() >= 2) {
      var aRows = analysisSheet.getRange(2, 1, analysisSheet.getLastRow() - 1, 3).getValues();
      aRows.forEach(function(aRow) {
        var sid = String(aRow[0] || '').trim();
        if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
        var tname = String(aRow[1] || '').trim();
        if (!sid || !tname) return;
        var data = safeJsonParse_(aRow[2], null);
        if (!data || !Array.isArray(data.passAssessment)) return;
        var m = {};
        data.passAssessment.forEach(function(pa) {
          if (pa.schoolName && pa.probability && pa.probability.percent != null) {
            m[pa.schoolName] = pa.probability.percent;
          }
        });
        analysisPassMap[sid + '|' + tname] = m;
      });
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
 * 生徒情報を登録（新規）
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

    var ss = getStudentMasterSpreadsheet();
    if (!ss) {
      return { success: false, error: '生徒マスタが見つかりません' };
    }

    var sheet = ss.getSheetByName('生徒一覧');
    var prefix = String(campusCode).padStart(2, '0') + String(year) + String(gradeCode).padStart(2, '0');
    var maxSeq = 0;
    var lastRow = sheet.getLastRow();
    var fullName     = sei.trim() + (mei ? mei.trim() : '');
    var fullFurigana = seiFurigana.trim() + (meiFurigana ? meiFurigana.trim() : '');

    if (lastRow >= 2) {
      // 8列まとめて読み込み（重複チェックと連番取得を兼ねる）
      var existingData = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

      // ① 重複チェック（削除済みを除く同一氏名・ふりがな）
      for (var i = 0; i < existingData.length; i++) {
        var r = existingData[i];
        var existName     = String(r[2]).trim() + String(r[3]).trim();
        var existFurigana = String(r[4]).trim() + String(r[5]).trim();
        if (r[7] !== true && r[7] !== 'TRUE'
            && existName === fullName
            && existFurigana === fullFurigana) {
          return { success: false, error: '同じ氏名・ふりがなの生徒がすでに登録されています（ID: ' + String(r[0]) + '）' };
        }
      }

      // 連番の最大値を取得
      // ※ Google Sheetsが数値変換で先頭ゼロを消す場合があるため、10桁に補完してからprefixと照合する
      existingData.forEach(function(r) {
        var id = String(r[0] || '');
        if (id && /^\d+$/.test(id) && id.length < 10) {
          id = id.padStart(10, '0');
        }
        if (id.indexOf(prefix) === 0) {
          var seq = parseInt(id.slice(prefix.length), 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      });
    }

    var studentId = prefix + String(maxSeq + 1).padStart(2, '0');

    // 列構成: studentId, campusCode, sei, mei, seiFurigana, meiFurigana, schoolName, isDeleted, createdAt
    // appendRowだとSheetsが数値変換して先頭ゼロを消す場合があるため、setValuesで書き込み後にIDをテキスト形式に設定
    var newRow = lastRow + 1;
    sheet.getRange(newRow, 1, 1, 9).setValues([[
      studentId,
      String(campusCode),
      sei.trim(),
      mei.trim() || '',
      seiFurigana.trim(),
      meiFurigana.trim() || '',
      schoolName.trim() || '',
      false,
      new Date().toISOString()
    ]]);
    // IDと校舎CDの列をテキスト形式に明示的に設定（先頭ゼロの保持）
    sheet.getRange(newRow, 1).setNumberFormat('@');
    sheet.getRange(newRow, 2).setNumberFormat('@');

    return { success: true, message: '生徒情報を登録しました', studentId: studentId };
  } catch (error) {
    Logger.log('❌ submitStudentInfoエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒情報を更新
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
    var ss = getStudentMasterSpreadsheet();
    if (!ss) return { success: false, error: '生徒マスタが見つかりません' };

    var sheet = ss.getSheetByName('生徒一覧');
    var rowIndex = findStudentRowIndex_(sheet, studentId);
    if (rowIndex === -1) return { success: false, error: '生徒が見つかりません' };

    // 列2〜7（校舎CD, 姓, 名, 姓ふりがな, 名ふりがな, 学校名）を更新
    var normalizedCampus = String(campusCode).padStart(2, '0');
    sheet.getRange(rowIndex, 2, 1, 6).setValues([[
      normalizedCampus, sei.trim(), mei.trim() || '', seiFurigana.trim(), meiFurigana.trim() || '', schoolName.trim() || ''
    ]]);
    // 校舎CDがシートで数値化されないようテキスト書式を設定
    sheet.getRange(rowIndex, 2).setNumberFormat('@');

    return { success: true, message: '生徒情報を更新しました' };
  } catch (error) {
    Logger.log('❌ updateStudentInfoエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒を削除（ソフトデリート）
 * @aiCallable
 * @param {string} studentId 生徒ID
 * @return {Object} { success, message, error }
 */
function deleteStudent(studentId) {
  try {
    var ss = getStudentMasterSpreadsheet();
    if (!ss) return { success: false, error: '生徒マスタが見つかりません' };

    var sheet = ss.getSheetByName('生徒一覧');
    var rowIndex = findStudentRowIndex_(sheet, studentId);
    if (rowIndex === -1) return { success: false, error: '生徒が見つかりません' };

    // 列8（削除済み）を TRUE に設定
    sheet.getRange(rowIndex, 8).setValue(true);

    return { success: true, message: '生徒を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteStudentエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 削除済み生徒を取得（復元UI用）
 * @aiCallable
 * @param {string} campusCode 校舎コード（空=全校舎）
 * @param {string|null} gradeCode 学年コード（null=全学年）
 * @param {number|null} selectedYear 年度（null=全年度）
 * @return {Object} { success, students, error }
 */
function getDeletedStudents(campusCode, gradeCode, selectedYear) {
  try {
    var ss = getStudentMasterSpreadsheet();
    if (!ss) return { success: false, error: '生徒マスタが見つかりません', students: [] };

    var sheet = ss.getSheetByName('生徒一覧');
    if (!sheet || sheet.getLastRow() < 2) return { success: true, students: [] };

    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
    var students = [];

    data.forEach(function(row) {
      var studentId = String(row[0] || '');
      // 先頭ゼロが消えた場合に補完
      if (studentId && /^\d+$/.test(studentId) && studentId.length < 10) {
        studentId = studentId.padStart(10, '0');
      }
      if (!studentId || studentId.length < 10) return;

      // 削除済みのみ対象
      if (row[7] !== true && row[7] !== 'TRUE') return;

      // 校舎フィルタ（先頭ゼロ補完で比較）
      var rowCampus = String(row[1] || '').padStart(2, '0');
      if (campusCode && rowCampus !== String(campusCode).padStart(2, '0')) return;

      // 年度フィルタ（IDから登録年度を抽出）
      var regYear  = parseInt(studentId.substring(2, 6));
      var regGrade = parseInt(studentId.substring(6, 8));
      if (selectedYear && regYear !== parseInt(selectedYear)) return;

      // 学年フィルタ（指定年度での計算学年で比較）
      if (gradeCode && selectedYear) {
        var calcGrade = regGrade + (parseInt(selectedYear) - regYear);
        if (String(calcGrade).padStart(2, '0') !== String(gradeCode).padStart(2, '0')) return;
      } else if (gradeCode && !selectedYear) {
        if (String(regGrade).padStart(2, '0') !== String(gradeCode).padStart(2, '0')) return;
      }

      students.push({
        studentId:         studentId,
        campus:            String(row[1] || ''),
        name:              String(row[2] || '') + String(row[3] || ''),
        furigana:          String(row[4] || '') + String(row[5] || ''),
        schoolName:        String(row[6] || ''),
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
 * 削除済み生徒を復元
 * @aiCallable
 * @param {string} studentId 生徒ID
 * @return {Object} { success, message, error }
 */
function restoreStudent(studentId) {
  try {
    var ss = getStudentMasterSpreadsheet();
    if (!ss) return { success: false, error: '生徒マスタが見つかりません' };

    var sheet = ss.getSheetByName('生徒一覧');
    var rowIndex = findStudentRowIndex_(sheet, studentId);
    if (rowIndex === -1) return { success: false, error: '生徒が見つかりません' };

    sheet.getRange(rowIndex, 8).setValue(false);

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
 * 生徒IDとテスト名で既存の成績データを1件取得
 * @aiCallable
 * @param {number} year 対象年度
 * @param {string} studentId 生徒ID
 * @param {string} testName テスト名
 * @return {Object} { success, found, data, error }
 */
function getGradeDataByStudentAndTest(year, studentId, testName) {
  try {
    var ss = getGradeDataSheet(year);
    if (!ss) return { success: true, found: false };

    var sheet = ss.getSheetByName('成績一覧');
    if (!sheet || sheet.getLastRow() < 2) return { success: true, found: false };

    var numRows = sheet.getLastRow() - 1;
    var rows = sheet.getRange(2, 1, numRows, 15).getValues();

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      // Sheetsの数値変換で先頭ゼロが消えた場合に10桁へ補完して比較
      var rowStudentId = String(row[0] || '').trim();
      if (rowStudentId && /^\d+$/.test(rowStudentId) && rowStudentId.length < 10) {
        rowStudentId = rowStudentId.padStart(10, '0');
      }
      if (rowStudentId === String(studentId).trim() &&
          String(row[1]).trim() === String(testName).trim()) {
        return {
          success: true,
          found: true,
          data: {
            kokugo:         row[2],
            shakai:         row[3],
            sugaku:         row[4],
            rika:           row[5],
            eigo:           row[6],
            gokei:          row[7],
            shogaku1:       row[9]  || '',
            shogaku1_gakka: row[10] || '',
            shogaku2:       row[11] || '',
            shogaku2_gakka: row[12] || ''
          }
        };
      }
    }
    return { success: true, found: false };
  } catch (error) {
    Logger.log('❌ getGradeDataByStudentAndTestエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績データを登録（既存行があれば上書き更新、なければ新規追加）
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} studentId 生徒ID
 * @param {string} testName テスト名
 * @param {Object} scores スコアオブジェクト
 * @return {Object} { success, message, error }
 */
function submitGradeData(year, studentId, testName, scores) {
  try {
    
    // バリデーション
    if (!studentId || !testName) {
      return {
        success: false,
        error: '生徒IDとテスト名は必須です'
      };
    }
    
    // スプレッドシートを取得
    var ss = getGradeDataSheet(year);
    if (!ss) {
      return {
        success: false,
        error: 'スプレッドシートが見つかりません'
      };
    }
    
    var sheet = ss.getSheetByName('成績一覧');

    // スコア値を数値に変換
    var kokugo = parseInt(scores.kokugo) || 0;
    var shakai = parseInt(scores.shakai) || 0;
    var sugaku = parseInt(scores.sugaku) || 0;
    var rika   = parseInt(scores.rika)   || 0;
    var eigo   = parseInt(scores.eigo)   || 0;
    var calcTotal = kokugo + shakai + sugaku + rika + eigo;
    var total   = (scores.gokei && parseInt(scores.gokei) > 0) ? parseInt(scores.gokei) : calcTotal;
    var average = total > 0 ? (total / 5).toFixed(1) : 0;

    // 氏名を取得（scores.studentName があればそれを、なければマスタから検索）
    var studentName = scores.studentName || getStudentNameById(studentId);

    var rowData = [
      studentId, testName,
      kokugo, shakai, sugaku, rika, eigo,
      total, average,
      scores.shogaku1       || '',
      scores.shogaku1_gakka || '',
      scores.shogaku2       || '',
      scores.shogaku2_gakka || '',
      new Date().toISOString(),
      studentName
    ];

    // 既存行を検索して upsert（同じ生徒ID + テスト名があれば上書き、なければ追加）
    var existingRowIndex = -1;
    if (sheet.getLastRow() >= 2) {
      var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < ids.length; i++) {
        // Sheetsの数値変換で先頭ゼロが消えた場合に10桁へ補完して比較
        var idStr = String(ids[i][0] || '').trim();
        if (idStr && /^\d+$/.test(idStr) && idStr.length < 10) {
          idStr = idStr.padStart(10, '0');
        }
        if (idStr === String(studentId).trim() &&
            String(ids[i][1]).trim() === String(testName).trim()) {
          existingRowIndex = i + 2; // ヘッダー行分 +1、0-indexed分 +1
          break;
        }
      }
    }

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, rowData.length).setValues([rowData]);
      // A列をテキスト形式に設定して先頭ゼロを保持
      sheet.getRange(existingRowIndex, 1).setNumberFormat('@');
      return { success: true, message: '成績データを上書き更新しました' };
    } else {
      sheet.appendRow(rowData);
      // A列をテキスト形式に設定して先頭ゼロを保持
      sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('@');
      return { success: true, message: '成績データを新規保存しました' };
    }
  } catch (error) {
    Logger.log('❌ submitGradeDataエラー: ' + error);
    return {
      success: false,
      error: error.toString()
    };
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
 * 年度別成績スプレッドシート内に「学校別平均点」シートを取得または作成する
 * @param {number} year 学年年度
 * @return {Sheet|null} シートオブジェクト
 */
function getAveragesSheet(year) {
  try {
    var ss = getGradeDataSheet(year);
    if (!ss) return null;

    var sheetName = '学校別平均点';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = ['テスト名', '学校名', '国語', '社会', '数学', '理科', '英語', '合計', '更新日時'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    return sheet;
  } catch (error) {
    Logger.log('❌ getAveragesSheetエラー: ' + error);
    return null;
  }
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
    var sheet = getAveragesSheet(year);
    if (!sheet) return { success: true, averages: [] };

    var rows = sheet.getDataRange().getValues();
    var averages = [];
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (String(row[0]).trim() !== String(testName).trim()) continue;
      averages.push({
        schoolName: String(row[1]).trim(),
        kokugo:     row[2] === '' ? '' : Number(row[2]),
        shakai:     row[3] === '' ? '' : Number(row[3]),
        sugaku:     row[4] === '' ? '' : Number(row[4]),
        rika:       row[5] === '' ? '' : Number(row[5]),
        eigo:       row[6] === '' ? '' : Number(row[6]),
        total:      row[7] === '' ? '' : Number(row[7])
      });
    }
    return { success: true, averages: averages };
  } catch (error) {
    Logger.log('❌ getSchoolAveragesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 学校別平均点を保存する（upsert）
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @param {Array} dataArray [{schoolName, kokugo, shakai, sugaku, rika, eigo, total}] totalは任意（指定時優先）
 * @param {boolean} skipExisting trueの場合、既存の非ゼロ値はスキップ（OCRモード）
 * @return {Object} { success, savedCount, updatedCount }
 */
function saveSchoolAverages(year, testName, dataArray, skipExisting) {
  try {
    var sheet = getAveragesSheet(year);
    if (!sheet) return { success: false, error: '成績データシートが見つかりません' };

    var rows = sheet.getDataRange().getValues();
    var existingMap = {};
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === String(testName).trim()) {
        existingMap[String(rows[i][1]).trim()] = i + 1; // 1-indexed row number
      }
    }

    var savedCount = 0;
    var updatedCount = 0;
    var now = new Date().toISOString();

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

      var rowValues = [testName, schoolName, kokugo, shakai, sugaku, rika, eigo, total, now];

      if (existingMap[schoolName]) {
        var rowNum = existingMap[schoolName];
        if (skipExisting) {
          // OCRモード: 既存の非ゼロ値はスキップして空/ゼロのみ補完
          var existRow = rows[rowNum - 1];
          var merged = [testName, schoolName,
            (existRow[2] && existRow[2] !== 0) ? existRow[2] : (kokugo !== null ? kokugo : existRow[2]),
            (existRow[3] && existRow[3] !== 0) ? existRow[3] : (shakai !== null ? shakai : existRow[3]),
            (existRow[4] && existRow[4] !== 0) ? existRow[4] : (sugaku !== null ? sugaku : existRow[4]),
            (existRow[5] && existRow[5] !== 0) ? existRow[5] : (rika   !== null ? rika   : existRow[5]),
            (existRow[6] && existRow[6] !== 0) ? existRow[6] : (eigo   !== null ? eigo   : existRow[6]),
            null, now
          ];
          var mergedTotal = [merged[2], merged[3], merged[4], merged[5], merged[6]]
            .filter(function(v) { return v !== null && v !== ''; });
          merged[7] = mergedTotal.length === 5 ? mergedTotal.reduce(function(a, b) { return Number(a) + Number(b); }, 0) : null;
          sheet.getRange(rowNum, 1, 1, merged.length).setValues([merged]);
        } else {
          sheet.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
        }
        updatedCount++;
      } else {
        sheet.appendRow(rowValues);
        savedCount++;
      }
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
 * 生徒を一括インポートする（ふりがな省略可・Admin のみ）
 * @param {string} studentsJson JSON文字列 [{campusCode, gradeCode, sei, mei}]
 * @param {number} [importYear] 登録年度（省略時は現在の学年年度）
 * @return {Object} { success, total, savedCount, skippedCount, errors[] }
 */
function bulkImportStudents(studentsJson, importYear) {
  try {
    if (!isAdmin()) {
      return { success: false, error: 'Admin のみアクセス可能' };
    }

    var students = JSON.parse(studentsJson);
    if (!Array.isArray(students) || students.length === 0) {
      return { success: false, error: 'インポートデータが空です' };
    }

    var year = importYear ? parseInt(importYear, 10) : getCurrentFiscalYear();
    var ss = getStudentMasterSpreadsheet();
    if (!ss) {
      return { success: false, error: '生徒マスタが見つかりません' };
    }

    var sheet = ss.getSheetByName('生徒一覧');
    var savedCount = 0;
    var skippedCount = 0;
    var errors = [];

    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var sei = (s.sei || '').trim();
      var mei = (s.mei || '').trim();
      var campusCode = (s.campusCode || '').trim();
      var gradeCode = (s.gradeCode || '').trim();

      if (!sei || !campusCode || !gradeCode) {
        errors.push({ row: i + 1, name: sei || '（空）', reason: '必須項目が不足しています' });
        skippedCount++;
        continue;
      }

      // 重複チェックと連番取得
      var prefix = String(campusCode).padStart(2, '0') + String(year) + String(gradeCode).padStart(2, '0');
      var maxSeq = 0;
      var lastRow = sheet.getLastRow();
      var fullName = sei + mei;
      var isDuplicate = false;

      if (lastRow >= 2) {
        var existingData = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

        for (var j = 0; j < existingData.length; j++) {
          var r = existingData[j];
          // 同名チェック（ふりがななしで登録する場合、氏名のみで重複判定）
          var existName = String(r[2]).trim() + String(r[3]).trim();
          if (r[7] !== true && r[7] !== 'TRUE' && existName === fullName) {
            isDuplicate = true;
            break;
          }
        }

        if (isDuplicate) {
          errors.push({ row: i + 1, name: sei + ' ' + mei, reason: '同名の生徒が既に登録されています（スキップ）' });
          skippedCount++;
          continue;
        }

        // 連番の最大値を取得
        existingData.forEach(function(r) {
          var id = String(r[0] || '');
          if (id && /^\d+$/.test(id) && id.length < 10) {
            id = id.padStart(10, '0');
          }
          if (id.indexOf(prefix) === 0) {
            var seq = parseInt(id.slice(prefix.length), 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        });
      }

      var studentId = prefix + String(maxSeq + 1).padStart(2, '0');
      var newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1, 1, 9).setValues([[
        studentId,
        String(campusCode).padStart(2, '0'),
        sei,
        mei,
        '',   // 姓ふりがな（空欄）
        '',   // 名ふりがな（空欄）
        '',   // 学校名（空欄）
        false,
        new Date().toISOString()
      ]]);
      sheet.getRange(newRow, 1).setNumberFormat('@');
      sheet.getRange(newRow, 2).setNumberFormat('@');

      savedCount++;
    }

    return {
      success: true,
      total: students.length,
      savedCount: savedCount,
      skippedCount: skippedCount,
      errors: errors
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
 * 生徒の受験情報を生徒マスタに保存する（中3専用）
 * 生徒マスタシートの列10〜16に書き込む
 * @aiCallable
 * @param {string} studentId 生徒ID（10桁）
 * @param {string} examDataJson JSON文字列 {jukoukou1, jukoukou1_gakka, jukoukou1_gokaku, ikusei, jukoukou2, jukoukou2_gakka, jukoukou2_gokaku}
 * @return {Object} {success, message}
 */
function saveExamResult(studentId, examDataJson) {
  try {
    var examData = safeJsonParse_(examDataJson, {});
    var ss = getStudentMasterSpreadsheet();
    var sheet = ss.getSheetByName('生徒一覧');
    if (!sheet) return { success: false, error: '生徒一覧シートが見つかりません' };

    var rowIndex = findStudentRowIndex_(sheet, studentId);
    if (rowIndex < 0) return { success: false, error: '生徒が見つかりません: ' + studentId };

    // 列10〜16に受験情報を書き込む
    sheet.getRange(rowIndex, 10, 1, 7).setValues([[
      examData.jukoukou1      || '',
      examData.jukoukou1_gakka || '',
      examData.jukoukou1_gokaku || '',
      examData.ikusei         || '',
      examData.jukoukou2      || '',
      examData.jukoukou2_gakka || '',
      examData.jukoukou2_gokaku || ''
    ]]);

    return { success: true, message: '受験情報を保存しました' };
  } catch (error) {
    Logger.log('❌ saveExamResultエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒の受験情報と最新テストの第1志望校を取得する（中3専用）
 * @aiCallable
 * @param {string} studentId 生徒ID（10桁）
 * @param {number} fiscalYear 年度（例: 2025）
 * @return {Object} {success, examData: {jukoukou1,...}, latestGrade: {shogaku1, shogaku1_gakka}}
 */
function getStudentExamData(studentId, fiscalYear) {
  try {
    // 生徒マスタから受験情報（列10〜16）を取得
    var ss = getStudentMasterSpreadsheet();
    var sheet = ss.getSheetByName('生徒一覧');
    var examData = { jukoukou1: '', jukoukou1_gakka: '', jukoukou1_gokaku: '', ikusei: '', jukoukou2: '', jukoukou2_gakka: '', jukoukou2_gokaku: '' };
    if (sheet) {
      var rowIndex = findStudentRowIndex_(sheet, studentId);
      if (rowIndex >= 0) {
        var row = sheet.getRange(rowIndex, 10, 1, 7).getValues()[0];
        examData = {
          jukoukou1:       String(row[0] || ''),
          jukoukou1_gakka: String(row[1] || ''),
          jukoukou1_gokaku: String(row[2] || ''),
          ikusei:          String(row[3] || ''),
          jukoukou2:       String(row[4] || ''),
          jukoukou2_gakka: String(row[5] || ''),
          jukoukou2_gokaku: String(row[6] || '')
        };
      }
    }

    // 成績データから最新テストの第1志望校を取得
    var latestGrade = { shogaku1: '', shogaku1_gakka: '' };
    var gradeRows = getDataSheetData(fiscalYear);
    var studentRows = gradeRows.filter(function(r) {
      var sid = String(r.studentId || '').trim();
      if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
      var target = String(studentId || '').trim();
      if (/^\d+$/.test(target) && target.length < 10) target = target.padStart(10, '0');
      return sid === target;
    });
    if (studentRows.length > 0) {
      // recordedDateで降順ソートして最新を取得
      studentRows.sort(function(a, b) {
        return new Date(b.recordedDate) - new Date(a.recordedDate);
      });
      latestGrade = {
        shogaku1:       String(studentRows[0].shogaku1 || ''),
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

    // 3. 生徒マスタから受験情報（列10〜16）を一括取得
    // ※ getDataRange() は実データがある列までしか返さないため、常に16列以上を読む
    var masterSS = getStudentMasterSpreadsheet();
    var masterSheet = masterSS.getSheetByName('生徒一覧');
    var masterLastRow = masterSheet.getLastRow();
    var masterReadCols = Math.max(masterSheet.getLastColumn(), 16);
    var masterRows = masterLastRow >= 1
      ? masterSheet.getRange(1, 1, masterLastRow, masterReadCols).getValues()
      : [];

    var examMap = {};
    for (var j = 1; j < masterRows.length; j++) {
      var mRow = masterRows[j];
      var mSid = String(mRow[0] || '').trim();
      if (/^\d+$/.test(mSid) && mSid.length < 10) mSid = mSid.padStart(10, '0');
      if (!mSid) continue;

      examMap[mSid] = {
        jukoukou1:        String(mRow[9]  || '').trim(),
        jukoukou1_gakka:  String(mRow[10] || '').trim(),
        jukoukou1_gokaku: String(mRow[11] || '').trim(),
        ikusei:           String(mRow[12] || '').trim(),
        jukoukou2:        String(mRow[13] || '').trim(),
        jukoukou2_gakka:  String(mRow[14] || '').trim(),
        jukoukou2_gokaku: String(mRow[15] || '').trim()
      };
    }

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
    var gradesFolder = getGradesFolder();
    var yearFolder   = getOrCreateYearFolder(gradesFolder, year);

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
