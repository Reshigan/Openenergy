// ═══════════════════════════════════════════════════════════════════════════
// Grid wheeling charges — Wave 8 P6-grade smoke.
//
// Grid Operator suite → Wheeling charges tab. Asserts:
//   • Tab mounts.
//   • KPI strip renders.
//   • Filter pills render.
//   • Demo rows from migration 107 visible.
//   • Drill-down with breakdown table + dispute pane + action buttons.
//
// Read-only — does NOT raise/resolve/pay. Those mutate state and we want
// this spec idempotent.
//
// Rate-limit discipline: shared admin login for the whole file.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';

let SHARED_ADMIN_TOKEN: string | null = null;

test.beforeAll(async ({ request, baseURL }) => {
  for (const attempt of [0, 1]) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 15_000));
    const r = await request.post(`${baseURL}/api/auth/login`, {
      data: { email: 'admin@openenergy.co.za', password: PASSWORD },
      failOnStatusCode: false,
    });
    if (r.ok()) {
      const tok = (await r.json())?.data?.token;
      if (tok) { SHARED_ADMIN_TOKEN = tok; return; }
    }
    if (attempt === 1) {
      throw new Error(`admin login failed: HTTP ${r.status()} body=${(await r.text()).slice(0, 200)}`);
    }
  }
}, 90_000);

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

test('Grid wheeling charges tab renders KPIs, filters, and demo rows', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/grid-operator`, { waitUntil: 'load' });

  await page.getByRole('button', { name: /Wheeling charges/ }).click();
  await expect(page.getByTestId('grid-wheeling-charges-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('grid-wheeling-charges-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('grid-wheeling-charges-table')).toBeVisible({ timeout: 15_000 });

  // At least one demo row (4 seeded in migration 107).
  await expect(page.locator('[data-testid^="grid-wheeling-charges-row-"]').first()).toBeVisible({ timeout: 15_000 });

  // Filter pills.
  await expect(page.getByTestId('grid-wheeling-charges-filter-open_disputed')).toBeVisible();
  await expect(page.getByTestId('grid-wheeling-charges-filter-escalated')).toBeVisible();
  await expect(page.getByTestId('grid-wheeling-charges-filter-paid')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Grid wheeling charges drill-down shows breakdown + dispute pane', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/grid-operator`, { waitUntil: 'load' });

  await page.getByRole('button', { name: /Wheeling charges/ }).click();
  await expect(page.getByTestId('grid-wheeling-charges-tab')).toBeVisible({ timeout: 15_000 });

  // Switch to All so paid/escalated demo rows are reachable.
  await page.getByTestId('grid-wheeling-charges-filter-all').click();

  await page.locator('[data-testid^="grid-wheeling-charges-row-"]').first().click();
  await expect(page.getByTestId('grid-wheeling-charges-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('grid-wheeling-charges-disputes')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('grid-wheeling-charges-actions')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
