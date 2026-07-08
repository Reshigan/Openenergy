# Offtaker depth L4 — Sub-project 5

Date: 2026-07-08. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **offtaker** (22 thin-card + routed rows).

## Audit findings (real gaps only)

Three parallel investigators (commerce, metering, ESG) + direct verification of every claim. Well-guarded per verification: offtaker.ts delivery-point CRUD (allow-listed columns, 404/403), rec transfer + retire ownership/status, metering.ts, grid-wheeling-charges.ts, wheeling-access-chain.ts, tariff-determination/indexation chains, subscription-billing-chain, carbon-budget-chain, offtaker-obligations, role-completions, esg-reports.ts, green-tariff-chain `POST /:id/action` (404 + owner-or-admin + GT_HARD_TERMINALS + GT_VALID_TRANSITIONS — auditor claim refuted).

### Gap 1 — group members blind INSERT (offtaker-suite.ts ~42)

`POST /groups/:id/members`: canWrite gated, but INSERT binds request `group_id` with no existence/ownership check — any offtaker attaches delivery points to any other tenant's group (or nonexistent id). Same hole for `delivery_point_id`: foreign DP joinable into own group, leaking its consumption via group rollups. **Fix:** fetch group → 404 missing or foreign (non-admin); fetch delivery point → 404 missing or foreign (non-admin). 404 not 403 — repo anti-enumeration pattern.

### Gap 2 — consumption profiles skip delivery-point ownership (offtaker-suite.ts ~151, ~191)

- `POST /profiles`: validates 48-element half_hour_kwh but blind INSERT with request `delivery_point_id` — write foreign meter data.
- `GET /profiles/:delivery_point_id`: no ownership check at all — read any tenant's half-hourly consumption (POPIA-adjacent leak). `GET /consumption` right beside proves the model: JOIN on `dp.participant_id = ?`.

**Fix (both):** fetch `offtaker_delivery_points.participant_id` → 404 missing or foreign (non-admin).

### Gap 3 — retirement_purpose free text → 500 (offtaker-suite.ts ~341)

Retire handler has ownership + already-retired guards, but passes free-text `retirement_purpose` to INSERT; migration 025 CHECK (`scope_2|voluntary|compliance|customer_claim|greenhouse_trade`) turns bad value into a 500. **Fix:** allow-list in route → 400.

### Gap 4 — Scope 2 audit export leaks all tenants (offtaker-suite.ts ~554)

`POST /audit/export` allows offtaker role, but query on `scope2_disclosures` has no participant filter — offtaker exports every tenant's disclosures to R2. **Fix:** offtaker role adds `AND participant_id = ?`; admin/regulator keep full view. Both SQL strings static literals.

### Gap 5 — REC recon leaks all certificates (offtaker-suite.ts ~687)

`POST /audit/recon` allows offtaker; `SELECT ... FROM rec_certificates` unfiltered — recon output (breaks list) exposes foreign serials/volumes. **Fix:** offtaker role → `WHERE owner_participant_id = ?`; admin/regulator full.

### Gap 6 — green_tariff_class unvalidated → 500 (green-tariff-chain.ts ~129)

`POST /` casts `body.green_tariff_class` to `GreenTariffClass` with no runtime check; migration 456 CHECK rejects bad value → 500 instead of 422. (`deriveGtSla` has `?? 21` fallback so no NaN — earlier auditor claim corrected.) **Fix:** add runtime `GT_CLASSES` readonly array to `green-tariff-spec.ts` (TDD — no spec test file existed), validate in route → 422.

## Skipped (with reasons)

- green-tariff-chain.ts `POST /:id/action` ownership: refuted — full guards present.
- offtaker.ts delivery-point `status` free text: no CHECK, no canonical enum anywhere; binds via `?`.
- procurement-chain.ts `transition()` missing RFP ownership: real gap but offtaker excluded from WRITE_ROLES; IPP surface — carried to ipp_developer sub-project.
- ipp-site-instruction.ts instruction_type: IPP surface — deferred likewise.
- strate-swift / sap-oracle-erp / government-filing / reports / audit rows: shared cross-role — deferred to dedicated shared-row pass.

## Gates

tsc clean, full vitest green, TDD for GT_CLASSES (red → green), commit on `feat/offtaker-depth-l4`, merge --no-ff to main, push.
