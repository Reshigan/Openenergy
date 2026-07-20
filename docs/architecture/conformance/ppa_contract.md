# Conformance table — `ppa_contract` chain (Wave 22)

**Purpose.** Ground-truth extraction of the PPA contract execution lifecycle from the CURRENT
implementation + its tests, to be replayed against the rebuild's generic `applyTransition`
engine (see `docs/architecture/REBUILD_PLAN.md`). Rows are (from_state, action, guards,
to_state, side-effects, actor roles).

**Extraction date:** 2026-07-11

**Source files:**

| File | What it contributes |
|---|---|
| `open-energy-platform/src/routes/ppa-contract-chain.ts` (508 lines) | HTTP routes, `transition()` helper (L244–372), 10 transition endpoints (L375–414), SLA sweep + auto-expire (L417–506) |
| `open-energy-platform/src/utils/ppa-contract-chain-spec.ts` (111 lines) | Pure state machine: `TRANSITIONS` (L48–59), `SLA_MINUTES` (L73–84), `tierFromMw` (L93–98), regulator crossings (L103–110) |
| `open-energy-platform/src/utils/chain-registry-meridian.ts` L2528–2600 | Meridian entry `ppa_contract_chain`: lanes, actions, UI-required fields, terminals |
| `open-energy-platform/src/cascade-rules/lifecycle-sequencing.ts` L72–105 | Cross-chain rule #1: `cod.cod_certified` → auto-activate executed PPA |
| `open-energy-platform/src/cascade-rules/historic-retrospective.ts` L117–119, L240–258 | Onboarding retrospective seeds `in_force` rows directly |
| `open-energy-platform/src/routes/rbac.ts` L637–662 | Offtaker registration approval seeds a `draft` row |
| `open-energy-platform/src/utils/regulator-inbox-spec.ts` L417–443 | Regulator inbox triage for `ppa_contract.executed / terminated / sla_breached` |
| `open-energy-platform/src/utils/sweep-runner.ts` L260 | Cron wiring: `ppa_contract_sla` sweep (15-min band) |
| `open-energy-platform/migrations/134_ppa_contract_chain.sql` | DDL: `oe_ppa_contract_chain` + `oe_ppa_contract_chain_events`; no CHECK constraint on `chain_status` |
| `open-energy-platform/tests/ppa-contract-chain-spec.test.ts` (173 lines) | Spec tests: full transition matrix, SLA matrix, tiers, crossings |
| `open-energy-platform/tests/lifecycle-sequencing.test.ts` L209–255 | Cross-chain COD auto-activation tests |

Mount point: `/api/offtaker/ppa-contract-chain` (`src/routes/mount-routes.ts` L536).

---

## State inventory

10 status tokens, defined in `PpaStatus` (`ppa-contract-chain-spec.ts` L26–29). Terminals per
`TERMINALS` set (L38) and mirrored in the Meridian registry `terminal:` list (L2534).

| State | Terminal | SLA to leave (strategic / medium / small) | Notes |
|---|---|---|---|
| `draft` | no | 90d / 60d / 30d | DDL default status; entry state for rbac-seeded rows |
| `in_negotiation` | no | 180d / 90d / 45d | |
| `terms_locked` | no | 60d / 30d / 14d | |
| `legal_signed` | no | 30d / 14d / 7d | |
| `executed` | no | 540d / 365d / 180d (waits for COD) | |
| `in_force` | no | none (SLA = 0, `sla_deadline_at` NULL) | Excluded from breach sweep; subject to auto-expire |
| `in_dispute` | no | 30d / 14d / 7d | |
| `terminated` | **yes** | — | |
| `expired` | **yes** | — | |
| `cancelled` | **yes** | — | |

Tier is `capacity_tier` if it is a valid `PpaTier` (`strategic|medium|small`), else recomputed
from `tierFromMw(capacity_mw)`: ≥100 MW strategic, ≥10 MW medium, else small (null/undefined → small).

Note: the file-header comments in both the route and the spec say "9-state machine / 9 states";
the `PpaStatus` union has 10 tokens. The "9" appears to count `draft` as pre-lifecycle or is
simply stale — see Discrepancies.

---

## Common guard stack (applies to every transition row below)

All 10 transition endpoints funnel through `transition()` (`ppa-contract-chain.ts` L244–372),
which checks in order:

| # | Guard | Rejection | HTTP |
|---|---|---|---|
| G1 | `user` present and `user.role ∈ {admin, support, offtaker}` (`WRITE_ROLES`, L36) | `Forbidden` | 403 |
| G2 | Row exists (`SELECT ... WHERE id = ?`) | `Not found` | 404 |
| G3 | `advance(current, action)` succeeds — current state ∈ `TRANSITIONS[action].from` | `invalid_transition` (no structured reason beyond this token) | 409 |

There are **no other server-side guards**: no tenant scoping, no required-field validation,
no evidence checks, no e-sign gate. (E-sign signatories/ceremonies exist as an optional
parallel facility on the Thread surface via `chain-esign.ts`, but nothing in this route reads
or enforces `all_signed`.)

## Common side-effect stack (every successful transition)

1. `UPDATE oe_ppa_contract_chain SET chain_status = <to>, sla_deadline_at = slaDueAt(now, <to>, tier), updated_at = now` plus the per-action timestamp column (`TIMESTAMP_COLUMN`, L230–241) and any action-specific columns (see table).
2. If body `notes` present: append `\n[<iso-now>] <notes>` to `contract_notes`.
3. `INSERT INTO oe_ppa_contract_chain_events (…, event_type, from_status, to_status, actor_id, notes, payload, created_at)` — payload always carries `capacity_mw`, `capacity_tier`, `offtaker_name`, `crosses_to_regulator` plus action-specific fields.
4. `fireCascade({ event: 'ppa_contract.<event_type>', entity_type: 'ppa_contract_chain', … })` with `from_status`, `to_status`, `capacity_tier`, `crosses_to_regulator` = `crossesIntoRegulator(action, tier)` (true only for strategic execute/terminate).
5. Regulator inbox (downstream of the cascade, `regulator-inbox-spec.ts`): only `ppa_contract.executed`, `ppa_contract.terminated`, `ppa_contract.sla_breached` produce an inbox item, and only when `capacity_tier === 'strategic'` (severity `high`).
6. Response: `{ success: true, data: { id, chain_status, sla_deadline_at } }` 200.

---

## Conformance table

Actor roles for every user-driven row: **admin, support, offtaker** (write); read of list/detail:
admin, support, offtaker, ipp, ipp_developer, wind, regulator, lender (`READ_ROLES`, L35).
The Meridian registry action `roles` arrays match the route's `WRITE_ROLES` exactly.

| from_state | action / endpoint | actor roles | guards (reason / HTTP) | to_state | side-effects beyond common stack |
|---|---|---|---|---|---|
| *(n/a — row creation)* | rbac offtaker registration approval (`rbac.ts` L644–662) | system (on admin approval of offtaker registration) | none beyond registration approval flow; `INSERT OR IGNORE` | `draft` | Row seeded with `capacity_tier ∈ {utility, medium, small, micro}` — **non-spec tokens**, see Discrepancies. No event row, no cascade. |
| *(n/a — row creation)* | historic retrospective onboarding (`historic-retrospective.ts` L242–258) | system (cascade rule) | requires seller party resolvable; `INSERT OR IGNORE` | `in_force` (directly) | All lifecycle timestamps back-dated to PPA start; tier from local `capacityTier()` (strategic at ≥50 MW — **differs from spec's ≥100 MW**). No event row, no cascade. |
| `draft` | `begin_negotiation` — `POST /:id/begin-negotiation` | admin, support, offtaker | G1/G2/G3 | `in_negotiation` | `negotiation_at = now`; event `negotiation_started`; cascade `ppa_contract.negotiation_started` |
| `in_negotiation` | `lock_terms` — `POST /:id/lock-terms` | admin, support, offtaker | G1/G2/G3 | `terms_locked` | `terms_locked_at = now`; event/cascade `terms_locked` |
| `terms_locked` | `legal_sign` — `POST /:id/legal-sign` | admin, support, offtaker | G1/G2/G3 | `legal_signed` | `legal_signed_at = now`; event/cascade `legal_signed` |
| `legal_signed` | `execute` — `POST /:id/execute` | admin, support, offtaker | G1/G2/G3. Registry marks `board_approval_ref` + `legal_counterparty_ref` **required** (UI only) — **route does not enforce**; empty body accepted | `executed` | `executed_at = now`; optional columns `nersa_section34_ref`, `board_approval_ref`, `legal_counterparty_ref`; event/cascade `executed`; **strategic tier → regulator inbox item** ("Strategic PPA EXECUTED", high) |
| `executed` | `commence` — `POST /:id/commence` | admin, support, offtaker | G1/G2/G3 | `in_force` | `in_force_at = now`; if `executed_at` + `contract_term_years` present, computes and writes `expiry_date = executed_at + term_years` (local-time year addition); event/cascade `commenced`; `sla_deadline_at` cleared (in_force SLA = 0) |
| `executed` | *(system)* COD cascade rule `lifecycle.cod_certified_to_ppa_and_drawdown` on `cod.cod_certified` (`lifecycle-sequencing.ts` L72–105) | system (`system:cascade`) | Matching row `project_id=? AND participant_id=? AND chain_status='executed'`; best-effort (failures swallowed) | `in_force` | Direct `UPDATE` (bypasses `transition()`); `in_force_at = now`; event row with `event_type='in_force'` (**not** `commenced`); **no fireCascade** (deliberate, anti-recursion); **does not set `expiry_date`, does not clear `sla_deadline_at`**; separately queues a lender drawdown role-action (idempotent) |
| `in_force` | `dispute` — `POST /:id/dispute` | admin, support, offtaker | G1/G2/G3 | `in_dispute` | `dispute_at = now`; optional `dispute_notes` column + payload; event/cascade `disputed` |
| `in_dispute` | `resolve` — `POST /:id/resolve` | admin, support, offtaker | G1/G2/G3 | `in_force` | `resolved_at = now`; event/cascade `resolved` |
| `executed`, `in_force`, `in_dispute` | `terminate` — `POST /:id/terminate` | admin, support, offtaker | G1/G2/G3. Registry marks `reason` **required** (UI only) — route does not enforce | `terminated` | `terminated_at = now`; optional `termination_reason`; event/cascade `terminated`; **strategic tier → regulator inbox item** ("Strategic PPA TERMINATED", high) |
| `in_force` | `expire` — `POST /:id/expire` (manual) | admin, support, offtaker | G1/G2/G3. **No check against `expiry_date`** — an in-force PPA can be manually expired at any time | `expired` | `expired_at = now`; event/cascade `expired` |
| `in_force` | *(system)* auto-expire in SLA sweep (`ppaContractSlaSweep` L468–503) | system | `chain_status='in_force' AND expiry_date IS NOT NULL AND date(expiry_date) < date('now')` | `expired` | Direct `UPDATE` (bypasses `transition()`); `expired_at`, `sla_deadline_at = NULL`; event `expired` (actor `system`); cascade `ppa_contract.expired` |
| `draft`, `in_negotiation`, `terms_locked`, `legal_signed` | `cancel` — `POST /:id/cancel` | admin, support, offtaker | G1/G2/G3. Registry marks `reason` **required** (UI only) — route does not enforce | `cancelled` | `cancelled_at = now`; optional `cancellation_reason`; event/cascade `cancelled` |
| any of `draft…legal_signed`, `executed`, `in_dispute` (non-terminal, non-`in_force`, with `sla_deadline_at` past) | *(system)* SLA breach sweep (`ppaContractSlaSweep` L417–465; wired as `ppa_contract_sla` in `sweep-runner.ts`, 15-min cron band) | system | Dedup: skips rows breached within the last hour (`last_sla_breach_at`) | *(no state change)* | `last_sla_breach_at = now`, `escalation_level += 1`; event `sla_breached` (from = to = current status); cascade `ppa_contract.sla_breached` with `crosses_to_regulator = (tier === 'strategic')`; **strategic tier → regulator inbox item** ("Strategic PPA SLA breached", high) |

Rejected-transition matrix (all return 409 `invalid_transition`; asserted exhaustively by the
spec test's terminal-stickiness loop and negative cases):

- `terminate` from `draft` / `in_negotiation` / `terms_locked` / `legal_signed` (use `cancel`)
- `cancel` from `executed` / `in_force` / `in_dispute` (use `terminate`)
- `expire` from anything but `in_force`
- every action from `terminated` / `expired` / `cancelled` (terminals are sticky)
- every action whose `from` list doesn't contain the current state (single-`from` chain steps)

---

## Cross-chain mutations of `ppa_contract` state

Exhaustive: a repo-wide grep for `oe_ppa_contract_chain` finds only these writers outside the
route module.

1. **`cascade-rules/lifecycle-sequencing.ts` rule #1** (`cod.cod_certified`): auto-advances a
   matching `executed` PPA to `in_force` (row in table above). Test-backed
   (`tests/lifecycle-sequencing.test.ts` L209–255): advances executed→in_force with event row
   actor `system:cascade`; leaves a `draft` PPA untouched; lender prompt idempotent.
2. **`cascade-rules/historic-retrospective.ts`**: onboarding retrospective inserts fully
   back-dated `in_force` rows (creation, not a transition).
3. **`routes/rbac.ts`** offtaker approval scaffold: inserts a `draft` row (creation).
4. **Seed migrations** `135_ppa_contract_chain_seed.sql`, `494_seed_personas_and_contracts.sql`,
   `501_seed_cascade_and_events.sql` — demo data only.

`ppa-termination-chain.ts`, `ipp-ppa-variation.ts`, `ppa-annual-recon-chain.ts`,
`ppa-nomination-chain.ts`, `ppa-change-in-law-chain.ts`, `virtual-ppa-settlement-chain.ts`
do **not** read or write `oe_ppa_contract_chain` — they are independent chains over their own
tables despite the PPA naming.

---

## Discrepancies (spec vs implementation vs registry)

1. **Registry-required fields are not enforced server-side.** The Meridian registry marks
   `execute.board_approval_ref`, `execute.legal_counterparty_ref`, `terminate.reason`,
   `cancel.reason` as `required: true` (registry L2547–2548, L2560, L2581), but
   `transition()` accepts empty bodies for all of them. Requirement lives in the SPA form only.
   The rebuild engine must decide which is authoritative.
2. **"14-day persistent-dispute regulator crossing" is documented but not implemented as
   described.** Spec comments (`ppa-contract-chain-spec.ts` L6–7, L101–102) say strategic PPAs
   cross into the regulator inbox after 14d in dispute, "handled in the route". The only
   mechanism is the generic SLA-breach sweep, and the strategic `in_dispute` SLA is **30d**,
   not 14d (14d is the *medium* tier, which never crosses). No dedicated 14-day dispute
   crossing exists anywhere.
3. **Tier-token drift at creation.** `rbac.ts` L647 seeds `capacity_tier` from a
   `utility|medium|small|micro` scale (≥100 utility, ≥20 medium, ≥5 small, else micro) —
   `utility` and `micro` are not valid `PpaTier` tokens. `transition()` self-heals via
   `isTier()` → `tierFromMw()` when computing SLAs/crossings, but the stored column stays
   non-spec and the list endpoint's `by_tier` aggregation reports raw tokens.
4. **Strategic threshold mismatch.** `historic-retrospective.ts` L118 classifies strategic at
   **≥50 MW**; the spec's `tierFromMw` uses **≥100 MW**. Retrospective-seeded 50–99 MW PPAs are
   stored `strategic` and will trigger regulator crossings the spec says they shouldn't.
5. **Two different event vocabularies for the same transition.** Route `commence` writes
   `event_type='commenced'`; the COD cascade rule writes `event_type='in_force'` for the same
   executed→in_force move, fires no cascade, sets no `expiry_date`, and doesn't clear
   `sla_deadline_at` (so an auto-activated PPA keeps its stale 18/12/6-month `executed`
   deadline — harmless only because the sweep excludes `in_force`; it also never auto-expires,
   because `expiry_date` stays NULL unless later set).
6. **No user-facing create.** The route module has no `POST /` and the registry entry has no
   `initiation` block, so `draft` rows cannot be created through the chain API or the Ledger
   `+New` flow — only via rbac onboarding, retrospective seeding, or migrations. The happy path
   from `draft` is exercisable only on seeded rows.
7. **No tenant isolation.** List, detail, and transitions never filter by tenant (contrary to
   the repo-wide convention described in CLAUDE.md via `utils/tenant.ts`). Any READ_ROLE user
   sees, and any WRITE_ROLE user can transition, every PPA row platform-wide. Uncertain whether
   deliberate (single-market assumption) — flagged, not judged.
8. **"9-state machine" comments vs 10 status tokens.** Route header L6 and spec header L9 say
   9 states; `PpaStatus` has 10. Cosmetic, but the rebuild's ChainDecl should count 10.
9. **`chain_key` naming collision.** Analytics/deal-engine tests and `deal-registry.ts` L288
   use bare `ppa_contract` as a chain key whose live dispatch endpoint is `/api/ppa/contracts`
   (a different, legacy table), and `tests/chain-state.test.ts` L54 explicitly notes
   `'ppa_contract' is not a registered emitting chain` (heuristic terminal detection treats
   `settled` as terminal — not a state of this chain at all). The Meridian key is
   `ppa_contract_chain`; cascade events use the `ppa_contract.` prefix. Three near-identical
   identifiers for two different things — a rebuild footgun.
10. **`expiry_date` year-arithmetic uses local time.** `commence` computes expiry with
    `new Date(getFullYear()+n, getMonth(), getDate())` (local TZ) then slices an ISO date —
    off-by-one-day risk around midnight/UTC offsets (cf. INTEGRATION_GAPS gap 13 UTC/SAST).
    The retrospective path uses UTC. Minor, but the two writers disagree.
11. **No CHECK constraint on `chain_status`** in `134_ppa_contract_chain.sql` — nothing at the
    DB layer prevents out-of-vocabulary states (and the cascade/rbac writers bypass the state
    machine entirely).

---

## Coverage note

**Test-backed rows** (`tests/ppa-contract-chain-spec.test.ts` — unit-level, against the pure
spec module, not HTTP):

- All 10 action → to_state mappings and their full `from` sets (happy path, dispute loop,
  terminate-from-3, cancel-from-4, expire-only-from-in_force).
- All rejected transitions, including exhaustive terminal stickiness (3 terminals × 10 actions).
- SLA matrix monotonicity, exact strategic-draft 90d and executed 540/365/180d values, zero-SLA
  states returning null deadlines.
- `tierFromMw` boundaries (100/10, null/undefined).
- Regulator crossings: strategic execute/terminate true, all other action×tier combinations
  false; SLA-breach crossing strategic-only.

**Test-backed cross-chain row:** COD auto-activation (`tests/lifecycle-sequencing.test.ts`):
executed→in_force with event row, non-executed left untouched, idempotent lender prompt.

**Implementation-only (no test found):**

- Everything in `transition()` itself: the 403/404/409 HTTP mapping, per-action timestamp
  columns, `expiry_date` computation on commence, notes appending, event-row payloads,
  `fireCascade` payload shape. No HTTP-level test exercises any of the 10 endpoints
  (`tests/` has no route test for `ppa-contract-chain`; `journey-matrix.json` references the
  surface but the browser suite does not drive these transitions).
- The SLA sweep: breach detection, 1-hour dedup, escalation_level increment, and the
  auto-expire branch have zero direct tests.
- List/detail endpoints (filters, `decorate()` SLA fields, KPI aggregates).
- rbac and retrospective row creation paths (no tests assert the seeded tier tokens — which is
  how discrepancies 3–4 survived).

Rough coverage: of the 15 behavioural rows in the conformance table, 11 have their state-machine
core test-backed via the spec module, 1 (COD rule) is fully test-backed end-to-end, and 3
(SLA breach sweep, auto-expire, both creation paths) are implementation-only. Guard behaviour
(G1–G3 HTTP semantics) is implementation-only across the board.
