import { verifyFirebaseIdToken } from './auth.js';
import { ping } from './functions/ping.js';
import { getAdminEmails } from './functions/admin.js';
import { getUserProfile, getAppStartupData } from './functions/settings.js';
import { getMasterData, getGradesYearFolders, getSchoolAverages, getGradeDataByStudentAndTest, getDeletedStudents, getStudentsWithGradesByTest, getStudentListWithGrades, updateStudentInfo, deleteStudent, restoreStudent } from './functions/students.js';
import { getGradeAnalysis, getStudentAnalysis } from './functions/analysis.js';

// 認証不要の関数
const PUBLIC_FUNCTIONS = new Set(['ping']);

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
  restoreStudent
};

export async function handleApiCall(body, env) {
  // gas-bridge は { function: ... } 形式で送信するため両方受け付ける
  const functionName = body.functionName || body.function;
  const { args = [], idToken } = body;

  if (!functionName) {
    throw new Error('functionName が指定されていません');
  }

  const handler = HANDLERS[functionName];
  if (!handler) {
    throw new Error(`未知の関数: ${functionName}`);
  }

  // 認証チェック（PUBLIC_FUNCTIONS 以外は必須）
  let user = null;
  if (!PUBLIC_FUNCTIONS.has(functionName)) {
    if (!idToken) throw new Error('認証トークンがありません');
    user = await verifyFirebaseIdToken(idToken, env);
    if (!user) throw new Error('認証失敗');
  }

  return handler(args, env, user);
}
