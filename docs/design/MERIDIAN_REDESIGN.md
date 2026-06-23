# MERIDIAN — Redesign Concept for the Open Energy Platform

*2026-06-12 · concept + mockups. Companion engineering substrate: UI_DESIGN_IMPROVEMENT_PLAN.md (Phases 1–5 still apply underneath this).*

---

## 1. The problem, honestly

The platform has outgrown its own navigation model.

| Role | Chains | Tabs on workstation | Surfaces a user must "know" |
|---|---|---|---|
| Lender | 14 | ~90 | drawdowns, covenants, defaults, perfection, transfers, origination… |
| Trader | 13 | ~85 | allocations, margin, abuse, best-ex, reporting, algo-cert… |
| IPP | 16 | ~100+ | construction, bonds, insurance, GCA, energization, ED… |

Every wave added a tab. Tabs are **navigation-first**: they work only while the user can hold the map in their head. At 90 surfaces per role nobody can. The user's words: *"its hard with this amount of functionality per role."* Correct. The paradigm is exhausted, not the styling.

A second truth: **nobody "uses" 90 features.** On any working day an operator does three things:
1. Responds to cases that need them (a state is pending their action, an SLA clock is running)
2. Watches a handful of numbers
3. Occasionally initiates something new

The 90 tabs are a *library*. The current UI presents the library as the workspace.

## 2. The inversion

The platform already knows — for every one of the 76 chains, every live case — three facts the UI ignores:

- **who** must act next (pending actor role, from the state machine)
- **by when** (SLA deadline, cure window, settlement date)
- **what it costs** (quantum: facility size, claim amount, penalty exposure, ZAR at risk)

Meridian makes those three facts the interface.

### Law 1 — Time is the layout
The home surface is a horizon: every live case positioned by time-to-consequence.
Columns: `BREACHED · <2H · TODAY · 48H · THIS WEEK · LATER`. Work drifts left as
clocks run. Nothing urgent can hide behind a tab, because position *is* urgency.

### Law 2 — Money is the weight
Visual mass scales with ZAR at risk. Type size of the quantum, tile weight, and
duty-stream rank all derive from `log₁₀(ZAR) × 1/hours-remaining`. An R850m
drawdown CP gate physically dominates an R12k levy reminder. The eye triages
without reading.

### Law 3 — Causality is visible
Every chain action fires a cascade — today invisible until the counterparty
discovers it. Meridian previews it at the point of action: *"Approving notifies
Karusa Wind (IPP) and starts their 48h funding-confirmation timer"* — and runs a
live Wire of inbound/outbound crossings. Cross-role push becomes something you
can see, not something that happens to you.

## 3. The three surfaces (replacing ~90)

### HORIZON — the computed workspace (replaces launchpad + tab-hunting)
- Swim-lanes = the role's 5–6 domains (same taxonomy as launchpad-nav roleData)
- X-axis = time-to-consequence buckets; breach line hard at the left edge
- Tiles = live cases: ref, title, fuse bar (fraction of SLA remaining), quantum
  in mono, state chip, counterparty
- **Duty Stream** (right rail) = top-N by attention score, each with its one
  decisive action inline — approve / escalate / review *without navigating*
- Zero configuration. It is computed from chain state, per role, per morning.

### THREAD — one case, told as a journey (replaces the detail drawer)
- The 12-state machine rendered as a vertical rail: done → **current** → ahead
- Evidence, actors, timers attached to the states where they happened
- AI why-card inline (existing `explainRejection` / launch-assist plumbing)
- Actions carry their **cascade preview** (Law 3) before commit
- Every chain already has the same anatomy (states, transitions, SLAs,
  evidence, reason codes) — so ONE Thread component serves all 76 chains.

### ATLAS — the library (where the 90 tabs go to live properly)
- Search-first: ⌘K from anywhere; type "perfection" → function + its live cases
- Browsable as a typographic index per domain (not a card grid): every function,
  its live-case count, its breach count
- Initiating new work starts here; responding to work never has to.
- Nothing is removed. Everything is demoted from *navigation* to *reference*.

Nav model: **Horizon ⇄ Thread ⇄ Atlas + ⌘K.** Three places. The role with 100
functions and the role with 30 get the same three places.

## 4. Why this scales where tabs don't

Tabs cost is O(n) in functions: every wave adds a tab, every tab adds scan time.
Meridian's cost is O(1): a new chain is one more *data source* feeding Horizon
(its cases position themselves by deadline/quantum) and one more Atlas index
entry. Wave 77 ships with **zero new navigation**. The consolidation plan's
chain-tab kit (useChainList / StatusPill / DetailDrawer) becomes the substrate:
those primitives render inside Thread and Atlas instead of inside 90 tabs.

## 5. Design language

**Scene sentence** (forces the theme): a credit-operations manager in a bright
Sandton office at 09:40, triaging obligations between meetings on a 27" display,
needs deadline pressure readable at a glance from a metre away.
→ Light surface. High-contrast ink. Urgency by *position and fuse*, not by
flooding the screen with red.

**Category-reflex check.** First-order reflex: energy/trading → dark Bloomberg
terminal with neon green. Avoided. Second-order reflex: "not-dark fintech" →
cool-grey Swiss/Linear minimalism. Also avoided: Meridian is **warm paper +
petrol**, an operations ledger, not a SaaS dashboard.

| Token | Value | Role |
|---|---|---|
| paper | `oklch(0.965 0.006 85)` | ground — warm, not white |
| raised | `oklch(0.985 0.004 85)` | rails, tiles |
| ink | `oklch(0.21 0.012 85)` | primary text |
| ink-2 | `oklch(0.42 0.012 85)` | secondary |
| line | `oklch(0.885 0.008 85)` | hairlines |
| petrol | `oklch(0.40 0.075 200)` | the committed color — structure, actions, current-state |
| amber | `oklch(0.70 0.13 70)` | fuse warning (<25% SLA left) |
| oxide | `oklch(0.50 0.18 30)` | breach only — never decorative |
| moss | `oklch(0.55 0.09 150)` | settled / cleared |

Color strategy: **Committed** — petrol carries the structural identity (lane
spines, duty stream, primary actions, the wordmark rule); the urgency ramp
(ink → amber → oxide) is reserved exclusively for the time dimension. One page,
one accent, locked.

Type: **Archivo** (wide caps for lane labels and the wordmark, giving the
ledger voice) + **JetBrains Mono** for every number, ref, and timer (tabular,
no layout shift as clocks tick). Quantum type size steps with magnitude:
R thousands 13px → R millions 16px → R hundreds-of-millions 21px.

Texture: hairline rules and column ticks like a settlement ledger; no cards
where a rule will do; no shadows except the duty-stream rail's 1px lift.
Fuse bars are 3px, drain right-to-left, amber under 25%, oxide past zero.

A11y floor (carried from the improvement plan): smallest text 12px at ≥4.5:1,
all actions real buttons ≥40px hit area, breach conveyed by position + icon +
label, never color alone.

## 6. Mockups

`mockups/meridian/` — self-contained HTML, open in any browser:

| File | Surface | Shows |
|---|---|---|
| `index.html` | overview | concept + links |
| `01-horizon.html` | HORIZON | Lender board: 5 lanes × 6 time buckets, 14 live cases, duty stream with inline actions, wire ticker |
| `02-thread.html` | THREAD | Drawdown case LDD-2031 (W21): state rail, CP evidence, IE certificate, AI why-card, action footer with cascade preview |
| `03-atlas.html` | ATLAS | ⌘K palette open over the full Lender function index — all ~40 functions, live counts, 2-keystroke reach |

## 7. Migration path (no rewrite)

1. **Phases 1–3 of UI_DESIGN_IMPROVEMENT_PLAN.md proceed unchanged** — tokens,
   formatters, chain-tab kit, a11y floor. They are Meridian's substrate.
2. **Horizon v1** = new route per role fed by a `/api/horizon/:role` aggregator
   over existing chain tables (pending-actor + deadline + quantum already exist
   on every `oe_*` chain table). Ships beside the workstations.
3. **Thread v1** = generalization of the existing DetailDrawer against the
   uniform chain anatomy. One component, 76 chains.
4. **Atlas v1** = the existing tab registry re-rendered as index + palette.
5. ✅ **Done.** Horizon is the post-login home and `/launch/:role` redirects to
   it; the legacy launchpads stay reachable at `/launch-legacy/:role` for
   reference only. Workstations are demoted to function containers reached
   solely through Atlas function rows (`workstationPath?tab=<feature>`), no
   longer a top-level surface. Onboarding now orients users to Horizon + Atlas
   (⌘K) instead of workstations.
