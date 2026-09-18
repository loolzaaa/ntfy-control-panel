'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Replace execFile BEFORE loading the runner module to intercept ntfy CLI calls.
const childProcess = require('node:child_process');

let calls = [];
let responder = () => ({ stdout: '' });

childProcess.execFile = (bin, args, options, callback) => {
  calls.push({ bin, args, options });
  const result = responder(args, options);
  process.nextTick(() => {
    if (result.error) {
      callback(Object.assign(new Error(result.error.message || 'ntfy error'), result.error), '', result.stderr || '');
    } else {
      callback(null, result.stdout || '', result.stderr || '');
    }
  });
  return { on() {}, kill() {} };
};

const service = require('../src/ntfy/service');

test.beforeEach(() => {
  calls = [];
  responder = () => ({ stdout: '' });
});

test('listUsers: parses ntfy user list output', async () => {
  responder = () => ({
    stdout: ['user phil (role: admin, tier: none)', '- read-write access to all topics (admin role)'].join('\n'),
  });

  const users = await service.listUsers();
  assert.equal(calls[0].args.join(' '), 'user list');
  assert.equal(users.length, 1);
  assert.equal(users[0].name, 'phil');
});

test('createUser: creates user and token, passes password via env', async () => {
  responder = (args) => {
    if (args[0] === 'user' && args[1] === 'add') {
      return { stdout: 'user alice added with role user\n' };
    }
    if (args[0] === 'token' && args[1] === 'add') {
      return { stdout: 'token tk_7eevizlsiwf9yi4uxsrs83r4352o0 created for user alice, never expires\n' };
    }
    return { stdout: '' };
  };

  const result = await service.createUser({ username: 'alice', role: 'user', createToken: true });

  assert.equal(result.username, 'alice');
  assert.equal(result.token.value, 'tk_7eevizlsiwf9yi4uxsrs83r4352o0');

  const addCall = calls.find((call) => call.args[1] === 'add' && call.args[0] === 'user');
  assert.deepEqual(addCall.args, ['user', 'add', '--role=user', 'alice']);
  assert.ok(addCall.options.env.NTFY_PASSWORD, 'password must be passed via NTFY_PASSWORD');

  const tokenCall = calls.find((call) => call.args[0] === 'token');
  assert.deepEqual(tokenCall.args, ['token', 'add', '--label=alice', 'alice']);
});

test('addToken: creates token with label and expiration', async () => {
  responder = () => ({
    stdout: 'token tk_3gd7d2yftt4b8ixyfe9mnmro88o76 created for user bob, expires Mon Jan  2 15:04:05 MST 2006\n',
  });

  const token = await service.addToken('bob', 'backups', '30d');
  assert.equal(token.value, 'tk_3gd7d2yftt4b8ixyfe9mnmro88o76');
  assert.deepEqual(calls[0].args, ['token', 'add', '--expires=30d', '--label=backups', 'bob']);
});

test('deleteAllTokens: deletes all user tokens', async () => {
  responder = (args) => {
    if (args[0] === 'token' && args[1] === 'list') {
      return {
        stdout: [
          'user phil',
          '- tk_7eevizlsiwf9yi4uxsrs83r4352o0 (a), never expires, accessed from 0.0.0.0 at 02 Jan 06 15:04 UTC',
          '- tk_3gd7d2yftt4b8ixyfe9mnmro88o76 (b), never expires, accessed from 0.0.0.0 at 02 Jan 06 15:04 UTC',
        ].join('\n'),
      };
    }
    return { stdout: '' };
  };

  const count = await service.deleteAllTokens('phil');
  assert.equal(count, 2);
  const delCalls = calls.filter((call) => call.args[1] === 'del' && call.args[0] === 'token');
  assert.equal(delCalls.length, 2);
  assert.deepEqual(delCalls[0].args, ['token', 'del', 'phil', 'tk_7eevizlsiwf9yi4uxsrs83r4352o0']);
});

test('listTokens: sorts tokens by last access, newest first', async () => {
  responder = (args) => {
    if (args[0] === 'token' && args[1] === 'list') {
      return {
        stdout: [
          'user phil',
          '- tk_7eevizlsiwf9yi4uxsrs83r4352o0 (old), never expires, accessed from 0.0.0.0 at 01 Jan 20 10:00 UTC',
          '- tk_3gd7d2yftt4b8ixyfe9mnmro88o76 (new), never expires, accessed from 0.0.0.0 at 05 Jun 24 18:30 UTC',
        ].join('\n'),
      };
    }
    return { stdout: '' };
  };

  const tokens = await service.listTokens('phil');
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].label, 'new');
  assert.equal(tokens[1].label, 'old');
});

test('setAccess / deleteAccess: build correct arguments', async () => {
  await service.setAccess('ben', 'alerts-*', 'read-write');
  assert.deepEqual(calls[0].args, ['access', 'ben', 'alerts-*', 'read-write']);

  calls = [];
  await service.deleteAccess('ben', 'alerts-*');
  assert.deepEqual(calls[0].args, ['access', '--reset', 'ben', 'alerts-*']);
});

test('CLI "already exists" error is mapped to 409', async () => {
  responder = () => ({
    error: { code: 1 },
    stderr: 'user alice already exists',
  });

  await assert.rejects(
    () => service.createUser({ username: 'alice', createToken: false }),
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'user_exists');
      return true;
    }
  );
});
