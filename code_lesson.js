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
