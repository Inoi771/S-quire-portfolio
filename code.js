/**
 * GASアプリケーションのエントリーポイント
 * ?page=student → 生徒向け音声アプリ (index.html)
 * それ以外       → 教師向け編集アプリ (editor.html)
 * Last updated: 2026-03-08
 */
function doGet(e) {
  const page = e && e.parameter && e.parameter.page;
  const key  = e && e.parameter && e.parameter.key;

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

  // 教師用エディター：アクセスキー必須
  if (key !== 'Tz8mX3kR7vQ2nP9w') {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;margin:40px;color:#555;">このページにはアクセスできません。</p>'
    ).setTitle('アクセス拒否');
  }

  return HtmlService
    .createTemplateFromFile('editor')
    .evaluate()
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

        const cellId = cell.cellId || (rowIdx + colIdx * 16 + 1);

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

