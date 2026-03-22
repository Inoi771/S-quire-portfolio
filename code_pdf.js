/**
 * code_pdf.js — PDF語彙リスト生成
 * 役割: 通常・不規則動詞・特殊レイアウトの3種PDF生成 / Google Drive への保存
 * 主要関数: generateAndSavePdf, generatePdfLayout, generatePdfPage, generatePdfPageFukisoku, generatePdfPageSpecialLayout
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
 * 【...】タグ（【動】等）を除去するヘルパー（① U+2460 と ➀ U+2780 両対応）
 */
function stripBracketsPdf(text) {
  return (text || '').replace(/【[^】]*】\s*/g, '').trim();
}

/**
 * 不規則動詞①②レッスン判定（① U+2460 と ➀ U+2780 両対応）
 */
function isFukisoku1LessonPdf(lessonName) {
  return !!(lessonName && (lessonName.startsWith('不規則動詞①') || lessonName.startsWith('不規則動詞➀')));
}
function isFukisoku2LessonPdf(lessonName) {
  return !!(lessonName && (lessonName.startsWith('不規則動詞②') || lessonName.startsWith('不規則動詞➁')));
}

/**
 * ✅ 新規関数：レッスン名から入試対策編かどうかを判定
 * @param {string} lessonName - レッスン名
 * @returns {boolean} 入試対策編のレッスンならtrue
 */
function isExamPrepLessonName(lessonName) {
  if (!lessonName) return false;

  // 入試対策編特有のレッスン名リスト
  // 以下の条件に当てはまれば入試対策編と判定
  if (isFukisoku1LessonPdf(lessonName) ||
      isFukisoku2LessonPdf(lessonName) ||
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
    
    // layoutTypeをld.layoutTypeから取得（lesson名ではなくgrade優先で設定済み）
    const layoutType = ld.layoutType || determineLayoutType(lessonName);
    const isSpecialLayoutForThisLesson = (layoutType !== 'normal') || isSpecialLayoutLessonGAS(lessonName);

    if (isSpecialLayoutForThisLesson) {
      if (layoutType === 'fukisoku1' || layoutType === 'fukisoku2') {
        html += generatePdfPageFukisoku(
          displayHeader,
          ld.tableData,
          displayItems,
          layoutType === 'fukisoku2',
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
  if (isFukisoku1LessonPdf(lessonName) || isFukisoku2LessonPdf(lessonName)) {
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
            ${displayItems.includes('japanese') ? `<div class="cell-japanese-fukisoku">${escapeHtml(stripBracketsPdf(presentCell.japanese) || '')}</div>` : ''}
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
