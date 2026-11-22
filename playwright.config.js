const { defineConfig, devices } = require('@playwright/test');

// Show real scrollbars - Playwright hides them by default, which hides layout bugs
const showScrollbars = { launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } };

module.exports = defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    actionTimeout: 5000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...showScrollbars } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...showScrollbars } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'tablet-safari', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
  webServer: {
    command: 'node tests/server.js',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
