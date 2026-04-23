# Open Energy Platform

A comprehensive energy trading and management platform built with React, TypeScript, and Cloudflare Workers. Aligned to South African statutory frameworks (ERA 2006, NERSA Grid Code, POPIA 4/2013, Carbon Tax Act 15/2019, REIPPPP, JSE-SRL), designed to run at national scale.

## Features

### Core modules

- **Cockpit**: Role-aware KPI tiles + action queue per signed-in user.
- **Trading**: Order book + Durable Object matching engine (price-time priority, partial fills, IOC/FOK/market/limit, per-shard depth snapshots, minute-bucketed ticker).
- **Contracts**: Document lifecycle (LOI → term sheet → HOA → legal review → statutory checks → execution → active) with per-party signatories.
- **Settlement**: Idempotent PPA settlement runs with DLQ + retry; invoices, disputes, payments.
- **Carbon**: Projects, trades, retirements, options, fund NAV.
- **IPP Projects**: Disbursements, milestones, generation performance.
- **ESG**: Reports, decarbonisation pathways, TCFD/CDP/GRI/JSE-SRL/King IV narrative templates.
- **Grid**: Connections, constraints, wheeling, metering, imbalance settlement.
- **Marketplace** / **Deal Rooms** / **Funds** / **Pipeline** / **Procurement**.
- **POPIA**: s.11(3) objection, s.24 correction, s.22 breach register, DSAR, PII access log, consent ledger.

### National-scale workbenches

Each role has a dedicated suite page with full CRUD + workflow:

- **Regulator** (`/regulator-suite`): licences + conditions + lifecycle; tariff submissions with hearing→determination; PAIA gazette; enforcement (findings/appeals); market surveillance (wash-trade / layering / spoofing / concentration / circular / price-manipulation detectors).
- **System operator** (`/grid-operator`): dispatch schedules + period breakdowns; dispatch instructions (curtail/redispatch/ramp/black-start) with ack + compliance flows; curtailment notices; ancillary-service tenders (FCR/aFRR/mFRR/reserves) with merit-order pay-as-cleared auctions; outages with real-time updates; connection applications (enquiry→energised); nodal zones + monthly loss factors.
- **Trader** (`/trader-risk`): positions rebuilt from fills; manual + VWAP mark prices; pre-trade credit check against approved limits; collateral accounts + movements; margin-call cycle; multi-lateral netting clearing runs.
- **Lender** (`/lender-suite`): covenant definitions + pass/warn/breach evaluator; waivers; Independent Engineer certification workflow; cash-flow waterfall execution; DSRA/MRA/O&M reserve accounts; stress scenarios.
- **IPP developer** (`/ipp-lifecycle`): EPC contracts + variations + capped LDs; environmental authorisations + per-condition compliance; land + servitude register; insurance register + claims; community engagement log + ED/SED spend (REIPPPP reporting).
- **Offtaker** (`/offtaker-suite`): multi-site groupings; tariff registry + TOU comparison; half-hour consumption profiles; budget-vs-actual; REC issuance / transfer / retirement; Scope 2 disclosures (GHG Protocol 2015).
- **Carbon fund** (`/carbon-registry`): registry sync (Verra, Gold Standard, CDM, SA-REDD); credit vintages with serial-range tracking; MRV workflow with ISO 14065 verifier opinions; Carbon Tax Act s.13 offset claims with industry-group cap.
- **Platform admin** (`/admin-platform`): tenants (suspend/reactivate); self-serve provisioning (approve/reject); plans + subscriptions; monthly platform invoice cycle; feature flags (off/all/percentage/by_tier/by_tenant/by_role) with overrides; data-tier snapshot + archive tools; tenant quotas (token-bucket rate limits).

### Infrastructure

- **Durable Objects** — `OrderBook` per shard (energy_type × delivery_day) serialises matching writes.
- **Cron scheduler** — 15-min surveillance scan + DO snapshots; hourly VWAP marks; daily rollups, settlement, margin run, usage snapshots; monthly platform invoicing.
- **Multi-tenancy** — explicit `tenants` + per-participant `tenant_id`; cross-tenant checks in auth middleware + resource helpers; per-tenant rate limits, feature flags, SSO providers.
- **Cascade events** — every major mutation fires typed events that write audit logs, notifications, and webhooks, with DLQ + retry per stage.
- **Data tier** — daily rollups for metering + ONA; R2 archival for metering (monthly) + audit logs (daily); migration path to Hyperdrive+Postgres documented in [docs/runbooks/data-tier-scaling-plan.md](../docs/runbooks/data-tier-scaling-plan.md).

### Security & compliance

- JWT access + refresh rotation, TOTP MFA, session revocation, login-attempt lockout.
- PBKDF2-SHA256 password hashing (Workers-native).
- Full POPIA coverage incl. breach register + PII access log.
- Per-tenant isolation enforced at the middleware layer.
- Advisory locks prevent duplicate trade matching.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Recharts
- **Backend**: Cloudflare Workers, Hono framework
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Deployment**: Cloudflare Pages + Workers

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Wrangler CLI (`npm install -g wrangler`)

### Frontend Setup

```bash
cd open-energy-platform/pages
npm install
npm run dev
```

### Backend Setup

```bash
cd open-energy-platform
npm install
wrangler dev
```

### Environment Variables

Create a `.env` file in the `pages` directory:

```env
VITE_API_URL=/api
```

For local development with Workers running:
```env
VITE_API_URL=http://localhost:8787
```

## Deployment

### GitHub Actions

The repository is configured with GitHub Actions for CI/CD. On push to `main`:

1. Build the frontend
2. Deploy to Cloudflare Pages
3. Deploy the API Worker

### Required Secrets

Configure these in GitHub repository settings:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token with Pages edit permissions
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare account ID

### Manual Deployment

```bash
# Deploy frontend to Cloudflare Pages
wrangler pages deploy open-energy-platform/pages/dist --project-name=open-energy-platform

# Deploy API Worker
cd open-energy-platform
wrangler deploy
```

## Project Structure

```
open-energy-platform/
├── pages/                 # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   │   └── pages/    # Page components
│   │   ├── lib/          # API utilities
│   │   └── context/      # React context
│   ├── dist/             # Built output
│   └── package.json
├── src/                   # Cloudflare Workers backend
│   ├── routes/           # API endpoints
│   ├── middleware/       # Auth, security
│   └── index.ts          # Worker entry
├── migrations/           # D1 database migrations
├── schema.sql           # Database schema
└── wrangler.toml        # Wrangler config
```

## API surface

All routes are mounted under `/api`. Highlights:

**Core**
- `POST /api/auth/register | login | refresh | logout`
- `GET  /api/auth/me`
- `GET  /api/cockpit/stats` — role-aware KPIs incl. national-scale metrics
- `GET  /api/cockpit/actions` — unified action queue

**Trading + risk**
- `POST /api/trading/orders` (supports `auto_match: true` to route through DO)
- `GET  /api/trading/orderbook-depth?shard_key=...`
- `GET  /api/trading/prints` — minute-bucketed ticker
- `POST /api/trader-risk/credit-limits` / `margin-calls/run` / `clearing/run`

**Regulator**
- `POST /api/regulator/licences` + `/vary | /suspend | /revoke | /reinstate`
- `POST /api/regulator/tariff-submissions/:id/hearing | /determine`
- `POST /api/regulator/enforcement-cases/:id/finding | /appeal`
- `POST /api/regulator/surveillance/scan`
- `POST /api/regulator/filing/:type/generate` — AI compliance narrative

**Grid operator**
- `POST /api/grid-operator/dispatch/schedules` (+ `/periods`, `/publish`)
- `POST /api/grid-operator/dispatch/instructions/:id/{acknowledge,compliance}`
- `POST /api/grid-operator/ancillary/tenders/:id/{bids,clear}`

**Lender**
- `POST /api/lender/covenants/:id/test | /waive`
- `POST /api/lender/ie-certifications/:id/decide`
- `POST /api/lender/waterfalls/:id/run`
- `POST /api/lender/stress/run`

**IPP + offtaker + carbon + admin** — see `/api/ipp`, `/api/offtaker-suite`, `/api/carbon-registry`, `/api/admin-platform` for the full surface.

**Settlement + data tier**
- `POST /api/settlement-auto/runs` — idempotent PPA settlement
- `POST /api/settlement-auto/ingest/push` — HMAC-authed meter ingest
- `POST /api/data-tier/metering/{rollup-day,archive-month}`

## Scheduled jobs (Cloudflare Cron Triggers)

| Cron | Job |
|---|---|
| `*/15 * * * *` | Market-surveillance scan + OrderBook DO depth snapshots |
| `0 * * * *` | VWAP mark-price computation |
| `5 0 * * *` | Daily metering + ONA rollups |
| `10 0 * * *` | Previous-day PPA settlement run |
| `30 0 * * *` | Daily usage snapshot + margin-call cycle |
| `0 2 1 * *` | Monthly platform invoice run |

## Roles

`admin`, `regulator`, `grid_operator`, `trader`, `ipp_developer`, `lender`, `carbon_fund`, `offtaker`, `support`. Each sees a dedicated workbench plus the generic modules. Admin sees everything.

## License

MIT