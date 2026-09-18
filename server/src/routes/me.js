'use strict';

const express = require('express');
const config = require('../config');
const ntfy = require('../ntfy/service');
const audit = require('../services/audit');
const { assertTokenLimit } = require('../services/tokenPolicy');
const { validate, addTokenSchema, meNtfyPasswordSchema } = require('../utils/validate');
const { maskToken } = require('../utils/mask');
const { AppError } = require('../errors');

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

router.put('/password', async (req, res) => {
  if (req.user.source !== 'ldap') {
    throw new AppError('The ntfy password can only be changed for LDAP accounts', {
      status: 400,
      code: 'ntfy_password_not_applicable',
    });
  }

  try {
    await ntfy.getUser(req.user.username);
  } catch (error) {
    if (error.code === 'user_not_found') {
      throw new AppError('No ntfy account is linked to this panel account', {
        status: 400,
        code: 'ntfy_user_not_found',
      });
    }
    throw error;
  }

  const data = validate(meNtfyPasswordSchema, req.body || {});
  const generated = data.generate || !data.newPassword;

  if (generated) {
    const password = await ntfy.resetPassword(req.user.username);
    audit.log({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'user.password_change',
      targetUser: req.user.username,
      details: { self: true, generated: true },
    });
    res.json({ password });
    return;
  }

  await ntfy.changePassword(req.user.username, data.newPassword);
  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'user.password_change',
    targetUser: req.user.username,
    details: { self: true, generated: false },
  });

  res.json({ ok: true });
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
