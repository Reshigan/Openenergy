-- Migration 503: ESG seed data for demo_carbon_001 (carbon@openenergy.co.za)
-- Carbon fund ESG profile: financed emissions (PCAF), portfolio carbon credits,
-- Article 6 ITMO activity, CDP/GRI fund-level reporting.

-- ─── Activity transactions ────────────────────────────────────────────────────
INSERT OR IGNORE INTO esg_activity_transactions
  (id, participant_id, activity_code, scope, scope3_category, region, facility_id,
   activity_date, period_start, period_end, quantity, unit,
   counterparty_id, counterparty_name, factor_id, factor_value,
   emissions_kg_co2e, scope2_method, data_source, data_quality, status, created_at)
VALUES
  -- Scope 1: office vehicle diesel
  ('eat_cf_s1_001', 'demo_carbon_001', 'fuel.diesel.litre', 1, NULL, 'ZA',
   'site_cf_sandton', '2026-01-31', '2026-01-01', '2026-01-31',
   320.0, 'litre', NULL, NULL, 'ef_diesel_litre', 2.5448, 814.34,
   'location', 'invoice', 'measured', 'final', datetime('now')),

  -- Scope 2: office electricity (location-based)
  ('eat_cf_s2_001', 'demo_carbon_001', 'electricity.grid.kwh', 2, NULL, 'ZA',
   'site_cf_sandton', '2026-01-31', '2026-01-01', '2026-01-31',
   28000.0, 'kWh', NULL, NULL, 'ef_eskom_kwh', 0.94, 26320.00,
   'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_cf_s2_002', 'demo_carbon_001', 'electricity.grid.kwh', 2, NULL, 'ZA',
   'site_cf_sandton', '2026-02-28', '2026-02-01', '2026-02-29',
   26500.0, 'kWh', NULL, NULL, 'ef_eskom_kwh', 0.94, 24910.00,
   'location', 'meter', 'measured', 'final', datetime('now')),
  ('eat_cf_s2_003', 'demo_carbon_001', 'electricity.grid.kwh', 2, NULL, 'ZA',
   'site_cf_sandton', '2026-03-31', '2026-03-01', '2026-03-31',
   27200.0, 'kWh', NULL, NULL, 'ef_eskom_kwh', 0.94, 25568.00,
   'location', 'meter', 'measured', 'final', datetime('now')),

  -- Scope 3 Cat 15: financed emissions — Karoo Wind 1 (PCAF equity attribution)
  -- Attribution: R180m AUM share / R2.1bn project capex = 8.57%; FY2025 emissions 480 tCO2e attributed
  ('eat_cf_s3_001', 'demo_carbon_001', 'financed.equity.zar', 3, 15, 'ZA',
   NULL, '2026-03-31', '2025-01-01', '2025-12-31',
   180000000.0, 'ZAR', 'demo_ipp_001', 'Karoo Wind 1 (RenewCo Solar)',
   'ef_eeio_services', 0.00000267, 480000.0,
   'location', 'pcaf_attribution', 'calculated', 'final', datetime('now')),

  -- Scope 3 Cat 15: financed emissions — Sere Solar PV (project debt)
  -- Attribution: R220m / R1.8bn = 12.2%; FY2025 construction emissions 3 200 tCO2e attributed
  ('eat_cf_s3_002', 'demo_carbon_001', 'financed.debt.zar', 3, 15, 'ZA',
   NULL, '2026-03-31', '2025-01-01', '2025-12-31',
   220000000.0, 'ZAR', NULL, 'Sere Solar (Pty) Ltd',
   'ef_eeio_services', 0.000001776, 390000.0,
   'location', 'pcaf_attribution', 'calculated', 'final', datetime('now')),

  -- Scope 3 Cat 6: business travel — COP30 delegation
  ('eat_cf_s3_003', 'demo_carbon_001', 'travel.flight.long_haul', 3, 6, 'GLB',
   NULL, '2026-02-15', NULL, NULL,
   12400.0, 'passenger-km', NULL, 'SAA / Emirates (COP30 delegation)',
   'ef_flight_long', 0.1481, 1836.44,
   'location', 'invoice', 'measured', 'final', datetime('now'));

-- ─── ESG targets ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO esg_targets
  (id, participant_id, target_type, framework, scopes_covered,
   base_year, base_value, base_intensity_unit,
   target_year, target_value, target_pct,
   validated_by, validated_at, status, description, created_at)
VALUES
  -- Net-zero fund operations by 2030 (Scope 1+2, SBTi SME pathway)
  ('tgt_cf_001', 'demo_carbon_001', 'net_zero', 'SBTi',
   '["scope_1","scope_2"]',
   2023, 95.0, 'tCO2e',
   2030, 9.5, 90.0,
   'SBTi', '2025-08-01', 'approved',
   'Net-zero operational emissions (Scope 1+2) by 2030 — SBTi SME pathway',
   datetime('now')),

  -- PCAF financed-emissions intensity: halve by 2035 (Scope 3 Cat 15)
  ('tgt_cf_002', 'demo_carbon_001', 'intensity', 'Custom',
   '["scope_3_cat_15"]',
   2023, 87.0, 'tCO2e_per_mZAR_AUM',
   2035, 43.5, 50.0,
   'PwC (limited assurance)', '2025-10-15', 'committed',
   '50% reduction in PCAF financed-emissions intensity per mZAR AUM by 2035 — IEA NZE aligned',
   datetime('now'));

-- ─── Reduction initiatives ────────────────────────────────────────────────────
INSERT OR IGNORE INTO esg_initiatives
  (id, participant_id, name, category, scopes_targeted,
   abatement_tco2e_yr, capex_zar, opex_zar_yr, lifetime_years,
   marginal_abatement_cost_zar_tco2e,
   start_date, end_date, status, reduces_target_id, description, created_at)
VALUES
  -- Green lease + 80 kWp rooftop PV — Sandton office
  ('init_cf_001', 'demo_carbon_001',
   'Green lease + 80 kWp rooftop PV — Sandton',
   'renewable_purchase', '["scope_2"]',
   25.0, 1200000.0, 45000.0, 20, 340.0,
   '2026-09-01', '2027-03-31', 'approved',
   'tgt_cf_001',
   '80 kWp rooftop PV on leased office floor via green lease addendum; covers ~85% of office electricity',
   datetime('now')),

  -- Portfolio SBTi engagement programme
  ('init_cf_002', 'demo_carbon_001',
   'Portfolio SBTi target engagement programme',
   'supply_chain', '["scope_3_cat_15"]',
   8.5, 0.0, 380000.0, 5, 45.0,
   '2026-04-01', '2028-12-31', 'in_progress',
   'tgt_cf_002',
   'Engage top-10 portfolio projects (by AUM) to set SBTi 1.5C targets by 2028; track progress via OE platform',
   datetime('now'));

-- ─── REC certificates ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO esg_rec_certificates
  (id, participant_id, serial_number, registry, source_project_id,
   technology, vintage_year, vintage_month,
   mwh_certified, mwh_remaining, issue_date, expiry_date, status,
   acquisition_cost_zar, acquisition_date, notes, created_at)
VALUES
  ('rec_cf_001', 'demo_carbon_001', 'IREC-ZA-2025-CF-0001', 'I-REC', 'demo_ipp_001',
   'solar_pv', 2025, 12,
   120.0, 120.0, '2025-12-31', '2030-12-31', 'active',
   4800.0, '2026-02-01',
   'Spot-purchase to cover 2025 Scope 2 — Sandton office 12-month consumption',
   datetime('now'));

-- ─── ESG risks ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO esg_risks
  (id, participant_id, risk_type, title, description, time_horizon,
   likelihood, impact_zar, scenario, mitigation, status, created_at)
VALUES
  -- Transition: stranded-asset risk — coal-adjacent wheeling exposure
  ('risk_cf_001', 'demo_carbon_001', 'transition_policy',
   'Stranded-asset risk: coal-adjacent wheeling exposure',
   'Regulatory phase-out of Eskom coal PPAs before 2035 may impair valuations of grid-connected project debt where dispatch priority shifts to renewables. Portfolio exposure: 8% residual coal-grid exposure via wheeling agreements.',
   'medium',
   0.3, 45000000.0,
   'NGFS Orderly',
   'Covenant review cycle; require IPP counterparties to provide 2-year forward dispatch schedules; cap coal-adjacent wheeling exposure at 5% AUM.',
   'identified', datetime('now')),

  -- Physical: acute hail/fire damage to solar assets
  ('risk_cf_002', 'demo_carbon_001', 'physical_acute',
   'Acute hail/veld fire damage — Karoo solar assets',
   'Hail and veld fire events risk property damage to solar assets in Karoo and Northern Cape. Outages reduce PPA revenue and complicate PCAF financed-emissions attribution.',
   'long',
   0.2, 18000000.0,
   'NGFS Hot House',
   'Require physical climate risk assessment (NGFS scenario) in all new due diligence; monitor weather event claims across portfolio quarterly.',
   'identified', datetime('now')),

  -- Transition: PCAF data-quality / greenwashing reputational risk
  ('risk_cf_003', 'demo_carbon_001', 'transition_reputation',
   'PCAF data-quality / greenwashing exposure',
   'PCAF score 4–5 data covers 62% of portfolio AUM. Fund-level financed emissions labelled "calculated" — project data restatements trigger fund-level restatement and potential greenwashing allegations.',
   'short',
   0.3, 8000000.0,
   'NGFS Disorderly',
   'Move to PCAF score 1–2 data for top-20 holdings by 2027 via OE telemetry integration; annual limited assurance from PwC on financed emissions.',
   'mitigating', datetime('now'));

-- ─── ESG disclosures ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO esg_disclosures
  (id, participant_id, framework, reporting_year,
   period_start, period_end,
   scope1_tco2e, scope2_location_tco2e, scope2_market_tco2e, scope3_tco2e,
   assurance_level, assurance_provider,
   status, submitted_at, notes, created_at)
VALUES
  -- CDP Investor 2025 — Climate Module
  ('disc_cf_001', 'demo_carbon_001', 'CDP_Investor', 2025,
   '2025-01-01', '2025-12-31',
   9.77, 81.47, 0.0, 89.67,
   'limited', 'PwC South Africa',
   'submitted', '2026-02-28',
   'CDP Investor questionnaire — Climate Module C1–C11 + W (Water). Score: B (Management). First submission as signatory.',
   datetime('now')),

  -- TCFD-aligned annual report section
  ('disc_cf_002', 'demo_carbon_001', 'TCFD', 2025,
   '2025-01-01', '2025-12-31',
   9.77, 81.47, 0.0, 89.67,
   'limited', 'PwC South Africa',
   'published', '2026-03-15',
   'TCFD four-pillar disclosure in 2025 Annual Report to LPs (Governance, Strategy, Risk Management, Metrics & Targets). First limited-assurance year.',
   datetime('now')),

  -- GRI Standards (in progress)
  ('disc_cf_003', 'demo_carbon_001', 'GRI', 2025,
   '2025-01-01', '2025-12-31',
   NULL, NULL, NULL, NULL,
   'none', NULL,
   'draft', NULL,
   'GRI Universal Standards 2021 + GRI 305 (Emissions) + GRI 201 (Economic Performance). Target: sustainability annex Q2 2026.',
   datetime('now'));

-- ─── Annual rollup ────────────────────────────────────────────────────────────
-- PK: (participant_id, reporting_year, tenant_id) — no id column
INSERT OR IGNORE INTO esg_annual_rollup
  (participant_id, tenant_id, reporting_year,
   scope1_tco2e, scope2_location_tco2e, scope2_market_tco2e, scope3_tco2e,
   scope3_by_category,
   total_tco2e_location, total_tco2e_market,
   energy_consumption_mwh, renewable_mwh, renewable_pct,
   data_quality_score, computed_at)
VALUES
  -- FY2025 full-year (annualised from Q1 partial + financed emissions estimate)
  ('demo_carbon_001', 'default', 2025,
   9.77, 81.47, 0.0, 89.67,
   '{"6":1.84,"15":87.83}',
   180.91, 91.24,
   81.47, 0.0, 0.0,
   62.0, datetime('now')),

  -- FY2026 Q1 actuals only (in-progress)
  ('demo_carbon_001', 'default', 2026,
   0.81, 25.48, 0.0, 89.67,
   '{"6":1.84,"15":87.83}',
   115.96, 90.48,
   25.48, 0.0, 0.0,
   48.0, datetime('now'));
