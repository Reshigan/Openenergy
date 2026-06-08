# Wave A — Quick Wins + Systemic Cross-Role Seams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close five concrete gaps the per-role completeness audit surfaced — the wind asset-owner O&M lockout, an un-actionable admin cascade-DLQ, three starved cross-role inboxes (grid/trader/support), the unmounted Platform Subscription Billing chain (W228), and a duplicate-key force-majeure tab on the IPP workstation — so every role's built-but-hidden capability is reachable and the cascade drives the cross-party handoffs it was designed for.

**Architecture:** Additive only. No migrations renumbered (next new migration ≥486; W228's migration 474 already exists on-branch). Backend gaps are fixed with role-string corrections, two new admin endpoints that call functions that already exist (`retryDlqItem`/`resolveDlqItem`), one new Layer-C cascade-rule module that matches events that *already fire* and `pushRoleAction`s into the existing `oe_role_action_queue` → `IncomingPanel` (the offtaker-procurement reference pattern), and a route-mount + cron-sweep wire-up for an already-written chain. The single frontend bug is a tab key-collision dedupe. `EventType` is never edited; `fireCascade` is never changed; no existing chain/spec/migration is touched.

**Tech Stack:** Cloudflare Worker · Hono · D1 (SQLite, `better-sqlite3` in tests) · Vitest · React SPA (Vite, no unit runner — verified via `tsc` + build) · cascade registry (`src/cascade-rules/`, `src/utils/cascade-registry.ts`) · role-action inbox (`src/utils/role-actions.ts`).

---

## Guardrails (apply to every task)

- **Migrations frozen 001–485.** Do not add, renumber, or "fix the ledger." W228's `migrations/474_w228_subscription_billing.sql` already exists on-branch; the test harness (`createTestDb({applyMigrations:true})`) applies it. Any *new* migration starts at ≥486 — none are needed in Wave A.
- **`EventType` is a CLOSED union** in `src/utils/cascade.ts`. Layer-C rules MUST match events that already fire. Never edit `EventType` or `fireCascade`'s signature.
- **JWT roles are suffixed:** `ipp`→`ipp_developer`, `grid`→`grid_operator`, `carbon`→`carbon_fund`. Role sets must include the suffixed form (and the short form where legacy code uses it).
- **Layer-C dedup keys on `(source_entity_id, source_event)` only** — never the resolved target role. Check-then-insert (no DB UNIQUE).
- **Auth rate limiter 10 / 5 min / IP** on `/api/auth/login`. Do not add tests or scripts that hammer prod login. Vitest uses an in-memory D1 and does not hit the limiter.
- **Goldrush sites** (NXT Energy's 10 C&I sites) use real Solax actuals — never INSERT synthetic kWh/billing rows.
- **Keep vitest green.** Baseline is 8016 passing / 217 files. Every task ends green. Run `npm run check` (backend tsc) before committing backend changes; `npm run check:pages` before committing SPA changes.
- All commands run from `open-energy-platform/` unless stated. Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Do not merge/push/PR. Branch `feat/ecosystem-foundation` stays as-is; the Wave A boundary is a checkpoint, not a merge.

---

## Task 1: Wind asset-owner O&M mutation unlock

**Context:** The `wind@openenergy.co.za` persona is an asset-owning IPP. The O&M module `esums-om.ts` gates every mutation through `canMutate(role)`, whose allow-list contains `'ipp'` but NOT `'ipp_developer'` — the actual suffixed JWT role. So wind logs in, sees its sites (the GET scopes by ownership and works), but every fault-log / work-order / telemetry POST 403s. The fix is to add the suffixed role — but only after confirming those mutation routes scope writes to *owned* sites, so broadening the role can't let one owner mutate another's asset.

**Files:**
- Modify: `src/routes/esums-om.ts` (the `canMutate` function, ~lines 60-62; plus the mutation route handlers if ownership scoping is missing)
- Test: `tests/esums-om-ownership.test.ts` (create)

- [ ] **Step 1: Confirm the wind persona's role claim and the current gate.**

Run:
```bash
grep -rn "wind@openenergy" src/ scripts/ migrations/ | head
grep -n "canMutate" src/routes/esums-om.ts
```
Determine wind's JWT `role`. Expected: `ipp_developer` (the suffixed IPP role). If it is something else (e.g. `asset_owner`, already present), STOP and report — the audit's premise would be wrong and no code change is needed.

- [ ] **Step 2: Confirm whether mutation routes scope by ownership.**

Read every mutating handler in `src/routes/esums-om.ts` (POST/PUT/PATCH/DELETE — faults, work-orders, telemetry, anything writing). For each, confirm that for non-`admin` roles the target site/asset is filtered by the caller's ownership (the GET at ~line 87 scopes by `participant_id`/`om_contractor_id` — the writes must do the same, e.g. resolve the site and verify `participant_id = user.id OR om_contractor_id = user.id` before writing, else 403/404).

Record findings. Two cases:
- **(a) Writes already ownership-scoped** → Step 3 is the whole fix.
- **(b) A write is NOT ownership-scoped** → Step 3 *and* add an ownership guard to that handler (resolve the row's owner, 404 if the caller is neither owner, O&M contractor, nor admin). This MUST land in the same task — broadening the role without it is a tenancy hole.

- [ ] **Step 3: Write the failing ownership test.**

```ts
// tests/esums-om-ownership.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import app from '../src/index';
import { signToken } from '../src/utils/auth'; // confirm the helper name used by other route tests

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // Two ipp_developer owners + one site owned by owner A.
  db.prepare(`INSERT INTO users (id, email, role, participant_id, tenant_id) VALUES
    ('ownerA','a@t.co','ipp_developer','ownerA','default'),
    ('ownerB','b@t.co','ipp_developer','ownerB','default')`).run();
  // Insert one O&M site owned by ownerA. Match the real esums-om sites table + columns
  // discovered in Step 2 (table name, owner column). Example shape:
  db.prepare(`INSERT INTO om_sites (id, name, participant_id, tenant_id) VALUES
    ('siteA','Karoo Wind','ownerA','default')`).run();
});
afterEach(() => db.close());

async function call(path: string, role: string, uid: string, pid: string, body: any) {
  const token = await signToken({ id: uid, email: `${uid}@t.co`, role, participant_id: pid, tenant_id: 'default' }, env);
  return app.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, env);
}

describe('esums-om ownership + role gate', () => {
  it('ipp_developer owner can log a fault on their own site (not 403)', async () => {
    // Use the real fault-log path + payload discovered in Step 2.
    const res = await call('/api/esums-om/faults', 'ipp_developer', 'ownerA', 'ownerA',
      { site_id: 'siteA', severity: 'medium', description: 'gearbox temp high' });
    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
  });

  it('ipp_developer who does NOT own the site cannot mutate it', async () => {
    const res = await call('/api/esums-om/faults', 'ipp_developer', 'ownerB', 'ownerB',
      { site_id: 'siteA', severity: 'medium', description: 'spoofed' });
    expect([403, 404]).toContain(res.status);
  });
});
```
Adjust table/column/route/payload names to the real ones found in Step 2. If `signToken`/token helper differs, copy the exact pattern from an existing route test (e.g. `tests/w2-trading-party-link.test.ts`).

- [ ] **Step 4: Run the test — verify it fails** (owner-can-mutate fails with 403 because `ipp_developer` is not in `canMutate`).

Run: `npx vitest run tests/esums-om-ownership.test.ts`
Expected: FAIL on the first `it` (403 returned).

- [ ] **Step 5: Implement — add the suffixed role (and ownership guard if Step 2 case b).**

```ts
function canMutate(role: string) {
  return ['admin', 'support', 'asset_owner', 'ipp', 'ipp_developer', 'om_contractor', 'trader'].includes(role);
}
```
If Step 2 found an unscoped write, add the ownership guard to that handler in this step (resolve the row's owner; 404 unless caller is owner / O&M contractor / admin).

- [ ] **Step 6: Run the test — verify it passes.**

Run: `npx vitest run tests/esums-om-ownership.test.ts`
Expected: PASS (both cases).

- [ ] **Step 7: Confirm the IPP workstation already surfaces O&M actions for wind.**

Run: `grep -rn "esums-om\|EsumsOm\|Operations" pages/src/components/pages/IppWorkstationPage.tsx | head`
The Operations/O&M tabs already exist (per audit). No new UI is needed — this step only confirms wind can now reach them. If a tab is gated by a role check that also omits `ipp_developer`, fix that gate too (same bug class). Record what you found.

- [ ] **Step 8: Full backend check + commit.**

Run: `npm run check && npx vitest run tests/esums-om-ownership.test.ts`
```bash
git add src/routes/esums-om.ts tests/esums-om-ownership.test.ts
git commit -m "fix(esums-om): unlock asset-owner O&M mutations for ipp_developer role

canMutate allow-listed 'ipp' but not the suffixed JWT role 'ipp_developer',
so the wind asset-owner persona 403'd on every fault/WO/telemetry write while
its sites listed fine. Add ipp_developer; mutation routes remain ownership-scoped
(verified/guarded). Regression test covers owner-can-write + non-owner-cannot.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Admin cascade-DLQ retry + resolve actionability

**Context:** Cascade stages that fail 3× land in `cascade_dlq`. Two functions already exist in `src/utils/cascade.ts`: `retryDlqItem(env, dlqId, operatorId)` (re-runs the failed stage, marks the row `resolved` on success) and `resolveDlqItem(env, dlqId, operatorId, status, note?)` (marks `resolved`/`abandoned` without retry). They are wired only into the **support** routes (`src/routes/support.ts:325-350`). The **admin** workstation's #1 AI card deep-links to a READ-ONLY DLQ view (`monitoring.ts` `/cascade-dlq`) — admins can see the backlog but cannot act on it. Expose the two existing functions to admins and give the admin board action buttons.

**Files:**
- Modify: the admin router (find it: `grep -rn "app.route('/api/admin'" src/index.ts`) — add two POST endpoints. Likely `src/routes/admin.ts`.
- Modify: `pages/src/components/pages/AdminWorkstationPage.tsx` — add retry/resolve actions to the DLQ surface.
- Test: `tests/admin-cascade-dlq.test.ts` (create)

- [ ] **Step 1: Locate the admin router + its role gate, and confirm support's pattern.**

Run:
```bash
grep -rn "app.route('/api/admin'" src/index.ts
sed -n '320,352p' src/routes/support.ts
grep -n "retryDlqItem\|resolveDlqItem" src/utils/cascade.ts
```
Confirm the admin router file + how it enforces admin role (middleware or per-handler). Note support's exact endpoint shape to mirror it.

- [ ] **Step 2: Write the failing test.**

```ts
// tests/admin-cascade-dlq.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import app from '../src/index';
import { signToken } from '../src/utils/auth'; // match the helper used by other route tests

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  db.prepare(`INSERT INTO users (id,email,role,tenant_id) VALUES
    ('adm','adm@t.co','admin','default'),('usr','u@t.co','trader','default')`).run();
  // Seed one DLQ row. Match cascade_dlq columns discovered in Step 1.
  db.prepare(`INSERT INTO cascade_dlq (id, event, entity_type, entity_id, stage, payload_json, error, status, attempts, created_at)
    VALUES ('dlq1','contract.created','loi_drafts','e1','analytics','{}','boom','pending',3, datetime('now'))`).run();
});
afterEach(() => db.close());

async function post(path: string, role: string, uid: string, body: any = {}) {
  const token = await signToken({ id: uid, email: `${uid}@t.co`, role, tenant_id: 'default' }, env);
  return app.request(path, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) }, env);
}

describe('admin cascade-dlq endpoints', () => {
  it('non-admin is rejected', async () => {
    const res = await post('/api/admin/cascade-dlq/dlq1/resolve', 'trader', 'usr', { status: 'abandoned' });
    expect([401, 403]).toContain(res.status);
  });
  it('admin resolve marks the row resolved/abandoned', async () => {
    const res = await post('/api/admin/cascade-dlq/dlq1/resolve', 'admin', 'adm', { status: 'abandoned', note: 'dupe' });
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT status FROM cascade_dlq WHERE id='dlq1'`).get() as any;
    expect(['abandoned', 'resolved']).toContain(row.status);
  });
  it('admin retry is reachable and returns an ok flag', async () => {
    const res = await post('/api/admin/cascade-dlq/dlq1/retry', 'admin', 'adm');
    expect(res.status).toBe(200);
    const j: any = await res.json();
    expect(j).toHaveProperty('ok');
  });
});
```
Adjust `cascade_dlq` columns to the real schema (from Step 1 / the migration that creates it).

- [ ] **Step 3: Run — verify it fails** (endpoints don't exist → 404).

Run: `npx vitest run tests/admin-cascade-dlq.test.ts`
Expected: FAIL (404 / route not found).

- [ ] **Step 4: Implement the two admin endpoints (mirror support.ts:325-350).**

In the admin router, importing `retryDlqItem` and `resolveDlqItem` from `../utils/cascade` and `auditLog` from wherever support imports it:
```ts
// POST /cascade-dlq/:id/retry  (admin-gated)
admin.post('/cascade-dlq/:id/retry', async (c) => {
  const actor = getCurrentUser(c); // match how this router resolves the user
  const id = c.req.param('id');
  const result = await retryDlqItem(c.env, id, actor.id);
  await auditLog(c.env.DB, actor.id, 'admin.cascade_retry', id, { ok: result.ok, error: result.error ?? null });
  return c.json(result, result.ok ? 200 : 200); // 200 either way; ok flag carries success
});

// POST /cascade-dlq/:id/resolve  (admin-gated)
admin.post('/cascade-dlq/:id/resolve', async (c) => {
  const actor = getCurrentUser(c);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const status = body.status === 'resolved' ? 'resolved' : 'abandoned';
  await resolveDlqItem(c.env, id, actor.id, status, body.note);
  await auditLog(c.env.DB, actor.id, 'admin.cascade_resolve', id, { status, note: body.note ?? null });
  return c.json({ ok: true, status });
});
```
If the admin router is not already admin-gated by middleware, add the role check each handler (reject non-`admin` with 403), matching how support gates its routes.

- [ ] **Step 5: Run — verify it passes.**

Run: `npx vitest run tests/admin-cascade-dlq.test.ts`
Expected: PASS (all three).

- [ ] **Step 6: Backend check + commit (1/2).**

Run: `npm run check && npx vitest run tests/admin-cascade-dlq.test.ts`
```bash
git add src/routes/<admin-router>.ts tests/admin-cascade-dlq.test.ts
git commit -m "feat(admin): actionable cascade-DLQ — retry + resolve endpoints

Expose existing retryDlqItem/resolveDlqItem (previously only on support routes)
under /api/admin/cascade-dlq/:id/{retry,resolve}, admin-gated, audited. Admins
could see the DLQ backlog but not clear it; now they can replay a failed stage
or mark it resolved/abandoned.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: Add admin-board action buttons.**

In `pages/src/components/pages/AdminWorkstationPage.tsx`, on the DLQ surface (the one the AI card links to): per-row **Retry** and **Resolve** (resolve opens an inline confirm with an optional note + abandoned/resolved choice — inline, not a modal-first pattern) that POST to the two new endpoints, then refetch the list. Apply impeccable craft: no side-stripe borders, no hero-metric template, no gradient text; a row action affordance, not a card grid. Reuse existing admin fetch/auth helpers (`pages/src/lib/api.ts`).

- [ ] **Step 8: SPA check + build + commit (2/2).**

Run: `npm run check:pages && (cd pages && npm run build)`
```bash
git add pages/src/components/pages/AdminWorkstationPage.tsx
git commit -m "feat(admin-ui): retry/resolve actions on cascade-DLQ board

Wire the admin DLQ surface to the new retry/resolve endpoints with inline
row actions (no modal). The #1 admin AI card now lands on an actionable view.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Feed the starved cross-role inboxes (grid_operator, trader, support)

**Context:** The cross-role `IncomingPanel` (auto-mounted at `WorkstationShell.tsx:241`, fed by `oe_role_action_queue` via `pushRoleAction`) is the offtaker→IPP reference pattern. Investigation of every `pushRoleAction` call site found these roles already fed: `ipp_developer`, `trader` (trading-safety algo-block alerts), `lender`, `regulator`, `carbon_fund`. The genuinely-starved inboxes are **`grid_operator`** (zero rules), **`offtaker`** (zero — it is only ever the *sender*), and **`support`** (zero). Add one Layer-C rule each, matching events that ALREADY fire, following `src/cascade-rules/offtaker-procurement.ts` exactly (NOT grid-dispatch.ts/trader-margin.ts — those use the P6 `enqueueAction`/`oe_action_queue`, a different work-queue surface; we want `pushRoleAction`/`oe_role_action_queue` → IncomingPanel).

> **Revision from the original draft (confirmed by payload inspection):** `trader.margin_call_issued` was dropped — trader's IncomingPanel is already served by `trading-safety.ts`, and the margin call itself already lands in `oe_action_queue` via `trader-margin.ts`; re-pushing would double-feed the same trader. `hse_incident.sla_breached → support` was dropped — support is not the natural owner of a field-safety SLA breach (the site owner + regulator are, and the regulator inbox already receives it). Replaced with two clean, genuinely-cross-party, currently-unsurfaced handoffs: **offtaker** and **support**.

Chosen events (payloads confirmed against the firing routes):
- **grid_operator** ← `grid.wheeling_charge_disputed` (fires `src/routes/grid-wheeling-charges.ts:296`; actor = disputer; `entity_type='oe_grid_wheeling_charges'`, `entity_id`=charge id; `data:{agreement_id, period_month, dispute_id, claimed_amount_zar}`). The disputing offtaker/IPP raises it; the SO must resolve it via `/disputes/:id/resolve`. Push **role-wide** (one national TSO; `target_participant_id` omitted — `pendingCountForRole` supports role-wide rows). Deep-link `/grid-operator/workstation?tab=wheeling_charges` (tab already mounted: `GridOpsWorkstationPage.tsx:56`).
- **offtaker** ← `grid.wheeling_charge_issued` (fires `grid-wheeling-charges.ts:221`; actor = SO; `entity_id`=charge id; `data:{agreement_id, period_month, total_zar, dispute_deadline_at}`). The SO bills the offtaker; only the offtaker may dispute (route enforces `offtaker_id !== user.id → 403`), so the offtaker is the unambiguous recipient. **Resolve `offtaker_id`** via `SELECT offtaker_id FROM oe_wheeling_agreements WHERE id = ?` (the agreement_id); skip if null. Deep-link `/offtaker-suite/workstation?tab=wheeling_charges` — **this tab must be mounted in Step 5** (the role-aware `WheelingChargesTab` exists but is only on the grid workstation today; the offtaker has no charges surface — a built-but-hidden gap; the GET list route already scopes offtakers to their own agreements).
- **support** ← `support.ticket_opened` (fires `src/routes/support.ts:374`; actor = reporter, any role; `entity_type='support_tickets'`, `entity_id`=ticket id; `data:{id, ticket_number, reporter_id, tenant_id, subject, category, priority}`). Any role opening a ticket is a cross-party handoff to the support team. Push **role-wide** to `support`. Map ticket `priority` → action priority (`urgent`/`high`/`low`, else `normal`). Deep-link `/support/tickets/${entity_id}` (route exists: `App.tsx:1534`).

**Files:**
- Create: `src/cascade-rules/underserved-inboxes.ts`
- Modify: `src/cascade-rules/index.ts` (register the new rule set in the barrel)
- Modify: `pages/src/components/pages/OfftakerWorkstationPage.tsx` (mount `WheelingChargesTab` under the `Contracts` group)
- Test: `tests/underserved-inboxes-rules.test.ts` (create)

**`source_chain_key` for all three rules: `'underserved_inboxes'`.**

- [x] **Step 1: Event payloads confirmed** (see the Context section above — the three firing routes and their exact `data` keys are recorded there). No further grepping needed.

- [ ] **Step 2: Write the failing test.**

The reference test (`tests/offtaker-procurement-rules.test.ts`) reads `oe_role_action_queue` columns directly and asserts the `oe_cascade_rule_audit` outcome. Mirror it. The offtaker case must seed `oe_wheeling_agreements` (NOT NULL cols: `generator_id, offtaker_id, injection_point, withdrawal_point, contracted_mw, loss_factor_pct, wheeling_tariff_zar_per_mwh`) so the `offtaker_id` lookup resolves.

```ts
// tests/underserved-inboxes-rules.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerUnderservedInboxRules } from '../src/cascade-rules/underserved-inboxes';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerUnderservedInboxRules();
});
afterEach(() => db.close());

function ctx(event: string, entity_type: string, entity_id: string, data: Record<string, unknown>): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}
function row(id: string) {
  return db.prepare(`SELECT target_role, target_participant_id, title, priority,
    source_event, source_chain_key, cross_option_json, sla_due_at
    FROM oe_role_action_queue WHERE source_entity_id = ?`).get(id) as any;
}
function seedAgreement(id: string, offtaker_id: string) {
  db.prepare(
    `INSERT INTO oe_wheeling_agreements
       (id, generator_id, offtaker_id, injection_point, withdrawal_point,
        contracted_mw, loss_factor_pct, wheeling_tariff_zar_per_mwh, status)
     VALUES (?, 'gen1', ?, 'inj', 'wd', 10, 3.5, 120, 'active')`,
  ).run(id, offtaker_id);
}

describe('underserved-inbox cascade rules', () => {
  it('grid.wheeling_charge_disputed pushes a role-wide resolve action to grid_operator', async () => {
    await runCascadeRegistry(ctx('grid.wheeling_charge_disputed', 'oe_grid_wheeling_charges', 'chg1',
      { agreement_id: 'wa1', period_month: '2026-05', dispute_id: 'dsp1', claimed_amount_zar: 125000 }));
    const r = row('chg1');
    expect(r.target_role).toBe('grid_operator');
    expect(r.target_participant_id).toBeNull();
    expect(r.priority).toBe('high');
    expect(r.source_chain_key).toBe('underserved_inboxes');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/grid-operator/workstation?tab=wheeling_charges');
  });

  it('grid.wheeling_charge_issued resolves offtaker_id from the agreement and pushes to that offtaker', async () => {
    seedAgreement('wa2', 'off42');
    await runCascadeRegistry(ctx('grid.wheeling_charge_issued', 'oe_grid_wheeling_charges', 'chg2',
      { agreement_id: 'wa2', period_month: '2026-05', total_zar: 88000, dispute_deadline_at: '2026-06-20T00:00:00.000Z' }));
    const r = row('chg2');
    expect(r.target_role).toBe('offtaker');
    expect(r.target_participant_id).toBe('off42');
    expect(r.priority).toBe('normal');
    expect(r.sla_due_at).toBe('2026-06-20T00:00:00.000Z');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/offtaker-suite/workstation?tab=wheeling_charges');
  });

  it('grid.wheeling_charge_issued does not push when the agreement (offtaker) cannot be resolved', async () => {
    await runCascadeRegistry(ctx('grid.wheeling_charge_issued', 'oe_grid_wheeling_charges', 'chg3',
      { agreement_id: 'ghost', period_month: '2026-05', total_zar: 1, dispute_deadline_at: null }));
    expect(db.prepare(`SELECT id FROM oe_role_action_queue WHERE source_entity_id='chg3'`).get()).toBeUndefined();
  });

  it('support.ticket_opened pushes a role-wide action to support with the mapped priority', async () => {
    await runCascadeRegistry(ctx('support.ticket_opened', 'support_tickets', 'tkt1',
      { id: 'tkt1', ticket_number: 'OE-2026-ABC', reporter_id: 'rep1', subject: 'Inverter offline', category: 'technical', priority: 'urgent' }));
    const r = row('tkt1');
    expect(r.target_role).toBe('support');
    expect(r.target_participant_id).toBeNull();
    expect(r.priority).toBe('urgent');
    expect(r.title).toContain('Inverter offline');
    expect(JSON.parse(r.cross_option_json).target_route).toBe('/support/tickets/tkt1');
  });

  it('support.ticket_opened maps an unknown ticket priority to normal', async () => {
    await runCascadeRegistry(ctx('support.ticket_opened', 'support_tickets', 'tkt2',
      { id: 'tkt2', ticket_number: 'OE-2026-XYZ', reporter_id: 'rep1', subject: 'Question', category: 'billing', priority: 'P3' }));
    expect(row('tkt2').priority).toBe('normal');
  });

  it('does not double-push for the same (entity, event)', async () => {
    const c = ctx('support.ticket_opened', 'support_tickets', 'tkt3',
      { id: 'tkt3', ticket_number: 'OE-2026-DUP', reporter_id: 'rep1', subject: 'X', category: 'technical', priority: 'high' });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = db.prepare(`SELECT COUNT(*) n FROM oe_role_action_queue WHERE source_entity_id='tkt3'`).get() as any;
    expect(n.n).toBe(1);
  });
});
```

- [ ] **Step 3: Run — verify it fails** (module does not exist).

Run: `npx vitest run tests/underserved-inboxes-rules.test.ts`
Expected: FAIL (cannot import `registerUnderservedInboxRules`).

- [ ] **Step 4: Implement the rule module (offtaker-procurement.ts shape exactly).**

Use the `RULES: CascadeRule[]` array + `mode: 'drive'` + register-loop + `__…ForTest()` accessor shape from `offtaker-procurement.ts`. `dstr` returns `string | null`, `dnum` returns `number | null` (copy verbatim). `pushRoleAction` is `(env, RoleActionInput)`; `target_participant_id` is optional (omit for role-wide). `source_chain_key` is **`'underserved_inboxes'`** (plural).

```ts
// src/cascade-rules/underserved-inboxes.ts
// ─────────────────────────────────────────────────────────────────────────
// Layer-C cross-role pushes for three inboxes the audit found starved:
// grid_operator, offtaker, support. Each rule matches an event that ALREADY
// fires (grid-wheeling-charges.ts / support.ts) and pushRoleAction()s into
// oe_role_action_queue → the workstation IncomingPanel. Mirrors
// offtaker-procurement.ts (NOT grid-dispatch.ts/trader-margin.ts: those use
// the P6 enqueueAction/oe_action_queue work-queue, a different surface).
// Dedup keys on (source_entity_id, source_event) only.
// ─────────────────────────────────────────────────────────────────────────
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

const CHAIN_KEY = 'underserved_inboxes';
const ACTION_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// Same check-then-insert dedup as offtaker-procurement.ts: keyed on
// (source_entity_id, source_event) ONLY, never the target role.
async function alreadyPushed(ctx: CascadeContext, sourceEntityId: string): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  // grid_operator ← a counterparty disputed a wheeling charge. The SO must
  // resolve it. One national TSO → push role-wide (no target_participant_id).
  {
    id: 'underserved_inboxes.grid_wheeling_dispute',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'grid.wheeling_charge_disputed',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const period = dstr(ctx, 'period_month');
      const claimed = dnum(ctx, 'claimed_amount_zar');
      await pushRoleAction(ctx.env, {
        target_role: 'grid_operator',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Wheeling charge disputed${period ? ` (${period})` : ''}`,
        body: {
          agreement_id: dstr(ctx, 'agreement_id'),
          period_month: period,
          dispute_id: dstr(ctx, 'dispute_id'),
          claimed_amount_zar: claimed,
        },
        cross_option: {
          action_label: 'Resolve dispute',
          target_route: '/grid-operator/workstation?tab=wheeling_charges',
        },
        priority: 'high',
      });
    },
  },

  // offtaker ← the SO issued a wheeling charge. Only the offtaker on the
  // agreement may dispute it (route enforces 403 otherwise), so resolve the
  // offtaker_id from oe_wheeling_agreements and target them. Skip if unknown.
  {
    id: 'underserved_inboxes.offtaker_wheeling_charge',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'grid.wheeling_charge_issued',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const agreementId = dstr(ctx, 'agreement_id');
      if (!agreementId) return;
      const agreement = (await ctx.env.DB.prepare(
        `SELECT offtaker_id FROM oe_wheeling_agreements WHERE id = ?`,
      ).bind(agreementId).first()) as { offtaker_id: string } | null;
      const offtakerId = agreement?.offtaker_id;
      if (!offtakerId) return;
      const total = dnum(ctx, 'total_zar');
      const period = dstr(ctx, 'period_month');
      const deadline = dstr(ctx, 'dispute_deadline_at');
      await pushRoleAction(ctx.env, {
        target_role: 'offtaker',
        target_participant_id: offtakerId,
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `Wheeling charge issued${total != null ? `: R${total.toLocaleString()}` : ''}${period ? ` (${period})` : ''}`,
        body: { agreement_id: agreementId, period_month: period, total_zar: total, dispute_deadline_at: deadline },
        cross_option: {
          action_label: 'Review charge',
          target_route: '/offtaker-suite/workstation?tab=wheeling_charges',
        },
        priority: 'normal',
        ...(deadline ? { sla_due_at: deadline } : {}),
      });
    },
  },

  // support ← any role opened a ticket. Cross-party handoff to the support
  // team. Push role-wide; map the ticket priority onto the action priority.
  {
    id: 'underserved_inboxes.support_ticket_opened',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'support.ticket_opened',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id)) return;
      const subject = dstr(ctx, 'subject') ?? 'New ticket';
      const ticketNo = dstr(ctx, 'ticket_number');
      const ticketPriority = dstr(ctx, 'priority');
      const priority = (ticketPriority && ACTION_PRIORITIES.has(ticketPriority)
        ? ticketPriority
        : 'normal') as 'low' | 'normal' | 'high' | 'urgent';
      await pushRoleAction(ctx.env, {
        target_role: 'support',
        source_event: ctx.event,
        source_chain_key: CHAIN_KEY,
        source_entity_type: ctx.entity_type,
        source_entity_id: ctx.entity_id,
        title: `New support ticket: ${subject}`,
        body: {
          ticket_number: ticketNo,
          reporter_id: dstr(ctx, 'reporter_id'),
          category: dstr(ctx, 'category'),
          priority: ticketPriority,
        },
        cross_option: {
          action_label: 'Open ticket',
          target_route: `/support/tickets/${ctx.entity_id}`,
        },
        priority,
      });
    },
  },
];

export function registerUnderservedInboxRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __underservedInboxRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
```

- [ ] **Step 5: Register in the barrel.**

In `src/cascade-rules/index.ts`: add `import { registerUnderservedInboxRules } from './underserved-inboxes';`, call `registerUnderservedInboxRules();` alongside the other `registerXxxRules()` calls, and add it to the trailing `export { … }` list (match the existing file shape exactly — it imports, calls, and re-exports every register fn).

- [ ] **Step 6: Run — verify it passes.**

Run: `npx vitest run tests/underserved-inboxes-rules.test.ts`
Expected: PASS (all six).

- [ ] **Step 7: Backend check + commit (1/2).**

Run: `npm run check && npx vitest run tests/underserved-inboxes-rules.test.ts`
```bash
git add src/cascade-rules/underserved-inboxes.ts src/cascade-rules/index.ts tests/underserved-inboxes-rules.test.ts
git commit -m "feat(cascade): feed starved grid/offtaker/support inboxes (Layer-C)

Three cross-role rules matching already-fired events -> pushRoleAction into the
existing IncomingPanel: grid.wheeling_charge_disputed -> grid_operator (role-wide),
grid.wheeling_charge_issued -> the agreement's offtaker, support.ticket_opened ->
support (role-wide). Offtaker-procurement reference pattern; dedup on (entity,
event). No EventType changes, no new producer code.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 8: Mount the offtaker wheeling-charges surface (built-but-hidden gap).**

`WheelingChargesTab` (`pages/src/components/grid/WheelingChargesTab.tsx`) is role-aware (offtaker gets raise-dispute/pay; grid gets resolve) and takes no props, but today it is only mounted on the grid workstation. The offtaker has no charges surface, so the deep-link the new rule sends would land on a tab that does not exist. Mount it.

In `pages/src/components/pages/OfftakerWorkstationPage.tsx`:
1. Add the import near the other tab imports: `import { WheelingChargesTab } from '../grid/WheelingChargesTab';`
2. Add a tab to the `tabs={[...]}` array under the **Contracts** group, next to the existing `wheeling_access` tab (line ~52). Key MUST be `wheeling_charges` so the rule's `?tab=wheeling_charges` deep-link resolves:
```tsx
{ key: 'wheeling_charges', label: 'Wheeling charges', group: 'Contracts', body: () => <WheelingChargesTab /> },
```

- [ ] **Step 9: SPA check + build + commit (2/2).**

Run: `npm run check:pages && (cd pages && npm run build)`
```bash
git add pages/src/components/pages/OfftakerWorkstationPage.tsx
git commit -m "feat(offtaker-ui): mount role-aware wheeling-charges tab

The role-aware WheelingChargesTab existed but was only on the grid workstation;
the offtaker (who is billed and is the only party that may dispute) had no
charges surface. Mount it under Contracts so the new Layer-C push deep-links land.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Mount the Platform Subscription Billing chain (W228)

**Context:** `src/routes/subscription-billing-chain.ts` (exports a Hono `app`), `src/utils/subscription-billing-spec.ts`, and `migrations/474_w228_subscription_billing.sql` all exist on-branch but the route was never mounted in `src/index.ts`, so the whole W228 surface is dark. States: draft→issued→payment_pending→paid, with dunning (→overdue→dunning_1→dunning_2→suspended) and admin exits (waive/write_off/cancel/reactivate). The dunning steps are cron-driven.

**Files:**
- Modify: `src/index.ts` (import + `app.route` mount; wire the dunning sweep into `scheduled()`)
- Modify: `pages/src/components/pages/AdminWorkstationPage.tsx` (subscription-billing oversight tab)
- Test: `tests/subscription-billing-mount.test.ts` (create) — plus confirm/extend the chain's own test

- [ ] **Step 1: Read the chain's exports + find its sweep function.**

Run:
```bash
grep -n "export" src/routes/subscription-billing-chain.ts
grep -rn "Sweep\|sweep\|dunning" src/routes/subscription-billing-chain.ts | head
grep -rn "subscription" tests/ | head
grep -n "subscription/billing\|subscriptionBilling" src/index.ts
```
Record: the route export name (default vs named), the sweep function name (e.g. `subscriptionBillingSweep` / `sbDunningSweep`), and whether a test already exists. Confirm the route is NOT already mounted.

- [ ] **Step 2: Write the failing mount test.**

```ts
// tests/subscription-billing-mount.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import app from '../src/index';
import { signToken } from '../src/utils/auth';

let db: Database.Database; let env: any;
beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  db.prepare(`INSERT INTO users (id,email,role,tenant_id) VALUES ('adm','adm@t.co','admin','default')`).run();
});
afterEach(() => db.close());

describe('subscription-billing mount', () => {
  it('GET /api/subscription/billing is mounted (not 404) for admin', async () => {
    const token = await signToken({ id: 'adm', email: 'adm@t.co', role: 'admin', tenant_id: 'default' }, env);
    // Use the chain's real list path discovered in Step 1 (root or e.g. /invoices).
    const res = await app.request('/api/subscription/billing', { headers: { Authorization: `Bearer ${token}` } }, env);
    expect(res.status).not.toBe(404);
  });
});
```
Adjust the GET path to the chain's real list endpoint.

- [ ] **Step 3: Run — verify it fails** (404, route unmounted).

Run: `npx vitest run tests/subscription-billing-mount.test.ts`
Expected: FAIL (404).

- [ ] **Step 4: Mount the route + wire the sweep.**

In `src/index.ts`, near the other `app.route('/api/...', ...)` mounts (lines ~527-602), add the import (matching the export from Step 1) and:
```ts
app.route('/api/subscription/billing', subscriptionBillingChainRoutes);
```
In `scheduled()`, add the dunning sweep to an existing daily schedule (the dunning lifecycle is day-grained — use `30 0 * * *` alongside the other dunning/margin cycles, or the schedule the chain's comment specifies). Call it the same defensive way other sweeps are invoked (await + error-isolated). If the chain has no sweep export, skip the cron wiring and note that.

- [ ] **Step 5: Run — verify the mount test passes + the chain's own tests still pass.**

Run: `npx vitest run tests/subscription-billing-mount.test.ts && npx vitest run -t "subscription"`
Expected: PASS. If no chain test existed, the second command is a no-op — add a minimal happy-path transition test (draft→issued→payment_pending→paid) using the spec, mirroring an existing `*-chain` test.

- [ ] **Step 6: Backend check + commit (1/2).**

Run: `npm run check && npx vitest run -t "subscription"`
```bash
git add src/index.ts tests/subscription-billing-mount.test.ts
git commit -m "feat(subscription): mount W228 Platform Subscription Billing chain

Route, spec, and migration 474 existed on-branch but were never wired; mount
at /api/subscription/billing and add the dunning sweep to the daily cron so
overdue→dunning_1→dunning_2→suspended progresses automatically.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 7: Add the admin oversight tab.**

In `AdminWorkstationPage.tsx`, add a "Subscription billing" tab: list invoices with status + aging, and the admin exit actions (waive / write-off / cancel / reactivate) the chain exposes. Impeccable craft (no hero-metric block, no identical-card grid, tinted neutrals, OKLCH). Reuse existing admin fetch/auth helpers.

- [ ] **Step 8: SPA check + build + commit (2/2).**

Run: `npm run check:pages && (cd pages && npm run build)`
```bash
git add pages/src/components/pages/AdminWorkstationPage.tsx
git commit -m "feat(admin-ui): subscription-billing oversight tab (W228)

List invoices with aging + admin exits (waive/write-off/cancel/reactivate)
against the newly-mounted /api/subscription/billing surface.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Dedupe the IPP force-majeure tabs (key collision)

**Context:** `pages/src/components/pages/IppWorkstationPage.tsx` declares three force-majeure tabs:
- line 138 — `key: 'force-majeure'`, "Force majeure (W158)", group Documents, renders `<IppFmTab />`
- line 153 — `key: 'force-majeure'`, "Force majeure declaration (W173)", group Risk, renders `<IppForceMajeureTab />`  ← **key collides with 138**
- line 166 — `key: 'force_majeure'`, "Force Majeure (W194)", group Operations, renders `<IppForceMajeureTab />`  ← **same component as 153**

Two distinct components exist (`IppFmTab` vs `IppForceMajeureTab`). So W158 is one feature; W173 and W194 are the same second feature shown twice with a key collision against W158. Fix: keep W158 (138) and exactly one `IppForceMajeureTab` entry, with all keys unique. The SPA has no unit-test runner — verify via `tsc` + build.

**Files:**
- Modify: `pages/src/components/pages/IppWorkstationPage.tsx` (lines 138, 153, 166)

- [ ] **Step 1: Confirm the three entries and whether W173 vs W194 pass different props.**

Run: `sed -n '130,170p' pages/src/components/pages/IppWorkstationPage.tsx`
Confirm lines 153 and 166 render `<IppForceMajeureTab />` with no differing props. If one passes props the other doesn't, keep that one. Otherwise default to keeping line 166 (W194, Operations) and removing line 153 (W173) — this removes both the duplicate component and the colliding key in one edit.

- [ ] **Step 2: Apply the dedupe.**

Remove the redundant `IppForceMajeureTab` entry (default: line 153 / W173). The remaining two tabs are line 138 (`key: 'force-majeure'`, `IppFmTab`) and line 166 (`key: 'force_majeure'`, `IppForceMajeureTab`) — distinct keys, distinct components. If product intent is that W158 and the FM-declaration are the *same* feature, instead collapse to a single tab; record the decision in the commit body. Do not invent a third behavior.

- [ ] **Step 3: Verify keys are unique across the whole tab list.**

Run: `grep -nE "key: *'(force-majeure|force_majeure)'" pages/src/components/pages/IppWorkstationPage.tsx`
Expected: at most one line per distinct key string; no two entries share a key.

- [ ] **Step 4: SPA check + build.**

Run: `npm run check:pages && (cd pages && npm run build)`
Expected: both succeed (no TS errors, build emits).

- [ ] **Step 5: Commit.**

```bash
git add pages/src/components/pages/IppWorkstationPage.tsx
git commit -m "fix(ipp-ui): dedupe force-majeure tabs + resolve key collision

Lines 138 and 153 both used key 'force-majeure' (React key collision); 153
(W173) and 166 (W194) rendered the identical IppForceMajeureTab. Keep W158
(distinct IppFmTab) + one FM-declaration tab with a unique key; drop the
redundant duplicate.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wave A verification + checkpoint

**Files:** none (verification only)

- [ ] **Step 1: Backend type-check.** Run: `npm run check` — Expected: clean.
- [ ] **Step 2: SPA type-check.** Run: `npm run check:pages` — Expected: clean.
- [ ] **Step 3: Full test suite.** Run: `npm test` — Expected: 8016+ passing, 0 failing (4 new test files add tests on top of the 8016 baseline; the number only goes up).
- [ ] **Step 4: SPA build.** Run: `cd pages && npm run build` — Expected: build succeeds.
- [ ] **Step 5: Confirm git log shows the Wave A commits and the tree is clean.** Run: `git log --oneline -9 && git status`
- [ ] **Step 6: Checkpoint.** Relay to the user: what shipped (the 5 items), the test count, and that the branch is held as-is (no merge/push/PR). Then proceed to Wave B.

---

## Self-Review

- **Spec coverage:** 5 audit items → Tasks 1-5; verification → Task 6. All covered.
- **Placeholders:** Test payloads/table names are explicitly flagged "adjust to the real schema found in Step 1/2" — these are codebase-confirmation steps, not vague TODOs; each task's Step 1 makes the confirmation concrete before code is written.
- **Type consistency:** `registerUnderservedInboxRules` / `pushRoleAction` / `RoleActionInput` fields (`target_role`, `target_participant_id?`, `source_event`, `source_chain_key?`, `source_entity_type`, `source_entity_id`, `title`, `body?`, `cross_option?`, `priority?`, `sla_due_at?`) match `src/utils/role-actions.ts`. `retryDlqItem(env,id,operatorId)` and `resolveDlqItem(env,id,operatorId,status,note?)` match `src/utils/cascade.ts`. `runCascadeRegistry` / `_resetRegistryForTests` / `registerCascadeRule` match `src/utils/cascade-registry.ts`.
- **Risk note:** Tasks 1 and 2 carry the only tenancy/authz surface area (role broadening + admin endpoints). Both have explicit ownership/role-gate verification steps and negative-path tests.
