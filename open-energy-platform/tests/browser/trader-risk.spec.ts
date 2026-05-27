// ═══════════════════════════════════════════════════════════════════════════
// Trader Risk — Playwright smoke for the Wave 2 daily-VaR + scenario engine.
//
// Trader workstation → Risk tab. Asserts:
//   • Tab mount marker + portfolio selector visible.
//   • Scenario card renders (table or empty-state — both legitimate).
//   • No /api/ 5xx, no console.error.
//
// Read-only assertions only. We do NOT click Recompute or Run scenario in
// this smoke — those mutate the daily VaR snapshot and we want the test to
// stay idempotent against shared prod data.
//
// Rate-limit discipline: one shared admin login for the file.
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

test('Trader workstation Risk tab renders portfolio + scenarios', async ({ page, baseURL }) => {
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
  await page.goto(`${baseURL}/trader-risk/workstation`, { waitUntil: 'networkidle' });

  // Workstation renders all tab buttons up front; switch to Risk and wait
  // for the tab mount marker.
  await page.getByRole('button', { name: /^Risk$/ }).click();
  await expect(page.getByTestId('risk-tab')).toBeVisible({ timeout: 15_000 });

  // Portfolio picker is the first thing to hydrate from /api/risk/portfolios.
  await expect(page.getByTestId('risk-portfolio-select')).toBeVisible({ timeout: 15_000 });

  // Scenarios card always renders (empty-state inside if no results yet).
  await expect(page.getByTestId('risk-scenarios-card')).toBeVisible({ timeout: 15_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
