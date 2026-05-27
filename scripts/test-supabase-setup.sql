-- ============================================================================
-- S-quire テスト用 Supabase セットアップ SQL
-- ----------------------------------------------------------------------------
-- 使い方:
--   1. Supabase ダッシュボード → SQL Editor を開く
--   2. このファイルの中身をすべてコピーして貼り付け
--   3. 「Run」を実行
--
-- 内容:
--   - 8 テーブルの CREATE TABLE
--   - RLS 有効化 + 「認証済みユーザーは全操作可能」ポリシー
--   - SQL 関数(RPC) 6 個（DATA.md 記載の 5 個 + コード必須の find_staff_by_auth）
--   - 徳島県の架空の名前で生徒 10 名 + 複数テスト分の成績データ
--
-- 注意:
--   - 何度でも安全に再実行できるよう DROP IF EXISTS を併用
--   - 本番には絶対に流さないこと（テスト環境専用）
-- ============================================================================

-- ============================================================================
-- 1. 既存オブジェクトの掃除（再実行用）
-- ============================================================================

DROP FUNCTION IF EXISTS get_campus_averages(integer, text);
DROP FUNCTION IF EXISTS get_grades_years();
DROP FUNCTION IF EXISTS get_grade_breakdown(integer, text);
DROP FUNCTION IF EXISTS get_distribution(integer, text);
DROP FUNCTION IF EXISTS get_deviation_stats(integer, text);
DROP FUNCTION IF EXISTS find_staff_by_auth(text, text);

DROP TABLE IF EXISTS ai_feedback           CASCADE;
DROP TABLE IF EXISTS ai_learned_knowledge  CASCADE;
DROP TABLE IF EXISTS student_analysis      CASCADE;
DROP TABLE IF EXISTS test_analysis         CASCADE;
DROP TABLE IF EXISTS school_averages       CASCADE;
DROP TABLE IF EXISTS grades                CASCADE;
DROP TABLE IF EXISTS students              CASCADE;
DROP TABLE IF EXISTS staffs                CASCADE;


-- ============================================================================
-- 2. テーブル定義
-- ============================================================================

-- ---------- students ----------
-- 生徒マスタ。id は {campus2}{year4}{grade2}{seq2} の 10 桁文字列。
CREATE TABLE students (
  id                  TEXT PRIMARY KEY,
  student_id          TEXT NOT NULL,
  campus              TEXT NOT NULL,
  registration_year   INTEGER,
  registration_grade  INTEGER,
  sei                 TEXT NOT NULL DEFAULT '',
  mei                 TEXT NOT NULL DEFAULT '',
  sei_furigana        TEXT NOT NULL DEFAULT '',
  mei_furigana        TEXT NOT NULL DEFAULT '',
  school_name         TEXT NOT NULL DEFAULT '',
  is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 受験情報（中3専用 / 7 フィールド）
  jukoukou1           TEXT DEFAULT '',
  jukoukou1_gakka     TEXT DEFAULT '',
  jukoukou1_gokaku    TEXT DEFAULT '',
  ikusei              TEXT DEFAULT '',
  jukoukou2           TEXT DEFAULT '',
  jukoukou2_gakka     TEXT DEFAULT '',
  jukoukou2_gokaku    TEXT DEFAULT ''
);
CREATE INDEX idx_students_campus     ON students(campus);
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_is_deleted ON students(is_deleted);


-- ---------- grades ----------
-- 成績データ。id は {studentId}_{safeTestName}_{fiscalYear}。
CREATE TABLE grades (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL,
  test_name       TEXT NOT NULL,
  fiscal_year     INTEGER NOT NULL,
  kokugo          INTEGER,
  shakai          INTEGER,
  sugaku          INTEGER,
  rika            INTEGER,
  eigo            INTEGER,
  total           INTEGER,
  average         NUMERIC(5,1),
  shogaku1        TEXT DEFAULT '',
  shogaku1_gakka  TEXT DEFAULT '',
  shogaku2        TEXT DEFAULT '',
  shogaku2_gakka  TEXT DEFAULT '',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  student_name    TEXT DEFAULT '',
  campus          TEXT DEFAULT ''
);
CREATE INDEX idx_grades_student_id  ON grades(student_id);
CREATE INDEX idx_grades_fiscal_year ON grades(fiscal_year);
CREATE INDEX idx_grades_test_name   ON grades(test_name);
CREATE INDEX idx_grades_campus      ON grades(campus);


-- ---------- school_averages ----------
-- 学校別平均点。id は {year}_{safeTestName}。averages は JSONB 配列。
CREATE TABLE school_averages (
  id          TEXT PRIMARY KEY,
  year        INTEGER NOT NULL,
  test_name   TEXT NOT NULL,
  averages    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_school_averages_year_test ON school_averages(year, test_name);


-- ---------- test_analysis ----------
-- テスト全体 AI 分析。
CREATE TABLE test_analysis (
  id              TEXT PRIMARY KEY,
  year            INTEGER NOT NULL,
  test_name       TEXT NOT NULL,
  analysis_json   JSONB,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_test_analysis_year_test ON test_analysis(year, test_name);


-- ---------- student_analysis ----------
-- 生徒別 AI 分析。
CREATE TABLE student_analysis (
  id              TEXT PRIMARY KEY,
  student_id      TEXT NOT NULL,
  test_name       TEXT NOT NULL,
  year            INTEGER NOT NULL,
  analysis_json   JSONB,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_student_analysis_student_id ON student_analysis(student_id);
CREATE INDEX idx_student_analysis_year_test  ON student_analysis(year, test_name);


-- ---------- ai_learned_knowledge ----------
-- AI 自動学習ナレッジ。id は lk_{ms}。
CREATE TABLE ai_learned_knowledge (
  id          TEXT PRIMARY KEY,
  category    TEXT NOT NULL DEFAULT 'その他',
  content     TEXT NOT NULL,
  reason      TEXT DEFAULT '',
  source      TEXT DEFAULT 'conversation',
  learned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ
);
CREATE INDEX idx_ai_learned_knowledge_learned_at ON ai_learned_knowledge(learned_at DESC);


-- ---------- ai_feedback ----------
-- AI フィードバック。id は fb_{ms}。
CREATE TABLE ai_feedback (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  user_query   TEXT DEFAULT '',
  resolved     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX idx_ai_feedback_created_at ON ai_feedback(created_at DESC);
CREATE INDEX idx_ai_feedback_resolved   ON ai_feedback(resolved);


-- ---------- staffs ----------
-- スタッフ情報。id は teacherId（例: T1716700000000_xxxx）。
CREATE TABLE staffs (
  id                     TEXT PRIMARY KEY,
  email                  TEXT,
  emails                 TEXT[] DEFAULT ARRAY[]::TEXT[],
  firebase_uid           TEXT,
  firebase_uids          TEXT[] DEFAULT ARRAY[]::TEXT[],
  name                   TEXT DEFAULT '',
  display_name           TEXT DEFAULT '',
  subjects               JSONB DEFAULT '[]'::jsonb,
  preferred_campuses     JSONB DEFAULT '[]'::jsonb,
  ai_assistant_name      TEXT DEFAULT '',
  ai_personality         TEXT DEFAULT '',
  theme_color            TEXT DEFAULT '',
  line_user_id           TEXT,
  notification_method    TEXT DEFAULT 'gmail',
  notification_email     TEXT DEFAULT '',
  notification_emails    JSONB DEFAULT '[]'::jsonb,
  scheduler_notif_emails JSONB DEFAULT '[]'::jsonb,
  scheduler_notif_prefs  JSONB DEFAULT '{}'::jsonb,
  lec_grades             JSONB DEFAULT '[]'::jsonb,
  added_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ
);
CREATE INDEX idx_staffs_email                ON staffs(email);
CREATE INDEX idx_staffs_firebase_uid         ON staffs(firebase_uid);
CREATE INDEX idx_staffs_emails_gin           ON staffs USING GIN(emails);
CREATE INDEX idx_staffs_firebase_uids_gin    ON staffs USING GIN(firebase_uids);


-- ============================================================================
-- 3. RLS（Row Level Security）
--    テスト環境のため「認証済みユーザーは全操作可能」のシンプルなポリシー
-- ============================================================================

ALTER TABLE students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades               ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_averages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_analysis        ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analysis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_learned_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE staffs               ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON students             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON grades               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON school_averages      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON test_analysis        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON student_analysis     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON ai_learned_knowledge FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON ai_feedback          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON staffs               FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================================
-- 4. SQL 関数（RPC）
-- ============================================================================

-- ---------- get_campus_averages(p_year, p_test) ----------
-- 校舎別 5 教科平均（'all' 行を先頭に含む）。フロントは campus_code カラム名で受ける。
CREATE OR REPLACE FUNCTION get_campus_averages(p_year INTEGER, p_test TEXT)
RETURNS TABLE (
  campus_code TEXT,
  count       BIGINT,
  kokugo      NUMERIC,
  shakai      NUMERIC,
  sugaku      NUMERIC,
  rika        NUMERIC,
  eigo        NUMERIC,
  total       NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    'all'::TEXT                  AS campus_code,
    COUNT(*)::BIGINT             AS count,
    ROUND(AVG(g.kokugo)::numeric, 1) AS kokugo,
    ROUND(AVG(g.shakai)::numeric, 1) AS shakai,
    ROUND(AVG(g.sugaku)::numeric, 1) AS sugaku,
    ROUND(AVG(g.rika)::numeric,   1) AS rika,
    ROUND(AVG(g.eigo)::numeric,   1) AS eigo,
    ROUND(AVG(g.total)::numeric,  1) AS total
  FROM grades g
  WHERE g.fiscal_year = p_year
    AND g.test_name   = p_test
  UNION ALL
  SELECT
    COALESCE(NULLIF(g.campus, ''), 'unknown')::TEXT AS campus_code,
    COUNT(*)::BIGINT                                AS count,
    ROUND(AVG(g.kokugo)::numeric, 1)                AS kokugo,
    ROUND(AVG(g.shakai)::numeric, 1)                AS shakai,
    ROUND(AVG(g.sugaku)::numeric, 1)                AS sugaku,
    ROUND(AVG(g.rika)::numeric,   1)                AS rika,
    ROUND(AVG(g.eigo)::numeric,   1)                AS eigo,
    ROUND(AVG(g.total)::numeric,  1)                AS total
  FROM grades g
  WHERE g.fiscal_year = p_year
    AND g.test_name   = p_test
  GROUP BY COALESCE(NULLIF(g.campus, ''), 'unknown')
  ORDER BY campus_code;
$$;


-- ---------- get_grades_years() ----------
-- DISTINCT fiscal_year を新しい順で返す。
CREATE OR REPLACE FUNCTION get_grades_years()
RETURNS TABLE (fiscal_year INTEGER)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT g.fiscal_year
  FROM grades g
  WHERE g.fiscal_year IS NOT NULL
  ORDER BY g.fiscal_year DESC;
$$;


-- ---------- get_grade_breakdown(p_year, p_test) ----------
-- 学年コード別人数。student_id 先頭 6〜8 桁から登録学年コードを抽出する代わりに、
-- students.registration_grade を JOIN 参照（GAS 版実装に準拠）。
-- 戻り値は { "13": 5, "14": 3, "15": 2 } の JSONB。
CREATE OR REPLACE FUNCTION get_grade_breakdown(p_year INTEGER, p_test TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      LPAD(s.registration_grade::TEXT, 2, '0'),
      cnt
    ),
    '{}'::jsonb
  )
  FROM (
    SELECT s2.registration_grade, COUNT(*)::INTEGER AS cnt
    FROM grades g
    JOIN students s2 ON s2.id = g.student_id
    WHERE g.fiscal_year = p_year
      AND g.test_name   = p_test
      AND s2.registration_grade IS NOT NULL
    GROUP BY s2.registration_grade
  ) s;
$$;


-- ---------- get_distribution(p_year, p_test) ----------
-- 教科別 10 点刻みヒストグラム + 合計 50 点刻みヒストグラム。
-- 戻り値:
-- {
--   "kokugo": { "0-9": 2, "10-19": 3, ... "90-100": 1 },
--   "shakai": {...}, "sugaku": {...}, "rika": {...}, "eigo": {...},
--   "total":  { "0-49": 1, "50-99": 0, ... "450-500": 1 }
-- }
CREATE OR REPLACE FUNCTION get_distribution(p_year INTEGER, p_test TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSONB := '{}'::jsonb;
  subj   TEXT;
  part   JSONB;
  total_part JSONB;
BEGIN
  -- 教科別 10 点刻み
  FOREACH subj IN ARRAY ARRAY['kokugo','shakai','sugaku','rika','eigo']
  LOOP
    EXECUTE format($f$
      SELECT COALESCE(jsonb_object_agg(bucket, cnt), '{}'::jsonb)
      FROM (
        SELECT
          CASE
            WHEN %1$I >= 90 THEN '90-100'
            ELSE (FLOOR(%1$I::numeric / 10) * 10)::INT::TEXT
                 || '-'
                 || (FLOOR(%1$I::numeric / 10) * 10 + 9)::INT::TEXT
          END AS bucket,
          COUNT(*)::INTEGER AS cnt
        FROM grades
        WHERE fiscal_year = $1
          AND test_name   = $2
          AND %1$I IS NOT NULL
        GROUP BY bucket
      ) t
    $f$, subj)
    INTO part USING p_year, p_test;
    result := result || jsonb_build_object(subj, COALESCE(part, '{}'::jsonb));
  END LOOP;

  -- 合計（50 点刻み）
  SELECT COALESCE(jsonb_object_agg(bucket, cnt), '{}'::jsonb)
  INTO total_part
  FROM (
    SELECT
      (FLOOR(total::numeric / 50) * 50)::INT::TEXT
        || '-'
        || (FLOOR(total::numeric / 50) * 50 + 49)::INT::TEXT AS bucket,
      COUNT(*)::INTEGER AS cnt
    FROM grades
    WHERE fiscal_year = p_year
      AND test_name   = p_test
      AND total IS NOT NULL
    GROUP BY bucket
  ) t;

  result := result || jsonb_build_object('total', COALESCE(total_part, '{}'::jsonb));
  RETURN result;
END;
$$;


-- ---------- get_deviation_stats(p_year, p_test) ----------
-- 偏差値計算用の平均・標準偏差（教科別 + 合計）。
-- 戻り値:
-- {
--   "kokugo": { "avg": 60.2, "sigma": 12.3 },
--   "shakai": {...}, "sugaku": {...}, "rika": {...}, "eigo": {...},
--   "total":  { "avg": 305.0, "sigma": 45.6 }
-- }
CREATE OR REPLACE FUNCTION get_deviation_stats(p_year INTEGER, p_test TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'kokugo', jsonb_build_object('avg', ROUND(AVG(kokugo)::numeric, 2), 'sigma', ROUND(COALESCE(STDDEV_POP(kokugo), 0)::numeric, 2)),
    'shakai', jsonb_build_object('avg', ROUND(AVG(shakai)::numeric, 2), 'sigma', ROUND(COALESCE(STDDEV_POP(shakai), 0)::numeric, 2)),
    'sugaku', jsonb_build_object('avg', ROUND(AVG(sugaku)::numeric, 2), 'sigma', ROUND(COALESCE(STDDEV_POP(sugaku), 0)::numeric, 2)),
    'rika',   jsonb_build_object('avg', ROUND(AVG(rika)::numeric,   2), 'sigma', ROUND(COALESCE(STDDEV_POP(rika),   0)::numeric, 2)),
    'eigo',   jsonb_build_object('avg', ROUND(AVG(eigo)::numeric,   2), 'sigma', ROUND(COALESCE(STDDEV_POP(eigo),   0)::numeric, 2)),
    'total',  jsonb_build_object('avg', ROUND(AVG(total)::numeric,  2), 'sigma', ROUND(COALESCE(STDDEV_POP(total),  0)::numeric, 2))
  )
  FROM grades
  WHERE fiscal_year = p_year
    AND test_name   = p_test;
$$;


-- ---------- find_staff_by_auth(p_uid, p_email) ----------
-- DATA.md には未記載だが、認証コードで頻繁に呼ばれるため同梱。
-- Firebase UID または email で staffs を照合する（4 パターン: uid 単体, uids 配列, email 単体, emails 配列）。
CREATE OR REPLACE FUNCTION find_staff_by_auth(p_uid TEXT, p_email TEXT)
RETURNS SETOF staffs
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM staffs
  WHERE
    (p_uid   IS NOT NULL AND (firebase_uid = p_uid   OR p_uid   = ANY(firebase_uids)))
    OR
    (p_email IS NOT NULL AND (email        = p_email OR p_email = ANY(emails)))
  LIMIT 1;
$$;


-- ============================================================================
-- 5. ダミーデータ
-- ============================================================================

-- ---------- staffs ----------
INSERT INTO staffs (id, email, emails, name, display_name, subjects, preferred_campuses, ai_assistant_name, ai_personality, theme_color, notification_method, added_at)
VALUES
  ('T1716700000001_demo01', 'admin@example.com',   ARRAY['admin@example.com'],   '井ノ井 真司', '井ノ井先生',  '["数学","理科"]'::jsonb,   '["01","02"]'::jsonb, 'イノイマン', 'polite',  '#43e97b', 'gmail', NOW()),
  ('T1716700000002_demo02', 'teacher2@example.com', ARRAY['teacher2@example.com'], '阿波野 美咲', '阿波野先生',  '["英語"]'::jsonb,           '["02"]'::jsonb,      'スクーン',   'casual',  '#3b82f6', 'gmail', NOW()),
  ('T1716700000003_demo03', 'teacher3@example.com', ARRAY['teacher3@example.com'], '鳴海 拓也',   '鳴海先生',   '["国語","社会"]'::jsonb,   '["03"]'::jsonb,      'エスク',     'polite',  '#f59e0b', 'line',  NOW());


-- ---------- students ----------
-- 校舎コード: 01=徳島本校, 02=鳴門校, 03=阿南校
-- 学年コード: 13=中1, 14=中2, 15=中3
-- ID = campus(2) + year(4) + grade(2) + seq(2)
INSERT INTO students (id, student_id, campus, registration_year, registration_grade, sei, mei, sei_furigana, mei_furigana, school_name, is_deleted, created_at) VALUES
  ('0120251501', '0120251501', '01', 2025, 15, '阿波野', '陽翔',   'あわの',     'はると',   '城東中学校',   FALSE, NOW()),
  ('0120251502', '0120251502', '01', 2025, 15, '三好',   '美咲',   'みよし',     'みさき',   '城ノ内中学校', FALSE, NOW()),
  ('0120251401', '0120251401', '01', 2025, 14, '板野',   '蓮',     'いたの',     'れん',     '城西中学校',   FALSE, NOW()),
  ('0120251402', '0120251402', '01', 2025, 14, '鳴海',   '結衣',   'なるみ',     'ゆい',     '城東中学校',   FALSE, NOW()),
  ('0120251301', '0120251301', '01', 2025, 13, '吉野川', '颯太',   'よしのがわ', 'そうた',   '富田中学校',   FALSE, NOW()),
  ('0220251501', '0220251501', '02', 2025, 15, '鳴門',   '葵',     'なると',     'あおい',   '鳴門第一中学校', FALSE, NOW()),
  ('0220251502', '0220251502', '02', 2025, 15, '撫養',   '大翔',   'むや',       'ひろと',   '鳴門第二中学校', FALSE, NOW()),
  ('0220251401', '0220251401', '02', 2025, 14, '池田',   '凜',     'いけだ',     'りん',     '鳴門第一中学校', FALSE, NOW()),
  ('0320251501', '0320251501', '03', 2025, 15, '那賀',   '陸',     'なか',       'りく',     '阿南中学校',   FALSE, NOW()),
  ('0320251401', '0320251401', '03', 2025, 14, '海部',   '芽依',   'かいふ',     'めい',     '富岡東中学校', FALSE, NOW());

-- 中3生に受験情報を一部投入
UPDATE students SET
  jukoukou1 = '城東高校', jukoukou1_gakka = '普通科', jukoukou1_gokaku = '',
  ikusei    = '城ノ内高校',
  jukoukou2 = '徳島市立高校', jukoukou2_gakka = '普通科', jukoukou2_gokaku = ''
WHERE id = '0120251501';

UPDATE students SET
  jukoukou1 = '城ノ内高校', jukoukou1_gakka = '普通科', jukoukou1_gokaku = '',
  ikusei    = '',
  jukoukou2 = '徳島北高校', jukoukou2_gakka = '国際英語科', jukoukou2_gokaku = ''
WHERE id = '0120251502';

UPDATE students SET
  jukoukou1 = '鳴門高校', jukoukou1_gakka = '普通科', jukoukou1_gokaku = '',
  ikusei    = '',
  jukoukou2 = '鳴門渦潮高校', jukoukou2_gakka = 'スポーツ科学科', jukoukou2_gokaku = ''
WHERE id = '0220251501';

UPDATE students SET
  jukoukou1 = '阿南光高校', jukoukou1_gakka = '工業技術科', jukoukou1_gokaku = '',
  ikusei    = '',
  jukoukou2 = '富岡東高校', jukoukou2_gakka = '普通科', jukoukou2_gokaku = ''
WHERE id = '0320251501';


-- ---------- grades ----------
-- 複数テスト分（第1回基礎学力テスト、第2回基礎学力テスト、第3回基礎学力テスト）
-- 教科コード: 国/社/数/理/英 各 100 点満点、total = 5 教科合計

INSERT INTO grades (id, student_id, test_name, fiscal_year, kokugo, shakai, sugaku, rika, eigo, total, average, student_name, campus, recorded_at) VALUES
  -- ----- 第1回基礎学力テスト -----
  ('0120251501_第1回基礎学力テスト_2025', '0120251501', '第1回基礎学力テスト', 2025, 72, 65, 80, 78, 70, 365, 73.0, '阿波野 陽翔', '01', NOW() - INTERVAL '90 days'),
  ('0120251502_第1回基礎学力テスト_2025', '0120251502', '第1回基礎学力テスト', 2025, 88, 82, 75, 70, 90, 405, 81.0, '三好 美咲',   '01', NOW() - INTERVAL '90 days'),
  ('0120251401_第1回基礎学力テスト_2025', '0120251401', '第1回基礎学力テスト', 2025, 60, 55, 68, 62, 58, 303, 60.6, '板野 蓮',     '01', NOW() - INTERVAL '90 days'),
  ('0120251402_第1回基礎学力テスト_2025', '0120251402', '第1回基礎学力テスト', 2025, 78, 80, 72, 76, 82, 388, 77.6, '鳴海 結衣',   '01', NOW() - INTERVAL '90 days'),
  ('0120251301_第1回基礎学力テスト_2025', '0120251301', '第1回基礎学力テスト', 2025, 55, 50, 60, 58, 52, 275, 55.0, '吉野川 颯太', '01', NOW() - INTERVAL '90 days'),
  ('0220251501_第1回基礎学力テスト_2025', '0220251501', '第1回基礎学力テスト', 2025, 65, 70, 85, 82, 68, 370, 74.0, '鳴門 葵',     '02', NOW() - INTERVAL '90 days'),
  ('0220251502_第1回基礎学力テスト_2025', '0220251502', '第1回基礎学力テスト', 2025, 58, 60, 90, 88, 50, 346, 69.2, '撫養 大翔',   '02', NOW() - INTERVAL '90 days'),
  ('0220251401_第1回基礎学力テスト_2025', '0220251401', '第1回基礎学力テスト', 2025, 75, 78, 70, 72, 80, 375, 75.0, '池田 凜',     '02', NOW() - INTERVAL '90 days'),
  ('0320251501_第1回基礎学力テスト_2025', '0320251501', '第1回基礎学力テスト', 2025, 50, 48, 78, 70, 45, 291, 58.2, '那賀 陸',     '03', NOW() - INTERVAL '90 days'),
  ('0320251401_第1回基礎学力テスト_2025', '0320251401', '第1回基礎学力テスト', 2025, 82, 78, 65, 70, 88, 383, 76.6, '海部 芽依',   '03', NOW() - INTERVAL '90 days'),

  -- ----- 第2回基礎学力テスト -----
  ('0120251501_第2回基礎学力テスト_2025', '0120251501', '第2回基礎学力テスト', 2025, 78, 70, 85, 82, 75, 390, 78.0, '阿波野 陽翔', '01', NOW() - INTERVAL '60 days'),
  ('0120251502_第2回基礎学力テスト_2025', '0120251502', '第2回基礎学力テスト', 2025, 92, 85, 78, 75, 92, 422, 84.4, '三好 美咲',   '01', NOW() - INTERVAL '60 days'),
  ('0120251401_第2回基礎学力テスト_2025', '0120251401', '第2回基礎学力テスト', 2025, 65, 60, 72, 68, 62, 327, 65.4, '板野 蓮',     '01', NOW() - INTERVAL '60 days'),
  ('0120251402_第2回基礎学力テスト_2025', '0120251402', '第2回基礎学力テスト', 2025, 80, 82, 75, 78, 85, 400, 80.0, '鳴海 結衣',   '01', NOW() - INTERVAL '60 days'),
  ('0120251301_第2回基礎学力テスト_2025', '0120251301', '第2回基礎学力テスト', 2025, 60, 55, 65, 62, 58, 300, 60.0, '吉野川 颯太', '01', NOW() - INTERVAL '60 days'),
  ('0220251501_第2回基礎学力テスト_2025', '0220251501', '第2回基礎学力テスト', 2025, 70, 75, 88, 85, 72, 390, 78.0, '鳴門 葵',     '02', NOW() - INTERVAL '60 days'),
  ('0220251502_第2回基礎学力テスト_2025', '0220251502', '第2回基礎学力テスト', 2025, 62, 65, 92, 90, 55, 364, 72.8, '撫養 大翔',   '02', NOW() - INTERVAL '60 days'),
  ('0220251401_第2回基礎学力テスト_2025', '0220251401', '第2回基礎学力テスト', 2025, 78, 80, 72, 75, 82, 387, 77.4, '池田 凜',     '02', NOW() - INTERVAL '60 days'),
  ('0320251501_第2回基礎学力テスト_2025', '0320251501', '第2回基礎学力テスト', 2025, 55, 52, 80, 72, 50, 309, 61.8, '那賀 陸',     '03', NOW() - INTERVAL '60 days'),
  ('0320251401_第2回基礎学力テスト_2025', '0320251401', '第2回基礎学力テスト', 2025, 85, 80, 70, 72, 90, 397, 79.4, '海部 芽依',   '03', NOW() - INTERVAL '60 days'),

  -- ----- 第3回基礎学力テスト -----
  ('0120251501_第3回基礎学力テスト_2025', '0120251501', '第3回基礎学力テスト', 2025, 82, 75, 88, 85, 80, 410, 82.0, '阿波野 陽翔', '01', NOW() - INTERVAL '30 days'),
  ('0120251502_第3回基礎学力テスト_2025', '0120251502', '第3回基礎学力テスト', 2025, 95, 88, 82, 80, 95, 440, 88.0, '三好 美咲',   '01', NOW() - INTERVAL '30 days'),
  ('0120251401_第3回基礎学力テスト_2025', '0120251401', '第3回基礎学力テスト', 2025, 70, 65, 75, 72, 68, 350, 70.0, '板野 蓮',     '01', NOW() - INTERVAL '30 days'),
  ('0120251402_第3回基礎学力テスト_2025', '0120251402', '第3回基礎学力テスト', 2025, 85, 85, 78, 80, 88, 416, 83.2, '鳴海 結衣',   '01', NOW() - INTERVAL '30 days'),
  ('0120251301_第3回基礎学力テスト_2025', '0120251301', '第3回基礎学力テスト', 2025, 65, 58, 70, 65, 62, 320, 64.0, '吉野川 颯太', '01', NOW() - INTERVAL '30 days'),
  ('0220251501_第3回基礎学力テスト_2025', '0220251501', '第3回基礎学力テスト', 2025, 75, 80, 90, 88, 78, 411, 82.2, '鳴門 葵',     '02', NOW() - INTERVAL '30 days'),
  ('0220251502_第3回基礎学力テスト_2025', '0220251502', '第3回基礎学力テスト', 2025, 65, 68, 95, 92, 60, 380, 76.0, '撫養 大翔',   '02', NOW() - INTERVAL '30 days'),
  ('0220251401_第3回基礎学力テスト_2025', '0220251401', '第3回基礎学力テスト', 2025, 82, 82, 78, 78, 85, 405, 81.0, '池田 凜',     '02', NOW() - INTERVAL '30 days'),
  ('0320251501_第3回基礎学力テスト_2025', '0320251501', '第3回基礎学力テスト', 2025, 60, 55, 82, 75, 55, 327, 65.4, '那賀 陸',     '03', NOW() - INTERVAL '30 days'),
  ('0320251401_第3回基礎学力テスト_2025', '0320251401', '第3回基礎学力テスト', 2025, 88, 82, 75, 75, 92, 412, 82.4, '海部 芽依',   '03', NOW() - INTERVAL '30 days');

-- 中3生に第1志望校情報を付与（成績表 PDF 用 shogaku1 / shogaku1_gakka）
UPDATE grades SET shogaku1 = '城東高校',     shogaku1_gakka = '普通科'        WHERE student_id = '0120251501';
UPDATE grades SET shogaku1 = '城ノ内高校',   shogaku1_gakka = '普通科'        WHERE student_id = '0120251502';
UPDATE grades SET shogaku1 = '鳴門高校',     shogaku1_gakka = '普通科'        WHERE student_id = '0220251501';
UPDATE grades SET shogaku1 = '鳴門渦潮高校', shogaku1_gakka = 'スポーツ科学科' WHERE student_id = '0220251502';
UPDATE grades SET shogaku1 = '阿南光高校',   shogaku1_gakka = '工業技術科'    WHERE student_id = '0320251501';


-- ---------- school_averages ----------
INSERT INTO school_averages (id, year, test_name, averages, updated_at) VALUES
  ('2025_第1回基礎学力テスト', 2025, '第1回基礎学力テスト',
    '[
       {"schoolName":"城東中学校",     "kokugo":70.5, "shakai":68.2, "sugaku":75.0, "rika":72.8, "eigo":71.0},
       {"schoolName":"城ノ内中学校",   "kokugo":75.0, "shakai":72.0, "sugaku":73.5, "rika":70.0, "eigo":78.0},
       {"schoolName":"城西中学校",     "kokugo":65.0, "shakai":60.0, "sugaku":68.0, "rika":63.0, "eigo":62.0},
       {"schoolName":"鳴門第一中学校", "kokugo":68.0, "shakai":70.0, "sugaku":80.0, "rika":78.0, "eigo":66.0},
       {"schoolName":"阿南中学校",     "kokugo":58.0, "shakai":55.0, "sugaku":72.0, "rika":68.0, "eigo":54.0},
       {"schoolName":"平均",           "kokugo":67.3, "shakai":65.0, "sugaku":73.7, "rika":70.4, "eigo":66.2}
     ]'::jsonb,
    NOW()),
  ('2025_第2回基礎学力テスト', 2025, '第2回基礎学力テスト',
    '[
       {"schoolName":"城東中学校",     "kokugo":74.0, "shakai":71.0, "sugaku":78.0, "rika":75.0, "eigo":74.0},
       {"schoolName":"城ノ内中学校",   "kokugo":78.0, "shakai":75.0, "sugaku":76.0, "rika":73.0, "eigo":80.0},
       {"schoolName":"城西中学校",     "kokugo":68.0, "shakai":62.0, "sugaku":70.0, "rika":65.0, "eigo":64.0},
       {"schoolName":"鳴門第一中学校", "kokugo":72.0, "shakai":74.0, "sugaku":82.0, "rika":80.0, "eigo":70.0},
       {"schoolName":"阿南中学校",     "kokugo":62.0, "shakai":58.0, "sugaku":74.0, "rika":70.0, "eigo":58.0},
       {"schoolName":"平均",           "kokugo":70.8, "shakai":68.0, "sugaku":76.0, "rika":72.6, "eigo":69.2}
     ]'::jsonb,
    NOW()),
  ('2025_第3回基礎学力テスト', 2025, '第3回基礎学力テスト',
    '[
       {"schoolName":"城東中学校",     "kokugo":77.0, "shakai":74.0, "sugaku":82.0, "rika":79.0, "eigo":78.0},
       {"schoolName":"城ノ内中学校",   "kokugo":82.0, "shakai":78.0, "sugaku":78.0, "rika":76.0, "eigo":84.0},
       {"schoolName":"城西中学校",     "kokugo":72.0, "shakai":66.0, "sugaku":73.0, "rika":68.0, "eigo":68.0},
       {"schoolName":"鳴門第一中学校", "kokugo":76.0, "shakai":78.0, "sugaku":85.0, "rika":82.0, "eigo":74.0},
       {"schoolName":"阿南中学校",     "kokugo":66.0, "shakai":62.0, "sugaku":77.0, "rika":72.0, "eigo":62.0},
       {"schoolName":"平均",           "kokugo":74.6, "shakai":71.6, "sugaku":79.0, "rika":75.4, "eigo":73.2}
     ]'::jsonb,
    NOW());


-- ---------- test_analysis ----------
INSERT INTO test_analysis (id, year, test_name, analysis_json, generated_at) VALUES
  ('2025_第1回基礎学力テスト', 2025, '第1回基礎学力テスト',
   '{
      "summary": "全体的に数学・理科の理解度が比較的高い一方、英語の定着にばらつきが見られた。城東校(01)が安定的に高得点層を形成している。",
      "subjects": {
        "kokugo": "標準的な記述問題で得点差が出やすかった",
        "sugaku": "計算分野は良好。図形問題で課題",
        "eigo":   "長文読解の精度に個人差が大きい"
      },
      "topPerformers": ["三好 美咲", "鳴海 結衣"],
      "needsSupport": ["吉野川 颯太", "那賀 陸"]
    }'::jsonb,
   NOW() - INTERVAL '85 days'),
  ('2025_第2回基礎学力テスト', 2025, '第2回基礎学力テスト',
   '{
      "summary": "前回から全体的に平均点が +3〜5 点上昇。特に英語の伸びが顕著。",
      "subjects": {
        "sugaku": "応用問題で差が拡大",
        "eigo":   "リスニング対策の効果が見られた"
      },
      "topPerformers": ["三好 美咲", "鳴海 結衣", "池田 凜"],
      "needsSupport": ["那賀 陸"]
    }'::jsonb,
   NOW() - INTERVAL '55 days');


-- ---------- student_analysis ----------
INSERT INTO student_analysis (id, student_id, test_name, year, analysis_json, generated_at) VALUES
  ('0120251501_第2回基礎学力テスト_2025', '0120251501', '第2回基礎学力テスト', 2025,
   '{
      "comment": "5教科ともバランスよく前回から伸び、特に数学・理科の応用問題への対応力が向上しています。志望校の城東高校(普通科)に向けて、英語の長文読解を強化すれば合格可能性はさらに高まります。",
      "deviationValues": {"kokugo":56.2, "shakai":54.8, "sugaku":58.0, "rika":57.5, "eigo":55.0, "total":57.0},
      "passAssessment": {"jukoukou1": {"grade":"B", "percent":68}},
      "displayTestNames": ["第1回基礎学力テスト", "第2回基礎学力テスト"]
    }'::jsonb,
   NOW() - INTERVAL '55 days'),
  ('0120251502_第2回基礎学力テスト_2025', '0120251502', '第2回基礎学力テスト', 2025,
   '{
      "comment": "全教科で県平均を大きく上回り、特に国語・英語の安定感が際立ちます。志望校の城ノ内高校(普通科)はA判定圏内です。",
      "deviationValues": {"kokugo":65.0, "shakai":62.5, "sugaku":54.0, "rika":52.0, "eigo":66.5, "total":62.0},
      "passAssessment": {"jukoukou1": {"grade":"A", "percent":85}},
      "displayTestNames": ["第1回基礎学力テスト", "第2回基礎学力テスト"]
    }'::jsonb,
   NOW() - INTERVAL '55 days');


-- ---------- ai_learned_knowledge ----------
INSERT INTO ai_learned_knowledge (id, category, content, reason, source, learned_at) VALUES
  ('lk_1716700001000', '校舎運用', '徳島本校(01)は月曜と木曜が個別指導日です。',                              '会話から学習', 'conversation', NOW() - INTERVAL '20 days'),
  ('lk_1716700002000', '講師情報', '阿波野先生は英語専門で、長文読解の指導に強みがあります。',                  '会話から学習', 'conversation', NOW() - INTERVAL '15 days'),
  ('lk_1716700003000', '生徒情報', '三好 美咲は読書好きで国語が得意。志望校は城ノ内高校。',                      '会話から学習', 'conversation', NOW() - INTERVAL '10 days'),
  ('lk_1716700004000', 'その他',   '基礎学力テストの平均点は例年 320 点前後で推移している。',                    '統計参照',    'conversation', NOW() - INTERVAL '5 days');


-- ---------- ai_feedback ----------
INSERT INTO ai_feedback (id, type, summary, user_query, resolved, created_at) VALUES
  ('fb_1716700001000', '情報不足',       '阿南校(03)の固定イベント情報がデータに登録されていない',           '阿南校の今週の予定は？',             FALSE, NOW() - INTERVAL '14 days'),
  ('fb_1716700002000', '機能リクエスト', '生徒の偏差値推移を折れ線グラフで表示してほしい',                   '美咲ちゃんの偏差値の推移を見せて',   FALSE, NOW() - INTERVAL '7 days'),
  ('fb_1716700003000', '情報不足',       '撫養先生の担当曜日が未登録',                                       '撫養先生って何曜日に出勤？',        TRUE,  NOW() - INTERVAL '3 days');


-- ============================================================================
-- 完了メッセージ（SQL Editor の Result ペインに表示される）
-- ============================================================================
SELECT
  (SELECT COUNT(*) FROM students)              AS students_count,
  (SELECT COUNT(*) FROM grades)                AS grades_count,
  (SELECT COUNT(*) FROM school_averages)       AS school_averages_count,
  (SELECT COUNT(*) FROM test_analysis)         AS test_analysis_count,
  (SELECT COUNT(*) FROM student_analysis)      AS student_analysis_count,
  (SELECT COUNT(*) FROM ai_learned_knowledge)  AS ai_learned_knowledge_count,
  (SELECT COUNT(*) FROM ai_feedback)           AS ai_feedback_count,
  (SELECT COUNT(*) FROM staffs)                AS staffs_count;
