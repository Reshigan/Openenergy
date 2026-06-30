# Ease Baseline — scorecard & worst-first backlog

Tracks where each surface sits on the **E0–E4** rubric (see
[2026-06-28-system-wide-ease-design.md](../superpowers/specs/2026-06-28-system-wide-ease-design.md)
§ "E0–E4 rubric"). Level = **floor** across the three axes (time-to-action ×2,
comprehension, polish). Regenerated as surfaces change; drives the worst-first sweep.

**As of 2026-06-30** (branch `feat/platform-ease`, after P1–P6 + the Substation reskin).

## Foundations in place

- **Ease Kit** ([pages/src/meridian/ease/](../../open-energy-platform/pages/src/meridian/ease/)): `statusLabel`, `money` (`fmtZar`/`zarCompact`/`atRisk`), `states` (Loading/Empty/Error), `GlanceHeader`, `PrimaryAction`, `AiWhy` — all built.
- **Customisation engine**: `useViewPrefs` + `/api/prefs` (migration 524) — pin/hide/reorder, server-persisted per user+scope.
- **Identity**: Substation (institutional indigo + copper, Archivo display) applied via the meridian.css `:root` + Tailwind `primary` token layers — one source, system-wide, onboarding included.

## Spine (target E4)

| Surface | Level | Notes |
|---|---|---|
| Horizon (board + 10 bespoke role variants) | **E4** | money/urgency-first, exceptions-only, plain status, inline duty actions. + per-user lane pin/hide (shared board). |
| Atlas | **E4** | Hybrid: search-first → Your Work (atRisk-ranked) → collapsed Library; pin/hide persisted. |
| Thread | **E4** | title headline, plain status+tone, FuseBar urgency, in-place fielded-action drawer, per-action "why". |

## Leaves (`/surface/:key`, target E3 floor)

All leaves inherit, with **zero per-surface code**, via `MeridianSurfacePage`:
- **E-loading** — shape-matched skeleton (Suspense fallback). ✅
- **E-error** — `SurfaceBoundary` → shared `EaseError` (retry + Atlas escape). ✅
- **status/money** — `statusLabel` + `money` are render-site primitives surfaces adopt.

That puts the leaf **floor at ≈E2** automatically (shared chrome + plain status + composed states). Deepening individual heavy leaves to **E3** (money-first ranking, a `GlanceHeader` purpose line, one-tap primary where it fits) is the **worst-first sweep** below — incremental, not a go-live gate.

## Worst-first backlog (incremental, post-go-live)

1. **Per-leaf E2→E3 sweep** — add `GlanceHeader` (purpose + top metric) + money-first ordering to the heaviest data leaves (master-data CRUD, analytics/ML panels, connectors). Order by traffic. *(Chrome-level GlanceHeader was deliberately not forced — it would double surfaces that already render their own header; this is per-leaf, judged.)*
2. **AiWhy wiring** — the primitive is built; wire it to the `launch.ts` `ai_suggestions` endpoint + an accept flow, on the spine first (Horizon/Thread).
3. **Bespoke-Horizon customisation adoption** — the 10 role Horizons can adopt `useViewPrefs` (pin/reorder) like the shared board; approach-A opt-in.
4. **Logo mark** — the OE logomark SVGs are still navy/teal; reconcile with the Substation indigo (a brand decision — flagged, not assumed).

## Scoring method

Floor across: **time-to-action** (raw table → sorted → importance-sorted → top action one-tap → glance-to-decision), **comprehension** (no purpose → title → purpose+labels → composed states → cold user names top task <5s), **polish** (raw codes → shared chrome → plain status → money-first one-language → regulator-grade calm). A surface is only as easy as its weakest axis.
