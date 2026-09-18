'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(os.tmpdir(), `ntfy-panel-base-${process.pid}-${Date.now()}.db`);

process.env.PANEL_DB = dbPath;
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';
process.env.BASE_PATH = '/ntfy-panel/';

const config = require('../src/config');
const { initDb, closeDb } = require('../src/db');
const users = require('../src/services/users');
const { createApp } = require('../src/app');

test('base path is normalized', () => {
  assert.equal(config.basePath, '/ntfy-panel');
});

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

async function request(method, url, body, headers = {}) {
  const res = await fetch(baseUrl + url, {
    method,
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  saveCookie(res);
  return res;
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

test('login works under the context path and scopes the cookie to it', async () => {
  const res = await request('POST', '/ntfy-panel/api/auth/login', {
    username: 'admin',
    password: 'secret12345',
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.getSetCookie().join(';');
  assert.match(setCookie, /Path=\/ntfy-panel/);
});

test('API outside the context path is not found', async () => {
  const res = await request('POST', '/api/auth/login', {
    username: 'admin',
    password: 'secret12345',
  });
  assert.equal(res.status, 404);
});

test('health check is available at the root and under the context path', async () => {
  assert.equal((await request('GET', '/healthz')).status, 200);
  assert.equal((await request('GET', '/ntfy-panel/healthz')).status, 200);
});

test('root redirects to the context path and the SPA is served under it', async () => {
  const redirect = await request('GET', '/');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/ntfy-panel/');

  const spa = await request('GET', '/ntfy-panel/');
  assert.equal(spa.status, 200);
  assert.ok((spa.headers.get('content-type') || '').includes('text/html'));
});
