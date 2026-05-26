import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle } from './_helpers';

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
    waitFor: '[data-test^="kpi"], table tbody tr',
    interact: async (p) => {
      await smoothScroll(p, 300, 1000);
      await moveCursor(p, 780, 480);
      await p.locator('[data-test^="kpi"], .card').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('offtaker-bill-upload', async ({ page }) => {
  // Open the workstation directly on the Bill upload tab.
  await shot(page, '/offtaker-suite/workstation?tab=bills', {
    dwell: 16_000,
    waitFor: 'textarea, table tbody tr',
    interact: async (p) => {
      // Pause on the AI assist banner + form, then paste the sample bill so
      // the recording catches the "Analyse" → profile-card population beat.
      await p.waitForTimeout(900);
      await smoothScroll(p, 80, 700);
      await moveCursor(p, 720, 360);
      const ta = p.locator('textarea').first();
      await ta.click().catch(() => undefined);
      await p.waitForTimeout(400);
      await ta.fill(
        'ESKOM MEGAFLEX — Sandton head office — period 2026-05\n' +
        'Demand charge       2,500 kVA   R 535,500.00\n' +
        'Energy (peak)     180,000 kWh   R 1,140,300.00\n' +
        'Energy (standard) 540,000 kWh   R 1,118,400.00\n' +
        'Energy (off-peak) 280,000 kWh   R   316,400.00\n' +
        'Total energy    1,000,000 kWh   R 2,575,100.00',
      ).catch(() => undefined);
      await p.waitForTimeout(500);
      // Click "Analyse bill"
      await p.getByRole('button', { name: /Analyse bill/i })
        .click().catch(() => undefined);
      await p.waitForTimeout(2_500);
      // Hover the freshly-rendered TOU bar so the audience tracks where the
      // structured profile landed.
      await smoothScroll(p, 240, 700);
      await p.locator('[class*="rounded-full"]').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

test('offtaker-ai-analytics', async ({ page }) => {
  // Same workstation/tab — second beat where the operator hits "Optimise PPA
  // mix" and the AI returns a structured share/MWh/price recommendation.
  await shot(page, '/offtaker-suite/workstation?tab=bills', {
    dwell: 18_000,
    waitFor: 'textarea, table tbody tr',
    interact: async (p) => {
      // First analyse the sample (so latest is non-null for the optimise call).
      await p.getByRole('button', { name: /Analyse bill/i })
        .click().catch(() => undefined);
      await p.waitForTimeout(2_400);
      // Then optimise — this is the AI-recommendation beat.
      await smoothScroll(p, 320, 800);
      await moveCursor(p, 880, 420);
      await p.getByRole('button', { name: /Optimise PPA mix/i })
        .click().catch(() => undefined);
      await p.waitForTimeout(2_800);
      // Hover the top-ranked recommendation row + linger on the savings card.
      await smoothScroll(p, 520, 900);
      await p.locator('table tbody tr').nth(0)
        .hover().catch(() => undefined);
      await p.waitForTimeout(1_100);
      await smoothScroll(p, 700, 800);
      await p.waitForTimeout(900);
    },
  });
});

test('offtaker-procurement-rfp', async ({ page }) => {
  await shot(page, '/procurement', {
    dwell: 14_000,
    waitFor: 'table tbody tr, [data-test="rfp-row"]',
    interact: async (p) => {
      // Open the first RFP row, then open the bid-comparison tab + hover a bid.
      await p.locator('table tbody tr, [data-test="rfp-row"]').first()
        .click().catch(() => undefined);
      await p.waitForTimeout(1_100);
      await clickTabAndSettle(p, /Bid|Compar|Award/i);
      await smoothScroll(p, 240, 1000);
      await p.locator('[data-test="bid-row"], table tbody tr').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});
