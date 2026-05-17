// ═══════════════════════════════════════════════════════════════════════════
// Workstations browser smoke — covers the three role workstations added
// in commit 0aa2ee7 (Trader, IPP-developer, Offtaker) plus a sanity check
// on one of the pre-existing five (Carbon) so the shared WorkstationShell
// gets exercised against prod chrome on every smoke run.
//
// Read-only: we log in once as admin (who can view any workstation) and
// route to each one to assert the tab nav. We do NOT fire state transitions
// — prod-write coverage lives in scripts/smoke-crud.sh.
//
// One login total: the smoke pipeline already burns 10+ /api/auth/login
// hits by the time Playwright runs (smoke-crud + smoke-roles + smoke-cron
// + the prior browser specs). Sharing a single admin token across all
// workstation tests keeps us well inside the 10 / 5 min sensitive-route
// rate-limit budget. Admin has cross-tenant visibility, so every
// workstation route renders for them.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';

let SHARED_ADMIN_TOKEN: string | null = null;

test.beforeAll(async ({ request, baseURL }) => {
  // One API login. Retry once with backoff if the rate limiter trips —
  // a 429 here would force every workstation test to fail noisily.
  for (const attempt of [0, 1]) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 30_000));
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
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared admin token not initialised');
  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, SHARED_ADMIN_TOKEN);
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of 404')
  );
}

type WorkstationCase = {
  role: string;
  route: string;
  title: RegExp;
  expectedTabs: string[];
};

const CASES: WorkstationCase[] = [
  {
    role: 'trader',
    route: '/trader-risk/workstation',
    title: /trader workstation/i,
    expectedTabs: ['Open orders', 'Rejections', 'Post-trade exceptions', 'Margin calls'],
  },
  {
    role: 'ipp_developer',
    route: '/ipp-lifecycle/workstation',
    title: /ipp workstation/i,
    expectedTabs: ['My projects', 'Milestones', 'Insurance', 'Community'],
  },
  {
    role: 'offtaker',
    route: '/offtaker-suite/workstation',
    title: /offtaker workstation/i,
    expectedTabs: ['Sites & groups', 'Tariffs', 'Budget vs actual', 'RECs portfolio', 'Scope 2'],
  },
  {
    role: 'carbon_fund',
    route: '/carbon-registry/workstation',
    title: /carbon workstation/i,
    // Carbon was added in commit b3ca8cb and has 3 tabs.
    expectedTabs: ['Vintage workflow', 'MRV submissions', 'Retirement certificates'],
  },
];

for (const c of CASES) {
  test(`workstation [${c.role}] renders chrome + tabs`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

    await seedToken(page);
    await page.goto(`${baseURL}${c.route}`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { name: c.title })).toBeVisible({ timeout: 10_000 });

    for (const label of c.expectedTabs) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }

    // Tab-switch URL contract — only meaningful when there's a second tab.
    if (c.expectedTabs.length >= 2) {
      await page.getByRole('button', { name: c.expectedTabs[1] }).click();
      await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/[?&]tab=/);
    }

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
}
