'use strict';

const config = require('../config');
const ntfy = require('../ntfy/service');
const { AppError } = require('../errors');

/**
 * Ensures the user has not reached the configured token limit.
 * @param {string} username
 * @returns {Promise<number>} the current number of tokens
 */
async function assertTokenLimit(username) {
  const tokens = await ntfy.listTokens(username);
  if (tokens.length >= config.tokens.maxPerUser) {
    throw new AppError(`Token limit reached (maximum ${config.tokens.maxPerUser} per user)`, {
      status: 409,
      code: 'token_limit_reached',
    });
  }
  return tokens.length;
}

module.exports = { assertTokenLimit };
