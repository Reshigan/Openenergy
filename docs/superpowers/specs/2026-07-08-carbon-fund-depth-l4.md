# carbon_fund depth L3→L4 — certificates, MRV, vintages

**Date:** 2026-07-08
**Status:** Implementation
**Parent:** 2026-07-08-do-next-stream-design.md (Sub-project 2 — first backlog item)

## Problem

The do-next spec named certificates the first Sub-project 2 candidate
("L3→L4/L5: evidence chain + certified NERSA export"). Audit of
`src/routes/carbon-registry.ts` shows the L5 layer **already exists**
(commit 52227554: audit chain endpoints, Verra-shape certified export to R2
with sha256 manifest, external reconciliation). The real remaining gaps are
L4 gating/state-machine holes, all in one file:

1. `POST /retirement-certificates/issue` — **no role gate** (any authed role
   can issue), no check that `retirement_id` exists in `carbon_retirements`,
   no volume cap vs the retirement's `quantity` (over-issuance possible),
   no revoke lifecycle despite schema `CHECK (status IN (...,'revoked'))`.
2. `POST /mrv-submissions/:id/transition` — any→any transitions allowed
   (published→submitted, verified→draft…), no role gate, rejection without a
   reason, no cascade.
3. `POST /vintage-workflow/:id/advance` — accepts **any string** as stage,
   no auth, no audit, no cascade.

## Design (ponytail: pure spec module + route wiring, repo convention)

New `src/utils/carbon-fund-depth-spec.ts` — pure functions, unit-testable
without DB, matching the `*-spec.ts` pattern (cf. carbon-issuance-spec):

- `canTransitionMrv(from, to, {rejection_reason}) → {ok, reason_code?}`
  draft→submitted→under_verification→{verified|rejected}, verified→published,
  rejected→submitted (resubmit). Rejection requires reason
  (`MRV_REJECTION_REASON_REQUIRED`).
- `canAdvanceVintage(from, to) → {ok, reason_code?}` — forward-only along
  validated→listed→traded→retired_partial→retired_full→expired
  (`VINTAGE_INVALID_STAGE`, `VINTAGE_NOT_FORWARD`).
- `certIssueGuard({retirement, alreadyIssuedTco2e, requestedTco2e}) →
  {ok, reason_code?}` — `CERT_RETIREMENT_NOT_FOUND`,
  `CERT_VOLUME_INVALID`, `CERT_VOLUME_EXCEEDS_RETIRED` (sum of non-revoked
  certs + request ≤ retirement quantity; partial certificates allowed, so
  the volume-sum guard subsumes a duplicate guard).
- `certRevokeGuard(status) → {ok, reason_code?}` — only issued|delivered
  revocable (`CERT_NOT_REVOCABLE`).

Route wiring (`carbon-registry.ts`):

- issue: `canWrite` gate; load retirement (participant-scoped unless
  admin/regulator); `SUM(retired_volume_tco2e)` of non-revoked certs;
  guard → 4xx `{error, reason_code}`; audit+cascade unchanged.
- new `POST /retirement-certificates/:id/revoke {reason}` — `canWrite`,
  owner-scoped, guard, `appendAudit` + `fireCascade
  ('carbon.retirement_certificate_revoked')`.
- mrv transition: `canWrite` gate + ownership scope, guard, cascade
  `carbon.mrv_submitted` / `carbon.mrv_verified` (existing union members)
  on those transitions.
- vintage advance: `canWrite` gate + ownership scope, guard, `appendAudit`
  + `fireCascade('carbon.vintage_advanced')`.
- cascade union: add `carbon.vintage_advanced`,
  `carbon.retirement_certificate_revoked`.

## Explicitly out (ponytail)

- NERSA-profile export variant: existing certified Verra export + recon
  covers the L5 rubric row; add a NERSA shape only when a regulator asks.
- Certificate `delivered` transition + PDF generation: no consumer today.
- SLA sweep for certificates: no time-bound obligation exists on issuance.
- Matrix regen: verdicts key off frontend `chainKey` wiring, not backend
  depth — regenerating would change nothing (verified in
  scripts/audit-role-depth.mjs classify()).

## Security

No new SQL identifier paths; all new queries are static strings with `?`
binds. MERIDIAN_CHAINS invariant untouched.

## Testing

`tests/carbon-fund-depth-spec.test.ts` — pure guard tests (transition
matrix, volume caps incl. float epsilon, reason codes). Route-level
behaviour follows the file's existing pattern (guards exercised via spec
module; routes are thin wiring).
