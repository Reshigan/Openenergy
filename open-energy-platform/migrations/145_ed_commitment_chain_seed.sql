-- Wave 27 seed: 11 ED commitment cases — one per lifecycle state + tier coverage
-- Cross-wave: ed_006 cure dispatched via W16 wo_2026_0091
-- Reference SQL: no underscore digit separators (SQLite limitation)

-- ed_001 baseline_locked — community_trust @ BW6 (just-signed project, monitoring not yet activated)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  variance_threshold_pct, chain_status, baseline_locked_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_001', 'ED-BW6-2026-0001', 'prj_kruisvallei', 'Kruisvallei 75MW Wind', 'BW6',
  'community_trust', 'Community trust beneficiary distribution',
  4500, 'count', '2026-Q2',
  -5.0, 'baseline_locked', '2026-05-15T09:00:00Z',
  '2026-05-22T09:00:00Z', 'ipp@openenergy.co.za'
);

-- ed_002 monitoring — ownership @ BW5 (on-track 35% B-BBEE ownership)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  chain_status, baseline_locked_at, monitoring_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_002', 'ED-BW5-2026-0002', 'prj_loeriesfontein2', 'Loeriesfontein 2 144MW Wind', 'BW5',
  'ownership', 'Black ownership %',
  35.0, 'percent', '2026-Q1',
  35.4, 1.14, -5.0,
  'monitoring', '2024-08-15T09:00:00Z', '2024-09-01T09:00:00Z',
  '2026-08-30T09:00:00Z', 'ipp@openenergy.co.za'
);

-- ed_003 variance_flagged — local_content (REIPPPP high-scoring, -8% variance)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_003', 'ED-BW5-2026-0003', 'prj_redcap_kouga', 'Red Cap Kouga 90MW Wind', 'BW5',
  'local_content', 'Local content %',
  45.0, 'percent', '2026-Q1',
  41.4, -8.0, -5.0,
  'variance_flagged', '2024-06-20T09:00:00Z', '2024-07-15T09:00:00Z', '2026-05-15T11:00:00Z',
  '2026-05-29T11:00:00Z', 'ipp@openenergy.co.za'
);

-- ed_004 cure_plan_required — ownership @ BW6 (high-scoring, IPPO 30d cure window)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at, cure_plan_required_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_004', 'ED-BW6-2026-0004', 'prj_aggeneys', 'Aggeneys 80MW Wind', 'BW6',
  'ownership', 'Black ownership %',
  40.0, 'percent', '2026-Q1',
  33.6, -16.0, -5.0,
  'IPPO', 'IPPO-ED-2026-0142',
  'cure_plan_required', '2025-03-12T09:00:00Z', '2025-04-01T09:00:00Z', '2026-04-28T10:00:00Z', '2026-05-10T14:00:00Z',
  '2026-06-09T14:00:00Z', 'ipp@openenergy.co.za'
);

-- ed_005 cure_plan_submitted — jobs (mid-tier, 30-day IPPO review)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  cure_plan_summary, cure_plan_filed_at,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  cure_plan_required_at, cure_plan_submitted_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_005', 'ED-BW5-2026-0005', 'prj_roggeveld', 'Roggeveld 147MW Wind', 'BW5',
  'jobs', 'Direct FTE jobs',
  280, 'fte', '2026-Q1',
  248, -11.4, -5.0,
  'Local hiring drive + retraining programme @ Sutherland; targets +35 FTE by 2026-Q3', '2026-05-08T10:30:00Z',
  'IPPO', 'IPPO-ED-2026-0089',
  'cure_plan_submitted', '2023-09-14T09:00:00Z', '2023-10-01T09:00:00Z', '2026-04-15T10:00:00Z',
  '2026-04-22T10:00:00Z', '2026-05-08T10:30:00Z',
  '2026-05-22T10:30:00Z', 'ipp@openenergy.co.za'
);

-- ed_006 cure_executing — local_content (REIPPPP high, 180d cure, linked to W16 work order)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  cure_plan_summary, cure_plan_filed_at, cure_plan_approved_at,
  remediation_summary, linked_wo_id,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  cure_plan_required_at, cure_plan_submitted_at, cure_executing_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_006', 'ED-BW5-2026-0006', 'prj_redcap_kouga', 'Red Cap Kouga 90MW Wind', 'BW5',
  'local_content', 'Local content %',
  45.0, 'percent', '2026-Q1',
  41.4, -8.0, -5.0,
  'Switch tower-internals supplier to local fabricator @ Coega IDZ; phased ramp Q2→Q3.', '2025-12-15T09:00:00Z', '2026-01-12T11:30:00Z',
  'Coega IDZ supplier contract signed 2026-01-22; Phase 1 (40%) delivered 2026-04-30; Phase 2 commissioning in flight.', 'wo_2026_0091',
  'IPPO;DTI', 'IPPO-ED-2025-0421',
  'cure_executing', '2024-06-20T09:00:00Z', '2024-07-15T09:00:00Z', '2025-11-08T10:00:00Z',
  '2025-11-20T10:00:00Z', '2025-12-15T09:00:00Z', '2026-01-12T11:30:00Z',
  '2026-07-11T11:30:00Z', 'ipp@openenergy.co.za'
);

-- ed_007 verified_compliant — skills (training spend back on track)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  cure_plan_summary, cure_plan_filed_at, cure_plan_approved_at,
  remediation_summary,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  cure_plan_required_at, cure_plan_submitted_at, cure_executing_at, verified_compliant_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_007', 'ED-BW5-2026-0007', 'prj_roggeveld', 'Roggeveld 147MW Wind', 'BW5',
  'skills', 'Skills development spend %',
  2.5, 'percent', '2026-Q1',
  2.61, 4.4, -5.0,
  'Doubled annual artisan programme intake from 12→24 trainees', '2025-08-10T10:00:00Z', '2025-08-25T11:00:00Z',
  'Q4 2025 training spend recovered to 2.4%; Q1 2026 closed at 2.61% — fully back on baseline.',
  'IPPO', 'IPPO-ED-2025-0312',
  'verified_compliant', '2023-09-14T09:00:00Z', '2023-10-01T09:00:00Z', '2025-06-12T10:00:00Z',
  '2025-06-25T10:00:00Z', '2025-08-10T10:00:00Z', '2025-08-25T11:00:00Z', '2026-05-10T14:00:00Z',
  '2026-05-24T14:00:00Z', 'ipp@openenergy.co.za'
);

-- ed_008 penalty_issued — local_content (REIPPPP high-scoring, R6.8m penalty)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  cure_plan_summary, cure_plan_filed_at, cure_plan_approved_at,
  remediation_summary,
  penalty_amount_zar, penalty_ref,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  cure_plan_required_at, cure_plan_submitted_at, cure_executing_at, penalty_issued_at,
  sla_deadline_at, created_by
) VALUES (
  'ed_008', 'ED-BW4-2026-0008', 'prj_xina_solar_one', 'Xina Solar One 100MW CSP', 'BW4',
  'local_content', 'Local content %',
  50.0, 'percent', '2026-Q1',
  39.5, -21.0, -5.0,
  'Supplier substitution + phased fabrication transfer', '2024-11-12T10:00:00Z', '2024-12-04T11:00:00Z',
  'Cure plan failed to deliver — Phase 1 ramp missed by 14 weeks; IPPO determined material non-compliance.',
  6800000.00, 'DMRE-PEN-2026-0014',
  'DMRE', 'IPPO-ED-2024-0567;DMRE-ENF-2026-0021',
  'penalty_issued', '2018-03-15T09:00:00Z', '2018-04-01T09:00:00Z', '2024-09-08T10:00:00Z',
  '2024-09-22T10:00:00Z', '2024-11-12T10:00:00Z', '2024-12-04T11:00:00Z', '2026-05-12T15:00:00Z',
  '2026-07-11T15:00:00Z', 'ipp@openenergy.co.za'
);

-- ed_009 escalated — ownership (REIPPPP highest scoring, DTI enforcement referral)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  cure_plan_summary, cure_plan_filed_at, cure_plan_approved_at,
  remediation_summary,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  cure_plan_required_at, cure_plan_submitted_at, cure_executing_at, escalated_at,
  sla_deadline_at, escalation_level, created_by
) VALUES (
  'ed_009', 'ED-BW3-2026-0009', 'prj_mainstream_jeff', 'Mainstream Jeffreys Bay 138MW Wind', 'BW3',
  'ownership', 'Black ownership %',
  30.0, 'percent', '2026-Q1',
  18.2, -39.3, -5.0,
  'Equity injection from BEE shareholder pool — declined by lender protocol', '2024-06-15T10:00:00Z', '2024-07-08T11:00:00Z',
  'Cure plan executed only 4% of 12% gap; shareholder dilution dispute referred to DTI Codes Council.',
  'DTI;IPPO', 'IPPO-ED-2024-0301;DTI-CODES-2026-0007',
  'escalated', '2015-11-10T09:00:00Z', '2015-12-01T09:00:00Z', '2024-04-05T10:00:00Z',
  '2024-04-22T10:00:00Z', '2024-06-15T10:00:00Z', '2024-07-08T11:00:00Z', '2026-05-16T11:00:00Z',
  '2026-11-12T11:00:00Z', 2, 'ipp@openenergy.co.za'
);

-- ed_010 closed (compliant) — enterprise_dev (qualifying BEE supplier spend back to target)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  cure_plan_summary, cure_plan_filed_at, cure_plan_approved_at,
  remediation_summary,
  regulator_authority, regulator_ref,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  cure_plan_required_at, cure_plan_submitted_at, cure_executing_at,
  verified_compliant_at, closed_at, closure_notes,
  sla_deadline_at, created_by
) VALUES (
  'ed_010', 'ED-BW5-2026-0010', 'prj_kangnas', 'Kangnas 140MW Wind', 'BW5',
  'enterprise_dev', 'Qualifying BEE supplier spend %',
  3.0, 'percent', '2025-Q4',
  3.12, 4.0, -5.0,
  'BEE supplier onboarding accelerator', '2024-08-02T10:00:00Z', '2024-08-18T11:00:00Z',
  'Onboarded 14 qualifying BEE suppliers; spend recovered to 3.12% by Q4 2025.',
  'IPPO', 'IPPO-ED-2024-0188',
  'closed', '2019-11-20T09:00:00Z', '2019-12-01T09:00:00Z', '2024-05-10T10:00:00Z',
  '2024-05-22T10:00:00Z', '2024-08-02T10:00:00Z', '2024-08-18T11:00:00Z',
  '2026-03-04T14:00:00Z', '2026-03-18T14:00:00Z', 'Verified compliant by IPPO 2026-03; case closed clean.',
  NULL, 'ipp@openenergy.co.za'
);

-- ed_011 false_alarm — socio_economic (reporting-data error; community spend was already on baseline)
INSERT OR IGNORE INTO oe_ed_commitments (
  id, case_number, project_id, project_name, bid_window,
  commitment_type, commitment_label, baseline_value, baseline_unit, reporting_period,
  current_value, variance_pct, variance_threshold_pct,
  chain_status, baseline_locked_at, monitoring_at, variance_flagged_at,
  false_alarm_at, closed_at, closure_notes,
  sla_deadline_at, created_by
) VALUES (
  'ed_011', 'ED-BW6-2026-0011', 'prj_garob', 'Garob 145MW Wind', 'BW6',
  'socio_economic', 'Community spend %',
  1.5, 'percent', '2026-Q1',
  1.52, 1.3, -5.0,
  'false_alarm', '2024-09-12T09:00:00Z', '2024-10-01T09:00:00Z', '2026-05-09T10:00:00Z',
  '2026-05-12T16:00:00Z', '2026-05-13T09:00:00Z', 'Quarterly variance flagged on stale data; reconciled Q1 figure shows spend at 1.52% (+1.3% variance).',
  NULL, 'ipp@openenergy.co.za'
);

-- Audit events for happy-path cases

-- ed_002 monitoring activation
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_002_1', 'ed_002', 'ed_commitment.monitoring', 'baseline_locked', 'monitoring', 'ipp@openenergy.co.za', 'Monitoring activated after baseline lock', '2024-09-01T09:00:00Z');

-- ed_003 variance flag (recent)
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_003_1', 'ed_003', 'ed_commitment.monitoring',        'baseline_locked',  'monitoring',       'ipp@openenergy.co.za', 'Monitoring activated', '2024-07-15T09:00:00Z'),
  ('eve_ed_003_2', 'ed_003', 'ed_commitment.variance_flagged', 'monitoring',        'variance_flagged', 'ipp@openenergy.co.za', 'Q1 2026 local content at 41.4% vs 45% baseline (-8%)', '2026-05-15T11:00:00Z');

-- ed_004 cure_plan_required
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_004_1', 'ed_004', 'ed_commitment.monitoring',          'baseline_locked',    'monitoring',         'ipp@openenergy.co.za', 'Monitoring activated', '2025-04-01T09:00:00Z'),
  ('eve_ed_004_2', 'ed_004', 'ed_commitment.variance_flagged',   'monitoring',          'variance_flagged',   'ipp@openenergy.co.za', 'Q1 2026 black ownership at 33.6% vs 40% baseline (-16%)', '2026-04-28T10:00:00Z'),
  ('eve_ed_004_3', 'ed_004', 'ed_commitment.cure_plan_required', 'variance_flagged',    'cure_plan_required', 'admin@openenergy.co.za', 'IPPO required cure plan within 30 days (IPPO-ED-2026-0142)', '2026-05-10T14:00:00Z');

-- ed_005 cure_plan_submitted
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_005_1', 'ed_005', 'ed_commitment.monitoring',           'baseline_locked',    'monitoring',          'ipp@openenergy.co.za', 'Monitoring activated', '2023-10-01T09:00:00Z'),
  ('eve_ed_005_2', 'ed_005', 'ed_commitment.variance_flagged',    'monitoring',          'variance_flagged',    'ipp@openenergy.co.za', 'Q1 2026 FTE at 248 vs 280 baseline (-11.4%)', '2026-04-15T10:00:00Z'),
  ('eve_ed_005_3', 'ed_005', 'ed_commitment.cure_plan_required',  'variance_flagged',    'cure_plan_required',  'admin@openenergy.co.za', 'IPPO required cure plan (IPPO-ED-2026-0089)', '2026-04-22T10:00:00Z'),
  ('eve_ed_005_4', 'ed_005', 'ed_commitment.cure_plan_submitted', 'cure_plan_required',  'cure_plan_submitted', 'ipp@openenergy.co.za', 'Local hiring drive + retraining @ Sutherland; +35 FTE by 2026-Q3', '2026-05-08T10:30:00Z');

-- ed_006 cure_executing with WO link (W16)
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_006_1', 'ed_006', 'ed_commitment.monitoring',           'baseline_locked',    'monitoring',          'ipp@openenergy.co.za', 'Monitoring activated', '2024-07-15T09:00:00Z'),
  ('eve_ed_006_2', 'ed_006', 'ed_commitment.variance_flagged',    'monitoring',          'variance_flagged',    'ipp@openenergy.co.za', 'Q4 2025 LC at 39.8% vs 45% baseline (-11.6%)', '2025-11-08T10:00:00Z'),
  ('eve_ed_006_3', 'ed_006', 'ed_commitment.cure_plan_required',  'variance_flagged',    'cure_plan_required',  'admin@openenergy.co.za', 'IPPO + DTI required cure plan (IPPO-ED-2025-0421)', '2025-11-20T10:00:00Z'),
  ('eve_ed_006_4', 'ed_006', 'ed_commitment.cure_plan_submitted', 'cure_plan_required',  'cure_plan_submitted', 'ipp@openenergy.co.za', 'Coega IDZ supplier substitution plan filed', '2025-12-15T09:00:00Z'),
  ('eve_ed_006_5', 'ed_006', 'ed_commitment.cure_executing',      'cure_plan_submitted', 'cure_executing',      'admin@openenergy.co.za', 'IPPO approved plan; WO wo_2026_0091 dispatched for supplier qualification (R2.94M)', '2026-01-12T11:30:00Z');

-- ed_007 verified_compliant (full clean chain)
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_007_1', 'ed_007', 'ed_commitment.monitoring',          'baseline_locked',     'monitoring',         'ipp@openenergy.co.za', 'Monitoring activated', '2023-10-01T09:00:00Z'),
  ('eve_ed_007_2', 'ed_007', 'ed_commitment.variance_flagged',   'monitoring',           'variance_flagged',   'ipp@openenergy.co.za', 'Q2 2025 skills spend at 2.1% vs 2.5% baseline (-16%)', '2025-06-12T10:00:00Z'),
  ('eve_ed_007_3', 'ed_007', 'ed_commitment.cure_plan_required', 'variance_flagged',     'cure_plan_required', 'admin@openenergy.co.za', 'IPPO cure plan required (IPPO-ED-2025-0312)', '2025-06-25T10:00:00Z'),
  ('eve_ed_007_4', 'ed_007', 'ed_commitment.cure_plan_submitted','cure_plan_required',   'cure_plan_submitted','ipp@openenergy.co.za', 'Artisan programme doubled (12→24 intake)', '2025-08-10T10:00:00Z'),
  ('eve_ed_007_5', 'ed_007', 'ed_commitment.cure_executing',     'cure_plan_submitted',  'cure_executing',     'admin@openenergy.co.za', 'IPPO approved plan', '2025-08-25T11:00:00Z'),
  ('eve_ed_007_6', 'ed_007', 'ed_commitment.verified_compliant', 'cure_executing',       'verified_compliant', 'compliance@openenergy.co.za', 'Q1 2026 spend at 2.61% — fully back on baseline', '2026-05-10T14:00:00Z');

-- ed_008 penalty_issued chain
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_008_1', 'ed_008', 'ed_commitment.monitoring',           'baseline_locked',    'monitoring',          'ipp@openenergy.co.za', 'Monitoring activated', '2018-04-01T09:00:00Z'),
  ('eve_ed_008_2', 'ed_008', 'ed_commitment.variance_flagged',    'monitoring',          'variance_flagged',    'ipp@openenergy.co.za', 'Q3 2024 LC at 39.5% vs 50% baseline (-21%)', '2024-09-08T10:00:00Z'),
  ('eve_ed_008_3', 'ed_008', 'ed_commitment.cure_plan_required',  'variance_flagged',    'cure_plan_required',  'admin@openenergy.co.za', 'IPPO cure plan required (IPPO-ED-2024-0567)', '2024-09-22T10:00:00Z'),
  ('eve_ed_008_4', 'ed_008', 'ed_commitment.cure_plan_submitted', 'cure_plan_required',  'cure_plan_submitted', 'ipp@openenergy.co.za', 'Supplier substitution plan filed', '2024-11-12T10:00:00Z'),
  ('eve_ed_008_5', 'ed_008', 'ed_commitment.cure_executing',      'cure_plan_submitted', 'cure_executing',      'admin@openenergy.co.za', 'IPPO approved plan', '2024-12-04T11:00:00Z'),
  ('eve_ed_008_6', 'ed_008', 'ed_commitment.penalty_issued',      'cure_executing',      'penalty_issued',      'admin@openenergy.co.za', 'DMRE issued R6.8m material non-compliance penalty (DMRE-PEN-2026-0014)', '2026-05-12T15:00:00Z');

-- ed_009 escalated chain (with sla_breach event)
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_009_1', 'ed_009', 'ed_commitment.monitoring',          'baseline_locked',     'monitoring',          'ipp@openenergy.co.za', 'Monitoring activated', '2015-12-01T09:00:00Z'),
  ('eve_ed_009_2', 'ed_009', 'ed_commitment.variance_flagged',   'monitoring',           'variance_flagged',    'ipp@openenergy.co.za', 'Q1 2024 ownership at 18.2% vs 30% baseline (-39.3%)', '2024-04-05T10:00:00Z'),
  ('eve_ed_009_3', 'ed_009', 'ed_commitment.cure_plan_required', 'variance_flagged',     'cure_plan_required',  'admin@openenergy.co.za', 'IPPO cure plan required (IPPO-ED-2024-0301)', '2024-04-22T10:00:00Z'),
  ('eve_ed_009_4', 'ed_009', 'ed_commitment.cure_plan_submitted','cure_plan_required',   'cure_plan_submitted', 'ipp@openenergy.co.za', 'Equity injection plan filed (lender approval pending)', '2024-06-15T10:00:00Z'),
  ('eve_ed_009_5', 'ed_009', 'ed_commitment.cure_executing',     'cure_plan_submitted',  'cure_executing',      'admin@openenergy.co.za', 'IPPO approved plan with lender consent caveat', '2024-07-08T11:00:00Z'),
  ('eve_ed_009_6', 'ed_009', 'ed_commitment.escalated',          'cure_executing',       'escalated',           'admin@openenergy.co.za', 'Cure delivered only 4% of 12% gap; referred to DTI Codes Council (DTI-CODES-2026-0007)', '2026-05-16T11:00:00Z');

-- ed_010 closed (compliant) full clean chain
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_010_1', 'ed_010', 'ed_commitment.monitoring',          'baseline_locked',     'monitoring',          'ipp@openenergy.co.za', 'Monitoring activated', '2019-12-01T09:00:00Z'),
  ('eve_ed_010_2', 'ed_010', 'ed_commitment.variance_flagged',   'monitoring',           'variance_flagged',    'ipp@openenergy.co.za', 'Q1 2024 BEE supplier spend at 2.65% vs 3.0% baseline (-11.7%)', '2024-05-10T10:00:00Z'),
  ('eve_ed_010_3', 'ed_010', 'ed_commitment.cure_plan_required', 'variance_flagged',     'cure_plan_required',  'admin@openenergy.co.za', 'IPPO cure plan required (IPPO-ED-2024-0188)', '2024-05-22T10:00:00Z'),
  ('eve_ed_010_4', 'ed_010', 'ed_commitment.cure_plan_submitted','cure_plan_required',   'cure_plan_submitted', 'ipp@openenergy.co.za', 'BEE supplier onboarding accelerator filed', '2024-08-02T10:00:00Z'),
  ('eve_ed_010_5', 'ed_010', 'ed_commitment.cure_executing',     'cure_plan_submitted',  'cure_executing',      'admin@openenergy.co.za', 'IPPO approved plan', '2024-08-18T11:00:00Z'),
  ('eve_ed_010_6', 'ed_010', 'ed_commitment.verified_compliant', 'cure_executing',       'verified_compliant',  'compliance@openenergy.co.za', '14 BEE suppliers onboarded; Q4 2025 spend at 3.12%', '2026-03-04T14:00:00Z'),
  ('eve_ed_010_7', 'ed_010', 'ed_commitment.closed',             'verified_compliant',   'closed',              'admin@openenergy.co.za', 'Verified compliant by IPPO 2026-03; case closed clean', '2026-03-18T14:00:00Z');

-- ed_011 false_alarm
INSERT OR IGNORE INTO oe_ed_commitment_events (id, commitment_id, event_type, from_status, to_status, actor_id, notes, created_at) VALUES
  ('eve_ed_011_1', 'ed_011', 'ed_commitment.monitoring',       'baseline_locked',  'monitoring',       'ipp@openenergy.co.za', 'Monitoring activated', '2024-10-01T09:00:00Z'),
  ('eve_ed_011_2', 'ed_011', 'ed_commitment.variance_flagged', 'monitoring',       'variance_flagged', 'ipp@openenergy.co.za', 'Stale Q1 data flagged community spend at 1.39%', '2026-05-09T10:00:00Z'),
  ('eve_ed_011_3', 'ed_011', 'ed_commitment.false_alarm',      'variance_flagged', 'false_alarm',      'compliance@openenergy.co.za', 'Reconciled actual Q1 spend = 1.52% — on baseline', '2026-05-12T16:00:00Z'),
  ('eve_ed_011_4', 'ed_011', 'ed_commitment.closed',           'false_alarm',      'closed',           'admin@openenergy.co.za', 'False alarm closed', '2026-05-13T09:00:00Z');
