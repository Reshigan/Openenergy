# Ecosystem Foundation (Week 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the four-layer plumbing (Event/Registry, Commercial, Cross-Role, Analytics) on top of the existing `fireCascade()` god node, with zero change to user-visible behaviour — registry runs as a no-op (no rules yet), fees record at R0 (all-free), role-queue + analytics sink capture events. Everything else builds on this.

**Architecture:** Five additive migrations (475–479) create the backing tables. Five new util modules attach to `fireCascade` as error-isolated stages that run *after* the legacy `handleSpecialCascades` switch (both coexist). A canonical `PlatformEvent` field-set is added to `CascadeContext` (all optional → every existing caller still compiles). A Queue binding is added *optionally* so the production path can go async at national scale, but code degrades to inline execution when the binding is absent (tests + current prod).

**Tech Stack:** TypeScript, Cloudflare Workers, Hono, D1 (SQLite), vitest (`node` env), better-sqlite3 test façade.

**Conventions locked from the codebase:**
- Migrations: `CREATE TABLE IF NOT EXISTS`, `TEXT PRIMARY KEY`, `REAL` money, `INTEGER` bools/counts, `TEXT NOT NULL DEFAULT (datetime('now'))`, `CHECK(... IN (...))` enums, index name `idx_{table}_{cols}`. Next free number = **475** (474 = W228).
- Tests live in `tests/**/*.test.ts`. Build a real SQLite env with `createTestDb({ applyMigrations: true })` + `envFor(db)` from `tests/helpers/d1-sqlite.ts`. The façade implements `prepare().bind().run()/.first()/.all()` and `batch()`; `KV` is stubbed.
- D1 access: `env.DB.prepare(sql).bind(...).all<T>() / .first<T>() / .run()`.
- Locked decisions (2026-06-06): cross-impact = unattended-by-default, safety-gated; fees ship ALL FREE (`is_enabled=0`, record R0 `waived`); scale = national full; payer is per-fee (`payer_role` + `payer_resolution`); auto-progressed actions use actor `system:cascade`.

---

## File Structure

| File | Responsibility |
|---|---|
| `migrations/475_layerB_revenue.sql` | `oe_fee_schedule`, `oe_platform_revenue`, `oe_revenue_splits` |
| `migrations/476_layerC_role_queue.sql` | `oe_role_action_queue` |
| `migrations/477_layerA_cascade_audit.sql` | `oe_cascade_rule_audit`, `oe_algo_trading_blocks` |
| `migrations/478_layerD_events.sql` | `oe_platform_events` (analytics sink) |
| `migrations/479_layerD_metrics.sql` | `oe_metrics_daily`, `oe_chain_metrics` (rollup) |
| `src/utils/platform-event.ts` | `PlatformRole`, `CommercialContext`, `PlatformEventFields`, `ALL_ROLES` — the canonical contract, zero deps |
| `src/utils/cascade-registry.ts` | `CascadeRule`, `registerCascadeRule`, `runCascadeRegistry` (Layer A) |
| `src/cascade-rules/index.ts` | Barrel of rule files (empty in W1 → registry is a no-op) |
| `src/utils/fee-engine.ts` | `computeAndRecordFee` (Layer B) |
| `src/utils/role-actions.ts` | `pushRoleAction`, `pendingCountForRole` (Layer C) |
| `src/utils/analytics-sink.ts` | `recordPlatformEvent` (Layer D) |
| `src/utils/cascade.ts` | Extend+export `CascadeContext`; wire 3 new stages at end of `fireCascade` |
| `src/utils/types.ts` | Add optional `QUEUE?: Queue` to `HonoBindings` |
| `src/index.ts` | Side-effect import `'./cascade-rules'` so rules register at boot |
| `wrangler.toml` | Commented `[[queues.producers]]` block (provisioning instructions, inactive) |

---

## Task 1: Migration 475 — Layer B revenue tables

**Files:**
- Create: `open-energy-platform/migrations/475_layerB_revenue.sql`
- Test: `open-energy-platform/tests/ecosystem-foundation-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/ecosystem-foundation-schema.test.ts`:

```typescript
// Week-1 foundation — schema presence + shape tests. Proves migrations
// 475–479 apply cleanly via the real SQLite façade and expose the columns
// the Layer A/B/C/D utils depend on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';

let db: Database.Database;

beforeAll(() => { db = createTestDb({ applyMigrations: true }); });
afterAll(() => { db.close(); });

function columns(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(r => r.name);
}

describe('migration 475 — Layer B revenue', () => {
  it('oe_fee_schedule exists with required columns', () => {
    const cols = columns('oe_fee_schedule');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'trigger_event', 'fee_type', 'rate', 'min_fee_zar', 'max_fee_zar',
      'applicable_tiers', 'payer_role', 'payer_resolution', 'is_enabled', 'description',
    ]));
  });

  it('oe_platform_revenue exists with required columns', () => {
    const cols = columns('oe_platform_revenue');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'trigger_event', 'entity_id', 'entity_type', 'participant_id', 'payer_role',
      'entity_value', 'fee_zar', 'fee_schedule_id', 'billing_period', 'invoice_id', 'status', 'recorded_at',
    ]));
  });

  it('oe_revenue_splits exists with required columns', () => {
    const cols = columns('oe_revenue_splits');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'revenue_id', 'party_role', 'party_id', 'share_pct', 'amount_zar',
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 475"`
Expected: FAIL — `no such table: oe_fee_schedule`.

- [ ] **Step 3: Write the migration**

Create `open-energy-platform/migrations/475_layerB_revenue.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 475 — Ecosystem Layer B: Commercial Intercept
-- Fee schedule (config), recorded platform revenue, and per-party splits.
-- Fees ship ALL FREE: oe_fee_schedule rows default is_enabled=0; the engine
-- records R0 'waived' revenue until an operator flips a row on (no deploy).
-- Payer is per-fee: payer_role + payer_resolution(initiator|beneficiary|split|platform).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_fee_schedule (
  id TEXT PRIMARY KEY,
  trigger_event TEXT NOT NULL UNIQUE,        -- the PlatformEvent that bills (e.g. ppa_evt_activated)
  fee_type TEXT NOT NULL CHECK(fee_type IN ('bps','flat_zar','pct')),
  rate REAL NOT NULL DEFAULT 0,              -- bps: basis points; flat_zar: ZAR; pct: 0..1
  min_fee_zar REAL DEFAULT 0,
  max_fee_zar REAL,                          -- NULL = uncapped
  applicable_tiers TEXT DEFAULT '[]',        -- JSON array of tier strings; [] = all
  payer_role TEXT,                           -- explicit payer when resolution=initiator override
  payer_resolution TEXT NOT NULL DEFAULT 'initiator'
    CHECK(payer_resolution IN ('initiator','beneficiary','split','platform')),
  is_enabled INTEGER NOT NULL DEFAULT 0,     -- ALL FREE at launch
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_platform_revenue (
  id TEXT PRIMARY KEY,
  trigger_event TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT,
  participant_id TEXT,
  payer_role TEXT,
  entity_value REAL,                         -- the ZAR value the fee was computed against
  fee_zar REAL NOT NULL DEFAULT 0,
  fee_schedule_id TEXT,
  billing_period TEXT,                       -- YYYY-MM
  invoice_id TEXT,                           -- set when rolled into a subscription invoice
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','invoiced','paid','waived')),
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_revenue_period
  ON oe_platform_revenue(billing_period, status);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_participant
  ON oe_platform_revenue(participant_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_event
  ON oe_platform_revenue(trigger_event, recorded_at);

CREATE TABLE IF NOT EXISTS oe_revenue_splits (
  id TEXT PRIMARY KEY,
  revenue_id TEXT NOT NULL,
  party_role TEXT NOT NULL,
  party_id TEXT,
  share_pct REAL NOT NULL,                   -- 0..1
  amount_zar REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_revenue_splits_revenue
  ON oe_revenue_splits(revenue_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 475"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add migrations/475_layerB_revenue.sql tests/ecosystem-foundation-schema.test.ts && git commit -m "feat(ecosystem): migration 475 — Layer B revenue tables"
```

---

## Task 2: Migration 476 — Layer C role action queue

**Files:**
- Create: `open-energy-platform/migrations/476_layerC_role_queue.sql`
- Test: `open-energy-platform/tests/ecosystem-foundation-schema.test.ts` (append)

- [ ] **Step 1: Add the failing test** (append inside the file, after the 475 `describe`)

```typescript
describe('migration 476 — Layer C role queue', () => {
  it('oe_role_action_queue exists with required columns', () => {
    const cols = columns('oe_role_action_queue');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'target_role', 'target_participant_id', 'source_event', 'source_chain_key',
      'source_entity_type', 'source_entity_id', 'title', 'body_json', 'cross_option_json',
      'priority', 'status', 'sla_due_at', 'actioned_by', 'actioned_at',
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 476"`
Expected: FAIL — `no such table: oe_role_action_queue`.

- [ ] **Step 3: Write the migration**

Create `open-energy-platform/migrations/476_layerC_role_queue.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 476 — Ecosystem Layer C: Cross-Role Push
-- Generalises the regulator-only oe_regulator_inbox to all 9 roles. Every
-- workstation reads its pending rows; completing one surfaces a cross-option.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_role_action_queue (
  id TEXT PRIMARY KEY,
  target_role TEXT NOT NULL,                 -- PlatformRole that must act
  target_participant_id TEXT,                -- optional: narrow to one participant
  source_event TEXT NOT NULL,
  source_chain_key TEXT,
  source_entity_type TEXT,
  source_entity_id TEXT,
  title TEXT NOT NULL,
  body_json TEXT DEFAULT '{}',
  cross_option_json TEXT,                    -- {action_label, target_route, prefill} for 1-click next step
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK(priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','acknowledged','actioned','dismissed','expired')),
  sla_due_at TEXT,
  actioned_by TEXT,
  actioned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_role_queue_role_status
  ON oe_role_action_queue(target_role, status);
CREATE INDEX IF NOT EXISTS idx_role_queue_participant_status
  ON oe_role_action_queue(target_participant_id, status);
CREATE INDEX IF NOT EXISTS idx_role_queue_source
  ON oe_role_action_queue(source_entity_type, source_entity_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 476"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add migrations/476_layerC_role_queue.sql tests/ecosystem-foundation-schema.test.ts && git commit -m "feat(ecosystem): migration 476 — Layer C role action queue"
```

---

## Task 3: Migration 477 — Layer A cascade audit + algo blocks

**Files:**
- Create: `open-energy-platform/migrations/477_layerA_cascade_audit.sql`
- Test: `open-energy-platform/tests/ecosystem-foundation-schema.test.ts` (append)

- [ ] **Step 1: Add the failing test**

```typescript
describe('migration 477 — Layer A cascade audit', () => {
  it('oe_cascade_rule_audit exists with required columns', () => {
    const cols = columns('oe_cascade_rule_audit');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'rule_id', 'source_event', 'source_entity_type', 'source_entity_id', 'mode', 'outcome', 'detail',
    ]));
  });
  it('oe_algo_trading_blocks exists with required columns', () => {
    const cols = columns('oe_algo_trading_blocks');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'participant_id', 'algo_cert_id', 'block_reason', 'source_event', 'is_active', 'lifted_at', 'lifted_by',
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 477"`
Expected: FAIL — `no such table: oe_cascade_rule_audit`.

- [ ] **Step 3: Write the migration**

Create `open-energy-platform/migrations/477_layerA_cascade_audit.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 477 — Ecosystem Layer A: cascade-rule audit + algo trading blocks
-- oe_cascade_rule_audit: one row per registry rule evaluation (ran/skipped/
--   blocked/error) — observability for the new event bus.
-- oe_algo_trading_blocks: a kill-switch/cert-failure block list the pre-trade
--   guard reads (W2 wires the guard; the table lands now so the seam exists).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_cascade_rule_audit (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  source_event TEXT NOT NULL,
  source_entity_type TEXT,
  source_entity_id TEXT,
  mode TEXT,                                 -- drive | block
  outcome TEXT NOT NULL CHECK(outcome IN ('ran','skipped','blocked','error')),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cascade_rule_audit_rule
  ON oe_cascade_rule_audit(rule_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cascade_rule_audit_source
  ON oe_cascade_rule_audit(source_entity_type, source_entity_id);

CREATE TABLE IF NOT EXISTS oe_algo_trading_blocks (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  algo_cert_id TEXT,
  block_reason TEXT NOT NULL,
  source_event TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  lifted_at TEXT,
  lifted_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_algo_blocks_participant
  ON oe_algo_trading_blocks(participant_id, is_active);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 477"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add migrations/477_layerA_cascade_audit.sql tests/ecosystem-foundation-schema.test.ts && git commit -m "feat(ecosystem): migration 477 — Layer A cascade audit + algo blocks"
```

---

## Task 4: Migration 478 — Layer D analytics event sink

**Files:**
- Create: `open-energy-platform/migrations/478_layerD_events.sql`
- Test: `open-energy-platform/tests/ecosystem-foundation-schema.test.ts` (append)

- [ ] **Step 1: Add the failing test**

```typescript
describe('migration 478 — Layer D event sink', () => {
  it('oe_platform_events exists with required columns', () => {
    const cols = columns('oe_platform_events');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'event', 'chain_key', 'entity_type', 'entity_id', 'actor_id',
      'source_chain_status', 'affected_roles', 'entity_value', 'data_json', 'occurred_at',
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 478"`
Expected: FAIL — `no such table: oe_platform_events`.

- [ ] **Step 3: Write the migration**

Create `open-energy-platform/migrations/478_layerD_events.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 478 — Ecosystem Layer D: analytics event sink
-- Append-only log of every PlatformEvent. The nightly rollup cron aggregates
-- this into oe_metrics_daily / oe_chain_metrics (migration 479). Dashboards
-- read rollups, never this raw table, so it can grow + be R2-archived monthly.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_platform_events (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  chain_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  actor_id TEXT,
  source_chain_status TEXT,
  affected_roles TEXT,                       -- JSON array of PlatformRole
  entity_value REAL,
  data_json TEXT DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_events_event
  ON oe_platform_events(event, occurred_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_chain
  ON oe_platform_events(chain_key, occurred_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_entity
  ON oe_platform_events(entity_type, entity_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 478"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add migrations/478_layerD_events.sql tests/ecosystem-foundation-schema.test.ts && git commit -m "feat(ecosystem): migration 478 — Layer D analytics event sink"
```

---

## Task 5: Migration 479 — Layer D rollup tables

**Files:**
- Create: `open-energy-platform/migrations/479_layerD_metrics.sql`
- Test: `open-energy-platform/tests/ecosystem-foundation-schema.test.ts` (append)

- [ ] **Step 1: Add the failing test**

```typescript
describe('migration 479 — Layer D rollups', () => {
  it('oe_metrics_daily exists with required columns', () => {
    const cols = columns('oe_metrics_daily');
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'metric_date', 'chain_key', 'events_count', 'value_total_zar', 'sla_breaches', 'regulator_crossings',
    ]));
  });
  it('oe_chain_metrics exists with required columns', () => {
    const cols = columns('oe_chain_metrics');
    expect(cols).toEqual(expect.arrayContaining([
      'chain_key', 'open_count', 'terminal_count', 'breach_count', 'value_total_zar', 'last_event_at',
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts -t "migration 479"`
Expected: FAIL — `no such table: oe_metrics_daily`.

- [ ] **Step 3: Write the migration**

Create `open-energy-platform/migrations/479_layerD_metrics.sql`:

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 479 — Ecosystem Layer D: pre-aggregated rollups
-- oe_metrics_daily: per-day per-chain aggregates (events, value, breaches).
-- oe_chain_metrics: rolling current snapshot per chain (open/terminal/breach).
-- Refreshed by the nightly metrics-rollup cron (wired in Week 4).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_metrics_daily (
  id TEXT PRIMARY KEY,
  metric_date TEXT NOT NULL,                 -- YYYY-MM-DD
  chain_key TEXT NOT NULL,
  events_count INTEGER NOT NULL DEFAULT 0,
  value_total_zar REAL NOT NULL DEFAULT 0,
  sla_breaches INTEGER NOT NULL DEFAULT 0,
  regulator_crossings INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(metric_date, chain_key)
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_date
  ON oe_metrics_daily(metric_date);

CREATE TABLE IF NOT EXISTS oe_chain_metrics (
  chain_key TEXT PRIMARY KEY,
  open_count INTEGER NOT NULL DEFAULT 0,
  terminal_count INTEGER NOT NULL DEFAULT 0,
  breach_count INTEGER NOT NULL DEFAULT 0,
  value_total_zar REAL NOT NULL DEFAULT 0,
  last_event_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/ecosystem-foundation-schema.test.ts`
Expected: PASS (all schema tests, migrations 475–479).

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add migrations/479_layerD_metrics.sql tests/ecosystem-foundation-schema.test.ts && git commit -m "feat(ecosystem): migration 479 — Layer D rollup tables"
```

---

## Task 6: `platform-event.ts` — the canonical contract

**Files:**
- Create: `open-energy-platform/src/utils/platform-event.ts`
- Test: `open-energy-platform/tests/platform-event.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/platform-event.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ALL_ROLES, isPlatformRole, type PlatformRole } from '../src/utils/platform-event';

describe('platform-event contract', () => {
  it('ALL_ROLES has the 9 canonical roles', () => {
    expect(ALL_ROLES).toEqual([
      'admin', 'ipp_developer', 'trader', 'lender', 'offtaker',
      'carbon_fund', 'grid_operator', 'regulator', 'support',
    ]);
  });

  it('isPlatformRole accepts a canonical role', () => {
    expect(isPlatformRole('lender')).toBe(true);
  });

  it('isPlatformRole rejects an unknown role', () => {
    expect(isPlatformRole('wizard')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/platform-event.test.ts`
Expected: FAIL — cannot find module `../src/utils/platform-event`.

- [ ] **Step 3: Write the implementation**

Create `open-energy-platform/src/utils/platform-event.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// PlatformEvent — the canonical cross-platform event contract.
//
// Every state transition fires a fireCascade(ctx) where ctx now carries these
// optional PlatformEventFields. They are what the four ecosystem layers read:
//   Layer A (cascade-registry) routes on `chain_key` + `event`
//   Layer C (role-actions)     pushes to `affected_roles`
//   Layer B (fee-engine)       prices `commercial`
//   Layer D (analytics-sink)   logs the lot
// Zero runtime deps so cascade.ts and every layer can import the types freely.
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_ROLES = [
  'admin', 'ipp_developer', 'trader', 'lender', 'offtaker',
  'carbon_fund', 'grid_operator', 'regulator', 'support',
] as const;

export type PlatformRole = (typeof ALL_ROLES)[number];

export function isPlatformRole(x: unknown): x is PlatformRole {
  return typeof x === 'string' && (ALL_ROLES as readonly string[]).includes(x);
}

// Commercial context for Layer B. entity_value is the ZAR figure a fee is
// computed against (tranche size, credit value, notional). participant_id is
// the default payer when payer_resolution = 'initiator'.
export interface CommercialContext {
  entity_value?: number;
  participant_id?: string;
  billing_period?: string;   // YYYY-MM; defaults to the current month at record time
  tier?: string;             // chain tier, matched against fee_schedule.applicable_tiers
}

// Optional fields layered onto CascadeContext. All optional → every existing
// fireCascade caller compiles unchanged.
export interface PlatformEventFields {
  chain_key?: string;            // e.g. 'ppa_contract' (W22) — Layer A routing key
  source_chain_status?: string;  // the chain_status this transition landed in
  affected_roles?: PlatformRole[];
  cross_impact_hint?: string;    // human string for the cross-option card
  commercial?: CommercialContext;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/platform-event.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add src/utils/platform-event.ts tests/platform-event.test.ts && git commit -m "feat(ecosystem): platform-event canonical contract"
```

---

## Task 7: Extend + export `CascadeContext`

**Files:**
- Modify: `open-energy-platform/src/utils/cascade.ts:2004-2019` (the `CascadeContext` interface)

- [ ] **Step 1: Read the current interface**

Run: `cd open-energy-platform && sed -n '2000,2020p' src/utils/cascade.ts`
Expected: shows `interface CascadeContext { ... skipAudit?: boolean; }`.

- [ ] **Step 2: Add the import at the top of cascade.ts**

Find the import block (cascade.ts:4-6). Add after the last existing import:

```typescript
import type { PlatformEventFields } from './platform-event';
```

- [ ] **Step 3: Extend and export the interface**

Replace the interface declaration line `interface CascadeContext {` with:

```typescript
export interface CascadeContext extends PlatformEventFields {
```

(Leave every existing field — `event`, `actor_id?`, `entity_type`, `entity_id`, `data?`, `env`, `skipAudit?` — exactly as-is. `extends PlatformEventFields` adds the five optional fields.)

- [ ] **Step 4: Type-check**

Run: `cd open-energy-platform && npm run check`
Expected: PASS — no errors (all new fields optional; `export` is additive).

- [ ] **Step 5: Run the full unit suite to prove nothing regressed**

Run: `cd open-energy-platform && npx vitest run`
Expected: PASS — existing test count unchanged + the new foundation tests.

- [ ] **Step 6: Commit**

```bash
cd open-energy-platform && git add src/utils/cascade.ts && git commit -m "feat(ecosystem): extend+export CascadeContext with PlatformEventFields"
```

---

## Task 8: `cascade-registry.ts` — Layer A

**Files:**
- Create: `open-energy-platform/src/utils/cascade-registry.ts`
- Test: `open-energy-platform/tests/cascade-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/cascade-registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';
import { envFor } from './helpers/d1-sqlite';
import {
  registerCascadeRule,
  runCascadeRegistry,
  _resetRegistryForTests,
  type CascadeRule,
} from '../src/utils/cascade-registry';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
});
afterEach(() => { db.close(); });

function ctx(event: string) {
  return { event, entity_type: 'demo', entity_id: 'e1', env } as any;
}

describe('cascade-registry', () => {
  it('runs a matching rule and audits outcome=ran', async () => {
    let ran = 0;
    const rule: CascadeRule = {
      id: 'demo.match',
      match: c => c.event === 'demo.go',
      run: async () => { ran++; },
    };
    registerCascadeRule(rule);
    await runCascadeRegistry(ctx('demo.go'));
    expect(ran).toBe(1);

    const audit = db.prepare(
      `SELECT rule_id, outcome FROM oe_cascade_rule_audit WHERE rule_id = 'demo.match'`,
    ).get() as { rule_id: string; outcome: string } | undefined;
    expect(audit?.outcome).toBe('ran');
  });

  it('skips a non-matching rule (no audit row)', async () => {
    registerCascadeRule({ id: 'demo.nope', match: c => c.event === 'other', run: async () => {} });
    await runCascadeRegistry(ctx('demo.go'));
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_cascade_rule_audit`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('isolates a throwing rule and audits outcome=error', async () => {
    registerCascadeRule({ id: 'demo.boom', match: () => true, run: async () => { throw new Error('x'); } });
    // Must not throw — registry is error-isolated.
    await runCascadeRegistry(ctx('demo.go'));
    const audit = db.prepare(
      `SELECT outcome FROM oe_cascade_rule_audit WHERE rule_id = 'demo.boom'`,
    ).get() as { outcome: string } | undefined;
    expect(audit?.outcome).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/cascade-registry.test.ts`
Expected: FAIL — cannot find module `../src/utils/cascade-registry`.

- [ ] **Step 3: Write the implementation**

Create `open-energy-platform/src/utils/cascade-registry.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer A — Cascade Registry.
// Self-registering rule files replace the 780-line handleSpecialCascades
// switch. Each rule declares match(ctx) + run(ctx). runCascadeRegistry() is
// invoked as a fireCascade stage; it evaluates every rule, runs matches,
// and writes an oe_cascade_rule_audit row per run. Error-isolated: a failing
// rule never breaks the cascade.
//   mode 'drive'  → reaction auto-progresses downstream (unattended default)
//   mode 'block'  → enforced upstream at the guard (W2); audited here as a hook
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

export interface CascadeRule {
  id: string;
  match: (ctx: CascadeContext) => boolean;
  run: (ctx: CascadeContext) => Promise<void>;
  mode?: 'drive' | 'block';
}

const REGISTRY: CascadeRule[] = [];

export function registerCascadeRule(rule: CascadeRule): void {
  if (REGISTRY.some(r => r.id === rule.id)) return; // idempotent under repeat imports
  REGISTRY.push(rule);
}

export function listCascadeRules(): ReadonlyArray<CascadeRule> {
  return REGISTRY;
}

/** Test-only: clears the global registry so each test starts clean. */
export function _resetRegistryForTests(): void {
  REGISTRY.length = 0;
}

function genId(): string {
  return `cra_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

async function auditOutcome(
  ctx: CascadeContext,
  rule: CascadeRule,
  outcome: 'ran' | 'blocked' | 'error',
  detail?: string,
): Promise<void> {
  try {
    await ctx.env.DB.prepare(
      `INSERT INTO oe_cascade_rule_audit
         (id, rule_id, source_event, source_entity_type, source_entity_id, mode, outcome, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      genId(), rule.id, ctx.event, ctx.entity_type, ctx.entity_id,
      rule.mode ?? 'drive', outcome, detail ?? null, new Date().toISOString(),
    ).run();
  } catch {
    /* audit is best-effort; never let it break the cascade */
  }
}

export async function runCascadeRegistry(ctx: CascadeContext): Promise<void> {
  for (const rule of REGISTRY) {
    let matched = false;
    try {
      matched = rule.match(ctx);
    } catch {
      matched = false;
    }
    if (!matched) continue;

    try {
      await rule.run(ctx);
      await auditOutcome(ctx, rule, 'ran');
    } catch (e) {
      await auditOutcome(ctx, rule, 'error', (e as Error).message);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/cascade-registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add src/utils/cascade-registry.ts tests/cascade-registry.test.ts && git commit -m "feat(ecosystem): Layer A cascade registry"
```

---

## Task 9: `cascade-rules/index.ts` — barrel (empty no-op for W1)

**Files:**
- Create: `open-energy-platform/src/cascade-rules/index.ts`

- [ ] **Step 1: Create the barrel**

Create `open-energy-platform/src/cascade-rules/index.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Cascade-rule barrel. Importing this module (side-effect) registers every
// rule with the Layer A registry. index.ts imports it once at boot so rules
// are live before any cascade fires.
//
// Week 1: intentionally empty — the registry is a safe no-op and platform
// behaviour is unchanged. Week 2+ adds one file per interaction here, e.g.:
//   import './cod-to-drawdown';     // #1  W20 → W21/W22
//   import './algo-kill-switch';    // #2  W60 → trading block
// Each rule file calls registerCascadeRule({...}) at module scope.
// ═══════════════════════════════════════════════════════════════════════════
export {}; // no rules yet
```

- [ ] **Step 2: Type-check**

Run: `cd open-energy-platform && npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd open-energy-platform && git add src/cascade-rules/index.ts && git commit -m "feat(ecosystem): cascade-rules barrel (empty no-op for W1)"
```

---

## Task 10: `fee-engine.ts` — Layer B

**Files:**
- Create: `open-energy-platform/src/utils/fee-engine.ts`
- Test: `open-energy-platform/tests/fee-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/fee-engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { computeAndRecordFee } from '../src/utils/fee-engine';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

function ctx(event: string, entity_value?: number, participant_id?: string) {
  return {
    event, entity_type: 'demo', entity_id: 'e1', env,
    commercial: { entity_value, participant_id, billing_period: '2026-06' },
  } as any;
}

function seedFee(row: Record<string, unknown>) {
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO oe_fee_schedule (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
  ).run(...cols.map(c => row[c]));
}

function revenue(): any {
  return db.prepare(`SELECT * FROM oe_platform_revenue ORDER BY recorded_at LIMIT 1`).get();
}

describe('fee-engine — all-free default', () => {
  it('records R0 waived when no schedule row exists', async () => {
    await computeAndRecordFee(ctx('demo.x', 1_000_000));
    const r = revenue();
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
  });

  it('records R0 waived when schedule row is disabled (is_enabled=0)', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 15, is_enabled: 0, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000));
    const r = revenue();
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
  });
});

describe('fee-engine — enabled fees', () => {
  it('computes bps fee = value * rate/10000 when enabled, status pending', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 15, is_enabled: 1, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000, 'par_1'));
    const r = revenue();
    expect(r.fee_zar).toBeCloseTo(1500, 6); // 1,000,000 * 15/10000
    expect(r.status).toBe('pending');
    expect(r.participant_id).toBe('par_1');
    expect(r.billing_period).toBe('2026-06');
  });

  it('applies a flat_zar fee', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'flat_zar', rate: 5000, is_enabled: 1, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 9_999));
    expect(revenue().fee_zar).toBe(5000);
  });

  it('clamps a bps fee to max_fee_zar', async () => {
    seedFee({ id: 'f1', trigger_event: 'demo.x', fee_type: 'bps', rate: 100, is_enabled: 1, max_fee_zar: 2000, payer_resolution: 'initiator' });
    await computeAndRecordFee(ctx('demo.x', 1_000_000)); // raw = 10,000 → clamp 2,000
    expect(revenue().fee_zar).toBe(2000);
  });

  it('does nothing (no row) when there is no commercial context', async () => {
    await computeAndRecordFee({ event: 'demo.x', entity_type: 'demo', entity_id: 'e1', env } as any);
    const count = db.prepare(`SELECT COUNT(*) n FROM oe_platform_revenue`).get() as { n: number };
    expect(count.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/fee-engine.test.ts`
Expected: FAIL — cannot find module `../src/utils/fee-engine`.

- [ ] **Step 3: Write the implementation**

Create `open-energy-platform/src/utils/fee-engine.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer B — Commercial Intercept.
// computeAndRecordFee(ctx) looks up oe_fee_schedule by trigger_event = ctx.event,
// computes the fee against ctx.commercial.entity_value, and writes an
// oe_platform_revenue row. ALL FREE at launch: if no schedule row OR the row is
// disabled, it records a R0 'waived' row (so the pipeline + reporting are proven
// end-to-end with zero billing risk). Error-isolated by the caller.
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
}

function genId(): string {
  return `rev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
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
  let f = fee;
  if (row.min_fee_zar != null && f < row.min_fee_zar) f = row.min_fee_zar;
  if (row.max_fee_zar != null && f > row.max_fee_zar) f = row.max_fee_zar;
  return f;
}

export async function computeAndRecordFee(ctx: CascadeContext): Promise<void> {
  const commercial = ctx.commercial;
  if (!commercial) return; // not a value-bearing transition

  const db = ctx.env.DB;
  const value = commercial.entity_value ?? 0;
  const period = commercial.billing_period ?? currentPeriod();

  const row = await db
    .prepare(`SELECT * FROM oe_fee_schedule WHERE trigger_event = ?`)
    .bind(ctx.event)
    .first<FeeScheduleRow>();

  let fee = 0;
  let status: 'pending' | 'waived' = 'waived';
  let scheduleId: string | null = null;
  let payerRole: string | null = null;

  if (row && row.is_enabled === 1) {
    fee = clamp(computeRawFee(row, value), row);
    status = 'pending';
    scheduleId = row.id;
    payerRole = row.payer_role ?? null;
  }

  await db.prepare(
    `INSERT INTO oe_platform_revenue
       (id, trigger_event, entity_id, entity_type, participant_id, payer_role,
        entity_value, fee_zar, fee_schedule_id, billing_period, status, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId(), ctx.event, ctx.entity_id, ctx.entity_type,
    commercial.participant_id ?? null, payerRole,
    value, fee, scheduleId, period, status, new Date().toISOString(),
  ).run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/fee-engine.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add src/utils/fee-engine.ts tests/fee-engine.test.ts && git commit -m "feat(ecosystem): Layer B fee engine (all-free default)"
```

---

## Task 11: `role-actions.ts` — Layer C

**Files:**
- Create: `open-energy-platform/src/utils/role-actions.ts`
- Test: `open-energy-platform/tests/role-actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/role-actions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { pushRoleAction, pendingCountForRole } from '../src/utils/role-actions';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

describe('role-actions', () => {
  it('pushRoleAction writes a pending row for the target role', async () => {
    await pushRoleAction(env, {
      target_role: 'lender',
      source_event: 'cod_evt_certified',
      source_chain_key: 'cod',
      source_entity_type: 'cod',
      source_entity_id: 'cod_1',
      title: 'Drawdown ready — authorize?',
      priority: 'high',
    });
    const row = db.prepare(
      `SELECT target_role, status, priority, title FROM oe_role_action_queue LIMIT 1`,
    ).get() as any;
    expect(row.target_role).toBe('lender');
    expect(row.status).toBe('pending');
    expect(row.priority).toBe('high');
    expect(row.title).toContain('Drawdown ready');
  });

  it('pendingCountForRole counts only pending rows for that role', async () => {
    await pushRoleAction(env, { target_role: 'lender', source_event: 'e', source_entity_type: 't', source_entity_id: 'a', title: 'A' });
    await pushRoleAction(env, { target_role: 'lender', source_event: 'e', source_entity_type: 't', source_entity_id: 'b', title: 'B' });
    await pushRoleAction(env, { target_role: 'offtaker', source_event: 'e', source_entity_type: 't', source_entity_id: 'c', title: 'C' });
    expect(await pendingCountForRole(env, 'lender')).toBe(2);
    expect(await pendingCountForRole(env, 'offtaker')).toBe(1);
    expect(await pendingCountForRole(env, 'trader')).toBe(0);
  });

  it('defaults priority to normal and status to pending', async () => {
    await pushRoleAction(env, { target_role: 'trader', source_event: 'e', source_entity_type: 't', source_entity_id: 'x', title: 'T' });
    const row = db.prepare(`SELECT priority, status FROM oe_role_action_queue LIMIT 1`).get() as any;
    expect(row.priority).toBe('normal');
    expect(row.status).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/role-actions.test.ts`
Expected: FAIL — cannot find module `../src/utils/role-actions`.

- [ ] **Step 3: Write the implementation**

Create `open-energy-platform/src/utils/role-actions.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer C — Cross-Role Push.
// pushRoleAction() writes a pending row to oe_role_action_queue so the target
// role's workstation IncomingPanel surfaces it. pendingCountForRole() reads the
// badge count, KV-cached (TTL 30s) so thousands of workstation polls don't
// hammer D1 at national scale; the cache is invalidated on every push.
// ═══════════════════════════════════════════════════════════════════════════
import type { HonoBindings } from './types';
import type { PlatformRole } from './platform-event';

export interface RoleActionInput {
  target_role: PlatformRole | string;
  target_participant_id?: string;
  source_event: string;
  source_chain_key?: string;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  body?: Record<string, unknown>;
  cross_option?: { action_label: string; target_route: string; prefill?: Record<string, unknown> };
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  sla_due_at?: string;
}

function genId(): string {
  return `raq_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function pendingCacheKey(role: string): string {
  return `role_queue_pending:${role}`;
}

export async function pushRoleAction(env: HonoBindings, input: RoleActionInput): Promise<string> {
  const id = genId();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO oe_role_action_queue
       (id, target_role, target_participant_id, source_event, source_chain_key,
        source_entity_type, source_entity_id, title, body_json, cross_option_json,
        priority, status, sla_due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
  ).bind(
    id, input.target_role, input.target_participant_id ?? null, input.source_event,
    input.source_chain_key ?? null, input.source_entity_type, input.source_entity_id,
    input.title, JSON.stringify(input.body ?? {}),
    input.cross_option ? JSON.stringify(input.cross_option) : null,
    input.priority ?? 'normal', input.sla_due_at ?? null, now, now,
  ).run();

  // Invalidate the cached pending count for this role.
  try { await env.KV?.delete(pendingCacheKey(String(input.target_role))); } catch { /* best-effort */ }

  return id;
}

export async function pendingCountForRole(env: HonoBindings, role: PlatformRole | string): Promise<number> {
  const key = pendingCacheKey(String(role));

  // KV fast path.
  try {
    const cached = await env.KV?.get(key);
    if (cached != null) return parseInt(cached, 10) || 0;
  } catch { /* fall through to D1 */ }

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM oe_role_action_queue WHERE target_role = ? AND status = 'pending'`,
  ).bind(role).first<{ n: number }>();
  const count = row?.n ?? 0;

  try { await env.KV?.put(key, String(count), { expirationTtl: 30 }); } catch { /* best-effort */ }
  return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/role-actions.test.ts`
Expected: PASS (3 tests). (The KV stub returns null on `get`, so the D1 path runs and counts correctly.)

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add src/utils/role-actions.ts tests/role-actions.test.ts && git commit -m "feat(ecosystem): Layer C role-actions (KV-cached pending counts)"
```

---

## Task 12: `analytics-sink.ts` — Layer D

**Files:**
- Create: `open-energy-platform/src/utils/analytics-sink.ts`
- Test: `open-energy-platform/tests/analytics-sink.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/analytics-sink.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { recordPlatformEvent } from '../src/utils/analytics-sink';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => { db.close(); });

describe('analytics-sink', () => {
  it('appends a platform event row with chain_key + affected_roles', async () => {
    await recordPlatformEvent({
      event: 'ppa_evt_activated',
      actor_id: 'system:cascade',
      entity_type: 'ppa_contract',
      entity_id: 'ppa_1',
      env,
      chain_key: 'ppa_contract',
      source_chain_status: 'active',
      affected_roles: ['offtaker', 'ipp_developer'],
      commercial: { entity_value: 2_500_000 },
      data: { foo: 'bar' },
    } as any);

    const row = db.prepare(`SELECT * FROM oe_platform_events LIMIT 1`).get() as any;
    expect(row.event).toBe('ppa_evt_activated');
    expect(row.chain_key).toBe('ppa_contract');
    expect(row.entity_value).toBe(2_500_000);
    expect(JSON.parse(row.affected_roles)).toEqual(['offtaker', 'ipp_developer']);
    expect(JSON.parse(row.data_json).foo).toBe('bar');
  });

  it('handles a minimal event (no chain_key / commercial)', async () => {
    await recordPlatformEvent({ event: 'demo.x', entity_type: 't', entity_id: 'e1', env } as any);
    const row = db.prepare(`SELECT * FROM oe_platform_events LIMIT 1`).get() as any;
    expect(row.event).toBe('demo.x');
    expect(row.chain_key).toBeNull();
    expect(row.entity_value).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/analytics-sink.test.ts`
Expected: FAIL — cannot find module `../src/utils/analytics-sink`.

- [ ] **Step 3: Write the implementation**

Create `open-energy-platform/src/utils/analytics-sink.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer D — Insights & Analytics sink.
// recordPlatformEvent(ctx) appends one append-only row to oe_platform_events.
// The nightly rollup cron (Week 4) aggregates this into oe_metrics_daily /
// oe_chain_metrics; dashboards read the rollups, never this raw table.
// Error-isolated by the caller.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from './cascade';

function genId(): string {
  return `pev_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export async function recordPlatformEvent(ctx: CascadeContext): Promise<void> {
  await ctx.env.DB.prepare(
    `INSERT INTO oe_platform_events
       (id, event, chain_key, entity_type, entity_id, actor_id, source_chain_status,
        affected_roles, entity_value, data_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    genId(),
    ctx.event,
    ctx.chain_key ?? null,
    ctx.entity_type,
    ctx.entity_id,
    ctx.actor_id ?? null,
    ctx.source_chain_status ?? null,
    ctx.affected_roles ? JSON.stringify(ctx.affected_roles) : null,
    ctx.commercial?.entity_value ?? null,
    JSON.stringify(ctx.data ?? {}),
    new Date().toISOString(),
  ).run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/analytics-sink.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd open-energy-platform && git add src/utils/analytics-sink.ts tests/analytics-sink.test.ts && git commit -m "feat(ecosystem): Layer D analytics sink"
```

---

## Task 13: Wire the three layers into `fireCascade`

**Files:**
- Modify: `open-energy-platform/src/utils/cascade.ts` (imports near top; the end of `fireCascade`, currently ending at line ~2404)
- Test: `open-energy-platform/tests/cascade-wiring.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/cascade-wiring.test.ts`:

```typescript
// Proves fireCascade now also: logs to the analytics sink, records a (R0)
// revenue row when commercial context is present, and runs the registry —
// without breaking the legacy audit_logs write.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { fireCascade } from '../src/utils/cascade';
import { registerCascadeRule, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database;
let env: any;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); _resetRegistryForTests(); });
afterEach(() => { db.close(); });

describe('fireCascade ecosystem wiring', () => {
  it('logs the event to oe_platform_events', async () => {
    await fireCascade({
      event: 'demo.fired' as any,
      actor_id: 'system:cascade',
      entity_type: 'demo',
      entity_id: 'e1',
      env,
      chain_key: 'demo',
    });
    const row = db.prepare(`SELECT event, chain_key FROM oe_platform_events LIMIT 1`).get() as any;
    expect(row.event).toBe('demo.fired');
    expect(row.chain_key).toBe('demo');
  });

  it('records a R0 waived revenue row when commercial context present', async () => {
    await fireCascade({
      event: 'demo.fired' as any,
      entity_type: 'demo', entity_id: 'e2', env,
      commercial: { entity_value: 1_000_000, participant_id: 'par_1' },
    });
    const r = db.prepare(`SELECT fee_zar, status FROM oe_platform_revenue LIMIT 1`).get() as any;
    expect(r.fee_zar).toBe(0);
    expect(r.status).toBe('waived');
  });

  it('runs a registered registry rule', async () => {
    let ran = 0;
    registerCascadeRule({ id: 't.rule', match: c => c.event === 'demo.fired', run: async () => { ran++; } });
    await fireCascade({ event: 'demo.fired' as any, entity_type: 'demo', entity_id: 'e3', env });
    expect(ran).toBe(1);
  });

  it('still writes the legacy audit_logs row', async () => {
    await fireCascade({ event: 'demo.fired' as any, entity_type: 'demo', entity_id: 'e4', env });
    const row = db.prepare(`SELECT action, entity_id FROM audit_logs WHERE entity_id = 'e4'`).get() as any;
    expect(row.action).toBe('demo.fired');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/cascade-wiring.test.ts`
Expected: FAIL — `oe_platform_events`/`oe_platform_revenue` rows not written (wiring absent) and/or registry rule never runs.

- [ ] **Step 3: Add imports near the top of cascade.ts**

After the `import type { PlatformEventFields } from './platform-event';` line added in Task 7, add:

```typescript
import { runCascadeRegistry } from './cascade-registry';
import { computeAndRecordFee } from './fee-engine';
import { recordPlatformEvent } from './analytics-sink';
```

- [ ] **Step 4: Wire the stages at the end of `fireCascade`**

Find the end of `fireCascade` (the `special` stage call, cascade.ts:2403) followed by the closing `}`:

```typescript
  await runStage(ctx, 'special', () => handleSpecialCascades(ctx));
}
```

Replace with:

```typescript
  await runStage(ctx, 'special', () => handleSpecialCascades(ctx));

  // ── Ecosystem layers (additive; coexist with handleSpecialCascades) ────────
  // Each is error-isolated so a layer failure never breaks the cascade. When
  // env.QUEUE is provisioned (national scale) these move to a Queue consumer;
  // until then they run inline and awaited so tests observe their effect.
  // Auto-progressed reactions inside registry rules use actor 'system:cascade'.
  await runStage(ctx, 'registry', () => runCascadeRegistry(ctx)).catch(() => {});
  await runStage(ctx, 'analytics', () => recordPlatformEvent(ctx)).catch(() => {});
  await runStage(ctx, 'commercial', () => computeAndRecordFee(ctx)).catch(() => {});
}
```

(`runStage` already provides retry + DLQ + error isolation; the trailing `.catch(() => {})` guarantees fireCascade itself never rejects from a new layer.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/cascade-wiring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite to prove no regression**

Run: `cd open-energy-platform && npx vitest run`
Expected: PASS — all prior tests + the new foundation tests. Note any pre-existing failures unrelated to this change; do NOT fix unrelated failures here.

- [ ] **Step 7: Commit**

```bash
cd open-energy-platform && git add src/utils/cascade.ts tests/cascade-wiring.test.ts && git commit -m "feat(ecosystem): wire registry + analytics + commercial into fireCascade"
```

---

## Task 14: Optional `QUEUE` binding + register the rules barrel at boot

**Files:**
- Modify: `open-energy-platform/src/utils/types.ts` (`HonoBindings`)
- Modify: `open-energy-platform/src/index.ts` (add side-effect import)
- Modify: `open-energy-platform/wrangler.toml` (commented `[[queues.producers]]`)

- [ ] **Step 1: Add the optional Queue binding to `HonoBindings`**

In `src/utils/types.ts`, the import line is:

```typescript
import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace } from '@cloudflare/workers-types';
```

Replace it with (adds `Queue`):

```typescript
import type { D1Database, KVNamespace, R2Bucket, DurableObjectNamespace, Queue } from '@cloudflare/workers-types';
```

Then inside `interface HonoBindings`, immediately after the `ASSETS?: ...` line (in the `── Platform ──` block), add:

```typescript
  // ── Ecosystem cascade Queue (national-scale async fan-out) ───────────────
  // Optional: when bound, fireCascade enqueues PlatformEvents and a Queue
  // consumer runs the registry/fee/analytics layers off the request path.
  // Until provisioned the layers run inline (see fireCascade). Provision:
  //   wrangler queues create open-energy-cascade
  // then uncomment the [[queues.producers]] + [[queues.consumers]] blocks.
  QUEUE?: Queue;
```

- [ ] **Step 2: Type-check**

Run: `cd open-energy-platform && npm run check`
Expected: PASS (binding is optional; nothing references it yet).

- [ ] **Step 3: Register the rules barrel at boot**

In `src/index.ts`, find the route-import block (near the other `import ... from './routes/...'` lines, ~line 12-50). Add this side-effect import among the imports:

```typescript
import './cascade-rules'; // Layer A — registers all cascade rules at boot
```

- [ ] **Step 4: Add the commented Queue block to wrangler.toml**

In `wrangler.toml`, immediately before the `[triggers]` section, add:

```toml
# ── Ecosystem cascade Queue (national-scale async fan-out) ────────────────────
# Optional. When provisioned, fireCascade enqueues PlatformEvents and a Queue
# consumer runs the registry/fee/analytics layers off the request path. Until
# then those layers run inline (see src/utils/cascade.ts). Provision with:
#   wrangler queues create open-energy-cascade
# then uncomment both blocks below and redeploy.
# [[queues.producers]]
# binding = "QUEUE"
# queue = "open-energy-cascade"
#
# [[queues.consumers]]
# queue = "open-energy-cascade"
# max_batch_size = 50
# max_batch_timeout = 5
```

- [ ] **Step 5: Type-check + full suite**

Run: `cd open-energy-platform && npm run check && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd open-energy-platform && git add src/utils/types.ts src/index.ts wrangler.toml && git commit -m "feat(ecosystem): optional QUEUE binding + boot-register cascade rules"
```

---

## Task 15: Foundation verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full type-check (backend + SPA)**

Run: `cd open-energy-platform && npm run check`
Expected: PASS, no errors.

- [ ] **Step 2: Full unit suite**

Run: `cd open-energy-platform && npx vitest run`
Expected: PASS. Record the new total test count (was 7,774; expect +~24 from the foundation tests).

- [ ] **Step 3: Confirm zero behavioural change**

Manually confirm: the registry barrel is empty (no rules registered in prod), so `runCascadeRegistry` is a no-op; fees are all R0 `waived`; analytics sink + role queue only ADD rows. No existing endpoint response changes.

- [ ] **Step 4: Confirm migration ledger discipline**

Confirm migrations 475–479 are pure `CREATE TABLE/INDEX IF NOT EXISTS` (idempotent, additive). Do NOT touch the 049–050 irregular band or the `d1_migrations` ledger.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
cd open-energy-platform && git add -A && git commit -m "chore(ecosystem): Week 1 foundation verification gate" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage** (against the blueprint's four layers + locked decisions):
- Layer A (registry) → Tasks 8, 9, 13. ✔
- Layer B (commercial, all-free, payer per-fee) → Tasks 1, 10, 13. ✔
- Layer C (role queue, KV cache) → Tasks 2, 11. ✔ (routes/UI are W2/W3 — out of W1 scope by design)
- Layer D (analytics sink + rollups) → Tasks 4, 5, 12, 13. ✔ (rollup cron is W4 — tables land now)
- National-scale Queue seam → Task 14 (optional binding, inline fallback). ✔
- `system:cascade` actor convention → documented in Task 13 wiring comment; enforced when rules are added (W2/W3). ✔

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows full content. ✔

**3. Type consistency:** `CascadeContext` extended in Task 7 is imported as a type by `cascade-registry.ts`, `fee-engine.ts`, `analytics-sink.ts` (Tasks 8/10/12). `PlatformEventFields`/`PlatformRole`/`CommercialContext` defined in Task 6 are consumed by Task 7 (cascade.ts) and Task 11 (role-actions.ts). `HonoBindings` (Task 14) is imported by `role-actions.ts` (Task 11) — role-actions uses `env: HonoBindings`, consistent. Function names: `registerCascadeRule`/`runCascadeRegistry`/`_resetRegistryForTests` (Task 8) match their uses in Tasks 9/13. `computeAndRecordFee` (Task 10) matches Task 13. `recordPlatformEvent` (Task 12) matches Task 13. `pushRoleAction`/`pendingCountForRole` (Task 11) — self-contained. ✔

**Note for executor:** `tests/helpers/d1-sqlite.ts` exports both `createTestDb` and `envFor`. If `createTestDb` does not accept `{ applyMigrations: true }` or `envFor` is named differently, read the helper first and adapt the import — do not invent a new helper.
