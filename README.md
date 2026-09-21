# ntfy Control Panel

A web application for centralized management of users, passwords, tokens and
topic access rights on a **ntfy** (self-hosted) push notification server.

The panel does not access the ntfy database directly: all operations are
performed through the official CLI (`ntfy user`, `ntfy token`, `ntfy access`).
Users, tokens and permissions are stored only in ntfy; in its own SQLite database
the panel keeps only the panel administrator accounts and the audit log.

> **Platform:** the panel is supported on **Linux only**. Windows and macOS are
> not supported.

## Features

- Authentication with pluggable identity providers: local panel accounts
  (bcrypt) and/or LDAP, tried in the configured order.
- Two panel roles: administrator (full management) and user (self-service for
  own tokens and ntfy password).
- Multiple local panel administrators: the primary "root" account is defined by
  configuration and cannot be changed or deleted through the panel; additional
  administrators are created from the panel and handed out.
- Configurable per-user token limit (default 4), enforced both for administrators
  and for users managing their own tokens.
- QR codes for tokens and for generated passwords, for quick transfer to the
  mobile app.
- ntfy passwords for clients that do not support tokens (for example, the iOS
  app): generated on user creation and shown once (text + QR), resettable or
  settable by an administrator, and self-service for LDAP users.
- Optional automatic creation of the ntfy user on the first LDAP login
  (random password, no tokens); LDAP users can change their ntfy password.
- List of ntfy users with search by name.
- Creating a user: the password is generated automatically and shown once
  (text + QR). Tokens are created separately on the user card.
- Deleting a user with confirmation (along with tokens and permissions).
- User card: role, ntfy password (generate/custom), tokens (create/delete
  individually and all at once), topic access rights (`read-only`,
  `write-only`, `read-write`, `deny`).
- Audit log of all operations with filtering by date, administrator, action and
  ntfy user.
- Security: HTTPS compatibility, CSRF tokens, login attempt rate limiting,
  security headers (helmet), protection against SQL injection (prepared
  statements), output escaping in Vue (XSS protection).

## Stack

| Component | Technology |
|-----------|------------|
| Backend   | Node.js, Express 5 |
| Frontend  | Vue 3, Vite, Pinia, Vue Router |
| Panel DB | SQLite (better-sqlite3) |
| Authentication | Local accounts (bcrypt) and/or LDAP (`ldapts`) |
| Integration | ntfy CLI via `child_process.execFile` |

## Project structure

```
ntfy-control-panel/
├── server/                  # Backend
│   ├── src/
│   │   ├── index.js         # entry point
│   │   ├── app.js           # Express application assembly
│   │   ├── config.js        # configuration from environment variables
│   │   ├── db.js            # SQLite and schema
│   │   ├── sessionStore.js  # session store in SQLite
│   │   ├── ntfy/            # integration with the ntfy CLI (runner, parsers, service)
│   │   ├── routes/          # REST API (auth, me, users, admins, audit)
│   │   ├── middleware/      # auth, CSRF, error handling
│   │   ├── services/        # panel users, audit, token policy
│   │   └── utils/           # validation, masking
│   └── test/                # tests (node:test)
├── client/                  # Frontend (Vue 3 + Vite)
│   └── src/
│       ├── views/           # screens: login, users, profile, audit
│       ├── components/      # modal windows, user card
│       ├── stores/          # Pinia: auth, notifications
│       ├── router/
│       └── api/
├── docs/
│   ├── deployment.md        # deployment guide
│   ├── admin-guide.md       # administrator guide (EN)
│   └── admin-guide.ru.md    # administrator guide (RU)
├── .env.example
└── package.json
```

## Quick start (development)

```bash
# 1. Install backend and frontend dependencies
npm run install:all

# 2. Create the configuration
cp .env.example .env

# 3. Start the backend (port 8080)
npm run dev

# 4. In a separate terminal, start the frontend dev server (port 5173)
npm run client:dev
```

Open http://localhost:5173. Set `BOOTSTRAP_ADMIN_USERNAME` and
`BOOTSTRAP_ADMIN_PASSWORD` in `.env` before starting: the panel refuses to start
without them and creates the primary administrator from these values.

## Build and run in production

```bash
npm run install:all
npm run build          # builds client/dist
npm start              # starts the backend, serves the API and the SPA static files
```

For more details, see [docs/deployment.md](docs/deployment.md).

## Context path

The panel can be served under a sub-path (for example `/ntfy-panel/`) via a single
`BASE_PATH` setting shared by the backend and the frontend:

```dotenv
BASE_PATH=/ntfy-panel
```

- The backend reads it at runtime, the frontend at build time. Set it before
  building and keep the same value at runtime:
  ```bash
  npm run build
  npm start
  ```
- The value is normalized (`ntfy-panel`, `/ntfy-panel`, `/ntfy-panel/` all become
  `/ntfy-panel`). Empty or `/` means the site root.
- Endpoints move under the path: panel `/ntfy-panel/`, API `/ntfy-panel/api/...`,
  health `/ntfy-panel/healthz` (and `/healthz` at the root); `/` redirects to the
  context path.
- In development the Vite dev server and its proxy use the same value.

> If the frontend is built without `BASE_PATH` while the backend runs with it (or
> vice versa), assets or API calls will 404. Always use the same value for both.

## Tests

```bash
npm test
```

Covered: parsing of ntfy CLI output, the integration service layer, the full
HTTP user management cycle (including ntfy password reset), CSRF protection and
SPA serving.

## Environment variables

See [.env.example](.env.example). Key ones:

| Variable | Purpose |
|------------|------------|
| `SESSION_SECRET` | session cookie secret (required in production) |
| `BASE_PATH` | context path the panel is served under (empty = root) |
| `AUTH_PROVIDERS` | ordered list of active providers (`local`, `ldap`) |
| `MAX_TOKENS_PER_USER` | maximum number of tokens per ntfy user (default 4) |
| `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_SEARCH_BASE`, ... | LDAP provider settings |
| `PANEL_DB` | path to the panel SQLite database |
| `NTFY_BIN` | path to the ntfy executable |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` | primary panel administrator (required; password is config-managed) |
| `INTEGRATION_API_KEYS` | bearer keys for the machine provisioning API (empty = disabled) |

### Integration API

With `INTEGRATION_API_KEYS` set (`name:key` pairs), machine clients can provision
ntfy users and ACLs over a bearer-token API, bypassing the session/CSRF flow:

- `POST /api/integration/users` — create a user (optional `password`, `role`,
  `acls`) and return the password once;
- `PUT /api/integration/users/:username/access` — grant a topic permission;
- `DELETE /api/integration/users/:username/access?topic=...` — revoke it.

All calls are recorded in the audit log under `api:<name>`. See
[docs/admin-guide.md](docs/admin-guide.md) (section 12) for examples.

## Documentation

- [Deployment Guide](docs/deployment.md)
- [Administrator Guide (EN)](docs/admin-guide.md)
- [Руководство администратора (RU)](docs/admin-guide.ru.md)
