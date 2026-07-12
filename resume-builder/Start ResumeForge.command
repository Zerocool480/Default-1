#!/bin/bash
# Double-click this file to start ResumeForge on your Mac.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  ResumeForge needs Node.js (free, one-time install)."
  echo "  Get it at:  https://nodejs.org  — download the LTS version, install, then double-click this file again."
  echo ""
  read -r -p "Press Enter to close..."
  exit 1
fi

( sleep 1 && open "http://127.0.0.1:7777" ) &
exec node server.js
