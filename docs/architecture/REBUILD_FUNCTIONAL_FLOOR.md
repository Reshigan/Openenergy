# Rebuild — Functional Floor

> **The contract of this document.** The rebuild is permitted to change *where* a
> capability lives and *what it is called*. It is not permitted to lose one.
> Every one of the 356 route modules in `src/routes/` is accounted for below:
> 148 chain modules and 208 support modules. If a capability is not on this page,
> the rebuild has no licence to delete it.
>
> Companions: [REBUILD_PLAN.md](REBUILD_PLAN.md) (backend, L0–L6) ·
> [REBUILD_FRONTEND.md](../design/REBUILD_FRONTEND.md) (four surfaces).
> This document assumes both.

---

## 0. The four landing zones

Everything the platform does today lands in exactly one of four places. The
zones are not UI categories — they are statements about *what kind of thing*
the capability is.

| Zone | What it means | Where the user meets it |
|---|---|---|
| **T — Transaction** | It has parties, states, and transitions. It is a `ChainDecl`. | `/t/:human_ref`, initiated from Find, queued on Home |
| **F — Finding** | A machine produced an assertion that a human must act on. | A row on somebody's Home queue, with `caused_by` pointing at the scan |
| **R — Read-only render** | A custom presentation over the event log or telemetry. No input. | A tab on a Transaction, or a route off Home |
| **S — Settings / reference** | Configuration, master data, or a `reference_value` row. | `/settings/*`, admin-scoped |

**A capability may land in two zones.** `ipp-evm` is an S-curve (**R**) *and* a
variance-approval workflow (**T**). That is not ambiguity; it is the correct
answer, and the current system's mistake was building one route module that
tried to be both.

**The disposition column below is a claim that must survive extraction.** Every
`T` says: this chain has a real state machine hiding inside its
`src/utils/<key>-spec.ts`, and the extractor will find it. Every `S` and `R`
says: this chain has *no* state machine, and the `status` column on its table
was cargo-culted. Both claims are falsifiable. P2 of the cutover
([REBUILD_PLAN.md §11](REBUILD_PLAN.md)) is where they get tested, one spec at
a time, by reading `isTerminal()`.

---

## 1. The 148 chains

Legend: **T** Transaction · **F** Finding · **R** Read-only render ·
**S** Settings/reference · **★** pilot six (P1) · **📱** tested on a phone
every release. · **➕** net-new chain, not among the 148 legacy `*-chain.ts`
files — the extraction gate (§5) checks file→row, not row→file, so a declared
chain with no legacy file is allowed and flagged here.

**Multi-market note (REBUILD_PLAN.md §8.2):** this inventory is the *superset* of
static ChainDecls shipped in code. A deployment enables a subset via
`pack.enabled_chains`; the SA pack enables all of them, another market enables
fewer (or a different variant of the same chain, e.g.
`ppa_contract.regulator_approved` for Kenya). Dispositions below are
market-invariant — what varies per market is only which rows are switched on.

### Trading, clearing, risk (18)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `algo-cert` | T | Transaction | FSCA algo certification. Kill-switch is a `blocking` effect. |
| `best-execution` | R + T | Report render + attestation transaction | The report is a projection; the sign-off is an edge. |
| `ccp-assessment` | T | Transaction | CPMI-IOSCO PFMI. |
| `capital-adequacy` | T | Transaction | |
| `counterparty-margin` | T + F | Transaction; margin call is a Finding | `runMarginCallCycle` becomes a timer, not a cron. |
| `credit-insurance` | T | Transaction | |
| `cross-border-trade` | T | Transaction | SADC. |
| `fsca-compliance` | T | Transaction | |
| `fsca-conduct-report` | T | Transaction | |
| `isda-agreement` | T | Transaction | |
| `market-abuse` | T | Transaction | Opened by a surveillance Finding. |
| `market-conduct-exam` | T | Transaction | |
| `pnl-attribution` | R | Read-only render off Home | Nightly projection. No states. |
| `poslimit` | S | Settings + a named guard | A position limit is reference data a guard reads at pre-trade (S). **But editing the limit is itself a governed change:** the settings write is a two-person edge (proposer ≠ approver), audited to the log like any transition. S at read time, T-shaped at write time. Not a full chain — one `settings_change` mini-chain guards every risk-limit table. |
| `pretrade-credit` | S | Settings + a named guard | Same shape: the guard reads it (S), but a credit-line change routes through the same two-person `settings_change` edge. This module is a guard wearing a chain costume; the only part that transitions is the limit edit, not the trade check. |
| `settlement-fail` | T + F | Transaction; the break is a Finding | |
| `trade-allocation` | T | Transaction | |
| `trade-reporting` | T | Transaction | |

Order entry, the depth ladder, and the blotter are **not** in this table. They
are `/trade`, the one argued exception
([REBUILD_FRONTEND.md §5](../design/REBUILD_FRONTEND.md)). A *fill* is a
Transaction with a `human_ref` and a Transaction page.

### PPA and offtake (12)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `ppa-contract` ★ | T | Transaction | The canonical example. Pilot chain 1. |
| `ppa-annual-recon` | T + R | Transaction; reconciliation statement is a render | |
| `ppa-change-in-law` | T | Transaction | |
| `ppa-nomination` | T | Transaction | Day-ahead. Timer-driven. |
| `ppa-termination` | T | Transaction | |
| `virtual-ppa-settlement` | T + R | Transaction; settlement statement is a render | |
| `take-or-pay` | T | Transaction | |
| `green-tariff` | T | Transaction | |
| `tariff-determination` | T | Transaction | MYPD. Its terminal event writes a `reference_value` row. |
| `tariff-indexation` | S | `reference_value` + a compensating transition | CPI restatement is a new `recorded_at`, not a chain. See [REBUILD_PLAN.md §5](REBUILD_PLAN.md). |
| `availability-guarantee` | T | Transaction | |
| `curtailment-claim` | T | Transaction | |

### Grid (14)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `black-start` | T | Transaction | |
| `connection-energization` | T | Transaction | |
| `demand-response` | T | Transaction | |
| `eop-activation` | T | Transaction | Emergency operating procedure. |
| `export-curtailment` | T | Transaction | |
| `gca` | T | Transaction | Grid connection agreement. |
| `grid-capacity-allocation` | T | Transaction | |
| `grid-code-compliance` | T | Transaction | |
| `interconnector-schedule` | T | Transaction | |
| `load-curtailment` | T | Transaction | Load shedding. |
| `planned-outage` | T | Transaction | |
| `rez-capacity` | S + R | Reference data + a capacity render | A REZ has a headroom number, not a lifecycle. |
| `transmission-outage` | T | Transaction | |
| `wheeling-access` | T | Transaction | |
| `unserved-energy` | R + F | Render; each event above threshold is a Finding | |
| `reserve-activation` | T | Transaction | STOR. Freezes position limits as a `blocking` effect. |

### Project finance (17)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `drawdown` ★ | T | Transaction | Pilot chain 2. Already has an exact `isTerminal()`. |
| `covenant-certificate` | T | Transaction | |
| `covenant-breach` ➕ | T | Transaction | Opened when a `covenant-certificate` fails a test or `dscr-monitoring` crosses a threshold. `drive`s `loan-default` only if uncured within the FIDIC-style time-bar. Distinct chain: a breach has its own cure/waive/escalate states a certificate does not. |
| `credit-origination` | T | Transaction | |
| `disbursement` | T | Transaction | |
| `disposition` | T | Transaction | |
| `dscr-monitoring` | F | Finding on the lender's Home | A ratio crossing a threshold is not a workflow. |
| `dscr-report` | R | Read-only render | |
| `facility-amendment` | T | Transaction | |
| `green-bond` | T | Transaction | |
| `loan-default` | T | Transaction | **Not terminal.** A default is cured (→ `loan-restructure`), waived, or enforced (→ `security-perfection`); only enforcement-complete is terminal. The legacy `isTerminal()` marks `defaulted` terminal, which is wrong — a defaulted loan still transitions. P2 records `terminal: false` for `defaulted` and a human signs off the correction (R1). |
| `loan-restructure` | T | Transaction | |
| `loan-transfer` | T | Transaction | |
| `payment-security` | T | Transaction | |
| `reserve-account` | T | Transaction | Exact `isTerminal()` today. Cure is an edge. |
| `security-perfection` | T | Transaction | |
| `slb-kpi` | T | Transaction | Sustainability-linked bond. |
| `sll-kpi` | T | Transaction | Sustainability-linked loan. |
| `cp-clearance` | T | Transaction | Conditions precedent. |

### IPP lifecycle and construction (19)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `cod` | T | Transaction | Commercial operation date. Its terminal event drives drawdown + PPA activation. |
| `construction-cost-report` | R + T | Render; submission is an edge | |
| `handover-dossier` | T | Transaction | |
| `ipp-document-control` | T | Transaction | IDC matrix is a projection, not a nightly cron. |
| `ipp-evm` | R + T | S-curve render; variance approval is a Transaction | |
| `ipp-schedule` | R + T | Gantt render; baseline change is a Transaction | |
| `itp` | T | Transaction | Inspection & test plan. |
| `milestone-variance` | T | Transaction | |
| `procurement` | T | Transaction | |
| `project-change-order` | T | Transaction | Cumulative-pct cap band is a guard, not a cron. |
| `project-risk` | T | Transaction | |
| `punch-list` 📱 | T | Transaction | |
| `submittal-rfi` | T | Transaction | RFI aging is a timer. |
| `ed-commitment` | T | Transaction | REIPPPP economic development. |
| `cbt-sed` | T | Transaction | Socio-economic development. |
| `esap-compliance` | T | Transaction | |
| `esap-monitoring` | T | Transaction | |
| `gtia` | T | Transaction | |
| `poa-cpa-inclusion` | T | Transaction | |

The 55 `ipp-*` **non-chain** route modules (diary, NCR, TQ, force majeure,
lessons learned, …) are inventoried in §2 and mostly become chains that were
never registered as chains. That is the single largest concentration of the
"131 chains with no front door" problem.

### O&M, assets, HSE (20)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `wo` ★ 📱 | T | Transaction | Pilot chain 5. Work order. |
| `permit-to-work` ★ 📱 | T | Transaction | Pilot chain 6. OHSA. Gates `wo` dispatch as a `blocking` effect. |
| `hse-incident` 📱 | T | Transaction | |
| `asset-prognostics` | F | Finding on the O&M Home | RUL prediction. The ML output is an assertion, not a workflow. |
| `bess-soh` | R + F | Render over telemetry; degradation crossing is a Finding | |
| `dfr` | R + F | Render; a fault record is a Finding | Digital fault recorder. |
| `oem-fco` | T | Transaction | Field change order. |
| `planned outages` | — | (see Grid) | |
| `pm-compliance` | T | Transaction | |
| `pr` | R + F | Performance-ratio render; underperformance is a Finding | |
| `protection-relay` | S + T | Master data; a setting change is a Transaction | The relay is an object. Changing its setting is an act. |
| `service-contract` | T | Transaction | |
| `service-request` | T | Transaction | |
| `sla-performance-report` | R | Read-only render | |
| `smart-meter` | S | Master data + telemetry sink | A meter is not a transaction. Its reads are not events. |
| `soiling-audit` | T | Transaction | |
| `spare-parts-provisioning` | T | Transaction | |
| `substation-asset` | S | Master data | |
| `warranty-claim` | T | Transaction | |
| `warranty-recovery` | T | Transaction | |
| `vendor-escalation` | T | Transaction | |
| `generation-revenue-assurance` | F | Finding on the IPP's Home | |

### Carbon and sustainability (19)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `carbon-retirement` ★ | T | Transaction | Pilot chain 3. Exact `isTerminal()` today. Double-retirement is prevented by a **UNIQUE index on `(registry, serial_range)` in the retirement log**, not a guard scan — the DB rejects the second retirement of a serial atomically under concurrency, where a read-then-write guard would race. The guard only surfaces the friendly reason code; the index is the actual constraint. |
| `carbon-budget` | T | Transaction | |
| `carbon-credit-rating` | T | Transaction | |
| `carbon-erpa` | T | Transaction | |
| `carbon-issuance` | T | Transaction | |
| `carbon-mrv` | T | Transaction | Verified event prompts retirement (cross-chain, `drive`). |
| `carbon-offset-claim` | T | Transaction | |
| `carbon-registration` | T | Transaction | |
| `carbon-registry-transfer` | T | Transaction | |
| `carbon-reversal` | T | Transaction | `compensates` a retirement. |
| `carbon-tax` | T | Transaction | |
| `crediting-renewal` | T | Transaction | |
| `methodology-amendment` | T | Transaction | |
| `vcm-project-development` | T | Transaction | |
| `certificate-bundle` | T | Transaction | |
| `rec-device-registration` | T | Transaction | |
| `rec-issuance` | T | Transaction | |
| `rec-lifecycle` | T | Transaction | |
| `esg-disclosure` | T | Transaction | |
| `scope3-disclosure` | T | Transaction | |
| `sustainability-transaction` | T | Transaction | |
| `benchmark-transition` | T | Transaction | |

### Regulatory (13)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `licence-application` ★ | T | Transaction | Pilot chain 4. The Decision block's motivating case. |
| `licence-renewal` | T | Transaction | Opened by a timer on the licence's terminal state. |
| `levy-assessment` | T | Transaction | Exact `isTerminal()` today. |
| `compliance-inspection` | T | Transaction | |
| `consultation-notice` | T | Transaction | |
| `public-consultation` | T | Transaction | |
| `enforcement-action` | T | Transaction | |
| `enforcement-action-s35` | T | Transaction | ERA 2006 s35. Distinct legal basis, therefore a distinct chain. |
| `complaint-resolution` | T | Transaction | |
| `data-subject-request` | T | Transaction | POPIA. Export is an edge, so it is in the log — which is what §14 wants. |
| `kyc` | T | Transaction | Bought, not built ([REBUILD_PLAN.md §10](REBUILD_PLAN.md)). A `condition_of` child of `participant_onboarding` ([§8.1](REBUILD_PLAN.md)); the vendor's verdict enters as an input event (`kyc.vendor_verdict_received` + report hash), never a state jump. Risk rating, BO determination, EDD, and admit/decline stay platform transitions with a named human actor — FICA does not let us delegate those. |
| `sseg-registration` | T | Transaction | Small-scale embedded generation. |
| `csat` | R | Render | A survey response is not a transaction. |

### IT service management and platform (10)

| Chain | Disposition | Where it lands | Note |
|---|---|---|---|
| `support-ticket` | T | Transaction | |
| `problem-management` | T | Transaction | |
| `change-enablement` | T | Transaction | |
| `cyber-incident` | T | Transaction | |
| `security-remediation` | T | Transaction | |
| `insurance-claim` | T | Transaction | |
| `audit` | T | Transaction | |
| `subscription-billing` | T | Transaction | Runs as an **effect** on a monthly timer, not a cron with business logic. |
| `land-*`, `env-*` | — | (see §2, `ipp-*`) | |
| `imbalance` | T + R | Settlement transaction + statement render | |

**Count check.** The section counts above sum to more than 148 because
`reserve-activation` is listed under Grid and `cp-clearance` under Project
finance while their alphabetical home differs, and `planned outages` /
`land-*` are cross-references rather than rows. The authoritative list is
`ls src/routes/*-chain.ts` — 148 files. Every one has a row above. The
extraction script in P2 asserts this: it fails if any `*-chain.ts` has no
disposition recorded here.

**Dispositions that are not `T`:** `poslimit`, `pretrade-credit`,
`tariff-indexation`, `rez-capacity`, `smart-meter`, `substation-asset`,
`csat`, `pnl-attribution`, `dscr-report`, `sla-performance-report`,
`dscr-monitoring`, `asset-prognostics`, `generation-revenue-assurance`, and
the render-halves of `bess-soh`, `dfr`, `pr`, `unserved-energy`,
`best-execution`, `construction-cost-report`, `ipp-evm`, `ipp-schedule`,
`protection-relay`.

**That is 22 of 148.** Twenty-two route modules today carry a `status` column,
an SLA sweep, and a cascade wiring for a thing that never transitions. Each is
a small standing tax: a nightly job that recomputes nothing, a terminal-status
heuristic that guesses, a Ledger page nobody opens. The rebuild does not
delete their capability. It deletes their pretence.

---

## 2. The 208 support modules

Not chains. Grouped by what they become.

### 2.1 Absorbed by the engine (L0–L2) — 14 modules

`auth` · `auth-deep` · `sso` · `rbac` · `participants` ·
`station-participant-links` · `thread` · `threads` · `ux-state` · `prefs` ·
`status-deep` · `depth-3` · `data-tier` · `mount-routes`

`thread` and `threads` are the current, partial answer to S3 — a bolted-on
two-sided view. `party_on_txn` makes them the default rendering of every
Transaction, so both modules go. `rbac` becomes `edge.by` in the declaration.
`ux-state` and `prefs` become saved views ([REBUILD_FRONTEND.md §10](../design/REBUILD_FRONTEND.md), capability 2).

### 2.2 Absorbed by the event log (L1) and its export (L6) — 12 modules

`audit-l5` · `regulator-export` · `regulator-inbox` ·
`reconciliation-attestation` · `control-environment-audit` ·
`clearing-disclosure` · `siem` · `backup` · `vault` · `print-packs` · `pdf` ·
`doc-generation`

Seven audit subsystems become **one read plus one nightly verify job**.
`regulator-inbox` becomes: the regulator is a `statutory_observer` party row,
so the transaction is already on their Home. `siem` becomes a tail of the
event log. `vault` stays as R2 object-lock, promoted from analytics storage to
integrity primitive.

### 2.3 Become Home, Find, or the Transaction page — 21 modules

`horizon` · `launch` · `cockpit` · `ledger` · `dealroom` · `deals` · `feed` ·
`briefing` · `ai-briefs` · `notifications` · `onboarding` ·
`onboarding-checklist` · `onboarding-kyc` · `role-actions` ·
`role-completions` · `search` · `lookup` · `pulse` · `insights` ·
`national-dashboard` · `modules`

Onboarding is Home on day one — but not *only* a rendering change:
`onboarding` becomes the `participant_onboarding` chain, `onboarding-kyc`
becomes the `kyc` chain wrapping the vendor verdict, and the invite and
authority halves of the old module become the `user_invite` and `mandate`
chains ([REBUILD_PLAN.md §8.1](REBUILD_PLAN.md)). `onboarding-checklist`
is not stored at all: Home derives it from dry-run verdict vectors, one
item per failing guard. The wizard's two load-bearing parts survive — the
KYC submission form as evidence-upload edges, the checklist ordering as
the chain's state sequence. The inbox is Home. The dashboard is a
projection reachable *from* Home, never the landing page. `search` and
`lookup` merge into Find, with the existence-leak rule
([REBUILD_PLAN.md §8](REBUILD_PLAN.md)) applied at the index, not the query.

### 2.4 Become role-scoped Home filters, not modules — 12 modules

`trader-risk` · `trader-mm-compliance` · `trading` · `trading-deep` ·
`trading-clearing-l5` · `risk` · `lender-suite` · `lender-dunning` ·
`offtaker-suite` · `offtaker-obligations` · `regulator-suite` ·
`regulator-l5` · `grid-operator` · `grid-l5` · `grid` · `funder` · `om` ·
`marketplace` · `marketplace-l5` · `support` · `regulator` · `esg` ·
`business-depth` · `polish` · `go-live` · `platform-features` · `platform`

A "suite" is a saved view over the queue. `lender-dunning` is a timer with an
escalation edge. The `*-l5` and `*-deep` modules are the scar tissue of
building the same surface twice at different depths; they leave no residue.

### 2.5 Stay, essentially unchanged — 11 modules

`health` · `realtime` · `telemetry` · `metering` · `ona` · `monitoring` ·
`esums-solax` · `esums-sungrow-oauth` · `esums-ingest` · `esums-data-sources` ·
`mqtt-opcua-connector` · `scada-connector`

**Telemetry is not an event.** These modules write to R2 and Analytics Engine.
Events *assert about* telemetry by hash reference. This is what keeps the
event log at ~6 writes/s instead of ~40,000.

### 2.6 Connectors — stay, become effect handlers — 6 modules

`strate-swift-connector` · `sap-oracle-erp-connector` ·
`government-filing-connector` · `carbon-registry` · `carbon-article-6` ·
`settlement-dvp`

Each becomes a named `EffectRef` plus a reconciliation timer. Their weekly
cert-expiry and reconciliation sweeps become timers on a connector's own
`ChainDecl` (a connector *is* a long-lived transaction with a
`cert_expires_at` timer).

### 2.7 Machine learning — become Finding producers — 4 modules

`anomaly-detection-ml` · `rul-prediction-ml` · `fault-fingerprint-ml` ·
`watershed`

Each keeps its genuinely-periodic cron ([REBUILD_PLAN.md §4](REBUILD_PLAN.md)
— three of the six survivors are these). What changes is the output: today it
writes a table nobody reads; after, it emits a Finding that appears on a named
person's Home queue with `caused_by` pointing at the scan run. An ML model
whose output is not on somebody's queue is a model nobody is acting on.

### 2.8 Settings and master data — 9 modules

`admin` · `admin-platform` · `admin-market-halt` · `admin-revenue` ·
`esums-manufacturers` · `esums-projects` · `esums-commissioning` ·
`contracts` · `documents`

`admin-market-halt` is a `blocking` effect with a two-person edge, not a
toggle. `admin-revenue` reads `fee_schedule`
([REBUILD_PLAN.md §6](REBUILD_PLAN.md)).

### 2.9 Deleted outright — 3 modules

| Module | Why |
|---|---|
| `journey-config` | A journey is a path through `caused_by`. Configuring it is configuring the past. Migration 525 goes with it. |
| `bulk-ops` | Becomes `applyTransitions(Command[])` — one `batch()` per 50, N events sharing a `batch_id`. Generic, not a module. |
| `stage-gate` | A stage gate is a state with a `holder` and a `sla`. Its conditions-aging sweep is a timer. |

### 2.10 The `ipp-*` long tail — 55 modules

`ipp-ael` `ipp-annual-audits` `ipp-annual-compliance-assessments`
`ipp-annual-report` `ipp-bbbee-verification` `ipp-bfs` `ipp-bonds` `ipp-ccc`
`ipp-cep-compliance` `ipp-change-of-control` `ipp-change-order`
`ipp-commissioning-test` `ipp-community-trust` `ipp-contractor-default`
`ipp-cp-tracker` `ipp-diary` `ipp-dlp-defect` `ipp-ea-amendment`
`ipp-eco-report` `ipp-emp-compliance-reports` `ipp-env-closure`
`ipp-env-monitoring` `ipp-equity-transfer` `ipp-esmr` `ipp-final-completion`
`ipp-fm` `ipp-force-majeure` `ipp-grid-compliance` `ipp-hra` `ipp-ie-cert`
`ipp-iear` `ipp-insr` `ipp-issues` `ipp-land-amendment` `ipp-land-register`
`ipp-lc-report` `ipp-lender-reporting` `ipp-lessons-learned`
`ipp-licence-obligations` `ipp-licence-returns` `ipp-lifecycle`
`ipp-lta-certificate` `ipp-method-statement` `ipp-milestone-cert` `ipp-mir`
`ipp-ncr` `ipp-om-contract` `ipp-om-handover` `ipp-payment-cert`
`ipp-perf-security` `ipp-ppa-variation` `ipp-progress-claim`
`ipp-quarterly-gen-reports` `ipp-refinancing` `ipp-reipppp-reports` `ipp-rfi`
`ipp-risk` `ipp-sed-compliance` `ipp-site-instruction` `ipp-stakeholder`
`ipp-subcontractor` `ipp-submittal` `ipp-tpa` `ipp-tq` `ipp-variation-order`
`ipp-wul`

**Almost all of these are chains that were never registered as chains.** An
NCR has states. A method statement is approved or rejected. A site instruction
is issued, acknowledged, and closed. A bond expires. They have holders, SLAs,
counterparties, and evidence. They were written as route modules because there
was no abstraction to write them as.

Their disposition is **T**, and they are the clearest measurement of what the
rebuild buys: sixty-six modules, each ~300 LOC of hand-rolled transition
handling, become sixty-six declarations of ~80 lines that get a Transaction
page, an audit trail, a queue row, a regulator export, an SLA timer, an undo,
and a mobile layout for free.

The exceptions, staying **R** or **S**:

| Module | Zone | Why |
|---|---|---|
| `ipp-diary` | R | A site diary is an append-only log. It *is* the event stream, filtered. |
| `ipp-land-register` | S | Master data. |
| `ipp-lessons-learned` | R | A read over closed transactions. |
| `ipp-lifecycle` | R | A render of the causal graph across a project's chains. |
| `ipp-reipppp-reports`, `ipp-annual-report`, `ipp-quarterly-gen-reports`, `ipp-lc-report`, `ipp-eco-report`, `ipp-esmr`, `ipp-iear`, `ipp-insr`, `ipp-mir` | R + T | Render; *submission* is an edge with a deadline timer. |

### 2.11 `esums-*` O&M portal — 5 modules

`esums-om` · `esums-om-portal` · `esums-om-analysis` · `esums-om-intel` ·
`esums-accruals`

`esums-om-portal` is a role-scoped Home. `esums-om-analysis` and
`esums-om-intel` are renders over telemetry. `esums-accruals` is an effect.
The `esums_owner` → `esco` role remapping (`laneRoleFor` today) becomes a
single `role_on_txn` value and stops being special.

### 2.12 Remaining — 17 modules

`ai` · `ai-assistant` · `intelligence` · `metrics` (via `insights`) ·
`reports` · `reports-deep` · `esg-reports` · `settlement` ·
`settlement-automation` · `settlement-deep` · `reconciliation` ·
`invoices` · `imbalance` · `projects` · `project-schedule` · `pipeline` ·
`schedule` · `popia` · `popia-deep` · `kyc-deep` · `public-legal` ·
`ntt-comparison-battery` · `vcm-order-book` · `sustainability-marketplace` ·
`grid-dispatch-nominations` · `grid-wheeling-charges` · `margin-gate` · `lois`

`ai` and `ai-assistant` collapse into `AiCard` — inline, one accept button,
never a tab. `settlement*` and `reconciliation` are three modules doing one
thing; they become the `imbalance` and `virtual-ppa-settlement` chains plus a
render. `margin-gate` is a guard. `vcm-order-book` reuses the `OrderBook` DO
with a different shard key. `ntt-comparison-battery` keeps its nightly cron
and emits Findings.

---

## 3. What no longer needs building, per chain

This is the argument in one table. Each row is a thing the current system
builds 148 times and the rebuild builds once.

| Capability | Today | After |
|---|---|---|
| List page | 148 hand-built Ledger configs, 17 registered | Generated from `ChainDecl` |
| Detail page | 148 hand-built | Generated |
| Create form | 148 hand-built | Generated from `initial` edge's `input` |
| Action buttons | 148 hand-built, validation re-typed | Generated from `transitions`, with `blockedBy` from the guard itself |
| Status classification | 148 `isTerminal()` + a 24-token heuristic covering the rest | `states[s].terminal` |
| Audit trail | 7 subsystems, ~3,500 LOC | The event log. It *is* the page. |
| SLA timer | 148 `<chain>SlaSweep()` + 27 cron slots | One `timer` table, one sweeper |
| Cascade wiring | `handleSpecialCascades` switch, ~780 LOC | `effects: [...]` in the declaration |
| Regulator export | Per-domain export code | One read over L1 |
| Undo | Ad-hoc `DELETE`s where it exists at all | `compensates` |
| Bulk action | `bulk-ops` REGISTRY, per-chain entries | `applyTransitions(Command[])` |
| Notification | Per-chain, from a projection | From the log tail |
| Mobile layout | Not attempted | Structural, from the same `TxnView` |
| Deep link | Per-route | `/t/:ref?action=:edge` |

---

## 4. What is genuinely lost

Honesty requires this section.

1. **Bespoke forms.** Nineteen chains today have a form with a layout somebody
   thought about — the PPA tariff builder, the drawdown request, the licence
   application. Generated forms will be *worse* at first. `FieldDecl` gains a
   `group` and an `order`; that closes most of the gap. It does not close all
   of it, and pretending otherwise is how generated-UI projects die.

2. **The wizard.** `<WizardShell>` (Context → Validate → Confirm → Submit) is a
   real pattern with real users. A transition with a long `input` is not a
   wizard. The fix is a declared `steps: [[...fields], [...fields]]` on the
   edge — a partition of the same `FieldDecl` set, not a second form system.
   Deferred to P3. Named here so it is not forgotten.

3. **Six months of power-user muscle memory.** Priced in
   ([REBUILD_PLAN.md §13](REBUILD_PLAN.md), R9). Mitigated by the `/` command
   bar, ⌘K, saved views, bulk, and keeping the old system read-only for 90
   days. Not eliminated.

4. **Charts that are somebody's livelihood.** The EVM S-curve, the depth
   ladder, the Gantt, the meter waterfall, the settlement statement. These are
   the **R** dispositions above. They are ported as read-only renders,
   unchanged, and they are the reason
   [the one rule](../design/REBUILD_FRONTEND.md) says *presentation may be
   custom* and only *input* is generated.

5. **Money still does not move** (S5). `src/do/` contains one file. Settlement
   writes a ledger row against no custody and no rails.

   An earlier draft of this list said the rebuild leaves that "unchanged, in
   either direction." **That is false.** This document rebuilds
   `settlement-dvp`, `settlement-fail`, `disbursement`, `counterparty-margin`,
   `ccp-assessment`, `capital-adequacy` and `clearing-disclosure` as clean **T**
   chains. They inherit a hash-chained event log, a per-transaction Merkle
   proof, an R2 object-lock anchor, and a regulator export pack — and nothing in
   that stack records that no finality occurred. Tamper-evidence attests the
   record was not *altered*. It says nothing about whether the record was *true
   when written*. So the rebuild, left alone, makes the gap **harder** to see,
   not easier.

   What is lost is therefore not the gap — it is the shabbiness that made the
   gap legible. The three requirements in
   [REBUILD_PLAN.md §1.1](REBUILD_PLAN.md) (`settles: false` mandatory and
   build-checked; states renamed to `*_instructed` with the honest terminals
   declared-but-unreachable; the **NO SETTLEMENT FINALITY — RECORD ONLY** stamp
   on every export pack and Transaction page) are what put it back. They are
   binding on every chain in the settlement, disbursement, margin and clearing
   domains above.

---

## 5. The floor, stated as a test

P3 does not close until this passes:

```
for every chain_key in ls src/routes/*-chain.ts:
  assert disposition(chain_key) is recorded in this document
  if disposition is T:
    assert a ChainDecl exists with that key
    assert every status token the legacy table ever held
           maps to a declared state          # from SELECT DISTINCT status
    assert every legacy endpoint that mutated the table
           maps to a declared transition     # from the route module's handlers
    assert the per-chain conformance table passes  # R8 (revised). the table is
           against the new applyTransition          # (from_state, transition, guards,
                                                    #  to_state, reason_code) rows read
                                                    #  out of the legacy *-spec.ts and
                                                    #  replayed. every diverging row is a
                                                    #  bug or an undocumented decision.
                                                    #  the 8,167 tests are NOT run against
                                                    #  the new HTTP surface — 286/303 files
                                                    #  import src/ directly and do not survive
                                                    #  a runtime swap. they are the archive the
                                                    #  conformance table is derived from.
  if disposition is R or S:
    assert no ChainDecl exists with that key
    assert the render or the settings page exists and is reachable from Home
```

The second-to-last assertion is the one that matters. The 8,167 existing tests
are not obstacles to the rebuild. **They are the specification of the floor,
already written, in a form that runs.**

The gate runs **per market pack** (REBUILD_PLAN.md §8.2): for each pack in the CI
matrix, the chains asserted are the pack's `enabled_chains` resolved to their
ChainDecl variants. The SA pack's run is the full-floor run above; other packs
assert their own (smaller) enabled set plus the pack-resolution property from
REBUILD_PLAN.md §14.

---

## MT. Microtool inventory — all roles

Contract in [REBUILD_FRONTEND.md](../design/REBUILD_FRONTEND.md) §10.1. Every microtool
is a **pure calculator, zero writes**, surfaced from Find + the `/` command bar (and,
where `bound` is set, as an inline card on a matching Transaction). **Every `compute`
column names an existing exported `*-spec.ts` function** — this table is a wiring list,
not a build list. Nothing here writes; anything that writes is a transition (see §1).

**Rule restated:** the `compute` fn is the *same* fn the corresponding guard calls, so a
tool can never disagree with the gate that admits the transition. A tool with no existing
spec fn is marked `⌛ deferred` — it is not invented here.

**Multi-market note (REBUILD_PLAN.md §8.2):** currency-named helpers listed below
(`estimateAtCompletionZar()`, `tierForExposureZar()`, `scheduleVarianceZar()`, …)
are ported with the currency dropped from the name (`estimateAtCompletion()`,
`tierForExposure()`, …) — they operate on money-valued fields whose currency comes
from the chain (contract_currency/settlement_currency). Jurisdiction-specific
constants baked into legacy specs (`CB_TAX_RATE_ZAR=236`, `DFFE_DGGEF=0.942`) move
to `pack.guard_params` / `pack.reference_seeds`; the SA pack carries those values,
other markets carry their own or don't enable the tool.

### Shared — every role

| key | label | compute (`*-spec.ts` fn) | source | bound |
|---|---|---|---|---|
| `energy-convert` | Energy unit convert (kWh·MWh·GWh) | inline pure (trivial, no spec fn) | — | — |
| `tco2e` | Emissions estimate (MWh → tCO2e) | `totalEmissionsTco2e()` · `DFFE_DGGEF=0.942` | `esg-disclosure-spec` | energy_mwh |
| `carbon-tax` | Carbon-tax estimate (tCO2e → ZAR) | `totalEmissionsTco2e()` × `CB_TAX_RATE_ZAR=236` | `esg-disclosure-spec` + `carbon-budget-chain` | tco2e |

### IPP Developer

| key | label | compute | source | bound |
|---|---|---|---|---|
| `evm` | Earned-value (CPI/SPI/EAC) | `cpi()` `spi()` `estimateAtCompletionZar()` `varianceAtCompletionZar()` | `project-change-order-spec` | project change-order txn |
| `tcpi` | To-complete performance index | `toCompletePerformanceIndex()` | `project-change-order-spec` | project change-order txn |
| `co-cap` | Change-order cumulative % vs cap | `cumulativeOverrunPct()` `revisedBaselineCostZar()` | `project-change-order-spec` | change-order txn |
| `contingency` | Contingency remaining | `contingencyRemainingZar()` | `project-change-order-spec` | change-order txn |
| `capfactor` | Realised capacity factor | `capacityFactorRealized()` | `ppa-nomination-spec` | — |

### EPC Contractor

| key | label | compute | source | bound |
|---|---|---|---|---|
| `evm` | Earned-value (CPI/SPI/EAC) | `cpi()` `spi()` `estimateAtCompletionZar()` | `project-change-order-spec` | change-order txn |
| `sched-var` | Schedule variance (ZAR) | `scheduleVarianceZar()` | `project-change-order-spec` | change-order txn |
| `co-cap` | Change-order cumulative % vs cap | `cumulativeOverrunPct()` | `project-change-order-spec` | change-order txn |

### Trader

| key | label | compute | source | bound |
|---|---|---|---|---|
| `initial-margin` | Initial margin for notional | `initialMarginFor()` | `trader-risk` | order ticket |
| `vm-shortfall` | Variation-margin shortfall | `variationMarginShortfall()` | `trader-risk` | position txn |
| `exposure-tier` | Counterparty exposure tier | `tierForExposureZar()` `tierForExposure()` | `counterparty-margin-spec` | — |
| `imbalance-tier` | Imbalance cash-out tier | `tierForQuantum()` | `imbalance-settlement-spec` | imbalance txn |

### Lender

| key | label | compute | source | bound |
|---|---|---|---|---|
| `dscr` | Debt-service coverage ratio | `dscr()` | `covenants` | facility / DSCR-report txn |
| `llcr` | Loan-life coverage ratio | `llcr()` | `covenants` | facility txn |
| `covenant` | Covenant headroom evaluate | `evaluateCovenant()` | `covenants` | covenant txn |
| `dscr-sla` | DSCR breach SLA window | `deriveDscrSla()` | `dscr-report-spec` | DSCR-report txn |
| `sll-margin` | SLL margin ratchet (bps) | `effectiveMarginBps()` | `sll-kpi-spec` | SLL-KPI txn |
| `escal-sev` | Escalation severity by cycle | `escalationSeverity()` | `lender-escalation-spec` | escalation txn |

### Offtaker

| key | label | compute | source | bound |
|---|---|---|---|---|
| `nom-dev` | Nomination deviation tier | `tierForDeviationPct()` | `ppa-nomination-spec` | nomination txn |
| `capfactor` | Realised capacity factor | `capacityFactorRealized()` | `ppa-nomination-spec` | PPA txn |
| `exposure-tier` | Counterparty exposure tier | `tierForExposureZar()` | `counterparty-margin-spec` | — |

### Carbon Fund

| key | label | compute | source | bound |
|---|---|---|---|---|
| `tco2e` | Emissions estimate | `totalEmissionsTco2e()` | `esg-disclosure-spec` | credit txn |
| `carbon-tax` | Carbon-tax / credit value | `totalEmissionsTco2e()` × `CB_TAX_RATE_ZAR` | `esg-disclosure-spec` | credit txn |

### Grid Operator

| key | label | compute | source | bound |
|---|---|---|---|---|
| `security-margin` | Transmission security margin % | `securityMarginPct()` | `transmission-outage-spec` | outage txn |
| `imbalance-tier` | Imbalance quantum tier | `tierForQuantum()` | `imbalance-settlement-spec` | imbalance txn |
| `nom-dev` | Nomination deviation tier | `tierForDeviationPct()` | `ppa-nomination-spec` | nomination txn |

### ESCO / O&M (`esco` ≡ `esums_owner`)

| key | label | compute | source | bound |
|---|---|---|---|---|
| `perf-ratio` | Performance ratio (PR) | `performanceRatio()` | `asset-prognostics-spec` | station txn |
| `expected-ac` | Expected AC power (kW) | `expectedAcKw()` | `asset-prognostics-spec` | station txn |
| `degradation` | Degradation trend (%/yr) | `degradationTrend()` | `asset-prognostics-spec` | station txn |
| `rul` | Remaining useful life | `remainingUsefulLife()` | `asset-prognostics-spec` | asset txn |
| `anomaly` | Anomaly ensemble (z/IQR/EWMA) | `detectAnomalyEnsemble()` `zScore()` `iqrOutlier()` | `asset-prognostics-spec` | telemetry txn |
| `soiling-tier` | Soiling-ratio tier | `tierForSoilingRatio()` | `soiling-audit-spec` | soiling-audit txn |

### Regulator

| key | label | compute | source | bound |
|---|---|---|---|---|
| `exposure-tier` | Counterparty exposure tier | `tierForExposure()` | `counterparty-margin-spec` | — |
| `imbalance-tier` | Imbalance quantum tier | `tierForQuantum()` | `imbalance-settlement-spec` | imbalance txn |
| _all read tools above_ | Regulator sees every tool | (visibility, not new fns) | — | — |

Regulator adds no new arithmetic — it re-uses the sibling tools with read visibility.
The custody notice (R-S5-3) is a property of the **export pack**, not a tool: no
microtool can compute money movement because none moves.

### Support / OEM

| key | label | compute | source | bound |
|---|---|---|---|---|
| `perf-ratio` | Performance ratio (diagnostic) | `performanceRatio()` | `asset-prognostics-spec` | station txn |
| `anomaly` | Anomaly ensemble (diagnostic) | `detectAnomalyEnsemble()` | `asset-prognostics-spec` | telemetry txn |
| `rul` | Remaining useful life | `remainingUsefulLife()` | `asset-prognostics-spec` | asset txn |

### Admin

Admin gets no privileged microtools — a calculator that reads nothing has nothing to
escalate. Admin sees the shared three and, for support, the diagnostic PR/anomaly tools.
Everything an admin *does* (role grant, tenant config, cron run) is a transition with an
audit row, never a tool.

---

**Count:** ~38 microtool bindings across 11 roles, every one wired to a spec function that
already exists and already backs a guard. Net-new arithmetic to write: **`energy-convert`
only** (a unit multiply — trivial, no spec module). Everything else is a `ToolDecl` literal
plus a Find/`/` registration. This is the cheap layer §10.1 promised: the four surfaces
already earned it.

