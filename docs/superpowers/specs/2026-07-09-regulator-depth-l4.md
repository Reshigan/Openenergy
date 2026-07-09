# Regulator depth L4 — Sub-project (regulator)

Date: 2026-07-09. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **regulator** (regulator-suite: filings, directives, inspections, sanctions).

## Audit findings (real gaps only)

Every claim verified by direct read: `canRegulate()` definition and its use as the first line of sibling write handlers read verbatim; each flagged endpoint confirmed a state-changing write; migration CHECK lists read verbatim.

### Headline — L4 write endpoints missing the role gate (Class B)

Four state-changing write endpoints in `regulator-suite.ts` do not call `canRegulate()` as their sibling writes do — any authed caller can drive regulator-only transitions. Add the gate as the handler's first line, matching sibling style. (Exact endpoints confirmed by the anchor-capture pass.)

### Class A — unvalidated enums reaching DB CHECK constraints

Fix: `badEnum()` from `src/utils/validation.ts`, static allow-list copied verbatim from the migration CHECK, file's existing 400 convention. Fields A1–A6 confirmed against migrations by the capture pass.

### Class B — write-side ownership / existence fences

B1–B3: blind UPDATE with no existence check (phantom mutation + cascade with undefined ids), or fetch-by-id with no actor check. Add existence 404 / owner fence as the file's pattern dictates.

### Class C — cross-tenant read leak

C1: child sub-resource GET unscoped where the parent list is scoped. Fetch owner, fence.

## Gates

tsc clean, full vitest green (baseline 303 files / 8784 tests), commits on `feat/regulator-depth-l4` (role-gate + Class-A enum guards; ownership/existence + read-scope fences), merge --no-ff to main, push.
