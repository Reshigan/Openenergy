# esco/esums_owner depth L4 — tenancy + fault state machine

**Date:** 2026-07-08
**Status:** Implementation
**Parent:** 2026-07-08-do-next-stream-design.md (Sub-project 3 — esco + esums_owner,
46 matrix rows across shared surfaces)

## Problem

Audit of the esums route family (esums-om, esums-om-analysis, esums-om-intel,
esums-accruals, esums-commissioning) against the L4 rubric found the surfaces
mostly deep already (WO chain, commissioning state machine, cascades, SLA
sweeps). The real gaps are concrete tenancy/state-machine holes:

1. `POST /esums/opportunities/act` (esums-om-analysis.ts) — **no role gate at
   all**; any authed role can create WOs on arbitrary sites, increment global
   parts stock, and file warranty claims.
2. `POST /esums/predictions/:id/action` (esums-om-intel.ts) — no role gate, no
   site scope; updates the prediction **before** checking it exists.
3. `PATCH /esums/carbon-credits/:id` (esums-accruals.ts) — role gate + transition
   guard exist, but a carbon_fund user can verify/retire **any** participant's
   credit.
4. esums-commissioning.ts `applyAdvance` — loads the site with no
   participant/contractor scope; any PARTICIPANT_WRITE role can advance any
   site's commissioning chain.
5. `POST /esums/faults/:id/resolve` — role gate + ownership present, **no
   transition guard**: resolves already-closed / false_positive faults,
   re-resolving recomputes `total_loss_zar`. Plus WO-completion auto-resolve
   (`work-orders/:id/transition`) resolves faults in any status.
6. `POST /esums/ingestion` (esums-om-intel.ts) — role gate but no site
   ownership; an asset_owner can register a polling connection against someone
   else's site.
7. `GET /esums/sites/:id` (esums-om.ts) — list route is participant-scoped,
   detail route is not: cross-tenant read of any site row by id.

## Design (ponytail: reuse existing helpers, one new pure spec)

New `src/utils/om-fault-spec.ts` (repo `*-spec.ts` convention; no fault
transition spec exists — WO chain has one, faults don't):

- statuses from migration 058: open | acknowledged | in_progress | resolved |
  closed | false_positive
- `FAULT_TRANSITIONS` forward map; resolved→closed; closed/false_positive
  terminal
- `canTransitionFault(from, to) → {ok, reason_code?}`
  (`FAULT_INVALID_TRANSITION`)
- `FAULT_RESOLVABLE_STATUSES = ['open','acknowledged','in_progress']` — used
  as a static SQL literal in the auto-resolve UPDATE

Wiring (root-cause placement, not per-caller patches):

- Export `canMutate` + `assertSiteOwnership` from esums-om.ts; import in
  esums-om-analysis.ts (opportunities/act: gate + scope create_wo) and
  esums-om-intel.ts (predictions action: gate + fetch-first + scope; ingestion
  create: scope).
- carbon-credits PATCH: non-officer carbon_fund must own the credit
  (`row.participant_id === user.id`).
- commissioning `applyAdvance`: after loadSite, non-officer callers whose id is
  neither participant_id nor om_contractor_id get `not_found` (anti-enumeration:
  don't reveal foreign site ids; zero caller changes — all six advance
  endpoints route through this one helper).
- faults resolve: guard via spec → 409 `{error, reason_code}`; auto-resolve
  UPDATE gains `AND status IN ('open','acknowledged','in_progress')`.
- sites/:id: same officer set as the list route (admin/support/regulator),
  else participant_id/om_contractor_id match, else 403.

## Explicitly out (ponytail)

- Blanket audit-chain retrofit across esums modules — cascades already feed the
  audit stages; add appendAudit only where a surface earns L5.
- reason_code retrofit on untouched endpoints.
- meter-scan gating — compute-only, no mutation.
- Matrix regen — verdicts key off frontend chainKey/surface wiring
  (scripts/audit-role-depth.mjs classify()); backend depth can't flip them.

## Security

No new SQL identifier paths; all new predicates are static strings with `?`
binds. MERIDIAN_CHAINS invariant untouched.

## Testing

`tests/om-fault-spec.test.ts` — transition matrix, terminal states, unknown
status defense, resolvable-status list matches the map.
