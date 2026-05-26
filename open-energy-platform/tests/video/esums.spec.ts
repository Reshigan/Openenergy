import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

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
  await shot(page, '/esums', {
    dwell: 14_000,
    waitFor: '[data-test="site-card"], a[href^="/esums/sites/"]',
    interact: async (p) => {
      // Pan down the site grid then hover the headline site so the health
      // badge + opportunity count chip surface.
      await smoothScroll(p, 280, 1000);
      await moveCursor(p, 760, 460);
      await p.locator('[data-test="site-card"], a[href^="/esums/sites/"]')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('esums-site-detail-live', async ({ page }) => {
  await shot(page, '/esums', {
    dwell: 16_000,
    waitFor: '[data-test="site-card"], a[href^="/esums/sites/"]',
    interact: async (p) => {
      // Open the first site card / row.
      await p.locator('a[href^="/esums/sites/"], [data-test="site-card"]')
        .first().click().catch(() => undefined);
      await p.waitForTimeout(1_400);
      // Once detail paints, pan down to the live telemetry strip + hover
      // a data point so its tooltip pops.
      await smoothScroll(p, 320, 1100);
      await p.locator('canvas, svg, [data-test^="telemetry"]').first()
        .hover({ position: { x: 200, y: 80 } }).catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('esums-opportunity-feed', async ({ page }) => {
  await shot(page, '/esums', {
    dwell: 14_000,
    waitFor: '[data-test="site-card"], a[href^="/esums/sites/"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Opportunit/i);
      // Glide down the opportunity feed and hover the top-value card so
      // the savings/payback annotation surfaces.
      await smoothScroll(p, 260, 1000);
      await p.locator('.opportunity-card, [data-test="opportunity-row"], table tbody tr')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
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
      await clickTabAndSettle(p, /Opportunit/i);
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
    dwell: 14_000,
    waitFor: '[data-test="site-card"], a[href^="/esums/sites/"]',
    interact: async (p) => {
      await p.getByRole('button', { name: /Share|Portal/i }).first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_300);
      // Type an external auditor email so the share-token modal looks real.
      const email = p.getByLabel(/Email|Recipient/i).first();
      await email.click().catch(() => undefined);
      await p.keyboard.type('auditor@deloitte.co.za', { delay: 70 });
      await p.waitForTimeout(900);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the Esums O&M arc by panning the asset operator's launch
// board — fleet KPIs, opportunity feed, water telemetry, work-orders,
// portal shares, AI fault inference, warranty register, MTTR trends.
test('esums-feature-tour', async ({ page }) => {
  await shot(page, '/launch/asset_operator', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'asset_operator');
    },
  });
});
