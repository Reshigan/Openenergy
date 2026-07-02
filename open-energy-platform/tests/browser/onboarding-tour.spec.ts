// ═══════════════════════════════════════════════════════════════════════════
// First-run guided tour (Task 4.1) - Playwright flow.
//
// Drives the inline anchored intro cards mounted on each Meridian surface by
// GuidedTour. Each surface shows ONE small inline card (NOT a modal) at the top
// of its content, with a "Got it" (dismiss this surface) and "Skip tour"
// (suppress all remaining) button pair. Seen-state is persisted per device in
// the SAME localStorage ledger the wizard tour uses (oe.onboarding.tour.completed)
// under the meridian.surface.* namespace. No backend route, no migration.
//
// Rate-limit discipline: reuse the global-setup IPP token (one login), seed it
// via localStorage + a mocked /auth/refresh - same pattern as
// onboarding-kyc.spec.ts. The init script CLEARS the tour ledger and ensures
// oe.onboarding.skipped is NOT set so the cards actually paint.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

let SHARED_IPP_TOKEN: string | null = null;

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_IPP_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_IPP_TOKEN not set - global-setup may have failed');
  SHARED_IPP_TOKEN = tok;
});

async function seedToken(page: import('@playwright/test').Page) {
  if (!SHARED_IPP_TOKEN) throw new Error('shared IPP token not initialised');
  const tokenValue = SHARED_IPP_TOKEN;
  // Neutralise the PWA service worker so page.route intercepts hit our mocks.
  await page.addInitScript(() => {
    if ('serviceWorker' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator.serviceWorker as any).register = () => Promise.reject(new Error('SW disabled in test'));
    }
  });
  // AuthContext bootstraps via httpOnly cookie refresh - not available in
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
    // Clear the tour ledger and ensure no kill-switch so the cards paint —
    // but only ONCE per browser context. addInitScript re-runs on every
    // navigation, and re-clearing wiped the very dismiss/skip state these
    // tests assert persists across pages/reloads (self-defeating).
    if (!sessionStorage.getItem('pw_tour_cleared')) {
      localStorage.removeItem('oe.onboarding.tour.completed');
      localStorage.removeItem('oe.onboarding.skipped');
      sessionStorage.setItem('pw_tour_cleared', '1');
    }
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
  );
}

// Minimal valid HorizonData envelope - HorizonPage bails to a skeleton until
// fetchHorizon resolves. counts must be present; lanes/duty may be empty.
const HORIZON_PAYLOAD = {
  success: true,
  data: { lanes: [], duty: [], counts: { total: 0, breached: 0 } },
};

const STATE_PAYLOAD = {
  success: true,
  data: {
    step: 'complete', data: {}, completed: true, skipped: false, role: 'ipp_developer',
    manifest: { headline: 'Welcome to Open Energy.', profile_summary: {}, next_actions: [] },
    provisioned: { kind: 'manifest', entities: [] },
  },
};

const CHECKLIST_PAYLOAD = {
  success: true,
  data: {
    role: 'ipp_developer', items: [],
    progress: { done: 0, total: 0 }, complete: true, next_best_step: null,
  },
};

const DEALS_TYPES_PAYLOAD = { success: true, data: { types: [] } };
const DEALS_PAYLOAD = { success: true, data: { requests: [], offers: [] } };

async function mockCommon(page: import('@playwright/test').Page) {
  await page.route('**/api/onboarding/state', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATE_PAYLOAD) });
  });
  await page.route('**/api/onboarding/checklist/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKLIST_PAYLOAD) });
  });
  await page.route('**/api/horizon/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HORIZON_PAYLOAD) });
  });
  await page.route('**/api/deals/types**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEALS_TYPES_PAYLOAD) });
  });
  await page.route('**/api/deals**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEALS_PAYLOAD) });
  });
}

test('Horizon tour card shows inline, dismisses with Got it, and stays dismissed', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) errors.push(`api.5xx: ${s} ${resp.url()}`);
  });

  await seedToken(page);
  await mockCommon(page);

  await page.goto(`${baseURL}/horizon`, { waitUntil: 'load' });

  // The Horizon tour card paints.
  await expect(page.getByText('This is Horizon')).toBeVisible({ timeout: 20_000 });

  // It is inline, not a modal: no dialog overlay, and the board behind it is
  // visible at the same time. The IPP role renders the bespoke IppHorizon whose
  // hero eyebrow ("YOUR GUIDE") is the stable board affordance — the old
  // "+ New transaction" link belonged to the shared board this role no longer sees.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.getByText(/YOUR GUIDE/i).first()).toBeVisible();

  // Dismiss this surface's card.
  await page.getByTestId('mer-tour-gotit').click();
  await expect(page.getByText('This is Horizon')).toHaveCount(0);

  // Persistence: a reload does NOT bring it back.
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByText(/YOUR GUIDE/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('This is Horizon')).toHaveCount(0);

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

// /atlas was retired to the journey cockpit (App.tsx redirects) — the skip-all
// behaviour is driven from the cockpit's own tour strip instead.
test('Skip tips on the cockpit suppresses the card on every remaining surface', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

  await seedToken(page);
  await mockCommon(page);

  await page.goto(`${baseURL}/cockpit`, { waitUntil: 'load' });

  // The cockpit tour strip paints.
  await expect(page.getByText('This is your cockpit')).toBeVisible({ timeout: 20_000 });

  // Skip the whole tour.
  await page.getByTestId('mer-tour-skip').click();
  await expect(page.getByText('This is your cockpit')).toHaveCount(0);

  // The Deal Desk card must NOT appear - skip suppresses remaining surfaces.
  await page.goto(`${baseURL}/deals`, { waitUntil: 'load' });
  await expect(page.getByText('DEAL DESK').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('This is the Deal Desk')).toHaveCount(0);

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
