-- Horizon chain-case backfill: GoNXT (p_live_gonxt, ipp_developer) operates 10 real
-- private-wire C&I solar sites (COD 2024-03-01, 0.96 MW, R1230/MWh PPA). Horizon is
-- chain-case-driven; tile/stats backfills did not light it. This seeds one quarterly
-- generation report per project for the current quarter in the non-terminal
-- 'report_quarter_opened' state -> lands GoNXT on a populated /horizon (ipp_qgr lane).
-- Contracted = capacity_mw * 1752 MWh/yr / 4 (capacity_mw * 8760h * 0.20 CF). Actual is
-- a CALCULATED retrospective at a 0.93 delivery factor off contracted. Derived from the
-- real ipp_projects fleet, NOT invented. Idempotent: INSERT OR IGNORE, deterministic ids.
INSERT OR IGNORE INTO oe_ipp_quarterly_gen_reports (
  id, participant_id, project_id, quarter, report_period_start, report_period_end,
  project_mw, mwh_contracted, mwh_actual, availability_pct, capacity_factor_pct,
  project_tier, chain_status, sla_days, sla_deadline, sla_breached, actor_party, notes
)
SELECT
  'qgr_q2_2026_' || substr(p.id, 6, 12),
  'p_live_gonxt', p.id, 'Q2-2026', '2026-04-01', '2026-06-30',
  p.capacity_mw,
  ROUND(p.capacity_mw * 1752.0 / 4.0, 2),
  ROUND(p.capacity_mw * 1752.0 / 4.0 * 0.93, 2),
  97.4, 20.0,
  'small', 'report_quarter_opened', 30, '2026-07-30', 0, 'ipp',
  'Q2-2026 generation report opened. Contracted MWh = capacity * 1752/4; actual at 0.93 delivery factor (calculated retrospective off real fleet).'
FROM ipp_projects p
WHERE p.developer_id = 'p_live_gonxt';

UPDATE participants SET onboarding_completed = 1, onboarding_step = 'completed', updated_at = datetime('now')
WHERE id = 'p_live_gonxt';
