'use strict';

const { Client } = require('ldapts');
const { AppError } = require('../../errors');

const INVALID_CREDENTIALS_CODE = 49;

/**
 * Escapes a value for use inside an LDAP search filter (RFC 4515).
 * @param {string} value
 * @returns {string}
 */
function escapeFilterValue(value) {
  return String(value).replace(/[\\*()\u0000]/g, (char) => {
    switch (char) {
      case '\\':
        return '\\5c';
      case '*':
        return '\\2a';
      case '(':
        return '\\28';
      case ')':
        return '\\29';
      default:
        return '\\00';
    }
  });
}

function isInvalidCredentials(error) {
  return Boolean(error) && (error.name === 'InvalidCredentialsError' || error.code === INVALID_CREDENTIALS_CODE);
}

function firstAttribute(entry, name) {
  if (!name) {
    return undefined;
  }
  const value = entry[name];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length ? String(value[0]) : undefined;
  }
  return String(value);
}

/**
 * IdentityProvider backed by an LDAP directory.
 *
 * Flow: bind with the service account, search for the user, then bind again
 * with the user's own DN and password to verify the credentials.
 *
 * @param {object} settings
 * @param {{Client?: Function}} [deps] injectable LDAP client (for tests)
 * @returns {import('./index').IdentityProvider}
 */
function createLdapProvider(settings, deps = {}) {
  const ClientCtor = deps.Client || Client;
  const tlsOptions = { rejectUnauthorized: settings.tlsRejectUnauthorized };

  function buildClient() {
    return new ClientCtor({
      url: settings.url,
      timeout: settings.connectTimeoutMs,
      connectTimeout: settings.connectTimeoutMs,
      tlsOptions,
    });
  }

  async function verifyUserBind(dn, password) {
    const client = buildClient();
    try {
      if (settings.startTls) {
        await client.startTLS(tlsOptions);
      }
      await client.bind(dn, password);
    } catch (error) {
      if (isInvalidCredentials(error)) {
        return false;
      }
      throw error;
    } finally {
      await client.unbind().catch(() => {});
    }
    return true;
  }

  return {
    name: 'ldap',
    provisionNtfyUser: settings.provisionNtfyUser,
    async authenticate({ username, password }) {
      // An empty password would result in an unauthenticated bind; reject it.
      if (!password) {
        return null;
      }

      const client = buildClient();
      let entry;
      try {
        if (settings.startTls) {
          await client.startTLS(tlsOptions);
        }
        try {
          await client.bind(settings.bindDn, settings.bindPassword);
        } catch (error) {
          if (isInvalidCredentials(error)) {
            throw new AppError('LDAP service account bind failed', {
              status: 500,
              code: 'ldap_bind_failed',
            });
          }
          throw error;
        }

        const filter = settings.searchFilter.replace(/\{\{username\}\}/g, escapeFilterValue(username));
        const result = await client.search(settings.searchBase, {
          scope: 'sub',
          filter,
          attributes: [settings.attrUsername, settings.attrDisplayName, settings.attrEmail].filter(Boolean),
        });
        entry = (result.searchEntries || [])[0];
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError(`LDAP error: ${error.message}`, { status: 502, code: 'ldap_error' });
      } finally {
        await client.unbind().catch(() => {});
      }

      if (!entry || !entry.dn) {
        return null;
      }

      const verified = await verifyUserBind(entry.dn, password);
      if (!verified) {
        return null;
      }

      return {
        username: firstAttribute(entry, settings.attrUsername) || username,
        role: settings.role,
        source: 'ldap',
        displayName: firstAttribute(entry, settings.attrDisplayName),
        email: firstAttribute(entry, settings.attrEmail),
        provisionNtfyUser: settings.provisionNtfyUser,
      };
    },
  };
}

module.exports = { createLdapProvider, escapeFilterValue };
