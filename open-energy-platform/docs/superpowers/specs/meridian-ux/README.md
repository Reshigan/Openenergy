# Meridian — Entire User Experience (detailed spec)

> **Companion to** [`../2026-06-17-meridian-frontend-coverage-onboarding-design.md`](../2026-06-17-meridian-frontend-coverage-onboarding-design.md).
> That parent doc is the **remediation plan** (workstreams WS-A…WS-G: reachability/IA, onboarding, neatening/a11y, i18n/ZAR, responsive, SurfaceState, DealDesk). **This tree is the evidence/intent layer** — the full intended UX for every Meridian surface, every role, and the cross-cutting systems they share. Read this to understand *what the experience should be*; read the parent to understand *what we change to get there*.

Serves the directive: **"this must be detailed for the entire user experience … all functionality exposed on the frontend."** 24 documents · ~15.4k lines.

**Status:** plan/evidence only — brainstorming HARD-GATE. No implementation until the consolidated spec is approved.

---

## How to read this

- **Surfaces** — the 8 structural surfaces of the Meridian chrome. Start here to learn the shell, then the per-role docs tell you how each role lands in it.
- **Roles** — one doc per role (12). Each traces that role's signature journey end-to-end (Horizon → Atlas → Ledger → Thread), enumerates every tile/lane, and flags reachability + usability gaps. This is the "all functionality exposed" inventory, role by role.
- **Cross-cutting** — the systems that span all surfaces/roles: DB-backed dropdowns, accessibility/neatening, i18n/ZAR + responsive + export, and the full onboarding system.

The single source of truth for chains is [`../../../../src/utils/chain-registry-meridian.ts`](../../../../src/utils/chain-registry-meridian.ts) (`MERIDIAN_CHAINS`). Role tile config is [`../../../../pages/src/ux-alternatives/launchpad-nav/roleData.ts`](../../../../pages/src/ux-alternatives/launchpad-nav/roleData.ts). Surface allow-list is [`../../../../pages/src/meridian/surfaces.tsx`](../../../../pages/src/meridian/surfaces.tsx).

---

## Surfaces (the 8-surface chrome)

| # | Surface | Doc |
|---|---------|-----|
| 0 | MeridianFrame & MeridianHeader (global chrome) | [surfaces/00-meridianframe-meridianheader-global-chrome.md](surfaces/00-meridianframe-meridianheader-global-chrome.md) |
| 1 | Horizon (`/horizon`) — per-role computed workspace | [surfaces/01-horizon-horizon.md](surfaces/01-horizon-horizon.md) |
| 2 | Atlas (`/atlas`) & Command Palette (⌘K) | [surfaces/02-atlas-atlas-command-palette-k.md](surfaces/02-atlas-atlas-command-palette-k.md) |
| 3 | Ledger (`/ledger/:chainKey`) & +New / FieldForm | [surfaces/03-ledger-ledger-chainkey-new-fieldform.md](surfaces/03-ledger-ledger-chainkey-new-fieldform.md) |
| 4 | Thread (`/thread/:chainKey/:id`) — two-sided cross-role view | [surfaces/04-thread-thread-chainkey-id-two-sided-cross-role-v.md](surfaces/04-thread-thread-chainkey-id-two-sided-cross-role-v.md) |
| 5 | Deal Desk (`/deals`, `/new`) | [surfaces/05-deal-desk-deals-new.md](surfaces/05-deal-desk-deals-new.md) |
| 6 | `/surface/:key` (SURFACE_REGISTRY) & shared SurfaceState | [surfaces/06-surface-key-surface-registry-shared-surfacestate.md](surfaces/06-surface-key-surface-registry-shared-surfacestate.md) |
| 7 | Onboarding (`/onboard`) — OnboardingWizard | [surfaces/07-onboarding-onboard-onboardingwizard.md](surfaces/07-onboarding-onboard-onboardingwizard.md) |

## Roles (signature journey + full tile/lane inventory)

| Role | Doc |
|------|-----|
| admin | [roles/admin.md](roles/admin.md) |
| trader | [roles/trader.md](roles/trader.md) |
| ipp_developer *(headline "hard journey" role)* | [roles/ipp_developer.md](roles/ipp_developer.md) |
| carbon_fund | [roles/carbon_fund.md](roles/carbon_fund.md) |
| offtaker | [roles/offtaker.md](roles/offtaker.md) |
| lender | [roles/lender.md](roles/lender.md) |
| grid_operator | [roles/grid_operator.md](roles/grid_operator.md) |
| regulator | [roles/regulator.md](roles/regulator.md) |
| support | [roles/support.md](roles/support.md) |
| esco | [roles/esco.md](roles/esco.md) |
| esums_owner *(shares ESCO config; surfaceRole→esco)* | [roles/esums_owner.md](roles/esums_owner.md) |
| epc_contractor *(newest role)* | [roles/epc_contractor.md](roles/epc_contractor.md) |

## Cross-cutting systems

| Area | Doc |
|------|-----|
| DB-backed dropdowns (string → lookup) & LOOKUP_SOURCES | [crosscutting/00-db-backed-dropdowns-string-lookup-lookup-sources.md](crosscutting/00-db-backed-dropdowns-string-lookup-lookup-sources.md) |
| Accessibility & neatening (Dialog primitive, contrast, focus, keyboard, labels) | [crosscutting/01-accessibility-neatening-dialog-primitive-contras.md](crosscutting/01-accessibility-neatening-dialog-primitive-contras.md) |
| ZAR/i18n locale, responsive <760px, SurfaceState, print/export | [crosscutting/02-zar-i18n-locale-responsive-760px-surfacestate-pr.md](crosscutting/02-zar-i18n-locale-responsive-760px-surfacestate-pr.md) |
| Full onboarding system — per-role sequences, per-component first-run, provisioning, sandbox, KYC gate | [crosscutting/03-full-onboarding-system-per-role-sequences-per-co.md](crosscutting/03-full-onboarding-system-per-role-sequences-per-co.md) |

---

## Companion: navigation + usability resolution

The simulated frontend test (12 roles + 4 cross-cutting checks, code-grounded) and its per-role resolution plan — **navigation and usability as the key criteria** — live in [`RESOLUTION-nav-usability.md`](RESOLUTION-nav-usability.md), with a condensed synthesis carried into the parent design doc under [Simulated frontend test — nav + usability resolution](../2026-06-17-meridian-frontend-coverage-onboarding-design.md#simulated-frontend-test--nav--usability-resolution). This tree is the *intended* experience; that companion is the *measured gap + fix order*.
