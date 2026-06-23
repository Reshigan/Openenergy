# 01 - System Overview

This is the architecture a support engineer needs in their head. It is grounded
in `CLAUDE.md`, `wrangler.toml`, `src/index.ts`, and the route/chain registries.

## 1. One Worker, two jobs

The whole platform is a single Cloudflare Worker. It does two things:

1. Serves the React SPA. `wrangler.toml` has an `[assets]` binding pointing at
   `pages/dist/`. `not_found_handling = "single-page-application"` makes any
   non-API path fall through to the SPA shell, so client-side routing works.
2. Handles `/api/*` via Hono.

The Worker exports both `fetch` (HTTP) and `scheduled` (cron). Cloudflare Pages
Functions cannot export that shape, which is why this is a Worker and not a
Pages project. A legacy Pages project still exists and the demo deploy mirrors
to it, but the Worker is the source of truth.

The repo root is a thin wrapper. All real code lives under
`open-energy-platform/`. Run every command from there.

## 2. Routes

There are around 347 route modules in `src/routes/`, mounted via
`app.route('/api/<prefix>', module)` (aggregated in `src/routes/mount-routes.ts`
and wired into `src/index.ts`). Auth is applied per module
(`module.use('*', authMiddleware)`), not globally. That is why some modules
import `authMiddleware` explicitly and most do not. Public routes
(`/api/auth/login`, `/api/health`) do not run it.

A known footgun: Hono `basePath` param collisions are silent. Sub-routers must
be mounted with the full param basePath, and CI being green does not prove
wire-up. Always curl the real prod route after the first deploy of a new mount.

### Cross-cutting helpers (`src/utils/`)

| Helper | Role |
|---|---|
| `cascade.ts` | `fireCascade(...)` - the fan-out every meaningful mutation calls. See section 5. |
| `ai.ts` | `ask()` wraps the Workers AI binding for inline assists (no external key). |
| `tenant.ts` | Resolves tenant from the JWT and enforces isolation on every resource fetch. |
| `locks.ts` | Advisory locks via D1 to serialise matching/settlement (e.g. settlement netting). |
| `pre-trade-guards.ts` | Composes order-rejection rules: credit, exposure, mark age, halt, KYC. |

## 3. The chain model (the heart of the platform)

A "chain" is a state-machine workflow. There are 207 of them. The single source
of truth is `MERIDIAN_CHAINS` in `src/utils/chain-registry-meridian.ts`. Each
chain descriptor declares its table, columns, lanes, and actions.

Security invariant (load-bearing): every SQL identifier (table name, column
name) comes exclusively from that static literal, never from request input.
Request values only ever bind to `?` placeholders. If you are ever asked to make
a chain take a table or column name from the request body, stop - that breaks
the invariant.

Chains have depth levels (the team's feature-depth rubric):

- L1 mock UI, L2 CRUD only (not acceptable for new features), L3 state machine +
  server validation + audit, L4 full workflow (gating, cascades, timers, reason
  codes, dunning/escalation, evidence), L5 regulator-grade (tamper-evident
  audit, certified exports, external reconciliation).

Most production chains are L4 or L5. Examples by domain: PPA settlement, carbon
MRV verification (14 states), IPP construction/COD, lender drawdown, grid
curtailment, trader position limits, support tickets with priority-tiered SLAs.
The full per-role catalogue is in `04_FEATURES_BY_ROLE.md`.

## 4. The Meridian frontend

The SPA is "Meridian": one full-canvas chrome (`MeridianFrame`) wrapping every
authenticated page. Older shells (StitchPage, FioriShell, workstation shells,
`/launch/:role`, `/cockpit`) were retired; those paths now redirect to
`/horizon`.

Post-login flow: `LaunchRedirect` calls `GET /api/onboarding/state`, then sends
the user to `/onboard` (first visit) or `/horizon` (returning).

The surfaces:

| Surface | Path | What it is |
|---|---|---|
| Horizon | `/horizon` | Per-role live workspace; lanes are the non-terminal chain cases visible to the role |
| Atlas | `/atlas` (Cmd+K) | Function library / discovery; tiles resolve to a chain Ledger, a route, or a registered surface |
| Ledger | `/ledger/:chainKey` | Per-chain list + schema-driven "+New" initiation |
| Thread | `/thread/:chainKey/:id` | Two-sided cross-role transaction detail |
| Deal Desk | `/deals`, `/deals/new` | Author/track deals; `/new` is the transaction picker |
| Surface | `/surface/:key` | One parametric route renders `SURFACE_REGISTRY['<role>:<key>']` for non-chain surfaces (master-data CRUD, settings, analytics/ML, connectors) |

Every Atlas tile must structurally resolve to a chain, a route, or a registered
surface, or it is hidden. There are no dead tiles.

### AI assists

There are no AI tabs or popups. AI shows up as inline cards in workflow
surfaces, each with a "why" and a one-click accept. The `ai_decisions` table is
the audit trail. The `AI` binding (Workers AI) needs no external key.

## 5. Cascades (how one action ripples out)

Every mutation that matters calls:

```
fireCascade({ event, actor_id, entity_type, entity_id, data, env })
```

The cascade fans out to action queues, audit chains, briefings, notifications,
and webhooks, each stage with its own dead-letter queue (DLQ) and retry. This is
how a single action in one role surfaces as work in another role (e.g. an
offtaker under-delivering pushes a claim into the generator IPP's incoming
panel). `fireCascade` is a god node in the codebase - almost every new module
integrates through it.

Terminal cascade-stage failures land in the `cascade_dlq` table and can be
retried from the support cascade-DLQ console. `06_DATA_FLOWS.md` section 4
traces the fan-out in detail.

## 6. Durable Objects

`OrderBook` (`src/do/order-book.ts`) is the only Durable Object bound. There is
one instance per shard (energy_type x delivery_day); `deriveShardKey()` in
`utils/matching.ts` routes to it. Other DO classes (Risk, Smart, Escrow) exist
in code but are not bound in `wrangler.toml`.

## 7. Cron

The Worker's `scheduled()` dispatches by matching the cron string against
handlers in `runCron`. Seven schedules carry the real work: a 15-minute
surveillance + SLA-sweep + deal-sweep pass, hourly mark prices, and a set of
daily/monthly settlement, metering, accrual, audit, and invoice runs. Each job
is wrapped so one failure never aborts the rest of its schedule. The exact table
of schedules and what each runs is in `05_OPERATIONS_RUNBOOK.md` section 4.

## 8. The two data planes (important for O&M and predictive ML)

Site generation data lives in two distinct planes. Support must not confuse them:

1. Financial plane - `site_accruals`. Hourly rows per site: `period_hour`,
   `kwh_delta`, `cumulative_kwh`, `carbon_tco2e`, `revenue_zar`, `savings_zar`,
   `tariff_rate_used`. Feeds dashboards, billing, settlement. Populated by the
   SolaX historical backfill.
2. Telemetry plane - `om_telemetry` (per `om_devices`, per `om_sites`). Feeds the
   O&M dashboards and the predictive asset-health ML (anomaly detection,
   degradation, remaining-useful-life). The FK chain is
   `om_telemetry.device_id -> om_devices.id -> om_sites.id`.

The live SolaX historical backfill seeds BOTH planes from the same hourly SolaX
readings (no synthetic data, no extra API calls): it upserts `site_accruals` and
also upserts `om_sites` + one `om_device` per station + hourly `om_telemetry`
rows. So O&M and predictive ML get real interval-level load detail, not just
financial totals. `06_DATA_FLOWS.md` section 5 traces the backfill.

## 9. Multi-tenancy

Every resource fetch resolves the tenant from the JWT (`tenant.ts`) and enforces
isolation. R2 storage is shared between demo and live (the deploy token lacks
scope to create a second bucket); isolation there is by tenant-prefixed keys
(`t_<slug>/...`), not by separate bucket.

## 10. Where the real code is

```
open-energy-platform/
  src/
    index.ts                       fetch + scheduled entry; mounts routes; runCron
    routes/                        ~347 API modules
      mount-routes.ts              aggregated app.route mounts
    do/order-book.ts               the one bound Durable Object
    utils/
      cascade.ts                   fireCascade fan-out
      chain-registry-meridian.ts   MERIDIAN_CHAINS - source of truth for chains
      tenant.ts locks.ts pre-trade-guards.ts ai.ts matching.ts
  pages/                           the React SPA (Meridian)
    src/meridian/                  MeridianFrame, surfaces registry
  migrations/                      508+ numbered SQL migrations
  scripts/                         smoke + login helpers
  wrangler.toml                    bindings, [env.live], [triggers]
```
