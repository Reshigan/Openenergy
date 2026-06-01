# UX Design Directions — 2026-05-31

Parallel, non-blocking design exploration for transaction-heavy workstations.
Four hand-built prototypes in `open-energy-platform/pages/src/ux-alternatives/`, each
mounted as a lazy SPA route. All use the SAME 16-row SCC SCADA-connector sample
(`shared/SampleChainData.ts`) so the four pictures are honestly comparable.

Frontend-only. No backend routes, no workstation changes, no commits.

## How to view

```
npm run dev            # worker (not strictly needed — UI uses sample data)
cd pages && npm run dev
# then open:
http://localhost:3000/ux-prototype                   picker
http://localhost:3000/ux-prototype/pulse-lens        Direction 1
http://localhost:3000/ux-prototype/time-axis         Direction 2
http://localhost:3000/ux-prototype/command-lens      Direction 3
http://localhost:3000/ux-prototype/cockpit-grid      Direction 4
```

`Cmd+K` opens the palette anywhere. `Cmd+Shift+D` flips compact vs comfortable density.

## Emil Kowalski rules applied to ALL four

These are the foundation the directions share — they live in
`shared/animations.css`, `shared/primitives.tsx`, and `shared/CommandPalette.tsx`.

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — never ease-in on UI.
- Buttons: `transform: scale(0.97)` on `:active`, 160ms ease-out — never animate
  from `scale(0)`.
- Tooltips: 125ms delay, but `data-instant` skips the delay for tooltips that
  appear right after one the user already dismissed.
- Drawer: 220ms `cubic-bezier(0.32, 0.72, 0, 1)` slide-in via `@starting-style`,
  100ms ease-in slide-out (the only "ease-in" use, and only on exit).
- Modal: 180ms scale-from-0.96, opacity-only fade for the scrim.
- Command palette + hot actions: `.oe-no-anim` class — surfaces hit > 100/day get
  ZERO animation per Emil's rule. Open is instant, scroll is instant, exit is
  instant. No motion = no fatigue.
- Only `transform` + `opacity` ever animate (GPU layer, no layout thrash).
- Sparkline + status pill use CSS custom properties; status colour changes via
  variable swap, not keyframes.

All four directions also share:
- Right-aligned `font-variant-numeric: tabular-nums` on every number column.
- Semantic SLA colour thresholds: red < 60, amber 60–85, green > 85, garnet for
  breach, deep-red for critical.
- Sticky State-of-the-World strip across the top.
- Drawer-over-modal for connector detail. Modal only used for destructive
  confirm.
- `kbd` shortcut chips inline in every visible action.
- Density toggle (compact 30px row / comfortable 44px row).

---

## Direction 1 — Pulse Lens (`pulse-lens`)

A spatial state-space, not a table. Sixteen orbs floating in a state×urgency
plane. Status is x-axis, urgency rank is y-axis. The orb pulses faster as the
SLA bleeds, and its colour walks red as it nears breach. A breach centre at the
edge sucks any orb whose SLA is negative — those become "the things in
freefall". You click an orb; the drawer opens.

This direction asks: when a junior operator looks at the whole portfolio for
the first time, can they intuit "what is on fire" without reading a single
number? The answer is yes — the eye finds pulsing red orbs in <1s. The table
fallback (T) is there for legalese audits, but the canvas is the daily view.

- Emil discipline: pulse animation is opacity-only at 0.65–1.0 over 1200ms — no
  scale, no shadow, no glow. The pulse rate itself encodes time (faster = less
  time). This is the only animation tied to data; everything else is static.
- Drawer slide-in matches the shared rule (220ms, ease-drawer).
- F1–F4 filter by status family. ↑↓ walks orbs by urgency.

Tradeoffs:
- Best at: triage, "where do I look first", junior operators, big-screen ops
  room.
- Worst at: forensic queries ("show me every connector at substation X
  commissioned by team Y"). Falls back to table.
- Risk: regulator auditors hate it. Print/export of the canvas is meaningless.

---

## Direction 2 — Time Axis (`time-axis`)

A Gantt horizon. Each connector gets a row; its bar runs from `created_at` to
`sla_deadline_at`, and a vertical NOW line slices through. Bars past NOW are
breached and rendered in garnet. Bars about to cross NOW are amber and glow
softly. Bars way out to the right are comfortable green.

Horizon switches 7d / 30d / 90d via top-right toggle. Sorted by deadline by
default (most urgent on top). Click a bar = drawer.

This direction asks: what if SLA is the only thing that matters and we let
spatial layout encode time? Answer: it works brilliantly for COOs and lender
reviewers who care about "what hits this week". Less useful for the day-of
operator.

- Emil discipline: no animation on bars themselves — they're position+colour
  only. The NOW line is a 1px static line, no shimmer. Horizon-toggle uses the
  palette's `.oe-no-anim` style (instant) because it's a hot action.
- Drawer + state strip + palette + shortcuts shared with all four.

Tradeoffs:
- Best at: forward planning, SLA hygiene, exec dashboards, "what's overdue".
- Worst at: status-mix triage. Doesn't show health, only deadline. Two
  connectors with very different statuses can look identical if their
  deadlines align.
- Risk: dense horizons (90d) compress bars to <8px wide — readability cliff.

---

## Direction 3 — Command Lens (`command-lens`)

A natural-language bar is the primary surface. The table is below, but it's a
preview, not the workspace. You type "revoke kakamas" and the bar previews
`scc-002 / Kakamas / revoke()` with a confirm chip. You type "show breached"
and the table filters. You type a number ("scc-007") and the drawer opens
that connector.

This direction asks: what does the workspace look like when keyboard wins?
Answer: power-users go 3–5× faster than mouse-driven directions, but every
new hire needs onboarding because the language is invisible until typed.

- Emil discipline: bar is the hottest surface — zero animation on
  type/preview. Preview chip uses `clip-path` for the colour transition
  (red→green as the action validates). Recent-action log fades in with @starting-style.
- `/` focuses the bar from anywhere. ↑↓ walks results. Enter = act.
- Drawer + state strip shared.

Tradeoffs:
- Best at: senior operators who run the same 6 verbs 200×/day. Schedulers.
  Surveillance officers. Settlement clerks.
- Worst at: discoverability. New hires don't know "revoke" is a verb until
  someone tells them. We mitigate with a "?" hint that lists every verb.
- Risk: bar parsing is fragile; a typo can fire the wrong action. Confirm
  modal on every destructive verb is the safety net but adds friction.

---

## Direction 4 — Cockpit Grid (`cockpit-grid`)

A resizable 12-column tile canvas. The user drops tiles ("All connectors",
"Breached", "NERSA-flagged", "National backbone", "Imminent", "Pilot bench")
onto the grid, drags them by the top strip, resizes them by the corner. Each
tile adapts to its size: 1×1 is a sparkline+count, 2×2 is a 4-row mini-table,
3×3 is a full table, 4×4 is table + command rail. Layout persists in
`localStorage['oe-cockpit-grid-layout']`. F1–F12 jumps focus between tiles.

This direction asks: what if the workspace is a Bloomberg-style mosaic the
user composes themselves? Answer: power users build their own daily heads-up
display and never use any other view. Casual users see an empty page and
panic — we mitigate with a default 4-tile layout.

- Emil discipline: drag is via Pointer Events; movement is `transform`-only,
  60fps, no layout thrash. Resize handle uses spring momentum on release
  (the only "spring" surface — drag/momentum is Emil-sanctioned). Tiles
  themselves have no enter/exit animation; they appear instantly.
- Reset Layout button is in the grid header.
- Drawer + state strip + palette shared.

Tradeoffs:
- Best at: senior operators who want their own cockpit. Shift supervisors.
  Trading desk leads.
- Worst at: "what do I do here?" for new hires. Empty canvas paralysis.
- Risk: per-browser layout means cross-device handoff loses the layout.
  Mitigation: layout export/import (future).

---

## Comparison matrix

|                          | Pulse Lens | Time Axis | Command Lens | Cockpit Grid |
|--------------------------|-----------|-----------|--------------|--------------|
| Keyboard throughput      | medium    | medium    | **highest**  | high         |
| Scan throughput          | **highest** | high    | medium       | high         |
| Discoverability          | high      | **highest** | low        | medium       |
| Learnability             | high      | **highest** | low        | medium       |
| Cognitive load (1st use) | low       | **lowest** | medium      | medium       |
| Power-user ceiling       | medium    | medium    | **highest**  | high         |
| Forensic-query fitness   | low       | medium    | high         | **highest**  |
| Regulator-export fitness | low       | medium    | medium       | **highest**  |
| Big-screen ops-room fit  | **highest** | high    | low          | medium       |
| Mobile/tablet fit        | medium    | medium    | **highest**  | low          |

## Recommendation

**Ship Time Axis as the default workstation, with Command Lens as a `/`-key
escape hatch.**

Time Axis has the lowest cognitive load and the highest learnability — it's
what most users will see most days, and it answers the most common question
("what's overdue, what's about to be"). Command Lens layered on top gives
power users the keyboard ceiling without forcing it on anyone. The combination
is the lowest-risk path to faster transactions across the existing user mix
(junior operators, schedulers, COOs, lender reviewers).

Pulse Lens is the right pick for the big-screen ops-room view we'll need when
NTCSA goes live, but it's a *second* product, not a workstation default.

Cockpit Grid is the right pick for trading-desk leads and shift supervisors,
but it should be opt-in (a "switch to cockpit" affordance), not the default.

## Open questions for stakeholders

1. Is the State-of-the-World strip's colour language (garnet/red/amber/green)
   the same we want everywhere, or should regulator-facing surfaces use a more
   conservative palette?
2. Do we ship Cmd+K everywhere or scope it to power-user roles?
3. Density toggle: should it persist per-role or per-user?
4. The drawer-over-modal pattern: does Compliance accept the drawer for
   destructive actions if the action body shows the consequence list in red?
5. Time Axis horizon: 7d/30d/90d enough, or do we need a 24h micro-horizon for
   live-trading-floor mode?
6. Cockpit Grid layout export/import: who pays for the migration when we change
   tile definitions?

## Risk list

- **None of the four animate from scale(0)** — verified. Emil's hard rule.
- **No ease-in on UI motion** — verified except drawer exit (100ms) which is
  the documented exception.
- **High-frequency surfaces (palette, command bar preview, cockpit tiles
  during drag) have `.oe-no-anim` applied** — verified.
- **Sample data only** — none of the four hit the API. Safe to ship to
  stakeholders without backend risk, but means we can't prove perf on the
  real 10k-row dataset yet. Virtualization in Pulse Lens table fallback and
  Cockpit Grid 3×3/4×4 tables is the open performance question.
- **localStorage layout (Cockpit Grid)** — per-browser only; no
  cross-device sync. Acceptable for prototype; needs server-side persistence
  before GA.
- **Command Lens parser is naive** — substring + verb-prefix only, no fuzzy
  search. Fine for the 6-verb prototype; real shipping needs a proper parser
  with disambiguation UI.
- **No backend work touched** — all 4 routes are pure SPA, no API mounts,
  no migration, no cron, no auth changes. Safe to merge as a separate PR
  without affecting prod surfaces.
