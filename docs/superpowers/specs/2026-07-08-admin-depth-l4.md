# Admin depth L4 — Sub-project 4

Date: 2026-07-08. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **admin** (22 thin-card + 7 routed rows).

## Audit findings (real gaps only)

Three parallel investigators + direct verification. ML/attestation surfaces (anomaly_admin, rul_prediction_admin, fault_fingerprint_admin, reconciliation_attestation) already guarded via WRITE_ROLES + `nextStatus()` transition helpers — no gaps.

### Gap 1 — POPIA SAR lifecycle has no state machine (popia-deep.ts)

- `POST /sar/:id/assign` (line ~111): adminOnly gated, but blind UPDATE. No existence check; forces `status='in_progress'` from ANY status — can silently reopen a fulfilled/rejected SAR. Cascade `popia.sar_assigned` fires for nonexistent ids.
- `POST /sar/:id/respond` (line ~130): outcome enum validated, but blind UPDATE — can re-respond to terminal SARs or respond to nonexistent ids.

Statuses (migration 061): `open | acknowledged | in_progress | fulfilled | rejected | escalated`.

**Fix:** pure guard module `src/utils/sar-spec.ts` (mirrors `om-fault-spec.ts`): `canAssignSar(from)`, `canRespondSar(from)` returning `{ok, reason_code?}` with `SAR_INVALID_TRANSITION`. Routes fetch row first → 404 missing, 409 + reason_code on bad transition. Terminal: fulfilled, rejected.

- assign → in_progress: allowed from open, acknowledged, in_progress (reassignment), escalated
- respond → fulfilled|rejected: allowed from open, acknowledged, in_progress, escalated

### Gap 2 — Tenant suspend/reactivate blind UPDATE (admin-platform.ts ~78, ~96)

requireAdmin gated but no existence check, no from-state; `tenant.suspended`/`tenant.reactivated` cascades fire even for nonexistent tenants. **Fix:** fetch tenant → 404 missing; suspend only from `active`, reactivate only from `suspended` → 409 + reason_code otherwise.

### Gap 3 — PUT /users/:id no existence check (admin.ts ~102)

Step-up gated, field values enum-validated, but UPDATE + audit_logs INSERT + cache invalidation all run and return success for nonexistent user. **Fix:** existence check → 404 before UPDATE.

### Gap 4 — Marketplace withdraw from any status (marketplace.ts ~150)

Seller-or-admin + existence check present, but sets `withdrawn` from ANY status — including `sold` (erases completed sale record state). **Fix:** withdraw only from `active | pending` → 409 + reason_code otherwise.

## Skipped (with reasons)

- `POST /provisioning-requests` public: intentional per code comment ("anyone can submit, admin approves").
- contracts.ts relational ACL: valid collaboration pattern per audit.
- fireCascade on module/tenant CRUD: auditLog sufficient; new `CascadeEvent` union entries = scope creep.
- `PUT /listings/:id` full transition matrix: withdraw guard covers the dangerous path.
- `POST /popia/objection` processing_purpose enum: no canonical enum exists anywhere; free-form purpose is legitimate under POPIA s11(3); value binds via `?` placeholder.
- settlement_rails / erp_connectors / filing_connectors / reports / audit rows: shared cross-role — deferred to dedicated shared-row pass.

## Gates

tsc clean, full vitest green, TDD for sar-spec (red → green), commit on `feat/admin-depth-l4`, merge --no-ff to main, push.
