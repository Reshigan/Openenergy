# Test Plan — PR #9 (Fiori 3 Redesign)

## Target

- **Preview URL:** https://2508caa3.open-energy-platform.pages.dev (branch `devin/1776799454-fiori-ui`, bundle `index-Cz0Sl323.js`)
- **Production URL (reference, old bundle):** https://oe.vantax.co.za (still serving `index-CgVr6YPE.js` from `main`)

Testing happens **on the preview URL** — the PR is not merged yet, so production can't be used to validate the new UI.

## Prerequisite

The preview deployment's Pages Functions are missing a `JWT_SECRET` binding, so `/api/auth/login` currently 500s with an HMAC key error. Before testing, I will:

1. `PATCH` the Pages project's `deployment_configs.preview.env_vars` to add a fresh `JWT_SECRET` (prod env untouched).
2. `POST .../deployments/<id>/retry` to re-bake the Functions with the new env.
3. Curl `/api/auth/login` to confirm it returns a JWT.

This isolates the testing environment from production.

## Scope

Purely presentational regression of the Fiori 3 redesign. Auth and navigation are in scope only as the carrier for the visual changes.

## Adversarial Checks (bias toward failures)

| # | Assertion | Why it could fail |
|---|-----------|-------------------|
| A1 | Login page renders **split-panel**: brand panel (aurora blobs + wordmark + feature badges) on the left, form on the right | CSS didn't load; Tailwind tokens broken; `index.css` @import order regression |
| A2 | Login form has visible **email + password inputs** and a filled **Sign In** button | Regression of the same "invisible button" bug from PR #7 |
| A3 | Six **demo role quick-fill buttons** (Admin, Trader, IPP, Carbon, Offtaker, Grid) populate email + password when clicked | `fillDemo()` wiring broken |
| A4 | After admin login, `/cockpit` shows an **aurora hero** with greeting, role subtitle, CTA and 4 glass KPIs | `Cockpit.tsx` crashes without `/cockpit/stats` data; hero markup missing |
| A5 | Shell bar is 44px, **gradient navy → indigo → plum**, with global search, notifications, help, avatar | `.fiori-shell` class not applied; height wrong; colors flat |
| A6 | Avatar click → **dropdown** with name/email/Sign out; Sign out → returns to `/login` split-panel | `userMenu` state wiring broken |
| A7 | **Launchpad tiles** render in Market Pulse / Jump-to / Operations groups with **colored top bars** (blue/indigo/teal/plum/pink/amber/green/red), hover lift | Accent CSS vars missing; tile class not applied |
| A8 | **Glass chart cards** (area + bar) render with `backdrop-filter: blur(…)` and gradient-filled recharts | Charts flat white; blur support absent |
| A9 | **Sidebar** collapses 256px → 48px on toggle, shows role-filtered sections, active link has gradient accent | `collapsed` state or `navForRole` mis-wired |
| A10 | **Role-based nav (negative)** — trader sidebar shows FEWER sections than admin (no System, no Projects); IPP shows Projects but no System | `navForRole` returns wrong filter for that role |
| A11 | Click a tile (e.g., Contracts) → navigates; target page renders in **Fiori palette** (blue/grey) not old teal IonEx | Token remap in `tailwind.config.js` / `index.css` didn't take effect |
| A12 | At **1440 / 900 / 420 px** viewports, shell bar + hero + tiles reflow without overflow; brand panel hides at <1024 | Missing responsive breakpoints / grid template issues |
| A13 | Force `/api/cockpit/stats` failure (devtools network block) — Cockpit still renders with fallback defaults, not blank | `stats ?? default` fallback missing |

## Artifacts

- `test-plan.md` (this file)
- `test-report.md` — full inline screenshots per assertion, pass/fail table
- Screen recording of: admin login → cockpit → sidebar collapse → avatar logout → trader login → sidebar diff → click a tile
- One PR #9 GitHub comment with consolidated results + link to this Devin session

## Decision Points

- If **A1 or A5 fail** (new bundle isn't actually rendering): stop, investigate `_routes.json` / `_redirects` / asset paths.
- If **A10 fails** (role nav leaks): high-severity visual regression; report but continue.
- If **A13 fails** (fallback broken): medium — it wasn't a PR goal but is table-stakes for a launchpad.
