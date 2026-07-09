# Lender depth L4 — Sub-project 7

Date: 2026-07-09. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **lender** (project-finance suite: covenants, IE certifications, waterfalls, reserves, dunning).

## Audit findings (real gaps only)

Every claim verified by direct read: all migration CHECK value lists (023, 055) read verbatim; every flagged POST handler read to confirm raw binds / missing fences; sibling list handlers read to confirm parent-scoping before flagging a child read as a leak. Scope collapsed to two files — `lender-suite.ts` and `lender-dunning.ts`. `esg.ts` (shared carbon surface) and `benchmark-transition-chain.ts` (trader-write) are lender-readable but not lender-owned → deferred (see Skipped).

### Class A — unvalidated enums reaching DB CHECK constraints

Each is a raw `?` bind of a request value into a column with a migration CHECK. Bad value = D1 constraint error surfaced as generic 422 (via `classifyConstraint`) or — for waterfalls tranches — a **silent skip** (`continue`) that drops the row with `success:true`. Fix: `badEnum()` from `src/utils/validation.ts` (absent values pass through; allow-list is a static literal copied verbatim from the migration CHECK), returning the file's existing 400 convention and naming the bad field.

| Route (lender-suite.ts) | Field(s) | Migration CHECK |
|---|---|---|
| POST /covenants | covenant_type, operator, measurement_frequency | 023 |
| POST /ie-certifications | cert_type | 023 |
| POST /reserves | reserve_type | 023 |
| POST /reserves/:id/movement | movement_type | 023 |
| POST /waterfalls (tranche loop) | tranche_type — **surface bad value as 400 instead of silent `continue`** | 023 |
| POST /covenant-tests/:id/actions | action_type, severity | 055 |
| POST /covenant-actions/:id/transition | outcome (→ resolution_outcome, terminal only) | 055 |

CHECK lists (verbatim): covenant_type ('financial','operational','insurance','reporting','legal','environmental','governance'); operator ('gte','lte','eq','gt','lt','between'); measurement_frequency ('monthly','quarterly','semi_annual','annual','on_event'); cert_type ('monthly_progress','milestone_completion','drawdown','commissioning','performance_test','taking_over','final'); reserve_type ('dsra','mra','om_reserve','tax_reserve','insurance','other'); movement_type ('top_up','release','draw','interest','transfer_in','transfer_out'); tranche_type ('opex','tax','senior_interest','senior_principal','dsra','mra','mezzanine','subordinated','equity_distribution','other'); action_type ('cure_plan','waiver_request','amendment_request','acceleration_notice','workout','no_action'); severity ('low','medium','high','critical'); resolution_outcome ('cured','waived','amended_terms','accelerated','written_off','no_action').

### Class B — missing write-side ownership / existence fences

Reads over covenants/reserves stay open (broad READ_ROLES is deliberate — regulator + borrower views). The gap is writes that fetch by raw id with no actor check, and blind UPDATEs with no existence check (phantom mutation + cascade fired with undefined ids + `success:true`). Fence pattern already in this file (lines 812/867): `if (X.lender_participant_id && X.lender_participant_id !== user.id && user.role !== 'admin') return 403`.

- `POST /covenants/:id/test` — no ownership gate; fires `lender.covenant_breach`/`warn` cascade for any authed caller. Add owner fence after the 404.
- `POST /covenants/:id/waive` — no covenant existence check → orphan waiver + cascade. Add existence 404.
- `POST /waivers/:id/decide` — blind `UPDATE covenant_waivers WHERE id=?` then re-SELECT (may be null) → cascade with undefined covenant_id. Fetch waiver+covenant first, 404 if missing, owner fence vs covenant.lender_participant_id.
- `POST /ie-certifications` — no role gate; spoofable `b.ie_participant_id || user.id`. Force `ie_participant_id = user.id` for non-admin.
- `POST /reserves/:id/movement` — no existence check; blind `UPDATE reserve_accounts SET current_balance_zar = current_balance_zar + ? WHERE id=?` → phantom movement on 0-row update + cascade with undefined project_id. Add existence 404. (Ownership deferred — no simple owner column; see Skipped.)
- lender-dunning.ts `POST /:id/withdraw` — LENDER_WRITE-gated with 404 but **no status guard**: re-withdraws an already-withdrawn/resolved notice, clobbering timestamps. Add status guard (withdraw only active notices).

### Class C — cross-tenant read leak (parent list is scoped)

- lender-suite.ts `GET /covenants/:id/tests` — parent `GET /covenants` scopes `lender_participant_id` for non-admin; this child does not → leaks another lender's tests. Fetch covenant's lender_participant_id, fence before returning.
- lender-dunning.ts `GET /watchlist/:id/events` — parent `GET /watchlist` scopes `participant_id` for BORROWER_ROLES and `GET /:id` fences `borrower_id`; this child uses only `requireRead` → leaks another borrower's events. Fetch watchlist participant_id, fence for BORROWER_ROLES.

## Skipped (with reasons)

- **reserves/:id/movement ownership**: no owner column on `reserve_accounts`; `canWriteForProject` is broad. Fence needs a migration adding the column — deferred with the chain-ownership pass. Existence 404 (above) still lands.
- **withdraw issuer-ownership**: dunning notices are largely cron-issued; no clear issuer-owner column. Issuer-fence is speculative and could break legitimate lender withdrawal — status guard covers the real clobber bug.
- **esg.ts Class-A** (transactions scope2_method/data_quality, targets target_type, risks risk_type): shared carbon/ESG surface, not lender-owned — carbon/shared pass.
- **benchmark-transition-chain.ts** `classify-fallback` raw binds (replacement_rate, fallback_class): `WRITE_ROLES={admin,trader}` — trader iteration.
- **reserve-activation-chain / credit-origination-chain**: two-party lender/borrower chains — need the shared chain-ownership design decision, not a mechanical fence.
- **strate-swift / sap-oracle-erp / government-filing / reports / audit**: shared cross-role — dedicated pass.
- **Already-correct** (verified): covenant-tests/:id/actions, covenant-actions/:id/transition, covenant-tests/:id/advise — all have 404 + ownership fence + status guards; only their raw enum binds (Class A above) remain.

## Gates

tsc clean, full vitest green (baseline 303 files / 8784 tests), two commits on `feat/lender-depth-l4` (Class-A enum guards; ownership + existence + read scoping), merge --no-ff to main, push.
