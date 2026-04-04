#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/setup-local.py "$@"
fi

if command -v python >/dev/null 2>&1; then
  exec python scripts/setup-local.py "$@"
fi

echo "Python 3 is required to run scripts/setup-local.py"
exit 1
