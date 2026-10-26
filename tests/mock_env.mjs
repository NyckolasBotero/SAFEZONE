import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const CODE = fileURLToPath(new URL('../apps-script/Code.gs', import.meta.url));
let __n = 0;
export function makeEnv(seed) {
  const sheets = {};
  // Como o Google Sheets de verdade: textos que parecem data viram Date ao gravar.
  const coerce = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(x)) ? new Date(x.replace(' ', 'T') + (x.length === 16 ? ':00' : '') + '-03:00') : x;
  const mk = (name, rows) => { const s = { name, rows: rows.map(r => r.slice()),
    getDataRange: () => ({ getValues: () => s.rows.map(r => r.slice()) }),
    getLastRow: () => s.rows.length, getLastColumn: () => Math.max(0, ...s.rows.map(r => r.length)),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((s.rows[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; },
      setValues: (v) => { v.forEach((row, i) => { s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; row.forEach((x, j) => { s.rows[r - 1 + i][c - 1 + j] = coerce(x); }); }); },
      setFontWeight() {} }),
    appendRow: (row) => { s.rows.push(row.map(coerce)); }, deleteRow: (n) => { s.rows.splice(n - 1, 1); }, deleteRows: (n, k) => { s.rows.splice(n - 1, k); }, getMaxRows: () => 1e6, insertRowsAfter() {},
    setFrozenRows() {}, setName: (n) => { s.name = n; sheets[n] = s; } }; sheets[name] = s; return s; };
  mk('Permissionamento', seed);
  const store = {}; const cacheMk = () => ({ get: k => store[k] ?? null, put: (k, v) => { store[k] = v; }, remove: k => { delete store[k]; } });
  const props = {};
  const ctx = {
    Logger: { log() {} }, console, Date, Math, JSON, Number, String, Object, Array, isFinite, isNaN, RegExp, Error,
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => mk(n, []), getSheets: () => Object.values(sheets) }) },
    CacheService: { getScriptCache: cacheMk }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: { getUuid: () => crypto.randomUUID(), base64Encode: b => Buffer.from(b).toString('base64'),
      base64Decode: s => [...Buffer.from(s, 'base64')], DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (a, s) => [...crypto.createHash('sha256').update(s).digest()],
      newBlob: (b, m, n) => ({ b, m, n }),
      formatDate: (d, tz, f) => { const p = new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d); const [D, T] = p.split(' ');
        return f === 'yyMMdd' ? D.slice(2).replace(/-/g, '') : D + ' ' + T; } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; }, getContent() { return t; } }) },
    DriveApp: { getFolderById: () => ({ getId: () => 'F', createFile: () => { const id = 'FILE' + (++__n) + 'ABCDEFGHIJ'; return { getId: () => id, setSharing() {}, getParents: () => ({ hasNext: () => true, next: () => ({ getId: () => 'F' }) }), setTrashed() {} }; } }), createFolder: () => ({ getId: () => 'F' }), Access: {}, Permission: {} },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx);
  vm.runInContext('setup()', ctx);
  const key = props.API_KEY;
  const call = (action, data = {}, token) => { ctx.__req = JSON.stringify({ action, data, token }); return JSON.parse(vm.runInContext('doPost({postData:{contents:__req}}).getContent()', ctx)); };
  const raw = body => { ctx.__req = body; return vm.runInContext('doPost({postData:{contents:__req}}).getContent()', ctx); };
  return { call, raw, sheets, ctx, key };
}

