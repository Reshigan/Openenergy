-- ═══════════════════════════════════════════════════════════════════════════
-- 093 — Project Schedule Seed (P6-grade Wave 1 demo data)
--
-- Seeds a complete WBS + CPM-ready schedule for `ip_001` (Klerksdorp 50MW
-- Solar). 5 WBS phases, ~55 activities (mix of summary/task/milestone),
-- full FS/SS/FF dependency network, calendars, resources, assignments.
--
-- Per CLAUDE.md migration discipline: INSERT OR IGNORE keeps replay safe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Calendars ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO project_calendars (id, project_id, name, is_default, workdays, created_at) VALUES
  ('cal_ip001_std', 'ip_001', 'Standard 5-day', 1,
   '{"mon":8,"tue":8,"wed":8,"thu":8,"fri":8,"sat":0,"sun":0}', '2025-12-01T08:00:00Z'),
  ('cal_ip001_6day', 'ip_001', 'Construction 6-day', 0,
   '{"mon":10,"tue":10,"wed":10,"thu":10,"fri":10,"sat":8,"sun":0}', '2025-12-01T08:00:00Z');

-- SA public holidays 2026 (subset).
INSERT OR IGNORE INTO calendar_exceptions (id, calendar_id, exception_date, hours, reason) VALUES
  ('cex_1', 'cal_ip001_std', '2026-01-01', 0, 'New Year''s Day'),
  ('cex_2', 'cal_ip001_std', '2026-03-21', 0, 'Human Rights Day'),
  ('cex_3', 'cal_ip001_std', '2026-04-03', 0, 'Good Friday'),
  ('cex_4', 'cal_ip001_std', '2026-04-06', 0, 'Family Day'),
  ('cex_5', 'cal_ip001_std', '2026-04-27', 0, 'Freedom Day'),
  ('cex_6', 'cal_ip001_std', '2026-05-01', 0, 'Workers'' Day'),
  ('cex_7', 'cal_ip001_std', '2026-06-16', 0, 'Youth Day'),
  ('cex_8', 'cal_ip001_std', '2026-08-10', 0, 'National Women''s Day (observed)'),
  ('cex_9', 'cal_ip001_std', '2026-09-24', 0, 'Heritage Day'),
  ('cex_10', 'cal_ip001_std', '2026-12-16', 0, 'Day of Reconciliation'),
  ('cex_11', 'cal_ip001_std', '2026-12-25', 0, 'Christmas Day'),
  ('cex_12', 'cal_ip001_std', '2026-12-28', 0, 'Day of Goodwill (observed)');

-- ── Resources ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO project_resources (id, project_id, name, resource_type, unit, max_units, rate_per_unit, calendar_id, created_at) VALUES
  ('res_pm',     'ip_001', 'Project Manager',          'labor',     'persons',  1,  1200, 'cal_ip001_std', '2025-12-01T08:00:00Z'),
  ('res_civils', 'ip_001', 'Civil crew',               'labor',     'crews',    3,  4500, 'cal_ip001_6day','2025-12-01T08:00:00Z'),
  ('res_elec',   'ip_001', 'Electrical crew',          'labor',     'crews',    4,  5200, 'cal_ip001_6day','2025-12-01T08:00:00Z'),
  ('res_pile',   'ip_001', 'Pile driver',              'equipment', 'units',    2,  8500, 'cal_ip001_6day','2025-12-01T08:00:00Z'),
  ('res_crane',  'ip_001', 'Mobile crane',             'equipment', 'units',    1,  9800, 'cal_ip001_6day','2025-12-01T08:00:00Z'),
  ('res_mods',   'ip_001', 'PV modules (1500 V)',      'material',  'panels',  85000, 4.2, NULL,           '2025-12-01T08:00:00Z'),
  ('res_inv',    'ip_001', 'String inverters (3.6MW)', 'material',  'units',   14,  185000, NULL,          '2025-12-01T08:00:00Z'),
  ('res_qa',     'ip_001', 'QA/Commissioning engineer','labor',     'persons',  2,  2600, 'cal_ip001_std','2025-12-01T08:00:00Z');

-- ── Activities ────────────────────────────────────────────────────────────
-- Phases 1..5 as summaries; tasks + milestones under each.
INSERT OR IGNORE INTO project_activities
  (id, project_id, parent_id, wbs_code, sort_order, name, type, duration_days,
   planned_start, planned_finish, constraint_type, constraint_date, calendar_id,
   version, created_at, updated_at) VALUES
  -- Phase 1: Development & permits
  ('act_p1',      'ip_001', NULL,       '1',       100, 'Development & permits',       'summary',   0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_01',   'ip_001', 'act_p1',   '1.1',     110, 'Land lease executed',          'task',      15,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_02',   'ip_001', 'act_p1',   '1.2',     120, 'NEMA s.24 EA submission',      'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_03',   'ip_001', 'act_p1',   '1.3',     130, 'EA review by DFFE',            'task',      120,  NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_04',   'ip_001', 'act_p1',   '1.4',     140, 'Water-use licence',            'task',      90,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_05',   'ip_001', 'act_p1',   '1.5',     150, 'Heritage authorisation',       'task',      45,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_06',   'ip_001', 'act_p1',   '1.6',     160, 'Grid connection cost estimate','task',      60,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p1_ms',   'ip_001', 'act_p1',   '1.M',     170, 'Permits complete',             'milestone', 0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),

  -- Phase 2: Financial close
  ('act_p2',      'ip_001', NULL,       '2',       200, 'Financial close',              'summary',   0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p2_01',   'ip_001', 'act_p2',   '2.1',     210, 'PPA executed',                 'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p2_02',   'ip_001', 'act_p2',   '2.2',     220, 'Term sheet signed',            'task',      45,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p2_03',   'ip_001', 'act_p2',   '2.3',     230, 'IE technical due diligence',   'task',      60,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p2_04',   'ip_001', 'act_p2',   '2.4',     240, 'Credit committee approval',    'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p2_05',   'ip_001', 'act_p2',   '2.5',     250, 'CPs satisfied',                'task',      45,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p2_ms',   'ip_001', 'act_p2',   '2.M',     260, 'Financial close',              'milestone', 0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),

  -- Phase 3: Procurement & logistics
  ('act_p3',      'ip_001', NULL,       '3',       300, 'Procurement & logistics',      'summary',   0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_01',   'ip_001', 'act_p3',   '3.1',     310, 'EPC contract executed',        'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_02',   'ip_001', 'act_p3',   '3.2',     320, 'Module supply order',          'task',      15,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_03',   'ip_001', 'act_p3',   '3.3',     330, 'Module manufacturing lead',    'task',      120,  NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_04',   'ip_001', 'act_p3',   '3.4',     340, 'Module sea freight',           'task',      45,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_05',   'ip_001', 'act_p3',   '3.5',     350, 'SARS clearance',               'task',      10,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_06',   'ip_001', 'act_p3',   '3.6',     360, 'Inverter supply order',        'task',      14,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_07',   'ip_001', 'act_p3',   '3.7',     370, 'Inverter manufacturing lead',  'task',      90,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_08',   'ip_001', 'act_p3',   '3.8',     380, 'Inverter air freight',         'task',      14,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_09',   'ip_001', 'act_p3',   '3.9',     390, 'Module delivery on site',      'task',      10,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p3_ms',   'ip_001', 'act_p3',   '3.M',     395, 'Equipment on site',            'milestone', 0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),

  -- Phase 4: Construction
  ('act_p4',      'ip_001', NULL,       '4',       400, 'Construction',                 'summary',   0,    NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_01',   'ip_001', 'act_p4',   '4.1',     410, 'Site mobilisation',            'task',      14,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_02',   'ip_001', 'act_p4',   '4.2',     420, 'Site clearance & grading',     'task',      21,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_03',   'ip_001', 'act_p4',   '4.3',     430, 'Pile installation (East)',     'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_04',   'ip_001', 'act_p4',   '4.4',     440, 'Pile installation (Central)',  'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_05',   'ip_001', 'act_p4',   '4.5',     450, 'Pile installation (West)',     'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_06',   'ip_001', 'act_p4',   '4.6',     460, 'Trackers installed (East)',    'task',      35,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_07',   'ip_001', 'act_p4',   '4.7',     470, 'Trackers installed (Central)', 'task',      35,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_08',   'ip_001', 'act_p4',   '4.8',     480, 'Trackers installed (West)',    'task',      35,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_09',   'ip_001', 'act_p4',   '4.9',     490, 'Modules installed (East)',     'task',      28,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_10',   'ip_001', 'act_p4',   '4.10',    500, 'Modules installed (Central)',  'task',      28,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_11',   'ip_001', 'act_p4',   '4.11',    510, 'Modules installed (West)',     'task',      28,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_12',   'ip_001', 'act_p4',   '4.12',    520, 'DC cable pull',                'task',      28,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_13',   'ip_001', 'act_p4',   '4.13',    530, 'Inverter pad civil works',     'task',      21,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_14',   'ip_001', 'act_p4',   '4.14',    540, 'Inverter installation',        'task',      21,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_15',   'ip_001', 'act_p4',   '4.15',    550, 'MV cable & switchgear',        'task',      30,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_16',   'ip_001', 'act_p4',   '4.16',    560, 'Substation civil works',       'task',      45,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_17',   'ip_001', 'act_p4',   '4.17',    570, 'HV cable & 132 kV interface',  'task',      35,   NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p4_ms',   'ip_001', 'act_p4',   '4.M',     580, 'Mechanical completion',        'milestone', 0,    NULL, NULL, NULL, NULL, 'cal_ip001_6day',1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),

  -- Phase 5: Commissioning & COD
  ('act_p5',      'ip_001', NULL,       '5',       600, 'Commissioning & COD',          'summary',   0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_01',   'ip_001', 'act_p5',   '5.1',     610, 'Pre-commissioning checks',     'task',      14,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_02',   'ip_001', 'act_p5',   '5.2',     620, 'First sync to grid',           'task',      3,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_03',   'ip_001', 'act_p5',   '5.3',     630, 'Performance test (PR)',        'task',      14,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_04',   'ip_001', 'act_p5',   '5.4',     640, 'Capacity test',                'task',      7,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_05',   'ip_001', 'act_p5',   '5.5',     650, 'Punchlist closeout',           'task',      21,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_06',   'ip_001', 'act_p5',   '5.6',     660, 'Final IE certification',       'task',      14,   NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z'),
  ('act_p5_ms',   'ip_001', 'act_p5',   '5.M',     670, 'Commercial operations date',   'milestone', 0,    NULL, NULL, NULL, NULL, 'cal_ip001_std', 1, '2025-12-01T08:00:00Z','2025-12-01T08:00:00Z');

-- ── Dependencies (FS unless otherwise noted) ─────────────────────────────
INSERT OR IGNORE INTO activity_dependencies (id, project_id, predecessor_id, successor_id, link_type, lag_days, created_at) VALUES
  -- Phase 1 chain
  ('dep_1_01', 'ip_001', 'act_p1_01', 'act_p1_02', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_1_02', 'ip_001', 'act_p1_02', 'act_p1_03', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_1_03', 'ip_001', 'act_p1_02', 'act_p1_04', 'SS', 5, '2025-12-01T08:00:00Z'),
  ('dep_1_04', 'ip_001', 'act_p1_02', 'act_p1_05', 'SS', 10, '2025-12-01T08:00:00Z'),
  ('dep_1_05', 'ip_001', 'act_p1_01', 'act_p1_06', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_1_06', 'ip_001', 'act_p1_03', 'act_p1_ms', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_1_07', 'ip_001', 'act_p1_04', 'act_p1_ms', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_1_08', 'ip_001', 'act_p1_05', 'act_p1_ms', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_1_09', 'ip_001', 'act_p1_06', 'act_p1_ms', 'FS', 0, '2025-12-01T08:00:00Z'),

  -- Phase 1 → 2
  ('dep_12_01','ip_001', 'act_p1_ms', 'act_p2_01', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_12_02','ip_001', 'act_p2_01', 'act_p2_02', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_12_03','ip_001', 'act_p2_02', 'act_p2_03', 'SS', 0, '2025-12-01T08:00:00Z'),
  ('dep_12_04','ip_001', 'act_p2_03', 'act_p2_04', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_12_05','ip_001', 'act_p2_04', 'act_p2_05', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_12_06','ip_001', 'act_p2_05', 'act_p2_ms', 'FS', 0, '2025-12-01T08:00:00Z'),

  -- Phase 2 → 3
  ('dep_23_01','ip_001', 'act_p2_ms', 'act_p3_01', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_02','ip_001', 'act_p3_01', 'act_p3_02', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_03','ip_001', 'act_p3_02', 'act_p3_03', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_04','ip_001', 'act_p3_03', 'act_p3_04', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_05','ip_001', 'act_p3_04', 'act_p3_05', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_06','ip_001', 'act_p3_05', 'act_p3_09', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_07','ip_001', 'act_p3_01', 'act_p3_06', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_08','ip_001', 'act_p3_06', 'act_p3_07', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_09','ip_001', 'act_p3_07', 'act_p3_08', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_10','ip_001', 'act_p3_09', 'act_p3_ms', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_23_11','ip_001', 'act_p3_08', 'act_p3_ms', 'FS', 0, '2025-12-01T08:00:00Z'),

  -- Phase 3 → 4 (construction starts after permits + mobilisation; site clearance independent of modules)
  ('dep_34_01','ip_001', 'act_p1_ms',  'act_p4_01', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_02','ip_001', 'act_p4_01',  'act_p4_02', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_03','ip_001', 'act_p4_02',  'act_p4_03', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_04','ip_001', 'act_p4_03',  'act_p4_04', 'SS', 10, '2025-12-01T08:00:00Z'),
  ('dep_34_05','ip_001', 'act_p4_04',  'act_p4_05', 'SS', 10, '2025-12-01T08:00:00Z'),
  ('dep_34_06','ip_001', 'act_p4_03',  'act_p4_06', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_07','ip_001', 'act_p4_04',  'act_p4_07', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_08','ip_001', 'act_p4_05',  'act_p4_08', 'FS', 0,  '2025-12-01T08:00:00Z'),

  -- Modules need to be on site AND trackers up
  ('dep_34_09','ip_001', 'act_p4_06',  'act_p4_09', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_10','ip_001', 'act_p4_07',  'act_p4_10', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_11','ip_001', 'act_p4_08',  'act_p4_11', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_12','ip_001', 'act_p3_ms',  'act_p4_09', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_13','ip_001', 'act_p3_ms',  'act_p4_10', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_14','ip_001', 'act_p3_ms',  'act_p4_11', 'FS', 0,  '2025-12-01T08:00:00Z'),

  -- DC cable + inverter pad + inverter install + MV/HV
  ('dep_34_15','ip_001', 'act_p4_09',  'act_p4_12', 'SS', 7,  '2025-12-01T08:00:00Z'),
  ('dep_34_16','ip_001', 'act_p4_10',  'act_p4_12', 'SS', 7,  '2025-12-01T08:00:00Z'),
  ('dep_34_17','ip_001', 'act_p4_11',  'act_p4_12', 'SS', 7,  '2025-12-01T08:00:00Z'),
  ('dep_34_18','ip_001', 'act_p4_02',  'act_p4_13', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_19','ip_001', 'act_p4_13',  'act_p4_14', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_20','ip_001', 'act_p4_14',  'act_p4_15', 'SS', 7,  '2025-12-01T08:00:00Z'),
  ('dep_34_21','ip_001', 'act_p4_12',  'act_p4_15', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_22','ip_001', 'act_p4_02',  'act_p4_16', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_23','ip_001', 'act_p4_16',  'act_p4_17', 'FS', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_24','ip_001', 'act_p4_15',  'act_p4_17', 'FF', 0,  '2025-12-01T08:00:00Z'),
  ('dep_34_25','ip_001', 'act_p4_17',  'act_p4_ms', 'FS', 0,  '2025-12-01T08:00:00Z'),

  -- Phase 4 → 5
  ('dep_45_01','ip_001', 'act_p4_ms', 'act_p5_01', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_02','ip_001', 'act_p5_01', 'act_p5_02', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_03','ip_001', 'act_p5_02', 'act_p5_03', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_04','ip_001', 'act_p5_03', 'act_p5_04', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_05','ip_001', 'act_p5_03', 'act_p5_05', 'SS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_06','ip_001', 'act_p5_04', 'act_p5_06', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_07','ip_001', 'act_p5_05', 'act_p5_06', 'FS', 0, '2025-12-01T08:00:00Z'),
  ('dep_45_08','ip_001', 'act_p5_06', 'act_p5_ms', 'FS', 0, '2025-12-01T08:00:00Z');

-- ── Resource assignments ──────────────────────────────────────────────────
INSERT OR IGNORE INTO resource_assignments (id, activity_id, resource_id, units) VALUES
  ('asg_1', 'act_p1_01', 'res_pm',    1),
  ('asg_2', 'act_p1_02', 'res_pm',    1),
  ('asg_3', 'act_p1_03', 'res_pm',    0.5),
  ('asg_4', 'act_p2_03', 'res_pm',    0.5),
  ('asg_5', 'act_p4_03', 'res_civils',1),
  ('asg_6', 'act_p4_03', 'res_pile',  1),
  ('asg_7', 'act_p4_04', 'res_civils',1),
  ('asg_8', 'act_p4_04', 'res_pile',  1),
  ('asg_9', 'act_p4_05', 'res_civils',1),
  ('asg_10','act_p4_05', 'res_pile',  1),
  ('asg_11','act_p4_06', 'res_elec',  1),
  ('asg_12','act_p4_07', 'res_elec',  1),
  ('asg_13','act_p4_08', 'res_elec',  1),
  ('asg_14','act_p4_09', 'res_elec',  1),
  ('asg_15','act_p4_10', 'res_elec',  1),
  ('asg_16','act_p4_11', 'res_elec',  1),
  ('asg_17','act_p4_14', 'res_crane', 1),
  ('asg_18','act_p4_14', 'res_elec',  1),
  ('asg_19','act_p4_16', 'res_civils',1),
  ('asg_20','act_p4_17', 'res_elec',  2),
  ('asg_21','act_p5_01', 'res_qa',    1),
  ('asg_22','act_p5_03', 'res_qa',    2),
  ('asg_23','act_p5_04', 'res_qa',    2),
  ('asg_24','act_p5_06', 'res_qa',    1);

-- Initial schedule state row for project (status_date drives projectStart).
INSERT OR REPLACE INTO project_schedule_state (project_id, version, status_date, last_computed_at, total_duration_days, start_date, finish_date, has_cycles)
VALUES ('ip_001', 1, '2026-01-05', NULL, NULL, '2026-01-05', NULL, 0);
