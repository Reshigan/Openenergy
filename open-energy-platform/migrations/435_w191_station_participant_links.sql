-- Wave 191: Station Participant Link
-- Tracks formal linkage relationships between energy stations and participating entities
-- (lenders, carbon funds, offtakers, grid operators) with full state-machine lifecycle

CREATE TABLE IF NOT EXISTS oe_station_participant_links (
  id                       TEXT PRIMARY KEY,
  station_id               TEXT NOT NULL,
  initiating_participant_id TEXT NOT NULL,
  accepting_participant_id  TEXT NOT NULL,
  link_type                TEXT NOT NULL CHECK (link_type IN ('lender', 'carbon_fund', 'offtaker', 'grid_operator')),
  reference_id             TEXT,
  chain_status             TEXT NOT NULL DEFAULT 'link_proposed',
  sla_deadline             TEXT,
  sla_breached             INTEGER NOT NULL DEFAULT 0,
  regulator_notified       INTEGER NOT NULL DEFAULT 0,
  actor_id                 TEXT,
  reason                   TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_station_links_station    ON oe_station_participant_links(station_id);
CREATE INDEX IF NOT EXISTS idx_station_links_initiating ON oe_station_participant_links(initiating_participant_id);
CREATE INDEX IF NOT EXISTS idx_station_links_accepting  ON oe_station_participant_links(accepting_participant_id);
CREATE INDEX IF NOT EXISTS idx_station_links_status     ON oe_station_participant_links(chain_status);
CREATE INDEX IF NOT EXISTS idx_station_links_type       ON oe_station_participant_links(link_type);
CREATE INDEX IF NOT EXISTS idx_station_links_sla        ON oe_station_participant_links(sla_deadline, sla_breached);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- 3 lender links: link_active, under_review, link_rejected
-- 3 carbon_fund links: link_active, compliance_check, link_expired
-- 3 offtaker links: link_active, commercial_terms_review, link_suspended
-- 3 grid_operator links: link_active, technical_validation, approved

INSERT INTO oe_station_participant_links
  (id, station_id, initiating_participant_id, accepting_participant_id, link_type, reference_id,
   chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
VALUES

-- LENDER — link_active
('slink-001',
 'ssx_343f4d88b936057a053caed6036ec523',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_lender_001',
 'lender',
 'LF-2024-001',
 'link_active',
 '2025-02-14 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Facility agreement executed and conditions precedent satisfied',
 '2025-01-31 09:12:00', '2025-02-14 10:45:00'),

-- LENDER — under_review
('slink-002',
 'ssx_343f4d88b936057a053caed6036ec523',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_lender_001',
 'lender',
 'LF-2024-002',
 'under_review',
 '2025-04-15 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2025-04-01 08:00:00', '2025-04-03 14:30:00'),

-- LENDER — link_rejected (sla_breached=1, past dates)
('slink-003',
 'ssx_9fa21c3b445d6e80129bcd5a47fe0012',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_lender_001',
 'lender',
 'LF-2024-003',
 'link_rejected',
 '2025-01-10 00:00:00',
 1, 0,
 'demo_lender_001',
 'Credit committee declined due to insufficient debt service coverage ratio',
 '2024-12-27 11:00:00', '2025-01-15 09:20:00'),

-- CARBON_FUND — link_active
('slink-004',
 'ssx_343f4d88b936057a053caed6036ec523',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_carbon_fund_001',
 'carbon_fund',
 'CPP-001',
 'link_active',
 '2025-03-31 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Carbon purchase programme agreement signed and ITMO registry confirmed',
 '2025-03-01 10:00:00', '2025-03-28 16:10:00'),

-- CARBON_FUND — compliance_check
('slink-005',
 'ssx_8bc0e14a22f74d91c3ab56781de9f334',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_carbon_fund_001',
 'carbon_fund',
 'CPP-002',
 'compliance_check',
 '2025-05-15 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2025-04-15 07:30:00', '2025-04-22 13:00:00'),

-- CARBON_FUND — link_expired (sla_breached=1, past dates)
('slink-006',
 'ssx_9fa21c3b445d6e80129bcd5a47fe0012',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_carbon_fund_002',
 'carbon_fund',
 'CPP-003',
 'link_expired',
 '2024-11-30 00:00:00',
 1, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Crediting period elapsed without baseline renewal under W56 process',
 '2024-10-01 09:00:00', '2024-12-05 11:45:00'),

-- OFFTAKER — link_active
('slink-007',
 'ssx_343f4d88b936057a053caed6036ec523',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker',
 'PPA-GR-001',
 'link_active',
 '2025-04-21 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'PPA signed and take-or-pay schedule confirmed under NERSA Section 34',
 '2025-03-31 08:00:00', '2025-04-18 15:30:00'),

-- OFFTAKER — commercial_terms_review
('slink-008',
 'ssx_8bc0e14a22f74d91c3ab56781de9f334',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_002',
 'offtaker',
 'PPA-GR-002',
 'commercial_terms_review',
 '2025-06-22 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2025-06-01 10:15:00', '2025-06-03 09:00:00'),

-- OFFTAKER — link_suspended (sla_breached=1, past dates)
('slink-009',
 'ssx_9fa21c3b445d6e80129bcd5a47fe0012',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_offtaker_001',
 'offtaker',
 'PPA-GR-003',
 'link_suspended',
 '2025-01-05 00:00:00',
 1, 0,
 'demo_offtaker_001',
 'Offtaker payment default triggering suspension under cure-window provisions',
 '2024-12-15 14:00:00', '2025-01-08 17:30:00'),

-- GRID_OPERATOR — link_active (regulator_notified=1)
('slink-010',
 'ssx_343f4d88b936057a053caed6036ec523',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_grid_operator_001',
 'grid_operator',
 'GCA-2025-001',
 'link_active',
 '2025-02-07 00:00:00',
 0, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'Grid connection agreement executed and NTCSA notified under Grid Code C-1',
 '2025-01-31 11:00:00', '2025-02-07 08:45:00'),

-- GRID_OPERATOR — technical_validation
('slink-011',
 'ssx_8bc0e14a22f74d91c3ab56781de9f334',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_grid_operator_002',
 'grid_operator',
 'GCA-2025-002',
 'technical_validation',
 '2025-06-12 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2025-06-05 09:30:00', '2025-06-05 14:20:00'),

-- GRID_OPERATOR — approved (not yet activated)
('slink-012',
 'ssx_9fa21c3b445d6e80129bcd5a47fe0012',
 'id_7c352b86da89907a85266a250e15db95',
 'demo_grid_operator_001',
 'grid_operator',
 'GCA-2025-003',
 'approved',
 '2025-07-07 00:00:00',
 0, 0,
 'demo_grid_operator_001',
 'Technical and commercial terms approved by SO; pending activation milestone',
 '2025-05-20 08:00:00', '2025-06-01 10:30:00');
