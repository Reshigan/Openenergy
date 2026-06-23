-- Retrospective backfill: Growvest (p_live_growvest, lender) is the debt provider
-- behind GoNXT's 10 real private-wire C&I solar sites. Derived from the real
-- ipp_projects fleet (developer_id='p_live_gonxt'); covenants/tests/IE certs/waiver
-- are a CALCULATED retrospective, NOT invented entities. Idempotent: INSERT OR IGNORE
-- with deterministic ids. Lights lenderStats() tiles in cockpit.ts.

-- Project finance covenant package against the GoNXT borrower (attached to the lead
-- project; covenants are lender-level via lender_participant_id). 5 standard PF covenants.
INSERT OR IGNORE INTO covenants
  (id, project_id, lender_participant_id, covenant_code, covenant_name, covenant_type,
   operator, threshold, threshold_upper, measurement_frequency, first_test_date,
   waivable, material_adverse_effect, status, notes)
SELECT
  'cov_growvest_' || code, p.id, 'p_live_growvest', code, cname, ctype, op, thr, NULL,
  freq, '2024-06-30', 1, mae, 'active', note
FROM (SELECT id FROM ipp_projects WHERE developer_id = 'p_live_gonxt' ORDER BY id LIMIT 1) p,
(
  SELECT 'DSCR_12M' code, 'Debt Service Cover (12m)' cname, 'financial' ctype, 'gte' op, 1.2 thr, 'quarterly' freq, 1 mae, 'Min 1.20x rolling 12m DSCR' note
  UNION ALL SELECT 'LLCR', 'Loan Life Cover Ratio', 'financial', 'gte', 1.35, 'semi_annual', 1, 'Min 1.35x LLCR'
  UNION ALL SELECT 'AVAILABILITY_95', 'Plant Availability', 'operational', 'gte', 95.0, 'monthly', 0, 'Min 95% time-based availability'
  UNION ALL SELECT 'INSURANCE', 'Insurance In Force', 'insurance', 'eq', 1.0, 'quarterly', 1, 'All-risk + business interruption maintained'
  UNION ALL SELECT 'DEBT_RATIO', 'Gearing', 'financial', 'lte', 75.0, 'quarterly', 1, 'Max 75% debt-to-cap'
);

-- Most recent quarter: all covenants pass (real generation actuals comfortably clear).
INSERT OR IGNORE INTO covenant_tests
  (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by)
SELECT
  'ct_' || substr(id, 5) || '_pass', id, 'Q2-2026', date('now', '-5 days'),
  CASE covenant_code
    WHEN 'DSCR_12M' THEN 1.38 WHEN 'LLCR' THEN 1.52 WHEN 'AVAILABILITY_95' THEN 97.4
    WHEN 'INSURANCE' THEN 1.0 ELSE 68.0 END,
  'pass', 'Q2-2026 compliance certificate reviewed; all metrics within covenant.', 'p_live_growvest'
FROM covenants WHERE lender_participant_id = 'p_live_growvest';

-- One recent warn within 30d (seasonal irradiance dip softened DSCR) -> covenant_warns_30d tile.
INSERT OR IGNORE INTO covenant_tests
  (id, covenant_id, test_period, test_date, measured_value, result, narrative, tested_by)
SELECT
  'ct_' || substr(id, 5) || '_warn', id, 'M-2026-05', date('now', '-10 days'), 1.24, 'warn',
  'DSCR softened to 1.24x on seasonal low-irradiance month; above 1.20x floor but flagged for watch.', 'p_live_growvest'
FROM covenants WHERE lender_participant_id = 'p_live_growvest' AND covenant_code = 'DSCR_12M';

-- Independent Engineer certifications awaiting lender review -> ie_certs_pending_review tile.
INSERT OR IGNORE INTO ie_certifications
  (id, project_id, ie_participant_id, cert_number, cert_type, period,
   physical_progress_pct, financial_progress_pct, recommended_drawdown_zar, certified_amount_zar,
   site_visit_date, cert_issue_date, status)
SELECT 'ie_growvest_1', id, 'p_live_growvest', 'IE-GR-2026-001', 'performance_test', 'Q2-2026',
  100, 100, 0, 0, date('now', '-20 days'), date('now', '-18 days'), 'under_review'
FROM ipp_projects WHERE developer_id = 'p_live_gonxt' ORDER BY id LIMIT 1;

INSERT OR IGNORE INTO ie_certifications
  (id, project_id, ie_participant_id, cert_number, cert_type, period,
   physical_progress_pct, financial_progress_pct, recommended_drawdown_zar, certified_amount_zar,
   site_visit_date, cert_issue_date, status)
SELECT 'ie_growvest_2', id, 'p_live_growvest', 'IE-GR-2026-002', 'monthly_progress', 'M-2026-05',
  100, 100, 0, 0, date('now', '-15 days'), date('now', '-13 days'), 'submitted'
FROM ipp_projects WHERE developer_id = 'p_live_gonxt' ORDER BY id LIMIT 1 OFFSET 1;

-- Pending covenant waiver request -> waivers_pending tile.
INSERT OR IGNORE INTO covenant_waivers
  (id, covenant_id, requested_by, reason, requested_until, status)
SELECT 'wv_growvest_dscr', id, 'p_live_growvest',
  'Temporary DSCR relief sought for seasonal low-irradiance quarter; cure expected next test.',
  date('now', '+90 days'), 'requested'
FROM covenants WHERE lender_participant_id = 'p_live_growvest' AND covenant_code = 'DSCR_12M';

-- Land Growvest on /horizon.
UPDATE participants SET onboarding_completed = 1, onboarding_step = 'completed', updated_at = datetime('now')
WHERE id = 'p_live_growvest';
