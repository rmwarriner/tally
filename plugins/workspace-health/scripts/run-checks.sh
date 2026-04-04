#!/bin/zsh

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <quick|typecheck|test|coverage|ci> [test-path]" >&2
  exit 1
fi

mode="$1"
shift || true

case "$mode" in
  quick)
    exec pnpm typecheck
    ;;
  typecheck)
    exec pnpm typecheck
    ;;
  test)
    if [[ $# -gt 0 ]]; then
      exec pnpm test "$1"
    fi
    exec pnpm test
    ;;
  coverage)
    exec pnpm coverage
    ;;
  ci)
    exec pnpm ci:verify
    ;;
  *)
    echo "unknown mode: $mode" >&2
    echo "expected one of: quick, typecheck, test, coverage, ci" >&2
    exit 1
    ;;
esac
