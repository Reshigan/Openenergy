-- ═══════════════════════════════════════════════════════════════════════
-- 496_seed_ipp_projects.sql
-- Demo seed: 3 IPP projects + stage gates + risks + submittals + NCRs
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- Migration 496: Seed IPP project data for demo personas demo_ipp_001 / demo_ipp_002.
-- Covers oe_ipp_schedule (3 projects), oe_stage_gates (4 gates for Limpopo Solar),
-- oe_ipp_risks (3 per project = 9 total), oe_ipp_issues (2 active for Limpopo),
-- oe_cod_chain (1 commissioning record for EC Wind), oe_procurement_rfps (1 active RFP
-- for KZN Peaker), oe_ipp_submittal (3 for Limpopo), oe_ipp_rfi (2 for Limpopo),
-- oe_ipp_ncrs (1 for EC Wind).
--
-- Project IDs:
--   seed_proj_001 — Limpopo Solar Park        100 MW PV      demo_ipp_001
--   seed_proj_002 — Eastern Cape Wind Farm    150 MW wind    demo_ipp_002
--   seed_proj_003 — KZN Peaker                50 MW gas      demo_ipp_001
--
-- All INSERT OR IGNORE; tenant_id = 'default'.

-- ═══════════════════════════════════════════════════════════════
-- 1. oe_ipp_schedule
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ipp_schedule (
  id, schedule_number,
  project_id, project_name, project_capacity_mw, project_type,
  procurement_ref, cod_ref, insurance_claim_ref, hse_incident_ref,
  baseline_label, baseline_set_at,
  baseline_total_tasks, baseline_total_duration_days,
  baseline_planned_start, baseline_planned_finish,
  current_planned_finish, contractual_final_milestone_date,
  percent_complete, tasks_completed, tasks_in_progress, tasks_not_started,
  last_progress_update_at,
  planned_value_zar, earned_value_zar, actual_cost_zar,
  budget_at_completion_zar,
  cpi, spi, spi_t,
  schedule_variance_zar, cost_variance_zar,
  schedule_variance_pct, cost_variance_pct,
  critical_path_total_float_days, critical_tasks_count,
  longest_path_duration_days,
  variance_count, rebaseline_count,
  last_variance_at, last_rebaseline_at,
  variance_reason, rebaseline_reason, recovery_plan_summary,
  critical_path_breach, resource_constrained_over_pct_25,
  weather_window_at_risk, community_disruption_threshold_breached,
  EPC_subcontractor_milestone_at_risk,
  current_tier, authority_required, urgency_band, schedule_health_band,
  schedule_completeness_index,
  title, narrative, reason_code,
  suspend_reason, cancel_reason, late_finish_reason,
  current_ball_in_court_party, last_responder_party,
  is_reportable, regulator_relevant, regulator_reason_text,
  chain_status,
  wbs_drafted_at, in_progress_at, status_updated_at,
  variance_detected_at, impact_assessed_at, rebaselined_at,
  recovered_at, completed_at,
  suspended_at, cancelled_at, late_finish_at,
  signoff_at,
  regulator_crossed_at, regulator_inbox_ref, regulator_ref,
  sla_target_hours, sla_deadline_at, last_sla_breach_at,
  sla_breached, escalation_level,
  tenant_id, created_by, created_at, updated_at
) VALUES
-- seed_proj_001: Limpopo Solar Park 100 MW — in_progress construction phase
(
  'seed-ips-001', 'IPS-SEED-0001',
  'seed_proj_001', 'Limpopo Solar Park', 100, 'solar_pv',
  'seed-rfp-001', 'seed-cod-001', NULL, NULL,
  'B0 baseline', '2025-11-01T08:00:00Z',
  420, 480, '2025-11-15', '2027-03-10', '2027-03-10', '2027-03-31',
  38.5, 162, 54, 204, '2026-06-01T16:00:00Z',
  950000000, 918000000, 940000000, 2400000000,
  0.9766, 0.9663, 0.9701,
  -32000000, -22000000, -3.37, -2.39,
  11, 38, 480,
  0, 0, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 1,
  'large', 'portfolio_director', 'medium', 'amber', 55,
  'Limpopo Solar Park — REIPPPP BW5.5 100MW PV in execution',
  'EPC mobilised Nov 2025. Civil works 38% complete. One EPC subcontractor milestone at risk due to grid-connection timing. CPI 0.98 / SPI 0.97.',
  'IN_PROGRESS',
  NULL, NULL, NULL,
  'project_manager', 'scheduler',
  0, 0, NULL,
  'in_progress',
  '2025-10-15T08:00:00Z', '2025-11-15T08:00:00Z', '2026-06-01T16:00:00Z', NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  NULL,
  NULL, NULL, NULL,
  480, '2026-09-01T08:00:00Z', NULL,
  0, 0,
  'default', 'demo_admin_001', '2025-10-15T08:00:00Z', '2026-06-01T16:00:00Z'
),
-- seed_proj_002: Eastern Cape Wind Farm 150 MW — commissioning phase (status_updated)
(
  'seed-ips-002', 'IPS-SEED-0002',
  'seed_proj_002', 'Eastern Cape Wind Farm', 150, 'wind',
  'seed-rfp-002', 'seed-cod-001-ec', NULL, NULL,
  'B0 baseline', '2024-09-01T07:00:00Z',
  580, 540, '2024-09-15', '2026-03-08', '2026-05-30', '2026-04-30',
  94.0, 545, 32, 3, '2026-06-05T09:00:00Z',
  3600000000, 3528000000, 3610000000, 3750000000,
  0.9779, 0.9800, 0.9821,
  -72000000, -82000000, -2.00, -2.28,
  2, 55, 540,
  1, 0, '2026-02-10T09:00:00Z', '2026-01-15T12:00:00Z',
  'Grid synchronisation delay extended commissioning by 52 days past contractual COD',
  'B1 baseline accepted; 52-day extension; NERSA grid-code notice filed',
  'All turbines mechanically complete; grid-sync commissioning tests in final stages',
  1, 0, 0, 0, 0,
  'large', 'portfolio_director', 'high', 'amber', 80,
  'Eastern Cape Wind Farm — 150MW commissioning nearing COD',
  'REIPPPP Bid Window 5 project. 94% complete. Commissioning tests underway post B1 rebaseline. Grid sync delay of 52 days resolved. Targeting COD 2026-05-30.',
  'STATUS_UPDATE',
  NULL, NULL, NULL,
  'project_manager', 'project_manager',
  1, 0, 'REIPPPP s6 rebaseline notification filed with IPPO and NERSA',
  'status_updated',
  '2024-08-15T07:00:00Z', '2024-09-15T07:00:00Z', '2026-06-05T09:00:00Z', '2026-02-10T09:00:00Z', '2026-02-14T11:00:00Z', '2026-01-15T12:00:00Z', NULL, NULL,
  NULL, NULL, NULL,
  NULL,
  '2026-01-15T12:00:00Z', 'reg-inbox-seed-ec-wind', 'IPPO-W112-SEED-EC-WIND',
  480, '2026-06-30T09:00:00Z', NULL,
  0, 0,
  'default', 'demo_admin_001', '2024-08-15T07:00:00Z', '2026-06-05T09:00:00Z'
),
-- seed_proj_003: KZN Peaker 50 MW gas — planning / wbs_drafted
(
  'seed-ips-003', 'IPS-SEED-0003',
  'seed_proj_003', 'KZN Peaker', 50, 'gas_peaker',
  NULL, NULL, NULL, NULL,
  NULL, NULL,
  0, 0, NULL, NULL, NULL, '2028-06-30',
  0, 0, 0, 0, NULL,
  0, 0, 0, 850000000,
  0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0,
  0, 0, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0, 0, 0,
  'large', 'portfolio_director', 'low', 'green', 10,
  'KZN Peaker — 50MW open-cycle gas peaker planning',
  'REIPPPP BW6 gas peaker. WBS draft in progress. EIA and grid study in procurement.',
  'WBS_DRAFT',
  NULL, NULL, NULL,
  'scheduler', 'scheduler',
  0, 0, NULL,
  'wbs_drafted',
  '2026-05-01T08:00:00Z', NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, NULL,
  NULL,
  NULL, NULL, NULL,
  480, '2026-11-01T08:00:00Z', NULL,
  0, 0,
  'default', 'demo_admin_001', '2026-05-01T08:00:00Z', '2026-05-01T08:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 2. oe_stage_gates — 4 gates for Limpopo Solar (seed_proj_001)
--    DG0 archived (passed), DG1 archived (passed),
--    DG2 decision_recorded (active/approved), DG3 gate_proposed (pending)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_stage_gates (
  id, gate_index, project_id, title,
  capex_zar, capex_band, equator_category, debt_sized,
  current_tier,
  floor_equator_cat_a, floor_fid_committed, floor_nersa_notifiable,
  floor_debt_sized, floor_shareholder_consent_required,
  w19_procurement_ref, w20_cod_ref, w21_drawdown_ref, w113_evm_ref, w118_block_ref,
  decision, conditions_payload, evidence_payload,
  ie_letter_attached_bool_live, cab_minutes_attached_bool_live, board_minutes_attached_bool_live,
  chain_status, gate_proposed_at,
  sla_target_hours, sla_deadline_at, sla_breached,
  is_reportable, regulator_ref, regulator_crossed_at,
  created_by, created_at, updated_at
) VALUES
-- DG0 — Concept screening (passed, archived)
(
  'seed-sg-001', 0, 'seed_proj_001',
  'DG0 Concept — Limpopo Solar Park 100MW',
  2400000000, 'mega', 'cat_b', 0, 'mega_capex',
  0, 0, 1, 0, 0,
  NULL, NULL, NULL, NULL, NULL,
  'approved', NULL, '{"concept_note":"r2/lsp-dg0-concept.pdf","site_study":"r2/lsp-site-study.pdf"}',
  1, 1, 1,
  'archived', '2024-06-01T08:00:00Z',
  1440, '2024-08-01T08:00:00Z', 0,
  1, 'W131-SG-DG0-SEED-001', '2024-06-01T10:00:00Z',
  'demo_admin_001', '2024-06-01T08:00:00Z', '2024-07-15T09:00:00Z'
),
-- DG1 — Feasibility (passed, archived)
(
  'seed-sg-002', 1, 'seed_proj_001',
  'DG1 Feasibility — Limpopo Solar Park 100MW',
  2400000000, 'mega', 'cat_b', 0, 'mega_capex',
  0, 0, 0, 0, 1,
  NULL, NULL, NULL, NULL, NULL,
  'approved', NULL, '{"feasibility_report":"r2/lsp-feasibility.pdf","grid_study":"r2/lsp-grid-study.pdf","eia_scoping":"r2/lsp-eia-scoping.pdf"}',
  1, 1, 1,
  'archived', '2024-09-01T08:00:00Z',
  1440, '2024-11-01T08:00:00Z', 0,
  1, 'W131-SG-DG1-SEED-001', '2024-09-01T10:00:00Z',
  'demo_admin_001', '2024-09-01T08:00:00Z', '2024-10-20T11:00:00Z'
),
-- DG2 — FEED / FID-prep (active, decision_recorded — FID approved)
(
  'seed-sg-003', 2, 'seed_proj_001',
  'DG2 FEED / FID-prep — Limpopo Solar Park 100MW',
  2400000000, 'mega', 'cat_b', 1, 'mega_capex',
  0, 0, 0, 1, 1,
  'seed-rfp-001', 'seed-cod-001', NULL, NULL, 'seed-blk-sg003',
  'approved',
  '["ESAP v3 signed off","grid connection agreement executed","lender technical due diligence complete"]',
  '{"feed_report":"r2/lsp-feed.pdf","ie_letter":"r2/lsp-ie-dg2.pdf","cap_table":"r2/lsp-cap-table.pdf"}',
  1, 1, 1,
  'decision_recorded', '2025-04-01T08:00:00Z',
  1440, '2025-07-01T08:00:00Z', 0,
  1, 'W131-SG-DG2-SEED-001', '2025-04-01T10:00:00Z',
  'demo_admin_001', '2025-04-01T08:00:00Z', '2025-05-15T14:00:00Z'
),
-- DG3 — Sanction / REIPPPP bid commitment (pending, gate_proposed)
(
  'seed-sg-004', 3, 'seed_proj_001',
  'DG3 Sanction FID — Limpopo Solar Park 100MW',
  2400000000, 'mega', 'cat_b', 1, 'mega_capex',
  0, 0, 0, 1, 1,
  'seed-rfp-001', 'seed-cod-001', NULL, NULL, NULL,
  NULL, NULL, NULL,
  0, 0, 0,
  'gate_proposed', '2026-06-01T08:00:00Z',
  1440, '2026-09-30T08:00:00Z', 0,
  0, NULL, NULL,
  'demo_admin_001', '2026-06-01T08:00:00Z', '2026-06-01T08:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 3. oe_ipp_risks — 3 risks per project (9 total)
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ipp_risks (
  id, project_id, project_name,
  title, description, risk_category, risk_tier, chain_status,
  probability_score, impact_score, risk_score,
  residual_probability_score, residual_impact_score, residual_risk_score,
  response_strategy, response_plan,
  contingency_reserve_zar,
  risk_owner, assigned_to,
  sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
  is_reportable, regulator_relevant,
  is_safety, is_regulatory,
  floor_board_notify, floor_ep4_action_required, floor_lender_notifiable, floor_nersa_notifiable, floor_insurance_applicable,
  identified_at, assessed_at, response_planned_at, monitoring_at,
  created_by, created_at, updated_at
) VALUES
-- Limpopo Solar (seed_proj_001) — 3 risks
(
  'seed-risk-001', 'seed_proj_001', 'Limpopo Solar Park',
  'Grid connection delay — ESKOM infrastructure backlog',
  'ESKOM substation upgrade required for grid injection. Potential 60-90 day delay if NTP not issued on schedule. Affects COD milestone and PPA commencement.',
  'technical', 'high_impact', 'response_planned',
  4, 4, 16,
  2, 3, 6,
  'mitigate', 'Engage ESKOM dedicated project team; escalate via NERSA Grid Code C-1 process; negotiate interim grid-wheeling arrangement with neighbouring substation.',
  85000000,
  'demo_ipp_001', 'demo_ipp_001',
  720, '2026-09-01T08:00:00Z', 0, 0,
  0, 1,
  0, 1,
  1, 0, 1, 1, 0,
  '2025-11-01T08:00:00Z', '2025-11-15T10:00:00Z', '2025-12-01T10:00:00Z', '2026-01-01T08:00:00Z',
  'demo_admin_001', '2025-11-01T08:00:00Z', '2026-06-01T08:00:00Z'
),
(
  'seed-risk-002', 'seed_proj_001', 'Limpopo Solar Park',
  'EPC cost overrun — steel and cabling price escalation',
  'Global commodity price escalation (steel structures, DC cabling, tracker frames) driving 8-12% cost overrun risk versus B0 budget. CPI tracking 0.97.',
  'financial', 'high_impact', 'monitoring',
  3, 4, 12,
  2, 3, 6,
  'mitigate', 'Fixed-price EPC contract with limited escalation clauses; contingency reserve of R85m; value-engineering review on tracker selection.',
  85000000,
  'demo_ipp_001', 'demo_ipp_001',
  720, '2026-09-01T08:00:00Z', 0, 0,
  0, 0,
  0, 0,
  1, 0, 1, 0, 1,
  '2025-11-01T08:00:00Z', '2025-12-01T10:00:00Z', '2026-01-01T10:00:00Z', '2026-03-01T08:00:00Z',
  'demo_admin_001', '2025-11-01T08:00:00Z', '2026-06-01T08:00:00Z'
),
(
  'seed-risk-003', 'seed_proj_001', 'Limpopo Solar Park',
  'Environmental authorisation condition — ESAP wildlife corridor',
  'DFFE EA condition requires wildlife corridor fencing and monitoring. Non-compliance could trigger stop-work order. ESAP action plan update due Q3 2026.',
  'environmental', 'medium_impact', 'monitoring',
  2, 4, 8,
  1, 3, 3,
  'mitigate', 'Appoint specialist environmental control officer; implement ESAP quarterly reporting; engage community liaison officer for Limpopo villages.',
  12000000,
  'demo_ipp_001', 'demo_ipp_001',
  336, '2026-09-01T08:00:00Z', 0, 0,
  0, 1,
  0, 1,
  0, 1, 0, 1, 0,
  '2025-10-15T08:00:00Z', '2025-11-01T10:00:00Z', '2025-12-15T10:00:00Z', '2026-02-01T08:00:00Z',
  'demo_admin_001', '2025-10-15T08:00:00Z', '2026-06-01T08:00:00Z'
),
-- Eastern Cape Wind Farm (seed_proj_002) — 3 risks
(
  'seed-risk-004', 'seed_proj_002', 'Eastern Cape Wind Farm',
  'Grid synchronisation test failure — protection relay settings',
  'ESKOM protection relay coordination settings require revision. Two synchronisation test failures recorded. Risk of further delay to COD by up to 30 days.',
  'technical', 'high_impact', 'triggered',
  4, 4, 16,
  2, 3, 6,
  'mitigate', 'OEM relay specialist engaged; ESKOM GC review scheduled; parallel track: submit revised settings under NRS 048 emergency review.',
  28000000,
  'demo_ipp_002', 'demo_ipp_002',
  720, '2026-07-01T08:00:00Z', 0, 0,
  0, 1,
  0, 1,
  1, 0, 1, 1, 0,
  '2026-02-01T07:00:00Z', '2026-02-10T10:00:00Z', '2026-02-15T10:00:00Z', '2026-03-01T07:00:00Z',
  'demo_admin_001', '2026-02-01T07:00:00Z', '2026-06-05T09:00:00Z'
),
(
  'seed-risk-005', 'seed_proj_002', 'Eastern Cape Wind Farm',
  'EPC cost overrun — turbine foundation rework due to geotechnical variance',
  'Geotechnical conditions at 6 turbine positions worse than P50 design assumptions. Foundation re-design and rework adds R42m to EPC cost. CPI tracking 0.98.',
  'construction', 'high_impact', 'responding',
  4, 3, 12,
  1, 3, 3,
  'transfer', 'EPC contract variation order submitted; geotechnical professional indemnity insurance claim under W23; IE certifying revised designs.',
  42000000,
  'demo_ipp_002', 'demo_ipp_002',
  720, '2026-07-01T08:00:00Z', 0, 0,
  0, 0,
  0, 0,
  1, 0, 1, 0, 1,
  '2025-10-01T07:00:00Z', '2025-10-15T10:00:00Z', '2025-11-01T10:00:00Z', '2025-12-01T07:00:00Z',
  'demo_admin_001', '2025-10-01T07:00:00Z', '2026-06-05T09:00:00Z'
),
(
  'seed-risk-006', 'seed_proj_002', 'Eastern Cape Wind Farm',
  'DFFE biodiversity offset — Cape Vulture flight path',
  'EA requires 200m buffer around three turbines due to Cape Vulture collision risk per avifauna study. Potential turbine repositioning adds 45 days to construction.',
  'environmental', 'medium_impact', 'response_planned',
  2, 3, 6,
  1, 2, 2,
  'mitigate', 'BirdLife SA curtailment agreement in place; real-time radar curtailment system (DEA-approved); no turbine repositioning required.',
  8000000,
  'demo_ipp_002', 'demo_ipp_002',
  336, '2026-07-01T08:00:00Z', 0, 0,
  0, 1,
  0, 1,
  0, 1, 0, 1, 0,
  '2024-10-01T07:00:00Z', '2024-11-01T10:00:00Z', '2024-12-01T10:00:00Z', '2025-03-01T07:00:00Z',
  'demo_admin_001', '2024-10-01T07:00:00Z', '2026-06-05T09:00:00Z'
),
-- KZN Peaker (seed_proj_003) — 3 risks
(
  'seed-risk-007', 'seed_proj_003', 'KZN Peaker',
  'Gas supply infrastructure — Renergen pipeline availability',
  'REIPPP BW6 gas peaker requires LNG or pipeline gas. Renergen pipeline Phase 2 delayed. Risk that gas supply agreement cannot be executed prior to FID.',
  'commercial', 'high_impact', 'assessed',
  4, 5, 20,
  3, 4, 12,
  'mitigate', 'Dual-fuel (LNG + diesel backup) design. Engage Renergen and Sasol Gas in parallel. Structure PPA with firm gas supply condition precedent.',
  120000000,
  'demo_ipp_001', 'demo_ipp_001',
  720, '2027-06-01T08:00:00Z', 0, 0,
  0, 0,
  0, 0,
  1, 0, 1, 0, 0,
  '2026-04-01T08:00:00Z', '2026-05-15T10:00:00Z', NULL, NULL,
  'demo_admin_001', '2026-04-01T08:00:00Z', '2026-06-01T08:00:00Z'
),
(
  'seed-risk-008', 'seed_proj_003', 'KZN Peaker',
  'NERSA licence — open-cycle gas peaker classification',
  'NERSA may classify 50MW OCGT as Schedule 2 self-generation or require full generation licence under ERA s8. Classification affects tariff regime and timeline.',
  'regulatory', 'high_impact', 'identified',
  3, 5, 15,
  2, 4, 8,
  'escalate', 'Engage NERSA pre-application consultation per ERA s10 process. Obtain legal opinion. Submit Schedule 2 exemption application as fallback.',
  25000000,
  'demo_ipp_001', 'demo_ipp_001',
  720, '2027-01-01T08:00:00Z', 0, 0,
  0, 1,
  0, 1,
  1, 0, 0, 1, 0,
  '2026-05-01T08:00:00Z', NULL, NULL, NULL,
  'demo_admin_001', '2026-05-01T08:00:00Z', '2026-06-01T08:00:00Z'
),
(
  'seed-risk-009', 'seed_proj_003', 'KZN Peaker',
  'EIA timeline — Section 24G application risk',
  'Site has potential heritage and wetland sensitivities. EIA could take 18-24 months if heritage council triggers specialist studies. Risk to BW6 bid timetable.',
  'environmental', 'medium_impact', 'identified',
  3, 3, 9,
  2, 3, 6,
  'mitigate', 'Appoint heritage and wetland specialists immediately. Commission Phase 1 heritage study. Pre-consult with DFFE and KZN Department of Agriculture.',
  8000000,
  'demo_ipp_001', 'demo_ipp_001',
  336, '2027-01-01T08:00:00Z', 0, 0,
  0, 1,
  0, 1,
  0, 0, 0, 1, 0,
  '2026-05-01T08:00:00Z', NULL, NULL, NULL,
  'demo_admin_001', '2026-05-01T08:00:00Z', '2026-06-01T08:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 4. oe_ipp_issues — 2 active issues for Limpopo Solar
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ipp_issues (
  id, project_id, project_name,
  title, description, category, priority, chain_status,
  raised_by, assigned_to, owner_name,
  sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
  is_reportable, regulator_relevant,
  is_safety, is_regulatory, is_commercial, is_lender_notifiable, is_nersa_notifiable,
  rfi_ref, stage_gate_ref,
  raised_at, triaged_at, assigned_at, in_progress_at,
  created_by, created_at, updated_at
) VALUES
(
  'seed-issue-001', 'seed_proj_001', 'Limpopo Solar Park',
  'ESKOM NTP delayed — grid injection not yet confirmed',
  'Notice to Proceed from ESKOM for grid injection point upgrade has not been issued. EPC mobilisation on HV yard is on hold. Affects milestone M12 (HV yard energisation). Issue raised at project progress meeting 2026-05-28.',
  'technical', 'p2_high', 'in_progress',
  'demo_ipp_001', 'demo_ipp_001', 'Limpopo Solar Park PM',
  72, '2026-06-08T09:00:00Z', 0, 0,
  0, 1,
  0, 1, 1, 1, 1,
  NULL, 'seed-sg-003',
  '2026-05-28T09:00:00Z', '2026-05-28T11:00:00Z', '2026-05-28T11:00:00Z', '2026-05-29T08:00:00Z',
  'demo_admin_001', '2026-05-28T09:00:00Z', '2026-05-29T08:00:00Z'
),
(
  'seed-issue-002', 'seed_proj_001', 'Limpopo Solar Park',
  'EPC subcontractor — tracker system supplier quality hold',
  'Single-axis tracker manufacturer placed on quality hold by IE following weld inspection. Affects 3 500 tracker foundations. Resolution requires OEM audit and IE sign-off before installation can resume.',
  'technical', 'p2_high', 'assigned',
  'demo_ipp_001', 'demo_epc_001', 'EPC Quality Manager',
  72, '2026-06-10T14:00:00Z', 0, 0,
  0, 0,
  0, 0, 1, 0, 0,
  'seed-rfi-001', NULL,
  '2026-06-01T14:00:00Z', '2026-06-02T09:00:00Z', '2026-06-02T09:00:00Z', NULL,
  'demo_admin_001', '2026-06-01T14:00:00Z', '2026-06-02T09:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 5. oe_cod_chain — COD milestone for Eastern Cape Wind Farm
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_cod_chain (
  id, cod_number, project_id, participant_id, project_name,
  epc_contract_id, epc_contractor_name,
  capacity_mw, capacity_tier, chain_status,
  target_cod_date, actual_cod_date,
  epc_signed_at, ntp_issued_at, mobilization_at,
  mechanical_complete_at, cold_comm_at, grid_sync_at, reliability_run_at, cod_certified_at,
  ie_certifier, ie_cert_doc_ref, nersa_scada_ref,
  construction_notes,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES
(
  'seed-cod-001-ec', 'COD-SEED-EC-001',
  'seed_proj_002', 'demo_ipp_002', 'Eastern Cape Wind Farm',
  'EPC-EC-WIND-2024-001', 'Consolidated Power Projects (CPP)',
  150, 'large', 'cold_commissioned',
  '2026-04-30', NULL,
  '2024-04-15T09:00:00Z', '2024-07-01T07:00:00Z', '2024-08-01T07:00:00Z',
  '2026-02-28T12:00:00Z', '2026-04-15T10:00:00Z', NULL, NULL, NULL,
  'WSP South Africa (Pty) Ltd', NULL, NULL,
  '150MW wind farm. 41 x Vestas V150-4.2MW turbines. All turbines mechanically complete 2026-02-28. Cold commissioning complete 2026-04-15. Grid synchronisation tests in progress following ESKOM protection relay revision.',
  '2026-06-30T07:00:00Z', 0,
  'demo_admin_001', '2024-04-10T07:00:00Z', '2026-06-05T09:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 6. oe_procurement_rfps — 1 active RFP for KZN Peaker
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_procurement_rfps (
  id, rfp_number, project_id, participant_id,
  title, description, category, capex_tier, capex_estimate_zar, currency,
  chain_status, start_at, bid_open_at, bid_close_at, delivery_due_at,
  evaluation_notes,
  sla_deadline_at, escalation_level,
  created_by, created_at, updated_at
) VALUES
(
  'seed-rfp-kzn-001', 'RFP-KZN-PEAKER-2026-001',
  'seed_proj_003', 'demo_ipp_001',
  'KZN Peaker 50MW OCGT — EPC Contractor Prequalification and RFP',
  'Open-cycle gas turbine peaker plant (50MW, dual-fuel LNG/diesel) in KwaZulu-Natal. REIPPPP BW6 aligned. EPC contractor prequalification and full EPC contract RFP. Includes HV interconnection works and auxiliary systems.',
  'epc', 'high', 850000000, 'ZAR',
  'bid_opened', '2026-05-15T08:00:00Z', '2026-06-01T08:00:00Z', '2026-08-31T16:00:00Z', '2026-09-30T16:00:00Z',
  'Pre-qualification submissions received from 6 EPC contractors: Murray and Roberts Energy, Consolidated Power Projects, WBHO Infrastructure, Aveng, Group Five Power, Bouygues Energies. Evaluation underway.',
  '2026-09-15T08:00:00Z', 0,
  'demo_admin_001', '2026-05-01T08:00:00Z', '2026-06-05T08:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 7. oe_ipp_submittal — 3 submittals for Limpopo Solar
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ipp_submittal (
  id, submittal_number,
  project_id, project_name, project_capacity_mw, project_type,
  schedule_ref,
  submittal_class, submittal_type, discipline, package_code,
  drawing_number, drawing_title, csi_section,
  contractor_name,
  stamp_code, cycle_count,
  contractor_pm_name, reviewer_name, reviewer_party, owner_rep_name,
  long_lead_item, commissioning_critical, regulatory_witness_required,
  lender_information_covenant, dispute_history,
  current_tier, authority_required, urgency_band, submittal_health_band,
  submittal_completeness_index,
  title, narrative, reason_code,
  current_ball_in_court_party, last_responder_party,
  is_reportable, regulator_relevant,
  chain_status,
  contractor_drafted_at, package_assembled_at, submitted_at,
  screening_at, assigned_to_reviewer_at, under_review_at,
  response_drafted_at, stamped_returned_at, closed_out_at, archived_at,
  sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
  hash_chain_position, tenant_id, created_by, created_at, updated_at
) VALUES
-- Submittal 1: DC cabling shop drawings — Stamp A (approved, archived)
(
  'seed-sub-001', 'SUB-SEED-LSP-001',
  'seed_proj_001', 'Limpopo Solar Park', 100, 'solar_pv',
  'seed-ips-001',
  'shop_drawing', 'shop_drawing', 'electrical', 'PKG-LSP-EL-001',
  'LSP-EL-CD-001', 'DC String Cabling Layout — Arrays 1-12', '16 12 20',
  'SunTech EPC JV',
  'A', 1,
  'J. Khumalo', 'Dr A. Meyer', 'engineer', 'B. Naidoo',
  1, 1, 0, 1, 0,
  'shop_drawing', 'engineer', 'medium', 'green', 85,
  'DC String Cabling Layout — Stamp A (Approved)',
  'DC cabling shop drawings for arrays 1-12. Stamp A issued by engineer. Ready for construction. Long-lead cable schedule confirmed.',
  'STAMP_A_APPROVED',
  NULL, 'engineer',
  0, 0,
  'archived',
  '2026-01-10T08:00:00Z', '2026-01-12T10:00:00Z', '2026-01-15T08:00:00Z',
  '2026-01-15T14:00:00Z', '2026-01-16T09:00:00Z', '2026-01-17T08:00:00Z',
  '2026-01-20T16:00:00Z', '2026-01-22T10:00:00Z', '2026-01-25T10:00:00Z', '2026-01-28T10:00:00Z',
  168, '2026-01-29T08:00:00Z', 0, 0,
  1, 'default', 'demo_admin_001', '2026-01-10T08:00:00Z', '2026-01-28T10:00:00Z'
),
-- Submittal 2: Tracker system fabrication drawings — under_review
(
  'seed-sub-002', 'SUB-SEED-LSP-002',
  'seed_proj_001', 'Limpopo Solar Park', 100, 'solar_pv',
  'seed-ips-001',
  'shop_drawing', 'fabrication_drawing', 'structural', 'PKG-LSP-ST-001',
  'LSP-ST-TR-001', 'Single-Axis Tracker Steel Structure — Rows 1-80', '05 12 00',
  'SunTech EPC JV',
  NULL, 1,
  'J. Khumalo', 'P. van der Berg', 'engineer', 'B. Naidoo',
  1, 1, 0, 0, 0,
  'shop_drawing', 'engineer', 'high', 'amber', 60,
  'Tracker Steel Structure — Under Quality Review',
  'Single-axis tracker fabrication drawings under review following IE quality hold on weld inspection. Reviewer verifying compliance with SANS 10162 and OEM specification.',
  'UNDER_REVIEW',
  'engineer', 'doc_controller',
  0, 0,
  'under_review',
  '2026-05-20T08:00:00Z', '2026-05-22T10:00:00Z', '2026-05-25T08:00:00Z',
  '2026-05-25T14:00:00Z', '2026-05-26T09:00:00Z', '2026-05-27T08:00:00Z',
  NULL, NULL, NULL, NULL,
  168, '2026-06-08T08:00:00Z', 0, 0,
  2, 'default', 'demo_admin_001', '2026-05-20T08:00:00Z', '2026-05-27T08:00:00Z'
),
-- Submittal 3: HV transformer protection relay settings — rejected (Stamp E)
(
  'seed-sub-003', 'SUB-SEED-LSP-003',
  'seed_proj_001', 'Limpopo Solar Park', 100, 'solar_pv',
  'seed-ips-001',
  'critical_safety', 'relay_settings_document', 'electrical', 'PKG-LSP-HV-001',
  'LSP-EL-HV-PR-001', 'HV Transformer Protection Relay Settings Calc', '26 36 00',
  'SunTech EPC JV',
  'E', 2,
  'J. Khumalo', 'Dr A. Meyer', 'engineer', 'B. Naidoo',
  0, 1, 1, 1, 1,
  'critical_safety', 'owner_rep', 'critical', 'red', 40,
  'HV Protection Relay Settings — Stamp E (Rejected) Cycle 2',
  'Relay protection coordination study failed ESKOM Grid Code NRS 048 requirements. Stamp E issued. Resubmission required with updated fault level calculations and ESKOM standard relay curves.',
  'STAMP_E_REJECTION_CRITICAL',
  'contractor_PM', 'engineer',
  1, 1,
  'rejected',
  '2026-03-01T08:00:00Z', '2026-03-03T10:00:00Z', '2026-03-05T08:00:00Z',
  '2026-03-05T14:00:00Z', '2026-03-06T09:00:00Z', '2026-03-07T08:00:00Z',
  '2026-03-15T16:00:00Z', '2026-03-18T10:00:00Z', NULL, NULL,
  24, '2026-03-06T08:00:00Z', 0, 1,
  3, 'default', 'demo_admin_001', '2026-03-01T08:00:00Z', '2026-03-18T10:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 8. oe_ipp_rfi — 2 RFIs for Limpopo Solar
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ipp_rfi (
  id, rfi_number,
  project_id, project_name, project_capacity_mw, project_type,
  schedule_ref,
  rfi_class, rfi_type, discipline, package_code,
  drawing_number, spec_section, csi_section,
  contractor_name, question_short, question_long,
  contractor_pm_name, responder_name, responder_party, owner_rep_name,
  current_ball_in_court_party, last_responder_party,
  safety_hazard_identified, construction_stoppage_in_effect,
  contractor_claim_basis, dispute_basis_referenced, regulatory_inquiry_triggered,
  cost_impact_zar, schedule_impact_days,
  current_tier, authority_required, urgency_band, rfi_health_band,
  rfi_completeness_index, rfi_age_days, escalation_count,
  title, reason_code,
  is_reportable, regulator_relevant,
  chain_status,
  question_drafted_at, submitted_at, triage_at, assigned_to_responder_at,
  research_in_progress_at,
  sla_target_hours, sla_deadline_at, sla_breached, escalation_level,
  hash_chain_position, tenant_id, created_by, created_at, updated_at
) VALUES
-- RFI 1: Tracker foundation bolt specification — coordination (research_in_progress)
(
  'seed-rfi-001', 'RFI-SEED-LSP-001',
  'seed_proj_001', 'Limpopo Solar Park', 100, 'solar_pv',
  'seed-ips-001',
  'coordination', 'clarification', 'structural', 'PKG-LSP-ST-001',
  'LSP-ST-TR-001', 'Section 05 12 00', '05 12 00',
  'SunTech EPC JV',
  'Tracker foundation anchor bolt grade and coating specification',
  'The tracker OEM (NEXTracker NX Horizon) specifies HDG M30 Grade 8.8 anchor bolts. Civil specification section 03 30 00 table 3 requires Grade 10.9 stainless Class 316L. Conflict between OEM and civil spec. Which governs? Does substitution require IE approval and revised calc?',
  'J. Khumalo', 'P. van der Berg', 'engineer', 'B. Naidoo',
  'engineer', 'doc_controller',
  0, 0, 0, 0, 0,
  8500000, 7,
  'coordination', 'engineer', 'medium', 'amber',
  65, 9, 0,
  'Tracker anchor bolt grade conflict — OEM vs civil spec',
  'COORDINATION',
  0, 0,
  'research_in_progress',
  '2026-05-28T14:00:00Z', '2026-05-29T08:00:00Z', '2026-05-29T11:00:00Z', '2026-05-30T09:00:00Z',
  '2026-05-30T09:00:00Z',
  72, '2026-06-01T08:00:00Z', 0, 0,
  1, 'default', 'demo_admin_001', '2026-05-28T14:00:00Z', '2026-05-30T09:00:00Z'
),
-- RFI 2: HV cable duct congestion — construction_blocking (escalated)
(
  'seed-rfi-002', 'RFI-SEED-LSP-002',
  'seed_proj_001', 'Limpopo Solar Park', 100, 'solar_pv',
  'seed-ips-001',
  'construction_blocking', 'design_issue', 'electrical', 'PKG-LSP-HV-001',
  'LSP-EL-HV-CD-002', 'Section 26 05 00', '26 05 00',
  'SunTech EPC JV',
  'HV cable duct bank congestion at substation interface — design clash with civil drainage',
  'HV 132kV cable duct bank entering substation compound conflicts with ESKOM-specified drainage channel at chainage 0+45m. As-built survey shows drainage 350mm higher than design. EPC cannot proceed with cable duct installation until clash is resolved. Works on HV bay 2 are stopped. Request immediate engineer instruction on alignment change or drainage modification.',
  'J. Khumalo', 'Dr A. Meyer', 'engineer', 'B. Naidoo',
  'engineer', 'contractor_PM',
  0, 1, 1, 0, 1,
  15000000, 14,
  'construction_blocking', 'engineer', 'critical', 'red',
  45, 4, 1,
  'HV cable duct / drainage clash — construction stoppage at substation interface',
  'CONSTRUCTION_BLOCKING_CLAIM',
  0, 1,
  'escalated',
  '2026-06-02T07:00:00Z', '2026-06-02T08:00:00Z', '2026-06-02T09:00:00Z', '2026-06-02T10:00:00Z',
  '2026-06-02T10:00:00Z',
  24, '2026-06-03T08:00:00Z', 0, 1,
  2, 'default', 'demo_admin_001', '2026-06-02T07:00:00Z', '2026-06-02T12:00:00Z'
);

-- ═══════════════════════════════════════════════════════════════
-- 9. oe_ipp_ncrs — 1 NCR for Eastern Cape Wind Farm
-- ═══════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ipp_ncrs (
  id, project_id, project_name, ncr_number,
  chain_status, ncr_category, ncr_severity, discipline,
  work_area, specification_ref,
  description, detected_by, detection_method,
  disposition, rework_scope, corrective_action,
  rework_cost_zar, schedule_impact_days,
  floor_ie_notification_required, floor_lender_consent_required,
  floor_nersa_reportable, floor_hold_point_triggered, floor_safety_stop_work,
  sla_target_hours, sla_deadline_at, sla_breached,
  is_reportable, regulator_ref,
  raised_at, acknowledged_at, under_investigation_at, disposition_proposed_at,
  created_by, created_at, updated_at
) VALUES
(
  'seed-ncr-001', 'seed_proj_002', 'Eastern Cape Wind Farm', 'ECW-NCR-2026-001',
  'disposition_proposed',
  'workmanship', 'structural', 'civil',
  'Turbine Foundation T-17', 'SANS 2001-CC1:2005 Table 4 / IEC 61400-6:2022 Sec.8',
  'Foundation pour for turbine T-17 exhibits honeycombing on the north face of the pedestal ring beam between elevations +0.45m and +0.95m above finished floor level. Affected area approximately 0.8m x 0.4m. Core samples taken 2026-05-20 show compressive strength 26 MPa vs 35 MPa specified in the structural design. IE hold point triggered.',
  'WSP South Africa site inspector during scheduled hold-point inspection',
  'inspection',
  'repair',
  'Chipping out honeycombed concrete to 50mm minimum sound concrete. Apply class C50/60 repair mortar (BASF MasterEmaco S488 or equivalent). Re-profile to match design geometry. Re-test to confirm 35 MPa design strength post-repair.',
  'Specialist structural repair contractor to be appointed. Repair to be witnessed by IE. Load test to be conducted post-repair per IEC 61400-6 Annex E hold point procedure.',
  850000, 5,
  1, 0, 0, 1, 0,
  168, '2026-06-12T10:00:00Z', 0,
  0, NULL,
  '2026-05-20T11:00:00Z', '2026-05-20T14:00:00Z', '2026-05-21T09:00:00Z', '2026-05-28T16:00:00Z',
  'demo_admin_001', '2026-05-20T11:00:00Z', '2026-05-28T16:00:00Z'
);
