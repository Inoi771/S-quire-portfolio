
// ========================================
// 【セクション7】成績管理（マスター設定）
// ========================================
// テスト名・校舎・学年の動的管理、マスターデータ

/**
 * スクリプトプロパティから設定を取得
 * @param {string} key プロパティキー
 * @return {string} 設定値
 */
function getScriptProperty(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * スクリプトプロパティに設定を保存
 * @param {string} key プロパティキー
 * @param {string} value 設定値
 * @return {boolean} 常に true
 */
function setScriptProperty(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
  return true;
}

/**
 * 成績管理設定を初期化（初回のみ）
 * テスト名、校舎、学年のデフォルト値をスクリプトプロパティに設定
 * @return {Object} { success, message, error }
 */
function initializeGradesConfig() {
  try {
    // テスト名が未設定なら初期化
    if (!getScriptProperty(CONFIG_PROP_KEYS.TEST_NAMES_CONFIG)) {
      setScriptProperty(CONFIG_PROP_KEYS.TEST_NAMES_CONFIG, JSON.stringify(TEST_NAMES));
    }
    
    // 校舎が未設定なら初期化
    if (!getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG)) {
      var campusConfig = [];
      for (var code in CAMPUSES) {
        campusConfig.push({ code: code, name: CAMPUSES[code] });
      }
      setScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG, JSON.stringify(campusConfig));
    }
    
    // 学年はコード内の GRADES 定数で固定管理（ScriptProperties 不要）

    return { success: true, message: '設定を初期化しました' };
    
  } catch (error) {
    Logger.log('❌ initializeGradesConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * テスト名を追加（管理者専用）
 * @param {string} newTestName 追加するテスト名
 * @return {Object} { success, message, testName, error }
 */
function addTestName(newTestName) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    if (!newTestName || newTestName.trim().length === 0) {
      return { success: false, error: 'テスト名を入力してください' };
    }
    
    newTestName = newTestName.trim();
    var testNames = getTestNamesConfig();
    
    if (testNames.includes(newTestName)) {
      return { success: false, error: 'このテスト名は既に存在します' };
    }
    
    if (newTestName.length > 50) {
      return { success: false, error: 'テスト名は50文字以下にしてください' };
    }
    
    testNames.push(newTestName);
    setScriptProperty(CONFIG_PROP_KEYS.TEST_NAMES_CONFIG, JSON.stringify(testNames));
    
    return { success: true, message: 'テスト名を追加しました', testName: newTestName };
    
  } catch (error) {
    Logger.log('❌ addTestNameエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * テスト名を削除（管理者専用）
 * @param {string} testNameToDelete 削除するテスト名
 * @return {Object} { success, message, error }
 */
function deleteTestName(testNameToDelete) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    testNameToDelete = testNameToDelete.trim();
    var testNames = getTestNamesConfig();

    var index = testNames.indexOf(testNameToDelete);
    if (index === -1) {
      return { success: false, error: 'テスト名が見つかりません' };
    }

    // 使用中の成績データがあれば削除を拒否
    var gradeCount = countGradesByTestName_(testNameToDelete);
    if (gradeCount > 0) {
      return { success: false, error: 'このテスト名は ' + gradeCount + ' 件の成績データで使用されているため削除できません' };
    }

    testNames.splice(index, 1);
    setScriptProperty(CONFIG_PROP_KEYS.TEST_NAMES_CONFIG, JSON.stringify(testNames));
    
    return { success: true, message: 'テスト名を削除しました' };

  } catch (error) {
    Logger.log('❌ deleteTestNameエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * テスト名を変更（管理者専用）
 * @param {string} oldName 現在のテスト名
 * @param {string} newName 新しいテスト名
 * @return {Object} { success, message, error }
 */
function updateTestName(oldName, newName) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    newName = (newName || '').trim();
    if (!newName) return { success: false, error: '新しいテスト名を入力してください' };
    var testNames = getTestNamesConfig();
    var idx = testNames.indexOf(oldName);
    if (idx === -1) return { success: false, error: 'テスト名が見つかりません' };
    if (newName !== oldName && testNames.indexOf(newName) !== -1) {
      return { success: false, error: 'このテスト名は既に登録されています' };
    }
    testNames[idx] = newName;
    setScriptProperty(CONFIG_PROP_KEYS.TEST_NAMES_CONFIG, JSON.stringify(testNames));
    return { success: true, message: 'テスト名を変更しました' };
  } catch (error) {
    Logger.log('❌ updateTestNameエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 志望校を追加（管理者専用）
 * 学科は「学科名:偏差値」形式でカンマ区切り（例: 普通科:55, 理数科:60）。
 * 偏差値は省略可能（例: 普通科, 理数科:60）
 * @param {string} schoolName 学校名
 * @param {string} departmentsStr 学科名（「学科名:偏差値」カンマ区切り文字列）
 * @return {Object} { success, message, error }
 */
function addSchool(schoolName, departmentsStr) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    if (!schoolName || schoolName.trim().length === 0) {
      return { success: false, error: '学校名を入力してください' };
    }
    schoolName = schoolName.trim();
    var departments = (departmentsStr || '').split(',')
      .map(function(d) {
        d = d.trim();
        if (!d) return null;
        var colonIdx = d.indexOf(':');
        if (colonIdx === -1) {
          return { name: d, deviation: null };
        }
        var deptName = d.substring(0, colonIdx).trim();
        var deviationStr = d.substring(colonIdx + 1).trim();
        var deviation = deviationStr ? parseInt(deviationStr, 10) : null;
        if (deviation !== null && isNaN(deviation)) deviation = null;
        return { name: deptName, deviation: deviation };
      })
      .filter(function(d) { return d !== null && d.name.length > 0; });

    var schools = getSchoolConfig();
    var exists = schools.some(function(s) { return s.name === schoolName; });
    if (exists) return { success: false, error: 'この学校名は既に登録されています' };

    schools.push({ name: schoolName, departments: departments });
    setScriptProperty(CONFIG_PROP_KEYS.SCHOOL_CONFIG, JSON.stringify(schools));

    return { success: true, message: '学校を追加しました' };
  } catch (error) {
    Logger.log('❌ addSchoolエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 志望校を削除（管理者専用）
 * @param {string} schoolName 学校名
 * @return {Object} { success, message, error }
 */
function deleteSchool(schoolName) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    var schools = getSchoolConfig();
    var index = schools.findIndex(function(s) { return s.name === schoolName; });
    if (index === -1) return { success: false, error: '学校が見つかりません' };

    // 使用中の成績データがあれば削除を拒否
    var gradeCount = countGradesBySchool_(schoolName);
    if (gradeCount > 0) {
      return { success: false, error: 'この志望校は ' + gradeCount + ' 件の成績データで使用されているため削除できません' };
    }

    schools.splice(index, 1);
    setScriptProperty(CONFIG_PROP_KEYS.SCHOOL_CONFIG, JSON.stringify(schools));

    return { success: true, message: '学校を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteSchoolエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 志望校を更新（管理者専用）
 * 学科は「学科名:偏差値」形式でカンマ区切り。偏差値は省略可能
 * @param {string} oldName 現在の学校名
 * @param {string} newName 新しい学校名
 * @param {string} departmentsStr 新しい学科（「学科名:偏差値」カンマ区切り文字列）
 * @return {Object} { success, message, error }
 */
function updateSchool(oldName, newName, departmentsStr) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    newName = (newName || '').trim();
    if (!newName) return { success: false, error: '学校名を入力してください' };
    var schools = getSchoolConfig();
    var idx = schools.findIndex(function(s) { return s.name === oldName; });
    if (idx === -1) return { success: false, error: '学校が見つかりません' };
    var dupIdx = schools.findIndex(function(s) { return s.name === newName; });
    if (dupIdx !== -1 && dupIdx !== idx) {
      return { success: false, error: 'この学校名は既に登録されています' };
    }
    var departments = (departmentsStr || '').split(',')
      .map(function(d) {
        d = d.trim();
        if (!d) return null;
        var colonIdx = d.indexOf(':');
        if (colonIdx === -1) return { name: d, deviation: null };
        var deptName = d.substring(0, colonIdx).trim();
        var deviationStr = d.substring(colonIdx + 1).trim();
        var deviation = deviationStr ? parseInt(deviationStr, 10) : null;
        if (deviation !== null && isNaN(deviation)) deviation = null;
        return { name: deptName, deviation: deviation };
      })
      .filter(function(d) { return d !== null && d.name.length > 0; });
    schools[idx] = { name: newName, departments: departments };
    setScriptProperty(CONFIG_PROP_KEYS.SCHOOL_CONFIG, JSON.stringify(schools));
    return { success: true, message: '志望校を更新しました' };
  } catch (error) {
    Logger.log('❌ updateSchoolエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎を追加（管理者専用）
 * @param {string} campusCode 校舎コード（例: C01）
 * @param {string} campusName 校舎名（例: 校舎A）
 * @param {string} tel TEL（省略可）
 * @param {string} fax FAX（省略可）
 * @param {string} principal 校舎責任者名（省略可）
 * @param {string} mobile 携帯番号（省略可）
 * @return {Object} { success, message, campus, error }
 */
function addCampus(campusCode, campusName, tel, fax, principal, mobile) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    if (!campusCode || !campusName) {
      return { success: false, error: 'コードと名前を入力してください' };
    }

    campusCode = campusCode.trim().toUpperCase();
    campusName = campusName.trim();

    var campusConfig = [];
    var configJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    if (configJson) {
      campusConfig = JSON.parse(configJson);
    }

    // 重複チェック
    if (campusConfig.some(function(c) { return c.code === campusCode; })) {
      return { success: false, error: 'このコードは既に使用されています' };
    }

    if (campusCode.length > 10 || campusName.length > 30) {
      return { success: false, error: 'コードは10文字、名前は30文字以下にしてください' };
    }

    var newCampus = { code: campusCode, name: campusName, tel: (tel || '').trim(), fax: (fax || '').trim(), principal: (principal || '').trim(), mobile: (mobile || '').trim() };
    campusConfig.push(newCampus);
    setScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG, JSON.stringify(campusConfig));

    return { success: true, message: '校舎を追加しました', campus: newCampus };

  } catch (error) {
    Logger.log('❌ addCampusエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎を削除（管理者専用）
 * @param {string} campusCode 削除する校舎コード
 * @return {Object} { success, message, error }
 */
function deleteCampus(campusCode) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    campusCode = campusCode.trim();

    var campusConfig = [];
    var configJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    if (configJson) {
      campusConfig = JSON.parse(configJson);
    }

    var beforeCount = campusConfig.length;
    campusConfig = campusConfig.filter(function(c) { return c.code !== campusCode; });

    if (beforeCount === campusConfig.length) {
      return { success: false, error: '校舎が見つかりません' };
    }

    // 使用中の生徒データがあれば削除を拒否
    var studentCount = countStudentsByCampus_(campusCode);
    if (studentCount > 0) {
      return { success: false, error: 'この校舎には ' + studentCount + ' 名の生徒が登録されているため削除できません' };
    }

    setScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG, JSON.stringify(campusConfig));
    
    return { success: true, message: '校舎を削除しました' };

  } catch (error) {
    Logger.log('❌ deleteCampusエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎名を変更（管理者専用）
 * ※コードは生徒IDに紐付いているため変更不可。名前のみ変更可能
 * @param {string} campusCode 校舎コード（変更不可）
 * @param {string} newName 新しい校舎名
 * @return {Object} { success, message, error }
 */
function updateCampusName(campusCode, newName) {
  return updateCampusDetails(campusCode, newName, null, null, null);
}

/**
 * 校舎詳細を変更（管理者専用）
 * ※コードは変更不可
 * @param {string} campusCode 校舎コード（変更不可）
 * @param {string} name 校舎名
 * @param {string} tel TEL（null で変更なし）
 * @param {string} fax FAX（null で変更なし）
 * @param {string} principal 校舎責任者名（null で変更なし）
 * @param {string} mobile 携帯番号（null で変更なし）
 * @return {Object} { success, message, error }
 */
function updateCampusDetails(campusCode, name, tel, fax, principal, mobile) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    name = (name || '').trim();
    if (!name) return { success: false, error: '校舎名を入力してください' };
    var configJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    var campusConfig = configJson ? JSON.parse(configJson) : [];
    var idx = campusConfig.findIndex(function(c) { return c.code === campusCode; });
    if (idx === -1) return { success: false, error: '校舎が見つかりません' };
    campusConfig[idx].name = name;
    if (tel !== null) campusConfig[idx].tel = (tel || '').trim();
    if (fax !== null) campusConfig[idx].fax = (fax || '').trim();
    if (principal !== null) campusConfig[idx].principal = (principal || '').trim();
    if (mobile !== null) campusConfig[idx].mobile = (mobile || '').trim();
    setScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG, JSON.stringify(campusConfig));
    return { success: true, message: '校舎情報を更新しました' };
  } catch (error) {
    Logger.log('❌ updateCampusDetailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 表示する学年を更新する（管理者専用）
 * ドロップダウンに表示する学年コードの配列を保存する
 * 学年コード自体は GRADES 定数で固定されており、ここでは表示/非表示のみ制御する
 * @param {Array} visibleCodes 表示する学年コードの配列（例: ["13","14","15"]）
 * @return {Object} { success, message, error }
 */
function updateVisibleGrades(visibleCodes) {
  try {
    if (!isAdmin()) return { success: false, error: '管理者権限が必要です' };
    if (!Array.isArray(visibleCodes) || visibleCodes.length === 0) {
      return { success: false, error: '少なくとも1つの学年を選択してください' };
    }

    // 全コードが GRADES 定数に存在するかバリデーション
    for (var i = 0; i < visibleCodes.length; i++) {
      var code = String(visibleCodes[i]);
      if (!GRADES[code]) {
        return { success: false, error: '無効な学年コードです: ' + code };
      }
    }

    setScriptProperty(CONFIG_PROP_KEYS.GRADE_VISIBLE_CONFIG, JSON.stringify(visibleCodes));

    return { success: true, message: '表示学年を更新しました' };

  } catch (error) {
    Logger.log('❌ updateVisibleGradesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 校舎マスタをフロントエンド向けに返す
 * @aiCallable
 * @return {Object} {success, data: {code: name, ...}}
 */
function getCampusConfigForWeb() {
  try {
    return { success: true, data: getCampusConfig() };
  } catch (error) {
    Logger.log('❌ getCampusConfigForWebエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績管理設定を取得（Web API）
 * 成績管理タブで使用するドロップダウンデータを返す
 * @aiCallable
 * @return {Object} { success, testNames, campuses, grades }
 */
function getGradesConfigForWeb() {
  try {
    initializeGradesConfig();

    // テスト名
    var testNames = getTestNamesConfig();

    // 校舎
    var campusConfigJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    var campusConfig = campusConfigJson ? JSON.parse(campusConfigJson) : [];

    // 学年（GRADES 定数から全12学年を構築・数値順でソート）
    var allGrades = Object.keys(GRADES)
      .sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); })
      .map(function(code) { return { code: code, name: GRADES[code] }; });

    // 表示学年フィルター
    var visibleJson = getScriptProperty(CONFIG_PROP_KEYS.GRADE_VISIBLE_CONFIG);
    var visibleCodes = visibleJson ? JSON.parse(visibleJson) : null;

    // 未設定時は全学年を表示（初回デプロイ互換）
    var grades = visibleCodes
      ? allGrades.filter(function(g) { return visibleCodes.indexOf(g.code) !== -1; })
      : allGrades;

    return {
      success: true,
      testNames: testNames,
      campuses: campusConfig,
      grades: grades,
      allGrades: allGrades,
      visibleGradeCodes: visibleCodes || allGrades.map(function(g) { return g.code; }),
      schools: getSchoolConfig()
    };
  } catch (error) {
    Logger.log('❌ getGradesConfigForWebエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * テスト名設定を取得
 * @return {Array} テスト名配列
 */
function getTestNamesConfig() {
  try {
    initializeGradesConfig();
    var configJson = getScriptProperty(CONFIG_PROP_KEYS.TEST_NAMES_CONFIG);
    return JSON.parse(configJson || '[]');
  } catch (error) {
    Logger.log('❌ getTestNamesConfigエラー: ' + error);
    return TEST_NAMES;
  }
}

/**
 * 志望校設定を取得
 * @return {Array} [{name, departments:[]}] の配列
 */
function getSchoolConfig() {
  try {
    var json = getScriptProperty(CONFIG_PROP_KEYS.SCHOOL_CONFIG);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    Logger.log('❌ getSchoolConfigエラー: ' + error);
    return [];
  }
}

/**
 * 校舎設定を取得
 * @return {Object} 校舎コード→名前のマップ
 */
function getCampusConfig() {
  try {
    initializeGradesConfig();
    var configJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    var config = JSON.parse(configJson || '[]');

    // 辞書形式に変換
    var result = {};
    config.forEach(function(item) {
      result[item.code] = item.name;
    });
    return result;
  } catch (error) {
    Logger.log('❌ getCampusConfigエラー: ' + error);
    return CAMPUSES;
  }
}

/**
 * 校舎詳細設定を配列形式で取得（TEL/FAX/責任者/携帯番号含む）
 * @return {Array} [{code, name, tel, fax, principal, mobile}]
 */
function getCampusDetailsConfig() {
  try {
    initializeGradesConfig();
    var configJson = getScriptProperty(CONFIG_PROP_KEYS.CAMPUS_CODES_CONFIG);
    var config = JSON.parse(configJson || '[]');
    return config.map(function(item) {
      return {
        code: item.code,
        name: item.name || '',
        tel: item.tel || '',
        fax: item.fax || '',
        principal: item.principal || '',
        mobile: item.mobile || ''
      };
    });
  } catch (error) {
    Logger.log('❌ getCampusDetailsConfigエラー: ' + error);
    return [];
  }
}

/**
 * 学年設定を取得（GRADES 定数を返す）
 * 学年コードと名前はコード内で固定管理されている
 * @return {Object} 学年コード→名前のマップ（全12学年）
 */
function getGradeConfig() {
  return GRADES;
}

/**
 * 成績分析の標準偏差（σ）のデフォルト値
 * 公立高校入試の一般的な標準偏差を基準としている
 */
var DEFAULT_SIGMA = { kokugo: 15, shakai: 18, sugaku: 23, rika: 20, eigo: 20, total: 100 };

/**
 * 成績分析σ設定を取得する（未設定時はデフォルト値を返す）
 * @aiCallable
 * @return {Object} { kokugo, shakai, sugaku, rika, eigo, total, defaults }
 */
function getGradeAnalysisSigmaConfig() {
  try {
    var stored = getScriptProperty(CONFIG_PROP_KEYS.SIGMA_CONFIG);
    var config = stored ? JSON.parse(stored) : {};
    // デフォルト値と結合（未設定項目はデフォルト値で補完）
    var result = {};
    Object.keys(DEFAULT_SIGMA).forEach(function(k) {
      result[k] = (config[k] !== undefined && !isNaN(Number(config[k]))) ? Number(config[k]) : DEFAULT_SIGMA[k];
    });
    return { success: true, sigma: result, defaults: DEFAULT_SIGMA };
  } catch (error) {
    Logger.log('❌ getGradeAnalysisSigmaConfigエラー: ' + error);
    return { success: true, sigma: DEFAULT_SIGMA, defaults: DEFAULT_SIGMA };
  }
}

/**
 * 成績分析σ設定を更新する（Admin のみ）
 * @param {Object} sigmaData { kokugo, shakai, sugaku, rika, eigo, total }（数値）
 * @return {Object} { success, message, error }
 */
function updateGradeAnalysisSigmaConfig(sigmaData) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var config = {};
    Object.keys(DEFAULT_SIGMA).forEach(function(k) {
      var v = Number(sigmaData[k]);
      if (isNaN(v) || v <= 0) return { success: false, error: k + ' の値が不正です（正の数値を入力してください）' };
      config[k] = v;
    });
    setScriptProperty(CONFIG_PROP_KEYS.SIGMA_CONFIG, JSON.stringify(config));
    return { success: true, message: 'σ設定を保存しました' };
  } catch (error) {
    Logger.log('❌ updateGradeAnalysisSigmaConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 成績分析σ設定をデフォルト値にリセットする（Admin のみ）
 * @return {Object} { success, message, sigma }
 */
function resetGradeAnalysisSigmaConfig() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    // プロパティを削除することでデフォルト値が使われるようにする
    PropertiesService.getScriptProperties().deleteProperty(CONFIG_PROP_KEYS.SIGMA_CONFIG);
    return { success: true, message: 'σ設定をデフォルト値に戻しました', sigma: DEFAULT_SIGMA };
  } catch (error) {
    Logger.log('❌ resetGradeAnalysisSigmaConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// マスターデータ削除時の参照チェック（内部ヘルパー）
// ========================================

/**
 * 指定校舎コードを使用しているアクティブ生徒数を返す（削除済み除外）
 * @param {string} campusCode 校舎コード
 * @return {number} 生徒数（エラー時は0）
 */
function countStudentsByCampus_(campusCode) {
  try {
    var targetCode = String(campusCode).padStart(2, '0');
    var docs = supabaseSelect_('students',
      'campus=eq.' + encodeURIComponent(targetCode) + '&is_deleted=eq.false',
      { select: 'id' }
    );
    return docs.length;
  } catch (e) {
    Logger.log('⚠ countStudentsByCampus_エラー: ' + e);
    return 0;
  }
}

/**
 * 指定テスト名を使用している成績データ件数を全年度から返す
 * @param {string} testName テスト名
 * @return {number} 件数（エラー時は0）
 */
function countGradesByTestName_(testName) {
  try {
    var docs = supabaseSelect_('grades',
      'test_name=eq.' + encodeURIComponent(testName),
      { select: 'id' }
    );
    return docs.length;
  } catch (e) {
    Logger.log('⚠ countGradesByTestName_エラー: ' + e);
    return 0;
  }
}

/**
 * 指定志望校名を使用している成績データ件数を全年度から返す（shogaku1・shogaku2を検索）
 * @param {string} schoolName 志望校名
 * @return {number} 件数（エラー時は0）
 */
function countGradesBySchool_(schoolName) {
  try {
    // 第1志望校・第2志望校の両方を検索してユニーク件数を返す
    var docs1 = supabaseSelect_('grades',
      'shogaku1=eq.' + encodeURIComponent(schoolName),
      { select: 'id' }
    );
    var docs2 = supabaseSelect_('grades',
      'shogaku2=eq.' + encodeURIComponent(schoolName),
      { select: 'id' }
    );
    var seen = {};
    docs1.forEach(function(d) { seen[d.id] = true; });
    docs2.forEach(function(d) { seen[d.id] = true; });
    return Object.keys(seen).length;
  } catch (e) {
    Logger.log('⚠ countGradesBySchool_エラー: ' + e);
    return 0;
  }
}
