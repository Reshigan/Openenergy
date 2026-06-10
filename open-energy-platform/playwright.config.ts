import { defineConfig } from '@playwright/test';

// Headless browser smoke. Run as part of `npm run smoke` or solo via
// `npx playwright test`. Targets production by default; override via BASE.
export default defineConfig({
  testDir: './tests/browser',
  // Login once as admin before all specs run — avoids 19 × beforeAll API calls
  // exhausting the 10/5min/IP rate limit. Each spec reads PLAYWRIGHT_ADMIN_TOKEN
  // from the environment instead of hitting /api/auth/login independently.
  globalSetup: './tests/browser/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Run serially — 1 worker is still required to avoid concurrent navigation
  // races on the same Cloudflare origin.
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE || 'https://oe.vantax.co.za',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 25_000,
    navigationTimeout: 20_000,
  },
});
