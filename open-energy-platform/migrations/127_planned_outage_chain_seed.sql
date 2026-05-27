-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 18 — Planned outage seed. 11 in-flight outages spanning every chain
-- state × severity tier (idempotent INSERT OR IGNORE).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── In-flight outages covering every chain state + severity ────────────────
INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, created_by, created_at)
SELECT 'pln_out_001', 'OUT-2026-001', p.id, 'site_kathu_001', 'Kathu 100MW solar', 'maintenance', 'high',
       'draft', 80.0, 'NW Cape', datetime('now','+5 days'), datetime('now','+5 days','+8 hours'), 480,
       'Quarterly inverter rebalance', 'N-1: Aries 132kV line reverts to 50% headroom; OK.',
       NULL, 0, p.id, datetime('now','-2 hours')
  FROM participants p WHERE email='ipp@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, created_by, created_at)
SELECT 'pln_out_002', 'OUT-2026-002', p.id, 'site_jeffrey_bay', 'Jeffreys Bay 138MW wind', 'inspection', 'critical',
       'submitted', 138.0, 'EC', datetime('now','+24 hours'), datetime('now','+24 hours','+6 hours'), 360,
       'Lightning-strike gearbox inspection', 'EMERGENCY: gearbox vibration anomaly. N-1 contingency on Grassridge 400kV ring.',
       datetime('now','+1 hours'), 0, p.id, datetime('now','-30 minutes')
  FROM participants p WHERE email='wind@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, created_by, created_at)
SELECT 'pln_out_003', 'OUT-2026-003', p.id, 'site_red_cap_north', 'Red Cap Kouga 80MW', 'maintenance', 'high',
       'under_review', 80.0, 'EC', datetime('now','+3 days'), datetime('now','+3 days','+12 hours'), 720,
       'Annual SCADA upgrade', 'N-1: Dedisa 400kV maintains supply.',
       datetime('now','+4 hours'), 0, p.id, datetime('now','-6 hours')
  FROM participants p WHERE email='ipp@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, approved_by, approved_at, created_by, created_at)
SELECT 'pln_out_004', 'OUT-2026-004', p.id, 'site_kangnas', 'Kangnas 140MW wind', 'upgrade', 'critical',
       'approved', 140.0, 'NW Cape', datetime('now','+6 hours'), datetime('now','+6 hours','+10 hours'), 600,
       'WTG firmware rollout v3.4', 'N-1: Aggeneis 400kV ring stable. SO Cover-2 contingency armed.',
       datetime('now','+1 hours'), 0, 'demo_grid_001', datetime('now','-2 hours'),
       p.id, datetime('now','-12 hours')
  FROM participants p WHERE email='ipp@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, rejection_reason, escalation_level, created_by, created_at)
SELECT 'pln_out_005', 'OUT-2026-005', p.id, 'site_oyster_bay', 'Oyster Bay 140MW wind', 'maintenance', 'high',
       'rejected', 140.0, 'EC', datetime('now','+2 days'), datetime('now','+2 days','+8 hours'), 480,
       'Tower lightning system retrofit',
       'Conflicts with KaXu maintenance window — same 400kV ring. Resubmit for week of 2026-06-15.',
       0, p.id, datetime('now','-2 days')
  FROM participants p WHERE email='wind@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, created_by, created_at)
SELECT 'pln_out_006', 'OUT-2026-006', p.id, 'site_droogfontein', 'Droogfontein 75MW solar', 'maintenance', 'medium',
       'rescheduled', 30.0, 'NC', datetime('now','+10 days'), datetime('now','+10 days','+6 hours'), 360,
       'Inverter swap (rescheduled from week 22)', 'N-1: De Aar substation maintains 25% reserve.',
       datetime('now','+24 hours'), 0, p.id, datetime('now','-3 days')
  FROM participants p WHERE email='ipp@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, approved_by, approved_at,
   notified_at, created_by, created_at)
SELECT 'pln_out_007', 'OUT-2026-007', p.id, 'site_dorper', 'Dorper Wind 100MW', 'maintenance', 'high',
       'notified', 100.0, 'EC', datetime('now','+12 hours'), datetime('now','+12 hours','+4 hours'), 240,
       'Blade leading-edge inspection', 'N-1: Grassridge stable; offtaker pre-notified.',
       datetime('now','+3 hours'), 0, 'demo_grid_001', datetime('now','-6 hours'),
       datetime('now','-1 hours'), p.id, datetime('now','-12 hours')
  FROM participants p WHERE email='wind@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, approved_by, approved_at,
   notified_at, commenced_at, created_by, created_at)
SELECT 'pln_out_008', 'OUT-2026-008', p.id, 'site_loeriesfontein', 'Loeriesfontein 140MW wind', 'emergency', 'critical',
       'in_progress', 140.0, 'NC', datetime('now','-30 minutes'), datetime('now','+6 hours'), 360,
       'EMERGENCY blade-bolt re-torque', 'EMERGENCY commenced after gearbox vibration spike. Cover-1 active.',
       datetime('now','+3 hours'), 0, 'demo_grid_001', datetime('now','-2 hours'),
       datetime('now','-1 hours'), datetime('now','-30 minutes'),
       p.id, datetime('now','-2 hours')
  FROM participants p WHERE email='wind@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, escalation_level, approved_by, approved_at,
   notified_at, commenced_at, created_by, created_at)
SELECT 'pln_out_009', 'OUT-2026-009', p.id, 'site_perdekraal', 'Perdekraal 110MW wind', 'maintenance', 'high',
       'restoring', 110.0, 'WC', datetime('now','-4 hours'), datetime('now','+2 hours'), 360,
       'Generator main bearing replace', 'N-1: Bacchus 132kV ring stable. Restoration ramp scheduled.',
       datetime('now','+30 minutes'), 0, 'demo_grid_001', datetime('now','-12 hours'),
       datetime('now','-8 hours'), datetime('now','-4 hours'),
       p.id, datetime('now','-1 days')
  FROM participants p WHERE email='wind@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, escalation_level, approved_by, approved_at,
   notified_at, commenced_at, restored_at, created_by, created_at)
SELECT 'pln_out_010', 'OUT-2026-010', p.id, 'site_solar_capital', 'Solar Capital De Aar 75MW', 'maintenance', 'medium',
       'restored', 30.0, 'NC', datetime('now','-2 days'), datetime('now','-2 days','+6 hours'), 360,
       'Annual inverter PM', 'N-1: NCA Aggeneis stable.',
       0, 'demo_grid_001', datetime('now','-3 days'),
       datetime('now','-2 days','-12 hours'), datetime('now','-2 days'),
       datetime('now','-2 days','+6 hours'), p.id, datetime('now','-5 days')
  FROM participants p WHERE email='ipp@openenergy.co.za';

INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, escalation_level, approved_by, approved_at,
   notified_at, commenced_at, restored_at, closed_at, created_by, created_at)
SELECT 'pln_out_011', 'OUT-2026-011', p.id, 'site_xina_solar_one', 'Xina Solar One 100MW CSP', 'inspection', 'medium',
       'closed', 50.0, 'NC', datetime('now','-10 days'), datetime('now','-10 days','+8 hours'), 480,
       'Receiver tube borescope inspection', 'N-1: Pofadder 400kV ring stable.',
       0, 'demo_grid_001', datetime('now','-12 days'),
       datetime('now','-11 days'), datetime('now','-10 days'),
       datetime('now','-10 days','+8 hours'), datetime('now','-3 days'),
       p.id, datetime('now','-14 days')
  FROM participants p WHERE email='ipp@openenergy.co.za';

-- One critical SLA-breached row for the cron sweep + regulator inbox.
INSERT OR IGNORE INTO oe_planned_outages
  (id, outage_number, participant_id, asset_id, asset_name, category, severity,
   chain_status, affected_mw, affected_zone, start_at, end_at, duration_minutes,
   reason, contingency_notes, sla_deadline_at, last_sla_breach_at, escalation_level,
   created_by, created_at)
SELECT 'pln_out_012', 'OUT-2026-012', p.id, 'site_msinga', 'Msinga 80MW wind (planned)', 'maintenance', 'critical',
       'under_review', 80.0, 'KZN', datetime('now','+8 hours'), datetime('now','+8 hours','+4 hours'), 240,
       'Pre-storm protective shutdown',
       'Critical 24h window for SO review (NERSA C-1.3). Awaiting Cover-2 sign-off.',
       datetime('now','-30 minutes'), datetime('now','-15 minutes'), 1,
       p.id, datetime('now','-3 hours')
  FROM participants p WHERE email='wind@openenergy.co.za';

-- ─── Audit history for the in-flight rows ──────────────────────────────────
INSERT OR IGNORE INTO oe_planned_outage_events
  (id, outage_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
  ('pln_evt_001', 'pln_out_002', 'submitted',        'draft',        'submitted',    'demo_wind_001', 'Lightning-strike emergency',           '{}', datetime('now','-30 minutes')),
  ('pln_evt_002', 'pln_out_003', 'submitted',        'draft',        'submitted',    'demo_ipp_001',  NULL,                                   '{}', datetime('now','-6 hours')),
  ('pln_evt_003', 'pln_out_003', 'review_started',   'submitted',    'under_review', 'demo_grid_001', 'SO N-1 contingency check',             '{}', datetime('now','-5 hours')),
  ('pln_evt_004', 'pln_out_004', 'submitted',        'draft',        'submitted',    'demo_ipp_001',  NULL,                                   '{}', datetime('now','-12 hours')),
  ('pln_evt_005', 'pln_out_004', 'review_started',   'submitted',    'under_review', 'demo_grid_001', NULL,                                   '{}', datetime('now','-10 hours')),
  ('pln_evt_006', 'pln_out_004', 'approved',         'under_review', 'approved',     'demo_grid_001', 'Cover-2 contingency armed',            '{}', datetime('now','-2 hours')),
  ('pln_evt_007', 'pln_out_005', 'submitted',        'draft',        'submitted',    'demo_wind_001', NULL,                                   '{}', datetime('now','-2 days')),
  ('pln_evt_008', 'pln_out_005', 'review_started',   'submitted',    'under_review', 'demo_grid_001', NULL,                                   '{}', datetime('now','-2 days','+2 hours')),
  ('pln_evt_009', 'pln_out_005', 'rejected',         'under_review', 'rejected',     'demo_grid_001', 'Window conflict',                      '{}', datetime('now','-1 days')),
  ('pln_evt_010', 'pln_out_006', 'submitted',        'draft',        'submitted',    'demo_ipp_001',  NULL,                                   '{}', datetime('now','-5 days')),
  ('pln_evt_011', 'pln_out_006', 'review_started',   'submitted',    'under_review', 'demo_grid_001', NULL,                                   '{}', datetime('now','-4 days')),
  ('pln_evt_012', 'pln_out_006', 'rescheduled',      'under_review', 'rescheduled',  'demo_grid_001', 'Window slipped 2 weeks',               '{}', datetime('now','-3 days')),
  ('pln_evt_013', 'pln_out_007', 'approved',         'under_review', 'approved',     'demo_grid_001', NULL,                                   '{}', datetime('now','-6 hours')),
  ('pln_evt_014', 'pln_out_007', 'notified',         'approved',     'notified',     'demo_grid_001', '72h customer notification window opened','{}', datetime('now','-1 hours')),
  ('pln_evt_015', 'pln_out_008', 'commenced',        'notified',     'in_progress',  'demo_grid_001', 'EMERGENCY commenced; SO Cover-1 active','{}', datetime('now','-30 minutes')),
  ('pln_evt_016', 'pln_out_009', 'commenced',        'notified',     'in_progress',  'demo_grid_001', NULL,                                   '{}', datetime('now','-4 hours')),
  ('pln_evt_017', 'pln_out_009', 'restore_started',  'in_progress',  'restoring',    'demo_grid_001', 'Generator energised on 50% ramp',      '{}', datetime('now','-30 minutes')),
  ('pln_evt_018', 'pln_out_010', 'restored',         'restoring',    'restored',     'demo_grid_001', 'Full restoration',                     '{}', datetime('now','-2 days','+6 hours')),
  ('pln_evt_019', 'pln_out_011', 'closed',           'restored',     'closed',       'demo_grid_001', 'Post-mortem filed and signed',         '{}', datetime('now','-3 days')),
  ('pln_evt_020', 'pln_out_012', 'review_started',   'submitted',    'under_review', 'demo_grid_001', NULL,                                   '{}', datetime('now','-2 hours')),
  ('pln_evt_021', 'pln_out_012', 'sla_breached',     'under_review', 'under_review', 'system',        'Critical 2h SLA breached', '{"sla_window":"120m"}', datetime('now','-15 minutes'));
