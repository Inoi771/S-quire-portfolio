# S-quire 全関数リスト

> このファイルは CLAUDE.md から分離した関数リファレンスです。
> 既存関数の確認・修正・新関数追加時に Claude が自動で参照します。
> 関数を追加・削除・変更した際は必ずこのファイルも更新すること。

---

### index.html 主要 JavaScript 関数（セクション番号付き）

**【1】グローバル変数**
- `allSchedules`, `currentSettings`, `selectedStudentId`, `currentStudentList` など

**【2】初期化**
- `initializeApp()` — `getSettings()` と `getScheduleData()` を並列で呼び出し
- `setupTabNavigation()`, `checkAdminTabVisibility()`
- `showAccountBlockedScreen(newEmail)` — 引き継ぎ済みアカウントでアクセスした場合にブロック画面を表示
- `appConfirm(message)` — ブラウザ標準 `confirm()` の代替。カスタムモーダルを表示し `Promise<boolean>` を返す（URL非表示）
- `appAlert(message)` — ブラウザ標準 `alert()` の代替。カスタムモーダルを表示し `Promise<void>` を返す（URL非表示）
- `showToast(msg, type)` — 画面下部にトースト通知を一時表示する（type: 'success' / 'error'。2.5秒後に自動消去）
- `applyThemeColor(color)` — CSS変数 `--theme-color` / `--theme-color-light` を更新してアプリ全体の色を変える
- `buildCampusOptions(campuses, placeholder)` — **【必須】** 校舎 `{code,name}[]` から `<option>` HTML を生成。配属校舎（preferredCampuses）が先頭に来る。新たに校舎ドロップダウンを作るときは必ずこれを使う
- `rebuildCampusDropdowns()` — 既存の校舎ドロップダウンをすべて `buildCampusOptions()` で再描画（配属校舎変更後に必ず呼ぶ）
- `renderPreferredCampusCheckboxes()` — プロフィール欄の「配属校舎」チェックボックスを描画
- `onPreferredCampusChange()` — チェックボックス変更時の自動保存ハンドラー（保存後に `rebuildCampusDropdowns()` を呼ぶ）

**【3】タブ制御**
- `switchTab(tabName)` — タブ切り替え。各タブ固有の初期化も行う
- `switchSubTab(event, subTabName)` — 成績管理のサブタブ切り替え（`event` は必須引数。`data-subtab` 属性でクローンボタンのアクティブ状態も同期）
- `initSubTabLoop(containerId)` — サブタブバーの無限ループスクロールを初期化（汎用）。ボタンを前後にクローンし、端に達したら本物の位置にジャンプ。対象: `gradesSubTabs`・`lecSubTabNav`・`univSubTabs`・`adminSubTabs`

**【4】スケジュール関連**
- `onScheduleDataLoaded()`, `renderCalendar()`
- `classifyEvent(event)` — イベントの種類（juku/junior/high）を判定して返す
- `buildMonthHTML(year, month)` — 指定月の全日を4列テーブル（日付|塾|中学校|高校）で生成。全タイプのイベント+仮想イベントを列ごとに分類表示
- `buildMonthDrumHTML()` — 月ドラムピッカーHTML生成（前後18ヶ月）
- `initMonthDrum()` — 月ドラムピッカーのスクロール動作初期化
- `changeMonth(delta)` — 月を前後に移動
- `getClosedDays(fiscalYear)` — Excelの条件付き書式ロジックを再現。年度の休校日（日曜以外の特定日）をdateKeyオブジェクトで返す
- `computePeriodBorders(fiscalYear, closedDays)` — 授業日24日ごとの期間枠線（左上・右下）を計算して返す
- `getReportDay(year, month)` — ○回数報告書提出日。月ごとの固定日付（日曜なら前日）
- `getMeetingDay(year, month)` — □全体ミーティング日。4〜6月は第2金曜（1日が金曜なら第3金曜）。7〜3月（8月除く）は月別基準日を含む直前の金曜日（7月=9日基準, 9月=7日基準, 10月=9日基準, 11月=19日基準, 12月=10日基準, 1月=20日基準, 2月=7日基準, 3月=14日基準）
- `getDebitDays(year, month)` — ★引落データ送信日 / △メール送信日を返す `{debit, email}`
- `renderFiscalMonth(year, month, closedDays, periodBorders)` — 月曜始まりでカレンダーHTML生成。closedDaysで休校日グレー表示、periodBordersで期間枠線表示
- `generateFiscalCalendar()` — HP用（薄いグレー・カラー記号）で年間カレンダーを画面表示
- `downloadFiscalCalendarPDF()` — 室長用（濃いグレー・モノクロ記号）でPDF出力（print-modeクラスで切替）
- `loadPricingTable()` — 料金表データをバックエンドから読み込んで表示
- `computeRowSpans(rows)` — 1列目のセル結合（rowspan）を計算。空文字列が続く行を直前の非空セルに吸収
- `renderPricingTable(data)` — 料金表をHTMLテーブルでレンダリング（閲覧モード/編集モード対応。閲覧モードでは1列目をrowspanで結合）
- `togglePricingEditMode()` — 管理者用編集モードの切り替え（保存も兼ねる）
- `downloadPricingPDF(mode)` — 料金表をPDFでダウンロードまたは印刷（A4に収まらない場合は「講習料金」セクションで2ページ分割）
- `handlePdfError(e, printWindow, restoreStyles)` — PDF生成エラー時の共通処理
- `finalizePdf(mode, canvases, printWindow, restoreStyles)` — キャプチャ済みcanvas配列からPDF/印刷を実行
- `isWeekendOrHoliday(date)` — 土日・祝日判定。`googleCalendarHolidays` が取得済みならGoogleカレンダーデータを優先、未取得なら `getJapaneseHolidays()` アルゴリズムにフォールバック
- `getNextWeekday(date)` — 指定日以降（含む）で最初の平日を返す
- `getFirstWednesdayOnOrAfter(date)` — 指定日以降（含む）で最初の水曜日を返す
- `getComputedBasicTestDate(academicYear, testNum)` — 基礎学力テストの自動計算日（第3回は翌年1月8日の次の平日。ただし1月8日が土日祝日なら次の次の平日）
- `getChuu12BasicTestDate(academicYear)` — 中1・中2対象の基礎学力テスト日（翌年2月の第2水曜日）を返す
- `getBasicTestEventsForMonth(calYear, calMonth)` — 指定カレンダー月に含まれる基礎学力テスト仮想イベントを返す（上書き優先。中1・中2対象の回数なしイベントも含む・中1・中2キー: `{academicYear}-chuu12`）
- `countBackLecDeadline_(startDate, count, closedDays)` — 開始日の前日からcount日前を出し、その日が日曜・休校日なら前の営業日に調整して返す（講習日程締切日計算用内部ヘルパー）
- `getLectureDeadlineEventsForMonth(calYear, calMonth)` — 指定カレンダー月に含まれる講習日程締切仮想イベントを返す（`lectureDeadlineOverrides` で手動上書き優先、なければ `countBackLecDeadline_` で自動計算。春期・夏期・冬期は42日前（28+14）、その他は28日前。塾列に表示）

**【5】設定管理**
- `onSettingsLoaded(settings)` — ロゴ・ファビコン設定、ユーザー情報表示
- `saveSettings()`, `updateApiKeyStatus()`
- `exportSettings()` — 引き継ぎコード発行ボタンのハンドラー。`exportUserSettings()` を呼び出す
- `copyTransferCode()` — 引き継ぎコードをクリップボードにコピー
- `importSettings()` — 引き継ぎコード入力→復元ボタンのハンドラー。`importUserSettings()` を呼び出す

**【6】プロフィール管理**
- `loadProfileInfo()`, `saveProfile()`

**【7・8】成績管理**
- `loadGradesConfig()`, `loadStudentList()`
- `filterStudents()`, `selectStudentFromCard()` — ふりがなインクリメンタル検索
- `submitStudentForm()`, `submitGradeForm()`
- `showOcrModal()`, `handleOcrSubmit()`
- `updateGradeTemplateBtnState()` — 校舎・学年・テスト名が全選択済みかチェックしてテンプレートボタンの有効/無効を切り替える
- `toggleGradeTemplatePdfMenu()` / `closeGradeTemplatePdfMenu()` — テンプレートPDFドロップダウンメニューの表示切替
- `generateGradeTemplate(mode)` — 選択校舎・学年・テスト名で生徒一覧を取得し、成績入力テンプレートを新ウィンドウで開く（mode='print'で自動印刷、'download'で手動）
- `buildGradeTemplateHtml(students, year, testName, campusName, gradeName, mode)` — 成績入力テンプレートHTML生成（A4横向き・氏名左端・「折って隠す」注意書き付き）
- `onScoreGradeChanged()` — 成績入力タブの学年ドロップダウン変更時に校舎＋学年で生徒一覧を取得
- `initGradesList()` — 一覧表タブのフィルター選択肢を初期化（campusData/schoolsDataから生成）
- `onListCampusAllChange()` — 「全校舎」チェックボックスで全個別校舎を一括切り替え
- `onListCampusChange()` — 個別校舎チェックボックス変更時に「全校舎」チェックを更新
- `loadGradesList()` — バックエンドから `getStudentListWithGrades` を呼び出してテーブル描画
- `getFilteredListData()` — 選択校舎・志望校フィルターを適用したデータを返す
- `renderGradesTable()` — 一覧表テーブルをHTMLで描画（ソート列に▲▼を表示）
- `sortGradesList(col)` — 列ヘッダークリック時のソート処理（同列クリックで昇順/降順切替）
- `initGradesAnalysis()` — 分析タブ初期化（テスト名ドロップダウン構築）
- `loadGradeAnalysis()` — 分析タブ：保存済み分析の有無を確認して表示/生成ボタンを出す
- `generateAndDisplayAnalysis()` — 分析タブ：AIで分析生成して表示
- `renderAnalysisResult(analysis, generatedAt, testName)` — 分析タブ：分析結果HTML描画（テキスト＋CSSバーチャート）
- `initGradesReport()` — 成績表タブ初期化（校舎・テスト名・生徒ドロップダウン設定）
- `onReportCampusChanged()` — 成績表：校舎変更時にリセット
- `onReportTestChanged()` — 成績表：テスト名変更時に生徒リスト取得（`getStudentsWithGradesByTest` を呼び出し）
- `getDisplayTestNames(selectedTestName, allTestNames)` — 選択テスト名に対して表示すべきテスト名リストを返す（基礎学力テストは累積表示）
- `loadStudentReport()` — 成績表：生徒選択時にレポートデータ取得（`getDisplayTestNames` で表示テストをフィルタ）
- `renderReportCard(student, grades, testNames, schoolAverages)` — 成績表：生徒情報＋全テスト成績テーブル描画（学校平均との差分色分け付き）
- `printReportCard()` — 成績表：印刷用ウィンドウを開く

**【進学先タブ】** (`js-grades-placement.html`)
- `initGradesPlacement()` — 進学先サブタブ初期化（校舎チェックボックスを campusData から生成）
- `onPlacementCampusAllChange()` — 「全校舎」チェックボックス変更時：全個別校舎チェックを同期
- `onPlacementCampusChange()` — 個別校舎チェックボックス変更時：「全校舎」チェックを更新
- `loadGradesPlacement()` — 「表示する」ボタン：2月以降チェック → `getStudentPlacementData` 呼び出し → テーブル描画
- `buildPlacementSchoolFilter_()` — 取得データから進学先絞り込みドロップダウンを動的構築（内部）
- `getPlacementFilteredData_()` — 校舎・進学先フィルターを適用したデータを返す（内部）
- `getPlacementSortIcon_(col)` — ソートアイコンHTML生成（内部）
- `sortPlacementData(col)` — 列ヘッダークリック時のソート処理（同列クリックで昇順/降順切替）
- `renderPlacementTable_()` — フィルター済みデータをHTMLテーブルとして描画（内部）

**【講習管理タブ】**
- `initLecturesTab()` — `switchTab('lectures')` から呼ばれる初期化。`getLecturePeriods()` をロードし年度セレクトを構築
- `buildLectureYearSelect()` — lecturePeriods から年度一覧を構築してセレクトを描画
- `onLectureYearChange()` — 年度変更時ハンドラー
- `onLectureChange()` — 講習変更時ハンドラー（開始週にリセット）
- `buildLectureNameSelect(fy)` — 指定年度の講習セレクトを構築
- `updateLecturePeriodLabel()` — 期間ラベル（YYYY/MM/DD 〜 YYYY/MM/DD）を更新
- `switchLectureSubTab(event, name)` — `.lecture-sub-content` / `.lecture-sub-tab` にスコープしたサブタブ切り替え
- `initLecturesSchedule()` — 日程作成サブタブ初期化（校舎チェックボックス構築）
- `buildLectureCampusCheckboxes()` — preferredCampuses が先にチェック済みで校舎チェックボックスを生成
- `onLecCampusAllChange()` — 全校舎チェックボックス変更ハンドラー
- `onLecCampusChange()` — 個別校舎チェックボックス変更ハンドラー
- `showLectureCampusTabs()` — 表示ボタン押下時：チェック済み校舎タブ＋グリッドを構築
- `switchLectureCampusTab(campusCode)` — 校舎タブ切り替え（週位置・スクロール位置を維持）
- `renderLectureWeekGrid(campusCode)` — 週間タイムグリッド描画（0〜24時・10分ごと・開始/終了予定日バッジ付き）
- `navigateLectureWeek(dir)` — ±1週移動（範囲制限なし）
- `updateLectureWeekLabel()` — 週ラベル（YYYY/MM/DD〜YYYY/MM/DD）を更新
- `getLectureWeekMonday(dateStr)` — 指定日が属する週の月曜日（Dateオブジェクト）を返すヘルパー
- `formatLecDate(d)` — Date → YYYY/MM/DD(曜) 形式
- `formatDateKey(d)` — Date → YYYY-MM-DD 形式（開始/終了日との比較用）
- `isSpringLecture()` — 現在選択中の講習名に「春期」が含まれるか判定
- `buildLecSubjectButtons()` — selectedSubjects から教科ボタンを構築。1教科なら自動選択
- `buildLecGradeButtons()` — 学年ボタンを構築（春期なら「新」付与）
- `applyLecBtnActive(btn, active)` — ボタンのアクティブスタイルを適用・解除
- `toggleLecSubjectBtn(subject)` — 教科ボタン排他選択（同ボタン再押しで解除）
- `toggleLecGradeBtn(grade)` — 学年ボタン排他選択（同ボタン再押しで解除）
- `timeToSlot(timeStr)` — HH:MM → スロット番号変換
- `slotToTimeStr(slot)` — スロット番号 → HH:MM変換
- `getEntryColors(subject, grade)` — 教科・学年から HSL カラーセットを返す（solid/bg/text の3値。5教科色相×7学年明度）
- `getTeacherColor(email)` — 先生ごとの色を取得（未割当なら自動割当）
- `updateLecToolbarState()` — 削除ボタンの有効/無効を更新
- `updateSaveButtonLabel()` — 保存ボタンの件数バッジを更新
- `showLecStatusMsg(msg, color)` — ステータスメッセージを一時表示
- `computeOverlapGroups(entries)` — 同日内の重なるエントリのグループ（幅/位置計算用）を返す
- `renderLecEntries(campusCode)` — エントリを絶対配置で描画
- `onLecColClick(event, date)` — グリッド列クリック時：新規作成 or 移動
- `onEntryClick(event, entryId)` — エントリクリック時：選択 or 解除（所有者チェック付き：管理者以外は自分のエントリのみ選択可能）
- `getDefaultGradeSettingsJS(lectureName, grade)` — 講習名・学年コードからデフォルトのコマ設定を返す（フロントエンド版。duration: スロット数、count: 回数。基礎学力テスト対策・入試直前は中3のみ有効、他学年は0）
- `getLecGradeSettings(grade)` — 現在選択中の講習の学年別設定を取得（gradeSettings があればそちらを優先、なければ名前ベースのデフォルト）
- `createLecEntry(date, startSlot)` — 選択中の教科・学年でエントリを新規作成（学年ごとのコマ時間を自動適用）
- `createWeeklyLecEntries(date, startSlot)` — 「毎週」チェック時の一括作成：同じ曜日・時刻で count 回分のエントリを毎週作成（休校日を自動スキップ）
- `moveLecEntry(entryId, date, startSlot)` — 選択中エントリを指定日時に移動
- `deleteLecEntry()` — 選択中エントリを削除
- `refreshLecEntries()` — バックエンドからエントリを再取得して描画
- `saveLecEntries()` — 現在の校舎のエントリをバックエンドに保存
- `initLecturesAdmin()` — 管理タブ：講習設定パネル初期化（年度セレクト構築→一覧ロード）
- `buildAdminLecYearSelect()` — 管理タブ：年度セレクトを構築（現在FYと翌FY）
- `loadLecturePeriodsAdmin()` — 管理タブ：選択年度の講習期間一覧描画（6種固定・削除なし・「日程を編集」「学年別設定」ボタン付き）
- `editLectureDatesAdmin(lectureId, currentStart, currentEnd)` — 管理タブ：日程編集インラインUIを表示
- `saveLectureDatesAdmin(fiscalYear, typeId)` — 管理タブ：日程上書き保存
- `resetLectureDatesAdmin(fiscalYear, typeId)` — 管理タブ：日程をデフォルト（自動計算）に戻す
- `showLecGradeSettingsPanel(lectureId)` — 学年別設定パネルを表示（コマ時間・回数の入力テーブル）
- `saveLecGradeSettingsAdmin(lectureId)` — 学年別設定パネルの入力値をバックエンドに保存
- `showLecPricingPanel(typeId)` — 講習別料金設定パネルを表示（バックエンドから料金データを取得して描画）
- `renderLecPricingPanel_(typeId, typeName, rows)` — 料金設定パネルの中身を描画（テーブル＋行追加/削除＋保存ボタン）
- `buildLecPricingRowHtml_(idx, row)` — 料金設定の1行分のHTML生成（税抜き入力・税込み自動計算表示）
- `updateLecPricingTax_(input)` — 税抜き金額入力時に税込み表示を自動更新するハンドラー
- `addLecPricingRow_(typeId)` — 料金設定テーブルに空の行を追加
- `removeLecPricingRow_(btn)` — 料金設定テーブルから行を削除（最低1行は維持）
- `saveLecPricingAdmin_(typeId)` — 料金設定をバックエンドに保存

**【配布物サブタブ】**
- `initLecturesMaterials()` — 内部配布物サブタブ初期化（校舎セレクト・学年別挨拶文textarea構築、料金表データキャッシュ取得）
- `buildMatCampusSelect()` — `buildCampusOptions()` を使って校舎セレクトを構築（配属校舎が先頭）
- `buildMatGreetingTextareas_()` — `MAT_GRADE_GROUPS_` をループして `#mat-greetings-container` に学年別textareaを動的生成（既に子要素があればスキップ）
- `getMatGreeting_(gradeKey)` — `mat-greeting-{key}` textareaの値を返すヘルパー（未生成時はデフォルト文にフォールバック）
- `generateMaterialsPDF(mode)` — 学年ページを逐次 html2canvas → canvases[] に積んで `finalizeMaterialsPdf_` で出力（mode='download'/'print'）
- `finalizeMaterialsPdf_(mode, canvases, printWindow, docTitle)` — 配布物PDF/印刷出力（`finalizePdf` の配布物専用版。`docTitle` 引数でタイトルを動的指定）
- `buildMaterialsDocHTML(entries, campusName, campusCode, fy, lecName, typeData, isSpring)` — 学年グループをループして学年ごとのページHTMLを連結（データなし学年はスキップ）
- `buildMatOnePage_(gradeGroup, entries, campusName, campusCode, lecName, greeting, typeData, isSpring)` — 1学年分のA4ページHTML生成（ヘッダー・タイトル・挨拶文・敬具・日程表・料金枠・切り取り線・申込欄）
- `buildMatScheduleTable_(entries)` — 科目×開始時刻×コマ数でグルーピングして日付を集約した3列（科目/日程/時間）テーブルを生成
- `buildMatApplicationSlip_(subjects, campusName, gradeGroup, lecName)` — 切り取り後の申込欄HTML生成（中学生/小学生:科目に○形式、高校生:希望回数・日程記入形式）
- `buildMatLecPricingTable_(rows, campusCode, isSpring)` — 講習別料金データからHTMLテーブルを生成（勝瑞校高校生の特別料金対応・連続学年グループ化）
- `buildMatGradeSettingsTable(gradeSettings)` — 料金表データがない場合のフォールバック：gradeSettings から時間・回数のみの表を生成
- `matFormatDate_(dateStr)` — YYYY-MM-DD → "M/D(曜)" 形式に変換
- `matCalcEndTime_(startTime, durationSlots)` — 開始時刻とスロット数から終了時刻を計算（1スロット=10分）
- `escapeHtmlMat_(str)` — HTML特殊文字をエスケープ（配布物内部用）
- `saveMatPDFToDrive()` — 「Driveに保存」ボタンのハンドラー。学年ページを逐次描画してjsPDF多ページ保存し `saveDistributionFile` を呼び出す
- `loadDistributionFilesList()` — Drive保存済みファイル一覧を `listDistributionFiles` から取得して `#mat-files-list` に描画する
- `renderDistributionFilesList(files)` — 保存済みファイル一覧HTMLを生成して `#mat-files-list` に注入する（「開く」リンク・「削除」ボタン付き）
- `deleteDistributionFileUI(fileId)` — 確認ダイアログ後に `deleteDistributionFile` を呼び出してファイルを削除し、一覧を再取得する

**【外部チラシサブタブ（AI生成方式）】** (`js-lectures-flyer.html`)
- `TYPE_TEMPLATE_MAP` — 講習typeId → 季節キーのマッピング（seasonKey算出・画像自動選択に使用）
- `showFlyerHelpModal()` — チラシ操作方法モーダルを表示
- `closeFlyerHelpModal()` — チラシ操作方法モーダルを閉じる
- `initFlyerAi()` — AIチラシサブタブ初期化（講習バッジ更新・校舎セレクト・画像ロード）
- `buildFlyerAiCampusSelect()` — `buildCampusOptions()` + 先頭に「📋 共通」option を追加
- `onFlyerAiCampusChange()` — 校舎変更→保存データをロード→プレビュー・チャット復元
- `sendFlyerAiMessage()` — チャット入力を送信→編集モード同期→コンテキスト収集→`seasonKey` 算出→`generateFlyerWithAI` 呼び出し
- `collectFlyerAiContext_(campusCode, callback)` — チェックボックスに応じて講習情報・日程・料金データをマークダウンテーブル形式で収集（季節テーマはバックエンド側で処理）
- `onFlyerAiResponse_(result)` — Geminiレスポンス処理→画像プレースホルダー置換→プレビュー注入→チャット更新
- `injectFlyerImage_(html)` — `{{IMAGE_PLACEHOLDER}}` を実base64に置換
- `renderFlyerAiChat_(role, text)` — チャットバブル追加（user=右寄せ、ai=左寄せ、error=赤）
- `resizeFlyerAiPreview()` — プレビューをコンテナ幅に合わせてスケーリング（794px→scale係数で transform）
- `saveFlyerAiUI()` — 編集モード同期→HTML＋会話履歴をバックエンドに保存
- `clearFlyerAiChat()` — チャット履歴・プレビューをリセット（確認ダイアログ付き）
- `toggleFlyerEditMode()` — 直接編集モードのON/OFF切り替え
- `enableFlyerEditMode_()` — プレビュー内テキスト要素に `contenteditable` 設定＋ホバー枠線
- `disableFlyerEditMode_()` — `contenteditable` 解除＋変更をHTMLに同期
- `syncFlyerEdits_()` — プレビューDOM → `flyerAiCurrentHtml` に同期（contenteditable属性をstrip）
- `showFlyerEditToolbar_(el)` / `hideFlyerEditToolbar_()` — フローティングツールバーの表示/非表示
- `flyerEditFontSize_(delta)` — フォントサイズ変更
- `flyerEditBold_()` — 太字トグル
- `flyerEditColor_(color)` — テキスト色変更
- `hasDirectText_(el)` — 要素が直接テキストを含むか判定するヘルパー
- `loadFlyerImageList()` — Drive assets/flyer フォルダから画像一覧を取得してセレクトを構築
- `uploadFlyerImageUI()` — 画像ファイルをFileReaderでbase64変換してバックエンドにアップロード
- `deleteFlyerImageUI()` — 選択中の画像を確認ダイアログ後に削除してリストを再取得
- `onFlyerImageChange()` — 画像選択変更時：base64プリロード・プレビュー表示・削除ボタン連動・タグ入力欄更新
- `autoSelectFlyerImage_(seasonKey, callback)` — 画像未選択時に季節キーワード（`FLYER_SEASON_KEYWORDS`）で画像タグをスコアリングし最適な画像を自動選択してbase64をロード。選択済みならスキップ
- `saveFlyerImageTagsUI()` — 画像の説明タグをバックエンドに保存してキャッシュ更新
- `generateFlyerAiPDF()` — 編集モード同期→プレビューHTMLからhtml2canvas→jsPDF→A4 PDF出力（トンボ対応）
- `outputFlyerPDF_(canvases, fileName, withTombo)` — canvas配列からjsPDF出力（トンボ対応）
- `addFlyerCropMarks_(pdf, ox, oy, w, h)` — PDFにトンボ（仕上がり線）を描画

**【画像生成サブタブ】** (`js-lectures-imagen.html`)
- `initImagenTab()` — 画像生成サブタブ初期化（初回のみ履歴をロード）
- `selectImagenRatio(btn)` — アスペクト比ボタンの選択切り替え（縦長/横長/正方形）
- `generateImagenImage()` — 画像生成を実行（`generateImageWithImagen` を呼び出し）
- `showImagenStatus(msg, bgColor, textColor)` — ステータスメッセージを表示
- `loadImagenHistory()` — チラシ用画像フォルダの画像一覧を読み込んで履歴表示
- `loadImagenThumbnail_(fileId)` — サムネイル画像を非同期で読み込む
- `previewImagenHistoryItem(fileId, fileName, tags)` — 履歴アイテムをクリックしてプレビュー表示
- `escapeHtmlImagen_(str)` — HTML特殊文字をエスケープ（画像生成タブ用）

**【9】AI アシスタント**
- `sendAiMessage()` — `requestAIAssistant()` を呼び出す
- `handleAiResponse()`, `renderChatBubble()`
- `toggleVoiceInput()` — マイクボタンの ON/OFF 制御
- `checkMicPermissionAndStart()` — マイク権限を事前確認し、拒否なら案内モーダルを表示して false を返す
- `startVoiceRecognition()` — 実際の音声認識セッション開始
- `showMicPermissionModal()` — OS/ブラウザ別（PC / Android / iPhone）のマイク許可手順モーダルを表示

**【10】Admin**
- `loadScriptProperties()`, `loadSheetsList()`, `exploreDriveFolder()`
- `initStudentAnalysisPanel()` — 生徒別AI分析パネルの年度・テスト名ドロップダウン初期化
- `generateAllAnalysesAdmin()` — テスト全体分析＋生徒別AI分析を1回のAPIコールで一括生成するボタンハンドラー（確認ダイアログ付き）

**【講習日程締切管理】** (`js-admin-lec-deadline.html`)
- `initLectureDeadlineDatesAdmin()` — 講習日程締切管理セクションの年度セレクタ初期化・データ読み込み
- `loadLectureDeadlineDates()` — バックエンドから上書き設定を取得してテーブル描画
- `renderLectureDeadlineDateTable(overrides, yr)` — 各講習の自動計算日 / 上書き日 / 変更・リセットボタンを描画
- `saveLectureDeadlineDate(lectureId)` — 上書き保存（`setLectureDeadlineOverride` を呼び出し）
- `resetLectureDeadlineDate(lectureId)` — 上書き削除（`deleteLectureDeadlineOverride` を呼び出し・自動計算に戻す）

**【チャットボット管理】** (`js-admin-chatbot.html`)
- `initChatbotAdmin()` — チャットボット管理サブタブ初期化（ナレッジベースエントリ取得→描画）
- `renderKbEntries(entries)` — カテゴリ別にグループ化してエントリ一覧を描画
- `showKbEntryForm()` — 新規追加フォーム表示
- `editKbEntry(entryId)` — 編集フォーム表示（既存エントリ）
- `hideKbForm()` — フォームを閉じる
- `onKbCategorySelectChange()` — カテゴリセレクト変更時ハンドラー（自由入力切替）
- `saveKbEntry()` — エントリ保存（追加/更新）
- `deleteKbEntry(entryId)` — エントリ削除（確認ダイアログ付き）

**【AIアシスタント アクション実行】** (`js-ai-actions.html`)
- `dispatchAiAction_(result)` — app_actionのメインディスパッチャー。handleAIWidgetResponseから呼ばれる
- `checkPendingAiAction_(userMessage)` — 確認待ちアクションがあれば「はい/いいえ」をローカル処理。sendAIWidgetMessageから呼ばれる
- `executeConfirmedAiAction_(action, params, thinkingId)` — 確認済み書き込みアクションをバックエンドで実行
- `navigateToSchedule_fromAI(year, month)` — 予定タブへ自動ナビゲート・指定月に移動
- `navigateToTab_fromAI(tab, subTab)` — 任意のタブ・サブタブへ自動ナビゲート
- `triggerAdminSubTabInit_(tabName)` — 管理サブタブの初期化関数をトリガーする内部ヘルパー
- `navigateToGradeAnalysis_fromAI(year, testName)` — 分析タブへ自動ナビゲート・テスト名選択・分析ロード
- `navigateToLectures_fromAI(lectureId, campusCode)` — 講習管理タブへ自動ナビゲート・講習選択・校舎チェック

---

---

## 10. 全関数リスト（code.js）

### セクション2: 認証・ロール管理
- `getProperty(key)` — スクリプトプロパティ取得
- `setProperty(key, value)` — スクリプトプロパティ設定
- `getAllProperties()` — 全プロパティ取得
- `isAdmin()` — Admin 判定
- `getCurrentUserEmail()` — 現在のユーザーメール取得
- `getUserRoleInfo()` — ロール情報取得（`@aiCallable` ではない）
- `getDisplayName(userEmail)` — メールから表示名を生成
- `getAdminEmails()` — Admin メール一覧（Admin のみ）
- `addAdminEmail(newEmail)` — Admin 追加（Admin のみ）
- `removeAdminEmail(emailToRemove)` — Admin 削除（自分自身は不可、最低1人保持）
- `getSetupStatus()` — 初回セットアップが必要かを返す（`isFirstSetup`, `currentUserEmail`, `hasAppFolder`）。ADMIN_EMAILS が空なら `isFirstSetup: true`
- `initializeFirstAdmin()` — ADMIN_EMAILS が空の場合のみ現在ユーザーを管理者として登録する（2回目以降は拒否）
- `getAllowedUsers()` — Driveフォルダの共有ユーザー一覧を取得（Admin のみ。ACCESS_FOLDER_ID 優先）
- `addUserAccess(email)` — ユーザーにアプリアクセスを付与（Admin のみ。DriveフォルダにEditor追加）
- `removeUserAccess(email)` — ユーザーのアプリアクセスを削除（Admin のみ。オーナーと自分自身は削除不可）
- `createAccessDeniedHtml(email)` — アクセス拒否ページのHTMLを生成

### セクション3: Web App エントリーポイント
- `doGet()` — index.html を配信
- `getAppMetadata()` — アプリ名・バージョン情報

### セクション4: スケジュール管理
- `getFolderByName(parentFolder, folderName)` — フォルダ取得ヘルパー
- `getFileByName(parentFolder, fileName)` — ファイル取得ヘルパー
- `getScheduleFolder()` — 月間スケジュールフォルダ取得
- `getScheduleData()` — `@aiCallable` 全スケジュール取得
- `getScheduleDropdownData()` — `@aiCallable` フォーム用ドロップダウン
- `addScheduleEntry(schoolName, eventName, dateStr, details)` — `@aiCallable` 予定追加
- `updateSchedules()` — 全年度フォルダをスキャンして `autoImportAllSchedules()` を呼ぶ
- `extractTextFromPDF(file)` — PDF → テキスト（Google Docs OCR）
- `extractEventsFromText(schoolName, text, year)` — テキスト → イベント配列（Gemini API）

### セクション5: 設定管理
- `getSettings()` — `@aiCallable` 設定取得（ロゴ・ファビコンを base64 で返す）
- `updateSettings(settingsData)` — 設定更新（APIキー・フォルダIDは Admin のみ）。受け付けるキー: `geminiApiKey`, `appFolderId`, `accessFolderId`, `themeColor`

### セクション6: プロフィール管理
- `getUserProperty(key)` — ユーザープロパティ取得
- `setUserProperty(key, value)` — ユーザープロパティ設定
- `getRegisteredEmail()` — 登録メール取得（初回はGoogle アカウントのメール）
- `getUserProfile()` — `@aiCallable` プロフィール取得
- `getOrCreateTeacherId()` — 講師ID取得（初回自動生成）
- `updateEmailAddress(newEmail)` — `@aiCallable` メール変更
- `updateUserProfile(profileData)` — `@aiCallable` プロフィール更新
- `getSubjectOptions()` — `@aiCallable` 教科リスト
- `savePreferredCampuses(campusCodes)` — `@aiCallable` 配属校舎リストを保存（UserProperties `PREFERRED_CAMPUSES`）
- `resetUserThemeColor()` — `@aiCallable` ユーザー個別テーマカラー（`USER_THEME_COLOR`）を削除してシステムデフォルトに戻す。戻り値: `{ success, themeColor }`
- `saveProfilePhoto(base64Image, mimeType)` — `@aiCallable` プロフィール写真をDriveの`assets/profile-photos/{teacherId}.jpg`に保存（既存ファイルは上書き）。戻り値: `{ success, message }`

### セクション7: 成績管理（マスター設定）
- `getScriptProperty(key)` / `setScriptProperty(key, value)` — セクション7専用のプロパティラッパー
- `initializeGradesConfig()` — 初回のデフォルト値設定
- `addTestName(newTestName)` / `deleteTestName(testNameToDelete)` — テスト名 CRUD（Admin のみ。削除時は成績データの参照チェックあり）
- `addSchool(schoolName, departmentsStr)` / `deleteSchool(schoolName)` — 志望校 CRUD（Admin のみ。削除時は成績データの参照チェックあり）
- `addCampus(campusCode, campusName)` / `deleteCampus(campusCode)` — 校舎 CRUD（Admin のみ。削除時は生徒データの参照チェックあり）
- `updateVisibleGrades(visibleCodes)` — 表示する学年コードの配列を保存（Admin のみ。学年コードは GRADES 定数で固定）
- `countStudentsByCampus_(campusCode)` — 校舎コードを使用中のアクティブ生徒数を返す内部ヘルパー
- `countGradesByTestName_(testName)` — テスト名を使用中の成績データ件数を全年度から返す内部ヘルパー
- `countGradesBySchool_(schoolName)` — 志望校名を使用中の成績データ件数を全年度から返す内部ヘルパー
- `getGradesConfigForWeb()` — `@aiCallable` 成績管理設定取得
- `getTestNamesConfig()` / `getCampusConfig()` / `getGradeConfig()` / `getSchoolConfig()` — 各設定取得

### セクション8: 成績管理（生徒・成績データ）
- `getGradesFolder()` — 成績管理フォルダ取得
- `getGradesYearFolders()` — `@aiCallable` 年度フォルダ一覧
- `getSettingsFolder()` — 設定フォルダ取得
- `getCurrentFiscalYear()` — 現在の学年年度（4月始まり）
- `getStudentNameById(studentId)` — 生徒IDから氏名取得
- `getMasterData(year)` — アクティブ生徒一覧（削除済み除外・学年動的計算）
- `getDataSheetData(year)` — 成績データ配列取得
- `getStudentListWithGrades(year, testName)` — `@aiCallable` 生徒マスタと成績を結合して返す（一覧表タブ用）
- `getStudentsForDropdown(campusCode, gradeCode, selectedYear)` — `@aiCallable` ドロップダウン用生徒一覧
- `submitStudentInfo(year, campusCode, gradeCode, nameKanji, nameFurigana, schoolName)` — `@aiCallable` 生徒登録（重複チェックあり）
- `updateStudentInfo(studentId, campusCode, name, furigana, schoolName)` — `@aiCallable` 生徒情報更新
- `deleteStudent(studentId)` — `@aiCallable` 生徒ソフトデリート
- `getDeletedStudents(campusCode, gradeCode, selectedYear)` — `@aiCallable` 削除済み生徒取得
- `restoreStudent(studentId)` — `@aiCallable` 生徒復元
- `ocrAndSaveGradeSheet(base64Image, mimeType, year)` — `@aiCallable` 成績画像OCR一括保存
- `getGradeDataByStudentAndTest(year, studentId, testName)` — `@aiCallable` 既存成績1件取得
- `submitGradeData(year, studentId, testName, scores)` — `@aiCallable` 成績 upsert
- `getStudentsWithGradesByTest(year, campusCode, testName)` — `@aiCallable` 指定テスト名の成績がある生徒一覧を校舎でフィルタして返す（成績表タブ用）
- `getStudentGradeReport(year, studentId)` — `@aiCallable` 成績表用：指定生徒の全テスト成績と学校別平均を取得
- `bulkImportStudents(studentsJson, importYear)` — 生徒を一括インポート（Admin のみ。ふりがな省略可。JSON文字列 `[{campusCode, gradeCode, sei, mei}]`。importYear 省略時は現在年度。戻り値: `{ success, total, savedCount, skippedCount, errors[] }`）
- `bulkImportGrades(gradesJson, importYear)` — 成績を一括インポート（Admin のみ。氏名・校舎・学年で生徒IDを解決してupsert。JSON文字列 `[{testName, campusCode, gradeCode, name, kokugo, shakai, sugaku, rika, eigo, gokei}]`。戻り値: `{ success, total, savedCount, skippedCount, errors[] }`）
- `saveExamResult(studentId, examDataJson)` — `@aiCallable` 中3生徒の受験情報を生徒マスタ列10〜16に保存。`examDataJson`: `{jukoukou1, jukoukou1_gakka, jukoukou1_gokaku, ikusei, jukoukou2, jukoukou2_gakka, jukoukou2_gokaku}`
- `getStudentExamData(studentId, fiscalYear)` — `@aiCallable` 生徒の受験情報（生徒マスタ列10〜16）と最新テストの第1志望校を取得。戻り値: `{ success, examData: {...}, latestGrade: {shogaku1, shogaku1_gakka} }`
- `getStudentPlacementData(year)` — `@aiCallable` 進学先一覧取得。指定年度の中3生（学年コード15）全員について第1〜第3回基礎学力テストの合計点・平均・進学先を返す。戻り値: `[{studentId, name, campus, score1, score2, score3, avg, placement, placementSchool}]`
### セクション8-B: AI成績分析・生徒別AI分析（analysis.js）
- `getAnalysisSheet(year)` — AI分析シート取得/作成ヘルパー
- `getGradeAnalysis(year, testName)` — `@aiCallable` 保存済みAI分析データの取得（`{ exists, analysis, generatedAt }`）
- `getYearTestAvgs_(year, testName)` — 塾全体平均（getCampusAverages の "all" エントリ）と学校「平均」行を取得して返す内部ヘルパー（`{ jukuAvg, schoolAvg }`）
- `generateGradeAnalysis(year, testName, skipIfExists)` — `@aiCallable` AI分析の生成・保存・返却（Gemini API使用。塾平均・学校平均のみを渡し、過去3年分の推移・前回テスト比較を含む。`skipIfExists=true` のとき既存データがあれば生成をスキップして返す）
- `calcDeviationValue_(score, average, sigma)` — 偏差値計算ヘルパー（50 + 10 × (得点 - 平均) / σ）
- `normalCDF_(z)` — 正規分布の累積分布関数（近似）ヘルパー
- `calcPassProbability_(studentDev, schoolDev)` — 合格可能性計算ヘルパー（A〜E判定 + パーセント）
- `getStudentAnalysisSheet_(year)` — 生徒別AI分析シート取得/作成ヘルパー
- `getStudentAnalysis(year, studentId, testName)` — `@aiCallable` 生徒別AI分析コメント取得（成績表タブ用）
- `generateStudentAnalyses(year, testName)` — 全対象生徒のAI分析を一括生成（Admin のみ。偏差値・合格判定・AIコメントを含む）
- `generateAllAnalyses(year, testName, skipExisting)` — テスト全体分析と生徒別AI分析を1回のGemini APIコールで同時生成・保存（Admin のみ。`generateGradeAnalysis` と `generateStudentAnalyses` を統合。`skipExisting=true` のとき既存データがある分析をスキップして未分析のみ生成）

### セクション9: AI アシスタント
- `replaceOutsideTokens_(text, needle, replacement)` — `[生徒ID:...]`/`[個人名:...]` トークンの外側だけ文字列置換する内部ヘルパー（苗字マッチングで置換済みトークンを二重置換しないために使用）
- `detectGradeFromMessage_(message)` — メッセージ内の学年キーワード（中1〜高3等・全角半角対応）から gradeCode（2桁文字列）を検出する内部ヘルパー
- `detectCampusFromMessage_(message, campusConfig)` — メッセージ内の校舎名から campusCode を検出する内部ヘルパー
- `resolveStudentNamesInMessage_(message, students, campusConfig)` — メッセージ内の生徒氏名を生徒IDまたは伏字に置き換える内部ヘルパー（個人情報保護用）。Phase 1: フルネームマッチング（1人→ID、複数→全ID列挙）。Phase 2: 苗字のみマッチング（学年・校舎の文脈で絞り込み。1人→ID、複数→`[個人名:田中]` 伏字）
- `restoreStudentNamesInResponse_(text, students)` — Geminiの応答テキスト内の `[生徒ID:XXXX]` を氏名に、`[個人名:田中]` を苗字に戻す内部ヘルパー（ユーザー表示用。バックエンドで完結するため氏名が外部に渡ることはない）
- `requestAIAssistant(userMessage, chatHistory)` — `@aiCallable` メインエントリー（意図判定と回答生成を1回のAPI呼び出しで完結。送信前に生徒氏名をIDへ自動置換して個人情報を保護）
- `getAiKnowledgeBase()` — AIナレッジベースの全エントリ取得（Admin のみ）
- `saveAiKnowledgeEntry(entryJson)` — ナレッジベースのエントリ追加・更新（Admin のみ。idがあれば更新、なければ新規）
- `deleteAiKnowledgeEntry(entryId)` — ナレッジベースのエントリ削除（Admin のみ）
- `getAiKnowledgeBaseForPrompt_()` — プロンプト用にナレッジベースをテキスト形式で返す内部ヘルパー
- `applyConfigChange_(settings)` — config_changeの推奨設定をバックエンドで実際に適用する内部ヘルパー（themeColor, aiAssistantName, aiPersonality, displayName）
- `executeAiAction(action, paramsJson)` — `@aiCallable` AIアシスタントの確認済みアクションを実行するエントリーポイント（submit_grade / submit_student / add_schedule）

#### ⚠️【重要】Gemini API 呼び出し時の設計ルール

##### 【最優先原則】API呼び出し回数を最小にすること

Gemini APIには1日・1分あたりの呼び出し回数に制限がある。
**「1つのユーザー操作 = 1回のAPI呼び出し」を原則とし、統合できる処理は必ず統合する。**

| 禁止パターン | 理由 |
|------------|------|
| 意図判定を別コールで先に行い、結果を見てから本処理コール | 2コール消費。1コールで両方できる |
| 前処理・後処理でそれぞれ別コール | 1コールで統合できる場合は必ず統合する |

**統合の方法：** プロンプトに「まず意図を判定し、その意図に応じた回答をそのままJSONで返してください」と指示する。判定と回答が同時に返ってくる。

**ただし、以下の場合は複数回のAPI呼び出しを使ってよい（品質上の理由が明確な場合のみ）：**

| 許可パターン | 具体例 |
|------------|--------|
| 複数回に分けることで明確に精度・品質が上がる処理 | 曖昧な操作指示の解釈（1回目：意図確認 → ユーザー返答 → 2回目：実行） |
| 段階的な処理が必然的に必要なもの | 入力データ検証コールの後に処理コールが必要なケース |
| 1コールに収めるとプロンプトが肥大化して精度が下がる | 非常に複雑な複合タスク |

**判断の目安：** 「統合したほうが速くて同等以上の精度が出るか？」を先に検討し、Yesなら統合する。Noのときだけ複数回を選ぶ。

##### thinkingBudget の使い分け

```javascript
generationConfig: {
  responseMimeType: 'application/json',  // 必須（マークダウン防止）
  thinkingConfig: { thinkingBudget: 0 }  // 下表を参照
}
```

| 用途 | thinkingBudget | 理由 |
|------|---------------|------|
| AIアシスタント（意図判定＋回答を統合） | `0` | 分類＋定型回答。思考不要 |
| 成績AIコメント生成 | `0` | 品質はthinkingより「渡すデータの豊富さ」で決まる |
| チラシAI生成（`generateFlyerWithAI`） | `0` | HTMLテンプレート生成。プロンプトと温度設定で品質が決まる |
| **将来：`handleAppAction`（操作指示）** | **`-1`（自動）** | **曖昧な指示を解釈し聞き返す処理が必要なため** |

**`responseMimeType: 'application/json'` は必須。** これを設定しないと Gemini がマークダウン（```json...```）を返し、JSONパースエラーが発生する。

**thinking パーツの除外処理も必須（安全網として維持する）：**
```javascript
var parts = (result.candidates[0].content.parts || []);
var textPart = parts.filter(function(p) { return !p.thought; }).pop();
var rawText = textPart ? (textPart.text || '') : '';
```

#### 将来の `handleAppAction` 実装時の注意

操作指示（「成績を登録して」「スケジュールを追加して」など）を受け付ける際は：
1. `requestAIAssistant()` のプロンプトに `app_action` の応答形式を追加する（コールは増やさない）
2. 必要なら `handleAppAction_()` を内部ヘルパーとして切り出し、`thinkingBudget: -1` を使う
3. 曖昧なときは `"needsClarification": true` + `"question"` を返してユーザーに聞き返す
4. フロントエンドで `type === "app_action"` かつ `needsClarification === true` のときは質問バブルを表示する

### セクション10: Admin 専用 API
- `getAllScriptPropertiesForGUI()` — 全プロパティ取得（マスク済み）
- `logAdminAction(action, details)` — Admin 操作ログ記録
- `updateScriptPropertyFromGUI(key, newValue)` — プロパティ更新（Admin のみ）
- `deleteScriptPropertyFromGUI(key)` — プロパティ削除（Admin のみ）
- `getDriveContents(folderId)` — Drive フォルダ探索（Admin のみ）
- `uploadPDFToFolder(pdfBase64, fileName, targetFolderId)` — PDF アップロード（Admin のみ）
- `deleteFileFromDrive(fileId)` — ファイル削除（Admin のみ）

### セクション11: フォルダ・シート自動初期化
- `initializeAllSheets()` — 全フォルダ・シート初期化
- `getOrCreateTabFolder(parentFolder, folderName)` — タブフォルダ取得/作成
- `initializeScheduleFolder(scheduleFolder)` — スケジュールフォルダ初期化
- `initializeGradesFolder(gradesFolder)` — 成績管理フォルダ初期化
- `initializeLecturesFolder(lecturesFolder)` — 講習フォルダ初期化
- `initializeUniversitiesFolder(universitiesFolder)` — 進学先フォルダ初期化
- `initializeSettingsFolder(settingsFolder)` — 設定フォルダ初期化
- `getOrCreateYearFolder(parentFolder, year)` — 年度フォルダ取得/作成
- `getOrCreateSpreadsheet(yearFolder, year)` — 予定データシート取得/作成
- `createGradeDataSheet(yearFolder, year)` — 成績データシート作成
- `createAnalysisReportSheet(yearFolder, year)` — 分析レポートシート作成（未使用。AI分析は成績データSS内の「AI分析」シートに保存）
- `createLectureSheet(yearFolder, year)` — 講習管理シート作成（プレースホルダー）
- `createUniversitySheet(yearFolder, year)` — 進学先シート作成（プレースホルダー）
- `createSystemSettingsSheet(settingsFolder)` — システム設定シート作成
- `scheduledInitializeSheets()` — 時間トリガー用（24時間ごと推奨）
- `manualInitializeSheets()` — 手動初期化（Admin のみ）
- `initializeApplication()` — スクリプトプロパティのデフォルト値設定

### セクション12: ユーティリティ
- `recordOperationLog(action, details, status)` — 操作ログ記録
- `getOrCreateOperationLogSheet()` — 操作ログシート取得/作成
- `recordInitializationLog(status, details)` — 初期化ログ記録
- `checkInitializationStatus()` — 初期化状態確認（Admin のみ）
- `extractSchoolFromFileName(fileName)` — ファイル名から学校情報抽出
- `createExtractSchedulePrompt(content, schoolInfo, year)` — Gemini プロンプト生成
- `callGeminiForScheduleExtraction(prompt)` — Gemini API 呼び出し
- `autoImportAllSchedules(year)` — 全形式自動インポート（PDF/CSV/Sheets）
- `normalizeScheduleEvent(event)` — イベントデータ正規化（年除去・範囲処理）
- `importScheduleFromGoogleSheetsWithAI(sheetId, schoolInfo, year)` — Sheets インポート
- `importScheduleFromCSVWithAI(file, schoolInfo, year)` — CSV インポート
- `importScheduleFromPDFWithAI(file, schoolInfo, year)` — PDF インポート
- `getJapaneseHolidaysFromCalendar(startYear, endYear)` — Googleカレンダーの日本祝日を取得（内部ヘルパー・`refreshHolidayCache()` から使用）
- `refreshHolidayCache()` — Googleカレンダーから祝日を取得しスクリプトプロパティ `HOLIDAY_CACHE` にJSON保存（`scheduledInitializeSheets()` から日次で呼ばれる）
- `getCachedHolidays()` — `@aiCallable` キャッシュ済み祝日データを返す（アプリ起動時にフロントエンドが使用）
- `getReAuthorizationUrl()` — GAS権限承認URLを取得する（oauthScopes追加後の再認証用。管理タブ「権限を承認する」ボタンから呼び出される）

### セクション17: Gemini API 使用量トラッキング
- `logGeminiUsage(operationName, usageMetadata)` — Gemini API呼び出し後に使用量をUserPropertiesに記録（日次・月次・操作一覧20件）。各API呼び出し関数の直後に挿入
- `getMyGeminiUsage()` — `@aiCallable` 現在ユーザーのGemini API使用量（個人+チーム）を取得して返す（`{ mine: { today, month }, team: { today, month } }`）。AIアシスタントのプロンプト構築時にバックエンドから直接呼び出して使用量・解除時刻情報を注入

### セクション18: LINEメッセージスケジューラー
#### 内部ヘルパー（`_` 末尾・非公開）
- `getLineSchedulerSheet_()` — システム設定.gs 内の「LINEスケジューラー」シートを取得/作成
- `computeClosedDaysForMonth_(year, month)` — 指定年月の休校日セットを計算（index.html の getClosedDays を再実装 + CLOSED_DAYS_OVERRIDES 適用）
- `isClosedOrSunday_(year, month, day, closedDays)` — 日曜または休校日なら true を返す
- `findPrevOpenDay_(year, month, startDay, closedDays)` — startDay から遡り最初の開校日を返す
- `getMeetingDay_(year, month)` — 全体ミーティング日を計算（index.html の getMeetingDay を再実装）
- `getReportDay_(year, month)` — 回数報告書提出日を計算（index.html の getReportDay を再実装）
- `getDebitDay_(year, month)` — 引落データ送信日を計算（index.html の getDebitDays().debit を再実装）
- `getDayOfWeekJa_(year, month, day)` — 曜日名（日本語）を返す
- `computeShimurochoSendDate_(year, month, closedDays)` — 室長用連絡の送信日（月の最後の開校日から7日前）を計算
- `computeMeetingNotifDate_(year, month, closedDays)` — 全体ミーティング通知日（前日）を計算。戻り値: `{ day, meetingDay }`
- `computeReportNotifDate_(year, month, closedDays)` — 報告書通知日（前日）を計算。戻り値: `{ day, reportDay }`
- `buildMeetingMessage_(year, month, meetingDay)` — 全体ミーティング連絡のデフォルトメッセージを生成
- `buildReportMessage_(year, month, reportDay, sendMonth)` — 回数報告書提出日連絡のデフォルトメッセージを生成（送信月に応じた講習名追加あり）
- `buildShimurochoMessage_(sendYear, sendMonth, sendDay, closedDays)` — 室長用連絡のデフォルトメッセージを生成（月ごとの講習名・引落データ送信日・締切日を動的計算）
- `generateMonthlySchedule_(year, month)` — 指定年月の3種別スケジュールを自動生成（既存エントリがあればスキップ）。meeting/reportは `recipients: ['__ALL__']` で全LINE登録ユーザーへ自動送信。shitsucho のみ手動選択
- `getAllLineRegisteredTeacherIds_()` — LINE_USER_MAPPING に登録されている全 teacherId を返す（meeting/report の全員送信用）

#### 公開API関数（Admin のみ）
- `getLineSchedulerSettings()` — LINEスケジューラーの種別ごとデフォルト設定取得
- `saveLineSchedulerSettings(type, settings)` — 指定種別のデフォルト設定保存（Admin のみ）
- `getScheduledLineMessages(year, month)` — 指定年月のスケジュール一覧取得（未生成なら自動生成して返す）
- `saveScheduledLineMessage(data)` — スケジュール1件を保存（id 一致する行を更新・なければ追加）
- `deleteScheduledLineMessage(id)` — スケジュール1件を削除（Admin のみ）
- `sendScheduledLineMessageNow(id)` — 指定スケジュールを今すぐ手動送信（Admin のみ）。戻り値: `{ success, sentCount, failedEmails }`
- `checkAndSendDueLineMessages()` — 送信予定時刻を過ぎた未送信メッセージを一括送信（時間トリガーから呼ばれる）
- `setupScheduledLineTrigger()` — checkAndSendDueLineMessages を毎時実行するトリガーを設定（Admin のみ）
- `deleteScheduledLineTrigger()` — checkAndSendDueLineMessages のトリガーをすべて削除（Admin のみ）
- `getScheduledLineTriggerStatus()` — トリガーの稼働状態を確認。戻り値: `{ success, active }`
- `getLineSchedulerNotifPrefs()` — `@aiCallable` 現在ユーザーのLINEスケジューラー通知方法設定を種別ごとに取得。戻り値: `{ success, lineRegistered, prefs: {meeting,report,shitsucho}, eligible: {meeting,report,shitsucho} }`
- `updateLineSchedulerNotifPref(type, method)` — `@aiCallable` 現在ユーザーのLINEスケジューラー通知方法を種別ごとに更新（type: 'meeting'/'report'/'shitsucho'、method: 'line'/'gmail'/'both'/'none'）。戻り値: `{ success, message }`

### セクション20: 講習管理

#### 日程自動計算ヘルパー（内部）
- `addDaysLec_(date, days)` — 日数加算して新しいDateを返す
- `formatDateStrLec_(date)` — DateをYYYY-MM-DD文字列に変換
- `getNthWeekdayOfMonth_(year, month, n, dayOfWeek)` — 指定月のN番目の曜日のDateを返す（dayOfWeek: 0=日〜6=土）
- `isHolidayLec_(dateStr)` — HOLIDAY_CACHEを使って祝日判定
- `isWeekendOrHolidayLec_(date)` — 土日祝判定
- `getNextWeekdayLec_(date)` — 指定日以降の最初の平日を返す
- `getFirstWedOnOrAfterLec_(date)` — 指定日以降の最初の水曜日を返す
- `computeBasicTestDateLec_(fiscalYear, testNum)` — 基礎学力テスト日を計算（BASIC_TEST_DATESオーバーライド対応）
- `getPublicHighSchoolExamDateLec_(fiscalYear)` — 公立高校一般選抜日を計算（PUBLIC_HIGH_EXAM_DATESオーバーライド対応。翌年3月第1火曜、1日/2日なら第2火曜）
- `countBackSchoolDays_(endDate, count)` — 終了日前日から遡り日曜・休校日を除いてcount日数えた日を返す（kiso2用）
- `computeDefaultLectureDates_(typeId, fiscalYear)` — タイプ・年度から自動計算日程を返す（`{startDate, endDate}`）

#### 固定種別定数
- `LEC_TYPE_IDS` — 6種別キー配列: `['spring','summer','kiso1','kiso2','winter','nyushi']`
- `LEC_TYPE_NAMES` — 種別キー→表示名マッピング

#### 公開API関数
- `getDefaultGradeSettings_(lectureName)` — 講習名から学年別デフォルト設定を生成（内部ヘルパー。春期: 新中1が50分・2回。夏期/冬期: 中3が6回。基礎学力テスト対策(kiso1/kiso2)・入試直前: 中3のみ有効、他学年は0）
- `getLecturePeriods()` — `@aiCallable` 講習期間一覧取得（現年度・翌年度の6種を自動計算し保存済みオーバーライドをマージ。`_isOverridden`フラグで手動/自動を区別）
- `saveLectureDates(fiscalYear, typeId, startDate, endDate)` — 指定年度・種別の日程を上書き保存（Admin のみ）
- `resetLectureDates(fiscalYear, typeId)` — 指定年度・種別の日程をリセットして自動計算に戻す（gradeSettingsがある場合はエントリを残して日程のみリセット）（Admin のみ）
- `saveLecturePeriod(lectureData)` — 旧フォーマット互換：講習期間保存（Admin のみ。新規時は `gradeSettings` を自動生成、更新時は既存 `gradeSettings` を保持）
- `deleteLecturePeriod(lectureId)` — 旧フォーマット互換：講習期間削除（Admin のみ）
- `saveLectureGradeSettings(lectureId, gradeSettingsJson)` — 指定講習の学年別設定（コマ時間・回数）を上書き保存（Admin のみ。新フォーマットIDで未保存の場合は自動計算日程でエントリを作成）
- `getTeacherNamesMap()` — `@aiCallable` 講師ID→情報マッピングを全ユーザーに返す（グリッド上の講師名解決用）
- `getLectureTeachers()` — 講師一覧取得（Admin のみ。getAllowedUsers ベースで teacherId 付加）
- `getFlyerImages()` — `@aiCallable` チラシ用画像一覧を Drive の assets/flyer フォルダから取得（{id, name, mimeType, tags}[]。tagsは画像タグシートから取得）
- `getFlyerImageBase64(fileId)` — `@aiCallable` DriveファイルIDから画像をbase64エンコードして返す
- `uploadFlyerImage(base64, fileName, mimeType)` — `@aiCallable` チラシ用画像をDriveのassets/flyerフォルダにアップロード（フォルダがなければ自動作成。JPEG/PNG/GIF/WebPのみ許可）。戻り値: `{success, fileId, fileName}`
- `deleteFlyerImage(fileId)` — `@aiCallable` Driveからチラシ用画像をゴミ箱に移動して削除する（画像タグも同時削除）。戻り値: `{success, message}`
- `getFlyerImageTagSheet_()` — 画像タグデータ保存用シート「画像タグ」を取得/作成する内部ヘルパー
- `saveFlyerImageTags(fileId, tags)` — `@aiCallable` チラシ画像の説明タグを保存する（upsert）。戻り値: `{success, message}`
- `getAllFlyerImageTags_()` — 画像タグシートから全タグを一括取得してマップで返す内部ヘルパー
- `deleteFlyerImageTags_(fileId)` — 画像タグシートから指定ファイルIDの行を削除する内部ヘルパー
- `getFlyerConfig(lectureId, campusCode)` — 【非推奨】旧チラシ設定取得（AI生成方式に移行済み）
- `saveFlyerConfig(lectureId, campusCode, configJson)` — 【非推奨】旧チラシ設定保存（AI生成方式に移行済み）
- `getFlyerAiSheet_()` — AIチラシデータ保存用シート「チラシAI」を取得/作成する内部ヘルパー
- `FLYER_DESIGN_PALETTE_` — チラシAI生成用の季節コンテキスト定数（バックエンド専用。spring/summer/winter/general。季節の雰囲気（mood）をAIに伝えるが、配色はAIが自由に選択）
- `FLYER_TYPE_SEASON_MAP_` — 講習typeId → 季節キーのマッピング定数（バックエンド用）
- `buildFlyerDesignPrompt_(seasonKey, hasImage, imageTags, isEditMode)` — 印刷物デザイナー向けの構造化プロンプトを構築する内部ヘルパー（ROLE=紙チラシ専門の印刷物デザイナー / チラシの設計方針=サイズ・ゾーン構成・季節テーマ・紙チラシとしての方針・タイポグラフィ・表スタイル・画像配置・キャッチコピー指針 / MODE / 出力ルール。配色はAIが季節の雰囲気に合わせて自由に選択。ウェブUIではなく印刷用紙チラシである点を明示）
- `generateFlyerWithAI(params)` — `@aiCallable` Gemini APIでA4チラシHTML生成。params: `{ userMessage, chatHistory, systemContext, hasImage, imageTags, currentHtml, seasonKey }`。戻り値: `{ success, html, explanation }`
- `saveFlyerAiData(lectureId, campusCode, html, chatHistoryJson)` — `@aiCallable` スプレッドシートにチラシHTML＋会話履歴保存。campusCode `'common'` = 共通
- `loadFlyerAiData(lectureId, campusCode)` — `@aiCallable` 保存済みAIチラシデータ読み込み。戻り値: `{ success, html, chatHistory, updatedAt }`
- `getDefaultLecturePricing_()` — 講習タイプ別のデフォルト料金データを返す内部ヘルパー（税抜き金額。spring/summer/kiso1/kiso2/winter/nyushi）
- `getLecturePricingConfig()` — `@aiCallable` 講習別料金設定を取得（未設定ならデフォルトで初期化）。戻り値: `{ success, data: { typeId: [{label, internal, external}] } }`
- `saveLecturePricing(typeId, rowsJson)` — 指定講習タイプの料金設定を保存（Admin のみ。rowsJson: `[{label, internal, external}]`）
- `normalizeLecDate_(val)` — Sheets日付値をYYYY-MM-DD文字列に正規化する内部ヘルパー
- `normalizeLecTime_(val)` — Sheets時刻値をHH:MM文字列に正規化する内部ヘルパー
- `getLectureScheduleSpreadsheet_()` — 講習スケジュール用スプレッドシートを取得/作成する内部ヘルパー
- `saveLectureScheduleEntries(lectureId, campusCode, entriesJson)` — 講習スケジュールエントリ一括保存（全置換・LockService使用）
- `getLectureScheduleEntries(lectureId, campusCode)` — `@aiCallable` 講習スケジュールエントリ取得
- `getDistributionFilesFolder_(lectureId, campusCode)` — 配布物PDF保存フォルダを取得/作成する内部ヘルパー（ルート→配布物/{lectureId}/{campusCode}/）
- `saveDistributionFile(lectureId, campusCode, fileName, pdfBase64)` — `@aiCallable` 配布物PDFをDriveに保存する。戻り値: `{success, fileId, fileName, message}`
- `listDistributionFiles(lectureId, campusCode)` — `@aiCallable` 指定講習・校舎の保存済み配布物PDF一覧を取得する（フォルダ未存在時は空配列。新しい順）。戻り値: `[{id, name, createdDate, size}]`
- `deleteDistributionFile(fileId)` — `@aiCallable` 配布物PDFをDriveのゴミ箱に移動して削除する。戻り値: `{success, message}`
- `translateToImagePrompt_(japanesePrompt)` — 日本語プロンプトをGemini Flashで画像生成用の英語プロンプトに翻訳する内部ヘルパー
- `generateImageWithImagen(japanesePrompt, aspectRatio)` — `@aiCallable` Imagen 4.0 Ultra で画像を生成し、Drive の assets/flyer フォルダに保存する。日本語プロンプトを受け取り英語に翻訳してから Imagen に渡す。戻り値: `{success, fileId, fileName, base64, mimeType, englishPrompt}`

### セクション19: 料金表管理
- `getDefaultPricingData_()` — デフォルトの料金表データを返す内部ヘルパー
- `getPricingConfigForWeb()` — `@aiCallable` 料金表データを取得（未初期化ならデフォルトで初期化）
- `savePricingConfig(jsonData)` — 料金表データを一括保存（Admin のみ）
- `addPricingSection(sectionName, headersJson)` — セクション追加（Admin のみ）
- `deletePricingSection(sectionId)` — セクション削除（Admin のみ）
- `updatePricingTitle(newTitle)` — タイトル更新（Admin のみ）
- `updatePricingFooterNotes(notesJson)` — フッター注記更新（Admin のみ）

### セクション13: 基礎学力テスト日程管理 / 予定タブ固定イベント上書き管理
- `getBasicTestDateOverrides()` — `@aiCallable` 上書き設定を全取得（`{"2025-1": "2025/10/01", ...}`）
- `setBasicTestDateOverride(academicYear, testNum, dateStr)` — 上書き設定を保存（Admin のみ）
- `deleteBasicTestDateOverride(academicYear, testNum)` — 上書き設定を削除し自動計算に戻す（Admin のみ）
- `getBasicTestDetails()` — `@aiCallable` 基礎学力テスト詳細テキストの上書き設定を取得（`{"2025-1": "中3 全員", ...}`）
- `setBasicTestDetails(academicYear, testNum, details)` — 詳細テキスト上書き保存（Admin のみ）
- `deleteBasicTestDetails(academicYear, testNum)` — 詳細テキスト上書き削除してデフォルト（中3）に戻す（Admin のみ）
- `getPublicHighExamDateOverrides()` — `@aiCallable` 公立高校一般選抜の日程上書き設定を全取得（`{"2025": "2026/03/11"}`）
- `setPublicHighExamDateOverride(academicYear, dateStr)` — 上書き保存（Admin のみ）
- `deletePublicHighExamDateOverride(academicYear)` — 上書き削除して自動計算に戻す（Admin のみ）
- `getJukuEventOverrides()` — `@aiCallable` 塾内部イベント（○□★△）上書き設定を全取得（`{"report_2025_4": {"date":"2025/4/21","details":""}, "meeting_2025_4": false, ...}`）
- `setJukuEventOverride(type, year, month, dateStr, details)` — 上書き保存。`dateStr="none"` で無効化（Admin のみ）
- `deleteJukuEventOverride(type, year, month)` — 上書き削除して自動計算に戻す（Admin のみ）
- `getClosedDayOverrides()` — `@aiCallable` 予定タブ専用の休校日上書き設定取得（`{add:["YYYY-MM-DD",...], del:[...]}`）
- `addClosedDayExtra(dateStr)` — 臨時休校日を追加（Admin のみ）
- `removeComputedClosedDay(dateStr)` — 計算上の休校日を開校日に変更（Admin のみ）
- `deleteClosedDayOverride(dateStr)` — 休校日の上書き設定を削除して元に戻す（Admin のみ）
- `getLectureDeadlineOverrides()` — `@aiCallable` 講習日程締切の手動上書き設定を全件取得（`{"lectureId": "YYYY-MM-DD"}`）
- `setLectureDeadlineOverride(lectureId, dateStr)` — 指定講習の締切日を手動上書き保存（Admin のみ）
- `deleteLectureDeadlineOverride(lectureId)` — 指定講習の締切日上書き設定を削除して自動計算に戻す（Admin のみ）

### セクション15: LINE通知・お問い合わせ通知機能
- `doPost(e)` — POST ハンドラー。`body.type === 'gasApi'` なら Firebase Hosting からの API コールとして `handleApiCall_()` に委譲。それ以外は LINE Webhook として処理（メール自己登録・Drive Editor 付与・管理者通知）。セクション3内に配置
- `handleApiCall_(body)` — Firebase Hosting からの `google.script.run` 代替 API コールを処理（doPost 内部ヘルパー）。Firebase ID トークンを検証しユーザーコンテキストを設定後、`globalThis[funcName]` で関数を動的ディスパッチ。末尾 `_` の内部関数は呼び出し禁止
- `sendLineReply_(replyToken, message)` — LINE 返信送信（内部ヘルパー・doPost 内のみ使用）
- `sendLineMessage(lineUserId, message)` — LINE プッシュ通知送信
- `sendNotification(teacherId, subject, body)` — `@aiCallable` 通知送信（teacherId からメールを解決し Gmail/LINE/両方を自動判定）
- `getNotificationSettings()` — `@aiCallable` 現在ユーザーの通知設定取得（isEligible・method・lineRegistered・registeredEmail）。isEligible は CAMPUS_NOTIFICATION_ROUTING に自分の teacherId が含まれるかで判定
- `updateNotificationSettings(method)` — `@aiCallable` 通知方法更新（gmail/line/both/none）
- `getNotificationMembers()` — CAMPUS_NOTIFICATION_ROUTING 内の全 teacherId を重複排除で取得（Admin のみ）
- `getLineRegisteredUsers()` — LINE 経由で自己登録済みのユーザー一覧取得（Admin のみ・teacherId ベース）。TEACHER_ID_MAP から名前を取得
- `getLineUserMapping()` — LINE User ID マッピング一覧取得（Admin のみ・確認用）
- `getCampusNotificationRouting()` — 校舎ごとの通知振り分け設定を全件取得（Admin のみ・teacherIds 配列を返す）
- `updateCampusNotificationRouting(campusCode, teacherIds)` — 指定校舎の通知振り分け先 teacherId 一覧を更新（Admin のみ）
- `sendNotificationByContent(subject, body)` — `@aiCallable` 本文の「校舎名:」から校舎を特定して自動振り分け送信
- `checkAndForwardFormEmails()` — noreply@web-cms.jp（設定変更可能）からの未処理メールを検索し校舎別に自動転送（時間トリガーから呼ばれる）
- `getFormEmailFilterSettings()` — フォームメール自動転送の送信元フィルター設定を取得（Admin のみ）
- `saveFormEmailFilterSettings(sender)` — フォームメール自動転送の送信元フィルター設定を保存（Admin のみ）
- `setupFormEmailTrigger()` — フォームメール自動転送の5分間隔トリガーを設定（Admin のみ）
- `deleteFormEmailTrigger()` — フォームメール自動転送のトリガーを削除（Admin のみ）
- `getFormEmailTriggerStatus()` — フォームメール自動転送トリガーの稼働状態を確認

### セクション16: 設定引き継ぎ機能
- `exportUserSettings()` — `@aiCallable` 引き継ぎコード発行。UserPropertiesの全設定をシステム設定シート「引き継ぎデータ」に保存し、講師IDを返す
- `importUserSettings(transferCode)` — `@aiCallable` 引き継ぎコードで設定復元。スプレッドシートから講師IDで検索し、UserPropertiesに全設定を復元。別アカウントからの引き継ぎ時は旧アカウントを自動ブロック
- `registerBlockedAccount_(ss, oldEmail, newEmail, transferCode)` — 旧アカウントをブロック対象として記録する内部ヘルパー
- `checkAccountBlocked()` — `@aiCallable` 現在のアカウントがブロック済みかチェック。アプリ起動時にフロントエンドから呼び出される
- `unblockAccount(email)` — ブロック済みアカウントを解除する（Admin のみ。誤ブロック時の復旧用）

---
