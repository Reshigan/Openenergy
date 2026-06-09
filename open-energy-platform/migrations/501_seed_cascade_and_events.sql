-- ══════════════════════════════════════════════════════════════════════════════
-- 501_seed_cascade_and_events.sql
--
-- Fills the three critical gaps the 494–500 audit identified:
--
--   A. oe_platform_events   — 15 rows covering every major cross-role cascade
--   B. oe_role_action_queue — 12 rows wiring follow-up actions to target roles
--   C. Chain _events tables — audit trail rows for every seeded chain record
--
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ══════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A: oe_platform_events
-- These represent the cascade events that would have fired from chain actions.
-- event strings match EventType union in src/utils/cascade.ts
-- ════════════════════════════════════════════════════════════════════════════

-- IPP: COD milestone reached → notifies regulator + grid
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_001', 'cod_chain.cod_certified', 'cod_chain',
   'oe_cod_chain', 'seed-cod-001-ec', 'demo_ipp_002',
   'cod_certified', '["regulator","grid_operator","lender"]',
   150.0,
   '{"project_name":"Eastern Cape Wind Farm","capacity_mw":150,"cod_date":"2026-04-15"}',
   datetime('now','-55 days'));

-- IPP: Stage gate DG2 passed → notifies lender + regulator
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_002', 'stage_gate.gate_passed', 'stage_gate',
   'oe_stage_gates', 'seed-sg-003', 'demo_ipp_001',
   'gate_passed', '["lender","regulator"]',
   100.0,
   '{"project_name":"Limpopo Solar Park","gate":"DG2","capacity_mw":100}',
   datetime('now','-30 days'));

-- Trader: position limit breach → notifies regulator + admin
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_003', 'poslimit.limit_breach', 'poslimit',
   'oe_poslimit_cases', 'seed_poslimit_001', 'demo_trader_001',
   'limit_breach', '["regulator","admin"]',
   1150.0,
   '{"breach_mw":150,"limit_mw":1000,"energy_type":"solar_pv"}',
   datetime('now','-12 days'));

-- Trader: market abuse STOR filed → notifies regulator
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_004', 'market_abuse.stor_filed', 'market_abuse',
   'oe_market_abuse_cases', 'seed_mab_001', 'demo_admin_001',
   'stor_filed', '["regulator"]',
   0.0,
   '{"suspicion_type":"layering","submitted_to":"FSCA","reference":"STOR-2026-0012"}',
   datetime('now','-8 days'));

-- Lender: DSCR breach → notifies regulator + IPP
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_005', 'dscr.breach_recorded', 'dscr',
   'oe_dscr_monitoring', 'dscr_003', 'demo_lender_001',
   'breach_recorded', '["regulator","ipp_developer"]',
   1620.0,
   '{"dscr_ratio":1.62,"covenant_floor":1.30,"facility_id":"seed_cfa_001","period":"Q2-2025"}',
   datetime('now','-40 days'));

-- Lender: covenant breach escalated → notifies regulator
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_006', 'covenant_cert.breach_declared', 'covenant_cert',
   'oe_covenant_certificates', 'covcert_002', 'demo_lender_001',
   'breach_declared', '["regulator","ipp_developer"]',
   850000000.0,
   '{"covenant_type":"dscr","facility":"KZN Peaker Project Finance"}',
   datetime('now','-38 days'));

-- Carbon: reversal reported → notifies regulator + carbon_fund
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_007', 'carbon_reversal.reversal_reported', 'carbon_reversal',
   'oe_carbon_reversals', 'seed_crev_001', 'demo_carbon_001',
   'reversal_reported', '["regulator","carbon_fund"]',
   1200.0,
   '{"reversal_type":"wildfire","tonnes_co2e":1200,"project_id":"seed_cproj_001"}',
   datetime('now','-45 days'));

-- Grid: load curtailment Stage 4 → notifies IPP + regulator
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_008', 'load_curtailment.instruction_issued', 'load_curtailment',
   'oe_load_curtailment', 'seed_lcs_001', 'demo_grid_001',
   'instruction_issued', '["ipp_developer","regulator"]',
   2.5,
   '{"stage":4,"target_mw":2.5,"area":"Limpopo North","duration_hours":4}',
   datetime('now','-20 days'));

-- Grid: EOP activation black_start → notifies regulator (all tiers)
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_009', 'eop_activation.eop_activated', 'eop_activation',
   'oe_eop_activations', 'seed_eop_001', 'demo_grid_001',
   'eop_activated', '["regulator","ipp_developer","admin"]',
   0.0,
   '{"eop_type":"n2_contingency","area":"Gauteng North","duration_hours":1.5}',
   datetime('now','-15 days'));

-- Regulator: licence granted → notifies IPP
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_010', 'licence_application.licence_granted', 'licence_application',
   'oe_licence_applications', 'lapp_001', 'demo_regulator_001',
   'licence_granted', '["ipp_developer"]',
   100.0,
   '{"licence_class":"generation","capacity_mw":100,"licence_number":"L/NR/G/2026/001"}',
   datetime('now','-70 days'));

-- HSE: LTIFR incident reported → notifies regulator + admin
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_011', 'hse_incident.incident_reported', 'hse_incident',
   'oe_hse_incidents', 'hse_seed_002', 'demo_esco_001',
   'reported', '["regulator","admin","ipp_developer"]',
   0.0,
   '{"severity":"ltifr","injury_type":"laceration","site":"Limpopo Solar Park"}',
   datetime('now','-18 days'));

-- Offtaker: take-or-pay penalty applied → notifies IPP + regulator
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_012', 'take_or_pay.penalty_applied', 'take_or_pay',
   'oe_ppa_contract_chain', 'seed_ppa_001', 'demo_offtaker_001',
   'penalty_applied', '["ipp_developer","regulator"]',
   1250000.0,
   '{"shortfall_mwh":1000,"penalty_zar":1250000,"period":"2025-Q4","ppa_ref":"PPA-KLSD-200-2024"}',
   datetime('now','-25 days'));

-- Offtaker: PPA termination notice → notifies IPP + regulator (involuntary)
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_013', 'ppa_termination.notice_issued', 'ppa_termination',
   'oe_ppa_terminations', 'seed_ppater_001', 'demo_offtaker_001',
   'notice_issued', '["ipp_developer","lender","regulator"]',
   0.0,
   '{"ppa_ref":"PPA-DRAFT-2026","cause":"force_majeure","notice_period_days":180}',
   datetime('now','-10 days'));

-- Support: P1 ticket escalated → notifies admin
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_014', 'support_ticket.escalated_p1', 'support_ticket',
   'oe_support_ticket_events', 'stev_seed_001', 'demo_support_001',
   'escalated', '["admin"]',
   0.0,
   '{"priority":"P1","ticket_ref":"TKT-2026-0142","breach_minutes":45}',
   datetime('now','-5 days'));

-- Carbon: Article 6 ITMO transfer authorized → notifies regulator
INSERT OR IGNORE INTO oe_platform_events
  (id, event, chain_key, entity_type, entity_id, actor_id,
   source_chain_status, affected_roles, entity_value, data_json, occurred_at)
VALUES
  ('pev_015', 'carbon_registry_transfer.transfer_authorized', 'carbon_registry_transfer',
   'oe_carbon_registry_transfers', 'seed_crt_001', 'demo_carbon_001',
   'transfer_authorized', '["regulator","admin"]',
   22000.0,
   '{"transfer_type":"article6_itmo","tonnes_co2e":22000,"destination_country":"Germany"}',
   datetime('now','-35 days'));

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B: oe_role_action_queue
-- Follow-up actions wired to the correct target role for each cascade event
-- ════════════════════════════════════════════════════════════════════════════

-- Regulator must review STOR filing
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_001', 'regulator', 'demo_regulator_001',
   'market_abuse.stor_filed', 'market_abuse',
   'oe_market_abuse_cases', 'seed_mab_001',
   'STOR filed — review required within 48 h (FSCA)',
   '{"reference":"STOR-2026-0012","suspicion":"layering","trader_id":"demo_trader_001"}',
   '{"action_label":"Open case","target_route":"/regulator-suite/workstation?tab=market_abuse_cases","prefill":{}}',
   'urgent', 'pending',
   datetime('now','2 days'),
   datetime('now','-8 days'), datetime('now','-8 days'));

-- Regulator must process levy enforcement
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_002', 'regulator', 'demo_regulator_001',
   'levy_assessment.enforcement', 'levy_assessment',
   'oe_regulator_levies', 'levy_001',
   'Levy enforcement — R182 400 outstanding (120+ days)',
   '{"licensee":"Limpopo Solar IPP","amount_zar":182400,"days_overdue":122}',
   '{"action_label":"Issue demand","target_route":"/regulator-suite/workstation?tab=levy_assessments","prefill":{}}',
   'high', 'acknowledged',
   datetime('now','-5 days'),
   datetime('now','-10 days'), datetime('now','-9 days'));

-- IPP must acknowledge DSCR covenant breach
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_003', 'ipp_developer', 'demo_ipp_001',
   'dscr.breach_recorded', 'dscr',
   'oe_dscr_monitoring', 'dscr_003',
   'DSCR covenant breach — remediation plan required within 30 days',
   '{"dscr_ratio":1.62,"covenant_floor":1.30,"lender":"DBSA","period":"Q2-2025"}',
   '{"action_label":"Upload remediation plan","target_route":"/ipp-lifecycle/workstation?tab=dscr-reports","prefill":{}}',
   'high', 'pending',
   datetime('now','22 days'),
   datetime('now','-40 days'), datetime('now','-40 days'));

-- Grid must acknowledge load curtailment
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_004', 'grid_operator', 'demo_grid_001',
   'load_curtailment.acknowledgement_required', 'load_curtailment',
   'oe_load_curtailment', 'seed_lcs_001',
   'Curtailment Stage 4 — post-event reconciliation due',
   '{"stage":4,"area":"Limpopo North","duration_hours":4,"target_mw":2.5}',
   '{"action_label":"Submit reconciliation","target_route":"/grid-operator/workstation?tab=load_curtailment","prefill":{}}',
   'normal', 'actioned',
   datetime('now','-18 days'),
   datetime('now','-20 days'), datetime('now','-19 days'));

-- Lender must review IPP COD certification for drawdown release
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_005', 'lender', 'demo_lender_001',
   'cod_chain.cod_certified', 'cod_chain',
   'oe_cod_chain', 'seed-cod-001-ec',
   'COD certified — release retention drawdown (Eastern Cape Wind)',
   '{"project":"Eastern Cape Wind Farm","capacity_mw":150,"cod_date":"2026-04-15"}',
   '{"action_label":"Release drawdown","target_route":"/lender-suite/workstation?tab=drawdown","prefill":{"cod_ref":"seed-cod-001-ec"}}',
   'high', 'pending',
   datetime('now','7 days'),
   datetime('now','-55 days'), datetime('now','-55 days'));

-- Admin must review P1 ticket breach
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_006', 'admin', 'demo_admin_001',
   'support_ticket.escalated_p1', 'support_ticket',
   'oe_support_ticket_events', 'stev_seed_001',
   'P1 SLA breach — TKT-2026-0142 (45 min overdue)',
   '{"ticket_ref":"TKT-2026-0142","client":"Eskom Holdings","breach_minutes":45}',
   '{"action_label":"Assign escalation owner","target_route":"/support/workstation?tab=ticket_chain","prefill":{}}',
   'urgent', 'pending',
   datetime('now','1 day'),
   datetime('now','-5 days'), datetime('now','-5 days'));

-- Carbon fund: buffer pool cancellation required after reversal
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_007', 'carbon_fund', 'demo_carbon_001',
   'carbon_reversal.buffer_cancel_required', 'carbon_reversal',
   'oe_carbon_reversals', 'seed_crev_001',
   'Buffer pool cancellation — 1 200 tCO2e wildfire reversal',
   '{"reversal_tonnes":1200,"project_id":"seed_cproj_001","buffer_pct":5}',
   '{"action_label":"Cancel buffer credits","target_route":"/carbon-registry/workstation?tab=reversal_chain","prefill":{}}',
   'high', 'actioned',
   datetime('now','-40 days'),
   datetime('now','-45 days'), datetime('now','-43 days'));

-- IPP: HSE LTIFR — OHSA s24 notification due within 7 days
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_008', 'ipp_developer', 'demo_ipp_001',
   'hse_incident.ohsa_notification_required', 'hse_incident',
   'oe_hse_incidents', 'hse_seed_002',
   'OHSA s24 notification — LTIFR incident (7-day deadline)',
   '{"severity":"ltifr","site":"Limpopo Solar Park","deadline_days":7}',
   '{"action_label":"Submit OHSA notice","target_route":"/ipp-lifecycle/workstation?tab=hse_chain","prefill":{}}',
   'urgent', 'pending',
   datetime('now','-11 days'),
   datetime('now','-18 days'), datetime('now','-18 days'));

-- Offtaker: REC retirement confirmation required
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_009', 'offtaker', 'demo_offtaker_001',
   'rec_lifecycle.retirement_confirmed', 'rec_lifecycle',
   'oe_rec_lifecycle', 'seed_rec_001',
   'I-REC retirement confirmed — update Scope 2 disclosure',
   '{"mwh":876000,"vintage":"2025","standard":"I-REC","serial_from":"ZA-I-REC-2025-001"}',
   '{"action_label":"Update Scope 2 report","target_route":"/offtaker-suite/workstation?tab=recs","prefill":{}}',
   'normal', 'pending',
   datetime('now','14 days'),
   datetime('now','-2 days'), datetime('now','-2 days'));

-- Grid: reserve activation settled — confirm performance score
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_010', 'grid_operator', 'demo_grid_001',
   'reserve_activation.performance_recorded', 'reserve_activation',
   'oe_reserve_activations', 'seed_resa_001',
   'Reserve activation settled — FCR performance 97.3%',
   '{"service_type":"fcr","capacity_mw":25,"performance_pct":97.3,"settlement_zar":462500}',
   '{"action_label":"View settlement","target_route":"/grid-operator/workstation?tab=ancillary","prefill":{}}',
   'low', 'actioned',
   datetime('now','-7 days'),
   datetime('now','-14 days'), datetime('now','-12 days'));

-- Regulator: SSEG registration complete — update connection register
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_011', 'regulator', 'demo_regulator_001',
   'sseg_registration.registered', 'sseg_registration',
   'oe_sseg_registrations', 'seed_sseg_001',
   'SSEG Schedule 2 registration complete — update NERSA register',
   '{"capacity_kw":500,"municipality":"City of Tshwane","registration_ref":"SSEG-2026-0441"}',
   '{"action_label":"Update register","target_route":"/regulator-suite/workstation?tab=inbox","prefill":{}}',
   'normal', 'pending',
   datetime('now','3 days'),
   datetime('now','-1 day'), datetime('now','-1 day'));

-- IPP: GCA signed — initiate connection energization
INSERT OR IGNORE INTO oe_role_action_queue
  (id, target_role, target_participant_id, source_event, source_chain_key,
   source_entity_type, source_entity_id, title, body_json,
   cross_option_json, priority, status, sla_due_at, created_at, updated_at)
VALUES
  ('raq_012', 'ipp_developer', 'demo_ipp_001',
   'gca.agreement_executed', 'gca',
   'oe_gca_connections', 'seed_gca_001',
   'GCA signed — initiate W75 energization chain',
   '{"connection_voltage_kv":33,"connection_point":"Lephalale 132/33kV","grid_ref":"NTC-2026-00881"}',
   '{"action_label":"Open energization chain","target_route":"/ipp-lifecycle/workstation?tab=gca_chain","prefill":{}}',
   'normal', 'pending',
   datetime('now','14 days'),
   datetime('now','-21 days'), datetime('now','-21 days'));

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION C: Chain _events audit trails
-- One row per key state transition for every chain seeded in 494–499
-- ════════════════════════════════════════════════════════════════════════════

-- ── COD chain events (seed-cod-001-ec Eastern Cape Wind) ─────────────────────
INSERT OR IGNORE INTO oe_cod_chain_events
  (id, cod_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('codE_001', 'seed-cod-001-ec', 'epc_signed', NULL, 'epc_signed',
   'demo_ipp_002', 'EPC contract executed with BuildSA Energy EPC (Pty) Ltd',
   datetime('now','-365 days'));

INSERT OR IGNORE INTO oe_cod_chain_events
  (id, cod_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('codE_002', 'seed-cod-001-ec', 'mechanical_complete', 'epc_signed', 'mechanical_complete',
   'demo_ipp_002', 'All turbines mechanically complete; IE certificate issued',
   datetime('now','-90 days'));

INSERT OR IGNORE INTO oe_cod_chain_events
  (id, cod_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('codE_003', 'seed-cod-001-ec', 'cold_commissioned', 'mechanical_complete', 'cold_commissioned',
   'demo_ipp_002', 'Cold commissioning completed; 14-day reliability run started',
   datetime('now','-55 days'));

-- ── Stage gate events (DG0–DG3 for Limpopo Solar) ───────────────────────────
INSERT OR IGNORE INTO oe_stage_gate_events
  (id, gate_id, event_type, actor_id, actor_party, from_status, to_status,
   payload, regulator_crossed, created_at)
VALUES
  ('sge_001', 'seed-sg-001', 'gate_passed', 'demo_ipp_001', 'ipp_developer',
   'pending', 'gate_passed', '{"gate":"DG0","comment":"Feasibility approved"}', 0,
   datetime('now','-180 days'));

INSERT OR IGNORE INTO oe_stage_gate_events
  (id, gate_id, event_type, actor_id, actor_party, from_status, to_status,
   payload, regulator_crossed, created_at)
VALUES
  ('sge_002', 'seed-sg-002', 'gate_passed', 'demo_ipp_001', 'ipp_developer',
   'pending', 'gate_passed', '{"gate":"DG1","comment":"Financial close achieved"}', 1,
   datetime('now','-120 days'));

INSERT OR IGNORE INTO oe_stage_gate_events
  (id, gate_id, event_type, actor_id, actor_party, from_status, to_status,
   payload, regulator_crossed, created_at)
VALUES
  ('sge_003', 'seed-sg-003', 'gate_passed', 'demo_ipp_001', 'ipp_developer',
   'pending', 'gate_passed', '{"gate":"DG2","comment":"Construction 60% complete; on schedule"}', 0,
   datetime('now','-30 days'));

INSERT OR IGNORE INTO oe_stage_gate_events
  (id, gate_id, event_type, actor_id, actor_party, from_status, to_status,
   payload, regulator_crossed, created_at)
VALUES
  ('sge_004', 'seed-sg-004', 'gate_review_opened', 'demo_admin_001', 'admin',
   'pending', 'under_review', '{"gate":"DG3","comment":"DG3 review initiated — COD readiness check"}', 0,
   datetime('now','-5 days'));

-- ── HSE incident events ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_hse_incident_events
  (id, incident_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('hseE_001', 'hse_seed_001', 'incident_reported', NULL, 'reported',
   'demo_esco_001', 'Near-miss: unguarded rotating equipment, solar tracker motor',
   datetime('now','-35 days'));

INSERT OR IGNORE INTO oe_hse_incident_events
  (id, incident_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('hseE_002', 'hse_seed_001', 'investigation_closed', 'under_investigation', 'closed',
   'demo_esco_001', 'Root cause: missing guard reinstated. No LTIFR. CAPA completed.',
   datetime('now','-28 days'));

INSERT OR IGNORE INTO oe_hse_incident_events
  (id, incident_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('hseE_003', 'hse_seed_002', 'incident_reported', NULL, 'reported',
   'demo_esco_001', 'LTIFR: technician laceration during cable installation. Medical treatment.',
   datetime('now','-18 days'));

INSERT OR IGNORE INTO oe_hse_incident_events
  (id, incident_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('hseE_004', 'hse_seed_002', 'investigation_started', 'reported', 'under_investigation',
   'demo_esco_001', 'OHSA s24 notification sent. Root cause analysis in progress.',
   datetime('now','-17 days'));

INSERT OR IGNORE INTO oe_hse_incident_events
  (id, incident_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('hseE_005', 'hse_seed_003', 'incident_reported', NULL, 'reported',
   'demo_epc_001', 'Environmental: minor diesel spill 20L during genset refuelling. Contained.',
   datetime('now','-10 days'));

INSERT OR IGNORE INTO oe_hse_incident_events
  (id, incident_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('hseE_006', 'hse_seed_003', 'investigation_closed', 'under_investigation', 'closed',
   'demo_epc_001', 'Spill remediated. No soil contamination. NEMA s30 not triggered.',
   datetime('now','-7 days'));

-- ── Warranty claim events ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_warranty_claim_events
  (id, claim_id, event_type, from_status, to_status, sla_window, actor_id, notes, created_at)
VALUES
  ('wcE_001', 'wc_seed_001', 'opened', NULL, 'opened', 'standard', 'demo_esco_001',
   'Inverter failure — Huawei SUN2000-100KTL-M1 output degradation 40%',
   datetime('now','-45 days'));

INSERT OR IGNORE INTO oe_warranty_claim_events
  (id, claim_id, event_type, from_status, to_status, sla_window, actor_id, notes, created_at)
VALUES
  ('wcE_002', 'wc_seed_001', 'submitted', 'triaged', 'submitted', 'standard', 'demo_esco_001',
   'Claim submitted to Huawei SA warranty portal. Ref: HW-WC-2026-00441',
   datetime('now','-43 days'));

INSERT OR IGNORE INTO oe_warranty_claim_events
  (id, claim_id, event_type, from_status, to_status, sla_window, actor_id, notes, created_at)
VALUES
  ('wcE_003', 'wc_seed_001', 'approved', 'review_started', 'approved', 'standard', 'demo_admin_001',
   'OEM approved warranty replacement. Lead time 5 business days.',
   datetime('now','-35 days'));

INSERT OR IGNORE INTO oe_warranty_claim_events
  (id, claim_id, event_type, from_status, to_status, sla_window, actor_id, notes, created_at)
VALUES
  ('wcE_004', 'wc_seed_002', 'opened', NULL, 'opened', 'standard', 'demo_esco_001',
   'Tracker fault — Arctech tracker actuator failure affecting row 14',
   datetime('now','-22 days'));

-- ── PM compliance events ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_pm_compliance_events
  (id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at)
VALUES
  ('pmcE_001', 'pmc_seed_001', 'scheduled', NULL, 'scheduled',
   'demo_esco_001', 'esco', 'Q1 inverter thermal imaging PM scheduled per IEC 62446',
   datetime('now','-60 days'));

INSERT OR IGNORE INTO oe_pm_compliance_events
  (id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at)
VALUES
  ('pmcE_002', 'pmc_seed_001', 'work_completed', 'in_progress', 'completed',
   'demo_esco_001', 'esco', 'PM completed on schedule. No anomalies detected.',
   datetime('now','-55 days'));

INSERT OR IGNORE INTO oe_pm_compliance_events
  (id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at)
VALUES
  ('pmcE_003', 'pmc_seed_003', 'scheduled', NULL, 'scheduled',
   'demo_esco_001', 'esco', 'Annual soiling analysis + IV curve tracing overdue',
   datetime('now','-15 days'));

INSERT OR IGNORE INTO oe_pm_compliance_events
  (id, pm_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at)
VALUES
  ('pmcE_004', 'pmc_seed_003', 'sla_breach', 'scheduled', 'overdue',
   'demo_admin_001', 'admin', 'SLA breach — PM not commenced within window. Escalated to site manager.',
   datetime('now','-3 days'));

-- ── PPA contract chain events (seed_ppa_001 Klerksdorp 200MW) ────────────────
INSERT OR IGNORE INTO oe_ppa_contract_chain_events
  (id, ppa_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ppacE_001', 'seed_ppa_001', 'draft_created', NULL, 'draft',
   'demo_ipp_001', 'PPA draft initiated — Klerksdorp 200 MW Solar',
   datetime('now','-365 days'));

INSERT OR IGNORE INTO oe_ppa_contract_chain_events
  (id, ppa_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ppacE_002', 'seed_ppa_001', 'negotiation_started', 'draft', 'negotiation',
   'demo_offtaker_001', 'Offtaker countered on tariff escalation (CPI+1% vs CPI+2%)',
   datetime('now','-300 days'));

INSERT OR IGNORE INTO oe_ppa_contract_chain_events
  (id, ppa_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ppacE_003', 'seed_ppa_001', 'terms_locked', 'negotiation', 'terms_locked',
   'demo_admin_001', 'Commercial terms agreed. Legal engrossment instructed.',
   datetime('now','-240 days'));

INSERT OR IGNORE INTO oe_ppa_contract_chain_events
  (id, ppa_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ppacE_004', 'seed_ppa_001', 'legal_signed', 'terms_locked', 'legal_signed',
   'demo_ipp_001', 'Both parties signed. NERSA registration filed.',
   datetime('now','-180 days'));

INSERT OR IGNORE INTO oe_ppa_contract_chain_events
  (id, ppa_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ppacE_005', 'seed_ppa_001', 'executed', 'legal_signed', 'executed',
   'demo_admin_001', 'Financial close confirmed. PPA in execution.',
   datetime('now','-120 days'));

INSERT OR IGNORE INTO oe_ppa_contract_chain_events
  (id, ppa_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ppacE_006', 'seed_ppa_001', 'in_force', 'executed', 'in_force',
   'demo_admin_001', 'COD achieved. PPA now live and in-force.',
   datetime('now','-55 days'));

-- ── Permit to work events ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_permit_to_work_events
  (id, permit_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ptwE_001', 'ptw_seed_001', 'permit_issued', NULL, 'issued',
   'demo_esco_001', 'PTW issued for LV inverter maintenance — Row 7, Limpopo Solar',
   datetime('now','-5 days'));

INSERT OR IGNORE INTO oe_permit_to_work_events
  (id, permit_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ptwE_002', 'ptw_seed_002', 'permit_issued', NULL, 'issued',
   'demo_esco_001', 'PTW issued for tracker motor replacement — electrical isolations applied',
   datetime('now','-22 days'));

INSERT OR IGNORE INTO oe_permit_to_work_events
  (id, permit_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('ptwE_003', 'ptw_seed_002', 'permit_closed', 'issued', 'closed',
   'demo_esco_001', 'Work complete. All isolations removed. Site safe.',
   datetime('now','-20 days'));

-- ── DSCR monitoring events ────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_dscr_monitoring_events
  (id, monitoring_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('dscrE_001', 'dscr_001', 'report_filed', NULL, 'certified_clean',
   'demo_lender_001', 'Q4-2024: DSCR 2.12x — clean certificate issued',
   datetime('now','-120 days'));

INSERT OR IGNORE INTO oe_dscr_monitoring_events
  (id, monitoring_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('dscrE_002', 'dscr_002', 'watch_triggered', 'filed', 'watch',
   'demo_lender_001', 'Q1-2025: DSCR 1.81x — approaching covenant floor. Watch status.',
   datetime('now','-80 days'));

INSERT OR IGNORE INTO oe_dscr_monitoring_events
  (id, monitoring_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('dscrE_003', 'dscr_003', 'breach_recorded', 'watch', 'breach_recorded',
   'demo_lender_001', 'Q2-2025: DSCR 1.62x — covenant breach. Remediation plan requested.',
   datetime('now','-40 days'));

-- ── Spare parts provisioning events ──────────────────────────────────────────
INSERT OR IGNORE INTO oe_spare_parts_provisioning_events
  (id, provisioning_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('sppE_001', 'spp_seed_001', 'po_raised', NULL, 'po_raised',
   'demo_esco_001', 'PO raised: 2× Huawei SUN2000-100KTL-M1 inverter modules',
   datetime('now','-40 days'));

INSERT OR IGNORE INTO oe_spare_parts_provisioning_events
  (id, provisioning_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('sppE_002', 'spp_seed_001', 'goods_received', 'in_transit', 'received',
   'demo_esco_001', 'Parts received. QA inspection passed. Added to stock.',
   datetime('now','-30 days'));

INSERT OR IGNORE INTO oe_spare_parts_provisioning_events
  (id, provisioning_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('sppE_003', 'spp_seed_002', 'po_raised', NULL, 'po_raised',
   'demo_esco_001', 'PO raised: Arctech Sky tracker actuator assembly × 4',
   datetime('now','-18 days'));
