/* Thin Airtable REST client with rate limiting. Shared by the setup scripts. */

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = process.env.AIRTABLE_BASE_ID;

if (!TOKEN || !BASE) {
  console.error('\nMissing environment variables.\n');
  console.error('  PowerShell:');
  console.error('    $env:AIRTABLE_TOKEN = "pat..."');
  console.error('    $env:AIRTABLE_BASE_ID = "app..."\n');
  console.error('  Bash:');
  console.error('    export AIRTABLE_TOKEN=pat...');
  console.error('    export AIRTABLE_BASE_ID=app...\n');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Airtable allows 5 requests/second per base. Stay comfortably under it.
let lastCall = 0;
async function throttle() {
  const gap = Date.now() - lastCall;
  if (gap < 220) await sleep(220 - gap);
  lastCall = Date.now();
}

async function api(method, path, body) {
  await throttle();
  const res = await fetch(`https://api.airtable.com/v0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON error body */ }

  if (!res.ok) {
    const msg = (json && json.error && (json.error.message || json.error.type)) || text || res.statusText;
    const err = new Error(`${res.status} ${msg}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

const getSchema = () => api('GET', `/meta/bases/${BASE}/tables`);
const createTable = (body) => api('POST', `/meta/bases/${BASE}/tables`, body);
const createField = (tableId, body) => api('POST', `/meta/bases/${BASE}/tables/${tableId}/fields`, body);

async function createRecords(tableId, records) {
  const out = [];
  for (let i = 0; i < records.length; i += 10) {
    const chunk = records.slice(i, i + 10);
    const res = await api('POST', `/${BASE}/${tableId}`, {
      records: chunk.map(fields => ({ fields })),
      typecast: true,
    });
    out.push(...res.records);
  }
  return out;
}

async function listRecords(tableId) {
  const out = [];
  let offset;
  do {
    const q = offset ? `?offset=${offset}` : '';
    const res = await api('GET', `/${BASE}/${tableId}${q}`);
    out.push(...res.records);
    offset = res.offset;
  } while (offset);
  return out;
}

async function deleteRecords(tableId, ids) {
  for (let i = 0; i < ids.length; i += 10) {
    const q = ids.slice(i, i + 10).map(id => `records[]=${id}`).join('&');
    await api('DELETE', `/${BASE}/${tableId}?${q}`);
  }
}

module.exports = {
  BASE, api, getSchema, createTable, createField,
  createRecords, listRecords, deleteRecords, sleep,
};
