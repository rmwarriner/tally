#!/bin/zsh

set -euo pipefail

scope="${1:-all}"

print_common() {
  cat <<'EOF'
- validate all external input at the boundary
- do not trust client-supplied actor identity or metadata
- preserve durable audit events for successful financial mutations
- keep structured logging in operational code paths
- add tests for risky validation, auth, and mutation branches
EOF
}

case "$scope" in
  all)
    print_common
    cat <<'EOF'
- confirm secrets and tokens are not logged
- confirm request and response handling respects the security standards docs
EOF
    ;;
  api)
    cat <<'EOF'
- validate content type, body size, and payload schema
- constrain identifiers and reject unsafe path input
- enforce auth and rate limiting at the transport boundary
- ignore spoofed actor fields from request bodies
- return typed errors for validation and authorization failures
EOF
    ;;
  mutation)
    cat <<'EOF'
- emit audit events only for successful financial mutations
- include actor and entity identifiers in audit summaries
- log start, validation failure, success, and unexpected failure paths
- verify rejected commands do not mutate persisted state
- add tests for both success and rejection branches
EOF
    ;;
  *)
    echo "unknown scope: $scope" >&2
    echo "expected one of: all, api, mutation" >&2
    exit 1
    ;;
esac
