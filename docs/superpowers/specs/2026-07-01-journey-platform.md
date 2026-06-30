# Journey Platform — design spec (DRAFT for confirmation)

**Status:** DRAFT 2026-07-01. Consolidates the journey-cockpit direction + six refinements. Confirm the model is complete before the shell is built (J2+), since governance + charging are foundational (the cockpit reads them).

## Vision
**One journey-shaped workspace** replaces the tool-shaped surfaces (Horizon / Atlas / Ledger / Thread / Deal Desk) and the section menu (Deals/ESG/Reports/Intelligence/National). A *journey* is an outcome a role works toward. Every tool lives inside a journey — zero orphans. Same frame for all 10 roles; only the journeys differ. Configurable per role and monetizable per action.

## Confirmed requirements (the mandate)
1. **First layout** — top journey tabs, light workspace, detail **in-context** (no separate Thread page). Not the dark left-rail variant.
2. **Custom icons** — inline SVG, Substation line style. **No emoji.**
3. **All tools in journeys** — every reachable function/surface/chain/report + the cross-cutting sections map into a journey. Extensible: new functionality is registered → assigned to a journey.
4. **Per-role "new X" + CRUD** — each role can create its primary entity (IPP→project, lender→facility, trader→order, regulator→licence…) and do full create/read/update/delete on its entities, inside the cockpit.
5. **Admin journey-crafting** — an admin surface to set, per role, each feature/action as **required / optional / not-available**; the cockpit renders accordingly (required surfaced, optional available, unavailable hidden).
6. **Per-action charges** — actions can carry an admin-set charge, wired to the existing fee engine; billed on the action's cascade.
7. **All 10 roles**, Substation-polished, sophisticated.

## Data model
- **Journey taxonomy** (`journeys.ts`, J1 ✓): `getJourneys(role)` → journeys from roleData domains + visible cross-cutting sections; icon keys; per-role `primaryEntity`. Zero-orphan coverage tested.
- **Governance + charge config** (J1.5, NEW): per `(role, featureKey)` →
  - `status`: `required | optional | unavailable` (default: today's reachable = optional, unreachable = unavailable),
  - `charge`: optional `{ amount_zar, fee_event }` linking to `oe_fee_schedule`.
  - Stored backend (extend `oe_feature_entitlements` + `oe_fee_schedule`, or a `journey_config` table). Admin-editable via `/api`. Falls back to defaults so the cockpit works before any admin curation.
- **Charging**: the cockpit's action-fire already routes through `fireCascade`; the fee engine bills the configured charge on that event. Admin sets `amount_zar` per action per role.

## Surfaces
- **JourneyCockpit** (J2) — first layout + custom icons. Top journey tabs + **Today** (cross-journey priority) + per-journey item list + **in-context detail** + **Start › New X** + entity **CRUD**. Reads governance (hide unavailable, badge required) and shows a charge indicator on charged actions.
- **Admin journey editor** — per-role matrix: features × {required/optional/unavailable} + a charge column. This is where new functionality is slotted into a journey and priced.

## Build phases
J1 taxonomy ✓ · custom icons · **J1.5 governance+charge model + persistence** · J2 cockpit shell (reads governance) · admin journey editor · J3 post-login home (old routes kept) · J4 all-roles verify · J5 retire old surfaces + section menu, ship via PR + healthy deploy.

## Reuses (not rebuilt)
Chain registry (`MERIDIAN_CHAINS`), the fee engine (`oe_fee_schedule` + cascade billing), entitlements (`oe_feature_entitlements`), existing data fetches, the Substation identity, the P2 per-user prefs (pin/hide) layered *under* admin governance.

## Open question for confirmation
Is this the complete model, or are there more dimensions to fold in before I build the shell? Once confirmed, J1.5 → J2 → admin editor proceed.
