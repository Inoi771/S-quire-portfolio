// Firestore REST API クライアント（GAS firebase.js をポート）

// ── アクセストークン生成 ──────────────────────────────────────────────────────

export async function getFirestoreAccessToken(env) {
  const cached = await env.KV.get('firestore_token');
  if (cached) return cached;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    sub: env.FIREBASE_CLIENT_EMAIL,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  }));

  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  );
  const jwt = `${header}.${payload}.${b64url(sigBuf)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const { access_token } = await tokenRes.json();
  await env.KV.put('firestore_token', access_token, { expirationTtl: 2940 }); // 49分
  return access_token;
}

// ── ベース URL ────────────────────────────────────────────────────────────────

function firestoreBaseUrl(env) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

async function firestoreHeaders(env) {
  const token = await getFirestoreAccessToken(env);
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function firestoreSet(env, collection, docId, data) {
  const url = `${firestoreBaseUrl(env)}/${collection}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: await firestoreHeaders(env),
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  });
  const code = res.status;
  if (code >= 400) throw new Error(`Firestore書き込みエラー(${code}): ${await res.text()}`);
}

export async function firestoreUpdateFields(env, collection, docId, data) {
  const fieldPaths = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const url = `${firestoreBaseUrl(env)}/${collection}/${encodeURIComponent(docId)}?${fieldPaths}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: await firestoreHeaders(env),
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  });
  const code = res.status;
  if (code >= 400) throw new Error(`Firestore部分更新エラー(${code}): ${await res.text()}`);
}

export async function firestoreGet(env, collection, docId) {
  const url = `${firestoreBaseUrl(env)}/${collection}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, { headers: await firestoreHeaders(env) });
  if (res.status === 404) return null;
  if (res.status >= 400) throw new Error(`Firestore取得エラー(${res.status})`);
  const doc = await res.json();
  if (!doc.fields) return null;
  return fromFirestoreFields(doc.fields);
}

export async function firestoreDelete(env, collection, docId) {
  const url = `${firestoreBaseUrl(env)}/${collection}/${encodeURIComponent(docId)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: await firestoreHeaders(env)
  });
  if (res.status >= 400) throw new Error(`Firestore削除エラー(${res.status})`);
}

// ── クエリ ────────────────────────────────────────────────────────────────────

export async function firestoreQuery(env, collection, filters = [], orderBy = null, limit = null) {
  const url = `${firestoreBaseUrl(env)}:runQuery`;
  const structuredQuery = { from: [{ collectionId: collection }] };
  if (filters.length > 0) {
    structuredQuery.where = filters.length === 1
      ? fsFilter(filters[0])
      : { compositeFilter: { op: 'AND', filters: filters.map(fsFilter) } };
  }
  if (orderBy) structuredQuery.orderBy = [{ field: { fieldPath: orderBy.field }, direction: orderBy.direction || 'ASCENDING' }];
  if (limit) structuredQuery.limit = limit;

  const res = await fetch(url, {
    method: 'POST',
    headers: await firestoreHeaders(env),
    body: JSON.stringify({ structuredQuery })
  });
  if (res.status >= 400) throw new Error(`Firestoreクエリエラー(${res.status}): ${await res.text()}`);
  const results = await res.json();
  return results
    .filter(r => r.document?.fields)
    .map(r => fromFirestoreFields(r.document.fields));
}

function fsFilter(f) {
  return {
    fieldFilter: {
      field: { fieldPath: f.field },
      op: f.op || 'EQUAL',
      value: toFirestoreValue(f.value)
    }
  };
}

// ── バッチ書き込み ────────────────────────────────────────────────────────────

export async function firestoreBatchWrite(env, writes) {
  const url = `${firestoreBaseUrl(env).replace('/documents', '')}:batchWrite`;
  const chunkSize = 400;
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    const res = await fetch(url, {
      method: 'POST',
      headers: await firestoreHeaders(env),
      body: JSON.stringify({ writes: chunk })
    });
    if (res.status >= 400) throw new Error(`FirestoreバッチエラーAt${i}(${res.status}): ${await res.text()}`);
    if (i + chunkSize < writes.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

// ── トランザクション ──────────────────────────────────────────────────────────

/**
 * 読み書き用 Firestore トランザクションを開始する（内部ヘルパー）。
 *
 * POST `:beginTransaction` → `{ transaction: <base64 txId> }`
 *
 * @param {Object} env
 * @return {Promise<string>} トランザクション ID（base64 文字列）
 */
async function beginTransaction(env) {
  const url = `${firestoreBaseUrl(env).replace('/documents', '')}/documents:beginTransaction`;
  const res = await fetch(url, {
    method: 'POST',
    headers: await firestoreHeaders(env),
    body: JSON.stringify({ options: { readWrite: {} } })
  });
  if (res.status >= 400) {
    const err = new Error(`beginTransaction エラー(${res.status}): ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json.transaction;
}

/**
 * 指定 txId の writes を atomic に commit する（内部ヘルパー）。
 *
 * POST `:commit` with { transaction, writes }。ABORTED（409）や UNAVAILABLE（503）
 * で失敗した場合は呼出元（firestoreTransaction）でリトライされる。
 *
 * @param {Object} env
 * @param {string} txId
 * @param {Array}  writes Firestore Write オブジェクト配列
 */
async function commitTransaction(env, txId, writes) {
  const url = `${firestoreBaseUrl(env).replace('/documents', '')}/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: await firestoreHeaders(env),
    body: JSON.stringify({ transaction: txId, writes })
  });
  if (res.status >= 400) {
    const err = new Error(`commitTransaction エラー(${res.status}): ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * トランザクション内でドキュメントを 1 件取得する（内部ヘルパー）。
 * 404 時は null 返却（既存 firestoreGet と同じ挙動）。
 *
 * @param {Object} env
 * @param {string} collection
 * @param {string} docId
 * @param {string} txId
 * @return {Promise<Object|null>}
 */
async function getInTransaction(env, collection, docId, txId) {
  const url = `${firestoreBaseUrl(env)}/${collection}/${encodeURIComponent(docId)}?transaction=${encodeURIComponent(txId)}`;
  const res = await fetch(url, { headers: await firestoreHeaders(env) });
  if (res.status === 404) return null;
  if (res.status >= 400) {
    const err = new Error(`getInTransaction エラー(${res.status}): ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  const doc = await res.json();
  if (!doc.fields) return null;
  return fromFirestoreFields(doc.fields);
}

/**
 * ABORTED（他ライターとの競合）または UNAVAILABLE（一時障害）なら true を返す。
 * Google 公式: この 2 種は自動リトライが推奨される。
 */
function isAbortedError(err) {
  const status = err && err.status;
  return status === 409 || status === 503;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Firestore 読み書きトランザクションを実行する（callback 形式）。
 *
 * GAS `LockService` で保護されていた Read-Modify-Write パターンを Workers で
 * 再現する。`:commit` endpoint + read-write transaction で atomic 保証し、
 * ABORTED（409）や UNAVAILABLE（503）で失敗した場合は最大 5 回・指数バック
 * オフ + jitter で自動リトライする。
 *
 * callback には tx オブジェクトが渡され、以下のメソッドを使う:
 *   - `await tx.get(collection, docId)`  → Object | null
 *   - `tx.set(collection, docId, data)`  → 全置換 write をキューに追加（同期・Promise 非返却）
 *   - `tx.update(collection, docId, fields)` → updateMask 付き部分更新をキューに追加
 *   - `tx.delete(collection, docId)` → 削除をキューに追加
 *
 * 使用例:
 *   await firestoreTransaction(env, async (tx) => {
 *     const doc = await tx.get('lectureEntries', docId);
 *     const existing = (doc && doc.entries) || [];
 *     // ... 権限チェック等 ...
 *     tx.set('lectureEntries', docId, { ..., entries: newEntries });
 *     return { success: true };
 *   });
 *
 * @param {Object} env
 * @param {(tx: Object) => Promise<any>} callback
 * @return {Promise<any>} callback の戻り値
 */
export async function firestoreTransaction(env, callback) {
  const MAX_RETRIES = 5;
  const basePath = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const txId = await beginTransaction(env);
    const writes = [];

    const tx = {
      async get(collection, docId) {
        return getInTransaction(env, collection, docId, txId);
      },
      set(collection, docId, data) {
        writes.push({
          update: {
            name: `${basePath}/${collection}/${encodeURIComponent(docId)}`,
            fields: toFirestoreFields(data)
          }
        });
      },
      update(collection, docId, fields) {
        writes.push({
          update: {
            name: `${basePath}/${collection}/${encodeURIComponent(docId)}`,
            fields: toFirestoreFields(fields)
          },
          updateMask: { fieldPaths: Object.keys(fields) }
        });
      },
      delete(collection, docId) {
        writes.push({
          delete: `${basePath}/${collection}/${encodeURIComponent(docId)}`
        });
      }
    };

    try {
      const result = await callback(tx);
      // writes が空でも :commit で transaction をクローズする必要がある
      await commitTransaction(env, txId, writes);
      return result;
    } catch (err) {
      lastError = err;
      if (isAbortedError(err) && attempt < MAX_RETRIES - 1) {
        const backoff = 100 * (2 ** attempt) + Math.random() * 100;
        console.warn(`⚠ Firestore Transaction ABORTED/UNAVAILABLE (${err.status})。${Math.round(backoff)}ms 後にリトライ (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ── 型変換 ────────────────────────────────────────────────────────────────────

export function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'object') return { mapValue: { fields: toFirestoreFields(v) } };
  return { stringValue: String(v) };
}

export function fromFirestoreFields(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields)) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

function fromFirestoreValue(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in v) return fromFirestoreFields(v.mapValue.fields || {});
  return null;
}

// ── ユーティリティ ────────────────────────────────────────────────────────────

function pemToDer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function b64url(data) {
  const str = typeof data === 'string'
    ? data
    : String.fromCharCode(...new Uint8Array(data));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
