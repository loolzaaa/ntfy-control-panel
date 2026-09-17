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
const { initDb, closeDb } = require('../src/db');
const admins = require('../src/services/admins');
const { createApp } = require('../src/app');

initDb(dbPath);
admins.createAdmin('admin', 'secret12345');
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

test('CSRF protection: mutation without token is rejected', async () => {
  const login = await api('POST', '/api/auth/login', { username: 'admin', password: 'secret12345' });
  assert.equal(login.status, 200);

  const result = await api('POST', '/api/users', { username: 'bob' });
  assert.equal(result.status, 403);
  assert.equal(result.data.error.code, 'forbidden');
});

test('SPA is served as static files, unknown API route returns 404 JSON', async () => {
  const index = await api('GET', '/');
  assert.equal(index.status, 200);
  assert.ok(index.contentType.includes('text/html'));

  const missing = await api('GET', '/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.data.error.code, 'not_found');
});
