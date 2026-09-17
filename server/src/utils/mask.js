'use strict';

/**
 * Masks a token value for the audit log and logs.
 * @param {string} token
 * @returns {string}
 */
function maskToken(token) {
  if (!token || typeof token !== 'string') {
    return '';
  }
  if (token.length <= 12) {
    return `${token.slice(0, 4)}***`;
  }
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}

module.exports = { maskToken };
