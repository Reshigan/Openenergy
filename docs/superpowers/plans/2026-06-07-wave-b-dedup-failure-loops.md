# Wave B — Dedup / Single-Source + Close Failure Loops

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove triplicated cascade-data accessors, harden site-creation tenancy, and fix subscription-billing stats so they reflect the full filtered set rather than one page.

**Architecture:** Three independent, additive changes against existing surfaces. No new EventTypes, no schema changes, no migrations. Backend tests via `tests/helpers/d1-sqlite.ts` (`createTestDb`, `envFor`, `call`).

**Tech Stack:** Hono + D1 (better-sqlite3 in tests) + vitest.

---

### Task B1: Single-source `dstr` / `dnum` cascade accessors

`dstr`/`dnum` are byte-identical in three files: `offtaker-procurement.ts`, `underserved-inboxes.ts`, `lifecycle-sequencing.ts`. Extract to one util; import in all three.

**Files:**
- Create: `src/utils/cascade-data.ts`
- Modify: `src/cascade-rules/offtaker-procurement.ts`, `src/cascade-rules/underserved-inboxes.ts`, `src/cascade-rules/lifecycle-sequencing.ts`
- Test: existing `tests/underserved-inboxes-rules.test.ts`, `tests/cascade-rules-*.test.ts`, `tests/lifecycle-sequencing.test.ts` cover behavior — must stay green.

- [ ] **Step 1:** Create `src/utils/cascade-data.ts`:

```ts
import type { CascadeContext } from './cascade';

/** Read a non-empty string field from a cascade context's data payload. */
export function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Read a finite number field from a cascade context's data payload. */
export function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
```

- [ ] **Step 2:** In each of the three rule files, delete the local `dstr`/`dnum` definitions and add `import { dstr, dnum } from '../utils/cascade-data';`. Leave `uid`/`nowIso`/`numberFrom` in lifecycle-sequencing untouched.
- [ ] **Step 3:** `npm run check` — clean.
- [ ] **Step 4:** `npx vitest run tests/underserved-inboxes-rules.test.ts tests/offtaker-procurement-rules.test.ts tests/lifecycle-sequencing.test.ts` — all green.
- [ ] **Step 5:** Commit `refactor(cascade): single-source dstr/dnum data accessors`.

---

### Task B2: Harden `POST /sites` participant_id (officer-only cross-participant)

`esums-om.ts:174` binds `b.participant_id || user.id`, letting any mutating role create a site attributed to another participant. Mirror the existing `OM_OFFICER_ROLES` model: only officers may set a foreign owner; everyone else is forced to `user.id`.

**Files:**
- Modify: `src/routes/esums-om.ts:162-185`
- Test: `tests/esums-om-sites-tenancy.test.ts` (create)

- [ ] **Step 1 (failing test):** create `tests/esums-om-sites-tenancy.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import om from '../src/routes/esums-om';

let db: Database.Database; let env: any;
beforeEach(async () => { db = createTestDb({ applyMigrations: true }); env = envFor(db); });
afterEach(() => db.close());

it('forces a non-officer site owner to the caller, ignoring a foreign participant_id', async () => {
  const token = await testJwtFor(db, 'par_ipp', { role: 'ipp_developer' });
  const res = await call(om, env, 'POST', '/sites', {
    token, body: { name: 'S1', capacity_mw: 5, participant_id: 'par_victim' },
  });
  expect(res.status).toBe(201);
  const id = (res.json as any).data.id;
  const row = db.prepare('SELECT participant_id FROM om_sites WHERE id=?').get(id) as any;
  expect(row.participant_id).toBe('par_ipp');
});

it('lets an officer set a foreign owner (on-behalf onboarding)', async () => {
  const token = await testJwtFor(db, 'par_admin', { role: 'admin' });
  const res = await call(om, env, 'POST', '/sites', {
    token, body: { name: 'S2', capacity_mw: 5, participant_id: 'par_owner' },
  });
  expect(res.status).toBe(201);
  const id = (res.json as any).data.id;
  const row = db.prepare('SELECT participant_id FROM om_sites WHERE id=?').get(id) as any;
  expect(row.participant_id).toBe('par_owner');
});
```

- [ ] **Step 2:** Run it — first test FAILS (owner is `par_victim`).
- [ ] **Step 3:** In `esums-om.ts` POST `/sites`, replace the `participant_id` bind. Before the INSERT bind, compute:

```ts
const ownerId = OM_OFFICER_ROLES.includes(user.role) ? (b.participant_id || user.id) : user.id;
```

and bind `ownerId` in the `participant_id` position (was `b.participant_id || user.id`).

- [ ] **Step 4:** Run the test — both PASS. Run `tests/esums-om-ownership.test.ts` — still green.
- [ ] **Step 5:** Commit `fix(esums-om): non-officers cannot attribute a new site to another participant`.

---

### Task B3: Subscription-billing stats over the full filtered set

`subscription-billing-chain.ts:127-135` computes stats from `items` (one page) so totals undercount past `per_page`. Compute via a separate aggregate query using the same filters minus LIMIT/OFFSET.

**Files:**
- Modify: `src/routes/subscription-billing-chain.ts:105-138`
- Test: `tests/subscription-billing-stats.test.ts` (create)

- [ ] **Step 1 (failing test):** create `tests/subscription-billing-stats.test.ts` — generate 3 invoices, request `per_page=1`, assert `stats.total === 3` (page returns 1 row).

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor, testJwtFor, call } from './helpers/d1-sqlite';
import app from '../src/routes/subscription-billing-chain';

let db: Database.Database; let env: any; let admin: string;
beforeEach(async () => {
  db = createTestDb({ applyMigrations: true }); env = envFor(db);
  admin = await testJwtFor(db, 'par_admin', { role: 'admin' });
});
afterEach(() => db.close());

it('stats.total counts the full filtered set, not just the page', async () => {
  for (const p of ['par_a', 'par_b', 'par_c']) {
    await call(app, env, 'POST', '/generate', { token: admin,
      body: { participant_id: p, billing_period: '2026-06', subscription_tier: 'starter' } });
  }
  const res = await call(app, env, 'GET', '/?per_page=1', { token: admin });
  expect(res.status).toBe(200);
  const body = res.json as any;
  expect(body.data.invoices.length).toBe(1);
  expect(body.data.stats.total).toBe(3);
});
```

- [ ] **Step 2:** Run it — FAILS (`stats.total === 1`).
- [ ] **Step 3:** Replace the `stats` block. Build a `where`/`whereParams` pair from the same `status`/`tier`/`period`/`breached` filters, reuse it for both the page query and a new aggregate:

```ts
const aggRow = await c.env.DB.prepare(
  `SELECT
     COUNT(*) AS total,
     COALESCE(SUM(CASE WHEN chain_status = 'paid' THEN 1 ELSE 0 END), 0) AS paid,
     COALESCE(SUM(CASE WHEN chain_status IN ('overdue','dunning_1','dunning_2') THEN 1 ELSE 0 END), 0) AS overdue,
     COALESCE(SUM(CASE WHEN chain_status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended,
     COALESCE(SUM(CASE WHEN chain_status IN ('overdue','dunning_1','dunning_2') THEN net_payable_zar * 12 ELSE 0 END), 0) AS arr_at_risk
   FROM oe_subscription_invoices ${whereClause}`,
).bind(...whereParams).first<{ total: number; paid: number; overdue: number; suspended: number; arr_at_risk: number }>();
const stats = {
  total: aggRow?.total ?? 0,
  paid: aggRow?.paid ?? 0,
  overdue: aggRow?.overdue ?? 0,
  suspended: aggRow?.suspended ?? 0,
  arr_at_risk: aggRow?.arr_at_risk ?? 0,
};
```

where `whereClause` is the shared `WHERE 1=1 AND …` string and `whereParams` the filter binds (no per_page/offset). The page query appends `ORDER BY … LIMIT ? OFFSET ?` to `whereClause` and binds `[...whereParams, per_page, offset]`.

- [ ] **Step 4:** Run the test — PASS. Run `tests/subscription-billing-mount.test.ts` — still green.
- [ ] **Step 5:** Commit `fix(subscription): compute billing stats over the full filtered set`.

---

### Task B4: Polish nits

- [ ] Offtaker `WheelingChargesTab` scope label clarity (T3 review #2) — only if the label is genuinely ambiguous after re-read.
- [ ] Admin cascade-DLQ board `submitResolve` optimistic-removal (T2 minor) — reload after server confirm, not before.
- [ ] Each polish lands in its own commit only if it is a real improvement; skip cosmetic-only changes.

---

## Verification (Wave B boundary)

- [ ] `npm run check` clean
- [ ] `npm run check:pages` clean
- [ ] `npm test` — ≥ 8035 + new tests passing
- [ ] `cd pages && npm run build` ok
- [ ] Dispatch one code-quality reviewer over the Wave B diff
- [ ] Relay Wave B boundary status; proceed to Wave C
