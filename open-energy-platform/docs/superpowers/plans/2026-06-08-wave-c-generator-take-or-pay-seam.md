# Wave C — Generator-side Take-or-Pay Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development or direct TDD per task. Steps use `- [ ]` for tracking.

**Goal:** When an offtaker under-delivers against a PPA, push the crystallized take-or-pay claim (and the earlier shortfall heads-up) to the generator's (IPP) workstation inbox, and give that push a real destination by surfacing the existing two-party take-or-pay chain on the IPP workstation.

**Architecture:** Pure Layer-C additive. Two new cascade rules match events that ALREADY fire (`offtaker.obligation_take_or_pay`, `offtaker.obligation_shortfall` from [offtaker-obligations.ts](../../../src/routes/offtaker-obligations.ts)); each resolves the generator from the obligation row's `counterparty_id` and `pushRoleAction`s into `oe_role_action_queue` → the IPP `IncomingPanel`. Frontend mounts the existing `TakeOrPayChainTab` (a genuine two-party chain, `IPP_WRITE` already exists, role→party derived server-side) on the IPP workstation. NO migration, NO new chain, NO EventType change.

**Tech Stack:** Hono + D1, cascade-registry, `pushRoleAction`/`cascade-data` helpers; React tab config on `IppWorkstationPage`.

**Reference pattern:** [offtaker-procurement.ts](../../../src/cascade-rules/offtaker-procurement.ts) (LOI → IPP push) and [underserved-inboxes.ts](../../../src/cascade-rules/underserved-inboxes.ts) (entity-row lookup → targeted push). Mirror their `alreadyPushed` dedup keyed on `(source_entity_id, source_event)`.

---

### Task 1: Layer-C rules — take-or-pay + shortfall → generator inbox

**Files:**
- Create: `src/cascade-rules/ppa-delivery-shortfall.ts`
- Create: `tests/ppa-delivery-shortfall-rules.test.ts`
- Modify: `src/cascade-rules/index.ts` (register the new rules)

- [ ] **Step 1: Write failing test** mirroring `underserved-inboxes-rules.test.ts`:
  - Seed an obligation row `(id, ppa_id, participant_id, counterparty_id='ipp77', period_month)`.
  - Fire `offtaker.obligation_take_or_pay` (entity_type `offtaker_ppa_obligation`, entity_id=obligation id, data `{ppa_id, period_month, take_or_pay_amount_zar: 250000}`) → assert one `oe_role_action_queue` row: `target_role='ipp_developer'`, `target_participant_id='ipp77'`, `priority='high'`, `source_chain_key='ppa_delivery_shortfall'`, cross_option route `/ipp-lifecycle/workstation?tab=take-or-pay-claims`, title contains the amount.
  - Fire `offtaker.obligation_shortfall` (data `{ppa_id, period_month, shortfall_mwh: 40, cure_deadline_at: '2026-07-01T00:00:00.000Z'}`) → assert `priority='normal'`, `sla_due_at='2026-07-01T00:00:00.000Z'`.
  - Obligation with NULL counterparty → no push.
  - Double-fire same (entity,event) → exactly 1 row.

- [ ] **Step 2: Run test, verify RED.** `npx vitest run tests/ppa-delivery-shortfall-rules.test.ts`

- [ ] **Step 3: Implement** `ppa-delivery-shortfall.ts`:
  - `alreadyPushed(ctx, sourceEntityId)` — identical to underserved-inboxes.
  - `resolveGenerator(ctx)` — `SELECT counterparty_id FROM oe_offtaker_ppa_obligations WHERE id = ctx.entity_id`; return string|null.
  - Rule `ppa_delivery_shortfall.take_or_pay_to_generator`: match `offtaker.obligation_take_or_pay`; resolve generator (skip if null); dedup; push `target_role:'ipp_developer'`, `target_participant_id`, title ``Take-or-pay claim available: R${amount.toLocaleString()} (${period})``, body `{ppa_id, period_month, take_or_pay_amount_zar}`, cross_option `{action_label:'Review claim', target_route:'/ipp-lifecycle/workstation?tab=take-or-pay-claims'}`, `priority:'high'`.
  - Rule `ppa_delivery_shortfall.shortfall_to_generator`: match `offtaker.obligation_shortfall`; resolve generator; dedup; push `priority:'normal'`, title ``PPA delivery shortfall flagged (${period})``, body `{ppa_id, period_month, shortfall_mwh, cure_deadline_at}`, same cross_option, `sla_due_at` = cure_deadline_at when present.
  - Use `dstr`/`dnum` from `../utils/cascade-data`; `CHAIN_KEY='ppa_delivery_shortfall'`.
  - Export `registerPpaDeliveryShortfallRules()` + `__ppaDeliveryShortfallRulesForTest()`.
  - Register in `index.ts` (import + call + re-export).

- [ ] **Step 4: Run test, verify GREEN.**

- [ ] **Step 5: Commit** `feat(cascade): push take-or-pay claim + shortfall to generator inbox`.

### Task 2: Surface the take-or-pay chain on the IPP workstation

**Files:**
- Modify: `pages/src/components/pages/IppWorkstationPage.tsx`

- [ ] **Step 1: Import** `TakeOrPayChainTab` from `../take-or-pay/TakeOrPayChainTab`.
- [ ] **Step 2: Add tab** in the Finance group: `{ key: 'take-or-pay-claims', label: 'Take-or-pay claims', group: 'Finance', body: () => <TakeOrPayChainTab /> }`. The key MUST equal the cross_option route's `?tab=` value.
- [ ] **Step 3: Verify** `npm run check:pages` (tsc) clean + `cd pages && npm run build`.
- [ ] **Step 4: Commit** `feat(ipp-ui): surface take-or-pay claims tab on the IPP workstation`.

### Verification
- [ ] Backend tsc (`npm run check`) clean.
- [ ] SPA tsc + build clean.
- [ ] Full vitest green.
- [ ] Code-quality reviewer over the Wave C diff; apply [Important]+ fixes.
- [ ] Relay Wave C boundary status.
