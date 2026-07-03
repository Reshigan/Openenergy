// ═══════════════════════════════════════════════════════════════════════════
// Meridian browser smoke — Horizon board at /horizon.
//
// Read-only: we assert the board chrome (bucket header, lanes-or-empty),
// the duty stream aside and the CEC brand wordmark render for the lender
// persona. We do NOT fire duty-stream actions — chain-write coverage lives
// in the per-wave unit suites.
//
// Zero logins in this file: globalSetup already authenticated all 9 demo
// roles and stashed tokens in PLAYWRIGHT_{ROLE}_TOKEN env vars. Reusing
// PLAYWRIGHT_LENDER_TOKEN keeps us inside the 10 / 5 min sensitive-route
// rate-limit budget (same pattern as workstations.spec.ts).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_LENDER_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_LENDER_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_LENDER_TOKEN not set — global-setup may have failed');
  SHARED_LENDER_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page, token?: string) {
  const tokenValue = token ?? SHARED_LENDER_TOKEN;
  if (!tokenValue) throw new Error('shared lender token not initialised');

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
  // Same noise filter as workstations.spec.ts: the generic non-2xx
  // console.error has no URL (real 5xx is caught via the response listener),
  // and ServiceWorker / cdnfonts 404s are pre-existing prod noise.
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('notifications/unread-count') ||
    msg.includes('ERR_CONNECTION_CLOSED')
  );
}

test.describe('Meridian Horizon', () => {
  test('lender horizon renders board + duty stream', async ({ page, baseURL }) => {
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
    // /horizon retired (journeys-only UI) — it redirects to the journey cockpit.
    await page.goto(`${baseURL}/horizon`, { waitUntil: 'load' });
    await page.waitForURL(/\/cockpit/, { timeout: 15_000 });
    await expect(page.locator('.mer.jc')).toBeVisible({ timeout: 25_000 });

    // Header chrome — single brand wordmark.
    await expect(page.locator('.wordmark')).toHaveText('OPEN ENERGY');

    // The lender's journey cockpit: journey tabs (Today first) + the Today stage.
    await expect(page.locator('.jc-tabs .jc-tab').first()).toContainText('Today');
    await expect(page.locator('.jc-stage')).toBeVisible();
    await expect(page.locator('.jc-head h1')).toBeVisible({ timeout: 25_000 });

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('thread is two-sided: lender sees actions, regulator counterparty sees read-only', async ({ page, browser, baseURL }) => {
    const errors: string[] = [];
    const captureErrors = (p: import('@playwright/test').Page) => {
      p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      p.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
      p.on('response', (resp) => {
        const s = resp.status();
        if (s >= 500 && resp.url().includes('/api/')) {
          errors.push(`api.5xx: ${s} ${resp.url()}`);
        }
      });
    };
    captureErrors(page);

    await seedToken(page);
    // covenant_certificate is the ONLY lender chain whose second lane is
    // regulator (all others pair with ipp_developer, which has no lane-write
    // mapping yet and 403s). The shared board's CaseTiles retired with the
    // bespoke horizons — source the thread href from the chain Ledger instead.
    await page.goto(`${baseURL}/ledger/covenant_certificate`, { waitUntil: 'load' });
    const firstCard = page.locator('.lcard').first();
    await expect(firstCard).toBeVisible({ timeout: 25_000 });
    await firstCard.click();
    await page.waitForURL(/\/thread\/covenant_certificate\//, { timeout: 15_000 });
    const href = new URL(page.url()).pathname;
    expect(href, 'ledger row must open /thread/covenant_certificate/:id').toContain('/thread/covenant_certificate/');

    // Lender side: full thread + action bar (covenant actions allow lender).
    await page.goto(`${baseURL}${href}`, { waitUntil: 'load' });
    await expect(page.locator('.mer.thread')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('.case-head h1')).toBeVisible();
    await expect(page.locator('.actbar')).toBeVisible();

    // Regulator side: same thread URL, lane grants VIEW but the registry
    // gives regulator zero actions on covenant_certificate (roles on both
    // transitions are admin/support/lender) — so no .actbar renders at all.
    const regToken = process.env.PLAYWRIGHT_REGULATOR_TOKEN;
    if (!regToken) throw new Error('PLAYWRIGHT_REGULATOR_TOKEN not set — global-setup may have failed');
    const regCtx = await browser.newContext();
    const regPage = await regCtx.newPage();
    captureErrors(regPage);
    await seedToken(regPage, regToken);
    await regPage.goto(`${baseURL}${href}`, { waitUntil: 'load' });
    await expect(regPage.locator('.mer.thread')).toBeVisible({ timeout: 25_000 });
    await expect(regPage.locator('.case-head')).toBeVisible();
    await expect(regPage.locator('.actbar')).toHaveCount(0);
    await regCtx.close();

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('⌘K command palette opens, searches lender functions, navigates on Enter', async ({ page, baseURL }) => {
    await seedToken(page);
    await page.goto(`${baseURL}/cockpit`, { waitUntil: 'load' });
    await expect(page.locator('.mer.jc')).toBeVisible({ timeout: 25_000 });

    // CommandPalette listens for ctrl OR meta + k — Control+k works on every OS.
    await page.keyboard.press('Control+k');
    const palette = page.locator('.mer .palette');
    await expect(palette).toBeVisible();

    // Escape closes…
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);

    // …and reopening + typing surfaces function hits from the lender role
    // config ("Covenant certificates" lives in the Monitoring domain).
    await page.keyboard.press('Control+k');
    await expect(palette).toBeVisible();
    await palette.locator('input').fill('covenant');
    const firstHit = page.locator('.mer .hit').first();
    await expect(firstHit).toBeVisible();
    await expect(firstHit).toContainText('Covenant');

    // Enter runs the selected hit. Post-consolidation, a function hit routes to
    // its Meridian surface — /ledger/:chainKey (chain functions), /surface/:key
    // (non-chain functions), or an explicit f.route — and a case hit to /thread/.
    // (Old tab-workstation `?tab=` URLs are retired; workstation routes redirect
    // to /horizon.)
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/(ledger|surface|thread)\/|\?tab=/, { timeout: 15_000 });
  });
});
