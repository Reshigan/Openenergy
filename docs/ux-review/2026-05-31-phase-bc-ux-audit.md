# Phase B+C UX Audit (W118-W122)

**Date:** 2026-05-31
**Scope:** 5 waves (W118 audit chain → W122 SCADA connector) across Admin / Regulator / GridOps / IPP workstations
**Method:** 8-point UX revisit pass (see `feedback_per_wave_ux_revisit.md`) applied to each wave's mounted tab
**Status:** read-only static code audit; no source files edited

## Workstation density baseline

| Workstation | Tab count | Page file |
|---|---:|---|
| Admin     | 10 | `open-energy-platform/pages/src/components/pages/AdminWorkstationPage.tsx` |
| Regulator | 13 | `open-energy-platform/pages/src/components/pages/RegulatorWorkstationPage.tsx` |
| GridOps   | 11 | `open-energy-platform/pages/src/components/pages/GridOpsWorkstationPage.tsx` |
| IPP       | 30 | `open-energy-platform/pages/src/components/pages/IppWorkstationPage.tsx` |

**Density flags**
- **IPP at 30 tabs is a P0 density risk.** No sectioning, no grouping; horizontal scroll territory on 1440px. Several duplicates also present: `submittals` (W115 mount) + `submittal_rfi` (legacy combined RFI/submittal mount); `change-orders` (W117) + `change_orders` (legacy EVM mount); `rfis` (W116) + `submittal_rfi`. Lines 56-66 of `IppWorkstationPage.tsx`.
- **Regulator at 13 tabs is amber.** Three "enforcement" tabs in a row (legacy `enforcement` events + ERA s35 chain + s35 lifecycle) read as duplicates to a regulator's eye.
- **Admin at 10, GridOps at 11 are within the >12 trip-wire** but each carries `(W118)` / `(W119)` / `(W120)` / `(W121)` / `(W122)` parenthetical suffixes in the tab labels — that's wave-process leak (see cross-wave theme #1).

## Per-wave findings

---

### W118 — Audit chain

**Tab:** "Audit chain (W118)" — mounted on Admin only (`AdminWorkstationPage.tsx:59`). No regulator mount (regulator gets read-only via `external-controls` / `icfr-attestations` / `regulator-exports`; W118 ledger is admin-write-only by design).
**Source:** `open-energy-platform/pages/src/components/audit/AuditChainBlockTab.tsx`

**1. Discoverability — FIX.** Label leaks wave number. "Audit chain (W118)" should read "Tamper-evident audit chain" to a CFO/auditor. Compare to neighbour tab "Platform audit" — same workstation but no wave suffix.
**2. KPI ordering — PASS (best-in-cohort).** Top-3 = Sig-chain breaks / Emergency-sealed / Quarterly due (actionable-LEFT). SLA breached is position 4. Total is position 6. This is the right order. See `AuditChainBlockTab.tsx:582-590`.
**3. Filter pill economy — FIX.** Row 1 = 12 action pills (OK), Row 2 = 20 lifecycle+tier pills (lifecycle 14 + tiers 5 + 1 boundary) — total 32. Tiers should collapse behind "More filters" or move into a third row labelled "Cadence/tier". Sub-KPI strip below KPIs ALSO carries 28 inline metric chips (`AuditChainBlockTab.tsx:593-622`) — that's a third dense row competing for attention.
**4. Drawer hierarchy — PASS.** Header has identity + state + tier + escalation; LIVE 24-field battery comes next (correct: "numbers that matter NOW"); cryptographic spine / bridges / reconciliation / floor flags / reasons in order; actions and timeline last. This is the gold-standard pattern for the other waves to follow.
**5. Action density — FIX.** Up to **6 visible buttons** in worst case (primary + suspend + restate + fork + reject + emergency-seal — see `AuditChainBlockTab.tsx:983-1013`). Per checklist >4 actions must group rare/danger ones under kebab. Suggest: keep primary + suspend; group `restate / fork / reject / emergency-seal` under a red kebab labelled "Hardline actions".
**6. Cross-tab consistency — FIX.** This tab uses `window.prompt()` / `window.confirm()` for every action input (lines 472-545). Neighbour Admin tabs (`TenantTab`, `BillingTab`, `FlagsTab`) use `ActionModal` from `WorkstationShell`. Regression vs the established admin pattern.
**7. Empty state — PASS.** `AuditChainBlockTab.tsx:736` renders "No audit blocks match." inside the table row when filter yields zero.
**8. Hero CTA — PASS.** Admin launch-board workflow `audit_chain` exists at `src/routes/launch.ts:1397` pointing at `/admin-platform/workstation?tab=audit-chain`. CTA label "Open audit chain" is correct.

**Concrete fix list**
- Rename tab to `"Tamper-evident audit chain"` and drop `(W118)` suffix (`AdminWorkstationPage.tsx:59`).
- Move tier pills (5) into a third row or collapse behind a "More filters" disclosure (`AuditChainBlockTab.tsx:235-255, 642-656`).
- Collapse the 28-chip sub-KPI strip into a single expandable "Show breakdown" disclosure (`AuditChainBlockTab.tsx:593-622`).
- Replace `window.prompt` / `window.confirm` flows with `ActionModal` for consistency with the rest of admin (`AuditChainBlockTab.tsx:468-545`).
- Group {restate, fork, reject, emergency-seal} under a "Hardline actions" kebab in the drawer (`AuditChainBlockTab.tsx:993-1013`).

---

### W119 — Regulator exports

**Tabs:** "Regulator exports (W119)" on Admin (`AdminWorkstationPage.tsx:62`) and "Incoming exports (W119)" on Regulator (`RegulatorWorkstationPage.tsx:67`).
**Source:** `open-energy-platform/pages/src/components/regulatorExport/RegulatorExportPackTab.tsx`

**1. Discoverability — FIX.** Both labels carry `(W119)` suffix. Admin label "Regulator exports" reads fine to a CFO; regulator label "Incoming exports" is good (action-framed) but the suffix breaks the illusion. Drop suffixes.
**2. KPI ordering — FIX.** Top-3 = **Total / Active / Lodged** (`RegulatorExportPackTab.tsx:614-616`). All three are raw counts. SLA breached is at position 6, Rejected at position 5. Per checklist top-3 must be numbers the user opens the workstation FOR — for an admin operating a regulator-export pipeline that's "Reportable" + "SLA breached" + "Rejected" (the things blocking lodgement). Current ordering buries them.
**3. Filter pill economy — FIX.** 12 (action) + 20 (lifecycle+tiers) + 10 (regulator targets) = **42 pills across 3 rows.** Targets row (NERSA/IPPO/SARB/DMRE/FSCA/DFFE/DTI/JSE/SARS/CIPC) likely doesn't fit on 1440px in one row. Consider a single select dropdown for targets, or collapse the lifecycle row behind "More filters" by default and surface only the top 6 action pills above the fold.
**4. Drawer hierarchy — PARTIAL FIX.** Has a 5-card mini-KPI battery at the top (`RegulatorExportPackTab.tsx:893-897`) which is good. However regulator-view uses the same dense drawer as the admin author-view; a read-only regulator inbox should hide author-side fields (assembly progress, internal QA notes) and lead with `lodged_at` / `SLA remaining to ack` / `Ack/Reject buttons`. Drawer doesn't currently fork its hierarchy by `regulatorView`.
**5. Action density — PASS.** Primary + suspend + restate + withdraw + reject + ack = up to 5; but in regulator-view only ack/archive/reject render — clean. See `RegulatorExportPackTab.tsx:950-958`.
**6. Cross-tab consistency — FIX.** Uses `ActionModal`-style inline prompts via `act` callback (better than W118), but the KPI strip ordering diverges from neighbour Regulator chain tabs (`EnforcementActionS35ChainTab.tsx:380-387` leads with SLA breached + Strategic tier + Appeals open — actionable LEFT). W119 leads with Total. Regression.
**7. Empty state — PASS.** "No packs match." at `:788`.
**8. Hero CTA — PASS.** Admin `regulator_exports` (`launch.ts:1400`) + regulator `incoming_exports` (`launch.ts:1216`) both wired with clear CTA labels.

**Concrete fix list**
- Rename Admin tab to `"Regulator export packs"`; Regulator tab to `"Incoming export packs"` (drop W119) (`AdminWorkstationPage.tsx:62`, `RegulatorWorkstationPage.tsx:67`).
- Reorder KPIs to: Rejected / SLA breached / Reportable / Lodged / Acked / Active / Total / Floor flags (`RegulatorExportPackTab.tsx:614-621`).
- Move target-regulator pills into a `<select>` dropdown OR a collapsible third-row disclosure (`RegulatorExportPackTab.tsx:277-289, 688-704`).
- Fork drawer hierarchy on `regulatorView`: lead with lodged-at + countdown-to-ack + ack/reject CTAs; hide author-side internal-QA fields.

---

### W120 — Reconciliation attestation

**Tabs:** "Reconciliation attestation (W120)" on Admin (`AdminWorkstationPage.tsx:65`) and "ICFR attestations (W120)" on Regulator (`RegulatorWorkstationPage.tsx:70`).
**Source:** `open-energy-platform/pages/src/components/reconciliation/ReconciliationAttestationTab.tsx`

**1. Discoverability — FIX.** "Reconciliation attestation" is clear; "ICFR attestations" is clear to a regulator. Both carry `(W120)` suffix — drop.
**2. KPI ordering — FIX.** Top-3 = **Total / Active / Signed** (`ReconciliationAttestationTab.tsx:654-656`). Same regression as W119 — raw counts up front. "Escalated AC" (the SIGNATURE signal of this chain) is at position 6; "SLA breached" at 7. For a CFO running attestation, top-3 should be Escalated-to-AC / SLA breached / Rejected.
**3. Filter pill economy — FIX.** 12 (action) + 16 (lifecycle) + 5 (cadence) = **33 pills across 3 rows.** Action row at 12 includes 5 different "flag" filters (reg_audit, cross_border, material_var, icfr_def, ext_auditor) that overlap conceptually with the lifecycle pills. Group "flag" filters into a second action row or a "Flags" disclosure.
**4. Drawer hierarchy — PARTIAL FIX.** 4-card mini-KPI battery (`:919-922`) at the top is good. Same regulator-view fork issue as W119 — drawer doesn't downgrade detail level for read-only regulator.
**5. Action density — PASS.** Primary + suspend + restate + reject + escalate-to-AC = 5 (`:1002-1006`). At the threshold; if "lift-escalation" is also possible (it is, from `escalated_to_audit_committee`), that's 6. Group the danger trio (reject / restate / escalate-to-AC) under a single danger kebab.
**6. Cross-tab consistency — FIX.** Same KPI-ordering regression as W119. Inside Admin workstation, neighbour `BillingTab` has 6 columns visible; this tab dumps 33 pills + table. Density delta within the same workstation is jarring.
**7. Empty state — PASS.** "No attestations match." at `:822`.
**8. Hero CTA — PARTIAL FIX.** Admin has `reconciliation_attestation` workflow (`launch.ts:1405`) — good. Regulator launch board has NO ICFR-attestations workflow card, even though the regulator workstation mounts the tab. Quarterly cadence so tab presence is defensible, BUT the regulator needs to know it's there. Either add a launch-board workflow card for the regulator OR add a hero KPI showing count of attestations awaiting regulator inspection.

**Concrete fix list**
- Rename tabs to `"Reconciliation attestation"` (Admin) and `"ICFR attestations"` (Regulator), drop `(W120)` (`AdminWorkstationPage.tsx:65`, `RegulatorWorkstationPage.tsx:70`).
- Reorder KPIs to: Escalated AC / SLA breached / Rejected / Signed / Archived / Active / Total / Floor flags (`ReconciliationAttestationTab.tsx:654-661`).
- Group {reg_audit, cross_border, material_var, icfr_def, ext_auditor} action pills behind a "Flags" disclosure (`ReconciliationAttestationTab.tsx:246-260, 694-708`).
- Add regulator launch-board workflow `incoming_icfr_attestations` pointing to `/regulator-suite/workstation?tab=icfr-attestations` (`src/routes/launch.ts` regulator block around line 1216).
- Group {reject, restate, escalate-to-AC, lift-escalation} under a danger kebab (`ReconciliationAttestationTab.tsx:1003-1006`).

---

### W121 — Control-environment audit

**Tabs:** "Control environment (W121)" on Admin (`AdminWorkstationPage.tsx:68`) and "External controls (W121)" on Regulator (`RegulatorWorkstationPage.tsx:73`).
**Source:** `open-energy-platform/pages/src/components/controlEnvironment/ControlEnvironmentAuditTab.tsx`

**1. Discoverability — FIX.** "External controls" is misleading on the regulator side — these are the licensee's INTERNAL controls that the regulator is INSPECTING. "Control inspections" or "Licensee controls" reads more correctly. Also drop `(W121)`.
**2. KPI ordering — FIX.** Top-3 = **Total / Active / Archived** (`ControlEnvironmentAuditTab.tsx:676-678`). Same systemic regression. For an auditor opening this tab, top-3 should be Material weak / Deficient / SLA breached. Material weakness is currently position 5; SLA breached position 7. The signature signal of this chain (`flag-deficient`) has its KPI buried.
**3. Filter pill economy — FIX (WORST IN COHORT).** 12 (action) + 16 (lifecycle) + 5 (classification) + **14 (framework)** = **47 pills across 4 rows.** The framework row alone (COSO/SOC2 TSC/ISO 27001/ISO 27002/NIST CSF 2.0/NIST SP 800-53/CMMC L3/COBIT 2019/ITIL 4/CIS v8/SOX 404/POPIA/King IV/JSE SRL 8.62) is 14 wide and will wrap 3+ rows on 1440px. Framework filter must be a select dropdown, not pills. Classification should also collapse.
**4. Drawer hierarchy — PARTIAL FIX.** 4-card mini-KPI battery in drawer (`:979-982`) — good. Same regulator-view fork weakness — no downgrade for read-only audience.
**5. Action density — FIX.** Primary + retest + suspend + accept-w/-exception + flag-deficient = 5 (`:1064-1068`). Add resume-from-suspend + lift-exception + reject (likely present) and this can hit 7-8. The mix of warn-tone actions (retest, suspend, accept-w/-exception) means the SIGNATURE action "FLAG DEFICIENT" doesn't visually stand out enough. Group warn actions, keep flag-deficient as a single red primary-danger.
**6. Cross-tab consistency — FIX.** Same KPI-ordering and pill-economy regression. Inside Regulator workstation it sits next to a simple `InboxTab` / `NoticesTab` (visual whiplash).
**7. Empty state — PASS.** "No controls match." at `:868`.
**8. Hero CTA — FIX.** Neither Admin nor Regulator launch board has a Control-environment workflow card. SOC2/ISO27001 surveillance audits are annual+ cadence so per-checklist tab-presence is enough... HOWEVER a deficient control IS high-frequency action: every SOC2 Type II audit cycle has dozens of test events. Need at least a regulator launch KPI: "Open licensee deficiencies".

**Concrete fix list**
- Rename to `"Control environment"` (Admin) and `"Licensee control inspections"` (Regulator); drop `(W121)` (`AdminWorkstationPage.tsx:68`, `RegulatorWorkstationPage.tsx:73`).
- Reorder KPIs: Material weak / Deficient / SLA breached / Excepted / Archived / Active / Total / Floor flags (`ControlEnvironmentAuditTab.tsx:676-683`).
- Convert framework filter (14 pills) into a `<select>` dropdown; collapse classification filter behind "More filters" (`ControlEnvironmentAuditTab.tsx:291-308, 769-784`).
- Group {retest, suspend, accept-w/-exception, lift-suspend} under a warn kebab; keep flag-deficient as the sole danger primary.
- Add admin launch-board workflow `control_environment` + a regulator KPI `licensee_deficiencies_open` (`src/routes/launch.ts` admin ~1405-1407 + regulator ~1200-1205).

---

### W122 — SCADA / IEC 61850 connector

**Tabs:** "SCADA connectors (W122)" on GridOps (`GridOpsWorkstationPage.tsx:59`) and on IPP (`IppWorkstationPage.tsx:76`).
**Source:** `open-energy-platform/pages/src/components/scadaConnector/ScadaConnectorTab.tsx`

**1. Discoverability — FIX.** Label `"SCADA connectors (W122)"` reads OK to a grid engineer; for an IPP developer it reads as ops/SO territory. Suggest `"Plant SCADA bridges"` on the IPP side. Drop `(W122)` everywhere.
**2. KPI ordering — FIX.** Top-3 = **Total / Active / Live** (`ScadaConnectorTab.tsx:570-572`). Same systemic regression — Revoked is position 4, Disconnected at 5, SLA breached at 7. For a grid operator the most critical visible number is cert expiring < 14d AND SLA breached AND disconnected (anything that means the bridge is degraded NOW). Cert <60d / <14d are buried in the secondary drill-rail at `:579-580`.
**3. Filter pill economy — FIX.** 12 (action) + 15 (lifecycle) + 5 (tiers) + 9 (protocols) = **41 pills across 4 rows.** Protocol pills should be a `<select multiple>` or a chip cluster behind "More filters". Tier row could merge into action row as a "Tier:" prefix group.
**4. Drawer hierarchy — PARTIAL FIX.** 4-card mini-KPI battery (`:857-860`) — good. Has identity + state at top, LIVE battery + cert + flags + audit timeline. Hierarchy correct. The 24-field LIVE battery is well-structured.
**5. Action density — FIX.** Primary + suspend/resume + failover + disconnect + revoke = 5-6 in worst case (`:956-961`). Disconnect + revoke are both danger; failover is amber. Group {disconnect, revoke} under a "Take offline" danger kebab; keep primary + failover + suspend visible.
**6. Cross-tab consistency — PARTIAL PASS.** KPI label cadence ("SLA breached" / "Telemetry avg" with `/130` denominator) matches the neighbour `TransmissionOutageChainTab` / `ImbalanceSettlementChainTab` (which also use `/130` for completeness/integrity). Action button style matches. But KPI **ORDERING** still diverges — neighbour Grid chain tabs lead with SLA breached, this tab leads with Total.
**7. Empty state — PASS.** "No connectors match." at `:753`.
**8. Hero CTA — PASS.** Both Grid (`launch.ts:1125`) and IPP (`launch.ts:741-748`) launch boards have SCADA-connector workflows with detailed descriptions. Excessive description copy in IPP workflow (`launch.ts:744`) is jarring — it dumps the full wave spec into the workflow card. Trim.

**Concrete fix list**
- Rename to `"SCADA connectors"` on GridOps and `"Plant SCADA bridges"` on IPP; drop `(W122)` (`GridOpsWorkstationPage.tsx:59`, `IppWorkstationPage.tsx:76`).
- Reorder KPIs: Disconnected / Revoked / Cert <14d / SLA breached / Failover / Live / Active / Total (`ScadaConnectorTab.tsx:570-577`).
- Convert protocol filter (9 pills) into a `<select multiple>` or chip cluster behind "More filters" (`ScadaConnectorTab.tsx:250-260, 657-670`).
- Group {disconnect, revoke} under "Take offline" danger kebab in drawer (`ScadaConnectorTab.tsx:960-961`).
- Trim IPP launch-board workflow description from ~700 chars to ~140 chars (`src/routes/launch.ts:744`).

---

## Cross-wave themes

**Theme 1 — Wave numbers leak into UX (P0 systemic).** Every single mounted tab carries `(W118)` / `(W119)` / `(W120)` / `(W121)` / `(W122)` suffix in its label. This is process leakage. A CFO opening "Regulator exports" does not need to know it's wave 119. The suffix shipped because the wave-dispatch prompt scaffolds the tab label from the wave name. Remove from all 7 tab mountings: `AdminWorkstationPage.tsx:59,62,65,68` + `RegulatorWorkstationPage.tsx:67,70,73` + `GridOpsWorkstationPage.tsx:59` + `IppWorkstationPage.tsx:76`.

**Theme 2 — KPI strip leads with "Total / Active" not actionables (P0 systemic).** W119, W120, W121, W122 all lead with **Total / Active / [lifecycle-count]**. Compare to W118 (correctly leads with Sig-chain breaks / Emergency-sealed / Quarterly due) and neighbour Phase-A chain tabs (`EnforcementActionS35ChainTab` / `TransmissionOutageChainTab` / `ImbalanceSettlementChainTab` all lead with SLA breached). This is a regression from the Phase-A pattern. Every Phase-B tab inherited the same lifecycle-count-first scaffold. **Fix: top-3 KPIs MUST include actionable signals (sla_breached / sig-break / reportable / deficient / disconnected), never raw row counts.**

**Theme 3 — Pill economy violated by 30+ filter pills per tab (P1 systemic).** Pill counts in this cohort: W118 32 / W119 42 / W120 33 / W121 47 / W122 41. The 8-point rubric caps at 15 with grouping; 30+ blows past two rows on a 1440px viewport. Frameworks, protocols, and regulator-targets are EACH always best as a `<select>` not pills. Default action row should be 8-10 pills max.

**Theme 4 — Drawer fails to fork on `regulatorView` (P1 systemic, except W118).** W119, W120, W121, W122 all accept `regulatorView` and gate action buttons, BUT do not downgrade the drawer's information hierarchy — the regulator sees the same author-side LIVE battery and assembly fields as the admin who built the pack. Should lead with lodged_at + SLA-to-ack + ack/reject (regulator-actionable surface).

**Theme 5 — Action density routinely hits 5-6 (P1).** Every Phase-B drawer has primary + 4-5 secondary buttons rendered as a flex-wrap. >4 per checklist means group rare/danger ones. Phase-A chain tabs use a single primary + kebab; Phase-B regressed to flat button row.

**Theme 6 — W118 uses `window.prompt` instead of `ActionModal` (P1 isolated).** Only W118 — but it's the platform-spine wave so the regression is loud. Other Admin tabs already use `ActionModal`; W118 should be migrated for consistency.

**Theme 7 — IPP workstation tab explosion (P0 structural).** 30 tabs with no grouping is unusable. Several duplicate-coverage tabs (`submittals` + `submittal_rfi`, `change-orders` + `change_orders` + `submittal_rfi` covering RFIs twice). Needs tab-grouping (e.g. "Schedule" / "Quality" / "Risk & HSE" / "Bridges & connectors" sections) or migration to a Workstation v2 layout with secondary nav.

**Theme 8 — Hero CTAs miss on regulator side for W120 + W121.** Regulator launch board lacks `incoming_icfr_attestations` (W120) and `licensee_deficiencies_open` (W121) workflow cards. Tab presence alone makes them invisible.

## Top-10 prioritised fix list (across all 5 waves)

1. **(All waves)** Strip `(W118)` / `(W119)` / `(W120)` / `(W121)` / `(W122)` from all 7 tab labels — `AdminWorkstationPage.tsx` 59/62/65/68 + `RegulatorWorkstationPage.tsx` 67/70/73 + `GridOpsWorkstationPage.tsx` 59 + `IppWorkstationPage.tsx` 76.
2. **(W119/W120/W121/W122)** Reorder all KPI strips so top-3 are actionable signals (SLA breached / reportable / deficient / disconnected / sig-break), never `Total` or raw lifecycle counts.
3. **(IPP workstation)** Section the 30 IPP tabs into ≤4 grouped sections OR collapse legacy duplicates: remove `submittal_rfi` (covered by `submittals` + `rfis`), remove `change_orders` (covered by `change-orders`).
4. **(W121)** Convert the 14-pill framework filter into a `<select>` and the 5-pill classification into a "More filters" disclosure (`ControlEnvironmentAuditTab.tsx:291-308`).
5. **(W119)** Convert the 10-pill regulator-target row into a `<select multiple>` (`RegulatorExportPackTab.tsx:277-289`).
6. **(W122)** Convert the 9-pill protocol row into a `<select multiple>` or chip cluster (`ScadaConnectorTab.tsx:250-260`).
7. **(W118)** Migrate `window.prompt` / `window.confirm` flows to `ActionModal` to match the rest of admin (`AuditChainBlockTab.tsx:468-545`).
8. **(W119/W120/W121/W122)** Fork the drawer hierarchy on `regulatorView`: lead with lodged_at + SLA-to-ack + ack/reject; suppress author-side assembly fields.
9. **(W120, W121)** Add regulator launch-board workflow cards `incoming_icfr_attestations` and `licensee_control_inspections` (`src/routes/launch.ts` regulator block around line 1216).
10. **(W118/W120/W121)** Group {reject, restate, fork, emergency-seal, escalate-to-AC, flag-deficient} danger actions under a single red "Hardline" kebab per drawer.

## Recommendation: ship-recipe patch

Add the following addenda to the wave-dispatch prompt so the regressions self-correct from the next wave:

> **(SPA tab generation step)**
> - The tab label MUST NOT include the wave number. If you reach for `(WNNN)` suffix, that's a sign you don't have a 2-4 word natural-language name yet — derive one from the entity ("Reserve account", "Loan transfer", "Crediting period renewal").
> - The top-3 KPIs in the KPI strip MUST include the SLA-breached count if any. Never lead with `total`. Default ordering: `[primary actionable] / [SIGNATURE breach signal] / sla_breached / [authority-required] / archived / active / total / [aggregate index]`.
> - Filter pills in the action row are capped at 10. Frameworks, protocols, target-regulators, classifications must be `<select>` (single or multiple), not pills.
> - Drawer action density: 1 primary visible + max 1 amber/warn + max 1 danger. All remaining transitions (suspend/restate/reject/fork/emergency-seal/escalate) go under a single kebab labelled "Hardline actions".
> - If the tab supports `regulatorView`, the drawer's TOP section MUST swap to a regulator-actionable summary (lodged_at + countdown to ack + ack/reject CTAs) and SUPPRESS author-side build/QA fields.

> **(Launch-board integration step)**
> - After mounting a new tab, BEFORE marking the wave done, verify the role's launch board hero has a workflow card pointing at `/<role>/workstation?tab=<key>`. If frequency is monthly+ → workflow card required; if quarterly+ → at minimum a hero KPI.

## What to NOT change

- **W118 audit chain has no `regulatorView` prop and no regulator workstation mount — intentional.** The block-write authority is admin-only; regulators verify externally via the public `/api/audit-chain/verify/:block_height` endpoint (no auth required). Do not "add a regulator tab".
- **W118 KPI ordering (Sig-chain breaks / Emergency-sealed / Quarterly due) is the GOLD standard for this cohort.** Don't change W118 ordering when fixing W119-W122.
- **Regulator-side action button hiding via `regulatorView` is correct.** The "no danger buttons" appearance on the regulator side is the read-only-by-design pattern, not a regression.
- **W122 LIVE 24-field battery in drawer is exemplary — leave the battery layout alone, only fix the KPI strip above it.**
- **The `(W118)` etc. suffix is acceptable IN COMMENTS at the top of each tab file** (useful for code archaeology). Only the user-facing tab labels need to drop the suffix.
