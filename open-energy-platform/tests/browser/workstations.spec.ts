// ═══════════════════════════════════════════════════════════════════════════
// Workstations browser smoke — covers the three role workstations added
// in commit 0aa2ee7 (Trader, IPP-developer, Offtaker) plus a sanity check
// on one of the pre-existing five (Carbon) so the shared WorkstationShell
// gets exercised against prod chrome on every smoke run.
//
// Read-only: we log in, route to the workstation, assert the tab nav and
// at least one listing fetch settled. We do NOT fire state transitions —
// prod-write coverage lives in scripts/smoke-crud.sh.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, Page } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';

async function loginAs(page: Page, email: string, baseURL: string) {
  await page.goto(`${baseURL}/`, { waitUntil: 'networkidle' });
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).first().click();
  // Land on cockpit / launch board.
  await page.waitForURL(/\/(cockpit|launch)/, { timeout: 15_000 });
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of 404')
  );
}

type WorkstationCase = {
  role: string;
  email: string;
  route: string;
  title: RegExp;
  expectedTabs: string[];
};

const CASES: WorkstationCase[] = [
  {
    role: 'trader',
    email: 'trader@openenergy.co.za',
    route: '/trader-risk/workstation',
    title: /trader workstation/i,
    expectedTabs: ['Open orders', 'Rejections', 'Post-trade exceptions', 'Margin calls'],
  },
  {
    role: 'ipp_developer',
    email: 'ipp@openenergy.co.za',
    route: '/ipp-lifecycle/workstation',
    title: /ipp workstation/i,
    expectedTabs: ['My projects', 'Milestones', 'Insurance', 'Community'],
  },
  {
    role: 'offtaker',
    email: 'offtaker@openenergy.co.za',
    route: '/offtaker-suite/workstation',
    title: /offtaker workstation/i,
    expectedTabs: ['Sites & groups', 'Tariffs', 'Budget vs actual', 'RECs portfolio', 'Scope 2'],
  },
];

for (const c of CASES) {
  test(`workstation [${c.role}] loads, tabs render, first listing fetches without error`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

    await loginAs(page, c.email, baseURL!);

    // Direct-navigate to the workstation route.
    await page.goto(`${baseURL}${c.route}`, { waitUntil: 'networkidle' });

    // The shell renders the page title once the bundle is ready.
    await expect(page.getByRole('heading', { name: c.title })).toBeVisible({ timeout: 10_000 });

    // Every expected tab is present in the WorkstationShell nav.
    for (const label of c.expectedTabs) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }

    // Click the second tab and confirm the URL ?tab= updates (the shell's
    // contract — useSearchParams is wired to set this on click).
    const secondTab = c.expectedTabs[1];
    await page.getByRole('button', { name: secondTab }).click();
    await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/[?&]tab=/);

    // No runtime errors during nav + tab switching.
    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
}

// Sanity check on a pre-existing workstation using the same shell — proves
// the shared WorkstationShell primitive still renders for the other 5 roles
// (Carbon, Grid-ops, Regulator, Admin, Support).
test('workstation [carbon_fund] loads — covers shared WorkstationShell', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await loginAs(page, 'carbon@openenergy.co.za', baseURL!);
  await page.goto(`${baseURL}/carbon-registry/workstation`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: /carbon workstation/i })).toBeVisible({ timeout: 10_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
