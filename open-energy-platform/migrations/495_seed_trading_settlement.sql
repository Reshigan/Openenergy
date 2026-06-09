-- ═══════════════════════════════════════════════════════════════════════
-- 495_seed_trading_settlement.sql
-- Demo seed: trading orders, trades, settlement cycles, RFQs, ancillary contracts
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════
-- 495_seed_trading_settlement.sql
-- Demo seed: trading orders, matched trades, settlement cycles/instructions,
-- RFQs + quotes, best-execution records, trading-party links,
-- ancillary contracts, dispatch nominations.
--
-- All INSERT OR IGNORE — fully idempotent.
-- ZAR prices: R950–R1 850/MWh (renewable) per SA market norms.
-- MW capacities realistic for SA IPPs (10–150 MW).
-- Participant IDs match 003_seed.sql demo accounts.
-- tenant_id = 'default' throughout.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. trade_orders — 8 orders for demo_trader_001 ─────────────────────
-- Covers: buy/sell, solar/wind/gas/baseload, open/partial/cancelled/closed

INSERT OR IGNORE INTO trade_orders
  (id, participant_id, side, energy_type, volume_mwh, price,
   price_min, price_max, delivery_date, delivery_point,
   market_type, status, remaining_volume_mwh,
   order_type, time_in_force, shard_key,
   post_only, reduce_only, amend_count,
   created_at, posted_at)
VALUES
  -- #1 open buy for solar
  ('s495_ord_001', 'demo_trader_001', 'buy', 'solar', 50, 1150,
   1050, 1200, date('now', '+2 days'), 'Klerksdorp-132kV',
   'bilateral', 'open', 50,
   'limit', 'gtc', 'solar|' || date('now', '+2 days'),
   0, 0, 0,
   datetime('now', '-4 hours'), datetime('now', '-4 hours')),

  -- #2 open sell for wind (trader acting as intermediary)
  ('s495_ord_002', 'demo_trader_001', 'sell', 'wind', 75, 1380,
   1300, 1420, date('now', '+3 days'), 'Mookgopong-132kV',
   'bilateral', 'open', 75,
   'limit', 'gtc', 'wind|' || date('now', '+3 days'),
   0, 0, 0,
   datetime('now', '-3 hours'), datetime('now', '-3 hours')),

  -- #3 partially filled buy for solar (exchange)
  ('s495_ord_003', 'demo_trader_001', 'buy', 'solar', 100, 1120,
   1080, 1160, date('now', '+1 day'), 'JHB-METRO',
   'exchange', 'partial', 40,
   'limit', 'gtc', 'solar|' || date('now', '+1 day'),
   0, 0, 1,
   datetime('now', '-8 hours'), datetime('now', '-8 hours')),

  -- #4 filled sell for baseload (exchange)
  ('s495_ord_004', 'demo_trader_001', 'sell', 'baseload', 120, 1420,
   1380, 1460, date('now', '+1 day'), 'JHB-METRO',
   'exchange', 'closed', 0,
   'limit', 'gtc', 'baseload|' || date('now', '+1 day'),
   0, 0, 0,
   datetime('now', '-12 hours'), datetime('now', '-12 hours')),

  -- #5 cancelled buy for gas (bilateral)
  ('s495_ord_005', 'demo_trader_001', 'buy', 'gas', 30, 980,
   940, 1020, date('now', '+5 days'), 'Durban-Grid',
   'bilateral', 'cancelled', 30,
   'limit', 'gtc', 'gas|' || date('now', '+5 days'),
   0, 0, 0,
   datetime('now', '-24 hours'), datetime('now', '-24 hours')),

  -- #6 open buy for wind (bilateral, larger block)
  ('s495_ord_006', 'demo_trader_001', 'buy', 'wind', 150, 1350,
   1280, 1400, date('now', '+4 days'), 'Mookgopong-132kV',
   'bilateral', 'open', 150,
   'limit', 'gtc', 'wind|' || date('now', '+4 days'),
   0, 0, 0,
   datetime('now', '-2 hours'), datetime('now', '-2 hours')),

  -- #7 open sell for solar (spot, smaller clip)
  ('s495_ord_007', 'demo_trader_001', 'sell', 'solar', 25, 1180,
   1140, 1220, date('now'), 'Cape-Metro',
   'spot', 'open', 25,
   'limit', 'gtc', 'solar|' || date('now'),
   0, 0, 0,
   datetime('now', '-1 hour'), datetime('now', '-1 hour')),

  -- #8 expired buy for baseload
  ('s495_ord_008', 'demo_trader_001', 'buy', 'baseload', 60, 1390,
   1350, 1430, date('now', '-1 day'), 'JHB-METRO',
   'exchange', 'expired', 60,
   'limit', 'gtc', 'baseload|' || date('now', '-1 day'),
   0, 0, 0,
   datetime('now', '-2 days'), datetime('now', '-2 days'));

-- ── Counterparty sell orders needed for match linkage ───────────────────
INSERT OR IGNORE INTO trade_orders
  (id, participant_id, side, energy_type, volume_mwh, price,
   delivery_date, delivery_point, market_type, status, remaining_volume_mwh,
   order_type, time_in_force, shard_key, post_only, reduce_only, amend_count,
   created_at, posted_at)
VALUES
  -- IPP sell for solar partial fill counterpart
  ('s495_ord_ipp_a', 'demo_ipp_001', 'sell', 'solar', 100, 1110,
   date('now', '+1 day'), 'JHB-METRO',
   'exchange', 'partial', 40,
   'limit', 'gtc', 'solar|' || date('now', '+1 day'), 0, 0, 0,
   datetime('now', '-9 hours'), datetime('now', '-9 hours')),
  -- IPP sell for baseload fill counterpart
  ('s495_ord_ipp_b', 'demo_ipp_001', 'sell', 'baseload', 120, 1415,
   date('now', '+1 day'), 'JHB-METRO',
   'exchange', 'closed', 0,
   'limit', 'gtc', 'baseload|' || date('now', '+1 day'), 0, 0, 0,
   datetime('now', '-13 hours'), datetime('now', '-13 hours')),
  -- IPP_002 sell for bilateral wind
  ('s495_ord_ipp_c', 'demo_ipp_002', 'sell', 'wind', 80, 1360,
   date('now', '+3 days'), 'Mookgopong-132kV',
   'bilateral', 'matched', 0,
   'limit', 'gtc', 'wind|' || date('now', '+3 days'), 0, 0, 0,
   datetime('now', '-3 hours'), datetime('now', '-3 hours'));

-- ── 2. trade_matches — 4 matched trades ────────────────────────────────
-- bilateral and exchange; IPP → Offtaker; reference existing orders

INSERT OR IGNORE INTO trade_matches
  (id, buy_order_id, sell_order_id, matched_volume_mwh, matched_price,
   matched_at, status)
VALUES
  -- Match 1: trader buys solar (partial fill, exchange)
  ('s495_match_001', 's495_ord_003', 's495_ord_ipp_a', 60, 1115,
   datetime('now', '-7 hours'), 'settled'),

  -- Match 2: trader sells baseload (exchange, fully filled)
  ('s495_match_002', 's495_ord_ipp_b', 's495_ord_004', 120, 1418,
   datetime('now', '-11 hours'), 'settled'),

  -- Match 3: bilateral wind — trader intermediates IPP_002 → offtaker
  ('s495_match_003', 's495_ord_006', 's495_ord_ipp_c', 75, 1365,
   datetime('now', '-2 hours'), 'settling'),

  -- Match 4: bilateral PPA solar — IPP_001 directly to offtaker
  ('s495_match_004', 'ord_001', 'ord_002', 50, 280,
   datetime('now', '-5 days'), 'settled');

-- ── 3. oe_settlement_cycles — 2 cycles ─────────────────────────────────

INSERT OR IGNORE INTO oe_settlement_cycles
  (id, trade_date, value_date, status,
   total_trades, total_volume_mwh, total_value_zar,
   net_legs_count, netting_efficiency, created_at)
VALUES
  -- Completed cycle (T-2 / T)
  ('s495_cycle_001',
   date('now', '-2 days'), date('now'),
   'settled',
   12, 840, 112350000,
   5, 0.583,
   datetime('now', '-2 days')),

  -- Pending cycle (yesterday / tomorrow)
  ('s495_cycle_002',
   date('now', '-1 day'), date('now', '+1 day'),
   'netting',
   8, 510, 68420000,
   4, 0.500,
   datetime('now', '-1 day'));

-- ── 4. oe_settlement_instructions — 4 instructions ─────────────────────

INSERT OR IGNORE INTO oe_settlement_instructions
  (id, net_leg_id, participant_id, direction,
   amount_zar, bank, bank_account_ref, reference,
   status, submitted_at, confirmed_at, created_at)
VALUES
  -- Cycle 1: debit trader (pays for solar purchase)
  ('s495_inst_001', NULL, 'demo_trader_001', 'debit',
   66900, 'absa', 'ABSA-4521-0087-ZAR', 'OE-SET-001-DEB-TR',
   'confirmed',
   datetime('now', '-1 day', '+2 hours'),
   datetime('now', '-1 day', '+4 hours'),
   datetime('now', '-2 days')),

  -- Cycle 1: credit IPP_001 (receives for solar sale)
  ('s495_inst_002', NULL, 'demo_ipp_001', 'credit',
   66900, 'fnb', 'FNB-7834-0021-ZAR', 'OE-SET-001-CRD-IPP',
   'confirmed',
   datetime('now', '-1 day', '+2 hours'),
   datetime('now', '-1 day', '+5 hours'),
   datetime('now', '-2 days')),

  -- Cycle 2: debit offtaker (pays for wind bilateral)
  ('s495_inst_003', NULL, 'demo_offtaker_001', 'debit',
   102375, 'nedbank', 'NED-9901-4432-ZAR', 'OE-SET-002-DEB-OT',
   'submitted',
   datetime('now', '-3 hours'),
   NULL,
   datetime('now', '-1 day')),

  -- Cycle 2: credit IPP_002 (receives for wind sale)
  ('s495_inst_004', NULL, 'demo_ipp_002', 'credit',
   102375, 'standard_bank', 'STD-2210-8800-ZAR', 'OE-SET-002-CRD-IPP2',
   'queued',
   NULL,
   NULL,
   datetime('now', '-1 day'));

-- ── 5. oe_rfqs — 2 RFQ requests ────────────────────────────────────────

INSERT OR IGNORE INTO oe_rfqs
  (id, rfq_number, buyer_id, product_type, description,
   volume_mwh, delivery_start, delivery_end,
   target_price_zar, max_price_zar,
   status, invitation_mode,
   quote_deadline, evaluation_deadline, award_deadline,
   scoring_method, created_at)
VALUES
  -- Open RFQ: offtaker seeking solar PPA
  ('s495_rfq_001', 'RFQ-2026-0041',
   'demo_offtaker_001', 'power_ppa',
   'City Energy Municipality seeking 40 MW solar PPA for 10-year term',
   87600, date('now', '+30 days'), date('now', '+3680 days'),
   1100, 1250,
   'published', 'open',
   datetime('now', '+7 days'),
   datetime('now', '+14 days'),
   datetime('now', '+21 days'),
   'weighted',
   datetime('now', '-2 days')),

  -- Closed RFQ: trader RFQ for wind capacity (awarded)
  ('s495_rfq_002', 'RFQ-2026-0038',
   'demo_trader_001', 'power_ppa',
   'Block wind purchase 50 MWh/day bilateral — short term 90 days',
   4500, date('now', '-10 days'), date('now', '+80 days'),
   1320, 1450,
   'awarded', 'closed',
   datetime('now', '-12 days'),
   datetime('now', '-10 days'),
   datetime('now', '-8 days'),
   'price_only',
   datetime('now', '-15 days'));

-- ── 6. oe_rfq_quotes — 3 quotes on the open RFQ ─────────────────────────

INSERT OR IGNORE INTO oe_rfq_quotes
  (id, rfq_id, seller_id, price_zar, volume_offered_mwh,
   delivery_start, delivery_end,
   bbbee_level, carbon_intensity_g_co2_kwh,
   terms_text, status, score, submitted_at)
VALUES
  -- Quote 1: IPP_001 (solar, competitive)
  ('s495_quote_001', 's495_rfq_001', 'demo_ipp_001',
   1095, 87600,
   date('now', '+30 days'), date('now', '+3680 days'),
   3, 42,
   'Fixed escalation 2.5%/annum. Monthly invoicing. NERSA-licensed.',
   'submitted', 88.5,
   datetime('now', '-1 day')),

  -- Quote 2: IPP_002 (wind, slightly higher, better B-BBEE)
  ('s495_quote_002', 's495_rfq_001', 'demo_ipp_002',
   1130, 80000,
   date('now', '+30 days'), date('now', '+3650 days'),
   4, 10,
   'Fixed escalation 2.0%/annum. Quarterly invoicing. 80 MW capacity available.',
   'submitted', 82.1,
   datetime('now', '-18 hours')),

  -- Quote 3: Admin placeholder seller (lowest price, shortlisted)
  ('s495_quote_003', 's495_rfq_001', 'demo_admin_001',
   1065, 87600,
   date('now', '+35 days'), date('now', '+3680 days'),
   1, 50,
   'Platform energy aggregation pool. Blended solar+wind. CPI-linked.',
   'shortlisted', 91.3,
   datetime('now', '-6 hours'));

-- ── 7. oe_best_execution — 2 records for demo_trader_001 ───────────────

INSERT OR IGNORE INTO oe_best_execution
  (id, rfq_number,
   desk_party_id, desk_party_name,
   client_party_id, client_party_name,
   client_tier, instrument, energy_type, side,
   quantity_mwh, delivery_day,
   quotes_count,
   best_quote_price_zar, best_quote_counterparty,
   executed_price_zar, executed_counterparty,
   total_consideration_zar, notional_zar,
   price_improvement_bps, slippage_bps,
   best_ex_basis,
   chain_status,
   rfq_received_at, quotes_solicited_at, quotes_received_at,
   best_ex_evaluated_at, execution_approved_at, executed_at,
   tca_reviewed_at, closed_at,
   sla_deadline_at,
   escalation_level,
   created_by, created_at, updated_at)
VALUES
  -- Best-ex 1: closed/complete solar purchase
  ('s495_bex_001', 'BEX-RFQ-2026-0031',
   'demo_trader_001', 'Mkhize Energy Traders',
   'demo_offtaker_001', 'City Energy Municipality',
   'professional', 'SA Solar Spot', 'solar', 'buy',
   60, date('now', '-3 days'),
   4,
   1108, 'demo_ipp_001',
   1115, 'demo_ipp_001',
   66900, 66900,
   NULL, 6.3,
   'Price + delivery score. IPP_001 offered tightest spread with T+1 delivery.',
   'closed',
   datetime('now', '-4 days'),
   datetime('now', '-4 days', '+15 minutes'),
   datetime('now', '-4 days', '+45 minutes'),
   datetime('now', '-4 days', '+1 hour'),
   datetime('now', '-4 days', '+1 hour', '+10 minutes'),
   datetime('now', '-4 days', '+1 hour', '+25 minutes'),
   datetime('now', '-3 days', '+2 hours'),
   datetime('now', '-3 days', '+3 hours'),
   datetime('now', '-3 days', '+6 hours'),
   0,
   'demo_trader_001', datetime('now', '-4 days'), datetime('now', '-3 days')),

  -- Best-ex 2: in-progress wind purchase (TCA pending)
  ('s495_bex_002', 'BEX-RFQ-2026-0039',
   'demo_trader_001', 'Mkhize Energy Traders',
   'demo_offtaker_001', 'City Energy Municipality',
   'professional', 'SA Wind Forward', 'wind', 'buy',
   75, date('now', '+3 days'),
   3,
   1355, 'demo_ipp_002',
   1365, 'demo_ipp_002',
   102375, 102375,
   NULL, 7.4,
   'Price + speed. IPP_002 confirmed 2h faster than competitors.',
   'executed',
   datetime('now', '-3 hours'),
   datetime('now', '-2 hours', '-45 minutes'),
   datetime('now', '-2 hours'),
   datetime('now', '-1 hour', '-45 minutes'),
   datetime('now', '-1 hour', '-30 minutes'),
   datetime('now', '-1 hour'),
   NULL, NULL,
   datetime('now', '+23 hours'),
   0,
   'demo_trader_001', datetime('now', '-3 hours'), datetime('now', '-1 hour'));

-- ── 8. oe_trading_party_link — trader linked to IPP and offtaker ─────────

INSERT OR IGNORE INTO oe_trading_party_link
  (id, participant_id, party_id, link_type, created_at)
VALUES
  ('s495_tpl_001', 'demo_trader_001', 'demo_ipp_001',     'trading_party', datetime('now', '-30 days')),
  ('s495_tpl_002', 'demo_trader_001', 'demo_offtaker_001','trading_party', datetime('now', '-30 days'));

-- ── 9. oe_ancillary_contracts — 2 contracts for demo_grid_001 ────────────
-- FCR (Frequency Containment Reserve) and FRR (Frequency Restoration Reserve)

INSERT OR IGNORE INTO oe_ancillary_contracts
  (id, participant_id, service_type,
   capacity_mw,
   availability_zar_per_mw_per_h,
   utilisation_zar_per_mwh,
   start_at, end_at, status, performance_score,
   created_at)
VALUES
  -- FCR contract: 10 MW from IPP_001 wind/solar hybrid
  ('s495_anc_001', 'demo_grid_001', 'fcr',
   10,
   185,
   950,
   datetime('now', '-60 days'), datetime('now', '+305 days'),
   'active', 0.972,
   datetime('now', '-60 days')),

  -- FRR automatic (frr_a): 25 MW from IPP_002 wind
  ('s495_anc_002', 'demo_grid_001', 'frr_a',
   25,
   210,
   1050,
   datetime('now', '-30 days'), datetime('now', '+335 days'),
   'active', 0.958,
   datetime('now', '-30 days'));

-- ── 10. oe_dispatch_nominations — 3 nominations for demo_grid_001 ────────
-- accepted (day-ahead), active (intra-day), settled (previous day)

INSERT OR IGNORE INTO oe_dispatch_nominations
  (id, participant_id, trading_day, schedule_type,
   scheduled_mwh, actual_mwh, imbalance_mwh, charge_zar,
   nomination_status,
   nominated_at, accepted_at, activated_at,
   performance_recorded_at, settled_at,
   next_sla_due_at,
   submitted_by, accepted_by, settled_by,
   created_at)
VALUES
  -- Nomination 1: tomorrow day-ahead, accepted
  ('s495_nom_001', 'demo_grid_001', date('now', '+1 day'), 'day_ahead',
   850, NULL, NULL, NULL,
   'accepted',
   datetime('now', '-2 hours'),
   datetime('now', '-1 hour', '-45 minutes'),
   NULL,
   NULL, NULL,
   datetime('now', '+30 minutes'),
   'demo_grid_001', 'demo_admin_001', NULL,
   datetime('now', '-2 hours')),

  -- Nomination 2: today intra-day, activated
  ('s495_nom_002', 'demo_grid_001', date('now'), 'intra_day',
   420, 390, -30, NULL,
   'activated',
   datetime('now', '-6 hours'),
   datetime('now', '-5 hours', '-50 minutes'),
   datetime('now', '-5 hours', '-20 minutes'),
   NULL, NULL,
   datetime('now', '+55 minutes'),
   'demo_grid_001', 'demo_admin_001', NULL,
   datetime('now', '-6 hours')),

  -- Nomination 3: yesterday day-ahead, settled
  ('s495_nom_003', 'demo_grid_001', date('now', '-1 day'), 'day_ahead',
   780, 762, -18, 17100,
   'settled',
   datetime('now', '-1 day', '-2 hours'),
   datetime('now', '-1 day', '-1 hour', '-45 minutes'),
   datetime('now', '-1 day', '-1 hour', '-15 minutes'),
   datetime('now', '-22 hours'),
   datetime('now', '-4 hours'),
   datetime('now', '+11 days'),
   'demo_grid_001', 'demo_admin_001', 'demo_admin_001',
   datetime('now', '-1 day', '-2 hours'));
