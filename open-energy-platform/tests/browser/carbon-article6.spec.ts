// ═══════════════════════════════════════════════════════════════════════════
// Carbon Article 6 — Playwright smoke for Wave 4 UNFCCC ITMO ledger.
//
// Carbon workstation → Article 6 ITMO tab. Asserts:
//   • Tab mount marker renders.
//   • KPI strip + filter pills + ledger table all render.
//   • Country routing panel renders.
//   • At least one demo adjustment row is visible (from migration 099).
//   • No /api/ 5xx responses or console errors.
//
// Read-only — does NOT click submit-dffe / clear-dffe / post-unfccc / block /
// unblock. Those mutate the ledger and we want this spec idempotent.
//
// Rate-limit discipline: one shared admin login for the whole file.
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

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
  );
}

function attachWatchers(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${s} ${resp.url()}`);
    }
  });
  return errors;
}

test('Carbon Article 6 tab renders KPIs, ledger, and routing', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/carbon-registry/workstation`, { waitUntil: 'load' });

  // Tab label is "Article 6 ITMO"; pick the button to avoid colliding with
  // any heading text rendered before tab content swap.
  await page.getByRole('tab', { name: /^Article 6 ITMO$/ }).click();
  await expect(page.getByTestId('article6-tab')).toBeVisible({ timeout: 15_000 });

  // KPI strip — 5 tiles.
  await expect(page.getByTestId('article6-kpis')).toBeVisible({ timeout: 15_000 });

  // Ledger table.
  await expect(page.getByTestId('article6-table')).toBeVisible({ timeout: 15_000 });

  // Country routing panel.
  await expect(page.getByTestId('article6-routing')).toBeVisible({ timeout: 15_000 });

  // At least one demo row from migration 099 (4 demo adjustments seeded).
  await expect(page.locator('[data-testid^="article6-row-"]').first()).toBeVisible({ timeout: 15_000 });

  // Filter pills are present.
  await expect(page.getByTestId('article6-filter-unfccc_ledger')).toBeVisible();
  await expect(page.getByTestId('article6-filter-blocked')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Carbon Article 6 row drill-down shows risk + actions', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/carbon-registry/workstation`, { waitUntil: 'load' });

  await page.getByRole('tab', { name: /^Article 6 ITMO$/ }).click();
  await expect(page.getByTestId('article6-tab')).toBeVisible({ timeout: 15_000 });

  // Wait for rows to appear (the API call can be slow), then click the first one.
  await expect(page.locator('[data-testid^="article6-row-"]').first()).toBeVisible({ timeout: 25_000 });
  await page.locator('[data-testid^="article6-row-"]').first().click();
  await expect(page.getByTestId('article6-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('article6-risk')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('article6-actions')).toBeVisible({ timeout: 15_000 });

  // AI explain button is always present in drill-down.
  await expect(page.getByTestId('article6-ai-explain')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
