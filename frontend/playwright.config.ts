import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests, driven the way a person drives the app.
 *
 * Tests navigate by clicking menu items and buttons, never by visiting a URL
 * and never by calling the API directly. The only address any test types is
 * the app's front door — everything after that has to be reachable by
 * clicking, which is the point: a button wired to nothing fails here, and
 * that is the class of bug these exist to catch.
 */
export default defineConfig({
  testDir: './e2e',
  // Resets records left by earlier runs so the suite is repeatable.
  globalSetup: './e2e/global-setup.ts',
  // The journey builds on itself — a class needs a class type, cover needs a
  // class — so files run one at a time and in name order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
