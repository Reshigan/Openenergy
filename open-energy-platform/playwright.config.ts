import { defineConfig } from '@playwright/test';

// Headless browser smoke. Run as part of `npm run smoke` or solo via
// `npx playwright test`. Targets production by default; override via BASE.
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Run serially so the sensitive-auth rate limiter (10 / 5min / IP) doesn't
  // trip when multiple workers each log in fresh. The previous parallel
  // default (4 workers) caused intermittent failures on tests 2-4.
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE || 'https://oe.vantax.co.za',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
});
