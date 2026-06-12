-- Migration 505: Covering indexes for oe_ chain tables.
-- Every chain table gets (participant_id, chain_status, created_at DESC) for list queries.
-- Every _events table gets (parent_id, created_at) for event joins.
-- Safe to re-run — IF NOT EXISTS on every statement.

-- ── Wave 1: IPP PM / procurement / COD ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_procurement_rfps_p ON oe_procurement_rfps(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_rfps_status ON oe_procurement_rfps(chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_procurement_chain_events_p ON oe_procurement_chain_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cod_chain_p ON oe_cod_chain(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cod_chain_events_p ON oe_cod_chain_events(parent_id, created_at);

-- ── Wave 2: Trading risk ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_poslimit_cases_p ON oe_poslimit_cases(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poslimit_events_p ON oe_poslimit_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_market_abuse_cases_p ON oe_market_abuse_cases(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_abuse_events_p ON oe_market_abuse_cases_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_algo_certifications_p ON oe_algo_certifications(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_algo_cert_events_p ON oe_algo_certifications_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_best_execution_p ON oe_best_execution(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_best_execution_events_p ON oe_best_execution_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_trade_reports_p ON oe_trade_reports(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_reports_events_p ON oe_trade_reports_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_trade_allocations_p ON oe_trade_allocations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_allocation_events_p ON oe_trade_allocation_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_counterparty_margin_p ON oe_counterparty_margin(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_counterparty_margin_events_p ON oe_counterparty_margin_events(parent_id, created_at);

-- ── Wave 3: Settlement ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_imbalance_settlement_p ON oe_imbalance_settlement(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imbalance_settlement_events_p ON oe_imbalance_settlement_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_settlement_fails_p ON oe_settlement_fails(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settlement_fails_events_p ON oe_settlement_fails_events(parent_id, created_at);

-- ── Wave 4: Carbon Article 6 ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_carbon_issuances_p ON oe_carbon_issuances(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_issuances_events_p ON oe_carbon_issuances_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_carbon_erpas_p ON oe_carbon_erpas(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_erpas_events_p ON oe_carbon_erpas_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_carbon_reversals_p ON oe_carbon_reversals(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_reversals_events_p ON oe_carbon_reversals_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_carbon_registration_p ON oe_carbon_registration(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_registration_events_p ON oe_carbon_registration_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_carbon_offset_claims_p ON oe_carbon_offset_claims(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_offset_claims_events_p ON oe_carbon_offset_claims_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ccp_assessments_p ON oe_ccp_assessments(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccp_assessments_events_p ON oe_ccp_assessments_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_carbon_credit_rating_p ON oe_carbon_credit_rating(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carbon_credit_rating_events_p ON oe_carbon_credit_rating_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_crediting_period_renewals_p ON oe_crediting_period_renewals(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crediting_period_renewals_events_p ON oe_crediting_period_renewals_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_poa_cpa_inclusions_p ON oe_poa_cpa_inclusions(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_poa_cpa_inclusions_events_p ON oe_poa_cpa_inclusions_events(parent_id, created_at);

-- ── Wave 5: Regulator ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_p ON oe_compliance_inspections(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_inspections_events_p ON oe_compliance_inspections_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_disposition_cases_p ON oe_disposition_cases(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disposition_events_p ON oe_disposition_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tariff_determinations_p ON oe_tariff_determinations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tariff_determinations_events_p ON oe_tariff_determinations_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_licence_applications_p ON oe_licence_applications(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licence_applications_events_p ON oe_licence_applications_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_licence_renewals_p ON oe_licence_renewals(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_licence_renewal_events_p ON oe_licence_renewal_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_regulator_complaints_p ON oe_regulator_complaints(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulator_complaints_events_p ON oe_regulator_complaints_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_regulator_levies_p ON oe_regulator_levies(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulator_levies_events_p ON oe_regulator_levies_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_sseg_registrations_p ON oe_sseg_registrations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sseg_registrations_events_p ON oe_sseg_registrations_events(parent_id, created_at);

-- ── Wave 6: Lender ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_drawdown_chain_p ON oe_drawdown_chain(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawdown_chain_events_p ON oe_drawdown_chain_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_covenant_certificates_p ON oe_covenant_certificates(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_covenant_certificate_events_p ON oe_covenant_certificate_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_lender_watchlist_p ON oe_lender_watchlist(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lender_watchlist_events_p ON oe_lender_watchlist_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_disbursement_cases_p ON oe_disbursement_cases(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disbursement_events_p ON oe_disbursement_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_loan_defaults_p ON oe_loan_defaults(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_defaults_events_p ON oe_loan_defaults_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_loan_transfers_p ON oe_loan_transfers(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_transfers_events_p ON oe_loan_transfers_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_credit_facility_applications_p ON oe_credit_facility_applications(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_facility_applications_events_p ON oe_credit_facility_applications_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_security_perfection_p ON oe_security_perfection(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_perfection_events_p ON oe_security_perfection_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_dscr_monitoring_p ON oe_dscr_monitoring(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dscr_monitoring_events_p ON oe_dscr_monitoring_events(parent_id, created_at);

-- ── Wave 7: Offtaker ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ppa_contract_chain_p ON oe_ppa_contract_chain(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppa_contract_chain_events_p ON oe_ppa_contract_chain_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_tariff_indexation_p ON oe_tariff_indexation(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tariff_indexation_events_p ON oe_tariff_indexation_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_curtailment_claims_p ON oe_curtailment_claims(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curtailment_claims_events_p ON oe_curtailment_claims_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ppa_terminations_p ON oe_ppa_terminations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppa_terminations_events_p ON oe_ppa_terminations_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ppa_payment_securities_p ON oe_ppa_payment_securities(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppa_payment_securities_events_p ON oe_ppa_payment_securities_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_rec_lifecycle_p ON oe_rec_lifecycle(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_lifecycle_events_p ON oe_rec_lifecycle_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ppa_annual_recon_p ON oe_ppa_annual_recon(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppa_annual_recon_events_p ON oe_ppa_annual_recon_events(parent_id, created_at);

-- ── Wave 8: Grid ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dispatch_nominations_p ON oe_dispatch_nominations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_nomination_events_p ON oe_dispatch_nomination_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_load_curtailment_p ON oe_load_curtailment(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_load_curtailment_events_p ON oe_load_curtailment_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_grid_wheeling_charges_p ON oe_grid_wheeling_charges(participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grid_capacity_allocations_p ON oe_grid_capacity_allocations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grid_capacity_allocations_events_p ON oe_grid_capacity_allocations_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_reserve_activations_p ON oe_reserve_activations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reserve_activations_events_p ON oe_reserve_activations_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_grid_code_compliance_p ON oe_grid_code_compliance(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grid_code_compliance_events_p ON oe_grid_code_compliance_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_connection_energization_p ON oe_connection_energization(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_energization_events_p ON oe_connection_energization_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_gca_connections_p ON oe_gca_connections(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gca_events_p ON oe_gca_events(parent_id, created_at);

-- ── Wave 10: IPP bond / insurance ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_insurance_claim_chain_p ON oe_insurance_claim_chain(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_chain_events_p ON oe_insurance_claim_chain_events(parent_id, created_at);

-- ── Wave 11: Carbon MRV ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mrv_chain_events_p ON oe_mrv_chain_events(parent_id, created_at);

-- ── Wave 12: Site commissioning ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_site_commissioning_events_p ON oe_site_commissioning_events(parent_id, created_at);

-- ── Wave 14: Support tickets ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_ticket_events_p ON oe_support_ticket_events(parent_id, created_at);

-- ── Wave 15: Warranty / RMA ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_warranty_claims_p ON oe_warranty_claims(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_claim_events_p ON oe_warranty_claim_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_warranty_recoveries_p ON oe_warranty_recoveries(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_recoveries_events_p ON oe_warranty_recoveries_events(parent_id, created_at);

-- ── Wave 16: Work orders ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_service_contracts_p ON oe_service_contracts(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_contract_events_p ON oe_service_contract_events(parent_id, created_at);

-- ── Wave 18: Planned outages ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_planned_outages_p ON oe_planned_outages(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planned_outage_events_p ON oe_planned_outage_events(parent_id, created_at);

-- ── Wave 25/26: HSE / Cyber incidents ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_hse_incidents_p ON oe_hse_incidents(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hse_incident_events_p ON oe_hse_incident_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cyber_incidents_p ON oe_cyber_incidents(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cyber_incident_events_p ON oe_cyber_incident_events(parent_id, created_at);

-- ── Wave 27: ED commitments ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ed_commitments_p ON oe_ed_commitments(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ed_commitment_events_p ON oe_ed_commitment_events(parent_id, created_at);

-- ── Wave 35: Vendor escalation ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendor_escalation_p ON oe_vendor_escalation(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_escalation_events_p ON oe_vendor_escalation_events(parent_id, created_at);

-- ── Wave 40: Enforcement ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enforcement_actions_p ON oe_enforcement_actions(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enforcement_actions_events_p ON oe_enforcement_actions_events(parent_id, created_at);

-- ── Wave 41/47: Problem / Change management ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_problem_records_p ON oe_problem_records(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_problem_records_events_p ON oe_problem_records_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_change_requests_p ON oe_change_requests(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_requests_events_p ON oe_change_requests_events(parent_id, created_at);

-- ── Wave 51: Availability guarantees ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_availability_guarantees_p ON oe_availability_guarantees(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_guarantee_events_p ON oe_availability_guarantee_events(parent_id, created_at);

-- ── Wave 55: Security remediations ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_security_remediations_p ON oe_security_remediations(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_remediations_events_p ON oe_security_remediations_events(parent_id, created_at);

-- ── Wave 59: PM compliance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pm_compliance_p ON oe_pm_compliance(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_compliance_events_p ON oe_pm_compliance_events(parent_id, created_at);

-- ── Wave 64: Permit to work ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_permit_to_work_p ON oe_permit_to_work(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permit_to_work_events_p ON oe_permit_to_work_events(parent_id, created_at);

-- ── Wave 71: Asset prognostics ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_asset_prognostics_p ON oe_asset_prognostics(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_prognostics_events_p ON oe_asset_prognostics_events(parent_id, created_at);

-- ── Wave 72: Spare parts ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_spare_parts_provisioning_p ON oe_spare_parts_provisioning(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spare_parts_provisioning_events_p ON oe_spare_parts_provisioning_events(parent_id, created_at);

-- ── Wave 24: PR chain ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pr_chain_p ON oe_pr_chain(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pr_chain_events_p ON oe_pr_chain_events(parent_id, created_at);

-- ── ESG disclosure ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_esg_disclosure_p ON oe_esg_disclosure(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_esg_disclosure_events_p ON oe_esg_disclosure_events(parent_id, created_at);

-- ── Audit chain ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_chain_block_p ON oe_audit_chain_block(participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_chain_block_events_p ON oe_audit_chain_block_events(parent_id, created_at);

-- ── Benchmark transition ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_benchmark_transitions_p ON oe_benchmark_transitions(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_benchmark_transition_events_p ON oe_benchmark_transition_events(parent_id, created_at);

-- ── Black start ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_black_start_capabilities_p ON oe_black_start_capabilities(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_black_start_capabilities_events_p ON oe_black_start_capabilities_events(parent_id, created_at);

-- ── Reconciliation attestation ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reconciliation_attestation_p ON oe_reconciliation_attestation(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_attestation_events_p ON oe_reconciliation_attestation_events(parent_id, created_at);

-- ── Control environment audit ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_control_environment_audit_p ON oe_control_environment_audit(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_control_environment_audit_events_p ON oe_control_environment_audit_events(parent_id, created_at);

-- ── IPP schedule / stage gates ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ipp_schedule_p ON oe_ipp_schedule(participant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ipp_schedule_events_p ON oe_ipp_schedule_events(parent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_stage_gates_p ON oe_stage_gates(participant_id, chain_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_gate_events_p ON oe_stage_gate_events(parent_id, created_at);

-- ── Platform events feed ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_platform_events_target ON oe_platform_events(target_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_entity ON oe_platform_events(entity_type, entity_id, created_at DESC);
