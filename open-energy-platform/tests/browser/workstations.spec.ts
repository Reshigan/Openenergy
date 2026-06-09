// ═══════════════════════════════════════════════════════════════════════════
// Workstations browser smoke — covers every role workstation that uses the
// shared WorkstationShell primitive. Currently 8 routes: Trader, IPP,
// Offtaker, Carbon, Admin (platform), Regulator, Grid operator, Support.
// Lender doesn't have a dedicated workstation route (`/lender-suite` is
// itself the workstation) — that surface is exercised by
// scripts/smoke-launch-per-role.sh.
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

// 90s budget: the retry sleep below is 15s, plus we need headroom for two
// HTTP round-trips against prod under any plausible latency. Default
// beforeAll timeout is 30s — same as the *old* retry sleep, so a single
// rate-limit retry would blow the budget and cascade-fail every test.
test.beforeAll(async ({ request, baseURL }) => {
  // One API login. Retry once with backoff if the rate limiter trips —
  // a 429 here would force every workstation test to fail noisily.
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

  // AuthContext bootstraps via httpOnly cookie refresh which isn't available
  // in headless Playwright. Intercept /auth/refresh to return a valid access
  // token; AuthContext then calls /auth/me with the Bearer JWT and succeeds.
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { token: tokenValue, expires_in: 3600 },
      }),
    });
  });

  await page.addInitScript((tok) => {
    localStorage.setItem('token', tok as string);
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  // The browser logs a generic "Failed to load resource: ...status of NNN ()"
  // console.error for every non-2xx response, but the message has no URL in
  // it. We catch real 5xx via the response listener (which has the URL), so
  // these console-error rows would just be noisy duplicates without
  // diagnostic value — drop them all here.
  //
  // ServiceWorkerRegistration / fonts.cdnfonts 404s are pre-existing prod
  // noise we don't want to fix in this commit.
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
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
    // Trader uses group tabs; default group is 'Trading' — only Trading tabs visible on load.
    // Post-trade exceptions (Post-trade group) and Margin calls (Risk group) are hidden until
    // the user switches groups.
    expectedTabs: ['Open orders', 'Rejections'],
  },
  {
    role: 'ipp_developer',
    route: '/ipp-lifecycle/workstation',
    title: /ipp workstation/i,
    // Default group is 'Project controls'.
    expectedTabs: ['My projects', 'Milestones', 'Schedule pulse'],
  },
  {
    role: 'offtaker',
    route: '/offtaker-suite/workstation',
    title: /offtaker workstation/i,
    // Default group is 'Contracts'. Sites & groups / Tariffs / RECs are in 'Operations'/'Compliance'.
    expectedTabs: ['PPA contracts', 'Tariff indexation'],
  },
  {
    role: 'carbon_fund',
    route: '/carbon-registry/workstation',
    title: /carbon workstation/i,
    // Carbon was added in commit b3ca8cb and has 3 tabs.
    expectedTabs: ['Vintage workflow', 'MRV submissions', 'Retirement certificates'],
  },
  {
    role: 'admin',
    route: '/admin-platform/workstation',
    title: /platform admin workstation/i,
    expectedTabs: [
      'Tenant lifecycle',
      'Billing runs',
      'Flag overrides',
      'Settlement audit',
      'Platform audit',
      'PII access log',
    ],
  },
  {
    role: 'regulator',
    route: '/regulator-suite/workstation',
    title: /regulator workstation/i,
    expectedTabs: ['Surveillance triage', 'Licence actions', 'Enforcement events', 'Audit & compliance'],
  },
  {
    role: 'grid_operator',
    route: '/grid-operator/workstation',
    title: /grid operations workstation/i,
    // Default group is 'Operations'. Outage responses is in 'Connections' group — not visible on load.
    expectedTabs: ['Curtailment events', 'Ancillary services'],
  },
  {
    role: 'support',
    route: '/support/workstation',
    title: /support workstation/i,
    expectedTabs: ['Tickets', 'Escalations', 'Cross-tenant access', 'Audit & compliance'],
  },
];

for (const c of CASES) {
  test(`workstation [${c.role}] renders chrome + tabs`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
    // Response-level 5xx capture — gives us the URL, which the generic
    // "Failed to load resource" console-error message hides.
    page.on('response', (resp) => {
      const s = resp.status();
      if (s >= 500 && resp.url().includes('/api/')) {
        errors.push(`api.5xx: ${s} ${resp.url()}`);
      }
    });

    await seedToken(page);
    await page.goto(`${baseURL}${c.route}`, { waitUntil: 'load' });

    // Large lazy bundles (offtaker, support) take up to ~15s to render on prod after
    // load event. Use 25s to give React time to download + render the workstation.
    await expect(page.getByRole('heading', { name: c.title })).toBeVisible({ timeout: 25_000 });

    for (const label of c.expectedTabs) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }

    // Tab-switch URL contract — only meaningful when there's a second tab.
    if (c.expectedTabs.length >= 2) {
      await page.getByRole('tab', { name: c.expectedTabs[1] }).click();
      await expect.poll(() => page.url(), { timeout: 5_000 }).toMatch(/[?&]tab=/);
    }

    const real = errors.filter((e) => !isBenign(e));
    expect(real, real.join('\n')).toEqual([]);
  });
}
