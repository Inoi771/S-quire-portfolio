// features.js AI 知識ベース / 講習挨拶文 / 講習期間 / 通常授業設定 の Workers ポート
//
// Phase 5-E-9b-2a（本コミット）:
//       F1  getAiKnowledgeBase        (読取・R-例外・Admin 必須)
//       F2  saveAiKnowledgeEntry      (書込・id 指定で upsert)
//       F3  deleteAiKnowledgeEntry    (書込・filter 除去)
//       F11 getLectureGreetings       (読取・単純 KV)
//       F12 saveLectureGreetings      (書込・単純 KV)
//
// 以降のサブセッションで追加予定：
//   5-E-9b-2a 継続: F5/F6/F7 講習期間 3 件（computeDefaultLectureDates_ と
//                   日付計算ヘルパーチェインを別セッションで合わせて移植）
//   5-E-9b-2b:     F8/F13/F15（マイグレ書込副作用あり 3 件）
//   5-E-9b-3:      F9/F10/F14/F16/F17（PRICING シンク群 5 件）
//
// grades.js（5-E-9b-1）で確立した「低レベル KV ラッパー + denyIfNotAdmin_ +
// KV キー定数」の構造を features.js でも再現する。Admin メッセージは
// features.js 側が一貫して `'Admin のみアクセス可能'` なので 1 系統のみ。

import { isAdminUser } from './auth.js';

const PROP_PREFIX = 'prop:';

// ─── KV キー名（GAS code.js の PROP_KEYS / CONFIG_PROP_KEYS と一致） ───
const KEY_AI_KNOWLEDGE_BASE      = 'AI_KNOWLEDGE_BASE';
const KEY_LECTURE_GREETINGS      = 'LECTURE_GREETINGS_CONFIG';

// ─── 低レベル KV ラッパー（grades.js と同パターン） ───
async function readKv_(env, key) {
  return (await env.KV.get(PROP_PREFIX + key)) ?? '';
}
async function writeJson_(env, key, obj) {
  await env.KV.put(PROP_PREFIX + key, JSON.stringify(obj));
}

// ─── Admin 判定ヘルパー（features.js は 1 系統） ───
async function denyIfNotAdmin_(env, user) {
  if (await isAdminUser(env, user)) return null;
  return { success: false, error: 'Admin のみアクセス可能' };
}

// ─── 公開関数 ───

/**
 * AI ナレッジベース（手動 KB）の全エントリを取得する（F1・Admin 必須）
 * GAS features.js:1872 と同じ。R-例外で読取でも Admin 判定あり。
 */
export async function getAiKnowledgeBase(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const raw = await readKv_(env, KEY_AI_KNOWLEDGE_BASE);
    const entries = raw ? JSON.parse(raw) : [];
    return { success: true, entries };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * AI ナレッジベースのエントリを追加・更新する（F2・Admin のみ）
 * GAS features.js:1892 と同じ。id 指定で既存更新、未指定で新規追加。
 * 新規時 id = `'kb_' + Date.now()`。`updatedAt` は ISO 文字列を常に付与。
 * @param {Array} args [entryJson]
 */
export async function saveAiKnowledgeEntry(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [entryJson] = args || [];
    const entry = JSON.parse(entryJson);
    if (!entry.category || !entry.content) {
      return { success: false, error: 'カテゴリと内容は必須です' };
    }
    const raw = await readKv_(env, KEY_AI_KNOWLEDGE_BASE);
    const entries = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();

    if (entry.id) {
      // 既存 id の update（見つからなければエラー）
      let found = false;
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].id === entry.id) {
          entries[i].category  = entry.category;
          entries[i].content   = entry.content;
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
      entries.push({
        id:        'kb_' + Date.now(),
        category:  entry.category,
        content:   entry.content,
        updatedAt: now
      });
    }

    await writeJson_(env, KEY_AI_KNOWLEDGE_BASE, entries);
    return { success: true, message: entry.id ? '更新しました' : '追加しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * AI ナレッジベースのエントリを削除する（F3・Admin のみ）
 * GAS features.js:1945 と同じ。filter 除去・差分がなければ「見つかりません」。
 * @param {Array} args [entryId]
 */
export async function deleteAiKnowledgeEntry(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [entryId] = args || [];
    const raw = await readKv_(env, KEY_AI_KNOWLEDGE_BASE);
    const entries = raw ? JSON.parse(raw) : [];
    const newEntries = entries.filter((e) => e.id !== entryId);
    if (newEntries.length === entries.length) {
      return { success: false, error: '指定されたエントリが見つかりません' };
    }
    await writeJson_(env, KEY_AI_KNOWLEDGE_BASE, newEntries);
    return { success: true, message: '削除しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別学年挨拶文を取得する（F11）
 * GAS features.js:4344 と同じ。純粋 KV 読取・未設定時は空オブジェクト。
 * 戻り値の shape: `{ success, data: { typeId: { gradeKey: "挨拶文", ... } } }`
 */
export async function getLectureGreetings(args, env, user) {
  try {
    const raw = await readKv_(env, KEY_LECTURE_GREETINGS);
    const data = raw ? JSON.parse(raw) : {};
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * 講習別学年挨拶文を保存する（F12・Admin のみ）
 * GAS features.js:4361 と同じ。JSON パース + 型チェック + setProperty のみ。
 * @param {Array} args [dataJson]
 */
export async function saveLectureGreetings(args, env, user) {
  const denied = await denyIfNotAdmin_(env, user);
  if (denied) return denied;
  try {
    const [dataJson] = args || [];
    const data = JSON.parse(dataJson);
    if (!data || typeof data !== 'object') {
      return { success: false, error: 'データ形式が不正です' };
    }
    await writeJson_(env, KEY_LECTURE_GREETINGS, data);
    return { success: true, message: '挨拶文を保存しました' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}
