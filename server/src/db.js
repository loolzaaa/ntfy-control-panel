'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  source        TEXT NOT NULL DEFAULT 'local',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id       INTEGER,
  admin_username TEXT NOT NULL,
  action         TEXT NOT NULL,
  target_user    TEXT,
  details        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  data    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_log (admin_username);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log (target_user);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires);
`;

/**
 * Initializes the SQLite connection and applies the schema.
 * @param {string} filename absolute path to the DB file
 * @returns {import('better-sqlite3').Database}
 */
function initDb(filename) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Panel database is not initialized');
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDb, getDb, closeDb };
