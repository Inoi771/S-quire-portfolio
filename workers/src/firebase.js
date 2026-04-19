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
