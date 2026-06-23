# Meridian Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Binding companion:** [MERIDIAN_EXECUTION_PROCESS.md](MERIDIAN_EXECUTION_PROCESS.md) — the per-task loop, phase gates A–G, anti-slop ban registers (code + design + a11y), known bug-class guards, runtime verification protocol, and review checklist. Every task in this plan runs through that process; a task is done only when its gate passed with evidence.

**Goal:** Replace tab-based navigation with three computed surfaces — HORIZON (per-role workspace positioned by deadline × ZAR), THREAD (shared two-sided transaction view), ATLAS (searchable function library + ⌘K) — across all 12 roles and 76 chains, with zero per-wave UI cost going forward.

**Architecture:** One backend `CHAIN_REGISTRY` (descriptor per chain: table, quantum column, lanes per role, action hints) feeds two new generic API routes (`/api/horizon/:role`, `/api/thread/:chainKey/:id`). Frontend gets a `pages/src/meridian/` module (tokens + 3 pages + palette) wired into App.tsx. Existing 76 chain routes, workstations, and tabs stay untouched; workstations demote to Atlas targets. Rollout is per-role: Lender first end-to-end, then mechanical registry/lane additions per role.

**Tech Stack:** Hono + D1 (`env.DB.batch`), vitest (backend only — SPA has NO unit-test runner), React + react-router in `pages/`, plain CSS with OKLCH tokens (no new deps), Playwright (`tests/browser/`) for UI verification, `npm run check` / `check:pages` for types.

**Design source of truth:** `MERIDIAN_REDESIGN.md` + `mockups/meridian/01-horizon.html`, `02-thread.html`, `03-atlas.html`. Copy token values and component anatomy from the mockups verbatim.

**Ground truths (verified 2026-06-12):**
- Every chain table uses `chain_status` (TEXT) + `sla_deadline_at` (TEXT) + `last_sla_breach_at`. Quantum/amount column names vary per chain (e.g. `outstanding_principal`, `notional_zar`, `assessed_amount`).
- Chain GET routes return `{ success: true, data: { items, total, ... } }` (a few legacy variants exist; Meridian reads tables directly, not routes).
- `pages/src/ux-alternatives/launchpad-nav/roleData.ts` (897 lines): `ROLE_CONFIGS` for 12 roles, `Feature.chainKey` already present.
- `pages/src/lib/api.ts` exports axios `api` instance.
- Post-login: `LaunchRedirect` in App.tsx (lines ~536–575) → `/onboard` or `/feed`. No `/horizon` or `/thread` routes exist.
- Mockup-b tokens live in `pages/src/index.css` (`--oe-*`). Meridian tokens are ADDITIVE (`--mer-*`), scoped to Meridian pages — do not touch `--oe-*`.

**Constraints (non-negotiable):**
- NEVER modify migrations 001–505. Meridian needs NO new migrations.
- No pushes to remote without explicit user authorization.
- Browser tests against local dev only (`BASE=http://localhost:8787`); login once via API, seed token with `page.addInitScript` (auth rate limiter: 10/5min/IP).
- All work on a feature branch `meridian` off current `main`.

---

## Phase map

| Phase | Ships | Verifies with |
|---|---|---|
| 1 | Chain registry + pure scoring helpers (backend) | vitest |
| 2 | `/api/horizon/:role` (Lender data) | vitest + curl local |
| 3 | Horizon UI (Lender) at `/horizon` | check:pages + Playwright |
| 4 | `/api/thread/:chainKey/:id` + Thread UI | vitest + Playwright |
| 5 | Atlas page + global ⌘K palette | check:pages + Playwright |
| 6 | Remaining 11 roles (registry data + lanes) | vitest registry test |
| 7 | Cutover: post-login → Horizon, workstations demoted | Playwright + smoke |

Each phase is independently shippable. Stop/resume points are phase boundaries.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 1: Create branch**

```bash
cd /Users/reshigan/Openenergy && git checkout -b meridian
```

Note: working tree has uncommitted launchpad-nav changes (App.tsx, FioriShell.tsx, deleted launch components, new LoginPage etc.). They ride along on the branch; do not revert them.

- [ ] **Step 2: Commit the in-flight launchpad work so Meridian diffs stay clean**

```bash
git add -A open-energy-platform/pages FRONTEND_REDESIGN_PLAN.md JOURNEY_AUDIT.md USER_JOURNEYS.md open-energy-platform/migrations/505_chain_table_indexes.sql
git commit -m "wip(launchpad): carry in-flight launchpad-nav work onto meridian branch"
```

---

## Phase 1 — Chain Registry (backend)

### Task 1: Registry types + pure helpers

**Files:**
- Create: `open-energy-platform/src/utils/chain-registry-meridian.ts`
- Test: `open-energy-platform/src/utils/chain-registry-meridian.test.ts`

Name avoids collision with existing `cascade-registry.ts` (Layer A — different thing, do not touch).

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/chain-registry-meridian.test.ts
import { describe, it, expect } from 'vitest';
import {
  MERIDIAN_CHAINS, bucketFor, attentionScore, type HorizonBucket,
} from './chain-registry-meridian';

const NOW = new Date('2026-06-12T09:40:00Z').getTime();
const h = (n: number) => new Date(NOW + n * 3600_000).toISOString();

describe('bucketFor', () => {
  it('maps deadlines to the six horizon buckets', () => {
    expect(bucketFor(h(-1), NOW)).toBe<'breached'>('breached');
    expect(bucketFor(h(1), NOW)).toBe<'h2'>('h2');
    expect(bucketFor(h(8), NOW)).toBe<'today'>('today');   // <24h
    expect(bucketFor(h(40), NOW)).toBe<'h48'>('h48');
    expect(bucketFor(h(100), NOW)).toBe<'week'>('week');    // <168h
    expect(bucketFor(h(300), NOW)).toBe<'later'>('later');
    expect(bucketFor(null, NOW)).toBe<'later'>('later');
  });
});

describe('attentionScore', () => {
  it('weights by log10(ZAR) over hours remaining, money dominates within a bucket', () => {
    const big = attentionScore(850_000_000, h(8), NOW);
    const small = attentionScore(12_000, h(8), NOW);
    expect(big).toBeGreaterThan(small);
  });
  it('breached outranks everything regardless of quantum', () => {
    expect(attentionScore(12_000, h(-1), NOW))
      .toBeGreaterThan(attentionScore(850_000_000, h(8), NOW));
  });
  it('handles null quantum and null deadline without NaN', () => {
    expect(Number.isFinite(attentionScore(null, null, NOW))).toBe(true);
  });
});

describe('MERIDIAN_CHAINS registry shape', () => {
  it('every entry has table, statusCol default, deadline col, ≥1 lane', () => {
    for (const d of MERIDIAN_CHAINS) {
      expect(d.table).toMatch(/^oe_/);
      expect(d.key).toMatch(/^[a-z_]+$/);
      expect(Object.keys(d.lanes).length).toBeGreaterThan(0);
      expect(d.terminal.length).toBeGreaterThan(0);
    }
  });
  it('keys are unique', () => {
    const keys = MERIDIAN_CHAINS.map(d => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd open-energy-platform && npx vitest run src/utils/chain-registry-meridian.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/utils/chain-registry-meridian.ts
// Meridian chain registry: one descriptor per state-machine chain.
// Feeds /api/horizon/:role and /api/thread/:chainKey/:id.
// Adding a wave = adding one entry here; zero frontend changes.

export type HorizonBucket = 'breached' | 'h2' | 'today' | 'h48' | 'week' | 'later';

export interface ChainActionHint {
  action: string;            // POST action segment on the existing chain route
  label: string;             // button label
  path: string;              // e.g. '/api/covenant-certificate/chain/:id/escalate'
  roles: string[];           // JWT roles allowed (suffixed forms: ipp_developer, grid_operator, carbon_fund)
  cascadeHint: string;       // Law 3 preview, e.g. 'Notifies borrower (IPP) and arms 14d cure window'
  tone?: 'primary' | 'ghost' | 'oxide';
}

export interface ChainDescriptor {
  key: string;               // 'covenant_certificate' — matches roleData Feature.chainKey
  wave: number;
  table: string;             // 'oe_covenant_certificates'
  title: string;             // 'Covenant certificate'
  refCol: string;            // human ref column; fall back to 'id'
  titleCol: string | null;   // descriptive column (counterparty/project name)
  quantumCol: string | null; // ZAR-at-risk column
  statusCol: string;         // 'chain_status' everywhere (verified)
  deadlineCol: string;       // 'sla_deadline_at' everywhere (verified)
  terminal: string[];        // statuses hidden from Horizon
  counterpartyCol: string | null;
  lanes: Record<string, string>; // role -> lane key (mirrors roleData domain keys)
  eventsTable: string | null;    // per-chain event table; null = Thread hides timeline (v1 ok)
  eventsFk: string | null;
  actions: ChainActionHint[];    // v1: top 2-3 decisive transitions only
}

const HOUR = 3600_000;

export function bucketFor(deadlineIso: string | null, now: number): HorizonBucket {
  if (!deadlineIso) return 'later';
  const t = Date.parse(deadlineIso);
  if (Number.isNaN(t)) return 'later';
  const hrs = (t - now) / HOUR;
  if (hrs < 0) return 'breached';
  if (hrs < 2) return 'h2';
  if (hrs < 24) return 'today';
  if (hrs < 48) return 'h48';
  if (hrs < 168) return 'week';
  return 'later';
}

// Law 2: log10(ZAR) × 1/hours-remaining. Breach gets an absolute floor above any live score.
export function attentionScore(zar: number | null, deadlineIso: string | null, now: number): number {
  const money = Math.log10(Math.max(zar ?? 1, 1) + 1);
  if (!deadlineIso) return money / 1000;
  const t = Date.parse(deadlineIso);
  if (Number.isNaN(t)) return money / 1000;
  const hrs = (t - now) / HOUR;
  if (hrs < 0) return 1_000_000 + money;        // breached: always on top, money breaks ties
  return money / Math.max(hrs, 0.25);
}

export const MERIDIAN_CHAINS: ChainDescriptor[] = [
  // ───────── LENDER (Phase 2 scope) ─────────
  {
    key: 'covenant_certificate', wave: 38, table: 'oe_covenant_certificates',
    title: 'Covenant certificate', refCol: 'id', titleCol: 'borrower_name',
    quantumCol: 'outstanding_principal', statusCol: 'chain_status',
    deadlineCol: 'sla_deadline_at',
    terminal: ['compliant', 'accelerated', 'waived', 'closed'],
    counterpartyCol: 'borrower_name',
    lanes: { lender: 'covenants', regulator: 'oversight' },
    eventsTable: null, eventsFk: null,
    actions: [
      { action: 'review', label: 'Review certificate', path: '/api/covenant-certificate/chain/:id/review',
        roles: ['admin', 'lender'], cascadeHint: 'Starts compliance assessment; borrower notified of receipt.' },
      { action: 'declare_breach', label: 'Declare breach', path: '/api/covenant-certificate/chain/:id/declare_breach',
        roles: ['admin', 'lender'], tone: 'oxide',
        cascadeHint: 'Notifies borrower (IPP), opens cure window, adds facility to watchlist (W6).' },
    ],
  },
  // Remaining Lender chains appended in Task 2; other roles in Phase 6.
];

export function chainsForRole(role: string): ChainDescriptor[] {
  return MERIDIAN_CHAINS.filter(d => role in d.lanes);
}

export function getChain(key: string): ChainDescriptor | undefined {
  return MERIDIAN_CHAINS.find(d => d.key === key);
}
```

- [ ] **Step 4: Run tests — pass**

```bash
npx vitest run src/utils/chain-registry-meridian.test.ts
```
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/utils/chain-registry-meridian.ts src/utils/chain-registry-meridian.test.ts
git commit -m "feat(meridian): chain registry types + bucket/attention scoring"
```

---

### Task 2: Populate Lender registry entries (verified against migrations)

**Files:**
- Modify: `open-energy-platform/src/utils/chain-registry-meridian.ts`
- Modify: `open-energy-platform/src/utils/chain-registry-meridian.test.ts`

Lender chains: W6 watchlist/dunning, W21 drawdown, W30 disbursement, W38 covenant cert (done), W45 loan default, W53 credit origination, W61 loan transfer, W69 security perfection.

- [ ] **Step 1: Verify each table + columns from migrations (DO NOT GUESS)**

For each wave, find its table and columns:

```bash
cd open-energy-platform
grep -rn "CREATE TABLE IF NOT EXISTS oe_" migrations/ | grep -iE "drawdown|disburse|loan_default|credit_facility|loan_transfer|security_perfection|watchlist|dunning"
# then for each hit, read the CREATE TABLE block to record: ref col, title col, quantum col, terminal statuses:
sed -n '/CREATE TABLE IF NOT EXISTS oe_loan_transfers/,/);/p' migrations/<file>.sql
```

Record per chain: `table`, `refCol`, `titleCol`, `quantumCol`, `counterpartyCol`, terminal statuses (read the route file's transition map, e.g. `src/routes/loan-transfer-chain.ts`, for the terminal state list).

- [ ] **Step 2: Add a registry-vs-migrations consistency test**

```ts
// append to chain-registry-meridian.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('registry tables exist in migrations', () => {
  const migDir = join(__dirname, '../../migrations');
  const allSql = readdirSync(migDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => readFileSync(join(migDir, f), 'utf8'))
    .join('\n');

  it('every registry table has a CREATE TABLE migration', () => {
    for (const d of MERIDIAN_CHAINS) {
      expect(allSql, `missing table ${d.table} (chain ${d.key})`)
        .toContain(`CREATE TABLE IF NOT EXISTS ${d.table}`);
    }
  });
  it('every quantum/deadline column appears in that table DDL', () => {
    for (const d of MERIDIAN_CHAINS) {
      const m = allSql.split(`CREATE TABLE IF NOT EXISTS ${d.table}`)[1]?.split(');')[0] ?? '';
      expect(m, `${d.table} missing ${d.deadlineCol}`).toContain(d.deadlineCol);
      if (d.quantumCol) expect(m, `${d.table} missing ${d.quantumCol}`).toContain(d.quantumCol);
    }
  });
});
```

- [ ] **Step 3: Run — passes for covenant_certificate, then add the 7 remaining Lender entries**

Each entry follows the Task 1 pattern. Lane keys must match Lender domains in `roleData.ts` (open it and use its exact `domain.key` values — investigator confirmed domains exist per role; e.g. covenants, facilities, distressed, security, origination). Two-party chains set both roles' lanes:

```ts
// example shape — fill columns from Step 1 evidence, not from this example
{
  key: 'loan_transfer', wave: 61, table: 'oe_loan_transfers',
  title: 'Loan transfer', refCol: 'id', titleCol: '<from DDL>',
  quantumCol: '<from DDL>', statusCol: 'chain_status', deadlineCol: 'sla_deadline_at',
  terminal: ['<from route transition map>'],
  counterpartyCol: '<from DDL>',
  lanes: { lender: 'security' },
  eventsTable: null, eventsFk: null,
  actions: [ /* top 2 transitions from the route file, with cascadeHint sentences */ ],
},
```

- [ ] **Step 4: Run full registry test — PASS**

```bash
npx vitest run src/utils/chain-registry-meridian.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(meridian): lender chain registry entries (W6,21,30,38,45,53,61,69)"
```

---

## Phase 2 — Horizon API

### Task 3: `/api/horizon/:role` route

**Files:**
- Create: `open-energy-platform/src/routes/horizon.ts`
- Create: `open-energy-platform/src/routes/horizon.test.ts`
- Modify: `open-energy-platform/src/index.ts` (mount)

- [ ] **Step 1: Write failing tests for the pure assembly function**

The route splits into a pure `assembleHorizon(rows, registry, now)` (unit-testable) and a thin D1 fetch layer (verified by curl). Test the pure part:

```ts
// src/routes/horizon.test.ts
import { describe, it, expect } from 'vitest';
import { assembleHorizon, type ChainRows } from './horizon';
import { MERIDIAN_CHAINS } from '../utils/chain-registry-meridian';

const NOW = Date.parse('2026-06-12T09:40:00Z');
const cov = MERIDIAN_CHAINS.find(d => d.key === 'covenant_certificate')!;

const rows: ChainRows[] = [{
  chain: cov,
  rows: [
    { id: 'cc-1', borrower_name: 'Karusa Wind', chain_status: 'under_review',
      sla_deadline_at: new Date(NOW - 3600_000).toISOString(), outstanding_principal: 310_000_000 },
    { id: 'cc-2', borrower_name: 'Umoyilanga', chain_status: 'certificate_due',
      sla_deadline_at: new Date(NOW + 30 * 3600_000).toISOString(), outstanding_principal: 95_000_000 },
  ],
}];

describe('assembleHorizon', () => {
  const h = assembleHorizon(rows, 'lender', NOW);

  it('groups cases into lanes by registry lane key', () => {
    const lane = h.lanes.find(l => l.key === 'covenants');
    expect(lane).toBeDefined();
    expect(lane!.cases).toHaveLength(2);
  });
  it('buckets by deadline', () => {
    const lane = h.lanes.find(l => l.key === 'covenants')!;
    expect(lane.cases.find(c => c.id === 'cc-1')!.bucket).toBe('breached');
    expect(lane.cases.find(c => c.id === 'cc-2')!.bucket).toBe('h48');
  });
  it('duty stream ranks breached R310m first and carries action hints', () => {
    expect(h.duty[0].id).toBe('cc-1');
    expect(h.duty[0].actions.length).toBeGreaterThan(0);
    expect(h.duty[0].actions[0].cascadeHint).toBeTruthy();
  });
  it('caps duty stream at 8', () => {
    expect(h.duty.length).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 2: Run — FAIL (module not found)**

- [ ] **Step 3: Implement route**

```ts
// src/routes/horizon.ts
import { Hono } from 'hono';
import type { HonoEnv } from '../index';
import { authMiddleware, getCurrentUser } from '../utils/auth';
import {
  chainsForRole, bucketFor, attentionScore,
  type ChainDescriptor, type HorizonBucket,
} from '../utils/chain-registry-meridian';

export interface ChainRows { chain: ChainDescriptor; rows: Record<string, unknown>[] }

export interface HorizonCase {
  chain: string; wave: number; id: string; ref: string; title: string;
  status: string; deadline_at: string | null; bucket: HorizonBucket;
  quantum_zar: number | null; counterparty: string | null;
  score: number;
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string }[];
}

export function assembleHorizon(data: ChainRows[], role: string, now: number) {
  const laneMap = new Map<string, HorizonCase[]>();
  const all: HorizonCase[] = [];

  for (const { chain, rows } of data) {
    const laneKey = chain.lanes[role];
    if (!laneKey) continue;
    for (const r of rows) {
      const deadline = (r[chain.deadlineCol] as string | null) ?? null;
      const zar = chain.quantumCol ? Number(r[chain.quantumCol] ?? 0) || null : null;
      const c: HorizonCase = {
        chain: chain.key, wave: chain.wave,
        id: String(r.id ?? r[chain.refCol]),
        ref: String(r[chain.refCol] ?? r.id),
        title: chain.titleCol ? String(r[chain.titleCol] ?? chain.title) : chain.title,
        status: String(r[chain.statusCol] ?? ''),
        deadline_at: deadline, bucket: bucketFor(deadline, now),
        quantum_zar: zar,
        counterparty: chain.counterpartyCol ? String(r[chain.counterpartyCol] ?? '') || null : null,
        score: attentionScore(zar, deadline, now),
        actions: chain.actions
          .filter(a => a.roles.includes(role) || a.roles.includes('admin'))
          .map(({ roles: _r, ...a }) => a),
      };
      all.push(c);
      (laneMap.get(laneKey) ?? laneMap.set(laneKey, []).get(laneKey)!).push(c);
    }
  }

  const lanes = [...laneMap.entries()].map(([key, cases]) => ({
    key,
    cases: cases.sort((a, b) => b.score - a.score),
  }));
  const duty = [...all].sort((a, b) => b.score - a.score).slice(0, 8);
  const counts = { total: all.length, breached: all.filter(c => c.bucket === 'breached').length };
  return { lanes, duty, counts };
}

const horizon = new Hono<HonoEnv>();
horizon.use('*', authMiddleware);

horizon.get('/:role', async (c) => {
  const role = c.req.param('role');
  const user = getCurrentUser(c);
  // role-suffix discipline: grid→grid_operator etc. Only own role or admin.
  if (user.role !== role && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const chains = chainsForRole(role);
  if (!chains.length) return c.json({ success: true, data: { lanes: [], duty: [], counts: { total: 0, breached: 0 } } });

  // One D1 round-trip for all chains
  const stmts = chains.map(d =>
    c.env.DB.prepare(
      `SELECT * FROM ${d.table}
       WHERE ${d.statusCol} NOT IN (${d.terminal.map(() => '?').join(',')})
       ORDER BY ${d.deadlineCol} ASC LIMIT 60`,
    ).bind(...d.terminal),
  );
  const results = await c.env.DB.batch(stmts);
  const data: ChainRows[] = chains.map((chain, i) => ({
    chain, rows: (results[i].results ?? []) as Record<string, unknown>[],
  }));
  return c.json({ success: true, data: assembleHorizon(data, role, Date.now()) });
});

export default horizon;
```

Adjust `authMiddleware`/`getCurrentUser` imports to the actual exports (check `src/utils/auth.ts` — other routes import these; copy a neighboring chain route's import lines exactly). Tenancy: chain tables are tenant-scoped via existing route writes; Horizon is read-only per role. If neighboring routes filter by `tenant_id`, add the same predicate (`resolveTenant` from `utils/tenant.ts`) to the SELECT — match what `covenant-certificate-chain.ts` GET does.

- [ ] **Step 4: Mount in index.ts**

```ts
// src/index.ts — alongside the other ~51 app.route lines
import horizon from './routes/horizon';
app.route('/api/horizon', horizon);
```

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run src/routes/horizon.test.ts && npm run check
```
Expected: PASS, 0 TS errors.

- [ ] **Step 6: Smoke locally**

```bash
npm run dev &   # :8787
source scripts/_login.sh && TOKEN=$(login_or_cached lender@openenergy.co.za 'Demo@2024!')
curl -s http://localhost:8787/api/horizon/lender -H "Authorization: Bearer $TOKEN" | head -c 600
```
Expected: `{"success":true,"data":{"lanes":[...],"duty":[...],"counts":{...}}}`. Empty lanes acceptable if local D1 has no live Lender cases — seed one via existing chain POST endpoints if needed for eyeballing.

- [ ] **Step 7: Commit**

```bash
git add src/routes/horizon.ts src/routes/horizon.test.ts src/index.ts
git commit -m "feat(meridian): /api/horizon/:role aggregator over chain registry"
```

---

## Phase 3 — Horizon UI

### Task 4: Meridian tokens + shared primitives

**Files:**
- Create: `open-energy-platform/pages/src/meridian/meridian.css`
- Create: `open-energy-platform/pages/src/meridian/lib.ts`
- Create: `open-energy-platform/pages/src/meridian/components.tsx`

- [ ] **Step 1: Tokens — copy the mockup block verbatim, scoped to `.mer` root**

```css
/* pages/src/meridian/meridian.css — scoped: every Meridian page wraps in <div className="mer"> */
.mer {
  --paper: oklch(0.965 0.006 85);
  --raised: oklch(0.985 0.004 85);
  --ink: oklch(0.21 0.012 85);
  --ink2: oklch(0.42 0.012 85);
  --ink3: oklch(0.50 0.012 85);
  --line: oklch(0.885 0.008 85);
  --petrol: oklch(0.40 0.075 200);
  --petrol-deep: oklch(0.30 0.06 205);
  --petrol-tint: oklch(0.94 0.015 200);
  --amber: oklch(0.70 0.13 70);
  --amber-deep: oklch(0.55 0.12 70);
  --oxide: oklch(0.50 0.18 30);
  --oxide-tint: oklch(0.95 0.02 30);
  --moss: oklch(0.55 0.09 150);
  --ease: cubic-bezier(0.23, 1, 0.32, 1);
  font-family: 'Archivo', 'IBM Plex Sans', sans-serif;
  background: var(--paper); color: var(--ink);
  min-height: 100dvh; font-size: 14px; line-height: 1.5;
}
.mer .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
/* Port the remaining rules from mockups/meridian/01-horizon.html <style> block:
   .board, .lane, .tile, .zar.m1/.m2/.m3, .fuse/.warn/.dead, .duty, .wire,
   .btn.pri/.ghost/.ox — copy selectors verbatim, prefix each with `.mer `. */
```

Add Archivo to the font pipeline the same way existing fonts load (check `pages/index.html` / `index.css` `@font-face`; JetBrains Mono already present). If Archivo can't self-host quickly, fall back to existing Metropolis for display caps — token block stays unchanged.

- [ ] **Step 2: lib.ts — fetch + formatters**

```ts
// pages/src/meridian/lib.ts
import { api } from '../lib/api';

export type Bucket = 'breached' | 'h2' | 'today' | 'h48' | 'week' | 'later';
export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'breached', label: 'BREACHED' }, { key: 'h2', label: '< 2H' },
  { key: 'today', label: 'TODAY' }, { key: 'h48', label: '48H' },
  { key: 'week', label: 'THIS WEEK' }, { key: 'later', label: 'LATER' },
];

export interface MerAction { action: string; label: string; path: string; cascadeHint: string; tone?: string }
export interface MerCase {
  chain: string; wave: number; id: string; ref: string; title: string;
  status: string; deadline_at: string | null; bucket: Bucket;
  quantum_zar: number | null; counterparty: string | null; score: number;
  actions: MerAction[];
}
export interface HorizonData {
  lanes: { key: string; cases: MerCase[] }[];
  duty: MerCase[];
  counts: { total: number; breached: number };
}

export async function fetchHorizon(role: string): Promise<HorizonData> {
  const r = await api.get(`/horizon/${role}`);
  return r.data.data;
}

export function fmtZar(v: number | null): string {
  if (v == null) return '';
  if (v >= 1e9) return `R ${(v / 1e9).toFixed(2)}bn`;
  if (v >= 1e6) return `R ${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `R ${(v / 1e3).toFixed(0)}k`;
  return `R ${v.toFixed(0)}`;
}
export function zarMagnitudeClass(v: number | null): 'm1' | 'm2' | 'm3' {
  if (v == null || v < 1e6) return 'm1';
  if (v < 1e8) return 'm2';
  return 'm3';
}
export function fuseFraction(deadline: string | null, windowHrs = 72): number {
  if (!deadline) return 1;
  const hrs = (Date.parse(deadline) - Date.now()) / 3600_000;
  return Math.max(0, Math.min(1, hrs / windowHrs));
}
```

(`api` baseURL: confirm in `pages/src/lib/api.ts` whether it's `'/api'` — App.tsx uses `api.get('/onboarding/state')`, so paths here omit the `/api` prefix to match.)

- [ ] **Step 3: components.tsx — CaseTile, FuseBar, statuses**

```tsx
// pages/src/meridian/components.tsx
import React from 'react';
import { Link } from 'react-router-dom';
import { fmtZar, zarMagnitudeClass, fuseFraction, type MerCase } from './lib';

export function FuseBar({ deadline }: { deadline: string | null }) {
  const f = fuseFraction(deadline);
  const cls = f === 0 ? 'fuse dead' : f < 0.25 ? 'fuse warn' : 'fuse';
  return (
    <div className={cls} role="img"
         aria-label={f === 0 ? 'SLA breached' : `${Math.round(f * 100)}% of SLA window remaining`}>
      <div className="fuse-fill" style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function CaseTile({ c }: { c: MerCase }) {
  return (
    <Link to={`/thread/${c.chain}/${c.id}`} className="tile" data-bucket={c.bucket}>
      <div className="tile-head">
        <span className="mono ref">{c.ref}</span>
        <span className={`zar mono ${zarMagnitudeClass(c.quantum_zar)}`}>{fmtZar(c.quantum_zar)}</span>
      </div>
      <div className="tile-title">{c.title}</div>
      <div className="tile-meta">
        <span className="chip">{c.status.replace(/_/g, ' ')}</span>
        {c.counterparty && <span className="cp">{c.counterparty}</span>}
      </div>
      <FuseBar deadline={c.deadline_at} />
    </Link>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd open-energy-platform && npm run check:pages
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add pages/src/meridian && git commit -m "feat(meridian): tokens, lib, CaseTile/FuseBar primitives"
```

---

### Task 5: HorizonPage

**Files:**
- Create: `open-energy-platform/pages/src/meridian/HorizonPage.tsx`
- Modify: `open-energy-platform/pages/src/App.tsx` (route)

- [ ] **Step 1: Implement page**

Anatomy from `mockups/meridian/01-horizon.html`: header (wordmark, role, ⌘K hint), board = lanes × buckets grid, duty stream right rail with inline actions, wire ticker bottom. Lane labels come from `roleData.ts` domains (single source of taxonomy):

```tsx
// pages/src/meridian/HorizonPage.tsx
import React from 'react';
import './meridian.css';
import { fetchHorizon, BUCKETS, type HorizonData, type MerCase, fmtZar } from './lib';
import { CaseTile } from './components';
import { api } from '../lib/api';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { Link, useNavigate } from 'react-router-dom';

function useRole(): string {
  // same source LaunchRedirect uses — copy its user-role resolution exactly (App.tsx ~536)
  const raw = localStorage.getItem('user');
  try { return raw ? JSON.parse(raw).role : ''; } catch { return ''; }
}

export default function HorizonPage() {
  const role = useRole();
  const cfg = getRoleConfig(role);
  const [data, setData] = React.useState<HorizonData | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const nav = useNavigate();

  React.useEffect(() => {
    let live = true;
    fetchHorizon(role).then(d => live && setData(d)).catch(e => live && setErr(String(e)));
    const t = setInterval(() => fetchHorizon(role).then(d => live && setData(d)).catch(() => {}), 60_000);
    return () => { live = false; clearInterval(t); };
  }, [role]);

  const laneLabel = (key: string) =>
    cfg?.domains.find(d => d.key === key)?.label ?? key.replace(/_/g, ' ');

  async function act(c: MerCase, path: string) {
    // duty-stream inline action: POST existing chain endpoint, then refresh
    await api.post(path.replace('/api', '').replace(':id', c.id), {});
    setData(await fetchHorizon(role));
  }

  if (err) return <div className="mer mer-error">Horizon failed to load. <button onClick={() => location.reload()}>Retry</button></div>;
  if (!data) return <div className="mer mer-loading" aria-busy="true">Computing horizon…</div>;

  return (
    <div className="mer horizon">
      <header className="mer-head">
        <span className="wordmark">MERIDIAN</span>
        <span className="rolectx">{cfg?.label ?? role}</span>
        <span className="counts mono">{data.counts.total} live · {data.counts.breached} breached</span>
        <span className="spacer" />
        <Link className="atlas-link" to="/atlas">Atlas ⌘K</Link>
      </header>

      <main className="mer-main">
        <section className="board" aria-label="Live cases by time to consequence">
          <div className="board-cols mono">
            <span /> {BUCKETS.map(b => <span key={b.key}>{b.label}</span>)}
          </div>
          {data.lanes.map(lane => (
            <div className="lane" key={lane.key}>
              <h2>{laneLabel(lane.key)}</h2>
              {BUCKETS.map(b => (
                <div className="cell" key={b.key}>
                  {lane.cases.filter(c => c.bucket === b.key).map(c => <CaseTile key={`${c.chain}-${c.id}`} c={c} />)}
                </div>
              ))}
            </div>
          ))}
          {data.lanes.length === 0 && (
            <div className="board-empty">No live cases. Initiate work from <Link to="/atlas">Atlas</Link>.</div>
          )}
        </section>

        <aside className="duty" aria-label="Duty stream">
          <h2>DUTY STREAM</h2>
          {data.duty.map(c => (
            <div className="duty-item" key={`${c.chain}-${c.id}`}>
              <button className="duty-open" onClick={() => nav(`/thread/${c.chain}/${c.id}`)}>
                <span className="mono ref">{c.ref}</span> {c.title}
                <span className="mono zar">{fmtZar(c.quantum_zar)}</span>
              </button>
              <div className="duty-actions">
                {c.actions.slice(0, 2).map(a => (
                  <button key={a.action} title={a.cascadeHint}
                          className={`btn ${a.tone === 'oxide' ? 'ox' : 'pri'}`}
                          onClick={() => act(c, a.path)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Route in App.tsx**

```tsx
const HorizonPage = React.lazy(() => import('./meridian/HorizonPage'));
// inside <Routes>, with the other authed routes:
<Route path="/horizon" element={<HorizonPage />} />
```

FioriShell: add `'/horizon'`, `'/thread/'`, `'/atlas'` to the workstation/launchpad prefix list that suppresses the sidebar (FioriShell.tsx ~line 454 — same mechanism as `/launch/`).

- [ ] **Step 3: Typecheck + visual check**

```bash
npm run check:pages
npm run dev &   # worker :8787
cd pages && npm run dev &   # spa :3000
# login as lender@openenergy.co.za / Demo@2024! in browser → navigate to /horizon
```
Expected: board renders lanes/buckets, duty stream populated (seed 1-2 Lender cases via existing chain POSTs if local D1 empty), no sidebar.

- [ ] **Step 4: Commit**

```bash
git add -u pages/src && git commit -m "feat(meridian): Horizon page for lender at /horizon"
```

---

### Task 6: Playwright spec — Horizon

**Files:**
- Create: `open-energy-platform/tests/browser/meridian.spec.ts`

- [ ] **Step 1: Write spec (token-seeding pattern from workstations.spec.ts — copy its login helper verbatim)**

```ts
import { test, expect } from '@playwright/test';
// reuse the exact apiLogin + addInitScript token-seed helper from workstations.spec.ts

test.describe('Meridian Horizon', () => {
  test('lender horizon renders board + duty stream', async ({ page }) => {
    const token = await apiLogin('lender@openenergy.co.za');
    await page.addInitScript(t => localStorage.setItem('token', t), token);
    await page.goto('/horizon');
    await expect(page.locator('.mer.horizon')).toBeVisible();
    await expect(page.locator('.duty h2')).toHaveText('DUTY STREAM');
    await expect(page.locator('.board-cols')).toContainText('BREACHED');
  });
});
```

- [ ] **Step 2: Run against local**

```bash
BASE=http://localhost:8787 npx playwright test tests/browser/meridian.spec.ts
```
Expected: PASS. (Requires `./deploy.sh`-style SPA build into `pages/dist` first, or run against :3000 proxy — match how workstations.spec.ts resolves BASE.)

- [ ] **Step 3: Commit**

```bash
git add tests/browser/meridian.spec.ts && git commit -m "test(meridian): horizon browser spec"
```

---

## Phase 4 — Thread (shared two-sided transaction view)

### Task 7: `/api/thread/:chainKey/:id`

**Files:**
- Create: `open-energy-platform/src/routes/thread.ts`
- Create: `open-energy-platform/src/routes/thread.test.ts`
- Modify: `open-energy-platform/src/index.ts`

- [ ] **Step 1: Failing test for pure shaping**

```ts
// src/routes/thread.test.ts
import { describe, it, expect } from 'vitest';
import { shapeThread } from './thread';
import { getChain } from '../utils/chain-registry-meridian';

const cov = getChain('covenant_certificate')!;

describe('shapeThread', () => {
  const row = {
    id: 'cc-1', borrower_name: 'Karusa Wind', chain_status: 'under_review',
    sla_deadline_at: '2026-06-13T09:00:00Z', outstanding_principal: 310_000_000,
  };
  it('returns case envelope with quantum + deadline + status', () => {
    const t = shapeThread(cov, row, [], 'lender');
    expect(t.case.ref).toBe('cc-1');
    expect(t.case.quantum_zar).toBe(310_000_000);
    expect(t.case.status).toBe('under_review');
  });
  it('two-sided: lender gets write actions, ipp_developer gets none on this chain', () => {
    expect(shapeThread(cov, row, [], 'lender').actions.length).toBeGreaterThan(0);
    expect(shapeThread(cov, row, [], 'ipp_developer').actions).toHaveLength(0);
  });
  it('actions carry cascadeHint (Law 3)', () => {
    const t = shapeThread(cov, row, [], 'lender');
    expect(t.actions[0].cascadeHint.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// src/routes/thread.ts
import { Hono } from 'hono';
import type { HonoEnv } from '../index';
import { authMiddleware, getCurrentUser } from '../utils/auth';
import { getChain, type ChainDescriptor } from '../utils/chain-registry-meridian';

export function shapeThread(
  chain: ChainDescriptor, row: Record<string, unknown>,
  events: Record<string, unknown>[], role: string,
) {
  return {
    chain: { key: chain.key, wave: chain.wave, title: chain.title },
    case: {
      id: String(row.id ?? row[chain.refCol]),
      ref: String(row[chain.refCol] ?? row.id),
      title: chain.titleCol ? String(row[chain.titleCol] ?? chain.title) : chain.title,
      status: String(row[chain.statusCol] ?? ''),
      deadline_at: (row[chain.deadlineCol] as string | null) ?? null,
      quantum_zar: chain.quantumCol ? Number(row[chain.quantumCol] ?? 0) || null : null,
      counterparty: chain.counterpartyCol ? String(row[chain.counterpartyCol] ?? '') || null : null,
      raw: row, // Thread UI renders chain-specific fields from raw, read-only
    },
    events,           // [] until eventsTable populated per chain — UI hides timeline when empty
    actions: chain.actions.filter(a => a.roles.includes(role))
      .map(({ roles: _r, ...a }) => a),
    viewer_role: role,
  };
}

const thread = new Hono<HonoEnv>();
thread.use('*', authMiddleware);

thread.get('/:chainKey/:id', async (c) => {
  const chain = getChain(c.req.param('chainKey'));
  if (!chain) return c.json({ success: false, error: 'unknown chain' }, 404);
  const user = getCurrentUser(c);
  // two-sided access: any role with a lane on this chain may VIEW; actions filter by role
  if (!(user.role in chain.lanes) && user.role !== 'admin') {
    return c.json({ success: false, error: 'forbidden' }, 403);
  }
  const row = await c.env.DB.prepare(`SELECT * FROM ${chain.table} WHERE id = ?`)
    .bind(c.req.param('id')).first<Record<string, unknown>>();
  if (!row) return c.json({ success: false, error: 'not found' }, 404);

  let events: Record<string, unknown>[] = [];
  if (chain.eventsTable && chain.eventsFk) {
    const r = await c.env.DB.prepare(
      `SELECT * FROM ${chain.eventsTable} WHERE ${chain.eventsFk} = ? ORDER BY created_at ASC LIMIT 200`,
    ).bind(c.req.param('id')).all();
    events = (r.results ?? []) as Record<string, unknown>[];
  }
  return c.json({ success: true, data: shapeThread(chain, row, events, user.role) });
});

export default thread;
```

Mount: `app.route('/api/thread', thread);` in index.ts.

- [ ] **Step 4: Tests + check + curl**

```bash
npx vitest run src/routes/thread.test.ts && npm run check
curl -s http://localhost:8787/api/thread/covenant_certificate/<seeded-id> -H "Authorization: Bearer $TOKEN" | head -c 600
```

- [ ] **Step 5: Commit**

```bash
git add src/routes/thread.ts src/routes/thread.test.ts src/index.ts
git commit -m "feat(meridian): generic /api/thread/:chainKey/:id two-sided case view"
```

---

### Task 8: ThreadPage

**Files:**
- Create: `open-energy-platform/pages/src/meridian/ThreadPage.tsx`
- Modify: `open-energy-platform/pages/src/App.tsx`

- [ ] **Step 1: Implement (anatomy from mockups/meridian/02-thread.html)**

```tsx
// pages/src/meridian/ThreadPage.tsx
import React from 'react';
import './meridian.css';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { fmtZar } from './lib';
import { FuseBar } from './components';

interface ThreadData {
  chain: { key: string; wave: number; title: string };
  case: { id: string; ref: string; title: string; status: string; deadline_at: string | null;
          quantum_zar: number | null; counterparty: string | null; raw: Record<string, unknown> };
  events: { event_type?: string; created_at?: string; actor_role?: string; note?: string }[];
  actions: { action: string; label: string; path: string; cascadeHint: string; tone?: string }[];
  viewer_role: string;
}

export default function ThreadPage() {
  const { chainKey = '', id = '' } = useParams();
  const [t, setT] = React.useState<ThreadData | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() =>
    api.get(`/thread/${chainKey}/${id}`).then(r => setT(r.data.data)).catch(e => setErr(String(e))),
  [chainKey, id]);
  React.useEffect(() => { load(); }, [load]);

  async function act(a: ThreadData['actions'][number]) {
    setBusy(a.action);
    try { await api.post(a.path.replace('/api', '').replace(':id', id), {}); await load(); }
    catch (e) { setErr(String(e)); }
    finally { setBusy(null); }
  }

  if (err) return <div className="mer mer-error">{err} <button onClick={load}>Retry</button></div>;
  if (!t) return <div className="mer mer-loading" aria-busy="true">Loading thread…</div>;

  return (
    <div className="mer thread">
      <header className="mer-head">
        <Link to="/horizon" className="back">← Horizon</Link>
        <span className="mono ref">{t.case.ref}</span>
        <span className="spacer" />
        <span className="mono zar m3">{fmtZar(t.case.quantum_zar)}</span>
      </header>

      <main className="mer-main">
        <section className="case-body">
          <div className="case-head">
            <h1>{t.case.title}</h1>
            <div className="case-sub">
              <span className="chip">{t.case.status.replace(/_/g, ' ')}</span>
              <span>W{t.chain.wave} · {t.chain.title}</span>
              {t.case.counterparty && <span>↔ {t.case.counterparty}</span>}
            </div>
            <FuseBar deadline={t.case.deadline_at} />
          </div>

          {t.events.length > 0 && (
            <ol className="state-rail">
              {t.events.map((e, i) => (
                <li key={i} className="state done">
                  <span className="mono">{e.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  <b>{(e.event_type ?? '').replace(/_/g, ' ')}</b>
                  {e.actor_role && <span className="actor">{e.actor_role}</span>}
                </li>
              ))}
              <li className="state now"><b>{t.case.status.replace(/_/g, ' ')}</b></li>
            </ol>
          )}

          <details className="raw-fields" open>
            <summary>Case record</summary>
            <dl>
              {Object.entries(t.case.raw)
                .filter(([k, v]) => v != null && !['id'].includes(k))
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt>{k.replace(/_/g, ' ')}</dt><dd className="mono">{String(v)}</dd>
                  </React.Fragment>
                ))}
            </dl>
          </details>
        </section>
      </main>

      {t.actions.length > 0 && (
        <footer className="actbar">
          <div className="cascade-preview">
            {t.actions[0].cascadeHint}
          </div>
          <div className="actbar-btns">
            {t.actions.map(a => (
              <button key={a.action} disabled={busy !== null}
                      className={`btn ${a.tone === 'oxide' ? 'ox' : 'pri'}`}
                      title={a.cascadeHint} onClick={() => act(a)}>
                {busy === a.action ? '…' : a.label}
              </button>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
```

Route: `<Route path="/thread/:chainKey/:id" element={<ThreadPage />} />` (lazy, same pattern).

- [ ] **Step 2: Two-sided check, manually**

Login lender → open a covenant thread → actions visible. Login ipp@openenergy.co.za → same URL → case visible, actbar absent. (JWT roles suffixed: `ipp_developer` — the chain's `lanes` keys must use suffixed forms.)

- [ ] **Step 3: Typecheck + Playwright**

```bash
npm run check:pages
```
Append to `meridian.spec.ts`:

```ts
test('thread is two-sided: lender sees actions, counterparty sees read-only', async ({ page }) => {
  // navigate from horizon tile click; assert .actbar visible for lender
  // re-run with ipp token; assert .actbar hidden, .case-head visible
});
```
(Write the full assertions using the seeded case id captured during seeding.)

- [ ] **Step 4: Commit**

```bash
git add -u pages/src tests/browser && git commit -m "feat(meridian): shared two-sided ThreadPage at /thread/:chain/:id"
```

---

## Phase 5 — Atlas + ⌘K

### Task 9: Atlas index + palette

**Files:**
- Create: `open-energy-platform/pages/src/meridian/AtlasPage.tsx`
- Create: `open-energy-platform/pages/src/meridian/CommandPalette.tsx`
- Modify: `open-energy-platform/pages/src/App.tsx`

Atlas v1 is frontend-only: function index = `ROLE_CONFIGS` (domains → features), live counts = one `fetchHorizon(role)` call grouped by `chain`. Mockup anatomy: `mockups/meridian/03-atlas.html`.

- [ ] **Step 1: AtlasPage**

```tsx
// pages/src/meridian/AtlasPage.tsx
import React from 'react';
import './meridian.css';
import { Link } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { fetchHorizon, type HorizonData } from './lib';

function useRole(): string {
  const raw = localStorage.getItem('user');
  try { return raw ? JSON.parse(raw).role : ''; } catch { return ''; }
}

export default function AtlasPage() {
  const role = useRole();
  const cfg = getRoleConfig(role);
  const [h, setH] = React.useState<HorizonData | null>(null);
  React.useEffect(() => { fetchHorizon(role).then(setH).catch(() => setH(null)); }, [role]);

  const liveByChain = new Map<string, { live: number; breached: number }>();
  for (const lane of h?.lanes ?? []) for (const c of lane.cases) {
    const e = liveByChain.get(c.chain) ?? { live: 0, breached: 0 };
    e.live++; if (c.bucket === 'breached') e.breached++;
    liveByChain.set(c.chain, e);
  }

  if (!cfg) return <div className="mer mer-error">Unknown role.</div>;
  const fnCount = cfg.domains.reduce((n, d) => n + d.features.length, 0);

  return (
    <div className="mer atlas">
      <header className="mer-head">
        <Link to="/horizon" className="back">← Horizon</Link>
        <span className="wordmark">ATLAS — {cfg.label.toUpperCase()}</span>
        <span className="counts mono">{fnCount} functions · {h?.counts.total ?? 0} live · {h?.counts.breached ?? 0} breached</span>
      </header>
      <main className="domains">
        {cfg.domains.map(d => (
          <section className="domain" key={d.key}>
            <h2>{d.label.toUpperCase()}</h2>
            {d.features.map(f => {
              const live = f.chainKey ? liveByChain.get(f.chainKey) : undefined;
              return (
                <Link key={f.key} className="fn"
                      to={`${cfg.workstationPath}?tab=${f.key}`}>
                  <span className="name">{f.label}</span>
                  {live && <span className="live mono">{live.live} live</span>}
                  {live && live.breached > 0 && <span className="breach mono">{live.breached} ⚠</span>}
                </Link>
              );
            })}
          </section>
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: CommandPalette (global, ⌘K)**

```tsx
// pages/src/meridian/CommandPalette.tsx
import React from 'react';
import './meridian.css';
import { useNavigate } from 'react-router-dom';
import { getRoleConfig } from '../ux-alternatives/launchpad-nav/roleData';
import { fetchHorizon, type MerCase } from './lib';

interface Hit { type: 'function' | 'case'; label: string; sub: string; go: () => void }

export default function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const [cases, setCases] = React.useState<MerCase[]>([]);
  const nav = useNavigate();
  const role = (() => { try { return JSON.parse(localStorage.getItem('user') ?? '{}').role ?? ''; } catch { return ''; } })();
  const cfg = getRoleConfig(role);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); setQ(''); setSel(0); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  React.useEffect(() => {
    if (open && role) fetchHorizon(role).then(h => setCases(h.lanes.flatMap(l => l.cases))).catch(() => {});
  }, [open, role]);

  if (!open || !cfg) return null;
  const ql = q.toLowerCase();
  const hits: Hit[] = [
    ...cfg.domains.flatMap(d => d.features
      .filter(f => f.label.toLowerCase().includes(ql))
      .map(f => ({ type: 'function' as const, label: f.label, sub: d.label,
        go: () => nav(`${cfg.workstationPath}?tab=${f.key}`) }))),
    ...cases
      .filter(c => `${c.ref} ${c.title} ${c.counterparty ?? ''}`.toLowerCase().includes(ql))
      .map(c => ({ type: 'case' as const, label: `${c.ref} — ${c.title}`,
        sub: c.status.replace(/_/g, ' '), go: () => nav(`/thread/${c.chain}/${c.id}`) })),
  ].slice(0, 12);

  return (
    <div className="mer veil" onClick={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Command palette" onClick={e => e.stopPropagation()}>
        <input autoFocus value={q} placeholder="functions · cases…"
               onChange={e => { setQ(e.target.value); setSel(0); }}
               onKeyDown={e => {
                 if (e.key === 'ArrowDown') setSel(s => Math.min(s + 1, hits.length - 1));
                 if (e.key === 'ArrowUp') setSel(s => Math.max(s - 1, 0));
                 if (e.key === 'Enter' && hits[sel]) { hits[sel].go(); setOpen(false); }
               }} />
        <div className="pal-hits">
          {hits.map((hit, i) => (
            <button key={i} className={`hit ${i === sel ? 'sel' : ''}`}
                    onMouseEnter={() => setSel(i)} onClick={() => { hit.go(); setOpen(false); }}>
              <span className={`type ${hit.type === 'function' ? 'fn' : 'case'}`}>{hit.type.toUpperCase()}</span>
              <b>{hit.label}</b><span className="sub">{hit.sub}</span>
            </button>
          ))}
          {hits.length === 0 && <div className="pal-empty">No matches.</div>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount palette globally + Atlas route in App.tsx**

Palette renders inside the authed layout (next to where FioriShell wraps routes) so ⌘K works on every page including workstations:

```tsx
const AtlasPage = React.lazy(() => import('./meridian/AtlasPage'));
const CommandPalette = React.lazy(() => import('./meridian/CommandPalette'));
<Route path="/atlas" element={<AtlasPage />} />
// + <CommandPalette /> mounted once inside the authenticated shell
```

- [ ] **Step 4: Typecheck + Playwright**

```bash
npm run check:pages
```
Append spec: `⌘K opens palette, typing filters, Enter navigates to workstation tab`.

- [ ] **Step 5: Commit**

```bash
git add -u pages/src tests/browser && git commit -m "feat(meridian): Atlas page + global cmd-K palette"
```

---

## Phase 6 — All 12 roles (registry data + lanes)

### Task 10–15: Per-role registry batches

Pure data work; the Horizon/Thread/Atlas/palette code never changes. One task per batch; each batch = same 4 steps.

| Task | Roles | Waves (chains to register) |
|---|---|---|
| 10 | trader | W2 risk, W9 MM, W29 poslimit (`oe_poslimit_cases` ✓), W36 best-ex, W44 trade reporting, W52 market abuse (`oe_market_abuse_cases`), W60 algo cert (`oe_algo_certifications`), W68 counterparty margin (`oe_counterparty_margin`), W76 allocations (`oe_trade_allocations` ✓) |
| 11 | ipp_developer | W1 PM, W10 bonds, W19 procurement, W20 COD, W23 insurance, W27 ED, W28 GCA, W75 energization (`oe_connection_energization`) + counterparty lanes on W21/30/45/53/61/69 (lender chains), W18 outage, W67 grid-code (facility side) |
| 12 | offtaker + carbon_fund | Offtaker: W7, W22 PPA, W32 take-or-pay, W39 indexation, W46 curtailment, W54 payment security (`oe_ppa_payment_securities`), W62 termination (`oe_ppa_terminations`), W70 REC (`oe_rec_lifecycle`). Carbon: W4, W11 MRV, W17 retirement, W37 PDD, W42 reversal, W48 offset claim (`oe_carbon_offset_claims`), W56 renewal (`oe_crediting_period_renewals`), W65 ERPA (`oe_carbon_erpas`), W73 PoA (`oe_poa_cpa_inclusion`) |
| 13 | grid_operator + regulator | Grid: W8 wheeling, W13 nominations, W18 outage, W28 GCA (operator side), W34 curtailment, W50 reserves (`oe_reserve_activations`), W58 capacity (`oe_grid_capacity_allocations`), W67 grid-code, W75 energization (operator side). Regulator: W5, W31 disposition, W33 renewal, W40 inspection, W43 MYPD, W49 application (`oe_licence_applications`), W57 SSEG (`oe_sseg_registrations`), W66 complaints (`oe_regulator_complaints`), W74 levies (`oe_regulator_levies` ✓) |
| 14 | support + esums_owner/esco | Support: W14 tickets, W15 RMA, W16 WO, W41 problem, W47 RFC, W55 patching (`oe_security_remediations`), W63 warranty recovery (`oe_warranty_recoveries`), W72 spares (`oe_spare_parts_provisioning`). Esums/ESCO: W12 commissioning, W24 PR, W25 HSE, W35 vendor, W51 availability (`oe_availability_guarantees` ✓), W59 PM (`oe_pm_compliance`), W64 PTW (`oe_permit_to_work`), W71 prognostics (`oe_asset_prognostics`) |
| 15 | admin + epc_contractor + cross-checks | Admin: oversight lanes (all-breached view = `chainsForRole('admin')` may stay empty; admin uses `/api/horizon/:role` of any role — already allowed). EPC: submittal/ITP/NCR features if chain tables exist (check `roleData.ts` epc_contractor chainKeys against migrations; register only those with `chain_status` + `sla_deadline_at`). |

Per batch, the 4 steps:

- [ ] **Step 1: Verify tables/columns** — for every wave in the batch:

```bash
grep -rn "CREATE TABLE IF NOT EXISTS oe_" migrations/ | grep -iE "<keywords for batch>"
sed -n '/CREATE TABLE IF NOT EXISTS <table>/,/);/p' migrations/<file>.sql
```
Record refCol/titleCol/quantumCol/counterpartyCol; read the chain route file for terminal statuses + top-2 action hints (action path + role guard + one-sentence cascadeHint derived from the route's fireCascade calls).

- [ ] **Step 2: Add entries** — lanes use the role's `roleData.ts` domain keys; two-party chains (W18, W21, W28, W67, W70, W75…) get BOTH roles' lanes (this is what makes Thread two-sided).

- [ ] **Step 3: Run registry consistency test** (`npx vitest run src/utils/chain-registry-meridian.test.ts`) — the migrations-DDL test catches any guessed column. Then `npm run check`.

- [ ] **Step 4: Eyeball + commit**

```bash
# login as the batch's persona(s), open /horizon, confirm lanes render
git add -u && git commit -m "feat(meridian): <roles> chain registry entries"
```

Skip rules: a wave whose table lacks `sla_deadline_at` or whose data model isn't a case list (e.g. W2 VaR snapshots) is NOT registered — it stays a workstation tab reachable via Atlas. Log skips in the commit body.

---

## Phase 7 — Cutover

### Task 16: Post-login → Horizon

**Files:**
- Modify: `open-energy-platform/pages/src/App.tsx` (LaunchRedirect, ~lines 536–575)

- [ ] **Step 1: Change completed-onboarding destination from `/feed` to `/horizon`**

Keep `/onboard` gate intact. `/feed` stays routable (Atlas can link it).

- [ ] **Step 2: Add legacy redirects** — `/launch/:role` → `/horizon` (launchpad demoted; SubCockpitPage targets become Atlas links). Workstations stay routable (Atlas + duty-stream deep links).

- [ ] **Step 3: Update FioriShell suppress-list** to include all Meridian paths (done Task 5; re-verify).

- [ ] **Step 4: Full verification**

```bash
npm test                      # backend vitest, all green
npm run check && npm run check:pages
BASE=http://localhost:8787 npx playwright test tests/browser/meridian.spec.ts
BASE=http://localhost:8787 npm run test:browser   # existing suite still green
```

- [ ] **Step 5: Manual journey per role (local)** — login each persona once (token cache! `login_or_cached` full emails), confirm: `/horizon` renders lanes; tile → Thread; action POST fires + cascade hint shown; ⌘K → function → workstation tab still works.

- [ ] **Step 6: Commit**

```bash
git add -u && git commit -m "feat(meridian): cutover — post-login lands on Horizon, launchpad demoted"
```

### Task 17: Ship decision

- [ ] Present finished branch to user. NO push/deploy without explicit authorization. Reminder for deploy day: CF edge caches SPA shell — `Cache-Control: no-store` on `/*` already required per prior incident; verify `_headers`/asset config before deploy, then curl prod `/api/horizon/lender` after first deploy (Hono mount-collision lesson: CI green ≠ wire-up).

---

## Deliberately out of scope (YAGNI, v2 candidates)

- Wire ticker (live cascade feed on Horizon) — needs an events firehose endpoint; reuse IncomingPanel's source later.
- Thread evidence chips / per-state document attachments — needs `eventsTable` population per chain (registry fields already exist).
- AI why-cards in Thread — wire `buildTraderAiSuggestions`-style helpers per chain later; actbar `cascadeHint` covers Law 3 v1.
- Deleting workstations/tabs — never; they demote to Atlas (MERIDIAN_REDESIGN.md §7.5).
- Quantum-weighted tile sizing animation, drag, board filters.

## Risk register

| Risk | Mitigation |
|---|---|
| Guessed column names break SELECTs | migrations-DDL consistency test (Task 2 Step 2) fails CI before runtime |
| 76-table batch query slow | per-role chain count is 8–14; `DB.batch` = one round trip; LIMIT 60/table; measured in Task 3 Step 6 |
| Role-suffix mismatches (grid vs grid_operator) | lanes keys MUST be suffixed JWT forms; cross-role Playwright check in Task 8 |
| Tenancy leak via direct table reads | Task 3 Step 3 mandates copying the tenant predicate from an existing chain GET |
| Action `path` drift vs real routes | actions taken from route files during registry population, not invented; duty-stream POST failures surface in UI error state |
