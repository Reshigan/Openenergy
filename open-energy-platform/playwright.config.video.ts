import { defineConfig } from '@playwright/test';

// Playwright config for the 15-minute product film (Phase 3 of the video
// pipeline). Renders each shot as its own MP4 via Playwright's per-test
// `video: 'on'` recording, then run-shots.sh promotes them to
// media/shots/<shot-key>.webm so render-master.sh can sequence them.
//
// Diverges from the standard browser smoke config:
//   - 1920x1080 viewport (target master is 1080p)
//   - headed (so font + emoji + locale rendering matches what reviewers see)
//   - longer timeouts (each shot pauses 8-14s on the page to give the V/O
//     room to breathe in the composite)
//   - single worker, fullyParallel: false — both for auth rate-limit safety
//     and because we want determinism in the recorded ordering
//   - target the local wrangler dev server by default. Recording against
//     prod would still work, but the demo seed (migration 079) is currently
//     only authoritative on local.
export default defineConfig({
  testDir: './tests/video',
  // The Phase 1 walker (audit.spec.ts) lives in the same directory but
  // writes PNG screenshots rather than recording shots — exclude it from
  // the shot suite so we don't waste video=on captures on it.
  // admin.spec.ts is excluded by request: the UN/ESCO product film does
  // not feature the operator/admin role; the four shots it captured
  // (launch-admin-overview, settlement-cleared-trades,
  // admin-platform-stats, audit-chain-summary) have been replaced in the
  // script with non-admin equivalents (trader / regulator / public).
  testIgnore: ['**/audit.spec.ts', '**/preflight.spec.ts', '**/admin.spec.ts'],
  // Each test does its own navigate + N-second on-screen settle + capture.
  // 180s accommodates the heavier entity-file shots (multiple tab clicks
  // with networkidle waits between each) plus prod-network variance.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  // Per-shot MP4s land in test-results/<role-spec>/<shot-key>/video.webm by
  // default. run-shots.sh moves them to media/shots/<shot-key>.webm.
  outputDir: 'test-results/video',
  use: {
    baseURL: process.env.BASE || 'http://localhost:8787',
    headless: process.env.HEADLESS === '1',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
    // Stable fonts + locale — the lower-third chyron (added later in
    // composite) will pair with what's on screen, so deterministic fonts
    // matter.
    locale: 'en-ZA',
    timezoneId: 'Africa/Johannesburg',
  },
});
