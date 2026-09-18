'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(os.tmpdir(), `ntfy-panel-bootstrap-${process.pid}-${Date.now()}.db`);

process.env.PANEL_DB = dbPath;
process.env.NODE_ENV = 'test';
process.env.BOOTSTRAP_ADMIN_USERNAME = 'root';
process.env.BOOTSTRAP_ADMIN_PASSWORD = 'root-secret-123';

const config = require('../src/config');
const { initDb, closeDb } = require('../src/db');
const users = require('../src/services/users');
const { ensureBootstrapAdmin } = require('../src/bootstrap');

test.before(() => {
  initDb(dbPath);
});

test.after(() => {
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      // ignore
    }
  }
});

test('creates the primary administrator from configuration', () => {
  const result = ensureBootstrapAdmin();
  assert.equal(result.action, 'created');

  const root = users.findByUsername('root');
  assert.ok(root);
  assert.equal(root.role, 'admin');
  assert.equal(root.source, 'local');
  assert.ok(users.verifyPassword(root, 'root-secret-123'));
});

test('is idempotent on subsequent runs', () => {
  assert.equal(ensureBootstrapAdmin().action, 'ok');
});

test('synchronizes the primary password from configuration', () => {
  const root = users.findByUsername('root');
  users.changePassword(root.id, 'changed-in-db');

  const result = ensureBootstrapAdmin();
  assert.equal(result.action, 'password-synced');

  const updated = users.findByUsername('root');
  assert.ok(users.verifyPassword(updated, 'root-secret-123'));
  assert.equal(users.verifyPassword(updated, 'changed-in-db'), false);
});

test('fails when the primary administrator configuration is missing', () => {
  const originalUsername = config.bootstrap.username;
  const originalPassword = config.bootstrap.password;
  try {
    config.bootstrap.username = '';
    assert.throws(() => ensureBootstrapAdmin(), /BOOTSTRAP_ADMIN_USERNAME/);

    config.bootstrap.username = originalUsername;
    config.bootstrap.password = '';
    assert.throws(() => ensureBootstrapAdmin(), /BOOTSTRAP_ADMIN_USERNAME/);
  } finally {
    config.bootstrap.username = originalUsername;
    config.bootstrap.password = originalPassword;
  }
});
