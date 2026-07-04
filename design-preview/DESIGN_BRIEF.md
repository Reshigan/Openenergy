# Per-Role Frontend Design Exploration — Shared Contract

You are designing a **bold, ground-up frontend** for ONE role of the Open Energy Platform
(SA energy exchange: power trading, carbon, IPP lifecycle, settlement, regulatory compliance).

These are **evaluation mockups**, not production code. They are NOT wired into the app.
You are explicitly **NOT constrained by the current Meridian design**. Be bold. Invent.

## What the user wants to evaluate

1. A frontend **tailored to this role's user profile** — their job, environment, device habits,
   stress level, expertise. A trader is not a regulator is not a field O&M tech.
2. **2–3 distinct design directions (options)** per role, side by side, so they can compare and pick.
3. For EACH option: a **WEB** view (desktop) AND a **MOBILE PWA** view (phone). Both, every option.
4. Designs centered on **user journeys**, because **journeys will be monetized**: the platform plans to
   **charge per user journey**, and module complexity must be built into pricing. So the design must
   **surface journeys as packaged, metered products** with a visible complexity/value tier.

## Journey-as-product (REQUIRED in every option)

Map each role's hero journeys to a visible **tier badge**:
- **Foundation** (L3): state machine + validation + audit. Entry tier.
- **Professional** (L4): full workflow — gating, cascades, calendar/timer-driven, escalation, evidence chain.
- **Regulator-grade** (L5): tamper-evident audit, certified exports, external reconciliation.

Pick this role's **3 hero journeys** from its real chains (read roleData.ts — see below). For each,
show: journey name, its tier badge, and **what gets metered** (e.g. "per case", "per MWh settled",
"per certified export", "per active facility"). Make the monetization legible in the UI itself —
this is a product the user pays for, the design should make the value obvious.

## Source of truth for this role's real journeys

Read `open-energy-platform/pages/src/ux-alternatives/launchpad-nav/roleData.ts`.
Find your role's config (bottom of file, ~line 940+) and its `domains` → `features`.
Use **real** journey names, chain keys, and `mockStates` (the state machines) — NO lorem, NO invented features.
The `mockStates` arrays are real chain lifecycles — use them to show progress/pipeline UI.

## Output: ONE self-contained HTML file

Write to `design-preview/<role-slug>.html`. Hard requirements:
- **Single file. Inline `<style>`. Zero build deps.** One web-font `<link>` (Google Fonts / fontshare) is allowed.
- Tiny inline `<script>` allowed ONLY for an option-tab switcher. No frameworks.
- Structure:
  1. Header band: role label, **persona** (2–3 sentences: who, environment, device, what they need),
     and the **design rationale** (1–2 sentences: why these directions fit this profile).
  2. **Journey-as-product strip**: the 3 hero journeys with tier badges + metered unit.
  3. **Option 1 / Option 2 / (Option 3)** — each a named direction with a 1-line concept, then
     a **desktop frame** (~1280px wide, realistic chrome) and a **phone frame** (~390×844, PWA:
     show status bar, install/offline hint, bottom nav, one-thumb primary action) side by side.
- Use the role's real journey/state data inside the mockups (pipelines, cards, tables, detail views).
- **Bold, distinct identity per role.** Choose color, type, and density to match the profile
  (see your role-specific note in the dispatch prompt). Don't make 3 near-identical options —
  make them genuinely different bets (e.g. dense-terminal vs. calm-guided vs. map/spatial).
- **Accessibility floor:** every interactive element ≥ WCAG AA contrast (4.5:1 text), tap targets ≥ 24px.
  Don't ship white-on-gold low-contrast CTAs.
- Fully responsive is not required (these are framed mockups), but the phone frame must look like a real PWA.

## Quality bar

This competes with category-leader systems (Bloomberg terminal, Linear, Palantir, Salesforce, Datadog).
Beat them for THIS role. No generic AI-purple gradients, no three-equal-feature-cards, no centered-hero slop.
Real density and information design appropriate to the role. Make it feel inevitable for this user.

Return only: the file path written + a 3-line summary of the 3 options you chose. Do not paste the HTML.
