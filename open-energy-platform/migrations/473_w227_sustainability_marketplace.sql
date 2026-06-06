-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 473 — W227 Sustainability Marketplace
-- Unified cross-role trading venue: RECs, VCM credits, brokered CoA retirements
--
-- Legal basis:
--  REC listings  — GCC/I-REC Standard: secondary trading permitted
--  VCM listings  — Verra VCS v4.5 / GS4GG v3.1: free secondary market
--  Brokered CoA  — Carbon Tax Act §13: retirement on buyer's behalf only,
--                   NOT resale of tax credits (FSCA FMA 2012: carbon credits
--                   are not financial instruments; no FSP licence required for
--                   spot physical transactions)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_sustainability_listings (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,                -- seller
  listing_type TEXT NOT NULL CHECK(listing_type IN ('rec','vcm','brokered_coa')),

  -- Source references (at least one required depending on type)
  rec_holding_id TEXT,    -- REFERENCES oe_rec_holdings(id)
  vcm_holding_id TEXT,    -- REFERENCES oe_vcm_holdings(id)

  -- Listing display details
  title TEXT NOT NULL,
  description TEXT,
  technology TEXT,
  vintage_year INTEGER,
  registry_standard TEXT,
  methodology TEXT,
  carbon_tax_eligible INTEGER DEFAULT 0,
  sustainability_framework TEXT,  -- re100, sbti, cdp, iso14064, jse_esg, gbcsa, ghg_protocol_scope2

  -- Pricing
  quantity_listed REAL NOT NULL,
  quantity_reserved REAL DEFAULT 0,
  quantity_sold REAL DEFAULT 0,
  unit TEXT NOT NULL CHECK(unit IN ('mwh','tco2e')),
  price_zar_per_unit REAL NOT NULL,
  min_purchase_qty REAL DEFAULT 1.0,

  -- Retirement options the seller allows
  allows_portfolio_hold INTEGER DEFAULT 1,
  allows_brokered_retirement INTEGER DEFAULT 1,

  -- Verification / provenance
  registry_cert_ids TEXT,           -- JSON array of cert IDs from issuing registry
  verified_by TEXT,
  verification_date TEXT,

  -- Chain state
  chain_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(chain_status IN ('draft','active','partially_sold','sold_out','cancelled','expired')),

  listing_expiry TEXT,              -- ISO date; NULL = 90-day default
  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oe_sustainability_transactions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES oe_sustainability_listings(id),
  seller_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  listing_type TEXT NOT NULL CHECK(listing_type IN ('rec','vcm','brokered_coa')),

  -- What was purchased
  quantity_purchased REAL NOT NULL,
  unit TEXT NOT NULL CHECK(unit IN ('mwh','tco2e')),
  price_zar_per_unit REAL NOT NULL,
  total_zar REAL NOT NULL,
  platform_fee_zar REAL NOT NULL,     -- 1.5% of total_zar
  net_seller_zar REAL NOT NULL,        -- total_zar - platform_fee_zar

  -- Disposition: hold in portfolio or retire immediately
  disposition TEXT NOT NULL DEFAULT 'portfolio_hold'
    CHECK(disposition IN ('portfolio_hold','brokered_retirement')),

  -- Brokered retirement details (populated if disposition = brokered_retirement)
  retirement_beneficiary TEXT,
  retirement_purpose TEXT CHECK(retirement_purpose IN
    ('scope2_ghg_protocol','re100','sbti','cdp','iso14064','jse_esg','gbcsa_green_star',
     'carbon_tax_offset','supply_chain_scope3','other')),
  retirement_ref TEXT,                -- registry retirement serial / OE cert number

  -- Payment & settlement
  payment_method TEXT CHECK(payment_method IN
    ('platform_wallet','eft','instant_eft','card')),
  payment_ref TEXT,
  settlement_ref TEXT,

  -- Chain state
  chain_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(chain_status IN
      ('pending','payment_processing','payment_confirmed',
       'settlement_pending','settled','failed','refunded','cancelled')),

  sla_deadline TEXT,
  sla_breached INTEGER DEFAULT 0,
  regulator_notified INTEGER DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- oe_marketplace_reviews — post-transaction trust signals
CREATE TABLE IF NOT EXISTS oe_marketplace_reviews (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES oe_sustainability_transactions(id),
  reviewer_id TEXT NOT NULL,
  reviewee_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_active
  ON oe_sustainability_listings(chain_status, listing_type, technology);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller
  ON oe_sustainability_listings(participant_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_buyer
  ON oe_sustainability_transactions(buyer_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_seller
  ON oe_sustainability_transactions(seller_id, chain_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_transactions_listing
  ON oe_sustainability_transactions(listing_id);
