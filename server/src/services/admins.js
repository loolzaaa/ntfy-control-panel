'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

const BCRYPT_ROUNDS = 12;

function countAdmins() {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM admins').get();
  return row.count;
}

function findByUsername(username) {
  return getDb()
    .prepare('SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM admins WHERE username = ?')
    .get(username);
}

function findById(id) {
  return getDb()
    .prepare('SELECT id, username, created_at AS createdAt FROM admins WHERE id = ?')
    .get(id);
}

function createAdmin(username, password) {
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const result = getDb()
    .prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
    .run(username, hash);
  return findById(result.lastInsertRowid);
}

function verifyPassword(admin, password) {
  if (!admin || !admin.passwordHash) {
    return false;
  }
  return bcrypt.compareSync(password, admin.passwordHash);
}

function changePassword(adminId, password) {
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  getDb().prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, adminId);
}

function listAdmins() {
  return getDb()
    .prepare('SELECT id, username, created_at AS createdAt FROM admins ORDER BY username')
    .all();
}

module.exports = {
  BCRYPT_ROUNDS,
  countAdmins,
  findByUsername,
  findById,
  createAdmin,
  verifyPassword,
  changePassword,
  listAdmins,
};
