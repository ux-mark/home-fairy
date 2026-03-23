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
  }]
}
