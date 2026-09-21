'use strict';

const crypto = require('node:crypto');
const config = require('../config');
const { unauthorized } = require('../errors');

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authenticates a machine client via an `Authorization: Bearer <key>` header.
 * Keys are configured in INTEGRATION_API_KEYS. On success sets
 * req.integration = { name }. Sessions and CSRF are not used here.
 */
function requireApiKey(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const provided = match ? match[1].trim() : '';

  if (provided) {
    for (const { name, key } of config.integration.apiKeys) {
      if (timingSafeEqual(provided, key)) {
        req.integration = { name };
        return next();
      }
    }
  }

  return next(unauthorized('Invalid API key'));
}

module.exports = { requireApiKey };
