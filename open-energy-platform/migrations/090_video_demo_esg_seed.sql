-- ════════════════════════════════════════════════════════════════════════
-- 090 · ESG demo seed (Watershed-grade)
--
-- Backfills every empty esg_* table so the /esg cockpit renders a real
-- carbon-accounting story for the UN/ESCO product video:
--   • Scope 1/2/3 transactions across diesel, Eskom grid, freight, travel,
--     services spend, supplier deliveries, electricity sold-to-customer
--   • SBTi-aligned absolute + intensity targets
--   • 5 reduction initiatives with MACC points
--   • Scope 3 supplier engagement surveys (cat 1, 4, 11)
--   • REC certificates + a retirement bridging Scope 2 market-based
--   • CSRD double-materiality topics
--   • TCFD physical + transition risks
--   • CDP + JSE-SRL + ISSB S2 disclosures
-- ════════════════════════════════════════════════════════════════════════

-- Scope 1/2/3 activity transactions (offtaker — corporate carbon footprint)
INSERT OR IGNORE INTO esg_activity_transactions
  (id, participant_id, activity_code, scope, scope3_category, region, facility_id, activity_date, period_start, period_end, quantity, unit, counterparty_id, counterparty_name, factor_id, factor_value, emissions_kg_co2e, scope2_method, data_source, data_quality, status, created_at)
VALUES
  -- ─── Scope 1 — diesel for backup generators ──────────────────────────
  ('eat_s1_001', 'demo_offtaker_001', 'fuel.diesel.litre',    1, NULL, 'ZA', 'site_sandton_hq',  '2026-01-15', '2026-01-01','2026-01-31', 1850.0,  'litre', NULL, NULL, 'ef_diesel_litre',   2.5448, 4707.88, 'location', 'invoice', 'measured', 'final', datetime('now')),
  ('eat_s1_002', 'demo_offtaker_001', 'fuel.diesel.litre',    1, NULL, 'ZA', 'site_sandton_hq',  '2026-02-15', '2026-02-01','2026-02-29',  920.0,  'litre', NULL, NULL, 'ef_diesel_litre',   2.5448, 2341.22, 'location', 'invoice', 'measured', 'final', datetime('now')),
  ('eat_s1_003', 'demo_offtaker_001', 'fuel.diesel.litre',    1, NULL, 'ZA', 'site_durban_dc',   '2026-03-15', '2026-03-01','2026-03-31', 2400.0,  'litre', NULL, NULL, 'ef_diesel_litre',   2.5448, 6107.52, 'location', 'invoice', 'measured', 'final', datetime('now')),
  ('eat_s1_004', 'demo_offtaker_001', 'fuel.lpg.kg',          1, NULL, 'ZA', 'site_sandton_hq',  '2026-02-20',  NULL, NULL,                   180.0,  'kg',    NULL, NULL, 'ef_lpg_kg',         2.9385,  528.93, 'location', 'invoice', 'measured', 'final', datetime('now')),

  -- ─── Scope 2 — Eskom grid electricity (location-based) ───────────────
  ('eat_s2_001', 'demo_offtaker_001', 'electricity.grid.kwh', 2, NULL, 'ZA', 'site_sandton_hq',  '2026-01-31', '2026-01-01','2026-01-31',  720000.0,'kWh', NULL, NULL, 'ef_eskom_kwh',     0.94,   676800.00, 'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_s2_002', 'demo_offtaker_001', 'electricity.grid.kwh', 2, NULL, 'ZA', 'site_sandton_hq',  '2026-02-28', '2026-02-01','2026-02-29',  685000.0,'kWh', NULL, NULL, 'ef_eskom_kwh',     0.94,   643900.00, 'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_s2_003', 'demo_offtaker_001', 'electricity.grid.kwh', 2, NULL, 'ZA', 'site_sandton_hq',  '2026-03-31', '2026-03-01','2026-03-31',  698000.0,'kWh', NULL, NULL, 'ef_eskom_kwh',     0.94,   656120.00, 'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_s2_004', 'demo_offtaker_001', 'electricity.grid.kwh', 2, NULL, 'ZA', 'site_durban_dc',   '2026-01-31', '2026-01-01','2026-01-31',  420000.0,'kWh', NULL, NULL, 'ef_eskom_kwh',     0.94,   394800.00, 'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_s2_005', 'demo_offtaker_001', 'electricity.grid.kwh', 2, NULL, 'ZA', 'site_durban_dc',   '2026-02-28', '2026-02-01','2026-02-29',  398000.0,'kWh', NULL, NULL, 'ef_eskom_kwh',     0.94,   374120.00, 'location', 'meter', 'measured', 'final', datetime('now')),

  -- ─── Scope 3 — Cat 1 (Purchased goods/services, spend-based EEIO) ───
  ('eat_s3_001', 'demo_offtaker_001', 'spend.services.zar',   3, 1, 'ZA', NULL, '2026-01-31','2026-01-01','2026-01-31', 1850000.0, 'ZAR', 'demo_ipp_001',    'Karoo Wind 1 (IPP)',         'ef_eeio_services', 0.115,  212750.00, 'location', 'invoice', 'estimated', 'final', datetime('now')),
  ('eat_s3_002', 'demo_offtaker_001', 'spend.services.zar',   3, 1, 'ZA', NULL, '2026-02-28','2026-02-01','2026-02-29', 2120000.0, 'ZAR', 'sup_microsoft_za','Microsoft SA (cloud + licenses)','ef_eeio_services', 0.115,  243800.00, 'location', 'invoice', 'estimated', 'final', datetime('now')),
  -- ─── Scope 3 — Cat 4 (Upstream transport) ────────────────────────────
  ('eat_s3_003', 'demo_offtaker_001', 'transport.road.tkm',   3, 4, 'ZA', NULL, '2026-01-31','2026-01-01','2026-01-31',   48000.0, 'tkm', NULL,            'Imperial Logistics',          'ef_road_freight',  0.107,    5136.00, 'location', 'invoice', 'calculated', 'final', datetime('now')),
  ('eat_s3_004', 'demo_offtaker_001', 'transport.rail.tkm',   3, 4, 'ZA', NULL, '2026-02-28','2026-02-01','2026-02-29',   62000.0, 'tkm', NULL,            'Transnet Freight Rail',       'ef_rail_freight',  0.028,    1736.00, 'location', 'invoice', 'calculated', 'final', datetime('now')),
  -- ─── Scope 3 — Cat 6 (Business travel) ───────────────────────────────
  ('eat_s3_005', 'demo_offtaker_001', 'travel.flight.short_haul', 3, 6, 'ZA', NULL, '2026-03-15', NULL, NULL,             18400.0, 'passenger-km', NULL, 'FlySafair domestic',           'ef_flight_short',  0.1535,  2824.40, 'location', 'invoice', 'measured',   'final', datetime('now')),
  ('eat_s3_006', 'demo_offtaker_001', 'travel.flight.long_haul',  3, 6, 'GLB',NULL, '2026-03-20', NULL, NULL,             14200.0, 'passenger-km', NULL, 'Emirates JNB-LHR (CDP COP31)', 'ef_flight_long',   0.1481,  2103.02, 'location', 'invoice', 'measured',   'final', datetime('now')),
  ('eat_s3_007', 'demo_offtaker_001', 'travel.hotel.night',        3, 6, 'ZA', NULL, '2026-03-22', NULL, NULL,                42.0, 'night',        NULL, 'Protea Hotels (board offsite)','ef_hotel_night',   12.5,     525.00, 'location', 'invoice', 'estimated', 'final', datetime('now')),
  -- ─── Scope 3 — Cat 11 (Use of sold products — IPP exporting energy) ─
  ('eat_s3_008', 'demo_ipp_001',      'use.electricity_product.kwh', 3, 11, 'ZA', NULL, '2026-01-31','2026-01-01','2026-01-31', 14200000.0, 'kWh', NULL, 'Customer mix (grid export)','ef_use_electricity_kwh', 0.475, 6745000.00, 'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_s3_009', 'demo_ipp_001',      'use.electricity_product.kwh', 3, 11, 'ZA', NULL, '2026-02-28','2026-02-01','2026-02-29', 13850000.0, 'kWh', NULL, 'Customer mix (grid export)','ef_use_electricity_kwh', 0.475, 6578750.00, 'location', 'meter', 'measured', 'final', datetime('now'));

-- ─── Targets (SBTi aligned) ──────────────────────────────────────────────
INSERT OR IGNORE INTO esg_targets
  (id, participant_id, target_type, framework, scopes_covered, base_year, base_value, base_intensity_unit, target_year, target_value, target_pct, validated_by, validated_at, status, description, created_at)
VALUES
  ('tgt_offtaker_001', 'demo_offtaker_001', 'sbti_15c',    'SBTi',   '["scope_1","scope_2"]',                              2022, 22500000.0, 'kgCO2e',          2030, 11250000.0, 50.0,  'SBTi',                '2025-04-12', 'approved',    '50% absolute Scope 1+2 reduction by 2030 (SBTi 1.5C)',         datetime('now')),
  ('tgt_offtaker_002', 'demo_offtaker_001', 'net_zero',    'SBTi',   '["scope_1","scope_2","scope_3_cat_1","scope_3_cat_4","scope_3_cat_6","scope_3_cat_11"]', 2022, 24800000.0, 'kgCO2e',2045, 2480000.0,  90.0,  'SBTi',                '2025-04-12', 'committed',   '90% net-zero by 2045 (covering Scope 3 cats 1, 4, 6, 11)',     datetime('now')),
  ('tgt_offtaker_003', 'demo_offtaker_001', 'renewable_mix','Custom','["scope_2"]',                                         2024, 8.0,        'pct',             2028, 100.0,      100.0, 'third-party assurance','2025-06-01', 'progressing', '100% renewable electricity by 2028 (PPA portfolio)',           datetime('now')),
  ('tgt_ipp_001',      'demo_ipp_001',      'absolute',    'Custom', '["scope_1","scope_2"]',                              2023, 480000.0,   'kgCO2e',          2030, 192000.0,   60.0,  'KPMG (limited)',      '2025-09-01', 'progressing', '60% absolute reduction of operational emissions by 2030',      datetime('now'));

-- ─── Reduction initiatives (MACC inputs) ─────────────────────────────────
INSERT OR IGNORE INTO esg_initiatives
  (id, participant_id, name, category, scopes_targeted, abatement_tco2e_yr, capex_zar, opex_zar_yr, lifetime_years, marginal_abatement_cost_zar_tco2e, start_date, end_date, status, reduces_target_id, description, created_at)
VALUES
  ('init_001', 'demo_offtaker_001', 'Solar PV + battery — Sandton HQ',        'renewable_purchase',    '["scope_2"]',                  3800.0,  18500000.0, 380000.0,  20,   285.0, '2026-08-01', '2027-02-01', 'approved',    'tgt_offtaker_001', '2.4 MWp rooftop + 1.6 MWh BESS retiring Eskom grid demand',           datetime('now')),
  ('init_002', 'demo_offtaker_001', 'Karoo Wind 1 PPA — 65 GWh/yr',           'renewable_purchase',    '["scope_2"]',                  19500.0, 0.0,        12800000.0,15,    72.0, '2026-04-01', '2041-03-31', 'in_progress', 'tgt_offtaker_003', '15yr PPA at R1.97/kWh sourced via OE Exchange',                       datetime('now')),
  ('init_003', 'demo_offtaker_001', 'Fleet electrification — 24 LCV',         'fleet_electrification', '["scope_1","scope_3_cat_4"]',  680.0,   18000000.0, 1200000.0, 8,    1240.0, '2026-09-01', '2027-06-30', 'planned',     'tgt_offtaker_001', '24 light commercial vehicles replaced; charge from on-site solar',     datetime('now')),
  ('init_004', 'demo_offtaker_001', 'HVAC retrofit + smart BMS',              'energy_efficiency',     '["scope_2"]',                  1200.0,  6500000.0,  85000.0,   12,   180.0, '2026-06-01', '2026-12-15', 'in_progress', 'tgt_offtaker_001', 'BMS + VFD chiller upgrade — Sandton + Durban',                        datetime('now')),
  ('init_005', 'demo_ipp_001',      'Karoo Wind 1 capacity expansion +60MW',  'renewable_purchase',    '["scope_2"]',                  92000.0, 1180000000.0,12500000.0,25,    14.0, '2027-01-01', '2028-09-30', 'planned',     'tgt_ipp_001',      'Phase 2 expansion — 60 MW additional turbines',                       datetime('now'));

-- ─── Supplier engagements (Scope 3 surveys) ──────────────────────────────
INSERT OR IGNORE INTO esg_supplier_engagements
  (id, participant_id, supplier_id, supplier_name, scope3_category, survey_type, invited_at, responded_at, status, response_emissions_kg, response_period_start, response_period_end, data_quality, notes, created_at)
VALUES
  ('seng_001', 'demo_offtaker_001', 'sup_microsoft_za',   'Microsoft SA',           1, 'CDP_supply_chain', '2026-01-10', '2026-02-14', 'complete', 184000.0,  '2025-01-01','2025-12-31','medium', 'Cloud + Office 365 footprint',     datetime('now')),
  ('seng_002', 'demo_offtaker_001', 'sup_imperial_log',   'Imperial Logistics',     4, 'custom',           '2026-01-10', '2026-02-08', 'complete', 86000.0,   '2025-01-01','2025-12-31','high',   'Tonne-km based; primary data',     datetime('now')),
  ('seng_003', 'demo_offtaker_001', 'sup_transnet',       'Transnet Freight Rail',  4, 'custom',           '2026-01-10', '2026-03-01', 'partial',  NULL,      NULL,         NULL,        NULL,    'Awaiting Q4 invoices',             datetime('now')),
  ('seng_004', 'demo_offtaker_001', 'sup_emirates',       'Emirates Airline',       6, 'CDP_supply_chain', '2026-01-10', NULL,         'invited',  NULL,      NULL,         NULL,        NULL,    NULL,                               datetime('now')),
  ('seng_005', 'demo_offtaker_001', 'sup_protea_hotels',  'Protea Hotels (Marriott)',6,'custom',           '2026-01-10', '2026-02-22', 'declined', NULL,      NULL,         NULL,        NULL,    'Supplier opted out of survey',     datetime('now')),
  ('seng_006', 'demo_offtaker_001', 'demo_ipp_001',       'Karoo Wind 1 (IPP)',     1, 'SBTi_PRTS',        '2026-01-10', '2026-02-05', 'complete', 12500.0,   '2025-01-01','2025-12-31','high',   'PPA-supplier; primary data',       datetime('now'));

-- ─── REC / GO certificates ───────────────────────────────────────────────
INSERT OR IGNORE INTO esg_rec_certificates
  (id, participant_id, serial_number, registry, source_project_id, technology, vintage_year, vintage_month, mwh_certified, mwh_remaining, issue_date, expiry_date, status, acquisition_cost_zar, acquisition_date, notes, created_at)
VALUES
  ('rec_001', 'demo_offtaker_001', 'IREC-ZA-2025-0001', 'I-REC',  'demo_ipp_001', 'wind',     2025, NULL, 65000.0, 0.0,     '2025-12-31', '2030-12-31', 'partially_retired', 1300000.0, '2026-01-15', 'From Karoo Wind 1 — bundled with PPA', datetime('now')),
  ('rec_002', 'demo_offtaker_001', 'IREC-ZA-2025-0002', 'I-REC',  NULL,           'solar_pv', 2025, NULL, 18000.0, 18000.0, '2025-12-31', '2030-12-31', 'active',            720000.0,  '2026-02-20', 'Spot-bought from Sere Solar',          datetime('now')),
  ('rec_003', 'demo_offtaker_001', 'SAREMI-2025-0014',  'SAREMI', NULL,           'wind',     2024, NULL, 12000.0, 0.0,     '2025-03-01', '2029-12-31', 'retired',           420000.0,  '2025-04-10', 'CY2024 retirement for CDP submission', datetime('now'));

INSERT OR IGNORE INTO esg_rec_retirements
  (id, certificate_id, participant_id, mwh_retired, reporting_year, scope2_method, beneficiary, reason, retired_at)
VALUES
  ('rret_001', 'rec_001', 'demo_offtaker_001', 65000.0, 2025, 'market', 'demo_offtaker_001', 'Match against 2025 Scope 2 grid consumption', '2026-04-15 09:00:00'),
  ('rret_002', 'rec_003', 'demo_offtaker_001', 12000.0, 2024, 'market', 'demo_offtaker_001', 'Match against 2024 Scope 2 grid consumption', '2025-04-10 11:30:00');

-- ─── Materiality topics (CSRD double materiality) ───────────────────────
INSERT OR IGNORE INTO esg_materiality_topics
  (id, participant_id, topic_code, topic_name, esrs_alignment, impact_materiality, financial_materiality, assessed_at, assessed_by, notes, created_at)
VALUES
  ('mat_001', 'demo_offtaker_001', 'climate_mitigation',  'Climate change mitigation',         'E1', 0.92, 0.88, '2026-01-15', 'KPMG (limited assurance)', 'Highest-priority topic',  datetime('now')),
  ('mat_002', 'demo_offtaker_001', 'climate_adaptation',  'Climate change adaptation',         'E1', 0.78, 0.72, '2026-01-15', 'KPMG (limited assurance)', 'Physical risk to KZN DC', datetime('now')),
  ('mat_003', 'demo_offtaker_001', 'water_use',           'Water consumption',                 'E3', 0.65, 0.45, '2026-01-15', 'KPMG (limited assurance)', 'Drought exposure in WCape',datetime('now')),
  ('mat_004', 'demo_offtaker_001', 'own_workforce',       'Own workforce health & safety',     'S1', 0.55, 0.40, '2026-01-15', 'KPMG (limited assurance)', NULL,                       datetime('now')),
  ('mat_005', 'demo_offtaker_001', 'value_chain_workers', 'Workers in value chain',            'S2', 0.62, 0.35, '2026-01-15', 'KPMG (limited assurance)', 'Logistics supplier audit', datetime('now')),
  ('mat_006', 'demo_offtaker_001', 'business_conduct',    'Business conduct & anti-corruption','G1', 0.40, 0.78, '2026-01-15', 'KPMG (limited assurance)', NULL,                       datetime('now'));

-- ─── Risk register (TCFD physical + transition) ─────────────────────────
INSERT OR IGNORE INTO esg_risks
  (id, participant_id, risk_type, title, description, time_horizon, likelihood, impact_zar, scenario, mitigation, status, created_at)
VALUES
  ('rsk_001', 'demo_offtaker_001', 'physical_acute',         'Coastal flooding — Durban DC',          'Sea-level rise + storm-surge exposure to Durban distribution center', 'medium', 0.45, 18500000.0, 'NGFS Disorderly', 'Site flood defences + insurance review',           'mitigated',     datetime('now')),
  ('rsk_002', 'demo_offtaker_001', 'physical_chronic',       'Western Cape water stress',             'Day-Zero scenarios reduce operations resilience',                     'long',   0.62, 4500000.0,  'NGFS Hot House',   'Water reuse + boreholes at CT logistics hub',     'identified',    datetime('now')),
  ('rsk_003', 'demo_offtaker_001', 'transition_policy',      'SA Carbon Tax escalation',              'Carbon Tax Act ramp from R190/tCO2e to R462/tCO2e by 2030',           'medium', 0.92, 28000000.0, 'IEA NZE',          'Decarbonisation roadmap aligned to SBTi target',  'in_progress',   datetime('now')),
  ('rsk_004', 'demo_offtaker_001', 'transition_market',      'Customer demand for low-carbon products','Procurement RFPs increasingly mandate Scope 3 disclosure',           'short',  0.85, 12000000.0, 'NGFS Orderly',     'Annual CDP A-list + product PCF (Cradle-to-Gate)','in_progress',   datetime('now')),
  ('rsk_005', 'demo_offtaker_001', 'transition_technology',  'Stranded ICE fleet assets',             'Early write-down of diesel LCVs as EVs become cost-competitive',      'medium', 0.55, 6500000.0,  'NGFS Orderly',     'Phased fleet electrification (init_003)',         'identified',    datetime('now')),
  ('rsk_006', 'demo_offtaker_001', 'transition_reputation',  'Greenwashing claims',                   'JSE-SRL reporting must be third-party assured to avoid scrutiny',     'short',  0.30, 4500000.0,  NULL,                'Limited-assurance KPMG; CDP B+ minimum',          'mitigated',     datetime('now'));

-- ─── Disclosures (CDP, JSE-SRL, ISSB S2, GHG Protocol) ──────────────────
INSERT OR IGNORE INTO esg_disclosures
  (id, participant_id, framework, reporting_year, period_start, period_end, scope1_tco2e, scope2_location_tco2e, scope2_market_tco2e, scope3_tco2e, intensity_value, intensity_unit, renewable_pct, assurance_level, assurance_provider, status, submitted_at, submitted_to, external_reference, notes, created_at, updated_at)
VALUES
  ('disc_001', 'demo_offtaker_001', 'CDP',          2025, '2025-01-01','2025-12-31', 318.4,  19425.6, 2150.4,  4220.8, 0.092, 'kgCO2e/ZAR_revenue', 32.5, 'limited',    'KPMG',     'submitted', '2026-04-08 14:30:00', 'CDP Worldwide',         'CDP-2026-ZA-00018',   'A- score targeted',       datetime('now'), datetime('now')),
  ('disc_002', 'demo_offtaker_001', 'JSE_SRL',      2025, '2025-01-01','2025-12-31', 318.4,  19425.6, 2150.4,  4220.8, 0.092, 'kgCO2e/ZAR_revenue', 32.5, 'limited',    'KPMG',     'published', '2026-04-30 11:00:00', 'JSE',                   'JSE-SRL-2026-04210',  'Per JSE SR Listing reqs', datetime('now'), datetime('now')),
  ('disc_003', 'demo_offtaker_001', 'ISSB_S2',      2025, '2025-01-01','2025-12-31', 318.4,  19425.6, 2150.4,  4220.8, 0.092, 'kgCO2e/ZAR_revenue', 32.5, 'limited',    'KPMG',     'submitted', '2026-05-15 09:00:00', 'IFRS Foundation',       'ISSB-S2-2026-00942',  'Inaugural ISSB S2 file',  datetime('now'), datetime('now')),
  ('disc_004', 'demo_offtaker_001', 'GHG_PROTOCOL', 2025, '2025-01-01','2025-12-31', 318.4,  19425.6, 2150.4,  4220.8, 0.092, 'kgCO2e/ZAR_revenue', 32.5, 'reasonable', 'KPMG',     'published', '2026-03-22 10:30:00', NULL,                    NULL,                  'Inventory mgmt plan',     datetime('now'), datetime('now')),
  ('disc_005', 'demo_offtaker_001', 'TCFD',         2024, '2024-01-01','2024-12-31', 364.2,  20880.0, 4180.0,  4520.5, 0.094, 'kgCO2e/ZAR_revenue', 18.0, 'limited',    'Deloitte', 'published', '2025-06-30 16:00:00', 'TCFD Knowledge Hub',    'TCFD-2025-00188',     'Prior-year baseline',     datetime('now'), datetime('now')),
  ('disc_006', 'demo_ipp_001',      'CDP',          2025, '2025-01-01','2025-12-31', 12.4,   480.0,   0.0,     6745.0, 0.044, 'kgCO2e/MWh',         98.0, 'limited',    'KPMG',     'submitted', '2026-04-08 14:30:00', 'CDP Worldwide',         'CDP-2026-ZA-00045',   'Renewable IPP — A score', datetime('now'), datetime('now'));

-- ─── Annual rollups (computed view; seed so /esg cockpit hydrates) ──────
INSERT OR REPLACE INTO esg_annual_rollup
  (participant_id, tenant_id, reporting_year, scope1_tco2e, scope2_location_tco2e, scope2_market_tco2e, scope3_tco2e, scope3_by_category, total_tco2e_location, total_tco2e_market, energy_consumption_mwh, renewable_mwh, renewable_pct, revenue_zar, intensity_kgco2e_zar, data_quality_score, computed_at)
VALUES
  ('demo_offtaker_001', 'default', 2026, 13.7,  2745.7,   305.0,    540.2, '{"1":456.6,"4":6.9,"6":5.5,"11":71.2}',   3299.6,   859.0,    25210.0, 8200.0,  32.5, 580000000.0, 1.48e-5, 78.0, datetime('now')),
  ('demo_offtaker_001', 'default', 2025, 318.4, 19425.6,  2150.4,   4220.8,'{"1":3214.0,"4":640.0,"6":260.8,"11":106.0}', 22964.8, 8689.6,   210400.0,68500.0, 32.5, 4900000000.0,4.69e-6, 76.0, datetime('now')),
  ('demo_offtaker_001', 'default', 2024, 364.2, 20880.0,  4180.0,   4520.5,'{"1":3500.0,"4":680.0,"6":275.0,"11":65.5}',  25764.7, 9080.5,   222100.0,40000.0, 18.0, 4720000000.0,5.46e-6, 70.0, datetime('now')),
  ('demo_ipp_001',      'default', 2025, 12.4,  480.0,    0.0,      6745.0,'{"11":6745.0}',                               7237.4,  6757.4,   142000000.0,142000000.0,100.0,2280000000.0,3.17e-6,82.0, datetime('now'));

-- ─── Done ────────────────────────────────────────────────────────────────
