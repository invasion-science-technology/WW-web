#!/usr/bin/env bash
# Sync Next static export (out/) to nginx web root. Used by CI and manual deploys.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_ROOT="${WEB_ROOT:-/var/www/weedwatch}"
OUT_DIR="${OUT_DIR:-${ROOT}/out}"

if [[ ! -d "$OUT_DIR" ]]; then
  echo "ERROR: Missing ${OUT_DIR}. Run: STATIC_EXPORT=1 npm run build"
  exit 1
fi

echo "==> Publishing ${OUT_DIR} → ${WEB_ROOT}"
rsync -av --delete "${OUT_DIR}/" "${WEB_ROOT}/"
echo "Done. $(date -u +%Y-%m-%dT%H:%M:%SZ)"
