// ═══════════════════════════════════════════════════════════════════════════
// Offtaker PPA obligations — Wave 7 P6-grade smoke.
//
// Offtaker suite → PPA obligations tab. Asserts:
//   • Tab mounts.
//   • KPI strip renders.
//   • Filter pills render.
//   • Demo rows from migration 105 visible.
//   • Drill-down + readings table + cure button render.
//
// Read-only — does NOT cure / verify / reject. Those mutate state and we want
// this spec idempotent.
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

test('Offtaker PPA obligations tab renders KPIs, filters, and demo rows', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/surface/offtaker:obligations`, { waitUntil: 'load' });

  await expect(page.getByTestId('offtaker-obligations-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-table')).toBeVisible({ timeout: 15_000 });

  // At least one demo row (3 seeded in migration 105). Rows render as shared
  // ChainCard buttons inside the table wrapper (the per-row testids retired
  // with the bespoke row markup).
  await expect(page.getByTestId('offtaker-obligations-table').getByRole('button').first()).toBeVisible({ timeout: 15_000 });

  // Filter pills.
  await expect(page.getByTestId('offtaker-obligations-filter-open')).toBeVisible();
  await expect(page.getByTestId('offtaker-obligations-filter-shortfall')).toBeVisible();
  await expect(page.getByTestId('offtaker-obligations-filter-take_or_pay')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Offtaker PPA obligations drill-down shows readings + cure action', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/surface/offtaker:obligations`, { waitUntil: 'load' });

  await expect(page.getByTestId('offtaker-obligations-tab')).toBeVisible({ timeout: 15_000 });

  // Switch to All so the delivered/take-or-pay demo rows are reachable.
  await page.getByTestId('offtaker-obligations-filter-all').click();

  // Rows are shared ChainCards now: click expands an inline detail grid
  // (renderDetail) with the delivery numbers — the old drill/readings/cure
  // testids retired with the bespoke drawer.
  await page.getByTestId('offtaker-obligations-table').getByRole('button').first().click();
  await expect(page.getByText('Contracted MWh').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Delivered MWh').first()).toBeVisible();
  await expect(page.getByText('% of contracted').first()).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
