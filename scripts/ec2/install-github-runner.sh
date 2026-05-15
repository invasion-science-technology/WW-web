#!/usr/bin/env bash
# Register and install a repo-level self-hosted GitHub Actions runner (systemd).
# Run on EC2 as ubuntu after setup-web-server.sh.
#
# Get a one-time token (valid ~1 hour):
#   GitHub → Repo → Settings → Actions → Runners → New self-hosted runner → copy token
# Or: gh api -X POST repos/invasion-science-technology/WW-web/actions/runners/registration-token --jq .token
#
#   export RUNNER_TOKEN='...'
#   ./install-github-runner.sh
#
# Optional:
#   GITHUB_REPO=invasion-science-technology/WW-web
#   RUNNER_NAME=weedwatch-ec2-1
#   RUNNER_VERSION=2.322.0

set -euo pipefail

GITHUB_REPO="${GITHUB_REPO:-invasion-science-technology/WW-web}"
RUNNER_NAME="${RUNNER_NAME:-weedwatch-ec2-$(hostname -s)}"
RUNNER_VERSION="${RUNNER_VERSION:-2.322.0}"
RUNNER_DIR="${RUNNER_DIR:-/home/ubuntu/actions-runner}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,weedwatch}"

if [[ -z "${RUNNER_TOKEN:-}" ]]; then
  echo "ERROR: Set RUNNER_TOKEN (one-time registration token from GitHub)."
  echo "  Settings → Actions → Runners → New self-hosted runner"
  exit 1
fi

if [[ -d "$RUNNER_DIR" && -f "$RUNNER_DIR/.runner" ]]; then
  echo "Runner already configured in ${RUNNER_DIR}. To re-register, remove the directory first."
  exit 0
fi

ARCH="x64"
PKG="actions-runner-linux-${ARCH}-${RUNNER_VERSION}.tar.gz"
URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${PKG}"

echo "==> Downloading GitHub Actions runner v${RUNNER_VERSION}"
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"
if [[ ! -f "$PKG" ]]; then
  curl -fsSL -o "$PKG" "$URL"
fi
tar xzf "./${PKG}"

echo "==> Configuring runner for https://github.com/${GITHUB_REPO}"
./config.sh remove --unattended 2>/dev/null || true
./config.sh \
  --url "https://github.com/${GITHUB_REPO}" \
  --token "$RUNNER_TOKEN" \
  --name "$RUNNER_NAME" \
  --labels "$RUNNER_LABELS" \
  --unattended \
  --replace

echo "==> Installing systemd service (runs as $(whoami))"
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status || true

echo ""
echo "Runner installed. Verify in GitHub → Settings → Actions → Runners (green / Idle)."
echo "Labels: ${RUNNER_LABELS}"
