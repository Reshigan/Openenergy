-- Migration 505: Meridian chain-table indexes.
-- Generated from src/utils/chain-registry-meridian.ts (MERIDIAN_CHAINS).
--
-- Matched to the two Meridian query shapes:
--   horizon.ts — per chain table:
--     WHERE <statusCol> NOT IN (<terminal...>) ORDER BY (<deadlineCol> IS NULL), <deadlineCol>
--     -> composite index (<statusCol>, <deadlineCol>) serves the filter and the sort.
--   thread.ts — per events table:
--     WHERE <eventsFk> = ? ORDER BY created_at
--     -> composite index (<eventsFk>, created_at).
--
-- Idempotent: IF NOT EXISTS on every statement.

-- W38 covenant_certificate
CREATE INDEX IF NOT EXISTS idx_covenant_certificates_horizon ON oe_covenant_certificates(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_covenant_certificate_events_thread ON oe_covenant_certificate_events(certificate_id, created_at);

-- W21 drawdown
CREATE INDEX IF NOT EXISTS idx_drawdown_chain_horizon ON oe_drawdown_chain(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_drawdown_chain_events_thread ON oe_drawdown_chain_events(drawdown_id, created_at);

-- W30 disbursement_case
CREATE INDEX IF NOT EXISTS idx_disbursement_cases_horizon ON oe_disbursement_cases(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_disbursement_events_thread ON oe_disbursement_events(disbursement_id, created_at);

-- W45 loan_default
CREATE INDEX IF NOT EXISTS idx_loan_defaults_horizon ON oe_loan_defaults(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_loan_defaults_events_thread ON oe_loan_defaults_events(default_id, created_at);

-- W53 credit_facility_application
CREATE INDEX IF NOT EXISTS idx_credit_facility_applications_horizon ON oe_credit_facility_applications(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_credit_facility_applications_events_thread ON oe_credit_facility_applications_events(application_id, created_at);

-- W61 loan_transfer
CREATE INDEX IF NOT EXISTS idx_loan_transfers_horizon ON oe_loan_transfers(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_loan_transfers_events_thread ON oe_loan_transfers_events(transfer_id, created_at);

-- W69 security_perfection
CREATE INDEX IF NOT EXISTS idx_security_perfection_horizon ON oe_security_perfection(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_security_perfection_events_thread ON oe_security_perfection_events(perfection_id, created_at);

-- W29 poslimit_case
CREATE INDEX IF NOT EXISTS idx_poslimit_cases_horizon ON oe_poslimit_cases(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_poslimit_events_thread ON oe_poslimit_events(poslimit_id, created_at);

-- W36 best_execution
CREATE INDEX IF NOT EXISTS idx_best_execution_horizon ON oe_best_execution(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_best_execution_events_thread ON oe_best_execution_events(rfq_id, created_at);

-- W44 trade_report
CREATE INDEX IF NOT EXISTS idx_trade_reports_horizon ON oe_trade_reports(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_trade_reports_events_thread ON oe_trade_reports_events(report_id, created_at);

-- W52 market_abuse_case
CREATE INDEX IF NOT EXISTS idx_market_abuse_cases_horizon ON oe_market_abuse_cases(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_market_abuse_cases_events_thread ON oe_market_abuse_cases_events(case_id, created_at);

-- W60 algo_certification
CREATE INDEX IF NOT EXISTS idx_algo_certifications_horizon ON oe_algo_certifications(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_algo_certifications_events_thread ON oe_algo_certifications_events(cert_id, created_at);

-- W68 counterparty_margin
CREATE INDEX IF NOT EXISTS idx_counterparty_margin_horizon ON oe_counterparty_margin(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_counterparty_margin_events_thread ON oe_counterparty_margin_events(margin_id, created_at);

-- W76 trade_allocation
CREATE INDEX IF NOT EXISTS idx_trade_allocations_horizon ON oe_trade_allocations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_trade_allocation_events_thread ON oe_trade_allocation_events(allocation_id, created_at);

-- W19 procurement_rfp
CREATE INDEX IF NOT EXISTS idx_procurement_rfps_horizon ON oe_procurement_rfps(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_procurement_chain_events_thread ON oe_procurement_chain_events(rfp_id, created_at);

-- W20 cod_chain
CREATE INDEX IF NOT EXISTS idx_cod_chain_horizon ON oe_cod_chain(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_cod_chain_events_thread ON oe_cod_chain_events(cod_id, created_at);

-- W23 insurance_claim
CREATE INDEX IF NOT EXISTS idx_insurance_claim_chain_horizon ON oe_insurance_claim_chain(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_chain_events_thread ON oe_insurance_claim_chain_events(claim_id, created_at);

-- W27 ed_commitment
CREATE INDEX IF NOT EXISTS idx_ed_commitments_horizon ON oe_ed_commitments(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_ed_commitment_events_thread ON oe_ed_commitment_events(commitment_id, created_at);

-- W28 gca_connection
CREATE INDEX IF NOT EXISTS idx_gca_connections_horizon ON oe_gca_connections(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_gca_events_thread ON oe_gca_events(gca_id, created_at);

-- W18 planned_outage
CREATE INDEX IF NOT EXISTS idx_planned_outages_horizon ON oe_planned_outages(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_planned_outage_events_thread ON oe_planned_outage_events(outage_id, created_at);

-- W67 grid_code_compliance
CREATE INDEX IF NOT EXISTS idx_grid_code_compliance_horizon ON oe_grid_code_compliance(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_grid_code_compliance_events_thread ON oe_grid_code_compliance_events(compliance_id, created_at);

-- W75 connection_energization
CREATE INDEX IF NOT EXISTS idx_connection_energization_horizon ON oe_connection_energization(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_connection_energization_events_thread ON oe_connection_energization_events(energization_id, created_at);

-- W22 ppa_contract_chain
CREATE INDEX IF NOT EXISTS idx_ppa_contract_chain_horizon ON oe_ppa_contract_chain(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_ppa_contract_chain_events_thread ON oe_ppa_contract_chain_events(ppa_id, created_at);

-- W32 ppa_take_or_pay
CREATE INDEX IF NOT EXISTS idx_top_cases_horizon ON oe_top_cases(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_top_events_thread ON oe_top_events(top_id, created_at);

-- W39 tariff_indexation
CREATE INDEX IF NOT EXISTS idx_tariff_indexation_horizon ON oe_tariff_indexation(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_tariff_indexation_events_thread ON oe_tariff_indexation_events(indexation_id, created_at);

-- W46 curtailment_claim
CREATE INDEX IF NOT EXISTS idx_curtailment_claims_horizon ON oe_curtailment_claims(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_curtailment_claims_events_thread ON oe_curtailment_claims_events(claim_id, created_at);

-- W54 ppa_payment_security
CREATE INDEX IF NOT EXISTS idx_ppa_payment_securities_horizon ON oe_ppa_payment_securities(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_ppa_payment_securities_events_thread ON oe_ppa_payment_securities_events(security_id, created_at);

-- W62 ppa_termination
CREATE INDEX IF NOT EXISTS idx_ppa_terminations_horizon ON oe_ppa_terminations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_ppa_terminations_events_thread ON oe_ppa_terminations_events(termination_id, created_at);

-- W70 rec_lifecycle
CREATE INDEX IF NOT EXISTS idx_rec_lifecycle_horizon ON oe_rec_lifecycle(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_rec_lifecycle_events_thread ON oe_rec_lifecycle_events(rec_id, created_at);

-- W37 carbon_registration
CREATE INDEX IF NOT EXISTS idx_carbon_registration_horizon ON oe_carbon_registration(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_carbon_registration_events_thread ON oe_carbon_registration_events(project_id, created_at);

-- W42 carbon_reversal
CREATE INDEX IF NOT EXISTS idx_carbon_reversals_horizon ON oe_carbon_reversals(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_carbon_reversals_events_thread ON oe_carbon_reversals_events(reversal_id, created_at);

-- W48 carbon_offset_claim
CREATE INDEX IF NOT EXISTS idx_carbon_offset_claims_horizon ON oe_carbon_offset_claims(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_carbon_offset_claims_events_thread ON oe_carbon_offset_claims_events(claim_id, created_at);

-- W56 crediting_period_renewal
CREATE INDEX IF NOT EXISTS idx_crediting_period_renewals_horizon ON oe_crediting_period_renewals(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_crediting_period_renewals_events_thread ON oe_crediting_period_renewals_events(renewal_id, created_at);

-- W65 carbon_erpa
CREATE INDEX IF NOT EXISTS idx_carbon_erpas_horizon ON oe_carbon_erpas(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_carbon_erpas_events_thread ON oe_carbon_erpas_events(erpa_id, created_at);

-- W73 poa_cpa_inclusion
CREATE INDEX IF NOT EXISTS idx_poa_cpa_inclusions_horizon ON oe_poa_cpa_inclusions(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_poa_cpa_inclusions_events_thread ON oe_poa_cpa_inclusions_events(inclusion_id, created_at);

-- W34 load_curtailment
CREATE INDEX IF NOT EXISTS idx_load_curtailment_horizon ON oe_load_curtailment(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_load_curtailment_events_thread ON oe_load_curtailment_events(curtailment_id, created_at);

-- W50 reserve_activation
CREATE INDEX IF NOT EXISTS idx_reserve_activations_horizon ON oe_reserve_activations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_reserve_activations_events_thread ON oe_reserve_activations_events(activation_id, created_at);

-- W58 rez_capacity
CREATE INDEX IF NOT EXISTS idx_grid_capacity_allocations_horizon ON oe_grid_capacity_allocations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_grid_capacity_allocations_events_thread ON oe_grid_capacity_allocations_events(allocation_id, created_at);

-- W31 disposition
CREATE INDEX IF NOT EXISTS idx_disposition_cases_horizon ON oe_disposition_cases(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_disposition_events_thread ON oe_disposition_events(disposition_id, created_at);

-- W33 licence_renewal
CREATE INDEX IF NOT EXISTS idx_licence_renewals_horizon ON oe_licence_renewals(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_licence_renewal_events_thread ON oe_licence_renewal_events(renewal_id, created_at);

-- W40 compliance_inspection
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_horizon ON oe_compliance_inspections(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_events_thread ON oe_compliance_inspections_events(inspection_id, created_at);

-- W43 tariff_determination
CREATE INDEX IF NOT EXISTS idx_tariff_determinations_horizon ON oe_tariff_determinations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_tariff_determinations_events_thread ON oe_tariff_determinations_events(determination_id, created_at);

-- W49 licence_application
CREATE INDEX IF NOT EXISTS idx_licence_applications_horizon ON oe_licence_applications(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_licence_applications_events_thread ON oe_licence_applications_events(application_id, created_at);

-- W57 sseg_registration
CREATE INDEX IF NOT EXISTS idx_sseg_registrations_horizon ON oe_sseg_registrations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_sseg_registrations_events_thread ON oe_sseg_registrations_events(registration_id, created_at);

-- W66 complaint_resolution
CREATE INDEX IF NOT EXISTS idx_regulator_complaints_horizon ON oe_regulator_complaints(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_regulator_complaints_events_thread ON oe_regulator_complaints_events(complaint_id, created_at);

-- W74 levy_assessment
CREATE INDEX IF NOT EXISTS idx_regulator_levies_horizon ON oe_regulator_levies(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_regulator_levies_events_thread ON oe_regulator_levies_events(levy_id, created_at);

-- W41 problem_record
CREATE INDEX IF NOT EXISTS idx_problem_records_horizon ON oe_problem_records(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_problem_records_events_thread ON oe_problem_records_events(problem_id, created_at);

-- W47 change_request
CREATE INDEX IF NOT EXISTS idx_change_requests_horizon ON oe_change_requests(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_change_requests_events_thread ON oe_change_requests_events(change_id, created_at);

-- W55 security_remediation
CREATE INDEX IF NOT EXISTS idx_security_remediations_horizon ON oe_security_remediations(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_security_remediations_events_thread ON oe_security_remediations_events(remediation_id, created_at);

-- W63 warranty_recovery
CREATE INDEX IF NOT EXISTS idx_warranty_recoveries_horizon ON oe_warranty_recoveries(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_warranty_recoveries_events_thread ON oe_warranty_recoveries_events(recovery_id, created_at);

-- W72 spare_parts_provisioning
CREATE INDEX IF NOT EXISTS idx_spare_parts_provisioning_horizon ON oe_spare_parts_provisioning(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_spare_parts_provisioning_events_thread ON oe_spare_parts_provisioning_events(provisioning_id, created_at);

-- W24 pr_underperformance
CREATE INDEX IF NOT EXISTS idx_pr_chain_horizon ON oe_pr_chain(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_pr_chain_events_thread ON oe_pr_chain_events(case_id, created_at);

-- W25 hse_incident
CREATE INDEX IF NOT EXISTS idx_hse_incidents_horizon ON oe_hse_incidents(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_hse_incident_events_thread ON oe_hse_incident_events(incident_id, created_at);

-- W35 vendor_escalation
CREATE INDEX IF NOT EXISTS idx_vendor_escalation_horizon ON oe_vendor_escalation(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_vendor_escalation_events_thread ON oe_vendor_escalation_events(escalation_id, created_at);

-- W51 availability_guarantee
CREATE INDEX IF NOT EXISTS idx_availability_guarantees_horizon ON oe_availability_guarantees(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_availability_guarantee_events_thread ON oe_availability_guarantee_events(guarantee_id, created_at);

-- W59 pm_compliance
CREATE INDEX IF NOT EXISTS idx_pm_compliance_horizon ON oe_pm_compliance(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_pm_compliance_events_thread ON oe_pm_compliance_events(pm_id, created_at);

-- W64 permit_to_work
CREATE INDEX IF NOT EXISTS idx_permit_to_work_horizon ON oe_permit_to_work(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_permit_to_work_events_thread ON oe_permit_to_work_events(permit_id, created_at);

-- W99 itp
CREATE INDEX IF NOT EXISTS idx_itp_inspection_horizon ON oe_itp_inspection(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_itp_inspection_events_thread ON oe_itp_inspection_events(itp_id, created_at);

-- W98 punch_list
CREATE INDEX IF NOT EXISTS idx_punch_list_horizon ON oe_punch_list(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_punch_list_events_thread ON oe_punch_list_events(punch_id, created_at);

-- W136 ncr
CREATE INDEX IF NOT EXISTS idx_ipp_ncrs_horizon ON oe_ipp_ncrs(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_ipp_ncr_events_thread ON oe_ipp_ncr_events(ncr_id, created_at);

-- W137 ipp_method_statement
CREATE INDEX IF NOT EXISTS idx_ipp_method_statements_horizon ON oe_ipp_method_statements(chain_status, sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_ipp_ms_events_thread ON oe_ipp_ms_events(ms_id, created_at);

-- W143 ipp_construction_diary
CREATE INDEX IF NOT EXISTS idx_ipp_construction_diary_horizon ON oe_ipp_construction_diary(chain_status, sla_deadline_at);
