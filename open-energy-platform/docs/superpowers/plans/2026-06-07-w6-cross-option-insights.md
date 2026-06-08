# W6 — CrossOptionModal + /modules + AI Insight Cards + Per-Feature InsightsPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the ecosystem-rebuild W6 layer — a per-chain analytics read API off the W4 rollup tables, a per-tab `InsightsPanel` (with inline AI insight cards) on every workstation, a dedicated `CrossOptionModal` bottom sheet for cross-role next steps, and a `/modules` discovery page — all additive, zero changes to chain/spec files.

**Architecture:** Layer D already appends every `PlatformEvent` to `oe_platform_events` (`analytics-sink.ts`) and the nightly cron rolls it into `oe_metrics_daily` + `oe_chain_metrics` (`metrics-rollup.ts`). W6 adds (1) a shared `chain-state.ts` helper that derives open/terminal counts from the event log's `source_chain_status` (closing the W4-deferred `open_count`/`terminal_count`), (2) a read-only `/api/insights` route that serves per-chain throughput/value/SLA/bottleneck stats and deterministic AI insight cards off the rollups only (cheap at national scale), and (3) SPA surfaces: `InsightsPanel` mounted in the existing `WorkstationShell` right rail keyed off a new optional `WorkstationTab.chainKey`, a `CrossOptionModal` replacing the inline cross-option `WizardShell`, and a `/modules` page fed by the existing `/api/modules` catalogue.

**Tech Stack:** Cloudflare Worker + Hono + D1 (SQLite, `better-sqlite3` in tests) backend; React + Vite + axios + Tailwind + lucide-react SPA. Backend tasks are TDD with vitest (`createTestDb`/`envFor` harness). The SPA has **no unit-test runner** — frontend tasks are verified by `npm run check:pages` (tsc --noEmit) and `cd pages && npm run build`.

**What must NOT change:** any `*-chain.ts`, any `*-spec.ts`, migrations 001–481, `wrangler.toml`, auth/tenant/locks, OrderBook DO, matching, the existing test suite. `fireCascade` signature is additive-only. No new migration is needed for W6 (the rollup tables already exist from migration 479).

**Branch:** `feat/ecosystem-foundation` (already checked out). Commit messages end with:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## File Structure

**Backend (new):**
- `src/utils/chain-state.ts` — terminal-status heuristic + `computeOpenTerminal(db, chainKey)` (event-log derived).
- `src/routes/insights.ts` — `GET /api/insights/chain/:chainKey`, `GET /api/insights/chain/:chainKey/ai`.

**Backend (modified):**
- `src/utils/metrics-rollup.ts` — fill `open_count`/`terminal_count` via `computeOpenTerminal` (closes W4-deferred item).
- `src/index.ts` — mount the insights route (one import + one `app.route`).

**Frontend (new):**
- `pages/src/lib/insights.ts` — SPA client for `/api/insights`.
- `pages/src/components/launch/InsightsPanel.tsx` — per-chain insight rail + inline AI cards.
- `pages/src/components/launch/CrossOptionModal.tsx` — post-action bottom sheet.
- `pages/src/components/pages/ModulesPage.tsx` — `/modules` discovery grid.

**Frontend (modified):**
- `pages/src/components/launch/WorkstationShell.tsx` — add `WorkstationTab.chainKey`; render `InsightsPanel` for the active tab; replace inline cross-option `WizardShell` with `CrossOptionModal`.
- The 10 workstation pages (`pages/src/components/pages/*WorkstationPage.tsx` + `EsumsOmPage.tsx`) — add `chainKey` to chain-backed tabs.
- `pages/src/App.tsx` — register the `/modules` route.

**Tests (new):**
- `tests/chain-state.test.ts`
- `tests/metrics-rollup-open-terminal.test.ts`
- `tests/insights-api.test.ts`

---

## Task 1: `chain-state.ts` — open/terminal derivation from the event log

**Files:**
- Create: `src/utils/chain-state.ts`
- Test: `tests/chain-state.test.ts`

**Context:** `oe_chain_metrics.open_count` / `terminal_count` were left 0 in W4 (see the header comment in `src/utils/metrics-rollup.ts`). Rather than coupling to ~80 live chain tables, we derive them from the append-only `oe_platform_events` log: for each `entity_id` under a `chain_key`, take its latest `source_chain_status` and bucket it open vs terminal via a token heuristic. This is the "zero per-chain code" approach the blueprint mandates (insights from "event stream + state metadata").

- [ ] **Step 1: Write the failing test**

Create `tests/chain-state.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';
import { isTerminalStatus, computeOpenTerminal } from '../src/utils/chain-state';

let db: Database.Database;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

function ev(id: string, chainKey: string, entityId: string, status: string, at: string) {
  db.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, source_chain_status, occurred_at)
     VALUES (?, 'x.transition', ?, 'demo', ?, ?, ?)`,
  ).run(id, chainKey, entityId, status, at);
}

describe('isTerminalStatus', () => {
  it('treats settled/closed/rejected/withdrawn/cancelled/expired/retired as terminal', () => {
    for (const s of ['settled', 'closed', 'rejected', 'withdrawn', 'cancelled', 'expired', 'retired', 'written_off']) {
      expect(isTerminalStatus(s)).toBe(true);
    }
  });
  it('treats in-flight statuses as non-terminal', () => {
    for (const s of ['under_review', 'submitted', 'active', 'in_progress', 'pending']) {
      expect(isTerminalStatus(s)).toBe(false);
    }
  });
  it('is null-safe (unknown/empty status is open, not terminal)', () => {
    expect(isTerminalStatus(null)).toBe(false);
    expect(isTerminalStatus('')).toBe(false);
  });
});

describe('computeOpenTerminal', () => {
  it('buckets each entity by its latest status for the chain', async () => {
    // entity A: submitted -> settled (terminal)
    ev('e1', 'ppa_contract', 'A', 'submitted', '2026-06-01T00:00:00Z');
    ev('e2', 'ppa_contract', 'A', 'settled',   '2026-06-02T00:00:00Z');
    // entity B: under_review (open)
    ev('e3', 'ppa_contract', 'B', 'under_review', '2026-06-01T00:00:00Z');
    // entity C: rejected (terminal)
    ev('e4', 'ppa_contract', 'C', 'rejected', '2026-06-01T00:00:00Z');
    // different chain — must be ignored
    ev('e5', 'drawdown', 'D', 'active', '2026-06-01T00:00:00Z');

    const r = await computeOpenTerminal(db as any, 'ppa_contract');
    expect(r.open_count).toBe(1);     // B
    expect(r.terminal_count).toBe(2); // A, C
  });

  it('returns zeros for an unknown chain', async () => {
    const r = await computeOpenTerminal(db as any, 'nope');
    expect(r).toEqual({ open_count: 0, terminal_count: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/chain-state.test.ts`
Expected: FAIL — `Cannot find module '../src/utils/chain-state'`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/chain-state.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer D — chain-state derivation.
// open_count / terminal_count for a chain are derived from the append-only
// oe_platform_events log, NOT from the ~80 live chain tables: for each entity
// under a chain_key we take its latest source_chain_status and bucket it open
// vs terminal via a token heuristic. Zero per-chain code — a new chain appears
// automatically the moment it emits its first PlatformEvent with a chain_key.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoEnv } from './types';

type DB = HonoEnv['Bindings']['DB'];

// Substrings that mark a P6 terminal state across the platform's chains.
// Matching is case-insensitive and substring-based so e.g. 'claim_paid',
// 'force_closed', 'auto_expired', 'write_off' all resolve to terminal.
const TERMINAL_TOKENS = [
  'settled', 'closed', 'reject', 'withdraw', 'cancel', 'expire', 'retire',
  'written_off', 'write_off', 'writeoff', 'paid', 'granted', 'refused',
  'terminated', 'completed', 'archived', 'decommissioned', 'lapsed',
  'cleared', 'dismissed', 'resolved', 'void', 'abandoned',
] as const;

/** True when `status` names a P6 terminal state. Null/empty → open (false). */
export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return TERMINAL_TOKENS.some((t) => s.includes(t));
}

export interface OpenTerminal {
  open_count: number;
  terminal_count: number;
}

/**
 * Count in-flight (open) vs terminal entities for a chain by reading the
 * latest event per entity_id from oe_platform_events. Bounded per chain_key.
 */
export async function computeOpenTerminal(db: DB, chainKey: string): Promise<OpenTerminal> {
  const res = await db.prepare(
    `WITH latest AS (
       SELECT entity_id, source_chain_status,
              ROW_NUMBER() OVER (
                PARTITION BY entity_id ORDER BY occurred_at DESC, id DESC
              ) AS rn
         FROM oe_platform_events
        WHERE COALESCE(NULLIF(chain_key, ''), 'unattributed') = ?
     )
     SELECT source_chain_status AS status, COUNT(*) AS c
       FROM latest WHERE rn = 1 GROUP BY source_chain_status`,
  ).bind(chainKey).all<{ status: string | null; c: number }>();

  let open = 0;
  let terminal = 0;
  for (const row of (res.results ?? [])) {
    if (isTerminalStatus(row.status)) terminal += Number(row.c) || 0;
    else open += Number(row.c) || 0;
  }
  return { open_count: open, terminal_count: terminal };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/chain-state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/chain-state.ts tests/chain-state.test.ts
git commit -m "feat(W6): chain-state — derive open/terminal counts from event log

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Fill `open_count`/`terminal_count` in the metrics rollup

**Files:**
- Modify: `src/utils/metrics-rollup.ts`
- Test: `tests/metrics-rollup-open-terminal.test.ts`

**Context:** Closes the W4-deferred item. The nightly rollup currently inserts `open_count, terminal_count` as `0`. Use `computeOpenTerminal` so the snapshot carries real counts.

- [ ] **Step 1: Write the failing test**

Create `tests/metrics-rollup-open-terminal.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { rollupMetrics } from '../src/utils/metrics-rollup';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function ev(id: string, chainKey: string, entityId: string, status: string, at: string) {
  db.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, source_chain_status, entity_value, occurred_at)
     VALUES (?, 'x.transition', ?, 'demo', ?, ?, 100, ?)`,
  ).run(id, chainKey, entityId, status, at);
}

describe('rollupMetrics — open/terminal snapshot', () => {
  it('writes real open_count and terminal_count to oe_chain_metrics', async () => {
    ev('e1', 'ppa_contract', 'A', 'submitted',    '2026-06-06T01:00:00Z');
    ev('e2', 'ppa_contract', 'A', 'settled',      '2026-06-06T02:00:00Z'); // A terminal
    ev('e3', 'ppa_contract', 'B', 'under_review', '2026-06-06T01:00:00Z'); // B open

    await rollupMetrics(env, '2026-06-06');

    const row = db.prepare(
      `SELECT open_count, terminal_count FROM oe_chain_metrics WHERE chain_key = 'ppa_contract'`,
    ).get() as { open_count: number; terminal_count: number };
    expect(row.open_count).toBe(1);
    expect(row.terminal_count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/metrics-rollup-open-terminal.test.ts`
Expected: FAIL — `open_count` is 0, not 1.

- [ ] **Step 3: Edit `src/utils/metrics-rollup.ts`**

Add the import at the top (after the existing `import type { HonoEnv } from './types';`):

```typescript
import { computeOpenTerminal } from './chain-state';
```

Replace the snapshot loop (the `for (const ck of chainKeys) { ... }` block that builds `snapStmts`) with one that also computes open/terminal. The new block:

```typescript
  const chainKeys = rows.map((r) => r.chain_key);
  const now = new Date().toISOString();
  const snapStmts = [];
  for (const ck of chainKeys) {
    const cum = await db.prepare(
      `SELECT COALESCE(SUM(value_total_zar), 0) AS value_total_zar,
              COALESCE(SUM(sla_breaches), 0) AS breach_count
         FROM oe_metrics_daily WHERE chain_key = ?`,
    ).bind(ck).first<any>();
    const last = await db.prepare(
      `SELECT MAX(occurred_at) AS last_event_at FROM oe_platform_events
        WHERE COALESCE(NULLIF(chain_key, ''), 'unattributed') = ?`,
    ).bind(ck).first<any>();
    const ot = await computeOpenTerminal(db, ck);
    snapStmts.push(
      db.prepare(
        `INSERT INTO oe_chain_metrics
           (chain_key, open_count, terminal_count, breach_count, value_total_zar, last_event_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chain_key) DO UPDATE SET
           open_count = excluded.open_count,
           terminal_count = excluded.terminal_count,
           breach_count = excluded.breach_count,
           value_total_zar = excluded.value_total_zar,
           last_event_at = excluded.last_event_at,
           updated_at = excluded.updated_at`,
      ).bind(
        ck, ot.open_count, ot.terminal_count,
        Number(cum?.breach_count || 0), Number(cum?.value_total_zar || 0),
        last?.last_event_at ?? null, now,
      ),
    );
  }
  await db.batch(snapStmts);
```

Also update the file's header comment: change the paragraph that says open/terminal "leaves them 0" to note they are now filled via `computeOpenTerminal` (event-log derived).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/metrics-rollup-open-terminal.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing rollup test to confirm no regression**

Run: `npx vitest run tests/metrics-rollup.test.ts` (if present) and `npx vitest run tests/analytics-sink.test.ts`
Expected: PASS (or "no tests found" for the first — acceptable).

- [ ] **Step 6: Commit**

```bash
git add src/utils/metrics-rollup.ts tests/metrics-rollup-open-terminal.test.ts
git commit -m "feat(W6): fill oe_chain_metrics open/terminal counts (closes W4 defer)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `insights.ts` route — per-chain analytics + AI insight cards

**Files:**
- Create: `src/routes/insights.ts`
- Modify: `src/index.ts` (mount)
- Test: `tests/insights-api.test.ts`

**Context:** Read-only API over the W4 rollup tables (`oe_metrics_daily`, `oe_chain_metrics`) plus a live open/terminal read via `computeOpenTerminal`. Two endpoints: chain stats, and deterministic AI insight cards (rule-based deltas, no LLM, so they are testable — mirrors `buildTraderAiSuggestions` in `launch.ts`). Auth via `authMiddleware`, identical mount style to `role-actions.ts`.

The AI-card shape matches the SPA `AiSuggestion` type (`LaunchBoardShell.tsx:43`): `{ key, title, why, confidence?, accept?: { label, href? } }`.

- [ ] **Step 1: Write the failing test**

Create `tests/insights-api.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import insights from '../src/routes/insights';

let db: Database.Database;
let env: any;

type RouteEntry = { method: string; path: string };
function has(app: Hono<any>, method: string, path: string): boolean {
  const rs = (app as unknown as { routes: RouteEntry[] }).routes;
  return rs.some(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);
}

async function token() {
  return signToken({ sub: 'par_trader', role: 'trader', email: 't@openenergy.co.za' } as any, 'test-secret');
}

function daily(date: string, chainKey: string, events: number, value: number, breaches: number, crossings: number) {
  db.prepare(
    `INSERT INTO oe_metrics_daily
       (id, metric_date, chain_key, events_count, value_total_zar, sla_breaches, regulator_crossings)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(`md_${date}_${chainKey}`, date, chainKey, events, value, breaches, crossings);
}
function ev(id: string, chainKey: string, entityId: string, status: string, at: string) {
  db.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, source_chain_status, occurred_at)
     VALUES (?, 'x.transition', ?, 'demo', ?, ?, ?)`,
  ).run(id, chainKey, entityId, status, at);
}

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

describe('insights API — mount', () => {
  it('mounts chain + ai routes', () => {
    expect(has(insights, 'GET', '/chain/:chainKey')).toBe(true);
    expect(has(insights, 'GET', '/chain/:chainKey/ai')).toBe(true);
  });
});

describe('insights API — chain stats', () => {
  it('returns snapshot, throughput series and 30d totals', async () => {
    daily('2026-06-05', 'ppa_contract', 4, 1000, 1, 0);
    daily('2026-06-06', 'ppa_contract', 6, 2000, 0, 1);
    ev('e1', 'ppa_contract', 'A', 'under_review', '2026-06-06T01:00:00Z'); // open
    ev('e2', 'ppa_contract', 'B', 'settled',      '2026-06-06T02:00:00Z'); // terminal
    const res = await insights.request('/chain/ppa_contract', { headers: { Authorization: `Bearer ${await token()}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.data.chain_key).toBe('ppa_contract');
    expect(body.data.totals.events_30d).toBe(10);
    expect(body.data.totals.value_30d_zar).toBe(3000);
    expect(body.data.totals.breaches_30d).toBe(1);
    expect(body.data.snapshot.open_count).toBe(1);
    expect(body.data.snapshot.terminal_count).toBe(1);
    expect(body.data.throughput.length).toBe(2);
  });

  it('401s without a token', async () => {
    const res = await insights.request('/chain/ppa_contract', {}, env);
    expect(res.status).toBe(401);
  });
});

describe('insights API — AI cards', () => {
  it('emits a breach-spike card when recent breaches jump vs the prior window', async () => {
    // prior 7d window: low breaches; recent: high
    daily('2026-05-20', 'drawdown', 10, 0, 0, 0);
    daily('2026-06-06', 'drawdown', 10, 0, 5, 0);
    const res = await insights.request('/chain/drawdown/ai', { headers: { Authorization: `Bearer ${await token()}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const keys = (body.data as Array<{ key: string }>).map(c => c.key);
    expect(keys).toContain('breach_spike');
  });

  it('returns an empty array for a chain with no metrics', async () => {
    const res = await insights.request('/chain/none/ai', { headers: { Authorization: `Bearer ${await token()}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/insights-api.test.ts`
Expected: FAIL — `Cannot find module '../src/routes/insights'`.

- [ ] **Step 3: Write `src/routes/insights.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer D — per-chain Insights & Analytics HTTP surface.
// Reads ONLY the pre-aggregated rollup tables (oe_metrics_daily,
// oe_chain_metrics) plus a bounded live open/terminal read off the event log —
// never the ~80 live chain tables — so it stays cheap at national scale.
//   GET /chain/:chainKey      → snapshot + 30d throughput series + totals + bottleneck
//   GET /chain/:chainKey/ai   → deterministic AI insight cards (anomaly/trend),
//                               shaped like the SPA AiSuggestion (key/title/why/accept)
// Every authenticated role may read insights (no participant-scoped rows here —
// these are aggregate chain metrics, not tenant data).
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware } from '../middleware/auth';
import { computeOpenTerminal } from '../utils/chain-state';

const insights = new Hono<HonoEnv>();
insights.use('*', authMiddleware);

interface DailyRow {
  metric_date: string;
  events_count: number;
  value_total_zar: number;
  sla_breaches: number;
  regulator_crossings: number;
}

// Pull the last 30 calendar days of daily rollups for a chain, oldest→newest.
async function recentDaily(env: HonoEnv['Bindings'], chainKey: string): Promise<DailyRow[]> {
  const res = await env.DB.prepare(
    `SELECT metric_date, events_count, value_total_zar, sla_breaches, regulator_crossings
       FROM oe_metrics_daily
      WHERE chain_key = ?
      ORDER BY metric_date DESC
      LIMIT 30`,
  ).bind(chainKey).all<DailyRow>();
  return (res.results ?? []).slice().reverse();
}

insights.get('/chain/:chainKey', async (c) => {
  const chainKey = c.req.param('chainKey');
  const [snapRow, daily, openTerminal] = await Promise.all([
    c.env.DB.prepare(
      `SELECT chain_key, open_count, terminal_count, breach_count, value_total_zar, last_event_at
         FROM oe_chain_metrics WHERE chain_key = ?`,
    ).bind(chainKey).first<Record<string, unknown>>(),
    recentDaily(c.env, chainKey),
    computeOpenTerminal(c.env.DB, chainKey),
  ]);

  const totals = daily.reduce(
    (a, r) => ({
      events_30d: a.events_30d + Number(r.events_count || 0),
      value_30d_zar: a.value_30d_zar + Number(r.value_total_zar || 0),
      breaches_30d: a.breaches_30d + Number(r.sla_breaches || 0),
      crossings_30d: a.crossings_30d + Number(r.regulator_crossings || 0),
    }),
    { events_30d: 0, value_30d_zar: 0, breaches_30d: 0, crossings_30d: 0 },
  );

  // Snapshot prefers the live open/terminal read (always current); the cumulative
  // value/breach/last_event come from the nightly snapshot if present.
  const snapshot = {
    open_count: openTerminal.open_count,
    terminal_count: openTerminal.terminal_count,
    breach_count: Number(snapRow?.breach_count ?? 0),
    value_total_zar: Number(snapRow?.value_total_zar ?? totals.value_30d_zar),
    last_event_at: (snapRow?.last_event_at as string | null) ?? null,
  };

  // Bottleneck = the open (non-terminal) status holding the most entities right now.
  const bn = await c.env.DB.prepare(
    `WITH latest AS (
       SELECT entity_id, source_chain_status,
              ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY occurred_at DESC, id DESC) AS rn
         FROM oe_platform_events
        WHERE COALESCE(NULLIF(chain_key, ''), 'unattributed') = ?
     )
     SELECT source_chain_status AS status, COUNT(*) AS c
       FROM latest WHERE rn = 1 AND source_chain_status IS NOT NULL
      GROUP BY source_chain_status ORDER BY c DESC LIMIT 1`,
  ).bind(chainKey).first<{ status: string; c: number }>();

  return c.json({
    success: true,
    data: {
      chain_key: chainKey,
      snapshot,
      throughput: daily.map((r) => ({
        date: r.metric_date,
        events: Number(r.events_count || 0),
        value_zar: Number(r.value_total_zar || 0),
        sla_breaches: Number(r.sla_breaches || 0),
        regulator_crossings: Number(r.regulator_crossings || 0),
      })),
      totals,
      bottleneck: bn?.status ? { status: bn.status, open_entities: Number(bn.c || 0) } : null,
    },
  });
});

interface AiCard {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string };
}

insights.get('/chain/:chainKey/ai', async (c) => {
  const chainKey = c.req.param('chainKey');
  const daily = await recentDaily(c.env, chainKey);
  const cards: AiCard[] = [];
  if (daily.length === 0) return c.json({ success: true, data: cards });

  // Split into recent 7d vs prior 7d for delta-based anomaly cards.
  const recent = daily.slice(-7);
  const prior = daily.slice(-14, -7);
  const sum = (rows: DailyRow[], k: keyof DailyRow) =>
    rows.reduce((s, r) => s + Number(r[k] || 0), 0);

  const recentBreaches = sum(recent, 'sla_breaches');
  const priorBreaches = sum(prior, 'sla_breaches');
  if (recentBreaches >= 3 && recentBreaches > priorBreaches) {
    const pct = priorBreaches > 0 ? Math.round(((recentBreaches - priorBreaches) / priorBreaches) * 100) : 100;
    cards.push({
      key: 'breach_spike',
      title: `SLA breaches up ${pct}% week-over-week`,
      why: `${recentBreaches} breaches in the last 7 days vs ${priorBreaches} the week before. Review the slowest stage and re-assign or escalate before the trend compounds.`,
      confidence: 0.7,
      accept: { label: 'Review breaches', href: `/insights?chain=${encodeURIComponent(chainKey)}` },
    });
  }

  const recentCrossings = sum(recent, 'regulator_crossings');
  if (recentCrossings >= 3) {
    cards.push({
      key: 'regulator_attention',
      title: `${recentCrossings} regulator crossings this week`,
      why: `Several transitions on this chain crossed to the regulator in the last 7 days. Confirm the evidence pack is complete to avoid an enforcement escalation.`,
      confidence: 0.65,
    });
  }

  const recentValue = sum(recent, 'value_total_zar');
  const priorValue = sum(prior, 'value_total_zar');
  if (priorValue > 0 && recentValue < priorValue * 0.5 && recentValue >= 0) {
    cards.push({
      key: 'throughput_drop',
      title: 'Value processed dropped sharply',
      why: `R${Math.round(recentValue).toLocaleString()} flowed through this chain in the last 7 days vs R${Math.round(priorValue).toLocaleString()} the prior week. Check for a stuck stage or a stalled counterparty.`,
      confidence: 0.6,
    });
  }

  return c.json({ success: true, data: cards });
});

export default insights;
```

- [ ] **Step 4: Mount the route in `src/index.ts`**

Add the import alongside the other route imports (near line 63 where `roleActionsRoutes` is imported):

```typescript
import insightsRoutes from './routes/insights';
```

Add the mount alongside the other `app.route` calls (near line 542 where `/api/role-actions` is mounted):

```typescript
app.route('/api/insights', insightsRoutes);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/insights-api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Type-check the backend**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/insights.ts src/index.ts tests/insights-api.test.ts
git commit -m "feat(W6): /api/insights — per-chain analytics + AI insight cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: SPA insights client

**Files:**
- Create: `pages/src/lib/insights.ts`

**Context:** Follows the `pages/src/lib/roleActions.ts` pattern exactly — import the shared axios `api` (baseURL `/api`), define types, export async fetchers. No test runner; verified by type-check.

- [ ] **Step 1: Write `pages/src/lib/insights.ts`**

```typescript
// SPA client for the Layer-D per-chain insights API (/api/insights).
// Reuses the shared axios instance in ./api.ts (baseURL '/api').
import { api } from './api';

export interface ChainSnapshot {
  open_count: number;
  terminal_count: number;
  breach_count: number;
  value_total_zar: number;
  last_event_at: string | null;
}

export interface ThroughputPoint {
  date: string;
  events: number;
  value_zar: number;
  sla_breaches: number;
  regulator_crossings: number;
}

export interface ChainInsights {
  chain_key: string;
  snapshot: ChainSnapshot;
  throughput: ThroughputPoint[];
  totals: { events_30d: number; value_30d_zar: number; breaches_30d: number; crossings_30d: number };
  bottleneck: { status: string; open_entities: number } | null;
}

export interface InsightAiCard {
  key: string;
  title: string;
  why: string;
  confidence?: number;
  accept?: { label: string; href?: string };
}

/** Per-chain rollup stats for the InsightsPanel. */
export async function getChainInsights(chainKey: string): Promise<ChainInsights> {
  const res = await api.get<{ data: ChainInsights }>(`/insights/chain/${encodeURIComponent(chainKey)}`);
  return res.data.data;
}

/** Deterministic AI insight cards for a chain. */
export async function getChainAiInsights(chainKey: string): Promise<InsightAiCard[]> {
  const res = await api.get<{ data: InsightAiCard[] }>(`/insights/chain/${encodeURIComponent(chainKey)}/ai`);
  return res.data.data ?? [];
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:pages`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/src/lib/insights.ts
git commit -m "feat(W6): SPA insights API client

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `InsightsPanel` component

**Files:**
- Create: `pages/src/components/launch/InsightsPanel.tsx`

**Context:** A right-rail panel keyed by `chainKey`. Renders the snapshot KPIs, a tiny throughput sparkline (inline SVG, no charting dep), the bottleneck, and inline AI insight cards (amber card matching the existing `AiSuggestionCard` look in `LaunchBoardShell.tsx` but self-contained). Matches the visual language of `IncomingPanel.tsx` (same widths, borders, type sizes). Navigation uses `react-router-dom`'s `useNavigate` (already a dependency — see `WorkstationShell.tsx`).

- [ ] **Step 1: Write `pages/src/components/launch/InsightsPanel.tsx`**

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Lightbulb, RefreshCw } from 'lucide-react';
import {
  getChainInsights, getChainAiInsights,
  type ChainInsights, type InsightAiCard,
} from '../../lib/insights';

export interface InsightsPanelProps {
  chainKey: string;
  /** Human label for the chain/feature (defaults to the key). */
  label?: string;
  className?: string;
}

function zar(n: number): string {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `R${(n / 1_000).toFixed(0)}k`;
  return `R${Math.round(n)}`;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const w = 120, h = 28;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-[#1a3a5c]">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function InsightsPanel({ chainKey, label, className }: InsightsPanelProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<ChainInsights | null>(null);
  const [cards, setCards] = useState<InsightAiCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [d, c] = await Promise.all([getChainInsights(chainKey), getChainAiInsights(chainKey)]);
      setData(d); setCards(c);
    } catch {
      setError('Insights unavailable.');
    } finally {
      setLoading(false);
    }
  }, [chainKey]);

  useEffect(() => { void load(); }, [load]);

  const empty = !loading && !error && data && data.totals.events_30d === 0 && data.snapshot.open_count === 0;

  return (
    <section className={`rounded-xl bg-white border border-[#dde4ec] ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#eef2f7]">
        <div className="flex items-center gap-2 text-[#0f1c2e]">
          <BarChart3 className="h-4 w-4 text-[#1a3a5c]" aria-hidden />
          <h2 className="text-[13px] font-display font-semibold">Insights</h2>
          {label && <span className="text-[11px] text-[#6b7685] truncate max-w-[8rem]">{label}</span>}
        </div>
        <button
          type="button" onClick={() => void load()}
          className="rounded-md p-1.5 text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]"
          aria-label="Refresh insights"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      <div className="p-3 space-y-3">
        {error && <p className="text-[11px] text-rose-600 px-1">{error}</p>}
        {empty && <p className="text-[11px] text-[#6b7685] px-1 py-4 text-center">No activity on this chain yet.</p>}

        {data && !empty && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Open" value={data.snapshot.open_count} />
              <Kpi label="Closed" value={data.snapshot.terminal_count} />
              <Kpi label="Breaches 30d" value={data.totals.breaches_30d} tone={data.totals.breaches_30d > 0 ? 'warn' : undefined} />
              <Kpi label="Value 30d" value={zar(data.totals.value_30d_zar)} />
            </div>

            {data.throughput.length > 1 && (
              <div className="rounded-lg bg-[#f8fafc] border border-[#e5ebf2] p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#6b7685] mb-1">Events / day (30d)</p>
                <Sparkline points={data.throughput.map((p) => p.events)} />
              </div>
            )}

            {data.bottleneck && (
              <p className="text-[11px] text-[#3d4756] px-1">
                Bottleneck:{' '}
                <span className="font-medium text-[#0f1c2e]">{data.bottleneck.status.replaceAll('_', ' ')}</span>{' '}
                ({data.bottleneck.open_entities} waiting)
              </p>
            )}
          </>
        )}

        {cards.map((card) => (
          <article key={card.key} className="rounded-lg border border-amber-200 bg-gradient-to-br from-[#fffdf3] to-[#fff7e3] p-3">
            <div className="flex items-start gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[#0f1c2e] leading-snug">{card.title}</p>
                <p className="mt-1 text-[11px] text-[#6b7685] leading-snug">{card.why}</p>
                {card.accept?.href && (
                  <button
                    type="button" onClick={() => navigate(card.accept!.href!)}
                    className="mt-2 rounded-md bg-[#1a3a5c] hover:bg-[#16314e] text-white text-[11px] font-semibold px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]"
                  >
                    {card.accept.label}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' }) {
  return (
    <div className="rounded-lg bg-[#f8fafc] border border-[#e5ebf2] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#6b7685]">{label}</p>
      <p className={`text-[15px] font-semibold ${tone === 'warn' ? 'text-amber-600' : 'text-[#0f1c2e]'}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:pages`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/src/components/launch/InsightsPanel.tsx
git commit -m "feat(W6): InsightsPanel — per-chain stats + inline AI cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `CrossOptionModal` bottom sheet

**Files:**
- Create: `pages/src/components/launch/CrossOptionModal.tsx`

**Context:** Today `WorkstationShell.tsx` (lines 241–276) handles a cross-role action by opening a generic 2-step `WizardShell`. W6 replaces that with a purpose-built bottom sheet that shows the action title, the source chain, and the cross-impact, then offers "Do it now" (calls `actOnRoleAction(id,'action')` and navigates to `cross_option.target_route`, carrying `prefill` as query params) or "Later" (closes, leaves the row pending). It is rendered as a bottom sheet (slides from the bottom on mobile, centered card on desktop) per the blueprint's "post-action CrossOptionModal bottom sheet".

The `RoleAction` + `CrossOption` types come from `pages/src/lib/roleActions.ts` (already defined: `cross_option: { action_label, target_route, prefill? }`).

- [ ] **Step 1: Write `pages/src/components/launch/CrossOptionModal.tsx`**

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { actOnRoleAction, type RoleAction } from '../../lib/roleActions';

export interface CrossOptionModalProps {
  /** The action whose cross_option drives the next step; null hides the sheet. */
  action: RoleAction | null;
  onClose: () => void;
  /** Called after the action is marked actioned, so the host can refresh its inbox. */
  onActioned?: (id: string) => void;
}

/** Append prefill values as query params to the cross-option target route. */
function withPrefill(route: string, prefill?: Record<string, unknown>): string {
  if (!prefill || Object.keys(prefill).length === 0) return route;
  const [path, existing] = route.split('?');
  const qs = new URLSearchParams(existing);
  for (const [k, v] of Object.entries(prefill)) {
    if (v != null) qs.set(k, String(v));
  }
  return `${path}?${qs.toString()}`;
}

export default function CrossOptionModal({ action, onClose, onActioned }: CrossOptionModalProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!action) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [action, onClose]);

  if (!action || !action.cross_option) return null;
  const co = action.cross_option;

  const doIt = async () => {
    setBusy(true);
    try { await actOnRoleAction(action.id, 'action'); } catch { /* surfaced on next inbox refresh */ }
    onActioned?.(action.id);
    const route = withPrefill(co.target_route, co.prefill);
    setBusy(false);
    onClose();
    navigate(route);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0b1c30]/40 backdrop-blur-sm">
      <div
        role="dialog" aria-modal="true" aria-label="Suggested next step"
        className="w-full sm:max-w-md bg-white border border-[#dde4ec] rounded-t-2xl sm:rounded-xl shadow-2xl"
      >
        <header className="flex items-start justify-between px-5 py-3 border-b border-[#eef2f7]">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[#1a3a5c] font-semibold">Suggested next step</p>
            <h2 className="text-[14px] font-display font-semibold text-[#0f1c2e] mt-0.5">{action.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-md p-1.5 text-[#6b7685] hover:text-[#0f1c2e] hover:bg-[#eef2f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 text-[13px] text-[#3d4756] space-y-1">
          <p>
            From <span className="font-medium text-[#0f1c2e]">{action.source_chain_key ?? action.source_entity_type}</span>
            {' · '}{action.source_entity_id}
          </p>
          <p className="text-[12px] text-[#6b7685]">
            Completing this opens <span className="text-[#0f1c2e] font-medium">{co.target_route}</span>.
          </p>
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#eef2f7]">
          <button type="button" onClick={onClose} disabled={busy}
            className="text-[12px] text-[#6b7685] hover:text-[#0f1c2e] px-3 py-1.5 rounded-md hover:bg-[#eef2f7] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]">
            Later
          </button>
          <button type="button" onClick={() => void doIt()} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1a3a5c] hover:bg-[#16314e] text-white text-[12px] font-semibold px-4 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c] focus-visible:ring-offset-1">
            {co.action_label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check:pages`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/src/components/launch/CrossOptionModal.tsx
git commit -m "feat(W6): CrossOptionModal bottom sheet for cross-role next steps

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire `InsightsPanel` + `CrossOptionModal` into `WorkstationShell`

**Files:**
- Modify: `pages/src/components/launch/WorkstationShell.tsx`

**Context:** Add an optional `chainKey?: string` to `WorkstationTab` (additive — existing tabs unaffected). When the active tab has a `chainKey`, render an `InsightsPanel` in the right rail beneath the `IncomingPanel`. Replace the inline cross-option `WizardShell` (lines 241–276) with `CrossOptionModal`, preserving the existing `active`/`setActive` state and `onAct` wiring. Apply the same change to BOTH return variants (role-wrapped at ~line 278 and non-role at ~line 440 — the agent must locate both `incomingRail` usages and add the insights rail next to each, and render `<CrossOptionModal>` where `{wizard}` was rendered).

- [ ] **Step 1: Add imports**

At the top of `WorkstationShell.tsx`, alongside the existing `import IncomingPanel from './IncomingPanel';` and `import WizardShell from './WizardShell';`, add:

```typescript
import InsightsPanel from './InsightsPanel';
import CrossOptionModal from './CrossOptionModal';
```

(The `WizardShell` import may remain if used elsewhere in the file; if it becomes unused after this task, remove it to keep the type-check clean.)

- [ ] **Step 2: Extend the `WorkstationTab` type**

Change the type (lines 26–31) to add `chainKey`:

```typescript
export type WorkstationTab = {
  key: string;
  label: string;
  group?: string;
  /** Layer-D chain_key — when set, the tab shows a per-chain InsightsPanel rail. */
  chainKey?: string;
  body: (props: { onRefresh: () => void }) => ReactNode;
};
```

- [ ] **Step 3: Build the insights rail and replace the wizard**

Replace the `incomingRail` definition and the `wizard` block (lines ~237–276) with:

```typescript
  const incomingRail = (
    <IncomingPanel className="hidden xl:block xl:w-80 shrink-0" onAct={setActive} />
  );

  // Per-feature insight rail — only when the active tab is chain-backed.
  const activeChainKey = (tabs.find(t => t.key === activeTab) ?? tabs[0])?.chainKey;
  const insightsRail = activeChainKey ? (
    <InsightsPanel
      key={activeChainKey}
      chainKey={activeChainKey}
      label={(tabs.find(t => t.key === activeTab) ?? tabs[0])?.label}
      className="hidden xl:block xl:w-80 shrink-0"
    />
  ) : null;

  const crossOption = (
    <CrossOptionModal
      action={active}
      onClose={() => setActive(null)}
      onActioned={() => setActive(null)}
    />
  );
```

Then, wherever the right rail is composed in BOTH return variants, render the insights rail beneath the incoming rail. Find each `{incomingRail}` usage and wrap the two in a vertical stack, e.g.:

```tsx
<div className="hidden xl:flex xl:flex-col gap-5 shrink-0">
  {incomingRail}
  {insightsRail}
</div>
```

If `incomingRail` is currently rendered inside a flex row directly, replace the single `{incomingRail}` node with the stack above (do NOT double the `hidden xl:block` — the wrapper now owns visibility; keep the inner panels' classes as-is, they no-op the duplicate `hidden xl:block`).

Finally, replace each `{wizard}` render site with `{crossOption}`.

- [ ] **Step 4: Type-check + build**

Run: `npm run check:pages`
Expected: no errors (no unused `WizardShell`/`actOnRoleAction`/`navigate` import warnings — remove any that became unused).

Run: `cd pages && npm run build && cd ..`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add pages/src/components/launch/WorkstationShell.tsx
git commit -m "feat(W6): wire InsightsPanel + CrossOptionModal into WorkstationShell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Add `chainKey` to chain-backed tabs across all workstations

**Files:**
- Modify: `pages/src/components/pages/TraderWorkstationPage.tsx`
- Modify: `pages/src/components/pages/LenderWorkstationPage.tsx`
- Modify: `pages/src/components/pages/IppWorkstationPage.tsx`
- Modify: `pages/src/components/pages/OfftakerWorkstationPage.tsx`
- Modify: `pages/src/components/pages/CarbonWorkstationPage.tsx`
- Modify: `pages/src/components/pages/GridOpsWorkstationPage.tsx`
- Modify: `pages/src/components/pages/RegulatorWorkstationPage.tsx`
- Modify: `pages/src/components/pages/SupportWorkstationPage.tsx`
- Modify: `pages/src/components/pages/AdminWorkstationPage.tsx`
- Modify: `pages/src/components/pages/EsumsOmPage.tsx`

**Context:** Now that `WorkstationShell` renders an `InsightsPanel` for any tab with a `chainKey`, add `chainKey: '<chain_key>'` to each tab that maps to a Layer-D chain. The `chain_key` value is the same string the chain emits in its `fireCascade({ chain_key })` PlatformEvent — i.e. the chain's spec key (e.g. `ppa_contract`, `drawdown`, `reserve_account`, `carbon_retirement`). A tab that is not chain-backed (e.g. a raw "Open orders" listing or a settings tab) gets no `chainKey` and simply shows no insights rail — that is correct.

**How to find the right `chain_key` for a tab (do this per page, do not guess):**
1. Open the workstation page and read its `tabs` array. For each tab whose body renders a chain workflow (a `*ChainTab` component, or a tab whose listing hits a chain endpoint), determine the chain.
2. Grep the backend for the chain's `chain_key`. Chains set it where they call `fireCascade`. Run, from `open-energy-platform/`:
   ```bash
   grep -rn "chain_key:" src/routes/<that-chain>-chain.ts src/cascade-rules/ | head
   ```
   If a chain does not yet pass `chain_key` to `fireCascade`, use the chain's spec key — the kebab/snake identifier in its `*-spec.ts` filename (e.g. `reserve-account-spec.ts` → `reserve_account`). The InsightsPanel will simply show "No activity on this chain yet" until events accrue, which is acceptable and non-breaking.
3. Add `chainKey: '<value>'` to that tab object.

**Per-page approach (one commit per page):** For each of the 10 files, add `chainKey` to every chain-backed tab, then type-check. Do not modify tab `body`, `key`, `label`, or `group`. This is purely additive.

- [ ] **Step 1: Trader workstation**

For each chain-backed tab in `TraderWorkstationPage.tsx` (e.g. best-execution, trade-reporting, market-abuse, allocation, counterparty-margin, algo-certification, position-limit, FSCA conduct), add `chainKey`. Example edit shape:

```typescript
// before
{ key: 'best-ex', label: 'Best execution', group: 'Compliance', body: () => <BestExecutionChainTab /> },
// after
{ key: 'best-ex', label: 'Best execution', group: 'Compliance', chainKey: 'best_execution', body: () => <BestExecutionChainTab /> },
```

Run: `npm run check:pages` → no errors. Commit:
```bash
git add pages/src/components/pages/TraderWorkstationPage.tsx
git commit -m "feat(W6): chainKey on Trader workstation chain tabs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 2: Lender workstation** — repeat for `LenderWorkstationPage.tsx` (covenant-certificate, reserve-account, drawdown, disbursement, loan-default, credit-origination, security-perfection, loan-transfer, ESAP, DSCR, credit-insurance, CP-clearance, capital-adequacy). Type-check, commit (`chainKey on Lender workstation chain tabs`).

- [ ] **Step 3: IPP workstation** — `IppWorkstationPage.tsx` (procurement, cod, gca, insurance-claim, ed-commitment, bonds, planned-outage, milestone-variance, export-curtailment, gtia, etc.). Type-check, commit.

- [ ] **Step 4: Offtaker workstation** — `OfftakerWorkstationPage.tsx` (ppa_contract, take_or_pay, tariff_indexation, curtailment_claim, payment_security, rec_lifecycle, ppa_termination, wheeling_access, green_tariff). Type-check, commit.

- [ ] **Step 5: Carbon workstation** — `CarbonWorkstationPage.tsx` (carbon_retirement, carbon_registration, carbon_reversal, mrv_chain, article6, offset_claim, crediting_renewal, poa_cpa_inclusion, erpa, registry_transfer, methodology_amendment). Type-check, commit.

- [ ] **Step 6: Grid Ops workstation** — `GridOpsWorkstationPage.tsx` (dispatch_nominations, load_curtailment, gca, reserve_activation, grid_code_compliance, connection_energization, capacity_allocation, substation_asset, demand_response, eop_activation). Type-check, commit.

- [ ] **Step 7: Regulator workstation** — `RegulatorWorkstationPage.tsx` (disposition, licence_renewal, licence_application, compliance_inspection, tariff_determination, sseg_registration, complaint_resolution, levy_assessment, public_consultation, market_conduct_exam). Type-check, commit.

- [ ] **Step 8: Support workstation** — `SupportWorkstationPage.tsx` (support_ticket, problem_management, change_enablement, security_remediation, warranty_claim, warranty_recovery, spare_parts_provisioning, csat, sla_performance). Type-check, commit.

- [ ] **Step 9: Admin workstation** — `AdminWorkstationPage.tsx`. Most admin tabs are platform-ops, not chains; add `chainKey` only where a tab genuinely maps to a chain. If none do, make no change and note it in the commit (skip the commit if no edit). 

- [ ] **Step 10: Esums O&M page** — `EsumsOmPage.tsx` (site_commissioning, pr_chain, availability_guarantee, asset_prognostics, pm_compliance, permit_to_work, hse_incident, wo_dispatch). Type-check, commit.

- [ ] **Step 11: Full SPA build**

Run: `cd pages && npm run build && cd ..`
Expected: build succeeds.

---

## Task 9: `/modules` discovery page

**Files:**
- Create: `pages/src/components/pages/ModulesPage.tsx`
- Modify: `pages/src/App.tsx` (register route)

**Context:** The blueprint's `/modules` is a SPA discovery grid: the platform's modules as entry points, with a one-line "what it is" and a primary CTA into the relevant surface. It is fed by the existing `GET /api/modules/my` endpoint (`src/routes/modules.ts`) which returns `{ enabled_modules, catalogue }`. Each catalogue row has `module_key, display_name, description`. We render the enabled set as cards with a deep link, and the rest as muted "not enabled" cards. This satisfies "100% of standalone chains reachable by deep link" intent at the module level.

- [ ] **Step 1: Write `pages/src/components/pages/ModulesPage.tsx`**

```typescript
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, ArrowRight, Lock } from 'lucide-react';
import { api } from '../../lib/api';

interface ModuleRow {
  module_key: string;
  display_name: string;
  description: string;
}
interface MyModules {
  enabled_modules: string[];
  catalogue: ModuleRow[];
}

// Module → primary in-app route. Falls back to /launch when unmapped.
const MODULE_ROUTE: Record<string, string> = {
  spot_trading: '/trading',
  carbon_credits: '/carbon',
  project_dev: '/projects',
  ppa_management: '/contracts',
  esg_tracking: '/esg',
  grid_wheeling: '/grid',
  procurement: '/procurement',
  deal_room: '/contracts',
};

export default function ModulesPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MyModules | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.get<{ data: MyModules }>('/modules/my')
      .then((r) => { if (live) setData(r.data.data); })
      .catch(() => { if (live) setError('Could not load modules.'); });
    return () => { live = false; };
  }, []);

  const enabled = useMemo(() => new Set(data?.enabled_modules ?? []), [data]);

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-[#1a3a5c]">
          <LayoutGrid className="h-5 w-5" aria-hidden />
          <span className="text-[11px] uppercase tracking-wider font-semibold">Discover</span>
        </div>
        <h1 className="text-2xl font-display font-bold text-[#0f1c2e] mt-1">Modules</h1>
        <p className="text-[13px] text-[#6b7685] mt-1 max-w-2xl">
          Every capability on the platform, in one place. Open an enabled module, or ask your administrator to switch on the rest.
        </p>
      </header>

      {error && <p className="text-[13px] text-rose-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data?.catalogue ?? []).map((m) => {
          const on = enabled.has(m.module_key);
          const route = MODULE_ROUTE[m.module_key] ?? '/launch';
          return (
            <article
              key={m.module_key}
              className={`rounded-xl border p-4 flex flex-col justify-between ${on ? 'bg-white border-[#dde4ec]' : 'bg-[#f8fafc] border-[#e5ebf2] opacity-80'}`}
            >
              <div>
                <h2 className="text-[14px] font-semibold text-[#0f1c2e]">{m.display_name}</h2>
                <p className="mt-1 text-[12px] text-[#6b7685] leading-snug">{m.description}</p>
              </div>
              <div className="mt-4">
                {on ? (
                  <button
                    type="button" onClick={() => navigate(route)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#1a3a5c] hover:bg-[#16314e] text-white text-[12px] font-semibold px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3a5c]"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9aa6b5]">
                    <Lock className="h-3.5 w-3.5" aria-hidden /> Not enabled
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `pages/src/App.tsx`**

Add a lazy import alongside the other page imports, then add the route in the national-scale suite section (near the other top-level routes, e.g. by `/marketplace`). Use the same `ProtectedRoute` + `Layout` wrapper the neighbouring routes use. Add:

```tsx
<Route path="/modules" element={<ProtectedRoute><Layout><ModulesPage /></Layout></ProtectedRoute>} />
```

Import `ModulesPage` following the existing import style in `App.tsx` (match whether neighbours use static `import` or `React.lazy`; if lazy, wrap in the existing `<Suspense>`/`LazyWorkbench` pattern already used there).

- [ ] **Step 3: Type-check + build**

Run: `npm run check:pages`
Expected: no errors.

Run: `cd pages && npm run build && cd ..`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/pages/ModulesPage.tsx pages/src/App.tsx
git commit -m "feat(W6): /modules discovery page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Backend type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 2: Full backend test suite**

Run: `npm test`
Expected: all tests pass (the prior count plus the 3 new W6 test files: `chain-state`, `metrics-rollup-open-terminal`, `insights-api`).

- [ ] **Step 3: SPA type-check + build**

Run: `npm run check:pages && cd pages && npm run build && cd ..`
Expected: both succeed.

- [ ] **Step 4: Confirm no forbidden files changed**

Run:
```bash
git diff --name-only origin/main...HEAD | grep -E '\-(chain|spec)\.ts$' || echo "OK: no chain/spec files changed"
git diff --name-only origin/main...HEAD | grep -E 'wrangler\.toml$' || echo "OK: wrangler.toml unchanged"
```
Expected: both print the OK line (W6 touched no chain/spec/wrangler files).

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

If steps 1–3 required fixes, commit them:
```bash
git add -A
git commit -m "fix(W6): verification fixes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Decisions & assumptions

- **open/terminal is event-log-derived, not chain-table-derived.** The W4 defer note suggested reading live chain tables; this plan instead derives open/terminal from `oe_platform_events.source_chain_status` (latest event per entity), bucketed by a terminal-token heuristic in `chain-state.ts`. This is truer to the blueprint's "zero per-chain code" principle and avoids coupling the analytics layer to ~80 chain table schemas. The heuristic may misclassify a non-standard status token; that is acceptable for an analytics estimate and is centralised in one editable token list.
- **AI insight cards are deterministic (rule-based), not LLM-generated.** Mirrors the existing `buildTraderAiSuggestions` pattern so the cards are testable and add no latency/cost. The `AI` binding is reserved for genuinely generative narrative, out of W6 scope.
- **InsightsPanel is opt-in per tab via `chainKey`.** Tabs without a chain (raw listings, settings) correctly show no insights rail. "Every workstation tab" is satisfied for every chain-backed tab; non-chain tabs have nothing to chart.
- **`/api/modules` already exists** as a backend catalogue route; W6 adds only the SPA `/modules` page, reusing `/modules/my`. No backend change for modules.
- **No new migration.** The rollup tables (479) already exist. W6 is read-only over them plus three SPA components.
- **National dashboard, LifecycleFlow, route-manifest slimming, sweep batching, Queue consumer hardening, and read-replica reads are W7**, not W6 — deliberately excluded here.
