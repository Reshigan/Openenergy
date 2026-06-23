# Open Energy Platform: Features by Role

A support engineer's reference to what every user role can see and do in the Open Energy Platform front end. Everything in this document is taken directly from the code that ships the UI: the per-role function catalogue in `pages/src/ux-alternatives/launchpad-nav/roleData.ts`, the chain registry in `src/utils/chain-registry-meridian.ts` (`MERIDIAN_CHAINS`), and the surface allow-list in `pages/src/meridian/surfaces.tsx` (`SURFACE_REGISTRY`).

## What Meridian is

Meridian is the single front-end shell of the platform. After a user logs in, every screen they see is wrapped by one chrome component (`MeridianFrame`). The older per-role "workstation" pages were retired; all of their tabs were either moved to a generic chain screen (`/ledger`) or to a generic surface screen (`/surface`). A user's role (taken from their login token) decides which functions appear.

A user's role value is the long, suffixed form used in the token, not the short login name. So the IPP developer's role is `ipp_developer`, the grid operator's is `grid_operator`, the carbon fund's is `carbon_fund`. The short demo emails (`ipp@`, `grid@`, `carbon@`) map to these. The ESCO / O&M operator appears under two role spellings, `esums_owner` and `esco`, which both load the same configuration.

### The 6 surface types

These are the kinds of screen a user can land on. Most features in this document resolve to one of these.

- **Horizon** (`/horizon`): the role's live home workspace. It shows the in-flight (not yet finished) chain cases the role is allowed to see, grouped into urgency lanes. This is the default landing screen for a returning user.
- **Atlas** (`/atlas`, opened with the Command-K shortcut): the function library and search. Every tile the user sees here comes from their role's domains and features in `roleData.ts`. A tile only shows if it resolves to a real chain, a real route, or a registered surface; otherwise it is hidden.
- **Ledger** (`/ledger/:chainKey`): the list screen for one chain (one type of workflow case). It lists existing cases and, where the chain allows it, has a "+New" button to start a new case.
- **Thread** (`/thread/:chainKey/:id`): the detail screen for a single chain case, showing both sides of a cross-role transaction and its timeline.
- **Deal Desk** (`/deals`): a place to author and track deals; `/deals/new` is a transaction picker that deep-links into a Ledger in compose mode.
- **`/surface/:key`**: one generic route that renders whatever non-chain screen is registered for the signed-in role under the key `<role>:<key>` in `SURFACE_REGISTRY`. This covers master-data lists, settings, analytics, connectors, and report panels that are not workflow chains.

### How a feature resolves (the three columns you will see)

Each feature in `roleData.ts` resolves one of three ways. The role tables below label each feature with which one applies:

- **chain**: the feature has a `chainKey`. Atlas links it to `/ledger/:chainKey` and it is backed by a `MERIDIAN_CHAINS` descriptor (a state-machine workflow with a database table, statuses, and actions).
- **route**: the feature has an explicit `route` (for example `/esg`, `/procurement`). Atlas links straight to that standalone page.
- **surface**: the feature has neither; Atlas routes it to `/surface/:featureKey`, and it must have a matching `<role>:<key>` entry in `SURFACE_REGISTRY`. These are non-chain screens (lists, connectors, reports, audit panels).

### A note on "initiate vs view" accuracy

For each role below there is a note on which chains the role can start (initiate) versus only view. This is derived two ways from the code: a chain can be started from its Ledger only if the descriptor has an `initiation` block, and the role must be among the actor roles allowed to act on it. Where the descriptor has actions but no `initiation` block, cases are created by an upstream process or cron rather than by the user clicking "+New". These notes are a faithful summary of the registry but the precise per-action permission is enforced server-side per action, so treat them as a guide, not a permission matrix.

### Feature-depth note

The team grades features L1 (mock) to L5 (regulator-grade). New work targets L4 (full workflow with gating, cascades, timers, evidence). Many features below are full chains (L3 to L5); some are simpler list or report surfaces. Where a feature is a plain list or report it is noted as such.

---

## admin (Platform Admin)

Who this is: the platform operator. Manages tenants and users, runs platform billing and cron, oversees trading operations and market halts, and owns the platform-wide audit and compliance tooling.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Tenants & Users | Tenant lifecycle | surface (`tenant_events`) | Onboard, KYC, activate and suspend tenants. |
| Tenants & Users | Users | surface (`users`) | User accounts across all tenants. |
| Tenants & Users | Feature flags | surface (`flags`) | Global and per-tenant feature flag overrides. |
| Tenants & Users | KYC / FICA | chain (`kyc_verification`) | KYC/FICA verification queue. |
| Tenants & Users | POPIA rights | surface (`popia`) | Data subject access and erasure requests. |
| Tenants & Users | PII access log | surface (`pii_access`) | POPIA cross-tenant PII access audit log. |
| Platform | Billing runs | surface (`billing`) | Monthly subscription billing and invoicing. |
| Platform | Subscription billing | surface (`subscription_billing`) | Platform SaaS-invoice oversight with a dunning ladder. |
| Platform | Settlement audit | surface (`settlement_audit`) | Settlement reconciliation and break review (audit panel). |
| Platform | Platform audit | surface (`platform_audit`) | Full platform audit log of cascade events. |
| Platform | Cron jobs | surface (`cron`) | Manual cron-job trigger and dry-run. |
| Platform | Monitoring | surface (`monitoring`) | Cascade dead-letter queue, errors, system health. |
| Platform | Revenue dashboard | route (`/admin/revenue`) | Platform fee revenue by tenant. |
| Platform | Reports & exports | surface (`reports`) | Platform events and role-action-queue reports with exports. |
| Trading Ops | Trading operations | route (`/ops/depth`) | Order book health and circuit breakers. |
| Trading Ops | Settlement operations | route (`/settlement-ops`) | Settlement run triggers and reconciliation. |
| Trading Ops | Market halt controls | surface (`market_halt`) | NERSA-authorised market halt set and lift. |
| Compliance & Audit | Audit chain | chain (`audit_chain_block`) | Tamper-evident Merkle audit chain. |
| Compliance & Audit | Regulator exports | chain (`regulator_export_pack`) | Certified regulatory export packs. |
| Compliance & Audit | Reconciliation attestation | surface (`reconciliation_attestation`) | CA(SA)-signed reconciliation packs (operator view). |
| Compliance & Audit | Control environment | chain (`control_environment_audit`) | Annual internal control audit cycle. |
| Compliance & Audit | ESG reporting | route (`/esg`) | Platform-wide ESG aggregate reports. |
| Compliance & Audit | Contract templates | surface (`contracts_admin`) | Platform contract template registry. |
| Intelligence | Executive dashboard | route (`/dashboard`) | CEO/COO platform KPI dashboard. |
| Intelligence | AI intelligence | route (`/intelligence`) | Platform AI decision audit trail. |
| Intelligence | Briefing | route (`/briefing`) | Daily AI briefings per role. |
| Intelligence | Anomaly detection | surface (`anomaly_admin`) | Platform anomaly ML monitoring. |
| Intelligence | RUL prediction | surface (`rul_prediction_admin`) | Platform remaining-useful-life ML monitoring. |
| Intelligence | Fault fingerprint | surface (`fault_fingerprint_admin`) | Platform fault-fingerprint ML monitoring. |
| Integrations | Settlement rails | surface (`settlement_rails`) | STRATE/SWIFT settlement connectors. |
| Integrations | ERP connectors | surface (`erp_connectors`) | SAP/Oracle ERP integration. |
| Integrations | Filing connectors | surface (`filing_connectors`) | NERSA/SARS government filing connectors. |
| Integrations | Marketplace | route (`/marketplace`) | Connector and service marketplace. |

Chains admin can initiate (have a "+New" on their Ledger): `audit_chain_block`, `regulator_export_pack`, `control_environment_audit`, `kyc_verification`. Admin's chains are all operator-owned, so admin has no view-only chains in its own lanes.

---

## trader (Trader)

Who this is: a power and carbon trader. Works the live order book and positions, manages risk and margin, handles post-trade settlement and reporting, and is subject to market-conduct surveillance and algo certification.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Active Trading | Open orders | surface (`orders`) | Live order book (GTC/IOC/FOK orders). |
| Active Trading | Positions | surface (`positions`) | Real-time position marks across energy types. |
| Active Trading | Trade blotter | surface (`trades`) | Executed trades with profit-and-loss attribution. |
| Active Trading | Rejections | surface (`rejections`) | Pre-trade guard rejections with an explainer. |
| Risk & Margin | Risk dashboard | surface (`risk`) | Daily value-at-risk, scenarios and exposure limits. |
| Risk & Margin | Margin calls | surface (`margin`) | Initial/variation margin call lifecycle. |
| Risk & Margin | Position limits | chain (`poslimit_case`) | FSCA position-limit breach machine. |
| Risk & Margin | Counterparty margin | chain (`counterparty_margin`) | Counterparty margin call and default management. |
| Risk & Margin | Benchmark transition | chain (`benchmark_transition`) | LIBOR/JIBAR to ZARONIA migration. |
| Post-trade & Settlement | Settlement | chain (`settlement_fail`) | Daily settlement runs and breaks. |
| Post-trade & Settlement | Trade allocation | chain (`trade_allocation`) | Block-to-per-account trade allocation. |
| Post-trade & Settlement | Trade reporting | chain (`trade_report`) | FMA post-trade repository reporting. |
| Post-trade & Settlement | Best-execution / RFQ | chain (`best_execution`) | FSCA conduct-standard request-for-quote chain. |
| Post-trade & Settlement | Post-trade exceptions | surface (`exceptions`) | Price/volume/settlement mismatch triage. |
| Post-trade & Settlement | Imbalance settlement | chain (`imbalance_settlement`) | Grid imbalance cash-out settlement. |
| Post-trade & Settlement | Black start | chain (`black_start`) | Black-start cost recovery. |
| Compliance & Reporting | Market surveillance | chain (`market_abuse_case`) | FMA market-abuse and STOR machine. |
| Compliance & Reporting | MM compliance | surface (`oe_mm_obligations`) | Market-making consecutive-miss breach tracking. |
| Compliance & Reporting | Algo certification | chain (`algo_certification`) | Pre-deployment algo/DEA certification gate. |
| Compliance & Reporting | ESG / sustainability | route (`/esg`) | ESG disclosure and Scope 3 reports. |
| Compliance & Reporting | Article 6 ITMO | chain (`article6_adjustment`) | UNFCCC corresponding-adjustment ledger. |
| Compliance & Reporting | Settlement rails | surface (`strate-swift`) | STRATE/SWIFT settlement connectors. |
| Compliance & Reporting | ERP connectors | surface (`sap-oracle-erp`) | SAP/Oracle ERP integration. |
| Compliance & Reporting | Filing connectors | surface (`government-filing`) | NERSA/SARS government filing connectors. |
| Compliance & Reporting | Reports & exports | surface (`reports`) | Trade settlement, best-execution and FSCA reports with exports. |
| Compliance & Reporting | Audit & compliance | surface (`audit`) | Tamper-evident audit chain and trade reconciliation. |

Note: the MM-compliance feature has no `chainKey` on purpose (its table is not modelled as a case list), so it is reached as a surface, not a Ledger.

Chains trader can initiate: `article6_adjustment`, plus the report/agreement chains in the trader lane that carry an initiation form (for example `cross_border_trade`, `fsca_compliance_report`, `fsca_conduct_report`, `isda_agreement`). Mostly view/act-only (created upstream by trading or settlement processes): `settlement_fail`, `poslimit_case`, `counterparty_margin`, `trade_allocation`, `trade_report`, `best_execution`, `market_abuse_case`, `benchmark_transition`, `black_start`, `pretrade_credit_check`, `pnl_attribution`.

---

## ipp_developer (IPP Developer)

Who this is: an Independent Power Producer developing and operating a generation project. This is the widest role in the platform: it spans project controls, construction, document control, finance, risk and quality, regulatory compliance, safety and grid, predictive ML, and environmental.

This role has by far the most features. The table below groups them by domain; descriptions are condensed from the registry and route purposes.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Project Controls | My projects | surface (`projects`) | Active project portfolio with status, phase and health. |
| Project Controls | Milestones | surface (`milestones`) | Milestone tracking with variance analysis. |
| Project Controls | Schedule pulse | surface (`schedule`) | Critical-path summary and schedule health. |
| Project Controls | WBS & Gantt | chain (`ipp_schedule`) | Work breakdown structure with CPM Gantt. |
| Project Controls | Cost & EVM | chain (`ipp_evm`) | Earned-value management (CPI, SPI, EAC). |
| Project Controls | Milestone variance | chain (`milestone_variance_report`) | Formal milestone variance reports. |
| Construction | Procurement / RFPs | chain (`procurement_rfp`) | REIPPPP RFP and procurement chain. |
| Construction | Construction / COD | chain (`cod_chain`) | NERSA construction and commercial-operation-date workflow. |
| Construction | Subcontractors | chain (`ipp_subcontractor`) | Subcontractor register and compliance. |
| Construction | Daily field report | chain (`dfr`) | Construction daily field reports. |
| Construction | Site diary | chain (`ipp_construction_diary`) | Site diary and inspection records. |
| Construction | Punch list | chain (`punch_list`) | Pre-COD punch list items and closure. |
| Construction | Material inspections | chain (`ipp_mir`) | Material inspection request records. |
| Construction | Handover dossier | chain (`handover_dossier`) | O&M handover documentation package. |
| Construction | Change orders | chain (`project_change_order`) | Project change-order/variation control. |
| Construction | Submittals / RFIs | chain (`submittal_rfi`) | EPC submittal and RFI document control. |
| Documents | Document control | chain (`ipp_doc_control`) | Project document register and revision control. |
| Documents | Submittals | chain (`ipp_submittal`) | EPC submittal register. |
| Documents | RFIs | chain (`ipp_rfi`) | Requests for information. |
| Documents | Technical queries | chain (`ipp_tq`) | Engineering technical query register. |
| Documents | Site instructions | chain (`site_instruction`) | Engineer site instructions. |
| Documents | DLP defects | chain (`dlp_defect`) | Defects-liability-period tracking. |
| Documents | Variation orders | chain (`variation_order`) | Variation order chain. |
| Documents | Payment certificates | chain (`ipp_payment_cert`) | Progress payment certificates. |
| Documents | Final completion | chain (`ipp_final_completion`) | Final completion certificate. |
| Documents | O&M handover | chain (`ipp_om_handover`) | O&M handover package. |
| Finance | Insurance | surface (`insurance`) | Active insurance policies register. |
| Finance | Insurance claims | chain (`insurance_claim`) | FSCA insurance claim workflow. |
| Finance | Bonds | chain (`ipp_performance_bonds`) | Performance bonds and expiry countdown. |
| Finance | Progress claims | chain (`ipp_progress_claim`) | Progress-claim certification chain. |
| Finance | Conditions Precedent | chain (`cp_tracker`) | Financial-close CP tracker. |
| Finance | Drawdown requests | chain (`drawdown`) | SARB/IE-gated drawdown chain. |
| Finance | Green bond reports | chain (`green_bond_report`) | Green-bond framework reports. |
| Finance | DSCR reports | chain (`dscr_report`) | Debt-service-coverage-ratio reports. |
| Finance | Credit insurance | chain (`credit_insurance`) | Credit insurance facility. |
| Finance | Take-or-pay claims | chain (`curtailment_claim`) | Generator-side take-or-pay claim chain. |
| Risk & Quality | Stage gates | chain (`stage_gate`) | DG0 to DG4 development gate reviews. |
| Risk & Quality | Risk register | surface (`risk_register`) | Project risk register (severity by likelihood). |
| Risk & Quality | Issues log | surface (`issues_log`) | Open issues and resolution tracking. |
| Risk & Quality | Stakeholder register | surface (`stakeholder_register`) | Stakeholder map and engagement log. |
| Risk & Quality | ITP / Quality plan | chain (`itp`) | Inspection and test plan. |
| Risk & Quality | Risk analysis (EMV) | chain (`project_risk`) | Quantitative risk EMV/SRA analysis. |
| Risk & Quality | Non-conformance | chain (`ncr`) | NCR log and corrective actions. |
| Risk & Quality | Lessons learned | surface (`lessons_learned`) | Project lessons-learned register. |
| Risk & Quality | Reports & exports | surface (`reports`) | REIPPPP, milestone-variance, DSCR and generation reports. |
| Risk & Quality | Annual compliance report | surface (`annual_report`) | NERSA annual compliance report with CSV/PDF export. |
| Risk & Quality | Audit & compliance | surface (`audit`) | Tamper-evident audit chain and milestone-evidence reconciliation. |
| Regulatory Compliance | Licence obligations | chain (`licence_obligation`) | NERSA licence obligation register. |
| Regulatory Compliance | ED commitments | chain (`ed_commitment`) | REIPPPP economic-development commitments. |
| Regulatory Compliance | Local content & SED | chain (`ipp_lcr`) | Local content and SED compliance. |
| Regulatory Compliance | BBBEE verification | chain (`ipp_bbbee`) | Annual BBBEE verification. |
| Regulatory Compliance | REIPPPP progress report | chain (`ipp_rpr`) | Annual REIPPPP progress report. |
| Regulatory Compliance | NERSA licence return | chain (`ipp_anr`) | Annual NERSA licence return. |
| Regulatory Compliance | Annual audit | chain (`ipp_aud`) | Financial statements and audit. |
| Regulatory Compliance | CBT/SED DMRE report | chain (`cbt_sed_report`) | CBT/SED DMRE report review. |
| Safety & Grid | HSE incidents | chain (`hse_incident`) | OHSA/NEMA incident chain. |
| Safety & Grid | Cyber incidents | chain (`cyber_incident`) | POPIA cyber incident chain. |
| Safety & Grid | Planned outages | chain (`planned_outage`) | NERSA Grid Code planned outage chain. |
| Safety & Grid | Grid connection | chain (`gca_connection`) | NERSA Grid Code connection agreement. |
| Safety & Grid | Method statements | chain (`ipp_method_statement`) | Construction method-statement register. |
| Safety & Grid | Warranty / RMA | chain (`warranty_claim`) | OEM warranty and RMA claims. |
| Safety & Grid | Grid export curtailments | chain (`export_curtailment`) | Grid export curtailment claims. |
| Safety & Grid | GTIA | surface (`gtia`) | Grid Technical Interface Agreement (protection/SCADA settings). |
| Safety & Grid | Community | surface (`community`) | Per-project ED/SED commitments and engagement log. |
| Predictive ML | Inverter integrations | surface (`integrations`) | Connect generation assets (Solax and other inverters). |
| Predictive ML | SCADA connectors | surface (`scada`) | SCADA telemetry connector. |
| Predictive ML | MQTT / OPC-UA | surface (`mqtt-opcua`) | Industrial MQTT/OPC-UA telemetry connector. |
| Predictive ML | Anomaly detection | surface (`anomaly-detection`) | Predictive anomaly-detection ML on telemetry. |
| Predictive ML | RUL prediction | surface (`rul-prediction`) | Remaining-useful-life prediction. |
| Predictive ML | Fault fingerprint | surface (`fault-fingerprint`) | Physics-based fault-fingerprint diagnostics. |
| Predictive ML | Invite partners | surface (`invite_partners`) | Invite lenders, offtakers and carbon funds to your projects. |
| Environmental | EA amendment | chain (`ipp_eam`) | Environmental-authorisation amendment. |
| Environmental | Water use licence | chain (`ipp_wul`) | DWAF water-use licence. |
| Environmental | Heritage assessment | chain (`ipp_hra`) | SAHRA heritage-resources assessment. |
| Environmental | Atmospheric emission | chain (`ipp_ael`) | DEA atmospheric-emission licence. |
| Environmental | Environmental monitoring | chain (`ipp_env_monitoring`) | EMP compliance monitoring reports. |

Chains: `ipp_developer` is in the lane for the largest number of chains. Most of the `ipp_*` chains and document/finance/environmental chains have an initiation form, so the IPP developer can start them from the Ledger. Some chains the IPP only participates in as a counterparty and views rather than starts: for example `covenant_certificate`, `credit_facility_application`, `drawdown`, `disbursement_case`, `loan_default`, `reserve_account`, `construction_cost_report`, `compliance_inspection`, `licence_application`, `licence_renewal`, `ed_commitment` (regulator-fed), `gca_connection`, `connection_energization`, `planned_outage`, `grid_code_compliance`, `ppa_take_or_pay`, `tariff_indexation`, `ppa_payment_security`, `ppa_termination`, `rec_lifecycle` (offtaker-led), and `warranty_claim` (OEM/support-led). Treat the registry as the source of truth per chain.

There is an `ipp_acr` (annual-report) tab in the old code whose `chainKey` is not in `MERIDIAN_CHAINS`; it is now served as the `annual_report` surface, not a Ledger.

---

## esums_owner / esco (ESCO / O&M Operator)

Who this is: an Energy Services Company or O&M operator running a fleet of generation sites: live operations, work orders, asset health and AI prognostics, spare-parts supply chain, safety permits, data integrations, and revenue assurance. Both role spellings (`esums_owner` and `esco`) load the same configuration. Surfaces are registered under the `esco:` prefix.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Operations | Cockpit | surface (`cockpit`) | Live fleet revenue ticker, fault register, health grid, AI briefing. |
| Operations | Opportunities | surface (`opportunities`) | Rule-based scan for monetisable performance improvements. |
| Operations | Sites | surface (`sites`) | Generation sites with live KPIs. |
| Operations | Devices | surface (`devices`) | Inverters, meters, batteries and sensors across all sites. |
| Operations | Faults | surface (`faults`) | Live fault register with revenue-impact engine. |
| Operations | Work orders | surface (`workorders`) | 12-state work-order lifecycle with parts, photos, SLA. |
| Operations | Team | surface (`technicians`) | Field technicians (skills, certs, availability). |
| Operations | Maintenance | surface (`maintenance`) | Scheduled preventive maintenance that creates work orders. |
| Operations | Projects | surface (`projects`) | Portfolio-level project grouping. |
| Operations | Alerts | surface (`alerts`) | All alerts fired across the fleet in the last 7 days. |
| Site Portfolio | Service contracts | chain (`service_contract`) | O&M service contract management. |
| Site Portfolio | Sites portfolio | surface (`sites-portfolio`) | Full site portfolio (status, health, capacity). |
| Work Orders | Work orders | chain (`om_work_order`) | 12-state P6 work-order dispatch chain. |
| Work Orders | PM compliance | chain (`pm_compliance`) | IEC 62446 preventive-maintenance compliance. |
| Work Orders | Permit-to-work | chain (`permit_to_work`) | OHSA/SANS control-of-work gate. |
| Work Orders | Commissioning | chain (`commissioning`) | Site commissioning and energization workflow. |
| Asset Health & AI | Asset prognostics | chain (`asset_prognostics`) | Predictive O&M: anomaly, RUL, fault fingerprint. |
| Asset Health & AI | Availability guarantee | chain (`availability_guarantee`) | IEC 61724 uptime contract and liquidated-damages tracking. |
| Asset Health & AI | BESS state-of-health | chain (`bess_soh`) | Battery degradation and augmentation programme. |
| Asset Health & AI | Soiling audit | chain (`soiling_audit`) | Soiling losses and cleaning economics. |
| Asset Health & AI | Predictive | surface (`predictions`) | AI-derived predictive maintenance signals. |
| Supply Chain | Spare parts | chain (`spare_parts_provisioning`) | VED-criticality requisition to QA to stock to issue. |
| Supply Chain | Parts catalogue | surface (`parts`) | Parts catalogue and stock with low-stock reorder flags. |
| Supply Chain | Vendor escalation | chain (`vendor_escalation`) | CPA vendor claim chain. |
| Supply Chain | Warranty claims | chain (`warranty_claim`) | OEM 10-state RMA workflow. |
| Supply Chain | Warranty recovery | chain (`warranty_recovery`) | Supplier cost-recovery against warranty defects. |
| Safety & Permits | HSE incidents | chain (`hse_incident`) | OHSA/NEMA incident chain. |
| Safety & Permits | Protection tests | surface (`protection-relay-tests`) | NRS 097 / NERSA protection relay and anti-islanding tests. |
| Data & Integrations | Ingestion | surface (`ingestion`) | OEM connections (FusionSolar, SolarEdge, SMA, Sungrow, Modbus, Eskom AMR). |
| Data & Integrations | Integrations | surface (`integrations`) | Connect inverters and generation assets. |
| Data & Integrations | Data sources | surface (`data-sources`) | Sensor connections and data-ingest APIs. |
| Data & Integrations | Participant links | surface (`participant-links`) | Two-party onboarding handshake to downstream participants. |
| Reporting | Audit log | surface (`audit`) | Tamper-evident audit chain and evidence log. |
| Reporting | Revenue assurance | chain (`generation_revenue_assurance`) | Settlement-vs-expected reconciliation and recovery. |
| Reporting | Accruals | surface (`accruals`) | Real-time generation accrual ledger from inverter data. |
| Reporting | Invoices | surface (`settlement-invoices`) | Monthly settlement invoices from the accruals ledger. |
| Reporting | Carbon credits | surface (`carbon-credits`) | Monthly carbon credit records from the accruals ledger. |

Chains esco can initiate: `service_contract`, `commissioning` (both have an initiation form). The rest in the esco lane (`om_work_order`, `pm_compliance`, `permit_to_work`, `asset_prognostics`, `availability_guarantee`, `bess_soh`, `soiling_audit`, `spare_parts_provisioning`, `vendor_escalation`, `warranty_claim`, `warranty_recovery`, `hse_incident`, `generation_revenue_assurance`) are mostly created from operational events, work scheduling or counterparties rather than a manual "+New".

---

## offtaker (Offtaker)

Who this is: the electricity buyer under a Power Purchase Agreement (a corporate consumer or utility). Manages PPA contracts, day-to-day operations and reconciliation, payment security, compliance and ESG disclosure, and reporting.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Contracts | PPA contracts | chain (`ppa_contract_chain`) | NERSA s34 PPA execution chain. |
| Contracts | Tariff indexation | chain (`tariff_indexation`) | Annual CPI repricing chain. |
| Contracts | PPA termination | chain (`ppa_termination`) | PPA termination and early-termination buy-out. |
| Contracts | REC / GO lifecycle | chain (`rec_lifecycle`) | Renewable-attribute certificate lifecycle. |
| Contracts | Change-in-law relief | chain (`ppa_change_in_law`) | Qualifying-change cost pass-through and relief. |
| Contracts | Wheeling access | chain (`wheeling_access`) | Third-party transmission access agreement. |
| Contracts | Virtual PPA / CfD | chain (`virtual_ppa_settlement`) | Contract-for-difference financial PPA settlement. |
| Contracts | SLB KPI ratchet | chain (`slb_kpi_ratchet`) | Sustainability-linked-bond KPI margin ratchet. |
| Contracts | Procurement options | route (`/procurement`) | Active RFP responses and LOI pipeline. |
| Contracts | PPA variations | chain (`ipp_ppavar`) | Signed PPA amendment register. |
| Operations | Take-or-pay obligations | chain (`ppa_take_or_pay`) | Take-or-pay machine. |
| Operations | Curtailment claims | chain (`curtailment_claim`) | Deemed-energy compensation chain. |
| Operations | Energy nominations | chain (`ppa_nomination`) | Day-ahead nomination and deviation settlement. |
| Operations | Annual reconciliation | chain (`ppa_annual_recon`) | Annual true-up and financial close. |
| Operations | Unserved-energy claims | chain (`unserved_energy_claim`) | Use-of-system unserved-energy claim chain. |
| Operations | Delivery reports | surface (`delivery_reports`) | Monthly MWh contracted vs delivered. |
| Operations | Billing & payments | surface (`billing`) | Invoice register and payment status. |
| Operations | Metering & reconciliation | surface (`metering`) | Smart-meter reconciliation data. |
| Operations | Wheeling statements | surface (`wheeling`) | Third-party access wheeling charges. |
| Operations | Sites & groups | surface (`sites`) | Delivery-point and site-group register. |
| Operations | Tariffs | surface (`tariffs`) | Tariff schedule and time-of-use rate register. |
| Operations | Budget vs actual | surface (`budgets`) | Per-period energy budget vs actual consumption. |
| Operations | Bill upload & AI | surface (`bills`) | AI bill analyser, PPA-mix optimiser, LOI drafter. |
| Payment Security | Payment security | chain (`ppa_payment_security`) | Guarantee/LC/PCG bankability backstop. |
| Payment Security | Credit support docs | surface (`credit_support`) | LC, PCG and guarantee register. |
| Payment Security | Obligations register | surface (`obligations`) | Payment-security and contractual obligation register. |
| Compliance | ESG disclosure | chain (`esg_disclosure`) | ESG disclosure and assurance chain. |
| Compliance | Scope 3 value-chain | chain (`carbon_scope3_disclosure`) | Value-chain Scope 3 emission disclosure. |
| Compliance | Carbon offsets | chain (`carbon_offset_claim`) | Carbon Tax Act offset claim management. |
| Compliance | REC retirement | surface (`rec_retirement`) | Scope-2 zero-carbon claim certificates. |
| Compliance | Green tariff disclosure | chain (`green_tariff_disclosure`) | Green-tariff / RE100 disclosure chain. |
| Compliance | Scope 2 emissions | surface (`scope2`) | Annual location/market-based Scope 2 disclosures. |
| Compliance | POPIA data rights | route (`/popia`) | Data subject access and correction log. |
| Compliance | Sustainability reports | surface (`annual_reports`) | Annual sustainability and GRI reports. |
| Compliance | Settlement rails | surface (`strate-swift`) | STRATE/SWIFT settlement connector. |
| Compliance | ERP connectors | surface (`sap-oracle-erp`) | SAP/Oracle ERP integration connector. |
| Compliance | Filing connectors | surface (`government-filing`) | Government statutory-filing connector. |
| Compliance | Audit & compliance | surface (`audit`) | Tamper-evident audit log and REC reconciliation. |
| Reporting | PPA portfolio | surface (`ppa_portfolio`) | Portfolio summary (MW, cost, term). |
| Reporting | Energy cost analysis | surface (`energy_cost`) | Blended tariff and cost-per-MWh trends. |
| Reporting | Reports & exports | surface (`reports`) | PPA, statutory, green-tariff and Scope 2 reports. |

Chains offtaker can initiate (have a "+New"): the disclosure and KPI chains that carry an initiation form, such as `carbon_scope3_disclosure`, `green_tariff_disclosure`, and `slb_kpi_ratchet`. Mostly view/act-only or counterparty-fed: `ppa_contract_chain`, `tariff_indexation`, `ppa_termination`, `rec_lifecycle`, `ppa_change_in_law`, `wheeling_access`, `virtual_ppa_settlement`, `ppa_take_or_pay`, `curtailment_claim`, `ppa_nomination`, `ppa_annual_recon`, `unserved_energy_claim`, `ppa_payment_security`, `esg_disclosure`, `carbon_offset_claim`. The take-or-pay and curtailment chains are jointly visible with the IPP developer.

---

## lender (Lender)

Who this is: a project-finance lender or development finance institution. Originates credit facilities, monitors drawdowns and covenants, enforces defaults and restructures, tracks ESG/sustainability-linked terms, and reports.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Origination | Credit origination | chain (`credit_facility_application`) | Credit facility origination and approval. |
| Origination | Facilities | surface (`facilities`) | Active credit facilities portfolio. |
| Origination | Loan transfer / secondary | chain (`loan_transfer`) | Secondary-market loan participation. |
| Monitoring | Drawdowns / UoP | chain (`drawdown`) | IE/CP-gated drawdown and use-of-proceeds. |
| Monitoring | Covenant certificates | chain (`covenant_certificate`) | LMA covenant compliance certificates. |
| Monitoring | Security perfection | chain (`security_perfection`) | Deeds/STRATE security registration. |
| Monitoring | DSCR monitoring | chain (`dscr_monitoring`) | Quarterly DSCR/LLCR covenant testing with cure. |
| Monitoring | Reserve accounts | chain (`reserve_account`) | DSRA/MRA funding, drawdown, cure and release. |
| Monitoring | Portfolio overview | surface (`portfolio`) | Portfolio NAV, exposure and sector map. |
| Monitoring | Risk dashboard | surface (`lender_risk`) | Concentration, covenant breach, watch-list. |
| Enforcement | Default & enforcement | chain (`loan_default`) | Event-of-default enforcement/step-in. |
| Enforcement | Restructure & A&E | chain (`loan_restructure`) | Amend-and-extend/forbearance with credit-committee gate. |
| Enforcement | Dunning queue | surface (`dunning`) | Cycle 1/2/3 borrower notices with cure deadlines. |
| Enforcement | Covenant workout queue | route (`/lender-suite/workout`) | Covenant-breach workout cases with AI advisor. |
| Risk | SLL KPI & ratchet | chain (`sll_kpi`) | Sustainability-linked KPI compliance with margin ratchet. |
| Risk | ESG / DFI monitoring | route (`/esg`) | Equator Principles environmental/social monitoring. |
| Risk | Benchmark transition | surface (`benchmark_lender`) | JIBAR to ZARONIA credit facility resets. |
| Risk | Large-exposure concentration | surface (`concentrations`) | SARB large-exposure limits monitoring. |
| Reporting | IE certifications | surface (`ie_certifications`) | Independent-engineer sign-off register. |
| Reporting | Facility reports | surface (`facility_reports`) | Periodic facility utilisation reports. |
| Reporting | Covenant summary | surface (`covenant_reports`) | Cross-facility covenant status dashboard. |
| Reporting | ESG carbon reports | surface (`carbon_lender`) | Carbon accounting for DFI portfolios. |
| Reporting | Reports & exports | surface (`reports`) | Covenant, DSCR, drawdown and EP IV ESAP reports. |
| Reporting | Document Studio | surface (`doc_studio`) | Auto-generate term sheets and information memoranda. Paid subscription. |
| Reporting | Facility audit & IFRS9 export | route (`/lender-suite/audit`) | L5 tamper-evident audit, IFRS9 export, disbursement reconciliation. |
| Reporting | Settlement rails | surface (`strate-swift`) | STRATE/SWIFT settlement connectors. |
| Reporting | ERP connectors | surface (`sap-oracle-erp`) | SAP/Oracle ERP integration. |
| Reporting | Filing connectors | surface (`government-filing`) | NERSA/SARS government filing connectors. |
| Reporting | Audit & compliance | surface (`audit`) | Tamper-evident audit chain and facility reconciliation. |

Chains lender can initiate (have an initiation form): `cp_clearance`, `construction_cost_report`, `esap_compliance`, `esap_monitoring`, `facility_amendment`, `capital_adequacy_report`. View/act-only or borrower-fed: `credit_facility_application`, `loan_transfer`, `drawdown`, `covenant_certificate`, `security_perfection`, `dscr_monitoring`, `reserve_account`, `loan_default`, `loan_restructure`, `sll_kpi`.

---

## carbon_fund (Carbon Fund)

Who this is: a carbon project developer or fund running the carbon-credit lifecycle: project pipeline, MRV and verification, issuance and registry, Article 6 and compliance, retirement and offset, and carbon trading.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Project Pipeline | Project registration | chain (`carbon_registration`) | Gold Standard / Verra / Art 6.4 registration. |
| Project Pipeline | Crediting renewal | chain (`crediting_period_renewal`) | Crediting-period renewal and baseline reassessment. |
| Project Pipeline | PoA / CPA inclusion | chain (`poa_cpa_inclusion`) | Grouped-programme (PoA) CPA inclusion. |
| Project Pipeline | Vintage workflow | surface (`vintages`) | Credit vintage pipeline by year. |
| Project Pipeline | VCM project development | chain (`vcm_project_development`) | Voluntary-carbon-market development pipeline. |
| MRV & Verification | Verification chain | chain (`mrv_submissions`) | 14-state UNFCCC MRV verification. |
| MRV & Verification | MRV submissions | surface (`mrv`) | Monitoring, reporting and verification records. |
| MRV & Verification | CCP eligibility | chain (`ccp_assessment`) | CCP-eligibility assessment. |
| MRV & Verification | Methodology amendments | chain (`methodology_amendment`) | Approved methodology change register. |
| Issuance & Registry | Credit issuance | chain (`carbon_issuance`) | Carbon credit issuance chain. |
| Issuance & Registry | Retirement certificates | surface (`certificates`) | Issued retirement certificates registry. |
| Issuance & Registry | Certificate bundles | chain (`certificate_bundle`) | Bundled credit registry for bulk transfers. |
| Article 6 & Compliance | Article 6 ITMO | chain (`article6_adjustment`) | UNFCCC ITMO corresponding-adjustment ledger. |
| Article 6 & Compliance | ESG disclosure | chain (`esg_disclosure`) | ESG disclosure and third-party assurance. |
| Article 6 & Compliance | Scope 3 disclosure | chain (`carbon_scope3_disclosure`) | Value-chain Scope 3 emission disclosure. |
| Article 6 & Compliance | Reports & exports | surface (`reports`) | Issuance, retirement and offset-claim reports. |
| Article 6 & Compliance | Document Studio | surface (`doc_studio`) | Auto-generate PDD, MRV, validation and REC documents. Paid subscription. |
| Article 6 & Compliance | Audit & compliance | surface (`audit`) | Tamper-evident audit chain and registry reconciliation. |
| Retirement & Offset | Retirement chain | chain (`carbon_retirement`) | Per-scope SLA retirement chain. |
| Retirement & Offset | Reversals | chain (`carbon_reversal`) | Buffer-pool reversal chain. |
| Retirement & Offset | Tax offset claims | chain (`carbon_offset_claim`) | Carbon Tax Act offset claim. |
| Retirement & Offset | Carbon tax returns | chain (`carbon_tax_return`) | Carbon Tax Act returns filing. |
| Retirement & Offset | Carbon budget | chain (`carbon_budget`) | Annual carbon budget allocation. |
| Trading & Markets | Forward ERPA delivery | chain (`carbon_erpa`) | Carbon forward delivery and make-good. |
| Trading & Markets | Credit quality rating | chain (`carbon_credit_rating`) | Third-party carbon credit quality rating. |
| Trading & Markets | OTC carbon trading | chain (`carbon_registry_transfer`) | Spot and forward carbon credit OTC book. |

Chains carbon_fund can initiate (have an initiation form): `carbon_budget`, `carbon_credit_rating`, `carbon_registry_transfer`, `carbon_scope3_disclosure`, `carbon_tax_return`, `certificate_bundle`, `article6_adjustment`, and others in the carbon lane that carry one. View/act-only or upstream-fed: `carbon_registration`, `crediting_period_renewal`, `poa_cpa_inclusion`, `mrv_submissions`, `ccp_assessment`, `methodology_amendment`, `carbon_issuance`, `esg_disclosure`, `carbon_retirement`, `carbon_reversal`, `carbon_offset_claim`, `carbon_erpa`.

---

## grid_operator (Grid Operator)

Who this is: the system/transmission operator (the National Transmission Company role). Runs grid operations and dispatch, the connection queue, and compliance. Several chains are shared write with the IPP developer (the connecting party).

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Grid Operations | Dispatch nominations | chain (`oe_dispatch_nominations`) | BRP-to-SO dispatch chain. |
| Grid Operations | Curtailment events | surface (`curtailment`) | Load curtailment event log. |
| Grid Operations | Ancillary service events | surface (`ancillary`) | Ancillary award/delivery/failure/settlement event log. |
| Grid Operations | Ancillary services | chain (`reserve_activation`) | Reserve activation settlement. |
| Grid Operations | Demand response | chain (`demand_response_event`) | DR activation, metering and incentive settlement. |
| Grid Operations | SAPP interconnector schedules | chain (`interconnector_schedule`) | Cross-border SAPP schedule negotiation and delivery. |
| Grid Operations | EOP activations | chain (`eop_activation`) | Emergency Operations Plan activation and review. |
| Grid Operations | Outage responses | surface (`outage`) | Crew acknowledgement, dispatch, rerouting, restoration log. |
| Grid Operations | Imbalance settlement | chain (`imbalance_settlement`) | Real-time imbalance cash-out. |
| Grid Operations | Planned outages | chain (`planned_outage`) | NERSA Grid Code planned outage log. |
| Grid Operations | Load curtailment | chain (`load_curtailment`) | NERSA urgent curtailment. |
| Grid Operations | Black start | chain (`black_start`) | Black-start event log and cost recovery. |
| Grid Operations | Transmission outage | chain (`transmission_outage`) | EHV/HV outage coordination with N-1 security. |
| Grid Operations | Grid code compliance | chain (`grid_code_compliance`) | Non-conformance monitoring. |
| Connection Queue | Connection agreements | chain (`gca_connection`) | NERSA Grid Code connection agreement chain. |
| Connection Queue | REZ capacity allocation | chain (`rez_capacity`) | Scarce-capacity queue and allocation. |
| Connection Queue | Connection energization | chain (`connection_energization`) | Physical go-live commissioning. |
| Compliance | Grid code NCRs | chain (`gcc_ncr`) | Formal non-conformance notifications. |
| Compliance | Wheeling & TPA charges | surface (`wheeling_charges`) | Monthly transmission use-of-system invoices. |
| Compliance | NERSA statutory reporting | surface (`nersa_reporting`) | System-operator annual statutory reports. |
| Compliance | Interconnection studies | chain (`gca_connection`) | Fault-level and thermal capacity studies (same chain as connection agreements). |
| Compliance | Availability guarantees | chain (`availability_guarantee`) | O&M uptime guarantee. |
| Compliance | Levy compliance | chain (`levy_assessment`) | NERSA levy assessment register. |
| Compliance | Market rule changes | surface (`market_rules`) | NERSA market rule consultation log. |
| Compliance | Smart meter assets | chain (`smart_meter_asset`) | Smart-meter commissioning, data quality and lifecycle. |
| Compliance | Substation assets | chain (`substation_asset`) | Substation/transformer condition and refurbishment. |
| Compliance | SCADA data | surface (`scada`) | SCADA telemetry connector. |
| Compliance | MQTT / OPC-UA connectors | surface (`mqtt-opcua`) | Industrial MQTT/OPC-UA telemetry connector. |
| Compliance | Reports & exports | surface (`reports`) | Wheeling, dispatch and grid-code compliance reports. |
| Compliance | Audit & compliance | surface (`audit`) | Tamper-evident grid-operator audit chain. |

Note: "Connection agreements" and "Interconnection studies" both point at the same `gca_connection` chain.

Chains grid_operator can initiate (have an initiation form): `imbalance_settlement`, `demand_response_event`, `interconnector_schedule`, `eop_activation`, `substation_asset`, `smart_meter_asset`, and others in the grid lane that carry one. View/act-only or counterparty-fed: `oe_dispatch_nominations`, `reserve_activation`, `planned_outage`, `load_curtailment`, `black_start`, `transmission_outage`, `grid_code_compliance`, `gca_connection`, `rez_capacity`, `connection_energization`, `availability_guarantee`, `levy_assessment`, `unserved_energy_claim`.

---

## support (Support / OEM)

Who this is: the platform support desk and OEM service organisation. Runs ITIL service management (incidents, problems, changes), field operations and work orders, the OEM and supply chain, and platform operations including ML monitoring.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| ITIL Service Mgmt | Tickets | surface (`tickets`) | P1 to P4 incident ticket queue with SLA timers. |
| ITIL Service Mgmt | Ticket chain | chain (`support_tickets`) | ITIL incident lifecycle chain. |
| ITIL Service Mgmt | Service requests | chain (`service_request`) | ITIL service-request fulfilment chain. |
| ITIL Service Mgmt | Problem management | chain (`problem_record`) | ITIL root-cause problem management. |
| ITIL Service Mgmt | Change enablement | chain (`change_request`) | ITIL CAB/ECAB change RFC lifecycle. |
| ITIL Service Mgmt | Escalations | surface (`escalations`) | Tickets escalated to engineering/management. |
| ITIL Service Mgmt | CSAT lifecycle | chain (`csat_record`) | Customer satisfaction survey chain. |
| ITIL Service Mgmt | SLA performance | chain (`sla_performance_report`) | SLA adherence reports. |
| ITIL Service Mgmt | Cyber incident | chain (`cyber_incident`) | POPIA/Cybercrimes Act breach response. |
| Field Operations | Work orders | chain (`work_order`) | P6 field work-order dispatch chain. |
| Field Operations | Warranty / RMA | chain (`warranty_claim`) | OEM 10-state warranty claim chain. |
| Field Operations | PM schedule compliance | chain (`pm_compliance`) | Preventive-maintenance deferral compliance. |
| OEM & Supply Chain | Spare parts | chain (`spare_parts_provisioning`) | VED-critical spare-parts replenishment. |
| OEM & Supply Chain | Warranty recovery | chain (`warranty_recovery`) | OEM cost-recovery claim chain. |
| OEM & Supply Chain | Vuln remediation | chain (`security_remediation`) | CVSS-tiered OT security patching. |
| OEM & Supply Chain | OEM FCO/ECN | chain (`oem_fco`) | Field change order and engineering change notifications. |
| Platform Ops | MQTT/OPC-UA connectors | surface (`mqtt_opcua`) | OT protocol connector health. |
| Platform Ops | Anomaly ML | surface (`anomaly_ml`) | 6-method ensemble anomaly detection. |
| Platform Ops | RUL prediction | surface (`rul_ml`) | Remaining-useful-life prediction. |
| Platform Ops | Fault fingerprint | surface (`fault_ml`) | 12-mode physics fault classification. |
| Platform Ops | Cross-tenant access | surface (`cross_tenant`) | POPIA-logged cross-tenant access log. |
| Platform Ops | Service contracts | chain (`service_contract`) | O&M service contract register. |
| Platform Ops | Reports & exports | surface (`reports`) | SLA performance, CSAT and problem-record reports. |
| Platform Ops | Audit & compliance | surface (`audit`) | Tamper-evident audit chain and cross-tenant reconciliation. |

Note: the `work_order` feature here and the `om_work_order` chain (used by ESCO) both map to the `om_work_orders` table; they are two registry descriptors over the same underlying work orders.

Chains support can initiate (have an initiation form): `service_request`, `commissioning`, `csat_record`, `sla_performance_report`, plus other support-lane chains carrying one. View/act-only or event-fed: `support_tickets`, `problem_record`, `change_request`, `cyber_incident`, `work_order`/`om_work_order`, `warranty_claim`, `pm_compliance`, `spare_parts_provisioning`, `warranty_recovery`, `security_remediation`, `oem_fco`, `asset_prognostics`, `service_contract`.

---

## regulator (Regulator)

Who this is: the energy regulator (NERSA) and conduct authority. Handles licensing, enforcement, tariff determinations, levies and finance, and cross-platform data and reporting. The regulator sees many chains read-only (the read-side of items escalated from other roles).

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Licensing | Licence applications | chain (`licence_application`) | Initial licence adjudication. |
| Licensing | Licence actions | surface (`licences`) | Active licences: conditions, renewals, cancellations. |
| Licensing | Licence renewals | chain (`licence_renewal`) | Licence renewal chain. |
| Licensing | SSEG registration | chain (`sseg_registration`) | Schedule 2 embedded-generation registration. |
| Enforcement | Surveillance triage | surface (`surveillance`) | Market surveillance alerts and STOR inbox. |
| Enforcement | Enforcement events | surface (`enforcement`) | Enforcement action log (notices, fines, sanctions). |
| Enforcement | Enforcement actions | chain (`enforcement_action`) | Formal enforcement chain. |
| Enforcement | Compliance inspections | chain (`compliance_inspection`) | On-site inspections. |
| Enforcement | Dispositions | chain (`disposition`) | Regulatory disposition chain. |
| Enforcement | Complaint resolution | chain (`complaint_resolution`) | External complaint chain. |
| Tariff & Determinations | Compliance notices | surface (`notices`) | Outstanding compliance notice register. |
| Tariff & Determinations | Public consultations | chain (`public_consultation`) | Gazette public consultation chain. |
| Tariff & Determinations | MYPD tariff determination | chain (`tariff_determination`) | MYPD tariff review. |
| Tariff & Determinations | Market conduct exams | chain (`market_conduct_exam`) | FSCA market-conduct examination. |
| Levies & Finance | Levy assessments | chain (`levy_assessment`) | NERA Act levy assessment chain. |
| Levies & Finance | Regulatory exports | chain (`regulator_export_pack`) | Certified export packages. |
| Levies & Finance | ICFR attestations | surface (`icfr_attestations`) | Reconciliation attestation packs (read-only). |
| Data & Reporting | Regulatory inbox | surface (`inbox`) | Cross-chain regulatory inbox of escalated items. |
| Data & Reporting | Filing connectors | surface (`government_filing`) | NERSA/FSCA government filing connectors. |
| Data & Reporting | Stage gates (read) | chain (`stage_gate`) | Platform-wide development-gate view. |
| Data & Reporting | External controls | chain (`control_environment_audit`) | Control-environment audit. |
| Data & Reporting | ESG disclosure (read) | chain (`esg_disclosure`) | ESG disclosure read-only view. |
| Data & Reporting | Reports & exports | surface (`reports`) | Statutory submissions, levy and disposition reports. |
| Data & Reporting | Audit & compliance | surface (`audit`) | Tamper-evident audit chain and licence reconciliation. |

Note: the "Enforcement actions" feature uses chainKey `enforcement_action`, which maps to table `oe_enforcement_actions`. There is a separate `enforcement_action_s35` descriptor (table `oe_enforcement_action`) also in the regulator lane; the surfaces file references the s35 variant. The two are distinct descriptors over similarly named tables, which is a potential source of confusion when tracing data.

Chains regulator can initiate (have an initiation form): `enforcement_action_s35`, `compliance_notice`, `control_environment_audit`, `regulator_export_pack`, and other regulator-lane chains with one. Largely read/act-only (fed by other roles' escalations): `licence_application`, `licence_renewal`, `sseg_registration`, `compliance_inspection`, `disposition`, `complaint_resolution`, `tariff_determination`, `market_conduct_exam`, `public_consultation`, `levy_assessment`, `stage_gate` (read), `esg_disclosure` (read), `mrv_submissions` (read), `article6_adjustment`, `poslimit_case`, `market_abuse_case`, `algo_certification`, `covenant_certificate`, `facility_amendment`, `ed_commitment`, `ipp_coc`, `cbt_sed_report`, `oe_dispatch_nominations`.

---

## epc_contractor (EPC Contractor)

Who this is: the engineering, procurement and construction contractor building an IPP project. A focused construction role. This role is defined in `roleData.ts` and has its own surfaces, although it is not in the headline role list of the platform docs.

| Domain | Feature | Resolves to | What it does |
|---|---|---|---|
| Document Control | Submittals | chain (`ipp_submittal`) | Drawing and document submittal register. |
| Document Control | RFIs | surface (`rfis`) | Request-for-information log and responses. |
| Document Control | Change orders | chain (`project_change_order`) | Contract change order management. |
| Document Control | Technical queries | surface (`technical-queries`) | Technical query register and resolution. |
| Quality Management | ITPs | chain (`itp`) | Inspection and test plans. |
| Quality Management | NCRs | chain (`ncr`) | Non-conformance reports and corrective action. |
| Quality Management | Punch list | chain (`punch_list`) | Pre-COD punch list items and closure. |
| Quality Management | Method statements | chain (`ipp_method_statement`) | Construction method-statement approvals. |
| Site Setup | Site diary | chain (`ipp_construction_diary`) | Daily construction diary and inspection records. |
| Safety & HSE | HSE incidents | chain (`hse_incident`) | OHSA/NEMA incident chain. |
| Handover | Audit log | surface (`audit`) | Handover documentation and evidence chain. |

Chains: the EPC contractor shares construction chains with the IPP developer (`ipp_submittal`, `project_change_order`, `itp`, `ncr`, `punch_list`, `ipp_method_statement`, `ipp_construction_diary`, `hse_incident`). In the registry the EPC role is mostly a participating write party on these rather than the initiator; the derived view shows no EPC-initiated chains, so treat EPC as contributing to chains the IPP developer or others start.

---

## Appendix: every chain, its table, purpose, and who sees it

This lists all 207 chain descriptors in `MERIDIAN_CHAINS`. "Roles that see it" is the chain's `lanes` (which roles get the chain in their Horizon and Ledger). Roles use the long token form. The purpose is the chain's registry title.

| Chain key | Table | Purpose | Roles that see it (lanes) |
|---|---|---|---|
| `algo_certification` | `oe_algo_certifications` | Algo certification | trader, regulator |
| `article6_adjustment` | `oe_article6_adjustments` | Article 6 corresponding adjustment | carbon_fund, trader, regulator |
| `asset_prognostics` | `oe_asset_prognostics` | Asset prognostic | support, esco |
| `audit_chain_block` | `oe_audit_chain_block` | Audit-chain block | admin |
| `availability_guarantee` | `oe_availability_guarantees` | Availability guarantee | esco, grid_operator |
| `benchmark_transition` | `oe_benchmark_transitions` | Benchmark transition | trader |
| `bess_soh` | `oe_bess_soh` | BESS state-of-health | esco |
| `best_execution` | `oe_best_execution` | Best execution | trader |
| `black_start` | `oe_black_start_capabilities` | Black-start capability | grid_operator, trader |
| `capital_adequacy_report` | `oe_capital_adequacy_reports` | Capital-adequacy report | lender, support |
| `carbon_budget` | `oe_carbon_budget_registrations` | Carbon budget | carbon_fund |
| `carbon_credit_rating` | `oe_carbon_credit_rating` | Credit quality rating | carbon_fund |
| `carbon_erpa` | `oe_carbon_erpas` | Carbon ERPA | carbon_fund |
| `carbon_issuance` | `oe_carbon_issuances` | Credit issuance | carbon_fund |
| `carbon_offset_claim` | `oe_carbon_offset_claims` | Carbon offset claim | carbon_fund, offtaker |
| `carbon_registration` | `oe_carbon_registration` | Project registration | carbon_fund |
| `carbon_registry_transfer` | `oe_carbon_registry_transfers` | Registry transfer | carbon_fund |
| `carbon_retirement` | `carbon_retirements` | Credit retirement | carbon_fund |
| `carbon_reversal` | `oe_carbon_reversals` | Carbon reversal | carbon_fund |
| `carbon_scope3_disclosure` | `oe_carbon_scope3_disclosures` | Scope 3 disclosure | carbon_fund, offtaker |
| `carbon_tax_return` | `oe_carbon_tax_returns` | Carbon tax return | carbon_fund |
| `cbt_sed_report` | `oe_cbt_sed_reports` | CBT/SED annual report | ipp_developer, support, regulator |
| `ccp_assessment` | `oe_ccp_assessments` | CCP assessment | carbon_fund |
| `certificate_bundle` | `oe_certificate_bundles` | Certificate bundle | carbon_fund |
| `change_request` | `oe_change_requests` | Change request (RFC) | support |
| `cod_chain` | `oe_cod_chain` | Construction / COD | ipp_developer |
| `commissioning` | `om_sites` | Site commissioning | support, esco |
| `complaint_resolution` | `oe_regulator_complaints` | Complaint resolution | regulator |
| `compliance_inspection` | `oe_compliance_inspections` | Compliance inspection | regulator, ipp_developer |
| `compliance_notice` | `oe_compliance_notices` | Compliance notice | regulator |
| `connection_energization` | `oe_connection_energization` | Connection energization | ipp_developer, grid_operator |
| `construction_cost_report` | `oe_construction_cost_reports` | IE cost-to-complete | lender, ipp_developer |
| `control_environment_audit` | `oe_control_environment_audit` | Control-environment audit | admin, regulator |
| `counterparty_margin` | `oe_counterparty_margin` | Counterparty margin | trader |
| `covenant_certificate` | `oe_covenant_certificates` | Covenant certificate | lender, ipp_developer, regulator |
| `cp_clearance` | `oe_cp_clearances` | CP clearance | lender |
| `cp_tracker` | `oe_cp_tracker` | Conditions precedent | ipp_developer |
| `credit_facility_application` | `oe_credit_facility_applications` | Credit origination | lender, ipp_developer |
| `credit_insurance` | `oe_credit_insurance` | Credit insurance | ipp_developer |
| `crediting_period_renewal` | `oe_crediting_period_renewals` | Crediting renewal | carbon_fund |
| `cross_border_trade` | `oe_cross_border_trades` | Cross-border trade | trader |
| `csat_record` | `oe_csat_records` | CSAT lifecycle | support |
| `curtailment_claim` | `oe_curtailment_claims` | Curtailment claim | offtaker, ipp_developer |
| `cyber_incident` | `oe_cyber_incidents` | Cyber incident | support, regulator, ipp_developer |
| `demand_response_event` | `oe_demand_response_events` | Demand-response event | grid_operator, support |
| `dfr` | `oe_dfr` | Daily field report | ipp_developer |
| `disbursement_case` | `oe_disbursement_cases` | Disbursement UoP | lender, ipp_developer |
| `disposition` | `oe_disposition_cases` | Disposition case | regulator |
| `dlp_defect` | `oe_ipp_dlp_defects` | DLP defect | ipp_developer |
| `drawdown` | `oe_drawdown_chain` | Drawdown | lender, ipp_developer |
| `dscr_monitoring` | `oe_dscr_monitoring` | DSCR monitoring | lender, ipp_developer |
| `dscr_report` | `oe_dscr_reports` | DSCR report | ipp_developer |
| `ed_commitment` | `oe_ed_commitments` | ED commitment | ipp_developer, regulator |
| `enforcement_action` | `oe_enforcement_actions` | Enforcement action | regulator |
| `enforcement_action_s35` | `oe_enforcement_action` | Enforcement action | regulator |
| `eop_activation` | `oe_eop_activations` | EOP activation | grid_operator |
| `esap_compliance` | `oe_esap_compliance` | ESAP compliance | lender, ipp_developer |
| `esap_monitoring` | `oe_esap_monitoring` | ESAP monitoring | lender |
| `esg_disclosure` | `oe_esg_disclosure` | ESG disclosure | carbon_fund, offtaker, regulator |
| `export_curtailment` | `oe_export_curtailments` | Export curtailment claim | ipp_developer, grid_operator |
| `facility_amendment` | `oe_facility_amendments` | Facility amendment | lender, ipp_developer, regulator |
| `fsca_compliance_report` | `oe_fsca_compliance_reports` | FSCA compliance report | trader, support |
| `fsca_conduct_report` | `oe_fsca_conduct_reports` | FSCA conduct report | trader |
| `gca_connection` | `oe_gca_connections` | Grid connection agreement | ipp_developer, grid_operator |
| `gcc_ncr` | `oe_grid_code_compliance` | Grid-code non-conformance | grid_operator |
| `generation_revenue_assurance` | `oe_generation_revenue_assurance` | Generation revenue assurance | esco |
| `green_bond_report` | `oe_green_bond_reports` | Green bond report | ipp_developer |
| `green_tariff_disclosure` | `oe_green_tariff_disclosures` | Green-tariff disclosure | offtaker, support |
| `grid_code_compliance` | `oe_grid_code_compliance` | Grid code compliance | ipp_developer, grid_operator |
| `handover_dossier` | `oe_handover_dossier` | Handover dossier | ipp_developer |
| `hse_incident` | `oe_hse_incidents` | HSE incident | esco, ipp_developer, epc_contractor |
| `imbalance_settlement` | `oe_imbalance_settlement` | Imbalance settlement | grid_operator |
| `insurance_claim` | `oe_insurance_claim_chain` | Insurance claim | ipp_developer |
| `interconnector_schedule` | `oe_interconnector_schedules` | Interconnector schedule | grid_operator |
| `ipp_acs` | `oe_ipp_annual_compliance_assessments` | Annual compliance assessment | ipp_developer |
| `ipp_ael` | `oe_ipp_ael_applications` | AEL application | ipp_developer |
| `ipp_anr` | `oe_ipp_licence_returns` | NERSA licence return | ipp_developer |
| `ipp_aud` | `oe_ipp_annual_audits` | Annual audit | ipp_developer |
| `ipp_bbbee` | `oe_ipp_bbbee_verification` | BBBEE verification | ipp_developer |
| `ipp_bfs` | `oe_ipp_bfs_studies` | BFS study | ipp_developer |
| `ipp_ccc` | `oe_ipp_ccc_negotiations` | Connection cost contribution | ipp_developer |
| `ipp_cd` | `oe_ipp_contractor_defaults` | Contractor default | ipp_developer |
| `ipp_cep` | `oe_ipp_cep_compliance` | Community equity participation | ipp_developer |
| `ipp_coc` | `oe_ipp_change_of_control` | Change of control | ipp_developer, regulator |
| `ipp_construction_diary` | `oe_ipp_construction_diary` | Site diary | ipp_developer, epc_contractor |
| `ipp_ctr` | `oe_ipp_community_trust_reports` | Community trust report | ipp_developer |
| `ipp_doc_control` | `oe_ipp_document_control` | Document control | ipp_developer |
| `ipp_eam` | `oe_ipp_ea_amendments` | EA amendment | ipp_developer |
| `ipp_eco` | `oe_ipp_eco_reports` | ECO annual report | ipp_developer |
| `ipp_empr` | `oe_emp_compliance_reports` | EMP compliance report | ipp_developer |
| `ipp_env_closure` | `oe_ipp_env_closure` | Environmental closure | ipp_developer |
| `ipp_env_monitoring` | `oe_ipp_env_monitoring` | Environmental monitoring | ipp_developer |
| `ipp_eqt` | `oe_ipp_equity_transfers` | Equity transfer | ipp_developer |
| `ipp_esmr` | `oe_ipp_esmr` | E&S monitoring report | ipp_developer |
| `ipp_evm` | `oe_ipp_evm` | Cost & EVM | ipp_developer |
| `ipp_final_completion` | `oe_ipp_final_completion` | Final completion | ipp_developer |
| `ipp_fm` | `oe_ipp_fm` | Force majeure | ipp_developer |
| `ipp_gcc` | `oe_ipp_grid_compliance` | Grid compliance | ipp_developer |
| `ipp_hra` | `oe_ipp_hra_assessments` | Heritage assessment | ipp_developer |
| `ipp_ie_cert` | `oe_ipp_ie_cert` | IE milestone certification | ipp_developer |
| `ipp_iear` | `oe_ipp_ie_annual_reviews` | IE annual review | ipp_developer |
| `ipp_insr` | `oe_ipp_insurance_renewals` | Insurance renewal | ipp_developer |
| `ipp_lam` | `oe_ipp_land_amendments` | Land amendment | ipp_developer |
| `ipp_land_register` | `oe_ipp_land_register` | Land register update | ipp_developer |
| `ipp_lcr` | `oe_ipp_lc_reports` | Local content & SED | ipp_developer |
| `ipp_lrep` | `oe_ipp_lender_reporting` | Lender reporting | ipp_developer |
| `ipp_lta` | `oe_ipp_lta_certificates` | LTA drawdown certificate | ipp_developer |
| `ipp_mc` | `oe_ipp_milestone_certifications` | Milestone certification | ipp_developer |
| `ipp_method_statement` | `oe_ipp_method_statements` | Method statement | ipp_developer, epc_contractor |
| `ipp_mir` | `oe_ipp_mirs` | Material inspection | ipp_developer |
| `ipp_om_handover` | `oe_ipp_om_handover` | O&M handover | ipp_developer |
| `ipp_omc` | `oe_ipp_om_contracts` | O&M contract | ipp_developer |
| `ipp_payment_cert` | `oe_ipp_payment_certs` | Payment certificate | ipp_developer |
| `ipp_performance_bonds` | `ipp_performance_bonds` | Performance bond | ipp_developer |
| `ipp_ppavar` | `oe_ipp_ppa_variation` | PPA variation | ipp_developer |
| `ipp_progress_claim` | `oe_ipp_progress_claims` | Progress claim | ipp_developer |
| `ipp_psec` | `oe_ipp_perf_securities` | Performance security | ipp_developer |
| `ipp_qgr` | `oe_ipp_quarterly_gen_reports` | Quarterly generation report | ipp_developer |
| `ipp_refi` | `oe_ipp_refinancing` | Refinancing | ipp_developer |
| `ipp_rfi` | `oe_ipp_rfi` | RFI | ipp_developer |
| `ipp_rpr` | `oe_ipp_reipppp_reports` | REIPPPP progress report | ipp_developer |
| `ipp_schedule` | `oe_ipp_schedule` | WBS & schedule | ipp_developer |
| `ipp_sed` | `oe_ipp_sed_compliance` | SED annual spend | ipp_developer |
| `ipp_subcontractor` | `oe_ipp_subcontractors` | Subcontractor | ipp_developer |
| `ipp_submittal` | `oe_ipp_submittal` | Submittal | ipp_developer |
| `ipp_tpa` | `oe_ipp_tpa` | TPA / wheeling | ipp_developer |
| `ipp_tq` | `oe_ipp_tqs` | Technical query | ipp_developer |
| `ipp_wul` | `oe_ipp_wul_applications` | Water-use licence | ipp_developer |
| `isda_agreement` | `oe_isda_agreements` | ISDA agreement | trader |
| `itp` | `oe_itp_inspection` | Inspection & test plan | ipp_developer, epc_contractor |
| `kyc_verification` | `oe_kyc_verifications` | KYC verification | admin |
| `levy_assessment` | `oe_regulator_levies` | Levy assessment | regulator, grid_operator |
| `licence_application` | `oe_licence_applications` | Licence application | regulator, ipp_developer |
| `licence_obligation` | `oe_licence_obligations` | Licence obligation | ipp_developer |
| `licence_renewal` | `oe_licence_renewals` | Licence renewal | regulator, ipp_developer |
| `load_curtailment` | `oe_load_curtailment` | Load curtailment | grid_operator, ipp_developer |
| `loan_default` | `oe_loan_defaults` | Loan default | lender, ipp_developer |
| `loan_restructure` | `oe_loan_restructure` | Loan restructure | lender, ipp_developer |
| `loan_transfer` | `oe_loan_transfers` | Loan transfer | lender, ipp_developer |
| `market_abuse_case` | `oe_market_abuse_cases` | Market abuse case | trader, regulator |
| `market_conduct_exam` | `oe_market_conduct_exams` | Market-conduct exam | regulator |
| `methodology_amendment` | `oe_methodology_amendments` | Methodology amendment | carbon_fund |
| `milestone_variance_report` | `oe_milestone_variance_reports` | Milestone variance report | ipp_developer |
| `mrv_submissions` | `mrv_submissions` | MRV verification | carbon_fund, regulator |
| `ncr` | `oe_ipp_ncrs` | Non-conformance report | ipp_developer, epc_contractor |
| `oe_dispatch_nominations` | `oe_dispatch_nominations` | Dispatch nomination | grid_operator, regulator |
| `oem_fco` | `oe_oem_field_change_orders` | OEM field-change order | support |
| `om_work_order` | `om_work_orders` | Work order | support, esco |
| `permit_to_work` | `oe_permit_to_work` | Permit to work | esco |
| `planned_outage` | `oe_planned_outages` | Planned outage | ipp_developer, grid_operator |
| `pm_compliance` | `oe_pm_compliance` | PM compliance | support, esco |
| `pnl_attribution` | `oe_pnl_attribution` | P&L attribution | trader |
| `poa_cpa_inclusion` | `oe_poa_cpa_inclusions` | CPA inclusion | carbon_fund |
| `poslimit_case` | `oe_poslimit_cases` | Position limit | trader, regulator |
| `ppa_annual_recon` | `oe_ppa_annual_recon` | PPA annual reconciliation | offtaker, ipp_developer |
| `ppa_change_in_law` | `oe_ppa_change_in_law` | PPA change-in-law | offtaker, ipp_developer |
| `ppa_contract_chain` | `oe_ppa_contract_chain` | PPA contract | offtaker |
| `ppa_nomination` | `oe_ppa_nominations` | PPA nomination | offtaker, ipp_developer |
| `ppa_obligation` | `oe_offtaker_ppa_obligations` | PPA delivery obligation | offtaker |
| `ppa_payment_security` | `oe_ppa_payment_securities` | Payment security | offtaker, ipp_developer |
| `ppa_take_or_pay` | `oe_top_cases` | Take-or-pay case | offtaker, ipp_developer |
| `ppa_termination` | `oe_ppa_terminations` | PPA termination | offtaker, ipp_developer |
| `pr_underperformance` | `oe_pr_chain` | PR underperformance | support, esco |
| `pretrade_credit_check` | `oe_pretrade_credit_check` | Pre-trade credit check | trader |
| `problem_record` | `oe_problem_records` | Problem record | support |
| `procurement_rfp` | `oe_procurement_rfps` | Procurement RFP | ipp_developer |
| `project_change_order` | `oe_project_change_orders` | Change order | ipp_developer |
| `project_risk` | `oe_project_risks` | Risk analysis (EMV) | ipp_developer |
| `public_consultation` | `oe_public_consultations` | Public consultation | regulator |
| `punch_list` | `oe_punch_list` | Punch list item | ipp_developer, epc_contractor |
| `rec_lifecycle` | `oe_rec_lifecycle` | REC certificate | offtaker, ipp_developer |
| `regulator_export_pack` | `oe_regulator_export_pack` | Regulator export pack | admin, regulator |
| `regulator_inbox` | `oe_regulator_inbox` | Regulator inbox item | regulator |
| `reserve_account` | `oe_reserve_account_chain` | Reserve account (DSRA/MRA) | lender, ipp_developer |
| `reserve_activation` | `oe_reserve_activations` | Reserve activation | grid_operator, ipp_developer |
| `rez_capacity` | `oe_grid_capacity_allocations` | Capacity allocation | grid_operator, ipp_developer |
| `security_perfection` | `oe_security_perfection` | Security perfection | lender, ipp_developer |
| `security_remediation` | `oe_security_remediations` | Security remediation | support |
| `service_contract` | `oe_service_contracts` | Service contract | support, esco |
| `service_request` | `oe_service_request_chain` | Service request | support |
| `settlement_fail` | `oe_settlement_fails` | Settlement fail | trader |
| `site_instruction` | `oe_ipp_site_instructions` | Site instruction | ipp_developer |
| `sla_performance_report` | `oe_sla_performance_reports` | SLA performance report | support |
| `slb_kpi_ratchet` | `oe_slb_kpi_ratchets` | SLB KPI ratchet | offtaker |
| `sll_kpi` | `oe_sll_kpi_compliance` | SLL KPI compliance | lender, ipp_developer |
| `smart_meter_asset` | `oe_smart_meter_assets` | Smart-meter asset | support, grid_operator, ipp_developer |
| `soiling_audit` | `oe_soiling_audit` | Soiling audit | esco |
| `spare_parts_provisioning` | `oe_spare_parts_provisioning` | Spare-parts provisioning | support, esco |
| `sseg_registration` | `oe_sseg_registrations` | SSEG registration | regulator, ipp_developer |
| `stage_gate` | `oe_stage_gates` | Stage gate | ipp_developer |
| `submittal_rfi` | `oe_submittal_rfi` | Submittal / RFI | ipp_developer |
| `substation_asset` | `oe_substation_assets` | Substation asset | grid_operator |
| `support_tickets` | `support_tickets` | Support ticket | support |
| `tariff_determination` | `oe_tariff_determinations` | Tariff determination | regulator, grid_operator |
| `tariff_indexation` | `oe_tariff_indexation` | Tariff indexation | offtaker, ipp_developer |
| `trade_allocation` | `oe_trade_allocations` | Trade allocation | trader |
| `trade_report` | `oe_trade_reports` | Trade report | trader |
| `transmission_outage` | `oe_transmission_outage` | Transmission outage | grid_operator |
| `unserved_energy_claim` | `oe_unserved_energy_claims` | Unserved-energy claim | offtaker, grid_operator |
| `variation_order` | `oe_ipp_variation_orders` | Variation order | ipp_developer |
| `vcm_project_development` | `oe_vcm_projects` | VCM project development | carbon_fund |
| `vendor_escalation` | `oe_vendor_escalation` | Vendor escalation | esco |
| `virtual_ppa_settlement` | `oe_virtual_ppa_settlements` | Virtual PPA / CfD settlement | offtaker, ipp_developer |
| `warranty_claim` | `oe_warranty_claims` | Warranty claim | support, ipp_developer, esco |
| `warranty_recovery` | `oe_warranty_recoveries` | Warranty recovery | support, esco |
| `wheeling_access` | `oe_wheeling_access` | Wheeling access | offtaker, grid_operator |
| `work_order` | `om_work_orders` | Work order | support, esco |

### Notes and ambiguities found in the code

- There are 207 chain descriptors in `MERIDIAN_CHAINS`. The 161 distinct `chainKey` values referenced by `roleData.ts` all resolve to a descriptor; the remaining descriptors are reachable through chains that are shared across roles or not surfaced as their own Atlas tile.
- Two pairs of descriptors point at the same physical table: `om_work_order` and `work_order` both use `om_work_orders`; this is two registry views over the same work orders.
- `enforcement_action` (table `oe_enforcement_actions`) and `enforcement_action_s35` (table `oe_enforcement_action`) are distinct descriptors with confusingly similar table names. The regulator surfaces file wires the s35 variant; the `enforcement_action_s35` tab was retired to its Ledger. When tracing enforcement data, confirm which table a given screen reads.
- `gcc_ncr` and `grid_code_compliance` both map to the table `oe_grid_code_compliance` (one is the non-conformance view, the other the broader compliance chain).
- The "initiate vs view" lists per role are derived from whether a chain descriptor has an `initiation` block and whether the role is among its action roles. The authoritative permission for any single action is enforced server-side per transition, so use these notes as a guide rather than an exact permission matrix.
- A handful of role tabs in the old code had no chain descriptor and are served as surfaces instead of Ledgers: the IPP `annual_report` (old `ipp_acr`), the trader `oe_mm_obligations` (MM compliance), the regulator `icfr_attestations` (W120), and the various connector and ML panels. These are listed as `surface` in the role tables above.
- The connector surfaces (STRATE/SWIFT, SAP/Oracle ERP, government filing, SCADA, MQTT/OPC-UA) and the ML panels (anomaly, RUL, fault fingerprint) are shared components registered under multiple `<role>:<key>` aliases. The exact surface key differs by role (for example admin uses `settlement_rails` while trader uses `strate-swift`); both alias to the same connector component.
