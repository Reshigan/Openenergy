# Load testing — Open Energy Platform

k6 harness for validating the platform can sustain national-peak traffic.

## Why k6

Cloudflare Workers scale horizontally, but every request still crosses D1 /
KV / Durable Objects bindings that have finite per-region limits. These
scenarios exercise the hot read paths (cockpit, metering ingest, matching,
imbalance settlement) to surface:

- p50 / p95 / p99 latency under load
- D1 query-count thresholds (hot paths should be 0 D1 on cache hit)
- SSE stream saturation (realtime fanout)
- DO shard hot-spotting under concurrent order placement

## Install

    brew install k6

## Environment

    export BASE_URL=https://open-energy-platform.reshigan-085.workers.dev
    export JWT=<valid JWT from /api/auth/login, role=admin>

## Scenarios

| File | Shape | Models |
|------|-------|--------|
| `scenarios/cockpit-read.js` | 200 VUs × 60s ramp | Mass login — dashboards, modules, profile, participants |
| `scenarios/metering-ingest.js` | 100 VUs × 5m | Continuous 30-min period writes across 50 sites |
| `scenarios/matching-burst.js` | 500 VUs × 2m | Order placement burst on the exchange DO |
| `scenarios/imbalance-run.js` | Grid-op settlement | End-of-day imbalance run over 48 × 30-min periods |
| `scenarios/full-day.js` | Composite | All four scenarios run concurrently (worst-case) |

## Running

    # Single scenario:
    k6 run load/scenarios/cockpit-read.js

    # All four under composite load:
    k6 run load/scenarios/full-day.js

    # Emit a JSON summary for CI:
    k6 run --summary-export=load/report.json load/scenarios/cockpit-read.js

## Target SLOs

| Metric                    | Target |
|---------------------------|--------|
| http_req_duration p95     | < 500 ms (read), < 1500 ms (settlement) |
| http_req_failed           | < 0.5% |
| iterations                | >= configured steady-state |

Scenarios set per-test thresholds that fail the run if SLOs are breached —
CI can gate deploys on this.

## Safety — do NOT run against a seeded tenant without coordination

Metering-ingest and matching-burst write real rows. Use a dedicated
load-test tenant (see `.env.load-test`) or run against the wrangler dev
server:

    wrangler dev --remote
    BASE_URL=http://localhost:8787 k6 run load/scenarios/cockpit-read.js
