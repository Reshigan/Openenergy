# Onboarding Multi-Batch Programme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Backend tasks are strict-TDD (test first, watch fail, implement, watch pass, commit). Frontend tasks gate on `npm run check:pages` + a Playwright flow.

**Goal:** Take new-user onboarding from L3 (a wizard that records answers) to L4 (a wizard whose answers provision a real first workspace for every role, plus a working acquisition funnel and a user-facing compliance gate), in three sequenced batches.

**Architecture:** Three additive batches on top of the existing onboarding spine — backend wizard ([src/routes/onboarding.ts](../../../src/routes/onboarding.ts)), provisioning cascade rule ([src/cascade-rules/onboarding-provisioning.ts](../../../src/cascade-rules/onboarding-provisioning.ts)), frontend wizard ([pages/src/components/onboarding/OnboardingWizard.tsx](../../../pages/src/components/onboarding/OnboardingWizard.tsx)), and the RBAC invitation flow ([src/routes/rbac.ts](../../../src/routes/rbac.ts)). No rewrite. Every state change fires through `fireCascade` and writes audit. Batch order: **(1) Activation depth → (2) Acquisition funnel → (3) KYC/compliance gate.**

**Tech Stack:** Cloudflare Worker + Hono + D1 (SQLite) + R2 (evidence vault) + KV + Workers AI binding; React SPA (Vite + Tailwind); vitest (backend), Playwright (browser).

**Migration counter (corrected 2026-06-18):** highest existing is `509` — and `509_onboarding_provisioning_manifest.sql` (the manifest column, Task 1.1) **already landed**. Next free number is `510`. Remaining migrations renumbered: first-entity tables `510` (Task 1.2, only if graphify finds no canonical table), email outbox `511` (Task 2.1), KYC submissions `512` (Task 3.1), market-access flag `513` (Task 3.3). Before writing any migration, run `ls migrations | sort | tail -1` to re-confirm the next free number; renumber upward if other work has landed.

**Role-coverage correction (2026-06-18):** the live wizard's `ONBOARDING_STEPS` has 10 entries (the 9 personas + `admin`) but is **missing `esco` and `epc_contractor`** — both real role values (roleData ROLE_CONFIGS + capability-map). `POST /api/onboarding/step` throws 400 for any role not in `ONBOARDING_STEPS`, so esco/epc users crash on the first wizard step. Provisioning currently covers **3** roles (`esums_owner`, `ipp_developer`, `trader`), not 2. Task 1.0 (new, below) fixes the 400-crash; Task 1.2 expands provisioning. Also add: **B3** first-run per-component intro cards and **B5** sandbox demo tenant (appended after Batch 3).

**Standing constraints (load-bearing — do not violate):**
- Feature-depth: target **L4**. No shallow CRUD tabs.
- AI: inline cards with a "why" + 1-click accept. No AI tabs/popups.
- Tenant: every resource read/write downstream of a participant is tenant-fenced via `resolveTenant` ([src/utils/tenant.ts](../../../src/utils/tenant.ts)). Onboarding provisioning writes into the new participant's own tenant only.
- Idempotency: provisioning uses `oe_onboarding_provisioning_log` UNIQUE(participant_id, kind). Re-running `onboarding.completed` must never double-provision.
- Auth/test discipline: `source scripts/_login.sh; TOK=$(login_or_cached "ipp@openenergy.co.za")` (FULL email). Demo password `Demo@2024!`. JWT roles are suffixed (`ipp→ipp_developer`, `grid→grid_operator`, `carbon→carbon_fund`) — include both forms in role sets. Respect the 10/5min/IP login limiter. Curl prod after first deploy (Hono basePath collisions are silent).
- graphify-first: before adding any new route/chain, `/graphify query "<thing>"`.

---

## File Structure

| File | Batch | Responsibility |
|---|---|---|
| `src/routes/onboarding.ts` | 1 | Task 1.0: add `esco`+`epc_contractor` to `ONBOARDING_STEPS` + generic `['welcome','complete']` fallback so `/step` never 400s. Task 1.3: `/state` returns provisioning manifest + checklist; `/complete` unchanged contract |
| `src/cascade-rules/onboarding-provisioning.ts` | 1 | Expand from **3** roles to all 9 provisioning roles; emit a structured `provisioned` manifest |
| `src/routes/onboarding-checklist.ts` | 1 | **New** — `GET /api/onboarding/checklist/:role` computes getting-started items + completion from real data |
| `migrations/509_onboarding_provisioning_manifest.sql` | 1 | **LANDED** — `manifest` JSON col on `oe_onboarding_provisioning_log` (Task 1.1 done) |
| `migrations/510_onboarding_first_entities.sql` | 1 | **New, conditional** — `CREATE TABLE IF NOT EXISTS` for any first-entity table graphify finds no canonical home for (Task 1.2) |
| `pages/src/meridian/GettingStarted.tsx` | 1 | **Exists, on Horizon** (HorizonPage.tsx:163) — extend with progress + inline AI "next best step" (Task 1.6) |
| `pages/src/lib/uxState.ts` | 1 | `useOnboarding()` reads the wizard track, not the orphaned ux-state track |
| `src/utils/email.ts` | 2 | **New** — single `sendEmail()` seam (MailChannels over `fetch`, dev no-op). **HARD-GATE: live send needs provider sign-off** |
| `src/routes/auth.ts` | 2 | Register + reset + verify call `sendEmail()`; verify token delivered |
| `src/routes/rbac.ts` | 2 | Invitation create fires email; `SELF_REGISTER_ROLES` + org bootstrap |
| `migrations/511_email_outbox.sql` | 2 | `oe_email_outbox` audit table (every send logged) |
| `src/routes/onboarding-kyc.ts` | 3 | **New** — user-facing KYC submission + evidence upload + status read |
| `src/cascade-rules/kyc-gate.ts` | 3 | **New** — `kyc.submitted`/`kyc.decided` cascade → admin inbox + market-access flag |
| `migrations/512_kyc_submission_columns.sql` | 3 | ALTER existing `oe_kyc_submissions` ADD `tenant_id` + `reason_code` (no new table). B6 AEAD-at-rest applied to PII columns via `crypto-aead.ts` |
| `src/utils/crypto-aead.ts` | 3 | **New** — AES-256-GCM field encryption (`v1:<iv>:<ct>`), key from `env.KYC_ENC_KEY` Worker secret; dev/test no-op (plaintext) like the email seam |
| ~~`migrations/513_market_access_flag.sql`~~ | 3 | **DROPPED** — `participant_market_access` (`full_trading\|certificate_only\|read_only`, migration 472) already exists and is the gate |
| `src/utils/pre-trade-guards.ts` | 3 | Add `marketAccessGuard` to the order-rejection composition |
| `pages/src/components/onboarding/KycSubmission.tsx` | 3 | **New** — evidence upload UI + status timeline |

---

# BATCH 1 — Activation Depth

**Why first:** the wizard already collects answers but only `esums_owner`, `ipp_developer`, and `trader` get a provisioned entity; the other 6 roles land on an empty board. And the frontend `useOnboarding()` hook reads `oe_onboarding_state` (072), a *different* track from the wizard's `participants.onboarding_*` (378) — so launch-board checklists never reflect wizard progress. Batch 1 makes "finish the wizard → see a populated, explained workspace" true for all 9 roles, from one source of truth.

**Batch 1 done when:** completing the wizard as any of the 9 non-admin roles provisions ≥1 real first entity in that user's tenant; `/api/onboarding/state` returns a manifest of what was created; the launch board shows a Getting-Started card whose progress is computed from real data; the dual-tracking disconnect is gone; and **no role 400-crashes on `POST /step`** (Task 1.0).

---

### Task 1.0: Fix the `POST /step` 400-crash for unconfigured roles (esco / epc_contractor)

**Files:**
- Modify: `src/routes/onboarding.ts` (`ONBOARDING_STEPS` map lines 24-35; `POST /step` lines 115-117)
- Test: `tests/onboarding-routes.test.ts` (create if absent)

`ONBOARDING_STEPS` has 10 entries (9 personas + `admin`) but is missing `esco` and `epc_contractor` — both real role values (roleData ROLE_CONFIGS lines 1009/1016 + capability-map lines 280/303). `POST /api/onboarding/step` looks up `ONBOARDING_STEPS[user.role]` and throws `VALIDATION_ERROR` 400 (`No onboarding steps configured for role: ${user.role}`) for any role not in the map — so esco/epc users crash on the first wizard step. (`/state`, `/complete`, `/skip` tolerate it; only `/step` crashes.)

- [ ] **Step 1: Failing test** — `POST /api/onboarding/step` as an `esco` token (step `welcome`) currently returns 400; assert it returns 200 and persists the step. Add a second case for `epc_contractor`. Add a third asserting a genuinely-unknown role still does not 500 (falls back to the generic step list, not a throw).

- [ ] **Step 2: Run — FAIL** (400 for esco/epc).
Run: `npx vitest run tests/onboarding-routes.test.ts -t "step"`

- [ ] **Step 3: Implement** — add `esco` and `epc_contractor` entries to `ONBOARDING_STEPS` (give them role-appropriate steps, e.g. `['welcome','org_profile','sites','complete']` for esco, `['welcome','org_profile','project_scope','complete']` for epc_contractor — match the existing entry shape), AND replace the hard 400 at lines 115-117 with a generic fallback: `const steps = ONBOARDING_STEPS[user.role] ?? ['welcome','complete'];` so an unconfigured role degrades gracefully instead of crashing. Keep the existing "step not in this role's list" rejection (it now validates against the fallback list too).

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit.**
```bash
git add src/routes/onboarding.ts tests/onboarding-routes.test.ts
git commit -m "fix(onboarding): esco/epc_contractor steps + generic fallback so /step never 400s"
```

---

### Task 1.1: Provisioning manifest column — **ALREADY LANDED (2026-06-18)**

> **Status: DONE.** The manifest column shipped as `migrations/509_onboarding_provisioning_manifest.sql` (`ALTER TABLE oe_onboarding_provisioning_log ADD COLUMN manifest TEXT DEFAULT '{}';`). On prod it applies via the deploy.yml column-reconcile band; on fresh/local + vitest `createTestDb` it lands as migration 509. The manifest-shape test below is folded into Task 1.2 (it stays red until 1.2 writes the manifest). The original Task 1.1 steps are retained for reference only — do not re-create migration 508.

**Files:**
- Create: `migrations/508_onboarding_provisioning_manifest.sql`
- Test: `tests/onboarding-provisioning.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** — assert the cascade rule writes a `manifest` row describing what it created.

```ts
// tests/onboarding-provisioning.test.ts — add to the existing describe block
it('records a structured manifest of provisioned entities', async () => {
  await runProvisioning(env, {
    event: 'onboarding.completed', actor_id: 'par_ipp1', entity_type: 'participants',
    entity_id: 'par_ipp1', data: { role: 'ipp_developer', installed_capacity_mw: 75, technology: 'solar_pv' },
  });
  const log = db.prepare(
    `SELECT kind, manifest FROM oe_onboarding_provisioning_log WHERE participant_id = 'par_ipp1'`,
  ).get() as any;
  expect(log.kind).toBe('ipp_project');
  const m = JSON.parse(log.manifest);
  expect(m.entities[0]).toMatchObject({ entity_type: 'ipp_projects', label: expect.any(String), href: expect.stringContaining('/projects/') });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`no such column: manifest`).

Run: `npx vitest run tests/onboarding-provisioning.test.ts -t "manifest"`
Expected: FAIL.

- [ ] **Step 3: Write the migration.**

```sql
-- 508_onboarding_provisioning_manifest.sql
-- L4 activation: record WHAT each onboarding provisioning step created so the
-- wizard completion screen + launch board can surface it ("we set up X for you").
ALTER TABLE oe_onboarding_provisioning_log ADD COLUMN manifest TEXT DEFAULT '{}';
```

- [ ] **Step 4: Apply locally + re-run test.**

Run: `wrangler d1 migrations apply open-energy-db --local && npx vitest run tests/onboarding-provisioning.test.ts -t "manifest"`
Expected: still FAIL until 1.2 writes the manifest. (This task only lands the column; the test stays red until 1.2. If splitting feels wrong, fold 1.1+1.2 into one commit.)

- [ ] **Step 5: Commit.**

```bash
git add migrations/508_onboarding_provisioning_manifest.sql tests/onboarding-provisioning.test.ts
git commit -m "feat(onboarding): provisioning manifest column (test + migration)"
```

---

### Task 1.2: Seed offtaker first entity + confirm every role lands non-empty (graphify-resolved)

**Files:**
- Modify: `src/cascade-rules/onboarding-provisioning.ts`
- Modify: `src/cascade-rules/onboarding-manifest.ts` (offtaker `roleActions` deep-link)
- Test: `tests/onboarding-provisioning.test.ts`

**Graphify-first resolution (2026-06-18) — supersedes the original "9 new tables" table.** Ran the discovery the plan mandated. Result: **no new `oe_*` tables, no migration 510.** Every role the plan wanted to give a new table already has a canonical node, and the plan's proposed tables (`oe_trader_entities`, `oe_lender_funds`, `oe_offtaker_profiles`, `oe_carbon_registry_links`, `oe_grid_authorities`, `oe_regulator_bodies`, `oe_support_orgs`) would have **duplicated existing nodes** — forbidden by the graphify-first rule. Findings:

| role | plan's table | graphify finding | decision |
|---|---|---|---|
| `esums_owner` | `om_sites` | exists (`058_esums_om.sql`) | **seed** (unchanged) |
| `ipp_developer` | `ipp_projects` | exists (`002_domain.sql`) | **seed** (unchanged) |
| `trader` | `oe_trader_entities` (new) | canonical = `oe_position_limits` (`062`) — already seeded; new table duplicates | **keep `oe_position_limits`** (unchanged); plan's `oe_trader_entities` rejected |
| `offtaker` | `oe_offtaker_profiles` (new) | canonical = `off_ppa_portfolio` — owned operating object, **not** a Meridian chain | **seed `off_ppa_portfolio`** (NEW work — the one genuine win) |
| `lender` | `oe_lender_funds` (new) | wizard collects fund-level profile data; `loan_facilities` is facility-level + fronted by W53 origination chain | **manifest-only** (regulated/no clean seed) |
| `carbon_fund` | `oe_carbon_registry_links` (new) | `carbon_projects` exists but project registration is regulated chain W37 (`oe_carbon_registration`) | **manifest-only** (would pre-empt regulated registration) |
| `grid_operator` | `oe_grid_authorities` (new) | oversight role; owns no draft operating object | **manifest-only** |
| `regulator` | `oe_regulator_bodies` (new) | `regulatory_bodies` is reference data, not per-participant; oversight role | **manifest-only** |
| `support` | `oe_support_orgs` (new) | reactive role; real artifacts are tickets/work-orders (chain cases) | **manifest-only** |

This keeps the module's existing, sound seed-vs-manifest rationale (seed a row ONLY for a persistent OPERATING object the participant owns and the wizard populated; regulated chain cases + oversight roles get a manifest only) and **extends the seed set from 3 → 4** by adding offtaker, whose `off_ppa_portfolio` is exactly such an owned operating object and directly serves the documented offtaker procurement pattern. All 9 roles already produce a complete, role-tailored manifest (`buildOnboardingManifest` handles every role; `baseActions` routes are all universally valid → no dead links).

`off_ppa_portfolio` schema (bind these): `id` PK, `participant_id` NOT NULL, `tenant_id` NOT NULL default `'default'`, `counterparty_name` NOT NULL, `technology`, `capacity_mw`, `status` CHECK in (`negotiating`,`signed`,`active`,`expired`,`terminated`), `created_at` default. Seed a **draft procurement-intent** row: `counterparty_name='To be selected'`, `technology` from `data.preferred_technology` (fallback `'solar_pv'`), `capacity_mw` derived from `data.peak_demand_mw` (else null), `status='negotiating'`, `tenant_id` resolved from the participant row.

- [ ] **Step 1: Write failing tests** in `tests/onboarding-provisioning.test.ts`. Use the same harness style as `tests/onboarding-routes.test.ts` (`createTestDb({applyMigrations:true})`, drive the cascade via the registered rule). Assert:
  - **offtaker (new):** after `onboarding.completed` fires for an offtaker participant, exactly **one** `off_ppa_portfolio` row exists for that participant, scoped to the participant's `tenant_id`, `status='negotiating'`; the log row has `kind='ppa_portfolio'` and `JSON.parse(manifest).next_actions.length > 0`; re-firing the cascade creates **no** second row (idempotent via `alreadyProvisioned`).
  - **manifest-only roles (lender, carbon_fund, grid_operator, regulator, support):** after the cascade, **no** domain row is fabricated, the log row has `kind='manifest'`, and `JSON.parse(manifest).next_actions.length > 0` (every role lands non-empty).

- [ ] **Step 2: Run — expect FAIL** (offtaker currently falls through to manifest-only, so no `off_ppa_portfolio` row + log kind is `manifest` not `ppa_portfolio`).
Run: `npx vitest run tests/onboarding-provisioning.test.ts`

- [ ] **Step 3: Implement.** Add an `else if (role === 'offtaker')` branch to `onboarding-provisioning.ts` that resolves `tenant_id` from the participant row (default `'default'`), INSERTs the draft `off_ppa_portfolio` row described above, and sets `ref = { kind: 'ppa_portfolio', entityType: 'off_ppa_portfolio', entityId: <id>, detail: {...} }`. Keep the `alreadyProvisioned()` guard and the existing 3 branches untouched. Update the module doc comment to record that offtaker now seeds and WHY the other 5 stay manifest-only (cite graphify resolution). In `onboarding-manifest.ts`, add an offtaker entry to `roleActions` with a universally-valid route (`/horizon`, label "Review your procurement portfolio") so the card reads bespoke without risking a dead link (`off_ppa_portfolio` is not a Meridian chain route).

- [ ] **Step 4: Run — expect PASS** (offtaker seeds; manifest-only roles unchanged; idempotency holds). Then `npm run check`.
Run: `npx vitest run tests/onboarding-provisioning.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add src/cascade-rules/onboarding-provisioning.ts src/cascade-rules/onboarding-manifest.ts tests/onboarding-provisioning.test.ts
git commit -m "feat(onboarding): seed offtaker procurement-intent first entity; confirm all 9 roles land non-empty"
```
No migration: graphify confirmed every role maps to an existing canonical table.

---

### Task 1.3: `/state` returns the provisioning manifest

**Files:**
- Modify: `src/routes/onboarding.ts` (GET `/state`)
- Test: `tests/onboarding-routes.test.ts` (create if absent)

- [ ] **Step 1: Failing test** — after a completed onboarding, `GET /api/onboarding/state` includes `provisioned: { kind, entities:[{label,href}] }` read from the log.

- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/onboarding-routes.test.ts -t "state.*provisioned"`

- [ ] **Step 3: Implement** — in `/state`, after the participant read, `SELECT kind, manifest FROM oe_onboarding_provisioning_log WHERE participant_id = ?`; parse manifest; attach `provisioned`. Null-safe (returns `{kind:'none',entities:[]}` if no row).

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit.**
```bash
git commit -am "feat(onboarding): surface provisioning manifest on /state"
```

---

### Task 1.4: Getting-started checklist endpoint

**Files:**
- Create: `src/routes/onboarding-checklist.ts`
- Modify: `src/routes/mount-routes.ts` (mount `/api/onboarding` — same router or sibling; confirm no basePath collision with existing `/api/onboarding`)
- Test: `tests/onboarding-checklist.test.ts`

The checklist is the L4 hook: per-role items, each with a `done` flag **computed from real data** (not a tick table), so it stays honest as the user works. Example item shapes: `{ key:'first_project', label:'Register your first project', done: <count(ipp_projects)>0>, href:'/ipp-lifecycle/workstation?tab=...' }`.

- [ ] **Step 1: Failing test** — `GET /api/onboarding/checklist/ipp_developer` (as an ipp token) returns ≥3 items, `first_project.done===true` after a project exists, and `progress` = done/total.

- [ ] **Step 2: Run — FAIL** (404 / route absent).

- [ ] **Step 3: Implement** a static per-role checklist definition (role → items with a `probe` SQL count). `:role` is validated against the in-code role list and used only to pick the static definition — never as a SQL identifier. Compute `done` per item via the probe scoped to `participant_id`/tenant. Mount under `authMiddleware`.

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Commit.**
```bash
git add src/routes/onboarding-checklist.ts src/routes/mount-routes.ts tests/onboarding-checklist.test.ts
git commit -m "feat(onboarding): data-computed getting-started checklist endpoint"
```

---

### Task 1.5: Inline AI "next best step" on the checklist

**Files:**
- Modify: `src/routes/onboarding-checklist.ts`
- Test: `tests/onboarding-checklist.test.ts`

Per the AI rule (inline, "why" + 1-click accept). Add `next_best_step: { item_key, why, action_href }` to the checklist response — the first incomplete item, with a one-line rationale from `ask()` ([src/utils/ai.ts](../../../src/utils/ai.ts)), falling back to a static rationale string when the AI binding is unavailable (tests run without it).

- [ ] **Step 1: Failing test** — response includes `next_best_step.item_key` = first incomplete item; `why` is a non-empty string; when all done, `next_best_step` is `null`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — pick first `!done` item; build `why` via `ask()` with a try/catch static fallback (never throw onboarding on an AI failure).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `git commit -am "feat(onboarding): inline AI next-best-step on checklist"`

---

### Task 1.6: Launch-board Getting-Started card

**Files:**
- Create: `pages/src/components/launch/GettingStarted.tsx`
- Modify: the role launch-board shell (confirm current home component via `grep -rl "launch/:role" pages/src` — render the card on each `/launch/:role` board)
- Test: `pages/tests/browser/onboarding-activation.spec.ts`

UI rules (ui-ux-pro-max + emil): card only if it communicates real hierarchy; progress as a tabular fraction + a thin bar (animate `transform: scaleX` 200ms ease-out, not width); each item is a row with a state-distinct check; one primary CTA = the AI next-best-step (`scale(0.97)` on `:active`); respect `prefers-reduced-motion`; contrast AA. Reads `GET /api/onboarding/checklist/:role`. The AI next-best-step renders as an inline card with its `why` + a single "Do this" button (1-click accept → navigate to `action_href`).

- [ ] **Step 1: Write the Playwright flow** — log in as ipp (seed token via `addInitScript`), land on `/launch/ipp_developer`, assert the Getting-Started card renders with a progress fraction and the AI next-best-step button; click it → URL changes to the item's `href`. (Pattern: [tests/browser/ipp-annual-compliance-assessment.spec.ts](../../../tests/browser/ipp-annual-compliance-assessment.spec.ts).)
- [ ] **Step 2: Run — FAIL** (component absent). `BASE=http://localhost:8787 npm run test:browser -- onboarding-activation`
- [ ] **Step 3: Build `GettingStarted.tsx`** + render it on the launch board.
- [ ] **Step 4: Gate** — `npm run check:pages` (0 errors) then re-run the spec → PASS.
- [ ] **Step 5: Commit.**
```bash
git add pages/src/components/launch/GettingStarted.tsx pages/tests/browser/onboarding-activation.spec.ts
git commit -m "feat(onboarding): launch-board getting-started card w/ inline AI next step"
```

---

### Task 1.7: Unify the dual onboarding track (one source of truth)

**Files:**
- Modify: `pages/src/lib/uxState.ts` (`useOnboarding`)
- Verify/Deprecate: `src/routes/ux-state.ts` onboarding endpoints
- Test: `pages/tests/browser/onboarding-activation.spec.ts` (extend)

`useOnboarding()` currently calls the ux-state track (`/ux-state/onboarding`, table `oe_onboarding_state`), which is disjoint from the wizard's `participants.onboarding_*`. Repoint the hook at the wizard track (`GET /api/onboarding/state` for completion + `GET /api/onboarding/checklist/:role` for step ticks) so the launch board reflects actual wizard progress. Leave the ux-state `oe_onboarding_state` endpoints in place but stop new reads/writes from the onboarding surface (they remain for generic first-run UI dismissals). Add a code comment in `ux-state.ts` marking the onboarding endpoints as superseded by `/api/onboarding/*` for the wizard track.

- [ ] **Step 1: Extend the spec** — after wizard completion the board shows progress > 0 sourced from `/api/onboarding/checklist`; assert no call to `/ux-state/onboarding` fires from the board (intercept and assert not-called).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Repoint `useOnboarding`.**
- [ ] **Step 4: `npm run check:pages` + spec → PASS.**
- [ ] **Step 5: Commit.** `git commit -am "fix(onboarding): unify wizard + launch-board onto one onboarding track"`

**Batch 1 verification (run before moving to Batch 2):**
```bash
npm test                                   # full vitest green
npm run check && npm run check:pages       # 0 TS errors both sides
BASE=http://localhost:8787 npm run test:browser -- onboarding-activation
```

---

# BATCH 2 — Acquisition Funnel

**Why second:** activation is worthless if accounts can't actually be created and verified. The invitation flow exists ([src/routes/rbac.ts](../../../src/routes/rbac.ts): invite→token→accept→auto-approve, +442 project/deal context) and `auth.register` mints an email-verification token — **but no email is ever sent** (`notifications.email_sent` is always 0; there is no EMAIL binding and no `sendEmail` seam). So verification links, invitation links, and password resets are dead ends in production. Batch 2 lands a real email seam, wires it into register/verify/reset/invite, and adds self-service org bootstrap so a brand-new company (not just an invitee) can onboard.

**Batch 2 done when:** registering fires a delivered verification email; clicking the link verifies and routes into the wizard; creating an invitation emails the invitee a working accept link; password reset emails a working token; and a self-registering primary user bootstraps a new org/tenant. Every send is logged to an outbox table for audit.

---

### Task 2.1: Email outbox table + `sendEmail()` seam

**Files:**
- Create: `migrations/511_email_outbox.sql`, `src/utils/email.ts`
- Modify: `src/utils/types.ts` (optional `EMAIL_*` env), `wrangler.toml` (vars)
- Test: `tests/email.test.ts`

> **HARD-GATE (B7):** live email delivery via MailChannels needs provider confirmation + sign-off before wiring live send. The dev no-op seam + `oe_email_outbox` ARE buildable now; the `fetch`→MailChannels live path stays behind `env.ENVIRONMENT === 'production' && env.EMAIL_FROM` and is NOT enabled without approval.

`sendEmail()` is the single seam: in production it POSTs via MailChannels over `fetch` (no SDK, Worker-native); in dev/test it is a no-op that still writes the outbox row. Every send writes `oe_email_outbox` (id, to, template, payload JSON, status, error, created_at) so delivery is auditable and testable without a live provider.

- [ ] **Step 1: Failing test** — `sendEmail(env,{to,template:'verify',data:{token}})` writes an `oe_email_outbox` row with status `queued`→`sent` (dev no-op marks `sent`), and returns `{id}`. On `fetch` throw it records `status:'failed'` + error and does **not** throw.
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/email.test.ts`
- [ ] **Step 3: Migration 511** (`oe_email_outbox`) + implement `sendEmail()` with templates map (`verify`, `reset`, `invite`, `kyc_decision`). Gate live send on `env.ENVIRONMENT === 'production' && env.EMAIL_FROM` (live path stays dark until B7 sign-off).
- [ ] **Step 4: Run — PASS** (+ `wrangler d1 migrations apply --local`).
- [ ] **Step 5: Commit.**
```bash
git add migrations/511_email_outbox.sql src/utils/email.ts src/utils/types.ts tests/email.test.ts
git commit -m "feat(auth): email outbox + sendEmail() seam (MailChannels, dev no-op)"
```

---

### Task 2.2: Deliver the verification email on register

**Files:**
- Modify: `src/routes/auth.ts` (`POST /register`, and the verify-consume handler)
- Test: `tests/auth-register.test.ts`

- [ ] **Step 1: Failing test** — `POST /auth/register` writes an `oe_email_outbox` row with `template:'verify'` carrying the token from `createEmailVerificationToken`. Consuming the token flips `email_verified=1` and `status` from `pending`→ (stays pending until KYC in Batch 3; for now → `active` to preserve current login behaviour). Assert the token is **not** returned in the register response body (current contract).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — capture the token return from `createEmailVerificationToken`, `await sendEmail(env,{to:email,template:'verify',data:{token,name}})`. Keep the response body unchanged.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `git commit -am "feat(auth): deliver email-verification link on register"`

---

### Task 2.3: Invitation + password-reset emails

**Files:**
- Modify: `src/routes/rbac.ts` (`POST /me/invitations`), `src/routes/auth.ts` (forgot-password)
- Test: `tests/rbac-invitations.test.ts`, `tests/auth-reset.test.ts`

- [ ] **Step 1: Failing tests** — creating an invitation writes an `oe_email_outbox` row `template:'invite'` with the invite token + accept URL; `POST /auth/forgot-password` writes `template:'reset'` with the reset token. Reset/invite tokens still never appear in response bodies.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** both `sendEmail` calls.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `git commit -am "feat(auth): email invitation + password-reset links"`

---

### Task 2.4: Self-service org / tenant bootstrap

**Files:**
- Modify: `src/routes/rbac.ts` (self-register path), `src/utils/tenant.ts`
- Test: `tests/rbac-self-register.test.ts`

Today self-register (no invitation) is allowed only for `SELF_REGISTER_ROLES` and lands in the `'default'` tenant. For an L4 funnel, a primary self-registering user for a new company should bootstrap a **new tenant** keyed off `company_name`/`reg_number`, becoming its first admin-of-tenant. Invitee registrations continue to inherit the inviter's tenant (unchanged).

- [ ] **Step 1: Failing test** — self-register with a new `company_name` + no invitation creates a distinct `tenant_id` (not `'default'`) and the participant is its first member; a second self-register with the same `reg_number` joins the same tenant rather than creating a duplicate.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** — `resolveOrCreateTenant(env, {company_name, reg_number})` in `tenant.ts` (deterministic id from `reg_number` when present); wire into the self-register branch only. Tenant-fence everything downstream as today.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `git commit -am "feat(onboarding): self-service org/tenant bootstrap on self-register"`

**Batch 2 verification:**
```bash
npm test
npm run check
# Manual prod-after-deploy: register a throwaway account, confirm an oe_email_outbox row + 'sent' status.
```

---

# BATCH 3 — KYC / Compliance Gate

**Why third:** activation + acquisition can run before compliance, but market actions (placing orders, accepting deals) must not. An admin-side KYC review state machine already exists ([src/routes/admin.ts](../../../src/routes/admin.ts): `/admin/kyc`, `/admin/kyc/:id`, pending→in_review→approved→rejected, approve→active, audit + notification). What's missing is the **user-facing half**: a way for a participant to *submit* KYC with evidence, see status, and — critically — a **market-access gate** so unverified accounts can browse but not transact. Batch 3 closes the loop into a real L4/L5 compliance gate.

**Batch 3 done when:** a user can submit a KYC pack with document evidence (R2-backed, AEAD-at-rest); submission fires a cascade into the existing admin review queue and flips `participants.kyc_status='in_review'`; admin decisions flow back to the user (reusing the existing `/admin/kyc/:id` machine); the existing `participant_market_access` flag is driven by the decision; and trading/deal endpoints reject actors without market access with a structured reason code.

> **RE-SCOPE (approved 2026-06-14 "deepen existing infra"):** Batch 3 does NOT build a parallel KYC stack. The live platform already has: per-document `oe_kyc_submissions` (migration 060), the deep-KYC engine `kyc-deep.ts`, the admin inbox `admin.get/put('/kyc'...)`, `participants.kyc_status` (migration 001), the `participant_market_access` flag (`full_trading|certificate_only|read_only`, migration 472), and the `certOnlyGuard` middleware (`src/middleware/cert-only.ts`). Batch 3 DEEPENS these. No new case table, no `oe_kyc_evidence`, no `market_access INTEGER`, no new admin inbox.

---

### Task 3.1: KYC submission column extension + AEAD crypto helper (B6)

**Files:**
- Create: `migrations/511_kyc_submission_columns.sql`
- Create: `src/utils/crypto-aead.ts`
- Test: `tests/crypto-aead.test.ts`

> **B6 (signed off 2026-06-14): Hybrid AEAD + R2 default.** D1 PII columns (`file_name`, reason-bearing PII) are encrypted app-side with AES-256-GCM via WebCrypto, key from a versioned Worker secret (`KYC_ENC_KEY`), ciphertext stored as `v1:<iv>:<ct>`. Evidence blobs rely on R2 default at-rest encryption + tenant-fenced key paths + access audit. The helper is dark-by-default like the email seam: live AEAD only when the secret is configured; dev/test stores plaintext, and the version-prefix dispatch handles both on read. Do NOT add `KYC_ENC_KEY` to wrangler.toml (it is a `wrangler secret`).

- [ ] **Step 1:** Write `511_kyc_submission_columns.sql` (ALTER the EXISTING table, no new tables):
```sql
-- 511_kyc_submission_columns.sql — extend existing per-document oe_kyc_submissions (migration 060)
-- with a tenant fence + a structured decision reason. Idempotent: deploy.yml column-reconcile
-- band treats "duplicate column name" as a benign already-applied signal.
ALTER TABLE oe_kyc_submissions ADD COLUMN tenant_id TEXT;
ALTER TABLE oe_kyc_submissions ADD COLUMN reason_code TEXT;
CREATE INDEX IF NOT EXISTS idx_kyc_sub_tenant ON oe_kyc_submissions(tenant_id);
```
- [ ] **Step 2: Failing test** `tests/crypto-aead.test.ts` — `encryptField`/`decryptField` round-trip a string when `env.KYC_ENC_KEY` is set (output starts `v1:`, differs from plaintext, decrypts back); with the key UNSET the helper is a no-op (stores plaintext, `decryptField` returns a plaintext value unchanged); `decryptField` of a `v1:`-prefixed value still decrypts after the key is configured. Bad/garbled ciphertext fails closed (throws or returns null per the helper contract) rather than leaking.
- [ ] **Step 3: Run — FAIL.** `npx vitest run tests/crypto-aead.test.ts`
- [ ] **Step 4: Implement `src/utils/crypto-aead.ts`** — `encryptField(env, plaintext): Promise<string>` returns `v1:<base64 iv>:<base64 ct>` via `crypto.subtle` AES-256-GCM with a 96-bit random IV when `env.KYC_ENC_KEY` is set, else returns plaintext unchanged. `decryptField(env, stored): Promise<string>` dispatches on the `v1:` prefix (decrypt) vs no prefix (return as-is). Key import from the secret (base64 32-byte). Every SQL/identifier rule still holds: this helper only transforms VALUES that bind to `?`.
- [ ] **Step 5: Run — PASS.** Then `wrangler d1 migrations apply open-energy-db --local`.
- [ ] **Step 6: Commit.**
```bash
git add migrations/511_kyc_submission_columns.sql src/utils/crypto-aead.ts tests/crypto-aead.test.ts
git commit -m "feat(kyc): tenant_id+reason_code columns + AEAD field-encryption helper (B6)"
```

---

### Task 3.2: KYC submission route (+ evidence upload to R2, on the EXISTING table)

**Files:**
- Create: `src/routes/onboarding-kyc.ts`
- Modify: `src/routes/mount-routes.ts` (mount `/api/onboarding/kyc`)
- Test: `tests/onboarding-kyc.test.ts`

Endpoints (all `authMiddleware`, tenant-fenced to the caller). These write the EXISTING per-document `oe_kyc_submissions` rows (one row per uploaded document), NOT a new case table:
- `GET /api/onboarding/kyc` — caller's `kyc_status` + their `oe_kyc_submissions` rows (file_name decrypted via `decryptField`), grouped by `document_type`.
- `POST /api/onboarding/kyc/evidence` — stores the file in R2 under `kyc/<tenant>/<participant>/<id>`, INSERTs an `oe_kyc_submissions` row with `tenant_id` + AEAD-encrypted `file_name`. `document_type` validated against the EXISTING allow-list (`id_document | proof_of_address | company_registration | tax_clearance | bank_confirmation | nersa_licence`).
- `POST /api/onboarding/kyc/submit` — flips `participants.kyc_status='in_review'` for the caller + fires the `kyc.submitted` cascade.

- [ ] **Step 1: Failing tests** — evidence POST writes an R2 object + an `oe_kyc_submissions` row scoped to the caller's `participant_id`/`tenant_id` with an AEAD-shaped `file_name` (when key set); submit POST flips the caller's `kyc_status` to `in_review` + fires `kyc.submitted`; a second participant cannot read the first's submissions (tenant/owner fence); an invalid `document_type` is rejected (400) before any R2 write.
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/onboarding-kyc.test.ts`
- [ ] **Step 3: Implement** the route; use the R2 binding from `c.env`. `document_type` is a bound value validated against the static allow-list — never a path/SQL identifier (the R2 key path is built from validated ids only). Encrypt `file_name` via `encryptField`; decrypt on GET.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**
```bash
git add src/routes/onboarding-kyc.ts src/routes/mount-routes.ts tests/onboarding-kyc.test.ts
git commit -m "feat(kyc): user submission + R2 evidence upload on existing oe_kyc_submissions"
```

---

### Task 3.3: KYC gate cascade — submission → admin inbox; decision → market access

**Files:**
- Create: `src/cascade-rules/kyc-gate.ts`
- Modify: `src/routes/admin.ts` (`PUT /admin/kyc/:id` decision ALSO drives `participant_market_access` + stores `reason_code` + fires `kyc.decided`)
- Test: `tests/kyc-gate.test.ts`

No migration here: `participant_market_access` already exists (migration 472) and `reason_code` lands in Task 3.1.

- [ ] **Step 1: Failing tests** — `kyc.submitted` cascade surfaces the participant in the existing admin KYC queue; an admin `approved` decision sets `participant_market_access='full_trading'` and fires `kyc.decided`; a `rejected`/`in_review` decision leaves access at `read_only` (or unchanged) and notifies the user with a structured `reason_code`. Re-fire is idempotent. The existing audit_log + notification writes still fire.
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/kyc-gate.test.ts`
- [ ] **Step 3: Implement** `kyc-gate.ts` (register via `registerCascadeRule`); extend the admin decision handler so approve → `participant_market_access='full_trading'`, reject/info → `participant_market_access='read_only'`, persisting `reason_code` and firing `kyc.decided`. Reuse the existing audit + notification writes (do NOT duplicate them).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**
```bash
git add src/cascade-rules/kyc-gate.ts src/routes/admin.ts tests/kyc-gate.test.ts
git commit -m "feat(kyc): submission->admin inbox + decision->participant_market_access cascade"
```

---

### Task 3.4: Market-access pre-trade guard

**Files:**
- Modify: `src/utils/pre-trade-guards.ts`
- Test: `tests/pre-trade-guards.test.ts`

Add `marketAccessGuard` to the existing order-rejection composition (alongside credit/exposure/mark-age/halt/kyc), keyed on `participant_market_access`. Reject orders + deal accepts from actors whose access is `read_only` (or unverified), with a structured reason code (e.g. `MARKET_ACCESS_REQUIRED`) explained via the existing `explainRejection` ([src/utils/rejection-explainer.ts](../../../src/utils/)). This complements the route-level `certOnlyGuard` (which fences `certificate_only`); the pre-trade guard is the order-engine line of defence.

- [ ] **Step 1: Failing test** — an order from a `read_only` participant is rejected with `reason_code:'MARKET_ACCESS_REQUIRED'`; a `full_trading` participant passes the guard. Confirm the guard composes (doesn't short-circuit the others).
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/pre-trade-guards.test.ts -t "market access"`
- [ ] **Step 3: Implement** the guard + register it in the composition.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `git commit -am "feat(kyc): market-access pre-trade guard w/ structured reason code"`

---

### Task 3.5: KYC submission UI + status timeline

**Files:**
- Create: `pages/src/components/onboarding/KycSubmission.tsx`
- Modify: launch-board / Getting-Started (surface a "Verify your account" item when `kyc_status !== 'approved'`)
- Test: `pages/tests/browser/onboarding-kyc.spec.ts`

UI rules: evidence upload with per-doc-type slots (label above, helper text, error below; drag threshold; progress on upload — skeleton not spinner if >300ms); a status timeline (pending → in_review → approved/rejected) driven by `participants.kyc_status`, with state-distinct steps; one primary CTA. When `kyc_status !== 'approved'`, the Getting-Started card shows a "Verify to start transacting" item linking here. Reads `GET /api/onboarding/kyc`; uploads `POST /api/onboarding/kyc/evidence`; submits `POST /api/onboarding/kyc/submit`.

- [ ] **Step 1: Playwright flow** — log in as a freshly-seeded unverified persona, open the KYC surface, attach one evidence file (use a small fixture + intercept the R2-backed evidence POST → 201), submit, assert status shows `in_review`. Assert the Getting-Started "Verify your account" item is present while `kyc_status !== 'approved'`.
- [ ] **Step 2: Run — FAIL.** `BASE=http://localhost:8787 npm run test:browser -- onboarding-kyc`
- [ ] **Step 3: Build `KycSubmission.tsx`** + the launch-board item.
- [ ] **Step 4: `npm run check:pages` + spec → PASS.**
- [ ] **Step 5: Commit.**
```bash
git add pages/src/components/onboarding/KycSubmission.tsx pages/tests/browser/onboarding-kyc.spec.ts
git commit -m "feat(kyc): user submission UI + status timeline + verify-to-transact gate"
```

**Batch 3 verification:**
```bash
npm test && npm run check && npm run check:pages
BASE=http://localhost:8787 npm run test:browser -- onboarding-kyc
# Manual: submit KYC as a test user → appears in /admin/kyc → approve → participant_market_access flips to full_trading → order accepted.
```

---

# BATCH 4 — Guided Tour & Sandbox

**Why fourth:** Batches 1-3 make onboarding *provision* and *gate* correctly, but the user's intent is a "full digital onboard, and guide through the system, as well as the use of the features." A populated workspace still needs a guided walkthrough of the surfaces (Horizon / Atlas / Ledger / Thread / Deal Desk) and a safe place to practise transactions. Batch 4 adds first-run per-component intro cards (the guided tour) and an isolated sandbox demo tenant so new users can exercise features without touching real tenant data.

**Batch 4 done when:** a first-run user gets a dismissible, sequenced set of inline intro cards anchored to each Meridian surface (no modal takeover, respects `prefers-reduced-motion`), tracked per-user so they show once; and a sandbox toggle lets a user practise initiating a chain/deal against a clearly-isolated demo tenant that never writes synthetic data into a real tenant.

---

### Task 4.1 (B3): First-run per-component intro cards (guided tour)

**Files:**
- Create: `pages/src/meridian/GuidedTour.tsx` (sequenced inline anchored cards), `pages/src/meridian/useTourState.ts`
- Modify: `src/routes/onboarding.ts` (add `GET|POST /api/onboarding/tour` — per-user seen-step ledger) or reuse the generic `oe_onboarding_state` ux-state track for dismissals (decide at execution; the ux-state track is the right home for first-run UI dismissals per Task 1.7)
- Test: `pages/tests/browser/onboarding-tour.spec.ts`

The tour is NOT an AI popup and NOT a modal wizard. Each surface (`/horizon`, `/atlas`, `/ledger/:chainKey`, `/thread/...`, `/deals`) shows one inline anchored card on first visit explaining what the surface does + the single next action, with "Got it" (dismiss) and "Skip tour". Seen-state persisted per user so each card shows once. AA contrast, `scale(0.97)` active feedback, honour `prefers-reduced-motion` (no slide animation when set).

- [ ] **Step 1: Playwright flow** — fresh user lands on `/horizon`, the Horizon intro card renders anchored (not a full-screen modal); click "Got it" → card dismisses and does not reappear on reload; navigate to `/atlas` → Atlas card renders; "Skip tour" suppresses all remaining cards.
- [ ] **Step 2: Run — FAIL** (component absent). `BASE=http://localhost:8787 npm run test:browser -- onboarding-tour`
- [ ] **Step 3: Build `GuidedTour.tsx` + `useTourState.ts`** + persist seen-steps (route or ux-state track).
- [ ] **Step 4: `npm run check:pages` + spec → PASS.**
- [ ] **Step 5: Commit.**
```bash
git add pages/src/meridian/GuidedTour.tsx pages/src/meridian/useTourState.ts pages/tests/browser/onboarding-tour.spec.ts
git commit -m "feat(onboarding): first-run guided tour — inline anchored intro cards per surface"
```

---

### Task 4.2 (B5): Sandbox demo tenant for practice transactions

**Files:**
- Modify: `src/utils/tenant.ts` (recognise a reserved `sandbox` tenant id namespace), `src/routes/onboarding.ts` (add `POST /api/onboarding/sandbox/enter` — provision/reset a per-user sandbox tenant)
- Create: `src/cascade-rules/sandbox-seed.ts` (seed demo entities into the sandbox tenant only)
- Test: `tests/sandbox-tenant.test.ts`

**Hard isolation invariant (load-bearing):** sandbox practice transactions live in a reserved demo tenant (e.g. `sandbox_<participant_id>`) and NEVER INSERT synthetic kWh/billing/telemetry into a real tenant. NXT Energy's Goldrush C&I sites and every real tenant stay untouched. The sandbox is read-isolated and write-isolated through the existing `resolveTenant` fence.

- [ ] **Step 1: Failing test** — `POST /api/onboarding/sandbox/enter` creates a tenant id in the `sandbox_*` namespace owned by the caller, seeds ≥1 demo entity into it, and a write performed in sandbox context is invisible to the caller's real tenant (and vice-versa). A real-tenant query returns zero sandbox rows.
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/sandbox-tenant.test.ts`
- [ ] **Step 3: Implement** — reserved `sandbox_<participant_id>` tenant; `sandbox-seed.ts` seeds demo entities (clearly flagged `is_demo=1` / sandbox tenant) on enter; re-enter resets idempotently. All reads/writes tenant-fenced.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**
```bash
git add src/utils/tenant.ts src/routes/onboarding.ts src/cascade-rules/sandbox-seed.ts tests/sandbox-tenant.test.ts
git commit -m "feat(onboarding): isolated sandbox demo tenant for practice transactions"
```

---

## HARD-GATES — explicit sign-off required before building

These two items are **designed in this plan but NOT built autonomously.** Surface each for explicit user sign-off; build only after approval.

- **B6 — KYC PII-at-rest encryption (Task 3.1 gated).** Director IDs, tax-clearance, BBBEE certs, proof-of-address are sensitive PII under POPIA. The table schema is buildable; the *encryption strategy* (column-level AEAD vs envelope-encryption with a KMS/secret vs R2-side encryption + access logging) must be chosen and signed off before any real PII is stored. Present options + recommendation; do not enable plaintext PII storage on a real tenant without sign-off.
- **B7 — Live email delivery (Task 2.1 gated).** The dev no-op seam + `oe_email_outbox` audit table are buildable now. Wiring the live MailChannels `fetch` path (or any provider) requires provider/domain confirmation (SPF/DKIM/DMARC, sending domain, MailChannels account) + approval. The live path stays behind `env.ENVIRONMENT === 'production' && env.EMAIL_FROM` and is NOT enabled until then.

---

## Programme-level verification (after all batches)

```bash
cd open-energy-platform
npm test                 # full vitest green
npm run check            # backend 0 TS errors
npm run check:pages      # SPA 0 TS errors
BASE=http://localhost:8787 npm run test:browser -- onboarding   # all three flows
# Migrations 510–513 apply cleanly --local (509 already landed); then --remote per CI band discipline.
```

End-to-end manual smoke (one new tenant, cold start):
1. Self-register a new company → new tenant + verification email in `oe_email_outbox`.
2. Verify → wizard → complete → first entity provisioned + Getting-Started card populated.
3. Invite a counterparty → invite email → accept → auto-approved into the same tenant.
4. Try to place an order → blocked `MARKET_ACCESS_REQUIRED`.
5. Submit KYC + evidence → admin approves → `market_access=1` → order accepted.

---

## Self-Review (against the spec)

- **Spec coverage:** Activation (1.1–1.7), Acquisition (2.1–2.4), KYC gate (3.1–3.5) — all three chosen workstreams covered. The three original gap themes (dual-track disconnect, single-role provisioning, dead email links, no user KYC, no market gate) each map to a task.
- **Type/name consistency:** `manifest.entities[].{entity_type,label,href}` used consistently (1.2/1.3/1.6); `market_access` flag named identically in 511 / kyc-gate / pre-trade-guard / UI; `oe_email_outbox` and `sendEmail(env,{to,template,data})` signature stable across 2.1–2.3.
- **Open decisions to confirm at execution time (do NOT block planning):**
  1. **Verify-before-active vs verify-then-KYC-gates-transactions.** This plan keeps `email_verified` → `status:active` (preserves current login) and uses the *new* `market_access` flag as the transaction gate, rather than holding accounts in `pending` until KYC. Confirm this is the desired sequencing.
  2. **Trader/lender/offtaker/etc. first-entity tables** — 1.2 assumes new `oe_*` tables where no canonical table exists. `/graphify query` per role at execution time may redirect several of these to existing tables; the plan explicitly defers to graphify findings.
  3. **MailChannels** as the email transport (Worker-native, no SDK). If a different provider/domain is mandated, only `src/utils/email.ts` changes.
```

