import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'carbon_fund');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('carbon-portfolio', async ({ page }) => {
  await shot(page, '/carbon', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr, main',
    interact: async (p) => {
      // Pan down the portfolio strip so the vintage breakdown comes on
      // screen and hover the top certificate.
      await smoothScroll(p, 320, 1000);
      await moveCursor(p, 760, 480);
      await p.locator('[data-test="certificate-row"], table tbody tr, .card')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('carbon-issuance-queue', async ({ page }) => {
  await shot(page, '/carbon', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], main',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Issuance|Issue/i }).click().catch(() => undefined);
      await p.waitForTimeout(900);
      // Glide to the pending issuance row and hover so the verification
      // state badge ("verifier signed", "ready to mint") shows up.
      await smoothScroll(p, 240, 1000);
      await p.locator('[data-test="issuance-row"], table tbody tr').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});
