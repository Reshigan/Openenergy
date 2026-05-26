import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

test.describe.configure({ mode: 'serial' });

let TOKEN: string;

// The corporate-offtaker persona owns the carbon footprint surface — they
// have Scope 1/2/3 transactions, SBTi targets, REC retirements, and
// CDP/JSE-SRL/ISSB submissions in the seed data (migration 090).
test.beforeAll(async ({ request, baseURL }) => {
  TOKEN = await ensureToken(request, baseURL!, 'offtaker');
}, 90_000);

test.beforeEach(async ({ page }) => {
  await seedTokenAuth(page, TOKEN);
});

// ─── ESG cockpit — overview (rollup + scope split) ────────────────────
// First beat shows the current-year rollup: Scope 1+2 location-based vs
// market-based, intensity, renewable %, data quality score.
test('esg-overview', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr, .recharts-surface',
    interact: async (p) => {
      await p.waitForTimeout(900);
      await moveCursor(p, 480, 280);
      // Pan down to the scope-split pie + intensity card.
      await smoothScroll(p, 320, 1000);
      await p.locator('.recharts-surface').first().hover().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

// ─── Transactions ledger (Watershed-grade per-event accounting) ───────
// The "drillable audit chain" beat — every kWh, every diesel litre, every
// tonne-km of freight is one row, with the emission factor used at calc
// time stored alongside for audit replay.
test('esg-transactions-ledger', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr',
    interact: async (p) => {
      await p.waitForTimeout(700);
      await clickTabAndSettle(p, /Transactions/i);
      // Scroll the ledger so the audience reads the Scope 1 → 2 → 3 mix.
      await smoothScroll(p, 240, 1000);
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(900);
      await smoothScroll(p, 520, 900);
      await p.locator('table tbody tr').nth(4).hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

// ─── SBTi targets ──────────────────────────────────────────────────────
// SBTi-validated 1.5C target + 2045 net-zero commitment + 100% renewable
// by 2028 — three rows that map directly to the V/O ("Watershed-grade
// targets, SBTi-validated").
test('esg-targets-sbti', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 12_000,
    waitFor: '[data-test^="kpi"], table tbody tr',
    interact: async (p) => {
      await clickTabAndSettle(p, /Targets/i);
      await smoothScroll(p, 180, 1000);
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

// ─── MACC initiatives (marginal abatement cost curve) ─────────────────
// Wind PPA, on-site solar, BMS retrofit, fleet electrification — sorted
// by R/tCO2e. The V/O calls this "the cheapest carbon money can buy".
test('esg-initiatives-macc', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], table tbody tr, .recharts-surface',
    interact: async (p) => {
      await clickTabAndSettle(p, /Initiatives|MACC/i);
      await smoothScroll(p, 240, 1100);
      // Hover the cheapest abatement project (Karoo Wind PPA — R72/tCO2e)
      // so the audience reads the negative-cost win.
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(1_300);
    },
  });
});

// ─── REC market — Scope 2 market-based bridge ─────────────────────────
// Shows the I-REC certificate inventory + retirements bridging the
// location-based vs market-based Scope 2 delta.
test('esg-rec-retirements', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 12_000,
    waitFor: 'table tbody tr',
    interact: async (p) => {
      await clickTabAndSettle(p, /REC|RECs|Certificates/i);
      await smoothScroll(p, 220, 1000);
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

// ─── Disclosures — CDP, JSE-SRL, ISSB S2, TCFD ────────────────────────
// Six rows: CDP A- target, JSE-SRL listing requirement, inaugural ISSB
// S2, GHG Protocol inventory, prior-year TCFD baseline, and the IPP's
// CDP submission. The "regulator-grade reporting" closing beat.
test('esg-disclosures-published', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 16_000,
    waitFor: 'table tbody tr',
    interact: async (p) => {
      await clickTabAndSettle(p, /Disclosures|Reports/i);
      await smoothScroll(p, 180, 1100);
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(1_200);
      await smoothScroll(p, 480, 900);
      await p.locator('table tbody tr').nth(2).hover().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

// ─── TCFD risk register (physical + transition) ───────────────────────
test('esg-tcfd-risks', async ({ page }) => {
  await shot(page, '/esg', {
    dwell: 12_000,
    waitFor: 'table tbody tr',
    interact: async (p) => {
      await clickTabAndSettle(p, /Risks?/i);
      await smoothScroll(p, 200, 1000);
      await p.locator('table tbody tr').first().hover().catch(() => undefined);
      await p.waitForTimeout(1_100);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the ESG arc by panning over the offtaker's launch board so the
// audience sees every other surface the same login unlocks (procurement,
// LOI inbox, contracts, settlement, bills, carbon registry, …).
test('esg-feature-tour', async ({ page }) => {
  await shot(page, '/launch/offtaker', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'offtaker');
    },
  });
});
