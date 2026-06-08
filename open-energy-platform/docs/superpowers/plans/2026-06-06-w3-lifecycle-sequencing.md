# W3 Lifecycle Sequencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Layer-A `mode:'drive'` cascade rules so that five upstream chain transitions automatically sequence their downstream chains (auto-create / auto-advance + cross-role prompt), running as the dedicated `system:cascade` actor, plus the `IncomingPanel` and `WizardShell` frontend that make the lender (and every other role) workstation live-driven and unattended.

**Architecture:** A single new rule file `src/cascade-rules/lifecycle-sequencing.ts` registers five drive rules through the existing `registerCascadeRule()` registry (run inside `fireCascade()`'s `registry` stage, error-isolated, audited to `oe_cascade_rule_audit`). Each rule reads only `ctx.data` (the source chain spreads its full row into `data`) and writes downstream via the existing D1 tables. Cross-role prompts use the existing `pushRoleAction()` helper to write `oe_role_action_queue` rows. On the SPA, a new `roleActions` API client + `IncomingPanel` surface those rows on every workstation, and a `WizardShell` primitive drives the act-on-a-prompt flow. NO existing chain, spec, migration, or cascade case is modified — this is purely additive, exactly like W2's `trading-safety.ts`.

**Tech Stack:** TypeScript, Hono, Cloudflare D1 (SQLite), Workers KV, vitest (backend unit tests against `better-sqlite3` via `tests/helpers/d1-sqlite`), React + react-router + Tailwind (SPA; no unit-test runner — verified by `tsc --noEmit` + build).

---

## Ground-truth facts (verified against source — do not re-derive)

**Event strings (exact `match()` keys):**
- `cod.certify_cod` — fired by `transition(c, id, 'certify_cod', 'cod_certified', ...)` in `src/routes/cod-chain.ts` as `` event: `cod.${eventType}` `` where `eventType` is the **action** arg, not the to-status. (The string is `cod.certify_cod`, NOT `cod.cod_certified`.)
- `covenant_certificate.breach_identified` — `eventTypeFor('flag_breach')` and `eventTypeFor('flag_non_submission')` in `src/routes/covenant-certificate-chain.ts`.
- `reserve_account.breached` — `eventTypeFor('declare_breach')` in `src/routes/reserve-account-chain.ts`.
- `licence_application.licence_issued` — `eventTypeFor('issue_licence')` in `src/routes/licence-application-chain.ts`. (We trigger the levy+renewal auto-create on `issue_licence`, not `grant_licence`, because the issued licence ref and issue timestamp the renewal needs only exist at issuance. `licence_issued` implies the licence was granted, so this honours blueprint interaction #7 "licence granted → levy + renewal".)
- `carbon.mrv_issued` — fired from `app.post('/:id/issue')` in `src/routes/carbon-mrv-chain.ts` with `cascadeData: { project_id, claimed_reductions_tco2e }`.

**Source `ctx.data` payloads (the rule reads these keys):**
- COD (`cod.certify_cod`): `participant_id`, `project_id`, `project_name`, `capacity_mw`, `capacity_tier`, `cod_number`, `to_status`, `from_status`.
- Covenant (`covenant_certificate.breach_identified`): full `oe_covenant_certificates` row spread — incl. `borrower_party_name`, `facility_name`, `facility_tier`, `lender_name`, `breached_covenants`, plus `chain_status`, `from_status`, `action`.
- Reserve (`reserve_account.breached`): full `oe_reserve_account_chain` row spread — incl. `borrower_name`, `lender_name`, `project_id`, `facility_ref`, `loan_agreement_ref`, `reserve_number`, `reserve_tier`.
- Licence (`licence_application.licence_issued`): full `oe_licence_applications` row spread — incl. `applicant_party_id`, `applicant_party_name`, `licence_type` (`generation`/`transmission`/`distribution`/`trading`/`import_export`), `licence_class` (`major_licence`/`standard_licence`/`minor_licence` — this is the SIZE axis, NOT the technology), `licence_ref`, `licence_issued_at`, `facility_name`, `capacity_mw`.
- MRV (`carbon.mrv_issued`): `project_id`, `claimed_reductions_tco2e`.

**Target-table NOT-NULL columns (verified from migrations):**
- `oe_loan_defaults` (mig 180): `id`, `default_number` (UNIQUE), `borrower_party_id`, `borrower_party_name`, `facility_name`, `facility_tier` CHECK `('senior_secured','mezzanine','subordinated')`, `chain_status` CHECK incl. `'default_flagged'`, `default_flagged_at`, `created_by`. `default_type` is free TEXT (no CHECK). `created_at`/`updated_at` default `CURRENT_TIMESTAMP`.
- `oe_regulator_levies` (mig 238): `id`, `levy_number` (UNIQUE), `licensee_id`, `licensee_name`, `sector` CHECK `('electricity','piped_gas','petroleum_pipeline')`, `levy_basis` CHECK `('turnover_based','volume_based','fixed')`, `levy_tier` CHECK `('micro','small','medium','large','major')`, `financial_year`, `assessed_amount` (NOT NULL), `paid_to_date` (NOT NULL default 0), `outstanding_amount` (NOT NULL default 0), `chain_status` CHECK incl. `'levy_assessed'`, `assessed_at`, `created_by`.
- `oe_licence_renewals` (mig 156): `id`, `case_number` (UNIQUE — note: NOT `renewal_number`), `licence_id`, `licence_type` CHECK `('generation','distribution','trading')` (no `transmission`/`import_export`!), `licence_class` CHECK `('generation_utility','generation_embedded','generation_sseg','distribution','trading')`, `applicant_party_id`, `applicant_party_name`, `current_expiry_date` (NOT NULL), `chain_status` default `'renewal_initiated'`, `initiated_at`, `created_by`. `capacity_mw`/`facility_name` nullable.
- `oe_ppa_contract_chain` (mig 134): advance target. Keyed by `project_id` + `participant_id`. Status flow includes `…'executed','in_force'…`. Timestamp col `in_force_at`. Events table `oe_ppa_contract_chain_events(id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)`.
- `oe_reserve_account_chain` (mig 244): advance target. Has `borrower_name` + `project_id` but NO `borrower_party_id`. `reserve_tier` is SIZE (`small/medium/large/major/systemic`) — unrelated to loan-default seniority. Cure status is `'cure_pending'` (timestamp `cure_pending_at`). Events table `oe_reserve_account_chain_events(id, reserve_account_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at)`.
- `oe_role_action_queue` (mig 477): written via `pushRoleAction()`.

**Mapping decisions baked into the rules (documented assumptions):**
- Reserve→loan-default `facility_tier`: reserve size tier does not map to debt seniority, so default to `'senior_secured'` (most reserve accounts back senior debt). `default_type='covenant'`, `default_event='reserve_account_breach'`.
- Licence→levy: all our `licence_type` values are electricity-domain ⇒ `sector='electricity'`; placeholder `levy_basis='turnover_based'`, `assessed_amount=0`, `levy_tier='micro'` (regulator completes the real assessment). `financial_year` = SA fiscal year (Apr–Mar) of `assessed_at`.
- Licence→renewal: map `licence_type` → `(renewal licence_type, licence_class)`: `generation`→`('generation','generation_utility')`, `distribution`→`('distribution','distribution')`, `trading`→`('trading','trading')`. For `transmission`/`import_export`/anything else there is no valid renewal row ⇒ SKIP the renewal create (levy still created). `current_expiry_date` = `licence_issued_at` (or now) + 25 years (`DEFAULT_LICENCE_VALIDITY_YEARS`).

**Idempotency:** `fireCascade` may re-fire on retry, and the registry does not de-dupe. Every rule MUST be idempotent:
- create-rules guard on `SELECT … WHERE source_entity_type=? AND source_entity_id=ctx.entity_id` in the target table before inserting.
- advance-rules guard via the `WHERE chain_status='<predecessor>'` clause (a second run finds the row already advanced and no-ops).
- role-action pushes guard on `SELECT id FROM oe_role_action_queue WHERE source_entity_id=? AND source_event=? AND target_role=?` (the `helpers.alreadyPushed`).

**Roles (`ALL_ROLES`):** `admin, ipp_developer, trader, lender, offtaker, carbon_fund, grid_operator, regulator, support`. Targets used: `lender` (#1,#3,#4), `regulator` (#7), `carbon_fund` (#10).

**No-recursion rule:** advance-rules (#1 PPA, #3 reserve) write the target's `chain_status` + an events row directly and do NOT call `fireCascade` for the advanced entity (prevents cascade loops). The intended end-state (PPA `in_force`, reserve `cure_pending`) is terminal for our purposes.

**Exact imports (verified):**
```ts
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';
```
Tests: `import { createTestDb, envFor } from './helpers/d1-sqlite';` (both are exported functions; `createTestDb({ applyMigrations: true })` applies the full migration set incl. the irregular band and 475–480).

---

## File Structure

- **Create** `src/cascade-rules/lifecycle-sequencing.ts` — the five drive rules + module-private helpers + `registerLifecycleSequencingRules()`. One responsibility: lifecycle sequencing. Mirrors `src/cascade-rules/trading-safety.ts`.
- **Modify** `src/cascade-rules/index.ts` — import + call `registerLifecycleSequencingRules()` and re-export it (barrel self-registers at boot).
- **Create** `tests/lifecycle-sequencing.test.ts` — vitest unit tests (one `describe` per rule + a registry-dispatch describe).
- **Create** `pages/src/lib/roleActions.ts` — typed SPA client for the `/api/role-actions` surface.
- **Create** `pages/src/components/launch/IncomingPanel.tsx` — cross-role inbox panel + badge.
- **Modify** `pages/src/components/launch/WorkstationShell.tsx` — mount `IncomingPanel` (header badge + panel).
- **Create** `pages/src/components/launch/WizardShell.tsx` — generic multi-step transition primitive; first consumer is `IncomingPanel`'s "act" flow.

---

## Task 1: Rule-file scaffold + helpers + registration

**Files:**
- Create: `src/cascade-rules/lifecycle-sequencing.ts`
- Modify: `src/cascade-rules/index.ts`
- Test: `tests/lifecycle-sequencing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lifecycle-sequencing.test.ts`:

```ts
// W3 — lifecycle sequencing drive rules. Each rule reads ctx.data (the source
// chain spreads its full row in) and writes downstream tables + role-action
// prompts as the system:cascade actor. Tests exercise rule.run() directly.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import type { CascadeContext } from '../src/utils/cascade';
import {
  registerLifecycleSequencingRules,
  __lifecycleRulesForTest,
} from '../src/cascade-rules/lifecycle-sequencing';

function ruleById(id: string) {
  const r = __lifecycleRulesForTest().find((x) => x.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return r;
}

function ctxFor(
  env: any,
  event: string,
  entity_type: string,
  entity_id: string,
  data: Record<string, unknown>,
): CascadeContext {
  return { event, entity_type, entity_id, data, env } as unknown as CascadeContext;
}

describe('registerLifecycleSequencingRules — registration', () => {
  it('exposes all five drive rules, all mode=drive, idempotent registration', () => {
    registerLifecycleSequencingRules();
    registerLifecycleSequencingRules(); // second call must not duplicate
    const ids = __lifecycleRulesForTest().map((r) => r.id).sort();
    expect(ids).toEqual([
      'lifecycle.cod_certified_to_ppa_and_drawdown',
      'lifecycle.covenant_breach_to_reserve_cure',
      'lifecycle.licence_issued_to_levy_and_renewal',
      'lifecycle.mrv_issued_to_retirement_prompt',
      'lifecycle.reserve_breach_to_loan_default',
    ]);
    for (const r of __lifecycleRulesForTest()) expect(r.mode).toBe('drive');
  });

  it('match() is tight — a rule ignores unrelated events', () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    expect(r.match({ event: 'reserve_account.funded' } as any)).toBe(false);
    expect(r.match({ event: 'reserve_account.breached' } as any)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npx vitest run tests/lifecycle-sequencing.test.ts`
Expected: FAIL — `Cannot find module '../src/cascade-rules/lifecycle-sequencing'`.

- [ ] **Step 3: Write the scaffold + helpers + empty rule set**

Create `src/cascade-rules/lifecycle-sequencing.ts`:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// Layer A — lifecycle-sequencing rules (mode:'drive').
// Five upstream transitions auto-sequence their downstream chains as the
// dedicated system:cascade actor (never impersonating the affected role):
//   #1  cod.certify_cod                        → auto-activate PPA + lender drawdown prompt
//   #3  covenant_certificate.breach_identified → open reserve cure + lender prompt
//   #4  reserve_account.breached               → auto-create loan default + lender prompt
//   #7  licence_application.licence_issued      → auto-create NERSA levy + licence renewal + regulator prompt
//   #10 carbon.mrv_issued                       → carbon-fund retirement prompt
//
// Each rule reads only ctx.data (the source chain spreads its full row in).
// create-rules guard on (source_entity_type, source_entity_id); advance-rules
// guard via the predecessor-status WHERE clause; prompts guard via alreadyPushed.
// Advance-rules deliberately do NOT re-fire fireCascade (no cascade recursion).
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { pushRoleAction } from '../utils/role-actions';

const SYSTEM_ACTOR = 'system:cascade';
const SOURCE_WAVE = 'W3';
const DEFAULT_LICENCE_VALIDITY_YEARS = 25;

// ── data accessors ──────────────────────────────────────────────────────────
function dstr(ctx: CascadeContext, key: string): string | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}
function dnum(ctx: CascadeContext, key: string): number | null {
  const v = (ctx.data as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
function nowIso(): string {
  return new Date().toISOString();
}
// short human-facing case number from a uuid-bearing id
function numberFrom(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;
}

// SA fiscal year (Apr 1 – Mar 31). e.g. 2026-06 → '2026/27', 2026-02 → '2025/26'.
export function saFinancialYear(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0=Jan, 3=Apr
  const start = m >= 3 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function plusYearsIso(baseIso: string | null, years: number): string {
  const base = baseIso ? new Date(baseIso) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  return new Date(Date.UTC(
    d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate(),
  )).toISOString();
}

// licence_type → (renewal licence_type, renewal licence_class). null ⇒ unsupported.
function renewalClassFor(licenceType: string | null): { type: string; klass: string } | null {
  switch (licenceType) {
    case 'generation':   return { type: 'generation',   klass: 'generation_utility' };
    case 'distribution': return { type: 'distribution', klass: 'distribution' };
    case 'trading':      return { type: 'trading',      klass: 'trading' };
    default:             return null; // transmission / import_export / unknown
  }
}

// ── role-action prompt dedup ─────────────────────────────────────────────────
async function alreadyPushed(
  ctx: CascadeContext, sourceEntityId: string, targetRole: string,
): Promise<boolean> {
  const r = await ctx.env.DB.prepare(
    `SELECT id FROM oe_role_action_queue
      WHERE source_entity_id = ? AND source_event = ? AND target_role = ? LIMIT 1`,
  ).bind(sourceEntityId, ctx.event, targetRole).first();
  return !!r;
}

const RULES = [
  // rules added in Tasks 2–6
];

export function registerLifecycleSequencingRules(): void {
  for (const rule of RULES) registerCascadeRule(rule);
}

// Test-only accessor: the rule objects this module registers.
export function __lifecycleRulesForTest() {
  return RULES;
}
```

- [ ] **Step 4: Wire the barrel**

In `src/cascade-rules/index.ts`, add the import + call + re-export so it self-registers at boot. The file becomes:

```ts
// Layer A rule-registry barrel. Importing this module self-registers every
// cascade rule (index.ts imports it once at boot). Tests that reset the
// registry call the individual register*() functions directly.
import { registerTradingSafetyRules } from './trading-safety';
import { registerLifecycleSequencingRules } from './lifecycle-sequencing';

registerTradingSafetyRules();
registerLifecycleSequencingRules();

export { registerTradingSafetyRules, registerLifecycleSequencingRules };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npx vitest run tests/lifecycle-sequencing.test.ts`
Expected: the registration `describe` runs. The `match()` test will FAIL until Task 2 adds the reserve rule. That's fine — proceed to Task 2; this task's PASS criterion is only the first `it` (`exposes all five drive rules`) once Tasks 2–6 are landed. For Task 1 in isolation, instead assert the empty set:

Temporarily, the first test will fail because `RULES` is empty. To keep Task 1 green on its own, change the Task-1 test's first `it` to `expect(__lifecycleRulesForTest().length).toBe(0)` and the `match` `it` to `it.skip(...)`, then restore the full assertions in Task 6's step where all five exist. (Implementer: prefer this — keep each task's test green at the end of that task.)

- [ ] **Step 6: Type-check + commit**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm run check`
Expected: PASS (no type errors).

```bash
git add src/cascade-rules/lifecycle-sequencing.ts src/cascade-rules/index.ts tests/lifecycle-sequencing.test.ts
git commit -m "feat(W3): lifecycle-sequencing rule scaffold + helpers + registry wiring"
```

---

## Task 2: Rule #4 — reserve breach → auto-create loan default + lender prompt

**Files:**
- Modify: `src/cascade-rules/lifecycle-sequencing.ts`
- Test: `tests/lifecycle-sequencing.test.ts`

- [ ] **Step 1: Write the failing test** (append a `describe` to the test file)

```ts
describe('#4 reserve_account.breached → loan default', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  const data = {
    borrower_name: 'Aurora Solar SPV', lender_name: 'Standard Bank',
    project_id: 'proj_aurora', facility_ref: 'FAC-AURORA-SNR',
    loan_agreement_ref: 'LA-2024-AUR', reserve_number: 'RSA-AURORA-1', reserve_tier: 'large',
  };

  it('creates a default_flagged loan-default row + an urgent lender prompt', async () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_1', data));

    const def = db.prepare(
      `SELECT * FROM oe_loan_defaults WHERE source_entity_type='reserve_account' AND source_entity_id='rsa_1'`,
    ).get() as any;
    expect(def).toBeTruthy();
    expect(def.chain_status).toBe('default_flagged');
    expect(def.borrower_party_name).toBe('Aurora Solar SPV');
    expect(def.facility_tier).toBe('senior_secured');
    expect(def.created_by).toBe('system:cascade');

    const action = db.prepare(
      `SELECT * FROM oe_role_action_queue WHERE target_role='lender' AND source_entity_id=?`,
    ).get(def.id) as any;
    expect(action).toBeTruthy();
    expect(action.priority).toBe('urgent');
  });

  it('is idempotent — a second fire creates no second row', async () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_1', data));
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_1', data));
    const n = db.prepare(
      `SELECT COUNT(*) c FROM oe_loan_defaults WHERE source_entity_id='rsa_1'`,
    ).get() as any;
    expect(n.c).toBe(1);
  });

  it('no-ops when borrower_name is missing', async () => {
    const r = ruleById('lifecycle.reserve_breach_to_loan_default');
    await r.run(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_2', { lender_name: 'x' }));
    const n = db.prepare(`SELECT COUNT(*) c FROM oe_loan_defaults`).get() as any;
    expect(n.c).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#4"`
Expected: FAIL — rule not found / no insert.

- [ ] **Step 3: Implement the rule** — add to the `RULES` array in `lifecycle-sequencing.ts`:

```ts
  // #4 reserve breach → loan default (event of default)
  {
    id: 'lifecycle.reserve_breach_to_loan_default',
    mode: 'drive' as const,
    match: (ctx: CascadeContext) => ctx.event === 'reserve_account.breached',
    run: async (ctx: CascadeContext) => {
      const borrowerName = dstr(ctx, 'borrower_name');
      if (!borrowerName) return; // cannot raise a default without a borrower

      const existing = await ctx.env.DB.prepare(
        `SELECT id FROM oe_loan_defaults
          WHERE source_entity_type='reserve_account' AND source_entity_id=? LIMIT 1`,
      ).bind(ctx.entity_id).first();
      if (existing) return;

      const id = uid('ldf');
      const now = nowIso();
      const facilityName =
        dstr(ctx, 'facility_ref') ?? dstr(ctx, 'loan_agreement_ref') ??
        dstr(ctx, 'reserve_number') ?? 'Unspecified facility';
      const borrowerPartyId =
        dstr(ctx, 'project_id') ?? dstr(ctx, 'reserve_number') ?? ctx.entity_id;

      await ctx.env.DB.prepare(
        `INSERT INTO oe_loan_defaults
           (id, default_number, source_event, source_entity_type, source_entity_id, source_wave,
            borrower_party_id, borrower_party_name, lender_name, facility_name, facility_tier,
            default_type, default_event, flag_basis,
            chain_status, default_flagged_at, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?, ?,?,?,?, 'senior_secured',
                 'covenant', 'reserve_account_breach', ?,
                 'default_flagged', ?, ?, ?, ?)`,
      ).bind(
        id, numberFrom('LDF', id), ctx.event, 'reserve_account', ctx.entity_id, SOURCE_WAVE,
        borrowerPartyId, borrowerName, dstr(ctx, 'lender_name'), facilityName,
        `Auto-raised from reserve-account breach ${dstr(ctx, 'reserve_number') ?? ctx.entity_id}`,
        now, SYSTEM_ACTOR, now, now,
      ).run();

      await pushRoleAction(ctx.env, {
        target_role: 'lender',
        source_event: ctx.event, source_chain_key: 'loan_default',
        source_entity_type: 'loan_default', source_entity_id: id,
        title: `Event of default — reserve breach on ${facilityName}`,
        body: { borrower_party_name: borrowerName, reserve_account_id: ctx.entity_id, default_id: id },
        cross_option: { action_label: 'Manage default', target_route: `/lender/workstation?tab=loan-defaults&id=${id}` },
        priority: 'urgent',
      });
    },
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#4"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cascade-rules/lifecycle-sequencing.ts tests/lifecycle-sequencing.test.ts
git commit -m "feat(W3): rule #4 reserve breach -> loan default event-of-default + lender prompt"
```

---

## Task 3: Rule #7 — licence issued → auto-create levy + renewal + regulator prompt

**Files:**
- Modify: `src/cascade-rules/lifecycle-sequencing.ts`
- Test: `tests/lifecycle-sequencing.test.ts`

- [ ] **Step 1: Write the failing test** (append `describe`)

```ts
describe('#7 licence_application.licence_issued → levy + renewal', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  function genData(over: Record<string, unknown> = {}) {
    return {
      applicant_party_id: 'party_kuyasa', applicant_party_name: 'Kuyasa Energy (Pty) Ltd',
      licence_type: 'generation', licence_class: 'standard_licence',
      licence_ref: 'NERSA-GEN-2026-014', licence_issued_at: '2026-06-06T00:00:00.000Z',
      facility_name: 'Kuyasa Wind 1', capacity_mw: 140, ...over,
    };
  }

  it('creates a placeholder levy AND a renewal for a generation licence + a regulator prompt', async () => {
    const r = ruleById('lifecycle.licence_issued_to_levy_and_renewal');
    await r.run(ctxFor(env, 'licence_application.licence_issued', 'licence_application', 'lic_1', genData()));

    const levy = db.prepare(`SELECT * FROM oe_regulator_levies WHERE source_entity_id='lic_1'`).get() as any;
    expect(levy).toBeTruthy();
    expect(levy.sector).toBe('electricity');
    expect(levy.levy_basis).toBe('turnover_based');
    expect(levy.levy_tier).toBe('micro');
    expect(levy.assessed_amount).toBe(0);
    expect(levy.chain_status).toBe('levy_assessed');
    expect(levy.licensee_name).toBe('Kuyasa Energy (Pty) Ltd');

    const ren = db.prepare(`SELECT * FROM oe_licence_renewals WHERE source_entity_id='lic_1'`).get() as any;
    expect(ren).toBeTruthy();
    expect(ren.licence_type).toBe('generation');
    expect(ren.licence_class).toBe('generation_utility');
    expect(ren.chain_status).toBe('renewal_initiated');
    expect(ren.current_expiry_date.startsWith('2051-')).toBe(true); // issued 2026 + 25y

    const action = db.prepare(`SELECT * FROM oe_role_action_queue WHERE target_role='regulator' AND source_entity_id='lic_1'`).get() as any;
    expect(action).toBeTruthy();
  });

  it('skips the renewal for a transmission licence but still creates the levy', async () => {
    const r = ruleById('lifecycle.licence_issued_to_levy_and_renewal');
    await r.run(ctxFor(env, 'licence_application.licence_issued', 'licence_application', 'lic_2', genData({ licence_type: 'transmission' })));
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_regulator_levies WHERE source_entity_id='lic_2'`).get() as any).toMatchObject({ c: 1 });
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_licence_renewals WHERE source_entity_id='lic_2'`).get() as any).toMatchObject({ c: 0 });
  });

  it('is idempotent across both tables', async () => {
    const r = ruleById('lifecycle.licence_issued_to_levy_and_renewal');
    const ctx = ctxFor(env, 'licence_application.licence_issued', 'licence_application', 'lic_3', genData());
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_regulator_levies WHERE source_entity_id='lic_3'`).get() as any).toMatchObject({ c: 1 });
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_licence_renewals WHERE source_entity_id='lic_3'`).get() as any).toMatchObject({ c: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#7"`
Expected: FAIL.

- [ ] **Step 3: Implement the rule** — add to `RULES`:

```ts
  // #7 licence issued → NERSA levy assessment + licence renewal schedule
  {
    id: 'lifecycle.licence_issued_to_levy_and_renewal',
    mode: 'drive' as const,
    match: (ctx: CascadeContext) => ctx.event === 'licence_application.licence_issued',
    run: async (ctx: CascadeContext) => {
      const licenseeId = dstr(ctx, 'applicant_party_id');
      const licenseeName = dstr(ctx, 'applicant_party_name');
      if (!licenseeId || !licenseeName) return;
      const now = nowIso();

      // — levy (placeholder assessment; regulator completes the real figures) —
      const levyExists = await ctx.env.DB.prepare(
        `SELECT id FROM oe_regulator_levies
          WHERE source_entity_type='licence_application' AND source_entity_id=? LIMIT 1`,
      ).bind(ctx.entity_id).first();
      if (!levyExists) {
        const levyId = uid('lvy');
        await ctx.env.DB.prepare(
          `INSERT INTO oe_regulator_levies
             (id, levy_number, source_event, source_entity_type, source_entity_id, source_wave,
              licensee_id, licensee_name, sector, levy_basis, levy_tier, financial_year,
              assessed_amount, paid_to_date, outstanding_amount, assessment_basis,
              chain_status, assessed_at, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?, ?,?, 'electricity', 'turnover_based', 'micro', ?,
                   0, 0, 0, ?, 'levy_assessed', ?, ?, ?, ?)`,
        ).bind(
          levyId, numberFrom('LVY', levyId), ctx.event, 'licence_application', ctx.entity_id, SOURCE_WAVE,
          licenseeId, licenseeName, saFinancialYear(new Date()),
          `Auto-seeded on licence issuance ${dstr(ctx, 'licence_ref') ?? ctx.entity_id} — complete turnover assessment`,
          now, SYSTEM_ACTOR, now, now,
        ).run();
      }

      // — renewal (only for licence_types the renewal chain supports) —
      const mapped = renewalClassFor(dstr(ctx, 'licence_type'));
      let renId: string | null = null;
      if (mapped) {
        const renExists = await ctx.env.DB.prepare(
          `SELECT id FROM oe_licence_renewals
            WHERE source_entity_type='licence_application' AND source_entity_id=? LIMIT 1`,
        ).bind(ctx.entity_id).first();
        if (!renExists) {
          renId = uid('lren');
          await ctx.env.DB.prepare(
            `INSERT INTO oe_licence_renewals
               (id, case_number, licence_id, licence_number, licence_type, licence_class, capacity_mw,
                source_event, source_entity_type, source_entity_id, source_wave,
                applicant_party_id, applicant_party_name, facility_name,
                current_expiry_date, chain_status, initiated_at, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?, 'renewal_initiated', ?, ?, ?, ?)`,
          ).bind(
            renId, numberFrom('LREN', renId),
            dstr(ctx, 'licence_ref') ?? ctx.entity_id, dstr(ctx, 'licence_ref'),
            mapped.type, mapped.klass, dnum(ctx, 'capacity_mw'),
            ctx.event, 'licence_application', ctx.entity_id, SOURCE_WAVE,
            licenseeId, licenseeName, dstr(ctx, 'facility_name'),
            plusYearsIso(dstr(ctx, 'licence_issued_at'), DEFAULT_LICENCE_VALIDITY_YEARS),
            now, SYSTEM_ACTOR, now, now,
          ).run();
        }
      }

      if (!(await alreadyPushed(ctx, ctx.entity_id, 'regulator'))) {
        await pushRoleAction(ctx.env, {
          target_role: 'regulator',
          source_event: ctx.event, source_chain_key: 'levy_assessment',
          source_entity_type: 'licence_application', source_entity_id: ctx.entity_id,
          title: `New licensee ${licenseeName} — assess levy${mapped ? ' & confirm renewal calendar' : ''}`,
          body: { licence_ref: dstr(ctx, 'licence_ref'), renewal_created: !!mapped },
          cross_option: { action_label: 'Open levy assessment', target_route: `/regulator/workstation?tab=levies` },
          priority: 'normal',
        });
      }
    },
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#7"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cascade-rules/lifecycle-sequencing.ts tests/lifecycle-sequencing.test.ts
git commit -m "feat(W3): rule #7 licence issued -> NERSA levy + renewal auto-create + regulator prompt"
```

---

## Task 4: Rule #1 — COD certified → PPA auto-activate + lender drawdown prompt

**Files:**
- Modify: `src/cascade-rules/lifecycle-sequencing.ts`
- Test: `tests/lifecycle-sequencing.test.ts`

- [ ] **Step 1: Write the failing test** (append `describe`)

```ts
describe('#1 cod.certify_cod → PPA activate + lender drawdown prompt', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  function seedPpa(status: string) {
    db.prepare(
      `INSERT INTO oe_ppa_contract_chain
         (id, ppa_number, project_id, participant_id, offtaker_id, project_name, offtaker_name,
          capacity_mw, capacity_tier, chain_status, executed_at, created_by, created_at, updated_at)
       VALUES ('ppa_1','PPA-1','proj_x','party_ipp','party_off','Project X','Eskom',
               140,'medium',?, '2026-01-01', 'seed', '2026-01-01','2026-01-01')`,
    ).run(status);
  }
  const data = { participant_id: 'party_ipp', project_id: 'proj_x', project_name: 'Project X', capacity_mw: 140, capacity_tier: 'medium' };

  it('advances an executed PPA to in_force, writes an event row, and prompts the lender', async () => {
    seedPpa('executed');
    const r = ruleById('lifecycle.cod_certified_to_ppa_and_drawdown');
    await r.run(ctxFor(env, 'cod.certify_cod', 'cod_chain', 'cod_1', data));

    const ppa = db.prepare(`SELECT * FROM oe_ppa_contract_chain WHERE id='ppa_1'`).get() as any;
    expect(ppa.chain_status).toBe('in_force');
    expect(ppa.in_force_at).toBeTruthy();
    const evt = db.prepare(`SELECT * FROM oe_ppa_contract_chain_events WHERE ppa_id='ppa_1' AND to_status='in_force'`).get() as any;
    expect(evt.actor_id).toBe('system:cascade');

    const action = db.prepare(`SELECT * FROM oe_role_action_queue WHERE target_role='lender' AND source_entity_id='cod_1'`).get() as any;
    expect(action).toBeTruthy();
  });

  it('does not force a non-executed PPA but still prompts the lender', async () => {
    seedPpa('draft');
    const r = ruleById('lifecycle.cod_certified_to_ppa_and_drawdown');
    await r.run(ctxFor(env, 'cod.certify_cod', 'cod_chain', 'cod_2', data));
    expect((db.prepare(`SELECT chain_status FROM oe_ppa_contract_chain WHERE id='ppa_1'`).get() as any).chain_status).toBe('draft');
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cod_2'`).get() as any).toMatchObject({ c: 1 });
  });

  it('is idempotent on the lender prompt', async () => {
    seedPpa('executed');
    const r = ruleById('lifecycle.cod_certified_to_ppa_and_drawdown');
    const ctx = ctxFor(env, 'cod.certify_cod', 'cod_chain', 'cod_3', data);
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cod_3'`).get() as any).toMatchObject({ c: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#1"`
Expected: FAIL.

- [ ] **Step 3: Implement the rule** — add to `RULES`:

```ts
  // #1 COD certified → auto-activate the project PPA + prompt the lender to draw down
  {
    id: 'lifecycle.cod_certified_to_ppa_and_drawdown',
    mode: 'drive' as const,
    match: (ctx: CascadeContext) => ctx.event === 'cod.certify_cod',
    run: async (ctx: CascadeContext) => {
      const projectId = dstr(ctx, 'project_id');
      const participantId = dstr(ctx, 'participant_id');
      const projectName = dstr(ctx, 'project_name') ?? projectId ?? 'project';

      // (a) auto-activate an executed PPA for this project — no fireCascade (no recursion)
      if (projectId && participantId) {
        const ppa = await ctx.env.DB.prepare(
          `SELECT id FROM oe_ppa_contract_chain
            WHERE project_id=? AND participant_id=? AND chain_status='executed' LIMIT 1`,
        ).bind(projectId, participantId).first() as { id: string } | null;
        if (ppa) {
          const now = nowIso();
          await ctx.env.DB.prepare(
            `UPDATE oe_ppa_contract_chain SET chain_status='in_force', in_force_at=?, updated_at=? WHERE id=?`,
          ).bind(now, now, ppa.id).run();
          await ctx.env.DB.prepare(
            `INSERT INTO oe_ppa_contract_chain_events (id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at)
             VALUES (?,?,?,?,?,?,?,?,?)`,
          ).bind(
            uid('ppaevt'), ppa.id, 'in_force', 'executed', 'in_force', SYSTEM_ACTOR,
            `Auto-activated on COD ${dstr(ctx, 'cod_number') ?? ctx.entity_id}`, '{}', now,
          ).run();
        }
      }

      // (b) prompt the lender to initiate the drawdown
      if (!(await alreadyPushed(ctx, ctx.entity_id, 'lender'))) {
        await pushRoleAction(ctx.env, {
          target_role: 'lender',
          source_event: ctx.event, source_chain_key: 'drawdown',
          source_entity_type: 'cod_chain', source_entity_id: ctx.entity_id,
          title: `COD certified for ${projectName} — initiate drawdown`,
          body: { project_id: projectId, participant_id: participantId, capacity_mw: dnum(ctx, 'capacity_mw') },
          cross_option: { action_label: 'Initiate drawdown', target_route: `/lender/workstation?tab=drawdowns` },
          priority: 'high',
        });
      }
    },
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#1"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cascade-rules/lifecycle-sequencing.ts tests/lifecycle-sequencing.test.ts
git commit -m "feat(W3): rule #1 COD certified -> PPA auto-activate + lender drawdown prompt"
```

---

## Task 5: Rule #3 — covenant breach → reserve cure + lender prompt

**Files:**
- Modify: `src/cascade-rules/lifecycle-sequencing.ts`
- Test: `tests/lifecycle-sequencing.test.ts`

- [ ] **Step 1: Write the failing test** (append `describe`)

```ts
describe('#3 covenant_certificate.breach_identified → reserve cure + lender prompt', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  function seedReserve(status: string) {
    db.prepare(
      `INSERT INTO oe_reserve_account_chain
         (id, reserve_number, lender_name, borrower_name, target_amount_zar, reserve_tier,
          chain_status, reserve_required_at, created_by, created_at, updated_at)
       VALUES ('rsa_x','RSA-X','Standard Bank','Aurora Solar SPV', 50000000, 'large',
               ?, '2026-01-01', 'seed', '2026-01-01','2026-01-01')`,
    ).run(status);
  }
  const data = { borrower_party_name: 'Aurora Solar SPV', facility_name: 'Aurora Senior Facility', facility_tier: 'senior_secured', breached_covenants: 'DSCR' };

  it('moves a funded reserve to cure_pending + prompts the lender', async () => {
    seedReserve('funded');
    const r = ruleById('lifecycle.covenant_breach_to_reserve_cure');
    await r.run(ctxFor(env, 'covenant_certificate.breach_identified', 'covenant_certificate', 'cov_1', data));
    expect((db.prepare(`SELECT chain_status FROM oe_reserve_account_chain WHERE id='rsa_x'`).get() as any).chain_status).toBe('cure_pending');
    const evt = db.prepare(`SELECT * FROM oe_reserve_account_chain_events WHERE reserve_account_id='rsa_x' AND to_status='cure_pending'`).get() as any;
    expect(evt.actor_id).toBe('system:cascade');
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE target_role='lender' AND source_entity_id='cov_1'`).get() as any).toMatchObject({ c: 1 });
  });

  it('prompts the lender even when no matching reserve account exists', async () => {
    const r = ruleById('lifecycle.covenant_breach_to_reserve_cure');
    await r.run(ctxFor(env, 'covenant_certificate.breach_identified', 'covenant_certificate', 'cov_2', data));
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cov_2'`).get() as any).toMatchObject({ c: 1 });
  });

  it('is idempotent', async () => {
    seedReserve('funded');
    const r = ruleById('lifecycle.covenant_breach_to_reserve_cure');
    const ctx = ctxFor(env, 'covenant_certificate.breach_identified', 'covenant_certificate', 'cov_3', data);
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='cov_3'`).get() as any).toMatchObject({ c: 1 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#3"`
Expected: FAIL.

- [ ] **Step 3: Implement the rule** — add to `RULES`:

```ts
  // #3 covenant breach → open a cure on the borrower's reserve account + prompt the lender.
  // The covenant chain carries no facility/reserve FK, so the reserve is matched
  // best-effort by borrower name; the lender prompt is the reliable deliverable.
  {
    id: 'lifecycle.covenant_breach_to_reserve_cure',
    mode: 'drive' as const,
    match: (ctx: CascadeContext) => ctx.event === 'covenant_certificate.breach_identified',
    run: async (ctx: CascadeContext) => {
      const borrowerName = dstr(ctx, 'borrower_party_name');
      const facilityName = dstr(ctx, 'facility_name') ?? 'facility';

      if (borrowerName) {
        const reserve = await ctx.env.DB.prepare(
          `SELECT id, chain_status FROM oe_reserve_account_chain
            WHERE borrower_name=? AND chain_status IN ('funded','shortfall_flagged') LIMIT 1`,
        ).bind(borrowerName).first() as { id: string; chain_status: string } | null;
        if (reserve) {
          const now = nowIso();
          await ctx.env.DB.prepare(
            `UPDATE oe_reserve_account_chain SET chain_status='cure_pending', cure_pending_at=?, updated_at=? WHERE id=?`,
          ).bind(now, now, reserve.id).run();
          await ctx.env.DB.prepare(
            `INSERT INTO oe_reserve_account_chain_events (id, reserve_account_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
          ).bind(
            uid('rsaevt'), reserve.id, 'cure_pending', reserve.chain_status, 'cure_pending', SYSTEM_ACTOR, null,
            `Cure opened on covenant breach (${dstr(ctx, 'breached_covenants') ?? 'covenant'})`, '{}', now,
          ).run();
        }
      }

      if (!(await alreadyPushed(ctx, ctx.entity_id, 'lender'))) {
        await pushRoleAction(ctx.env, {
          target_role: 'lender',
          source_event: ctx.event, source_chain_key: 'reserve_account',
          source_entity_type: 'covenant_certificate', source_entity_id: ctx.entity_id,
          title: `Covenant breach on ${facilityName} — fund reserve cure`,
          body: { borrower_party_name: borrowerName, breached_covenants: dstr(ctx, 'breached_covenants') },
          cross_option: { action_label: 'Open reserve account', target_route: `/lender/workstation?tab=reserve-accounts` },
          priority: 'urgent',
        });
      }
    },
  },
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#3"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cascade-rules/lifecycle-sequencing.ts tests/lifecycle-sequencing.test.ts
git commit -m "feat(W3): rule #3 covenant breach -> reserve cure + lender prompt"
```

---

## Task 6: Rule #10 — MRV issued → carbon-fund retirement prompt + restore full registration test

**Files:**
- Modify: `src/cascade-rules/lifecycle-sequencing.ts`
- Test: `tests/lifecycle-sequencing.test.ts`

- [ ] **Step 1: Write the failing test** (append `describe`)

```ts
describe('#10 carbon.mrv_issued → carbon-fund retirement prompt', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => { db = createTestDb({ applyMigrations: true }); env = envFor(db); registerLifecycleSequencingRules(); });
  afterEach(() => { db.close(); });

  it('pushes a carbon_fund retirement prompt carrying project + quantity', async () => {
    const r = ruleById('lifecycle.mrv_issued_to_retirement_prompt');
    await r.run(ctxFor(env, 'carbon.mrv_issued', 'mrv_submissions', 'mrv_1', { project_id: 'cproj_1', claimed_reductions_tco2e: 12500 }));
    const action = db.prepare(`SELECT * FROM oe_role_action_queue WHERE target_role='carbon_fund' AND source_entity_id='mrv_1'`).get() as any;
    expect(action).toBeTruthy();
    expect(JSON.parse(action.body_json).claimed_reductions_tco2e).toBe(12500);
  });

  it('is idempotent', async () => {
    const r = ruleById('lifecycle.mrv_issued_to_retirement_prompt');
    const ctx = ctxFor(env, 'carbon.mrv_issued', 'mrv_submissions', 'mrv_2', { project_id: 'cproj_2', claimed_reductions_tco2e: 1 });
    await r.run(ctx); await r.run(ctx);
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_role_action_queue WHERE source_entity_id='mrv_2'`).get() as any).toMatchObject({ c: 1 });
  });
});
```

Also: restore the Task-1 registration `describe` to its full assertions (all five ids; un-skip the `match()` test) now that every rule exists.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "#10"`
Expected: FAIL.

- [ ] **Step 3: Implement the rule** — add to `RULES`:

```ts
  // #10 MRV issued (credits verified & issued) → prompt the carbon fund to retire
  {
    id: 'lifecycle.mrv_issued_to_retirement_prompt',
    mode: 'drive' as const,
    match: (ctx: CascadeContext) => ctx.event === 'carbon.mrv_issued',
    run: async (ctx: CascadeContext) => {
      if (await alreadyPushed(ctx, ctx.entity_id, 'carbon_fund')) return;
      const qty = dnum(ctx, 'claimed_reductions_tco2e');
      await pushRoleAction(ctx.env, {
        target_role: 'carbon_fund',
        source_event: ctx.event, source_chain_key: 'carbon_retirement',
        source_entity_type: 'mrv_submissions', source_entity_id: ctx.entity_id,
        title: `Credits verified${qty ? ` (${qty} tCO₂e)` : ''} — retire on behalf of beneficiary`,
        body: { project_id: dstr(ctx, 'project_id'), claimed_reductions_tco2e: qty },
        cross_option: { action_label: 'Retire credits', target_route: `/carbon/workstation?tab=retirements` },
        priority: 'normal',
      });
    },
  },
```

- [ ] **Step 4: Run the full file to verify all rules pass together**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts`
Expected: PASS (all describes incl. the restored registration test asserting all five ids).

- [ ] **Step 5: Full backend suite + type-check (regression gate)**

Run: `npm test && npm run check`
Expected: the full vitest suite (now 5 lifecycle describes + the prior 474+ tests) PASS; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/cascade-rules/lifecycle-sequencing.ts tests/lifecycle-sequencing.test.ts
git commit -m "feat(W3): rule #10 MRV issued -> carbon-fund retirement prompt; complete drive-rule set"
```

---

## Task 7: Registry-dispatch integration test (Layer-A wiring proof)

**Files:**
- Test: `tests/lifecycle-sequencing.test.ts`

Proves that `runCascadeRegistry()` (the function `fireCascade` invokes) matches a lifecycle event, runs the rule, and writes the `oe_cascade_rule_audit` outcome row — without exercising the full `fireCascade` fan-out.

- [ ] **Step 1: Write the failing test** (append `describe`)

The audit columns are VERIFIED against `src/utils/cascade-registry.ts::auditOutcome`: the table is `oe_cascade_rule_audit` with columns `rule_id` + `outcome` (CHECK `'ran'|'skipped'|'blocked'|'error'`), and `runCascadeRegistry` `await`s both `rule.run(ctx)` and `auditOutcome(...,'ran')` — so the `ran` row is written synchronously and deterministically. Reset the global registry first (it is a module-level array that persists across the vitest process and the trading-safety barrel may have populated it) so only lifecycle rules are present for this dispatch.

```ts
import { runCascadeRegistry, _resetRegistryForTests } from '../src/utils/cascade-registry';

describe('runCascadeRegistry — lifecycle dispatch + audit', () => {
  let db: Database.Database;
  let env: any;
  beforeEach(() => {
    db = createTestDb({ applyMigrations: true }); env = envFor(db);
    _resetRegistryForTests(); registerLifecycleSequencingRules();
  });
  afterEach(() => { db.close(); });

  it('dispatches reserve_account.breached through the registry and audits it as ran', async () => {
    await runCascadeRegistry(ctxFor(env, 'reserve_account.breached', 'reserve_account', 'rsa_disp', {
      borrower_name: 'Dispatch SPV', lender_name: 'ABSA', reserve_number: 'RSA-DISP',
    }));
    expect(db.prepare(`SELECT COUNT(*) c FROM oe_loan_defaults WHERE source_entity_id='rsa_disp'`).get() as any).toMatchObject({ c: 1 });
    const audit = db.prepare(
      `SELECT * FROM oe_cascade_rule_audit WHERE rule_id='lifecycle.reserve_breach_to_loan_default' ORDER BY created_at DESC LIMIT 1`,
    ).get() as any;
    expect(audit).toBeTruthy();
    expect(audit.outcome).toBe('ran');
  });
});
```

NOTE for implementer: `_resetRegistryForTests()` clears the global registry — call it ONLY in this dispatch describe's `beforeEach` (the rule-`run()` describes in Tasks 2–6 use `__lifecycleRulesForTest()`, the module-local array, so they don't depend on the global registry and must not reset it mid-file in a way that affects ordering).

- [ ] **Step 2: Run to verify it fails, then passes**

Run: `npx vitest run tests/lifecycle-sequencing.test.ts -t "runCascadeRegistry"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/lifecycle-sequencing.test.ts
git commit -m "test(W3): registry-dispatch integration test + audit-row assertion"
```

---

## Task 8: SPA role-actions API client

**Files:**
- Create: `pages/src/lib/roleActions.ts`

The backend `/api/role-actions` surface already exists (`src/routes/role-actions.ts`): `GET /` (`{ items: [...] }`, optional `?status=`), `GET /count` (`{ pending }`), `POST /:id/acknowledge|action|dismiss`. Note the mount prefix — confirm in `src/index.ts` (likely `/api/role-actions`).

- [ ] **Step 1: Read the existing API helper**

Read `pages/src/lib/api.ts`. Identify the exported request helper(s) (token-bearing fetch — e.g. `apiGet`/`apiPost`/`api.get`) and the base path convention. Match it exactly in the new file.

- [ ] **Step 2: Create the client** (`pages/src/lib/roleActions.ts`)

```ts
// SPA client for the Layer-C cross-role action queue (/api/role-actions).
// Follows the token-bearing fetch helper in ./api.ts — adapt the import to match.
import { apiGet, apiPost } from './api'; // ← adjust to the real export names in api.ts

export interface CrossOption {
  action_label: string;
  target_route: string;
  prefill?: Record<string, unknown>;
}
export interface RoleAction {
  id: string;
  target_role: string;
  target_participant_id: string | null;
  source_event: string;
  source_chain_key: string | null;
  source_entity_type: string;
  source_entity_id: string;
  title: string;
  body: Record<string, unknown> | null;
  cross_option: CrossOption | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'pending' | 'acknowledged' | 'actioned' | 'dismissed';
  sla_due_at: string | null;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listRoleActions(status?: RoleAction['status']): Promise<RoleAction[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await apiGet<{ items: RoleAction[] }>(`/api/role-actions${qs}`);
  return res.items ?? [];
}

export async function roleActionCount(): Promise<number> {
  const res = await apiGet<{ pending: number }>(`/api/role-actions/count`);
  return res.pending ?? 0;
}

export async function actOnRoleAction(
  id: string, kind: 'acknowledge' | 'action' | 'dismiss',
): Promise<void> {
  await apiPost(`/api/role-actions/${encodeURIComponent(id)}/${kind}`, {});
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/reshigan/Openenergy/open-energy-platform && npm run check:pages`
Expected: PASS. (If the import names differ, fix them to match `api.ts`.)

- [ ] **Step 4: Commit**

```bash
git add pages/src/lib/roleActions.ts
git commit -m "feat(W3): SPA role-actions API client"
```

---

## Task 9: IncomingPanel component

**Files:**
- Create: `pages/src/components/launch/IncomingPanel.tsx`

A self-contained cross-role inbox: fetches pending actions for the current role, renders a card per action (title, source, relative time, priority chip), with Acknowledge / Dismiss buttons and a primary "act" button that calls back to the host (so the host can open the WizardShell in Task 11). No `bg-black`/`#000`/`#fff` — tint neutrals (impeccable color law). Include focus-visible rings on every interactive element (the deferred-a11y debt from the impeccable critique — do NOT repeat it here).

- [ ] **Step 1: Read for style alignment**

Read `pages/src/components/launch/WorkstationShell.tsx` (the shared shell, recently modified — note `cleanTabLabel`, the Tailwind palette, Pill usage) and the existing `Pill`/`ListingTable` components it imports. Match their class vocabulary.

- [ ] **Step 2: Create the component** (`pages/src/components/launch/IncomingPanel.tsx`)

```tsx
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Inbox } from 'lucide-react';
import { listRoleActions, actOnRoleAction, type RoleAction } from '../../lib/roleActions';

const PRIORITY_STYLE: Record<RoleAction['priority'], string> = {
  urgent: 'bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30',
  high:   'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/30',
  normal: 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/30',
  low:    'bg-slate-500/15 text-slate-200 ring-1 ring-slate-400/30',
};

function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export interface IncomingPanelProps {
  /** Called when the user acts on a card; host decides how to handle it (open WizardShell / navigate). */
  onAct?: (action: RoleAction) => void;
  className?: string;
}

export default function IncomingPanel({ onAct, className }: IncomingPanelProps) {
  const [items, setItems] = useState<RoleAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await listRoleActions('pending')); }
    catch { setError('Could not load incoming actions.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const resolve = useCallback(async (a: RoleAction, kind: 'acknowledge' | 'dismiss') => {
    setBusyId(a.id);
    try { await actOnRoleAction(a.id, kind); setItems((xs) => xs.filter((x) => x.id !== a.id)); }
    catch { setError('Action failed. Try again.'); }
    finally { setBusyId(null); }
  }, []);

  return (
    <section className={`rounded-xl bg-slate-900/60 ring-1 ring-slate-100/10 ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100/10">
        <div className="flex items-center gap-2 text-slate-100">
          <Inbox className="h-4 w-4" aria-hidden />
          <h2 className="text-sm font-semibold">Incoming</h2>
          {items.length > 0 && (
            <span className="text-xs rounded-full bg-slate-100/10 px-2 py-0.5 text-slate-300">{items.length}</span>
          )}
        </div>
        <button
          type="button" onClick={() => void load()}
          className="rounded-md p-1.5 text-slate-300 hover:text-slate-100 hover:bg-slate-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
          aria-label="Refresh incoming actions"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </header>

      <div className="p-3 space-y-2">
        {error && <p className="text-xs text-rose-300 px-1">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="text-xs text-slate-400 px-1 py-6 text-center">No incoming actions. You're all caught up.</p>
        )}
        {items.map((a) => (
          <article key={a.id} className="rounded-lg bg-slate-950/40 ring-1 ring-slate-100/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-slate-100 font-medium leading-snug">{a.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {a.source_chain_key ?? a.source_entity_type} · {ago(a.created_at)}
                </p>
              </div>
              <span className={`shrink-0 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${PRIORITY_STYLE[a.priority]}`}>
                {a.priority}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {a.cross_option && (
                <button
                  type="button" onClick={() => onAct?.(a)} disabled={busyId === a.id}
                  className="rounded-md bg-sky-500/90 hover:bg-sky-400 text-slate-950 text-xs font-semibold px-3 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                >
                  {a.cross_option.action_label}
                </button>
              )}
              <button
                type="button" onClick={() => void resolve(a, 'acknowledge')} disabled={busyId === a.id}
                className="rounded-md text-xs text-slate-200 hover:bg-slate-100/10 px-2.5 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                Acknowledge
              </button>
              <button
                type="button" onClick={() => void resolve(a, 'dismiss')} disabled={busyId === a.id}
                className="rounded-md text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-100/10 px-2.5 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
              >
                Dismiss
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check:pages`
Expected: PASS. (Confirm `lucide-react` exports `Inbox` + `RefreshCw` — both used elsewhere in the shell.)

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/launch/IncomingPanel.tsx
git commit -m "feat(W3): IncomingPanel cross-role inbox component"
```

---

## Task 10: Mount IncomingPanel in WorkstationShell

**Files:**
- Modify: `pages/src/components/launch/WorkstationShell.tsx`

Surface the panel on every role workstation so a cascade-driven prompt appears without the user navigating to find it (the "live-driven, unattended" success metric). Mount it as a right-rail panel on ≥768px and keep it simple (the floating-badge + drawer for <768px is a W6 polish item — leave a `TODO(W6)` comment, do not build it now).

- [ ] **Step 1: Read the shell layout**

Read `pages/src/components/launch/WorkstationShell.tsx` fully. Find the main content container and where a right-rail or trailing panel can mount without breaking the existing tab/listing grid. Identify the prop the shell already receives (it renders per-role workstations) so you can place `IncomingPanel` in a layout slot that does not disrupt `TabNav`.

- [ ] **Step 2: Wire it in**

Add `import IncomingPanel from './IncomingPanel';` and render `<IncomingPanel className="hidden lg:block lg:w-80 shrink-0" onAct={...} />` alongside the main panel inside a flex row. For Task 10, wire `onAct` to a simple navigation fallback: `onAct={(a) => { if (a.cross_option) window.location.assign(a.cross_option.target_route); }}` (Task 11 replaces this with the WizardShell). Keep the existing single-column behaviour intact when the viewport is narrow.

```tsx
// inside the shell's main layout return, wrap existing content + panel in a row:
<div className="flex gap-6 items-start">
  <div className="min-w-0 flex-1">
    {/* ...existing TabNav + tab content... */}
  </div>
  <IncomingPanel
    className="hidden lg:block lg:w-80 shrink-0"
    onAct={(a) => { if (a.cross_option) window.location.assign(a.cross_option.target_route); }}
  />
  {/* TODO(W6): <768px floating badge + drawer per blueprint line 182 */}
</div>
```

- [ ] **Step 3: Type-check + build**

Run: `npm run check:pages && (cd pages && npm run build)`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/launch/WorkstationShell.tsx
git commit -m "feat(W3): mount IncomingPanel right-rail on every workstation"
```

---

## Task 11: WizardShell primitive + wire into the IncomingPanel act flow

**Files:**
- Create: `pages/src/components/launch/WizardShell.tsx`
- Modify: `pages/src/components/launch/WorkstationShell.tsx`

A generic multi-step transition modal. Its first real consumer: acting on an incoming cross-role prompt = a two-step flow (Review context → Confirm + optional note) that on completion calls `actOnRoleAction(id, 'action')` then navigates to the deep link. Accessible: `role="dialog"`, `aria-modal`, Esc to close, focus the first control on open, tinted backdrop (NOT `bg-black`).

- [ ] **Step 1: Create the primitive** (`pages/src/components/launch/WizardShell.tsx`)

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface WizardStep {
  title: string;
  /** Step body. Receives a setter the step can use to gate "Next" (e.g. require a field). */
  render: (ctx: { setCanAdvance: (ok: boolean) => void }) => ReactNode;
}

export interface WizardShellProps {
  open: boolean;
  heading: string;
  steps: WizardStep[];
  finalLabel?: string;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}

export default function WizardShell({
  open, heading, steps, finalLabel = 'Confirm', onClose, onComplete,
}: WizardShellProps) {
  const [i, setI] = useState(0);
  const [canAdvance, setCanAdvance] = useState(true);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setI(0); setCanAdvance(true); setBusy(false); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, i, onClose]);

  if (!open) return null;
  const last = i === steps.length - 1;
  const step = steps[i];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-label={heading}
        className="w-full max-w-lg rounded-xl bg-slate-900 ring-1 ring-slate-100/10 shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-100/10">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{heading}</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Step {i + 1} of {steps.length} · {step.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="rounded-md p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="px-5 py-4 text-sm text-slate-200">{step.render({ setCanAdvance })}</div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-slate-100/10">
          <button type="button" onClick={() => (i === 0 ? onClose() : setI(i - 1))}
            className="text-xs text-slate-300 hover:text-slate-100 px-3 py-1.5 rounded-md hover:bg-slate-100/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60">
            {i === 0 ? 'Cancel' : 'Back'}
          </button>
          <button
            type="button" disabled={!canAdvance || busy}
            onClick={async () => {
              if (!last) { setI(i + 1); return; }
              setBusy(true); try { await onComplete(); } finally { setBusy(false); }
            }}
            className="rounded-md bg-sky-500/90 hover:bg-sky-400 text-slate-950 text-xs font-semibold px-4 py-1.5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            {last ? finalLabel : 'Next'}
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into WorkstationShell's `onAct`**

Replace the Task-10 navigation fallback. Hold the active action in state; render a `WizardShell` with two steps; on complete call `actOnRoleAction(action.id, 'action')` then navigate.

```tsx
import { useState } from 'react';
import WizardShell from './WizardShell';
import { actOnRoleAction, type RoleAction } from '../../lib/roleActions';

// inside the shell component:
const [active, setActive] = useState<RoleAction | null>(null);

// pass to the panel:
<IncomingPanel className="hidden lg:block lg:w-80 shrink-0" onAct={setActive} />

// render the wizard:
{active && (
  <WizardShell
    open
    heading={active.title}
    finalLabel={active.cross_option?.action_label ?? 'Confirm'}
    steps={[
      { title: 'Review', render: () => (
        <div className="space-y-1">
          <p className="text-slate-300">{active.title}</p>
          <p className="text-[11px] text-slate-500">
            Source: {active.source_chain_key ?? active.source_entity_type} · {active.source_entity_id}
          </p>
        </div>
      ) },
      { title: 'Confirm', render: () => (
        <p className="text-slate-300">
          This marks the action complete and opens <span className="text-slate-100">{active.cross_option?.target_route}</span>.
        </p>
      ) },
    ]}
    onClose={() => setActive(null)}
    onComplete={async () => {
      try { await actOnRoleAction(active.id, 'action'); } catch { /* surfaced on next refresh */ }
      const route = active.cross_option?.target_route;
      setActive(null);
      if (route) window.location.assign(route);
    }}
  />
)}
```

- [ ] **Step 3: Type-check + build**

Run: `npm run check:pages && (cd pages && npm run build)`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/launch/WizardShell.tsx pages/src/components/launch/WorkstationShell.tsx
git commit -m "feat(W3): WizardShell transition primitive + wire into IncomingPanel act flow"
```

---

## Final verification (after all tasks)

- [ ] Backend regression: `cd /Users/reshigan/Openenergy/open-energy-platform && npm test` — full vitest suite green (includes all lifecycle describes).
- [ ] Backend types: `npm run check` — clean.
- [ ] SPA types + build: `npm run check:pages && (cd pages && npm run build)` — clean.
- [ ] Dispatch a final code-reviewer subagent over the whole W3 diff (per subagent-driven-development).
- [ ] Confirm the deep-link tab keys used in the rules' `cross_option.target_route` (`loan-defaults`, `reserve-accounts`, `drawdowns`, `levies`, `retirements`) match the real workstation tab ids; if a key is wrong the card still navigates to the workstation, but fix to the exact tab for a clean deep link.

## Self-review notes (gaps deliberately scoped out)

- **`<768px` IncomingPanel drawer** — blueprint line 182 polish, marked `TODO(W6)`.
- **CrossOptionModal / `/modules` / AI insight cards** — explicitly W6, not here.
- **Reserve↔covenant FK** — no clean key exists; #3 uses best-effort borrower-name match for the drive half, with the lender prompt as the guaranteed deliverable. Documented in the rule comment.
- **Levy figures** — auto-created as a `assessed_amount=0` placeholder; the regulator completes the real turnover-based assessment. The prompt tells them to.
- **`facility_tier='senior_secured'` default on auto-created loan defaults** — reserve size tier ≠ debt seniority; documented assumption, lender can amend.
