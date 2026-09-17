# Administrator Guide

> Русская версия: [Руководство администратора](admin-guide.ru.md).

## 1. Purpose

The ntfy control panel lets you manage ntfy user accounts, their access tokens and
topic permissions. All changes are applied directly to the ntfy server through
its CLI.

The panel has two roles:

- **Administrator** — full access: users, tokens, topic permissions and the audit log.
- **User** — a self-service area for own access tokens: create and delete tokens
  (within the configured limit) and show QR codes. Administrative functionality is
  not available.

Administrators are local panel accounts. Users authenticate through an external
identity provider (LDAP) and receive the `user` role automatically.

## 2. Logging into the panel

1. Open the panel address in your browser (for example, `https://ntfy-admin.example.com`).
2. Enter your login and password (a local panel account or an LDAP account).
3. Click "Sign in".

The session lasts for a limited time (8 hours by default). After several failed
attempts, login is temporarily blocked.

The initial administrator login and password are set during deployment (see the
deployment guide). Change the password immediately after the first login. LDAP
users cannot change their password in the panel — it is managed by the directory.

## 3. Navigation

Administrators see the following sections at the top of the screen:

- **Users** — the main management section.
- **Audit log** — the history of administrator actions.

On the right side of the header are the user name, the language switcher and the
"Log out" button; administrators additionally see "Change password".

Users with the `user` role do not see the administrative sections: they get the
"My tokens" page for managing their own access tokens.

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
4. If needed, leave the "Create and attach a personal token" checkbox enabled and
   set a label (by default, the username).
5. Click "Create".

The password is generated automatically and is never displayed — it is not used,
since login is performed via token. If a token was created, its value is shown
**once** immediately after creation: copy it and give it to the user. After the
window is closed, the value cannot be recovered — you can only create a new
token.

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

### 5.2. Access tokens

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

### 5.3. Topic access rights

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
| Administrator password change | Changing the panel administrator's password. |
| User creation / deletion | Managing ntfy accounts. |
| Token creation / deletion | Managing individual tokens. |
| Delete all tokens | Bulk deletion of tokens. |
| Topic permission assignment / deletion | Managing ACLs. |

> Token values in the log are masked — only part of the string is stored in the
> details.

## 7. Changing the administrator password

Click "Change password" in the header, enter the current and new password (at
least 8 characters) and confirm. The panel administrator's password is not
related to ntfy user passwords.

## 8. Security: recommendations

- Host the panel only behind HTTPS (a reverse proxy).
- Set a persistent `SESSION_SECRET` and `COOKIE_SECURE=true`.
- Restrict network access to the panel (VPN, allowlists).
- Use strong passwords and change them when responsible persons change.
- Regularly review the audit log, paying attention to failed login attempts.
- Do not transmit token values over insecure channels.

## 9. Limitations

- **Users from the ntfy configuration** (`server.yml`) cannot be modified or
  deleted through the panel — they are managed by ntfy.
- **The pseudo-user `*`** (anonymous access) is available only for viewing and
  configuring topic permissions; tokens are not created for it.
- **The ntfy administrator role** does not use permissions on individual topics.
- The panel does not store ntfy user passwords: on creation the password is
  generated and is not shown.

## 10. Authentication of panel users

Authentication is performed by identity providers that are enabled and ordered
through the `AUTH_PROVIDERS` setting (for example `local,ldap`). Providers are
tried in the configured order:

- **local** — accounts stored in the panel database (bcrypt hashes). These are
  administrators.
- **ldap** — binds against an LDAP directory. LDAP users receive the `user` role.

On the first successful LDAP login, the ntfy user can be created automatically
(with a random password and no access tokens) if `LDAP_PROVISION_NTFY_USER=true`.

LDAP users cannot change their password in the panel; it is managed by the
directory.
