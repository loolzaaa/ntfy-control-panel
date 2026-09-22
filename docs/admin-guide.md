# Administrator Guide

> Русская версия: [Руководство администратора](admin-guide.ru.md).

## 1. Purpose

The ntfy control panel lets you manage ntfy user accounts, their access tokens and
topic permissions. All changes are applied directly to the ntfy server through
its CLI.

The panel has two roles:

- **Administrator** — full access: users, passwords, tokens, topic permissions and
  the audit log.
- **User** — a self-service area for own access tokens (create and delete tokens
  within the configured limit, show QR codes) and for changing the ntfy password.
  Administrative functionality is not available.

Administrators are local panel accounts. Users authenticate through an external
identity provider (LDAP) and receive the `user` role automatically. The primary
administrator ("root") is defined by configuration; additional local
administrators are created from the panel (see section 7).

## 2. Logging into the panel

1. Open the panel address in your browser (for example, `https://ntfy-admin.example.com`).
2. Enter your login and password (a local panel account or an LDAP account).
3. Click "Sign in".

The session lasts for a limited time (8 hours by default). After several failed
attempts, login is temporarily blocked.

The primary administrator login and password are set during deployment (see the
deployment guide). LDAP users cannot change their LDAP password in the panel — it
is managed by the directory — but they can change their **ntfy** password (see
5.2 and section 11).

## 3. Navigation

Administrators see the following sections at the top of the screen:

- **Users** — the main management section.
- **Administrators** — local panel accounts.
- **Audit log** — the history of administrator actions.

On the right side of the header are the user name, the language switcher and the
"Log out" button; local administrators additionally see "Change password" (hidden
for the primary administrator, whose password is managed by configuration).

Users with the `user` role do not see the administrative sections: they get the
"My tokens" page for managing their own access tokens and for changing their ntfy
password.

## 4. User list

The "Users" section displays a table of ntfy users.

| Column | Description |
|---------|----------|
| Username | Login in ntfy. The pseudo-user `*` is marked as "anonymous". |
| Role | "Administrator" or "User". |
| Tier | The user's tier in ntfy (if set). |
| Source | "configuration" — the user is defined in `server.yml`; "manual" — created via the CLI/panel. |

### Search

The search field filters the list **by username** (substring, case-insensitive).

### Creating a user

1. Click "Create user".
2. Specify a username. Letters, digits and the characters `- _ . + @` are allowed.
3. Choose the role in ntfy: "User" or "Administrator".
4. Click "Create".

An ntfy password is generated automatically and shown **once** immediately after
creation, both as text and as a QR code. Copy or scan it and give it to the user:
it is required to sign in to ntfy clients that do not support tokens (for
example, the iOS app). After the window is closed, the password cannot be
recovered — it can only be reset. Access tokens are created separately on the
user card (see 5.3).

### Deleting a user

1. Click "Delete" in the user's row.
2. Confirm the action.

All of the user's tokens and access rights entries are deleted along with the
user. Deletion is irreversible.

> The "Delete" button is unavailable for the pseudo-user `*` and for users
> defined in the ntfy configuration (`server.yml`) — they are managed by ntfy
> itself.

## 5. User card

Opened by clicking a row or the "Open" button. Contains all information and all
actions for the user.

### 5.1. Basic information

The name, role in ntfy, tier and the "From ntfy configuration" flag are
displayed.

### 5.2. ntfy password

The "ntfy password" section lets you manage the password the user uses to sign in
to ntfy clients that do not support tokens (for example, the iOS app).

- **Generate password** — generates a new random password and shows it once, as
  text and as a QR code.
- **Set password** — enter a custom password (at least 8 characters) and click
  "Set password".

Changing the password does not affect existing access tokens. Passwords of users
defined in the ntfy configuration (`server.yml`) cannot be changed.

### 5.3. Access tokens

The token table contains the token value (masked), the label, the expiration and
information about the last access.

- **Attach token** — specify a label and, if needed, an expiration
  (for example, `30d`; empty means no expiration), then click the button. The
  value of the new token is shown once. Each user can have at most
  `MAX_TOKENS_PER_USER` tokens (4 by default); once the limit is reached the
  button is disabled.
- **QR code** — the "QR code" button opens a scannable code containing the token,
  for quick transfer to the ntfy mobile app.
- **Delete token** — the "Delete" button in the token's row.
- **Delete all tokens** — the button above the table; deletes all of the user's
  tokens in a single operation.

Tokens defined in the ntfy configuration cannot be deleted.

### 5.4. Topic access rights

The "Topic access rights" table shows the "topic → rights" mapping.

Available rights:

| Right | Meaning |
|-------|----------|
| Read-only (`read-only`) | Subscribing to and reading messages of the topic. |
| Write-only (`write-only`) | Publishing messages to the topic. |
| Read-write (`read-write`) | Publishing and subscribing. |
| Deny (`deny`) | Access to the topic is denied. |

Actions:

- **Assign** — specify a topic or pattern and the rights, then click "Assign".
- **Change** — select a new value in the drop-down list directly in the table.
- **Delete** — the "Delete" button in the row.

Topic patterns with the `*` character are supported, for example `alerts-*` —
they are handled by ntfy and apply to all matching topics.

> For users with the "Administrator" role, permissions on individual topics are
> not applied: an ntfy administrator has full access to all topics. A
> corresponding notice is displayed in the card of such a user.

## 6. Audit log

The "Audit log" section records all operations (who, what, when).

Filters:

- **From date / To date** — time interval.
- **Administrator** — the panel administrator's name.
- **Action** — the type of operation.
- **ntfy user** — the name of the target user.

The table contains the date and time, the administrator, the action, the target
user and the operation details in JSON format. Entries are displayed page by
page.

Main action types:

| Action | Description |
|----------|----------|
| Panel login / Failed login attempt / Logout | Administrator authentication. |
| Administrator password change | Changing a panel administrator's own password. |
| Panel administrator creation / deletion / password change | Managing local panel accounts. |
| User creation / deletion | Managing ntfy accounts. |
| ntfy password change | Changing or resetting an ntfy user's password (the value is never logged). |
| Token creation / deletion | Managing individual tokens. |
| Delete all tokens | Bulk deletion of tokens. |
| Topic permission assignment / deletion | Managing ACLs. |

> Token values in the log are masked — only part of the string is stored in the
> details.

## 7. Panel administrators

The "Administrators" section lists the local panel accounts.

- **Create administrator** — specify a username; leave the password empty to
  generate one (shown once, with a QR code) or enter a custom password (at least
  8 characters). Hand the credentials to the person.
- **Password** — reset an administrator's password (generate or set a custom
  one).
- **Delete** — remove an administrator.

The **primary administrator** ("root") is defined in the configuration
(`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`) and is marked with the
"Primary" badge. It cannot be deleted or have its password reset from the panel:
its password is always synchronized with the configuration and changes only by
editing the configuration and restarting the panel. It is intended to create the
other administrators.

## 8. Changing your panel password

Additional (non-primary) administrators can click "Change password" in the
header, enter the current and new password (at least 8 characters) and confirm.
This changes the **panel** password only; ntfy user passwords are managed on the
user card (see 5.2) and on the "My tokens" page. The primary administrator does
not see this button — its password is managed by configuration (see section 7).

## 9. Security: recommendations

- Host the panel only behind HTTPS (a reverse proxy).
- Set a persistent `SESSION_SECRET` and `COOKIE_SECURE=true`.
- Restrict network access to the panel (VPN, allowlists).
- Use strong passwords and change them when responsible persons change.
- Regularly review the audit log, paying attention to failed login attempts.
- Do not transmit token values over insecure channels.

## 10. Limitations

- **The primary panel administrator** cannot be deleted or have its password
  changed through the panel; it is managed by configuration.
- **Users from the ntfy configuration** (`server.yml`) cannot be modified or
  deleted through the panel — they are managed by ntfy.
- **The pseudo-user `*`** (anonymous access) is available only for viewing and
  configuring topic permissions; tokens are not created for it.
- **The ntfy administrator role** does not use permissions on individual topics.
- The panel does not store ntfy user passwords: on creation the password is
  generated, shown once and passed to ntfy. It can only be reset, not recovered.

## 11. Authentication of panel users

Authentication is performed by identity providers that are enabled and ordered
through the `AUTH_PROVIDERS` setting (for example `local,ldap`). Providers are
tried in the configured order:

- **local** — accounts stored in the panel database (bcrypt hashes). These are
  administrators.
- **ldap** — binds against an LDAP directory. LDAP users receive the `user` role.

On the first successful LDAP login, the ntfy user can be created automatically
(with a random password and no access tokens) if `LDAP_PROVISION_NTFY_USER=true`.

LDAP users can change their **ntfy** password on the "My tokens" page (used by
ntfy clients that do not support tokens). Their **LDAP** password is managed by
the directory and cannot be changed in the panel.

## 12. Integration API (automation)

For machine clients (for example n8n) the panel can expose a small bearer-token
API that provisions ntfy users and their topic permissions. It is disabled unless
`INTEGRATION_API_KEYS` is set in the panel `.env`:

```dotenv
INTEGRATION_API_KEYS=n8n:npk_<random>
```

Generate a key:

```bash
node -e "console.log('npk_' + require('crypto').randomBytes(32).toString('hex'))"
```

Endpoints (header `Authorization: Bearer <key>`):

- `POST /api/integration/users` — body:

  ```json
  {
    "username": "alice",
    "role": "user",
    "password": "optional-custom-password",
    "acls": [{ "topic": "alerts-*", "permission": "read-write" }]
  }
  ```

  If `password` is omitted, the panel generates one. The response contains the
  username and the password (shown once):

  ```json
  { "user": { "name": "alice", "role": "user" }, "password": "...", "acls": [] }
  ```

- `PUT /api/integration/users/:username` — idempotent create-or-update. The body
  is the same as above without `username` (the name is in the path). If the user
  does not exist it is created; if it exists, the password is **always** reset
  (to `password` or a freshly generated one) and the given ACLs are re-applied.
  Existing tokens and ACLs not listed in the request are preserved. The `role` is
  applied only on creation. Response:

  ```json
  { "user": { "name": "alice", "role": "user" }, "password": "...", "acls": [], "created": false }
  ```

- `PUT /api/integration/users/:username/access` — body
  `{ "topic": "...", "permission": "read-only" }`.
- `DELETE /api/integration/users/:username/access?topic=...`.

Permission values: `read-only`, `write-only`, `read-write`, `deny`. The topic may
contain `*`.

Use `PUT /api/integration/users/:username` in automation that must be safe to
re-run (for example, re-issuing credentials to an employee): it never fails with
"user already exists" and always returns a current password.

Notes:

- The API key is a secret: keep it only in the panel `.env` and in the client.
  All calls are written to the audit log under `api:<name>`.
- Changes to `INTEGRATION_API_KEYS` take effect only after a panel restart;
  replacing a key invalidates the old one immediately after the restart.
- The panel does not store or return the public ntfy server address — keep it in
  the client configuration.
