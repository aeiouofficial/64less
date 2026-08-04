#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLED_NODE="$ROOT/runtime/node/bin/node"

if [[ -x "$BUNDLED_NODE" ]]; then
  export PATH="$ROOT/runtime/node/bin:$PATH"
  exec "$BUNDLED_NODE" "$ROOT/bin/64less.js" "$@"
fi

exec node "$ROOT/bin/64less.js" "$@"
