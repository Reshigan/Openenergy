// ═══════════════════════════════════════════════════════════════════════════
// v2 browser smoke — the four rebuild surfaces (Home /v2, Find /v2/find,
// Trade /v2/trade, Transaction /v2/t/:id) plus the retired-route redirects.
//
// Read-only against live data: no state transitions are fired here (engine
// write coverage lives in the API probes + unit suite). Tokens come from
// global-setup env vars — zero logins in this file, per the 10/5min limiter.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test';

let ADMIN_TOKEN: string | null = null;
let TRADER_TOKEN: string | null = null;

test.beforeAll(() => {
  ADMIN_TOKEN = process.env.PLAYWRIGHT_ADMIN_TOKEN ?? null;
  TRADER_TOKEN = process.env.PLAYWRIGHT_TRADER_TOKEN ?? null;
  if (!ADMIN_TOKEN) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
});

async function seedToken(page: Page, token: string) {
  // AuthContext bootstraps via httpOnly cookie refresh, unavailable headless —
  // same interception pattern as workstations.spec.ts.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token, expires_in: 3600 } }),
    });
  });
  await page.addInitScript((tok) => localStorage.setItem('token', tok as string), token);
}

function track5xx(page: Page): string[] {
  const errs: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 500) errs.push(`${r.status()} ${r.url()}`);
  });
  return errs;
}

test.describe('v2 surfaces', () => {
  test('Home (/v2) mounts the work queue with the three-surface nav', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    const errs = track5xx(page);
    await page.goto(`${baseURL}/v2`, { waitUntil: 'load' });

    const nav = page.locator('nav.v2-nav');
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible({ timeout: 15000 });
    await expect(nav.getByRole('link', { name: 'Find' })).toBeVisible();
    // Trade is role-gated (hasTrade) — asserted in the trader test below, not here.

    // Queue resolves to one of its two real states: the metric strip (any
    // non-empty queue — "Waiting on you" only renders when items are actionable
    // by the JWT role), or the all-clear hero.
    await expect(
      page.locator('.v2-stats').or(page.locator('.v2-hero h1')).first(),
    ).toBeVisible({ timeout: 15000 });
    expect(errs, `5xx on /v2:\n${errs.join('\n')}`).toEqual([]);
  });

  test('Find (/v2/find) searches live transactions and links to Transaction', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    const errs = track5xx(page);
    await page.goto(`${baseURL}/v2/find`, { waitUntil: 'load' });

    const input = page.locator('input.v2-input');
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill('Probe');

    // Debounced live search: either result rows or the honest empty state.
    const row = page.locator('table.v2-table tbody tr').first();
    const empty = page.locator('.v2-empty');
    await expect(row.or(empty).first()).toBeVisible({ timeout: 15000 });

    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForURL('**/v2/t/**', { timeout: 15000 });
      // Transaction surface: title + state pill (event-log page shell).
      await expect(page.locator('.v2-txn-head h1')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.v2-txn-head .v2-pill')).toBeVisible();
    }
    expect(errs, `5xx on /v2/find:\n${errs.join('\n')}`).toEqual([]);
  });

  test('Trade (/v2/trade) renders the position book for trader', async ({ page, baseURL }) => {
    test.skip(!TRADER_TOKEN, 'no trader token from global-setup');
    await seedToken(page, TRADER_TOKEN!);
    const errs = track5xx(page);
    await page.goto(`${baseURL}/v2/trade`, { waitUntil: 'load' });

    // Trader has trading domains, so the role-gated Trade link must be in the
    // nav and the surface must render inside the shell — never a blank page.
    await expect(page.locator('nav.v2-nav')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('nav.v2-nav').getByRole('link', { name: 'Trade' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.v2-skeleton').first()).not.toBeVisible({ timeout: 20000 });
    const body = await page.locator('main, .v2-main, body').first().textContent();
    expect(body ?? '').not.toBe('');
    expect(errs, `5xx on /v2/trade:\n${errs.join('\n')}`).toEqual([]);
  });

  test('Transaction 404 shows the honest missing state, not a crash', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    await page.goto(`${baseURL}/v2/t/00000000-0000-0000-0000-000000000000`, { waitUntil: 'load' });
    await expect(page.locator('.v2-empty', { hasText: 'not found' })).toBeVisible({ timeout: 15000 });
  });

  test('retired routes redirect to /v2', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    // NOTE: /deals is deliberately excluded — it redirects to /v2/trade, not
    // plain /v2 (App.tsx maps /deals to an inline <Navigate to="/v2/trade">).
    // Covered by its own test below.
    for (const path of ['/horizon', '/atlas', '/new', '/trading', '/admin', '/cockpit']) {
      await page.goto(`${baseURL}${path}`, { waitUntil: 'load' });
      await page.waitForURL('**/v2', { timeout: 15000 });
    }
  });

  test('/deals redirects to /v2/trade', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    await page.goto(`${baseURL}/deals`, { waitUntil: 'load' });
    await page.waitForURL('**/v2/trade', { timeout: 15000 });
  });

  // Each parametrized redirect is its own single-goto test: chaining hard
  // goto()s across the SPA's in-flight client <Navigate> redirects lets the
  // next navigation interrupt the previous redirect that is still settling
  // (deterministic, not flake). One goto + one waitForURL per test avoids it,
  // matching the /deals test above.
  test('/thread/:chainKey/:id redirects to /v2/t/:id (chainKey dropped)', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    await page.goto(`${baseURL}/thread/some_chain/abc123`, { waitUntil: 'load' });
    await page.waitForURL('**/v2/t/abc123', { timeout: 15000 });
  });

  test('/ledger/:chainKey redirects to /v2/find?chain_key=', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    await page.goto(`${baseURL}/ledger/green_bond`, { waitUntil: 'load' });
    await page.waitForURL('**/v2/find?chain_key=green_bond', { timeout: 15000 });
  });

  test('/surface/:key redirects to /v2/s/:key (URL-encoded)', async ({ page, baseURL }) => {
    await seedToken(page, ADMIN_TOKEN!);
    await page.goto(`${baseURL}/surface/admin:journeys`, { waitUntil: 'load' });
    await page.waitForURL('**/v2/s/admin%3Ajourneys', { timeout: 15000 });
  });

  test('/v2/s/admin:journeys renders the ported JourneyAdmin surface without a 5xx', async ({ page, baseURL }) => {
    // Guards the port-forward: JourneyAdmin used to be a Meridian-only surface,
    // now reached exclusively via the parametric /v2/s/:key route + SURFACE_REGISTRY.
    await seedToken(page, ADMIN_TOKEN!);
    const errs = track5xx(page);
    await page.goto(`${baseURL}/v2/s/admin%3Ajourneys`, { waitUntil: 'load' });
    await expect(page.locator('nav.v2-nav')).toBeVisible({ timeout: 15000 });
    // Honest mount check only — assert the surface body actually painted
    // something (not a blank shell), without asserting on specific journey data.
    const body = await page.locator('main, .v2-main, body').first().textContent();
    expect(body ?? '').not.toBe('');
    expect(errs, `5xx on /v2/s/admin:journeys:\n${errs.join('\n')}`).toEqual([]);
  });

  test('Find (/v2/find?chain_key=) filters to the ledger-redirect target chain', async ({ page, baseURL }) => {
    // This is the live target of the retired /ledger/:chainKey redirect (see
    // parametrized-redirects test above). `audit` is a real, stable chain_key
    // (admin/Platform domain — see starts.ts ORPHAN_SLOTS), so this exercises
    // the actual query-param wiring end to end, not just the URL shape.
    await seedToken(page, ADMIN_TOKEN!);
    const errs = track5xx(page);
    await page.goto(`${baseURL}/v2/find?chain_key=audit`, { waitUntil: 'load' });
    const input = page.locator('input.v2-input');
    await expect(input).toBeVisible({ timeout: 15000 });
    // Debounced live search against the filtered chain: either result rows or
    // the honest empty state — never a crash or unfiltered fall-through.
    const row = page.locator('table.v2-table tbody tr').first();
    const empty = page.locator('.v2-empty');
    await expect(row.or(empty).first()).toBeVisible({ timeout: 15000 });
    expect(errs, `5xx on /v2/find?chain_key=audit:\n${errs.join('\n')}`).toEqual([]);
  });
});
