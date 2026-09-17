'use strict';

const users = require('../../services/users');

/**
 * IdentityProvider backed by the panel's local user database (bcrypt).
 * @returns {import('./index').IdentityProvider}
 */
function createLocalProvider() {
  return {
    name: 'local',
    async authenticate({ username, password }) {
      const user = users.findByUsername(username);
      if (!user || user.source !== 'local') {
        return null;
      }
      if (!users.verifyPassword(user, password)) {
        return null;
      }
      return {
        username: user.username,
        role: user.role,
        source: 'local',
        provisionNtfyUser: false,
      };
    },
  };
}

module.exports = { createLocalProvider };
