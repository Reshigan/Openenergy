-- ═══════════════════════════════════════════════════════════════════════════
-- 081_video_demo_trading_carbon_grid_esg.sql
--
-- Camera-critical seed extension for the corporate-video master cut.
-- Brings these surfaces to "populated production system" depth:
--
--   • Trader desk      — 3 algo rules, 3 margin calls, 8 trade fills today,
--                        20+ open orders, recent rejections
--   • Carbon fund      — 8 retirements with OE certificate numbers, 4 options
--                        book entries, portfolio across 6 vintages
--   • Grid operator    — 6 curtailment events (last 14 days), 12 imbalance
--                        rows, 3 active grid constraints
--   • Regulator        — 12 surveillance alerts (extending the 4 from 079),
--                        3 published determinations
--   • ESG              — one filed report per major template (GRI, CDP, TCFD,
--                        JSE-SRL, ISSB)
--   • Admin cascade-DLQ — 4 historical entries showing real platform health
--   • Audit chain      — 6 seed events giving the public audit page content
--
-- One INSERT per row (no UNION ALL chains — D1 caps compound terms).
-- Safe to re-run (INSERT OR IGNORE on stable IDs; UPDATE … WHERE for nullable
-- enrichment).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Trader algo rules (3 active) ─────────────────────────────────────────
-- The table is also lazily created at runtime by src/routes/trading.ts
-- (ensureAlgoTable). Mirror its DDL here so the migration is self-contained
-- when replayed in isolation (e.g. by tests/migrations-replay.test.ts).
CREATE TABLE IF NOT EXISTS trader_algo_rules (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL,
  name TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  energy_type TEXT,
  trigger_below REAL,
  trigger_above REAL,
  size_mwh REAL NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fired_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO trader_algo_rules
  (id, trader_id, name, side, energy_type, trigger_below, trigger_above, size_mwh, enabled, last_fired_at, created_at)
SELECT 'algo-vid-01', id, 'Buy Solar @ ZAR 1,170',  'buy',  'solar', 1170, NULL, 50, 1, datetime('now','-45 minutes'), datetime('now','-7 days')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trader_algo_rules
  (id, trader_id, name, side, energy_type, trigger_below, trigger_above, size_mwh, enabled, last_fired_at, created_at)
SELECT 'algo-vid-02', id, 'Sell Wind @ ZAR 1,190',  'sell', 'wind',  NULL, 1190, 75, 1, datetime('now','-15 minutes'), datetime('now','-5 days')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trader_algo_rules
  (id, trader_id, name, side, energy_type, trigger_below, trigger_above, size_mwh, enabled, last_fired_at, created_at)
SELECT 'algo-vid-03', id, 'Hybrid pair-trade ladder','buy', 'hybrid',1250, 1310, 25, 1, datetime('now','-2 hours'),  datetime('now','-12 days')
  FROM participants WHERE email='trader@openenergy.co.za';

-- ─── 2. Margin calls — three open across cycle stages ────────────────────────
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, created_at)
SELECT 'mc-vid-01', id, datetime('now','-3 hours'),
       18400000, 1840000, 142000, 1750000, 232000,
       datetime('now','+22 hours'), 'issued', datetime('now','-3 hours')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, created_at)
SELECT 'mc-vid-02', id, datetime('now','-8 hours'),
       12200000, 1220000, 88000, 1310000, 0,
       datetime('now','+16 hours'), 'acknowledged', datetime('now','-8 hours')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO margin_calls
  (id, participant_id, as_of, exposure_zar, initial_margin_zar, variation_margin_zar,
   posted_collateral_zar, shortfall_zar, due_by, status, resolved_at, created_at)
SELECT 'mc-vid-03', id, datetime('now','-2 days'),
       9800000, 980000, 41000, 1020000, 0,
       datetime('now','-1 day','-2 hours'), 'cured', datetime('now','-1 day','-12 hours'), datetime('now','-2 days')
  FROM participants WHERE email='trader@openenergy.co.za';

-- ─── 3. Trade fills today — 8 cleared trades ─────────────────────────────────
-- Buyer = trader desk; seller = IPP01. Realistic blend of solar/wind/hybrid.
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-01', 'tord-vid-001', b.id, 'buy', 'solar',
       40, 1210, 48400, 96.80, 48303.20,
       datetime('now','-7 hours'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-001'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-02', 'tord-vid-002', b.id, 'buy', 'wind',
       75, 1160, 87000, 174.00, 86826.00,
       datetime('now','-6 hours'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-002'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='wind@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-03', 'tord-vid-007', b.id, 'buy', 'solar',
       40, 1210, 48400, 96.80, 48303.20,
       datetime('now','-3 hours'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-001'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-04', 'tord-vid-008', b.id, 'sell', 'wind',
       55, 1170, 64350, 128.70, 64221.30,
       datetime('now','-5 hours'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-002'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='offtaker@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-05', 'tord-vid-009', b.id, 'buy', 'hybrid',
       30, 1280, 38400, 76.80, 38323.20,
       datetime('now','-90 minutes'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-002'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-06', 'tord-vid-005', b.id, 'sell', 'wind',
       100, 1180, 118000, 236.00, 117764.00,
       datetime('now','-30 minutes'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-002'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='offtaker@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-07', 'tord-vid-004', b.id, 'sell', 'solar',
       60, 1240, 74400, 148.80, 74251.20,
       datetime('now','-15 minutes'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-003'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='offtaker@openenergy.co.za';
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh, matched_price,
   gross_zar, fee_zar, net_zar, executed_at, buyer_id, buyer_name, seller_id, seller_name, match_id)
SELECT 'fill-vid-08', 'tord-vid-010', b.id, 'buy', 'solar',
       100, 1220, 122000, 244.00, 121756.00,
       datetime('now','-23 hours'),
       b.id, b.name, s.id, s.company_name,
       'tmatch-vid-003'
  FROM participants b, participants s
 WHERE b.email='trader@openenergy.co.za' AND s.email='ipp@openenergy.co.za';

-- ─── 4. Additional open orders — extend 079's 9 to 24 ────────────────────────
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-011', id, 'buy',  'solar',  130, 1170, 1230, date('now','+1 day'),  'KZN-South',  'exchange', 'open', datetime('now','-35 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-012', id, 'sell', 'solar',  140, 1230, 1280, date('now','+2 day'),  'NC-Upington','exchange', 'open', datetime('now','-30 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-013', id, 'buy',  'wind',   170, 1110, 1180, date('now','+1 day'),  'EC-Coastal', 'exchange', 'open', datetime('now','-25 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-014', id, 'sell', 'wind',   200, 1170, 1210, date('now','+1 day'),  'EC-Coastal', 'exchange', 'open', datetime('now','-20 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-015', id, 'buy',  'hybrid',  90, 1250, 1295, date('now','+3 day'),  'WC-Inland',  'exchange', 'open', datetime('now','-15 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-016', id, 'sell', 'hybrid', 110, 1280, 1320, date('now','+3 day'),  'WC-Inland',  'exchange', 'open', datetime('now','-10 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-017', id, 'buy',  'solar',   50, 1185, 1235, date('now','+1 day'),  'NC-Upington','exchange', 'open', datetime('now','-8 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-018', id, 'sell', 'solar',   55, 1220, 1265, date('now','+1 day'),  'KZN-South',  'exchange', 'open', datetime('now','-6 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-019', id, 'buy',  'wind',    65, 1115, 1170, date('now','+2 day'),  'EC-Coastal', 'exchange', 'open', datetime('now','-4 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO trade_orders (id, participant_id, side, energy_type, volume_mwh, price_min, price_max, delivery_date, delivery_point, market_type, status, created_at)
SELECT 'tord-vid-020', id, 'sell', 'wind',    70, 1175, 1215, date('now','+2 day'),  'EC-Coastal', 'exchange', 'open', datetime('now','-2 minutes')
  FROM participants WHERE email='trader@openenergy.co.za';

-- ─── 5. Carbon retirements — 8 historical with OE certificate numbers ────────
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-01', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       2400, 'Voluntary corporate offset — Anchor Offtaker C&I Mining Group',
       'OE-cf3a91bd', 'Anchor Offtaker — C&I Mining Group', 'ZA',
       date('now','-30 days'), p.id, datetime('now','-30 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-02', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       1800, 'Carbon Tax Act 17/2019 — Section 13 offset', 'OE-a7d24f01',
       'Industrial Aluminium SA Ltd', 'ZA', date('now','-22 days'), p.id, datetime('now','-22 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-03', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 1), 'cp_001'),
       3200, 'Sovereign net-zero retirement — National Treasury', 'OE-91e6b85c',
       'Republic of South Africa — National Treasury', 'ZA',
       date('now','-15 days'), p.id, datetime('now','-15 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-04', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       1100, 'Listed company JSE-SRL voluntary offset', 'OE-4d2c0a87',
       'Anchor Offtaker — C&I Mining Group', 'ZA',
       date('now','-10 days'), p.id, datetime('now','-10 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-05', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 1), 'cp_001'),
       950, 'European Investment Bank counterparty offset', 'OE-b87f4106',
       'European Investment Bank', 'LU', date('now','-7 days'), p.id, datetime('now','-7 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-06', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       640, 'Sponsor-mandated Q1 retirement', 'OE-2618a3f5',
       'GreenFunds Carbon Fund — Sponsor mandate', 'ZA',
       date('now','-4 days'), p.id, datetime('now','-4 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-07', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 1), 'cp_001'),
       420, 'Conference event offset — UNFCCC COP-31',
       'OE-d50f7c39', 'UNFCCC Secretariat', 'CH',
       date('now','-2 days'), p.id, datetime('now','-2 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_retirements
  (id, participant_id, project_id, quantity, retirement_reason, certificate_number,
   beneficiary_name, beneficiary_country, retirement_date, created_by, created_at)
SELECT 'crit-vid-08', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       275, 'Climate Investment Funds — verification audit',
       'OE-7e91b234', 'Climate Investment Funds', 'US',
       date('now','-12 hours'), p.id, datetime('now','-12 hours')
  FROM participants p WHERE email='carbon@openenergy.co.za';

-- ─── 6. Carbon options book — 4 entries ──────────────────────────────────────
INSERT OR IGNORE INTO carbon_options
  (id, seller_id, project_id, option_type, strike_price, volume_tco2, expiry_date, premium_per_tco2, status, created_at)
SELECT 'copt-vid-01', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       'call', 285, 1500, date('now','+90 days'), 8.40, 'open', datetime('now','-12 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_options
  (id, seller_id, project_id, option_type, strike_price, volume_tco2, expiry_date, premium_per_tco2, status, created_at)
SELECT 'copt-vid-02', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 1), 'cp_001'),
       'put',  240, 1200, date('now','+120 days'), 6.10, 'open', datetime('now','-9 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_options
  (id, seller_id, project_id, option_type, strike_price, volume_tco2, expiry_date, premium_per_tco2, status, created_at)
SELECT 'copt-vid-03', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 0), 'cp_001'),
       'call', 310,  800, date('now','+180 days'), 12.75, 'open', datetime('now','-4 days')
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO carbon_options
  (id, seller_id, project_id, option_type, strike_price, volume_tco2, expiry_date, premium_per_tco2, status, created_at)
SELECT 'copt-vid-04', p.id, COALESCE((SELECT id FROM carbon_projects LIMIT 1 OFFSET 1), 'cp_001'),
       'put',  260,  650, date('now','+60 days'), 4.20, 'open', datetime('now','-1 day')
  FROM participants p WHERE email='carbon@openenergy.co.za';

-- ─── 7. Grid curtailment events — 6 across last 14 days ──────────────────────
-- These rows feed `/api/grid-l5/curtailment` and the grid-operator workstation.
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-01', 'CURT-2026-0001', 'instruction_issued', p.id,
       datetime('now','-13 days'), 'Inland transmission zone 2 — voltage constraint',
       '{"affected_ipps":["Solar IPP 01 — Northern Cape","Hybrid IPP 02 — Western Cape"],"mw_curtailed":42,"duration_min":75,"compensation_zar":340000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-02', 'CURT-2026-0002', 'instruction_issued', p.id,
       datetime('now','-10 days'), 'EC-Coastal — wind ramp-down for system stability',
       '{"affected_ipps":["Wind IPP 03 — Eastern Cape"],"mw_curtailed":28,"duration_min":42,"compensation_zar":195000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-03', 'CURT-2026-0003', 'instruction_revoked', p.id,
       datetime('now','-8 days'), 'NC-Upington — instruction withdrawn after substation switching',
       '{"affected_ipps":["Solar IPP 04 — Limpopo"],"mw_curtailed":15,"duration_min":18,"compensation_zar":62000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-04', 'CURT-2026-0004', 'instruction_issued', p.id,
       datetime('now','-5 days'), 'WC-Inland transmission constraint after fault on Boundary line',
       '{"affected_ipps":["Hybrid IPP 02 — Western Cape"],"mw_curtailed":35,"duration_min":120,"compensation_zar":475000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-05', 'CURT-2026-0005', 'instruction_issued', p.id,
       datetime('now','-2 days'), 'KZN-South — system-operator directed curtailment',
       '{"affected_ipps":["Solar IPP 01 — Northern Cape"],"mw_curtailed":22,"duration_min":35,"compensation_zar":108000}'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO grid_curtailment_events
  (id, curtailment_id, event_type, actor_id, occurred_at, notes, payload_json)
SELECT 'gce-vid-06', 'CURT-2026-0006', 'instruction_issued', p.id,
       datetime('now','-90 minutes'), 'Zone 2 inland — active curtailment in progress',
       '{"affected_ipps":["Solar IPP 01 — Northern Cape","Hybrid IPP 02 — Western Cape"],"mw_curtailed":18,"duration_min":null,"compensation_zar_accrued":85000}'
  FROM participants p WHERE email='grid@openenergy.co.za';

-- ─── 8. Grid constraints — 3 active congestion zones ─────────────────────────
INSERT OR IGNORE INTO grid_constraints
  (id, constraint_type, location, severity, available_capacity_mw, affected_participants,
   start_date, end_date, status, description, created_at)
VALUES (
  'gcons-vid-01', 'thermal_limit', 'Inland Zone 2 — Boundary line',
  'high', 320, 'Solar IPP 01;Hybrid IPP 02',
  date('now','-3 days'), NULL, 'active',
  'Transformer T2 derated to 320 MW pending tap-changer replacement. Forecast clear 2026-06-01.',
  datetime('now','-3 days')
);
INSERT OR IGNORE INTO grid_constraints
  (id, constraint_type, location, severity, available_capacity_mw, affected_participants,
   start_date, end_date, status, description, created_at)
VALUES (
  'gcons-vid-02', 'voltage', 'EC-Coastal — Aberdeen substation',
  'medium', 280, 'Wind IPP 03',
  date('now','-1 day'), date('now','+5 days'), 'active',
  'Voltage band excursion under high wind. Dynamic reactive support requested.',
  datetime('now','-1 day')
);
INSERT OR IGNORE INTO grid_constraints
  (id, constraint_type, location, severity, available_capacity_mw, affected_participants,
   start_date, end_date, status, description, created_at)
VALUES (
  'gcons-vid-03', 'n-1_contingency', 'WC-Inland — Bacchus 132 kV',
  'medium', 410, 'Hybrid IPP 02;Solar IPP 04',
  date('now','-6 hours'), NULL, 'forecast',
  'Single-line N-1 contingency forecast for 2026-05-26 morning peak. Pre-positioning ancillary reserves.',
  datetime('now','-6 hours')
);

-- ─── 9. Grid imbalance — additional 7 days history (079 has 12 rows) ─────────
-- Add 5 fresh rows scoped to demo IPPs so the imbalance dashboard has trend.
INSERT OR IGNORE INTO grid_imbalance
  (id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh,
   imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance, settled, created_at)
SELECT 'gimb-vid-01', datetime('now','-6 days','start of day'),
       datetime('now','-6 days','start of day','+24 hours'), id,
       420000, 405200, -14800, 0.95, 14060, 0, 1, datetime('now','-5 days')
  FROM participants WHERE email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO grid_imbalance
  (id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh,
   imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance, settled, created_at)
SELECT 'gimb-vid-02', datetime('now','-5 days','start of day'),
       datetime('now','-5 days','start of day','+24 hours'), id,
       380000, 391500, 11500, 0.92, 10580, 1, 1, datetime('now','-4 days')
  FROM participants WHERE email='wind@openenergy.co.za';
INSERT OR IGNORE INTO grid_imbalance
  (id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh,
   imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance, settled, created_at)
SELECT 'gimb-vid-03', datetime('now','-4 days','start of day'),
       datetime('now','-4 days','start of day','+24 hours'), id,
       420000, 444800, 24800, 0.95, 23560, 0, 1, datetime('now','-3 days')
  FROM participants WHERE email='ipp@openenergy.co.za';
INSERT OR IGNORE INTO grid_imbalance
  (id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh,
   imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance, settled, created_at)
SELECT 'gimb-vid-04', datetime('now','-3 days','start of day'),
       datetime('now','-3 days','start of day','+24 hours'), id,
       380000, 365400, -14600, 0.92, 13432, 0, 1, datetime('now','-2 days')
  FROM participants WHERE email='wind@openenergy.co.za';
INSERT OR IGNORE INTO grid_imbalance
  (id, period_start, period_end, participant_id, scheduled_kwh, actual_kwh,
   imbalance_kwh, imbalance_rate, imbalance_charge, within_tolerance, settled, created_at)
SELECT 'gimb-vid-05', datetime('now','-1 day','start of day'),
       datetime('now','-1 day','start of day','+24 hours'), id,
       420000, 418400, -1600, 0.95, 1520, 1, 0, datetime('now','-12 hours')
  FROM participants WHERE email='ipp@openenergy.co.za';

-- ─── 10. Surveillance alerts — extend to 12 (079 has 4) ──────────────────────
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-05', 'rsr-vid-01', 'WASH_TRADE', id, 'trade_fills', 'fill-vid-03', 'medium', 'open',
       datetime('now','-2 hours'), '{"matches":1,"window_min":15}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-06', 'rsr-vid-02', 'MARKING_CLOSE', id, 'trade_orders', 'tord-vid-013', 'high', 'investigating',
       datetime('now','-4 hours'), '{"share_of_volume":0.58,"final_5min":true}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-07', 'rsr-vid-01', 'WASH_TRADE', id, 'trade_fills', 'fill-vid-07', 'low', 'false_positive',
       datetime('now','-1 day','-3 hours'), '{"matches":1,"window_min":22,"counterparty_unrelated":true}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-08', 'rsr-vid-02', 'MARKING_CLOSE', id, 'trade_orders', 'tord-vid-014', 'medium', 'resolved',
       datetime('now','-2 day'), '{"share_of_volume":0.28}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-09', 'rsr-vid-01', 'WASH_TRADE', id, 'trade_fills', 'fill-vid-06', 'high', 'investigating',
       datetime('now','-5 hours'), '{"matches":3,"window_min":12,"escalated":true}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-10', 'rsr-vid-02', 'MARKING_CLOSE', id, 'trade_orders', 'tord-vid-019', 'low', 'open',
       datetime('now','-30 minutes'), '{"share_of_volume":0.34}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-11', 'rsr-vid-01', 'WASH_TRADE', id, 'trade_fills', 'fill-vid-04', 'medium', 'resolved',
       datetime('now','-3 day'), '{"matches":1,"window_min":18}'
  FROM participants WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO regulator_surveillance_alerts
  (id, rule_id, rule_code, participant_id, entity_type, entity_id, severity, status, raised_at, details_json)
SELECT 'rsa-vid-12', 'rsr-vid-02', 'MARKING_CLOSE', id, 'trade_orders', 'tord-vid-020', 'medium', 'open',
       datetime('now','-1 hour'), '{"share_of_volume":0.41}'
  FROM participants WHERE email='trader@openenergy.co.za';

-- ─── 11. Regulator determinations — 3 published ─────────────────────────────
INSERT OR IGNORE INTO regulator_determinations
  (id, reference_number, title, category, statutory_basis, summary, publication_date, gazette_reference, created_at)
VALUES (
  'rdet-vid-01', 'NERSA-DET-2026-0017',
  'Approval of small-scale embedded generation framework for 100 MW Solar IPP 01',
  'licensing', 'Electricity Regulation Act 4 of 2006 §10(1)',
  'NERSA grants the generation licence to Solar IPP 01 (Pty) Ltd subject to grid code compliance and EIA conditions.',
  date('now','-25 days'), 'GG 48891 of 2026', datetime('now','-25 days')
);
INSERT OR IGNORE INTO regulator_determinations
  (id, reference_number, title, category, statutory_basis, summary, publication_date, gazette_reference, created_at)
VALUES (
  'rdet-vid-02', 'NERSA-DET-2026-0021',
  'Methodology for indexed PPA tariff escalation under CPI cap',
  'tariff_methodology', 'Electricity Regulation Act 4 of 2006 §16',
  'Codifies the application of CPI cap to indexed PPA tariffs registered on accredited exchanges.',
  date('now','-12 days'), 'GG 48944 of 2026', datetime('now','-12 days')
);
INSERT OR IGNORE INTO regulator_determinations
  (id, reference_number, title, category, statutory_basis, summary, publication_date, gazette_reference, created_at)
VALUES (
  'rdet-vid-03', 'NERSA-DET-2026-0023',
  'Surveillance findings — wash-trade pattern (Q1 2026)',
  'enforcement', 'NERSA Grid Code §8.4',
  'Investigation of a flagged pattern between affiliated participants. No enforcement action; controls strengthened.',
  date('now','-5 days'), 'GG 48981 of 2026', datetime('now','-5 days')
);

-- ─── 12. ESG reports — one per template (filed) ──────────────────────────────
-- Templates exist as constants in src/routes/esg-reports.ts (GRI/CDP/TCFD/JSE-SRL/ISSB).
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-gri', 'GRI Standards Report — 2025 Operational Year',
       p.id, 2025, 'FY2025', 'filed',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 91,
       datetime('now','-22 days'), p.id, datetime('now','-30 days'),
       'gri', 'GRI Standards Report — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-22 days'),
       'esg-reports/2026/gri-2025.pdf',
       'Full GRI 2021 Standards report. Scope 1+2+3 emissions verified by independent assurance.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-cdp', 'CDP Climate Change Questionnaire — 2025',
       p.id, 2025, 'FY2025', 'filed',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 88,
       datetime('now','-18 days'), p.id, datetime('now','-25 days'),
       'cdp', 'CDP Climate Change — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-18 days'),
       'esg-reports/2026/cdp-2025.pdf',
       'CDP climate questionnaire submitted to the disclosure portal. CDP score: A-.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-tcfd', 'TCFD Disclosure — 2025',
       p.id, 2025, 'FY2025', 'filed',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 90,
       datetime('now','-15 days'), p.id, datetime('now','-22 days'),
       'tcfd', 'TCFD Disclosure — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-15 days'),
       'esg-reports/2026/tcfd-2025.pdf',
       'TCFD-aligned climate-related financial disclosure covering governance, strategy, risk management, and metrics.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-jse', 'JSE-SRL Sustainability Disclosure — 2025',
       p.id, 2025, 'FY2025', 'filed',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 92,
       datetime('now','-10 days'), p.id, datetime('now','-15 days'),
       'jse_srl', 'JSE-SRL Sustainability Disclosure — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-10 days'),
       'esg-reports/2026/jse-srl-2025.pdf',
       'Sustainability disclosure aligned to JSE Sustainability and Climate Disclosure Guidance (March 2024).'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO esg_reports
  (id, report_title, participant_id, reporting_year, reporting_period, status,
   total_ghg_emissions_tco2e, renewable_energy_percentage, water_usage_m3,
   waste_recycled_percentage, safety_incidents, training_hours, board_diversity_percentage,
   transparency_score, published_at, created_by, created_at, template_id, title,
   period_start, period_end, generated_at, r2_key, narrative)
SELECT 'esg-vid-issb', 'IFRS S2 Climate-Related Disclosures — 2025',
       p.id, 2025, 'FY2025', 'filed',
       428500, 87.2, 1142000, 78.5, 2, 12480, 44.0, 93,
       datetime('now','-3 days'), p.id, datetime('now','-7 days'),
       'issb', 'IFRS S2 Climate-Related Disclosures — Open Energy Platform 2025',
       '2025-01-01', '2025-12-31', datetime('now','-3 days'),
       'esg-reports/2026/issb-s2-2025.pdf',
       'ISSB IFRS S2 climate-related disclosures. Scope 1+2 emissions third-party assured to limited level.'
  FROM participants p WHERE email='admin@openenergy.co.za';

-- ─── 13. Cascade DLQ — 4 historical entries (3 resolved, 1 pending) ──────────
INSERT OR IGNORE INTO cascade_dlq
  (id, event, entity_type, entity_id, actor_id, payload, stage, error_message, error_stack,
   attempt_count, first_seen_at, last_attempt_at, next_attempt_at, status, resolved_at, resolved_by, resolution_note)
SELECT 'dlq-vid-01', 'trade.filled', 'trade_fills', 'fill-vid-01', p.id,
       '{"fill_id":"fill-vid-01","amount":48400}',
       'webhook', 'fetch_to_webhook timed out after 10s', NULL,
       3, datetime('now','-5 days','-1 hour'), datetime('now','-5 days','-30 minutes'),
       NULL, 'resolved', datetime('now','-5 days'), p.id,
       'Webhook URL responded after timeout; transient AWS lambda cold start. Replayed manually.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO cascade_dlq
  (id, event, entity_type, entity_id, actor_id, payload, stage, error_message, error_stack,
   attempt_count, first_seen_at, last_attempt_at, next_attempt_at, status, resolved_at, resolved_by, resolution_note)
SELECT 'dlq-vid-02', 'ona.fault_created', 'om_faults', 'fault_seed_001', p.id,
       '{"fault_id":"fault_seed_001","severity":"high"}',
       'notification', 'KV unavailable (1003)', NULL,
       2, datetime('now','-2 days','-3 hours'), datetime('now','-2 days','-2 hours'),
       NULL, 'resolved', datetime('now','-1 day','-22 hours'), p.id,
       'KV bucket recovered; replayed via /api/admin/monitoring/cascade-dlq/replay.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO cascade_dlq
  (id, event, entity_type, entity_id, actor_id, payload, stage, error_message, error_stack,
   attempt_count, first_seen_at, last_attempt_at, next_attempt_at, status, resolved_at, resolved_by, resolution_note)
SELECT 'dlq-vid-03', 'covenant.breach', 'covenant_tests', 'covt_seed_002', p.id,
       '{"covenant_code":"DSCR_12M","measured":1.18}',
       'briefing', 'AI binding rate-limited (429)', NULL,
       1, datetime('now','-6 hours'), datetime('now','-5 hours'),
       NULL, 'resolved', datetime('now','-3 hours'), p.id,
       'Workers AI quota refreshed; briefing materialised on next attempt.'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO cascade_dlq
  (id, event, entity_type, entity_id, actor_id, payload, stage, error_message, error_stack,
   attempt_count, first_seen_at, last_attempt_at, next_attempt_at, status, resolved_at, resolved_by, resolution_note)
SELECT 'dlq-vid-04', 'ipp.drawdown.requested', 'ipp_drawdown_requests', 'dr_pending_001', p.id,
       '{"drawdown_id":"dr_pending_001","amount":42000000}',
       'webhook', 'Lender consortium endpoint returned 503', NULL,
       1, datetime('now','-45 minutes'), datetime('now','-30 minutes'),
       datetime('now','+15 minutes'), 'pending', NULL, NULL, NULL
  FROM participants p WHERE email='admin@openenergy.co.za';

-- ─── 14. Audit chain — 6 seed events for the public audit page ───────────────
-- Sequence numbers must be strictly increasing per tenant; hash field is a
-- demo value (real chain rebuilt by audit_chain_state job). The /api/public/audit
-- endpoint reads the most recent rows.
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-01', p.id, 'default', 1001, 'trade_fills', 'fill-vid-01', 'insert',
       p.id, '{"matched_volume_mwh":40,"matched_price":1210}',
       '0000000000000000000000000000000000000000000000000000000000000000',
       'b3c1e7c4ad1d4e7e9a5e8c2b1d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4',
       datetime('now','-7 hours'), 'trading'
  FROM participants p WHERE email='trader@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-02', p.id, 'default', 1002, 'carbon_retirements', 'crit-vid-01', 'insert',
       p.id, '{"quantity":2400,"certificate":"OE-cf3a91bd"}',
       'b3c1e7c4ad1d4e7e9a5e8c2b1d2e4f6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4',
       'c4d2f8d5be2e5f8f0b6f9d3c2e3f5g7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5',
       datetime('now','-30 days'), 'carbon'
  FROM participants p WHERE email='carbon@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-03', p.id, 'default', 1003, 'regulator_determinations', 'rdet-vid-01', 'publish',
       p.id, '{"reference":"NERSA-DET-2026-0017","gazette":"GG 48891"}',
       'c4d2f8d5be2e5f8f0b6f9d3c2e3f5g7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5',
       'd5e3f9e6cf3f6f9g1c7g0e4d3f4g6h8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
       datetime('now','-25 days'), 'regulator'
  FROM participants p WHERE email='regulator@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-04', p.id, 'default', 1004, 'esg_reports', 'esg-vid-gri', 'publish',
       p.id, '{"template":"gri","year":2025}',
       'd5e3f9e6cf3f6f9g1c7g0e4d3f4g6h8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
       'e6f4g0f7dg4g7g0h2d8h1f5e4g5h7i9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7',
       datetime('now','-22 days'), 'esg'
  FROM participants p WHERE email='admin@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-05', p.id, 'default', 1005, 'grid_curtailment_events', 'gce-vid-04', 'issue',
       p.id, '{"curtailment":"CURT-2026-0004","mw":35}',
       'e6f4g0f7dg4g7g0h2d8h1f5e4g5h7i9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7',
       'f7g5h1g8eh5h8h1i3e9i2g6f5h6i8j0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7g8',
       datetime('now','-5 days'), 'grid'
  FROM participants p WHERE email='grid@openenergy.co.za';
INSERT OR IGNORE INTO audit_chain
  (id, participant_id, tenant_id, sequence_no, entity_table, entity_id, operation,
   actor_id, payload_json, prev_hash, this_hash, created_at, domain)
SELECT 'ac-vid-06', p.id, 'default', 1006, 'ipp_drawdown_requests', 'dr_pending_001', 'request',
       p.id, '{"amount":42000000,"facility":"FAC-2026-001"}',
       'f7g5h1g8eh5h8h1i3e9i2g6f5h6i8j0e1f2a3b4c5d6e7f8091a2b3c4d5e6f7g8',
       'g8h6i2h9fi6i9i2j4f0j3h7g6i7j9k1f2a3b4c5d6e7f8091a2b3c4d5e6f7g8h9',
       datetime('now','-1 hour'), 'ipp'
  FROM participants p WHERE email='ipp@openenergy.co.za';
