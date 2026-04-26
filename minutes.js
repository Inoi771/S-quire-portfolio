// ========================================
// 【セクション20】議事録管理
// ========================================
// 会議の音声ファイルをGemini AIで文字起こし・要約し、
// Supabaseに保存・管理する機能

// ========================================
// 議事録 CRUD
// ========================================

/**
 * 年度ごとの議事録一覧を取得する
 * @aiCallable
 * @param {number} fiscalYear 年度（例: 2025）
 * @return {Array} 議事録一覧 [{id, fiscal_year, month, title, summary, created_by, created_at, updated_at}]
 */
function getMinutesList(fiscalYear) {
  var fy = parseInt(fiscalYear, 10);
  if (isNaN(fy)) return [];
  return supabaseSelect_('meeting_minutes', 'fiscal_year=eq.' + fy, {
    order: 'month.asc',
    select: 'id,fiscal_year,month,title,summary,created_by,created_at,updated_at'
  });
}

/**
 * 議事録を保存する（新規作成/更新）
 * @aiCallable
 * @param {string} minutesDataJson JSON文字列 {id?, fiscal_year, month, title, summary}
 * @return {Object} { success: true/false, message/error }
 */
function saveMinutes(minutesDataJson) {
  try {
    var data = safeJsonParse_(minutesDataJson, null);
    if (!data) return { success: false, error: 'データの形式が正しくありません' };

    var fy = parseInt(data.fiscal_year, 10);
    var month = parseInt(data.month, 10);
    if (isNaN(fy) || isNaN(month) || month < 1 || month > 12) {
      return { success: false, error: '年度または月が正しくありません' };
    }
    if (!data.title || !data.title.trim()) {
      return { success: false, error: 'タイトルを入力してください' };
    }

    var now = new Date().toISOString();

    // IDが未指定の場合は新規作成
    if (!data.id) {
      data.id = 'min_' + fy + '_' + String(month).padStart(2, '0') + '_' + Date.now();
      data.created_at = now;
      // 作成者を設定
      var email = getCurrentUserEmail();
      var uid = _firebaseUidContext_ || null;
      var staff = resolveStaffByUid_(uid, email);
      data.created_by = staff ? staff.teacherId : (email || '');
    }

    var record = {
      id: data.id,
      fiscal_year: fy,
      month: month,
      title: data.title.trim(),
      summary: (data.summary || '').trim(),
      created_by: data.created_by || '',
      created_at: data.created_at || now,
      updated_at: now
    };

    supabaseUpsert_('meeting_minutes', record, 'id');
    Logger.log('✓ 議事録保存: ' + record.id);
    return { success: true, message: '議事録を保存しました' };
  } catch (error) {
    Logger.log('❌ 議事録保存エラー: ' + error);
    return { success: false, error: '議事録の保存に失敗しました: ' + error.toString() };
  }
}

/**
 * 議事録を削除する（Admin限定）
 * @aiCallable
 * @param {string} minutesId 議事録ID
 * @return {Object} { success: true/false, message/error }
 */
function deleteMinutes(minutesId) {
  try {
    if (!isAdmin()) {
      return { success: false, error: '削除は管理者のみ実行できます' };
    }
    if (!minutesId) {
      return { success: false, error: '議事録IDが指定されていません' };
    }

    supabaseDelete_('meeting_minutes', 'id=eq.' + encodeURIComponent(minutesId));
    Logger.log('✓ 議事録削除: ' + minutesId);
    return { success: true, message: '議事録を削除しました' };
  } catch (error) {
    Logger.log('❌ 議事録削除エラー: ' + error);
    return { success: false, error: '議事録の削除に失敗しました: ' + error.toString() };
  }
}

// ========================================
// AIアシスタント連携
// ========================================

/**
 * 過去の全議事録をAIコンテキスト用テキストに整形する
 * 年度フィルタなし・1回のSupabaseクエリで全件取得
 * @return {string} AIプロンプトに注入するテキスト（件数0なら空文字）
 */
function getMinutesContextForAI_() {
  var rows = supabaseSelect_('meeting_minutes', null, {
    order: 'fiscal_year.desc,month.desc',
    select: 'fiscal_year,month,title,summary'
  });

  if (!rows || rows.length === 0) return '';

  // 年度ごとにグルーピング
  var byYear = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var fy = r.fiscal_year;
    if (!byYear[fy]) byYear[fy] = [];
    byYear[fy].push(r);
  }

  var text = '\n\n【会議議事録（過去の全記録）】\n';
  var years = Object.keys(byYear).sort(function(a, b) { return b - a; });
  for (var y = 0; y < years.length; y++) {
    var fy = years[y];
    text += '\n── ' + fy + '年度 ──\n';
    var entries = byYear[fy];
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      text += e.month + '月「' + e.title + '」\n';
      if (e.summary) text += e.summary + '\n';
    }
  }

  return text;
}
