import { test } from '@playwright/test';
import { ensureToken, seedTokenAuth, shot, smoothScroll, moveCursor, clickTabAndSettle, featureTour } from './_helpers';

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

// ─── LOI list — the offtaker's outbox of indications-of-interest ──────
test('offtaker-loi-list', async ({ page }) => {
  await shot(page, '/lois', {
    dwell: 12_000,
    waitFor: 'table tbody tr, [data-test="kpi"]',
    interact: async (p) => {
      // Pause on the KPI strip (Total / Sent / Received / Accepted),
      // then smooth-scroll the table so the audience sees the LOI rows.
      await p.waitForTimeout(900);
      await moveCursor(p, 480, 280);
      await p.waitForTimeout(700);
      await smoothScroll(p, 180, 900);
      await p.locator('table tbody tr').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

// ─── LOI detail — the IPP receives a draft and accepts it ─────────────
// Logs in as IPP (counterparty on the demo LOIs) so the Respond panel
// renders with Accept / Decline buttons against a real `drafted` LOI.
test('offtaker-loi-accept', async ({ page, request, baseURL }) => {
  const ippToken = await ensureToken(request, baseURL!, 'ipp');
  await seedTokenAuth(page, ippToken);
  await shot(page, '/lois', {
    dwell: 18_000,
    waitFor: 'table tbody tr',
    interact: async (p) => {
      // Step 1 — open the first drafted LOI. The IPP is the `to_participant`
      // on every demo LOI so the row click drops us at /lois/:id with the
      // "Respond to this LOI" panel visible.
      await p.waitForTimeout(700);
      await p.locator('table tbody tr a, table tbody tr')
        .first().click().catch(() => undefined);
      await p.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      await p.waitForTimeout(1_400);

      // Step 2 — scroll to the Respond panel + hover Accept to telegraph
      // intent before clicking. Pause on the green "Accept & create term
      // sheet" CTA so the V/O can read the ECT Act 25/2002 line.
      await smoothScroll(p, 380, 900);
      const accept = p.getByRole('button', { name: /Accept .* term sheet/i });
      await accept.hover().catch(() => undefined);
      await p.waitForTimeout(1_400);

      // Step 3 — fire Accept. Server spawns a draft Term Sheet contract
      // and the LOI flips to status=signed.
      await accept.click().catch(() => undefined);
      await p.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await p.waitForTimeout(2_400);

      // Step 4 — settle on the post-accept state ("Accepted" pill + Open
      // contract link). Cursor parks on the contract link so the audience
      // sees the bridge from LOI → contract.
      await smoothScroll(p, 0, 700);
      await p.locator('a:has-text("Open contract")').first()
        .hover().catch(() => undefined);
      await p.waitForTimeout(900);
    },
  });
});

// ─── Contract digital signature — ECT Act 25/2002 typed-name signing ──
// Open the most-recent term-sheet contract and walk through the signature
// modal. We do NOT click the final Sign button (that would mutate state
// on prod) — instead we fill name + tick the agreement so the audience
// sees the affirmation UI, then dismiss.
test('offtaker-contract-sign', async ({ page }) => {
  await shot(page, '/contracts', {
    dwell: 22_000,
    waitFor: 'table tbody tr',
    interact: async (p) => {
      await p.waitForTimeout(900);
      // Pick the most-recent term-sheet row.
      const firstRow = p.locator('table tbody tr a, table tbody tr').first();
      await firstRow.click().catch(() => undefined);
      await p.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
      await p.waitForTimeout(1_400);

      // Pause on the contract header (title, version, phase pill) before
      // opening the signature modal so the audience sees the document.
      await smoothScroll(p, 240, 900);
      await p.waitForTimeout(900);

      // Open the Sign modal.
      const signBtn = p.getByRole('button', { name: /^Sign/i }).first();
      await signBtn.hover().catch(() => undefined);
      await p.waitForTimeout(700);
      await signBtn.click().catch(() => undefined);
      await p.waitForTimeout(1_200);

      // Step through the modal — typed-name affirmation per ECT Act §13(3).
      const nameInput = p.locator('input[type="text"]').last();
      await nameInput.click().catch(() => undefined);
      await nameInput.type('Thabo Molefe', { delay: 80 }).catch(() => undefined);
      await p.waitForTimeout(900);

      // Tick the ECT Act consent checkbox.
      const consent = p.locator('input[type="checkbox"]').last();
      await consent.check().catch(() => undefined);
      await p.waitForTimeout(1_200);

      // Hover the Sign button so the modal looks ready to fire — but
      // dismiss without clicking. Production data stays intact for the
      // next run of this shot.
      await p.getByRole('button', { name: /Sign contract/i })
        .hover().catch(() => undefined);
      await p.waitForTimeout(2_400);
      await p.keyboard.press('Escape').catch(() => undefined);
      await p.waitForTimeout(600);
    },
  });
});

// ─── End-of-role feature tour ─────────────────────────────────────────
// Closes the offtaker arc by panning the launch board — bills, RFP
// procurement, LOI inbox, contracts, settlement statements, carbon
// footprint (Scope 1/2/3), ESG disclosures.
test('offtaker-feature-tour', async ({ page }) => {
  await shot(page, '/launch/offtaker', {
    dwell: 14_000,
    waitFor: '[data-test^="kpi"], a[href^="/"]',
    interact: async (p) => {
      await featureTour(p, 'offtaker');
    },
  });
});
