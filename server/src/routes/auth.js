'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const users = require('../services/users');
const audit = require('../services/audit');
const { authenticate } = require('../auth/authenticate');
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

function serializeUser(user) {
  return { username: user.username, role: user.role, source: user.source };
}

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = validate(loginSchema, req.body);
  const result = await authenticate({ username, password, ip: req.ip });

  if (!result) {
    throw new AppError('Invalid username or password', {
      status: 401,
      code: 'invalid_credentials',
    });
  }

  const { user } = result;

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  const csrfToken = ensureCsrfToken(req);
  await saveSession(req);

  res.json({ user: serializeUser(user), csrfToken });
});

router.post('/logout', requireAuth, csrfProtection, async (req, res) => {
  audit.log({
    adminId: req.user.id,
    adminUsername: req.user.username,
    action: 'auth.logout',
  });
  await destroySession(req);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: serializeUser(req.user),
    csrfToken: ensureCsrfToken(req),
  });
});

router.post('/change-password', requireAuth, csrfProtection, async (req, res) => {
  const { currentPassword, newPassword } = validate(changePasswordSchema, req.body);
  const user = users.findByUsername(req.user.username);

  if (!user || user.source !== 'local') {
    throw new AppError('The password is managed externally and cannot be changed here', {
      status: 400,
      code: 'password_managed_externally',
    });
  }

  if (!users.verifyPassword(user, currentPassword)) {
    throw new AppError('The current password is incorrect', {
      status: 400,
      code: 'invalid_password',
    });
  }

  users.changePassword(user.id, newPassword);
  audit.log({
    adminId: user.id,
    adminUsername: user.username,
    action: 'auth.change_password',
  });
  res.json({ ok: true });
});

module.exports = router;
