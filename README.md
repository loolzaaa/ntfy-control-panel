# ntfy Admin Panel

A web application for centralized management of users, tokens and topic access
rights on a **ntfy** (self-hosted) push notification server.

The panel does not access the ntfy database directly: all operations are
performed through the official CLI (`ntfy user`, `ntfy token`, `ntfy access`).
Users, tokens and permissions are stored only in ntfy; in its own SQLite database
the panel keeps only the panel administrator accounts and the audit log.

> **Platform:** the panel is supported on **Linux only**. Windows and macOS are
> not supported.

## Features

- Authentication of panel administrators (local accounts, bcrypt).
- List of ntfy users with search by name.
- Creating a user (the password is generated automatically) with optional
  creation of a personal token.
- Deleting a user with confirmation (along with tokens and permissions).
- User card: role, tokens (create/delete individually and all at once),
  topic access rights (`read-only`, `write-only`, `read-write`, `deny`).
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
│   │   ├── routes/          # REST API (auth, users, audit)
│   │   ├── middleware/      # auth, CSRF, error handling
│   │   ├── services/        # administrators, audit
│   │   └── utils/           # validation, masking
│   └── test/                # tests (node:test)
├── client/                  # Frontend (Vue 3 + Vite)
│   └── src/
│       ├── views/           # screens: login, users, audit
│       ├── components/      # modal windows, user card
│       ├── stores/          # Pinia: auth, notifications
│       ├── router/
│       └── api/
├── docs/
│   ├── deployment.md        # deployment guide
│   └── admin-guide.md       # administrator guide
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

Open http://localhost:5173. The panel administrator login and password will be
printed in the backend log on first launch (unless `BOOTSTRAP_ADMIN_PASSWORD` is
set).

## Build and run in production

```bash
npm run install:all
npm run build          # builds client/dist
npm start              # starts the backend, serves the API and the SPA static files
```

For more details, see [docs/deployment.md](docs/deployment.md).

## Tests

```bash
npm test
```

Covered: parsing of ntfy CLI output, the integration service layer, the full
HTTP user management cycle, CSRF protection and SPA serving.

## Environment variables

See [.env.example](.env.example). Key ones:

| Variable | Purpose |
|------------|------------|
| `SESSION_SECRET` | session cookie secret (required in production) |
| `PANEL_DB` | path to the panel SQLite database |
| `NTFY_BIN` | path to the ntfy executable |
| `NTFY_CONFIG_FILE` | path to the ntfy `server.yml` |
| `NTFY_AUTH_FILE` | alternatively — path to the ntfy `user.db` |
| `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` | initial panel administrator |

## Documentation

- [Deployment Guide](docs/deployment.md)
- [Administrator Guide (EN)](docs/admin-guide.md)
- [Руководство администратора (RU)](docs/admin-guide.ru.md)
