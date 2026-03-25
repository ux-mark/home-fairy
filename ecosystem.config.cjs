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
    },
  ],
}
