// ════════════════════════════════════════════════════════════════════════
// Helpers for the 15-minute product-film recording suite.
//
// Phase 3 of the pipeline (see docs/video/script-2026-05-25.md). Each role
// spec calls `shot(page, key, navigator, opts)` which:
//   1. ensures we have a cached API token for the demo role
//   2. seeds it into localStorage via addInitScript so the SPA boots
//      authenticated (no /login click-through on every shot)
//   3. runs the navigator function (the only per-shot variant)
//   4. holds the viewport on screen for `dwell` ms while Playwright
//      records — that recording is what the composite step will sequence
//      against the matching V/O beat
//
// One token per role, cached in module scope. We never call /api/auth/login
// more than once per role per run — the sensitive-route rate limiter caps
// /login at 10 / 5 min / IP, and the suite hits ~10 roles.
// ════════════════════════════════════════════════════════════════════════

import type { Page, APIRequestContext } from '@playwright/test';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';

export type Role =
  | 'admin'
  | 'trader'
  | 'ipp_developer'
  | 'offtaker'
  | 'lender'
  | 'carbon_fund'
  | 'regulator'
  | 'grid_operator'
  | 'support';

export const ROLE_EMAIL: Record<Role, string> = {
  admin: 'admin@openenergy.co.za',
  trader: 'trader@openenergy.co.za',
  ipp_developer: 'ipp@openenergy.co.za',
  offtaker: 'offtaker@openenergy.co.za',
  lender: 'lender@openenergy.co.za',
  carbon_fund: 'carbon@openenergy.co.za',
  regulator: 'regulator@openenergy.co.za',
  grid_operator: 'grid@openenergy.co.za',
  support: 'support@openenergy.co.za',
};

const TOKENS: Partial<Record<Role | 'public', string>> = {};

export async function ensureToken(
  request: APIRequestContext,
  baseURL: string,
  role: Role,
): Promise<string> {
  if (TOKENS[role]) return TOKENS[role]!;
  // Two attempts, 15s backoff between — same shape as workstations.spec.ts.
  for (const attempt of [0, 1]) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 15_000));
    const r = await request.post(`${baseURL}/api/auth/login`, {
      data: { email: ROLE_EMAIL[role], password: PASSWORD },
      failOnStatusCode: false,
    });
    if (r.ok()) {
      const tok = (await r.json())?.data?.token;
      if (tok) {
        TOKENS[role] = tok;
        return tok;
      }
    }
    if (attempt === 1) {
      throw new Error(`login for ${role} failed: HTTP ${r.status()} body=${(await r.text()).slice(0, 200)}`);
    }
  }
  throw new Error('unreachable');
}

export async function seedTokenAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript((tok) => {
    try {
      localStorage.setItem('token', tok as string);
      // Pre-record the privacy/cookies acknowledgement so the consent banner
      // (CookieConsentBanner.tsx) never paints on top of a shot. The banner
      // reads `oe.consent.v1` and `oe.session_id` on mount and only renders
      // when they're missing or the policy version doesn't match.
      const POLICY_VERSION = '2026-05-19';
      localStorage.setItem(
        'oe.consent.v1',
        JSON.stringify({
          version: POLICY_VERSION,
          analytics: false,
          marketing: false,
          at: new Date().toISOString(),
        }),
      );
      if (!localStorage.getItem('oe.session_id')) {
        // Stable session id keeps the consent record idempotent across shots.
        localStorage.setItem('oe.session_id', 'video-recording-session');
      }
      // Suppress any first-run onboarding overlays for the same reason.
      localStorage.setItem('oe.onboarding.skipped', '1');
    } catch {
      /* private mode etc. — non-fatal */
    }
  }, token);
}

export interface ShotOptions {
  /** Milliseconds the viewport holds on screen while Playwright records. Match the V/O beat. */
  dwell?: number;
  /** Wait for this selector to be visible before starting dwell. */
  waitFor?: string;
  /** Optional async scripted interaction (open modal, type, click). */
  interact?: (page: Page) => Promise<void>;
}

// Selectors that prove the SPA's first-paint "Loading…" splash (rendered by
// ProtectedRoute while useAuth().loading is true) has resolved into the
// FioriShell chrome. Without this, the recording captures the loading
// spinner for ~2s at the start of every shot.
const SHELL_READY = 'nav[aria-label="Primary"], header';

/**
 * Drives a single shot. The test wrapping this call gets one MP4 per shot
 * via Playwright's `video: 'on'` recording — the shot key is the test
 * title which we use later to rename the resulting media file.
 *
 * Recording timing is the difference between a polished and a raw shot:
 *   1. goto(domcontentloaded)
 *   2. wait for the FioriShell chrome — guarantees the "Loading…" splash is gone
 *   3. wait for the caller's content selector — guarantees real data has rendered
 *   4. networkidle — guarantees no remaining XHRs are about to repaint the view
 *   5. small pre-roll pause so the audience sees the steady frame before any motion
 *   6. interact (clicks, scrolls, hovers)
 *   7. dwell so the V/O beat plays over the final frame
 */
export async function shot(
  page: Page,
  url: string,
  opts: ShotOptions = {},
): Promise<void> {
  const dwell = opts.dwell ?? 10_000;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // First, get past the SPA's "Loading…" splash by waiting for shell chrome.
  await page.waitForSelector(SHELL_READY, { state: 'visible', timeout: 20_000 }).catch(() => undefined);
  if (opts.waitFor) {
    // Then wait for the caller's content selector so we never start mid-skeleton.
    await page.waitForSelector(opts.waitFor, { state: 'visible', timeout: 20_000 }).catch(() => undefined);
  }
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  // Settle frame before any motion — gives the recording a still beat to
  // start from, then the cursor/scroll moves register as a deliberate change.
  await page.waitForTimeout(600);
  if (opts.interact) {
    await opts.interact(page);
  }
  await page.waitForTimeout(dwell);
}

/**
 * Smoothly scrolls the page to a given Y offset, then waits `ms` milliseconds
 * so the scroll animation actually plays on camera. We hand the recording
 * something to look at instead of a static viewport while V/O continues.
 */
export async function smoothScroll(p: Page, top: number, ms = 900): Promise<void> {
  await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), top);
  await p.waitForTimeout(ms);
}

/**
 * Clicks a tab/button by accessible name, then waits for the swap to settle.
 * Without the networkidle wait, the recording catches a half-skeleton flash
 * while the new tab fetches data — kills the "smooth" feel the V/O sells.
 */
export async function clickTabAndSettle(
  p: Page,
  pattern: RegExp,
): Promise<void> {
  await p.getByRole('tab', { name: pattern }).click().catch(async () => {
    // Fallback for non-aria tabs (e.g. button-based tab strips)
    await p.getByRole('button', { name: pattern }).first().click().catch(() => undefined);
  });
  await p.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
  await p.waitForTimeout(600);
}

/**
 * Moves the mouse cursor to (x, y) over 25 intermediate steps. Playwright's
 * default `move` jumps the cursor instantly; the stepped variant gives the
 * recording a visible glide so the audience can follow what the operator
 * is reaching for.
 */
export async function moveCursor(p: Page, x: number, y: number): Promise<void> {
  await p.mouse.move(x, y, { steps: 25 });
}
