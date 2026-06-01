# W131 UX REVISIT SWEEP — SHIP BRIEF

PHASE E WAVE 1 OF 5. UI-only catch-up sweep of 9 workstation pages + ~80 chain tabs accumulated since per-wave UX revisit was suspended at W31. NO migrations, NO routes, NO behaviour changes.

## Out-of-scope
- Chrome unification (WorkstationShell vs SuitePage vs StitchPage)
- Visual rebrand / colour / typography
- `pages/src/ux-alternatives/` tree (exploration track — protected)
- `pages/src/components/pages/EsumsOmPage.tsx` (SuitePage chrome — separate W141 candidate)

## Scope: 9 pages × ~80 chain tabs
Top offenders by filter-pill count:
| Tab | Pills | KPIs | Fix |
|---|---|---|---|
| IppChangeOrderChainTab | 36 | 8 | FilterPillGroup |
| IppRfiChainTab | 32 | 8 | FilterPillGroup |
| LoanRestructureChainTab | 31 | 21 | Both — KPI trim to 8 |
| IppSubmittalChainTab | 30 | 8 | FilterPillGroup |
| IppDocumentControlChainTab | 27 | 8 | FilterPillGroup |
| ImbalanceSettlementChainTab | 27 | 8 | FilterPillGroup |
| TransmissionOutageChainTab | 27 | 8 | FilterPillGroup |
| EnforcementActionS35ChainTab | 27 | 8 | FilterPillGroup |
| PnlAttributionChainTab | 27 | 8 | FilterPillGroup |
| IppEvmChainTab | 26 | 8 | FilterPillGroup |
| HandoverDossierChainTab | 22 | 20 | KPI trim to 8 |
| CcpAssessmentChainTab | 24 | 17 | Both |
| CarbonIssuanceChainTab | 23 | 17 | Both |
| DscrMonitoringChainTab | 23 | 16 | KPI trim |

Plus ~50 chain tabs with 15-21 pills get same `<FilterPillGroup>` wrap.

## 8-point UX audit (every chain tab)
1. KPI strip leads Total → Active → Lifecycle, then phase-counts, breach signals LAST
2. Filter pills >12 → `<FilterPillGroup overflowAfter={8}>` ("+N more")
3. Tab labels gain ` (W##)` suffix mapped from MEMORY wave-index
4. Drawer >6 stacked buttons → primary forward + "More ▾" disclosure
5. lucide-react icon on each primary action (ArrowRight/Check/X/AlertTriangle/Clock/FileSearch)
6. ListingTable `pageSize?: number` default 50 + "Load 50 more" footer
7. Tab-label tone consistency (`cost-evm` → `'Cost & EVM (W##)'`)
8. ARIA: `role="tab"`/`aria-selected` on WorkstationShell nav, `aria-label="Close drawer"` on drawer close-buttons

## Coordinated patch — 5 pattern-edits

### Pattern A — `pages/src/components/ux/KpiStrip.tsx` (NEW)
```tsx
export type KpiCell = { label: string; value: number | string; tone?: 'ok'|'warn'|'bad'; };
export function KpiStrip({ lead, breach, secondary }: {
  lead: KpiCell[];        // 1-4 cells: Total / Active / Lifecycle
  breach?: KpiCell[];     // 1-2 cells, rendered LAST in strip
  secondary?: KpiCell[];  // overflow row below — dense text not boxes
}) { /* ... */ }
```
Refactor top-10 highest-traffic chain tabs onto it.

### Pattern B — `pages/src/components/ux/FilterPillGroup.tsx` (NEW)
```tsx
export type Pill = { key: string; label: string; ux_audit?: boolean };
export function FilterPillGroup({ pills, value, onChange, overflowAfter = 8 }: { ... }) { /* ... */ }
```
Wrap-edit ~30 chain tabs with >20 pills. Rare filters marked `ux_audit: true`.

### Pattern C — Tab-label normalisation
Grep-and-replace pass across 9 workstation pages. Map waves to `(W##)` suffix from MEMORY index.
```diff
- { key: 'ppa_contract', label: 'PPA contracts', body: () => <PpaContractChainTab /> },
+ { key: 'ppa_contract', label: 'PPA contracts (W22)', body: () => <PpaContractChainTab /> },
```

### Pattern D — `WorkstationShell.ListingTable` pagination + ARIA
- Add `pageSize?: number` (default 50) + "Load 50 more →" footer
- Replace tab `<nav>` buttons with `role="tab"`/`aria-selected` pattern (keep `role="tablist"`)

### Pattern E — Drawer action disclosure (≤6 buttons rule)
Touch ~12 chain tabs whose drawers stack 5+ actions:
```tsx
<div className="flex flex-wrap gap-2">
  {nextAction && <PrimaryActionButton ... />}
  {moreActions.length > 0 && <ActionMenu items={moreActions} />}
</div>
```
Affected: CreditOriginationChainTab, LoanDefaultChainTab, LoanRestructureChainTab, ProcurementChainTab, CodChainTab, PpaTerminationChainTab, PpaChangeInLawChainTab, MrvChainTab, LicenceApplicationChainTab, LicenceRenewalChainTab, ComplianceInspectionChainTab, ProblemManagementChainTab.

## Files modified — ~63
- 2 NEW: `pages/src/components/ux/{KpiStrip,FilterPillGroup}.tsx`
- 1 EDIT: `pages/src/components/launch/WorkstationShell.tsx`
- 9 EDIT: every `pages/src/components/pages/*WorkstationPage.tsx`
- ~30 EDIT: chain tabs with >20 filter pills
- ~10 EDIT: chain tabs with >12 KPIs
- ~12 EDIT: chain tabs with >6 drawer actions

## NO migrations / NO routes / NO crons / NO wrangler.toml

## Wave-mounting gaps
- Mount `AnomalyDetectionMlTab` (W127) on Grid (IoT/anomaly)
- Mount `StrateSwiftConnectorTab` (W124) on Regulator (settlement-rail visibility)
- (MQTT/OPC-UA W123 on Esums = out-of-scope, SuitePage tree)

## Verify
```bash
npm run check && npm run check:pages   # both clean (no TS1382 / unused)
npm test                                # vitest backend untouched
cd pages && npm run build               # tree-shake catch
BASE=http://localhost:8787 npx playwright test tests/browser/workstations.spec.ts tests/browser/lender-dunning.spec.ts tests/browser/carbon-mrv-chain.spec.ts
```

## Screenshot diff list (top 10)
1. `/trader/workstation?tab=pretrade-credit`
2. `/lender/workstation?tab=credit_origination`
3. `/lender/workstation?tab=loan_restructure`
4. `/offtaker/workstation?tab=ppa_contract`
5. `/carbon/workstation?tab=ccp_assessment`
6. `/carbon/workstation?tab=carbon_issuance`
7. `/ipp/workstation?tab=cod`
8. `/grid/workstation?tab=imbalance-settlement`
9. `/admin/workstation?tab=control-environment-audit`
10. `/regulator/workstation?tab=enforcement-action-s35`
Drop 20 before/after PNGs in PR body.

## Commit message
`feat(w131): platform-wide UX revisit sweep — KpiStrip/FilterPillGroup primitives, label normalization, pagination, drawer disclosure`

## Gotchas
- TS1382 `->` in JSX → use `→` (U+2192) or `&rarr;`
- Protected tree: `pages/src/ux-alternatives/` no edits
- Tests rely on `getByRole('tab', { name: /…/ })` — append " (W##)" so substring still matches; don't reword the noun
- `login_or_cached admin@openenergy.co.za` FULL email
- Demo password `Demo@2024!` exact
- No prod-verify, no curl — UI-only sweep; PNG diffs are the deliverable
- CF edge cache `_headers` already `no-store` (covers new bundle)
- `WorkstationShell.tsx:91-92` `densityState`/`themeFor` calls must stay unconditional
- Esums `EsumsOmPage.tsx` SuitePage chrome — out of scope
