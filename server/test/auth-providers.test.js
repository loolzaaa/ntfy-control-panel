'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const dbPath = path.join(os.tmpdir(), `ntfy-panel-auth-${process.pid}-${Date.now()}.db`);

process.env.PANEL_DB = dbPath;
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef';
process.env.NODE_ENV = 'test';

const { initDb, closeDb } = require('../src/db');
const users = require('../src/services/users');
const ntfy = require('../src/ntfy/service');
const { createLocalProvider } = require('../src/auth/providers/local');
const { createLdapProvider, escapeFilterValue } = require('../src/auth/providers/ldap');
const { authenticate } = require('../src/auth/authenticate');

initDb(dbPath);

const invalidCredentials = () =>
  Object.assign(new Error('Invalid credentials'), { name: 'InvalidCredentialsError', code: 49 });

const ldapSettings = {
  url: 'ldaps://ldap.example.com',
  bindDn: 'cn=svc,dc=example,dc=com',
  bindPassword: 'svcpass',
  searchBase: 'ou=people,dc=example,dc=com',
  searchFilter: '(uid={{username}})',
  attrUsername: 'uid',
  attrDisplayName: 'cn',
  attrEmail: 'mail',
  startTls: false,
  tlsRejectUnauthorized: true,
  connectTimeoutMs: 1000,
  provisionNtfyUser: true,
  role: 'user',
};

const ALICE_DN = 'uid=alice,ou=people,dc=example,dc=com';

function makeFakeClient(behavior = {}) {
  const calls = { binds: [], searches: [], unbinds: 0, startTls: 0, options: [], startTlsOptions: null };

  class FakeClient {
    constructor(options) {
      this.options = options;
      calls.options.push(options);
    }
    async startTLS(options) {
      calls.startTls += 1;
      calls.startTlsOptions = options;
    }
    async bind(dn, password) {
      calls.binds.push({ dn, password });
      if (behavior.bind) {
        return behavior.bind(dn, password);
      }
      if (dn === ldapSettings.bindDn && password !== ldapSettings.bindPassword) {
        throw invalidCredentials();
      }
    }
    async search(base, options) {
      calls.searches.push({ base, options });
      return { searchEntries: behavior.entries || [] };
    }
    async unbind() {
      calls.unbinds += 1;
    }
  }

  return { FakeClient, calls };
}

const aliceEntry = {
  dn: ALICE_DN,
  uid: 'alice',
  cn: 'Alice Example',
  mail: 'alice@example.com',
};

test.after(() => {
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbPath + suffix, { force: true });
    } catch {
      // ignore
    }
  }
});

test('escapeFilterValue escapes LDAP filter special characters', () => {
  assert.equal(escapeFilterValue('a*b(c)\\d'), 'a\\2ab\\28c\\29\\5cd');
  assert.equal(escapeFilterValue('plain'), 'plain');
});

test('LDAP provider authenticates a user with valid credentials', async () => {
  const { FakeClient, calls } = makeFakeClient({
    entries: [aliceEntry],
    bind: (dn, password) => {
      if (dn === ALICE_DN && password !== 'userpass') {
        throw invalidCredentials();
      }
    },
  });
  const provider = createLdapProvider(ldapSettings, { Client: FakeClient });

  const identity = await provider.authenticate({ username: 'alice', password: 'userpass' });

  assert.equal(identity.username, 'alice');
  assert.equal(identity.role, 'user');
  assert.equal(identity.source, 'ldap');
  assert.equal(identity.provisionNtfyUser, true);
  assert.equal(identity.displayName, 'Alice Example');
  assert.equal(identity.email, 'alice@example.com');
  assert.equal(calls.binds.length, 2);
  assert.deepEqual(calls.binds[0], { dn: ldapSettings.bindDn, password: 'svcpass' });
  assert.deepEqual(calls.binds[1], { dn: ALICE_DN, password: 'userpass' });
});

test('LDAP provider rejects an empty password without binding', async () => {
  const { FakeClient, calls } = makeFakeClient({ entries: [aliceEntry] });
  const provider = createLdapProvider(ldapSettings, { Client: FakeClient });

  const identity = await provider.authenticate({ username: 'alice', password: '' });

  assert.equal(identity, null);
  assert.equal(calls.binds.length, 0);
});

test('LDAP provider returns null when the user is not found', async () => {
  const { FakeClient } = makeFakeClient({ entries: [] });
  const provider = createLdapProvider(ldapSettings, { Client: FakeClient });

  assert.equal(await provider.authenticate({ username: 'ghost', password: 'x' }), null);
});

test('LDAP provider returns null on invalid user credentials', async () => {
  const { FakeClient } = makeFakeClient({
    entries: [aliceEntry],
    bind: (dn, password) => {
      if (dn === ALICE_DN) {
        throw invalidCredentials();
      }
    },
  });
  const provider = createLdapProvider(ldapSettings, { Client: FakeClient });

  assert.equal(await provider.authenticate({ username: 'alice', password: 'wrong' }), null);
});

test('LDAP service bind failure raises ldap_bind_failed', async () => {
  const { FakeClient } = makeFakeClient({
    entries: [aliceEntry],
    bind: (dn) => {
      if (dn === ldapSettings.bindDn) {
        throw invalidCredentials();
      }
    },
  });
  const provider = createLdapProvider(ldapSettings, { Client: FakeClient });

  await assert.rejects(
    () => provider.authenticate({ username: 'alice', password: 'userpass' }),
    (error) => {
      assert.equal(error.code, 'ldap_bind_failed');
      return true;
    }
  );
});

test('LDAP search filter escapes the username', async () => {
  const { FakeClient, calls } = makeFakeClient({ entries: [] });
  const provider = createLdapProvider(ldapSettings, { Client: FakeClient });

  await provider.authenticate({ username: 'a*b(c)', password: 'x' });

  assert.equal(calls.searches[0].options.filter, '(uid=a\\2ab\\28c\\29)');
});

test('plain ldap:// does not force TLS on the connection', async () => {
  const { FakeClient, calls } = makeFakeClient({ entries: [aliceEntry] });
  const provider = createLdapProvider(
    { ...ldapSettings, url: 'ldap://ldap.example.com:389', startTls: false },
    { Client: FakeClient }
  );

  await provider.authenticate({ username: 'alice', password: 'userpass' });

  assert.equal(calls.options[0].tlsOptions, undefined);
  assert.equal(calls.startTls, 0);
});

test('ldaps:// passes TLS options to the connection', async () => {
  const { FakeClient, calls } = makeFakeClient({ entries: [aliceEntry] });
  const provider = createLdapProvider(
    { ...ldapSettings, url: 'ldaps://ldap.example.com:636', startTls: false },
    { Client: FakeClient }
  );

  await provider.authenticate({ username: 'alice', password: 'userpass' });

  assert.deepEqual(calls.options[0].tlsOptions, { rejectUnauthorized: true });
  assert.equal(calls.startTls, 0);
});

test('ldap:// with StartTLS connects plain first, then upgrades', async () => {
  const { FakeClient, calls } = makeFakeClient({ entries: [aliceEntry] });
  const provider = createLdapProvider(
    { ...ldapSettings, url: 'ldap://ldap.example.com:389', startTls: true, tlsRejectUnauthorized: false },
    { Client: FakeClient }
  );

  await provider.authenticate({ username: 'alice', password: 'userpass' });

  assert.equal(calls.options[0].tlsOptions, undefined);
  assert.ok(calls.startTls >= 1);
  assert.deepEqual(calls.startTlsOptions, { rejectUnauthorized: false });
});

test('ldaps:// with StartTLS ignores StartTLS', async () => {
  const { FakeClient, calls } = makeFakeClient({ entries: [aliceEntry] });
  const provider = createLdapProvider(
    { ...ldapSettings, url: 'ldaps://ldap.example.com:636', startTls: true },
    { Client: FakeClient }
  );

  await provider.authenticate({ username: 'alice', password: 'userpass' });

  assert.equal(calls.startTls, 0);
  assert.deepEqual(calls.options[0].tlsOptions, { rejectUnauthorized: true });
});

test('providers are tried in order and the first match wins', async () => {
  const calls = [];
  const p1 = {
    name: 'p1',
    authenticate: async () => {
      calls.push('p1');
      return null;
    },
  };
  const p2 = {
    name: 'p2',
    authenticate: async () => {
      calls.push('p2');
      return { username: 'orderuser', role: 'user', source: 'ldap', provisionNtfyUser: false };
    },
  };
  const p3 = {
    name: 'p3',
    authenticate: async () => {
      calls.push('p3');
      return null;
    },
  };

  const result = await authenticate(
    { username: 'orderuser', password: 'x', ip: '127.0.0.1' },
    { providers: [p1, p2, p3] }
  );

  assert.deepEqual(calls, ['p1', 'p2']);
  assert.equal(result.user.username, 'orderuser');
});

test('a failing provider does not block the next provider', async () => {
  const broken = {
    name: 'broken',
    authenticate: async () => {
      throw new Error('provider is down');
    },
  };
  const working = {
    name: 'working',
    authenticate: async () => ({ username: 'dave', role: 'user', source: 'ldap', provisionNtfyUser: false }),
  };

  const result = await authenticate(
    { username: 'dave', password: 'x', ip: '127.0.0.1' },
    { providers: [broken, working] }
  );

  assert.equal(result.user.username, 'dave');
});

test('local provider authenticates local users only', async () => {
  users.createLocalUser('root', 'rootpass', 'admin');
  const provider = createLocalProvider();

  const identity = await provider.authenticate({ username: 'root', password: 'rootpass' });
  assert.equal(identity.role, 'admin');
  assert.equal(identity.source, 'local');
  assert.equal(identity.provisionNtfyUser, false);

  assert.equal(await provider.authenticate({ username: 'root', password: 'nope' }), null);
  assert.equal(await provider.authenticate({ username: 'ghost', password: 'x' }), null);
});

test('LDAP login provisions the ntfy user without tokens', async () => {
  const created = [];
  const originalGetUser = ntfy.getUser;
  const originalCreateUser = ntfy.createUser;
  ntfy.getUser = async () => {
    throw Object.assign(new Error('not found'), { code: 'user_not_found' });
  };
  ntfy.createUser = async (input) => {
    created.push(input);
    return { username: input.username, role: 'user', token: null };
  };

  try {
    const provider = {
      name: 'ldap',
      authenticate: async () => ({ username: 'bob', role: 'user', source: 'ldap', provisionNtfyUser: true }),
    };
    const result = await authenticate(
      { username: 'bob', password: 'x', ip: '1.2.3.4' },
      { providers: [provider] }
    );

    assert.equal(result.user.username, 'bob');
    assert.equal(result.ntfyProvision.created, true);
    assert.deepEqual(created, [{ username: 'bob', role: 'user' }]);
  } finally {
    ntfy.getUser = originalGetUser;
    ntfy.createUser = originalCreateUser;
  }
});

test('LDAP login continues when ntfy provisioning fails', async () => {
  const originalGetUser = ntfy.getUser;
  const originalCreateUser = ntfy.createUser;
  ntfy.getUser = async () => {
    throw Object.assign(new Error('not found'), { code: 'user_not_found' });
  };
  ntfy.createUser = async () => {
    throw Object.assign(new Error('ntfy down'), { code: 'ntfy_error' });
  };

  try {
    const provider = {
      name: 'ldap',
      authenticate: async () => ({ username: 'erin', role: 'user', source: 'ldap', provisionNtfyUser: true }),
    };
    const result = await authenticate(
      { username: 'erin', password: 'x', ip: '1.2.3.4' },
      { providers: [provider] }
    );

    assert.equal(result.user.username, 'erin');
    assert.equal(result.ntfyProvision.created, false);
  } finally {
    ntfy.getUser = originalGetUser;
    ntfy.createUser = originalCreateUser;
  }
});

test('LDAP login is refused when a local account with the same name exists', async () => {
  users.createLocalUser('carol', 'carolpass', 'admin');
  const provider = {
    name: 'ldap',
    authenticate: async () => ({ username: 'carol', role: 'user', source: 'ldap', provisionNtfyUser: false }),
  };

  const result = await authenticate(
    { username: 'carol', password: 'x', ip: '1.2.3.4' },
    { providers: [provider] }
  );

  assert.equal(result, null);
});
