'use strict';

const config = require('./config');
const users = require('./services/users');

/**
 * Ensures the primary panel administrator defined by configuration exists.
 * The primary administrator ("root") is created from BOOTSTRAP_ADMIN_* and its
 * password is always synchronized with the configuration; it cannot be changed
 * through the panel.
 *
 * @returns {{action: 'created'|'password-synced'|'ok', username: string}}
 */
function ensureBootstrapAdmin() {
  const { username, password } = config.bootstrap;

  if (!username || !password) {
    throw new Error(
      'BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD must be set: ' +
        'the primary panel administrator is defined by configuration.'
    );
  }

  const existing = users.findByUsername(username);
  if (existing) {
    if (existing.source !== 'local') {
      throw new Error(
        `Cannot use "${username}" as the primary administrator: the name is already taken by a non-local account.`
      );
    }
    if (existing.role !== 'admin') {
      users.setRole(existing.id, 'admin');
    }
    if (!users.verifyPassword(existing, password)) {
      users.changePassword(existing.id, password);
      return { action: 'password-synced', username };
    }
    return { action: 'ok', username };
  }

  users.createLocalUser(username, password, 'admin');
  return { action: 'created', username };
}

module.exports = { ensureBootstrapAdmin };
