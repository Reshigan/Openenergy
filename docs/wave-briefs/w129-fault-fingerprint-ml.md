# W129 FAULT-FINGERPRINT ML — SHIP BRIEF

PHASE D WAVE 3 OF 4. Multi-class fault classifier replacing W71's 12-mode physics rules. 12-state P6 on `oe_fault_fingerprint_ml`. Joins `ml` audit namespace W127 opened. INVERTED SLA between W127's 720h and W128's 1080h. 4-model-family ensemble (XGBoost/RandomForest/GradientBoosting/CNN-1D + LightGBM/CatBoost/baseline_physics fallback).

## State machine (16 states)
`model_proposed → labeled_dataset_bound → class_imbalance_resolved → features_engineered → train_test_split → multiclass_model_trained → confusion_matrix_validated → calibrated → shadow_deployed → live_ab_active → champion_promoted → retrained → archived` (HARD)
Branches: `class_drift_detected` (SOFT) / `rolled_back` (HARD) / `recalled` (HARD) / `failover_to_physics_baseline` (SOFT — W71 takes over inference) / `add_novel_class` (loops back to `multiclass_model_trained`, EU AI Act Art 14 product-class-change)

## SLA matrix (INVERTED hours at model_proposed)
single_asset 36 / small_fleet 120 / large_fleet 300 / multi_jurisdiction_fleet 600 / fleet_systemic 900

## FLOOR flags (re-derived every transition)
`safety_critical_fault_class` / `regulator_reportable_misclass` / `nerc_cip_audit_in_scope` / `sox_ml_governance_required` / `iso_42001_required`
- FLOOR-AT-LARGE-FLEET when ≥1 flag
- FLOOR-AT-FLEET-SYSTEMIC when ≥3 flags

## SIGNATURE crossings
- `rollback_model` → EVERY tier (inherits W127-ML-ROLLBACK Phase-D hard line)
- `recall_model` → EVERY tier WHEN `safety_critical_fault_class`
- `detect_class_drift` → HEAVY tiers WHEN `regulator_reportable_misclass`
- `failover_to_physics_baseline` → `multi_jurisdiction_fleet` + `fleet_systemic`
- `add_novel_class` → `fleet_systemic` only (product-class change)
- `sla_breached` → HEAVY tiers only

## 12 fault modes (inherited from W71)
inverter_igbt_degradation / dc_arc_fault / transformer_thermal / battery_thermal_runaway / panel_hotspot / blade_pitch_imbalance / gearbox_bearing / yaw_misalignment / tracker_motor / combiner_box / generator_winding / converter_capacitor_aging

## LIVE 28-field battery (multi-class metrics)
`macro_f1` / `micro_f1` / `weighted_recall` / `top_3_accuracy` / `log_loss` / `roc_auc_macro` / `confusion_matrix_density` / `class_imbalance_ratio` / `calibration_brier` / `class_drift_psi` / `novel_class_detection_rate` / `reconciliation_with_w71_physics_pct` / `ntt_baseline_comparison_pct` + standard governance fields. **Persisted columns ~98 (kept under D1 100-col cap).** Confusion matrix is a single TEXT JSON column.

## Party / authority
WRITE `{admin, support}`. READ all 9 personas. Internal ML governance — no mTLS, no public peer.
4-step authority: `ml_engineer → data_steward → CTO → CEO`.

## 5 bridges (MANDATORY)
W71 asset prognostics (the physics this REPLACES) + W15 warranty/RMA (fault-mode evidence) + W41 ITIL problem mgmt (RCA from class) + W63 warranty recovery (supplier-recovery from class) + **W118 audit (MANDATORY tamper-evidence)**.

## Files to create
### Migrations (NUMBERED 348/349 — head is 345 + W128 takes 346/347)
- `migrations/348_fault_fingerprint_ml.sql` — `oe_fault_fingerprint_ml` (~98 cols, status `chain_status`, confusion_matrix TEXT JSON, class_label_set_hash, class_distribution_payload)
- `migrations/349_fault_fingerprint_ml_seed.sql` — 16 rows: all 12 forward + 4 branch states populated; SIGNATURE `rolled_back` row `ffml-016` (adml-pattern); model_family mix

### Backend route
- `src/routes/fault-fingerprint-ml.ts` — 17 actions: `propose-model / bind-labeled-dataset / resolve-class-imbalance / engineer-features / split-train-test / train-multiclass / validate-confusion-matrix / calibrate / deploy-shadow / activate-live-ab / promote-champion / retrain / archive / detect-class-drift / rollback-model / recall-model / failover-to-physics-baseline / add-novel-class / sla-breach (cron-only)`
- GET `/` aggregate + GET `/:id` single row + GET `/:id/confusion-matrix` + GET `/:id/calibration-plot`
- POST `/cron/sla-sweep` + `/cron/class-drift-scan`

### Cascade event union + AUDIT_PREFIX_MAP
- EventType: `fault_fingerprint_ml.proposed` / `.labeled_dataset_bound` / `.class_imbalance_resolved` / `.features_engineered` / `.train_test_split` / `.multiclass_model_trained` / `.confusion_matrix_validated` / `.calibrated` / `.shadow_deployed` / `.live_ab_active` / `.champion_promoted` / `.retrained` / `.archived` / `.class_drift_detected` / `.rolled_back` / `.recalled` / `.failover_to_physics_baseline` / `.novel_class_added` / `.sla_breached`
- Event prefix: `fault_fingerprint_ml_evt_`
- `AUDIT_PREFIX_MAP`: `fault_fingerprint_ml_evt_: 'ml'` (joins W127 namespace)

### Frontend
- `pages/src/components/workstations/FaultFingerprintMlTab.tsx` — KPI strip / filter pills / 17 action buttons gated by chain_status+party+authority / confusion-matrix render / per-class F1 bars / calibration plot
- Mount on Admin + IPP + Support workstations
- Icon: `pattern_recognition`
- Tab key `fault-fingerprint-ml`, label `Fault Fingerprint ML (W129)`

### Crons (`wrangler.toml::[triggers]`)
- `*/15 * * * *` — SLA sweep (shared)
- `0 3 * * *` — **NEW** daily class-drift scan (30min after W127 feature-drift scan)
- `0 7 * * 1` — weekly model-card expiry (shared)

## Verify
1. `wrangler d1 migrations apply open-energy-db --remote` lands 348/349
2. `npm run check && npm run check:pages && npm test` green
3. GET `/api/fault-fingerprint-ml` returns 16 rows; aggregate shows all 12+4 statuses
4. `curl -X POST .../rollback-model` SIGNATURE row crosses regulator EVERY tier with `regulator_crossed_at` set
5. Forbidden trader write returns 403
6. Cron dry-runs: `*/15` and `0 3 * * *` both list `fault_fingerprint_ml_*` keys
7. Audit-chain query `?entity_type=ml` shows BOTH W127 and W129 events surfaced
8. SPA tabs render on Admin/IPP/Support; confusion-matrix + calibration plot visible
9. `wrangler d1 execute --command "SELECT * FROM oe_fault_fingerprint_ml LIMIT 1"` returns row (source of truth — migrations list may shadow)
10. Hard-reload SPA confirms `_headers no-store /*` shipping new bundle

## Commit message
```
feat(w129): fault-fingerprint multi-class ML — XGBoost/RF/GB/CNN-1D classifier replacing W71 12-mode physics; 12-state P6 on oe_fault_fingerprint_ml; rollback_model EVERY tier (inherits W127-ML-ROLLBACK); add_novel_class EU-AI-Act fleet_systemic; joins 'ml' namespace
```

## Out-of-scope (future)
- Active-learning loop for human-in-the-loop class refinement
- Federated training across IPP fleets
- Bayesian uncertainty quantification (post-W130 NTT-beat priority)

## Gotchas
- **Hono basePath param collision silent** — mount with full literal `/api/fault-fingerprint-ml`. Always `curl https://oe.vantax.co.za/api/fault-fingerprint-ml` after first deploy
- **JWT role tokens suffixed** — READ_ROLES include `ipp_developer`, `grid_operator`, `carbon_fund` (W127 already does this — copy verbatim)
- **`login_or_cached admin@openenergy.co.za`** FULL email
- **Demo password `Demo@2024!`** exact
- **CF edge cache `_headers` `no-store` on `/*`** — verify hard-reload after deploy
- **`wrangler d1 migrations list --remote` may show 348/349 "to be applied"** even after apply — verify with `SELECT * FROM oe_fault_fingerprint_ml LIMIT 1`
- **D1 100-col cap** — confusion matrix is single TEXT JSON; LIVE 28-field battery is decoration-at-fetch
- **Stratified split mandatory** — `split-train-test` body must accept `training_examples_count + validation_examples_count + class_distribution_payload` and reject any class below `min_samples_per_class_floor=30`
- **Class drift PSI ≠ feature drift PSI** — W129 computes on **argmax prediction-class distribution**; do NOT reuse W127's feature-PSI compute path
- **`reconciliation_with_w71_physics_pct`** = % where ML top-1 == W71 rule top-1; sampled during shadow + live_ab; falls to 0 on `failover_to_physics_baseline`
- **`add_novel_class` is re-entry not terminal** — from `{confusion_matrix_validated, calibrated, shadow_deployed, live_ab_active, champion_promoted, retrained, class_drift_detected}` → `multiclass_model_trained`; bumps `class_count+1`, regenerates `class_label_set_hash`, CTO authority, crosses regulator at `fleet_systemic` only
- **Phase-D namespace continuity** — DO NOT create new audit namespace; W129 joins `ml` (opened by W127)
- **Protected dirty-tree skip list** — focused `git add` only on W129 files; never `--amend`
- **MEMORY.md already 4× over limit** — wave-index one-liner ≤200 chars
