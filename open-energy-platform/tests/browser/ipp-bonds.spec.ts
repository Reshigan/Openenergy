// ═══════════════════════════════════════════════════════════════════════════
// IPP performance-bond registry — Wave 10 P6-grade smoke.
//
// IPP workstation → Bonds tab. Asserts:
//   • Tab mounts.
//   • KPI strip renders.
//   • Filter pills render.
//   • Demo rows from migration 111 visible.
//   • Drill-down with notice history + actions.
//
// Read-only — does NOT acknowledge or release. Idempotent.
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

test('IPP bond registry renders KPIs, filters, and demo rows', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/ipp-lifecycle/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^Bonds$/ }).click();
  await expect(page.getByTestId('ipp-bond-registry-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ipp-bond-registry-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ipp-bond-registry-table')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('ipp-bond-registry-filter-all').click();

  await expect(page.locator('[data-testid^="ipp-bond-registry-row-"]').first()).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('ipp-bond-registry-filter-warning')).toBeVisible();
  await expect(page.getByTestId('ipp-bond-registry-filter-cycle_3')).toBeVisible();
  await expect(page.getByTestId('ipp-bond-registry-filter-escalated')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('IPP bond registry drill-down shows notices + actions', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/ipp-lifecycle/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^Bonds$/ }).click();
  await expect(page.getByTestId('ipp-bond-registry-tab')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('ipp-bond-registry-filter-all').click();

  await page.locator('[data-testid^="ipp-bond-registry-row-"]').first().click();
  await expect(page.getByTestId('ipp-bond-registry-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ipp-bond-registry-notices')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ipp-bond-registry-actions')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
