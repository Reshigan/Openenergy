// ═══════════════════════════════════════════════════════════════════════════
// Meridian generic create→advance canary (green_bond_report, W202) — Playwright.
//
// This is the proof-of-selectors spec for the entire Meridian frontend. Every
// chain in MERIDIAN_CHAINS renders through the SAME four generic surfaces, so if
// the create→advance machine works for ONE initiation chain through the real
// deployed SPA, it works for all 76 of them. We drive it end-to-end as the IPP
// developer persona (the chain's lane owner — lanes: { ipp_developer: 'finance' }):
//
//   1. Deep-link to the chain's Ledger:  /ledger/green_bond_report  (LedgerPage).
//   2. Click the initiation "+ New" button (label = chain.initiation.label).
//   3. Fill the schema-driven FieldForm (inputs keyed #ff-<fieldKey>).
//   4. Submit; assert the create POST → 201 with { data: { id } }, composer closes.
//   5. Deep-link to the new case's Thread:  /thread/green_bond_report/:id.
//   6. Fire ONE valid advance action ("Start data gathering"); assert the action
//      POST → 200 and the status chip flips to "data gathering" with no error.
//
// State-machine note: the Thread actbar lists ALL role-permitted actions, valid
// or not. Firing an invalid transition returns 422 ("Action 'X' not valid from
// 'Y'") which the UI surfaces as a .act-error banner. The row is born in
// 'period_open' (open_period auto-applied at create), so the only valid first
// step is 'start_data_gathering' — which carries no fields and fires immediately.
//
// Identifiable test data: report_year is stamped E2E-CANARY-2026 so every row
// this suite writes to prod D1 is greppable and distinguishable from real data.
//
// Rate-limit discipline: reuse the global-setup IPP token (one login), seed it
// via localStorage + a mocked /auth/refresh — same pattern as the W188 spec.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const CHAIN_KEY = 'green_bond_report';
const CREATE_API = '/api/green-bond-reports';        // chain.initiation.path
const INIT_LABEL = 'Open green bond report';         // chain.initiation.label
const ADVANCE_LABEL = 'Start data gathering';        // first valid action from period_open

// Stamp so prod rows this suite writes are identifiable and greppable.
const REPORT_YEAR = 'E2E-CANARY-2026';
const ISSUANCE_ZAR = '500000000';

let SHARED_IPP_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_IPP_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_IPP_TOKEN not set — global-setup may have failed');
  SHARED_IPP_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_IPP_TOKEN) throw new Error('shared IPP token not initialised');
  const tokenValue = SHARED_IPP_TOKEN;
  // AuthContext bootstraps via httpOnly cookie refresh — not available in headless
  // Playwright. Intercept so AuthContext gets a valid token and calls /auth/me with
  // the Bearer JWT to authenticate normally.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token: tokenValue, expires_in: 3600 } }),
    });
  });
  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, tokenValue);
}

// CF bot-management and asset CDN occasionally 5xx on unrelated requests against
// prod; only the chain's own endpoints failing should fail the test.
function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
  );
}

test('Meridian: IPP opens a green bond report and advances it through the SPA', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    // Scope the 5xx guard to this chain's own endpoints to avoid prod CDN noise.
    if (s >= 500 && resp.url().includes('/green-bond-reports')) errors.push(`api.5xx: ${s} ${resp.url()}`);
  });

  await seedToken(page);

  // ── 1. Ledger: deep-link to the chain's list surface. ────────────────────
  await page.goto(`${baseURL}/ledger/${CHAIN_KEY}`, { waitUntil: 'load' });

  // The "+ New" button (LedgerPage .btn.pri, text = initiation.label) appears once
  // GET /api/ledger/:chainKey resolves with a non-null initiation block. exact:true
  // — existing case cards carry the title as a substring of their accessible name.
  const newBtn = page.getByRole('button', { name: INIT_LABEL, exact: true });
  await expect(newBtn).toBeVisible({ timeout: 20_000 });

  // ── 2 & 3. Open the +New veil and fill the schema-driven FieldForm. ───────
  await newBtn.click();
  const composer = page.getByRole('dialog', { name: INIT_LABEL });
  await expect(composer).toBeVisible({ timeout: 10_000 });

  await composer.locator('#ff-report_year').fill(REPORT_YEAR);
  await composer.locator('#ff-issuance_size_zar').fill(ISSUANCE_ZAR);

  // ── 4. Submit; capture the create POST. Backend returns 201 { data: { id } }.
  const [createResp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(CREATE_API) && r.request().method() === 'POST',
      { timeout: 20_000 },
    ),
    // Submit button lives inside the composer (same label as +New) — scope to the
    // dialog so we don't re-click the +New trigger behind the veil.
    composer.getByRole('button', { name: INIT_LABEL, exact: true }).click(),
  ]);

  expect(createResp.status(), `create POST returned ${createResp.status()}`).toBe(201);
  const created = await createResp.json();
  const newId = created?.data?.id ?? created?.id;
  expect(newId, 'create response should carry the new report id').toBeTruthy();

  // Composer closes on success (setComposeOpen(false)); the dialog disappears.
  await expect(composer).toBeHidden({ timeout: 10_000 });

  // ── 5. Thread: deep-link to the new case (deterministic — no list paging). ─
  await page.goto(`${baseURL}/thread/${CHAIN_KEY}/${newId}`, { waitUntil: 'load' });

  // The case body renders the status chip; freshly created rows sit in 'period_open'.
  await expect(page.locator('.case-head .chip')).toHaveText(/period open/i, { timeout: 20_000 });

  // ── 6. Advance one valid step. "Start data gathering" carries no fields, so it
  //       fires immediately on click (no veil). Capture the action POST → 200.
  const advanceBtn = page.getByRole('button', { name: ADVANCE_LABEL });
  await expect(advanceBtn).toBeVisible({ timeout: 10_000 });

  const [actionResp] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(`${CREATE_API}/`) && r.url().endsWith('/action') && r.request().method() === 'POST',
      { timeout: 20_000 },
    ),
    advanceBtn.click(),
  ]);

  expect(actionResp.status(), `advance POST returned ${actionResp.status()}`).toBe(200);
  const advanced = await actionResp.json();
  expect(advanced?.success, 'advance should succeed from period_open').toBe(true);
  // The action endpoint returns the refreshed row (data: updated); its status lives
  // in chain_status (the descriptor's statusCol), not a to_status field.
  expect(advanced?.data?.chain_status).toBe('data_gathering');

  // The thread reloads after a successful action: chip flips, no .act-error banner.
  await expect(page.locator('.case-head .chip')).toHaveText(/data gathering/i, { timeout: 10_000 });
  await expect(page.locator('.actbar .act-error')).toHaveCount(0);

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
