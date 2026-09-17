'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

require('dotenv').config();

const rootDir = path.resolve(__dirname, '..', '..');

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
  trustProxy: toBool(process.env.TRUST_PROXY, false),
  panelDb: process.env.PANEL_DB
    ? path.resolve(process.env.PANEL_DB)
    : path.join(rootDir, 'data', 'panel.db'),
  session: {
    secret: sessionSecret,
    secretWasGenerated: (process.env.SESSION_SECRET || '').trim().length < 16,
    ttlHours: toInt(process.env.SESSION_TTL_HOURS, 8),
    cookieName: process.env.COOKIE_NAME || 'ntfy_panel_sid',
    cookieSecure: toBool(process.env.COOKIE_SECURE, env === 'production'),
  },
  ntfy: {
    bin: process.env.NTFY_BIN || 'ntfy',
    configFile: process.env.NTFY_CONFIG_FILE || '',
    authFile: process.env.NTFY_AUTH_FILE || '',
    baseUrl: process.env.NTFY_BASE_URL || '',
    timeoutMs: toInt(process.env.NTFY_TIMEOUT_MS, 15000),
    maxBufferBytes: toInt(process.env.NTFY_MAX_BUFFER_BYTES, 10 * 1024 * 1024),
  },
  bootstrap: {
    username: (process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin').trim(),
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
  },
  login: {
    maxAttempts: toInt(process.env.LOGIN_MAX_ATTEMPTS, 10),
    windowMinutes: toInt(process.env.LOGIN_WINDOW_MINUTES, 15),
  },
  clientDistDir: path.join(rootDir, 'client', 'dist'),
};

module.exports = config;
