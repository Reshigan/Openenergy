// ═══════════════════════════════════════════════════════════════════════════
// Carbon MRV verification chain — Wave 11 P6-grade smoke.
//
// Carbon workstation → Verification chain tab. Asserts:
//   • Tab mounts.
//   • KPI strip renders.
//   • Filter pills render.
//   • Demo rows from migration 113 visible.
//   • Drill-down with chain timeline + actions.
//
// Read-only — does NOT advance submissions. Idempotent.
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

test('Carbon MRV chain tab renders KPIs, filters, and demo rows', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/carbon-registry/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /Verification chain/i }).click();
  await expect(page.getByTestId('carbon-mrv-chain-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('carbon-mrv-chain-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('carbon-mrv-chain-table')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('carbon-mrv-chain-filter-all').click();

  await expect(page.locator('[data-testid^="carbon-mrv-chain-row-"]').first()).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('carbon-mrv-chain-filter-doe_review')).toBeVisible();
  await expect(page.getByTestId('carbon-mrv-chain-filter-cra_review')).toBeVisible();
  await expect(page.getByTestId('carbon-mrv-chain-filter-doe_opinion_adverse')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Carbon MRV chain drill-down shows timeline + actions', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/carbon-registry/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /Verification chain/i }).click();
  await expect(page.getByTestId('carbon-mrv-chain-tab')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('carbon-mrv-chain-filter-all').click();

  await page.locator('[data-testid^="carbon-mrv-chain-row-"]').first().click();
  await expect(page.getByTestId('carbon-mrv-chain-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('carbon-mrv-chain-events')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('carbon-mrv-chain-actions')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
