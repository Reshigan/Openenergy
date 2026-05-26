// ═══════════════════════════════════════════════════════════════════════════
// IPP Schedule — Playwright smoke for the P6-grade schedule subsystem.
//
// Covers two surfaces:
//   1. Project file → Schedule tab (per-project deep view) — KPIs, Gantt,
//      WBS table, resources, baselines, Recompute CPM action.
//   2. IPP workstation → Schedule pulse tab (cross-project rollup) —
//      critical-activity count, look-ahead table.
//
// Read-only assertions only; we click Recompute (idempotent — re-runs the
// solver, doesn't mutate authoritative data beyond the CPM snapshot) but
// don't fire Level or Save baseline to keep the test deterministic across
// runs against shared prod data.
//
// Rate-limit discipline: one shared admin login for the file (see
// workstations.spec.ts for the rationale).
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const PROJECT_ID = process.env.IPP_SCHEDULE_PROJECT_ID || 'ip_001';

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

test('IPP project Schedule tab renders KPIs + Gantt + WBS', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${s} ${resp.url()}`);
    }
  });

  await seedToken(page);
  await page.goto(`${baseURL}/projects/${PROJECT_ID}?tab=schedule`, { waitUntil: 'networkidle' });

  // Top-level mount + KPI strip render before the data load resolves.
  await expect(page.getByTestId('schedule-tab')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('schedule-kpis')).toBeVisible();

  // After the KPIs paint, the Gantt + WBS table + resources panel come from
  // the same /activities + /critical-path fetch. Wait for the table so the
  // page is at steady state before asserting the action buttons.
  await expect(page.getByTestId('schedule-table')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('schedule-gantt')).toBeVisible();
  await expect(page.getByTestId('schedule-resources')).toBeVisible();
  await expect(page.getByTestId('schedule-baselines')).toBeVisible();

  // Recompute CPM — idempotent. Click and confirm the table still renders
  // afterwards (no exception thrown, no 5xx logged).
  await page.getByTestId('schedule-recompute').click();
  await expect(page.getByTestId('schedule-table')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('IPP workstation Schedule pulse tab loads', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) {
      errors.push(`api.5xx: ${s} ${resp.url()}`);
    }
  });

  await seedToken(page);
  await page.goto(`${baseURL}/ipp-lifecycle/workstation`, { waitUntil: 'networkidle' });

  // The workstation renders all tab buttons up front; switch to Schedule pulse
  // and wait for the pulse-tab mount marker.
  await page.getByRole('button', { name: /Schedule pulse/i }).click();
  await expect(page.getByTestId('ipp-schedule-pulse')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
