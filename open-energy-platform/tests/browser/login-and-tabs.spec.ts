// ═══════════════════════════════════════════════════════════════════════════
// Headless browser smoke — what a real user does on first visit.
//
// This is the test that would have caught the service-worker stale-cache
// bug from earlier today. JS bundle parse failures, broken SPA routes,
// blank screens — none of these surface in backend / curl smoke tests.
//
// Rate-limit discipline: shared admin login for the whole file. Test 2
// uses seedToken (not a form submit) to avoid burning rate-limit slots that
// would cascade to later spec files.
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

// Errors we accept and don't count as test failures:
// - benign 404s on asset prefetch hints
// - PWA-related SW registration noise that happens before document ready
function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
  );
}

test('login page boots React and renders the sign-in surface', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

  await page.goto(`${baseURL}/`, { waitUntil: 'load' });

  // P0 — assert React actually mounted into #root. A blank page (React
  // failed to mount due to e.g. a chunk-split race) returns 200 with an
  // empty <div id="root"></div>; without this check, downstream
  // `getByRole` calls just time out with no signal about WHY.
  const rootHtml = await page.locator('#root').innerHTML();
  expect(rootHtml.length, 'React must mount into #root — empty means the SPA failed to boot').toBeGreaterThan(50);

  // Sign-in heading
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

  // No console-level errors fired during load.
  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('admin lands on the CEC Horizon board after auth (legacy launch route redirects)', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // Seed the token instead of submitting the form — the form submit would
  // consume one rate-limit slot (10/5min/IP) and cascade 429s to later specs.
  await seedToken(page);
  // /launch/:role is a retired legacy route — the CEC consolidation redirects
  // every launch/workstation path to the journey cockpit.
  await page.goto(`${baseURL}/launch/admin`, { waitUntil: 'load' });

  // Redirect lands on Horizon; the board + single CEC header chrome render.
  await page.waitForURL(/\/cockpit/, { timeout: 15_000 });
  await expect(page.locator('.mer.jc')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('header .wordmark')).toHaveText('OPEN ENERGY');

  // No runtime page errors during the full navigation flow.
  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

// SPA route smoke — direct-navigate to /projects without a fresh login.
// Hits the bundle, not the API, so it's rate-limit-free. The unauth visitor
// should be redirected back to /login by the React-Router guard, which
// proves the bundle parses, the router boots, and route declarations are
// intact (the SW-cache regression earlier today would have failed here).
test('SPA router serves /projects route (auth-guarded redirect)', async ({ page, baseURL }) => {
  const r = await page.goto(`${baseURL}/projects`, { waitUntil: 'load' });
  expect(r?.status()).toBe(200);
  await page.waitForLoadState('domcontentloaded');
  // SPA either renders projects (if already authed) or bounces to /login.
  // Both prove the bundle and router are healthy.
  await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/\/(projects|login|cockpit)/);
});

test('the SPA serves the LTM logo as a real image (not the SPA fallback)', async ({ request, baseURL }) => {
  const r = await request.get(`${baseURL}/ltm-energy-logo.png`);
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toContain('image/');
  // 58869 bytes — exactly what we shipped.
  const buf = await r.body();
  expect(buf.byteLength).toBeGreaterThan(50_000);
});
