const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:36121',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 8000,
  },
  webServer: {
    command: 'node server.js',
    port: 36121,
    reuseExistingServer: true,
    timeout: 10000,
  },
});