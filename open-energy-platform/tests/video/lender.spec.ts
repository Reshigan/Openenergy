import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'lender');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('lender-portfolio-watchlist', async ({ page }) => {
  await shot(page, '/launch/lender', { dwell: 14_000, waitFor: 'h1, [data-test="launch-board"]' });
});

test('lender-drawdown-queue', async ({ page }) => {
  await shot(page, '/funds', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Drawdown|Draw/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('lender-workstation', async ({ page }) => {
  // Lender doesn't have a dedicated /workstation route — /lender-suite is
  // the workstation. We capture that.
  await shot(page, '/lender-suite', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('lender-covenant-dashboard', async ({ page }) => {
  await shot(page, '/lender-suite', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Covenant/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('lender-watchlist-alert', async ({ page }) => {
  await shot(page, '/lender-suite', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Watchlist|Watch/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});
