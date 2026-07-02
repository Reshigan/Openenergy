// ═══════════════════════════════════════════════════════════════════════════
// Trader market-maker compliance — Wave 9 P6-grade smoke.
//
// Trader workstation → MM compliance tab. Asserts:
//   • Tab mounts.
//   • KPI strip renders.
//   • Filter pills render.
//   • Demo rows from migration 109 visible.
//   • Drill-down with performance history + acknowledge button.
//
// Read-only — does NOT acknowledge or excuse. Idempotent.
//
// Rate-limit discipline: shared admin login for the whole file.
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

test('Trader MM compliance tab renders KPIs, filters, and demo rows', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/surface/trader:oe_mm_obligations`, { waitUntil: 'load' });

  await expect(page.getByTestId('trader-mm-compliance-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('trader-mm-compliance-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('trader-mm-compliance-table')).toBeVisible({ timeout: 15_000 });

  // Switch to All so seeded rows in any state are reachable.
  await page.getByTestId('trader-mm-compliance-filter-all').click();

  // At least one demo row (3 seeded in migration 109).
  await expect(page.locator('[data-testid^="trader-mm-compliance-row-"]').first()).toBeVisible({ timeout: 15_000 });

  // Filter pills.
  await expect(page.getByTestId('trader-mm-compliance-filter-warning')).toBeVisible();
  await expect(page.getByTestId('trader-mm-compliance-filter-breach')).toBeVisible();
  await expect(page.getByTestId('trader-mm-compliance-filter-escalated')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Trader MM compliance drill-down shows performance history + actions', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/surface/trader:oe_mm_obligations`, { waitUntil: 'load' });

  await expect(page.getByTestId('trader-mm-compliance-tab')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('trader-mm-compliance-filter-all').click();

  await page.locator('[data-testid^="trader-mm-compliance-row-"]').first().click();
  await expect(page.getByTestId('trader-mm-compliance-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('trader-mm-compliance-perfs')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('trader-mm-compliance-actions')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
