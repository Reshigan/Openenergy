-- Horizon chain-case backfill: Goldrush (p_live_goldrush, offtaker) buys from GoNXT's
-- 10 real private-wire C&I solar sites. Horizon is chain-case-driven; tile/stats
-- backfills did not light it. This creates one PPA per site in off_ppa_portfolio, then
-- one monthly PPA delivery obligation per PPA for the current month in the non-terminal
-- 'pending' state -> lands Goldrush on a populated /horizon (ppa_obligation lane).
-- Monthly contracted = capacity_mw * 1752 / 12; delivered at 0.95 (CALCULATED
-- retrospective off the real fleet). Idempotent: INSERT OR IGNORE, deterministic ids.

-- One active PPA per real site (Goldrush is the buyer; GoNXT the seller).
INSERT OR IGNORE INTO off_ppa_portfolio (
  id, participant_id, tenant_id, contract_ref, counterparty_name, technology,
  capacity_mw, ppa_term_years, ppa_start_date, ppa_end_date, price_zar_per_mwh,
  indexation, expected_p50_gwh_yr, status, take_or_pay_pct, cure_window_days, notes
)
SELECT
  'ppa_goldrush_' || substr(p.id, 6, 12),
  'p_live_goldrush', 'default', 'PPA-GR-' || substr(p.id, 6, 6), 'GoNXT Energy', 'solar',
  p.capacity_mw, 20, '2024-03-01', '2044-02-29', 1230,
  'CPI', ROUND(p.capacity_mw * 1752.0 / 1000.0, 4), 'active', 95, 30,
  'Private-wire C&I solar PPA with GoNXT (' || p.project_name || ').'
FROM ipp_projects p
WHERE p.developer_id = 'p_live_gonxt';

-- Current-month delivery obligation per PPA, non-terminal 'pending'.
INSERT OR IGNORE INTO oe_offtaker_ppa_obligations (
  id, ppa_id, participant_id, counterparty_id, period_month,
  contracted_mwh, delivered_mwh, threshold_pct, status, notes
)
SELECT
  'oblig_2026_06_' || substr(p.id, 6, 12),
  'ppa_goldrush_' || substr(p.id, 6, 12), 'p_live_goldrush', 'p_live_gonxt', '2026-06',
  ROUND(p.capacity_mw * 1752.0 / 12.0, 2),
  ROUND(p.capacity_mw * 1752.0 / 12.0 * 0.95, 2),
  95, 'pending',
  'June 2026 delivery obligation. Contracted = capacity * 1752/12; delivered at 0.95 (calculated retrospective off real fleet).'
FROM ipp_projects p
WHERE p.developer_id = 'p_live_gonxt';

UPDATE participants SET onboarding_completed = 1, onboarding_step = 'completed', updated_at = datetime('now')
WHERE id = 'p_live_goldrush';
