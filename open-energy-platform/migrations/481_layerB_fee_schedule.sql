-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 481 — Ecosystem Layer B: all-free fee-schedule seed.
-- Adds split_config (per-fee party shares for payer_resolution='split') and
-- seeds one row per billable value-creating event. ALL FREE at launch:
-- is_enabled=0, rate=0 → the engine records R0 'waived' rows so the pipeline
-- and revenue reporting are proven end-to-end with zero billing risk. An
-- operator flips one row (is_enabled=1 + rate) via /api/admin/revenue to switch
-- any fee live — no deploy. trigger_event is UNIQUE so INSERT OR IGNORE is
-- idempotent. split_config holds a JSON array of {party_role, party_id?,
-- share_pct} with share_pct as a 0..1 fraction (matches oe_revenue_splits).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE oe_fee_schedule ADD COLUMN split_config TEXT;

INSERT OR IGNORE INTO oe_fee_schedule
  (id, trigger_event, fee_type, rate, min_fee_zar, max_fee_zar, applicable_tiers, payer_role, payer_resolution, is_enabled, description, split_config)
VALUES
  ('fee_trade_matched',        'trade.matched',                'bps',      0, 0, NULL, '[]', 'trader',        'split',       0, 'Exchange trade matched — maker/taker split', '[{"party_role":"trader","share_pct":0.5},{"party_role":"trader","share_pct":0.5}]'),
  ('fee_vcm_order_matched',    'vcm_order_matched',            'bps',      0, 0, NULL, '[]', 'trader',        'split',       0, 'Voluntary carbon market order matched',     '[{"party_role":"trader","share_pct":0.5},{"party_role":"carbon_fund","share_pct":0.5}]'),
  ('fee_settlement_settled',   'settlement.cycle_settled',     'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Settlement cycle settled',                  NULL),
  ('fee_clearing_loss_exec',   'clearing.loss_event_executed','bps',      0, 0, NULL, '[]', 'trader',        'platform',    0, 'Clearing loss event executed (mutualised)', NULL),
  ('fee_lender_waterfall',     'lender.waterfall_executed',   'bps',      0, 0, NULL, '[]', 'lender',        'platform',    0, 'Lender cash waterfall executed',            NULL),
  ('fee_contract_signed',      'contract.signed',             'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'beneficiary', 0, 'PPA / contract signed',                     NULL),
  ('fee_cdr_offtake_signed',   'cdr.offtake_signed',          'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'beneficiary', 0, 'Corporate offtake agreement signed',        NULL),
  ('fee_invoice_issued',       'invoice.issued',              'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Invoice issued',                            NULL),
  ('fee_invoice_paid',         'invoice.paid',                'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Invoice paid',                              NULL),
  ('fee_drawdown_disbursed',   'ipp.drawdown_disbursed',      'bps',      0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'Debt drawdown disbursed',                   NULL),
  ('fee_disbursement_appr',    'disbursement.approved',       'bps',      0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'Use-of-proceeds disbursement approved',     NULL),
  ('fee_carbon_credits_iss',   'carbon.credits_issued',       'bps',      0, 0, NULL, '[]', 'carbon_fund',   'initiator',   0, 'Carbon credits issued',                     NULL),
  ('fee_carbon_vintage_iss',   'carbon.vintage_issued',       'bps',      0, 0, NULL, '[]', 'carbon_fund',   'initiator',   0, 'Carbon vintage issued',                     NULL),
  ('fee_carbon_retired',       'carbon.retired',              'flat_zar', 0, 0, NULL, '[]', 'carbon_fund',   'initiator',   0, 'Carbon credits retired',                    NULL),
  ('fee_rec_issued',           'offtaker.rec_issued',         'flat_zar', 0, 0, NULL, '[]', 'ipp_developer', 'initiator',   0, 'Renewable energy certificate issued',       NULL),
  ('fee_rec_retired',          'offtaker.rec_retired',        'flat_zar', 0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Renewable energy certificate retired',      NULL),
  ('fee_wheeling_issued',      'grid.wheeling_charge_issued', 'bps',      0, 0, NULL, '[]', 'grid_operator', 'beneficiary', 0, 'Wheeling charge issued',                    NULL),
  ('fee_wheeling_paid',        'grid.wheeling_charge_paid',   'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'Wheeling charge paid',                      NULL),
  ('fee_licence_granted',      'regulator.licence_granted',   'flat_zar', 0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'NERSA licence granted',                     NULL),
  ('fee_margin_call_issued',   'trader.margin_call_issued',   'flat_zar', 0, 0, NULL, '[]', 'trader',        'initiator',   0, 'Margin call issued',                        NULL),
  ('fee_facility_amendment',   'fam_evt_execute_amendment',   'flat_zar', 0, 0, NULL, '[]', 'lender',        'initiator',   0, 'Facility amendment executed',               NULL),
  ('fee_om_contract_exec',     'omc_evt_execute_contract',    'bps',      0, 0, NULL, '[]', 'ipp_developer', 'beneficiary', 0, 'O&M contract executed',                     NULL),
  ('fee_payment_sec_bond',     'psec_evt_issue_bond',         'bps',      0, 0, NULL, '[]', 'offtaker',      'initiator',   0, 'PPA payment-security bond issued',          NULL);
