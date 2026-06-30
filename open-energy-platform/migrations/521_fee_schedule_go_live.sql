-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 521 — Go-live rate card for oe_fee_schedule.
--
-- P0 fix: migrations 481 + 507 seeded every Layer B row at is_enabled=0,
-- rate=0 → fee-engine.ts:136 only computes non-zero when is_enabled===1, so
-- the whole Layer B pipeline billed R0 'waived' rows at launch. This flips a
-- vetted, conservative set of rows to is_enabled=1 with sane SA-market rates.
-- An operator can still tune any row via /api/admin/revenue — no deploy.
--
-- Idempotent: trigger_event is UNIQUE, so ON CONFLICT(trigger_event) DO UPDATE
-- rebases rate/is_enabled on every apply. Safe to re-run, safe for CI replay.
--
-- Go-live rates (conservative, documented for audit):
--   trade.matched            — 5 bps of notional        (maker/taker split)
--   settlement.cycle_settled — R12 flat per leg         (per settlement cycle)
--   contract.signed          — R500 flat per PPA         (per contract signed)
--   invoice.issued           — R25 flat per invoice      (per invoice issued)
--   invoice.paid              — 2 bps of settled value   (on invoice paid)
--   carbon.retired            — R10 flat per retirement   (per credit retirement)
--   grid.wheeling_charge_paid — 1 bp of wheeling value   (on wheeling charge paid)
--
-- Left disabled (high-risk — the marketplace-fees agent owns these separately):
--   deal.accepted / deal.cleared / deal.subscribed / objective.subscribed (507),
--   vcm_order_matched, clearing.loss_event_executed, lender.waterfall_executed,
--   cdr.offtake_signed, ipp.drawdown_disbursed, disbursement.approved,
--   carbon.credits_issued, carbon.vintage_issued, rec_issued, rec_retired,
--   wheeling_charge_issued, regulator.licence_granted, trader.margin_call_issued,
--   facility amendment, O&M contract, PPA payment-security bond.
--
-- Dedup note: enabling trade.matched (5 bps) makes the operator-configurable
-- Layer B path the source of truth for trade-match billing. The v1 hardcoded
-- path in src/utils/trade-fees.ts (brokerage/exchange/clearing/regulatory) must
-- skip when this row is live — see isLayerBTradeMatchedLive() + the
-- layerBTradeMatchedEnabled opt in computeTradeFees(). One source of truth.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO oe_fee_schedule
  (id, trigger_event, fee_type, rate, min_fee_zar, max_fee_zar, applicable_tiers,
   payer_role, payer_resolution, is_enabled, description, split_config)
VALUES
  ('fee_trade_matched',        'trade.matched',              'bps',      5,   0, NULL, '[]', 'trader',       'split',       1, 'Exchange trade matched — maker/taker split (go-live 5 bps)', '[{"party_role":"trader","share_pct":0.5},{"party_role":"trader","share_pct":0.5}]'),
  ('fee_settlement_settled',   'settlement.cycle_settled',    'flat_zar', 12,  0, NULL, '[]', 'offtaker',     'initiator',    1, 'Settlement cycle settled — R12 per leg (go-live)', NULL),
  ('fee_contract_signed',      'contract.signed',            'flat_zar', 500, 0, NULL, '[]', 'offtaker',     'beneficiary',  1, 'PPA / contract signed — R500 flat (go-live)', NULL),
  ('fee_invoice_issued',       'invoice.issued',             'flat_zar', 25,  0, NULL, '[]', 'offtaker',     'initiator',    1, 'Invoice issued — R25 flat (go-live)', NULL),
  ('fee_invoice_paid',         'invoice.paid',               'bps',      2,   0, NULL, '[]', 'offtaker',     'initiator',    1, 'Invoice paid — 2 bps of settled value (go-live)', NULL),
  ('fee_carbon_retired',       'carbon.retired',             'flat_zar', 10,  0, NULL, '[]', 'carbon_fund',  'initiator',    1, 'Carbon credits retired — R10 flat (go-live)', NULL),
  ('fee_wheeling_paid',        'grid.wheeling_charge_paid',  'bps',      1,   0, NULL, '[]', 'offtaker',     'initiator',    1, 'Wheeling charge paid — 1 bp (go-live)', NULL)
ON CONFLICT(trigger_event) DO UPDATE SET
  fee_type         = excluded.fee_type,
  rate             = excluded.rate,
  min_fee_zar      = excluded.min_fee_zar,
  max_fee_zar      = excluded.max_fee_zar,
  payer_role       = excluded.payer_role,
  payer_resolution = excluded.payer_resolution,
  is_enabled       = 1,
  description      = excluded.description,
  split_config     = excluded.split_config,
  updated_at       = datetime('now');