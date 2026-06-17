# Open Energy Platform

> **Live**: [https://oe.vantax.co.za](https://oe.vantax.co.za) · workers.dev fallback: `open-energy-platform.reshigan-085.workers.dev`

A unified energy exchange for South Africa — power trading, carbon markets, IPP project lifecycle, settlement, and regulatory compliance — built as a single Cloudflare Worker with a static-asset React SPA, D1 (SQLite) primary, R2 vault, KV cache, and Durable Objects for the order-book matching engine.

```
┌──────────────────────────────────────────────────────────────────────┐
│  React SPA (Vite + Tailwind + Recharts + Material Symbols)           │
│    • 35 pages across 9 roles, served from /pages/dist via [assets]   │
│    • Brand: Navy/Blue/Teal/Sky · Metropolis / IBM Plex Sans / JBM   │
└──────────────────────────────────────────────────────────────────────┘
                              │  /api/*
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Hono Worker (src/index.ts)                                          │
│    • 491 routes across 51 modules                                    │
│    • Auth: HS256 JWT + KV-cached tenant resolution                   │
│    • Cascade engine fans events → action queues, briefings, audit    │
└────────┬───────────┬──────────┬───────────┬──────────────────────────┘
         │           │          │           │
         ▼           ▼          ▼           ▼
       D1          R2         KV     Durable Objects
     (204 tbl)  (vault)   (caches)  (OrderBook, Risk, Smart, Escrow)
```

## What's where

| Path | What it is |
|---|---|
| `open-energy-platform/src/index.ts` | Hono entry point with all `app.route()` mounts and the `scheduled()` cron dispatcher |
| `open-energy-platform/src/routes/` | 347 route modules aggregated in [mount-routes.ts](open-energy-platform/src/routes/mount-routes.ts) (`auth`, `horizon`, `ledger`, `onboarding`, `ona`, plus one module per chain — `covenant-certificate`, `take-or-pay`, `reserve-activation`, …) |
| `open-energy-platform/src/middleware/auth.ts` | `authMiddleware` + `optionalAuth` + `requireRole` + `getCurrentUser`. Sets `c.get('auth').user`. |
| `open-energy-platform/src/utils/` | Shared: `cascade.ts`, `ai.ts`, `tenant.ts`, `asoba.ts` (ASOBA Cloud client), matching engine helpers |
| `open-energy-platform/src/do/` | Durable Object classes (OrderBook is the only one currently bound) |
| `open-energy-platform/migrations/` | 508 numbered migrations (highest `508_add_carbon_chain_tier_columns.sql`), wired via `wrangler.toml::migrations_dir`. The 019–050 band is irregular — see "Migration discipline" in [CLAUDE.md](CLAUDE.md). |
| `open-energy-platform/pages/` | The **Meridian** Vite/React SPA. `pages/src/meridian/` holds the surfaces (Horizon, Atlas, Ledger, Thread, Deal Desk); `pages/src/meridian/MeridianFrame.tsx` is the single chrome wrapper. |
| `open-energy-platform/wrangler.toml` | Worker name, [assets] binding, D1/R2/KV/AI bindings, custom domain `oe.vantax.co.za`, cron triggers |

## Roles & landing pages

Every role logs into the same **Meridian** chrome. Post-login goes to `/onboard` on first visit, then `/horizon` (the role's computed live workspace) thereafter; `/atlas` (⌘K) is the function library. Legacy per-role paths (`/cockpit`, `/trading`, `/projects`, `/om`, `/carbon`, `/procurement`, `/grid`, `/regulator-suite`, …) now redirect to `/horizon`.

| Role | Demo email (`Demo@2024!`) | Lands on |
|---|---|---|
| `admin` | `admin@openenergy.co.za` | `/horizon` (all-role oversight) |
| `trader` | `trader@openenergy.co.za` | `/horizon` |
| `ipp_developer` | `ipp@openenergy.co.za` · `wind@openenergy.co.za` | `/horizon` |
| `carbon_fund` | `carbon@openenergy.co.za` | `/horizon` |
| `offtaker` | `offtaker@openenergy.co.za` | `/horizon` |
| `lender` | `lender@openenergy.co.za` | `/horizon` |
| `grid_operator` | `grid@openenergy.co.za` | `/horizon` |
| `regulator` | `regulator@openenergy.co.za` | `/horizon` |
| `support` | `support@openenergy.co.za` | `/horizon` |

ESCO/O&M (`esums_owner`, which shares ESCO lanes via `laneRoleFor`) and `epc_contractor` are also live Meridian roles.

## Local development

```bash
# Worker (API)
cd open-energy-platform
npm install
wrangler d1 migrations apply open-energy-db --local
wrangler dev          # http://localhost:8787

# SPA
cd pages
npm install
npm run dev           # http://localhost:3000
```

Wrangler `dev` runs the Worker against a local D1 SQLite file; the SPA dev server proxies `/api/*` to it.

## Deploy

```bash
./deploy.sh
# or directly:
cd open-energy-platform/pages && npm run build
cd .. && wrangler deploy
```

Pre-reqs (one-time):

```bash
wrangler login
wrangler d1 create open-energy-db
wrangler kv:namespace create OE_KV
wrangler r2 bucket create open-energy-vault
wrangler d1 migrations apply open-energy-db --remote
wrangler secret put JWT_SECRET
wrangler secret put ASOBA_API_KEY
wrangler secret put AZURE_AD_CLIENT_SECRET
wrangler secret put BACKUP_TOKEN
```

## ASOBA Cloud integration

Live solar IPP telemetry + OODA fault detection is wired into the ESCO/O&M Meridian surfaces (and the `/api/ona/*` endpoints below):

- `src/utils/asoba.ts` — Worker-compatible HTTP client wrapping the documented telemetry/inverter, telemetry/site, telemetry/data-period, ooda/terminal, ooda/site, ooda/data-period endpoints with `fetch + x-api-key`. The official `@asoba/ona-sdk` package targets Node and uses `require('https')`, so it's not bundleable into a Worker.
- `src/routes/ona.ts` — exposes `/api/ona/asoba/status`, `/sites/:id/data-period`, `/sites/:id/telemetry`, `/sites/:id/inverter/:asset/telemetry`, `/sites/:id/alerts`, `/sites/:id/alerts/:terminal`, `/sites/:id/sync`. The `sync` action persists 24h of telemetry + critical alerts into D1 and promotes high/critical OODA alerts into `ona_faults` with `source='asoba'`, firing the `ona.fault_created` cascade.

API key is held in Worker secret `ASOBA_API_KEY`. Base URLs are in `wrangler.toml::[vars]`.

## Documents

| Doc | What |
|---|---|
| [DATABASE_INFRASTRUCTURE_GUIDE.md](./DATABASE_INFRASTRUCTURE_GUIDE.md) | Sharded D1 strategy, R2 vault layout, KV TTLs, migration discipline |
| [NATIONAL_DEPLOYMENT_EVALUATION.md](./NATIONAL_DEPLOYMENT_EVALUATION.md) | Readiness audit across all 9 roles for SA national deployment |
| [ROLE_FEATURE_IMPLEMENTATION_GUIDE.md](./ROLE_FEATURE_IMPLEMENTATION_GUIDE.md) | Per-role feature catalogue and routing |
| [TESTING_VALIDATION_CHECKLIST.md](./TESTING_VALIDATION_CHECKLIST.md) | The actual run-through test plan + most recent live results |
| [GO_LIVE_READINESS.md](./GO_LIVE_READINESS.md) | Honest go-live assessment + open-issue ledger |

## Brand

- **Navy** `#1a3a5c` — primary, outer logo ring, "OPEN" wordmark
- **Blue** `#3b82c4` — secondary, left logo ring, "ENERGY" wordmark
- **Teal** `#1f9b95` — tertiary (sustainability/growth), right logo ring
- **Sky** `#5fa8e8` — accent (kinetic/live), centre dot
- Type: **Metropolis** (display) · **IBM Plex Sans** (body) · **JetBrains Mono** (data)
- Logo: `pages/public/logos/oe-mark.svg` and `pages/public/logos/oe-banner.svg`. React component at `pages/src/components/Logo.tsx` exports `<LogoMark>` and `<LogoBanner>`.
