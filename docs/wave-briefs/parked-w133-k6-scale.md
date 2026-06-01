# W133 K6 SCALE — SHIP BRIEF

PHASE E WAVE 3 OF 5. Sustain **10,000 concurrent users** + render **100,000-row lists at 60fps** under SA grid trading-peak profile. SLO gates: p50<200ms / p99<1500ms / error<0.5% / throughput >5000 req/s sustained. Closes the 50-100× gap from current 100 VU ceiling.

## Three workstreams

### A. Backend scale (Workers + D1)

**A1. KV aggregate cache for 79 chain `/aggregate` + 50 hot reads**
- New `src/utils/aggregate-cache.ts` — `cachedAggregate(env, key, ttlSec, compute)`
- Reads `aggregate:${key}` from `env.KV` (binding exists). Miss → compute → put TTL 60. Bust via `fireCascade` → `aggregate.invalidate`
- Wire top 10 hot aggregates: audit-chain, regulator-export, reconciliation-attestation, control-environment-audit, anomaly-detection-ml, scada-connector, strate-swift-connector, sap-oracle-erp-connector, government-filing-connector, mqtt-opcua-connector
- Cockpit/launch hot reads: `/api/cockpit/kpis` 60s, `/api/launch/me` 30s, `/api/watershed/portfolio-summary` 60s, `/api/esg/portfolio` 120s, `/api/marketplace/summary` 60s, `/api/trading/orderbook?energy_type=*` 5s

**A2. Move heavy nightly rollups off hot path**
- Extend 7 daily crons (00:15–00:58) to `env.KV.put('aggregate:<chain>', ...)` so GET serves KV during business hours
- Emit `aggregate.refreshed.<chain>` for observability

**A3. D1 query analysis — bound queries**
- Audit risk: `loadRiskSnapshot` (trading.ts:34-113) 4 correlated TOB subqueries — biggest D1 hot spot under 10k POST/s
  - Fix: maintain `book:tob:${shard}` KV key from `OrderBook` DO on every insert/cancel; replace 4-subquery SQL with single `env.KV.get` (-4 D1 round-trips per order POST)
- Sweep chain routes for missing LIMIT — add `LIMIT 1000` default + `?cursor=` pagination

**A4. Covering indexes — `migrations/352_scale_indexes.sql`** (clean 051+ band, all `CREATE INDEX IF NOT EXISTS`)
10 indexes for top hot query shapes:
- `idx_trade_orders_participant_status_created` on trade_orders(participant_id, status, created_at DESC)
- `idx_trade_orders_energy_status_side_price` on trade_orders(energy_type, status, side, price)
- `idx_trade_orders_status_delivery` on trade_orders(status, delivery_date, energy_type)
- `idx_trade_matches_buy_seller_matched` on trade_matches(buy_order_id, sell_order_id, matched_at DESC)
- `idx_settlement_invoices_payer_status_due` on settlement_invoices(payer_id, status, due_date)
- `idx_settlement_invoices_payee_status_due` on settlement_invoices(payee_id, status, due_date)
- `idx_settlement_payments_invoice_date` on settlement_payments(invoice_id, payment_date DESC)
- `idx_credit_limits_participant_effective` on credit_limits(participant_id, effective_from DESC)
- `idx_mark_prices_energy_delivery_mark` on mark_prices(energy_type, delivery_date, mark_date DESC)
- `idx_audit_chain_block_hash_seq` on oe_audit_chain(block_seq DESC, block_hash)

**A5. Promise.all everywhere** — audit `src/utils/cascade.ts` 4-stage fan-out (action-queue → audit → briefing → webhook); batch per-stage

**A6. DO shard heat-map**
- Spread orders across `solar/wind/battery/hydro` × 5 delivery days = 20 shards × 500 req/s = 10,000 req/s headroom
- Assert top shard < 20% of total via `/api/trading/orderbook-depth`

**A7. Out-of-scope**: Service Bindings (CPU not the bottleneck), DO autoscaling (CF manages)

### B. Frontend scale (SPA)

**B1. VirtualTable shared primitive** — `pages/src/components/ui/VirtualTable.tsx` via `@tanstack/react-virtual`
- API: `<VirtualTable rows rowHeight={36} estimateSize={36} renderRow={...} />` — visible + 5 overscan
- Preserve Bloomberg density toggle from `lib/density.ts`

**B2. Top 10 tables to convert** (raw `<table>` → `VirtualTable`):
- `WorkstationShell.tsx:322` (biggest win — every role reuses)
- `Trading.tsx`, `Carbon.tsx` (3 tables), `IppWorkstationPage.tsx:162`, `OpsL5Page.tsx:693`, `Reports.tsx:346`, `SettlementDlqPage.tsx:127`, `Pipeline.tsx`, `BillingRunDetailPage.tsx`, `LenderWorkoutPage.tsx`, `EsumsOmPortalView.tsx`

**B3. React Query** — `pages/src/main.tsx` wrap in `QueryClientProvider`
Defaults: `staleTime: 60_000`, `gcTime: 300_000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: 'always'`. Existing `api.get().then()` callers stay; new aggregate hooks use RQ.

**B4. Hot-aggregate hook** — `pages/src/hooks/useAggregateCached.ts`
`useAggregateCached(chainKey)` → `useQuery({ queryKey: ['aggregate', chainKey], queryFn: ..., staleTime: 60_000 })`
Lazy: only fires when tab is mounted (need `lazy={true}` tab option in `WorkstationShell`)

**B5. Bundle / code-split** — `pages/vite.config.ts`
- Keep `vendor-react` chunk (react+react-dom+react-router-dom+qrcode.react+recharts+lucide-react+framer-motion) — avoid createContext race
- Route-level `React.lazy()`: `LaunchRedirect`, every `*WorkstationPage`, `Reports`, `OpsL5Page`, `Carbon`, `Trading`, `Funds` + `<Suspense fallback={<Skeleton />}>` in `App.tsx`
- `build.chunkSizeWarningLimit: 300`
- Target: main < 800 KB (from 1.9 MB), no chunk > 300 KB
- **Gate merge on createContext-race not reappearing** via Playwright (`tests/video/teaser.spec.ts` exercises full SPA)

**B6. Memoization + Web Vitals budget**
- `useMemo` chart containers (Trading/Carbon/Esums prognostics)
- Add `web-vitals` 4.x → `/api/telemetry/web-vitals` via `lib/rum.ts`
- Playwright budget: top 10 workstations LCP<2.5s / INP<200ms / CLS<0.1

### C. Load test framework (k6 + Playwright)

**C1. Five new scenarios** (all reuse `lib/login.js` token-cache pattern)
- `scenario-trading-peak-10k.js` — ramping-vus 5min→30min @ 10k VU → 5min ramp-down; spread across 20 shards (4 energy × 5 delivery days); 50-account persona pool; thresholds: failed<0.5%, p50<200ms, p99<1500ms, auth_429==0, >5000 req/s sustained
- `scenario-settlement-eod.js` — 5k VU 5-min EOD burst; GET invoices → ack 1-3 → settle 1; ack/settle p99<2000ms, fail<0.5%
- `scenario-regulator-inbox-burst.js` — 100 VU poll + 200 raise via admin in <60s; read p99<800ms, raise p99<2000ms
- `scenario-workstation-mount-storm.js` — 50 personas × 6 tabs = 300 simultaneous aggregates in <2s; p99<500ms (validates A1 KV cache)
- `scenario-100k-list-render.spec.ts` (Playwright) — `/api/admin/seed/large-list?n=100000`; mount workstation, first paint <5s, 30s scroll ≥55fps via rAF sampling, `<60` DOM rows always

**C2. SLO gates in CI** — `tests/load/slo-gates.test.ts`
Vitest reads k6 `--summary-export=summary.json`, asserts p50/p99/error/throughput. Wire into `.github/workflows/smoke.yml` **nightly only** (not per-PR — prod rate-limiter + 10k VU burns budget). Manual: `gh workflow run smoke.yml -f scenario=trading-peak-10k`

## Files to create
- `tests/load/scenario-{trading-peak-10k,settlement-eod,regulator-inbox-burst,workstation-mount-storm}.js`
- `tests/load/scenario-100k-list-render.spec.ts`
- `tests/load/slo-gates.test.ts`
- `pages/src/components/ui/VirtualTable.tsx`
- `pages/src/hooks/useAggregateCached.ts`
- `src/utils/aggregate-cache.ts`
- `migrations/352_scale_indexes.sql`
- `docs/scale/W133_SCALE_REPORT.md`

## Files to modify
- 10 chain route files (audit-chain, regulator-export, reconciliation-attestation, control-environment-audit, anomaly-detection-ml, scada-connector, strate-swift-connector, sap-oracle-erp-connector, government-filing-connector, mqtt-opcua-connector) — wrap `/aggregate` in `cachedAggregate`
- `src/routes/{cockpit,launch,watershed,esg,marketplace}.ts` — KV-cache top reads
- `src/routes/trading.ts` — replace 4-subquery TOB block (82-107) with `env.KV.get('book:tob:${shard}')`
- `src/do/order-book.ts` — write TOB summary to KV on insert/cancel
- `src/utils/cascade.ts` — `Promise.all` per fan-out stage
- `pages/package.json` — add `@tanstack/react-virtual`, `@tanstack/react-query`, `web-vitals`
- `pages/src/main.tsx` — `QueryClientProvider`
- `pages/vite.config.ts` — `manualChunks`, route-lazy, `chunkSizeWarningLimit: 300`
- `pages/src/App.tsx` — `React.lazy()` per workstation route + Suspense
- `pages/src/components/launch/WorkstationShell.tsx` — convert table (line 322), add `lazy` tab option
- 10 SPA pages — `<table>` → `<VirtualTable>` (see B2)
- `pages/src/lib/rum.ts` — web-vitals reporting
- `wrangler.toml` — NO new namespace (existing KV binding reused)
- `tests/load/README.md` — document 5 new scenarios + SLO numbers + 10k profile
- `.github/workflows/smoke.yml` — nightly k6 SLO gate

## Expected before/after (for W133_SCALE_REPORT.md)
| Metric | Before (100 VU) | Target (10k VU) |
|---|---|---|
| order POST p50 | ~180ms | <200ms |
| order POST p99 | ~890ms | <1500ms |
| orderbook GET p99 | ~412ms | <500ms |
| failure rate | 0% | <0.5% |
| Throughput sustained | ~100 req/s | >5000 req/s |
| SPA main bundle | 1.9 MB | <800 KB |
| Workstation LCP | unmeasured | <2.5s |
| 100k-row first paint | crashes | <5s + 60fps scroll |

## Verify
1. `npm run check && npm run check:pages && npm test` green
2. `wrangler d1 migrations apply open-energy-db --local` lands 352
3. `cd pages && npm run build` — main <800KB, no chunk >300KB
4. `BASE=https://staging.../  k6 run --summary-export=summary.json tests/load/scenario-trading-peak-10k.js`
5. `npx vitest run tests/load/slo-gates.test.ts` passes
6. `npx playwright test tests/load/scenario-100k-list-render.spec.ts`

## Commit message
```
feat(w133): scale to 10k concurrent + 100k-row virtualization — KV aggregate cache, covering indexes, VirtualTable, k6 SLO gates
```

## Out-of-scope
- DO autoscaling per region (CF manages)
- R2 vault scale (CDN-fronted)
- Multi-region active/active D1 (Phase F)
- Service Bindings (CPU not bottleneck — D1 is)

## Gotchas
- **Protected-tree skip list** — skip `pages/src/components/launch/audit/*`, `IppPortal/treeLocked/*`, anything `// PROTECTED — wave audit tree`. VirtualTable rollouts skip
- **`login_or_cached trader@openenergy.co.za`** FULL email — `"trader"` burns 1 of 10 auth slots with 400
- **Demo password `Demo@2024!`** exact
- **D1 migration discipline** — 352 idempotent CREATE INDEX IF NOT EXISTS; DO NOT touch d1_migrations ledger; DO NOT "fix" 019-048 skip or 050 reconcile in deploy.yml (load-bearing CI)
- **Rate limiter 10/5min/IP** on `/api/auth/login` — k6 reuses VU-local token cache via `tests/load/lib/login.js`; never per-iteration login
- **CF edge cache** — KV-cached aggregate responses must set `Cache-Control: private, max-age=0, must-revalidate` so edge doesn't double-cache and bypass 60s TTL on writes
- **JWT roles suffixed** — `regulator` short, `grid_operator`, `ipp_developer`, `carbon_fund` suffixed; k6 persona pool spread + DO shard test use full claim
- **createContext race**: keep `vendor-react` single chunk (react+react-dom+react-router-dom+qrcode.react+recharts+lucide-react+framer-motion); gate merge on Playwright `tests/video/teaser.spec.ts` not regressing
- **MEMORY.md already 4× over limit** — wave-index one-liner ≤200 chars
