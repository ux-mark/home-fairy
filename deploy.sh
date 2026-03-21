#!/bin/bash
# Deploy The Fairies v3 to Raspberry Pi
# Run this ON the Pi after cloning the repo

set -e

echo "🧚 The Fairies v3 — Deployment"
echo "================================"

# Check Node.js version
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
echo "Node.js: $NODE_VERSION"
if [ "$NODE_VERSION" = "none" ]; then
  echo "❌ Node.js not installed. Install Node.js 20+ first:"
  echo "   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "   sudo apt-get install -y nodejs"
  exit 1
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm run install:all

# Build the client
echo ""
echo "🔨 Building client..."
cd client
npx vite build
cd ..

# Copy .env if it doesn't exist
if [ ! -f server/.env ]; then
  echo ""
  echo "⚠️  No server/.env found. Copying from .env.example..."
  cp server/.env.example server/.env
  echo "   IMPORTANT: Edit server/.env with your actual values:"
  echo "   nano server/.env"
fi

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
  echo ""
  echo "📦 Installing PM2 process manager..."
  sudo npm install -g pm2
fi

# Create PM2 ecosystem file
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
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
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
}
EOF

# Create logs directory
mkdir -p server/logs

# Start/restart with PM2
echo ""
echo "🚀 Starting server with PM2..."
pm2 stop thefairies 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Set PM2 to start on boot
echo ""
echo "🔄 Setting up PM2 to start on boot..."
pm2 startup systemd -u $(whoami) --hp $HOME 2>/dev/null || echo "   Run the pm2 startup command shown above if needed"
pm2 save

echo ""
echo "✅ Deployment complete!"
echo ""
echo "   App running at: http://$(hostname -I | awk '{print $1}'):3001"
echo "   PM2 status:     pm2 status"
echo "   View logs:      pm2 logs thefairies"
echo "   Restart:        pm2 restart thefairies"
echo ""
echo "   The client is served as static files from the server."
echo "   Access the app at http://$(hostname -I | awk '{print $1}'):3001"
