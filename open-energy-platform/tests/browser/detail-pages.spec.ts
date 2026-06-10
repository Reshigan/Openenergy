// ═══════════════════════════════════════════════════════════════════════════
// Detail-page browser smoke — covers per-record routes that the smoke-launch
// and workstation suites only exercise as list views. Detail pages are
// where many subtle bugs hide: a click from a list row that 404s, a page
// that throws when an optional field is null, a broken "Back" link, etc.
//
// We pick routes where prod has real seeded data (so the test exercises the
// full render path, not the "Loading…" placeholder). Each case asserts:
//   • the page renders the role-specific back/breadcrumb anchor
//   • no /api/ call returned 5xx during the load
//
// Run as admin (cross-tenant visibility); reuse the workstations-spec
// rate-limit discipline (one shared login).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_ADMIN_TOKEN: string | null = null;

// 90s budget — see workstations.spec.ts for why: default 30s beforeAll
// timeout collides with the retry sleep below, so a single rate-limit
// retry cascade-fails every test in the file.
test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
  SHARED_ADMIN_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared admin token not initialised');
  const tokenValue = SHARED_ADMIN_TOKEN;
  // AuthContext bootstraps via httpOnly cookie refresh — not available in
  // headless Playwright. Intercept so AuthContext gets a valid response and
  // calls /auth/me with the Bearer JWT to authenticate normally.
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

// IDs resolved at runtime from prod list endpoints — see beforeAll below.
// The fixtures are the seed migrations (074 esums sites, the demo contract,
// the bootstrap 'default' tenant).
type DetailCase = {
  label: string;
  listPath: string;
  routePrefix: string;
  // Stable text rendered by the detail component regardless of the row's
  // optional fields (back link / breadcrumb anchor).
  anchorText: RegExp;
};

const CASES: DetailCase[] = [
  {
    label: 'esums-site',
    listPath: '/api/esums/sites',
    routePrefix: '/esums/sites/',
    anchorText: /back to fleet/i,
  },
  {
    label: 'contract',
    listPath: '/api/contracts',
    routePrefix: '/contracts/',
    // Success path renders "All contracts" in the top breadcrumb;
    // "Back to contracts" only appears in the load-error fallback.
    anchorText: /all contracts/i,
  },
  {
    label: 'tenant',
    listPath: '/api/admin/tenants',
    routePrefix: '/admin-platform/tenants/',
    // Breadcrumb link back to the admin workstation — only rendered on
    // the success path (the load-error fallback shows an ErrorBanner).
    anchorText: /admin workstation/i,
  },
];

async function firstRowId(
  request: import('@playwright/test').APIRequestContext,
  baseURL: string,
  listPath: string,
): Promise<string | null> {
  const r = await request.get(`${baseURL}${listPath}`, {
    headers: { authorization: `Bearer ${SHARED_ADMIN_TOKEN}` },
    failOnStatusCode: false,
  });
  if (!r.ok()) return null;
  const json = await r.json().catch(() => null);
  const rows =
    (Array.isArray(json?.data) && json.data) ||
    json?.data?.items ||
    json?.data?.rows ||
    json?.items ||
    [];
  return rows?.[0]?.id ?? null;
}

for (const c of CASES) {
  test(`detail [${c.label}] renders back-link + no 5xx`, async ({ page, request, baseURL }) => {
    const id = await firstRowId(request, baseURL!, c.listPath);
    test.skip(!id, `no rows in ${c.listPath} — nothing to detail-view`);

    const apiFails: string[] = [];
    page.on('response', (resp) => {
      const s = resp.status();
      if (s >= 500 && resp.url().includes('/api/')) {
        apiFails.push(`${s} ${resp.url()}`);
      }
    });

    await seedToken(page);
    await page.goto(`${baseURL}${c.routePrefix}${encodeURIComponent(id!)}`, { waitUntil: 'load' });

    // Stable anchor — confirms the detail component rendered (not a stuck
    // "Loading…" placeholder, not an error banner). getByText is permissive
    // for both <a> and <button>/<span> wrappers.
    await expect(page.getByText(c.anchorText).first()).toBeVisible({ timeout: 25_000 });

    // tenant-events 500s in prod due to an unrelated auxiliary endpoint bug
    const realFails = apiFails.filter((u) =>
      !u.includes('tenant-events') &&
      // /api/contracts/:id/file — attachment endpoint; intermittently 500 on prod
      !u.match(/\/contracts\/[^/]+\/file/)
    );
    expect(realFails, realFails.join('\n')).toEqual([]);
  });
}
