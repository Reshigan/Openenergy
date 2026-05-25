-- ════════════════════════════════════════════════════════════════════════
-- 075_esums_water.sql — water utility support in Esums O&M.
--
-- Esums was built around PV / wind / battery. This migration extends the
-- same schema to water assets (boreholes, pumps, treatment plants, dams)
-- by adding water-specific columns to om_telemetry, registering new
-- device_type / technology values, and seeding two demo water sites
-- crafted to fire the new water opportunity detectors.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Schema extension — water columns on om_telemetry ──────────────────
-- ALTER TABLE has no IF NOT EXISTS in SQLite; the CI migration applier
-- treats "duplicate column" as already-applied, matching the discipline
-- documented in CLAUDE.md.
ALTER TABLE om_telemetry ADD COLUMN flow_lps REAL;
ALTER TABLE om_telemetry ADD COLUMN pressure_bar REAL;
ALTER TABLE om_telemetry ADD COLUMN level_m REAL;
ALTER TABLE om_telemetry ADD COLUMN treated_kl REAL;
ALTER TABLE om_telemetry ADD COLUMN raw_kl REAL;
ALTER TABLE om_telemetry ADD COLUMN pump_kw REAL;

-- ─── Per-site water billing rate ───────────────────────────────────────
-- om_sites already has ppa_tariff_zar_mwh for energy; water sites bill
-- on a R/kL tariff. Reuse the same column slot by adding a sibling
-- so revenue computations can branch on technology.
ALTER TABLE om_sites ADD COLUMN water_tariff_zar_kl REAL;

-- ─── Demo water sites ──────────────────────────────────────────────────
INSERT OR IGNORE INTO om_sites
  (id, name, technology, capacity_mw, province, latitude, longitude,
   commissioning_date, water_tariff_zar_kl, ppa_tariff_zar_mwh, status)
VALUES
  -- Borehole + treatment plant feeding a municipal reservoir
  ('demo_site_lim','Limpopo Borehole Cluster','water', 0, 'Limpopo', -23.41, 29.46,
   '2022-09-12', 14.80, NULL, 'operational'),
  -- Mine-water reclamation plant (medium scale)
  ('demo_site_mpu','Mpumalanga Mine Water Reclamation','water', 0, 'Mpumalanga', -26.15, 29.20,
   '2023-04-20', 12.40, NULL, 'operational');

-- ─── Devices — pumps, flow meters, pressure & level sensors ─────────────
INSERT OR IGNORE INTO om_devices
  (id, site_id, device_type, manufacturer, model, serial_number, firmware_version,
   installed_at, warranty_expiry, rated_kw, status, last_seen_at, location_in_plant)
VALUES
  -- Limpopo borehole cluster
  ('demo_dev_lim_pump1','demo_site_lim','pump',        'Grundfos','SP 60-12',          'SN-LIM-PMP-001','3.4.1','2022-09-12','2030-09-12',75,  'online',  datetime('now','-3 minutes'),'BH-1'),
  ('demo_dev_lim_pump2','demo_site_lim','pump',        'Grundfos','SP 60-12',          'SN-LIM-PMP-002','3.4.1','2022-09-12','2030-09-12',75,  'online',  datetime('now','-3 minutes'),'BH-2'),
  ('demo_dev_lim_pump3','demo_site_lim','pump',        'Grundfos','SP 60-12',          'SN-LIM-PMP-003','3.4.1','2022-09-12','2030-09-12',75,  'warning', datetime('now','-12 minutes'),'BH-3'),
  ('demo_dev_lim_flow1','demo_site_lim','flow_meter',  'Endress+Hauser','Proline 500', 'SN-LIM-FLO-001','2.1.0','2022-09-12','2032-09-12',NULL,'online',  datetime('now','-3 minutes'),'Outlet'),
  ('demo_dev_lim_lvl1','demo_site_lim','level_sensor', 'VEGA','VEGAPULS C 21',         'SN-LIM-LVL-001','1.5.0','2022-09-12','2030-09-12',NULL,'online',  datetime('now','-3 minutes'),'Reservoir A'),

  -- Mpumalanga mine reclamation
  ('demo_dev_mpu_trt1','demo_site_mpu','treatment_unit','Veolia','Actiflo Pack',       'SN-MPU-TRT-001','5.0.2','2023-04-20','2033-04-20',250,'online',  datetime('now','-3 minutes'),'Train 1'),
  ('demo_dev_mpu_pump1','demo_site_mpu','pump',        'KSB','Etanorm 200',            'SN-MPU-PMP-001','4.2.0','2023-04-20','2031-04-20',150,'online',  datetime('now','-3 minutes'),'Raw water'),
  ('demo_dev_mpu_pump2','demo_site_mpu','pump',        'KSB','Etanorm 200',            'SN-MPU-PMP-002','4.2.0','2023-04-20','2031-04-20',150,'online',  datetime('now','-3 minutes'),'Distribution'),
  ('demo_dev_mpu_flow1','demo_site_mpu','flow_meter',  'Siemens','SITRANS F M MAG 8000','SN-MPU-FLO-001','1.0.4','2023-04-20','2033-04-20',NULL,'online', datetime('now','-3 minutes'),'Treated outlet'),
  ('demo_dev_mpu_pres1','demo_site_mpu','pressure_sensor','WIKA','UPT-20',             'SN-MPU-PRS-001','1.0.0','2023-04-20','2030-04-20',NULL,'online',  datetime('now','-3 minutes'),'Distribution main');

-- ─── Telemetry — 180 days, lights up every water detector ──────────────
--
-- LIM borehole cluster:
--   • Pumps run ~16h/day. PMP-3 has degraded efficiency (kWh/kL 1.6 vs 1.0
--     baseline) → pump_inefficiency detector.
--   • Off-peak flow > 0 (overnight leak ~12 L/s) → water_leak detector.
--
-- MPU mine reclamation:
--   • Raw water in vs treated water out — yield trending down from 92% to
--     78% over last 30 days → treatment_recovery detector.
--
-- We synthesise daily roll-ups (one row per device per day) — that's also
-- the granularity the per-site charts use, so the demo looks instant.
WITH RECURSIVE days(n) AS (
  SELECT 0 UNION ALL SELECT n+1 FROM days WHERE n < 179
)
INSERT OR IGNORE INTO om_telemetry
  (id, device_id, site_id, ts, quality, flow_lps, pressure_bar, level_m,
   treated_kl, raw_kl, pump_kw, interval_kwh)
SELECT
  'demo_omt_w_' || d.id || '_' || days.n,
  d.id, d.site_id,
  datetime('now', '-' || days.n || ' days', 'start of day', '+12 hours'),
  'valid',
  -- flow_lps: pumps push 35 L/s on healthy days; PMP-3 still pushes 32 L/s
  -- but consumes more energy per kL. flow_meter records aggregate site flow.
  CASE
    WHEN d.device_type = 'pump' AND d.id = 'demo_dev_lim_pump3' THEN 32.0
    WHEN d.device_type = 'pump'      THEN 35.0
    WHEN d.device_type = 'flow_meter'AND d.site_id = 'demo_site_lim' THEN 102.0
    WHEN d.device_type = 'flow_meter'AND d.site_id = 'demo_site_mpu' THEN 180.0
    ELSE NULL
  END,
  -- pressure_bar
  CASE d.device_type
    WHEN 'pressure_sensor' THEN 4.2
    WHEN 'pump'            THEN 6.8
    ELSE NULL
  END,
  -- level_m: dam slowly drawing down (-0.02 m/day)
  CASE d.device_type
    WHEN 'level_sensor' THEN 14.5 - (days.n * 0.02)
    ELSE NULL
  END,
  -- treated_kl: MPU train degrading from 92% recovery to 78% over last 30 days
  CASE
    WHEN d.id = 'demo_dev_mpu_trt1' THEN
      CASE WHEN days.n < 30 THEN 15552 * 0.78 + 50 * ((days.n * 13) % 11)
           ELSE 15552 * 0.92 END
    ELSE NULL
  END,
  -- raw_kl: site daily raw water intake
  CASE
    WHEN d.id = 'demo_dev_mpu_trt1' THEN 15552
    ELSE NULL
  END,
  -- pump_kw: PMP-3 burns 60% more kWh/kL than baseline
  CASE
    WHEN d.id = 'demo_dev_lim_pump3' THEN 75 * 0.85 * 1.0
    WHEN d.device_type = 'pump' AND d.site_id = 'demo_site_lim' THEN 75 * 0.85 * 0.6
    WHEN d.device_type = 'pump' AND d.site_id = 'demo_site_mpu' THEN 150 * 0.75
    ELSE NULL
  END,
  -- interval_kwh: synthesise pump energy use per day
  CASE
    WHEN d.id = 'demo_dev_lim_pump3' THEN 75 * 16 * 1.0
    WHEN d.device_type = 'pump' AND d.site_id = 'demo_site_lim' THEN 75 * 16 * 0.6
    WHEN d.device_type = 'pump' AND d.site_id = 'demo_site_mpu' THEN 150 * 18 * 0.75
    ELSE NULL
  END
FROM days CROSS JOIN om_devices d
WHERE d.id LIKE 'demo_dev_lim_%' OR d.id LIKE 'demo_dev_mpu_%';

-- ─── Water faults ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO om_faults
  (id, site_id, device_id, category, severity, fault_code, description,
   detected_at, status, hourly_loss_zar, total_loss_zar, warranty_covered,
   fault_history_count)
VALUES
  -- Overnight leak — 12 L/s observed off-peak for 14 days at R14.80/kL
  -- → 12 * 3600 * 8 / 1000 * 14.80 = R5,114 lost / overnight
  ('demo_flt_leak_lim','demo_site_lim',NULL,
   'water','major','LEAK-NOC','Overnight flow ~12 L/s suggests pipe leak past primary isolation valves.',
   datetime('now','-14 days'),'open', 213.0, 71640.0, 0, 0),

  -- PMP-3 efficiency degradation (open)
  ('demo_flt_pmp3','demo_site_lim','demo_dev_lim_pump3',
   'water','minor','PMP-EFF','BH-3 pump kWh/kL up 60% vs fleet baseline — likely worn impeller.',
   datetime('now','-22 days'),'open', 85.0, 44880.0, 0, 0),

  -- MPU treatment recovery dropping
  ('demo_flt_mpu_yld','demo_site_mpu','demo_dev_mpu_trt1',
   'water','major','TRT-YIELD','Treated/raw water yield dropped from 92% to 78% over 30 days. Filter fouling suspected.',
   datetime('now','-30 days'),'in_progress', 1450.0, 1044000.0, 1, 0);

-- ─── Water work orders ─────────────────────────────────────────────────
INSERT OR IGNORE INTO om_work_orders
  (id, wo_number, site_id, fault_id, category, priority, status,
   title, description, sla_response_minutes, sla_resolve_hours, sla_deadline,
   sla_breached, parts_cost_zar, labour_cost_zar, total_cost_zar, first_time_fix)
VALUES
  ('demo_wo_lim_001','WO-DEMO-5001','demo_site_lim','demo_flt_leak_lim',
   'corrective','high','en_route',
   'Pressure-test isolation valves V3–V7',
   'Locate the overnight-flow source by sequential pressure isolation.',
   480, 24, datetime('now','+1 day'), 0, 0, 4800, 4800, NULL),
  ('demo_wo_lim_002','WO-DEMO-5002','demo_site_lim','demo_flt_pmp3',
   'corrective','medium','assigned',
   'Pull pump impeller BH-3 for inspection',
   'Pump kWh/kL up 60%. Likely worn impeller; budget for replacement.',
   1440, 48, datetime('now','+3 days'), 0, 24000, 14400, 38400, NULL),
  ('demo_wo_mpu_001','WO-DEMO-6001','demo_site_mpu','demo_flt_mpu_yld',
   'corrective','high','diagnosing',
   'Filter media inspection Train 1',
   'Recovery rate 78% vs 92% target. Inspect/clean/replace filter media.',
   720, 72, datetime('now','+2 days'), 0, 142000, 56000, 198000, NULL);

-- ─── OEM connections — water-utility adapters ──────────────────────────
INSERT OR IGNORE INTO om_connections
  (id, site_id, adapter, endpoint_url, polling_minutes, last_poll_at, last_status, enabled)
VALUES
  -- Pull telemetry over Modbus/SCADA gateways (Workers can't TCP — agent-pushed)
  ('demo_conn_lim','demo_site_lim','modbus', NULL, 15, datetime('now','-5 minutes'), 'ok', 1),
  ('demo_conn_mpu','demo_site_mpu','modbus', NULL, 15, datetime('now','-5 minutes'), 'ok', 1);

-- ─── Maintenance — water-specific tasks ────────────────────────────────
INSERT OR IGNORE INTO om_maintenance
  (id, site_id, device_id, task_type, frequency_days, last_done_at, next_due_at,
   status, estimated_duration_minutes, required_skill, auto_create_wo_days)
VALUES
  ('demo_mnt_w_001','demo_site_lim','demo_dev_lim_pump1','generator_service', 90, datetime('now','-95 days'), datetime('now','-5 days'),  'overdue', 240, 'pump',        7),
  ('demo_mnt_w_002','demo_site_mpu',NULL,                  'meter_calibration', 180, datetime('now','-30 days'), datetime('now','+150 days'),'scheduled', 120, 'instrumentation', 7);

-- ─── Predictive — water ────────────────────────────────────────────────
INSERT OR IGNORE INTO om_predictions
  (id, site_id, device_id, prediction_type, confidence, estimated_failure_at,
   recommended_action, estimated_loss_zar, status)
VALUES
  ('demo_pred_w_001','demo_site_lim','demo_dev_lim_pump3','battery_degradation', 0.71,
   datetime('now','+25 days'), 'BH-3 impeller wear curve suggests <30 days to hard failure — schedule replacement.', 184000, 'open'),
  ('demo_pred_w_002','demo_site_mpu','demo_dev_mpu_trt1','soiling_accumulation', 0.78,
   datetime('now','+10 days'), 'Filter media replacement window — recovery curve projects further 6% drop.', 312000, 'open');

-- ─── Alerts — water ────────────────────────────────────────────────────
INSERT OR IGNORE INTO om_alerts
  (id, site_id, device_id, category, severity, title, body)
VALUES
  ('demo_alt_w_001','demo_site_lim',NULL,                'revenue',    'major',   'Overnight leak — 12 L/s', 'Bleeding R213/h after-hours. Pressure-test scheduled.'),
  ('demo_alt_w_002','demo_site_lim','demo_dev_lim_pump3','fault',      'minor',   'BH-3 pump efficiency down 60%', 'Impeller wear suspected; replacement WO open.'),
  ('demo_alt_w_003','demo_site_mpu','demo_dev_mpu_trt1', 'fault',      'major',   'Treatment recovery 78%', 'Down from 92% baseline; filter media inspection in progress.'),
  ('demo_alt_w_004','demo_site_lim',NULL,                'maintenance','minor',   'Generator service 5 days overdue', 'Will auto-create WO on next cron run.');
