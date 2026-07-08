# Open Energy Platform — System Breakdown for Sizing & Costing

**Generated:** 2026-07-07 · **Basis:** live `main` (commit a912c37e) · deployed `oe.vantax.co.za` (demo) + `cec.vantax.co.za` (live).

This document inventories every element **actually in use** so it can seed capacity planning, Cloudflare cost modelling, and support/ops sizing. Numbers are pulled from the repo, not estimated, unless flagged "estimate".

---

## 1. Deployment topology

| Env | Domain | Worker name | D1 database | KV id | Queue | Purpose |
|---|---|---|---|---|---|---|
| Demo | oe.vantax.co.za | `open-energy-platform` | `open-energy-db` | `aa61…2ec2` | `open-energy-cascade` | Demo personas, sales/UAT |
| Live | cec.vantax.co.za | `cec-energy-platform` | `cec-energy-db` | `35ec…fcae` | `cec-energy-cascade` | Real orgs (Goldrush ecosystem) |

- **Single Worker per env** — one Cloudflare Worker serves `/api/*` (Hono) **and** the React SPA via the `[assets]` binding. No separate frontend host.
- R2 bucket `open-energy-vault` is **shared** across both envs; live keys are tenant-prefixed (`t_<slug>/…`).
- Named env (`live`) does **not** inherit bindings — every binding, var, cron redeclared. Two independent billing surfaces.
- Legacy Cloudflare Pages project still exists as a deploy mirror; Worker is source of truth.

---

## 2. Cloudflare resources in use (cost drivers)

Per env unless noted. These map 1:1 to Cloudflare billing lines.

| Resource | Binding | Count / config | Notes for costing |
|---|---|---|---|
| **Worker** | — | 1 per env (2 total) | Requests + CPU-ms billed. Every `/api/*` + every SPA asset miss. |
| **Static assets** | `ASSETS` | SPA `pages/dist` | Served free from Worker assets; no separate Pages/CDN bill. |
| **D1** | `DB` | 1 per env (2 total) | Rows read/written billed. 525 migrations, ~978 `CREATE TABLE` statements across history. Single 10 GB envelope until sharding activated. |
| **KV** | `KV` | 1 namespace per env | Token/session/config cache. Reads dominate. |
| **R2** | `R2` | 1 bucket (shared) | Audit vault, Merkle anchors, exports, PDFs. Storage + Class-A/B ops. |
| **Queue** | `QUEUE` | 1 per env | Cascade fan-out. `max_batch_size=50`, `max_batch_timeout=5s`. Messages billed. |
| **Durable Object** | `ORDER_BOOK` | 1 class, N instances | **One instance per shard = energy_type × delivery_day.** SQLite-backed DO. Active instances + requests + duration billed. Only DO bound (Risk/Smart/Escrow exist in code, unbound). |
| **Workers AI** | `AI` | Cloudflare-hosted models | Inline role AI assists. Neurons billed per inference. No external key. |
| **Cron triggers** | — | **33 schedules per env (66 total)** | Free to schedule; each invocation billed as Worker request + CPU. See §5. |

### Cloudflare plan implication
DO + Queues + D1 + Workers AI all require **Workers Paid ($5/mo/account minimum)** at least; volume beyond included tiers is usage-billed. Two custom domains (oe + cec) on one account.

### Sharding tiers designed but NOT yet active (future cost)
`wrangler.toml` documents 5 dormant scale tiers — activate as load grows:
1. `METERING_DB_CURRENT` — dedicated D1 for hot metering writes
2. `ESUMS_TELEMETRY_DB` — telemetry D1 (activate at 10+ sites)
3. Per-project D1 shard (`ESUMS_DB_<KEY>`, >50 sites)
4. Analytics Engine dataset `TELEMETRY` (unlimited side-write)
5. Hyperdrive → Postgres (Neon) for >10 GB / MVCC workloads

Each is an additional billing line when switched on. Baseline today = the §2 table only.

---

## 3. Application surface (code size / maintenance sizing)

| Element | Count | Source |
|---|---|---|
| API route modules | **355** (~360 mounts) | `src/routes/` |
| Backend TypeScript LOC | **~308,000** | `src/**/*.ts` |
| Frontend (SPA) LOC | **~206,000** | `pages/src/**/*.tsx?` |
| Meridian chains (business workflows) | **208** | `chain-registry-meridian.ts` |
| D1 migrations | **525** | `migrations/` |
| External connectors | **~10** | SCADA, MQTT/OPC-UA, SolaX, SAP/Oracle ERP, STRATE/SWIFT, CIPC/SARS/NERSA gov-filing, ERPA, interconnector, counterparty-margin |
| ML model surfaces | 4 | Anomaly-detection, RUL, fault-fingerprint, NTT comparison |

**Runtime dependencies are lean** (drives supply-chain/audit cost):
- Backend: `hono`, `bcryptjs`, `jsonwebtoken`, `pdf-lib`, `zod` (+ workers-types). 6 total.
- Frontend: `react`, `react-dom`, `react-router-dom`, `recharts`, `axios`, `framer-motion`, `lucide-react`, `qrcode.react`, `jspdf`, 4 self-hosted font families. 13 total.

---

## 4. Roles & tenancy (seat / support sizing)

12 demo personas (single password `Demo@2024!`), each a distinct role surface:

Admin · Solar IPP · Wind IPP · ESCO/O&M · EPC Contractor · Trader · Carbon Fund · Offtaker · Lender · Grid Operator · Regulator · OEM Support.

- **Multi-tenant**: every resource fetch resolves tenant from JWT (`utils/tenant.ts`) and enforces isolation. Seat cost scales per org × role, not per Worker.
- **Auth**: HS256/ES256 JWT, 1h TTL live / 6h demo. Microsoft Entra ID SSO wired (`sso.ts`). Rate limit 10 logins / 5 min / IP.

---

## 5. Scheduled workload (background compute sizing)

**33 cron schedules per env.** Dispatched by `scheduled()` → `runCron()` (33 `case` handlers, contract-tested). Load profile:

- **`*/15 * * * *`** (96×/day) — surveillance + trading surveillance + SIEM + all SLA sweeps + deal sweep + OrderBook depth snapshots. Highest-frequency, heaviest.
- **`0 * * * *`** (24×/day) — SolaX ingest + VWAP mark publish.
- **`5 0`…`58 0`** — nightly band: metering/ONA rollups, settlement, EVM/WBS/RFI/change-order recomputes, regulator-export/attestation/control-audit refreshes, Merkle roots, R2 anchor, DLQ purge.
- **Weekly/monthly/quarterly/annual** — SCADA cert sweep, STRATE/SWIFT + SAP/Oracle recon, gov-filing deadlines, ML drift scans, invoice + subscription billing, PFMI disclosure, audit-committee packs.

Costing note: the 15-min job is ~96 invocations/day/env = ~70k Worker invocations/year from that trigger alone; multiply across 33 schedules × 2 envs. All CPU-ms billed against Worker.

---

## 6. Test & CI footprint (QA sizing)

| Item | Count |
|---|---|
| Unit test cases (`it`/`test`) | **~7,900** across 298 test files (vitest) |
| Browser specs (Playwright) | 29 |
| Smoke scripts | crud, roles, cron (bash) + k6 load scenarios |
| CI workflows | 2 (deploy on push to main; nightly full smoke 03:17 UTC) |

Nightly prod smoke runs ~1.1h serially (rate-limiter-disciplined). Runs on GitHub Actions minutes.

---

## 7. Sizing summary (one-screen)

**Compute:** 2 Workers, 1 DO class (N shard instances), 66 cron schedules, 1 Queue consumer/env, Workers AI inference.
**Storage:** 2 D1 databases (10 GB envelope each, 5 dormant shard tiers), 2 KV namespaces, 1 shared R2 bucket.
**Code:** ~514k LOC, 355 routes, 208 chains, 525 migrations, ~10 external connectors, 4 ML surfaces.
**Users:** 12 roles, multi-tenant, SSO-capable.

**Baseline monthly floor:** Workers Paid plan ($5) + usage. Real cost is dominated by D1 rows read/written and Worker CPU-ms from the 15-min cron × 2 envs. Model those two first.

---

*Regenerate counts:* route/migration/LOC numbers via `ls`/`wc` from `open-energy-platform/`; bindings + crons from [wrangler.toml](../../open-energy-platform/wrangler.toml).
