# W5 — handleSpecialCascades → Cascade Registry Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every legacy `handleSpecialCascades` switch case + both materializers (`materializeRegulatorInbox`, `materializeLenderWatchlist`) out of `src/utils/cascade.ts` into self-registering `src/cascade-rules/*.ts` rule files (each with its own behavior-locking unit test), then delete `handleSpecialCascades` and the `'special'` fireCascade stage — leaving `cascade.ts` under 3,300 lines.

**Architecture:** `fireCascade()` already runs BOTH the legacy `special` stage (`handleSpecialCascades`, line 2426) AND the new `registry` stage (`runCascadeRegistry`, line 2437) on every event. Each migration task is therefore **atomic**: it adds a registry rule AND deletes the corresponding switch case **in the same commit**. If a rule were added without deleting its case, both stages would fire and write duplicate rows (two escrow accounts, two invoices, two action_queue items) — corrupting data. No existing test pins the legacy behavior, so every migrated rule ships with a test that locks its row-level effects. The legacy switch bodies move **verbatim** into rule `run()` bodies with three mechanical transforms only:
- `db` (the `const db = ctx.env.DB` local) → `ctx.env.DB`
- `generateId()` → `genId()` (imported from `./_enqueue`, byte-identical `id_`-prefixed format)
- `enqueueAction` / `enqueueActions` / `EnqueueActionInput` / `daysFromNow` / `cachedProjectDeveloper` → imported (first three + `daysFromNow` from `./_enqueue`; `cachedProjectDeveloper` re-exported from `../utils/cascade`)

Each rule's `match(ctx)` returns `ctx.event === '<event>'`. Rules that only enqueue downstream work and create no cross-role state use `mode: 'drive'` is **not** appropriate here — these legacy handlers ran with the originating `ctx.actor_id` (not as `system:cascade`), so they carry **no `mode`** (defaults to `'drive'` in the audit row, which is correct: they are reactions, not regulatory blocks). Do NOT rewrite them to run as `system:cascade` — that is a behavior change. Preserve `ctx.actor_id` exactly as the legacy code used it.

**Tech Stack:** TypeScript (Cloudflare Workers), Hono, D1 (SQLite via better-sqlite3 in tests), Vitest. `tsconfig` has `noUnusedLocals: true` + `noUnusedParameters: true` — an orphaned import fails `npm run check`, so every task that orphans an import MUST remove it in the same task.

---

## Critical constraints (load-bearing — do not violate)

1. **`*-spec.ts` files are FORBIDDEN to edit.** Import only: `regulatorInboxSpec`, `computeSlaDueAt` from `./regulator-inbox-spec`; `initialDunningCycle` from `./lender-escalation-spec`.
2. **Schema is additive only.** This migration writes ZERO new migrations. It only moves TypeScript. No `ALTER`, no new tables.
3. **Atomicity.** Never land a rule file in the barrel without deleting its switch case in the same commit, and vice versa. Run the full suite after every task to prove no double-fire.
4. **`generateId` and `cachedProjectDeveloper` STAY in `cascade.ts`** — surviving code (createNotifications at lines 2470/2489/2551/2697/2726; determineNotificationRecipients at 2809/2839/2914/2922/2938) uses them. `_enqueue.ts` gets its own copy of the id generator (`genId`) so rule files never import from `cascade.ts` for ids. `cachedProjectDeveloper` is re-exported from `cascade.ts` for the two rules that need it (Task 4 insurance, Task 10 covenant).
5. **`enqueueAction` / `enqueueActions` / `EnqueueActionInput` / `daysFromNow` move to `_enqueue.ts` in Task 1, but their copies in `cascade.ts` STAY until Task 13** (un-migrated switch cases still call them). Task 13 deletes the `cascade.ts` copies once the switch is gone.
6. **Preserve `ctx.actor_id` semantics.** Legacy handlers used the originating actor. Do not substitute `system:cascade`.
7. Branch is `feat/ecosystem-foundation`. Commit messages end with the Co-Authored-By trailer (see each commit step). Do NOT merge / push / open a PR.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/cascade-rules/_enqueue.ts` (new) | Shared action-queue helpers + legacy `id_` generator + `daysFromNow`, imported by every rule file |
| `src/cascade-rules/trade-settlement.ts` (new) | `trade.matched`, `invoice.issued`, `invoice.paid`, `dispute.filed` |
| `src/cascade-rules/contract-lifecycle.ts` (new) | `contract.signed`, `contract.phase_changed` |
| `src/cascade-rules/ipp-lifecycle.ts` (new) | `ipp.milestone_satisfied`, `ipp.financial_close`, `ipp.insurance_expiring` |
| `src/cascade-rules/ona-operations.ts` (new) | `ona.fault_detected` |
| `src/cascade-rules/esg-events.ts` (new) | `esg.decarbonisation_completed` |
| `src/cascade-rules/regulator-actions.ts` (new) | `regulator.licence_suspended`, `regulator.licence_revoked`, `regulator.enforcement_finding`, `regulator.surveillance_escalated` |
| `src/cascade-rules/grid-dispatch.ts` (new) | `grid.instruction_issued`, `grid.instruction_non_compliant` |
| `src/cascade-rules/trader-margin.ts` (new) | `trader.margin_call_issued` |
| `src/cascade-rules/lender-covenant.ts` (new) | `lender.covenant_breach` action-queue + watchlist/dunning materializer (`covenant_breach` + `covenant_warn`) |
| `src/cascade-rules/carbon-events.ts` (new) | `carbon.mrv_verified` |
| `src/cascade-rules/regulator-inbox.ts` (new) | `materializeRegulatorInbox` (spec-driven allowlist) |
| `src/cascade-rules/index.ts` (modify) | Barrel — add one `register*()` import + call per task |
| `src/utils/cascade.ts` (modify) | Delete switch cases + materializers progressively; final cleanup in Task 13 |
| `tests/cascade-rules-*.test.ts` (new, one per rule task) | Behavior-locking unit tests |

---

## Shared patterns

**Rule file skeleton** (every task follows this shape):

```typescript
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, enqueueActions, genId, daysFromNow, type EnqueueActionInput } from './_enqueue';
// (import cachedProjectDeveloper from '../utils/cascade' only where needed)

export function register<Name>Rules(): void {
  registerCascadeRule({
    id: '<group>.<event>',
    match: (ctx) => ctx.event === '<event>',
    run: async (ctx) => { /* verbatim case body, transformed */ },
  });
}
```

**Test file skeleton** (every task follows this shape — copy from `tests/cascade-registry.test.ts`):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { register<Name>Rules } from '../src/cascade-rules/<file>';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  register<Name>Rules();
});
afterEach(() => { db.close(); });

function ctx(event: string, entity_id: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { event, entity_type: 'x', entity_id, data, actor_id: 'actor-1', env, ...extra } as any;
}
```

**Verification block (run at the END of every task 1-13):**

```bash
cd open-energy-platform
npx vitest run tests/cascade-rules-<file>.test.ts   # the task's own test (skip for Task 1: it's tests/cascade-enqueue.test.ts)
npm run check                                        # tsc --noEmit, catches orphaned imports
npm test                                             # FULL suite — proves no double-fire / no regression
```
Expected: the task's test PASS, `npm run check` exits 0, full suite green (same count as before plus the new test cases).

---

### Task 1: `_enqueue.ts` shared helper module

**Files:**
- Create: `open-energy-platform/src/cascade-rules/_enqueue.ts`
- Create: `open-energy-platform/tests/cascade-enqueue.test.ts`

This module holds byte-faithful copies of the action-queue helpers + the legacy `id_` generator + `daysFromNow`, lifted from `cascade.ts:4028-4096`. The `cascade.ts` originals stay (un-migrated cases still use them) until Task 13.

- [ ] **Step 1: Write the failing test**

`open-energy-platform/tests/cascade-enqueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './helpers/d1-sqlite';
import { enqueueAction, enqueueActions, genId, daysFromNow } from '../src/cascade-rules/_enqueue';

let db: Database.Database;
beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('_enqueue helpers', () => {
  it('genId returns the legacy id_ format', () => {
    const id = genId();
    expect(id).toMatch(/^id_[a-z0-9]+$/);
  });

  it('daysFromNow returns a YYYY-MM-DD string', () => {
    expect(daysFromNow(7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('enqueueAction inserts one pending action_queue row', async () => {
    await enqueueAction(db as any, {
      type: 'demo', priority: 'high', actor_id: 'a1', assignee_id: 'u1',
      entity_type: 'invoices', entity_id: 'inv1', title: 'Pay', description: 'desc',
      due_date: '2026-07-01',
    });
    const row = db.prepare(`SELECT type, priority, assignee_id, status FROM action_queue WHERE entity_id = 'inv1'`).get() as any;
    expect(row).toMatchObject({ type: 'demo', priority: 'high', assignee_id: 'u1', status: 'pending' });
  });

  it('enqueueActions batch-inserts many rows', async () => {
    await enqueueActions(db as any, [
      { type: 't', priority: 'normal', assignee_id: 'u1', entity_type: 'e', entity_id: 'x1', title: 'a' },
      { type: 't', priority: 'normal', assignee_id: 'u2', entity_type: 'e', entity_id: 'x1', title: 'b' },
    ]);
    const n = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'x1'`).get() as { n: number };
    expect(n.n).toBe(2);
  });

  it('enqueueActions on empty array is a no-op', async () => {
    await enqueueActions(db as any, []);
    const n = db.prepare(`SELECT COUNT(*) n FROM action_queue`).get() as { n: number };
    expect(n.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/cascade-enqueue.test.ts`
Expected: FAIL — cannot resolve `'../src/cascade-rules/_enqueue'`.

- [ ] **Step 3: Create `_enqueue.ts`**

`open-energy-platform/src/cascade-rules/_enqueue.ts` — copy the bodies verbatim from `cascade.ts:4028-4096` (note `genId` is the renamed `generateId`; the cascade.ts copy keeps the name `generateId`):

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer A — shared action-queue helpers for cascade rule files.
// Lifted verbatim from the legacy handleSpecialCascades helpers so migrated
// rules write byte-identical rows. genId() reproduces the original
// generateId() 'id_'+base36 format exactly (NOT crypto.randomUUID) so replayed
// and migrated cascades are indistinguishable from the pre-migration behavior.
// ═══════════════════════════════════════════════════════════════════════════

/** Legacy id generator — 'id_'+base36(time)+base36(random). Byte-faithful to
 *  the pre-migration handleSpecialCascades generateId(). */
export function genId(): string {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/** Days-from-now helper for action_queue.due_date (YYYY-MM-DD). */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface EnqueueActionInput {
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  actor_id?: string;
  assignee_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
}

export async function enqueueAction(db: any, input: EnqueueActionInput): Promise<void> {
  await enqueueActions(db, [input]);
}

/**
 * Batched variant — inserts many action_queue rows in a single
 * env.DB.batch() round-trip. Falls back to per-row INSERTs if batch()
 * fails so forward progress is preserved.
 */
export async function enqueueActions(db: any, inputs: EnqueueActionInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const now = new Date().toISOString();
  const stmts = inputs.map((input) =>
    db.prepare(`
      INSERT INTO action_queue
        (id, type, priority, actor_id, assignee_id, entity_type, entity_id, title, description, status, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).bind(
      genId(),
      input.type,
      input.priority,
      input.actor_id || null,
      input.assignee_id,
      input.entity_type,
      input.entity_id,
      input.title,
      input.description || null,
      input.due_date || null,
      now,
      now,
    ),
  );
  try {
    if (typeof db.batch === 'function') {
      await db.batch(stmts);
      return;
    }
  } catch (err) {
    console.warn('action_queue_batch_failed', (err as Error).message);
  }
  // Fallback: sequential.
  for (const stmt of stmts) {
    try { await stmt.run(); } catch (err) { console.error('Action queue enqueue failed:', err); }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd open-energy-platform && npx vitest run tests/cascade-enqueue.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify no regression + commit**

```bash
cd open-energy-platform
npm run check
npm test
git add src/cascade-rules/_enqueue.ts tests/cascade-enqueue.test.ts
git commit -m "$(cat <<'EOF'
feat(W5): shared _enqueue helpers for cascade rule files

Byte-faithful copy of handleSpecialCascades' enqueueAction/enqueueActions/
daysFromNow + legacy id_ generator, so migrated rules write identical rows.
cascade.ts originals stay until the switch is deleted (Task 13).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `trade-settlement.ts` — trade.matched / invoice.issued / invoice.paid / dispute.filed

**Files:**
- Create: `open-energy-platform/src/cascade-rules/trade-settlement.ts`
- Create: `open-energy-platform/tests/cascade-rules-trade-settlement.test.ts`
- Modify: `open-energy-platform/src/cascade-rules/index.ts`
- Modify: `open-energy-platform/src/utils/cascade.ts` — delete switch cases `trade.matched` (3317-3370), `invoice.issued` (3430-3448), `invoice.paid` (3450-3468), `dispute.filed` (3494-3516)

The four case bodies move verbatim into four rules. Transform: `db` → `ctx.env.DB`, `generateId()` → `genId()`, `Date.now()` stays (legacy invoice numbers used it). `enqueueAction(db, …)` → `enqueueAction(ctx.env.DB, …)`.

- [ ] **Step 1: Write the failing test**

`open-energy-platform/tests/cascade-rules-trade-settlement.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerTradeSettlementRules } from '../src/cascade-rules/trade-settlement';

let db: Database.Database;
let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerTradeSettlementRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'x', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('trade-settlement rules', () => {
  it('trade.matched creates exactly one escrow + one invoice + two action_queue rows', async () => {
    await runCascadeRegistry(ctx('trade.matched', 'm1', {
      match_id: 'm1', buyer_id: 'b1', seller_id: 's1', total_value: 1150,
      volume_mwh: 10, price_per_mwh: 115, delivery_date: '2026-07-01',
    }));
    const escrow = db.prepare(`SELECT COUNT(*) n FROM escrow_accounts WHERE match_id = 'm1'`).get() as { n: number };
    expect(escrow.n).toBe(1);
    const inv = db.prepare(`SELECT COUNT(*) n FROM invoices WHERE match_id = 'm1'`).get() as { n: number };
    expect(inv.n).toBe(1);
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'm1' OR entity_type = 'invoices'`).get() as { n: number };
    expect(aq.n).toBe(2);
  });

  it('invoice.paid releases held escrow and settles the match', async () => {
    db.prepare(`INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at) VALUES ('e1','m2',100,'ZAR','held','2026-01-01')`).run();
    db.prepare(`INSERT INTO trade_matches (id, status) VALUES ('m2','matched')`).run();
    db.prepare(`INSERT INTO invoices (id, match_id, status, tenant_id) VALUES ('inv2','m2','paid','default')`).run();
    await runCascadeRegistry(ctx('invoice.paid', 'inv2', {}));
    const esc = db.prepare(`SELECT status FROM escrow_accounts WHERE id = 'e1'`).get() as { status: string };
    expect(esc.status).toBe('released');
    const tm = db.prepare(`SELECT status FROM trade_matches WHERE id = 'm2'`).get() as { status: string };
    expect(tm.status).toBe('settled');
  });

  it('dispute.filed marks escrow disputed and queues an admin review', async () => {
    db.prepare(`INSERT INTO escrow_accounts (id, match_id, amount, currency, status, created_at) VALUES ('e3','m3',100,'ZAR','held','2026-01-01')`).run();
    db.prepare(`INSERT INTO participants (id, role) VALUES ('admin1','admin')`).run();
    await runCascadeRegistry(ctx('dispute.filed', 'inv3', { match_id: 'm3', reason: 'short delivery' }));
    const esc = db.prepare(`SELECT status FROM escrow_accounts WHERE id = 'e3'`).get() as { status: string };
    expect(esc.status).toBe('disputed');
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'dispute_review' AND assignee_id = 'admin1'`).get() as { n: number };
    expect(aq.n).toBe(1);
  });

  it('invoice.issued queues a payment action for the payee', async () => {
    db.prepare(`INSERT INTO invoices (id, invoice_number, from_participant_id, to_participant_id, total_amount, due_date, status, tenant_id) VALUES ('inv4','INV-4','s1','b1',500,'2026-07-01','issued','default')`).run();
    await runCascadeRegistry(ctx('invoice.issued', 'inv4', {}));
    const aq = db.prepare(`SELECT assignee_id, type FROM action_queue WHERE entity_id = 'inv4'`).get() as any;
    expect(aq).toMatchObject({ assignee_id: 'b1', type: 'invoice_payment' });
  });
});
```

NOTE on test fixtures: the columns above (`escrow_accounts`, `invoices`, `trade_matches`, `participants`, `action_queue`) all exist in the migrations applied by `createTestDb`. If an `INSERT` fails on a NOT NULL column, add the minimal missing column to that test fixture's `INSERT` — do not alter the rule.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd open-energy-platform && npx vitest run tests/cascade-rules-trade-settlement.test.ts`
Expected: FAIL — cannot resolve `'../src/cascade-rules/trade-settlement'`.

- [ ] **Step 3: Create `trade-settlement.ts`**

Open `cascade.ts` and copy the four case bodies verbatim into the rules below. Apply transforms: inside each `run`, the legacy `const db = ctx.env.DB` is gone — replace every `db.` with `ctx.env.DB.`, every `generateId()` with `genId()`, and `enqueueAction(db, …)` with `enqueueAction(ctx.env.DB, …)`. Wrap each in `registerCascadeRule({ id, match, run })`.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer A — trade & settlement cascade rules (migrated from handleSpecialCascades).
//   trade.matched   → escrow + invoice + buyer/seller action queues
//   invoice.issued  → payment action for the payee
//   invoice.paid    → release escrow, settle match, complete invoice actions
//   dispute.filed   → freeze escrow, queue admin review
// Bodies are verbatim from the legacy switch (no behavior change). actor_id is
// the originating actor, as before — these are reactions, not regulatory blocks.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { enqueueAction, genId } from './_enqueue';

export function registerTradeSettlementRules(): void {
  registerCascadeRule({
    id: 'trade_settlement.trade_matched',
    match: (ctx) => ctx.event === 'trade.matched',
    run: async (ctx) => {
      // <<< paste cascade.ts:3318-3368 body, db→ctx.env.DB, generateId→genId, enqueueAction(db→enqueueAction(ctx.env.DB >>>
    },
  });

  registerCascadeRule({
    id: 'trade_settlement.invoice_issued',
    match: (ctx) => ctx.event === 'invoice.issued',
    run: async (ctx) => {
      // <<< paste cascade.ts:3431-3447 body, transformed >>>
    },
  });

  registerCascadeRule({
    id: 'trade_settlement.invoice_paid',
    match: (ctx) => ctx.event === 'invoice.paid',
    run: async (ctx) => {
      // <<< paste cascade.ts:3451-3467 body, transformed >>>
    },
  });

  registerCascadeRule({
    id: 'trade_settlement.dispute_filed',
    match: (ctx) => ctx.event === 'dispute.filed',
    run: async (ctx) => {
      // <<< paste cascade.ts:3495-3515 body, transformed >>>
    },
  });
}
```

The implementer MUST replace each `// <<< paste … >>>` marker with the actual transformed code read from `cascade.ts` at those exact line ranges. Verify zero `db.` (bare local) references remain — every DB call goes through `ctx.env.DB`.

- [ ] **Step 4: Register in the barrel**

Edit `open-energy-platform/src/cascade-rules/index.ts` — add the import + call:

```typescript
import { registerTradeSettlementRules } from './trade-settlement';
// …existing register calls…
registerTradeSettlementRules();
// …add to the export block too
```

- [ ] **Step 5: Delete the four switch cases from `cascade.ts`**

Remove (verbatim, including the `case …: { … break; }` blocks): `trade.matched` (3317-3370), `invoice.issued` (3430-3448), `invoice.paid` (3450-3468), `dispute.filed` (3494-3516). Leave every other case intact. (Line numbers shift as you delete — delete from the BOTTOM up: dispute.filed first, then invoice.paid, invoice.issued, trade.matched.)

- [ ] **Step 6: Run the task test + full suite**

```bash
cd open-energy-platform
npx vitest run tests/cascade-rules-trade-settlement.test.ts
npm run check
npm test
```
Expected: task test PASS; `npm run check` exits 0; full suite green with NO duplicate-row failures (proves the switch case is gone and only the rule fires).

- [ ] **Step 7: Commit**

```bash
git add src/cascade-rules/trade-settlement.ts src/cascade-rules/index.ts tests/cascade-rules-trade-settlement.test.ts src/utils/cascade.ts
git commit -m "$(cat <<'EOF'
feat(W5): migrate trade/settlement cascades to registry rules

trade.matched, invoice.issued, invoice.paid, dispute.filed move verbatim
from handleSpecialCascades into trade-settlement.ts. Switch cases deleted in
the same commit (no double-fire). Behavior-locking test added.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `contract-lifecycle.ts` — contract.signed / contract.phase_changed

**Files:**
- Create: `open-energy-platform/src/cascade-rules/contract-lifecycle.ts`
- Create: `open-energy-platform/tests/cascade-rules-contract-lifecycle.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `contract.signed` (3372-3428), `contract.phase_changed` (3470-3492)

`run` bodies verbatim from those ranges. Transform `db`→`ctx.env.DB`, `generateId`→`genId`, `enqueueAction(db`→`enqueueAction(ctx.env.DB`. `ctx.actor_id` and `Date.now()` preserved.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerContractLifecycleRules } from '../src/cascade-rules/contract-lifecycle';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerContractLifecycleRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'contract_documents', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('contract-lifecycle rules', () => {
  it('contract.signed activates the contract, opens an invoice, queues activation', async () => {
    db.prepare(`INSERT INTO contract_documents (id, title, creator_id, counterparty_id, project_id, commercial_terms, phase) VALUES ('c1','Solar PPA','cr1','cp1','p1','{"monthly_amount":1150}','negotiation')`).run();
    await runCascadeRegistry(ctx('contract.signed', 'c1', {}));
    const c = db.prepare(`SELECT phase FROM contract_documents WHERE id = 'c1'`).get() as { phase: string };
    expect(c.phase).toBe('active');
    const inv = db.prepare(`SELECT COUNT(*) n FROM invoices WHERE from_participant_id = 'cr1' AND to_participant_id = 'cp1'`).get() as { n: number };
    expect(inv.n).toBe(1);
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'c1' AND type = 'contract_activate'`).get() as { n: number };
    expect(aq.n).toBe(1);
  });

  it('contract.phase_changed→execution queues a sign action per unsigned signatory', async () => {
    db.prepare(`INSERT INTO document_signatories (id, document_id, participant_id, signed) VALUES ('ds1','c2','u1',0)`).run();
    db.prepare(`INSERT INTO document_signatories (id, document_id, participant_id, signed) VALUES ('ds2','c2','u2',1)`).run();
    await runCascadeRegistry(ctx('contract.phase_changed', 'c2', { new_phase: 'execution' }));
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'c2' AND type = 'contract_sign'`).get() as { n: number };
    expect(aq.n).toBe(1); // only the unsigned signatory
  });
});
```

- [ ] **Step 2: Run → FAIL** (`cannot resolve contract-lifecycle`).
- [ ] **Step 3: Create `contract-lifecycle.ts`** with `registerContractLifecycleRules()` wrapping the two verbatim-transformed bodies; import `{ enqueueAction, genId } from './_enqueue'`.
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete the two switch cases** (bottom-up: phase_changed 3470-3492 first, then signed 3372-3428).
- [ ] **Step 6: Run task test + `npm run check` + full suite.** Expected green, no double-fire.
- [ ] **Step 7: Commit** (`feat(W5): migrate contract lifecycle cascades to registry rules` + trailer; add the four files).

---

### Task 4: `ipp-lifecycle.ts` — ipp.milestone_satisfied / ipp.financial_close / ipp.insurance_expiring

**Files:**
- Create: `open-energy-platform/src/cascade-rules/ipp-lifecycle.ts`
- Create: `open-energy-platform/tests/cascade-rules-ipp-lifecycle.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `ipp.milestone_satisfied` (3518-3546), `ipp.financial_close` (3594-3630), `ipp.insurance_expiring` (3827-3848)

**Special: the nested `fireCascade`.** `ipp.milestone_satisfied` body fires a NESTED `fireCascade({ event: 'ipp.financial_close', actor_id: ctx.actor_id, … })` (cascade.ts:3521-3528). This must be preserved EXACTLY — import `fireCascade` from `'../utils/cascade'` into the rule file and call it identically (keeping `actor_id: ctx.actor_id`, NOT `system:cascade`). The nested fireCascade re-enters the registry, which is intentional (it now drives the `ipp.financial_close` rule from this same file).

**Special: `cachedProjectDeveloper`.** The `ipp.insurance_expiring` body calls `cachedProjectDeveloper(ctx.env, projectId)` (cascade.ts:3830). Import it: `import { cachedProjectDeveloper } from '../utils/cascade'`. (Task adds the export in Step 0 below.)

- [ ] **Step 0: Export `cachedProjectDeveloper` from cascade.ts**

In `cascade.ts`, change the declaration at line 2985 from `async function cachedProjectDeveloper(` to `export async function cachedProjectDeveloper(`. (Surviving callers inside cascade.ts are unaffected; this only widens visibility.)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerIppLifecycleRules } from '../src/cascade-rules/ipp-lifecycle';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerIppLifecycleRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'ipp_projects', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('ipp-lifecycle rules', () => {
  it('milestone_satisfied queues a disbursement_approval per lender', async () => {
    db.prepare(`INSERT INTO participants (id, role) VALUES ('l1','lender')`).run();
    db.prepare(`INSERT INTO participants (id, role) VALUES ('l2','lender')`).run();
    await runCascadeRegistry(ctx('ipp.milestone_satisfied', 'ms1', { milestone_name: 'COD' }));
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'disbursement_approval' AND entity_id = 'ms1'`).get() as { n: number };
    expect(aq.n).toBe(2);
  });

  it('milestone_satisfied with milestone_type=financial_close drives the financial_close rule (notifications)', async () => {
    db.prepare(`INSERT INTO ipp_projects (id, project_name, developer_id, commercial_operation_date) VALUES ('p1','Karoo Wind','dev1','2027-01-01')`).run();
    db.prepare(`INSERT INTO grid_connections (id, project_id) VALUES ('gc1','p1')`).run();
    db.prepare(`INSERT INTO participants (id, role) VALUES ('go1','grid_operator')`).run();
    await runCascadeRegistry(ctx('ipp.milestone_satisfied', 'p1', { milestone_type: 'financial_close', project_id: 'p1', project_name: 'Karoo Wind' }));
    const notif = db.prepare(`SELECT COUNT(*) n FROM notifications WHERE participant_id = 'go1'`).get() as { n: number };
    expect(notif.n).toBe(1); // nested fireCascade drove the financial_close rule
  });

  it('insurance_expiring queues a renewal for the project developer', async () => {
    db.prepare(`INSERT INTO ipp_projects (id, project_name, developer_id) VALUES ('p2','Solar Park','dev2')`).run();
    await runCascadeRegistry(ctx('ipp.insurance_expiring', 'pol1', { project_id: 'p2', policy_number: 'POL-1', period_end: '2026-09-30' }));
    const aq = db.prepare(`SELECT assignee_id, type FROM action_queue WHERE entity_id = 'pol1'`).get() as any;
    expect(aq).toMatchObject({ assignee_id: 'dev2', type: 'insurance_renewal' });
  });
});
```

NOTE: `cachedProjectDeveloper` reads `ipp_projects.developer_id` (verify the column name against the migration — adjust the test fixture `INSERT` if the real column differs, never the rule). If `cachedProjectDeveloper` uses a KV cache, `envFor(db)` provides a KV stub; on a miss it falls through to D1, which the fixture satisfies.

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `ipp-lifecycle.ts`.** Imports: `{ enqueueAction, genId } from './_enqueue'`, `{ cachedProjectDeveloper, fireCascade } from '../utils/cascade'`. Three rules, bodies verbatim-transformed. The milestone rule keeps the nested `await fireCascade({ event: 'ipp.financial_close', actor_id: ctx.actor_id, entity_type: 'ipp_projects', entity_id: (ctx.data?.project_id as string) || ctx.entity_id, data: { project_name: ctx.data?.project_name }, env: ctx.env })` exactly.
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete the three switch cases** (bottom-up: insurance_expiring 3827-3848, financial_close 3594-3630, milestone_satisfied 3518-3546).
- [ ] **Step 6: Run task test + `npm run check` + full suite.** The `npm run check` step confirms `cachedProjectDeveloper`/`fireCascade` exports resolve. Expected green.
- [ ] **Step 7: Commit** (`feat(W5): migrate IPP lifecycle cascades to registry rules; export cachedProjectDeveloper` + trailer).

---

### Task 5: `ona-operations.ts` — ona.fault_detected

**Files:**
- Create: `open-energy-platform/src/cascade-rules/ona-operations.ts`
- Create: `open-energy-platform/tests/cascade-rules-ona-operations.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `ona.fault_detected` (3548-3592)

Body uses `ctx.env.DB` directly already (not the `db` local) and `generateId()`. It writes an inline `action_queue` INSERT (not via `enqueueAction`) — keep that inline INSERT verbatim. Transform only `generateId`→`genId`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerOnaOperationsRules } from '../src/cascade-rules/ona-operations';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerOnaOperationsRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'ona_faults', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('ona-operations rules', () => {
  it('fault_detected stores revenue impact, creates an intelligence item, queues IPP review', async () => {
    db.prepare(`INSERT INTO ona_faults (id) VALUES ('f1')`).run();
    db.prepare(`INSERT INTO ona_sites (id, project_id) VALUES ('site1','proj1')`).run();
    db.prepare(`INSERT INTO ipp_projects (id, developer_id) VALUES ('proj1','dev1')`).run();
    await runCascadeRegistry(ctx('ona.fault_detected', 'f1', {
      severity: 'high', ppa_value_per_day: 50000, fault_description: 'Inverter trip',
      site_id: 'site1', site_name: 'Site A',
    }));
    const f = db.prepare(`SELECT estimated_revenue_impact FROM ona_faults WHERE id = 'f1'`).get() as { estimated_revenue_impact: number };
    expect(f.estimated_revenue_impact).toBe(100000); // 50000 * high(2)
    const ii = db.prepare(`SELECT COUNT(*) n FROM intelligence_items WHERE entity_id = 'f1'`).get() as { n: number };
    expect(ii.n).toBe(1);
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'fault_review' AND assignee_id = 'dev1'`).get() as { n: number };
    expect(aq.n).toBe(1);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `ona-operations.ts`.** Import `{ genId } from './_enqueue'`. One rule `id: 'ona_operations.fault_detected'`, body verbatim from 3549-3591 with `generateId`→`genId`. (Body already uses `ctx.env.DB`.)
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete the switch case** (3548-3592).
- [ ] **Step 6: Run task test + `npm run check` + full suite.**
- [ ] **Step 7: Commit** (`feat(W5): migrate ona.fault_detected cascade to registry rule` + trailer).

---

### Task 6: `esg-events.ts` — esg.decarbonisation_completed

**Files:**
- Create: `open-energy-platform/src/cascade-rules/esg-events.ts`
- Create: `open-energy-platform/tests/cascade-rules-esg-events.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `esg.decarbonisation_completed` (3632-3668)

Body uses `ctx.env.DB` + `generateId`. Transform `generateId`→`genId` only.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerEsgEventRules } from '../src/cascade-rules/esg-events';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerEsgEventRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'esg', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('esg-events rules', () => {
  it('decarbonisation_completed updates the latest esg_report total', async () => {
    db.prepare(`INSERT INTO esg_data (id, participant_id, metric_id, value) VALUES ('d1','part1','esg_met_001',300)`).run();
    db.prepare(`INSERT INTO esg_reports (id, participant_id, total_ghg_emissions_tco2e, created_at) VALUES ('r1','part1',9999,'2026-01-01')`).run();
    await runCascadeRegistry(ctx('esg.decarbonisation_completed', 'r1', { participant_id: 'part1', previous_emissions: 1000, scope: '1' }));
    const r = db.prepare(`SELECT total_ghg_emissions_tco2e FROM esg_reports WHERE id = 'r1'`).get() as { total_ghg_emissions_tco2e: number };
    expect(r.total_ghg_emissions_tco2e).toBe(300);
    const ii = db.prepare(`SELECT COUNT(*) n FROM intelligence_items WHERE participant_id = 'part1' AND type = 'esg'`).get() as { n: number };
    expect(ii.n).toBe(1); // |300-1000| > 500
  });
});
```

NOTE: verify `esg_data` / `esg_reports` / `intelligence_items` column names against migrations; adjust fixture `INSERT`s if needed (never the rule).

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `esg-events.ts`** (`registerEsgEventRules`, rule `id: 'esg_events.decarbonisation_completed'`, body verbatim from 3633-3667, `generateId`→`genId`, import `{ genId } from './_enqueue'`).
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete switch case** (3632-3668).
- [ ] **Step 6: Run task test + `npm run check` + full suite.**
- [ ] **Step 7: Commit** (`feat(W5): migrate esg.decarbonisation_completed cascade to registry rule` + trailer).

---

### Task 7: `regulator-actions.ts` — licence_suspended / licence_revoked / enforcement_finding / surveillance_escalated

**Files:**
- Create: `open-energy-platform/src/cascade-rules/regulator-actions.ts`
- Create: `open-energy-platform/tests/cascade-rules-regulator-actions.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete the fall-through pair `regulator.licence_suspended` / `regulator.licence_revoked` (3673-3690), `regulator.enforcement_finding` (3692-3708), `regulator.surveillance_escalated` (3710-3726)

**Special: shared-case fall-through.** `regulator.licence_suspended` and `regulator.licence_revoked` share one body (`case 'regulator.licence_suspended': case 'regulator.licence_revoked': { … }`). In the rule, match BOTH: `match: (ctx) => ctx.event === 'regulator.licence_suspended' || ctx.event === 'regulator.licence_revoked'`. The body's `ctx.event === 'regulator.licence_revoked' ? … : …` ternary works unchanged. One rule covers both. These bodies use `enqueueAction(ctx.env.DB, …)` and `daysFromNow(...)`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerRegulatorActionRules } from '../src/cascade-rules/regulator-actions';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerRegulatorActionRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>, entity_type = 'licences') {
  return { event, entity_type, entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('regulator-actions rules', () => {
  it('licence_revoked queues an urgent action with the revoked title', async () => {
    await runCascadeRegistry(ctx('regulator.licence_revoked', 'lic1', { licensee_participant_id: 'p1', details: 'fraud' }));
    const aq = db.prepare(`SELECT title, priority, assignee_id FROM action_queue WHERE entity_id = 'lic1'`).get() as any;
    expect(aq.assignee_id).toBe('p1');
    expect(aq.priority).toBe('urgent');
    expect(aq.title).toMatch(/revoked/i);
  });

  it('licence_suspended queues with the suspended title', async () => {
    await runCascadeRegistry(ctx('regulator.licence_suspended', 'lic2', { licensee_participant_id: 'p2' }));
    const aq = db.prepare(`SELECT title FROM action_queue WHERE entity_id = 'lic2'`).get() as { title: string };
    expect(aq.title).toMatch(/suspended/i);
  });

  it('enforcement_finding queues for the respondent', async () => {
    await runCascadeRegistry(ctx('regulator.enforcement_finding', 'case1', { respondent_participant_id: 'p3', case_number: 'C-1', penalty_amount_zar: 5000 }, 'regulator_enforcement_cases'));
    const aq = db.prepare(`SELECT type, assignee_id FROM action_queue WHERE assignee_id = 'p3'`).get() as any;
    expect(aq).toMatchObject({ type: 'enforcement_finding', assignee_id: 'p3' });
  });

  it('surveillance_escalated queues a high-priority response', async () => {
    await runCascadeRegistry(ctx('regulator.surveillance_escalated', 'case2', { participant_id: 'p4', case_number: 'C-2', rule_code: 'MM-01' }, 'regulator_enforcement_cases'));
    const aq = db.prepare(`SELECT type, priority FROM action_queue WHERE assignee_id = 'p4'`).get() as any;
    expect(aq).toMatchObject({ type: 'surveillance_escalation', priority: 'high' });
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `regulator-actions.ts`** (`registerRegulatorActionRules`, three rules; the suspended/revoked rule matches both events). Import `{ enqueueAction, daysFromNow } from './_enqueue'`. (No `genId` needed — these only enqueue.)
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete switch cases** (bottom-up: surveillance_escalated 3710-3726, enforcement_finding 3692-3708, the suspended/revoked pair 3673-3690 — delete BOTH `case` labels and the shared body).
- [ ] **Step 6: Run task test + `npm run check` + full suite.**
- [ ] **Step 7: Commit** (`feat(W5): migrate regulator action cascades to registry rules` + trailer).

---

### Task 8: `grid-dispatch.ts` — grid.instruction_issued / grid.instruction_non_compliant

**Files:**
- Create: `open-energy-platform/src/cascade-rules/grid-dispatch.ts`
- Create: `open-energy-platform/tests/cascade-rules-grid-dispatch.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `grid.instruction_issued` (3728-3744), `grid.instruction_non_compliant` (3746-3762)

Bodies use `enqueueAction(ctx.env.DB, …)` + `daysFromNow`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerGridDispatchRules } from '../src/cascade-rules/grid-dispatch';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerGridDispatchRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'dispatch_instructions', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('grid-dispatch rules', () => {
  it('instruction_issued queues an urgent dispatch_acknowledge', async () => {
    await runCascadeRegistry(ctx('grid.instruction_issued', 'di1', { participant_id: 'p1', instruction_number: 'DI-1', target_mw: 50 }));
    const aq = db.prepare(`SELECT type, priority, assignee_id FROM action_queue WHERE entity_id = 'di1'`).get() as any;
    expect(aq).toMatchObject({ type: 'dispatch_acknowledge', priority: 'urgent', assignee_id: 'p1' });
  });

  it('instruction_non_compliant queues a non_compliance action', async () => {
    await runCascadeRegistry(ctx('grid.instruction_non_compliant', 'di2', { participant_id: 'p2', penalty_amount_zar: 1000 }));
    const aq = db.prepare(`SELECT type FROM action_queue WHERE entity_id = 'di2'`).get() as { type: string };
    expect(aq.type).toBe('non_compliance');
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `grid-dispatch.ts`** (`registerGridDispatchRules`, two rules; import `{ enqueueAction, daysFromNow } from './_enqueue'`).
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete switch cases** (bottom-up: non_compliant 3746-3762, issued 3728-3744).
- [ ] **Step 6: Run task test + `npm run check` + full suite.**
- [ ] **Step 7: Commit** (`feat(W5): migrate grid dispatch cascades to registry rules` + trailer).

---

### Task 9: `trader-margin.ts` — trader.margin_call_issued

**Files:**
- Create: `open-energy-platform/src/cascade-rules/trader-margin.ts`
- Create: `open-energy-platform/tests/cascade-rules-trader-margin.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `trader.margin_call_issued` (3764-3782)

Body uses `enqueueAction(ctx.env.DB, …)` + `daysFromNow` (and a conditional `(ctx.data.due_by as string).slice(0,10)`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerTraderMarginRules } from '../src/cascade-rules/trader-margin';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerTraderMarginRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'margin_calls', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('trader-margin rules', () => {
  it('margin_call_issued queues an urgent margin_call with the explicit due date', async () => {
    await runCascadeRegistry(ctx('trader.margin_call_issued', 'mc1', { participant_id: 'p1', shortfall_zar: 25000, due_by: '2026-07-15T00:00:00Z' }));
    const aq = db.prepare(`SELECT type, priority, assignee_id, due_date FROM action_queue WHERE entity_id = 'mc1'`).get() as any;
    expect(aq).toMatchObject({ type: 'margin_call', priority: 'urgent', assignee_id: 'p1', due_date: '2026-07-15' });
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `trader-margin.ts`** (`registerTraderMarginRules`, one rule `id: 'trader_margin.margin_call_issued'`; import `{ enqueueAction, daysFromNow } from './_enqueue'`).
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete switch case** (3764-3782).
- [ ] **Step 6: Run task test + `npm run check` + full suite.**
- [ ] **Step 7: Commit** (`feat(W5): migrate trader.margin_call_issued cascade to registry rule` + trailer).

---

### Task 10: `lender-covenant.ts` — covenant_breach action queues + watchlist/dunning materializer

**Files:**
- Create: `open-energy-platform/src/cascade-rules/lender-covenant.ts`
- Create: `open-energy-platform/tests/cascade-rules-lender-covenant.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `lender.covenant_breach` switch case (3784-3825), delete the `materializeLenderWatchlist` function (3936-4025), delete its call site (3869-3875), **remove the now-orphaned `initialDunningCycle` import (line 6)**

This task migrates TWO things that share the `lender.covenant_breach` event:
1. The switch case (3784-3825) — enqueues covenant-breach actions for lender + developer via `enqueueActions`. Uses `cachedProjectDeveloper` + `daysFromNow`.
2. `materializeLenderWatchlist` (3936-4025) — fires on `lender.covenant_breach` OR `lender.covenant_warn`; inserts `oe_lender_watchlist` + `oe_lender_watchlist_events` + `oe_lender_dunning_notices` using `initialDunningCycle`.

Implement as TWO rules in one file. Rule A (`lender_covenant.breach_actions`, match `covenant_breach`) = the switch body. Rule B (`lender_covenant.watchlist_materializer`, match `covenant_breach || covenant_warn`) = the materializer body verbatim, with `initialDunningCycle` imported from `'../utils/lender-escalation-spec'` and `generateId`→`genId`.

**Why removing the import matters:** once `materializeLenderWatchlist` is deleted from cascade.ts, `initialDunningCycle` is no longer referenced there → `noUnusedLocals` fails `npm run check`. The import MUST move to the rule file and be deleted from cascade.ts line 6 in this same task.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerLenderCovenantRules } from '../src/cascade-rules/lender-covenant';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerLenderCovenantRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'covenant_tests', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('lender-covenant rules', () => {
  it('covenant_breach queues actions for lender + developer AND opens a watchlist with a cycle-1 dunning notice', async () => {
    db.prepare(`INSERT INTO ipp_projects (id, developer_id) VALUES ('proj1','dev1')`).run();
    await runCascadeRegistry(ctx('lender.covenant_breach', 'ct1', {
      lender_participant_id: 'lend1', project_id: 'proj1', covenant_code: 'DSCR',
      measured_value: 1.1, threshold: 1.2, test_period: 'Q2-2026',
      facility_id: 'fac1', borrower_id: 'dev1',
    }));
    // action_queue: lender + developer
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE type = 'covenant_breach' AND entity_id = 'ct1'`).get() as { n: number };
    expect(aq.n).toBe(2);
    // watchlist + dunning materialized
    const wl = db.prepare(`SELECT COUNT(*) n FROM oe_lender_watchlist WHERE facility_id = 'fac1' AND participant_id = 'dev1'`).get() as { n: number };
    expect(wl.n).toBe(1);
    const dn = db.prepare(`SELECT COUNT(*) n FROM oe_lender_dunning_notices WHERE facility_id = 'fac1' AND cycle = 1`).get() as { n: number };
    expect(dn.n).toBe(1);
  });

  it('covenant_warn materializes watchlist+dunning but does NOT queue breach actions', async () => {
    await runCascadeRegistry(ctx('lender.covenant_warn', 'ct2', { facility_id: 'fac2', borrower_id: 'dev2', covenant_code: 'LLCR' }));
    const aq = db.prepare(`SELECT COUNT(*) n FROM action_queue WHERE entity_id = 'ct2'`).get() as { n: number };
    expect(aq.n).toBe(0);
    const wl = db.prepare(`SELECT COUNT(*) n FROM oe_lender_watchlist WHERE facility_id = 'fac2'`).get() as { n: number };
    expect(wl.n).toBe(1);
  });

  it('does not duplicate the watchlist row when an open one already exists', async () => {
    await runCascadeRegistry(ctx('lender.covenant_breach', 'ct3', { facility_id: 'fac3', borrower_id: 'dev3', covenant_code: 'DSCR' }));
    await runCascadeRegistry(ctx('lender.covenant_breach', 'ct3b', { facility_id: 'fac3', borrower_id: 'dev3', covenant_code: 'DSCR' }));
    const wl = db.prepare(`SELECT COUNT(*) n FROM oe_lender_watchlist WHERE facility_id = 'fac3' AND participant_id = 'dev3' AND cleared_at IS NULL`).get() as { n: number };
    expect(wl.n).toBe(1);
    const dn = db.prepare(`SELECT COUNT(*) n FROM oe_lender_dunning_notices WHERE facility_id = 'fac3'`).get() as { n: number };
    expect(dn.n).toBe(2); // each breach issues a fresh notice against the same watchlist
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `lender-covenant.ts`**

Imports: `{ enqueueActions, daysFromNow, genId } from './_enqueue'`, `{ cachedProjectDeveloper } from '../utils/cascade'`, `{ initialDunningCycle } from '../utils/lender-escalation-spec'`, `{ registerCascadeRule } from '../utils/cascade-registry'`. Rule A body = the switch case (3785-3824) verbatim (`enqueueActions(ctx.env.DB, assignments)`, `cachedProjectDeveloper(ctx.env, projectId)`, `daysFromNow`). Rule B body = the `materializeLenderWatchlist` body (3937-4025) verbatim with `generateId`→`genId` (the early-return guard `if (ctx.event !== 'lender.covenant_breach' && ctx.event !== 'lender.covenant_warn') return;` can stay inside `run` OR be expressed in `match` — keep it in `match` for clarity: `match: (ctx) => ctx.event === 'lender.covenant_breach' || ctx.event === 'lender.covenant_warn'`, and drop the redundant in-body guard).

- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete from cascade.ts** (bottom-up): `materializeLenderWatchlist` def (3936-4025), the `try { await materializeLenderWatchlist(ctx) } catch …` call (3869-3875), the `lender.covenant_breach` switch case (3784-3825). Then remove the orphaned import on line 6: `import { initialDunningCycle } from './lender-escalation-spec';`.
- [ ] **Step 6: Run task test + `npm run check` + full suite.** `npm run check` MUST pass — confirms `initialDunningCycle` is no longer orphaned in cascade.ts. Watch the full suite for any existing lender-watchlist test that previously asserted the materializer ran via `fireCascade`; it should STILL pass because `fireCascade`→registry now drives it.
- [ ] **Step 7: Commit** (`feat(W5): migrate lender covenant breach + watchlist materializer to registry rules` + trailer; include the cascade.ts import removal).

---

### Task 11: `carbon-events.ts` — carbon.mrv_verified

**Files:**
- Create: `open-energy-platform/src/cascade-rules/carbon-events.ts`
- Create: `open-energy-platform/tests/cascade-rules-carbon-events.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `carbon.mrv_verified` (3850-3866)

Body uses `enqueueAction(ctx.env.DB, …)` + `daysFromNow`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerCarbonEventRules } from '../src/cascade-rules/carbon-events';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerCarbonEventRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'mrv_verifications', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('carbon-events rules', () => {
  it('mrv_verified queues an issuance follow-up for the submitter', async () => {
    await runCascadeRegistry(ctx('carbon.mrv_verified', 'mrv1', { submitted_by: 'p1', opinion: 'positive', verified_reductions_tco2e: 12000 }));
    const aq = db.prepare(`SELECT type, assignee_id FROM action_queue WHERE entity_id = 'mrv1'`).get() as any;
    expect(aq).toMatchObject({ type: 'mrv_followup', assignee_id: 'p1' });
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `carbon-events.ts`** (`registerCarbonEventRules`, rule `id: 'carbon_events.mrv_verified'`; import `{ enqueueAction, daysFromNow } from './_enqueue'`).
- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete switch case** (3850-3866). At this point the switch should be EMPTY — only the `switch (ctx.event) { }` shell + the materializer calls remain. Leave them; Task 12 + 13 handle them.
- [ ] **Step 6: Run task test + `npm run check` + full suite.**
- [ ] **Step 7: Commit** (`feat(W5): migrate carbon.mrv_verified cascade to registry rule` + trailer).

---

### Task 12: `regulator-inbox.ts` — spec-driven regulator inbox materializer

**Files:**
- Create: `open-energy-platform/src/cascade-rules/regulator-inbox.ts`
- Create: `open-energy-platform/tests/cascade-rules-regulator-inbox.test.ts`
- Modify: `src/cascade-rules/index.ts`
- Modify: `src/utils/cascade.ts` — delete `materializeRegulatorInbox` def (3900-3924), delete its call (3877-3885), **remove the now-orphaned `regulatorInboxSpec, computeSlaDueAt` import (line 5)**

`materializeRegulatorInbox` is event-agnostic — it calls `regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data)` and only acts when that returns non-null. The rule's `match` therefore CANNOT be a single-event check. Make `match` return `true` always and let the body early-return when the spec is null (the registry writes an `oe_cascade_rule_audit` row on every event, but the rule does nothing unless the spec matches). To avoid an audit row on every single cascade event (noise), make `match` call the spec: `match: (ctx) => regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data) != null`. `match` is wrapped in try/catch by `runCascadeRegistry`, so a spec throw degrades to `false` safely. The body then re-derives the spec (cheap, pure) and inserts.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { regulatorInboxSpec } from '../src/utils/regulator-inbox-spec';
import { registerRegulatorInboxRules } from '../src/cascade-rules/regulator-inbox';

let db: Database.Database; let env: Record<string, unknown>;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  _resetRegistryForTests(); registerRegulatorInboxRules();
});
afterEach(() => { db.close(); });
function ctx(event: string, entity_id: string, data: Record<string, unknown>) {
  return { event, entity_type: 'x', entity_id, data, actor_id: 'actor-1', env } as any;
}

describe('regulator-inbox rule', () => {
  it('inserts an inbox row for a spec-matched event', async () => {
    // Pick any event the spec recognizes. Find one dynamically so the test is
    // resilient to the spec's allowlist contents.
    const probe = ['regulator.licence_revoked', 'lender.covenant_breach', 'grid.instruction_non_compliant', 'trader.margin_call_issued']
      .find((e) => regulatorInboxSpec(e, 'e1', {}) != null);
    expect(probe).toBeDefined();
    await runCascadeRegistry(ctx(probe as string, 'e1', { foo: 'bar' }));
    const row = db.prepare(`SELECT ack_status, sla_due_at FROM oe_regulator_inbox WHERE source_event = ?`).get(probe) as any;
    expect(row).toBeTruthy();
    expect(row.ack_status).toBe('pending');
    expect(row.sla_due_at).toBeTruthy();
  });

  it('inserts nothing for a non-spec event', async () => {
    await runCascadeRegistry(ctx('auth.login', 'e2', {}));
    const n = db.prepare(`SELECT COUNT(*) n FROM oe_regulator_inbox`).get() as { n: number };
    expect(n.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Create `regulator-inbox.ts`**

Imports: `{ regulatorInboxSpec, computeSlaDueAt } from '../utils/regulator-inbox-spec'`, `{ genId } from './_enqueue'`, `{ registerCascadeRule } from '../utils/cascade-registry'`. One rule:

```typescript
export function registerRegulatorInboxRules(): void {
  registerCascadeRule({
    id: 'regulator_inbox.materialize',
    match: (ctx) => regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data) != null,
    run: async (ctx) => {
      const spec = regulatorInboxSpec(ctx.event, ctx.entity_id, ctx.data);
      if (!spec) return;
      const now = new Date();
      const dueAt = computeSlaDueAt(spec.severity, now);
      await ctx.env.DB.prepare(`
        INSERT INTO oe_regulator_inbox
          (id, source_event, source_entity_type, source_entity_id, severity,
           title, body_json, ack_status, sla_due_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `).bind(
        genId(), ctx.event, ctx.entity_type, ctx.entity_id, spec.severity,
        spec.title, JSON.stringify(ctx.data || {}), dueAt, now.toISOString(), now.toISOString(),
      ).run();
    },
  });
}
```

(This is the `materializeRegulatorInbox` body verbatim, just `generateId`→`genId` and wrapped.)

- [ ] **Step 4: Register in barrel.**
- [ ] **Step 5: Delete from cascade.ts** (bottom-up): `materializeRegulatorInbox` def (3900-3924), the `try { await materializeRegulatorInbox(ctx) } catch …` call (3877-3885). Remove the orphaned import on line 5: `import { regulatorInboxSpec, computeSlaDueAt } from './regulator-inbox-spec';`. At this point `handleSpecialCascades` is just `const db = ctx.env.DB; switch (ctx.event) { } ` + the two (now-deleted) try blocks — i.e. it has an unused `db` local and an empty switch. Leave the husk for Task 13.
- [ ] **Step 6: Run task test + `npm run check` + full suite.** If `npm run check` complains that `db` is unused inside the husk of `handleSpecialCascades`, that's expected — Task 13 deletes the whole function. If it blocks the build NOW, temporarily prefix with `void db;` — but prefer to proceed straight to Task 13 in the same session so the husk never lands. (If committing here, add `void db;` to keep `npm run check` green, and remove it in Task 13.)
- [ ] **Step 7: Commit** (`feat(W5): migrate regulator-inbox materializer to registry rule` + trailer).

---

### Task 13: Delete `handleSpecialCascades` + the `special` stage; final cleanup

**Files:**
- Modify: `open-energy-platform/src/utils/cascade.ts`

Now the switch is empty and both materializers are gone. Delete the husk + the stage wiring + the orphaned helpers, and repoint `retryDlqItem`.

- [ ] **Step 1: Delete the `handleSpecialCascades` function**

Delete the entire `async function handleSpecialCascades(ctx: CascadeContext): Promise<void> { … }` (now ~3314 down to its closing brace, including the empty `switch` and any leftover `void db;`).

- [ ] **Step 2: Remove the `special` stage call in `fireCascade`**

Delete line 2426: `await runStage(ctx, 'special', () => handleSpecialCascades(ctx));` and its preceding comment if any. The registry stage (2437) now owns everything the special stage did.

- [ ] **Step 3: Repoint `retryDlqItem`**

In `retryDlqItem` (the `switch (row.stage)` at ~2620), change:
```typescript
      case 'special':
        await handleSpecialCascades(ctx);
        break;
```
to:
```typescript
      case 'special':
        // Legacy DLQ rows recorded under the old 'special' stage replay through
        // the registry now that handleSpecialCascades is gone.
        await runCascadeRegistry(ctx);
        break;
```
Keep `'special'` in all three stage union types (`runStage` ~2511, `writeToDlq` ~2536, `retryDlqItem` row cast ~2592) so historical `cascade_dlq` rows with `stage='special'` still parse and replay.

- [ ] **Step 4: Delete the orphaned helpers from cascade.ts**

Delete (they now live in `_enqueue.ts` and nothing in cascade.ts calls them): `daysFromNow` (4028-4030), `EnqueueActionInput` interface (4036-4046), `enqueueAction` (4048-4050), `enqueueActions` (4052-4096). **KEEP `generateId` (4032-4034)** — surviving code uses it. **KEEP `cachedProjectDeveloper`** (now `export`ed).

- [ ] **Step 5: Verify line count + no orphans**

```bash
cd open-energy-platform
wc -l src/utils/cascade.ts          # expect < 3300
grep -n "handleSpecialCascades" src/utils/cascade.ts   # expect: no matches
grep -n "materializeRegulatorInbox\|materializeLenderWatchlist" src/utils/cascade.ts  # expect: no matches
grep -n "enqueueAction\|enqueueActions\|daysFromNow\|EnqueueActionInput" src/utils/cascade.ts  # expect: no matches
grep -n "regulatorInboxSpec\|computeSlaDueAt\|initialDunningCycle" src/utils/cascade.ts  # expect: no matches
npm run check                        # tsc clean — no unused locals
```

- [ ] **Step 6: Full suite + commit**

```bash
npm test
git add src/utils/cascade.ts
git commit -m "$(cat <<'EOF'
feat(W5): delete handleSpecialCascades; registry owns all special cascades

The 19 switch cases + both materializers now live in self-registering
src/cascade-rules/*.ts files. fireCascade's 'special' stage is removed;
retryDlqItem replays legacy 'special' DLQ rows through runCascadeRegistry.
Orphaned enqueue helpers deleted (moved to _enqueue.ts). cascade.ts now
under 3,300 lines. generateId + cachedProjectDeveloper retained for
surviving notification/recipient code.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14 (review gate): final whole-diff review

- [ ] **Step 1: Forbidden-edit audit**

```bash
cd open-energy-platform
git diff --name-only feat/ecosystem-foundation~13 -- 'src/utils/*-spec.ts' 'src/routes/*-chain.ts'   # expect: EMPTY (no spec/chain edits)
git diff --stat HEAD~13 -- migrations/   # expect: EMPTY (no migration changes)
```
The ONLY files in cascade.ts's diff should be additive deletions of the migrated cases + the helper/import removals + the `cachedProjectDeveloper` export + the `retryDlqItem` repoint.

- [ ] **Step 2: Dispatch a final code-reviewer subagent** over the whole 13-commit range with the brief: "Verify every migrated rule is byte-equivalent to its deleted switch case (same tables, same columns, same actor_id, same id format); confirm no event is now handled by BOTH a rule and a switch case (double-fire); confirm `npm run check` + `npm test` are green; confirm no `*-spec.ts` / `*-chain.ts` / migration files were touched."

- [ ] **Step 3:** Report the verdict. Do NOT merge/push/PR — keep branch `feat/ecosystem-foundation` as-is (the user authorizes outward-facing actions separately).

---

## Self-Review (against the spec)

- **Spec coverage:** all 19 switch cases (trade.matched, contract.signed, invoice.issued, invoice.paid, contract.phase_changed, dispute.filed, ipp.milestone_satisfied, ona.fault_detected, ipp.financial_close, esg.decarbonisation_completed, regulator.licence_suspended/revoked, regulator.enforcement_finding, regulator.surveillance_escalated, grid.instruction_issued, grid.instruction_non_compliant, trader.margin_call_issued, lender.covenant_breach, ipp.insurance_expiring, carbon.mrv_verified) + both materializers are assigned to Tasks 2-12. Helpers (Task 1). Deletion + stage removal + DLQ repoint (Task 13). ✓
- **Atomicity:** every migration task adds the rule AND deletes the case in the same commit, then runs the full suite. ✓
- **Orphaned-import handling:** Task 10 removes the `initialDunningCycle` import; Task 12 removes the `regulatorInboxSpec, computeSlaDueAt` import; Task 13 removes the orphaned enqueue helpers. ✓
- **`generateId` / `cachedProjectDeveloper` retained** (Task 4 exports the latter; Task 13 explicitly keeps both). ✓
- **`ctx.actor_id` preserved** (no `system:cascade` substitution). ✓
- **No spec/chain/migration edits.** ✓ (Task 14 audits.)
- **Type consistency:** `genId` (in `_enqueue.ts`, `id_` format) is distinct from `cascade-registry.ts::genId` (`cra_` format, module-private) — no collision; rule files import the `_enqueue` one. ✓
