'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseUserList, parseTokenList, parseTokenAdd } = require('../src/ntfy/parsers');

test('parseUserList: admin (role/tier format)', () => {
  const output = [
    'user phil (role: admin, tier: none)',
    '- read-write access to all topics (admin role)',
  ].join('\n');

  const users = parseUserList(output);
  assert.equal(users.length, 1);
  assert.equal(users[0].name, 'phil');
  assert.equal(users[0].role, 'admin');
  assert.equal(users[0].admin, true);
  assert.deepEqual(users[0].grants, []);
});

test('parseUserList: regular user with multiple permissions', () => {
  const output = [
    'user ben (role: user, tier: none)',
    '- read-write access to topic garagedoor',
    '- read-only access to topic furnace',
    '- write-only access to topic alerts-*',
    '- no access to topic secret',
  ].join('\n');

  const users = parseUserList(output);
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'user');
  assert.equal(users[0].grants.length, 4);
  assert.deepEqual(users[0].grants[0], {
    topic: 'garagedoor',
    permission: 'read-write',
    provisioned: false,
  });
  assert.equal(users[0].grants[1].permission, 'read-only');
  assert.equal(users[0].grants[2].topic, 'alerts-*');
  assert.equal(users[0].grants[2].permission, 'write-only');
  assert.equal(users[0].grants[3].permission, 'deny');
});

test('parseUserList: anonymous user and default access', () => {
  const output = [
    'user * (role: user, tier: none)',
    '- read-only access to topic announcements',
    '- no access to any (other) topics (server config)',
  ].join('\n');

  const users = parseUserList(output);
  assert.equal(users[0].name, '*');
  assert.equal(users[0].defaultAccess, 'deny');
  assert.equal(users[0].grants.length, 1);
});

test('parseUserList: legacy format (role in parentheses)', () => {
  const output = [
    'user phil (admin)',
    '- read-write access to all topics (admin role)',
    'user ben (user)',
    '- read-write access to topic garagedoor',
  ].join('\n');

  const users = parseUserList(output);
  assert.equal(users.length, 2);
  assert.equal(users[0].role, 'admin');
  assert.equal(users[1].role, 'user');
});

test('parseUserList: user without permissions', () => {
  const output = ['user empty (role: user, tier: none)', '- no topic-specific permissions'].join('\n');

  const users = parseUserList(output);
  assert.equal(users[0].grants.length, 0);
});

test('parseUserList: provisioned permissions are flagged', () => {
  const output = [
    'user ben (role: user, tier: none, server config)',
    '- read-write access to topic backups (server config)',
  ].join('\n');

  const users = parseUserList(output);
  assert.equal(users[0].provisioned, true);
  assert.equal(users[0].grants[0].provisioned, true);
});

test('parseTokenList: tokens with and without label', () => {
  const output = [
    'user phil',
    '- tk_7eevizlsiwf9yi4uxsrs83r4352o0 (backups), expires 15 Mar 23 14:33 EDT, accessed from 0.0.0.0 at 13 Feb 23 13:33 EST',
    '- tk_3gd7d2yftt4b8ixyfe9mnmro88o76, never expires, accessed from 1.2.3.4 at 02 Jan 06 15:04 UTC',
  ].join('\n');

  const tokens = parseTokenList(output);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].username, 'phil');
  assert.equal(tokens[0].label, 'backups');
  assert.equal(tokens[0].neverExpires, false);
  assert.equal(tokens[0].expiresAt, '15 Mar 23 14:33 EDT');
  assert.equal(tokens[1].label, '');
  assert.equal(tokens[1].neverExpires, true);
  assert.equal(tokens[1].lastOrigin, '1.2.3.4');
});

test('parseTokenList: no tokens', () => {
  assert.deepEqual(parseTokenList('user phil has no access tokens\n'), []);
  assert.deepEqual(parseTokenList('no users with tokens\n'), []);
});

test('parseTokenList: multiple users', () => {
  const output = [
    'user phil',
    '- tk_7eevizlsiwf9yi4uxsrs83r4352o0 (backups), never expires, accessed from 0.0.0.0 at 02 Jan 06 15:04 UTC',
    'user ben',
    '- tk_3gd7d2yftt4b8ixyfe9mnmro88o76, never expires, accessed from 0.0.0.0 at 02 Jan 06 15:04 UTC',
  ].join('\n');

  const tokens = parseTokenList(output);
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].username, 'phil');
  assert.equal(tokens[1].username, 'ben');
});

test('parseTokenAdd: parses created token', () => {
  const never = parseTokenAdd('token tk_7eevizlsiwf9yi4uxsrs83r4352o0 created for user phil, never expires\n');
  assert.equal(never.token, 'tk_7eevizlsiwf9yi4uxsrs83r4352o0');
  assert.equal(never.username, 'phil');
  assert.equal(never.expires, 'never expires');

  const expires = parseTokenAdd(
    'token tk_3gd7d2yftt4b8ixyfe9mnmro88o76 created for user ben, expires Mon Jan  2 15:04:05 MST 2006\n'
  );
  assert.equal(expires.username, 'ben');
  assert.match(expires.expires, /^expires /);
});

test('parseTokenAdd: unknown format', () => {
  assert.equal(parseTokenAdd('something went wrong\n'), null);
});
