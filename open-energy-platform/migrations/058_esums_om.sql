-- ════════════════════════════════════════════════════════════════════════
-- 058_esums_om.sql — Esums O&M (Asset Intelligence & Operations) module.
--
-- The operational brain that connects physical assets to commercial
-- outcomes. Spec: Open-Energy-Ops-Asset-Intelligence-Specification.md
--
-- Tables (all prefixed om_ to namespace the module):
--   • om_sites           — physical generation sites
--   • om_devices         — inverters, meters, sensors at each site
--   • om_telemetry       — 15-min canonical interval readings
--   • om_faults          — detected faults with revenue impact
--   • om_work_orders     — WO lifecycle with state machine
--   • om_wo_events       — WO timeline (assigned/en-route/on-site/...)
--   • om_technicians     — field team
--   • om_parts           — parts catalogue and stock
--   • om_part_movements  — issue / receive / adjust ledger
--   • om_maintenance     — scheduled + condition-based maintenance
--   • om_connections     — OEM API connections (Huawei, SolarEdge, ...)
--   • om_forecasts       — generation + revenue forecasts
--   • om_predictions     — predictive maintenance signals
--   • om_alerts          — alert rules + fired alerts
--   • om_portal_tokens   — share tokens for lender/offtaker/insurer portals
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS om_sites (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  participant_id        TEXT,              -- owner (links to participants.id)
  project_id            TEXT,              -- optional link to ipp_projects.id
  technology            TEXT,              -- solar | wind | bess | hybrid
  capacity_mw           REAL NOT NULL DEFAULT 0,
  capacity_kwp          REAL,              -- for solar DC nameplate
  province              TEXT,
  latitude              REAL,
  longitude             REAL,
  commissioning_date    TEXT,              -- ISO date
  ppa_id                TEXT,              -- link to contract_documents.id
  ppa_tariff_zar_mwh    REAL,              -- blended PPA rate for revenue calc
  om_contractor_id      TEXT,              -- participant if outsourced
  lender_id             TEXT,
  status                TEXT NOT NULL DEFAULT 'operational',
                                            -- operational | construction |
                                            -- decommissioned | curtailed
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_om_sites_participant ON om_sites(participant_id);
CREATE INDEX IF NOT EXISTS idx_om_sites_status      ON om_sites(status);

CREATE TABLE IF NOT EXISTS om_devices (
  id                    TEXT PRIMARY KEY,
  site_id               TEXT NOT NULL REFERENCES om_sites(id),
  device_type           TEXT NOT NULL,     -- inverter | string | meter |
                                            -- weather | battery | bms | transformer
  manufacturer          TEXT,              -- Huawei, SolarEdge, SMA, ...
  model                 TEXT,
  serial_number         TEXT,
  firmware_version      TEXT,
  installed_at          TEXT,              -- ISO date
  warranty_expiry       TEXT,              -- ISO date
  rated_kw              REAL,
  parent_device_id      TEXT,              -- string under an inverter
  status                TEXT NOT NULL DEFAULT 'online',
                                            -- online | offline | warning | fault
  last_seen_at          TEXT,
  location_in_plant     TEXT,              -- e.g. "Row 3, INV-7"
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_devices_site   ON om_devices(site_id);
CREATE INDEX IF NOT EXISTS idx_om_devices_status ON om_devices(status);
CREATE INDEX IF NOT EXISTS idx_om_devices_parent ON om_devices(parent_device_id);

CREATE TABLE IF NOT EXISTS om_telemetry (
  id                    TEXT PRIMARY KEY,
  device_id             TEXT NOT NULL REFERENCES om_devices(id),
  site_id               TEXT NOT NULL,
  ts                    TEXT NOT NULL,     -- ISO timestamp UTC, 15-min aligned
  ac_kw                 REAL,
  dc_kw                 REAL,
  yield_kwh             REAL,              -- cumulative day yield
  interval_kwh          REAL,              -- this interval (15min) energy
  voltage_v             REAL,
  current_a             REAL,
  frequency_hz          REAL,
  temperature_c         REAL,
  irradiance_w_m2       REAL,
  status_code           TEXT,              -- OEM-specific status / fault code
  quality               TEXT DEFAULT 'valid',
                                            -- valid | interpolated | estimated |
                                            -- gap | suspect | manual
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_telemetry_device_ts ON om_telemetry(device_id, ts);
CREATE INDEX IF NOT EXISTS idx_om_telemetry_site_ts   ON om_telemetry(site_id, ts);

CREATE TABLE IF NOT EXISTS om_faults (
  id                    TEXT PRIMARY KEY,
  site_id               TEXT NOT NULL,
  device_id             TEXT,              -- nullable for site-level faults
  category              TEXT NOT NULL,     -- communication | inverter | string |
                                            -- panel | grid | weather | bos | unknown
  severity              TEXT NOT NULL,     -- critical | major | minor | info
  fault_code            TEXT,              -- OEM code
  description           TEXT,
  detected_at           TEXT NOT NULL,
  resolved_at           TEXT,
  status                TEXT NOT NULL DEFAULT 'open',
                                            -- open | acknowledged | in_progress |
                                            -- resolved | closed | false_positive
  root_cause            TEXT,
  -- Revenue Impact Engine fields
  hourly_loss_zar       REAL DEFAULT 0,    -- current bleed rate
  total_loss_zar        REAL DEFAULT 0,    -- accumulated since detection
  projected_loss_zar    REAL,              -- if unresolved by EOD
  dscr_impact           REAL,              -- change to monthly DSCR (e.g. -0.03)
  warranty_covered      INTEGER DEFAULT 0, -- 0/1 — within warranty period
  fault_history_count   INTEGER DEFAULT 0, -- prior occurrences of same fault on same device
  work_order_id         TEXT,
  weather_correlated    INTEGER DEFAULT 0, -- 1 if cloud / rain event coincided
  grid_correlated       INTEGER DEFAULT 0, -- 1 if grid frequency excursion
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_om_faults_site_status ON om_faults(site_id, status);
CREATE INDEX IF NOT EXISTS idx_om_faults_detected    ON om_faults(detected_at);
CREATE INDEX IF NOT EXISTS idx_om_faults_severity    ON om_faults(severity);

CREATE TABLE IF NOT EXISTS om_technicians (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT,              -- optional link if user-backed
  name                  TEXT NOT NULL,
  phone                 TEXT,
  email                 TEXT,
  skills                TEXT,              -- JSON array of skill tags
  certifications        TEXT,              -- JSON array of certs
  home_base_lat         REAL,
  home_base_lon         REAL,
  current_lat           REAL,
  current_lon           REAL,
  status                TEXT NOT NULL DEFAULT 'available',
                                            -- available | en_route | on_site | off_duty
  active                INTEGER NOT NULL DEFAULT 1,
  contractor_id         TEXT,              -- if works for an O&M contractor
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_techs_status ON om_technicians(status, active);

CREATE TABLE IF NOT EXISTS om_work_orders (
  id                    TEXT PRIMARY KEY,
  wo_number             TEXT NOT NULL UNIQUE,
  site_id               TEXT NOT NULL,
  fault_id              TEXT,
  category              TEXT NOT NULL,     -- corrective | preventive | inspection |
                                            -- cleaning | installation | upgrade
  priority              TEXT NOT NULL,     -- critical | high | medium | low
  status                TEXT NOT NULL DEFAULT 'created',
                                            -- created | assigned | acknowledged |
                                            -- en_route | on_site | diagnosing |
                                            -- repairing | testing | completed |
                                            -- verified | closed | cancelled
  assigned_to           TEXT,              -- om_technicians.id
  contractor_id         TEXT,
  title                 TEXT,
  description           TEXT,
  -- SLA tracking
  sla_response_minutes  INTEGER,           -- target response (e.g. 240 = 4h)
  sla_resolve_hours     INTEGER,           -- target resolution (e.g. 24)
  sla_deadline          TEXT,              -- ISO timestamp
  sla_breached          INTEGER DEFAULT 0,
  -- Lifecycle timestamps
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  assigned_at           TEXT,
  acknowledged_at       TEXT,
  en_route_at           TEXT,
  on_site_at            TEXT,
  completed_at          TEXT,
  verified_at           TEXT,
  closed_at             TEXT,
  -- Cost + outcome
  parts_used            TEXT,              -- JSON [{part_id, qty, cost}]
  parts_cost_zar        REAL DEFAULT 0,
  labour_hours          REAL DEFAULT 0,
  labour_cost_zar       REAL DEFAULT 0,
  travel_km             REAL DEFAULT 0,
  total_cost_zar        REAL DEFAULT 0,
  revenue_recovered_zar REAL DEFAULT 0,
  photos                TEXT,              -- JSON array of R2 keys
  resolution_notes      TEXT,
  difficulty_rating     INTEGER,           -- 1-5
  first_time_fix        INTEGER,           -- 1 if fault didn't recur in 7 days
  updated_at            TEXT
);
CREATE INDEX IF NOT EXISTS idx_om_wo_status   ON om_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_om_wo_site     ON om_work_orders(site_id);
CREATE INDEX IF NOT EXISTS idx_om_wo_assigned ON om_work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_om_wo_sla      ON om_work_orders(sla_deadline);

CREATE TABLE IF NOT EXISTS om_wo_events (
  id            TEXT PRIMARY KEY,
  wo_id         TEXT NOT NULL REFERENCES om_work_orders(id),
  event_type    TEXT NOT NULL,           -- created | assigned | acknowledged |
                                          -- en_route | on_site | photo | part_used |
                                          -- note | completed | verified | reopened
  actor_id      TEXT,
  payload       TEXT,                    -- JSON
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_wo_events_wo ON om_wo_events(wo_id, occurred_at);

CREATE TABLE IF NOT EXISTS om_parts (
  id              TEXT PRIMARY KEY,
  part_number     TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  manufacturer    TEXT,
  compatible_with TEXT,                  -- JSON [device_type / model patterns]
  unit_cost_zar   REAL DEFAULT 0,
  preferred_supplier TEXT,
  lead_time_days  INTEGER,
  min_stock_qty   INTEGER DEFAULT 0,
  current_stock   INTEGER NOT NULL DEFAULT 0,
  warehouse_id    TEXT DEFAULT 'main',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS om_part_movements (
  id          TEXT PRIMARY KEY,
  part_id     TEXT NOT NULL REFERENCES om_parts(id),
  movement    TEXT NOT NULL,          -- issued | received | adjusted | returned
  qty         INTEGER NOT NULL,
  wo_id       TEXT,
  technician_id TEXT,
  reason      TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_part_mov_part ON om_part_movements(part_id, occurred_at);

CREATE TABLE IF NOT EXISTS om_maintenance (
  id                  TEXT PRIMARY KEY,
  site_id             TEXT NOT NULL,
  device_id           TEXT,
  task_type           TEXT NOT NULL,   -- panel_cleaning | inverter_inspection |
                                        -- string_test | thermal_imaging |
                                        -- switchgear_inspection | transformer_service |
                                        -- vegetation_mgmt | meter_calibration |
                                        -- battery_health | generator_service
  frequency_days      INTEGER,         -- NULL for condition-based
  trigger_condition   TEXT,            -- JSON {metric, op, threshold}
  last_done_at        TEXT,
  next_due_at         TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'scheduled',
                                        -- scheduled | due | overdue | done | snoozed
  estimated_duration_minutes INTEGER,
  required_skill      TEXT,
  parts_required      TEXT,            -- JSON
  auto_create_wo_days INTEGER DEFAULT 7, -- days before due_at to auto-create
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_maint_due ON om_maintenance(next_due_at, status);
CREATE INDEX IF NOT EXISTS idx_om_maint_site ON om_maintenance(site_id);

CREATE TABLE IF NOT EXISTS om_connections (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL,
  adapter         TEXT NOT NULL,      -- huawei | solaredge | sma | sungrow | enphase |
                                       -- fronius | goodwe | victron | deye | modbus |
                                       -- mqtt | csv_sftp | eskom_amr | landis_gyr |
                                       -- itron | cbi | carlo_gavazzi | solcast |
                                       -- open_meteo
  endpoint_url    TEXT,
  credentials_kv  TEXT,               -- KV namespace key (not the secret itself)
  polling_minutes INTEGER NOT NULL DEFAULT 5,
  last_poll_at    TEXT,
  last_status     TEXT,               -- ok | error | stale
  last_error      TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_conn_enabled ON om_connections(enabled, last_poll_at);

CREATE TABLE IF NOT EXISTS om_forecasts (
  id              TEXT PRIMARY KEY,
  site_id         TEXT NOT NULL,
  horizon         TEXT NOT NULL,      -- intraday | day_ahead | week_ahead | month_ahead
  forecast_for_ts TEXT NOT NULL,      -- the timestamp being forecasted
  generated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  mwh_p50         REAL NOT NULL,
  mwh_p10         REAL,
  mwh_p90         REAL,
  revenue_p50_zar REAL,
  model_version   TEXT,
  confidence_pct  REAL
);
CREATE INDEX IF NOT EXISTS idx_om_forecast_site_ts ON om_forecasts(site_id, forecast_for_ts);

CREATE TABLE IF NOT EXISTS om_predictions (
  id                TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL,
  device_id         TEXT,
  prediction_type   TEXT NOT NULL,    -- inverter_failure | string_degradation |
                                       -- panel_hotspot | battery_degradation |
                                       -- soiling_accumulation | transformer_risk
  confidence        REAL,             -- 0-1
  estimated_failure_at TEXT,
  recommended_action TEXT,
  estimated_loss_zar REAL,
  status            TEXT NOT NULL DEFAULT 'open',
                                        -- open | acted_on | dismissed | confirmed_true |
                                        -- confirmed_false
  generated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_om_pred_site_status ON om_predictions(site_id, status);

CREATE TABLE IF NOT EXISTS om_alerts (
  id            TEXT PRIMARY KEY,
  rule_id       TEXT,               -- nullable for one-off alerts
  site_id       TEXT,
  device_id     TEXT,
  category      TEXT NOT NULL,      -- fault | sla | covenant | weather | revenue |
                                     -- maintenance | predictive
  severity      TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  channels      TEXT,               -- JSON ['push','sms','email','whatsapp']
  delivered_at  TEXT,
  acknowledged_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_alerts_created ON om_alerts(created_at);

CREATE TABLE IF NOT EXISTS om_portal_tokens (
  id            TEXT PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,    -- random opaque token
  audience      TEXT NOT NULL,           -- lender | offtaker | insurer | contractor
  recipient_email TEXT,
  participant_id TEXT,                   -- the recipient's participant_id if known
  scope_site_ids TEXT,                   -- JSON array; NULL = portfolio access
  scope_project_ids TEXT,                -- JSON array
  expires_at    TEXT NOT NULL,
  last_used_at  TEXT,
  use_count     INTEGER NOT NULL DEFAULT 0,
  revoked       INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_om_portal_token_aud ON om_portal_tokens(audience, expires_at);

-- ─── Seed data ────────────────────────────────────────────────────────────
-- 5 sites with mixed technology + 12 inverters + 8 faults + 6 work orders +
-- 4 technicians + 4 parts + 6 maintenance schedules. Idempotent INSERT OR IGNORE.

INSERT OR IGNORE INTO om_sites
  (id, name, technology, capacity_mw, capacity_kwp, province, latitude, longitude,
   commissioning_date, ppa_tariff_zar_mwh, status)
VALUES
  ('omsite_jbg_solar1',  'Johannesburg Roof Solar 1',  'solar',  4.5, 4_800, 'Gauteng',      -26.20, 28.05, '2024-03-15', 1280, 'operational'),
  ('omsite_dbn_wind1',   'Durban Wind Farm Alpha',      'wind',  78.0,  NULL, 'KwaZulu-Natal',-29.85, 31.02, '2023-11-10',  925, 'operational'),
  ('omsite_cpt_solar2',  'Cape Town Solar Park 2',     'solar', 22.5, 24_000,'Western Cape', -33.92, 18.42, '2024-07-01', 1320, 'operational'),
  ('omsite_pe_bess1',    'Port Elizabeth BESS Phase 1', 'bess',  10.0,  NULL, 'Eastern Cape', -33.96, 25.61, '2025-02-20', 1850, 'operational'),
  ('omsite_kby_hybrid',  'Kimberley Hybrid Plant',     'hybrid',45.0, 38_000,'Northern Cape',-28.74, 24.77, '2024-09-01', 1180, 'operational');

INSERT OR IGNORE INTO om_devices
  (id, site_id, device_type, manufacturer, model, serial_number, firmware_version,
   installed_at, warranty_expiry, rated_kw, status, last_seen_at)
VALUES
  ('omdev_jbg_inv1', 'omsite_jbg_solar1', 'inverter', 'Huawei',    'SUN2000-100KTL-M1', 'HW100KTL-A001', '3.2.1', '2024-03-15', '2034-03-15', 100, 'online',  datetime('now','-2 minutes')),
  ('omdev_jbg_inv2', 'omsite_jbg_solar1', 'inverter', 'Huawei',    'SUN2000-100KTL-M1', 'HW100KTL-A002', '3.2.1', '2024-03-15', '2034-03-15', 100, 'fault',   datetime('now','-1 hour')),
  ('omdev_jbg_inv3', 'omsite_jbg_solar1', 'inverter', 'Huawei',    'SUN2000-100KTL-M1', 'HW100KTL-A003', '3.2.1', '2024-03-15', '2034-03-15', 100, 'online',  datetime('now','-2 minutes')),
  ('omdev_dbn_wt1',  'omsite_dbn_wind1',  'inverter', 'Vestas',    'V112-3.45MW',       'VST112-001',    '2.4.0', '2023-11-10', '2033-11-10', 3450,'online',  datetime('now','-3 minutes')),
  ('omdev_dbn_wt2',  'omsite_dbn_wind1',  'inverter', 'Vestas',    'V112-3.45MW',       'VST112-002',    '2.4.0', '2023-11-10', '2033-11-10', 3450,'warning', datetime('now','-15 minutes')),
  ('omdev_cpt_inv1', 'omsite_cpt_solar2', 'inverter', 'SolarEdge', 'SE100KUS',          'SE100K-CPT001','5.1.7', '2024-07-01', '2034-07-01', 100, 'online',  datetime('now','-1 minutes')),
  ('omdev_cpt_inv2', 'omsite_cpt_solar2', 'inverter', 'SolarEdge', 'SE100KUS',          'SE100K-CPT002','5.1.7', '2024-07-01', '2034-07-01', 100, 'online',  datetime('now','-1 minutes')),
  ('omdev_cpt_inv3', 'omsite_cpt_solar2', 'inverter', 'SolarEdge', 'SE100KUS',          'SE100K-CPT003','5.1.7', '2024-07-01', '2034-07-01', 100, 'fault',   datetime('now','-3 hours')),
  ('omdev_pe_bess1', 'omsite_pe_bess1',   'battery',  'BYD',       'Battery-Box Premium','BYD-PE-001',  '4.0.2', '2025-02-20', '2035-02-20',2500,'online',  datetime('now')),
  ('omdev_kby_inv1', 'omsite_kby_hybrid', 'inverter', 'Sungrow',   'SG250HX',           'SG250-KBY001', '1.8.4', '2024-09-01', '2034-09-01', 250, 'online',  datetime('now','-2 minutes')),
  ('omdev_kby_inv2', 'omsite_kby_hybrid', 'inverter', 'Sungrow',   'SG250HX',           'SG250-KBY002', '1.8.4', '2024-09-01', '2034-09-01', 250, 'online',  datetime('now','-2 minutes')),
  ('omdev_jbg_met1', 'omsite_jbg_solar1', 'meter',    'Landis+Gyr','E450',              'LG-JBG-M01',   NULL,    '2024-03-15', '2034-03-15', NULL,'online',  datetime('now','-1 minutes'));

INSERT OR IGNORE INTO om_technicians
  (id, name, phone, email, skills, certifications, home_base_lat, home_base_lon, status, active)
VALUES
  ('omtech_001', 'Sipho Dlamini',  '+27 82 555 1001', 'sipho@esums.co.za',  '["inverter","string","HV"]',     '["SAFEHOST","HV-OP"]',           -26.20, 28.05, 'available', 1),
  ('omtech_002', 'Nadine Visser',  '+27 83 555 1002', 'nadine@esums.co.za', '["panel","cleaning","drone"]',    '["IRATA-L2","DRONE-RPL"]',       -33.92, 18.42, 'on_site',   1),
  ('omtech_003', 'Mandla Khumalo', '+27 84 555 1003', 'mandla@esums.co.za', '["transformer","switchgear","HV"]','["HV-OP","TRANSFORMER-OEM"]',   -29.85, 31.02, 'en_route',  1),
  ('omtech_004', 'Pieter Coetzee', '+27 82 555 1004', 'pieter@esums.co.za', '["battery","bms","BESS"]',        '["BESS-CERT","HV-OP"]',          -33.96, 25.61, 'available', 1);

INSERT OR IGNORE INTO om_parts
  (id, part_number, name, manufacturer, unit_cost_zar, current_stock, min_stock_qty)
VALUES
  ('ompart_001', 'HW-100K-FAN-A',  'Huawei 100K cooling fan assembly',     'Huawei',     2400,  8, 4),
  ('ompart_002', 'SE-100K-FUSE',   'SolarEdge 100K DC fuse (set of 4)',    'SolarEdge',   650, 24, 12),
  ('ompart_003', 'GENERIC-MC4',    'MC4 connector pair',                   'Stäubli',      85, 250, 100),
  ('ompart_004', 'WIND-PITCH-MOT', 'V112 pitch motor assembly',            'Vestas',    42000,  2, 1);

INSERT OR IGNORE INTO om_faults
  (id, site_id, device_id, category, severity, fault_code, description, detected_at,
   status, hourly_loss_zar, total_loss_zar, projected_loss_zar, fault_history_count, warranty_covered)
VALUES
  ('omflt_001', 'omsite_jbg_solar1', 'omdev_jbg_inv2', 'inverter', 'major',    'F0521', 'Inverter offline — communication loss', datetime('now','-3 hours'),   'in_progress', 847.0,  2541, 12400, 1, 1),
  ('omflt_002', 'omsite_dbn_wind1',  'omdev_dbn_wt2',  'inverter', 'major',    'W0234', 'Pitch motor warning — torque deviation', datetime('now','-2 hours'),  'acknowledged', 1240.0, 2480, 8500, 0, 1),
  ('omflt_003', 'omsite_cpt_solar2', 'omdev_cpt_inv3', 'inverter', 'critical', 'F2014', 'DC arc fault detected on string 7',      datetime('now','-1 hour'),    'open',          910.0,  910, 5400, 2, 0),
  ('omflt_004', 'omsite_jbg_solar1', NULL,             'communication','minor','F9001','Inverter 1 brief comms gap (recovered)',  datetime('now','-6 hours'),  'resolved',         0,    230,    0, 0, 0),
  ('omflt_005', 'omsite_kby_hybrid', 'omdev_kby_inv2', 'string',   'minor',    'F1108', 'String 3 underperforming peers by 12%',  datetime('now','-12 hours'), 'open',          120.0,  1440, 1200, 1, 1),
  ('omflt_006', 'omsite_cpt_solar2', NULL,             'weather',  'info',    'W7702', 'Cloud event — output dropped 45% (filter)',datetime('now','-30 minutes'), 'false_positive',0, 0, 0, 0, 0),
  ('omflt_007', 'omsite_pe_bess1',   'omdev_pe_bess1', 'battery',  'minor',    'B0042', 'Cell imbalance >2% in module 4',          datetime('now','-2 days'),   'acknowledged',    0,     0,    0, 0, 1),
  ('omflt_008', 'omsite_jbg_solar1', NULL,             'panel',    'minor',    'P9912', 'Soiling loss exceeded 3% threshold',      datetime('now','-1 day'),    'open',           45,  1080,  650, 0, 0);

INSERT OR IGNORE INTO om_work_orders
  (id, wo_number, site_id, fault_id, category, priority, status, assigned_to,
   title, sla_response_minutes, sla_resolve_hours, sla_deadline, created_at)
VALUES
  ('omwo_001', 'WO-2026-1001', 'omsite_jbg_solar1', 'omflt_001', 'corrective', 'critical', 'on_site',    'omtech_001', 'Replace Huawei inverter cooling fan',     30,  4, datetime('now','+1 hour'),  datetime('now','-3 hours')),
  ('omwo_002', 'WO-2026-1002', 'omsite_dbn_wind1',  'omflt_002', 'corrective', 'high',     'en_route',   'omtech_003', 'Investigate WT2 pitch motor warning',     60, 24, datetime('now','+22 hours'),datetime('now','-2 hours')),
  ('omwo_003', 'WO-2026-1003', 'omsite_cpt_solar2', 'omflt_003', 'corrective', 'critical', 'assigned',   'omtech_002', 'Inspect DC arc fault — INV3 string 7',    30,  4, datetime('now','+3 hours'), datetime('now','-1 hour')),
  ('omwo_004', 'WO-2026-1004', 'omsite_jbg_solar1', 'omflt_008', 'preventive', 'low',      'created',    NULL,         'Schedule panel cleaning — soiling 3.2%',  NULL,7*24,datetime('now','+7 days'),  datetime('now','-1 day')),
  ('omwo_005', 'WO-2026-1005', 'omsite_pe_bess1',   'omflt_007', 'corrective', 'medium',   'completed',  'omtech_004', 'BESS module 4 cell balancing',            60, 24, datetime('now','-1 day'),   datetime('now','-2 days')),
  ('omwo_006', 'WO-2026-1006', 'omsite_kby_hybrid', NULL,        'preventive', 'low',      'created',    NULL,         'Quarterly inverter inspection — Sungrow',NULL,7*24,datetime('now','+5 days'),  datetime('now','-2 days'));

INSERT OR IGNORE INTO om_maintenance
  (id, site_id, device_id, task_type, frequency_days, last_done_at, next_due_at, status,
   estimated_duration_minutes, required_skill, auto_create_wo_days)
VALUES
  ('ommnt_001', 'omsite_jbg_solar1', NULL,            'panel_cleaning',      30,  date('now','-22 days'), date('now','+8 days'),  'scheduled',  240, 'cleaning',   7),
  ('ommnt_002', 'omsite_cpt_solar2', NULL,            'panel_cleaning',      30,  date('now','-18 days'), date('now','+12 days'), 'scheduled',  480, 'cleaning',   7),
  ('ommnt_003', 'omsite_jbg_solar1', 'omdev_jbg_inv1','inverter_inspection', 90,  date('now','-75 days'), date('now','+15 days'), 'scheduled',  120, 'inverter',  14),
  ('ommnt_004', 'omsite_kby_hybrid', NULL,            'string_test',        180,  date('now','-150 days'),date('now','+30 days'), 'scheduled',  360, 'inverter',  14),
  ('ommnt_005', 'omsite_dbn_wind1',  'omdev_dbn_wt1', 'inverter_inspection', 90,  date('now','-30 days'), date('now','+60 days'), 'scheduled',  240, 'inverter',  14),
  ('ommnt_006', 'omsite_pe_bess1',   'omdev_pe_bess1','battery_health',      30,  date('now','-15 days'), date('now','+15 days'), 'scheduled',  120, 'battery',    7);

INSERT OR IGNORE INTO om_connections
  (id, site_id, adapter, endpoint_url, polling_minutes, last_poll_at, last_status, enabled)
VALUES
  ('omcon_001', 'omsite_jbg_solar1', 'huawei',     'https://intl.fusionsolar.huawei.com/thirdData', 5, datetime('now','-2 minutes'), 'ok',    1),
  ('omcon_002', 'omsite_cpt_solar2', 'solaredge',  'https://monitoringapi.solaredge.com',           5, datetime('now','-1 minutes'), 'ok',    1),
  ('omcon_003', 'omsite_kby_hybrid', 'sungrow',    'https://gateway.isolarcloud.com',               5, datetime('now','-3 minutes'), 'ok',    1),
  ('omcon_004', 'omsite_dbn_wind1',  'modbus',     'tcp://10.50.1.1:502',                            1, datetime('now','-1 minutes'), 'ok',    1),
  ('omcon_005', 'omsite_pe_bess1',   'modbus',     'tcp://10.60.1.1:502',                            1, datetime('now','-2 minutes'), 'ok',    1),
  ('omcon_006', 'omsite_jbg_solar1', 'eskom_amr',  'sftp://amr.eskom.co.za',                        60, datetime('now','-30 minutes'),'ok',    1);

INSERT OR IGNORE INTO om_predictions
  (id, site_id, device_id, prediction_type, confidence, estimated_failure_at,
   recommended_action, estimated_loss_zar, status, generated_at)
VALUES
  ('ompred_001','omsite_jbg_solar1','omdev_jbg_inv2','inverter_failure', 0.78, datetime('now','+14 days'),
   'Inverter 2 shows efficiency drift + 4 fault codes in 14 days. Schedule full inspection + check warranty.',
   38_000, 'open', datetime('now','-2 hours')),
  ('ompred_002','omsite_kby_hybrid','omdev_kby_inv2','string_degradation', 0.84, datetime('now','+45 days'),
   'String 3 current 12% below peers for 7 days. Likely PID or hotspot. Thermal imaging recommended.',
   12_500, 'open', datetime('now','-1 day')),
  ('ompred_003','omsite_cpt_solar2',NULL,              'soiling_accumulation', 0.92, datetime('now','+6 days'),
   'Soiling loss trajectory predicts 4.5% loss in 6 days at R6,200/month. Cleaning ROI 2.6x.',
   6_200, 'open', datetime('now','-12 hours'));
