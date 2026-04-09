#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Get a Tally CLI token.

Usage:
  scripts/get-cli-token.sh [--mode auto|managed|env|file|none] [options]

Modes:
  auto     First available of: TALLY_TOKEN -> TALLY_API_AUTH_TOKEN -> TALLY_API_AUTH_TOKEN_FILE -> managed mint
  managed  Create a managed token via POST /api/tokens (requires admin token)
  env      Print TALLY_TOKEN (or TALLY_API_AUTH_TOKEN)
  file     Print token from TALLY_API_AUTH_TOKEN_FILE
  none     Print __TALLY_NO_AUTH__ for local no-auth API mode

Options:
  --api-url <url>         API base URL (default: $TALLY_API_URL or http://127.0.0.1:4000)
  --admin-token <token>   Admin/local-admin bearer token used to mint managed tokens
                          (or set TALLY_ADMIN_TOKEN)
  --actor <name>          Actor for managed token (default: $USER or cli-user)
  --role <admin|member>   Role for managed token (default: admin)
  --print-export          Print as: export TALLY_TOKEN=...
  -h, --help              Show help

Examples:
  scripts/get-cli-token.sh --mode none --print-export
  scripts/get-cli-token.sh --mode managed --admin-token "$BOOTSTRAP_TOKEN" --actor robert --role admin --print-export
  export TALLY_TOKEN="$(scripts/get-cli-token.sh --mode auto)"
EOF
}

MODE="auto"
API_URL="${TALLY_API_URL:-http://127.0.0.1:4000}"
ADMIN_TOKEN="${TALLY_ADMIN_TOKEN:-}"
ACTOR="${USER:-cli-user}"
ROLE="admin"
PRINT_EXPORT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"; shift 2 ;;
    --api-url)
      API_URL="${2:-}"; shift 2 ;;
    --admin-token)
      ADMIN_TOKEN="${2:-}"; shift 2 ;;
    --actor)
      ACTOR="${2:-}"; shift 2 ;;
    --role)
      ROLE="${2:-}"; shift 2 ;;
    --print-export)
      PRINT_EXPORT=true; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1 ;;
  esac
done

if [[ "$ROLE" != "admin" && "$ROLE" != "member" ]]; then
  echo "error: --role must be admin or member" >&2
  exit 1
fi

print_token() {
  local token="$1"
  if [[ "$PRINT_EXPORT" == "true" ]]; then
    printf 'export TALLY_TOKEN=%q\n' "$token"
  else
    printf '%s\n' "$token"
  fi
}

token_from_env() {
  if [[ -n "${TALLY_TOKEN:-}" ]]; then
    print_token "$TALLY_TOKEN"
    return 0
  fi
  if [[ -n "${TALLY_API_AUTH_TOKEN:-}" ]]; then
    print_token "$TALLY_API_AUTH_TOKEN"
    return 0
  fi
  return 1
}

token_from_file() {
  local token_file="${TALLY_API_AUTH_TOKEN_FILE:-}"
  if [[ -z "$token_file" ]]; then
    return 1
  fi
  if [[ ! -f "$token_file" ]]; then
    echo "error: TALLY_API_AUTH_TOKEN_FILE does not exist: $token_file" >&2
    exit 1
  fi
  local value
  value="$(tr -d '\r\n' < "$token_file")"
  if [[ -z "$value" ]]; then
    echo "error: token file is empty: $token_file" >&2
    exit 1
  fi
  print_token "$value"
}

mint_managed_token() {
  if [[ -z "$ADMIN_TOKEN" ]]; then
    if [[ -n "${TALLY_TOKEN:-}" ]]; then
      ADMIN_TOKEN="$TALLY_TOKEN"
    elif [[ -n "${TALLY_API_AUTH_TOKEN:-}" ]]; then
      ADMIN_TOKEN="$TALLY_API_AUTH_TOKEN"
    fi
  fi

  if [[ -z "$ADMIN_TOKEN" ]]; then
    echo "error: managed mode requires --admin-token or TALLY_ADMIN_TOKEN (or pre-set TALLY_TOKEN)." >&2
    exit 1
  fi

  local response
  response="$(
    curl -sS -X POST "${API_URL%/}/api/tokens" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"payload\":{\"actor\":\"$ACTOR\",\"role\":\"$ROLE\"}}"
  )"

  local secret
  secret="$(node -e 'const fs=require("fs"); const raw=fs.readFileSync(0,"utf8"); const body=JSON.parse(raw); if (body?.secret) { process.stdout.write(String(body.secret)); process.exit(0); } if (body?.error?.message) { console.error(`error: ${body.error.message}`); process.exit(1); } console.error("error: failed to create managed token"); process.exit(1);' <<< "$response")"

  if [[ -z "$secret" ]]; then
    echo "error: managed token creation returned an empty secret" >&2
    exit 1
  fi

  print_token "$secret"
}

case "$MODE" in
  none)
    echo "warning: __TALLY_NO_AUTH__ is a CLI-only sentinel. Do not send it in an Authorization header with curl." >&2
    print_token "__TALLY_NO_AUTH__"
    ;;
  env)
    token_from_env || { echo "error: neither TALLY_TOKEN nor TALLY_API_AUTH_TOKEN is set" >&2; exit 1; }
    ;;
  file)
    token_from_file
    ;;
  managed)
    mint_managed_token
    ;;
  auto)
    token_from_env || token_from_file || mint_managed_token
    ;;
  *)
    echo "error: unsupported mode '$MODE'" >&2
    usage
    exit 1
    ;;
esac
