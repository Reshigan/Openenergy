-- 089 — Backfill the Regulator + Carbon workstation tabs for the video.
--
-- Preflight against prod showed these tabs reading empty:
--   • Regulator → Licence applications      (reg_licence_applications)
--   • Regulator → Tariff applications        (reg_tariff_applications)
--   • Regulator → Tariff (L5 / OE)           (oe_tariff_applications)
--   • Regulator → Enforcement                (regulator_enforcement_cases — only 2 rows from 030)
--   • Carbon    → Trades                     (carbon_trades)
--
-- 005 already seeds loan_covenants + disbursement_requests (Lender suite),
-- 041 already seeds cdr_projects (Carbon CDR tab), 030 already seeds
-- regulator_licences. This migration covers the remaining gaps.
--
-- Idempotent (INSERT OR IGNORE). FKs disabled for the body so replay
-- against the unit-test sqlite (which skips 003 parents) doesn't reject —
-- prod has every parent (carbon_projects from 003, participants from 003,
-- regulator_licences from 030).
PRAGMA foreign_keys = OFF;

-- ─── Licence applications (5 rows, mixed outcomes) ────────────────────
INSERT OR IGNORE INTO reg_licence_applications
  (id, application_ref, applicant_id, applicant_name, licence_category,
   capacity_mw, technology, jurisdiction, filed_at,
   completeness_check_outcome, technical_evaluator, financial_evaluator,
   panel_decision_at, outcome, conditions, notes)
VALUES
  ('rla_001','LIC-APP-2025-018','demo_ipp_001','RenewCo Solar (Pty) Ltd',
   'REG_LIC_GENERATION', 75.0, 'solar_pv', 'Northern Cape',
   '2025-08-12', 'complete', 'P. Mokoena', 'S. Ramaphosa',
   '2025-11-05', 'granted',
   'Quarterly generation reports per s.24(1). Connection acceptance test under NRS 097.',
   'De Aar 75 MW PV. Routine grant — standard conditions.'),

  ('rla_002','LIC-APP-2025-022','demo_ipp_002','WindCapital (Pty) Ltd',
   'REG_LIC_GENERATION', 120.0, 'wind', 'Eastern Cape',
   '2025-09-04', 'complete', 'A. Khumalo', 'P. van Zyl',
   '2026-01-20', 'granted_with_conditions',
   'Avifaunal monitoring biannual. Curtailment cap until 132 kV reinforcement complete.',
   'Jeffreys Bay refi capacity. Conditions reflect grid constraint.'),

  ('rla_003','LIC-APP-2026-002','demo_ipp_001','RenewCo Solar (Pty) Ltd',
   'REG_LIC_GENERATION', 200.0, 'csp', 'Northern Cape',
   '2026-01-30', 'pending_documents', 'P. Mokoena', NULL,
   NULL, 'pending',
   NULL,
   'Upington CSP. Awaiting IFC equator-principles attestation + water-use licence.'),

  ('rla_004','LIC-APP-2026-005','demo_offtaker_001','City Energy Municipality',
   'REG_LIC_DISTRIBUTION', NULL, NULL, 'Gauteng',
   '2026-02-14', 'complete', 'T. Sithole', 'S. Ramaphosa',
   NULL, 'pending',
   NULL,
   'Municipal redistribution licence variation. Hearing scheduled 2026-06-10.'),

  ('rla_005','LIC-APP-2025-031','demo_ipp_002','WindCapital (Pty) Ltd',
   'REG_LIC_GENERATION', 5.0, 'wind', 'Western Cape',
   '2025-11-20', 'incomplete', NULL, NULL,
   '2026-02-28', 'withdrawn',
   NULL,
   'Pilot turbine — applicant elected to defer pending revised wind resource study.');

-- ─── Tariff applications (legacy NERSA-format) ───────────────────────
INSERT OR IGNORE INTO reg_tariff_applications
  (id, application_ref, applicant_id, applicant_name, tariff_year,
   requested_increase_pct, approved_increase_pct, multi_year_path,
   status, decision_date, notes)
VALUES
  ('rta_001','TAR-APP-2026-001','demo_offtaker_001','City Energy Municipality',
   2026, 18.7, 12.3, 'MYPD5', 'determined', '2026-03-15',
   'Approved at 12.3% — below requested 18.7%. Cost-of-supply study cited.'),
  ('rta_002','TAR-APP-2027-001','demo_ipp_001','RenewCo Solar (Pty) Ltd',
   2027, 8.5, NULL, 'MYPD6', 'hearing', NULL,
   'Public hearing scheduled 2026-09-08. Comment period closed 2026-04-30.'),
  ('rta_003','TAR-APP-2025-007','demo_offtaker_001','City Energy Municipality',
   2025, 14.2, 9.8, 'MYPD5', 'determined', '2025-02-22',
   'Prior-year award. Reference point for 2026 application.');

-- ─── L5 Tariff applications (oe_tariff_applications) ─────────────────
INSERT OR IGNORE INTO oe_tariff_applications
  (id, applicant_id, application_ref, application_type, filing_date,
   comment_period_ends, hearing_scheduled_at, status,
   requested_revenue_zar, current_revenue_zar, pct_change,
   documents_r2_prefix)
VALUES
  ('ota_001','demo_offtaker_001','OE-TAR-2026-001','mypd',
   '2026-02-01','2026-04-30','2026-09-08','in_comment_period',
   524000000000, 462500000000, 13.30,
   'r2://oe-prod-vault/tariff-apps/OE-TAR-2026-001/'),

  ('ota_002','demo_ipp_001','OE-TAR-2026-002','annual_revision',
   '2026-01-15','2026-03-15',NULL,'comment_period_closed',
   18500000, 17200000, 7.56,
   'r2://oe-prod-vault/tariff-apps/OE-TAR-2026-002/'),

  ('ota_003','demo_offtaker_001','OE-TAR-2025-009','special_review',
   '2025-09-12','2025-11-12','2025-12-04','decided',
   1820000000, 1750000000, 4.00,
   'r2://oe-prod-vault/tariff-apps/OE-TAR-2025-009/');

-- ─── Add 3 more enforcement cases (030 already has enf_001, enf_002) ──
INSERT OR IGNORE INTO regulator_enforcement_cases
  (id, case_number, respondent_participant_id, respondent_name,
   alleged_contravention, statutory_provision, severity, status, opened_at,
   lead_investigator_id, created_by)
VALUES
  ('enf_003','CASE-2026-002','demo_ipp_002','WindCapital (Pty) Ltd',
   'Generation telemetry gap exceeding 4 hours during system emergency on 2026-02-18.',
   'NERSA Grid Code Part E §6.3', 'high', 'investigating',
   '2026-02-20', 'demo_admin_001','demo_admin_001'),

  ('enf_004','CASE-2026-003','demo_trader_001','Demo Trader 1 (Pty) Ltd',
   'Front-running pattern flagged by surveillance rule CONCENTRATION_02 across 7 trading sessions.',
   'FMA 19/2012 s.78, NERSA Market Code §11.4', 'critical', 'hearing',
   '2026-03-04', 'demo_admin_001','demo_admin_001'),

  ('enf_005','CASE-2025-009','demo_offtaker_001','City Energy Municipality',
   'Late filing of Q4-2025 distribution revenue report.',
   'ERA 2006 s.24(1)', 'low', 'closed',
   '2025-12-15', 'demo_admin_001','demo_admin_001');

UPDATE regulator_enforcement_cases
   SET finding = 'Operator accepted gap; commissioned redundant telemetry feed by 2026-04-15.',
       finding_date = '2026-04-22',
       penalty_amount_zar = 75000,
       penalty_description = 'Administrative penalty + corrective-action plan accepted.'
 WHERE id = 'enf_005';

-- ─── Carbon trades (mixed buyers/sellers, vintages, settled + matched) ─
INSERT OR IGNORE INTO carbon_trades
  (id, buyer_id, seller_id, project_id, credit_type, volume_tco2,
   price_per_tco2, currency, status, certificate_reference, vintage_year,
   created_at)
VALUES
  ('ctr_001','demo_offtaker_001','demo_carbon_001','cp_001','CER',
   2500, 235.00, 'ZAR', 'settled', 'CER-2023-KS-00417', 2023,
   '2026-02-04 09:12:00'),
  ('ctr_002','demo_offtaker_001','demo_carbon_001','cp_002','CER',
   1800, 248.50, 'ZAR', 'settled', 'CER-2023-MK-00088', 2023,
   '2026-02-11 11:48:00'),
  ('ctr_003','demo_ipp_001','demo_carbon_001','cp_004','CER',
   4000, 252.00, 'ZAR', 'matched', NULL, 2024,
   '2026-03-22 14:05:00'),
  ('ctr_004','demo_offtaker_001','demo_carbon_001','cp_003','VER',
   650, 142.00, 'ZAR', 'settled', 'VER-2023-CK-00204', 2023,
   '2026-03-28 10:30:00'),
  ('ctr_005','demo_carbon_001','demo_ipp_002','cp_002','CER',
   1200, 244.00, 'ZAR', 'matched', NULL, 2024,
   '2026-04-15 08:20:00'),
  ('ctr_006','demo_offtaker_001','demo_carbon_001','cp_001','CER',
   3200, 258.75, 'ZAR', 'settled', 'CER-2024-KS-00501', 2024,
   '2026-04-22 13:42:00'),
  ('ctr_007','demo_offtaker_001','demo_carbon_001','cp_002','CER',
   900, 261.00, 'ZAR', 'matched', NULL, 2024,
   '2026-05-08 15:55:00'),
  ('ctr_008','demo_carbon_001','demo_ipp_001','cp_004','CER',
   2100, 255.00, 'ZAR', 'cancelled', NULL, 2024,
   '2026-04-30 16:18:00');

PRAGMA foreign_keys = ON;
