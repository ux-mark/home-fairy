#!/bin/bash
# Deploy The Fairies v3 to Raspberry Pi
# Run this from your Mac: bash deploy-to-pi.sh

PI_HOST="queen@192.168.10.201"
PI_DIR="/home/queen/thefairies-app"
LOCAL_DB="server/data/thefairies.sqlite"

echo "🧚 Deploying The Fairies v3 to Pi"
echo "You'll be asked for your Pi password a few times."
echo ""

# Step 1: Copy database
echo "📦 Step 1: Copying database to Pi..."
scp -O "$LOCAL_DB" "$PI_HOST:$PI_DIR/server/data/thefairies.sqlite"

# Step 2: Run install + build + start on Pi
echo ""
echo "🔨 Step 2: Installing, building, and starting on Pi..."
ssh -t "$PI_HOST" bash -s << 'REMOTE'
set -e
cd ~/thefairies-app

echo "📦 Installing Node dependencies..."
npm run install:all

echo ""
echo "🐍 Setting up Kasa sidecar Python environment..."
cd server/kasa
if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "   Created Python venv"
fi
venv/bin/pip install -q -r requirements.txt
echo "   Python dependencies installed"
cd ~/thefairies-app

echo ""
echo "🔨 Building client..."
cd client && npx vite build && cd ..

echo ""
echo "📁 Creating logs directory..."
mkdir -p server/logs

echo ""
echo "⚙️  Setting up PM2..."
which pm2 > /dev/null 2>&1 || sudo npm install -g pm2

# Create PM2 config
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [
    {
      name: 'thefairies',
      cwd: './server',
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      max_memory_restart: '256M',
      error_file: '../server/logs/error.log',
      out_file: '../server/logs/out.log',
      merge_logs: true,
    },
    {
      name: 'kasa-sidecar',
      cwd: './server/kasa',
      script: 'venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 3002',
      interpreter: 'none',
      max_memory_restart: '100M',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '../logs/kasa-error.log',
      out_file: '../logs/kasa-out.log',
      merge_logs: true,
    },
  ],
}
EOF

echo ""
echo "🚀 Starting services..."
pm2 stop all 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo ""
echo "✅ Done! App running at http://$(hostname -I | awk '{print $1}'):3001"
pm2 status
REMOTE

echo ""
echo "🧚 Deployment complete!"
echo "   Open: http://192.168.10.201:3001"
