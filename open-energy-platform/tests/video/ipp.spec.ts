import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'ipp_developer');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

test('ipp-projects-list', async ({ page }) => {
  await shot(page, '/projects', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test="project-row"]',
    interact: async (p) => {
      // Glide down the project list and hover the headline project so the
      // status pill + stage chip pop on camera.
      await smoothScroll(p, 280, 1000);
      await moveCursor(p, 720, 440);
      await p.locator('table tbody tr, [data-test="project-row"]').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('ipp-project-detail-financial-model', async ({ page }) => {
  await shot(page, '/projects', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test="project-row"]',
    interact: async (p) => {
      // Open the first project row, then the financial-model tab if present.
      await p.locator('table tbody tr, [data-test="project-row"]').first().click().catch(() => undefined);
      await p.waitForTimeout(1_100);
      await clickTabAndSettle(p, /Financial|Model/i);
      // Pan the model so the IRR / NPV cards scroll into mid-frame and
      // hover one of the cards to expose its tooltip.
      await smoothScroll(p, 240, 1000);
      await p.locator('[data-test="financial-card"], .card, table tbody tr')
        .first().hover().catch(() => undefined);
      await p.waitForTimeout(800);
    },
  });
});

test('ipp-workstation', async ({ page }) => {
  await shot(page, '/ipp-lifecycle/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr',
    interact: async (p) => {
      await smoothScroll(p, 320, 1000);
      await moveCursor(p, 800, 460);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('ipp-drawdown-request', async ({ page }) => {
  await shot(page, '/ipp-lifecycle/workstation', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"]',
    interact: async (p) => {
      await p.getByRole('button', { name: /Drawdown|Request draw/i }).first().click().catch(() => undefined);
      await p.waitForTimeout(1_200);
      // Type a representative drawdown ticket: R12,500,000 against tranche A.
      const amount = p.getByLabel(/Amount|Drawdown amount|Value/i).first();
      await amount.click().catch(() => undefined);
      await p.keyboard.type('12500000', { delay: 70 });
      await p.waitForTimeout(900);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the IPP arc by panning the launch board — the audience sees
// every other surface available (project pipeline, financial model,
// drawdown queue, REC issuance, settlement, carbon registry, ESG).
test('ipp-feature-tour', async ({ page }) => {
  await shot(page, '/launch/ipp', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'ipp');
    },
  });
});
