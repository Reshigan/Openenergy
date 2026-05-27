// ═══════════════════════════════════════════════════════════════════════════
// Regulator inbox + compliance notices — Wave 5 P6-grade smoke.
//
// Regulator workstation → Inbox tab + Compliance notices tab. Asserts:
//   • Tab mounts render.
//   • KPI strips render.
//   • Filter pills render.
//   • Demo rows from migration 101 are visible.
//   • Drill-down + action panel render on row click.
//
// Read-only — does NOT click ack / escalate / dismiss / satisfy /
// withdraw. Those mutate inbox + notice state and we want this spec
// idempotent.
//
// Rate-limit discipline: one shared admin login for the whole file.
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

test('Regulator inbox tab renders KPIs, filters, and demo events', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/regulator-suite/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: /^Inbox$/ }).click();
  await expect(page.getByTestId('regulator-inbox-tab')).toBeVisible({ timeout: 15_000 });

  // KPI strip — 5 tiles (total, pending, overdue, escalated, critical open).
  await expect(page.getByTestId('regulator-inbox-kpis')).toBeVisible({ timeout: 15_000 });

  // Table mount.
  await expect(page.getByTestId('regulator-inbox-table')).toBeVisible({ timeout: 15_000 });

  // At least one demo row (5 seeded in migration 101).
  await expect(page.locator('[data-testid^="regulator-inbox-row-"]').first()).toBeVisible({ timeout: 15_000 });

  // Filter pills.
  await expect(page.getByTestId('regulator-inbox-filter-pending')).toBeVisible();
  await expect(page.getByTestId('regulator-inbox-filter-escalated')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Regulator inbox drill-down shows event payload and action buttons', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/regulator-suite/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: /^Inbox$/ }).click();
  await expect(page.getByTestId('regulator-inbox-tab')).toBeVisible({ timeout: 15_000 });

  // Filter to pending so we know we'll get a row with action buttons.
  await page.getByTestId('regulator-inbox-filter-pending').click();
  await page.locator('[data-testid^="regulator-inbox-row-"]').first().click();
  await expect(page.getByTestId('regulator-inbox-drill')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('regulator-inbox-actions')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('regulator-inbox-ack')).toBeVisible();
  await expect(page.getByTestId('regulator-inbox-escalate')).toBeVisible();
  await expect(page.getByTestId('regulator-inbox-dismiss')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Compliance notices tab renders KPIs, filter pills, and demo notices', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/regulator-suite/workstation`, { waitUntil: 'networkidle' });

  await page.getByRole('button', { name: /^Compliance notices$/ }).click();
  await expect(page.getByTestId('regulator-notices-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('regulator-notices-kpis')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('regulator-notices-table')).toBeVisible({ timeout: 15_000 });

  // At least one demo notice (3 seeded in migration 101).
  await expect(page.locator('[data-testid^="regulator-notice-row-"]').first()).toBeVisible({ timeout: 15_000 });

  // Filter + create button.
  await expect(page.getByTestId('regulator-notices-filter-overdue')).toBeVisible();
  await expect(page.getByTestId('regulator-notices-create')).toBeVisible();

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
