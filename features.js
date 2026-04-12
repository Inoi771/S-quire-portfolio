// ========================================
// 【セクション9】AI アシスタント
// ========================================
// Gemini API との連携、自然言語処理、設定変更・Q&A

/**
 * 喋り方コードから口調指示文を返す（プロンプト組み立て用）
 * 判断・機能ロジックには影響しない表現のみを変える
 * @param {string} personality 喋り方コード
 * @return {string} 口調の指示文
 */
function getPersonalityInstruction(personality) {
  var styles = {
    'polite':    '丁寧語・敬語を使用する（「です」「ます」調）。なれなれしい言葉・タメ口・砕けた表現は使わない。',
    'friendly':  '親しみやすい口調で話す。「〜だね」「〜だよ」「〜ね」などを使い、柔らかく話しかける。丁寧さは保ちつつも堅苦しくならないようにする。',
    'energetic': '明るく元気な口調で話す。「〜だよ！」「やった！」など感嘆符を適度に使い、ポジティブな言葉を選ぶ。',
    'cool':      '短く簡潔に答える。余計な言葉を省き、要点のみを伝える。感情表現は最小限にする。',
    'kansai':    '関西弁（大阪・京都の口調）で自然に話す。「〜やん」「〜やで」「〜やろ」「〜ちゃう」「〜まっか」などを使う。',
    'hakata':    '博多弁（福岡の口調）で自然に話す。「〜とよ」「〜ばい」「〜けん」「〜やけん」「〜たい」などを使う。',
    'tohoku':    '東北弁（仙台・青森の口調）で自然に話す。「〜だっちゃ」「〜だべ」「〜だがら」「〜さ」などを使う。',
    'nagoya':    '名古屋弁（愛知の口調）で自然に話す。「〜だがや」「〜だもんで」「〜でかゃ」「〜みゃ〜」などを使う。',
    'awa':       '阿波弁（徳島の口調）で自然に話す。「〜じゃ」「〜けん」「〜ぞな」「〜いな」「〜やろかい」などを使う。'
  };
  return styles[personality] || styles['polite'];
}

/**
 * メッセージの意図を正規表現ベースで分類する（条件付きコンテキスト読み込み用）
 * 直前のAI応答も考慮してフォローアップに対応する
 * @param {string} message ユーザーメッセージ
 * @param {Array} chatHistory 会話履歴配列
 * @return {Object} { grades, pricing, lectures, operations, students, settings, schedule, navigation }
 */
function classifyMessageIntent_(message, chatHistory) {
  var detected = {
    grades:        /成績|テスト|点数|偏差値|分析|一覧|レポート|成績入力|登録.*点|生徒ID/.test(message),
    pricing:       /料金|月謝|費用|授業料|値段|いくら|支払|金額/.test(message),
    lectures:      /講習|エントリ|授業.*[追削変]|コマ.*[追削変]|日程.*[追削変]|時間割|春期|夏期|冬期|基礎学力|入試直前|私.*コマ|自分.*コマ|マイ日程|自分.*日程|私.*日程|コマ.*教えて|コマ.*確認|いつ.*授業|授業.*いつ|私.*授業|自分.*授業|コマ.*カレンダー|カレンダー.*コマ|カレンダー.*エクスポート|ICS/.test(message),
    operations:    /休校|開校|テスト日|入試日|ミーティング|報告書|引落|イベント/.test(message),
    students:      /生徒.*登録|生徒.*追加|新しい生徒|生徒数|何人|転塾|退塾/.test(message),
    settings:      /設定|テーマ|色.*変え|名前.*変え|喋り方|口調/.test(message),
    schedule:      /予定|カレンダー|スケジュール|来月|先月|今月|\d+月.*予定|予定.*[追加変更削除]|[追加変更削除].*予定/.test(message),
    scheduleWrite: /予定.*[追加変更削除登録]|[追加変更削除登録].*予定/.test(message),
    navigation:    /見せて|開いて|表示して|タブ|画面/.test(message),
    placement:     /配置|勤務|どこ.*校|どの.*校|校舎.*誰|誰.*いる|出勤|先生.*どこ|講師.*どこ|曜日.*校舎/.test(message)
  };
  // 直前のAI応答から文脈を引き継ぐ（フォローアップ対応）
  if (chatHistory && chatHistory.length > 0) {
    var lastAi = null;
    for (var i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'ai') { lastAi = chatHistory[i]; break; }
    }
    if (lastAi && lastAi.text) {
      if (/成績|テスト|分析/.test(lastAi.text)) detected.grades = true;
      if (/講習|授業/.test(lastAi.text)) detected.lectures = true;
      if (/料金|月謝/.test(lastAi.text)) detected.pricing = true;
      if (/予定|カレンダー/.test(lastAi.text)) detected.schedule = true;
      if (/配置|勤務|校舎.*講師/.test(lastAi.text)) detected.placement = true;
    }
  }
  return detected;
}

/**
 * チャットメッセージからテスト分析用の年度を検出
 * @param {string} message ユーザーメッセージ
 * @param {number} currentYear 現在の学年年度
 * @return {number} 対象年度
 */
function detectAnalysisYear_(message, currentYear) {
  if (/去年|昨年度|昨年/.test(message)) return currentYear - 1;
  if (/来年|来年度/.test(message)) return currentYear + 1;
  var m = message.match(/(\d{4})年/);
  if (m) return parseInt(m[1], 10);
  return currentYear;
}

/**
 * チャットメッセージからテスト名を検出（テスト名一覧との部分一致）
 * @param {string} message ユーザーメッセージ
 * @param {string[]} testNames 登録済みテスト名一覧
 * @return {string|null} マッチしたテスト名、なければnull
 */
function detectAnalysisTestName_(message, testNames) {
  for (var i = 0; i < testNames.length; i++) {
    if (message.indexOf(testNames[i]) >= 0) return testNames[i];
  }
  return null;
}

/**
 * 保存済み分析がない場合のその場集計コンテキストを構築
 * getCampusAverages / getSchoolAverages を使って校舎別平均・学校平均を取得し、
 * Gemini が解釈・説明できる形式の文字列を返す
 * @param {number} year 年度
 * @param {string} testName テスト名
 * @return {string} コンテキスト文字列
 */
function buildLiveAnalysisContext_(year, testName) {
  // CacheService で同じテスト×年度の結果を5分間キャッシュ（Supabase RPC削減）
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'liveCtx_' + year + '_' + testName;
    var cached = cache.get(cacheKey);
    if (cached) return cached;
  } catch (e) { /* CacheService 障害は非致命的 */ }

  var ctx = '\n\n【テスト集計データ（その場取得）: ' + testName + '(' + year + '年度)】\n';
  ctx += '※詳細分析は未生成のため、以下の集計値から分析・説明してください。\n';

  // 校舎別平均（RPC: get_campus_averages）
  try {
    var campusAvgResult = getCampusAverages(year, testName);
    if (campusAvgResult.success && campusAvgResult.campuses && campusAvgResult.campuses.length > 0) {
      ctx += '\n校舎別平均点（受験者数含む）:\n';
      campusAvgResult.campuses.forEach(function(c) {
        var name = c.campusName || c.campusCode;
        ctx += '  ' + name + ': 国語' + c.kokugo + ', 社会' + c.shakai
          + ', 数学' + c.sugaku + ', 理科' + c.rika + ', 英語' + c.eigo
          + ', 合計' + c.total + '点（' + c.count + '人）\n';
      });
    }
  } catch (e) {
    Logger.log('⚠ 校舎別平均取得スキップ: ' + e);
  }

  // 学校平均
  try {
    var schoolAvgResult = getSchoolAverages(year, testName);
    if (schoolAvgResult.success && schoolAvgResult.averages && schoolAvgResult.averages.length > 0) {
      var sa = schoolAvgResult.averages[0];
      ctx += '\n学校平均: 国語' + sa.kokugo + ', 社会' + sa.shakai
        + ', 数学' + sa.sugaku + ', 理科' + sa.rika + ', 英語' + sa.eigo + '\n';
    }
  } catch (e) {
    Logger.log('⚠ 学校平均取得スキップ: ' + e);
  }

  // 結果を5分間キャッシュ
  try { cache.put(cacheKey, ctx, 300); } catch (e) { /* 非致命的 */ }

  return ctx;
}

/**
 * systemInstruction 用の静的プロンプトを組み立てる
 * @param {string} aiAssistantName AIアシスタント名
 * @param {string} aiPersonality 喋り方コード
 * @param {string} userDisplayName ユーザー表示名
 * @param {number} currentAcademicYear 現在の学年年度
 * @return {string} systemInstruction テキスト
 */
function buildSystemInstruction_(aiAssistantName, aiPersonality, userDisplayName, currentAcademicYear) {
  return 'You are the AI assistant "' + (aiAssistantName || 'イノイマン') + '" for S-quire, a dashboard app for "個別指導スクエア" (a private tutoring school / juku).\n'
    + '\n[About This App]\n'
    + '- Name: S-quire\n'
    + '- Facility: 個別指導スクエア (private tutoring school / juku)\n'
    + '- Purpose: Dashboard for tutors/staff to manage student grades, monthly schedules, and school operations\n'
    + '\n[Rules]\n'
    + '- LANGUAGE: Always respond in Japanese. ' + getPersonalityInstruction(aiPersonality) + '\n'
    + '- ADDRESS: When addressing the user, call them "' + (userDisplayName ? userDisplayName + '先生' : '先生') + '". Omit if unnecessary.\n'
    + '- Keep responses concise. Maintain accuracy in explanations of features and logic; only adapt the speaking style above.\n'
    + '- For casual conversation, chitchat, life advice, general questions (weather, recipes, etc.), respond warmly and freely.\n'
    + '- For questions about pricing/tuition/fees: answer directly from provided data without navigating. Same for closed days, test schedules, and operations info.\n'
    + '- For questions about instructor placement/location (配置/勤務): answer directly from provided placement data. Use the current day-of-week from [Current Date] to answer "today" questions. On Sundays (日曜), explain there are no placements. When asked about today\'s overall placement ("今日の配置", "各校舎の配置" etc.), list each campus and who is assigned there (e.g. "○○校: △△先生、□□先生 / ××校: ◇◇先生"). Group by campus, not by teacher.\n'
    + '- [CRITICAL] If the user requests a feature that does NOT exist (attendance tracking, tuition billing, parent communication, etc.), NEVER claim it exists. Politely respond: "申し訳ございませんが、現在その機能はございません。管理者へご連絡ください".\n'
    + '- For app_action responses, ONLY use these action names: navigate_schedule, navigate_tab, show_grade_analysis, navigate_lectures, show_grades_list, show_student_report, submit_grade, submit_student, add_schedule, edit_schedule, delete_schedule, create_lecture_entry, edit_lecture_entry, delete_lecture_entry, bulk_lecture_operations, export_lecture_calendar.\n'
    + '- [Required Fields Rule] If ANY required field is unknown/unspecified, do NOT execute the action. Return type:"other" and ask ONLY for the missing field(s). NEVER fill required fields with empty strings, 0, or guessed values.\n'
    + '- [Lecture Schedule Entry Method] When user wants to add/enter lecture schedule ("日程を入れたい", "日程を追加したい" etc.), do NOT navigate directly. Respond as type:"other" and ask which method they want:\n'
    + '  1. 手動入力 — カレンダー画面で教科・学年を選んでタップして入力する\n'
    + '  2. 日程読み込み（AI OCR） — 手書きや画像・テキストからAIが自動で読み込む\n'
    + '  3. AIに直接入れてもらう — 詳細（講習名・日時・教科・学年など）を教えれば直接登録できる\n'
    + '  Then guide accordingly based on the user\'s choice.\n'
    + '\n[S-quire Features]\n'
    + '■ Schedule Tab (予定): Monthly calendar, AI auto-extraction from PDF/CSV/Sheets, fixed events, closed day/basic test management\n'
    + '■ Grades Tab (成績管理): Student CRUD, test score entry (国語,社会,数学,理科,英語), OCR import, grade list/analysis/report views, master settings\n'
    + '■ Settings Tab (設定): Theme color, AI name/style, profile (display name, subjects), preferred campus, account transfer\n'
    + '■ Admin Tab (管理, admin only): Script properties, Drive operations, user management, logs, initialization\n'
    + '■ Documents Tab (資料): Annual calendar PDF, pricing table PDF, instructor placement table (講師配置表)\n'
    + '■ Lectures Tab (講習管理): Lecture schedule creation, internal handouts, external flyers, image generation\n'
    + '\n[AI Assistant Capabilities — use this when asked "何ができる？" "AIに何ができる？" etc.]\n'
    + 'Respond as type:"qa_help" with a concise list in Japanese covering:\n'
    + '・画面移動: 「成績分析を見せて」「料金表に移動して」など、任意の画面に移動できます\n'
    + '・設定変更: テーマカラー・AI名前・しゃべり方・表示名の変更ができます\n'
    + '・講師配置の照会: 「○○先生は今日どこ？」「水曜に△△校にいる先生は？」などに答えられます\n'
    + '・予定の追加・編集・削除: 「塾の予定に○○を追加して」など話しかけるだけで操作できます\n'
    + '・講習日程の照会: 「私のコマを教えて」「自分の講習日程は？」など、あなたが登録した講習コマを一覧で回答できます\n'
    + '・講習カレンダーエクスポート: 「カレンダーに追加して」「講習をカレンダーにエクスポートして」で、自分のコマをICSファイルとしてダウンロードしGoogleカレンダーに追加できます\n'
    + '・講習日程の登録: 「春期講習に数学を追加して」など詳細を伝えると直接登録できます\n'
    + '・成績登録のサポート: 「田中さんの数学を80点で登録して」など話しかけるだけで登録できます\n'
    + '・使い方の案内: 「○○の使い方を教えて」などアプリの操作方法を説明できます\n'
    + '\n[Configurable Settings]\n'
    + '- themeColor: hex color (e.g. #43e97b)\n'
    + '- aiAssistantName: any string (current: ' + (aiAssistantName || 'イノイマン') + ')\n'
    + '- aiPersonality: polite/friendly/energetic/cool/kansai/hakata/tohoku/nagoya/awa (current: ' + (aiPersonality || 'polite') + ')\n'
    + '- displayName: user\'s display name\n'
    + '\n[Navigable Screens (use these IDs for navigate_tab action)]\n'
    + 'schedule, grades>grades-score, grades>grades-list, grades>grades-analysis, grades>grades-report, grades>grades-input, grades>grades-placement, lectures>lectures-schedule, lectures>lectures-materials, lectures>lectures-flyer, universities>univ-calendar, universities>univ-pricing, universities>univ-placement, settings\n'
    + '\n[Student Name Redaction]\n'
    + '- [生徒ID:XXXXXXXXXX]: One specific student. Do NOT show the raw ID to the user.\n'
    + '- [個人名:田中]: Surname-only with multiple matches. Ask: "田中さんが複数います。フルネームか学年・校舎を教えてください"\n'
    + '\n[Knowledge Learning — Self-Improvement]\n'
    + 'When a user corrects you, teaches operational facts, shares procedures, or provides scheduling/policy info:\n'
    + 'Include optional "learned_knowledge":{"category":"category","content":"1-2 sentence fact in Japanese","reason":"why useful"}\n'
    + 'Rules: Only factual juku info. NOT opinions/temporary states. NOT info already in knowledge base. Categories: 塾（スクエア関係）, 中学校関係, 高校関係, その他\n'
    + '\n[User Feedback Logging]\n'
    + 'When you respond with "その件については管理者にご確認ください" (info not in knowledge base): include optional "feedback":{"type":"missing_info","summary":"何の情報が不足していたか1文で"}\n'
    + 'When you respond with "現在その機能はございません" (feature does not exist): include optional "feedback":{"type":"missing_feature","summary":"どんな機能が求められたか1文で"}\n'
    + '\n[Conversation Continuation Rules]\n'
    + 'If the previous AI response was an app_action, and the user says "去年のにして", "○○校だけにして", etc. — reuse the same action and change ONLY the specified value.\n'
    + 'Year expressions (current academic year = ' + currentAcademicYear + '): 去年/昨年度→' + (currentAcademicYear - 1) + ', 今年/今年度→' + currentAcademicYear + ', 来年/来年度→' + (currentAcademicYear + 1) + '\n'
    + 'Carry over required fields from chat history. Do NOT re-ask for established fields.\n'
    + 'If the previous AI ended with a question/proposal and the user responds affirmatively ("はい", "お願いします"), execute that proposal.\n'
    + '\n[Response Format]\n'
    + 'Return ONLY one of the following JSON formats. All text fields MUST be in Japanese.\n'
    + 'Abbreviations: R=required, CY=' + currentAcademicYear + ' (current academic year)\n'
    + '\n[Shared Rules]\n'
    + '- YearRule: unmentioned→CY, 去年/昨年度→' + (currentAcademicYear - 1) + ', 一昨年→' + (currentAcademicYear - 2) + ', explicit→that year. NEVER confuse calendar year with academic year.\n'
    + '- TestNameRule: MUST exist in [Test Names List]. If unknown/unmentioned, return type:"other" asking which test (show full list).\n'
    + '- AnalysisDataRule: If context contains 【テスト分析データ:...】or 【テスト集計データ（その場取得）:...】section, analyze and explain the data directly in your response as type:"other" (DO NOT return show_grade_analysis action). For 【テスト集計データ】, compare campus averages, highlight differences vs school average, and point out which campus/subject stands out. Use clear, plain Japanese for non-expert teachers.\n'
    + '- MessageRule: "message" field must contain actual resolved values (year, testName, student name). NEVER use placeholders like ○○.\n'
    + '- ConfirmRule: Set needsConfirmation:true, show all details. Only re-send with confirmed:true (no needsConfirmation) after user says "はい".\n'
    + '\n■ config_change — Settings change:\n'
    + '{"success":true,"type":"config_change","recommendedSettings":{"key":"value"},"explanation":"Japanese explanation"}\n'
    + '\n■ qa_help — Feature/usage question:\n'
    + '{"success":true,"type":"qa_help","answer":"Japanese answer","relatedTopic":"topic"}\n'
    + '\n■ navigate_schedule — Schedule view ("来月の予定" etc.): year(YearRule), month(calc from today)\n'
    + '{"success":true,"type":"app_action","action":"navigate_schedule","year":YYYY,"month":MM,"message":"msg"}\n'
    + '\n■ navigate_tab — Screen navigation ("料金表を見せて" etc.):\n'
    + '{"success":true,"type":"app_action","action":"navigate_tab","tab":"tabId","subTab":"optional subTabId","message":"msg"}\n'
    + '\n■ show_grade_analysis: year(R,YearRule), testName(R,TestNameRule) → MessageRule\n'
    + '{"success":true,"type":"app_action","action":"show_grade_analysis","year":YYYY,"testName":"name","message":"msg"}\n'
    + '\n■ navigate_lectures: year(R,YearRule), lectureId(R,must be in Lecture Periods List) → MessageRule\n'
    + '  Optional: campusCode (auto-set from user prefs if 1 campus; ask if 2+)\n'
    + '{"success":true,"type":"app_action","action":"navigate_lectures","lectureId":"id","campusCode":"optional","message":"msg"}\n'
    + '\n■ show_student_report: year(R,YearRule+auto from grade data check), studentId(R), testName(R,TestNameRule) → MessageRule\n'
    + '  Use numeric part of [生徒ID:XXXX]. If student has data in only 1 year, auto-set that year.\n'
    + '{"success":true,"type":"app_action","action":"show_student_report","year":YYYY,"studentId":"id","testName":"name","message":"msg"}\n'
    + '\n■ show_grades_list: year(R,YearRule), testName(R,TestNameRule), campusCode(optional) → MessageRule\n'
    + '{"success":true,"type":"app_action","action":"show_grades_list","year":YYYY,"campusCode":"","testName":"name","message":"msg"}\n'
    + '\n■ submit_grade — Grade submission: studentId(R), testName(R), scores(R:{kokugo,shakai,sugaku,rika,eigo}) → ConfirmRule\n'
    + '{"success":true,"type":"app_action","action":"submit_grade","needsConfirmation":true,"year":CY,"studentId":"id","testName":"name","scores":{"kokugo":0,"shakai":0,"sugaku":0,"rika":0,"eigo":0},"message":"以下の内容で成績を登録します：\\n生徒: ○○さん\\nテスト: ○○\\n国語:○ 社会:○ 数学:○ 理科:○ 英語:○\\nよろしいですか？"}\n'
    + '\n■ submit_student — Student registration: campusCode(R), gradeCode(R), sei(R), seiFurigana(R) → ConfirmRule\n'
    + '  Optional: mei, meiFurigana, schoolName\n'
    + '{"success":true,"type":"app_action","action":"submit_student","needsConfirmation":true,"year":CY,"campusCode":"2-digit","gradeCode":"2-digit","sei":"surname","mei":"","seiFurigana":"furigana","meiFurigana":"","schoolName":"","message":"confirmation msg"}\n'
    + '\n■ add_schedule — Schedule entry (all users): schoolName(R), eventName(R), date(R,YYYY-MM-DD) → ConfirmRule\n'
    + '  schoolName rules: 塾の予定→"塾", 中学校の予定→school name including "中学" (e.g. "○○中学校"), 高校の予定→school name including "高校" (e.g. "○○高校")\n'
    + '  [Clarification Rule] If school type is ambiguous (user does not clearly specify juku/junior/high), do NOT execute. Return type:"other" asking: "塾の予定ですか、中学校の予定ですか、高校の予定ですか？"\n'
    + '  Year default: current calendar year from [Current Date]. Month default: current calendar month from [Current Date].\n'
    + '{"success":true,"type":"app_action","action":"add_schedule","needsConfirmation":true,"schoolName":"name","eventName":"event","date":"YYYY-MM-DD","details":"optional","message":"confirmation msg"}\n'
    + '\n■ edit_schedule — Schedule edit (all users): docId(R, from 【変更・削除可能なカスタムイベント一覧】), changes(R) → ConfirmRule\n'
    + '  Include ONLY changed fields in changes: schoolName, eventType, date(YYYY-MM-DD), details\n'
    + '  If target event is NOT in カスタムイベント一覧, return type:"other" explaining it cannot be edited.\n'
    + '{"success":true,"type":"app_action","action":"edit_schedule","needsConfirmation":true,"docId":"id","changes":{"field":"value"},"message":"confirmation msg"}\n'
    + '\n■ delete_schedule — Schedule delete (all users): docId(R, from 【変更・削除可能なカスタムイベント一覧】) → ConfirmRule\n'
    + '  If target event is NOT in カスタムイベント一覧, return type:"other" explaining it cannot be deleted.\n'
    + '{"success":true,"type":"app_action","action":"delete_schedule","needsConfirmation":true,"docId":"id","message":"以下の予定を削除します：○○ よろしいですか？"}\n'
    + '\n■ create_lecture_entry — Lecture creation: lectureId(R), campusCode(R), date(R,YYYY-MM-DD), startTime(R,HH:MM), subject(R), grade(R,code 07-18) → ConfirmRule\n'
    + '  Optional: durationSlots (10-min units; use grade settings if available, default 9=90min), classLabel (A/B/C)\n'
    + '  [Smart Defaults] If current lecture entries have lectureId+campusCode → use them. 1 preferred campus → auto-set. 2+ → ask. 1 subject → auto-set. 2+ → ask. Grade → ALWAYS ask.\n'
    + '  [Weekly] If "毎週" mentioned, set weekly:true. Creates for same day/time each week, skipping closed days.\n'
    + '{"success":true,"type":"app_action","action":"create_lecture_entry","needsConfirmation":true,"lectureId":"id","campusCode":"2-digit","date":"YYYY-MM-DD","startTime":"HH:MM","durationSlots":9,"subject":"name","grade":"2-digit","classLabel":"optional","weekly":false,"message":"confirmation msg"}\n'
    + '\n■ edit_lecture_entry: lectureId(R), campusCode(R), entryId(R, from current entries) → ConfirmRule\n'
    + '  Include ONLY changed fields in "changes". User can ONLY edit own entries.\n'
    + '{"success":true,"type":"app_action","action":"edit_lecture_entry","needsConfirmation":true,"lectureId":"id","campusCode":"2-digit","entryId":"id","changes":{"field":"value"},"message":"confirmation msg"}\n'
    + '\n■ delete_lecture_entry: lectureId(R), campusCode(R), entryId(R) → ConfirmRule\n'
    + '  User can ONLY delete own entries.\n'
    + '{"success":true,"type":"app_action","action":"delete_lecture_entry","needsConfirmation":true,"lectureId":"id","campusCode":"2-digit","entryId":"id","message":"confirmation msg"}\n'
    + '\n■ bulk_lecture_operations — Bulk operations (create+edit+delete mix): lectureId(R), campusCode(R), operations(R) → ConfirmRule\n'
    + '  Use when user requests MULTIPLE lecture entries at once, or a mix of create/edit/delete.\n'
    + '  operations array items:\n'
    + '    create: {"op":"create","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"name","grade":"2-digit","durationSlots":9,"classLabel":"optional"}\n'
    + '    edit:   {"op":"edit","entryId":"id","changes":{"field":"value"}}\n'
    + '    delete: {"op":"delete","entryId":"id"}\n'
    + '  Message must list ALL operations clearly.\n'
    + '{"success":true,"type":"app_action","action":"bulk_lecture_operations","needsConfirmation":true,"lectureId":"id","campusCode":"2-digit","operations":[{"op":"create","date":"2026-07-17","startTime":"10:00","subject":"数学","grade":"15"}],"message":"confirmation msg"}\n'
    + '\n■ export_lecture_calendar — Export user\'s lecture entries to Google Calendar: lectureId(R, from Lecture Periods List)\n'
    + '  Triggered by: "カレンダーに追加して", "講習をカレンダーにエクスポート", "Googleカレンダーに入れて" etc.\n'
    + '  Downloads ICS file of user\'s own entries and opens Google Calendar import page.\n'
    + '  If lectureId is ambiguous (multiple active lectures), ask which one.\n'
    + '{"success":true,"type":"app_action","action":"export_lecture_calendar","lectureId":"id","message":"○○のコマをGoogleカレンダーにエクスポートします"}\n'
    + '\n■ Confirmation response (user said "はい"): Re-send same action with confirmed:true, WITHOUT needsConfirmation.\n'
    + '\n■ Missing information: {"success":true,"type":"other","response":"Japanese question about missing field"}\n'
    + '\n■ All other (chitchat, general): {"success":true,"type":"other","response":"Japanese response"}';
}

/**
 * テキスト内の [生徒ID:...] / [個人名:...] トークンの外側だけ文字列置換するヘルパー
 * Phase 2（苗字マッチング）で置換済みトークン内を誤って再置換しないために使用する
 * @param {string} text 対象テキスト
 * @param {string} needle 検索文字列
 * @param {string} replacement 置換文字列
 * @return {string} 置換後テキスト
 */
function replaceOutsideTokens_(text, needle, replacement) {
  var result = '';
  var remaining = text;
  var tokenStart = /\[(?:生徒ID|個人名):/;
  while (remaining.length > 0) {
    var ts = remaining.search(tokenStart);
    if (ts === -1) {
      result += remaining.split(needle).join(replacement);
      break;
    }
    result += remaining.substring(0, ts).split(needle).join(replacement);
    var te = remaining.indexOf(']', ts);
    if (te === -1) {
      result += remaining.substring(ts);
      break;
    }
    result += remaining.substring(ts, te + 1);
    remaining = remaining.substring(te + 1);
  }
  return result;
}

/**
 * メッセージ内の学年キーワード（中1〜高3等）から gradeCode（2桁文字列）を検出する
 * 複数の学年キーワードが含まれる場合は最後に見つかったものを採用する
 * @param {string} message 検索対象のメッセージ
 * @return {string|null} gradeCode（'07'〜'18'）または null
 */
function detectGradeFromMessage_(message) {
  var gradeMap = {
    '小1':'07','小2':'08','小3':'09','小4':'10','小5':'11','小6':'12',
    '中1':'13','中2':'14','中3':'15',
    '高1':'16','高2':'17','高3':'18',
    '小１':'07','小２':'08','小３':'09','小４':'10','小５':'11','小６':'12',
    '中１':'13','中２':'14','中３':'15',
    '高１':'16','高２':'17','高３':'18'
  };
  var found = null;
  Object.keys(gradeMap).forEach(function(kw) {
    if (message.indexOf(kw) !== -1) found = gradeMap[kw];
  });
  return found;
}

/**
 * メッセージ内の校舎名から campusCode（2桁文字列）を検出する
 * 複数の校舎名が含まれる場合は最後に見つかったものを採用する
 * @param {string} message 検索対象のメッセージ
 * @param {Array} campusConfig getCampusConfig() が返す [{code, name}] 配列
 * @return {string|null} campusCode または null
 */
function detectCampusFromMessage_(message, campusConfig) {
  if (!campusConfig || campusConfig.length === 0) return null;
  var found = null;
  campusConfig.forEach(function(c) {
    if (c.name && message.indexOf(c.name) !== -1) found = c.code;
  });
  return found;
}

/**
 * メッセージ内の生徒氏名（漢字・ふりがな）を生徒IDに置き換える内部ヘルパー（個人情報保護用）
 * Phase 1: フルネームマッチング（1人 → ID、複数 → 全ID列挙）
 * Phase 2: 苗字のみマッチング（学年・校舎の文脈で絞り込み）
 *   - 1人に絞れた → [生徒ID:XXXX] に変換
 *   - 複数候補が残った → [個人名:田中] の伏字に変換（AIが複数候補と判断して案内できる）
 * @param {string} message 元のメッセージ
 * @param {Array} students getMasterData() が返す生徒配列
 * @param {Array} campusConfig getCampusConfig() が返す [{code, name}] 配列（省略可）
 * @return {string} 氏名を生徒IDまたは伏字に置き換えたメッセージ
 */
function resolveStudentNamesInMessage_(message, students, campusConfig) {
  if (!message || !students || students.length === 0) return message;

  // === Phase 1: フルネームマッチング（既存動作） ===
  var fullNameToIds = {};
  students.forEach(function(s) {
    var fullName = (s.sei || '') + (s.mei || '');
    var furigana = (s.seiFurigana || '') + (s.meiFurigana || '');
    if (fullName.length >= 2) {
      if (!fullNameToIds[fullName]) fullNameToIds[fullName] = [];
      fullNameToIds[fullName].push(s.studentId);
    }
    if (furigana.length >= 2 && furigana !== fullName) {
      if (!fullNameToIds[furigana]) fullNameToIds[furigana] = [];
      fullNameToIds[furigana].push(s.studentId);
    }
  });

  // 長い名前から順に処理（部分一致による誤変換を防ぐ）
  var fullNames = Object.keys(fullNameToIds).sort(function(a, b) { return b.length - a.length; });
  var resolved = message;
  fullNames.forEach(function(name) {
    var ids = fullNameToIds[name];
    var replacement = '[生徒ID:' + ids.join('または生徒ID:') + ']';
    resolved = resolved.split(name).join(replacement);
  });

  // === Phase 2: 苗字のみマッチング（新規） ===
  // 苗字 → 生徒オブジェクト配列 のマッピングを構築
  var surnameToStudents = {};
  students.forEach(function(s) {
    [s.sei || '', s.seiFurigana || ''].forEach(function(surname) {
      if (surname.length < 1) return;
      if (!surnameToStudents[surname]) surnameToStudents[surname] = [];
      var alreadyAdded = surnameToStudents[surname].some(function(x) { return x.studentId === s.studentId; });
      if (!alreadyAdded) surnameToStudents[surname].push(s);
    });
  });

  // メッセージ全体から学年・校舎のコンテキストを検出
  var gradeFilter  = detectGradeFromMessage_(resolved);
  var campusFilter = detectCampusFromMessage_(resolved, campusConfig || []);

  // 苗字を長い順に処理（フルネームの部分文字列との誤マッチを防ぐ）
  var surnames = Object.keys(surnameToStudents).sort(function(a, b) { return b.length - a.length; });
  surnames.forEach(function(surname) {
    if (resolved.indexOf(surname) === -1) return; // 含まれない → スキップ

    var candidates = surnameToStudents[surname];

    // 学年・校舎フィルタを適用（絞り込めた場合のみ採用）
    var filtered = candidates;
    if (gradeFilter) {
      var byGrade = candidates.filter(function(s) { return s.grade === gradeFilter; });
      if (byGrade.length > 0) filtered = byGrade;
    }
    if (campusFilter) {
      var byCampus = filtered.filter(function(s) { return s.campus === campusFilter; });
      if (byCampus.length > 0) filtered = byCampus;
    }

    if (filtered.length === 0) return; // マッチなし → そのまま

    var replacement;
    if (filtered.length === 1) {
      // 1人に絞り込めた → IDに変換
      replacement = '[生徒ID:' + filtered[0].studentId + ']';
    } else {
      // 複数候補 → 伏字に変換（AIが案内文を返す）
      replacement = '[個人名:' + surname + ']';
      Logger.log('⚠ 苗字マッチング（複数候補）: ' + surname + ' → 伏字（' + filtered.length + '人）');
    }
    // Phase 1 で置換済みのトークン内部を誤って再置換しないようトークン外だけ置換
    resolved = replaceOutsideTokens_(resolved, surname, replacement);
  });

  return resolved;
}

/**
 * Geminiの応答テキスト内の生徒IDおよび伏字トークンを元の表示形式に戻す内部ヘルパー（ユーザー表示用）
 * resolveStudentNamesInMessage_() の逆処理。バックエンドで完結するため氏名が外部に渡ることはない
 * [生徒ID:XXXX] → フルネーム（漢字）
 * [個人名:田中] → 田中（苗字のまま。複数候補で特定できなかったことを保持しつつ自然な表示に）
 * @param {string} text Geminiから返ってきたテキスト
 * @param {Array} students getMasterData() が返す生徒配列
 * @return {string} 生徒IDを氏名に、伏字を苗字に置き換えたテキスト
 */
function restoreStudentNamesInResponse_(text, students) {
  if (!text || !students || students.length === 0) return text;

  // studentId → フルネーム（漢字）の逆引きマップを構築
  var idToName = {};
  students.forEach(function(s) {
    var fullName = (s.sei || '') + (s.mei || '');
    if (s.studentId && fullName) {
      idToName[String(s.studentId)] = fullName;
    }
  });

  // [生徒ID:XXXX] → フルネーム（Geminiが出力しうる各種パターンに対応）
  var restored = text.replace(/\[?生徒ID[：:]\s*(\d+)\]?/g, function(match, id) {
    var paddedId = id.length < 10 ? id.padStart(10, '0') : id;
    return idToName[paddedId] || idToName[id] || match;
  });

  // [個人名:田中] → 田中（苗字のまま表示。AIの返答でそのまま言及された場合の復元）
  restored = restored.replace(/\[個人名:([^\]]+)\]/g, function(_, surname) {
    return surname;
  });

  return restored;
}

/**
 * AI アシスタントの主処理
 * 意図判定と回答生成を1回のAPI呼び出しで完結させる（API消費最小化設計）
 * @aiCallable
 * @param {string} userMessage ユーザーが入力したメッセージ
 * @param {Array} chatHistory 直近の会話履歴（{role:'user'|'ai', text:'...'}の配列。省略可）
 * @return {Object} { success, type, answer/response/explanation/recommendedSettings, error }
 */
function requestAIAssistant(userMessage, chatHistory) {
  try {
    var GEMINI_API_KEY = getProperty(PROP_KEYS.GEMINI_API_KEY);

    if (!GEMINI_API_KEY) {
      return { success: false, error: 'Gemini APIキーが設定されていません', type: 'error' };
    }

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + GEMINI_API_KEY;

    // ユーザープロフィールを1回だけ取得（旧: 3回呼んでいた）
    var profile = null;
    try {
      profile = getUserProfile();
    } catch (e) {
      Logger.log('⚠ プロフィール取得スキップ: ' + e);
    }
    var userDisplayName = (profile && profile.success && profile.displayName) || '';
    var userRegisteredName = (profile && profile.success && profile.registeredName) || '';
    var userSubjects = (profile && profile.success && profile.subjects && profile.subjects.length > 0) ? profile.subjects.join('、') : '';
    var userSubjectsList = (profile && profile.success && profile.subjects) || [];
    var userPreferredCampusList = (profile && profile.success && profile.preferredCampuses) || [];
    var aiAssistantName = (profile && profile.success && profile.aiAssistantName) || 'イノイマン';
    var aiPersonality = (profile && profile.success && profile.aiPersonality) || 'polite';

    // 生徒マスタを取得して氏名→ID変換の準備（個人情報保護）
    var studentMaster = [];
    try {
      studentMaster = getMasterData(getCurrentFiscalYear()) || [];
    } catch (e) {
      Logger.log('⚠ 生徒マスタ取得スキップ（氏名解決なし）: ' + e);
    }

    // 校舎設定を取得
    var campusConfig = [];
    try {
      var campusObj = getCampusConfig() || {};
      campusConfig = Object.keys(campusObj).map(function(code) {
        return { code: code, name: campusObj[code] };
      });
    } catch (e) {
      Logger.log('⚠ 校舎設定取得スキップ: ' + e);
    }

    // メッセージ内の生徒氏名をIDに置き換え
    var resolvedUserMessage = resolveStudentNamesInMessage_(userMessage, studentMaster, campusConfig);

    // 意図分類（条件付きコンテキスト読み込み用）
    var intents = classifyMessageIntent_(resolvedUserMessage, chatHistory);

    var currentAcademicYear = getCurrentFiscalYear();

    // === systemInstruction の構築（静的な指示） ===
    var systemPrompt = buildSystemInstruction_(aiAssistantName, aiPersonality, userDisplayName, currentAcademicYear);

    // === マルチターン会話履歴の構築 ===
    var contents = [];
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.slice(-10).forEach(function(item) {
        var itemText = item.role === 'user'
          ? resolveStudentNamesInMessage_(item.text, studentMaster, campusConfig)
          : item.text;
        contents.push({
          role: item.role === 'user' ? 'user' : 'model',
          parts: [{ text: itemText }]
        });
      });
    }

    // === ユーザー情報の構築 ===
    var userInfo = '\n[User Info]';
    var profileReminder = '';
    if (userDisplayName) {
      userInfo += '\n- Display name: ' + userDisplayName;
    } else {
      userInfo += '\n- Display name: not set';
      profileReminder += '表示名未設定。回答末尾に「設定タブのプロフィールから表示名を設定いただけます」と追記。';
    }
    if (userRegisteredName && userRegisteredName !== userDisplayName) {
      userInfo += '\n- Registered name: ' + userRegisteredName;
    }
    if (userSubjects) {
      userInfo += '\n- Subjects: ' + userSubjects;
    } else {
      userInfo += '\n- Subjects: not set';
      profileReminder += '担当教科未設定。「設定タブのプロフィールから担当教科も設定いただけます」と追記。';
    }
    if (userPreferredCampusList.length > 0) {
      var campusMap = {};
      campusConfig.forEach(function(c) { campusMap[c.code] = c.name; });
      var campusLabels = userPreferredCampusList.map(function(code) {
        return (campusMap[code] || code) + ' (' + code + ')';
      });
      userInfo += '\n- Preferred campuses: ' + campusLabels.join(', ');
    } else {
      userInfo += '\n- Preferred campuses: not set';
    }
    if (profileReminder) {
      userInfo += '\n[Profile Incomplete] ' + profileReminder;
    }

    // 管理者フラグ
    var isUserAdmin = false;
    try { isUserAdmin = isAdmin(); } catch (e) {}
    var adminContext = isUserAdmin
      ? '\nこのユーザーは管理者です。管理タブの機能も案内可能です。'
      : '\nこのユーザーは管理者ではありません。管理タブの機能について聞かれた場合は「管理者にお問い合わせください」と案内。';

    // === 条件付きコンテキストの取得 ===
    // 常に取得: ナレッジベース・校舎リスト
    var kbContext = '';
    try {
      kbContext = getAiKnowledgeBaseForPrompt_();
    } catch (e) {
      Logger.log('⚠ ナレッジベース取得スキップ: ' + e);
    }

    // 校舎コード一覧（常に取得: app_action で必要）
    var campusListContext = '';
    if (campusConfig.length > 0) {
      campusListContext = '\n\n【校舎コード一覧】\n';
      campusConfig.forEach(function(c) {
        campusListContext += c.code + ': ' + c.name + '\n';
      });
    }

    // 条件付き: 料金表データ（料金関連の質問時のみ）
    var pricingContext = '';
    if (intents.pricing) {
      try {
        var pricingJson = getScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
        if (pricingJson) {
          var pricingData = JSON.parse(pricingJson);
          pricingContext = '\n\n【料金表データ（' + pricingData.title + '）】\n';
          pricingData.sections.forEach(function(section) {
            pricingContext += '\n■ ' + section.name + '\n';
            pricingContext += '| ' + section.headers.join(' | ') + ' |\n';
            section.rows.forEach(function(row) {
              pricingContext += '| ' + row.join(' | ') + ' |\n';
            });
            if (section.notes && section.notes.length > 0) {
              section.notes.forEach(function(n) { pricingContext += n + '\n'; });
            }
          });
          if (pricingData.footerNotes && pricingData.footerNotes.length > 0) {
            pricingContext += '\n【注記】\n';
            pricingData.footerNotes.forEach(function(n) { pricingContext += n + '\n'; });
          }
        }
      } catch (e) {
        Logger.log('⚠ 料金表データ取得スキップ: ' + e);
      }
    }

    // 条件付き: テスト名一覧（成績関連時のみ）
    var testNamesContext = '';
    if (intents.grades) {
      try {
        var testNames = getTestNamesConfig() || [];
        if (testNames.length > 0) {
          testNamesContext = '\n\n【テスト名一覧】\n' + testNames.join('、');
        }
      } catch (e) {
        Logger.log('⚠ テスト名取得スキップ: ' + e);
      }
    }

    // 条件付き: テスト分析データ（成績・分析関連のメッセージで、テスト名が特定できた場合のみ）
    var gradeAnalysisContext = '';
    if (intents.grades && /分析|平均点|平均|教えて|説明|コメント|どう|結果|比較/.test(resolvedUserMessage)) {
      try {
        var wantedYear = detectAnalysisYear_(resolvedUserMessage, currentAcademicYear);
        var allTestNames = getTestNamesConfig() || [];
        var wantedTestName = detectAnalysisTestName_(resolvedUserMessage, allTestNames);
        if (wantedTestName) {
          var analysisResult = getGradeAnalysis(wantedYear, wantedTestName);
          if (analysisResult.success && analysisResult.exists) {
            // 保存済み分析あり → 分析テキストをコンテキストに追加
            var aData = analysisResult.analysis;
            gradeAnalysisContext = '\n\n【テスト分析データ: ' + wantedTestName + '(' + wantedYear + '年度)】\n';
            gradeAnalysisContext += '概要: ' + (aData.overview || '') + '\n';
            if (aData.subjectAnalysis && aData.subjectAnalysis.length) {
              gradeAnalysisContext += '教科別:\n';
              aData.subjectAnalysis.forEach(function(s) {
                gradeAnalysisContext += '  ' + s.subject + ': 塾平均' + s.jukuAvg + '点, 学校平均' + s.schoolAvg + '点(差' + s.diff + '点) / ' + s.comment + '\n';
              });
            }
            if (aData.historicalTrend)    gradeAnalysisContext += '年度推移: ' + aData.historicalTrend + '\n';
            if (aData.roundComparison)    gradeAnalysisContext += '前回比較: ' + aData.roundComparison + '\n';
            if (aData.nextRoundPrediction) gradeAnalysisContext += '次回予測: ' + aData.nextRoundPrediction + '\n';
          } else {
            // 保存済み分析なし → その場でRPCデータを取得してコンテキストに追加
            gradeAnalysisContext = buildLiveAnalysisContext_(wantedYear, wantedTestName);
          }
        }
      } catch (e) {
        Logger.log('⚠ テスト分析コンテキスト取得スキップ: ' + e);
      }
    }

    // 条件付き: 校舎別生徒数サマリー（成績・生徒関連時のみ）
    var studentSummaryContext = '';
    if (intents.grades || intents.students) {
      try {
        if (studentMaster.length > 0) {
          var countMap = {};
          studentMaster.forEach(function(s) {
            var key = (s.campusCode || '??') + '_' + (s.gradeCode || '??');
            countMap[key] = (countMap[key] || 0) + 1;
          });
          var gradeLabels = {'07':'小1','08':'小2','09':'小3','10':'小4','11':'小5','12':'小6','13':'中1','14':'中2','15':'中3','16':'高1','17':'高2','18':'高3'};
          var cMapForSummary = {};
          campusConfig.forEach(function(c) { cMapForSummary[c.code] = c.name; });
          studentSummaryContext = '\n\n【校舎別生徒数】\n';
          var campusCodes = Object.keys(cMapForSummary).sort();
          campusCodes.forEach(function(cc) {
            var parts = [];
            Object.keys(gradeLabels).forEach(function(gc) {
              var cnt = countMap[cc + '_' + gc];
              if (cnt) parts.push(gradeLabels[gc] + '=' + cnt + '人');
            });
            if (parts.length > 0) {
              studentSummaryContext += cMapForSummary[cc] + '（' + cc + '）: ' + parts.join(', ') + '\n';
            }
          });
          studentSummaryContext += '合計: ' + studentMaster.length + '人';
        }
      } catch (e) {
        Logger.log('⚠ 生徒数サマリー生成スキップ: ' + e);
      }
    }

    // 条件付き: 講習期間一覧（講習・ナビ関連時のみ）
    var lecturePeriodsContext = '';
    if (intents.lectures || intents.navigation) {
      try {
        var lecPeriods = getLecturePeriods() || [];
        if (lecPeriods.length > 0) {
          lecturePeriodsContext = '\n\n【講習期間一覧】\n';
          lecPeriods.forEach(function(lp) {
            lecturePeriodsContext += lp.id + ': ' + lp.name + '（' + (lp.startDate || '未設定') + ' 〜 ' + (lp.endDate || '未設定') + '）\n';
          });
        }
      } catch (e) {
        Logger.log('⚠ 講習期間取得スキップ: ' + e);
      }
    }

    // 条件付き: 学年コード一覧（成績・生徒関連時のみ）
    var gradeCodesContext = '';
    if (intents.grades || intents.students) {
      gradeCodesContext = '\n\n【学年コード一覧】\n小1=07, 小2=08, 小3=09, 小4=10, 小5=11, 小6=12, 中1=13, 中2=14, 中3=15, 高1=16, 高2=17, 高3=18';
    }

    // 条件付き（既存ロジック維持）: 生徒IDが含まれる場合のみ成績年度を確認
    var studentGradeYearContext = '';
    try {
      var idTokens = resolvedUserMessage.match(/\[生徒ID:(\d+)\]/g);
      if (idTokens && idTokens.length > 0) {
        var yearFoldersRaw = getGradesYearFolders();
        var yearList = (yearFoldersRaw && yearFoldersRaw.success && Array.isArray(yearFoldersRaw.years)) ? yearFoldersRaw.years : [];
        var availableYears = yearList.map(function(y) {
          return parseInt(y || 0, 10);
        }).filter(function(y) { return y > 0; }).sort();
        var yearLines = [];
        idTokens.forEach(function(token) {
          var sid = token.replace('[生徒ID:', '').replace(']', '');
          var yearsWithData = [];
          availableYears.forEach(function(y) {
            try {
              var rows = getDataSheetData(y);
              if (rows.some(function(r) {
                return String(r.studentId || '').trim() === sid;
              })) {
                yearsWithData.push(y);
              }
            } catch (e) { /* 年度フォルダがなければスキップ */ }
          });
          if (yearsWithData.length === 0) {
            yearLines.push(token + ': 成績データなし（全年度）');
          } else if (yearsWithData.length === 1) {
            yearLines.push(token + ': ' + yearsWithData[0] + '年度のみ成績あり → show_student_reportのyearに' + yearsWithData[0] + 'を必ず設定すること');
          } else {
            yearLines.push(token + ': 複数年度に成績あり（' + yearsWithData.join('・') + '年度）→ 年度が会話から特定できなければ聞き返すこと');
          }
        });
        studentGradeYearContext = '\n\n【生徒の成績データ確認結果】\n' + yearLines.join('\n');
      }
    } catch (e) {
      Logger.log('⚠ 生徒成績年度確認スキップ: ' + e);
    }

    // 条件付き: 塾の運営情報（運営・予定関連時のみ）
    var operationsContext = '';
    if (intents.operations || intents.schedule) try {
      var opParts = [];
      var fy = getCurrentFiscalYear();

      // 1. 固定イベント日付（○□★△の上書き設定）
      try {
        var jukuOverrides = getJukuEventOverrides() || {};
        var jukuKeys = Object.keys(jukuOverrides);
        if (jukuKeys.length > 0) {
          var jukuLines = [];
          jukuKeys.forEach(function(k) {
            var parts = k.split('_');
            var type = parts[0], y = parseInt(parts[1] || 0), m = parts[2];
            if (y < fy || y > fy + 1) return;
            var val = jukuOverrides[k];
            var typeLabel = type === 'report' ? '回数報告書' : type === 'meeting' ? '全体ミーティング' : type === 'debit' ? '引落データ' : type === 'email' ? 'メール送信' : type;
            if (val === false) {
              jukuLines.push(typeLabel + ' ' + y + '年' + m + '月: 無効化');
            } else if (val && val.date) {
              jukuLines.push(typeLabel + ' ' + y + '年' + m + '月: ' + val.date + (val.details ? '（' + val.details + '）' : ''));
            }
          });
          if (jukuLines.length > 0) opParts.push('■ 固定イベント上書き\n' + jukuLines.join('\n'));
        }
      } catch (e) { Logger.log('⚠ 固定イベント取得スキップ: ' + e); }

      // 2. 休校日の上書き設定
      try {
        var closedOverrides = getClosedDayOverrides() || {};
        var closedLines = [];
        if (closedOverrides.add && closedOverrides.add.length > 0) {
          closedLines.push('追加休校日: ' + closedOverrides.add.join(', '));
        }
        if (closedOverrides.del && closedOverrides.del.length > 0) {
          closedLines.push('開校日に変更: ' + closedOverrides.del.join(', '));
        }
        if (closedLines.length > 0) opParts.push('■ 休校日設定\n' + closedLines.join('\n'));
      } catch (e) { Logger.log('⚠ 休校日取得スキップ: ' + e); }

      // 3. 基礎学力テスト日程
      try {
        var btOverrides = getBasicTestDateOverrides() || {};
        var btDetails = getBasicTestDetails() || {};
        var btKeys = Object.keys(btOverrides);
        if (btKeys.length > 0) {
          var btLines = [];
          btKeys.forEach(function(k) {
            var detail = btDetails[k] ? '（' + btDetails[k] + '）' : '';
            btLines.push(k + ': ' + btOverrides[k] + detail);
          });
          opParts.push('■ 基礎学力テスト日程（上書き）\n' + btLines.join('\n'));
        }
      } catch (e) { Logger.log('⚠ 基礎学力テスト日程取得スキップ: ' + e); }

      // 4. 公立高校一般入試日程
      try {
        var examOverrides = getPublicHighExamDateOverrides() || {};
        var examKeys = Object.keys(examOverrides);
        if (examKeys.length > 0) {
          var examLines = [];
          examKeys.forEach(function(k) { examLines.push(k + '年度: ' + examOverrides[k]); });
          opParts.push('■ 公立高校一般選抜日程（上書き）\n' + examLines.join('\n'));
        }
      } catch (e) { Logger.log('⚠ 公立高入試日程取得スキップ: ' + e); }

      // 5. 通常授業設定（1コマ時間・月回数・料金）
      try {
        var normalResult = getNormalClassConfig();
        if (normalResult.success && normalResult.data && normalResult.data.length > 0) {
          var normalLines = [];
          normalResult.data.forEach(function(r) {
            normalLines.push(r.grade + ': ' + (r.duration * 10) + '分×月' + r.count + '回'
              + '（内部生 税抜' + r.internal + '円 / 外部生 税抜' + r.external + '円）');
          });
          opParts.push('■ 通常授業設定\n' + normalLines.join('\n'));
        }
      } catch (e) { Logger.log('⚠ 通常授業設定取得スキップ: ' + e); }

      // 6. 講習別料金設定
      try {
        var lecPricingResult = getLecturePricingConfig();
        if (lecPricingResult.success && lecPricingResult.data) {
          var lecPricingLines = [];
          var typeNames = { spring: '春期講習', summer: '夏期講習', kiso1: '基礎学力1', kiso2: '基礎学力2', winter: '冬期講習', nyushi: '入試直前' };
          Object.keys(lecPricingResult.data).forEach(function(typeId) {
            var info = lecPricingResult.data[typeId];
            var rows = info.rows || info;
            if (!Array.isArray(rows) || rows.length === 0) return;
            var label = typeNames[typeId] || typeId;
            var rLines = [];
            rows.forEach(function(r) {
              rLines.push('  ' + r.label + ': 内部生 税抜' + r.internal + '円 / 外部生 税抜' + r.external + '円');
            });
            lecPricingLines.push(label + '\n' + rLines.join('\n'));
          });
          if (lecPricingLines.length > 0) opParts.push('■ 講習別料金\n' + lecPricingLines.join('\n'));
        }
      } catch (e) { Logger.log('⚠ 講習別料金取得スキップ: ' + e); }

      if (opParts.length > 0) {
        operationsContext = '\n\n【塾の運営情報（ユーザーから質問があった場合に使用）】\n' + opParts.join('\n\n');
      }
    } catch (e) {
      Logger.log('⚠ 運営情報コンテキスト生成スキップ: ' + e);
    }

    // 条件付き: カスタムイベント一覧（予定の追加・変更・削除 意図時のみ）
    var customEventsContext = '';
    if (intents.scheduleWrite) {
      try {
        var customEntries = getCustomScheduleEntriesForAI_();
        if (customEntries.length > 0) {
          var ceLines = customEntries.map(function(e) {
            return e.schedule + ' ' + e.school + ' ' + e.eventType
              + (e.details ? '（' + e.details + '）' : '')
              + ' [ID:' + e.docId + ']';
          });
          customEventsContext = '\n\n【変更・削除可能なカスタムイベント一覧】\n'
            + ceLines.join('\n')
            + '\n（※ これ以外の予定は変更・削除できません）';
        }
      } catch (e) {
        Logger.log('⚠ カスタムイベントコンテキスト取得スキップ: ' + e);
      }
    }

    // 条件付き: 講師配置データ（配置・勤務関連時のみ）
    var placementContext = '';
    if (intents.placement) {
      try {
        var placementJson = getScriptProperty('STAFF_PLACEMENT');
        if (placementJson) {
          var placementData = JSON.parse(placementJson);
          var pCampuses = placementData.campuses || {};
          var pTeachers = placementData.teachers || [];
          var pSupervisors = placementData.supervisors || {};
          var pDays = ['月', '火', '水', '木', '金', '土'];

          // 校舎コード→名前マッピング
          var pCampusNames = {};
          Object.keys(pCampuses).forEach(function(code) {
            pCampusNames[code] = pCampuses[code].name || code;
          });

          placementContext = '\n\n【講師配置データ（' + (placementData.year || '') + '年度）】\n';
          placementContext += '曜日: 月〜土（日曜は配置なし）\n';

          // 講師別: 名前→各曜日の校舎名
          placementContext += '\n■ 講師別配置\n';
          pTeachers.forEach(function(t) {
            var line = t.name + '(' + (t.subject || '') + '): ';
            var dayParts = [];
            pDays.forEach(function(day) {
              var code = t[day] || '';
              if (code) {
                dayParts.push(day + '=' + (pCampusNames[code] || code));
              }
            });
            line += dayParts.length > 0 ? dayParts.join(', ') : '配置なし';
            placementContext += line + '\n';
          });

          // 校舎別: 各曜日→責任者＋講師リスト
          placementContext += '\n■ 校舎別配置\n';
          Object.keys(pCampuses).sort().forEach(function(code) {
            placementContext += pCampusNames[code] + ':\n';
            pDays.forEach(function(day) {
              var names = pTeachers.filter(function(t) { return t[day] === code; }).map(function(t) { return t.name; });
              var sup = (pSupervisors[code] && pSupervisors[code][day]) ? pSupervisors[code][day] : '';
              if (names.length > 0 || sup) {
                placementContext += '  ' + day + ': ' + (sup ? '責任者=' + sup + ' / ' : '') + '講師=' + (names.length > 0 ? names.join('、') : 'なし') + '\n';
              } else {
                placementContext += '  ' + day + ': なし\n';
              }
            });
          });
        }
      } catch (e) {
        Logger.log('⚠ 講師配置コンテキスト取得スキップ: ' + e);
      }
    }

    // 条件付き（既存ロジック維持）: 講習エントリコンテキスト
    var lectureEntriesContext = '';
    try {
      if (intents.lectures) {
        var lecCampuses = userPreferredCampusList.length > 0 ? userPreferredCampusList : [];

        // 現在の講習期間を特定
        var currentLecPeriods = getLecturePeriods() || [];
        var today = new Date();
        var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        var activeLectures = currentLecPeriods.filter(function(lp) {
          return lp.startDate && lp.endDate && lp.startDate <= todayStr && todayStr <= lp.endDate;
        });
        // アクティブな講習がなければメッセージから講習名を探す
        var targetLecture = activeLectures.length > 0 ? activeLectures[0] : null;
        if (!targetLecture && currentLecPeriods.length > 0) {
          for (var li = 0; li < currentLecPeriods.length; li++) {
            if (resolvedUserMessage.indexOf(currentLecPeriods[li].name) !== -1) {
              targetLecture = currentLecPeriods[li];
              break;
            }
          }
        }

        if (targetLecture) {
          var gradeLabelsMap = {'07':'小1','08':'小2','09':'小3','10':'小4','11':'小5','12':'小6','13':'中1','14':'中2','15':'中3','16':'高1','17':'高2','18':'高3'};
          lectureEntriesContext = '\n\n【現在の講習エントリ（' + targetLecture.name + '）】\n';
          lectureEntriesContext += 'lectureId: ' + targetLecture.id + '\n';
          lectureEntriesContext += '期間: ' + (targetLecture.startDate || '未設定') + ' 〜 ' + (targetLecture.endDate || '未設定') + '\n';

          // 学年別設定（回数・時間）を含める
          if (targetLecture.gradeSettings) {
            lectureEntriesContext += '学年別設定: ';
            var gsLines = [];
            Object.keys(targetLecture.gradeSettings).forEach(function(gk) {
              var gs = targetLecture.gradeSettings[gk];
              if (gs && gs.count > 0) {
                gsLines.push(gk + '=' + (gs.duration * 10) + '分×' + gs.count + '回');
              }
            });
            lectureEntriesContext += gsLines.join(', ') + '\n';
          }

          // 配属校舎ごとにエントリを表示
          if (lecCampuses.length === 1) {
            // 校舎が1つ → そのまま使う
            lectureEntriesContext += 'campusCode: ' + lecCampuses[0] + '\n';
            var lecEntries = getLectureScheduleEntries(targetLecture.id, lecCampuses[0]);
            if (lecEntries.length > 0) {
              lecEntries.forEach(function(e) {
                var gradeName = gradeLabelsMap[e.grade] || e.grade;
                lectureEntriesContext += 'ID:' + e.id + ' | ' + e.date + ' ' + e.startTime + '〜 | '
                  + e.subject + ' | ' + gradeName
                  + (e.classLabel ? '(' + e.classLabel + ')' : '')
                  + ' | 講師:' + (e.teacherName || '不明')
                  + ' | ' + (e.durationSlots * 10) + '分\n';
              });
            } else {
              lectureEntriesContext += 'エントリなし\n';
            }
          } else if (lecCampuses.length > 1) {
            // 校舎が複数 → 校舎ごとに分けて表示
            var campusMapForLec = {};
            campusConfig.forEach(function(c) { campusMapForLec[c.code] = c.name; });
            lecCampuses.forEach(function(cc) {
              lectureEntriesContext += '\n--- ' + (campusMapForLec[cc] || cc) + '（campusCode: ' + cc + '）---\n';
              var lecEntries = getLectureScheduleEntries(targetLecture.id, cc);
              if (lecEntries.length > 0) {
                lecEntries.forEach(function(e) {
                  var gradeName = gradeLabelsMap[e.grade] || e.grade;
                  lectureEntriesContext += 'ID:' + e.id + ' | ' + e.date + ' ' + e.startTime + '〜 | '
                    + e.subject + ' | ' + gradeName
                    + (e.classLabel ? '(' + e.classLabel + ')' : '')
                    + ' | 講師:' + (e.teacherName || '不明')
                    + ' | ' + (e.durationSlots * 10) + '分\n';
                });
              } else {
                lectureEntriesContext += 'エントリなし\n';
              }
            });
          } else {
            lectureEntriesContext += '※ 配属校舎が未設定です。校舎を指定してください。\n';
          }

          // ユーザー自身のエントリのみを抽出してサマリー追加
          try {
            var myEmail = '';
            try { myEmail = getFirebaseEmailContext_() || ''; } catch (e2) {}
            if (myEmail && targetLecture) {
              var campusMapForMyEntries = {};
              campusConfig.forEach(function(c) { campusMapForMyEntries[c.code] = c.name; });
              var DOW_AI = ['日', '月', '火', '水', '木', '金', '土'];

              // 全校舎分のユーザーエントリを収集
              var allMyCampuses = lecCampuses.length > 0 ? lecCampuses : Object.keys(campusMapForMyEntries);
              var myEntriesByCampus = {};
              allMyCampuses.forEach(function(cc) {
                try {
                  var entries = getLectureScheduleEntries(targetLecture.id, cc);
                  var mine = entries.filter(function(e) { return e.teacherEmail === myEmail; });
                  if (mine.length > 0) myEntriesByCampus[cc] = mine;
                } catch (e3) {}
              });

              var myCampusCodes = Object.keys(myEntriesByCampus).sort();
              if (myCampusCodes.length > 0) {
                lectureEntriesContext += '\n\n【あなた（' + userDisplayName + '）の講習コマ一覧】\n';
                myCampusCodes.forEach(function(cc) {
                  var cName = campusMapForMyEntries[cc] || cc;
                  lectureEntriesContext += '■ ' + cName + '\n';
                  var mine = myEntriesByCampus[cc];
                  // 学年→教科→時間帯でグルーピング
                  var byGrade = {};
                  var gradeOrder = [];
                  mine.forEach(function(e) {
                    var g = gradeLabelsMap[e.grade] || e.grade;
                    if (!byGrade[g]) { byGrade[g] = []; gradeOrder.push(g); }
                    byGrade[g].push(e);
                  });
                  gradeOrder.forEach(function(g) {
                    var bySubject = {};
                    var subOrder = [];
                    byGrade[g].forEach(function(e) {
                      var s = e.subject + (e.classLabel ? '(' + e.classLabel + ')' : '');
                      if (!bySubject[s]) { bySubject[s] = []; subOrder.push(s); }
                      bySubject[s].push(e);
                    });
                    subOrder.forEach(function(s) {
                      // 時間帯でグルーピングし日付をまとめる
                      var tgMap = {};
                      var tgOrder = [];
                      bySubject[s].forEach(function(e) {
                        var key = (e.startTime || '') + '_' + (e.durationSlots || 0);
                        if (!tgMap[key]) {
                          tgMap[key] = { start: e.startTime || '', slots: e.durationSlots || 0, dates: [] };
                          tgOrder.push(key);
                        }
                        if (tgMap[key].dates.indexOf(e.date) === -1) tgMap[key].dates.push(e.date);
                      });
                      tgOrder.forEach(function(k) {
                        tgMap[k].dates.sort();
                        var grp = tgMap[k];
                        // 終了時刻計算
                        var sp = (grp.start || '00:00').split(':');
                        var totalMin = (parseInt(sp[0],10)||0)*60 + (parseInt(sp[1],10)||0) + (grp.slots||0)*10;
                        var endStr = ('0'+Math.floor(totalMin/60)).slice(-2) + ':' + ('0'+(totalMin%60)).slice(-2);
                        // 日付フォーマット
                        var prevMo = -1;
                        var dateStr = grp.dates.map(function(d) {
                          var dt = new Date(d + 'T00:00:00');
                          var mo = dt.getMonth() + 1;
                          var day = dt.getDate();
                          var dow = DOW_AI[dt.getDay()];
                          var str = (mo !== prevMo ? mo + '/' : '') + day + '(' + dow + ')';
                          prevMo = mo;
                          return str;
                        }).join('・');
                        lectureEntriesContext += g + ' ' + s + ': ' + dateStr + ' ' + grp.start + '～' + endStr + '\n';
                      });
                    });
                  });
                });
              }
            }
          } catch (e4) {
            Logger.log('⚠ ユーザーエントリサマリー取得スキップ: ' + e4);
          }
        }
      }
    } catch (e) {
      Logger.log('⚠ 講習エントリコンテキスト取得スキップ: ' + e);
    }

    // === 最終ユーザーターンの組み立て（動的コンテキスト + ユーザーメッセージ） ===
    var now = new Date();
    var dayOfWeekNames = ['日', '月', '火', '水', '木', '金', '土'];
    var todayDayOfWeek = dayOfWeekNames[now.getDay()];
    var userTurn = '[Current Date & Academic Year]\n'
      + 'Today: ' + now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + ' (' + todayDayOfWeek + '曜日)\n'
      + 'Academic year: ' + currentAcademicYear + ' (April ' + currentAcademicYear + ' – March ' + (currentAcademicYear + 1) + ')\n'
      + userInfo + '\n'
      + adminContext + '\n'
      + kbContext + campusListContext + pricingContext + testNamesContext + gradeAnalysisContext
      + studentSummaryContext + lecturePeriodsContext + gradeCodesContext
      + studentGradeYearContext + operationsContext + customEventsContext + placementContext + lectureEntriesContext
      + '\n\n[User Message]\n' + resolvedUserMessage;

    // 最終ユーザーターンを contents 配列に追加
    contents.push({ role: 'user', parts: [{ text: userTurn }] });

    // === ペイロード組み立て（systemInstruction + マルチターン contents） ===

    var payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
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
      return { success: false, error: parseGeminiErrorMessage_(response), type: 'error' };
    }

    var result = JSON.parse(response.getContentText());
    if (result.candidates && result.candidates.length > 0) {
      var parts = (result.candidates[0].content.parts || []);
      var textPart = parts.filter(function(p) { return !p.thought; }).pop();
      var rawText = textPart ? (textPart.text || '') : '';
      var cleanedText = rawText.replace(/```+json[\r\n]*/gi, '').replace(/```+[\r\n]*/g, '').trim();
      var jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanedText = jsonMatch[0];

      try {
        var aiResponse = JSON.parse(cleanedText);

        // Geminiの返答内の生徒IDを氏名に戻す（バックエンドで完結・氏名は外部に渡っていない）
        var textFields = ['answer', 'response', 'explanation', 'message'];
        textFields.forEach(function(field) {
          if (aiResponse[field]) {
            aiResponse[field] = restoreStudentNamesInResponse_(aiResponse[field], studentMaster);
          }
        });

        // config_change の場合、バックエンドで設定を実際に適用する
        if (aiResponse.type === 'config_change' && aiResponse.recommendedSettings) {
          try {
            applyConfigChange_(aiResponse.recommendedSettings);
          } catch (cfgErr) {
            Logger.log('⚠ config_change 適用エラー: ' + cfgErr);
          }
        }

        // 自動学習: Geminiが知識を抽出した場合はFirestoreに保存
        if (aiResponse.learned_knowledge && aiResponse.learned_knowledge.content) {
          try {
            var lk = aiResponse.learned_knowledge;
            // 生徒名が含まれている場合はサニタイズ（個人情報保護）
            var sanitizedContent = resolveStudentNamesInMessage_(lk.content, studentMaster, campusConfig);
            saveAutoLearnedKnowledge_({
              category: lk.category || 'その他',
              content: sanitizedContent,
              reason: lk.reason || ''
            });
          } catch (lkErr) {
            Logger.log('⚠ 自動学習保存エラー: ' + lkErr);
          }
          delete aiResponse.learned_knowledge;
        }

        // フィードバック: 情報不足・機能リクエストをSupabaseに保存
        if (aiResponse.feedback && aiResponse.feedback.type && aiResponse.feedback.summary) {
          try {
            var fb = aiResponse.feedback;
            var fbDocId = 'fb_' + new Date().getTime();
            supabaseUpsert_('ai_feedback', {
              id: fbDocId,
              type: fb.type,
              summary: fb.summary,
              user_query: userMessage || '',
              resolved: false,
              created_at: new Date().toISOString()
            }, 'id');
          } catch (fbErr) {
            Logger.log('⚠ フィードバック保存エラー: ' + fbErr);
          }
          delete aiResponse.feedback;
        }

        return aiResponse;
      } catch (parseError) {
        Logger.log('❌ パースエラー: ' + parseError + ' / rawText: ' + rawText.substring(0, 200));
        return { success: false, error: 'レスポンスの解析に失敗しました。もう一度お試しください。', type: 'error' };
      }
    }

    return { success: false, error: 'AIレスポンスが空', type: 'error' };

  } catch (error) {
    Logger.log('❌ requestAIAssistantエラー: ' + error);
    return { success: false, error: error.toString(), type: 'error' };
  }
}

/**
 * config_change の推奨設定をバックエンドで実際に適用する内部ヘルパー
 * @param {Object} settings 変更する設定のキー・値ペア
 */
function applyConfigChange_(settings) {
  if (!settings) return;
  if (settings.themeColor) {
    setUserProperty('USER_THEME_COLOR', settings.themeColor);
  }
  if (settings.aiAssistantName) {
    setUserProperty('AI_ASSISTANT_NAME', settings.aiAssistantName);
  }
  if (settings.aiPersonality) {
    setUserProperty('AI_PERSONALITY', settings.aiPersonality);
  }
  if (settings.displayName) {
    setUserProperty('DISPLAY_NAME', settings.displayName);
    // updatedAt を記録（name は登録時のまま変更しない）
    var staff = getCurrentStaff_();
    if (staff) {
      staff.updatedAt = new Date().toISOString();
      writeStaffToSupabase_(staff);
    }
  }
}

/**
 * AIアシスタントの確認済みアクションを実行するエントリーポイント
 * フロントエンドでユーザーが「はい」と承認した後に呼ばれる
 * @aiCallable
 * @param {string} action アクション名（submit_grade / submit_student / add_schedule）
 * @param {string} paramsJson アクションパラメータのJSON文字列
 * @return {Object} 実行結果 { success, message, error }
 */
function executeAiAction(action, paramsJson) {
  try {
    var params = JSON.parse(paramsJson);

    if (action === 'submit_grade') {
      var year = params.year || getCurrentFiscalYear();
      var scores = params.scores || {};
      return submitGradeData(year, params.studentId, params.testName, scores);
    }

    if (action === 'submit_student') {
      var yr = params.year || getCurrentFiscalYear();
      // submitStudentInfo(year, campusCode, gradeCode, sei, mei, seiFurigana, meiFurigana, schoolName)
      return submitStudentInfo(yr, params.campusCode, params.gradeCode,
        params.sei || '', params.mei || '', params.seiFurigana || '', params.meiFurigana || '', params.schoolName || '');
    }

    if (action === 'add_schedule') {
      var dateParts = String(params.date || '').split('-');
      var aYear  = parseInt(dateParts[0], 10) || new Date().getFullYear();
      var aMonth = parseInt(dateParts[1], 10) || (new Date().getMonth() + 1);
      var aDay   = parseInt(dateParts[2], 10) || 1;
      return addScheduleEntryAI_(params.schoolName, params.eventName, aYear, aMonth, aDay, params.details || '');
    }

    if (action === 'edit_schedule') {
      var editChanges = params.changes || {};
      if (editChanges.date) {
        var dp = String(editChanges.date).split('-');
        editChanges.dateYear  = parseInt(dp[0], 10);
        editChanges.dateMonth = parseInt(dp[1], 10);
        editChanges.dateDay   = parseInt(dp[2], 10);
        delete editChanges.date;
      }
      return editScheduleEntryAI_(params.docId, editChanges);
    }

    if (action === 'delete_schedule') {
      return deleteScheduleEntryAI_(params.docId);
    }

    if (action === 'create_lecture_entry') {
      if (params.weekly) {
        return createWeeklyLectureEntriesAI_(
          params.lectureId, params.campusCode, params.date, params.startTime,
          params.durationSlots || 9, params.subject, params.grade, params.classLabel || ''
        );
      }
      return createLectureEntryAI_(
        params.lectureId, params.campusCode, params.date, params.startTime,
        params.durationSlots || 9, params.subject, params.grade, params.classLabel || ''
      );
    }

    if (action === 'edit_lecture_entry') {
      return editLectureEntryAI_(params.lectureId, params.campusCode, params.entryId, params.changes || {});
    }

    if (action === 'delete_lecture_entry') {
      return deleteLectureEntryAI_(params.lectureId, params.campusCode, params.entryId);
    }

    if (action === 'bulk_lecture_operations') {
      return bulkLectureOperationsAI_(params.lectureId, params.campusCode, params.operations || []);
    }

    return { success: false, error: '不明なアクション: ' + action };

  } catch (error) {
    Logger.log('❌ executeAiActionエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// ナレッジベース管理（セクション9 続き）
// ----------------------------------------

/**
 * AIナレッジベースのエントリ一覧を取得する（Admin のみ）
 * @return {Object} { success, entries }
 */
function getAiKnowledgeBase() {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var raw = getProperty(PROP_KEYS.AI_KNOWLEDGE_BASE);
    var entries = raw ? JSON.parse(raw) : [];
    return { success: true, entries: entries };
  } catch (error) {
    Logger.log('❌ getAiKnowledgeBaseエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIナレッジベースのエントリを追加・更新する（Admin のみ）
 * idがあれば更新、なければ新規追加
 * @param {string} entryJson JSON文字列 { id?, category, content }
 * @return {Object} { success, message }
 */
function saveAiKnowledgeEntry(entryJson) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var entry = JSON.parse(entryJson);
    if (!entry.category || !entry.content) {
      return { success: false, error: 'カテゴリと内容は必須です' };
    }

    var raw = getProperty(PROP_KEYS.AI_KNOWLEDGE_BASE);
    var entries = raw ? JSON.parse(raw) : [];
    var now = new Date().toISOString();

    if (entry.id) {
      // 更新
      var found = false;
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === entry.id) {
          entries[i].category = entry.category;
          entries[i].content = entry.content;
          entries[i].updatedAt = now;
          found = true;
          break;
        }
      }
      if (!found) {
        return { success: false, error: '指定されたエントリが見つかりません' };
      }
    } else {
      // 新規追加
      var newEntry = {
        id: 'kb_' + Date.now(),
        category: entry.category,
        content: entry.content,
        updatedAt: now
      };
      entries.push(newEntry);
    }

    setProperty(PROP_KEYS.AI_KNOWLEDGE_BASE, JSON.stringify(entries));
    return { success: true, message: entry.id ? '更新しました' : '追加しました' };
  } catch (error) {
    Logger.log('❌ saveAiKnowledgeEntryエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIナレッジベースのエントリを削除する（Admin のみ）
 * @param {string} entryId 削除するエントリのID
 * @return {Object} { success, message }
 */
function deleteAiKnowledgeEntry(entryId) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var raw = getProperty(PROP_KEYS.AI_KNOWLEDGE_BASE);
    var entries = raw ? JSON.parse(raw) : [];
    var newEntries = entries.filter(function(e) { return e.id !== entryId; });

    if (newEntries.length === entries.length) {
      return { success: false, error: '指定されたエントリが見つかりません' };
    }

    setProperty(PROP_KEYS.AI_KNOWLEDGE_BASE, JSON.stringify(newEntries));
    return { success: true, message: '削除しました' };
  } catch (error) {
    Logger.log('❌ deleteAiKnowledgeEntryエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIプロンプト用にナレッジベースをテキスト形式で返す（内部ヘルパー）
 * エントリがない場合は空文字列を返す
 * @return {string} プロンプト用テキスト
 */
function getAiKnowledgeBaseForPrompt_() {
  // 手動KBエントリを取得
  var allEntries = [];
  try {
    var raw = getProperty(PROP_KEYS.AI_KNOWLEDGE_BASE);
    if (raw) {
      var manualEntries = JSON.parse(raw);
      manualEntries.forEach(function(e) {
        allEntries.push({ category: e.category, content: e.content });
      });
    }
  } catch (e) {
    Logger.log('⚠ 手動KB取得スキップ: ' + e);
  }

  // Supabase自動学習エントリを取得（全件有効）
  try {
    var autoEntries = supabaseSelect_('ai_learned_knowledge');
    if (autoEntries && autoEntries.length > 0) {
      autoEntries.forEach(function(e) {
        allEntries.push({ category: e.category || 'その他', content: e.content });
      });
    }
  } catch (e) {
    Logger.log('⚠ 自動学習KB取得スキップ: ' + e);
  }

  if (allEntries.length === 0) return '';

  // カテゴリ別にグループ化
  var categories = {};
  allEntries.forEach(function(e) {
    if (!categories[e.category]) categories[e.category] = [];
    categories[e.category].push(e.content);
  });

  var lines = ['\n\n【塾のナレッジベース】',
    '以下は塾の情報です（管理者登録＋AIが会話から学習した知識）。ユーザーの質問に該当する情報があればこれを元に回答してください。',
    '該当する情報がない場合は「その件については管理者にご確認ください」と案内してください。'];

  Object.keys(categories).forEach(function(cat) {
    lines.push('\n■ ' + cat);
    categories[cat].forEach(function(content) {
      lines.push('- ' + content);
    });
  });

  return lines.join('\n');
}

// ----------------------------------------
// AI自動学習（会話からの知識蓄積）
// ----------------------------------------

/**
 * 会話から抽出された知識をSupabaseに自動保存する内部ヘルパー
 * 重複チェック・上限チェック付き
 * @param {Object} data { category, content, reason }
 */
function saveAutoLearnedKnowledge_(data) {
  if (!data || !data.content) return;

  // 上限チェック（30件を超えたら新規学習を一時停止）
  try {
    var existing = supabaseSelect_('ai_learned_knowledge', null, { select: 'id' });
    if (existing && existing.length >= 30) {
      Logger.log('⚠ 自動学習上限（30件）に達しているため保存スキップ');
      return;
    }
  } catch (e) {
    Logger.log('⚠ 自動学習件数チェックスキップ: ' + e);
  }

  // 重複チェック
  if (isDuplicateKnowledge_(data.content)) {
    Logger.log('⚠ 重複する知識のため保存スキップ: ' + data.content.substring(0, 50));
    return;
  }

  var docId = 'lk_' + Date.now();
  supabaseUpsert_('ai_learned_knowledge', {
    id: docId,
    category: data.category || 'その他',
    content: data.content,
    reason: data.reason || '',
    source: 'conversation',
    learned_at: new Date().toISOString()
  }, 'id');
  Logger.log('✅ 自動学習保存: ' + docId + ' / ' + data.content.substring(0, 50));
}

/**
 * 新しい知識が既存の知識と重複しているか判定する内部ヘルパー
 * 手動KB（ScriptProperties）と自動学習済み（Firestore）の両方をチェック
 * Jaccard類似度 > 0.6 で重複と判定
 * @param {string} newContent 新しい知識の内容
 * @return {boolean} 重複している場合 true
 */
function isDuplicateKnowledge_(newContent) {
  if (!newContent) return false;

  var newTokens = tokenizeForSimilarity_(newContent);
  if (newTokens.length === 0) return false;

  // 手動KBのエントリをチェック
  try {
    var raw = getProperty(PROP_KEYS.AI_KNOWLEDGE_BASE);
    if (raw) {
      var manualEntries = JSON.parse(raw);
      for (var i = 0; i < manualEntries.length; i++) {
        if (jaccardSimilarity_(newTokens, tokenizeForSimilarity_(manualEntries[i].content)) > 0.6) {
          return true;
        }
      }
    }
  } catch (e) {
    Logger.log('⚠ 手動KB重複チェックスキップ: ' + e);
  }

  // Supabaseの自動学習エントリをチェック
  try {
    var autoEntries = supabaseSelect_('ai_learned_knowledge', null, { select: 'content' });
    if (autoEntries && autoEntries.length > 0) {
      for (var j = 0; j < autoEntries.length; j++) {
        if (jaccardSimilarity_(newTokens, tokenizeForSimilarity_(autoEntries[j].content)) > 0.6) {
          return true;
        }
      }
    }
  } catch (e) {
    Logger.log('⚠ Supabase重複チェックスキップ: ' + e);
  }

  return false;
}

/**
 * テキストをトークン（単語）に分割する内部ヘルパー
 * 日本語は2文字グラムを使用
 * @param {string} text 入力テキスト
 * @return {Array<string>} トークン配列
 */
function tokenizeForSimilarity_(text) {
  if (!text) return [];
  // 句読点・記号を除去し正規化
  var cleaned = text.replace(/[\s、。！？!?.,;:（）()「」『』【】\-—・]/g, '');
  if (cleaned.length < 2) return [cleaned];
  // 2文字グラム（バイグラム）に分割
  var tokens = [];
  for (var i = 0; i < cleaned.length - 1; i++) {
    tokens.push(cleaned.substring(i, i + 2));
  }
  return tokens;
}

/**
 * 2つのトークン配列のJaccard類似度を計算する内部ヘルパー
 * @param {Array<string>} tokensA トークン配列A
 * @param {Array<string>} tokensB トークン配列B
 * @return {number} 0.0〜1.0 の類似度
 */
function jaccardSimilarity_(tokensA, tokensB) {
  if (!tokensA || !tokensB || tokensA.length === 0 || tokensB.length === 0) return 0;
  var setA = {};
  tokensA.forEach(function(t) { setA[t] = true; });
  var setB = {};
  tokensB.forEach(function(t) { setB[t] = true; });

  var intersection = 0;
  Object.keys(setA).forEach(function(t) {
    if (setB[t]) intersection++;
  });

  var union = Object.keys(setA).length + Object.keys(setB).length - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 自動学習エントリ一覧を取得する（Admin のみ）
 * @return {Object} { success, entries }
 */
function getAutoLearnedKnowledge() {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var rows = supabaseSelect_('ai_learned_knowledge', null, { order: 'learned_at.desc' });
    // フロントエンド互換のためキャメルケースに変換
    var entries = rows.map(function(r) {
      return {
        _id: r.id, category: r.category, content: r.content,
        reason: r.reason, source: r.source,
        learnedAt: r.learned_at, updatedAt: r.updated_at
      };
    });
    return { success: true, entries: entries };
  } catch (error) {
    Logger.log('❌ getAutoLearnedKnowledgeエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 自動学習エントリを編集する（Admin のみ）
 * @param {string} docId ドキュメントID
 * @param {string} entryJson JSON文字列 { category, content }
 * @return {Object} { success, message }
 */
function editAutoLearnedKnowledge(docId, entryJson) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var entry = JSON.parse(entryJson);
    if (!entry.category || !entry.content) {
      return { success: false, error: 'カテゴリと内容は必須です' };
    }

    // 既存レコードを確認
    var rows = supabaseSelect_('ai_learned_knowledge', 'id=eq.' + docId);
    if (!rows || rows.length === 0) {
      return { success: false, error: '指定されたエントリが見つかりません' };
    }
    supabaseUpsert_('ai_learned_knowledge', {
      id: docId,
      category: entry.category,
      content: entry.content,
      updated_at: new Date().toISOString()
    }, 'id');
    return { success: true, message: '更新しました' };
  } catch (error) {
    Logger.log('❌ editAutoLearnedKnowledgeエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 自動学習エントリを削除する（Admin のみ）
 * @param {string} docId ドキュメントID
 * @return {Object} { success, message }
 */
function deleteAutoLearnedKnowledge(docId) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    supabaseDelete_('ai_learned_knowledge', 'id=eq.' + docId);
    return { success: true, message: '削除しました' };
  } catch (error) {
    Logger.log('❌ deleteAutoLearnedKnowledgeエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// AIフィードバック管理
// ----------------------------------------

/**
 * フィードバック一覧を取得する（Admin のみ）
 * @return {Object} { success, entries }
 */
function getAiFeedback() {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var rows = supabaseSelect_('ai_feedback', null, { order: 'created_at.desc' });
    // フロントエンド互換のためキャメルケースに変換
    var entries = rows.map(function(r) {
      return {
        _id: r.id, type: r.type, summary: r.summary,
        userQuery: r.user_query, resolved: r.resolved,
        createdAt: r.created_at, resolvedAt: r.resolved_at
      };
    });
    return { success: true, entries: entries };
  } catch (error) {
    Logger.log('❌ getAiFeedbackエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * フィードバックを解決済みにする（Admin のみ）
 * @param {string} docId ドキュメントID
 * @return {Object} { success, message }
 */
function resolveAiFeedback(docId) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    var rows = supabaseSelect_('ai_feedback', 'id=eq.' + docId);
    if (!rows || rows.length === 0) return { success: false, error: 'エントリが見つかりません' };
    supabaseUpsert_('ai_feedback', {
      id: docId,
      resolved: true,
      resolved_at: new Date().toISOString()
    }, 'id');
    return { success: true, message: '解決済みにしました' };
  } catch (error) {
    Logger.log('❌ resolveAiFeedbackエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * フィードバックを削除する（Admin のみ）
 * @param {string} docId ドキュメントID
 * @return {Object} { success, message }
 */
function deleteAiFeedback(docId) {
  if (!isAdmin()) {
    return { success: false, error: 'Admin のみアクセス可能' };
  }
  try {
    supabaseDelete_('ai_feedback', 'id=eq.' + docId);
    return { success: true, message: 'フィードバックを削除しました' };
  } catch (error) {
    Logger.log('❌ deleteAiFeedbackエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// 【セクション19】料金表管理
// ========================================
// 資料タブの「料金表」サブタブで表示・編集する料金データを管理する

/**
 * 料金表のデフォルトデータを返す（初回用）
 * @return {Object} デフォルト料金表データ
 */
function getDefaultPricingData_() {
  return {
    version: 3,
    title: '通常授業料金',
    tabs: ['通常授業', '講習'],
    sections: [
      {
        id: 'regular',
        tab: '通常授業',
        name: '個別指導料金',
        headers: ['学年', 'コース', '1科目', 'テキスト代'],
        rows: [
          ['小学生', '算・国・英', '6,000 (6,600)', '1,750 (1,925)'],
          ['', '英・数・国（3人）', '11,000 (12,100)', '1,750 (1,925)'],
          ['', '英・数・国（6人）', '9,500 (10,450)', '1,750 (1,925)'],
          ['中学生', '理', '8,000 (8,800)', '1,750 (1,925)'],
          ['', '社', '8,000 (8,800)', '2,250 (2,475)'],
          ['', '英単語テスト', '1,000 (1,100)', '1,000 (1,100)'],
          ['', '基礎数学', '3,500 (3,850)', ''],
          ['高校生', '1年・2年', '13,500 (14,850)', '毎月1,000 (1,100)'],
          ['', '3年', '14,500 (15,950)', '毎月1,000 (1,100)']
        ],
        notes: [
          '※割引',
          '小学生…3科目受講で、2,000 (2,200) 円割引',
          '中学生…3人クラス3科目受講で、2,000 (2,200)円割引',
          '3人クラス2科目・6人クラス1科目受講で、1,500 (1,650) 円割引',
          '3人クラス1科目・6人クラス2科目受講で、1,000 (1,100) 円割引',
          '高校生…3科目受講で、2,000 (2,200) 円割引',
          '4科目受講で、4,000 (4,400) 円割引',
          '5科目受講で、6,000 (6,600) 円割引'
        ]
      },
      {
        id: 'shozui',
        tab: '通常授業',
        name: '※勝瑞校',
        headers: ['学年', '科目', '月額', '教材費'],
        rows: [
          ['高1', '英語', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '数学', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '5,000 (5,500)', '毎月1,000 (1,100)'],
          ['高2', '英語', '14,000 (15,400)', '毎月1,000 (1,100)'],
          ['', '数学', '15,000 (16,500)', '毎月1,000 (1,100)'],
          ['', '理科(物・化)', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '6,000 (6,600)', '毎月1,000 (1,100)'],
          ['高3', '英語', '16,000 (17,600)', '毎月1,000 (1,100)'],
          ['', '数学', '17,000 (18,700)', '毎月1,000 (1,100)'],
          ['', '理科(物・化)', '14,000 (15,400)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '7,000 (7,700)', '毎月1,000 (1,100)']
        ],
        notes: [
          '※演習クラスは、授業料に含まれている。別で受講することも可。'
        ]
      },
      {
        id: 'individual',
        tab: '通常授業',
        name: '完全個別',
        headers: ['', '1科目', '2科目', '3科目', 'テキスト代'],
        rows: [
          ['小学生', '12,000 (13,200)', '', '', '1,750 (1,925)'],
          ['中学生', '18,000 (19,800)', '', '', '1,750 (1,925)'],
          ['高校生', '24,000 (26,400)', '46,000 (50,600)', '68,000 (74,800)', '毎月 500 (550)']
        ],
        notes: [
          '※高校生は1科目を週2回受講した場合は2科目として計算すること'
        ]
      },
      {
        id: 'enrollment',
        tab: '通常授業',
        name: '入塾金・諸経費',
        headers: ['項目', '対象', '金額', '', ''],
        rows: [
          ['入塾金', '全学年・全クラス', '10,000 (11,000)', '兄弟姉妹割引', ''],
          ['諸経費', '小学生', '2,000 (2,200)', '2人同時通塾', '3,000 (3,300)'],
          ['', '中学生・高校生', '3,000 (3,300)', '3人同時通塾', '6,000 (6,600)'],
          ['', '', '', '※上の子の料金から割引', '']
        ],
        notes: []
      },
      {
        id: 'seasonal',
        tab: '講習',
        name: '講習料金',
        headers: ['学年', '期間', '内部生', '外部生'],
        rows: [
          ['小学生', '春期・夏期・冬期', '4,000 (4,400)', '5,000 (5,500)'],
          ['中学生（1・2年生）', '春期・夏期・冬期', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '春期', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '第1回基礎学対策', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '第2回基礎学対策', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '夏・冬・直前（6回）', '12,000 (13,200)', '13,500 (14,850)'],
          ['中学生（3年生）', '冬（4回）', '', '9,000 (9,900)'],
          ['', '2科目受講（6回）', '1科目 11,500円で、23,000 (25,300)', ''],
          ['', '3科目受講（6回）', '1科目 11,000円で、33,000 (36,300)', ''],
          ['', '4科目受講（6回）', '1科目 10,500円で、42,000 (46,200)', ''],
          ['', '5科目受講（6回）', '1科目 10,000円で、50,000 (55,000)', ''],
          ['中学生', '定期テスト対策（4回）', '8,000 (8,800)', '9,000 (9,900)'],
          ['', '定期テスト対策（6回）', '12,000 (13,200)', '13,500 (14,850)']
        ],
        notes: [
          '※外部生は割引なし',
          '高1準備講座は 1科目 1,000円（2科目セット税込 2,200円）外部生は無料'
        ]
      },
      {
        id: 'seasonal_high',
        tab: '講習',
        name: '高校生 講習料金（回数別）',
        headers: ['学年', '1回', '2回', '3回', '4回', '外部生（1科目）'],
        rows: [
          ['高校生（1・2年生）', '2,625 (2,887)', '5,250 (5,775)', '7,875 (8,662)', '10,500 (11,550)', '12,500 (13,750)'],
          ['春期・夏期・冬期', '3,875 (4,262)', '7,750 (8,525)', '11,625 (12,787)', '15,500 (17,050)', ''],
          ['高校生（3年生）', '1科目受講(4回)', '', '2科目受講(各4回)', '', '外部生（1科目）'],
          ['春期・夏期・冬期', '1科目 15,500 (17,050)', '', '1科目 14,000円で、28,000 (30,800)', '', '16,500 (18,150)']
        ],
        notes: []
      }
    ],
    footerNotes: [
      '※すべての料金において、1円未満の端数は切り捨てること。',
      '例えば、中学1・2年に社会のテキストを1冊だけ渡す場合など。'
    ]
  };
}

/**
 * 料金表データを取得する
 * @aiCallable
 * @return {Object} { success, data } 料金表データ
 */
function getPricingConfigForWeb() {
  try {
    var json = getScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    var data;
    if (json) {
      data = JSON.parse(json);
      // バージョンチェック: v2未満なら最新デフォルトで上書き
      if (!data.version || data.version < 2) {
        data = getDefaultPricingData_();
        setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
      }
      // v2→v3: タブ分類フィールドを追加
      if (data.version < 3) {
        data.version = 3;
        data.tabs = ['通常授業', '講習'];
        var lectureIds = ['seasonal', 'seasonal_high', 'mock'];
        data.sections.forEach(function(s) {
          if (!s.tab) {
            s.tab = (lectureIds.indexOf(s.id) >= 0) ? '講習' : '通常授業';
          }
        });
        setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
      }
    } else {
      data = getDefaultPricingData_();
      setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    }
    // 'mock'（とくもし）セクションが残っていれば削除して保存
    if (data.sections && data.sections.some(function(s) { return s.id === 'mock'; })) {
      data.sections = data.sections.filter(function(s) { return s.id !== 'mock'; });
      setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    }
    return { success: true, data: data, campusMap: getCampusConfig() };
  } catch (error) {
    Logger.log('❌ getPricingConfigForWebエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 料金表データを一括保存する（Admin のみ）
 * @param {string} jsonData 料金表データ（JSON文字列）
 * @return {Object} { success, message }
 */
function savePricingConfig(jsonData) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var data = JSON.parse(jsonData);
    if (!data.title || !data.sections) {
      return { success: false, error: 'データ形式が正しくありません' };
    }
    setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    return { success: true, message: '料金表を保存しました' };
  } catch (error) {
    Logger.log('❌ savePricingConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 料金表のセクションを追加する（Admin のみ）
 * @param {string} sectionName セクション名
 * @param {string} headersJson ヘッダー配列（JSON文字列）
 * @return {Object} { success, message, sectionId }
 */
function addPricingSection(sectionName, headersJson) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    var data = json ? JSON.parse(json) : getDefaultPricingData_();
    var newId = 'sec_' + Date.now();
    var headers = JSON.parse(headersJson);
    data.sections.push({
      id: newId,
      name: sectionName,
      headers: headers,
      rows: [],
      notes: []
    });
    setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    return { success: true, message: 'セクションを追加しました', sectionId: newId };
  } catch (error) {
    Logger.log('❌ addPricingSectionエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 料金表のセクションを削除する（Admin のみ）
 * @param {string} sectionId セクションID
 * @return {Object} { success, message }
 */
function deletePricingSection(sectionId) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    if (!json) return { success: false, error: 'データがありません' };
    var data = JSON.parse(json);
    data.sections = data.sections.filter(function(s) { return s.id !== sectionId; });
    setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    return { success: true, message: 'セクションを削除しました' };
  } catch (error) {
    Logger.log('❌ deletePricingSectionエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 料金表のタイトルを更新する（Admin のみ）
 * @param {string} newTitle 新しいタイトル
 * @return {Object} { success, message }
 */
function updatePricingTitle(newTitle) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    if (!json) return { success: false, error: 'データがありません' };
    var data = JSON.parse(json);
    data.title = newTitle;
    setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    return { success: true, message: 'タイトルを更新しました' };
  } catch (error) {
    Logger.log('❌ updatePricingTitleエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 料金表のフッター注記を更新する（Admin のみ）
 * @param {string} notesJson 注記配列（JSON文字列）
 * @return {Object} { success, message }
 */
function updatePricingFooterNotes(notesJson) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    if (!json) return { success: false, error: 'データがありません' };
    var data = JSON.parse(json);
    data.footerNotes = JSON.parse(notesJson);
    setScriptProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(data));
    return { success: true, message: 'フッター注記を更新しました' };
  } catch (error) {
    Logger.log('❌ updatePricingFooterNotesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【セクション20】講習管理
// ========================================
// 6種類の固定講習タイプを定義し、年度ごとに日程を自動計算して返す。
// 日程の上書きや学年別設定は CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG にJSON配列で保存。
// IDは {fiscalYear}-{typeId} 形式（例: 2026-spring）。

/** @type {string[]} 6種類の固定講習タイプキー */
var LEC_TYPE_IDS = ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'];

/** @type {Object} タイプキー→表示名マッピング */
var LEC_TYPE_NAMES = {
  'spring': '春期講習',
  'summer': '夏期講習',
  'kiso1': '第1回基礎学力テスト対策講座',
  'kiso2': '第2回基礎学力テスト対策講座',
  'winter': '冬期講習',
  'nyushi': '入試直前講習'
};

/**
 * 講習名からデフォルトの学年別設定を生成する（内部ヘルパー）
 * 春期: 新中1が50分・2回。夏期/冬期: 中3が6回。
 * 基礎学力テスト対策(kiso1/kiso2)・入試直前: 中3のみ有効、他学年は0
 * @param {string} lectureName 講習名
 * @return {Object} gradeSettings {学年コード: {duration, count}}
 */
function getDefaultGradeSettings_(lectureName) {
  var spring     = lectureName.indexOf('春期') !== -1;
  var isKiso     = lectureName.indexOf('基礎学力テスト対策') !== -1;
  var isNyushi   = lectureName.indexOf('入試直前') !== -1;
  var multiCount = lectureName.indexOf('夏期') !== -1
                || lectureName.indexOf('冬期') !== -1;
  // 基礎学力テスト対策・入試直前は中3のみ
  if (isKiso || isNyushi) {
    var z = { duration: 0, count: 0 };
    return {
      '小':  z,
      '中1': z,
      '中2': z,
      '中3': { duration: 8, count: isNyushi ? 6 : 4 },
      '高1': z,
      '高2': z,
      '高3': z
    };
  }
  if (spring) {
    return {
      '小':    { duration: 5,  count: 4 },
      '新中1': { duration: 5,  count: 2 },
      '新中2': { duration: 8,  count: 4 },
      '新中3': { duration: 8,  count: 4 },
      '新高1': { duration: 9,  count: 4 },
      '新高2': { duration: 9,  count: 4 },
      '新高3': { duration: 12, count: 4 }
    };
  }
  return {
    '小':  { duration: 5,  count: 4 },
    '中1': { duration: 8,  count: 4 },
    '中2': { duration: 8,  count: 4 },
    '中3': { duration: 8,  count: multiCount ? 6 : 4 },
    '高1': { duration: 9,  count: 4 },
    '高2': { duration: 9,  count: 4 },
    '高3': { duration: 12, count: 4 }
  };
}

// --- 講習日程計算ヘルパー ---

/**
 * Dateに日数を加算して新しいDateを返す内部ヘルパー
 * @param {Date} date 起点日
 * @param {number} days 加算日数（負で減算）
 * @return {Date}
 */
function addDaysLec_(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * DateをYYYY-MM-DD形式の文字列に変換する内部ヘルパー
 * @param {Date} date 変換対象
 * @return {string} YYYY-MM-DD形式の文字列
 */
function formatDateStrLec_(date) {
  var y = date.getFullYear();
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  var d = ('0' + date.getDate()).slice(-2);
  return y + '-' + m + '-' + d;
}

/**
 * 指定年月のN番目のweekdayを返す内部ヘルパー
 * @param {number} year 西暦年
 * @param {number} month 月（1〜12）
 * @param {number} n 第N番目（1〜）
 * @param {number} dayOfWeek 曜日（0=日〜6=土）
 * @return {Date} 該当日
 */
function getNthWeekdayOfMonth_(year, month, n, dayOfWeek) {
  var date = new Date(year, month - 1, 1);
  var diff = (dayOfWeek - date.getDay() + 7) % 7;
  date.setDate(1 + diff + (n - 1) * 7);
  return date;
}

// 祝日キャッシュの実行内メモリキャッシュ（同一GAS実行内で何度も読み込まないようにする）
var holidayCacheLec_ = null;

/**
 * HOLIDAY_CACHEを使って指定日が祝日かどうかを返す内部ヘルパー
 * プロパティ読み込みは初回のみ行い、以降は実行内キャッシュを使用する
 * @param {string} dateStr YYYY-MM-DD形式
 * @return {boolean} 祝日ならtrue
 */
function isHolidayLec_(dateStr) {
  try {
    if (holidayCacheLec_ === null) {
      var raw = PropertiesService.getScriptProperties().getProperty('HOLIDAY_CACHE');
      holidayCacheLec_ = raw ? JSON.parse(raw) : {};
    }
    return !!(holidayCacheLec_[dateStr]);
  } catch(e) { return false; }
}

/**
 * 指定Dateが土日または祝日かどうかを返す内部ヘルパー
 * @param {Date} date 判定対象
 * @return {boolean} 土日祝ならtrue
 */
function isWeekendOrHolidayLec_(date) {
  var dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  return isHolidayLec_(formatDateStrLec_(date));
}

/**
 * 指定日以降の最初の平日を返す内部ヘルパー（この日を含む）
 * @param {Date} date 起点日
 * @return {Date} 最初の平日
 */
function getNextWeekdayLec_(date) {
  var d = new Date(date.getTime());
  while (isWeekendOrHolidayLec_(d)) { d.setDate(d.getDate() + 1); }
  return d;
}

/**
 * 指定日以降の最初の水曜日を返す内部ヘルパー（この日を含む）
 * @param {Date} date 起点日
 * @return {Date} 最初の水曜日
 */
function getFirstWedOnOrAfterLec_(date) {
  var d = new Date(date.getTime());
  while (d.getDay() !== 3) { d.setDate(d.getDate() + 1); }
  return d;
}

/**
 * 基礎学力テスト日程を計算する内部ヘルパー（BASIC_TEST_DATESオーバーライド対応）
 * @param {number} fiscalYear 学年年度
 * @param {number} testNum テスト番号（1〜3）
 * @return {Date} テスト日
 */
function computeBasicTestDateLec_(fiscalYear, testNum) {
  var key = fiscalYear + '-' + testNum;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('BASIC_TEST_DATES');
    if (raw) {
      var ov = JSON.parse(raw);
      if (ov[key]) {
        var p = ov[key].split('/');
        return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      }
    }
  } catch(e) {}
  if (testNum === 1) {
    return getFirstWedOnOrAfterLec_(new Date(fiscalYear, 8, 30)); // 9月30日以降最初の水曜
  } else if (testNum === 2) {
    return getFirstWedOnOrAfterLec_(new Date(fiscalYear, 10, 11)); // 11月11日以降最初の水曜
  } else {
    var jan8 = new Date(fiscalYear + 1, 0, 8);
    var firstWeekday = getNextWeekdayLec_(new Date(fiscalYear + 1, 0, 9));
    if (isWeekendOrHolidayLec_(jan8)) {
      return getNextWeekdayLec_(addDaysLec_(firstWeekday, 1));
    }
    return firstWeekday;
  }
}

/**
 * 公立高校一般選抜の日程を返す内部ヘルパー（PUBLIC_HIGH_EXAM_DATESオーバーライド対応）
 * 3月の第1火曜日（ただし1日または2日の場合は第2火曜日）
 * @param {number} fiscalYear 学年年度
 * @return {Date} 試験日（fiscalYear+1年の3月）
 */
function getPublicHighSchoolExamDateLec_(fiscalYear) {
  // オーバーライド確認
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('PUBLIC_HIGH_EXAM_DATES');
    if (raw) {
      var ov = JSON.parse(raw);
      var key = String(fiscalYear);
      if (ov[key]) {
        var p = ov[key].split('/');
        return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
      }
    }
  } catch(e) {}
  // 自動計算
  var firstTue = getNthWeekdayOfMonth_(fiscalYear + 1, 3, 1, 2);
  if (firstTue.getDate() <= 2) { firstTue = addDaysLec_(firstTue, 7); }
  return firstTue;
}

/**
 * endDateの前日から遡り、日曜以外の休校日を除いてcount日分数えた日を返す内部ヘルパー
 * 第2回基礎学力テスト対策講座の開始日計算に使用（line.jsのcomputeClosedDaysForMonth_を利用）
 * 日曜日はカウントに含める（日曜以外の休校日のみスキップ）
 * @param {Date} endDate 終了日（この日の前日から遡り始める）
 * @param {number} count 数える日数
 * @return {Date} 開始日
 */
function countBackSchoolDays_(endDate, count) {
  var current = addDaysLec_(endDate, -1);
  var closedDays = computeClosedDaysForMonth_(endDate.getFullYear(), endDate.getMonth() + 1);
  var counted = 0;
  for (var i = 0; i < 365; i++) {
    var mo = current.getMonth() + 1, da = current.getDate();
    var mm = (mo < 10 ? '0' : '') + mo;
    var dd = (da < 10 ? '0' : '') + da;
    var key = current.getFullYear() + '-' + mm + '-' + dd;
    // 日曜以外の休校日のみスキップ（日曜はカウントに含める）
    if (!closedDays[key] || current.getDay() === 0) {
      counted++;
      if (counted >= count) break;
    }
    current = addDaysLec_(current, -1);
  }
  return current;
}

/**
 * 指定タイプ・年度の講習のデフォルト日程を計算する内部ヘルパー
 * @param {string} typeId タイプキー（'spring'等）
 * @param {number} fiscalYear 学年年度（4月始まり）
 * @return {{startDate: string, endDate: string}} YYYY-MM-DD形式の開始日・終了日
 */
function computeDefaultLectureDates_(typeId, fiscalYear) {
  var s, e;
  var fy = fiscalYear;
  if (typeId === 'spring') {
    // 春期講習は「その年度の年（fy年）の3月〜4月」に実施される
    // 例: 2026年度春期 = 2026年3月〜4月（FY2025ではなくFY2026に帰属）
    s = getNthWeekdayOfMonth_(fy, 3, 1, 6); // fy年3月第1土曜
    e = getNthWeekdayOfMonth_(fy, 4, 2, 6); // fy年4月第2土曜
  } else if (typeId === 'summer') {
    s = getNthWeekdayOfMonth_(fy, 7, 3, 6); // 7月第3土曜
    var aug31 = new Date(fy, 7, 31);
    e = (aug31.getDay() === 5) ? new Date(fy, 8, 1) : aug31; // 金曜なら9月1日
  } else if (typeId === 'kiso1') {
    e = addDaysLec_(computeBasicTestDateLec_(fy, 1), -1); // 第1回テスト前日
    s = addDaysLec_(e, -28); // カレンダー28日前
  } else if (typeId === 'kiso2') {
    e = addDaysLec_(computeBasicTestDateLec_(fy, 2), -1); // 第2回テスト前日
    s = countBackSchoolDays_(e, 28); // 日曜・休校日除き28日前
  } else if (typeId === 'winter') {
    s = getNthWeekdayOfMonth_(fy, 12, 1, 6); // 12月第1土曜
    e = addDaysLec_(computeBasicTestDateLec_(fy, 3), -1); // 第3回テスト前日
  } else if (typeId === 'nyushi') {
    var examDay = getPublicHighSchoolExamDateLec_(fy);
    e = addDaysLec_(examDay, -1); // 試験前日
    s = addDaysLec_(e, -41); // 6週間（42日）前
  } else {
    throw new Error('未知の講習タイプ: ' + typeId);
  }
  return { startDate: formatDateStrLec_(s), endDate: formatDateStrLec_(e) };
}

/**
 * 登録済みの講習期間一覧を取得する
 * 現年度と翌年度の6種類固定講習を自動計算し、保存済みエントリをマージして返す
 * @aiCallable
 * @return {Array} 講習期間配列 [{id, name, startDate, endDate, gradeSettings}]
 */
function getLecturePeriods() {
  try {
    var json = getScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG);
    var stored = json ? JSON.parse(json) : [];
    var storedMap = {};
    stored.forEach(function(lp) { storedMap[lp.id] = lp; });

    var now = new Date();
    var nowMonth = now.getMonth() + 1;
    var currentFy = (nowMonth >= 4) ? now.getFullYear() : now.getFullYear() - 1;
    var fys = [currentFy, currentFy + 1];
    var result = [];

    fys.forEach(function(fy) {
      LEC_TYPE_IDS.forEach(function(typeId) {
        var id = fy + '-' + typeId;
        if (storedMap[id]) {
          var entry = storedMap[id];
          entry._isOverridden = true;
          result.push(entry);
        } else {
          try {
            var dates = computeDefaultLectureDates_(typeId, fy);
            result.push({
              id: id, name: LEC_TYPE_NAMES[typeId],
              startDate: dates.startDate, endDate: dates.endDate,
              gradeSettings: getDefaultGradeSettings_(LEC_TYPE_NAMES[typeId]),
              _isOverridden: false
            });
          } catch(e) {
            Logger.log('⚠ computeDefaultLectureDates_ エラー: ' + typeId + '/' + fy + ': ' + e);
          }
        }
      });
    });

    // 旧フォーマットID（lp_xxx形式）のエントリを後方互換として含める
    // ただし標準講習名（春期講習など）と同名は新フォーマットで既に生成済みのためスキップ
    var standardNames = {};
    LEC_TYPE_IDS.forEach(function(t) { standardNames[LEC_TYPE_NAMES[t]] = true; });
    stored.forEach(function(lp) {
      var isNew = LEC_TYPE_IDS.some(function(t) {
        return /^\d{4}-/.test(lp.id) && lp.id.endsWith('-' + t);
      });
      if (!isNew && !standardNames[lp.name]) result.push(lp);
    });

    result.sort(function(a, b) { return (a.startDate || '').localeCompare(b.startDate || ''); });
    return result;
  } catch (error) {
    Logger.log('❌ getLecturePeriodsエラー: ' + error);
    return [];
  }
}

/**
 * 指定年度・種別の講習日程を保存する（Admin のみ）
 * @param {number} fiscalYear 学年年度
 * @param {string} typeId タイプキー（'spring'等）
 * @param {string} startDate YYYY-MM-DD形式の開始日
 * @param {string} endDate YYYY-MM-DD形式の終了日
 * @return {Object} { success, message }
 */
function saveLectureDates(fiscalYear, typeId, startDate, endDate) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    if (!LEC_TYPE_NAMES[typeId]) return { success: false, error: '無効な講習種別です' };
    var id = fiscalYear + '-' + typeId;
    var json = getScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG);
    var data = json ? JSON.parse(json) : [];
    var found = false;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === id) { data[i].startDate = startDate; data[i].endDate = endDate; found = true; break; }
    }
    if (!found) {
      data.push({ id: id, name: LEC_TYPE_NAMES[typeId], startDate: startDate, endDate: endDate,
                  gradeSettings: getDefaultGradeSettings_(LEC_TYPE_NAMES[typeId]) });
    }
    setScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG, JSON.stringify(data));
    return { success: true, message: '日程を保存しました' };
  } catch (error) {
    Logger.log('❌ saveLectureDatesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定年度・種別の講習日程をリセットして自動計算に戻す（Admin のみ）
 * gradeSettingsが保存済みの場合はエントリを残し日程のみ自動計算値で上書き
 * @param {number} fiscalYear 学年年度
 * @param {string} typeId タイプキー（'spring'等）
 * @return {Object} { success, message }
 */
function resetLectureDates(fiscalYear, typeId) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var id = fiscalYear + '-' + typeId;
    var json = getScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG);
    var data = json ? JSON.parse(json) : [];
    var idx = -1;
    for (var i = 0; i < data.length; i++) { if (data[i].id === id) { idx = i; break; } }
    if (idx === -1) return { success: true, message: 'すでにデフォルト設定です' };
    var gs = data[idx].gradeSettings;
    var hasCustomGrades = gs && Object.keys(gs).length > 0;
    if (hasCustomGrades) {
      var dates = computeDefaultLectureDates_(typeId, parseInt(fiscalYear));
      data[idx].startDate = dates.startDate;
      data[idx].endDate = dates.endDate;
    } else {
      data.splice(idx, 1);
    }
    setScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG, JSON.stringify(data));
    return { success: true, message: 'デフォルト日程に戻しました' };
  } catch (error) {
    Logger.log('❌ resetLectureDatesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習期間を保存する（後方互換のため維持。新UIでは saveLectureDates を使用）
 * @param {Object} lectureData 講習期間データ {id?, name, startDate, endDate}
 * @return {Object} { success, message, id }
 */
function saveLecturePeriod(lectureData) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    if (!lectureData.name || !lectureData.startDate || !lectureData.endDate) {
      return { success: false, error: '講習名・開始日・終了日は必須です' };
    }
    var json = getScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG);
    var data = json ? JSON.parse(json) : [];
    var id = lectureData.id;
    var lecName = lectureData.name;
    if (id) {
      var found = false;
      for (var i = 0; i < data.length; i++) {
        if (data[i].id === id) {
          data[i] = { id: id, name: lecName, startDate: lectureData.startDate, endDate: lectureData.endDate,
                      gradeSettings: data[i].gradeSettings || getDefaultGradeSettings_(lecName) };
          found = true; break;
        }
      }
      if (!found) {
        data.push({ id: id, name: lecName, startDate: lectureData.startDate, endDate: lectureData.endDate,
                    gradeSettings: getDefaultGradeSettings_(lecName) });
      }
    } else {
      id = 'lp_' + new Date().getTime() + '_' + Math.floor(Math.random() * 1000);
      data.push({ id: id, name: lecName, startDate: lectureData.startDate, endDate: lectureData.endDate,
                  gradeSettings: getDefaultGradeSettings_(lecName) });
    }
    setScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG, JSON.stringify(data));
    return { success: true, message: '講習期間を保存しました', id: id };
  } catch (error) {
    Logger.log('❌ saveLecturePeriodエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習期間を削除する（後方互換のため維持）
 * @param {string} lectureId 削除する講習期間のID
 * @return {Object} { success, message }
 */
function deleteLecturePeriod(lectureId) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG);
    if (!json) return { success: false, error: 'データがありません' };
    var data = JSON.parse(json);
    var before = data.length;
    data = data.filter(function(d) { return d.id !== lectureId; });
    if (data.length === before) return { success: false, error: '指定IDが見つかりません' };
    setScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG, JSON.stringify(data));
    return { success: true, message: '講習期間を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteLecturePeriodエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定講習の学年別設定（コマ時間・回数）を上書き保存する（Admin のみ）
 * 新フォーマットID（{year}-{type}）のエントリが存在しない場合は自動計算日程で新規作成する
 * @param {string} lectureId 対象の講習期間ID
 * @param {string} gradeSettingsJson JSON文字列 { 学年コード: { duration, count } }
 * @return {Object} { success, message }
 */
function saveLectureGradeSettings(lectureId, gradeSettingsJson) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var json = getScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG);
    var data = json ? JSON.parse(json) : [];
    var newSettings = JSON.parse(gradeSettingsJson);
    var found = false;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id === lectureId) { data[i].gradeSettings = newSettings; found = true; break; }
    }
    if (!found) {
      // 新フォーマットIDの場合は自動計算日程で新規作成
      var match = lectureId.match(/^(\d{4})-(.+)$/);
      if (match && LEC_TYPE_NAMES[match[2]]) {
        var fy = parseInt(match[1]), typeId = match[2];
        var dates = computeDefaultLectureDates_(typeId, fy);
        data.push({ id: lectureId, name: LEC_TYPE_NAMES[typeId],
                    startDate: dates.startDate, endDate: dates.endDate, gradeSettings: newSettings });
        found = true;
      }
      if (!found) return { success: false, error: '対象の講習が見つかりません' };
    }
    setScriptProperty(CONFIG_PROP_KEYS.LECTURE_PERIODS_CONFIG, JSON.stringify(data));
    return { success: true, message: '学年別設定を保存しました' };
  } catch (error) {
    Logger.log('❌ saveLectureGradeSettingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習スケジュールデータ用スプレッドシートを取得または作成する
 * @return {Spreadsheet|null} スプレッドシート
 */
function getLectureScheduleSpreadsheet_() {
  var rootId = getProperty(PROP_KEYS.APP_FOLDER_ID);
  if (!rootId) return null;
  var rootFolder = DriveApp.getFolderById(rootId);
  var lecFolderIter = rootFolder.getFoldersByName('講習管理');
  var lecFolder = lecFolderIter.hasNext() ? lecFolderIter.next() : rootFolder.createFolder('講習管理');
  var ssIter = lecFolder.getFilesByName('スケジュールデータ');
  if (ssIter.hasNext()) {
    return SpreadsheetApp.openById(ssIter.next().getId());
  }
  var ss = SpreadsheetApp.create('スケジュールデータ');
  DriveApp.getFileById(ss.getId()).moveTo(lecFolder);
  var sheet = ss.getActiveSheet();
  sheet.setName('スケジュール一覧');
  // 日付列（D=4）と時刻列（E=5）をテキスト形式に設定（Sheetsによる自動変換防止）
  sheet.getRange('D:D').setNumberFormat('@');
  sheet.getRange('E:E').setNumberFormat('@');
  sheet.appendRow(['entryId','lectureId','campusCode','date','startTime','durationSlots','subject','grade','teacherName','teacherEmail','classLabel','teacherId']);
  return ss;
}

/**
 * GAS が Sheets から読んだ日付値を YYYY-MM-DD 文字列に正規化する内部ヘルパー
 * Sheets は "11:20" などの時刻文字列を自動的に時刻値（Dateオブジェクト）に変換するため
 * String() するだけでは "Tue Mar 03 2026..." のような形式になってしまう
 * @param {*} val getValues() で得た日付セルの値
 * @return {string} YYYY-MM-DD 形式の文字列
 */
function normalizeLecDate_(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var s = String(val);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return s;
}

/**
 * GAS が Sheets から読んだ時刻値を HH:MM 文字列に正規化する内部ヘルパー
 * Sheets は "11:20" を時刻値として保存し、getValues() で読むと 1899-12-30 基準の Date オブジェクトになる
 * @param {*} val getValues() で得た時刻セルの値
 * @return {string} HH:MM 形式の文字列
 */
function normalizeLecTime_(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'HH:mm');
  }
  var s = String(val);
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', 'HH:mm');
  }
  return s;
}

/**
 * 指定の講習・校舎のスケジュールエントリを取得する
 * Firestore の lectureEntries コレクションから読み込む
 * @aiCallable
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @return {Array} エントリ配列 [{id,lectureId,campusCode,date,startTime,durationSlots,subject,grade,teacherName,teacherEmail,classLabel,teacherId}]
 */
function getLectureScheduleEntries(lectureId, campusCode) {
  try {
    var normalizedCampus = String(campusCode || '').padStart(2, '0');
    var docId = String(lectureId) + '_' + normalizedCampus;
    var doc = firestoreGet_('lectureEntries', docId);
    if (!doc) return [];
    return (doc.entries || []).map(function(e) {
      return {
        id:            e.entryId        || '',
        lectureId:     String(lectureId),
        campusCode:    normalizedCampus,
        date:          e.date          || '',
        startTime:     e.startTime     || '',
        durationSlots: Number(e.durationSlots) || 9,
        subject:       e.subject       || '',
        grade:         e.grade         || '',
        teacherName:   e.teacherName   || '',
        teacherEmail:  e.teacherEmail  || '',
        classLabel:    e.classLabel    || null,
        teacherId:     e.teacherId     || ''
      };
    });
  } catch (error) {
    Logger.log('❌ getLectureScheduleEntriesエラー: ' + error);
    return [];
  }
}

/**
 * 指定の講習・校舎のスケジュールエントリを一括保存する（全置換・LockService使用）
 * Firestore の lectureEntries コレクションに書き込む
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {string} entriesJson エントリ配列のJSON文字列
 * @return {Object} {success, message, entries}
 */
function saveLectureScheduleEntries(lectureId, campusCode, entriesJson) {
  try {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var entries = safeJsonParse_(entriesJson, []);
      var normalizedCampus = String(campusCode || '').padStart(2, '0');
      var docId = String(lectureId) + '_' + normalizedCampus;

      // 既存ドキュメントを取得（権限チェックに使用）
      var existingDoc = firestoreGet_('lectureEntries', docId);
      var existingEntries = existingDoc ? (existingDoc.entries || []) : [];

      // 権限チェック: Admin以外は他人のエントリを改ざんできない（講師IDのみで判定）
      if (!isAdmin()) {
        var myTid = getOrCreateTeacherId();
        var existingOtherEntries = {};
        existingEntries.forEach(function(e) {
          var tid = e.teacherId || '';
          if (tid && tid !== myTid) {
            existingOtherEntries[e.entryId || ''] = {
              date: String(e.date || ''), startTime: String(e.startTime || ''),
              durationSlots: String(Number(e.durationSlots) || 9),
              subject: String(e.subject || ''), grade: String(e.grade || ''), teacherId: tid
            };
          }
        });
        var incomingOtherIds = {};
        entries.forEach(function(e) {
          var eTid = e.teacherId || '';
          if (eTid && eTid !== myTid) {
            incomingOtherIds[e.id] = {
              date: String(e.date || ''), startTime: String(e.startTime || ''),
              durationSlots: String(Number(e.durationSlots) || 9),
              subject: String(e.subject || ''), grade: String(e.grade || ''), teacherId: eTid
            };
          }
        });
        var otherKeys = Object.keys(existingOtherEntries);
        for (var m = 0; m < otherKeys.length; m++) {
          var eid = otherKeys[m];
          if (!incomingOtherIds[eid]) return { success: false, error: '他のユーザーのエントリは削除できません' };
          var orig = existingOtherEntries[eid];
          var inc  = incomingOtherIds[eid];
          if (orig.date !== inc.date || orig.startTime !== inc.startTime ||
              orig.durationSlots !== inc.durationSlots || orig.subject !== inc.subject ||
              orig.grade !== inc.grade) {
            return { success: false, error: '他のユーザーのエントリは変更できません' };
          }
        }
      }

      // エントリIDを確定して保存データを構築
      var savedEntries = [];
      var newEntries = entries.map(function(e) {
        var entryId = e.id || ('ent_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000));
        var eData = {
          entryId:       entryId,
          date:          String(e.date      || ''),
          startTime:     String(e.startTime || ''),
          durationSlots: Number(e.durationSlots) || 9,
          subject:       String(e.subject   || ''),
          grade:         String(e.grade     || ''),
          teacherName:   String(e.teacherName  || ''),
          teacherEmail:  String(e.teacherEmail || ''),
          classLabel:    e.classLabel || null,
          teacherId:     String(e.teacherId || '')
        };
        savedEntries.push({
          id: entryId, lectureId: String(lectureId), campusCode: normalizedCampus,
          date: eData.date, startTime: eData.startTime, durationSlots: eData.durationSlots,
          subject: eData.subject, grade: eData.grade, teacherName: eData.teacherName,
          teacherEmail: eData.teacherEmail, classLabel: eData.classLabel, teacherId: eData.teacherId
        });
        return eData;
      });

      // 1ドキュメントに entries 配列として保存
      firestoreSet_('lectureEntries', docId, {
        lectureId:  String(lectureId),
        campusCode: normalizedCampus,
        entries:    newEntries,
        updatedAt:  new Date().toISOString()
      });

      Logger.log('✓ saveLectureScheduleEntries: ' + entries.length + '件保存 (' + lectureId + '/' + normalizedCampus + ')');
      return { success: true, message: entries.length + '件を保存しました', entries: savedEntries };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    Logger.log('❌ saveLectureScheduleEntriesエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// AIアシスタント — 講習エントリ個別CRUD（セクション9 続き）
// ----------------------------------------

/**
 * AIアシスタントから講習エントリを1件追加する
 * 既存エントリを読み込み → 新エントリを追加 → 全置換保存
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {string} date 日付（YYYY-MM-DD）
 * @param {string} startTime 開始時刻（HH:MM）
 * @param {number} durationSlots コマ数（10分単位、デフォルト9=90分）
 * @param {string} subject 教科名
 * @param {string} grade 学年コード（07-18）
 * @param {string} classLabel クラスラベル（A/B/C、省略可）
 * @return {Object} { success, message, error }
 */
function createLectureEntryAI_(lectureId, campusCode, date, startTime, durationSlots, subject, grade, classLabel) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalizedCampus = String(campusCode || '').padStart(2, '0');
    var existing = getLectureScheduleEntries(lectureId, normalizedCampus);

    var teacherId = getOrCreateTeacherId();
    var profile = getUserProfile();
    var teacherName = (profile && profile.displayName) || '';
    var teacherEmail = '';
    try { teacherEmail = getFirebaseEmailContext_() || ''; } catch (e) {}

    var entryId = 'ent_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
    var newEntry = {
      id: entryId,
      lectureId: String(lectureId),
      campusCode: normalizedCampus,
      date: String(date || ''),
      startTime: String(startTime || ''),
      durationSlots: Number(durationSlots) || 9,
      subject: String(subject || ''),
      grade: String(grade || ''),
      teacherName: teacherName,
      teacherEmail: teacherEmail,
      classLabel: classLabel || null,
      teacherId: teacherId
    };

    existing.push(newEntry);
    var result = saveLectureScheduleEntries(lectureId, normalizedCampus, JSON.stringify(existing));
    if (result && result.success) {
      return { success: true, message: date + ' ' + startTime + '〜 ' + subject + ' の授業を追加しました' };
    }
    return { success: false, error: (result && result.error) || '保存に失敗しました' };
  } catch (error) {
    Logger.log('❌ createLectureEntryAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * AIアシスタントから講習エントリを毎週一括作成する
 * 指定日の曜日で、学年別設定の回数分、休校日を除いて繰り返し作成
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {string} date 開始日（YYYY-MM-DD）
 * @param {string} startTime 開始時刻（HH:MM）
 * @param {number} durationSlots コマ数
 * @param {string} subject 教科名
 * @param {string} grade 学年コード（07-18）
 * @param {string} classLabel クラスラベル
 * @return {Object} { success, message, error }
 */
function createWeeklyLectureEntriesAI_(lectureId, campusCode, date, startTime, durationSlots, subject, grade, classLabel) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalizedCampus = String(campusCode || '').padStart(2, '0');
    var existing = getLectureScheduleEntries(lectureId, normalizedCampus);

    var teacherId = getOrCreateTeacherId();
    var profile = getUserProfile();
    var teacherName = (profile && profile.displayName) || '';
    var teacherEmail = '';
    try { teacherEmail = getFirebaseEmailContext_() || ''; } catch (e) {}

    // 講習期間から学年別設定の回数を取得
    var lecPeriods = getLecturePeriods() || [];
    var lp = null;
    for (var i = 0; i < lecPeriods.length; i++) {
      if (lecPeriods[i].id === lectureId) { lp = lecPeriods[i]; break; }
    }

    // gradeCode → gradeSettings キー変換
    var gradeToSettingsKey = {
      '07': '小', '08': '小', '09': '小', '10': '小', '11': '小', '12': '小',
      '13': '中1', '14': '中2', '15': '中3',
      '16': '高1', '17': '高2', '18': '高3'
    };
    // 春期講習は「新○○」キーを使う
    var settingsKey = gradeToSettingsKey[grade] || '中1';
    if (lp && lp.name && lp.name.indexOf('春期') !== -1) {
      if (settingsKey !== '小') settingsKey = '新' + settingsKey;
    }

    var count = 4; // デフォルト
    if (lp && lp.gradeSettings && lp.gradeSettings[settingsKey]) {
      count = lp.gradeSettings[settingsKey].count || 4;
      if (!durationSlots || durationSlots === 9) {
        durationSlots = lp.gradeSettings[settingsKey].duration || 9;
      }
    }

    // 休校日を計算（開始日の年月から）
    var startDate = new Date(date + 'T00:00:00');
    var fiscalYear = (startDate.getMonth() >= 3) ? startDate.getFullYear() : startDate.getFullYear() - 1;
    // computeClosedDaysForMonth_ は月単位だが、複数月にまたがる可能性があるので全月分取得
    var closedDays = {};
    for (var m = 1; m <= 12; m++) {
      var monthClosed = computeClosedDaysForMonth_(fiscalYear + (m >= 4 ? 0 : 1), m);
      Object.keys(monthClosed).forEach(function(k) { closedDays[k] = true; });
    }

    // 毎週同じ曜日で count 回作成（休校日スキップ）
    var cur = new Date(startDate.getTime());
    var created = 0;
    while (created < count) {
      var yy = cur.getFullYear();
      var mm = (cur.getMonth() + 1 < 10 ? '0' : '') + (cur.getMonth() + 1);
      var dd = (cur.getDate() < 10 ? '0' : '') + cur.getDate();
      var dateKey = yy + '-' + mm + '-' + dd;

      if (!closedDays[dateKey] && cur.getDay() !== 0) {
        var entryId = 'ent_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000) + '_' + created;
        existing.push({
          id: entryId,
          lectureId: String(lectureId),
          campusCode: normalizedCampus,
          date: dateKey,
          startTime: String(startTime || ''),
          durationSlots: Number(durationSlots) || 9,
          subject: String(subject || ''),
          grade: String(grade || ''),
          teacherName: teacherName,
          teacherEmail: teacherEmail,
          classLabel: classLabel || null,
          teacherId: teacherId
        });
        created++;
      }
      cur.setDate(cur.getDate() + 7);
      if (cur.getFullYear() > fiscalYear + 2) break; // 安全ガード
    }

    var result = saveLectureScheduleEntries(lectureId, normalizedCampus, JSON.stringify(existing));
    if (result && result.success) {
      return { success: true, message: created + '件の授業コマを作成しました（毎週・休校日除く）' };
    }
    return { success: false, error: (result && result.error) || '保存に失敗しました' };
  } catch (error) {
    Logger.log('❌ createWeeklyLectureEntriesAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * AIアシスタントから講習エントリを1件編集する
 * 既存エントリを読み込み → 対象エントリを更新 → 全置換保存
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {string} entryId 編集対象のエントリID
 * @param {Object} changes 変更内容（date, startTime, durationSlots, subject, grade, classLabel のうち変更するもの）
 * @return {Object} { success, message, error }
 */
function editLectureEntryAI_(lectureId, campusCode, entryId, changes) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalizedCampus = String(campusCode || '').padStart(2, '0');
    var existing = getLectureScheduleEntries(lectureId, normalizedCampus);

    var targetIdx = -1;
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].id === entryId) { targetIdx = i; break; }
    }
    if (targetIdx === -1) {
      return { success: false, error: '指定されたエントリが見つかりません（ID: ' + entryId + '）' };
    }

    // 権限チェック: 自分のエントリかAdminか
    var myTid = getOrCreateTeacherId();
    if (!isAdmin() && existing[targetIdx].teacherId && existing[targetIdx].teacherId !== myTid) {
      return { success: false, error: '他の講師のエントリは編集できません' };
    }

    // 変更を適用
    if (changes.date !== undefined) existing[targetIdx].date = String(changes.date);
    if (changes.startTime !== undefined) existing[targetIdx].startTime = String(changes.startTime);
    if (changes.durationSlots !== undefined) existing[targetIdx].durationSlots = Number(changes.durationSlots) || 9;
    if (changes.subject !== undefined) existing[targetIdx].subject = String(changes.subject);
    if (changes.grade !== undefined) existing[targetIdx].grade = String(changes.grade);
    if (changes.classLabel !== undefined) existing[targetIdx].classLabel = changes.classLabel || null;

    var result = saveLectureScheduleEntries(lectureId, normalizedCampus, JSON.stringify(existing));
    if (result && result.success) {
      return { success: true, message: 'エントリを更新しました' };
    }
    return { success: false, error: (result && result.error) || '保存に失敗しました' };
  } catch (error) {
    Logger.log('❌ editLectureEntryAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * AIアシスタントから講習エントリを1件削除する
 * 既存エントリを読み込み → 対象エントリを除去 → 全置換保存
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {string} entryId 削除対象のエントリID
 * @return {Object} { success, message, error }
 */
function deleteLectureEntryAI_(lectureId, campusCode, entryId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalizedCampus = String(campusCode || '').padStart(2, '0');
    var existing = getLectureScheduleEntries(lectureId, normalizedCampus);

    var targetIdx = -1;
    for (var i = 0; i < existing.length; i++) {
      if (existing[i].id === entryId) { targetIdx = i; break; }
    }
    if (targetIdx === -1) {
      return { success: false, error: '指定されたエントリが見つかりません（ID: ' + entryId + '）' };
    }

    // 権限チェック
    var myTid = getOrCreateTeacherId();
    if (!isAdmin() && existing[targetIdx].teacherId && existing[targetIdx].teacherId !== myTid) {
      return { success: false, error: '他の講師のエントリは削除できません' };
    }

    var deleted = existing.splice(targetIdx, 1)[0];
    var result = saveLectureScheduleEntries(lectureId, normalizedCampus, JSON.stringify(existing));
    if (result && result.success) {
      return { success: true, message: deleted.date + ' ' + deleted.startTime + '〜 ' + deleted.subject + ' を削除しました' };
    }
    return { success: false, error: (result && result.error) || '保存に失敗しました' };
  } catch (error) {
    Logger.log('❌ deleteLectureEntryAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * AIアシスタントから講習エントリを一括操作する（作成・編集・削除の混合対応）
 * 1回のロック・1回のFirestore書き込みで複数操作を実行
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {Array} operations 操作配列 [{op:"create"|"edit"|"delete", ...params}, ...]
 * @return {Object} { success, message, error }
 */
function bulkLectureOperationsAI_(lectureId, campusCode, operations) {
  if (!operations || operations.length === 0) {
    return { success: false, error: '操作がありません' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var normalizedCampus = String(campusCode || '').padStart(2, '0');
    var existing = getLectureScheduleEntries(lectureId, normalizedCampus);

    var teacherId = getOrCreateTeacherId();
    var profile = getUserProfile();
    var teacherName = (profile && profile.displayName) || '';
    var teacherEmail = '';
    try { teacherEmail = getFirebaseEmailContext_() || ''; } catch (e) {}
    var admin = isAdmin();

    var createdCount = 0;
    var editedCount = 0;
    var deletedCount = 0;
    var errors = [];

    for (var i = 0; i < operations.length; i++) {
      var op = operations[i];

      if (op.op === 'create') {
        var entryId = 'ent_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000) + '_' + i;
        existing.push({
          id: entryId,
          lectureId: String(lectureId),
          campusCode: normalizedCampus,
          date: String(op.date || ''),
          startTime: String(op.startTime || ''),
          durationSlots: Number(op.durationSlots) || 9,
          subject: String(op.subject || ''),
          grade: String(op.grade || ''),
          teacherName: teacherName,
          teacherEmail: teacherEmail,
          classLabel: op.classLabel || null,
          teacherId: teacherId
        });
        createdCount++;

      } else if (op.op === 'edit') {
        var editIdx = -1;
        for (var ei = 0; ei < existing.length; ei++) {
          if (existing[ei].id === op.entryId) { editIdx = ei; break; }
        }
        if (editIdx === -1) {
          errors.push('編集: エントリが見つかりません');
          continue;
        }
        if (!admin && existing[editIdx].teacherId && existing[editIdx].teacherId !== teacherId) {
          errors.push('編集: 他の講師のエントリ');
          continue;
        }
        var changes = op.changes || {};
        if (changes.date !== undefined) existing[editIdx].date = String(changes.date);
        if (changes.startTime !== undefined) existing[editIdx].startTime = String(changes.startTime);
        if (changes.durationSlots !== undefined) existing[editIdx].durationSlots = Number(changes.durationSlots) || 9;
        if (changes.subject !== undefined) existing[editIdx].subject = String(changes.subject);
        if (changes.grade !== undefined) existing[editIdx].grade = String(changes.grade);
        if (changes.classLabel !== undefined) existing[editIdx].classLabel = changes.classLabel || null;
        editedCount++;

      } else if (op.op === 'delete') {
        var delIdx = -1;
        for (var di = 0; di < existing.length; di++) {
          if (existing[di].id === op.entryId) { delIdx = di; break; }
        }
        if (delIdx === -1) {
          errors.push('削除: エントリが見つかりません');
          continue;
        }
        if (!admin && existing[delIdx].teacherId && existing[delIdx].teacherId !== teacherId) {
          errors.push('削除: 他の講師のエントリ');
          continue;
        }
        existing.splice(delIdx, 1);
        deletedCount++;
      }
    }

    var totalSuccess = createdCount + editedCount + deletedCount;
    if (totalSuccess === 0) {
      return { success: false, error: '処理できる操作がありませんでした' + (errors.length > 0 ? '（' + errors.join('、') + '）' : '') };
    }

    var result = saveLectureScheduleEntries(lectureId, normalizedCampus, JSON.stringify(existing));
    if (result && result.success) {
      var parts = [];
      if (createdCount > 0) parts.push('追加' + createdCount + '件');
      if (editedCount > 0) parts.push('変更' + editedCount + '件');
      if (deletedCount > 0) parts.push('削除' + deletedCount + '件');
      var msg = parts.join('、') + 'を処理しました';
      if (errors.length > 0) msg += '（' + errors.length + '件スキップ）';
      return { success: true, message: msg };
    }
    return { success: false, error: (result && result.error) || '保存に失敗しました' };
  } catch (error) {
    Logger.log('❌ bulkLectureOperationsAI_エラー: ' + error);
    return { success: false, error: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * teacherId → { email, name } のマッピングを全ユーザーに返す（エントリ表示名の解決用）
 * アプリ起動時にフロントエンドが呼び出し、グリッド上の講師名を常に最新で表示する。
 * @aiCallable
 * @return {Object} { success, map: { teacherId: { email, name } } }
 */
function getTeacherNamesMap() {
  try {
    var allRows = supabaseSelect_('staffs', null, { select: 'id,email,display_name,name' });
    var map = {};
    (allRows || []).forEach(function(row) {
      map[row.id] = { email: row.email || '', name: row.display_name || row.name || '' };
    });
    return { success: true, map: map };
  } catch (error) {
    Logger.log('❌ getTeacherNamesMapエラー: ' + error);
    return { success: false, map: {} };
  }
}

/**
 * 講師一覧を取得する（Admin のみ）
 * getAllowedUsers() をベースにし、staffs から teacherId を付加して返す。
 * アクセス許可ユーザー全員が対象（スプレッドシートに入力実績のないユーザーも含む）。
 * @return {Object} { success, teachers: [{email, name, teacherId}] }
 */
function getLectureTeachers() {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var result = getAllowedUsers();
    if (!result.success) return result;
    var teachers = result.users.map(function(u) {
      return { email: u.email, name: u.name || u.email, teacherId: u.teacherId || '' };
    });
    teachers.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });
    return { success: true, teachers: teachers };
  } catch (error) {
    Logger.log('❌ getLectureTeachersエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ========================================
// 【チラシ機能】外部チラシ用 Drive 画像管理
// ========================================

/**
 * チラシ用画像一覧を Drive の assets/flyer/ フォルダから取得する
 * @aiCallable
 * @return {Object} { success, images: [{id, name, mimeType}] }
 */
function getFlyerImages() {
  try {
    var folderId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) return { success: true, images: [] };

    var rootFolder = DriveApp.getFolderById(folderId);
    var assetsIter = rootFolder.getFoldersByName('assets');
    if (!assetsIter.hasNext()) return { success: true, images: [] };
    var assetsFolder = assetsIter.next();

    var flyerIter = assetsFolder.getFoldersByName('flyer');
    if (!flyerIter.hasNext()) return { success: true, images: [] };
    var flyerFolder = flyerIter.next();

    var images = [];
    var MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    var files = flyerFolder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (MIME_TYPES.indexOf(f.getMimeType()) !== -1) {
        images.push({ id: f.getId(), name: f.getName(), mimeType: f.getMimeType() });
      }
    }
    images.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });
    // タグ情報をマージ
    var tagMap = getAllFlyerImageTags_();
    images.forEach(function(img) { img.tags = tagMap[img.id] || ''; });
    return { success: true, images: images };
  } catch (error) {
    Logger.log('❌ getFlyerImagesエラー: ' + error);
    return { success: false, images: [], error: error.toString() };
  }
}

/**
 * Drive ファイルIDから画像を base64 エンコードして返す
 * @aiCallable
 * @param {string} fileId DriveファイルID
 * @return {Object} { success, base64, mimeType } または { success: false, error }
 */
function getFlyerImageBase64(fileId) {
  try {
    if (!fileId) return { success: false, error: 'fileId が空です' };
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return { success: true, base64: base64, mimeType: blob.getContentType() };
  } catch (error) {
    Logger.log('❌ getFlyerImageBase64エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * アップロードされた画像をGemini Visionで分析し、ファイル名とタグを自動生成する内部ヘルパー
 * @param {string} base64 base64エンコードされた画像データ
 * @param {string} mimeType 画像のMIMEタイプ
 * @param {string} originalFileName 元のファイル名（フォールバック用）
 * @return {Object} { fileName: '説明的なファイル名（拡張子なし）', tags: 'タグ1、タグ2、...' }
 */
function analyzeUploadedImageMetadata_(base64, mimeType, originalFileName) {
  var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

  var prompt = 'この画像を分析して、保存用のファイル名とタグキーワードを日本語で生成してください。\n\n' +
    '要件:\n' +
    '- fileName: 画像の内容を端的に表す日本語のファイル名（拡張子なし、スペースなし、アンダースコア区切り、20文字以内）\n' +
    '  例: イラスト_走る男子学生、写真_桜と校舎、水彩_勉強する生徒たち\n' +
    '- tags: 画像を検索するのに役立つキーワードを読点（、）区切りで8〜12個\n' +
    '  例: イラスト、男子学生、走る、勢い、躍動感、水彩風、元気、疾走\n\n' +
    'JSON形式のみで返してください（説明文・マークダウン不要）:\n' +
    '{"fileName":"...","tags":"..."}';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
  var payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType, data: base64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 200,
      thinkingConfig: { thinkingBudget: 0 }
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
    throw new Error(parseGeminiErrorMessage_(response));
  }

  var result = JSON.parse(response.getContentText());

  var parts = (result.candidates[0].content.parts || []);
  var textPart = parts.filter(function(p) { return !p.thought; }).pop();
  var rawText = textPart ? (textPart.text || '').trim() : '';
  var metadata = safeJsonParse_(rawText, {});

  // ファイル名の安全化（Drive で使えない文字を除去）
  var safeName = (metadata.fileName || '').replace(/[\/\\:*?"<>|]/g, '').trim();
  return {
    fileName: safeName || '',
    tags: (metadata.tags || '').trim()
  };
}

/**
 * チラシ用画像を Drive の assets/flyer/ フォルダにアップロードする
 * Gemini Vision で画像を解析してファイル名とタグを自動生成する
 * フォルダが存在しない場合は自動的に作成する
 * @aiCallable
 * @param {string} base64 base64エンコードされた画像データ
 * @param {string} fileName ファイル名（拡張子込み）
 * @param {string} mimeType MIMEタイプ（例: image/jpeg）
 * @return {Object} { success, fileId, fileName } または { success: false, error }
 */
function uploadFlyerImage(base64, fileName, mimeType) {
  try {
    var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (ALLOWED_TYPES.indexOf(mimeType) === -1) {
      return { success: false, error: '画像ファイル（JPEG/PNG/GIF/WebP）のみアップロードできます' };
    }
    var MAX_SIZE = 2 * 1024 * 1024; // 2MB
    var estimatedSize = Math.floor(base64.length * 3 / 4);
    if (estimatedSize > MAX_SIZE) {
      return { success: false, error: '画像のサイズが大きすぎます（上限: 2MB）。画像を圧縮してから再度お試しください。' };
    }

    var folderId = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) return { success: false, error: 'APP_FOLDER_ID が設定されていません' };

    var rootFolder = DriveApp.getFolderById(folderId);

    // assets フォルダを取得または作成
    var assetsIter = rootFolder.getFoldersByName('assets');
    var assetsFolder = assetsIter.hasNext() ? assetsIter.next() : rootFolder.createFolder('assets');

    // flyer フォルダを取得または作成
    var flyerIter = assetsFolder.getFoldersByName('flyer');
    var flyerFolder = flyerIter.hasNext() ? flyerIter.next() : assetsFolder.createFolder('flyer');

    // 拡張子を取得
    var ext = '';
    var dotIdx = fileName.lastIndexOf('.');
    if (dotIdx !== -1) ext = fileName.substring(dotIdx);

    // AIで画像を解析してファイル名・タグを自動生成（失敗しても元ファイル名で継続）
    var aiFileName = '';
    var aiTags = '';
    try {
      var metadata = analyzeUploadedImageMetadata_(base64, mimeType, fileName);
      aiFileName = metadata.fileName || '';
      aiTags = metadata.tags || '';
    } catch (metaErr) {
      Logger.log('⚠ uploadFlyerImage: 画像解析スキップ: ' + metaErr);
    }

    // ファイル名を決定（AI生成 > 元ファイル名）
    var saveFileName = (aiFileName ? aiFileName + ext : fileName);

    // 画像を保存
    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mimeType, saveFileName);
    var file = flyerFolder.createFile(blob);

    // タグを保存（AI生成タグ > 空）
    try {
      saveFlyerImageTags(file.getId(), aiTags);
    } catch (tagErr) {
      Logger.log('⚠ uploadFlyerImage: タグ保存スキップ: ' + tagErr);
    }

    return { success: true, fileId: file.getId(), fileName: file.getName() };
  } catch (error) {
    Logger.log('❌ uploadFlyerImageエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Drive からチラシ用画像を削除する（ゴミ箱に移動）
 * @aiCallable
 * @param {string} fileId 削除するファイルのDriveID
 * @return {Object} { success, message } または { success: false, error }
 */
function deleteFlyerImage(fileId) {
  try {
    if (!fileId) return { success: false, error: 'fileId が空です' };
    var file = DriveApp.getFileById(fileId);
    var fileName = file.getName();
    file.setTrashed(true);
    deleteFlyerImageTags_(fileId);
    return { success: true, message: '「' + fileName + '」を削除しました' };
  } catch (error) {
    Logger.log('❌ deleteFlyerImageエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 画像タグデータ保存用シート「画像タグ」を取得/作成する内部ヘルパー
 * @return {Sheet|null} シートオブジェクト
 */
function getFlyerImageTagSheet_() {
  // Firestore移行済み。このヘルパーはマイグレーション用に残す（通常処理では使用しない）
  var settingsFolder = getSettingsFolder();
  if (!settingsFolder) return null;
  var sheetName = 'システム設定';
  var file = getFileByName(settingsFolder, sheetName);
  if (!file) return null;
  var ss = SpreadsheetApp.openById(file.getId());
  var sheet = ss.getSheetByName('画像タグ');
  if (!sheet) {
    sheet = ss.insertSheet('画像タグ');
    var headers = ['ファイルID', 'ファイル名', '説明タグ', '更新日時'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4facfe').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * チラシ画像の説明タグを保存する（upsert）
 * @aiCallable
 * @param {string} fileId DriveファイルID
 * @param {string} tags カンマ区切りの説明タグ（例: "桜、青空、躍動感"）
 * @return {Object} { success, message } または { success: false, error }
 */
function saveFlyerImageTags(fileId, tags) {
  try {
    if (!fileId) return { success: false, error: 'fileId が空です' };
    var tagsStr = (tags || '').trim();
    var fileName = '';
    try { fileName = DriveApp.getFileById(fileId).getName(); } catch (e) {}
    firestoreSet_('imageTags', fileId, {
      fileId: fileId,
      fileName: fileName,
      tags: tagsStr,
      updatedAt: new Date().toISOString()
    });
    return { success: true, message: 'タグを保存しました' };
  } catch (error) {
    Logger.log('❌ saveFlyerImageTagsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 画像タグシートから全タグを一括取得してマップで返す内部ヘルパー
 * @return {Object} { fileId: tags, ... }
 */
function getAllFlyerImageTags_() {
  var map = {};
  try {
    var docs = firestoreQuery_('imageTags', []);
    docs.forEach(function(doc) {
      if (doc.fileId) map[doc.fileId] = doc.tags || '';
    });
  } catch (e) {
    Logger.log('⚠ getAllFlyerImageTags_: ' + e);
  }
  return map;
}

/**
 * 画像タグシートから指定ファイルIDの行を削除する内部ヘルパー
 * @param {string} fileId DriveファイルID
 */
function deleteFlyerImageTags_(fileId) {
  try {
    firestoreDelete_('imageTags', fileId);
  } catch (e) {
    Logger.log('⚠ deleteFlyerImageTags_: ' + e);
  }
}

// --- 旧チラシ設定（非推奨: AI生成方式に移行済み。互換性のため残存） ---
// --- AIチラシ生成（Gemini連携） ---

/**
 * AIチラシデータ保存用シート「チラシAI」を取得/作成する内部ヘルパー
 * @return {Sheet|null} シートオブジェクト
 */
function getFlyerAiSheet_() {
  // Firestore移行済み。このヘルパーはマイグレーション用に残す（通常処理では使用しない）
  var settingsFolder = getSettingsFolder();
  if (!settingsFolder) return null;
  var sheetName = 'システム設定';
  var file = getFileByName(settingsFolder, sheetName);
  if (!file) return null;
  var ss = SpreadsheetApp.openById(file.getId());
  var sheet = ss.getSheetByName('チラシAI');
  if (!sheet) {
    sheet = ss.insertSheet('チラシAI');
    var headers = ['ID', '講習ID', '校舎CD', 'HTML', '会話履歴(JSON)', '更新日時', '更新者'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#E91E8C').setFontColor('white');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** チラシAI生成用の季節デザインパレット（バックエンド専用） */
var FLYER_DESIGN_PALETTE_ = {
  spring:  { bg: '#FFF5F7', main: '#D81B60', accent: '#FFB7C5', mood: '桜・期待感・新学年', label: '春期' },
  summer:  { bg: '#F0F9FF', main: '#0056B3', accent: '#FF8C00', mood: '清潔感・情熱・夏休み', label: '夏期' },
  winter:  { bg: '#F8F9FA', main: '#2C3E50', accent: '#00A8E8', mood: '集中力・誠実・受験', label: '冬期' },
  general: { bg: '#F4FFF4', main: '#2E7D32', accent: '#8BC34A', mood: '成長・安心・定期テスト', label: '汎用' }
};

/** 講習typeId → 季節キーのマッピング（バックエンド用） */
var FLYER_TYPE_SEASON_MAP_ = {
  spring: 'spring', summer: 'summer', winter: 'winter',
  kiso1: 'general', kiso2: 'general', nyushi: 'winter'
};

/**
 * チラシAI用のDESIGN.mdスタイルプロンプトを構築する
 * @param {string} seasonKey 季節キー（spring/summer/winter/general）
 * @param {boolean} hasImage 画像選択済みか
 * @param {string} imageTags 画像の説明タグ
 * @param {boolean} isEditMode 修正モードか
 * @return {string} プロンプト文字列
 */
function buildFlyerDesignPrompt_(seasonKey, hasImage, imageTags, isEditMode) {
  var palette = FLYER_DESIGN_PALETTE_[seasonKey] || FLYER_DESIGN_PALETTE_.general;
  var seasonTheme = palette.label + '（' + palette.mood + '）';

  // 画像ルールセクション
  var imageSection = '';
  if (hasImage) {
    imageSection = '## 6. 画像配置ルール（最重要）\n' +
      '【必須】画像ゾーンはチラシの最上部・最初の要素として配置してください。\n' +
      '画像ゾーンがヘッダーを兼ねるため、画像の上に別途ヘッダーを作らないでください。\n' +
      '以下のHTML構造を厳密に使用してください:\n' +
      '```html\n' +
      '<div style="position:relative;width:100%;height:280px;overflow:hidden;">\n' +
      '  <img src="{{IMAGE_PLACEHOLDER}}" style="width:100%;height:100%;object-fit:cover;object-position:center;" />\n' +
      '  <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;box-sizing:border-box;">\n' +
      '    <p style="color:white;font-family:\'Noto Serif JP\',serif;font-size:15px;margin:0;letter-spacing:0.1em;">個別指導スクエア</p>\n' +
      '    <p style="color:white;font-family:\'Noto Serif JP\',serif;font-size:38px;font-weight:bold;margin:0;">{講習名}</p>\n' +
      '    <p style="color:white;font-family:\'Noto Sans JP\',sans-serif;font-size:17px;margin:0;text-align:center;">{キャッチコピー}</p>\n' +
      '  </div>\n' +
      '</div>\n' +
      '```\n' +
      '- 配置位置: チラシの最上部（第1要素）。ヘッダーを兼ねる\n' +
      '- {{IMAGE_PLACEHOLDER}} は必ず1箇所のみ使用すること\n' +
      '- オーバーレイ上の文字: 1行目=塾名（白・明朝体・小）、2行目=講習名（白・明朝体・大・bold）、3行目=キャッチコピー（白・ゴシック体）\n' +
      '- 画像ゾーンの外（上下）に塾名・講習名・キャッチコピーを繰り返さないこと\n' +
      (imageTags ? '- 選択中の画像の説明: ' + imageTags + '\n' : '') +
      '\n';
  }

  // モード指示
  var modeSection = '';
  if (isEditMode) {
    modeSection = '# MODE: 修正\n' +
      '現在のチラシHTMLをベースに修正してください。\n' +
      '- レイアウト構造（ゾーン配置・要素の並び順）はできるだけ維持すること\n' +
      '- ユーザーが指示した箇所のみを変更し、全体を作り直さないこと\n' +
      '- 色やフォントの変更は指示された範囲に限定すること\n';
  } else {
    modeSection = '# MODE: 新規生成\n' +
      'チラシの設計方針に沿ってゼロからデザインしてください。\n' +
      '各ゾーンの高さは目安です。コンテンツ量に応じて柔軟に調整してください。\n';
  }

  return '# ROLE\n' +
    'あなたは学習塾「個別指導スクエア」の季節講習チラシを専門に制作する\n' +
    '印刷物デザイナーです。\n\n' +
    '新聞折込・ポスティングで配布するA4判紙チラシを想定してください。\n' +
    '読者は小中高校生の保護者（主に30〜50代）です。\n' +
    '目的は「この塾の講習に申し込みたい」と思ってもらうことです。\n\n' +
    '出力はHTML形式ですが、あくまで印刷用紙チラシのデザインを\n' +
    'HTMLで表現したものです。ウェブページではありません。\n\n' +
    '---\n\n' +
    '# チラシの設計方針\n\n' +
    '## 1. サイズと構造\n' +
    '- A4縦（210mm × 297mm）を想定。HTMLでは width:794px; height:1123px で表現\n' +
    '- overflow:hidden; box-sizing:border-box を最外殻divに必ず設定\n' +
    '- すべてインラインCSS。フォントは "Noto Serif JP"（見出し）と "Noto Sans JP"（本文）を使用\n\n' +
    '## 2. ゾーン構成（高さは目安。コンテンツ量に応じて調整可）\n' +
    (hasImage
      ? '- 画像ヘッダー（〜280px）: 【最上部・第1要素】背景画像全面＋塾名・講習名・キャッチコピーをオーバーレイ（ヘッダーを兼ねる。この上に別途ヘッダー不要）\n'
      : '- ヘッダー（〜180px）: 塾名・講習名・キャッチコピー・季節の装飾\n') +
    (hasImage ? '- メイン（〜840px）: 日程表・料金表・塾の特徴\n' : '- メイン（〜940px）: 日程表・料金表・塾の特徴\n') +
    '- フッター（〜1123px）: 校舎情報・連絡先・問い合わせ\n\n' +
    '## 3. デザイン方針（紙チラシとして）\n\n' +
    '### 季節テーマ\n' +
    '現在の講習テーマ: ' + seasonTheme + '\n' +
    'テーマの雰囲気に合った3色（メインカラー・アクセントカラー・背景色）を\n' +
    'あなたが選んでください。紙に印刷しても見やすい配色にしてください。\n\n' +
    '### 紙チラシとして意識すること\n' +
    '- 「塾選びをしている保護者が一目で内容を把握できる」レイアウトを優先する\n' +
    '- 最も目立たせる要素: 講習名・料金・申込締切\n' +
    '- ウェブUIに見える要素（カード・影・ドロップシャドウ等）は控えめにする\n' +
    '- 余白と文字サイズのバランスで読みやすさを確保する\n' +
    '- 表（日程・料金）は罫線をしっかり引き、印刷時にも視認できる濃さにする\n\n' +
    '## 4. タイポグラフィ\n' +
    '- 大見出し: Noto Serif JP / 28〜36px / bold\n' +
    '- 小見出し: Noto Serif JP / 20〜24px / 600\n' +
    '- 本文・表内: Noto Sans JP / 14〜16px / line-height:1.6\n' +
    '- 強調文字: bold + メインカラー\n\n' +
    '## 5. 表のスタイル\n' +
    '- border-collapse:collapse; width:100%\n' +
    '- セル内padding: 6px 10px\n' +
    '- ヘッダー行: 背景=メインカラー、文字=白\n' +
    '- 罫線: 1px solid（メインカラーか濃いグレー）\n\n' +
    imageSection +
    '## 7. キャッチコピーの作成指針\n' +
    '- ターゲット: 子どもの成績・進学に不安を感じている保護者\n' +
    '- 訴求軸: 個別指導ならではの「一人ひとりに合わせた指導」「確実な成果」\n' +
    '- 文字数: 20〜30文字程度\n' +
    '- 例のトーン: 「苦手をなくして、新学年を自信でスタート。」\n\n' +
    '---\n\n' +
    modeSection +
    '\n---\n\n' +
    '# 出力ルール\n' +
    '必ず以下のJSON形式のみで返してください：\n' +
    '{"html":"<div style=\'width:794px;height:1123px;overflow:hidden;...\'>...</div>","explanation":"変更内容の説明（日本語）"}\n' +
    '注意: htmlの値は1行の文字列で返してください。改行は\\nで表現してください。\n';
}

/**
 * Gemini APIでA4チラシHTMLを生成する
 * @aiCallable
 * @param {Object} params { userMessage, chatHistory, systemContext, hasImage, imageTags, currentHtml, seasonKey }
 * @return {Object} { success, html, explanation } または { success: false, error }
 */
function generateFlyerWithAI(params) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません' };

    var userMessage = params.userMessage || '';
    var chatHistory = params.chatHistory || [];
    var systemContext = params.systemContext || '';
    var hasImage = params.hasImage || false;
    var currentHtml = params.currentHtml || '';

    // 会話履歴テキスト（直近6ターン）
    var historyText = '';
    if (chatHistory.length > 0) {
      historyText = '\n\n【直近の会話履歴】\n';
      chatHistory.slice(-10).forEach(function(item) {
        historyText += (item.role === 'user' ? 'ユーザー: ' : 'AI: ') + item.text + '\n';
      });
    }

    // 現在HTMLがある場合の指示
    var currentHtmlContext = '';
    if (currentHtml) {
      currentHtmlContext = '\n\n【現在のチラシHTML（これをベースに修正してください）】\n' + currentHtml;
    }

    // チラシ設計方針プロンプトを構築
    var seasonKey = params.seasonKey || 'general';
    var designPrompt = buildFlyerDesignPrompt_(seasonKey, hasImage, params.imageTags, !!currentHtml);

    // systemContext = フロントエンドが収集した【講習情報】【講習日程データ】【料金データ】
    var prompt = designPrompt +
      (systemContext ? '\n\n# データ\n' + systemContext : '') +
      historyText +
      currentHtmlContext +
      '\n\n【ユーザーの指示】\n' + userMessage;

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16000,
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

    if (result.candidates && result.candidates.length > 0) {
      var parts = (result.candidates[0].content.parts || []);
      var textPart = parts.filter(function(p) { return !p.thought; }).pop();
      var rawText = textPart ? (textPart.text || '') : '';
      var cleanedText = rawText.replace(/```+json[\r\n]*/gi, '').replace(/```+[\r\n]*/g, '').trim();
      var jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanedText = jsonMatch[0];

      try {
        var aiResponse = JSON.parse(cleanedText);
        if (!aiResponse.html) {
          return { success: false, error: 'AIがHTMLを返しませんでした。指示を変えてもう一度お試しください。' };
        }
        return { success: true, html: aiResponse.html, explanation: aiResponse.explanation || '' };
      } catch (parseError) {
        Logger.log('❌ チラシAIパースエラー: ' + parseError + ' / rawText: ' + rawText.substring(0, 300));
        return { success: false, error: 'AIの応答を解析できませんでした。もう一度お試しください。' };
      }
    }

    // MAX_TOKENS チェック
    if (result.candidates && result.candidates[0] && result.candidates[0].finishReason === 'MAX_TOKENS') {
      return { success: false, error: 'チラシのHTMLが長すぎて途中で切れました。よりシンプルなデザインでお試しください。' };
    }

    return { success: false, error: 'AIレスポンスが空でした。もう一度お試しください。' };

  } catch (error) {
    Logger.log('❌ generateFlyerWithAIエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * AIチラシデータ（HTML + 会話履歴）をスプレッドシートに保存する
 * @aiCallable
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード（'common' = 共通）
 * @param {string} html 生成済みチラシHTML
 * @param {string} chatHistoryJson 会話履歴のJSON文字列
 * @return {Object} { success, message }
 */
function saveFlyerAiData(lectureId, campusCode, html, chatHistoryJson) {
  try {
    if (!lectureId || !campusCode) return { success: false, error: 'lectureId と campusCode は必須です' };
    var id = lectureId + '_' + campusCode;
    var now = new Date().toISOString();
    var email = getCurrentUserEmail();
    var chatHistory = safeJsonParse_(chatHistoryJson, []);
    firestoreSet_('flyerAi', id, {
      id: id,
      lectureId: lectureId,
      campusCode: campusCode,
      html: html || '',
      chatHistory: chatHistory,
      updatedAt: now,
      updatedBy: email
    });
    return { success: true, message: 'チラシデータを保存しました' };
  } catch (error) {
    Logger.log('❌ saveFlyerAiDataエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 保存済みAIチラシデータを読み込む
 * @aiCallable
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード（'common' = 共通）
 * @return {Object} { success, html, chatHistory, updatedAt } または { success: false }
 */
function loadFlyerAiData(lectureId, campusCode) {
  try {
    if (!lectureId || !campusCode) return { success: false, error: 'lectureId と campusCode は必須です' };
    var id = lectureId + '_' + campusCode;
    var doc = firestoreGet_('flyerAi', id);
    if (!doc) return { success: false, html: null, chatHistory: [] };
    return {
      success: true,
      html: doc.html || '',
      chatHistory: doc.chatHistory || [],
      updatedAt: doc.updatedAt || ''
    };
  } catch (error) {
    Logger.log('❌ loadFlyerAiDataエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// --- 講習別料金設定 ---

// 講習料金の学年区分定数（7区分固定）
var LECTURE_GRADE_KEYS_ALL = ['sho', 'chu1', 'chu2', 'chu3', 'ko1', 'ko2', 'ko3'];
var LECTURE_GRADE_LABELS_ = { sho: '小学生', chu1: '中1', chu2: '中2', chu3: '中3', ko1: '高1', ko2: '高2', ko3: '高3' };
// 学年コード（2桁文字列）→ gradeKey の変換マップ
var LECTURE_GRADE_CODE_MAP_ = { '7': 'sho', '8': 'sho', '9': 'sho', '10': 'sho', '11': 'sho', '12': 'sho', '13': 'chu1', '14': 'chu2', '15': 'chu3', '16': 'ko1', '17': 'ko2', '18': 'ko3' };
// 勝瑞校の校舎コード（高校生のみ別料金）
var LECTURE_SHOZUI_CAMPUS_CODE = '08';
// 中3のみ対象の講習タイプ
var LECTURE_CHU3_ONLY_TYPES_ = ['kiso1', 'kiso2', 'nyushi'];
// 講習タイプの表示名マップ
var LECTURE_TYPE_DISPLAY_NAMES_ = { spring: '春期講習', summer: '夏期講習', kiso1: '第1回基礎学力テスト対策講座', kiso2: '第2回基礎学力テスト対策講座', winter: '冬期講習', nyushi: '入試直前講習' };

/**
 * 講習タイプ別のデフォルト料金データを返す内部ヘルパー（新構造）
 * 各タイプは {rows: [{type, gradeKey, duration, count, internal, external}]} の形式
 * type: 'standard'（標準）/ 'shozui'（勝瑞校専用）/ 'custom'（追加行）
 * @return {Object} { typeId: {rows: [...]} }
 */
function getDefaultLecturePricing_() {
  var result = {};
  // 高校生デフォルト料金（税抜き）
  var KO2_ROWS = [
    { label: '高2 1回', count: 1, internal: 2875 },
    { label: '高2 2回', count: 2, internal: 5740 },
    { label: '高2 3回', count: 3, internal: 8625 },
    { label: '高2 4回', count: 4, internal: 11500 },
    { label: '高2 2科目×4回セット', count: 4, internal: 21000 }
  ];
  var KO3_ROWS = [
    { label: '高3 1回', count: 1, internal: 3875 },
    { label: '高3 2回', count: 2, internal: 7750 },
    { label: '高3 3回', count: 3, internal: 11625 },
    { label: '高3 4回', count: 4, internal: 15500 },
    { label: '高3 2科目×4回セット', count: 4, internal: 28000 }
  ];
  var KO1_ROWS = [
    { label: '高1 1回', count: 1, internal: 2875 },
    { label: '高1 2回', count: 2, internal: 5740 },
    { label: '高1 3回', count: 3, internal: 8625 },
    { label: '高1 4回', count: 4, internal: 11500 },
    { label: '高1 2科目×4回セット', count: 4, internal: 21000 }
  ];
  // 中3多教科デフォルト料金（税抜き）
  var CHU3_MULTI_ROWS = [
    { label: '中3 2教科', count: 2, internal: 23000 },
    { label: '中3 3教科', count: 3, internal: 33000 },
    { label: '中3 4教科', count: 4, internal: 42000 },
    { label: '中3 5教科', count: 5, internal: 50000 }
  ];
  ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach(function(typeId) {
    var isChuu3Only = LECTURE_CHU3_ONLY_TYPES_.indexOf(typeId) !== -1;
    var gradeKeys = isChuu3Only ? ['chu3'] : LECTURE_GRADE_KEYS_ALL;
    var rows = gradeKeys.map(function(gk) {
      var dur = (gk === 'sho') ? 5 : (['ko1', 'ko2', 'ko3'].indexOf(gk) !== -1) ? 9 : 8;
      return { type: 'standard', gradeKey: gk, duration: dur, count: 2, internal: 0, external: 0 };
    });
    // 勝瑞校行（高校生対象の講習のみ：kiso1/kiso2/nyushi は中3のみのため除外）
    if (!isChuu3Only) {
      ['ko1', 'ko2', 'ko3'].forEach(function(gk) {
        rows.push({ type: 'shozui', gradeKey: gk, duration: 9, count: 2, internal: 0, external: 0 });
      });
    }
    // 高校生カスタム行（spring / summer / winter のみ）
    if (['spring', 'summer', 'winter'].indexOf(typeId) !== -1) {
      KO2_ROWS.forEach(function(t) { rows.push({ type: 'custom', label: t.label, duration: 9, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
      KO3_ROWS.forEach(function(t) { rows.push({ type: 'custom', label: t.label, duration: 9, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
    }
    // 高1は summer / winter のみ（spring は追加しない）
    if (['summer', 'winter'].indexOf(typeId) !== -1) {
      KO1_ROWS.forEach(function(t) { rows.push({ type: 'custom', label: t.label, duration: 9, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
    }
    // 中3多教科（summer / winter / nyushi のみ）
    if (['summer', 'winter', 'nyushi'].indexOf(typeId) !== -1) {
      CHU3_MULTI_ROWS.forEach(function(t) { rows.push({ type: 'custom', label: t.label, duration: 8, count: t.count, internal: t.internal, external: 0, externalNa: true }); });
    }
    result[typeId] = { rows: rows };
  });
  return result;
}

/**
 * 旧フォーマット（配列形式）を新フォーマット（{rows:[...]}形式）に移行する内部ヘルパー
 * @param {Object} oldData 旧フォーマットのデータ { typeId: [{label, internal, external}] }
 * @return {Object} 新フォーマットのデータ { typeId: {rows: [...]} }
 */
function migrateLecturePricingData_(oldData) {
  var newData = getDefaultLecturePricing_();
  // ラベル文字列 → 対応するgradeKeyの配列マッピング
  var labelMap = [
    { pattern: '小学生',       gradeKeys: ['sho'] },
    { pattern: '中学1・2年生', gradeKeys: ['chu1', 'chu2'] },
    { pattern: '中学1・2年', gradeKeys: ['chu1', 'chu2'] },
    { pattern: '中1・2年生', gradeKeys: ['chu1', 'chu2'] },
    { pattern: '中学3年生',    gradeKeys: ['chu3'] },
    { pattern: '中学3年',    gradeKeys: ['chu3'] },
    { pattern: '中3',         gradeKeys: ['chu3'] },
    { pattern: '高校生',       gradeKeys: ['ko1', 'ko2', 'ko3'] }
  ];

  ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach(function(typeId) {
    var oldRows = oldData[typeId];
    if (!Array.isArray(oldRows)) return;
    oldRows.forEach(function(oldRow) {
      var label = String(oldRow.label || '');
      var matchedKeys = null;
      for (var i = 0; i < labelMap.length; i++) {
        if (label.indexOf(labelMap[i].pattern) !== -1) {
          matchedKeys = labelMap[i].gradeKeys;
          break;
        }
      }
      if (!matchedKeys) return;
      matchedKeys.forEach(function(gk) {
        var row = newData[typeId].rows.find(function(r) { return r.type === 'standard' && r.gradeKey === gk; });
        if (row) {
          row.internal = oldRow.internal || 0;
          row.external = oldRow.external || 0;
        }
      });
    });
  });
  return newData;
}

/**
 * 講習別料金設定を取得する（未設定ならデフォルト値で初期化して返す）
 * 旧フォーマット（配列形式）を検出した場合は自動で新フォーマットに移行する
 * @aiCallable
 * @return {Object} { success, data } data は { typeId: {rows: [{type, gradeKey, duration, count, internal, external}]} }
 */
function getLecturePricingConfig() {
  try {
    var props = PropertiesService.getScriptProperties();
    var json = props.getProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG);
    var data;
    if (json) {
      var raw = JSON.parse(json);
      // 旧フォーマット検出：いずれかのtypeIdが配列（Array）ならば移行が必要
      var needsMigration = false;
      ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach(function(typeId) {
        if (Array.isArray(raw[typeId])) needsMigration = true;
      });
      if (needsMigration) {
        data = migrateLecturePricingData_(raw);
        props.setProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG, JSON.stringify(data));
      } else {
        data = raw;
      }
    } else {
      data = getDefaultLecturePricing_();
      props.setProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG, JSON.stringify(data));
    }
    return { success: true, data: data };
  } catch (error) {
    Logger.log('❌ getLecturePricingConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定した講習タイプの料金設定を保存し、料金表を自動更新する（Admin のみ）
 * @param {string} typeId 講習タイプ（spring/summer/kiso1/kiso2/winter/nyushi）
 * @param {string} lectureDataJson 料金データのJSON文字列 {rows: [{type, gradeKey, duration, count, internal, external}]}
 * @return {Object} { success, message }
 */
function saveLecturePricing(typeId, lectureDataJson) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    if (!typeId) return { success: false, error: 'typeId は必須です' };

    var lectureData = JSON.parse(lectureDataJson);
    if (!lectureData || !Array.isArray(lectureData.rows)) {
      return { success: false, error: '料金データの形式が不正です（{rows:[...]}形式が必要）' };
    }

    var props = PropertiesService.getScriptProperties();
    var json = props.getProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG);
    var all = json ? JSON.parse(json) : getDefaultLecturePricing_();

    // 旧フォーマットが残っていれば移行
    var needsMigration = false;
    ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach(function(tid) {
      if (Array.isArray(all[tid])) needsMigration = true;
    });
    if (needsMigration) all = migrateLecturePricingData_(all);

    all[typeId] = lectureData;
    props.setProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG, JSON.stringify(all));

    // 料金表（PRICING_TABLE_CONFIG）の講習セクションを自動更新
    syncLecturePricingToTable_(all);

    return { success: true, message: typeId + ' の料金を保存しました' };
  } catch (error) {
    Logger.log('❌ saveLecturePricingエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 全講習タイプの料金設定を一括保存する（統合UIから呼び出し）
 * @param {string} payloadJson JSON: { allTypes: { spring:{rows,sectionScopes}, summer:{...}, ... } }
 * @return {Object} { success, message }
 * @aiCallable
 */
function saveUnifiedLecturePricing(payloadJson) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var payload = JSON.parse(payloadJson);
    if (!payload || !payload.allTypes) return { success: false, error: 'データ形式が不正です' };

    var props = PropertiesService.getScriptProperties();
    var json = props.getProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG);
    var all = json ? JSON.parse(json) : getDefaultLecturePricing_();

    // 旧フォーマット移行
    var needsMigration = false;
    ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach(function(tid) {
      if (Array.isArray(all[tid])) needsMigration = true;
    });
    if (needsMigration) all = migrateLecturePricingData_(all);

    // 全タイプを一括更新
    ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'].forEach(function(typeId) {
      var typePayload = payload.allTypes[typeId];
      if (typePayload && Array.isArray(typePayload.rows)) {
        all[typeId] = typePayload;
      }
    });

    props.setProperty(CONFIG_PROP_KEYS.LECTURE_PRICING_CONFIG, JSON.stringify(all));
    syncLecturePricingToTable_(all);

    return { success: true, message: '全講習の料金設定を保存しました' };
  } catch (error) {
    Logger.log('❌ saveUnifiedLecturePricingエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別学年挨拶文を取得する（年度不問・全講習タイプ分）
 * @aiCallable
 * @return {Object} { success: boolean, data: { typeId: { gradeKey: "挨拶文", ... }, ... } }
 */
function getLectureGreetings() {
  try {
    var props = PropertiesService.getScriptProperties();
    var json = props.getProperty(CONFIG_PROP_KEYS.LECTURE_GREETINGS_CONFIG);
    var data = json ? JSON.parse(json) : {};
    Logger.log('✓ getLectureGreetings: 取得完了');
    return { success: true, data: data };
  } catch (error) {
    Logger.log('❌ getLectureGreetingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別学年挨拶文を保存する（年度不問・全講習タイプ分を一括保存）
 * @param {string} dataJson JSON文字列 { typeId: { gradeKey: "挨拶文", ... }, ... }
 * @return {Object} { success: boolean, message: string }
 */
function saveLectureGreetings(dataJson) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var data = JSON.parse(dataJson);
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'データ形式が不正です' };
    }
    var props = PropertiesService.getScriptProperties();
    props.setProperty(CONFIG_PROP_KEYS.LECTURE_GREETINGS_CONFIG, JSON.stringify(data));
    Logger.log('✓ saveLectureGreetings: 保存完了');
    return { success: true, message: '挨拶文を保存しました' };
  } catch (error) {
    Logger.log('❌ saveLectureGreetingsエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別料金設定を元に料金表（PRICING_TABLE_CONFIG）の講習セクションを自動生成・更新する内部ヘルパー
 * 既存の auto_ プレフィックスのセクションと旧 seasonal / seasonal_high セクションを置き換える
 * @param {Object} pricingData { typeId: {rows: [...]} }
 */
function syncLecturePricingToTable_(pricingData) {
  try {
    var props = PropertiesService.getScriptProperties();
    var tableJson = props.getProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    if (!tableJson) {
      Logger.log('⚠ syncLecturePricingToTable_: PRICING_CONFIG 未設定のためスキップ');
      return;
    }
    var tableData = JSON.parse(tableJson);

    // 「講習」タブが存在することを確認
    if (!tableData.tabs) tableData.tabs = ['通常授業', '講習'];
    if (tableData.tabs.indexOf('講習') === -1) tableData.tabs.push('講習');

    // 自動生成セクション（auto_ プレフィックス）と旧手動講習セクション・mockセクションを削除
    tableData.sections = (tableData.sections || []).filter(function(s) {
      return !/^auto_/.test(s.id) && s.id !== 'seasonal' && s.id !== 'seasonal_high' && s.id !== 'mock';
    });

    var typeOrder = ['spring', 'summer', 'kiso1', 'kiso2', 'winter', 'nyushi'];

    typeOrder.forEach(function(typeId) {
      var typeData = pricingData[typeId];
      if (!typeData || !Array.isArray(typeData.rows)) return;

      var standardRows = typeData.rows.filter(function(r) { return r.type === 'standard'; });
      var shozuiRows   = typeData.rows.filter(function(r) { return r.type === 'shozui'; });
      var customRows   = typeData.rows.filter(function(r) { return r.type === 'custom'; });
      var typeName = LECTURE_TYPE_DISPLAY_NAMES_[typeId] || typeId;
      var sectionScopes = typeData.sectionScopes || {};
      var stdScope = sectionScopes.standard || { campusScope: 'all', campusCodes: [] };
      var shzScope = sectionScopes.shozui   || { campusScope: 'specific', campusCodes: ['08'] };
      var cstScope = sectionScopes.custom   || { campusScope: 'all', campusCodes: [] };

      function rowsToTableRows(rows) {
        return rows.map(function(r) {
          var intTax = Math.floor((r.internal || 0) * 1.1);
          var extTax = Math.floor((r.external || 0) * 1.1);
          var mins = (r.duration || 0) * 10;
          var label = (r.type === 'custom')
            ? (r.label || '')
            : (LECTURE_GRADE_LABELS_[r.gradeKey] || r.gradeKey || '');
          return [label, mins + '分', String(r.count || 0) + '回', intTax.toLocaleString() + '円', extTax.toLocaleString() + '円'];
        });
      }

      var lecCampusConfig = getCampusConfig();
      function resolveNames(codes) {
        return (codes || []).map(function(code) { return lecCampusConfig[code] || code; });
      }

      if (standardRows.length > 0) {
        tableData.sections.push({
          id: 'auto_' + typeId,
          tab: '講習',
          name: typeName,
          headers: ['学年', '1コマ', '回数', '内部生（税込）', '外部生（税込）'],
          rows: rowsToTableRows(standardRows),
          notes: [],
          _autoGenerated: true,
          campusScope: stdScope.campusScope,
          campusCodes: stdScope.campusCodes,
          campusResolvedNames: resolveNames(stdScope.campusCodes)
        });
      }
      if (shozuiRows.length > 0) {
        tableData.sections.push({
          id: 'auto_' + typeId + '_shozui',
          tab: '講習',
          name: typeName + '（勝瑞校・高校生）',
          headers: ['学年', '1コマ', '回数', '内部生（税込）', '外部生（税込）'],
          rows: rowsToTableRows(shozuiRows),
          notes: [],
          _autoGenerated: true,
          campusScope: shzScope.campusScope,
          campusCodes: shzScope.campusCodes,
          campusResolvedNames: resolveNames(shzScope.campusCodes)
        });
      }
      if (customRows.length > 0) {
        tableData.sections.push({
          id: 'auto_' + typeId + '_custom',
          tab: '講習',
          name: typeName + '（追加）',
          headers: ['学年/コース', '1コマ', '回数', '内部生（税込）', '外部生（税込）'],
          rows: rowsToTableRows(customRows),
          notes: [],
          _autoGenerated: true,
          campusScope: cstScope.campusScope,
          campusCodes: cstScope.campusCodes,
          campusResolvedNames: resolveNames(cstScope.campusCodes)
        });
      }
    });

    props.setProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(tableData));
  } catch (e) {
    Logger.log('❌ syncLecturePricingToTable_エラー: ' + e);
  }
}

// ========================================
// 【セクション21】通常授業設定
// ========================================
// 通常授業（講習ではない定期授業）の料金・セクション管理
// データ形式: {version:2, sections:[{id,name,campusScope,campusCodes,headers,rows,notes}]}
// campusScope: "all"（全校舎共通）または "specific"（特定校舎のみ）

/**
 * 通常授業設定のデフォルト値を返す内部ヘルパー
 * @return {Object} {version:2, sections:[...]}
 */
function getDefaultNormalClassConfig_() {
  return {
    version: 2,
    sections: [
      {
        id: 'regular',
        name: '個別指導料金',
        campusScope: 'all',
        campusCodes: [],
        headers: ['学年', 'コース', '1科目', 'テキスト代'],
        rows: [
          ['小学生', '算・国・英', '6,000 (6,600)', '1,750 (1,925)'],
          ['', '英・数・国（3人）', '11,000 (12,100)', '1,750 (1,925)'],
          ['', '英・数・国（6人）', '9,500 (10,450)', '1,750 (1,925)'],
          ['中学生', '理', '8,000 (8,800)', '1,750 (1,925)'],
          ['', '社', '8,000 (8,800)', '2,250 (2,475)'],
          ['', '英単語テスト', '1,000 (1,100)', '1,000 (1,100)'],
          ['', '基礎数学', '3,500 (3,850)', ''],
          ['高校生', '1年・2年', '13,500 (14,850)', '毎月1,000 (1,100)'],
          ['', '3年', '14,500 (15,950)', '毎月1,000 (1,100)']
        ],
        notes: [
          '※割引',
          '小学生…3科目受講で、2,000 (2,200) 円割引',
          '中学生…3人クラス3科目受講で、2,000 (2,200)円割引',
          '3人クラス2科目・6人クラス1科目受講で、1,500 (1,650) 円割引',
          '3人クラス1科目・6人クラス2科目受講で、1,000 (1,100) 円割引',
          '高校生…3科目受講で、2,000 (2,200) 円割引',
          '4科目受講で、4,000 (4,400) 円割引',
          '5科目受講で、6,000 (6,600) 円割引'
        ]
      },
      {
        id: 'shozui',
        name: '※勝瑞校',
        campusScope: 'specific',
        campusCodes: ['08'],
        headers: ['学年', '科目', '月額', '教材費'],
        rows: [
          ['高1', '英語', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '数学', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '5,000 (5,500)', '毎月1,000 (1,100)'],
          ['高2', '英語', '14,000 (15,400)', '毎月1,000 (1,100)'],
          ['', '数学', '15,000 (16,500)', '毎月1,000 (1,100)'],
          ['', '理科(物・化)', '13,000 (14,300)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '6,000 (6,600)', '毎月1,000 (1,100)'],
          ['高3', '英語', '16,000 (17,600)', '毎月1,000 (1,100)'],
          ['', '数学', '17,000 (18,700)', '毎月1,000 (1,100)'],
          ['', '理科(物・化)', '14,000 (15,400)', '毎月1,000 (1,100)'],
          ['', '演習クラスのみ', '7,000 (7,700)', '毎月1,000 (1,100)']
        ],
        notes: ['※演習クラスは、授業料に含まれている。別で受講することも可。']
      },
      {
        id: 'individual',
        name: '完全個別',
        campusScope: 'all',
        campusCodes: [],
        headers: ['', '1科目', '2科目', '3科目', 'テキスト代'],
        rows: [
          ['小学生', '12,000 (13,200)', '', '', '1,750 (1,925)'],
          ['中学生', '18,000 (19,800)', '', '', '1,750 (1,925)'],
          ['高校生', '24,000 (26,400)', '46,000 (50,600)', '68,000 (74,800)', '毎月 500 (550)']
        ],
        notes: ['※高校生は1科目を週2回受講した場合は2科目として計算すること']
      },
      {
        id: 'enrollment',
        name: '入塾金・諸経費',
        campusScope: 'all',
        campusCodes: [],
        headers: ['項目', '対象', '金額', '', ''],
        rows: [
          ['入塾金', '全学年・全クラス', '10,000 (11,000)', '兄弟姉妹割引', ''],
          ['諸経費', '小学生', '2,000 (2,200)', '2人同時通塾', '3,000 (3,300)'],
          ['', '中学生・高校生', '3,000 (3,300)', '3人同時通塾', '6,000 (6,600)'],
          ['', '', '', '※上の子の料金から割引', '']
        ],
        notes: []
      }
    ]
  };
}

/**
 * 旧形式（配列）を新形式（セクションベース）にマイグレーションする内部ヘルパー
 * @param {Array} oldRows [{grade, duration, count, internal, external}]
 * @return {Object} {version:2, sections:[...]}
 */
function migrateNormalClassConfig_(oldRows) {
  var def = getDefaultNormalClassConfig_();
  // 旧データから duration/count のみ引き継ぎ（料金は外部生がいたので捨てる）
  // ただし旧データに意味のある内部生料金があれば、デフォルトセクションを置き換えるのは難しいため
  // デフォルト値をそのまま使い、旧データを別プロパティに退避
  return def;
}

/**
 * 通常授業の設定データを取得する
 * @aiCallable
 * @return {Object} {success, data: {version, sections}}
 */
function getNormalClassConfig() {
  try {
    var props = PropertiesService.getScriptProperties();
    var json = props.getProperty(CONFIG_PROP_KEYS.NORMAL_CLASS_CONFIG);
    var data;
    if (json) {
      data = JSON.parse(json);
      // 旧形式（配列）→ 新形式へマイグレーション
      if (Array.isArray(data)) {
        props.setProperty('NORMAL_CLASS_CONFIG_LEGACY', json); // 旧データを退避
        data = migrateNormalClassConfig_(data);
        props.setProperty(CONFIG_PROP_KEYS.NORMAL_CLASS_CONFIG, JSON.stringify(data));
      }
    } else {
      data = getDefaultNormalClassConfig_();
      props.setProperty(CONFIG_PROP_KEYS.NORMAL_CLASS_CONFIG, JSON.stringify(data));
    }
    return { success: true, data: data };
  } catch (error) {
    Logger.log('❌ getNormalClassConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 通常授業の設定データを保存する（Admin のみ）
 * 保存後に料金表タブへ自動同期する
 * @param {string} jsonData JSON文字列 {version, sections:[{id,name,campusScope,campusCodes,headers,rows,notes}]}
 * @return {Object} {success, message}
 */
function saveNormalClassConfig(jsonData) {
  try {
    if (!isAdmin()) return { success: false, error: 'Admin のみアクセス可能' };
    var data = JSON.parse(jsonData);
    if (!data || !Array.isArray(data.sections)) return { success: false, error: 'データの形式が不正です' };
    data.version = 2;
    PropertiesService.getScriptProperties().setProperty(CONFIG_PROP_KEYS.NORMAL_CLASS_CONFIG, JSON.stringify(data));
    // 料金表タブへ自動同期
    syncNormalConfigToPricingTable_(data);
    return { success: true, message: '通常授業設定を保存しました' };
  } catch (error) {
    Logger.log('❌ saveNormalClassConfigエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 通常設定を PRICING_TABLE_CONFIG の通常授業タブへ同期する内部ヘルパー
 * 既存の _fromNormalConfig マーカー付きセクション + 旧手動通常授業セクション(regular/shozui/individual/enrollment)を削除して差し替える
 * @param {Object} normalData {version, sections:[...]}
 */
function syncNormalConfigToPricingTable_(normalData) {
  try {
    var props = PropertiesService.getScriptProperties();
    var tableJson = props.getProperty(CONFIG_PROP_KEYS.PRICING_CONFIG);
    if (!tableJson) {
      Logger.log('⚠ syncNormalConfigToPricingTable_: PRICING_CONFIG 未設定のためスキップ');
      return;
    }
    var tableData = JSON.parse(tableJson);

    // 通常授業タブが存在することを確認
    if (!tableData.tabs) tableData.tabs = ['通常授業', '講習'];
    if (tableData.tabs.indexOf('通常授業') === -1) tableData.tabs.unshift('通常授業');

    // 旧手動セクション（通常授業タブ）と _fromNormalConfig セクションをすべて削除
    var LEGACY_NORMAL_IDS = ['regular', 'shozui', 'individual', 'enrollment'];
    tableData.sections = (tableData.sections || []).filter(function(s) {
      if (s._fromNormalConfig) return false;
      if (s.tab === '通常授業' && LEGACY_NORMAL_IDS.indexOf(s.id) !== -1) return false;
      return true;
    });

    // 通常設定のセクションを先頭（通常授業タブ）に追加
    var campusConfig = getCampusConfig();
    var newSections = (normalData.sections || []).map(function(sec) {
      var resolvedNames = (sec.campusCodes || []).map(function(code) {
        return campusConfig[code] || code;
      });
      return {
        id: 'nc_' + sec.id,
        tab: '通常授業',
        name: sec.name,
        headers: sec.headers,
        rows: sec.rows,
        notes: (sec.notes || []),
        _fromNormalConfig: true,
        campusScope: sec.campusScope,
        campusCodes: sec.campusCodes,
        campusResolvedNames: resolvedNames
      };
    });

    // 通常授業セクションを先頭に、その他（講習等）はそのまま後ろに
    var otherSections = tableData.sections.filter(function(s) { return s.tab !== '通常授業'; });
    tableData.sections = newSections.concat(otherSections);

    props.setProperty(CONFIG_PROP_KEYS.PRICING_CONFIG, JSON.stringify(tableData));
    Logger.log('✅ 通常設定 → 料金表 同期完了: ' + newSections.length + ' セクション');
  } catch (e) {
    Logger.log('❌ syncNormalConfigToPricingTable_エラー: ' + e);
  }
}

/**
 * 通常設定の全セクションを返す（配布物・チラシ・AIから参照用）
 * @aiCallable
 * @param {string} [campusCode] 校舎コード。指定した場合、その校舎に該当するセクションのみ返す
 * @return {Object} {success, data: [{id,name,campusScope,campusCodes,headers,rows,notes}]}
 */
function getNormalClassSectionsForWeb(campusCode) {
  try {
    var result = getNormalClassConfig();
    if (!result.success) return result;
    var sections = result.data.sections || [];
    if (campusCode) {
      sections = sections.filter(function(sec) {
        if (sec.campusScope === 'all') return true;
        return (sec.campusCodes || []).indexOf(String(campusCode)) !== -1;
      });
    }
    return { success: true, data: sections };
  } catch (error) {
    Logger.log('❌ getNormalClassSectionsForWebエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// 配布物ファイル管理（Drive 保存・一覧・削除）
// ----------------------------------------

/**
 * 配布物ファイルを保存するDriveフォルダを取得または作成する内部ヘルパー
 * ルートフォルダ → 講習/ → {fy}年度/ → {lectureName}/ → {campusName}/ の構造を作成する
 * @param {number|string} fy 年度（例: 2025）
 * @param {string} lectureName 講習名（例: "夏期講習"）
 * @param {string} campusName 校舎名（例: "本町"）
 * @return {Folder} Driveフォルダオブジェクト
 */
function getDistributionFilesFolder_(fy, lectureName, campusName) {
  var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
  if (!rootFolderId) throw new Error('APP_FOLDER_ID が設定されていません');
  var root = DriveApp.getFolderById(rootFolderId);
  var lecturesFolder = getOrCreateTabFolder(root, '講習');
  var yearFolder = getOrCreateTabFolder(lecturesFolder, fy + '年度');
  var lecFolder = getOrCreateTabFolder(yearFolder, lectureName);
  var campusFolder = getOrCreateTabFolder(lecFolder, campusName);
  return campusFolder;
}

/**
 * 指定講習・校舎の配布物PDFをDriveに保存する
 * @aiCallable
 * @param {string} lectureId 講習ID（例: "2025-summer"）
 * @param {string} campusCode 校舎コード（例: "01"）
 * @param {number|string} fy 年度（例: 2025）
 * @param {string} lectureName 講習名（例: "夏期講習"）
 * @param {string} campusName 校舎名（例: "本町"）
 * @param {string} fileName ファイル名（例: "2025年度_夏期講習_本町.pdf"）
 * @param {string} pdfBase64 Base64エンコードされたPDFバイナリ
 * @return {Object} {success, fileId, fileName, message}
 */
function saveDistributionFile(lectureId, campusCode, fy, lectureName, campusName, fileName, pdfBase64) {
  try {
    if (!lectureId || !campusCode) return { success: false, error: '講習IDまたは校舎コードが未指定です' };
    var folderFy = fy || parseInt((lectureId || '').split('-')[0], 10) || '';
    var folderLecName = lectureName || lectureId;
    var folderCampusName = campusName || campusCode;
    var folder = getDistributionFilesFolder_(folderFy, folderLecName, folderCampusName);
    var decoded = Utilities.base64Decode(pdfBase64);
    var blob = Utilities.newBlob(decoded, 'application/pdf', fileName);
    var file = folder.createFile(blob);
    return { success: true, fileId: file.getId(), fileName: fileName, message: 'Driveに保存しました' };
  } catch (error) {
    Logger.log('❌ saveDistributionFileエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 指定講習・校舎の配布物PDFファイル一覧をDriveから取得する
 * フォルダが存在しない場合は空配列を返す（エラーにしない）
 * @aiCallable
 * @param {string} lectureId 講習ID
 * @param {string} campusCode 校舎コード
 * @param {number|string} fy 年度（例: 2025）
 * @param {string} lectureName 講習名（フォルダ名。未指定時は lectureId で検索）
 * @param {string} campusName 校舎名（フォルダ名。未指定時は campusCode で検索）
 * @return {Array} [{id, name, createdDate, size}] 新しい順
 */
function listDistributionFiles(lectureId, campusCode, fy, lectureName, campusName) {
  try {
    var rootFolderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!rootFolderId || !lectureId || !campusCode) return [];

    var root = DriveApp.getFolderById(rootFolderId);

    var lecturesIter = root.getFoldersByName('講習');
    if (!lecturesIter.hasNext()) return [];
    var lecturesFolder = lecturesIter.next();

    var fyLabel = (fy || parseInt((lectureId || '').split('-')[0], 10) || '') + '年度';
    var yearIter = lecturesFolder.getFoldersByName(fyLabel);
    if (!yearIter.hasNext()) return [];
    var yearFolder = yearIter.next();

    var lecFolderName = lectureName || lectureId;
    var lecIter = yearFolder.getFoldersByName(lecFolderName);
    if (!lecIter.hasNext()) return [];
    var lecFolder = lecIter.next();

    var campusFolderName = campusName || campusCode;
    var campusIter = lecFolder.getFoldersByName(campusFolderName);
    if (!campusIter.hasNext()) return [];
    var campusFolder = campusIter.next();

    var files = [];
    var fileIter = campusFolder.getFilesByType('application/pdf');
    while (fileIter.hasNext()) {
      var f = fileIter.next();
      files.push({
        id: f.getId(),
        name: f.getName(),
        createdDate: f.getDateCreated().toISOString(),
        size: f.getSize()
      });
    }
    files.sort(function(a, b) { return b.createdDate.localeCompare(a.createdDate); });
    return files;
  } catch (error) {
    Logger.log('❌ listDistributionFilesエラー: ' + error);
    return [];
  }
}

/**
 * 指定した配布物PDFファイルをDriveのゴミ箱に移動して削除する
 * @aiCallable
 * @param {string} fileId Drive ファイルID
 * @return {Object} {success, message}
 */
function deleteDistributionFile(fileId) {
  try {
    if (!fileId) return { success: false, error: 'fileIdが未指定です' };
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return { success: true, message: 'ファイルを削除しました' };
  } catch (error) {
    Logger.log('❌ deleteDistributionFileエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ----------------------------------------
// 画像生成（Imagen 4.0 Ultra）
// ----------------------------------------

/**
 * ユーザーの日本語プロンプトを英語に翻訳する内部ヘルパー
 * Gemini Flash を使い、画像生成に最適化された英語プロンプトを生成する
 * @param {string} japanesePrompt 日本語の画像イメージ説明
 * @return {string} 英語のプロンプト
 */
function translateToImagePrompt_(japanesePrompt) {
  var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
  var prompt = 'You are a professional image generation prompt engineer.\n' +
    'Translate the following Japanese description into an optimized English prompt for an image generation AI.\n' +
    'The generated image will be used for a Japanese tutoring school (juku) flyer/advertisement.\n' +
    'Requirements:\n' +
    '- Output ONLY the English prompt text (no explanation, no JSON, no markdown)\n' +
    '- Make it detailed and descriptive for best image quality\n' +
    '- Include style keywords (e.g., photorealistic, vibrant colors, high resolution)\n' +
    '- Emphasize educational/academic atmosphere when appropriate\n' +
    '- Keep it under 200 words\n\n' +
    'Japanese description:\n' + japanesePrompt;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 }
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
    throw new Error(parseGeminiErrorMessage_(response));
  }

  var result = JSON.parse(response.getContentText());

  var parts = (result.candidates[0].content.parts || []);
  var textPart = parts.filter(function(p) { return !p.thought; }).pop();
  return textPart ? (textPart.text || '').trim() : '';
}

/**
 * 会話履歴と修正コメントを踏まえて英語プロンプトを再生成する内部ヘルパー
 * @param {string} originalPromptJa 最初の日本語プロンプト
 * @param {Array} history 会話履歴 [{role:'user'|'ai', text:string}]
 * @param {string} newComment 最新の修正コメント
 * @return {string} 洗練された英語プロンプト
 */
/**
 * 手書き講習日程表を Gemini API で OCR し、エントリ候補を返す（保存はしない）
 * @aiCallable
 * @param {string} base64Image base64エンコードされた画像データ
 * @param {string} mimeType 画像の MIME タイプ（例: image/jpeg, application/pdf）
 * @param {number} lectureYear 講習の年（月日のみの日付補完に使用）
 * @param {string} campusCodesJson 配属校舎コードの JSON 配列文字列
 * @param {string} campusNamesJson 校舎コード→名前マップの JSON 文字列
 * @return {Object} { success, entries:[{date,startTime,durationMinutes,subject,grade,classLabel,campusCode}], error }
 */
function ocrLectureSchedule(base64Image, mimeType, lectureYear, campusCodesJson, campusNamesJson) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };

    var campusCodes = safeJsonParse_(campusCodesJson, []);
    var campusNames = safeJsonParse_(campusNamesJson, {});

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
    var mediaLabel = mimeType === 'application/pdf'
      ? 'このPDF（複数ページある場合は全ページを確認してください）'
      : 'この画像';

    // 校舎情報をプロンプトに含める
    var campusText = '';
    var campusKeys = Object.keys(campusNames);
    if (campusKeys.length === 1) {
      campusText = '担当者の配属校舎は「' + campusNames[campusKeys[0]] + '」（コード: ' + campusKeys[0] + '）のみです。campusCode はすべて "' + campusKeys[0] + '" としてください。';
    } else if (campusKeys.length > 1) {
      var nameList = campusKeys.map(function(k) { return '"' + campusNames[k] + '": "' + k + '"'; }).join(', ');
      campusText = '校舎コード一覧（画像に校舎名がある場合は対応コードを使用してください）: ' + nameList + '。不明な場合は campusCode を null としてください。';
    }

    var prompt = mediaLabel + 'は学習塾の講習日程表です。\n' +
      '授業コマを読み取り、JSON 配列のみで返してください。マークダウンなし。\n\n' +
      '年度: ' + lectureYear + '年（月日のみ記載の場合はこの年で補完）\n' +
      campusText + '\n\n' +
      '【重要】日付の省略記法を正しく展開してください:\n' +
      '- "7/15,30" → 7月15日と7月30日の2エントリ\n' +
      '- "8/1.6" や "8/1・6" → 8月1日と8月6日の2エントリ\n' +
      '- "7/15,30,8/1.6" → 7月15日・7月30日・8月1日・8月6日の4エントリ\n' +
      '- "7/15〜8/5 毎週水" → 期間内の毎週水曜日を個別エントリに展開\n' +
      '省略された日付は前の月を引き継ぐ。各日付を必ず別々のエントリとして出力すること。\n\n' +
      '【操作タイプの判別ルール】\n' +
      '各エントリに "op" フィールドを追加すること:\n' +
      '- "create"（デフォルト）: 注釈なしの通常エントリ → 新規追加\n' +
      '- "edit": 変更を示す記号・文言がある場合\n' +
      '  例: "7/17→18"（日付変更）、"数学→英語"（科目変更）、"10:00→14:00"（時刻変更）、"変更"の文字\n' +
      '  → "op":"edit" とし、変更前の値をメインフィールド(date,startTime等)に、変更後の値を "changes" オブジェクトに入れる\n' +
      '- "delete": 削除を示す記号・文言がある場合\n' +
      '  例: "7/17×"、取り消し線、"削除"の文字、"✕"マーク\n' +
      '  → "op":"delete" とし、削除対象の情報をメインフィールドに入れる\n\n' +
      '講師名・担当者名が記載されている場合は teacherName として抽出する。不明な場合は null とする。\n\n' +
      'createの場合:\n' +
      '{"op":"create","date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":90,"subject":"科目またはnull","grade":"学年（小/中1/中2/中3/高1/高2/高3）またはnull","classLabel":"A/B/Cまたはnull","campusCode":"コードまたはnull","teacherName":"講師名またはnull"}\n' +
      'editの場合（変更前の値 + changesに変更後の値）:\n' +
      '{"op":"edit","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull","changes":{"date":"YYYY-MM-DD"}}\n' +
      'deleteの場合:\n' +
      '{"op":"delete","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull"}\n\n' +
      '読み取れない項目はnullとする。授業時間が不明な場合はdurationMinutes:90とする。"op"が省略された場合は"create"として扱われる。';

    var payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    var response = fetchGeminiWithRetry_(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    var text = json.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    var entries = JSON.parse(text);

    if (!Array.isArray(entries)) {
      return { success: false, error: '日程データを読み取れませんでした' };
    }

    Logger.log('✓ ocrLectureSchedule: ' + entries.length + '件読み取り (year=' + lectureYear + ')');
    return { success: true, entries: entries };
  } catch (error) {
    Logger.log('❌ ocrLectureSchedule エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 貼り付けテキストから講習日程を解析しエントリ候補を返す（保存はしない）
 * @aiCallable
 * @param {string} scheduleText 日程テキスト（ワード・エクセル等からのコピー）
 * @param {number} lectureYear 講習の年（月日のみの日付補完に使用）
 * @param {string} campusCodesJson 配属校舎コードの JSON 配列文字列
 * @param {string} campusNamesJson 校舎コード→名前マップの JSON 文字列
 * @return {Object} { success, entries:[{date,startTime,durationMinutes,subject,grade,classLabel,campusCode}], error }
 */
function parseLectureScheduleFromText(scheduleText, lectureYear, campusCodesJson, campusNamesJson) {
  try {
    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません（管理者設定で登録してください）' };
    if (!scheduleText || !scheduleText.trim()) return { success: false, error: 'テキストが空です' };

    var campusNames = safeJsonParse_(campusNamesJson, {});
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;

    var campusText = '';
    var campusKeys = Object.keys(campusNames);
    if (campusKeys.length === 1) {
      campusText = '担当者の配属校舎は「' + campusNames[campusKeys[0]] + '」（コード: ' + campusKeys[0] + '）のみです。campusCode はすべて "' + campusKeys[0] + '" としてください。';
    } else if (campusKeys.length > 1) {
      var nameList = campusKeys.map(function(k) { return '"' + campusNames[k] + '": "' + k + '"'; }).join(', ');
      campusText = '校舎コード一覧（テキストに校舎名がある場合は対応コードを使用してください）: ' + nameList + '。不明な場合は campusCode を null としてください。';
    }

    var prompt = '以下は学習塾の講習日程テキストです。\n' +
      '授業コマを読み取り、JSON 配列のみで返してください。マークダウンなし。\n\n' +
      '年度: ' + lectureYear + '年（月日のみ記載の場合はこの年で補完）\n' +
      campusText + '\n\n' +
      '【重要】日付の省略記法を正しく展開してください:\n' +
      '- "7/15,30" → 7月15日と7月30日の2エントリ\n' +
      '- "8/1.6" や "8/1・6" → 8月1日と8月6日の2エントリ\n' +
      '- "7/15,30,8/1.6" → 7月15日・7月30日・8月1日・8月6日の4エントリ\n' +
      '- "7/15〜8/5 毎週水" → 期間内の毎週水曜日を個別エントリに展開\n' +
      '省略された日付は前の月を引き継ぐ。各日付を必ず別々のエントリとして出力すること。\n\n' +
      '【操作タイプの判別ルール】\n' +
      '各エントリに "op" フィールドを追加すること:\n' +
      '- "create"（デフォルト）: 注釈なしの通常エントリ → 新規追加\n' +
      '- "edit": 変更を示す記号・文言がある場合\n' +
      '  例: "7/17→18"（日付変更）、"数学→英語"（科目変更）、"10:00→14:00"（時刻変更）、"変更"の文字\n' +
      '  → "op":"edit" とし、変更前の値をメインフィールド(date,startTime等)に、変更後の値を "changes" オブジェクトに入れる\n' +
      '- "delete": 削除を示す記号・文言がある場合\n' +
      '  例: "7/17×"、取り消し線、"削除"の文字、"✕"マーク\n' +
      '  → "op":"delete" とし、削除対象の情報をメインフィールドに入れる\n\n' +
      '講師名・担当者名が記載されている場合は teacherName として抽出する。不明な場合は null とする。\n\n' +
      'createの場合:\n' +
      '{"op":"create","date":"YYYY-MM-DD","startTime":"HH:MM","durationMinutes":90,"subject":"科目またはnull","grade":"学年（小/中1/中2/中3/高1/高2/高3）またはnull","classLabel":"A/B/Cまたはnull","campusCode":"コードまたはnull","teacherName":"講師名またはnull"}\n' +
      'editの場合（変更前の値 + changesに変更後の値）:\n' +
      '{"op":"edit","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull","changes":{"date":"YYYY-MM-DD"}}\n' +
      'deleteの場合:\n' +
      '{"op":"delete","date":"YYYY-MM-DD","startTime":"HH:MM","subject":"科目","grade":"学年","campusCode":"コード","teacherName":"講師名またはnull"}\n\n' +
      '読み取れない項目はnullとする。授業時間が不明な場合はdurationMinutes:90とする。"op"が省略された場合は"create"として扱われる。\n\n' +
      '--- 日程テキスト ---\n' + scheduleText;

    var payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    };

    var response = fetchGeminiWithRetry_(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var json = JSON.parse(response.getContentText());
    if (!json.candidates || !json.candidates[0]) {
      return { success: false, error: 'AIからの応答がありませんでした' };
    }

    var text = json.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim();
    var entries = JSON.parse(text);

    if (!Array.isArray(entries)) {
      return { success: false, error: '日程データを読み取れませんでした' };
    }

    Logger.log('✓ parseLectureScheduleFromText: ' + entries.length + '件読み取り (year=' + lectureYear + ')');
    return { success: true, entries: entries };
  } catch (error) {
    Logger.log('❌ parseLectureScheduleFromText エラー: ' + error);
    return { success: false, error: error.toString() };
  }
}

/**
 * 会話履歴と修正コメントを踏まえて英語プロンプトを再生成する内部ヘルパー
 * @param {string} originalPromptJa 最初の日本語プロンプト
 * @param {Array} history 会話履歴 [{role:'user'|'ai', text:string}]
 * @param {string} newComment 最新の修正コメント
 * @return {string} 洗練された英語プロンプト
 */
function refineImagePromptWithHistory_(originalPromptJa, history, newComment) {
  var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

  // 過去の修正コメントを箇条書きにまとめる
  var historyText = '';
  history.forEach(function(h, i) {
    if (h.role === 'user') historyText += '  修正' + (i + 1) + ': ' + h.text + '\n';
  });

  var prompt = 'You are a professional image generation prompt engineer.\n' +
    'The user started with a Japanese image description and has made refinement requests.\n' +
    'Create an optimized English prompt for an AI image generator that incorporates ALL the changes.\n\n' +
    'Original Japanese description:\n' + originalPromptJa + '\n\n' +
    (historyText ? 'Previous refinement requests:\n' + historyText + '\n' : '') +
    'Latest refinement request (Japanese):\n' + newComment + '\n\n' +
    'Requirements:\n' +
    '- Output ONLY the English prompt text (no explanation, no JSON, no markdown)\n' +
    '- Incorporate all refinements cumulatively\n' +
    '- Make it detailed and descriptive for best image quality\n' +
    '- Include style keywords (e.g., photorealistic, vibrant colors, high resolution)\n' +
    '- Emphasize educational/academic atmosphere when appropriate\n' +
    '- Keep it under 200 words';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 }
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
    throw new Error(parseGeminiErrorMessage_(response));
  }

  var result = JSON.parse(response.getContentText());

  var parts = (result.candidates[0].content.parts || []);
  var textPart = parts.filter(function(p) { return !p.thought; }).pop();
  return textPart ? (textPart.text || '').trim() : '';
}

/**
 * 日本語プロンプトと修正履歴から、保存ファイル名とタグキーワードを生成する内部ヘルパー
 * @param {string} originalPromptJa 最初の日本語プロンプト
 * @param {Array} history 会話履歴 [{role:'user'|'ai', text:string}]（省略可）
 * @return {Object} { fileName: 'イラスト_走る男子学生', tags: 'イラスト、男子学生、走る、...' }
 */
function generateImageMetadata_(originalPromptJa, history) {
  var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
  if (!apiKey) throw new Error('Gemini APIキーが設定されていません');

  // 修正コメントをまとめる
  var refineText = '';
  if (history && history.length > 0) {
    var userComments = history.filter(function(h) { return h.role === 'user'; });
    if (userComments.length > 0) {
      refineText = '\n修正コメント:\n' + userComments.map(function(h, i) {
        return '  ' + (i + 1) + '. ' + h.text;
      }).join('\n');
    }
  }

  var prompt = '以下の画像の説明をもとに、ファイル名とタグキーワードを日本語で生成してください。\n\n' +
    '画像の説明:\n' + originalPromptJa + refineText + '\n\n' +
    '要件:\n' +
    '- fileName: 画像の内容を端的に表す日本語のファイル名（拡張子なし、スペースなし、アンダースコア区切り、20文字以内）\n' +
    '  例: イラスト_走る男子学生、写真風_桜と校舎、水彩_勉強する生徒たち\n' +
    '- tags: 画像を検索するのに役立つキーワードを読点（、）区切りで8〜12個\n' +
    '  例: イラスト、男子学生、走る、勢い、躍動感、水彩風、元気、疾走\n' +
    '- 修正コメントがある場合はその内容も反映したファイル名・タグにすること\n\n' +
    'JSON形式のみで返してください（説明文・マークダウン不要）:\n' +
    '{"fileName":"...","tags":"..."}';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.4,
      maxOutputTokens: 200,
      thinkingConfig: { thinkingBudget: 0 }
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
    throw new Error(parseGeminiErrorMessage_(response));
  }

  var result = JSON.parse(response.getContentText());

  var parts = (result.candidates[0].content.parts || []);
  var textPart = parts.filter(function(p) { return !p.thought; }).pop();
  var rawText = textPart ? (textPart.text || '').trim() : '';
  var metadata = safeJsonParse_(rawText, {});

  // ファイル名の安全化（Drive で使えない文字を除去）
  var safeName = (metadata.fileName || '').replace(/[\/\\:*?"<>|]/g, '').trim();
  return {
    fileName: safeName || '',
    tags: (metadata.tags || '').trim()
  };
}

/**
 * Imagen 4.0 Ultra で画像を生成し、Drive の assets/flyer フォルダに保存する
 * 日本語プロンプトを受け取り、Gemini Flash で英語に翻訳してから Imagen に渡す
 * 会話履歴と修正コメントがある場合は、それらを踏まえたプロンプトで再生成する
 * @aiCallable
 * @param {string} japanesePrompt 日本語の画像イメージ説明
 * @param {string} aspectRatio アスペクト比（'3:4' / '4:3' / '1:1' / '9:16' / '16:9'）
 * @param {string} [conversationHistoryJson] 会話履歴JSON（省略可）[{role:'user'|'ai',text:string}]
 * @return {Object} { success, fileId, fileName, base64, mimeType, englishPrompt } または { success: false, error }
 */
function generateImageWithImagen(japanesePrompt, aspectRatio, conversationHistoryJson) {
  try {
    if (!japanesePrompt || !japanesePrompt.trim()) {
      return { success: false, error: 'どんな画像を作りたいか説明を入力してください' };
    }

    var apiKey = getProperty(PROP_KEYS.GEMINI_API_KEY);
    if (!apiKey) return { success: false, error: 'Gemini APIキーが設定されていません' };

    // 会話履歴を解析
    var conversationHistory = safeJsonParse_(conversationHistoryJson, []);

    // 1. 英語プロンプト生成（修正コメントありの場合は履歴を反映）
    var englishPrompt;
    if (conversationHistory.length > 0) {
      // 修正モード：最後の user メッセージが今回の修正コメント
      var latestComment = conversationHistory[conversationHistory.length - 1].text || '';
      var previousHistory = conversationHistory.slice(0, -1);
      englishPrompt = refineImagePromptWithHistory_(japanesePrompt, previousHistory, latestComment);
    } else {
      englishPrompt = translateToImagePrompt_(japanesePrompt);
    }

    if (!englishPrompt) {
      return { success: false, error: 'プロンプトの翻訳に失敗しました。もう一度お試しください。' };
    }

    // 2. Imagen 4.0 Ultra で画像生成
    var validRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
    if (validRatios.indexOf(aspectRatio) === -1) aspectRatio = '3:4';

    var imagenUrl = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=' + apiKey;
    var imagenPayload = {
      instances: [{ prompt: englishPrompt }],
      parameters: {
        numberOfImages: 1,
        aspectRatio: aspectRatio,
        personGeneration: 'allow_all'
      }
    };
    var imagenOptions = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(imagenPayload),
      muteHttpExceptions: true
    };

    var imagenResponse = fetchGeminiWithRetry_(imagenUrl, imagenOptions);

    if (imagenResponse.getResponseCode() !== 200) {
      return { success: false, error: parseGeminiErrorMessage_(imagenResponse) };
    }

    var imagenResult = JSON.parse(imagenResponse.getContentText());

    // usageMetadata があればログ

    // 3. レスポンスから画像 base64 を取得
    if (!imagenResult.predictions || imagenResult.predictions.length === 0) {
      return { success: false, error: '画像を生成できませんでした。安全フィルターにより拒否された可能性があります。説明を変えてもう一度お試しください。' };
    }

    var prediction = imagenResult.predictions[0];
    var base64Data = prediction.bytesBase64Encoded;
    var mimeType = prediction.mimeType || 'image/png';

    if (!base64Data) {
      return { success: false, error: '画像データが空でした。もう一度お試しください。' };
    }

    // 4. Drive の assets/flyer フォルダに保存
    var folderId = getProperty(PROP_KEYS.APP_FOLDER_ID);
    if (!folderId) return { success: false, error: 'APP_FOLDER_ID が設定されていません' };

    var rootFolder = DriveApp.getFolderById(folderId);
    var assetsIter = rootFolder.getFoldersByName('assets');
    var assetsFolder = assetsIter.hasNext() ? assetsIter.next() : rootFolder.createFolder('assets');
    var flyerIter = assetsFolder.getFoldersByName('flyer');
    var flyerFolder = flyerIter.hasNext() ? flyerIter.next() : assetsFolder.createFolder('flyer');

    // 4b. ファイル名とタグをAIで自動生成（失敗してもフォールバックで継続）
    var now = new Date();
    var timestamp = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd_HHmmss');
    var ext = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    var autoFileName = '';
    var autoTags = '';
    try {
      var metadata = generateImageMetadata_(japanesePrompt, conversationHistory);
      autoFileName = metadata.fileName || '';
      autoTags = metadata.tags || '';
    } catch (metaErr) {
      Logger.log('⚠ メタデータ生成スキップ: ' + metaErr);
    }
    var fileName = (autoFileName ? autoFileName : ('AI生成_' + timestamp)) + ext;

    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = flyerFolder.createFile(blob);

    // 5. 画像タグを自動生成したキーワードで保存（取得失敗時は日本語プロンプトをフォールバック）
    saveFlyerImageTags(file.getId(), autoTags || japanesePrompt);


    return {
      success: true,
      fileId: file.getId(),
      fileName: fileName,
      base64: base64Data,
      mimeType: mimeType,
      englishPrompt: englishPrompt
    };
  } catch (error) {
    Logger.log('❌ generateImageWithImagenエラー: ' + error);
    return { success: false, error: error.toString() };
  }
}
