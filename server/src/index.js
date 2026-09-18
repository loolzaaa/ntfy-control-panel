'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const config = require('./config');
const { initDb, closeDb } = require('./db');
const users = require('./services/users');
const { createApp } = require('./app');

function ensureBootstrapAdmin() {
  if (users.countUsers() > 0) {
    return;
  }

  const { username, password } = config.bootstrap;
  const generated = !password;
  const finalPassword = password || crypto.randomBytes(12).toString('base64url');

  users.createLocalUser(username, finalPassword, 'admin');

  if (generated) {
    console.log('='.repeat(64));
    console.log('Panel administrator account created:');
    console.log(`  Username:  ${username}`);
    console.log(`  Password: ${finalPassword}`);
    console.log('The password is shown once. Change it after the first login.');
    console.log('='.repeat(64));
  } else {
    console.log(`Administrator account "${username}" created from environment variables.`);
  }
}

function warnIfNtfyConfigUnavailable() {
  const configPath = '/etc/ntfy/server.yml';
  try {
    fs.accessSync(configPath, fs.constants.R_OK);
  } catch {
    if (fs.existsSync(configPath)) {
      console.warn(
        `WARNING: the panel cannot read the ntfy config file (${configPath}) — ntfy CLI ` +
          'commands will fail. Add the panel user to the ntfy group or grant read access.'
      );
    } else {
      console.warn(
        `WARNING: the ntfy config file (${configPath}) was not found — ntfy CLI commands ` +
          'may fail to locate the user database.'
      );
    }
  }
}

function start() {
  initDb(config.panelDb);
  ensureBootstrapAdmin();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`ntfy control panel started: http://${config.host}:${config.port}`);
    console.log(`Active authentication providers: ${config.auth.providers.join(', ')}`);

    warnIfNtfyConfigUnavailable();

    if (config.session.secretWasGenerated) {
      console.warn(
        'WARNING: SESSION_SECRET is not set — a temporary key is being used. ' +
          'Sessions will be reset when the panel restarts.'
      );
    }
  });

  const shutdown = (signal) => {
    console.log(`Received signal ${signal}, stopping panel...`);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
