// ═══════════════════════════════════════════════════════════════════════════
// Getting-Started activation card (Task 1.6) — Playwright flow.
//
// Drives the checklist-driven Getting-Started card on the Meridian Horizon
// workspace as the IPP developer persona. The card now reads
// GET /api/onboarding/checklist/:role for progress + items + the inline AI
// next-best-step, enriched (optionally) by the existing /onboarding/state
// manifest. All three reads are mocked here for determinism so the card's
// render path is exercised without depending on live data.
//
// Asserts:
//   1. The progress fraction (1 / 3) renders.
//   2. A primary "Do this" button (the AI next-best-step) is visible.
//   3. Clicking "Do this" navigates to next_best_step.action_href (/new).
//
// Rate-limit discipline: reuse the global-setup IPP token (one login), seed it
// via localStorage + a mocked /auth/refresh — same pattern as
// ipp-annual-compliance-assessment.spec.ts.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_IPP_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_IPP_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_IPP_TOKEN not set — global-setup may have failed');
  SHARED_IPP_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_IPP_TOKEN) throw new Error('shared IPP token not initialised');
  const tokenValue = SHARED_IPP_TOKEN;
  // Neutralise the PWA service worker (pages/src/lib/pwa.ts). Once it takes
  // control it serves /api/* from its own fetch handler, which bypasses
  // page.route — the card's checklist/state reads would hit the real backend
  // and its controllerchange reload would race the assertions. Block the
  // registration before any app code runs so the API mocks below intercept.
  await page.addInitScript(() => {
    if ('serviceWorker' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.serviceWorker as any).register = () => Promise.reject(new Error('SW disabled in test'));
    }
  });
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
    // Suppress the global OnboardingTour overlay for these specs - they
    // exercise the GettingStarted card, not the first-run tour. Without this
    // the tour (which renders once the wizard is complete) can paint on top of
    // the card and intercept the "Do this" click.
    localStorage.setItem('oe.onboarding.skipped', '1');
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
  );
}

// Minimal valid HorizonData envelope — HorizonPage.tsx bails to a skeleton until
// fetchHorizon resolves (the `if (!data)` guard at ~line 137). counts must be
// present (header reads counts.total / counts.breached); lanes/duty may be empty.
const HORIZON_PAYLOAD = {
  success: true,
  data: {
    lanes: [],
    duty: [],
    counts: { total: 0, breached: 0 },
  },
};

// Source of truth for the card: progress 1/3, one done + two not-done items, and
// the AI next-best-step pointing at /new.
const CHECKLIST_PAYLOAD = {
  success: true,
  data: {
    role: 'ipp_developer',
    items: [
      { key: 'complete_profile', label: 'Complete your profile', description: 'x', href: '/horizon', done: true },
      { key: 'first_project', label: 'Register your first project', description: 'y', href: '/new', done: false },
      { key: 'advance_project', label: 'Advance a project past development', description: 'z', href: '/horizon', done: false },
    ],
    progress: { done: 1, total: 3 },
    complete: false,
    next_best_step: {
      item_key: 'first_project',
      why: 'Your first project starts the development lifecycle.',
      action_href: '/new',
    },
  },
};

// Optional manifest enrichment — matches the real /onboarding/state shape
// (src/routes/onboarding.ts): headline + profile_summary + next_actions.
const STATE_PAYLOAD = {
  success: true,
  data: {
    step: 'complete',
    data: {},
    completed: true,
    skipped: false,
    role: 'ipp_developer',
    manifest: {
      headline: 'Welcome to Open Energy - here is how to get your first project moving.',
      profile_summary: { company: 'Vantax', technology: 'Solar PV' },
      next_actions: [
        { key: 'register', label: 'Register a project', route: '/new', description: 'Begin the development lifecycle.' },
      ],
    },
    provisioned: { kind: 'manifest', entities: [] },
  },
};

test('Getting-Started card shows checklist progress and a 1-click AI next step', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) errors.push(`api.5xx: ${s} ${resp.url()}`);
  });

  await seedToken(page);

  // Determinism: mock the three reads the card / page depend on.
  await page.route('**/api/onboarding/checklist/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKLIST_PAYLOAD) });
  });
  await page.route('**/api/onboarding/state', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATE_PAYLOAD) });
  });
  await page.route('**/api/horizon/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HORIZON_PAYLOAD) });
  });

  await page.goto(`${baseURL}/horizon`, { waitUntil: 'load' });

  // Progress fraction renders (the card is mounted at HorizonPage.tsx:163 after
  // the horizon fetch resolves past the skeleton guard).
  await expect(page.getByText('1 / 3')).toBeVisible({ timeout: 20_000 });

  // The AI next-best-step renders as a single primary "Do this" button.
  const doThis = page.getByRole('button', { name: /^Do this$/ });
  await expect(doThis).toBeVisible({ timeout: 10_000 });

  // 1-click accept navigates to next_best_step.action_href.
  await doThis.click();
  await expect(page).toHaveURL(/\/new$/, { timeout: 10_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('board never calls the disjoint /ux-state/onboarding store', async ({ page, baseURL }) => {
  await seedToken(page);

  // Same deterministic mocks the card / page depend on.
  await page.route('**/api/onboarding/checklist/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKLIST_PAYLOAD) });
  });
  await page.route('**/api/onboarding/state', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATE_PAYLOAD) });
  });
  await page.route('**/api/horizon/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HORIZON_PAYLOAD) });
  });

  // Trip-wire: the board must NOT touch the legacy oe_onboarding_state store.
  let uxStateHit = false;
  await page.route('**/ux-state/onboarding**', async (route) => {
    uxStateHit = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { completed: [] } }),
    });
  });

  await page.goto(`${baseURL}/horizon`, { waitUntil: 'load' });

  // Let the board settle past the skeleton + card render.
  await expect(page.getByText('1 / 3')).toBeVisible({ timeout: 20_000 });

  // Give any late effect a tick to fire.
  await page.waitForTimeout(500);

  expect(uxStateHit, 'board must not call the disjoint /ux-state/onboarding store').toBe(false);
});
