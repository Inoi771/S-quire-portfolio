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
// AI文字起こし + 要約
// ========================================

/**
 * 音声データを文字起こしして要約を生成する（小ファイル用: 9MB未満）
 * 文字起こし結果は保存せず、要約生成にのみ使用する
 * @aiCallable
 * @param {string} base64 音声のbase64データ
 * @param {string} mimeType MIME型（audio/mp4, audio/mpeg 等）
 * @return {Object} { success, summary } または { success: false, error }
 */
function transcribeAndSummarizeAudio(base64, mimeType) {
  try {
    if (!base64 || !mimeType) {
      return { success: false, error: '音声データが不正です' };
    }

    // ファイルサイズ検証（base64 → バイト換算）
    var estimatedSize = Math.floor(base64.length * 3 / 4);
    var MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB（Gemini inlineData上限）
    if (estimatedSize > MAX_AUDIO_SIZE) {
      return { success: false, error: 'ファイルサイズが大きすぎます（上限: 20MB）。分割してアップロードしてください' };
    }

    // Step 1: 文字起こし
    var transcriptResult = transcribeAudioDirect_(base64, mimeType);
    if (!transcriptResult.success) {
      return transcriptResult;
    }

    // Step 2: 要約生成
    var summaryResult = generateMeetingSummary_(transcriptResult.transcript);
    if (!summaryResult.success) {
      return summaryResult;
    }

    return { success: true, summary: summaryResult.summary };
  } catch (error) {
    Logger.log('❌ 音声処理エラー: ' + error);
    return { success: false, error: '音声の処理に失敗しました: ' + error.toString() };
  }
}

/**
 * 複数チャンクの文字起こし結果を統合して要約を生成する（大ファイル用: 9MB以上）
 * 文字起こし結果は保存せず、要約生成にのみ使用する
 * @aiCallable
 * @param {string} transcriptsJson JSON文字列化された文字起こし配列
 * @return {Object} { success, summary } または { success: false, error }
 */
function mergeTranscriptsAndSummarize(transcriptsJson) {
  try {
    var transcripts = safeJsonParse_(transcriptsJson, []);
    if (!transcripts.length) {
      return { success: false, error: '文字起こしデータがありません' };
    }

    var fullTranscript = transcripts.join('\n\n---\n\n');
    var summaryResult = generateMeetingSummary_(fullTranscript);
    if (!summaryResult.success) {
      return summaryResult;
    }

    return { success: true, summary: summaryResult.summary };
  } catch (error) {
    Logger.log('❌ 統合要約エラー: ' + error);
    return { success: false, error: '要約の生成に失敗しました: ' + error.toString() };
  }
}

// ========================================
// 内部ヘルパー
// ========================================

/**
 * Gemini APIで音声を文字起こしする
 * @param {string} base64 音声のbase64データ
 * @param {string} mimeType MIME型
 * @return {Object} { success, transcript } または { success: false, error }
 */
function transcribeAudioDirect_(base64, mimeType) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) {
      return { success: false, error: 'Gemini APIキーが設定されていません' };
    }

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    var payload = {
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType, data: base64 } },
          { text: '以下の会議音声を正確に文字起こししてください。\n\n' +
                  '要件:\n' +
                  '- 話者の区別が可能な場合は「話者A:」「話者B:」のように区別してください\n' +
                  '- 聞き取れない部分は「（聞き取り不可）」と記載してください\n' +
                  '- 句読点を適切に入れ、読みやすく整形してください\n' +
                  '- 相槌や言い淀みは省略して構いません' }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192
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
    var parts = (result.candidates[0].content.parts || []);
    var textPart = parts.filter(function(p) { return !p.thought; }).pop();
    var transcript = textPart ? (textPart.text || '').trim() : '';

    if (!transcript) {
      return { success: false, error: '文字起こし結果が空です。音声が正しく認識できませんでした' };
    }

    return { success: true, transcript: transcript };
  } catch (error) {
    Logger.log('❌ 文字起こしエラー: ' + error);
    return { success: false, error: '文字起こしに失敗しました: ' + error.toString() };
  }
}

/**
 * 文字起こしテキストから会議の要約を生成する
 * @param {string} transcript 文字起こし全文
 * @return {Object} { success, summary } または { success: false, error }
 */
function generateMeetingSummary_(transcript) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) {
      return { success: false, error: 'Gemini APIキーが設定されていません' };
    }

    var prompt = '以下は個別指導塾の会議の文字起こしです。\n' +
      '要点を分かりやすく要約してください。\n\n' +
      '以下の観点を含めてください:\n' +
      '■ 議題と決定事項\n' +
      '■ 各議題の主な議論内容\n' +
      '■ 次回までのアクションアイテム（担当者がわかれば記載）\n' +
      '■ その他重要な共有事項\n\n' +
      '書式:\n' +
      '- 各セクションは「■」で始めてください\n' +
      '- 箇条書きで簡潔に記載してください\n' +
      '- 専門用語があればそのまま使用してください\n\n' +
      '文字起こし:\n' + transcript;

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    var payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096
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
    var parts = (result.candidates[0].content.parts || []);
    var textPart = parts.filter(function(p) { return !p.thought; }).pop();
    var summary = textPart ? (textPart.text || '').trim() : '';

    if (!summary) {
      return { success: false, error: '要約の生成結果が空です' };
    }

    return { success: true, summary: summary };
  } catch (error) {
    Logger.log('❌ 要約生成エラー: ' + error);
    return { success: false, error: '要約の生成に失敗しました: ' + error.toString() };
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
