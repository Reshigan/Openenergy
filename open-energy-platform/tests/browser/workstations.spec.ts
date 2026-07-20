// ═══════════════════════════════════════════════════════════════════════════
// Workstations browser smoke — covers every role workstation that uses the
// shared WorkstationShell primitive. Currently 8 routes: Trader, IPP,
// Offtaker, Carbon, Admin (platform), Regulator, Grid operator, Support.
// Lender doesn't have a dedicated workstation route (`/lender-suite` is
// itself the workstation) — that surface is exercised by
// scripts/smoke-launch-per-role.sh.
//
// Read-only: we log in once as admin (who can view any workstation) and
// route to each one to assert the tab nav. We do NOT fire state transitions
// — prod-write coverage lives in scripts/smoke-crud.sh.
//
// One login total: the smoke pipeline already burns 10+ /api/auth/login
// hits by the time Playwright runs (smoke-crud + smoke-roles + smoke-cron
// + the prior browser specs). Sharing a single admin token across all
// workstation tests keeps us well inside the 10 / 5 min sensitive-route
// rate-limit budget. Admin has cross-tenant visibility, so every
// workstation route renders for them.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_ADMIN_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
  SHARED_ADMIN_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared admin token not initialised');
  const tokenValue = SHARED_ADMIN_TOKEN;

  // AuthContext bootstraps via httpOnly cookie refresh which isn't available
  // in headless Playwright. Intercept /auth/refresh to return a valid access
  // token; AuthContext then calls /auth/me with the Bearer JWT and succeeds.
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
  // The browser logs a generic "Failed to load resource: ...status of NNN ()"
  // console.error for every non-2xx response, but the message has no URL in
  // it. We catch real 5xx via the response listener (which has the URL), so
  // these console-error rows would just be noisy duplicates without
  // diagnostic value — drop them all here.
  //
  // ServiceWorkerRegistration / fonts.cdnfonts 404s are pre-existing prod
  // noise we don't want to fix in this commit.
  //
  // Auxiliary endpoints that intermittently 500 on prod — unrelated to the
  // workstation chrome + tab rendering under test:
  //   - notifications/unread-count: sidebar badge; ipp_developer workstation
  //   - insights/chain/: AI insight cards; grid_operator workstation
  //   - grid-operator/curtailment: ancillary data panel; grid_operator workstation
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('notifications/unread-count') ||
    msg.includes('insights/chain/') ||
    msg.includes('grid-operator/curtailment') ||
    // Network-level connection resets (transient CF worker restarts under load)
    msg.includes('ERR_CONNECTION_CLOSED')
  );
}

// v2 rebuild: every legacy `/<role>/workstation` route now redirects into
// the v2 rebuild (`<Navigate to="/v2" replace />` or via an intermediate hop
// through the retired `/cockpit`/`/horizon` routes, which themselves now
// redirect to `/v2`). The tab-based workstation surfaces are retired.
// This suite now asserts the REDIRECT CONTRACT — each retired route lands
// on the v2 shell.
const RETIRED_WORKSTATION_ROUTES: string[] = [
  '/trader-risk/workstation',
  '/ipp-lifecycle/workstation',
  '/offtaker-suite/workstation',
  '/carbon-registry/workstation',
  '/admin-platform/workstation',
  '/regulator-suite/workstation',
  '/grid-operator/workstation',
  '/support/workstation',
];

for (const route of RETIRED_WORKSTATION_ROUTES) {
  test(`retired workstation [${route}] redirects into v2`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
    // Response-level 5xx capture — gives us the URL, which the generic
    // "Failed to load resource" console-error message hides.
    page.on('response', (resp) => {
      const s = resp.status();
      if (s >= 500 && resp.url().includes('/api/')) {
        errors.push(`api.5xx: ${s} ${resp.url()}`);
      }
    });

    await seedToken(page);
    await page.goto(`${baseURL}${route}`, { waitUntil: 'load' });

    // Redirect lands on the v2 shell.
    await page.waitForURL('**/v2', { timeout: 15_000 });
    await expect(page.locator('nav.v2-nav')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.v2-brand')).toBeVisible();

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
}
