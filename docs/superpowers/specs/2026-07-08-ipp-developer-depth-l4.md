# IPP developer depth L4 — Sub-project 6

Date: 2026-07-08. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **ipp_developer** (largest surface — Wave 132–139 registers, procurement, project schedule, chain modules).

## Audit findings (real gaps only)

Parallel investigators (registers, chains, schedule) + direct verification of every claim: all 12 migration CHECK value lists read verbatim; every flagged POST handler read to confirm raw binds; ownership sections of all 7 register modules + procurement-chain `transition()` read directly.

### Class A — unvalidated enums reaching DB CHECK constraints (500 instead of 4xx)

Every one confirmed as raw `?` bind of request value into a column with a migration CHECK. Bad value = D1 constraint error = 500. Fix: `badEnum()` from `src/utils/validation.ts` (existing helper — absent values pass through, allow-list is a static literal) with values copied verbatim from the migration CHECK; status matches each file's existing validation convention.

| Route | Field(s) | Migration |
|---|---|---|
| milestone-variance-chain.ts POST / | risk_tier (default 'minor') | 453 |
| ipp-milestone-cert.ts POST / | milestone_type, energy_type (default 'solar_pv') | 418 |
| stage-gate.ts POST / + action | capex_band, equator_category, decision | 352 |
| ipp-site-instruction.ts POST / | instruction_type (SLA_HOURS `?? 48` masks bad value until CHECK) | 387 |
| ipp-issues.ts POST / | category (default 'general'), priority (default 'p3_medium') | 354 |
| ipp-risk.ts POST / | risk_category (default 'technical'), risk_tier (default derived) | 356 |
| ipp-stakeholder.ts POST / | stakeholder_type | 358 |
| ipp-payment-cert.ts POST / | claim_type | 390 |
| ipp-insr.ts POST / | line_type (default 'comprehensive_package') | 421 |
| ipp-om-handover.ts POST / | category | 392 |
| project-schedule.ts POST /activities + PUT /activities/:id | constraint_type, type (PUT only), resource_type (POST /resources) | 092 |
| ipp-submittal.ts stamp_return action | stamp_code (`stampForAction` passes body value through unvalidated) → 422 (file's action-error status) | 320 |

### Class B — missing write-side ownership (any WRITE_ROLES member mutates any row)

Register modules deliberately expose reads to a broad READ_ROLES set (9 roles incl. regulator/lender) — read scoping would break those views, so reads stay open. The gap is writes: `POST /:id/:action` fetches by raw id with no actor check, so any ipp_developer advances any other developer's rows. All modules insert `created_by = user.id` (procurement: `participant_id`). Fix mirrors the ipp-dlp-defect.ts baseline: non-exempt actor must own the row → 403. Exempt = admin (+ support where WRITE_ROLES includes it).

- ipp-subcontractor.ts, ipp-mir.ts (exempt admin/support)
- ipp-issues.ts, ipp-risk.ts, ipp-stakeholder.ts, ipp-progress-claim.ts (exempt admin)
- ipp-diary.ts (exempt admin/support)
- procurement-chain.ts `transition()` — one shared fence covers all 13 lifecycle endpoints (publish…resolve); all are RFP-owner actions, bidding is a separate surface (exempt admin/support)

### Class C — project-schedule sub-resource scoping (cross-project reach)

All routes take `:projectId` but four sub-resource operations never verify the child row belongs to that project:

1. `DELETE /activities/:id` — deletes `activity_dependencies` + `resource_assignments` on raw `:id` **before** the project-scoped activity delete; foreign activity's deps/assignments deletable. Fix: verify activity belongs to project first → 404.
2. `POST /calendars/:calendarId/exceptions` — calendarId unverified; `INSERT OR REPLACE` overwrites another project's calendar exception. Fix: verify calendar → 404.
3. `POST /assignments` — activity_id/resource_id unverified; `INSERT OR REPLACE`. Fix: verify activity belongs to project → 404.
4. `DELETE /assignments/:id` — `DELETE FROM resource_assignments WHERE id = ?` unscoped. Fix: scope via subquery on project_activities.project_id.

## Skipped (with reasons)

- **Chain-module ownership systemic pass** (ipp-schedule-chain, ipp-evm-chain, cod-chain, stage-gate ownership, drawdown-chain, take-or-pay-chain, insurance-claim-chain, ipp-submittal/rfi/document-control ownership, submittal-rfi-chain, handover-dossier-chain, dfr-chain, punch-list-chain): same write-fence question across 14 modules, several two-party (take-or-pay both sides act); needs a design decision on which party may take which action — deferred to shared-row pass, not a mechanical fence.
- **No-owner-column modules** (ipp-change-order, ipp-bonds, ipp-tq): fence needs a migration adding the column; deferred with the chain pass.
- **DSCR / credit-insurance read scope**: plausibly intentional lender-shared reads — left alone.
- **Refuted class-2 enum claims** (diary day_type, mir/subcontractor tiers, dlp severity_class, progress-claim claim_type, doc-control/rfi/submittal classes): no DB CHECK on those columns — free text binds safely via `?`; no 500 class.
- **Existing 403 fences** (site-instruction action, dlp-defect, milestone-variance action, milestone-cert action): already correct — left alone.
- **Well-guarded per verification**: transition guards everywhere (409/422), SQL identifiers all static, ipp-variation-order, ipp-cp-tracker, green-bond-chain, ipp-final-completion, om-handover/insr/payment-cert action ownership.
- strate-swift / sap-oracle-erp / government-filing / reports / audit rows: shared cross-role — dedicated pass.

## Gates

tsc clean, full vitest green (baseline 303 files / 8784 tests), two commits on `feat/ipp-developer-depth-l4` (enum guards; ownership + scoping), merge --no-ff to main, push.
