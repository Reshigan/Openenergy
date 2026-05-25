-- 085 — Live trading book + recent fills + 1 lender waterfall.
--
-- For the 17-minute product film: the Trading screen needs a deep
-- order book (so the screenshot doesn't read as a dead market), the
-- trader hero needs non-zero 24h activity, and the Lender Suite
-- "Waterfalls" tab needs at least one structure so it doesn't render
-- the empty state. All inserts are INSERT OR IGNORE so this migration
-- is idempotent and safe to re-apply.
--
-- Time references use datetime('now', '-Nh') so the data stays "today"
-- regardless of when the migration is applied.

-- ─── Live order book ──────────────────────────────────────────────────────
-- 12 bids descending from R 1,420 → R 1,365, 12 asks ascending from
-- R 1,425 → R 1,488. Spread of ~R 5 per level. All energy=baseload,
-- delivery=tomorrow (computed at runtime so the book is always forward).
INSERT OR IGNORE INTO trade_orders
  (id, participant_id, side, energy_type, volume_mwh, price, status,
   delivery_date, delivery_point, market_type, created_at, posted_at,
   remaining_volume_mwh, order_type, time_in_force, shard_key,
   post_only, reduce_only, amend_count)
VALUES
  -- Bids
  ('vord_bid_01', 'demo_trader_001', 'buy', 'baseload', 50, 1420, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-6 hours'),  datetime('now', '-6 hours'),  50, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_02', 'demo_offtaker_001','buy','baseload', 75, 1415, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-5 hours'),  datetime('now', '-5 hours'),  75, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_03', 'demo_carbon_001', 'buy', 'baseload',100, 1410, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-4 hours'),  datetime('now', '-4 hours'), 100, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_04', 'demo_trader_001', 'buy', 'baseload',125, 1405, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-3 hours'),  datetime('now', '-3 hours'), 125, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_05', 'demo_offtaker_001','buy','baseload',150, 1400, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-2 hours'),  datetime('now', '-2 hours'), 150, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_06', 'demo_ipp_001',    'buy', 'baseload', 80, 1395, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-100 minutes'), datetime('now', '-100 minutes'),  80, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_07', 'demo_carbon_001', 'buy', 'baseload', 60, 1390, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-90 minutes'),  datetime('now', '-90 minutes'),   60, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_08', 'demo_trader_001', 'buy', 'baseload', 90, 1385, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-75 minutes'),  datetime('now', '-75 minutes'),   90, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_09', 'demo_offtaker_001','buy','baseload', 40, 1380, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-60 minutes'),  datetime('now', '-60 minutes'),   40, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_10', 'demo_ipp_002',    'buy', 'baseload', 30, 1375, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-45 minutes'),  datetime('now', '-45 minutes'),   30, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_11', 'demo_carbon_001', 'buy', 'baseload', 25, 1370, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-30 minutes'),  datetime('now', '-30 minutes'),   25, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_bid_12', 'demo_trader_001', 'buy', 'baseload', 20, 1365, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-12 minutes'),  datetime('now', '-12 minutes'),   20, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  -- Asks
  ('vord_ask_01', 'demo_ipp_001',    'sell','baseload', 60, 1425, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-6 hours'),  datetime('now', '-6 hours'),  60, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_02', 'demo_ipp_002',    'sell','baseload', 80, 1432, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-5 hours'),  datetime('now', '-5 hours'),  80, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_03', 'demo_ipp_001',    'sell','baseload',100, 1440, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-4 hours'),  datetime('now', '-4 hours'), 100, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_04', 'demo_ipp_002',    'sell','baseload',130, 1448, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-3 hours'),  datetime('now', '-3 hours'), 130, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_05', 'demo_ipp_001',    'sell','baseload',160, 1455, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-2 hours'),  datetime('now', '-2 hours'), 160, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_06', 'demo_ipp_002',    'sell','baseload', 85, 1462, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-100 minutes'), datetime('now', '-100 minutes'),   85, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_07', 'demo_ipp_001',    'sell','baseload', 65, 1468, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-90 minutes'),  datetime('now', '-90 minutes'),    65, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_08', 'demo_ipp_002',    'sell','baseload', 95, 1473, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-75 minutes'),  datetime('now', '-75 minutes'),    95, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_09', 'demo_ipp_001',    'sell','baseload', 45, 1478, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-60 minutes'),  datetime('now', '-60 minutes'),    45, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_10', 'demo_ipp_002',    'sell','baseload', 35, 1482, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-45 minutes'),  datetime('now', '-45 minutes'),    35, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_11', 'demo_ipp_001',    'sell','baseload', 28, 1485, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-30 minutes'),  datetime('now', '-30 minutes'),    28, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0),
  ('vord_ask_12', 'demo_ipp_002',    'sell','baseload', 22, 1488, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot',  datetime('now', '-10 minutes'),  datetime('now', '-10 minutes'),    22, 'limit', 'GTC', 'baseload:'||date('now','+1 day'), 0, 0, 0);

-- A handful of "green" energy_type bids so the Energy/Green tab toggle has rows on both sides.
INSERT OR IGNORE INTO trade_orders
  (id, participant_id, side, energy_type, volume_mwh, price, status,
   delivery_date, delivery_point, market_type, created_at, posted_at,
   remaining_volume_mwh, order_type, time_in_force, shard_key,
   post_only, reduce_only, amend_count)
VALUES
  ('vord_grn_bid_01', 'demo_offtaker_001','buy', 'renewable', 40, 1640, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot', datetime('now', '-2 hours'), datetime('now', '-2 hours'), 40, 'limit', 'GTC', 'renewable:'||date('now','+1 day'), 0, 0, 0),
  ('vord_grn_bid_02', 'demo_carbon_001', 'buy', 'renewable', 55, 1632, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot', datetime('now', '-90 minutes'), datetime('now', '-90 minutes'), 55, 'limit', 'GTC', 'renewable:'||date('now','+1 day'), 0, 0, 0),
  ('vord_grn_ask_01', 'demo_ipp_001',    'sell','renewable', 70, 1650, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot', datetime('now', '-2 hours'), datetime('now', '-2 hours'), 70, 'limit', 'GTC', 'renewable:'||date('now','+1 day'), 0, 0, 0),
  ('vord_grn_ask_02', 'demo_ipp_002',    'sell','renewable', 50, 1658, 'open', date('now', '+1 day'), 'JHB-METRO', 'spot', datetime('now', '-60 minutes'), datetime('now', '-60 minutes'), 50, 'limit', 'GTC', 'renewable:'||date('now','+1 day'), 0, 0, 0);

-- ─── Recent fills (last 24h) so trader hero is alive ──────────────────────
-- These reference order IDs that don't have to exist as live rows.
INSERT OR IGNORE INTO trade_fills
  (id, order_id, participant_id, side, energy_type, matched_volume_mwh,
   matched_price, gross_zar, fee_zar, net_zar, executed_at,
   buyer_id, buyer_name, seller_id, seller_name, shard_key)
VALUES
  ('vfill_01', 'vord_h_01', 'demo_trader_001',  'buy', 'baseload', 30, 1422,  42660,  213,  42447, datetime('now', '-22 hours'), 'demo_trader_001', 'Sipho Mkhize',  'demo_ipp_001', 'Johan van der Berg', 'baseload:'||date('now')),
  ('vfill_02', 'vord_h_02', 'demo_offtaker_001','buy', 'baseload', 50, 1418,  70900,  354,  70546, datetime('now', '-18 hours'), 'demo_offtaker_001', 'Thabo Molefe','demo_ipp_002', 'Lerato Moloto',       'baseload:'||date('now')),
  ('vfill_03', 'vord_h_03', 'demo_trader_001',  'buy', 'baseload', 75, 1415, 106125, 530, 105595, datetime('now', '-12 hours'), 'demo_trader_001', 'Sipho Mkhize',  'demo_ipp_001', 'Johan van der Berg', 'baseload:'||date('now')),
  ('vfill_04', 'vord_h_04', 'demo_carbon_001',  'buy', 'renewable',45,1648,  74160, 370,  73790, datetime('now', '-9 hours'),  'demo_carbon_001', 'Anita Naidoo', 'demo_ipp_002', 'Lerato Moloto',       'renewable:'||date('now')),
  ('vfill_05', 'vord_h_05', 'demo_trader_001',  'buy', 'baseload', 25, 1420,  35500, 177,  35322, datetime('now', '-4 hours'),  'demo_trader_001', 'Sipho Mkhize',  'demo_ipp_001', 'Johan van der Berg', 'baseload:'||date('now')),
  ('vfill_06', 'vord_h_06', 'demo_offtaker_001','buy', 'baseload', 60, 1416,  84960, 424,  84535, datetime('now', '-2 hours'),  'demo_offtaker_001', 'Thabo Molefe','demo_ipp_002', 'Lerato Moloto',       'baseload:'||date('now')),
  ('vfill_07', 'vord_h_07', 'demo_carbon_001',  'buy', 'renewable',20,1644,  32880, 164,  32715, datetime('now', '-1 hour'),   'demo_carbon_001', 'Anita Naidoo', 'demo_ipp_001', 'Johan van der Berg', 'renewable:'||date('now')),
  ('vfill_08', 'vord_h_08', 'demo_trader_001',  'buy', 'baseload', 15, 1419,  21285, 106,  21178, datetime('now', '-30 minutes'),'demo_trader_001', 'Sipho Mkhize', 'demo_ipp_002', 'Lerato Moloto',      'baseload:'||date('now'));

-- ─── Lender waterfall (Klerksdorp project) ────────────────────────────────
INSERT OR IGNORE INTO waterfall_structures
  (id, project_id, waterfall_name, effective_from, created_by, created_at)
VALUES
  ('vwf_001', 'ip_001', 'Klerksdorp Senior Debt Waterfall', date('now', '-180 days'), 'demo_lender_001', datetime('now', '-180 days'));

-- tranche_type must satisfy the CHECK constraint:
--   opex | tax | senior_interest | senior_principal | dsra | mra |
--   mezzanine | subordinated | equity_distribution | other
INSERT OR IGNORE INTO waterfall_tranches
  (id, waterfall_id, priority, tranche_name, tranche_type, notes)
VALUES
  ('vwft_01', 'vwf_001', 1, 'Operating expenses',         'opex',                'Pari passu opex, insurance, levies'),
  ('vwft_02', 'vwf_001', 2, 'Tax provision',              'tax',                 'Provisional tax + VAT'),
  ('vwft_03', 'vwf_001', 3, 'Senior interest',            'senior_interest',     'Senior tranche coupon'),
  ('vwft_04', 'vwf_001', 4, 'Senior principal',           'senior_principal',    'Amortisation per schedule'),
  ('vwft_05', 'vwf_001', 5, 'Debt Service Reserve top-up','dsra',                '6-month DSRA minimum'),
  ('vwft_06', 'vwf_001', 6, 'Maintenance Reserve top-up', 'mra',                 'MRA quarterly'),
  ('vwft_07', 'vwf_001', 7, 'Mezzanine coupon',           'mezzanine',           'Pari passu mezz'),
  ('vwft_08', 'vwf_001', 8, 'Equity distribution',        'equity_distribution', 'Residual to sponsors');
