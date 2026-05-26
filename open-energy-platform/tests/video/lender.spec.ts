import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'lender');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('lender-portfolio-watchlist', async ({ page }) => {
  await shot(page, '/launch/lender', {
    dwell: 14_000,
    waitFor: '[data-test="launch-board"], [data-test^="kpi"]',
    interact: async (p) => {
      // Glide down the portfolio list and hover the first watchlist row so
      // the covenant/health indicator chip becomes visible.
      await smoothScroll(p, 300, 1000);
      await moveCursor(p, 880, 460);
      await p.locator('[data-test="watchlist-row"], table tbody tr, .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('lender-drawdown-queue', async ({ page }) => {
  await shot(page, '/funds', {
    dwell: 12_000,
    waitFor: 'table tbody tr, [data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Drawdown|Draw/i);
      // Click into the top drawdown row so the detail panel/modal opens.
      await smoothScroll(p, 200, 800);
      await p.locator('[data-test="drawdown-row"], table tbody tr').first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

test('lender-workstation', async ({ page }) => {
  // Lender doesn't have a dedicated /workstation route — /lender-suite is
  // the workstation. We capture that.
  await shot(page, '/lender-suite', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr',
    interact: async (p) => {
      await smoothScroll(p, 320, 1000);
      await moveCursor(p, 760, 500);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('lender-covenant-dashboard', async ({ page }) => {
  await shot(page, '/lender-suite', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Covenant/i);
      // Pan down the covenant grid then hover a breach indicator so the
      // tooltip explains DSCR/LTV state.
      await smoothScroll(p, 280, 1000);
      await p.locator('[data-test="covenant-row"], table tbody tr, .card')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('lender-watchlist-alert', async ({ page }) => {
  await shot(page, '/lender-suite', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await clickTabAndSettle(p, /Watchlist|Watch/i);
      // Click the first alert to open the detail drawer.
      await smoothScroll(p, 180, 800);
      await p.locator('[data-test="alert-row"], table tbody tr, .alert-card')
        .first().click().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the lender arc by panning the launch board — the audience sees
// every other surface (portfolio, drawdowns, covenants, watchlist,
// dunning, ESG-linked KPIs, regulator bridge).
test('lender-feature-tour', async ({ page }) => {
  await shot(page, '/launch/lender', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'lender');
    },
  });
});
