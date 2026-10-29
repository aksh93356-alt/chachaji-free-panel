#!/usr/bin/env bash
# Ubuntu 22.04/24.04 one-shot installer. Run as root:  sudo bash setup.sh
set -euo pipefail
cd "$(dirname "$0")"

apt-get update
apt-get install -y ca-certificates curl gnupg build-essential python3 ufw

# Docker
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

# Node.js 20
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Image + dependencies
docker build -t vps-panel/ubuntu:22.04 ./docker
npm install --omit=dev

# .env with random secrets
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
  sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$(openssl rand -hex 32)/" .env
  IP=$(curl -s4 ifconfig.me || echo YOUR_SERVER_IP)
  sed -i "s/^PUBLIC_HOST=.*/PUBLIC_HOST=$IP/" .env
  echo "Created .env (PUBLIC_HOST=$IP)"
fi

# systemd service
cat >/etc/systemd/system/vps-panel.service <<UNIT
[Unit]
Description=VPS Panel
After=docker.service network.target
Requires=docker.service
[Service]
WorkingDirectory=$(pwd)
ExecStart=$(command -v node) server.js
Restart=always
User=root
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now vps-panel

# Firewall: SSH for you, panel, and the container SSH port range
ufw allow OpenSSH; ufw allow 3000/tcp; ufw allow 20000:29999/tcp
ufw --force enable
echo "Panel is running on port 3000."
