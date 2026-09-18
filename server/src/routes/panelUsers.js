'use strict';

const express = require('express');
const config = require('../config');
const users = require('../services/users');
const audit = require('../services/audit');
const { generatePassword } = require('../utils/password');
const { validate, createAdminSchema, panelPasswordSchema } = require('../utils/validate');
const { AppError, notFound, badRequest } = require('../errors');

const router = express.Router();

function isPrimaryUser(user) {
  return Boolean(config.bootstrap.username) && user.username === config.bootstrap.username;
}

function serializeAdmin(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    source: user.source,
    isPrimary: isPrimaryUser(user),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function requireManageable(user) {
  if (user.source !== 'local' || user.role !== 'admin') {
    throw badRequest('Only local panel administrators can be managed here', 'panel_user_not_manageable');
  }
}

router.get('/', (req, res) => {
  res.json({ admins: users.listLocalUsers().map(serializeAdmin) });
});

router.post('/', (req, res) => {
  const data = validate(createAdminSchema, req.body || {});

  if (users.findByUsername(data.username)) {
    throw new AppError('A panel account with this username already exists', {
      status: 409,
      code: 'panel_user_exists',
    });
  }

  const custom = typeof data.password === 'string' && data.password.length > 0;
  const password = custom ? data.password : generatePassword();
  users.createLocalUser(data.username, password, 'admin');

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'panel_user.create',
    targetUser: data.username,
    details: { passwordGenerated: !custom },
  });

  const created = users.findByUsername(data.username);
  const body = { admin: serializeAdmin(created) };
  if (!custom) {
    body.password = password;
  }
  res.status(201).json(body);
});

router.delete('/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const user = users.findById(id);
  if (!user) {
    throw notFound('Panel administrator not found');
  }
  requireManageable(user);

  if (isPrimaryUser(user)) {
    throw new AppError('The primary administrator cannot be deleted', {
      status: 400,
      code: 'primary_admin_protected',
    });
  }

  users.deleteById(id);

  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'panel_user.delete',
    targetUser: user.username,
  });

  res.json({ ok: true });
});

router.put('/:id/password', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const user = users.findById(id);
  if (!user) {
    throw notFound('Panel administrator not found');
  }
  requireManageable(user);

  if (isPrimaryUser(user)) {
    throw new AppError('The primary administrator password is managed by configuration', {
      status: 400,
      code: 'primary_admin_protected',
    });
  }

  const data = validate(panelPasswordSchema, req.body || {});
  const custom = typeof data.password === 'string' && data.password.length > 0;

  if (custom) {
    users.changePassword(id, data.password);
    audit.log({
      adminId: req.user.id,
      adminUsername: req.user.username,
      action: 'panel_user.password_change',
      targetUser: user.username,
      details: { generated: false },
    });
    res.json({ ok: true });
    return;
  }

  const password = generatePassword();
  users.changePassword(id, password);
  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'panel_user.password_change',
    targetUser: user.username,
    details: { generated: true },
  });
  res.json({ password });
});

module.exports = router;
