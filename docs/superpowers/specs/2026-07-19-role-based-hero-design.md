# Role-based hero + role-based menu (v2 frontend)

Status: approved design, pending spec review
Date: 2026-07-19
Scope: `open-energy-platform/pages/src/v2/`

## Problem

v2's persistent chrome (`Shell.tsx`) does almost no role-based differentiation — one `--accent` CSS token and a single conditional nav item (Trade). The one place v2 already surfaces a rich, role-scoped view of "what does someone in my role actually do" — `groupedStarts()` from `starts.ts`, backed by `roleData.ts`'s curated per-role domain/feature data — only appears in `Home.tsx`'s empty-queue state and the ⌘K palette. Once a user has any open work, that orientation disappears and never comes back.

Request: every v2 screen (Home, Transaction, Find, Trade) gets a role-based hero, plus a role-based menu, so the system orients users faster and the existing per-role taxonomy stops being hidden behind an edge case.

## Constraint

The platform's own hyper-efficiency mandate (high transaction volume, Home's own "no dashboards-as-destination" principle) means a persistent decorative greeting cannot repeat at full size on every single Transaction page a high-volume user opens. The design below resolves this with a collapsible/compact state rather than a static banner.

## Design

### Component & placement

New file `pages/src/v2/HeroBar.tsx`. Rendered inside `Shell` (`Shell.tsx`, between the topbar at line ~97 and `<main className="v2-main">` at line 98), so it appears on all four surfaces automatically without per-surface changes.

```
<HeroBar role={role} chains={chains} />
```

Shell already holds both `role` and `chains` (used today by `navItems` and `Palette`) — no new fetch, no new prop threading beyond this one line.

### Content

- **Role display name**: `getRoleConfig(roleAlias(role))?.label ?? role` — reuses the existing alias bridge (`roleAlias`) from `starts.ts`, same one `groupedStarts`/`roleStarts` already use. Falls back to the raw JWT role string if `roleData.ts` has no entry (defensive; today all 10 documented roles resolve).
- **Blurb**: one new short line per JWT role, added as a literal `Record<string, string>` in `HeroBar.tsx` — this is new copy, not derived from existing data (no per-role blurb exists today anywhere in the codebase):

  | role | blurb |
  |---|---|
  | admin | Platform oversight — users, tenants, configuration, and system health. |
  | trader | Order book, positions, and margin at a glance. |
  | ipp | Project delivery — schedule, cost, documents, and compliance. |
  | wind | Wind asset delivery — schedule, cost, documents, and compliance. |
  | offtaker | Contracts, delivery, and settlement across your PPAs. |
  | lender | Drawdowns, covenants, and portfolio risk across financed assets. |
  | carbon | Carbon credits, verification, and registry retirements. |
  | regulator | Compliance filings, licence obligations, and market oversight. |
  | grid | Grid connections, outages, and network compliance. |
  | support | Tickets, escalations, and platform assistance. |

  Role not in this map (defensive) → no blurb line rendered, everything else in HeroBar still works.

- **Domain dropdown (the "role-based menu")**: `groupedStarts(chains, role)` — the same call and same data (domain key/label/color/starts/links) that `Home.tsx`'s empty-state journeys panel already renders. HeroBar puts it behind a trigger button instead of always-expanded cards; clicking a domain expands its starts/links inline in the popover, same interaction shape as the existing `Palette`.

### Two visual states

- **Full**: role name + blurb + domain-dropdown trigger. Default state on Home, Find, Trade.
- **Compact**: role chip (existing `.v2-role-chip` styling, reused) + domain-dropdown trigger only, single line, no blurb. Default state on Transaction (a deep, high-frequency page where a repeating greeting actively costs a high-volume user time), and what Full collapses to anywhere else.
- A chevron button toggles Full ⇄ Compact. State is written to `localStorage['heroCollapsed:' + role]` and read on mount, so a user who collapses it stays collapsed on next login; a different role (different JWT `role` value) or a first-time session starts Full (except Transaction, which always starts Compact regardless of stored state).

### Data flow

No new endpoints, no new fetch. `chains` is already loaded once in `Shell` via `getChains()`.

### Edge cases

- `chains` is still `{}` (loading): `groupedStarts` returns `[]`; dropdown trigger renders but its popover shows "Loading…" instead of an empty list.
- Role resolves to zero domains (shouldn't happen — `starts.ts`'s `ORPHAN_SLOTS` catch-all guarantees every chain lands in some domain — but handled defensively): dropdown trigger is hidden; role name + blurb still render.
- Role string not present in the blurb map: blurb line omitted, role name (or raw role string) and dropdown still render.

### Testing

One `HeroBar.test.tsx`:
- Full → Compact → Full toggle persists through a `localStorage` mock across remounts.
- Domain dropdown content matches `groupedStarts(chains, role)` output for a sample role/chains fixture.
- Renders without throwing for a role with no `RoleConfig` entry (falls back to raw role string, no blurb).
- Transaction usage always starts Compact regardless of stored `localStorage` state.

## Out of scope

- Changing `Home.tsx`'s existing empty-state `.v2-journeys` panel — it stays as is; HeroBar's dropdown is additive, not a replacement for that flow.
- Any change to `roleData.ts`'s domain/feature data itself.
- A sidebar or any layout restructuring beyond the one new row in `Shell`.
