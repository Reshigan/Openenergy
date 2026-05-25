import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  // Esums is observable from the IPP role (their assets) and admin (cross-tenant).
  // We use ipp_developer for the operator-eye view.
  TOKEN = await ensureToken(request, baseURL!, 'ipp_developer');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('esums-site-list', async ({ page }) => {
  await shot(page, '/esums', { dwell: 14_000, waitFor: 'h1, h2' });
});

test('esums-site-detail-live', async ({ page }) => {
  await shot(page, '/esums', {
    dwell: 14_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      // Open the first site card / row.
      await p.locator('a[href^="/esums/sites/"], [data-test="site-card"]').first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});

test('esums-opportunity-feed', async ({ page }) => {
  await shot(page, '/esums', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('tab', { name: /Opportunit/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('esums-work-order-detail', async ({ page }) => {
  // Walk: Esums list → Site Bravo → Opportunities tab → open first opportunity
  // → "Create work order" modal in view. Mirrors Beat 5.2 of the script.
  await shot(page, '/esums', {
    dwell: 14_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.locator('a[href^="/esums/sites/"], [data-test="site-card"]').first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_200);
      await p.getByRole('tab', { name: /Opportunit/i }).click().catch(() => undefined);
      await p.waitForTimeout(800);
      // Smooth scroll the highest-value opportunity into mid-frame.
      await p.evaluate(() => window.scrollTo({ top: 160, behavior: 'smooth' }));
      await p.waitForTimeout(900);
      // Open the first opportunity row (handles either button or row click).
      await p.locator('[data-test="opportunity-row"], button:has-text("Open"), button:has-text("Create work order")')
        .first().click().catch(() => undefined);
      await p.waitForTimeout(1_500);
    },
  });
});

test('esums-portal-share-token', async ({ page }) => {
  await shot(page, '/esums', {
    dwell: 12_000,
    waitFor: 'h1, h2',
    interact: async (p) => {
      await p.getByRole('button', { name: /Share|Portal/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
    },
  });
});
