# System-Wide Ease — Design

**Goal:** Make every Meridian surface as easy as Horizon — one glance to what matters, one tap to act, plain-language status, money-first, inline AI "why". Measured, gated, system-wide.

**Status:** approved 2026-06-28 (brainstorm). Executing as a loop toward go-live.

## Decisions (locked)

- **Outcome:** all-three-tiered. Time-to-action is the spine (weight ×2); comprehension (×1) and polish (×1) ride along. One rubric, weighted.
- **Scope:** everything — the high-traffic spine (Horizon / Thread / Ledger, all roles) deep to **E4**, plus all 151 `/surface/:key` leaves to **E3** floor. No CRUD carve-out: every surface E3.
- **Mechanism:** a shared **Ease Kit** carries comprehension + polish to every surface cheaply (inherited via shared chrome + primitives), so "everything" doesn't mean 151 hand-rebuilds. Per-surface work is then mostly the time-to-action axis.
- **Rubric:** formal **E0–E4**, scored, gates "done". Mirrors the L1–L5 depth rubric + the reachability baseline. **Floor, not average** — a surface is only as easy as its weakest axis.

## E0–E4 rubric

Level = floor across the three axes.

| Level | Time-to-action ×2 | Comprehension ×1 | Polish ×1 |
|---|---|---|---|
| E0 | raw table/form, no ranking | no purpose stated | inconsistent, raw codes |
| E1 | sorted by something | title only | some shared chrome |
| E2 | sorted by importance (money/deadline) | purpose line + labels | shared chrome, plain status |
| E3 | top item's primary action one-tap inline | empty/loading/error composed, guided first-run | money-first, one visual language, full states |
| E4 | glance-to-decision: most-important surfaced + acted without scroll; inline AI "why" | cold user names top task <5s | regulator-grade calm: nothing competes with the one thing that matters |

**Targets:** spine → E4. All leaves → E3 floor. Horizon already ≈E4 — reference implementation, not a target to build.

## Ease Kit — `pages/src/meridian/ease/`

Extracted from what Horizon already does well, generalized. One file per primitive, one purpose, testable standalone, deps only on `MERIDIAN_CHAINS` + `lib-pure`. No new npm deps.

- **`statusLabel.ts`** — `statusLabel(status) → {text, tone}`. Plain-language, sentence-case (not SHOUTING snake), tone from semantic stem. Kills raw codes across 119+ render sites. Biggest cross-surface comprehension+polish win.
- **`money.ts`** — `fmtZar`, `zarCompact`, `atRisk()` money-first sort key. Promoted from Horizon `lib.ts` so every surface ranks identically.
- **`PrimaryAction.tsx`** — one-tap duty button. Horizon `act()` logic: fielded → Thread `?act=`, oxide → confirm, inline POST + refresh, busy-lock. The time-to-action primitive.
- **`states.tsx`** — `EaseEmpty` (purpose + CTA, never bare "no data"), `EaseLoading` (shape-matched skeleton), `EaseError` (inline + retry). Serves E3 "all states composed".
- **`GlanceHeader.tsx`** — title + one purpose line + single most-important metric. The "name the top task <5s" primitive.
- **`AiWhy.tsx`** — inline assist card (why + 1-click accept). E4-only, spine.

Wired into `MeridianFrame` + `MeridianSurfacePage` so the `/surface/:key` renderer applies header + states uniformly — most leaves jump E0→E2 with zero per-surface code.

## Scoring artifact

`docs/operations/EASE_BASELINE.md` — one row per surface (key · role · axis scores · level · target · gap), regenerated like the reachability baseline. Drives worst-first sweep.

## Rollout (loop order)

1. Ease Kit core (`statusLabel`, `money`, `states`) + spine wiring (CaseTile, Ledger rows, Thread). Sweep the 119 raw-status sites to `statusLabel`.
2. `PrimaryAction` + `GlanceHeader` on spine → spine E4.
3. Wire kit into `MeridianSurfacePage` chrome → all leaves inherit E2.
4. EASE_BASELINE ledger; worst-first per-surface sweep leaves E2→E3.
5. `AiWhy` on spine surfaces with existing AI suggestion endpoints.

Each step: tsc clean + vitest green + frontend build + commit. Deploy when spine increment lands.

## Constraints

Actuals-only (no synthetic rows). No shallow L2. AI inline-only with why + 1-click. graphify-first (graph queried 2026-06-28). Ponytail extraction — all from existing Horizon code, no new deps.
