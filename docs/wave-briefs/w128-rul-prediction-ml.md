# W128 RUL PREDICTION ML — SHIP BRIEF

PHASE D WAVE 2 OF 4. Survival/Cox PH ML model replacing W71 OLS-style degradation slope. Sister of W127.

## Chain (12 forward + 4 branch)
model_proposed → survival_dataset_bound → features_engineered → train_test_split → model_trained → backtest_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived
Branches: drift_detected / rolled_back / recalled / failover_to_ols

## 16 actions
propose_model / bind_survival_dataset / engineer_features / split_train_test / train_model / backtest / calibrate / deploy_shadow / activate_live_ab / promote_champion / retrain / archive / detect_drift / rollback_model / recall_model / activate_failover_to_ols

## 5 tiers × INVERTED SLA (hours @ model_proposed)
single_asset 24 / small_fleet 96 / large_fleet 240 / multi_jurisdiction_fleet 480 / fleet_systemic 720
SLA matrix per state mirrors W127 with LONGER shadow (72-1080h) and LONGER survival_dataset_bound (48-720h).

## 5 floor flags (FLOOR-AT-LARGE ≥1 / FLOOR-AT-SYSTEMIC ≥3)
safety_critical_rul / regulator_reportable_rul_quantile / nerc_cip_audit_in_scope / sox_ml_governance_required / iso_42001_ai_management_required

## LIVE 28-field battery (survival-specific 12 + governance 10 + bridges 5 + SLA 1)
concordance_index_live (Harrell C) / time_dependent_auc_live / brier_score_live / partial_likelihood_live / ph_assumption_pvalue_live (Schoenfeld) / ph_violated_count_live / kaplan_meier_lift_vs_ols_live / rul_p10_p50_p90_days_live / censoring_rate_live / model_family_live (cox_ph|aft|deepsurv|rsf|xgb_surv) / reconciliation_with_w71_ols_live / ntt_baseline_comparison_pct_live + standard governance + 5 bridges + sla_breached_live

## SIGNATURE crossings
- rollback_model → EVERY tier (W128-RUL-ROLLBACK — second Phase-D hard line)
- recall_model → EVERY tier WHEN safety_critical_rul
- detect_drift → large+ tiers WHEN regulator_reportable_rul_quantile OR (PH violated AND systemic)
- activate_failover_to_ols → multi+systemic only
- sla_breached → large+ tiers only
- promote_champion → fleet_systemic WHEN iso_42001 (W128-UNIQUE — replacing OLS at systemic scale)

## WRITE {admin, support}; 4-step authority
ml_engineer (propose→backtest) → data_steward (calibrate/shadow/drift/failover) → CTO (live_ab/promote/retrain/rollback) → CEO (archive/recall)

## 5 bridges (W71 + W118 MANDATORY)
w71_asset_prognostics_ref (NOT NULL — the OLS baseline this REPLACES — needed for KM-lift + reconciliation) / w21_lender_drawdown / w77_reserve_account / w63_warranty_recovery / w118_block_ref MANDATORY

## Cross-mount + icon
Admin + Ipp + Support tab `rul-prediction-ml`. Hero icon `query_stats`.

## Route + namespace
`/api/rul-prediction-ml`; POST `/` propose; event prefix `rul_prediction_ml_evt_`; AUDIT_PREFIX_MAP `rul_prediction_ml: 'ml'` (JOINS W127 namespace).

## Crons
SLA `*/15 * * * *` shared + NEW `0 3 * * *` daily concordance-monitor (30min after W127 drift scan) + shared `0 7 * * 1` model-card expiry.

## Files to create
- migrations/346_rul_prediction_ml.sql (DDL ~95 cols + events + 10 indexes)
- migrations/347_rul_prediction_ml_seed.sql (16 rows rul-001..rul-016)
- src/utils/rul-prediction-ml-spec.ts
- src/routes/rul-prediction-ml.ts
- tests/rul-prediction-ml-spec.test.ts
- pages/src/components/rulPredictionMl/RulPredictionMlTab.tsx

## Files to modify
- src/index.ts (mount + 3 cron wires)
- src/utils/cascade.ts (event union + AUDIT_PREFIX_MAP)
- src/routes/launch.ts (3 hero CTAs admin/ipp/support, query_stats icon)
- wrangler.toml (NEW `0 3 * * *` cron)
- pages/src/components/pages/AdminWorkstationPage.tsx + IppWorkstationPage.tsx + SupportWorkstationPage.tsx (tab registration)

## Signature row (rul-016)
fleet_systemic / CEO / rolled_back / ALL 5 floor flags / ALL 5 bridges / regulator_ref=W128-RUL-ROLLBACK-2026-0016 + ISO42001-RPT-2026-0017.

## Commit message head
`feat(w128): RUL Prediction ML Model chain — SECOND Phase-D wave`

## Gotchas
- W71 bridge NOT NULL constraint (different from W127's single mandatory W118 bridge)
- promote_champion regulator crossing is W128-unique (W127 doesn't have this)
- INVERTED SLA (larger fleet = LONGER runway) — document at top of spec
- JWT roles suffixed (ipp_developer, grid_operator, carbon_fund)
- login_or_cached FULL email
- D1 seed: ASCII IDs, bare NULL, no apostrophes, exact column count
- Hono trailing-slash quirk: test POST `/` AND `/api/rul-prediction-ml/`
- TS1382 `>` in JSX → use `{'>='}` and `{'<'}`
- AUDIT_PREFIX_MAP `rul_prediction_ml: 'ml'` JOINS W127 namespace
- CF edge SPA cache: `_headers` must keep `no-store` on `/*`
