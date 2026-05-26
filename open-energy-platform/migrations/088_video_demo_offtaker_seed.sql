-- 088 — Backfill the Offtaker workstation tabs + Procurement RFPs.
--
-- The video preflight showed every Offtaker workstation tab reading empty
-- on prod and only one (validation) RFP visible in Procurement. The 082
-- SELECT-FROM-participants pattern silently no-op'd; rewrite the same
-- rows as direct VALUES against demo_offtaker_001 so they land regardless
-- of participants ordering at migration time.
--
-- Touches:
--   • offtaker_delivery_points        — 4 sites (HQ, factory, warehouse, retail)
--   • offtaker_site_groups + members  — 2 portfolio groups
--   • tariff_products                 — 4 SA reference tariffs
--   • offtaker_budgets                — 4 budget rows across 2 periods
--   • rec_certificates                — 6 RECs owned by offtaker
--   • rec_retirements                 — 2 Scope-2 retirements
--   • scope2_disclosures              — 2 reporting years
--   • procurement_rfps + bids         — the 2 video RFPs (replays 082)
--   • offtaker_bills                  — 2 prior bills so AI analytics tab reads
--
-- Idempotent (INSERT OR IGNORE everywhere). FKs disabled for the body so
-- replay against the unit-test sqlite (which skips 003 parents) doesn't
-- reject — prod has every parent.
PRAGMA foreign_keys = OFF;

-- ─── Delivery points (4 sites for demo_offtaker_001) ──────────────────
INSERT OR IGNORE INTO offtaker_delivery_points
  (id, participant_id, name, location, meter_id, voltage_kv, nmd_kva,
   annual_kwh, tariff_category, notes, status)
VALUES
  ('dp-vid-01', 'demo_offtaker_001', 'Sandton head office',
   'Sandton, Gauteng', 'MTR-SAND-001', 0.4, 800,
   1450000, 'commercial', 'Anchor C&I site. Mixed office + datacentre rack room.', 'active'),
  ('dp-vid-02', 'demo_offtaker_001', 'Bryanston light-manufacturing',
   'Bryanston, Gauteng', 'MTR-BRYN-002', 11.0, 2500,
   8200000, 'industrial', 'Three-shift operation. Peak load 1.9 MW.', 'active'),
  ('dp-vid-03', 'demo_offtaker_001', 'Atlantic Hills warehouse',
   'Cape Town, WC', 'MTR-ATLN-003', 11.0, 1200,
   3100000, 'industrial', 'Cold-store + bottling line. Heavy off-peak draw.', 'active'),
  ('dp-vid-04', 'demo_offtaker_001', 'Umhlanga retail flagship',
   'Umhlanga, KZN', 'MTR-UMHL-004', 0.4, 400,
   620000, 'commercial', 'Retail + restaurant. TOU exposure on peak periods.', 'active');

-- ─── Site groups (2 portfolios + members) ─────────────────────────────
INSERT OR IGNORE INTO offtaker_site_groups
  (id, participant_id, group_name, group_type, billing_entity, vat_number,
   consolidated_invoice, cost_centre)
VALUES
  ('sg-vid-01', 'demo_offtaker_001', 'C&I anchor portfolio', 'division',
   'Anchor Retail Holdings (Pty) Ltd', '4123456789', 1, 'CC-ENERGY-01'),
  ('sg-vid-02', 'demo_offtaker_001', 'KZN coastal retail', 'region',
   'Coastal Retail (Pty) Ltd', '4987654321', 1, 'CC-RETAIL-KZN');

INSERT OR IGNORE INTO offtaker_site_group_members
  (id, group_id, delivery_point_id, allocation_percentage)
VALUES
  ('sgm-vid-01', 'sg-vid-01', 'dp-vid-01', 100),
  ('sgm-vid-02', 'sg-vid-01', 'dp-vid-02', 100),
  ('sgm-vid-03', 'sg-vid-01', 'dp-vid-03', 100),
  ('sgm-vid-04', 'sg-vid-02', 'dp-vid-04', 100);

-- ─── Tariff products (4 SA reference tariffs) ─────────────────────────
INSERT OR IGNORE INTO tariff_products
  (id, tariff_code, tariff_name, utility, category, structure_type,
   effective_from, effective_to)
VALUES
  ('tp-vid-01', 'ESKOM-MEGAFLEX',     'Eskom Megaflex',         'Eskom', 'industrial', 'tou',         '2025-04-01', NULL),
  ('tp-vid-02', 'ESKOM-MINIFLEX',     'Eskom Miniflex',         'Eskom', 'commercial', 'tou',         '2025-04-01', NULL),
  ('tp-vid-03', 'CCT-COMMERCIAL-LV',  'CCT Commercial Low Voltage', 'City of Cape Town', 'commercial', 'demand_based', '2025-07-01', NULL),
  ('tp-vid-04', 'CoJ-INDUSTRIAL-MV',  'CoJ Industrial Medium Voltage', 'City of Johannesburg', 'industrial', 'demand_based', '2025-07-01', NULL);

-- ─── Budget vs actual (4 rows across 2 periods) ───────────────────────
INSERT OR IGNORE INTO offtaker_budgets
  (id, participant_id, site_group_id, delivery_point_id, period,
   budgeted_kwh, budgeted_zar, cost_centre)
VALUES
  ('ob-vid-01', 'demo_offtaker_001', 'sg-vid-01', NULL, '2026-04',
   1056000, 2438000, 'CC-ENERGY-01'),
  ('ob-vid-02', 'demo_offtaker_001', 'sg-vid-01', NULL, '2026-05',
   1083000, 2502000, 'CC-ENERGY-01'),
  ('ob-vid-03', 'demo_offtaker_001', 'sg-vid-02', 'dp-vid-04', '2026-04',
   51000, 132000, 'CC-RETAIL-KZN'),
  ('ob-vid-04', 'demo_offtaker_001', 'sg-vid-02', 'dp-vid-04', '2026-05',
   53000, 137000, 'CC-RETAIL-KZN');

-- ─── REC certificates (6 owned by offtaker; 4 issued + 2 retired) ─────
INSERT OR IGNORE INTO rec_certificates
  (id, certificate_serial, generator_participant_id, project_id,
   generation_period_start, generation_period_end, mwh_represented,
   technology, registry, issuance_date, status, owner_participant_id)
VALUES
  ('rec-vid-01', 'SAREC-2026-0001', 'demo_ipp_001', 'ip_001',
   '2026-01-01', '2026-01-31', 4250, 'solar_pv', 'SAREC',
   '2026-02-12', 'issued',     'demo_offtaker_001'),
  ('rec-vid-02', 'SAREC-2026-0002', 'demo_ipp_001', 'ip_001',
   '2026-02-01', '2026-02-28', 3960, 'solar_pv', 'SAREC',
   '2026-03-11', 'issued',     'demo_offtaker_001'),
  ('rec-vid-03', 'SAREC-2026-0003', 'demo_ipp_002', 'ip_002',
   '2026-02-01', '2026-02-28', 5180, 'wind',     'SAREC',
   '2026-03-13', 'transferred','demo_offtaker_001'),
  ('rec-vid-04', 'IREC-2026-0017',  'demo_ipp_002', 'ip_002',
   '2026-03-01', '2026-03-31', 5520, 'wind',     'I-REC',
   '2026-04-09', 'issued',     'demo_offtaker_001'),
  ('rec-vid-05', 'SAREC-2025-Q4-19','demo_ipp_001', 'ip_001',
   '2025-12-01', '2025-12-31', 3700, 'solar_pv', 'SAREC',
   '2026-01-15', 'retired',    'demo_offtaker_001'),
  ('rec-vid-06', 'IREC-2025-Q4-22', 'demo_ipp_002', 'ip_002',
   '2025-11-01', '2025-12-31', 9400, 'wind',     'I-REC',
   '2026-01-18', 'retired',    'demo_offtaker_001');

-- ─── REC retirements (2 Scope-2 retirements against 2025 consumption) ─
INSERT OR IGNORE INTO rec_retirements
  (id, rec_certificate_id, retiring_participant_id, retirement_purpose,
   consumption_period_start, consumption_period_end, consumption_site_group_id,
   consumption_mwh, beneficiary_name, beneficiary_statement,
   retirement_certificate_number, retired_at, created_by)
VALUES
  ('rret-vid-01', 'rec-vid-05', 'demo_offtaker_001', 'scope_2',
   '2025-12-01', '2025-12-31', 'sg-vid-01', 3700, 'Anchor Retail Holdings',
   'Retired against 2025 Scope-2 market-based reporting (GHG Protocol).',
   'RR-2026-0001', datetime('now','-90 days'), 'demo_offtaker_001'),
  ('rret-vid-02', 'rec-vid-06', 'demo_offtaker_001', 'scope_2',
   '2025-11-01', '2025-12-31', 'sg-vid-01', 9400, 'Anchor Retail Holdings',
   'Retired against 2025 Scope-2 market-based reporting (GHG Protocol).',
   'RR-2026-0002', datetime('now','-85 days'), 'demo_offtaker_001');

-- ─── Scope-2 disclosures (2 reporting years) ──────────────────────────
INSERT OR IGNORE INTO scope2_disclosures
  (id, participant_id, reporting_year, total_consumption_mwh,
   location_based_emissions_tco2e, market_based_emissions_tco2e,
   renewable_mwh_claimed, renewable_percentage, grid_factor_tco2e_per_mwh,
   audit_reference, status, published_at, created_by)
VALUES
  ('s2-vid-2024', 'demo_offtaker_001', 2024, 12800,
   12352, 9264, 3200, 25.0, 0.965,
   'KPMG-OE-2024-S2', 'audited',  '2025-04-30', 'demo_offtaker_001'),
  ('s2-vid-2025', 'demo_offtaker_001', 2025, 13370,
   12903, 7234, 5870, 43.9, 0.965,
   'KPMG-OE-2025-S2', 'published','2026-04-22', 'demo_offtaker_001');

-- ─── Procurement RFPs + bids (replay 082 with hard-coded created_by) ──
-- The 082 INSERT...SELECT FROM participants WHERE email='offtaker@…'
-- silently no-op'd on prod — hard-coding the FK lands the rows reliably.
-- (Evaluation-matrix columns (technical/sustainability/delivery/overall)
--  are already added by 082; do not re-ALTER here.)
INSERT OR IGNORE INTO procurement_rfps
  (id, title, description, rfp_reference, created_by, closing_date,
   evaluation_date, budget, currency, status, created_at)
VALUES
  ('rfp-vid-01',
   'RFP-2026-014 — 150 MW Solar PV PPA for C&I anchor portfolio',
   'Request for Proposals — 15-year fixed-price PPA, ZAR-denominated, delivery from H2 2027. Minimum REIPPPP-equivalent grid code compliance and 35% black ownership.',
   'RFP-2026-014', 'demo_offtaker_001',
   date('now','+30 days'), date('now','+45 days'), 850000000, 'ZAR',
   'evaluation', datetime('now','-45 days')),
  ('rfp-vid-02',
   'RFP-2026-019 — 80 MW Wind hybrid + battery storage offtake',
   'Hybrid wind-storage tender. Required: 80 MW wind + minimum 40 MWh battery, 20-year PPA, ancillary services capability.',
   'RFP-2026-019', 'demo_offtaker_001',
   date('now','+18 days'), date('now','+35 days'), 1200000000, 'ZAR',
   'published', datetime('now','-25 days'));

INSERT OR IGNORE INTO procurement_bids
  (id, rfp_id, participant_id, bid_amount, currency, score, rank, status,
   submitted_at, created_at,
   technical_score, sustainability_score, delivery_score, overall_score)
VALUES
  ('bid-vid-r01-01', 'rfp-vid-01', 'demo_ipp_001', 820000000, 'ZAR',
   86.5, 1, 'shortlisted', datetime('now','-12 days'), datetime('now','-12 days'),
   88, 84, 87, 86.5),
  ('bid-vid-r01-02', 'rfp-vid-01', 'demo_ipp_002', 845000000, 'ZAR',
   83.2, 2, 'under_review', datetime('now','-11 days'), datetime('now','-11 days'),
   85, 82, 82, 83.2),
  ('bid-vid-r01-03', 'rfp-vid-01', 'demo_ipp_002', 832000000, 'ZAR',
   79.8, 3, 'under_review', datetime('now','-10 days'), datetime('now','-10 days'),
   78, 81, 80, 79.8),
  ('bid-vid-r01-04', 'rfp-vid-01', 'demo_ipp_001', 868000000, 'ZAR',
   71.0, 4, 'rejected', datetime('now','-9 days'), datetime('now','-9 days'),
   72, 70, 71, 71.0),
  ('bid-vid-r02-01', 'rfp-vid-02', 'demo_ipp_002', 1150000000, 'ZAR',
   88.2, 1, 'shortlisted', datetime('now','-8 days'), datetime('now','-8 days'),
   90, 86, 88, 88.2),
  ('bid-vid-r02-02', 'rfp-vid-02', 'demo_ipp_001', 1185000000, 'ZAR',
   82.5, 2, 'under_review', datetime('now','-7 days'), datetime('now','-7 days'),
   84, 81, 82, 82.5),
  ('bid-vid-r02-03', 'rfp-vid-02', 'demo_ipp_002', 1210000000, 'ZAR',
   77.9, 3, 'under_review', datetime('now','-6 days'), datetime('now','-6 days'),
   76, 79, 78, 77.9);

-- ─── Sample analysed bills so the Bill Upload tab reads non-empty ─────
CREATE TABLE IF NOT EXISTS offtaker_bills (
  id TEXT PRIMARY KEY,
  offtaker_id TEXT NOT NULL,
  source TEXT,
  meta_json TEXT,
  ai_result_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO offtaker_bills
  (id, offtaker_id, source, meta_json, ai_result_json, created_at)
VALUES
  ('bill-vid-01', 'demo_offtaker_001', 'pdf',
   '{"site":"Sandton head office","period":"2026-03"}',
   '{"annual_kwh":1450000,"peak_pct":0.42,"standard_pct":0.41,"offpeak_pct":0.17,"avg_tariff_zar_per_kwh":2.18,"demand_charge_zar_per_kva":214.5,"tou_risk":"high"}',
   datetime('now','-21 days')),
  ('bill-vid-02', 'demo_offtaker_001', 'pdf',
   '{"site":"Bryanston light-manufacturing","period":"2026-03"}',
   '{"annual_kwh":8200000,"peak_pct":0.38,"standard_pct":0.39,"offpeak_pct":0.23,"avg_tariff_zar_per_kwh":1.96,"demand_charge_zar_per_kva":238.1,"tou_risk":"medium"}',
   datetime('now','-19 days'));
