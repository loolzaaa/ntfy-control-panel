'use strict';

const express = require('express');
const ntfy = require('../ntfy/service');
const audit = require('../services/audit');
const {
  validate,
  provisionUserSchema,
  upsertUserSchema,
  accessSchema,
  topicPatternSchema,
} = require('../utils/validate');
const { badRequest, forbidden } = require('../errors');

const router = express.Router();

function assertManageable(username) {
  if (!username || username === '*') {
    throw forbidden('Managing the anonymous "*" user is not available');
  }
}

function integrationName(req) {
  return `api:${req.integration.name}`;
}

async function applyAcls(req, username, acls) {
  for (const acl of acls) {
    await ntfy.setAccess(username, acl.topic, acl.permission);
    audit.log({
      adminId: null,
      adminUsername: integrationName(req),
      action: 'access.set',
      targetUser: username,
      details: { integration: true, topic: acl.topic, permission: acl.permission },
    });
  }
}

router.post('/users', async (req, res) => {
  const data = validate(provisionUserSchema, req.body);
  assertManageable(data.username);

  const result = await ntfy.createUser({
    username: data.username,
    role: data.role,
    password: data.password || undefined,
  });

  audit.log({
    adminId: null,
    adminUsername: integrationName(req),
    action: 'user.create',
    targetUser: data.username,
    details: {
      integration: true,
      role: data.role,
      passwordGenerated: !data.password,
    },
  });

  await applyAcls(req, data.username, data.acls);

  res.status(201).json({
    user: { name: result.username, role: result.role },
    password: result.password,
    acls: data.acls,
    created: true,
  });
});

router.put('/users/:username', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const data = validate(upsertUserSchema, req.body);
  const exists = await ntfy.userExists(username);

  let password;
  let created = false;

  if (!exists) {
    const result = await ntfy.createUser({
      username,
      role: data.role,
      password: data.password || undefined,
    });
    password = result.password;
    created = true;

    audit.log({
      adminId: null,
      adminUsername: integrationName(req),
      action: 'user.create',
      targetUser: username,
      details: {
        integration: true,
        role: data.role,
        passwordGenerated: !data.password,
      },
    });
  } else {
    password = data.password || (await ntfy.resetPassword(username));

    audit.log({
      adminId: null,
      adminUsername: integrationName(req),
      action: 'user.password_change',
      targetUser: username,
      details: { integration: true, generated: !data.password },
    });
  }

  await applyAcls(req, username, data.acls);

  const user = await ntfy.getUser(username);
  res.json({
    user: { name: username, role: user.role },
    password,
    acls: data.acls,
    created,
  });
});

router.put('/users/:username/access', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const data = validate(accessSchema, req.body);
  await ntfy.setAccess(username, data.topic, data.permission);

  audit.log({
    adminId: null,
    adminUsername: integrationName(req),
    action: 'access.set',
    targetUser: username,
    details: { integration: true, topic: data.topic, permission: data.permission },
  });

  res.json({ ok: true });
});

router.delete('/users/:username/access', async (req, res) => {
  const { username } = req.params;
  assertManageable(username);

  const rawTopic = typeof req.query.topic === 'string' ? req.query.topic : '';
  if (!rawTopic) {
    throw badRequest('Topic not specified', 'topic_required');
  }
  const topic = validate(topicPatternSchema, rawTopic);
  await ntfy.deleteAccess(username, topic);

  audit.log({
    adminId: null,
    adminUsername: integrationName(req),
    action: 'access.delete',
    targetUser: username,
    details: { integration: true, topic },
  });

  res.json({ ok: true });
});

module.exports = router;
