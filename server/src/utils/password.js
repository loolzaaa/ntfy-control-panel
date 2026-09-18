'use strict';

const crypto = require('node:crypto');

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 20;

/**
 * Generates a random, human-readable password.
 * Ambiguous characters (0/O, 1/l/I) are excluded so the password can be typed on a phone.
 * @returns {string}
 */
function generatePassword() {
  let password = '';
  for (let index = 0; index < PASSWORD_LENGTH; index += 1) {
    password += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  }
  return password;
}

module.exports = { generatePassword, PASSWORD_ALPHABET, PASSWORD_LENGTH };
