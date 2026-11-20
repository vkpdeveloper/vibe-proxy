#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
source ./secrets.env
set +a
: "${MANAGEMENT_KEY:?MANAGEMENT_KEY is missing from secrets.env}"

export PROXY_URL="${PROXY_URL:-http://$(tailscale ip -4):${PORT:-8954}}"

python3 - <<'PY'
import json
import os
import re
import urllib.request


def request(url, *, method="GET", data=None, headers=None):
    req = urllib.request.Request(url, method=method, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response), response.headers


def version(value):
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value):
        raise ValueError(f"Expected a stable Claude Code version, got {value!r}")
    return tuple(map(int, value.split(".")))


# Resolve the publisher's stable tag, never a prerelease or a local CLI install.
release, _ = request("https://registry.npmjs.org/@anthropic-ai/claude-code/latest")
if release["name"] != "@anthropic-ai/claude-code":
    raise ValueError("Unexpected npm package")
latest = release["version"]
latest_version = version(latest)

base = os.environ["PROXY_URL"].rstrip("/") + "/api/v8/management/config"
headers = {"Authorization": "Bearer " + os.environ["MANAGEMENT_KEY"]}
config, response_headers = request(base, headers=headers)
current = config.get("upstream", {}).get("claude", {}).get("header-defaults", {}).get("user-agent")
if current is None:
    current = config.get("oauth", {}).get("providers", {}).get("claude", {}).get("header-defaults", {}).get("user-agent")
if current:
    match = re.fullmatch(r"claude-cli/([0-9]+\.[0-9]+\.[0-9]+) \(external, cli\)", current)
    if not match:
        raise ValueError("Custom Claude user-agent configured; refusing to overwrite it")
    if version(match[1]) >= latest_version:
        print(f"Claude Code pin already current: {match[1]} (npm latest: {latest})")
        raise SystemExit(0)

etag = response_headers.get("ETag")
if not etag:
    raise ValueError("Proxy did not return a config ETag; refusing an unguarded write")
user_agent = f"claude-cli/{latest} (external, cli)"
request(
    base + "/upstream/claude",
    method="PATCH",
    data=json.dumps({"header-defaults": {"user-agent": user_agent}}).encode(),
    headers={**headers, "Content-Type": "application/json", "If-Match": etag},
)
saved, _ = request(base + "/upstream/claude/header-defaults/user-agent", headers=headers)
if saved != user_agent:
    raise ValueError("Claude Code pin readback did not match the update")
print(f"Claude Code pin updated to {latest}; proxy hot reloads the saved config")
PY
