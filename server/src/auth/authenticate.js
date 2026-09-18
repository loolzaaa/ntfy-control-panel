'use strict';

const audit = require('../services/audit');
const users = require('../services/users');
const ntfy = require('../ntfy/service');
const { createProviders } = require('./providers');

let providers = null;

function getProviders() {
  if (!providers) {
    providers = createProviders();
  }
  return providers;
}

/** Resets the cached provider list (used by tests). */
function resetProviders() {
  providers = null;
}

/**
 * Ensures an ntfy user exists, creating it with a random password and no tokens.
 * @param {string} username
 * @returns {Promise<{created: boolean}>}
 */
async function ensureNtfyUser(username) {
  try {
    await ntfy.getUser(username);
    return { created: false };
  } catch (error) {
    if (error.code !== 'user_not_found') {
      throw error;
    }
  }

  try {
    await ntfy.createUser({ username, role: 'user' });
    return { created: true };
  } catch (error) {
    if (error.code === 'user_exists') {
      return { created: false };
    }
    throw error;
  }
}

function recordFailedLogin(username, ip, details = {}) {
  audit.log({
    adminId: null,
    adminUsername: username,
    action: 'auth.login_failed',
    details: { ip, ...details },
  });
}

/**
 * Authenticates credentials by iterating over the active providers in order.
 * The first provider that returns an identity wins.
 *
 * @param {{username: string, password: string, ip?: string}} credentials
 * @param {{providers?: import('./providers').IdentityProvider[]}} [options]
 * @returns {Promise<{user: object, ntfyProvision: object|null}|null>}
 */
async function authenticate({ username, password, ip }, options = {}) {
  const providerList = options.providers || getProviders();

  let identity = null;
  let matchedProvider = null;

  for (const provider of providerList) {
    try {
      const result = await provider.authenticate({ username, password });
      if (result) {
        identity = result;
        matchedProvider = provider;
        break;
      }
    } catch (error) {
      console.warn(`[auth] Provider "${provider.name}" failed for user "${username}": ${error.message}`);
      // Provider infrastructure errors must not block the remaining providers.
    }
  }

  if (!identity) {
    recordFailedLogin(username, ip);
    return null;
  }

  let user;
  if (identity.source === 'ldap') {
    const existing = users.findByUsername(identity.username);
    if (existing && existing.source === 'local') {
      console.warn(
        `[auth] Refusing LDAP login for "${identity.username}": a local account with this name exists`
      );
      recordFailedLogin(username, ip, { reason: 'local_username_conflict' });
      return null;
    }
    user = users.upsertLdapUser({ username: identity.username, role: identity.role });
  } else {
    user = users.findByUsername(identity.username);
    if (!user) {
      recordFailedLogin(username, ip, { reason: 'user_not_found' });
      return null;
    }
  }

  users.touchLastLogin(user.id);

  let ntfyProvision = null;
  if (identity.provisionNtfyUser) {
    try {
      ntfyProvision = await ensureNtfyUser(user.username);
    } catch (error) {
      ntfyProvision = { created: false, error: error.code || 'error' };
      console.warn(`[auth] Failed to provision ntfy user "${user.username}": ${error.message}`);
    }
  }

  audit.log({
    adminId: user.id,
    adminUsername: user.username,
    action: 'auth.login',
    details: {
      ip,
      source: user.source,
      provider: matchedProvider ? matchedProvider.name : undefined,
      ntfyProvisioned: ntfyProvision ? ntfyProvision.created : undefined,
    },
  });

  return { user, ntfyProvision };
}

module.exports = { authenticate, ensureNtfyUser, getProviders, resetProviders };
