# Trader depth L4 — Sub-project (trader)

Date: 2026-07-09. Parent: `2026-07-08-do-next-stream-design.md` (loop over ROLE_DEPTH_MATRIX thin rows, role by role). Role: **trader** (trading, risk, benchmark-transition chain).

## Audit findings (real gaps only)

Every claim verified by direct read: migration CHECK value lists read verbatim; each flagged POST handler read to confirm raw binds / missing actor fences; sibling scoped list handlers read before flagging a child read as a leak. Scope: `trading.ts`, `risk.ts`, `benchmark-transition-chain.ts`. `benchmark-transition-chain.ts` is trader-owned (`WRITE_ROLES={admin,trader}`) — deferred out of the lender pass, picked up here. Clean/verified-correct: trader-mm-compliance, margin-gate, esg-reports.

### Class A — unvalidated enums reaching DB CHECK constraints

Fix: `badEnum()` from `src/utils/validation.ts`, static allow-list copied verbatim from the migration CHECK, file's existing 400 convention. (Only true enum columns; numeric fields excluded.)

| Route | Field(s) |
|---|---|
| benchmark-transition-chain.ts classify-fallback | fallback_class (+ replacement_rate only if enum-constrained) |
| trading.ts | market_type |
| trading.ts (exception path) | exception_type, severity |
| trading.ts (resolution path) | outcome |

### Class B — missing write-side ownership fences

- benchmark-transition-chain.ts `transition()` — owner fence after the fetched-row 404.
- risk.ts var/recompute — owner fence on the fetched portfolio.
- risk.ts scenarios/run — owner fence on the fetched scenario.

### Class C — cross-tenant read leak (parent list is scoped)

- risk.ts portfolio/scenario child reads (~4 sites) — parent list scopes owner; child GETs do not. Fetch owner, fence for non-admin, matching the file's established `!== user.id && user.role !== 'admin'` pattern.

## Gates

tsc clean, full vitest green (baseline 303 files / 8784 tests), two commits on `feat/trader-depth-l4` (Class-A enum guards; ownership + read-scope fences), merge --no-ff to main, push.
