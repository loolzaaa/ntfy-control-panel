'use strict';

const { runNtfy } = require('./runner');
const { parseUserList, parseTokenList, parseTokenAdd, parseNtfyDate } = require('./parsers');
const { notFound, AppError } = require('../errors');
const { generatePassword } = require('../utils/password');

async function listUsers() {
  const { stdout } = await runNtfy(['user', 'list']);
  return parseUserList(stdout);
}

async function getUser(username) {
  const { stdout } = await runNtfy(['access', username]);
  const users = parseUserList(stdout);
  const user = users.find((item) => item.name === username) || users[0];
  if (!user) {
    throw notFound(`User "${username}" not found`);
  }
  return user;
}

/**
 * Creates an ntfy user. When no password is supplied, one is generated.
 * The password is returned once so the caller can hand it to the user.
 * @param {{username: string, role?: string, password?: string}} input
 * @returns {Promise<{username: string, role: string, password: string}>}
 */
/**
 * Returns true when an ntfy user exists. Tolerates both the CLI-level
 * "user_not_found" and the service-level "not_found" error codes.
 * @param {string} username
 * @returns {Promise<boolean>}
 */
async function userExists(username) {
  try {
    await getUser(username);
    return true;
  } catch (error) {
    if (error.code === 'user_not_found' || error.code === 'not_found') {
      return false;
    }
    throw error;
  }
}

async function createUser(input) {
  const { username, role = 'user', password: providedPassword } = input;
  const password = providedPassword || generatePassword();

  await runNtfy(['user', 'add', `--role=${role}`, username], { password });

  return { username, role, password };
}

async function deleteUser(username) {
  await runNtfy(['user', 'del', username]);
}

/**
 * Changes an ntfy user's password. The new password is passed via NTFY_PASSWORD.
 * @param {string} username
 * @param {string} password
 */
async function changePassword(username, password) {
  await runNtfy(['user', 'change-pass', username], { password });
}

/**
 * Generates and applies a new password for an ntfy user.
 * @param {string} username
 * @returns {Promise<string>} the generated password
 */
async function resetPassword(username) {
  const password = generatePassword();
  await changePassword(username, password);
  return password;
}

async function listTokens(username) {
  const { stdout } = await runNtfy(['token', 'list', username]);
  const tokens = parseTokenList(stdout).filter((token) => !username || token.username === username);
  return tokens.sort((a, b) => parseNtfyDate(b.lastAccess) - parseNtfyDate(a.lastAccess));
}

/**
 * Creates a token with the specified label.
 * @param {string} username
 * @param {string} [label]
 * @param {string} [expires] duration, e.g. "30d" (optional)
 */
async function addToken(username, label, expires) {
  const args = ['token', 'add'];
  if (expires) {
    args.push(`--expires=${expires}`);
  }
  if (label) {
    args.push(`--label=${label}`);
  }
  args.push(username);

  const { stdout } = await runNtfy(args);
  const parsed = parseTokenAdd(stdout);
  if (!parsed) {
    throw new AppError('Could not determine the created token from the ntfy response', {
      status: 502,
      code: 'ntfy_token_parse_error',
    });
  }
  return {
    username,
    value: parsed.token,
    label: label || '',
    expires: parsed.expires,
    neverExpires: /^never expires$/i.test(parsed.expires),
  };
}

async function deleteToken(username, token) {
  await runNtfy(['token', 'del', username, token]);
}

async function deleteAllTokens(username) {
  const tokens = await listTokens(username);
  for (const token of tokens) {
    if (token.provisioned) {
      continue;
    }
    await deleteToken(username, token.value);
  }
  return tokens.length;
}

async function setAccess(username, topic, permission) {
  await runNtfy(['access', username, topic, permission]);
}

async function deleteAccess(username, topic) {
  await runNtfy(['access', '--reset', username, topic]);
}

async function resetAccess(username) {
  await runNtfy(['access', '--reset', username]);
}

module.exports = {
  generatePassword,
  listUsers,
  getUser,
  userExists,
  createUser,
  deleteUser,
  changePassword,
  resetPassword,
  listTokens,
  addToken,
  deleteToken,
  deleteAllTokens,
  setAccess,
  deleteAccess,
  resetAccess,
};
