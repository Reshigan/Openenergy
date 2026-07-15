# Cutover Coverage Matrix — v1 chains → v2 ChainDecls

**Purpose.** The per-chain v1→v2 cutover coverage matrix required by [REBUILD_PLAN.md §11](REBUILD_PLAN.md). Cutover is per chain, one-way, no dual-write; this document is the ledger of which v1 chain each v2 declaration covers, which v1 chains still have no home, and what state-mapping work each import needs. A v1 chain may not cut over until its row here is EXACT or RENAMED-CANDIDATE (confirmed) **and** its terminal-status mismatches have a written mapping decision.

**Generated:** 2026-07-14 (mechanically extracted; classifications RENAMED-CANDIDATE and the NO-COUNTERPART notes are judgment calls for review).

**Sources of truth:**
- v1: `open-energy-platform/src/utils/chain-registry-meridian.ts` — `MERIDIAN_CHAINS: ChainDescriptor[]` (207 descriptors)
- v2: `open-energy-platform/src/v2/domain/chains/*.ts` — 142 `ChainDecl` modules

**Counts:**

| Classification | Count |
|---|---|
| v1 descriptors total | 207 |
| EXACT (v1 key === v2 key) | 91 (of which 20 terminal-clean) |
| RENAMED-CANDIDATE | 35 |
| NO-COUNTERPART | 81 |
| v2-only chains (no v1 descriptor, no backfill needed) | 19 |

Two v1 registry quirks surfaced by extraction: (a) `om_work_order` and `work_order` are two descriptors over the same `om_work_orders` table, and `grid_code_compliance` / `gcc_ncr` likewise share `oe_grid_code_compliance` — each pair must import into **one** v2 chain without double-counting rows; (b) the descriptor keyed `oe_dispatch_nominations` uses its table name as its key.

---

## §1 EXACT — v1 key === v2 chain key (91)

"Terminal-status mismatches" lists v1 `terminal[]` statuses that do not exist in the v2 chain's `states` object. Every listed status needs a state-mapping decision before that chain's backfill (e.g. v1 `cancelled` → v2 `withdrawn`); "clean" means every v1 terminal status exists verbatim in v2. Note this check covers terminal states only — non-terminal v1 statuses must still be mapped at import time, but terminal rows are the bulk of any backfill and the mismatches below are the known decisions.

| v1 key | v1 table | v2 chain | Terminal-status mismatches |
|---|---|---|---|
| `availability_guarantee` | `oe_availability_guarantees` | `availability_guarantee` | `settled`, `dispute_resolved` |
| `benchmark_transition` | `oe_benchmark_transitions` | `benchmark_transition` | clean |
| `best_execution` | `oe_best_execution` | `best_execution` | `closed`, `exception_escalated`, `rfq_expired` |
| `black_start` | `oe_black_start_capabilities` | `black_start` | `recertified`, `contract_terminated` |
| `carbon_budget` | `oe_carbon_budget_registrations` | `carbon_budget` | `final`, `appeal` |
| `carbon_credit_rating` | `oe_carbon_credit_rating` | `carbon_credit_rating` | `re_rated`, `escalated_to_integrity`, `downgraded` |
| `carbon_erpa` | `oe_carbon_erpas` | `carbon_erpa` | `completed`, `withdrawn` |
| `carbon_issuance` | `oe_carbon_issuances` | `carbon_issuance` | `cancelled` |
| `carbon_offset_claim` | `oe_carbon_offset_claims` | `carbon_offset_claim` | clean |
| `carbon_registration` | `oe_carbon_registration` | `carbon_registration` | `crediting_active` |
| `carbon_registry_transfer` | `oe_carbon_registry_transfers` | `carbon_registry_transfer` | `ca_notified`, `completed`, `aml_rejected`, `registry_rejected`, `cancelled` |
| `carbon_retirement` | `carbon_retirements` | `carbon_retirement` | `cancelled` |
| `carbon_reversal` | `oe_carbon_reversals` | `carbon_reversal` | `closed`, `escalated`, `false_alarm` |
| `ccp_assessment` | `oe_ccp_assessments` | `ccp_assessment` | `ccp_label_granted`, `ccp_label_denied` |
| `certificate_bundle` | `oe_certificate_bundles` | `certificate_bundle` | `retired`, `expired`, `cancelled` |
| `complaint_resolution` | `oe_regulator_complaints` | `complaint_resolution` | `appealed` |
| `compliance_inspection` | `oe_compliance_inspections` | `compliance_inspection` | `compliant_closed`, `enforcement_closed`, `withdrawn` |
| `connection_energization` | `oe_connection_energization` | `connection_energization` | `commercial_operation`, `connection_withdrawn` |
| `construction_cost_report` | `oe_construction_cost_reports` | `construction_cost_report` | `budget_compliant`, `resolved`, `default_triggered`, `cancelled` |
| `counterparty_margin` | `oe_counterparty_margin` | `counterparty_margin` | `recovered`, `written_off` |
| `covenant_certificate` | `oe_covenant_certificates` | `covenant_certificate` | clean |
| `cp_clearance` | `oe_cp_clearances` | `cp_clearance` | `expired` |
| `credit_insurance` | `oe_credit_insurance` | `credit_insurance` | `claim_paid`, `lapsed` |
| `cross_border_trade` | `oe_cross_border_trades` | `cross_border_trade` | `trade_executed`, `fsca_rejected`, `sarb_rejected`, `expired` |
| `curtailment_claim` | `oe_curtailment_claims` | `curtailment_claim` | `compensation_settled`, `arbitrated`, `non_compensable` |
| `cyber_incident` | `oe_cyber_incidents` | `cyber_incident` | clean |
| `disposition` | `oe_disposition_cases` | `disposition` | `closed`, `escalated`, `dismissed`, `referred` |
| `drawdown` | `oe_drawdown_chain` | `drawdown` | `closed`, `cancelled` |
| `ed_commitment` | `oe_ed_commitments` | `ed_commitment` | `closed` |
| `enforcement_action` | `oe_enforcement_actions` | `enforcement_action` | `paid` |
| `enforcement_action_s35` | `oe_enforcement_action` | `enforcement_action_s35` | `settled`, `archived`, `cancelled` |
| `eop_activation` | `oe_eop_activations` | `eop_activation` | `per_completed`, `per_outstanding`, `escalated_to_regulator`, `withdrawn` |
| `esap_compliance` | `oe_esap_compliance` | `esap_compliance` | `accepted`, `verified` |
| `esap_monitoring` | `oe_esap_monitoring` | `esap_monitoring` | clean |
| `esg_disclosure` | `oe_esg_disclosure` | `esg_disclosure` | `archived`, `cancelled` |
| `export_curtailment` | `oe_export_curtailments` | `export_curtailment` | `settled`, `rejected`, `withdrawn` |
| `facility_amendment` | `oe_facility_amendments` | `facility_amendment` | clean |
| `fsca_conduct_report` | `oe_fsca_conduct_reports` | `fsca_conduct_report` | `accepted`, `escalated` |
| `grid_code_compliance` | `oe_grid_code_compliance` | `grid_code_compliance` | `compliant_closed`, `disconnection_issued` |
| `handover_dossier` | `oe_handover_dossier` | `handover_dossier` | `archived`, `rejected`, `voided` |
| `hse_incident` | `oe_hse_incidents` | `hse_incident` | clean |
| `insurance_claim` | `oe_insurance_claim_chain` | `insurance_claim` | clean |
| `interconnector_schedule` | `oe_interconnector_schedules` | `interconnector_schedule` | `cancelled` |
| `ipp_evm` | `oe_ipp_evm` | `ipp_evm` | clean |
| `ipp_schedule` | `oe_ipp_schedule` | `ipp_schedule` | `completed`, `cancelled`, `late_finish` |
| `isda_agreement` | `oe_isda_agreements` | `isda_agreement` | `active`, `suspended` |
| `itp` | `oe_itp_inspection` | `itp` | `archived`, `rejected`, `voided` |
| `levy_assessment` | `oe_regulator_levies` | `levy_assessment` | `settled`, `written_off`, `withdrawn` |
| `licence_application` | `oe_licence_applications` | `licence_application` | clean |
| `licence_renewal` | `oe_licence_renewals` | `licence_renewal` | `granted`, `amended` |
| `load_curtailment` | `oe_load_curtailment` | `load_curtailment` | `closed`, `refused`, `withdrawn` |
| `loan_default` | `oe_loan_defaults` | `loan_default` | `restructured`, `enforced_closed`, `written_off` |
| `loan_restructure` | `oe_loan_restructure` | `loan_restructure` | clean |
| `loan_transfer` | `oe_loan_transfers` | `loan_transfer` | `completed`, `declined`, `rejected`, `withdrawn` |
| `market_conduct_exam` | `oe_market_conduct_exams` | `market_conduct_exam` | `enforcement_action`, `closed_satisfactory`, `withdrawn` |
| `methodology_amendment` | `oe_methodology_amendments` | `methodology_amendment` | clean |
| `oem_fco` | `oe_oem_field_change_orders` | `oem_fco` | `completed`, `withdrawn` |
| `permit_to_work` | `oe_permit_to_work` | `permit_to_work` | clean |
| `planned_outage` | `oe_planned_outages` | `planned_outage` | `rejected`, `closed` |
| `pm_compliance` | `oe_pm_compliance` | `pm_compliance` | `closed` |
| `poa_cpa_inclusion` | `oe_poa_cpa_inclusions` | `poa_cpa_inclusion` | `excluded`, `completed` |
| `ppa_annual_recon` | `oe_ppa_annual_recon` | `ppa_annual_recon` | `settled`, `restated` |
| `ppa_change_in_law` | `oe_ppa_change_in_law` | `ppa_change_in_law` | clean |
| `ppa_nomination` | `oe_ppa_nominations` | `ppa_nomination` | `deviation_settled`, `excused`, `cancelled` |
| `ppa_termination` | `oe_ppa_terminations` | `ppa_termination` | `closed`, `reinstated` |
| `project_change_order` | `oe_project_change_orders` | `project_change_order` | `incorporated`, `cancelled` |
| `project_risk` | `oe_project_risks` | `project_risk` | `cancelled` |
| `public_consultation` | `oe_public_consultations` | `public_consultation` | `closed` |
| `punch_list` | `oe_punch_list` | `punch_list` | clean |
| `rec_lifecycle` | `oe_rec_lifecycle` | `rec_lifecycle` | `rejected`, `clawed_back` |
| `reserve_account` | `oe_reserve_account_chain` | `reserve_account` | `breached`, `cancelled` |
| `reserve_activation` | `oe_reserve_activations` | `reserve_activation` | `settled`, `dispute_resolved`, `withdrawn` |
| `security_perfection` | `oe_security_perfection` | `security_perfection` | clean |
| `security_remediation` | `oe_security_remediations` | `security_remediation` | clean |
| `service_contract` | `oe_service_contracts` | `service_contract` | `renewed`, `cancelled` |
| `service_request` | `oe_service_request_chain` | `service_request` | `archived` |
| `settlement_fail` | `oe_settlement_fails` | `settlement_fail` | `closed_resolved`, `written_off` |
| `sll_kpi` | `oe_sll_kpi_compliance` | `sll_kpi` | `sustainability_event` |
| `soiling_audit` | `oe_soiling_audit` | `soiling_audit` | clean |
| `spare_parts_provisioning` | `oe_spare_parts_provisioning` | `spare_parts_provisioning` | clean |
| `sseg_registration` | `oe_sseg_registrations` | `sseg_registration` | `referred_to_licensing`, `refused`, `lapsed` |
| `submittal_rfi` | `oe_submittal_rfi` | `submittal_rfi` | `closed_clean` |
| `tariff_determination` | `oe_tariff_determinations` | `tariff_determination` | `implemented`, `remitted` |
| `trade_allocation` | `oe_trade_allocations` | `trade_allocation` | `settled` |
| `transmission_outage` | `oe_transmission_outage` | `transmission_outage` | clean |
| `vcm_project_development` | `oe_vcm_projects` | `vcm_project_development` | `credits_issued`, `cancelled` |
| `vendor_escalation` | `oe_vendor_escalation` | `vendor_escalation` | `recall_issued`, `arbitration` |
| `virtual_ppa_settlement` | `oe_virtual_ppa_settlements` | `virtual_ppa_settlement` | `settled`, `written_off` |
| `warranty_claim` | `oe_warranty_claims` | `warranty_claim` | `closed` |
| `warranty_recovery` | `oe_warranty_recoveries` | `warranty_recovery` | `rejected`, `written_off` |
| `wheeling_access` | `oe_wheeling_access` | `wheeling_access` | `terminated`, `expired` |

---

## §2 RENAMED-CANDIDATE — obvious v2 counterpart under a different key (35)

Each proposal needs a one-line confirmation from the chain owner before the mapping is frozen; after confirmation these rows get the same terminal-status mismatch treatment as §1.

| v1 key | v1 table | Proposed v2 chain | Rationale |
|---|---|---|---|
| `algo_certification` | `oe_algo_certifications` | `algo_cert` | Same W60 FSCA algorithmic-trading certification; abbreviated key. |
| `capital_adequacy_report` | `oe_capital_adequacy_reports` | `capital_adequacy` | v2 noun "Capital adequacy return" — same W203 return. |
| `carbon_scope3_disclosure` | `oe_carbon_scope3_disclosures` | `scope3_disclosure` | Same W225 Scope 3 disclosure; `carbon_` prefix dropped. |
| `carbon_tax_return` | `oe_carbon_tax_returns` | `carbon_tax` | v2 noun "Carbon tax return" — same W200 SARS filing. |
| `cbt_sed_report` | `oe_cbt_sed_reports` | `cbt_sed` | v2 noun "CBT/SED annual report" — same W230 report. |
| `change_request` | `oe_change_requests` | `change_enablement` | v2 noun "Change request" — same W47 RFC lifecycle. |
| `cod_chain` | `oe_cod_chain` | `cod` | Same W20 COD certification lifecycle; `_chain` suffix dropped. |
| `control_environment_audit` | `oe_control_environment_audit` | `audit` | W121 control-environment audit is also an audit engagement; shares the v2 `audit` chain with `ipp_aud` (two v1 descriptors, one v2 target). |
| `credit_facility_application` | `oe_credit_facility_applications` | `credit_origination` | v2 noun "Credit facility origination" — same W53 credit-origination flow. |
| `crediting_period_renewal` | `oe_crediting_period_renewals` | `crediting_renewal` | v2 noun "Crediting-period renewal" — same W56 flow. |
| `demand_response_event` | `oe_demand_response_events` | `demand_response` | v2 noun "Demand-response event" — same W205 DR event. |
| `disbursement_case` | `oe_disbursement_cases` | `disbursement` | Same UoP disbursement lifecycle; `_case` suffix dropped in v2. |
| `fsca_compliance_report` | `oe_fsca_compliance_reports` | `fsca_compliance` | v2 noun "FSCA compliance filing" — same W201 filing. |
| `gca_connection` | `oe_gca_connections` | `gca` | v2 noun "Grid connection agreement" — same W28 GCA flow. |
| `gcc_ncr` | `oe_grid_code_compliance` | `grid_code_compliance` | Rides the same `oe_grid_code_compliance` table as the exact-matched `grid_code_compliance` descriptor; the NCR sub-lifecycle needs a state-mapping decision. |
| `green_bond_report` | `oe_green_bond_reports` | `green_bond` | v2 noun "Green bond impact report" — same W202 reporting flow. |
| `imbalance_settlement` | `oe_imbalance_settlement` | `imbalance` | v2 noun "Imbalance settlement" — same W105 settlement run. |
| `ipp_aud` | `oe_ipp_annual_audits` | `audit` | v2 `audit` is a generic engagement lifecycle (fieldwork → findings → remediation → verified); the W189 annual external audit is an instance of it. |
| `ipp_doc_control` | `oe_ipp_document_control` | `ipp_document_control` | Unabbreviated key; same W96 IDC document-control register. |
| `ipp_fm` | `oe_ipp_fm` | `force_majeure_claim` | v1 title "Force majeure" (W158); v2 spells the noun out. |
| `kyc_verification` | `oe_kyc_verifications` | `kyc` | v2 noun "KYC case" — same W198 verification flow. |
| `market_abuse_case` | `oe_market_abuse_cases` | `market_abuse` | Same W52 market-abuse (STOR) case lifecycle; `_case` suffix dropped. |
| `milestone_variance_report` | `oe_milestone_variance_reports` | `milestone_variance` | v2 noun "Milestone variance report" — same W207 report. |
| `mrv_submissions` | `mrv_submissions` | `carbon_mrv` | v2 noun "Carbon MRV report" — same W11 MRV verification flow. |
| `om_work_order` | `om_work_orders` | `wo` | v2 noun "Work order" (pilot six); same `om_work_orders` table. |
| `ppa_contract_chain` | `oe_ppa_contract_chain` | `ppa_contract` | Pilot-six chain; same W22 PPA contract lifecycle, `_chain` suffix dropped. |
| `ppa_payment_security` | `oe_ppa_payment_securities` | `payment_security` | v2 noun "Payment security" — same W54 PPA payment-security instrument. |
| `ppa_take_or_pay` | `oe_top_cases` | `take_or_pay` | v2 noun "Take-or-pay reconciliation" — same W32 ToP case. |
| `problem_record` | `oe_problem_records` | `problem_management` | v2 noun "Problem record" — same W41 ITIL problem lifecycle. |
| `procurement_rfp` | `oe_procurement_rfps` | `procurement` | v2 procurement package (requisition → RFQ → award → PO) subsumes the RFP lifecycle. |
| `rez_capacity` | `oe_grid_capacity_allocations` | `grid_capacity_allocation` | v1 table `oe_grid_capacity_allocations` names the v2 chain exactly. |
| `slb_kpi_ratchet` | `oe_slb_kpi_ratchets` | `slb_kpi` | v2 noun "SLB KPI ratchet" — same W204 sustainability-linked bond KPI flow. |
| `support_tickets` | `support_tickets` | `support_ticket` | Plural/singular rename; same W14 support-ticket lifecycle. |
| `trade_report` | `oe_trade_reports` | `trade_reporting` | v2 noun "Trade reporting to trade repository" — same W44 reporting obligation. |
| `work_order` | `om_work_orders` | `wo` | Duplicate v1 descriptor over the same `om_work_orders` table as `om_work_order`; both fold into v2 `wo`. |

---

## §3 NO-COUNTERPART — nothing in v2 covers it (81)

These block elimination of their legacy routes until either a P2 declaration extraction produces a v2 ChainDecl or an explicit retire decision is written down (REBUILD_PLAN.md §14 exception ledger). The dominant clusters: the IPP construction-management suite (RFI/submittal/TQ/MIR/diary/DFR/site-instruction/NCR/method-statement/…), the IPP annual-compliance reporting family (W16x–W19x), and analytics-flavoured chains that v2 intends as projections rather than transactions.

| v1 key | v1 table | Wave | Domain note |
|---|---|---|---|
| `article6_adjustment` | `oe_article6_adjustments` | W4 | Paris Article 6 corresponding adjustment (W4); regulator-grade carbon crossing with no v2 chain. |
| `asset_prognostics` | `oe_asset_prognostics` | W71 | RUL/prognostics case (W71, ML-driven); no v2 analytics chain. |
| `audit_chain_block` | `oe_audit_chain_block` | W0 | v1 hash-chain block proposal/anchoring (W118); superseded by the v2 event-log architecture itself, not ported as a chain. |
| `bess_soh` | `oe_bess_soh` | W88 | BESS state-of-health degradation tracking (W88); no v2 asset-health chain. |
| `commissioning` | `om_sites` | W12 | Site commissioning over `om_sites`; narrower than v2 `cod` certification. |
| `compliance_notice` | `oe_compliance_notices` | W5 | Regulator-issued compliance notice / enforcement; v2 `consultation_notice` is a different instrument. |
| `cp_tracker` | `oe_cp_tracker` | W192 | Conditions-precedent tracker (W192); v2 handles CPs as drawdown guards, not a chain. |
| `csat_record` | `oe_csat_records` | W208 | Customer-satisfaction lifecycle (W208); no v2 counterpart. |
| `dfr` | `oe_dfr` | W0 | Daily field report; construction-management suite. |
| `dlp_defect` | `oe_ipp_dlp_defects` | W145 | Defects-liability-period defect (W145); no v2 chain. |
| `dscr_monitoring` | `oe_dscr_monitoring` | W86 | Lender DSCR covenant monitoring feed (W86); overlaps covenant chains but has no v2 twin. |
| `dscr_report` | `oe_dscr_reports` | W0 | Periodic DSCR report artefact; same gap as dscr_monitoring. |
| `generation_revenue_assurance` | `oe_generation_revenue_assurance` | W79 | Meter-vs-invoice revenue assurance (W79); no v2 counterpart. |
| `green_tariff_disclosure` | `oe_green_tariff_disclosures` | W210 | Green-tariff disclosure report (W210); v2 `green_tariff` is customer *enrollment*, a different lifecycle — do not conflate. |
| `ipp_acs` | `oe_ipp_annual_compliance_assessments` | W188 | Annual compliance assessment (W188); no v2 chain. |
| `ipp_ael` | `oe_ipp_ael_applications` | W172 | Atmospheric emission licence application (W172); distinct permit, no v2 chain. |
| `ipp_anr` | `oe_ipp_licence_returns` | W184 | NERSA annual licence return (W184); regulator filing with no v2 chain. |
| `ipp_bbbee` | `oe_ipp_bbbee_verification` | W182 | B-BBEE verification (W182); no v2 chain. |
| `ipp_bfs` | `oe_ipp_bfs_studies` | W168 | Bankable feasibility study (W168); no v2 chain. |
| `ipp_ccc` | `oe_ipp_ccc_negotiations` | W166 | Connection cost contribution negotiation (W166); v2 `connection_budget_quote` is the narrower quote letter, not the CCC negotiation. |
| `ipp_cd` | `oe_ipp_contractor_defaults` | W160 | Contractor default event (W160); no v2 chain. |
| `ipp_cep` | `oe_ipp_cep_compliance` | W180 | Community equity participation compliance (W180); no v2 chain. |
| `ipp_coc` | `oe_ipp_change_of_control` | W156 | Change of control approval (W156); no v2 chain. |
| `ipp_construction_diary` | `oe_ipp_construction_diary` | W143 | Daily site diary (W143); construction-management suite. |
| `ipp_ctr` | `oe_ipp_community_trust_reports` | W164 | Community trust report (W164); no v2 chain. |
| `ipp_eam` | `oe_ipp_ea_amendments` | W169 | EA amendment (W169); v2 `environmental_authorisation` covers the original EIA application, not amendments. |
| `ipp_eco` | `oe_ipp_eco_reports` | W161 | Environmental control officer annual report (W161); no v2 chain. |
| `ipp_empr` | `oe_emp_compliance_reports` | W190 | EMP compliance report (W190); no v2 chain. |
| `ipp_env_closure` | `oe_ipp_env_closure` | W151 | Environmental closure / rehabilitation (W151); no v2 chain. |
| `ipp_env_monitoring` | `oe_ipp_env_monitoring` | W138 | Ongoing environmental monitoring register (W138); no v2 chain. |
| `ipp_eqt` | `oe_ipp_equity_transfers` | W186 | Equity transfer approval (W186); no v2 chain. |
| `ipp_esmr` | `oe_ipp_esmr` | W176 | E&S monitoring report (W176); no v2 chain. |
| `ipp_final_completion` | `oe_ipp_final_completion` | W0 | Final completion certificate; construction-management suite. |
| `ipp_gcc` | `oe_ipp_grid_compliance` | W165 | IPP grid-code compliance programme (W165); distinct from the exact-matched `grid_code_compliance`. |
| `ipp_hra` | `oe_ipp_hra_assessments` | W171 | Heritage resources assessment (W171); distinct permit, no v2 chain. |
| `ipp_ie_cert` | `oe_ipp_ie_cert` | W153 | Independent-engineer milestone certification (W153); no v2 chain. |
| `ipp_iear` | `oe_ipp_ie_annual_reviews` | W177 | IE annual review (W177); no v2 chain. |
| `ipp_insr` | `oe_ipp_insurance_renewals` | W178 | Insurance renewal (W178); no v2 chain. |
| `ipp_lam` | `oe_ipp_land_amendments` | W163 | Land amendment (W163); no v2 chain. |
| `ipp_land_register` | `oe_ipp_land_register` | W150 | Land register update (W150); no v2 chain. |
| `ipp_lcr` | `oe_ipp_lc_reports` | W174 | Local content & SED reporting (W174); no v2 chain. |
| `ipp_lrep` | `oe_ipp_lender_reporting` | W183 | Lender reporting pack (W183); no v2 chain. |
| `ipp_lta` | `oe_ipp_lta_certificates` | W162 | Lenders technical advisor drawdown certificate (W162); no v2 chain. |
| `ipp_mc` | `oe_ipp_milestone_certifications` | W175 | Milestone certification (W175); no v2 chain. |
| `ipp_method_statement` | `oe_ipp_method_statements` | W137 | Construction method statement approval (W137); construction-management suite. |
| `ipp_mir` | `oe_ipp_mirs` | W0 | Material inspection request; construction-management suite. |
| `ipp_om_handover` | `oe_ipp_om_handover` | W0 | Construction-to-O&M handover; construction-management suite. |
| `ipp_omc` | `oe_ipp_om_contracts` | W167 | O&M contract lifecycle (W167); no v2 chain. |
| `ipp_payment_cert` | `oe_ipp_payment_certs` | W0 | Contractor payment certificate; construction money flow, no v2 chain. |
| `ipp_performance_bonds` | `ipp_performance_bonds` | W150 | Performance bond instrument (W150); v2 `payment_security` covers PPA payment security, not construction bonds. |
| `ipp_ppavar` | `oe_ipp_ppa_variation` | W155 | PPA variation (W155); v2 `ppa_contract` covers the base contract, not variations. |
| `ipp_progress_claim` | `oe_ipp_progress_claims` | W0 | Contractor progress claim; construction money flow, no v2 chain. |
| `ipp_psec` | `oe_ipp_perf_securities` | W179 | Performance security instrument (W179); same gap as ipp_performance_bonds. |
| `ipp_qgr` | `oe_ipp_quarterly_gen_reports` | W187 | Quarterly generation report (W187); no v2 chain. |
| `ipp_refi` | `oe_ipp_refinancing` | W157 | Refinancing event (W157); no v2 chain. |
| `ipp_rfi` | `oe_ipp_rfi` | W0 | Construction request-for-information; construction-management suite. |
| `ipp_rpr` | `oe_ipp_reipppp_reports` | W185 | REIPPPP quarterly progress report (W185); no v2 chain. |
| `ipp_sed` | `oe_ipp_sed_compliance` | W181 | SED annual spend compliance (W181); no v2 chain. |
| `ipp_subcontractor` | `oe_ipp_subcontractors` | W0 | Subcontractor approval register; construction-management suite. |
| `ipp_submittal` | `oe_ipp_submittal` | W0 | Contractor submittal review; construction-management suite. |
| `ipp_tpa` | `oe_ipp_tpa` | W154 | Third-party access / wheeling agreement (W154); v2 `gtia` is the technical interface agreement, a different instrument. |
| `ipp_tq` | `oe_ipp_tqs` | W0 | Technical query; construction-management suite. |
| `ipp_wul` | `oe_ipp_wul_applications` | W170 | Water-use licence application (W170); distinct permit, no v2 chain. |
| `licence_obligation` | `oe_licence_obligations` | W193 | Licence-condition obligation tracker (W193); no v2 chain. |
| `ncr` | `oe_ipp_ncrs` | W136 | Construction non-conformance report (W136); part of the un-ported construction-management suite. |
| `oe_dispatch_nominations` | `oe_dispatch_nominations` | W13 | Grid dispatch nomination (v1 key equals its table name — registry quirk); no v2 dispatch chain. |
| `pnl_attribution` | `oe_pnl_attribution` | W111 | T+1 P&L attribution (W111); v2 treats analytics as projections, no chain. |
| `poslimit_case` | `oe_poslimit_cases` | W29 | Trader position-limit breach case; v2 handles limits via mandates/guards, no case chain. |
| `ppa_obligation` | `oe_offtaker_ppa_obligations` | W7 | Offtaker-side PPA delivery-obligation tracking; distinct from v2 `take_or_pay`. |
| `pr_underperformance` | `oe_pr_chain` | W24 | Performance-ratio underperformance case (W24); no v2 counterpart. |
| `pretrade_credit_check` | `oe_pretrade_credit_check` | W107 | Pre-trade credit check record (W107); v2 expresses this as an order guard, not a chain. |
| `regulator_export_pack` | `oe_regulator_export_pack` | W0 | W119 regulator export pack; superseded by the v2 L6 export gate rather than ported. |
| `regulator_inbox` | `oe_regulator_inbox` | W5 | Regulator inbox/triage item; v2 surfaces may obsolete it rather than port it. |
| `site_instruction` | `oe_ipp_site_instructions` | W0 | Engineer site instruction; construction-management suite. |
| `sla_performance_report` | `oe_sla_performance_reports` | W217 | Platform SLA performance report (W217); no v2 counterpart. |
| `smart_meter_asset` | `oe_smart_meter_assets` | W199 | Smart-meter asset register (W199); master data more than a lifecycle. |
| `stage_gate` | `oe_stage_gates` | W131 | IPP stage-gate (W131) governance decision with conditions aging; no v2 gate chain. |
| `substation_asset` | `oe_substation_assets` | W211 | Grid substation asset register; master data more than a lifecycle. |
| `tariff_indexation` | `oe_tariff_indexation` | W39 | W39 MYPD-driven PPA repricing run; acceptance edge #8 depends on a replacement. |
| `unserved_energy_claim` | `oe_unserved_energy_claims` | W197 | Unserved-energy claim (W197); no v2 chain. |
| `variation_order` | `oe_ipp_variation_orders` | W0 | Construction variation order (cap-band governed); no v2 chain. |
V2ONLY_COUNT=19

---

## §4 Import mechanics (recap of REBUILD_PLAN.md §11 "Backfill")

Per §11, backfill is **one `imported` event per legacy row**, carrying:

- the **full v1 row** in `payload` (we do not fabricate the history we never recorded — the export pack says exactly that, on its face);
- `provenance: 'legacy'`;
- hash-chained like any other event — imported events are inside the tamper-evident chain, not an annex.

One event per row is **necessary but not sufficient**. The import must also **replay each imported state's effects** — the `sets` (block flags) and `txn_link`s that reaching that state would have produced — or the engine's guards will not recognise the world (§11's example: an imported-admitted participant whose `not_admitted` flag was never raised-and-cleared trips `noBlockFlag` on their first order at cutover 00:01). Concretely, per §11: admitted participants get the flag raise-and-clear replayed; mid-KYC orgs get a linked `kyc` txn with `not_admitted` **raised**; suspended participants keep their flag raised; per-user limits import as `mandate` txns; legacy users import as actor rows with `idp_sub` NULL, linked at first WorkOS login.

**Gate (verbatim from §11):** an imported-admitted participant can fire a first-value initiating edge at cutover 00:01. If the guard rejects them, the backfill is wrong, not the guard.

**Recommended per-chain cutover order:**

1. **EXACT-clean chains first** (20 chains, §1 rows marked "clean") — the import needs no terminal-state mapping decision, so each is a pure mechanical replay; smallest blast radius per §11's per-chain strangler. Within this set, follow the P0/P1 pilot order where applicable (`ppa_contract` first, then the rest of the pilot six).
2. **EXACT with mismatches** — after a written terminal-status mapping per chain (one table row per decision, appended to this document).
3. **RENAMED-CANDIDATE** — after the rename is confirmed and the same mapping exercise done; the two shared-table pairs (`om_work_order`/`work_order` → `wo`, `grid_code_compliance`/`gcc_ncr`) import each table exactly once.
4. **NO-COUNTERPART** — no cutover; each row exits this class only via P2 extraction (new ChainDecl, then reclassified above) or an explicit retire decision.

### §4.1 Written status-mapping decisions (2026-07-15, dev-data sweep)

The first full dev import (164 rows across all 20 clean chains) quarantined rows whose **non-terminal** v1 status has no same-name v2 state. Decisions below are encoded in `STATUS_MAP` in `src/v2/import/legacy.ts` (statically, per the identifier rule) and pinned by `tests/v2/import-legacy.test.ts` — including a guard that every target is a real state of its chain and never shadows an existing same-name state. The original v1 status always survives verbatim inside `payload.row`; the mapping only picks the v2 resume state (and therefore which timers arm).

| Chain | v1 status | → v2 state | Rationale |
|---|---|---|---|
| cyber_incident | detected | reported | same lifecycle entry point |
| cyber_incident | investigating, escalated | triaged | active handling pre-containment |
| cyber_incident | notified_regulator, notified_subjects | contained | POPIA s22 notifications happen post-containment in the v1 flow |
| cyber_incident | remediation_planned, remediation_executing | eradicated | remediation ≈ eradication work |
| cyber_incident | verified | recovered | post-remediation verification |
| cyber_incident | false_alarm | dismissed | terminal no-incident |
| hse_incident | notified_authority | investigating | authority notice occurs during investigation |
| hse_incident | escalated | triaged | escalation returns to triage ownership |
| hse_incident | corrective_actions_planned, corrective_actions_executing | corrective_actions_assigned | v2 collapses plan/execute into assigned |
| hse_incident | verified | corrective_actions_verified | direct rename |
| hse_incident | false_alarm | dismissed | terminal no-incident |
| ipp_evm | CR_logged | variance_detected | v1 change-request flow ≈ v2 reforecast flow |
| ipp_evm | CR_approved, contingency_drawn | reforecast_published | approved CR / drawn contingency = published reforecast |
| loan_restructure | restructure_proposal_drafted | proposal_drafted | rename |
| loan_restructure | lender_credit_committee_review | committee_review | rename |
| loan_restructure | borrower_term_sheet_negotiation | term_negotiation | rename |
| loan_restructure | legal_documentation_drafted | legal_documentation | rename |
| loan_restructure | effective_date | effective | rename |
| ppa_change_in_law | event_logged | notified | lifecycle entry |
| ppa_change_in_law | eligibility_review, impact_assessment, claim_submitted, counterparty_review, negotiation | assessing | v2 collapses the assessment pipeline into one state |
| ppa_change_in_law | in_arbitration | disputed | rename |
| ppa_change_in_law | relief_granted | agreed | granted but not yet implemented |
| transmission_outage | extended | outage_in_progress | an extended outage is still in progress |

### §4.2 EXACT-with-mismatch wave (2026-07-15) — 69 chains mapped, 2 held

Per §4 rule 2, one written decision per chain. All 69 below are now in `IMPORTABLE_CHAINS` (89 total) with mappings in `STATUS_MAP`; the counterparty role decisions are the map values in `IMPORTABLE_CHAINS`. Non-terminal targets re-arm that state's timers (noted); everything else lands terminal and arms nothing.

**Held out (NOT importable yet — quarantine wholesale until a domain decision):**
- `ccp_assessment` — v1 rows are Core Carbon Principles *label* assessments; the v2 decl is central-counterparty *risk admission*. Same key, different domain. Importing would file carbon-integrity labels as CCP admissions.
- `disposition` — v1 rows are regulator disposition cases; the v2 decl is lender asset-disposal consent. Same key, different domain.

| Chain | v1 status | → v2 state | Rationale |
|---|---|---|---|
| availability_guarantee | settled | remedy_instructed | settlement-honesty: instruction, not custody |
| availability_guarantee | dispute_resolved | met_closed | resolved dispute closes the guarantee period |
| best_execution | closed | attested | closure implies attestation completed |
| best_execution | exception_escalated | rejected | escalated exception = failed attestation |
| best_execution | rfq_expired | cancelled | expiry without execution |
| black_start | recertified | certified | non-terminal; re-arms test timers |
| black_start | contract_terminated | decertified | terminated contract ends certification |
| carbon_budget | final | closed | rename |
| carbon_budget | appeal | rejected | appeal follows rejection |
| carbon_credit_rating | re_rated, downgraded | published | rating still in force; v1 status in payload.row |
| carbon_credit_rating | escalated_to_integrity | rating_declined | integrity escalation kills the rating |
| carbon_erpa | completed | delivery_confirmed | completion = final delivery confirmed |
| carbon_erpa | withdrawn | negotiation_failed | withdrawal before execution |
| carbon_issuance | cancelled | withdrawn | rename |
| carbon_registration | crediting_active | registered | active crediting means registered |
| carbon_registry_transfer | ca_notified, completed | transferred | post-transfer administrivia |
| carbon_registry_transfer | aml_rejected, registry_rejected | rejected | rejection collapse |
| carbon_registry_transfer | cancelled | withdrawn | rename |
| carbon_retirement | cancelled | withdrawn | rename |
| carbon_reversal | closed | compensated | closure implies compensation done |
| carbon_reversal | escalated | under_assessment | non-terminal; back in assessment |
| carbon_reversal | false_alarm | rejected | no reversal occurred |
| certificate_bundle | retired | bundle_closed | rename |
| certificate_bundle | expired, cancelled | withdrawn | bundle never delivered |
| complaint_resolution | appealed | escalated | appeal = escalation path |
| compliance_inspection | compliant_closed | closed_compliant | rename |
| compliance_inspection | enforcement_closed | referred_enforcement | enforcement outcome |
| compliance_inspection | withdrawn | cancelled | rename |
| connection_energization | commercial_operation | energized | COD follows energization |
| connection_energization | connection_withdrawn | withdrawn | rename |
| construction_cost_report | budget_compliant, resolved | certified | compliant/resolved report is a certified report |
| construction_cost_report | default_triggered | rejected | default outcome |
| construction_cost_report | cancelled | withdrawn | rename |
| counterparty_margin | recovered | margin_posted_instructed | settlement-honesty terminal |
| counterparty_margin | written_off | defaulted | write-off follows default |
| cp_clearance | expired | cp_defaulted | expiry without clearance = CP default |
| credit_insurance | claim_paid | claim_instructed | settlement-honesty: instruction, not payment custody |
| credit_insurance | lapsed | expired | rename |
| cross_border_trade | trade_executed | delivered | executed trade completed delivery in v1 |
| cross_border_trade | fsca_rejected, sarb_rejected | rejected | regulator-rejection collapse |
| cross_border_trade | expired | cancelled | rename |
| curtailment_claim | compensation_settled | compensated_instructed | settlement-honesty terminal |
| curtailment_claim | arbitrated, non_compensable | dismissed | v2 'rejected' is a non-terminal appeal state; dismissed is the terminal |
| drawdown | closed | disbursed | 'disbursed' is a settlement-honesty terminal with no live edge; import (Store.commit) is its only legitimate writer |
| drawdown | cancelled | withdrawn | rename |
| ed_commitment | closed | commitment_closed | rename |
| enforcement_action | paid | resolved | payment resolves the action |
| enforcement_action_s35 | settled, archived | action_closed | closure collapse |
| enforcement_action_s35 | cancelled | withdrawn | rename |
| eop_activation | per_completed, escalated_to_regulator | eop_closed | post-event review done / escalation recorded in payload.row |
| eop_activation | per_outstanding | post_event_review | non-terminal; review still open |
| eop_activation | withdrawn | stood_down | rename |
| esap_compliance | accepted, verified | compliant | acceptance/verification = compliant |
| esg_disclosure | archived | published | archive follows publication |
| esg_disclosure | cancelled | withdrawn | rename |
| export_curtailment | settled | closed | settlement closes the event |
| export_curtailment | rejected | disputed | rejected claim is in dispute |
| export_curtailment | withdrawn | cancelled | rename |
| fsca_conduct_report | accepted, escalated | closed | report lifecycle done; escalation in payload.row |
| grid_code_compliance | compliant_closed | resolved | rename |
| grid_code_compliance | disconnection_issued | enforcement_referred | disconnection is an enforcement outcome |
| handover_dossier | archived | handed_over | archive follows handover |
| handover_dossier | rejected | dossier_rejected | rename |
| handover_dossier | voided | withdrawn | rename |
| interconnector_schedule | cancelled | withdrawn | rename |
| ipp_schedule | completed, late_finish | schedule_completed | late finish still completed; v1 status in payload.row |
| ipp_schedule | cancelled | schedule_cancelled | rename |
| isda_agreement | active, suspended | executed | non-terminal live state; suspension survives in payload.row |
| itp | archived | itp_closed | rename |
| itp | rejected | itp_rejected | rename |
| itp | voided | withdrawn | rename |
| levy_assessment | settled | levy_settled | rename |
| levy_assessment | written_off | assessment_waived | write-off = waiver |
| levy_assessment | withdrawn | assessment_withdrawn | rename |
| licence_renewal | granted | renewal_granted | non-terminal; arms 14d issue SLA |
| licence_renewal | amended | renewal_issued | amendment happens post-issue |
| load_curtailment | closed | curtailment_complete | rename |
| load_curtailment | refused | non_compliance | refusal is non-compliance |
| load_curtailment | withdrawn | directive_cancelled | rename |
| loan_default | restructured | waived | restructure resolves the default (see loan_restructure chain for the restructure itself) |
| loan_default | enforced_closed, written_off | enforced | enforcement collapse |
| loan_transfer | completed | transfer_registered | completion = registration |
| loan_transfer | declined, rejected | transfer_declined | decline collapse |
| loan_transfer | withdrawn | transfer_withdrawn | rename |
| market_conduct_exam | enforcement_action | referred_enforcement | rename |
| market_conduct_exam | closed_satisfactory | closed | rename |
| market_conduct_exam | withdrawn | cancelled | rename |
| oem_fco | completed | closed | rename |
| oem_fco | withdrawn | cancelled | rename |
| planned_outage | rejected | request_rejected | rename |
| planned_outage | closed | returned_to_service | closure implies RTS |
| pm_compliance | closed | completed | rename |
| poa_cpa_inclusion | excluded | rejected | exclusion = rejection |
| poa_cpa_inclusion | completed | included | completion = inclusion |
| ppa_annual_recon | settled | settled_instructed | settlement-honesty terminal |
| ppa_annual_recon | restated | computed | non-terminal; re-arms agree/dispute timers |
| ppa_nomination | deviation_settled, excused | accepted | deviation resolved; detail in payload.row |
| ppa_nomination | cancelled | withdrawn | rename |
| ppa_termination | closed | terminated | rename |
| ppa_termination | reinstated | withdrawn | reinstatement = termination withdrawn |
| project_change_order | incorporated | approved | incorporation follows approval |
| project_change_order | cancelled | withdrawn | rename |
| project_risk | cancelled | withdrawn | rename |
| public_consultation | closed | outcome_published | closure implies outcome published (weakest call; v1 status in payload.row) |
| rec_lifecycle | rejected, clawed_back | cancelled | certificate void collapse |
| reserve_account | breached | shortfall | non-terminal; arms cure SLA |
| reserve_account | cancelled | withdrawn | rename |
| reserve_activation | settled, dispute_resolved | settlement_instructed | settlement-honesty terminal |
| reserve_activation | withdrawn | cancelled | rename |
| service_contract | renewed | active | non-terminal live contract; renewal in payload.row |
| service_contract | cancelled | terminated | rename |
| service_request | archived | closed | rename |
| settlement_fail | closed_resolved | resolved | rename |
| settlement_fail | written_off | cancelled | write-off abandons recovery |
| sll_kpi | sustainability_event | breach_recorded | non-terminal; event = recorded breach |
| sseg_registration | referred_to_licensing | technical_review | non-terminal; licensing referral re-enters review |
| sseg_registration | refused | rejected | rename |
| sseg_registration | lapsed | withdrawn | lapse = abandonment |
| submittal_rfi | closed_clean | closed | rename |
| tariff_determination | implemented | determined | implementation follows determination |
| tariff_determination | remitted | analysis | non-terminal; remittal reopens analysis |
| trade_allocation | settled | confirmed | settlement-honesty: allocation confirm is the v2 terminal |
| vcm_project_development | credits_issued | registered | issuance follows registration |
| vcm_project_development | cancelled | withdrawn | rename |
| vendor_escalation | recall_issued, arbitration | remediation_in_progress | no v2 disputed state; state has no SLA so no timer arms |
| virtual_ppa_settlement | settled | settled_instructed | settlement-honesty terminal |
| virtual_ppa_settlement | written_off | cancelled | write-off abandons settlement |
| warranty_claim | closed | claim_closed | rename |
| warranty_recovery | rejected | recovery_denied | rename |
| warranty_recovery | written_off | withdrawn | write-off abandons recovery |
| wheeling_access | terminated, expired | access_granted | post-grant statuses land on the terminal grant (weakest call; v1 status in payload.row) |

---

### §4.3 Non-terminal backfill wave (2026-07-15) — 345 statuses across 51 chains

The §4.2 wave mapped mostly terminal mismatches; the first dev import quarantined 741 rows sitting in
non-terminal v1 statuses with no same-name v2 state. Per the §1 header rule, each maps to the nearest
v2 state by lifecycle position: the original v1 status survives verbatim in `payload.row`, and a
non-terminal target re-arms that state's timers from the row's `updated_at`. Targets were verified
against each chain's ChainDecl `states`; the STATUS_MAP guard test enforces target-exists and
no-shadow for every entry.

| Chain | v1 status | v2 resume state | Note |
|---|---|---|---|
| `availability_guarantee` | `measurement_submitted` | `measured` |  |
| `availability_guarantee` | `adjustment_review` | `measured` | non-terminal; adjustment still part of buyer's measurement assessment, re-arms 14d |
| `availability_guarantee` | `reconciled` | `measured` | reconciled but outcome (met/shortfall) not yet assessed |
| `availability_guarantee` | `meets_guarantee` | `met_closed` |  |
| `availability_guarantee` | `shortfall_flagged` | `shortfall_computed` | non-terminal; provider owes remedy, re-arms 30d |
| `availability_guarantee` | `ld_assessed` | `remedy_instructed` | LD assessment = remedy determined; settlement-honesty: instruction only, no custody |
| `availability_guarantee` | `cure_period` | `shortfall_computed` | non-terminal; provider curing = provider-held pre-remedy window |
| `best_execution` | `rfq_received` | `drafted` | v2 models the best-ex attestation, not the trade; pre-quote stages collapse to trader-held draft |
| `best_execution` | `quotes_solicited` | `drafted` | lossy collapse; v1 status in payload.row |
| `best_execution` | `quotes_received` | `drafted` | trader still assembling evidence |
| `best_execution` | `best_ex_evaluated` | `submitted` | evaluation complete = report goes to compliance |
| `best_execution` | `execution_approved` | `under_review` | compliance-held approval stage |
| `best_execution` | `executed` | `under_review` | executed but not yet TCA-reviewed = attestation pending (closed -> attested per §4.2) |
| `best_execution` | `override_executed` | `flagged` | best-ex override is a deficiency needing justification |
| `best_execution` | `tca_reviewed` | `attested` | TCA review complete = attestation done |
| `black_start` | `needs_assessed` | `capability_declared` |  |
| `black_start` | `solicitation_issued` | `capability_declared` | v2 has no procurement stage; pre-bid collapses to start |
| `black_start` | `bid_evaluation` | `under_assessment` |  |
| `black_start` | `contract_awarded` | `under_assessment` | awarded but unexecuted; v2 has no award stage, v1 status in payload.row |
| `black_start` | `contract_executed` | `certified` | non-terminal; executed contract = in restoration plan (matches contract_terminated->decertified precedent) |
| `black_start` | `drill_scheduled` | `test_scheduled` |  |
| `black_start` | `drill_in_progress` | `test_scheduled` | non-terminal; v2 has no in-progress state, witnessed only after completion |
| `black_start` | `drill_completed` | `test_witnessed` | non-terminal; completed drill awaiting certification decision |
| `black_start` | `drill_failed` | `decertified` | failed drill ends certification; re-drill re-initiates, v1 status in payload.row |
| `carbon_credit_rating` | `desk_review` | `under_assessment` |  |
| `carbon_credit_rating` | `methodology_score` | `under_assessment` | all five scoring pillars collapse into assessment; v1 status in payload.row |
| `carbon_credit_rating` | `additionality_score` | `under_assessment` |  |
| `carbon_credit_rating` | `permanence_score` | `under_assessment` |  |
| `carbon_credit_rating` | `leakage_score` | `under_assessment` |  |
| `carbon_credit_rating` | `cobenefit_score` | `under_assessment` |  |
| `carbon_credit_rating` | `composite_score` | `committee_review` | scoring done, final review before publish |
| `carbon_credit_rating` | `monitoring` | `published` | non-terminal in spirit but v2 published is the in-force state (re_rated->published precedent) |
| `carbon_credit_rating` | `re_rating_triggered` | `under_assessment` | non-terminal; back into assessment, re-arms 5d |
| `carbon_erpa` | `erpa_drafted` | `negotiating` |  |
| `carbon_erpa` | `delivery_verified` | `delivery_confirmed` |  |
| `carbon_erpa` | `erpa_executed` | `executed` | non-terminal; re-arms 7d schedule-delivery SLA |
| `carbon_erpa` | `delivery_initiated` | `delivery_scheduled` | non-terminal; delivery in flight |
| `carbon_erpa` | `shortfall_flagged` | `delivery_shortfall` |  |
| `carbon_erpa` | `make_good_pending` | `delivery_scheduled` | non-terminal; make-good re-delivery pending, re-arms 365d |
| `carbon_erpa` | `disputed` | `delivery_shortfall` | v2 has no ERPA dispute state; shortfall outcome recorded, dispute survives in payload.row |
| `carbon_issuance` | `screening` | `under_review` |  |
| `carbon_issuance` | `verification_check` | `under_review` | MRV still being checked; verified = check passed |
| `carbon_issuance` | `serialization` | `verified` | non-terminal; verified, credits being serialized pre-issue |
| `carbon_issuance` | `pending_registry` | `verified` | non-terminal; awaiting registry mint, re-arms 5d |
| `carbon_issuance` | `on_hold` | `under_review` | non-terminal; hold = paused review, v1 status in payload.row |
| `carbon_issuance` | `returned` | `requested` | sent back to proponent; restarts at request stage |
| `carbon_issuance` | `disputed` | `under_review` | no dispute state; unresolved stays in review, v1 status in payload.row |
| `carbon_registration` | `pin_submitted` | `project_submitted` |  |
| `carbon_registration` | `pdd_drafted` | `info_requested` | non-terminal; proponent-held doc-prep matches holder+position (60d) |
| `carbon_registration` | `validation_underway` | `validation` |  |
| `carbon_registration` | `corrections_required` | `info_requested` | non-terminal; proponent must fix |
| `carbon_registration` | `public_consultation` | `validation` | consultation runs within the validation window |
| `carbon_registration` | `dna_authorization` | `registry_review` | post-validation authority step collapses into registry review |
| `carbon_registration` | `registration_requested` | `registry_review` | request lodged, registry deciding; approved state comes after |
| `carbon_retirement` | `requested` | `submitted` | request lodged at registry |
| `carbon_retirement` | `validating` | `submitted` | non-terminal; registry validating, re-arms 5d |
| `carbon_retirement` | `adjustment_pending` | `submitted` | non-terminal; corresponding-adjustment pending, still registry-held |
| `carbon_retirement` | `adjusted` | `retired` | adjustment applied = retirement effective |
| `carbon_reversal` | `reversal_reported` | `reported` |  |
| `carbon_reversal` | `loss_quantified` | `under_assessment` | quantification is part of assessment |
| `carbon_reversal` | `buffer_cancelled` | `compensated` | buffer-pool cancellation = compensation done (closed->compensated precedent) |
| `carbon_reversal` | `replacement_required` | `compensation_pending` | non-terminal; replacement owed |
| `carbon_reversal` | `replacement_submitted` | `compensation_pending` | non-terminal; awaiting verification, re-arms 5d |
| `carbon_reversal` | `replacement_verified` | `compensated` |  |
| `complaint_resolution` | `complaint_lodged` | `lodged` |  |
| `complaint_resolution` | `admissibility_review` | `acknowledged` | post-lodge screening = handler acknowledgement stage |
| `complaint_resolution` | `referred_to_licensee` | `under_investigation` | licensee response is part of investigation |
| `complaint_resolution` | `mediation` | `resolution_proposed` | non-terminal; settlement process = proposal stage, re-arms 10d |
| `complaint_resolution` | `adjudication_hearing` | `escalated` | left informal resolution for formal adjudication (appealed->escalated precedent) |
| `complaint_resolution` | `ruling_issued` | `resolved` | ruling = outcome issued; v1 status in payload.row |
| `compliance_inspection` | `inspection_in_progress` | `inspection_conducted` | v2 has no in-progress state; conducted is the inspection stage (3d regulator) |
| `compliance_inspection` | `findings_drafted` | `inspection_conducted` | non-terminal; regulator drafting pre-issue |
| `compliance_inspection` | `directive_issued` | `findings_issued` | directive to licensee = findings served, re-arms 14d |
| `compliance_inspection` | `remediation_underway` | `findings_issued` | non-terminal; licensee-held remediation window |
| `compliance_inspection` | `penalty_imposed` | `referred_enforcement` | penalty = enforcement outcome (enforcement_closed precedent) |
| `connection_energization` | `connection_ready` | `energization_requested` | v1 chain opens pre-programme; earliest v2 state |
| `connection_energization` | `program_review` | `energization_requested` | operator reviewing programme, holder matches |
| `connection_energization` | `program_approved` | `inspection` | programme approved; inspection is the next v2 gate |
| `connection_energization` | `pre_energization_inspection` | `inspection` |  |
| `connection_energization` | `energization_authorized` | `cleared_to_energize` |  |
| `connection_energization` | `cold_commissioning` | `cleared_to_energize` | cleared but not yet synced; v2 has no commissioning sub-state |
| `connection_energization` | `synchronized` | `energized` | grid-synced = energized; v2 merged the commissioning tail |
| `connection_energization` | `compliance_testing` | `energized` | post-sync testing; lossy — v1 status survives in payload.row |
| `connection_energization` | `commissioning_suspended` | `defect_hold` | failed hold-point ≈ defect hold |
| `construction_cost_report` | `cost_overrun_risk` | `under_review` | v1 SLA-breach escalation flag on an active un-certified report; non-terminal, v1 status in payload.row |
| `counterparty_margin` | `limit_active` | `computed` | steady-state monitoring with requirement in place |
| `counterparty_margin` | `exposure_warning` | `computed` | pre-call warning; v1 status in payload.row |
| `counterparty_margin` | `margin_call_issued` | `margin_called` |  |
| `counterparty_margin` | `collateral_received` | `margin_posted_instructed` | precedent: recovered -> margin_posted_instructed |
| `counterparty_margin` | `position_restriction` | `margin_called` | post-call escalation, collateral still outstanding; re-arms 24h SLA |
| `counterparty_margin` | `cure_period` | `margin_called` | cure window = call still open on counterparty |
| `counterparty_margin` | `default_declared` | `defaulted` |  |
| `counterparty_margin` | `close_out` | `defaulted` | default-waterfall stage; v1 status in payload.row |
| `counterparty_margin` | `default_fund_draw` | `defaulted` | default-waterfall stage; v1 status in payload.row |
| `curtailment_claim` | `curtailment_logged` | `raised` |  |
| `curtailment_claim` | `classification_review` | `raised` | grid classifying, pre-validation; holder grid matches |
| `curtailment_claim` | `claim_submitted` | `raised` | v2 'validated' means validation DONE; claim still with grid |
| `curtailment_claim` | `validation_underway` | `raised` | same — validation incomplete; re-arms 48h grid SLA |
| `curtailment_claim` | `quantum_proposed` | `quantified` |  |
| `curtailment_claim` | `disputed` | `in_dispute` |  |
| `drawdown` | `requested` | `submitted` | request lodged with lender; v2 draft is pre-submission |
| `drawdown` | `documents_submitted` | `submitted` |  |
| `drawdown` | `ie_review` | `submitted` | IE review is lender-side review; holder lender |
| `drawdown` | `cp_checklist` | `conditions_pending` |  |
| `drawdown` | `on_hold` | `conditions_pending` | v1 hold resumes to cp_checklist; nearest v2 hold state |
| `drawdown` | `funded` | `disbursed` | settlement-honesty terminal; legacy import is its only legit writer (precedent: closed -> disbursed) |
| `ed_commitment` | `false_alarm` | `monitoring` | variance flag was spurious (stale-data reconciliation); commitment resumes monitoring, v1 status in payload.row |
| `enforcement_action` | `case_opened` | `notice_issued` | pre-notice case work; earliest v2 state |
| `enforcement_action` | `allegations_drafted` | `notice_issued` | pre-service drafting; v1 status in payload.row |
| `enforcement_action` | `allegations_served` | `notice_issued` | served = respondent's representations clock running |
| `enforcement_action` | `representations_period` | `notice_issued` | respondent drafting representations; holder respondent, 14d |
| `enforcement_action` | `hearing_held` | `under_representation` | regulator deliberating post-hearing, pre-determination |
| `enforcement_action` | `determination` | `determination_made` |  |
| `enforcement_action` | `penalty_imposed` | `remediation_pending` | awaiting payment/compliance (precedent: paid -> resolved) |
| `enforcement_action` | `appealed` | `determination_made` | no v2 appeal state; back with regulator, re-arms 7d |
| `enforcement_action` | `enforced_via_court` | `resolved` | penalty enforced through court = case concluded |
| `enforcement_action_s35` | `triggered` | `notice_issued` | pre-notice trigger; earliest v2 state |
| `enforcement_action_s35` | `notice_drafted` | `notice_issued` |  |
| `enforcement_action_s35` | `respondent_acknowledged` | `notice_issued` | acknowledged, representations still due; holder respondent |
| `enforcement_action_s35` | `response_received` | `representations_made` |  |
| `enforcement_action_s35` | `adjudication_in_progress` | `under_review` |  |
| `enforcement_action_s35` | `adjudicated` | `determination_made` |  |
| `enforcement_action_s35` | `sanction_imposed` | `remediation_pending` | sanction issued, compliance outstanding |
| `enforcement_action_s35` | `appeal_window_open` | `determination_made` | post-determination window; re-arms 7d |
| `enforcement_action_s35` | `appealed` | `under_review` | appeal re-opens regulator review |
| `enforcement_action_s35` | `re_adjudicated` | `determination_made` |  |
| `enforcement_action_s35` | `enforcement_in_progress` | `remediation_pending` |  |
| `esap_compliance` | `data_collection` | `monitoring_period_open` |  |
| `esap_compliance` | `site_verification` | `monitoring_period_open` | pre-report field work; holder developer |
| `esap_compliance` | `draft_report` | `monitoring_period_open` | report not yet submitted |
| `esap_compliance` | `lender_review` | `report_submitted` | report with monitor/lender for review |
| `esap_compliance` | `minor_findings` | `findings_review` | severity survives in finding_count_minor + payload.row |
| `esap_compliance` | `major_findings` | `findings_review` | severity survives in finding_count_major + payload.row |
| `esap_compliance` | `action_plan_required` | `remediation_required` |  |
| `esap_compliance` | `action_plan_submitted` | `remediation_submitted` |  |
| `esg_disclosure` | `period_open` | `data_collection` |  |
| `esg_disclosure` | `data_collected` | `data_collection` | v2 merged collection/verification/computation |
| `esg_disclosure` | `boundary_verified` | `data_collection` |  |
| `esg_disclosure` | `metrics_computed` | `data_collection` | draft not yet compiled |
| `esg_disclosure` | `draft_compiled` | `internal_review` | draft exists; internal review is next v2 step |
| `esg_disclosure` | `assurance_engaged` | `under_assurance` |  |
| `esg_disclosure` | `assurance_in_progress` | `under_assurance` |  |
| `esg_disclosure` | `assured` | `board_review` | assurance done, pre-publish governance |
| `esg_disclosure` | `filed` | `published` | v1 filed is post-published; nearest terminal |
| `esg_disclosure` | `disputed` | `internal_review` | v1 resolve_dispute returns to internal_review; nearest non-terminal |
| `grid_code_compliance` | `monitoring` | `nc_raised` | v2 chain opens at the NC; earliest state, v1 status in payload.row |
| `grid_code_compliance` | `non_conformance_raised` | `nc_raised` |  |
| `grid_code_compliance` | `corrective_action_required` | `remediation_required` |  |
| `grid_code_compliance` | `cap_submitted` | `remediation_submitted` | CAP with operator for review; v2 merged CAP + evidence review |
| `grid_code_compliance` | `cap_approved` | `remediation_required` | plan approved, remediation executing; back to holder responsible |
| `grid_code_compliance` | `remediation_in_progress` | `remediation_required` |  |
| `grid_code_compliance` | `operating_restriction` | `remediation_required` | restriction imposed while responsible party remediates; v1 status in payload.row |
| `handover_dossier` | `dossier_compiled` | `dossier_drafting` | compiled but not yet submitted; re-arms 30d drafting SLA |
| `handover_dossier` | `submitted` | `submitted_for_review` |  |
| `handover_dossier` | `revision_required` | `rectification_required` | rename |
| `handover_dossier` | `approved` | `accepted` | non-terminal; arms 3d handover SLA |
| `handover_dossier` | `witnessed_acceptance_scheduled` | `accepted` | v2 collapses witnessed-acceptance into accepted->handed_over; v1 status in payload.row |
| `handover_dossier` | `witnessed_acceptance` | `accepted` | acceptance witnessed, ops transfer still pending |
| `handover_dossier` | `training_transferred` | `accepted` | training done but operations not yet owning; last pre-handover step |
| `handover_dossier` | `operations_owned` | `handed_over` | terminal: ops ownership = handed over |
| `handover_dossier` | `warranty_activated` | `handed_over` | post-handover step; v1 status in payload.row |
| `ipp_schedule` | `wbs_drafted` | `schedule_drafted` |  |
| `ipp_schedule` | `baseline_set` | `baseline_active` |  |
| `ipp_schedule` | `in_progress` | `baseline_active` | execution under active baseline |
| `ipp_schedule` | `status_updated` | `baseline_active` | progress updates are field writes, not states, in v2 |
| `ipp_schedule` | `variance_detected` | `baseline_active` | variance is data under the active baseline; v1 status in payload.row |
| `ipp_schedule` | `impact_assessed` | `baseline_active` | assessment pre-dates any rebaseline submission |
| `ipp_schedule` | `rebaselined` | `baseline_active` | re-baseline done => new baseline active (rebaseline_review is the pending case) |
| `ipp_schedule` | `recovered` | `baseline_active` | back on plan |
| `ipp_schedule` | `suspended` | `baseline_active` | v2 has no suspended state; non-terminal live state, v1 status in payload.row (isda_agreement precedent) |
| `itp` | `submitted` | `under_review` | submitted for engineer review |
| `itp` | `approved` | `itp_approved` |  |
| `itp` | `in_inspection` | `inspection_in_progress` |  |
| `itp` | `witness_attended` | `inspection_in_progress` | witness point attended mid-programme; counts live in fields |
| `itp` | `passed` | `inspection_complete` | non-terminal; arms 48h close SLA |
| `itp` | `corrective_action` | `under_review` | matches v2 raise_ncr edge (inspection -> under_review rework loop) |
| `itp` | `failed` | `itp_rejected` | terminal failure; detail in payload.row |
| `levy_assessment` | `levy_assessed` | `draft_assessment` | assessed but pre-issue (v1 review still follows) |
| `levy_assessment` | `assessment_review` | `draft_assessment` | internal regulator review pre-issue |
| `levy_assessment` | `invoiced` | `payment_pending` | billed => payment due; re-arms 30d payment SLA |
| `levy_assessment` | `objection_review` | `under_objection` | rename |
| `levy_assessment` | `partially_paid` | `payment_pending` | balance outstanding; v1 status in payload.row |
| `levy_assessment` | `in_arrears` | `payment_pending` | overdue, still collectible |
| `levy_assessment` | `final_demand` | `payment_pending` | dunning step within payment_pending |
| `levy_assessment` | `enforcement` | `payment_pending` | v2 has no enforcement state; live collections case, v1 status in payload.row |
| `licence_renewal` | `renewal_initiated` | `renewal_requested` |  |
| `licence_renewal` | `application_filed` | `renewal_requested` | filing = the request; arms 5d start SLA |
| `licence_renewal` | `completeness_check` | `compliance_review` | nearest review stage |
| `licence_renewal` | `public_consultation` | `evaluation` | consultation is part of the v2 evaluation phase |
| `licence_renewal` | `decision_drafted` | `renewal_decision` | decision pending council |
| `licence_renewal` | `council_voted` | `renewal_decision` | vote outcome not derivable from status alone; operator re-drives grant/refuse, v1 status in payload.row |
| `load_curtailment` | `instruction_issued` | `directive_issued` | rename; re-arms 2h no-ack time_bar |
| `load_curtailment` | `curtailment_started` | `curtailment_active` |  |
| `load_curtailment` | `target_achieved` | `curtailment_active` | target met, curtailment still standing |
| `load_curtailment` | `partial_compliance` | `curtailment_active` | live event; v1 status in payload.row (non_compliance is the terminal for refusal) |
| `load_curtailment` | `instruction_lifted` | `restoration_pending` | lifted => load restoration underway |
| `load_curtailment` | `reconciled` | `curtailment_complete` |  |
| `load_curtailment` | `post_mortem` | `curtailment_complete` | post-event review; v1 status in payload.row |
| `loan_default` | `default_flagged` | `default_declared` | v2 has no pre-declaration stage; re-arms 30d cure time_bar |
| `loan_default` | `under_review` | `default_declared` | lender assessment pre-notice; v1 status in payload.row |
| `loan_default` | `default_notice_issued` | `default_declared` | the notice IS the declaration |
| `loan_default` | `cure_period` | `cure_in_progress` | rename |
| `loan_default` | `accelerated` | `enforcement_pending` | acceleration = enforcement elected |
| `loan_default` | `enforcement_commenced` | `enforcement_pending` | commenced but not complete (v2 enforced = enforcement complete) |
| `loan_transfer` | `transfer_requested` | `transfer_proposed` |  |
| `loan_transfer` | `kyc_screening` | `transfer_proposed` | pre-consent diligence; re-arms 30d consent time_bar |
| `loan_transfer` | `screening_remediation` | `transfer_proposed` | still pre-consent; v1 status in payload.row |
| `loan_transfer` | `consent_solicitation` | `transfer_proposed` | consent not yet obtained |
| `loan_transfer` | `regulatory_review` | `consent_obtained` | consents in, regulatory CP outstanding; arms 15d CP SLA |
| `loan_transfer` | `transfer_approved` | `cp_satisfied` | approved => ready to execute |
| `loan_transfer` | `certificate_executed` | `transfer_executed` | rename |
| `loan_transfer` | `settled` | `transfer_registered` | terminal |
| `oem_fco` | `draft` | `issued` | v2 has no OEM-side authoring states; v1 status in payload.row |
| `oem_fco` | `under_review` | `issued` | pre-issue review collapsed into issued |
| `oem_fco` | `approved` | `issued` | approved but operators not yet notified |
| `oem_fco` | `population_identified` | `issued` | fleet population is field data in v2 |
| `oem_fco` | `notification_sent` | `issued` | notification = issuance to operator; re-arms 48h ack SLA |
| `oem_fco` | `scheduling` | `acknowledged` | actively arranging rollout = acknowledged's 72h schedule SLA |
| `oem_fco` | `suspended` | `scheduled` | v2 has no suspended state; rollout on hold pre-restart, v1 status in payload.row |
| `planned_outage` | `draft` | `outage_requested` | v2 has no draft state; re-arms 24h triage SLA |
| `planned_outage` | `submitted` | `under_review` |  |
| `planned_outage` | `approved` | `window_approved` |  |
| `planned_outage` | `rescheduled` | `window_approved` | new window approved; v1 status in payload.row |
| `planned_outage` | `notified` | `window_approved` | stakeholder notification pre-start, still approved-awaiting-window |
| `planned_outage` | `in_progress` | `outage_in_progress` | re-arms 7d begin_restoration time_bar |
| `planned_outage` | `restoring` | `restoration_pending` | rename |
| `planned_outage` | `restored` | `returned_to_service` | terminal |
| `pm_compliance` | `pm_scheduled` | `work_assigned` | scheduled = assigned; re-arms 24h start SLA |
| `pm_compliance` | `on_hold` | `deferred` | hold = deferral granted; v1 status in payload.row |
| `pm_compliance` | `verification_pending` | `in_progress` | v2 has no verify state; only complete_pm from in_progress reaches completed |
| `poa_cpa_inclusion` | `cpa_proposed` | `inclusion_requested` |  |
| `poa_cpa_inclusion` | `inclusion_review` | `doe_validation` | final pre-inclusion review; v2's last review stage |
| `poa_cpa_inclusion` | `monitoring` | `included` | v1 post-inclusion monitoring loop; v2 lifecycle ends at inclusion (payload keeps status) |
| `poa_cpa_inclusion` | `verified` | `included` | same collapse — verified is a monitoring-loop rest state after inclusion |
| `ppa_annual_recon` | `year_opened` | `initiated` |  |
| `ppa_annual_recon` | `data_collected` | `data_gathering` | non-terminal; data in but compute pending — v2 computed implies compute done |
| `ppa_annual_recon` | `variance_classified` | `computed` | v1 compute pipeline (classify->residual->CPI->reconcile) merged into v2 computed |
| `ppa_annual_recon` | `top_residual_computed` | `computed` | same merge |
| `ppa_annual_recon` | `cpi_capacity_applied` | `computed` | same merge |
| `ppa_annual_recon` | `reconciled` | `computed` | numbers reconciled, awaiting sign-off = v2 computed (buyer review, 21d timer re-arms) |
| `ppa_annual_recon` | `signed_off` | `agreed` | non-terminal; sign-off = mutual agreement, settlement instruction still due |
| `ppa_annual_recon` | `invoiced` | `settled_instructed` | invoice raised = settlement instructed; rails are downstream (record-only chain) |
| `ppa_nomination` | `nomination_window_open` | `submitted` | v2 has no pre-submission window; earliest state, grid 4h timer re-arms |
| `ppa_nomination` | `da_nominated` | `submitted` | nominated, awaiting grid validation |
| `ppa_nomination` | `da_confirmed` | `validated` |  |
| `ppa_nomination` | `id_revised` | `submitted` | v2 revise loops back to submitted for re-validation |
| `ppa_nomination` | `delivery_in_progress` | `accepted` | v2 nomination ends at acceptance; delivery is downstream — lossy, payload keeps status |
| `ppa_nomination` | `delivery_complete` | `accepted` | same collapse |
| `ppa_nomination` | `reconciled` | `accepted` | post-delivery reconciliation not modelled in v2 |
| `ppa_nomination` | `dispute_raised` | `accepted` | v2 has no dispute state; reconciliation dispute is downstream of the accepted nomination |
| `ppa_termination` | `termination_triggered` | `notified` | v2 opens at notice served; trigger precedes it — earliest state |
| `ppa_termination` | `notice_served` | `notified` |  |
| `ppa_termination` | `termination_review` | `cure_period` | post-cure review; last v2 non-terminal before the terminate/withdraw decision |
| `ppa_termination` | `termination_confirmed` | `terminated` |  |
| `ppa_termination` | `eta_assessment` | `terminated` | buy-out (ETA) computation is post-termination; v2 moves no money (record-only) |
| `ppa_termination` | `eta_agreed` | `terminated` | same collapse |
| `ppa_termination` | `disputed` | `terminated` | ETA dispute — PPA already confirmed terminated; v2 has no dispute state |
| `ppa_termination` | `settlement_pending` | `terminated` | payment is a downstream settlement chain's concern |
| `project_change_order` | `draft` | `raised` |  |
| `project_change_order` | `submitted` | `raised` | v2 raise = submit; pre-assessment |
| `project_change_order` | `screening` | `raised` | screening precedes impact assessment; v2 assessed means assessment complete |
| `project_change_order` | `impact_assessment` | `raised` | assessment underway, not done; originator 24h timer re-arms |
| `project_change_order` | `deferred` | `raised` | parked pending resubmit; v2 has no parked state |
| `project_change_order` | `disputed` | `pending_approval` | v1 dispute arises at approval and resolves back to re-assessment; approver holds |
| `rec_lifecycle` | `issuance_requested` | `active` | v2 has no pre-issuance states; certificate enters as active — lossy, payload keeps status |
| `rec_lifecycle` | `eligibility_review` | `active` | same collapse |
| `rec_lifecycle` | `issued` | `active` |  |
| `rec_lifecycle` | `listed_for_transfer` | `active` | listing not modelled; still holder-held |
| `rec_lifecycle` | `allocated` | `reserved` | allocated to a consumption claim pending retirement = v2 reserved-for-retirement (30d timer) |
| `rec_lifecycle` | `disputed` | `transferred` | integrity dispute freezes a post-transfer cert; v2 has no dispute state, transferred is untimed |
| `reserve_account` | `reserve_required` | `establishment_requested` |  |
| `reserve_account` | `funding_scheduled` | `funding` | v2 merged schedule + in-progress into one awaiting-funding state |
| `reserve_account` | `funding_in_progress` | `funding` |  |
| `reserve_account` | `shortfall_flagged` | `shortfall` |  |
| `reserve_account` | `cure_pending` | `shortfall` | cure underway; v2 shortfall (borrower, 5d) is the cure window |
| `reserve_account` | `drawn` | `shortfall` | authorised draw leaves balance below target pending replenish; nearest v2 analogue |
| `reserve_account` | `release_requested` | `funded` | release pending; v2 released is terminal, so hold at funded (agent holds) |
| `reserve_activation` | `activation_issued` | `instructed` |  |
| `reserve_activation` | `ramping` | `dispatched` | v2 dispatched label is 'ramping to output' |
| `reserve_activation` | `sustaining` | `dispatched` | v2 merged ramp + sustain into dispatched |
| `reserve_activation` | `released` | `delivered` | activation ended, delivery report/review due; grid 2d timer re-arms |
| `reserve_activation` | `performance_review` | `delivered` | SO reviewing delivered performance = v2 delivery-reported-awaiting-verification |
| `reserve_activation` | `verified` | `delivery_verified` | non-terminal; settlement instruction still due |
| `reserve_activation` | `non_performance` | `non_delivery` |  |
| `reserve_activation` | `disputed` | `delivery_verified` | v2 has no dispute state; hold at last pre-settlement review state |
| `service_contract` | `quoted` | `under_review` | quote issued, customer considering (72h timer re-arms) |
| `service_contract` | `renewal_due` | `active` | renewal sub-process not modelled in v2; contract remains active |
| `service_contract` | `negotiating` | `active` | renewal negotiation on a live contract — mapping to under_review would un-execute it |
| `service_contract` | `in_grace` | `active` | grace period keeps service running; v2 has no grace state, expiry is a manual transition |
| `service_request` | `approved` | `assigned` | v2 merged approve->assign; approval granted, agent queue (8h timer re-arms) |
| `service_request` | `user_responded` | `fulfilment_in_progress` | user reply puts the ball back with the agent, matching v2 awaiting_user exit |
| `settlement_fail` | `instruction_pending` | `detected` | pre-fail instruction pending; earliest v2 state (clearing 1d timer) |
| `settlement_fail` | `fail_recorded` | `detected` |  |
| `settlement_fail` | `extension_granted` | `investigating` | extension runs inside the investigation/cure window |
| `settlement_fail` | `penalty_accruing` | `investigating` | v2 has no penalty state; fail still unresolved, payload keeps accrual status |
| `settlement_fail` | `buy_in_initiated` | `buy_in_instructed` |  |
| `settlement_fail` | `buy_in_executing` | `buy_in_instructed` | execution happens on the rails; v2 records instruction only |
| `settlement_fail` | `buy_in_settled` | `resolved` |  |
| `settlement_fail` | `cash_compensation` | `resolved` | compensation instructed = fail resolved; cash movement is downstream (record-only) |
| `sseg_registration` | `registration_received` | `submitted` |  |
| `sseg_registration` | `eligibility_screening` | `under_review` | non-terminal; re-arms 10d review SLA |
| `sseg_registration` | `information_requested` | `under_review` | non-terminal; v2 has no info-gap loop — collapses into the review it rejoins; applicant-held gap survives in payload.row |
| `sseg_registration` | `technical_verification` | `technical_review` | non-terminal |
| `sseg_registration` | `exemption_determination` | `technical_review` | non-terminal; v2 has no committee-determination state between technical review and approval — still regulator-held pre-decision |
| `submittal_rfi` | `drafted` | `submitted` | v2 has no draft state; entry |
| `submittal_rfi` | `distributed` | `submitted` | non-terminal; v1 distributed = with reviewer awaiting review start, exactly v2 submitted (holder reviewer, 2d) |
| `submittal_rfi` | `clarification_requested` | `revision_requested` | non-terminal; ball with originator in both |
| `submittal_rfi` | `responded` | `answered` | non-terminal; arms 3d close timer |
| `submittal_rfi` | `approved` | `answered` | non-terminal; post-decision pre-closeout; approval survives in payload.row |
| `submittal_rfi` | `returned_for_revision` | `revision_requested` | non-terminal; direct match |
| `submittal_rfi` | `distributed_for_construction` | `closed` | v2 collapses IFC/incorporate/close into terminal closed |
| `tariff_determination` | `application_received` | `filed` |  |
| `tariff_determination` | `completeness_review` | `filed` | non-terminal; v2 filed (regulator, 30d) covers intake + completeness screening |
| `tariff_determination` | `public_consultation` | `public_process` | non-terminal; rename |
| `tariff_determination` | `revenue_analysis` | `analysis` | non-terminal |
| `tariff_determination` | `determination_issued` | `determined` | v2 collapses issue/implement into terminal determined |
| `tariff_determination` | `reconsideration_requested` | `analysis` | non-terminal; v2 has no reconsideration state — regulator re-analysing, re-arms 45d; v1 status in payload.row |
| `trade_allocation` | `executed` | `proposed` | entry; executing broker to propose allocation |
| `trade_allocation` | `allocation_pending` | `proposed` | non-terminal; allocation still with executing broker |
| `trade_allocation` | `give_up_pending` | `allocated` | non-terminal; counterparty (clearing broker) to accept = v2 allocated holder |
| `trade_allocation` | `give_up_accepted` | `allocated` | non-terminal; accepted but pre-confirmation |
| `trade_allocation` | `confirmation_issued` | `allocated` | non-terminal; awaiting counterparty affirmation |
| `trade_allocation` | `affirmed` | `confirmed` | terminal; v1 matched/settled tail is beyond v2 scope |
| `trade_allocation` | `break_review` | `allocated` | non-terminal; v1 break rejoins confirmation_issued — back in counterparty court; break survives in payload.row |
| `vendor_escalation` | `filed` | `raised` |  |
| `vendor_escalation` | `vendor_triage` | `acknowledged` | non-terminal; vendor engaged, triaging |
| `vendor_escalation` | `vendor_decision` | `acknowledged` | non-terminal; vendor position recorded, pre-plan; decision in payload.row |
| `vendor_escalation` | `escalated_to_oem` | `acknowledged` | non-terminal; v2 has no OEM tier — still vendor-side assessment; OEM stage in payload.row |
| `vendor_escalation` | `oem_field_investigation` | `acknowledged` | non-terminal; investigation = assessment phase |
| `vendor_escalation` | `oem_decision` | `remediation_planned` | non-terminal; v1 oem_decision recorded → next step is remediation, same position as plan-in-hand |
| `vendor_escalation` | `remediation` | `remediation_in_progress` | non-terminal; work underway |
| `warranty_claim` | `opened` | `claim_submitted` | v2 has no internal draft/triage stage; entry |
| `warranty_claim` | `triaged` | `claim_submitted` | non-terminal; still pre-vendor in v1 — collapses to entry; v1 status in payload.row |
| `warranty_claim` | `submitted` | `claim_submitted` | non-terminal; direct match (holder vendor, 5d) |
| `warranty_claim` | `acknowledged` | `under_assessment` | non-terminal; vendor engaged |
| `warranty_claim` | `under_review` | `under_assessment` | non-terminal; rename |
| `warranty_claim` | `disputed` | `under_assessment` | non-terminal; v2 has no dispute state — v1 dispute can resolve back to approved, so back in assessment; re-arms 10d |
| `warranty_claim` | `fulfilled` | `remediation_complete` | non-terminal; v1 fulfilled → close remains — v2 remediation_complete (claimant verifies then closes, 5d) is the same position |
| `warranty_recovery` | `claim_drafted` | `recovery_filed` | v2 has no draft state; entry |
| `warranty_recovery` | `submitted_to_oem` | `recovery_filed` | non-terminal; filed with OEM awaiting acknowledgement (holder vendor, 72h) |
| `warranty_recovery` | `oem_acknowledged` | `under_assessment` | non-terminal; OEM engaged, assessing |
| `warranty_recovery` | `assessment_complete` | `under_assessment` | non-terminal; assessment done but approve/deny decision pending — v2 has no interstitial pre-decision state; v1 status in payload.row |
| `warranty_recovery` | `approved` | `recovery_approved` | non-terminal; awaiting recovery, arms 72h |
| `warranty_recovery` | `disputed` | `under_assessment` | non-terminal; v2 has no dispute state — v1 dispute resolves back to approved, so back in assessment |
| `warranty_recovery` | `recovery_pending` | `recovery_approved` | non-terminal; approved with payment pending = v2 recovery_approved (vendor to pay, 72h) |

## §5 v2-only chains — no v1 descriptor, no backfill needed (19)

New capabilities (or v1 functionality that lived outside the Meridian chain registry). They start with an empty log and need no import:

- `close_out_netting` — Close-out netting
- `collateral_substitution` — Collateral substitution
- `connection_budget_quote` — Connection budget quote
- `consultation_notice` — Consultation notice
- `contract_execution` — Contract
- `data_breach_notification` — Data breach notification
- `data_subject_request` — Data-subject request
- `dispute_resolution` — Dispute
- `environmental_authorisation` — Environmental authorisation
- `green_tariff` — Green tariff enrollment
- `gtia` — Grid technical interface agreement
- `protection_relay` — Protection relay setting change
- `rec_device_registration` — REC device registration
- `rec_issuance` — REC issuance
- `security_margin` — Transmission outage
- `subscription_billing` — Subscription invoice
- `sustainability_transaction` — Sustainability transaction
- `tcpi` — TCPI assessment
- `wayleave_consent` — Wayleave consent
