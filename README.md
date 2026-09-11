# Vibe Proxy Docker Deployment

This Compose stack runs the CLI Proxy API backend and its Management Center behind one Nginx edge container. Cloudflare Tunnel publishes the stack over HTTPS, while the existing Tailscale-only listener remains available as a fallback.

## URLs

- Public Management Center: `https://lame-proxy.ordinity.com/`
- Public Proxy API base URL: `https://lame-proxy.ordinity.com/api`
- Public health check: `https://lame-proxy.ordinity.com/healthz`
- Management Center: `http://dell.border-peacock.ts.net:8954/`
- Proxy API base URL: `http://dell.border-peacock.ts.net:8954/api`
- Health check: `http://dell.border-peacock.ts.net:8954/healthz`

The Management Center is configured to use `/api/v0/management` automatically. Enter the `MANAGEMENT_KEY` from `secrets.env` on first login. API clients should use the `PROXY_API_KEY` from the same file as a bearer token.

## Operations

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose down
```

Persistent configuration, OAuth credentials, and logs live under `data/`. The backend hashes the management key in `data/config.yaml` on its first start; retain the original key in `secrets.env`.

The `cloudflared` container uses the named tunnel `lame-proxy` and restarts automatically with Docker. Its secret credentials remain outside the repository at `~/.cloudflared/3111cade-e66f-4a23-b07c-1cdb408678c5.json` and are mounted read-only.

If this host's Tailscale IPv4 address changes, update `BIND_ADDRESS` in `.env` (copy from `.env.example`) and recreate the stack:

```sh
tailscale ip -4
docker compose up -d
```
