# CEC / Open Energy Platform — Persona Catalogue & System-Adjustment Backlog

**Purpose.** A polish-level, system-wide roster of the skilled business, technical and specialist personas who operate every facet of the platform — used to *adjust* the system, not just describe it. Each persona is grounded in the real components (routes, chains, surfaces) they touch, the metrics they live by, the friction they hit today, and the concrete adjustment their need implies.

**Method.** Eight facet specialists swept the codebase read-only (Trading/Settlement/Risk · Carbon · IPP lifecycle · Grid/SO · Lending · Regulator · O&M+Support+Offtaker · Platform/Technical). Findings are cited to files. This catalogue is the synthesis.

**Status.** Built 2026-06-22. The 11 incumbent role personas were enriched to senior-expert grade in `migrations/518_seed_expert_persona_profiles.sql` (demo D1 only — live `cec-energy-db` is production, read-only). The 50 personas below are a **design catalogue**; seeding any of them as demo participants is a separate, opt-in step.

---

## Part 0 — The headline finding

Two structural themes recur in **every** facet and dominate the adjustment backlog:

1. **Role granularity is too coarse.** Eleven auth roles run a platform that, by its own org charts, needs ~40 distinct functions. A whole carbon lifecycle (origination → MRV → tax → Article 6 → integrity) collapses into one `carbon_fund` role; five distinct trading-floor functions (desk head, risk officer, middle office, clearing manager, surveillance) run on `trader`+`admin`. This is simultaneously a **segregation-of-duties control gap** (a levy clerk can revoke a licence; a risk officer shares the trader role; an ERPA originator can issue the credits they sold) and a **discoverability problem** (every operator sees ~30 tiles regardless of function). Sub-roles + maker-checker on the "signature" crossings is the single highest-leverage change.

2. **The platform is deep on write paths and thin on read/operate paths.** 207 chains, 180+ cascade events, tamper-evident audit, fee/analytics layers, tiered SLA sweeps — all excellent. But `cascade_dlq`, `request_stats`, `oe_chain_metrics`, `ai_decisions`, KYC/PII logs, levy arrears, buffer-pool balances are **populated and queryable with no operator UI.** Almost every senior persona's top friction is the same sentence: *the tables exist, the dashboards don't.*

Everything else is facet-specific depth (CPM/EVM compute, cashflow-model engine, GHG quantification, VaR backtesting, surveillance taxonomy) — real L4→L5 work, enumerated per persona below.

---

## Part 1 — Incumbent role personas (enriched, migration 518)

The 11 demo personas now carry senior-expert profiles (job title, credentialed bio, +27 contact, org reg, enterprise tier). Reference identities:

| id | Name | Title | Role |
|---|---|---|---|
| demo_admin_001 | — | Platform Administrator | `admin` |
| demo_trader_001 | Sipho Mkhize | Head of Power Trading | `trader` |
| demo_ipp_001 | Johan van der Berg | MD, Project Development | `ipp_developer` |
| demo_ipp_002 | Lerato Moloto | Director, Asset Management & Operations | `ipp_developer` |
| demo_carbon_001 | Anita Naidoo | Head of Carbon Origination | `carbon_fund` |
| demo_offtaker_001 | Thabo Molefe | Group Energy Procurement Lead | `offtaker` |
| demo_lender_001 | Pieter van Zyl | Director, Project & Infrastructure Finance | `lender` |
| demo_grid_001 | Nomsa Dlamini | System Operations Manager | `grid_operator` |
| demo_regulator_001 | Kagiso Tlhotlhalemaje | Senior Manager, Electricity Regulation | `regulator` |
| demo_esco_001 | Zanele Khumalo | O&M Operations Director | `esco` |
| demo_epc_001 | Andile Bhengu | Construction Director | `epc_contractor` |
| demo_support_001 | — | Platform Support Lead | `support` |

The catalogue below **expands** this roster to the full operating org of each facet.

---

## Part 2 — Expanded persona roster (50)

Legend — **Class:** Business (B) · Technical (T) · Specialist (S). **Role:** existing auth role, or *NEW sub-role* the persona implies.

### Facet A — Power Trading, Settlement & Clearing, Market Risk

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| A1 | **Thandeka Mokoena — Head of Power Trading** | B | `trader` | Own P&L and risk appetite across all energy types / delivery days. |
| A2 | **Sipho Naidoo — Power Trader / Market Maker** | B | `trader` (acts `marketmaker`) | Quote two-sided prices, run the intraday book within limits + MM obligations. |
| A3 | **Riaan van der Merwe — Quant / Algo Developer** | T | *NEW `algo_engineer`* | Build, certify, operate automated strategies + kill-switch governance. |
| A4 | **Lerato Dlamini — Market Risk Officer** | S | *NEW `risk_officer`* | Independently measure & constrain market risk; set the limits the desk trades within. |
| A5 | **Pravesh Govind — Middle-Office Settlement Analyst** | B | *NEW `middle_office`* | Take matched trades through clearing, margin, atomic DvP to confirmed cash+energy. |
| A6 | **Ayesha Patel — Market Surveillance Officer** | S | `regulator`/`admin` | Detect, investigate, report market abuse; own the STOR pipeline. |
| A7 | **Johan Botha — Clearing & Margin Manager (CCP)** | S | `admin` (clearing-house scope) | Guarantee settlement: margin gate, counterparty waterfall, default management. |

**Key adjustments (A):** stand up the four missing sub-roles (`risk_officer`, `middle_office`, `algo_engineer`, plus a clearing scope) to restore 2nd-line/ops segregation · **Desk Cockpit** (`trader:desk`) rolling up P&L / VaR-utilisation / limit-headroom · pre-trade **dry-run** endpoint (`POST /orders/preview` → first failing guard) · component/incremental VaR + **VaR backtesting** (history is stored, never exception-counted) · structured **abuse-pattern enum** (spoof/layering/wash/momentum-ignition) + score in the surveillance scan, one-click alert→W52 case · **Settlement Fails** surface with reason-code aging · `SELF_TRADE_PREVENTED` guard + algo **replay/backtest** harness over the already-pure `matchOrder`.

### Facet B — Carbon lifecycle

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| B1 | **Thandeka Mabaso — Head of Carbon Origination** | B | `carbon_fund` | Convert the pipeline PDD→first issuance, profitably; run ERPA forward cover. |
| B2 | **Sipho Ndlovu — MRV / Validation Lead** | S | *NEW `mrv_verifier`* | Steward every submission through DOE validation to a defensible issuance. |
| B3 | **Rajesh Pillay — Carbon Tax Compliance Manager** | B | *NEW `tax_filer`* | Minimise carbon-tax liability lawfully; file clean SARS returns on time. |
| B4 | **Dr Lerato Mokoena — GHG Quantification Engineer** | T | *NEW `ghg_quant`* | Produce emissions/removals numbers that survive DOE scrutiny + baseline reassessment. |
| B5 | **Ayanda Khumalo — Article 6 / ITMO Policy Specialist** | S | *NEW `a6_policy`* | Keep every cross-border transfer corresponding-adjusted, double-counting-free. |
| B6 | **Nadia Davids — Buffer-Pool / Integrity Risk Analyst** | S | *NEW `integrity_risk`* | Protect issued-unit integrity — reversals, buffer cancellation, replacement. |

**Key adjustments (B):** sub-role layer + **4-eyes guard** on `issue`/`grant-allowance`/`cancel-buffer` (today one `carbon_fund` role does origination, verification, tax and integrity) · convert soft links to hard FKs + guards: W11→W82 `verify-against-mrv` should be a FK to an `issued` submission; W48 offset claim must check the earmarked credit is actually `retired` (W17) and not already claimed; server-side **offset-cap guard** (10% annex_2 / 5% general) · **quantification worksheet** surface (baseline/project/leakage by scope, stored formulae) — today tonnage is opaque `*_basis` strings (the deepest L2 hole in carbon) · **buffer-pool ledger** with running balance + low-headroom alert · W4 Article-6 needs an SLA spec + a double-counting-risk panel (the risk is computed, never surfaced).

### Facet C — IPP project lifecycle

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| C1 | **Thandiwe Mokoena — MD, Project Development** | B | `ipp_developer` | Own development-to-financial-close P&L for the project pipeline. |
| C2 | **Rajen Pillay — Project Finance Lead** | B | *NEW `ipp_finance`* | Reach & maintain financial close — CPs, drawdowns, security, covenant reporting. |
| C3 | **Lerato Dlamini — Owner's Engineer / Project Controls** | T | *NEW `owners_engineer`* | Independent assurance of schedule & cost integrity vs the contract baseline. |
| C4 | **Pieter van der Merwe — EPC Construction Director** | T | `epc_contractor` | Deliver mechanical completion → commissioning → COD on programme, to quality. |
| C5 | **Nomvula Khumalo — REIPPPP Bid Manager** | S | *NEW `bid_manager`* | Win the bid window — compliant, competitive REIPPPP/RFP response. |
| C6 | **Sipho Ndlovu — ED / Socio-Economic Development Officer** | S | *NEW `ed_officer`* | Meet every REIPPPP ED/SED commitment; survive DMRE/IPPO audit. |
| C7 | **Fatima Adams — Environmental & Permitting Specialist** | S | *NEW `env_specialist`* | Keep the project lawful under NEMA/EA, water-use, air-emission licensing. |

**Key adjustments (C):** **server-side CPM/EVM engine** — today `ipp_schedule`/`ipp_evm` *store* SPI_t, critical-path duration and EAC as caller-typed fields; the biggest depth gap in the facet. Build an activity-network forward/backward pass → float/longest-path, auto-derive SPI/CPI/EAC, fire `detect_variance` on negative float, render an interactive Gantt · upgrade list-only **risk/issues/stakeholder/lessons registers** (no chainKey) to L3+ so a grievance can raise an ED variance · promote **bonds + environmental permits** from countdown columns to renewal/escalation chains · grant `epc_contractor` scoped `update_progress` so site progress flows to the owner's EVM · split a "REIPPPP bid-as-bidder" chain from the overloaded `procurement_rfp` (currently models both IPP-as-buyer and IPP-as-bidder).

### Facet D — Grid / System Operator (NTCSA)

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| D1 | **Thandeka Mahlangu — System Operations Manager** | B | `grid_operator` | Own grid security + operational integrity of every SO instruction. |
| D2 | **Sipho Ndlovu — Real-Time Dispatch Engineer** | T | *NEW `grid_dispatcher`* | Keep the system balanced second-to-second; dispatch + reserve calls. |
| D3 | **René van der Merwe — Grid Connection & Capacity Manager** | T/B | *NEW `grid_connections`* | Run the connection queue fairly; IPP from application to energised connection. |
| D4 | **Lerato Dlamini — Transmission Pricing / Wheeling Analyst** | B | `grid_operator` | Bill TUoS correctly; defend every wheeling charge through dispute. |
| D5 | **Johan Pretorius — Grid-Code Compliance Engineer** | S | `grid_operator` | Hold every connected facility to the Grid Code / NRS-097, to disconnection. |
| D6 | **Nomvula Khoza — Ancillary Services / Reserves Trader** | B/S | *NEW `reserves_desk`* | Procure the right reserve portfolio at least cost; settle activations fairly. |

**Key adjustments (D):** split `grid_operator` into `grid_dispatcher` / `grid_connections` / `reserves_desk` · one **live operating cockpit** (frequency/ACE/reserve countdowns off the SCADA connector) — the one thing the request/CRUD architecture can't currently express · **promote W8 wheeling charges to an L4 chain** (it's deliberately excluded from the registry today, plain-`status`, no dunning/indexation — the clearest contained depth win) · link the disconnected pairs via small join objects: reserve award↔activation, capacity-queue↔GCA↔energization, wheeling-charge↔access-agreement · auto-raise W67 NCRs when a SCADA parameter breaches its NRS-097 limit.

### Facet E — Lending / Project & Infrastructure Finance

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| E1 | **Thandeka Mokoena — Director, Project & Infra Finance** | B | `lender` | Own the energy book — origination, portfolio appetite, regulator posture. |
| E2 | **Sipho Naidoo — Credit Risk Analyst** | S | `lender` | Screen & credit-assess each facility before committee. |
| E3 | **Lerato Dube — Portfolio Monitoring / Covenant Officer** | B | `lender` | Keep every live facility compliant — certificates in, breaches caught, cure clocks running. |
| E4 | **Riaan van Wyk — Loan Workout / Restructuring Specialist** | S | `lender` (+`security_agent` party) | Take distressed facilities EoD→resolution at least loss. |
| E5 | **Naledi Khumalo — Financial Modeller (DSCR/LLCR)** | T | `lender` | Build & maintain the project cashflow models every covenant rests on. |
| E6 | **Aisha Patel — ESG / Equator Principles Officer** | S | *NEW `esg_lender`* | Hold every financed project to its E&S action plan + Equator/IFC commitments. |
| E7 | **Johan Pretorius — Agency / Security Trustee Manager** | S/T | *NEW `security_agent`* | Perfect, register, hold & enforce the security package; administer transfers. |

**Key adjustments (E):** **cashflow-model engine** — `dscr`/`llcr` are single-shot functions over pre-computed scalars; no period vectors, amortisation, sculpting or P50/P90. Build a period-vector model + two-axis **sensitivity grid/tornado** on `stress/run`, then auto-publish modelled ratios into W38/W86 as the lender's independent benchmark · register the **`security_agent`** sub-role the W45/W69 *party* model already wants (trustee actions currently run as generic `lender`, breaking audit attribution) · **independent ratio recompute** on covenant `verify-ratios` (today DSCR/LLCR are borrower-typed and unchallengeable) · **distressed-asset case file** fanning W45+W108+W69 into one timeline + an LGD/recovery comparator · promote credit-committee from a chain *state* to a decision workspace (agenda→paper-pack→quorum/vote→minuted RoD) · cascade-wire E&S breach (W214) → disbursement hold (W30) + margin ratchet (W95).

### Facet F — Regulator (NERSA)

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| F1 | **Thandeka Mabaso — Senior Manager, Electricity Regulation** | B | `regulator` (oversight lens) | Own division throughput — every licence/tariff/inspection/enforcement clears or escalates. |
| F2 | **Sipho Ndlovu — Licensing Officer** | B | `regulator` | Drive initial-licence + renewal receipt→grant/refusal without an SLA breach. |
| F3 | **Refilwe Setshedi — Compliance & Enforcement Inspector** | S | `regulator` | Convert §10/§34 inspection findings into graduated enforcement that survives appeal. |
| F4 | **Dr Anand Pillay — MYPD Tariff Economist** | T | *NEW `regulator_economist`* | Determine allowed revenue + tariff cap each MYPD cycle; run the RCA true-up. |
| F5 | **Nokuthula Dlamini — Levy & Revenue Officer** | B | `regulator` | Assess & collect the s5B levy; run dunning to settlement or write-off. |
| F6 | **Mandla Khumalo — Complaints / Dispute Adjudicator** | B | `regulator` | Resolve ERA s30 complaints fairly, within URGENT SLA, with a clean appeal path. |
| F7 | **Yusuf Cassiem — Market Conduct Analyst** | S | `regulator` | Run surveillance scans, triage alerts, file STORs. |

**Key adjustments (F):** **role differentiation within `regulator`** — today one role = all `regulatorDomains` + write on every chain (a levy officer can revoke a licence; an analyst can issue a determination). Persona-scoped surface subsets (reuse the `REPORT_SUBSETS` pattern) + **maker-checker on the signature crossings** (`refuse`, `write_off`, `escalate_enforcement`, `file_stor`) · regulator **headline-KPI band on /horizon** + a portfolio SLA-breach heatmap across all 9 regulator chains · deepen **W43 MYPD to L5** with a real revenue-requirement model (RAB roll-forward + WACC + RCA reconciliation) — today the economics are document refs, not computed · unify the two surveillance state stores (suite alerts + inbox escalation) on one case spine and harden the best-effort alert→case link · a **levy aging/collections** surface (arrears is a per-case field, no rollup) cross-linked to the licensee's licence record · one-click `escalate-to-s35` from W40 inspection + `refer-to-inspection` from W66 complaint.

### Facet G — Esums O&M · OEM-Support · Offtaker/PPA

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| G1 | **Thandeka Mkhize — O&M Operations Director** | B | `esco` | Keep the fleet at guaranteed availability/PR; hold O&M cost/MWh down. |
| G2 | **Riaan Botha — Reliability & Predictive-Maintenance Engineer** | T | `support` (ops `esco`) | Convert telemetry into pre-failure intervention that beats the NTT 30% benchmark. |
| G3 | **Nomvula Dlamini — HSE / SHEQ Manager** | S | `esco` (×`ipp`/`epc`) | Zero-harm; every incident investigated, every high-risk task permitted before work. |
| G4 | **Sipho Nkosi — Spare-Parts / Supply-Chain Planner** | S | `esco`/`support` | Right part, right site, before the stockout costs generation. |
| G5 | **Pieter van Wyk — OEM Warranty & Service Manager** | B | `support` | Recover defective-equipment cost from suppliers; turn claims into cash. |
| G6 | **Anele Mbatha — ITIL Service & Problem Manager** | T | `support` | Restore service fast, kill recurring problems, change safely. |
| G7 | **Lerato Modise — Group Energy Procurement Lead** | B | `offtaker` | Secure cheapest reliable clean MWh; protect the group against PPA downside. |
| G8 | **Yusuf Patel — PPA Contract Manager** | S | `offtaker` | Hold both sides to the PPA monthly — volume, price, curtailment, security. |
| G9 | **Karabo Sithole — Sustainability & RC Reporting Manager** | S | `offtaker` | Defensible Scope-2 reduction backed by retired, non-double-counted certificates. |

**Key adjustments (G):** **predictive brain is in the wrong role** — W71 prognostics + `*_ml` surfaces are `support`-mounted but operated by `esco` reliability staff; mirror them into `esco:asset_health` + a one-click "raise WO from prognostic" (W71→W16) · **mirror-chain netting**: W7/W32 take-or-pay (buyer owes) ↔ W46 curtailment (buyer pays seller) settle against the same PPA at the same indexed tariff — build a netted monthly per-counterparty position; same for W15 RMA ↔ W63 warranty-recovery (parent/child link) · make the manual handoffs one-click context-carrying cascades (W14→W41→W47, W25→W64, W70→Scope-2) · O&M **director exposure roll-up** summing availability-LD (W51) + PR loss (W24) + prognostic revenue-at-risk (W71) · add an `epc_contractor` lane to W64 permit-to-work · bind retired W70 RECs to the consumption period they offset on `offtaker:scope2` · honest gap: `bess_soh`/`soiling_audit` tiles are likely L1 mock (chainKey+mockStates, no registry descriptor).

### Facet H — Platform / Technical / Cross-cutting

| # | Persona | Class | Role | Mandate |
|---|---|---|---|---|
| H1 | **Thabo Mokoena — Senior Platform / Backend Engineer** | T | `admin` | Keep the Hono API coherent as 351 modules + 180+ cascade events accrete. |
| H2 | **Naledi Khumalo — SRE / Edge Reliability Engineer** | T | *NEW `sre`* | 33 cron triggers, cascade DLQ, advisory locks, latency SLOs stay green. |
| H3 | **Pieter van der Merwe — Data Engineer / D1 & Migrations Steward** | T | `admin` | Own the 518-migration ledger, the irregular-band discipline, the sharding roadmap. |
| H4 | **Aisha Patel — Security Engineer (AppSec/Privacy)** | T/S | `admin` | Auth integrity, tenant isolation, POPIA/FICA posture, abuse resistance. |
| H5 | **Sipho Dlamini — DevOps / Release Engineer** | T | `admin` | Every push to main ships safely without burning the prod rate-limiter. |
| H6 | **Lerato Nkosi — AI / ML Engineer** | S | *NEW `ml_ops`* | Auditable inline AI assists + the Esums brain that must beat NTT. |
| H7 | **Dr Yusuf Cassim — Platform Product Owner / Solution Architect** | B | `admin` | Hold the L4/L5 depth rubric + graphify-first discipline as the platform scales. |
| H8 | **Grace Mahlangu — QA / Test Automation Engineer** | T | `support` | Guard correctness across ~8,369 vitest + 33 Playwright + 3 k6 scenarios. |
| H9 | **Fatima Adams — Tenant / Onboarding Admin** | B | `admin`/`support` | Provision tenants, drive role onboarding to completion, run KYC. |

**Key adjustments (H):** the recurring ask — **build the operator dashboards over already-populated tables**: a DLQ ops console (depth/age/replay), `request_stats` per-route 4xx/5xx, an `oe_chain_metrics` chain-health board, an `ai_decisions` review surface (acceptance %, fallback rate, drift flags, EU-AI-Act Art-14 oversight log), a consolidated KYC+PII+SAR info-officer console · a `cron_runs` ledger + alert on consecutive failures (today a failure is one log line) · field-level **PII encryption** + automated secret rotation (both open in GO_LIVE_READINESS) · make the sensitive-bucket rate-limit **atomic via a DO counter** (it's the #1 CI flake) · split the 600-line `EventType` union per-domain · stand up a **Vitest/RTL runner for the SPA** (frontend has none) + a test-D1 harness allowing genuine concurrency for race-guard tests · wire `feature_flags` into `modules.ts` (today all-or-nothing per role) · retire the legacy Pages mirror or flag-gate it.

---

## Part 3 — Cross-cutting system-adjustment backlog (prioritised)

Synthesised across all eight facets + the UI/IA/usability evals. Ordered by leverage.

### Tier 1 — Structural (touch many facets)

1. **Sub-role + maker-checker layer.** Introduce the scoped sub-roles enumerated above (risk_officer, middle_office, mrv_verifier, tax_filer, ghg_quant, a6_policy, integrity_risk, owners_engineer, ipp_finance, bid_manager, ed_officer, env_specialist, grid_dispatcher, grid_connections, reserves_desk, esg_lender, security_agent, regulator_economist, sre, ml_ops). Gate the "crosses-every-tier" signature actions behind 4-eyes / maker-checker. Restores segregation-of-duties and cuts tile noise per operator. *Highest leverage; sequence by facet.*

2. **Operator read-plane.** One reusable admin-surface pattern over the populated-but-headless tables: DLQ, request_stats, chain_metrics, ai_decisions, KYC/PII, levy arrears, buffer-pool balance. *Every senior persona's #1 friction.*

3. **Join the parallel chains.** Small join objects turn lockstep-but-disconnected chains into traceable funnels: reserve award↔activation (D), capacity-queue↔GCA↔energization (D), wheeling-charge↔access (D), W11→W82 / W17→W4 / W48→W200 / W42→W82 (B), W45+W108+W69 (E), W7/W32↔W46 + W15↔W63 (G), W14→W41→W47 + W25→W64 (G).

### Tier 2 — Facet depth (L4→L5 compute engines)

4. **CPM/EVM engine** (C) — replace caller-typed SPI/EAC with a real activity-network solver.
5. **Cashflow-model engine** (E) — period-vector DSCR/LLCR + sensitivity grid, feeding covenant benchmarks.
6. **GHG quantification worksheet** (B) — capture method, not just the tonnage result.
7. **MYPD revenue-requirement model** (F) — RAB/WACC/RCA computed, not document-referenced.
8. **VaR depth** (A) — component/incremental + backtesting over stored history; SA stress library.
9. **Surveillance taxonomy** (A,F) — structured abuse-pattern enum + scoring + alert→case promotion.
10. **W8 wheeling → L4 chain** (D) — state machine + dunning + indexation.
11. **Mirror-chain netting** (G) — netted monthly position per PPA counterparty.

### Tier 3 — UI / IA / usability (from the parallel evals)

12. **Deal Desk renders ~unstyled** — `.deal-col h2`, `.dcard-top/-meta/-acts`, `.author-bar`, `.deal-empty` have zero CSS (DealDeskPage.tsx). *Visible breakage; fix first of this tier.*
13. **`window.confirm()` breaks the chrome** (HorizonPage.tsx:114) → in-canvas veil; also add a destructive-action confirm to Thread oxide actions (ThreadPage.tsx:202), which today fire with no confirmation — inconsistent with Horizon.
14. **Busy buttons eat their label** — `'…'` replaces verb (HorizonPage:300, ThreadPage:204); keep verb + spinner. Scope busy-disable to the firing case, not all (HorizonPage:296 `acting!==null`→`busy`).
15. **Thread case record is a raw `String(v)` dump** (ThreadPage.tsx:163-174) → formatted, open by default.
16. **159 free-text `reason_code` fields → enums** (chain-registry-meridian.ts) for true L4 structured reason codes; per-action reason sets are itemised in the persona "adjustments" above.
17. **423 generic cascadeHints → regenerate from real `fireCascade` fan-out.**
18. **De-cryptify field labels** — acronym dictionary (ROD→"Decision rationale", DSCR/LLCR/PDD/LoA…), collapse "<Verb> basis/ref/notes".
19. **Backfill registry nulls** — 19 titleCol, 59 counterpartyCol, 82 quantumCol (e.g. carbon_registration has no tonnage/value, so origination sees case counts not weighted pipeline).
20. **KPI unit `pct`** for the Horizon band (delivered_pct shows "27" not "27%", HorizonKpis.tsx) + non-color severity cue on alert/crit tiles (HorizonKpis.tsx:202) + unify status casing (components.tsx uppercase vs humanizeKey title-case). *Note: the Ledger KPI band already derives `zar`/`count` units from the registry compute kind — fix #7, shipped.*
21. **Usability floor** — block (not advise) initiation when un-KYC'd; default `/onboard` on onboarding-state fetch failure (App.tsx:559); surface a notice for unresolved `?act=` deep-links (ThreadPage.tsx:48). Reachability predicate already makes dead-end tiles structurally impossible — keep that invariant.

### Tier 4 — Platform hygiene

22. Atomic sensitive-bucket rate-limit (DO counter) · field-level PII encryption + secret rotation · `cron_runs` ledger + alerting · SPA Vitest/RTL runner + concurrency-capable test-D1 · `feature_flags`→`modules.ts` wiring · ratchet 40 dead Atlas tiles → 0 · retire legacy Pages mirror.

---

## Part 4 — How to use this catalogue

- **To tune UX:** each persona's *friction* line is a discoverability or depth defect on a specific surface; the *adjustment* line is the fix. Tier-3 is the polish backlog.
- **To plan engineering:** Tier-1/2 are the L4→L5 roadmap; each item names the files. Sequence by facet to keep cascade/registry edits coherent (graphify-first).
- **To seed demo personas:** this is a documented catalogue. If demo participants are wanted for these 50, it's a single idempotent migration (demo D1 only — live is read-only) following the 518 pattern. Opt-in, not done here.
- **Security invariant unchanged:** chain SQL identifiers stay sourced from the static `MERIDIAN_CHAINS` literal; new sub-roles bind to `?` params and the existing `roles:` arrays — no request input reaches an identifier.

---

*Sources: 8 read-only facet sweeps citing `src/routes/*`, `src/utils/chain-registry-meridian.ts`, `src/do/order-book.ts`, `pages/src/meridian/*`, `pages/src/ux-alternatives/launchpad-nav/roleData.ts`, `wrangler.toml`, `.github/workflows/*`. Incumbent profiles: `migrations/518_seed_expert_persona_profiles.sql`.*
