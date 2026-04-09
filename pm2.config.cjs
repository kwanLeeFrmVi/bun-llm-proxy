const fs = require('fs');
const path = require('path');

// Parse .env file
const envPath = path.join(__dirname, '.env');
const REDIS_PASSWORD = '';
const env = { NODE_ENV: 'production', REDIS_URL: `redis://:${REDIS_PASSWORD}@127.0.0.1:6379`, REDIS_CACHE_ENABLED: true };

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      let value = valueParts.join('=').trim();
      // Expand $HOME
      value = value.replace(/\$HOME/g, process.env.HOME || '/home/xxx');
      env[key.trim()] = value;
    }
  });
}

const isLinux = process.platform === "linux";

module.exports = {
  apps: [
    {
      name: "bunLLM-proxy",
      script: `${process.env.HOME}/.bun/bin/bun`,
      args: "run index.ts",
      interpreter: "none",
      exec_mode: "fork",
      instances: isLinux ? 4 : 1,
      cwd: __dirname,
      autorestart: true,
      watch: false,
      env: {
        PORT: "20129",
        NODE_ENV: "production",
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
        ...env,
      },
    },
    {
      name: "bunLLM-Dashboard",
      script: `${process.env.HOME}/.bun/bin/bun`,
      args: "run preview --port 20130",
      interpreter: "none",
      exec_mode: "fork",
      instances: 1,
      cwd: `${__dirname}/dashboard`,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
        VITE_DOMAIN: env.VITE_DOMAIN || "http://localhost:20130",
      },
    },
  ],
};