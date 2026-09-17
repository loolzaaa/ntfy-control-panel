'use strict';

const users = require('../services/users');
const { unauthorized, forbidden } = require('../errors');

/**
 * Checks for an active session and loads the panel user into req.user.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    const user = users.findById(req.session.userId);
    if (user) {
      req.user = user;
      return next();
    }
    req.session.destroy(() => {});
  }
  return next(unauthorized());
}

/**
 * Allows access only to panel administrators. Must run after requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(forbidden('Administrator access required'));
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
