# Nightly Dependency Graph — Cron Read/Write/Effect Ground Truth

> Ground truth from `git` HEAD `261b955c` — traced from every function dispatched by `scheduled()` →
> `runCron()` ([src/index.ts](../../open-energy-platform/src/index.ts)) to table-level SQL, one helper level
> deep. Authoritative source is the CODE, not `CLAUDE.md`; where they disagree the code wins (§1.6 lists the
> disagreements). This is ground-truth doc 2 of 3 for the ground-up rebuild ([REBUILD_PLAN.md](REBUILD_PLAN.md)
> §4 Time): the nightly minute-offsets in `wrangler.toml` ARE the undocumented dependency graph. The rebuild's
> timer sweeper subsumes 27 of these 33 schedules; the 7 genuine crons that survive are marked **KEEP**.
> (No date stamp — this tree bans `Date.now()`; provenance is the git sha above.)

## 1. Cross-cutting findings (read these first)

### 1.1 `fireCascade` transitive footprint

Every `fireCascade(...)` call ([src/utils/cascade.ts:2520](../../open-energy-platform/src/utils/cascade.ts))
transitively touches, beyond whatever the caller wrote:

- **WRITES:** `audit_logs` (INSERT), `notifications` (INSERT, one row per resolved recipient) — batched
  via `tryBatchAuditAndNotifications`, per-stage fallback on batch failure; `oe_platform_events` (via
  analytics sink); `cascade_dlq` (INSERT/UPDATE on terminal stage failure).
- **EFFECTS:** outbound webhook delivery (`deliverWebhooks`, fire-and-forget HTTP); optional handoff to
  `env.QUEUE` when the Queue binding exists.
- Deeper stages (2+ levels, not fully traced): `autoAppendAudit` → audit-chain table,
  `runCascadeRegistry`, `recordPlatformEvent`, `computeAndRecordFee` (registry/analytics/fee tables).

So any row below that lists a `fireCascade` event implicitly also writes the four cascade tables.

### 1.2 Route-vs-cron cascade asymmetry (load-bearing bug class)

Cron wiring calls **exported functions directly**, but for several domains the cascade/audit calls live
only in the **HTTP route handlers** that wrap those functions. On the cron path these fire **no cascade,
no audit log, no notification**:

| Function | Cascade that HTTP path fires but cron path does NOT |
|---|---|
| `executeSettlementRun` (settlement-automation.ts) | `settlement.run_started` (POST /runs handler only) |
| `executeImbalanceRun` (imbalance.ts) | `imbalance.run_completed` / `run_failed` (POST /runs handler only) |
| `computeLatePaymentFees` (business-depth.ts) | none anywhere — silent on both paths |
| `pnlAttributionT1EodOpener` (pnl-attribution-chain.ts) | opener never cascades (sibling `pnlAttributionSlaSweep` does) |
| `materializeFinancials` (esums-accruals.ts) | `esums_financials_materialized` + `notifications` INSERT (POST /backfill/finalize only) |
| `buildDailyMerkleRoots` (audit-l5.ts) | `audit.merkle_root_published` (admin /merkle/build handler only) |

**Rebuild consequence:** in the new engine effects are declared on the transition, so timer-fired and
user-fired paths cannot diverge. This table is the regression list proving why.

### 1.3 Stubs (declared in wrangler.toml, do nothing)

- `runPfmiDisclosureSweep` (`0 6 1 * *`) — logs `cron_pfmi_disclosure_sweep_not_implemented`, returns.
- `runTradingRiskMtdDigest` (`0 15 * * 5`) — logs `cron_trading_risk_mtd_digest_not_implemented`, returns.

### 1.4 Sole R2 writer

`publishChainHeadToR2` is the **only** function in all 33 schedules that writes R2. Binding resolved at
runtime `AUDIT_ANCHOR → VAULT → R2`; key `audit-anchor/<date>/<hour>.json`. Everything else is D1-only
(plus the external HTTP effects listed per-row). In the rebuild this becomes the L1 daily anchor job — one
of the 7 KEEP crons.

### 1.5 `runAllSweeps` shape

No dynamic discovery: a static ~145-tuple `SWEEPS` array ([src/utils/sweep-runner.ts:484](../../open-energy-platform/src/utils/sweep-runner.ts)),
run under `Promise.allSettled` with per-sweep catch (one failure never blocks the rest). The runner itself
touches no tables. Generic sweep shape — **inferred from 5 sampled sweeps** (`kycSlaSweep`,
`warrantyClaimSlaSweep`, `procurementSlaSweep`, `tradeReportingSlaSweep`, `supportTicketSlaSweep`);
individual sweeps may touch more:

1. READ own domain table for rows past `sla_deadline` where `sla_breached = 0` and status non-terminal.
2. WRITE: UPDATE domain table (`sla_breached = 1` / status advance) + INSERT `oe_<domain>_events` row +
   INSERT `regulator_inbox` for regulator-reportable breaches.
3. EFFECT: `fireCascade` SLA-breach event (e.g. `kyc_evt_sla_breached`) → §1.1 footprint.

Some sweeps use `advisory_locks`; not verified per-sweep. In the rebuild all 145 collapse into rows in the
`timer` table fired by the single `*/5` sweeper.

### 1.6 Canonical pattern → handler dispatch table

One row per declared cron pattern (33 total, byte-identical in `[triggers]` and
`[env.live.triggers]`). Handlers in the exact **dispatch (`await`) order** inside each
`runCron` `case` ([src/index.ts:246-526](../../open-energy-platform/src/index.ts)); source
file is where each is defined (imports at `src/index.ts:16-74`). Each handler is wrapped in
`safe()` — one failing job logs `cron_job_failed` and the case continues. §2 gives the
table-level R/W/FX for each.

| Cron pattern | Handlers in dispatch order | Source file(s) |
|---|---|---|
| `*/15 * * * *` | `runSurveillanceScan` → `runTradingSurveillanceScan` → `dispatchAllForwarders` → `runAllSweeps` → `runDealSweep` → `snapshotAllOrderBooks` | regulator-suite.ts; trading-clearing-l5.ts; siem.ts; utils/sweep-runner.ts; deals.ts; utils/cron-sweeps.ts |
| `0 * * * *` | `solax_hourly_ingest` (loop `backfillStationHistory`) → `inverter_hourly_record` (loop `recordStationHourly`) → `publishVwapMarks` | esums-accruals.ts (×2); utils/cron-sweeps.ts |
| `5 0 * * *` | `esums_accruals` (loop `computeStationAccruals`; then per-owner `materializeFinancials` + `fireCascade('esums_financials_materialized')`) → `runFaultEngine` → `computeLatePaymentFees` → `rollupMetrics(yesterday)` → `auditChainDailyReconcileSweep` → `regulatorExportDailyRefreshSweep` → `reconciliationAttestationMonthlyAuditCommitteePackSweep` → `controlEnvironmentAuditNightlyEvidenceCoverageSweep` → `nttComparisonBatteryNightlyCycleRunner` → `runTelemetryRollupAndPurge` → `buildDailyMerkleRoots(yesterday)` → `publishChainHeadToR2` → cascade DLQ purge (inline DELETE) | esums-accruals.ts + utils/cascade.ts; utils/esums-fault-engine.ts; business-depth.ts; utils/metrics-rollup.ts; audit-chain.ts; regulator-export.ts; reconciliation-attestation.ts; control-environment-audit.ts; ntt-comparison-battery.ts; utils/telemetry-retention.ts; audit-l5.ts; utils/audit-chain.ts |
| `10 0 * * *` | `executeSettlementRun(runId,'ppa_energy',yesterday,yesterday)` | settlement-automation.ts |
| `15 0 * * *` | `ippScheduleHealthRecompute` (W112) | ipp-schedule-chain.ts |
| `20 0 * * *` | `ippEvmHealthRecompute` (W113) | ipp-evm-chain.ts |
| `25 0 * * *` | `ippDocControlIdcMatrixRecompute` (W114) | ipp-document-control-chain.ts |
| `30 0 * * *` | `executeImbalanceRun(imbRunId,yesterday,today)` → `verifyChain` → `buildDailyMerkleRoots(yesterday)` → `runMarginCallCycle` | imbalance.ts; utils/audit-chain.ts; audit-l5.ts; utils/cron-sweeps.ts |
| `35 0 * * *` | `ippRfiAgingRefresh` (W116) | ipp-rfi.ts |
| `40 0 * * *` | `ippChangeOrderCumPctRefresh` (W117) | ipp-change-order.ts |
| `45 0 * * *` | `runWatershedAnomalyScan` → `runMaturityRefresh` → `auditChainDailyReconcileSweep` → `verifyChain` | utils/cron-sweeps.ts (×2); audit-chain.ts; utils/audit-chain.ts |
| `50 0 * * *` | `regulatorExportDailyRefreshSweep` (W119) | regulator-export.ts |
| `55 0 * * *` | `reconciliationAttestationVarianceRecomputeSweep` (W120) | reconciliation-attestation.ts |
| `58 0 * * *` | `controlEnvironmentAuditNightlyEvidenceCoverageSweep` (W121) | control-environment-audit.ts |
| `5 * * * *` | `auditChainHourlyProposeSweep` (W118) | audit-chain.ts |
| `0 3 1 1,4,7,10 *` | `auditChainQuarterlyExportSweep` (W118) | audit-chain.ts |
| `0 2 1 * *` | `runMonthlySubscriptionBilling` → `regulatorExportMonthlyRollupSweep` → `controlEnvironmentAuditAnnualAuditCycleOpenerSweep` → `nttComparisonBatteryMonthlyLedgerReconciliation` → `auditChainQuarterlyExportSweep` | subscription-billing-chain.ts; regulator-export.ts; control-environment-audit.ts; ntt-comparison-battery.ts; audit-chain.ts |
| `0 4 1 * *` | `regulatorExportMonthlyRollupSweep` (W119) | regulator-export.ts |
| `0 5 1 * *` | `reconciliationAttestationMonthlyAuditCommitteePackSweep` (W120) | reconciliation-attestation.ts |
| `0 6 1 1 *` | `controlEnvironmentAuditAnnualAuditCycleOpenerSweep` (W121) | control-environment-audit.ts |
| `0 6 * * 1` | `stageGateConditionsAgingSweep` (W131) | stage-gate.ts |
| `0 7 * * 1` | `scadaConnectorCertExpirySweep` (W122) | scada-connector.ts |
| `30 1 * * *` | `strateSwiftConnectorReconciliationSweep` (W124) | strate-swift-connector.ts |
| `45 1 * * *` | `sapOracleErpConnectorReconciliationSweep` (W125) | sap-oracle-erp-connector.ts |
| `0 2 * * *` | `governmentFilingConnectorFilingDeadlineSweep` (W126) | government-filing-connector.ts |
| `30 2 * * *` | `anomalyDetectionMlDriftScan` (W127) | anomaly-detection-ml.ts |
| `0 3 * * *` | `rulPredictionMlConcordanceMonitor` (W128) | rul-prediction-ml.ts |
| `30 3 * * *` | `faultFingerprintMlClassDriftScan` (W129) | fault-fingerprint-ml.ts |
| `15 4 * * *` | `nttComparisonBatteryNightlyCycleRunner` (W130) | ntt-comparison-battery.ts |
| `0 1 1 * *` | `nttComparisonBatteryMonthlyLedgerReconciliation` (W130) | ntt-comparison-battery.ts |
| `0 15 * * 5` | `runTradingRiskMtdDigest` (**STUB**, §1.3) | utils/cron-sweeps.ts |
| `0 6 1 * *` | `runPfmiDisclosureSweep` (**STUB**, §1.3) | utils/cron-sweeps.ts |
| `0 18 * * *` | `pnlAttributionT1EodOpener` (W111) | pnl-attribution-chain.ts |

### 1.7 Regression guard: `cron-contract` test

[tests/cron-contract.test.ts](../../open-energy-platform/tests/cron-contract.test.ts) parses **both**
`crons = [...]` arrays from `wrangler.toml` and every `case '<pattern>':` in `runCron`, then asserts each
declared pattern has a matching case (failure names the missing pattern), that `runCron` has ≥33 cases, and
— specifically — that the `45 0 * * *` case is **not** an empty `break` (the original P0 watershed-no-op
bug). This is the guard against a silent "declared-but-unhandled cron" regression. The v2 rebuild must keep
an equivalent declared-pattern ⇔ dispatch-case contract test.

### 1.8 CLAUDE.md vs code discrepancies (code wins)

No dispatch-level disagreement — every declared pattern maps to the case CLAUDE.md's prose assigns it. The
discrepancies are omitted handlers and loose function naming in the CLAUDE.md "Cron triggers" summary:

1. **`0 * * * *`** — CLAUDE.md says "SolaX hourly ingest + VWAP mark publish". Code also runs
   `inverter_hourly_record` (`recordStationHourly`, non-solax/Sungrow) between the two.
2. **`5 0 * * *`** — CLAUDE.md lists the accrual rollup but omits that `esums_accruals` also runs
   `materializeFinancials` per owner + `fireCascade('esums_financials_materialized')`. This is the step the
   `computeLatePaymentFees` invoice dependency (§3.4) hangs on, so the omission is load-bearing.
3. **`0 2 1 * *`** — CLAUDE.md calls the members "control-env / NTT / audit-chain monthly rollups". The
   actual functions are `controlEnvironmentAuditAnnualAuditCycleOpenerSweep` (the *annual cycle opener*, run
   monthly), `nttComparisonBatteryMonthlyLedgerReconciliation`, and `auditChainQuarterlyExportSweep` (the
   *quarterly export*, run monthly). Trust the function names in §1.6.
4. **W120 has three distinct entry points** that CLAUDE.md conflates: the *monthly audit-committee pack*
   sweep runs nightly at `5 0` **and** monthly at `0 5 1`, while the *variance recompute* is the separate
   `55 0` slot. Four W119/W121/W130 sweeps likewise re-run in the `5 0` omnibus AND at a dedicated later
   slot (`regulatorExportDailyRefreshSweep` also `50 0`; `controlEnvironmentAuditNightlyEvidenceCoverageSweep`
   also `58 0`; `nttComparisonBatteryNightlyCycleRunner` also `15 4`) — idempotent both times; the rebuild
   can collapse each pair.

## 2. Per-schedule trace

Legend: R = tables read, W = tables written, FX = external effects. `fireCascade` rows imply §1.1 tables.

### `*/15 * * * *` — surveillance + SLA sweeps + snapshots

| Function | R | W | FX |
|---|---|---|---|
| `runSurveillanceScan` (regulator-suite.ts:776) — **KEEP** (FMA §80–84) | regulator_surveillance_rules (5-min cache), regulator_surveillance_alerts, trade_matches ⋈ trade_orders | regulator_surveillance_alerts | fireCascade `regulator.surveillance_alert_raised` (critical/high only) |
| `runTradingSurveillanceScan` (trading-clearing-l5.ts:204) — **KEEP** | trade_fills | oe_surveillance_alerts | none |
| `dispatchAllForwarders` (siem.ts:203) | siem_forwarders, siem_forwarder_cursors, audit_logs, popia_pii_access_log, cascade_dlq, error_log | siem_forwarder_cursors (upsert), siem_forwarders (status/counters) | HTTP POST to vendor SIEM endpoints; KV read for forwarder secret |
| `runAllSweeps` (sweep-runner.ts:484) | ~145 domain tables (§1.5) | same + `oe_<domain>_events` + regulator_inbox | fireCascade per breach |
| `runDealSweep` (deals.ts:479) | oe_deal_requests, oe_deal_offers | oe_deal_offers (expire/clear), oe_deal_requests (cleared), advisory_locks | fireCascade `deal.cleared` per cleared auction |
| `snapshotAllOrderBooks` (cron-sweeps.ts:193) | trade_orders (DISTINCT shard_key) | none directly (DO persists internally) | DO call: `ORDER_BOOK` stub `POST /snapshot` per shard; no-op if binding absent |

### `0 * * * *` — hourly ingest + marks — **KEEP** (SolaX/Sungrow ingest, VWAP publish)

| Function | R | W | FX |
|---|---|---|---|
| `recordStationHourly` (esums-accruals.ts:248) — includes `computeStationAccruals` (:45) | solax_stations ⋈ manufacturer_credentials, station_telemetry_snapshot, site_accruals | station_telemetry_snapshot, site_accruals, esums_carbon_credits (if carbon_participant_id; errors swallowed), esums_settlement_invoices (if offtaker_participant_id; errors swallowed), om_sites, om_devices, om_telemetry | HTTP → SolaX cloud (`openapi-eu.solaxcloud.com`) / Sungrow iSolarCloud (`gateway.isolarcloud.eu`); fireCascade `esums_accrual_computed` |
| `publishVwapMarks` (cron-sweeps.ts:39) | trade_fills ⋈ trade_orders | mark_prices (INSERT OR REPLACE) | none |

Related non-cron: `backfillStationHistory` (:343) R solax_stations⋈manufacturer_credentials, W site_accruals/om_sites/om_devices/om_telemetry (chunked 100/batch), HTTP `getHistoricalData` SolaX, **no cascade** (bypasses computeStationAccruals). `materializeFinancials` (:1023) R site_accruals⋈solax_stations, W esums_settlement_invoices, esums_carbon_credits, carbon_projects (FK provisioning), carbon_holdings — all INSERT…SELECT, no effects in function (§1.2).

### `5 * * * *` — audit-chain hourly block

| Function | R | W | FX |
|---|---|---|---|
| `auditChainHourlyProposeSweep` (audit-chain.ts) | oe_audit_chain_block | oe_audit_chain_block (new block), oe_audit_chain_block_events | fireCascade `audit_chain_block_proposed` |

### The nightly ladder (`5 0` → `58 0`) — order is the dependency graph

| Offset | Function(s) | R | W | FX |
|---|---|---|---|---|
| `5 0` | metering + ONA rollups, fault engine, late fees, metrics rollup, audit reconcile, W119/W120/W121 refreshes, NTT nightly, telemetry rollup/purge, Merkle roots, **R2 anchor**, DLQ purge — details below | | | |
| `10 0` | `executeSettlementRun` (settlement-automation.ts:429) | contract_documents ⋈ ipp_projects, ipp_projects, metering_readings ⋈ grid_connections, grid_connections | invoices, settlement_run_events, settlement_dlq (per-invoice error), settlement_runs (completed/failed) | **none on cron path** (§1.2) |
| `15 0`–`40 0`, `0 6 * * 1` | 6 IPP recomputes: `ippScheduleHealthRecompute`, `ippEvmHealthRecompute`, `ippDocControlIdcMatrixRecompute`, `ippRfiAgingRefresh`, `ippChangeOrderCumPctRefresh`, `stageGateConditionsAgingSweep` | own table only (oe_ipp_schedule / oe_ipp_evm / oe_ipp_document_control / oe_ipp_rfi / oe_ipp_change_order / oe_stage_gates) | same table | only stage-gate: fireCascade `stage_gate.conditions_set` per stale gate |
| `30 0` | `executeImbalanceRun` (imbalance.ts:357) | brp_period_nominations, imbalance_prices, imbalance_settlements (month rebuild) | imbalance_settlements (upsert batch), imbalance_monthly_totals (upsert) | **none on cron path** (§1.2) |
| `30 0` | `verifyChain` (audit-chain.ts) | audit_events, audit_chain_state | audit_chain_state (last_verified_*, only if scanned > 0) | none |
| `30 0` | `runMarginCallCycle` (cron-sweeps.ts:72) | oe_margin_calls (open/partial past deadline) | oe_margin_calls (→ escalated) | fireCascade `trader.margin_call_escalated` (failure swallowed) |
| `45 0` | `runWatershedAnomalyScan` (cron-sweeps.ts:111) | esg_activity_transactions (self-join) | esg_anomaly_flags (INSERT OR IGNORE) | none |
| `45 0` | `runMaturityRefresh` (cron-sweeps.ts:162) | climate_maturity_assessments | climate_maturity_assessments (band) | none |
| `45 0` | `auditChainDailyReconcileSweep` | oe_audit_chain_block | oe_audit_chain_block (live indexes; break counters on detected link break) | none |
| `50 0` | `regulatorExportDailyRefreshSweep` | oe_regulator_export_pack | same (index/health fields) | none |
| `55 0` | `reconciliationAttestationVarianceRecomputeSweep` | oe_reconciliation_attestation | same | none |
| `58 0` | `controlEnvironmentAuditNightlyEvidenceCoverageSweep` | oe_control_environment_audit | same | none |

**`5 0` detail** (the big fan-out) — **KEEP** the rollup+Merkle+anchor portion:

| Function | R | W | FX |
|---|---|---|---|
| `runFaultEngine` (esums-fault-engine.ts:105) | om_sites, om_devices, om_faults (idempotency), om_telemetry (×2) | om_faults (per-row errors swallowed) | none — fully self-contained |
| `computeLatePaymentFees` (business-depth.ts:308) | oe_prime_rate, invoices | invoices (→ overdue), oe_late_payment_fees (INSERT…ON CONFLICT DO NOTHING + UPDATE accrual) | none (§1.2) |
| `rollupMetrics` (metrics-rollup.ts:28) — helper `computeOpenTerminal` reads oe_platform_events only | oe_platform_events, oe_metrics_daily | oe_metrics_daily, oe_chain_metrics (batched upserts) | none |
| `runTelemetryRollupAndPurge` (telemetry-retention.ts:17) | om_retention_policy, om_telemetry, om_telemetry_daily ⋈ om_sites | om_telemetry_daily, om_telemetry_weekly, **om_telemetry DELETE** (purge > raw_keep_days) | none |
| `buildDailyMerkleRoots` (audit-l5.ts) | audit_events (DISTINCT entity_types + per-entity content_hash) | oe_audit_merkle_roots (INSERT OR REPLACE) | none on cron path (§1.2) |
| `publishChainHeadToR2` (audit-chain.ts) — **KEEP** | audit_chain_anchors, audit_chain_state | audit_chain_anchors | **R2 put** `audit-anchor/<date>/<hour>.json` (§1.4) |
| cascade DLQ purge | cascade_dlq | cascade_dlq DELETE | none |

### Other nightlies / weeklies

| Schedule | Function | R | W | FX |
|---|---|---|---|---|
| `30 1 * * *` | `strateSwiftConnectorReconciliationSweep` | oe_strate_swift_connector | same | none |
| `45 1 * * *` | `sapOracleErpConnectorReconciliationSweep` | oe_sap_oracle_erp_connector | same | none |
| `0 2 * * *` | `governmentFilingConnectorFilingDeadlineSweep` | oe_government_filing_connector | same | none |
| `30 2 * * *` | `anomalyDetectionMlDriftScan` — **KEEP** (ML monitor) | oe_anomaly_detection_ml | same | none |
| `0 3 * * *` | `rulPredictionMlConcordanceMonitor` — **KEEP** (ML monitor) | oe_rul_prediction_ml | same | none |
| `30 3 * * *` | `faultFingerprintMlClassDriftScan` — **KEEP** (ML monitor) | oe_fault_fingerprint_ml | same | none |
| `15 4 * * *` | `nttComparisonBatteryNightlyCycleRunner` | oe_ntt_comparison_battery | same | none |
| `0 18 * * *` | `pnlAttributionT1EodOpener` (pnl-attribution-chain.ts:1021) | oe_pnl_attribution (active books 7d + per-book opened-today check) | oe_pnl_attribution (day_open row/book), oe_pnl_attribution_events | none (§1.2) |
| `0 7 * * 1` | `scadaConnectorCertExpirySweep` | oe_scada_connector | same | none |
| `0 15 * * 5` | `runTradingRiskMtdDigest` | — | — | **STUB** (§1.3) |

### Monthlies / quarterly / annual

| Schedule | Function | R | W | FX |
|---|---|---|---|---|
| `0 2 1 * *` | `runMonthlySubscriptionBilling` (subscription-billing-chain.ts:337) | participants (active billable tiers), oe_subscription_invoices (idempotency check) | oe_subscription_invoices (draft/participant) | fireCascade `billing_evt_generated` per invoice |
| `0 2 1 * *` | platform invoice run + regulator-export / control-env / NTT / audit-chain monthly rollups | per-domain tables | same | none |
| `0 4 1 * *` | `regulatorExportMonthlyRollupSweep` | oe_regulator_export_pack | same (regulator_relevant/is_reportable) | none |
| `0 5 1 * *` | `reconciliationAttestationMonthlyAuditCommitteePackSweep` | oe_reconciliation_attestation | same | none |
| `0 1 1 * *` | `nttComparisonBatteryMonthlyLedgerReconciliation` (ntt-comparison-battery.ts:1495) | oe_ntt_comparison_battery | same + oe_ntt_comparison_battery_events (only on drift > floor) | fireCascade `ntt_comparison_battery_audit_published` (`crosses_into_regulator: true`) |
| `0 3 1 1,4,7,10 *` | `auditChainQuarterlyExportSweep` | oe_audit_chain_block | same (is_reportable/regulator_relevant) | fireCascade `audit_chain_quarterly_export_ready` per flagged block |
| `0 6 1 1 *` | `controlEnvironmentAuditAnnualAuditCycleOpenerSweep` | oe_control_environment_audit | same + oe_control_environment_audit_events (annual_cycle_opened) | none — event row written but **not dispatched** |
| `0 6 1 * *` | `runPfmiDisclosureSweep` | — | — | **STUB** (§1.3) |

## 3. Ordering dependencies (why the minute-offsets exist)

Edges derived from the table footprints above — this is the graph the rebuild's timer classes must preserve:

1. **`0 * hourly ingest` → `5 0 telemetry rollup/purge` → `5 0 fault engine`** — `om_telemetry` is written
   hourly, rolled up and **purged** nightly; the fault engine reads the raw window, so it must run before
   the purge deletes its input (both at `5 0`; ordering inside the tick is code order, not cron order — fragile).
2. **`0 * hourly ingest` (site_accruals) → `materializeFinancials`** (backfill path) → carbon/settlement tables.
3. **`5 0 metering rollups` (metering_readings) → `10 0 executeSettlementRun`** — settlement reads
   metering_readings; the 5-minute gap is the only thing sequencing them.
4. **`10 0 settlement` (invoices) → next night's `5 0 computeLatePaymentFees`** — late fees run BEFORE the
   same night's settlement, so a new invoice's first overdue check happens ~19h later. Intentional-looking
   but undocumented anywhere except the offsets.
5. **all-day `fireCascade` (oe_platform_events) → `5 0 rollupMetrics`** — metrics are a projection of the
   platform-event stream; the cron asymmetry in §1.2 means cron-path work is invisible to metrics.
6. **`5 * hourly block propose` (oe_audit_chain_block) → `45 0 daily reconcile` → `0 3 quarterly export`**.
7. **all-day `appendAudit` (audit_events) → `5 0 buildDailyMerkleRoots` → `5 0/30 0 verifyChain`
   (audit_chain_state) → `5 0 publishChainHeadToR2`** — the integrity ladder. In the rebuild this is L1's
   seal → root → anchor pipeline with a monotonic seal counter instead of wall-clock offsets.
8. **`fireCascade` failures (cascade_dlq) → `*/15 dispatchAllForwarders` (SIEM) and → `5 0 DLQ purge`** —
   the purge and the forwarder cursor race: rows purged before a slow forwarder's cursor reaches them are
   never delivered. No guard exists.
9. **`*/15 runAllSweeps` (regulator_inbox, oe_<domain>_events) → `50 0/55 0/58 0` W119–W121 recomputes** —
   the compliance indexes recompute over what the day's sweeps flagged.

## 4. Rebuild mapping

- **27 of 33 schedules → `timer` table rows** fired by one `*/5` sweeper (`applyTransition`,
  `actor: system:timer`): every SLA sweep, recompute, opener, escalation, reconciliation above whose trace
  is "read own table, update own table, maybe cascade."
- **7 KEEP crons:** SolaX/Sungrow hourly ingest, VWAP publish, nightly rollup+Merkle+R2 anchor (one job),
  `*/15` surveillance (both scans — FMA §80–84), 3 ML drift monitors.
- **Deleted by design:** the §1.2 asymmetry class (effects declared on transitions), the §3.1 in-tick
  ordering fragility (purge becomes a retention policy on the telemetry store, never on the event log),
  the §3.8 DLQ/SIEM race (outbox with per-consumer cursors, purge gated on all cursors past the row).

## 5. Caveats

- `fireCascade` internals traced one level; stages 2+ deep (registry, fees, queue consumers) not enumerated.
- The 145-sweep generic shape is inferred from 5 samples (§1.5).
- Whether `esums_accrual_computed` produces notification rows depends on `determineNotificationRecipients`
  rules — not verified.
- Regeneration: re-run the five trace prompts in git history for this doc, or grep `runCron` in
  src/index.ts and trace each `case` to table-level SQL.
