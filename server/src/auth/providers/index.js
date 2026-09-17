'use strict';

const config = require('../../config');
const { createLocalProvider } = require('./local');
const { createLdapProvider } = require('./ldap');

/**
 * @typedef {Object} Credentials
 * @property {string} username
 * @property {string} password
 */

/**
 * @typedef {Object} Identity
 * @property {string} username
 * @property {'admin'|'user'} role
 * @property {'local'|'ldap'} source
 * @property {string} [displayName]
 * @property {string} [email]
 * @property {boolean} provisionNtfyUser
 */

/**
 * @typedef {Object} IdentityProvider
 * @property {string} name
 * @property {(credentials: Credentials) => Promise<Identity|null>} authenticate
 */

/**
 * Builds the list of active identity providers in configuration order.
 * @param {{Client?: Function}} [deps]
 * @returns {IdentityProvider[]}
 */
function createProviders(deps = {}) {
  const providers = [];

  for (const name of config.auth.providers) {
    if (name === 'local') {
      providers.push(createLocalProvider());
      continue;
    }
    if (name === 'ldap') {
      const ldap = config.auth.ldap;
      if (!ldap.url || !ldap.bindDn || !ldap.searchBase) {
        console.error(
          '[auth] LDAP provider is enabled but LDAP_URL, LDAP_BIND_DN and LDAP_SEARCH_BASE ' +
            'must be set; skipping LDAP.'
        );
        continue;
      }
      providers.push(createLdapProvider(ldap, deps));
    }
  }

  return providers;
}

module.exports = { createProviders };
