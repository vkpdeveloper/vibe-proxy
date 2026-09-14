#!/usr/bin/env zsh
set -euo pipefail

script_dir=${0:A:h}
repo_dir=${script_dir:h}
target_dir="$repo_dir/data/auths"
default_api_server='https://server.codeium.com'

if ! command -v jq >/dev/null 2>&1; then
  print -u2 'jq is required.'
  exit 1
fi

if [[ -n ${1:-} ]]; then
  credentials_file=$1
elif [[ -n ${XDG_DATA_HOME:-} && -f "$XDG_DATA_HOME/devin/credentials.toml" ]]; then
  credentials_file="$XDG_DATA_HOME/devin/credentials.toml"
else
  credentials_file="$HOME/.local/share/devin/credentials.toml"
fi

api_key=''
api_server_url=''
email=''
credential_source=''

toml_string() {
  local key=$1 file=$2
  sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"\(.*\)\"[[:space:]]*\$/\1/p" "$file" | head -n 1
}

if [[ -f $credentials_file ]]; then
  api_key=$(toml_string windsurf_api_key "$credentials_file")
  api_server_url=$(toml_string api_server_url "$credentials_file")
  [[ -n $api_key ]] && credential_source="Devin CLI ($credentials_file)"
elif [[ -n ${1:-} ]]; then
  print -u2 "Devin credentials file not found: $credentials_file"
  exit 1
fi

if [[ -z $api_key && $(uname -s) == Darwin && -x ${commands[sqlite3]:-} ]]; then
  state_db="$HOME/Library/Application Support/Devin/User/globalStorage/state.vscdb"
  if [[ -f $state_db ]]; then
    auth_status=$(sqlite3 -readonly "$state_db" \
      "SELECT value FROM ItemTable WHERE key='windsurfAuthStatus' LIMIT 1;" 2>/dev/null || true)
    if [[ -n $auth_status ]]; then
      api_key=$(jq -r '.apiKey | strings | select(length > 0)' <<< "$auth_status" 2>/dev/null || true)
      email=$(jq -r '.email | strings | select(length > 0)' <<< "$auth_status" 2>/dev/null || true)
      [[ -n $api_key ]] && credential_source='Devin desktop app'
    fi
  fi
fi

if [[ -z $api_key ]]; then
  print -u2 'No Devin CLI session token was found. Run `devin login` and retry.'
  exit 1
fi

# credentials.toml carries no email on Linux; ask GetUserStatus for the
# account email so cards title by identity instead of the filename.
if [[ -z $email ]] && command -v curl >/dev/null 2>&1; then
  status_url="${api_server_url:-$default_api_server}/exa.seat_management_pb.SeatManagementService/GetUserStatus"
  user_status=$(curl -fsS -m 10 -X POST "$status_url" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -H 'Connect-Protocol-Version: 1' \
    --data "$(jq -n --arg api_key "$api_key" \
      '{metadata: {apiKey: $api_key, ideName: "devin", ideVersion: "1.108.2", extensionName: "devin", extensionVersion: "1.108.2", locale: "en"}}')" \
    2>/dev/null || true)
  if [[ -n $user_status ]]; then
    email=$(jq -r '.userStatus.email | strings | select(length > 0)' <<< "$user_status" 2>/dev/null || true)
  fi
fi

mkdir -p "$target_dir"
target="$target_dir/devin-cli.json"
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

temporary=$(mktemp "${TMPDIR:-/tmp}/vibe-proxy-devin-auth.XXXXXXXX")
jq -n \
  --arg api_key "$api_key" \
  --arg api_server_url "$api_server_url" \
  --arg default_api_server "$default_api_server" \
  --arg email "$email" \
  '{type: "devin-cli", auth_kind: "api_key", api_key: $api_key, note: "Quota tracking only"}
   + (if $api_server_url == "" or $api_server_url == $default_api_server then {}
      else {api_server_url: $api_server_url} end)
   + (if $email == "" then {} else {email: $email} end)' > "$temporary"
chmod 600 "$temporary"

if [[ -w $target_dir ]]; then
  mv "$temporary" "$target"
  temporary=''
elif command -v docker >/dev/null 2>&1 && [[ -f "$repo_dir/compose.yaml" ]]; then
  docker compose -f "$repo_dir/compose.yaml" exec -T cli-proxy-api sh -eu -c '
    target=/root/.cli-proxy-api/devin-cli.json
    if [ -e "$target" ]; then
      printf "Refusing to overwrite existing credential: %s\n" "$target" >&2
      exit 1
    fi
    temporary=$(mktemp /root/.cli-proxy-api/.devin-cli.XXXXXXXX)
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
