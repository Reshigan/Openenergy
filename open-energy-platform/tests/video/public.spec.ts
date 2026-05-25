// Public, unauthenticated surfaces — status, audit transparency, legal.
// No login required; we still set viewport via the shared config.

import { test } from '@playwright/test';
import { shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

test('spa-public-status-page', async ({ page }) => {
  await shot(page, '/status', { dwell: 12_000, waitFor: 'h1' });
});

test('public-audit-page-roots', async ({ page }) => {
  await shot(page, '/audit', { dwell: 12_000, waitFor: 'h1' });
});

test('public-audit-page-proof', async ({ page }) => {
  await shot(page, '/audit', {
    dwell: 12_000,
    waitFor: 'h1',
    interact: async (p) => {
      // Switch to the proof tab. Tab buttons render the label "Generate proof".
      await p.getByRole('button', { name: /Generate proof/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('public-legal-page-applications', async ({ page }) => {
  await shot(page, '/legal', {
    dwell: 12_000,
    waitFor: 'h1',
    interact: async (p) => {
      await p.getByRole('button', { name: /Tariff applications/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
