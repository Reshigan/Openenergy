-- ═══════════════════════════════════════════════════════════════════════
-- 499_seed_all_remaining_chains.sql
-- Demo seed: one sample row per remaining chain table across all roles
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- 499 — Seed all remaining chain tables so every workstation tab shows data
-- instead of an empty state.  INSERT OR IGNORE throughout — safe to re-run.

-- ══════════════════════════════════════════════════════════════════════════════
-- TRADER ROLE (demo_trader_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W60 oe_algo_certifications — deployed algo
INSERT OR IGNORE INTO oe_algo_certifications (
  id, case_number,
  firm_party_id, firm_party_name,
  authority_party_id, authority_party_name,
  system_code, system_name, system_type, strategy_class, asset_classes, venue,
  authorised_notional_zar_m, max_order_value_zar, max_message_rate_per_sec,
  algo_tier,
  kill_switch_present, price_collars_present, throttles_present,
  max_order_size_present, conformance_test_passed, controls_validated,
  registration_ref, certification_ref, deployment_ref,
  documentation_basis, certification_basis,
  chain_status,
  registration_submitted_at, documentation_review_at, conformance_testing_at,
  risk_controls_validation_at, certification_review_at, certified_at, deployed_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_algo_cert_001', 'ACO-2026-0001',
  'demo_trader_001', 'OE Prop Trading Desk',
  'demo_admin_001', 'JSE Market Operations',
  'ALGO-MM-ENERGY-01', 'Energy Market-Making System v3.2', 'market_maker', 'mm',
  'power,carbon', 'JSE Energy Market',
  45.0, 5000000.0, 50.0,
  'standard',
  1, 1, 1, 1, 1, 1,
  'REG-2026-ACO-001', 'CERT-2026-ACO-001', 'DEPLOY-2026-ACO-001',
  'Full algorithm documentation submitted per FMA RTS-6 analogue requirements.',
  'All pre-trade risk controls validated; kill-switch tested and confirmed operable.',
  'deployed',
  '2026-01-15T08:00:00Z', '2026-01-22T09:00:00Z', '2026-02-05T10:00:00Z',
  '2026-02-19T11:00:00Z', '2026-03-04T12:00:00Z', '2026-03-18T14:00:00Z', '2026-04-01T08:00:00Z',
  0, 0,
  'demo_admin_001', '2026-01-15T08:00:00Z', '2026-04-01T08:00:00Z'
);

-- W29 oe_poslimit_cases — cured position-limit breach
INSERT OR IGNORE INTO oe_poslimit_cases (
  id, case_number,
  trader_party, trader_user_id, trader_tier,
  fsca_license_ref, instrument, instrument_class, tenor,
  cap_mw, position_mw, utilisation_pct, cap_zar,
  jse_srl_ref, fsca_ref,
  reason_code, rod_notes, regulator_authority,
  chain_status,
  detected_at, warning_at, soft_breach_at,
  cured_at,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_poslimit_001', 'PL-2026-0001',
  'OE Prop Trading Desk', 'demo_trader_001', 'prop',
  'FSCA-CATIIA-2024-0047', 'ENERGY_FWD_2026Q4_BL', 'energy_fwd', '2026Q4',
  500.0, 412.0, 82.4, 5000000000.0,
  'JSE-DTA-2026-1204', 'FSCA-S41-2026-0089',
  'pos_growth', 'Position grew due to hedging requirement; full cure achieved by EOD.',
  'FSCA',
  'cured',
  '2026-05-02T09:00:00Z', '2026-05-02T09:15:00Z', '2026-05-02T10:30:00Z',
  '2026-05-02T16:45:00Z',
  '2026-05-09T09:00:00Z', 0,
  'demo_trader_001', '2026-05-02T09:00:00Z', '2026-05-02T16:45:00Z'
);

-- W52 oe_market_abuse_cases — cleared false-positive
INSERT OR IGNORE INTO oe_market_abuse_cases (
  id, case_number,
  subject_party_id, subject_party_name,
  surveillance_party_id, surveillance_party_name,
  abuse_tier, typology, alert_source, instrument, energy_type, product, venue,
  risk_score, suspect_volume_mwh, suspect_value_zar_m,
  triage_ref, analysis_ref,
  triage_basis, analysis_basis, resolution_notes,
  chain_status,
  alert_raised_at, triaged_at, under_investigation_at, evidence_review_at,
  analysis_complete_at, cleared_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_market_abuse_001', 'MAC-2026-0001',
  'demo_trader_001', 'OE Prop Trading Desk',
  'demo_admin_001', 'JSE Market Surveillance',
  'low_risk', 'spoofing', 'automated_surveillance',
  'ENERGY_FWD_2026Q3_BL', 'power', 'forward', 'order_book',
  28.5, 450.0, 12.6,
  'TRIAGE-MAC-2026-0001', 'ANALYSIS-MAC-2026-0001',
  'Automated system flagged unusual order pattern; manual review initiated.',
  'Pattern consistent with legitimate market-making activity; no evidence of manipulative intent.',
  'Alert cleared as false-positive. Order pattern explained by hedging of physical exposure.',
  'cleared',
  '2026-04-15T11:00:00Z', '2026-04-15T14:00:00Z', '2026-04-16T09:00:00Z', '2026-04-17T10:00:00Z',
  '2026-04-18T16:00:00Z', '2026-04-19T09:00:00Z',
  0, 0,
  'demo_admin_001', '2026-04-15T11:00:00Z', '2026-04-19T09:00:00Z'
);

-- W76 oe_trade_allocations — settled block allocation
INSERT OR IGNORE INTO oe_trade_allocations (
  id, allocation_number,
  executing_party, clearing_party, counterparty_name, block_account,
  instrument, energy_type, side, quantity, price, notional_zar, allocation_legs,
  notional_tier,
  settlement_date, ssi_ref, csd_ref,
  allocation_ref, confirmation_ref, affirmation_ref, match_ref,
  settlement_instruction_ref,
  allocation_basis, confirmation_basis, settlement_basis,
  chain_status,
  executed_at, allocation_pending_at, allocated_at,
  confirmation_issued_at, affirmed_at, matched_at, settlement_instructed_at, settled_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_trade_alloc_001', 'ALLOC-2026-0001',
  'OE Prop Trading Desk', 'JSE Equities Clearing', 'Coronation Fund Managers', 'BLOCK-OE-001',
  'energy_forward', 'power', 'buy', 2000.0, 1850.0, 3700000.0, 4,
  'medium',
  '2026-05-28T00:00:00Z', 'SSI-OE-COR-001', 'CSD-2026-ALLOC-001',
  'ALLOC-REF-2026-001', 'CONF-2026-ALLOC-001', 'AFF-2026-ALLOC-001', 'MATCH-2026-ALLOC-001',
  'SETTLE-INST-2026-001',
  'Block trade allocated across 4 client sub-accounts per standing instructions.',
  'Confirmation issued to counterparty same day; all terms agreed.',
  'Trade settled at CSD on T+2; all legs completed.',
  'settled',
  '2026-05-26T09:15:00Z', '2026-05-26T09:20:00Z', '2026-05-26T10:00:00Z',
  '2026-05-26T11:30:00Z', '2026-05-26T13:45:00Z', '2026-05-26T15:00:00Z', '2026-05-26T16:00:00Z', '2026-05-28T14:00:00Z',
  0, 0,
  'demo_trader_001', '2026-05-26T09:15:00Z', '2026-05-28T14:00:00Z'
);

-- W44 oe_trade_reports — confirmed complete
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name,
  trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei,
  energy_type, product, report_class, side,
  trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh,
  submission_ref, acknowledgement_ref, reconciliation_ref,
  submission_basis, reconciliation_basis,
  chain_status,
  report_due_at, report_generated_at, submitted_to_tr_at, tr_acknowledged_at,
  reconciled_at, confirmed_complete_at,
  is_reportable, resubmission_count, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_trade_report_499_001', 'RPT-499-2026-0001',
  'demo_trader_001', 'OE Prop Trading Desk',
  'JSE Trade Repository',
  'UTI-ZA-OE-499-0001', 'TRADE-OE-499-0001', 'Eskom Trading', '7245L8VKIDXBDZU38V82',
  'power', 'forward', 'otc_derivative', 'sell',
  '2026-05-27T00:00:00Z', '2026-08-31T00:00:00Z', '2026-05-28T17:00:00Z',
  18.5, 10000.0, 1850.0,
  'TR-SUB-499-0001', 'TR-ACK-499-0001', 'TR-RECON-499-0001',
  'OTC derivative forward submitted to JSE Trade Repository per FMA reporting obligations.',
  'Dual-sided reconciliation completed; both sides confirm matching trade economics.',
  'confirmed_complete',
  '2026-05-28T00:00:00Z', '2026-05-27T17:00:00Z', '2026-05-28T08:00:00Z', '2026-05-28T09:30:00Z',
  '2026-05-29T11:00:00Z', '2026-05-30T09:00:00Z',
  0, 0, 0,
  'demo_trader_001', '2026-05-27T17:00:00Z', '2026-05-30T09:00:00Z'
);

-- W68 oe_counterparty_margin — limit_active
INSERT OR IGNORE INTO oe_counterparty_margin (
  id, case_number,
  counterparty_id, counterparty_name, member_code, account_type, systemically_important,
  product_class, exposure_zar, collateral_held_zar,
  utilisation_pct, severity_tier,
  clearing_party_id, clearing_party_name,
  chain_status,
  limit_active_at,
  cure_round, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_cp_margin_001', 'CCM-2026-0001',
  'demo_trader_001', 'OE Prop Trading Desk', 'MEM-OE-001', 'house', 0,
  'power_forward', 42000000.0, 55000000.0,
  76.4, 'material',
  'demo_admin_001', 'JSE Clearing House',
  'limit_active',
  '2026-01-02T08:00:00Z',
  0, 0, 0,
  'demo_admin_001', '2026-01-02T08:00:00Z', '2026-06-06T08:00:00Z'
);

-- W201 oe_fsca_compliance_reports — filed
INSERT OR IGNORE INTO oe_fsca_compliance_reports (
  id, participant_id, fsp_licence_number, fsp_class,
  report_year, reporting_period_start, reporting_period_end,
  chain_status,
  compliance_officer_id, compliance_officer_name, co_signed_at,
  fsca_reference, submitted_at, filed_at,
  sla_deadline,
  actor_id, created_at, updated_at
) VALUES (
  'seed_fsca_report_001', 'demo_trader_001', 'FSCA-FSP-2024-0089', 'standard',
  2025, '2025-01-01T00:00:00Z', '2025-12-31T00:00:00Z',
  'filed',
  'demo_admin_001', 'Janet Dlamini (Compliance Officer)', '2026-02-25T09:00:00Z',
  'FSCA-ACR-2026-0045', '2026-02-28T10:00:00Z', '2026-03-05T14:00:00Z',
  '2026-03-31T23:59:59Z',
  'demo_trader_001', '2026-02-01T08:00:00Z', '2026-03-05T14:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- IPP ROLE (demo_ipp_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W19 oe_procurement_rfps — published
INSERT OR IGNORE INTO oe_procurement_rfps (
  id, rfp_number, project_id, participant_id,
  title, description, category, capex_tier, capex_estimate_zar, currency,
  chain_status,
  start_at, bid_open_at, bid_close_at, delivery_due_at,
  evaluation_notes,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_rfp_499_001', 'RFP-499-2026-0001', 'seed_proj_001', 'demo_ipp_001',
  'EPC Contract — Goldrush Solar PV 100MW Phase 2',
  'Engineering, Procurement and Construction contract for 100MW ground-mounted solar PV facility in Northern Cape.',
  'epc', 'high', 850000000.0, 'ZAR',
  'published',
  '2026-03-01T08:00:00Z', '2026-03-15T08:00:00Z', '2026-05-15T17:00:00Z', '2026-12-31T00:00:00Z',
  'Three qualified EPC contractors submitted bids; evaluation in progress.',
  '2026-06-30T23:59:59Z', 0,
  'demo_ipp_001', '2026-02-15T08:00:00Z', '2026-03-01T08:00:00Z'
);

-- W28 oe_gca_connections — executed
INSERT OR IGNORE INTO oe_gca_connections (
  id, case_number, project_id, project_name,
  ipp_party, network_party, connection_tier, voltage_kv,
  poc_substation, capacity_mw, technology,
  gia_ref, cost_estimate_zar, cost_accepted_zar,
  ungca_ref, energisation_date_planned,
  regulator_authority, regulator_ref,
  chain_status,
  application_filed_at, studies_required_at, studies_executing_at,
  cost_estimate_issued_at, cost_accepted_at,
  connection_agreement_drafted_at, executed_at,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_gca_499_001', 'GCA-TX-2026-0099', 'seed_proj_001', 'Goldrush Solar 100MW Phase 2',
  'demo_ipp_001', 'Eskom_Transmission', 'transmission', 132.0,
  'De Aar MTS', 100.0, 'solar_pv',
  'GIA-ESK-2026-0099', 620000000.0, 618000000.0,
  'UNGCA-ESK-2026-0099', '2027-06-30T00:00:00Z',
  'NERSA', 'NERSA-C1-2026-0099',
  'executed',
  '2025-06-15T08:00:00Z', '2025-07-01T09:00:00Z', '2025-08-15T10:00:00Z',
  '2025-10-20T11:00:00Z', '2025-11-15T12:00:00Z',
  '2026-01-10T13:00:00Z', '2026-02-20T14:00:00Z',
  '2026-08-15T23:59:59Z', 0,
  'demo_ipp_001', '2025-06-15T08:00:00Z', '2026-02-20T14:00:00Z'
);

-- W23 oe_insurance_claim_chain — settled
INSERT OR IGNORE INTO oe_insurance_claim_chain (
  id, claim_number, project_id,
  participant_id, insurer_name, policy_number,
  cover_type, incident_type, incident_date,
  asset_description, claim_value_zar, claim_value_tier,
  agreed_value_zar, settled_value_zar, excess_zar,
  loss_adjuster_name, loss_adjuster_ref,
  chain_status,
  notified_at, assessing_at, adjuster_assigned_at,
  quantum_proposed_at, quantum_agreed_at, settled_at, closed_at,
  claim_notes,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_ins_claim_001', 'CLM-2026-0001', 'seed_proj_001',
  'demo_ipp_001', 'Old Mutual Insure', 'OMI-REIPP-2024-0047',
  'pd_bi', 'lightning', '2026-03-12T14:30:00Z',
  'Inverter string combiner boxes and DC cabling — Block C, 12 strings', 4800000.0, 'minor',
  4650000.0, 4650000.0, 150000.0,
  'Crawford & Company', 'CRAWFORD-2026-0089',
  'settled',
  '2026-03-13T08:00:00Z', '2026-03-15T09:00:00Z', '2026-03-18T10:00:00Z',
  '2026-04-02T14:00:00Z', '2026-04-10T16:00:00Z', '2026-05-05T10:00:00Z', '2026-05-10T09:00:00Z',
  'Lightning strike caused damage to 12 inverter string combiner boxes. Claim settled in full less policy excess.',
  '2026-06-12T23:59:59Z', 0,
  'demo_ipp_001', '2026-03-13T08:00:00Z', '2026-05-10T09:00:00Z'
);

-- W179 oe_ipp_perf_securities — security_confirmed
INSERT OR IGNORE INTO oe_ipp_perf_securities (
  id, project_ref, bond_reference, bond_quantum_zar, bond_tier,
  security_type, expiry_date, issuing_bank, beneficiary,
  chain_status,
  sla_due_date, sla_breached, is_reportable,
  actor_party, reason, notes,
  created_at, updated_at
) VALUES (
  'seed_perf_sec_499_001', 'seed_proj_001', 'ABSA-PB-2026-0099', 52000000.0, 'medium',
  'performance_bond', '2029-12-31T00:00:00Z', 'ABSA Bank Ltd', 'DMRE IPP Office',
  'security_confirmed',
  '2026-07-31T23:59:59Z', 0, 0,
  'p_ipp_dev_001', NULL, 'Performance bond issued and confirmed by DMRE; condition precedent satisfied.',
  '2026-01-15T08:00:00Z', '2026-04-20T14:00:00Z'
);

-- W207 oe_milestone_variance_reports — dfi_accepted
INSERT OR IGNORE INTO oe_milestone_variance_reports (
  id, participant_id, project_id, report_period, reporting_date, risk_tier,
  total_milestones, milestones_on_track, milestones_delayed, milestones_critical,
  overall_schedule_variance_days, critical_path_float_days,
  cod_forecast_date, original_cod_date,
  ie_firm_name, ie_report_ref, ie_certified_at,
  dfi_submission_ref, dfi_accepted_at,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id,
  created_at, updated_at
) VALUES (
  'seed_mvr_001', 'demo_ipp_001', 'seed_proj_001', '2026-Q1', '2026-04-15T00:00:00Z', 'minor',
  28, 24, 4, 0,
  -12, 22,
  '2027-09-30T00:00:00Z', '2027-09-15T00:00:00Z',
  'SRK Consulting', 'SRK-MVR-2026-Q1-001', '2026-04-10T14:00:00Z',
  'DFI-MVR-2026-Q1-001', '2026-04-20T10:00:00Z',
  'dfi_accepted',
  '2026-04-30T23:59:59Z', 0, 0,
  'demo_ipp_001',
  '2026-04-01T08:00:00Z', '2026-04-20T10:00:00Z'
);

-- W173 oe_ipp_force_majeure — fm_resolved
INSERT OR IGNORE INTO oe_ipp_force_majeure (
  id, participant_id, project_id, fm_category, relief_type,
  estimated_relief_zar, fm_severity_tier, counterparty_name, ie_firm_name,
  chain_status, sla_due_at, sla_breached,
  fm_notice_issued_at, ie_report_issued_at, fm_resolved_at,
  created_at, updated_at
) VALUES (
  'seed_fm_499_001', 'demo_ipp_001', 'seed_proj_001',
  'grid_unavailability', 'time_extension',
  0.0, 'moderate', 'Eskom Transmission', 'WSP Africa',
  'fm_resolved', '2026-05-01T23:59:59Z', 0,
  '2026-02-10T09:00:00Z', '2026-03-01T14:00:00Z', '2026-04-15T10:00:00Z',
  '2026-02-05T08:00:00Z', '2026-04-15T10:00:00Z'
);

-- W27 oe_ed_commitments — verified_compliant
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit,
  reporting_period, current_value, variance_pct, variance_threshold_pct,
  regulator_authority,
  chain_status,
  baseline_locked_at, monitoring_at, verified_compliant_at,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_ed_commit_001', 'EDC-499-2026-0001', 'seed_proj_001', 'Goldrush Solar 100MW Phase 2', 'BW6',
  'local_content', 'Local content percentage', 40.0, 'percent',
  '2026-Q1', 43.2, 8.0, -5.0,
  'IPPO',
  'verified_compliant',
  '2025-07-01T08:00:00Z', '2026-01-15T09:00:00Z', '2026-04-20T14:00:00Z',
  '2026-06-30T23:59:59Z', 0,
  'demo_ipp_001', '2025-07-01T08:00:00Z', '2026-04-20T14:00:00Z'
);

-- W75 oe_connection_energization — compliance_testing
INSERT OR IGNORE INTO oe_connection_energization (
  id, energization_number,
  gca_ref,
  facility_id, facility_name, connection_point, network_operator,
  technology, connection_capacity_mw, voltage_kv, connection_tier,
  program_ref, inspection_ref, energization_ref, synchronization_ref,
  chain_status,
  connection_ready_at, program_review_at, program_approved_at,
  pre_energization_inspection_at, energization_authorized_at,
  cold_commissioning_at, synchronized_at, trial_operation_at, compliance_testing_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_energization_001', 'CEN-499-2026-0001',
  'seed_gca_499_001',
  'seed_proj_001', 'Goldrush Solar 100MW Phase 2', 'De Aar MTS 132kV Busbar', 'Eskom Transmission',
  'solar_pv', 100.0, 132.0, 'transmission',
  'PROG-CEN-2026-0001', 'INSP-CEN-2026-0001', 'ENRG-CEN-2026-0001', 'SYNC-CEN-2026-0001',
  'compliance_testing',
  '2027-01-15T08:00:00Z', '2027-01-20T09:00:00Z', '2027-01-28T10:00:00Z',
  '2027-02-10T11:00:00Z', '2027-02-18T08:00:00Z',
  '2027-02-25T06:00:00Z', '2027-03-05T10:00:00Z', '2027-03-10T08:00:00Z', '2027-04-01T08:00:00Z',
  0, 0,
  'demo_ipp_001', '2027-01-15T08:00:00Z', '2027-04-01T08:00:00Z'
);

-- W224 oe_gtia — gtia_executed
INSERT OR IGNORE INTO oe_gtia (
  id, participant_id,
  gtia_tier, project_ref, gca_ref,
  installed_capacity_mw, connection_voltage_kv, connection_type, network_operator_name,
  protection_relay_type, scada_protocol,
  queries_raised_at, queries_responded_at, ipp_approved_at,
  so_review_commenced_at, protection_agreed_at, scada_agreed_at, gtia_executed_at,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_gtia_001', 'demo_ipp_001',
  'large', 'seed_proj_001', 'seed_gca_499_001',
  100.0, 132.0, 'transmission', 'Eskom Transmission SOC Ltd',
  'SEL-351A', 'iec61850',
  '2026-03-05T09:00:00Z', '2026-03-20T14:00:00Z', '2026-04-02T10:00:00Z',
  '2026-04-10T09:00:00Z', '2026-05-05T14:00:00Z', '2026-05-20T11:00:00Z', '2026-06-01T10:00:00Z',
  'gtia_executed',
  '2026-07-01T23:59:59Z', 0, 0,
  'demo_ipp_001', '2026-02-15T08:00:00Z', '2026-06-01T10:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- OFFTAKER ROLE (demo_offtaker_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W46 oe_curtailment_claims — compensation_settled
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name,
  buyer_party_name,
  facility_name, facility_tier,
  contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours,
  deemed_energy_mwh, claimed_amount, proposed_amount, agreed_amount, settled_amount,
  log_ref, validation_ref, quantum_ref, settlement_ref,
  log_basis, validation_basis, quantum_basis, settlement_basis,
  chain_status,
  curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at,
  validation_underway_at, quantum_proposed_at, quantum_agreed_at, compensation_settled_at,
  dispute_round, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_curtailment_001', 'CC-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar 100MW',
  'demo_offtaker_001',
  'Goldrush Solar 100MW', 'utility_scale',
  100.0, 1020.0,
  'grid_constraint', 'Eskom transmission constraint N-1 event', 6.5,
  650.0, 663000.0, 655000.0, 655000.0, 655000.0,
  'LOG-CC-499-0001', 'VAL-CC-499-0001', 'QNT-CC-499-0001', 'STL-CC-499-0001',
  'Curtailment instruction issued by SO at 09:30; plant available and ready to generate.',
  'Deemed energy calculation validated against SCADA availability data; MWh confirmed.',
  'Quantum agreed at ZAR 655,000 per PPA deemed-energy formula.',
  'Compensation payment processed by offtaker on payment due date.',
  'compensation_settled',
  '2026-05-10T09:30:00Z', '2026-05-11T10:00:00Z', '2026-05-14T09:00:00Z', '2026-05-15T10:00:00Z',
  '2026-05-17T11:00:00Z', '2026-05-22T14:00:00Z', '2026-05-26T10:00:00Z', '2026-06-01T14:00:00Z',
  0, 0,
  'demo_ipp_001', '2026-05-10T09:30:00Z', '2026-06-01T14:00:00Z'
);

-- W39 oe_tariff_indexation — applied
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name,
  offtaker_party_id, offtaker_party_name,
  project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period,
  index_value, escalation_factor, proposed_tariff_zar_mwh,
  agreed_tariff_zar_mwh, annual_contract_value_zar,
  index_ref, notice_ref,
  calculation_basis, notice_basis,
  chain_status,
  indexation_due_at, index_published_at, escalation_calculated_at,
  notice_issued_at, under_review_at, tariff_agreed_at, applied_at,
  dispute_round, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_tariff_idx_001', 'TI-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar 100MW',
  'demo_offtaker_001', 'Eskom Holdings',
  'Goldrush Solar 100MW', 'utility_scale', 3,
  980.0, 'CPI', '2026-03 vs 2025-03',
  4.1, 1.041, 1020.18,
  1020.0, 1061280000.0,
  'STATSSA-CPI-2026-03', 'NOTICE-TI-499-0001',
  'CPI escalation applied per PPA clause 12.3; base tariff R980/MWh x 1.041 = R1020/MWh.',
  'Notice served to offtaker 30 days before application date per PPA terms.',
  'applied',
  '2026-04-01T00:00:00Z', '2026-04-17T00:00:00Z', '2026-04-20T10:00:00Z',
  '2026-05-01T09:00:00Z', '2026-05-08T10:00:00Z', '2026-05-15T14:00:00Z', '2026-06-01T00:00:00Z',
  0, 0,
  'demo_ipp_001', '2026-04-01T00:00:00Z', '2026-06-01T00:00:00Z'
);

-- W54 oe_ppa_payment_securities — active LC
INSERT OR IGNORE INTO oe_ppa_payment_securities (
  id, security_number,
  offtaker_party_id, offtaker_party_name, seller_party_name, agent_name,
  security_tier, instrument_name, instrument_type, issuer_name, issuer_rating,
  secured_amount_zar_m, required_amount_zar_m, cover_months,
  project_id, project_name, sector,
  expiry_date,
  drawdown_count,
  submission_ref, verification_ref, activation_ref,
  submission_basis, verification_basis, activation_basis,
  chain_status,
  security_required_at, instrument_submitted_at, under_verification_at, active_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_ppa_paysec_001', 'PPS-499-2026-0001',
  'demo_offtaker_001', 'Eskom Holdings', 'Goldrush Solar 100MW', 'Standard Bank',
  'material', 'Standby Letter of Credit', 'letter_of_credit', 'Standard Bank SA', 'BB+',
  72.0, 68.0, 3.0,
  'seed_proj_001', 'Goldrush Solar 100MW', 'solar_pv',
  '2028-12-31T00:00:00Z',
  0,
  'SBLC-SUB-499-0001', 'SBLC-VER-499-0001', 'SBLC-ACT-499-0001',
  'Standby LC submitted per PPA bankability requirements; covers 3 months of contracted revenue.',
  'LC verified as compliant; issuer rating and terms acceptable to lender and seller.',
  'LC activated and available to draw per PPA payment security clause.',
  'active',
  '2026-01-10T08:00:00Z', '2026-01-20T10:00:00Z', '2026-02-01T09:00:00Z', '2026-02-15T14:00:00Z',
  0, 0,
  'demo_offtaker_001', '2026-01-10T08:00:00Z', '2026-02-15T14:00:00Z'
);

-- W62 oe_ppa_terminations — termination_triggered (early state only)
INSERT OR IGNORE INTO oe_ppa_terminations (
  id, case_number,
  offtaker_party_id, offtaker_party_name,
  seller_party_id, seller_party_name,
  ppa_name, plant_name, technology,
  ppa_currency, ppa_capacity_mw, remaining_term_months,
  termination_cause, eta_basis,
  buyout_zar_m, termination_tier,
  chain_status,
  termination_triggered_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_ppa_term_001', 'PTER-499-2026-0001',
  'demo_offtaker_001', 'Eskom Holdings',
  'demo_ipp_001', 'Goldrush Solar 100MW',
  'Goldrush C&I Solar PPA', 'Goldrush Site 3 Solar', 'solar_pv',
  'ZAR', 5.0, 48,
  'no_fault', 'debt_only',
  85.0, 'material',
  'termination_triggered',
  '2026-06-01T09:00:00Z',
  0, 0,
  'demo_offtaker_001', '2026-06-01T09:00:00Z', '2026-06-01T09:00:00Z'
);

-- W70 oe_rec_lifecycle — retired
INSERT OR IGNORE INTO oe_rec_lifecycle (
  id, case_number,
  generator_id, generator_name, project_id, project_name,
  offtaker_id, offtaker_name,
  certificate_standard, energy_source,
  certificate_serial, vintage_year,
  generation_period_start, generation_period_end,
  mwh_represented, registry, claim_purpose,
  compliance_critical, double_counting_checked, severity_tier,
  issuer_id, issuer_name, holder_id, holder_name,
  issuance_ref, transfer_ref, retirement_ref,
  issuance_basis, retirement_basis,
  chain_status,
  issuance_requested_at, eligibility_review_at, issued_at,
  listed_for_transfer_at, transferred_at, allocated_at, retired_at,
  escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_rec_001', 'REC-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar 100MW', 'seed_proj_001', 'Goldrush Solar 100MW',
  'demo_offtaker_001', 'Eskom Holdings',
  'i_rec', 'solar_pv',
  'I-REC-ZA-2026-100001', 2025,
  '2025-01-01T00:00:00Z', '2025-12-31T00:00:00Z',
  120000.0, 'i_rec_registry', 're100',
  0, 1, 'material',
  'demo_admin_001', 'I-REC Standard', 'demo_offtaker_001', 'Eskom Holdings',
  'IREC-ISSUE-499-001', 'IREC-TRNSFR-499-001', 'IREC-RETIRE-499-001',
  '120,000 I-RECs issued for 2025 generation from Goldrush Solar 100MW.',
  '120,000 I-RECs retired on behalf of Eskom Holdings for RE100 Scope-2 claim.',
  'retired',
  '2026-02-01T08:00:00Z', '2026-02-10T10:00:00Z', '2026-02-20T14:00:00Z',
  '2026-03-01T09:00:00Z', '2026-03-15T10:00:00Z', '2026-03-20T11:00:00Z', '2026-04-01T14:00:00Z',
  0,
  'demo_admin_001', '2026-02-01T08:00:00Z', '2026-04-01T14:00:00Z'
);

-- W296 oe_esg_disclosure — published
INSERT OR IGNORE INTO oe_esg_disclosure (
  id, disclosure_number,
  reporting_entity_id, reporting_entity_name, financial_year_label,
  financial_year_end_at, period_opened_at,
  disclosure_scope, climate_risk_exposure, assurance_level,
  jse_listed_strict, scope3_inclusive_15cat, climate_scenario_required,
  material_topics_count, sbti_committed_strict, year_had_listed_disclosure,
  scope1_tco2e, scope2_market_tco2e, scope2_location_tco2e, scope3_total_tco2e,
  baseline_year, baseline_total_tco2e, reduction_pct_vs_baseline,
  current_tier, dispute_count, restate_count, cancel_count,
  chain_status,
  period_open_at, data_collected_at, draft_compiled_at, internal_review_at,
  assured_at, published_at,
  created_by, created_at, updated_at
) VALUES (
  'seed_esg_disc_001', 'ESG-499-2026-0001',
  'demo_offtaker_001', 'Eskom Holdings', 'FY2025',
  '2025-12-31T00:00:00Z', '2025-01-01T00:00:00Z',
  'entity_only', 'medium', 'limited',
  0, 0, 0,
  8, 0, 1,
  28450.0, 0.0, 12400.0, 185000.0,
  2019, 320000.0, 42.0,
  'material', 0, 0, 0,
  'published',
  '2025-01-01T00:00:00Z', '2026-01-15T09:00:00Z', '2026-02-20T10:00:00Z', '2026-03-10T14:00:00Z',
  '2026-04-05T10:00:00Z', '2026-05-01T09:00:00Z',
  'demo_offtaker_001', '2025-01-01T00:00:00Z', '2026-05-01T09:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- LENDER ROLE (demo_lender_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W61 oe_loan_transfers — completed
INSERT OR IGNORE INTO oe_loan_transfers (
  id, case_number,
  transferor_party_id, transferor_party_name,
  transferee_party_id, transferee_party_name,
  agent_party_id, agent_party_name,
  obligor_party_id, obligor_party_name,
  facility_name, transfer_type, tranche,
  borrower_project, facility_currency,
  facility_total_zar_m, transfer_zar_m, transfer_price_pct, settlement_zar_m,
  transfer_tier, transferee_residency, transferee_epfi,
  kyc_cleared, sanctions_cleared, obligor_consent_granted,
  sarb_approval_required, sarb_approval_obtained,
  certificate_signed, register_updated,
  request_ref, consent_ref, certificate_ref, settlement_ref, completion_ref,
  request_basis, settlement_basis,
  chain_status,
  transfer_requested_at, kyc_screening_at, consent_solicitation_at,
  transfer_approved_at, certificate_executed_at,
  settled_at, completed_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_loan_transfer_001', 'LTR-499-2026-0001',
  'demo_lender_001', 'Rand Merchant Bank',
  'demo_admin_001', 'Ninety One Asset Managers',
  'demo_admin_001', 'RMB Loan Agency',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'Goldrush Solar 100MW Senior Debt Facility', 'assignment', 'term',
  'Goldrush Solar 100MW', 'ZAR',
  480.0, 96.0, 101.5, 97.44,
  'moderate', 'resident', 1,
  1, 1, 1, 0, 0, 1, 1,
  'LTR-REQ-499-0001', 'LTR-CONSENT-499-0001', 'LTR-CERT-499-0001',
  'LTR-SETTLE-499-0001', 'LTR-COMPL-499-0001',
  'Transferor assigns 20% participation (R96m) to Ninety One per LMA secondary trading documentation.',
  'Settlement completed at 101.5 cents in the Rand; register updated same day.',
  'completed',
  '2026-04-01T09:00:00Z', '2026-04-05T10:00:00Z', '2026-04-12T11:00:00Z',
  '2026-04-20T14:00:00Z', '2026-04-25T10:00:00Z',
  '2026-05-02T14:00:00Z', '2026-05-05T10:00:00Z',
  0, 0,
  'demo_lender_001', '2026-04-01T09:00:00Z', '2026-05-05T10:00:00Z'
);

-- W69 oe_security_perfection — perfected
INSERT OR IGNORE INTO oe_security_perfection (
  id, case_number,
  facility_name,
  borrower_id, borrower_name,
  project_id, project_name,
  security_type, security_description, registry,
  secured_value_zar, ranking,
  perfection_critical, cross_border, severity_tier,
  security_agent_id, security_agent_name,
  grantor_id, grantor_name,
  document_ref, lodgement_ref, registration_ref, perfection_ref, legal_opinion_ref,
  documentation_basis, registration_basis, perfection_basis,
  chain_status,
  identified_at, documentation_pending_at, executed_at, lodged_for_registration_at,
  registered_at, perfection_review_at, perfected_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_sec_perf_001', 'SPF-499-2026-0001',
  'Goldrush Solar 100MW Senior Debt',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'seed_proj_001', 'Goldrush Solar 100MW',
  'mortgage_bond', 'First mortgage bond over immovable property (Erf 1234, Northern Cape)', 'deeds_office',
  480000000.0, 'first',
  1, 0, 'material',
  'demo_lender_001', 'RMB Loan Agency',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'MB-DOC-2025-001', 'MB-LODGE-2025-001', 'DEEDS-REG-2025-001', 'SPF-PERF-2025-001', 'LO-MB-2025-001',
  'First mortgage bond drafted by conveyancers; borrower execution obtained.',
  'Mortgage bond registered at Deeds Office; registration number confirmed.',
  'Perfection review completed; legal opinion confirms enforceable first-ranking mortgage.',
  'perfected',
  '2025-06-01T08:00:00Z', '2025-06-10T09:00:00Z', '2025-07-01T10:00:00Z', '2025-08-15T11:00:00Z',
  '2025-10-20T14:00:00Z', '2025-11-01T10:00:00Z', '2025-11-10T14:00:00Z',
  0, 0,
  'demo_lender_001', '2025-06-01T08:00:00Z', '2025-11-10T14:00:00Z'
);

-- W45 oe_loan_defaults — cured
INSERT OR IGNORE INTO oe_loan_defaults (
  id, default_number,
  borrower_party_id, borrower_party_name,
  lender_name, security_agent_name,
  facility_name, facility_tier,
  facility_limit, outstanding_principal,
  default_type, default_event, days_past_due,
  flag_ref, notice_ref, cure_ref,
  flag_basis, notice_basis, cure_basis, rod_notes,
  chain_status,
  default_flagged_at, under_review_at, reservation_of_rights_at,
  default_notice_issued_at, cure_period_at, cured_at,
  cure_deadline_at, sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_loan_default_001', 'LDEF-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'Rand Merchant Bank', 'RMB Loan Agency',
  'Goldrush Solar 100MW Senior Debt Facility', 'senior_secured',
  480000000.0, 380000000.0,
  'payment', 'Quarterly interest payment missed — Q1 2026', 18,
  'FLAG-LDEF-499-0001', 'NOTICE-LDEF-499-0001', 'CURE-LDEF-499-0001',
  'Quarterly DSRA sweep confirmed interest shortfall of R2.1m on payment date.',
  'Reservation of rights letter and default notice served per facility agreement.',
  'Borrower cured payment default within 30-day cure window; all amounts settled.',
  'Cured within contractual cure period. No acceleration triggered.',
  'cured',
  '2026-01-05T09:00:00Z', '2026-01-06T10:00:00Z', '2026-01-08T11:00:00Z',
  '2026-01-12T14:00:00Z', '2026-01-12T14:00:00Z', '2026-02-05T10:00:00Z',
  '2026-02-12T23:59:59Z', '2026-06-05T23:59:59Z', 0,
  'demo_lender_001', '2026-01-05T09:00:00Z', '2026-02-05T10:00:00Z'
);

-- W306 oe_loan_restructure — completed
INSERT OR IGNORE INTO oe_loan_restructure (
  id, restructure_number,
  facility_id, facility_name,
  borrower_id, borrower_name,
  lender_agent_id, lender_agent_name,
  project_id, project_name,
  syndicate_size,
  facility_amount_zar, outstanding_debt_zar, debt_service_per_month_zar,
  trigger_reason_code, trigger_narrative,
  forbearance_period_months, principal_reschedule_zar, principal_reschedule_pct,
  maturity_extension_months, equity_cure_quantum_zar, proposed_relief_zar,
  consent_severity, consent_threshold_pct, consent_majority_pct, syndicate_consented,
  consent_majority_passed,
  current_tier,
  chain_status,
  created_by, created_at, updated_at
) VALUES (
  'seed_loan_restructure_001', 'LRS-499-2026-0001',
  'FAC-RMB-GOLDRUSH-01', 'Goldrush Solar 100MW Senior Debt Facility',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'demo_lender_001', 'RMB Loan Agency',
  'seed_proj_001', 'Goldrush Solar 100MW',
  3,
  480000000.0, 380000000.0, 12000000.0,
  'dscr_shortfall', 'DSCR fell below 1.10x covenant for two consecutive quarters due to grid curtailment.',
  6, 48000000.0, 12.6,
  12, 18000000.0, 66000000.0,
  'special_majority', 66.67, 100.0, 1,
  1,
  'material',
  'completed',
  'demo_lender_001', '2026-01-15T09:00:00Z', '2026-05-01T10:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- CARBON ROLE (demo_carbon_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W56 oe_crediting_period_renewals — renewed
INSERT OR IGNORE INTO oe_crediting_period_renewals (
  id, renewal_number,
  project_id, project_name, registry_standard, methodology_id,
  vvb_name, proponent_party_id, proponent_party_name,
  issuance_tier, annual_issuance_tco2e,
  crediting_period_number, current_period_start, current_period_end,
  renewed_period_start, renewed_period_end,
  original_baseline_tco2e, revised_baseline_tco2e,
  baseline_reduction_pct, additionality_outcome,
  application_ref, vvb_report_ref, decision_ref,
  submission_basis, validation_basis, decision_basis, renewal_summary,
  chain_status,
  renewal_due_at, application_submitted_at, completeness_check_at,
  baseline_reassessment_at, additionality_retest_at,
  vvb_validation_at, standard_review_at, renewed_at,
  revision_round, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_cred_renewal_001', 'CPR-499-2026-0001',
  'seed_proj_001', 'Goldrush Solar 100MW Carbon Project', 'verra_vcs', 'VM0038',
  'Bureau Veritas', 'demo_carbon_001', 'Open Energy Carbon Fund',
  'material', 85000.0,
  2, '2019-07-01T00:00:00Z', '2026-06-30T00:00:00Z',
  '2026-07-01T00:00:00Z', '2033-06-30T00:00:00Z',
  92000.0, 88000.0,
  4.3, 'additional',
  'CPR-APP-499-0001', 'BV-CPR-RPT-499-0001', 'VCS-DEC-499-0001',
  'Crediting period renewal application submitted per VCS Standard v4.0 requirements.',
  'VVB completed baseline reassessment and additionality re-test; project confirmed additional.',
  'Verra Standard Review Committee approved renewal for 7-year period.',
  'Second crediting period renewed for 7 years (2026-2033); revised baseline reflects updated grid emission factor.',
  'renewed',
  '2026-01-01T08:00:00Z', '2026-01-15T10:00:00Z', '2026-01-25T14:00:00Z',
  '2026-02-10T09:00:00Z', '2026-02-20T10:00:00Z',
  '2026-03-15T14:00:00Z', '2026-04-10T10:00:00Z', '2026-05-01T14:00:00Z',
  0, 0, 0,
  'demo_carbon_001', '2026-01-01T08:00:00Z', '2026-05-01T14:00:00Z'
);

-- W42 oe_carbon_reversals — closed
INSERT OR IGNORE INTO oe_carbon_reversals (
  id, reversal_number,
  project_party_id, project_party_name, vvb_name,
  project_name, project_tier, standard, methodology,
  province, host_country,
  registered_project_ref, credit_serial_block,
  reversal_cause, reversal_type, reversal_tier,
  reversed_tco2e, buffer_cancelled_tco2e, replacement_tco2e,
  buffer_pool_ref, reversal_ref,
  reversal_summary, assessment_basis, buffer_basis,
  chain_status,
  reversal_reported_at, under_assessment_at, loss_quantified_at,
  buffer_cancellation_proposed_at, buffer_cancelled_at,
  remediation_verified_at, closed_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_carbon_reversal_001', 'CREV-499-2026-0001',
  'demo_carbon_001', 'Open Energy Carbon Fund', 'TUV Rheinland',
  'Goldrush Solar 100MW Carbon Project', 'large_scale', 'verra_vcs', 'VM0038',
  'Northern Cape', 'South Africa',
  'VCS-PROJ-0089', 'VCU-ZA-2024-089-001-100000',
  'wildfire', 'unintentional', 'minor',
  1200, 1200, 0,
  'VCS-BUFFER-ZA-499-001', 'VCS-REV-499-0001',
  'Minor wildfire event on project buffer zone; 1,200 tCO2e reversal declared.',
  'Independent assessment confirmed reversal magnitude; buffer pool coverage confirmed.',
  '1,200 buffer credits cancelled from VCS buffer pool; project integrity maintained.',
  'closed',
  '2026-03-05T09:00:00Z', '2026-03-10T10:00:00Z', '2026-03-20T14:00:00Z',
  '2026-03-25T10:00:00Z', '2026-04-05T14:00:00Z',
  '2026-04-15T10:00:00Z', '2026-04-20T14:00:00Z',
  0, 0,
  'demo_carbon_001', '2026-03-05T09:00:00Z', '2026-04-20T14:00:00Z'
);

-- W73 oe_poa_cpa_inclusions — verified
INSERT OR IGNORE INTO oe_poa_cpa_inclusions (
  id, cpa_number,
  programme_id, programme_name, registry_standard, methodology_id,
  cpa_ref, cpa_name,
  proponent_party_id, proponent_party_name,
  coordinating_entity_name, dna_name, vvb_name,
  host_country, geo_key,
  transfer_type, cpa_tier, annual_er_tco2e,
  requires_corresponding_adjustment,
  programme_cap_er_tco2e, included_er_tco2e, programme_headroom_tco2e,
  vintage_year,
  methodology_applicability, additionality_strength, monitoring_readiness,
  loa_confidence, eligibility_score, predicted_inclusion_days,
  screened_flag, methodology_ok_flag, loa_received_flag,
  inclusion_submitted_flag, included_flag, verified_flag,
  screening_ref, methodology_ref, loa_ref, inclusion_ref, verification_ref,
  proposal_basis, inclusion_basis, verification_basis,
  chain_status,
  cpa_proposed_at, eligibility_screening_at, methodology_check_at,
  loa_pending_at, inclusion_review_at, included_at, monitoring_at, verified_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_poa_incl_001', 'CPA-ZA-499-0001',
  'POA-OE-SOLAR-001', 'Open Energy Solar C&I PoA', 'gold_standard', 'GS-METH-WIND-001',
  'CPA-REF-499-0001', 'Goldrush C&I Solar Site 7 — 500kW',
  'demo_carbon_001', 'Open Energy Carbon Fund',
  'Open Energy Carbon Fund', 'DFFE South Africa', 'South Pole',
  'South Africa', 'PARCEL-NC-499-0047',
  'voluntary', 'small', 850.0,
  0,
  500000.0, 285000.0, 215000.0,
  2025,
  0.92, 0.88, 0.95, 0.90, 87, 45,
  1, 1, 1, 1, 1, 1,
  'CPA-SCREEN-499-0001', 'CPA-METH-499-0001', 'CPA-LOA-499-0001',
  'CPA-INCL-499-0001', 'CPA-VER-499-0001',
  'CPA eligibility confirmed; methodology applicable; LoA issued by DFFE.',
  'CPA formally included in PoA; monitoring commenced per approved monitoring plan.',
  'First monitoring period verification complete; 850 tCO2e verified for vintage 2025.',
  'verified',
  '2025-09-01T08:00:00Z', '2025-09-15T10:00:00Z', '2025-10-01T14:00:00Z',
  '2025-10-15T09:00:00Z', '2025-11-01T10:00:00Z', '2025-11-20T14:00:00Z',
  '2026-01-01T08:00:00Z', '2026-04-15T14:00:00Z',
  0, 0,
  'demo_carbon_001', '2025-09-01T08:00:00Z', '2026-04-15T14:00:00Z'
);

-- W65 oe_carbon_erpas — delivery_initiated
INSERT OR IGNORE INTO oe_carbon_erpas (
  id, erpa_number,
  project_id, project_name, registry_standard, methodology_id,
  seller_party_id, seller_party_name,
  buyer_party_id, buyer_party_name,
  transfer_type, volume_tier,
  contracted_volume_tco2e, delivered_volume_tco2e,
  price_per_tco2e, contract_currency, contract_value,
  vintage_year, host_country,
  corresponding_adjustment_required,
  delivery_window_start, delivery_window_end,
  erpa_ref, delivery_ref,
  execution_basis, schedule_basis, delivery_basis,
  chain_status,
  drafted_at, executed_at, delivery_scheduled_at, delivery_initiated_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_carbon_erpa_001', 'ERPA-499-2026-0001',
  'seed_proj_001', 'Goldrush Solar 100MW Carbon Project', 'verra_vcs', 'VM0038',
  'demo_carbon_001', 'Open Energy Carbon Fund',
  'demo_admin_001', 'Ecosecurities SA',
  'voluntary', 'material',
  250000, 85000,
  12.50, 'USD', 3125000.0,
  2025, 'South Africa',
  0,
  '2026-01-01T00:00:00Z', '2028-12-31T00:00:00Z',
  'ERPA-OE-499-0001', 'ERPA-DEL-499-0001',
  'ERPA executed per ISDA-style carbon trading documentation; all conditions precedent met.',
  'Annual delivery schedule agreed: 85k VCUs in 2026, 85k in 2027, 80k in 2028.',
  'First delivery of 85,000 VCUs for vintage 2025 initiated; transfer instruction issued.',
  'delivery_initiated',
  '2026-01-10T08:00:00Z', '2026-01-20T10:00:00Z', '2026-01-25T14:00:00Z', '2026-04-01T09:00:00Z',
  0, 0,
  'demo_carbon_001', '2026-01-10T08:00:00Z', '2026-04-01T09:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- GRID ROLE (demo_grid_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W18 oe_planned_outages — closed
INSERT OR IGNORE INTO oe_planned_outages (
  id, outage_number, participant_id,
  asset_id, asset_name, category, severity,
  chain_status,
  affected_mw, affected_zone,
  start_at, end_at, duration_minutes,
  reason, contingency_notes,
  sla_deadline_at, escalation_level,
  approved_by, approved_at, notified_at, commenced_at, restored_at, closed_at,
  created_by, created_at, updated_at
) VALUES (
  'seed_outage_499_001', 'OTG-499-2026-0001', 'demo_grid_001',
  'SUBSTATION-DEAAR-001', 'De Aar MTS 132kV', 'maintenance', 'medium',
  'closed',
  132.0, 'Northern Cape',
  '2026-05-20T06:00:00Z', '2026-05-20T18:00:00Z', 720,
  'Scheduled transformer bushing replacement; T4 transformer annual maintenance.',
  'N-1 secure; neighbouring Aggeneys MTS can absorb load transfer. Generators informed 14 days prior.',
  '2026-05-15T23:59:59Z', 0,
  'demo_admin_001', '2026-05-10T14:00:00Z', '2026-05-13T09:00:00Z',
  '2026-05-20T06:00:00Z', '2026-05-20T17:45:00Z', '2026-05-21T09:00:00Z',
  'demo_grid_001', '2026-04-20T08:00:00Z', '2026-05-21T09:00:00Z'
);

-- W58 oe_grid_capacity_allocations — capacity_allocated
INSERT OR IGNORE INTO oe_grid_capacity_allocations (
  id, allocation_number,
  applicant_party_id, applicant_party_name,
  operator_party_id, operator_party_name,
  capacity_tier, connection_type, technology, network_level,
  project_name, project_location,
  requested_capacity_mw, granted_capacity_mw,
  queue_rank, priority_date, substation, supply_area,
  estimated_capex_zar_m,
  application_ref, assessment_ref, offer_ref, reservation_ref, allocation_ref,
  application_basis, allocation_basis,
  chain_status,
  application_received_at, completeness_screening_at, capacity_assessment_at,
  queue_positioned_at, offer_issued_at, capacity_reserved_at, capacity_allocated_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_grid_cap_alloc_001', 'GCAP-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'demo_grid_001', 'Eskom Transmission SOC Ltd',
  'large', 'generation', 'solar_pv', 'transmission',
  'Goldrush Solar 100MW Phase 2', 'Northern Cape — De Aar',
  100.0, 100.0,
  12, '2025-03-15T00:00:00Z', 'De Aar MTS', 'Northern Cape Supply Area',
  618.0,
  'GCAP-APP-499-0001', 'GCAP-ASSESS-499-0001', 'GCAP-OFFER-499-0001',
  'GCAP-RES-499-0001', 'GCAP-ALLOC-499-0001',
  'Application received per NTCSA 2024 Capacity Rules; completeness confirmed.',
  'Firm capacity allocation granted following network impact study; 100MW confirmed at De Aar MTS.',
  'capacity_allocated',
  '2025-03-15T08:00:00Z', '2025-03-25T10:00:00Z', '2025-05-20T14:00:00Z',
  '2025-06-10T10:00:00Z', '2025-09-15T14:00:00Z', '2025-11-01T10:00:00Z', '2026-02-15T14:00:00Z',
  0, 0,
  'demo_grid_001', '2025-03-15T08:00:00Z', '2026-02-15T14:00:00Z'
);

-- W50 oe_reserve_activations — settled
INSERT OR IGNORE INTO oe_reserve_activations (
  id, activation_number,
  so_party_id, so_party_name,
  provider_party_id, provider_party_name,
  reserve_tier, provider_type, service_name, contract_ref,
  trigger_type, instructed_mw, delivered_mw,
  response_time_seconds, actual_response_seconds,
  frequency_hz_at_event,
  availability_payment_zar, utilisation_payment_zar,
  instruction_ref, acknowledgement_ref, delivery_ref, review_ref, settlement_ref,
  instruction_basis, settlement_basis,
  chain_status,
  activation_issued_at, acknowledged_at, ramping_at, sustaining_at,
  released_at, performance_review_at, verified_at, settled_at,
  dispute_round, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_reserve_act_001', 'RSVACT-499-2026-0001',
  'demo_grid_001', 'Eskom System Operator (NTCSA)',
  'demo_admin_001', 'Goldrush BESS 50MW',
  'ten_minute_reserve', 'battery_storage', 'Tertiary Operating Reserve', 'ANC-OE-2025-TOR-001',
  'frequency_drop', 48.0, 48.0,
  600.0, 580.0,
  49.78,
  980000.0, 240000.0,
  'RSVACT-INSTR-499-0001', 'RSVACT-ACK-499-0001', 'RSVACT-DEL-499-0001',
  'RSVACT-REV-499-0001', 'RSVACT-STL-499-0001',
  'TOR instruction issued following frequency drop below 49.8 Hz; all requirements triggered.',
  'Settlement completed: availability payment R980k + utilisation payment R240k; no penalties.',
  'settled',
  '2026-05-15T14:22:00Z', '2026-05-15T14:23:00Z', '2026-05-15T14:25:00Z', '2026-05-15T14:32:00Z',
  '2026-05-15T15:00:00Z', '2026-05-16T09:00:00Z', '2026-05-17T10:00:00Z', '2026-05-25T14:00:00Z',
  0, 0, 0,
  'demo_grid_001', '2026-05-15T14:22:00Z', '2026-05-25T14:00:00Z'
);

-- W67 oe_grid_code_compliance — compliant_closed
INSERT OR IGNORE INTO oe_grid_code_compliance (
  id, case_number,
  facility_id, facility_name, connection_point, network_area,
  licence_ref, technology, capacity_mw,
  breach_class, code_reference, parameter,
  measured_value, limit_value, severity_tier,
  operator_party_id, operator_party_name,
  facility_party_id, facility_party_name,
  nc_ref, assessment_ref, cap_ref, retest_ref,
  raise_basis, assessment_basis, cap_basis, remediation_basis,
  chain_status,
  monitoring_started_at, non_conformance_raised_at, under_assessment_at,
  corrective_action_required_at, cap_submitted_at, cap_approved_at,
  remediation_started_at, compliance_retest_at, compliant_closed_at,
  remediation_round, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_gcc_001', 'GCC-499-2026-0001',
  'seed_proj_001', 'Goldrush Solar 100MW', 'De Aar MTS 132kV', 'transmission',
  'NERSA-GEN-2024-001', 'solar_pv', 100.0,
  'reactive_power', 'Grid Connection Code for RPPs 4.1.3', 'Power factor at PoC',
  0.89, 0.95, 'moderate',
  'demo_grid_001', 'Eskom Transmission SOC Ltd',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'GCC-NC-499-0001', 'GCC-ASSESS-499-0001', 'GCC-CAP-499-0001', 'GCC-RETEST-499-0001',
  'Monitoring detected sustained power factor 0.89 at PoC — below 0.95 minimum under GCC 4.1.3.',
  'Technical assessment confirmed reactive power capability deficit; PV inverter firmware update required.',
  'Corrective action plan submitted: firmware update + reactive power compensation upgrade.',
  'Firmware update and capacitor bank installation completed; reactive power now within limits.',
  'compliant_closed',
  '2026-02-01T08:00:00Z', '2026-02-15T10:00:00Z', '2026-02-20T14:00:00Z',
  '2026-03-01T10:00:00Z', '2026-03-10T14:00:00Z', '2026-03-18T10:00:00Z',
  '2026-03-25T08:00:00Z', '2026-04-20T10:00:00Z', '2026-04-25T14:00:00Z',
  1, 0,
  'demo_grid_001', '2026-02-01T08:00:00Z', '2026-04-25T14:00:00Z'
);

-- W34 oe_load_curtailment — closed
INSERT OR IGNORE INTO oe_load_curtailment (
  id, case_number,
  so_party_id, so_party_name,
  customer_party_id, customer_party_name, customer_category,
  facility_name, facility_province,
  load_shed_stage, national_shed_gw, target_mw, actual_shed_mw,
  variance_pct, duration_hours,
  grid_code_section, instruction_ref, acknowledgement_ref, metering_reconcile_ref,
  rod_notes,
  chain_status,
  instruction_issued_at, acknowledged_at, curtailment_started_at,
  target_achieved_at, instruction_lifted_at, reconciled_at, closed_at,
  escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_load_curt_001', 'LCURT-499-2026-0001',
  'demo_grid_001', 'Eskom System Operator (NTCSA)',
  'demo_admin_001', 'Mangaung Metro Municipality', 'metro',
  'Mangaung Distribution Zone', 'Free State',
  'stage_3_4', 4.2, 380.0, 376.0,
  -1.05, 2.5,
  'CSC-1', 'LCURT-INSTR-499-0001', 'LCURT-ACK-499-0001', 'LCURT-RECON-499-0001',
  'Stage 4 load-shedding implemented per system demand requirements. Target achieved; reconciliation complete.',
  'closed',
  '2026-04-08T18:00:00Z', '2026-04-08T18:05:00Z', '2026-04-08T18:15:00Z',
  '2026-04-08T18:45:00Z', '2026-04-08T20:30:00Z', '2026-04-09T10:00:00Z', '2026-04-09T14:00:00Z',
  0,
  'demo_grid_001', '2026-04-08T18:00:00Z', '2026-04-09T14:00:00Z'
);

-- W215 oe_eop_activations — per_completed
INSERT OR IGNORE INTO oe_eop_activations (
  id, participant_id,
  eop_tier, contingency_type, contingency_description,
  affected_mw, affected_region, load_shedding_stage,
  contingency_at, eop_activated_at, operations_centre_alerted_at,
  restoration_started_at, normal_ops_restored_at, total_outage_duration_min,
  per_initiated_at, per_completed_at, per_lead_name,
  root_cause, lessons_learned,
  ntcsa_incident_ref, so_incident_ref,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_eop_001', 'demo_grid_001',
  'n1_significant', 'line_trip', 'Double-circuit 400kV line trip — Aggeneys-De Aar section',
  280.0, 'Northern Cape', 2,
  '2026-03-22T11:45:00Z', '2026-03-22T11:47:00Z', '2026-03-22T11:48:00Z',
  '2026-03-22T12:15:00Z', '2026-03-22T14:30:00Z', 165,
  '2026-03-23T09:00:00Z', '2026-03-30T14:00:00Z', 'Thabo Nkosi (Grid Ops Manager)',
  'Insulator flashover under high humidity conditions triggered auto-reclose failure.',
  'Improved auto-reclose settings implemented. Insulator inspection programme accelerated.',
  'NTCSA-INC-499-0089', 'SO-INC-499-0089',
  'per_completed',
  '2026-04-30T23:59:59Z', 0, 0,
  'demo_grid_001', '2026-03-22T11:45:00Z', '2026-03-30T14:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- REGULATOR ROLE (demo_regulator_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W33 oe_licence_renewals — granted
INSERT OR IGNORE INTO oe_licence_renewals (
  id, case_number, licence_id, licence_number, licence_type, licence_class,
  capacity_mw,
  applicant_party_id, applicant_party_name, facility_name, facility_province,
  current_expiry_date, requested_expiry_date, granted_expiry_date,
  application_pack_ref, completeness_ref, decision_rod_ref, council_meeting_ref,
  council_vote_outcome, rod_notes,
  chain_status,
  initiated_at, application_filed_at, completeness_checked_at,
  evaluation_started_at, decision_drafted_at, council_voted_at, granted_at,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_lic_renewal_001', 'LR-499-2026-0001', 'LIC-GEN-GOLDRUSH-001', 'NERSA-GEN-2024-001',
  'generation', 'generation_utility',
  100.0,
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd', 'Goldrush Solar 100MW', 'Northern Cape',
  '2027-06-30T00:00:00Z', '2042-06-30T00:00:00Z', '2042-06-30T00:00:00Z',
  'LR-APP-499-0001', 'LR-COMPL-499-0001', 'LR-ROD-499-0001', 'NERSA-CM-499-0047',
  'APPROVED (unanimous)', 'Licence renewed for full remaining project term. All conditions satisfied.',
  'granted',
  '2026-01-10T08:00:00Z', '2026-01-20T10:00:00Z', '2026-02-01T14:00:00Z',
  '2026-02-15T09:00:00Z', '2026-03-10T14:00:00Z', '2026-04-02T10:00:00Z', '2026-04-10T14:00:00Z',
  '2026-06-30T23:59:59Z', 0,
  'demo_regulator_001', '2026-01-10T08:00:00Z', '2026-04-10T14:00:00Z'
);

-- W74 oe_regulator_levies — settled
INSERT OR IGNORE INTO oe_regulator_levies (
  id, levy_number,
  licensee_id, licensee_name, licensee_licence_no,
  sector, levy_basis, levy_tier, financial_year,
  declared_base, base_unit, levy_rate,
  assessed_amount, paid_to_date, outstanding_amount, due_date,
  assessment_ref, invoice_ref, settlement_ref,
  assessment_basis, invoice_basis, settlement_basis,
  chain_status,
  assessed_at, assessment_review_at, invoiced_at, payment_pending_at, settled_at,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_regulator_levy_001', 'LEVY-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd', 'NERSA-GEN-2024-001',
  'electricity', 'turnover_based', 'medium', '2025/26',
  85000000.0, 'ZAR', 0.0008,
  68000.0, 68000.0, 0.0, '2026-05-31T23:59:59Z',
  'LEVY-ASSESS-499-0001', 'LEVY-INV-499-0001', 'LEVY-STL-499-0001',
  'Annual NERSA levy assessed at 0.08% of declared turnover per ERA Section 5B and levy schedule.',
  'Invoice issued per regulation; payment due within 30 days of invoice date.',
  'Full payment received; levy account confirmed settled for FY 2025/26.',
  'settled',
  '2026-04-01T08:00:00Z', '2026-04-05T10:00:00Z', '2026-04-10T14:00:00Z',
  '2026-04-10T14:00:00Z', '2026-05-08T10:00:00Z',
  '2026-05-31T23:59:59Z', 0,
  'demo_regulator_001', '2026-04-01T08:00:00Z', '2026-05-08T10:00:00Z'
);

-- W43 oe_tariff_determinations — gazetted
INSERT OR IGNORE INTO oe_tariff_determinations (
  id, determination_number,
  applicant_party_id, applicant_party_name,
  regulator_party_id, regulator_party_name,
  licence_ref, tariff_entity, tariff_segment, determination_class, price_year,
  requested_revenue_zar_m, allowed_revenue_zar_m,
  rab_zar_m, wacc_pre_tax, opex_zar_m, rca_balance_zar_m,
  requested_tariff_zar_kwh, allowed_tariff_zar_kwh, tariff_increase_pct,
  application_ref, consultation_ref, determination_ref, gazette_ref,
  application_basis, determination_basis, rod_notes,
  chain_status,
  application_received_at, completeness_check_at,
  consultation_opened_at, analysis_started_at, draft_issued_at,
  determination_issued_at, gazetted_at,
  determination_round, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_tariff_det_499_001', 'TD-499-2026-0001',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd',
  'demo_regulator_001', 'NERSA Energy Regulator',
  'NERSA-GEN-2024-001', 'Goldrush Solar 100MW', 'generation', 'annual_tariff', '2026/27',
  1085.0, 1020.0,
  520.0, 0.0875, 48.0, -12.0,
  1.12, 1.02, 4.10,
  'TD-APP-499-0001', 'TD-CONSULT-499-0001', 'TD-DET-499-0001', 'GG-47892-2026',
  'Annual tariff determination application submitted per ERA Sections 15-16 and MYPD methodology.',
  'Tariff determined at R1.02/kWh; allowed revenue adjusted downward per RCA true-up.',
  'Tariff determination issued and gazetted; effective from 1 July 2026.',
  'gazetted',
  '2025-10-01T08:00:00Z', '2025-10-15T10:00:00Z',
  '2025-11-01T09:00:00Z', '2025-12-01T10:00:00Z', '2026-02-15T14:00:00Z',
  '2026-04-10T10:00:00Z', '2026-05-01T09:00:00Z',
  1, 0, 0,
  'demo_regulator_001', '2025-10-01T08:00:00Z', '2026-05-01T09:00:00Z'
);

-- W31 oe_disposition_cases — closed
INSERT OR IGNORE INTO oe_disposition_cases (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave, source_party,
  notice_subject, severity_tier,
  assigned_officer, assigned_directorate,
  investigation_findings, required_action, disposition_outcome,
  regulator_authority,
  chain_status,
  received_at, triaged_at, assigned_at, investigating_at,
  action_required_at, action_completed_at, closed_at,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_disposition_001', 'DISP-499-2026-0001',
  'licence_review', 'oe_licence_renewals', 'seed_lic_renewal_001', 'W33', 'demo_ipp_001',
  'Licence Renewal Application — Goldrush Solar 100MW', 'medium',
  'Nomsa Dlamini', 'Generation Licensing Directorate',
  'Full review completed; all conditions precedent met; licence renewal approved by Council.',
  'Issue renewed licence certificate and update public register.',
  'Licence renewal granted; certificate issued; public register updated.',
  'NERSA',
  'closed',
  '2026-01-10T08:00:00Z', '2026-01-12T10:00:00Z', '2026-01-15T09:00:00Z', '2026-02-15T10:00:00Z',
  '2026-04-10T14:00:00Z', '2026-04-12T10:00:00Z', '2026-04-15T14:00:00Z',
  '2026-06-10T23:59:59Z', 0,
  'demo_regulator_001', '2026-01-10T08:00:00Z', '2026-04-15T14:00:00Z'
);

-- W209 oe_public_consultations — closed
INSERT OR IGNORE INTO oe_public_consultations (
  id, participant_id,
  consultation_type, consultation_tier, title,
  reference_number,
  publication_date, gazette_number, gazette_date,
  comment_deadline,
  submissions_count, objections_count, submissions_summary,
  analysis_completed_at, determination_summary, determination_issued_at, determination_ref,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_pub_consult_001', 'demo_regulator_001',
  'licence_application', 'significant',
  'Public Participation — Goldrush Solar 100MW Phase 2 Licence Application',
  'NERSA-PP-499-0142',
  '2025-09-01T00:00:00Z', 'GG-47512', '2025-09-01T00:00:00Z',
  '2025-10-01T17:00:00Z',
  24, 2, 'Submissions predominantly supportive; 2 objections related to grid capacity received and addressed.',
  '2025-11-15T14:00:00Z', 'Consultation completed; no material objections sustained.',
  '2025-11-20T10:00:00Z', 'NERSA-DET-PP-499-0142',
  'closed',
  '2025-12-31T23:59:59Z', 0, 0,
  'demo_regulator_001', '2025-08-15T08:00:00Z', '2025-11-20T10:00:00Z'
);

-- W220 oe_market_conduct_exams — closed_satisfactory
INSERT OR IGNORE INTO oe_market_conduct_exams (
  id, participant_id,
  exam_tier, exam_type,
  subject_participant_id, subject_licence_class,
  examination_ref,
  notice_issued_at, notice_ref, document_request_ref, document_deadline,
  documents_received_at,
  on_site_start_date, on_site_end_date, on_site_lead_examiner,
  preliminary_findings_ref, preliminary_issued_at, response_deadline,
  subject_response_ref, subject_response_at,
  final_report_ref, final_report_issued_at, findings_summary,
  adverse_findings_count,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_mce_001', 'demo_regulator_001',
  'routine', 'market_integrity',
  'demo_trader_001', 'trading',
  'NERSA-MCE-499-0018',
  '2025-10-01T09:00:00Z', 'MCE-NOTICE-499-0018', 'MCE-DOCREQ-499-0018', '2025-10-22T17:00:00Z',
  '2025-10-20T14:00:00Z',
  '2025-11-03T00:00:00Z', '2025-11-07T00:00:00Z', 'Khumo Sithole (Senior Examiner)',
  'MCE-PREL-499-0018', '2025-11-20T10:00:00Z', '2025-12-05T17:00:00Z',
  'MCE-RESP-499-0018', '2025-12-03T14:00:00Z',
  'MCE-FINAL-499-0018', '2026-01-15T10:00:00Z',
  'No adverse findings; all market conduct requirements satisfied.',
  0,
  'closed_satisfactory',
  '2026-02-28T23:59:59Z', 0, 0,
  'demo_regulator_001', '2025-09-15T08:00:00Z', '2026-01-15T10:00:00Z'
);

-- W57 oe_sseg_registrations — registered
INSERT OR IGNORE INTO oe_sseg_registrations (
  id, registration_number,
  applicant_party_id, applicant_party_name,
  regulator_party_id, regulator_party_name,
  capacity_tier, generation_purpose, technology, customer_category,
  facility_name, facility_location, capacity_kw, point_of_connection, distributor,
  estimated_capex_zar_m,
  application_ref, screening_ref, verification_ref, determination_ref, certificate_ref,
  application_basis, verification_basis, approval_basis,
  info_request_round,
  chain_status,
  registration_received_at, eligibility_screening_at, technical_verification_at,
  exemption_determination_at, conditions_pending_at, registration_approved_at, registered_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_sseg_reg_001', 'NERSA-SSEG-499-0089',
  'demo_admin_001', 'Goldrush C&I Holdings',
  'demo_regulator_001', 'NERSA',
  'medium', 'own_use', 'solar_pv', 'commercial',
  'Goldrush Office Park Solar 750kW', 'Gauteng — Sandton', 750.0,
  'Eskom Distribution LV/MV Interconnection', 'Eskom Distribution', 1.95,
  'SSEG-APP-499-0089', 'SSEG-SCREEN-499-0089', 'SSEG-VER-499-0089',
  'SSEG-DET-499-0089', 'NERSA-SSEG-CERT-499-0089',
  'Schedule 2 SSEG registration application submitted for 750kW commercial rooftop solar facility.',
  'Technical verification completed; all Grid Connection Code Section 5 requirements confirmed.',
  'NERSA approved Schedule 2 registration; certificate issued; facility exempt from full licensing.',
  0,
  'registered',
  '2026-02-01T08:00:00Z', '2026-02-10T10:00:00Z', '2026-02-25T14:00:00Z',
  '2026-03-05T10:00:00Z', '2026-03-10T09:00:00Z', '2026-03-20T14:00:00Z', '2026-03-25T10:00:00Z',
  0, 0,
  'demo_regulator_001', '2026-02-01T08:00:00Z', '2026-03-25T10:00:00Z'
);

-- W66 oe_regulator_complaints — resolved
INSERT OR IGNORE INTO oe_regulator_complaints (
  id, complaint_number,
  complainant_id, complainant_name, complainant_type,
  respondent_id, respondent_name, respondent_licence_no,
  complaint_category, complaint_tier, affected_customers,
  complaint_ref, investigation_ref, ruling_ref,
  lodgement_basis, investigation_basis, ruling_basis, remedy_directed,
  chain_status,
  complaint_lodged_at, admissibility_review_at, referred_to_licensee_at,
  under_investigation_at, ruling_issued_at, remedy_monitoring_at, resolved_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_reg_complaint_001', 'CMP-499-2026-0001',
  'demo_admin_001', 'Mangaung Industrial Users Association', 'customer',
  'demo_ipp_001', 'Goldrush Solar SPV (RF) Ltd', 'NERSA-GEN-2024-001',
  'supply_quality', 'moderate', 45,
  'CMP-499-0001', 'CMP-INV-499-0001', 'CMP-RULING-499-0001',
  'Complaint lodged regarding voltage fluctuations linked to solar PV export during peak hours.',
  'Investigation confirmed minor power quality impact; corrective measures identified.',
  'NERSA directed IPP to implement reactive power compensation improvements within 60 days.',
  'Reactive power compensation upgrade completed; supply quality confirmed within NRS 048-2 limits.',
  'resolved',
  '2026-02-01T09:00:00Z', '2026-02-05T10:00:00Z', '2026-02-08T14:00:00Z',
  '2026-02-15T09:00:00Z', '2026-03-20T14:00:00Z', '2026-04-01T09:00:00Z', '2026-05-10T14:00:00Z',
  0, 0,
  'demo_regulator_001', '2026-02-01T09:00:00Z', '2026-05-10T14:00:00Z'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SUPPORT ROLE (demo_support_001)
-- ══════════════════════════════════════════════════════════════════════════════

-- W208 oe_csat_records — high score (closed_satisfied)
INSERT OR IGNORE INTO oe_csat_records (
  id, participant_id, ticket_id, support_tier,
  resolved_at, survey_sent_at, survey_expires_at, survey_responded_at,
  csat_score, csat_comment,
  resolution_time_minutes, sla_target_minutes, sla_met,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_csat_001', 'demo_ipp_001', 'ticket_001', 'p2_high',
  '2026-05-10T14:30:00Z', '2026-05-10T15:00:00Z', '2026-05-17T15:00:00Z', '2026-05-11T09:00:00Z',
  5, 'Excellent support — issue resolved quickly and professionally. Very satisfied.',
  220, 240, 1,
  'closed_satisfied',
  '2026-05-17T23:59:59Z', 0, 0,
  'demo_support_001', '2026-05-10T14:30:00Z', '2026-05-11T09:00:00Z'
);

-- W208 oe_csat_records — low score (closed_escalated)
INSERT OR IGNORE INTO oe_csat_records (
  id, participant_id, ticket_id, support_tier,
  resolved_at, survey_sent_at, survey_expires_at, survey_responded_at,
  csat_score, csat_comment,
  follow_up_reason, follow_up_sent_at, follow_up_responded_at, follow_up_score,
  escalation_reason, escalated_at, escalation_resolved_at, escalation_resolution,
  resolution_time_minutes, sla_target_minutes, sla_met,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_csat_002', 'demo_trader_001', 'ticket_002', 'p1_critical',
  '2026-05-15T08:45:00Z', '2026-05-15T09:00:00Z', '2026-05-22T09:00:00Z', '2026-05-15T14:00:00Z',
  2, 'Too long to resolve — system was down for over an hour.',
  'Low CSAT score on P1 ticket; escalation required', '2026-05-16T09:00:00Z', '2026-05-16T11:00:00Z', 3,
  'CSAT score 2/5 on critical incident; service director review required',
  '2026-05-16T09:00:00Z', '2026-05-17T14:00:00Z',
  'Apology issued; credit applied; RCA initiated. Customer satisfied with resolution.',
  68, 60, 0,
  'closed_escalated',
  '2026-05-22T23:59:59Z', 0, 0,
  'demo_support_001', '2026-05-15T08:45:00Z', '2026-05-17T14:00:00Z'
);

-- W217 oe_sla_performance_reports — approved
INSERT OR IGNORE INTO oe_sla_performance_reports (
  id, participant_id,
  report_tier, reporting_period, period_start, period_end,
  total_incidents, p1_count, p2_count, p3_count, p4_count,
  p1_sla_met, p2_sla_met, p3_sla_met, p4_sla_met,
  p1_sla_pct, p2_sla_pct, p3_sla_pct, p4_sla_pct,
  overall_sla_pct, target_sla_pct,
  rca_triggered, rca_lead, rca_findings, rca_completed_at,
  reviewer_name, review_completed_at,
  chain_status,
  sla_deadline, sla_breached, regulator_notified,
  actor_id, created_at, updated_at
) VALUES (
  'seed_sla_perf_001', 'demo_support_001',
  'enhanced', 'May-2026', '2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z',
  142, 3, 18, 67, 54,
  2, 17, 65, 54,
  66.7, 94.4, 97.0, 100.0,
  96.5, 95.0,
  1, 'Mpho Khumalo',
  'Root cause: alert threshold misconfiguration on P1 monitoring; corrected.',
  '2026-06-04T14:00:00Z',
  'Sarah van der Berg (Operations Director)', '2026-06-05T10:00:00Z',
  'approved',
  '2026-06-15T23:59:59Z', 0, 0,
  'demo_support_001', '2026-06-01T08:00:00Z', '2026-06-05T10:00:00Z'
);

-- W41 oe_problem_records — closed
INSERT OR IGNORE INTO oe_problem_records (
  id, problem_number,
  owner_party_id, owner_party_name,
  service_name, affected_tenant, problem_category, problem_priority,
  recurring_incident_count,
  known_error_ref, change_request_ref,
  problem_summary, investigation_basis, rca_basis, fix_basis, verification_basis,
  workaround, closure_notes,
  chain_status,
  problem_logged_at, categorized_at, investigating_at, rca_identified_at,
  known_error_at, fix_proposed_at, change_raised_at, fix_deployed_at,
  resolution_verified_at, closed_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_problem_001', 'PRB-499-2026-0001',
  'demo_support_001', 'OE Platform Support',
  'Trading Order Entry', 'demo_trader_001', 'software', 'significant',
  4,
  'KEDB-499-0047', 'CHG-499-0089',
  'Recurring order entry timeouts during peak trading hours (08:30-10:00 SAST); 4 incidents in 30 days.',
  'Correlation analysis confirmed all 4 incidents occurred during peak order volume; database query plan degraded.',
  'Root cause: missing composite index on order_book table; full table scans under load.',
  'Add composite index via DB migration; query optimisation applied; connection pool tuned.',
  'Post-fix monitoring confirmed zero recurrence across 3 peak trading sessions.',
  'Clear order entry cache and restart order router if timeout occurs (max 2 min impact).',
  'Problem resolved. Composite index deployed; performance improved 95%. Closed.',
  'closed',
  '2026-04-15T09:00:00Z', '2026-04-15T14:00:00Z', '2026-04-16T09:00:00Z', '2026-04-20T14:00:00Z',
  '2026-04-22T10:00:00Z', '2026-04-24T09:00:00Z', '2026-04-25T10:00:00Z', '2026-05-02T06:00:00Z',
  '2026-05-10T10:00:00Z', '2026-05-10T14:00:00Z',
  0, 0,
  'demo_support_001', '2026-04-15T09:00:00Z', '2026-05-10T14:00:00Z'
);

-- W47 oe_change_requests — closed
INSERT OR IGNORE INTO oe_change_requests (
  id, change_number,
  owner_party_id, owner_party_name,
  service_name, affected_tenant, change_category, change_class,
  affected_ci_count,
  problem_ref, cab_ref, release_ref,
  scheduled_start_at, scheduled_end_at,
  change_summary, assessment_basis, cab_basis, implementation_basis, verification_basis,
  backout_plan, closure_notes,
  chain_status,
  change_requested_at, assessment_at, cab_review_at, approved_at,
  scheduled_at, implementing_at, implemented_at, pir_at, closed_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_change_req_001', 'CHG-499-0089',
  'demo_support_001', 'OE Platform Support',
  'Trading Order Entry', 'demo_trader_001', 'software', 'normal_change',
  3,
  'PRB-499-2026-0001', 'CAB-499-0089', 'REL-499-0089',
  '2026-05-02T02:00:00Z', '2026-05-02T04:00:00Z',
  'Add composite index on order_book table; query optimisation; connection pool tuning.',
  'Change assessed as low-risk; backout plan confirmed; maintenance window scheduled.',
  'CAB approved; no objections; forward schedule confirmed.',
  'Migration applied successfully at 02:15; rollback not required; services confirmed healthy.',
  'PIR completed; zero recurrence confirmed across 3 peak sessions; performance targets met.',
  'Rollback migration script prepared and tested; can revert within 5 minutes if required.',
  'Change successful. PIR confirmed positive outcome. Problem PRB-499-2026-0001 resolved.',
  'closed',
  '2026-04-25T10:00:00Z', '2026-04-26T14:00:00Z', '2026-04-30T10:00:00Z', '2026-04-30T11:00:00Z',
  '2026-05-01T14:00:00Z', '2026-05-02T02:00:00Z', '2026-05-02T04:30:00Z',
  '2026-05-10T10:00:00Z', '2026-05-10T14:00:00Z',
  0, 0,
  'demo_support_001', '2026-04-25T10:00:00Z', '2026-05-10T14:00:00Z'
);

-- W55 oe_security_remediations — resolved
INSERT OR IGNORE INTO oe_security_remediations (
  id, remediation_number,
  advisory_ref, advisory_source, cve_id, cvss_score, cvss_vector,
  severity_tier, oem_vendor, product_family, ci_type,
  affected_versions, fixed_version, patch_package_ref,
  affected_ci_count, patched_ci_count, sites_affected,
  fleet_scope, project_id, project_name, sector,
  triage_ref, assessment_ref, mitigation_ref, approval_ref,
  rollout_ref, verification_ref, resolution_ref,
  triage_basis, assessment_basis, mitigation_basis, rollout_basis, verification_basis,
  chain_status,
  advisory_received_at, triaged_at, impact_assessment_at,
  mitigation_applied_at, fleet_scoped_at, remediation_approved_at,
  rollout_in_progress_at, verified_at, resolved_at,
  is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES (
  'seed_sec_remed_001', 'SRM-499-2026-0001',
  'SOLAX-PSIRT-2026-0012', 'oem', 'CVE-2026-10142', 7.8, 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
  'high', 'Solax Power', 'X3-Hybrid G4', 'inverter',
  'v3.0.0-v3.4.2', 'v3.5.0', 'SOLAX-FW-350-2026',
  18, 18, 3,
  'All 18 Solax X3-Hybrid G4 inverters across 3 Goldrush C&I sites',
  'seed_proj_001', 'Goldrush C&I Solar Portfolio', 'solar_pv',
  'SRM-TRIAGE-499-0001', 'SRM-ASSESS-499-0001', 'SRM-MIT-499-0001', 'SRM-APPR-499-0001',
  'SRM-ROLLOUT-499-0001', 'SRM-VER-499-0001', 'SRM-RES-499-0001',
  'CVE-2026-10142 triaged as high severity; all 18 inverters confirmed in affected version range.',
  'Impact assessment: CVSS 7.8; remote authentication bypass potential; fleet scope confirmed.',
  'Network segmentation applied as compensating control pending approved patch rollout.',
  'OTA firmware update v3.5.0 deployed to all 18 units via Solax Cloud portal; zero failures.',
  'Post-patch verification completed; vulnerability confirmed remediated on all units.',
  'resolved',
  '2026-05-01T09:00:00Z', '2026-05-01T14:00:00Z', '2026-05-02T10:00:00Z',
  '2026-05-03T08:00:00Z', '2026-05-04T10:00:00Z', '2026-05-06T14:00:00Z',
  '2026-05-08T06:00:00Z', '2026-05-12T10:00:00Z', '2026-05-12T14:00:00Z',
  0, 0,
  'demo_support_001', '2026-05-01T09:00:00Z', '2026-05-12T14:00:00Z'
);
