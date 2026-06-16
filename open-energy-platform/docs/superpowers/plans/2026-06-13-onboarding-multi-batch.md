# Onboarding Multi-Batch Programme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Backend tasks are strict-TDD (test first, watch fail, implement, watch pass, commit). Frontend tasks gate on `npm run check:pages` + a Playwright flow.

**Goal:** Take new-user onboarding from L3 (a wizard that records answers) to L4 (a wizard whose answers provision a real first workspace for every role, plus a working acquisition funnel and a user-facing compliance gate), in three sequenced batches.

**Architecture:** Three additive batches on top of the existing onboarding spine — backend wizard ([src/routes/onboarding.ts](../../../src/routes/onboarding.ts)), provisioning cascade rule ([src/cascade-rules/onboarding-provisioning.ts](../../../src/cascade-rules/onboarding-provisioning.ts)), frontend wizard ([pages/src/components/onboarding/OnboardingWizard.tsx](../../../pages/src/components/onboarding/OnboardingWizard.tsx)), and the RBAC invitation flow ([src/routes/rbac.ts](../../../src/routes/rbac.ts)). No rewrite. Every state change fires through `fireCascade` and writes audit. Batch order: **(1) Activation depth → (2) Acquisition funnel → (3) KYC/compliance gate.**

**Tech Stack:** Cloudflare Worker + Hono + D1 (SQLite) + R2 (evidence vault) + KV + Workers AI binding; React SPA (Vite + Tailwind); vitest (backend), Playwright (browser).

**Migration counter:** highest existing is `507`. This plan adds `508`–`512`. Before writing any migration, run `ls migrations | sort | tail -1` to confirm the next free number; renumber upward if other work has landed.

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
| `src/cascade-rules/onboarding-provisioning.ts` | 1 | Expand from 2 roles to all 9 provisioning roles; emit a structured `provisioned` manifest |
| `src/routes/onboarding.ts` | 1 | `/state` returns provisioning manifest + checklist; `/complete` unchanged contract |
| `src/routes/onboarding-checklist.ts` | 1 | **New** — `GET /api/onboarding/checklist/:role` computes getting-started items + completion from real data |
| `migrations/508_onboarding_provisioning_manifest.sql` | 1 | Add `manifest` JSON col to `oe_onboarding_provisioning_log` |
| `pages/src/components/launch/GettingStarted.tsx` | 1 | **New** — launch-board checklist card with progress + inline AI "next best step" |
| `pages/src/lib/uxState.ts` | 1 | `useOnboarding()` reads the wizard track, not the orphaned ux-state track |
| `src/utils/email.ts` | 2 | **New** — single `sendEmail()` seam (MailChannels over `fetch`, dev no-op) |
| `src/routes/auth.ts` | 2 | Register + reset + verify call `sendEmail()`; verify token delivered |
| `src/routes/rbac.ts` | 2 | Invitation create fires email; `SELF_REGISTER_ROLES` + org bootstrap |
| `migrations/509_email_outbox.sql` | 2 | `oe_email_outbox` audit table (every send logged) |
| `src/routes/onboarding-kyc.ts` | 3 | **New** — user-facing KYC submission + evidence upload + status read |
| `src/cascade-rules/kyc-gate.ts` | 3 | **New** — `kyc.submitted`/`kyc.decided` cascade → admin inbox + market-access flag |
| `migrations/510_kyc_submissions.sql` | 3 | `oe_kyc_submissions` + `oe_kyc_evidence` tables |
| `migrations/511_market_access_flag.sql` | 3 | `participants.market_access` flag (gates trading/deal endpoints) |
| `src/utils/pre-trade-guards.ts` | 3 | Add `marketAccessGuard` to the order-rejection composition |
| `pages/src/components/onboarding/KycSubmission.tsx` | 3 | **New** — evidence upload UI + status timeline |

---

# BATCH 1 — Activation Depth

**Why first:** the wizard already collects answers but only `esums_owner` and `ipp_developer` get a provisioned entity; the other 7 roles land on an empty board. And the frontend `useOnboarding()` hook reads `oe_onboarding_state` (072), a *different* track from the wizard's `participants.onboarding_*` (378) — so launch-board checklists never reflect wizard progress. Batch 1 makes "finish the wizard → see a populated, explained workspace" true for all 9 roles, from one source of truth.

**Batch 1 done when:** completing the wizard as any of the 9 non-admin roles provisions ≥1 real first entity in that user's tenant; `/api/onboarding/state` returns a manifest of what was created; the launch board shows a Getting-Started card whose progress is computed from real data; and the dual-tracking disconnect is gone.

---

### Task 1.1: Provisioning manifest column

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

### Task 1.2: Provision a first entity for all 9 roles

**Files:**
- Modify: `src/cascade-rules/onboarding-provisioning.ts`
- Test: `tests/onboarding-provisioning.test.ts`

Today the rule handles `esums_owner` (→ `om_sites`) and `ipp_developer` (→ `ipp_projects`); everything else returns `kind:'none'`. Extend to a per-role provisioning table so every role gets a meaningful, tenant-scoped first entity + a manifest entry. Use the wizard's collected `onboarding_data` (passed verbatim in `ctx.data`) to seed real values; fall back to sensible defaults.

Per-role first entity (each row also pushes one manifest entity `{entity_type,label,href}`):

| role | kind | table | seeded from wizard data | default |
|---|---|---|---|---|
| `esums_owner` | `om_site` | `om_sites` | `installed_capacity_kw` | 0, status `planned` |
| `ipp_developer` | `ipp_project` | `ipp_projects` | `installed_capacity_mw`, `technology` | 10MW solar, `development` |
| `trader` | `trader_entity` | `oe_trader_entities` | `lei`, `fsca_ref` | draft entity, limits unset |
| `lender` | `lender_fund` | `oe_lender_funds` | `fund_size_zar`, `coverage` | draft fund |
| `offtaker` | `offtaker_profile` | `oe_offtaker_profiles` | `ppa_prefs` | draft profile |
| `carbon_fund` | `carbon_registry_link` | `oe_carbon_registry_links` | `registry`, `methodology` | draft link |
| `grid_operator` | `grid_authority` | `oe_grid_authorities` | `grid_zone`, `managed_mw` | draft authority |
| `regulator` | `regulator_body` | `oe_regulator_bodies` | `jurisdiction`, `licence_classes` | draft body |
| `support` | `support_org` | `oe_support_orgs` | `oem_brands`, `sla_tiers` | draft org |

> Before adding any new target table, `/graphify query "<role> first entity table"` to confirm whether a canonical table already exists (e.g. trader entities may already live in a risk/limits table). Prefer the existing table; only create a new `oe_*` table (in 508) if none exists. **Do not duplicate an existing node.**

- [ ] **Step 1: Write failing tests** — one per role, asserting (a) a row created in the right table within the participant's tenant, (b) manifest entity present, (c) re-running the cascade is idempotent (no second row). Table-driven:

```ts
const CASES = [
  { role: 'trader',        kind: 'trader_entity',        table: 'oe_trader_entities' },
  { role: 'lender',        kind: 'lender_fund',          table: 'oe_lender_funds' },
  { role: 'offtaker',      kind: 'offtaker_profile',     table: 'oe_offtaker_profiles' },
  { role: 'carbon_fund',   kind: 'carbon_registry_link', table: 'oe_carbon_registry_links' },
  { role: 'grid_operator', kind: 'grid_authority',       table: 'oe_grid_authorities' },
  { role: 'regulator',     kind: 'regulator_body',       table: 'oe_regulator_bodies' },
  { role: 'support',       kind: 'support_org',          table: 'oe_support_orgs' },
];
for (const tc of CASES) {
  it(`provisions a first ${tc.kind} for ${tc.role} (idempotent)`, async () => {
    const ctx = { event: 'onboarding.completed', actor_id: `par_${tc.role}`, entity_type: 'participants',
                  entity_id: `par_${tc.role}`, data: { role: tc.role } };
    await runProvisioning(env, ctx);
    await runProvisioning(env, ctx); // second run — must be a no-op
    const rows = db.prepare(`SELECT * FROM ${tc.table} WHERE participant_id = ?`).all(`par_${tc.role}`);
    expect(rows.length).toBe(1);
    const log = db.prepare(`SELECT kind, manifest FROM oe_onboarding_provisioning_log WHERE participant_id = ?`).get(`par_${tc.role}`) as any;
    expect(log.kind).toBe(tc.kind);
    expect(JSON.parse(log.manifest).entities.length).toBeGreaterThan(0);
  });
}
```

- [ ] **Step 2: Run — expect FAIL** (`kind:'none'`, no rows).
Run: `npx vitest run tests/onboarding-provisioning.test.ts`

- [ ] **Step 3: Implement** the per-role provisioning map in `onboarding-provisioning.ts`. Keep the existing `alreadyProvisioned()` idempotency guard. Resolve tenant from the participant row (`SELECT tenant_id FROM participants WHERE id = ?`), default `'default'`. Each branch INSERTs one draft row + builds `manifest = { entities: [{ entity_type, label, href }] }`, then writes the log row with `kind` + `manifest`. For any new `oe_*` tables, add their `CREATE TABLE IF NOT EXISTS` to migration 508.

- [ ] **Step 4: Run — expect PASS** (all roles + idempotency).
Run: `npx vitest run tests/onboarding-provisioning.test.ts`

- [ ] **Step 5: Commit.**
```bash
git add src/cascade-rules/onboarding-provisioning.ts migrations/508_onboarding_provisioning_manifest.sql tests/onboarding-provisioning.test.ts
git commit -m "feat(onboarding): provision a first entity + manifest for all 9 roles"
```

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
- Create: `migrations/509_email_outbox.sql`, `src/utils/email.ts`
- Modify: `src/utils/types.ts` (optional `EMAIL_*` env), `wrangler.toml` (vars)
- Test: `tests/email.test.ts`

`sendEmail()` is the single seam: in production it POSTs via MailChannels over `fetch` (no SDK, Worker-native); in dev/test it is a no-op that still writes the outbox row. Every send writes `oe_email_outbox` (id, to, template, payload JSON, status, error, created_at) so delivery is auditable and testable without a live provider.

- [ ] **Step 1: Failing test** — `sendEmail(env,{to,template:'verify',data:{token}})` writes an `oe_email_outbox` row with status `queued`→`sent` (dev no-op marks `sent`), and returns `{id}`. On `fetch` throw it records `status:'failed'` + error and does **not** throw.
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/email.test.ts`
- [ ] **Step 3: Migration 509** (`oe_email_outbox`) + implement `sendEmail()` with templates map (`verify`, `reset`, `invite`, `kyc_decision`). Gate live send on `env.ENVIRONMENT === 'production' && env.EMAIL_FROM`.
- [ ] **Step 4: Run — PASS** (+ `wrangler d1 migrations apply --local`).
- [ ] **Step 5: Commit.**
```bash
git add migrations/509_email_outbox.sql src/utils/email.ts src/utils/types.ts tests/email.test.ts
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

**Batch 3 done when:** a user can submit a KYC pack with document evidence (R2-backed); submission fires a cascade into the existing admin review queue; admin decisions flow back to the user (reusing the existing `/admin/kyc/:id` machine); and trading/deal endpoints reject actors without `market_access` with a structured reason code.

---

### Task 3.1: KYC submission + evidence tables

**Files:**
- Create: `migrations/510_kyc_submissions.sql`
- Test: covered by 3.2/3.3 route tests

- [ ] **Step 1:** Write `510_kyc_submissions.sql`:
```sql
-- 510_kyc_submissions.sql — user-facing KYC pack + evidence (admin review machine already exists).
CREATE TABLE IF NOT EXISTS oe_kyc_submissions (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',   -- submitted | in_review | approved | rejected | info_requested
  pack TEXT NOT NULL DEFAULT '{}',            -- structured answers JSON
  reason_code TEXT,                           -- structured decision reason
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oe_kyc_evidence (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,                     -- reg_cert | director_id | proof_address | tax_clearance | bbbee_cert
  r2_key TEXT NOT NULL,
  filename TEXT, content_type TEXT, size_bytes INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_kyc_sub_participant ON oe_kyc_submissions(participant_id);
CREATE INDEX IF NOT EXISTS idx_kyc_evidence_sub ON oe_kyc_evidence(submission_id);
```
- [ ] **Step 2:** `wrangler d1 migrations apply open-energy-db --local`.
- [ ] **Step 3: Commit.** `git add migrations/510_kyc_submissions.sql && git commit -m "feat(kyc): user-facing submission + evidence tables"`

---

### Task 3.2: KYC submission route (+ evidence upload to R2)

**Files:**
- Create: `src/routes/onboarding-kyc.ts`
- Modify: `src/routes/mount-routes.ts` (mount `/api/onboarding/kyc`)
- Test: `tests/onboarding-kyc.test.ts`

Endpoints (all `authMiddleware`, tenant-fenced to the caller):
- `GET /api/onboarding/kyc` — caller's current submission + evidence list + status.
- `POST /api/onboarding/kyc` — create/update a `submitted` pack; fires `kyc.submitted` cascade.
- `POST /api/onboarding/kyc/evidence` — pres* upload: stores the file in R2 under `kyc/<tenant>/<participant>/<id>`, writes `oe_kyc_evidence`. `doc_type` validated against a static allow-list.

- [ ] **Step 1: Failing tests** — POST submission creates a `submitted` row scoped to the caller's `participant_id`/tenant + fires `kyc.submitted`; evidence POST writes an R2 object + an `oe_kyc_evidence` row; a second participant cannot read the first's submission (tenant/owner fence).
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/onboarding-kyc.test.ts`
- [ ] **Step 3: Implement** the route; use the R2 binding from `c.env`. `doc_type` is a bound value validated against the allow-list — never a path/SQL identifier (key path is built from validated ids only).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.**
```bash
git add src/routes/onboarding-kyc.ts src/routes/mount-routes.ts tests/onboarding-kyc.test.ts
git commit -m "feat(kyc): user submission + R2 evidence upload route"
```

---

### Task 3.3: KYC gate cascade — submission → admin inbox; decision → market access

**Files:**
- Create: `src/cascade-rules/kyc-gate.ts`
- Modify: `src/routes/admin.ts` (`/admin/kyc` reads `oe_kyc_submissions`; `/admin/kyc/:id` decision also updates the submission + fires `kyc.decided`), `migrations/511_market_access_flag.sql`
- Test: `tests/kyc-gate.test.ts`

- [ ] **Step 1: Migration 511** — `ALTER TABLE participants ADD COLUMN market_access INTEGER DEFAULT 0;` (idempotent: tolerate `duplicate column name`).
- [ ] **Step 2: Failing tests** — `kyc.submitted` cascade materialises an item in the admin KYC queue; an admin `approved` decision flips `participants.market_access=1` and fires `kyc.decided`; a `rejected`/`info_requested` decision leaves `market_access=0` and notifies the user with a structured `reason_code`. Re-fire is idempotent.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Implement** `kyc-gate.ts` (register via `registerCascadeRule`); extend the admin decision handler to update `oe_kyc_submissions.status` + `reason_code` and set `market_access` on approve. Reuse the existing audit + notification writes.
- [ ] **Step 5: Run — PASS** (+ apply 511 local).
- [ ] **Step 6: Commit.**
```bash
git add src/cascade-rules/kyc-gate.ts src/routes/admin.ts migrations/511_market_access_flag.sql tests/kyc-gate.test.ts
git commit -m "feat(kyc): submission→admin inbox + decision→market-access cascade"
```

---

### Task 3.4: Market-access pre-trade guard

**Files:**
- Modify: `src/utils/pre-trade-guards.ts`
- Test: `tests/pre-trade-guards.test.ts`

Add `marketAccessGuard` to the existing order-rejection composition (alongside credit/exposure/mark-age/halt/kyc). Reject orders + deal accepts from actors with `market_access=0`, with a structured reason code (e.g. `MARKET_ACCESS_REQUIRED`) explained via the existing `explainRejection` ([src/utils/rejection-explainer.ts](../../../src/utils/)).

- [ ] **Step 1: Failing test** — an order from a `market_access=0` participant is rejected with `reason_code:'MARKET_ACCESS_REQUIRED'`; a `market_access=1` participant passes the guard. Confirm the guard composes (doesn't short-circuit the others).
- [ ] **Step 2: Run — FAIL.** `npx vitest run tests/pre-trade-guards.test.ts -t "market access"`
- [ ] **Step 3: Implement** the guard + register it in the composition.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit.** `git commit -am "feat(kyc): market-access pre-trade guard w/ structured reason code"`

---

### Task 3.5: KYC submission UI + status timeline

**Files:**
- Create: `pages/src/components/onboarding/KycSubmission.tsx`
- Modify: launch-board / Getting-Started (surface a "Verify your account" item when `market_access=0`)
- Test: `pages/tests/browser/onboarding-kyc.spec.ts`

UI rules: evidence upload with per-doc-type slots (label above, helper text, error below; drag threshold; progress on upload — skeleton not spinner if >300ms); a status timeline (submitted → in_review → decided) with state-distinct steps; one primary CTA. When `market_access=0`, the Getting-Started card shows a "Verify to start transacting" item linking here. Reads/writes `GET|POST /api/onboarding/kyc`.

- [ ] **Step 1: Playwright flow** — log in as a freshly-seeded unverified persona, open the KYC surface, fill the pack, attach one evidence file (use a small fixture + intercept the R2-backed POST → 201), submit, assert status shows `submitted`. Assert the Getting-Started "Verify your account" item is present while `market_access=0`.
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
# Manual: submit KYC as a test user → appears in /admin/kyc → approve → market_access flips → order accepted.
```

---

## Programme-level verification (after all three batches)

```bash
cd open-energy-platform
npm test                 # full vitest green
npm run check            # backend 0 TS errors
npm run check:pages      # SPA 0 TS errors
BASE=http://localhost:8787 npm run test:browser -- onboarding   # all three flows
# Migrations 508–511 apply cleanly --local; then --remote per CI band discipline.
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

