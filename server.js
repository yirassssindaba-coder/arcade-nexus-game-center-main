const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const STORAGE_DIR = path.join(ROOT, 'storage');
const CONFIG_PATH = path.join(ROOT, 'config', 'app.json');

const RESERVED_QUERY_KEYS = new Set([
  'search', 'sort', 'page', 'size', 'cursor', 'limit', 'offset', 'select',
  'include', 'distinct', 'aggregate', 'groupBy', 'report', 'exists', 'withDeleted'
]);

let config = loadJson(CONFIG_PATH, null) || {
  name: 'Arcade Nexus App Center',
  port: 3210,
  host: '127.0.0.1',
  maintenanceMode: false,
  defaultPageSize: 10,
  maxPageSize: 100,
  retentionDays: 30,
  featureFlags: { smartRecommendations: true, weekendTournaments: true, dailyChallenges: true, adminImpersonation: false }
};

const metrics = {
  startedAt: new Date().toISOString(),
  requestCount: 0,
  errorCount: 0,
  latencyTotalMs: 0,
  perRoute: {}
};

ensureData();

function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const defaults = {
    'items.json': [
      seedItem('Neon Snake Arena', 'arcade', 'epic', 80, 120, 'published', true),
      seedItem('Meteor Dodge X', 'action', 'rare', 64, 90, 'published', true),
      seedItem('Memory Flip Plus', 'puzzle', 'uncommon', 48, 70, 'draft', false)
    ],
    'users.json': [
      {
        id: 'usr_admin',
        name: 'Admin',
        email: 'admin@example.local',
        passwordHash: hashPassword('admin123'),
        roles: ['admin', 'operator'],
        scopes: ['global'],
        isEmailVerified: true,
        twoFactorEnabled: false,
        consentVersion: 'v1',
        createdAt: now(),
        updatedAt: now(),
        deletedAt: null,
        archivedAt: null,
        version: 1
      }
    ],
    'sessions.json': [],
    'audit.json': [],
    'telemetry.json': [],
    'flags.json': Object.entries(config.featureFlags).map(([key, enabled]) => ({
      id: `flag_${key}`,
      key,
      enabled,
      description: `${key} runtime flag`,
      updatedAt: now(),
      createdAt: now(),
      version: 1
    })),
    'files.json': [],
    'notifications.json': [],
    'jobs.json': []
  };

  for (const [filename, value] of Object.entries(defaults)) {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      saveJson(filePath, value);
    }
  }
}

function seedItem(name, category, rarity, power, value, status, verified) {
  return {
    id: makeId('itm'),
    name,
    slug: slugify(name),
    category,
    rarity,
    power,
    value,
    tags: [category, rarity],
    status,
    isVerified: verified,
    isActive: status !== 'closed' && status !== 'cancelled',
    ownerId: 'usr_admin',
    parentId: null,
    relationIds: [],
    metadata: { source: 'seed' },
    createdAt: now(),
    updatedAt: now(),
    deletedAt: null,
    archivedAt: null,
    publishedAt: status === 'published' ? now() : null,
    version: 1
  };
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function collectionPath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readCollection(name) {
  return loadJson(collectionPath(name), []);
}

function writeCollection(name, items) {
  saveJson(collectionPath(name), items);
}

function hashPassword(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
    ...extraHeaders
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders
  });
  res.end(text);
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not Found' });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        resolve({ raw });
      }
    });
    req.on('error', reject);
  });
}

function safeParseMaybeJson(value) {
  if (value === undefined || value === null || value === '') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    return trimmed;
  }
}

function recordAudit(action, entity, entityId, before, after, actor = 'system') {
  const audit = readCollection('audit');
  audit.unshift({
    id: makeId('aud'),
    action,
    entity,
    entityId,
    actor,
    before,
    after,
    createdAt: now()
  });
  writeCollection('audit', audit.slice(0, 1000));
}

function addNotification(channel, title, message) {
  const notifications = readCollection('notifications');
  notifications.unshift({
    id: makeId('ntf'), channel, title, message, createdAt: now(), status: 'queued'
  });
  writeCollection('notifications', notifications.slice(0, 1000));
}

function enqueueJob(type, payload) {
  const jobs = readCollection('jobs');
  jobs.unshift({
    id: makeId('job'),
    type,
    payload,
    status: 'queued',
    retries: 0,
    createdAt: now(),
    updatedAt: now()
  });
  writeCollection('jobs', jobs.slice(0, 1000));
}

function validateItem(input, partial = false) {
  const errors = [];
  if (!partial || 'name' in input) {
    if (!input.name || String(input.name).trim().length < 2) {
      errors.push('name must be at least 2 characters');
    }
  }
  if ('power' in input && Number(input.power) < 0) errors.push('power must be >= 0');
  if ('value' in input && Number(input.value) < 0) errors.push('value must be >= 0');
  return errors;
}

function sanitizeItem(input) {
  const clean = { ...input };
  for (const key of ['name', 'slug', 'category', 'rarity', 'status']) {
    if (key in clean && clean[key] != null) clean[key] = String(clean[key]).trim();
  }
  if ('name' in clean && !('slug' in clean)) clean.slug = slugify(clean.name);
  if ('tags' in clean && !Array.isArray(clean.tags)) clean.tags = [String(clean.tags)];
  if ('metadata' in clean && typeof clean.metadata !== 'object') clean.metadata = { value: clean.metadata };
  return clean;
}

function listQuery(items, urlObj) {
  const query = Object.fromEntries(urlObj.searchParams.entries());
  const withDeleted = urlObj.searchParams.get('withDeleted') === 'true';
  let result = items.filter(item => withDeleted || !item.deletedAt);

  const search = urlObj.searchParams.get('search');
  if (search) {
    const needle = search.toLowerCase();
    result = result.filter(item => JSON.stringify(item).toLowerCase().includes(needle));
  }

  for (const [key, rawValue] of urlObj.searchParams.entries()) {
    if (RESERVED_QUERY_KEYS.has(key)) continue;
    let field = key;
    let op = 'eq';
    if (key.includes('__')) {
      [field, op] = key.split('__');
    }
    const value = safeParseMaybeJson(rawValue);
    result = result.filter(item => matchFilter(item[field], op, value));
  }

  const distinct = urlObj.searchParams.get('distinct');
  if (distinct) {
    const seen = new Set();
    result = result.filter(item => {
      const value = JSON.stringify(item[distinct]);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  const sort = urlObj.searchParams.get('sort');
  if (sort) {
    const fields = sort.split(',').map(x => x.trim()).filter(Boolean);
    result.sort((a, b) => compareByFields(a, b, fields));
  }

  const prePagination = result.slice();
  const aggregate = urlObj.searchParams.get('aggregate');
  const groupBy = urlObj.searchParams.get('groupBy');
  const report = urlObj.searchParams.get('report');
  const exists = urlObj.searchParams.get('exists');

  if (exists) {
    return { items: [], total: prePagination.length, exists: prePagination.length > 0, meta: { total: prePagination.length } };
  }

  let aggregateResult = null;
  if (aggregate) {
    aggregateResult = runAggregate(prePagination, aggregate, groupBy);
  }
  if (report === 'rarity-summary') {
    aggregateResult = runAggregate(prePagination, 'count:id', 'rarity');
  }

  const cursor = urlObj.searchParams.get('cursor');
  if (cursor) {
    const index = result.findIndex(item => item.id === cursor);
    if (index >= 0) result = result.slice(index + 1);
  }

  let offset = Number(urlObj.searchParams.get('offset') || 0);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  let limit = Number(urlObj.searchParams.get('limit') || 0);
  const page = Number(urlObj.searchParams.get('page') || 1);
  const size = Math.min(Number(urlObj.searchParams.get('size') || config.defaultPageSize), config.maxPageSize);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = size;
    offset = (Math.max(page, 1) - 1) * size;
  }

  result = result.slice(offset, offset + limit);

  const select = urlObj.searchParams.get('select');
  if (select) {
    const fields = select.split(',').map(x => x.trim()).filter(Boolean);
    result = result.map(item => {
      const projected = {};
      for (const field of fields) projected[field] = item[field];
      return projected;
    });
  }

  const nextCursor = result.length ? (result[result.length - 1].id || null) : null;
  return {
    items: result,
    total: prePagination.length,
    aggregate: aggregateResult,
    meta: {
      total: prePagination.length,
      page: Math.max(page, 1),
      size: limit,
      offset,
      nextCursor,
      include: urlObj.searchParams.get('include') || null
    }
  };
}

function runAggregate(items, aggregate, groupBy) {
  const [fn, field] = String(aggregate).split(':');
  if (groupBy) {
    const groups = {};
    for (const item of items) {
      const key = String(item[groupBy] ?? 'null');
      groups[key] ||= [];
      groups[key].push(item);
    }
    return Object.fromEntries(Object.entries(groups).map(([key, group]) => [key, computeAggregate(group, fn, field)]));
  }
  return computeAggregate(items, fn, field);
}

function computeAggregate(items, fn, field) {
  if (fn === 'count') return items.length;
  const numbers = items.map(item => Number(item[field] || 0)).filter(x => Number.isFinite(x));
  if (!numbers.length) return 0;
  if (fn === 'sum') return numbers.reduce((a, b) => a + b, 0);
  if (fn === 'avg') return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  if (fn === 'min') return Math.min(...numbers);
  if (fn === 'max') return Math.max(...numbers);
  return null;
}

function compareByFields(a, b, fields) {
  for (const fieldSpec of fields) {
    const desc = fieldSpec.startsWith('-');
    const field = desc ? fieldSpec.slice(1) : fieldSpec;
    const left = a[field];
    const right = b[field];
    if (left === right) continue;
    if (left == null) return desc ? 1 : -1;
    if (right == null) return desc ? -1 : 1;
    if (left > right) return desc ? -1 : 1;
    if (left < right) return desc ? 1 : -1;
  }
  return 0;
}

function matchFilter(current, op, expected) {
  if (op === 'eq') {
    if (Array.isArray(current)) return current.includes(expected);
    return String(current) === String(expected);
  }
  if (op === 'ne') return String(current) !== String(expected);
  if (op === 'contains') return String(current || '').toLowerCase().includes(String(expected).toLowerCase());
  if (op === 'gte') return Number(current) >= Number(expected);
  if (op === 'lte') return Number(current) <= Number(expected);
  if (op === 'gt') return Number(current) > Number(expected);
  if (op === 'lt') return Number(current) < Number(expected);
  if (op === 'in') {
    const values = Array.isArray(expected) ? expected : String(expected).split(',').map(x => x.trim());
    return values.map(String).includes(String(current));
  }
  return true;
}

function authorize(req) {
  const header = req.headers['authorization'] || '';
  const token = String(header).startsWith('Bearer ') ? String(header).slice(7) : null;
  if (!token) return null;
  const sessions = readCollection('sessions');
  const session = sessions.find(x => x.accessToken === token && !x.revokedAt && x.expiresAt > now());
  if (!session) return null;
  const users = readCollection('users');
  return users.find(x => x.id === session.userId) || null;
}

function requireAdmin(req, res) {
  const user = authorize(req);
  if (!user || !(user.roles || []).includes('admin')) {
    sendJson(res, 403, { error: 'Admin role required' });
    return null;
  }
  return user;
}

function createSession(userId) {
  const sessions = readCollection('sessions');
  const session = {
    id: makeId('ses'),
    userId,
    accessToken: crypto.randomBytes(16).toString('hex'),
    refreshToken: crypto.randomBytes(16).toString('hex'),
    issuedAt: now(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
    revokedAt: null,
    version: 1
  };
  sessions.push(session);
  writeCollection('sessions', sessions);
  return session;
}

function parseCsv(raw) {
  const lines = String(raw || '').trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(x => x.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const item = {};
    headers.forEach((header, index) => item[header] = safeParseMaybeJson(values[index] ?? ''));
    return item;
  });
}

function toCsv(items) {
  if (!items.length) return 'id\n';
  const headers = Array.from(items.reduce((set, item) => {
    Object.keys(item).forEach(key => set.add(key));
    return set;
  }, new Set()));
  const rows = [headers.join(',')];
  for (const item of items) {
    rows.push(headers.map(key => escapeCsv(item[key])).join(','));
  }
  return rows.join('\n');
}

function escapeCsv(value) {
  const text = value == null ? '' : Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function minimalPdf(lines) {
  const safeLines = lines.map(line => String(line).replace(/[()\\]/g, ''));
  const content = ['BT', '/F1 12 Tf', '50 780 Td'];
  safeLines.forEach((line, index) => {
    if (index > 0) content.push('0 -18 Td');
    content.push(`(${line}) Tj`);
  });
  content.push('ET');
  const stream = content.join('\n');
  const objects = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj');
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += obj + '\n';
  }
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return notFound(res);
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.png': 'image/png'
  };
  const buffer = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store'
  });
  res.end(buffer);
}

async function handleAuth(req, res, urlObj, pathname) {
  if (pathname === '/api/v1/auth/register' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    if (users.some(x => x.email === body.email)) return sendJson(res, 409, { error: 'email already exists' });
    const user = {
      id: makeId('usr'),
      name: String(body.name || 'Player').trim(),
      email: String(body.email || '').trim().toLowerCase(),
      passwordHash: hashPassword(body.password || ''),
      roles: ['player'],
      scopes: ['self'],
      isEmailVerified: false,
      twoFactorEnabled: false,
      consentVersion: body.consentVersion || 'v1',
      createdAt: now(), updatedAt: now(), deletedAt: null, archivedAt: null, version: 1
    };
    users.push(user);
    writeCollection('users', users);
    addNotification('email', 'Verify email', `Verification pending for ${user.email}`);
    recordAudit('register', 'users', user.id, null, user, user.id);
    return sendJson(res, 201, { data: { id: user.id, email: user.email } });
  }

  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.email === String(body.email || '').trim().toLowerCase() && x.passwordHash === hashPassword(body.password || ''));
    if (!user) return sendJson(res, 401, { error: 'invalid credentials' });
    const session = createSession(user.id);
    recordAudit('login', 'sessions', session.id, null, session, user.id);
    return sendJson(res, 200, { data: session });
  }

  if (pathname === '/api/v1/auth/logout' && req.method === 'POST') {
    const body = await readBody(req);
    const sessions = readCollection('sessions');
    const session = sessions.find(x => x.accessToken === body.accessToken || x.refreshToken === body.refreshToken);
    if (session) {
      session.revokedAt = now();
      session.updatedAt = now();
      writeCollection('sessions', sessions);
      recordAudit('logout', 'sessions', session.id, session, session, session.userId);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/refresh' && req.method === 'POST') {
    const body = await readBody(req);
    const sessions = readCollection('sessions');
    const session = sessions.find(x => x.refreshToken === body.refreshToken && !x.revokedAt);
    if (!session) return sendJson(res, 401, { error: 'invalid refresh token' });
    session.accessToken = crypto.randomBytes(16).toString('hex');
    session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString();
    session.updatedAt = now();
    writeCollection('sessions', sessions);
    return sendJson(res, 200, { data: session });
  }

  if (pathname === '/api/v1/auth/forgot-password' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.email === String(body.email || '').trim().toLowerCase());
    if (user) {
      user.resetToken = crypto.randomBytes(8).toString('hex');
      user.updatedAt = now();
      writeCollection('users', users);
      addNotification('email', 'Password reset', `Reset token issued for ${user.email}`);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/reset-password' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.resetToken === body.resetToken);
    if (!user) return sendJson(res, 400, { error: 'invalid reset token' });
    user.passwordHash = hashPassword(body.newPassword || '');
    delete user.resetToken;
    user.updatedAt = now();
    user.version += 1;
    writeCollection('users', users);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/change-password' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.id === body.userId && x.passwordHash === hashPassword(body.currentPassword || ''));
    if (!user) return sendJson(res, 400, { error: 'invalid user or password' });
    user.passwordHash = hashPassword(body.newPassword || '');
    user.updatedAt = now();
    user.version += 1;
    writeCollection('users', users);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/email-verification' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.id === body.userId);
    if (!user) return sendJson(res, 404, { error: 'user not found' });
    user.isEmailVerified = true;
    user.updatedAt = now();
    user.version += 1;
    writeCollection('users', users);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/2fa/enable' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.id === body.userId);
    if (!user) return sendJson(res, 404, { error: 'user not found' });
    user.twoFactorEnabled = true;
    user.twoFactorCode = '246810';
    user.updatedAt = now();
    writeCollection('users', users);
    return sendJson(res, 200, { ok: true, data: { codeHint: '246810 (local demo)' } });
  }

  if (pathname === '/api/v1/auth/2fa/disable' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.id === body.userId);
    if (!user) return sendJson(res, 404, { error: 'user not found' });
    user.twoFactorEnabled = false;
    delete user.twoFactorCode;
    user.updatedAt = now();
    writeCollection('users', users);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/2fa/verify' && req.method === 'POST') {
    const body = await readBody(req);
    const users = readCollection('users');
    const user = users.find(x => x.id === body.userId);
    if (!user || !user.twoFactorEnabled || body.code !== user.twoFactorCode) return sendJson(res, 400, { error: 'invalid 2FA code' });
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/v1/auth/sessions' && req.method === 'GET') {
    const userId = urlObj.searchParams.get('userId');
    const sessions = readCollection('sessions').filter(x => !userId || x.userId === userId);
    return sendJson(res, 200, { data: sessions });
  }

  if (pathname === '/api/v1/auth/sessions/revoke' && req.method === 'POST') {
    const body = await readBody(req);
    const sessions = readCollection('sessions');
    const session = sessions.find(x => x.id === body.sessionId);
    if (!session) return sendJson(res, 404, { error: 'session not found' });
    session.revokedAt = now();
    writeCollection('sessions', sessions);
    return sendJson(res, 200, { ok: true });
  }

  return false;
}

function upsertById(list, incoming, prefix, defaults = {}) {
  const nowValue = now();
  if (incoming.id) {
    const existing = list.find(x => x.id === incoming.id);
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, defaults, incoming, { updatedAt: nowValue, version: (existing.version || 1) + 1 });
      return { record: existing, before, created: false };
    }
  }
  const record = { ...defaults, ...incoming, id: incoming.id || makeId(prefix), createdAt: nowValue, updatedAt: nowValue, deletedAt: null, archivedAt: null, version: 1 };
  list.push(record);
  return { record, before: null, created: true };
}

async function handleItems(req, res, urlObj, pathname) {
  const items = readCollection('items');
  const actor = authorize(req)?.id || 'system';

  if (pathname === '/api/v1/items' && req.method === 'GET') {
    const result = listQuery(items, urlObj);
    return sendJson(res, 200, { data: result.items, aggregate: result.aggregate, meta: result.meta, exists: result.exists ?? null });
  }

  if (pathname === '/api/v1/items' && req.method === 'POST') {
    const body = sanitizeItem(await readBody(req));
    const errors = validateItem(body, false);
    if (errors.length) return sendJson(res, 422, { errors });
    const duplicate = items.find(x => x.slug === body.slug && !x.deletedAt);
    if (duplicate) return sendJson(res, 409, { error: 'slug must be unique' });
    const record = {
      id: makeId('itm'),
      name: body.name,
      slug: body.slug || slugify(body.name),
      category: body.category || 'misc',
      rarity: body.rarity || 'common',
      power: Number(body.power || 0),
      value: Number(body.value || 0),
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: body.status || 'draft',
      isVerified: Boolean(body.isVerified),
      isActive: body.isActive !== false,
      ownerId: body.ownerId || actor,
      parentId: body.parentId || null,
      relationIds: Array.isArray(body.relationIds) ? body.relationIds : [],
      metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
      createdAt: now(), updatedAt: now(), deletedAt: null, archivedAt: null, publishedAt: null, version: 1
    };
    items.push(record);
    writeCollection('items', items);
    recordAudit('create', 'items', record.id, null, record, actor);
    return sendJson(res, 201, { data: record });
  }

  if (pathname === '/api/v1/items' && req.method === 'DELETE') {
    const result = listQuery(items, urlObj);
    const ids = new Set(result.items.map(x => x.id));
    let changed = 0;
    for (const item of items) {
      if (ids.has(item.id) && !item.deletedAt) {
        item.deletedAt = now();
        item.updatedAt = now();
        item.version += 1;
        changed += 1;
      }
    }
    writeCollection('items', items);
    recordAudit('deleteByQuery', 'items', null, null, { changed }, actor);
    return sendJson(res, 200, { data: { changed } });
  }

  if (pathname === '/api/v1/items/count' && req.method === 'GET') {
    const result = listQuery(items, urlObj);
    return sendJson(res, 200, { data: { count: result.meta.total } });
  }

  if (pathname === '/api/v1/items/export' && req.method === 'GET') {
    const result = listQuery(items, urlObj);
    const format = urlObj.searchParams.get('format') || 'json';
    if (format === 'csv') {
      const csv = toCsv(result.items);
      return sendText(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="items.csv"' });
    }
    if (format === 'html') {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Items Export</title></head><body><h1>Items Export</h1><pre>${JSON.stringify(result.items, null, 2)}</pre></body></html>`;
      return sendText(res, 200, html, 'text/html; charset=utf-8');
    }
    if (format === 'pdf') {
      const pdf = minimalPdf([
        'Infinite Dungeon Reborn Items Export',
        `Generated: ${new Date().toISOString()}`,
        `Rows: ${result.items.length}`,
        ...result.items.slice(0, 20).map(x => `${x.id} | ${x.name} | ${x.rarity} | ${x.status}`)
      ]);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': 'attachment; filename="items.pdf"',
        'Cache-Control': 'no-store'
      });
      return res.end(pdf);
    }
    return sendJson(res, 200, { data: result.items, meta: result.meta });
  }

  if (pathname === '/api/v1/items/import' && req.method === 'POST') {
    const body = await readBody(req);
    let incoming = [];
    if (Array.isArray(body.items)) incoming = body.items;
    else if (typeof body.raw === 'string' && (body.format || '').toLowerCase() === 'csv') incoming = parseCsv(body.raw);
    else if (typeof body.raw === 'string') {
      try { incoming = JSON.parse(body.raw); } catch (_) { incoming = []; }
    }
    const created = [];
    for (const row of incoming) {
      const clean = sanitizeItem(row);
      const errors = validateItem(clean, false);
      if (errors.length) continue;
      const record = {
        id: makeId('itm'),
        name: clean.name,
        slug: clean.slug || slugify(clean.name),
        category: clean.category || 'misc',
        rarity: clean.rarity || 'common',
        power: Number(clean.power || 0),
        value: Number(clean.value || 0),
        tags: Array.isArray(clean.tags) ? clean.tags : [],
        status: clean.status || 'draft',
        isVerified: Boolean(clean.isVerified),
        isActive: clean.isActive !== false,
        ownerId: clean.ownerId || actor,
        parentId: clean.parentId || null,
        relationIds: Array.isArray(clean.relationIds) ? clean.relationIds : [],
        metadata: typeof clean.metadata === 'object' && clean.metadata ? clean.metadata : {},
        createdAt: now(), updatedAt: now(), deletedAt: null, archivedAt: null, publishedAt: null, version: 1
      };
      items.push(record);
      created.push(record);
    }
    writeCollection('items', items);
    recordAudit('import', 'items', null, null, { count: created.length }, actor);
    return sendJson(res, 201, { data: created, meta: { count: created.length } });
  }

  if (pathname === '/api/v1/items/bulk' && req.method === 'POST') {
    const body = await readBody(req);
    const created = [];
    for (const row of Array.isArray(body.items) ? body.items : []) {
      const clean = sanitizeItem(row);
      const errors = validateItem(clean, false);
      if (errors.length) continue;
      const record = {
        id: makeId('itm'),
        name: clean.name,
        slug: clean.slug || slugify(clean.name),
        category: clean.category || 'misc',
        rarity: clean.rarity || 'common',
        power: Number(clean.power || 0),
        value: Number(clean.value || 0),
        tags: Array.isArray(clean.tags) ? clean.tags : [],
        status: clean.status || 'draft',
        isVerified: Boolean(clean.isVerified),
        isActive: clean.isActive !== false,
        ownerId: clean.ownerId || actor,
        parentId: clean.parentId || null,
        relationIds: Array.isArray(clean.relationIds) ? clean.relationIds : [],
        metadata: typeof clean.metadata === 'object' && clean.metadata ? clean.metadata : {},
        createdAt: now(), updatedAt: now(), deletedAt: null, archivedAt: null, publishedAt: null, version: 1
      };
      items.push(record);
      created.push(record);
    }
    writeCollection('items', items);
    recordAudit('bulkCreate', 'items', null, null, { count: created.length }, actor);
    return sendJson(res, 201, { data: created, meta: { count: created.length } });
  }

  if (pathname === '/api/v1/items/bulk' && req.method === 'PATCH') {
    const body = await readBody(req);
    const changes = [];
    for (const patch of Array.isArray(body.items) ? body.items : []) {
      const item = items.find(x => x.id === patch.id);
      if (!item) continue;
      const before = { ...item };
      Object.assign(item, sanitizeItem(patch), { updatedAt: now(), version: item.version + 1 });
      changes.push(item);
      recordAudit('bulkUpdateItem', 'items', item.id, before, item, actor);
    }
    writeCollection('items', items);
    return sendJson(res, 200, { data: changes, meta: { count: changes.length } });
  }

  if (pathname === '/api/v1/items/bulk' && req.method === 'DELETE') {
    const body = await readBody(req);
    const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
    let changed = 0;
    const hard = body.hard === true;
    let nextItems = items;
    if (hard) {
      nextItems = items.filter(x => !ids.has(x.id));
      changed = items.length - nextItems.length;
    } else {
      for (const item of items) {
        if (ids.has(item.id) && !item.deletedAt) {
          item.deletedAt = now();
          item.updatedAt = now();
          item.version += 1;
          changed += 1;
        }
      }
    }
    writeCollection('items', nextItems);
    recordAudit(hard ? 'bulkDeleteHard' : 'bulkDeleteSoft', 'items', null, null, { changed }, actor);
    return sendJson(res, 200, { data: { changed } });
  }

  const restoreMatch = pathname.match(/^\/api\/v1\/items\/([^/]+)\/restore$/);
  if (restoreMatch && req.method === 'POST') {
    const item = items.find(x => x.id === restoreMatch[1]);
    if (!item) return sendJson(res, 404, { error: 'item not found' });
    const before = { ...item };
    item.deletedAt = null;
    item.updatedAt = now();
    item.version += 1;
    writeCollection('items', items);
    recordAudit('restore', 'items', item.id, before, item, actor);
    return sendJson(res, 200, { data: item });
  }

  const actionMatch = pathname.match(/^\/api\/v1\/items\/([^/]+)\/actions\/([^/]+)$/);
  if (actionMatch && req.method === 'POST') {
    const [, id, action] = actionMatch;
    const item = items.find(x => x.id === id);
    if (!item) return sendJson(res, 404, { error: 'item not found' });
    const before = { ...item };
    applyWorkflowAction(item, action);
    item.updatedAt = now();
    item.version += 1;
    writeCollection('items', items);
    recordAudit(`action:${action}`, 'items', item.id, before, item, actor);
    return sendJson(res, 200, { data: item });
  }

  const idMatch = pathname.match(/^\/api\/v1\/items\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const item = items.find(x => x.id === id);
    if (!item) return sendJson(res, 404, { error: 'item not found' });

    if (req.method === 'GET') return sendJson(res, 200, { data: item });

    if (req.method === 'PUT') {
      const body = sanitizeItem(await readBody(req));
      const errors = validateItem(body, false);
      if (errors.length) return sendJson(res, 422, { errors });
      const before = { ...item };
      const replacement = {
        id: item.id,
        name: body.name,
        slug: body.slug || slugify(body.name),
        category: body.category || 'misc',
        rarity: body.rarity || 'common',
        power: Number(body.power || 0),
        value: Number(body.value || 0),
        tags: Array.isArray(body.tags) ? body.tags : [],
        status: body.status || 'draft',
        isVerified: Boolean(body.isVerified),
        isActive: body.isActive !== false,
        ownerId: body.ownerId || actor,
        parentId: body.parentId || null,
        relationIds: Array.isArray(body.relationIds) ? body.relationIds : [],
        metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {},
        createdAt: item.createdAt,
        updatedAt: now(),
        deletedAt: item.deletedAt,
        archivedAt: item.archivedAt,
        publishedAt: item.publishedAt,
        version: item.version + 1
      };
      Object.assign(item, replacement);
      writeCollection('items', items);
      recordAudit('put', 'items', item.id, before, item, actor);
      return sendJson(res, 200, { data: item });
    }

    if (req.method === 'PATCH') {
      const body = sanitizeItem(await readBody(req));
      const errors = validateItem(body, true);
      if (errors.length) return sendJson(res, 422, { errors });
      const ifMatch = req.headers['if-match'];
      if (ifMatch && Number(ifMatch) !== item.version) {
        return sendJson(res, 409, { error: 'version conflict', expectedVersion: item.version });
      }
      const before = { ...item };
      Object.assign(item, body, { updatedAt: now(), version: item.version + 1 });
      writeCollection('items', items);
      recordAudit('patch', 'items', item.id, before, item, actor);
      return sendJson(res, 200, { data: item });
    }

    if (req.method === 'DELETE') {
      const hard = urlObj.searchParams.get('mode') === 'hard';
      const before = { ...item };
      if (hard) {
        const nextItems = items.filter(x => x.id !== id);
        writeCollection('items', nextItems);
        recordAudit('deleteHard', 'items', id, before, null, actor);
        return sendJson(res, 200, { data: { deleted: true, mode: 'hard' } });
      }
      item.deletedAt = now();
      item.updatedAt = now();
      item.version += 1;
      writeCollection('items', items);
      recordAudit('deleteSoft', 'items', id, before, item, actor);
      return sendJson(res, 200, { data: { deleted: true, mode: 'soft' } });
    }
  }

  return false;
}

function applyWorkflowAction(item, action) {
  switch (action) {
    case 'submit': item.status = 'review'; break;
    case 'approve': item.status = 'approved'; break;
    case 'reject': item.status = 'rejected'; break;
    case 'publish': item.status = 'published'; item.publishedAt = now(); break;
    case 'unpublish': item.status = 'draft'; item.publishedAt = null; break;
    case 'activate': item.isActive = true; break;
    case 'deactivate': item.isActive = false; break;
    case 'verify': item.isVerified = true; break;
    case 'unverify': item.isVerified = false; break;
    case 'cancel': item.status = 'cancelled'; break;
    case 'close': item.status = 'closed'; break;
    case 'reopen': item.status = 'review'; break;
    case 'archive': item.archivedAt = now(); break;
    case 'unarchive': item.archivedAt = null; break;
    case 'attach': {
      const body = {}; // no-op hook for route completeness
      item.relationIds = Array.from(new Set([...(item.relationIds || []), ...(body.relationIds || [])]));
      break;
    }
    default: break;
  }
}

async function handleUsers(req, res, urlObj, pathname) {
  const users = readCollection('users');
  if (pathname === '/api/v1/users' && req.method === 'GET') {
    const result = listQuery(users, urlObj);
    return sendJson(res, 200, { data: result.items, meta: result.meta });
  }
  return false;
}

async function handleFlags(req, res, urlObj, pathname) {
  const flags = readCollection('flags');
  if (pathname === '/api/v1/feature-flags' && req.method === 'GET') {
    return sendJson(res, 200, { data: flags });
  }
  if (pathname === '/api/v1/feature-flags' && req.method === 'PATCH') {
    const body = await readBody(req);
    const updates = Array.isArray(body.flags) ? body.flags : [];
    for (const update of updates) {
      const flag = flags.find(x => x.key === update.key || x.id === update.id);
      if (!flag) continue;
      flag.enabled = Boolean(update.enabled);
      flag.updatedAt = now();
      flag.version += 1;
      config.featureFlags[flag.key] = flag.enabled;
    }
    writeCollection('flags', flags);
    saveJson(CONFIG_PATH, config);
    recordAudit('patch', 'feature-flags', null, null, flags, authorize(req)?.id || 'system');
    return sendJson(res, 200, { data: flags });
  }
  return false;
}

async function handleAudit(req, res, urlObj, pathname) {
  if (pathname === '/api/v1/audit' && req.method === 'GET') {
    const audit = readCollection('audit');
    const result = listQuery(audit, urlObj);
    return sendJson(res, 200, { data: result.items, meta: result.meta });
  }
  return false;
}

async function handleTelemetry(req, res, urlObj, pathname) {
  const telemetry = readCollection('telemetry');
  if (pathname === '/api/v1/telemetry/events' && req.method === 'POST') {
    const body = await readBody(req);
    const event = {
      id: makeId('evt'),
      name: body.name || 'unnamed-event',
      properties: typeof body.properties === 'object' && body.properties ? body.properties : {},
      createdAt: now()
    };
    telemetry.push(event);
    writeCollection('telemetry', telemetry);
    return sendJson(res, 201, { data: event });
  }
  if (pathname === '/api/v1/telemetry/events' && req.method === 'GET') {
    const result = listQuery(telemetry, urlObj);
    return sendJson(res, 200, { data: result.items, meta: result.meta });
  }
  return false;
}

async function handleFiles(req, res, urlObj, pathname) {
  const files = readCollection('files');
  if (pathname === '/api/v1/files/upload' && req.method === 'POST') {
    const body = await readBody(req);
    const filename = path.basename(body.filename || 'upload.bin');
    const buffer = body.contentBase64 ? Buffer.from(body.contentBase64, 'base64') : Buffer.from(String(body.content || ''), 'utf8');
    const fileId = makeId('fil');
    const storageName = `${fileId}_${filename}`;
    const filePath = path.join(STORAGE_DIR, storageName);
    fs.writeFileSync(filePath, buffer);
    const record = {
      id: fileId,
      filename,
      storageName,
      mime: body.mime || 'application/octet-stream',
      size: buffer.length,
      downloadToken: crypto.randomBytes(10).toString('hex'),
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      version: 1
    };
    files.push(record);
    writeCollection('files', files);
    return sendJson(res, 201, { data: record, signedUrl: `/api/v1/files/${record.id}/download?token=${record.downloadToken}` });
  }
  const downloadMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)\/download$/);
  if (downloadMatch && req.method === 'GET') {
    const file = files.find(x => x.id === downloadMatch[1] && !x.deletedAt);
    if (!file) return sendJson(res, 404, { error: 'file not found' });
    const token = urlObj.searchParams.get('token');
    if (token !== file.downloadToken) return sendJson(res, 403, { error: 'invalid signed token' });
    const filePath = path.join(STORAGE_DIR, file.storageName);
    if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'stored file missing' });
    const buffer = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': file.mime,
      'Content-Length': buffer.length,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'no-store'
    });
    return res.end(buffer);
  }
  const deleteMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const file = files.find(x => x.id === deleteMatch[1]);
    if (!file) return sendJson(res, 404, { error: 'file not found' });
    file.deletedAt = now();
    file.updatedAt = now();
    file.version += 1;
    writeCollection('files', files);
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/api/v1/files' && req.method === 'GET') {
    const result = listQuery(files, urlObj);
    return sendJson(res, 200, { data: result.items, meta: result.meta });
  }
  return false;
}

async function handleJobs(req, res, urlObj, pathname) {
  const jobs = readCollection('jobs');
  if (pathname === '/api/v1/events/publish' && req.method === 'POST') {
    const body = await readBody(req);
    enqueueJob('publish-event', body);
    return sendJson(res, 202, { ok: true });
  }
  if (pathname === '/api/v1/jobs' && req.method === 'GET') {
    const result = listQuery(jobs, urlObj);
    return sendJson(res, 200, { data: result.items, meta: result.meta });
  }
  return false;
}

function handleUtility(req, res, urlObj, pathname) {
  if (pathname === '/healthz') {
    return sendJson(res, 200, { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) });
  }
  if (pathname === '/readyz') {
    const ready = fs.existsSync(DATA_DIR) && fs.existsSync(PUBLIC_DIR) && fs.existsSync(STORAGE_DIR);
    return sendJson(res, ready ? 200 : 503, { status: ready ? 'ready' : 'not-ready' });
  }
  if (pathname === '/status') {
    const items = readCollection('items');
    const users = readCollection('users');
    const audit = readCollection('audit');
    const avgLatency = metrics.requestCount ? Number((metrics.latencyTotalMs / metrics.requestCount).toFixed(2)) : 0;
    return sendJson(res, 200, {
      status: config.maintenanceMode ? 'maintenance' : 'online',
      app: config.name,
      metrics: { ...metrics, avgLatencyMs: avgLatency },
      counts: {
        items: items.filter(x => !x.deletedAt).length,
        users: users.filter(x => !x.deletedAt).length,
        audit: audit.length
      }
    });
  }
  if (pathname === '/api/v1/docs') {
    return sendJson(res, 200, {
      version: 'v1',
      resources: ['/api/v1/items', '/api/v1/users', '/api/v1/auth/*', '/api/v1/feature-flags', '/api/v1/audit', '/api/v1/files', '/api/v1/telemetry/events']
    });
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  metrics.requestCount += 1;
  const routeKey = `${req.method} ${(req.url || '').split('?')[0]}`;
  metrics.perRoute[routeKey] = (metrics.perRoute[routeKey] || 0) + 1;

  try {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, { ok: true });
    }

    const urlObj = new URL(req.url || '/', `http://${req.headers.host || `${config.host}:${config.port}`}`);
    const pathname = decodeURIComponent(urlObj.pathname);

    if (config.maintenanceMode && pathname !== '/healthz' && pathname !== '/readyz') {
      return sendJson(res, 503, { error: 'maintenance mode' });
    }

    for (const handler of [handleUtility, handleAuth, handleItems, handleUsers, handleFlags, handleAudit, handleTelemetry, handleFiles, handleJobs]) {
      const handled = await handler(req, res, urlObj, pathname);
      if (handled !== false) {
        metrics.latencyTotalMs += Date.now() - started;
        return;
      }
    }

    if (!pathname.startsWith('/api/')) {
      serveStatic(req, res, pathname);
      metrics.latencyTotalMs += Date.now() - started;
      return;
    }

    notFound(res);
    metrics.latencyTotalMs += Date.now() - started;
  } catch (error) {
    metrics.errorCount += 1;
    const errors = readCollection('audit');
    errors.unshift({
      id: makeId('err'),
      action: 'error',
      entity: 'server',
      entityId: null,
      actor: 'system',
      before: null,
      after: { message: error.message, stack: error.stack },
      createdAt: now()
    });
    writeCollection('audit', errors.slice(0, 1000));
    sendJson(res, 500, { error: 'internal_server_error', message: error.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`${config.name} App Center listening on http://${config.host}:${config.port}`);
});
