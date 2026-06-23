# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Open Energy Platform — South African energy exchange (power trading, carbon, IPP lifecycle, settlement, regulatory compliance) deployed at [oe.vantax.co.za](https://oe.vantax.co.za). Single Cloudflare Worker that handles `/api/*` via Hono and serves the React SPA via the `[assets]` binding (see [wrangler.toml](open-energy-platform/wrangler.toml)). Aligned to ERA 2006, NERSA Grid Code, POPIA, Carbon Tax Act, REIPPPP, JSE-SRL.

The repo root is a wrapper; all real code lives under [open-energy-platform/](open-energy-platform/).

## Commands

All from `open-energy-platform/`:

```bash
# Dev
npm run dev                # wrangler dev — Worker on :8787 against local D1
cd pages && npm run dev    # SPA on :3000, proxies /api/* to :8787

# Type-check
npm run check              # backend tsc --noEmit
npm run check:pages        # SPA tsc --noEmit

# Test
npm test                   # vitest — 8167 unit tests; backend logic, matching, guards
npx vitest run path/to/file.test.ts          # single file
npx vitest run -t "describe substring"       # by name pattern
npm run test:browser       # Playwright against BASE (defaults to prod)
BASE=http://localhost:8787 npm run test:browser   # against local dev

# Smoke (hits real endpoints)
scripts/smoke-crud.sh      # POST→GET→PUT→DELETE round-trip per role
scripts/smoke-roles.sh     # 9 personas login + cross-role 403 checks
scripts/smoke-cron.sh      # dry-run every wrangler.toml schedule

# Load tests (k6) — see tests/load/README.md
k6 run tests/load/scenario-trading-peak.js

# Migrate
wrangler d1 migrations apply open-energy-db --local
wrangler d1 migrations apply open-energy-db --remote  # see "Migration discipline" below

# Deploy
./deploy.sh                # from repo root — builds SPA, dry-runs, deploys Worker
# CI/CD - Build and Deploy GH Actions workflow does this on every push to main
```

## Architecture

### Single-Worker model

`wrangler.toml` declares one Worker with `[assets]` binding pointing at `pages/dist/`. `not_found_handling = "single-page-application"` makes any non-API path fall through to the SPA shell. The Worker exports both `fetch` and `scheduled` (see [src/index.ts](open-energy-platform/src/index.ts)) — Pages Functions don't support that shape, which is why we're not on Pages.

A legacy Cloudflare Pages project still exists in the account; the deploy workflow ships to it too as a mirror, but the Worker is the source of truth.

### Routes

347 modules in [src/routes/](open-energy-platform/src/routes/), all mounted via `app.route('/api/<prefix>', module)` (360 mounts, now aggregated in [src/routes/mount-routes.ts](open-energy-platform/src/routes/mount-routes.ts) and wired into [src/index.ts](open-energy-platform/src/index.ts)). Auth middleware is applied per-module (`module.use('*', authMiddleware)`), not globally — that's why some routes have an explicit `authMiddleware` import and most don't. Public routes (`/api/auth/login`, `/api/health`) don't run it.

Key cross-cutting helpers in [src/utils/](open-energy-platform/src/utils/):
- `cascade.ts` — every mutation that matters calls `fireCascade({event, actor_id, entity_type, entity_id, data, env})`. Cascades fan out to action queues, audit chains, briefings, notifications, webhooks with DLQ + retry per stage.
- `ai.ts` — `ask()` wraps the `AI` binding (Workers AI) for inline assists.
- `tenant.ts` — every resource fetch resolves tenant from the JWT and enforces isolation.
- `locks.ts` — advisory locks via D1 to serialise matching/settlement operations.
- `pre-trade-guards.ts` — composes order rejection rules (credit, exposure, mark age, halt, kyc).

### Durable Objects

`OrderBook` in [src/do/order-book.ts](open-energy-platform/src/do/) is the only DO currently bound. One instance per shard (energy_type × delivery_day) — `deriveShardKey()` in `utils/matching.ts` does the routing. Other DO classes (Risk, Smart, Escrow) exist in code but aren't bound in `wrangler.toml`.

### Migrations

508 numbered migrations in [migrations/](open-energy-platform/migrations/) (highest `508_add_carbon_chain_tier_columns.sql`). `wrangler.toml::migrations_dir` wires them in.

**Migration discipline** (this is non-obvious and load-bearing):
- 001–018 are clean and idempotent. Apply normally.
- 019–048 were force-applied out-of-band on prod; their `d1_migrations` ledger row is missing. The CI deploy workflow [skips them](.github/workflows/deploy.yml) when applying.
- 049 is `CREATE TABLE IF NOT EXISTS` — safe to land.
- 050 had a CREATE INDEX referencing columns that 020 was supposed to add but didn't. CI reconciles 050 column-by-column with `ALTER TABLE ADD COLUMN` and `duplicate column name` treated as a benign already-applied signal.
- 051+ apply normally and are idempotent.

`wrangler d1 migrations list ... --remote` will always show 049–508 as "to be applied" because we use `wrangler d1 execute --file` rather than `migrations apply` for the irregular band. This is intentional; don't try to "fix" the ledger.

### Cron triggers

Seven schedules in `wrangler.toml::[triggers]`, dispatched by `scheduled()` in [src/index.ts](open-energy-platform/src/index.ts):
- `*/15 * * * *` — surveillance scan + OrderBook DO depth snapshots
- `0 * * * *` — VWAP mark prices
- `5 0 * * *` — metering + ONA rollups, audit archive prep
- `10 0 * * *` — previous-day PPA settlement run
- `30 0 * * *` — usage snapshot + margin-call cycle
- `45 0 * * *` — watershed anomaly scan + maturity refresh
- `0 2 1 * *` — monthly platform invoice run

`scripts/smoke-cron.sh` dry-runs each via `/api/admin/cron/run` (gated on admin role).

### Auth + rate limits

HS256 JWT, 1-hour TTL. Token in `Authorization: Bearer` and (for the SPA) `localStorage['token']` — [pages/src/lib/api.ts](open-energy-platform/pages/src/lib/api.ts) reads/writes it.

**Sensitive-route rate limiter: 10 / 5 min / IP** on `/api/auth/login`. This is the single most common cause of CI flake. Any script doing multiple logins must use the token cache in [scripts/_login.sh](open-energy-platform/scripts/_login.sh) (`login_or_cached`). Tests should log in via API once and seed the token via `page.addInitScript(localStorage.setItem('token', ...))` — see [tests/browser/workstations.spec.ts](open-energy-platform/tests/browser/workstations.spec.ts).

Demo personas all use password `Demo@2024!`. Emails: `admin / trader / ipp / wind / offtaker / lender / carbon / regulator / grid / support @openenergy.co.za`.

### Frontend chrome — Meridian

The SPA is **Meridian** — one full-canvas chrome (`MeridianFrame`, [pages/src/meridian/MeridianFrame.tsx](open-energy-platform/pages/src/meridian/MeridianFrame.tsx)) wrapping every authed page. The older systems (StitchPage, FioriShell, `LaunchBoardShell`/`WorkstationShell`, `/launch/:role`, `/cockpit`, per-domain `/{role}/workstation`) were retired in **Phase E**; those paths now `<Navigate to="/horizon">`.

Post-login, `LaunchRedirect` ([App.tsx](open-energy-platform/pages/src/App.tsx)) calls `GET /api/onboarding/state` → `/onboard` (first visit) or `/horizon` (returning). The Meridian surfaces:
- **Horizon** (`/horizon`) — per-role live workspace; lanes are the non-terminal chain cases visible to the role (`GET /api/horizon/:role`, [src/routes/horizon.ts](open-energy-platform/src/routes/horizon.ts)). `laneRoleFor` re-points `esums_owner`→`esco`.
- **Atlas** (`/atlas`, ⌘K) — function library / discovery. Tiles come from `getRoleConfig(role).domains→features` in [roleData.ts](open-energy-platform/pages/src/ux-alternatives/launchpad-nav/roleData.ts); each must resolve to a chain Ledger (`f.chainKey`), a `route`, or a registered `/surface` — otherwise the tile is structurally hidden.
- **Ledger** (`/ledger/:chainKey`) — per-chain list + schema-driven `+New` initiation.
- **Thread** (`/thread/:chainKey/:id`) — two-sided cross-role transaction detail.
- **Deal Desk** (`/deals`) — author/track deals; `/new` is the transaction picker (deep-links Ledger `?compose=1`).
- **`/surface/:key`** — one parametric route renders `SURFACE_REGISTRY['<role>:<key>']` (static allow-list in [surfaces.tsx](open-energy-platform/pages/src/meridian/surfaces.tsx)) for non-chain surfaces (master-data CRUD, settings, analytics/ML, connectors).

The chain registry [src/utils/chain-registry-meridian.ts](open-energy-platform/src/utils/chain-registry-meridian.ts) (`MERIDIAN_CHAINS`) is the source of truth for every chain's table/columns/lanes/actions. **Security invariant:** those SQL identifiers come exclusively from that static literal, never from request input; request values only ever bind to `?` placeholders.

### Feature-depth rubric (load-bearing for any new work)

A scorecard the team agreed on 2026-05-15. New surfaces should target **L4** by default:
- **L1** — mock UI only
- **L2** — CRUD endpoints + list/form UI ("level 2") — explicitly not acceptable for new features
- **L3** — state machine + server-side validation + audit on transitions
- **L4** — full workflow: pre-trade gating, downstream cascades, calendar/timer-driven, structured reason codes, dunning/escalation, evidence chain
- **L5** — regulator-grade: tamper-evident audit, certified exports (NERSA/EMIR), reconciliation against external systems

If asked to "add" something, default-question whether deepening an existing surface is the right move.

### AI assists

No AI tabs or popups. AI shows up as inline cards in workflow surfaces, each with a "why" + a 1-click accept. See `buildTraderAiSuggestions` etc. in [src/routes/launch.ts](open-energy-platform/src/routes/launch.ts), `explainRejection` in [src/utils/rejection-explainer.ts](open-energy-platform/src/utils/), and `ai_decisions` table for the audit trail. The `AI` binding (Workers AI) does not need external keys.

## CI/CD

Two workflows in [.github/workflows/](.github/workflows/):

1. **CI/CD - Build and Deploy** ([deploy.yml](.github/workflows/deploy.yml)) — runs on every push to `main`. Builds SPA → vitest → applies migrations (with the 049/050/051+ band logic above) → `wrangler deploy` → also deploys the legacy Pages mirror.
2. **Smoke — full test suite** ([smoke.yml](.github/workflows/smoke.yml)) — runs on every push (unit + SPA build only) and nightly at 03:17 UTC (full prod smoke: crud + roles + cron + Playwright). `smoke-prod` is gated on `schedule || workflow_dispatch` to protect the prod rate-limiter from per-contributor PR runs. Manual dispatch: `gh workflow run smoke.yml`.

The full prod smoke takes ~10 minutes because of mandatory 120s pauses between bash scripts to drain the auth rate-limit window.

## graphify-first development (mandatory)

A knowledge graph of the entire codebase lives at `graphify-out/graph.json` (25,279 nodes · 40,179 edges · 855 communities, built 2026-06-06).

**Before building anything new:**
1. Query the graph: `/graphify query "<what you're about to build>"` — understand what already exists and what connects.
2. Check god nodes: `index.ts` (656 edges), `fireCascade()` (655), `getCurrentUser()` (446), `HonoEnv` (349), `cascade.ts` (337) — every new module integrates through these.
3. Check community: new chains belong with their spec+test in the same community cluster. The 855 communities map 1:1 to modules; a new chain creates a new community.

**Do not build without querying first.** The graph catches: duplicate functionality, missing cascade wiring, broken auth integration, skipped SLA sweep hookup.

To rebuild the graph after significant changes: `/graphify open-energy-platform`

## Documents to read for context

| Doc | When to read |
|---|---|
| [README.md](README.md) | High-level pitch; roles + landing pages table |
| [open-energy-platform/README.md](open-energy-platform/README.md) | Module-level feature catalogue; API surface highlights |
| [DATABASE_INFRASTRUCTURE_GUIDE.md](docs/architecture/DATABASE_INFRASTRUCTURE_GUIDE.md) | Sharded D1 strategy; R2 vault layout; KV TTLs; migration discipline |
| [NATIONAL_DEPLOYMENT_EVALUATION.md](docs/operations/NATIONAL_DEPLOYMENT_EVALUATION.md) | Per-role readiness audit for SA national rollout |
| [GO_LIVE_READINESS.md](docs/operations/GO_LIVE_READINESS.md) | Honest go-live ledger — already-fixed P1 issues, remaining caveats |
| [TESTING_VALIDATION_CHECKLIST.md](docs/operations/TESTING_VALIDATION_CHECKLIST.md) | The per-role functional UAT matrix |
| [open-energy-platform/tests/load/README.md](open-energy-platform/tests/load/README.md) | k6 scenarios, SLO thresholds, calibration to SA grid trading-hour profile |
