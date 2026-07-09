# Support depth L4 — Sub-project (support)

Date: 2026-07-09. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **support** (ticketing + ML model-card surfaces: anomaly-detection, RUL prediction, fault-fingerprint).

## Audit findings (real gaps only)

Every claim verified by direct read: migration CHECK value lists read verbatim; each flagged handler read to confirm a raw `?` bind; the phantom-transition path read to confirm the cascade fires on a 0-row update.

### Class A — unvalidated enums reaching DB CHECK constraints

Fix: `badEnum()` from `src/utils/validation.ts` (absent values pass through; allow-list a static literal copied verbatim from the migration CHECK), file's existing 400 convention, naming the bad field. The three ML modules do not import `badEnum` yet — add the import.

| Route | Field | Notes |
|---|---|---|
| support.ts (create ticket) | priority | migration CHECK |
| support.ts (comment/visibility path) | visibility | migration CHECK |
| anomaly-detection-ml.ts | model_card_status | create + two transition bodyHandlers |
| rul-prediction-ml.ts | model_card_status | create + two transition bodyHandlers |
| fault-fingerprint-ml.ts | model_card_status | create + two transition bodyHandlers |

### Class B — phantom transition (cascade on 0-row update)

- support.ts transition path — blind `UPDATE` then unconditional cascade even when no row matched (already-terminal or wrong id). Guard on `res.meta.changes` before firing the cascade; return a 404/409 when nothing changed, so no cascade runs with an unchanged/undefined state.

### Class C — none.

## Gates

tsc clean, full vitest green (baseline 303 files / 8784 tests), one commit on `feat/support-depth-l4` (Class-A enum guards + phantom-transition guard), merge --no-ff to main, push.
