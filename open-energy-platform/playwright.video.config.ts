// ═══════════════════════════════════════════════════════════════════════════
// Playwright config for the corporate-video production pipeline.
//
// Separate from playwright.config.ts (the smoke config) for two reasons:
//   1. Different viewport — 1920×1080 to match the master video canvas.
//   2. Different mission — diagnostic screenshots + recording-ready specs.
//      Smoke is about pass/fail; this config is about generating artefacts.
//
// Run: npx playwright test --config=playwright.video.config.ts
// ═══════════════════════════════════════════════════════════════════════════

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/video',
  // Generous — full-page screenshots + asset-rich pages can take a moment.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE || 'https://oe.vantax.co.za',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // For Phase 3 (recording), the per-spec config will turn video on.
    // The audit pass (Phase 1) only screenshots.
  },
});
