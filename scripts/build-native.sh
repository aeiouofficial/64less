#!/usr/bin/env bash
set -euo pipefail
mkdir -p runtime/bin
cc native/x11/64less-input.c -O2 -Wall -Wextra -lX11 -Wl,-l:libXtst.so.6 -Wl,-l:libXext.so.6 -o runtime/bin/64less-input
printf 'built runtime/bin/64less-input\n'
