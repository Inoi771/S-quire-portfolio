import { verifyFirebaseIdToken } from './auth.js';
import { ping } from './functions/ping.js';
import { getAdminEmails } from './functions/admin.js';
import { getUserProfile, getAppStartupData, saveLecGrades, getSettings, updateSettings } from './functions/settings.js';
import { getMasterData, getGradesYearFolders, getSchoolAverages, getGradeDataByStudentAndTest, getDeletedStudents, getStudentsWithGradesByTest, getStudentListWithGrades, updateStudentInfo, deleteStudent, restoreStudent, submitGradeData, saveExamResult } from './functions/students.js';
import { getGradeAnalysis, getStudentAnalysis } from './functions/analysis.js';
import { kv_get, kv_set, kv_delete, kv_list } from './functions/kv.js';
import {
  setBasicTestDateOverride,
  deleteBasicTestDateOverride,
  setBasicTestDetails,
  deleteBasicTestDetails,
  setPublicHighExamDateOverride,
  deletePublicHighExamDateOverride,
  deleteJukuEventOverride,
  setJukuEventOverride,
  addClosedDayExtra,
  removeComputedClosedDay,
  deleteClosedDayOverride,
  setLectureDeadlineOverride,
  deleteLectureDeadlineOverride
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
  getNormalClassSectionsForWeb
} from './functions/features.js';

// 認証不要の関数
const PUBLIC_FUNCTIONS = new Set(['ping']);

// INTERNAL_API_KEY（body.internalApiKey）で認証する内部 API
// Firebase ID トークンではなく共有シークレットで認証（GAS → Workers 間の信頼パス）
const INTERNAL_FUNCTIONS = new Set(['kv_get', 'kv_set', 'kv_delete', 'kv_list']);

// functionName → handler マップ
const HANDLERS = {
  ping,
  getAdminEmails,
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
  saveLecGrades,
  getSettings,
  updateSettings,
  kv_get,
  kv_set,
  kv_delete,
  kv_list,
  setBasicTestDateOverride,
  deleteBasicTestDateOverride,
  setBasicTestDetails,
  deleteBasicTestDetails,
  setPublicHighExamDateOverride,
  deletePublicHighExamDateOverride,
  deleteJukuEventOverride,
  setJukuEventOverride,
  addClosedDayExtra,
  removeComputedClosedDay,
  deleteClosedDayOverride,
  setLectureDeadlineOverride,
  deleteLectureDeadlineOverride,
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
  getNormalClassSectionsForWeb
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
  } else if (!PUBLIC_FUNCTIONS.has(functionName)) {
    // Firebase ID トークン方式（既存パス）
    if (!idToken) throw new Error('認証トークンがありません');
    user = await verifyFirebaseIdToken(idToken, env);
    if (!user) throw new Error('認証失敗');
  }

  return handler(args, env, user);
}
