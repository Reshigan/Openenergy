import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'admin');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('launch-admin-overview', async ({ page }) => {
  await shot(page, '/launch/admin', {
    dwell: 14_000,
    waitFor: '[data-test="launch-board"], [data-test^="kpi"], main',
    interact: async (p) => {
      // Pan the launch board down to show the cross-tenant KPI strip and
      // hover the headline tile.
      await smoothScroll(p, 300, 1000);
      await moveCursor(p, 780, 480);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('settlement-cleared-trades', async ({ page }) => {
  await shot(page, '/settlement', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test^="kpi"], main',
    interact: async (p) => {
      // Glide through the cleared-trade ledger and hover the most recent fill.
      await smoothScroll(p, 280, 1000);
      await moveCursor(p, 880, 460);
      await p.locator('table tbody tr, [data-test="trade-row"]').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('admin-platform-stats', async ({ page }) => {
  await shot(page, '/admin', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], main',
    interact: async (p) => {
      // Smooth scroll through the platform stats and hover the throughput card.
      await smoothScroll(p, 360, 1100);
      await moveCursor(p, 720, 500);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('audit-chain-summary', async ({ page }) => {
  // The admin-side audit summary lives in the admin console. Public audit
  // page is captured in public.spec.ts.
  await shot(page, '/admin', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], main',
    interact: async (p) => {
      await p.getByRole('link', { name: /Audit/i }).click().catch(() => undefined);
      await p.getByRole('tab', { name: /Audit/i }).click().catch(() => undefined);
      await p.waitForTimeout(900);
      // Pan down the block roots and hover a single block so its hash
      // popover shows up.
      await smoothScroll(p, 240, 1000);
      await p.locator('[data-test="audit-block"], table tbody tr, .block')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});
