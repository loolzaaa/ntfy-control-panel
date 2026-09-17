'use strict';

const crypto = require('node:crypto');
const { forbidden } = require('../errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Returns (creating if necessary) the CSRF token for the current session.
 */
function ensureCsrfToken(req) {
  if (!req.session) {
    throw new Error('Session is unavailable for CSRF token generation');
  }
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * CSRF protection: mutating methods require an X-CSRF-Token header
 * matching the session token.
 */
function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  const token = req.get('x-csrf-token') || (req.body && req.body._csrf);
  if (!token || !req.session || !req.session.csrfToken || !timingSafeEqual(token, req.session.csrfToken)) {
    return next(forbidden('Invalid CSRF token'));
  }
  return next();
}

module.exports = { ensureCsrfToken, csrfProtection };
