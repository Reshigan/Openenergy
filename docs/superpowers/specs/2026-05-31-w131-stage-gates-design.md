# W131 Project Stage Gates (DG0–DG4) — Design Spec

**Date:** 2026-05-31
**Wave:** W131 — first wave under the "best-in-class per profile" directive
**Profile target:** IPP developer (per user example "the ipp project should include all project management functionality within the project fully working as a best in class projects system")
**Phase:** Profile-completeness (replaces parked Phase-E platform waves)
**Goal:** Land the canonical PMBOK 7 / Primavera P6 / Equator-Principles project-governance gate chain as the next IPP-PM depth feature.

---

## 1. Problem

The IPP developer workstation runs 33 functional tabs (W1→W130) covering schedule (W112), EVM (W113), document control (W114), submittals (W115), RFIs (W116), change orders (W117), procurement (W19), COD (W20), insurance, bonds, planned outages, HSE, cyber, ED, GCA, SCADA, MQTT/OPC-UA, and the W127–W130 ML brain. It is missing the **governance layer** that ties these chains together at the formal investment-decision points an IPP runs against: concept screening, feasibility, FID-prep, sanction (FID / REIPPPP bid commitment), and COD/operations entry. Without a stage-gate chain, there is no audit-trail-grade record of *who approved the project to advance from DG2 to DG3 with what conditions, on what evidence pack* — which is the load-bearing question for any lender Independent Engineer, the REIPPPP IPPO, and the NERSA Section 14 review.

## 2. Approach (selected: A)

Standalone P6 chain `oe_stage_gates`. Each row = one gate (DG0–DG4) for one project; 5 rows per project. Each row owns its own 12-state P6 lifecycle. Bridges to W19/W20/W21/W113 supply the evidence pack the decision reads off; bridges do not own the decision. This matches the W127–W130 codebase template (chain row → state machine → cascade events → AUDIT_PREFIX_MAP → workstation tab) and ships in a single wave.

Rejected alternatives:
- **B — overlay only** (add `current_stage_gate` columns to existing chains): no per-gate audit trail, no place for board minutes / IE letter / conditions list, breaks the wave shipping pattern.
- **C — big-bang with W19/W20 rewire** (force-couple existing chains to gate status): 3 waves of risk for marginal extra coupling; revisit later if needed.

## 3. Architecture

### 3.1 Table — `oe_stage_gates` (~95 cols + 12 state ts)

One row per (project_id, gate_index). Primary key `id` (`sg_…`). `chain_status` (TEXT, 12+4 states). `gate_index` (INT 0–4). `project_id` (FK to `oe_projects`). `capex_band` + `equator_category` drive tier. `decision` + `conditions_payload` + `evidence_payload` + `cab_minutes_r2_key` + `ie_letter_r2_key` + `board_minutes_r2_key` capture the decision artifacts.

### 3.2 State machine (12 forward + 4 branch)

**Forward (12):**
```
gate_proposed
  → evidence_compiled
  → ie_reviewed
  → lender_reviewed
  → board_briefing_circulated
  → cab_held
  → conditions_set
  → decision_recorded
  → conditions_satisfied
  → gate_passed
  → notified_downstream
  → archived
```

**Branches (4):**
- `gate_rejected` (HARD — project terminates at this gate; sister of W127's `rolled_back`)
- `gate_deferred` (SOFT — schedule slip, retryable; loops back to `evidence_compiled`)
- `gate_withdrawn` (SOFT — sponsor pulls)
- `gate_conditional_pass` (SOFT — pass with monitored conditions; **W131 SIGNATURE** — common in Equator Cat A; loops back to `conditions_satisfied` when conditions clear)

### 3.3 Tiers — capex × Equator hybrid

`tierForScope(capex_zar, equator_category, debt_sized)`:
- `low_capex` — `< R100M`, Equator C
- `medium_capex` — `R100M ≤ capex < R500M`, Equator B
- `high_capex` — `R500M ≤ capex < R2bn`, Equator B
- `mega_capex` — `capex ≥ R2bn`, Equator B (REIPPPP utility)
- `equator_cat_a` — Equator Cat A regardless of capex (highest E&S risk; FLOOR)

### 3.4 INVERTED SLA hours at `gate_proposed`

| Tier | Hours | Days |
|---|---|---|
| low_capex | 168 | 7 |
| medium_capex | 336 | 14 |
| high_capex | 720 | 30 |
| mega_capex | 1440 | 60 |
| equator_cat_a | 2160 | 90 |

(Larger / more E&S-sensitive gates get MORE time for diligence.)

### 3.5 Authority chain (4-step)
`project_manager → ie_assessor → cfo → board_chair` (fresh terminology distinct from prior waves' `ml_engineer` / `pm`).

### 3.6 Five floor flags
- `equator_cat_a` — Cat A high E&S risk → FLOOR to `equator_cat_a` tier
- `fid_committed` — at DG3+ post-sanction (irreversible)
- `nersa_notifiable` — DG0 and DG4 always notifiable to NERSA
- `debt_sized` — post-DG2 (W21 drawdown sizing now depends on this gate)
- `shareholder_consent_required` — mega_capex + equator_cat_a require NED ratification

Floor logic: **FLOOR-AT-HIGH ≥1 flag / FLOOR-AT-MEGA ≥3 flags**.

### 3.7 SIGNATURE regulator crossings
- `gate_rejected` → **EVERY tier** (W131 SIGNATURE — project termination universally reportable to NERSA + DMRE — REIPPPP bid loss / project death IS the reportable event)
- `decision_recorded` for gate_index=4 (DG4 COD) → EVERY tier (NERSA s14 licence crossing)
- `decision_recorded` for gate_index=0 (DG0 concept) or gate_index=3 (DG3 sanction) → medium + high + mega + equator_cat_a
- `gate_deferred` → mega + equator_cat_a only (lender consent required)
- `sla_breached` → high + mega + equator_cat_a only

### 3.8 LIVE 28-field battery (decoration-at-fetch)

`cost_confidence_aace_class_live` (Class 5→Class 1) / `schedule_confidence_p50_live` / `irr_post_tax_live` / `debt_sizing_zar_live` / `e_s_risk_score_live` / `ie_letter_attached_bool_live` / `cab_minutes_attached_bool_live` / `board_minutes_attached_bool_live` / `conditions_aging_days_live` / `equator_category_live` / `cumulative_capex_committed_zar_live` / `time_in_state_hours_live` / `sla_remaining_hours_live` / 5 bridge truthies (`bridges_to_w19/w20/w21/w113/w118_live`) / 10 more standard governance fields.

**Persisted column count ≈ 95 + 12 state-ts = 107.** **Risk: edges the D1 100-col cap.** Mitigation: 4 of the LIVE fields (`time_in_state_hours_live` / `sla_remaining_hours_live` / `conditions_aging_days_live` / `equator_category_live`) are **always derived at fetch** from event timestamps + base cols — no persisted column needed. Net persisted ≈ 93. Safe.

### 3.9 Party / authority
WRITE `{admin, ipp_developer}` (the gate sponsor party — IPP runs the gate).
READ all 9 personas (regulator, lender, IE, trader, ops, etc.).
No mTLS / no public peer endpoint — internal governance.

### 3.10 Five bridges (W118 MANDATORY)
| Bridge | Target | Direction | Purpose |
|---|---|---|---|
| `w19_procurement_ref` | `oe_procurement.id` | read-only | DG2 evidence pack pulls procurement outcome |
| `w20_cod_ref` | `oe_cod.id` | bidirectional | DG4 evidence; DG4 outcome gates COD activation |
| `w21_drawdown_ref` | `oe_drawdown.id` | read-only | DG3 sanction triggers W21 |
| `w113_evm_ref` | `oe_ipp_evm.id` | read-only | cost-confidence at each gate |
| `w118_block_ref` | W118 spine | **MANDATORY** | Merkle-hash every `decision_recorded` event |

## 4. Files

### 4.1 Create
- `migrations/352_stage_gate.sql` — `oe_stage_gates` + `oe_stage_gate_events`
- `migrations/353_stage_gate_seed.sql` — 16 rows (12 forward + 4 branch states); SIGNATURE row `sg-016` = mega_capex DG3 gate_rejected (R2.5bn project killed at sanction, all 5 floor flags raised, all 5 bridges populated, `regulator_ref` = `W131-SG-REJECT-2026-0016`)
- `src/utils/stage-gate-spec.ts` — spec (action→state, tier rules, floor flags, crossings)
- `src/routes/stage-gate.ts` — 17 actions + GET aggregate + GET `/:id`
- `tests/stage-gate-spec.test.ts` — full spec coverage
- `pages/src/components/stageGate/StageGateTab.tsx` — KPIs / filter pills / gate-by-DG-row layout / action buttons gated by chain_status+party+authority

### 4.2 Modify
- `src/index.ts` — mount `/api/stage-gate` + scheduled SLA sweep
- `src/routes/launch.ts` — hero tile on `ipp_developer` (primary), `lender` + `regulator` (READ visibility); icon `account_tree`; `cta_label: 'Open stage gates'`
- `src/utils/cascade.ts` — `AUDIT_PREFIX_MAP: stage_gate: 'ipp'` (**JOINS existing `ipp` namespace** alongside ipp_schedule / ipp_evm / ipp_doc_control / ipp_submittal / ipp_rfi / ipp_change_order — preserves IPP-PM audit-chain continuity; do NOT open a new `pm` namespace, the W118 spine partition assumes one prefix per family); add 17 EventTypes
- `wrangler.toml` — `*/15 * * * *` SLA sweep + `0 6 * * 1` conditions-aging sweep (08:00 SAST Monday — clear of W127 03:00 / W129 03:30 / W130 04:15 family)
- `pages/src/components/pages/IppWorkstationPage.tsx` — tab `{ key: 'stage-gates', label: 'Stage Gates (W131)' }` (insert near top — high in the IPP workflow stack)
- `pages/src/components/pages/LenderWorkstationPage.tsx` — same tab (READ-only for lender visibility on DG2/DG3)
- `pages/src/components/pages/RegulatorWorkstationPage.tsx` — same tab (READ-only for DG0/DG4 NERSA-notifiable crossings)

## 5. Crons
- `*/15 * * * *` — `stageGateSlaSweep` (shared `*/15` runner)
- `0 6 * * 1` — **NEW** `stageGateConditionsAgingSweep` (Monday 08:00 SAST — flag conditions older than `conditions_aging_days_live` threshold; emits `stage_gate.condition_stale` events)

## 6. Verify (post-deploy)

1. `wrangler d1 migrations apply open-energy-db --remote` lands 352/353
2. `npm run check && npm run check:pages && npm test` green
3. `GET /api/stage-gate` returns 16 rows; SIGNATURE `sg-016` shows `tier=mega_capex`, `gate_index=3`, `chain_status=gate_rejected`, all 5 floor flags=1, `regulator_crossed_at` populated, `regulator_ref=W131-SG-REJECT-2026-0016`, all 5 bridges non-null
4. `sg-001` (low_capex `gate_proposed`) has `sla_target_hours=168`
5. Tile present on IPP + Lender + Regulator workstations with icon `account_tree`
6. `GET /api/launch/ipp_developer` exposes `dashboard.stage_gates.active_gates_count` numeric
7. Audit-chain `?entity_type=ipp` returns W131 events alongside W112/W113/W114/W115/W116/W117 IPP-PM family events (single namespace)
8. `wrangler cron list` includes `0 6 * * 1`
9. End-to-end propose → compile → ie_review → lender_review → board_brief → cab → conditions → decide advances `chain_status` and writes event rows
10. Hard-reload SPA confirms `_headers no-store /*` shipping new bundle

## 7. Commit message

```
feat(w131): Project Stage Gates (DG0-DG4) — first IPP-PM profile-completeness wave; 12-state P6 on oe_stage_gates; gate_rejected crosses regulator EVERY tier (W131 SIGNATURE = project termination universally reportable); INVERTED SLA capped at 90d for Equator Cat A; joins existing 'ipp' audit namespace
```

## 8. Out-of-scope (later waves)
- Monte Carlo schedule risk analysis (P50/P80/P95 COD distribution) — separate wave (W134-tier)
- Inline AI decision-support cards on gate review pack — post-W131
- REIPPPP bid-document auto-pack PDF generation — separate wave
- Cross-project portfolio-gate rollup view — Phase E platform wave

## 9. Gotchas

- **D1 100-col edge** — Persisted 95 cols + 12 state-ts = 107. Mitigated by deriving 4 LIVE fields at fetch (`time_in_state_hours_live` / `sla_remaining_hours_live` / `conditions_aging_days_live` / `equator_category_live`). If `CREATE TABLE` rejects, drop `cumulative_capex_committed_zar_live` + `e_s_risk_score_live` to events payload JSON
- **Hono basePath collision silent** — mount with full literal `/api/stage-gate`; curl `https://oe.vantax.co.za/api/stage-gate` after first deploy
- **JWT roles suffixed** — `ipp_developer`, `grid_operator`, `carbon_fund` not the short forms
- **`login_or_cached ipp@openenergy.co.za`** FULL email
- **CF edge cache `_headers no-store /*`** — verify hard-reload
- **Migration ledger band** — 352/353 idempotent `CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`; ignore "to be applied" status in `wrangler d1 migrations list --remote`
- **Cron `0 6 * * 1`** — clear vs existing Monday weekly (W127 model-card expiry is also `0 7 * * 1`); 06:00 UTC = 08:00 SAST clear of 07:00 UTC W127 sweep
- **AUDIT_PREFIX_MAP joins existing `'ipp'`** — DO NOT open a new `'pm'` namespace. The existing IPP-PM family (`ipp_schedule`/`ipp_evm`/`ipp_doc_control`/`ipp_submittal`/`ipp_rfi`/`ipp_change_order`) all route to `'ipp'`. Future profile-completeness chains in the IPP family (Stakeholder Register, Issues Log, Lessons Learned, Baseline Management) should also map to `'ipp'`. The W118 spine partition assumes one prefix per family
- **Phase-E pivot** — this wave SUPERSEDES the parked `w131-ux-revisit-sweep.md` plan. UX revisit work remains parked at `docs/wave-briefs/parked-*.md` until user pivots back
- **Bidirectional W20 bridge** — DG4 outcome blocks COD activation; W20 chain must check `w20_cod_ref.chain_status` before transitioning past `commercial_operation_proposed`. This is the one place W131 has a write-back effect — implement as a READ check in W20 not a write from W131 (keep W131 as pure governance layer)
- **Conditional-pass loop** — `gate_conditional_pass` loops back to `conditions_satisfied`; do NOT terminate the row; re-enters `gate_passed` after all conditions clear. Test fixture `sg-009` exercises this branch
- **Protected dirty-tree skip list** — focused `git add` only on W131 files; never `--amend`
- **MEMORY.md already over limit** — wave-index one-liner ≤200 chars

## 10. Test plan

- Unit tests (vitest): every action → state transition, every floor-flag combination, every tier-SLA mapping, every signature crossing condition, conditional-pass loop, evidence/conditions/decision payload validation
- Spec test: `oe_stage_gates` row count = 16, all 12 forward + 4 branch states represented, `sg-016` signature row fully populated
- Smoke (post-deploy): `scripts/smoke-roles.sh` confirms ipp_developer can write, regulator/lender READ-only, trader gets 403
- Cron dry-run: `*/15` sweep and `0 6 * * 1` conditions-aging both list `stage_gate_*` keys
