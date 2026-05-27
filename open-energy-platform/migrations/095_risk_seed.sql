-- 095_risk_seed.sql
-- Wave 2 seed: risk factors + ~260 days of synthetic-but-realistic factor
-- history + 12 SA-grid system scenarios + 4 system risk_portfolios + a
-- subscription swap so antoinette@gonxt.tech is the only recipient of the
-- Friday-17:00 SAST trading-risk MTD digest. All INSERT OR IGNORE so the
-- migration is replay-safe.

-- ── risk_factors (catalogue) ───────────────────────────────────────────
INSERT OR IGNORE INTO risk_factors (id, name, factor_type, unit, source) VALUES
  ('spot_baseload',     'ZA Spot — Baseload',      'spot',   'ZAR/MWh',  'mark_prices'),
  ('spot_peak',         'ZA Spot — Peak',          'spot',   'ZAR/MWh',  'mark_prices'),
  ('spot_solar',        'ZA Spot — Solar',         'spot',   'ZAR/MWh',  'mark_prices'),
  ('spot_wind',         'ZA Spot — Wind',          'spot',   'ZAR/MWh',  'mark_prices'),
  ('spot_renewable',    'ZA Spot — Renewable',     'spot',   'ZAR/MWh',  'mark_prices'),
  ('fx_zar_usd',        'FX ZAR/USD',              'fx',     'ZAR/USD',  'external_feed_fx'),
  ('coal_api4',         'Coal API4 (Richards Bay)','fuel',   'USD/MT',   'external_feed_coal'),
  ('reippp_rr4',        'REIPPPP RR4 Index',       'index',  'pts',      'external_feed_reippp'),
  ('carbon_offset_zar', 'ZA Carbon Offset',        'index',  'ZAR/tCO2', 'external_feed_carbon'),
  ('rates_prime',       'SA Prime Rate',           'rates',  'pct',      'external_feed_rates');

-- ── risk_factor_history — 260 deterministic daily closes per factor ────
-- One INSERT per factor to keep each compound SELECT well under SQLite's
-- compound-term limit. The expressions are deterministic so re-runs against
-- --local don't churn.

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0
  UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'spot_baseload', d,
       850 + 60 * (0.5 + 0.5 * ((CAST(n*97 AS REAL) / 19) - CAST((n*97)/19 AS INT))) +
       40 * (CASE WHEN n % 7 IN (5,6) THEN -1 ELSE 1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'spot_peak', d,
       1450 + 120 * (0.5 + 0.5 * ((CAST(n*61 AS REAL) / 17) - CAST((n*61)/17 AS INT))) +
       90 * (CASE WHEN n % 7 IN (5,6) THEN -1 ELSE 1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'spot_solar', d,
       620 + 40 * (0.5 + 0.5 * ((CAST(n*53 AS REAL) / 23) - CAST((n*53)/23 AS INT))) +
       30 * (CASE WHEN (n % 30) > 22 THEN -1 ELSE 1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'spot_wind', d,
       580 + 70 * (0.5 + 0.5 * ((CAST(n*67 AS REAL) / 31) - CAST((n*67)/31 AS INT))) +
       50 * (CASE WHEN (n % 14) > 9 THEN 1 ELSE -1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'spot_renewable', d,
       600 + 50 * (0.5 + 0.5 * ((CAST(n*71 AS REAL) / 29) - CAST((n*71)/29 AS INT))) +
       40 * (CASE WHEN n % 7 IN (5,6) THEN -1 ELSE 1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'fx_zar_usd', d,
       18.20 + 0.80 * (0.5 + 0.5 * ((CAST(n*43 AS REAL) / 41) - CAST((n*43)/41 AS INT))) +
       0.35 * (CASE WHEN (n % 21) > 14 THEN 1 ELSE -1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'coal_api4', d,
       118.0 + 14.0 * (0.5 + 0.5 * ((CAST(n*59 AS REAL) / 37) - CAST((n*59)/37 AS INT))) +
       7.0 * (CASE WHEN (n % 28) > 18 THEN 1 ELSE -1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'reippp_rr4', d,
       100.0 + 5.0 * (0.5 + 0.5 * ((CAST(n*47 AS REAL) / 13) - CAST((n*47)/13 AS INT)))
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'carbon_offset_zar', d,
       240.0 + 30.0 * (0.5 + 0.5 * ((CAST(n*73 AS REAL) / 19) - CAST((n*73)/19 AS INT))) +
       15.0 * (CASE WHEN n % 30 > 24 THEN 1 ELSE -1 END)
  FROM dates;

WITH RECURSIVE dates(d, n) AS (
  SELECT date('now', '-260 days'), 0 UNION ALL
  SELECT date(d, '+1 day'), n + 1 FROM dates WHERE n < 260
)
INSERT OR IGNORE INTO risk_factor_history (factor_id, as_of_date, value)
SELECT 'rates_prime', d,
       11.75 + 0.25 * (0.5 + 0.5 * ((CAST(n*29 AS REAL) / 11) - CAST((n*29)/11 AS INT)))
  FROM dates;

-- ── risk_portfolios — 4 system portfolios spanning the SA book ────────
INSERT OR IGNORE INTO risk_portfolios (id, name, owner_id, basis_filter_json, is_system) VALUES
  ('rpf_sys_all',         'Platform — All Positions',     NULL, '{}',                                   1),
  ('rpf_sys_baseload',    'Baseload Desk',                NULL, '{"energy_type":"baseload"}',           1),
  ('rpf_sys_renewable',   'Renewables Desk',              NULL, '{"energy_type":"renewable"}',          1),
  ('rpf_sys_peak',        'Peak Desk',                    NULL, '{"energy_type":"peak"}',               1);

-- ── risk_scenarios — 12 curated SA-grid named scenarios ───────────────
INSERT OR IGNORE INTO risk_scenarios (id, name, description, is_system, factor_shocks_json, owner_id) VALUES
  ('rsc_loadshed_4',  'Load-shedding Stage 4',
   'Eskom escalates to Stage 4 for a sustained week; peak spot prices spike, baseload firms.',
   1, '[{"factor_id":"spot_peak","shock_pct":0.30},{"factor_id":"spot_baseload","shock_pct":0.15}]', NULL),
  ('rsc_loadshed_6',  'Load-shedding Stage 6',
   'Stage 6 rolling cuts; severe peak shock, baseload + renewable both pulled higher.',
   1, '[{"factor_id":"spot_peak","shock_pct":0.55},{"factor_id":"spot_baseload","shock_pct":0.28},{"factor_id":"spot_renewable","shock_pct":0.18}]', NULL),
  ('rsc_loadshed_8',  'Load-shedding Stage 8',
   'Worst-case grid emergency; whole market dislocates.',
   1, '[{"factor_id":"spot_peak","shock_pct":0.90},{"factor_id":"spot_baseload","shock_pct":0.45},{"factor_id":"spot_renewable","shock_pct":0.30}]', NULL),
  ('rsc_tariff_hike', 'Eskom Tariff Hike +18%',
   'NERSA approves an 18% bulk-tariff increase outside the MYPD trajectory.',
   1, '[{"factor_id":"spot_baseload","shock_pct":0.18},{"factor_id":"spot_peak","shock_pct":0.18}]', NULL),
  ('rsc_reippp_delay','REIPPPP RR4 Delay',
   'Bid Window 7 award + financial close pushed by 9 months; index drops.',
   1, '[{"factor_id":"reippp_rr4","shock_pct":-0.12},{"factor_id":"spot_renewable","shock_pct":0.08}]', NULL),
  ('rsc_coal_plus30', 'Coal API4 +30%',
   'Richards Bay coal benchmark spikes 30% on global supply disruption.',
   1, '[{"factor_id":"coal_api4","shock_pct":0.30},{"factor_id":"spot_baseload","shock_pct":0.12}]', NULL),
  ('rsc_zar_weak15',  'ZAR Weakens 15%',
   'EM contagion: ZAR/USD weakens 15%; dollar-linked fuel cost rises in ZAR terms.',
   1, '[{"factor_id":"fx_zar_usd","shock_pct":0.15},{"factor_id":"spot_baseload","shock_pct":0.07}]', NULL),
  ('rsc_zar_strong15','ZAR Strengthens 15%',
   'Commodity cycle: ZAR/USD strengthens 15%; coal cost falls in ZAR.',
   1, '[{"factor_id":"fx_zar_usd","shock_pct":-0.15},{"factor_id":"spot_baseload","shock_pct":-0.05}]', NULL),
  ('rsc_carbon_tax',  'Carbon Tax Escalation',
   'Carbon Tax Act sees doubled rate from 2027; ZAR/tCO2 offsets re-rate.',
   1, '[{"factor_id":"carbon_offset_zar","shock_pct":0.45},{"factor_id":"spot_baseload","shock_pct":0.06}]', NULL),
  ('rsc_grid_code',   'Grid Code Change',
   'NERSA grid code revision tightens ancillary-service obligations.',
   1, '[{"factor_id":"spot_renewable","shock_pct":-0.08},{"factor_id":"reippp_rr4","shock_pct":-0.04}]', NULL),
  ('rsc_drought_hydro','Drought / Hydro Shortfall',
   'Sustained drought cuts SADC hydro imports; baseload pulls higher.',
   1, '[{"factor_id":"spot_baseload","shock_pct":0.20},{"factor_id":"spot_peak","shock_pct":0.10}]', NULL),
  ('rsc_peak_demand', 'Peak Demand Spike + Transmission Outage',
   'Heatwave coincides with major transmission outage; full peak dislocation.',
   1, '[{"factor_id":"spot_peak","shock_pct":0.65},{"factor_id":"spot_baseload","shock_pct":0.20}]', NULL);

-- ── Subscription swap ──────────────────────────────────────────────────
-- Disable existing demo morning_briefing subscriptions (preserve rows).
UPDATE oe_digest_subscriptions SET enabled = 0
 WHERE id IN ('dgsub_demo_admin', 'dgsub_demo_ipp');

-- Insert the new Friday-17:00 SAST risk MTD digest for antoinette only.
INSERT OR IGNORE INTO oe_digest_subscriptions (
  id, participant_id, channel, destination, digest_type,
  enabled, send_hour_sast, send_days, created_by
) VALUES (
  'dgsub_risk_mtd_antoinette',
  'system',
  'email',
  'antoinette@gonxt.tech',
  'risk_mtd_weekly',
  1,
  17,
  'fri',
  'system'
);
