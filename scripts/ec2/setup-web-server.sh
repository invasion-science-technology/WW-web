#!/usr/bin/env bash
# One-time EC2 bootstrap: nginx, Node 20, web root, firewall.
# Run on Ubuntu 22.04/24.04 as ubuntu (with sudo).
#
#   curl -fsSL https://raw.githubusercontent.com/invasion-science-technology/WW-web/main/scripts/ec2/setup-web-server.sh | bash -s -- \
#     --domain app.weedwatch.ai --email you@example.com
#
# Or clone the repo and run from scripts/ec2/.

set -euo pipefail

DOMAIN=""
CERTBOT_EMAIL=""
SKIP_CERTBOT=0
SKIP_UFW=0

usage() {
  sed -n '2,8p' "$0"
  echo ""
  echo "Options:"
  echo "  --domain DOMAIN       Required. e.g. app.weedwatch.ai"
  echo "  --email EMAIL         If set, run certbot --nginx after nginx is up"
  echo "  --skip-certbot        Only HTTP (port 80); use for DNS-not-ready-yet"
  echo "  --skip-ufw            Do not enable ufw"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) CERTBOT_EMAIL="$2"; shift 2 ;;
    --skip-certbot) SKIP_CERTBOT=1; shift ;;
    --skip-ufw) SKIP_UFW=1; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: --domain is required"
  usage
fi

if [[ "$SKIP_CERTBOT" -eq 0 && -z "$CERTBOT_EMAIL" ]]; then
  echo "WARN: No --email; skipping HTTPS. Re-run with --email when DNS points here."
  SKIP_CERTBOT=1
fi

echo "==> Updating packages"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

echo "==> Installing nginx, certbot, build tools"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  nginx certbot python3-certbot-nginx curl ca-certificates gnupg rsync

echo "==> Installing Node.js 20 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs
fi
echo "Node $(node -v), npm $(npm -v)"

echo "==> Web root /var/www/weedwatch"
sudo mkdir -p /var/www/weedwatch
sudo chown ubuntu:www-data /var/www/weedwatch
sudo chmod 2775 /var/www/weedwatch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_TEMPLATE="${SCRIPT_DIR}/nginx-weedwatch.conf"
if [[ ! -f "$NGINX_TEMPLATE" ]]; then
  NGINX_TEMPLATE="/tmp/nginx-weedwatch.conf"
  curl -fsSL "https://raw.githubusercontent.com/invasion-science-technology/WW-web/main/scripts/ec2/nginx-weedwatch.conf" -o "$NGINX_TEMPLATE"
fi

sed "s/APP_DOMAIN/${DOMAIN}/g" "$NGINX_TEMPLATE" | sudo tee /etc/nginx/sites-available/weedwatch >/dev/null
sudo ln -sf /etc/nginx/sites-available/weedwatch /etc/nginx/sites-enabled/weedwatch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

if [[ "$SKIP_CERTBOT" -eq 0 ]]; then
  echo "==> Obtaining TLS certificate for ${DOMAIN}"
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
fi

if [[ "$SKIP_UFW" -eq 0 ]]; then
  echo "==> Configuring ufw (SSH + HTTP/S)"
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  echo "y" | sudo ufw enable || true
fi

echo ""
echo "Web server ready."
echo "  Root:  /var/www/weedwatch"
echo "  URL:   http://${DOMAIN}/ (HTTPS if certbot ran)"
echo "Next: run scripts/ec2/install-github-runner.sh with a GitHub registration token."
