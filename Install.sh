#!/usr/bin/env bash
# One-click installer for chachaji-free-panel (Ubuntu 22.04 / 24.04).
#   curl -fsSL https://raw.githubusercontent.com/aksh93356-alt/chachaji-free-panel/main/install.sh | sudo bash
# Optional: DOMAIN=panel.example.com  (adds free HTTPS with Caddy)
set -euo pipefail

REPO="${REPO:-https://github.com/aksh93356-alt/chachaji-free-panel.git}"
DIR="${DIR:-/opt/chachaji-free-panel}"

main() {
  [ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo bash install.sh"; exit 1; }
  . /etc/os-release
  [ "$ID" = "ubuntu" ] || echo "Warning: tested on Ubuntu only (you have $ID)."

  echo "==> [1/5] Downloading panel"
  apt-get update -y </dev/null
  apt-get install -y git curl </dev/null
  if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only </dev/null; else git clone "$REPO" "$DIR" </dev/null; fi
  cd "$DIR"

  echo "==> [2/5] Installing Docker, Node.js and the panel"
  bash setup.sh </dev/null

  echo "==> [3/5] Checking 10 GB disk limit support"
  if docker run --rm --storage-opt size=10G vps-panel/ubuntu:22.04 true >/dev/null 2>&1; then
    echo "Disk limit works (10 GB per VPS)."
  else
    echo "Disk limit NOT supported on this server (needs XFS + pquota). Continuing without it."
    sed -i 's/^ENFORCE_DISK_QUOTA=.*/ENFORCE_DISK_QUOTA=false/' .env
    systemctl restart vps-panel
  fi

  echo "==> [4/5] KVM check"
  if [ -e /dev/kvm ]; then
    bash setup-kvm.sh </dev/null || echo "KVM setup failed; Docker VPS still works."
  else
    echo "No /dev/kvm here, so only Docker VPS will be available."
  fi

  if [ -n "${DOMAIN:-}" ]; then
    echo "==> [5/5] HTTPS for $DOMAIN"
    apt-get install -y caddy </dev/null
    echo "$DOMAIN { reverse_proxy localhost:3000 }" >/etc/caddy/Caddyfile
    ufw allow 80,443/tcp || true
    systemctl restart caddy
    sed -i 's/^BEHIND_PROXY=.*/BEHIND_PROXY=true/; s/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' .env
    systemctl restart vps-panel
    URL="https://$DOMAIN"
  else
    echo "==> [5/5] Done"
    URL="http://$(grep '^PUBLIC_HOST=' .env | cut -d= -f2):3000"
  fi

  echo
  echo "=========================================="
  echo " Panel is ready:  $URL"
  echo " Register an account, then press Create VPS."
  echo " Open ports 3000 and 20000-29999 in your provider's firewall."
  echo " Logs: journalctl -u vps-panel -f"
  echo "=========================================="
}
main "$@"
