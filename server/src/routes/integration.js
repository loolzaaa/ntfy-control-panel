'use strict';

const express = require('express');
const ntfy = require('../ntfy/service');
const audit = require('../services/audit');
const { validate, provisionUserSchema, accessSchema, topicPatternSchema } = require('../utils/validate');
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

  for (const acl of data.acls) {
    await ntfy.setAccess(data.username, acl.topic, acl.permission);
    audit.log({
      adminId: null,
      adminUsername: integrationName(req),
      action: 'access.set',
      targetUser: data.username,
      details: { integration: true, topic: acl.topic, permission: acl.permission },
    });
  }

  res.status(201).json({
    user: { name: result.username, role: result.role },
    password: result.password,
    acls: data.acls,
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
