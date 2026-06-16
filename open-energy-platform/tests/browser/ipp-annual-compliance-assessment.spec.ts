// ═══════════════════════════════════════════════════════════════════════════
// IPP Annual Grid Code Compliance Self-Assessment (W188) — Playwright flow.
//
// Drives the assessment end-to-end through the real frontend, as the IPP
// developer persona, for a plant belonging to company "Vantax":
//   1. Deep-link to the IPP workstation Annual Compliance tab
//      (/ipp-lifecycle/workstation?tab=annual-compliance-assessment).
//   2. Open the "+ New Assessment" composer.
//   3. Fill Plant Name / Assessment Year / Plant MW (+ optional kV).
//   4. Submit "Create" and assert the backend accepts it (POST 201 with an id)
//      and the composer closes with no error.
//
// The create endpoint mints a fresh UUID per row (no uniqueness constraint),
// so the flow is safe to re-run against shared prod data. We assert on the
// POST 201 rather than a table row so the result is deterministic regardless
// of how many assessments already exist (pagination at 20/page).
//
// Rate-limit discipline: reuse the global-setup IPP token (one login), seed it
// via localStorage + a mocked /auth/refresh — same pattern as ipp-schedule.spec.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const ASSESSMENT_API = '/api/ipp-annual-compliance-assessments';

// Company under test. The platform domain is also "vantax" (oe.vantax.co.za);
// here it is the plant owner we file the assessment for.
const PLANT_NAME = 'Vantax Solar Park';
const ASSESSMENT_YEAR = '2026';
const PLANT_MW = '140';
const GRID_KV = '132';

let SHARED_IPP_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_IPP_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_IPP_TOKEN not set — global-setup may have failed');
  SHARED_IPP_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_IPP_TOKEN) throw new Error('shared IPP token not initialised');
  const tokenValue = SHARED_IPP_TOKEN;
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

test('IPP files an Annual Grid Code Compliance assessment for a Vantax plant', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) errors.push(`api.5xx: ${s} ${resp.url()}`);
  });

  await seedToken(page);

  // Deep-link straight to the Annual Compliance tab (WorkstationShell resolves
  // ?tab=<key> against the tab list — see WorkstationShell.tsx ~line 417).
  await page.goto(`${baseURL}/ipp-lifecycle/workstation?tab=annual-compliance-assessment`, { waitUntil: 'load' });

  // The tab body renders the KPI bar + the "+ New Assessment" trigger once the
  // first /list fetch resolves. Wait for the trigger before interacting.
  const newBtn = page.getByRole('button', { name: /\+ New Assessment/i });
  await expect(newBtn).toBeVisible({ timeout: 20_000 });

  // Open the composer.
  await newBtn.click();
  await expect(page.getByText('New Annual Grid Code Compliance Assessment')).toBeVisible({ timeout: 10_000 });

  // Fill the create form by label.
  await page.getByPlaceholder('Saldanha Wind Farm').fill(PLANT_NAME);
  await page.getByPlaceholder('2026').fill(ASSESSMENT_YEAR);
  await page.getByPlaceholder('140').fill(PLANT_MW);
  await page.getByPlaceholder('132').fill(GRID_KV);

  // Submit and capture the create POST. The backend returns 201 with { data: { id } }.
  const [createResp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes(ASSESSMENT_API) &&
        r.request().method() === 'POST',
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: /^Create$/ }).click(),
  ]);

  expect(createResp.status(), `create POST returned ${createResp.status()}`).toBe(201);
  const created = await createResp.json();
  const newId = created?.data?.id ?? created?.id;
  expect(newId, 'create response should carry the new assessment id').toBeTruthy();

  // After a successful create the composer closes (showCreate=false) and the
  // list reloads. The composer heading should disappear and no create-error
  // banner should be shown.
  await expect(page.getByText('New Annual Grid Code Compliance Assessment')).toBeHidden({ timeout: 10_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
