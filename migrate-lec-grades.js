/**
 * migrate-lec-grades.js
 * GAS UserProperties (_UP_*_LEC_GRADES) → Supabase staffs.lec_grades 移行スクリプト
 * 前提: ALTER TABLE staffs ADD COLUMN lec_grades JSONB DEFAULT '[]'::jsonb 実行済み
 * 実行: GAS エディタで migrateLecGradesDryRun() → 確認後 migrateLecGrades()
 * 完了後このファイルは削除可（一回限り）
 */

function migrateLecGradesDryRun() { migrateLecGrades_(true); }
function migrateLecGrades()       { migrateLecGrades_(false); }

function migrateLecGrades_(dryRun) {
  var label = dryRun ? '[DRY RUN] ' : '[本番] ';
  Logger.log(label + '移行開始: _UP_*_LEC_GRADES → staffs.lec_grades');

  // 全スクリプトプロパティを一括取得
  var props = PropertiesService.getScriptProperties().getProperties();

  // 全スタッフを Supabase から取得（id と全メールバリエーションを使用）
  var allStaff;
  try {
    allStaff = supabaseSelect_('staffs', 'select=id,email,emails');
  } catch (e) {
    Logger.log('❌ staffs 取得エラー: ' + e);
    return;
  }

  var updated = 0, skipped = 0, failed = 0;

  allStaff.forEach(function(row) {
    try {
      var emails = [];
      if (Array.isArray(row.emails) && row.emails.length > 0) {
        emails = row.emails;
      } else if (row.email) {
        emails = [row.email];
      }

      // 全メールバリエーションで LEC_GRADES キーを検索
      var grades = null;
      var matchedKey = null;
      emails.forEach(function(email) {
        if (grades !== null) return;
        var safeEmail = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
        var propKey = '_UP_' + safeEmail + '_LEC_GRADES';
        if (props[propKey]) {
          var parsed = safeJsonParse_(props[propKey], null);
          if (parsed !== null && Array.isArray(parsed) && parsed.length > 0) {
            grades = parsed;
            matchedKey = propKey;
          }
        }
      });

      if (grades !== null) {
        Logger.log(label + '更新: id=' + row.id +
                   ' email=' + (row.email || '') +
                   ' grades=' + JSON.stringify(grades) +
                   ' (key=' + matchedKey + ')');
        if (!dryRun) {
          supabaseUpsert_('staffs', { id: row.id, lec_grades: grades }, 'id');
        }
        updated++;
      } else {
        Logger.log('スキップ（LEC_GRADES 未設定）: id=' + row.id + ' email=' + (row.email || ''));
        skipped++;
      }
    } catch (e) {
      Logger.log('⚠ エラー（スキップ）: id=' + row.id + ' ' + e);
      failed++;
    }
  });

  Logger.log(label + '完了: 更新=' + updated + ' スキップ=' + skipped + ' エラー=' + failed +
             (dryRun ? '（ドライラン・DB 書き込みなし）' : '（Supabase 書き込み済み）'));
}
