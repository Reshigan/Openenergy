-- ════════════════════════════════════════════════════════════════════════
-- 074_esums_demo_seed.sql — realistic SA fleet demo data for Esums O&M.
--
-- Six sites across five provinces. Telemetry, faults, work orders, parts,
-- maintenance, OEM connections, predictions and alerts are crafted so that
-- every one of the 13 opportunity detectors in esums-om-analysis.ts has at
-- least one detection — this is what makes the Opportunities tab show real
-- R-quantified inefficiencies to a customer on first load.
--
-- Idempotent: every INSERT uses OR IGNORE / OR REPLACE keyed on stable ids.
-- ════════════════════════════════════════════════════════════════════════

-- ─── Sites ──────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO om_sites
  (id, name, technology, capacity_mw, capacity_kwp, province, latitude, longitude,
   commissioning_date, ppa_tariff_zar_mwh, status)
VALUES
  ('demo_site_kgw',  'Kgalagadi Solar Park',     'solar',   50,  62500, 'Northern Cape',  -27.30, 22.50, '2023-03-15', 1400, 'operational'),
  ('demo_site_klr',  'Klerksdorp Solar Farm',    'solar',   30,  37500, 'North West',     -26.85, 26.65, '2022-11-01', 1380, 'operational'),
  ('demo_site_jbs',  'Jeffreys Bay Wind',        'wind',    80,  NULL,  'Eastern Cape',   -34.05, 24.93, '2021-06-20', 1450, 'operational'),
  ('demo_site_wcp',  'Worcester Solar',          'solar',   25,  31250, 'Western Cape',   -33.65, 19.45, '2023-08-10', 1420, 'operational'),
  ('demo_site_glr',  'Gariep Battery Storage',   'bess',    15,  NULL,  'Free State',     -30.62, 25.51, '2024-02-01', 1800, 'operational'),
  ('demo_site_pmb',  'Pietermaritzburg Solar',   'solar',   20,  25000, 'KwaZulu-Natal',  -29.62, 30.39, '2024-05-15', 1400, 'operational');

-- ─── Devices ────────────────────────────────────────────────────────────
-- Mix of inverters/meters/sensors. Firmware versions chosen so two sites
-- share the same OEM+FW for the cross-site firmware_pattern detector.
INSERT OR IGNORE INTO om_devices
  (id, site_id, device_type, manufacturer, model, serial_number, firmware_version,
   installed_at, warranty_expiry, rated_kw, status, last_seen_at, location_in_plant)
VALUES
  -- Kgalagadi — Huawei FusionSolar (healthy baseline)
  ('demo_dev_kgw_inv1','demo_site_kgw','inverter','Huawei','SUN2000-185KTL','SN-KGW-INV-001','1.4.7','2023-03-15','2031-03-15',185,'online', datetime('now','-5 minutes'),'Row 1, INV-1'),
  ('demo_dev_kgw_inv2','demo_site_kgw','inverter','Huawei','SUN2000-185KTL','SN-KGW-INV-002','1.4.7','2023-03-15','2031-03-15',185,'online', datetime('now','-5 minutes'),'Row 1, INV-2'),
  ('demo_dev_kgw_inv3','demo_site_kgw','inverter','Huawei','SUN2000-185KTL','SN-KGW-INV-003','1.4.7','2023-03-15','2031-03-15',185,'warning', datetime('now','-12 minutes'),'Row 2, INV-3'),
  ('demo_dev_kgw_met1','demo_site_kgw','meter',   'Landis+Gyr','E650','SN-KGW-MET-001','3.5.1','2023-03-15','2030-03-15',NULL,'online', datetime('now','-5 minutes'),'Substation'),

  -- Klerksdorp — older site, will show module degradation
  ('demo_dev_klr_inv1','demo_site_klr','inverter','SMA','Sunny Tripower CORE2','SN-KLR-INV-001','2.10.5','2022-11-01','2030-11-01',150,'online', datetime('now','-5 minutes'),'Row 1, INV-1'),
  ('demo_dev_klr_inv2','demo_site_klr','inverter','SMA','Sunny Tripower CORE2','SN-KLR-INV-002','2.10.5','2022-11-01','2030-11-01',150,'online', datetime('now','-5 minutes'),'Row 1, INV-2'),
  ('demo_dev_klr_inv3','demo_site_klr','inverter','SMA','Sunny Tripower CORE2','SN-KLR-INV-003','2.10.5','2022-11-01','2030-11-01',150,'fault',   datetime('now','-2 hours'),'Row 2, INV-3'),

  -- Jeffreys Bay Wind — Vestas
  ('demo_dev_jbs_wt1','demo_site_jbs','inverter','Vestas','V112-3.45MW','SN-JBS-WT-001','7.2.0','2021-06-20','2031-06-20',3450,'online', datetime('now','-3 minutes'),'WTG-1'),
  ('demo_dev_jbs_wt2','demo_site_jbs','inverter','Vestas','V112-3.45MW','SN-JBS-WT-002','7.2.0','2021-06-20','2031-06-20',3450,'online', datetime('now','-3 minutes'),'WTG-2'),
  ('demo_dev_jbs_wt3','demo_site_jbs','inverter','Vestas','V112-3.45MW','SN-JBS-WT-003','7.2.0','2021-06-20','2031-06-20',3450,'warning', datetime('now','-20 minutes'),'WTG-3'),

  -- Worcester — SolarEdge, firmware pattern A (matches PMB)
  ('demo_dev_wcp_inv1','demo_site_wcp','inverter','SolarEdge','SE125K','SN-WCP-INV-001','4.16.2','2023-08-10','2031-08-10',125,'online', datetime('now','-5 minutes'),'Row 1, INV-1'),
  ('demo_dev_wcp_inv2','demo_site_wcp','inverter','SolarEdge','SE125K','SN-WCP-INV-002','4.16.2','2023-08-10','2031-08-10',125,'warning', datetime('now','-8 minutes'),'Row 1, INV-2'),

  -- Gariep — BYD battery + SMA hybrid
  ('demo_dev_glr_bat1','demo_site_glr','battery','BYD','HVS 12.8','SN-GLR-BAT-001','1.2.4','2024-02-01','2034-02-01',7500,'online', datetime('now','-5 minutes'),'Container A'),
  ('demo_dev_glr_bms1','demo_site_glr','bms',    'SMA','Sunny Boy Storage','SN-GLR-BMS-001','2.20.0','2024-02-01','2034-02-01',NULL,'online', datetime('now','-5 minutes'),'Container A'),

  -- Pietermaritzburg — SolarEdge, firmware pattern A (matches WCP)
  ('demo_dev_pmb_inv1','demo_site_pmb','inverter','SolarEdge','SE125K','SN-PMB-INV-001','4.16.2','2024-05-15','2032-05-15',125,'online', datetime('now','-5 minutes'),'Row 1, INV-1'),
  ('demo_dev_pmb_inv2','demo_site_pmb','inverter','SolarEdge','SE125K','SN-PMB-INV-002','4.16.2','2024-05-15','2032-05-15',125,'online', datetime('now','-5 minutes'),'Row 1, INV-2');

-- ─── Telemetry — 180 days of daily yield per device ─────────────────────
-- The detector findModuleDegradation compares last 90 days against the
-- prior 90 days, so KLR is given a 4% drop in the recent window.
-- Other sites get healthy baselines with mild noise (sin(day)).
--
-- Per-device daily yield approximation: rated_kw × 5.0 PSH = daily kWh
-- baseline, then per-site multiplier captures health.
WITH RECURSIVE days(n) AS (
  SELECT 0 UNION ALL SELECT n+1 FROM days WHERE n < 179
)
INSERT OR IGNORE INTO om_telemetry
  (id, device_id, site_id, ts, interval_kwh, ac_kw, quality)
SELECT
  'demo_omt_' || d.id || '_' || days.n,
  d.id, d.site_id,
  datetime('now', '-' || days.n || ' days', 'start of day', '+12 hours'),
  -- Daily kWh per device
  CAST(
    COALESCE(d.rated_kw, 50)
    * 5.0  -- average peak sun hours per day
    * CASE d.site_id
        -- KLR: 96% recent 90d, 100% prior 90d → triggers degradation
        WHEN 'demo_site_klr' THEN CASE WHEN days.n < 90 THEN 0.96 ELSE 1.00 END
        -- WCP + PMB: low PR on shared firmware (78%)
        WHEN 'demo_site_wcp' THEN 0.78
        WHEN 'demo_site_pmb' THEN 0.79
        -- JBS wind: more variable (0.4..1.1)
        WHEN 'demo_site_jbs' THEN 0.60 + 0.5 * abs(((days.n * 37) % 100) / 100.0)
        -- GLR battery: charge/discharge cycles
        WHEN 'demo_site_glr' THEN 0.65
        -- KGW: healthy
        ELSE 0.92
      END
    -- diurnal noise (deterministic)
    * (1.0 - 0.05 * ((days.n % 7) / 7.0))
  AS REAL),
  -- ac_kw snapshot = interval_kwh / 12h
  NULL,
  'valid'
FROM days CROSS JOIN om_devices d
WHERE d.id LIKE 'demo_dev_%' AND d.device_type IN ('inverter','battery');

-- ─── Faults ─────────────────────────────────────────────────────────────
-- Mix of open + resolved, sized to feed each detector.
INSERT OR IGNORE INTO om_faults
  (id, site_id, device_id, category, severity, fault_code, description,
   detected_at, status, hourly_loss_zar, total_loss_zar, warranty_covered,
   fault_history_count, weather_correlated)
VALUES
  -- Soiling — long-open fault (>30 days) at KGW → soiling_clean opportunity
  ('demo_flt_soil_kgw', 'demo_site_kgw', 'demo_dev_kgw_inv3',
   'panel', 'major', 'SOIL-001', 'Performance ratio drop on Row 2 — likely heavy dust accumulation.',
   datetime('now','-32 days'), 'open', 1850.0, 1421600.0, 0, 0, 0),

  -- Recurring inverter faults at KLR INV-3 (3 occurrences in 30d) → recurring_fault
  ('demo_flt_klr_rec1','demo_site_klr','demo_dev_klr_inv3',
   'inverter','major','INV-OVT','IGBT over-temperature trip',
   datetime('now','-26 days'), 'resolved', 0, 14400.0, 0, 0, 0),
  ('demo_flt_klr_rec2','demo_site_klr','demo_dev_klr_inv3',
   'inverter','major','INV-OVT','IGBT over-temperature trip (recurrence)',
   datetime('now','-14 days'), 'resolved', 0, 21600.0, 0, 1, 0),
  ('demo_flt_klr_rec3','demo_site_klr','demo_dev_klr_inv3',
   'inverter','critical','INV-OVT','IGBT over-temperature trip — third occurrence',
   datetime('now','-2 days'), 'open', 2400.0, 115200.0, 0, 2, 0),

  -- Underperforming string at KGW INV-3 → underperforming_string
  ('demo_flt_str_kgw','demo_site_kgw','demo_dev_kgw_inv3',
   'string','minor','STR-LOW','String 7 yielding 18% below adjacent strings — likely shading or PID',
   datetime('now','-21 days'), 'open', 380.0, 191520.0, 1, 0, 0),

  -- Curtailment events at JBS (5 in last 90d) → curtailment_recovery
  ('demo_flt_curt_jbs1','demo_site_jbs',NULL,'curtailment','major','GRID-CUR','Eskom dispatch curtailment 4h', datetime('now','-78 days'),'resolved',0, 248000.0, 0, 0, 0),
  ('demo_flt_curt_jbs2','demo_site_jbs',NULL,'curtailment','major','GRID-CUR','Eskom dispatch curtailment 3h', datetime('now','-58 days'),'resolved',0, 186000.0, 0, 0, 0),
  ('demo_flt_curt_jbs3','demo_site_jbs',NULL,'curtailment','major','GRID-CUR','Eskom dispatch curtailment 6h', datetime('now','-41 days'),'resolved',0, 372000.0, 0, 0, 0),
  ('demo_flt_curt_jbs4','demo_site_jbs',NULL,'curtailment','major','GRID-CUR','Eskom dispatch curtailment 2h', datetime('now','-22 days'),'resolved',0, 124000.0, 0, 0, 0),
  ('demo_flt_curt_jbs5','demo_site_jbs',NULL,'curtailment','major','GRID-CUR','Eskom dispatch curtailment 5h', datetime('now','-6 days'),'resolved',0, 310000.0, 0, 0, 0),

  -- MTTR outlier — WCP critical fault still open after 12 days → mttr_outlier
  ('demo_flt_mttr_wcp','demo_site_wcp','demo_dev_wcp_inv2',
   'inverter','critical','COMM-LOSS','Communication loss — site offline',
   datetime('now','-12 days'), 'in_progress', 5200.0, 1497600.0, 1, 0, 0),

  -- Pre-failure prediction backing fault (warranty leakage hint) at JBS
  ('demo_flt_jbs_warn','demo_site_jbs','demo_dev_jbs_wt3',
   'inverter','minor','WTG-VIB','Gearbox vibration trending up — replace bearing within 30d',
   datetime('now','-3 days'), 'acknowledged', 0, 0, 1, 0, 0);

-- ─── Work orders ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO om_work_orders
  (id, wo_number, site_id, fault_id, category, priority, status,
   title, description, sla_response_minutes, sla_resolve_hours, sla_deadline,
   sla_breached, parts_cost_zar, labour_cost_zar, total_cost_zar, first_time_fix,
   completed_at)
VALUES
  -- SLA-breached cluster at WCP (3 breaches) → sla_breach_cluster
  ('demo_wo_wcp_001','WO-DEMO-1001','demo_site_wcp','demo_flt_mttr_wcp',
   'corrective','critical','repairing',
   'Restore communication to INV-2',
   'Site offline, suspect Modbus gateway. Need on-site diagnosis.',
   240, 24, datetime('now','-11 days'), 1, 4200, 7200, 11400, NULL, NULL),
  ('demo_wo_wcp_002','WO-DEMO-1002','demo_site_wcp',NULL,
   'preventive','high','assigned',
   'Quarterly thermal imaging — Row 1',
   'Thermal scan all string DC combiners.',
   480, 24, datetime('now','-3 days'), 1, 0, 3600, 3600, NULL, NULL),
  ('demo_wo_wcp_003','WO-DEMO-1003','demo_site_wcp',NULL,
   'cleaning','medium','on_site',
   'Panel wash Row 2',
   'Soiling > 5%, dispatch wash crew.',
   1440, 8, datetime('now','-1 day'), 1, 1200, 4800, 6000, NULL, NULL),

  -- Warranty leakage WO — JBS in-warranty device but we paid → warranty_leakage
  ('demo_wo_jbs_001','WO-DEMO-2001','demo_site_jbs','demo_flt_jbs_warn',
   'corrective','high','completed',
   'Gearbox bearing replacement WTG-3',
   'Vibration signature elevated. Bearing swap.',
   480, 48, datetime('now','-1 day'), 0, 92000, 41000, 138500, 1,
   datetime('now','-1 day')),

  -- KGW soiling response WO (in-progress)
  ('demo_wo_kgw_001','WO-DEMO-3001','demo_site_kgw','demo_flt_soil_kgw',
   'cleaning','medium','assigned',
   'Full-site panel wash',
   'Soiling fault open 32 days. Mobilise wash crew, 4 days estimated.',
   1440, 96, datetime('now','+2 days'), 0, 8200, 32000, 42000, NULL, NULL),

  -- KLR recurring fault response (closed)
  ('demo_wo_klr_001','WO-DEMO-4001','demo_site_klr','demo_flt_klr_rec3',
   'corrective','critical','completed',
   'INV-3 IGBT replacement (3rd occurrence)',
   'Recurring trips — full IGBT bridge replacement.',
   240, 24, datetime('now','-1 day'), 0, 28500, 9600, 41200, 0,
   datetime('now','-1 day')),

  -- High O&M cost site at KLR (drives om_cost_outlier)
  ('demo_wo_klr_002','WO-DEMO-4002','demo_site_klr',NULL,
   'corrective','high','completed',
   'AC contactor replacement INV-1',
   'Replaced after fail-safe trip.',
   240, 24, datetime('now','-18 days'), 0, 14500, 6400, 21500, 1, datetime('now','-18 days')),
  ('demo_wo_klr_003','WO-DEMO-4003','demo_site_klr',NULL,
   'corrective','medium','completed',
   'String fuse rebuild — DC combiner 3',
   'Three blown fuses, hotspot suspected.',
   240, 12, datetime('now','-45 days'), 0, 3200, 5400, 9100, 1, datetime('now','-45 days')),
  ('demo_wo_klr_004','WO-DEMO-4004','demo_site_klr',NULL,
   'corrective','medium','completed',
   'Transformer tap-changer service',
   'Annual oil sample + tap change cycle.',
   480, 48, datetime('now','-62 days'), 0, 8200, 12200, 20800, 1, datetime('now','-62 days'));

-- ─── Technicians ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO om_technicians (id, name, phone, email, skills, status, active)
VALUES
  ('demo_tech_001','Sipho Khumalo','+27 82 555 1001','sipho@esums.co.za','["inverter","high_voltage","Huawei"]','available',1),
  ('demo_tech_002','Marius van Wyk','+27 83 555 1002','marius@esums.co.za','["wind","gearbox","Vestas"]','available',1),
  ('demo_tech_003','Nomvula Dlamini','+27 84 555 1003','nomvula@esums.co.za','["cleaning","string","DC"]','on_site',1),
  ('demo_tech_004','Pieter Botha','+27 82 555 1004','pieter@esums.co.za','["battery","BMS","BYD"]','available',1),
  ('demo_tech_005','Thandi Mokoena','+27 83 555 1005','thandi@esums.co.za','["SolarEdge","commissioning","SMA"]','off_duty',1);

-- ─── Parts ──────────────────────────────────────────────────────────────
-- Two stocks below min → parts_stockout opportunity
INSERT OR IGNORE INTO om_parts
  (id, part_number, name, manufacturer, unit_cost_zar, lead_time_days, min_stock_qty, current_stock)
VALUES
  ('demo_part_001','IGBT-185-HW','Huawei IGBT bridge module','Huawei',8200,21, 4, 1),
  ('demo_part_002','FUSE-15A-DC','DC string fuse 15A',         'Eaton', 145,7,  50, 12),
  ('demo_part_003','MODB-GTW','Modbus TCP gateway',             'Moxa', 4800,14, 2, 3),
  ('demo_part_004','BRG-V112','Main bearing — Vestas V112',     'SKF', 92000,45, 1, 1),
  ('demo_part_005','CTCR-AC-3P','AC contactor 3-pole 200A',     'ABB', 2400,7,  6, 7),
  ('demo_part_006','CABLE-DC-6','DC cable 6mm² (100m)',         'Eland', 2200,3, 10, 18);

-- ─── Maintenance ────────────────────────────────────────────────────────
-- Two overdue items → maintenance_backlog opportunity
INSERT OR IGNORE INTO om_maintenance
  (id, site_id, device_id, task_type, frequency_days, last_done_at, next_due_at,
   status, estimated_duration_minutes, required_skill, auto_create_wo_days)
VALUES
  ('demo_mnt_001','demo_site_kgw',NULL,'panel_cleaning',     90, datetime('now','-110 days'), datetime('now','-20 days'), 'overdue', 480, 'cleaning', 7),
  ('demo_mnt_002','demo_site_klr',NULL,'inverter_inspection', 180, datetime('now','-200 days'), datetime('now','-20 days'), 'overdue', 240, 'inverter', 7),
  ('demo_mnt_003','demo_site_wcp',NULL,'thermal_imaging',     180, datetime('now','-30 days'), datetime('now','+150 days'), 'scheduled', 180, 'thermal', 7),
  ('demo_mnt_004','demo_site_jbs',NULL,'switchgear_inspection',365, datetime('now','-200 days'), datetime('now','+165 days'), 'scheduled', 360, 'high_voltage', 7),
  ('demo_mnt_005','demo_site_glr',NULL,'battery_health',     30, datetime('now','-20 days'),  datetime('now','+10 days'),  'scheduled', 120, 'battery', 5);

-- ─── OEM ingestion connections ──────────────────────────────────────────
INSERT OR IGNORE INTO om_connections
  (id, site_id, adapter, endpoint_url, polling_minutes, last_poll_at, last_status, enabled)
VALUES
  ('demo_conn_kgw','demo_site_kgw','huawei',   'https://intl.fusionsolar.huawei.com/thirdData', 15, datetime('now','-5 minutes'), 'ok',    1),
  ('demo_conn_klr','demo_site_klr','sma',       'https://www.sunnyportal.com/api/v1',            15, datetime('now','-5 minutes'), 'ok',    1),
  ('demo_conn_jbs','demo_site_jbs','modbus',    NULL,                                            5,  datetime('now','-2 hours'),  'error', 1),
  ('demo_conn_wcp','demo_site_wcp','solaredge', 'https://monitoringapi.solaredge.com',           15, datetime('now','-5 minutes'), 'ok',    1),
  ('demo_conn_glr','demo_site_glr','sma',       'https://www.sunnyportal.com/api/v1',            15, datetime('now','-5 minutes'), 'ok',    1),
  ('demo_conn_pmb','demo_site_pmb','solaredge', 'https://monitoringapi.solaredge.com',           15, datetime('now','-5 minutes'), 'ok',    1);

-- ─── Predictive failures ────────────────────────────────────────────────
-- Inverter pre-failure → inverter_pre_failure opportunity
INSERT OR IGNORE INTO om_predictions
  (id, site_id, device_id, prediction_type, confidence, estimated_failure_at,
   recommended_action, estimated_loss_zar, status)
VALUES
  ('demo_pred_001','demo_site_jbs','demo_dev_jbs_wt3','inverter_failure', 0.82,
   datetime('now','+18 days'), 'Replace gearbox bearing within 14 days — vibration signature trending.', 920000, 'open'),
  ('demo_pred_002','demo_site_klr','demo_dev_klr_inv3','inverter_failure', 0.74,
   datetime('now','+9 days'),  'IGBT trip pattern suggests upcoming hard failure — schedule controlled swap.', 480000, 'open'),
  ('demo_pred_003','demo_site_kgw','demo_dev_kgw_inv3','panel_hotspot',   0.68,
   datetime('now','+45 days'), 'Thermal scan + replace 4 modules in String 7.', 142000, 'open');

-- ─── Alerts ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO om_alerts
  (id, site_id, device_id, category, severity, title, body)
VALUES
  ('demo_alt_001','demo_site_kgw',NULL,                   'revenue',    'major',    'Site bleeding R1850/h', 'Soiling fault open 32 days. Cumulative R1.42m lost.'),
  ('demo_alt_002','demo_site_klr','demo_dev_klr_inv3',    'fault',      'critical', 'INV-3 third over-temp trip in 30 days', 'Replace IGBT bridge — recurrence indicates hardware degradation.'),
  ('demo_alt_003','demo_site_wcp',NULL,                   'sla',        'critical', '3 SLA breaches at Worcester', 'Comm-loss WO blown past 24h target by 264h.'),
  ('demo_alt_004','demo_site_jbs','demo_dev_jbs_wt3',     'predictive', 'minor',    'WTG-3 gearbox vibration trending', '14-day window to replace bearing under warranty.'),
  ('demo_alt_005','demo_site_kgw',NULL,                   'maintenance','minor',    'Panel cleaning 20 days overdue', 'Triggers auto-WO in next cron run.'),
  ('demo_alt_006','demo_site_jbs',NULL,                   'fault',      'major',    '5 curtailment events in 90 days', 'Battery sizing study recommended.'),
  ('demo_alt_007','demo_site_klr',NULL,                   'revenue',    'minor',    'Performance ratio drift', '90d PR down 4% vs prior window — possible PID.'),
  ('demo_alt_008','demo_site_wcp','demo_dev_wcp_inv1',    'fault',      'minor',    'Firmware version 4.16.2 flagged', 'PMB on same FW also showing low PR.'),
  ('demo_alt_009','demo_site_kgw',NULL,                   'predictive', 'minor',    'String 7 hotspot likely',         'Thermal imaging proposed in 45 days.'),
  ('demo_alt_010','demo_site_glr','demo_dev_glr_bat1',    'maintenance','minor',    'Battery cycle count milestone',   'Approaching 2000 cycles, schedule health check.');
