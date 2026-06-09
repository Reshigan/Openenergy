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
  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, SHARED_ADMIN_TOKEN);
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
  await page.goto(`${baseURL}/offtaker-suite`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^PPA obligations$/ }).click();
  await expect(page.getByTestId('offtaker-obligations-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-table')).toBeVisible({ timeout: 15_000 });

  // At least one demo row (3 seeded in migration 105).
  await expect(page.locator('[data-testid^="offtaker-obligations-row-"]').first()).toBeVisible({ timeout: 15_000 });

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
  await page.goto(`${baseURL}/offtaker-suite`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^PPA obligations$/ }).click();
  await expect(page.getByTestId('offtaker-obligations-tab')).toBeVisible({ timeout: 15_000 });

  // Switch to All so the delivered/take-or-pay demo rows are reachable.
  await page.getByTestId('offtaker-obligations-filter-all').click();

  await page.locator('[data-testid^="offtaker-obligations-row-"]').first().click();
  await expect(page.getByTestId('offtaker-obligations-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-readings')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-actions')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('offtaker-obligations-cure')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
