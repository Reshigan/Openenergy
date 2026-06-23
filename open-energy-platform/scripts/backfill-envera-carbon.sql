-- Retrospective backfill: Envera (p_live_envera, carbon_fund) holds the carbon
-- credit programme for GoNXT's 10 real C&I solar sites. Credits are a CALCULATED
-- retrospective: tCO2e = generated MWh * 0.94 (SA combined-margin grid EF), where
-- generated MWh = capacity_mw * 1752 (capacity_mw * 8760h * 0.20 CF). Derived from
-- the real ipp_projects fleet, NOT invented. Idempotent: INSERT OR IGNORE with
-- deterministic ids. Lights carbonStats() tiles in cockpit.ts.

-- Registry (FK target for credit_vintages.registry_id). SA carbon-tax eligible.
INSERT OR IGNORE INTO carbon_registries
  (id, registry_code, registry_name, registry_type, sa_carbon_tax_eligible, enabled)
VALUES ('reg_vcs', 'VCS', 'Verra Verified Carbon Standard', 'voluntary', 1, 1);

-- The grid-connected renewable programme. credits = fleet generation * 0.94.
INSERT OR IGNORE INTO carbon_projects
  (id, project_name, project_number, project_type, methodology, host_country, developer_id,
   credits_issued, credits_available, credits_retired, status, registration_date, verification_date)
SELECT 'cp_envera_gonxt', 'GoNXT C&I Solar Programme', 'VCS-GR-2024-001', 'renewable_energy',
  'ACM0002', 'ZA', 'p_live_envera',
  ROUND(s.c2024 + s.c2025), ROUND(s.c2024 + s.c2025), 0, 'active', '2024-02-15', date('now', '-40 days')
FROM (
  SELECT SUM(capacity_mw * 1752 * 10.0 / 12.0 * 0.94) c2024, SUM(capacity_mw * 1752 * 0.94) c2025
  FROM ipp_projects WHERE developer_id = 'p_live_gonxt'
) s;

-- Vintages: 2024 (Mar-Dec) + 2025 (full). credits_active tile = SUM(issued - retired).
INSERT OR IGNORE INTO credit_vintages
  (id, project_id, registry_id, vintage_year, serial_prefix, serial_start, serial_end,
   credits_issued, credits_retired, methodology, issuance_date, sa_carbon_tax_eligible)
SELECT 'cv_envera_2024', 'cp_envera_gonxt', 'reg_vcs', 2024, 'VCS-GR-2024', 1,
  CAST(ROUND(SUM(capacity_mw * 1752 * 10.0 / 12.0 * 0.94)) AS INTEGER),
  CAST(ROUND(SUM(capacity_mw * 1752 * 10.0 / 12.0 * 0.94)) AS INTEGER), 0,
  'ACM0002', '2025-02-15', 1
FROM ipp_projects WHERE developer_id = 'p_live_gonxt';

INSERT OR IGNORE INTO credit_vintages
  (id, project_id, registry_id, vintage_year, serial_prefix, serial_start, serial_end,
   credits_issued, credits_retired, methodology, issuance_date, sa_carbon_tax_eligible)
SELECT 'cv_envera_2025', 'cp_envera_gonxt', 'reg_vcs', 2025, 'VCS-GR-2025', 100000,
  100000 + CAST(ROUND(SUM(capacity_mw * 1752 * 0.94)) AS INTEGER) - 1,
  CAST(ROUND(SUM(capacity_mw * 1752 * 0.94)) AS INTEGER), 0,
  'ACM0002', '2026-02-15', 1
FROM ipp_projects WHERE developer_id = 'p_live_gonxt';

-- MRV: 2024 verified (feeds verified_90d tile via verification below), 2025 in validation (mrv_pending tile).
INSERT OR IGNORE INTO mrv_submissions
  (id, project_id, reporting_period_start, reporting_period_end, submitted_by,
   claimed_reductions_tco2e, monitoring_methodology, baseline_methodology,
   baseline_emissions_tco2e, project_emissions_tco2e, leakage_tco2e, status, submitted_at)
SELECT 'mrv_envera_2024', 'cp_envera_gonxt', '2024-03-01', '2024-12-31', 'p_live_envera',
  ROUND(SUM(capacity_mw * 1752 * 10.0 / 12.0 * 0.94), 1), 'ACM0002 monitoring plan',
  'Combined margin grid EF 0.94 tCO2e/MWh',
  ROUND(SUM(capacity_mw * 1752 * 10.0 / 12.0 * 0.94), 1), 0, 0, 'verified', '2025-01-20'
FROM ipp_projects WHERE developer_id = 'p_live_gonxt';

INSERT OR IGNORE INTO mrv_submissions
  (id, project_id, reporting_period_start, reporting_period_end, submitted_by,
   claimed_reductions_tco2e, monitoring_methodology, baseline_methodology,
   baseline_emissions_tco2e, project_emissions_tco2e, leakage_tco2e, status, submitted_at)
SELECT 'mrv_envera_2025', 'cp_envera_gonxt', '2025-01-01', '2025-12-31', 'p_live_envera',
  ROUND(SUM(capacity_mw * 1752 * 0.94), 1), 'ACM0002 monitoring plan',
  'Combined margin grid EF 0.94 tCO2e/MWh',
  ROUND(SUM(capacity_mw * 1752 * 0.94), 1), 0, 0, 'validation', date('now', '-15 days')
FROM ipp_projects WHERE developer_id = 'p_live_gonxt';

-- Positive verification within 90d -> verified_90d tile.
INSERT OR IGNORE INTO mrv_verifications
  (id, submission_id, verifier_participant_id, verifier_accreditation, site_visit_date,
   desk_review_date, verified_reductions_tco2e, opinion, verification_date)
SELECT 'mvf_envera_2024', 'mrv_envera_2024', 'p_live_envera', 'ISO 14065',
  date('now', '-50 days'), date('now', '-45 days'),
  ROUND(SUM(capacity_mw * 1752 * 10.0 / 12.0 * 0.94), 1), 'positive', date('now', '-40 days')
FROM ipp_projects WHERE developer_id = 'p_live_gonxt';

-- Carbon-tax offset claim against 2025 vintage -> tax_claims_submitted tile.
-- 1581 tCO2e applied at ~R195/tCO2e prevailing rate = R308,295 offset.
INSERT OR IGNORE INTO carbon_tax_offset_claims
  (id, taxpayer_participant_id, tax_year, gross_tax_liability_zar, offset_limit_pct,
   offset_limit_zar, credits_applied_tco2e, offset_value_zar, net_tax_liability_zar,
   status, submitted_at, created_by)
VALUES ('cto_envera_2025', 'p_live_envera', 2025, 5000000, 10, 500000,
   1581, 308295, 4691705, 'submitted', date('now', '-12 days'), 'p_live_envera');

-- Land Envera on /horizon.
UPDATE participants SET onboarding_completed = 1, onboarding_step = 'completed', updated_at = datetime('now')
WHERE id = 'p_live_envera';
