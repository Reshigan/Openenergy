import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'offtaker');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('offtaker-workstation', async ({ page }) => {
  await shot(page, '/offtaker-suite/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr, main',
    interact: async (p) => {
      await smoothScroll(p, 300, 1000);
      await moveCursor(p, 780, 480);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('offtaker-procurement-rfp', async ({ page }) => {
  await shot(page, '/procurement', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test="rfp-row"], main',
    interact: async (p) => {
      // Open the first RFP row, then open the bid-comparison tab + hover a bid.
      await p.locator('table tbody tr, [data-test="rfp-row"]').first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_100);
      await p.getByRole('tab', { name: /Bid|Compar|Award/i }).click().catch(() => undefined);
      await p.waitForTimeout(900);
      await smoothScroll(p, 240, 1000);
      await p.locator('[data-test="bid-row"], table tbody tr').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});
