-- Wave 197: Unserved Energy Compensation Claim (USE Claim)
-- Tracks compensation claims by offtakers against grid operators for
-- supply interruptions, with full 12-state lifecycle chain.
-- Regulatory: NERSA electricity supply quality + ERA s29 + NRS 048-2 + NEMA s28

CREATE TABLE IF NOT EXISTS oe_unserved_energy_claims (
  id                   TEXT PRIMARY KEY,
  chain_status         TEXT NOT NULL DEFAULT 'claim_submitted',
  sla_deadline         TEXT,
  sla_breached         INTEGER NOT NULL DEFAULT 0,
  regulator_notified   INTEGER NOT NULL DEFAULT 0,
  actor_id             TEXT,
  reason               TEXT,
  -- Business fields
  offtaker_id          TEXT NOT NULL,
  grid_operator_id     TEXT NOT NULL,
  event_date           TEXT NOT NULL,
  customer_category    TEXT NOT NULL CHECK (customer_category IN ('industrial','commercial','municipal','residential','scheduled')),
  unserved_mwh         REAL NOT NULL,
  claimed_amount_zar   REAL NOT NULL,
  settlement_amount_zar REAL,
  nrs048_reference     TEXT,
  load_shedding_stage  INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_uec_offtaker       ON oe_unserved_energy_claims(offtaker_id);
CREATE INDEX IF NOT EXISTS idx_uec_grid_operator  ON oe_unserved_energy_claims(grid_operator_id);
CREATE INDEX IF NOT EXISTS idx_uec_status         ON oe_unserved_energy_claims(chain_status);
CREATE INDEX IF NOT EXISTS idx_uec_category       ON oe_unserved_energy_claims(customer_category);
CREATE INDEX IF NOT EXISTS idx_uec_sla            ON oe_unserved_energy_claims(sla_deadline, sla_breached);
CREATE INDEX IF NOT EXISTS idx_uec_event_date     ON oe_unserved_energy_claims(event_date);

-- ─── Seed data ─────────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states and all 5 customer_category values

INSERT OR IGNORE INTO oe_unserved_energy_claims
  (id, offtaker_id, grid_operator_id, event_date, customer_category,
   unserved_mwh, claimed_amount_zar, settlement_amount_zar,
   nrs048_reference, load_shedding_stage,
   chain_status, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason, created_at, updated_at)
VALUES

-- 1. industrial — claim_submitted (fresh, 7d SLA)
('uec-001',
 'demo_offtaker_001', 'demo_grid_operator_001',
 '2026-05-28', 'industrial',
 42.5, 850000.00, NULL,
 'NRS048-2/2007/Sec3.2', 4,
 'claim_submitted',
 '2026-06-04', 0, 0,
 'demo_offtaker_001',
 'Stage 4 load-shedding event caused 42.5 MWh shortfall on conveyor system',
 '2026-05-28 06:15:00', '2026-05-28 06:15:00'),

-- 2. industrial — metering_data_verified
('uec-002',
 'demo_offtaker_001', 'demo_grid_operator_001',
 '2026-05-15', 'industrial',
 18.2, 364000.00, NULL,
 'NRS048-2/2007/Sec3.1', 3,
 'metering_data_verified',
 '2026-05-22', 0, 0,
 'admin@openenergy.co.za',
 'Meter readings validated against AMI data; NRS 048-2 non-compliance confirmed',
 '2026-05-15 09:00:00', '2026-05-17 14:30:00'),

-- 3. commercial — liability_assessed
('uec-003',
 'demo_offtaker_002', 'demo_grid_operator_001',
 '2026-05-10', 'commercial',
 8.7, 130500.00, NULL,
 'NRS048-2/2007/Sec4.1', 2,
 'liability_assessed',
 '2026-05-24', 0, 0,
 'admin@openenergy.co.za',
 'Grid operator confirmed feeder fault caused interruption; liability accepted',
 '2026-05-10 11:00:00', '2026-05-14 10:00:00'),

-- 4. commercial — preliminary_quantum
('uec-004',
 'demo_offtaker_002', 'demo_grid_operator_002',
 '2026-04-30', 'commercial',
 12.1, 181500.00, NULL,
 'NRS048-2/2007/Sec4.2', NULL,
 'preliminary_quantum',
 '2026-05-14', 0, 0,
 'admin@openenergy.co.za',
 'Quantum calculated at R15 000/MWh based on PPA tariff and lost revenue',
 '2026-04-30 08:00:00', '2026-05-05 16:00:00'),

-- 5. municipal — grid_operator_response
('uec-005',
 'demo_offtaker_003', 'demo_grid_operator_001',
 '2026-04-15', 'municipal',
 95.0, 1425000.00, NULL,
 'NRS048-2/2007/Sec5.1', 6,
 'grid_operator_response',
 '2026-05-06', 0, 0,
 'demo_grid_operator_001',
 'Grid operator disputes Stage 6 classification; contends planned maintenance exemption applies',
 '2026-04-15 07:00:00', '2026-04-25 12:00:00'),

-- 6. municipal — negotiation
('uec-006',
 'demo_offtaker_003', 'demo_grid_operator_002',
 '2026-03-20', 'municipal',
 60.0, 900000.00, NULL,
 'NRS048-2/2007/Sec5.2', 4,
 'negotiation',
 '2026-04-10', 0, 0,
 'demo_offtaker_003',
 'Parties entered negotiation; grid operator offered partial quantum of 70%',
 '2026-03-20 10:00:00', '2026-04-02 09:00:00'),

-- 7. residential — settlement_offer
('uec-007',
 'demo_offtaker_004', 'demo_grid_operator_001',
 '2026-03-01', 'residential',
 3.2, 22400.00, 18000.00,
 'NRS048-2/2007/Sec6.1', 3,
 'settlement_offer',
 '2026-03-31', 0, 0,
 'demo_grid_operator_001',
 'Settlement offer of R18 000 made; 80% of claimed quantum',
 '2026-03-01 14:00:00', '2026-03-15 11:00:00'),

-- 8. residential — claim_settled (TERMINAL+)
('uec-008',
 'demo_offtaker_004', 'demo_grid_operator_002',
 '2026-02-10', 'residential',
 2.8, 19600.00, 17500.00,
 'NRS048-2/2007/Sec6.2', 2,
 'claim_settled',
 '2026-03-12', 0, 0,
 'demo_offtaker_004',
 'Settlement accepted; payment of R17 500 confirmed via EFT',
 '2026-02-10 09:00:00', '2026-02-28 15:00:00'),

-- 9. scheduled — claim_disputed
('uec-009',
 'demo_offtaker_001', 'demo_grid_operator_001',
 '2026-02-01', 'scheduled',
 5.5, 55000.00, NULL,
 'NRS048-2/2007/Sec7.1', 1,
 'claim_disputed',
 '2026-03-18', 0, 0,
 'demo_offtaker_001',
 'Offtaker disputes load-shedding schedule notice; claims inadequate advance notice under NERSA guidelines',
 '2026-02-01 08:00:00', '2026-02-18 13:00:00'),

-- 10. industrial — formal_adjudication (regulator_notified=1)
('uec-010',
 'demo_offtaker_002', 'demo_grid_operator_002',
 '2026-01-15', 'industrial',
 88.0, 1760000.00, NULL,
 'NRS048-2/2007/Sec3.3', 6,
 'formal_adjudication',
 '2026-01-22', 1, 1,
 'admin@openenergy.co.za',
 'Bilateral negotiation failed after 30 days; NERSA notified; formal adjudication commenced',
 '2026-01-15 07:30:00', '2026-02-20 09:00:00'),

-- 11. commercial — award_made (TERMINAL+, regulator_notified=1)
('uec-011',
 'demo_offtaker_003', 'demo_grid_operator_001',
 '2025-12-01', 'commercial',
 22.0, 330000.00, 297000.00,
 'NRS048-2/2007/Sec4.3', 3,
 'award_made',
 '2025-12-15', 0, 1,
 'admin@openenergy.co.za',
 'Award of R297 000 (90% of claim) made by NERSA adjudicator; binding on both parties',
 '2025-12-01 10:00:00', '2026-01-10 14:30:00'),

-- 12. scheduled — claim_withdrawn (TERMINAL)
('uec-012',
 'demo_offtaker_004', 'demo_grid_operator_002',
 '2025-11-15', 'scheduled',
 1.5, 10500.00, NULL,
 'NRS048-2/2007/Sec7.2', 1,
 'claim_withdrawn',
 '2025-12-31', 0, 0,
 'demo_offtaker_004',
 'Offtaker withdrew claim after reviewing scheduled load-shedding notice; insufficient grounds',
 '2025-11-15 11:00:00', '2025-11-25 16:00:00');
