#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if [ -x .venv/bin/python ]; then
  .venv/bin/python scripts/launcher.py stop
else
  echo "MediaGrab Studio has not been set up yet."
fi
