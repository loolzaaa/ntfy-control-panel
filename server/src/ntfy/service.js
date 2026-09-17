'use strict';

const crypto = require('node:crypto');
const { runNtfy } = require('./runner');
const { parseUserList, parseTokenList, parseTokenAdd } = require('./parsers');
const { notFound, AppError } = require('../errors');

/**
 * Generates a random password for a new ntfy user.
 * The password is not shown to the administrator and is used only to create the record.
 */
function generatePassword() {
  return crypto.randomBytes(24).toString('base64url');
}

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
 * Creates an ntfy user. The password is generated automatically.
 * @param {{username: string, role?: string, createToken?: boolean, tokenLabel?: string}} input
 */
async function createUser(input) {
  const { username, role = 'user', createToken = false, tokenLabel } = input;
  const password = generatePassword();

  await runNtfy(['user', 'add', `--role=${role}`, username], { password });

  let token = null;
  if (createToken) {
    const label = tokenLabel && tokenLabel.trim() ? tokenLabel.trim() : username;
    token = await addToken(username, label);
  }

  return { username, role, token };
}

async function deleteUser(username) {
  await runNtfy(['user', 'del', username]);
}

async function listTokens(username) {
  const { stdout } = await runNtfy(['token', 'list', username]);
  return parseTokenList(stdout).filter((token) => !username || token.username === username);
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
  createUser,
  deleteUser,
  listTokens,
  addToken,
  deleteToken,
  deleteAllTokens,
  setAccess,
  deleteAccess,
  resetAccess,
};
