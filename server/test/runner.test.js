'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { translateCliError } = require('../src/ntfy/runner');

test('maps config file permission errors to a dedicated code', () => {
  const error = translateCliError('open /etc/ntfy/server.yml: permission denied');
  assert.equal(error.code, 'ntfy_config_permission');
  assert.equal(error.status, 500);
});

test('keeps the generic mapping for unrelated errors', () => {
  const error = translateCliError('some unexpected failure');
  assert.equal(error.code, 'ntfy_error');
});
