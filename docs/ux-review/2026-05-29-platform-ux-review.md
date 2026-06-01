# Open Energy Platform — UX/Design-Engineering Review

**Date:** 2026-05-29
**Reviewer lens:** Senior design engineer (Emil Kowalski craft sensibility — purposeful motion, dense-but-legible information design, power-user ergonomics)
**Scope:** SPA under `open-energy-platform/pages/src/`. Research + documentation only; no source files were modified.
**Method:** Read `CLAUDE.md` + architecture docs, then sampled `App.tsx`, the two chrome systems (`StitchPage`, `FioriShell`/`Layout`), launch + workstation shells, the signature design system, a representative set of `*ChainTab.tsx` workflow files, shared primitives, and the global CSS/motion/theme tokens.

---

## Executive summary — the 8 highest-leverage moves

The platform is genuinely impressive in *depth* (70+ state-machine chains, 9 roles, real SLAs/audit). The UX risk is not features — it is **navigability, input ergonomics, and surface consistency** at this scale. The single biggest craft regression is that the dominant workflow-input pattern is the native browser `window.prompt()`.

1. **[P0] Replace `window.prompt()`/`window.confirm()` workflow inputs.** 79 ChainTab/page files drive state-machine transitions through stacked native browser prompts; only 14 use the polished `ActionModal`. This is the most-used interaction in the product and it is un-styleable, un-validatable, un-cancellable-cleanly, breaks reduced-motion/focus, and is invisible to the audit/why-it-matters framing. (Finding A1.)
2. **[P0] Add a cross-chain "My open items" inbox.** With 70+ chains, a user has no single place to see everything assigned to/awaiting them. `ActionQueueCard` is close but is hard-wired to 8 legacy entity types (`hrefForAction`) and does not know about the wave chains. (Finding A2 + E1.)
3. **[P0] Add a global command palette (Cmd/Ctrl-K).** Navigation is a single hamburger menu with ~30 flat links; there is no way to jump to a chain, a case, or an action by keyboard. For an all-day terminal tool this is table stakes. (Finding E2.)
4. **[P1] Collapse the two-and-a-half chrome systems into one.** `StitchPage` (+`SuiteHero`), `FioriShell`/`Layout`, and the bespoke `WorkstationShell` header each re-implement the hero/KPI/tab strip with different tokens. Pick one. (Finding B1.)
5. **[P1] Unify the four color-token namespaces.** `--oe-*`, `--fiori-*`, `--ionex-*`, and `--role-*` all coexist; status palettes are re-declared per ChainTab as inline hex maps. Promote one semantic status/tier/SLA token set. (Finding B2.)
6. **[P1] Standardize the status/tier/SLA badge + number-format system.** Every ChainTab hand-rolls `STATE_TONE`/`TIER_TONE` hex maps and `fmtZar`/`fmtMw`/`fmtMinutes`. Inconsistent semantics and contrast; centralize. (Findings A4, B3, D2.)
7. **[P1] Add breadcrumbs / wayfinding.** Zero breadcrumb components exist; deep links like `/offtaker/workstation?tab=...` give no "where am I in 70 chains" context. (Finding A3.)
8. **[P2] Motion + micro-interaction polish on the ChainTab buttons and drawers.** The good tokens (`.btn:active scale(0.97)`, custom eases, reduced-motion) live only on the legacy `.btn` class and the signature components; the raw ChainTab buttons/drawers get none. (Section C.)

---

## A. High-impact UX / IA improvements

### A1 — [P0] `window.prompt()` is the primary workflow-transition input
**Evidence:** 79 files under `components/` call `window.prompt`/`window.confirm`. Canonical example `components/offtaker/PpaContractChainTab.tsx:239-273` — the "Execute (NERSA S34)" action fires up to **four sequential `window.prompt()` dialogs** (S34 ref → board resolution → legal counterparty), each cancellable independently, with no field labels, no validation, no helper text, no review step, and no way to see the other fields while filling one in. Compare with the already-built `ActionModal` (`components/launch/WorkstationShell.tsx:386-471`) which has a field schema, required-validation, error surface, helper text, and animated entry — used by only 14 files.

**Why it matters:** This is the most-repeated, highest-consequence interaction in the product (regulator-crossing transitions, terminations, defaults). Native prompts: (a) cannot show the "why" / consequence framing the platform prides itself on; (b) have no inline validation so a bad ref burns a round-trip; (c) are unstyled and break the cinematic/Bloomberg aesthetic; (d) ignore `prefers-reduced-motion` and trap focus oddly; (e) can't show the SLA/tier context the user needs to decide.

**Move:** Make `ActionModal` (or a slightly richer `TransitionModal` that also renders a read-only "this will" consequence block + the case's current SLA/tier) the *only* sanctioned transition input. A codemod from the `window.prompt` chains to a per-action `FieldSpec[]` is mechanical because the prompts already encode label + required-ness.

### A2 — [P0] No cross-chain "my work" surface
**Evidence:** `ActionQueueCard` (`components/ActionQueueCard.tsx`) is the closest thing, but `hrefForAction` (lines 38-53) only routes 8 legacy entity types (`contract_documents`, `loi_drafts`, `invoices`, `trade_matches`, `project_milestones`, `settlement_disputes`, `ona_faults`, `disbursement_requests`, `loan_covenants`) and falls back to `/cockpit`. None of the W4-W70 chains are represented, and it pulls only `limit=8`. The launch board (`LaunchBoardShell.tsx:380`) renders it but it is per-role landing only.

**Why it matters:** A lender working covenant + default + drawdown + perfection chains has no unified queue; they must open each workstation tab and eyeball SLA columns. This is the difference between a tool you live in and a tool you audit.

**Move:** Promote `ActionQueueCard` into a first-class, paginated **Inbox** (route + shell-bar entry) that is fed by the cascade/action-queue across all chains, filterable by SLA-breached / escalated / tier, with deep-links generated from each chain's canonical detail route. See E1.

### A3 — [P1] No breadcrumbs / wayfinding inside deep workflow surfaces
**Evidence:** `grep breadcrumb` returns zero components. Deep state lives in query params: `WorkstationShell.tsx:72-83` stores the active tab in `?tab=`, and ChainTab drawers (e.g. `PpaContractChainTab.tsx:404`) are full-screen overlays with only an `✕`. The shell's only location signal is `currentLabel` (`FioriShell.tsx:319`) — the active top-level nav label.

**Why it matters:** With 9 roles × ~8 chains each, "Offtaker › PPA lifecycle › PPA-2026-019 › Execute" is real depth. Users land on deep links (notifications, the future inbox) with no trail back up.

**Move:** Add a lightweight breadcrumb row to `WorkstationShell` and the detail drawers (Role → Workstation → Chain → Case). Reflect the open drawer/case in the URL so it is shareable and back-button-correct.

### A4 — [P1] Status/tier/SLA semantics are re-invented per chain
**Evidence:** Each ChainTab declares its own `STATE_TONE`/`TIER_TONE` hex maps (`PpaContractChainTab.tsx:78-95`), while `StitchPage.statusToTone` (`StitchPage.tsx:250-257`) and `WorkstationShell.Pill` (`WorkstationShell.tsx:357-366`) and `LaunchBoardShell.toneBg/toneText` (`LaunchBoardShell.tsx:66-77`) each define a *different* good/warn/bad palette. So "executed" is green in one chain, "in_force" a different green; tier "strategic" uses a red that elsewhere means "breach."

**Why it matters:** In a dense ops tool the badge color is the primary scanning channel. Color must mean exactly one thing across all 70 chains or it actively misleads (red = danger vs red = highest tier).

**Move:** One semantic scale: `state` (neutral progression — avoid red for non-error states), `severity` (good/warn/critical), `tier` (use weight/size + a neutral hue ramp, NOT the danger palette), `sla` (countdown urgency ramp). Centralize as tokens + a `<StatusBadge kind tone>` primitive; delete the per-file maps.

### A5 — [P1] Workflow chains are buried as tab-strips with no overview
**Evidence:** `WorkstationShell.tsx:186-201` renders chains as a horizontal wrapping pill nav; a role with 8 chains shows 8 equal-weight pills with no counts of what's urgent in each. The KPI strip (`:143-158`) is generic, not per-chain.

**Why it matters:** The user can't triage *across* their chains — they must click into each to discover the 2 with breaches.

**Move:** Put SLA-breach / escalation count badges on each workstation tab pill (the `StitchTab.badge` field already exists at `StitchPage.tsx:29` but isn't wired into `WorkstationShell`). Add a "Today" overview tab summarizing the worst item per chain.

### A6 — [P2] Filter state and selection are not URL-addressable
**Evidence:** `PpaContractChainTab.tsx:175` keeps `filter` and `selected` in local `useState`; refresh or share loses them. `WorkstationShell` correctly persists `?tab=` but the per-tab filter/selection does not follow.

**Move:** Lift filter + selected-case id into the query string so a teammate can be sent "the breached strategic PPAs."

---

## B. Consistency / design-system fixes

### B1 — [P1] Three overlapping page-chrome systems
**Evidence:**
- `StitchPage` + `SuiteHero` (`components/StitchPage.tsx`) — "the new pattern," gradient hero, eyebrow chip, tab strip.
- `FioriShell`/`Layout` (`components/FioriShell.tsx`, `components/Layout.tsx`) — the app shell + hamburger nav.
- `WorkstationShell` (`components/launch/WorkstationShell.tsx:99-205`) re-implements *its own* hero (hard-coded `linear-gradient(135deg,#1e3a5f...)`), KPI grid, and tab nav inline — duplicating `StitchPage`/`SuiteHero` rather than composing them.
- `SuitePage.tsx` (35KB) and `roleCompletionTabs.tsx` (177KB) are additional mega-files implying yet more bespoke chrome.

**Why it matters:** Three hero implementations means three sets of spacing, three gradient definitions, three tab-strip behaviors — every new chain re-derives chrome and drifts.

**Move:** Make `WorkstationShell` *consume* `StitchPage`/`SuiteHero` for its header + KPI strip + tab nav instead of re-rendering them. One hero, one KPI tile, one tab strip. Establish `StitchPage` as the single canonical chrome and migrate ad-hoc pages off bespoke headers.

### B2 — [P1] Four color-token namespaces coexist
**Evidence:** `index.css:42-120` defines `--oe-*`, then `--fiori-*` "legacy aliases" (`:103-116`), then `--ionex-*` aliases (`:118-120`); `signature/signature.css:9-20` defines a parallel `--role-*` set. `Button.tsx` is written entirely against `--ionex-*` (`bg-ionex-brand`), while ChainTabs use raw hex (`#0c2a4d`, `#1a3a5c`, `#4a5568`) and `StitchPage` uses raw hex too (`#1a3a5c`, `#dde4ec`). The role-theme accent is also overridden — `role-themes.ts:37-43` collapses every role to one `BRAND_ACCENT` (#7e57c2) yet `signature.css:11` defaults `--role-accent` to gold (#f5b800), and `AiInlineCard` accept button uses `color: #0a1622` on the role accent (`AiInlineCard.tsx:79`).

**Why it matters:** No single source of truth for "the brand blue." Raw hex is sprinkled across ~80 files; a rebrand or contrast fix is unshippable.

**Move:** Collapse to one token layer (`--oe-*`), keep `--role-*` as the per-role override that reads from `--oe-*`, delete `--fiori-*`/`--ionex-*` aliases after a codemod. Forbid raw hex in components via lint.

### B3 — [P1] Number/locale formatting duplicated and inconsistent
**Evidence:** `fmtZar`/`fmtMw`/`fmtMinutes`/`fmtDate` are re-declared in essentially every ChainTab (`PpaContractChainTab.tsx:147-169`). `LaunchBoardShell.formatValue` (`:79-85`) uses `Intl.NumberFormat('en-ZA')` only above 100,000; ChainTabs use bare `.toFixed(2)`. So R5,000,000 renders as "5000000" in one place and "R 5 000 000" in another. SLA "minutes until" rounds to d/h/m differently than the launch board's footer text.

**Move:** One `lib/format.ts` with `zar()`, `mwh()`/`mw()`, `tco2e()`, `slaCountdown()`, `dateZA()`, all `Intl`-backed and tabular-num aware. Import everywhere.

### B4 — [P2] Two parallel `Pill` implementations + raw badges
**Evidence:** `StitchPage.StitchPill` (auto-derives tone from status string) and `WorkstationShell.Pill` (manual tone) and per-ChainTab inline `<span style={{background,color}}>` all coexist. The auto-derive list (`StitchPage.tsx:250-257`) won't know wave-chain states like `in_negotiation` → defaults to neutral.

**Move:** Single `<StatusBadge>` driven by the centralized token map from A4; deprecate both `Pill`s.

### B5 — [P2] `EmptyState`/`Skeleton` use gray Tailwind defaults, off-palette
**Evidence:** `EmptyState.tsx:20-23` uses `bg-gray-100`, `text-gray-900/500`; `Skeleton.tsx` uses `bg-gray-200`. These don't match the `--oe-surface` family (`#f5f8fb`, `#dde4ec`) used everywhere else, so loading/empty states look like a different app. The `ActionModal` and ChainTabs also use Tailwind `gray-*`/`red-*`/`amber-*` instead of OE tokens.

**Move:** Re-skin the shared empty/skeleton/error primitives to OE tokens; ban `gray-*` in app components.

---

## C. Motion & micro-interaction polish (Before / After)

The motion *foundation* is good: `lib/motion.ts` defines named springs, gates everything on `prefersReducedMotion()`, and `index.css:298-305` has a global reduced-motion reset. The `.btn` class (`index.css:493-503`) has the correct `:active { transform: scale(0.97) }` and custom eases. **The problem is that the dominant ChainTab buttons and drawers don't use any of it** — they are raw Tailwind `<button>`s and a hand-rolled fixed overlay.

| Before | After | Why |
|---|---|---|
| ChainTab action buttons are raw `<button className="rounded bg-[#0c2a4d] px-3 py-1.5 ...">` with no `:active`/press feedback (`PpaContractChainTab.tsx:478-507`). | Route through the `.btn`/`Button` primitive (or add `active:scale-[0.97] transition-transform duration-[120ms] ease-[cubic-bezier(0.23,1,0.32,1)]`). | These are the most-clicked controls in the app; a sub-100ms press scale is the single cheapest "feels responsive" win and is already the house token. |
| Chain drawers appear instantly: `PpaContractChainTab.tsx:404-409` is a plain `fixed inset-0` div, no enter/exit transition. | Reuse `.oe-drawer-in` (`index.css:720`, `280ms cubic-bezier(0.32,0.72,0,1)`) or wrap in `motion.div` with `springs.smooth` from `lib/motion.ts`, with `AnimatePresence` for exit. | A right-side panel that snaps in is jarring; an origin-aware slide reads as "this is a detail OF the row I clicked." The curve already exists and is reduced-motion-safe. |
| `KpiTile`/`WorkflowCard` animate hover via imperative JS `onMouseEnter`/`onMouseLeave` setting `style.boxShadow`/`style.borderColor` (`LaunchBoardShell.tsx:102-117`, `:158-165`). | Use CSS `:hover` (the `.oe-tile` rules at `index.css:342-364` already do this declaratively) or Tailwind `hover:` + `transition`. | Imperative style mutation fires on every mouse event, can't be gated by `prefers-reduced-motion`, fights React, and produces no transition (instant jump). The declarative tile already has the polished `translateY(-3px)` + eased shadow. |
| Hover affordances are unconditional (`hover:bg-[#f8fafc]` on table rows, JS hover on cards). | Gate decorative hover behind `@media (hover: hover)`. | On touch/stylus, sticky hover states linger after tap; this is the standard Emil-style hover-gating fix. |
| `ActionModal` backdrop fade uses `motionTransition('snap')` — a 380/30 spring (`WorkstationShell.tsx:426`). | Use `smooth` (220/32) for the backdrop opacity; reserve `snap` for the panel transform only. | A spring on a pure-opacity backdrop overshoots nothing useful and can read as a flicker; opacity wants a short ease/`smooth`, transforms want `snap`. Minor, but it's the modal users see most. |
| List/table rows render with no entrance stagger even though `staggerChildren()` (`lib/motion.ts:32-39`) exists and is reduced-motion/Bloomberg-aware. | Apply a 40ms cinematic stagger to launch-board KPI/workflow grids and first table paint; keep 0 for Bloomberg-density and reduced-motion (the helper already does this). | Purposeful stagger on first paint communicates hierarchy and hides perceived latency; the guardrails to NOT do it for power-user/keyboard contexts are already coded. |
| Value flashes (`oe-flash-up/down`, `index.css:61-70`) and `StatusPulse` exist but appear unused outside signature previews; Bloomberg ticker is the only consumer. | Wire `data-flash` onto live KPI/SLA cells that update from polling (trader marks, SLA countdowns crossing thresholds). | The flash primitive is exactly right (220ms ease-out, reduced-motion-safe) but currently dormant where it would add the most value — live numeric change. |

**Do NOT add motion to:** the `CommandRail` hotkey actions (`signature/CommandRail.tsx`) — keyboard-driven, high-frequency, correctly instant today; the toast list already correct (`Toaster.tsx`).

---

## D. Accessibility

### D1 — [P0] `window.prompt` chains break the accessible-modal contract
Native prompts don't participate in the app's focus management, `aria-live`, or reduced-motion handling, and screen-reader output is browser-chrome-dependent. Resolving A1 also resolves the largest a11y gap. The good `ActionModal` should additionally get `role="dialog"`, `aria-modal`, focus-trap, and Escape-to-close (it currently closes on backdrop click and the `×` only — `WorkstationShell.tsx:438-441`).

### D2 — [P1] Badge color-contrast not verified for the dense palette
**Evidence:** Many badge tones are light-bg/mid-fg, e.g. `terms_locked { bg:#fff4d6, fg:#a06200 }` (`PpaContractChainTab.tsx:81`) and `WorkstationShell.Pill warn = amber-100/amber-800`. At 10-11px uppercase (`StitchPill` is `text-[10px]`), these need ≥4.5:1 and several amber/teal-on-tint combos are borderline. Status is also conveyed by color alone in SLA columns.
**Move:** Audit every tone pair against WCAG AA at the actual font size; pair color with a glyph/label for severity (don't rely on hue alone); the centralized badge from A4 is the place to enforce it.

### D3 — [P1] Keyboard operability is shallow for a terminal-style tool
**Evidence:** `CommandRail` (`signature/CommandRail.tsx`) is a nice start but is only mounted on a few Bloomberg workstations and uses bespoke combos. Tables (`ListingTable`, every ChainTab table) are not keyboard-navigable (no roving tabindex, rows are clickable `<tr>` with no `role`/`tabindex`/Enter handler — `WorkstationShell.tsx:338-348`, `PpaContractChainTab.tsx:338-342`). There is no global shortcut to focus search, open the inbox, or move between cases.
**Move:** Make clickable rows real buttons/links (focusable, Enter-activatable); add j/k row navigation + Enter-to-open on listings; ship the global Cmd-K (E2) as the universal keyboard entry point.

### D4 — [P2] Focus-visible styling is inconsistent
**Evidence:** `Button.tsx` has `focus:ring-2 focus:ring-ionex-accent`, and `FioriShell` has a proper skip-link (`:354-360`), but the raw ChainTab buttons, filter pills, and tab pills (`StitchPage.tsx:85-98`, `WorkstationShell.tsx:190-200`) have no `focus-visible` style — keyboard focus is invisible on the most common controls.
**Move:** Add a global `:focus-visible` outline token and apply to all interactive primitives.

### D5 — [P2] Modal/drawer close affordance is a bare `×` glyph
**Evidence:** `ActionModal` close is a text `×` with `aria-label="Close"` (good label, `WorkstationShell.tsx:440`) but the ChainTab drawer close `✕` (`PpaContractChainTab.tsx:419`) has no `aria-label` and isn't a sized hit-target.
**Move:** Shared `<IconButton aria-label>` with a ≥40px hit area for all dismiss controls.

---

## E. Enhancements (net-new capabilities)

### E1 — [P0] Unified cross-chain Inbox / "My work"
Generalize `ActionQueueCard` into a dedicated route (`/inbox`) and shell-bar entry. Source from the cascade action-queue across **all** chains; columns: case ref, chain, role-party, state, tier, SLA countdown (urgency ramp), escalation level. Filters: assigned-to-me / SLA-breached / escalated-to-regulator / by chain. Each row deep-links to the chain drawer (requires A6's URL-addressable selection). This is the home base a daily operator actually wants, and the backend (action queue, SLA fields, escalation_level) already exists on every chain.

### E2 — [P1] Global command palette (Cmd/Ctrl-K)
A single fuzzy palette that searches: navigation destinations (the `BASE_NAV` list already exists, `FioriShell.tsx:29-63`), open cases (via `/api/search`, already wired at `FioriShell.tsx:332`), and *actions* on the current case (the per-state transitions). For an all-day tool this replaces the hamburger-menu hunt and the per-chain prompt-clicking. Origin/keyboard-first, no motion on open beyond a short `smooth` fade.

### E3 — [P1] Saved views / filter presets per role
ChainTab filters are ephemeral (A6). Let users save "Strategic PPAs breaching this week" as a named view, pinned to their launch board. Backed by localStorage initially, server-synced later. High value for regulators/lenders who run the same triage daily.

### E4 — [P2] A real "case detail" route instead of overlay drawers
Today a case is a transient drawer (`PpaContractChainTab.tsx` `Drawer`). Promote to a routed detail page (`/offtaker/ppa/:id`) so cases are linkable, back-button-correct, and can host the audit timeline, the inline AI "why" card (`AiInlineCard`), tier/SLA context, and the transition modal in one durable surface. Drawers stay for quick-peek; the route is the source of truth.

### E5 — [P2] SLA urgency as a first-class visual language
SLA is the platform's heartbeat but renders as plain text ("12h", "BREACHED"). Introduce a consistent countdown component: neutral → amber (<25% of window) → red pulse (breached), with `tabular-nums`, that ticks client-side. Reuse the dormant `StatusPulse`/`oe-pulse` (`signature.css:72-83`) for breach state. Apply uniformly in tables, drawers, and the inbox.

### E6 — [P2] Density toggle for everyone + remember per-surface
`useDensityPreference` (`lib/density.ts`) restricts the cinematic/Bloomberg toggle to 6 "cinematic-default" roles and hard-codes ops roles to Bloomberg. Power users in any role may want the dense view; expose the toggle universally (still defaulting per role) and persist per-workstation. Low effort, the plumbing exists.

### E7 — [P2] Bulk actions on listings
`BatchActionBar.tsx` exists but isn't wired into the ChainTab listings. Multi-select rows (e.g. acknowledge 12 SLA warnings) is a natural fit for regulator/lender triage and avoids 12 sequential prompt dances.

---

## Appendix — files sampled

- Chrome: `components/StitchPage.tsx`, `components/SuiteHero.tsx` (header dup), `components/FioriShell.tsx`, `components/Layout.tsx`
- Shells: `components/launch/WorkstationShell.tsx`, `components/launch/LaunchBoardShell.tsx`, `components/ActionQueueCard.tsx`
- Signature DS: `components/signature/{CommandRail,Toaster,AiInlineCard,index,signature.css}`
- Tokens/motion: `lib/motion.ts`, `lib/density.ts`, `lib/role-themes.ts`, `index.css`, `components/signature/signature.css`
- Representative chain: `components/offtaker/PpaContractChainTab.tsx` (pattern shared by 54 `*ChainTab.tsx`)
- Primitives: `components/Button.tsx`, `components/EmptyState.tsx`, `components/Skeleton.tsx`
- Routing/nav: `App.tsx` (91 `<Route>`s, 1414 lines), `BASE_NAV` in `FioriShell.tsx`

**Quantified signals:** 79 files use `window.prompt`/`window.confirm` vs 14 using `ActionModal`; 54 `*ChainTab.tsx` files each re-declare status/tier/format helpers; 0 breadcrumb components; 4 color-token namespaces; `transition-all` in only 5 files (good); reduced-motion global reset present; `.btn:active scale(0.97)` present but not used by ChainTab buttons.
