# Offtaker Procurement → LOI → Cross-Role Cascade — Design

**Date:** 2026-06-07
**Branch:** `feat/ecosystem-foundation`
**Status:** approved (design); spec for the first cross-role vertical slice.

## Goal

Surface the already-built offtaker procurement journey in the frontend and make **the cascade the thing that drives the offtaker→IPP relationship**. Offtaker loads a bill → sees a right-sizing analysis → sees **options** (marketplace available now + upcoming projects, each with its own cost-benefit) → selects one (or drafts from the whole recommended mix) → an LOI is created → `fireCascade` pushes a Layer-C cross-role action into the target IPP's queue, where it appears as a "Review LOI" next-step.

This is the **reference pattern** for "built-on-the-backend but not surfaced, cascade-driven cross-party flows." Scope is the offtaker slice only; other roles come after review.

## Context & current gap (grounded)

Backend is ~70% built:
- `POST /api/ai/offtaker/bills` ([ai.ts:97](../../../open-energy-platform/src/routes/ai.ts)) → `offtaker_bills`.
- `POST /api/ai/offtaker/optimize` ([ai.ts:163](../../../open-energy-platform/src/routes/ai.ts)) → returns recommended mix at **`data.structured` = `{ mix: MixItem[], savings_pct, carbon_tco2e, warnings }`** plus `data.projects` (raw `ipp_projects`).
- `POST /api/ai/offtaker/loi` ([ai.ts:257](../../../open-energy-platform/src/routes/ai.ts)) → inserts `loi_drafts` (one per mix item), derives `to_participant_id = project.developer_id`, fires `fireCascade({event:'contract.created', entity_type:'loi_drafts', data:{counterparty_id, project_id, project_name, annual_mwh, blended_price, horizon_years, ...}})`, and inserts a **legacy `action_queue`** `loi_review` row for the IPP.
- Layer-C: `pushRoleAction(env, RoleActionInput)` ([role-actions.ts:31](../../../open-energy-platform/src/utils/role-actions.ts)) writes `oe_role_action_queue`. Frontend `IncomingPanel` + `CrossOptionModal` are auto-mounted by `WorkstationShell`.

The breaks:
- The offtaker optimize result dead-ends at a **text-only "Next step" card** ([OfftakerWorkstationPage.tsx:589](../../../open-energy-platform/pages/src/components/pages/OfftakerWorkstationPage.tsx)) — no button, no call to `/ai/offtaker/loi`.
- There is **no options view** combining marketplace-now + upcoming-projects with cost-benefit.
- The offtaker→IPP handoff uses the **legacy `action_queue`**, not the Layer-C cascade path — so the cascade does not drive the relationship today (the `contract.created` event carries no `chain_key`, but the registry runs regardless, so a matching rule still fires).

## Decisions (from review)

- **Scope:** offtaker slice end-to-end, then stop for user review. No other roles in this slice.
- **Selection model:** *both* — show the recommended portfolio mix for context **and** let the offtaker select individual options one at a time.
- **Cascade wiring (settled):** additive — a new `CascadeRule` matching the existing `contract.created`+`loi_drafts` event calls `pushRoleAction` into Layer-C. Zero edits to `ai.ts`, zero edits to any frozen file, zero migration.

## Architecture

Two additive backend pieces + two frontend edits + one new cascade-rule module. Reuses existing endpoints (`optimize`, `loi`, `inquire`) and the existing Layer-C inbox UI.

### Approach choices (recorded)

- **Cross-party cascade:** new `CascadeRule` on `contract.created`+`loi_drafts` → `pushRoleAction` to the IPP **(chosen)**; rejected: adding a `loi.sent` event (would require editing the closed `EventType` union in `cascade.ts` and the hot `ai.ts` handler); rejected: ripping out the legacy `action_queue` (regression risk, the legacy row stays as-is).
- **Options endpoint:** new additive `GET /api/offtaker/options?bill_id=` **(chosen)**; rejected: overloading `/ai/offtaker/optimize` (couples concerns, edits a hot handler).

## Components

### 1. `src/utils/offtaker-options.ts` (new)

Pure-ish util. Reads upcoming projects + active listings, computes per-option cost-benefit against the bill profile.

```ts
export interface OfftakerOption {
  option_id: string;                 // project id or listing id
  kind: 'project' | 'listing';
  title: string;                     // project_name or listing title
  target_participant_id: string;     // ipp_projects.developer_id | marketplace_listings.seller_id
  availability: 'now' | 'upcoming';  // listing=now; project: commercial_operations=now else upcoming
  cod_estimate: string | null;       // project status label / null for 'now'
  annual_mwh: number;                // option's offered annual energy (capped at demand at compute time)
  blended_price_zar_per_mwh: number; // ppa_price_per_mwh | listing.price (energy)
  est_annual_cost_zar: number;       // covered_mwh * blended_price
  est_saving_zar: number;            // current_cost_for_covered - est_annual_cost_zar
  est_saving_pct: number;            // 0 when current cost basis is 0
  co2_avoided_tco2e: number;         // covered_mwh * SA_GRID_EF
  rationale: string;
}

export interface OfftakerOptions {
  available_now: OfftakerOption[];   // marketplace listings, listing_type in ('energy','capacity'), status='active'
  upcoming_projects: OfftakerOption[];// ipp_projects, status != 'commercial_operations'/'decommissioned'
}

export async function buildOfftakerOptions(
  env: HonoBindings,
  offtakerId: string,
  bill: { annual_kwh: number; avg_tariff_zar_per_kwh: number },
): Promise<OfftakerOptions>;
```

**Cost-benefit math (per option):**
- `current_annual_cost_zar = bill.annual_kwh * bill.avg_tariff_zar_per_kwh`
- option annual MWh: project → `ppa_volume_mwh`; listing → `volume_available` (energy listings are MWh/yr). Fall back to demand if null.
- `demand_mwh = bill.annual_kwh / 1000`
- `covered_mwh = min(option_annual_mwh, demand_mwh)`
- `est_annual_cost_zar = covered_mwh * blended_price_zar_per_mwh`
- `current_cost_for_covered = covered_mwh * 1000 * bill.avg_tariff_zar_per_kwh`
- `est_saving_zar = current_cost_for_covered - est_annual_cost_zar`
- `est_saving_pct = current_cost_for_covered > 0 ? est_saving_zar / current_cost_for_covered * 100 : 0`
- `co2_avoided_tco2e = covered_mwh * SA_GRID_EF` where `const SA_GRID_EF = 0.95;` (tCO₂e/MWh, Eskom grid emission factor; module constant with a citing comment). If `src/utils/offtaker-heuristics.ts` already defines a grid factor, import and reuse it instead of redefining.
- `annual_mwh` returned = `covered_mwh` (what the option would actually serve).

Tables (chosen deliberately): **`marketplace_listings`** (the table the live `Marketplace.tsx` uses: `seller_id`, `listing_type`, `price`, `volume_available`, `delivery_start/end`, `status`), **not** `ppa_marketplace_listings`. Projects: `ipp_projects` (`developer_id`, `status`, `ppa_price_per_mwh`, `ppa_volume_mwh`, `project_name`).

### 2. `GET /api/offtaker/options` in `src/routes/offtaker.ts` (add handler)

Mirror the existing `GET /delivery-points` handler ([offtaker.ts:32](../../../open-energy-platform/src/routes/offtaker.ts)): `const user = getCurrentUser(c)` (user.id IS the participant id), tenant/role-scoped. Resolve the bill profile from `offtaker_bills` by `?bill_id=` (scoped to `offtaker_id = user.id`; fall back to latest bill if no id). Parse the stored AI profile to `{ annual_kwh, avg_tariff_zar_per_kwh }` (the `ai_result_json` shape produced by `extractBillProfile`). Call `buildOfftakerOptions`. Return `c.json({ success: true, data: options })`. No new mount needed (module already mounted at `/api/offtaker`; `/options` does not collide with the more-specific sub-routers).

### 3. `src/cascade-rules/offtaker-procurement.ts` (new rule module)

New community/module per graphify-first (a new chain = a new community). Mirrors `lifecycle-sequencing.ts` exactly: `CascadeRule` objects in a `RULES: CascadeRule[]`, a `registerOfftakerProcurementRules()` that loops `registerCascadeRule`, wired into `src/cascade-rules/index.ts`. Imports `CascadeContext` (cascade), `registerCascadeRule`/`CascadeRule` (cascade-registry), `pushRoleAction` (role-actions); reuse the local `dstr/dnum/alreadyPushed` pattern (copy the small helpers or inline equivalents — they are file-local in lifecycle-sequencing).

**Rule A — LOI → IPP:**
```ts
{
  id: 'offtaker_procurement.loi_to_ipp',
  mode: 'drive',
  match: (ctx) => ctx.event === 'contract.created' && ctx.entity_type === 'loi_drafts',
  run: async (ctx) => {
    const ipp = dstr(ctx, 'counterparty_id');
    if (!ipp) return;
    if (await alreadyPushed(ctx, ctx.entity_id, 'ipp_developer')) return;
    const name = dstr(ctx, 'project_name') ?? 'a project';
    await pushRoleAction(ctx.env, {
      target_role: 'ipp_developer',
      target_participant_id: ipp,
      source_event: ctx.event,
      source_chain_key: 'offtaker_procurement',
      source_entity_type: 'loi_drafts',
      source_entity_id: ctx.entity_id,
      title: `New Letter of Intent for ${name}`,
      body: { project_id: dstr(ctx,'project_id'), annual_mwh: dnum(ctx,'annual_mwh'), blended_price: dnum(ctx,'blended_price') },
      cross_option: { action_label: 'Review LOI', target_route: `/lois/${ctx.entity_id}` },
      priority: 'high',
    });
  },
}
```

**Rule B — marketplace inquiry → seller** (honours "cascade drives relationships" for the available-now path):
```ts
{
  id: 'offtaker_procurement.inquiry_to_seller',
  mode: 'drive',
  match: (ctx) => ctx.event === 'marketplace.inquired',
  run: async (ctx) => {
    const seller = dstr(ctx, 'seller_id');
    if (!seller) return;
    // resolve seller role (listings may be posted by ipp_developer or others)
    const row = await ctx.env.DB.prepare('SELECT role FROM users WHERE id = ? OR participant_id = ? LIMIT 1').bind(seller, seller).first<{ role: string }>();
    const role = row?.role ?? 'ipp_developer';
    if (await alreadyPushed(ctx, ctx.entity_id, role)) return;
    await pushRoleAction(ctx.env, {
      target_role: role,
      target_participant_id: seller,
      source_event: ctx.event,
      source_chain_key: 'offtaker_procurement',
      source_entity_type: 'marketplace_inquiries',
      source_entity_id: ctx.entity_id,
      title: 'New marketplace inquiry',
      body: { listing_id: dstr(ctx,'listing_id') },
      cross_option: { action_label: 'View inquiry', target_route: `/marketplace?listing=${dstr(ctx,'listing_id')}` },
      priority: 'normal',
    });
  },
}
```
The exact seller-role lookup query must be verified against the actual `users`/`participants` schema during implementation (the `OR participant_id = ?` clause is a guard; adjust to the real column). Rule B is secondary to Rule A; if the role lookup proves unreliable, ship Rule A and mark Rule B follow-up rather than guessing.

### 4. Frontend — `BillUploadTab` in `OfftakerWorkstationPage.tsx`

- **Replace** the dead "Next step" card ([line 589](../../../open-energy-platform/pages/src/components/pages/OfftakerWorkstationPage.tsx)) with a real **"Draft LOIs from this mix"** button → `api.post('/ai/offtaker/loi', { mix: mix.mix, horizon_years: 15 })` → on success toast/inline confirmation + a link to `/lois`. (`mix.mix` items already carry `{project_id, share_pct, mwh_per_year, blended_price}`.)
- **Add an Options section** (after the mix table): on optimize success, also `api.get('/offtaker/options', { params: { bill_id: latest.id } })`. Render two groups — "Available now" (`available_now`) and "Upcoming projects" (`upcoming_projects`) — each option a row showing title, blended R/MWh, est. annual saving (R + %), CO₂ avoided, availability/COD. Per-option primary action:
  - `kind==='project'` → **Draft LOI** → `api.post('/ai/offtaker/loi', { mix: [{ project_id, share_pct: 100, mwh_per_year: annual_mwh, blended_price: blended_price_zar_per_mwh }], horizon_years: 15 })`.
  - `kind==='listing'` → **Send inquiry** → `api.post('/marketplace/listings/' + option_id + '/inquire', { message })`.
- Reuse existing tinted-neutral tokens (`#1a3a5c`, `#0f1c2e`, `#dde4ec`, `#6b7685`) and the file's existing card/table styling. No new design language.
- **Inbox: no work.** `WorkstationShell` already renders `IncomingPanel` + `CrossOptionModal`; the IPP's workstation (verify it is built on `WorkstationShell`) will show the pushed "Review LOI" automatically. The offtaker sees their own queue the same way.

## Data flow

```
bill upload → offtaker_bills
   ↓ optimize (existing)            ↓ GET /offtaker/options (new)
recommended mix (data.structured)   available_now[] + upcoming_projects[] (cost-benefit)
   ↓ "Draft LOIs from mix"          ↓ per-option "Draft LOI" / "Send inquiry"
POST /ai/offtaker/loi  →  loi_drafts + fireCascade(contract.created, loi_drafts)
                                          ↓ runCascadeRegistry
                          Rule A: pushRoleAction → oe_role_action_queue (target ipp_developer)
   POST /marketplace/.../inquire → fireCascade(marketplace.inquired)
                                          ↓ Rule B: pushRoleAction → seller
IPP opens workstation → IncomingPanel shows "Review LOI" → CrossOptionModal → /lois/:id → accept → contract
```

## Testing

- **Backend (vitest, must keep full suite green):**
  - `tests/offtaker-options.test.ts` — `buildOfftakerOptions` cost-benefit math: saving/pct/CO₂ for a project cheaper than tariff; capping `covered_mwh` at demand; zero-tariff guard (pct=0); listing vs project bucketing; `target_participant_id` = developer_id / seller_id.
  - `tests/offtaker-procurement-rules.test.ts` — Rule A: a `contract.created`+`loi_drafts` ctx triggers `pushRoleAction` with `target_role:'ipp_developer'`, `target_participant_id=counterparty_id`, `cross_option.target_route='/lois/<entity_id>'`; non-`loi_drafts` `contract.created` does NOT push; dedup via `alreadyPushed`. Rule B basic match (mock the role lookup).
- **Frontend (no unit runner):** `npm run check:pages` (tsc --noEmit) + `cd pages && npm run build`.
- **Backend type-check:** `npm run check`.

## Constraints honoured

- **Additive only:** new util, new route handler, new cascade-rule module, frontend edits to one tab. No edits to any `*-chain.ts`, `*-spec.ts`, `cascade.ts` signature, `EventType` union, migrations, auth/tenant/locks, OrderBook, matching, or `wrangler.toml`. No new migration (reuses `oe_role_action_queue` from migration 476). The legacy `action_queue` `loi_review` insert is left intact (no regression).
- Cascade handlers preserve `ctx.actor_id`; `pushRoleAction` is invoked from a rule, not a chain, so the actor provenance on the originating event is unchanged.

## Out of scope (this slice)

Other roles' missing-frontend functionality (next, after review); persisting the right-sizing recommendation as an auditable object (YAGNI for the slice); changing the optimize endpoint; any migration; replacing the legacy `action_queue` path.

## Risks & mitigations

- **Rule B seller-role lookup** depends on the real `users`/`participants` schema — verify during implementation; degrade to Rule-A-only if unreliable.
- **`marketplace_listings.price` unit** — energy listings are assumed R/MWh; if `price_unit` indicates otherwise, normalise in `buildOfftakerOptions`.
- **`contract.created` is also fired on LOI accept** (entity_type `contract_documents`) — Rule A gates strictly on `entity_type==='loi_drafts'`, so it never fires on the accept-created contract.
- **Duplicate pushes** when drafting from a multi-project mix — each LOI has a distinct `entity_id`; `alreadyPushed` dedups per `(source_entity_id, source_event, target_role)`.
