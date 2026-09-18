'use strict';

const express = require('express');
const config = require('../config');
const ntfy = require('../ntfy/service');
const audit = require('../services/audit');
const { assertTokenLimit } = require('../services/tokenPolicy');
const {
  validate,
  createUserSchema,
  ntfyPasswordSchema,
  addTokenSchema,
  accessSchema,
  topicPatternSchema,
} = require('../utils/validate');
const { maskToken } = require('../utils/mask');
const { badRequest, forbidden } = require('../errors');

const router = express.Router();

function serializeUser(user) {
  return {
    name: user.name,
    role: user.role,
    admin: Boolean(user.admin),
    tier: user.tier,
    provisioned: Boolean(user.provisioned),
    anonymous: user.name === '*',
    defaultAccess: user.defaultAccess || null,
    grants: user.grants || [],
  };
}

function assertManageable(username) {
  if (!username || username === '*') {
    throw forbidden('Managing the anonymous "*" user is not available');
  }
}

function compareUsers(a, b) {
  if (a.name === '*') {
    return 1;
  }
  if (b.name === '*') {
    return -1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

router.get('/', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  let users = await ntfy.listUsers();
  users.sort(compareUsers);
  if (query) {
    users = users.filter((user) => user.name.toLowerCase().includes(query));
  }
  res.json({ users: users.map(serializeUser) });
});

router.post('/', async (req, res) => {
  const data = validate(createUserSchema, req.body);
  const result = await ntfy.createUser({
    username: data.username,
    role: data.role,
  });

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'user.create',
    targetUser: data.username,
    details: {
      role: data.role,
      passwordGenerated: true,
    },
  });

  res.status(201).json({
    user: { name: result.username, role: result.role },
    password: result.password,
  });
});

router.put('/:username/password', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const data = validate(ntfyPasswordSchema, req.body || {});
  const custom = typeof data.password === 'string' && data.password.length > 0;

  if (custom) {
    await ntfy.changePassword(username, data.password);
  } else {
    const password = await ntfy.resetPassword(username);
    audit.log({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'user.password_change',
      targetUser: username,
      details: { generated: true },
    });
    res.json({ password });
    return;
  }

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'user.password_change',
    targetUser: username,
    details: { generated: false },
  });

  res.json({ ok: true });
});

router.get('/:username', async (req, res) => {
  const { username } = req.params;
  const user = await ntfy.getUser(username);
  const tokens = username === '*' ? [] : await ntfy.listTokens(username);
  res.json({ user: serializeUser(user), tokens, maxTokens: config.tokens.maxPerUser });
});

router.delete('/:username', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  await ntfy.deleteUser(username);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'user.delete',
    targetUser: username,
  });

  res.json({ ok: true });
});

router.post('/:username/tokens', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const data = validate(addTokenSchema, req.body || {});
  await assertTokenLimit(username);
  const token = await ntfy.addToken(username, data.label || undefined, data.expires || undefined);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'token.create',
    targetUser: username,
    details: { label: token.label || null, token: maskToken(token.value) },
  });

  res.status(201).json({ token });
});

router.delete('/:username/tokens/:token', async (req, res) => {
  const { username, token } = req.params;
  assertManageable(username);

  await ntfy.deleteToken(username, token);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'token.delete',
    targetUser: username,
    details: { token: maskToken(token) },
  });

  res.json({ ok: true });
});

router.delete('/:username/tokens', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const count = await ntfy.deleteAllTokens(username);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'token.delete_all',
    targetUser: username,
    details: { count },
  });

  res.json({ ok: true, count });
});

router.put('/:username/access', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const data = validate(accessSchema, req.body);
  await ntfy.setAccess(username, data.topic, data.permission);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'access.set',
    targetUser: username,
    details: { topic: data.topic, permission: data.permission },
  });

  const user = await ntfy.getUser(username);
  res.json({ user: serializeUser(user) });
});

router.delete('/:username/access', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const rawTopic = typeof req.query.topic === 'string' ? req.query.topic : '';
  if (!rawTopic) {
    throw badRequest('Topic not specified', 'topic_required');
  }
  const topic = validate(topicPatternSchema, rawTopic);
  await ntfy.deleteAccess(username, topic);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'access.delete',
    targetUser: username,
    details: { topic },
  });

  const user = await ntfy.getUser(username);
  res.json({ user: serializeUser(user) });
});

module.exports = router;
