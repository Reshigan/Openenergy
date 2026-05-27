-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 12 — Esums site commissioning chain demo seed.
--
-- 9 demo sites covering every commissioning chain state so the UI tab,
-- KPI strip and Playwright smoke have content from launch.
--
-- States covered:
--   planned                 — site_comm_001 (just plotted, awaiting registration)
--   site_registered         — site_comm_002 (within SLA)
--   devices_registered      — site_comm_003 (within SLA)
--   ingestion_wired         — site_comm_004 (breached SLA, was due to first-telemetry)
--   first_telemetry_ok      — site_comm_005 (within SLA)
--   energised               — site_comm_006 (energised but pre-handover)
--   in_om                   — site_comm_007 (full lifecycle complete)
--   commissioning_failed    — site_comm_008 (failed at ingestion stage)
--   decommissioned          — site_comm_009 (was in_om, now retired)
--
-- All cap dates anchored prior to 'now' to make SLA breach computations
-- meaningful. INSERT OR IGNORE keeps replay safe.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO om_sites
  (id, name, technology, capacity_mw, capacity_kwp, province, latitude, longitude,
   commissioning_date, ppa_tariff_zar_mwh, status,
   commissioning_status, commissioning_started_at, commissioning_due_at,
   devices_registered_at, ingestion_wired_at, first_telemetry_at, energised_at, in_om_at,
   commissioning_failed_at, commissioning_failure_reason, last_commissioning_sla_breach_at,
   created_at)
VALUES
  ('site_comm_001', 'Karoo South PV (planned)', 'solar', 50.0, 60000, 'Northern Cape', -30.1, 21.6,
    NULL, 1180.00, 'construction',
    'planned', NULL, NULL,
    NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    datetime('now','-7 days')),

  ('site_comm_002', 'Mooi River Wind I (registered)', 'wind', 75.0, NULL, 'Eastern Cape', -32.4, 26.1,
    NULL, 1095.00, 'construction',
    'site_registered', datetime('now','-3 days'), datetime('now','+11 days'),
    NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    datetime('now','-3 days')),

  ('site_comm_003', 'Beaufort PV II (devices)', 'solar', 30.0, 36000, 'Western Cape', -32.4, 22.6,
    NULL, 1140.00, 'construction',
    'devices_registered', datetime('now','-20 days'), datetime('now','+7 days'),
    datetime('now','-2 days'), NULL, NULL, NULL, NULL,
    NULL, NULL, NULL,
    datetime('now','-20 days')),

  ('site_comm_004', 'De Aar BESS (ingestion breached)', 'bess', 20.0, NULL, 'Northern Cape', -30.7, 24.0,
    NULL, 1320.00, 'construction',
    'ingestion_wired', datetime('now','-40 days'), datetime('now','-3 days'),
    datetime('now','-30 days'), datetime('now','-10 days'), NULL, NULL, NULL,
    NULL, NULL, datetime('now','-2 days'),
    datetime('now','-40 days')),

  ('site_comm_005', 'Loeriesfontein PV (telemetry OK)', 'solar', 100.0, 120000, 'Northern Cape', -30.95, 19.45,
    NULL, 1150.00, 'construction',
    'first_telemetry_ok', datetime('now','-50 days'), datetime('now','+25 days'),
    datetime('now','-40 days'), datetime('now','-20 days'), datetime('now','-5 days'), NULL, NULL,
    NULL, NULL, NULL,
    datetime('now','-50 days')),

  ('site_comm_006', 'Jeffreys Bay Wind (energised)', 'wind', 138.0, NULL, 'Eastern Cape', -34.1, 24.9,
    date('now','-15 days'), 1080.00, 'operational',
    'energised', datetime('now','-90 days'), NULL,
    datetime('now','-75 days'), datetime('now','-55 days'), datetime('now','-45 days'), datetime('now','-15 days'), NULL,
    NULL, NULL, NULL,
    datetime('now','-90 days')),

  ('site_comm_007', 'Linde PV Hybrid (in O&M)', 'hybrid', 40.0, 48000, 'Northern Cape', -30.0, 23.5,
    date('now','-120 days'), 1200.00, 'operational',
    'in_om', datetime('now','-150 days'), NULL,
    datetime('now','-135 days'), datetime('now','-120 days'), datetime('now','-115 days'), datetime('now','-120 days'), datetime('now','-90 days'),
    NULL, NULL, NULL,
    datetime('now','-150 days')),

  ('site_comm_008', 'Witkoppen PV (failed at ingestion)', 'solar', 8.0, 9600, 'Gauteng', -26.1, 27.9,
    NULL, 1230.00, 'construction',
    'commissioning_failed', datetime('now','-60 days'), datetime('now','-15 days'),
    datetime('now','-50 days'), datetime('now','-40 days'), NULL, NULL, NULL,
    datetime('now','-25 days'), 'Inverter OEM did not deliver Modbus/TCP adapter — site cannot ingest telemetry.', datetime('now','-30 days'),
    datetime('now','-60 days')),

  ('site_comm_009', 'Klipheuwel Wind (decommissioned)', 'wind', 27.0, NULL, 'Western Cape', -33.7, 18.7,
    date('now','-5 years'), 950.00, 'decommissioned',
    'decommissioned', datetime('now','-5 years'), NULL,
    datetime('now','-5 years'), datetime('now','-5 years'), datetime('now','-5 years'), datetime('now','-5 years'), datetime('now','-5 years'),
    NULL, NULL, NULL,
    datetime('now','-5 years'));

-- ─── Audit chain rows — at minimum a state-entry row for each non-planned site
INSERT OR IGNORE INTO oe_site_commissioning_events
  (id, site_id, event_type, from_status, to_status, actor_id, notes, created_at)
VALUES
  ('site_comm_evt_002a', 'site_comm_002', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered in onboarding portal',  datetime('now','-3 days')),
  ('site_comm_evt_003a', 'site_comm_003', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered',                        datetime('now','-20 days')),
  ('site_comm_evt_003b', 'site_comm_003', 'devices_registered',  'site_registered',    'devices_registered',   'demo_admin', '12 devices registered (10 inverters + 2 meters)', datetime('now','-2 days')),
  ('site_comm_evt_004a', 'site_comm_004', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered',                        datetime('now','-40 days')),
  ('site_comm_evt_004b', 'site_comm_004', 'devices_registered',  'site_registered',    'devices_registered',   'demo_admin', '6 BESS racks registered',                datetime('now','-30 days')),
  ('site_comm_evt_004c', 'site_comm_004', 'ingestion_wired',     'devices_registered', 'ingestion_wired',      'demo_admin', 'SunSync EMS wired via Modbus TCP',       datetime('now','-10 days')),
  ('site_comm_evt_004d', 'site_comm_004', 'sla_breached',        'ingestion_wired',    'ingestion_wired',      'system',     'No first-telemetry-OK signal — past 7d SLA', datetime('now','-2 days')),
  ('site_comm_evt_005a', 'site_comm_005', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered',                        datetime('now','-50 days')),
  ('site_comm_evt_005b', 'site_comm_005', 'devices_registered',  'site_registered',    'devices_registered',   'demo_admin', '120 inverters registered',               datetime('now','-40 days')),
  ('site_comm_evt_005c', 'site_comm_005', 'ingestion_wired',     'devices_registered', 'ingestion_wired',      'demo_admin', 'Huawei FusionSolar adapter wired',       datetime('now','-20 days')),
  ('site_comm_evt_005d', 'site_comm_005', 'first_telemetry_ok',  'ingestion_wired',    'first_telemetry_ok',   'system',     'First good telemetry reading received',  datetime('now','-5 days')),
  ('site_comm_evt_006a', 'site_comm_006', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered',                        datetime('now','-90 days')),
  ('site_comm_evt_006b', 'site_comm_006', 'devices_registered',  'site_registered',    'devices_registered',   'demo_admin', '60 turbines registered',                 datetime('now','-75 days')),
  ('site_comm_evt_006c', 'site_comm_006', 'ingestion_wired',     'devices_registered', 'ingestion_wired',      'demo_admin', 'Vestas SCADA wired',                     datetime('now','-55 days')),
  ('site_comm_evt_006d', 'site_comm_006', 'first_telemetry_ok',  'ingestion_wired',    'first_telemetry_ok',   'system',     'First good telemetry batch',             datetime('now','-45 days')),
  ('site_comm_evt_006e', 'site_comm_006', 'energised',           'first_telemetry_ok', 'energised',            'demo_admin', 'Energisation certificate signed',        datetime('now','-15 days')),
  ('site_comm_evt_007a', 'site_comm_007', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered',                        datetime('now','-150 days')),
  ('site_comm_evt_007b', 'site_comm_007', 'devices_registered',  'site_registered',    'devices_registered',   'demo_admin', '48 inverters + 6 batteries registered',  datetime('now','-135 days')),
  ('site_comm_evt_007c', 'site_comm_007', 'ingestion_wired',     'devices_registered', 'ingestion_wired',      'demo_admin', 'Sungrow + Tesla Powerpack adapters wired', datetime('now','-120 days')),
  ('site_comm_evt_007d', 'site_comm_007', 'first_telemetry_ok',  'ingestion_wired',    'first_telemetry_ok',   'system',     'First good telemetry — solar + BESS both online', datetime('now','-115 days')),
  ('site_comm_evt_007e', 'site_comm_007', 'energised',           'first_telemetry_ok', 'energised',            'demo_admin', 'COD certificate issued by NTCSA',        datetime('now','-120 days')),
  ('site_comm_evt_007f', 'site_comm_007', 'in_om',               'energised',          'in_om',                'demo_admin', 'EPC → O&M contractor handover',          datetime('now','-90 days')),
  ('site_comm_evt_008a', 'site_comm_008', 'site_registered',     'planned',            'site_registered',      'demo_admin', 'Site registered',                        datetime('now','-60 days')),
  ('site_comm_evt_008b', 'site_comm_008', 'devices_registered',  'site_registered',    'devices_registered',   'demo_admin', '12 inverters registered',                datetime('now','-50 days')),
  ('site_comm_evt_008c', 'site_comm_008', 'ingestion_wired',     'devices_registered', 'ingestion_wired',      'demo_admin', 'Modbus TCP adapter — OEM delay',         datetime('now','-40 days')),
  ('site_comm_evt_008d', 'site_comm_008', 'sla_breached',        'ingestion_wired',    'ingestion_wired',      'system',     'No first-telemetry-OK after 7d',         datetime('now','-30 days')),
  ('site_comm_evt_008e', 'site_comm_008', 'commissioning_failed','ingestion_wired',    'commissioning_failed', 'demo_admin', 'Inverter OEM never delivered Modbus adapter', datetime('now','-25 days')),
  ('site_comm_evt_009a', 'site_comm_009', 'in_om',               'energised',          'in_om',                'demo_admin', 'Legacy operational handover',            datetime('now','-5 years')),
  ('site_comm_evt_009b', 'site_comm_009', 'decommissioned',      'in_om',              'decommissioned',       'demo_admin', 'End-of-design-life — wind blades retired', datetime('now','-30 days'));
