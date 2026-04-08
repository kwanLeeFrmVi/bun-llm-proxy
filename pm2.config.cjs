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
      },
    },
  ],
};