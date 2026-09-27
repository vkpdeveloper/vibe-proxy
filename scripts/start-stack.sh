#!/usr/bin/env bash
set -euo pipefail

cd /home/vaibhav/Developer/docker/vibe-proxy

# The user service can start before Docker and Tailscale finish booting.
for ((attempt = 1; attempt <= 60; attempt++)); do
  if docker info >/dev/null 2>&1 && tailscale ip -4 >/dev/null 2>&1; then
    break
  fi
  if ((attempt == 60)); then
    echo 'Docker or Tailscale did not become ready within five minutes' >&2
    exit 1
  fi
  sleep 5
done

# Bind the fallback listener to the current Tailscale address on every boot.
export BIND_ADDRESS="$(tailscale ip -4)"

# Recreate all three containers so a stale Docker network attachment is repaired.
docker compose up -d --no-build --force-recreate

for ((attempt = 1; attempt <= 30; attempt++)); do
  if curl --fail --silent --show-error --max-time 3 \
    "http://${BIND_ADDRESS:-100.75.80.66}:${PORT:-8954}/healthz" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 2
done

echo 'Vibe Proxy did not pass its local health check' >&2
exit 1
