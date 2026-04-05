module.exports = {
  apps: [
    {
      name: 'kpi-server',
      script: '../node_modules/nodemon/bin/nodemon.js',
      args: 'src/index.js',
      cwd: './server',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
    },
    {
      name: 'kpi-client',
      script: '../node_modules/vite/bin/vite.js',
      cwd: './client',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
