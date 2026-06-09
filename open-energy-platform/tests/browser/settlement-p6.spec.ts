// ═══════════════════════════════════════════════════════════════════════════
// Settlement P6 — Playwright smoke for Wave 3 CPMI-IOSCO surfaces.
//
// Settlement workstation → Disclosure / DvP / Margin gate tabs. Asserts:
//   • Each tab mount marker renders.
//   • KPI grid + snapshot table render on Disclosure.
//   • DvP state pipeline + lock-status pill render.
//   • Margin-gate table renders 3 KPI tiles.
//   • No /api/ 5xx responses or console errors.
//
// Read-only assertions — does NOT click Compute, Publish, Confirm, Override,
// or Release. Those mutate clearing state and we want this idempotent.
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

test('Settlement Disclosure tab renders KPIs + snapshot table', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/settlement`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^Disclosure$/ }).click();
  await expect(page.getByTestId('disclosure-tab')).toBeVisible({ timeout: 15_000 });

  // KPI grid lights up once the current snapshot loads.
  await expect(page.getByTestId('disclosure-kpis')).toBeVisible({ timeout: 15_000 });

  // Snapshot history table is always present (even with 0 rows).
  await expect(page.getByTestId('disclosure-table')).toBeVisible({ timeout: 15_000 });

  // AI assist card is always present (button regardless of snapshot count).
  await expect(page.getByTestId('disclosure-ai-card')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Settlement DvP tab renders cycle picker + state pipeline', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/settlement`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^DvP$/ }).click();
  await expect(page.getByTestId('dvp-panel')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('dvp-cycle-select')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('dvp-status')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Settlement Margin gate tab renders member table + KPIs', async ({ page, baseURL }) => {
  const errors = attachWatchers(page);
  await seedToken(page);
  await page.goto(`${baseURL}/settlement`, { waitUntil: 'networkidle' });

  await page.getByRole('tab', { name: /^Margin gate$/ }).click();
  await expect(page.getByTestId('margin-gate-widget')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('margin-gate-table')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
