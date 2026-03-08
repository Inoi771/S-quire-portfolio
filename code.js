/**
 * GASアプリケーションのエントリーポイント
 * ?page=student → 生徒向け音声アプリ (index.html)
 * それ以外       → 教師向け編集アプリ (editor.html)
 */
function doGet(e) {
  const page = e && e.parameter && e.parameter.page;
  if (page === 'student') {
    try {
      const template = HtmlService.createTemplateFromFile('index');
      const yearsData = getStudentYears();
      template.years = yearsData.years;
      template.yearsJson = JSON.stringify(yearsData.years);
      return template.evaluate()
        .setTitle('スクエア英単語音声アプリ')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch (err) {
      Logger.log('doGet student error: ' + err);
      return HtmlService.createHtmlOutput('エラーが発生しました。管理者に連絡してください。');
    }
  }
  return HtmlService
    .createHtmlOutputFromFile('editor')
    .setTitle('単語帳作成アプリ');
}

// ════════════════════════════════════════════════════════
// ユーティリティ関数（基本的なヘルパー）
// ════════════════════════════════════════════════════════
/**
 * Script Propertiesから値を取得
 * @param {string} key - プロパティキー
 * @returns {string} プロパティ値
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * セルIDを検証
 * cellIdが1～48の有効な範囲内か確認
 * @param {*} cellId - 検証対象のセルID
 * @returns {number|null} 有効ならcellId、無効ならnull
 */
function validateCellId(cellId) {
  const id = parseInt(cellId);
  
  // NaNまたは整数でない場合
  if (isNaN(id)) {
    return null;
  }
  
  // 範囲チェック（1～48）
  if (id < 1 || id > 48) {
    Logger.log(`警告: cellId ${id} は有効な範囲 (1-48) 外です`);
    return null;
  }
  
  return id;
}

/**
 * Google DriveからロゴPNG画像を取得
 * Base64エンコードしてData URLで返す
 * @returns {string|null} Data URL形式のロゴ画像、またはnull
 */
function getEditorLogoUrl() {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const folder = DriveApp.getFolderById(englishwordsFolderId);
    const files = folder.getFilesByName('logo.png');
    
    if (files.hasNext()) {
      const file = files.next();
      // ファイルをBlob取得 → Base64に変換
      const blob = file.getBlob();
      const base64 = Utilities.base64Encode(blob.getBytes());
      const mimeType = blob.getContentType();
      
      // Data URLフォーマットで返す
      return `data:${mimeType};base64,${base64}`;
    } else {
      Logger.log('logo.png not found');
      return null;
    }
  } catch (e) {
    Logger.log('Error getLogoPngUrl: ' + e);
    return null;
  }
}

// ════════════════════════════════════════════════════════
// 年度・教科書・学年・レッスン情報取得（階層的）
// ════════════════════════════════════════════════════════
/**
 * 利用可能な年度一覧を取得
 * @returns {Object} { years: [年度文字列の配列] }
 */
function getEditorYears() {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const folder = DriveApp.getFolderById(englishwordsFolderId);
    const folders = folder.getFolders();
    const years = [];
    
    while (folders.hasNext()) {
      const f = folders.next();
      const name = f.getName();
      if (name.match(/\d{4}年度版/)) {
        years.push(name);
      }
    }
    
    return { years: years.sort().reverse() };
  } catch (e) {
    Logger.log('Error getYears: ' + e);
    return { years: [] };
  }
}

/**
 * 指定年度の教科書一覧を取得
 * @param {string} year - 年度
 * @returns {Object} { textbooks: [教科書名の配列] }
 */
function getEditorTextbooks(year) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const textbooks = [];
    
    while (files.hasNext()) {
      const file = files.next();
      textbooks.push(file.getName());
    }
    
    return { textbooks: textbooks.sort() };
  } catch (e) {
    Logger.log('Error getTextbooks: ' + e);
    return { textbooks: [] };
  }
}

/**
 * 指定教科書の学年一覧を取得
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @returns {Object} { grades: [学年の配列] }
 */
function getEditorGrades(year, textbook) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const gradesSet = new Set();
    
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        const sheets = ss.getSheets();
        sheets.forEach(sheet => {
          // ✅ 修正：「レッスン順序」シートを除外
          if (sheet.getName() !== 'レッスン順序') {
            gradesSet.add(sheet.getName());
          }
        });
        break;
      }
    }
    
    const grades = Array.from(gradesSet);
    return { grades: grades };
  } catch (e) {
    Logger.log('Error getGrades: ' + e);
    return { grades: [] };
  }
}

/**
 * 指定学年のレッスン一覧を取得
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年
 * @returns {Object} { lessons: [レッスン名の配列] }
 */
function getEditorLessons(year, textbook, grade) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    let lessons = [];
    
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        const sheet = ss.getSheetByName(grade);
        
        if (sheet) {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            // 新しい列順序: word_id(0), english(1), pronunciation(2), japanese(3), audio(4), lesson(5), cell_id(6)
            const data = sheet.getRange(1, 6, lastRow, 1).getValues();
            lessons = data.slice(1).map(row => row[0]).filter(val => val && typeof val === 'string').filter((v, i, a) => a.indexOf(v) === i);
          }
        }
        break;
      }
    }
    
    return { lessons: lessons };
  } catch (e) {
    Logger.log('Error getLessons: ' + e);
    return { lessons: [] };
  }
}

// ════════════════════════════════════════════════════════
// マスターデータ取得
// ════════════════════════════════════════════════════════
/**
 * マスター単語・文データを取得
 * 英単語シートと英文シートから全データを読み込む
 * @returns {Object} { words: 単語配列, sentences: 文配列 }
 */
function getAllWordsAndSentences() {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    let words = [];
    let sentences = [];
    
    const wordSheet = ss.getSheetByName("英単語");
    if (wordSheet) {
      const lastRow = wordSheet.getLastRow();
      if (lastRow > 1) {
        try {
          // ✅ 修正：5列目（audio）まで取得
          const data = wordSheet.getRange(2, 1, lastRow - 1, 5).getValues();
          data.forEach((row, index) => {
            if (row[1] && row[1] !== '') {
              words.push({
                id: row[0] ? parseInt(row[0]) : index + 1,
                english: row[1].toString().trim(),
                pronunciation: row[2] ? row[2].toString().trim() : '',
                japanese: row[3] ? row[3].toString().trim() : '',
                audio: row[4] ? row[4].toString().trim() : ''  // ✅ 新規：audio列を追加
              });
            }
          });
          
          // ✅ デバッグログを追加
          Logger.log('✅ 英単語取得完了: ' + words.length + '件');
          
          // 最初の5件をログ出力
          Logger.log('📌 最初の5件:');
          for (let i = 0; i < Math.min(5, words.length); i++) {
            Logger.log(`  [${i}] english="${words[i].english}", pronunciation="${words[i].pronunciation}"`);
          }
          
          // 「I」が含まれているか確認
          const iWord = words.find(w => w.english === 'I');
          Logger.log('📌 「I」の検索結果: ' + (iWord ? `発音="${iWord.pronunciation}"` : '見つかりません'));
          
          // 「my」が含まれているか確認
          const myWord = words.find(w => w.english === 'my');
          Logger.log('📌 「my」の検索結果: ' + (myWord ? `発音="${myWord.pronunciation}"` : '見つかりません'));
          
          // 「me」が含まれているか確認
          const meWord = words.find(w => w.english === 'me');
          Logger.log('📌 「me」の検索結果: ' + (meWord ? `発音="${meWord.pronunciation}"` : '見つかりません'));
          
        } catch (err) {
          Logger.log('英単語データ取得エラー: ' + err);
        }
      }
    }
    
    const sentenceSheet = ss.getSheetByName("英文");
    if (sentenceSheet) {
      const lastRow = sentenceSheet.getLastRow();
      if (lastRow > 1) {
        // ✅ 修正：5列目（audio）まで取得
        const data = sentenceSheet.getRange(2, 1, lastRow - 1, 5).getValues();
        sentences = data.map((row, index) => ({
          id: 10001 + index,
          text: row[1] ? row[1].toString().trim() : '',
          pronunciation: row[2] ? row[2].toString().trim() : '',
          japanese: row[3] ? row[3].toString().trim() : '',  // ✅ 修正：日本語列を追加
          audio: row[4] ? row[4].toString().trim() : ''  // ✅ 新規：audio列を追加
        })).filter(s => s.text && s.text !== '');
      }
    }
    
    return { words, sentences };
  } catch (e) {
    Logger.log('Error getAllWordsAndSentences: ' + e);
    return { words: [], sentences: [] };
  }
}

// ════════════════════════════════════════════════════════
// レッスンデータ取得・処理
// ════════════════════════════════════════════════════════

/**
 * ✅ 修正版：入試対策編のすべてのレッスン一覧を取得（ソート済み）
 * 3つのシート（通常・不規則動詞①②）から全レッスンを取得
 * 
 * @param {string} year - 年度
 * @returns {Object} { lessons: [ソート済みレッスン名の配列] }
 */
function getExamPrepLessons(year) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    let lessons = [];

    while (files.hasNext()) {
      const file = files.next();
      
      // ✅ 修正：「入試対策編」のみを処理
      if (file.getName() === '入試対策編') {
        const ss = SpreadsheetApp.open(file);
        
        // ✅ 修正：3つのシートすべてから取得
        const sheetNames = ['通常', '不規則動詞①', '不規則動詞②'];
        
        sheetNames.forEach(sheetName => {
          const sheet = ss.getSheetByName(sheetName);
          
          if (sheet) {
            const lastRow = sheet.getLastRow();
            if (lastRow > 1) {
              // カラムF（lesson列）を取得
              const data = sheet.getRange(1, 6, lastRow, 1).getValues();
              
              const sheetLessons = data.slice(1)
                .map(row => row[0])
                .filter(val => val && typeof val === 'string')
                .map(val => val.trim());

              lessons = lessons.concat(sheetLessons);
            }
          }
        });

        break;
      }
    }

    // 重複除外＆ソート
    lessons = lessons
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();

    return { lessons: lessons };
  } catch (e) {
    Logger.log('Error getExamPrepLessons: ' + e);
    return { lessons: [] };
  }
}

/**
 * ✅ 修正版：指定レッスンの既存データを取得
 * 入試対策編の3シート対応
 * 
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（入試対策編の場合は「通常」「不規則動詞①」「不規則動詞②」）
 * @param {string} lesson - レッスン名
 * @returns {Object} { tableData: テーブルデータの配列 }
 */
function getExistingData(year, textbook, grade, lesson) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    let tableData = [];

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        
        // ✅ 修正：grade はシート名として使用
        // 通常教科書：学年名（「中学1年」など）
        // 入試対策編：「通常」「不規則動詞①」「不規則動詞②」
        const sheet = ss.getSheetByName(grade);

        if (sheet) {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            // ✅ 修正：入試対策編の拡張カラムに対応
            // 通常シート（7列）と拡張シート（10列または13列）の両方に対応
            const maxCols = getMaxColumnsForSheet(textbook, grade);
            const data = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

            // レッスンが一致するデータのみをフィルタリング
            const lessonData = data.filter(row => {
              // カラムF（lesson列）の値を確認
              const lessonCell = row[5] ? row[5].toString().trim() : '';
              return lessonCell === lesson;
            });

            // レッスンデータを tableData 形式に変換
            tableData = lessonData.map((row, index) => ({
              cellId: row[6] ? parseInt(row[6]) : null,
              lesson: row[5] ? row[5].toString().trim() : '',
              japanese: row[3] ? row[3].toString().trim() : '',
              english: row[1] ? row[1].toString().trim() : '',
              pronunciation: row[2] ? row[2].toString().trim() : '',
              audio: row[4] ? row[4].toString().trim() : '',
              masterWordId: row[0] ? parseInt(row[0]) : null,
              // ✅ 新規：不規則動詞①②の拡張カラムを取得
              pastEnglish: row[7] ? row[7].toString().trim() : '',
              pastPronunciation: row[8] ? row[8].toString().trim() : '',
              pastAudio: row[9] ? row[9].toString().trim() : '',
              pastMasterId: row[7] ? null : null,  // プレースホルダ
              pastParticipleEnglish: row[10] ? row[10].toString().trim() : '',
              pastParticiplePronunciation: row[11] ? row[11].toString().trim() : '',
              pastParticipleAudio: row[12] ? row[12].toString().trim() : '',
              pastParticipleWordId: row[10] ? null : null  // プレースホルダ
            }));

            Logger.log(`読み込み完了: ${tableData.length} 件のレッスンデータ`);
          }
        }
        break;
      }
    }

    return { tableData };
  } catch (e) {
    Logger.log('Error getExistingData: ' + e);
    return { tableData: [] };
  }
}

/**
 * ✅ 新規関数：シートのカラム数を取得
 * 通常シート（7列）か拡張シート（10列または13列）かを判定
 * 
 * @param {string} textbook - 教科書名
 * @param {string} grade - シート名
 * @returns {number} カラム数
 */
function getMaxColumnsForSheet(textbook, grade) {
  // 入試対策編の不規則動詞②は13列
  if (textbook === '入試対策編' && grade === '不規則動詞②') {
    return 13;
  }
  // 入試対策編の不規則動詞①は10列
  if (textbook === '入試対策編' && grade === '不規則動詞①') {
    return 10;
  }
  // その他（通常シート）は7列
  return 7;
}

/**
 * スプレッドシートのデータをテーブルデータ構造に変換
 * cellIdから行列位置を計算し、単語・文を適切に配置
 * @param {Array} rawData - スプレッドシートから取得した生データ
 * @param {string} lesson - フィルタ対象のレッスン名
 * @returns {Array} 16行3列のtableData構造
 */
function loadDataIntoTable(rawData, lesson) {
  // 16行3列の初期化（全てnull）
  const tableData = Array(16).fill(null).map(() => [null, null, null]);
  
  // レッスンが一致するデータのみをフィルタリング
  const lessonData = rawData.filter(row => {
    const lessonCell = row[1] ? row[1].toString().trim() : '';
    return lessonCell === lesson;
  });
  
  // フィルタされたデータをtableDataに配置
  lessonData.forEach(row => {
    const cellId = validateCellId(row[0]);
    if (cellId === null) return; // 不正なcellIdはスキップ
    
    // cellIdから行列インデックスを計算
    const rowIdx = Math.floor((cellId - 1) / 3);
    const colIdx = (cellId - 1) % 3;
    
    // 行インデックスが範囲外ならスキップ
    if (rowIdx < 0 || rowIdx >= 16) {
      Logger.log(`警告: cellId ${cellId} は範囲外です (rowIdx: ${rowIdx})`);
      return;
    }
    
    // 3列データを解析
    const english = row[3] ? row[3].toString().trim() : '';
    const japanese = row[2] ? row[2].toString().trim() : '';
    const pronunciation = row[4] ? row[4].toString().trim() : '';
    const masterId = row[5] ? parseInt(row[5]) : null;
    
    // 単語か文かを判定
    if (english) {
      // 単語の場合：englishが存在
      tableData[rowIdx][colIdx] = {
        type: 'word',
        english: english,
        japanese: japanese,
        pronunciation: pronunciation,
        masterWordId: masterId,
        cellId: cellId
      };
    } else if (japanese) {
      // 文の場合：englishがなく、japaneseがある
      // ただし、その行に既に単語がないかチェック
      const hasWordInRow = tableData[rowIdx].some(cell => cell && cell.type === 'word');
      
      if (!hasWordInRow) {
        // その行に単語がなければ配置可能
        tableData[rowIdx][0] = {
          type: 'sentence',
          text: japanese,
          masterSentenceId: masterId,
          cellId: cellId
        };
        tableData[rowIdx][1] = null;
        tableData[rowIdx][2] = null;
      } else {
        // その行に既に単語がある場合はログに出力（データ矛盾）
        Logger.log(`警告: row ${rowIdx} に単語が存在するため、文 "${japanese}" は無視されました`);
      }
    }
  });
  
  return tableData;
}

// ════════════════════════════════════════════════════════
// データ保存
// ════════════════════════════════════════════════════════
/**
 * マスター単語を英単語シートに保存
 * @param {Array} words - 保存する単語配列
 * @returns {Object} { success: boolean, error?: string }
 */
function saveWords(words) {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    const wordSheet = ss.getSheetByName("英単語");
    
    if (!wordSheet) {
      throw new Error('「英単語」シートが見つかりません');
    }

    const lastRow = wordSheet.getLastRow();
    if (lastRow > 1) {
      wordSheet.deleteRows(2, lastRow - 1);
    }

    if (words.length > 0) {
      // ✅ 修正：5列目にaudio列を含める
      const rowsToAdd = words.map(word => [
        word.id,
        word.english,
        word.pronunciation,
        word.japanese,
        word.audio  // ✅ 新規：audio列を保存
      ]);
      wordSheet.getRange(2, 1, rowsToAdd.length, 5).setValues(rowsToAdd);
    }

    return { success: true };
  } catch (e) {
    Logger.log('Error saveWords: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * マスター文を英文シートに保存
 * @param {Array} sentences - 保存する文配列
 * @returns {Object} { success: boolean, error?: string }
 */
function saveSentences(sentences) {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    const sentenceSheet = ss.getSheetByName("英文");
    
    if (!sentenceSheet) {
      throw new Error('「英文」シートが見つかりません');
    }

    const lastRow = sentenceSheet.getLastRow();
    if (lastRow > 1) {
      sentenceSheet.deleteRows(2, lastRow - 1);
    }

    if (sentences.length > 0) {
      // ✅ 修正：5列目にaudio列を含める
      const rowsToAdd = sentences.map(sentence => [
        sentence.id,
        sentence.text,
        sentence.pronunciation,
        sentence.japanese || '',  // ✅ 修正：日本語列を保存
        sentence.audio || ''       // ✅ 新規：audio列を保存
      ]);
      sentenceSheet.getRange(2, 1, rowsToAdd.length, 5).setValues(rowsToAdd);
    }

    return { success: true };
  } catch (e) {
    Logger.log('Error saveSentences: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 新規追加：指定年度のすべてのレッスンデータを更新
 * マスターID に紐づくデータを検索して、すべての箇所で更新
 * @param {string} year - 年度（例：「2024年度版」）
 * @param {number} masterId - 更新対象のマスターID
 * @param {string} newField1 - 新しい英語または文テキスト
 * @param {string} newField2 - 新しい発音
 * @param {string} newField3 - 新しい日本語
 * @param {string} itemType - アイテムタイプ（'word' または 'sentence'）
 * @returns {Object} { success: boolean, error?: string }
 */
function updateAllLessonDataInYear(year, masterId, newField1, newField2, newField3, itemType, allWords, allSentences) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    
    // 指定年度のフォルダを取得
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    let updatedCount = 0;
    const updateLog = []; // 更新ログ
    
    // 年度内のすべての教科書を処理
    while (files.hasNext()) {
      const file = files.next();
      const ss = SpreadsheetApp.open(file);
      const sheets = ss.getSheets();
      const textbookName = file.getName();
      
      // すべてのシート（学年）を処理
      sheets.forEach(sheet => {
        const lastRow = sheet.getLastRow();
        
        if (lastRow > 1) {
          // 行データを取得：word_id(0), english(1), pronunciation(2), japanese(3), audio(4), lesson(5), cell_id(6)
          const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
          
          // マスターIDが一致する行を検索
          data.forEach((row, idx) => {
            const cellMasterId = row[0] ? parseInt(row[0]) : null;
            
            if (cellMasterId === masterId) {
              // シート上の実際の行番号を計算（データ範囲の開始は2行目）
              const actualRow = idx + 2;
              
              // ログに記録（どの行を更新するかを明確にする）
              updateLog.push({
                file: textbookName,
                sheet: sheet.getName(),
                actualRow: actualRow,
                masterId: masterId,
                lesson: row[5] // lesson列の値
              });
              
              // 対応する列を更新
              if (itemType === 'word') {
                // 単語：列2（english）、列3（pronunciation）、列4（japanese）を更新
                sheet.getRange(actualRow, 2).setValue(newField1);  // english
                sheet.getRange(actualRow, 3).setValue(newField2);  // pronunciation
                sheet.getRange(actualRow, 4).setValue(newField3);  // japanese
                
                // ✅ 修正：マスターから音声ファイル名を取得して更新
                const masterWord = allWords.find(w => w.id === masterId);
                if (masterWord && masterWord.audio) {
                  sheet.getRange(actualRow, 5).setValue(masterWord.audio);  // audio
                }
              } else if (itemType === 'sentence') {
                // 文：列2（text）、列3（pronunciation）、列4（japanese）を更新
                sheet.getRange(actualRow, 2).setValue(newField1);  // text（文）
                sheet.getRange(actualRow, 3).setValue(newField2);  // pronunciation
                sheet.getRange(actualRow, 4).setValue(newField3);  // ✅ 修正：日本語も更新
                
                // ✅ 修正：マスターから音声ファイル名を取得して更新
                const masterSentence = allSentences.find(s => s.id === masterId);
                if (masterSentence && masterSentence.audio) {
                  sheet.getRange(actualRow, 5).setValue(masterSentence.audio);  // audio
                }
              }
              
              updatedCount++;
            }
          });
        }
      });
    }
    
    // ログを出力（デバッグ用）
    if (updateLog.length > 0) {
      Logger.log('=== 更新ログ ===');
      updateLog.forEach(log => {
        Logger.log(`✅ ${log.file} > ${log.sheet} > 行${log.actualRow} (レッスン: ${log.lesson}, ID: ${log.masterId})`);
      });
    }
    
    Logger.log(`✅ 合計 ${updatedCount}件のレッスンデータを更新しました (ID: ${masterId})`);
    return { success: true, updatedCount: updatedCount };
    
  } catch (e) {
    Logger.log('Error updateAllLessonDataInYear: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * ✅ 完全修正版：レッスンデータ保存
 * 入試対策編の拡張カラムに対応
 * 既存レッスンデータの正確な削除と新規データの追加
 * 
 * ✅ 修正：現在のレッスン名で削除（既に updateLessonName() で名前が変更されている）
 * 
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（またはシート名）
 * @param {string} lesson - レッスン名
 * @param {Array} tableData - テーブルデータ
 * @param {Array} allWords - マスター単語配列
 * @param {Array} allSentences - マスター文配列
 * @returns {Object} { success: boolean, error?: string }
 */
function saveLessonData(year, textbook, grade, lesson, tableData, allWords, allSentences) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let targetFile = null;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) {
      throw new Error("スプレッドシートが見つかりません");
    }

    const ss = SpreadsheetApp.open(targetFile);
    const sheet = ss.getSheetByName(grade);

    if (!sheet) {
      throw new Error(`シート「${grade}」が見つかりません`);
    }

    // ✅ 修正：入試対策編かどうかで処理を分岐
    const isExamPrep = textbook === '入試対策編';
    const isFukisoku1 = isExamPrep && grade === '不規則動詞①';
    const isFukisoku2 = isExamPrep && grade === '不規則動詞②';

    // 新しいデータを整形
    const rowsToAdd = [];

    tableData.forEach((row, rowIdx) => {
      row.forEach((cell, colIdx) => {
        if (!cell) {
          return;
        }

        const cellId = cell.cellId || (rowIdx * 3 + colIdx + 1);

        if (cell.type === 'word') {
          const masterWord = allWords.find(w => w.id === cell.masterWordId);
          const audioFileName = masterWord ? masterWord.audio : '';

          if (isFukisoku1) {
            // 不規則動詞①：10列
            const pastWord = allWords.find(w => w.japanese === `${masterWord.japanese}の過去形`);
            rowsToAdd.push([
              cell.masterWordId || '',
              cell.english,
              cell.pronunciation || '',
              cell.japanese,
              audioFileName,
              lesson,
              cellId,
              pastWord ? pastWord.english : '',
              pastWord ? pastWord.pronunciation : '',
              pastWord ? pastWord.audio : ''
            ]);
          } else if (isFukisoku2) {
            // 不規則動詞②：13列
            const pastWord = allWords.find(w => w.japanese === `${masterWord.japanese}の過去形`);
            const pastPartWord = allWords.find(w => w.japanese === `${masterWord.japanese}の過去分詞`);
            rowsToAdd.push([
              cell.masterWordId || '',
              cell.english,
              cell.pronunciation || '',
              cell.japanese,
              audioFileName,
              lesson,
              cellId,
              pastWord ? pastWord.english : '',
              pastWord ? pastWord.pronunciation : '',
              pastWord ? pastWord.audio : '',
              pastPartWord ? pastPartWord.english : '',
              pastPartWord ? pastPartWord.pronunciation : '',
              pastPartWord ? pastPartWord.audio : ''
            ]);
          } else {
            // 通常シート：7列
            rowsToAdd.push([
              cell.masterWordId || '',
              cell.english,
              cell.pronunciation || '',
              cell.japanese,
              audioFileName,
              lesson,
              cellId
            ]);
          }
        } else if (cell.type === 'sentence') {
          const masterSentence = allSentences.find(s => s.id === cell.masterSentenceId);
          const audioFileName = masterSentence ? masterSentence.audio : '';

          if (isFukisoku1) {
            // 不規則動詞①：10列
            rowsToAdd.push([
              cell.masterSentenceId || '',
              cell.text,
              cell.pronunciation || '',
              cell.japanese || '',
              audioFileName,
              lesson,
              cellId,
              '',
              '',
              ''
            ]);
          } else if (isFukisoku2) {
            // 不規則動詞②：13列
            rowsToAdd.push([
              cell.masterSentenceId || '',
              cell.text,
              cell.pronunciation || '',
              cell.japanese || '',
              audioFileName,
              lesson,
              cellId,
              '',
              '',
              '',
              '',
              '',
              ''
            ]);
          } else {
            // 通常シート：7列
            rowsToAdd.push([
              cell.masterSentenceId || '',
              cell.text,
              cell.pronunciation || '',
              cell.japanese || '',
              audioFileName,
              lesson,
              cellId
            ]);
          }
        }
      });
    });

    const lastRow = sheet.getLastRow();
    const maxCols = getMaxColumnsForSheet(textbook, grade);

    Logger.log(`=== saveLessonData 処理開始 ===`);
    Logger.log(`lastRow: ${lastRow}, maxCols: ${maxCols}`);
    Logger.log(`保存対象レッスン: "${lesson}"`);
    Logger.log(`新規データ行数: ${rowsToAdd.length}`);

    // ════════════════════════════════════════════════════════
    // ✅ 修正：既存レッスンデータを削除
    // 現在のレッスン名（lesson）で検索・削除
    // ════════════════════════════════════════════════════════
    if (lastRow > 1) {
      const allData = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

      // ✅ 修正：現在のレッスン名で検索（updateLessonName() で既に名前が変更されている）
      const lessonRowIndices = [];
      allData.forEach((row, idx) => {
        const cellLesson = row[5] ? row[5].toString().trim() : '';
        if (cellLesson === lesson) {
          lessonRowIndices.push(idx);
        }
      });

      Logger.log(`削除対象行数: ${lessonRowIndices.length}`);
      Logger.log(`検索レッスン名: "${lesson}"`);

      // ✅ 修正：逆順でループして行を削除（行番号がずれないように）
      for (let i = lessonRowIndices.length - 1; i >= 0; i--) {
        const deleteIdx = lessonRowIndices[i];
        const deleteRow = deleteIdx + 2; // データ範囲の開始は2行目

        Logger.log(`削除: 行${deleteRow}`);
        sheet.deleteRow(deleteRow);
      }
    }

    // ════════════════════════════════════════════════════════
    // ✅ 修正：新規データを追加（最後の行の後に）
    // ════════════════════════════════════════════════════════
    if (rowsToAdd.length > 0) {
      const newLastRow = sheet.getLastRow();
      const insertRow = newLastRow + 1;

      Logger.log(`挿入開始行: ${insertRow}`);
      Logger.log(`挿入データ行数: ${rowsToAdd.length}`);
      Logger.log(`挿入カラム数: ${maxCols}`);

      // ✅ 修正：各行のカラム数をチェック
      for (let i = 0; i < rowsToAdd.length; i++) {
        if (rowsToAdd[i].length !== maxCols) {
          Logger.log(`⚠️ 警告：行${i}のカラム数が不正: ${rowsToAdd[i].length}（期待値: ${maxCols}）`);
          
          // 不足分を空文字で埋める
          while (rowsToAdd[i].length < maxCols) {
            rowsToAdd[i].push('');
          }
          
          // 余分な列を削除
          rowsToAdd[i] = rowsToAdd[i].slice(0, maxCols);
        }
      }

      // データを挿入
      sheet.getRange(insertRow, 1, rowsToAdd.length, maxCols).setValues(rowsToAdd);

      Logger.log(`✅ ${rowsToAdd.length}件のデータを行${insertRow}に保存しました`);
    } else {
      Logger.log(`⚠️ 保存対象データが空です`);
    }

    Logger.log(`=== saveLessonData 処理完了 ===`);
    return { success: true };

  } catch (e) {
    Logger.log('Error saveLessonData: ' + e);
    Logger.log(e.stack);
    return { success: false, error: e.toString() };
  }
}

/**
 * ✅ 完全修正版：レッスン名を変更（レッスン順序シートのみ更新）
 * 
 * ★ 重要な修正 ★
 * - データシートのレッスン名は更新しない（saveLessonData で処理）
 * - レッスン順序シートのみを更新する
 * - これにより単語データの重複を完全に防ぐ
 * 
 * @param {string} year - 年度（例：「2024年度版」）
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（またはシート名）
 * @param {string} oldLessonName - 元のレッスン名
 * @param {string} newLessonName - 新しいレッスン名
 * @returns {Object} { success: boolean, updatedCount: number, error?: string }
 */
function updateLessonName(year, textbook, grade, oldLessonName, newLessonName) {
  try {
    console.log('=== updateLessonName called ===');
    console.log(`year: ${year}`);
    console.log(`textbook: ${textbook}`);
    console.log(`grade: ${grade}`);
    console.log(`oldLessonName: "${oldLessonName}"`);
    console.log(`newLessonName: "${newLessonName}"`);

    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let targetFile = null;
    const allFiles = [];

    // ✅ 修正：全ファイルを配列に格納
    while (files.hasNext()) {
      const file = files.next();
      allFiles.push(file);
      
      if (file.getName() === textbook) {
        targetFile = file;
      }
    }

    if (!targetFile) {
      throw new Error(`スプレッドシート「${textbook}」が見つかりません`);
    }

    console.log(`✅ 対象ファイル取得: ${targetFile.getName()}`);

    const ss = SpreadsheetApp.open(targetFile);
    
    // ════════════════════════════════════════════════════════
    // ✅ 修正：データシートのレッスン名を更新
    // （単語データには触らずにレッスン名列のみを更新）
    // ════════════════════════════════════════════════════════
    let dataUpdateCount = 0;
    
    let targetSheetName = grade;
    
    // 入試対策編の場合、grade がシート名
    if (textbook === '入試対策編') {
      if (oldLessonName.startsWith('不規則動詞①')) {
        targetSheetName = '不規則動詞①';
      } else if (oldLessonName.startsWith('不規則動詞②')) {
        targetSheetName = '不規則動詞②';
      } else {
        targetSheetName = '通常';
      }
      console.log(`📌 入試対策編: 対象シート: ${targetSheetName}`);
    }

    const sheet = ss.getSheetByName(targetSheetName);

    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const maxCols = getMaxColumnsForSheet(textbook, targetSheetName);
        const data = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

        console.log(`📌 データシート更新処理開始: ${targetSheetName}`);

        // データシート内のレッスン名を更新（列6 = レッスン列）
        data.forEach((row, idx) => {
          const cellLesson = row[5] ? row[5].toString().trim() : '';
          
          // 前方一致で判定
          const lessonBase = oldLessonName.split('(')[0].trim();
          const cellLessonBase = cellLesson.split('(')[0].trim();

          if (cellLessonBase === lessonBase) {
            const actualRow = idx + 2;
            sheet.getRange(actualRow, 6).setValue(newLessonName);

            console.log(`  ✅ データシート行${actualRow}: "${cellLesson}" → "${newLessonName}"`);
            dataUpdateCount++;
          }
        });

        console.log(`📌 データシート更新完了: ${dataUpdateCount}件`);
      }
    } else {
      console.log(`⚠️ シート「${targetSheetName}」が見つかりません`);
    }

    let orderUpdateCount = 0;

    // ════════════════════════════════════════════════════════
    // 「レッスン順序」シートを検索して更新（これだけを実施）
    // ════════════════════════════════════════════════════════

    if (textbook === '入試対策編') {
      // 入試対策編の場合は全教科書のレッスン順序シートを更新
      console.log(`\n📌 入試対策編のレッスンを編集したため、全教科書のレッスン順序シートを検索`);
      console.log(`対象ファイル数: ${allFiles.length}`);

      allFiles.forEach((file) => {
        // 入試対策編以外のファイルのみを処理
        if (file.getName() === '入試対策編') {
          console.log(`  ⏭️ スキップ: ${file.getName()}`);
          return;
        }

        console.log(`\n  📂 ファイル: ${file.getName()}`);

        const targetSs = SpreadsheetApp.open(file);
        const orderSheet = targetSs.getSheetByName('レッスン順序');

        if (!orderSheet) {
          console.log(`    ⚠️ 「レッスン順序」シートが見つかりません`);
          return;
        }

        console.log(`    ✅ 「レッスン順序」シート発見`);

        const orderLastRow = orderSheet.getLastRow();
        const orderLastCol = orderSheet.getLastColumn();

        if (orderLastRow > 1 && orderLastCol >= 1) {
          const orderData = orderSheet.getRange(2, 1, orderLastRow - 1, orderLastCol).getValues();

          console.log(`    📊 データ行数: ${orderData.length}, 列数: ${orderLastCol}`);

          // 全列を走査
          orderData.forEach((row, rowIdx) => {
            row.forEach((cell, colIdx) => {
              const cellValue = cell ? cell.toString().trim() : '';

              // 完全一致で検索・更新
              if (cellValue === oldLessonName) {
                const actualRow = rowIdx + 2;
                const actualCol = colIdx + 1;

                orderSheet.getRange(actualRow, actualCol).setValue(newLessonName);

                console.log(`    ✅ 行${actualRow}列${actualCol}: "${oldLessonName}" → "${newLessonName}"`);
                orderUpdateCount++;
              }
            });
          });
        }
      });

    } else {
      // 通常教科書の場合は該当教科書のレッスン順序シートのみ更新
      console.log(`\n📌 通常教科書のレッスンを編集したため、該当教科書のレッスン順序シートを検索`);

      const orderSheet = ss.getSheetByName('レッスン順序');

      if (orderSheet) {
        console.log(`✅ 「レッスン順序」シート発見`);

        const orderLastRow = orderSheet.getLastRow();
        const orderLastCol = orderSheet.getLastColumn();

        if (orderLastRow > 1 && orderLastCol >= 1) {
          const orderData = orderSheet.getRange(2, 1, orderLastRow - 1, orderLastCol).getValues();

          console.log(`📊 「レッスン順序」データ行数: ${orderData.length}, 列数: ${orderLastCol}`);

          // 全列を走査
          orderData.forEach((row, rowIdx) => {
            row.forEach((cell, colIdx) => {
              const cellValue = cell ? cell.toString().trim() : '';

              // 完全一致で検索・更新
              if (cellValue === oldLessonName) {
                const actualRow = rowIdx + 2;
                const actualCol = colIdx + 1;

                orderSheet.getRange(actualRow, actualCol).setValue(newLessonName);

                console.log(`  ✅ 「レッスン順序」シート行${actualRow}列${actualCol}: "${oldLessonName}" → "${newLessonName}"`);
                orderUpdateCount++;
              }
            });
          });
        }
      } else {
        console.log(`⚠️ 「レッスン順序」シートが見つかりません`);
      }
    }

    console.log(`\n=== 更新完了 ===`);
    console.log(`「レッスン順序」シート更新数: ${orderUpdateCount}`);

    return { success: true, updatedCount: orderUpdateCount };

  } catch (e) {
    Logger.log('❌ Error updateLessonName: ' + e);
    Logger.log(e.stack);
    return { success: false, updatedCount: 0, error: e.toString() };
  }
}

/**
 * ✅ 新規関数：指定教科書・学年のレッスン一覧を取得
 * 通常教科書 + 入試対策編のレッスンを両方取得してマージ
 * 重複除外・ソート済み
 * 
 * @param {string} year - 年度（例：「2024年度版」）
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（またはシート名）
 * @returns {Array} レッスン名の配列（ソート済み・重複なし）
 */
function getLessonList(year, textbook, grade) {
  try {
    console.log('=== getLessonList called ===');
    console.log(`year: ${year}, textbook: ${textbook}, grade: ${grade}`);

    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let lessons = new Set();
    let fileArray = [];

    // ✅ ファイル配列に変換
    while (files.hasNext()) {
      fileArray.push(files.next());
    }

    // ========================================
    // ① 指定教科書からレッスン取得
    // ========================================
    console.log(`① 教科書「${textbook}」からレッスン取得中...`);

    fileArray.forEach(file => {
      if (file.getName() !== textbook) return;

      const ss = SpreadsheetApp.open(file);
      const sheet = ss.getSheetByName(grade);

      if (!sheet) {
        console.log(`  ⚠️ シート「${grade}」が見つかりません`);
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        console.log(`  ⚠️ データがありません`);
        return;
      }

      // 列6（lesson列）を取得
      const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();

      data.forEach(row => {
        const lessonName = row[0] ? row[0].toString().trim() : '';
        if (lessonName) {
          lessons.add(lessonName);
        }
      });

      console.log(`  ✅ ${lessons.size}件のレッスンを取得`);
    });

    // ========================================
    // ② 入試対策編からレッスン取得
    // ========================================
    console.log(`② 入試対策編からレッスン取得中...`);

    fileArray.forEach(file => {
      if (file.getName() !== '入試対策編') return;

      const ss = SpreadsheetApp.open(file);
      const sheets = ss.getSheets();

      sheets.forEach(sheet => {
        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) return;

        // 列6（lesson列）を取得
        const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();

        data.forEach(row => {
          const lessonName = row[0] ? row[0].toString().trim() : '';
          if (lessonName) {
            lessons.add(lessonName);
          }
        });
      });

      console.log(`  ✅ 入試対策編から${lessons.size}件のレッスンを取得`);
    });

    // ========================================
    // ③ 重複除外＆ソート
    // ========================================
    const sortedLessons = Array.from(lessons).sort();

    console.log(`=== 結果 ===`);
    console.log(`取得レッスン数: ${sortedLessons.length}`);
    console.log('レッスン一覧:', sortedLessons);

    return sortedLessons;

  } catch (e) {
    console.error('❌ Error getLessonList: ' + e);
    Logger.log('Error getLessonList: ' + e);
    return [];
  }
}

/**
 * ✅ 新規関数：保存後処理専用のレッスン一覧取得
 * 
 * 処理：
 * 1. 指定教科書のレッスンのみを取得
 * 2. 入試対策編のレッスンは含めない（通常教科書の場合）
 * 3. 入試対策編の場合のみ、すべてのシートからレッスンを取得
 * 
 * @param {string} year - 年度（例：「2024年度版」）
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（またはシート名）
 * @returns {Array} レッスン名の配列（ソート済み・重複なし）
 */
function getLessonListForSave(year, textbook, grade) {
  try {
    console.log('=== getLessonListForSave called ===');
    console.log(`year: ${year}, textbook: ${textbook}, grade: ${grade}`);

    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let lessons = new Set();
    let fileArray = [];

    // ✅ ファイル配列に変換
    while (files.hasNext()) {
      fileArray.push(files.next());
    }

    // ========================================
    // 入試対策編の場合
    // ========================================
    if (textbook === '入試対策編') {
      console.log(`① 入試対策編：すべてのシートからレッスン取得`);

      fileArray.forEach(file => {
        if (file.getName() !== '入試対策編') return;

        const ss = SpreadsheetApp.open(file);
        const sheets = ss.getSheets();

        sheets.forEach(sheet => {
          const lastRow = sheet.getLastRow();
          if (lastRow <= 1) return;

          // 列6（lesson列）を取得
          const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();

          data.forEach(row => {
            const lessonName = row[0] ? row[0].toString().trim() : '';
            if (lessonName) {
              lessons.add(lessonName);
            }
          });
        });

        console.log(`  ✅ ${lessons.size}件のレッスンを取得`);
      });
    } 
    // ========================================
    // 通常教科書の場合
    // ========================================
    else {
      console.log(`① 教科書「${textbook}」からレッスン取得（入試対策編は除外）`);

      fileArray.forEach(file => {
        if (file.getName() !== textbook) return;

        const ss = SpreadsheetApp.open(file);
        const sheet = ss.getSheetByName(grade);

        if (!sheet) {
          console.log(`  ⚠️ シート「${grade}」が見つかりません`);
          return;
        }

        const lastRow = sheet.getLastRow();
        if (lastRow <= 1) {
          console.log(`  ⚠️ シート「${grade}」にデータがありません`);
          return;
        }

        // 列6（lesson列）を取得
        const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();

        data.forEach(row => {
          const lessonName = row[0] ? row[0].toString().trim() : '';
          if (lessonName) {
            lessons.add(lessonName);
          }
        });

        console.log(`  ✅ ${lessons.size}件のレッスンを取得`);
      });
    }

    // ========================================
    // 重複除外＆ソート
    // ========================================
    const sortedLessons = Array.from(lessons).sort();

    console.log(`=== 結果 ===`);
    console.log(`取得レッスン数: ${sortedLessons.length}`);
    console.log('レッスン一覧:', sortedLessons);

    return sortedLessons;

  } catch (e) {
    console.error('❌ Error getLessonListForSave: ' + e);
    Logger.log('Error getLessonListForSave: ' + e);
    return [];
  }
}

/**
 * ✅ 完全修正版：GAS側の saveFukisokuData()
 * フロント側から受け取ったデータから、正確に14列・18列のデータを構築
 * 
 * 不規則動詞①：14列
 * [0] word_id, [1] english, [2] pronunciation, [3] japanese, [4] audio, [5] lesson, [6] cell_id,
 * [7] past_word_id, [8] past_english, [9] past_pronunciation, [10] past_audio, [11] (空), [12] (空), [13] (空)
 * 
 * 不規則動詞②：18列
 * [0] word_id, [1] english, [2] pronunciation, [3] japanese, [4] audio, [5] lesson, [6] cell_id,
 * [7] past_word_id, [8] past_english, [9] past_pronunciation, [10] past_audio,
 * [11] past_participle_word_id, [12] past_participle_english, [13] past_participle_pronunciation, [14] past_participle_audio,
 * [15] (空), [16] (空), [17] (空)
 */
function saveFukisokuData(year, textbook, grade, lesson, fukisokuDataMap, allWords) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let targetFile = null;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) {
      throw new Error('スプレッドシートが見つかりません');
    }

    const ss = SpreadsheetApp.open(targetFile);

    let sheetName = '';

    if (textbook === '入試対策編') {
      if (lesson.startsWith('不規則動詞①')) {
        sheetName = '不規則動詞①';
      } else if (lesson.startsWith('不規則動詞②')) {
        sheetName = '不規則動詞②';
      } else {
        throw new Error('不規則動詞のレッスン名が不正です');
      }
    } else {
      sheetName = grade;
    }

    Logger.log('保存先ファイルID: ' + targetFile.getId());
    Logger.log('保存先ファイル名: ' + targetFile.getName());
    Logger.log('保存先シート名: ' + sheetName);

    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`シート「${sheetName}」が見つかりません`);
    }

    const isFukisoku1 = sheetName === '不規則動詞①';
    const maxCols = isFukisoku1 ? 14 : 18;

    // ✅ 修正版：フロント側のデータ構造に合わせて rowsToAdd を構築
    const rowsToAdd = Object.values(fukisokuDataMap).map(data => {
      // ✅ マスターデータからaudio情報を取得
      const masterWord = allWords.find(w => w.id === data.meaningMasterId);
      const presentAudio = masterWord ? masterWord.audio : '';

      // ✅ 過去形のaudio取得
      let pastWordId = data.pastMasterId || '';
      let pastAudio = '';
      if (data.pastMasterId) {
        const pastMaster = allWords.find(w => w.id === data.pastMasterId);
        pastAudio = pastMaster ? pastMaster.audio : '';
      }

      // ✅ 過去分詞のaudio取得（②の場合）
      let pastPartWordId = '';
      let pastPartAudio = '';
      if (!isFukisoku1 && data.pastPartMasterId) {
        pastPartWordId = data.pastPartMasterId;
        const pastPartMaster = allWords.find(w => w.id === data.pastPartMasterId);
        pastPartAudio = pastPartMaster ? pastPartMaster.audio : '';
      }

      if (isFukisoku1) {
        // 不規則動詞①：14列
        const row = [];
        row[0] = data.meaningMasterId || '';           // word_id
        row[1] = data.present;                          // english
        row[2] = data.presentPronunciation || '';       // pronunciation
        row[3] = data.meaning;                          // japanese
        row[4] = presentAudio || '';                    // audio
        row[5] = lesson;                                // lesson
        row[6] = data.cellId;                           // cell_id
        row[7] = pastWordId;                            // past_word_id
        row[8] = data.past || '';                       // past_english
        row[9] = data.pastPronunciation || '';          // past_pronunciation
        row[10] = pastAudio || '';                      // past_audio
        row[11] = '';                                   // (空)
        row[12] = '';                                   // (空)
        row[13] = '';                                   // (空)
        return row;
      } else {
        // 不規則動詞②：18列
        const row = [];
        row[0] = data.meaningMasterId || '';            // word_id
        row[1] = data.present;                          // english
        row[2] = data.presentPronunciation || '';       // pronunciation
        row[3] = data.meaning;                          // japanese
        row[4] = presentAudio || '';                    // audio
        row[5] = lesson;                                // lesson
        row[6] = data.cellId;                           // cell_id
        row[7] = pastWordId;                            // past_word_id
        row[8] = data.past || '';                       // past_english
        row[9] = data.pastPronunciation || '';          // past_pronunciation
        row[10] = pastAudio || '';                      // past_audio
        row[11] = pastPartWordId;                       // past_participle_word_id
        row[12] = data.pastPart || '';                  // past_participle_english
        row[13] = data.pastPartPronunciation || '';     // past_participle_pronunciation
        row[14] = pastPartAudio || '';                  // past_participle_audio
        row[15] = '';                                   // (空)
        row[16] = '';                                   // (空)
        row[17] = '';                                   // (空)
        return row;
      }
    });

    if (rowsToAdd.length === 0) {
      throw new Error('保存対象データが空です');
    }

    Logger.log(`✅ rowsToAdd の最初の行の列数: ${rowsToAdd[0].length}`);
    Logger.log(`✅ rowsToAdd の最初の行: ${JSON.stringify(rowsToAdd[0])}`);

    const lastRow = sheet.getLastRow();
    
    // ✅ 既存レッスンデータを削除
    if (lastRow > 1) {
      const allData = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();
      const lessonRowIndices = [];
      
      allData.forEach((row, idx) => {
        const cellLesson = row[5] ? row[5].toString().trim() : '';
        if (cellLesson === lesson) {
          lessonRowIndices.push(idx);
        }
      });

      Logger.log(`削除対象行数: ${lessonRowIndices.length}`);

      // ✅ 逆順で削除
      for (let i = lessonRowIndices.length - 1; i >= 0; i--) {
        const deleteIdx = lessonRowIndices[i];
        const deleteRow = deleteIdx + 2;
        
        if (deleteRow > 1) {
          Logger.log(`削除: 行${deleteRow}`);
          sheet.deleteRow(deleteRow);
        }
      }
    }

    // ✅ 削除後に最後の行番号を取得し直す
    const newLastRow = sheet.getLastRow();
    const insertRow = newLastRow + 1;

    Logger.log(`挿入開始行: ${insertRow}, データ行数: ${rowsToAdd.length}, カラム数: ${maxCols}`);

    // ✅ 行数チェック
    if (insertRow < 2 || rowsToAdd.length < 1) {
      throw new Error(`不正な行番号またはデータ数: insertRow=${insertRow}, dataRows=${rowsToAdd.length}`);
    }

    // ✅ 修正：rowsToAdd の各行が maxCols 列であることを確認
    for (let i = 0; i < rowsToAdd.length; i++) {
      if (rowsToAdd[i].length !== maxCols) {
        Logger.log(`⚠️ 行${i}の列数が不正: ${rowsToAdd[i].length}列（期待値: ${maxCols}列）`);
        throw new Error(`行${i}の列数が不正: ${rowsToAdd[i].length}列（期待値: ${maxCols}列）`);
      }
    }

    // ✅ データを挿入
    sheet.getRange(insertRow, 1, rowsToAdd.length, maxCols).setValues(rowsToAdd);

    Logger.log(`✅ ${rowsToAdd.length}件のデータを行${insertRow}に保存しました`);
    
    // ✅ 保存内容をログに出力（デバッグ用）
    Logger.log('保存データ例（最初の1行）:');
    if (rowsToAdd.length > 0) {
      Logger.log(JSON.stringify(rowsToAdd[0]));
    }

    return { success: true };

  } catch (e) {
    Logger.log('❌ saveFukisokuData エラー: ' + e.toString());
    Logger.log(e.stack);
    return { success: false, error: e.toString() };
  }
}

/**
 * ✅ 完全修正版：不規則動詞①②のデータを復元
 * ワードIDからマスターデータを参照して、常に最新データを使用
 * 
 * ✅ 修正：rowCount ではなく rowIdx を使用
 * スプレッドシートの行番号と fukisokuDataMap のキーを対応させる
 * 
 * 不規則動詞①：14列を想定
 * [0] word_id, [1] english, [2] pronunciation, [3] japanese, [4] audio, [5] lesson, [6] cell_id,
 * [7] past_word_id, [8] past_english, [9] past_pronunciation, [10] past_audio, [11-13] (空)
 * 
 * 不規則動詞②：18列を想定
 * [0] word_id, [1] english, [2] pronunciation, [3] japanese, [4] audio, [5] lesson, [6] cell_id,
 * [7] past_word_id, [8] past_english, [9] past_pronunciation, [10] past_audio,
 * [11] past_participle_word_id, [12] past_participle_english, [13] past_participle_pronunciation, [14] past_participle_audio,
 * [15-17] (空)
 * 
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - シート名
 * @param {string} lesson - レッスン名
 * @param {Array} allWords - マスター単語配列
 * @returns {Object} { fukisokuDataMap: {...}, success: boolean }
 */
function loadFukisokuData(year, textbook, grade, lesson, allWords) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let targetFile = null;

    // ===== 保存先スプレッドシート決定 =====
    while (files.hasNext()) {
      const file = files.next();
      if (
        (textbook === '入試対策編' && file.getName() === '入試対策編') ||
        (textbook !== '入試対策編' && file.getName() === textbook)
      ) {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) {
      return { fukisokuDataMap: {}, success: true };
    }

    const ss = SpreadsheetApp.open(targetFile);

    // ===== 保存先シート名決定 =====
    let targetSheetName = grade;

    const fukisokuMatch = lesson.match(/^(不規則動詞\d+)/);
    if (fukisokuMatch) {
      targetSheetName = fukisokuMatch[1];
    }

    const sheet = ss.getSheetByName(targetSheetName);
    if (!sheet) {
      return { fukisokuDataMap: {}, success: true };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { fukisokuDataMap: {}, success: true };
    }

    // ===== 列数判定 =====
    const isFukisoku1 = targetSheetName === '不規則動詞①';
    const maxCols = isFukisoku1 ? 14 : 18;

    const data = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

    const fukisokuDataMap = {};
    let rowCount = 0;

    // ✅ 修正：rowIdx でループして、rowCount で マップキーを付与
    // これで保存時の tableData[rowIdx] と一致させられる
    data.forEach((row, rowIdx) => {
      const cellLesson = row[5] ? row[5].toString().trim() : '';
      if (cellLesson !== lesson) return;

      // ✅ ワードIDからマスターデータを参照
      const meaningWordId = row[0] ? Number(row[0]) : null;
      const pastWordId = row[7] ? Number(row[7]) : null;
      const pastPartWordId = isFukisoku1 ? null : (row[11] ? Number(row[11]) : null);

      // ✅ マスターデータから最新情報を取得
      const meaningMaster = meaningWordId ? allWords.find(w => w.id === meaningWordId) : null;
      const pastMaster = pastWordId ? allWords.find(w => w.id === pastWordId) : null;
      const pastPartMaster = pastPartWordId ? allWords.find(w => w.id === pastPartWordId) : null;

      // ✅ マスターがあれば最新データを、なければシートデータを使用
      const meaning = meaningMaster ? meaningMaster.japanese : (row[3] || '');
      const presentEnglish = meaningMaster ? meaningMaster.english : (row[1] || '');
      const presentPronunciation = meaningMaster ? meaningMaster.pronunciation : (row[2] || '');
      const presentAudio = meaningMaster ? meaningMaster.audio : (row[4] || '');

      const past = pastMaster ? pastMaster.english : (row[8] || '');
      const pastPronunciation = pastMaster ? pastMaster.pronunciation : (row[9] || '');
      const pastAudio = pastMaster ? pastMaster.audio : (row[10] || '');

      // ✅ 修正：rowCount をキーに使用（連番で記録）
      if (isFukisoku1) {
        fukisokuDataMap[rowCount] = {
          meaningMasterId: meaningWordId,
          present: presentEnglish,
          presentPronunciation: presentPronunciation,
          presentAudio: presentAudio,
          presentMasterId: meaningWordId,
          meaning: meaning,
          cellId: row[6] ? Number(row[6]) : null,
          past: past,
          pastPronunciation: pastPronunciation,
          pastAudio: pastAudio,
          pastMasterId: pastWordId
        };
      } else {
        // 不規則動詞②
        const pastPart = pastPartMaster ? pastPartMaster.english : (row[12] || '');
        const pastPartPronunciation = pastPartMaster ? pastPartMaster.pronunciation : (row[13] || '');
        const pastPartAudio = pastPartMaster ? pastPartMaster.audio : (row[14] || '');

        fukisokuDataMap[rowCount] = {
          meaningMasterId: meaningWordId,
          present: presentEnglish,
          presentPronunciation: presentPronunciation,
          presentAudio: presentAudio,
          presentMasterId: meaningWordId,
          meaning: meaning,
          cellId: row[6] ? Number(row[6]) : null,
          past: past,
          pastPronunciation: pastPronunciation,
          pastAudio: pastAudio,
          pastMasterId: pastWordId,
          pastPart: pastPart,
          pastPartPronunciation: pastPartPronunciation,
          pastPartAudio: pastPartAudio,
          pastPartMasterId: pastPartWordId
        };
      }

      rowCount++;  // ✅ マップの次のキー番号に進める
    });

    Logger.log(`✅ 不規則動詞データを読み込みました: ${targetSheetName} > ${lesson} (${rowCount}件)`);
    Logger.log('✅ ワードIDからマスターデータを参照して最新データを取得しました');
    Logger.log('✅ fukisokuDataMap:', fukisokuDataMap);
    
    return { fukisokuDataMap, success: true };

  } catch (e) {
    Logger.log('❌ Error loadFukisokuData: ' + e);
    Logger.log(e.stack);
    return { fukisokuDataMap: {}, success: false, error: e.toString() };
  }
}

/**
 * ✅ 新規関数：不規則動詞用 - マスターデータ修正時に tableData と fukisokuDataMap を更新
 * 
 * @param {number} masterId - 修正されたマスターワードID
 * @param {string} newEnglish - 新しい英語
 * @param {string} newPronunciation - 新しい発音
 * @param {string} newJapanese - 新しい日本語
 */
function updateFukisokuTableByMasterId(masterId) {
  // ✅ 不規則動詞①②の判定
  const isFukisoku1Check = state.textbook === '入試対策編' && state.lesson.startsWith('不規則動詞①');
  const isFukisoku2Check = state.textbook === '入試対策編' && state.lesson.startsWith('不規則動詞②');

  if (!isFukisoku1Check && !isFukisoku2Check) {
    // 通常レッスンなので、既存の関数を使用
    updateTableDisplayByMasterId(masterId);
    return;
  }

  // ✅ マスターデータから更新された情報を取得
  const masterWord = allWords.find(w => w.id === masterId);
  if (!masterWord) {
    console.warn(`マスターワードID ${masterId} が見つかりません`);
    return;
  }

  // ✅ fukisokuDataMap を更新
  const fukisokuDataMap = isFukisoku1Check
    ? (window.fukisoku1DataMap || {})
    : (window.fukisoku2DataMap || {});

  let updateCount = 0;

  // ════════════════════════════════════════
  // ケース1：現在形のマスターが更新された場合
  // ════════════════════════════════════════
  Object.entries(fukisokuDataMap).forEach(([rowIdx, data]) => {
    if (data.meaningMasterId === masterId) {
      console.log(`✅ 現在形を更新: ${data.present} → ${masterWord.english}`);
      
      // fukisokuDataMap を更新
      data.present = masterWord.english;
      data.presentPronunciation = masterWord.pronunciation || '';
      data.presentAudio = masterWord.audio || '';
      data.meaning = masterWord.japanese || '';

      // tableData も更新
      if (tableData[rowIdx] && tableData[rowIdx][0]) {
        tableData[rowIdx][0].english = masterWord.english;
        tableData[rowIdx][0].pronunciation = masterWord.pronunciation || '';
        tableData[rowIdx][0].japanese = masterWord.japanese || '';
      }

      updateCount++;
    }
  });

  // ════════════════════════════════════════
  // ケース2：過去形のマスターが更新された場合
  // ════════════════════════════════════════
  Object.entries(fukisokuDataMap).forEach(([rowIdx, data]) => {
    if (data.pastMasterId === masterId) {
      console.log(`✅ 過去形を更新: ${data.past} → ${masterWord.english}`);
      
      // fukisokuDataMap を更新
      data.past = masterWord.english;
      data.pastPronunciation = masterWord.pronunciation || '';
      data.pastAudio = masterWord.audio || '';

      updateCount++;
    }
  });

  // ════════════════════════════════════════
  // ケース3：過去分詞のマスターが更新された場合（②のみ）
  // ════════════════════════════════════════
  if (isFukisoku2Check) {
    Object.entries(fukisokuDataMap).forEach(([rowIdx, data]) => {
      if (data.pastPartMasterId === masterId) {
        console.log(`✅ 過去分詞を更新: ${data.pastPart} → ${masterWord.english}`);
        
        // fukisokuDataMap を更新
        data.pastPart = masterWord.english;
        data.pastPartPronunciation = masterWord.pronunciation || '';
        data.pastPartAudio = masterWord.audio || '';

        updateCount++;
      }
    });
  }

  // ✅ メモリに保存
  if (isFukisoku1Check) {
    window.fukisoku1DataMap = fukisokuDataMap;
  } else {
    window.fukisoku2DataMap = fukisokuDataMap;
  }

  console.log(`✅ ${updateCount}件の不規則動詞データを更新しました`);

  // ✅ テーブルを再描画
  if (updateCount > 0) {
    renderTable();
    hasChanges = true;
    document.getElementById('saveBtn').disabled = false;
  }
}

/**
 * ============================================================
 * ✅ 完全修正版：PDF生成用レッスンデータ取得
 * 
 * 処理フロー：
 * 1. 「レッスン順序」シートから選択学年のレッスン順を取得
 * 2. 各レッスンについて：
 *    - 不規則動詞①または②で始まる → 入試対策編の対応シートから取得
 *    - その他 → 選択教科書の学年シート + 入試対策編「通常」から取得
 * 3. レッスン順序通りに データを構築
 * ============================================================
 */
function getAllLessonsDataForExamPrep(year, textbook, grade) {
  try {
    console.log('=== getAllLessonsDataForExamPrep 開始 ===');
    console.log(`year: ${year}, textbook: ${textbook}, grade: ${grade}`);

    const masterData = getAllWordsAndSentences();
    const allWords = masterData.words;

    // ===== ① レッスン順序を取得 =====
    const orderResult = getSavedLessonOrder(year, textbook, grade);
    const lessonOrder = orderResult.lessons;

    console.log('取得したレッスン順序:', lessonOrder);

    if (!lessonOrder || lessonOrder.length === 0) {
      console.log('❌ レッスン順序が空です');
      return { lessons: [] };
    }

    // ===== ② 各レッスンについてデータを取得 =====
    const allLessonsData = [];

    for (const lessonName of lessonOrder) {
      console.log(`\n--- レッスン処理: ${lessonName} ---`);

      let lessonData = null;
      let source = null; // ✅ ソース情報

      // ✅ 不規則動詞①の場合
      if (lessonName.startsWith('不規則動詞①')) {
        console.log('  → 入試対策編「不規則動詞①」から取得');
        lessonData = getLessonDataFromExamPrep(year, lessonName, '不規則動詞①');
        source = 'examPrep'; // ✅ 入試対策編
      }
      // ✅ 不規則動詞②の場合
      else if (lessonName.startsWith('不規則動詞②')) {
        console.log('  → 入試対策編「不規則動詞②」から取得');
        lessonData = getLessonDataFromExamPrep(year, lessonName, '不規則動詞②');
        source = 'examPrep'; // ✅ 入試対策編
      }
      // ✅ その他のレッスン
      else {
        console.log(`  → 教科書「${textbook}」の「${grade}」 + 入試対策編「通常」から取得`);
        lessonData = getLessonDataFromBoth(year, textbook, grade, lessonName);
        // ✅ ソース情報は lessonData 内に含まれる
        source = lessonData.source || 'textbook';
      }

      if (lessonData && lessonData.items.length > 0) {
        console.log(`  ✅ ${lessonData.items.length}件のデータを取得`);

        allLessonsData.push({
          lesson: lessonName,
          layoutType: determineLayoutType(lessonName),
          tableData: convertToTableData(lessonData.items, isFukisoku(lessonName)),
          rawItems: lessonData.items,
          source: source // ✅ ソース情報を追加
        });
      } else {
        console.log(`  ⚠️ データが見つかりません`);
      }
    }

    console.log(`\n=== 結果 ===`);
    console.log(`取得レッスン数: ${allLessonsData.length}`);
    console.log('レッスン一覧:', allLessonsData.map(l => l.lesson));

    return { 
      lessons: allLessonsData, 
      allWords: allWords 
    };

  } catch (e) {
    Logger.log('❌ Error getAllLessonsDataForExamPrep: ' + e);
    Logger.log(e.stack);
    return { 
      lessons: [],
      allWords: []
    };
  }
}

/**
 * ✅ 新規関数：入試対策編から特定レッスンのデータを取得
 * @param {string} year - 年度
 * @param {string} lesson - レッスン名
 * @param {string} sheetName - シート名（「不規則動詞①」または「不規則動詞②」）
 * @returns {Object} { items: [...], success: boolean }
 */
function getLessonDataFromExamPrep(year, lesson, sheetName) {
  try {
    const folderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const rootFolder = DriveApp.getFolderById(folderId);
    const yearFolder = rootFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    let targetFile = null;

    // 入試対策編ファイルを取得
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === '入試対策編') {
        targetFile = file;
        break;
      }
    }

    if (!targetFile) {
      console.log('  ❌ 入試対策編ファイルが見つかりません');
      return { items: [], success: false };
    }

    const ss = SpreadsheetApp.open(targetFile);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      console.log(`  ❌ シート「${sheetName}」が見つかりません`);
      return { items: [], success: false };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      console.log(`  ⚠️ シート「${sheetName}」にデータがありません`);
      return { items: [], success: true };
    }

    // ✅ 不規則動詞①②の列数を取得
    // ✅ 修正：不規則動詞②は18列
const maxCols = sheetName === '不規則動詞②' ? 18 : getMaxColumnsForSheet('入試対策編', sheetName);
const values = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

    console.log(`  取得行数: ${values.length}, 列数: ${maxCols}`);

    // ✅ レッスンが一致するデータのみを抽出
    const items = [];

    values.forEach((row) => {
      const cellLesson = row[5] ? row[5].toString().trim() : '';

      // ✅ 修正：前方一致で判定（例：「不規則動詞①(1)」など）
      const lessonBase = lesson.split('(')[0].trim();
      const cellLessonBase = cellLesson.split('(')[0].trim();

      if (cellLessonBase !== lessonBase) {
        return; // このレッスンではない
      }

      const item = {
        wordId: row[0] ? Number(row[0]) : null,
        english: row[1] || '',
        pronunciation: row[2] || '',
        japanese: row[3] || '',
        audio: row[4] || '',
        lesson: cellLesson,
        cellId: row[6] ? Number(row[6]) : null
      };

      // ✅ 過去形データ（列7-10）
      if (sheetName === '不規則動詞①' || sheetName === '不規則動詞②') {
        item.pastWordId = row[7] ? Number(row[7]) : null;
        item.pastEnglish = row[8] || '';
        item.pastPronunciation = row[9] || '';
        item.pastAudio = row[10] || '';
      }

      // ✅ 過去分詞データ（列11-14、②のみ）
      if (sheetName === '不規則動詞②') {
        item.pastPartWordId = row[11] ? Number(row[11]) : null;
        item.pastParticipleEnglish = row[12] || '';
        item.pastParticiplePronunciation = row[13] || '';
        item.pastParticipleAudio = row[14] || '';
      }

      items.push(item);
    });

    console.log(`  抽出データ: ${items.length}件`);

    return { items, success: true };

  } catch (e) {
    Logger.log('❌ Error getLessonDataFromExamPrep: ' + e);
    return { items: [], success: false };
  }
}

/**
 * ✅ 修正版：選択教科書 + 入試対策編「通常」から該当レッスンのデータを取得
 * 各アイテムにシート情報を追加
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年
 * @param {string} lesson - レッスン名
 * @returns {Object} { items: [...], source: 'examPrep' or 'textbook', success: boolean }
 */
function getLessonDataFromBoth(year, textbook, grade, lesson) {
  try {
    const items = [];
    let sourceType = 'textbook'; // デフォルト値

    const folderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const rootFolder = DriveApp.getFolderById(folderId);
    const yearFolder = rootFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    const fileArray = [];
    while (files.hasNext()) {
      fileArray.push(files.next());
    }

    // ===== ① 選択教科書のデータを取得 =====
    console.log(`  ① 教科書「${textbook}」から取得中...`);

    let textbookDataFound = false;

    fileArray.forEach((file) => {
      if (file.getName() !== textbook) return;

      const ss = SpreadsheetApp.open(file);
      const sheet = ss.getSheetByName(grade);

      if (!sheet) {
        console.log(`    ⚠️ シート「${grade}」が見つかりません`);
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        console.log(`    ⚠️ シート「${grade}」にデータがありません`);
        return;
      }

      const maxCols = 7; // 通常教科書は7列
      const values = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

      values.forEach((row) => {
        const cellLesson = row[5] ? row[5].toString().trim() : '';

        if (cellLesson !== lesson) {
          return; // このレッスンではない
        }

        const item = {
          wordId: row[0] ? Number(row[0]) : null,
          english: row[1] || '',
          pronunciation: row[2] || '',
          japanese: row[3] || '',
          audio: row[4] || '',
          lesson: cellLesson,
          cellId: row[6] ? Number(row[6]) : null,
          source: 'textbook' // ✅ ソース情報
        };

        items.push(item);
        textbookDataFound = true;
      });

      console.log(`    ✅ ${items.length}件のデータを取得`);
    });

    // ===== ② 入試対策編「通常」のデータを取得 =====
    console.log(`  ② 入試対策編「通常」から取得中...`);

    fileArray.forEach((file) => {
      if (file.getName() !== '入試対策編') return;

      const ss = SpreadsheetApp.open(file);
      const sheet = ss.getSheetByName('通常');

      if (!sheet) {
        console.log(`    ⚠️ シート「通常」が見つかりません`);
        return;
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        console.log(`    ⚠️ シート「通常」にデータがありません`);
        return;
      }

      const maxCols = 7; // 通常シートは7列
      const values = sheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

      let addedCount = 0;

      values.forEach((row) => {
        const cellLesson = row[5] ? row[5].toString().trim() : '';

        if (cellLesson !== lesson) {
          return; // このレッスンではない
        }

        const item = {
          wordId: row[0] ? Number(row[0]) : null,
          english: row[1] || '',
          pronunciation: row[2] || '',
          japanese: row[3] || '',
          audio: row[4] || '',
          lesson: cellLesson,
          cellId: row[6] ? Number(row[6]) : null,
          source: 'examPrep' // ✅ ソース情報（入試対策編）
        };

        items.push(item);
        addedCount++;

        // ✅ 入試対策編からデータが取得された場合、ソースを更新
        sourceType = 'examPrep';
      });

      console.log(`    ✅ ${addedCount}件のデータを取得`);
    });

    console.log(`  合計: ${items.length}件, ソース: ${sourceType}`);

    // ✅ デバッグ：不規則動詞②のデータ詳細を確認
    if (lesson.startsWith('不規則動詞②')) {
      Logger.log('📌 不規則動詞②のデータ詳細:');
      items.forEach((item, idx) => {
        Logger.log(`[${idx}] english: "${item.english}", pastEnglish: "${item.pastEnglish || '(空)'}", pastParticipleEnglish: "${item.pastParticipleEnglish || '(空)'}"`);
      });
    }

    // ✅ ソース情報を返す
    return { items, source: sourceType, success: true };

  } catch (e) {
    Logger.log('❌ Error getLessonDataFromBoth: ' + e);
    return { items: [], source: 'textbook', success: false };
  }
}

/**
 * ✅ 新規関数：レッスン名からレイアウトタイプを判定
 */
function determineLayoutType(lessonName) {
  if (lessonName.startsWith('不規則動詞①')) {
    return 'fukisoku1';
  }
  if (lessonName.startsWith('不規則動詞②')) {
    return 'fukisoku2';
  }
  if (lessonName === '曜日・月・季節・代名詞') {
    return 'special';
  }
  return 'normal';
}

/**
 * ✅ 新規関数：不規則動詞かどうかを判定
 */
function isFukisoku(lessonName) {
  return lessonName.startsWith('不規則動詞①') || lessonName.startsWith('不規則動詞②');
}

/**
 * マスター単語を更新（ID指定）
 */
function updateMasterWord(wordId, newEnglish, newPronunciation, newJapanese) {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    const wordSheet = ss.getSheetByName("英単語");
    
    if (!wordSheet) {
      throw new Error('「英単語」シートが見つかりません');
    }

    const lastRow = wordSheet.getLastRow();
    if (lastRow <= 1) {
      throw new Error('単語データが見つかりません');
    }

    // ✅ 修正：5列取得（audioを含む）
    const data = wordSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    let found = false;
    let updateLog = null;

    for (let i = 0; i < data.length; i++) {
      const currentId = data[i][0] ? parseInt(data[i][0]) : i + 1;
      if (currentId === wordId) {
        const actualRow = i + 2; // データ範囲の開始は2行目
        wordSheet.getRange(actualRow, 1).setValue(wordId);
        wordSheet.getRange(actualRow, 2).setValue(newEnglish);
        wordSheet.getRange(actualRow, 3).setValue(newPronunciation);
        wordSheet.getRange(actualRow, 4).setValue(newJapanese);
        // ✅ 修正：audio列（5列目）はそのまま（更新しない）
        
        updateLog = { actualRow: actualRow, wordId: wordId };
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`単語ID ${wordId} が見つかりません`);
    }

    Logger.log(`✅ 単語を更新しました: 行${updateLog.actualRow} (ID: ${updateLog.wordId})`);
    return { success: true };
  } catch (e) {
    Logger.log('Error updateMasterWord: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * マスター文を更新（ID指定）
 */
function updateMasterSentence(sentenceId, newText, newPronunciation = '', newJapanese = '') {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    const sentenceSheet = ss.getSheetByName("英文");
    
    if (!sentenceSheet) {
      throw new Error('「英文」シートが見つかりません');
    }

    const lastRow = sentenceSheet.getLastRow();
    if (lastRow <= 1) {
      throw new Error('文データが見つかりません');
    }

    // ✅ 修正：5列取得（audio列も取得）
    const data = sentenceSheet.getRange(2, 1, lastRow - 1, 5).getValues();
    let found = false;
    let updateLog = null;

    for (let i = 0; i < data.length; i++) {
      const currentId = data[i][0] ? parseInt(data[i][0]) : null;
      if (currentId === sentenceId) {
        const actualRow = i + 2; // データ範囲の開始は2行目
        
        // 列1：ID（そのまま）
        sentenceSheet.getRange(actualRow, 1).setValue(sentenceId);
        
        // 列2：文テキスト（更新）
        sentenceSheet.getRange(actualRow, 2).setValue(newText);
        
        // 列3：発音記号（更新）
        sentenceSheet.getRange(actualRow, 3).setValue(newPronunciation);
        
        // ✅ 修正：列4：日本語（新規追加対応）
        sentenceSheet.getRange(actualRow, 4).setValue(newJapanese);
        
        updateLog = { actualRow: actualRow, sentenceId: sentenceId };
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`文ID ${sentenceId} が見つかりません`);
    }

    Logger.log(`✅ 文を更新しました: 行${updateLog.actualRow} (ID: ${updateLog.sentenceId})`);
    Logger.log(`   テキスト: ${newText}`);
    Logger.log(`   発音: ${newPronunciation || '（なし）'}`);
    Logger.log(`   日本語: ${newJapanese || '（なし）'}`);
    
    return { success: true };
  } catch (e) {
    Logger.log('Error updateMasterSentence: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * レッスンデータ内の単語を更新
 */
function updateLessonWord(year, textbook, grade, lesson, masterWordId, newEnglish, newJapanese) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        const sheet = ss.getSheetByName(grade);

        if (sheet) {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

            for (let i = 0; i < data.length; i++) {
              const cellMasterId = data[i][5] ? parseInt(data[i][5]) : null;
              const cellLesson = data[i][1] ? data[i][1].toString().trim() : '';

              if (cellMasterId === masterWordId && cellLesson === lesson) {
                const actualRow = i + 2;
                sheet.getRange(actualRow, 3).setValue(newJapanese);
                sheet.getRange(actualRow, 4).setValue(newEnglish);
              }
            }
          }
        }
        break;
      }
    }

    return { success: true };
  } catch (e) {
    Logger.log('Error updateLessonWord: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * レッスンデータ内の文を更新
 */
function updateLessonSentence(year, textbook, grade, lesson, masterSentenceId, newText, newPronunciation = '') {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        const sheet = ss.getSheetByName(grade);

        if (sheet) {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            // ✅ 修正：7列取得（audio列も含む）
            const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

            for (let i = 0; i < data.length; i++) {
              const cellMasterId = data[i][0] ? parseInt(data[i][0]) : null;
              const cellLesson = data[i][5] ? data[i][5].toString().trim() : '';

              if (cellMasterId === masterSentenceId && cellLesson === lesson) {
                const actualRow = i + 2;
                
                // 列2：テキスト（文の場合）を更新
                sheet.getRange(actualRow, 2).setValue(newText);
                
                // ✅ 列3：発音を更新
                sheet.getRange(actualRow, 3).setValue(newPronunciation);
              }
            }
          }
        }
        break;
      }
    }

    return { success: true };
  } catch (e) {
    Logger.log('Error updateLessonSentence: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * ✅ 新規関数：マスター単語を追加
 * word_idはGAS側で自動採番（最大値 + 1）
 */
function addMasterWord(english, pronunciation, japanese) {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    const wordSheet = ss.getSheetByName("英単語");
    
    if (!wordSheet) {
      throw new Error('「英単語」シートが見つかりません');
    }

    // 現在の最大word_idを取得
    const lastRow = wordSheet.getLastRow();
    let maxId = 0;

    if (lastRow > 1) {
      const data = wordSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      data.forEach(row => {
        const id = row[0] ? parseInt(row[0]) : 0;
        if (id > maxId) {
          maxId = id;
        }
      });
    }

    const newWordId = maxId + 1;
    const insertRow = lastRow + 1;

    wordSheet.getRange(insertRow, 1, 1, 5).setValues([[
      newWordId,
      english,
      pronunciation,
      japanese,
      ''
    ]]);

    Logger.log(`✅ マスター単語を追加しました: 行${insertRow} (ID: ${newWordId}, 英語: ${english})`);

    return { success: true, wordId: newWordId };
  } catch (e) {
    Logger.log('Error addMasterWord: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * ✅ 新規関数：マスター文を追加
 * sentenceIdはGAS側で自動採番（10001から始まり、既存の最大値 + 1）
 */
function addMasterSentence(text, pronunciation = '', japanese = '') {
  try {
    const englishwordsSheetId = getScriptProperty('ENGLISHWORDS_SHEET_ID');
    const ss = SpreadsheetApp.openById(englishwordsSheetId);
    const sentenceSheet = ss.getSheetByName("英文");
    
    if (!sentenceSheet) {
      throw new Error('「英文」シートが見つかりません');
    }

    // 現在の最大sentence_idを取得
    const lastRow = sentenceSheet.getLastRow();
    let maxId = 10000;

    if (lastRow > 1) {
      const data = sentenceSheet.getRange(2, 1, lastRow - 1, 1).getValues();
      data.forEach(row => {
        const id = row[0] ? parseInt(row[0]) : 10000;
        if (id > maxId) {
          maxId = id;
        }
      });
    }

    const newSentenceId = maxId + 1;
    const insertRow = lastRow + 1;

    // ✅ 修正：5列目に日本語とaudio列を含める
    sentenceSheet.getRange(insertRow, 1, 1, 5).setValues([[
      newSentenceId,
      text,
      pronunciation,  // ✅ 発音を保存
      japanese || '',   // ✅ 修正：日本語を保存
      ''              // ✅ 新規：audio列を保存（初期値は空）
    ]]);

    Logger.log(`✅ マスター文を追加しました: 行${insertRow} (ID: ${newSentenceId}, 文: ${text})`);
    Logger.log(`   発音: ${pronunciation || '（なし）'}`);
    Logger.log(`   日本語: ${japanese || '（なし）'}`);

    return { success: true, sentenceId: newSentenceId };
  } catch (e) {
    Logger.log('Error addMasterSentence: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * ════════════════════════════════════════════════════════
 * レッスン順序管理：「単語帳作成」機能用GAS関数
 * ════════════════════════════════════════════════════════
 */

/**
 * 指定教科書・学年のレッスン一覧を取得（重複なし）
 * @param {string} year - 年度（例：「2024年度版」）
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年
 * @returns {Object} { lessons: [レッスン名の配列] }
 */
function getLessonsByGrade(year, textbook, grade) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    let lessons = [];

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        const sheet = ss.getSheetByName(grade);

        if (sheet) {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            // 新しい列順序: word_id(0), english(1), pronunciation(2), japanese(3), audio(4), lesson(5), cell_id(6)
            const data = sheet.getRange(1, 6, lastRow, 1).getValues();
            
            // レッスン名を取得（1行目はヘッダーなので2行目から）
            lessons = data.slice(1)
              .map(row => row[0])
              .filter(val => val && typeof val === 'string')
              .map(val => val.trim())
              .filter((v, i, a) => a.indexOf(v) === i); // 重複除外
          }
        }
        break;
      }
    }

    return { lessons: lessons };
  } catch (e) {
    Logger.log('Error getLessonsByGrade: ' + e);
    return { lessons: [] };
  }
}

/**
 * 入試対策編のすべてのレッスン一覧を取得（ソート済み）
 * @param {string} year - 年度
 * @returns {Object} { lessons: [ソート済みレッスン名の配列] }
 */
function getExamPrepLessons(year) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    let lessons = [];

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === '入試対策編') {
        const ss = SpreadsheetApp.open(file);
        const sheets = ss.getSheets();

        // 入試対策編のすべてのシートからレッスン名を取得
        sheets.forEach(sheet => {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            const data = sheet.getRange(1, 6, lastRow, 1).getValues();
            const sheetLessons = data.slice(1)
              .map(row => row[0])
              .filter(val => val && typeof val === 'string')
              .map(val => val.trim());

            lessons = lessons.concat(sheetLessons);
          }
        });

        // 重複除外＆ソート
        lessons = lessons
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort();

        break;
      }
    }

    return { lessons: lessons };
  } catch (e) {
    Logger.log('Error getExamPrepLessons: ' + e);
    return { lessons: [] };
  }
}

/**
 * 「レッスン順序」シートを初期化または取得
 * シートが存在しない場合は作成
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @returns {Object} { success: boolean, error?: string }
 */
function initializeLessonOrderSheet(year, textbook) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        
        // 「レッスン順序」シートが存在するか確認
        let orderSheet = ss.getSheetByName('レッスン順序');
        
        if (!orderSheet) {
          // シート作成
          orderSheet = ss.insertSheet('レッスン順序');
          
          // ヘッダー行を作成（学年）
          const grades = ['中学1年', '中学2年', '中学3年'];
          orderSheet.getRange(1, 1, 1, 3).setValues([grades]);
          
          // 見出しをボールドに
          const headerRange = orderSheet.getRange(1, 1, 1, 3);
          headerRange.setFontWeight('bold');
          headerRange.setBackground('#e8e8e8');
          
          Logger.log(`✅ 「レッスン順序」シートを作成しました: ${textbook}`);
        }

        return { success: true };
      }
    }

    throw new Error('スプレッドシートが見つかりません');
  } catch (e) {
    Logger.log('Error initializeLessonOrderSheet: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * 「レッスン順序」シートから保存されたレッスン順序を取得
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（「中学1年」など）
 * @returns {Object} { lessons: [レッスン名の配列], isEmpty: boolean }
 */
function getSavedLessonOrder(year, textbook, grade) {
  try {
    const folderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const rootFolder = DriveApp.getFolderById(folderId);
    const yearFolder = rootFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() !== textbook) continue;

      const ss = SpreadsheetApp.open(file);
      const orderSheet = ss.getSheetByName('レッスン順序');
      if (!orderSheet) {
        return { lessons: [], isEmpty: true };
      }

      // 学年 → 列番号（実際に渡ってくる値に合わせる）
      const gradeColumnMap = {
        '中学1年': 1,
        '中学2年': 2,
        '中学3年': 3
      };

      const colIndex = gradeColumnMap[grade];
      if (!colIndex) {
        return { lessons: [], isEmpty: true };
      }

      const lastRow = orderSheet.getLastRow();
      if (lastRow <= 1) {
        return { lessons: [], isEmpty: true };
      }

      const values = orderSheet
        .getRange(2, colIndex, lastRow - 1, 1)
        .getValues();

      const lessons = values
        .map(r => r[0])
        .filter(v => typeof v === 'string' && v.trim() !== '')
        .map(v => v.trim());

      return { lessons, isEmpty: lessons.length === 0 };
    }

    throw new Error('スプレッドシートが見つかりません');

  } catch (e) {
    Logger.log('Error getSavedLessonOrder: ' + e);
    return { lessons: [], isEmpty: true };
  }
}

/**
 * 「レッスン順序」シートにレッスン順序を保存
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年（「中学1年」など）
 * @param {Array} lessonOrder - レッスン名の配列（順序通り）
 * @returns {Object} { success: boolean, error?: string }
 */
function saveLessonOrder(year, textbook, grade, lessonOrder) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        let orderSheet = ss.getSheetByName('レッスン順序');

        // シートがなければ作成
        if (!orderSheet) {
          orderSheet = ss.insertSheet('レッスン順序');
          const grades = ['中学1年', '中学2年', '中学3年'];
          orderSheet.getRange(1, 1, 1, 3).setValues([grades]);
          const headerRange = orderSheet.getRange(1, 1, 1, 3);
          headerRange.setFontWeight('bold');
          headerRange.setBackground('#e8e8e8');
        }

        // 学年に対応する列を特定
        const gradeColumnMap = {
          '中学1年': 1,
          '中学2年': 2,
          '中学3年': 3
        };

        const colIndex = gradeColumnMap[grade];
        if (!colIndex) {
          throw new Error(`未対応の学年: ${grade}`);
        }

        // 既存データを削除（該当列の2行目以降）
        const lastRow = orderSheet.getLastRow();
        if (lastRow > 1) {
          orderSheet.deleteRows(2, lastRow - 1);
        }

        // 新しいレッスン順序を保存
        if (lessonOrder && lessonOrder.length > 0) {
          const data = lessonOrder.map(lesson => [lesson]);
          orderSheet.getRange(2, colIndex, lessonOrder.length, 1).setValues(data);
        }

        Logger.log(`✅ レッスン順序を保存しました: ${textbook} > ${grade} (${lessonOrder.length}件)`);
        return { success: true };
      }
    }

    throw new Error('スプレッドシートが見つかりません');
  } catch (e) {
    Logger.log('Error saveLessonOrder: ' + e);
    return { success: false, error: e.toString() };
  }
}

function getColumnMap(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  const map = {};
  headers.forEach((header, index) => {
    if (!header) return;

    const key = header
      .toString()
      .trim()
      .replace(/\s+/g, ' '); // 余分な空白対策

    map[key] = index;
  });

  return map;
}

/**
 * 教科書のレッスン一覧を取得（左パネル用）
 * 重複なし、ソート済み
 */
function getAvailableLessons(year, textbook, grade) {
  try {
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    const yearFolder = englishwordsFolder.getFoldersByName(year).next();
    const files = yearFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    let allLessons = new Set();
    
    // 指定教科書のレッスンを取得
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName() === textbook) {
        const ss = SpreadsheetApp.open(file);
        const sheet = ss.getSheetByName(grade);
        
        if (sheet) {
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) {
            const data = sheet.getRange(1, 6, lastRow, 1).getValues();
            data.slice(1).forEach(row => {
              if (row[0] && typeof row[0] === 'string') {
                allLessons.add(row[0].trim());
              }
            });
          }
        }
        break;
      }
    }
    
    // 入試対策編も追加
    const examPrepResult = getExamPrepLessons(year);
    examPrepResult.lessons.forEach(lesson => allLessons.add(lesson));
    
    const sortedLessons = Array.from(allLessons).sort();
    return { lessons: sortedLessons };
  } catch (e) {
    Logger.log('Error getAvailableLessons: ' + e);
    return { lessons: [] };
  }
}

/**
 * ============================================================
 * PDFエクスポート機能（完全版）
 * ・データ取得ロジック：元コードそのまま
 * ・PDFレイアウトのみ：Tkinter Canvas 完全再現（absolute配置）
 * ============================================================
 */
/**
 * ✅ 新規：convertToTableDataNormal()
 * 通常の教科書用 - 3列それぞれに別々の単語が入る
 * cellId 1～48: 1列目1～16, 2列目17～32, 3列目33～48
 */
function convertToTableDataNormal(items) {
  // 16行 × 3列
  const table = Array.from({ length: 16 }, () => [null, null, null]);

  items.forEach(item => {
    if (!item.cellId || item.cellId < 1 || item.cellId > 48) return;

    // cellId 1～48 を行列に変換
    // 1～16 → 行0～15、列0
    // 17～32 → 行0～15、列1
    // 33～48 → 行0～15、列2
    const cellIdx = item.cellId - 1;
    const colIdx = Math.floor(cellIdx / 16);
    const rowIdx = cellIdx % 16;

    if (rowIdx < 0 || rowIdx >= 16 || colIdx < 0 || colIdx >= 3) return;

    const masterId = item.wordId;
    if (!masterId) return;

    // ========= 単語 =========
    if (masterId < 10000) {
      table[rowIdx][colIdx] = {
        type: 'word',
        english: item.english || '',
        japanese: item.japanese || '',
        pronunciation: item.pronunciation || '',
        audio: item.audio || '',
        masterId
      };
      return;
    }

    // ========= 英文 =========
    if (masterId >= 10000) {
      // 英文の場合は1列目に配置（2列目・3列目はnull）
      table[rowIdx][0] = {
        type: 'sentence',
        text: item.english || '',
        pronunciation: item.pronunciation || '',
        japanese: item.japanese || '',
        masterId
      };
      table[rowIdx][1] = null;
      table[rowIdx][2] = null;
    }
  });

  return table;
}

/**
 * ✅ 新規：convertToTableDataFukisoku()
 * 不規則動詞①②用 - 3列が原形・過去形・過去分詞
 */
function convertToTableDataFukisoku(items) {
  // 16行 × 3列（原形 / 過去形 / 過去分詞）
  const table = Array.from({ length: 16 }, () => [null, null, null]);

  items.forEach(item => {
    if (!item.cellId || item.cellId < 1 || item.cellId > 16) {
      console.log(`⚠️ 不正なcellId: ${item.cellId}`);
      return;
    }

    const rowIdx = item.cellId - 1; // 0～15

    if (rowIdx < 0 || rowIdx >= 16) return;

    const masterId = item.wordId;
    if (!masterId) return;

    // ========= 列0：原形 =========
    table[rowIdx][0] = {
      type: 'word',
      english: item.english || '',
      japanese: item.japanese || '',
      pronunciation: item.pronunciation || '',
      audio: item.audio || '',
      masterId: masterId
    };

    // ========= 列1：過去形 =========
    if (item.pastEnglish || item.pastWordId) {
      table[rowIdx][1] = {
        type: 'word',
        english: item.pastEnglish || '',
        japanese: item.japanese ? `${item.japanese}(過去形)` : '',
        pronunciation: item.pastPronunciation || '',
        audio: item.pastAudio || '',
        masterId: item.pastWordId || null
      };
    }

    // ========= 列2：過去分詞（②のみ） =========
    if (item.pastParticipleEnglish || item.pastPartWordId) {
      table[rowIdx][2] = {
        type: 'word',
        english: item.pastParticipleEnglish || '',
        japanese: item.japanese ? `${item.japanese}(過去分詞)` : '',
        pronunciation: item.pastParticiplePronunciation || '',
        audio: item.pastParticipleAudio || '',
        masterId: item.pastPartWordId || null
      };
    }
  });

  return table;
}

/**
 * ✅ 修正版：convertToTableData()
 * レッスンのタイプに応じて適切な変換関数を呼び出す
 */
function convertToTableData(items, isFukisoku = false) {
  if (isFukisoku) {
    return convertToTableDataFukisoku(items);
  } else {
    return convertToTableDataNormal(items);
  }
}

/**
 * PDF生成・保存
 */
function generateAndSavePdf(
  year,
  textbook,
  grade,
  displayItems,
  lessonsData,
  pdfSuffix,
  isSpecialLayout = false,
  allWords = []
) {
  try {
    Logger.log('① generateAndSavePdf 開始');
    Logger.log(`year=${year}, textbook=${textbook}, grade=${grade}`);

    // =========================
    // HTML生成
    // =========================
    const html = generatePdfLayout(
      year,
      textbook,
      grade,
      displayItems,
      lessonsData,
      isSpecialLayout,
      allWords
    );

    if (!html || typeof html !== 'string') {
      throw new Error('HTML生成結果が不正です');
    }

    Logger.log('② HTML生成完了');
    Logger.log('HTML length: ' + html.length);

    // =========================
    // HTML → PDF Blob変換
    // =========================
    const blob = Utilities
      .newBlob(html, 'text/html')
      .getAs('application/pdf');

    if (!blob) {
      throw new Error('PDF Blobの生成に失敗しました');
    }

    Logger.log('③ PDF Blob生成完了');
    Logger.log('Blob size: ' + blob.getBytes().length);

    // =========================
    // ルートフォルダ取得
    // =========================
    const englishwordsFolderId = getScriptProperty('ENGLISHWORDS_FOLDER_ID');
    Logger.log('④ ENGLISHWORDS_FOLDER_ID: ' + englishwordsFolderId);

    if (!englishwordsFolderId) {
      throw new Error('ENGLISHWORDS_FOLDER_ID が設定されていません');
    }

    const englishwordsFolder = DriveApp.getFolderById(englishwordsFolderId);
    Logger.log('⑤ ルートフォルダ取得成功');

    // =========================
    // 年度フォルダ取得（← 最重要）
    // =========================
    const yearFolders = englishwordsFolder.getFoldersByName(year);
    if (!yearFolders.hasNext()) {
      throw new Error(`年度フォルダが存在しません: ${year}`);
    }

    const yearFolder = yearFolders.next();
    Logger.log('⑥ 年度フォルダ取得成功');

    // =========================
    // ファイル名
    // =========================
    const fileName = `${year}_${textbook}_${grade}_${pdfSuffix}.pdf`;
    Logger.log('⑦ ファイル名: ' + fileName);

    // =========================
    // 既存ファイル削除
    // =========================
    const existingFiles = yearFolder.getFilesByName(fileName);
    let deletedCount = 0;

    while (existingFiles.hasNext()) {
      const existingFile = existingFiles.next();
      existingFile.setTrashed(true);
      deletedCount++;
    }

    Logger.log('⑧ 既存ファイル削除数: ' + deletedCount);

    // =========================
    // 新規PDF作成
    // =========================
    const file = yearFolder.createFile(blob);
    file.setName(fileName);

    Logger.log('⑨ PDF保存完了');
    Logger.log('保存ファイル名: ' + file.getName());

    return {
      success: true,
      fileName: file.getName()
    };

  } catch (e) {
    Logger.log('❌ Error generateAndSavePdf');
    Logger.log(e.toString());
    Logger.log(e.stack || 'no stack');

    return {
      success: false,
      error: e.toString()
    };
  }
}

/**
 * ============================================================
 * PDF HTML（Tkinter Canvas 再現）
 * ============================================================
 */
/**
 * ✅ 新規関数：レッスン名から入試対策編かどうかを判定
 * @param {string} lessonName - レッスン名
 * @returns {boolean} 入試対策編のレッスンならtrue
 */
function isExamPrepLessonName(lessonName) {
  if (!lessonName) return false;

  // 入試対策編特有のレッスン名リスト
  // 以下の条件に当てはまれば入試対策編と判定
  if (lessonName.startsWith('不規則動詞①') || 
      lessonName.startsWith('不規則動詞②') ||
      lessonName === '曜日・月・季節・代名詞') {
    return true;
  }

  return false;
}

/**
 * ✅ 学年表示を短縮形に変換
 * 「中学1年」→ 「中1」
 * など
 */
function formatGrade(grade) {
  if (!grade) return '';
  
  const gradeMap = {
    '中学1年': '中1',
    '中学2年': '中2',
    '中学3年': '中3',
  };
  
  return gradeMap[grade] || grade;
}

/**
 * ✅ 改修版：CSS変数で統一
 * 各レッスンごとに特殊レイアウト判定
 */
function generatePdfLayout(year, textbook, grade, displayItems, lessonsData, isSpecialLayout = false, allWords = []) {
  // ✅ デバッグログを追加
  Logger.log('=== generatePdfLayout 開始 ===');
  Logger.log('allWords受け取り: ' + (allWords && allWords.length ? allWords.length : 0) + '件');
  
  // allWords の最初の3件をログ出力
  if (allWords && allWords.length > 0) {
    Logger.log('📌 allWords の最初の3件:');
    for (let i = 0; i < Math.min(3, allWords.length); i++) {
      Logger.log(`  allWords[${i}]: english="${allWords[i].english}", pronunciation="${allWords[i].pronunciation}"`);
    }
    
    // 「I」が含まれているか確認
    const iWord = allWords.find(w => w.english === 'I');
    Logger.log('📌 「I」の検索: ' + (iWord ? `発音="${iWord.pronunciation}"` : '見つかりません'));
  } else {
    Logger.log('⚠️ allWords が空または undefined です');
  }
  
const cssStyles = `
<style>
/* ===============================
   紙そのものの余白（最重要）
   =============================== */
@page {
  size: A4;
  margin-top: 10mm;
  margin-bottom: 10mm;
  margin-left: 0;
  margin-right: 0;
}

/* ===============================
   変数
   =============================== */
:root {
  --cell-japanese-font-size: 6pt;
  --cell-english-font-size: 13pt;
  --cell-english-font-weight: bold;
  --cell-pronunciation-font-size: 6pt;
  --fukisoku-japanese-font-size: 10pt;
}

/* ===============================
   初期化
   =============================== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Meiryo','Yu Gothic','Segoe UI',sans-serif;
  color: #000;
  margin: 0;
  padding: 0;
}

/* ===============================
   ページ（A4サイズ：297mm - margin-top 10mm - margin-bottom 10mm）
   =============================== */
.page {
  width: 210mm;
  height: calc(297mm - 10mm - 10mm);
  position: relative;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;
}

/* ===============================
   ページ内容を上から配置
   =============================== */
.page-header {
  height: 12mm;
  display: flex;
  align-items: center;
  padding: 0 15mm;
  font-size: 13pt;
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ===============================
   ヘッダー内部レイアウト用
   =============================== */
.header-left,
.header-score {
  flex: 1;
}

.header-title {
  flex: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-score {
  text-align: right;
  font-size: 13pt;
  font-weight: bold;
}

/* ===============================
   表エリア（可変高さ）
   =============================== */
.table-area {
  padding: 0 10mm;
  margin: 0;
  margin-top: 5mm;
  margin-bottom: 5mm;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ===============================
   表
   =============================== */
.word-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin: 0;
  padding: 0;
}

/* 通常テーブル用：高さ指定 */
.normal-word-table {
  height: 240mm;
}

/* 不規則動詞テーブル用：高さ指定なし */
.fukisoku-word-table {
  /* 高さ指定なし */
}

/* テーブル行の余白をリセット */
.word-table tr {
  margin: 0;
  padding: 0;
}

/* テーブルセルの余白をリセット */
.word-table td {
  border: 1pt solid #000;
  height: 15mm;
  vertical-align: top;
  padding: 0;
  margin: 0;
}

/* ===============================
   セル内部
   =============================== */
.cell-inner {
  display: flex;
  height: 100%;
}

.cell-no {
  width: 8mm;
  border-right: 1pt solid #000;
  text-align: center;
  font-size: 8pt;
  line-height: 14mm;
}

.cell-body {
  flex: 1;
  padding: 1.5mm;
}

.cell-japanese {
  font-size: var(--cell-japanese-font-size);
}

.cell-english {
  font-family: 'Century','Times New Roman',serif;
  font-size: var(--cell-english-font-size);
  font-weight: var(--cell-english-font-weight);
}

.cell-pronunciation {
  font-size: var(--cell-pronunciation-font-size);
}

.cell-japanese-fukisoku {
  font-size: var(--fukisoku-japanese-font-size);
}

/* ===============================
   ページ番号（flexで配置）
   =============================== */
.page-number {
  height: 5mm;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8pt;
  flex-shrink: 0;
  width: 100%;
  padding: 0;
  margin: 0;
}
</style>
`;

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${cssStyles}
</head>
<body>
`;

  let pageNum = 1;
  
  lessonsData.forEach(ld => {
    const lessonName = ld.lesson;
    const source = ld.source;
    
    let displayHeader = '';
    if (source === 'examPrep') {
      displayHeader = escapeHtml(lessonName);
    } else {
      displayHeader = `${escapeHtml(formatGrade(grade))}　　　${escapeHtml(lessonName)}`;
    }
    
    const isSpecialLayoutForThisLesson = isSpecialLayoutLessonGAS(lessonName);
    
    if (isSpecialLayoutForThisLesson) {
      if (lessonName.startsWith('不規則動詞①') || lessonName.startsWith('不規則動詞②')) {
        html += generatePdfPageFukisoku(
          displayHeader, 
          ld.tableData, 
          displayItems, 
          lessonName.startsWith('不規則動詞②'),
          pageNum
        );
      } else if (lessonName === '曜日・月・季節・代名詞') {
        // ✅ ここにもデバッグログを追加
        Logger.log('📌 代名詞テーブル生成中: allWords=' + (allWords ? allWords.length : 0) + '件');
        
        html += generatePdfPageSpecialLayout(
          displayHeader, 
          ld.tableData, 
          displayItems, 
          pageNum,
          allWords  // ✅ allWords を渡す
        );
      }
    } else {
      html += generatePdfPage(
        displayHeader,
        ld.tableData,
        displayItems,
        pageNum
      );
    }
    
    pageNum++;
  });

  html += '</body></html>';
  return html;
}

function isSpecialLayoutLessonGAS(lessonName) {
  if (!lessonName) return false;
  if (lessonName.startsWith('不規則動詞①') || lessonName.startsWith('不規則動詞②')) {
    return true;
  }
  if (lessonName === '曜日・月・季節・代名詞') {
    return true;
  }
  return false;
}

/**
 * ✅ 改修版：不規則動詞用 PDF ページ生成
 * セル内スタイルをクラスベースに統一
 */
function generatePdfPageFukisoku(displayHeader, tableData, displayItems, isFukisoku2 = false, pageNum = 1) {
  const collectedWords = [];

  for (let rowIdx = 0; rowIdx < 16; rowIdx++) {
    const presentCell = tableData[rowIdx][0];
    const pastCell = tableData[rowIdx][1];
    const pastPartCell = isFukisoku2 ? tableData[rowIdx][2] : null;

    if (presentCell && presentCell.type === 'word') {
      collectedWords.push({
        rowIdx: rowIdx,
        present: presentCell,
        past: pastCell,
        pastPart: pastPartCell
      });
    }
  }

  const circleCount = collectedWords.length;
  const triangleCount = Math.round(circleCount * 0.9);

  const scoreDisplay = displayItems.includes('score') 
    ? `<div style="flex: 1; text-align: right; font-size: 13pt; font-weight: bold; color: #000;">${triangleCount}/${circleCount}</div>`
    : `<div style="flex: 1; text-align: right;"></div>`;

  const headers = isFukisoku2 
    ? ['意味', '現在形', '過去形', '過去分詞']
    : ['意味', '現在形', '過去形'];

  const numberColWidth = '8mm';
  let restColWidths;
  if (isFukisoku2) {
    restColWidths = { meaning: '43mm', present: '43mm', past: '43mm', pastPart: '43mm' };
  } else {
    restColWidths = { meaning: '57.33mm', present: '57.33mm', past: '57.34mm' };
  }

  let html = `
<div class="page">
  <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; white-space: nowrap;">
    <div style="flex: 1; text-align: left;"></div>
    <div style="flex: 1; text-align: center; font-size: 13pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      ${displayHeader}
    </div>
    ${scoreDisplay}
  </div>
  <div class="table-area">
    <table class="word-table" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
      <colgroup>
        <col style="width: ${numberColWidth};">
        <col style="width: ${restColWidths.meaning};">
        <col style="width: ${restColWidths.present};">
        <col style="width: ${restColWidths.past};">
        ${isFukisoku2 ? `<col style="width: ${restColWidths.pastPart};">` : ''}
      </colgroup>
      <thead>
        <tr style="height: 30px;">
          <th style="border: 1pt solid #000; padding: 6px; text-align: center; font-weight: bold; background-color: #f0f0f0; font-size: 10pt;"></th>
`;

  headers.forEach((header) => {
    html += `
          <th style="border: 1pt solid #000; padding: 6px; text-align: center; font-weight: bold; background-color: #f0f0f0; font-size: 10pt;">
            ${header}
          </th>
`;
  });

  html += `
        </tr>
      </thead>
      <tbody>
`;

  collectedWords.forEach((wordGroup, idx) => {
    const presentCell = wordGroup.present;
    const pastCell = wordGroup.past;
    const pastPartCell = wordGroup.pastPart;

    html += `
        <tr style="height: 50px;">
          <td style="border: 1pt solid #000; padding: 6px; text-align: center; font-size: 11pt; background-color: #f9f9f9;">
            ${idx + 1}
          </td>
          <td style="border: 1pt solid #000; padding: 6px; background-color: #fffacd;">
            ${displayItems.includes('japanese') ? `<div class="cell-japanese-fukisoku">${escapeHtml(presentCell.japanese || '')}</div>` : ''}
          </td>
          <td style="border: 1pt solid #000; padding: 6px;">
            ${displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(presentCell.english || '')}</div>` : ''}
            ${displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(presentCell.pronunciation || '')}</div>` : ''}
          </td>
          <td style="border: 1pt solid #000; padding: 6px;">
            ${pastCell ? (displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(pastCell.english || '')}</div>` : '') : ''}
            ${pastCell ? (displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(pastCell.pronunciation || '')}</div>` : '') : ''}
          </td>
`;

    if (isFukisoku2) {
      html += `
          <td style="border: 1pt solid #000; padding: 6px;">
            ${pastPartCell ? (displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(pastPartCell.english || '')}</div>` : '') : ''}
            ${pastPartCell ? (displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(pastPartCell.pronunciation || '')}</div>` : '') : ''}
          </td>
`;
    }

    html += `
        </tr>
`;
  });

  html += `
      </tbody>
    </table>
  </div>
  <div class="page-number">− ${pageNum} −</div>
</div>
`;

  return html;
}

/**
 * ✅ 新規関数：マスターデータから代名詞の発音を検索
 * 代名詞テーブル用に英単語から発音を取得
 * 
 * @param {string} englishWord - 代名詞の英単語（例：「I」「my」「me」）
 * @param {Array} allWords - マスター単語配列
 * @returns {Object} { english, pronunciation } または { english, pronunciation: '' }
 */
function findPronounData(englishWord, allWords) {
  if (!englishWord || !allWords || allWords.length === 0) {
    return { english: englishWord, pronunciation: '' };
  }

  // 完全一致で検索
  const found = allWords.find(word => 
    word.english && word.english.toLowerCase() === englishWord.toLowerCase()
  );

  if (found) {
    return {
      english: found.english,
      pronunciation: found.pronunciation || ''
    };
  }

  // マスターデータになければ空の発音を返す
  return {
    english: englishWord,
    pronunciation: ''
  };
}

/**
 * ✅ 改修版：generatePronounTableHtml()
 * displayItems パラメータを受け取り、英語と発音の表示を制御
 * 
 * @param {Array} allWords - マスター単語配列
 * @param {Array} displayItems - 表示項目（'english', 'pronunciation' など）
 * @returns {string} 代名詞テーブルのHTML
 */
function generatePronounTableHtml(allWords, displayItems = ['english', 'pronunciation']) {
  const pronounData = [
    { 
      japanese: '私', 
      nominative: 'I', genitive: 'my', objective: 'me', possessive: 'mine' 
    },
    { 
      japanese: 'あなた・あなたたち', 
      nominative: 'you', genitive: 'your', objective: 'you', possessive: 'yours' 
    },
    { 
      japanese: '私たち', 
      nominative: 'we', genitive: 'our', objective: 'us', possessive: 'ours' 
    },
    { 
      japanese: '彼', 
      nominative: 'he', genitive: 'his', objective: 'him', possessive: 'his' 
    },
    { 
      japanese: '彼女', 
      nominative: 'she', genitive: 'her', objective: 'her', possessive: 'hers' 
    },
    { 
      japanese: 'それ', 
      nominative: 'it', genitive: 'its', objective: 'it', possessive: '×' 
    },
    { 
      japanese: '彼ら・彼女ら・それら', 
      nominative: 'they', genitive: 'their', objective: 'them', possessive: 'theirs' 
    },
    { 
      japanese: 'トム', 
      nominative: 'Tom', genitive: 'Tom\'s', objective: 'Tom', possessive: 'Tom\'s',
      isHardcoded: true
    },
    { 
      japanese: '私の兄', 
      nominative: 'my brother', genitive: 'my brother\'s', objective: 'my brother', possessive: 'my brother\'s',
      isHardcoded: true
    }
  ];

  const pronounWords = [
    'I', 'my', 'me', 'mine',
    'you', 'your', 'yours',
    'we', 'our', 'us', 'ours',
    'he', 'his', 'him',
    'she', 'her', 'hers',
    'it', 'its',
    'they', 'their', 'them', 'theirs'
  ];

  const pronounMap = {};
  pronounWords.forEach(word => {
    const data = findPronounData(word, allWords);
    pronounMap[word] = data.pronunciation;
  });

  // ✅ 英語と発音の表示判定
  const showEnglish = displayItems.includes('english');
  const showPronunciation = displayItems.includes('pronunciation');

  let html = `
    <table class="pronoun-table" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
      <colgroup>
        <col style="width: 20%;">
        <col style="width: 20%;">
        <col style="width: 20%;">
        <col style="width: 20%;">
        <col style="width: 20%;">
      </colgroup>
      <tr style="height: 6mm;">
        <td style="border: 1pt solid #000; padding: 2px; text-align: center; background-color: #f0f0f0;"></td>
        <th style="border: 1pt solid #000; padding: 2px; background-color: #f0f0f0; font-weight: bold; text-align: center; font-size: 9pt;">～は・が</th>
        <th style="border: 1pt solid #000; padding: 2px; background-color: #f0f0f0; font-weight: bold; text-align: center; font-size: 9pt;">～の</th>
        <th style="border: 1pt solid #000; padding: 2px; background-color: #f0f0f0; font-weight: bold; text-align: center; font-size: 9pt;">～を・に</th>
        <th style="border: 1pt solid #000; padding: 2px; background-color: #f0f0f0; font-weight: bold; text-align: center; font-size: 9pt;">～のもの</th>
      </tr>
`;

  pronounData.forEach(row => {
    html += `
      <tr style="height: 9mm; vertical-align: middle;">
        <td style="border: 1pt solid #000; padding: 2px; text-align: center; font-size: 9pt;">
          ${escapeHtml(row.japanese)}
        </td>
`;

    // 各列（nominative, genitive, objective, possessive）を処理
    const columns = ['nominative', 'genitive', 'objective', 'possessive'];
    
    columns.forEach(col => {
      const word = row[col];
      const isHardcoded = row.isHardcoded;
      
      html += `
        <td style="border: 1pt solid #000; padding: 2px; text-align: center; vertical-align: middle;">
`;

      // ✅ 英語を表示
      if (showEnglish) {
        html += `          <div style="font-size: 10pt;">${escapeHtml(word)}</div>`;
      }

      // ✅ 発音を表示
      if (showPronunciation) {
        let pronunciationText = '';
        
        if (isHardcoded) {
          const pronunciationMap = {
            'Tom': 'トム',
            'Tom\'s': 'トムズ',
            'my brother': 'マイ ブラザー',
            'my brother\'s': 'マイ ブラザーズ'
          };
          pronunciationText = pronunciationMap[word] || '';
        } else {
          pronunciationText = pronounMap[word] || '';
        }

        if (pronunciationText && word !== '×') {
          html += `          <div style="font-size: 7pt;">${escapeHtml(pronunciationText)}</div>`;
        }
      }

      html += `
        </td>
`;
    });

    html += `
      </tr>
`;
  });

  html += `
    </table>
`;

  return html;
}

/**
 * ✅ generatePdfPageSpecialLayout() の修正版
 * displayItems を generatePronounTableHtml() に渡す
 */
function generatePdfPageSpecialLayout(displayHeader, tableData, displayItems, pageNum = 1, allWords = []) {
  let wordCount = 0;
  let sentenceCount = 0;

  tableData.forEach((row) => {
    row.forEach((cell) => {
      if (!cell) return;
      if (cell.type === 'word') {
        wordCount++;
      } else if (cell.type === 'sentence') {
        sentenceCount++;
      }
    });
  });

  const circleCount = wordCount + sentenceCount * 2 + 9;
  const triangleCount = Math.round(circleCount * 0.9);

  const scoreDisplay = displayItems.includes('score') 
    ? `<div style="flex: 1; text-align: right; font-size: 13pt; font-weight: bold; color: #000;">${triangleCount}/${circleCount}</div>`
    : `<div style="flex: 1; text-align: right;"></div>`;

  const cellNumberMap = {};
  let cellNumber = 1;

  for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
    const cell = tableData[rowIdx][0];
    if (cell && cell.type === 'word') {
      cellNumberMap[`${rowIdx}-0`] = cellNumber;
      cellNumber++;
    }
  }

  for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
    const cell = tableData[rowIdx][1];
    if (cell && cell.type === 'word') {
      cellNumberMap[`${rowIdx}-1`] = cellNumber;
      cellNumber++;
    }
  }

  for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
    const cell = tableData[rowIdx][2];
    if (cell && cell.type === 'word') {
      cellNumberMap[`${rowIdx}-2`] = cellNumber;
      cellNumber++;
    }
  }

  // ✅ displayItems を渡す
  const pronounTableHtml = generatePronounTableHtml(allWords, displayItems);

  let html = `
<div class="page">
  <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; white-space: nowrap; flex-wrap: wrap; margin-bottom: 0; height: 17mm;">
    <div style="flex: 1; text-align: left; width: 100%;"></div>
    <div style="flex: 1; text-align: center; font-size: 13pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
      ${displayHeader}
    </div>
    ${scoreDisplay}
    <div style="width: 100%; text-align: center; font-weight: bold; font-size: 11pt; margin-top: 5mm; margin-bottom: 0;">曜日・月・季節</div>
  </div>
  <div class="table-area" style="margin-top: 0;">
    <table class="word-table special-layout-word-table">
`;

  for (let rowIdx = 0; rowIdx < 10; rowIdx++) {
    const row = tableData[rowIdx];
    if (!row) continue;

    const sentenceCell = tableData[rowIdx][0];
    if (sentenceCell && sentenceCell.type === 'sentence') {
      const num = cellNumber++;
      html += `
<tr>
  <td colspan="3">
    <div class="cell-inner">
      <div class="cell-no">${num}</div>
      <div class="cell-body">
        ${displayItems.includes('japanese') ? `<div class="cell-japanese">${escapeHtml(sentenceCell.japanese || '')}</div>` : ''}
        ${displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(sentenceCell.text || '')}</div>` : ''}
        ${displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(sentenceCell.pronunciation || '')}</div>` : ''}
      </div>
    </div>
  </td>
</tr>`;
    } else {
      html += `<tr>`;
      
      for (let colIdx = 0; colIdx < 3; colIdx++) {
        const cell = row[colIdx];
        const key = `${rowIdx}-${colIdx}`;
        const num = cellNumberMap[key];
        
        if (cell && cell.type === 'word') {
          html += `
  <td>
    <div class="cell-inner">
      <div class="cell-no">${num}</div>
      <div class="cell-body">
        ${displayItems.includes('japanese') ? `<div class="cell-japanese">${escapeHtml(cell.japanese || '')}</div>` : ''}
        ${displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(cell.english || '')}</div>` : ''}
        ${displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(cell.pronunciation || '')}</div>` : ''}
      </div>
    </div>
  </td>
`;
        } else {
          html += `  <td style="border: none;"></td>`;
        }
      }
      
      html += `</tr>`;
    }
  }

  html += `
    </table>

    <div style="text-align: center; font-weight: bold; margin: 7mm 0 0.5mm 0; font-size: 11pt;">代名詞</div>
    ${pronounTableHtml}
  </div>
  <div class="page-number">− ${pageNum} −</div>
</div>
`;

  return html;
}

/**
 * ✅ 改修版：通常テーブル用 PDF ページ生成
 * displayHeader パラメータで既に学年情報が含まれている
 */
function generatePdfPage(displayHeader, tableData, displayItems, pageNum = 1) {
  let wordCount = 0;
  let sentenceCount = 0;

  tableData.forEach(row => {
    row.forEach(cell => {
      if (!cell) return;
      if (cell.type === 'word') wordCount++;
      else if (cell.type === 'sentence') sentenceCount++;
    });
  });

  const circleCount = wordCount + sentenceCount * 2;
  const triangleCount = Math.round(circleCount * 0.9);

  const scoreDisplay = displayItems.includes('score')
    ? `<div class="header-score">${triangleCount}/${circleCount}</div>`
    : `<div class="header-score"></div>`;

  let html = `
<div class="page">
  <div class="page-header">
    <div class="header-left"></div>
    <div class="header-title">${displayHeader}</div>
    ${scoreDisplay}
  </div>

  <div class="table-area">
    <table class="word-table" style="height: 15mm;">
`;

  let cellNumber = 1;
  const cellNumberMap = {};

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = tableData[r][c];
      if (cell && cell.type === 'word') {
        cellNumberMap[`${r}-${c}`] = cellNumber++;
      }
    }
  }

  for (let r = 0; r < 16; r++) {
    const sentenceCell = tableData[r][0];
    if (sentenceCell && sentenceCell.type === 'sentence') {
      const num = cellNumberMap[`${r}-s`] = cellNumber++;
      html += `
<tr style="height: 15mm;">
  <td colspan="3">
    <div class="cell-inner">
      <div class="cell-no">${num}</div>
      <div class="cell-body">
        ${displayItems.includes('japanese') ? `<div class="cell-japanese">${escapeHtml(sentenceCell.japanese || '')}</div>` : ''}
        ${displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(sentenceCell.text || '')}</div>` : ''}
        ${displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(sentenceCell.pronunciation || '')}</div>` : ''}
      </div>
    </div>
  </td>
</tr>`;
    } else {
      html += `<tr style="height: 15mm;">`;
      for (let c = 0; c < 3; c++) {
        const cell = tableData[r][c];
        const num = cellNumberMap[`${r}-${c}`];
        html += cell && cell.type === 'word'
          ? `
<td>
  <div class="cell-inner">
    <div class="cell-no">${num}</div>
    <div class="cell-body">
      ${displayItems.includes('japanese') ? `<div class="cell-japanese">${escapeHtml(cell.japanese || '')}</div>` : ''}
      ${displayItems.includes('english') ? `<div class="cell-english">${escapeHtml(cell.english || '')}</div>` : ''}
      ${displayItems.includes('pronunciation') ? `<div class="cell-pronunciation">${escapeHtml(cell.pronunciation || '')}</div>` : ''}
    </div>
  </div>
</td>`
          : `<td style="border: none;"></td>`;
      }
      html += `</tr>`;
    }
  }

  html += `
    </table>
  </div>

  <div class="page-number">− ${pageNum} −</div>
</div>
`;

  return html;
}

/**
 * HTMLエスケープ関数
 */
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

// ════════════════════════════════════════════════════════
// 生徒向けアプリ（index.html）用関数
// ════════════════════════════════════════════════════════

/**
 * 生徒アプリで使用する設定値を返す
 * @returns {Object} { VOCABULARY_FOLDER_ID, GITHUB_BASE_URL, HOMEPAGE_URL }
 */
function getAppConfig() {
  const config = {
    VOCABULARY_FOLDER_ID: getScriptProperty('ENGLISHWORDS_FOLDER_ID'),
    GITHUB_BASE_URL: getScriptProperty('GITHUB_BASE_URL'),
    HOMEPAGE_URL: getScriptProperty('HOMEPAGE_URL')
  };
  if (!config.VOCABULARY_FOLDER_ID || !config.GITHUB_BASE_URL) {
    throw new Error('必要なスクリプトプロパティが設定されていません。');
  }
  return config;
}

/**
 * キャッシュを手動リセットする
 */
function clearCache() {
  CacheService.getScriptCache().removeAll(['years', 'textbooks', 'grades']);
  Logger.log('キャッシュをリセットしました。');
}

/**
 * 生徒アプリ用ロゴURLを取得する
 * @returns {Object} { appLogoUrl, logoUrl, homepageUrl }
 */
function getStudentLogoUrls() {
  try {
    const config = getAppConfig();
    const githubBase = config.GITHUB_BASE_URL;
    if (!githubBase) {
      return { appLogoUrl: null, logoUrl: null, homepageUrl: '' };
    }
    return {
      appLogoUrl: githubBase + '/images/applogo.png',
      logoUrl: githubBase + '/images/logo.png',
      homepageUrl: config.HOMEPAGE_URL || ''
    };
  } catch (e) {
    Logger.log('getStudentLogoUrls エラー: ' + e);
    return { appLogoUrl: null, logoUrl: null, homepageUrl: '' };
  }
}

/**
 * 生徒アプリ用年度一覧を取得（表示名付き、キャッシュあり）
 * @returns {Object} { years: [{originalName, displayName}] }
 */
function getStudentYears() {
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'student_years';
    const cached = cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const config = getAppConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID);
    const folders = folder.getFolders();
    const years = [];

    while (folders.hasNext()) {
      const f = folders.next();
      const name = f.getName();
      if (name.match(/\d{4}年度版/)) years.push(name);
    }

    const sortedYears = years.sort().reverse().slice(0, 2);
    const result = sortedYears.map((originalName, index) => {
      let displayName = originalName;
      if (index === 0) displayName = '新教科書版';
      else if (sortedYears.length >= 2 && index === 1) displayName = '旧教科書版';
      return { originalName, displayName };
    });

    const resultData = { years: result };
    cache.put(cacheKey, JSON.stringify(resultData), 3600);
    return resultData;
  } catch (e) {
    Logger.log('getStudentYears エラー: ' + e);
    return { years: [] };
  }
}

/**
 * 生徒アプリ用教科書一覧を取得
 * @param {string} year - 年度
 * @returns {Object} { textbooks: [教科書名の配列] }
 */
function getStudentTextbooks(year) {
  try {
    const config = getAppConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID).getFoldersByName(year).next();
    const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const textbooks = [];
    while (files.hasNext()) {
      textbooks.push(files.next().getName());
    }
    return { textbooks: textbooks.sort() };
  } catch (e) {
    Logger.log('getStudentTextbooks エラー: ' + e);
    return { textbooks: [] };
  }
}

/**
 * 生徒アプリ用学年一覧を取得
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @returns {Object} { grades: [学年の配列] }
 */
function getStudentGrades(year, textbook) {
  try {
    const config = getAppConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID).getFoldersByName(year).next();
    const file = folder.getFilesByName(textbook).next();
    const ss = SpreadsheetApp.open(file);
    const grades = ss.getSheets()
      .filter(s => s.getName() !== 'レッスン順序')
      .map(s => s.getName());
    return { grades: grades };
  } catch (e) {
    Logger.log('getStudentGrades エラー: ' + e);
    return { grades: [] };
  }
}

/**
 * 生徒アプリ用レッスン一覧を取得
 * 入試対策編・レッスン順序シートに対応した複雑版
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年
 * @returns {Object} { lessons: [レッスン名の配列] }
 */
function getStudentLessons(year, textbook, grade) {
  try {
    const config = getAppConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID).getFoldersByName(year).next();
    const file = folder.getFilesByName(textbook).next();
    const ss = SpreadsheetApp.open(file);

    // 入試対策編の場合
    if (textbook === '入試対策編') {
      const allLessons = [];
      const sheetNames = ['不規則動詞①', '不規則動詞②', '通常'];
      sheetNames.forEach(sheetName => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return;
        const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
        data.forEach(r => { if (r[0]) allLessons.push(r[0].toString().trim()); });
      });
      const uniqueLessons = [...new Set(allLessons)];
      const lessonOrder = [
        '基数詞', '序数詞', '曜日・月・季節', '曜日・月・季節・代名詞',
        '名詞➀', '名詞➁', '名詞➂', '名詞➃', '名詞⓹', '名詞⓺', '名詞⓻', '名詞⓼', '名詞⓽', '名詞⓾',
        '動詞➀', '動詞➁', '動詞➂', '動詞➃', '動詞⓹', '動詞⓺', '動詞⓻',
        '形容詞➀', '形容詞➁', '形容詞➂', '形容詞➃', '形容詞⓹',
        '副詞➀', '副詞➁', '副詞➂', '前置詞', '助動詞・接続詞',
        '不規則動詞➀(1)', '不規則動詞➀(2)', '不規則動詞➁(1)', '不規則動詞➁(2)', '不規則動詞➁(3)'
      ];
      const sortedLessons = [
        ...lessonOrder.filter(l => uniqueLessons.includes(l)),
        ...uniqueLessons.filter(l => !lessonOrder.includes(l))
      ];
      return { lessons: sortedLessons };
    }

    // その他の教科書の場合
    const lessonOrderSheet = ss.getSheetByName('レッスン順序');
    if (!lessonOrderSheet) {
      const sheet = ss.getSheetByName(grade);
      if (!sheet) return { lessons: [] };
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return { lessons: [] };
      const data = sheet.getRange(2, 6, lastRow - 1, 1).getValues();
      const uniqueLessons = [...new Set(data.map(r => r[0]).filter(l => l))];
      return { lessons: uniqueLessons };
    }

    let columnIndex = 1;
    if (grade === '中学2年' || grade === '中学2年生') columnIndex = 2;
    if (grade === '中学3年' || grade === '中学3年生') columnIndex = 3;

    const lastRow = lessonOrderSheet.getLastRow();
    if (lastRow < 2) return { lessons: [] };
    const lessonOrderData = lessonOrderSheet.getRange(2, columnIndex, lastRow - 1, 1).getValues();
    const lessonsFromOrder = lessonOrderData
      .map(r => r[0])
      .filter(l => l)
      .map(l => l.toString().trim());

    const examPrepFile = folder.getFilesByName('入試対策編').hasNext()
      ? folder.getFilesByName('入試対策編').next()
      : null;
    let examPrepLessons = [];
    if (examPrepFile) {
      const examPrepSs = SpreadsheetApp.open(examPrepFile);
      ['不規則動詞①', '不規則動詞②', '通常'].forEach(sheetName => {
        const sheet = examPrepSs.getSheetByName(sheetName);
        if (!sheet) return;
        const lr = sheet.getLastRow();
        if (lr < 2) return;
        const data = sheet.getRange(2, 6, lr - 1, 1).getValues();
        data.forEach(r => { if (r[0]) examPrepLessons.push(r[0].toString().trim()); });
      });
      examPrepLessons = [...new Set(examPrepLessons)];
    }

    return { lessons: lessonsFromOrder.filter(l => !examPrepLessons.includes(l)) };
  } catch (e) {
    Logger.log('getStudentLessons エラー: ' + e);
    return { lessons: [] };
  }
}

/**
 * 発音練習ページ用のデータを取得する
 * @param {string} year - 年度
 * @param {string} textbook - 教科書名
 * @param {string} grade - 学年
 * @param {string} lesson - レッスン名
 * @returns {Array} 問題データの配列
 */
function getPracticeQuestions(year, textbook, grade, lesson) {
  try {
    const config = getAppConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID).getFoldersByName(year).next();
    const file = folder.getFilesByName(textbook).next();
    const spreadsheet = SpreadsheetApp.open(file);
    const questions = [];

    if (textbook === '入試対策編') {
      spreadsheet.getSheets().forEach(sheet => {
        if (sheet.getName() === 'レッスン順序') return;
        questions.push(...extractQuestionsFromSheet(sheet, lesson, 6));
      });
    } else {
      const sheet = spreadsheet.getSheetByName(grade);
      if (sheet) questions.push(...extractQuestionsFromSheet(sheet, lesson, 6));
    }

    const githubBase = config.GITHUB_BASE_URL;
    const timestamp = new Date().getTime();
    const resultQuestions = questions.map(q => {
      if (!q.audio || !githubBase) return { ...q, audio: null };
      const fileName = q.audio.trim();
      const firstChar = fileName.charAt(0).toLowerCase();
      const encodedFile = encodeURIComponent(fileName);
      const audioUrl = `${githubBase}/sounds/${firstChar}/${encodedFile}?v=${timestamp}`;
      return { ...q, audio: audioUrl };
    });

    if (lesson === '曜日・月・季節・代名詞') {
      let maxQuestionNumber = 0;
      resultQuestions.forEach(q => {
        if (q.questionNumber > maxQuestionNumber) maxQuestionNumber = q.questionNumber;
      });
      resultQuestions.push(...generatePronounQuestions(githubBase, maxQuestionNumber));
    }

    return resultQuestions;
  } catch (e) {
    Logger.log('getPracticeQuestions エラー: ' + e.toString());
    return [];
  }
}

/**
 * 代名詞の問題データを生成する
 * @param {string} githubBase - GitHubベースURL
 * @param {number} startNumber - 問題番号の開始値
 * @returns {Array} 代名詞問題データの配列
 */
function generatePronounQuestions(githubBase, startNumber) {
  const timestamp = new Date().getTime();
  const pronounData = [
    { japanese: '私', nominative: { english: 'I', audio: 'i.mp3' }, genitive: { english: 'my', audio: 'my.mp3' }, objective: { english: 'me', audio: 'me.mp3' }, possessive: { english: 'mine', audio: 'mine.mp3' } },
    { japanese: 'あなた・あなたたち', nominative: { english: 'you', audio: 'you.mp3' }, genitive: { english: 'your', audio: 'your.mp3' }, objective: { english: 'you', audio: 'you.mp3' }, possessive: { english: 'yours', audio: 'yours.mp3' } },
    { japanese: '私たち', nominative: { english: 'we', audio: 'we.mp3' }, genitive: { english: 'our', audio: 'our.mp3' }, objective: { english: 'us', audio: 'us.mp3' }, possessive: { english: 'ours', audio: 'ours.mp3' } },
    { japanese: '彼', nominative: { english: 'he', audio: 'he.mp3' }, genitive: { english: 'his', audio: 'his.mp3' }, objective: { english: 'him', audio: 'him.mp3' }, possessive: { english: 'his', audio: 'his.mp3' } },
    { japanese: '彼女', nominative: { english: 'she', audio: 'she.mp3' }, genitive: { english: 'her', audio: 'her.mp3' }, objective: { english: 'her', audio: 'her.mp3' }, possessive: { english: 'hers', audio: 'hers.mp3' } },
    { japanese: 'それ', nominative: { english: 'it', audio: 'it.mp3' }, genitive: { english: 'its', audio: 'its.mp3' }, objective: { english: 'it', audio: 'it.mp3' }, possessive: { english: '×', audio: null } },
    { japanese: '彼ら・彼女ら・それら', nominative: { english: 'they', audio: 'they.mp3' }, genitive: { english: 'their', audio: 'their.mp3' }, objective: { english: 'them', audio: 'them.mp3' }, possessive: { english: 'theirs', audio: 'theirs.mp3' } },
    { japanese: 'トム', nominative: { english: 'Tom', audio: 'tom.mp3' }, genitive: { english: "Tom's", audio: 'toms.mp3' }, objective: { english: 'Tom', audio: 'tom.mp3' }, possessive: { english: "Tom's", audio: 'toms.mp3' } },
    { japanese: '私の兄', nominative: { english: 'my brother', audio: 'mybrother.mp3' }, genitive: { english: "my brother's", audio: 'mybrotherz.mp3' }, objective: { english: 'my brother', audio: 'mybrother.mp3' }, possessive: { english: "my brother's", audio: 'mybrotherz.mp3' } }
  ];

  const questions = [];
  let pronounNumber = startNumber + 1;
  pronounData.forEach(row => {
    ['nominative', 'genitive', 'objective', 'possessive'].forEach(col => {
      const wordData = row[col];
      const audioUrl = wordData.audio
        ? `${githubBase}/sounds/${wordData.audio.charAt(0).toLowerCase()}/${wordData.audio}?v=${timestamp}`
        : null;
      questions.push({
        wordId: '', english: wordData.english, pronunciation: '', japanese: row.japanese,
        audio: audioUrl, lesson: '曜日・月・季節・代名詞', cellId: '', formType: 'present',
        questionNumber: pronounNumber, isPronoun: true, pronounColumn: col
      });
    });
    pronounNumber++;
  });
  return questions;
}

/**
 * シートから指定レッスンの問題データを列指定で抽出する
 * @param {Sheet} sheet - 対象シート
 * @param {string} targetLesson - レッスン名
 * @param {number} lessonCol - レッスン列番号
 * @returns {Array} 問題データの配列
 */
function extractQuestionsFromSheet(sheet, targetLesson, lessonCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const sheetName = sheet.getName();
  let maxCol = 7;
  if (sheetName === '不規則動詞①') maxCol = 11;
  else if (sheetName === '不規則動詞②') maxCol = 18;

  const allData = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  const questions = [];
  let questionNumber = 0;

  allData
    .filter(row => row[lessonCol - 1] && row[lessonCol - 1].toString().trim() === targetLesson)
    .forEach(row => {
      questionNumber++;
      questions.push({
        wordId: row[0] || '', english: row[1] || '', pronunciation: row[2] || '',
        japanese: row[3] || '', audio: row[4] || '', lesson: row[5] || '',
        cellId: row[6] || '', formType: 'present', questionNumber: questionNumber
      });

      if (sheetName === '不規則動詞①' || sheetName === '不規則動詞②') {
        const pastEnglish = row[8], pastPronunciation = row[9], pastAudio = row[10];
        if (pastEnglish || pastPronunciation || pastAudio) {
          questions.push({
            wordId: row[7] || '', english: pastEnglish || '', pronunciation: pastPronunciation || '',
            japanese: row[3] || '', audio: pastAudio || '', lesson: row[5] || '',
            cellId: row[6] || '', formType: 'past', questionNumber: questionNumber
          });
        }
      }

      if (sheetName === '不規則動詞②') {
        if (row[12] || row[13] || row[14]) {
          questions.push({
            wordId: row[11] || '', english: row[12] || '', pronunciation: '',
            japanese: row[3] || '', audio: row[14] || '', lesson: row[5] || '',
            cellId: row[6] || '', formType: 'past_participle', questionNumber: questionNumber
          });
        }
      }
    });

  return questions;
}