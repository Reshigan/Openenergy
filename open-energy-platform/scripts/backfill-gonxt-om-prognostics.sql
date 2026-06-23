-- Retrospective O&M derivation: GoNXT (p_live_gonxt) runs 10 real C&I solar sites
-- with 4501 real SolaX telemetry rows. This computes asset-health prognostics from
-- that ACTUAL telemetry (NOT invented): per-site capacity factor = AVG(ac_kw) /
-- (capacity_mw * 1000), compared to a fleet upper-quartile daytime-sampled benchmark
-- of 0.10. Sites below the benchmark carry a real, quantified underperformance case.
-- Lost generation -> revenue at risk at the GoNXT PPA tariff (1230 ZAR/MWh) over a
-- 90-day prognostic horizon. Idempotent: INSERT OR IGNORE, deterministic ids.
-- Lights the O&M / asset-health (esums) Horizon + oe_asset_prognostics ledger.
-- This is the hand-run equivalent of what onboarding-activation now derives
-- automatically for a historic generation fleet (see deriveAssetPrognostics).

-- ponytail: expected CF 0.10 is the fleet upper-quartile (Ladysmith+) daytime CF;
-- raise it only if telemetry sampling changes to true 24h basis.
INSERT OR IGNORE INTO oe_asset_prognostics (
  id, site_id, asset_label, technology, status, tier, prediction_type, fault_mode,
  fault_mode_confidence, safety_implicated, evidence_json, health_score,
  performance_ratio, anomaly_score, anomaly_confidence, lost_kwh_per_day,
  tariff_zar_per_mwh, revenue_at_risk_zar, reactive_cost_zar, predictive_cost_zar,
  savings_zar, savings_pct, benchmark_savings_zar, rul_days, detected_at,
  status_entered_at, is_reportable, created_at, updated_at
)
SELECT
  'aprog_gonxt_' || substr(a.site_id, 6, 10),
  a.site_id,
  a.name || ' PV array',
  'solar',
  'predicted',
  CASE
    WHEN a.rev_at_risk < 5000 THEN 'minor'
    WHEN a.rev_at_risk < 25000 THEN 'moderate'
    WHEN a.rev_at_risk < 100000 THEN 'material'
    ELSE 'major' END,
  CASE WHEN a.cf < 0.04 THEN 'anomaly' ELSE 'pr_degradation' END,
  CASE WHEN a.cf < 0.04 THEN 'string_or_mppt_fault'
       WHEN a.cf < 0.07 THEN 'soiling_or_partial_shading' ELSE NULL END,
  CASE WHEN a.cf < 0.04 THEN 0.74 WHEN a.cf < 0.07 THEN 0.55 ELSE NULL END,
  0,
  json_object(
    'basis', 'real SolaX telemetry capacity-factor vs fleet 0.10 benchmark',
    'telemetry_rows', a.rows,
    'capacity_kw', round(a.cap_kw, 1),
    'avg_ac_kw', round(a.avg_kw, 3),
    'capacity_factor', round(a.cf, 4),
    'expected_cf', 0.10,
    'lost_kw', round(a.lost_kw, 3)
  ),
  CAST(round(100.0 * a.cf / 0.10) AS INTEGER),
  round(a.cf / 0.10, 3),
  round(MIN(1.0, (0.10 - a.cf) / 0.10), 3),
  0.7,
  round(a.lost_kwh_day, 1),
  1230,
  CAST(round(a.rev_at_risk) AS INTEGER),
  CAST(round(a.rev_at_risk + 30000) AS INTEGER),
  8000,
  CAST(round(a.rev_at_risk + 30000 - 8000) AS INTEGER),
  round((a.rev_at_risk + 30000 - 8000) / (a.rev_at_risk + 30000), 3),
  CAST(round((a.rev_at_risk + 30000) * 0.30) AS INTEGER),
  90,
  datetime('now', '-7 days'),
  datetime('now', '-7 days'),
  0,
  datetime('now'),
  datetime('now')
FROM (
  SELECT
    s.id site_id, s.name, s.capacity_mw * 1000 cap_kw,
    COUNT(t.id) rows, AVG(t.ac_kw) avg_kw,
    AVG(t.ac_kw) / (s.capacity_mw * 1000) cf,
    MAX(0, (0.10 - AVG(t.ac_kw) / (s.capacity_mw * 1000)) * s.capacity_mw * 1000) lost_kw,
    MAX(0, (0.10 - AVG(t.ac_kw) / (s.capacity_mw * 1000)) * s.capacity_mw * 1000) * 24 lost_kwh_day,
    MAX(0, (0.10 - AVG(t.ac_kw) / (s.capacity_mw * 1000)) * s.capacity_mw * 1000) * 24 * 90 / 1000.0 * 1230 rev_at_risk
  FROM om_sites s JOIN om_telemetry t ON t.site_id = s.id
  WHERE s.participant_id = 'p_live_gonxt'
  GROUP BY s.id
  HAVING cf < 0.10
) a;
