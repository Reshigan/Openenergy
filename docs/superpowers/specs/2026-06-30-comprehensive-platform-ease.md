# Comprehensive Platform Ease — Design & Rollout Spec

**Status:** DRAFT for sign-off (2026-06-30). Supersedes the rollout half of
[2026-06-28-system-wide-ease-design.md](2026-06-28-system-wide-ease-design.md);
that doc's E0–E4 rubric and Ease-Kit intent still stand and are referenced here.

**Trigger:** "Atlas options and menus are too dense — do the same as the new
[v2 Horizon] UI. The Horizon menu can be more customised to the role. We need a
comprehensive, easy-to-use UI across the entire platform."

---

## 1. Principle: one design language, propagated — not per-surface redesigns

The v2 Horizons (`OfftakerHorizon` "Honest Number", `TraderHorizon` "Risk Radar",
`LenderHorizon`/`AdminHorizon` "Quiet Book") feel easy because they share five
moves. These become **the platform design language**, applied everywhere:

1. **Money/urgency first** — rank by ZAR-at-risk × time-to-consequence; the most
   consequential thing is top-left, actionable without scroll.
2. **Exceptions only; performing recedes** — calm by default; healthy work greys out.
3. **Plain language** — sentence-case status, no SHOUTING snake_case, no jargon.
4. **One glance → one tap** — name the top task in <5s; its primary action inline.
5. **Inline AI "why"** — assists as cards with a reason + 1-click accept, never tabs/popups.

The work is **finish the shared kit once, then route every surface through it** —
not 150 hand-rebuilds.

## 2. Current state (verified 2026-06-30)

| Piece | State |
|---|---|
| Shell | `MeridianFrame` wraps every authed page; `MeridianSurfacePage` renders `/surface/:key` |
| Ease Kit ([pages/src/meridian/ease/](../../../open-energy-platform/pages/src/meridian/ease/)) | **Partial** — `statusLabel.ts` ✅, `states.tsx` ✅; **`money.ts`, `PrimaryAction.tsx`, `GlanceHeader.tsx`, `AiWhy.tsx` NOT built** |
| Horizon | 10 per-role v2 surfaces ✅; **no per-user customisation** (lane/duty order, pins, hide are localStorage-collapse only) |
| Atlas ([AtlasPage.tsx](../../../open-energy-platform/pages/src/meridian/AtlasPage.tsx)) | **Flat exhaustive directory** — every `domain→feature` from `roleData.ts` is an equal-weight `.fn` row; no ranking, no search-first, no progressive disclosure |
| ⌘K | `CommandPalette.tsx` exists but is secondary; Atlas doesn't lead with it |
| Reachability | `reachability.ts` already hides dead-end tiles (good — keep) |
| Rubric/scorecard | E0–E4 defined; **`EASE_BASELINE.md` not generated** |

## 3. Layer A — finish the Ease Kit (shared primitives, build once)

One file per primitive, deps only on `MERIDIAN_CHAINS` + `lib-pure`, no new npm deps,
testable standalone.

- **`money.ts`** — `fmtZar`, `zarCompact`, `atRisk()` ranking key. Promote from Horizon `lib.ts` so every surface ranks identically.
- **`PrimaryAction.tsx`** — the one-tap duty button (Horizon `act()` logic: fielded → Thread `?act=`, oxide → confirm, inline POST + refresh, busy-lock).
- **`GlanceHeader.tsx`** — title + one purpose line + single most-important metric ("name the top task <5s").
- **`AiWhy.tsx`** — inline assist card (why + 1-click accept); spine/E4 only.
- **`useViewPrefs.ts`** (NEW, the customisation engine — see Layer C) — pin / hide / reorder + persistence, shared by Horizon **and** Atlas.

**Cost: M.** ~5 small primitives + tests. No user-visible change yet; unblocks everything below.

## 4. Layer B — the spine: Atlas + Horizon + Thread to E4

### 4.1 Atlas redesign — **Hybrid** (chosen direction)

Replace the flat directory with three zones, top to bottom:

```
ATLAS — <ROLE>                                 42 functions
🔍  Search functions, deals, records…            ⌘K     ← promotes CommandPalette inline
YOUR WORK                                                ← prioritised, calm
 [Drawdowns 3 live·1⚠] [Milestones 5 live] [ToP 2 live]  pinned · recent · ranked by atRisk()
▸ FINANCE & FUNDING            (8)                       ← full library, collapsed accordions
▸ COMPLIANCE & REPORTING       (11)                        plain-language section names
▾ PROJECT DELIVERY             (6)   Commissioning · Schedule · RFIs
```

- **Search-first:** the search box is the primary affordance and drives the existing `CommandPalette` index inline (fuzzy over functions, deal types, records).
- **"Your work" strip:** pinned + recent + live/breached tiles, ranked by `atRisk()`. This is the default focus; the long tail is collapsed.
- **Library accordions:** the full `roleData` domains, collapsed by default, plain-language headings, reachability filter unchanged. Power users still browse everything one tap away.
- **Cards, not dense rows:** generous spacing, one visual language with Horizon; live/breached badges become the ranking signal.

**Cost: M–L.** One surface, but it's the flagship + introduces `useViewPrefs` pin/recent. Reuses `reachability.ts`, `CommandPalette`, `roleData`.

### 4.2 Horizon — deeper role-customisation

Per-role v2 layouts already exist (the role *default*). Add **per-user** customisation on top, via the shared `useViewPrefs`:

- **Pin / hide / reorder lanes** and **reorder the duty stream** — persisted per user (server-side pref, not just localStorage, so it survives devices). Role default is the starting point; the user tunes it.
- **"Today" strip** — the role's top 1–3 obligations surfaced above the board (already implicit in duty; make it explicit + role-tuned).
- **`AiWhy` inline cards** wired to the existing `buildXAiSuggestions` endpoints.

**Cost: M.** Mostly the shared customisation engine + a settings affordance; the per-role surfaces already exist.

### 4.3 Thread — apply GlanceHeader + statusLabel + PrimaryAction

Bring the two-sided transaction detail to the same language (headline = the decision, plain status, inline primary action). **Cost: S–M.**

## 5. Layer C — customisation engine (cross-cutting, the "more customised to the role" ask)

`useViewPrefs(scopeKey)` — a single hook + a `user_view_prefs` table (pins, hidden keys, order, per `scopeKey` like `horizon:ipp_developer` / `atlas`). Powers Horizon lane/duty tuning **and** Atlas pins/recent. Role defaults seed it; the user overrides. One concept, two surfaces, server-persisted.

**Cost: M** (1 migration + hook + a small `/api/prefs` route + cascade-free CRUD). Counted once; both 4.1 and 4.2 depend on it.

## 6. Layer D — propagate to all ~150 leaf surfaces (the "entire platform" ask)

Wire the kit into `MeridianSurfacePage` chrome so every `/surface/:key` leaf inherits, with **zero per-surface code**:

- `GlanceHeader` (title + purpose + metric) at the top of every surface.
- `statusLabel` applied at the render layer → kills raw snake_case codes across the 119+ sites in one sweep.
- `EaseEmpty`/`EaseLoading`/`EaseError` from `states.tsx` as the default states.
- `money.ts` formatting for all ZAR.

Most leaves jump E0/E1 → **E2/E3 automatically**. Then a **worst-first manual sweep** (driven by the scorecard, §7) deepens the heaviest leaves to E3.

**Cost: L** — the inheritance wiring is M (one chrome change touches all), but the worst-first sweep across ~150 leaves is the long tail (incremental, parallelisable, can run as a loop).

## 7. Scorecard — `docs/operations/EASE_BASELINE.md`

One row per surface: `key · role · time-to-action · comprehension · polish · level (floor) · target · gap`. Regenerated like the reachability baseline; drives the worst-first sweep so effort goes where ease is weakest. **Cost: S** (generator script) + ongoing.

## 8. Phased rollout (sequenced; each phase ships independently & verifiably)

| Phase | Deliverable | Depends on | Cost | Visible result |
|---|---|---|---|---|
| **P1** | Finish Ease Kit (`money`, `PrimaryAction`, `GlanceHeader`, `AiWhy`) + tests | — | M | none yet (foundation) |
| **P2** | Customisation engine (`useViewPrefs` + `user_view_prefs` + `/api/prefs`) | P1 | M | none yet (foundation) |
| **P3** | **Atlas Hybrid redesign** | P1, P2 | M–L | **flagship — Atlas de-densed** |
| **P4** | Horizon per-user customisation + AiWhy | P1, P2 | M | role-tuned Horizons |
| **P5** | Thread to E4 | P1 | S–M | calmer transaction detail |
| **P6** | Kit inheritance into `MeridianSurfacePage` (all leaves → E2/E3) | P1 | M | platform-wide consistency |
| **P7** | `EASE_BASELINE` scorecard + worst-first leaf sweep to E3 | P6 | L (incremental) | long-tail polish |

**Recommended first build after sign-off:** P1 → P2 → P3 (foundation, then the flagship the user can see and react to), then iterate P4–P7 via the loop.

## 9. Constraints & guardrails (non-negotiable)

- **Actuals-only** — no synthetic rows; every count/rank from real chain state (same rule the v2 Horizons followed).
- **No new npm deps**; primitives extracted from existing Horizon code.
- **graphify-first** — query the graph before building each phase (catches duplicate functionality / missing wiring).
- **No regressions** — backend `tsc` + SPA `tsc` + vitest green per phase; reachability invariant preserved (no dead-end tiles); SQL identifiers stay from the static `MERIDIAN_CHAINS` literal only.
- **Security** — `/api/prefs` is tenant/user-scoped (no cross-user pref leakage); the session's IDOR lessons apply.
- **Per-phase commit + CI green**; deploy when a user-visible spine increment lands.

## 10. Acceptance (per the E0–E4 rubric)

- Spine (Horizon/Atlas/Thread) → **E4**: cold user names the top task <5s; most-important item acted without scroll; inline AI why.
- All leaves → **E3 floor**: composed empty/loading/error, money-first, plain status, one visual language.
- Atlas specifically: default view shows ≤ ~12 items (your-work strip), full library ≤ 1 tap (accordion) or 1 keystroke (search); no equal-weight wall.

---

### Open question for sign-off
Effort sizing is relative (S/M/L), not calendar — actual pace depends on whether
P3–P7 run via the autonomous loop (parallelisable) or as reviewed PRs per phase.
Confirm: **start building P1→P2→P3 now**, or adjust scope/sequence first?
