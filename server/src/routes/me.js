'use strict';

const express = require('express');
const config = require('../config');
const ntfy = require('../ntfy/service');
const audit = require('../services/audit');
const { assertTokenLimit } = require('../services/tokenPolicy');
const { validate, addTokenSchema } = require('../utils/validate');
const { maskToken } = require('../utils/mask');

const router = express.Router();

router.get('/tokens', async (req, res) => {
  let tokens = [];
  let ntfyUserExists = true;

  try {
    tokens = await ntfy.listTokens(req.user.username);
  } catch (error) {
    if (error.code === 'user_not_found') {
      ntfyUserExists = false;
    } else {
      throw error;
    }
  }

  res.json({ tokens, ntfyUserExists, maxTokens: config.tokens.maxPerUser });
});

router.get('/access', async (req, res) => {
  let grants = [];
  let defaultAccess = null;
  let ntfyUserExists = true;

  try {
    const user = await ntfy.getUser(req.user.username);
    grants = user.grants || [];
    defaultAccess = user.defaultAccess || null;
  } catch (error) {
    if (error.code === 'user_not_found') {
      ntfyUserExists = false;
    } else {
      throw error;
    }
  }

  res.json({ grants, defaultAccess, ntfyUserExists });
});

router.post('/tokens', async (req, res) => {
  const data = validate(addTokenSchema, req.body || {});
  await assertTokenLimit(req.user.username);

  const token = await ntfy.addToken(req.user.username, data.label || undefined, data.expires || undefined);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'token.create',
    targetUser: req.user.username,
    details: { label: token.label || null, token: maskToken(token.value), self: true },
  });

  res.status(201).json({ token });
});

router.delete('/tokens/:token', async (req, res) => {
  const { token } = req.params;

  await ntfy.deleteToken(req.user.username, token);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'token.delete',
    targetUser: req.user.username,
    details: { token: maskToken(token), self: true },
  });

  res.json({ ok: true });
});

module.exports = router;
