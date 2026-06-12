# Frontend Redesign Plan — Mockup-B Light Design System

**Status as of 2026-06-10**

---

## Design System Tokens (mockup-b)

| Token | Value | Usage |
|---|---|---|
| Canvas bg | `oklch(0.96 0.003 250)` | Page background (`--oe-surface`) |
| Card/panel bg | `oklch(0.99 0.002 80)` | Cards, headers, panels (warm white) |
| Sub-cell bg | `oklch(0.96 0.003 250)` | KPI cells inside cards, inner wells |
| Border | `oklch(0.88 0.006 250)` | All borders |
| Inner border | `oklch(0.90 0.004 250)` | Lighter inner borders |
| Text primary | `oklch(0.15 0.025 250)` | Headings, data values |
| Text secondary | `oklch(0.45 0.015 250)` | Supporting copy, subtitles |
| Text muted | `oklch(0.55 0.008 250)` | Eyebrows, labels, timestamps |
| Amber accent | `oklch(0.46 0.16 55)` ≈ `#c2873a` | ALL primary buttons, active tabs, CTAs |
| Amber hover | `#a3702f` | Amber button hover state |
| Link blue | `#3b82c4` | Hyperlinks, secondary actions |
| Font | IBM Plex Sans | Already loaded in index.css |

### Non-negotiable rules
- No dark navy backgrounds anywhere except the FioriShell sidebar (which uses the `--oe-surface-nav` token)
- No `linear-gradient` on page headers or card heroes — use `border-bottom` light header pattern
- Every primary action button = amber. Every active tab indicator = amber bg.
- AI suggestion cards = `bg-[#f0f7ff] border-[#dbecfb]` (blue-tinted, not amber)

---

## Screen Category Map

### A. Auth Screens (3 files)
`Login.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`

**Pattern:** Centered card on canvas bg. Card = warm white, `border-[oklch(0.88)]`. Submit button = amber. Input focus ring = amber outline.

**Status:** Likely already correct (no dark headers). **Needs visual audit only.**

---

### B. Shell Chrome (already done ✅)
`FioriShell.tsx`, `WorkstationShell.tsx`, `ActivityFeedShell.tsx`, `LaunchBoardShell.tsx`, `StitchPage.tsx`, `SuiteHero.tsx`

All migrated in prior sessions. Amber nav active states, light top bars.

---

### C. Launch Boards (10 roles)
Each role's `LaunchBoard` is driven by `LaunchBoardShell` + `RoleLaunchBoard` + `SignatureLaunchBoard`.

**Pattern:** Light canvas. Hero strip = warm white card with border-bottom (NOT dark gradient). KPI strip cells = sub-cell bg. Tabs = amber active. Action cards = warm white with amber CTA buttons.

**Status:** Shell-level done. ⚠️ Need to audit `RoleLaunchBoard.tsx` and `SignatureLaunchBoard.tsx` for any remaining dark inline styles.

---

### D. Workstation Pages (10 roles)
`IppWorkstationPage.tsx`, `TraderWorkstationPage.tsx`, `LenderWorkstationPage.tsx`, etc.

All routed through `WorkstationShell` — shell is done. Content is tab-based, each tab delegates to a chain tab component.

**Status:** Shell done ✅. Chain tab filter buttons fixed (global sed). **Needs audit of shared workstation action headers in each page wrapper.**

---

### E. Entity File / Detail Pages (EntityFileShell pattern)
`ProjectDetail.tsx`, `ContractDetail.tsx`, `FundDetail.tsx`, `RfpDetail.tsx`, `LoiDetail.tsx`, `VintageDetailPage.tsx`, `OrderDetailPage.tsx`

These all use `EntityFileShell`. Shell updated to light header. Tab active = amber.

**Status:** ✅ Done via EntityFileShell migration.

---

### F. Listing/Table Pages (30+ files)
`Projects.tsx`, `Contracts.tsx`, `Orders.tsx`, `Marketplace.tsx`, `Settlement.tsx`, `Trading.tsx`, `Pipeline.tsx`, `Funds.tsx`, `Lois.tsx`, `Reports.tsx`, etc.

**Pattern:** Page = canvas bg. Filter/search bar = warm white card. Table rows on white. Sort/filter active state = amber. Bulk action bar = warm white, amber CTA.

**Status:** Most amber/button replacements already done via global sed. ⚠️ **Need per-file audit** — these pages often had bespoke dark headers or section titles. Priority files to check: `Trading.tsx`, `Settlement.tsx`, `Marketplace.tsx`, `NationalDashboard.tsx`.

---

### G. Admin / Ops Pages (12 files)
`Admin.tsx`, `AdminPlatformPage.tsx`, `PlatformAdminConsolePage.tsx`, `ComplianceAdminPage.tsx`, `DepthOpsPage.tsx`, `BulkOpsPage.tsx`, `SettlementOpsPage.tsx`, `OpsL5Page.tsx`, etc.

**Pattern:** Same as listing pages. Section headers use border-bottom pattern on warm white. Status badges use semantic colors (green/amber/red), not navy.

**Status:** ⚠️ **Not yet audited.** These pages may have bespoke dark section headers.

---

### H. Role Suite Pages (4 files)
`GridOperatorSuitePage.tsx`, `LenderSuitePage.tsx`, `OfftakerSuitePage.tsx`, `RegulatorSuitePage.tsx`

**Pattern:** Tab-based role cockpit. Same pattern as workstations but at suite level. Headers = light border-bottom. Amber active tabs.

**Status:** ⚠️ **Not yet audited.**

---

### I. Chain Tab Components (202 files)

These are the bulk of the codebase — every workstation tab.

**Pattern:** 
- Filter pill row: `#fff` inactive, `oklch(0.46 0.16 55)` active, `#0f1c2e` inactive text
- Status pills: semantic (green/amber/red)
- Row action buttons: amber
- Section headers: `oklch(0.15 0.025 250)` text, no dark backgrounds
- Timeline/chain state chips: color-coded by state, not navy

**Status:** ✅ Filter button dark pattern fixed globally (`#1c2733` → amber, `background: '#1a3a5c'` → amber). ⚠️ **Need sampling audit of ~10 representative chain tabs** to catch any bespoke dark patterns not covered by the global sed.

---

### J. Widget Components (3 files — remaining work)

#### `widgets/EsumsOmCockpit.tsx`
Line 159: `HeroStrip` uses `bg-gradient-to-r from-[#1e3a5f] via-[#1a3a5c] to-[#0b1c30] text-white`

**Fix:** Replace with light panel + border-bottom pattern. Text becomes dark.

#### `widgets/EsumsOmOpportunities.tsx`
Line 90: Same dark gradient header.

**Fix:** Same light panel pattern.

#### `AiAssistantDock.tsx`
Line 131: FAB `hover:bg-[#0b1c30]` → `hover:bg-[#a3702f]`
Line 141: AI chat header `bg-gradient-to-r from-[#1e3a5f] to-[#0b1c30] text-white` 

**Fix for header:** Use amber gradient or dark amber solid. This is an AI assistant dock — the header can stay darker to signal "AI context" while not using navy. Use `oklch(0.46 0.16 55)` (amber) as header bg with white text, or a warm dark amber `oklch(0.32 0.10 55)`.

---

### K. Onboarding Steps (`onboarding/steps.tsx`)
Line 91: Decorative grid pattern uses `#1a3a5c` at 3% opacity.

**Fix:** Change grid line color to `oklch(0.88 0.006 250)` (border color) or simply remove the background grid. At 3% opacity it's nearly invisible either way.

---

### L. Shared/Common Components (need audit)
`ActionQueueCard.tsx`, `AiBriefPanel.tsx`, `ObjectPageHeader.tsx`, `IncomingPanel.tsx`, `InsightsPanel.tsx`, `VaultPanel.tsx`, `ThreadPanel.tsx`

**Status:** ⚠️ **Not individually audited.** These render inside many pages. Known issues from prior session:
- `ActionQueueCard.tsx` — line 106 has blue-teal gradient icon background
- `AiBriefPanel.tsx` — uses accentFrom/accentTo props for gradient (may be acceptable as prop-driven)
- `ObjectPageHeader.tsx` — `iconColor = 'linear-gradient(135deg,#3b82c4 0%,#1f9b95 100%)'` default

---

### M. Modals & Dialogs
`WizardModal.tsx` — ✅ Done (light header, amber active step)
`ConfirmDialog.tsx`, `PromptDialog.tsx`, `StepUpModal.tsx`, `CrossOptionModal.tsx`, `ScenarioBuilderModal.tsx`

**Status:** ⚠️ Not yet audited. Confirm/Prompt dialogs likely simple — need to verify button colors. ScenarioBuilderModal may have bespoke dark styling.

---

### N. Special Pages
`NationalDashboard.tsx`, `Intelligence.tsx`, `ESG.tsx`, `Monitoring.tsx`, `DesignGallery.tsx`

These are higher-complexity pages with more custom layouts.

**Status:** ⚠️ Not audited. `NationalDashboard.tsx` is likely the most complex — may have map views, large hero sections.

---

### O. Public / Unauthenticated Pages
`PublicAuditPage.tsx`, `PublicLegalPage.tsx`, `PublicStatusPage.tsx`, `NotFoundPage.tsx`

**Pattern:** Clean minimal white pages, no dark elements expected.

**Status:** ⚠️ Not audited but low risk.

---

## Execution Roadmap

### Phase 1 — Fix remaining 4 dark elements (IMMEDIATE, ~30 min)
1. `widgets/EsumsOmCockpit.tsx` — light HeroStrip
2. `widgets/EsumsOmOpportunities.tsx` — light header
3. `AiAssistantDock.tsx` — amber header (not light, keeps AI dock identity), fix hover
4. `onboarding/steps.tsx` — fix grid line color

### Phase 2 — Audit shared components (HIGH PRIORITY, ~1 hr)
5. `ActionQueueCard.tsx` — fix icon gradient
6. `AiBriefPanel.tsx` — audit accentFrom/accentTo prop usage
7. `ObjectPageHeader.tsx` — fix iconColor default
8. `IncomingPanel.tsx`, `InsightsPanel.tsx` — scan for dark elements

### Phase 3 — Audit listing/table pages (MEDIUM PRIORITY, ~2 hr)
9. `Trading.tsx`, `Settlement.tsx` — most complex listing pages
10. `Marketplace.tsx`, `NationalDashboard.tsx` — complex layouts
11. Remaining ~25 listing pages — sampling pass

### Phase 4 — Audit admin/ops/suite pages (~1 hr)
12. Admin pages, suite pages — section headers and action bars

### Phase 5 — Modal audit (~30 min)
13. ConfirmDialog, PromptDialog, StepUpModal, CrossOptionModal, ScenarioBuilderModal

### Phase 6 — Chain tab sampling audit (~1 hr)
14. Sample 10 representative chain tabs from different roles
15. Look for: bespoke dark section cards, inline gradient icons, non-amber action buttons

### Phase 7 — Auth + public pages (~20 min)
16. Login, ForgotPassword, ResetPassword — visual verify
17. Public pages — quick scan

### Phase 8 — TypeScript check + commit
18. `npm run check:pages` — verify zero TS errors
19. Commit all changes

---

## Layout Changes Beyond Color

Beyond color swaps, these layout patterns should be revisited:

### Section headers
**Current (many pages):** `<h2 className="text-[18px] font-semibold text-white bg-[#1a3a5c] px-4 py-2">`
**mockup-b:** `<h2>` with `color: oklch(0.15 0.025 250)` on canvas, no background. OR a border-bottom header card.

### Page hero cards
**Current (some pages):** `linear-gradient` full-bleed hero
**mockup-b:** bordered warm white card, eyebrow in monospace muted, title in dark primary, subtitle in secondary

### KPI strips
**Current (many):** dark bg with white KPI values
**mockup-b:** light `oklch(0.96 0.003 250)` cells inside warm white card, dark text values

### Status/badge pills
These are fine — they use semantic color (green/amber/red) which works on both dark and light.

### Data tables
**Current:** some have `bg-[#1a3a5c]` header rows
**mockup-b:** `bg-[#f8fafc]` header row, `border-b border-[#eef2f7]` row dividers, dark text

---

## What Good Looks Like Per Screen

### Login page
Centered card (max-w-sm) on `oklch(0.96 0.003 250)` canvas. Warm white card with amber submit button. Logo above card. No dark background behind the card.

### Launch board
Canvas bg. Top: role eyebrow + name + KPI strip (warm white card). Below: 2-column grid of action cards (warm white, amber CTA, AI suggest strip in blue). No dark hero.

### Workstation
Canvas bg. Top: page title + breadcrumb. Amber-active tab strip. Tab body: white card content. No dark section headers.

### Chain tab
Inside workstation tab body. Filter pills row (amber active). Status filter chips. Table or timeline list. Drawer/modal for action (warm white, amber primary button). Every "open action" flow ends on amber.

### Detail/file page
EntityFileShell: warm white hero card (border-bottom style), KPI grid below inside hero, amber-active tab strip, tab body in canvas bg.
