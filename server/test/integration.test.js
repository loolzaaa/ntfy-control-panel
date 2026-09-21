'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(os.tmpdir(), `ntfy-panel-integration-${process.pid}-${Date.now()}.db`);

process.env.PANEL_DB = dbPath;
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'secret12345';
process.env.NTFY_BIN = 'ntfy-fake';
process.env.NODE_ENV = 'test';
process.env.INTEGRATION_API_KEYS = 'n8n:npk_test_key_0123456789';

// --- ntfy CLI emulation ------------------------------------------------------
const childProcess = require('node:child_process');

const state = {
  users: new Map(),
  grants: new Map(),
};

function handle(args, options = {}) {
  const cmd = args[0];
  const env = options.env || {};

  if (cmd === 'user' && args[1] === 'add') {
    const name = args[args.length - 1];
    const roleArg = args.find((arg) => arg.startsWith('--role='));
    const role = roleArg ? roleArg.split('=')[1] : 'user';
    if (state.users.has(name)) {
      return { error: `user ${name} already exists` };
    }
    state.users.set(name, { name, role, password: env.NTFY_PASSWORD });
    return `user ${name} added with role ${role}\n`;
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
      return `reset access for user ${name}\n`;
    }
    const name = args[1];
    const topic = args[2];
    const permission = args[3];
    if (!state.users.has(name)) {
      return { error: `user ${name} does not exist` };
    }
    if (!topic) {
      return '';
    }
    const grants = state.grants.get(name) || [];
    const existing = grants.find((grant) => grant.topic === topic);
    if (existing) {
      existing.permission = permission;
    } else {
      grants.push({ topic, permission });
    }
    state.grants.set(name, grants);
    return `granted access to topic ${topic}\n`;
  }

  return '';
}

childProcess.execFile = (bin, args, options, callback) => {
  process.nextTick(() => {
    const result = handle(args, options);
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
const audit = require('../src/services/audit');
const { createApp } = require('../src/app');

const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-dist-'));
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><body>panel</body></html>');
config.clientDistDir = distDir;

initDb(dbPath);
const app = createApp();

const API_KEY = 'npk_test_key_0123456789';

let server;
let baseUrl;

async function request(method, url, body, headers = {}) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

function bearer(key = API_KEY) {
  return { authorization: `Bearer ${key}` };
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

test('requests without a valid API key are rejected', async () => {
  const missing = await request('POST', '/api/integration/users', { username: 'alice' });
  assert.equal(missing.status, 401);

  const wrong = await request(
    'POST',
    '/api/integration/users',
    { username: 'alice' },
    bearer('npk_wrong')
  );
  assert.equal(wrong.status, 401);
});

test('creates a user with a generated password', async () => {
  const res = await request('POST', '/api/integration/users', { username: 'alice' }, bearer());
  assert.equal(res.status, 201);
  assert.equal(res.data.user.name, 'alice');
  assert.equal(res.data.user.role, 'user');
  assert.match(res.data.password, /^[A-HJ-NP-Za-km-z2-9]{20}$/);
  assert.equal(state.users.get('alice').password, res.data.password);
});

test('creates a user with a custom password, role and ACLs', async () => {
  const res = await request(
    'POST',
    '/api/integration/users',
    {
      username: 'bob',
      role: 'admin',
      password: 'custom-pass-123',
      acls: [{ topic: 'alerts-*', permission: 'read-write' }],
    },
    bearer()
  );
  assert.equal(res.status, 201);
  assert.equal(res.data.password, 'custom-pass-123');
  assert.equal(state.users.get('bob').password, 'custom-pass-123');
  assert.equal(state.users.get('bob').role, 'admin');
  assert.deepEqual(state.grants.get('bob'), [{ topic: 'alerts-*', permission: 'read-write' }]);
});

test('duplicate usernames are rejected', async () => {
  const res = await request('POST', '/api/integration/users', { username: 'alice' }, bearer());
  assert.equal(res.status, 409);
  assert.equal(res.data.error.code, 'user_exists');
});

test('the anonymous "*" user cannot be managed', async () => {
  const created = await request('POST', '/api/integration/users', { username: '*' }, bearer());
  assert.equal(created.status, 400);
  assert.equal(created.data.error.code, 'validation_error');

  const access = await request(
    'PUT',
    '/api/integration/users/*/access',
    { topic: 'news', permission: 'read-only' },
    bearer()
  );
  assert.equal(access.status, 403);
  assert.equal(access.data.error.code, 'forbidden');
});

test('invalid payloads are rejected', async () => {
  const res = await request(
    'POST',
    '/api/integration/users',
    { username: 'carol', acls: [{ topic: 'ok', permission: 'nope' }] },
    bearer()
  );
  assert.equal(res.status, 400);
  assert.equal(res.data.error.code, 'validation_error');
});

test('ACLs can be granted and revoked', async () => {
  const grant = await request(
    'PUT',
    '/api/integration/users/alice/access',
    { topic: 'news', permission: 'read-only' },
    bearer()
  );
  assert.equal(grant.status, 200);
  assert.deepEqual(state.grants.get('alice'), [{ topic: 'news', permission: 'read-only' }]);

  const missingTopic = await request(
    'DELETE',
    '/api/integration/users/alice/access',
    undefined,
    bearer()
  );
  assert.equal(missingTopic.status, 400);
  assert.equal(missingTopic.data.error.code, 'topic_required');

  const revoke = await request(
    'DELETE',
    '/api/integration/users/alice/access?topic=news',
    undefined,
    bearer()
  );
  assert.equal(revoke.status, 200);
  assert.deepEqual(state.grants.get('alice'), []);
});

test('integration actions are written to the audit log', async () => {
  const { items } = audit.query({ pageSize: 100 });
  const apiItems = items.filter((item) => item.adminUsername === 'api:n8n');
  const actions = apiItems.map((item) => item.action);
  assert.ok(actions.includes('user.create'));
  assert.ok(actions.includes('access.set'));
  assert.ok(actions.includes('access.delete'));
  for (const item of apiItems) {
    assert.equal(item.adminId, null);
    assert.equal(item.details.integration, true);
  }
});
