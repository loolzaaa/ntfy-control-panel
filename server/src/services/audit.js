'use strict';

const { getDb } = require('../db');

/**
 * Writes an event to the audit log.
 * @param {{adminId?: number|null, adminUsername: string, action: string, targetUser?: string|null, details?: object|null}} entry
 */
function log(entry) {
  const { adminId = null, adminUsername, action, targetUser = null, details = null } = entry;
  getDb()
    .prepare(
      'INSERT INTO audit_log (admin_id, admin_username, action, target_user, details) VALUES (?, ?, ?, ?, ?)'
    )
    .run(adminId, adminUsername, action, targetUser, details ? JSON.stringify(details) : null);
}

/**
 * Returns a page of the audit log with filters.
 * @param {{from?: string, to?: string, admin?: string, action?: string, targetUser?: string, page?: number, pageSize?: number}} filters
 */
function query(filters = {}) {
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, Number.parseInt(filters.pageSize, 10) || 25));

  const where = [];
  const params = {};

  if (filters.from) {
    where.push("datetime(created_at) >= datetime(@from)");
    params.from = filters.from;
  }
  if (filters.to) {
    where.push("datetime(created_at) <= datetime(@to)");
    params.to = filters.to;
  }
  if (filters.admin) {
    where.push('admin_username = @admin');
    params.admin = filters.admin;
  }
  if (filters.action) {
    where.push('action = @action');
    params.action = filters.action;
  }
  if (filters.targetUser) {
    where.push('target_user LIKE @targetUser');
    params.targetUser = `%${filters.targetUser}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();

  const total = db.prepare(`SELECT COUNT(*) AS count FROM audit_log ${whereSql}`).get(params).count;
  const items = db
    .prepare(
      `SELECT id, admin_id AS adminId, admin_username AS adminUsername, action,
              target_user AS targetUser, details, created_at AS createdAt
       FROM audit_log ${whereSql}
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });

  return {
    items: items.map((item) => ({
      ...item,
      details: item.details ? safeParse(item.details) : null,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function distinctValues(column) {
  const allowed = { action: 'action', admin: 'admin_username' };
  const col = allowed[column];
  if (!col) {
    throw new Error(`Invalid column: ${column}`);
  }
  return getDb()
    .prepare(`SELECT DISTINCT ${col} AS value FROM audit_log WHERE ${col} IS NOT NULL ORDER BY ${col}`)
    .all()
    .map((row) => row.value);
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return { raw: json };
  }
}

module.exports = { log, query, distinctValues };
