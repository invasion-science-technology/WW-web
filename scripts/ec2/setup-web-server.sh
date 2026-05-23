#!/usr/bin/env bash
# One-time EC2 bootstrap: nginx, Node 20, web root, firewall.
# Run on Ubuntu 22.04/24.04 as ubuntu (with sudo).
#
# No domain yet (Elastic IP, HTTP only):
#   sudo bash setup-web-server.sh --ip-only
#
# Subdomain when DNS is ready (recommended vs "folder" on apex):
#   sudo bash setup-web-server.sh --domain prototype.weedwatch.ai --email you@example.com
#
# Or clone the repo and run from scripts/ec2/.

set -euo pipefail

DOMAIN=""
CERTBOT_EMAIL=""
IP_ONLY=0
SKIP_CERTBOT=0
SKIP_UFW=0

usage() {
  cat <<'EOF'
Usage: setup-web-server.sh [options]

Modes (pick one):
  --ip-only              No domain: nginx default server on port 80 (use http://ELASTIC_IP/...)
  --domain NAME          Hostname for server_name + optional HTTPS (e.g. prototype.weedwatch.ai)

Options:
  --email EMAIL          Run certbot when using --domain (requires DNS A record → this EC2)
  --skip-certbot         HTTP only for --domain (DNS not ready)
  --skip-ufw             Do not enable ufw
  -h, --help

Notes:
  - Let's Encrypt cannot issue certs for a bare IP; use --ip-only for HTTP until you have DNS.
  - A "folder" like weedwatch.ai/lab on the SAME host as GitHub Pages needs a reverse proxy
    or moving DNS; easier: A record prototype.weedwatch.ai → Elastic IP, then --domain.
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) CERTBOT_EMAIL="$2"; shift 2 ;;
    --ip-only) IP_ONLY=1; shift ;;
    --skip-certbot) SKIP_CERTBOT=1; shift ;;
    --skip-ufw) SKIP_UFW=1; shift ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ "$IP_ONLY" -eq 1 && -n "$DOMAIN" ]]; then
  echo "ERROR: Use either --ip-only or --domain, not both."
  exit 1
fi

if [[ "$IP_ONLY" -eq 0 && -z "$DOMAIN" ]]; then
  echo "ERROR: Pass --ip-only OR --domain NAME"
  usage
fi

if [[ "$IP_ONLY" -eq 1 ]]; then
  SKIP_CERTBOT=1
elif [[ "$SKIP_CERTBOT" -eq 0 && -z "$CERTBOT_EMAIL" ]]; then
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
if [[ "$IP_ONLY" -eq 1 ]]; then
  NGINX_TEMPLATE="${SCRIPT_DIR}/nginx-weedwatch-ip.conf"
  if [[ ! -f "$NGINX_TEMPLATE" ]]; then
    NGINX_TEMPLATE="/tmp/nginx-weedwatch-ip.conf"
    curl -fsSL "https://raw.githubusercontent.com/invasion-science-technology/WW-web/main/scripts/ec2/nginx-weedwatch-ip.conf" -o "$NGINX_TEMPLATE"
  fi
  sudo cp "$NGINX_TEMPLATE" /etc/nginx/sites-available/weedwatch
else
  NGINX_TEMPLATE="${SCRIPT_DIR}/nginx-weedwatch.conf"
  if [[ ! -f "$NGINX_TEMPLATE" ]]; then
    NGINX_TEMPLATE="/tmp/nginx-weedwatch.conf"
    curl -fsSL "https://raw.githubusercontent.com/invasion-science-technology/WW-web/main/scripts/ec2/nginx-weedwatch.conf" -o "$NGINX_TEMPLATE"
  fi
  sed "s/APP_DOMAIN/${DOMAIN}/g" "$NGINX_TEMPLATE" | sudo tee /etc/nginx/sites-available/weedwatch >/dev/null
fi

sudo ln -sf /etc/nginx/sites-available/weedwatch /etc/nginx/sites-enabled/weedwatch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

if [[ "$IP_ONLY" -eq 0 && "$SKIP_CERTBOT" -eq 0 ]]; then
  echo "==> Obtaining TLS certificate for ${DOMAIN}"
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
fi

if [[ "$SKIP_UFW" -eq 0 ]]; then
  echo "==> Configuring ufw (SSH + HTTP/S)"
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  echo "y" | sudo ufw enable || true
fi

PUBLIC_IP=""
PUBLIC_IP="$(curl -fsSL -s --max-time 3 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)"

echo ""
echo "Web server ready."
echo "  Root: /var/www/weedwatch"
if [[ "$IP_ONLY" -eq 1 ]]; then
  echo "  Mode: Elastic IP / HTTP only (no TLS on bare IP)"
  if [[ -n "$PUBLIC_IP" ]]; then
    echo "  Try:  http://${PUBLIC_IP}/"
    echo "        http://${PUBLIC_IP}/prototype/"
  else
    echo "  Try:  http://<your-elastic-ip>/prototype/"
  fi
  echo ""
  echo "Supabase → Authentication → URL configuration:"
  echo "  Site URL: http://<elastic-ip>"
  echo "  Redirect URLs: http://<elastic-ip>/**"
else
  SCHEME="http"
  [[ "$SKIP_CERTBOT" -eq 0 ]] && SCHEME="https"
  echo "  URL:  ${SCHEME}://${DOMAIN}/"
  echo "        ${SCHEME}://${DOMAIN}/prototype/"
fi
echo ""
echo "Next: install-github-runner.sh, then deploy via GitHub Actions."
