
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

    // TTS音声を自動生成（失敗しても登録は成功扱い）
    let audioFilename = '';
    try {
      audioFilename = generateAndUploadAudio(english, newWordId);
      if (audioFilename) {
        wordSheet.getRange(insertRow, 5).setValue(audioFilename);
        Logger.log(`✅ TTS音声生成成功: ${audioFilename}`);
      }
    } catch (ttsError) {
      Logger.log('⚠️ TTS生成失敗（単語登録は成功）: ' + ttsError);
    }

    return { success: true, wordId: newWordId, audio: audioFilename };
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

    // TTS音声を自動生成（失敗しても登録は成功扱い）
    let audioFilename = '';
    try {
      audioFilename = generateAndUploadAudio(text, newSentenceId);
      if (audioFilename) {
        sentenceSheet.getRange(insertRow, 5).setValue(audioFilename);
        Logger.log(`✅ TTS音声生成成功: ${audioFilename}`);
      }
    } catch (ttsError) {
      Logger.log('⚠️ TTS生成失敗（英文登録は成功）: ' + ttsError);
    }

    return { success: true, sentenceId: newSentenceId, audio: audioFilename };
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
