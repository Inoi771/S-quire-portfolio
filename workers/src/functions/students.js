// students 関連ハンドラー（GAS students.js の Workers ポート）
import { supabaseSelect, supabaseRpc, supabaseUpdate, supabaseUpsert, supabaseInsert } from '../supabase.js';
import { getCampusConfig_, getTestNamesConfig_, fetchSigmaConfig_, getSchoolConfig_ } from './grades.js';
import { calcDeviationValue_, calcPassProbability_ } from './analysis.js';
import { getCurrentFiscalYear } from '../helpers/datetime-helpers.js';
import { fetchGeminiWithRetry, extractGeminiText, parseGeminiErrorMessage } from '../gemini.js';

// GAS makeSchoolAveDocId_() と同一ロジック
function makeSchoolAveDocId(year, testName) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(year) + '_' + safe;
}

// GAS makeGradeDocId_() と同一ロジック（studentId_safe_year 形式）
// makeStudentAnalysisDocId（analysis.js）とロジックは同一だが、独立した別関数として定義
function makeGradeDocId(studentId, testName, year) {
  const safe = String(testName).replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_');
  return String(studentId) + '_' + safe + '_' + String(year);
}

// GAS toStudentCamel_() と同一マッピング（snake_case → camelCase）
function studentFromSupabase(row) {
  return {
    id:                row.id,
    studentId:         row.student_id || row.id,
    campus:            String(row.campus || '').padStart(2, '0'),
    registrationYear:  row.registration_year,
    registrationGrade: row.registration_grade,
    sei:               row.sei             || '',
    mei:               row.mei             || '',
    seiFurigana:       row.sei_furigana    || '',
    meiFurigana:       row.mei_furigana    || '',
    schoolName:        row.school_name     || '',
    isDeleted:         row.is_deleted,
    createdAt:         row.created_at      || '',
    jukoukou1:         row.jukoukou1          || '',
    jukoukou1_gakka:   row.jukoukou1_gakka    || '',
    jukoukou1_gokaku:  row.jukoukou1_gokaku   || '',
    ikusei:            row.ikusei              || '',
    jukoukou2:         row.jukoukou2          || '',
    jukoukou2_gakka:   row.jukoukou2_gakka    || '',
    jukoukou2_gokaku:  row.jukoukou2_gokaku   || ''
  };
}

/**
 * getMasterData — GAS getMasterData(year) の Workers 版
 * GAS 版との差分:
 *   - プロセス内メモリキャッシュなし（リクエストごとに実行のため不要）
 *   - 戻り値は plain Array（{ success } ラッパーなし — GAS と同一形式）
 *   - 学年フィルター: currentGrade < 7 || > 18 を除外（GAS と同一）
 */
export async function getMasterData(args, env, user) {
  const year = parseInt(args && args[0], 10);
  if (isNaN(year)) return [];

  try {
    const rows = await supabaseSelect(env, 'students', 'is_deleted=eq.false');
    const results = [];

    for (const row of rows) {
      const doc = studentFromSupabase(row);
      const studentId = String(doc.studentId || '').trim();
      if (!studentId || studentId.length < 10) continue;

      const registrationYear  = parseInt(studentId.substring(2, 6), 10);
      const registrationGrade = parseInt(studentId.substring(6, 8), 10);
      if (isNaN(registrationYear) || isNaN(registrationGrade)) continue;

      const currentGrade = registrationGrade + (year - registrationYear);
      if (currentGrade < 7 || currentGrade > 18) continue;

      const sei         = String(doc.sei         || '');
      const mei         = String(doc.mei         || '');
      const seiFurigana = String(doc.seiFurigana || '');
      const meiFurigana = String(doc.meiFurigana || '');
      const campus      = String(doc.campus      || '').padStart(2, '0');

      results.push({
        studentId,
        campus,
        grade:          String(currentGrade).padStart(2, '0'),
        sei,
        mei,
        name:           sei + mei,
        seiFurigana,
        meiFurigana,
        furigana:       seiFurigana + meiFurigana,
        schoolName:     String(doc.schoolName || ''),
        registeredDate: doc.createdAt || new Date().toISOString()
      });
    }

    return results;
  } catch (error) {
    console.error('getMasterData error:', error);
    return [];
  }
}

/**
 * getGradesYearFolders — GAS getGradesYearFolders() の Workers 版
 * GAS 版との差分: getCurrentFiscalYear() を JST 補正版に置き換え
 */
export async function getGradesYearFolders(args, env, user) {
  try {
    const currentFy = getCurrentFiscalYear();
    const dbYears = await supabaseRpc(env, 'get_grades_years');
    const yearSet = {};
    if (Array.isArray(dbYears)) {
      dbYears.forEach(y => { yearSet[String(y)] = true; });
    }
    yearSet[String(currentFy)] = true;
    const years = Object.keys(yearSet)
      .filter(y => /^\d{4}$/.test(y))
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    return { success: true, years };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-14】fetchSchoolAverages_ — 学校別平均のコアロジック（private）
 *
 * getSchoolAverages と getStudentGradeReport の共通処理として切出し。
 * averages 配列のみを返す。success ラッパーは呼出側で付ける。
 * 行なし / averages フィールドなし / JSON パース不要時は空配列を返す。
 *
 * @param {Object} env
 * @param {number} year
 * @param {string} testName
 * @returns {Promise<Array<{schoolName, kokugo, shakai, sugaku, rika, eigo, total}>>}
 * @throws Supabase エラーは上位に伝搬
 */
async function fetchSchoolAverages_(env, year, testName) {
  const docId = makeSchoolAveDocId(year, testName);
  const rows = await supabaseSelect(env, 'school_averages',
    'id=eq.' + encodeURIComponent(docId));
  if (!rows || rows.length === 0 || !rows[0].averages) return [];
  let averages = rows[0].averages;
  if (typeof averages === 'string') averages = JSON.parse(averages);
  return averages;
}

/**
 * getSchoolAverages — GAS getSchoolAverages(year, testName) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック）
 *
 * Phase 6-A-14 リファクタ: コアを fetchSchoolAverages_ に切出し。外部 API 完全互換。
 */
export async function getSchoolAverages(args, env, user) {
  const year     = parseInt(args && args[0], 10);
  const testName = String((args && args[1]) || '').trim();
  try {
    const averages = await fetchSchoolAverages_(env, year, testName);
    return { success: true, averages };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-16】saveSchoolAverages — GAS students.js:1438 の Workers 版
 *
 * 学校別平均点を Supabase `school_averages` に保存する。既存レコードは
 * id=eq.{docId} で事前 SELECT → schoolName をキーに merge → UPSERT（全置換）。
 *
 * 書込方式:
 *   全 5 カラム（id, year, test_name, updated_at, averages）を毎回指定する
 *   ため supabaseUpsert の第4引数 'id' で UPSERT（Phase 5-E-14 で確立した
 *   「事前 SELECT + UPSERT（id 明示）」パターン）。PATCH ではない。
 *
 * skipExisting 分岐（GAS 版 L1469-1493 と 1:1 一致）:
 *   - 既存あり + skipExisting=true  → OCR モード：既存非ゼロ値を保持し空/ゼロのみ補完
 *   - 既存あり + skipExisting=false → 全置換
 *   - 既存なし                      → 新規追加（savedCount++）
 *
 * OCR merge ルール:
 *   各教科 = (existing が非ゼロ) ? existing : (new が null でない ? new : existing)
 *   total  = merge 後の 5 教科合計（5 教科全て数値の時のみ。それ以外 null）
 *
 * 認証: Firebase ID トークン検証のみ（Admin ガードなし）。
 *
 * 呼出経路:
 *   - フロント直接: js-grades-list.html:1701（skipExisting=false）
 *   - GAS 内部経由: parseAndSaveAveragesFromText（GAS 残留・Gemini 依存）は
 *     引き続き GAS 側の saveSchoolAverages を呼ぶ（Workers 移行の影響を受けない）
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, savedCount, updatedCount }
 *   失敗: { success: false, error: <文言> }
 */
export async function saveSchoolAverages(args, env, user) {
  try {
    const [year, testName, dataArray, skipExisting] = args || [];
    const docId = makeSchoolAveDocId(year, testName);
    const now = new Date().toISOString();
    let savedCount = 0;
    let updatedCount = 0;

    // 既存レコードを取得して existingMap を構築
    const existingRows = await supabaseSelect(env, 'school_averages',
      'id=eq.' + encodeURIComponent(docId));
    const existingDoc = existingRows && existingRows.length > 0 ? existingRows[0] : null;
    let rawAvg = existingDoc ? existingDoc.averages : null;
    let existingAverages = [];
    if (rawAvg) {
      existingAverages = (typeof rawAvg === 'string') ? JSON.parse(rawAvg) : rawAvg;
    }
    const existingMap = {};
    existingAverages.forEach((a) => {
      existingMap[String(a.schoolName || '')] = a;
    });

    (dataArray || []).forEach((d) => {
      const schoolName = String(d.schoolName || '').trim();
      if (!schoolName) return;

      const kokugo = (d.kokugo === '' || d.kokugo === null || d.kokugo === undefined) ? null : Number(d.kokugo);
      const shakai = (d.shakai === '' || d.shakai === null || d.shakai === undefined) ? null : Number(d.shakai);
      const sugaku = (d.sugaku === '' || d.sugaku === null || d.sugaku === undefined) ? null : Number(d.sugaku);
      const rika   = (d.rika   === '' || d.rika   === null || d.rika   === undefined) ? null : Number(d.rika);
      const eigo   = (d.eigo   === '' || d.eigo   === null || d.eigo   === undefined) ? null : Number(d.eigo);
      const providedTotal = (d.total === '' || d.total === null || d.total === undefined) ? null : Number(d.total);
      const totalNums = [kokugo, shakai, sugaku, rika, eigo].filter(v => v !== null);
      const calcTotal = totalNums.length === 5 ? totalNums.reduce((a, b) => a + b, 0) : null;
      const total = providedTotal !== null ? providedTotal : calcTotal;

      if (existingMap[schoolName]) {
        if (skipExisting) {
          // OCR モード: 既存の非ゼロ値はスキップして空/ゼロのみ補完
          const existing = existingMap[schoolName];
          const merged = {
            schoolName: schoolName,
            kokugo: (existing.kokugo && existing.kokugo !== 0) ? existing.kokugo : (kokugo !== null ? kokugo : existing.kokugo),
            shakai: (existing.shakai && existing.shakai !== 0) ? existing.shakai : (shakai !== null ? shakai : existing.shakai),
            sugaku: (existing.sugaku && existing.sugaku !== 0) ? existing.sugaku : (sugaku !== null ? sugaku : existing.sugaku),
            rika:   (existing.rika   && existing.rika   !== 0) ? existing.rika   : (rika   !== null ? rika   : existing.rika),
            eigo:   (existing.eigo   && existing.eigo   !== 0) ? existing.eigo   : (eigo   !== null ? eigo   : existing.eigo)
          };
          const mergedNums = [merged.kokugo, merged.shakai, merged.sugaku, merged.rika, merged.eigo]
            .filter(v => v !== null && v !== '');
          merged.total = mergedNums.length === 5
            ? mergedNums.reduce((a, b) => Number(a) + Number(b), 0) : null;
          existingMap[schoolName] = merged;
        } else {
          existingMap[schoolName] = { schoolName, kokugo, shakai, sugaku, rika, eigo, total };
        }
        updatedCount++;
      } else {
        existingMap[schoolName] = { schoolName, kokugo, shakai, sugaku, rika, eigo, total };
        savedCount++;
      }
    });

    const finalAverages = Object.keys(existingMap).map(name => existingMap[name]);
    await supabaseUpsert(env, 'school_averages', {
      id:         docId,
      year:       parseInt(year, 10),
      test_name:  String(testName),
      updated_at: now,
      averages:   finalAverages
    }, 'id');

    return { success: true, savedCount, updatedCount };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * ocrAndExtractAverages — GAS students.js:1686-1743 の Workers 版
 * 学校別平均点の画像（base64）を Gemini OCR で読み取り Supabase に保存する。
 * GAS 版との差分: なし（完全同一ロジック・プロンプト・モデル）
 * - Gemini モデル: gemini-3.1-flash-lite-preview
 * - 内部で saveSchoolAverages を呼出（同モジュール内・既に Workers 化済）
 * - skipExisting=true で既存値を保持して新規行のみ追加
 *
 * args: [base64Image, mimeType, year, testName]
 *
 * 戻り値（GAS 版と完全一致）:
 *   成功: { success: true, savedCount, updatedCount, extracted: [...] }
 *   失敗: { success: false, error: <文言> }
 */
export async function ocrAndExtractAverages(args, env, user) {
  try {
    const [base64Image, mimeType, year, testName] = args || [];

    const prompt = 'この画像は模擬試験・学力テストの学校別平均点一覧です。' +
      '各学校（または「県平均」「全体平均」など）の教科別平均点を読み取り、' +
      '以下のJSON配列形式のみで返してください。教科が読み取れない場合は null にしてください。\n' +
      '「平均点」「全体平均」「合計平均」などの全体平均行は schoolName:"平均" として統一してください。\n' +
      '[{"schoolName":"学校名","kokugo":国語平均点,"shakai":社会平均点,"sugaku":数学平均点,"rika":理科平均点,"eigo":英語平均点},' +
      '{"schoolName":"県平均","kokugo":...}]';

    const payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    let response;
    try {
      response = await fetchGeminiWithRetry(env, 'gemini-3.1-flash-lite-preview', payload);
    } catch (e) {
      // API キー未設定時のみ throw される（GAS 版と同じ文言）
      return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };
    }

    if (!response.ok) {
      const msg = await parseGeminiErrorMessage(response);
      return { success: false, error: msg };
    }

    const json = await response.json();
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    let text = extractGeminiText(json);
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(text);
    } catch (e) {
      return { success: false, error: '平均点データが読み取れませんでした' };
    }

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return { success: false, error: '平均点データが読み取れませんでした' };
    }

    // 内部呼出: saveSchoolAverages（同モジュール内）
    const saveResult = await saveSchoolAverages([year, testName, extracted, true], env, user);
    if (!saveResult.success) return saveResult;

    return {
      success: true,
      savedCount: saveResult.savedCount,
      updatedCount: saveResult.updatedCount,
      extracted: extracted
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * parseAndSaveAveragesFromText — GAS students.js:1522-1574 の Workers 版
 * 学校別平均点のテキスト（ウェブからのコピペ等）を Gemini で解析し Supabase に保存する。
 * GAS 版との差分: なし（完全同一ロジック・プロンプト・モデル）
 * - Gemini モデル: gemini-3.1-flash-lite-preview
 * - 内部で saveSchoolAverages を呼出（同モジュール内・既に Workers 化済）
 * - skipExisting !== false なら既存値を保持（GAS 版と同じデフォルト挙動）
 *
 * args: [text, year, testName, skipExisting]
 *
 * 戻り値（GAS 版と完全一致）:
 *   成功: { success: true, savedCount, updatedCount, extracted: [...] }
 *   失敗: { success: false, error: <文言> }
 */
export async function parseAndSaveAveragesFromText(args, env, user) {
  try {
    const [text, year, testName, skipExisting] = args || [];

    const prompt = '以下のテキストは模擬試験・学力テストの学校別平均点一覧をウェブページからコピーしたものです。\n' +
      '各学校の教科別平均点（国語・社会・数学・理科・英語）を読み取り、以下のJSON配列形式のみで返してください。\n' +
      '「平均点」「全体平均」「合計」などの行は schoolName:"平均" として扱ってください。\n' +
      '値が読み取れない場合は null にしてください。小数点以下1桁の数値もそのまま読み取ってください。\n\n' +
      '[{"schoolName":"学校名","kokugo":国語平均,"shakai":社会平均,"sugaku":数学平均,"rika":理科平均,"eigo":英語平均},...]\n\n' +
      '対象テキスト:\n' + (text || '');

    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    let response;
    try {
      response = await fetchGeminiWithRetry(env, 'gemini-3.1-flash-lite-preview', payload);
    } catch (e) {
      return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };
    }

    if (!response.ok) {
      const msg = await parseGeminiErrorMessage(response);
      return { success: false, error: msg };
    }

    const json = await response.json();
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    let responseText = extractGeminiText(json);
    responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(responseText);
    } catch (e) {
      return { success: false, error: '平均点データが読み取れませんでした' };
    }

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return { success: false, error: '平均点データが読み取れませんでした' };
    }

    // 内部呼出: saveSchoolAverages（同モジュール内）
    const saveResult = await saveSchoolAverages([year, testName, extracted, skipExisting !== false], env, user);
    if (!saveResult.success) return saveResult;

    return {
      success: true,
      savedCount: saveResult.savedCount,
      updatedCount: saveResult.updatedCount,
      extracted: extracted
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * getGradeDataByStudentAndTest — GAS getGradeDataByStudentAndTest(year, studentId, testName) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック）
 * args: [year, studentId, testName]
 *
 * 戻り値（GAS 版とバイト単位で一致）:
 *   存在: { success: true, found: true, data: {...} }
 *   不在: { success: true, found: false }
 *   エラー: { success: false, error: "..." }
 *   ※ B-⑩の getStudentAnalysis は exists だが、本関数は found フィールド名
 */
export async function getGradeDataByStudentAndTest(args, env, user) {
  const year      = parseInt(args && args[0], 10);
  const studentId = args && args[1];
  const testName  = args && args[2];

  // studentId 正規化（先頭ゼロ消失バグ対策: GAS students.js:1080-1081 と完全同一）
  let sid = String(studentId || '').trim();
  if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

  try {
    const docId = makeGradeDocId(sid, testName, year);
    const rows = await supabaseSelect(env, 'grades',
      'id=eq.' + encodeURIComponent(docId));
    const doc = (rows && rows.length > 0) ? rows[0] : null;

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
    return { success: false, error: error.toString() };
  }
}

/**
 * getDeletedStudents — GAS getDeletedStudents(campusCode, gradeCode, selectedYear) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック・順序）
 * args: [campusCode, gradeCode, selectedYear]
 *
 * is_deleted=true の生徒を全件取得し、メモリ側で校舎/年度/学年フィルタを適用。
 * ふりがな順（'ja' ロケール）でソートして返す。
 */
export async function getDeletedStudents(args, env, user) {
  const campusCode   = args && args[0];
  const gradeCode    = args && args[1];
  const selectedYear = args && args[2];

  try {
    const rows = await supabaseSelect(env, 'students', 'is_deleted=eq.true');
    const docs = rows.map(studentFromSupabase);
    const students = [];

    docs.forEach(doc => {
      const studentId = String(doc.studentId || '').trim();
      if (!studentId || studentId.length < 10) return;

      const regYear  = parseInt(studentId.substring(2, 6), 10);
      const regGrade = parseInt(studentId.substring(6, 8), 10);

      // 校舎フィルタ
      const rowCampus = String(doc.campus || '').padStart(2, '0');
      if (campusCode && rowCampus !== String(campusCode).padStart(2, '0')) return;

      // 年度フィルタ
      if (selectedYear && regYear !== parseInt(selectedYear, 10)) return;

      // 学年フィルタ（GAS students.js:591-596 と完全同一）
      if (gradeCode && selectedYear) {
        const calcGrade = regGrade + (parseInt(selectedYear, 10) - regYear);
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

    students.sort((a, b) => (a.furigana || '').localeCompare(b.furigana || '', 'ja'));

    return { success: true, students };
  } catch (error) {
    return { success: false, error: error.toString(), students: [] };
  }
}

/**
 * getStudentsWithGradesByTest — GAS getStudentsWithGradesByTest(year, campusCode, testName) の Workers 版
 * GAS 版との差分: なし（完全同一ロジック・順序）
 * args: [year, campusCode, testName]
 *
 * 内部呼び出し戦略:
 *   - grades 側: supabaseSelect で直接取得（GAS getDataSheetData 相当）
 *   - students 側: 既存 Workers getMasterData() を内部呼び出し（B-⑧で実装済み）
 *
 * 戻り値（GAS 版とバイト単位で一致）:
 *   通常: { success: true, students: [{studentId, name, furigana, schoolName}, ...] }
 *   早期/該当なし: { success: true, students: [] }
 *   エラー: { success: false, error: "...", students: [] }
 */
export async function getStudentsWithGradesByTest(args, env, user) {
  const year       = parseInt(args && args[0], 10);
  const campusCode = args && args[1];
  const testName   = args && args[2];
  const targetTest = String(testName || '').trim();

  // 早期リターン（GAS students.js:1208-1211 と完全同一）
  if (!targetTest || !campusCode) {
    return { success: true, students: [] };
  }

  try {
    // 1. 成績データから該当テストの生徒IDセットを収集
    //    GAS getDataSheetData(year) 相当: SELECT grades WHERE fiscal_year = year
    const gradeRows = await supabaseSelect(env, 'grades', 'fiscal_year=eq.' + year);
    const studentIdSet = {};
    gradeRows.forEach(row => {
      // studentId 正規化（先頭ゼロ消失バグ対策・GAS getDataSheetData:234-235 と同一）
      let sid = String(row.student_id || '').trim();
      if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
      if (String(row.test_name || '').trim() === targetTest) {
        studentIdSet[sid] = true;
      }
    });

    // 2. 生徒マスタから校舎フィルタ＋成績あり生徒のみ抽出
    //    既存の Workers getMasterData() を内部呼び出し（B-⑧実装を再利用）
    //    ※ campusCode は padStart しない（GAS students.js:1225 と完全同一挙動）
    const masterData = await getMasterData([year], env, user);
    const students = masterData
      .filter(s => s.campus === String(campusCode) && studentIdSet[String(s.studentId)])
      .map(s => ({
        studentId:  s.studentId,
        name:       s.name,
        furigana:   s.furigana,
        schoolName: s.schoolName
      }));

    // 3. ふりがな順ソート（'ja' ロケール）
    students.sort((a, b) => (a.furigana || '').localeCompare(b.furigana || '', 'ja'));

    return { success: true, students };
  } catch (error) {
    return { success: false, error: error.toString(), students: [] };
  }
}

// GAS getDataSheetData(year) 相当: Supabase grades テーブルから年度データを取得・変換
// 非公開ヘルパー（getStudentListWithGrades 専用）
async function getDataSheetData(year, env) {
  const docs = await supabaseSelect(env, 'grades', 'fiscal_year=eq.' + parseInt(year, 10));
  return docs.map(doc => {
    let sid = String(doc.student_id || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    return {
      studentId:      sid,
      testName:       String(doc.test_name || '').trim(),
      kokugo:         doc.kokugo  != null ? doc.kokugo  : '',
      shakai:         doc.shakai  != null ? doc.shakai  : '',
      sugaku:         doc.sugaku  != null ? doc.sugaku  : '',
      rika:           doc.rika    != null ? doc.rika    : '',
      eigo:           doc.eigo    != null ? doc.eigo    : '',
      total:          doc.total   != null ? doc.total   : '',
      average:        doc.average != null ? doc.average : '',
      shogaku1:       String(doc.shogaku1       || ''),
      shogaku1_gakka: String(doc.shogaku1_gakka || ''),
      shogaku2:       String(doc.shogaku2       || ''),
      shogaku2_gakka: String(doc.shogaku2_gakka || ''),
      recordedDate:   doc.recorded_at || new Date().toISOString(),
      studentName:    String(doc.student_name || '')
    };
  });
}

/**
 * getStudentListWithGrades — GAS getStudentListWithGrades(year, testName) の Workers 版
 * 一覧表タブ用: 生徒マスタ×成績データ×合格可能性を結合して返す
 * GAS 版との差分: 3クエリを Promise.all で並列実行（GAS 版は逐次）
 */
export async function getStudentListWithGrades(args, env, user) {
  const year     = parseInt(args && args[0], 10);
  const testName = String((args && args[1]) || '').trim();

  try {
    // 3クエリ並列実行（GAS版は逐次だが、Workers では並列化して高速化）
    const [masterData, gradeRows, aDocs] = await Promise.all([
      getMasterData([year], env, user),
      getDataSheetData(year, env),
      supabaseSelect(env, 'student_analysis',
        'test_name=eq.' + encodeURIComponent(testName) +
        '&year=eq.' + parseInt(year, 10)
      ).catch(() => [])  // 失敗してもスキップ（GAS版 try-catch と同一挙動）
    ]);

    // テスト名でフィルタして studentId → 成績のマップを作成
    // 最初の一致行を保持し、後続の重複行で上書きしない（GAS版 L286-290 と同一）
    const gradeMap = {};
    gradeRows.forEach(row => {
      if (String(row.testName || '').trim() === testName) {
        const sid = String(row.studentId);
        if (!gradeMap[sid]) gradeMap[sid] = row;
      }
    });

    // 合格可能性マップ: {sid|testName → {schoolName: percent}}
    const analysisPassMap = {};
    aDocs.forEach(doc => {
      let sid = String(doc.student_id || '').trim();
      if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
      const tname = String(doc.test_name || '').trim();
      if (!sid || !tname) return;
      const raw = doc.analysis_json;
      let data = raw;
      if (typeof raw === 'string') {
        try { data = JSON.parse(raw); } catch(e) { data = null; }
      }
      if (!data || !Array.isArray(data.passAssessment)) return;
      const m = {};
      data.passAssessment.forEach(pa => {
        if (pa.schoolName && pa.probability && pa.probability.percent != null) {
          m[pa.schoolName] = pa.probability.percent;
        }
      });
      analysisPassMap[sid + '|' + tname] = m;
    });

    // 生徒マスタと成績を結合（GAS版 L324-352 と同一構造）
    // ソートなし: getMasterData がふりがな順で返すのでそのまま使う
    const students = masterData.map(student => {
      const g = gradeMap[String(student.studentId)] || null;
      const aKey = String(student.studentId) + '|' + testName;
      const aEntry = analysisPassMap[aKey] || {};
      return {
        studentId:      student.studentId,
        name:           student.name,
        furigana:       student.furigana,
        seiFurigana:    student.seiFurigana,
        meiFurigana:    student.meiFurigana,
        campus:         student.campus,
        grade:          student.grade,
        schoolName:     student.schoolName,
        kokugo:         g ? g.kokugo  : '',
        shakai:         g ? g.shakai  : '',
        sugaku:         g ? g.sugaku  : '',
        rika:           g ? g.rika    : '',
        eigo:           g ? g.eigo    : '',
        total:          g ? g.total   : '',
        average:        g ? g.average : '',
        shogaku1:       g ? (g.shogaku1 || '')       : '',
        shogaku1_gakka: g ? (g.shogaku1_gakka || '') : '',
        shogaku2:       g ? (g.shogaku2 || '')       : '',
        shogaku2_gakka: g ? (g.shogaku2_gakka || '') : '',
        hasGrade:       g !== null,
        passPercent1:   (g && g.shogaku1 && aEntry[g.shogaku1] != null) ? aEntry[g.shogaku1] : null,
        passPercent2:   (g && g.shogaku2 && aEntry[g.shogaku2] != null) ? aEntry[g.shogaku2] : null
      };
    });

    return { success: true, students };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * submitStudentInfo — GAS submitStudentInfo(...) の Workers 版
 * 生徒情報を新規登録する（成績管理タブ → 情報入力フォーム → 「登録」ボタン）
 * GAS 版 students.js L419-498 と同一挙動。差分:
 *   - LockService 不在のため PK 衝突時にリトライで採番をやり直す（最大 3 回）
 *   - その他のロジック（バリデーション・重複チェック・ID 採番・全カラム指定 INSERT）は完全一致
 * args: [year, campusCode, gradeCode, sei, mei, seiFurigana, meiFurigana, schoolName]
 */
export async function submitStudentInfo(args, env, user) {
  const [year, campusCode, gradeCode, sei, mei, seiFurigana, meiFurigana, schoolName] = args || [];
  try {
    if (!sei || !seiFurigana || !campusCode || !gradeCode) {
      return { success: false, error: '必須項目（校舎、学年、姓、姓ふりがな）を入力してください' };
    }

    const campus = String(campusCode).padStart(2, '0');
    const grade = String(gradeCode).padStart(2, '0');
    const prefix = campus + String(year) + grade;
    const fullName = String(sei).trim() + (mei ? String(mei).trim() : '');
    const fullFurigana = String(seiFurigana).trim() + (meiFurigana ? String(meiFurigana).trim() : '');

    // 重複チェック（削除済みを除く同一氏名・ふりがな）— GAS L448-458 と同一
    const allActive = await supabaseSelect(env, 'students',
      'is_deleted=eq.false&select=id,student_id,sei,mei,sei_furigana,mei_furigana');
    for (const s of allActive || []) {
      const existName = String(s.sei || '').trim() + String(s.mei || '').trim();
      const existFurigana = String(s.sei_furigana || '').trim() + String(s.mei_furigana || '').trim();
      if (existName === fullName && existFurigana === fullFurigana) {
        return { success: false, error: '同じ氏名・ふりがなの生徒がすでに登録されています（ID: ' + (s.student_id || s.id) + '）' };
      }
    }

    const registrationYear = parseInt(String(year), 10);
    const registrationGrade = parseInt(grade, 10);

    // ID 採番 + INSERT（PK 衝突時は max+1 を再計算してリトライ）
    const MAX_RETRIES = 3;
    let studentId = '';
    for (let retry = 0; retry < MAX_RETRIES; retry++) {
      // 同プレフィックスを持つ生徒から maxSeq を計算 — GAS L441-467 と同一
      const existing = await supabaseSelect(env, 'students',
        'student_id=gte.' + encodeURIComponent(prefix + '00') +
        '&student_id=lte.' + encodeURIComponent(prefix + '99') +
        '&select=id,student_id');

      let maxSeq = 0;
      for (const doc of existing || []) {
        const id = String(doc.student_id || doc.id || '');
        if (id.indexOf(prefix) === 0) {
          const seq = parseInt(id.slice(prefix.length), 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      }

      studentId = prefix + String(maxSeq + 1).padStart(2, '0');
      const now = new Date().toISOString();

      const record = {
        id: studentId,
        student_id: studentId,
        campus,
        sei: String(sei).trim(),
        mei: String(mei || '').trim(),
        sei_furigana: String(seiFurigana).trim(),
        mei_furigana: String(meiFurigana || '').trim(),
        school_name: String(schoolName || '').trim(),
        is_deleted: false,
        created_at: now,
        registration_year: registrationYear,
        registration_grade: registrationGrade
      };

      try {
        await supabaseInsert(env, 'students', record);
        return { success: true, message: '生徒情報を登録しました', studentId };
      } catch (err) {
        const errMsg = String(err && err.message ? err.message : err);
        // Postgres unique_violation (23505) → 競合発生・リトライ
        if (errMsg.includes('23505') || errMsg.includes('duplicate key')) {
          if (retry < MAX_RETRIES - 1) continue;
          return { success: false, error: '同時操作による競合が発生しました。時間をおいて再試行してください。' };
        }
        throw err;
      }
    }

    return { success: false, error: '同時操作による競合が発生しました。時間をおいて再試行してください。' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * updateStudentInfo — GAS updateStudentInfo(...) の Workers 版
 * 生徒情報を更新する（成績管理タブ → 生徒入力フォーム → 「更新」ボタン）
 * GAS 版 students.js L512-537 と完全同一挙動
 * args: [studentId, campusCode, sei, mei, seiFurigana, meiFurigana, schoolName]
 */
export async function updateStudentInfo(args, env, user) {
  const [studentId, campusCode, sei, mei, seiFurigana, meiFurigana, schoolName] = args || [];
  try {
    let sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    // 存在確認（GAS 版 L518-519 と同一）
    const check = await supabaseSelect(env, 'students',
      'id=eq.' + encodeURIComponent(sid) + '&select=id');
    if (!check || check.length === 0) {
      return { success: false, error: '生徒が見つかりません' };
    }

    // PATCH（UPSERT だと ON CONFLICT より先に NOT NULL 違反が発火するため UPDATE に変更）
    await supabaseUpdate(env, 'students', {
      campus:       String(campusCode).padStart(2, '0'),
      sei:          String(sei || '').trim(),
      mei:          String(mei || '').trim() || '',
      sei_furigana: String(seiFurigana || '').trim(),
      mei_furigana: String(meiFurigana || '').trim() || '',
      school_name:  String(schoolName || '').trim() || ''
    }, 'id=eq.' + encodeURIComponent(sid));

    return { success: true, message: '生徒情報を更新しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * deleteStudent — GAS deleteStudent(studentId) の Workers 版
 * 生徒をソフトデリート（is_deleted=true）する
 * GAS 版 students.js L545-561 と完全同一挙動
 * args: [studentId]
 */
export async function deleteStudent(args, env, user) {
  const studentId = args && args[0];
  try {
    let sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    // 存在確認
    const check = await supabaseSelect(env, 'students',
      'id=eq.' + encodeURIComponent(sid) + '&select=id');
    if (!check || check.length === 0) {
      return { success: false, error: '生徒が見つかりません' };
    }

    // is_deleted=true のみ更新（PATCH で未指定カラムの既存値を保持）
    await supabaseUpdate(env, 'students', { is_deleted: true }, 'id=eq.' + encodeURIComponent(sid));

    return { success: true, message: '生徒を削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * restoreStudent — GAS restoreStudent(studentId) の Workers 版
 * 削除済み生徒を復元（is_deleted=false）する
 * GAS 版 students.js L626-642 と完全同一挙動
 * args: [studentId]
 */
export async function restoreStudent(args, env, user) {
  const studentId = args && args[0];
  try {
    let sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    // 存在確認
    const check = await supabaseSelect(env, 'students',
      'id=eq.' + encodeURIComponent(sid) + '&select=id');
    if (!check || check.length === 0) {
      return { success: false, error: '生徒が見つかりません' };
    }

    // is_deleted=false のみ更新（PATCH で未指定カラムの既存値を保持）
    await supabaseUpdate(env, 'students', { is_deleted: false }, 'id=eq.' + encodeURIComponent(sid));

    return { success: true, message: '生徒情報を復元しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * submitGradeData — GAS submitGradeData(year, studentId, testName, scores, skipCacheUpdate) の Workers 版
 * 成績データを Supabase grades テーブルに UPSERT（新規INSERT・既存UPDATE両用）
 * GAS 版 students.js L1120-1194 と同一挙動
 *
 * frontend からの引数（gas-bridge 経由）:
 *   args[0] year         — 年度
 *   args[1] studentId    — 生徒ID
 *   args[2] testName     — テスト名
 *   args[3] scores       — { kokugo, shakai, sugaku, rika, eigo, gokei,
 *                            shogaku1, shogaku1_gakka, shogaku2, shogaku2_gakka, studentName }
 *   args[4] skipCacheUpdate — Workers では無視（インメモリキャッシュが存在しない）
 *
 * GAS 版との差分:
 *   - getMasterData 呼び出しを省略（campus は sid.substring(0,2) で代替 — GAS 版フォールバック路と同一）
 *   - getStudentNameById 呼び出しを省略（studentName は常に scores.studentName が渡される）
 *   - skipCacheUpdate フラグは未使用（Workers はリクエスト間メモリ共有なし）
 */
export async function submitGradeData(args, env, user) {
  const [year, studentId, testName, scores] = args || [];
  try {
    if (!studentId || !testName) {
      return { success: false, error: '生徒IDとテスト名は必須です' };
    }

    let sid = String(studentId).trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    const s = scores || {};

    // スコア値を数値に変換（0 が有効値なので isNaN チェックを使う — GAS 版 L1130-1134 と同一）
    let kokugo = parseInt(s.kokugo, 10); if (isNaN(kokugo)) kokugo = 0;
    let shakai = parseInt(s.shakai, 10); if (isNaN(shakai)) shakai = 0;
    let sugaku = parseInt(s.sugaku, 10); if (isNaN(sugaku)) sugaku = 0;
    let rika   = parseInt(s.rika,   10); if (isNaN(rika))   rika   = 0;
    let eigo   = parseInt(s.eigo,   10); if (isNaN(eigo))   eigo   = 0;
    const calcTotal = kokugo + shakai + sugaku + rika + eigo;
    const gokei = parseInt(s.gokei, 10);
    const total   = (!isNaN(gokei) && gokei > 0) ? gokei : calcTotal;
    const average = total > 0 ? parseFloat((total / 5).toFixed(1)) : 0;

    const studentName = s.studentName || '';
    const campus = sid.substring(0, 2);  // 生徒IDの先頭2桁（設計上 campus と一致）
    const docId = makeGradeDocId(sid, testName, year);

    // grades テーブルへ UPSERT（on_conflict=id、全カラム指定のため NOT NULL 違反なし）
    await supabaseUpsert(env, 'grades', {
      id:             docId,
      student_id:     sid,
      test_name:      String(testName).trim(),
      fiscal_year:    parseInt(year, 10),
      kokugo:         kokugo,
      shakai:         shakai,
      sugaku:         sugaku,
      rika:           rika,
      eigo:           eigo,
      total:          total,
      average:        average,
      shogaku1:       s.shogaku1       || '',
      shogaku1_gakka: s.shogaku1_gakka || '',
      shogaku2:       s.shogaku2       || '',
      shogaku2_gakka: s.shogaku2_gakka || '',
      recorded_at:    new Date().toISOString(),
      student_name:   studentName,
      campus:         campus
    }, 'id');

    return { success: true, message: '成績データを保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// saveExamResult: 中3生徒の受験結果を students テーブルに保存
// GAS students.js L1857-1894 のポート。B-⑭ と同型の NOT NULL 違反を避けるため PATCH 方式で実装。
// LockService は省略（last-write-wins で並行書き込みリスク極小）
export async function saveExamResult(args, env, user) {
  const [studentId, examDataJson] = args || [];
  try {
    let sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
    if (!sid) return { success: false, error: '生徒IDが指定されていません' };

    let examData = {};
    try {
      examData = typeof examDataJson === 'string' ? JSON.parse(examDataJson) : (examDataJson || {});
    } catch (_) {
      examData = {};
    }

    // 事前 SELECT で存在確認（存在しない id の PATCH がサイレント成功するのを防ぐ）
    const check = await supabaseSelect(env, 'students', 'id=eq.' + encodeURIComponent(sid) + '&select=id');
    if (!check || check.length === 0) {
      return { success: false, error: '生徒が見つかりません: ' + sid };
    }

    await supabaseUpdate(env, 'students', {
      jukoukou1:        examData.jukoukou1        || '',
      jukoukou1_gakka:  examData.jukoukou1_gakka  || '',
      jukoukou1_gokaku: examData.jukoukou1_gokaku || '',
      ikusei:           examData.ikusei           || '',
      jukoukou2:        examData.jukoukou2        || '',
      jukoukou2_gakka:  examData.jukoukou2_gakka  || '',
      jukoukou2_gokaku: examData.jukoukou2_gokaku || ''
    }, 'id=eq.' + encodeURIComponent(sid));

    return { success: true, message: '受験情報を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-16】getStudentExamData — GAS students.js:1793 の Workers 版
 *
 * 中3 生徒の受験情報と最新テストの第1志望校を取得する。成績管理タブの
 * 情報入力セクション（js-grades.html:600）から呼ばれる。
 *
 * 認証: Firebase ID トークン検証のみ（Admin ガードなし）。
 *
 * GAS 版との差分:
 *   - students SELECT と grades 取得を Promise.all で並列化（GAS 版は逐次）
 *
 * 戻り値形状は GAS 版と完全一致:
 *   成功: { success: true, examData, latestGrade }
 *   失敗: { success: false, error, examData: {}, latestGrade: {} }
 *   ※ 生徒が見つからない場合でも examData（空） / latestGrade（空）を含めて
 *     success:true で返す（フロント renderExamSection が防御的に受ける）
 */
export async function getStudentExamData(args, env, user) {
  try {
    const [studentId, fiscalYear] = args || [];
    let sid = String(studentId || '').trim();
    if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');

    const [rows, gradeRows] = await Promise.all([
      supabaseSelect(env, 'students', 'id=eq.' + encodeURIComponent(sid)),
      getDataSheetData(fiscalYear, env)
    ]);

    const doc = rows && rows.length > 0 ? studentFromSupabase(rows[0]) : null;
    const emptyExam = {
      jukoukou1: '', jukoukou1_gakka: '', jukoukou1_gokaku: '',
      ikusei: '',
      jukoukou2: '', jukoukou2_gakka: '', jukoukou2_gokaku: ''
    };
    const examData = doc ? {
      jukoukou1:        String(doc.jukoukou1        || ''),
      jukoukou1_gakka:  String(doc.jukoukou1_gakka  || ''),
      jukoukou1_gokaku: String(doc.jukoukou1_gokaku || ''),
      ikusei:           String(doc.ikusei            || ''),
      jukoukou2:        String(doc.jukoukou2        || ''),
      jukoukou2_gakka:  String(doc.jukoukou2_gakka  || ''),
      jukoukou2_gokaku: String(doc.jukoukou2_gokaku || '')
    } : emptyExam;

    let latestGrade = { shogaku1: '', shogaku1_gakka: '' };
    const studentRows = (gradeRows || []).filter(r => {
      let rowSid = String(r.studentId || '').trim();
      if (/^\d+$/.test(rowSid) && rowSid.length < 10) rowSid = rowSid.padStart(10, '0');
      return rowSid === sid;
    });
    if (studentRows.length > 0) {
      studentRows.sort((a, b) => new Date(b.recordedDate) - new Date(a.recordedDate));
      latestGrade = {
        shogaku1:       String(studentRows[0].shogaku1       || ''),
        shogaku1_gakka: String(studentRows[0].shogaku1_gakka || '')
      };
    }

    return { success: true, examData, latestGrade };
  } catch (error) {
    return { success: false, error: error.toString(), examData: {}, latestGrade: {} };
  }
}

/**
 * 【Phase 6-A-12 / 6-A-13】fetchCampusAverages_ — 校舎別平均のコアロジック（private）
 *
 * Phase 6-A-13 で getCampusAverages と getGradeSummary の共通処理として切出し。
 * Supabase RPC + 校舎名マッピング + ソート済み配列を返す。
 * 認証・レスポンス整形は呼び出し元（ハンドラ）が担当する。
 *
 * @param {Object} env
 * @param {number} year
 * @param {string} testName
 * @returns {Promise<Array<{campusCode, campusName, count, kokugo, shakai, sugaku, rika, eigo, total}>>}
 * @throws Supabase RPC / KV エラーは上位に伝搬
 */
async function fetchCampusAverages_(env, year, testName) {
  const [rpcResult, campusMap] = await Promise.all([
    supabaseRpc(env, 'get_campus_averages', { p_year: year, p_test: testName }),
    getCampusConfig_(env)
  ]);

  const campusArr = Array.isArray(rpcResult) ? rpcResult : [];

  const campuses = campusArr.map((c) => {
    const code = c.campusCode || c.campus_code || '';
    return {
      campusCode: code,
      campusName: code === 'all' ? '全校舎' : (campusMap[code] || code || ''),
      count:  c.count  || c.cnt || 0,
      kokugo: c.kokugo != null ? c.kokugo : '',
      shakai: c.shakai != null ? c.shakai : '',
      sugaku: c.sugaku != null ? c.sugaku : '',
      rika:   c.rika   != null ? c.rika   : '',
      eigo:   c.eigo   != null ? c.eigo   : '',
      total:  c.total  != null ? c.total  : ''
    };
  });

  campuses.sort((a, b) => {
    if (a.campusCode === 'all') return -1;
    if (b.campusCode === 'all') return 1;
    return a.campusCode.localeCompare(b.campusCode);
  });

  return campuses;
}

/**
 * 【Phase 6-A-12】getCampusAverages — GAS students.js:1584 の Workers 版
 *
 * 指定年度・テストの校舎別平均点を Supabase RPC `get_campus_averages`
 * (SQL 集計済み) で取得し、校舎名ラベルを付与して返す。
 * 呼出元: firebase-students.html:459 `gasApiPromise_('getCampusAverages', [year, testName])`。
 *
 * 認証:
 *   Firebase ID トークン検証のみ（router.js で実施）。Admin ガードなし
 *   — GAS 版も isAdmin チェック無しの参照系関数のため。
 *
 * データソース:
 *   - Supabase RPC `get_campus_averages(p_year, p_test)` — 校舎別集計
 *   - KV `prop:CAMPUS_CODES`（getCampusConfig_ 経由）— 校舎コード→校舎名の辞書
 *
 * Phase 6-A-13 リファクタ:
 *   コアロジックを `fetchCampusAverages_` に切り出し。外部 API としての
 *   戻り値形状・ソート順は Phase 6-A-12 と完全互換。
 *
 * 戻り値形状（GAS 版完全一致）:
 *   成功: { success: true, campuses: [{campusCode, campusName, count,
 *           kokugo, shakai, sugaku, rika, eigo, total}, ...] }
 *   エラー: { success: false, error: <文言> }
 *     ※ GAS 版はエラー時 campuses プロパティを返さない点に忠実
 */
export async function getCampusAverages(args, env, user) {
  try {
    const year     = parseInt(args && args[0], 10);
    const testName = String((args && args[1]) || '').trim();
    const campuses = await fetchCampusAverages_(env, year, testName);
    return { success: true, campuses };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-13】getGradeSummary — GAS students.js:1646 の Workers 版
 *
 * 指定年度・テストの成績サマリー（校舎別平均 Map + 点数帯ヒストグラム）を返す。
 * 呼出元: firebase-students.html:441 `gasApiPromise_('getGradeSummary', [year, testName])`。
 *
 * 認証:
 *   Firebase ID トークン検証のみ。Admin ガードなし（GAS 版踏襲）。
 *
 * データソース:
 *   - 校舎別平均: fetchCampusAverages_（Supabase RPC `get_campus_averages` + KV 校舎名）
 *   - 点数帯分布: Supabase RPC `get_grade_breakdown(p_year, p_test)`
 *   両者を Promise.all で並列取得（GAS 版は直列）。
 *
 * 戻り値形状（GAS 版完全一致・success フラグ無し）:
 *   成功: {
 *     fiscalYear:     <int>,
 *     testName:       <string>,
 *     count:          <int>          // 'all' 校舎の count
 *     campusAverages: { <code>: {kokugo, shakai, sugaku, rika, eigo, total, count}, ... }
 *     gradeBreakdown: <get_grade_breakdown の生戻り値 / null なら {}>
 *   }
 *   失敗: null（GAS 版と同じ。エラー時も try/catch 内で null を返す）
 */
export async function getGradeSummary(args, env, user) {
  try {
    const year     = parseInt(args && args[0], 10);
    const testName = String((args && args[1]) || '').trim();

    const [campuses, gradeBreakdownRaw] = await Promise.all([
      fetchCampusAverages_(env, year, testName),
      supabaseRpc(env, 'get_grade_breakdown', { p_year: year, p_test: testName })
    ]);

    const campusAverages = {};
    let totalCount = 0;
    campuses.forEach((c) => {
      campusAverages[c.campusCode] = {
        kokugo: c.kokugo,
        shakai: c.shakai,
        sugaku: c.sugaku,
        rika:   c.rika,
        eigo:   c.eigo,
        total:  c.total,
        count:  c.count
      };
      if (c.campusCode === 'all') totalCount = c.count;
    });

    return {
      fiscalYear: year,
      testName,
      count: totalCount,
      campusAverages,
      gradeBreakdown: gradeBreakdownRaw || {}
    };
  } catch (e) {
    return null;
  }
}

/**
 * 【Phase 6-A-14】getStudentGradeReport — GAS students.js:1249 の Workers 版
 *
 * 成績表タブ用: 指定生徒の全テスト成績 + 学校別平均 + 偏差値を返す。
 * 呼出元: firebase-students.html:286 `gasApiPromise_('getStudentGradeReport', [year, studentId])`。
 * 使われる画面:
 *   - js-grades-list.html: 成績表カード表示
 *   - js-grades-report-pdf.html: 成績表PDF一括出力
 *
 * 認証:
 *   Firebase ID トークン検証のみ（router.js で実施）。Admin ガードなし
 *   — GAS 版も参照系として isAdmin チェック無し。
 *
 * データソース:
 *   - Supabase `students` (is_deleted=false)     — 生徒マスタ
 *   - Supabase `grades` (fiscal_year=year)        — 成績データ全件
 *   - Supabase `school_averages` (id=docId)       — テストごとの学校別平均
 *   - KV `prop:GRADES_TEST_NAMES_CONFIG`           — テスト名ソート順
 *   - KV `prop:GRADES_SIGMA_CONFIG`                — σ 設定（偏差値計算用）
 *
 * GAS 版との差分:
 *   - 第1段（4並列）・第2段（uniqueTests 並列）の Promise.all 最適化のみ。
 *   - 戻り値形状・エラー文言・studentId 正規化・schoolName フォールバックは完全一致。
 *
 * 戻り値形状（GAS 版完全一致）:
 *   成功: {
 *     success: true,
 *     student:        { studentId, name, furigana, campus, grade, schoolName },
 *     grades:         [{testName, kokugo, shakai, sugaku, rika, eigo, total, average,
 *                       shogaku1, shogaku1_gakka, shogaku2, shogaku2_gakka}, ...] // ソート済み
 *     testNames:      string[],                         // getTestNamesConfig_ 生配列
 *     schoolAverages: { [testName]: {schoolName, kokugo, shakai, sugaku, rika, eigo, total} },
 *     deviationValues:{ [testName]: {kokugo, shakai, sugaku, rika, eigo, total} }
 *                     // 値は number | null、schoolAverages に無いテストはキー自体作らない
 *   }
 *   エラー: { success: false, error: <文言> }
 */
export async function getStudentGradeReport(args, env, user) {
  try {
    const year      = parseInt(args && args[0], 10);
    const studentId = args && args[1];

    if (!studentId) {
      return { success: false, error: '生徒IDが指定されていません' };
    }
    const targetId = String(studentId).trim();

    // 第1段: 4並列取得（GAS 版は逐次だが Workers では並列化）
    const [masterData, allGrades, configTestNames, sigma] = await Promise.all([
      getMasterData([year], env, user),
      getDataSheetData(year, env),
      getTestNamesConfig_(env),
      fetchSigmaConfig_(env)
    ]);

    // 1. 生徒マスタから対象生徒を線形検索（GAS students.js:1260-1265 と完全同一）
    let student = null;
    for (let i = 0; i < masterData.length; i++) {
      if (String(masterData[i].studentId) === targetId) {
        student = masterData[i];
        break;
      }
    }
    if (!student) {
      return { success: false, error: '生徒が見つかりません（ID: ' + studentId + '）' };
    }

    // 2. 全成績データから studentId で絞り込み + re-shape（GAS 1271-1291 と同一）
    const studentGrades = [];
    allGrades.forEach((row) => {
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

    // 3. テスト名設定の順序で並べ替え（GAS 1293-1301 と同一）
    const testOrder = {};
    configTestNames.forEach((name, idx) => { testOrder[name] = idx; });
    studentGrades.sort((a, b) => {
      const orderA = testOrder[a.testName] !== undefined ? testOrder[a.testName] : 9999;
      const orderB = testOrder[b.testName] !== undefined ? testOrder[b.testName] : 9999;
      return orderA - orderB;
    });

    // 4. uniqueTests 特定（重複除去・出現順維持）＋ 学校別平均を第2段並列取得
    const studentSchool = (student.schoolName || '').trim();
    const uniqueTests = [];
    studentGrades.forEach((g) => {
      if (uniqueTests.indexOf(g.testName) === -1) uniqueTests.push(g.testName);
    });

    const averagesList = await Promise.all(
      uniqueTests.map((t) => fetchSchoolAverages_(env, year, t).catch(() => null))
    );

    // 5. schoolAverages を組立（GAS 1313-1332 と完全同一の探索順序）
    //    完全一致最優先・break せず探索継続・無ければ先頭の "平均" 含む行を採用
    const schoolAverages = {};
    uniqueTests.forEach((testName, i) => {
      const averages = averagesList[i];
      if (!Array.isArray(averages)) return;
      let fallback = null;
      for (let j = 0; j < averages.length; j++) {
        const sn = (averages[j].schoolName || '').trim();
        if (studentSchool && sn === studentSchool) {
          schoolAverages[testName] = averages[j];
          fallback = null;
          break;
        }
        if (!fallback && sn.indexOf('平均') !== -1) {
          fallback = averages[j];
        }
      }
      if (fallback) {
        schoolAverages[testName] = fallback;
      }
    });

    // 6. 偏差値を計算（GAS 1335-1347 と同一・schoolAverages 無しテストはキー作らない）
    const deviationValues = {};
    const subjKeys = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];
    studentGrades.forEach((g) => {
      const avg = schoolAverages[g.testName];
      if (!avg) return;
      const devs = {};
      subjKeys.forEach((subj) => {
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
      grades:          studentGrades,
      testNames:       configTestNames,
      schoolAverages,
      deviationValues
    };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 【Phase 6-A-16】getStudentPlacementData — GAS students.js:1844 の Workers 版
 *
 * 進学先一覧データを取得する（中3 生の基礎学力テスト3回分 + 受験情報 + 合格可能性）。
 * 成績管理 → 進学先タブ（js-grades-placement.html:121）から呼ばれる。
 *
 * 認証: Firebase ID トークン検証のみ（Admin ガードなし）。
 *
 * GAS 版との差分:
 *   - 第1段 4 並列取得: getMasterData / getDataSheetData / students SELECT / fetchSigmaConfig_
 *   - 第2段 並列取得: 基礎学 3 回分の fetchSchoolAverages_ + fetchCampusAverages_ + getSchoolConfig_
 *   - fetchSchoolAverages_/fetchCampusAverages_ は throw する可能性があるため
 *     .catch(() => null) で fallback（GAS 版の handler-level try-catch と等価）
 *
 * 進学先判定優先順位（GAS 版 L1953-1969 と完全一致）:
 *   1. exam.ikusei === 'true'           → 育成型 → 第1志望校
 *   2. exam.jukoukou1_gokaku === '合格' → 第1志望校
 *   3. exam.jukoukou2_gokaku === '合格' → 第2志望校
 *   4. exam.jukoukou1 あり              → 暫定で第1志望校
 *
 * 平均点取得優先順位（L1900-1922 と一致）:
 *   - 学校別平均の "平均" 含む行を優先
 *   - なければ塾全体平均（fetchCampusAverages_ の `campusCode === 'all'` 行）
 *
 * 戻り値: GAS 版と同じ **生の配列**（success ラップなし）
 *   成功: [{studentId, name, campus, score1, score2, score3, avg, placement,
 *          placementSchool, passPercent, ikusei}, ...]
 *   失敗: []（空配列）
 *
 * ※ 絶対に {success, data} 等でラップしない
 *    （フロント placementTableData = data || [] の受け方に依存）
 */
export async function getStudentPlacementData(args, env, user) {
  try {
    const year = args && args[0];

    // 第1段: 4 並列取得
    const [allStudents, allGradeData, allStudentDocs, sigmaConfig] = await Promise.all([
      getMasterData([year], env, user),
      getDataSheetData(String(year), env),
      supabaseSelect(env, 'students', 'is_deleted=eq.false'),
      fetchSigmaConfig_(env)
    ]);

    // 中3 フィルタ（学年コード 15）
    const chuu3Students = (allStudents || []).filter(s => parseInt(s.grade, 10) === 15);
    if (chuu3Students.length === 0) return [];

    // gradeMap: studentId -> { '第N回基礎学力テスト': total }
    const gradeMap = {};
    (allGradeData || []).forEach(row => {
      const sid = String(row.studentId || '').trim();
      if (!sid) return;
      const testName = String(row.testName || '').trim();
      if (!/^第(\d+)回基礎学力テスト$/.test(testName)) return;
      const total = (row.total !== '' && row.total !== null && !isNaN(Number(row.total)))
        ? Number(row.total) : null;
      if (!gradeMap[sid]) gradeMap[sid] = {};
      gradeMap[sid][testName] = total;
    });

    // examMap: studentId -> 受験情報（いずれかの exam フィールドが設定されている場合のみ）
    const examMap = {};
    (allStudentDocs || []).forEach(row => {
      const doc = studentFromSupabase(row);
      const mSid = String(doc.studentId || '').trim();
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

    const sigmaTotal = (sigmaConfig && sigmaConfig.total) ? sigmaConfig.total : 100;

    // 第2段: 基礎学 3 回分の学校別平均 + 校舎別平均 + 志望校設定を並列取得
    const basicTestNames = ['第1回基礎学力テスト', '第2回基礎学力テスト', '第3回基礎学力テスト'];
    const [schoolAveragesList, campusAveragesList, schoolConfig] = await Promise.all([
      Promise.all(basicTestNames.map(tn => fetchSchoolAverages_(env, year, tn).catch(() => null))),
      Promise.all(basicTestNames.map(tn => fetchCampusAverages_(env, year, tn).catch(() => null))),
      getSchoolConfig_(env)
    ]);

    // 各基礎学テストの塾全体平均合計を取得
    // 優先: 学校別平均の "平均" 含む行 / フォールバック: fetchCampusAverages_ の 'all' 行
    const jukuTestAvgTotal = {};
    basicTestNames.forEach((tn, i) => {
      const averages = schoolAveragesList[i];
      if (Array.isArray(averages)) {
        const avgRow = averages.filter(a => (a.schoolName || '').trim().indexOf('平均') !== -1)[0];
        if (avgRow && avgRow.total != null) {
          jukuTestAvgTotal[tn] = avgRow.total;
          return;
        }
      }
      const campuses = campusAveragesList[i];
      if (Array.isArray(campuses)) {
        for (let ci = 0; ci < campuses.length; ci++) {
          if (campuses[ci].campusCode === 'all') {
            jukuTestAvgTotal[tn] = campuses[ci].total;
            break;
          }
        }
      }
    });

    // 志望校設定から 学校名 → 学科別偏差値マップ
    const schoolDevMapForPlacement = {};
    (schoolConfig || []).forEach(sc => {
      const deptMap = {};
      (sc.departments || []).forEach(d => { deptMap[d.name] = d.deviation; });
      schoolDevMapForPlacement[sc.name] = deptMap;
    });

    // データを結合
    const result = chuu3Students.map(student => {
      const sid = student.studentId;
      const grades = gradeMap[sid] || {};
      const exam = examMap[sid] || {};

      const score1 = (grades['第1回基礎学力テスト'] !== undefined && grades['第1回基礎学力テスト'] !== null)
        ? grades['第1回基礎学力テスト'] : null;
      const score2 = (grades['第2回基礎学力テスト'] !== undefined && grades['第2回基礎学力テスト'] !== null)
        ? grades['第2回基礎学力テスト'] : null;
      const score3 = (grades['第3回基礎学力テスト'] !== undefined && grades['第3回基礎学力テスト'] !== null)
        ? grades['第3回基礎学力テスト'] : null;

      const validScores = [score1, score2, score3].filter(s => s !== null);
      const avg = validScores.length > 0
        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
        : null;

      // 進学先決定
      let placementSchool = '';
      let placementDept = '';
      if (exam.ikusei === 'true') {
        placementSchool = exam.jukoukou1;
        placementDept = exam.jukoukou1_gakka;
      } else if (exam.jukoukou1_gokaku === '合格') {
        placementSchool = exam.jukoukou1;
        placementDept = exam.jukoukou1_gakka;
      } else if (exam.jukoukou2_gokaku === '合格') {
        placementSchool = exam.jukoukou2;
        placementDept = exam.jukoukou2_gakka;
      } else if (exam.jukoukou1) {
        placementSchool = exam.jukoukou1;
        placementDept = exam.jukoukou1_gakka;
      }

      const placement = placementSchool
        ? (placementDept ? placementSchool + ' ' + placementDept : placementSchool)
        : '';

      // 合格可能性 on-the-fly 計算
      let passPercent = null;
      if (placementSchool && validScores.length > 0) {
        const validTestNamesForCalc = [];
        if (score1 !== null) validTestNamesForCalc.push('第1回基礎学力テスト');
        if (score2 !== null) validTestNamesForCalc.push('第2回基礎学力テスト');
        if (score3 !== null) validTestNamesForCalc.push('第3回基礎学力テスト');

        const schoolAvgTotalsForCalc = validTestNamesForCalc
          .filter(tn => jukuTestAvgTotal[tn] != null)
          .map(tn => jukuTestAvgTotal[tn]);

        const cumulativeSchoolAvgForCalc = schoolAvgTotalsForCalc.length > 0
          ? schoolAvgTotalsForCalc.reduce((a, b) => a + b, 0) / schoolAvgTotalsForCalc.length
          : null;

        const studentDev = calcDeviationValue_(avg, cumulativeSchoolAvgForCalc, sigmaTotal);

        // 志望校偏差値: 学科一致 → 最初の学科 の順でフォールバック
        const deptMapForCalc = schoolDevMapForPlacement[placementSchool] || {};
        let schoolDev = null;
        if (placementDept && deptMapForCalc[placementDept] != null) {
          schoolDev = deptMapForCalc[placementDept];
        } else {
          const dKeys = Object.keys(deptMapForCalc);
          if (dKeys.length > 0 && deptMapForCalc[dKeys[0]] != null) schoolDev = deptMapForCalc[dKeys[0]];
        }

        const probResult = calcPassProbability_(studentDev, schoolDev);
        if (probResult) passPercent = probResult.percent;
      }

      return {
        studentId:       sid,
        name:            student.name,
        campus:          student.campus,
        score1,
        score2,
        score3,
        avg,
        placement,
        placementSchool,
        passPercent,
        ikusei:          exam.ikusei === 'true'
      };
    });

    return result;
  } catch (error) {
    return [];
  }
}
