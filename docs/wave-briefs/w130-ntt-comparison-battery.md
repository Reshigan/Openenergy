# W130 NTT COMPARISON BATTERY — SHIP BRIEF

PHASE D WAVE 4 OF 4 — **CLOSES PHASE D.** Continuous live comparison battery stitching W127 (anomaly LSTM-AE) + W128 (RUL Cox PH) + W129 (fault-fingerprint multi-class) against an emulated NTT IoT/O&M baseline. Produces continuously-updated, revenue-weighted, statistically significance-gated, tamper-evident "savings-vs-NTT-30%" KPI streaming into Esums dashboard hero. AGGREGATOR closing the `[[project_esums_predictive_vs_ntt]]` directive.

## Table — `oe_ntt_comparison_battery` (~98 cols + 12 state ts)
AGGREGATOR over W127/W128/W129 — each row = one COMPARISON CYCLE (typically nightly). NOT a single model.

## State machine (12 forward + 4 branch)
Forward: `cycle_proposed → baselines_synced → telemetry_window_bound → ntt_emulation_run → champion_predictions_collected → counterfactuals_computed → revenue_weighted_scored → significance_tested → savings_certified → audit_published → retraining_triggered → archived`
Branches: `flag_significance_failure → significance_failed` (SOFT — retryable) / `rollback_cycle → rolled_back` (HARD) / `recall_certification → recalled` (HARD — W130 SIGNATURE) / `activate_failover → failover_to_prior_cycle` (SOFT)

## 16 actions / 4-step authority
`ml_analyst → data_steward → CTO → CEO` (fresh terminology distinct from W127's `ml_engineer`)

## Tiers (REUSE fleet topology)
`tierForScope(assets_covered, jurisdiction_count, safety_critical)` — identical to W127/W128/W129: single_asset / small_fleet / large_fleet / multi_jurisdiction_fleet / fleet_systemic

## INVERTED SLA hours (TIGHTER than W127-W129 — cycles run regularly)
Anchor cells: `single_asset 12h → fleet_systemic 480h`. Cycles nightly; operational window must be tight enough that next cycle starts before this falls behind.

## 5 FLOOR flags
- `material_savings_threshold_breached` — `total_savings_zar > R10M` for THIS cycle
- `ntt_contract_renegotiation_trigger` — `savings_vs_ntt_pct ≥ 30` sustained 4 consecutive cycles (rolling at `certify_savings`)
- `regulator_reportable_diversion` — champion in W127/W128/W129 contradicts existing NTT certification on same asset class (>5% disagreement)
- `sox_ml_governance_required`
- `iso_42001_required`

FLOOR-AT-LARGE-FLEET ≥1 flag / FLOOR-AT-FLEET-SYSTEMIC ≥3 flags

## SIGNATURE crossings
- `recall_certification` → **EVERY tier** (W130 SIGNATURE — sister of W127/W128/W129 rollback; recall = paid out wrong numbers → SARS+NERSA+audit committee)
- `publish_audit` → EVERY tier WHEN `regulator_reportable_diversion`
- `certify_savings` → `multi_jurisdiction_fleet` + `fleet_systemic` WHEN `ntt_contract_renegotiation_trigger`
- `flag_significance_failure` → `fleet_systemic` only
- `sla_breached` → `large_fleet` + `multi_jurisdiction_fleet` + `fleet_systemic`

## LIVE 28-field battery (key fields)
`savings_vs_ntt_pct_live` (TARGET 30.0) / `cumulative_savings_zar_live` (running ledger across all cycles) / `total_savings_zar_live` / `false_positive_savings_zar_live` / `false_negative_savings_zar_live` / `paired_t_pvalue_live` / `wilcoxon_pvalue_live` / `brier_skill_score_vs_ntt_live` / `confidence_interval_{lower,upper}_zar_live` / `audit_hash_published_live` / `reconciliation_with_w71_savings_ledger_live` / 5 bridge truthies (`bridges_to_w127/w128/w129/w71/w118_live`)

## Party / authority
WRITE `{admin, support}` (same as W127/W128/W129; support = operational write surface). READ all 9 personas. No public peer endpoint — internal ML governance.

## 5 bridges (W118 MANDATORY)
- `w127_anomaly_detection_ref` → `oe_anomaly_detection_ml.id`
- `w128_rul_survival_ref` → `oe_rul_survival_model.id`
- `w129_fault_fingerprint_ref` → `oe_fault_fingerprint_model.id`
- `w71_asset_prognostics_ref` → `oe_asset_prognostics.id` (heuristic ensemble as CONTROL VARIABLE)
- `w118_block_ref` → **MANDATORY** savings-ledger hashed into W118 spine on every `publish_audit`

## Files to create
- `migrations/350_ntt_comparison_battery.sql` — table + `oe_ntt_comparison_battery_events`
- `migrations/351_ntt_comparison_battery_seed.sql` — 16 rows (all 12+4 states; SIGNATURE row `ncb-016` = fleet_systemic recalled, all 5 floor flags raised, all 5 bridges, cumulative > R100M, savings_vs_ntt_pct > 30, regulator-crossed)
- `src/utils/ntt-comparison-battery-spec.ts`
- `src/routes/ntt-comparison-battery.ts`
- `tests/ntt-comparison-battery-spec.test.ts`
- `pages/src/components/nttComparisonBattery/NttComparisonBatteryTab.tsx`

## Files to modify
- `src/index.ts` — mount route + scheduled cases
- `src/routes/launch.ts` — admin/ipp/support tiles, icon `compare_arrows`, `cta_label: 'Open NTT comparison'`
- `src/utils/cascade.ts` — `AUDIT_PREFIX_MAP: ntt_comparison_battery: 'ml'`; 17 EventTypes
- `wrangler.toml` — crons `"15 4 * * *"` + `"0 1 1 * *"`
- `pages/src/components/pages/{Admin,Ipp,Support}WorkstationPage.tsx` — tab `{ key: 'ntt-comparison-battery', label: 'NTT comparison (W130)' }`

## Crons
- `*/15 * * * *` — `nttComparisonBatterySlaSweep` (shared)
- `15 4 * * *` — **NEW** `nttComparisonBatteryNightlyCycleRunner` (06:15 SAST; walks active fleet scopes; emulation + collection in-line)
- `0 7 * * 1` — `nttComparisonBatteryModelCardExpirySweep` (shared)
- `0 1 1 * *` — **NEW** `nttComparisonBatteryMonthlyLedgerReconciliation` (03:00 SAST 1st-of-month; validates `cumulative_savings_zar` vs W71 control; emits regulator-relevant event if drift > 5%)

## Esums dashboard hook
Hero card reads `savings_vs_ntt_pct_live` + `cumulative_savings_zar_live` + `total_savings_zar_live` off the LATEST non-rolled-back W130 row. Pin to Esums hero.

## Workstation mount (3)
Admin / IPP / Support. Hero CTA icon `compare_arrows`. Title `NTT comparison (W130)`.

## Verify
1. `wrangler d1 migrations apply open-energy-db --remote` lands 350/351
2. `npm run check && npm run check:pages && npm test` green
3. GET `/api/ntt-comparison-battery` returns 16 rows; SIGNATURE `ncb-016` shows tier=fleet_systemic, authority=CEO, all 5 floor flags=1, cumulative_savings_zar_live > 100M, savings_vs_ntt_pct_live > 30, all 5 bridges non-null, regulator_crossed_at = `2026-05-30T13:00:00Z`, regulator_ref = `W130-NCB-RECALL-2026-0016`
4. `ncb-001` (single_asset cycle_proposed) `sla_target_hours` = 12
5. Tile present on admin+ipp+support with icon `compare_arrows`
6. `/api/launch/support` exposes `dashboard.esums.savings_vs_ntt_pct_live` + `cumulative_savings_zar_live`; both numeric, pct ≥ 30
7. Audit-chain `?entity_type=ml` shows W127+W128+W129+W130 events all under `ml`
8. `wrangler cron list` includes `15 4 * * *` + `0 1 1 * *`
9. End-to-end propose → sync → bind → emulate advances chain_status + writes event rows

## Commit message
```
feat(w130): ntt-comparison battery — live savings-vs-NTT-30% closes Phase D 4/4; aggregator over W127+W128+W129 + W71 control + W118 mandatory hashing; recall_certification crosses regulator EVERY tier
```

## Out-of-scope (Phase F+)
- Bayesian credible intervals on savings (frequentist CI only for now)
- Live A/B between two champion ensembles (single champion per W127/W128/W129)
- Customer-facing NTT comparison report PDF

## Gotchas
- **CF edge cache** `_headers no-store /*` — verify `curl -I https://oe.vantax.co.za/admin-platform/workstation?tab=ntt-comparison-battery`
- **`login_or_cached support@openenergy.co.za`** FULL email
- **Hono basePath collision silent** — mount `app.route('/api/ntt-comparison-battery', ...)` and curl prod after deploy
- **JWT roles suffixed** — `ipp_developer`, `support` short, role checks must include suffixed forms
- **Migration ledger band** — 350/351 idempotent CREATE TABLE IF NOT EXISTS; `wrangler d1 migrations list --remote` will show 049-056 "to be applied" — don't fix the ledger
- **D1 100-col edge** — 98 + 12 state ts = 110 total. If `CREATE TABLE` rejects, drop 4 reconciliation-pct cols into events payload JSON and revive in LIVE battery
- **Replay-safe seed** — `INSERT OR IGNORE` per CI replay convention
- **Phase-D `ml` namespace** — DO NOT create `'savings'` namespace; W127/W128/W129/W130 all share `'ml'` (W118 partition assumes one prefix per Phase-D family)
- **Cron `0 1 1 * *`** clear vs existing monthly (02:00 invoice / 04:00 W119 / 05:00 W120)
- **Cron `15 4 * * *`** clear vs 02:30 W127 drift + 04:30 W127 drift completion
- **`savings_vs_ntt_pct_live` POSITIVE = we beat NTT** — same polarity as W127's `ntt_baseline_comparison_pct`
- **First `15 4 * * *` fire in prod** must update Esums hero — if dashboard hook order-by misses non-rolled-back filter, fix `launch.ts`
- **Protected dirty-tree skip list** — focused `git add` only on W130 files; never `--amend`
- **MEMORY.md already 4× over limit** — wave-index one-liner ≤200 chars
