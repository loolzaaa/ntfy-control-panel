'use strict';

const admins = require('../services/admins');
const { unauthorized } = require('../errors');

/**
 * Checks for an active administrator session.
 * On success, puts the administrator object into req.admin.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    const admin = admins.findById(req.session.adminId);
    if (admin) {
      req.admin = admin;
      return next();
    }
    req.session.destroy(() => {});
  }
  return next(unauthorized());
}

module.exports = { requireAuth };
