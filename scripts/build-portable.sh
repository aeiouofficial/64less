#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/dist/64less-portable}"
NODE_BIN="$(readlink -f "$(command -v node)")"
NODE_PREFIX="$(cd -- "$(dirname -- "$NODE_BIN")/.." && pwd)"

rm -rf "$OUTPUT"
mkdir -p "$OUTPUT"

# Copy the repository without generated QA sessions or a previously staged Node runtime.
(
  cd "$ROOT"
  tar \
    --exclude='./.git' \
    --exclude='./dist' \
    --exclude='./runtime/node' \
    --exclude='./.64less' \
    -cf - .
) | (cd "$OUTPUT" && tar -xf -)

mkdir -p "$OUTPUT/runtime/node/bin" "$OUTPUT/runtime/node/lib/node_modules" "$OUTPUT/runtime/licenses"
cp "$NODE_BIN" "$OUTPUT/runtime/node/bin/node"
cp -a "$NODE_PREFIX/lib/node_modules/npm" "$OUTPUT/runtime/node/lib/node_modules/npm"
ln -s ../lib/node_modules/npm/bin/npm-cli.js "$OUTPUT/runtime/node/bin/npm"
ln -s ../lib/node_modules/npm/bin/npx-cli.js "$OUTPUT/runtime/node/bin/npx"

if [[ -d "$NODE_PREFIX/lib/node_modules/corepack" ]]; then
  cp -a "$NODE_PREFIX/lib/node_modules/corepack" "$OUTPUT/runtime/node/lib/node_modules/corepack"
  ln -s ../lib/node_modules/corepack/dist/corepack.js "$OUTPUT/runtime/node/bin/corepack"
fi

cp "$NODE_PREFIX/LICENSE" "$OUTPUT/runtime/licenses/NODE_LICENSE.txt"
NODE_SHA="$(sha256sum "$NODE_BIN" | awk '{print $1}')"
cat > "$OUTPUT/runtime/MANIFEST.json" <<JSON
{
  "bundleFormat": 1,
  "64lessVersion": "$(node -p "require('$ROOT/package.json').version")",
  "node": {
    "version": "$(node --version)",
    "sha256": "$NODE_SHA",
    "license": "runtime/licenses/NODE_LICENSE.txt"
  },
  "bundled": [
    "Node.js runtime",
    "npm",
    "npx",
    "corepack when present",
    "64less XTest helper"
  ],
  "discoveredAtRuntime": [
    "Chromium",
    "FFmpeg",
    "Xvfb or an existing X11 display",
    "Openbox",
    "xterm",
    "wmctrl"
  ]
}
JSON

printf 'portable bundle staged at %s\n' "$OUTPUT"
