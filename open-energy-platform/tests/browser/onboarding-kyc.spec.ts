// ═══════════════════════════════════════════════════════════════════════════
// KYC self-service submission surface (Task 3.5) - Playwright flow.
//
// Drives the user-facing KYC submission surface mounted at the live Meridian
// /kyc route, and the "Verify to start transacting" Getting-Started gate item
// on the Horizon workspace. The surface reads GET /api/onboarding/kyc for the
// caller's kyc_status + per-document documents, uploads evidence via POST
// /api/onboarding/kyc/evidence, and submits the pack via POST
// /api/onboarding/kyc/submit. All reads/writes are mocked here for determinism
// so the render path is exercised without depending on live data.
//
// Rate-limit discipline: reuse the global-setup IPP token (one login), seed it
// via localStorage + a mocked /auth/refresh - same pattern as
// onboarding-activation.spec.ts.
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
  // Neutralise the PWA service worker (pages/src/lib/pwa.ts). Once it takes
  // control it serves /api/* from its own fetch handler, which bypasses
  // page.route - the KYC reads/writes would hit the real backend. Block the
  // registration before any app code runs so the API mocks below intercept.
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
    // Suppress the global OnboardingTour overlay for these specs.
    localStorage.setItem('oe.onboarding.skipped', '1');
  }, tokenValue);
}

function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of')
  );
}

// The caller's KYC state: pending, no documents yet.
const KYC_PENDING_PAYLOAD = {
  success: true,
  data: {
    kyc_status: 'pending',
    documents: {},
  },
};

// Minimal valid HorizonData envelope - HorizonPage.tsx bails to a skeleton until
// fetchHorizon resolves. counts must be present; lanes/duty may be empty.
const HORIZON_PAYLOAD = {
  success: true,
  data: {
    lanes: [],
    duty: [],
    counts: { total: 0, breached: 0 },
  },
};

// Checklist envelope for the Getting-Started card on Horizon.
const CHECKLIST_PAYLOAD = {
  success: true,
  data: {
    role: 'ipp_developer',
    items: [
      { key: 'complete_profile', label: 'Complete your profile', description: 'x', href: '/horizon', done: false },
    ],
    progress: { done: 0, total: 1 },
    complete: false,
    next_best_step: null,
  },
};

const STATE_PAYLOAD = {
  success: true,
  data: {
    step: 'complete',
    data: {},
    completed: true,
    skipped: false,
    role: 'ipp_developer',
    manifest: {
      headline: 'Welcome to Open Energy.',
      profile_summary: {},
      next_actions: [],
    },
    provisioned: { kind: 'manifest', entities: [] },
  },
};

test('KYC surface renders the status timeline and per-document-type slots', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) errors.push(`api.5xx: ${s} ${resp.url()}`);
  });

  await seedToken(page);

  // KYC reads/writes - pending status, empty documents, then evidence + submit.
  await page.route('**/api/onboarding/kyc/evidence', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { id: 'doc_1', document_type: 'id_document', status: 'pending' } }),
    });
  });
  await page.route('**/api/onboarding/kyc/submit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { kyc_status: 'in_review' } }),
    });
  });
  // The bare GET - keep this LAST so the more-specific /evidence and /submit
  // routes match first (Playwright matches the most-recently-registered route).
  await page.route('**/api/onboarding/kyc', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KYC_PENDING_PAYLOAD) });
  });

  await page.goto(`${baseURL}/kyc`, { waitUntil: 'load' });

  // The status timeline renders with the four states; "pending" is the current step.
  await expect(page.getByText(/pending/i).first()).toBeVisible({ timeout: 20_000 });

  // At least one human-readable document-type label renders ("ID document").
  await expect(page.getByText(/ID document/i).first()).toBeVisible({ timeout: 10_000 });

  // Exactly one primary submit CTA on the surface.
  await expect(page.getByRole('button', { name: /Submit for verification/i })).toBeVisible({ timeout: 10_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});

test('Getting-Started surfaces the verify-to-transact item when KYC is not approved', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

  await seedToken(page);

  await page.route('**/api/onboarding/checklist/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHECKLIST_PAYLOAD) });
  });
  await page.route('**/api/onboarding/state', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATE_PAYLOAD) });
  });
  await page.route('**/api/horizon/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HORIZON_PAYLOAD) });
  });
  // The gate renders on user.kyc_status !== 'approved' (GettingStarted.tsx) and
  // the demo persona IS approved on prod — patch /auth/me to a pending user so
  // the assertion is deterministic instead of data-dependent.
  await page.route('**/api/auth/me', async (route) => {
    const real = await route.fetch();
    const body = await real.json();
    if (body?.data) body.data.kyc_status = 'pending';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto(`${baseURL}/cockpit`, { waitUntil: 'load' });

  // Best-effort: the verify item depends on the GettingStarted card rendering
  // past the horizon skeleton guard. The /kyc surface test above is the
  // must-pass; this assertion documents the intended gate.
  await expect(page.getByText(/Verify to start transacting/i)).toBeVisible({ timeout: 20_000 });

  const real = errors.filter((e) => !isBenign(e));
  expect(real, real.join('\n')).toEqual([]);
});
