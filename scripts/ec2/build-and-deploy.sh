#!/usr/bin/env bash
# Build static export with Supabase env vars and publish to nginx web root.
#
# On EC2:
#   cp env.ec2.example .env.ec2
#   nano .env.ec2   # set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
#   bash scripts/ec2/build-and-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-$ROOT/.env.ec2}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  echo "==> Loaded ${ENV_FILE}"
else
  echo "ERROR: Missing ${ENV_FILE}"
  echo "  cp env.ec2.example .env.ec2"
  echo "  Add your Supabase URL and anon key from Dashboard → Project Settings → API"
  exit 1
fi

for var in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: ${var} is empty in ${ENV_FILE}"
    exit 1
  fi
done

# EC2 host: no GitHub Pages base path
unset NEXT_PUBLIC_BASE_PATH
export STATIC_EXPORT=1

echo "==> npm ci"
npm ci

echo "==> npm run build (Supabase keys embedded)"
npm run build

WEB_ROOT="${WEB_ROOT:-/var/www/weedwatch}"
echo "==> rsync → ${WEB_ROOT}"
rsync -av --delete out/ "${WEB_ROOT}/"

if grep -q 'qaahbubaqcfhsicqlsov\|supabase\.co' "${WEB_ROOT}/prototype/index.html" 2>/dev/null || \
   find "${WEB_ROOT}/_next" -name '*.js' -exec grep -l 'supabase\.co' {} \; 2>/dev/null | head -1 | grep -q .; then
  echo "OK: Supabase URL found in built assets."
else
  echo "WARN: Could not verify Supabase in output — check .env.ec2 values and rebuild."
fi

echo ""
echo "Done. Hard-refresh https://<your-ip>/prototype/"
echo "Login header should show 'Field lab · Account' (not Demo)."
