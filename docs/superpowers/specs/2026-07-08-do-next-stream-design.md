# Do-Next Stream + Per-Role Depth Audit — Design

**Date:** 2026-07-08
**Status:** Design, pending implementation-plan
**Author:** Reshigan Govender (with Claude)

## Problem

The platform is state-rich but navigation-poor. Screens show numbers; nothing is
clickable (dead-ends). Transactional row-lists swamp insight. Role journeys are
fragmented into isolated CRUD tabs. Entry friction is high. The user wants a UI
that is **insights-based, action-based, and transaction-based** — three pillars
carried in one continuous journey, intuitive enough to need no change-management
retraining.

A first design revision was rejected as "disconnected / large change-management
effort / not intuitive." This spec is the corrected model.

## Two axes, stated honestly

There are two independent axes to "finished," and this spec is deliberate about
which it closes and which it only measures:

1. **Navigation / intuitiveness** — closed system-wide by this spec. Config-driven
   off existing sources (`horizon/:role`, `MERIDIAN_CHAINS`, `roleData`), so all
   10 roles inherit the shell with zero per-role code.
2. **Feature depth (L1–L5 rubric)** — NOT closed by this spec. The shell surfaces
   a role's real depth; it cannot manufacture depth a surface doesn't have. A
   Bucket-B / L2 surface yields a thin card. Closing depth is per-surface work,
   one spec each, out of scope here.

This spec ships axis 1 fully and **measures** axis 2 (the audit), producing a
prioritized backlog instead of a vibe. It does not deepen any surface.

## What already exists (do not rebuild)

The inbox+journey substrate is already live at `/cockpit`
(`pages/src/meridian/JourneyCockpit.tsx`, ~605 lines). It implements ~80% of the
target:

- **Today tab = inbox** — `data.duty` ranked by attentionScore, breach dot.
- **Per-journey tabs** — pipelines with lifecycle lanes + stage-dot rail + counts.
- **In-place Thread expansion** — thread folds open on the row.
- **In-cockpit compose** — `openCompose → fetchLedger`.
- **Surface-in-panel** — `SURFACE_REGISTRY` rendered in the context rail.

`GET /api/horizon/:role` (`src/routes/horizon.ts`) already returns
`{ lanes, duty, counts }`; cases carry `bucket / status / score / quantum_zar /
actions`; `duty` = top-8 by score. `laneRoleFor` re-points `esums_owner → esco`.
403 unless caller role === role or admin.

**The dead-end:** the stage-dot rail (JourneyCockpit ~449–462) renders a count but
has **no `onClick`**. Numbers that go nowhere. That is the core complaint in one
component.

## Sub-project structure

"Finished for every role" is a program, not one spec. Decomposed:

- **Sub-project 1 (this spec):** the do-next stream shell + carbon_fund pilot,
  fully wired + the audit method + the generated matrix. Buildable now.
- **Sub-project 2..N (deferred, one spec each):** the actual L2→L4 deepening of
  every yellow/red row the audit flags. This spec names them; it does not build
  them.

---

## Design — Sub-project 1

### 1. The do-next stream (interaction model)

Stop making the user navigate *to* work. Bring work to them in one
attention-ranked stream. Landing = the ranked stream — an inbox that empties. No
tab to choose first.

**The card is the whole unit**, carrying all three pillars inline:

1. **Insight** — one line + sparkline answering "why me / why now," derived from
   the case's existing `score / quantum_zar / bucket`. No new fetch.
2. **Transaction** — the thread summary folds open in place on the card (already
   wired in JourneyCockpit).
3. **Action** — the single most-likely next transition on the card face
   (`[Verify]` / `[Publish]` / `[Issue certificate]`), from `actions[0]`.
   Secondary actions behind `···`.

**Journeys/stages demote to filter chips** (`All · MRV · Vintages · Certificates`)
that filter the same stream in place — no route change, no new screen, no context
loss. This replaces the tab + stage-rail + list + thread fragmentation with one
continuous surface.

**Related transactions link card-to-card** so the user follows the deal, not the
app.

### 2. Reuse ledger (net-new is small)

| Piece | Source | New? |
|---|---|---|
| Attention ranking | `duty` (horizon) | reuse |
| Thread fold | JourneyCockpit | reuse |
| Transition modals | ActionModal + surface handlers | reuse |
| Insight viz strips | `esumsom/viz` (Grid2/Panel/NumBars/CountBars) | reuse |
| Promote `actions[0]` onto card face | — | **new** |
| Tabs → filter chips | — | **new** |
| One-line insight + sparkline per card | — | **new** |

**No backend change.** All three new pieces are frontend rearrangement of data the
card already carries.

### 3. Pilot: carbon_fund

carbon_fund is the pilot role (prior decision). Its surfaces are known and read:

- `carbon_fund:mrv` (`MrvSurface.tsx`) — Bucket B. Endpoint
  `/carbon-registry/mrv-submissions`; transition
  `POST /:id/transition {to, reduction_tco2e?, rejection_reason?}`.
  States: submitted → under_verification → verified → rejected → published.
- `carbon_fund:vintages` (`VintagesSurface.tsx`) — Bucket B. Endpoint
  `/carbon-registry/vintage-workflow`; advance `POST /:id/advance {to_stage}`.
  Stages: validated → listed → traded → retired_partial → retired_full → expired.
- `carbon_fund:certificates` (`CertificatesSurface.tsx`) — Bucket B. Issue
  `POST /carbon-registry/retirement-certificates/issue`.

The card's primary action invokes these existing handlers inline (the same
ActionModal the surface opens today), so no transition logic is rewritten — the
card is a new entry point to wiring that already works.

### 4. Security invariant (unchanged, load-bearing)

SQL identifiers come **only** from the `MERIDIAN_CHAINS` static literal, never from
request input. Request values bind to `?` placeholders only. The stream introduces
no new query paths; it reads `horizon/:role` output and calls existing transition
endpoints. This invariant is untouched and must stay untouched.

---

## Design — the depth audit (method + output)

### Method (mechanical, read-only, no opinion)

Per role, walk `getRoleConfig(role).domains → features`. Classify each feature by
signals already in the codebase:

| Signal (derivable) | Depth read |
|---|---|
| `chainKey` in `MERIDIAN_CHAINS` + lanes + actions | L3 candidate (state machine + transitions) |
| Bucket-B surface (ListingTable + transition endpoint, no descriptor) | L2–L3 (CRUD + maybe transitions) |
| tile resolves to nothing / dead route | L1 (mock) — must fix or hide |
| transition route fires `fireCascade` + on an SLA sweep | L4 (workflow) |
| certified export / reconcile-against-external | L5 |

Output = one matrix, **role × journey × current-L × card-readiness** (does `duty`
carry score + quantum + action for it?). Per row, one verdict:
`journey-ready` / `thin-card` / `dead-tile`.

### Output location

The matrix goes in a **regenerable** doc, `docs/operations/ROLE_DEPTH_MATRIX.md`,
NOT inline here — it goes stale as surfaces deepen; the method (this section) stays
stable. Regenerate by re-running the audit pass.

### Honesty rule for the matrix

Only carbon_fund is audited from files actually read (below). The other 9 roles'
L-levels are **not** guessed in this spec — they are generated by running the audit
pass over `roleData` + `MERIDIAN_CHAINS` + `surfaces.tsx` during implementation.
Fabricating depth levels for un-audited roles would defeat the point of the audit.

### carbon_fund row (audited, truthful)

| Journey | Current-L | Card-readiness | Verdict |
|---|---|---|---|
| MRV submissions | L3 — state machine (submitted→…→published), server transition, but no cascade/SLA observed | duty carries status + action | journey-ready, depth caps at L3 |
| Vintage workflow | L3 — stage advance with server validation; no dunning/timer observed | status + advance action | journey-ready, depth caps at L3 |
| Retirement certificates | L2–L3 — issue endpoint, status lifecycle; issuance is a single POST, no evidence chain observed | status only, action = issue | thin-card on depth; needs L4 (evidence/certified export) to read "finished" |

Reading: carbon_fund is **navigation-finished** by the stream (all three journeys
feed cards, actions on face) but **depth-capped at L3**; certificates is the first
Sub-project 2 candidate (L3→L4/L5: evidence chain + certified NERSA export).

---

## Scope boundary

**In (this spec):** the stream shell (card + inline pillars + filter chips),
carbon_fund pilot fully wired, the audit method, the generated matrix for all 10
roles in `ROLE_DEPTH_MATRIX.md`.

**Out (each its own spec later):** deepening any thin-card/dead-tile row; any
backend/schema change; the other 9 roles' pilot wiring (they inherit the shell
config-driven, but role-specific card tuning — which transition sits on the face —
is validated per role after the pilot proves the pattern).

## Testing

- Stream renders carbon_fund `duty` as cards; each card shows insight line +
  primary action from `actions[0]`.
- Filter chips filter the stream in place with no route change.
- Primary-action button opens the existing ActionModal and the existing transition
  endpoint fires (no new endpoint).
- Card-to-card related-transaction link navigates without full reload.
- Security: assert no new query path introduces a non-`MERIDIAN_CHAINS` identifier
  (grep-level check in review).
- Rate-limiter discipline for any browser test: seed token via `addInitScript`,
  one API login (10/5min/IP limit).

## Rollout

Pilot carbon_fund → prove the pattern → template config-driven to the other 9 via
`horizon/:role` + `roleData` + `MERIDIAN_CHAINS`. The audit matrix orders the
Sub-project 2 backlog by which roles have the most thin-card/dead-tile rows.
