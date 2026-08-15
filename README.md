# Vibe Proxy Docker Deployment

This Compose stack runs the CLI Proxy API backend and its Management Center behind one Nginx edge container. Only Nginx is published, bound to `BIND_ADDRESS` on `PORT`.

## URLs

- Management Center: `http://127.0.0.1:8954/`
- Proxy API base URL: `http://127.0.0.1:8954/api`
- Health check: `http://127.0.0.1:8954/healthz`

The Management Center is configured to use `/api/v0/management` automatically. Enter your management key on first login. API clients should use an API key configured in `data/config.yaml` as a bearer token.

## Local setup

```sh
cp .env.example .env
cp secrets.env.example secrets.env
mkdir -p data/auths data/logs
cp CLIProxyAPI/config.example.yaml data/config.yaml
```

Replace all placeholder keys before starting the stack. Neither `.env`, `secrets.env`, nor anything under `data/` is tracked.

## Operations

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose down
```

Persistent configuration, OAuth credentials, and logs live under `data/`. The backend hashes the management key in `data/config.yaml` on its first start; retain the original key somewhere secure.

To expose the stack through Tailscale, set `BIND_ADDRESS` in the ignored `.env` file and recreate the stack:

```sh
tailscale ip -4
docker compose up -d
```
