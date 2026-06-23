# Open Energy Platform — Design System

## Color Strategy: Restrained with role-specific accent

**Base palette (shared across all roles):**
- Surface 0 (canvas): oklch(0.14 0.008 250) — deep blue-tinted near-black
- Surface 1 (card): oklch(0.18 0.006 250) — slightly lighter
- Surface 2 (raised): oklch(0.22 0.005 250) — dialog / header
- Border subtle: oklch(0.28 0.004 250)
- Border strong: oklch(0.38 0.006 250)
- Text primary: oklch(0.92 0.005 90) — warm near-white
- Text secondary: oklch(0.62 0.008 250) — cool mid-grey
- Text muted: oklch(0.44 0.006 250)

**Role accent colors (10% of surface max):**
- Trader: oklch(0.72 0.22 145) — electric green (trading floor energy)
- IPP: oklch(0.68 0.18 55) — amber (construction, project)
- Lender: oklch(0.65 0.15 240) — deep blue (institutional finance)
- Offtaker: oklch(0.70 0.20 175) — teal (energy buyer)
- Grid: oklch(0.72 0.24 95) — electric yellow (grid / high voltage)
- Carbon: oklch(0.68 0.18 165) — forest green (sustainability)
- Regulator: oklch(0.62 0.14 20) — slate red (authority)
- ESCO: oklch(0.67 0.16 205) — steel blue (operations)
- Admin: oklch(0.60 0.08 250) — neutral (system)

**Status semantics:**
- Good: oklch(0.70 0.20 145)
- Warn: oklch(0.76 0.20 75)
- Bad: oklch(0.62 0.22 20)
- Neutral: oklch(0.70 0.12 250)
- Info: oklch(0.72 0.18 240)

## Typography
- Primary: "IBM Plex Sans", "Metropolis", system-ui
- Mono: "IBM Plex Mono", "Fira Code", monospace (for numbers, codes, IDs)
- Scale: 11 / 12 / 13 / 15 / 18 / 24 / 32 px
- Data values: mono, tabular-nums, always
- Labels: 11px caps tracking-widest, text-muted

## Elevation / Layer system
- L0: base canvas — no shadow
- L1: inline card — 1px border only
- L2: raised panel — subtle drop shadow
- L3: floating (drawers, dropdowns) — medium shadow + backdrop
- L4: modal — strong shadow + dimmed backdrop
- No border-radius > 8px on data tables
- 12px radius on cards, 16px on drawers

## Spacing rhythm
- Base unit: 4px
- Compact density: 8/12/16
- Default density: 12/16/24
- Relaxed density: 16/24/32
- User-togglable between compact and default; workstations default compact

## Components
- Tab nav: pill style, no underline. Active: role accent bg, 80% opacity.
- KPI chip: monospaced value, 11px label above, trend badge bottom-left
- Status badge: small, all-caps, monospace, 2px border radius
- Chain state pill: 2-tone — state bg (20% opacity) + state text, no icon
- Action button: filled with role accent; no rounded corners > 6px
- Data table: no alternating rows; hover: border-left 2px role accent
- Drawer: slides in from right, 480px wide, full height
- AI assist card: left accent bar (role accent) — EXCEPTION to side-stripe rule (this IS the affordance, not decoration)

## Absolute bans (in addition to shared laws)
- No white backgrounds on app surfaces (light mode is dark mode with inverted palette)
- No gradient text
- No emoji in production UI
- No hero sections with big numbers + supporting stats (applies to LaunchBoard)
- No glassmorphism

## Motion
- Tab switch: opacity 0→1, translateY 4px→0, duration 120ms, ease-out-quart
- Drawer open: translateX 100%→0, duration 200ms, ease-out-quint
- KPI update: number flip, 300ms, ease-out-expo
- No bounce, no spring physics
