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

---

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
