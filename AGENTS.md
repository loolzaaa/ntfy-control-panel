# AGENTS.md

## Project
ntfy Control Panel — web UI to manage ntfy users, passwords, access tokens and
topic ACLs. The panel never touches the ntfy database directly; it shells out to
the `ntfy` CLI. Panel state (accounts, audit log, sessions) lives in its own
SQLite database.

## Requirements
- Node.js >= 22 (required by `ldapts`; pinned in `.nvmrc`). Linux is the only supported deployment target.
- Backend is CommonJS (`server/`); frontend is ESM (`client/`).

## Commands
- `npm run install:all` — install backend + frontend dependencies
- `npm run build` — build the frontend into `client/dist` (needed before `npm start`)
- `npm test` — Node test runner (`node --test`); self-contained, no prior build needed
- `npm run dev` — backend with watch (`:8080`)
- `npm run client:dev` — Vite dev server (`:5173`, proxies to `:8080`)
- `npm start` — production backend (serves API + `client/dist`)

Always run `npm test` and `npm run build` after changing code. There is no linter
or typecheck.

## Layout
- `server/src/` — `config.js`, `db.js`, `app.js`, `index.js`
  - `ntfy/` — CLI runner, output parsers, high-level service
  - `auth/` — IdentityProvider interface, `providers/{local,ldap}.js`, `authenticate.js`
  - `routes/` — `auth.js`, `me.js`, `users.js`, `panelUsers.js`, `audit.js`, `integration.js`
  - `bootstrap.js` — primary panel administrator creation/sync from config
  - `middleware/` — auth/roles, CSRF, API key, error handler
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
- Primary panel administrator ("root"): `BOOTSTRAP_ADMIN_USERNAME` /
  `BOOTSTRAP_ADMIN_PASSWORD` are REQUIRED (no defaults, no random generation).
  `bootstrap.js` creates it on startup and **synchronizes its password from config
  on every start**; the primary's password can never be changed through the panel
  (`primary_admin_password_locked` on `/api/auth/change-password`,
  `primary_admin_protected` on `/api/admins/:id/*`). Identity is the config
  username, not a DB flag.
- Additional local admins are managed via `/api/admins` (`panelUsers.js`,
  admin-only): list/create/delete/reset password. Only `source='local' AND
  role='admin'` accounts are listed/manageable; the primary cannot be deleted or
  reset. Panel password hashing is bcrypt in `services/users.js`.
- Auth responses (`/api/auth/login`, `/api/auth/me`) include `isPrimary` (computed
  from config), used by the UI to hide the panel-password button.
- ldapts gotcha: pass `tlsOptions` to the `Client` constructor ONLY for `ldaps://`.
  For `ldap://` (including StartTLS) omit it, otherwise ldapts forces TLS on the
  initial connection and plain LDAP fails with ECONNRESET. StartTLS is done via
  `client.startTLS({ rejectUnauthorized })`.

### Integration API (machine clients)
- `INTEGRATION_API_KEYS` (comma-separated `name:key` pairs) enables a bearer-token
  API for external automation (e.g. n8n): `POST /api/integration/users` (create an
  ntfy user, optional custom `password`, optional `role` and `acls`) plus
  `PUT`/`DELETE /api/integration/users/:username/access`. When the variable is
  empty the router is not mounted (routes 404).
- Mounted in `app.js` as `requireApiKey + integrationRoutes` — deliberately WITHOUT
  `requireAuth`/`requireAdmin`/`csrfProtection` (bearer auth, no session cookie;
  CSRF does not apply). Keep it isolated from `/api/users` to limit blast radius.
- Keys live only in the process env and are read once at startup (`config.js`), so
  rotating a key requires a panel restart. `requireApiKey` compares with
  `crypto.timingSafeEqual` and sets `req.integration = { name }`.
- Audit entries use `adminUsername = 'api:<name>'`, `adminId = null`,
  `details.integration = true`. Never log the key or password values.
- The panel never stores/returns the public ntfy server address; clients keep it.

### Tokens / access
- `MAX_TOKENS_PER_USER` (default 4) is enforced in `services/tokenPolicy.js` for
  both the admin API and self-service.
- Regular users manage their own tokens via `/api/me/*` and see their ACL
  read-only in `ProfileView.vue`.
- Token lists are sorted by last access (newest first) in `ntfy/service.js`
  (`parseNtfyDate`).

### ntfy passwords
- `generatePassword()` in `ntfy/service.js` returns a 20-char unambiguous
  alphanumeric (no `0/O/1/l/I`). ntfy user passwords exist for clients that do not
  support tokens (e.g. the iOS app).
- Create/reset/change all go through the CLI with the password in `NTFY_PASSWORD`
  (`runNtfy(args, { password })`): `user add` / `user change-pass`.
- `createUser({username, role, password?})` returns `{username, role, password}`;
  when `password` is omitted it is generated (the integration API passes a custom
  one through). Does NOT create tokens (token binding at creation was removed).
  Admin password endpoints:
  `PUT /api/users/:username/password` (empty body → generate, `{password}` →
  custom). Self-service: `PUT /api/me/password`, **LDAP only**
  (`ntfy_password_not_applicable` otherwise; `ntfy_user_not_found` if the user has
  no ntfy account).
- Never write password values to the audit log or logs — only flags like
  `passwordGenerated` / `generated`.
- The QR modal (`TokenQrModal.vue`) is generalized via `title` / `hint` /
  `copiedText` / `copyFailedText` props to also render passwords.

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
Update `README.md`, `docs/deployment.md`, `docs/admin-guide.md` and
`docs/admin-guide.ru.md` when behavior or configuration changes. Do not commit
unless explicitly asked.
