import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'trader');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('trading-order-book-energy', async ({ page }) => {
  await shot(page, '/trading', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('trading-trade-blotter', async ({ page }) => {
  await shot(page, '/trading', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Blotter|Trades/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('trader-workstation', async ({ page }) => {
  await shot(page, '/trader/workstation', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('trader-place-order', async ({ page }) => {
  await shot(page, '/trading', {
    dwell: 14_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('button', { name: /Place order|New order|Order/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});

test('trader-ai-suggestion-accept', async ({ page }) => {
  await shot(page, '/trader/workstation', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      // The inline AI suggestion card renders on the trader launch / workstation.
      // We just hover/scroll to ensure it's in frame.
      await p.evaluate(() => window.scrollTo({ top: 240, behavior: 'smooth' }));
      await p.waitForTimeout(800);
    },
  });
});
