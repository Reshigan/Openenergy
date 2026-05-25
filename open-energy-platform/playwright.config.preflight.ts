// Tiny config dedicated to running tests/video/preflight.spec.ts standalone.
// The recording config (playwright.config.video.ts) ignores preflight so it
// doesn't burn video=on captures on probing — but that same testIgnore
// would also prevent us running it from the recording config, so we use
// this one when we want to actually execute the preflight pass.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/video',
  testMatch: ['**/preflight.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE || 'http://localhost:8787',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
  },
});
