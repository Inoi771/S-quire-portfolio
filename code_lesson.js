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
