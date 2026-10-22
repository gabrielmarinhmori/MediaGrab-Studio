#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ ! -x .venv/bin/python ] || [ ! -f frontend/dist/index.html ]; then
  /bin/bash ./setup.command
fi
if ! .venv/bin/python scripts/launcher.py start; then
  echo "Could not start MediaGrab Studio. See .runtime/server.log and README.md."
  if [ "$(uname -s)" = Darwin ]; then read -r -p "Press Return to close…" _; fi
  exit 1
fi
