-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 507 — Cross-Role Deal Engine Layer B: all-free fee-schedule seed.
-- Seeds one fee row per value-bearing deal-engine event (offer accepted, auction
-- cleared, syndication leg subscribed, capital-stack objective fully funded).
-- ALL FREE at launch: is_enabled=0, rate=0 → the engine records R0 'waived' rows
-- so the revenue pipeline is proven end-to-end with zero billing risk. An
-- operator flips one row (is_enabled=1 + rate) via /api/admin/revenue to switch
-- any fee live — no deploy. trigger_event is UNIQUE so INSERT OR IGNORE is
-- idempotent. split_config column already exists (added by migration 481).
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_fee_schedule
  (id, trigger_event, fee_type, rate, min_fee_zar, max_fee_zar, applicable_tiers, payer_role, payer_resolution, is_enabled, description, split_config)
VALUES
  ('fee_deal_accepted',       'deal.accepted',        'bps',      0, 0, NULL, '[]', 'offtaker', 'initiator',   0, 'Cross-role deal accepted / matched',       NULL),
  ('fee_deal_cleared',        'deal.cleared',         'bps',      0, 0, NULL, '[]', 'trader',   'initiator',   0, 'Cross-role auction cleared',               NULL),
  ('fee_deal_subscribed',     'deal.subscribed',      'bps',      0, 0, NULL, '[]', 'lender',   'initiator',   0, 'Cross-role syndication leg subscribed',    NULL),
  ('fee_objective_subscribed','objective.subscribed', 'flat_zar', 0, 0, NULL, '[]', 'lender',   'beneficiary', 0, 'Capital-stack objective fully funded',     NULL);
