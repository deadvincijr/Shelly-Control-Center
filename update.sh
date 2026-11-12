#!/bin/bash
set -e

# Target directories
REPO_DIR="/home/shelly/Shelly Control Center"
WEB_DIR="/var/www/html"
SERVICE_FILE="/etc/systemd/system/shelly-rover.service"

echo "=== Updating Shelly Control Center ==="

cd "$REPO_DIR"

# 1. Pull latest commits from GitHub
echo "[1/4] Pulling latest changes from git..."
git pull

# 2. Copy all web assets to /var/www/html (where Apache/Nginx hosts the site)
echo "[2/4] Copying website files to $WEB_DIR..."
sudo cp index.html rc.html style.css script.js config.json "$WEB_DIR/"
sudo chown -R www-data:www-data "$WEB_DIR" 2>/dev/null || true
sudo chmod -R 755 "$WEB_DIR"

# 3. Ensure Python venv & dependencies exist for the RC Rover GPIO/Camera backend
echo "[3/4] Checking Python environment for RC Rover backend (main.py)..."
if [ ! -f "$REPO_DIR/venv/bin/uvicorn" ]; then
    echo "Setting up Python virtual environment for main.py..."
    sudo apt update
    sudo apt install -y python3-venv python3-pip python3-gpiozero python3-lgpio rpicam-apps
    python3 -m venv --system-site-packages "$REPO_DIR/venv"
    "$REPO_DIR/venv/bin/pip" install fastapi "uvicorn[standard]" wsproto
fi

# 4. Install & restart the background systemd service for main.py (port 8000)
echo "[4/4] Ensuring shelly-rover.service is running..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Shelly RC Rover GPIO & Camera Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=shelly
WorkingDirectory=$REPO_DIR
ExecStart="$REPO_DIR/venv/bin/uvicorn" main:app --host 0.0.0.0 --port 8000 --workers 1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable shelly-rover.service
sudo systemctl restart shelly-rover.service

echo "=== Deploy complete! ==="
echo "Website hosted at: /var/www/html (http://$(hostname -I | awk '{print $1}')/)"
echo "RC Rover GPIO/Camera backend active on port 8000"
