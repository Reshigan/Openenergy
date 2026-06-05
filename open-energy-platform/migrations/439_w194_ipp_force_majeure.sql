-- Wave 194: IPP Force Majeure Notification & Relief (PPA-based chain)
-- Regulatory: PPA force majeure clause + ERA 4/2006 s34 + REIPPPP Schedule 4
-- Primary actor: ipp_developer (submits), admin (adjudicates)
-- SLA polarity: URGENT — extreme_weather=2d, severe_storm=3d, network_fault=7d,
--               regulatory_action=14d, general=21d
-- Regulator crossings: period_active (ALL), relief_granted (material+), sla_breach (ALL)
--
-- 12 states:
--   fm_submitted → notice_verified → mitigation_assessed → period_active
--   → relief_period_running → relief_claimed → quantum_assessed
--   → relief_granted | relief_denied | disputed | fm_lapsed | cancelled

CREATE TABLE IF NOT EXISTS oe_ipp_force_majeure_chain (
  id                   TEXT PRIMARY KEY,
  ppa_id               TEXT NOT NULL,
  fm_category          TEXT NOT NULL CHECK (fm_category IN (
                         'extreme_weather', 'severe_storm', 'network_fault',
                         'regulatory_action', 'general'
                       )),
  affected_capacity_mw REAL NOT NULL DEFAULT 0,
  notice_date          TEXT NOT NULL,
  fm_start_date        TEXT,
  fm_end_date          TEXT,
  relief_amount_zar    REAL,
  quantum_basis        TEXT,
  chain_status         TEXT NOT NULL DEFAULT 'fm_submitted',
  sla_deadline         TEXT,
  sla_breached         INTEGER NOT NULL DEFAULT 0,
  regulator_notified   INTEGER NOT NULL DEFAULT 0,
  actor_id             TEXT,
  reason               TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fmc_chain_status  ON oe_ipp_force_majeure_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_fmc_category      ON oe_ipp_force_majeure_chain(fm_category);
CREATE INDEX IF NOT EXISTS idx_fmc_ppa_id        ON oe_ipp_force_majeure_chain(ppa_id);
CREATE INDEX IF NOT EXISTS idx_fmc_actor_id      ON oe_ipp_force_majeure_chain(actor_id);
CREATE INDEX IF NOT EXISTS idx_fmc_sla           ON oe_ipp_force_majeure_chain(sla_deadline, sla_breached);
CREATE INDEX IF NOT EXISTS idx_fmc_created       ON oe_ipp_force_majeure_chain(created_at);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states, fm_category varied, ppa_id='ppa-001'

INSERT INTO oe_ipp_force_majeure_chain
  (id, ppa_id, fm_category, affected_capacity_mw, notice_date,
   fm_start_date, fm_end_date, relief_amount_zar, quantum_basis,
   chain_status, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES

-- 1. fm_submitted — extreme_weather, fresh notification
('fmc-001',
 'ppa-001',
 'extreme_weather',
 50.0,
 '2026-06-01',
 '2026-06-01',
 NULL,
 NULL,
 NULL,
 'fm_submitted',
 datetime('now', '+2 days'),
 0, 0,
 'p_ipp_dev_001',
 'Severe hailstorm damaged 40% of panel surface at Goldrush Site 3',
 '2026-06-01 07:00:00', '2026-06-01 07:00:00'),

-- 2. notice_verified — severe_storm, admin confirmed notice
('fmc-002',
 'ppa-001',
 'severe_storm',
 30.0,
 '2026-05-25',
 '2026-05-25',
 NULL,
 NULL,
 NULL,
 'notice_verified',
 datetime('now', '+3 days'),
 0, 0,
 'p_ipp_dev_001',
 'Storm-cell impact on MV switchgear; notice form and photos verified by admin',
 '2026-05-25 09:00:00', '2026-05-26 14:00:00'),

-- 3. mitigation_assessed — network_fault, mitigation plan reviewed
('fmc-003',
 'ppa-001',
 'network_fault',
 80.0,
 '2026-05-18',
 '2026-05-18',
 NULL,
 NULL,
 NULL,
 'mitigation_assessed',
 datetime('now', '+7 days'),
 0, 0,
 'p_ipp_dev_001',
 'Eskom 132kV feeder fault; IPP isolated grid connection; mitigation steps confirmed',
 '2026-05-18 08:30:00', '2026-05-20 11:00:00'),

-- 4. period_active — regulatory_action, period officially declared
('fmc-004',
 'ppa-001',
 'regulatory_action',
 120.0,
 '2026-05-10',
 '2026-05-10',
 NULL,
 NULL,
 NULL,
 'period_active',
 datetime('now', '+14 days'),
 0, 1,
 'p_ipp_dev_001',
 'NERSA grid access suspension order; FM period activated and NERSA notified',
 '2026-05-10 08:00:00', '2026-05-12 16:00:00'),

-- 5. relief_period_running — general, relief window counting
('fmc-005',
 'ppa-001',
 'general',
 25.0,
 '2026-04-28',
 '2026-04-28',
 NULL,
 NULL,
 NULL,
 'relief_period_running',
 datetime('now', '+21 days'),
 0, 0,
 'p_ipp_dev_001',
 'Unexpected labour dispute preventing maintenance access; relief period running',
 '2026-04-28 09:30:00', '2026-05-03 10:00:00'),

-- 6. relief_claimed — extreme_weather, claim filed
('fmc-006',
 'ppa-001',
 'extreme_weather',
 60.0,
 '2026-04-10',
 '2026-04-10',
 '2026-04-18',
 4500000.0,
 'Lost energy revenue at contracted tariff R1.85/kWh × 8 days × 60 MW × 14h/day',
 'relief_claimed',
 datetime('now', '+2 days'),
 0, 1,
 'p_ipp_dev_001',
 'Lightning strike destroyed inverter hall; claim submitted covering 8-day outage',
 '2026-04-10 07:00:00', '2026-04-22 15:00:00'),

-- 7. quantum_assessed — severe_storm, quantum under review
('fmc-007',
 'ppa-001',
 'severe_storm',
 45.0,
 '2026-03-20',
 '2026-03-20',
 '2026-03-28',
 2800000.0,
 'Curtailed MWh × OWS tariff less avoided O&M per IE assessment',
 'quantum_assessed',
 datetime('now', '+3 days'),
 0, 0,
 'p_ipp_dev_001',
 'IE completed quantum assessment; awaiting admin sign-off for grant/deny decision',
 '2026-03-20 08:00:00', '2026-04-05 11:00:00'),

-- 8. relief_granted — network_fault, terminal +
('fmc-008',
 'ppa-001',
 'network_fault',
 100.0,
 '2026-02-14',
 '2026-02-14',
 '2026-02-22',
 6200000.0,
 '9-day Eskom fault outage; R6.2M agreed per IE and PPA FM schedule',
 'relief_granted',
 '2026-03-14',
 0, 1,
 'admin@openenergy.co.za',
 'FM relief granted by admin; offtaker and NERSA notified per ERA s34',
 '2026-02-14 09:00:00', '2026-03-10 14:00:00'),

-- 9. relief_denied — regulatory_action, terminal -
('fmc-009',
 'ppa-001',
 'regulatory_action',
 35.0,
 '2026-01-22',
 '2026-01-22',
 '2026-02-05',
 1200000.0,
 'IPP estimated curtailment revenue',
 'relief_denied',
 '2026-02-05',
 0, 0,
 'admin@openenergy.co.za',
 'FM claim denied — regulatory order did not restrict generation, only grid import',
 '2026-01-22 10:00:00', '2026-02-08 13:00:00'),

-- 10. disputed — general, terminal
('fmc-010',
 'ppa-001',
 'general',
 55.0,
 '2025-12-12',
 '2025-12-12',
 '2025-12-20',
 3000000.0,
 'IPP claims full tariff; offtaker disputes deemed-energy quantum',
 'disputed',
 '2026-01-02',
 1, 1,
 'p_ipp_dev_001',
 'Parties disagree on deemed-energy quantum; formal dispute lodged under PPA clause 18',
 '2025-12-12 08:00:00', '2026-01-05 15:00:00'),

-- 11. fm_lapsed — severe_storm, terminal (no claim filed in time)
('fmc-011',
 'ppa-001',
 'severe_storm',
 20.0,
 '2025-11-05',
 '2025-11-05',
 '2025-11-08',
 NULL,
 NULL,
 'fm_lapsed',
 '2025-11-08',
 1, 0,
 'p_ipp_dev_001',
 'FM period ended without relief claim; event lapsed under PPA notice deadline',
 '2025-11-05 10:00:00', '2025-11-20 09:00:00'),

-- 12. cancelled — extreme_weather, terminal (IPP withdrew notification)
('fmc-012',
 'ppa-001',
 'extreme_weather',
 15.0,
 '2025-10-08',
 '2025-10-08',
 NULL,
 NULL,
 NULL,
 'cancelled',
 '2025-10-10',
 0, 0,
 'p_ipp_dev_001',
 'Weather event did not materialise into generation loss; FM notice withdrawn',
 '2025-10-08 07:30:00', '2025-10-09 14:00:00');
