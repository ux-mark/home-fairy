#!/bin/bash
set -e
# Deploy Home Fairy to Raspberry Pi
# Run this from your Mac: bash deploy-to-pi.sh
#
# Database behaviour:
#   By default, the local database is NOT copied to the Pi.
#   Pass --include-db to copy the local database (overwrites Pi database).
#   Up to 5 timestamped backups are kept automatically.

PI_HOST="queen@192.168.10.201"
PI_DIR="/home/queen/thefairies-app"
LOCAL_DB="server/data/thefairies.sqlite"
INCLUDE_DB=false

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --include-db) INCLUDE_DB=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "Deploying Home Fairy to Pi"
echo "You'll be asked for your Pi password a few times."
if [ "$INCLUDE_DB" = true ]; then
  echo "Database copy: ENABLED (--include-db)"
else
  echo "Database copy: SKIPPED (pass --include-db to copy)"
fi
echo ""

if [ "$INCLUDE_DB" = true ]; then
  # Back up database on Pi with timestamp, keep last 5
  echo "Step 0: Backing up database on Pi..."
  ssh "$PI_HOST" "cd $PI_DIR/server/data && cp thefairies.sqlite thefairies.sqlite.backup-\$(date +%Y%m%d-%H%M%S) 2>/dev/null || true && ls -1t thefairies.sqlite.backup-* 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true"

  # Copy database
  echo "Step 1: Copying database to Pi..."
  scp -O "$LOCAL_DB" "$PI_HOST:$PI_DIR/server/data/thefairies.sqlite"
fi

# Run install + build + start on Pi
echo ""
echo "Step 2: Installing, building, and starting on Pi..."
ssh -t "$PI_HOST" bash -s << 'REMOTE'
set -e
cd ~/thefairies-app

echo "Installing Node dependencies..."
npm run install:all

echo ""
echo "Setting up Kasa sidecar Python environment..."
cd server/kasa
if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "   Created Python venv"
fi
venv/bin/pip install -q -r requirements.txt
echo "   Python dependencies installed"
cd ~/thefairies-app

echo ""
echo "Setting up Sonos HTTP API..."
SONOS_DIR="$HOME/node-sonos-http-api"
if [ ! -d "$SONOS_DIR" ]; then
  echo "   Cloning node-sonos-http-api..."
  git clone https://github.com/jishi/node-sonos-http-api.git "$SONOS_DIR"
  cd "$SONOS_DIR" && npm install && cd ~/thefairies-app
else
  echo "   Updating node-sonos-http-api..."
  cd "$SONOS_DIR" && git pull && npm install && cd ~/thefairies-app
fi
mkdir -p "$SONOS_DIR/logs"
# Configure Sonos API to use port 3003 (consistent with 3001/3002)
echo '{"port": 3003}' > "$SONOS_DIR/settings.json"

echo ""
echo "Building client..."
cd client && npx vite build && cd ..

echo ""
echo "Building server..."
cd server && npx tsc && cd ..

echo ""
echo "Creating logs directory..."
mkdir -p server/logs

echo ""
echo "Setting up PM2..."
which pm2 > /dev/null 2>&1 || sudo npm install -g pm2

echo ""
echo "Starting services..."
pm2 stop all 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "Running health check..."
sleep 3
if pm2 show thefairies | grep -q "online"; then
  echo "Health check passed - thefairies is online"
else
  echo "WARNING: thefairies is not online! Check logs: pm2 logs thefairies"
fi

echo ""
echo "Done! App running at http://$(hostname -I | awk '{print $1}'):3001"
pm2 status
REMOTE

echo ""
echo "Deployment complete!"
echo "   Open: http://192.168.10.201:3001"
