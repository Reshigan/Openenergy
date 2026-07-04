# CEC · Open Energy Platform — Detailed Functionality per Role

**Due-diligence pack for NTT evaluation** · companion to `CEC_NTT_Due_Diligence.pptx`
South African energy exchange · `cec.vantax.co.za` (legacy `oe.vantax.co.za`)
Aligned to ERA 2006 · NERSA Grid Code · POPIA · Carbon Tax Act · REIPPPP · JSE-SRL

---

## How to read this document

This is capability evidence, not a brochure. Every functionality line maps to a **governed lifecycle chain** in the static registry `MERIDIAN_CHAINS` (`src/utils/chain-registry-meridian.ts`) or to a registered route. The platform ships **204 chains across 11 roles** as server-enforced state machines — not CRUD forms.

**Depth grades** (the team's scorecard):

| Grade | Meaning |
|---|---|
| L1 | Mock UI only — *not shipped* |
| L2 | CRUD + list/form, no state machine — *rejected for new work* |
| L3 | State machine + server-side transition validation + audit on every move — *floor* |
| L4 | Full workflow: pre-trade gating, downstream cascades, timer-driven SLAs, structured reason codes, dunning/escalation, evidence chain — *default* |
| L5 | Regulator-grade: tamper-evident audit, certified exports (NERSA/EMIR), reconciliation against external systems — *top* |

---

## Platform-wide controls (every role inherits)

These are wired through god-nodes that **every material mutation passes through** — they are not per-feature add-ons.

| Control | What it does |
|---|---|
| **Cascade engine** (`fireCascade`) | Fans every material mutation to action queues, audit chains, briefings, notifications, webhooks — DLQ + retry per stage. |
| **Hash-chain audit** (W118) | Tamper-evident, append-only ledger; each block hash-links its predecessor. |
| **Tenant isolation** | Every resource fetch resolves tenant from the JWT and enforces isolation before any row is returned. |
| **Pre-trade guards** | Composed rejection rules — credit, exposure, mark-age, halt, KYC — gate orders before they reach the book; structured reason codes. |
| **Advisory locks** | D1-backed locks serialise matching and settlement so netting/clearing cannot race. |
| **AI inline assists** | No AI tabs — inline cards carry a "why" + 1-click accept; every acceptance audited to `ai_decisions`. Workers-AI binding, no external keys. |
| **Cron SLA sweeps** | Seven schedules drive surveillance, VWAP marks, metering rollups, PPA settlement, margin-call cycles, anomaly scans, monthly invoicing. |
| **Certified export + reconciliation** (W119/W120) | Certified regulator export packs and reconciliation attestation close the L5 evidence loop. |

**Test posture:** 8,441 unit tests green · per-role smoke (crud/roles/cron) · k6 load · Playwright browser.

---

## 1. IPP Developer
*Originate, finance, build and energise generation assets across the REIPPPP lifecycle.* **117 chains — the deepest role on the platform.**

**Major process flow:** Procurement / RFP → Financial close · drawdown → Construction / COD → Grid connection (GCA) → Energisation → Operate & report

| Domain | Representative features (live surfaces) | Depth |
|---|---|---|
| Project Controls | WBS/Gantt schedule, EVM cost management, change orders & variations, risk register (Monte-Carlo), submittal log & RFI | L4–L5 |
| Construction | Daily field reports, submittals/transmittals, RFIs, punch list / COD snag, ITP, handover dossier / turnover | L4 |
| Documents | Document control, technical queries, method statements, construction diary | L4 |
| Finance | Drawdown (UoP), change-order EVM, insurance claim, bond expiry / cure | L4 |
| Regulatory | NERSA licence application (ERA ss8–11), Construction/COD certification (§C-5, IE gate), REIPPPP ED commitment | L5 |
| Predictive ML | Asset prognostics / RUL hand-off to O&M | L4 |

**Regulatory basis:** ERA 2006 ss8–11 · NERSA Grid Code · REIPPPP · NEMA/EIA · IEC 61724/62446 · FIDIC
**Headline chain:** `cod_chain` — Construction/COD → `cod_certified` (Independent Engineer gate).
**Cross-role:** drawdown ↔ Lender · GCA ↔ Grid · licence ↔ Regulator · handover ↔ EPC.

---

## 2. Trader
*Run the power exchange front-to-back under market-conduct rules.* **17 chains.**

**Major process flow:** Pre-trade credit check → Order entry → Match (OrderBook DO) → Settlement (DvP) → Trade reporting → Surveillance

| Domain | Representative features | Depth |
|---|---|---|
| Active Trading | Order entry, RFQ / best-execution, trade allocation / give-up, algo / DEA certification (kill-switch) | L4 |
| Risk & Margin | Pre-trade credit check, position limits (forced-liquidation), counterparty margin call (PFMI waterfall), daily VaR | L4–L5 |
| Post-trade | DvP settlement, settlement-fail / CSDR buy-in, daily P&L attribution | L4 |
| Compliance | OTC trade reporting (SA-EMIR), market-abuse / STOR cases, JIBAR-cessation benchmark transition | L5 |

**Regulatory basis:** FSCA CS1/2020 · FAIS · FMA s41 · SA-EMIR · PFMI · JSE rules
**Headline chain:** `pretrade_credit_check` → `cleared` | `held_for_review`.
**Cadence:** surveillance scan every 15 min; VWAP marks hourly. OrderBook is a Durable Object per shard.

---

## 3. Lender
*Originate, fund, monitor and work out project debt.* **17 chains.**

**Major process flow:** Credit origination → CP clearance → Drawdown (UoP) → Covenant / DSCR monitoring → Default / step-in → Cure | restructure | write-off

| Domain | Representative features | Depth |
|---|---|---|
| Origination | Credit facility application, credit origination (NCA/Basel scoring) | L4 |
| Disbursement | Drawdown UoP, disbursement clawback, reserve accounts (DSRA/MRA cash-waterfall) | L4–L5 |
| Monitoring | Covenant certificate, DSCR monitoring (IFRS9 + Basel), SLL KPI / margin ratchet | L4 |
| Workout | Loan default / step-in, restructure (A&E), security perfection (Deeds/STRATE), loan transfer | L5 |

**Regulatory basis:** Basel III · SARB / ExCon · Equator Principles · LMA · IFRS 9 · STRATE
**Headline chain:** covenant breach → `cured` | `restructured` | `written_off`.
**Cross-role:** drawdown ↔ IPP · dunning → Regulator.

---

## 4. Offtaker
*Contract, nominate, reconcile and enforce power purchase.* **19 chains.**

**Major process flow:** PPA contract exec → Nomination → Delivery / metering → Annual true-up → Take-or-pay / curtailment → Payment security

| Domain | Representative features | Depth |
|---|---|---|
| Contracting | PPA contract execution (NERSA s34), termination / ETA (involuntary) | L4–L5 |
| Operations | PPA nomination, deviation settlement, REC / GoO lifecycle (Scope-2) | L4 |
| Reconciliation | Annual true-up, delivered-vs-contracted, tariff indexation (CPI repricing) | L4 |
| Claims | Take-or-pay (IFRS16, INVERTED SLA), curtailment claim, change-in-law relief, payment security | L5 |

**Regulatory basis:** NERSA s34 · ERA 2006 · IFRS 16 · IEC 61724 · I-REC / Scope-2
**Headline chain:** `ppa_take_or_pay` — under-nomination accrues (INVERTED SLA); under-delivery pushes the claim to the generator IPP.

---

## 5. Carbon Fund
*Register, verify, issue, retire and adjust carbon credits.* **20 chains — mostly L5.**

**Major process flow:** Registration / PDD → MRV submission (14-state) → Verification → Issuance → Retirement → Article-6 adjustment

| Domain | Representative features | Depth |
|---|---|---|
| Origination | Project registration / PDD, PoA-CPA inclusion (geo double-count guard), crediting-period renewal | L4–L5 |
| MRV | 14-state MRV chain, ESG disclosure, credit-quality / ICVCM CCP rating (Sylvera-class) | L5 |
| Lifecycle | Credit issuance (bridges MRV→retirement), retirement (per-scope SLAs), reversal / buffer-pool (AFOLU) | L5 |
| Markets | Article-6 ITMO adjustment, ERPA forward delivery, carbon-tax offset claim (Tax Act §13, clawback) | L5 |

**Regulatory basis:** Paris Article 6.4 · Gold Standard · Verra VCS · Carbon Tax Act · ICVCM · SARS
**Headline chain:** MRV 14-state → `issued`; ITMO double-count guards on adjustment.

---

## 6. Grid Operator
*Connect, allocate, energise, dispatch and balance the network.* **23 chains.**

**Major process flow:** Connection (GCA) → Capacity allocation / queue → Energisation → Dispatch nomination → Reserve / curtailment → Imbalance settlement

| Domain | Representative features | Depth |
|---|---|---|
| Connection | Grid Connection Agreement (Code C-1, 3-terminal), capacity allocation / queue, REZ capacity, energisation | L4–L5 |
| Dispatch | Dispatch nominations (BRP→SO + dispute), reserve activation, black-start capability (OC-1/OC-12) | L4 |
| System security | Load curtailment (CSC-1, tighter SLA per shed stage), transmission outage (N-1), planned outage | L4 |
| Settlement | Imbalance settlement (MTU pricing), grid-code compliance monitoring (NRS097), SCADA/IEC-61850 connector | L4–L5 |

**Regulatory basis:** NERSA Grid Code · NRS 097 · IEC 60870/61850 · NTCSA 2024 · ERA s24
**Headline pattern:** higher load-shed stage → tighter SLA (escalating).
**Cross-role:** GCA & energisation ↔ IPP · dispatch ↔ BRP/Trader.

---

## 7. Support / OEM
*Resolve incidents, dispatch field work and run asset reliability.* **25 chains.**

**Major process flow:** Ticket → Work-order dispatch → RMA / warranty → Problem (root-cause) → Change enablement → Security remediation

| Domain | Representative features | Depth |
|---|---|---|
| Service desk | Support tickets (priority-tiered SLA), service request (ITIL4) | L4 |
| Field & parts | Work-order dispatch (critical crossing), spare-parts provisioning (VED), FCO/ECN campaign (Windchill-class) | L4 |
| Reliability | Problem management (ITIL root-cause), warranty claim / recovery, service contract / AMC (ServiceMax-class) | L4 |
| Predictive | **Asset prognostics — RUL (the NTT-beating surface)**, security remediation (OT vuln, CVSS) | L4–L5 |

**Regulatory basis:** ITIL 4 · OHSA · IEC 61724/62446 · NRCS / CPA
**Headline chain:** ticket → `resolved`; critical work-order crosses to Grid.
**NTT comparator:** `asset_prognostics` (W71) computes Remaining Useful Life and drives spare-parts provisioning (W72).

---

## 8. Regulator
*License, inspect, enforce and determine tariffs.* **29 chains — regulator-grade L5 throughout.**

**Major process flow:** Licence application → Compliance inspection → Enforcement (s35) → Disposition → Certified export pack

| Domain | Representative features | Depth |
|---|---|---|
| Licensing | NERSA licence application (ERA ss8–11), licence renewal (s14–16), SSEG / Schedule-2 | L5 |
| Oversight | Compliance inspection (§10/§34/§35), grid-code compliance, complaints / disputes (ERA s30) | L5 |
| Enforcement | Enforcement action (s35), disposition, NERSA levy assessment (§5B) | L5 |
| Tariff | MYPD determination (§15–16, INVERTED SLA), tariff indexation, consultation notice (PAJA public-comment) | L5 |

**Regulatory basis:** ERA s10/24/35 · PAJA · NERSA Penalties 2018 · POPIA · FSCA
**Headline chain:** licence application → `granted` | `refused` (refuse crosses to ALL).
**Output:** certified export packs (XBRL) emit from the hash-chain ledger.

---

## 9. Platform Admin
*Onboard tenants, prove integrity and run governance.* **4 platform chains — the integrity & governance spine.**

**Major process flow:** KYC verification → Tenant lifecycle → Hash-chain audit block → Control-environment audit → Certified export

| Domain | Representative features | Depth |
|---|---|---|
| Identity | KYC verification, tenant onboarding & isolation enforcement | L4–L5 |
| Integrity | Hash-chain audit block (W118), reconciliation attestation (W120) | L5 |
| Governance | Control-environment audit (SOC2 / ISO 27001), certified regulator export (W119) | L5 |
| Operations | Cron orchestration, sensitive-route rate-limiter, monthly platform invoice run | L4 |

**Regulatory basis:** POPIA · Companies Act · FSCA · Information Regulator SA · SOC2 / ISO 27001
**Headline chain:** hash-chain block append → `sealed` (tamper-evident). **Underwrites every other role's L5 evidence claims.**

---

## 10. ESCO / O&M
*Commission, operate, predict and assure generation revenue.* **17 chains.**

**Major process flow:** Commissioning → Work orders / PM → Permit-to-work (LOTO) → Asset prognostics (RUL) → Availability / LD → Revenue assurance

| Domain | Representative features | Depth |
|---|---|---|
| Site portfolio | Commissioning (planned→in_om), service contracts, sites portfolio | L4 |
| O&M execution | Work orders, PM compliance (IEC 62446), permit-to-work / LOTO (OHSA) | L4 |
| Asset health & AI | **Asset prognostics / RUL (NTT-beating)**, availability guarantee / LD (IEC 61724), BESS SOH (augmentation) | L4–L5 |
| Assurance | Generation revenue assurance (meter recon, metering code), soiling / recovery audit, PR underperformance | L4 |

**Regulatory basis:** IEC 61724 (PR) · IEC 62446 · OHSA / LOTO · SA metering code
**NTT comparator:** the Esums predictive layer is explicitly benchmarked to beat NTT-grade asset management; predictive RUL drives spare-parts provisioning.

---

## 11. EPC Contractor
*Control quality, documents and handover on the build.* **6 chains.**

**Major process flow:** Submittals → ITP inspection → NCR → Punch list → Method statement → Handover

| Domain | Representative features | Depth |
|---|---|---|
| Document control | Submittals / transmittals, RFIs, technical queries, change orders | L3–L4 |
| Quality management | ITP (inspection & test plan), NCR (non-conformance), punch list | L4 |
| Site setup | Method statements, construction diary | L3–L4 |
| Safety & handover | HSE incident (safety-only crossing), handover dossier | L4 |

**Regulatory basis:** FIDIC · ISO 9001 (ITP/NCR) · OHSA · ISO 14001
**Headline chain:** NCR raised → `closed`; HSE incident crosses on safety. **Feeds IPP COD + handover.** Procore / Aconex-class quality and document control.

---

## Due-diligence assertions — what a reviewer can verify

1. **Depth is real, not a demo.** Every role surface is a server-enforced state machine (L3 floor / L4 default / L5 regulator-grade). No L2 CRUD ships. 8,441 unit tests green.
2. **Controls are platform-wide.** Cascade, hash-chain audit, tenant isolation, pre-trade guards, locks, AI audit and cron SLAs run through god-nodes every mutation passes — not per-feature bolt-ons.
3. **Regulatory spine is explicit.** Each surface maps to named statute/code — ERA 2006, NERSA Grid Code, SA-EMIR, PFMI, Basel III, IFRS 16, Carbon Tax Act, Paris Article 6, POPIA.
4. **Integrity is provable.** Tamper-evident hash-chain ledger (W118) + certified regulator export packs (W119) + reconciliation attestation (W120) close the L5 evidence loop.
5. **Predictive layer targets NTT.** ESCO/Support asset-prognostics (W71) computes RUL and drives spare-parts provisioning — built to beat NTT-grade asset management.

---

*Source of truth: `MERIDIAN_CHAINS` (`src/utils/chain-registry-meridian.ts`) · role config `roleData.ts` · 508 migrations · single Cloudflare Worker. Chain counts are surfaces presented to each role; some chains are shared across roles via cross-role crossings.*
