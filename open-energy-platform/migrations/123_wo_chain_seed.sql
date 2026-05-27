-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 16 — seed WOs across every chain state (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO om_work_orders (
  id, wo_number, site_id, fault_id, category, priority, status, chain_status,
  assigned_to, title, description,
  sla_response_minutes, sla_resolve_hours, sla_deadline, sla_breached,
  created_at, escalation_level
) VALUES
  ('om_wo_chain_001', 'WO-C-2026-001', 'esums_site_001', NULL, 'corrective', 'critical', 'created',      'created',      NULL,                   'Critical inverter trip — string 4',     'Inverter offline after grid sag.',          15,  4, datetime('now', '+15 minutes'),    0, datetime('now','-2 minutes'),   0),
  ('om_wo_chain_002', 'WO-C-2026-002', 'esums_site_001', NULL, 'corrective', 'critical', 'assigned',     'assigned',     'esums_tech_001',       'Combiner box smoke event',              'Smoke reported by site security.',          15,  4, datetime('now', '+10 minutes'),    0, datetime('now','-20 minutes'),  0),
  ('om_wo_chain_003', 'WO-C-2026-003', 'esums_site_001', NULL, 'corrective', 'high',     'acknowledged', 'acknowledged', 'esums_tech_001',       'String 7 underperformance',             'Soiling + shading suspect.',                30, 12, datetime('now', '+45 minutes'),    0, datetime('now','-1 hours'),     0),
  ('om_wo_chain_004', 'WO-C-2026-004', 'esums_site_002', NULL, 'corrective', 'medium',   'en_route',     'en_route',     'esums_tech_002',       'Communication outage RTU-3',            'Comms loss confirmed.',                     60, 24, datetime('now', '+1 hours'),       0, datetime('now','-2 hours'),     0),
  ('om_wo_chain_005', 'WO-C-2026-005', 'esums_site_002', NULL, 'preventive', 'medium',   'on_site',      'on_site',      'esums_tech_002',       'Quarterly thermal scan',                'On-site, drone ready.',                     60, 24, datetime('now', '+45 minutes'),    0, datetime('now','-3 hours'),     0),
  ('om_wo_chain_006', 'WO-C-2026-006', 'esums_site_003', NULL, 'corrective', 'high',     'diagnosing',   'diagnosing',   'esums_tech_003',       'BESS DC overcurrent — module 12',       'Diagnostics open.',                         30,  8, datetime('now', '+1 hours'),       0, datetime('now','-4 hours'),     0),
  ('om_wo_chain_007', 'WO-C-2026-007', 'esums_site_003', NULL, 'corrective', 'medium',   'repairing',    'repairing',    'esums_tech_003',       'BMS firmware mismatch',                 'Flashing controller now.',                  60, 24, datetime('now', '+4 hours'),       0, datetime('now','-6 hours'),     0),
  ('om_wo_chain_008', 'WO-C-2026-008', 'esums_site_004', NULL, 'corrective', 'low',      'testing',      'testing',      'esums_tech_004',       'Optimizer replacement — string 2',      'Post-repair functional test in progress.',  240,72, datetime('now', '+2 hours'),       0, datetime('now','-8 hours'),     0),
  ('om_wo_chain_009', 'WO-C-2026-009', 'esums_site_004', NULL, 'preventive', 'low',      'completed',    'completed',    'esums_tech_004',       'Annual cable torque check',             'Awaiting verification.',                    240,72, datetime('now', '+1 hours'),       0, datetime('now','-12 hours'),    0),
  ('om_wo_chain_010', 'WO-C-2026-010', 'esums_site_005', NULL, 'corrective', 'medium',   'verified',     'verified',     'esums_tech_002',       'String 11 voltage imbalance',           'Verified by senior tech.',                  60, 24, NULL,                              0, datetime('now','-1 days'),      0),
  ('om_wo_chain_011', 'WO-C-2026-011', 'esums_site_005', NULL, 'preventive', 'low',      'closed',       'closed',       'esums_tech_001',       'Inverter ventilation clean',            'Closed and signed off.',                    240,72, NULL,                              0, datetime('now','-3 days'),      0),
  ('om_wo_chain_012', 'WO-C-2026-012', 'esums_site_001', NULL, 'corrective', 'critical', 'created',      'created',      NULL,                   'Suspected fire risk — combiner box',    'Field reported, awaiting dispatch.',        15,  4, datetime('now', '-30 minutes'),    1, datetime('now','-2 hours'),     1);

-- Audit history (3-5 events each on a few rows).
INSERT OR IGNORE INTO om_wo_chain_events (id, wo_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
  ('wo_evt_001', 'om_wo_chain_002', 'assigned',       'created',     'assigned',     'demo_admin_001', 'Dispatched to senior tech',         '{}', datetime('now','-19 minutes')),
  ('wo_evt_002', 'om_wo_chain_003', 'assigned',       'created',     'assigned',     'demo_admin_001', NULL,                                  '{}', datetime('now','-90 minutes')),
  ('wo_evt_003', 'om_wo_chain_003', 'acknowledged',   'assigned',    'acknowledged', 'esums_tech_001', NULL,                                  '{}', datetime('now','-60 minutes')),
  ('wo_evt_004', 'om_wo_chain_004', 'assigned',       'created',     'assigned',     'demo_admin_001', NULL,                                  '{}', datetime('now','-130 minutes')),
  ('wo_evt_005', 'om_wo_chain_004', 'acknowledged',   'assigned',    'acknowledged', 'esums_tech_002', NULL,                                  '{}', datetime('now','-125 minutes')),
  ('wo_evt_006', 'om_wo_chain_004', 'departed',       'acknowledged','en_route',     'esums_tech_002', 'ETA 45min',                           '{}', datetime('now','-120 minutes')),
  ('wo_evt_007', 'om_wo_chain_007', 'assigned',       'created',     'assigned',     'demo_admin_001', NULL,                                  '{}', datetime('now','-360 minutes')),
  ('wo_evt_008', 'om_wo_chain_007', 'acknowledged',   'assigned',    'acknowledged', 'esums_tech_003', NULL,                                  '{}', datetime('now','-350 minutes')),
  ('wo_evt_009', 'om_wo_chain_007', 'departed',       'acknowledged','en_route',     'esums_tech_003', NULL,                                  '{}', datetime('now','-340 minutes')),
  ('wo_evt_010', 'om_wo_chain_007', 'arrived',        'en_route',    'on_site',      'esums_tech_003', NULL,                                  '{}', datetime('now','-330 minutes')),
  ('wo_evt_011', 'om_wo_chain_007', 'diagnosed',      'on_site',     'diagnosing',   'esums_tech_003', 'Module 12 BMS mismatch',              '{}', datetime('now','-320 minutes')),
  ('wo_evt_012', 'om_wo_chain_007', 'repair_started', 'diagnosing',  'repairing',    'esums_tech_003', 'Re-flashing controller',              '{}', datetime('now','-300 minutes')),
  ('wo_evt_013', 'om_wo_chain_010', 'verified',       'completed',   'verified',     'esums_tech_001', 'Functional + thermal verified',       '{}', datetime('now','-1 days')),
  ('wo_evt_014', 'om_wo_chain_011', 'closed',         'verified',    'closed',       'demo_admin_001', 'Audit pack archived',                 '{}', datetime('now','-3 days')),
  ('wo_evt_015', 'om_wo_chain_012', 'sla_breached',   'created',     'created',      'system',         'Critical WO breached created-stage SLA','{"sla_window":"15m","priority":"critical"}', datetime('now','-1 hours'));
