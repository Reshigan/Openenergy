# Offtaker Procurement → LOI → Cross-Role Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the offtaker procurement journey in the frontend (bill → right-sizing → options → LOI/inquiry) and make `fireCascade` drive the offtaker→IPP / offtaker→seller relationship via Layer-C role actions.

**Architecture:** Purely additive. A new util computes per-option cost-benefit; a new `GET /api/offtaker/options` route serves it; a new cascade-rule module pushes a Layer-C action to the IPP when the already-fired `contract.created`+`loi_drafts` event runs (and to the seller on `marketplace.inquired`); the existing `BillUploadTab` gets an Options section, per-option Draft-LOI/Send-inquiry buttons, and a real "Draft LOIs from this mix" button replacing a dead card. Zero migrations, zero edits to any chain/spec/cascade-signature/frozen file. The cross-role inbox already exists (`IncomingPanel` auto-mounted by `WorkstationShell` on both offtaker and IPP workstations).

**Tech Stack:** TypeScript, Hono, Cloudflare D1 (SQLite), Workers KV, React + axios SPA, vitest (backend), better-sqlite3 in-memory test harness.

**All commands run from `open-energy-platform/`.**

---

## File Structure

- **Create** `src/utils/offtaker-options.ts` — pure-ish util: query upcoming projects + active listings, score each against the bill profile. One responsibility: option cost-benefit.
- **Create** `tests/offtaker-options.test.ts` — unit tests for the scoring math + bucketing.
- **Create** `src/cascade-rules/offtaker-procurement.ts` — two `CascadeRule`s (LOI→IPP, inquiry→seller) + `registerOfftakerProcurementRules()` + test accessor.
- **Create** `tests/offtaker-procurement-rules.test.ts` — registry-dispatch tests for both rules.
- **Modify** `src/routes/offtaker.ts` — add `GET /options` handler + one import.
- **Modify** `src/cascade-rules/index.ts` — register the new rule module (3 edits).
- **Modify** `pages/src/components/pages/OfftakerWorkstationPage.tsx` — types, state, loaders, handlers, replace dead card, add Options section + `OptionGroup` helper.

---

## Task 1: `offtaker-options.ts` cost-benefit util

**Files:**
- Create: `src/utils/offtaker-options.ts`
- Test: `tests/offtaker-options.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/offtaker-options.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { buildOfftakerOptions } from '../src/utils/offtaker-options';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  // Isolate the whole-table queries. Migration 082 is a demo migration whose
  // filename lacks `_seed`, so the harness APPLIES it and it seeds ipp_projects
  // rows. buildOfftakerOptions queries the entire table, so each test must own
  // its fixtures — clear both tables first.
  db.prepare('DELETE FROM ipp_projects').run();
  db.prepare('DELETE FROM marketplace_listings').run();
});
afterEach(() => { db.close(); });

function seedParticipant(id: string, role: string) {
  db.prepare(
    `INSERT INTO participants (id, email, password_hash, name, role, status)
     VALUES (?, ?, 'x', ?, ?, 'active')`,
  ).run(id, `${id}@t.co`, id, role);
}

describe('buildOfftakerOptions', () => {
  it('scores an upcoming project cheaper than tariff as a positive saving', async () => {
    seedParticipant('dev1', 'ipp_developer');
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_price_per_mwh)
       VALUES ('p1','Karoo Solar','dev1','build_own_operate','solar',100,'NC','construction',5000,1200)`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 });
    expect(opts.upcoming_projects).toHaveLength(1);
    const o = opts.upcoming_projects[0];
    expect(o.kind).toBe('project');
    expect(o.target_participant_id).toBe('dev1');
    expect(o.availability).toBe('upcoming');
    expect(o.cod_estimate).toBe('construction');
    // demand 10000 MWh, offered 5000 → covered 5000
    expect(o.annual_mwh).toBe(5000);
    // current = 5000*1000*2.0 = 10,000,000 ; option = 5000*1200 = 6,000,000 ; saving 4,000,000 → 40%
    expect(o.est_saving_zar).toBe(4_000_000);
    expect(o.est_saving_pct).toBe(40);
    expect(o.co2_avoided_tco2e).toBe(Math.round(5000 * 0.95));
  });

  it('caps covered MWh at the offtaker demand and marks commercial_operations as now', async () => {
    seedParticipant('dev2', 'ipp_developer');
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_price_per_mwh)
       VALUES ('p2','Big Wind','dev2','build_own_operate','wind',300,'EC','commercial_operations',50000,900)`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 2_000_000, avg_tariff_zar_per_kwh: 2.0 });
    const o = opts.upcoming_projects[0];
    expect(o.availability).toBe('now');
    expect(o.cod_estimate).toBeNull();
    expect(o.annual_mwh).toBe(2000); // capped at demand 2000 MWh, not 50000
  });

  it('buckets active energy listings under available_now', async () => {
    seedParticipant('sell1', 'trader');
    db.prepare(
      `INSERT INTO marketplace_listings (id, seller_id, listing_type, title, price, price_unit, volume_available, status)
       VALUES ('l1','sell1','energy','Spot energy block',1500,'ZAR/MWh',3000,'active')`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 });
    expect(opts.available_now).toHaveLength(1);
    const o = opts.available_now[0];
    expect(o.kind).toBe('listing');
    expect(o.target_participant_id).toBe('sell1');
    expect(o.availability).toBe('now');
  });

  it('excludes non-energy listings and non-active listings', async () => {
    seedParticipant('sell2', 'trader');
    db.prepare(
      `INSERT INTO marketplace_listings (id, seller_id, listing_type, title, price, volume_available, status)
       VALUES ('l2','sell2','equipment','Used inverter',1500,10,'active')`,
    ).run();
    db.prepare(
      `INSERT INTO marketplace_listings (id, seller_id, listing_type, title, price, volume_available, status)
       VALUES ('l3','sell2','energy','Withdrawn block',1500,10,'withdrawn')`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 10_000_000, avg_tariff_zar_per_kwh: 2.0 });
    expect(opts.available_now).toHaveLength(0);
  });

  it('guards divide-by-zero when tariff is zero', async () => {
    seedParticipant('dev3', 'ipp_developer');
    db.prepare(
      `INSERT INTO ipp_projects (id, project_name, developer_id, structure_type, technology, capacity_mw, location, status, ppa_volume_mwh, ppa_price_per_mwh)
       VALUES ('p3','Zero Tariff','dev3','build_own_operate','solar',10,'GP','development',1000,1200)`,
    ).run();
    const opts = await buildOfftakerOptions(env, 'off1', { annual_kwh: 1_000_000, avg_tariff_zar_per_kwh: 0 });
    expect(opts.upcoming_projects[0].est_saving_pct).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/offtaker-options.test.ts`
Expected: FAIL — `Failed to resolve import "../src/utils/offtaker-options"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/utils/offtaker-options.ts`:

```ts
// Builds the offtaker "procurement options" view: marketplace listings available
// now + upcoming IPP projects, each scored for cost-benefit against the bill
// profile. Additive util consumed by GET /api/offtaker/options. No writes.
import type { HonoBindings } from './types';

// SA grid emission factor (tCO₂e per MWh). Mirrors the inline 0.95 used by
// buildDeterministicMix in offtaker-heuristics.ts (Eskom grid intensity).
const SA_GRID_EF = 0.95;
// Fallback blended PPA price when a project/listing has no price, matching the
// 1850 fallback used by buildDeterministicMix in offtaker-heuristics.ts.
const FALLBACK_PRICE_ZAR_PER_MWH = 1850;

export interface OfftakerOption {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  annual_mwh: number;
  blended_price_zar_per_mwh: number;
  est_annual_cost_zar: number;
  est_saving_zar: number;
  est_saving_pct: number;
  co2_avoided_tco2e: number;
  rationale: string;
}

export interface OfftakerOptions {
  available_now: OfftakerOption[];
  upcoming_projects: OfftakerOption[];
}

export interface BillProfileInput {
  annual_kwh: number;
  avg_tariff_zar_per_kwh: number;
}

interface OptionBase {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  offered_annual_mwh: number;
  blended_price: number;
}

function scoreOption(base: OptionBase, bill: BillProfileInput): OfftakerOption {
  const demandMwh = bill.annual_kwh / 1000;
  const coveredMwh = Math.min(base.offered_annual_mwh, demandMwh);
  const estAnnualCost = coveredMwh * base.blended_price;
  const currentCostForCovered = coveredMwh * 1000 * bill.avg_tariff_zar_per_kwh;
  const estSaving = currentCostForCovered - estAnnualCost;
  const estSavingPct = currentCostForCovered > 0 ? (estSaving / currentCostForCovered) * 100 : 0;
  const co2 = coveredMwh * SA_GRID_EF;
  const when = base.availability === 'now' ? 'Available now' : (base.cod_estimate ?? 'upcoming');
  return {
    option_id: base.option_id,
    kind: base.kind,
    title: base.title,
    target_participant_id: base.target_participant_id,
    availability: base.availability,
    cod_estimate: base.cod_estimate,
    annual_mwh: Math.round(coveredMwh),
    blended_price_zar_per_mwh: Math.round(base.blended_price),
    est_annual_cost_zar: Math.round(estAnnualCost),
    est_saving_zar: Math.round(estSaving),
    est_saving_pct: Math.round(estSavingPct * 10) / 10,
    co2_avoided_tco2e: Math.round(co2),
    rationale: `${when} · covers ${Math.round(coveredMwh).toLocaleString()} MWh/yr at R${Math.round(base.blended_price).toLocaleString()}/MWh vs R${bill.avg_tariff_zar_per_kwh}/kWh`,
  };
}

export async function buildOfftakerOptions(
  env: HonoBindings,
  _offtakerId: string,
  bill: BillProfileInput,
): Promise<OfftakerOptions> {
  const demandMwh = bill.annual_kwh / 1000;

  const projectsRes = await env.DB.prepare(
    `SELECT id, project_name, status, ppa_price_per_mwh, ppa_volume_mwh, developer_id
       FROM ipp_projects
      WHERE status IN ('development','construction','commissioning','commercial_operations')
        AND developer_id IS NOT NULL
      ORDER BY CASE status
        WHEN 'commercial_operations' THEN 1
        WHEN 'commissioning' THEN 2
        WHEN 'construction' THEN 3
        WHEN 'development' THEN 4
        ELSE 5 END
      LIMIT 20`,
  ).all();

  const listingsRes = await env.DB.prepare(
    `SELECT id, title, seller_id, price, volume_available
       FROM marketplace_listings
      WHERE status = 'active'
        AND listing_type IN ('energy','capacity')
        AND seller_id IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20`,
  ).all();

  const upcoming_projects: OfftakerOption[] = [];
  for (const row of (projectsRes.results ?? []) as Array<Record<string, unknown>>) {
    const status = String(row.status ?? '');
    const offered = Number(row.ppa_volume_mwh ?? 0) || demandMwh;
    const price = Number(row.ppa_price_per_mwh ?? 0) || FALLBACK_PRICE_ZAR_PER_MWH;
    upcoming_projects.push(scoreOption({
      option_id: String(row.id),
      kind: 'project',
      title: String(row.project_name ?? 'Unnamed project'),
      target_participant_id: String(row.developer_id),
      availability: status === 'commercial_operations' ? 'now' : 'upcoming',
      cod_estimate: status === 'commercial_operations' ? null : status,
      offered_annual_mwh: offered,
      blended_price: price,
    }, bill));
  }

  const available_now: OfftakerOption[] = [];
  for (const row of (listingsRes.results ?? []) as Array<Record<string, unknown>>) {
    const offered = Number(row.volume_available ?? 0) || demandMwh;
    const price = Number(row.price ?? 0) || FALLBACK_PRICE_ZAR_PER_MWH;
    available_now.push(scoreOption({
      option_id: String(row.id),
      kind: 'listing',
      title: String(row.title ?? 'Marketplace listing'),
      target_participant_id: String(row.seller_id),
      availability: 'now',
      cod_estimate: null,
      offered_annual_mwh: offered,
      blended_price: price,
    }, bill));
  }

  return { available_now, upcoming_projects };
}
```

Note on the `HonoBindings` import: it is the same type `pushRoleAction` accepts (`src/utils/role-actions.ts`). It is expected at `./types`. If `npm run check` reports it is not exported there, run `grep -rn "export.*HonoBindings" src/` to find the correct module and fix the import path — do not change the type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/offtaker-options.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/offtaker-options.ts tests/offtaker-options.test.ts
git commit -m "$(cat <<'EOF'
feat(offtaker): cost-benefit util for procurement options

buildOfftakerOptions scores active energy listings (available now) + upcoming
IPP projects against the bill profile (saving, %, CO2 avoided), capped at demand.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `GET /api/offtaker/options` route

**Files:**
- Modify: `src/routes/offtaker.ts` (add import after line 17; add handler before `export default offtaker;` at line 193)

- [ ] **Step 1: Add the import**

In `src/routes/offtaker.ts`, the import block ends at:

```ts
import { fireCascade } from '../utils/cascade';
```

Add immediately after it:

```ts
import { buildOfftakerOptions } from '../utils/offtaker-options';
```

- [ ] **Step 2: Add the handler**

In `src/routes/offtaker.ts`, immediately before the final line `export default offtaker;`, insert:

```ts
// ─── GET /offtaker/options ──────────────────────────────────────────────────
// Procurement options for the calling offtaker: marketplace listings available
// now + upcoming IPP projects, each scored vs the bill profile. Reads the named
// bill (?bill_id=) or the latest one; falls back to demo defaults so the view is
// never blank. Mirrors the bill-profile read in POST /api/ai/offtaker/optimize.
offtaker.get('/options', async (c) => {
  const user = getCurrentUser(c);
  const billId = c.req.query('bill_id');

  let profile: Record<string, unknown> | undefined;
  try {
    if (billId) {
      const row = await c.env.DB.prepare(
        `SELECT ai_result_json FROM offtaker_bills WHERE id = ? AND offtaker_id = ?`,
      ).bind(billId, user.id).first<{ ai_result_json: string }>();
      if (row?.ai_result_json) { try { profile = JSON.parse(row.ai_result_json); } catch { /* ignore */ } }
    }
    if (!profile) {
      const row = await c.env.DB.prepare(
        `SELECT ai_result_json FROM offtaker_bills WHERE offtaker_id = ? ORDER BY created_at DESC LIMIT 1`,
      ).bind(user.id).first<{ ai_result_json: string }>();
      if (row?.ai_result_json) { try { profile = JSON.parse(row.ai_result_json); } catch { /* ignore */ } }
    }
  } catch { /* offtaker_bills may not exist until a first upload — fall to defaults */ }

  const annual_kwh = Number(profile?.annual_kwh ?? 1_200_000);
  const avg_tariff_zar_per_kwh = Number(profile?.avg_tariff_zar_per_kwh ?? 2.15);

  const options = await buildOfftakerOptions(c.env, user.id, { annual_kwh, avg_tariff_zar_per_kwh });
  return c.json({ success: true, data: options });
});

```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/offtaker.ts
git commit -m "$(cat <<'EOF'
feat(offtaker): GET /api/offtaker/options route

Serves buildOfftakerOptions for the calling offtaker, resolving the bill profile
from offtaker_bills (named or latest) with demo-default fallback.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `offtaker-procurement.ts` cascade rules

**Files:**
- Create: `src/cascade-rules/offtaker-procurement.ts`
- Create: `tests/offtaker-procurement-rules.test.ts`
- Modify: `src/cascade-rules/index.ts` (3 edits)

- [ ] **Step 1: Write the failing test**

Create `tests/offtaker-procurement-rules.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import { registerOfftakerProcurementRules } from '../src/cascade-rules/offtaker-procurement';
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

let db: Database.Database;
let env: any;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerOfftakerProcurementRules();
});
afterEach(() => { db.close(); });

function ctx(event: string, entity_type: string, entity_id: string, data: Record<string, unknown>): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}

describe('offtaker-procurement cascade rules', () => {
  it('contract.created on loi_drafts pushes a Review LOI action to the IPP', async () => {
    await runCascadeRegistry(ctx('contract.created', 'loi_drafts', 'loi_1', {
      contract_type: 'LOI', counterparty_id: 'dev1', project_id: 'p1',
      project_name: 'Karoo Solar', annual_mwh: 5000, blended_price: 1200,
    }));
    const row = db.prepare(
      `SELECT target_role, target_participant_id, title, cross_option_json, priority, source_chain_key
         FROM oe_role_action_queue WHERE source_entity_id = 'loi_1'`,
    ).get() as any;
    expect(row.target_role).toBe('ipp_developer');
    expect(row.target_participant_id).toBe('dev1');
    expect(row.title).toContain('Karoo Solar');
    expect(row.priority).toBe('high');
    expect(row.source_chain_key).toBe('offtaker_procurement');
    expect(JSON.parse(row.cross_option_json).target_route).toBe('/lois/loi_1');
    // the rule ran cleanly (not swallowed into an audit 'error')
    const audit = db.prepare(
      `SELECT outcome FROM oe_cascade_rule_audit WHERE rule_id = 'offtaker_procurement.loi_to_ipp' ORDER BY created_at DESC LIMIT 1`,
    ).get() as any;
    expect(audit?.outcome).toBe('ran');
  });

  it('does not push for contract.created on a non-LOI entity', async () => {
    await runCascadeRegistry(ctx('contract.created', 'contract_documents', 'cd_1', { counterparty_id: 'dev1' }));
    const row = db.prepare(`SELECT id FROM oe_role_action_queue`).get();
    expect(row).toBeUndefined();
  });

  it('does not push when counterparty_id is missing', async () => {
    await runCascadeRegistry(ctx('contract.created', 'loi_drafts', 'loi_x', { project_name: 'X' }));
    const row = db.prepare(`SELECT id FROM oe_role_action_queue`).get();
    expect(row).toBeUndefined();
  });

  it('is idempotent — running the same LOI event twice produces one IPP action', async () => {
    const c = ctx('contract.created', 'loi_drafts', 'loi_2', { counterparty_id: 'dev1', project_name: 'X' });
    await runCascadeRegistry(c);
    await runCascadeRegistry(c);
    const n = db.prepare(`SELECT COUNT(*) AS n FROM oe_role_action_queue WHERE source_entity_id = 'loi_2'`).get() as any;
    expect(n.n).toBe(1);
  });

  it('marketplace.inquired pushes to the seller using the seller resolved role', async () => {
    db.prepare(
      `INSERT INTO participants (id, email, password_hash, name, role, status)
       VALUES ('sell1','s@t.co','x','Seller','offtaker','active')`,
    ).run();
    await runCascadeRegistry(ctx('marketplace.inquired', 'marketplace_inquiries', 'mi_1', {
      listing_id: 'l1', seller_id: 'sell1',
    }));
    const row = db.prepare(
      `SELECT target_role, target_participant_id, cross_option_json FROM oe_role_action_queue WHERE source_entity_id = 'mi_1'`,
    ).get() as any;
    expect(row.target_role).toBe('offtaker');
    expect(row.target_participant_id).toBe('sell1');
    expect(JSON.parse(row.cross_option_json).target_route).toBe('/marketplace?listing=l1');
  });

  it('marketplace.inquired falls back to ipp_developer when the seller role is unknown', async () => {
    await runCascadeRegistry(ctx('marketplace.inquired', 'marketplace_inquiries', 'mi_2', {
      listing_id: 'l2', seller_id: 'ghost',
    }));
    const row = db.prepare(
      `SELECT target_role FROM oe_role_action_queue WHERE source_entity_id = 'mi_2'`,
    ).get() as any;
    expect(row.target_role).toBe('ipp_developer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/offtaker-procurement-rules.test.ts`
Expected: FAIL — `Failed to resolve import "../src/cascade-rules/offtaker-procurement"`.

- [ ] **Step 3: Write the rule module**

Create `src/cascade-rules/offtaker-procurement.ts`:

```ts
// Layer C — the cascade drives the offtaker's cross-party relationships.
//  • When an offtaker drafts an LOI (contract.created on loi_drafts) the matched
//    IPP gets a "Review LOI" action in its workstation inbox.
//  • When an offtaker inquires on a marketplace listing the seller gets a
//    "View inquiry" action.
// Purely additive: both events are already fired today (ai.ts /offtaker/loi and
// marketplace.ts /inquire). This module only adds Layer-C pushes alongside the
// existing legacy action_queue / notifications rows — no event-type changes.
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule, type CascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

async function alreadyPushed(
  ctx: CascadeContext, sourceEntityId: string, targetRole: string,
): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? AND target_role = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event, targetRole).first();
  return !!r;
}

const RULES: CascadeRule[] = [
  // Offtaker drafted an LOI → prompt the IPP to review it.
  {
    id: 'offtaker_procurement.loi_to_ipp',
    mode: 'drive',
    match: (ctx: CascadeContext) =>
      ctx.event === 'contract.created' && ctx.entity_type === 'loi_drafts',
    run: async (ctx: CascadeContext) => {
      const ipp = dstr(ctx, 'counterparty_id');
      if (!ipp) return;
      if (await alreadyPushed(ctx, ctx.entity_id, 'ipp_developer')) return;
      const name = dstr(ctx, 'project_name') ?? 'a project';
      await pushRoleAction(ctx.env, {
        target_role: 'ipp_developer',
        target_participant_id: ipp,
        source_event: ctx.event,
        source_chain_key: 'offtaker_procurement',
        source_entity_type: 'loi_drafts',
        source_entity_id: ctx.entity_id,
        title: `New Letter of Intent for ${name}`,
        body: {
          project_id: dstr(ctx, 'project_id'),
          annual_mwh: dnum(ctx, 'annual_mwh'),
          blended_price: dnum(ctx, 'blended_price'),
        },
        cross_option: {
          action_label: 'Review LOI',
          target_route: `/lois/${ctx.entity_id}`,
        },
        priority: 'high',
      });
    },
  },
  // Offtaker inquired on a marketplace listing → notify the seller.
  {
    id: 'offtaker_procurement.inquiry_to_seller',
    mode: 'drive',
    match: (ctx: CascadeContext) => ctx.event === 'marketplace.inquired',
    run: async (ctx: CascadeContext) => {
      const seller = dstr(ctx, 'seller_id');
      if (!seller) return;
      const row = await ctx.env.DB.prepare(
        `SELECT role FROM participants WHERE id = ?`,
      ).bind(seller).first<{ role: string }>();
      const role = row?.role ?? 'ipp_developer';
      if (await alreadyPushed(ctx, ctx.entity_id, role)) return;
      const listingId = dstr(ctx, 'listing_id');
      await pushRoleAction(ctx.env, {
        target_role: role,
        target_participant_id: seller,
        source_event: ctx.event,
        source_chain_key: 'offtaker_procurement',
        source_entity_type: 'marketplace_inquiries',
        source_entity_id: ctx.entity_id,
        title: 'New marketplace inquiry',
        body: { listing_id: listingId },
        cross_option: {
          action_label: 'View inquiry',
          target_route: listingId ? `/marketplace?listing=${listingId}` : '/marketplace',
        },
        priority: 'normal',
      });
    },
  },
];

export function registerOfftakerProcurementRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __offtakerProcurementRulesForTest(): ReadonlyArray<CascadeRule> {
  return RULES;
}
```

- [ ] **Step 4: Register the module in the barrel**

In `src/cascade-rules/index.ts`, make three edits.

(a) After the line:
```ts
import { registerRegulatorInboxRules } from './regulator-inbox';
```
add:
```ts
import { registerOfftakerProcurementRules } from './offtaker-procurement';
```

(b) After the line:
```ts
registerRegulatorInboxRules();
```
add:
```ts
registerOfftakerProcurementRules();
```

(c) In the final `export { ... };` line, add `registerOfftakerProcurementRules` to the list (e.g. immediately before the closing `};`):
```ts
export { registerTradingSafetyRules, registerLifecycleSequencingRules, registerTradeSettlementRules, registerContractLifecycleRules, registerIppLifecycleRules, registerOnaOperationsRules, registerEsgEventRules, registerRegulatorActionRules, registerGridDispatchRules, registerTraderMarginRules, registerLenderCovenantRules, registerCarbonEventRules, registerRegulatorInboxRules, registerOfftakerProcurementRules };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/offtaker-procurement-rules.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/cascade-rules/offtaker-procurement.ts tests/offtaker-procurement-rules.test.ts src/cascade-rules/index.ts
git commit -m "$(cat <<'EOF'
feat(ecosystem): Layer-C rules drive offtaker→IPP / offtaker→seller

contract.created+loi_drafts → pushRoleAction(ipp_developer, /lois/:id);
marketplace.inquired → pushRoleAction(seller resolved role, /marketplace).
Idempotent via alreadyPushed; additive alongside existing legacy queues.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Surface options + LOI/inquiry actions in `BillUploadTab`

**Files:**
- Modify: `pages/src/components/pages/OfftakerWorkstationPage.tsx`

This file has **no unit-test runner**; verification is `npm run check:pages` + `cd pages && npm run build`.

- [ ] **Step 1: Add the option types**

In `pages/src/components/pages/OfftakerWorkstationPage.tsx`, find the `MixResult` type:

```tsx
type MixResult = {
  mix: MixItem[];
  savings_pct?: number;
  carbon_tco2e?: number;
  warnings?: string[];
};
```

Immediately after it, add:

```tsx
type OfftakerOption = {
  option_id: string;
  kind: 'project' | 'listing';
  title: string;
  target_participant_id: string;
  availability: 'now' | 'upcoming';
  cod_estimate: string | null;
  annual_mwh: number;
  blended_price_zar_per_mwh: number;
  est_annual_cost_zar: number;
  est_saving_zar: number;
  est_saving_pct: number;
  co2_avoided_tco2e: number;
  rationale: string;
};

type OfftakerOptions = {
  available_now: OfftakerOption[];
  upcoming_projects: OfftakerOption[];
};
```

- [ ] **Step 2: Add the `OptionGroup` helper component**

In the same file, immediately before the `MixResult` type declaration (i.e. at module scope, alongside the other helper components like `Card`), add:

```tsx
function OptionGroup({
  title, options, actionLabel, onAct, busyId,
}: {
  title: string;
  options: OfftakerOption[];
  actionLabel: string;
  onAct: (opt: OfftakerOption) => void;
  busyId: string | null;
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-[#6b7685] mb-2">{title}</div>
      <div className="rounded-xl border border-[#dde4ec] bg-white overflow-x-auto text-[#0f1c2e]">
        <table className="w-full text-[12px]">
          <thead className="bg-[#f4f6f8] text-[#6b7685]">
            <tr>
              <th className="text-left p-2">Option</th>
              <th className="text-right p-2">MWh / yr</th>
              <th className="text-right p-2">R/MWh</th>
              <th className="text-right p-2">Est. saving / yr</th>
              <th className="text-right p-2">CO₂ avoided</th>
              <th className="text-left p-2">When</th>
              <th className="text-right p-2" aria-label="action" />
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <tr key={o.option_id} className="border-t border-[#eef1f5]">
                <td className="p-2 font-semibold">{o.title}</td>
                <td className="p-2 text-right">{o.annual_mwh.toLocaleString()}</td>
                <td className="p-2 text-right">R {o.blended_price_zar_per_mwh.toLocaleString()}</td>
                <td className="p-2 text-right">R {o.est_saving_zar.toLocaleString()} ({o.est_saving_pct}%)</td>
                <td className="p-2 text-right">{o.co2_avoided_tco2e.toLocaleString()} t</td>
                <td className="p-2">{o.availability === 'now' ? 'Now' : (o.cod_estimate || 'Upcoming')}</td>
                <td className="p-2 text-right">
                  <button
                    onClick={() => onAct(o)}
                    disabled={busyId !== null}
                    className="h-8 px-3 rounded-md bg-[#1a3a5c] text-white text-[11px] font-semibold disabled:opacity-60"
                  >
                    {busyId === o.option_id ? '…' : actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add state to `BillUploadTab`**

In `BillUploadTab`, find the existing state block ending with:

```tsx
  const [err, setErr] = useState<string | null>(null);
```

Immediately after it, add:

```tsx
  const [options, setOptions] = useState<OfftakerOptions | null>(null);
  const [loiBusy, setLoiBusy] = useState<string | null>(null); // option_id, or '__mix__' for the whole-mix draft
  const [loiMsg, setLoiMsg] = useState<string | null>(null);
```

- [ ] **Step 4: Add the `loadOptions` loader and the action handlers**

In `BillUploadTab`, find the `optimize` function:

```tsx
  const optimize = async () => {
    if (!latest) return;
    setOptimizing(true);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/optimize', {
        bill_id: latest.id,
        horizon_years: 15,
      });
      const structured = (r.data?.data?.structured || {}) as MixResult;
      setMix(structured);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'optimize failed');
    } finally {
      setOptimizing(false);
    }
  };
```

Replace it with (adds the options fetch after the mix is set, plus the three handlers):

```tsx
  const loadOptions = useCallback(async (billId: string) => {
    try {
      const r = await api.get('/offtaker/options', { params: { bill_id: billId } });
      setOptions((r.data?.data || { available_now: [], upcoming_projects: [] }) as OfftakerOptions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to load options');
    }
  }, []);

  const optimize = async () => {
    if (!latest) return;
    setOptimizing(true);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/optimize', {
        bill_id: latest.id,
        horizon_years: 15,
      });
      const structured = (r.data?.data?.structured || {}) as MixResult;
      setMix(structured);
      await loadOptions(latest.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'optimize failed');
    } finally {
      setOptimizing(false);
    }
  };

  const draftFromMix = async () => {
    if (!mix?.mix?.length) return;
    setLoiBusy('__mix__');
    setLoiMsg(null);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/loi', { mix: mix.mix, horizon_years: 15 });
      const n = ((r.data?.data?.drafts as unknown[]) || []).length;
      setLoiMsg(`${n} Letter${n === 1 ? '' : 's'} of Intent drafted — each developer has been notified. Open “Letters of Intent” to send.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to draft LOIs');
    } finally {
      setLoiBusy(null);
    }
  };

  const draftOne = async (opt: OfftakerOption) => {
    setLoiBusy(opt.option_id);
    setLoiMsg(null);
    setErr(null);
    try {
      const r = await api.post('/ai/offtaker/loi', {
        mix: [{ project_id: opt.option_id, share_pct: 100, mwh_per_year: opt.annual_mwh, blended_price: opt.blended_price_zar_per_mwh }],
        horizon_years: 15,
      });
      const n = ((r.data?.data?.drafts as unknown[]) || []).length;
      setLoiMsg(n > 0
        ? `LOI drafted for ${opt.title} — the developer has been notified.`
        : `No LOI drafted for ${opt.title} (the developer may be in another tenant).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to draft LOI');
    } finally {
      setLoiBusy(null);
    }
  };

  const inquire = async (opt: OfftakerOption) => {
    setLoiBusy(opt.option_id);
    setLoiMsg(null);
    setErr(null);
    try {
      await api.post(`/marketplace/listings/${opt.option_id}/inquire`, {
        message: `Interested in ${opt.title} — approx ${opt.annual_mwh.toLocaleString()} MWh/yr.`,
      });
      setLoiMsg(`Inquiry sent for ${opt.title} — the seller has been notified.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed to send inquiry');
    } finally {
      setLoiBusy(null);
    }
  };
```

- [ ] **Step 5: Reset options on a new upload**

In `BillUploadTab`, find inside `upload` the line:

```tsx
      setMix(null);
```

Replace it with:

```tsx
      setMix(null);
      setOptions(null);
      setLoiMsg(null);
```

- [ ] **Step 6: Replace the dead "Next step" card with a real button**

In `BillUploadTab`, find this block (the third grid cell, inside the `{mix && mix.mix && mix.mix.length > 0 && (...)}` section):

```tsx
            <div className="rounded-xl border border-[#dde4ec] bg-white p-4">
              <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Next step</div>
              <div className="text-[13px] mt-1 text-[#0f1c2e]">Draft LOI from this mix — routes to each developer's action queue.</div>
            </div>
```

Replace it with:

```tsx
            <div className="rounded-xl border border-[#dde4ec] bg-white p-4 flex flex-col justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#6b7685]">Next step</div>
                <div className="text-[13px] mt-1 text-[#0f1c2e]">Draft an LOI to every developer in this mix. Each one lands in the developer's action queue.</div>
              </div>
              <button
                onClick={draftFromMix}
                disabled={loiBusy !== null}
                className="mt-3 h-9 px-4 rounded-md bg-[#1a3a5c] text-white text-[12px] font-semibold disabled:opacity-60"
              >
                {loiBusy === '__mix__' ? 'Drafting…' : 'Draft LOIs from this mix'}
              </button>
            </div>
```

- [ ] **Step 7: Add the success message under the mix grid**

In `BillUploadTab`, the mix grid closes with `</div>` then the warnings block. Find:

```tsx
          </div>
          {mix.warnings && mix.warnings.length > 0 && (
```

Insert the `loiMsg` line between them so it reads:

```tsx
          </div>
          {loiMsg && <div className="mt-2 text-[12px] text-[#0f7553]">{loiMsg}</div>}
          {mix.warnings && mix.warnings.length > 0 && (
```

- [ ] **Step 8: Add the Options section**

In `BillUploadTab`, find the start of the history block:

```tsx
      {/* History */}
      <div>
        <h3 className="text-[13px] font-semibold text-[#3d4756] mb-2">Recent analyses</h3>
```

Immediately before the `{/* History */}` comment, insert:

```tsx
      {/* Procurement options — available now + upcoming, each scored vs the bill */}
      {options && (options.available_now.length > 0 || options.upcoming_projects.length > 0) && (
        <div className="space-y-4">
          <h3 className="text-[13px] font-semibold text-[#3d4756]">Procurement options matched to this bill</h3>
          {options.available_now.length > 0 && (
            <OptionGroup title="Available now · marketplace" options={options.available_now} actionLabel="Send inquiry" onAct={inquire} busyId={loiBusy} />
          )}
          {options.upcoming_projects.length > 0 && (
            <OptionGroup title="Upcoming projects" options={options.upcoming_projects} actionLabel="Draft LOI" onAct={draftOne} busyId={loiBusy} />
          )}
        </div>
      )}

```

- [ ] **Step 9: Type-check the SPA**

Run: `npm run check:pages`
Expected: no errors. (If it reports `useCallback` is unused/missing, note `useCallback` is already imported at line 1 — `import React, { useCallback, useEffect, useState } from 'react';` — so no import change is needed.)

- [ ] **Step 10: Build the SPA**

Run: `cd pages && npm run build && cd ..`
Expected: build succeeds (Vite emits `dist/`).

- [ ] **Step 11: Commit**

```bash
git add pages/src/components/pages/OfftakerWorkstationPage.tsx
git commit -m "$(cat <<'EOF'
feat(offtaker): surface procurement options + LOI/inquiry actions

BillUploadTab now fetches /offtaker/options after optimize, renders available-now
listings + upcoming projects with cost-benefit, wires per-option Draft-LOI /
Send-inquiry, and replaces the dead "Next step" card with a real "Draft LOIs from
this mix" button. The IPP/seller see the result in their workstation inbox.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Full integration gate

**Files:** none (verification only).

- [ ] **Step 1: Backend type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 2: Full backend test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `tests/offtaker-options.test.ts` (5) and `tests/offtaker-procurement-rules.test.ts` (6). No previously-green test regresses.

- [ ] **Step 3: SPA type-check + build**

Run: `npm run check:pages && cd pages && npm run build && cd ..`
Expected: both succeed.

- [ ] **Step 4: Confirm no frozen files changed**

Run: `git diff --name-only origin/main...HEAD -- 'open-energy-platform/migrations' 'open-energy-platform/src/**/*-chain.ts' 'open-energy-platform/src/**/*-spec.ts' 'open-energy-platform/src/utils/cascade.ts' 'open-energy-platform/wrangler.toml'`
Expected: **empty output** (this slice touches none of them). If anything prints, stop and review.

---

## Notes carried from the spec (do not re-derive)

- **No migration.** `oe_role_action_queue` (476), `ipp_projects`/`marketplace_listings`/`marketplace_inquiries` (002), `participants` (001/012), `offtaker_bills` (created at runtime by `ai.ts` + seed 088) all already exist.
- **No EventType edit.** `contract.created` and `marketplace.inquired` are already fired today, so they are already in the closed `EventType` union.
- **Two surfaces, intentional.** The LOI handler still inserts its legacy `action_queue` `loi_review` row and the inquire handler still inserts a `notifications` row; the new rules add Layer-C `oe_role_action_queue` pushes alongside them. This is additive, not a replacement.
- **Inbox is free.** `WorkstationShell` mounts `IncomingPanel` on both the offtaker and IPP workstations, so the pushed actions appear without new frontend (visible at the `xl` breakpoint and up).

---

## Self-Review

**1. Spec coverage:**
- Bill → right-sizing: already built (optimize); surfaced — Task 4 (existing mix table retained).
- Options (available now + upcoming, cost-benefit): Task 1 (util) + Task 2 (route) + Task 4 Steps 1-2, 8 (render).
- Select project → LOI to IPP: Task 4 Step 4 (`draftOne`) → existing `/ai/offtaker/loi` → Task 3 Rule A push.
- Select listing → inquiry to seller: Task 4 Step 4 (`inquire`) → existing `/inquire` → Task 3 Rule B push.
- Whole-mix LOIs: Task 4 Step 6 (`draftFromMix`).
- Cascade drives the relationship: Task 3 (both rules) + register.
- No migration / no frozen-file edit: Task 5 Step 4 gate.
All spec sections map to a task. No gaps.

**2. Placeholder scan:** No TBD/TODO. Every code step shows full code. The one conditional instruction (HonoBindings import path) carries a concrete grep-and-fix and a fallback, not a placeholder.

**3. Type consistency:** `OfftakerOption`/`OfftakerOptions` field names are identical across the backend util (Task 1), the route response (Task 2 returns the util's object verbatim), and the frontend types (Task 4 Step 1) and their use in `OptionGroup`/handlers (Task 4 Steps 2, 4). `buildOfftakerOptions(env, offtakerId, { annual_kwh, avg_tariff_zar_per_kwh })` signature matches its call site in Task 2. `RoleActionInput` fields used in Task 3 match the verbatim interface. `mix.mix` items `{project_id, share_pct, mwh_per_year, blended_price}` match the `/ai/offtaker/loi` body contract. Consistent.
