'use strict';

/**
 * Parsers for ntfy CLI output.
 *
 * The output format corresponds to ntfy 2.x (verified against the sources in
 * cmd/user.go, cmd/access.go, cmd/token.go). The parsers are intentionally
 * tolerant of small differences between versions (for example, the presence
 * or absence of the tier field).
 */

const PERMISSION_BY_PHRASE = {
  'read-write': 'read-write',
  'read-only': 'read-only',
  'write-only': 'write-only',
  no: 'deny',
};

function parsePermissionPhrase(phrase) {
  return PERMISSION_BY_PHRASE[phrase] || null;
}

/**
 * Parses the output of `ntfy user list` / `ntfy access`.
 * @param {string} stdout
 * @returns {Array<object>}
 */
function parseUserList(stdout) {
  const users = [];
  let current = null;

  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    const header = line.match(/^user\s+(.+?)\s+\((.+)\)\s*$/);
    if (header) {
      current = parseUserHeader(header[1].trim(), header[2].trim());
      users.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const text = line.replace(/^-\s+/, '').trim();

    if (/^read-write access to all topics \(admin role\)$/i.test(text)) {
      current.admin = true;
      current.role = 'admin';
      continue;
    }

    const defaultMatch = text.match(
      /^(read-write|read-only|write-only|no) access to (?:all|any) \(other\) topics \(server config\)$/i
    );
    if (defaultMatch) {
      current.defaultAccess = parsePermissionPhrase(defaultMatch[1].toLowerCase());
      continue;
    }

    if (/^no topic-specific permissions$/i.test(text)) {
      continue;
    }

    const grantMatch = text.match(
      /^(read-write|read-only|write-only|no) access to topic (.+?)(?:\s+\(server config\))?$/i
    );
    if (grantMatch) {
      current.grants.push({
        topic: grantMatch[2].trim(),
        permission: parsePermissionPhrase(grantMatch[1].toLowerCase()),
        provisioned: /\(server config\)$/i.test(text),
      });
    }
  }

  return users;
}

function parseUserHeader(name, meta) {
  const user = {
    name,
    role: 'user',
    tier: null,
    provisioned: false,
    admin: false,
    grants: [],
    defaultAccess: null,
  };

  if (/role\s*:/i.test(meta)) {
    const roleMatch = meta.match(/role\s*:\s*([^,]+)/i);
    user.role = roleMatch ? roleMatch[1].trim().toLowerCase() : 'user';
    const tierMatch = meta.match(/tier\s*:\s*([^,)]+)/i);
    user.tier = tierMatch && tierMatch[1].trim().toLowerCase() !== 'none' ? tierMatch[1].trim() : null;
    user.provisioned = /server config/i.test(meta);
  } else {
    user.role = meta.replace(/,\s*server config/i, '').trim().toLowerCase();
    user.provisioned = /server config/i.test(meta);
  }

  user.admin = user.role === 'admin';
  return user;
}

/**
 * Parses the output of `ntfy token list [username]`.
 * @param {string} stdout
 * @returns {Array<object>}
 */
function parseTokenList(stdout) {
  const tokens = [];
  let username = null;

  for (const rawLine of String(stdout || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (/^no users with tokens$/i.test(line.trim())) {
      return tokens;
    }

    const userMatch = line.match(/^user\s+(.+?)\s*$/);
    if (userMatch) {
      username = userMatch[1].trim();
      continue;
    }

    if (/has no access tokens$/i.test(line.trim())) {
      continue;
    }

    const tokenMatch = line.match(
      /^-\s+(tk_[A-Za-z0-9_-]+)(?:\s+\(([^)]*)\))?,\s+(never expires|expires\s+(.+?)),\s+accessed from\s+(\S+)\s+at\s+(.+?)(?:\s+\(server config\))?$/i
    );
    if (tokenMatch) {
      const expiresRaw = tokenMatch[3];
      const neverExpires = /^never expires$/i.test(expiresRaw);
      tokens.push({
        username,
        value: tokenMatch[1],
        label: tokenMatch[2] ? tokenMatch[2].trim() : '',
        expires: expiresRaw,
        expiresAt: neverExpires ? null : tokenMatch[4].trim(),
        neverExpires,
        lastOrigin: tokenMatch[5],
        lastAccess: tokenMatch[6].trim(),
        provisioned: /\(server config\)$/i.test(line),
      });
    }
  }

  return tokens;
}

/**
 * Parses the output of `ntfy token add`.
 * @param {string} stdout
 * @returns {{token: string, username: string, expires: string}|null}
 */
function parseTokenAdd(stdout) {
  const line = String(stdout || '').trim();
  const match = line.match(
    /^token\s+(tk_[A-Za-z0-9_-]+)\s+created for user\s+(.+?),\s+(never expires|expires\s+.+)$/i
  );
  if (!match) {
    return null;
  }
  return {
    token: match[1],
    username: match[2].trim(),
    expires: match[3].trim(),
  };
}

module.exports = {
  parseUserList,
  parseTokenList,
  parseTokenAdd,
  parsePermissionPhrase,
};
