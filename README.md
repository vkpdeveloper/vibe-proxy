# Vibe Proxy Docker Deployment

This Compose stack runs the CLI Proxy API backend and its Management Center behind one Nginx edge container. Cloudflare Tunnel publishes the stack over HTTPS, while the existing Tailscale-only listener remains available as a fallback.

## URLs

- Public Management Center: `https://lame-proxy.ordinity.com/`
- Public Proxy API base URL: `https://lame-proxy.ordinity.com/api`
- Public health check: `https://lame-proxy.ordinity.com/healthz`
- Management Center: `http://dell.border-peacock.ts.net:8954/`
- Proxy API base URL: `http://dell.border-peacock.ts.net:8954/api`
- Health check: `http://dell.border-peacock.ts.net:8954/healthz`

The Management Center is configured to use `/api/v0/management` automatically. Log in with the `MANAGEMENT_KEY` from `secrets.env`; it is the only key that opens the dashboard. Compose passes it to the backend, which treats it as authoritative: the `remote-management.secret-key` in `data/config.yaml`, client API keys, and the local password are all rejected. The backend refuses to start if `MANAGEMENT_KEY` is missing. API clients should use the `PROXY_API_KEY` from the same file as a bearer token.

## Operations

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose down
```

Persistent configuration, OAuth credentials, and logs live under `data/`. To change the dashboard key, update `MANAGEMENT_KEY` in `secrets.env` and recreate the `cli-proxy-api` container.

### Cursor usage tracking

Cursor usage is shown beside the other providers on the Quota Management page. The card separates the monthly Cursor Models and Other Models pools, plus Cursor's independent Grok Bot weekly meter and its reset when available. It is a tracker-only integration: the credential is used to read Cursor's dashboard usage and is not used to route proxy requests. The backend caches Cursor, OpenCode Go, and xAI usage snapshots every five minutes; a manual refresh remains immediate.

On the machine where Cursor Desktop, or the Cursor CLI on Linux, is signed in, import its locally stored access token:

```sh
zsh scripts/import-cursor-auth.zsh
```

The script checks Cursor Desktop's `state.vscdb`, then falls back to the Cursor CLI's `~/.config/cursor/auth.json` on Linux. It writes an owner-only `data/auths/cursor-local.json` and never prints the token. When the bind-mounted auth directory is container-owned, it installs the file through the running `cli-proxy-api` Compose service rather than weakening directory permissions. The auth-file watcher registers it automatically; refresh the Management Center and open Quota Management → Cursor. You may pass a custom `state.vscdb` path as the first argument.

Cursor's individual dashboard API is undocumented and may change. A `401` or `403` usually means Cursor rotated the local token; remove the old `cursor-local.json` and run the importer again after signing in.

### OpenCode Go usage tracking

Open **Logins → Other login methods → OpenCode Go**, paste an OpenCode Go API
key, and optionally add the account email used to label the card. Vibe Proxy
stores the key in its private auth directory and tracks the subscription's
shared 5-hour, weekly, and monthly usage windows. OpenCode's usage endpoint does
not report a per-model split, so the Management Center presents the three
accurate shared pools rather than estimated model-specific usage.
The backend refreshes and stores the latest OpenCode Go snapshot on the same
five-minute schedule as Cursor and xAI, so it is restored without a browser-side
request after page reloads.

### Devin CLI usage tracking

Devin CLI usage is shown beside the other providers on the Quota Management page. The card shows the plan name, daily and weekly quota meters with their reset times, and any extra-usage balance. It is a tracker-only integration: the credential reads Devin's seat-management status and is never used to route proxy requests. The backend caches Devin CLI, Cursor, OpenCode Go, and xAI usage snapshots every five minutes; a manual refresh remains immediate.

On the machine where Devin CLI is signed in, import its locally stored session token:

```sh
zsh scripts/import-devin-auth.zsh
```

The script reads `windsurf_api_key` (and a custom `api_server_url`, when configured) from `~/.local/share/devin/credentials.toml`, falling back to the Devin desktop app's `state.vscdb` on macOS. It writes an owner-only `data/auths/devin-cli.json` and never prints the token. When the bind-mounted auth directory is container-owned, it installs the file through the running `cli-proxy-api` Compose service rather than weakening directory permissions. You may pass a custom `credentials.toml` path as the first argument. Alternatively, paste the token under **Logins → Other login methods → Devin CLI**, which also accepts an optional `https://` API server URL.

The seat-management endpoint is undocumented and may change. A `400`/`401` usually means the session token expired; remove the old `devin-cli.json` and import again after `devin login`.

The `cloudflared` container uses the named tunnel `lame-proxy` and restarts automatically with Docker. Its secret credentials remain outside the repository at `~/.cloudflared/3111cade-e66f-4a23-b07c-1cdb408678c5.json` and are mounted read-only.

If this host's Tailscale IPv4 address changes, update `BIND_ADDRESS` in `.env` (copy from `.env.example`) and recreate the stack:

```sh
tailscale ip -4
docker compose up -d
```
