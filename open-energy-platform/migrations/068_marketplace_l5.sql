-- ════════════════════════════════════════════════════════════════════════
-- 068_marketplace_l5.sql — Marketplace L5.
--
-- RFQ (Request for Quote) workflow with multi-counterparty quote
-- collection, multi-party negotiation (round-trip price + terms with
-- audit trail), sealed-bid + open auctions, and reverse auctions for
-- procurement.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_rfqs (
  id                TEXT PRIMARY KEY,
  rfq_number        TEXT NOT NULL UNIQUE,
  buyer_id          TEXT NOT NULL,
  product_type      TEXT NOT NULL,           -- power_ppa | carbon_credits | rec | capacity
  description       TEXT,
  volume_mwh        REAL,
  delivery_start    TEXT,
  delivery_end      TEXT,
  target_price_zar  REAL,
  max_price_zar     REAL,
  status            TEXT NOT NULL DEFAULT 'draft',
                                              -- draft | published | quotes_collected |
                                              -- evaluation | awarded | cancelled | expired
  invitation_mode   TEXT NOT NULL DEFAULT 'open',
                                              -- open (any seller can quote) |
                                              -- closed (specific invited list)
  invitations_json  TEXT,                    -- JSON list of participant_ids
  quote_deadline    TEXT NOT NULL,
  evaluation_deadline TEXT,
  award_deadline    TEXT,
  scoring_method    TEXT NOT NULL DEFAULT 'price_only',
                                              -- price_only | weighted (price + delivery
                                              -- + bbbee + carbon)
  scoring_weights_json TEXT,
  awarded_quote_id  TEXT,
  awarded_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_rfqs_buyer ON oe_rfqs(buyer_id, status);

CREATE TABLE IF NOT EXISTS oe_rfq_quotes (
  id                TEXT PRIMARY KEY,
  rfq_id            TEXT NOT NULL,
  seller_id         TEXT NOT NULL,
  price_zar         REAL NOT NULL,
  volume_offered_mwh REAL,
  delivery_start    TEXT,
  delivery_end      TEXT,
  bbbee_level       INTEGER,
  carbon_intensity_g_co2_kwh REAL,
  terms_text        TEXT,
  attachments_r2_prefix TEXT,
  status            TEXT NOT NULL DEFAULT 'submitted',
                                              -- draft | submitted | counter_offered |
                                              -- shortlisted | awarded | declined |
                                              -- withdrawn
  score             REAL,                     -- computed by scoring algorithm
  submitted_at      TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT,
  UNIQUE (rfq_id, seller_id)                  -- one current quote per seller per RFQ
);
CREATE INDEX IF NOT EXISTS idx_oe_quotes_rfq ON oe_rfq_quotes(rfq_id, status);

CREATE TABLE IF NOT EXISTS oe_negotiation_rounds (
  id                TEXT PRIMARY KEY,
  rfq_id            TEXT NOT NULL,
  quote_id          TEXT NOT NULL,
  round_number      INTEGER NOT NULL,
  initiated_by      TEXT NOT NULL,             -- 'buyer' | 'seller'
  proposer_id       TEXT NOT NULL,
  proposed_price_zar REAL,
  proposed_volume_mwh REAL,
  proposed_terms    TEXT,
  message           TEXT,
  decision          TEXT,                     -- accepted | counter | rejected
  decided_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_neg_rfq ON oe_negotiation_rounds(rfq_id, round_number);

CREATE TABLE IF NOT EXISTS oe_auctions (
  id                  TEXT PRIMARY KEY,
  auction_number      TEXT NOT NULL UNIQUE,
  initiator_id        TEXT NOT NULL,
  auction_type        TEXT NOT NULL,           -- sealed_bid | open_ascending | open_descending |
                                              -- reverse_sealed | reverse_open
  product_type        TEXT NOT NULL,
  description         TEXT,
  reserve_price_zar   REAL,
  bid_increment_zar   REAL,
  volume_mwh          REAL NOT NULL,
  starts_at           TEXT NOT NULL,
  ends_at             TEXT NOT NULL,
  extends_on_late_bid INTEGER NOT NULL DEFAULT 0,  -- soft-close anti-sniping
  status              TEXT NOT NULL DEFAULT 'scheduled',
                                              -- scheduled | live | closed | awarded |
                                              -- cancelled | failed
  awarded_bid_id      TEXT,
  awarded_at          TEXT,
  total_bids          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_oe_auctions_status ON oe_auctions(status, ends_at);

CREATE TABLE IF NOT EXISTS oe_auction_bids (
  id              TEXT PRIMARY KEY,
  auction_id      TEXT NOT NULL,
  bidder_id       TEXT NOT NULL,
  bid_amount_zar  REAL NOT NULL,
  volume_mwh      REAL,
  submitted_at    TEXT NOT NULL DEFAULT (datetime('now')),
  visible         INTEGER NOT NULL DEFAULT 0,  -- 0 = sealed; 1 = revealed
  is_winning      INTEGER NOT NULL DEFAULT 0,
  withdrawn_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_oe_bids_auction ON oe_auction_bids(auction_id, bid_amount_zar);
