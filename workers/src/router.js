// Phase 5-E-11 deploy trigger (2026-04-22)
import { verifyFirebaseIdToken } from './auth.js';
import { ping } from './functions/ping.js';
import {
  getAdminEmails,
  getAllScriptPropertiesForGUI,
  updateScriptPropertyFromGUI,
  deleteScriptPropertyFromGUI,
  getPlacementTeacherNames,
  getCachedHolidays,
  getStaffPlacementForWeb,
  saveStaffPlacementForWeb
} from './functions/admin.js';
import { getUserProfile, getAppStartupData, saveLecGrades, savePreferredCampuses, getSettings, updateSettings, updateUserProfile, getSubjectOptions, resetUserThemeColor } from './functions/settings.js';
import { getMasterData, getGradesYearFolders, getSchoolAverages, getGradeDataByStudentAndTest, getDeletedStudents, getStudentsWithGradesByTest, getStudentListWithGrades, updateStudentInfo, deleteStudent, restoreStudent, submitGradeData, saveExamResult, getCampusAverages, getGradeSummary, getStudentGradeReport, saveSchoolAverages, getStudentExamData, getStudentPlacementData } from './functions/students.js';
import { getGradeAnalysis, getStudentAnalysis } from './functions/analysis.js';
import { kv_get, kv_set, kv_delete, kv_list } from './functions/kv.js';
import {
  getBasicTestDateOverrides,
  setBasicTestDateOverride,
  deleteBasicTestDateOverride,
  getBasicTestDetails,
  setBasicTestDetails,
  deleteBasicTestDetails,
  getPublicHighExamDateOverrides,
  setPublicHighExamDateOverride,
  deletePublicHighExamDateOverride,
  deleteJukuEventOverride,
  setJukuEventOverride,
  addClosedDayExtra,
  removeComputedClosedDay,
  deleteClosedDayOverride,
  getLectureDeadlineOverrides,
  setLectureDeadlineOverride,
  deleteLectureDeadlineOverride,
  addCustomScheduleEntry,
  deleteCustomScheduleEntry,
  getAdminScheduleEntries,
  getScheduleOverridesBundle
} from './functions/schedule-overrides.js';
import {
  getCampusConfigForWeb,
  getGradeAnalysisSigmaConfig,
  updateGradeAnalysisSigmaConfig,
  resetGradeAnalysisSigmaConfig,
  addTestName,
  deleteTestName,
  updateTestName,
  addSchool,
  deleteSchool,
  updateSchool,
  addCampus,
  deleteCampus,
  updateCampusDetails,
  updateVisibleGrades,
  getGradesConfigForWeb
} from './functions/grades.js';
import {
  getAiKnowledgeBase,
  saveAiKnowledgeEntry,
  deleteAiKnowledgeEntry,
  getLectureGreetings,
  saveLectureGreetings,
  getLecturePeriods,
  saveLectureDates,
  resetLectureDates,
  getLecturePricingConfig,
  getNormalClassConfig,
  getNormalClassSectionsForWeb,
  saveNormalClassConfig,
  getPricingConfigForWeb,
  saveLecturePricing,
  saveUnifiedLecturePricing,
  getTeacherNamesMap,
  getLectureScheduleEntries,
  analyzeFlyerImageMeta,
  saveLectureScheduleEntries,
  createLectureEntryAI,
  createWeeklyLectureEntriesAI,
  editLectureEntryAI,
  deleteLectureEntryAI,
  bulkLectureOperationsAI
} from './functions/features.js';
import { getMinutesList, saveMinutes, deleteMinutes } from './functions/minutes.js';
import { getTeacherEmails, addEmailToTeacher, removeEmailFromTeacher, getAllowedUsers, getUserRoleInfo, activateHiddenAdminMode } from './functions/auth-emails.js';
import {
  getNotificationSettings,
  updateNotificationSettings,
  getLineSchedulerNotifPrefs,
  updateLineSchedulerNotifPref
} from './functions/notifications.js';
import {
  getAutoLearnedKnowledge,
  editAutoLearnedKnowledge,
  deleteAutoLearnedKnowledge,
  getAiFeedback,
  resolveAiFeedback,
  deleteAiFeedback
} from './functions/ai-learning.js';
import {
  getLineRegisteredUsers,
  getCampusNotificationRouting,
  updateCampusNotificationRouting,
  getFormEmailFilterSettings,
  saveFormEmailFilterSettings,
  getLineSchedulerSettings,
  saveLineSchedulerSettings,
  saveScheduledLineMessage,
  deleteScheduledLineMessage,
  previewTemplateMessage,
  resolveTemplateForSendDate,
  getScheduledLineMessages,
  resetAndRegenerateSchedule,
  sendScheduledLineMessageNow,
  getScheduledLineTriggerStatus,
  setupScheduledLineTrigger,
  deleteScheduledLineTrigger
} from './functions/line.js';

// 認証不要の関数
const PUBLIC_FUNCTIONS = new Set(['ping']);

// INTERNAL_API_KEY（body.internalApiKey）で認証する内部 API
// Firebase ID トークンではなく共有シークレットで認証（GAS → Workers 間の信頼パス）
const INTERNAL_FUNCTIONS = new Set([
  'kv_get', 'kv_set', 'kv_delete', 'kv_list',
  // Phase 6-B-04: AI 系講習エントリ操作（executeAiAction 経由で GAS から呼出）
  'createLectureEntryAI',
  'createWeeklyLectureEntriesAI',
  'editLectureEntryAI',
  'deleteLectureEntryAI',
  'bulkLectureOperationsAI'
]);

// INTERNAL_FUNCTIONS のうち、body.email / body.uid から user オブジェクトを
// 組立てて handler に渡す必要がある関数。teacherId 解決や権限チェックで使う。
// kv_* は user 不要なので含めない。
const INTERNAL_FUNCTIONS_NEED_USER = new Set([
  'createLectureEntryAI',
  'createWeeklyLectureEntriesAI',
  'editLectureEntryAI',
  'deleteLectureEntryAI',
  'bulkLectureOperationsAI'
]);

// functionName → handler マップ
const HANDLERS = {
  ping,
  getAdminEmails,
  getAllScriptPropertiesForGUI,
  updateScriptPropertyFromGUI,
  deleteScriptPropertyFromGUI,
  getPlacementTeacherNames,
  getUserProfile,
  getAppStartupData,
  getMasterData,
  getGradesYearFolders,
  getSchoolAverages,
  getGradeAnalysis,
  getStudentAnalysis,
  getGradeDataByStudentAndTest,
  getDeletedStudents,
  getStudentsWithGradesByTest,
  getStudentListWithGrades,
  updateStudentInfo,
  deleteStudent,
  restoreStudent,
  submitGradeData,
  saveExamResult,
  getCampusAverages,
  getGradeSummary,
  getStudentGradeReport,
  saveLecGrades,
  savePreferredCampuses,
  getSettings,
  updateSettings,
  updateUserProfile,
  kv_get,
  kv_set,
  kv_delete,
  kv_list,
  getBasicTestDateOverrides,
  setBasicTestDateOverride,
  deleteBasicTestDateOverride,
  getBasicTestDetails,
  setBasicTestDetails,
  deleteBasicTestDetails,
  getPublicHighExamDateOverrides,
  setPublicHighExamDateOverride,
  deletePublicHighExamDateOverride,
  deleteJukuEventOverride,
  setJukuEventOverride,
  addClosedDayExtra,
  removeComputedClosedDay,
  deleteClosedDayOverride,
  getLectureDeadlineOverrides,
  setLectureDeadlineOverride,
  deleteLectureDeadlineOverride,
  addCustomScheduleEntry,
  deleteCustomScheduleEntry,
  getAdminScheduleEntries,
  getScheduleOverridesBundle,
  getCampusConfigForWeb,
  getGradeAnalysisSigmaConfig,
  updateGradeAnalysisSigmaConfig,
  resetGradeAnalysisSigmaConfig,
  addTestName,
  deleteTestName,
  updateTestName,
  addSchool,
  deleteSchool,
  updateSchool,
  addCampus,
  deleteCampus,
  updateCampusDetails,
  updateVisibleGrades,
  getGradesConfigForWeb,
  getAiKnowledgeBase,
  saveAiKnowledgeEntry,
  deleteAiKnowledgeEntry,
  getLectureGreetings,
  saveLectureGreetings,
  getLecturePeriods,
  saveLectureDates,
  resetLectureDates,
  getLecturePricingConfig,
  getNormalClassConfig,
  getNormalClassSectionsForWeb,
  saveNormalClassConfig,
  getPricingConfigForWeb,
  saveLecturePricing,
  saveUnifiedLecturePricing,
  getMinutesList,
  saveMinutes,
  deleteMinutes,
  getTeacherEmails,
  addEmailToTeacher,
  removeEmailFromTeacher,
  getNotificationSettings,
  updateNotificationSettings,
  getLineSchedulerNotifPrefs,
  updateLineSchedulerNotifPref,
  getAutoLearnedKnowledge,
  editAutoLearnedKnowledge,
  deleteAutoLearnedKnowledge,
  getAiFeedback,
  resolveAiFeedback,
  deleteAiFeedback,
  getLineRegisteredUsers,
  getCampusNotificationRouting,
  updateCampusNotificationRouting,
  getAllowedUsers,
  getSubjectOptions,
  getCachedHolidays,
  getTeacherNamesMap,
  resetUserThemeColor,
  saveSchoolAverages,
  getStudentExamData,
  getStudentPlacementData,
  getFormEmailFilterSettings,
  saveFormEmailFilterSettings,
  getLineSchedulerSettings,
  saveLineSchedulerSettings,
  getLectureScheduleEntries,
  saveScheduledLineMessage,
  deleteScheduledLineMessage,
  getUserRoleInfo,
  getStaffPlacementForWeb,
  saveStaffPlacementForWeb,
  activateHiddenAdminMode,
  analyzeFlyerImageMeta,
  saveLectureScheduleEntries,
  createLectureEntryAI,
  createWeeklyLectureEntriesAI,
  editLectureEntryAI,
  deleteLectureEntryAI,
  bulkLectureOperationsAI,
  previewTemplateMessage,
  resolveTemplateForSendDate,
  getScheduledLineMessages,
  resetAndRegenerateSchedule,
  sendScheduledLineMessageNow,
  getScheduledLineTriggerStatus,
  setupScheduledLineTrigger,
  deleteScheduledLineTrigger
};

export async function handleApiCall(body, env) {
  // gas-bridge は { function: ... } 形式で送信するため両方受け付ける
  const functionName = body.functionName || body.function;
  const { args = [], idToken, internalApiKey } = body;

  if (!functionName) {
    throw new Error('functionName が指定されていません');
  }

  const handler = HANDLERS[functionName];
  if (!handler) {
    throw new Error(`未知の関数: ${functionName}`);
  }

  // 認証チェック
  let user = null;
  if (INTERNAL_FUNCTIONS.has(functionName)) {
    // INTERNAL_API_KEY 方式（body.internalApiKey と env.INTERNAL_API_KEY を比較）
    const expectedKey = env.INTERNAL_API_KEY;
    if (!expectedKey) {
      const err = new Error('INTERNAL_API_KEY が Workers 環境変数に設定されていません');
      err.status = 500;
      throw err;
    }
    if (!internalApiKey || internalApiKey !== expectedKey) {
      const err = new Error('内部APIキーが一致しません');
      err.status = 401;
      throw err;
    }
    // Phase 6-B-04: AI 関数は body の email/uid から user を組立てる
    // （GAS executeAiAction が getFirebaseEmailContext_() 由来の値を body に埋込済）
    if (INTERNAL_FUNCTIONS_NEED_USER.has(functionName)) {
      const bodyEmail = body.email ? String(body.email).toLowerCase() : '';
      const bodyUid   = body.uid ? String(body.uid) : '';
      if (!bodyEmail && !bodyUid) {
        const err = new Error('AI 関数の呼出に email または uid が必要です');
        err.status = 400;
        throw err;
      }
      user = { email: bodyEmail, uid: bodyUid };
    }
  } else if (!PUBLIC_FUNCTIONS.has(functionName)) {
    // Firebase ID トークン方式（既存パス）
    // Phase 5-E-11: 未認証・検証失敗は HTTP 401 を返す（index.js:24 の
    // `(typeof e.status === 'number') ? e.status : 500` でそのまま伝播する）
    if (!idToken) {
      const err = new Error('認証トークンがありません');
      err.status = 401;
      throw err;
    }
    user = await verifyFirebaseIdToken(idToken, env);
    if (!user) {
      const err = new Error('認証失敗');
      err.status = 401;
      throw err;
    }
  }

  return handler(args, env, user);
}
