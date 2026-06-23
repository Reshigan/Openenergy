# Open Energy Platform — Ecosystem Rebuild Blueprint

**Decision: Do NOT rewrite. Add three layers on top of the 74 correct chains.**

Built 2026-06-06 from 5 parallel domain experts + graph confirmation. The 74 P6
state machines, their SLA rules, regulator crossings, and 474 migrations are
correct and legally grounded (ERA, LMA, FSCA, NERSA, Verra). A rewrite throws
away validated business logic for 18–24 months and gains nothing. What is
missing is the connective tissue *between* chains — four layers that all sit on
top of the existing `fireCascade()` god node (655 edges, community 0, within 2
hops of 5,600+ nodes = essentially the whole codebase).

---

## The unifying principle

> **Every state transition emits one canonical `PlatformEvent`. That event
> fans out FOUR ways automatically: downstream chains (cascade registry),
> platform revenue (fee engine), affected roles (action queue), and
> insights (analytics sink). No chain file changes. No manual handoffs.**

---

## LOCKED DECISIONS (2026-06-06)

1. **Cross-impact = unattended-by-default, safety-gated.** Lifecycle
   sequencing auto-progresses without waiting for a human (COD → PPA activates
   + drawdown created + levy/renewal opened). The IncomingPanel still shows
   every auto-step as a record + override, so a human *can* intervene but is
   not *required* to. Safety/regulatory interactions are the exception — they
   HARD-BLOCK (algo kill → orders rejected at the guard; PTW not issued → WO
   cannot dispatch; STOR filed → positions frozen). Each cascade rule declares
   `mode: drive | block`.
   - **Audit/authz note:** auto-progressed actions run as a dedicated system
     actor (`system:cascade`) carrying the originating `event_id`, never
     impersonating the affected role. The audit chain must show machine-driven
     vs human-driven. (Directly avoids the actor_id-forgery class of bug.)

2. **Fees ship ALL FREE.** `oe_fee_schedule` is seeded for every billable
   event but `is_enabled = 0` / `rate = 0`; revenue rows record at R0,
   `status = waived`. The pipeline is proven end-to-end with zero billing risk.
   Operator flips one row to switch any fee live — no deploy.

3. **Scale target = NATIONAL FULL (10k+ players).** Queues + KV cache +
   D1 read-replicas + sharding + batched sweeps are in from the start (see
   National-scale section). No re-architecture later.

4. **Payer is per-fee.** `oe_fee_schedule` gets a `payer_role` column
   (+ `payer_resolution` enum: `initiator | beneficiary | split | platform`).
   Each billable event names its own payer at rate-card time.

---

## The four new layers (+ national-scale + UX additions)

> A, B, C below; **Layer D — Insights & Analytics** is its own section further down.

### Layer A — Event Bus + Cascade Registry
Replace the 780-line `handleSpecialCascades` switch with self-registering rule
files (`src/cascade-rules/*.ts`). Adding a cross-chain interaction = one new
file, zero edits to existing files. The `REGISTRY` pattern already exists in
`bulk-ops.ts:L40` — reuse its shape.

- New: `src/utils/cascade-registry.ts`, `src/cascade-rules/index.ts` + one file per interaction
- DB: `oe_cascade_rule_audit` (475), `oe_algo_trading_blocks` (477)

### Layer B — Commercial Intercept
Every value-creating transition fires `computeAndRecordFee` (fire-and-forget,
`ctx.waitUntil`). Operator flips any fee free↔paid via one DB row, no deploy.
Fee UI already exists (`FeeAccrualTrend`, `SettlementWaterfall`, `SettlementInsights`).

- New: `src/utils/fee-engine.ts`, `src/routes/admin-revenue.ts`
- DB: `oe_fee_schedule`, `oe_platform_revenue`, `oe_revenue_splits` (475)

### Layer C — Cross-Role Push
Generalize the regulator-only `oe_regulator_inbox` to `oe_role_action_queue`
for all 9 roles. Every workstation gets a live `<IncomingPanel>`. Completing an
action surfaces `<CrossOptionModal>` next steps for the connected role.

- New: `src/utils/role-actions.ts`, `src/routes/role-actions.ts`,
  `IncomingPanel.tsx`, `CrossOptionModal.tsx`, `useIncomingActions.ts`
- DB: `oe_role_action_queue` (476)

---

## NATIONAL-SCALE additions (lots of players, lots of transactions)

The base blueprint assumes ~17 participants. At SA national scale — REIPPPP
~100+ IPPs, hundreds of C&I offtakers post-wheeling-liberalisation, 6+ DFI
lenders, NERSA, NTCSA, carbon verifiers, exchange traders — that is thousands of
participants and tens of thousands of daily transitions. This forces four
changes the small-scale blueprint does not need:

1. **Cloudflare Queues for cascade fan-out.** `fireCascade` must NOT run the
   registry synchronously at national volume. It enqueues a `PlatformEvent`;
   a Queue consumer runs `runCascadeRegistry` + `computeAndRecordFee`. Keeps the
   request path fast; absorbs burst (settlement runs, MYPD reprice-all-PPAs).
2. **KV-cached action-queue counts.** `oe_role_action_queue` pending-count per
   role cached in KV (TTL 30s), invalidated on write. Otherwise every
   workstation poll × thousands of users hammers D1.
3. **D1 read replicas + sharding discipline.** D1 is single-region, ~1k
   writes/s, 10GB/db. Revenue + action-queue tables are append-heavy — shard by
   `billing_period` / archive to R2 monthly. Read dashboards off replicas.
4. **Batched SLA sweeps are mandatory, not optional.** `sweep-runner.ts` with
   `env.DB.batch()` — at national scale the midnight cron over ~145 sweeps with
   N+1 writes would exceed the Worker CPU/subrequest budget.

---

## WIZARDS for everything

Every P6 transition becomes a guided `<WizardShell>` flow instead of a single
modal: **Context → Validate → Confirm → Submit**, with the cross-impact preview
shown at Confirm ("This will notify Lender + activate PPA"). One reusable
primitive, config-driven per chain action — mirrors how `WorkstationShell`
already abstracts tabs. Onboarding wizards per role (first-login), and
entry-point wizards on `/modules` ("Start a new… PPA / drawdown / retirement").

- New: `pages/src/components/wizard/WizardShell.tsx` + per-action step configs

## Layer D — INSIGHTS & ANALYTICS (lots of insights + reporting across ALL features)

Reporting is not one dashboard — it is a **fourth fan-out of the event stream**.
Every `PlatformEvent` is appended to an analytics sink; a cron pre-aggregates
into rollup tables (you cannot aggregate over millions of rows on every
dashboard load at national scale). Read off D1 replicas. The result: rich
insight on **every one of the 74 features** plus cross-feature rollups.

### Per-feature analytics (all 74 chains get the same treatment, for free)
Each chain, the moment it emits events, auto-gets:
- **Throughput & funnel** — entered vs reached-terminal, conversion %, drop-off state
- **Cycle-time** — time-in-state histogram, p50/p95 per transition, slowest stage
- **SLA health** — adherence %, breach rate, breaches-by-tier, time-to-breach
- **Value processed** — ZAR through the chain, by period, by participant
- **Bottleneck detector** — which state is backing up right now

This is generated from the event stream + state metadata — **zero per-chain
code**. Add a chain → it appears in analytics automatically.

### Cross-feature rollups
- **Lifecycle flow** — trace one asset/project across chains end-to-end
  (procurement → construction → COD → drawdown → PPA → settlement → carbon),
  with stage durations and where it's stuck. The Sankey of the whole platform.
- **Revenue analytics** — fees by event / role / period, free-vs-paid mix,
  projected ARR, leakage (billable events that fired R0), top revenue events.
- **Role analytics** — action-queue depth + ageing per role, response-time SLA,
  what each role is blocked on, busiest roles.
- **Regulatory analytics** — every regulator crossing, enforcement pipeline,
  compliance posture by participant, levy collection, licence pipeline.
- **Network / concentration** — counterparty exposure maps, lender/offtaker
  concentration risk, who-depends-on-whom across the ecosystem.

### Surfaces
- **Operator national dashboard** (`/dashboard`) — the market in one screen:
  domain rollups, SLA heatmap, revenue, queue depth, propagation latency, live
  event feed. Drill KPI → chain list → entity → timeline, everywhere.
- **Per-feature insight panel** — every workstation tab gets an Insights view
  (the per-chain analytics above) beside its listing — no feature is a black box.
- **Per-role executive dashboard** — portfolio rollup with AI narrative
  ("3 facilities have covenant tests due in 14 days; 2 PPAs reprice next month").
- **Regulator national view** — NERSA-grade market-wide posture.
- **AI insight generation** — anomaly detection over the event stream
  ("this lender's covenant breaches up 40% QoQ"), trend surfacing, predictive
  (reuses W71 RUL). Inline cards, "why + 1-click", per existing AI doctrine.
- **Certified exports** — NERSA / FSCA / EMIR-style off the L5 audit chain.

### Technical foundation
- New table `oe_platform_events` (append-only event log, the analytics sink)
- New rollup tables `oe_metrics_daily`, `oe_chain_metrics`, refreshed by the
  existing nightly cron (`env.DB.batch()`), sharded by period, R2-archived monthly
- New: `src/utils/analytics-sink.ts`, `src/utils/metrics-rollup.ts`,
  `src/routes/insights.ts`, `src/routes/national-dashboard.ts`,
  `pages/.../NationalDashboard.tsx`, `pages/.../InsightsPanel.tsx`,
  `pages/.../LifecycleFlow.tsx`
- Dashboards read **only** rollup tables (never live chain tables) → cheap at scale

## UI THEME

Keep the Apex/Bloomberg theme. Additive only: right-rail `IncomingPanel`,
post-action `CrossOptionModal` bottom sheet, `WizardShell` for transitions,
`/dashboard` national view, `/modules` discovery grid. Review pass on density +
mobile (IncomingPanel → floating badge + drawer < 768px).

---

## TOP 10 MUST-HAVE interactions for launch

1. W20 COD → Lender drawdown prompt + PPA auto-activate (BLOCKING, commercial)
2. W60 algo kill-switch → block all trader orders (BLOCKING, FSCA)
3. W38 covenant breach → W77 reserve cure (BLOCKING)
4. W77 reserve breach → W45 loan default event-of-default (BLOCKING)
5. W52 STOR filed → freeze position limits + pause best-ex (BLOCKING)
6. W64 PTW issued → W16 WO dispatch enable gate (BLOCKING, OHSA)
7. W49 licence granted → W74 levy + W33 renewal auto-create (BLOCKING)
8. W43 MYPD published → W39 reprice all active PPAs (commercial)
9. W71 failure imminent → W64 emergency PTW (BLOCKING)
10. W11 MRV verified → W17 retirement prompt (commercial)

---

## What must NOT change

All `*-chain.ts`, all `*-spec.ts`, migrations 001–474, auth/tenant/locks,
OrderBook DO, matching, test suite, `wrangler.toml`. `fireCascade` signature is
additive-only. `handleSpecialCascades` cases migrate one-at-a-time (coexist
weeks 2–5), never bulk-deleted.

---

## Build sequence (each week independently deployable)

- **W1** Foundation: `platform-event.ts` + registry + fee-engine + role-actions + analytics-sink utils, migrations 475–479 (fee/revenue/splits, role-queue, rule-audit/algo-blocks, platform-events, metrics-rollup), Queue binding, wire registry alongside existing switch (no-op).
- **W2** Regulatory safety rules (#2,5,6,9, `mode:block`) + pre-trade guard live wiring + role-actions API. *FSCA/OHSA compliant.*
- **W3** Lifecycle sequencing (#1,3,4,7,10, `mode:drive`, `system:cascade` actor) + IncomingPanel + WizardShell. *Lender workstation goes live-driven, unattended.*
- **W4** Commercial intercept (all-free seed + `payer_role`/`payer_resolution`) + admin-revenue + analytics sink live + metrics-rollup cron.
- **W5** Remaining interactions #11–25 + delete `handleSpecialCascades`.
- **W6** CrossOptionModal + `/modules` + AI insight cards + per-feature InsightsPanel on every workstation tab.
- **W7** Route manifest (index.ts 4,753→~200 lines) + sweep batching + national dashboard + LifecycleFlow + Queue consumer hardening + D1 read-replica reads on dashboards.

---

## Success metrics

1. Cross-role propagation p99 < 60s (COD → lender card).
2. ≥95% of ZAR-valued transitions fire a fee event.
3. 100% of standalone chains reachable by deep link (Playwright).
4. `cascade.ts` < 3,300 lines; every interaction has a rule file + unit test.
5. All 9 roles show action-queue rows within 24h of a realistic event.
