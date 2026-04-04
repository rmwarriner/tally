#!/bin/zsh

set -euo pipefail

mode="${1:-all}"

case "$mode" in
  all)
    cat <<'EOF'
Idea:
- create a GitHub issue labeled idea
- do not assign a milestone
- do not add it to the roadmap project

Roadmap:
- use the roadmap issue template
- assign the correct milestone
- add the issue to the roadmap project
- apply subsystem labels

Branch:
- if the work is required to finish the current task correctly, keep it with the current branch
- if it is separate and execution-ready, create a follow-up roadmap or bug/refactor issue
- if it is exploratory, capture it as an idea and keep working
EOF
    ;;
  idea)
    cat <<'EOF'
- create a GitHub issue labeled idea
- capture problem, value, likely area, unknowns, and timing
- do not assign a milestone
- do not add it to the roadmap project
- promote only when the roadmap-ready bar is met
EOF
    ;;
  roadmap)
    cat <<'EOF'
- use the roadmap issue template
- confirm the desired outcome and boundaries are clear
- assign the correct phase milestone
- add the issue to the roadmap project
- apply subsystem labels
- link parent and child issues when the work is part of a larger umbrella item
EOF
    ;;
  branch)
    cat <<'EOF'
- small admin or docs-only changes may go directly to main
- docs/admin work tied to a major feature should stay on that feature branch
- separate execution work should get its own issue and branch
- exploratory work should be captured as an idea instead of branching immediately
EOF
    ;;
  *)
    echo "unknown mode: $mode" >&2
    echo "expected one of: all, idea, roadmap, branch" >&2
    exit 1
    ;;
esac
