// ============================================================
// 生徒向け API（元 subcode.js）
// ============================================================

const scriptCache = CacheService.getScriptCache();

function getConfig() {
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

function getStudentLogoUrl() {
  try {
    const config = getConfig();
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
    Logger.log('getStudentLogoUrl エラー: ' + e);
    return { appLogoUrl: null, logoUrl: null, homepageUrl: '' };
  }
}

function manualCacheClear() {
  scriptCache.removeAll(['years', 'textbooks', 'grades']);
  Logger.log('キャッシュをリセットしました。');
}

function getStudentYears() {
  try {
    const cacheKey = 'years';
    const cached = scriptCache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const config = getConfig();
    const englishwordsFolder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID);
    const folders = englishwordsFolder.getFolders();
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
      else if (index === 1) displayName = '旧教科書版';
      return { originalName, displayName };
    });
    const resultData = { years: result };
    scriptCache.put(cacheKey, JSON.stringify(resultData), 3600);
    return resultData;
  } catch (e) {
    Logger.log('getStudentYears エラー: ' + e);
    return { years: [] };
  }
}

function getStudentTextbooks(year) {
  try {
    const config = getConfig();
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

function getStudentGrades(year, textbook) {
  try {
    const config = getConfig();
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

function getStudentLessons(year, textbook, grade) {
  try {
    const config = getConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID).getFoldersByName(year).next();
    const file = folder.getFilesByName(textbook).next();
    const ss = SpreadsheetApp.open(file);

    if (textbook === '入試対策編') {
      const allLessons = [];
      ['不規則動詞①', '不規則動詞②', '通常'].forEach(sheetName => {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) return;
        sheet.getRange(2, 6, lastRow - 1, 1).getValues().forEach(r => {
          if (r[0]) allLessons.push(r[0].toString().trim());
        });
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

    const lessonOrderSheet = ss.getSheetByName('レッスン順序');
    if (!lessonOrderSheet) {
      const sheet = ss.getSheetByName(grade);
      if (!sheet) return { lessons: [] };
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return { lessons: [] };
      const uniqueLessons = [...new Set(
        sheet.getRange(2, 6, lastRow - 1, 1).getValues().map(r => r[0]).filter(l => l)
      )];
      return { lessons: uniqueLessons };
    }

    let columnIndex = 1;
    if (grade === '中学2年' || grade === '中学2年生') columnIndex = 2;
    if (grade === '中学3年' || grade === '中学3年生') columnIndex = 3;

    const lastRow = lessonOrderSheet.getLastRow();
    if (lastRow < 2) return { lessons: [] };
    const lessonsFromOrder = lessonOrderSheet
      .getRange(2, columnIndex, lastRow - 1, 1).getValues()
      .map(r => r[0]).filter(l => l).map(l => l.toString().trim());

    const examPrepFile = folder.getFilesByName('入試対策編').hasNext()
      ? folder.getFilesByName('入試対策編').next() : null;
    let examPrepLessons = [];
    if (examPrepFile) {
      const examPrepSs = SpreadsheetApp.open(examPrepFile);
      ['不規則動詞①', '不規則動詞②', '通常'].forEach(sheetName => {
        const sheet = examPrepSs.getSheetByName(sheetName);
        if (!sheet) return;
        const lr = sheet.getLastRow();
        if (lr < 2) return;
        sheet.getRange(2, 6, lr - 1, 1).getValues().forEach(r => {
          if (r[0]) examPrepLessons.push(r[0].toString().trim());
        });
      });
      examPrepLessons = [...new Set(examPrepLessons)];
    }

    return { lessons: lessonsFromOrder.filter(l => !examPrepLessons.includes(l)) };
  } catch (e) {
    Logger.log('getStudentLessons エラー: ' + e);
    return { lessons: [] };
  }
}

function getPracticeQuestions(year, textbook, grade, lesson) {
  try {
    const config = getConfig();
    const folder = DriveApp.getFolderById(config.VOCABULARY_FOLDER_ID).getFoldersByName(year).next();
    const spreadsheet = SpreadsheetApp.open(folder.getFilesByName(textbook).next());
    const questions = [];

    if (textbook === '入試対策編') {
      spreadsheet.getSheets().forEach(sheet => {
        if (sheet.getName() === 'レッスン順序') return;
        questions.push(...extractQuestionsFromSheetByColumn(sheet, lesson, 6));
      });
    } else {
      const sheet = spreadsheet.getSheetByName(grade);
      if (sheet) questions.push(...extractQuestionsFromSheetByColumn(sheet, lesson, 6));
    }

    const githubBase = config.GITHUB_BASE_URL;
    const resultQuestions = questions.map(q => {
      if (!q.audio || !githubBase) return { ...q, audio: null };
      const fileName = q.audio.trim();
      const audioUrl = `${githubBase}/sounds/${fileName.charAt(0).toLowerCase()}/${encodeURIComponent(fileName)}?v=${new Date().getTime()}`;
      return { ...q, audio: audioUrl };
    });

    if (lesson === '曜日・月・季節・代名詞') {
      let maxNum = 0;
      resultQuestions.forEach(q => { if (q.questionNumber > maxNum) maxNum = q.questionNumber; });
      resultQuestions.push(...generatePronounQuestions(githubBase, maxNum));
    }

    return resultQuestions;
  } catch (e) {
    Logger.log('getPracticeQuestions エラー: ' + e.toString());
    return [];
  }
}

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
  let num = startNumber + 1;
  pronounData.forEach(row => {
    ['nominative', 'genitive', 'objective', 'possessive'].forEach(col => {
      const w = row[col];
      questions.push({
        wordId: '', english: w.english, pronunciation: '', japanese: row.japanese,
        audio: w.audio ? `${githubBase}/sounds/${w.audio.charAt(0).toLowerCase()}/${w.audio}?v=${timestamp}` : null,
        lesson: '曜日・月・季節・代名詞', cellId: '', formType: 'present',
        questionNumber: num, isPronoun: true, pronounColumn: col
      });
    });
    num++;
  });
  return questions;
}

function extractQuestionsFromSheetByColumn(sheet, targetLesson, lessonCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const sheetName = sheet.getName();
  const isFukisokuSheet = (sheetName === '不規則動詞①' || sheetName === '不規則動詞②');
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
        cellId: row[6] || '', formType: isFukisokuSheet ? 'present' : null, questionNumber
      });
      if (sheetName === '不規則動詞①' || sheetName === '不規則動詞②') {
        if (row[8] || row[9] || row[10]) {
          questions.push({
            wordId: row[7] || '', english: row[8] || '', pronunciation: row[9] || '',
            japanese: row[3] || '', audio: row[10] || '', lesson: row[5] || '',
            cellId: row[6] || '', formType: 'past', questionNumber
          });
        }
      }
      if (sheetName === '不規則動詞②') {
        if (row[12] || row[13] || row[14]) {
          questions.push({
            wordId: row[11] || '', english: row[12] || '', pronunciation: '',
            japanese: row[3] || '', audio: row[14] || '', lesson: row[5] || '',
            cellId: row[6] || '', formType: 'past_participle', questionNumber
          });
        }
      }
    });
  return questions;
}
