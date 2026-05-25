import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'trader');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('trading-order-book-energy', async ({ page }) => {
  await shot(page, '/trading', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test^="orderbook"], main',
    interact: async (p) => {
      // Scroll the depth ladder to show below-the-fold bids/asks, then
      // hover the top resting order so the row highlight + tooltip surface.
      await smoothScroll(p, 280, 900);
      await moveCursor(p, 960, 420);
      await p.locator('table tbody tr, [data-test="orderbook-row"]').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('trading-trade-blotter', async ({ page }) => {
  await shot(page, '/trading', {
    dwell: 12_000,
    waitFor: 'table tbody tr, [data-test^="orderbook"], main',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Blotter|Trades/i }).click().catch(() => undefined);
      await p.waitForTimeout(900);
      // After the tab paints, glide down the blotter and hover the freshest fill.
      await smoothScroll(p, 240, 900);
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(700);
    },
  });
});

test('trader-workstation', async ({ page }) => {
  await shot(page, '/trader-risk/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr, main',
    interact: async (p) => {
      // Pan through the workstation: KPI strip → middle band → AI suggestions.
      await smoothScroll(p, 320, 1000);
      await moveCursor(p, 720, 480);
      await p.locator('[data-test^="kpi"], .card, table tbody tr').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('trader-place-order', async ({ page }) => {
  await shot(page, '/trading', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test^="orderbook"], main',
    interact: async (p) => {
      await p.getByRole('button', { name: /Place order|New order|Order/i }).first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_200);
      // Type a realistic 50 MWh @ R285 ticket. The form fields are detected
      // by label so we hit them regardless of exact element type.
      const qty = p.getByLabel(/Quantity|MWh|Volume/i).first();
      await qty.click().catch(() => undefined);
      await p.keyboard.type('50', { delay: 70 });
      await p.waitForTimeout(500);
      const price = p.getByLabel(/Price|R\/MWh|Rand/i).first();
      await price.click().catch(() => undefined);
      await p.keyboard.type('285', { delay: 70 });
      await p.waitForTimeout(900);
    },
  });
});

test('trader-ai-suggestion-accept', async ({ page }) => {
  await shot(page, '/trader-risk/workstation', {
    dwell: 12_000,
    waitFor: '[data-test^="kpi"], main',
    interact: async (p) => {
      // Glide to where the AI suggestion card paints, hover it (shows "why"
      // chip), then click the 1-click accept CTA — the canonical AI beat.
      await smoothScroll(p, 360, 1000);
      const card = p.locator('[data-test="ai-suggestion"], .ai-card, text=/why this/i').first();
      await card.hover().catch(() => undefined);
      await p.waitForTimeout(800);
      await p.getByRole('button', { name: /Accept|Apply|Submit/i }).first()
        .click().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});
