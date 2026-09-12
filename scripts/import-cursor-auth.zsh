#!/usr/bin/env zsh
set -euo pipefail

script_dir=${0:A:h}
repo_dir=${script_dir:h}
target_dir="$repo_dir/data/auths"

if ! command -v jq >/dev/null 2>&1; then
  print -u2 'jq is required.'
  exit 1
fi

if [[ -n ${1:-} ]]; then
  state_db=$1
elif [[ $(uname -s) == Darwin ]]; then
  state_db="$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb"
else
  state_db="${XDG_CONFIG_HOME:-$HOME/.config}/Cursor/User/globalStorage/state.vscdb"
fi

if [[ -n ${1:-} && ! -f $state_db ]]; then
  print -u2 "Cursor state database not found: $state_db"
  exit 1
fi

decode_json_string() {
  local raw=$1
  local decoded
  decoded=$(jq -r 'if type == "string" then . else empty end' <<< "$raw" 2>/dev/null || true)
  if [[ -n $decoded ]]; then
    print -r -- "$decoded"
  else
    print -r -- "$raw"
  fi
}

access_token=''
email=''
credential_source=''

if [[ -f $state_db && -x ${commands[sqlite3]:-} ]]; then
  raw_access_token=$(sqlite3 -readonly "$state_db" \
    "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken' LIMIT 1;" 2>/dev/null || true)
  raw_email=$(sqlite3 -readonly "$state_db" \
    "SELECT value FROM ItemTable WHERE key='cursorAuth/cachedEmail' LIMIT 1;" 2>/dev/null || true)
  if [[ -n $raw_access_token ]]; then
    access_token=$(decode_json_string "$raw_access_token")
    email=$(decode_json_string "$raw_email")
    credential_source='Cursor Desktop'
  fi
fi

if [[ -z $access_token && $(uname -s) == Linux ]]; then
  cli_auth_file=${CURSOR_CLI_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/cursor/auth.json}
  if [[ -f $cli_auth_file ]]; then
    access_token=$(jq -r '.accessToken | strings | select(length > 0)' "$cli_auth_file" 2>/dev/null || true)
    cli_config_file="$HOME/.cursor/cli-config.json"
    if [[ -f $cli_config_file ]]; then
      email=$(jq -r '.authInfo.email | strings | select(length > 0)' "$cli_config_file" 2>/dev/null || true)
    fi
    [[ -n $access_token ]] && credential_source='Cursor CLI'
  fi
fi

if [[ -z $access_token ]]; then
  print -u2 'No Cursor Desktop or Cursor CLI access token was found. Sign in and retry.'
  if [[ -f $state_db && ! -x ${commands[sqlite3]:-} ]]; then
    print -u2 'Cursor Desktop token detection also requires sqlite3.'
  fi
  exit 1
fi

mkdir -p "$target_dir"
target="$target_dir/cursor-local.json"
if [[ -e $target ]]; then
  print -u2 "Refusing to overwrite existing credential: $target"
  exit 1
fi

umask 077
temporary=''
cleanup() {
  if [[ -n $temporary && -e $temporary ]]; then
    rm -f -- "$temporary"
  fi
}
trap cleanup EXIT INT TERM

temporary=$(mktemp "${TMPDIR:-/tmp}/vibe-proxy-cursor-auth.XXXXXXXX")
jq -n \
  --arg access_token "$access_token" \
  --arg email "$email" \
  '{type: "cursor", access_token: $access_token, note: "Quota tracking only"}
   + (if $email == "" then {} else {email: $email} end)' > "$temporary"
chmod 600 "$temporary"

if [[ -w $target_dir ]]; then
  mv "$temporary" "$target"
  temporary=''
elif command -v docker >/dev/null 2>&1 && [[ -f "$repo_dir/compose.yaml" ]]; then
  docker compose -f "$repo_dir/compose.yaml" exec -T cli-proxy-api sh -eu -c '
    target=/root/.cli-proxy-api/cursor-local.json
    if [ -e "$target" ]; then
      printf "Refusing to overwrite existing credential: %s\n" "$target" >&2
      exit 1
    fi
    temporary=$(mktemp /root/.cli-proxy-api/.cursor-local.XXXXXXXX)
    trap '\''rm -f -- "$temporary"'\'' EXIT INT TERM
    cat > "$temporary"
    chmod 600 "$temporary"
    mv "$temporary" "$target"
    trap - EXIT INT TERM
  ' < "$temporary"
else
  print -u2 "Cannot write to $target_dir and the Compose service is unavailable."
  exit 1
fi

print "Created $target from $credential_source"
print 'The proxy auth-file watcher will register it automatically.'
