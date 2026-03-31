
// ========================================
// 【セクション4】スケジュール管理
// ========================================
// PDF からの予定抽出、スケジュール更新、データ取得

/**
 * フォルダ名から子フォルダを取得
 * @param {Folder} parentFolder 親フォルダ
 * @param {string} folderName 検索するフォルダ名
 * @return {Folder|null} 見つかったフォルダ、または null
 */
function getFolderByName(parentFolder, folderName) {
  try {
    var folders = parentFolder.getFoldersByName(folderName);
    return folders.hasNext() ? folders.next() : null;
  } catch (error) {
    Logger.log('❌ getFolderByNameエラー: ' + error);
    return null;
  }
}

/**
 * フォルダ名からファイルを取得
 * @param {Folder} parentFolder 親フォルダ
 * @param {string} fileName 検索するファイル名
 * @return {File|null} 見つかったファイル、または null
 */
function getFileByName(parentFolder, fileName) {
  try {
    var files = parentFolder.getFilesByName(fileName);
    return files.hasNext() ? files.next() : null;
  } catch (error) {
    Logger.log('❌ getFileByNameエラー: ' + error);
    return null;
  }
}

/**
 * スケジュール用フォルダを取得
 * 「月間スケジュール」フォルダへのアクセスポイント
 * @return {Folder|null} 月間スケジュールフォルダ
 */
function getScheduleFolder() {
  try {
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return null;
    }
    
    var rootFolder = DriveApp.getFolderById(appFolderId);
    var scheduleFolder = getFolderByName(rootFolder, '月間スケジュール');
    
    if (!scheduleFolder) {
      Logger.log('❌ 月間スケジュールフォルダが見つかりません');
      return null;
    }
    
    return scheduleFolder;
  } catch (error) {
    Logger.log('❌ getScheduleFolderエラー: ' + error);
    return null;
  }
}

/**
 * スケジュールデータを取得
 * 月間スケジュールタブ表示用にすべての予定データを返す
 * 各年度フォルダの「××年度_予定データ」シートを読み込む
 * @aiCallable
 * @return {Array} スケジュール配列
 *   各要素: { timestamp, school, eventType, schedule, details, source }
 */
function getScheduleData() {
  try {
    
    var scheduleFolder = getScheduleFolder();
    
    if (!scheduleFolder) {
      Logger.log('❌ スケジュールフォルダが取得できません');
      return [];
    }
    
    var allResults = [];
    var yearFolders = scheduleFolder.getFolders();
    
    while (yearFolders.hasNext()) {
      var yearFolder = yearFolders.next();
      var folderName = yearFolder.getName();
      
      // 4桁の年度フォルダのみ処理
      if (!/^\d{4}$/.test(folderName)) {
        Logger.log('⚠ スキップ（非年度フォルダ）: ' + folderName);
        continue;
      }
      
      var baseYear = parseInt(folderName);
      
      try {
        var sheetName = baseYear + '年度_予定データ';
        var file = getFileByName(yearFolder, sheetName);
        
        if (!file) {
          Logger.log('⚠ ' + baseYear + '年度のスプレッドシートが見つかりません');
          continue;
        }
        
        var ss = SpreadsheetApp.openById(file.getId());
        var sheet = ss.getSheetByName('予定一覧');
        
        if (!sheet || sheet.getLastRow() < 2) {
          Logger.log('⚠ ' + baseYear + '年度のデータが0件');
          continue;
        }
        
        var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
        
        data.forEach(function(row) {
          try {
            var timestamp = row[0] ? new Date(row[0]).toISOString() : new Date().toISOString();
            var school = String(row[1] || '');
            var eventType = String(row[2] || '');
            var monthDay = String(row[3] || '').trim();
            var details = String(row[4] || '');
            var source = String(row[5] || '');

            // Gemini が年を含めて返した場合の重複を防ぐため、4桁年を除去
            monthDay = monthDay.replace(/\d{4}年/g, '');

            // 月を抽出
            var monthMatch = monthDay.match(/(\d{1,2})月/);
            if (!monthMatch) {
              Logger.log('⚠ 月の抽出失敗: ' + monthDay);
              return;
            }
            
            var month = parseInt(monthMatch[1]);
            // 1-3月は次年度、4-12月は該当年度
            var actualYear = (month >= 1 && month <= 3) ? baseYear + 1 : baseYear;
            var schedule = actualYear + '年' + monthDay;
            
            allResults.push({
              timestamp: timestamp,
              school: school,
              eventType: eventType,
              schedule: schedule,
              details: details,
              source: source
            });
          } catch (rowError) {
          }
        });
        
        
      } catch (yearError) {
        Logger.log('❌ ' + baseYear + '年度の処理エラー: ' + yearError);
      }
    }
    
    return allResults;
    
  } catch (error) {
    Logger.log('❌ getScheduleData エラー: ' + error);
    return [];
  }
}

/**
 * 予定入力フォーム用：ドロップダウンの選択肢を取得
 * 「予定データ」シートから動的に読み込み、頻度でソート
 * @aiCallable
 * @return {Object} { schools: [...], eventNames: [...], details: [...] }
 */
function getScheduleDropdownData() {
  try {
    var year = getCurrentFiscalYear();
    var yearFolder = getOrCreateYearFolder(getScheduleFolder(), String(year));
    var spreadsheet = getOrCreateSpreadsheet(yearFolder, year);
    var sheet = spreadsheet.getSheetByName('予定一覧');
    
    if (!sheet || sheet.getLastRow() < 2) {
      // データがない場合は空配列を返す
      return {
        schools: ['塾', 'その他'],
        eventNames: ['その他'],
        details: ['その他']
      };
    }
    
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    
    // 各列のユニーク値を取得して集計
    var schoolCount = {};
    var eventCount = {};
    var detailCount = {};
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      
      // 列2：学校名
      if (row[1]) {
        schoolCount[row[1]] = (schoolCount[row[1]] || 0) + 1;
      }
      
      // 列3：イベント名
      if (row[2]) {
        eventCount[row[2]] = (eventCount[row[2]] || 0) + 1;
      }
      
      // 列5：詳細
      if (row[4]) {
        detailCount[row[4]] = (detailCount[row[4]] || 0) + 1;
      }
    }
    
    // 頻度でソート（多い順）
    var sortByFrequency = function(countObj) {
      var sorted = Object.keys(countObj).sort(function(a, b) {
        return countObj[b] - countObj[a];
      });
      sorted.push('その他');  // 最後に「その他」を追加
      return sorted;
    };
    
    return {
      schools: sortByFrequency(schoolCount),
      eventNames: sortByFrequency(eventCount),
      details: sortByFrequency(detailCount)
    };
    
  } catch (error) {
    Logger.log('❌ getScheduleDropdownData エラー: ' + error);
    return {
      schools: ['塾', 'その他'],
      eventNames: ['その他'],
      details: ['その他']
    };
  }
}

/**
 * 新しい予定をシートに追加
 * Admin フォームから呼び出される
 * @aiCallable
 * @param {string} schoolName 学校名
 * @param {string} eventName イベント名
 * @param {string} dateStr 日付（例：7月19日（土））
 * @param {string} details 詳細（省略可）
 * @return {Object} { success, message, error }
 */
function addScheduleEntry(schoolName, eventName, dateStr, details) {
  try {
    if (!schoolName || !eventName || !dateStr) {
      return {
        success: false,
        error: '学校名、イベント名、日付は必須です'
      };
    }
    
    var year = getCurrentFiscalYear();
    var yearFolder = getOrCreateYearFolder(getScheduleFolder(), String(year));
    var spreadsheet = getOrCreateSpreadsheet(yearFolder, year);
    var sheet = spreadsheet.getSheetByName('予定一覧');
    
    // 新しい行を追加
    sheet.appendRow([
      new Date(),           // 更新日時
      schoolName,           // 学校名
      eventName,            // イベント名
      dateStr,              // 日付
      details || '',        // 詳細
      'Admin 直接入力'      // 情報源
    ]);
    
    
    return {
      success: true,
      message: '予定を追加しました'
    };
    
  } catch (error) {
    Logger.log('❌ addScheduleEntry エラー: ' + error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * 管理者が自由に追加したカスタムイベントを保存する（Admin のみ）
 * 日付から年度フォルダを自動判定して「予定一覧」シートに書き込む
 * @aiCallable
 * @param {string} schoolName 学校・施設名（塾/中学校名/高校名）
 * @param {string} eventName イベント名
 * @param {number} dateYear 日付の年（例: 2025）
 * @param {number} dateMonth 日付の月（例: 7）
 * @param {number} dateDay 日付の日（例: 19）
 * @param {string} details 詳細テキスト（任意）
 * @return {Object} 処理結果 { success, timestamp, fiscalYear }
 */
function addCustomScheduleEntry(schoolName, eventName, dateYear, dateMonth, dateDay, details) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    if (!schoolName || !eventName || !dateYear || !dateMonth || !dateDay) {
      return { success: false, error: '学校名・イベント名・日付は必須です' };
    }
    // 月から年度を計算（4月始まり）
    var fiscalYear = (dateMonth >= 4) ? dateYear : dateYear - 1;
    var yearFolder = getOrCreateYearFolder(getScheduleFolder(), String(fiscalYear));
    var spreadsheet = getOrCreateSpreadsheet(yearFolder, fiscalYear);
    var sheet = spreadsheet.getSheetByName('予定一覧');
    var dateStr = dateMonth + '月' + dateDay + '日';
    var now = new Date();
    sheet.appendRow([
      now,                    // 更新日時
      schoolName,             // 学校名
      eventName,              // イベント名
      dateStr,                // 日付（M月D日形式）
      details || '',          // 詳細
      'Admin 直接入力'        // 情報源
    ]);
    return { success: true, message: '追加しました', timestamp: now.toISOString(), fiscalYear: fiscalYear };
  } catch (error) {
    Logger.log('❌ addCustomScheduleEntryエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Admin が手動で追加したカスタムイベントを全年度分取得する（Admin のみ）
 * source が「Admin 直接入力」の行のみを返す
 * @return {Array} カスタムイベントの配列 [{ fiscalYear, timestamp, school, eventType, schedule, details }]
 */
function getAdminScheduleEntries() {
  if (!isAdmin()) return [];
  try {
    var scheduleFolder = getScheduleFolder();
    if (!scheduleFolder) return [];
    var results = [];
    var yearFolders = scheduleFolder.getFolders();
    while (yearFolders.hasNext()) {
      var yearFolder = yearFolders.next();
      var folderName = yearFolder.getName();
      if (!/^\d{4}$/.test(folderName)) continue;
      var baseYear = parseInt(folderName);
      try {
        var file = getFileByName(yearFolder, baseYear + '年度_予定データ');
        if (!file) continue;
        var ss = SpreadsheetApp.openById(file.getId());
        var sheet = ss.getSheetByName('予定一覧');
        if (!sheet || sheet.getLastRow() < 2) continue;
        var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
        data.forEach(function(row, idx) {
          if (String(row[5] || '') !== 'Admin 直接入力') return;
          var monthDay = String(row[3] || '').trim();
          var monthMatch = monthDay.match(/(\d{1,2})月/);
          if (!monthMatch) return;
          var month = parseInt(monthMatch[1]);
          var actualYear = (month >= 1 && month <= 3) ? baseYear + 1 : baseYear;
          results.push({
            fiscalYear: baseYear,
            rowIndex: idx + 2, // 1-indexed、ヘッダー1行分オフセット
            timestamp: row[0] ? new Date(row[0]).toISOString() : '',
            school: String(row[1] || ''),
            eventType: String(row[2] || ''),
            schedule: actualYear + '年' + monthDay,
            details: String(row[4] || '')
          });
        });
      } catch (e) {
        Logger.log('⚠ getAdminScheduleEntries: ' + baseYear + '年度エラー: ' + e);
      }
    }
    return results;
  } catch (error) {
    Logger.log('❌ getAdminScheduleEntriesエラー: ' + error);
    return [];
  }
}

/**
 * Admin が手動で追加したカスタムイベントを1件削除する（Admin のみ）
 * タイムスタンプと年度で一致する行を削除する
 * @param {number} fiscalYear 年度
 * @param {string} timestampStr ISO形式のタイムスタンプ文字列
 * @return {Object} 処理結果
 */
function deleteCustomScheduleEntry(fiscalYear, timestampStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var yearFolder = getOrCreateYearFolder(getScheduleFolder(), String(fiscalYear));
    var file = getFileByName(yearFolder, fiscalYear + '年度_予定データ');
    if (!file) return { success: false, error: 'スプレッドシートが見つかりません' };
    var ss = SpreadsheetApp.openById(file.getId());
    var sheet = ss.getSheetByName('予定一覧');
    if (!sheet || sheet.getLastRow() < 2) return { success: false, error: 'データが見つかりません' };
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    var targetRow = -1;
    var targetTs = new Date(timestampStr).getTime();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][5] || '') !== 'Admin 直接入力') continue;
      var rowTs = data[i][0] ? new Date(data[i][0]).getTime() : -1;
      if (Math.abs(rowTs - targetTs) < 1000) { // 1秒以内の誤差を許容
        targetRow = i + 2; // 1-indexed + ヘッダー1行
        break;
      }
    }
    if (targetRow === -1) return { success: false, error: '対象のイベントが見つかりません' };
    sheet.deleteRow(targetRow);
    return { success: true, message: '削除しました' };
  } catch (error) {
    Logger.log('❌ deleteCustomScheduleEntryエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * スケジュール管理情報（ログ出力のみ）
 * 実際の予定入力は Admin フォームから実施
 *
 * @return {Object} { success, message }
 */
function updateSchedules() {
  try {
    
    var scheduleFolder = getScheduleFolder();
    
    if (!scheduleFolder) {
      Logger.log('❌ スケジュールフォルダが取得できません');
      return { success: false, count: 0, error: 'スケジュールフォルダが見つかりません' };
    }
    
    var totalCount = 0;
    var yearFolders = scheduleFolder.getFolders();
    
    while (yearFolders.hasNext()) {
      var yearFolder = yearFolders.next();
      var folderName = yearFolder.getName();
      
      // 4桁の年度フォルダのみ処理
      if (!/^\d{4}$/.test(folderName)) {
        Logger.log('⚠ スキップ（非年度フォルダ）: ' + folderName);
        continue;
      }
      
      var year = parseInt(folderName);
      
      // 新しい autoImportAllSchedules 関数を呼び出し
      var result = autoImportAllSchedules(year);
      
      if (result && result.success) {
        totalCount += result.totalCount;
      }
    }
    
    
    return {
      success: true,
      count: totalCount,
      message: totalCount + '件の予定を更新しました'
    };
    
  } catch (error) {
    Logger.log('❌ updateSchedules エラー: ' + error);
    return { success: false, count: 0, error: error.toString() };
  }
}

/**
 * PDFからテキストを抽出
 * Google Docs を使用して OCR 処理を実行
 * @param {File} file PDF ファイル
 * @return {string} 抽出されたテキスト
 */
function extractTextFromPDF(file) {
  var tempFileId = null;
  var docId = null;
  try {

    var blob = file.getBlob();
    var tempFolder = DriveApp.getRootFolder();
    var tempFile = tempFolder.createFile(blob);
    tempFileId = tempFile.getId();

    var docFile = Drive.Files.copy(
      { mimeType: MimeType.GOOGLE_DOCS },
      tempFileId,
      { ocr: true, ocrLanguage: 'ja' }
    );

    docId = docFile.id;
    var doc = DocumentApp.openById(docId);
    var docText = doc.getBody().getText();

    return docText;

  } catch (error) {
    Logger.log('❌ PDF抽出エラー: ' + error);
    return null;
  } finally {
    // 一時ファイルを確実にクリーンアップ
    try { if (tempFileId) DriveApp.getFileById(tempFileId).setTrashed(true); } catch (e) { /* 無視 */ }
    try { if (docId) DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* 無視 */ }
  }
}

/**
 * テキストからイベント（予定）を抽出
 * Gemini API を使用して自然言語で予定を抽出
 * @param {string} schoolName 学校名
 * @param {string} text 抽出されたテキスト
 * @param {number} year 年度
 * @return {Array} イベント配列：[{ eventType, monthDay, details }, ...]
 */
function extractEventsFromText(schoolName, text, year) {
  var GEMINI_API_KEY = getProperty(PROP_KEYS.GEMINI_API_KEY);
  
  if (!GEMINI_API_KEY) {
    Logger.log('❌ エラー: GEMINI_API_KEYが設定されていません');
    return [];
  }
  
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + GEMINI_API_KEY;
  
  if (text.length > 10000) {
    text = text.substring(0, 10000);
  }
  
  var prompt = `以下は${schoolName}の${year}年度年間行事予定表から抽出したテキストです：

${text}

この中から以下の予定を全て抽出して、JSON配列で返してください：

抽出する予定：
${EVENT_TYPES.join('、')}

形式：
[
  {
    "eventType": "予定の種類",
    "monthDay": "4月8日",
    "details": "対象学年など補足情報"
  }
]

重要：
- monthDay は「○月○日」の形式で（年は不要）
- 複数日にわたる場合は「11月25日～27日」の形式
- 対象学年がある場合は details に含める
- 情報が見つからない場合は空配列 [] を返す
- マークダウン記号なしで、純粋なJSON配列のみを返す`;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8000,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      Logger.log('❌ API Error ' + responseCode + ': ' + response.getContentText());
      return [];
    }
    
    var result = JSON.parse(response.getContentText());
    
    if (result.candidates && result.candidates.length > 0) {
      var rawText = result.candidates[0].content.parts[0].text;
      var cleanedText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      var jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        try {
          var events = JSON.parse(jsonMatch[0]);
          return events;
        } catch (parseError) {
          Logger.log('❌ JSONパースエラー: ' + parseError);
          return [];
        }
      }
    }
  } catch (error) {
    Logger.log('❌ Gemini API Error: ' + error);
  }
  
  return [];
}

// ========================================


// ========================================
// 【セクション13】基礎学力テスト日程管理
// ========================================
// 中学校共通の基礎学力テスト日程（自動計算 + 年度別上書き設定）を管理する
// プロパティキー: BASIC_TEST_DATES（JSON）
// 例: {"2025-1": "2025/10/01", "2025-2": "2025/11/12", "2025-3": "2026/01/09"}

/**
 * 基礎学力テスト日程の上書き設定を取得する
 * @aiCallable
 * @return {Object} 上書き設定オブジェクト（例: {"2025-1": "2025/10/01"}）
 */
function getBasicTestDateOverrides() {
  try {
    var raw = getProperty('BASIC_TEST_DATES');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getBasicTestDateOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 基礎学力テスト日程を上書き設定する（Admin のみ）
 * @param {number} academicYear 学年年度（例: 2025 → 2025-2026年度）
 * @param {number} testNum テスト番号（1, 2, 3）
 * @param {string} dateStr 日付文字列（例: "2025/10/01"）
 * @return {Object} 処理結果
 */
function setBasicTestDateOverride(academicYear, testNum, dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    var key = academicYear + '-' + testNum;
    overrides[key] = dateStr;
    setProperty('BASIC_TEST_DATES', JSON.stringify(overrides));
    return { success: true, message: '日程を設定しました' };
  } catch (error) {
    Logger.log('❌ setBasicTestDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テスト日程の上書き設定を削除する（Admin のみ）
 * 削除後は自動計算値が使用される
 * @param {number} academicYear 学年年度（例: 2025）
 * @param {number} testNum テスト番号（1, 2, 3）
 * @return {Object} 処理結果
 */
function deleteBasicTestDateOverride(academicYear, testNum) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    var key = academicYear + '-' + testNum;
    delete overrides[key];
    setProperty('BASIC_TEST_DATES', JSON.stringify(overrides));
    return { success: true, message: '上書き設定を削除しました（自動計算に戻ります）' };
  } catch (error) {
    Logger.log('❌ deleteBasicTestDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テストの詳細テキスト上書き設定を全取得
 * @aiCallable
 * @return {Object} 上書き設定 {"2025-1": "中3 全員", ...}
 */
function getBasicTestDetails() {
  try {
    var raw = getProperty('BASIC_TEST_DETAILS');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getBasicTestDetailsエラー: ' + error);
    return {};
  }
}

/**
 * 基礎学力テストの詳細テキストを上書き保存（Admin のみ）
 * @param {number} academicYear 年度
 * @param {number} testNum テスト番号（1/2/3）
 * @param {string} details 詳細テキスト
 * @return {Object} 処理結果
 */
function setBasicTestDetails(academicYear, testNum, details) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DETAILS');
    var obj = raw ? JSON.parse(raw) : {};
    obj[academicYear + '-' + testNum] = details || '';
    setProperty('BASIC_TEST_DETAILS', JSON.stringify(obj));
    return { success: true, message: '保存しました' };
  } catch (error) {
    Logger.log('❌ setBasicTestDetailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テストの詳細テキスト上書きを削除してデフォルト（中3）に戻す（Admin のみ）
 * @param {number} academicYear 年度
 * @param {number} testNum テスト番号
 * @return {Object} 処理結果
 */
function deleteBasicTestDetails(academicYear, testNum) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DETAILS');
    var obj = raw ? JSON.parse(raw) : {};
    delete obj[academicYear + '-' + testNum];
    setProperty('BASIC_TEST_DETAILS', JSON.stringify(obj));
    return { success: true, message: 'デフォルト（中3）に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteBasicTestDetailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 公立高校一般選抜の日程上書き設定を全取得
 * @aiCallable
 * @return {Object} 上書き設定（例: {"2025": "2026/03/11"}）
 */
function getPublicHighExamDateOverrides() {
  try {
    var raw = getProperty('PUBLIC_HIGH_EXAM_DATES');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getPublicHighExamDateOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 公立高校一般選抜の日程を上書き保存する（Admin のみ）
 * @param {number} academicYear 学年年度（例: 2025 → 2026年3月試験）
 * @param {string} dateStr 試験1日目の日付（例: "2026/03/11"）
 * @return {Object} 処理結果
 */
function setPublicHighExamDateOverride(academicYear, dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('PUBLIC_HIGH_EXAM_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    overrides[String(academicYear)] = dateStr;
    setProperty('PUBLIC_HIGH_EXAM_DATES', JSON.stringify(overrides));
    return { success: true, message: '日程を設定しました' };
  } catch (error) {
    Logger.log('❌ setPublicHighExamDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 公立高校一般選抜の日程上書き設定を削除し自動計算に戻す（Admin のみ）
 * @param {number} academicYear 学年年度
 * @return {Object} 処理結果
 */
function deletePublicHighExamDateOverride(academicYear) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('PUBLIC_HIGH_EXAM_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    delete overrides[String(academicYear)];
    setProperty('PUBLIC_HIGH_EXAM_DATES', JSON.stringify(overrides));
    return { success: true, message: '上書き設定を削除しました（自動計算に戻ります）' };
  } catch (error) {
    Logger.log('❌ deletePublicHighExamDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 塾内部イベント（○□★△）の上書き設定を全取得
 * @aiCallable
 * @return {Object} 上書き設定 {"report_2025_4": {"date": "2025/4/21", "details": ""}, "meeting_2025_4": false, ...}
 */
function getJukuEventOverrides() {
  try {
    var raw = getProperty('JUKU_EVENT_OVERRIDES');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getJukuEventOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 塾内部イベントの上書き設定を保存（Admin のみ）
 * @param {string} type イベント種別（"report"/"meeting"/"debit"/"email"）
 * @param {number} year 年
 * @param {number} month 月
 * @param {string} dateStr 日付文字列 "YYYY/M/D"、または "none"（無効化）
 * @param {string} details 詳細テキスト
 * @return {Object} 処理結果
 */
function setJukuEventOverride(type, year, month, dateStr, details) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var key = type + '_' + year + '_' + month;
    var raw = getProperty('JUKU_EVENT_OVERRIDES');
    var overrides = raw ? JSON.parse(raw) : {};
    if (dateStr === 'none') {
      overrides[key] = false; // 無効化（その月はイベントなし）
    } else {
      overrides[key] = { date: dateStr, details: details || '' };
    }
    setProperty('JUKU_EVENT_OVERRIDES', JSON.stringify(overrides));
    return { success: true, message: '保存しました' };
  } catch (error) {
    Logger.log('❌ setJukuEventOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 塾内部イベントの上書き設定を削除して自動計算に戻す（Admin のみ）
 * @param {string} type イベント種別
 * @param {number} year 年
 * @param {number} month 月
 * @return {Object} 処理結果
 */
function deleteJukuEventOverride(type, year, month) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var key = type + '_' + year + '_' + month;
    var raw = getProperty('JUKU_EVENT_OVERRIDES');
    var overrides = raw ? JSON.parse(raw) : {};
    delete overrides[key];
    setProperty('JUKU_EVENT_OVERRIDES', JSON.stringify(overrides));
    return { success: true, message: '自動計算に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteJukuEventOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 予定タブ用の休校日上書き設定（追加・削除）を全取得
 * @aiCallable
 * @return {Object} {add: ["YYYY-MM-DD", ...], del: ["YYYY-MM-DD", ...]}
 */
function getClosedDayOverrides() {
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    return { add: obj.add || [], del: obj.del || [] };
  } catch (error) {
    Logger.log('❌ getClosedDayOverridesエラー: ' + error);
    return { add: [], del: [] };
  }
}

/**
 * 予定タブに休校日を追加（計算外の臨時休校など）（Admin のみ）
 * @param {string} dateStr "YYYY-MM-DD" 形式の日付
 * @return {Object} 処理結果
 */
function addClosedDayExtra(dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    obj.add = obj.add || [];
    obj.del = obj.del || [];
    if (obj.add.indexOf(dateStr) === -1) obj.add.push(dateStr);
    obj.del = obj.del.filter(function(d) { return d !== dateStr; });
    setProperty('CLOSED_DAYS_OVERRIDES', JSON.stringify(obj));
    return { success: true, message: dateStr + ' を休校日に追加しました' };
  } catch (error) {
    Logger.log('❌ addClosedDayExtraエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 計算上は休校日だが予定タブでは開校日とする（Admin のみ）
 * @param {string} dateStr "YYYY-MM-DD" 形式の日付
 * @return {Object} 処理結果
 */
function removeComputedClosedDay(dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    obj.add = obj.add || [];
    obj.del = obj.del || [];
    if (obj.del.indexOf(dateStr) === -1) obj.del.push(dateStr);
    obj.add = obj.add.filter(function(d) { return d !== dateStr; });
    setProperty('CLOSED_DAYS_OVERRIDES', JSON.stringify(obj));
    return { success: true, message: dateStr + ' を開校日に変更しました' };
  } catch (error) {
    Logger.log('❌ removeComputedClosedDayエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 休校日の上書き設定を削除して元の計算値に戻す（Admin のみ）
 * @param {string} dateStr "YYYY-MM-DD" 形式の日付
 * @return {Object} 処理結果
 */
function deleteClosedDayOverride(dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    obj.add = (obj.add || []).filter(function(d) { return d !== dateStr; });
    obj.del = (obj.del || []).filter(function(d) { return d !== dateStr; });
    setProperty('CLOSED_DAYS_OVERRIDES', JSON.stringify(obj));
    return { success: true, message: '元の設定に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteClosedDayOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// 講習日程締切の手動上書き設定管理
// プロパティキー: LECTURE_DEADLINE_OVERRIDES（JSON）
// 例: {"2025-summer": "2025-06-15", "2026-spring": "2026-02-10"}
// ----------------------------------------

/**
 * 講習日程締切の上書き設定を全件取得する
 * @aiCallable
 * @return {Object} 上書き設定オブジェクト（例: {"2025-summer": "2025-06-15"}）
 */
function getLectureDeadlineOverrides() {
  try {
    var raw = getProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getLectureDeadlineOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 指定講習の締切日を手動で上書き設定する（Admin のみ）
 * @param {string} lectureId 講習ID（例: "2025-summer"）
 * @param {string} dateStr 締切日（YYYY-MM-DD形式）
 * @return {Object} 処理結果
 */
function setLectureDeadlineOverride(lectureId, dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var overrides = safeJsonParse_(getProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES), {});
    overrides[lectureId] = dateStr;
    setProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES, JSON.stringify(overrides));
    logAdminAction('講習日程締切上書き', 'lectureId=' + lectureId + ', date=' + dateStr);
    return { success: true, message: '締切日を上書きしました' };
  } catch (error) {
    Logger.log('❌ setLectureDeadlineOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定講習の締切日上書き設定を削除して自動計算に戻す（Admin のみ）
 * @param {string} lectureId 講習ID（例: "2025-summer"）
 * @return {Object} 処理結果
 */
function deleteLectureDeadlineOverride(lectureId) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var overrides = safeJsonParse_(getProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES), {});
    delete overrides[lectureId];
    setProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES, JSON.stringify(overrides));
    logAdminAction('講習日程締切上書き削除', 'lectureId=' + lectureId);
    return { success: true, message: '自動計算に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteLectureDeadlineOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【セクション14】公立平均点データ取得
// ========================================
// 外部サイトから基礎学力テストの公立平均点を取得し、スプレッドシートに保存する機能

/**
 * 【テスト用】外部サイトから公立平均点ページを取得できるか確認する
 * GASエディタから手動実行して、ログで結果を確認してください
 */
function testFetchPublicAverageScorePage() {
  var url = 'https://tokushima-tsubasa.com/ace-striker/\u57FA\u790E\u5B66\u529B\u30C6\u30B9\u30C8\u60C5\u5831\u30DA\u30FC\u30B8/';

  try {

    // まずデフォルトのリクエストで試す
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    var statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      Logger.log('❌ ページ取得失敗。ステータスコード: ' + statusCode);
      return;
    }

    var html = response.getContentText('UTF-8');

    // 取得したHTMLの先頭500文字を確認
    Logger.log(html.substring(0, 500));

    // 「平均」「点」などのキーワードが含まれるか確認
    var hasAvgKeyword = html.indexOf('平均') !== -1;
    var hasScoreKeyword = html.indexOf('点') !== -1;
    var hasTableKeyword = html.indexOf('<table') !== -1 || html.indexOf('<td') !== -1;


    // 「平均」の周辺テキストを抽出してサンプル表示
    if (hasAvgKeyword) {
      var idx = html.indexOf('平均');
      Logger.log(html.substring(Math.max(0, idx - 100), idx + 200));
    }


  } catch (error) {
    Logger.log('❌ エラー発生: ' + error);
  }
}

// ========================================
