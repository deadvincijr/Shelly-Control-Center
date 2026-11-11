#!/bin/bash
set -e

# Target directories
REPO_DIR="/home/shelly/Shelly Control Center"
WEB_DIR="/var/www/html"

echo "=== Updating Shelly Control Center ==="

cd "$REPO_DIR"

# Pull latest commits from GitHub
echo "[1/3] Pulling latest changes from git..."
git pull

# Copy all web assets (HTML, CSS, JS, JSON config)
echo "[2/3] Deploying web files to $WEB_DIR..."
sudo cp -u index.html rc.html style.css script.js config.json "$WEB_DIR/"

# Ensure correct permissions for the web server (Apache/Nginx)
sudo chown -R www-data:www-data "$WEB_DIR" 2>/dev/null || true
sudo chmod -R 755 "$WEB_DIR"

# Restart the FastAPI rover backend service if it exists
echo "[3/3] Checking FastAPI rover service..."
if systemctl is-active --quiet shelly-rover.service 2>/dev/null; then
    echo "Restarting shelly-rover.service to load updated main.py..."
    sudo systemctl restart shelly-rover.service
fi

echo "=== Deploy complete! ==="

