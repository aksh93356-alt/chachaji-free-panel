#!/bin/bash

echo "🚀 Starting CJH VPS Panel Auto-Installer..."

# 1. System Updates
sudo apt update -y && sudo apt upgrade -y

# 2. Install Node.js & Docker
echo "📦 Installing Node.js & Docker..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs docker.io git

# 3. Enable Docker Service
sudo systemctl start docker
sudo systemctl enable docker

# 4. Install Dependencies
echo "📥 Installing Panel Dependencies..."
npm install

# 5. Start Panel using PM2
echo "⚡ Starting Panel with PM2..."
sudo npm install -y pm2 -g
pm2 start server.js --name "cjh-vps-panel"
pm2 save
pm2 startup

echo "=========================================="
echo "✅ CJH VPS PANEL INSTALLED SUCCESSFULLY!"
echo "🌐 Open browser and visit: http://YOUR_SERVER_IP:3000"
echo "=========================================="
