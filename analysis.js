
// ========================================
// 【セクション8-B】AI成績分析・生徒別AI分析
// ========================================
// テスト全体のAI分析（generateGradeAnalysis）と
// 生徒個別のAI分析（generateStudentAnalyses）を管理する

// ----------------------------------------
// 内部ヘルパー
// ----------------------------------------

/**
 * Gemini APIへのリクエストを行い、エラー種別に応じて自動リトライする
 * 429（レート制限）: 30秒→60秒→90秒（最大3回）
 * 503・500（高負荷・一時障害）: 30秒（最大1回）
 *   ※15秒では回復しないケースがあるため30秒に延長。
 *   ※150人バッチ処理での最悪ケース（全5コールが503）: 5×30秒=150秒追加→合計約4.6分（GAS6分制限内）
 * @param {string} url APIエンドポイントURL
 * @param {Object} options UrlFetchApp のオプション
 * @return {HTTPResponse} レスポンス
 */
function fetchGeminiWithRetry_(url, options) {
  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();

  // 503・500（高負荷・一時障害）: 1回のみリトライ（30秒待機）
  if (code === 503 || code === 500) {
    Logger.log('⚠ Gemini API高負荷/障害(' + code + ')。30秒後に1回リトライします...');
    Utilities.sleep(30000);
    res = UrlFetchApp.fetch(url, options);
    code = res.getResponseCode();
  }

  // 429（レート制限）: 最大3回リトライ（30秒→60秒→90秒）
  for (var i = 0; i < 3; i++) {
    if (code !== 429) break;
    var waitMs = 30000 * (i + 1);
    Logger.log('⚠ Gemini APIレート制限(429)。' + (waitMs / 1000) + '秒後にリトライ（' + (i + 1) + '/3）...');
    Utilities.sleep(waitMs);
    res = UrlFetchApp.fetch(url, options);
    code = res.getResponseCode();
  }

  return res;
}

// ----------------------------------------
// AI成績分析（テスト全体）
// ----------------------------------------

/**
 * 年度別成績スプレッドシート内に「AI分析」シートを取得または作成する
 * @param {number} year 学年年度
 * @return {Sheet|null} シートオブジェクト
 */
function getAnalysisSheet(year) {
  try {
    var ss = getGradeDataSheet(year);
    if (!ss) return null;

    var sheetName = 'AI分析';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = ['テスト名', '分析コメント', '生成日時'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 150);
      sheet.setColumnWidth(2, 800);
      sheet.setColumnWidth(3, 180);
    }
    return sheet;
  } catch (error) {
    Logger.log('❌ getAnalysisSheetエラー: ' + error);
    return null;
  }
}

/**
 * 指定年度・テスト名のAI分析コメントを取得する（保存済みがあればそれを返す）
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @return {Object} { success, exists, analysis, generatedAt }
 */
function getGradeAnalysis(year, testName) {
  try {

    var sheet = getAnalysisSheet(year);
    if (!sheet) {
      return { success: true, exists: false, analysis: null, generatedAt: '' };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { success: true, exists: false, analysis: null, generatedAt: '' };
    }

    var rows = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
    var targetTest = String(testName || '').trim();

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim() === targetTest) {
        var analysisJson = String(rows[i][1]);
        var generatedAt = String(rows[i][2]);
        try {
          var analysis = JSON.parse(analysisJson);
          return { success: true, exists: true, analysis: analysis, generatedAt: generatedAt };
        } catch (e) {
          Logger.log('⚠ 分析データのパースに失敗: ' + e);
          return { success: true, exists: false, analysis: null, generatedAt: '' };
        }
      }
    }

    return { success: true, exists: false, analysis: null, generatedAt: '' };
  } catch (error) {
    Logger.log('❌ getGradeAnalysisエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定年度・テスト名の塾平均・学校「平均」行をまとめて取得する内部ヘルパー
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @return {Object} { jukuAvg, schoolAvg }（取得できなければ各フィールドが null）
 */
function getYearTestAvgs_(year, testName) {
  var jukuAvg = null;
  try {
    var campResult = getCampusAverages(year, testName);
    if (campResult.success && campResult.campuses) {
      var allEntry = campResult.campuses.filter(function(c) { return c.campusCode === 'all'; })[0];
      if (allEntry) {
        jukuAvg = {
          kokugo: allEntry.kokugo, shakai: allEntry.shakai, sugaku: allEntry.sugaku,
          rika: allEntry.rika, eigo: allEntry.eigo, total: allEntry.total, count: allEntry.count
        };
      }
    }
  } catch (e) {
    Logger.log('⚠ getYearTestAvgs_ jukuAvg取得スキップ (' + year + '/' + testName + '): ' + e);
  }
  var schoolAvg = null;
  try {
    var schoolResult = getSchoolAverages(year, testName);
    if (schoolResult.success && schoolResult.averages) {
      var avgRow = schoolResult.averages.filter(function(a) {
        var n = (a.schoolName || '').trim();
        return n.indexOf('平均') !== -1;
      })[0];
      if (avgRow) {
        schoolAvg = {
          kokugo: avgRow.kokugo, shakai: avgRow.shakai, sugaku: avgRow.sugaku,
          rika: avgRow.rika, eigo: avgRow.eigo, total: avgRow.total
        };
      }
    }
  } catch (e) {
    Logger.log('⚠ getYearTestAvgs_ schoolAvg取得スキップ (' + year + '/' + testName + '): ' + e);
  }
  return { jukuAvg: jukuAvg, schoolAvg: schoolAvg };
}

/**
 * 指定年度の「分布キャッシュ」シートを取得または作成する内部ヘルパー
 * 成績データ.gs 内に列（テスト名 / 分布JSON / 更新日時）を持つシートを管理する
 * @param {number} year 学年年度
 * @return {Sheet|null} シートオブジェクト（取得・作成失敗時は null）
 */
function getDistCacheSheet_(year) {
  try {
    var ss = getGradeDataSheet(year);
    if (!ss) return null;
    var sheet = ss.getSheetByName('分布キャッシュ');
    if (!sheet) {
      sheet = ss.insertSheet('分布キャッシュ');
      sheet.getRange(1, 1, 1, 3).setValues([['テスト名', '分布JSON', '更新日時']]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 200);
      sheet.setColumnWidth(2, 600);
      sheet.setColumnWidth(3, 180);
    }
    return sheet;
  } catch (e) {
    Logger.log('⚠ getDistCacheSheet_ エラー (' + year + '): ' + e);
    return null;
  }
}

/**
 * 指定年度・テスト名の得点分布（上位層・下位層割合）をキャッシュから取得する。
 * キャッシュがない場合は生スコアから計算してキャッシュに保存してから返す。
 * forceRecalc=true の場合は強制再計算してキャッシュを更新する。
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @param {Object} sigmaConfig 教科別σ設定（getGradeAnalysisSigmaConfig().sigma）
 * @param {boolean} forceRecalc true のとき強制再計算（上書き実行時）
 * @return {Object} 教科別分布オブジェクト（{kokugo:{count,highPct,lowPct}, ..., total:{...}}）
 */
function getOrBuildDistCache_(year, testName, sigmaConfig, forceRecalc) {
  var targetTest = String(testName).trim();
  var sheet = getDistCacheSheet_(year);

  // --- キャッシュ読み込み（forceRecalc=false のとき） ---
  if (!forceRecalc && sheet) {
    try {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === targetTest) {
            var cached = safeJsonParse_(String(rows[i][1]), null);
            if (cached) {
              return cached;
            }
          }
        }
      }
    } catch (e) {
      Logger.log('⚠ getOrBuildDistCache_ キャッシュ読み込みスキップ: ' + e);
    }
  }

  // --- キャッシュなし or 強制再計算 → 生スコアから計算 ---
  var distribution = {};
  try {
    // 学校平均を取得（閾値μ に使用）
    var pastSchoolAvg = null;
    try {
      var sr = getSchoolAverages(year, testName);
      if (sr.success && sr.averages) {
        var avgRow = sr.averages.filter(function(a) { return (a.schoolName || '').indexOf('平均') !== -1; })[0];
        if (avgRow) {
          pastSchoolAvg = {
            kokugo: avgRow.kokugo, shakai: avgRow.shakai, sugaku: avgRow.sugaku,
            rika: avgRow.rika, eigo: avgRow.eigo, total: avgRow.total
          };
        }
      }
    } catch (e) { /* 学校平均なしでも続行 */ }

    var slwg = getStudentListWithGrades(year, testName);
    if (slwg && slwg.success && Array.isArray(slwg.students)) {
      var scoredStudents = slwg.students.filter(function(s) { return s.hasGrade; });
      if (scoredStudents.length > 0) {
        var subjKeys = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];
        var maxScore = { kokugo: 100, shakai: 100, sugaku: 100, rika: 100, eigo: 100, total: 500 };
        subjKeys.forEach(function(subj) {
          var scores = scoredStudents
            .map(function(s) { return s[subj]; })
            .filter(function(v) { return v !== '' && v !== null && !isNaN(Number(v)); })
            .map(Number);
          if (scores.length === 0) return;
          var n = scores.length;
          var sigma = sigmaConfig[subj];
          var jukuSubjAvg = scores.reduce(function(a, b) { return a + b; }, 0) / n;
          var schoolSubjVal = pastSchoolAvg ? pastSchoolAvg[subj] : null;
          var refMean = (schoolSubjVal !== '' && schoolSubjVal !== null && schoolSubjVal !== undefined && !isNaN(Number(schoolSubjVal)))
            ? Number(schoolSubjVal) : jukuSubjAvg;
          var highThreshold = Math.min(Math.round((refMean + sigma) * 10) / 10, maxScore[subj]);
          var lowThreshold  = Math.max(Math.round((refMean - sigma) * 10) / 10, 0);
          var high = scores.filter(function(v) { return v >= highThreshold; }).length;
          var low  = scores.filter(function(v) { return v <  lowThreshold;  }).length;
          distribution[subj] = {
            count:   n,
            highPct: Math.round(high / n * 100),
            lowPct:  Math.round(low  / n * 100)
          };
        });
      }
    }
  } catch (e) {
    Logger.log('⚠ getOrBuildDistCache_ 計算エラー (' + year + '/' + targetTest + '): ' + e);
    return {};
  }

  // --- キャッシュに保存（シートが取得できない場合は保存スキップ） ---
  if (sheet && Object.keys(distribution).length > 0) {
    try {
      var distJson = JSON.stringify(distribution);
      var now = new Date().toISOString();
      var lastRow2 = sheet.getLastRow();
      var updated = false;
      if (lastRow2 >= 2) {
        var rows2 = sheet.getRange(2, 1, lastRow2 - 1, 1).getValues();
        for (var j = 0; j < rows2.length; j++) {
          if (String(rows2[j][0]).trim() === targetTest) {
            sheet.getRange(j + 2, 2, 1, 2).setValues([[distJson, now]]);
            updated = true;
            break;
          }
        }
      }
      if (!updated) sheet.appendRow([targetTest, distJson, now]);
    } catch (e) {
      Logger.log('⚠ getOrBuildDistCache_ キャッシュ保存スキップ: ' + e);
    }
  }

  return distribution;
}

/**
 * 指定年度・テスト名の成績データをAI（Gemini）で分析し、結果を保存して返す
 * 塾内平均・学校「平均」行のみをAIに渡し、過去3年分の推移データも含める
 * 第2回・第3回基礎学力テストは前回・前々回との比較も含める
 * @aiCallable
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @param {boolean} skipIfExists trueのとき、既存データがあれば生成をスキップして既存データを返す（省略時=false）
 * @return {Object} { success, analysis, generatedAt, skipped, error }
 */
function generateGradeAnalysis(year, testName, skipIfExists) {
  try {

    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) {
      return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };
    }

    var testNameTrimmed = String(testName).trim();

    // skipIfExists=true のとき、既存データがあれば生成をスキップして返す
    if (skipIfExists) {
      var existingCheck = getGradeAnalysis(year, testName);
      if (existingCheck.exists) {
        return { success: true, analysis: existingCheck.analysis, generatedAt: existingCheck.generatedAt, skipped: true };
      }
    }

    // --- 1. 当該年度の塾平均・学校平均を取得 ---
    var currentAvgs = getYearTestAvgs_(year, testName);
    var jukuAvg = currentAvgs.jukuAvg;
    var schoolAvg = currentAvgs.schoolAvg;
    if (!jukuAvg) {
      return { success: false, error: 'このテストの成績データがまだ登録されていません' };
    }

    // --- 2. 過去年度データを取得（最大10年分・古い順）＋分布キャッシュ ---
    // sigmaConfig を先にロードして過去年の分布計算に使用する
    var sigmaConfigEarly = getGradeAnalysisSigmaConfig().sigma;
    // skipIfExists=false（上書き）のとき過去年のキャッシュも強制再計算する
    var forceDistRecalc = !skipIfExists;
    var historicalYears = [];
    for (var dy = 10; dy >= 1; dy--) {
      var pastYear = year - dy;
      var pastAvgs = getYearTestAvgs_(pastYear, testName);
      if (pastAvgs.jukuAvg || pastAvgs.schoolAvg) {
        var pastDist = getOrBuildDistCache_(pastYear, testName, sigmaConfigEarly, forceDistRecalc);
        historicalYears.push({
          year: pastYear,
          jukuAvg: pastAvgs.jukuAvg,
          schoolAvg: pastAvgs.schoolAvg,
          distribution: pastDist
        });
      }
    }

    // --- 3. 基礎学力テスト前回・第1回データを取得 ---
    var prevRoundData = null;
    var firstRoundData = null;
    if (testNameTrimmed.indexOf('第2回基礎学力テスト') >= 0) {
      var r1Name = testNameTrimmed.replace('第2回', '第1回');
      var r1Avgs = getYearTestAvgs_(year, r1Name);
      if (r1Avgs.jukuAvg || r1Avgs.schoolAvg) {
        prevRoundData = { testName: r1Name, jukuAvg: r1Avgs.jukuAvg, schoolAvg: r1Avgs.schoolAvg };
      }
    } else if (testNameTrimmed.indexOf('第3回基礎学力テスト') >= 0) {
      var r2Name = testNameTrimmed.replace('第3回', '第2回');
      var r2Avgs = getYearTestAvgs_(year, r2Name);
      if (r2Avgs.jukuAvg || r2Avgs.schoolAvg) {
        prevRoundData = { testName: r2Name, jukuAvg: r2Avgs.jukuAvg, schoolAvg: r2Avgs.schoolAvg };
      }
      var r1NameFor3 = testNameTrimmed.replace('第3回', '第1回');
      var r1AvgsFor3 = getYearTestAvgs_(year, r1NameFor3);
      if (r1AvgsFor3.jukuAvg || r1AvgsFor3.schoolAvg) {
        firstRoundData = { testName: r1NameFor3, jukuAvg: r1AvgsFor3.jukuAvg, schoolAvg: r1AvgsFor3.schoolAvg };
      }
    }
    // ※ 1年・2年基礎学力テストは年1回のためラウンド比較なし

    // --- 4. 次回テストの過去データを取得（第1回→第2回、第2回→第3回の傾向予測用）---
    var nextRoundHistorical = [];
    var nextRoundName = null;
    if (testNameTrimmed.indexOf('第1回基礎学力テスト') >= 0) {
      nextRoundName = testNameTrimmed.replace('第1回', '第2回');
    } else if (testNameTrimmed.indexOf('第2回基礎学力テスト') >= 0) {
      nextRoundName = testNameTrimmed.replace('第2回', '第3回');
    }
    if (nextRoundName) {
      for (var ndy = 10; ndy >= 1; ndy--) {
        var nYear = year - ndy;
        var nAvgs = getYearTestAvgs_(nYear, nextRoundName);
        if (nAvgs.jukuAvg || nAvgs.schoolAvg) {
          nextRoundHistorical.push({ year: nYear, testName: nextRoundName, jukuAvg: nAvgs.jukuAvg, schoolAvg: nAvgs.schoolAvg });
        }
      }
    }

    // --- 5. schoolAvg の値を小数第1位に丸める（getSchoolAverages は丸めなしで返すため） ---
    if (schoolAvg) {
      var roundOne = function(v) {
        return (v === '' || v === null || v === undefined || isNaN(Number(v))) ? v : Math.round(Number(v) * 10) / 10;
      };
      schoolAvg = {
        kokugo: roundOne(schoolAvg.kokugo),
        shakai: roundOne(schoolAvg.shakai),
        sugaku: roundOne(schoolAvg.sugaku),
        rika:   roundOne(schoolAvg.rika),
        eigo:   roundOne(schoolAvg.eigo),
        total:  roundOne(schoolAvg.total)
      };
    }

    // --- 5. 学年別受験者数の内訳・得点分布を取得 ---
    var gradeBreakdown = [];
    var scoreDistribution = {};
    try {
      var gradeNameMap = getGradeConfig(); // {code: name} 例: {"13": "中1", "14": "中2", ...}
      var slwg = getStudentListWithGrades(year, testName);
      if (slwg && slwg.success && Array.isArray(slwg.students)) {
        var scoredStudents = slwg.students.filter(function(s) { return s.hasGrade; });

        // 学年別人数
        var gradeCount = {};
        scoredStudents.forEach(function(s) {
          var gc = String(s.grade || '');
          if (gc) { gradeCount[gc] = (gradeCount[gc] || 0) + 1; }
        });
        Object.keys(gradeCount).sort().forEach(function(gc) {
          gradeBreakdown.push({
            gradeCode: gc,
            gradeName: gradeNameMap[gc] || ('学年コード' + gc),
            count: gradeCount[gc]
          });
        });

        // 得点分布（教科別・合計：学校平均をμ・管理者設定のσを使って高得点層・低得点層を分類）
        var sigmaConfig = sigmaConfigEarly; // 上部でロード済みの sigmaConfig を再利用
        var subjKeys = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];
        var subjNames = { kokugo: '国語', shakai: '社会', sugaku: '数学', rika: '理科', eigo: '英語', total: '合計' };
        var maxScore  = { kokugo: 100, shakai: 100, sugaku: 100, rika: 100, eigo: 100, total: 500 };
        subjKeys.forEach(function(subj) {
          var scores = scoredStudents
            .map(function(s) { return s[subj]; })
            .filter(function(v) { return v !== '' && v !== null && !isNaN(Number(v)); })
            .map(Number);
          if (scores.length === 0) return;

          var n = scores.length;
          var sigma = sigmaConfig[subj];

          // 塾生平均（schoolAvg が未登録の場合のフォールバック用）
          var jukuSubjAvg = scores.reduce(function(a, b) { return a + b; }, 0) / n;

          // 基準平均μ：学校平均が登録済みならそれを使用、なければ塾生平均を代替
          var schoolSubjVal = schoolAvg ? schoolAvg[subj] : null;
          var refMean = (schoolSubjVal !== '' && schoolSubjVal !== null && schoolSubjVal !== undefined && !isNaN(Number(schoolSubjVal)))
            ? Number(schoolSubjVal)
            : jukuSubjAvg;

          // 動的閾値（μ ± σ）、[0, maxScore] にクランプ
          var highThreshold = Math.min(Math.round((refMean + sigma) * 10) / 10, maxScore[subj]);
          var lowThreshold  = Math.max(Math.round((refMean - sigma) * 10) / 10, 0);

          var high = scores.filter(function(v) { return v >= highThreshold; }).length;
          var low  = scores.filter(function(v) { return v <  lowThreshold;  }).length;

          scoreDistribution[subj] = {
            subject:        subjNames[subj],
            total:          n,
            refMean:        Math.round(refMean * 10) / 10,
            sigma:          sigma,
            highThreshold:  highThreshold,
            lowThreshold:   lowThreshold,
            highCount:      high,
            highPct:        Math.round(high / n * 100),
            lowCount:       low,
            lowPct:         Math.round(low / n * 100)
          };
        });
      }

      // 当該年度の分布もキャッシュに保存（常に最新データで更新）
      try {
        var currentDistForCache = {};
        Object.keys(scoreDistribution).forEach(function(subj) {
          var d = scoreDistribution[subj];
          currentDistForCache[subj] = { count: d.total, highPct: d.highPct, lowPct: d.lowPct };
        });
        getOrBuildDistCache_(year, testName, sigmaConfig, true);
      } catch (e) {
        Logger.log('⚠ 当該年度の分布キャッシュ保存スキップ: ' + e);
      }
    } catch (e) {
      Logger.log('⚠ 学年別・得点分布データ取得スキップ: ' + e);
    }

    // --- 6. Gemini API 呼び出し ---
    var dataContext = JSON.stringify({
      testName: testName,
      year: year,
      subjectMaxScore: 100,
      totalMaxScore: 500,
      hasSchoolAvg: !!schoolAvg,
      gradeBreakdown: gradeBreakdown,
      scoreDistribution: scoreDistribution,
      currentYear: { jukuAvg: jukuAvg, schoolAvg: schoolAvg },
      historicalYears: historicalYears,
      prevRoundData: prevRoundData,
      firstRoundData: firstRoundData,
      nextRoundHistorical: nextRoundHistorical
    });

    var prompt = 'あなたは個別指導塾「個別指導スクエア」の成績分析の専門家です。\n'
      + '以下の集計データを分析して、塾の講師・スタッフに向けた実用的な日本語コメントを生成してください。\n\n'
      + '【前提知識】\n'
      + '- 教科ごとの満点: 100点（5教科合計 500点満点）\n'
      + '- jukuAvg: スクエア全校舎の受験者を集計した教科別平均点。countが受験者数\n'
      + '- schoolAvg: 学校公表の平均点（通知表等の「平均」行）。hasSchoolAvg=falseなら未登録\n'
      + '- gradeBreakdown: このテストを受験した学年の内訳（例: [{gradeCode:"14",gradeName:"中2",count:8}]）\n'
      + '- scoreDistribution: 教科別・合計の得点分布。学校平均（未登録時は塾生平均）をμ、管理者設定のσを使い上位層の閾値=μ+σ・下位層の閾値=μ-σで分類。sigma=使用したσ、highThreshold/lowThreshold=実際の閾値点数、highCount/highPct=上位層の人数・割合、lowCount/lowPct=下位層の人数・割合。合計（total）は500点満点ベース\n'
      + '- historicalYears: 過去データ（古い順。存在する年度分すべて）。各エントリは jukuAvg, schoolAvg, distribution を持つ\n'
      + '  ・distribution: 過去年の得点分布キャッシュ。キー=教科/total, 値={count:受験者数, highPct:上位層%, lowPct:下位層%}\n'
      + '  ・上位層=μ+σ以上、下位層=μ-σ未満（μ=学校平均、σ=管理者設定値で年度ごとに一貫した基準）\n'
      + '  ・distributionが空オブジェクト{}の場合はデータなし（スキップして言及しないこと）\n'
      + '- prevRoundData: 前回テスト（第2回→第1回, 第3回→第2回）のデータ\n'
      + '- firstRoundData: 第1回テストのデータ（第3回分析時のみ）\n'
      + '- nextRoundHistorical: 次回テスト（第1回→第2回、第2回→第3回）の過去データ（古い順）。傾向予測に使用\n'
      + '- 教科値が空文字列（""）の場合はデータなしを意味する。diffの計算対象に含めず、コメントで「データなし」と明記すること\n\n';

    if (testNameTrimmed.indexOf('第3回基礎学力テスト') >= 0) {
      prompt += '⚠ 第3回基礎学力テストは高校入試まであとわずかという時期の最後のテストです。入試まであとわずかという状況を踏まえた総括的なコメントを「progression」に含めてください。\n\n';
    }

    prompt += '【成績データ】\n' + dataContext + '\n\n'
      + '【分析する内容】\n\n'
      + '1. overview（全体概要）\n'
      + '   - 受験者数（count）と塾平均の全体水準を述べる（2〜3文）\n'
      + '   - gradeBreakdownがある場合は受験学年の内訳も述べること（例: 「中2が8名、中3が12名」）\n'
      + '   - hasSchoolAvg=trueなら塾平均と学校平均の総合的な差にも言及する\n'
      + '   - countが10名未満の場合は「少人数（n名）のため参考値」と必ず注記すること\n\n'
      + '2. subjectAnalysis（教科別分析）5教科分\n'
      + '   - jukuAvg: currentYear.jukuAvgの該当教科の値をそのまま入れる\n'
      + '   - schoolAvg: hasSchoolAvg=trueなら該当教科の値、falseなら null\n'
      + '   - diff: hasSchoolAvg=trueなら jukuAvg - schoolAvg の値（正=塾が上回る）、falseなら null\n'
      + '   - comment:\n'
      + '     ・hasSchoolAvg=trueの場合: 「塾平均○点、学校平均○点（差: ±○点）」と数値を引用して傾向を述べる\n'
      + '     ・hasSchoolAvg=falseの場合: 「塾平均○点（学校平均データ未登録）」と明記し塾平均の傾向のみ述べる\n'
      + '     ・scoreDistributionのその教科データがある場合: 上位層（highThreshold点以上）と下位層（lowThreshold点未満）の割合にも言及すること\n'
      + '       閾値は学校平均±標準偏差で動的に設定されているため、テスト難易度を加味した分類になっている\n'
      + '       例: 「上位層（○点以上）が全体の35%いる一方、下位層（○点未満）も20%おり二極化が見られる」\n'
      + '       二極化が顕著（両層が共に高い）・上位層に偏る・下位層に偏るなどパターンを読み取って言及すること\n'
      + '   - trend: historicalYearsの直近1年と今年度の該当教科jukuAvgを比較した方向性\n'
      + '     ・今年度 > 前年度なら "up"、今年度 < 前年度なら "down"、差が1点未満または前年度データなしなら "stable"\n'
      + '   - roundDifficulty: prevRoundDataがある場合にその教科の学校平均の変化から易化・難化を判定\n'
      + '     ・変化量・他教科との整合性・全体傾向を踏まえた総合的な判断（単純な数値しきい値は使わない）\n'
      + '     ・prevRoundDataなし、またはどちらかのschoolAvgがnullなら "null"（文字列）\n'
      + '     ・それ以外は "easier"/"harder"/"same" のいずれか\n\n'
      + '3. historicalTrend（過去推移）\n'
      + '   - historicalYearsがある場合に塾平均の複数年変化を記述（2〜3文）\n'
      + '   - 学校平均データがある年は、その変化から年度ごとのテスト難化・易化傾向にも言及する\n'
      + '   - distributionが存在する年が複数ある場合、上位層割合・下位層割合の推移にも言及する（例:「上位層は例年XX%前後だが今年はXX%と増加傾向」）\n'
      + '   - データなしまたは特筆すべき変化がないなら空文字列\n\n'
      + '4. yearOverYearComparison（前年度比較）\n'
      + '   - historicalYearsの直近1年と今年度を比較（塾平均・学校平均それぞれ）\n'
      + '   - 学校平均の変化から今年度テストの難化・易化を教科別・合計点で判定して述べること\n'
      + '   - 過去複数年のデータと照らし合わせて「例年通り」「例年より難化」「例年より易化」など総括すること\n'
      + '   - 前年のdistributionがある場合、今年のscoreDistributionと比較し、上位層・下位層割合の変化を教科別・合計で述べること\n'
      + '     （例:「数学の上位層は昨年XX%→今年XX%と増加。下位層はXX%→XX%と横ばい」）\n'
      + '   - データなしなら空文字列\n\n'
      + '5. roundComparison（前回比較）\n'
      + '   - prevRoundDataがある場合に前回テストとの比較（3〜5文）\n'
      + '   - 学校平均の変化から試験の易化・難化を教科別・合計点で判定して言及すること\n'
      + '   - 塾平均と学校平均の相対的な変化も述べること（例: 学校平均が5点上がり塾平均が3点上がったため相対的に若干下落）\n'
      + '   - なければ空文字列\n\n'
      + '6. progression（推移総評）\n'
      + '   - firstRoundDataがある場合（第3回のみ）第1回〜第3回の各教科・合計点の推移と入試前の総括（3〜4文）\n'
      + '   - なければ空文字列\n\n'
      + '7. nextRoundPrediction（次回テスト難易度予測）\n'
      + '   - nextRoundHistoricalが空でない場合のみ生成\n'
      + '   - historicalYears（今回テストの過去データ）とnextRoundHistorical（次回テストの過去データ）を年度ごとに対比し、\n'
      + '     教科別・合計点で「今回テスト→次回テストでどう変化する傾向があるか」を分析（2〜4文）\n'
      + '   - 一貫して難化・易化する傾向がある教科や合計点があれば具体的に挙げること\n'
      + '   - データ年数が3年未満の場合は「参考値（データ年数が少ないため精度は低い）」と必ず注記すること\n'
      + '   - 過去パターンに基づく予測であり実際の試験が異なる可能性があることを断り書きとして添えること\n'
      + '   - なければ空文字列\n\n'
      + '【応答形式】以下のJSON形式のみで返してください：\n'
      + '{\n'
      + '  "overview": "全体概要のコメント",\n'
      + '  "subjectAnalysis": [\n'
      + '    {"subject": "国語", "jukuAvg": 数値, "schoolAvg": 数値またはnull, "diff": 数値またはnull, "comment": "コメント", "trend": "up/down/stable", "roundDifficulty": "easier/harder/same/null"},\n'
      + '    {"subject": "社会", ...}, {"subject": "数学", ...}, {"subject": "理科", ...}, {"subject": "英語", ...}\n'
      + '  ],\n'
      + '  "historicalTrend": "推移コメント（変化なしなら空文字列）",\n'
      + '  "yearOverYearComparison": "前年度比較コメント（データなしなら空文字列）",\n'
      + '  "roundComparison": "前回テスト比較コメント（なしなら空文字列）",\n'
      + '  "progression": "第1〜3回推移・総評（なしなら空文字列）",\n'
      + '  "nextRoundPrediction": "次回テスト難易度予測（なしなら空文字列）"\n'
      + '}\n'
      + '- コメント文中で数値（平均点・差分など）を記載する際は必ず小数第1位まで表記すること（例: 5点→5.0点、53.13点→53.1点）\n'
      + '- diffフィールドも小数第1位に四捨五入して入れること（例: 0.8000000000000007→0.8）\n'
      + '- 文体は丁寧語で簡潔にまとめること。\n';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json'
      }
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = fetchGeminiWithRetry_(url, options);
    if (response.getResponseCode() !== 200) {
      return { success: false, error: parseGeminiErrorMessage_(response) };
    }

    var result = JSON.parse(response.getContentText());
    if (result.usageMetadata) logGeminiUsage('成績AI分析', result.usageMetadata);

    // 出力トークン上限チェック
    var finishReason = ((result.candidates || [])[0] || {}).finishReason;
    if (finishReason === 'MAX_TOKENS') {
      Logger.log('⚠ generateGradeAnalysis: 出力トークン上限に達しました (MAX_TOKENS)');
      return { success: false, error: 'AIの出力が長すぎて途中で切れました。しばらくしてから再度お試しください。' };
    }

    // thinking部分を除外して実際の応答テキストを取得
    var parts = (result.candidates[0].content.parts || []);
    var textPart = parts.filter(function(p) { return !p.thought; }).pop();
    var rawText = textPart ? (textPart.text || '') : '';
    var cleanedText = rawText.replace(/```+json[\r\n]*/gi, '').replace(/```+[\r\n]*/g, '').trim();
    var jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];

    var analysis;
    try {
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      Logger.log('❌ 分析結果のパースエラー: ' + parseError + ' / rawText: ' + rawText.substring(0, 300));
      return { success: false, error: 'AIからの分析結果の解析に失敗しました。もう一度お試しください。' };
    }

    // scoreDistribution を analysis に付加して保存（フロントで上位層・下位層の視覚表示に使用）
    analysis.scoreDistribution = scoreDistribution;

    // --- 6. 保存 (upsert) ---
    var now = new Date().toISOString();
    var sheet = getAnalysisSheet(year);
    if (sheet) {
      var lastRow = sheet.getLastRow();
      var targetTest = String(testName).trim();
      var existingRow = -1;

      if (lastRow >= 2) {
        var rows = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === targetTest) {
            existingRow = i + 2;
            break;
          }
        }
      }

      var rowValues = [testName, JSON.stringify(analysis), now];
      if (existingRow > 0) {
        sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    }

    return { success: true, analysis: analysis, generatedAt: now };
  } catch (error) {
    Logger.log('❌ generateGradeAnalysisエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【生徒別AI分析】偏差値計算・合格判定・一括生成・取得
// ========================================

/**
 * 偏差値を計算する（50 + 10 × (得点 - 平均) / σ）
 * @param {number} score 生徒の得点
 * @param {number} average 学校平均
 * @param {number} sigma 標準偏差
 * @return {number|null} 偏差値（小数第1位）、計算不能ならnull
 */
function calcDeviationValue_(score, average, sigma) {
  if (sigma <= 0 || average === '' || average === null || average === undefined || isNaN(Number(average))) return null;
  if (score === '' || score === null || score === undefined || isNaN(Number(score))) return null;
  return Math.round((50 + 10 * (Number(score) - Number(average)) / sigma) * 10) / 10;
}

/**
 * 正規分布の累積分布関数（近似）
 * @param {number} z z値
 * @return {number} 確率 (0-1)
 */
function normalCDF_(z) {
  var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  var p = 0.3275911;
  var sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);
  var t = 1.0 / (1.0 + p * z);
  var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);
  return 0.5 * (1.0 + sign * y);
}

/**
 * 合格可能性を計算する（A〜E判定 + パーセント）
 * 生徒偏差値と志望校偏差値の差をz値に変換し、正規分布で確率算出
 * @param {number} studentDev 生徒の偏差値（合計）
 * @param {number} schoolDev 志望校の偏差値
 * @return {Object|null} { grade: 'A'-'E', percent: 0-100 }
 */
function calcPassProbability_(studentDev, schoolDev) {
  if (studentDev === null || schoolDev === null || isNaN(studentDev) || isNaN(schoolDev)) return null;
  var diff = studentDev - schoolDev;
  var z = diff / 5;
  var prob = Math.round(normalCDF_(z) * 100);
  prob = Math.max(1, Math.min(99, prob));
  var grade;
  if      (prob >= 80) grade = 'A';
  else if (prob >= 60) grade = 'B';
  else if (prob >= 50) grade = 'C+';
  else if (prob >= 40) grade = 'C-';
  else if (prob >= 30) grade = 'D+';
  else if (prob >= 20) grade = 'D-';
  else                 grade = 'E';
  return { grade: grade, percent: prob };
}

/**
 * 生徒別AI分析シートを取得または作成する
 * @param {number} year 年度
 * @return {Sheet|null} シートオブジェクト
 */
function getStudentAnalysisSheet_(year) {
  try {
    var ss = getGradeDataSheet(year);
    if (!ss) return null;

    var sheetName = '生徒別AI分析';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      var headers = ['生徒ID', 'テスト名', '分析データJSON', '生成日時'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 130);
      sheet.setColumnWidth(2, 180);
      sheet.setColumnWidth(3, 800);
      sheet.setColumnWidth(4, 180);
    }
    return sheet;
  } catch (error) {
    Logger.log('❌ getStudentAnalysisSheet_エラー: ' + error);
    return null;
  }
}

/**
 * 生徒別AI分析コメントを取得する（成績表タブ用）
 * @aiCallable
 * @param {number} year 年度
 * @param {string} studentId 生徒ID
 * @param {string} testName 選択されたテスト名（累積判定のキーとして使用）
 * @return {Object} { success, exists, analysis, generatedAt }
 */
function getStudentAnalysis(year, studentId, testName) {
  try {
    var sheet = getStudentAnalysisSheet_(year);
    if (!sheet) return { success: true, exists: false };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, exists: false };

    var rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    var targetId = String(studentId).trim();
    var targetTest = String(testName).trim();

    for (var i = 0; i < rows.length; i++) {
      // Sheets が数値自動変換で先頭ゼロを消す問題に対応（padStart で復元）
      var sheetStudentId = String(rows[i][0] || '').trim();
      if (/^\d+$/.test(sheetStudentId) && sheetStudentId.length < 10) {
        sheetStudentId = sheetStudentId.padStart(10, '0');
      }
      if (sheetStudentId === targetId && String(rows[i][1]).trim() === targetTest) {
        var analysisData = JSON.parse(rows[i][2]);
        return { success: true, exists: true, analysis: analysisData, generatedAt: rows[i][3] };
      }
    }
    // 基礎学力テストの特例：完全一致がない場合、N回以上のデータにフォールバック
    var basicMatch = targetTest.match(/^第(\d+)回基礎学力テスト$/);
    if (basicMatch) {
      var targetNum = parseInt(basicMatch[1], 10);
      var bestRow = null;
      var bestNum = -1;
      for (var j = 0; j < rows.length; j++) {
        var sid = String(rows[j][0] || '').trim();
        if (/^\d+$/.test(sid) && sid.length < 10) sid = sid.padStart(10, '0');
        if (sid !== targetId) continue;
        var rowTestName = String(rows[j][1]).trim();
        var rowMatch = rowTestName.match(/^第(\d+)回基礎学力テスト$/);
        if (!rowMatch) continue;
        var rowNum = parseInt(rowMatch[1], 10);
        if (rowNum >= targetNum && rowNum > bestNum) {
          bestNum = rowNum;
          bestRow = rows[j];
        }
      }
      if (bestRow) {
        var fbData = JSON.parse(bestRow[2]);
        return { success: true, exists: true, analysis: fbData, generatedAt: bestRow[3] };
      }
    }

    return { success: true, exists: false };
  } catch (error) {
    Logger.log('❌ getStudentAnalysisエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 管理者用：指定年度・テスト名の全対象生徒のAI分析を一括生成する
 * 基礎学力テストの場合は累積データ（第1回〜選択回）をすべてAIに渡す
 * @param {number} year 年度
 * @param {string} testName テスト名
 * @return {Object} { success, count, message, error }
 */
function generateStudentAnalyses(year, testName) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };


    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません' };

    var testNameTrimmed = String(testName).trim();

    // --- 1. 表示テスト名の決定（累積ロジック） ---
    var displayTestNames = [testNameTrimmed];
    var match = testNameTrimmed.match(/^第(\d+)回基礎学力テスト$/);
    if (match) {
      var selectedNum = parseInt(match[1], 10);
      displayTestNames = [];
      for (var n = 1; n <= selectedNum; n++) {
        displayTestNames.push('第' + n + '回基礎学力テスト');
      }
    }

    // --- 2. 成績データ取得 ---
    var allGrades = getDataSheetData(year);
    var masterData = getMasterData(year);
    var sigmaResult = getGradeAnalysisSigmaConfig();
    var sigma = sigmaResult.sigma;
    var schoolConfig = getSchoolConfig();

    // 学校平均を各テストで取得（学校名に「平均」が含まれる行のみ）
    var schoolAvgMap = {};
    displayTestNames.forEach(function(tn) {
      var avgResult = getSchoolAverages(year, tn);
      if (avgResult.success) {
        var avgRow = (avgResult.averages || []).filter(function(a) {
          return (a.schoolName || '').trim().indexOf('平均') !== -1;
        })[0];
        if (avgRow) schoolAvgMap[tn] = avgRow;
      }
    });

    // 選択テストの成績がある生徒IDを収集
    var studentIdsWithGrade = {};
    allGrades.forEach(function(row) {
      if (String(row.testName || '').trim() === testNameTrimmed) {
        studentIdsWithGrade[String(row.studentId)] = true;
      }
    });

    // 対象生徒をフィルタ
    var targetStudents = masterData.filter(function(s) {
      return studentIdsWithGrade[String(s.studentId)];
    });

    if (targetStudents.length === 0) {
      return { success: false, error: 'このテストの成績データがある生徒がいません' };
    }

    // --- 3. 生徒ごとのデータを構築 ---
    var studentsData = [];
    var subjKeys = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];

    // 志望校名→設定マップ
    var schoolDeviationMap = {};
    schoolConfig.forEach(function(sc) {
      var deptMap = {};
      (sc.departments || []).forEach(function(d) { deptMap[d.name] = d.deviation; });
      schoolDeviationMap[sc.name] = deptMap;
    });

    targetStudents.forEach(function(student) {
      var sid = String(student.studentId);
      var studentSchool = (student.schoolName || '').trim();

      // テストごとの成績
      var testsObj = {};
      var deviationObj = {};
      displayTestNames.forEach(function(tn) {
        var grade = null;
        allGrades.forEach(function(row) {
          if (String(row.studentId) === sid && String(row.testName || '').trim() === tn) {
            grade = row;
          }
        });
        if (grade) {
          testsObj[tn] = {
            kokugo: grade.kokugo, shakai: grade.shakai, sugaku: grade.sugaku,
            rika: grade.rika, eigo: grade.eigo, total: grade.total
          };

          // 偏差値計算（学校平均がある場合）
          var schoolAvg = schoolAvgMap[tn] || null;
          if (schoolAvg) {
            var devs = {};
            subjKeys.forEach(function(subj) {
              devs[subj] = calcDeviationValue_(grade[subj], schoolAvg[subj], sigma[subj]);
            });
            deviationObj[tn] = devs;
          }
        }
      });

      // 志望校の合格判定
      var passAssessment = [];
      var latestGrade = null;
      for (var t = displayTestNames.length - 1; t >= 0; t--) {
        if (testsObj[displayTestNames[t]]) { latestGrade = allGrades.filter(function(r) { return String(r.studentId) === sid && String(r.testName || '').trim() === displayTestNames[t]; })[0]; break; }
      }
      if (latestGrade) {
        var targets = [
          { name: latestGrade.shogaku1, dept: latestGrade.shogaku1_gakka },
          { name: latestGrade.shogaku2, dept: latestGrade.shogaku2_gakka }
        ];

        // 累積平均スコアと累積学校平均（生徒がデータを持つ回のみ）で偏差値を計算
        var cumScores = [];
        var cumSchoolAvgTotals = [];
        displayTestNames.forEach(function(tn) {
          if (testsObj[tn] && testsObj[tn].total != null) {
            cumScores.push(testsObj[tn].total);
            if (schoolAvgMap[tn] && schoolAvgMap[tn].total != null) {
              cumSchoolAvgTotals.push(schoolAvgMap[tn].total);
            }
          }
        });
        var cumStudentAvg = cumScores.length > 0
          ? cumScores.reduce(function(a, b) { return a + b; }, 0) / cumScores.length : null;
        var cumSchoolAvg = cumSchoolAvgTotals.length > 0
          ? cumSchoolAvgTotals.reduce(function(a, b) { return a + b; }, 0) / cumSchoolAvgTotals.length : null;
        var cumulativeTotalDev = calcDeviationValue_(cumStudentAvg, cumSchoolAvg, sigma.total);

        targets.forEach(function(tgt) {
          if (!tgt.name) return;
          var deptMap = schoolDeviationMap[tgt.name];
          var schoolDev = null;
          if (deptMap && tgt.dept && deptMap[tgt.dept] !== undefined) {
            schoolDev = deptMap[tgt.dept];
          } else if (deptMap) {
            var keys = Object.keys(deptMap);
            if (keys.length > 0 && deptMap[keys[0]] !== null) schoolDev = deptMap[keys[0]];
          }
          var passProbability = calcPassProbability_(cumulativeTotalDev, schoolDev);
          passAssessment.push({
            schoolName: tgt.name,
            department: tgt.dept || '',
            schoolDeviation: schoolDev,
            studentDeviation: cumulativeTotalDev,
            probability: passProbability
          });
        });
      }

      // 学校平均（「平均」行）
      var studentSchoolAvgs = {};
      displayTestNames.forEach(function(tn) {
        if (schoolAvgMap[tn]) {
          var avg = schoolAvgMap[tn];
          studentSchoolAvgs[tn] = {
            kokugo: avg.kokugo, shakai: avg.shakai, sugaku: avg.sugaku,
            rika: avg.rika, eigo: avg.eigo, total: avg.total
          };
        }
      });

      studentsData.push({
        id: sid,
        tests: testsObj,
        deviationValues: deviationObj,
        passAssessment: passAssessment,
        schoolAverages: studentSchoolAvgs
      });
    });

    // --- 4. Gemini API 呼び出し ---
    var dataContext = JSON.stringify({
      testName: testNameTrimmed,
      displayTestNames: displayTestNames,
      year: year,
      subjectMaxScore: 100,
      totalMaxScore: 500,
      studentCount: studentsData.length,
      students: studentsData
    });

    var prompt = 'あなたは個別指導塾「個別指導スクエア」の成績分析の専門家です。\n'
      + '以下の生徒データを分析して、各生徒の個別コメントをJSON形式で返してください。\n\n'
      + '【前提知識】\n'
      + '- 教科ごとの満点: 100点（5教科合計 500点満点）\n'
      + '- deviationValues: 教科別偏差値（学校平均とσから算出。50が平均。nullはデータ不足）\n'
      + '- passAssessment: 志望校合格判定（probability.gradeがA〜E、percentが確率%。schoolDeviationが志望校偏差値）\n'
      + '- schoolAverages: 生徒の在籍校の推定平均点。必ず「およそ〇点」と表現すること（実際の学校平均と異なる場合があるため）\n'
      + '- 複数テストがある場合、schoolAveragesの各テスト間の変化から教科ごとの易化・難化を判定できる\n'
      + '  （前テストより学校平均が3点以上上がれば易化、3点以上下がれば難化、それ以外はsame）\n'
      + '- テストが複数ある場合はdisplayTestNamesの順で推移を分析すること\n'
      + '- 生徒IDで回答すること（氏名は渡していない）\n\n';
    if (testNameTrimmed.indexOf('第3回基礎学力テスト') !== -1) {
      prompt += '⚠ 第3回基礎学力テストは高校入試まであとわずかという時期の最後のテストです。\nあなたは経験豊富な個別指導塾の講師として、以下の点を各フィールドに必ず反映してください：\n・overall: 合計点・偏差値から「このまま入試に臨んで大丈夫か」を率直に伝え、問題がある場合は残りわずかな時間で優先して取り組むべきことを具体的に記載すること\n・subjects: 第1〜3回の得点推移も踏まえ、各教科で入試直前に何の学習に集中すべきかの実践的なアドバイスを含めること。学校平均を下回っている教科は苦手単元の復習・基本問題の確認など具体的な内容にすること\n・trend: 第1〜3回の変化を総括し、入試に向けた最終確認ポイントを含めること\n・targetSchool【重要・後述の共通指示より優先】: 第3回は最後の基礎学力テストであり次は高校入試本番である。A/B/C+判定: 入試本番に向けて弱点を一つずつ確実に潰していけるよう背中を押す前向きなアドバイス。C-/D+/D-/E判定（合格可能性50%未満）: 入試に向けて残り時間で弱点克服に集中することを前向きに伝えつつ、今すぐ担任の先生に相談・私立高校の併願を具体的に検討するよう促すこと\n\n';
    } else if (testNameTrimmed.indexOf('基礎学力テスト') !== -1) {
      prompt += '⚠ このテストは基礎学力テスト（第1回または第2回）です。targetSchoolについては後述の共通指示より以下を優先すること。\n・targetSchool - A/B/C+判定: 現在の到達度を前向きに伝え、次回の基礎学力テストでさらに合格可能性を高めるために強化すべき点を具体的に示すこと\n・targetSchool - C-/D+/D-/E判定（合格可能性50%未満）: 合格可能性が厳しいことは率直に伝えた上で、次の基礎学力テストで巻き返せるよう今から集中すべき教科・単元を具体的に示し前向きな意欲を引き出すこと。担任の先生とも情報共有・相談を始め、私立高校の情報収集も今から始めておくよう促すこと\n\n';
    }
    prompt += '【生徒データ】\n' + dataContext + '\n\n'
      + '【分析する内容（各生徒について）】\n'
      + '1. overall（総合評価）: 全体的な成績水準と傾向を2〜3文。偏差値・合計点・学校平均合計（「およそ〇点」）に言及しつつ、単なる数値比較にとどまらず「この生徒の成績の特徴は何か（得意教科集中型か均一型か）」「どこを伸ばせるか・何が課題か」を塾講師目線で述べること\n'
      + '2. subjects（教科別分析）: 各教科の強み・弱みを1〜2文ずつ。学校平均（「およそ〇点」）との比較は必ず含めるが、それだけで終わらず、各教科の特性（国語:読解・記述、社会:暗記・地歴公民バランス、数学:計算・文章題・図形、理科:暗記と計算の比率、英語:語彙・文法・読解）を踏まえた具体的な学習アドバイスも添えること\n'
      + '   キー: kokugo, shakai, sugaku, rika, eigo\n'
      + '3. subjectDifficulty（教科別難易度変化）: 複数テスト時のみ、前テスト比の学校平均変化から難易度変化を返す\n'
      + '   キー: kokugo, shakai, sugaku, rika, eigo → 値: "harder"（難化）/ "easier"（易化）/ "same"（変化なし）\n'
      + '   1テストのみの場合は空オブジェクト {}\n'
      + '4. targetSchool（志望校分析）: 志望校に対する現在の到達度と具体的なアドバイスを2〜3文。\n'
      + '   ・C-判定・D+判定・D-判定・E判定（合格可能性50%未満）の生徒: 現状の合格可能性が厳しいことを率直に伝え、今後の学習で取り組むべき点を具体的にアドバイスすること\n'
      + '   ・passAssessmentが空の場合は「志望校が未設定です」とだけ記載\n'
      + '5. trend（推移分析）: 複数テストがある場合の変化。伸びた・落ちた教科を具体的に記載し、学校平均の推移から各テストの易化・難化にも言及。1テストのみなら空文字列\n\n'
      + '【応答形式】以下のJSON形式のみで返してください：\n'
      + '{\n'
      + '  "students": {\n'
      + '    "生徒ID": {\n'
      + '      "overall": "総合評価テキスト（学校平均合計との比較含む）",\n'
      + '      "subjects": { "kokugo": "国語分析（学校平均との比較含む）", "shakai": "...", "sugaku": "...", "rika": "...", "eigo": "..." },\n'
      + '      "subjectDifficulty": { "kokugo": "harder/easier/same", "shakai": "...", "sugaku": "...", "rika": "...", "eigo": "..." },\n'
      + '      "targetSchool": "志望校分析テキスト",\n'
      + '      "trend": "推移分析テキスト（易化・難化への言及含む。1テストのみなら空文字列）"\n'
      + '    }\n'
      + '  }\n'
      + '}\n'
      + '- 数値を記載する際は小数第1位まで表記すること\n'
      + '- 文体は丁寧語で簡潔にまとめること\n';

    var dynamicMaxTokens = Math.min(65536, Math.max(8000, studentsData.length * 1000 + 4000));
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: dynamicMaxTokens,
        responseMimeType: 'application/json'
      }
    };
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = fetchGeminiWithRetry_(url, options);
    if (response.getResponseCode() !== 200) {
      return { success: false, error: parseGeminiErrorMessage_(response) };
    }

    var result = JSON.parse(response.getContentText());
    if (result.usageMetadata) logGeminiUsage('生徒別AI分析', result.usageMetadata);

    // 出力トークン上限チェック
    var finishReason = ((result.candidates || [])[0] || {}).finishReason;
    if (finishReason === 'MAX_TOKENS') {
      Logger.log('⚠ generateStudentAnalyses: 出力トークン上限に達しました (MAX_TOKENS)');
      return { success: false, error: 'AIの出力が長すぎて途中で切れました。しばらくしてから再度お試しください。' };
    }

    var parts = (result.candidates[0].content.parts || []);
    var textPart = parts.filter(function(p) { return !p.thought; }).pop();
    var rawText = textPart ? (textPart.text || '') : '';
    var cleanedText = rawText.replace(/```+json[\r\n]*/gi, '').replace(/```+[\r\n]*/g, '').trim();
    var jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanedText = jsonMatch[0];

    var aiResult;
    try {
      aiResult = JSON.parse(cleanedText);
    } catch (parseError) {
      Logger.log('❌ 生徒別分析パースエラー: ' + parseError + ' / rawText: ' + rawText.substring(0, 500));
      return { success: false, error: 'AIからの分析結果の解析に失敗しました。もう一度お試しください。' };
    }

    if (!aiResult.students) {
      return { success: false, error: 'AIの応答形式が不正です' };
    }

    // --- 5. シートに保存 ---
    var sheet = getStudentAnalysisSheet_(year);
    if (!sheet) return { success: false, error: 'AI分析シートの作成に失敗しました' };

    var now = new Date().toISOString();
    var savedCount = 0;

    // 既存データを一括読み込み（Sheets の数値変換で消えた先頭ゼロを padStart で復元）
    var existingMap = {};
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var existingRows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var i = 0; i < existingRows.length; i++) {
        var eid = String(existingRows[i][0] || '').trim();
        if (/^\d+$/.test(eid) && eid.length < 10) eid = eid.padStart(10, '0');
        var key = eid + '|' + String(existingRows[i][1]).trim();
        existingMap[key] = i + 2;
      }
    }

    studentsData.forEach(function(sd) {
      var aiComment = aiResult.students[sd.id];
      if (!aiComment) return;

      var analysisData = {
        comment: aiComment,
        deviationValues: sd.deviationValues,
        passAssessment: sd.passAssessment,
        displayTestNames: displayTestNames
      };

      var rowValues = [sd.id, testNameTrimmed, JSON.stringify(analysisData), now];
      var existingKey = sd.id + '|' + testNameTrimmed;

      if (existingMap[existingKey]) {
        sheet.getRange(existingMap[existingKey], 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
      savedCount++;
    });

    return { success: true, count: savedCount, message: savedCount + '人の生徒分析を生成しました' };
  } catch (error) {
    Logger.log('❌ generateStudentAnalysesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 生徒データのサブセットに対してAI分析コメントを生成する内部ヘルパー（バッチ処理用）
 * generateAllAnalyses のバッチ分岐から呼ばれる。保存は行わず結果のみ返す。
 * @param {Array} batchStudents studentsData の部分配列（最大80人）
 * @param {string} testNameTrimmed テスト名（trim済み）
 * @param {Array} displayTestNames 表示テスト名リスト
 * @param {string} apiKey Gemini APIキー
 * @return {Object} { success, analyses: {"生徒ID": commentObject} } または { success: false, error }
 */
function generateStudentAnalysesBatch_(batchStudents, testNameTrimmed, displayTestNames, apiKey) {
  var dataContext = JSON.stringify({
    testName: testNameTrimmed,
    displayTestNames: displayTestNames,
    subjectMaxScore: 100,
    totalMaxScore: 500,
    studentCount: batchStudents.length,
    students: batchStudents
  });

  var prompt = 'あなたは個別指導塾「個別指導スクエア」の成績分析の専門家です。\n'
    + '以下の生徒データを分析して、各生徒の個別コメントをJSON形式で返してください。\n\n'
    + '【前提知識】\n'
    + '- 教科ごとの満点: 100点（5教科合計 500点満点）\n'
    + '- deviationValues: 教科別偏差値（学校平均とσから算出。50が平均。nullはデータ不足）\n'
    + '- passAssessment: 志望校合格判定（probability.gradeがA〜E、percentが確率%）\n'
    + '- schoolAverages: 生徒の在籍校の推定平均点。必ず「およそ〇点」と表現すること（実際の学校平均と異なる場合があるため）\n'
    + '- 複数テストがある場合、schoolAveragesの各テスト間の変化から教科ごとの易化・難化を判定できる\n'
    + '  （前テストより学校平均が3点以上上がれば易化、3点以上下がれば難化、それ以外はsame）\n'
    + '- テストが複数ある場合はdisplayTestNamesの順で推移を分析すること\n'
    + '- 生徒IDで回答すること（氏名は渡していない）\n\n';
  if (testNameTrimmed.indexOf('第3回基礎学力テスト') !== -1) {
    prompt += '⚠ 第3回基礎学力テストは高校入試まであとわずかという時期の最後のテストです。\nあなたは経験豊富な個別指導塾の講師として、以下の点を各フィールドに必ず反映してください：\n・overall: 合計点・偏差値から「このまま入試に臨んで大丈夫か」を率直に伝え、問題がある場合は残りわずかな時間で優先して取り組むべきことを具体的に記載すること\n・subjects: 第1〜3回の得点推移も踏まえ、各教科で入試直前に何の学習に集中すべきかの実践的なアドバイスを含めること。学校平均を下回っている教科は苦手単元の復習・基本問題の確認など具体的な内容にすること\n・trend: 第1〜3回の変化を総括し、入試に向けた最終確認ポイントを含めること\n・targetSchool【重要・後述の共通指示より優先】: 第3回は最後の基礎学力テストであり次は高校入試本番である。A/B/C+判定: 入試本番に向けて弱点を一つずつ確実に潰していけるよう背中を押す前向きなアドバイス。C-/D+/D-/E判定（合格可能性50%未満）: 入試に向けて残り時間で弱点克服に集中することを前向きに伝えつつ、今すぐ担任の先生に相談・私立高校の併願を具体的に検討するよう促すこと\n\n';
  } else if (testNameTrimmed.indexOf('基礎学力テスト') !== -1) {
    prompt += '⚠ このテストは基礎学力テスト（第1回または第2回）です。targetSchoolについては後述の共通指示より以下を優先すること。\n・targetSchool - A/B/C+判定: 現在の到達度を前向きに伝え、次回の基礎学力テストでさらに合格可能性を高めるために強化すべき点を具体的に示すこと\n・targetSchool - C-/D+/D-/E判定（合格可能性50%未満）: 合格可能性が厳しいことは率直に伝えた上で、次の基礎学力テストで巻き返せるよう今から集中すべき教科・単元を具体的に示し前向きな意欲を引き出すこと。担任の先生とも情報共有・相談を始め、私立高校の情報収集も今から始めておくよう促すこと\n\n';
  }
  prompt += '【生徒データ】\n' + dataContext + '\n\n'
    + '【分析する内容（各生徒について）】\n'
    + '1. overall（総合評価）: 全体的な成績水準と傾向を2〜3文。偏差値・合計点・学校平均合計（「およそ〇点」）に言及しつつ、単なる数値比較にとどまらず「この生徒の成績の特徴は何か（得意教科集中型か均一型か）」「どこを伸ばせるか・何が課題か」を塾講師目線で述べること\n'
    + '2. subjects（教科別分析）: 各教科の強み・弱みを1〜2文ずつ。学校平均（「およそ〇点」）との比較は必ず含めるが、それだけで終わらず、各教科の特性（国語:読解・記述、社会:暗記・地歴公民バランス、数学:計算・文章題・図形、理科:暗記と計算の比率、英語:語彙・文法・読解）を踏まえた具体的な学習アドバイスも添えること\n'
    + '   キー: kokugo, shakai, sugaku, rika, eigo\n'
    + '3. subjectDifficulty（教科別難易度変化）: 複数テスト時のみ、前テスト比の学校平均変化から難易度変化を返す\n'
    + '   キー: kokugo, shakai, sugaku, rika, eigo → 値: "harder"（難化）/ "easier"（易化）/ "same"（変化なし）\n'
    + '   1テストのみの場合は空オブジェクト {}\n'
    + '4. targetSchool（志望校分析）: 志望校に対する現在の到達度と具体的なアドバイスを2〜3文。\n'
    + '   ・C-判定・D+判定・D-判定・E判定（合格可能性50%未満）の生徒: 現状の合格可能性が厳しいことを率直に伝え、今後の学習で取り組むべき点を具体的にアドバイスすること\n'
    + '   ・passAssessmentが空なら「志望校が未設定です」とだけ記載\n'
    + '5. trend（推移分析）: 複数テストがある場合の変化。伸びた・落ちた教科を具体的に記載し、学校平均の推移から各テストの易化・難化にも言及。1テストのみなら空文字列\n\n'
    + '【応答形式】以下のJSON形式のみで返してください：\n'
    + '{\n'
    + '  "students": {\n'
    + '    "生徒ID": {\n'
    + '      "overall": "総合評価テキスト（学校平均合計との比較含む）",\n'
    + '      "subjects": { "kokugo": "国語分析（学校平均との比較含む）", "shakai": "...", "sugaku": "...", "rika": "...", "eigo": "..." },\n'
    + '      "subjectDifficulty": { "kokugo": "harder/easier/same", "shakai": "...", "sugaku": "...", "rika": "...", "eigo": "..." },\n'
    + '      "targetSchool": "志望校分析テキスト",\n'
    + '      "trend": "推移分析テキスト（易化・難化への言及含む。1テストのみなら空文字列）"\n'
    + '    }\n'
    + '  }\n'
    + '}\n'
    + '- 数値を記載する際は小数第1位まで表記すること\n'
    + '- 文体は丁寧語で簡潔にまとめること\n';

  // 1人あたり約900トークンの出力 + 固定分4000トークンで計算
  var maxTokens = Math.min(65536, Math.max(8000, batchStudents.length * 900 + 4000));
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json'
    }
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = fetchGeminiWithRetry_(url, options);
  if (response.getResponseCode() !== 200) {
    return { success: false, error: parseGeminiErrorMessage_(response) };
  }

  var result = JSON.parse(response.getContentText());
  if (result.usageMetadata) logGeminiUsage('生徒別AI分析（バッチ）', result.usageMetadata);

  var finishReason = ((result.candidates || [])[0] || {}).finishReason;
  if (finishReason === 'MAX_TOKENS') {
    Logger.log('⚠ generateStudentAnalysesBatch_: 出力トークン上限 (MAX_TOKENS)');
    return { success: false, error: '出力トークン上限に達しました' };
  }

  var parts = (result.candidates[0].content.parts || []);
  var textPart = parts.filter(function(p) { return !p.thought; }).pop();
  var rawText = textPart ? (textPart.text || '') : '';
  if (rawText.length > 0 && rawText.trim().charAt(rawText.trim().length - 1) !== '}') {
    Logger.log('⚠ generateStudentAnalysesBatch_: レスポンスが不完全（末尾が } でない）。バッチ人数=' + batchStudents.length + ' rawText長=' + rawText.length);
    return { success: false, error: '出力が途中で切れました' };
  }
  var cleanedText = rawText.replace(/```+json[\r\n]*/gi, '').replace(/```+[\r\n]*/g, '').trim();
  var jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
  if (jsonMatch) cleanedText = jsonMatch[0];

  var aiResult;
  try {
    aiResult = JSON.parse(cleanedText);
  } catch (parseError) {
    Logger.log('❌ バッチ分析パースエラー: ' + parseError + ' / rawText長=' + rawText.length + ' 末尾50文字: ' + rawText.slice(-50));
    return { success: false, error: 'AIからの分析結果の解析に失敗しました' };
  }

  if (!aiResult.students) {
    return { success: false, error: 'AIの応答形式が不正です' };
  }

  return { success: true, analyses: aiResult.students };
}

/**
 * 生徒別AI分析をスプレッドシートに保存する内部ヘルパー
 * generateAllAnalyses の単一コール・バッチ両方から共通で呼び出される
 * @param {Array} studentsData 全生徒データ配列（偏差値・合格判定含む）
 * @param {Object} aiStudentAnalyses Geminiから返された {studentId: commentObject}
 * @param {number} year 学年年度
 * @param {string} testNameTrimmed テスト名（trim済み）
 * @param {Array} displayTestNames 表示テスト名リスト
 * @param {string} now 保存日時（ISO文字列）
 * @return {number} 保存した生徒数
 */
function saveStudentAnalyses_(studentsData, aiStudentAnalyses, year, testNameTrimmed, displayTestNames, now) {
  var studentSheet = getStudentAnalysisSheet_(year);
  if (!studentSheet) return 0;

  var existingMap = {};
  var lastRowStudent = studentSheet.getLastRow();
  if (lastRowStudent >= 2) {
    var existingRows = studentSheet.getRange(2, 1, lastRowStudent - 1, 2).getValues();
    for (var ei = 0; ei < existingRows.length; ei++) {
      // Sheets の数値変換で消えた先頭ゼロを padStart で復元
      var eid = String(existingRows[ei][0] || '').trim();
      if (/^\d+$/.test(eid) && eid.length < 10) eid = eid.padStart(10, '0');
      var key = eid + '|' + String(existingRows[ei][1]).trim();
      existingMap[key] = ei + 2;
    }
  }

  var savedCount = 0;
  studentsData.forEach(function(sd) {
    var aiComment = aiStudentAnalyses[sd.id];
    if (!aiComment) return;
    var analysisData = {
      comment: aiComment,
      deviationValues: sd.deviationValues,
      passAssessment: sd.passAssessment,
      displayTestNames: displayTestNames
    };
    var rowValues = [sd.id, testNameTrimmed, JSON.stringify(analysisData), now];
    var existingKey = sd.id + '|' + testNameTrimmed;
    if (existingMap[existingKey]) {
      studentSheet.getRange(existingMap[existingKey], 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      studentSheet.appendRow(rowValues);
      existingMap[existingKey] = studentSheet.getLastRow(); // 次回のupsert用に更新
    }
    savedCount++;
  });

  return savedCount;
}

/**
 * テスト全体分析と生徒別AI分析を1回のGemini APIコールで同時生成する（Admin専用）
 * generateGradeAnalysis と generateStudentAnalyses を統合してAPI消費を1回に削減
 * @param {number} year 学年年度
 * @param {string} testName テスト名
 * @param {boolean} skipExisting trueのとき、既存データがある全体分析・生徒別分析をスキップして未分析のみ生成（省略時=false）
 * @return {Object} { success, studentCount, skippedCount, skipped, generatedAt, error }
 */
function generateAllAnalyses(year, testName, skipExisting) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };

    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };

    var testNameTrimmed = String(testName).trim();

    // skipExisting=true のとき、既存データの事前チェックを行う
    var skipGradeAnalysis = false;
    var existingStudentKeys = {};
    var skippedStudentCount = 0;
    if (skipExisting) {
      var existingGrade = getGradeAnalysis(year, testName);
      if (existingGrade.exists) {
        skipGradeAnalysis = true;
      }
      var studentSheetSkip = getStudentAnalysisSheet_(year);
      if (studentSheetSkip) {
        var lastRowSkip = studentSheetSkip.getLastRow();
        if (lastRowSkip >= 2) {
          var existingSkipRows = studentSheetSkip.getRange(2, 1, lastRowSkip - 1, 2).getValues();
          for (var rsi = 0; rsi < existingSkipRows.length; rsi++) {
            var eskipId = String(existingSkipRows[rsi][0] || '').trim();
            if (/^\d+$/.test(eskipId) && eskipId.length < 10) eskipId = eskipId.padStart(10, '0');
            var eskipKey = eskipId + '|' + String(existingSkipRows[rsi][1]).trim();
            existingStudentKeys[eskipKey] = true;
          }
        }
      }
    }

    // ==========================================
    // テスト全体分析データの収集（generateGradeAnalysis と同等）
    // ==========================================
    var currentAvgs = getYearTestAvgs_(year, testName);
    var jukuAvg = currentAvgs.jukuAvg;
    var schoolAvgForGrade = currentAvgs.schoolAvg;
    if (!jukuAvg) return { success: false, error: 'このテストの成績データがまだ登録されていません' };

    // 過去データ（最大10年・存在する分だけ取得）＋分布キャッシュ
    // sigmaConfig を先にロードして過去年の分布計算に使用する
    var sigmaConfig = getGradeAnalysisSigmaConfig().sigma;
    // skipExisting=false（上書き）のとき過去年のキャッシュも強制再計算する
    var forceDistRecalc = !skipExisting;
    var historicalYears = [];
    for (var dy = 10; dy >= 1; dy--) {
      var pastYear = year - dy;
      var pastAvgs = getYearTestAvgs_(pastYear, testName);
      if (pastAvgs.jukuAvg || pastAvgs.schoolAvg) {
        var pastDist = getOrBuildDistCache_(pastYear, testName, sigmaConfig, forceDistRecalc);
        historicalYears.push({
          year: pastYear,
          jukuAvg: pastAvgs.jukuAvg,
          schoolAvg: pastAvgs.schoolAvg,
          distribution: pastDist
        });
      }
    }

    // 前回・第1回データ
    var prevRoundData = null;
    var firstRoundData = null;
    if (testNameTrimmed.indexOf('第2回基礎学力テスト') >= 0) {
      var r1Name = testNameTrimmed.replace('第2回', '第1回');
      var r1Avgs = getYearTestAvgs_(year, r1Name);
      if (r1Avgs.jukuAvg || r1Avgs.schoolAvg) prevRoundData = { testName: r1Name, jukuAvg: r1Avgs.jukuAvg, schoolAvg: r1Avgs.schoolAvg };
    } else if (testNameTrimmed.indexOf('第3回基礎学力テスト') >= 0) {
      var r2Name = testNameTrimmed.replace('第3回', '第2回');
      var r2Avgs = getYearTestAvgs_(year, r2Name);
      if (r2Avgs.jukuAvg || r2Avgs.schoolAvg) prevRoundData = { testName: r2Name, jukuAvg: r2Avgs.jukuAvg, schoolAvg: r2Avgs.schoolAvg };
      var r1NameFor3 = testNameTrimmed.replace('第3回', '第1回');
      var r1AvgsFor3 = getYearTestAvgs_(year, r1NameFor3);
      if (r1AvgsFor3.jukuAvg || r1AvgsFor3.schoolAvg) firstRoundData = { testName: r1NameFor3, jukuAvg: r1AvgsFor3.jukuAvg, schoolAvg: r1AvgsFor3.schoolAvg };
    }

    // 次回テストの過去データ（第1回→第2回、第2回→第3回の傾向予測用）
    var nextRoundHistorical = [];
    var nextRoundName = null;
    if (testNameTrimmed.indexOf('第1回基礎学力テスト') >= 0) {
      nextRoundName = testNameTrimmed.replace('第1回', '第2回');
    } else if (testNameTrimmed.indexOf('第2回基礎学力テスト') >= 0) {
      nextRoundName = testNameTrimmed.replace('第2回', '第3回');
    }
    if (nextRoundName) {
      for (var ndy = 10; ndy >= 1; ndy--) {
        var nYear = year - ndy;
        var nAvgs = getYearTestAvgs_(nYear, nextRoundName);
        if (nAvgs.jukuAvg || nAvgs.schoolAvg) {
          nextRoundHistorical.push({ year: nYear, testName: nextRoundName, jukuAvg: nAvgs.jukuAvg, schoolAvg: nAvgs.schoolAvg });
        }
      }
    }

    // schoolAvg 丸め（小数第1位）
    if (schoolAvgForGrade) {
      var roundOne = function(v) { return (v === '' || v === null || v === undefined || isNaN(Number(v))) ? v : Math.round(Number(v) * 10) / 10; };
      schoolAvgForGrade = {
        kokugo: roundOne(schoolAvgForGrade.kokugo), shakai: roundOne(schoolAvgForGrade.shakai),
        sugaku: roundOne(schoolAvgForGrade.sugaku), rika: roundOne(schoolAvgForGrade.rika),
        eigo: roundOne(schoolAvgForGrade.eigo), total: roundOne(schoolAvgForGrade.total)
      };
    }

    // 学年別・得点分布（sigmaConfig は上部で取得済みのものを使用）
    var gradeBreakdown = [];
    var scoreDistribution = {};
    try {
      var gradeNameMap = getGradeConfig();
      var slwg = getStudentListWithGrades(year, testName);
      if (slwg && slwg.success && Array.isArray(slwg.students)) {
        var scoredStudents = slwg.students.filter(function(s) { return s.hasGrade; });
        var gradeCount = {};
        scoredStudents.forEach(function(s) { var gc = String(s.grade || ''); if (gc) { gradeCount[gc] = (gradeCount[gc] || 0) + 1; } });
        Object.keys(gradeCount).sort().forEach(function(gc) {
          gradeBreakdown.push({ gradeCode: gc, gradeName: gradeNameMap[gc] || ('学年コード' + gc), count: gradeCount[gc] });
        });
        var subjKeysGA = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];
        var subjNamesGA = { kokugo: '国語', shakai: '社会', sugaku: '数学', rika: '理科', eigo: '英語', total: '合計' };
        var maxScoreGA = { kokugo: 100, shakai: 100, sugaku: 100, rika: 100, eigo: 100, total: 500 };
        subjKeysGA.forEach(function(subj) {
          var scores = scoredStudents.map(function(s) { return s[subj]; }).filter(function(v) { return v !== '' && v !== null && !isNaN(Number(v)); }).map(Number);
          if (scores.length === 0) return;
          var n = scores.length;
          var sig = sigmaConfig[subj];
          var jukuSubjAvg = scores.reduce(function(a, b) { return a + b; }, 0) / n;
          var schoolSubjVal = schoolAvgForGrade ? schoolAvgForGrade[subj] : null;
          var refMean = (schoolSubjVal !== '' && schoolSubjVal !== null && schoolSubjVal !== undefined && !isNaN(Number(schoolSubjVal))) ? Number(schoolSubjVal) : jukuSubjAvg;
          var highThreshold = Math.min(Math.round((refMean + sig) * 10) / 10, maxScoreGA[subj]);
          var lowThreshold = Math.max(Math.round((refMean - sig) * 10) / 10, 0);
          var high = scores.filter(function(v) { return v >= highThreshold; }).length;
          var low = scores.filter(function(v) { return v < lowThreshold; }).length;
          scoreDistribution[subj] = {
            subject: subjNamesGA[subj], total: n, refMean: Math.round(refMean * 10) / 10, sigma: sig,
            highThreshold: highThreshold, lowThreshold: lowThreshold,
            highCount: high, highPct: Math.round(high / n * 100),
            lowCount: low, lowPct: Math.round(low / n * 100)
          };
        });
      }
      // 当該年度の分布もキャッシュに保存（常に最新データで更新）
      try {
        getOrBuildDistCache_(year, testName, sigmaConfig, true);
      } catch (e) {
        Logger.log('⚠ 当該年度の分布キャッシュ保存スキップ: ' + e);
      }
    } catch (e) {
      Logger.log('⚠ 学年別・得点分布データ取得スキップ: ' + e);
    }

    // ==========================================
    // 生徒別分析データの収集（generateStudentAnalyses と同等）
    // ==========================================
    // displayTestNames（累積ロジック）
    var displayTestNames = [testNameTrimmed];
    var kMatch = testNameTrimmed.match(/^第(\d+)回基礎学力テスト$/);
    if (kMatch) {
      var selectedNum = parseInt(kMatch[1], 10);
      displayTestNames = [];
      for (var kn = 1; kn <= selectedNum; kn++) { displayTestNames.push('第' + kn + '回基礎学力テスト'); }
    }

    var allGrades = getDataSheetData(year);
    var masterData = getMasterData(year);
    var schoolConfig = getSchoolConfig();

    // 学校平均マップ（学校名に「平均」が含まれる行のみ）
    var schoolAvgMap = {};
    displayTestNames.forEach(function(tn) {
      var avgResult = getSchoolAverages(year, tn);
      if (avgResult.success) {
        var avgRow = (avgResult.averages || []).filter(function(a) {
          return (a.schoolName || '').trim().indexOf('平均') !== -1;
        })[0];
        if (avgRow) schoolAvgMap[tn] = avgRow;
      }
    });

    // 対象生徒の抽出
    var studentIdsWithGrade = {};
    allGrades.forEach(function(row) { if (String(row.testName || '').trim() === testNameTrimmed) { studentIdsWithGrade[String(row.studentId)] = true; } });
    var targetStudents = masterData.filter(function(s) { return studentIdsWithGrade[String(s.studentId)]; });
    if (targetStudents.length === 0) return { success: false, error: 'このテストの成績データがある生徒がいません' };

    // skipExisting=true のとき、既存分析がない生徒のみに絞る
    if (skipExisting) {
      var beforeFilterCount = targetStudents.length;
      targetStudents = targetStudents.filter(function(s) {
        var key = String(s.studentId).padStart(10, '0') + '|' + testNameTrimmed;
        return !existingStudentKeys[key];
      });
      skippedStudentCount = beforeFilterCount - targetStudents.length;
      if (skipGradeAnalysis && targetStudents.length === 0) {
        return { success: true, studentCount: 0, skippedCount: skippedStudentCount, skipped: true,
                 message: 'すべての分析が既に存在します（スキップしました）', generatedAt: new Date().toISOString() };
      }
    }

    // 志望校偏差値マップ
    var schoolDeviationMap = {};
    schoolConfig.forEach(function(sc) {
      var deptMap = {};
      (sc.departments || []).forEach(function(d) { deptMap[d.name] = d.deviation; });
      schoolDeviationMap[sc.name] = deptMap;
    });

    var subjKeysSA = ['kokugo', 'shakai', 'sugaku', 'rika', 'eigo', 'total'];
    var studentsData = [];
    targetStudents.forEach(function(student) {
      var sid = String(student.studentId);
      var studentSchool = (student.schoolName || '').trim();
      var testsObj = {};
      var deviationObj = {};
      displayTestNames.forEach(function(tn) {
        var grade = null;
        allGrades.forEach(function(row) { if (String(row.studentId) === sid && String(row.testName || '').trim() === tn) { grade = row; } });
        if (grade) {
          testsObj[tn] = { kokugo: grade.kokugo, shakai: grade.shakai, sugaku: grade.sugaku, rika: grade.rika, eigo: grade.eigo, total: grade.total };
          var schoolAvgSA = schoolAvgMap[tn] || null;
          if (schoolAvgSA) {
            var devs = {};
            subjKeysSA.forEach(function(subj) { devs[subj] = calcDeviationValue_(grade[subj], schoolAvgSA[subj], sigmaConfig[subj]); });
            deviationObj[tn] = devs;
          }
        }
      });

      var passAssessment = [];
      var latestGrade = null;
      for (var t = displayTestNames.length - 1; t >= 0; t--) {
        if (testsObj[displayTestNames[t]]) {
          latestGrade = allGrades.filter(function(r) { return String(r.studentId) === sid && String(r.testName || '').trim() === displayTestNames[t]; })[0];
          break;
        }
      }
      if (latestGrade) {
        var tgts = [{ name: latestGrade.shogaku1, dept: latestGrade.shogaku1_gakka }, { name: latestGrade.shogaku2, dept: latestGrade.shogaku2_gakka }];

        // 累積平均スコアと累積学校平均（生徒がデータを持つ回のみ）で偏差値を計算
        var cumScoresSA = [];
        var cumSchoolAvgTotalsSA = [];
        displayTestNames.forEach(function(tn) {
          if (testsObj[tn] && testsObj[tn].total != null) {
            cumScoresSA.push(testsObj[tn].total);
            if (schoolAvgMap[tn] && schoolAvgMap[tn].total != null) {
              cumSchoolAvgTotalsSA.push(schoolAvgMap[tn].total);
            }
          }
        });
        var cumStudentAvgSA = cumScoresSA.length > 0
          ? cumScoresSA.reduce(function(a, b) { return a + b; }, 0) / cumScoresSA.length : null;
        var cumSchoolAvgSA = cumSchoolAvgTotalsSA.length > 0
          ? cumSchoolAvgTotalsSA.reduce(function(a, b) { return a + b; }, 0) / cumSchoolAvgTotalsSA.length : null;
        var cumulativeTotalDevSA = calcDeviationValue_(cumStudentAvgSA, cumSchoolAvgSA, sigmaConfig.total);

        tgts.forEach(function(tgt) {
          if (!tgt.name) return;
          var deptMap = schoolDeviationMap[tgt.name];
          var schoolDev = null;
          if (deptMap && tgt.dept && deptMap[tgt.dept] !== undefined) { schoolDev = deptMap[tgt.dept]; }
          else if (deptMap) { var keys = Object.keys(deptMap); if (keys.length > 0 && deptMap[keys[0]] !== null) schoolDev = deptMap[keys[0]]; }
          passAssessment.push({ schoolName: tgt.name, department: tgt.dept || '', schoolDeviation: schoolDev, studentDeviation: cumulativeTotalDevSA, probability: calcPassProbability_(cumulativeTotalDevSA, schoolDev) });
        });
      }

      var studentSchoolAvgs = {};
      displayTestNames.forEach(function(tn) {
        if (schoolAvgMap[tn]) {
          var avg = schoolAvgMap[tn];
          studentSchoolAvgs[tn] = { kokugo: avg.kokugo, shakai: avg.shakai, sugaku: avg.sugaku, rika: avg.rika, eigo: avg.eigo, total: avg.total };
        }
      });

      studentsData.push({ id: sid, tests: testsObj, deviationValues: deviationObj, passAssessment: passAssessment, schoolAverages: studentSchoolAvgs });
    });

    // ==========================================
    // Gemini API 呼び出し（1回で両方を同時生成）
    // ==========================================
    var gradeDataJson = JSON.stringify({
      testName: testName, year: year, subjectMaxScore: 100, totalMaxScore: 500, hasSchoolAvg: !!schoolAvgForGrade,
      gradeBreakdown: gradeBreakdown, scoreDistribution: scoreDistribution,
      currentYear: { jukuAvg: jukuAvg, schoolAvg: schoolAvgForGrade },
      historicalYears: historicalYears, prevRoundData: prevRoundData, firstRoundData: firstRoundData,
      nextRoundHistorical: nextRoundHistorical
    });
    var studentDataJson = JSON.stringify({
      testName: testNameTrimmed, displayTestNames: displayTestNames, year: year,
      subjectMaxScore: 100, totalMaxScore: 500, studentCount: studentsData.length, students: studentsData
    });

    var prompt = 'あなたは個別指導塾「個別指導スクエア」の成績分析の専門家です。\n'
      + '以下の【テスト全体分析】と【生徒別分析】を1回のAPIコールで同時に行い、1つのJSONで返してください。\n\n'
      + '==============================================================\n'
      + '【テスト全体分析】\n'
      + '集計データを分析して、塾の講師・スタッフに向けた実用的な日本語コメントを生成してください。\n\n'
      + '【前提知識（テスト全体）】\n'
      + '- 教科ごとの満点: 100点（5教科合計 500点満点）\n'
      + '- jukuAvg: スクエア全校舎の受験者を集計した教科別平均点。countが受験者数\n'
      + '- schoolAvg: 学校公表の平均点（通知表等の「平均」行）。hasSchoolAvg=falseなら未登録\n'
      + '- gradeBreakdown: このテストを受験した学年の内訳（例: [{gradeCode:"14",gradeName:"中2",count:8}]）\n'
      + '- scoreDistribution: 教科別・合計の得点分布。sigma, highThreshold/lowThreshold, highCount/highPct, lowCount/lowPct\n'
      + '- historicalYears: 過去データ（古い順。存在する年度分すべて）。各エントリは jukuAvg, schoolAvg, distribution を持つ\n'
      + '  ・distribution: 過去年の得点分布キャッシュ。キー=教科/total, 値={count:受験者数, highPct:上位層%, lowPct:下位層%}\n'
      + '  ・上位層=μ+σ以上、下位層=μ-σ未満（μ=学校平均、σ=管理者設定値で年度ごとに一貫した基準）\n'
      + '  ・distributionが空オブジェクト{}の場合はデータなし（スキップして言及しないこと）\n'
      + '- prevRoundData: 前回テストデータ（第2回→第1回, 第3回→第2回）\n'
      + '- firstRoundData: 第1回テストデータ（第3回分析時のみ）\n'
      + '- nextRoundHistorical: 次回テスト（第1回→第2回、第2回→第3回）の過去データ（古い順）。傾向予測に使用\n'
      + '- 教科値が空文字列（""）の場合はデータなし\n\n';

    if (testNameTrimmed.indexOf('第3回基礎学力テスト') >= 0) {
      prompt += '⚠ 第3回基礎学力テストは高校入試まであとわずかという時期の最後のテストです。入試まであとわずかという状況を踏まえた総括的なコメントを「progression」に含めてください。\n\n';
    }

    prompt += '【テスト全体データ】\n' + gradeDataJson + '\n\n'
      + '【テスト全体分析の出力フォーマット（gradeAnalysis）】\n'
      + '- overview: 受験者数・塾平均の全体水準・学年内訳・hasSchoolAvg=trueなら学校平均との差（2〜3文）。少人数（10名未満）なら必ず注記\n'
      + '- subjectAnalysis: 5教科分のオブジェクト配列。各教科に jukuAvg/schoolAvg/diff/comment/trend/roundDifficulty を設定\n'
      + '  ・comment: 数値を引用して塾平均・学校平均・差・得点分布（上位層/下位層）の傾向を記述\n'
      + '  ・trend: historicalYearsの前年度と比較し "up"/"down"/"stable"\n'
      + '  ・roundDifficulty: prevRoundDataがある場合に易化・難化を判定 "easier"/"harder"/"same"/"null"（文字列）\n'
      + '- historicalTrend: 過去推移コメント（2〜3文）\n'
      + '  ・historicalYearsがある場合に塾平均の複数年変化を記述\n'
      + '  ・学校平均データがある年は、その変化から年度ごとのテスト難化・易化傾向にも言及する\n'
      + '  ・distributionが存在する年が複数ある場合、上位層割合・下位層割合の推移にも言及する（例:「上位層は例年XX%前後だが今年はXX%と増加傾向」）\n'
      + '  ・データなしまたは特筆すべき変化がないなら空文字列\n'
      + '- yearOverYearComparison: 前年度比較コメント\n'
      + '  ・historicalYearsの直近1年と今年度を比較（塾平均・学校平均それぞれ）\n'
      + '  ・学校平均の変化から今年度テストの難化・易化を教科別・合計点で判定して述べること\n'
      + '  ・過去複数年のデータと照らし合わせて「例年通り」「例年より難化」「例年より易化」など総括すること\n'
      + '  ・前年のdistributionがある場合、今年のscoreDistributionと比較し、上位層・下位層割合の変化を教科別・合計で述べること\n'
      + '    （例:「数学の上位層は昨年XX%→今年XX%と増加。下位層はXX%→XX%と横ばい」）\n'
      + '  ・データなしなら空文字列\n'
      + '- roundComparison: 前回テスト比較コメント（3〜5文）\n'
      + '  ・prevRoundDataがある場合に前回テストとの比較\n'
      + '  ・学校平均の変化から試験の易化・難化を教科別・合計点で判定して言及すること\n'
      + '  ・塾平均と学校平均の相対的な変化も述べること\n'
      + '  ・なければ空文字列\n'
      + '- progression: 第1〜3回推移総評（3〜4文）\n'
      + '  ・firstRoundDataがある場合（第3回のみ）第1回〜第3回の各教科・合計点の推移と入試前の総括\n'
      + '  ・なければ空文字列\n'
      + '- nextRoundPrediction: 次回テスト難易度予測\n'
      + '  ・nextRoundHistoricalが空でない場合のみ生成\n'
      + '  ・historicalYears（今回テストの過去データ）とnextRoundHistorical（次回テストの過去データ）を年度ごとに対比し、教科別・合計点で「今回テスト→次回テストでどう変化する傾向があるか」を分析（2〜4文）\n'
      + '  ・一貫して難化・易化する傾向がある教科や合計点があれば具体的に挙げること\n'
      + '  ・データ年数が3年未満の場合は「参考値（データ年数が少ないため精度は低い）」と必ず注記すること\n'
      + '  ・過去パターンに基づく予測であり実際の試験が異なる可能性があることを断り書きとして添えること\n'
      + '  ・なければ空文字列\n\n'
      + '==============================================================\n'
      + '【生徒別分析】\n'
      + '各生徒の個別コメントを生成してください。\n\n'
      + '【前提知識（生徒別）】\n'
      + '- 教科ごとの満点: 100点（5教科合計 500点満点）\n'
      + '- deviationValues: 教科別偏差値（学校平均とσから算出。50が平均。nullはデータ不足）\n'
      + '- passAssessment: 志望校合格判定（probability.gradeがA〜E、percentが確率%）\n'
      + '- schoolAverages: 生徒の在籍校の推定平均点。必ず「およそ〇点」と表現すること（実際の学校平均と異なる場合があるため）\n'
      + '- 複数テストがある場合、schoolAveragesの各テスト間の変化から教科ごとの易化・難化を判定できる\n'
      + '  （前テストより学校平均が3点以上上がれば易化、3点以上下がれば難化、それ以外はsame）\n'
      + '- テストが複数ある場合はdisplayTestNamesの順で推移を分析すること\n'
      + '- 生徒IDで回答すること（氏名は渡していない）\n\n';
    if (testNameTrimmed.indexOf('第3回基礎学力テスト') !== -1) {
      prompt += '⚠ 第3回基礎学力テストは高校入試まであとわずかという時期の最後のテストです。\nあなたは経験豊富な個別指導塾の講師として、以下の点を各フィールドに必ず反映してください：\n・overall: 合計点・偏差値から「このまま入試に臨んで大丈夫か」を率直に伝え、問題がある場合は残りわずかな時間で優先して取り組むべきことを具体的に記載すること\n・subjects: 第1〜3回の得点推移も踏まえ、各教科で入試直前に何の学習に集中すべきかの実践的なアドバイスを含めること。学校平均を下回っている教科は苦手単元の復習・基本問題の確認など具体的な内容にすること\n・trend: 第1〜3回の変化を総括し、入試に向けた最終確認ポイントを含めること\n・targetSchool【重要・後述の共通指示より優先】: 第3回は最後の基礎学力テストであり次は高校入試本番である。A/B/C+判定: 入試本番に向けて弱点を一つずつ確実に潰していけるよう背中を押す前向きなアドバイス。C-/D+/D-/E判定（合格可能性50%未満）: 入試に向けて残り時間で弱点克服に集中することを前向きに伝えつつ、今すぐ担任の先生に相談・私立高校の併願を具体的に検討するよう促すこと\n\n';
    } else if (testNameTrimmed.indexOf('基礎学力テスト') !== -1) {
      prompt += '⚠ このテストは基礎学力テスト（第1回または第2回）です。targetSchoolについては後述の共通指示より以下を優先すること。\n・targetSchool - A/B/C+判定: 現在の到達度を前向きに伝え、次回の基礎学力テストでさらに合格可能性を高めるために強化すべき点を具体的に示すこと\n・targetSchool - C-/D+/D-/E判定（合格可能性50%未満）: 合格可能性が厳しいことは率直に伝えた上で、次の基礎学力テストで巻き返せるよう今から集中すべき教科・単元を具体的に示し前向きな意欲を引き出すこと。担任の先生とも情報共有・相談を始め、私立高校の情報収集も今から始めておくよう促すこと\n\n';
    }
    prompt += '【生徒データ】\n' + studentDataJson + '\n\n'
      + '【生徒別分析の出力フォーマット（各生徒）】\n'
      + '- overall: 全体的な成績水準と傾向（2〜3文）。偏差値・合計点・学校平均合計（「およそ〇点」）に言及しつつ、単なる数値比較にとどまらず「この生徒の成績の特徴は何か（得意教科集中型か均一型か）」「どこを伸ばせるか・何が課題か」を塾講師目線で述べること\n'
      + '- subjects: 各教科の強み・弱み（1〜2文ずつ）。学校平均（「およそ〇点」）との比較は必ず含めるが、それだけで終わらず、各教科の特性（国語:読解・記述、社会:暗記・地歴公民バランス、数学:計算・文章題・図形、理科:暗記と計算の比率、英語:語彙・文法・読解）を踏まえた具体的な学習アドバイスも添えること。キー: kokugo, shakai, sugaku, rika, eigo\n'
      + '- subjectDifficulty: 複数テスト時のみ、前テスト比の学校平均変化から難易度変化を返す。キー: kokugo/shakai/sugaku/rika/eigo → 値: "harder"/"easier"/"same"。1テストのみは {}\n'
      + '- targetSchool: 志望校に対する現在の到達度と具体的アドバイス（2〜3文）。\n'
      + '  C-/D+/D-/E判定（合格可能性50%未満）: 現状の合格可能性が厳しいことを率直に伝え、今後の学習で取り組むべき点を具体的にアドバイスすること。\n'
      + '  passAssessmentが空なら「志望校が未設定です」\n'
      + '- trend: 複数テストがある場合の変化（伸びた・落ちた教科を具体的に記載し、学校平均の推移から各テストの易化・難化にも言及）。1テストのみなら空文字列\n\n'
      + '==============================================================\n'
      + '【応答形式】以下のJSON形式のみで返してください：\n'
      + '{\n'
      + '  "gradeAnalysis": {\n'
      + '    "overview": "...",\n'
      + '    "subjectAnalysis": [\n'
      + '      {"subject": "国語", "jukuAvg": 数値, "schoolAvg": 数値またはnull, "diff": 数値またはnull, "comment": "...", "trend": "up/down/stable", "roundDifficulty": "easier/harder/same/null"},\n'
      + '      {"subject": "社会", ...}, {"subject": "数学", ...}, {"subject": "理科", ...}, {"subject": "英語", ...}\n'
      + '    ],\n'
      + '    "historicalTrend": "...",\n'
      + '    "yearOverYearComparison": "...",\n'
      + '    "roundComparison": "...",\n'
      + '    "progression": "..."\n'
      + '  },\n'
      + '  "studentAnalyses": {\n'
      + '    "生徒ID": {\n'
      + '      "overall": "...",\n'
      + '      "subjects": {"kokugo": "...", "shakai": "...", "sugaku": "...", "rika": "...", "eigo": "..."},\n'
      + '      "subjectDifficulty": {"kokugo": "harder/easier/same", "shakai": "...", "sugaku": "...", "rika": "...", "eigo": "..."},\n'
      + '      "targetSchool": "...",\n'
      + '      "trend": "..."\n'
      + '    }\n'
      + '  }\n'
      + '}\n'
      + '- 数値を記載する際は小数第1位まで表記すること（例: 53.13→53.1）\n'
      + '- diffフィールドも小数第1位に四捨五入して入れること\n'
      + '- 文体は丁寧語で簡潔にまとめること\n';

    // ==========================================
    // API呼び出し（常にバッチ処理: 全体分析1コール + 生徒別分析Nコール）
    // ※かつては40人以下を単一コールで処理していたが、失敗時に何も保存されない問題があったため廃止。
    //   常にStep1（全体分析）→Step2（生徒別分析）の2段階に分けることで、
    //   Step2が失敗しても全体分析は保存済みとなり、skipExisting=trueでのリトライが効率化される。
    // ==========================================
    var BATCH_SIZE = 40;
    var now = new Date().toISOString();
    var savedCount = 0;

    var totalBatches = Math.ceil(studentsData.length / BATCH_SIZE);

    // Step1: 全体分析（generateGradeAnalysis に委譲。scoreDistribution も含めて保存される）
    var gradeResult = generateGradeAnalysis(year, testName, skipGradeAnalysis);
    if (!gradeResult.success) {
      return { success: false, error: 'テスト全体分析の生成に失敗しました: ' + gradeResult.error };
    }

    // Step2: 生徒別分析をバッチ処理
    var allStudentAiResults = {};
    for (var bi = 0; bi < studentsData.length; bi += BATCH_SIZE) {
      var batch = studentsData.slice(bi, Math.min(bi + BATCH_SIZE, studentsData.length));
      var batchNum = Math.floor(bi / BATCH_SIZE) + 1;
      var batchResult = generateStudentAnalysesBatch_(batch, testNameTrimmed, displayTestNames, apiKey);
      if (!batchResult.success) {
        Logger.log('⚠ バッチ ' + batchNum + ' 失敗: ' + batchResult.error + '（スキップして続行）');
      } else {
        var batchIds = Object.keys(batchResult.analyses);
        batchIds.forEach(function(id) { allStudentAiResults[id] = batchResult.analyses[id]; });
      }
      // 次のバッチがある場合のみ待機（RPM15回/分の制限対策）
      if (bi + BATCH_SIZE < studentsData.length) {
        Utilities.sleep(4500);
      }
    }

    // Step3: 全生徒分析を一括保存
    savedCount = saveStudentAnalyses_(studentsData, allStudentAiResults, year, testNameTrimmed, displayTestNames, now);

    return { success: true, studentCount: savedCount, skippedCount: skippedStudentCount, generatedAt: now };
  } catch (error) {
    Logger.log('❌ generateAllAnalysesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}
