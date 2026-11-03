// One API process. ARI events and AudioSocket live in that process.
// Do not raise instances above 1. Secrets stay in the repository .env on the server.
// PM2 only sets NODE_ENV here. The API loads the rest through dotenv.

module.exports = {
  apps: [
    {
      name: "ody-phone-api",
      cwd: "./backend",
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      kill_timeout: 10000,
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "ody-phone-web",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      kill_timeout: 10000,
      env: {
        NODE_ENV: "production",
        BACKEND_URL: "http://127.0.0.1:4000",
      },
    },
  ],
};
