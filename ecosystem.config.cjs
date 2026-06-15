const os = require('os')

module.exports = {
  apps: [
    {
      name: 'home-fairy',
      cwd: './server',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      watch: false,
      restart_delay: 2000,
      min_uptime: '30s',
      max_memory_restart: '256M',
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
    {
      name: 'kasa-sidecar',
      cwd: './server/kasa',
      script: 'venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 3002',
      interpreter: 'none',
      // Steady-state RSS sits ~75 MB; the 100 MB ceiling clipped python-kasa's
      // discovery peak (29 devices, including HS300 strip children with their
      // own emeter caches) and triggered a SIGINT restart loop on cold boot.
      max_memory_restart: '256M',
      restart_delay: 2000,
      min_uptime: '30s',
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: './logs/kasa-error.log',
      out_file: './logs/kasa-out.log',
      merge_logs: true,
    },
    {
      name: 'sonos-http-api',
      // Resolve the Sonos API path from the running user's home so the same
      // config works on every Pi (queen, bog-witch, …) with no per-host edit.
      cwd: `${os.homedir()}/node-sonos-http-api`,
      script: 'server.js',
      watch: false,
      // Steady-state RSS sits at ~135–140 MB after speaker discovery; the
      // old 128 MB ceiling was always borderline and started a SIGINT
      // restart loop after a fresh reload (every 30s, matching PM2's
      // memory-monitor interval). 256 MB matches the other two apps.
      max_memory_restart: '256M',
      restart_delay: 2000,
      min_uptime: '30s',
      exp_backoff_restart_delay: 1000,
      max_restarts: 10,
      error_file: './logs/sonos-error.log',
      out_file: './logs/sonos-out.log',
      merge_logs: true,
    },
  ],
}
