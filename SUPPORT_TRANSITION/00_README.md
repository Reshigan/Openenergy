# Support Transition Pack - Open Energy / CEC Platform

This pack hands the running system over to the support team. It is written so a
new support engineer with no prior context can operate the platform, validate it
end to end in the sandbox, create real transactions, and respond to incidents.

Everything in this pack is grounded in the actual code, `wrangler.toml`,
`CLAUDE.md`, and the deploy scripts in the repository. Where a detail could not
be verified from the code it is flagged inline as `FLAG:`.

## What this platform is

Open Energy is a South African energy exchange: power trading, carbon credits,
IPP (independent power producer) lifecycle, settlement, and regulatory
compliance. It is one Cloudflare Worker that serves a React single-page app
(the "Meridian" chrome) and handles `/api/*` via Hono. It is aligned to ERA
2006, the NERSA Grid Code, POPIA, the Carbon Tax Act, REIPPPP, and JSE-SRL.

It runs in two completely separate environments:

| Environment | Domain | Worker | Purpose |
|---|---|---|---|
| Demo | oe.vantax.co.za | `open-energy-platform` | Showcase, 9 demo personas, safe to break |
| Live (CEC) | cec.vantax.co.za | `cec-energy-platform` | Real orgs (Goldrush, GoNXT, Envera, Growvest), real SolaX data |

The two share source code and the SPA bundle and nothing else: separate D1
databases, separate KV, separate secrets, separate cron state. A demo login
does not work on live and live data never appears on demo.

## How to read this pack (suggested order)

| Doc | Read it to learn |
|---|---|
| `00_README.md` (this file) | What the pack is, the glossary, the fastest way in |
| `01_SYSTEM_OVERVIEW.md` | The architecture: Worker, routes, chains, cascades, DOs, cron, data planes |
| `02_SANDBOX_TEST_GUIDE.md` | A full end-to-end walkthrough validating every subsystem in the sandbox |
| `03_CREATE_TRANSACTIONS_WALKTHROUGH.md` | Step-by-step: create real transactions in each role, watch the cascades |
| `04_FEATURES_BY_ROLE.md` | The complete feature catalogue per role, every chain mapped to its table |
| `05_OPERATIONS_RUNBOOK.md` | Deploy, health checks, cron, auth limits, migration discipline, incidents |
| `06_DATA_FLOWS.md` | How data moves: login, a mutation, the cascade fan-out, settlement, telemetry |

New engineer fast path: read `01`, then DO `02` against the demo environment
with your own hands. After that the rest is reference.

## The sandbox

The demo environment (oe.vantax.co.za) is the sandbox. It is safe to create,
mutate, and delete anything there. It is seeded with 9 personas you log in as to
exercise every role. Use it for all of `02` and `03`.

Do NOT run destructive tests against live (cec.vantax.co.za). Live carries real
org data and real SolaX meter readings.

## Glossary

| Term | Meaning |
|---|---|
| Meridian | The single full-canvas SPA chrome wrapping every authenticated page |
| Horizon | Per-role live workspace (`/horizon`); shows the role's active work |
| Atlas | Function library / discovery surface (`/atlas`, opens with Cmd+K) |
| Ledger | Per-chain list + "+New" initiation (`/ledger/:chainKey`) |
| Thread | Two-sided cross-role transaction detail (`/thread/:chainKey/:id`) |
| Chain | A state-machine workflow (e.g. PPA settlement, carbon MRV). 207 exist. |
| Cascade | The fan-out fired on every meaningful mutation: queues, audit, notifications, webhooks |
| Cascade DLQ | Dead-letter table holding terminal cascade-stage failures for retry |
| Durable Object | Cloudflare stateful object; `OrderBook` (one per energy_type x delivery_day shard) |
| D1 | Cloudflare's SQLite database; the platform's main store |
| SolaX | The inverter cloud API the live env imports real generation data from |
| Site accruals | The financial data plane: hourly kWh/revenue/carbon per site |
| om_telemetry | The telemetry data plane: per-device readings feeding O&M + predictive ML |
| Persona | A seeded demo login standing in for a role |
| Role | One of the 9+ user types: trader, ipp, offtaker, lender, carbon, regulator, grid, support, admin (plus esco/epc) |

## Quick reference (most-used facts)

- Login limiter: 10 logins / 5 minutes / IP on `POST /api/auth/login`. Cache tokens.
- JWT: HS256, 1-hour TTL, in `Authorization: Bearer` and SPA `localStorage['token']`.
- Demo personas: password `Demo@2024!`, emails `<role>@openenergy.co.za`.
- Live admin + org logins: see `CEC_LIVE_LOGINS.txt` (gitignored, never committed).
- Health: `GET /api/health` (open, 200), `GET /api/health/deep` (admin, per-binding).
- Demo deploy: push to `main` or `./deploy.sh`. Live deploy: `./deploy-live.sh` only.
