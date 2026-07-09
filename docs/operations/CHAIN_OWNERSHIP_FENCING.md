# Chain-module ownership & cross-role row fencing

Date: 2026-07-09. Design pass over every `src/routes/*-chain.ts` and sibling
surface. Answers one question the depth-L4 loop kept hitting: **when is an
`owner_id === user.id` fence correct, and when does it silently break a
legitimate counterparty?**

## Why this matters

The trader/risk pass added ownership fences (`is_system || owner_id === user.id
|| admin`) to portfolio & scenario reads. That fence is *correct there* and
*wrong* on a two-sided transaction chain — a drawdown row is co-owned by the
IPP that raised it and the lender that funds it; fencing on `owner_id` would
403 the counterparty out of their own deal. The B1 (benchmark shared-desk)
fence was deferred in the trader pass for exactly this reason. This note makes
the rule explicit so future passes don't over-fence.

## Ownership taxonomy

Classify each chain by its `WRITE_ROLES` set (the `new Set([...])` on the
module) before touching any fence.

### Tier 1 — Single-desk (`[admin, <one business role>]`)
One business role authors and owns the row; admin is a superuser bypass.
Examples: `benchmark-transition-chain` (`admin,trader`),
`carbon-issuance/erpa/offset-claim/credit-rating` (`admin,carbon_fund`),
`dscr-monitoring / covenant-certificate / credit-origination` (`admin,lender`),
`counterparty-margin / algo-cert` (`admin,trader`), `risk` portfolios &
scenarios (trader-owned + `is_system`).

**Fence:** owner fence is *safe and correct* — `is_system || owner_id ===
user.id || ADMIN_ROLES.has(role)`. This is the pattern the risk pass shipped.

### Tier 2 — Shared-desk (multi-role write set)
The row is a transaction between named parties; two or more business roles
legitimately write it across its lifecycle. Examples:
`cod-chain` (ipp+grid+regulator+lender), `drawdown-chain`
(ipp+wind+lender+regulator), `carbon-retirement-chain`
(carbon_fund+regulator+lender), `carbon-article-6` (7 roles),
`esap-compliance-chain` (regulator+lender+ipp_developer),
`disbursement-chain` (support+regulator).

**Fence:** owner fence is **forbidden** — it would block the counterparty.
Correct fence = **tenant isolation** (every read resolves tenant from JWT, see
`utils/tenant.ts`) **+ `WRITE_ROLES` membership** **+ state-machine
`transition()`** (role-set × current status). Participant-scoped reads, where
needed, key on *is-user-a-named-party*, never `owner_id === user.id`.

### Tier 3 — Helper-gated (no local `new Set`)
Modules with no inline `WRITE_ROLES` literal (e.g. `carbon-tax-chain`,
`certificate-bundle-chain`, `demand-response-chain`, `export-curtailment-chain`)
gate via a shared `transition()` helper or per-handler role checks. Audit each
against its own helper; do **not** assume the empty grep means ungated.

## Audit result — this pass

Scanned every Tier-2 shared-desk chain for a stray owner fence
(`owner_id !== user.id`, `created_by !== user.id`):

**Clean — zero shared-desk chains apply an owner fence.** The deferred B1 risk
never materialised: shared-desk chains uniformly gate on role-set + status via
`transition()`, and owner fences appear *only* in the Tier-1 single-desk
surfaces where they belong (risk `risk_portfolios` / `risk_scenarios`). No code
change required.

## Rule for future depth passes

1. Read the chain's `WRITE_ROLES` set first.
2. Multi-role set → Tier 2 → **never** add an `owner_id` fence. Fix leaks with
   a participant/tenant fence instead.
3. `[admin, <one role>]` → Tier 1 → owner fence is the right tool
   (`is_system || owner_id || admin`).
4. No set → Tier 3 → find the helper, fence there once (root-cause), not per
   handler.
