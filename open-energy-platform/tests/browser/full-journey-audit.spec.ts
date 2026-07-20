// ═══════════════════════════════════════════════════════════════════════════
// Full journey audit — v2 rebuild routing reality.
//
// Meridian (the tab-based workstation chrome, then the journey-cockpit chrome
// that replaced it) is fully retired. Every /launch/:role, every */workstation,
// /esums, /horizon, /cockpit, and the legacy listing routes (/admin /trading
// /settlement /carbon /projects /grid /contracts) now redirect into the v2
// rebuild at /v2. The seven role-suite landings (/trader-risk, /ipp-lifecycle,
// /offtaker-suite, /carbon-registry, /lender-suite, /regulator-suite,
// /grid-operator) also now redirect to /v2 — they no longer render bespoke
// suite content. The standalone pages (below) still render.
//
// v2 Home (/v2) renders the live work queue ONLY after GET /api/txn/list (or
// equivalent) succeeds (needs a REAL token). A fake placeholder token 401s and
// Home shows its honest load-error state (.v2-empty, "Couldn't load..."). Per-
// role strict assertions are therefore gated on a real token; the universal
// assertion only proves the v2 shell mounted (nav.v2-nav is on screen,
// regardless of which of Home's three load states is showing).
//
// Run locally:
//   BASE=http://localhost:3000 \
//     PLAYWRIGHT_ADMIN_TOKEN=<tok> \
//     PLAYWRIGHT_TRADER_TOKEN=<tok> \
//     PLAYWRIGHT_IPP_TOKEN=<tok> \
//     PLAYWRIGHT_GRID_TOKEN=<tok> \
//     PLAYWRIGHT_OFFTAKER_TOKEN=<tok> \
//     PLAYWRIGHT_LENDER_TOKEN=<tok> \
//     PLAYWRIGHT_CARBON_TOKEN=<tok> \
//     PLAYWRIGHT_REGULATOR_TOKEN=<tok> \
//     PLAYWRIGHT_SUPPORT_TOKEN=<tok> \
//     PLAYWRIGHT_ESCO_TOKEN=<tok> \
//     npx playwright test tests/browser/full-journey-audit.spec.ts
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, Page } from '@playwright/test';

// When running against the production Cloudflare origin, headless Playwright
// fingerprints trigger Bot Management which intermittently intercepts API calls
// and returns 500. These are NOT real server errors — all failing endpoints
// return 200 via curl with real tokens. On prod we suppress api.500 noise;
// on localhost the strict filter stays active to catch real regressions.
const IS_PROD = !(process.env.BASE ?? 'https://oe.vantax.co.za').includes('localhost');

// ── Role map: short name → JWT role string ───────────────────────────────────
const ROLE_MAP: Record<string, string> = {
  admin: 'admin',
  trader: 'trader',
  ipp: 'ipp_developer',
  offtaker: 'offtaker',
  lender: 'lender',
  carbon: 'carbon_fund',
  regulator: 'regulator',
  grid: 'grid_operator',
  support: 'support',
  esco: 'esco',
};

// Whichever of HorizonPage's three states is on screen, one of these strings is
// visible: success → "DUTY STREAM" (duty-stream <h2>); loading → "Computing
// horizon…"; error (fake/expired token) → "Horizon failed to load.". Matching
// any of them proves routing + auth-gate + HorizonPage mount, independent of
// whether a real token was available to fetch live board data.

// A real token (not the fake placeholder) was provided by global-setup for this
// short role name → Horizon can fetch live data and reach its success branch.
function hasRealToken(tokenRole: string): boolean {
  return !!process.env[`PLAYWRIGHT_${tokenRole.toUpperCase()}_TOKEN`];
}

// ── Error capture helpers ────────────────────────────────────────────────────
function isNoise(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('fonts.cdnfonts') ||
    msg.includes('ERR_CONNECTION_CLOSED') ||
    msg.includes('ERR_NETWORK_CHANGED') ||
    // Endpoints that Cloudflare Bot Management intermittently intercepts when
    // running headless Playwright against the production origin. Confirmed 200
    // via curl with real tokens — failures are CF-induced, not server bugs.
    msg.includes('notifications/unread-count') ||
    msg.includes('insights/chain/') ||
    msg.includes('grid-operator/curtailment') ||
    msg.includes('ux-state/onboarding') ||
    msg.includes('role-actions') ||
    // Local dev HMR websocket noise
    msg.includes('WebSocket') ||
    msg.includes('[vite]') ||
    // CF-specific headers not supported locally
    msg.includes('x-robots-tag') ||
    // Auth refresh mock noise
    msg.includes('auth/refresh') ||
    msg.includes('auth/me')
  );
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!isNoise(text)) errors.push(`console.error: ${text}`);
    }
  });
  page.on('response', (resp) => {
    const s = resp.status();
    const url = resp.url();
    if (
      s >= 400 &&
      url.includes('/api/') &&
      !url.includes('/api/auth/') &&
      !url.includes('/api/polish/') &&
      !isNoise(url) &&
      !(IS_PROD && s === 500)
    ) {
      errors.push(`api.${s}: ${resp.url()}`);
    }
  });
  return errors;
}

async function seedToken(page: Page, tokenRole: string): Promise<void> {
  const role = ROLE_MAP[tokenRole] ?? tokenRole;
  // Use per-role real token if explicitly set, else use a fake placeholder.
  // Do NOT fall back to PLAYWRIGHT_ADMIN_TOKEN for non-admin roles — using a real
  // token causes real API calls with different-role auth which hit the rate limiter
  // and make the SPA display "Rate limit exceeded" instead of page content.
  const tokenValue = process.env[`PLAYWRIGHT_${tokenRole.toUpperCase()}_TOKEN`]
    ?? `test-token-${tokenRole}`;

  const fakeUser = {
    id: `test-${tokenRole}-id`,
    email: `${tokenRole}@openenergy.co.za`,
    name: `Test ${role.replace(/_/g, ' ')}`,
    role,
    email_verified: true,
    kyc_status: 'approved',
  };

  // Mock /auth/refresh so AuthContext gets a token on mount
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token: tokenValue, expires_in: 3600 } }),
    });
  });

  // Mock /auth/me so AuthContext resolves a user (required for ProtectedRoute)
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: fakeUser }),
    });
  });

  await page.addInitScript((args) => {
    localStorage.setItem('token', args.token);
    // Pre-dismiss POPIA cookie consent banner so it doesn't block pointer events
    localStorage.setItem('oe.consent.v1', JSON.stringify({
      version: '2026-05-19',
      analytics: false,
      marketing: false,
      at: new Date().toISOString(),
    }));
  }, { token: tokenValue });
}

async function goTo(page: Page, baseURL: string | undefined, path: string): Promise<void> {
  await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

// ── Horizon per-role workspace (replaces the retired workstation tab chrome) ──
// `role` is only the test label; the board role comes from the mocked /auth/me
// role (= ROLE_MAP[tokenRole]). All 10 live roles, incl. esco (O&M operator).
const HORIZON_CASES: Array<{ role: string; tokenRole: string }> = [
  { role: 'admin',         tokenRole: 'admin' },
  { role: 'trader',        tokenRole: 'trader' },
  { role: 'ipp_developer', tokenRole: 'ipp' },
  { role: 'grid_operator', tokenRole: 'grid' },
  { role: 'offtaker',      tokenRole: 'offtaker' },
  { role: 'lender',        tokenRole: 'lender' },
  { role: 'carbon_fund',   tokenRole: 'carbon' },
  { role: 'regulator',     tokenRole: 'regulator' },
  { role: 'support',       tokenRole: 'support' },
  { role: 'esco',          tokenRole: 'esco' },
];

// ── Suite landing pages (still render via <Layout>; /esums now redirects) ─────
const SUITE_CASES: Array<{ name: string; tokenRole: string; path: string; expectText: RegExp }> = [
  { name: 'Trader risk suite',    tokenRole: 'trader',    path: '/trader-risk',       expectText: /trader risk|positions|credit|margin|collateral/i },
  { name: 'IPP lifecycle suite',  tokenRole: 'ipp',       path: '/ipp-lifecycle',     expectText: /project|milestone|lifecycle/i },
  { name: 'Offtaker suite',       tokenRole: 'offtaker',  path: '/offtaker-suite',    expectText: /ppa|contract|delivery|offtaker/i },
  { name: 'Carbon registry',      tokenRole: 'carbon',    path: '/carbon-registry',   expectText: /carbon|vintage|credit|registry/i },
  { name: 'Lender suite',         tokenRole: 'lender',    path: '/lender-suite',      expectText: /loan|portfolio|covenant|lender/i },
  { name: 'Regulator suite',      tokenRole: 'regulator', path: '/regulator-suite',   expectText: /surveillance|licence|inbox|regulator/i },
  { name: 'Grid operator suite',  tokenRole: 'grid',      path: '/grid-operator',     expectText: /dispatch|curtailment|grid|operator/i },
];

// ── Standalone pages still rendering after the Meridian cutover ───────────────
const ADMIN_PAGE_CASES: Array<{ name: string; path: string; expectText: RegExp }> = [
  { name: 'Admin monitoring',    path: '/admin/monitoring',         expectText: /monitoring|health|error/i },
  { name: 'Admin revenue',       path: '/admin/revenue',            expectText: /revenue|fee|billing/i },
  { name: 'National dashboard',  path: '/dashboard',                expectText: /national|dashboard|platform/i },
  { name: 'Reports',             path: '/reports',                  expectText: /report|export|analytics/i },
  { name: 'Intelligence',        path: '/intelligence',             expectText: /intelligence|insight|AI/i },
  { name: 'Briefing',            path: '/briefing',                 expectText: /briefing|update|summary/i },
  { name: 'POPIA',               path: '/popia',                    expectText: /popia|privacy|access/i },
  { name: 'ESG',                 path: '/esg',                      expectText: /esg|disclosure|sustainability/i },
  { name: 'Marketplace',         path: '/marketplace',              expectText: /marketplace|listing|offer/i },
  { name: 'Support (legacy)',    path: '/support',                  expectText: /support|ticket|help/i },
];

// ── Public pages ─────────────────────────────────────────────────────────────
const PUBLIC_PAGE_CASES: Array<{ name: string; path: string; expectText: RegExp }> = [
  { name: 'Status page',  path: '/status', expectText: /status|operational|uptime/i },
  { name: 'Legal page',   path: '/legal',  expectText: /legal|terms|privacy|policy/i },
  { name: 'Audit page',   path: '/audit',  expectText: /audit|chain|verify|block/i },
];

// ── Routes retired across both cutovers — every one now redirects to /v2 ─────
const REDIRECT_PATHS: string[] = [
  // Legacy listing routes
  '/admin', '/trading', '/settlement', '/carbon', '/projects', '/grid', '/contracts',
  // Esums O&M shell (folded into the esco Horizon lanes)
  '/esums',
  // Sample retired workstation routes
  '/trader-risk/workstation', '/ipp-lifecycle/workstation', '/support/workstation',
  // /launch/:role post-login entry (redirects for every role)
  '/launch/trader', '/launch/esco',
];

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Home (/v2) — per-role work queue renders', () => {
  for (const c of HORIZON_CASES) {
    test(`v2 home [${c.role}] mounts and loads the work queue`, async ({ page, baseURL }) => {
      const errors = collectErrors(page);
      await seedToken(page, c.tokenRole);
      await goTo(page, baseURL, '/horizon');
      await page.waitForURL('**/v2', { timeout: 15_000 });

      // Not the login page (ProtectedRoute let us through on the mocked user).
      await expect(page.locator('input[type=password]')).toHaveCount(0, { timeout: 5_000 });
      await expect(page.locator('nav.v2-nav')).toBeVisible({ timeout: 30_000 });

      if (hasRealToken(c.tokenRole)) {
        // Real token → the queue read succeeds → success branch: the metric
        // strip or all-clear hero renders, never the load-error state.
        await expect(
          page.locator('.v2-stats').or(page.locator('.v2-hero h1')).first(),
        ).toBeVisible({ timeout: 30_000 });
        const real = errors.filter((e) => e.startsWith('api.5'));
        expect(real, `5xx on /v2 as ${c.role}:\n${real.join('\n')}`).toEqual([]);
      } else {
        // No real token this run (e.g. cold setup hit the login rate limit for a
        // newly-added role). Live data isn't reachable, so only assert the
        // honest load-error mount. Flag the skipped strict check so it isn't silent.
        await expect(page.locator('.v2-empty').first()).toBeVisible({ timeout: 30_000 });
        console.warn(`[v2 home] no real token for "${c.tokenRole}" — asserted load-error mount only`);
      }
    });
  }
});

test.describe('Suite pages — load without errors', () => {
  for (const c of SUITE_CASES) {
    test(`suite [${c.name}] redirects into v2`, async ({ page, baseURL }) => {
      const errors = collectErrors(page);
      await seedToken(page, c.tokenRole);
      await goTo(page, baseURL, c.path);
      // Every legacy suite route now redirects into the v2 rebuild. The old
      // role-copy match (expectText) survived only by coincidence (a journey
      // tab label happened to contain the word) and has no v2 analogue — the
      // honest assertion now is: the redirect lands on the v2 shell and
      // nothing 5xx'd.
      await page.waitForURL('**/v2', { timeout: 15_000 }).catch(() => {});
      await expect(page.locator('nav.v2-nav')).toBeVisible({ timeout: 25_000 });
      const real = errors.filter((e) => e.startsWith('api.5'));
      expect(real, `5xx errors on ${c.path}:\n${real.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Standalone pages — load without errors', () => {
  for (const c of ADMIN_PAGE_CASES) {
    test(`page [${c.name}] loads without 5xx errors`, async ({ page, baseURL }) => {
      const errors = collectErrors(page);
      // Mock the AI-powered briefing endpoint so it doesn't trigger a slow Workers AI
      // call — the component will show the empty state which still contains "briefing".
      await page.route('**/api/briefing*', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":null}' }),
      );
      await seedToken(page, 'admin');
      await goTo(page, baseURL, c.path);
      await expect(page.locator('body')).toContainText(c.expectText, { timeout: 25_000 });
      const real = errors.filter((e) => e.startsWith('api.5'));
      expect(real, `5xx errors on ${c.path}:\n${real.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Public pages — no auth required', () => {
  for (const c of PUBLIC_PAGE_CASES) {
    test(`public page [${c.name}] renders`, async ({ page, baseURL }) => {
      const errors = collectErrors(page);
      await goTo(page, baseURL, c.path);
      await expect(page.locator('body')).toContainText(c.expectText, { timeout: 15_000 });
      const real = errors.filter((e) => e.startsWith('api.5'));
      expect(real, `5xx errors on ${c.path}:\n${real.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('Auth flows', () => {
  test('login page renders form elements', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    await goTo(page, baseURL, '/login');
    // React may still be mounting — wait for body content first
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15_000 });
    await expect(
      page.locator('input[type=email], input[name=email], input[autocomplete=email]'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type=password]')).toBeVisible({ timeout: 10_000 });
    const real = errors.filter((e) => e.startsWith('pageerror'));
    expect(real, real.join('\n')).toEqual([]);
  });

  test('unauthenticated access to protected route redirects to login', async ({ page, baseURL }) => {
    // No token seeded — auth refresh returns 401. /admin redirects to /v2,
    // which is ProtectedRoute-gated → redirects on to /login.
    await page.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {});
    const url = page.url();
    const isOnLogin = url.includes('/login') || url.includes('/launch');
    expect(isOnLogin, `Expected redirect to /login, got: ${url}`).toBe(true);
  });

  test('invalid role in URL does not infinite-loop', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    await seedToken(page, 'admin');
    await goTo(page, baseURL, '/launch/invalid_role_xyz');
    // Should redirect (to /v2) or show an error — not hang on the bad path.
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).not.toContain('invalid_role_xyz');
    const pageErrors = errors.filter((e) => e.startsWith('pageerror'));
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
  });
});

test.describe('Legacy + workstation routes redirect into v2', () => {
  for (const path of REDIRECT_PATHS) {
    test(`retired route [${path}] redirects into v2`, async ({ page, baseURL }) => {
      await seedToken(page, 'admin');
      await goTo(page, baseURL, path);
      await page.waitForURL('**/v2', { timeout: 15_000 }).catch(() => {});
      expect(page.url(), `${path} did not redirect to /v2`).toContain('/v2');
      await expect(page.locator('nav.v2-nav')).toBeVisible({ timeout: 20_000 });
    });
  }
});

// NOTE: two describe blocks previously lived here —
// "Meridian chrome + duty-stream collapse" (asserted .mer.jc, the absence of
// aside.oe-rail/fiori-rail, and a header .wordmark "OPEN ENERGY" string) and
// "Admin role-switch board" (asserted an admin-only role switcher at
// `nav[aria-label="View board as role"] .role-switch[role="group"]`). Both
// selectors are Meridian-only and have no v2 analogue — the v2 shell has no
// wordmark header and no admin board role-switcher (confirmed absent from
// pages/src/v2/Shell.tsx and Home.tsx). Deleted rather than retargeted; the
// per-role mount + load-error coverage they duplicated already lives in
// "Home (/v2) — per-role work queue renders" above.

test.describe('Error states and edge cases', () => {
  test('monitoring page has retry button on error state', async ({ page, baseURL }) => {
    await seedToken(page, 'admin');
    // Force the monitoring API to fail to trigger error state
    await page.route('**/api/admin/monitoring**', async (route) => {
      await route.fulfill({ status: 500, body: '{"error":"test"}' });
    });
    await goTo(page, baseURL, '/admin/monitoring');
    await expect(page.locator('body')).toContainText(/monitoring/i, { timeout: 20_000 });
    // If error state appears, retry button should exist
    const errorText = page.locator('[class*="error"], [data-testid*="error"]');
    if (await errorText.count() > 0) {
      await expect(page.getByRole('button', { name: /retry/i })).toBeVisible({ timeout: 5_000 });
    }
  });

  test('404 route shows login or redirect, not blank page', async ({ page, baseURL }) => {
    await goTo(page, baseURL, '/definitely-not-a-real-route-xyz123');
    const body = await page.locator('body').textContent();
    // Should not be completely blank
    expect(body?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('settings page loads without errors', async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    await seedToken(page, 'admin');
    await goTo(page, baseURL, '/settings');
    await expect(page.locator('body')).toContainText(/setting|profile|account/i, { timeout: 20_000 });
    const real = errors.filter((e) => e.startsWith('pageerror') || e.startsWith('api.5'));
    expect(real, real.join('\n')).toEqual([]);
  });
});
