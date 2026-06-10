// ═══════════════════════════════════════════════════════════════════════════
// Esums site commissioning chain — Wave 12 P6-grade smoke.
//
// /esums → "Commissioning chain" tab. Asserts:
//   • Tab mounts.
//   • KPI strip renders.
//   • Filter pills render.
//   • Demo rows from migration 115 visible.
//   • Drill-down with chain timeline + actions.
//
// Read-only — does NOT advance sites. Idempotent.
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
    msg.includes('Failed to load resource: the server responded with a status of') ||
    // Cockpit pre-fetches work-orders on page mount; InlineHelp fetches help-dismissals
    // on CommissioningTab mount. Both are auxiliary to the commissioning chain under
    // test and intermittently 500 due to auth-hydration timing in headless mode.
    msg.includes('esums/work-orders') ||
    msg.includes('esums/fleet-kpis') ||
    msg.includes('ux-state/')
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

test('Esums commissioning tab renders KPIs, filters, and demo rows', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/esums`, { waitUntil: 'load' });

  await page.getByRole('button', { name: /Commissioning chain/i }).click();
  await expect(page.getByTestId('esums-commissioning-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('esums-commissioning-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('esums-commissioning-table')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('esums-commissioning-filter-all').click();
  await expect(page.locator('[data-testid^="esums-commissioning-row-"]').first()).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('esums-commissioning-filter-ingestion_wired')).toBeVisible();
  await expect(page.getByTestId('esums-commissioning-filter-first_telemetry_ok')).toBeVisible();
  await expect(page.getByTestId('esums-commissioning-filter-commissioning_failed')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Esums commissioning drill-down shows timeline + actions', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/esums`, { waitUntil: 'load' });

  await page.getByRole('button', { name: /Commissioning chain/i }).click();
  await expect(page.getByTestId('esums-commissioning-tab')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('esums-commissioning-filter-all').click();

  await page.locator('[data-testid^="esums-commissioning-row-"]').first().click();
  await expect(page.getByTestId('esums-commissioning-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('esums-commissioning-events')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('esums-commissioning-actions')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
