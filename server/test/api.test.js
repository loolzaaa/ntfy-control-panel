'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(os.tmpdir(), `ntfy-panel-api-${process.pid}-${Date.now()}.db`);

process.env.PANEL_DB = dbPath;
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'secret12345';
process.env.NTFY_BIN = 'ntfy-fake';
process.env.NODE_ENV = 'test';

// --- ntfy CLI emulation ------------------------------------------------------
const childProcess = require('node:child_process');

const state = {
  users: new Map(),
  tokens: new Map(),
  grants: new Map(),
};

let tokenCounter = 0;
function makeToken() {
  const value = 'tk_' + tokenCounter.toString(36).padStart(29, '0');
  tokenCounter += 1;
  return value;
}

const PHRASE = { 'read-write': 'read-write', 'read-only': 'read-only', 'write-only': 'write-only', deny: 'no' };

function renderUser(name) {
  const user = state.users.get(name);
  if (!user) {
    return '';
  }
  const lines = [`user ${name} (role: ${user.role}, tier: none)`];
  if (user.role === 'admin') {
    lines.push('- read-write access to all topics (admin role)');
  } else {
    const grants = state.grants.get(name) || [];
    if (grants.length === 0) {
      lines.push('- no topic-specific permissions');
    } else {
      for (const grant of grants) {
        lines.push(`- ${PHRASE[grant.permission]} access to topic ${grant.topic}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

function handle(args) {
  const cmd = args[0];

  if (cmd === 'user' && args[1] === 'list') {
    return [...state.users.keys()].map(renderUser).join('');
  }

  if (cmd === 'user' && args[1] === 'add') {
    const name = args[args.length - 1];
    const roleArg = args.find((arg) => arg.startsWith('--role='));
    const role = roleArg ? roleArg.split('=')[1] : 'user';
    if (state.users.has(name)) {
      return { error: `user ${name} already exists` };
    }
    state.users.set(name, { name, role });
    return `user ${name} added with role ${role}\n`;
  }

  if (cmd === 'user' && args[1] === 'del') {
    const name = args[args.length - 1];
    if (!state.users.has(name)) {
      return { error: `user ${name} does not exist` };
    }
    state.users.delete(name);
    state.tokens.delete(name);
    state.grants.delete(name);
    return `user ${name} removed\n`;
  }

  if (cmd === 'access') {
    if (args.includes('--reset')) {
      const rest = args.filter((arg) => arg !== '--reset');
      const name = rest[1];
      const topic = rest[2];
      if (topic) {
        const grants = (state.grants.get(name) || []).filter((grant) => grant.topic !== topic);
        state.grants.set(name, grants);
      } else {
        state.grants.delete(name);
      }
      return `reset access for user ${name}\n\n${renderUser(name)}`;
    }
    const name = args[1];
    const topic = args[2];
    const permission = args[3];
    if (!state.users.has(name)) {
      return { error: `user ${name} does not exist` };
    }
    if (!topic) {
      return renderUser(name);
    }
    const grants = state.grants.get(name) || [];
    const existing = grants.find((grant) => grant.topic === topic);
    if (existing) {
      existing.permission = permission;
    } else {
      grants.push({ topic, permission, provisioned: false });
    }
    state.grants.set(name, grants);
    return `granted access to topic ${topic}\n\n${renderUser(name)}`;
  }

  if (cmd === 'token' && args[1] === 'add') {
    const name = args[args.length - 1];
    if (!state.users.has(name)) {
      return { error: `user ${name} does not exist` };
    }
    const labelArg = args.find((arg) => arg.startsWith('--label='));
    const label = labelArg ? labelArg.split('=')[1] : '';
    const value = makeToken();
    const tokens = state.tokens.get(name) || [];
    tokens.push({ value, label });
    state.tokens.set(name, tokens);
    return `token ${value} created for user ${name}, never expires\n`;
  }

  if (cmd === 'token' && args[1] === 'list') {
    const name = args[2];
    const tokens = state.tokens.get(name) || [];
    if (tokens.length === 0) {
      return `user ${name} has no access tokens\n`;
    }
    const lines = [`user ${name}`];
    for (const token of tokens) {
      const label = token.label ? ` (${token.label})` : '';
      lines.push(`- ${token.value}${label}, never expires, accessed from 0.0.0.0 at 02 Jan 06 15:04 UTC`);
    }
    return `${lines.join('\n')}\n`;
  }

  if (cmd === 'token' && args[1] === 'del') {
    const name = args[2];
    const value = args[3];
    const tokens = (state.tokens.get(name) || []).filter((token) => token.value !== value);
    state.tokens.set(name, tokens);
    return `token ${value} for user ${name} removed\n`;
  }

  return '';
}

childProcess.execFile = (bin, args, options, callback) => {
  process.nextTick(() => {
    const result = handle(args);
    if (result && result.error) {
      callback(Object.assign(new Error(result.error), { code: 1 }), '', result.error);
    } else {
      callback(null, result || '', '');
    }
  });
  return { on() {}, kill() {} };
};

// --- Application startup -----------------------------------------------------
const config = require('../src/config');
const { initDb, closeDb } = require('../src/db');
const users = require('../src/services/users');
const { createApp } = require('../src/app');

const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-dist-'));
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><body>panel</body></html>');
config.clientDistDir = distDir;

initDb(dbPath);
users.createLocalUser('admin', 'secret12345', 'admin');
const app = createApp();

let server;
let baseUrl;
let cookie = '';

function saveCookie(res) {
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (cookies.length) {
    cookie = cookies.map((value) => value.split(';')[0]).join('; ');
  }
}

async function api(method, url, body, headers = {}) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  saveCookie(res);
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data, contentType };
}

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (server) {
    server.close();
  }
  closeDb();
  fs.rmSync(distDir, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      // ignore
    }
  }
});

test('full user lifecycle over the HTTP API', async () => {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, 'admin');
  const csrf = login.data.csrfToken;
  assert.ok(csrf);

  const csrfHeaders = { 'x-csrf-token': csrf };

  const created = await api(
    'POST',
    '/api/users',
    { username: 'alice', role: 'user', createToken: true, tokenLabel: 'alice' },
    csrfHeaders
  );
  assert.equal(created.status, 201);
  assert.match(created.data.token.value, /^tk_/);

  const list = await api('GET', '/api/users');
  assert.equal(list.status, 200);
  assert.ok(list.data.users.some((user) => user.name === 'alice'));

  const detail = await api('GET', '/api/users/alice');
  assert.equal(detail.status, 200);
  assert.equal(detail.data.tokens.length, 1);
  assert.equal(detail.data.tokens[0].label, 'alice');

  const extraToken = await api(
    'POST',
    '/api/users/alice/tokens',
    { label: 'backup', expires: '30d' },
    csrfHeaders
  );
  assert.equal(extraToken.status, 201);

  const access = await api(
    'PUT',
    '/api/users/alice/access',
    { topic: 'alerts-*', permission: 'read-write' },
    csrfHeaders
  );
  assert.equal(access.status, 200);
  assert.equal(access.data.user.grants.length, 1);
  assert.equal(access.data.user.grants[0].topic, 'alerts-*');

  const afterAccess = await api('GET', '/api/users/alice');
  assert.equal(afterAccess.data.tokens.length, 2);
  assert.equal(afterAccess.data.user.grants.length, 1);

  const deleteOne = await api(
    'DELETE',
    `/api/users/alice/tokens/${encodeURIComponent(created.data.token.value)}`,
    undefined,
    csrfHeaders
  );
  assert.equal(deleteOne.status, 200);

  const deleteAll = await api('DELETE', '/api/users/alice/tokens', undefined, csrfHeaders);
  assert.equal(deleteAll.status, 200);
  assert.equal(deleteAll.data.count, 1);

  const deleteAccess = await api(
    'DELETE',
    '/api/users/alice/access?topic=alerts-*',
    undefined,
    csrfHeaders
  );
  assert.equal(deleteAccess.status, 200);
  assert.equal(deleteAccess.data.user.grants.length, 0);

  const removeUser = await api('DELETE', '/api/users/alice', undefined, csrfHeaders);
  assert.equal(removeUser.status, 200);

  const listAfter = await api('GET', '/api/users');
  assert.ok(!listAfter.data.users.some((user) => user.name === 'alice'));

  const audit = await api('GET', '/api/audit?pageSize=100');
  assert.equal(audit.status, 200);
  const actions = audit.data.items.map((item) => item.action);
  for (const expected of ['user.create', 'token.create', 'access.set', 'access.delete', 'token.delete', 'token.delete_all', 'user.delete']) {
    assert.ok(actions.includes(expected), `audit must contain action ${expected}`);
  }
});

test('audit log can be filtered by ntfy user', async () => {
  await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });

  const res = await api('GET', '/api/audit?targetUser=alice&pageSize=100');
  assert.equal(res.status, 200);
  assert.ok(res.data.items.length > 0);
  for (const item of res.data.items) {
    assert.ok(item.targetUser && item.targetUser.includes('alice'));
  }
});

test('user list is sorted by username', async () => {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  const headers = { 'x-csrf-token': login.data.csrfToken };

  await api('POST', '/api/users', { username: 'zeta', createToken: false }, headers);
  await api('POST', '/api/users', { username: 'alpha', createToken: false }, headers);

  const res = await api('GET', '/api/users');
  assert.equal(res.status, 200);

  const names = res.data.users.map((user) => user.name).filter((name) => name !== '*');
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  assert.deepEqual(names, sorted);
  assert.ok(names.indexOf('alpha') < names.indexOf('zeta'));
});

test('CSRF protection: mutation without token is rejected', async () => {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  assert.equal(login.status, 200);

  const result = await api('POST', '/api/users', { username: 'bob' });
  assert.equal(result.status, 403);
  assert.equal(result.data.error.code, 'forbidden');
});

test('regular users cannot access admin endpoints', async () => {
  users.createLocalUser('viewer', 'viewerpass', 'user');

  const login = await api('POST', '/api/auth/login', { username: 'viewer', password: 'viewerpass' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, 'user');

  const me = await api('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'user');

  const usersList = await api('GET', '/api/users');
  assert.equal(usersList.status, 403);
  assert.equal(usersList.data.error.code, 'forbidden');

  const auditList = await api('GET', '/api/audit');
  assert.equal(auditList.status, 403);
});

test('self-service tokens respect the configured limit', async () => {
  let login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  let csrf = login.data.csrfToken;

  const created = await api(
    'POST',
    '/api/users',
    { username: 'viewer', role: 'user', createToken: false },
    { 'x-csrf-token': csrf }
  );
  assert.equal(created.status, 201);

  login = await api('POST', '/api/auth/login', { username: 'viewer', password: 'viewerpass' });
  csrf = login.data.csrfToken;
  const headers = { 'x-csrf-token': csrf };

  const initial = await api('GET', '/api/me/tokens');
  assert.equal(initial.status, 200);
  assert.equal(initial.data.tokens.length, 0);
  assert.equal(initial.data.maxTokens, 4);
  assert.equal(initial.data.ntfyUserExists, true);

  for (let index = 0; index < 4; index += 1) {
    const token = await api('POST', '/api/me/tokens', { label: `t${index}` }, headers);
    assert.equal(token.status, 201);
    assert.match(token.data.token.value, /^tk_/);
  }

  const over = await api('POST', '/api/me/tokens', { label: 'overflow' }, headers);
  assert.equal(over.status, 409);
  assert.equal(over.data.error.code, 'token_limit_reached');

  const full = await api('GET', '/api/me/tokens');
  assert.equal(full.data.tokens.length, 4);

  const removed = await api(
    'DELETE',
    `/api/me/tokens/${encodeURIComponent(full.data.tokens[0].value)}`,
    undefined,
    headers
  );
  assert.equal(removed.status, 200);

  const afterDelete = await api('POST', '/api/me/tokens', { label: 'after' }, headers);
  assert.equal(afterDelete.status, 201);

  login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  csrf = login.data.csrfToken;
  const adminOver = await api(
    'POST',
    '/api/users/viewer/tokens',
    { label: 'admin' },
    { 'x-csrf-token': csrf }
  );
  assert.equal(adminOver.status, 409);
  assert.equal(adminOver.data.error.code, 'token_limit_reached');
});

test('self-service shows own access rights (read-only)', async () => {
  let login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  const csrf = login.data.csrfToken;

  const grant = await api(
    'PUT',
    '/api/users/viewer/access',
    { topic: 'alerts-*', permission: 'read-only' },
    { 'x-csrf-token': csrf }
  );
  assert.equal(grant.status, 200);

  login = await api('POST', '/api/auth/login', { username: 'viewer', password: 'viewerpass' });
  const res = await api('GET', '/api/me/access');
  assert.equal(res.status, 200);
  assert.ok(res.data.grants.some((item) => item.topic === 'alerts-*' && item.permission === 'read-only'));
});

test('tokens created outside the panel are shown, cannot be added to, and can be deleted', async () => {
  // Simulate a token created directly via the ntfy CLI, above the limit.
  const cliToken = makeToken();
  const viewerTokens = state.tokens.get('viewer') || [];
  viewerTokens.push({ value: cliToken, label: 'created-via-cli' });
  state.tokens.set('viewer', viewerTokens);

  // The administrator sees all tokens (even above the limit) and cannot add more.
  let login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  const adminDetail = await api('GET', '/api/users/viewer');
  assert.equal(adminDetail.status, 200);
  assert.equal(adminDetail.data.tokens.length, 5);
  assert.equal(adminDetail.data.maxTokens, 4);
  const adminBlocked = await api(
    'POST',
    '/api/users/viewer/tokens',
    { label: 'x' },
    { 'x-csrf-token': login.data.csrfToken }
  );
  assert.equal(adminBlocked.status, 409);
  assert.equal(adminBlocked.data.error.code, 'token_limit_reached');

  // The user sees all tokens, cannot add, but can delete.
  login = await api('POST', '/api/auth/login', { username: 'viewer', password: 'viewerpass' });
  const headers = { 'x-csrf-token': login.data.csrfToken };

  const over = await api('GET', '/api/me/tokens');
  assert.equal(over.status, 200);
  assert.equal(over.data.tokens.length, 5);
  assert.equal(over.data.maxTokens, 4);

  const blocked = await api('POST', '/api/me/tokens', { label: 'nope' }, headers);
  assert.equal(blocked.status, 409);

  const removeFirst = await api(
    'DELETE',
    `/api/me/tokens/${encodeURIComponent(over.data.tokens[0].value)}`,
    undefined,
    headers
  );
  assert.equal(removeFirst.status, 200);

  const atLimit = await api('GET', '/api/me/tokens');
  assert.equal(atLimit.data.tokens.length, 4);

  const stillBlocked = await api('POST', '/api/me/tokens', { label: 'nope' }, headers);
  assert.equal(stillBlocked.status, 409);

  const removeSecond = await api(
    'DELETE',
    `/api/me/tokens/${encodeURIComponent(atLimit.data.tokens[0].value)}`,
    undefined,
    headers
  );
  assert.equal(removeSecond.status, 200);

  const allowed = await api('POST', '/api/me/tokens', { label: 'ok' }, headers);
  assert.equal(allowed.status, 201);
});

test('SPA is served as static files, unknown API route returns 404 JSON', async () => {
  const index = await api('GET', '/');
  assert.equal(index.status, 200);
  assert.ok(index.contentType.includes('text/html'));

  const missing = await api('GET', '/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error.code, 'not_found');
});
