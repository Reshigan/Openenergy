// ═══════════════════════════════════════════════════════════════════════════
// Meridian ADVANCE journey matrix — every NON-initiation chain, advanced one
// forward state through the deployed SPA, as Playwright tests from the registry.
//
// WHY A SECOND SUITE: meridian-journeys.spec.ts proves create→advance for the 118
// chains that expose an `initiation` block (a "+ New" form). The other 89 chains
// have NO create form — their rows are born from seed migrations, crons, or
// upstream cascades (verified: all 89 have seeded prod rows; 88 expose ≥1
// non-terminal row with ≥1 admin action; only ppa_obligation is currently
// all-terminal). For those chains the real user journey is NOT "create a row" —
// it is "open the ledger, pick a live case, advance it through the Thread". This
// suite drives exactly that path so the full 207-chain surface is exercised end-
// to-end through the UI, completing the "every user journey, every combination"
// coverage the create suite leaves open.
//
// SELF-CONTAINED ON PURPOSE: the helpers below are copied (not imported) from the
// create suite so this file cannot regress that prod-green suite. They are the
// same proven primitives — keep the two in sync if either changes.
//
// PER CHAIN (driven as ADMIN — in WRITE_ROLES, sees every lane):
//   1. Deep-link to the Ledger:        /ledger/<key>            (LedgerPage)
//   2. Assert the ledger surface paints (≥1 .lcard row — all 89 have seeded rows)
//   3. Discover a seeded NON-TERMINAL row id via an in-page same-origin fetch of
//      /api/ledger/<key> (browser UA dodges Cloudflare 1010; token from localStorage)
//   4. Deep-link to the Thread:        /thread/<key>/<id>       (ThreadPage)
//   5. Fire the first admin action the state machine accepts (forward-biased)
//   6. Record the outcome into the advance matrix
//
// HARD vs SOFT (mirrors the create suite's philosophy — the deliverable is a
// complete matrix, not a wall of red where a seeded row legitimately sits in a
// state with no admin-fireable forward action):
//   HARD (fails the chain's test):
//     • the ledger never paints a row             → real UI / data gap
//     • an advance attempt returns 5xx            → server-side crash, genuine bug
//   SOFT (recorded, not failed here):
//     • all seeded rows terminal (no advanceable) → data-state gap (e.g. ppa_obligation)
//     • advance 409/422 (invalid-from-state)      → tried next action
//     • no admin action valid from current status → recorded advanced=false
//   A SINGLE trailing test asserts NO advance returned 5xx and prints the matrix.
//
// RATE-LIMIT DISCIPLINE: reuse the global-setup ADMIN token (one login), seeded
// via localStorage + a mocked /auth/refresh. Ledger/thread GETs and advance
// POST/PUTs do not touch /api/auth/login, so the 10/5min limiter is untouched.
// ═══════════════════════════════════════════════════════════════════════════

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

type FieldSpec = { key: string; label: string; type: string; required: boolean; options: string[] | null; unit: string | null };
type ActionSpec = { action: string; label: string; path: string; method: string; roles: string[]; body: unknown; tone: string | null; fields: FieldSpec[] };
type ChainRow = {
  key: string; wave: number; title: string; table: string; statusCol: string;
  terminal: string[]; lanes: string[]; hasInitiation: boolean;
  initiation: { label: string; path: string; fields: FieldSpec[] } | null;
  actions: ActionSpec[];
};
const MATRIX_PATH = path.join(process.cwd(), 'tests', 'browser', 'fixtures', 'journey-matrix.json');
const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')) as { rows: ChainRow[] };
// The 89 chains with no create form — their rows are seed/cron/cascade-born.
const ADVANCE_CHAINS = matrix.rows.filter((r) => !r.hasInitiation);

const RUN = process.env.JOURNEY_RUN || Date.now().toString(36);
const STAMP = `E2E-CANARY-2026-${RUN}`;
const RESULTS_PATH = path.join(process.cwd(), 'tests', 'browser', 'fixtures', 'journey-advance-results.json');
const RESULTS_JSONL = path.join(process.cwd(), 'tests', 'browser', 'fixtures', 'journey-advance-results.jsonl');

// Forward-biased: try non-terminal verbs first so a live case advances forward
// rather than being immediately rejected/cancelled/closed.
const DESTRUCTIVE = /reject|cancel|withdraw|abort|decline|terminate|write_off|writeoff|dismiss|refuse|revoke|void|fail|clawback|claw_back/i;

interface AdvanceResult {
  key: string; wave: number; ledgerRows: number; rowId: string | null;
  rowStatus: string | null; advanced: boolean; advanceAction: string | null;
  advanceStatus: number; note: string;
}
const RESULTS: AdvanceResult[] = [];

let SHARED_ADMIN_TOKEN: string | null = null;
let SHARED_ADMIN_USER: unknown = null;

const ADMIN_EMAIL = 'admin@openenergy.co.za';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const TOKEN_REFRESH_MARGIN_MS = 8 * 60 * 1000;

function tokenLifeMs(tok: string | null): number {
  if (!tok) return 0;
  try {
    const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString('utf8'));
    return (payload.exp ?? 0) * 1000 - Date.now();
  } catch {
    return 0;
  }
}

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
  SHARED_ADMIN_TOKEN = tok;
  const userJson = process.env.PLAYWRIGHT_ADMIN_TOKEN_USER;
  if (userJson) { try { SHARED_ADMIN_USER = JSON.parse(userJson); } catch { /* fall back to real /auth/me */ } }
});

// Mint a fresh admin token when the shared one is near expiry. One real login,
// gated on remaining JWT life so it fires at most once per refresh window.
async function maybeRefreshToken(page: Page, baseURL?: string) {
  if (tokenLifeMs(SHARED_ADMIN_TOKEN) > TOKEN_REFRESH_MARGIN_MS) return;
  try {
    const url = `${baseURL ?? ''}/api/auth/login`;
    const r = await page.request.post(url, {
      data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD },
      failOnStatusCode: false,
    });
    if (r.ok()) {
      const fresh = (await r.json())?.data?.token;
      if (fresh) SHARED_ADMIN_TOKEN = fresh;
    }
  } catch {
    // Network error — keep the old token.
  }
}

async function seedToken(page: Page, baseURL?: string) {
  await maybeRefreshToken(page, baseURL);
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared ADMIN token not initialised');
  const tokenValue = SHARED_ADMIN_TOKEN;
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token: tokenValue, expires_in: 3600 } }),
    });
  });
  if (SHARED_ADMIN_USER) {
    const userBody = SHARED_ADMIN_USER;
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: userBody }),
      });
    });
  }
  await page.addInitScript((tok) => { localStorage.setItem('token', tok as string); }, tokenValue);
}

// Type-aware synthetic filler for action-form drawers. Identical to the create
// suite's: stamp the first string, fill required non-strings with valid values,
// pick the first real option for lookups so the action does not 422 on a bad FK.
async function fillForm(composer: ReturnType<Page['locator']>, fields: FieldSpec[]) {
  let stamped = false;
  for (const f of fields) {
    const loc = composer.locator(`#ff-${f.key}`);
    if (f.type === 'boolean') continue;
    if (f.type === 'string') {
      if (!stamped) { await loc.fill(STAMP); stamped = true; }
      else if (f.required) await loc.fill(stringFor(f.key));
      continue;
    }
    if (f.type === 'evidence') { await loc.fill(`${STAMP} synthetic evidence`); continue; }
    if (f.type === 'lookup') {
      await loc.locator('option:not([disabled])').first()
        .waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
      const vals = await loc.locator('option:not([disabled])').evaluateAll(
        els => els.map(e => (e as HTMLOptionElement).value).filter(v => v !== ''));
      if (vals.length) await loc.selectOption(vals[0]);
      continue;
    }
    if (!f.required) continue;
    if (f.type === 'enum') { if (f.options && f.options.length) await loc.selectOption(f.options[0]); }
    else if (f.type === 'number') await loc.fill('1000000');
    else if (f.type === 'date') await loc.fill('2026-12-31');
  }
}

function stringFor(key: string): string {
  if (/month|period/i.test(key)) return '2026-06';
  if (/year/i.test(key)) return '2026';
  return `E2E-CANARY-${key}-${RUN}`;
}

function isAdmin(a: ActionSpec): boolean { return (a.roles || []).includes('admin'); }

// Pull the rows for a chain from inside the page (browser UA dodges Cloudflare's
// python-UA ban; same-origin so the token in localStorage authenticates). Returns
// {id,status} pairs in ledger order so we can pick the first non-terminal case.
async function fetchLedgerRows(page: Page, key: string): Promise<{ http: number; rows: { id: string; status: string }[] }> {
  return page.evaluate(async (k) => {
    const tok = localStorage.getItem('token');
    const resp = await fetch(`/api/ledger/${k}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!resp.ok) return { http: resp.status, rows: [] as { id: string; status: string }[] };
    const j = await resp.json();
    const rows = (j?.data?.rows ?? []).map((r: { id: unknown; status: unknown }) => ({
      id: String(r.id), status: String(r.status ?? ''),
    }));
    return { http: resp.status, rows };
  }, key);
}

// ── One test per advance chain. ──────────────────────────────────────────────
for (const chain of ADVANCE_CHAINS) {
  test(`Meridian advance: ${chain.key} (W${chain.wave})`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    const r: AdvanceResult = {
      key: chain.key, wave: chain.wave, ledgerRows: 0, rowId: null, rowStatus: null,
      advanced: false, advanceAction: null, advanceStatus: 0, note: '',
    };
    try {
      await seedToken(page, baseURL);

      // 1 & 2. Ledger surface. Every no-init chain has seeded rows → at least one
      //        .lcard must paint (.lcard-empty is a different class, so this is a
      //        true "rows rendered" assertion). Reload once to absorb a slow paint.
      await page.goto(`${baseURL}/ledger/${chain.key}`, { waitUntil: 'load' });
      const firstCard = page.locator('.lcard').first();
      if (!(await firstCard.isVisible().catch(() => false))) {
        const painted = await firstCard.waitFor({ state: 'visible', timeout: 12_000 })
          .then(() => true).catch(() => false);
        if (!painted) { r.note = '[ledger-reload]'; await page.goto(`${baseURL}/ledger/${chain.key}`, { waitUntil: 'load' }); }
      }
      await expect(firstCard, `${chain.key}: ledger should render ≥1 seeded row (.lcard) on /ledger/${chain.key}`)
        .toBeVisible({ timeout: 20_000 });

      // 3. Discover a seeded NON-TERMINAL row to advance.
      const { http, rows } = await fetchLedgerRows(page, chain.key);
      r.ledgerRows = rows.length;
      if (http !== 200) { r.note += (r.note ? ' ' : '') + `[ledger-fetch ${http}]`; }
      const terminal = new Set(chain.terminal);
      const live = rows.find((row) => !terminal.has(row.status));
      if (!live) {
        // No advanceable case currently seeded (all terminal). Data-state gap, not a
        // code bug — record and pass (ledger surface already asserted above).
        r.note += (r.note ? ' ' : '') + `[no-advanceable-row: ${rows.length} rows all terminal]`;
        return;
      }
      r.rowId = live.id;
      r.rowStatus = live.status;

      // 4 & 5. Forward advance through the Thread. Same loop as the create suite's
      //         step 5/6: fire the first admin action the state machine accepts.
      await page.goto(`${baseURL}/thread/${chain.key}/${r.rowId}`, { waitUntil: 'load' });
      await page.locator('.actbar-btns').first()
        .waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
      const candidates = chain.actions.filter(isAdmin)
        .sort((a, b) => Number(DESTRUCTIVE.test(a.action)) - Number(DESTRUCTIVE.test(b.action)));
      const advanceDeadline = Date.now() + 30_000;
      for (const a of candidates) {
        if (Date.now() > advanceDeadline) { r.note += (r.note ? ' ' : '') + '[advance-timeout]'; break; }
        const btn = page.getByRole('button', { name: a.label, exact: true });
        if (!(await btn.count())) continue;
        const method = (a.method || 'POST').toUpperCase();
        const tail = a.path.replace('/api', '').replace(':id', r.rowId);
        const hasFields = !!(a.fields && a.fields.length);
        let aResp;
        try {
          if (hasFields) {
            await btn.first().click();
            const drawer = page.getByRole('dialog', { name: a.label });
            await expect(drawer).toBeVisible({ timeout: 5_000 });
            await fillForm(drawer, a.fields);
            [aResp] = await Promise.all([
              page.waitForResponse(
                (resp) => resp.url().includes(tail) && resp.request().method() === method,
                { timeout: 12_000 },
              ),
              drawer.getByRole('button', { name: a.label, exact: true }).click(),
            ]);
          } else {
            [aResp] = await Promise.all([
              page.waitForResponse(
                (resp) => resp.url().includes(tail) && resp.request().method() === method,
                { timeout: 12_000 },
              ),
              btn.first().click(),
            ]);
          }
        } catch {
          await page.keyboard.press('Escape');
          continue;
        }
        r.advanceStatus = aResp.status();
        r.advanceAction = a.action;
        if (aResp.status() >= 200 && aResp.status() < 300) { r.advanced = true; break; }
        if (hasFields) await page.keyboard.press('Escape');
      }
    } finally {
      RESULTS.push(r);
      try { fs.appendFileSync(RESULTS_JSONL, JSON.stringify(r) + '\n'); } catch { /* best-effort */ }
    }

    // HARD: no advance attempt may 5xx (a server crash on a live case is a real bug).
    expect(r.advanceStatus, `${chain.key}: advance returned 5xx — ${r.note}`).toBeLessThan(500);
  });
}

// ── Trailing aggregation: write the matrix, print it, assert no 5xx advances. ──
test('Meridian advance matrix — summary & 5xx gate', async () => {
  const byKey = new Map<string, AdvanceResult>();
  try {
    const raw = fs.readFileSync(RESULTS_JSONL, 'utf8');
    for (const ln of raw.split('\n')) {
      const t = ln.trim();
      if (!t) continue;
      try { const r = JSON.parse(t) as AdvanceResult; byKey.set(r.key, r); } catch { /* skip partial line */ }
    }
  } catch { /* no JSONL — fall back to in-memory only */ }
  for (const r of RESULTS) if (!byKey.has(r.key)) byKey.set(r.key, r);

  const sorted = [...byKey.values()].sort((a, b) => a.wave - b.wave || a.key.localeCompare(b.key));
  const advanced = sorted.filter((r) => r.advanced);
  const allTerminal = sorted.filter((r) => /no-advanceable-row/.test(r.note));
  const stuck = sorted.filter((r) => !r.advanced && !/no-advanceable-row/.test(r.note));
  const serverErrors = sorted.filter((r) => r.advanceStatus >= 500);

  const report = {
    generatedAgainst: process.env.BASE || 'https://oe.vantax.co.za',
    total: sorted.length,
    advanced: advanced.length,
    allTerminal: allTerminal.length,
    stuck: stuck.length,
    serverErrors: serverErrors.length,
    rows: sorted,
  };
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2));

  const line = (r: AdvanceResult) =>
    `  ${r.advanced ? '✓' : (r.advanceStatus >= 500 ? '✗' : '⚠')} W${r.wave} ${r.key.padEnd(34)} ` +
    `rows=${r.ledgerRows} ${r.advanced ? `advanced(${r.advanceAction})` : (r.advanceStatus ? `adv=${r.advanceStatus}` : 'no-advance')}` +
    `${r.note ? ` — ${r.note}` : ''}`;
  console.log(
    `\n══ Meridian advance matrix (${report.advanced}/${report.total} advanced, ` +
    `${report.allTerminal} all-terminal, ${report.stuck} stuck, ${report.serverErrors} server-errors) ══\n` +
    sorted.map(line).join('\n') + '\n',
  );

  expect(
    serverErrors.map((r) => `${r.key} → ${r.advanceStatus} ${r.note}`),
    'no advance chain should return 5xx',
  ).toEqual([]);
});
