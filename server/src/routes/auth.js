'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const admins = require('../services/admins');
const audit = require('../services/audit');
const { validate, loginSchema, changePasswordSchema } = require('../utils/validate');
const { ensureCsrfToken, csrfProtection } = require('../middleware/csrf');
const { requireAuth } = require('../middleware/auth');
const { AppError } = require('../errors');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: config.login.windowMinutes * 60 * 1000,
  limit: config.login.maxAttempts,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'too_many_requests',
      message: 'Too many failed login attempts. Try again later.',
    },
  },
});

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = validate(loginSchema, req.body);
  const admin = admins.findByUsername(username);

  if (!admins.verifyPassword(admin, password)) {
    audit.log({
      adminId: admin ? admin.id : null,
      adminUsername: username,
      action: 'auth.login_failed',
      details: { ip: req.ip },
    });
    throw new AppError('Invalid username or password', {
      status: 401,
      code: 'invalid_credentials',
    });
  }

  await regenerateSession(req);
  req.session.adminId = admin.id;
  req.session.username = admin.username;
  const csrfToken = ensureCsrfToken(req);
  await saveSession(req);

  audit.log({
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'auth.login',
    details: { ip: req.ip },
  });

  res.json({ admin: { username: admin.username }, csrfToken });
});

router.post('/logout', requireAuth, csrfProtection, async (req, res) => {
  audit.log({
    adminId: req.admin.id,
    adminUsername: req.admin.username,
    action: 'auth.logout',
  });
  await destroySession(req);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    admin: { username: req.admin.username },
    csrfToken: ensureCsrfToken(req),
  });
});

router.post('/change-password', requireAuth, csrfProtection, async (req, res) => {
  const { currentPassword, newPassword } = validate(changePasswordSchema, req.body);
  const admin = admins.findByUsername(req.admin.username);

  if (!admins.verifyPassword(admin, currentPassword)) {
    throw new AppError('The current password is incorrect', {
      status: 400,
      code: 'invalid_password',
    });
  }

  admins.changePassword(admin.id, newPassword);
  audit.log({
    adminId: admin.id,
    adminUsername: admin.username,
    action: 'auth.change_password',
  });
  res.json({ ok: true });
});

module.exports = router;
