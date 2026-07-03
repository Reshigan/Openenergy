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
  // Retry in CI only. The full nightly suite runs serially against PROD for ~1.1h;
  // under that sustained single-worker load, a few ledger fetches occasionally
  // exceed the 30s paint window (D1 cold read / worker cold start) and time out —
  // a near-disjoint set of chains each run, all verified to render fine standalone
  // (10–11 rows each). That's prod-latency-under-load variance a real user (one
  // request, not the 300th of the hour) never sees, so a retry absorbs it while a
  // genuine regression still fails all attempts. Local runs keep 0 (fail fast).
  retries: process.env.CI ? 2 : 0,
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
    launchOptions: {
      // Reduce headless-detection signals that trigger Cloudflare Bot Management
      // on the production origin. Fake tokens also look like `test-token-*`
      // (no dots) so CF may inspect the Authorization header format — all roles
      // now get real JWT tokens from globalSetup to eliminate that signal.
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },
});
