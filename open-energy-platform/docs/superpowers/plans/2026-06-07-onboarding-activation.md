# Onboarding Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the platform's first-run experience from a data-collection form that provisions nothing into a guided, role-aware activation flow that creates real working entities, coaches the new user toward their first meaningful action, and stays usable as the platform's complexity grows.

**Architecture:** Five additive layers on the existing system, no rewrite. (1) A new Layer-A cascade rule reacts to the already-fired `onboarding.completed` event and provisions real entities (sites, projects, meters) from the wizard's collected data, with an idempotency/evidence log. (2) The broken `esums_owner` SPA route is fixed and a role-keyed capability index ("what can I do here") is added. (3) A real-chain-state-driven setup checklist plus empty-state coaching lands on every launch board. (4) The API-only smart-meter chain (W199) gets an L4 workstation tab modelled on the reference `CommissioningTab`. (5) The dormant `InlineHelp` and `OnboardingTour` primitives are activated on workstation surfaces. Everything routes through the `fireCascade()` god node and the existing `ux-state` / `launch` / `esums-commissioning` patterns.

**Tech Stack:** Cloudflare Worker + Hono + D1 (SQLite), Workers AI binding (`AI`), React 18 SPA (Vite), vitest (backend unit), Playwright (SPA behaviour — note: the SPA has **no** unit-test runner, so frontend gates are `npm run check:pages` + Playwright specs).

---

## Decisions & assumptions (correct me if wrong)

These were resolved from the research + codebase rather than asked, to keep momentum. Each is reversible.

1. **One plan, six phases, sequenced by dependency** — not the research's raw priority order. The `esums_owner` routing fix (research rec #5) moves to Phase 2 because nothing the `esums_owner` role does is visible until it lands. Provisioning (rec #1) stays Phase 1 (keystone). Each phase ships independently.
2. **Provisioning is idempotent and additive.** `onboarding.completed` can be replayed (DLQ). The rule guards on a new `oe_onboarding_provisioning_log` table (migration **482** — the next free number after 481) so a replay never double-creates. No existing schema is altered.
3. **"Kicking W12" = creating the site at `commissioning_status='planned'` with its SLA window set.** That is the W12 chain's entry state; the owner advances it from the Commissioning tab. We do **not** fire nested cascades from inside the provisioning rule (avoids re-entrancy surprises).
4. **Goldrush is untouched.** The 10 NXT Energy sites are seeded at `in_om` with real Solax actuals. Provisioning only ever creates *new* `planned` sites for *newly onboarded* owners. No synthetic kWh/billing rows, ever.
5. **The SPA brand string "Consolidated Energy Cockpit" is left alone.** Research flagged it as a "wrong product name," but it is used consistently across the login page, footer, and hero (`App.tsx:528,544,958`). It looks like a deliberate white-label brand, not a bug. Renaming it is **out of scope** for this plan; if it is wrong, that is a separate one-line decision for the user. (See Phase 5, Task 5.1 — the tour copy is generalised, not renamed.)
6. **Capability index is served from the existing `launch` router**, not a new top-level mount, to avoid churning the `index.ts` god node.
7. **Depth target: L4** for provisioning, checklist, and the smart-meter tab; **L3** for help/tours and the capability map (per the team rubric in CLAUDE.md).

**Branch:** continue on `feat/ecosystem-foundation` (current). Do not open a new branch.

---

## File structure

**Phase 1 — Provisioning (backend, L4)**
- Create: `migrations/482_onboarding_provisioning_log.sql` — idempotency + evidence table.
- Create: `src/cascade-rules/onboarding-provisioning.ts` — the `onboarding.completed` rule.
- Modify: `src/cascade-rules/index.ts` — register the new rule (additive, mirrors W5).
- Create: `tests/cascade-rules-onboarding-provisioning.test.ts` — unit tests.

**Phase 2 — esums_owner routing + capability map (L2→L3)**
- Modify: `pages/src/components/launch/RoleLaunchBoard.tsx` — add `esums_owner` to `KNOWN_ROLES`.
- Create: `src/utils/capability-map.ts` — static role→capabilities manifest.
- Modify: `src/routes/launch.ts` — add `GET /:role/capabilities` handler.
- Create: `pages/src/components/launch/CapabilityPalette.tsx` — searchable "what can I do here" overlay.
- Modify: `pages/src/components/launch/WorkstationShell.tsx` — mount the palette trigger.
- Create: `tests/browser/esums-owner-launch.spec.ts` — Playwright: esums_owner lands on a board.

**Phase 3 — Setup checklist + empty states (L3→L4)**
- Modify: `src/routes/launch.ts` — add `GET /:role/checklist` handler (real chain-state derived).
- Create: `pages/src/components/launch/SetupChecklist.tsx` — checklist + AI "next step" card.
- Modify: `pages/src/components/launch/LaunchBoardShell.tsx` — render checklist on first run.
- Modify: `pages/src/components/launch/SignatureLaunchBoard.tsx` — same, for signature roles.

**Phase 4 — Smart-meter onboarding UI (L4)**
- Create: `pages/src/components/esums/SmartMeterChainTab.tsx` — L4 tab (twin of `CommissioningTab`).
- Modify: `pages/src/components/pages/EsumsOmPage.tsx` — mount the new tab.

**Phase 5 — InlineHelp + per-surface tours (L2→L3)**
- Modify: `pages/src/components/launch/WorkstationShell.tsx` — host an `OnboardingTour` slot + `InlineHelp` region.
- Modify: `pages/src/components/esums/CommissioningTab.tsx` — add scoped `InlineHelp`.
- Modify: `pages/src/components/esums/SmartMeterChainTab.tsx` — add scoped `InlineHelp` + tour.
- Modify: `pages/src/App.tsx` — generalise `GlobalOnboardingTourWrapper` copy (no rename).

**Phase 6 — Verification & branch finish**
- No files; runs gates and the finishing-a-development-branch skill.

---

## Reference patterns (read before starting)

- **Cascade rule shape:** `src/cascade-rules/grid-dispatch.ts` (header box, `registerXxxRules()`, `registerCascadeRule({id, match, run})`). Shared helpers: `src/cascade-rules/_enqueue.ts` (`genId()`, `daysFromNow()`, `enqueueAction()`).
- **Cascade rule test harness:** `tests/cascade-rules-grid-dispatch.test.ts` (`createTestDb({applyMigrations:true})`, `envFor(db)`, `_resetRegistryForTests()`, `runCascadeRegistry(ctx)`).
- **L4 chain tab reference:** `pages/src/components/esums/CommissioningTab.tsx` (KPI strip + filter pills + table + drill drawer with timeline + per-state action buttons). The smart-meter tab is its structural twin.
- **Dormant primitives:** `pages/src/components/InlineHelp.tsx`, `pages/src/components/OnboardingTour.tsx`, hooks in `pages/src/lib/uxState.ts` (`useOnboarding`, `useHelpDismissal`).
- **Onboarding backend:** `src/routes/onboarding.ts` — `/complete` fires `fireCascade({event:'onboarding.completed', actor_id:user.id, entity_type:'participant', entity_id:user.id, data:{role}})`. The wizard's collected fields live in `participants.onboarding_data` (JSON). `onboarding.completed` is in the `EventType` union (`cascade.ts:1994`) but **no rule currently handles it** — confirmed.
- **Wizard fields collected** (`pages/src/components/onboarding/steps.tsx`): esums_owner → `site_name`, `installed_capacity_kw`; ipp_developer → `company_reg_no`, `installed_capacity_mw`, technology array; others collect profile fields only.

---

# Phase 1 — Onboarding provisioning (L4 keystone)

**Outcome:** Completing onboarding as an `esums_owner` creates a real `om_sites` row at `planned` (engaging the W12 commissioning chain with an SLA window). As an `ipp_developer`, it creates a real `ipp_projects` row at `development`. Every provisioning action is logged once per participant (idempotent under DLQ replay) and the new user gets a guided next-step action in their queue.

### Task 1.1: Provisioning log migration

**Files:**
- Create: `migrations/482_onboarding_provisioning_log.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 482: onboarding provisioning evidence + idempotency log.
-- Records every entity the onboarding.completed cascade rule provisions for a
-- participant. The UNIQUE (participant_id) guard makes the rule idempotent: a
-- DLQ replay of onboarding.completed will find an existing log row and skip.
-- Additive only — no existing table is altered.

CREATE TABLE IF NOT EXISTS oe_onboarding_provisioning_log (
  id              TEXT PRIMARY KEY,
  participant_id  TEXT NOT NULL,
  role            TEXT NOT NULL,
  kind            TEXT NOT NULL,            -- om_site | ipp_project | smart_meter | data_source | none
  entity_type     TEXT,                     -- table the entity_id belongs to (nullable for kind='none')
  entity_id       TEXT,                     -- provisioned row id (nullable for kind='none')
  detail_json     TEXT,                     -- snapshot of the fields used
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oprov_participant ON oe_onboarding_provisioning_log(participant_id);
-- One provisioning pass per participant — the idempotency anchor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oprov_once ON oe_onboarding_provisioning_log(participant_id, kind);
```

- [ ] **Step 2: Apply locally to verify it parses**

Run: `wrangler d1 migrations apply open-energy-db --local`
Expected: applies cleanly (or, if the local ledger is ahead, `--file` the single migration: `wrangler d1 execute open-energy-db --local --file migrations/482_onboarding_provisioning_log.sql`). No SQL error.

- [ ] **Step 3: Commit**

```bash
git add migrations/482_onboarding_provisioning_log.sql
git commit -m "feat(onboarding): migration 482 — provisioning evidence + idempotency log

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 1.2: Provisioning cascade rule (failing test first)

**Files:**
- Create: `tests/cascade-rules-onboarding-provisioning.test.ts`
- Create: `src/cascade-rules/onboarding-provisioning.ts`
- Modify: `src/cascade-rules/index.ts`

- [ ] **Step 1: Write the failing test**

`tests/cascade-rules-onboarding-provisioning.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb, envFor } from './helpers/d1-sqlite';
import { _resetRegistryForTests, runCascadeRegistry } from '../src/utils/cascade-registry';
import { registerOnboardingProvisioningRules } from '../src/cascade-rules/onboarding-provisioning';

let db: Database.Database;
let env: Record<string, unknown>;

beforeEach(() => {
  db = createTestDb({ applyMigrations: true });
  env = envFor(db);
  _resetRegistryForTests();
  registerOnboardingProvisioningRules();
});
afterEach(() => { db.close(); });

// Seed a participant row with onboarding data. Adjust the column list if the
// participants schema marks more columns NOT NULL — read migrations/001* and
// 378_onboarding.sql first.
function seedParticipant(id: string, role: string, data: Record<string, unknown>) {
  db.prepare(
    `INSERT INTO participants (id, email, role, onboarding_step, onboarding_data, onboarding_completed)
     VALUES (?, ?, ?, 'complete', ?, 1)`,
  ).run(id, `${id}@example.com`, role, JSON.stringify(data));
}

function ctx(participantId: string, role: string) {
  return {
    event: 'onboarding.completed',
    entity_type: 'participant',
    entity_id: participantId,
    data: { role },
    actor_id: participantId,
    env,
  } as any;
}

describe('onboarding-provisioning rule', () => {
  it('esums_owner with a site name provisions a planned om_sites row owned by the participant', async () => {
    seedParticipant('p_esums', 'esums_owner', { site_name: 'Rooftop A', installed_capacity_kw: '250' });
    await runCascadeRegistry(ctx('p_esums', 'esums_owner'));

    const site = db.prepare(
      `SELECT name, participant_id, commissioning_status, capacity_mw FROM om_sites WHERE participant_id = 'p_esums'`,
    ).get() as any;
    expect(site).toMatchObject({ name: 'Rooftop A', participant_id: 'p_esums', commissioning_status: 'planned' });
    expect(site.capacity_mw).toBeCloseTo(0.25); // 250 kW → 0.25 MW

    const log = db.prepare(
      `SELECT kind, entity_type FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_esums' AND kind = 'om_site'`,
    ).get() as any;
    expect(log).toMatchObject({ kind: 'om_site', entity_type: 'om_sites' });
  });

  it('ipp_developer with capacity provisions a development ipp_projects row', async () => {
    seedParticipant('p_ipp', 'ipp_developer', { company_reg_no: '2010/012345/07', installed_capacity_mw: '100', technology: ['solar_pv'] });
    await runCascadeRegistry(ctx('p_ipp', 'ipp_developer'));

    const proj = db.prepare(
      `SELECT developer_id, status, capacity_mw FROM ipp_projects WHERE developer_id = 'p_ipp'`,
    ).get() as any;
    expect(proj).toMatchObject({ developer_id: 'p_ipp', status: 'development' });
    expect(proj.capacity_mw).toBeCloseTo(100);
  });

  it('is idempotent — firing twice does not double-provision', async () => {
    seedParticipant('p_dup', 'esums_owner', { site_name: 'Once Only', installed_capacity_kw: '10' });
    await runCascadeRegistry(ctx('p_dup', 'esums_owner'));
    await runCascadeRegistry(ctx('p_dup', 'esums_owner'));

    const count = db.prepare(
      `SELECT COUNT(*) AS n FROM om_sites WHERE participant_id = 'p_dup'`,
    ).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('a role with no provisionable data writes a none log row and creates no entities', async () => {
    seedParticipant('p_trader', 'trader', { entity_name: 'Acme Trading' });
    await runCascadeRegistry(ctx('p_trader', 'trader'));

    const log = db.prepare(
      `SELECT kind FROM oe_onboarding_provisioning_log WHERE participant_id = 'p_trader'`,
    ).get() as { kind: string };
    expect(log.kind).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run tests/cascade-rules-onboarding-provisioning.test.ts`
Expected: FAIL — `Cannot find module '../src/cascade-rules/onboarding-provisioning'`.

- [ ] **Step 3: Write the rule**

First read `src/utils/site-commissioning-spec.ts` to confirm the `slaDueAt` export and its signature (expected `slaDueAt(status, now: Date): string | null`). Then create `src/cascade-rules/onboarding-provisioning.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Layer A — onboarding provisioning cascade rule.
// Reacts to onboarding.completed (fired by src/routes/onboarding.ts) and turns
// the wizard's collected data (participants.onboarding_data JSON) into REAL
// working entities so a new user lands on a board with something to act on:
//   esums_owner  → an om_sites row at commissioning_status='planned'
//                  (engages the W12 commissioning chain with its SLA window)
//   ipp_developer→ an ipp_projects row at status='development'
//   other roles  → no entity yet (logged as kind='none'; extend here later)
//
// Idempotency: guarded on oe_onboarding_provisioning_log (UNIQUE participant_id,
// kind). A DLQ replay of onboarding.completed finds the log row and returns.
// actor_id is preserved as the participant (NOT system:cascade) — this is the
// user's own setup action.
//
// We do NOT fire nested cascades from here. The site is created at the chain's
// entry state ('planned') with its SLA deadline set; the owner advances it from
// the Commissioning tab. That IS engaging W12 — no re-entrancy needed.
// ═══════════════════════════════════════════════════════════════════════════
import type { CascadeContext } from '../utils/cascade';
import { registerCascadeRule } from '../utils/cascade-registry';
import { genId, enqueueAction, daysFromNow } from './_enqueue';
import { slaDueAt } from '../utils/site-commissioning-spec';

interface ParticipantRow {
  role: string;
  onboarding_data: string | null;
  onboarding_skipped: number;
}

function parseData(raw: string | null): Record<string, unknown> {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

async function logProvision(
  db: any,
  participantId: string,
  role: string,
  kind: string,
  entityType: string | null,
  entityId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db.prepare(
    `INSERT OR IGNORE INTO oe_onboarding_provisioning_log
       (id, participant_id, role, kind, entity_type, entity_id, detail_json, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).bind(
    genId(), participantId, role, kind, entityType, entityId,
    JSON.stringify(detail), new Date().toISOString(),
  ).run();
}

export function registerOnboardingProvisioningRules(): void {
  registerCascadeRule({
    id: 'onboarding_provisioning.completed',
    match: (ctx: CascadeContext) => ctx.event === 'onboarding.completed',
    run: async (ctx: CascadeContext) => {
      const db = ctx.env.DB;
      const participantId = ctx.entity_id;

      // Idempotency guard — already provisioned for this participant?
      const seen = await db
        .prepare(`SELECT 1 AS x FROM oe_onboarding_provisioning_log WHERE participant_id = ? LIMIT 1`)
        .bind(participantId)
        .first<{ x: number }>();
      if (seen) return;

      const p = await db
        .prepare(`SELECT role, onboarding_data, onboarding_skipped FROM participants WHERE id = ?`)
        .bind(participantId)
        .first<ParticipantRow>();
      if (!p) return;

      const role = (ctx.data?.role as string) || p.role;
      const data = parseData(p.onboarding_data);
      const now = new Date();
      const nowIso = now.toISOString();

      if (role === 'esums_owner') {
        const siteName = (data.site_name as string)?.trim();
        if (siteName) {
          const capacityKw = Number(data.installed_capacity_kw) || 0;
          const capacityMw = capacityKw / 1000;
          const siteId = genId();
          const due = slaDueAt('planned', now); // SLA window for the entry state
          await db.prepare(
            `INSERT INTO om_sites
               (id, name, participant_id, technology, capacity_mw, status,
                commissioning_status, commissioning_owner_id, commissioning_started_at,
                commissioning_due_at, created_at)
             VALUES (?,?,?,?,?,'construction','planned',?,?,?,?)`,
          ).bind(
            siteId, siteName, participantId, 'solar', capacityMw,
            participantId, nowIso, due, nowIso,
          ).run();
          await logProvision(db, participantId, role, 'om_site', 'om_sites', siteId, { siteName, capacityMw });

          // Guided first action for the new owner.
          await enqueueAction(db, {
            type: 'commission_site',
            priority: 'normal',
            actor_id: participantId,
            assignee_id: participantId,
            entity_type: 'om_sites',
            entity_id: siteId,
            title: `Commission your site: ${siteName}`,
            description: 'Register the site, add devices, and wire ingestion to bring it online.',
            due_date: daysFromNow(14),
          });
          return;
        }
      }

      if (role === 'ipp_developer') {
        const capacityMw = Number(data.installed_capacity_mw) || 0;
        if (capacityMw > 0) {
          const techArr = Array.isArray(data.technology) ? (data.technology as string[]) : [];
          const technology = techArr[0] || 'solar_pv';
          const projectId = genId();
          await db.prepare(
            `INSERT INTO ipp_projects
               (id, project_name, developer_id, structure_type, technology, capacity_mw,
                location, status, created_at)
             VALUES (?,?,?,?,?,?,?,'development',?)`,
          ).bind(
            projectId, `${(data.company_reg_no as string) || 'New'} Project`,
            participantId, 'greenfield', technology, capacityMw, 'TBD', nowIso,
          ).run();
          await logProvision(db, participantId, role, 'ipp_project', 'ipp_projects', projectId, { capacityMw, technology });

          await enqueueAction(db, {
            type: 'complete_project_profile',
            priority: 'normal',
            actor_id: participantId,
            assignee_id: participantId,
            entity_type: 'ipp_projects',
            entity_id: projectId,
            title: 'Complete your project profile',
            description: 'Add grid connection point, PPA terms, and milestones to start the IPP lifecycle.',
            due_date: daysFromNow(14),
          });
          return;
        }
      }

      // No provisionable data for this role yet — record the pass so we stay
      // idempotent and have an evidence row.
      await logProvision(db, participantId, role, 'none', null, null, { reason: 'no_provisionable_data' });
    },
  });
}
```

- [ ] **Step 4: Register the rule in the barrel**

In `src/cascade-rules/index.ts`, add the import (after the existing imports), the call (after the existing `register*()` calls), and the re-export (append to the `export { ... }` list):

```typescript
import { registerOnboardingProvisioningRules } from './onboarding-provisioning';
```
```typescript
registerOnboardingProvisioningRules();
```
Append `registerOnboardingProvisioningRules` to the final `export { ... }` statement.

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run tests/cascade-rules-onboarding-provisioning.test.ts`
Expected: PASS (4 tests). If the participants INSERT fails on a NOT NULL column, add the column to `seedParticipant` (check `migrations` for the participants `CREATE TABLE`).

- [ ] **Step 6: Type-check + full suite**

Run: `npm run check && npm test`
Expected: `check` clean; vitest green (7977 prior + 4 new = 7981).

- [ ] **Step 7: Commit**

```bash
git add src/cascade-rules/onboarding-provisioning.ts src/cascade-rules/index.ts tests/cascade-rules-onboarding-provisioning.test.ts
git commit -m "feat(onboarding): provision real entities on onboarding.completed (L4)

esums_owner → planned om_sites (engages W12); ipp_developer → development
ipp_projects. Idempotent via oe_onboarding_provisioning_log. Guided next-step
action enqueued. Preserves participant actor_id.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 2 — esums_owner routing fix + capability map (L2→L3)

**Outcome:** An `esums_owner` who signs in reaches a working launch board instead of being bounced to `/launch/admin`. Every role gets a searchable "What can I do here?" capability index so a new user can discover the platform's depth without reading 20 dense tabs.

### Task 2.1: Fix esums_owner SPA routing

**Files:**
- Modify: `pages/src/components/launch/RoleLaunchBoard.tsx:34-44`

- [ ] **Step 1: Add esums_owner to KNOWN_ROLES**

The backend already serves `/api/launch/esums_owner` (`src/routes/launch.ts:1773`) and `LaunchBoardShell` renders that payload. The bug is purely that `esums_owner` is absent from `KNOWN_ROLES`, so `RoleLaunchBoard` treats it as unknown and redirects. Add it to `KNOWN_ROLES` only (route to the existing `LaunchBoardShell`; do **not** add to `SIGNATURE_ROLES` unless/until the signature KPI endpoint is confirmed to support it):

```typescript
const KNOWN_ROLES = new Set([
  'trader',
  'ipp_developer',
  'offtaker',
  'lender',
  'grid_operator',
  'regulator',
  'carbon_fund',
  'admin',
  'support',
  'esums_owner',
]);
```

- [ ] **Step 2: Type-check the SPA**

Run: `npm run check:pages`
Expected: no errors.

- [ ] **Step 3: Write a Playwright behaviour spec**

Create `tests/browser/esums-owner-launch.spec.ts` (model on `tests/browser/workstations.spec.ts` — seed the token via `page.addInitScript` after a single API login; never log in through the UI repeatedly because of the 10/5min rate limiter):

```typescript
import { test, expect } from '@playwright/test';
import { apiLogin } from './helpers/auth'; // or replicate the login_or_cached pattern used by sibling specs

test('esums_owner lands on a launch board, not /launch/admin', async ({ page }) => {
  const token = await apiLogin('esums_owner@openenergy.co.za', 'Demo@2024!');
  await page.addInitScript((t) => localStorage.setItem('token', t), token);
  await page.goto('/launch/esums_owner');
  // Must not be bounced away from the esums_owner board.
  await expect(page).toHaveURL(/\/launch\/esums_owner/);
  await expect(page.getByText(/Asset Owner|Esums|O&M/i).first()).toBeVisible();
});
```

(If `esums_owner@openenergy.co.za` is not a seeded demo persona, seed it the same way the other personas are seeded, or point the test at an existing esums_owner account. Verify the persona exists before writing the assertion.)

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/launch/RoleLaunchBoard.tsx tests/browser/esums-owner-launch.spec.ts
git commit -m "fix(launch): route esums_owner to its launch board (add to KNOWN_ROLES)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2.2: Capability manifest + endpoint

**Files:**
- Create: `src/utils/capability-map.ts`
- Modify: `src/routes/launch.ts`

- [ ] **Step 1: Write the manifest**

Create `src/utils/capability-map.ts`. Keep entries truthful — each must point at a route that exists. Start with the high-traffic roles; the structure is extensible.

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Capability map — a role-keyed index of "what can I do here". Powers the
// CapabilityPalette ("What can I do?") overlay so a new user can discover the
// platform's depth without scanning 20 dense workstation tabs. Each entry must
// deep-link to a surface that actually exists.
// ═══════════════════════════════════════════════════════════════════════════

export interface Capability {
  id: string;
  label: string;
  description: string;
  href: string;          // SPA route
  group: string;         // for grouping in the palette
  depth: 'core' | 'advanced';
}

const COMMON: Capability[] = [
  { id: 'settings', label: 'Account & security settings', description: 'Manage your profile, password, and 2FA.', href: '/settings', group: 'Account', depth: 'core' },
];

export const CAPABILITY_MAP: Record<string, Capability[]> = {
  esums_owner: [
    { id: 'commission_site', label: 'Commission a site', description: 'Take a site from planned to in-O&M through the commissioning chain.', href: '/esums?tab=commissioning', group: 'Onboarding', depth: 'core' },
    { id: 'add_meter', label: 'Add a smart meter', description: 'Register and commission a smart meter on one of your sites.', href: '/esums?tab=smart_meter', group: 'Onboarding', depth: 'core' },
    { id: 'predictive_health', label: 'Predictive asset health', description: 'Review anomaly, RUL, and fault-fingerprint predictions for your fleet.', href: '/esums?tab=prognostics', group: 'Operations', depth: 'advanced' },
    { id: 'opportunities', label: 'Monetisable opportunities', description: 'Rule-based scan of the fleet for performance upside, each quantified in ZAR.', href: '/esums?tab=opportunities', group: 'Operations', depth: 'advanced' },
    ...COMMON,
  ],
  ipp_developer: [
    { id: 'create_project', label: 'Start a project', description: 'Create an IPP project and run it through the development lifecycle.', href: '/projects', group: 'Onboarding', depth: 'core' },
    ...COMMON,
  ],
  // Extend per role. Roles without an entry fall back to COMMON only.
};

export function capabilitiesForRole(role: string): Capability[] {
  return CAPABILITY_MAP[role] ?? COMMON;
}
```

(Verify the `href` query-tab convention against how `EsumsOmPage` reads its active tab. If it uses internal state rather than a `?tab=` query param, adjust the hrefs to the convention the page actually honours — read `pages/src/components/pages/EsumsOmPage.tsx` and its `WorkstationShell` usage first.)

- [ ] **Step 2: Add the endpoint to the launch router**

In `src/routes/launch.ts`, import the helper at the top and add a handler. The route is mounted at `/api/launch`, so this serves `GET /api/launch/:role/capabilities`:

```typescript
import { capabilitiesForRole } from '../utils/capability-map';
```
```typescript
// GET /:role/capabilities — "what can I do here" index for the palette.
launch.get('/:role/capabilities', async (c) => {
  const user = getCurrentUser(c);
  const role = c.req.param('role');
  // Same cross-role rule as the boards: you see your own unless admin/support.
  if (role !== user.role && user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }
  return c.json({ success: true, data: { capabilities: capabilitiesForRole(role) } });
});
```

(Match the existing handler style in `launch.ts` — variable name of the Hono instance, how `getCurrentUser` is imported, and the success-envelope shape. Read a sibling handler in the file before writing.)

- [ ] **Step 3: Type-check + targeted test**

Run: `npm run check`
Expected: clean.

Optionally add a backend test in an existing launch test file asserting `capabilitiesForRole('esums_owner')` returns a non-empty array whose every `href` is a string starting with `/`.

- [ ] **Step 4: Commit**

```bash
git add src/utils/capability-map.ts src/routes/launch.ts
git commit -m "feat(launch): role capability index endpoint (GET /:role/capabilities)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 2.3: CapabilityPalette overlay

**Files:**
- Create: `pages/src/components/launch/CapabilityPalette.tsx`
- Modify: `pages/src/components/launch/WorkstationShell.tsx`

- [ ] **Step 1: Build the palette**

A command-palette-style searchable overlay (the canonical affordance for a capability index — not a generic modal). Create `pages/src/components/launch/CapabilityPalette.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

interface Capability {
  id: string; label: string; description: string; href: string; group: string; depth: 'core' | 'advanced';
}

export function CapabilityPalette({ role, open, onClose }: { role: string; open: boolean; onClose: () => void }) {
  const [caps, setCaps] = useState<Capability[]>([]);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    void api.get(`/launch/${role}/capabilities`)
      .then((r) => setCaps(r.data?.data?.capabilities || []))
      .catch(() => setCaps([]));
  }, [open, role]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return caps;
    return caps.filter((c) => `${c.label} ${c.description} ${c.group}`.toLowerCase().includes(needle));
  }, [caps, q]);

  if (!open) return null;

  const go = (href: string) => { onClose(); navigate(href); };

  return (
    <div role="dialog" aria-label="What can I do here" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,28,46,0.35)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: '92vw', background: '#fff', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid #eef1f5' }}>
          <Search size={16} className="text-[#6b7685]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="What do you want to do?"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14 }} />
          <button aria-label="Close" onClick={onClose} className="text-[#6b7685] hover:text-[#0f1c2e]"><X size={16} /></button>
        </div>
        <div style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 && <div style={{ padding: 20, color: '#7a8a9a', fontSize: 13 }}>No matching actions.</div>}
          {filtered.map((c) => (
            <button key={c.id} onClick={() => go(c.href)}
              style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, padding: '10px 12px', border: 'none', background: 'none', borderRadius: 8, cursor: 'pointer' }}
              onMouseOver={(e) => (e.currentTarget.style.background = '#f5f7fa')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'none')}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f1c2e' }}>{c.label}
                  {c.depth === 'advanced' && <span style={{ marginLeft: 8, fontSize: 10, color: '#6b7685', textTransform: 'uppercase', letterSpacing: 0.5 }}>advanced</span>}
                </div>
                <div style={{ fontSize: 12, color: '#557', marginTop: 2 }}>{c.description}</div>
              </div>
              <ArrowRight size={14} className="text-[#9aa6b4] flex-none mt-1" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the trigger in WorkstationShell**

Read `pages/src/components/launch/WorkstationShell.tsx` to find its header region. Add a "What can I do?" button there that opens the palette, wiring `role` from the shell's existing role prop/context. Keep the button subtle (text + a small icon), in the header action row. Use local `useState` for `open`.

- [ ] **Step 3: Type-check the SPA**

Run: `npm run check:pages`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/launch/CapabilityPalette.tsx pages/src/components/launch/WorkstationShell.tsx
git commit -m "feat(launch): CapabilityPalette — searchable 'what can I do here' index

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 3 — Setup checklist + first-run empty states (L3→L4)

**Outcome:** A new user's launch board shows a role-aware setup checklist driven by **real chain state** (not a hardcoded list), plus an empty-state nudge and a single subtle AI "recommended next step" card. As the user completes setup (creates a site, adds a data source, completes KYC), items tick off and the checklist collapses itself.

### Task 3.1: Checklist endpoint (real chain-state derived)

**Files:**
- Modify: `src/routes/launch.ts`

- [ ] **Step 1: Add the endpoint**

Serves `GET /api/launch/:role/checklist`. Each item resolves `done` from a real `COUNT(*)`/status query scoped to the user. Add to `launch.ts`:

```typescript
// GET /:role/checklist — first-run setup checklist, driven by real state.
launch.get('/:role/checklist', async (c) => {
  const user = getCurrentUser(c);
  const role = c.req.param('role');
  if (role !== user.role && user.role !== 'admin' && user.role !== 'support') {
    return c.json({ success: false, error: 'Forbidden' }, 403);
  }

  const items: Array<{ id: string; label: string; description: string; href: string; done: boolean }> = [];

  if (role === 'esums_owner') {
    const sites = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM om_sites WHERE participant_id = ?`,
    ).bind(user.id).first<{ n: number }>();
    const inOm = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM om_sites WHERE participant_id = ? AND commissioning_status = 'in_om'`,
    ).bind(user.id).first<{ n: number }>();
    const meters = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM oe_smart_meter_assets WHERE owner_id = ?`,
    ).bind(user.id).first<{ n: number }>();
    items.push(
      { id: 'create_site', label: 'Register your first site', description: 'Your site appears in the commissioning chain at "planned".', href: '/esums?tab=commissioning', done: (sites?.n ?? 0) > 0 },
      { id: 'add_meter', label: 'Add a smart meter', description: 'Register a meter so telemetry can flow.', href: '/esums?tab=smart_meter', done: (meters?.n ?? 0) > 0 },
      { id: 'site_live', label: 'Bring a site to O&M', description: 'Advance a site through commissioning to in-O&M.', href: '/esums?tab=commissioning', done: (inOm?.n ?? 0) > 0 },
    );
  } else if (role === 'ipp_developer') {
    const projects = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ipp_projects WHERE developer_id = ?`,
    ).bind(user.id).first<{ n: number }>();
    items.push(
      { id: 'create_project', label: 'Create your first project', description: 'Start the IPP development lifecycle.', href: '/projects', done: (projects?.n ?? 0) > 0 },
    );
  }
  // Other roles get an empty checklist for now (extend as their first-run
  // entities are defined). Never invent an item whose `done` query can't run.

  const remaining = items.filter((i) => !i.done).length;
  return c.json({ success: true, data: { items, remaining, complete: remaining === 0 && items.length > 0 } });
});
```

(Confirm each table/column referenced exists for the role before shipping its item. `om_sites.participant_id`, `om_sites.commissioning_status`, `oe_smart_meter_assets.owner_id`, `ipp_projects.developer_id` are all confirmed present.)

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/routes/launch.ts
git commit -m "feat(launch): role setup-checklist endpoint driven by real chain state (L4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 3.2: SetupChecklist component + empty-state nudge

**Files:**
- Create: `pages/src/components/launch/SetupChecklist.tsx`
- Modify: `pages/src/components/launch/LaunchBoardShell.tsx`
- Modify: `pages/src/components/launch/SignatureLaunchBoard.tsx`

- [ ] **Step 1: Build the component**

`pages/src/components/launch/SetupChecklist.tsx`. Hide entirely when there are no items or all are done (dismissal persisted via `useHelpDismissal` so a returning user who finished setup never sees it again). Include one subtle AI-style "next step" line pointing at the first incomplete item (the inline-assist pattern: a reason + a 1-click action, no popup).

```tsx
import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useHelpDismissal } from '../../lib/uxState';

interface Item { id: string; label: string; description: string; href: string; done: boolean; }

export function SetupChecklist({ role }: { role: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();
  const { dismissed, dismiss } = useHelpDismissal(`setup-checklist.${role}`);

  useEffect(() => {
    void api.get(`/launch/${role}/checklist`)
      .then((r) => setItems(r.data?.data?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [role]);

  if (!loaded || dismissed !== false) return null;
  if (items.length === 0) return null;
  const remaining = items.filter((i) => !i.done);
  if (remaining.length === 0) return null; // all done — nothing to nudge

  const next = remaining[0];

  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1c2e' }}>Finish setting up</div>
        <button onClick={() => void dismiss()} style={{ fontSize: 11, color: '#6b7685', background: 'none', border: 'none', cursor: 'pointer' }}>Hide</button>
      </div>

      {/* Subtle AI-style next-step assist: reason + 1-click. */}
      <button onClick={() => navigate(next.href)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', marginTop: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #cfe0f0', background: '#eaf3fb', cursor: 'pointer' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#0f3a5c', fontWeight: 600 }}>Recommended next: {next.label}</div>
          <div style={{ fontSize: 11, color: '#3a4658', marginTop: 2 }}>{next.description}</div>
        </div>
        <ArrowRight size={14} className="text-[#0f3a5c] flex-none" />
      </button>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((i) => (
          <button key={i.id} onClick={() => !i.done && navigate(i.href)} disabled={i.done}
            style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '6px 4px', border: 'none', background: 'none', cursor: i.done ? 'default' : 'pointer' }}>
            {i.done ? <CheckCircle2 size={16} className="text-[#1f6b3a] flex-none" /> : <Circle size={16} className="text-[#9aa6b4] flex-none" />}
            <span style={{ fontSize: 13, color: i.done ? '#7a8a9a' : '#0f1c2e', textDecoration: i.done ? 'line-through' : 'none' }}>{i.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it on both launch shells**

In `pages/src/components/launch/LaunchBoardShell.tsx`, import `SetupChecklist` and render `<SetupChecklist role={role} />` near the top of the board body (above the KPI/cards region). Do the same in `pages/src/components/launch/SignatureLaunchBoard.tsx`. The component self-hides when there is nothing to show, so it is safe to mount unconditionally.

- [ ] **Step 3: Type-check the SPA**

Run: `npm run check:pages`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add pages/src/components/launch/SetupChecklist.tsx pages/src/components/launch/LaunchBoardShell.tsx pages/src/components/launch/SignatureLaunchBoard.tsx
git commit -m "feat(launch): first-run setup checklist + subtle AI next-step on launch boards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 4 — Smart-meter onboarding UI (L4)

**Outcome:** The W199 smart-meter chain — currently API-only — gets a full L4 workstation tab in the Esums O&M page: KPI strip, filter pills, table with SLA countdown, drill drawer with audit timeline + per-state action buttons, and a self-serve "Add meter" form. This is the missing "meter onboarding" surface the research called out.

### Task 4.1: SmartMeterChainTab component

**Files:**
- Create: `pages/src/components/esums/SmartMeterChainTab.tsx`

- [ ] **Step 1: Build the tab (structural twin of CommissioningTab)**

The route is already mounted at `/api/smart-meter-assets`. Note the response shapes differ from commissioning: list returns `{ data: rows[], kpis, pagination }`; detail returns `{ data: { ...row, timeline } }`; actions are `POST /:id/action` with `{ action }`; create is `POST /` with `{ meter_serial, site_id, meter_class?, make_model?, communication_tech? }`. Create `pages/src/components/esums/SmartMeterChainTab.tsx`:

```tsx
// Smart-meter asset chain — Wave 199 L4 tab for the Esums workstation.
// Structural twin of CommissioningTab: KPI strip + filter pills + table with
// SLA countdown + drill drawer (timeline + per-state actions) + a create form.
// Route: /api/smart-meter-assets  (list returns {data, kpis, pagination};
// detail {data:{...row, timeline}}; actions POST /:id/action {action}).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';

type SmaStatus =
  | 'ordered' | 'factory_acceptance' | 'site_delivery' | 'installation_pending'
  | 'installed' | 'commissioning' | 'communication_test' | 'data_quality_pass'
  | 'operational' | 'fault_detected' | 'replacement_pending' | 'decommissioned';

interface MeterRow {
  id: string; meter_serial: string; meter_class: string; site_id: string;
  owner_id: string; chain_status: SmaStatus; sla_deadline: string | null;
  sla_breached: number; make_model: string | null; created_at: string;
}
interface TimelineEvent { id: string; event_type: string; created_at: string; }

const TONE: Record<SmaStatus, { bg: string; fg: string; label: string }> = {
  ordered:              { bg: '#f0f3f7', fg: '#445566', label: 'Ordered' },
  factory_acceptance:   { bg: '#dbecfb', fg: '#1a3a5c', label: 'Factory acceptance' },
  site_delivery:        { bg: '#dbecfb', fg: '#1a3a5c', label: 'Delivered' },
  installation_pending: { bg: '#fff4d6', fg: '#a06200', label: 'Install pending' },
  installed:            { bg: '#dbecfb', fg: '#1a3a5c', label: 'Installed' },
  commissioning:        { bg: '#fff4d6', fg: '#a06200', label: 'Commissioning' },
  communication_test:   { bg: '#fff4d6', fg: '#a06200', label: 'Comms test' },
  data_quality_pass:    { bg: '#daf5e2', fg: '#1f6b3a', label: 'Data quality OK' },
  operational:          { bg: '#daf5e2', fg: '#1f6b3a', label: 'Operational' },
  fault_detected:       { bg: '#fde0e0', fg: '#9b1f1f', label: 'Fault' },
  replacement_pending:  { bg: '#fff4d6', fg: '#a06200', label: 'Replacement pending' },
  decommissioned:       { bg: '#e3e7ec', fg: '#557',    label: 'Decommissioned' },
};

// (action key) → { label, from-states } so buttons only show when valid. Mirror
// of SMA_VALID_TRANSITIONS in src/utils/smart-meter-spec.ts — keep in sync.
const ACTIONS: Array<{ action: string; label: string; from: SmaStatus[]; danger?: boolean }> = [
  { action: 'confirm_fat',           label: 'Confirm FAT',          from: ['ordered', 'factory_acceptance'] },
  { action: 'confirm_delivery',      label: 'Confirm delivery',     from: ['factory_acceptance'] },
  { action: 'schedule_installation', label: 'Schedule install',     from: ['site_delivery', 'installation_pending'] },
  { action: 'confirm_installed',     label: 'Confirm installed',    from: ['installation_pending'] },
  { action: 'start_commissioning',   label: 'Start commissioning',  from: ['installed'] },
  { action: 'confirm_communication', label: 'Confirm comms',        from: ['commissioning'] },
  { action: 'pass_data_quality',     label: 'Pass data quality',    from: ['communication_test'] },
  { action: 'go_live',               label: 'Go live',              from: ['data_quality_pass'] },
  { action: 'report_fault',          label: 'Report fault',         from: ['operational', 'commissioning', 'communication_test', 'data_quality_pass'], danger: true },
  { action: 'schedule_replacement',  label: 'Schedule replacement', from: ['fault_detected'] },
  { action: 'return_to_service',     label: 'Return to service',    from: ['fault_detected'] },
  { action: 'decommission',          label: 'Decommission',         from: ['fault_detected', 'replacement_pending', 'operational', 'installed'], danger: true },
];

const FILTERS = [
  { key: 'open', label: 'In progress' }, { key: 'all', label: 'All' },
  { key: 'operational', label: 'Operational' }, { key: 'fault_detected', label: 'Faults' },
  { key: 'decommissioned', label: 'Decommissioned' },
];
const TERMINAL = new Set<SmaStatus>(['operational', 'decommissioned']);

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, padding: '12px 16px', minWidth: 140 }}>
      <div style={{ fontSize: 11, color: '#557', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1c2733', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#7a8a9a', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function slaText(deadline: string | null, breached: number): string {
  if (!deadline) return '—';
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (breached || days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'due today';
  return `${days}d remaining`;
}

export function SmartMeterChainTab() {
  const [rows, setRows] = useState<MeterRow[]>([]);
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('open');
  const [drill, setDrill] = useState<MeterRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ meter_serial: '', site_id: '', meter_class: 'post_paid' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await api.get('/smart-meter-assets');
      setRows(r.data?.data || []);
      setKpis(r.data?.kpis || {});
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load meters.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'open') return rows.filter((r) => !TERMINAL.has(r.chain_status));
    return rows.filter((r) => r.chain_status === filter);
  }, [rows, filter]);

  const openDrill = useCallback(async (row: MeterRow) => {
    setDrill(row); setTimeline([]);
    try {
      const r = await api.get(`/smart-meter-assets/${row.id}`);
      setDrill(r.data?.data || row);
      setTimeline(r.data?.data?.timeline || []);
    } catch {/* leave empty */}
  }, []);

  const act = useCallback(async (action: string, id: string) => {
    setError(null);
    try {
      await api.post(`/smart-meter-assets/${id}/action`, { action });
      await load();
      if (drill) await openDrill(drill);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed.');
    }
  }, [load, openDrill, drill]);

  const create = useCallback(async () => {
    setError(null);
    if (!form.meter_serial || !form.site_id) { setError('Meter serial and site are required.'); return; }
    try {
      await api.post('/smart-meter-assets', form);
      setCreating(false); setForm({ meter_serial: '', site_id: '', meter_class: 'post_paid' });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not create meter.');
    }
  }, [form, load]);

  return (
    <div data-testid="esums-smart-meter-tab" style={{ padding: '16px 20px', minHeight: 600 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1c2733', marginTop: 0 }}>Smart-meter commissioning</h2>
          <p style={{ fontSize: 13, color: '#557', marginTop: 4, maxWidth: 720 }}>
            Every meter from purchase order through FAT, delivery, installation, commissioning, comms test and
            data-quality validation to operational service. URGENT SLA by class (HV bulk 7d → post-paid 30d).
            HV-bulk faults and decommissions notify the regulator.
          </p>
        </div>
        <button onClick={() => setCreating((v) => !v)}
          style={{ flex: 'none', padding: '8px 14px', background: '#1c2733', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {creating ? 'Cancel' : '+ Add meter'}
        </button>
      </div>

      {creating && (
        <div style={{ marginTop: 12, padding: 14, background: '#f6f8fb', border: '1px solid #e3e7ec', borderRadius: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: '#557' }}>Meter serial<br />
            <input value={form.meter_serial} onChange={(e) => setForm((f) => ({ ...f, meter_serial: e.target.value }))}
              style={{ marginTop: 4, padding: '6px 8px', border: '1px solid #cfd8e3', borderRadius: 6, fontSize: 13 }} /></label>
          <label style={{ fontSize: 12, color: '#557' }}>Site ID<br />
            <input value={form.site_id} onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}
              style={{ marginTop: 4, padding: '6px 8px', border: '1px solid #cfd8e3', borderRadius: 6, fontSize: 13 }} /></label>
          <label style={{ fontSize: 12, color: '#557' }}>Class<br />
            <select value={form.meter_class} onChange={(e) => setForm((f) => ({ ...f, meter_class: e.target.value }))}
              style={{ marginTop: 4, padding: '6px 8px', border: '1px solid #cfd8e3', borderRadius: 6, fontSize: 13 }}>
              <option value="post_paid">Post-paid (30d)</option>
              <option value="prepaid">Prepaid (21d)</option>
              <option value="bulk">Bulk (14d)</option>
              <option value="hv_bulk">HV bulk (7d)</option>
            </select></label>
          <button onClick={() => void create()}
            style={{ padding: '8px 14px', background: '#1f6b3a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Create</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <Kpi label="In progress" value={kpis.in_progress ?? 0} />
        <Kpi label="Operational" value={kpis.operational ?? 0} />
        <Kpi label="Faulted" value={kpis.faulted ?? 0} sub="needs attention" />
        <Kpi label="Decommissioned" value={kpis.decommissioned ?? 0} />
        <Kpi label="SLA breached" value={kpis.sla_breached ?? 0} sub="regulator-flagged" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #e3e7ec',
              background: filter === f.key ? '#1c2733' : '#fff', color: filter === f.key ? '#fff' : '#1c2733',
              fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{f.label}</button>
        ))}
      </div>

      {error && <div style={{ marginTop: 12, padding: '8px 12px', background: '#fde0e0', color: '#9b1f1f', borderRadius: 6, fontSize: 13 }}>{error}</div>}

      <div style={{ marginTop: 14, background: '#fff', border: '1px solid #e3e7ec', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f8fb', textAlign: 'left', color: '#557' }}>
              <th style={{ padding: '8px 12px' }}>Serial</th>
              <th style={{ padding: '8px 12px' }}>Class</th>
              <th style={{ padding: '8px 12px' }}>Site</th>
              <th style={{ padding: '8px 12px' }}>State</th>
              <th style={{ padding: '8px 12px' }}>SLA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#7a8a9a' }}>
                {loading ? 'Loading…' : 'No meters in this view. Use "Add meter" to register one.'}
              </td></tr>
            )}
            {filtered.map((r) => {
              const tone = TONE[r.chain_status];
              return (
                <tr key={r.id} onClick={() => openDrill(r)} style={{ borderTop: '1px solid #eef1f5', cursor: 'pointer' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.meter_serial}</td>
                  <td style={{ padding: '8px 12px' }}>{r.meter_class}</td>
                  <td style={{ padding: '8px 12px' }}>{r.site_id}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ background: tone.bg, color: tone.fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{tone.label}</span>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: r.sla_breached ? '#9b1f1f' : '#557' }}>{slaText(r.sla_deadline, r.sla_breached)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#fff', borderLeft: '1px solid #e3e7ec', boxShadow: '-4px 0 16px rgba(0,0,0,0.08)', zIndex: 50, padding: 20, overflowY: 'auto' }}>
          <button onClick={() => setDrill(null)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>×</button>
          <h3 style={{ marginTop: 0, fontSize: 17 }}>{drill.meter_serial}</h3>
          <div style={{ fontSize: 12, color: '#557' }}>{drill.id} · {drill.meter_class} · site {drill.site_id}</div>
          <div style={{ marginTop: 12, fontSize: 12 }}>
            State: <strong>{TONE[drill.chain_status].label}</strong>
            {drill.sla_deadline && <> · SLA due <strong>{drill.sla_deadline.slice(0, 10)}</strong></>}
          </div>

          <h4 style={{ marginTop: 18, fontSize: 13, color: '#557' }}>Timeline</h4>
          <div style={{ marginTop: 6, maxHeight: 280, overflowY: 'auto' }}>
            {timeline.length === 0 && <div style={{ fontSize: 12, color: '#7a8a9a' }}>No events recorded.</div>}
            {timeline.map((ev) => (
              <div key={ev.id} style={{ padding: '8px 10px', borderBottom: '1px solid #eef1f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{ev.event_type}</span>
                  <span style={{ fontSize: 10, color: '#7a8a9a' }}>{ev.created_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ACTIONS.filter((a) => a.from.includes(drill.chain_status)).map((a) => (
              <button key={a.action} onClick={() => void act(a.action, drill.id)}
                style={{ padding: '6px 12px', background: a.danger ? '#9b1f1f' : '#1a3a5c', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>{a.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check the SPA**

Run: `npm run check:pages`
Expected: clean.

### Task 4.2: Mount the tab in EsumsOmPage

**Files:**
- Modify: `pages/src/components/pages/EsumsOmPage.tsx`

- [ ] **Step 1: Import and register the tab**

At the top, alongside the existing `import { CommissioningTab } from '../esums/CommissioningTab';`:

```typescript
import { SmartMeterChainTab } from '../esums/SmartMeterChainTab';
```

Add a tab entry to the tabs array, immediately after the `commissioning` entry (the natural neighbour — site onboarding then meter onboarding):

```tsx
{
  key: 'smart_meter',
  label: 'Smart-meter chain',
  endpoint: '',
  description: '12-state P6 smart-meter commissioning & data-quality chain (W199) — ordered → FAT → delivery → installed → commissioning → comms test → data-quality pass → operational, plus fault/replacement/decommission branches. URGENT SLA by class (HV bulk 7d → post-paid 30d). HV-bulk faults and decommissions cross into the regulator inbox.',
  columns: [],
  customContent: <SmartMeterChainTab />,
},
```

- [ ] **Step 2: Type-check the SPA**

Run: `npm run check:pages`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add pages/src/components/esums/SmartMeterChainTab.tsx pages/src/components/pages/EsumsOmPage.tsx
git commit -m "feat(esums): L4 smart-meter commissioning tab (W199 UI) with self-serve add

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 5 — InlineHelp activation + per-surface tours (L3)

**Outcome:** The dormant `InlineHelp` (zero usages today) and per-surface `OnboardingTour` primitives are activated on workstation surfaces, so the platform's depth is explained in-context the first time a user lands on a complex tab. The global tour copy is generalised (no product rename).

### Task 5.1: Generalise the global tour copy

**Files:**
- Modify: `pages/src/App.tsx` (around `GlobalOnboardingTourWrapper`, ~line 1586-1595)

- [ ] **Step 1: Make the welcome step product-agnostic**

Do **not** rename the brand (see Decisions #5). Just make the welcome step less tied to one screen so it reads well for every role. Change the `welcome` step body to point at the new affordances:

```tsx
{ key: 'welcome', title: `Welcome, ${user.email.split('@')[0]}.`, body: 'A couple of things to try first: your setup checklist on the home board, and the "What can I do?" search in any workstation.' },
```

(Keep the existing `title` brand string if the team prefers; the change above only adjusts the personalised greeting + body. If the reviewer flags the brand string, leave it — it is out of scope.)

- [ ] **Step 2: Type-check**

Run: `npm run check:pages`
Expected: clean.

### Task 5.2: Scoped InlineHelp + tours on the chain tabs

**Files:**
- Modify: `pages/src/components/esums/CommissioningTab.tsx`
- Modify: `pages/src/components/esums/SmartMeterChainTab.tsx`
- Modify: `pages/src/components/launch/WorkstationShell.tsx`

- [ ] **Step 1: Add scoped InlineHelp to CommissioningTab**

Import and render an `InlineHelp` just under the `<h2>` heading. It self-hides once dismissed (persisted per user):

```tsx
import { InlineHelp } from '../InlineHelp';
```
```tsx
<InlineHelp helpKey="esums.commissioning.intro" title="How commissioning works">
  Each site moves through fixed stages with an SLA per stage. Click a row to open its timeline and advance it.
  Miss an SLA and the site is flagged to its owner and the regulator.
</InlineHelp>
```

- [ ] **Step 2: Add scoped InlineHelp + a tour to SmartMeterChainTab**

Import `InlineHelp` and `OnboardingTour`. Render the help under the heading, and a 2-step tour scoped to this surface:

```tsx
import { InlineHelp } from '../InlineHelp';
import { OnboardingTour } from '../OnboardingTour';
```
```tsx
<InlineHelp helpKey="esums.smart_meter.intro" title="Commissioning a meter">
  Add a meter with its serial and site, then advance it through FAT, delivery, install, comms test and
  data-quality validation. The class you pick sets the SLA window.
</InlineHelp>
<OnboardingTour
  scope="esums.smart_meter"
  steps={[
    { key: 'add', title: 'Add your first meter', body: 'Use "Add meter" to register a meter against one of your sites.' },
    { key: 'advance', title: 'Advance the chain', body: 'Open any meter to see its timeline and the actions valid from its current state.' },
  ]}
/>
```

- [ ] **Step 3: Host a help region in WorkstationShell (optional, if a slot exists)**

If `WorkstationShell` exposes a per-tab description/header slot, add an optional `helpKey`/`help` prop so any workstation page can pass scoped help without each tab re-importing `InlineHelp`. Keep it backward-compatible (prop optional; existing call sites unchanged). If the shell has no clean slot, skip this step — the per-tab `InlineHelp` from Steps 1-2 is sufficient.

- [ ] **Step 4: Type-check the SPA**

Run: `npm run check:pages`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add pages/src/App.tsx pages/src/components/esums/CommissioningTab.tsx pages/src/components/esums/SmartMeterChainTab.tsx pages/src/components/launch/WorkstationShell.tsx
git commit -m "feat(ux): activate InlineHelp + scoped tours on commissioning + smart-meter surfaces

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 6 — Verification & branch finish

### Task 6.1: Full gates

- [ ] **Step 1: Backend type-check + unit suite**

Run: `npm run check && npm test`
Expected: `check` clean; vitest green (≈7981 — prior 7977 + 4 new provisioning tests). No regressions.

- [ ] **Step 2: SPA type-check**

Run: `npm run check:pages`
Expected: clean.

- [ ] **Step 3: Migration sanity**

Run: `wrangler d1 migrations apply open-energy-db --local` (or `--file migrations/482_onboarding_provisioning_log.sql` if the local ledger is ahead).
Expected: applies; `oe_onboarding_provisioning_log` exists with the unique index.

- [ ] **Step 4: Optional browser smoke (local dev)**

Run (against local dev with the Worker on :8787 and SPA on :3000):
`BASE=http://localhost:3000 npx playwright test tests/browser/esums-owner-launch.spec.ts`
Expected: PASS. Respect the 10/5min login limiter — reuse a cached token.

### Task 6.2: Final review + branch finish

- [ ] **Step 1: Dispatch a final whole-branch code review** (per subagent-driven-development) covering the onboarding range only. Confirm: additive-only schema (482 only), no edits to any `*-chain.ts`/`*-spec.ts`/auth/tenant/locks/OrderBook/matching/wrangler.toml, idempotency holds, no synthetic data, Goldrush untouched, every capability/checklist href resolves.

- [ ] **Step 2: Use superpowers:finishing-a-development-branch** to present the 4 options. Do **not** merge/push/PR autonomously — keep-branch-as-is is the default unless the user chooses otherwise.

---

## Self-review (against the research findings)

- **Rec 1 (wizard provisions real entities, L4):** Phase 1 — `onboarding.completed` rule + migration 482 + idempotency + guided next-step action. ✔
- **Rec 2 (first-run empty-state + setup checklist, L3→L4):** Phase 3 — real-chain-state checklist endpoint + `SetupChecklist` with subtle AI next-step, on both launch shells. ✔
- **Rec 3 (smart-meter onboarding UI, L4):** Phase 4 — `SmartMeterChainTab` twin of `CommissioningTab` + self-serve add, mounted in `EsumsOmPage`. ✔
- **Rec 4 (activate InlineHelp + per-surface tours, L2→L3):** Phase 5 — `InlineHelp` on commissioning + smart-meter, scoped `OnboardingTour`, generalised global copy. ✔
- **Rec 5 (esums_owner routing + capability map, L2→L3):** Phase 2 — `KNOWN_ROLES` fix + capability manifest/endpoint + `CapabilityPalette`. ✔
- **Constraints honoured:** additive-only schema (482 next after 481), Goldrush actuals-only/no synthetic rows, L4 default depth, AI-inline-assist (next-step card, no popups), graphify-first integration through `fireCascade` + commissioning community, no edits to the forbidden W5 perimeter. ✔

## Open questions for the user (non-blocking; sensible defaults taken)

1. **SignatureLaunchBoard for esums_owner?** This plan routes `esums_owner` to the older `LaunchBoardShell`. Promoting it to the signature design system is a separate visual task (gated on the signature KPI endpoint supporting the role).
2. **Brand string "Consolidated Energy Cockpit"** — left as-is (looks deliberate). Say the word if it should become "Open Energy Platform" and that becomes a one-line follow-up.
3. **Capability map coverage** — Phase 2 seeds esums_owner + ipp_developer richly and others minimally. Tell me which roles to flesh out next.
