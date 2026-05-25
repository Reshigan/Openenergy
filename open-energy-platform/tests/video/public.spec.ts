// Public, unauthenticated surfaces — status, audit transparency, legal.
// No login required; we still set viewport via the shared config.

import { test } from '@playwright/test';
import { shot, smoothScroll, moveCursor } from './_helpers';

test.describe.configure({ mode: 'serial' });

test('spa-public-status-page', async ({ page }) => {
  await shot(page, '/status', {
    dwell: 14_000,
    waitFor: 'main, h1',
    interact: async (p) => {
      // Smooth-scroll down the component status grid so the SLO + incident
      // timeline come into frame on camera.
      await smoothScroll(p, 320, 1100);
      await moveCursor(p, 760, 480);
      await p.locator('[data-test="status-component"], .status-row, h2').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('public-audit-page-roots', async ({ page }) => {
  await shot(page, '/audit', {
    dwell: 14_000,
    waitFor: 'main, h1',
    interact: async (p) => {
      // Pan down the Merkle-root ledger and hover the freshest root so its
      // timestamp/signature popover surfaces.
      await smoothScroll(p, 280, 1000);
      await moveCursor(p, 800, 480);
      await p.locator('[data-test="audit-root"], table tbody tr, code').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('public-audit-page-proof', async ({ page }) => {
  await shot(page, '/audit', {
    dwell: 14_000,
    waitFor: 'main, h1',
    interact: async (p) => {
      // Switch to the proof tab. Tab buttons render the label "Generate proof".
      await p.getByRole('button', { name: /Generate proof/i }).click().catch(() => undefined);
      await p.waitForTimeout(900);
      // Type a real transaction id so the proof form looks driven.
      const input = p.getByLabel(/Transaction|Hash|Event/i).first();
      await input.click().catch(() => undefined);
      await p.keyboard.type('trade_2026_05_25_00942', { delay: 70 });
      await p.waitForTimeout(900);
    },
  });
});

test('public-legal-page-applications', async ({ page }) => {
  await shot(page, '/legal', {
    dwell: 14_000,
    waitFor: 'main, h1',
    interact: async (p) => {
      await p.getByRole('button', { name: /Tariff applications/i }).click().catch(() => undefined);
      await p.waitForTimeout(900);
      // Glide down the applications list and hover the top application
      // so the status chip becomes visible.
      await smoothScroll(p, 280, 1100);
      await p.locator('[data-test="application-row"], table tbody tr, .card')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});
