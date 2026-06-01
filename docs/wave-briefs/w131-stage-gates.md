# W131 PROJECT STAGE GATES (DG0–DG4) — SHIP BRIEF

PHASE-E PROFILE-COMPLETENESS WAVE 1 OF N. First IPP-PM gap-fill under the user's "best-in-class projects system" directive (2026-05-31). 12-state P6 chain on `oe_stage_gates`. Five gate rows per project: DG0 Concept → DG1 Feasibility → DG2 FEED/FID-prep → DG3 Sanction (FID) → DG4 COD/Operations. JOINS existing `'ipp'` audit namespace alongside ipp_schedule / ipp_evm / ipp_doc_control / ipp_submittal / ipp_rfi / ipp_change_order. SUPERSEDES parked `w131-ux-revisit-sweep.md`.

## Table — `oe_stage_gates` (~95 cols + 12 state ts ≈ 107 incl events)

One row per (project_id, gate_index). Primary key `id` (`sg_…`). Cols: `chain_status` (TEXT, 12+4 states) / `gate_index` (INT 0-4) / `project_id` (FK) / `capex_zar` / `capex_band` / `equator_category` / `decision` / `conditions_payload` (TEXT JSON) / `evidence_payload` (TEXT JSON) / `ie_letter_r2_key` / `cab_minutes_r2_key` / `board_minutes_r2_key` / 5 bridge refs / state timestamps / 5 floor flags / standard governance fields. **D1 100-col edge:** derive 4 LIVE fields at fetch (time_in_state_hours / sla_remaining_hours / conditions_aging_days / equator_category) to stay under cap.

## State machine (12 forward + 4 branch)

**Forward (12):** `gate_proposed → evidence_compiled → ie_reviewed → lender_reviewed → board_briefing_circulated → cab_held → conditions_set → decision_recorded → conditions_satisfied → gate_passed → notified_downstream → archived`

**Branches (4):** `gate_rejected` (HARD — project terminates) / `gate_deferred` (SOFT — schedule slip, retryable, loops to evidence_compiled) / `gate_withdrawn` (SOFT — sponsor pulls) / `gate_conditional_pass` (SOFT — **W131 SIGNATURE** — pass with monitored conditions, loops to conditions_satisfied when cleared)

## 17 actions / 4-step authority

`project_manager → ie_assessor → cfo → board_chair` (fresh terminology distinct from W127's `ml_engineer`).

Actions: `propose-gate / compile-evidence / ie-review / lender-review / circulate-board-briefing / hold-cab / set-conditions / record-decision / satisfy-conditions / pass-gate / notify-downstream / archive / defer-gate / withdraw-gate / reject-gate / conditional-pass / sla-breach (cron-only)`.

## Tiers — capex × Equator hybrid

`tierForScope(capex_zar, equator_category, debt_sized)`:
- `low_capex` — `< R100M`, Equator C
- `medium_capex` — `R100M ≤ capex < R500M`, Equator B
- `high_capex` — `R500M ≤ capex < R2bn`, Equator B
- `mega_capex` — `capex ≥ R2bn`, Equator B
- `equator_cat_a` — Equator Cat A regardless of capex (FLOOR — highest E&S risk)

## INVERTED SLA hours at `gate_proposed`

`low_capex 168h (7d) → medium_capex 336h (14d) → high_capex 720h (30d) → mega_capex 1440h (60d) → equator_cat_a 2160h (90d)`. Larger / more E&S-sensitive gates get MORE diligence time.

## 5 FLOOR flags
- `equator_cat_a` — Cat A high E&S → FLOOR to `equator_cat_a` tier
- `fid_committed` — at DG3+ post-sanction (irreversible)
- `nersa_notifiable` — DG0 + DG4 always notifiable to NERSA
- `debt_sized` — post-DG2 (W21 drawdown sizing now depends on this gate outcome)
- `shareholder_consent_required` — mega + equator_cat_a require NED ratification

FLOOR-AT-HIGH ≥1 flag / FLOOR-AT-MEGA ≥3 flags.

## SIGNATURE crossings
- `reject-gate` → **EVERY tier** (**W131 SIGNATURE** — project termination is universally reportable to NERSA + DMRE — REIPPPP bid death IS the reportable event; sister of W127 rollback hard line)
- `record-decision` for gate_index=4 (DG4 COD) → EVERY tier (NERSA s14 licence crossing)
- `record-decision` for gate_index=0 (DG0) or gate_index=3 (DG3) → medium + high + mega + equator_cat_a
- `defer-gate` → mega + equator_cat_a only (lender consent required)
- `sla_breached` → high + mega + equator_cat_a only

## LIVE 28-field battery
`cost_confidence_aace_class_live` (Class 5→1) / `schedule_confidence_p50_live` / `irr_post_tax_live` / `debt_sizing_zar_live` / `e_s_risk_score_live` / `ie_letter_attached_bool_live` / `cab_minutes_attached_bool_live` / `board_minutes_attached_bool_live` / `conditions_aging_days_live` (derived) / `equator_category_live` (derived) / `cumulative_capex_committed_zar_live` / `time_in_state_hours_live` (derived) / `sla_remaining_hours_live` (derived) / 5 bridge truthies (`bridges_to_w19/w20/w21/w113/w118_live`) / 10 standard governance fields.

## Party / authority
WRITE `{admin, ipp_developer}` (gate sponsor party). READ all 9 personas. No public peer / no mTLS — internal governance.

## 5 bridges (W118 MANDATORY)
- `w19_procurement_ref` → `oe_procurement.id` (DG2 evidence pack)
- `w20_cod_ref` → `oe_cod.id` (bidirectional — DG4 evidence; **DG4 outcome blocks COD activation** — implement as READ check in W20, NOT write from W131; preserves W131 as pure governance layer)
- `w21_drawdown_ref` → `oe_drawdown.id` (DG3 sanction triggers W21)
- `w113_evm_ref` → `oe_ipp_evm.id` (cost confidence at each gate)
- `w118_block_ref` → **MANDATORY** Merkle-hash every `record-decision` event into W118 spine

## Files to create
- `migrations/352_stage_gate.sql` — `oe_stage_gates` + `oe_stage_gate_events`
- `migrations/353_stage_gate_seed.sql` — 16 rows (12 forward + 4 branch states); SIGNATURE `sg-016` = mega_capex DG3 gate_rejected R2.5bn project termination, all 5 floor flags raised, all 5 bridges, `regulator_ref` = `W131-SG-REJECT-2026-0016`, `regulator_crossed_at` = `2026-05-31T15:00:00Z`
- `src/utils/stage-gate-spec.ts`
- `src/routes/stage-gate.ts`
- `tests/stage-gate-spec.test.ts`
- `pages/src/components/stageGate/StageGateTab.tsx`

## Files to modify
- `src/index.ts` — mount `/api/stage-gate` route + scheduled cases (slaSweep + conditionsAgingSweep)
- `src/routes/launch.ts` — hero tile on ipp_developer (primary), lender + regulator (READ); icon `account_tree`; `cta_label: 'Open stage gates'`
- `src/utils/cascade.ts` — `AUDIT_PREFIX_MAP: stage_gate: 'ipp'` (**JOIN existing IPP namespace, NOT new 'pm'**); add 17 EventTypes (`stage_gate.proposed` / `.evidence_compiled` / `.ie_reviewed` / `.lender_reviewed` / `.board_briefing_circulated` / `.cab_held` / `.conditions_set` / `.decision_recorded` / `.conditions_satisfied` / `.gate_passed` / `.notified_downstream` / `.archived` / `.gate_deferred` / `.gate_withdrawn` / `.gate_rejected` / `.conditional_pass` / `.sla_breached`)
- `wrangler.toml` — crons `*/15 * * * *` SLA sweep (shared) + `0 6 * * 1` conditions-aging Monday 08:00 SAST
- `pages/src/components/pages/IppWorkstationPage.tsx` — tab `{ key: 'stage-gates', label: 'Stage Gates (W131)' }` near top of tab list
- `pages/src/components/pages/LenderWorkstationPage.tsx` — same tab READ-only for DG2/DG3 visibility
- `pages/src/components/pages/RegulatorWorkstationPage.tsx` — same tab READ-only for DG0/DG4 NERSA-notifiable crossings

## Crons
- `*/15 * * * *` — `stageGateSlaSweep` (shared runner)
- `0 6 * * 1` — **NEW** `stageGateConditionsAgingSweep` (Monday 08:00 SAST — clear of `0 7 * * 1` W127 model-card weekly)

## Verify
1. `wrangler d1 migrations apply open-energy-db --remote` lands 352/353
2. `npm run check && npm run check:pages && npm test` green
3. GET `/api/stage-gate` returns 16 rows; SIGNATURE `sg-016` shows tier=mega_capex, gate_index=3, chain_status=gate_rejected, all 5 floor flags=1, regulator_crossed_at populated, regulator_ref=W131-SG-REJECT-2026-0016, all 5 bridges non-null
4. `sg-001` (low_capex gate_proposed) has `sla_target_hours=168`
5. Tile present on IPP + Lender + Regulator workstations with icon `account_tree`
6. GET `/api/launch/ipp_developer` exposes `dashboard.stage_gates.active_gates_count` numeric
7. Audit-chain `?entity_type=ipp` returns W131 events ALONGSIDE W112-W117 IPP-PM family events (single namespace)
8. `wrangler cron list` includes `0 6 * * 1`
9. End-to-end propose → compile → ie_review → lender_review → board_brief → cab → conditions → decide advances chain_status + writes event rows
10. Hard-reload SPA confirms `_headers no-store /*` shipping new bundle

## Commit message
```
feat(w131): Project Stage Gates (DG0-DG4) — first IPP-PM profile-completeness wave; 12-state P6 on oe_stage_gates; gate_rejected crosses regulator EVERY tier (W131 SIGNATURE = project termination universally reportable); INVERTED SLA capped at 90d for Equator Cat A; joins existing 'ipp' audit namespace
```

## Out-of-scope (later waves)
- Monte Carlo schedule risk analysis (separate wave)
- Inline AI decision-support cards on gate review pack (post-W131)
- REIPPPP bid-document auto-pack PDF generation (separate wave)
- Cross-project portfolio-gate rollup view (Phase E platform wave)

## Gotchas
- **CF edge cache** `_headers no-store /*` — verify `curl -I https://oe.vantax.co.za/api/stage-gate` returns no-store
- **`login_or_cached ipp@openenergy.co.za`** FULL email
- **Hono basePath collision silent** — mount `app.route('/api/stage-gate', ...)`; curl prod after deploy
- **JWT roles suffixed** — `ipp_developer`, `grid_operator`, `carbon_fund` not short forms
- **Migration ledger band** — 352/353 idempotent `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`; ignore "to be applied" status in `wrangler d1 migrations list --remote`
- **D1 100-col edge** — 95 + 12 state ts = 107. Mitigated by deriving 4 LIVE fields at fetch (time_in_state / sla_remaining / conditions_aging / equator_category). If `CREATE TABLE` rejects, also push `cumulative_capex_committed_zar_live` + `e_s_risk_score_live` to events payload JSON and revive in LIVE battery
- **Bidirectional W20 bridge** — DG4 outcome blocks COD activation; W20 chain reads `w20_cod_ref.chain_status` before transitioning past `commercial_operation_proposed`. Implement as READ check in W20, NOT write from W131. Keeps W131 a pure governance layer
- **Conditional-pass loop** — `gate_conditional_pass` loops back to `conditions_satisfied`; do NOT terminate the row. Re-enters `gate_passed` after all conditions clear. Test fixture exercises this branch via `sg-009`
- **AUDIT_PREFIX_MAP JOINS existing `'ipp'`** — DO NOT open a new `'pm'` namespace. All existing IPP-PM chains (`ipp_schedule`/`ipp_evm`/`ipp_doc_control`/`ipp_submittal`/`ipp_rfi`/`ipp_change_order`) route to `'ipp'`. Future IPP-family chains (Stakeholder Register, Issues Log, Lessons Learned, Baseline Management) should also map to `'ipp'`. The W118 spine partition assumes one prefix per family
- **Cron `0 6 * * 1`** clear vs existing `0 7 * * 1` W127 model-card weekly (06:00 UTC = 08:00 SAST vs 07:00 UTC = 09:00 SAST)
- **Replay-safe seed** — `INSERT OR IGNORE` per CI replay convention
- **Protected dirty-tree skip list** — focused `git add` only on W131 files; never `--amend`. Existing dirty tree (docs/video/, pages/src/App.tsx, pages/src/components/pages/{Contract,Funds,Loi,Project,Fund,Rfp}Detail.tsx, pages/src/components/file/, playwright.config.video.ts, scripts/video/*, src/routes/{contracts,funder,lois,procurement,projects}.ts, tests/video/*, migrations/091_project_file_seed.sql) MUST NOT be staged
- **MEMORY.md already over limit** — wave-index one-liner ≤200 chars
- **Phase-E pivot context** — W131 SUPERSEDES the parked `w131-ux-revisit-sweep.md` plan (now at `docs/wave-briefs/parked-w131-ux-revisit-sweep.md` along with W132-W135 parked Phase-E platform briefs); the new "profile-completeness" Phase E starts here, not at W136
