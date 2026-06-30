-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 522 — Marketplace take-rate fee schedule seed.
-- W227 sustainability marketplace + L5 RFQ/auction: the value-bearing
-- transitions fire cascades that previously carried NO commercial entity_value
-- and had NO oe_fee_schedule row, so the 1.5% take-rate was decorative
-- (computed + stored on the listing but never collected) and multi-million-Rand
-- RFQ awards / auction clears recorded zero platform revenue.
--
-- This migration seeds the matching fee_schedule rows so the fee-engine
-- (computeAndRecordFee) collects the take-rate into oe_platform_revenue.
-- trigger_event is UNIQUE so INSERT OR IGNORE is idempotent.
--
--   transaction_complete_settlement : pct 0.015 (1.5% of transaction total_zar)
--   marketplace.rfq_awarded               : bps 25   (25 bps of awarded value)
--   marketplace.auction_closed            : bps 25   (25 bps of awarded value)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_fee_schedule
  (id, trigger_event, fee_type, rate, min_fee_zar, max_fee_zar, applicable_tiers, payer_role, payer_resolution, is_enabled, description, split_config)
VALUES
  ('fee_marketplace_listing_settled', 'transaction_complete_settlement', 'pct', 0.015, 0, NULL, '[]', 'ipp_developer', 'initiator', 1, 'Sustainability marketplace 1.5% take-rate on transaction settlement', NULL),
  ('fee_marketplace_rfq_awarded',     'marketplace.rfq_awarded',                 'bps', 25,    0, NULL, '[]', 'offtaker',      'initiator', 1, 'L5 RFQ award 25 bps take-rate on awarded value',        NULL),
  ('fee_marketplace_auction_closed',  'marketplace.auction_closed',              'bps', 25,    0, NULL, '[]', 'trader',        'initiator', 1, 'L5 auction close 25 bps take-rate on awarded value',   NULL);