-- Wave 196: Grid Protection Relay & Anti-Islanding Compliance Test
-- NRS 097-2-3 + NERSA Grid Code Chapter 3 + SANS 1012 + IEC 60255
-- Tracks the full lifecycle of protection relay functional tests for embedded
-- generation sites, including anti-islanding compliance certification.

CREATE TABLE IF NOT EXISTS oe_protection_relay_tests (
  id                  TEXT PRIMARY KEY,
  chain_status        TEXT NOT NULL DEFAULT 'test_scheduled',
  sla_deadline        TEXT,
  sla_breached        INTEGER NOT NULL DEFAULT 0,
  regulator_notified  INTEGER NOT NULL DEFAULT 0,
  actor_id            TEXT,
  reason              TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),

  -- Business fields
  site_id             TEXT NOT NULL,
  device_sn           TEXT NOT NULL,
  relay_type          TEXT NOT NULL,
  test_standard       TEXT NOT NULL,
  protection_class    TEXT NOT NULL CHECK (
    protection_class IN ('safety_critical','transmission','distribution','embedded','routine')
  ),
  test_engineer_id    TEXT,
  grid_witness_id     TEXT,
  pass_criteria_met   INTEGER NOT NULL DEFAULT 0,
  certificate_number  TEXT,
  next_test_due       TEXT
);

CREATE INDEX IF NOT EXISTS idx_prt_status          ON oe_protection_relay_tests(chain_status);
CREATE INDEX IF NOT EXISTS idx_prt_site            ON oe_protection_relay_tests(site_id);
CREATE INDEX IF NOT EXISTS idx_prt_device          ON oe_protection_relay_tests(device_sn);
CREATE INDEX IF NOT EXISTS idx_prt_protection_class ON oe_protection_relay_tests(protection_class);
CREATE INDEX IF NOT EXISTS idx_prt_sla             ON oe_protection_relay_tests(sla_deadline, sla_breached);

-- ─── Seed data ─────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states, protection_class varied,
-- site_id='om_site_gr_malvern' for most rows

INSERT OR IGNORE INTO oe_protection_relay_tests
  (id, chain_status, site_id, device_sn, relay_type, test_standard,
   protection_class, test_engineer_id, grid_witness_id,
   pass_criteria_met, certificate_number, next_test_due,
   sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES

-- 1. test_scheduled — embedded — Malvern
('prt-001',
 'test_scheduled',
 'om_site_gr_malvern', 'REL-SX4G-001', 'SEL-751A Feeder Protection', 'NRS 097-2-3',
 'embedded', 'eng_thandeka_mokoena', NULL,
 0, NULL, NULL,
 date('now', '+21 days'), 0, 0,
 'eng_thandeka_mokoena', NULL,
 datetime('now', '-1 day'), datetime('now', '-1 day')),

-- 2. pre_test_inspection — distribution — Malvern
('prt-002',
 'pre_test_inspection',
 'om_site_gr_malvern', 'REL-SX4G-002', 'Schneider P122 Overcurrent', 'NRS 097-2-3 + IEC 60255',
 'distribution', 'eng_sipho_dlamini', 'grid_wit_so_001',
 0, NULL, NULL,
 date('now', '+12 days'), 0, 0,
 'eng_sipho_dlamini', 'Pre-inspection commenced. Equipment calibration verified.',
 datetime('now', '-2 days'), datetime('now', '-6 hours')),

-- 3. site_ready — transmission — Malvern
('prt-003',
 'site_ready',
 'om_site_gr_malvern', 'REL-TX33K-001', 'GE D60 Distance Protection', 'NERSA Grid Code Ch3 + IEC 60255-151',
 'transmission', 'eng_priya_naidoo', 'grid_wit_so_002',
 0, NULL, NULL,
 date('now', '+5 days'), 0, 0,
 'eng_priya_naidoo', 'Site isolation confirmed. Safety perimeter established. Witness on site.',
 datetime('now', '-3 days'), datetime('now', '-1 day')),

-- 4. test_executing — safety_critical — alternate site
('prt-004',
 'test_executing',
 'om_site_gr_soweto', 'REL-SC132K-001', 'ABB REF615 Feeder Terminal', 'NERSA Grid Code Ch3 + NRS 097-2-3',
 'safety_critical', 'eng_heinrich_botha', 'grid_wit_so_003',
 0, NULL, NULL,
 date('now', '+2 days'), 0, 0,
 'eng_heinrich_botha', 'Test execution in progress. Initial injection tests underway.',
 datetime('now', '-4 days'), datetime('now', '-30 minutes')),

-- 5. preliminary_results — distribution — Malvern
('prt-005',
 'preliminary_results',
 'om_site_gr_malvern', 'REL-SX4G-003', 'Siemens 7SJ82 Motor Protection', 'NRS 097-2-3',
 'distribution', 'eng_fatima_patel', 'grid_wit_so_001',
 0, NULL, NULL,
 date('now', '+8 days'), 0, 0,
 'eng_fatima_patel', 'All injection tests complete. Reviewing trip-time measurements against IEC 60255-151.',
 datetime('now', '-5 days'), datetime('now', '-2 hours')),

-- 6. certified_pass — routine — Malvern (TERMINAL +)
('prt-006',
 'certified_pass',
 'om_site_gr_malvern', 'REL-SX4G-004', 'ABB RED615 Differential Protection', 'NRS 097-2-3 Annex B',
 'routine', 'eng_sipho_dlamini', 'grid_wit_so_001',
 1, 'CERT-NRS097-2026-0441', date('now', '+365 days'),
 date('now', '-5 days'), 0, 0,
 'eng_sipho_dlamini', 'All 14 trip criteria met. Anti-islanding detection time 82ms (pass threshold 150ms). Certificate issued.',
 datetime('now', '-15 days'), datetime('now', '-10 days')),

-- 7. minor_deficiency — embedded — Malvern
('prt-007',
 'minor_deficiency',
 'om_site_gr_malvern', 'REL-SX4G-005', 'SEL-300G Generator Protection', 'NRS 097-2-3 + SANS 1012',
 'embedded', 'eng_thandeka_mokoena', 'grid_wit_so_001',
 0, NULL, NULL,
 date('now', '+18 days'), 0, 0,
 'eng_thandeka_mokoena', 'Over-voltage trip setpoint 2.3% high. Calibration adjustment required; retest scheduled within 7 days.',
 datetime('now', '-7 days'), datetime('now', '-1 day')),

-- 8. test_failed — transmission — alternate site (regulator notified)
('prt-008',
 'test_failed',
 'om_site_gr_randburg', 'REL-TX33K-002', 'GE T60 Transformer Protection', 'NERSA Grid Code Ch3',
 'transmission', 'eng_priya_naidoo', 'grid_wit_so_002',
 0, NULL, NULL,
 date('now', '-1 day'), 1, 1,
 'eng_priya_naidoo', 'Anti-islanding detection failed. Island persisted 320ms (pass threshold 150ms). Immediate rectification required per NRS 097-2-3 s8.4.',
 datetime('now', '-10 days'), datetime('now', '-1 day')),

-- 9. rectification_required — safety_critical — Soweto (regulator notified)
('prt-009',
 'rectification_required',
 'om_site_gr_soweto', 'REL-SC132K-002', 'Alstom MiCOM P543 Differential', 'NERSA Grid Code Ch3 + IEC 60255-187',
 'safety_critical', 'eng_heinrich_botha', 'grid_wit_so_003',
 0, NULL, NULL,
 date('now', '+1 day'), 1, 1,
 'grid_wit_so_003', 'Trip characteristic outside IEC 60255-3 tolerance band. OEM firmware update required before retest.',
 datetime('now', '-4 days'), datetime('now', '-8 hours')),

-- 10. rectification_complete — distribution — Malvern
('prt-010',
 'rectification_complete',
 'om_site_gr_malvern', 'REL-SX4G-006', 'Schneider P141 Feeder Management', 'NRS 097-2-3',
 'distribution', 'eng_fatima_patel', 'grid_wit_so_001',
 0, NULL, NULL,
 date('now', '+10 days'), 0, 0,
 'eng_fatima_patel', 'Relay firmware updated to v3.21. Setpoints reconfigured per approved protection philosophy. Retest requested.',
 datetime('now', '-8 days'), datetime('now', '-4 hours')),

-- 11. retest_scheduled — routine — Malvern
('prt-011',
 'retest_scheduled',
 'om_site_gr_malvern', 'REL-SX4G-007', 'SEL-351 Overcurrent Relay', 'NRS 097-2-3 Annex B',
 'routine', 'eng_sipho_dlamini', 'grid_wit_so_001',
 0, NULL, NULL,
 date('now', '+25 days'), 0, 0,
 'eng_sipho_dlamini', 'Minor calibration drift corrected. Retest scheduled for next available grid outage window.',
 datetime('now', '-12 days'), datetime('now', '-2 days')),

-- 12. failed_final — transmission — Randburg (TERMINAL − all tiers; mandatory safety disconnect)
('prt-012',
 'failed_final',
 'om_site_gr_randburg', 'REL-TX33K-003', 'ABB REF542plus Multipurpose Protection', 'NERSA Grid Code Ch3',
 'transmission', 'eng_priya_naidoo', 'grid_wit_so_002',
 0, NULL, NULL,
 date('now', '-3 days'), 1, 1,
 'grid_wit_so_002', 'Relay hardware fault confirmed. Anti-islanding function inoperable. MANDATORY SAFETY DISCONNECT issued per NRS 097-2-3 s8.5. Unit must be replaced before reconnection authorised.',
 datetime('now', '-20 days'), datetime('now', '-3 days'));
