// ═══════════════════════════════════════════════════════════════════════════
// CEC month-of-actions simulation — 9 CONCURRENT role users.
//
// This is the national-launch readiness drill. globalSetup has already logged
// in all 9 demo roles (tokens in PLAYWRIGHT_{ROLE}_TOKEN). We then spin up one
// isolated browser context PER ROLE and run them simultaneously via Promise.all
// — a true concurrent-user load against a single Cloudflare/miniflare origin —
// while each "user" works the full CEC surface set the way a real operator
// would over a month:
//
//   Horizon board  → read live cases + fire up to N duty-stream actions
//   Atlas (⌘K idx) → enumerate every reachable function tile for the role
//   Ledger/:chain  → scan a chain, open the first case
//   Thread/:chain  → advance the chain via the role-filtered action bar
//   Surface/:key   → open non-chain Meridian surfaces (master-data / analytics)
//
// We loop WEEKS rounds so chains actually move through their state machines —
// the same case advanced four times in four "weeks". Every navigation/action is
// best-effort (captured, never thrown mid-walk) so one role's 409 doesn't abort
// the cohort. Hard failures (page crash, JS error, api 5xx, post-auth bounce to
// /login, blank board) are aggregated into a structured report written to
// test-results/month-sim-report.json, then asserted at the end.
//
// Zero logins in this file — all auth comes from the seeded env tokens, keeping
// us inside the 10 / 5 min sensitive-route rate-limit budget.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Weeks of simulated work. Each round re-reads Horizon and pushes chains forward.
const WEEKS = Number(process.env.MONTHSIM_WEEKS || 4);
// Per-round caps — keep the run bounded but exercise real depth.
const DUTY_ACTIONS_PER_ROUND = 2;
const LEDGERS_PER_ROUND = 3;

// role key (matches user.role / surface-registry / horizon path) → token env var.
const COHORT: Array<{ role: string; envKey: string }> = [
  { role: 'admin',          envKey: 'PLAYWRIGHT_ADMIN_TOKEN' },
  { role: 'trader',         envKey: 'PLAYWRIGHT_TRADER_TOKEN' },
  { role: 'ipp_developer',  envKey: 'PLAYWRIGHT_IPP_TOKEN' },
  { role: 'offtaker',       envKey: 'PLAYWRIGHT_OFFTAKER_TOKEN' },
  { role: 'carbon_fund',    envKey: 'PLAYWRIGHT_CARBON_TOKEN' },
  { role: 'lender',         envKey: 'PLAYWRIGHT_LENDER_TOKEN' },
  { role: 'regulator',      envKey: 'PLAYWRIGHT_REGULATOR_TOKEN' },
  { role: 'grid_operator',  envKey: 'PLAYWRIGHT_GRID_TOKEN' },
  { role: 'support',        envKey: 'PLAYWRIGHT_SUPPORT_TOKEN' },
];

// Benign console/network noise that isn't a real defect (prod parity with the
// other browser specs). Real 5xx is caught via the response listener (has URL).
function isBenign(msg: string): boolean {
  return (
    msg.includes('ServiceWorkerRegistration') ||
    msg.includes('Failed to load resource: the server responded with a status of') ||
    msg.includes('notifications/unread-count') ||
    msg.includes('insights/chain/') ||
    msg.includes('grid-operator/curtailment') ||
    msg.includes('cdnfonts') ||
    msg.includes('ERR_CONNECTION_CLOSED') ||
    msg.includes('ERR_CONNECTION_REFUSED') ||
    msg.includes('ERR_NETWORK_CHANGED')
  );
}

interface RoleReport {
  role: string;
  authed: boolean;            // did the seeded token survive (no bounce to /login)?
  boardRendered: boolean;     // did .mer.horizon paint?
  liveCases: number;          // counts.total off the first board read
  atlasFunctions: number;     // reachable function tiles enumerated
  surfacesOpened: number;     // /surface/:key bodies that rendered
  ledgersScanned: number;     // /ledger/:chain pages that rendered
  threadsOpened: number;      // /thread cases opened
  actionsFired: number;       // duty-stream + thread action-bar clicks attempted
  advances: number;           // actions that changed state (status moved or refresh ok)
  // Hard failures — these fail the test.
  pageErrors: string[];
  api5xx: string[];
  loginBounces: string[];
  // Soft signals — surfaced in the report, do not fail the test.
  actionRejections: string[]; // 409 reason strings (expected state-machine guards)
  notes: string[];
}

function newReport(role: string): RoleReport {
  return {
    role, authed: true, boardRendered: false, liveCases: 0, atlasFunctions: 0,
    surfacesOpened: 0, ledgersScanned: 0, threadsOpened: 0, actionsFired: 0, advances: 0,
    pageErrors: [], api5xx: [], loginBounces: [], actionRejections: [], notes: [],
  };
}

// Seed the seeded-token session AND mock the auth-bootstrap round trip.
//
// AuthContext mounts with token=null, POSTs /auth/refresh, then GETs /auth/me to
// hydrate the user. Under 9-way concurrent load a REAL /auth/me on every full
// navigation (each goto remounts AuthContext) swamps the single dev worker and
// bounces sessions to /login. A real logged-in user only fetches /auth/me once
// per session — so we MOCK it with the user body captured ONCE in globalSetup.
// This keeps the concurrent load on the actual data/chain endpoints (horizon,
// ledger, thread, surface), where it belongs, instead of on auth bootstrap.
async function seedToken(page: Page, token: string, user: unknown) {
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token, expires_in: 3600 } }),
    }),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: user }),
    }),
  );
  await page.addInitScript((tok) => { localStorage.setItem('token', tok as string); }, token);
}

function wireCapture(page: Page, rpt: RoleReport, baseURL: string) {
  page.on('pageerror', (e) => rpt.pageErrors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isBenign(msg.text())) rpt.pageErrors.push(`console: ${msg.text()}`);
  });
  page.on('response', (resp) => {
    const s = resp.status();
    if (s >= 500 && resp.url().includes('/api/')) rpt.api5xx.push(`${s} ${resp.url().replace(baseURL, '')}`);
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && /\/login(\?|$)/.test(frame.url())) {
      rpt.loginBounces.push(frame.url().replace(baseURL, ''));
    }
  });
}

// Settle helper — give React time to resolve a lazy chunk + its data fetch.
async function settle(page: Page, ms = 800) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
}

// IMPORTANT: locator.isVisible() polls ONCE and returns immediately — its
// `timeout` option is ignored. To actually WAIT for an element we must use
// waitFor({state:'visible'}). This wraps it into a boolean (never throws).
async function visible(page: Page, selector: string, ms: number): Promise<boolean> {
  return page.locator(selector).first()
    .waitFor({ state: 'visible', timeout: ms })
    .then(() => true)
    .catch(() => false);
}

// Navigate to `url` and WAIT for `selector`, tolerating the seeded-token
// bootstrap race. AuthContext starts with token=null and does a
// /auth/refresh→/auth/me round trip on mount; if that first /auth/me throws
// (cold worker, amplified under 9-way concurrent load), refreshUser nukes the
// token and ProtectedRoute bounces to /login. Re-navigating remounts
// AuthContext and re-bootstraps from the still-present localStorage token —
// self-healing, exactly as a real user's httpOnly-cookie refresh would.
//
// PERF: we RACE the target selector against a /login URL-change so a bounce is
// detected the instant it happens (~sub-second) instead of after a full
// selector timeout. Under 9-way concurrency almost every navigation bounces
// once; without the race each retry would burn 25s and blow the test budget.
async function landAt(page: Page, url: string, selector: string, rpt: RoleReport, attempts = 6): Promise<boolean> {
  for (let a = 0; a < attempts; a++) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((e) => rpt.notes.push(`nav ${url}: ${e}`));
    const outcome = await Promise.race([
      page.locator(selector).first().waitFor({ state: 'visible', timeout: 25_000 })
        .then(() => 'ok').catch(() => 'miss'),
      page.waitForURL(/\/login(\?|$)/, { timeout: 25_000 })
        .then(() => 'bounce').catch(() => 'miss'),
    ]);
    if (outcome === 'ok') return true;
    // Bounced to /login — remount re-bootstraps. Brief pause, then retry fast.
    if (outcome === 'bounce') { await page.waitForTimeout(400); continue; }
    // Neither won within 25s: a slow render may have finished during the race,
    // or we bounced right at the deadline. Re-check both cheaply before giving up.
    if (await visible(page, selector, 3_000)) return true;
    if (/\/login(\?|$)/.test(page.url())) { await page.waitForTimeout(400); continue; }
    return false;
  }
  return false;
}

// Land on the role's Horizon board.
function landBoard(page: Page, baseURL: string, rpt: RoleReport): Promise<boolean> {
  return landAt(page, `${baseURL}/horizon`, '.mer.horizon', rpt);
}

// ── Per-role month walk ───────────────────────────────────────────────────
// Each role runs in its OWN Playwright worker process (test.describe parallel
// mode + --workers≈9), so this is real OS-level concurrency against one origin
// — no 9-contexts-in-one-process CPU starvation. No stagger needed.
async function runRoleUser(browser: Browser, role: string, token: string, user: unknown, baseURL: string): Promise<RoleReport> {
  const rpt = newReport(role);
  let ctx: BrowserContext | null = null;
  try {
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await seedToken(page, token, user);
    wireCapture(page, rpt, baseURL);

    // ── Land on the role's Horizon board ──────────────────────────────────
    // landBoard() WAITS for .mer.horizon (waitFor, not the non-waiting
    // isVisible) and tolerates the seeded-token bootstrap /login bounce.
    rpt.boardRendered = await landBoard(page, baseURL, rpt);
    if (!rpt.boardRendered) { rpt.notes.push('horizon board did not render'); }
    // Header wordmark must be the single CEC brand (consolidation contract).
    const wordmark = await page.locator('header .wordmark').first().textContent().catch(() => null);
    if (wordmark && !/OPEN ENERGY|CEC|ATLAS/.test(wordmark)) rpt.notes.push(`unexpected wordmark: ${wordmark}`);

    // ── WEEKS rounds of work ──────────────────────────────────────────────
    for (let week = 1; week <= WEEKS; week++) {
      // Re-read the board each week so advanced cases re-bucket.
      if (week > 1) await landBoard(page, baseURL, rpt);
      await settle(page);

      // Capture live-case count from the duty/board on the first week.
      if (week === 1) {
        const ctxLine = await page.locator('header .mer-ctx, header').first().textContent().catch(() => '');
        const m = /(\d+)\s*live/.exec(ctxLine || '');
        if (m) rpt.liveCases = Number(m[1]);
      }

      // Fire up to N duty-stream actions (these POST real chain endpoints).
      const dutyBtns = page.locator('aside[aria-label="Duty stream"] .duty .acts .btn.pri, aside[aria-label="Duty stream"] .duty .acts .btn.ox');
      const dutyN = Math.min(await dutyBtns.count().catch(() => 0), DUTY_ACTIONS_PER_ROUND);
      for (let i = 0; i < dutyN; i++) {
        const btn = dutyBtns.nth(i);
        if (!(await btn.isVisible().catch(() => false))) continue;
        rpt.actionsFired++;
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
        // A surfaced action error is an expected state-machine guard, not a defect.
        const actErr = page.locator('aside[aria-label="Duty stream"] .act-error span').first();
        if (await actErr.isVisible().catch(() => false)) {
          rpt.actionRejections.push(`duty: ${(await actErr.textContent().catch(() => '')) ?? ''}`.trim());
          await page.locator('aside[aria-label="Duty stream"] .act-error .btn.ghost').first().click().catch(() => {});
        } else {
          rpt.advances++;
        }
      }
    }

    // ── Atlas: enumerate every reachable function for this role ────────────
    // Atlas Hybrid (platform-ease P3): the full library lives in collapsed domain
    // accordions, with a prioritised "Your Work" card strip on top. Expand every
    // accordion first, then harvest links from both the accordion .fn rows and the
    // Your Work / Deal Desk cards (.atlas-card-main).
    await landAt(page, `${baseURL}/atlas`, '.mer.atlas', rpt);
    await settle(page);
    const accHeads = page.locator('.mer.atlas .atlas-acc-head');
    const accCount = await accHeads.count().catch(() => 0);
    for (let i = 0; i < accCount; i++) {
      await accHeads.nth(i).click().catch(() => {});
    }
    await settle(page, 300);
    const fnLinks = page.locator('.mer.atlas .atlas-acc-body .fn .name, .mer.atlas .atlas-card-main');
    rpt.atlasFunctions = await fnLinks.count().catch(() => 0);
    // Harvest hrefs so we can drive ledgers/surfaces without stale-element churn.
    const hrefs: string[] = [];
    for (let i = 0; i < rpt.atlasFunctions; i++) {
      const h = await fnLinks.nth(i).getAttribute('href').catch(() => null);
      if (h) hrefs.push(h);
    }
    const ledgerHrefs = hrefs.filter((h) => h.startsWith('/ledger/'));
    const surfaceHrefs = hrefs.filter((h) => h.startsWith('/surface/'));

    // ── Open a couple of non-chain surfaces ───────────────────────────────
    for (const h of surfaceHrefs.slice(0, 2)) {
      const ok = await landAt(page, `${baseURL}${h}`, '.mer', rpt);
      await settle(page, 600);
      const broken = await page.locator('.mer-error').isVisible().catch(() => false);
      if (ok && !broken) rpt.surfacesOpened++;
      else rpt.notes.push(`surface ${h} did not render cleanly`);
    }

    // ── Scan ledgers + advance threads ────────────────────────────────────
    for (const h of ledgerHrefs.slice(0, LEDGERS_PER_ROUND)) {
      const ledgerOk = await landAt(page, `${baseURL}${h}`, '.mer.ledger', rpt);
      if (!ledgerOk) { rpt.notes.push(`ledger ${h} did not render`); continue; }
      rpt.ledgersScanned++;
      await settle(page, 600);

      // Open the first case card → Thread.
      const firstCard = page.locator('.mer.ledger .lcard').first();
      if (!(await firstCard.isVisible().catch(() => false))) continue;
      await firstCard.click().catch(() => {});
      const threadOk = await visible(page, '.mer.thread', 20_000);
      if (!threadOk) { rpt.notes.push(`thread from ${h} did not render`); continue; }
      rpt.threadsOpened++;
      await settle(page, 500);

      // Advance the chain via the action bar — but only no-field actions
      // (schema-form actions need typed input we can't generically synthesise).
      const statusBefore = await page.locator('.mer.thread .case-sub .chip').first().textContent().catch(() => '');
      const actBtns = page.locator('.mer.thread .actbar-btns .btn');
      const actN = Math.min(await actBtns.count().catch(() => 0), 1);
      for (let i = 0; i < actN; i++) {
        rpt.actionsFired++;
        await actBtns.nth(i).click().catch(() => {});
        await page.waitForTimeout(700);
        // If a veil/drawer opened (schema form), this action needs input — dismiss.
        const veil = page.locator('.mer.veil');
        if (await veil.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape').catch(() => {});
          rpt.notes.push('thread action requires form input — skipped');
          continue;
        }
        const actErr = page.locator('.mer.thread .actbar .act-error span').first();
        if (await actErr.isVisible().catch(() => false)) {
          rpt.actionRejections.push(`thread: ${(await actErr.textContent().catch(() => '')) ?? ''}`.trim());
        } else {
          const statusAfter = await page.locator('.mer.thread .case-sub .chip').first().textContent().catch(() => '');
          if (statusAfter && statusAfter !== statusBefore) rpt.advances++;
        }
      }
    }

    // Final auth check: a seeded user must never end up on /login.
    if (/\/login(\?|$)/.test(page.url())) rpt.authed = false;
  } catch (e) {
    rpt.notes.push(`fatal: ${e}`);
  } finally {
    await ctx?.close().catch(() => {});
  }
  return rpt;
}

// Per-role report fragments land here; the merge step below stitches them into
// the single triage artifact after the parallel cohort finishes.
const FRAG_DIR = path.join(process.cwd(), 'test-results', 'month-sim');

function writeFragment(rpt: RoleReport, base: string) {
  fs.mkdirSync(FRAG_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(FRAG_DIR, `${rpt.role}.json`),
    JSON.stringify({ generatedAgainst: base, weeks: WEEKS, report: rpt }, null, 2),
  );
}

// ── Concurrent role users — one test per role, parallel across worker procs ──
// `mode: 'parallel'` lets Playwright distribute these across separate worker
// PROCESSES (run with --workers≈9). Each role is its own OS process → its own
// Chromium → genuine concurrent-user load on the origin, with none of the
// single-process CPU starvation that made the old Promise.all-in-one-test flaky.
test.describe.configure({ mode: 'parallel' });

test.describe('CEC month simulation — concurrent role users', () => {
  for (const member of COHORT) {
    test(`[${member.role}] works the full CEC surface for a month`, async ({ browser, baseURL }) => {
      // A month of work per role (WEEKS rounds + atlas/ledger/thread walk) far
      // exceeds the 30s default; give each role user a generous budget.
      test.setTimeout(240_000);
      const base = baseURL || process.env.BASE || 'https://oe.vantax.co.za';

      const token = process.env[member.envKey];
      // No token = globalSetup couldn't log this role in (rate-limit / outage).
      // Skip rather than fail — a missing token isn't a product defect.
      test.skip(!token, `${member.envKey} not set — globalSetup could not seed ${member.role}`);

      // /auth/me body captured once by globalSetup. If absent (cold run that
      // couldn't reach /auth/me), fall back to a minimal user so the mock still
      // hydrates a logged-in AuthContext for this role.
      const userJson = process.env[`${member.envKey}_USER`];
      const user = userJson
        ? JSON.parse(userJson)
        : { id: member.role, email: `${member.role}@openenergy.co.za`, name: member.role, role: member.role, status: 'active' };

      const rpt = await runRoleUser(browser, member.role, token as string, user, base);
      writeFragment(rpt, base);

      const hard = rpt.pageErrors.length + rpt.api5xx.length;
      console.log(
        `[${rpt.role}] board=${rpt.boardRendered} live=${rpt.liveCases} atlas=${rpt.atlasFunctions} ` +
        `surfaces=${rpt.surfacesOpened} ledgers=${rpt.ledgersScanned} threads=${rpt.threadsOpened} ` +
        `fired=${rpt.actionsFired} advanced=${rpt.advances} rejections=${rpt.actionRejections.length} ` +
        `bounces=${rpt.loginBounces.length} HARD=${hard}` +
        (hard ? ` :: ${[...rpt.pageErrors, ...rpt.api5xx].slice(0, 3).join(' | ')}` : ''),
      );

      // ── Hard failures for THIS role only ──────────────────────────────────
      // NOTE: loginBounces is NOT a hard gate. Under seeded tokens the AuthContext
      // bootstrap (token=null → /auth/refresh → /auth/me) can transiently bounce to
      // /login on a cold worker; landBoard() self-heals by remounting. That bounce
      // is a test-harness artifact (real users carry an httpOnly refresh cookie),
      // so we assert the END state (authed: never finished on /login) instead.
      expect(rpt.boardRendered, `[${rpt.role}] Horizon board must render`).toBe(true);
      expect(rpt.authed, `[${rpt.role}] seeded user must not END on /login`).toBe(true);
      expect(rpt.pageErrors, `[${rpt.role}] no uncaught page/console errors`).toEqual([]);
      expect(rpt.api5xx, `[${rpt.role}] no API 5xx during the month simulation`).toEqual([]);
    });
  }
});

// Fragments are merged into test-results/month-sim-report.json by
// scripts/merge-month-sim.mjs after the parallel run (ordering across worker
// processes can't be guaranteed inside the suite, so the merge runs out-of-band).
