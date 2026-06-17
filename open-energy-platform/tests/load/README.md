# Load tests — k6

Pre-launch load harness for `oe.vantax.co.za`. Three scenarios calibrated to
the SA grid trading-hour profile we expect at national rollout.

## Install

```sh
brew install k6                       # macOS
# or:   docker run --rm -i grafana/k6 ...   # CI / one-off
```

## Run

```sh
# Set once per shell session. Each scenario mints its persona tokens ONCE in
# k6's setup() (≤9 logins total) and shares them across all VUs, so even a
# 200-VU run never trips the 10/5-min/IP sensitive-route auth limiter. The
# BASE+PASSWORD pair is the only thing that has to come from the env.
export BASE=https://oe.vantax.co.za
export DEMO_PASSWORD='Demo@2024!'

# Trading peak — 100 traders, 10-minute hold at peak load.
k6 run tests/load/scenario-trading-peak.js

# Read-heavy — 200 dashboard viewers (regulator + offtaker browsing).
k6 run tests/load/scenario-read-heavy.js

# Settlement window — 50 offtakers paying invoices in a tight 5-min window
# (mirrors the EOD settlement cron's traffic shape).
k6 run tests/load/scenario-settlement-burst.js
```

To target a staging Worker, set `BASE=https://open-energy-platform.reshigan-085.workers.dev`.

## Calibration — SA grid trading-hour profile

Sized against [NATIONAL_DEPLOYMENT_EVALUATION.md](../../../NATIONAL_DEPLOYMENT_EVALUATION.md):

| Scenario | Concurrent VUs | Peak throughput | Realistic load source |
|---|---|---|---|
| Trading peak | 100 | ~1,000 orders/min | NERSA-licensed traders at SAST 07:00–09:00 dispatch window |
| Read-heavy | 200 | ~20,000 GET/min | Regulator + offtaker dashboards refreshing during business hours |
| Settlement burst | 50 | ~500 POST/min | EOD settlement run + counterparty acknowledgements |

## SLO thresholds

Set inside each scenario's `options.thresholds`. The harness exits non-zero if
any threshold breaches — that's what gates the go-live decision.

| Metric | SLO | Why |
|---|---|---|
| `http_req_failed` rate | < 1% | National-scale reliability target |
| Read p95 | < 500 ms | Dashboards must feel responsive on 4G |
| Order POST p95 | < 1,500 ms | Pre-trade risk gating + DO matching + audit hash chain |
| Settlement POST p95 | < 2,000 ms | Calendar lookup + line items + cascade fan-out |
| `auth_429` count | 0 | Rate limiter must not trip during legitimate load |

## What to watch in Cloudflare while a run executes

- **Workers Analytics** → Errors panel (expect zero 5xx; non-zero 4xx are
  pre-trade rejections, which are normal under load).
- **D1 Analytics** → query latency (the read-heavy scenario will tell you
  whether you're approaching the 1,000-row scan threshold on listings).
- **Durable Objects** → request rate per OrderBook shard.
- `wrangler tail` in a side terminal — captures any silent 500 paths the
  k6 thresholds wouldn't see (e.g. partial writes).

## Interpreting results

A clean run looks like:

```
checks.........................: 100.00% ✓ 18234   ✗ 0
http_req_failed................: 0.00%   ✓ 0       ✗ 18234
http_req_duration..............: avg=187ms p(95)=412ms p(99)=890ms
auth_429.......................: 0
```

If `http_req_failed` is non-zero, inspect the per-endpoint table k6 prints at
the end — usually one of: D1 column drift (schema mismatch), Worker CPU limit
breach (`exceeded CPU limit` in Workers logs), or hitting the
500-request-per-DO-per-second limit on a hot OrderBook shard.
