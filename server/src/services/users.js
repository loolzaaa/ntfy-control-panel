'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const BCRYPT_ROUNDS = 12;

const SELECT_COLUMNS =
  'id, username, password_hash AS passwordHash, role, source, ' +
  'created_at AS createdAt, last_login_at AS lastLoginAt';

function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role,
    source: row.source,
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}

function countUsers() {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM users').get();
  return row.count;
}

function findByUsername(username) {
  return mapRow(getDb().prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE username = ?`).get(username));
}

function findById(id) {
  return mapRow(getDb().prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = ?`).get(id));
}

function listUsers() {
  return getDb()
    .prepare(`SELECT ${SELECT_COLUMNS} FROM users ORDER BY username`)
    .all()
    .map(mapRow);
}

/**
 * Creates a panel user.
 * @param {{username: string, passwordHash?: string|null, role?: string, source?: string}} input
 */
function createUser({ username, passwordHash = null, role = 'user', source = 'local' }) {
  const result = getDb()
    .prepare('INSERT INTO users (username, password_hash, role, source) VALUES (?, ?, ?, ?)')
    .run(username, passwordHash, role, source);
  return findById(result.lastInsertRowid);
}

/**
 * Creates a local panel user with a hashed password.
 * @param {string} username
 * @param {string} password
 * @param {string} [role]
 */
function createLocalUser(username, password, role = 'admin') {
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  return createUser({ username, passwordHash, role, source: 'local' });
}

function verifyPassword(user, password) {
  if (!user || !user.passwordHash) {
    return false;
  }
  return bcrypt.compareSync(password, user.passwordHash);
}

function changePassword(userId, password) {
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

function touchLastLogin(userId) {
  getDb().prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
}

/**
 * Inserts or updates an LDAP-backed panel user. Local users are never converted.
 * @param {{username: string, role?: string}} input
 */
function upsertLdapUser({ username, role = 'user' }) {
  const existing = findByUsername(username);
  if (existing) {
    if (existing.source === 'local') {
      return existing;
    }
    getDb().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, existing.id);
    return findById(existing.id);
  }
  return createUser({ username, passwordHash: null, role, source: 'ldap' });
}

module.exports = {
  BCRYPT_ROUNDS,
  countUsers,
  findByUsername,
  findById,
  listUsers,
  createUser,
  createLocalUser,
  verifyPassword,
  changePassword,
  touchLastLogin,
  upsertLdapUser,
};
