'use strict';

const session = require('express-session');

/**
 * Simple SQLite session store for express-session.
 * Allows administrator sessions to persist across panel restarts.
 */
class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.stmtGet = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this.stmtSet = db.prepare(
      'INSERT INTO sessions (sid, expires, data) VALUES (?, ?, ?) ' +
        'ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, data = excluded.data'
    );
    this.stmtDestroy = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.stmtTouch = db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?');
    this.stmtLength = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE expires > ?');
    this.stmtClear = db.prepare('DELETE FROM sessions');
    this.stmtSweep = db.prepare('DELETE FROM sessions WHERE expires <= ?');
  }

  get(sid, callback) {
    try {
      const row = this.stmtGet.get(sid);
      if (!row) {
        return callback(null, null);
      }
      if (row.expires <= Date.now()) {
        this.stmtDestroy.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.data));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sessionData, callback = () => {}) {
    try {
      const expires = this.expiresAt(sessionData);
      this.stmtSet.run(sid, expires, JSON.stringify(sessionData));
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      this.stmtDestroy.run(sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  touch(sid, sessionData, callback = () => {}) {
    try {
      this.stmtTouch.run(this.expiresAt(sessionData), sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  length(callback) {
    try {
      const row = this.stmtLength.get(Date.now());
      return callback(null, row.count);
    } catch (err) {
      return callback(err);
    }
  }

  clear(callback = () => {}) {
    try {
      this.stmtClear.run();
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  sweep() {
    this.stmtSweep.run(Date.now());
  }

  expiresAt(sessionData) {
    const cookieExpires = sessionData && sessionData.cookie && sessionData.cookie.expires;
    if (cookieExpires) {
      return new Date(cookieExpires).getTime();
    }
    return Date.now() + 24 * 60 * 60 * 1000;
  }
}

module.exports = SqliteSessionStore;
