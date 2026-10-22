#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
fail() { echo; echo "Setup stopped: $*"; echo "See README.md for help."; if [ "$(uname -s)" = Darwin ]; then read -r -p "Press Return to close…" _; fi; exit 1; }
trap 'fail "A dependency could not be installed. Check the message above and your internet connection, then run setup.command again."' ERR
if [ "$(uname -s)" = Darwin ]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  missing=()
  command -v python3 >/dev/null 2>&1 || missing+=(python)
  command -v node >/dev/null 2>&1 || missing+=(node)
  command -v ffmpeg >/dev/null 2>&1 || missing+=(ffmpeg)
  if command -v python3 >/dev/null 2>&1 && ! python3 -c 'import sys; assert sys.version_info >= (3,10)' 2>/dev/null; then missing+=(python); fi
  if command -v node >/dev/null 2>&1 && ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)' 2>/dev/null; then missing+=(node); fi
  if [ ${#missing[@]} -gt 0 ]; then
    command -v brew >/dev/null 2>&1 || fail "Install the free Homebrew package manager from https://brew.sh, then double-click setup.command again. Needed: ${missing[*]}"
    brew install "${missing[@]}"
    if [ -x "$(brew --prefix python 2>/dev/null)/libexec/bin/python3" ]; then export PATH="$(brew --prefix python)/libexec/bin:$PATH"; fi
  fi
fi
command -v python3 >/dev/null || fail "Python 3.10 or newer is required."
command -v node >/dev/null || fail "Node.js 22.12 or newer is required."
command -v npm >/dev/null || fail "npm is missing. Reinstall Node.js."
command -v ffmpeg >/dev/null || fail "FFmpeg is required. On a Mac: brew install ffmpeg"
python3 -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10 or newer is required"'
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(!(a>22||(a===22&&b>=12)||(a===20&&b>=19)))throw Error("Use Node.js 22.12+ or 20.19+")'
echo "Preparing MediaGrab Studio…"
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci --prefix frontend
npm run build --prefix frontend
.venv/bin/python -c 'from backend.app import app; from backend.media import download_options; assert app'
echo
echo "Setup complete. Double-click start.command to open MediaGrab Studio."
