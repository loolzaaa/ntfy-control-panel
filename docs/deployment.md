# Deployment Guide

This document describes a complete installation of the ntfy control panel on a
**Linux** server without using containers, in strict order:

1. system packages and Node.js;
2. the ntfy server itself (its own `ntfy` user, standard directories, config and
   systemd service);
3. the panel (its own `ntfy-panel` user, application directory, config and
   systemd service);
4. publishing over HTTPS.

> The panel is supported on **Linux only**. Windows and macOS are not supported.
> The instructions below assume a Debian/Ubuntu-based distribution and a server
> with `sudo` access.

Two different service users are used and must not be confused:

| Service | System user | Data |
|---------|-------------|------|
| ntfy server | `ntfy` | `/etc/ntfy` (config), `/var/lib/ntfy` (user DB), `/var/cache/ntfy` (message cache, attachments) |
| ntfy control panel | `ntfy-panel` | `/opt/ntfy-control-panel` (code), `/var/lib/ntfy-panel` (panel DB) |

## 1. Requirements

| Component | Requirement |
|-----------|------------|
| OS | Linux (the only supported operating system) |
| Node.js | 22 and above (22/24 LTS recommended; required by `ldapts`) |
| ntfy | version 2.x (tested with CLI 2.x, stated for 2.28.0) |
| Port | free TCP port (default 8080 for the panel; 2586 for ntfy) |

If you use different paths, adjust the commands and the `.env` file accordingly.

## 2. Install system packages and Node.js

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg git acl sqlite3 build-essential python3
```

Install Node.js 22 LTS from the NodeSource repository:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify the versions:

```bash
node -v
npm -v
```

## 3. Install and configure the ntfy server

The panel manages ntfy through its CLI, so the ntfy server must be installed,
configured with authentication enabled and running as a service.

### 3.1 Install ntfy

The recommended way on Debian/Ubuntu is the official apt repository:

```bash
sudo mkdir -p /etc/apt/keyrings
sudo curl -L -o /etc/apt/keyrings/ntfy.gpg https://archive.ntfy.sh/apt/keyring.gpg
sudo apt install -y apt-transport-https
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/ntfy.gpg] https://archive.ntfy.sh/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/ntfy.list
sudo apt update
sudo apt install -y ntfy
```

> For ARM replace `arch=amd64` with `arch=arm64` or `arch=armhf`.

Alternatively, install the binary from a release tarball:

```bash
wget https://github.com/binwiederhier/ntfy/releases/download/v2.28.0/ntfy_2.28.0_linux_amd64.tar.gz
tar zxvf ntfy_2.28.0_linux_amd64.tar.gz
sudo install -m 755 ntfy_2.28.0_linux_amd64/ntfy /usr/bin/ntfy
sudo mkdir -p /etc/ntfy
sudo cp ntfy_2.28.0_linux_amd64/{client,server}/*.yml /etc/ntfy/
```

Verify the CLI:

```bash
ntfy --version
```

### 3.2 Create the ntfy user and directories

The ntfy server runs as its own system user `ntfy` and stores its data in
standard locations.

Create the user (the command is idempotent — the apt package may have created it
already):

```bash
id -u ntfy >/dev/null 2>&1 || sudo useradd --system \
  --home-dir /var/lib/ntfy --shell /bin/false \
  --comment "User for the simple HTTP-based pub-sub notification service" ntfy
```

Create the directories and grant ownership to `ntfy`:

```bash
sudo mkdir -p /etc/ntfy /var/lib/ntfy /var/cache/ntfy
sudo chown -R ntfy:ntfy /var/lib/ntfy /var/cache/ntfy
sudo chmod 750 /var/lib/ntfy /var/cache/ntfy
```

- `/etc/ntfy` — configuration (`server.yml`), readable by the `ntfy` user;
- `/var/lib/ntfy` — authentication and access control database (`user.db`);
- `/var/cache/ntfy` — message cache (`cache.db`) and attachments.

### 3.3 Configure ntfy

Create or edit `/etc/ntfy/server.yml` (the paths below are the standard ones):

```yaml
base-url: "https://ntfy.example.com"
listen-http: ":2586"
auth-file: "/var/lib/ntfy/user.db"
auth-default-access: "deny-all"
behind-proxy: true
cache-file: "/var/cache/ntfy/cache.db"
cache-duration: "12h"
web-root: "disable"
enable-signup: false
require-login: true
enable-login: true
```

> `auth-file` enables authentication and access control. With
> `auth-default-access: deny-all`, anonymous clients have no access, so users and
> topic permissions must be granted explicitly (which is exactly what the panel
> is for).

Make sure the `ntfy` user can read the config:

```bash
sudo chown root:ntfy /etc/ntfy/server.yml
sudo chmod 640 /etc/ntfy/server.yml
```

> The ntfy CLI reads `server.yml` on **every** command to locate the auth database
> (`auth-file`) and other settings. The panel relies on this default file, so the
> panel user must also be able to read it; this is configured in step 4.

### 3.4 Create the ntfy systemd service

If you installed ntfy from the apt repository, the unit file is already
installed — skip to enabling it. For a tarball installation, create
`/etc/systemd/system/ntfy.service`:

```ini
[Unit]
Description=ntfy server
After=network.target

[Service]
User=ntfy
Group=ntfy
ExecStart=/usr/bin/ntfy serve --no-log-dates
ExecReload=/bin/kill --signal HUP $MAINPID
Restart=on-failure
AmbientCapabilities=CAP_NET_BIND_SERVICE
LimitNOFILE=10000
PrivateDevices=true
ProtectClock=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
RestrictRealtime=true
ProtectHostname=true

[Install]
WantedBy=multi-user.target
```

Enable and start the ntfy service (a restart is used so that the configuration
from step 3.3 is applied even if the package already started ntfy):

```bash
sudo systemctl daemon-reload
sudo systemctl enable ntfy
sudo systemctl restart ntfy
sudo systemctl status ntfy
```

### 3.5 Verify ntfy

On the first start ntfy creates the auth database. Make sure the CLI can read it:

```bash
sudo ntfy user list
```

> Optionally create an ntfy administrator account for ntfy itself:
> `sudo ntfy user add --role=admin admin`.

At this point the ntfy server is running as the `ntfy` user with its database at
`/var/lib/ntfy/user.db` and its cache at `/var/cache/ntfy/cache.db`.

## 4. Create the panel service user and directories

The panel runs as a separate system user `ntfy-panel`.

```bash
sudo useradd --system --user-group --home-dir /opt/ntfy-control-panel \
  --shell /usr/sbin/nologin ntfy-panel
```

Create the application and data directories:

```bash
sudo mkdir -p /opt/ntfy-control-panel /var/lib/ntfy-panel
sudo chown ntfy-panel:ntfy-panel /var/lib/ntfy-panel
```

The panel invokes the `ntfy` CLI, so `ntfy-panel` must be able to:

- read and write the ntfy auth database and its directory (SQLite also creates
  `-wal`/`-shm` files there);
- read the ntfy configuration file `/etc/ntfy/server.yml` — the CLI loads it on
  every command to locate the auth database; the panel does not override the
  config or database path.

The ntfy files are owned by the `ntfy` group, so the simplest way is to add the
panel user to that group:

```bash
sudo usermod -aG ntfy ntfy-panel
```

Make sure the data directory and its files are group-writable:

```bash
sudo chmod 770 /var/lib/ntfy
sudo chmod -R g+rw /var/lib/ntfy
```

> Group membership is applied to new processes, so restart the panel after this
> (step 8).

As an alternative to group membership, grant access with ACLs:

```bash
sudo setfacl -m u:ntfy-panel:r   /etc/ntfy/server.yml
sudo setfacl -m u:ntfy-panel:rw  /var/lib/ntfy/user.db
sudo setfacl -m u:ntfy-panel:rwx /var/lib/ntfy
```

## 5. Get the application

Clone the repository (or copy the project files) into the application directory:

```bash
sudo git clone <repository-url> /opt/ntfy-control-panel
```

If you copy files instead of cloning:

```bash
sudo rsync -a --delete ./ /opt/ntfy-control-panel/
```

## 6. Install dependencies and build

```bash
cd /opt/ntfy-control-panel
sudo npm run install:all
sudo npm run build
```

`npm run install:all` installs both backend and frontend dependencies, and
`npm run build` compiles the frontend into `client/dist`, which the backend serves
as static files.

## 7. Configure the panel

Create the `.env` file:

```bash
cd /opt/ntfy-control-panel
sudo cp .env.example .env
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fill in `/opt/ntfy-control-panel/.env`:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
TRUST_PROXY=true

# Context path (optional). Empty means the site root.
# Example: BASE_PATH=/ntfy-panel
BASE_PATH=

SESSION_SECRET=<insert the generated value>
SESSION_TTL_HOURS=8
COOKIE_SECURE=auto

PANEL_DB=/var/lib/ntfy-panel/panel.db

BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=<strong password>

AUTH_PROVIDERS=local

# Maximum number of access tokens per ntfy user (default 4)
MAX_TOKENS_PER_USER=4

NTFY_BIN=/usr/bin/ntfy
```

Protect the secrets (systemd reads `EnvironmentFile` as root, so this does not
affect the service):

```bash
sudo chown root:root /opt/ntfy-control-panel/.env
sudo chmod 600 /opt/ntfy-control-panel/.env
```

> `COOKIE_SECURE=auto` sets the Secure flag only for secure requests: HTTPS
> terminated directly, or HTTPS at a reverse proxy with `TRUST_PROXY=true`. Use
> `COOKIE_SECURE=true` to force the flag, or `COOKIE_SECURE=false` for plain
> HTTP (for example, local tests).

### Primary administrator

`BOOTSTRAP_ADMIN_USERNAME` and `BOOTSTRAP_ADMIN_PASSWORD` are **required** — the
panel refuses to start without them.

- On first launch the primary administrator ("root") is created from these values.
- On every subsequent start its password is synchronized with the configured
  value; the primary password is managed **only** by configuration and cannot be
  changed through the panel.
- Use it to create additional local administrators in the "Administrators"
  section and hand their credentials to other people. Additional administrators
  can change their own password in the header.

To change the primary ("root") password, edit `BOOTSTRAP_ADMIN_PASSWORD` and
restart the panel.

### Authentication providers (local / LDAP)

Identity providers are tried in the order listed in `AUTH_PROVIDERS`. To enable
LDAP together with local accounts:

```dotenv
AUTH_PROVIDERS=local,ldap
LDAP_URL=ldaps://ldap.example.com:636
LDAP_BIND_DN=cn=svc,ou=services,dc=example,dc=com
LDAP_BIND_PASSWORD=<service account password>
LDAP_SEARCH_BASE=ou=people,dc=example,dc=com
LDAP_SEARCH_FILTER=(uid={{username}})
LDAP_ATTR_USERNAME=uid
LDAP_ATTR_DISPLAY_NAME=cn
LDAP_ATTR_EMAIL=mail
LDAP_PROVISION_NTFY_USER=true
LDAP_ROLE=user
```

- LDAP users are stored in the panel database with the role `user`; only local
  accounts can be administrators.
- With `LDAP_PROVISION_NTFY_USER=true`, the ntfy user is created automatically on
  the first LDAP login (with a random password and no tokens). LDAP users can
  change their **ntfy** password on the "My tokens" page; their LDAP password is
  managed by the directory.
- Connection mode is chosen by the URL and `LDAP_STARTTLS`:
  - plain: `LDAP_URL=ldap://ldap.example.com:389`, `LDAP_STARTTLS=false`;
  - StartTLS: `LDAP_URL=ldap://ldap.example.com:389`, `LDAP_STARTTLS=true`;
  - TLS: `LDAP_URL=ldaps://ldap.example.com:636` (StartTLS is ignored).
- Set `LDAP_TLS_REJECT_UNAUTHORIZED=false` only for self-signed certificates.
- The panel relies on the ntfy CLI reading the default `/etc/ntfy/server.yml`, so
  the panel user must be able to read it (step 4).
- If LDAP is enabled but `LDAP_URL`, `LDAP_BIND_DN` or `LDAP_SEARCH_BASE` is
  missing, the provider is skipped and an error is written to the log.

Restart the panel after changing authentication settings:

```bash
sudo systemctl restart ntfy-panel
```

### Context path (optional)

To serve the panel under a sub-path (for example, `https://example.com/ntfy-panel/`)
set `BASE_PATH` in `.env`:

```dotenv
BASE_PATH=/ntfy-panel
```

`BASE_PATH` is used by the backend at runtime and by the frontend at build time,
so it must be set **before** building and must stay the same at runtime:

```bash
cd /opt/ntfy-control-panel
sudo npm run build
sudo systemctl restart ntfy-panel
```

With a context path, all endpoints move under it:

- panel: `https://example.com/ntfy-panel/`
- API: `https://example.com/ntfy-panel/api/...`
- health check: `https://example.com/ntfy-panel/healthz` (and `/healthz` at the root)

If the value changes later, rebuild the frontend and restart the service. A request
to `/` is redirected to the context path.

## 8. Create the panel systemd service

Create `/etc/systemd/system/ntfy-panel.service`:

```ini
[Unit]
Description=ntfy Control Panel
After=network.target ntfy.service
Wants=ntfy.service

[Service]
Type=simple
User=ntfy-panel
Group=ntfy-panel
WorkingDirectory=/opt/ntfy-control-panel
EnvironmentFile=/opt/ntfy-control-panel/.env
ExecStart=/usr/bin/node /opt/ntfy-control-panel/server/src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ntfy-panel
sudo systemctl status ntfy-panel
```

Verify the panel responds locally:

```bash
curl http://127.0.0.1:8080/healthz
# expected: {"status":"ok"}
```

## 9. Publish over HTTPS with a reverse proxy

Both services run over HTTP and are designed to be placed behind a reverse proxy
that terminates TLS.

### 9.1 Install nginx and certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 9.2 Publish ntfy itself

If ntfy is not published yet, create `/etc/nginx/sites-available/ntfy`:

```nginx
server {
    listen 80;
    server_name ntfy.example.com;

    location / {
        proxy_pass http://127.0.0.1:2586;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 9.3 Publish the panel

Create `/etc/nginx/sites-available/ntfy-admin`:

```nginx
server {
    listen 80;
    server_name ntfy-admin.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> If the panel is served under a context path (`BASE_PATH=/ntfy-panel`), proxy that
> prefix instead, without a trailing slash on `proxy_pass`, so the path is passed
> through unchanged:
>
> ```nginx
> location /ntfy-panel/ {
>     proxy_pass http://127.0.0.1:8080;
>     proxy_http_version 1.1;
>     proxy_set_header Host $host;
>     proxy_set_header X-Real-IP $remote_addr;
>     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
>     proxy_set_header X-Forwarded-Proto $scheme;
> }
> ```

### 9.4 Enable the sites and obtain certificates

```bash
sudo ln -s /etc/nginx/sites-available/ntfy /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/ntfy-admin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d ntfy.example.com -d ntfy-admin.example.com
```

certbot will add the TLS configuration and the HTTP-to-HTTPS redirect
automatically.

When running behind a proxy, be sure to set `TRUST_PROXY=true` in `.env` —
otherwise the login attempt rate limiter will treat all requests as a single
client.

Open the firewall if needed:

```bash
sudo ufw allow 'Nginx Full'
```

## 10. First login

Open `https://ntfy-admin.example.com` and sign in with the primary administrator
credentials from `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`. This
account ("root") is managed by configuration: its password cannot be changed in
the panel. Use it to create additional local administrators in the
"Administrators" section and hand their credentials to other people.

## 11. Updating

```bash
cd /opt/ntfy-control-panel
sudo git pull            # or copy the new files
sudo npm run install:all
sudo npm run build
sudo systemctl restart ntfy-panel
```

## 12. Backup

The panel data is stored in a single SQLite file (`PANEL_DB`, by default
`/var/lib/ntfy-panel/panel.db`). For a consistent copy, use:

```bash
sqlite3 /var/lib/ntfy-panel/panel.db ".backup '/backup/panel-$(date +%F).db'"
```

The ntfy data is stored in `/var/lib/ntfy/user.db` (users, tokens, permissions)
and `/var/cache/ntfy/cache.db` (message cache), and is backed up using ntfy's own
tools.

## 13. Troubleshooting

| Symptom | Cause and solution |
|---------|-------------------|
| `ntfy_bin_not_found` | `ntfy` not found. Specify the full path in `NTFY_BIN`. |
| `ntfy_auth_file_missing` | The `auth-file` has not been created yet. Start the ntfy server. |
| `ntfy_auth_unconfigured` | The ntfy CLI could not find the auth database. Check that `/etc/ntfy/server.yml` exists, is readable, and defines `auth-file` (or `database-url`). |
| ntfy fails to start: permission denied on `user.db`/`cache.db` | Check ownership: `sudo chown -R ntfy:ntfy /var/lib/ntfy /var/cache/ntfy`. |
| `SQLITE_READONLY` / `attempt to write a readonly database` | The panel user cannot write the ntfy DB. Grant access (step 4). |
| `server.yml: permission denied` | The panel user cannot read the ntfy config. Add it to the `ntfy` group (step 4) or grant an ACL, then restart the panel. |
| All requests from one IP in the rate limit | Enable `TRUST_PROXY=true` behind a proxy. |
| Session resets on restart | Set a persistent `SESSION_SECRET`. |
| Cookie is not sent | With `COOKIE_SECURE=true`, HTTPS is required. |
| `SQLITE_BUSY` during frequent operations | Operations are already serialized; check permissions on the ntfy DB file. |
| `better-sqlite3` fails to install | Install build tools (`build-essential`, `python3`) or use a Node.js version for which a prebuilt binary exists. |

Service logs:

```bash
sudo journalctl -u ntfy -f
sudo journalctl -u ntfy-panel -f
```

## 14. Post-deployment verification (acceptance criteria)

1. `sudo systemctl status ntfy` shows the ntfy server running as the `ntfy` user.
2. `sudo systemctl status ntfy-panel` shows the panel running as `ntfy-panel`.
3. The panel opens over HTTPS, and an administrator logs in.
4. The list of ntfy users is displayed and search by name works.
5. Creating a user succeeds and the generated ntfy password is shown once (with a QR code).
6. The ntfy password can be reset (generated or custom) in the user card, and tokens are created and deleted there (individually and all at once).
7. Topic permissions are assigned, changed and deleted.
8. Deleting a user proceeds with confirmation.
9. An additional panel administrator is created, can log in, and the primary administrator cannot be deleted.
10. The audit log contains all performed operations.
