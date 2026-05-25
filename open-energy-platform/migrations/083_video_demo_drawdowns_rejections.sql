-- Video demo seed (Phase 3): backfill the two tables that are currently
-- empty but are visited by named shots in the recording script.
--
--   ipp_drawdown_requests   → Beat 4.x  "ipp-drawdown-request" + lender-drawdown-queue
--   trade_order_rejections  → Beat 3.3  "trader-ai-suggestion-accept" (the rejection-explainer
--                                        is the AI inline-card moment the V/O leans on)
--
-- All inserts are idempotent (INSERT OR IGNORE) so re-applying is safe.

-- ───────────────────────── IPP drawdown requests (8 rows) ─────────────────────────
INSERT OR IGNORE INTO ipp_drawdown_requests
  (id, participant_id, tenant_id, project_id, loan_id, drawdown_no, requested_amount_zar,
   purpose, status, requested_at, approved_amount_zar, approved_at, approved_by,
   disbursed_amount_zar, disbursed_at, notes)
VALUES
  ('dd_001', 'demo_ipp_001', 'default', 'ip_001', 'loan_ip_001_a', 3, 12500000,
   'EPC milestone 3 — inverter & DC cabling delivery',
   'requested', datetime('now', '-2 days'),
   NULL, NULL, NULL, NULL, NULL,
   'IE certificate in review'),
  ('dd_002', 'demo_ipp_001', 'default', 'ip_002', 'loan_ip_002_a', 2, 8700000,
   'EPC milestone 2 — wind turbine tower foundations',
   'reviewing', datetime('now', '-5 days'),
   NULL, NULL, NULL, NULL, NULL,
   'Awaiting IE structural sign-off'),
  ('dd_003', 'demo_ipp_002', 'default', 'ip_003', 'loan_ip_003_a', 4, 4250000,
   'EPC milestone 4 — DC bonding & combiner cabinets',
   'approved', datetime('now', '-7 days'),
   4250000, datetime('now', '-3 days'), 'demo_lender_001', NULL, NULL,
   'CPs satisfied — disbursement pending bank instruction'),
  ('dd_004', 'demo_ipp_002', 'default', 'ip_004', 'loan_ip_004_a', 1, 35000000,
   'Initial drawdown — equipment deposit',
   'disbursed', datetime('now', '-30 days'),
   35000000, datetime('now', '-28 days'), 'demo_lender_001',
   35000000, datetime('now', '-26 days'),
   'First-tranche disbursed; reconciled against escrow'),
  ('dd_005', 'demo_ipp_002', 'default', 'ip_004', 'loan_ip_004_a', 2, 22500000,
   'EPC milestone 2 — tracker piles + module delivery',
   'disbursed', datetime('now', '-14 days'),
   22500000, datetime('now', '-12 days'), 'demo_lender_001',
   22500000, datetime('now', '-10 days'),
   'Disbursed in full'),
  ('dd_006', 'demo_ipp_001', 'default', 'ip_005', 'loan_ip_005_a', 5, 18900000,
   'EPC milestone 5 — turbine erection campaign',
   'requested', datetime('now', '-1 day'),
   NULL, NULL, NULL, NULL, NULL,
   'Submitted with IE photo evidence'),
  ('dd_007', 'demo_ipp_001', 'default', 'ip_006', 'loan_ip_006_a', 2, 60000000,
   'EPC milestone 2 — heliostat field structural steel',
   'partial', datetime('now', '-21 days'),
   60000000, datetime('now', '-18 days'), 'demo_lender_001',
   45000000, datetime('now', '-16 days'),
   'Partial disbursement: R15M held back pending revised IE certificate'),
  ('dd_008', 'demo_ipp_001', 'default', 'ip_007', 'loan_ip_007_a', 1, 9500000,
   'Initial drawdown — port wind cluster site prep',
   'rejected', datetime('now', '-9 days'),
   NULL, NULL, NULL, NULL, NULL,
   'Rejected: insufficient supporting invoices');

-- ───────────────────────── Trader rejections (12 rows) ─────────────────────────
-- Cover the rule codes the rejection-explainer page actually renders so the
-- "Why was this rejected?" panel has rich material when the V/O lands on it.
INSERT OR IGNORE INTO trade_order_rejections
  (id, participant_id, attempted_at, reason_code, detail,
   side, energy_type, volume_mwh, price_zar_mwh, notional_zar, snapshot_json)
VALUES
  ('rej_001', 'demo_trader_001', datetime('now', '-15 minutes'),
   'CREDIT_LIMIT_BREACH',
   'Order notional R28.5M would push exposure to R142M against R140M Tier-2 limit',
   'buy', 'solar', 100, 285, 28500000,
   '{"limit_zar":140000000,"exposure_zar":113500000,"headroom_zar":26500000}'),
  ('rej_002', 'demo_trader_001', datetime('now', '-45 minutes'),
   'MARK_STALE',
   'No fresh VWAP within 4 hours — last mark 4h 18min ago',
   'sell', 'wind', 50, 310, 15500000,
   '{"last_mark_age_min":258,"max_age_min":240}'),
  ('rej_003', 'demo_trader_001', datetime('now', '-1 hour'),
   'POSITION_LIMIT',
   'Net long position would exceed 250 MWh per-energy cap by 35 MWh',
   'buy', 'solar', 75, 280, 21000000,
   '{"net_position_mwh":215,"cap_mwh":250,"breach_mwh":35}'),
  ('rej_004', 'demo_trader_001', datetime('now', '-2 hours'),
   'KYC_NOT_VERIFIED',
   'Counterparty KYC expired 2026-05-19 — refresh required before trading',
   'sell', 'hybrid', 80, 295, 23600000,
   '{"kyc_status":"expired","expired_at":"2026-05-19"}'),
  ('rej_005', 'demo_trader_001', datetime('now', '-3 hours'),
   'SURVEILLANCE_HALT',
   'Trading halted by regulator alert SR-2026-042 (spoofing investigation)',
   'buy', 'solar', 40, 290, 11600000,
   '{"halt_id":"SR-2026-042","halt_reason":"spoofing_investigation"}'),
  ('rej_006', 'demo_trader_001', datetime('now', '-4 hours'),
   'COLLATERAL_INSUFFICIENT',
   'Required initial margin R4.2M; available collateral R3.6M',
   'buy', 'wind', 60, 305, 18300000,
   '{"required_im_zar":4200000,"available_collateral_zar":3600000}'),
  ('rej_007', 'demo_trader_001', datetime('now', '-5 hours'),
   'PRICE_OUTSIDE_LIMIT',
   'Order price R450/MWh outside 5% band against VWAP R300/MWh',
   'buy', 'solar', 25, 450, 11250000,
   '{"vwap_zar_mwh":300,"max_zar_mwh":315,"min_zar_mwh":285}'),
  ('rej_008', 'demo_trader_001', datetime('now', '-7 hours'),
   'MIN_TENOR',
   'Delivery 2026-05-25 (today) violates T+1 minimum tenor rule',
   'sell', 'solar', 100, 285, 28500000,
   '{"min_tenor_days":1,"tenor_days":0}'),
  ('rej_009', 'demo_trader_001', datetime('now', '-8 hours'),
   'CREDIT_LIMIT_BREACH',
   'Cumulative exposure to Eskom counterparty over R200M concentration cap',
   'buy', 'hybrid', 120, 295, 35400000,
   '{"counterparty":"Eskom","exposure_zar":182000000,"cap_zar":200000000}'),
  ('rej_010', 'demo_trader_001', datetime('now', '-10 hours'),
   'RISK_RULE',
   'Auto-reject rule "no-friday-late-tickets" triggered (configured 2026-04-12)',
   'sell', 'wind', 35, 305, 10675000,
   '{"rule":"no-friday-late-tickets","matched":true}'),
  ('rej_011', 'demo_trader_001', datetime('now', '-12 hours'),
   'CARBON_FACTOR_MISSING',
   'No carbon-intensity factor on file for this energy_type/delivery combo',
   'buy', 'thermal', 80, 320, 25600000,
   '{"energy_type":"thermal","delivery_day":"2026-05-28"}'),
  ('rej_012', 'demo_trader_001', datetime('now', '-14 hours'),
   'CREDIT_LIMIT_BREACH',
   'Order notional R85M would push exposure past R250M Tier-1 limit',
   'buy', 'solar', 300, 285, 85500000,
   '{"limit_zar":250000000,"exposure_zar":182000000,"headroom_zar":68000000}');

-- Migration 083 does not touch audit_events directly — the cascade engine
-- enforces hash-chain integrity at runtime, so we don't write seed audit
-- rows from SQL. The fact that the rows above exist is enough for the
-- demo screens.
