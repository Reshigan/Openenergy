# Grid-operator depth L4 — Sub-project (grid_operator)

Date: 2026-07-09. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **grid_operator** (export-curtailment + wheeling-access chains).

## Audit findings (real gaps only)

Every claim verified by direct read: migration CHECK value lists read verbatim; each flagged handler read to confirm a raw `?` bind of a request value ahead of a silent fallback default. Small, clean scope — the two chain modules are otherwise L4 (state machine + owner fences + cascade already present). Only unvalidated enums remain.

### Class A — unvalidated enums reaching DB CHECK constraints

Each is a raw request value bound into a column with a migration CHECK, applied *before* a fallback default — a bad value reaches D1 and surfaces as a generic 422 (via `classifyConstraint`). Fix: `badEnum()` from `src/utils/validation.ts` (absent values pass through the fallback unchanged; allow-list is a static literal copied verbatim from the migration CHECK), returning the file's existing 400 convention and naming the bad field.

| Route | Field | CHECK values (verbatim) |
|---|---|---|
| export-curtailment-chain.ts (create) | curtailment_tier | 'minor','moderate','significant','systemic' |
| export-curtailment-chain.ts (create) | curtailment_type | 'network_congestion','load_management','emergency_curtailment','planned_maintenance','frequency_deviation','voltage_violation' (null passes) |
| wheeling-access-chain.ts (create) | wheel_tier | 'small_embedded','medium_distributed','large_industrial','bulk_transmission' |

### Class B — none

Both chains already fence writes with owner + state-machine guards (verified).

### Class C — none

Reads are correctly scoped; no child sub-resource leak found.

## Gates

tsc clean, full vitest green (baseline 303 files / 8784 tests), one commit on `feat/grid-operator-depth-l4` (Class-A enum guards), merge --no-ff to main, push.
