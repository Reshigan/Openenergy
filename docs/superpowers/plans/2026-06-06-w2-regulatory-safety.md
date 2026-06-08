# Week 2 — Regulatory Trading-Safety Block + Role-Actions API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make FSCA trader-safety enforcement real end-to-end: an algo-cert kill-switch or a market-abuse STOR filing must write an active trading block that the pre-trade guard enforces on the affected trader's next order; expose the Layer-C cross-role push queue over HTTP.

**Architecture:** Three additive layers wired through the existing `fireCascade()` god node and the existing `evaluateOrder()` guard — **no rewrite**. (1) A new additive bridge table `oe_trading_party_link` maps the surveillance/cert "party" id-namespace (`firm_party_id`, `subject_party_id`) to the trading `participant_id` (= JWT `sub`). (2) A self-registering cascade rule (`src/cascade-rules/trading-safety.ts`) writes/lifts rows in the existing `oe_algo_trading_blocks` table on the block/lift events and pushes a role-action to the affected trader. (3) `loadRiskSnapshot()` resolves an active block by **dual key** (direct `participant_id` match OR via the bridge table) and `evaluateOrder()` rejects with a new `ALGO_TRADING_BLOCKED` reason code. A new `src/routes/role-actions.ts` exposes the Layer-C queue, scoped so a row never leaks across tenants.

**Tech Stack:** Cloudflare Worker · Hono · D1 (SQLite) · Workers KV · TypeScript · vitest (`node` env, `createTestDb`/`envFor` from `tests/helpers/d1-sqlite.ts`).

**Why this slice:** Blueprint W2 = "Regulatory safety rules (#2,5,6,9, `mode:block`) + pre-trade guard live wiring + role-actions API." This plan delivers the coherent, deployable FSCA trader-safety core (#2 algo kill-switch, #5 market-abuse STOR) + the role-actions API. OHSA safety rules (#6 permit-to-work, #9 work-order) are **deferred to W3** — they need the drive-rule machinery + a PTW↔WO data-model bridge (`om_work_orders` has only `site_id`, no clean PTW link) that couples better with W3's lifecycle sequencing.

**The critical design finding this plan resolves:** algo certs carry `firm_party_id` (seed value `'firm_vantage'`) and market-abuse cases carry `subject_party_id` (seed value `'mbr_desk_07'`). Neither is a `participants.id`. The trading guard checks `user.id` (= `participants.id`). Writing a block keyed on `firm_party_id` while the guard checks `user.id` would be a **silent no-op safety failure**. Resolution: dual-key resolution via the additive `oe_trading_party_link` bridge + observability — the block row, the rule-audit row, and the role-action always exist, so a mapping gap is *visible*, never silent. The guard matches whether a cert/case was created with its party id set directly to a `participant_id` (direct match) OR linked via the bridge table.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `open-energy-platform/migrations/480_w2_trading_party_link.sql` | Additive bridge table mapping party-id ↔ participant-id | Create |
| `open-energy-platform/src/routes/role-actions.ts` | Layer-C cross-role push HTTP surface (list/count/ack/action/dismiss), tenant-scoped | Create |
| `open-energy-platform/src/index.ts` | Mount `/api/role-actions` | Modify |
| `open-energy-platform/src/cascade-rules/trading-safety.ts` | Block/lift cascade rules (#2 algo, #5 STOR) + trader role-action push | Create |
| `open-energy-platform/src/cascade-rules/index.ts` | Barrel: self-register trading-safety rules at boot | Modify |
| `open-energy-platform/src/utils/pre-trade-guards.ts` | `ALGO_TRADING_BLOCKED` reason code + `trading_block_active` snapshot field + guard arm | Modify |
| `open-energy-platform/src/routes/trading.ts` | `loadRiskSnapshot()` dual-key block resolution | Modify |
| `open-energy-platform/src/utils/rejection-explainer.ts` | Deterministic fallback arm for `ALGO_TRADING_BLOCKED` | Modify |
| `open-energy-platform/tests/w2-trading-party-link.test.ts` | Migration 480 schema test | Create |
| `open-energy-platform/tests/role-actions-api.test.ts` | Route mount + scoped read/write tests | Create |
| `open-energy-platform/tests/trading-safety-rule.test.ts` | Cascade block/lift + role-action push tests | Create |
| `open-energy-platform/tests/pre-trade-block-guard.test.ts` | Guard arm + dual-key snapshot resolution + explainer fallback | Create |

**Locked invariants (do not violate):**
- Schema is **additive only**. New migration starts at **480** (479 is the highest existing). `CREATE TABLE IF NOT EXISTS` only. Never `ALTER` an existing column.
- Auto-progressed cascade actions run as actor `system:cascade` — never impersonate the affected role.
- All read/write routes filter by tenant/participant scope.
- Goldrush sites: never INSERT synthetic kWh/billing rows (not touched here).

All commands below run from `open-energy-platform/`.

---

## Task 1: Migration 480 — `oe_trading_party_link` bridge table

**Files:**
- Create: `open-energy-platform/migrations/480_w2_trading_party_link.sql`
- Test: `open-energy-platform/tests/w2-trading-party-link.test.ts`

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/w2-trading-party-link.test.ts`:

```ts
// Migration 480 — the additive bridge table that maps the surveillance/cert
// "party" id-namespace (firm_party_id / subject_party_id) to the trading
// participant_id. Proves the table + indexes exist after migrations apply and
// that a link row round-trips.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';

let db: Database.Database;

beforeEach(() => { db = createTestDb({ applyMigrations: true }); });
afterEach(() => { db.close(); });

describe('migration 480 — oe_trading_party_link', () => {
  it('creates the table with the expected columns', () => {
    const cols = db.prepare(`PRAGMA table_info(oe_trading_party_link)`).all() as Array<{ name: string }>;
    const names = cols.map(c => c.name).sort();
    expect(names).toEqual(['created_at', 'id', 'link_type', 'participant_id', 'party_id'].sort());
  });

  it('round-trips a link row', () => {
    db.prepare(
      `INSERT INTO oe_trading_party_link (id, participant_id, party_id, link_type, created_at)
       VALUES ('tpl_1', 'par_trader', 'firm_vantage', 'trading_party', '2026-06-06T00:00:00Z')`,
    ).run();
    const row = db.prepare(
      `SELECT participant_id, party_id, link_type FROM oe_trading_party_link WHERE party_id = 'firm_vantage'`,
    ).get() as { participant_id: string; party_id: string; link_type: string };
    expect(row.participant_id).toBe('par_trader');
    expect(row.link_type).toBe('trading_party');
  });

  it('indexes both lookup directions', () => {
    const idx = (db.prepare(`PRAGMA index_list(oe_trading_party_link)`).all() as Array<{ name: string }>).map(i => i.name);
    expect(idx).toContain('idx_trading_party_link_participant');
    expect(idx).toContain('idx_trading_party_link_party');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/w2-trading-party-link.test.ts`
Expected: FAIL — `no such table: oe_trading_party_link`.

- [ ] **Step 3: Create the migration**

Create `open-energy-platform/migrations/480_w2_trading_party_link.sql`:

```sql
-- ════════════════════════════════════════════════════════════════════════
-- W2 — bridge the surveillance/cert "party" id-namespace to trading participants.
--
-- Algo certifications carry firm_party_id; market-abuse cases carry
-- subject_party_id. Neither is a participants.id. The pre-trade guard checks
-- the trading participant_id (== JWT sub). This OPTIONAL, ADDITIVE map lets the
-- guard resolve a trader to the party id(s) a kill-switch / STOR block is
-- written against.
--
-- When the map is empty the guard falls back to a DIRECT participant_id match,
-- so a block still enforces when a cert/case is created with its party id set
-- to the participant id directly. A mapping gap is therefore observable (the
-- block row + rule audit + role-action all exist) — never a silent no-op.
--
-- Additive only. No existing rows are touched.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS oe_trading_party_link (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,        -- participants.id (== trading user.id)
  party_id        TEXT NOT NULL,        -- firm_party_id / subject_party_id namespace
  link_type       TEXT NOT NULL DEFAULT 'trading_party'
                    CHECK (link_type IN ('trading_party', 'surveillance_party')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trading_party_link_participant
  ON oe_trading_party_link (participant_id);
CREATE INDEX IF NOT EXISTS idx_trading_party_link_party
  ON oe_trading_party_link (party_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/w2-trading-party-link.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add migrations/480_w2_trading_party_link.sql tests/w2-trading-party-link.test.ts
git commit -m "feat(w2): migration 480 — oe_trading_party_link bridge table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Layer-C role-actions HTTP API

**Files:**
- Create: `open-energy-platform/src/routes/role-actions.ts`
- Modify: `open-energy-platform/src/index.ts` (add import + mount)
- Test: `open-energy-platform/tests/role-actions-api.test.ts`

**Context the implementer needs:**
- Auth: `roleActions.use('*', authMiddleware)` runs `authMiddleware` from `../middleware/auth`, which reads `c.env.JWT_SECRET`, verifies the HS256 JWT, resolves tenant, and sets `c.get('auth')`. `getCurrentUser(c)` returns `{ id, role, tenant_id }`.
- `pushRoleAction`/`pendingCountForRole` live in `../utils/role-actions`. `pendingCountForRole(env, role)` is KV-cached (TTL 30s) under key `role_queue_pending:<role>`.
- Queue table `oe_role_action_queue` columns: `id, target_role, target_participant_id, source_event, source_chain_key, source_entity_type, source_entity_id, title, body_json, cross_option_json, priority, status, sla_due_at, actioned_by, actioned_at, created_at, updated_at`. `status` ∈ {pending, acknowledged, actioned, dismissed, expired}.
- **Tenant isolation:** the queue table has no `tenant_id`. Scope every query with `target_role = ? AND (target_participant_id IS NULL OR target_participant_id = ?)` binding `(user.role, user.id)`. A participant-targeted row is then only visible to that participant (and `participant_id`→`tenant_id` is 1:1), so a row never leaks across tenants. Role-wide rows (`target_participant_id IS NULL`) are visible to all users of that role by design.
- Mount **flat** at `/api/role-actions` (no param in basePath → no Hono basePath collision, per the saved route-mount lesson).
- The test D1 facade returns `{ meta: { changes } }` from `.run()` and `{ results }` from `.all()`.

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/role-actions-api.test.ts`:

```ts
// Layer-C role-actions HTTP surface. Verifies the routes are mounted and that
// reads/writes are scoped: a caller sees role-wide + own-participant rows for
// their role only, and can only mutate rows in that scope (else 404).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import type { Hono } from 'hono';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { signToken } from '../src/middleware/auth';
import roleActions from '../src/routes/role-actions';

let db: Database.Database;
let env: any;

type RouteEntry = { method: string; path: string };
function has(app: Hono<any>, method: string, path: string): boolean {
  const rs = (app as unknown as { routes: RouteEntry[] }).routes;
  return rs.some(r => r.method.toUpperCase() === method.toUpperCase() && r.path === path);
}

async function traderToken(): Promise<string> {
  return signToken({ sub: 'par_trader', role: 'trader', email: 't@openenergy.co.za' } as any, 'test-secret');
}

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
     VALUES (?, ?, 'x', ?, ?, 'active', 'approved', 'default', '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, `${id}@openenergy.co.za`, id, role);
}

function seedQueueRow(id: string, targetRole: string, targetParticipant: string | null, status = 'pending') {
  db.prepare(
    `INSERT INTO oe_role_action_queue
       (id, target_role, target_participant_id, source_event, source_entity_type, source_entity_id,
        title, body_json, priority, status, created_at, updated_at)
     VALUES (?, ?, ?, 'algo_certification.suspended', 'algo_certification', 'cert_1',
             'Algo trading suspended', '{}', 'urgent', ?, '2026-06-06T00:00:00Z', '2026-06-06T00:00:00Z')`,
  ).run(id, targetRole, targetParticipant, status);
}

beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); seedParticipant('par_trader', 'trader'); });
afterEach(() => { db.close(); });

describe('role-actions API — mount', () => {
  it('mounts list / count / lifecycle routes', () => {
    expect(has(roleActions, 'GET', '/')).toBe(true);
    expect(has(roleActions, 'GET', '/count')).toBe(true);
    expect(has(roleActions, 'POST', '/:id/acknowledge')).toBe(true);
    expect(has(roleActions, 'POST', '/:id/action')).toBe(true);
    expect(has(roleActions, 'POST', '/:id/dismiss')).toBe(true);
  });
});

describe('role-actions API — scoped reads', () => {
  it('returns role-wide and own-participant rows, hides other-participant and other-role rows', async () => {
    seedQueueRow('raq_wide', 'trader', null);              // role-wide → visible
    seedQueueRow('raq_mine', 'trader', 'par_trader');      // mine → visible
    seedQueueRow('raq_other', 'trader', 'par_other');      // other participant → hidden
    seedQueueRow('raq_role', 'regulator', null);           // other role → hidden
    const token = await traderToken();
    const res = await roleActions.request('/', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string }> };
    const ids = body.items.map(i => i.id).sort();
    expect(ids).toEqual(['raq_mine', 'raq_wide']);
  });
});

describe('role-actions API — scoped writes', () => {
  it('acknowledges an in-scope row', async () => {
    seedQueueRow('raq_mine', 'trader', 'par_trader');
    const token = await traderToken();
    const res = await roleActions.request('/raq_mine/acknowledge', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT status FROM oe_role_action_queue WHERE id = 'raq_mine'`).get() as { status: string };
    expect(row.status).toBe('acknowledged');
  });

  it('404s when mutating an out-of-scope row', async () => {
    seedQueueRow('raq_other', 'trader', 'par_other');
    const token = await traderToken();
    const res = await roleActions.request('/raq_other/dismiss', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).toBe(404);
    const row = db.prepare(`SELECT status FROM oe_role_action_queue WHERE id = 'raq_other'`).get() as { status: string };
    expect(row.status).toBe('pending'); // untouched
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/role-actions-api.test.ts`
Expected: FAIL — cannot import `../src/routes/role-actions` (module not found).

- [ ] **Step 3: Create the route**

Create `open-energy-platform/src/routes/role-actions.ts`:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// Layer C — Cross-Role Push HTTP surface.
// Reads/mutates oe_role_action_queue for the CURRENT user's role. Every query
// is scoped to (target_role = caller.role) AND (row is role-wide OR addressed
// to the caller's participant id) so a participant-targeted row never leaks
// across tenants. Writes (acknowledge/action/dismiss) are scoped the same way —
// a caller can only mutate rows in their own role+participant scope.
// ═══════════════════════════════════════════════════════════════════════════
import { Hono } from 'hono';
import type { HonoEnv } from '../utils/types';
import { authMiddleware, getCurrentUser } from '../middleware/auth';
import { pendingCountForRole } from '../utils/role-actions';

const roleActions = new Hono<HonoEnv>();
roleActions.use('*', authMiddleware);

// Visibility predicate. Binds (target_role, participant_id).
const SCOPE = `target_role = ? AND (target_participant_id IS NULL OR target_participant_id = ?)`;

function safeParse(s: unknown): unknown {
  if (!s || typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch { return null; }
}

function decodeRow(r: Record<string, unknown>): Record<string, unknown> {
  return { ...r, body: safeParse(r.body_json), cross_option: safeParse(r.cross_option_json) };
}

// GET / — actions for the caller's role (newest first). Optional ?status= filter.
roleActions.get('/', async (c) => {
  const user = getCurrentUser(c);
  const status = c.req.query('status');
  const sql =
    `SELECT id, target_role, target_participant_id, source_event, source_chain_key,
            source_entity_type, source_entity_id, title, body_json, cross_option_json,
            priority, status, sla_due_at, actioned_by, actioned_at, created_at, updated_at
       FROM oe_role_action_queue
      WHERE ${SCOPE}${status ? ' AND status = ?' : ''}
      ORDER BY created_at DESC LIMIT 200`;
  const binds = status ? [user.role, user.id, status] : [user.role, user.id];
  const rows = await c.env.DB.prepare(sql).bind(...binds).all<Record<string, unknown>>();
  return c.json({ items: (rows.results ?? []).map(decodeRow) });
});

// GET /count — pending badge count for the caller's role (KV-cached via util).
roleActions.get('/count', async (c) => {
  const user = getCurrentUser(c);
  const pending = await pendingCountForRole(c.env, user.role);
  return c.json({ pending });
});

async function transitionStatus(c: Parameters<Parameters<typeof roleActions.post>[1]>[0], next: 'acknowledged' | 'actioned' | 'dismissed') {
  const user = getCurrentUser(c);
  const id = c.req.param('id');
  const now = new Date().toISOString();
  const res = await c.env.DB.prepare(
    `UPDATE oe_role_action_queue
        SET status = ?, actioned_by = ?, actioned_at = ?, updated_at = ?
      WHERE id = ? AND ${SCOPE}`,
  ).bind(next, user.id, next === 'actioned' ? now : null, now, id, user.role, user.id).run();
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;
  if (!changes) return c.json({ error: 'not_found' }, 404);
  try { await c.env.KV.delete(`role_queue_pending:${user.role}`); } catch { /* best-effort */ }
  return c.json({ id, status: next });
}

roleActions.post('/:id/acknowledge', (c) => transitionStatus(c, 'acknowledged'));
roleActions.post('/:id/action', (c) => transitionStatus(c, 'actioned'));
roleActions.post('/:id/dismiss', (c) => transitionStatus(c, 'dismissed'));

export default roleActions;
```

> Note on the `transitionStatus` parameter type: if the `Parameters<...>` helper type is awkward in this codebase, type the first parameter as `Context<HonoEnv>` (import `type { Context } from 'hono'`). Either is acceptable — match whichever the surrounding route files use. Functionally the handler is unchanged.

- [ ] **Step 4: Run test to verify route logic passes**

Run: `npx vitest run tests/role-actions-api.test.ts`
Expected: PASS (4 tests). If a test fails on the import path of `HonoEnv` or `Context`, fix the import to match the codebase (`src/utils/types.ts` exports `HonoEnv`).

- [ ] **Step 5: Mount the route in index.ts**

In `open-energy-platform/src/index.ts`, add the import alongside the other route imports (near `import regulatorInboxRoutes from './routes/regulator-inbox';`):

```ts
import roleActionsRoutes from './routes/role-actions';
```

And add the mount next to the trading mount (after `app.route('/api/trading', tradingRoutes);`):

```ts
app.route('/api/role-actions', roleActionsRoutes);
```

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no new errors (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/routes/role-actions.ts src/index.ts tests/role-actions-api.test.ts
git commit -m "feat(w2): Layer-C role-actions API — tenant-scoped queue read/lifecycle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: trading-safety cascade rule (#2 algo kill-switch, #5 market-abuse STOR)

**Files:**
- Create: `open-energy-platform/src/cascade-rules/trading-safety.ts`
- Modify: `open-energy-platform/src/cascade-rules/index.ts` (barrel self-registers)
- Test: `open-energy-platform/tests/trading-safety-rule.test.ts`

**Context the implementer needs:**
- `CascadeRule { id, match(ctx), run(ctx), mode?: 'drive' | 'block' }` from `../utils/cascade-registry`. `registerCascadeRule(rule)` is idempotent by `id`. The registry runs as a `fireCascade` stage and writes an `oe_cascade_rule_audit` row per matched run — so even a no-op (missing party id) is observable.
- `CascadeContext` (from `../utils/cascade`) has `event`, `entity_type`, `entity_id`, `data` (`Record<string, any>`), `env` (typed `any`; carries `DB` + `KV`).
- Block/lift events (already members of the `EventType` union — no union edits needed):
  - Apply algo block: `algo_certification.suspended` (from `invoke_kill_switch`); cert row spread into `ctx.data` carries `firm_party_id`.
  - Lift algo block: `algo_certification.deployed` (from `deploy`/`reinstate`/`complete_recertification` — keying on the *event* not the action is correct: any path back to `deployed` means re-authorised to trade).
  - Apply STOR freeze: `market_abuse.stor_filed` (from `file_stor`); case row carries `subject_party_id`.
  - Lift STOR freeze: `market_abuse.cleared` (from `clear`/`dismiss`). A `sanctioned`/`enforcement_action` outcome deliberately does NOT lift — the subject stays frozen.
- Block table `oe_algo_trading_blocks` columns: `id, participant_id, algo_cert_id, block_reason, source_event, is_active, created_at, lifted_at, lifted_by`. The block is keyed on the **party id** (`firm_party_id`/`subject_party_id`); the guard resolves it back to a participant via direct match or the `oe_trading_party_link` bridge.
- `pushRoleAction(env, input)` from `../utils/role-actions`. For the trader push, resolve `firm_party_id`/`subject_party_id` → `participant_id` via the bridge so the push is participant-scoped when possible; if no link row exists, leave `target_participant_id` undefined (→ role-wide, never invisible).
- `tests/cascade-wiring.test.ts` shows the test pattern: `_resetRegistryForTests()` in `beforeEach`, then register rules explicitly, then `fireCascade(...)` against `envFor(createTestDb(...))`.

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/trading-safety-rule.test.ts`:

```ts
// W2 — trading-safety cascade rules. A kill-switch (algo cert suspended) or a
// STOR filing writes an active block; reinstatement / clearance lifts it; a
// role-action is pushed to the affected trader. The block row + rule audit are
// always written so a party-id↔participant mapping gap is observable.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { fireCascade } from '../src/utils/cascade';
import { _resetRegistryForTests } from '../src/utils/cascade-registry';
import { registerTradingSafetyRules } from '../src/cascade-rules/trading-safety';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerTradingSafetyRules();
});
afterEach(() => { db.close(); });

function activeBlocks(party: string, reason: string): number {
  const r = db.prepare(
    `SELECT COUNT(*) AS n FROM oe_algo_trading_blocks WHERE participant_id = ? AND block_reason = ? AND is_active = 1`,
  ).get(party, reason) as { n: number };
  return r.n;
}

describe('algo kill-switch block', () => {
  it('writes an active block + trader role-action on algo_certification.suspended', async () => {
    await fireCascade({
      event: 'algo_certification.suspended' as any,
      actor_id: 'usr_compliance', entity_type: 'algo_certification', entity_id: 'cert_1', env,
      data: { firm_party_id: 'firm_vantage' },
    });
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(1);
    const raq = db.prepare(
      `SELECT target_role, priority FROM oe_role_action_queue WHERE source_entity_id = 'cert_1'`,
    ).get() as { target_role: string; priority: string };
    expect(raq.target_role).toBe('trader');
    expect(raq.priority).toBe('urgent');
  });

  it('is idempotent — firing suspended twice leaves one active block', async () => {
    const evt = { event: 'algo_certification.suspended' as any, entity_type: 'algo_certification', entity_id: 'cert_1', env, data: { firm_party_id: 'firm_vantage' } };
    await fireCascade(evt);
    await fireCascade(evt);
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(1);
  });

  it('lifts the block on algo_certification.deployed', async () => {
    await fireCascade({ event: 'algo_certification.suspended' as any, entity_type: 'algo_certification', entity_id: 'cert_1', env, data: { firm_party_id: 'firm_vantage' } });
    await fireCascade({ event: 'algo_certification.deployed' as any, entity_type: 'algo_certification', entity_id: 'cert_1', env, data: { firm_party_id: 'firm_vantage' } });
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(0);
  });

  it('records a rule-audit row even when firm_party_id is missing (observable no-op)', async () => {
    await fireCascade({ event: 'algo_certification.suspended' as any, entity_type: 'algo_certification', entity_id: 'cert_2', env, data: {} });
    expect(activeBlocks('firm_vantage', 'algo_kill_switch')).toBe(0);
    const audit = db.prepare(
      `SELECT outcome FROM oe_cascade_rule_audit WHERE rule_id = 'safety.algo_kill_switch_block' AND source_entity_id = 'cert_2'`,
    ).get() as { outcome: string } | undefined;
    expect(audit?.outcome).toBe('ran');
  });
});

describe('market-abuse STOR freeze', () => {
  it('writes an active freeze on market_abuse.stor_filed and lifts on cleared', async () => {
    await fireCascade({ event: 'market_abuse.stor_filed' as any, entity_type: 'market_abuse_case', entity_id: 'mac_1', env, data: { subject_party_id: 'mbr_desk_07' } });
    expect(activeBlocks('mbr_desk_07', 'market_abuse_stor')).toBe(1);
    await fireCascade({ event: 'market_abuse.cleared' as any, entity_type: 'market_abuse_case', entity_id: 'mac_1', env, data: { subject_party_id: 'mbr_desk_07' } });
    expect(activeBlocks('mbr_desk_07', 'market_abuse_stor')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/trading-safety-rule.test.ts`
Expected: FAIL — cannot import `registerTradingSafetyRules` from `../src/cascade-rules/trading-safety`.

- [ ] **Step 3: Create the rule module**

Create `open-energy-platform/src/cascade-rules/trading-safety.ts`:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// Layer A — trading-safety rules (FSCA).
//   #2 Algo kill-switch:  algo_certification.suspended → block; .deployed → lift
//   #5 Market-abuse STOR:  market_abuse.stor_filed → freeze; .cleared → lift
//
// The block is written to oe_algo_trading_blocks keyed on the cert/case PARTY
// id (firm_party_id / subject_party_id). The pre-trade guard resolves that back
// to the trading participant via a direct id match OR the oe_trading_party_link
// bridge. The block row + the registry's oe_cascade_rule_audit row + the trader
// role-action are always written, so a missing party↔participant mapping is
// observable — never a silent no-op safety failure.
//
// Lift rules run as the unattended cascade actor (lifted_by = 'system:cascade').
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

function partyId(ctx: CascadeContext, field: string): string | null {
  const data = ctx.data as Record<string, unknown> | undefined;
  const v = data?.[field];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// Map a party id back to the trading participant, if a bridge row exists.
async function resolveParticipantId(env: CascadeContext['env'], party: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT participant_id FROM oe_trading_party_link WHERE party_id = ? LIMIT 1`,
  ).bind(party).first<{ participant_id: string }>();
  return row?.participant_id ?? null;
}

async function applyBlock(ctx: CascadeContext, party: string, reason: string): Promise<void> {
  // Idempotent: skip if an active block of this reason already exists.
  const existing = await ctx.env.DB.prepare(
    `SELECT id FROM oe_algo_trading_blocks WHERE participant_id = ? AND block_reason = ? AND is_active = 1 LIMIT 1`,
  ).bind(party, reason).first<{ id: string }>();
  if (existing) return;
  await ctx.env.DB.prepare(
    `INSERT INTO oe_algo_trading_blocks
       (id, participant_id, algo_cert_id, block_reason, source_event, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
  ).bind(
    `atb_${crypto.randomUUID()}`, party,
    ctx.entity_type === 'algo_certification' ? ctx.entity_id : null,
    reason, ctx.event, new Date().toISOString(),
  ).run();
}

async function liftBlock(ctx: CascadeContext, party: string, reason: string): Promise<void> {
  await ctx.env.DB.prepare(
    `UPDATE oe_algo_trading_blocks
        SET is_active = 0, lifted_at = ?, lifted_by = 'system:cascade'
      WHERE participant_id = ? AND block_reason = ? AND is_active = 1`,
  ).bind(new Date().toISOString(), party, reason).run();
}

async function pushTraderAlert(
  ctx: CascadeContext, party: string, chainKey: string, title: string, route: string,
): Promise<void> {
  const participant = await resolveParticipantId(ctx.env, party);
  await pushRoleAction(ctx.env, {
    target_role: 'trader',
    target_participant_id: participant ?? undefined, // unresolved → role-wide (never invisible)
    source_event: ctx.event,
    source_chain_key: chainKey,
    source_entity_type: ctx.entity_type,
    source_entity_id: ctx.entity_id,
    title,
    body: { party_id: party, entity_id: ctx.entity_id },
    cross_option: { action_label: 'Review case', target_route: route },
    priority: 'urgent',
  });
}

export function registerTradingSafetyRules(): void {
  // #2 — algo kill-switch applies the block.
  registerCascadeRule({
    id: 'safety.algo_kill_switch_block',
    mode: 'block',
    match: (ctx) => ctx.event === 'algo_certification.suspended',
    run: async (ctx) => {
      const party = partyId(ctx, 'firm_party_id');
      if (!party) return; // observable: rule-audit 'ran' row still written by the registry
      await applyBlock(ctx, party, 'algo_kill_switch');
      await pushTraderAlert(
        ctx, party, 'algo_certification',
        'Algorithmic trading suspended — kill switch invoked',
        `/trader/workstation?tab=algo-cert&id=${ctx.entity_id}`,
      );
    },
  });

  // #2 — reinstatement / redeploy lifts the block.
  registerCascadeRule({
    id: 'safety.algo_block_lift',
    mode: 'drive',
    match: (ctx) => ctx.event === 'algo_certification.deployed',
    run: async (ctx) => {
      const party = partyId(ctx, 'firm_party_id');
      if (!party) return;
      await liftBlock(ctx, party, 'algo_kill_switch');
    },
  });

  // #5 — STOR filing freezes the subject.
  registerCascadeRule({
    id: 'safety.market_abuse_stor_freeze',
    mode: 'block',
    match: (ctx) => ctx.event === 'market_abuse.stor_filed',
    run: async (ctx) => {
      const party = partyId(ctx, 'subject_party_id');
      if (!party) return;
      await applyBlock(ctx, party, 'market_abuse_stor');
      await pushTraderAlert(
        ctx, party, 'market_abuse_case',
        'Trading frozen — market-abuse STOR filed',
        `/trader/workstation?tab=market-abuse&id=${ctx.entity_id}`,
      );
    },
  });

  // #5 — clearance lifts the freeze (sanction/enforcement deliberately do not).
  registerCascadeRule({
    id: 'safety.market_abuse_freeze_lift',
    mode: 'drive',
    match: (ctx) => ctx.event === 'market_abuse.cleared',
    run: async (ctx) => {
      const party = partyId(ctx, 'subject_party_id');
      if (!party) return;
      await liftBlock(ctx, party, 'market_abuse_stor');
    },
  });
}
```

- [ ] **Step 4: Wire the barrel**

Replace the contents of `open-energy-platform/src/cascade-rules/index.ts` (currently `export {}`) with:

```ts
// Layer A rule-registry barrel. Importing this module self-registers every
// cascade rule (index.ts imports it once at boot). Tests that reset the
// registry call the individual register*() functions directly.
import { registerTradingSafetyRules } from './trading-safety';

registerTradingSafetyRules();

export { registerTradingSafetyRules };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/trading-safety-rule.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Type-check + full registry test**

Run: `npm run check && npx vitest run tests/cascade-wiring.test.ts`
Expected: type-check exit 0; cascade-wiring tests still PASS (no regression in the W1 wiring).

- [ ] **Step 7: Commit**

```bash
git add src/cascade-rules/trading-safety.ts src/cascade-rules/index.ts tests/trading-safety-rule.test.ts
git commit -m "feat(w2): trading-safety cascade rules — algo kill-switch + market-abuse STOR block/lift

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Pre-trade guard live wiring — `ALGO_TRADING_BLOCKED`

**Files:**
- Modify: `open-energy-platform/src/utils/pre-trade-guards.ts` (reason code + snapshot field + guard arm)
- Modify: `open-energy-platform/src/routes/trading.ts` (`loadRiskSnapshot` dual-key resolution)
- Modify: `open-energy-platform/src/utils/rejection-explainer.ts` (deterministic fallback arm)
- Test: `open-energy-platform/tests/pre-trade-block-guard.test.ts`

**Context the implementer needs:**
- `evaluateOrder(order, snapshot)` runs guards in order; the participant-status checks (`KYC_INCOMPLETE` at the `pending_kyc` arm, `COUNTERPARTY_SUSPENDED` at the `suspended`/`unknown` arm) are followed by the margin-gate check (commented "2a"). Insert the new regulatory-block arm **between** the suspension arm and the margin gate (a regulatory hold is a participant-level hard stop, enforced regardless of market/mark state), and renumber the margin-gate comment to "2b".
- `loadRiskSnapshot` builds the snapshot from a `Promise.all([...])` of D1 queries, destructured into named consts, then returns a `RiskSnapshot`. Add one query to the array, one const to the destructure, one field to the returned object.
- The dual-key query: a block is active for this trader if a row with `is_active = 1` has `participant_id = <user.id>` **OR** `participant_id IN (SELECT party_id FROM oe_trading_party_link WHERE participant_id = <user.id>)`.
- `rejection-explainer.ts` `deterministicFallback(input)` switches on `reason_code`; every code needs an arm so the UI never renders an empty state. Place the new arm near the `COUNTERPARTY_SUSPENDED` / `KYC_INCOMPLETE` arm.

- [ ] **Step 1: Write the failing test**

Create `open-energy-platform/tests/pre-trade-block-guard.test.ts`:

```ts
// W2 — pre-trade guard enforces a regulatory trading block. Covers the pure
// guard arm, dual-key resolution in loadRiskSnapshot (direct id + bridge), and
// the deterministic explainer fallback.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { evaluateOrder, REJECTION_CODES, type RiskSnapshot } from '../src/utils/pre-trade-guards';
import { explainRejection } from '../src/utils/rejection-explainer';

function baseSnapshot(over: Partial<RiskSnapshot> = {}): RiskSnapshot {
  return {
    participant_status: 'active',
    credit_limit_zar: 1_000_000, open_exposure_zar: 0, free_collateral_zar: 1_000_000,
    current_position_mwh: 0, position_limit_mwh: 0,
    market_state: 'open', mark_price_zar_mwh: 1000, mark_age_minutes: 1,
    price_band_pct: 25, margin_gate_status: 'clear',
    ...over,
  };
}

describe('evaluateOrder — ALGO_TRADING_BLOCKED', () => {
  it('exposes the reason code', () => {
    expect(REJECTION_CODES).toContain('ALGO_TRADING_BLOCKED');
  });

  it('rejects when trading_block_active is true', () => {
    const r = evaluateOrder(
      { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any,
      baseSnapshot({ trading_block_active: true }),
    );
    expect(r.ok).toBe(false);
    expect(r.reason_code).toBe('ALGO_TRADING_BLOCKED');
  });

  it('takes precedence over market-state checks', () => {
    const r = evaluateOrder(
      { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any,
      baseSnapshot({ trading_block_active: true, market_state: 'closed' }),
    );
    expect(r.reason_code).toBe('ALGO_TRADING_BLOCKED');
  });

  it('allows the order when no block is active', () => {
    const r = evaluateOrder(
      { side: 'buy', volume_mwh: 10, price_zar_mwh: 1000, energy_type: 'power', order_type: 'limit' } as any,
      baseSnapshot({ trading_block_active: false }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('loadRiskSnapshot — dual-key block resolution', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
  afterEach(() => { db.close(); });

  function seedTrader() {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status, kyc_status, tenant_id, created_at, updated_at)
       VALUES ('par_trader', 't@openenergy.co.za', 'x', 'T', 'trader', 'active', 'approved', 'default', '2026-06-06', '2026-06-06')`,
    ).run();
  }
  function block(party: string, reason: string) {
    db.prepare(
      `INSERT INTO oe_algo_trading_blocks (id, participant_id, block_reason, source_event, is_active, created_at)
       VALUES (?, ?, ?, 'test', 1, '2026-06-06')`,
    ).run(`atb_${party}`, party, reason);
  }

  // loadRiskSnapshot is module-internal; exercise it through the exported helper.
  async function snapshotFor(participantId: string): Promise<RiskSnapshot> {
    const mod = await import('../src/routes/trading');
    return (mod as any).__loadRiskSnapshotForTest(env, participantId, 'power', null);
  }

  it('resolves a block via the party-link bridge', async () => {
    seedTrader();
    block('firm_vantage', 'algo_kill_switch');
    db.prepare(`INSERT INTO oe_trading_party_link (id, participant_id, party_id, created_at) VALUES ('tpl_1','par_trader','firm_vantage','2026-06-06')`).run();
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(true);
  });

  it('resolves a block keyed directly on the participant id', async () => {
    seedTrader();
    block('par_trader', 'market_abuse_stor');
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(true);
  });

  it('is false when no block exists', async () => {
    seedTrader();
    const snap = await snapshotFor('par_trader');
    expect(snap.trading_block_active).toBe(false);
  });
});

describe('rejection-explainer — ALGO_TRADING_BLOCKED fallback', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
  afterEach(() => { db.close(); });

  it('returns a non-empty explanation + contact-compliance remediation (no AI binding)', async () => {
    const out = await explainRejection(
      { DB: env.DB, KV: env.KV } as any,
      {
        reason_code: 'ALGO_TRADING_BLOCKED', detail: 'regulatory hold', participant_id: 'par_trader',
        side: 'buy', energy_type: 'power', volume_mwh: 10, price_zar_mwh: 1000, notional_zar: 10_000, snapshot: {},
      },
      'rej_1',
    );
    expect(out.human_explanation.length).toBeGreaterThan(0);
    expect(out.suggested_remediations.some(r => r.action === 'contact_support')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pre-trade-block-guard.test.ts`
Expected: FAIL — `REJECTION_CODES` does not contain `ALGO_TRADING_BLOCKED`; `__loadRiskSnapshotForTest` is undefined.

- [ ] **Step 3a: Add the reason code**

In `open-energy-platform/src/utils/pre-trade-guards.ts`, add to the `REJECTION_CODES` array, after the `'MARGIN_GATE_BLOCKED'` entry:

```ts
  // ─── Wave 3 — clearing margin enforcement gate ──────────────────────────
  'MARGIN_GATE_BLOCKED',
  // ─── W2 — regulatory trading block (FSCA kill-switch / market-abuse STOR) ──
  'ALGO_TRADING_BLOCKED',
] as const;
```

- [ ] **Step 3b: Add the snapshot field**

In the `RiskSnapshot` interface, after the `margin_gate_status?: ...` field, add:

```ts
  // ─── W2 — regulatory trading block ────────────────────────────────────
  // True when an active oe_algo_trading_blocks row resolves to this
  // participant (FSCA algo kill-switch or market-abuse STOR freeze). Resolved
  // by loadRiskSnapshot via direct participant_id match OR the
  // oe_trading_party_link bridge. Undefined treated as not-blocked.
  trading_block_active?: boolean;
```

- [ ] **Step 3c: Add the guard arm**

In `evaluateOrder`, insert between the `COUNTERPARTY_SUSPENDED` arm (ends `}` at the `'suspended' || 'unknown'` block) and the `// 2a. Clearing margin gate` comment:

```ts
  // 2a. Regulatory trading block — FSCA algo kill-switch or market-abuse STOR
  // freeze. A participant-level hard stop enforced regardless of market/mark
  // state. Resolved in loadRiskSnapshot via direct id or the party-link bridge.
  if (snapshot.trading_block_active === true) {
    return {
      ok: false,
      reason_code: 'ALGO_TRADING_BLOCKED',
      detail: 'Trading is blocked for this account under a regulatory hold (kill-switch or market-abuse STOR). Contact compliance.',
    };
  }

```

Then change the following comment from `// 2a. Clearing margin gate` to `// 2b. Clearing margin gate`.

- [ ] **Step 3d: Wire `loadRiskSnapshot`**

In `open-energy-platform/src/routes/trading.ts`, add this query as the **last** element of the `Promise.all([...])` array in `loadRiskSnapshot` (after the `margin_enforcement_state` query, inside the array):

```ts
    // ── W2: regulatory trading block (FSCA kill-switch / market-abuse STOR) ──
    // Active block keyed either on the participant id directly OR on a party id
    // (firm_party_id / subject_party_id) linked via oe_trading_party_link.
    // Dual-key so a block written in either namespace is enforced. COUNT>0 ⇒ blocked.
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM oe_algo_trading_blocks
        WHERE is_active = 1
          AND ( participant_id = ?
             OR participant_id IN (SELECT party_id FROM oe_trading_party_link WHERE participant_id = ?) )`,
    ).bind(participantId, participantId).first<{ n: number }>().catch(() => null),
```

Update the destructuring assignment to add the new binding at the end of the array pattern:

```ts
  const [participant, limit, exposure, collateral, position, mark, halt, bookSides, marginGate, tradingBlock] = await Promise.all([
```

And add this field to the returned `RiskSnapshot` object (after `margin_gate_status: ...`):

```ts
    margin_gate_status: (marginGate?.gate_status as 'clear' | 'warning' | 'blocked' | undefined) || 'clear',
    trading_block_active: Number(tradingBlock?.n || 0) > 0,
  };
```

- [ ] **Step 3e: Add the test seam for `loadRiskSnapshot`**

`loadRiskSnapshot` is module-internal. At the end of `open-energy-platform/src/routes/trading.ts` (after the default export / route definitions), add a named test export:

```ts
// Test seam: loadRiskSnapshot is module-internal; this lets the W2 guard test
// exercise dual-key block resolution without going through the authed route.
export const __loadRiskSnapshotForTest = loadRiskSnapshot;
```

> If `trading.ts` has no other named exports and the linter objects to a mixed default+named export, this is still valid TypeScript/ESM — Hono route files commonly use a default export for the router and may add named exports. Keep the default router export unchanged.

- [ ] **Step 3f: Add the explainer fallback arm**

In `open-energy-platform/src/utils/rejection-explainer.ts`, in `deterministicFallback`, add a new case alongside `COUNTERPARTY_SUSPENDED` / `KYC_INCOMPLETE`:

```ts
    case 'ALGO_TRADING_BLOCKED':
      return {
        human_explanation: 'Trading on this account is suspended under a regulatory hold — either an algorithmic-trading kill-switch or a market-abuse STOR freeze. New orders are blocked until compliance lifts the hold.',
        suggested_remediations: [
          { label: 'Contact compliance', action: 'contact_support' },
        ],
      };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pre-trade-block-guard.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/utils/pre-trade-guards.ts src/routes/trading.ts src/utils/rejection-explainer.ts tests/pre-trade-block-guard.test.ts
git commit -m "feat(w2): pre-trade guard enforces ALGO_TRADING_BLOCKED via dual-key resolution

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: W2 verification gate + final review

**Files:** none created — verification only.

- [ ] **Step 1: Full type-check (backend + SPA)**

Run: `npm run check`
Expected: exit 0, no errors.

(The SPA isn't touched in W2, so `npm run check:pages` is unaffected; skip unless a reviewer requests it.)

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass, including the four new W2 files (`w2-trading-party-link`, `role-actions-api`, `trading-safety-rule`, `pre-trade-block-guard`) and the unchanged W1 `cascade-wiring`. No prior test regresses.

- [ ] **Step 3: Zero-behavior-change grep**

Confirm W2 only *adds* — it does not alter existing guard ordering semantics or existing reason codes:

```bash
git diff main --stat -- src/ migrations/
```
Expected: only additive changes — new files (`role-actions.ts`, `trading-safety.ts`, migration 480), and additive edits to `pre-trade-guards.ts` (+1 code, +1 field, +1 arm), `trading.ts` (+1 query, +1 field, +1 test export), `rejection-explainer.ts` (+1 arm), `index.ts` (+1 import, +1 mount), `cascade-rules/index.ts` (barrel). No existing reason code, guard arm, or column is modified or removed.

- [ ] **Step 4: Confirm migration discipline**

```bash
ls migrations/ | grep -E '^480_' && echo "OK: 480 is the next number after 479"
```
Expected: prints the migration filename + "OK". Confirm it is `CREATE TABLE IF NOT EXISTS` only (no `ALTER` of existing columns).

- [ ] **Step 5: Final review**

Dispatch a final code-reviewer subagent over the entire W2 diff (`git diff main`) covering: additivity (no existing behavior changed), the dual-key resolution correctness (no silent no-op safety path), tenant scoping on the role-actions route (no cross-tenant leak), `system:cascade` actor on lift rules, and idempotency of `applyBlock`. Address any blocking findings, then mark W2 complete.

---

## Self-Review (completed by plan author)

**Spec coverage:** Blueprint W2 = "Regulatory safety rules (#2,5,6,9, `mode:block`) + pre-trade guard live wiring + role-actions API." Covered: #2 (algo kill-switch block/lift, Task 3), #5 (market-abuse STOR freeze/lift, Task 3), `mode: 'block'` (set on the two apply rules), pre-trade guard live wiring (Task 4, `ALGO_TRADING_BLOCKED` + dual-key `loadRiskSnapshot`), role-actions API (Task 2). **Deferred with rationale:** #6 (OHSA permit-to-work) and #9 (work-order) → W3, because they need the drive-rule machinery + a PTW↔WO data-model bridge (`om_work_orders` has only `site_id`) that couples with W3's lifecycle sequencing. This is a deliberate re-slice, not a gap.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has complete code, exact commands, and expected output.

**Type consistency:** `trading_block_active` (snapshot field) is the same name in `pre-trade-guards.ts`, `trading.ts`, and the guard test. `ALGO_TRADING_BLOCKED` is identical across `REJECTION_CODES`, the guard arm, `rejection-explainer.ts`, and tests. `block_reason` values (`'algo_kill_switch'`, `'market_abuse_stor'`) match between `applyBlock`/`liftBlock` and the test assertions. `registerTradingSafetyRules` is the same name in the rule module, the barrel, and the test. Block id prefix `atb_` is consistent.

**Critical-path verification:** The dual-key resolution is exercised both ways (bridge + direct) in Task 4 Step 1, and the observable-no-op path (missing party id → rule-audit row still written) in Task 3 Step 1 — directly testing the silent-safety-failure risk this plan exists to eliminate.
