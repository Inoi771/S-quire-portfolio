
// ========================================
// 【セクション4】スケジュール管理
// ========================================
// PDF からの予定抽出、スケジュール更新、データ取得

/**
 * フォルダ名から子フォルダを取得
 * @param {Folder} parentFolder 親フォルダ
 * @param {string} folderName 検索するフォルダ名
 * @return {Folder|null} 見つかったフォルダ、または null
 */
function getFolderByName(parentFolder, folderName) {
  try {
    var folders = parentFolder.getFoldersByName(folderName);
    return folders.hasNext() ? folders.next() : null;
  } catch (error) {
    Logger.log('❌ getFolderByNameエラー: ' + error);
    return null;
  }
}

/**
 * フォルダ名からファイルを取得
 * @param {Folder} parentFolder 親フォルダ
 * @param {string} fileName 検索するファイル名
 * @return {File|null} 見つかったファイル、または null
 */
function getFileByName(parentFolder, fileName) {
  try {
    var files = parentFolder.getFilesByName(fileName);
    return files.hasNext() ? files.next() : null;
  } catch (error) {
    Logger.log('❌ getFileByNameエラー: ' + error);
    return null;
  }
}

/**
 * スケジュール用フォルダを取得
 * 「月間スケジュール」フォルダへのアクセスポイント
 * @return {Folder|null} 月間スケジュールフォルダ
 */
function getScheduleFolder() {
  try {
    var appFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    
    if (!appFolderId) {
      Logger.log('❌ APP_FOLDER_IDが設定されていません');
      return null;
    }
    
    var rootFolder = DriveApp.getFolderById(appFolderId);
    var scheduleFolder = getFolderByName(rootFolder, '月間スケジュール');
    
    if (!scheduleFolder) {
      Logger.log('❌ 月間スケジュールフォルダが見つかりません');
      return null;
    }
    
    return scheduleFolder;
  } catch (error) {
    Logger.log('❌ getScheduleFolderエラー: ' + error);
    return null;
  }
}

/**
 * Firestore DocId 用に文字列を安全なコンポーネントに変換する内部ヘルパー
 * @param {string} s 入力文字列
 * @return {string} 安全な文字列（最大40文字）
 */
function makeScheduleSafeId_(s) {
  return String(s || '').replace(/[^a-zA-Z0-9\u3040-\u9fff\u30A0-\u30FF]/g, '_').substring(0, 40);
}

/**
 * スケジュールエントリを Firestore に保存する内部ヘルパー
 * source が 'Admin 直接入力' の場合はタイムスタンプを DocId に含め削除を可能にする
 * source が他の値（import系）の場合はコンテンツ由来の DocId で重複除去する
 * @param {number} fiscalYear 年度
 * @param {string} schoolName 学校名
 * @param {string} eventType イベント種類
 * @param {string} dateStr 日付文字列（M月D日 形式）
 * @param {string} details 詳細
 * @param {string} source 情報源
 * @param {Array|null} batchArr バッチ書き込み用配列（null の場合は即時保存）
 * @return {Object} { docId, timestamp }
 */
function saveScheduleEntryToFirestore_(fiscalYear, schoolName, eventType, dateStr, details, source, batchArr) {
  var cleanDateStr = String(dateStr || '').replace(/\d{4}年/g, '').trim();
  var monthMatch = cleanDateStr.match(/(\d{1,2})月/);
  var month = monthMatch ? parseInt(monthMatch[1]) : 0;
  var actualYear = (month >= 1 && month <= 3) ? parseInt(fiscalYear) + 1 : parseInt(fiscalYear);
  var scheduleDisplay = actualYear + '年' + cleanDateStr;

  var now = new Date();
  var timestampMs = now.getTime();

  var docId;
  if (source === 'Admin 直接入力') {
    docId = makeScheduleSafeId_(fiscalYear) + '_admin_' + timestampMs;
  } else if (source === 'AI入力') {
    docId = makeScheduleSafeId_(fiscalYear) + '_ai_' + timestampMs;
  } else {
    docId = makeScheduleSafeId_(fiscalYear) + '_' + makeScheduleSafeId_(schoolName) + '_' +
            makeScheduleSafeId_(eventType) + '_' + makeScheduleSafeId_(cleanDateStr);
  }

  var data = {
    fiscalYear:      parseInt(fiscalYear, 10),
    schoolName:      schoolName || '',
    eventType:       eventType || '',
    dateStr:         cleanDateStr,
    details:         details || '',
    source:          source || '',
    timestamp:       now.toISOString(),
    scheduleDisplay: scheduleDisplay
  };

  if (batchArr) {
    batchArr.push({ collection: 'schedules', docId: docId, data: data });
  } else {
    firestoreSet_('schedules', docId, data);
  }

  return { docId: docId, timestamp: now.toISOString() };
}

/**
 * スケジュールデータを取得
 * Firestore の schedules コレクションから全件読み込む
 * @aiCallable
 * @return {Array} スケジュール配列
 *   各要素: { timestamp, school, eventType, schedule, details, source }
 */
function getScheduleData() {
  try {
    var docs = firestoreQuery_('schedules', []);
    var allResults = [];
    docs.forEach(function(doc) {
      allResults.push({
        timestamp: doc.timestamp || new Date().toISOString(),
        school:    doc.schoolName || '',
        eventType: doc.eventType || '',
        schedule:  doc.scheduleDisplay || '',
        details:   doc.details || '',
        source:    doc.source || ''
      });
    });
    Logger.log('✓ getScheduleData: ' + allResults.length + '件取得');
    return allResults;
  } catch (error) {
    Logger.log('❌ getScheduleData エラー: ' + error);
    return [];
  }
}

/**
 * 予定入力フォーム用：ドロップダウンの選択肢を取得
 * Firestore の schedules コレクションから現年度のデータを読み込み、頻度でソート
 * @aiCallable
 * @return {Object} { schools: [...], eventNames: [...], details: [...] }
 */
function getScheduleDropdownData() {
  try {
    var year = getCurrentFiscalYear();
    var docs = firestoreQuery_('schedules', [fsFilter_('fiscalYear', 'EQUAL', year)]);

    if (!docs || docs.length === 0) {
      return {
        schools: ['塾', 'その他'],
        eventNames: ['その他'],
        details: ['その他']
      };
    }

    var schoolCount = {};
    var eventCount = {};
    var detailCount = {};

    docs.forEach(function(doc) {
      if (doc.schoolName) schoolCount[doc.schoolName] = (schoolCount[doc.schoolName] || 0) + 1;
      if (doc.eventType)  eventCount[doc.eventType]   = (eventCount[doc.eventType]   || 0) + 1;
      if (doc.details)    detailCount[doc.details]     = (detailCount[doc.details]    || 0) + 1;
    });

    var sortByFrequency = function(countObj) {
      var sorted = Object.keys(countObj).sort(function(a, b) { return countObj[b] - countObj[a]; });
      sorted.push('その他');
      return sorted;
    };

    return {
      schools:    sortByFrequency(schoolCount),
      eventNames: sortByFrequency(eventCount),
      details:    sortByFrequency(detailCount)
    };

  } catch (error) {
    Logger.log('❌ getScheduleDropdownData エラー: ' + error);
    return {
      schools: ['塾', 'その他'],
      eventNames: ['その他'],
      details: ['その他']
    };
  }
}

/**
 * 新しい予定を Firestore に追加
 * Admin フォームから呼び出される
 * @aiCallable
 * @param {string} schoolName 学校名
 * @param {string} eventName イベント名
 * @param {string} dateStr 日付（例：7月19日（土））
 * @param {string} details 詳細（省略可）
 * @return {Object} { success, message, error }
 */
function addScheduleEntry(schoolName, eventName, dateStr, details) {
  try {
    if (!schoolName || !eventName || !dateStr) {
      return { success: false, error: '学校名、イベント名、日付は必須です' };
    }
    var year = getCurrentFiscalYear();
    saveScheduleEntryToFirestore_(year, schoolName, eventName, dateStr, details, 'Admin 直接入力', null);
    Logger.log('✓ addScheduleEntry: ' + schoolName + ' ' + dateStr);
    return { success: true, message: '予定を追加しました' };
  } catch (error) {
    Logger.log('❌ addScheduleEntry エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 管理者が自由に追加したカスタムイベントを Firestore に保存する（Admin のみ）
 * 日付から年度を自動判定して schedules コレクションに書き込む
 * @aiCallable
 * @param {string} schoolName 学校・施設名（塾/中学校名/高校名）
 * @param {string} eventName イベント名
 * @param {number} dateYear 日付の年（例: 2025）
 * @param {number} dateMonth 日付の月（例: 7）
 * @param {number} dateDay 日付の日（例: 19）
 * @param {string} details 詳細テキスト（任意）
 * @return {Object} 処理結果 { success, timestamp, fiscalYear }
 */
function addCustomScheduleEntry(schoolName, eventName, dateYear, dateMonth, dateDay, details) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    if (!schoolName || !eventName || !dateYear || !dateMonth || !dateDay) {
      return { success: false, error: '学校名・イベント名・日付は必須です' };
    }
    var fiscalYear = (dateMonth >= 4) ? dateYear : dateYear - 1;
    var dateStr = dateMonth + '月' + dateDay + '日';
    var saved = saveScheduleEntryToFirestore_(fiscalYear, schoolName, eventName, dateStr, details, 'Admin 直接入力', null);
    Logger.log('✓ addCustomScheduleEntry: ' + schoolName + ' ' + dateStr);
    return { success: true, message: '追加しました', timestamp: saved.timestamp, fiscalYear: fiscalYear };
  } catch (error) {
    Logger.log('❌ addCustomScheduleEntryエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIアシスタント経由で予定を追加する（全ユーザー対象）
 * source = 'AI入力' で保存し、タイムスタンプベースの DocId を使用する
 * @param {string} schoolName 学校名（塾 / ○○中学校 / ○○高校）
 * @param {string} eventName イベント名
 * @param {number} dateYear 年（例: 2026）
 * @param {number} dateMonth 月（例: 7）
 * @param {number} dateDay 日（例: 19）
 * @param {string} details 詳細（省略可）
 * @return {Object} { success, message, docId }
 */
function addScheduleEntryAI_(schoolName, eventName, dateYear, dateMonth, dateDay, details) {
  try {
    if (!schoolName || !eventName || !dateYear || !dateMonth || !dateDay) {
      return { success: false, error: '学校名・イベント名・日付は必須です' };
    }
    var fiscalYear = (dateMonth >= 4) ? dateYear : dateYear - 1;
    var dateStr = dateMonth + '月' + dateDay + '日';
    var saved = saveScheduleEntryToFirestore_(fiscalYear, schoolName, eventName, dateStr, details || '', 'AI入力', null);
    Logger.log('✓ addScheduleEntryAI_: ' + schoolName + ' ' + dateStr);
    return { success: true, message: '予定を追加しました', docId: saved.docId };
  } catch (error) {
    Logger.log('❌ addScheduleEntryAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIアシスタント向けにカスタムイベント一覧を返す（全ユーザー対象）
 * source が「Admin 直接入力」または「AI入力」のエントリを返す
 * @return {Array} [{ docId, school, eventType, schedule, details, source }]
 */
function getCustomScheduleEntriesForAI_() {
  try {
    var docs = firestoreQuery_('schedules', []);
    return docs
      .filter(function(doc) {
        return doc.source === 'Admin 直接入力' || doc.source === 'AI入力';
      })
      .map(function(doc) {
        return {
          docId:     doc._id || '',
          school:    doc.schoolName || '',
          eventType: doc.eventType || '',
          schedule:  doc.scheduleDisplay || '',
          details:   doc.details || '',
          source:    doc.source || ''
        };
      });
  } catch (error) {
    Logger.log('❌ getCustomScheduleEntriesForAI_エラー: ' + error);
    return [];
  }
}

/**
 * AIアシスタント経由でカスタムイベントを変更する（全ユーザー対象）
 * Admin 直接入力・AI入力のエントリのみ変更可
 * @param {string} docId 対象ドキュメントID
 * @param {Object} changes 変更フィールド { schoolName, eventType, dateYear, dateMonth, dateDay, details }
 * @return {Object} { success, message }
 */
function editScheduleEntryAI_(docId, changes) {
  try {
    var doc = firestoreGet_('schedules', docId);
    if (!doc) return { success: false, error: '予定が見つかりません' };
    if (doc.source !== 'Admin 直接入力' && doc.source !== 'AI入力') {
      return { success: false, error: 'この予定は変更できません' };
    }
    var schoolName = changes.schoolName || doc.schoolName;
    var eventType  = changes.eventType  || doc.eventType;
    var details    = (changes.details !== undefined) ? changes.details : doc.details;
    var dateStr    = doc.dateStr;
    var fiscalYear = doc.fiscalYear;
    if (changes.dateYear && changes.dateMonth && changes.dateDay) {
      fiscalYear = (changes.dateMonth >= 4) ? changes.dateYear : changes.dateYear - 1;
      dateStr = changes.dateMonth + '月' + changes.dateDay + '日';
    }
    var monthMatch = dateStr.match(/(\d{1,2})月/);
    var month = monthMatch ? parseInt(monthMatch[1]) : 0;
    var calcYear = (month >= 1 && month <= 3) ? parseInt(fiscalYear) + 1 : parseInt(fiscalYear);
    var scheduleDisplay = calcYear + '年' + dateStr;
    var updatedData = {
      fiscalYear:      parseInt(fiscalYear, 10),
      schoolName:      schoolName,
      eventType:       eventType,
      dateStr:         dateStr,
      details:         details,
      source:          doc.source,
      timestamp:       doc.timestamp,
      scheduleDisplay: scheduleDisplay
    };
    firestoreSet_('schedules', docId, updatedData);
    Logger.log('✓ editScheduleEntryAI_: ' + docId);
    return { success: true, message: '予定を更新しました' };
  } catch (error) {
    Logger.log('❌ editScheduleEntryAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIアシスタント経由でカスタムイベントを削除する（全ユーザー対象）
 * Admin 直接入力・AI入力のエントリのみ削除可
 * @param {string} docId 対象ドキュメントID
 * @return {Object} { success, message }
 */
function deleteScheduleEntryAI_(docId) {
  try {
    var doc = firestoreGet_('schedules', docId);
    if (!doc) return { success: false, error: '予定が見つかりません' };
    if (doc.source !== 'Admin 直接入力' && doc.source !== 'AI入力') {
      return { success: false, error: 'この予定は削除できません' };
    }
    firestoreDelete_('schedules', docId);
    Logger.log('✓ deleteScheduleEntryAI_: ' + docId);
    return { success: true, message: '予定を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteScheduleEntryAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIアシスタント向けに全スケジュールエントリを返す（3ヶ月ウィンドウ）
 * 1ヶ月前〜2ヶ月先のエントリをフィルタして返す（トークン節約）
 * @return {Array} [{ docId, school, eventType, schedule, details, source }]
 */
function getAllScheduleEntriesForAI_() {
  try {
    var docs = firestoreQuery_('schedules', []);
    var now = new Date();
    var windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var windowEnd   = new Date(now.getFullYear(), now.getMonth() + 3, 0);

    return docs
      .filter(function(doc) {
        var display = doc.scheduleDisplay || '';
        var m = display.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (!m) return false;
        var entryDate = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
        return entryDate >= windowStart && entryDate <= windowEnd;
      })
      .map(function(doc) {
        return {
          docId:     doc._id || '',
          school:    doc.schoolName || '',
          eventType: doc.eventType || '',
          schedule:  doc.scheduleDisplay || '',
          details:   doc.details || '',
          source:    doc.source || ''
        };
      });
  } catch (error) {
    Logger.log('❌ getAllScheduleEntriesForAI_エラー: ' + error);
    return [];
  }
}

/**
 * AIアシスタント経由で任意のスケジュールエントリを変更する（source制限なし）
 * import系エントリの場合は source を 'AI更新' に変更し、新docIdに移行する
 * @param {string} docId 対象ドキュメントID
 * @param {Object} changes 変更フィールド { schoolName, eventType, dateYear, dateMonth, dateDay, details }
 * @return {Object} { success, message }
 */
function editScheduleEntryAI_Extended_(docId, changes) {
  try {
    var doc = firestoreGet_('schedules', docId);
    if (!doc) return { success: false, error: '予定が見つかりません' };

    var isCustom = (doc.source === 'Admin 直接入力' || doc.source === 'AI入力' || doc.source === 'AI更新');

    var schoolName = changes.schoolName || doc.schoolName;
    var eventType  = changes.eventType  || doc.eventType;
    var details    = (changes.details !== undefined) ? changes.details : doc.details;
    var dateStr    = doc.dateStr;
    var fiscalYear = doc.fiscalYear;
    if (changes.dateYear && changes.dateMonth && changes.dateDay) {
      fiscalYear = (changes.dateMonth >= 4) ? changes.dateYear : changes.dateYear - 1;
      dateStr = changes.dateMonth + '月' + changes.dateDay + '日';
    }
    var monthMatch = dateStr.match(/(\d{1,2})月/);
    var month = monthMatch ? parseInt(monthMatch[1]) : 0;
    var calcYear = (month >= 1 && month <= 3) ? parseInt(fiscalYear) + 1 : parseInt(fiscalYear);
    var scheduleDisplay = calcYear + '年' + dateStr;

    var newSource = isCustom ? doc.source : 'AI更新';
    var updatedData = {
      fiscalYear:      parseInt(fiscalYear, 10),
      schoolName:      schoolName,
      eventType:       eventType,
      dateStr:         dateStr,
      details:         details,
      source:          newSource,
      timestamp:       doc.timestamp,
      scheduleDisplay: scheduleDisplay
    };
    if (!isCustom) {
      updatedData.originalSource = doc.source;
    }

    if (isCustom) {
      // カスタムエントリはそのまま上書き
      firestoreSet_('schedules', docId, updatedData);
    } else {
      // import系: 新しいタイムスタンプベースのdocIdに移行し、旧docIdを削除
      var newDocId = makeScheduleSafeId_(fiscalYear) + '_ai_' + new Date().getTime();
      updatedData.timestamp = new Date().toISOString();
      firestoreSet_('schedules', newDocId, updatedData);
      firestoreDelete_('schedules', docId);
    }

    Logger.log('✓ editScheduleEntryAI_Extended_: ' + docId);
    return { success: true, message: '予定を更新しました' };
  } catch (error) {
    Logger.log('❌ editScheduleEntryAI_Extended_エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIアシスタント経由で任意のスケジュールエントリを削除する（source制限なし）
 * @param {string} docId 対象ドキュメントID
 * @return {Object} { success, message }
 */
function deleteScheduleEntryAI_Extended_(docId) {
  try {
    var doc = firestoreGet_('schedules', docId);
    if (!doc) return { success: false, error: '予定が見つかりません' };
    firestoreDelete_('schedules', docId);
    Logger.log('✓ deleteScheduleEntryAI_Extended_: ' + docId);
    return { success: true, message: '予定を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteScheduleEntryAI_Extended_エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Admin が手動で追加したカスタムイベントを全年度分取得する（Admin のみ）
 * Firestore の schedules コレクションから source が「Admin 直接入力」のドキュメントのみ返す
 * @return {Array} カスタムイベントの配列 [{ fiscalYear, docId, timestamp, school, eventType, schedule, details }]
 */
function getAdminScheduleEntries() {
  if (!isAdmin()) return [];
  try {
    var docs = firestoreQuery_('schedules', [fsFilter_('source', 'EQUAL', 'Admin 直接入力')]);
    return docs.map(function(doc) {
      return {
        fiscalYear: doc.fiscalYear || 0,
        docId:      doc._id || '',
        timestamp:  doc.timestamp || '',
        school:     doc.schoolName || '',
        eventType:  doc.eventType || '',
        schedule:   doc.scheduleDisplay || '',
        details:    doc.details || ''
      };
    });
  } catch (error) {
    Logger.log('❌ getAdminScheduleEntriesエラー: ' + error);
    return [];
  }
}

/**
 * Admin が手動で追加したカスタムイベントを1件削除する（Admin のみ）
 * タイムスタンプから DocId を再構築して Firestore から削除する
 * DocId パターン: {fiscalYear}_admin_{timestampMs}
 * @param {number} fiscalYear 年度
 * @param {string} timestampStr ISO形式のタイムスタンプ文字列
 * @return {Object} 処理結果
 */
function deleteCustomScheduleEntry(fiscalYear, timestampStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var timestampMs = new Date(timestampStr).getTime();
    if (isNaN(timestampMs)) return { success: false, error: 'タイムスタンプが不正です' };
    var docId = makeScheduleSafeId_(fiscalYear) + '_admin_' + timestampMs;
    firestoreDelete_('schedules', docId);
    Logger.log('✓ deleteCustomScheduleEntry: ' + docId);
    return { success: true, message: '削除しました' };
  } catch (error) {
    Logger.log('❌ deleteCustomScheduleEntryエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * スケジュール管理情報（ログ出力のみ）
 * 実際の予定入力は Admin フォームから実施
 *
 * @return {Object} { success, message }
 */
function updateSchedules() {
  try {
    
    var scheduleFolder = getScheduleFolder();
    
    if (!scheduleFolder) {
      Logger.log('❌ スケジュールフォルダが取得できません');
      return { success: false, count: 0, error: 'スケジュールフォルダが見つかりません' };
    }
    
    var totalCount = 0;
    var yearFolders = scheduleFolder.getFolders();
    
    while (yearFolders.hasNext()) {
      var yearFolder = yearFolders.next();
      var folderName = yearFolder.getName();
      
      // 4桁の年度フォルダのみ処理
      if (!/^\d{4}$/.test(folderName)) {
        Logger.log('⚠ スキップ（非年度フォルダ）: ' + folderName);
        continue;
      }
      
      var year = parseInt(folderName);
      
      // 新しい autoImportAllSchedules 関数を呼び出し
      var result = autoImportAllSchedules(year);
      
      if (result && result.success) {
        totalCount += result.totalCount;
      }
    }
    
    
    return {
      success: true,
      count: totalCount,
      message: totalCount + '件の予定を更新しました'
    };
    
  } catch (error) {
    Logger.log('❌ updateSchedules エラー: ' + error);
    return { success: false, count: 0, error: error.toString() };
  }
}


// ========================================


// ========================================
// 【セクション13】基礎学力テスト日程管理
// ========================================
// 中学校共通の基礎学力テスト日程（自動計算 + 年度別上書き設定）を管理する
// プロパティキー: BASIC_TEST_DATES（JSON）
// 例: {"2025-1": "2025/10/01", "2025-2": "2025/11/12", "2025-3": "2026/01/09"}

/**
 * 基礎学力テスト日程の上書き設定を取得する
 * @aiCallable
 * @return {Object} 上書き設定オブジェクト（例: {"2025-1": "2025/10/01"}）
 */
function getBasicTestDateOverrides() {
  try {
    var raw = getProperty('BASIC_TEST_DATES');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getBasicTestDateOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 基礎学力テスト日程を上書き設定する（Admin のみ）
 * @param {number} academicYear 学年年度（例: 2025 → 2025-2026年度）
 * @param {number} testNum テスト番号（1, 2, 3）
 * @param {string} dateStr 日付文字列（例: "2025/10/01"）
 * @return {Object} 処理結果
 */
function setBasicTestDateOverride(academicYear, testNum, dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    var key = academicYear + '-' + testNum;
    overrides[key] = dateStr;
    setProperty('BASIC_TEST_DATES', JSON.stringify(overrides));
    return { success: true, message: '日程を設定しました' };
  } catch (error) {
    Logger.log('❌ setBasicTestDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テスト日程の上書き設定を削除する（Admin のみ）
 * 削除後は自動計算値が使用される
 * @param {number} academicYear 学年年度（例: 2025）
 * @param {number} testNum テスト番号（1, 2, 3）
 * @return {Object} 処理結果
 */
function deleteBasicTestDateOverride(academicYear, testNum) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    var key = academicYear + '-' + testNum;
    delete overrides[key];
    setProperty('BASIC_TEST_DATES', JSON.stringify(overrides));
    return { success: true, message: '上書き設定を削除しました（自動計算に戻ります）' };
  } catch (error) {
    Logger.log('❌ deleteBasicTestDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テストの詳細テキスト上書き設定を全取得
 * @aiCallable
 * @return {Object} 上書き設定 {"2025-1": "中3 全員", ...}
 */
function getBasicTestDetails() {
  try {
    var raw = getProperty('BASIC_TEST_DETAILS');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getBasicTestDetailsエラー: ' + error);
    return {};
  }
}

/**
 * 基礎学力テストの詳細テキストを上書き保存（Admin のみ）
 * @param {number} academicYear 年度
 * @param {number} testNum テスト番号（1/2/3）
 * @param {string} details 詳細テキスト
 * @return {Object} 処理結果
 */
function setBasicTestDetails(academicYear, testNum, details) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DETAILS');
    var obj = raw ? JSON.parse(raw) : {};
    obj[academicYear + '-' + testNum] = details || '';
    setProperty('BASIC_TEST_DETAILS', JSON.stringify(obj));
    return { success: true, message: '保存しました' };
  } catch (error) {
    Logger.log('❌ setBasicTestDetailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 基礎学力テストの詳細テキスト上書きを削除してデフォルト（中3）に戻す（Admin のみ）
 * @param {number} academicYear 年度
 * @param {number} testNum テスト番号
 * @return {Object} 処理結果
 */
function deleteBasicTestDetails(academicYear, testNum) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('BASIC_TEST_DETAILS');
    var obj = raw ? JSON.parse(raw) : {};
    delete obj[academicYear + '-' + testNum];
    setProperty('BASIC_TEST_DETAILS', JSON.stringify(obj));
    return { success: true, message: 'デフォルト（中3）に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteBasicTestDetailsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 公立高校一般選抜の日程上書き設定を全取得
 * @aiCallable
 * @return {Object} 上書き設定（例: {"2025": "2026/03/11"}）
 */
function getPublicHighExamDateOverrides() {
  try {
    var raw = getProperty('PUBLIC_HIGH_EXAM_DATES');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getPublicHighExamDateOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 公立高校一般選抜の日程を上書き保存する（Admin のみ）
 * @param {number} academicYear 学年年度（例: 2025 → 2026年3月試験）
 * @param {string} dateStr 試験1日目の日付（例: "2026/03/11"）
 * @return {Object} 処理結果
 */
function setPublicHighExamDateOverride(academicYear, dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('PUBLIC_HIGH_EXAM_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    overrides[String(academicYear)] = dateStr;
    setProperty('PUBLIC_HIGH_EXAM_DATES', JSON.stringify(overrides));
    return { success: true, message: '日程を設定しました' };
  } catch (error) {
    Logger.log('❌ setPublicHighExamDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 公立高校一般選抜の日程上書き設定を削除し自動計算に戻す（Admin のみ）
 * @param {number} academicYear 学年年度
 * @return {Object} 処理結果
 */
function deletePublicHighExamDateOverride(academicYear) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('PUBLIC_HIGH_EXAM_DATES');
    var overrides = raw ? JSON.parse(raw) : {};
    delete overrides[String(academicYear)];
    setProperty('PUBLIC_HIGH_EXAM_DATES', JSON.stringify(overrides));
    return { success: true, message: '上書き設定を削除しました（自動計算に戻ります）' };
  } catch (error) {
    Logger.log('❌ deletePublicHighExamDateOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 塾内部イベント（○□★△）の上書き設定を全取得
 * @aiCallable
 * @return {Object} 上書き設定 {"report_2025_4": {"date": "2025/4/21", "details": ""}, "meeting_2025_4": false, ...}
 */
function getJukuEventOverrides() {
  try {
    var raw = getProperty('JUKU_EVENT_OVERRIDES');
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getJukuEventOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 塾内部イベントの上書き設定を保存（Admin のみ）
 * @param {string} type イベント種別（"report"/"meeting"/"debit"/"email"）
 * @param {number} year 年
 * @param {number} month 月
 * @param {string} dateStr 日付文字列 "YYYY/M/D"、または "none"（無効化）
 * @param {string} details 詳細テキスト
 * @return {Object} 処理結果
 */
function setJukuEventOverride(type, year, month, dateStr, details) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var key = type + '_' + year + '_' + month;
    var raw = getProperty('JUKU_EVENT_OVERRIDES');
    var overrides = raw ? JSON.parse(raw) : {};
    if (dateStr === 'none') {
      overrides[key] = false; // 無効化（その月はイベントなし）
    } else {
      overrides[key] = { date: dateStr, details: details || '' };
    }
    setProperty('JUKU_EVENT_OVERRIDES', JSON.stringify(overrides));
    return { success: true, message: '保存しました' };
  } catch (error) {
    Logger.log('❌ setJukuEventOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 塾内部イベントの上書き設定を削除して自動計算に戻す（Admin のみ）
 * @param {string} type イベント種別
 * @param {number} year 年
 * @param {number} month 月
 * @return {Object} 処理結果
 */
function deleteJukuEventOverride(type, year, month) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var key = type + '_' + year + '_' + month;
    var raw = getProperty('JUKU_EVENT_OVERRIDES');
    var overrides = raw ? JSON.parse(raw) : {};
    delete overrides[key];
    setProperty('JUKU_EVENT_OVERRIDES', JSON.stringify(overrides));
    return { success: true, message: '自動計算に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteJukuEventOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 予定タブ用の休校日上書き設定（追加・削除）を全取得
 * @aiCallable
 * @return {Object} {add: ["YYYY-MM-DD", ...], del: ["YYYY-MM-DD", ...]}
 */
function getClosedDayOverrides() {
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    return { add: obj.add || [], del: obj.del || [] };
  } catch (error) {
    Logger.log('❌ getClosedDayOverridesエラー: ' + error);
    return { add: [], del: [] };
  }
}

/**
 * 予定タブに休校日を追加（計算外の臨時休校など）（Admin のみ）
 * @param {string} dateStr "YYYY-MM-DD" 形式の日付
 * @return {Object} 処理結果
 */
function addClosedDayExtra(dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    obj.add = obj.add || [];
    obj.del = obj.del || [];
    if (obj.add.indexOf(dateStr) === -1) obj.add.push(dateStr);
    obj.del = obj.del.filter(function(d) { return d !== dateStr; });
    setProperty('CLOSED_DAYS_OVERRIDES', JSON.stringify(obj));
    return { success: true, message: dateStr + ' を休校日に追加しました' };
  } catch (error) {
    Logger.log('❌ addClosedDayExtraエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 計算上は休校日だが予定タブでは開校日とする（Admin のみ）
 * @param {string} dateStr "YYYY-MM-DD" 形式の日付
 * @return {Object} 処理結果
 */
function removeComputedClosedDay(dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    obj.add = obj.add || [];
    obj.del = obj.del || [];
    if (obj.del.indexOf(dateStr) === -1) obj.del.push(dateStr);
    obj.add = obj.add.filter(function(d) { return d !== dateStr; });
    setProperty('CLOSED_DAYS_OVERRIDES', JSON.stringify(obj));
    return { success: true, message: dateStr + ' を開校日に変更しました' };
  } catch (error) {
    Logger.log('❌ removeComputedClosedDayエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 休校日の上書き設定を削除して元の計算値に戻す（Admin のみ）
 * @param {string} dateStr "YYYY-MM-DD" 形式の日付
 * @return {Object} 処理結果
 */
function deleteClosedDayOverride(dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var raw = getProperty('CLOSED_DAYS_OVERRIDES');
    var obj = raw ? JSON.parse(raw) : {};
    obj.add = (obj.add || []).filter(function(d) { return d !== dateStr; });
    obj.del = (obj.del || []).filter(function(d) { return d !== dateStr; });
    setProperty('CLOSED_DAYS_OVERRIDES', JSON.stringify(obj));
    return { success: true, message: '元の設定に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteClosedDayOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// 講習日程締切の手動上書き設定管理
// プロパティキー: LECTURE_DEADLINE_OVERRIDES（JSON）
// 例: {"2025-summer": "2025-06-15", "2026-spring": "2026-02-10"}
// ----------------------------------------

/**
 * 講習日程締切の上書き設定を全件取得する
 * @aiCallable
 * @return {Object} 上書き設定オブジェクト（例: {"2025-summer": "2025-06-15"}）
 */
function getLectureDeadlineOverrides() {
  try {
    var raw = getProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    Logger.log('❌ getLectureDeadlineOverridesエラー: ' + error);
    return {};
  }
}

/**
 * 指定講習の締切日を手動で上書き設定する（Admin のみ）
 * @param {string} lectureId 講習ID（例: "2025-summer"）
 * @param {string} dateStr 締切日（YYYY-MM-DD形式）
 * @return {Object} 処理結果
 */
function setLectureDeadlineOverride(lectureId, dateStr) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var overrides = safeJsonParse_(getProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES), {});
    overrides[lectureId] = dateStr;
    setProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES, JSON.stringify(overrides));
    logAdminAction('講習日程締切上書き', 'lectureId=' + lectureId + ', date=' + dateStr);
    return { success: true, message: '締切日を上書きしました' };
  } catch (error) {
    Logger.log('❌ setLectureDeadlineOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定講習の締切日上書き設定を削除して自動計算に戻す（Admin のみ）
 * @param {string} lectureId 講習ID（例: "2025-summer"）
 * @return {Object} 処理結果
 */
function deleteLectureDeadlineOverride(lectureId) {
  if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
  try {
    var overrides = safeJsonParse_(getProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES), {});
    delete overrides[lectureId];
    setProperty(PROP_KEYS.LECTURE_DEADLINE_OVERRIDES, JSON.stringify(overrides));
    logAdminAction('講習日程締切上書き削除', 'lectureId=' + lectureId);
    return { success: true, message: '自動計算に戻しました' };
  } catch (error) {
    Logger.log('❌ deleteLectureDeadlineOverrideエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【セクション14】公立平均点データ取得
// ========================================
// 外部サイトから基礎学力テストの公立平均点を取得し、スプレッドシートに保存する機能

/**
 * 【テスト用】外部サイトから公立平均点ページを取得できるか確認する
 * GASエディタから手動実行して、ログで結果を確認してください
 */
function testFetchPublicAverageScorePage() {
  var url = 'https://tokushima-tsubasa.com/ace-striker/\u57FA\u790E\u5B66\u529B\u30C6\u30B9\u30C8\u60C5\u5831\u30DA\u30FC\u30B8/';

  try {

    // まずデフォルトのリクエストで試す
    var response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    var statusCode = response.getResponseCode();

    if (statusCode !== 200) {
      Logger.log('❌ ページ取得失敗。ステータスコード: ' + statusCode);
      return;
    }

    var html = response.getContentText('UTF-8');

    // 取得したHTMLの先頭500文字を確認
    Logger.log(html.substring(0, 500));

    // 「平均」「点」などのキーワードが含まれるか確認
    var hasAvgKeyword = html.indexOf('平均') !== -1;
    var hasScoreKeyword = html.indexOf('点') !== -1;
    var hasTableKeyword = html.indexOf('<table') !== -1 || html.indexOf('<td') !== -1;


    // 「平均」の周辺テキストを抽出してサンプル表示
    if (hasAvgKeyword) {
      var idx = html.indexOf('平均');
      Logger.log(html.substring(Math.max(0, idx - 100), idx + 200));
    }


  } catch (error) {
    Logger.log('❌ エラー発生: ' + error);
  }
}

// ========================================
// S14-B: オーバーライド一括取得
// ========================================

/**
 * カレンダー表示用のオーバーライド系データ7種を一括取得する
 * 起動時の HTTP リクエスト数を 7→1 に削減するためのバンドル関数
 * @aiCallable
 * @return {Object} { basicTestDates, basicTestDetails, jukuEvents, closedDays, pubHighExamDates, lecturePeriods, lectureDeadlines }
 */
function getScheduleOverridesBundle() {
  try {
    var result = {
      basicTestDates: getBasicTestDateOverrides(),
      basicTestDetails: getBasicTestDetails(),
      jukuEvents: getJukuEventOverrides(),
      closedDays: getClosedDayOverrides(),
      pubHighExamDates: getPublicHighExamDateOverrides(),
      lecturePeriods: getLecturePeriods(),
      lectureDeadlines: getLectureDeadlineOverrides()
    };
    Logger.log('✓ getScheduleOverridesBundle: 7種一括取得完了');
    return result;
  } catch (error) {
    Logger.log('❌ getScheduleOverridesBundleエラー: ' + error);
    return {
      basicTestDates: {},
      basicTestDetails: {},
      jukuEvents: {},
      closedDays: { add: [], del: [] },
      pubHighExamDates: {},
      lecturePeriods: [],
      lectureDeadlines: {}
    };
  }
}
