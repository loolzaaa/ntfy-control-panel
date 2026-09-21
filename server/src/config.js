'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const rootDir = path.resolve(__dirname, '..', '..');

const KNOWN_PROVIDERS = ['local', 'ldap'];

function toBool(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function toInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseCookieSecure(value) {
  const normalized = String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return 'auto';
}

function normalizeBasePath(value) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw || raw === '/') {
    return '';
  }
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
}

function parseProviderList(value) {
  if (!value || !String(value).trim()) {
    return ['local'];
  }
  const seen = new Set();
  const providers = [];
  for (const raw of String(value).split(',')) {
    const name = raw.trim().toLowerCase();
    if (!name || seen.has(name)) {
      continue;
    }
    if (!KNOWN_PROVIDERS.includes(name)) {
      console.warn(`[config] Unknown auth provider "${name}" in AUTH_PROVIDERS; ignoring.`);
      continue;
    }
    seen.add(name);
    providers.push(name);
  }
  return providers.length ? providers : ['local'];
}

function parseApiKeys(value) {
  if (!value || !String(value).trim()) {
    return [];
  }
  const keys = [];
  for (const raw of String(value).split(',')) {
    const item = raw.trim();
    if (!item) {
      continue;
    }
    const separator = item.indexOf(':');
    const name = separator === -1 ? 'default' : item.slice(0, separator).trim();
    const key = (separator === -1 ? item : item.slice(separator + 1)).trim();
    if (name && key) {
      keys.push({ name, key });
    }
  }
  return keys;
}

function resolveSessionSecret() {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (secret.length >= 16) {
    return secret;
  }
  return crypto.randomBytes(32).toString('hex');
}

const env = process.env.NODE_ENV || 'development';
const sessionSecret = resolveSessionSecret();

const config = {
  rootDir,
  env,
  isProduction: env === 'production',
  host: process.env.HOST || '0.0.0.0',
  port: toInt(process.env.PORT, 8080),
  basePath: normalizeBasePath(process.env.BASE_PATH),
  trustProxy: toBool(process.env.TRUST_PROXY, false),
  panelDb: process.env.PANEL_DB
    ? path.resolve(process.env.PANEL_DB)
    : path.join(rootDir, 'data', 'panel.db'),
  session: {
    secret: sessionSecret,
    secretWasGenerated: (process.env.SESSION_SECRET || '').trim().length < 16,
    ttlHours: toInt(process.env.SESSION_TTL_HOURS, 8),
    cookieName: process.env.COOKIE_NAME || 'ntfy_panel_sid',
    cookieSecure: parseCookieSecure(process.env.COOKIE_SECURE),
  },
  ntfy: {
    bin: process.env.NTFY_BIN || 'ntfy',
    timeoutMs: toInt(process.env.NTFY_TIMEOUT_MS, 15000),
    maxBufferBytes: toInt(process.env.NTFY_MAX_BUFFER_BYTES, 10 * 1024 * 1024),
  },
  auth: {
    providers: parseProviderList(process.env.AUTH_PROVIDERS),
    ldap: {
      url: process.env.LDAP_URL || '',
      bindDn: process.env.LDAP_BIND_DN || '',
      bindPassword: process.env.LDAP_BIND_PASSWORD || '',
      searchBase: process.env.LDAP_SEARCH_BASE || '',
      searchFilter: process.env.LDAP_SEARCH_FILTER || '(uid={{username}})',
      attrUsername: process.env.LDAP_ATTR_USERNAME || 'uid',
      attrDisplayName: process.env.LDAP_ATTR_DISPLAY_NAME || 'cn',
      attrEmail: process.env.LDAP_ATTR_EMAIL || 'mail',
      startTls: toBool(process.env.LDAP_STARTTLS, false),
      tlsRejectUnauthorized: toBool(process.env.LDAP_TLS_REJECT_UNAUTHORIZED, true),
      connectTimeoutMs: toInt(process.env.LDAP_CONNECT_TIMEOUT_MS, 5000),
      provisionNtfyUser: toBool(process.env.LDAP_PROVISION_NTFY_USER, false),
      role: process.env.LDAP_ROLE || 'user',
    },
  },
  tokens: {
    maxPerUser: toInt(process.env.MAX_TOKENS_PER_USER, 4),
  },
  integration: {
    apiKeys: parseApiKeys(process.env.INTEGRATION_API_KEYS),
  },
  bootstrap: {
    username: (process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim(),
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  },
  login: {
    maxAttempts: toInt(process.env.LOGIN_MAX_ATTEMPTS, 10),
    windowMinutes: toInt(process.env.LOGIN_WINDOW_MINUTES, 15),
  },
  clientDistDir: path.join(rootDir, 'client', 'dist'),
};

module.exports = config;
