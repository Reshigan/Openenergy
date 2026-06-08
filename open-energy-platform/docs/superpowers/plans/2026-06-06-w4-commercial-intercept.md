# W4 — Commercial Intercept + Metrics Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-wired Layer-B commercial intercept and Layer-D analytics sink *operationally complete* — seed an all-free rate card, honour `payer_resolution` (including revenue splits), expose an admin-revenue reporting/control API, and aggregate the event stream into the rollup tables on the nightly cron.

**Architecture:** Three layers already fan out of `fireCascade()` inline and error-isolated (W1): the cascade registry, `recordPlatformEvent` (analytics sink → `oe_platform_events`), and `computeAndRecordFee` (commercial → `oe_platform_revenue`). This wave does **not** touch `fireCascade` staging or any `*-chain.ts` / `*-spec.ts`. It (1) adds migration 481 — an additive `split_config` column plus an all-free seed of `oe_fee_schedule`; (2) deepens `fee-engine.ts` so it records for any seeded event (deriving value from `ctx.data` when no explicit `ctx.commercial` is passed) and resolves the payer per `payer_resolution`, writing `oe_revenue_splits` for the `split` case; (3) adds `src/routes/admin-revenue.ts` (schedule CRUD/enable + revenue analytics) mounted at `/api/admin/revenue`; (4) adds `src/utils/metrics-rollup.ts` and wires it into the **existing** `5 0 * * *` cron case (no `wrangler.toml` change — `wrangler.toml` is on the must-not-change list).

**Tech Stack:** TypeScript, Hono, Cloudflare D1 (SQLite), Workers cron `scheduled()`, vitest + `tests/helpers/d1-sqlite.ts` (better-sqlite3, applies all migrations).

---

## Context the engineer must hold

**Where this fits.** `fireCascade(ctx)` (`src/utils/cascade.ts` ~L2371) runs, in order: audit → notifications → audit-chain → webhooks → special → **registry** → **analytics** → **commercial**. The last three are each wrapped in `runStage(...).catch(()=>{})` (a throw lands in `cascade_dlq`, never breaks the cascade). The meta-event `audit.event_appended` is suppressed before analytics + commercial run (anti-double-count). **You are only changing what `computeAndRecordFee` does, plus new files and one cron line. Do not edit `cascade.ts`.**

**`CascadeContext`** (in `src/utils/cascade.ts`) extends `PlatformEventFields`:
- `event: string`, `actor_id?: string`, `entity_type: string`, `entity_id: string`, `data?: Record<string, unknown>`, `env`, `skipAudit?`
- `chain_key?`, `source_chain_status?`, `affected_roles?: PlatformRole[]`, `cross_impact_hint?`, `commercial?: CommercialContext`
- `CommercialContext = { entity_value?: number; participant_id?: string; billing_period?: string; tier?: string }`

**Hard constraints (from the blueprint "What must NOT change"):**
- Do **not** edit any `*-chain.ts` or `*-spec.ts`, `cascade.ts`, `wrangler.toml`, auth/tenant/locks, OrderBook DO, matching.
- Schema is **additive only**: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`. Never `ALTER`/drop existing columns. Migration 481 is the next free number (480 = `480_w2_trading_party_link.sql` already exists).
- All revenue `share_pct` are **0..1 fractions**, not percentages (see `migrations/475_layerB_revenue.sql:55`).
- Fees ship **ALL FREE**: every seed row is `is_enabled = 0`, `rate = 0`. The engine records `R0 / status='waived'` until an operator flips a row live via the admin API.

**Locked test invariants you must not break** (run `npx vitest run tests/fee-engine.test.ts tests/cascade-wiring.test.ts tests/analytics-sink.test.ts` — all must stay green):
1. `tests/fee-engine.test.ts` — no schedule row + `commercial` present → R0 `waived`; disabled row + `commercial` → R0 `waived`; enabled bps/flat/pct compute correctly with `participant_id`/`billing_period` carried through; clamp to `max_fee_zar`; **no `commercial` AND no row → 0 revenue rows** (this is the gate you must preserve).
2. `tests/cascade-wiring.test.ts` — `fireCascade` logs to `oe_platform_events`; records R0 waived when `commercial` present; a throwing analytics layer lands in `cascade_dlq` and the cascade still resolves; `audit.event_appended` writes 0 analytics + 0 revenue rows.

**The additive behaviour you are adding to the engine:** today the engine early-returns unless `ctx.commercial` is present, so the seed would be inert for the ~all events that don't pass commercial context (only 3 chains do). The fix: look up the schedule row first and proceed if `commercial` **or** a row exists. For seeded events with no explicit commercial context, derive `entity_value`/`participant_id` from `ctx.data` (chains spread their row into `data`). This makes the rate card meaningful and serves success-metric #2 (≥95% of ZAR-valued transitions fire a fee event) **without editing any chain**. The `!commercial && !row → return` gate stays, so non-billable events stay silent.

> **Known cost / deferred:** with the relaxed gate, the commercial stage now runs one indexed point-`SELECT` on `oe_fee_schedule` per cascade event. This is consistent with the analytics sink, which already runs one INSERT per event, and both are slated to move to the Queue consumer in W7. Caching the set of billable `trigger_event`s in KV (TTL ~60s, invalidated on schedule write) is the W7 optimisation — note it, do not build it now.

## File structure

- `migrations/481_layerB_fee_schedule.sql` — **create**. `ALTER TABLE oe_fee_schedule ADD COLUMN split_config TEXT;` + all-free seed (`INSERT OR IGNORE`, idempotent).
- `src/utils/fee-engine.ts` — **modify**. Add `split_config` to the row type; add `deriveValueFromData`, `deriveParticipantFromData`, `resolvePayer`, `writeSplits`; relax the gate; resolve payer + write splits.
- `tests/fee-engine.test.ts` — **modify**. Add cases for value-from-data, each `payer_resolution`, and split writes.
- `tests/fee-schedule-seed.test.ts` — **create**. Assert the seed loaded, all rows are free, `split_config` column exists and parses.
- `src/routes/admin-revenue.ts` — **create**. Admin-only schedule list/patch + revenue analytics.
- `tests/admin-revenue.test.ts` — **create**. Auth gating + each analytics endpoint shape.
- `src/index.ts` — **modify**. Import `adminRevenueRoutes` + mount at `/api/admin/revenue`; import `rollupMetrics` + add one `safe()` call in the `5 0 * * *` cron case.
- `src/utils/metrics-rollup.ts` — **create**. `rollupMetrics(env, date)` → `oe_metrics_daily` + `oe_chain_metrics`.
- `tests/metrics-rollup.test.ts` — **create**. Seed `oe_platform_events`, run rollup, assert aggregates + idempotency.

---

## Task 1: Migration 481 — split_config column + all-free fee-schedule seed

**Files:**
- Create: `migrations/481_layerB_fee_schedule.sql`
- Test: `tests/fee-schedule-seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/fee-schedule-seed.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';

let db: Database.Database;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('migration 481 — all-free fee schedule seed', () => {
  it('seeds at least 20 billable events, every one free at launch', () => {
    const rows = db.prepare(`SELECT * FROM oe_fee_schedule`).all() as any[];
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const r of rows) {
      expect(r.is_enabled).toBe(0);  // ALL FREE
      expect(r.rate).toBe(0);        // R0
    }
  });

  it('adds the split_config column and seeds at least one split row that parses', () => {
    const cols = (db.prepare(`PRAGMA table_info(oe_fee_schedule)`).all() as any[]).map(c => c.name);
    expect(cols).toContain('split_config');
    const splits = db.prepare(
      `SELECT * FROM oe_fee_schedule WHERE payer_resolution = 'split' AND split_config IS NOT NULL`,
    ).all() as any[];
    expect(splits.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(splits[0].split_config);
    expect(Array.isArray(parsed)).toBe(true);
    const total = parsed.reduce((s: number, p: any) => s + Number(p.share_pct), 0);
    expect(total).toBeCloseTo(1, 6); // shares are 0..1 fractions summing to 1
  });

  it('uses only canonical PlatformRole strings for payer_role', () => {
    const roles = new Set(['admin','ipp_developer','trader','lender','offtaker','carbon_fund','grid_operator','regulator','support']);
    const rows = db.prepare(`SELECT payer_role FROM oe_fee_schedule WHERE payer_role IS NOT NULL`).all() as any[];
    for (const r of rows) expect(roles.has(r.payer_role)).toBe(true);
  });

  it('is idempotent — applying the seed twice keeps one row per trigger_event', () => {
    // INSERT OR IGNORE against the UNIQUE(trigger_event) constraint
    const before = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    db.exec(`INSERT OR IGNORE INTO oe_fee_schedule (id, trigger_event, fee_type, rate, is_enabled, payer_resolution)
             VALUES ('dup_test', 'trade.matched', 'bps', 0, 0, 'split')`);
    const after = (db.prepare(`SELECT COUNT(*) n FROM oe_fee_schedule`).get() as any).n;
    expect(after).toBe(before); // trade.matched already seeded → ignored
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/fee-schedule-seed.test.ts`
Expected: FAIL — `oe_fee_schedule` is empty (0 rows) and `split_config` column does not exist.

- [ ] **Step 3: Write the migration**

Create `migrations/481_layerB_fee_schedule.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 481 — Ecosystem Layer B: all-free fee-schedule seed.
-- Adds split_config (per-fee party shares for payer_resolution='split') and
-- seeds one row per billable value-creating event. ALL FREE at launch:
-- is_enabled=0, rate=0 → the engine records R0 'waived' rows so the pipeline
-- and revenue reporting are proven end-to-end with zero billing risk. An
-- operator flips one row (is_enabled=1 + rate) via /api/admin/revenue to switch
-- any fee live — no deploy. trigger_event is UNIQUE so INSERT OR IGNORE is
-- idempotent. split_config holds a JSON array of {party_role, party_id?,
-- share_pct} with share_pct as a 0..1 fraction (matches oe_revenue_splits).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE oe_fee_schedule ADD COLUMN split_config TEXT;

INSERT OR IGNORE INTO oe_fee_schedule
  (id, trigger_event, fee_type, rate, min_fee_zar, max_fee_zar, applicable_tiers, payer_role, payer_resolution, is_enabled, description, split_config)
VALUES
  ('fee_trade_matched',        'trade.matched',                'bps',      0, 0, NULL, '[]', 'trader',        'split',       0, 'Exchange trade matched — maker/taker split', '[{"party_role":"trader","share_pct":0.5},{"party_role":"trader","share_pct":0.5}]'),
  ('fee_vcm_order_matched',    'vcm_order_matched',            'bps',      0, 0, NULL, '[]', 'trader',        'split',       0, 'Voluntary carbon market order matched',     '[{"party_role":"trader","share_pct":0.5},{"party_role":"carbon_fund","share_pct":0.5}]'),
  ('fee_settlement_settled',   'settlement.cycle_settled',     'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Settlement cycle settled',                  NULL),
  ('fee_clearing_loss_exec',   'clearing.loss_event_executed','bps',      0, 0, NULL, '[]', 'trader',        'platform',    0, 'Clearing loss event executed (mutualised)', NULL),
  ('fee_lender_waterfall',     'lender.waterfall_executed',   'bps',      0, 0, NULL, '[]', 'lender',        'platform',    0, 'Lender cash waterfall executed',            NULL),
  ('fee_contract_signed',      'contract.signed',             'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'beneficiary', 0, 'PPA / contract signed',                     NULL),
  ('fee_cdr_offtake_signed',   'cdr.offtake_signed',          'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'beneficiary', 0, 'Corporate offtake agreement signed',        NULL),
  ('fee_invoice_issued',       'invoice.issued',              'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Invoice issued',                            NULL),
  ('fee_invoice_paid',         'invoice.paid',                'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Invoice paid',                              NULL),
  ('fee_drawdown_disbursed',   'ipp.drawdown_disbursed',      'bps',      0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'Debt drawdown disbursed',                   NULL),
  ('fee_disbursement_appr',    'disbursement.approved',       'bps',      0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'Use-of-proceeds disbursement approved',     NULL),
  ('fee_carbon_credits_iss',   'carbon.credits_issued',       'bps',      0, 0, NULL, '[]', 'carbon_fund',   'initiator',   0, 'Carbon credits issued',                     NULL),
  ('fee_carbon_vintage_iss',   'carbon.vintage_issued',       'bps',      0, 0, NULL, '[]', 'carbon_fund',   'initiator',   0, 'Carbon vintage issued',                     NULL),
  ('fee_carbon_retired',       'carbon.retired',              'flat_zar', 0, 0, NULL, '[]', 'carbon_fund',   'initiator',   0, 'Carbon credits retired',                    NULL),
  ('fee_rec_issued',           'offtaker.rec_issued',         'flat_zar', 0, 0, NULL, '[]', 'ipp_developer', 'initiator',   0, 'Renewable energy certificate issued',       NULL),
  ('fee_rec_retired',          'offtaker.rec_retired',        'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Renewable energy certificate retired',      NULL),
  ('fee_wheeling_issued',      'grid.wheeling_charge_issued', 'bps',      0, 0, NULL, '[]', 'grid_operator', 'beneficiary', 0, 'Wheeling charge issued',                    NULL),
  ('fee_wheeling_paid',        'grid.wheeling_charge_paid',   'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Wheeling charge paid',                      NULL),
  ('fee_licence_granted',      'regulator.licence_granted',   'flat_zar', 0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'NERSA licence granted',                     NULL),
  ('fee_margin_call_issued',   'trader.margin_call_issued',   'flat_zar', 0, 0, NULL, '[]', 'trader',        'initiator',   0, 'Margin call issued',                        NULL),
  ('fee_facility_amendment',   'fam_evt_execute_amendment',   'flat_zar', 0, 0, NULL, '[]', 'lender',        'initiator',   0, 'Facility amendment executed',               NULL),
  ('fee_om_contract_exec',     'omc_evt_execute_contract',    'bps',      0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'O&M contract executed',                     NULL),
  ('fee_payment_sec_bond',     'psec_evt_issue_bond',         'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'PPA payment-security bond issued',          NULL);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/fee-schedule-seed.test.ts`
Expected: PASS (4 tests). 23 rows seeded, all free, `split_config` present, two `split` rows parse to shares summing to 1.

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform
git add migrations/481_layerB_fee_schedule.sql tests/fee-schedule-seed.test.ts
git commit -m "feat(W4): migration 481 — split_config column + all-free fee-schedule seed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Fee-engine — value derivation, payer_resolution, revenue splits

**Files:**
- Modify: `src/utils/fee-engine.ts`
- Modify: `tests/fee-engine.test.ts`

- [ ] **Step 1: Write the failing tests** — append these to `tests/fee-engine.test.ts` (after the existing `describe('fee-engine — enabled fees', ...)` block, before EOF). They reuse the file's existing `ctx`, `seedFee`, `revenue` helpers.

```typescript
function ctxData(event: string, data: Record<string, unknown>) {
  // No commercial context — value must be derived from ctx.data (chains spread
  // their row into data; we never edit the chains to pass commercial).
  return { event, entity_type: 'demo', entity_id: 'e1', env, data } as any;
}
function splits(revenueId: string): any[] {
  return db.prepare(`SELECT * FROM oe_revenue_splits WHERE revenue_id = ? ORDER BY id`).all(revenueId) as any[];
}

describe('fee-engine — value derivation from ctx.data (no commercial)', () => {
  it('records for a seeded event with no commercial, deriving value_zar from data', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 20, is_enabled: 1, payer_resolution: 'initiator', payer_role: 'trader' });
    await computeAndRecordFee(ctxData('demo.x', { value_zar: 2_000_000 }));
    const r = revenue();
    expect(r.entity_value).toBe(2_000_000);
    expect(r.fee_zar).toBeCloseTo(4000, 6); // 2,000,000 * 20/10000
    expect(r.status).toBe('pending');
    expect(r.payer_role).toBe('trader');
  });

  it('stays silent when there is neither commercial nor a schedule row', async () => {
    await computeAndRecordFee(ctxData('demo.unseeded', { value_zar: 999 }));
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_platform_revenue`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('records R0 waived for a seeded-but-disabled event with no commercial', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 20, is_enabled: 0, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctxData('demo.x', { amount_zar: 5000 }));
    const r = revenue();
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
    expect(r.entity_value).toBe(5000); // value still recorded for leakage reporting
  });
});

describe('fee-engine — payer_resolution', () => {
  it('platform resolution records payer_role = admin regardless of configured payer_role', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 1, payer_resolution: 'platform', payer_role: 'lender' });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    expect(revenue().payer_role).toBe('admin');
  });

  it('beneficiary resolution records the configured payer_role', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 1, payer_resolution: 'beneficiary', payer_role: 'offtaker' });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    expect(revenue().payer_role).toBe('offtaker');
  });
});

describe('fee-engine — revenue splits', () => {
  it('writes oe_revenue_splits rows for a split fee, amounts summing to the fee', async () => {
    seedFee({
      id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 1,
      payer_resolution: 'split',
      split_config: JSON.stringify([
        { party_role: 'trader', share_pct: 0.6 },
        { party_role: 'carbon_fund', share_pct: 0.4 },
      ]),
    });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    const rev = revenue();
    expect(rev.fee_zar).toBe(1000);
    const sp = splits(rev.id);
    expect(sp.length).toBe(2);
    expect(sp.map((s: any) => s.party_role).sort()).toEqual(['carbon_fund', 'trader']);
    expect(sp.reduce((t: number, s: any) => t + s.amount_zar, 0)).toBeCloseTo(1000, 6);
    expect(sp.find((s: any) => s.party_role === 'trader').amount_zar).toBeCloseTo(600, 6);
  });

  it('writes no splits when the fee is R0 (disabled/waived)', async () => {
    seedFee({
      id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 1000, is_enabled: 0,
      payer_resolution: 'split',
      split_config: JSON.stringify([{ party_role: 'trader', share_pct: 1 }]),
    });
    await computeAndRecordFee(ctx('demo.x', 100, 'par_1'));
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_revenue_splits`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd open-energy-platform && npx vitest run tests/fee-engine.test.ts`
Expected: the new cases FAIL — the engine early-returns without `commercial` (so the data-derivation cases record nothing), payer is always `row.payer_role` (so `platform` → wrong), and no splits are ever written.

- [ ] **Step 3: Rewrite `src/utils/fee-engine.ts`**

Replace the entire file with:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer B — Commercial Intercept.
// computeAndRecordFee(ctx) looks up oe_fee_schedule by trigger_event = ctx.event,
// computes the fee against the transition's ZAR value, resolves the payer per
// payer_resolution, and writes an oe_platform_revenue row (+ oe_revenue_splits
// when the fee is split). ALL FREE at launch: no row OR a disabled row records a
// R0 'waived' row so the pipeline + reporting are proven end-to-end with zero
// billing risk. Error-isolated by the caller (a throw lands in cascade_dlq).
//
// Value source: ctx.commercial.entity_value when the chain passes it; otherwise
// derived from ctx.data (chains spread their row into data) so a seeded event
// records even without explicit commercial context — without editing any chain.
// A non-billable event (no commercial AND no schedule row) stays silent.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

interface FeeScheduleRow {
  id: string;
  trigger_event: string;
  fee_type: 'bps' | 'flat_zar' | 'pct';
  rate: number;
  min_fee_zar: number | null;
  max_fee_zar: number | null;
  payer_role: string | null;
  payer_resolution: string;
  is_enabled: number;
  split_config: string | null;
}

interface SplitPart { party_role?: string; party_id?: string | null; share_pct?: number }

// Prioritised list of unambiguous ZAR value fields chains place in ctx.data.
// First positive number wins. Unmatched → 0 (records R0 'waived', which is the
// correct leakage signal until the chain is enriched to pass ctx.commercial).
const VALUE_KEYS = ['entity_value', 'value_zar', 'amount_zar', 'notional_zar', 'principal_zar', 'quantum_zar'] as const;
const PARTICIPANT_KEYS = ['participant_id', 'party_id', 'counterparty_id', 'borrower_id'] as const;

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function deriveValueFromData(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  for (const k of VALUE_KEYS) {
    const v = data[k];
    if (typeof v === 'number' && isFinite(v) && v > 0) return v;
  }
  return 0;
}

function deriveParticipantFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  for (const k of PARTICIPANT_KEYS) {
    const v = data[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

function computeRawFee(row: FeeScheduleRow, value: number): number {
  switch (row.fee_type) {
    case 'bps': return value * (row.rate / 10_000);
    case 'pct': return value * row.rate;
    case 'flat_zar': return row.rate;
    default: return 0;
  }
}

function clamp(fee: number, row: FeeScheduleRow): number {
  const lo = row.min_fee_zar;
  const hi = row.max_fee_zar;
  // Misconfigured schedule (min > max) would silently collapse every fee to a
  // single bound. Skip clamping rather than emit a wrong amount; the row is
  // auditable via oe_platform_revenue.fee_schedule_id.
  if (lo != null && hi != null && lo > hi) return fee;
  let f = fee;
  if (lo != null && f < lo) f = lo;
  if (hi != null && f > hi) f = hi;
  return f;
}

// Which role the revenue row records as payer. payer_resolution is config, not
// persisted on the revenue row — only the resolved payer_role is. 'platform'
// means the platform bears it (admin); 'split' detail lives in oe_revenue_splits.
function resolvePayer(row: FeeScheduleRow): string | null {
  if (row.payer_resolution === 'platform') return 'admin';
  return row.payer_role ?? null; // initiator | beneficiary | split → configured payer
}

async function writeSplits(
  db: CascadeContext['env']['DB'],
  revenueId: string,
  fee: number,
  splitConfig: string | null,
): Promise<void> {
  if (fee <= 0 || !splitConfig) return;
  let parts: SplitPart[];
  try { parts = JSON.parse(splitConfig); } catch { return; }
  if (!Array.isArray(parts) || parts.length === 0) return;
  for (const p of parts) {
    const share = Number(p.share_pct) || 0; // 0..1 fraction
    if (share <= 0) continue;
    const amount = Math.round(fee * share * 100) / 100;
    await db.prepare(
      `INSERT INTO oe_revenue_splits (id, revenue_id, party_role, party_id, share_pct, amount_zar)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(`rsp_${crypto.randomUUID()}`, revenueId, p.party_role ?? 'unknown', p.party_id ?? null, share, amount).run();
  }
}

export async function computeAndRecordFee(ctx: CascadeContext): Promise<void> {
  const db = ctx.env.DB;
  const commercial = ctx.commercial;

  const row = (await db
    .prepare(`SELECT * FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind(ctx.event)
    .first()) as FeeScheduleRow | null;

  // Not a value-bearing transition and not on the rate card → nothing to record.
  if (!commercial && !row) return;

  const value = commercial?.entity_value ?? deriveValueFromData(ctx.data);
  const participant = commercial?.participant_id ?? deriveParticipantFromData(ctx.data);
  const period = commercial?.billing_period ?? currentPeriod();

  let fee = 0;
  let status: 'pending' | 'waived' = 'waived';
  let scheduleId: string | null = null;
  let payerRole: string | null = null;

  if (row && row.is_enabled === 1) {
    fee = Math.round(clamp(computeRawFee(row, value), row) * 100) / 100;
    status = 'pending';
    scheduleId = row.id;
    payerRole = resolvePayer(row);
  }

  const revenueId = `rev_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO oe_platform_revenue
       (id, trigger_event, entity_id, entity_type, participant_id, payer_role,
        entity_value, fee_zar, fee_schedule_id, billing_period, status, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    revenueId, ctx.event, ctx.entity_id, ctx.entity_type,
    participant ?? null, payerRole,
    value, fee, scheduleId, period, status, new Date().toISOString(),
  ).run();

  if (row && row.is_enabled === 1 && row.payer_resolution === 'split') {
    await writeSplits(db, revenueId, fee, row.split_config);
  }
}
```

- [ ] **Step 4: Run the full fee-engine test + the locked wiring tests**

Run: `cd open-energy-platform && npx vitest run tests/fee-engine.test.ts tests/cascade-wiring.test.ts tests/analytics-sink.test.ts`
Expected: PASS — all original cases (incl. "no commercial AND no row → 0 rows", "R0 waived when no/disabled row", correct bps/flat/pct/clamp, audit.event_appended suppression) plus the new value-derivation, payer_resolution, and split cases.

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform
git add src/utils/fee-engine.ts tests/fee-engine.test.ts
git commit -m "feat(W4): fee-engine honours payer_resolution + splits, derives value from ctx.data

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: admin-revenue route — schedule control + revenue analytics

**Files:**
- Create: `src/routes/admin-revenue.ts`
- Modify: `src/index.ts` (import + mount only)
- Test: `tests/admin-revenue.test.ts`

Reporting maps to the blueprint's revenue-analytics line: *fees by event / role / period, free-vs-paid mix, projected ARR, leakage (billable events that fired R0), top revenue events.*

- [ ] **Step 1: Write the failing test**

Create `tests/admin-revenue.test.ts`. **Auth pattern is verified against the working `tests/role-actions-api.test.ts`:** the route mounts the *real* `authMiddleware` (`r.use('*', authMiddleware)`), so a stub `c.set('user', ...)` does NOT work — `getCurrentUser(c)` reads `c.get('auth').user` (`src/middleware/auth.ts:284-290`, shape `{ id, email, role, name, tenant_id }`), and `authMiddleware` requires a valid JWT *plus* a `participants` row for tenant resolution (`resolveTenantIdCached`). Mint a real token with `signToken` and seed the caller's participant, then call `adminRevenueRoutes.request(path, …)` directly (the route's own paths are `/schedule`, `/summary`, … relative to the mount).

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import adminRevenueRoutes from '../src/routes/admin-revenue';

let db: Database.Database;
let env: any;

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}
async function tokenFor(id: string, role: string): Promise<string> {
  return signToken({ sub: id, role, email: `${id}@openenergy.co.za` } as any, 'test-secret');
}
function call(path: string, token: string, init: RequestInit = {}) {
  return adminRevenueRoutes.request(
    path,
    { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } },
    env,
  );
}

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  seedParticipant('par_admin', 'admin');
  seedParticipant('par_trader', 'trader');
  // a paid + a waived revenue row in period 2026-06
  db.exec(`INSERT INTO oe_platform_revenue (id, trigger_event, entity_id, entity_type, participant_id, payer_role, entity_value, fee_zar, fee_schedule_id, billing_period, status)
           VALUES ('r1','trade.matched','e1','demo','par_1','trader',1000000,1500,'fee_trade_matched','2026-06','pending'),
                  ('r2','contract.signed','e2','demo','par_2','offtaker',500000,0,NULL,'2026-06','waived')`);
});
afterEach(() => { db.close(); });

describe('admin-revenue — auth', () => {
  it('rejects a non-admin with 403', async () => {
    const res = await call('/schedule', await tokenFor('par_trader', 'trader'));
    expect(res.status).toBe(403);
  });
  it('allows admin to list the schedule', async () => {
    const res = await call('/schedule', await tokenFor('par_admin', 'admin'));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(20);
  });
});

describe('admin-revenue — analytics', () => {
  it('summary reports free-vs-paid mix for the period', async () => {
    const res = await call('/summary?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    expect(body.data.total_fee_zar).toBeCloseTo(1500, 6);
    expect(body.data.events).toBe(2);
    expect(body.data.paid_events).toBe(1);   // status != waived
    expect(body.data.free_events).toBe(1);   // status = waived
  });
  it('by-event groups fee totals', async () => {
    const res = await call('/by-event?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    const trade = body.data.find((r: any) => r.trigger_event === 'trade.matched');
    expect(trade.fee_zar).toBeCloseTo(1500, 6);
  });
  it('leakage lists billable events that fired R0 against real value', async () => {
    const res = await call('/leakage?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    const leaked = body.data.find((r: any) => r.trigger_event === 'contract.signed');
    expect(leaked.forgone_value_zar).toBeCloseTo(500000, 6);
  });
  it('top-events ranks by fee', async () => {
    const res = await call('/top-events?period=2026-06', await tokenFor('par_admin', 'admin'));
    const body = await res.json() as any;
    expect(body.data[0].trigger_event).toBe('trade.matched');
  });
});

describe('admin-revenue — schedule control', () => {
  it('patches a schedule row to enable a fee', async () => {
    const res = await call('/schedule/fee_trade_matched', await tokenFor('par_admin', 'admin'), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_enabled: 1, rate: 15 }),
    });
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT is_enabled, rate FROM oe_fee_schedule WHERE id='fee_trade_matched'`).get() as any;
    expect(row.is_enabled).toBe(1);
    expect(row.rate).toBe(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/admin-revenue.test.ts`
Expected: FAIL — `../src/routes/admin-revenue` does not exist (import error).

- [ ] **Step 3: Write `src/routes/admin-revenue.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer B — admin revenue control + analytics. Mounted at /api/admin/revenue.
// Admin-only. The schedule endpoints are the "flip a fee live" control (fees
// ship all-free; an operator sets is_enabled + rate with no deploy). The
// analytics endpoints read oe_platform_revenue / oe_fee_schedule only — never a
// live chain table — so they stay cheap as the revenue log grows.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { fireCascade } from '../utils/cascade';

const r = new Hono<HonoEnv>();
r.use('*', authMiddleware);

function requireAdmin(role: string): boolean { return role === 'admin'; }
function period(c: any): string {
  return c.req.query('period') || new Date().toISOString().slice(0, 7);
}

// ─── Schedule (rate card) ────────────────────────────────────────────────────
r.get('/schedule', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const rs = await c.env.DB.prepare(
    `SELECT * FROM oe_fee_schedule ORDER BY is_enabled DESC, trigger_event`,
  ).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Flip a fee live / adjust the rate card. Only whitelisted columns are mutable.
r.patch('/schedule/:id', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const id = c.req.param('id');
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const existing = await c.env.DB.prepare(`SELECT * FROM oe_fee_schedule WHERE id = ?`).bind(id).first<any>();
  if (!existing) return c.json({ success: false, error: 'not found' }, 404);

  const allowed: Record<string, 'int' | 'num' | 'text'> = {
    is_enabled: 'int', rate: 'num', min_fee_zar: 'num', max_fee_zar: 'num',
    payer_role: 'text', payer_resolution: 'text', fee_type: 'text',
    applicable_tiers: 'text', split_config: 'text', description: 'text',
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, t] of Object.entries(allowed)) {
    if (!(k in b)) continue;
    const v = b[k];
    if (t === 'int') { sets.push(`${k} = ?`); vals.push(v == null ? null : Number(v) ? 1 : 0); }
    else if (t === 'num') { sets.push(`${k} = ?`); vals.push(v == null ? null : Number(v)); }
    else { sets.push(`${k} = ?`); vals.push(v == null ? null : String(v)); }
  }
  if (sets.length === 0) return c.json({ success: false, error: 'no mutable fields supplied' }, 400);
  sets.push(`updated_at = ?`);
  vals.push(new Date().toISOString());
  vals.push(id);
  await c.env.DB.prepare(`UPDATE oe_fee_schedule SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  // Audit the rate-card change through the cascade (real platform event).
  await fireCascade({
    event: 'fee_schedule.updated',
    actor_id: user.id,
    entity_type: 'fee_schedule',
    entity_id: id,
    data: { trigger_event: existing.trigger_event, changed: Object.keys(b) },
    env: c.env,
    chain_key: 'admin_revenue',
  }).catch(() => { /* best-effort audit; the UPDATE already committed */ });

  return c.json({ success: true });
});

// ─── Analytics (read-only, off the revenue log) ──────────────────────────────
r.get('/summary', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS events,
            COALESCE(SUM(fee_zar), 0) AS total_fee_zar,
            COALESCE(SUM(entity_value), 0) AS total_value_zar,
            SUM(CASE WHEN status = 'waived' THEN 1 ELSE 0 END) AS free_events,
            SUM(CASE WHEN status != 'waived' THEN 1 ELSE 0 END) AS paid_events
       FROM oe_platform_revenue WHERE billing_period = ?`,
  ).bind(p).first<any>();
  return c.json({ success: true, data: { period: p, ...row } });
});

r.get('/by-event', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const rs = await c.env.DB.prepare(
    `SELECT trigger_event, COUNT(*) AS events,
            COALESCE(SUM(fee_zar), 0) AS fee_zar,
            COALESCE(SUM(entity_value), 0) AS value_zar
       FROM oe_platform_revenue WHERE billing_period = ?
       GROUP BY trigger_event ORDER BY fee_zar DESC`,
  ).bind(p).all();
  return c.json({ success: true, data: rs.results || [] });
});

r.get('/by-role', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const rs = await c.env.DB.prepare(
    `SELECT COALESCE(payer_role, 'unattributed') AS payer_role,
            COUNT(*) AS events, COALESCE(SUM(fee_zar), 0) AS fee_zar
       FROM oe_platform_revenue WHERE billing_period = ?
       GROUP BY payer_role ORDER BY fee_zar DESC`,
  ).bind(p).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Leakage = billable events that fired R0 against real ZAR value (forgone revenue).
r.get('/leakage', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const rs = await c.env.DB.prepare(
    `SELECT trigger_event, COUNT(*) AS r0_events,
            COALESCE(SUM(entity_value), 0) AS forgone_value_zar
       FROM oe_platform_revenue
       WHERE billing_period = ? AND fee_zar = 0 AND entity_value > 0
       GROUP BY trigger_event ORDER BY forgone_value_zar DESC`,
  ).bind(p).all();
  return c.json({ success: true, data: rs.results || [] });
});

r.get('/top-events', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const limit = Math.min(Number(c.req.query('limit')) || 10, 100);
  const rs = await c.env.DB.prepare(
    `SELECT trigger_event, COALESCE(SUM(fee_zar), 0) AS fee_zar, COUNT(*) AS events
       FROM oe_platform_revenue WHERE billing_period = ?
       GROUP BY trigger_event ORDER BY fee_zar DESC LIMIT ?`,
  ).bind(p, limit).all();
  return c.json({ success: true, data: rs.results || [] });
});

// Projected ARR: annualise the trailing period's actual fees (12×). Honest and
// cheap; a richer model (enabled-schedule × forecast volume) is a later refinement.
r.get('/arr', async (c) => {
  const user = getCurrentUser(c);
  if (!requireAdmin(user.role)) return c.json({ success: false, error: 'Admin only' }, 403);
  const p = period(c);
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(fee_zar), 0) AS period_fee_zar FROM oe_platform_revenue WHERE billing_period = ?`,
  ).bind(p).first<any>();
  const monthly = Number(row?.period_fee_zar || 0);
  return c.json({ success: true, data: { period: p, monthly_fee_zar: monthly, projected_arr_zar: monthly * 12 } });
});

export default r;
```

- [ ] **Step 4: Mount the route in `src/index.ts`**

Add the import near the other route imports (e.g. just after the `adminPlatformRoutes` import at `src/index.ts:318`):

```typescript
import adminRevenueRoutes from './routes/admin-revenue';
```

Add the mount near the other `/api/admin/*` mounts (e.g. just after `src/index.ts:1007` `app.route('/api/admin/monitoring', monitoringRoutes);`):

```typescript
app.route('/api/admin/revenue', adminRevenueRoutes);
```

- [ ] **Step 5: Run tests + type-check**

Run: `cd open-energy-platform && npx vitest run tests/admin-revenue.test.ts && npm run check`
Expected: PASS (all admin-revenue cases) and tsc clean.

- [ ] **Step 6: Commit**

```bash
cd open-energy-platform
git add src/routes/admin-revenue.ts tests/admin-revenue.test.ts src/index.ts
git commit -m "feat(W4): admin-revenue route — schedule control + revenue analytics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: metrics-rollup util + nightly cron wiring

**Files:**
- Create: `src/utils/metrics-rollup.ts`
- Modify: `src/index.ts` (import + one `safe()` call in the existing `5 0 * * *` cron case — **no `wrangler.toml` change**)
- Test: `tests/metrics-rollup.test.ts`

`rollupMetrics(env, date)` aggregates `oe_platform_events` for one `date` (YYYY-MM-DD) into `oe_metrics_daily` (per-day per-chain) and refreshes `oe_chain_metrics` (cumulative per-chain snapshot). It uses `env.DB.batch()` for the writes (national-scale discipline). `open_count`/`terminal_count` in `oe_chain_metrics` need per-chain *state* (a read off the live chain tables / replicas) which is a W6/W7 insights deliverable — this rollup leaves them at 0 and populates the event-derivable columns (`value_total_zar`, `breach_count`, `last_event_at`).

- [ ] **Step 1: Write the failing test**

Create `tests/metrics-rollup.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { rollupMetrics } from '../src/utils/metrics-rollup';

let db: Database.Database;
let env: any;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function seedEvent(row: Record<string, unknown>) {
  const base = { id: `pev_${Math.random().toString(36).slice(2)}`, event: 'x', chain_key: 'demo',
    entity_type: 'demo', entity_id: 'e1', actor_id: 'a', source_chain_status: null,
    affected_roles: '[]', entity_value: 0, data_json: '{}', occurred_at: '2026-06-05T10:00:00.000Z' };
  const r = { ...base, ...row };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO oe_platform_events (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(...cols.map(c => (r as any)[c]));
}

describe('metrics-rollup', () => {
  it('aggregates a day into oe_metrics_daily per chain', async () => {
    seedEvent({ chain_key: 'ppa', entity_value: 100, occurred_at: '2026-06-05T08:00:00.000Z' });
    seedEvent({ chain_key: 'ppa', entity_value: 50,  occurred_at: '2026-06-05T09:00:00.000Z' });
    seedEvent({ chain_key: 'levy', entity_value: 10, occurred_at: '2026-06-05T09:00:00.000Z', event: 'levy.sla_breached' });
    seedEvent({ chain_key: 'levy', entity_value: 0,  occurred_at: '2026-06-05T11:00:00.000Z', affected_roles: '["regulator","lender"]' });

    await rollupMetrics(env, '2026-06-05');

    const ppa = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='ppa'`).get() as any;
    expect(ppa.events_count).toBe(2);
    expect(ppa.value_total_zar).toBeCloseTo(150, 6);

    const levy = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='levy'`).get() as any;
    expect(levy.events_count).toBe(2);
    expect(levy.sla_breaches).toBe(1);          // event LIKE %sla_breach%
    expect(levy.regulator_crossings).toBe(1);   // affected_roles contains regulator
  });

  it('refreshes oe_chain_metrics cumulative snapshot', async () => {
    seedEvent({ chain_key: 'ppa', entity_value: 100, occurred_at: '2026-06-05T08:00:00.000Z' });
    await rollupMetrics(env, '2026-06-05');
    const snap = db.prepare(`SELECT * FROM oe_chain_metrics WHERE chain_key='ppa'`).get() as any;
    expect(snap.value_total_zar).toBeCloseTo(100, 6);
    expect(snap.last_event_at).toBe('2026-06-05T08:00:00.000Z');
  });

  it('is idempotent — re-running the same date does not double-count', async () => {
    seedEvent({ chain_key: 'ppa', entity_value: 100, occurred_at: '2026-06-05T08:00:00.000Z' });
    await rollupMetrics(env, '2026-06-05');
    await rollupMetrics(env, '2026-06-05');
    const ppa = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='ppa'`).get() as any;
    expect(ppa.events_count).toBe(1);
    expect(ppa.value_total_zar).toBeCloseTo(100, 6);
    const cnt = db.prepare(`SELECT COUNT(*) n FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='ppa'`).get() as any;
    expect(cnt.n).toBe(1); // UNIQUE(metric_date, chain_key) upsert
  });

  it('buckets NULL/empty chain_key as unattributed', async () => {
    seedEvent({ chain_key: null, entity_value: 7, occurred_at: '2026-06-05T08:00:00.000Z' });
    await rollupMetrics(env, '2026-06-05');
    const row = db.prepare(`SELECT * FROM oe_metrics_daily WHERE metric_date='2026-06-05' AND chain_key='unattributed'`).get() as any;
    expect(row.value_total_zar).toBeCloseTo(7, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/metrics-rollup.test.ts`
Expected: FAIL — `../src/utils/metrics-rollup` does not exist.

- [ ] **Step 3: Write `src/utils/metrics-rollup.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer D — metrics rollup. Aggregates the append-only oe_platform_events sink
// into the pre-aggregated rollup tables (oe_metrics_daily per-day-per-chain,
// oe_chain_metrics cumulative snapshot) so dashboards read cheap rollups, never
// the raw event log, at national scale. Run nightly from the 5 0 * * * cron over
// 'yesterday'. Idempotent: re-running a date upserts on UNIQUE(metric_date,
// chain_key). Uses env.DB.batch() for the writes.
//
// open_count / terminal_count in oe_chain_metrics require per-chain state read
// off the live chain tables (a W6/W7 insights deliverable, read off replicas);
// this rollup leaves them 0 and fills the event-derivable columns.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoEnv } from './types';

type DB = HonoEnv['Bindings']['DB'];

interface DailyAgg {
  chain_key: string;
  events_count: number;
  value_total_zar: number;
  sla_breaches: number;
  regulator_crossings: number;
}

export async function rollupMetrics(
  env: HonoEnv['Bindings'],
  date: string, // YYYY-MM-DD
): Promise<{ date: string; chains: number; events: number }> {
  const db: DB = env.DB;

  // 1. Daily per-chain aggregate for `date`.
  const agg = await db.prepare(
    `SELECT COALESCE(NULLIF(chain_key, ''), 'unattributed') AS chain_key,
            COUNT(*) AS events_count,
            COALESCE(SUM(entity_value), 0) AS value_total_zar,
            SUM(CASE WHEN event LIKE '%sla_breach%' THEN 1 ELSE 0 END) AS sla_breaches,
            SUM(CASE WHEN affected_roles LIKE '%regulator%' THEN 1 ELSE 0 END) AS regulator_crossings
       FROM oe_platform_events
      WHERE substr(occurred_at, 1, 10) = ?
      GROUP BY COALESCE(NULLIF(chain_key, ''), 'unattributed')`,
  ).bind(date).all<DailyAgg>();

  const rows = (agg.results || []) as DailyAgg[];
  if (rows.length === 0) return { date, chains: 0, events: 0 };

  // 2. Upsert oe_metrics_daily. Deterministic id keeps re-runs single-row.
  const dailyStmts = rows.map((r) =>
    db.prepare(
      `INSERT INTO oe_metrics_daily
         (id, metric_date, chain_key, events_count, value_total_zar, sla_breaches, regulator_crossings)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(metric_date, chain_key) DO UPDATE SET
         events_count = excluded.events_count,
         value_total_zar = excluded.value_total_zar,
         sla_breaches = excluded.sla_breaches,
         regulator_crossings = excluded.regulator_crossings`,
    ).bind(
      `md_${date}_${r.chain_key}`, date, r.chain_key,
      r.events_count, r.value_total_zar, r.sla_breaches, r.regulator_crossings,
    ),
  );
  await db.batch(dailyStmts);

  // 3. Refresh oe_chain_metrics for the chains touched today: cumulative value +
  //    breaches off oe_metrics_daily, last_event_at off the raw events.
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
    snapStmts.push(
      db.prepare(
        `INSERT INTO oe_chain_metrics
           (chain_key, open_count, terminal_count, breach_count, value_total_zar, last_event_at, updated_at)
         VALUES (?, 0, 0, ?, ?, ?, ?)
         ON CONFLICT(chain_key) DO UPDATE SET
           breach_count = excluded.breach_count,
           value_total_zar = excluded.value_total_zar,
           last_event_at = excluded.last_event_at,
           updated_at = excluded.updated_at`,
      ).bind(ck, Number(cum?.breach_count || 0), Number(cum?.value_total_zar || 0), last?.last_event_at ?? null, now),
    );
  }
  await db.batch(snapStmts);

  const events = rows.reduce((s, r) => s + r.events_count, 0);
  return { date, chains: rows.length, events };
}
```

> Note on `db.batch`: **verified present** — `tests/helpers/d1-sqlite.ts:139-154` already implements `batch(statements)` (executes each statement's `.run()` sequentially, matching the D1 contract). The prepared-and-bound statements produced by `db.prepare(sql).bind(...)` carry the `.run()` method `batch` calls. Do **not** modify the helper. On real Cloudflare D1, `batch()` runs in a transaction and cannot read results mid-batch — `rollupMetrics` respects this: the per-chain `SELECT`s for the cumulative snapshot run as separate awaited `.first()` calls *between* the two `batch()` writes, never inside one.

- [ ] **Step 4: Wire into the existing `5 0 * * *` cron case in `src/index.ts`**

Add the import alongside other util imports near the top of `src/index.ts`:

```typescript
import { rollupMetrics } from './utils/metrics-rollup';
```

In `runCron`, inside `case '5 0 * * *':`, add this line immediately before that case's `break;` (around `src/index.ts:3867`, after the `transmission_outage_window_monitor` block). `yesterday` (YYYY-MM-DD) is already in scope at `src/index.ts:1272`:

```typescript
      // Layer D — roll yesterday's platform-event stream into the daily +
      // cumulative rollup tables the dashboards read (never the raw log).
      await safe('metrics_rollup', () => rollupMetrics(env, yesterday));
```

- [ ] **Step 5: Run tests + type-check**

Run: `cd open-energy-platform && npx vitest run tests/metrics-rollup.test.ts && npm run check`
Expected: PASS (4 rollup cases) and tsc clean.

- [ ] **Step 6: Verify the cron case still dry-runs**

Run: `cd open-energy-platform && npx vitest run tests/cascade-wiring.test.ts tests/fee-engine.test.ts tests/fee-schedule-seed.test.ts tests/admin-revenue.test.ts tests/metrics-rollup.test.ts`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
cd open-energy-platform
git add src/utils/metrics-rollup.ts src/index.ts
git commit -m "feat(W4): metrics-rollup util + nightly cron wiring (oe_metrics_daily/oe_chain_metrics)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full-suite integration verification

**Files:** none (verification only)

- [ ] **Step 1: Backend type-check**

Run: `cd open-energy-platform && npm run check`
Expected: tsc clean (no errors).

- [ ] **Step 2: Full backend test suite**

Run: `cd open-energy-platform && npm test`
Expected: all suites pass (the prior baseline plus the new `fee-schedule-seed`, extended `fee-engine`, `admin-revenue`, `metrics-rollup` cases). No regression in `cascade-wiring`, `analytics-sink`, `settlement-fees`, `trade-fees`.

- [ ] **Step 3: Confirm the no-touch constraint held**

Run: `cd open-energy-platform && git diff --name-only main...HEAD | grep -E '(-chain|-spec)\.ts$|cascade\.ts$|wrangler\.toml$' || echo "clean — no chain/spec/cascade/wrangler edits"`
Expected: `clean — no chain/spec/cascade/wrangler edits`.

- [ ] **Step 4: Final code review**

Dispatch the final code-reviewer subagent over the whole W4 diff (`git diff main...HEAD -- open-energy-platform/migrations/481* open-energy-platform/src/utils/fee-engine.ts open-energy-platform/src/routes/admin-revenue.ts open-energy-platform/src/utils/metrics-rollup.ts open-energy-platform/src/index.ts`), then proceed to `superpowers:finishing-a-development-branch`.

---

## Self-review (author checklist — completed)

- **Spec coverage:** blueprint W4 line 215 = "Commercial intercept (all-free seed + payer_role/payer_resolution) + admin-revenue + analytics sink live + metrics-rollup cron." → all-free seed = Task 1; payer_role/payer_resolution (+ splits) = Task 2; admin-revenue = Task 3; metrics-rollup cron = Task 4. Analytics sink is already live (W1, proven by `cascade-wiring.test.ts`) — confirmed, no new work. Leakage / by-event / by-role / top-events / ARR (blueprint revenue-analytics line) = Task 3.
- **Constraints honoured:** no `*-chain.ts`/`*-spec.ts`/`cascade.ts`/`wrangler.toml` edits (cron attaches to the existing `5 0 * * *` case; the metrics-rollup trigger already fires daily). Migration 481 is additive (`ADD COLUMN` + `INSERT OR IGNORE`). All seed rows free.
- **Locked tests preserved:** the engine gate `!commercial && !row → return` is retained (preserves `fee-engine.test.ts:70`); commercial-present + no-row still records R0 waived (preserves `cascade-wiring.test.ts:31`); `audit.event_appended` suppression is upstream in `cascade.ts` (untouched).
- **Type consistency:** `FeeScheduleRow.split_config` matches migration 481's column; `share_pct` is a 0..1 fraction in seed, `writeSplits`, and `oe_revenue_splits` alike; `rollupMetrics(env, date)` signature matches the cron call; `oe_metrics_daily`/`oe_chain_metrics` column names match migration 479.
- **Placeholder scan:** none — every step carries real code/SQL/commands. The two former "inspect first" notes are now resolved: Task 3 uses the verified `signToken` + seeded-participant auth pattern (`getCurrentUser` reads `c.get('auth').user`); Task 4 confirms `db.batch` is already implemented in the test harness.
- **Deferred (out of scope, noted):** per-event `SELECT` → KV cache of billable trigger_events (W7); commercial stage `ctx.waitUntil` fire-and-forget refactor (W7, would change DLQ semantics the wiring test locks); `oe_chain_metrics.open_count/terminal_count` (W6/W7, needs chain-state read off replicas); enriching more chains to pass `ctx.commercial` (chains are frozen — value derivation from `ctx.data` covers the gap).
