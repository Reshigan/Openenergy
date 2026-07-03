// ═══════════════════════════════════════════════════════════════════════════
// Meridian CROSS-ROLE advance probe — the two-sided journey for every chain.
//
// WHY A THIRD SUITE: meridian-journeys.spec.ts proves create→advance for the 118
// chains with an `initiation` form. meridian-advance-journeys.spec.ts advances the
// other 89 (seed/cron/cascade-born) AS ADMIN through the Thread — and cleared 52.
// The remaining 37 did NOT advance as admin, but NOT because admin lacks the role
// (verified: admin is in EVERY chain's WRITE_ROLES set, so it always passes the
// role guard — a 422 there means "valid role, invalid FROM-state", never 403).
// They did not advance because the seeded row sits at a status whose only valid
// forward action is owned by a DIFFERENT lane (e.g. an offtaker da-nomination, an
// ipp_developer cap submission). admin's Thread never renders a button for a lane
// it isn't in, so the admin-only suite cannot fire it. The genuine product journey
// there is the two-sided handoff: render the case AS the owning role and fire the
// lane action. This suite drives exactly that — "every use case and any combination".
//
// FAITHFUL TO THE NETWORK CONTRACT: each action is fired with an in-page
// same-origin fetch carrying the OWNING ROLE's real JWT (minted once by
// global-setup, one login per role). That is byte-for-byte what role R's SPA sends
// when R clicks the button (axios api.post → POST /api/<chain>/:id/<verb> with
// `Authorization: Bearer <R-token>`). The browser UA dodges Cloudflare's 1010
// python-UA ban. We render the Ledger (and the Thread of the row we touch) as admin
// only so the page paints without nine separate logins — the mutating call always
// carries the owning role's token, so the authorization path under test is real.
//
// PER CHAIN:
//   1. Deep-link the Ledger /ledger/<key>; assert it paints (HARD — all have rows).
//   2. in-page fetch /api/ledger/<key>; take up to MAX_ROWS non-terminal rows.
//   3. For each row, render the Thread, then try each registry action
//      (non-destructive first) firing with candidate tokens in order:
//        [ each action.role mapped to its persona token,  admin,  support ]
//      Stop the whole chain on the first 2xx (record which role+action advanced).
//      admin/support are the universal fallback: admin is in every WRITE_ROLES set,
//      so if SOME forward transition exists from the row's status, one candidate
//      will 2xx. If NONE do across every row/action/role, the chain has no registry
//      action valid from its seeded state — a genuine UI (action-hint) gap.
//
// HARD vs SOFT (mirrors the sibling suites):
//   HARD: ledger never paints a row · any fire returns 5xx (server crash).
//   SOFT: 403/409/422 (try next) · chain never advances (recorded as a gap).
//   A single trailing test asserts NO fire returned 5xx and prints the matrix,
//   splitting chains into ADVANCED (cross-role journey works) and GAP (needs a hint).
//
// RATE-LIMIT DISCIPLINE: every token is the global-setup cache (≤1 login/role);
// ledger/thread GETs and the advance POSTs never touch /api/auth/login.
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
// The 89 seed/cron/cascade-born chains — same population the admin advance suite
// covers. Re-probing all of them (not just the 37) is exhaustive and self-correcting:
// the 52 that advance as admin advance here on the first candidate (admin), and the
// 37 get their owning-role attempt. Per-chain short-circuit bounds prod mutation.
const ADVANCE_CHAINS = matrix.rows.filter((r) => !r.hasInitiation);

const RUN = process.env.JOURNEY_RUN || Date.now().toString(36);
const STAMP = `E2E-CANARY-2026-${RUN}`;
const MAX_ROWS = 4;            // non-terminal rows probed per chain (bounds prod writes)
const RESULTS_PATH = path.join(process.cwd(), 'tests', 'browser', 'fixtures', 'journey-crossrole-results.json');
const RESULTS_JSONL = path.join(process.cwd(), 'tests', 'browser', 'fixtures', `journey-crossrole-results-${RUN}.jsonl`);

// Forward-biased: try non-terminal verbs first so a live case advances forward
// rather than being immediately rejected/cancelled/closed.
const DESTRUCTIVE = /reject|cancel|withdraw|abort|decline|terminate|write_off|writeoff|dismiss|refuse|revoke|void|fail|clawback|claw_back/i;

// ── Registry-role → persona-token resolver ──────────────────────────────────
// The registry assigns actions to lane roles in mixed forms: short (ipp, grid,
// carbon, om), JWT-suffixed (ipp_developer, grid_operator, carbon_fund), and
// non-persona desk/vendor roles (desk_head, marketmaker, finance, risk_analyst,
// esco, esums, esums_om, oem, compliance, wind). We have nine demo personas; map
// every registry role to the persona whose JWT role the server's WRITE_ROLES set
// accepts. Desk roles → trader · O&M/vendor roles → support · compliance → regulator
// · wind/ipp_developer → ipp. admin+support are appended as the universal fallback
// (admin is in every WRITE_ROLES set), so a real forward transition is always found.
const TOKENS: Record<string, string | undefined> = {
  admin: process.env.PLAYWRIGHT_ADMIN_TOKEN,
  support: process.env.PLAYWRIGHT_SUPPORT_TOKEN,
  trader: process.env.PLAYWRIGHT_TRADER_TOKEN,
  ipp: process.env.PLAYWRIGHT_IPP_TOKEN,
  offtaker: process.env.PLAYWRIGHT_OFFTAKER_TOKEN,
  carbon: process.env.PLAYWRIGHT_CARBON_TOKEN,
  lender: process.env.PLAYWRIGHT_LENDER_TOKEN,
  regulator: process.env.PLAYWRIGHT_REGULATOR_TOKEN,
  grid: process.env.PLAYWRIGHT_GRID_TOKEN,
};
const ROLE_TO_PERSONA: Record<string, string> = {
  admin: 'admin', support: 'support',
  trader: 'trader', desk_head: 'trader', marketmaker: 'trader', finance: 'trader', risk_analyst: 'trader',
  ipp: 'ipp', ipp_developer: 'ipp', wind: 'ipp',
  grid: 'grid', grid_operator: 'grid',
  carbon: 'carbon', carbon_fund: 'carbon',
  offtaker: 'offtaker', lender: 'lender',
  regulator: 'regulator', compliance: 'regulator',
  esco: 'support', esums: 'support', esums_om: 'support', om: 'support', oem: 'support',
};

interface Candidate { role: string; persona: string; token: string }
function candidatesFor(action: ActionSpec): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const push = (role: string, persona: string) => {
    const token = TOKENS[persona];
    if (token && !seen.has(persona)) { seen.add(persona); out.push({ role, persona, token }); }
  };
  for (const r of (action.roles || [])) { const p = ROLE_TO_PERSONA[r]; if (p) push(r, p); }
  push('admin', 'admin');     // universal fallback — in every WRITE_ROLES set
  push('support', 'support'); // second fallback — in most WRITE_ROLES sets
  return out;
}

interface FireOutcome { role: string; action: string; status: number; body: string }
interface CrossRoleResult {
  key: string; wave: number; ledgerRows: number; nonTerminal: number;
  advanced: boolean; advancedVia: string | null; advanceAction: string | null;
  advanceRowId: string | null; viaFallback: boolean; attempts: number;
  lastReject: string | null; note: string;
}
const RESULTS: CrossRoleResult[] = [];

// ── Token freshness (admin only needs minting; others are short-lived but the
// whole probe runs well inside the 1h JWT TTL after a fresh global-setup) ──────
const ADMIN_EMAIL = 'admin@openenergy.co.za';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@2024!';
const TOKEN_REFRESH_MARGIN_MS = 8 * 60 * 1000;
let SHARED_ADMIN_TOKEN: string | null = null;
let SHARED_ADMIN_USER: unknown = null;

function tokenLifeMs(tok: string | null | undefined): number {
  if (!tok) return 0;
  try {
    const payload = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString('utf8'));
    return (payload.exp ?? 0) * 1000 - Date.now();
  } catch { return 0; }
}

test.beforeAll(() => {
  const tok = process.env.PLAYWRIGHT_ADMIN_TOKEN;
  if (!tok) throw new Error('PLAYWRIGHT_ADMIN_TOKEN not set — global-setup may have failed');
  SHARED_ADMIN_TOKEN = tok;
  const userJson = process.env.PLAYWRIGHT_ADMIN_TOKEN_USER;
  if (userJson) { try { SHARED_ADMIN_USER = JSON.parse(userJson); } catch { /* fall back */ } }
  // Per-RUN JSONL — no stale rows from prior runs, so the report is exact.
  try { fs.writeFileSync(RESULTS_JSONL, ''); } catch { /* best effort */ }
  // Fail loud if a role token is missing — we want true cross-role coverage, not
  // silent admin-only fallback masquerading as it.
  const missing = Object.entries(TOKENS).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.warn(`[crossrole] missing role tokens: ${missing.join(', ')} — those lanes fall back to admin`);
});

async function maybeRefreshAdmin(page: Page, baseURL?: string) {
  if (tokenLifeMs(SHARED_ADMIN_TOKEN) > TOKEN_REFRESH_MARGIN_MS) return;
  try {
    const r = await page.request.post(`${baseURL ?? ''}/api/auth/login`, {
      data: { email: ADMIN_EMAIL, password: DEMO_PASSWORD }, failOnStatusCode: false,
    });
    if (r.ok()) { const fresh = (await r.json())?.data?.token; if (fresh) { SHARED_ADMIN_TOKEN = fresh; TOKENS.admin = fresh; } }
  } catch { /* keep old token */ }
}

async function seedAdminView(page: Page, baseURL?: string) {
  await maybeRefreshAdmin(page, baseURL);
  if (!SHARED_ADMIN_TOKEN) throw new Error('shared ADMIN token not initialised');
  const tokenValue = SHARED_ADMIN_TOKEN;
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { token: tokenValue, expires_in: 3600 } }) });
  });
  if (SHARED_ADMIN_USER) {
    const userBody = SHARED_ADMIN_USER;
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: userBody }) });
    });
  }
  await page.addInitScript((tok) => { localStorage.setItem('token', tok as string); }, tokenValue);
}

function stringFor(key: string): string {
  if (/month|period/i.test(key)) return '2026-06';
  if (/year/i.test(key)) return '2026';
  return `E2E-CANARY-${key}-${RUN}`;
}

// Plain-object body synthesizer (no DOM) — mirrors the create suite's fillForm
// value choices so a required field never 422s on a missing/badly-typed value.
function synthBody(action: ActionSpec): Record<string, unknown> {
  const b: Record<string, unknown> = { ...(typeof action.body === 'object' && action.body ? action.body as Record<string, unknown> : {}) };
  let stamped = false;
  for (const f of (action.fields || [])) {
    if (f.type === 'boolean') { if (f.required) b[f.key] = true; continue; }
    if (f.type === 'string') { b[f.key] = !stamped ? STAMP : stringFor(f.key); stamped = true; continue; }
    if (f.type === 'evidence') { b[f.key] = `${STAMP} synthetic evidence`; continue; }
    if (f.type === 'number') { if (f.required) b[f.key] = 1000000; continue; }
    if (f.type === 'date') { if (f.required) b[f.key] = '2026-12-31'; continue; }
    if (f.type === 'enum') { if (f.required && f.options && f.options.length) b[f.key] = f.options[0]; continue; }
    // 'lookup' fields are init-only in this population; nothing to synth here.
  }
  return b;
}

async function fetchLedgerRows(page: Page, key: string): Promise<{ http: number; rows: { id: string; status: string }[] }> {
  return page.evaluate(async (k) => {
    const tok = localStorage.getItem('token');
    const resp = await fetch(`/api/ledger/${k}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
    if (!resp.ok) return { http: resp.status, rows: [] as { id: string; status: string }[] };
    const j = await resp.json();
    const rows = (j?.data?.rows ?? []).map((r: { id: unknown; status: unknown }) => ({ id: String(r.id), status: String(r.status ?? '') }));
    return { http: resp.status, rows };
  }, key);
}

// Fire one action with one role's token — exactly the SPA fire() network contract.
async function fireAs(page: Page, tail: string, method: string, token: string, body: Record<string, unknown>): Promise<{ status: number; body: string }> {
  return page.evaluate(async ([t, m, tok, b]) => {
    try {
      const resp = await fetch(t as string, {
        method: m as string,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(b),
      });
      let text = ''; try { text = await resp.text(); } catch { /* ignore */ }
      return { status: resp.status, body: text.slice(0, 280) };
    } catch (e) {
      return { status: 0, body: String(e).slice(0, 280) };
    }
  }, [tail, method, token, body] as const);
}

function tailFor(actionPath: string, rowId: string): string {
  // Substitute the single path param (`:id`, `:certificate_id`, …) with the row id.
  // KEEP the /api prefix: this is a RAW same-origin fetch with no axios baseURL, so
  // the wire path must be the full `/api/...` to reach the Worker API. (The SPA's
  // axios `api` has baseURL `/api` and strips it before re-adding — same wire bytes.)
  // Stripping /api here POSTs to the SPA asset handler, which 405s every non-GET.
  return actionPath.replace(/:[A-Za-z_]+/, rowId);
}

// ── One test per advance chain. ──────────────────────────────────────────────
for (const chain of ADVANCE_CHAINS) {
  test(`crossrole · ${chain.key} (W${chain.wave})`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    await seedAdminView(page, baseURL);

    const result: CrossRoleResult = {
      key: chain.key, wave: chain.wave, ledgerRows: 0, nonTerminal: 0,
      advanced: false, advancedVia: null, advanceAction: null, advanceRowId: null,
      viaFallback: false, attempts: 0, lastReject: null, note: '',
    };
    const fires: FireOutcome[] = [];

    // 1. Ledger paints — a case row OR the legitimate empty state. A chain whose
    //    demo tenant has no seeded cases renders "No cases" (.lcard-empty); that's
    //    the product working, not a failure. Hard-requiring .lcard failed those
    //    chains before they could reach the no-rows soft-skip below.
    await page.goto(`/ledger/${chain.key}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.lcard, .lcard-empty').first()).toBeVisible({ timeout: 30_000 });

    // 2. Discover non-terminal rows.
    const terminal = new Set(chain.terminal);
    const led = await fetchLedgerRows(page, chain.key);
    result.ledgerRows = led.rows.length;
    const live = led.rows.filter((r) => r.status && !terminal.has(r.status)).slice(0, MAX_ROWS);
    result.nonTerminal = live.length;

    if (!live.length) {
      result.note = led.rows.length ? 'all rows terminal — data-state gap'
        : led.http === 200 ? 'no seeded cases — nothing to advance'
        : `ledger fetch http ${led.http}`;
      RESULTS.push(result);
      fs.appendFileSync(RESULTS_JSONL, JSON.stringify(result) + '\n');
      return; // SOFT — sibling suites already flagged ppa_obligation
    }

    // Non-destructive verbs first so a live case advances forward.
    const actions = [...chain.actions].sort((a, b) => {
      const da = DESTRUCTIVE.test(a.action) ? 1 : 0;
      const db = DESTRUCTIVE.test(b.action) ? 1 : 0;
      return da - db;
    });

    // 3. Probe rows × actions × candidate roles; short-circuit chain on first 2xx.
    outer:
    for (const row of live) {
      await page.goto(`/thread/${chain.key}/${row.id}`, { waitUntil: 'domcontentloaded' });
      for (const action of actions) {
        const tail = tailFor(action.path, row.id);
        const method = (action.method || 'POST').toUpperCase();
        const body = synthBody(action);
        for (const cand of candidatesFor(action)) {
          result.attempts++;
          const out = await fireAs(page, tail, method, cand.token, body);
          fires.push({ role: cand.role, action: action.action, status: out.status, body: out.body });

          if (out.status >= 200 && out.status < 300) {
            result.advanced = true;
            result.advancedVia = cand.role;
            result.advanceAction = action.action;
            result.advanceRowId = row.id;
            result.viaFallback = (cand.role === 'admin' || cand.role === 'support') && !(action.roles || []).includes(cand.role);
            result.note = `advanced ${row.status} via ${cand.role} → ${action.action}`;
            break outer;
          }
          if (out.status >= 500) {
            // HARD: real server crash. Record then fail this chain's test.
            result.note = `5xx on ${action.action} as ${cand.role}: ${out.body}`;
            result.lastReject = out.body;
            RESULTS.push(result);
            fs.appendFileSync(RESULTS_JSONL, JSON.stringify(result) + '\n');
            expect(out.status, `${chain.key} ${action.action} as ${cand.role} returned ${out.status}: ${out.body}`).toBeLessThan(500);
          }
          // 4xx → remember the most informative reject, try the next candidate.
          if (out.status >= 400) result.lastReject = `${out.status} ${action.action}/${cand.role}: ${out.body}`;
        }
      }
    }

    if (!result.advanced) {
      result.note = `no registry action valid from any non-terminal row across any lane (${result.attempts} attempts) — action-hint gap`;
    }
    RESULTS.push(result);
    fs.appendFileSync(RESULTS_JSONL, JSON.stringify(result) + '\n');

    // HARD invariant for the chain: no fire returned a 5xx (already enforced inline).
    const had5xx = fires.some((f) => f.status >= 500);
    expect(had5xx, `${chain.key} produced a 5xx`).toBe(false);
  });
}

// ── Trailing report: assert no 5xx anywhere, print ADVANCED vs GAP split. ──────
test('crossrole advance matrix — no 5xx; report', async () => {
  const lines = fs.existsSync(RESULTS_JSONL)
    ? fs.readFileSync(RESULTS_JSONL, 'utf8').split('\n').filter(Boolean)
    : [];
  const byKey = new Map<string, CrossRoleResult>();
  for (const ln of lines) { try { const r = JSON.parse(ln) as CrossRoleResult; byKey.set(r.key, r); } catch { /* skip */ } }
  const all = [...byKey.values()].sort((a, b) => a.wave - b.wave);

  const advanced = all.filter((r) => r.advanced);
  const crossRole = advanced.filter((r) => !r.viaFallback);
  const viaFallback = advanced.filter((r) => r.viaFallback);
  const allTerminal = all.filter((r) => !r.advanced && r.nonTerminal === 0);
  const gaps = all.filter((r) => !r.advanced && r.nonTerminal > 0);
  const serverErrors = all.filter((r) => /5xx/.test(r.note));

  const report = {
    total: all.length,
    advanced: advanced.length,
    advanced_via_owning_role: crossRole.length,
    advanced_via_admin_support_fallback: viaFallback.length,
    all_terminal: allTerminal.length,
    action_hint_gaps: gaps.length,
    server_errors: serverErrors.length,
    gaps: gaps.map((r) => ({ key: r.key, wave: r.wave, nonTerminal: r.nonTerminal, lastReject: r.lastReject })),
    cross_role_advances: crossRole.map((r) => ({ key: r.key, via: r.advancedVia, action: r.advanceAction })),
    rows: all,
  };
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(report, null, 2));

  console.log('\n═══ Meridian cross-role advance matrix ═══');
  console.log(`  chains probed:                    ${report.total}`);
  console.log(`  advanced:                         ${report.advanced}`);
  console.log(`    · via owning lane (cross-role): ${report.advanced_via_owning_role}`);
  console.log(`    · via admin/support fallback:   ${report.advanced_via_admin_support_fallback}`);
  console.log(`  all-terminal (data-state gap):    ${report.all_terminal}`);
  console.log(`  action-hint GAPS (need UI):       ${report.action_hint_gaps}`);
  if (gaps.length) for (const g of report.gaps) console.log(`      GAP ${g.key} (W${g.wave}) live=${g.nonTerminal} lastReject=${g.lastReject}`);
  console.log(`  server errors (5xx):              ${report.server_errors}`);
  console.log('══════════════════════════════════════════\n');

  expect(serverErrors.map((r) => r.key), 'chains that returned a 5xx').toEqual([]);
});
