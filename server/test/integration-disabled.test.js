'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(os.tmpdir(), `ntfy-panel-integration-off-${process.pid}-${Date.now()}.db`);

process.env.PANEL_DB = dbPath;
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';
delete process.env.INTEGRATION_API_KEYS;

const config = require('../src/config');
const { initDb, closeDb } = require('../src/db');
const { createApp } = require('../src/app');

const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-dist-'));
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><body>panel</body></html>');
config.clientDistDir = distDir;

initDb(dbPath);
const app = createApp();

let server;
let baseUrl;

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

test('integration API is not mounted when no keys are configured', async () => {
  assert.deepEqual(config.integration.apiKeys, []);
  const res = await fetch(`${baseUrl}/api/integration/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer anything' },
    body: JSON.stringify({ username: 'alice' }),
  });
  assert.equal(res.status, 404);
});
