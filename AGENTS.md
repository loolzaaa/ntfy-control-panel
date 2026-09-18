# AGENTS.md

## Project
ntfy Control Panel — web UI to manage ntfy users, access tokens and topic ACLs.
The panel never touches the ntfy database directly; it shells out to the `ntfy`
CLI. Panel state (accounts, audit log, sessions) lives in its own SQLite database.

## Requirements
- Node.js >= 22 (required by `ldapts`). Linux is the only supported deployment target.
- Backend is CommonJS (`server/`); frontend is ESM (`client/`).

## Commands
- `npm run install:all` — install backend + frontend dependencies
- `npm run build` — build the frontend into `client/dist` (needed before `npm start`)
- `npm test` — Node test runner (`node --test`)
- `npm run dev` — backend with watch (`:8080`)
- `npm run client:dev` — Vite dev server (`:5173`, proxies to `:8080`)
- `npm start` — production backend (serves API + `client/dist`)

Always run `npm test` and `npm run build` after changing code. There is no linter
or typecheck.

## Layout
- `server/src/` — `config.js`, `db.js`, `app.js`, `index.js`
  - `ntfy/` — CLI runner, output parsers, high-level service
  - `auth/` — IdentityProvider interface, `providers/{local,ldap}.js`, `authenticate.js`
  - `routes/` — `auth.js`, `me.js`, `users.js`, `audit.js`
  - `middleware/` — auth/roles, CSRF, error handler
  - `services/` — panel users, audit, token policy
- `client/src/` — `views/`, `components/`, `stores/`, `router/`, `i18n/`, `api/`
- `server/test/` — `node:test` suites
- `docs/` — deployment + administrator guides (EN and RU)

## Invariants and gotchas

### ntfy CLI integration
- All ntfy commands run via `execFile` in `server/src/ntfy/runner.js`, serialized
  (the CLI writes the SQLite DB directly).
- The panel relies on the CLI reading its default config `/etc/ntfy/server.yml`.
  Do NOT reintroduce `NTFY_CONFIG_FILE` / `NTFY_AUTH_FILE` / `NTFY_BASE_URL` panel
  variables (removed on purpose). The CLI reads `server.yml` even when an
  auth-file env var is set.
- Map new CLI failures to `AppError` codes in `runner.js`; the frontend localizes
  by code (`client/src/composables/useErrorText.js`, `errors.<code>` in locales).

### Database
- Panel schema: `users`, `audit_log`, `sessions` (`server/src/db.js`). The project
  is greenfield: no migrations or backward compatibility — change the schema directly.

### Authentication / roles
- Providers implement the `IdentityProvider` interface and are tried in
  `AUTH_PROVIDERS` order. `local` accounts are admins; `ldap` users get role `user`.
- LDAP login upserts the panel user and optionally creates the ntfy user
  (`LDAP_PROVISION_NTFY_USER`).
- `requireAuth` sets `req.user`; `requireAdmin` guards admin routes. Frontend routes
  use `meta.requiresAdmin`.
- ldapts gotcha: pass `tlsOptions` to the `Client` constructor ONLY for `ldaps://`.
  For `ldap://` (including StartTLS) omit it, otherwise ldapts forces TLS on the
  initial connection and plain LDAP fails with ECONNRESET. StartTLS is done via
  `client.startTLS({ rejectUnauthorized })`.

### Tokens / access
- `MAX_TOKENS_PER_USER` (default 4) is enforced in `services/tokenPolicy.js` for
  both the admin API and self-service.
- Regular users manage their own tokens via `/api/me/*` and see their ACL
  read-only in `ProfileView.vue`.
- Token lists are sorted by last access (newest first) in `ntfy/service.js`
  (`parseNtfyDate`).

### Frontend
- API base is `${import.meta.env.BASE_URL}api`; router uses
  `createWebHistory(import.meta.env.BASE_URL)`.
- `BASE_PATH` is shared by the backend (runtime) and Vite (build). Changing it
  requires `npm run build` + restart.
- i18n: keep `en.js` and `ru.js` in sync; escape `@`/`|` as `{'@'}`/`{'|'}`; keys
  containing dots must be nested (e.g. `actions.auth.login`).
- `COOKIE_SECURE=auto` (Secure only for secure requests). `true` over plain HTTP
  makes the server omit the session cookie.

### Environment
- `config.js` skips dotenv loading when `NODE_ENV=test`, so tests are independent
  of a local `.env`.
- On Windows dev use `npm.cmd` (PowerShell execution policy blocks `npm.ps1`).

## Docs
Update `docs/deployment.md`, `docs/admin-guide.md` and `docs/admin-guide.ru.md`
when behavior or configuration changes. Do not commit unless explicitly asked.
