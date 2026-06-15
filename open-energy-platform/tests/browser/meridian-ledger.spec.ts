// ═══════════════════════════════════════════════════════════════════════════
// Meridian Ledger browser smoke — per-chain list surface at /ledger/:chainKey
// and the schema-driven action form on the Thread surface, for the
// covenant_certificate chain (Wave 38).
//
// WHAT THIS PROVES (the vertical-slice UI proof for the Meridian Ledger):
//   1. LedgerPage renders its chrome end-to-end against live prod data — the
//      KPI strip (Certificates / Breached / Outstanding), the status filter
//      pills ("All" + the four covenant filters), and the card list (or the
//      explicit empty state when the target env has no covenant rows).
//   2. A filter pill toggles its active (aria-pressed) state and refetches the
//      ledger with ?status=… without a 5xx.
//   3. Card → Thread → the "Declare breach" action opens the FieldForm veil
//      with the correct registry-driven fields (reason_code enum incl.
//      dscr_breach, breached_covenants string, breach_basis evidence textarea),
//      the submit button enables once required fields are filled, then the veil
//      dismisses on Escape.
//
// WHY THE LENDER TOKEN: lender is a write party on covenant_certificate
// (registry roles = {admin, support, lender} on both begin-review and
// flag-breach), and covenant_certificate's lender lane is 'monitoring' — so the
// lender sees the ledger, the cards, the thread AND the action bar.
// (covenant_certificate is a three-lane chain — lender:'monitoring',
// ipp_developer:'finance', regulator:'enforcement_regulator'; see
// meridian.spec.ts for the two-sided thread proof.)
//
// WHY IT STOPS SHORT OF SUBMITTING (prod-safe, read-mostly): firing the
// flag-breach POST mutates prod state IRREVERSIBLY — it transitions the
// certificate into breach_identified, opens a cure window and adds the facility
// to the W6 watchlist. That state-machine transition + audit-row behaviour is
// already owned and covered by the vitest spec
// tests/covenant-certificate-spec.test.ts. This browser spec therefore proves
// only that the FieldForm veil opens with the right schema and that submit
// becomes enabled — then dismisses without POSTing.
//
// Zero logins in this file: global-setup already authenticated all 9 demo
// roles and stashed tokens in PLAYWRIGHT_{ROLE}_TOKEN env vars. Reusing
// PLAYWRIGHT_LENDER_TOKEN keeps us inside the 10 / 5 min sensitive-route
// rate-limit budget (same pattern as meridian.spec.ts / workstations.spec.ts).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_LENDER_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_LENDER_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_LENDER_TOKEN not set — global-setup may have failed');
  SHARED_LENDER_TOKEN = tok;
});

// Copied verbatim from meridian.spec.ts: AuthContext bootstraps via an httpOnly
// cookie refresh which isn't available in headless Playwright. Intercept
// /auth/refresh to return a valid access token; AuthContext then calls
// /auth/me with the Bearer JWT and succeeds.
async function seedToken(page: import('@playwright/test').Page, token?: string) {
  const tokenValue = token ?? SHARED_LENDER_TOKEN;
  if (!tokenValue) throw new Error('shared lender token not initialised');

  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { token: tokenValue, expires_in: 3600 },
      }),
    });
  });

  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  // Same noise filter as meridian.spec.ts / workstations.spec.ts.
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('notifications/unread-count') ||
    msg.includes('ERR_CONNECTION_CLOSED')
  );
}

// Wire up pageerror / console.error / api-5xx capture on a page (mirrors the
// captureErrors helper in meridian.spec.ts; response listener gives us the URL
// the generic "Failed to load resource" console message hides).
function captureErrors(p: import('@playwright/test').Page, errors: string[]) {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  p.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${s} ${resp.url()}`);
    }
  });
}

test.describe('Meridian Ledger — covenant_certificate', () => {
  test('ledger renders KPI strip, filter pills, and cards-or-empty', async ({ page, baseURL }) => {
    const errors: string[] = [];
    captureErrors(page, errors);

    await seedToken(page);
    await page.goto(`${baseURL}/ledger/covenant_certificate`, { waitUntil: 'load' });

    // Lazy chunk + "Loading ledger…" precede the board; 25s for the chunk to
    // download and GET /api/ledger/covenant_certificate to resolve.
    await expect(page.locator('.mer.ledger')).toBeVisible({ timeout: 25_000 });

    // KPI strip — covenant exposes Certificates / Breached / Outstanding.
    await expect(page.locator('.kpis')).toBeVisible();
    expect(await page.locator('.kpi').count()).toBeGreaterThanOrEqual(1);

    // Filter pills — "All" + at least one named filter ("Active breach").
    const pills = page.getByRole('group', { name: 'Filter by status' });
    await expect(pills).toBeVisible();
    await expect(pills.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(pills.getByRole('button', { name: 'Active breach' })).toBeVisible();

    // Cards or the explicit empty state — data-dependent on the target env.
    await expect(page.locator('.lcard, .lcard-empty').first()).toBeVisible();

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('filter pill toggles active state', async ({ page, baseURL }) => {
    const errors: string[] = [];
    captureErrors(page, errors);

    await seedToken(page);
    await page.goto(`${baseURL}/ledger/covenant_certificate`, { waitUntil: 'load' });
    await expect(page.locator('.mer.ledger')).toBeVisible({ timeout: 25_000 });

    // Clicking a named filter pill sets aria-pressed and refetches with
    // ?status=under_review. Scope to the pills group (and exact match) — a
    // card's accessible name can also contain the status text "under review".
    const pills = page.getByRole('group', { name: 'Filter by status' });
    const underReview = pills.getByRole('button', { name: 'Under review', exact: true });
    await underReview.click();
    await expect(underReview).toHaveAttribute('aria-pressed', 'true');

    // "All" must no longer be the active pill.
    await expect(pills.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'false');

    // The refetched list may be empty after filtering — that's fine; assert the
    // list region still renders (cards or empty state).
    await expect(page.locator('.lcard, .lcard-empty').first()).toBeVisible();

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('card → thread → Declare-breach opens schema-driven form, then dismiss', async ({ page, baseURL }) => {
    const errors: string[] = [];
    captureErrors(page, errors);

    await seedToken(page);
    await page.goto(`${baseURL}/ledger/covenant_certificate`, { waitUntil: 'load' });
    await expect(page.locator('.mer.ledger')).toBeVisible({ timeout: 25_000 });

    // Prod data-dependent: skip gracefully if the target env has no covenant
    // cases to drill into.
    const n = await page.locator('.lcard').count();
    test.skip(n === 0, 'no covenant cases in target env');

    // Drill into the first card → its Thread.
    await page.locator('.lcard').first().click();
    await page.waitForURL(/\/thread\/covenant_certificate\//, { timeout: 15_000 });

    await expect(page.locator('.mer.thread')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.case-head h1')).toBeVisible();
    await expect(page.locator('.actbar')).toBeVisible();

    // "Declare breach" is the lender's fields-carrying action. It may be absent
    // if the case's current status doesn't permit lender actions — skip if so.
    const declare = page.getByRole('button', { name: 'Declare breach' });
    test.skip(await declare.count() === 0, 'case status does not expose the Declare-breach action');

    // Clicking opens the FieldForm veil — it does NOT immediately POST (only
    // fieldless actions like "Begin review" POST on click, which is why we
    // never touch that button here).
    await declare.click();
    const dialog = page.locator('.mer.veil .veil-body[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Schema-driven fields from the registry (verified):
    //  - reason_code enum select with dscr_breach option
    //  - breached_covenants string input
    //  - breach_basis evidence textarea
    await expect(page.locator('#ff-reason_code')).toBeVisible();
    await expect(page.locator('#ff-reason_code option[value="dscr_breach"]')).toHaveCount(1);
    await expect(page.locator('#ff-breached_covenants')).toBeVisible();
    await expect(page.locator('#ff-breach_basis')).toBeVisible();

    // Fill required fields; the submit button must enable.
    await page.locator('#ff-reason_code').selectOption('dscr_breach');
    await page.locator('#ff-breached_covenants').fill('DSCR < 1.20x for Q2 (smoke-test, not submitted)');
    await page.locator('#ff-breach_basis').fill('UI smoke proof only — not firing the irreversible breach transition.');

    const submit = page.locator('.veil-body form.composer button.btn.pri');
    await expect(submit).toBeEnabled();

    // DO NOT SUBMIT. Firing flag-breach mutates prod state irreversibly
    // (transitions to breach_identified, opens the cure window, watchlists the
    // facility via W6). That transition + audit-row behaviour is already owned
    // by the vitest spec tests/covenant-certificate-spec.test.ts. This browser
    // spec is a prod-safe read-mostly smoke: it proves the form opens with the
    // right schema and that submit enables, then dismisses without POSTing.
    await page.keyboard.press('Escape');
    await expect(page.locator('.mer.veil')).toHaveCount(0, { timeout: 15_000 });

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
});
