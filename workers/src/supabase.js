// Supabase REST API クライアント（GAS supabase.js をポート）

function supabaseHeaders(env) {
  return {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// ── SELECT ────────────────────────────────────────────────────────────────────

export async function supabaseSelect(env, table, query = '') {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const res = await fetch(url, { headers: supabaseHeaders(env) });
  if (!res.ok) throw new Error(`Supabase SELECT エラー(${res.status}): ${await res.text()}`);
  return res.json();
}

// ── UPSERT ────────────────────────────────────────────────────────────────────

export async function supabaseUpsert(env, table, data, onConflict = null) {
  const headers = { ...supabaseHeaders(env) };
  if (onConflict) headers['Prefer'] = `resolution=merge-duplicates,return=representation`;
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${onConflict ? '?on_conflict=' + onConflict : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase UPSERT エラー(${res.status}): ${await res.text()}`);
  return res.json();
}

// ── INSERT ────────────────────────────────────────────────────────────────────

export async function supabaseInsert(env, table, data) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase INSERT エラー(${res.status}): ${await res.text()}`);
  return res.json();
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

export async function supabaseUpdate(env, table, data, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase UPDATE エラー(${res.status}): ${await res.text()}`);
  return res.json();
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function supabaseDelete(env, table, query) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: supabaseHeaders(env)
  });
  if (!res.ok) throw new Error(`Supabase DELETE エラー(${res.status}): ${await res.text()}`);
  // 204 No Content の場合は空配列
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

// ── RPC ───────────────────────────────────────────────────────────────────────

export async function supabaseRpc(env, funcName, params = {}) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${funcName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env),
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`Supabase RPC(${funcName}) エラー(${res.status}): ${await res.text()}`);
  return res.json();
}

// ── バッチ UPSERT ─────────────────────────────────────────────────────────────

export async function supabaseBatchUpsert(env, table, rows, onConflict = null, chunkSize = 500) {
  const results = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result = await supabaseUpsert(env, table, chunk, onConflict);
    results.push(...(Array.isArray(result) ? result : []));
    if (i + chunkSize < rows.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return results;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function supabaseStorageUpload(env, bucket, filePath, fileBytes, mimeType) {
  const url = `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${filePath}`;
  const headers = {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': mimeType,
    'x-upsert': 'true'
  };
  const res = await fetch(url, { method: 'POST', headers, body: fileBytes });
  if (!res.ok) throw new Error(`Storage アップロードエラー(${res.status}): ${await res.text()}`);
  return res.json();
}

export async function supabaseStorageList(env, bucket, prefix = '') {
  const url = `${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 })
  });
  if (!res.ok) throw new Error(`Storage 一覧エラー(${res.status}): ${await res.text()}`);
  return res.json();
}

export async function supabaseStorageSignedUrl(env, bucket, filePath, expiresIn = 3600) {
  const url = `${env.SUPABASE_URL}/storage/v1/object/sign/${bucket}/${filePath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn })
  });
  if (!res.ok) throw new Error(`Storage signed URL エラー(${res.status}): ${await res.text()}`);
  const data = await res.json();
  return `${env.SUPABASE_URL}/storage/v1${data.signedURL}`;
}

export async function supabaseStorageDelete(env, bucket, filePaths) {
  const url = `${env.SUPABASE_URL}/storage/v1/object/${bucket}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefixes: Array.isArray(filePaths) ? filePaths : [filePaths] })
  });
  if (!res.ok) throw new Error(`Storage 削除エラー(${res.status}): ${await res.text()}`);
  return res.json();
}
