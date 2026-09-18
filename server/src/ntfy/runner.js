'use strict';

const { execFile } = require('node:child_process');
const config = require('../config');
const { NtfyError, AppError } = require('../errors');

/**
 * All ntfy CLI calls are serialized: the CLI writes directly to the ntfy
 * SQLite database, and concurrent runs can cause lock contention and races.
 */
let queue = Promise.resolve();

function serialize(task) {
  const result = queue.then(task, task);
  queue = result.catch(() => {});
  return result;
}

function buildEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (config.ntfy.configFile) {
    env.NTFY_CONFIG_FILE = config.ntfy.configFile;
  }
  if (config.ntfy.authFile) {
    env.NTFY_AUTH_FILE = config.ntfy.authFile;
  }
  if (config.ntfy.baseUrl) {
    env.NTFY_BASE_URL = config.ntfy.baseUrl;
  }
  return env;
}

function translateCliError(stderr) {
  const text = (stderr || '').trim();
  const lower = text.toLowerCase();

  if (lower.includes('already exists')) {
    return new AppError('User already exists', { status: 409, code: 'user_exists' });
  }
  if (lower.includes('does not exist') && lower.includes('user')) {
    return new AppError('User not found', { status: 404, code: 'user_not_found' });
  }
  if (lower.includes('provisioned user')) {
    return new AppError('User is managed by the ntfy config and cannot be changed', {
      status: 409,
      code: 'provisioned_user',
    });
  }
  if (lower.includes('provisioned token')) {
    return new AppError('Token is managed by the ntfy config and cannot be changed', {
      status: 409,
      code: 'provisioned_token',
    });
  }
  if (lower.includes('is an admin user, access control entries have no effect')) {
    return new AppError('User is an ntfy administrator; topic permissions do not apply', {
      status: 400,
      code: 'admin_has_no_acl',
    });
  }
  if (lower.includes('username not allowed') || lower.includes('invalid argument')) {
    return new AppError('Invalid argument value', { status: 400, code: 'invalid_argument' });
  }
  if (lower.includes('auth-file does not exist')) {
    return new AppError(
      'The ntfy database file (auth-file) was not found. Start the ntfy server at least once.',
      { status: 500, code: 'ntfy_auth_file_missing' }
    );
  }
  if (lower.includes('not set; auth is unconfigured')) {
    return new AppError(
      'auth-file or database-url is not set for ntfy. Check the panel settings.',
      { status: 500, code: 'ntfy_auth_unconfigured' }
    );
  }
  if (lower.includes('permission must be one of')) {
    return new AppError('Invalid access rights value', { status: 400, code: 'invalid_permission' });
  }
  if (lower.includes('permission denied') && (lower.includes('server.yml') || lower.includes('config'))) {
    return new AppError(
      'The panel cannot read the ntfy configuration file (server.yml). Grant the panel user read access to it.',
      { status: 500, code: 'ntfy_config_permission' }
    );
  }

  return new NtfyError(text || 'ntfy command execution error', {
    status: 502,
    code: 'ntfy_error',
    stderr: text,
  });
}

/**
 * Runs an ntfy CLI command.
 * @param {string[]} args arguments without the binary name, e.g. ['user', 'list']
 * @param {{password?: string, timeoutMs?: number, env?: object}} [options]
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runNtfy(args, options = {}) {
  return serialize(
    () =>
      new Promise((resolve, reject) => {
        const extraEnv = { ...(options.env || {}) };
        if (options.password !== undefined) {
          extraEnv.NTFY_PASSWORD = options.password;
        }
        const env = buildEnv(extraEnv);

        execFile(
          config.ntfy.bin,
          args,
          {
            env,
            timeout: options.timeoutMs || config.ntfy.timeoutMs,
            windowsHide: true,
            maxBuffer: config.ntfy.maxBufferBytes,
          },
          (error, stdout, stderr) => {
            if (!error) {
              resolve({ stdout: stdout || '', stderr: stderr || '' });
              return;
            }
            if (error.code === 'ENOENT') {
              reject(
                new AppError(
                  `ntfy executable not found ("${config.ntfy.bin}"). Check the NTFY_BIN variable.`,
                  { status: 500, code: 'ntfy_bin_not_found' }
                )
              );
              return;
            }
            if (error.killed || error.signal) {
              reject(
                new NtfyError('ntfy command execution timed out', {
                  status: 504,
                  code: 'ntfy_timeout',
                  stderr: stderr || '',
                })
              );
              return;
            }
            reject(translateCliError(stderr || error.message));
          }
        );
      })
  );
}

module.exports = { runNtfy, translateCliError };
