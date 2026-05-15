#!/usr/bin/env bash
# Quick diagnostics on EC2 — run after setup, before/after deploy.

set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/var/www/weedwatch}"

echo "==> Web root: ${WEB_ROOT}"
if [[ ! -d "$WEB_ROOT" ]]; then
  echo "ERROR: directory missing. Run setup-web-server.sh first."
  exit 1
fi

echo "==> Permissions"
ls -ld "$WEB_ROOT"
echo ""
echo "==> Top-level files"
ls -la "$WEB_ROOT" 2>/dev/null | head -20 || echo "(empty or not readable)"

echo ""
if [[ -f "${WEB_ROOT}/index.html" ]]; then
  echo "OK: index.html present"
else
  echo "MISSING: index.html — run a deploy (GitHub Actions or manual build below)"
fi

if [[ -f "${WEB_ROOT}/prototype/index.html" ]]; then
  echo "OK: prototype/index.html present"
else
  echo "MISSING: prototype/index.html — app not published yet"
fi

echo ""
echo "==> Local curl (if nginx is up)"
curl -sI "http://127.0.0.1/" | head -1 || true
curl -sI "http://127.0.0.1/prototype/" | head -1 || true
