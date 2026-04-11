# S-quire フロントエンド関数リスト（index.html 系）

> このファイルは CLAUDE.md から分離した関数リファレンスです。
> フロントエンド（index.html / js-*.html）の関数を追加・修正する際に参照します。
> 関数を追加・削除・変更した際は必ずこのファイルも更新すること。
> バックエンド（GAS）関数は `FUNCTIONS-backend.md` を参照。

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
- `initSubTabLoop(containerId)` — サブタブバーの無限ループスクロールを初期化（汎用・モバイル専用）。画面幅800px未満のときのみボタンを前後にクローンし、端に達したら本物の位置にジャンプ。PC（800px以上）では通常表示。対象: `gradesSubTabs`・`lecSubTabNav`・`univSubTabs`・`adminSubTabs`
- `destroySubTabLoop(containerId)` — サブタブバーの無限ループスクロールを解除。クローンボタンを削除し通常表示に戻す。リサイズ時に自動呼び出し

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
- `showLecScheduleListView()` — マイ日程一覧モーダルを表示。全校舎のエントリを取得し、自分のエントリを校舎→学年→教科ごとにグルーピングして表示
- `closeLecListViewModal()` — マイ日程一覧モーダルを閉じる
- `buildLecListViewHTML_(entries, teacherName)` — 一覧表示用HTMLを生成（校舎→学年→教科→時間帯で整理）
- `showLecCalExportModal()` — カレンダーエクスポートモーダルを表示
- `closeLecCalExportModal()` — カレンダーエクスポートモーダルを閉じる
- `exportLecCalendar(mode)` — カレンダーエクスポート実行（'google' or 'ics'）。自分のエントリのみをICSファイルに変換してダウンロード。Googleモードではインポート画面も開く
- `generateLecICS(entries, lectureName, teacherName)` — エントリ配列からRFC 5545準拠のICSファイル文字列を生成
- `escapeICS(str)` — ICS用文字列エスケープ（RFC 5545）
- `pad2ICS(n)` — 数値を2桁ゼロ埋め文字列にする（ICS用）
- `refreshLecEntries()` — バックエンドからエントリを再取得して描画
- `saveLecEntries()` — 現在の校舎のエントリをバックエンドに保存
- `fetchAllCampusEntries()` — 全校舎の講習エントリを取得してキャッシュし、重複チェックを実行する
- `checkAndDisplayDuplicates()` — ローカル＋キャッシュのエントリから重複を検出してパネルを更新する。①同一講師（全校舎）②同一学年（同一校舎内）の2種類を判定
- `hasTimeConflict(a, b)` — 2つのエントリが時間的に重複するかを判定（前後10分バッファ込み）
- `renderDuplicatePanel(duplicates)` — 重複検出結果をパネルに描画（重複なしなら非表示）
- `initLecturesAdmin()` — 管理タブ：講習設定パネル初期化（年度セレクト構築→一覧ロード）
- `buildAdminLecYearSelect()` — 管理タブ：年度セレクトを構築（現在FYと翌FY）
- `loadLecturePeriodsAdmin()` — 管理タブ：選択年度の講習期間一覧描画（6種固定・削除なし・「日程を編集」「学年別設定」ボタン付き）
- `editLectureDatesAdmin(lectureId, currentStart, currentEnd)` — 管理タブ：日程編集インラインUIを表示
- `saveLectureDatesAdmin(fiscalYear, typeId)` — 管理タブ：日程上書き保存
- `resetLectureDatesAdmin(fiscalYear, typeId)` — 管理タブ：日程をデフォルト（自動計算）に戻す
- `showLecGradeSettingsPanel(lectureId)` — 講習タイプ別の料金・学年別設定パネルを表示（既存の個別設定UI）
- `renderLecUnifiedPanel_(lectureId, typeId, lp, typeData)` — 講習タイプ別料金パネルの中身を描画（標準料金・勝瑞校料金・追加行の3セクション）
- `saveLecGradeSettingsAdmin(lectureId)` — 講習タイプ別料金設定パネルの入力値をバックエンドに保存
- `showUnifiedPricingPanel_()` — 統合料金設定パネルを表示（学年ファースト一括設定UI。「📊 料金一括設定」ボタンから呼び出し）
- `renderUnifiedPricingPanel_(pricingData)` — 統合料金設定パネルの内容を描画（小学生〜中3「全講習共通」トグル・勝瑞校料金・高校生追加行）
- `onGradeAllChange_(cb)` — 「全講習共通」チェックボックスの変更に応じて common/pertype 表示を切り替える
- `updateUnifiedTax_(input)` — 統合パネルの税抜き入力時に税込みを自動更新する（data-input-field / data-tax-field 属性使用）
- `addUnifiedCustomRow_()` — 統合パネルの追加行テーブルに空の行を追加（#unified-custom-tbody）
- `collectUnifiedPricingData_()` — 統合パネルのフォームデータを収集し全タイプ別rows を構築して返す
- `saveUnifiedPricingAdmin_()` — 統合料金設定を `saveUnifiedLecturePricing()` で一括保存
- `showLecPricingPanel(typeId)` — 講習別料金設定パネルを表示（バックエンドから料金データを取得して描画）
- `renderLecPricingPanel_(typeId, typeName, rows)` — 料金設定パネルの中身を描画（テーブル＋行追加/削除＋保存ボタン）
- `buildLecPricingRowHtml_(idx, row)` — 料金設定の1行分のHTML生成（税抜き入力・税込み自動計算表示）
- `updateLecPricingTax_(input)` — 税抜き金額入力時に税込み表示を自動更新するハンドラー
- `addLecPricingRow_(typeId)` — 料金設定テーブルに空の行を追加
- `removeLecPricingRow_(btn)` — 料金設定テーブルから行を削除（最低1行は維持）
- `saveLecPricingAdmin_(typeId)` — 料金設定をバックエンドに保存

**【配布物サブタブ】**
- `matGreetingsData_` — 講習別学年挨拶文キャッシュ `{ typeId: { gradeKey: "挨拶文" } }`
- `MAT_CHU3_ONLY_TYPES_` — 中3限定講習タイプ `['kiso1', 'kiso2', 'nyushi']`
- `initLecturesMaterials()` — 内部配布物サブタブ初期化（校舎セレクト・挨拶文データ取得、料金表データキャッシュ取得）
- `buildMatCampusSelect()` — `buildCampusOptions()` を使って校舎セレクトを構築（配属校舎が先頭）
- `getMatCurrentTypeId_()` — 現在の講習タイプIDを取得する。currentLectureId から年度を除去して返す
- `openMatGreetingModal_()` — 挨拶文編集モーダルを開く。講習タイプに応じて表示学年を切り替え（kiso1/kiso2/nyushi は中3のみ）
- `closeMatGreetingModal_()` — 挨拶文編集モーダルを閉じる
- `saveMatGreetings_()` — モーダル内の挨拶文を保存する。matGreetingsData_ にマージしてバックエンドに一括送信
- `getMatGreeting_(gradeKey)` — 保存済みデータ → デフォルト文の順でフォールバック。講習タイプ別に取得
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
- `switchMatSubTab(tabId, btn)` — 内部タブ（申込用紙/メール送信用/HP掲載用）を切り替える。`mat-tab-web` 選択時は `initMatWebPublish()` を呼ぶ
- `initMatWebPublish()` — HP掲載用タブ初期化（校舎セレクト構築・リサイズリスナー登録）
- `buildMatWebCampusSelect()` — HP掲載用の校舎セレクト（`#mat-web-campus-select`）を `buildCampusOptions()` で構築
- `onMatWebCampusChange()` — HP掲載用 校舎変更時にエントリ取得（キャッシュ優先）→ `updateMatWebPreview()` を呼ぶ
- `updateMatWebPreview(entries, campusCode)` — HP掲載用プレビューを更新し、データあり時はボタンを有効化
- `buildWebPublishDocHTML(entries, campusCode)` — HP掲載用 日程表HTMLを生成（A4縦1枚・学年ごとに独立した表を縦並び・教科×時刻グループでrowspan結合・モノクロ黒線のみ）。`MAT_WEB_GRADE_DEF_` を参照し、小学生/中1〜3/高1〜3の7表を出力。内部ヘルパー: `fmtDates_(sortedDates)`（M/D(曜)形式・同月省略）
- `generateWebPublishPDF(mode)` — HP掲載用PDFを生成してダウンロードまたは印刷（`finalizeMaterialsPdf_` を再利用）
- `toggleMatWebPdfMenu(event)` — HP掲載用PDFドロップダウンメニューの表示切替
- `closeMatWebPdfMenu()` — HP掲載用PDFドロップダウンメニューを閉じる
- `saveWebPublishPDFToDrive()` — HP掲載用 Drive保存（準備中・トースト表示のみ）
- `setMatWebBtnsEnabled(enabled)` — HP掲載用 PDFボタン・Driveボタンの有効/無効を切り替える
- `resizeMatWebPreview()` — HP掲載用プレビューを794px基準でコンテナ幅にスケーリングする

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

**【ユーザー管理】** (`js-admin.html`)
- `loadAllowedUsers()` — アクセス許可ユーザー一覧を取得して描画
- `removeAllowedUser(email)` — ユーザーのアクセスを削除（確認ダイアログ付き）

**【通知設定】** (`js-admin.html`)
- `loadNotificationSettings()` — お問い合わせ転送通知の設定をバックエンドから取得して表示
- `applyNotificationSettingsUI(result)` — 通知設定の結果をUIに反映（LINE登録状態・ラジオボタン・メールチェックボックス）
- `updateNotifEmailSelect_(emails, selectedEmails, method)` — お問い合わせ転送通知のメールチェックボックスを描画（複数メール登録時のみ表示）
- `saveNotificationSettings()` — 通知方法＋選択メールアドレスをバックエンドに保存
- `loadLineSchedulerNotifPrefs()` — LINEスケジューラー通知設定をバックエンドから取得して表示
- `applyLineSchedulerNotifUI(result)` — スケジューラー通知の結果をUIに反映（種別ごとのラジオボタン・メールチェックボックス）
- `updateSchedulerEmailCheckboxes_(type, emails, selectedEmails, method)` — スケジューラー種別ごとのメールチェックボックスを描画
- `saveLineSchedulerNotifPref(type)` — スケジューラー種別の通知方法＋選択メールをバックエンドに保存

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
- `switchKbTab(tab)` — 手動登録 / 自動学習 タブ切り替え
- `initAutoLearnedAdmin()` — 自動学習エントリの読み込み
- `renderAutoLearnedEntries(entries)` — 自動学習エントリをカテゴリ別に描画
- `editAutoLearned(docId)` — 自動学習エントリの編集フォーム表示
- `hideAutoLearnedForm()` — 自動学習の編集フォームを閉じる
- `onKbAutoCategoryChange()` — 自動学習カテゴリ選択変更ハンドラー
- `saveAutoLearned()` — 自動学習エントリの編集を保存
- `deleteAutoLearned(docId)` — 自動学習エントリを削除（確認ダイアログ付き）

**【AIアシスタント アクション実行】** (`js-ai-actions.html`)
- `dispatchAiAction_(result)` — app_actionのメインディスパッチャー。handleAIWidgetResponseから呼ばれる
- `checkPendingAiAction_(userMessage)` — 確認待ちアクションがあれば「はい/いいえ」をローカル処理。sendAIWidgetMessageから呼ばれる
- `executeConfirmedAiAction_(action, params, thinkingId)` — 確認済み書き込みアクションをバックエンドで実行
- `navigateToSchedule_fromAI(year, month)` — 予定タブへ自動ナビゲート・指定月に移動
- `navigateToTab_fromAI(tab, subTab)` — 任意のタブ・サブタブへ自動ナビゲート
- `triggerAdminSubTabInit_(tabName)` — 管理サブタブの初期化関数をトリガーする内部ヘルパー
- `navigateToGradeAnalysis_fromAI(year, testName)` — 分析タブへ自動ナビゲート・テスト名選択・分析ロード
- `navigateToLectures_fromAI(lectureId, campusCode)` — 講習管理タブへ自動ナビゲート・講習選択・校舎チェック

**【Firebase SDK クライアントサイド関数】** (`firebase-schedule.html`)
- `fbGetScheduleData()` — スケジュールデータ（イベント・休日等）を取得
- `fbGetLectureScheduleEntries(lectureId, campusCode)` — 指定講習・校舎のエントリを取得
- `fbGetAllLectureEntries(lectureId)` — 全校舎の講習エントリを一括取得（重複チェック用。campusCodeフィルタなし）
- `fbSaveLectureScheduleEntries(lectureId, campusCode, entries)` — エントリを一括保存（全置換方式・権限チェック付き）

**【Firebase SDK クライアントサイド関数】** (`firebase-students.html`)
- `fbGetMasterData(year)` — アクティブ生徒一覧を取得
- `fbGetDeletedStudents(campusCode, gradeCode, selectedYear)` — 削除済み生徒一覧を取得
- `fbGetStudentListWithGrades(year, testName)` — 生徒マスタと成績データを結合して返す（gradeListCacheファストパス＋フォールバック）
- `fbGetGradeDataByStudentAndTest(year, studentId, testName)` — 成績データ1件を取得
- `fbGetStudentsWithGradesByTest(year, campusCode, testName)` — 指定テストの成績がある生徒一覧（校舎フィルタ）
- `fbGetStudentGradeReport(year, studentId)` — 成績表用：指定生徒の全テスト成績と学校別平均（gradeReportCacheファストパス＋フォールバック）
- `fbSubmitGradeData(year, studentId, testName, scores, studentName)` — 成績upsert + gradesMeta年度更新
- `fbGetGradesYearFolders()` — 年度一覧を取得（gradesMeta/yearsList優先、フォールバック時に自動修復）
- `fbGetGradeSummary(year, testName)` — gradeSummaries 1件読み取り
- `fbGetCampusAverages(year, testName)` — 校舎別平均点（gradeSummariesファストパス＋フォールバック）
- `fbGetSchoolAverages(year, testName)` — 学校別平均点を取得
- `fbGetGradeAnalysis(year, testName)` — テスト全体AI分析をFirestoreから直接取得（`testAnalysis`コレクション）
- `fbGetStudentAnalysis(year, studentId, testName)` — 生徒別AI分析をFirestoreから直接取得（`studentAnalysis`コレクション、基礎学力テストのフォールバック対応）

---

## js-placement.html（講師配置表）

| 関数 | 説明 |
|------|------|
| `loadStaffPlacement(year?)` | 配置データをGASから取得して表示。年度省略時は現在年度 |
| `renderPlacement(root)` | ヘッダー・ビュー切り替えタブ・配置ビューを描画 |
| `switchPlacementView(mode)` | `'campus'`（校舎別）または `'teacher'`（講師別）に切り替え |
| `buildCampusViewHtml(data)` | 校舎別カードビューのHTML生成（責任者+勤務講師） |
| `buildTeacherViewHtml(data)` | 講師別横スクロールテーブルのHTML生成（科目グループ×曜日×校舎略称） |
| `openPlacementEdit()` | 編集モーダルを開く（管理者のみ） |
| `renderPlacementEditModal(modal)` | 編集モーダル描画（校舎情報・講師配置・責任者の3アコーディオン） |
| `savePlacementData()` | 編集内容をGASへ保存 |
| `printPlacementPDF()` | 新ウィンドウで印刷用HTMLを開き、印刷ダイアログを起動 |
| `buildPlacementPrintHtml(data, year)` | 横向きA4の印刷用HTML生成（左：講師×曜日表、右：校舎×曜日表） |
