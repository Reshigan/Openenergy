-- Migration 506: Cross-role deal engine substrate.
-- Four tables backing the generalized offer→match→evaluate→accept→track engine
-- (CROSS_ROLE_DEAL_ENGINE_PLAN.md §5). Static-literal enums only; deal_type and
-- *_role are stored as bound-param VALUES, never used as SQL identifiers — the
-- registry (src/utils/deal-registry.ts) validates them at the route layer.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS on every statement. Nullable
-- columns added later reconcile via ALTER TABLE ADD COLUMN (duplicate column name
-- is treated as a benign already-applied signal — see migration discipline 050).

-- ── Offers ────────────────────────────────────────────────────────────────────
-- One row per offer a provider publishes (marketplace/negotiation) or per bid a
-- bidder/syndicate member commits (auction/syndication). term_sheet carries the
-- descriptor-shaped JSON.
CREATE TABLE IF NOT EXISTS oe_deal_offers (
  id                  TEXT PRIMARY KEY,
  deal_type           TEXT NOT NULL,
  provider_id         TEXT NOT NULL,
  provider_role       TEXT NOT NULL,
  tenant_id           TEXT NOT NULL,
  title               TEXT NOT NULL,
  term_sheet          TEXT NOT NULL DEFAULT '{}',
  request_id          TEXT,
  -- auction
  bid_amount_zar      REAL,
  bid_quantity        REAL,
  clearing_status     TEXT,
  cleared_quantity    REAL,
  cleared_price_zar   REAL,
  -- syndication
  syndicate_id        TEXT,
  tranche_pct         REAL,
  committed_amount_zar REAL,
  syndicate_role      TEXT,
  -- negotiation
  counter_of          TEXT,
  counter_by_role     TEXT,
  decline_reason      TEXT,
  status              TEXT NOT NULL DEFAULT 'published',
  expiry              TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_offers_type_status ON oe_deal_offers(deal_type, status);
CREATE INDEX IF NOT EXISTS idx_deal_offers_provider ON oe_deal_offers(provider_id);
CREATE INDEX IF NOT EXISTS idx_deal_offers_request ON oe_deal_offers(request_id);
CREATE INDEX IF NOT EXISTS idx_deal_offers_syndicate ON oe_deal_offers(syndicate_id);
CREATE INDEX IF NOT EXISTS idx_deal_offers_counter ON oe_deal_offers(counter_of);
CREATE INDEX IF NOT EXISTS idx_deal_offers_expiry ON oe_deal_offers(expiry);

-- ── Requests ──────────────────────────────────────────────────────────────────
-- One row per need a demand party publishes (or per auction/syndication a provider
-- opens). need carries the descriptor-shaped JSON profile the matcher scores against.
CREATE TABLE IF NOT EXISTS oe_deal_requests (
  id                  TEXT PRIMARY KEY,
  deal_type           TEXT NOT NULL,
  demand_id           TEXT NOT NULL,
  demand_role         TEXT NOT NULL,
  tenant_id           TEXT NOT NULL,
  need                TEXT NOT NULL DEFAULT '{}',
  selected_offer_id   TEXT,
  objective_id        TEXT,
  stack_layer         TEXT,
  bid_window_close    TEXT,
  clearing_rule       TEXT,
  clearing_price_zar  REAL,
  target_amount_zar   REAL,
  filled_amount_zar   REAL NOT NULL DEFAULT 0,
  dispatched_chain_key TEXT,
  dispatched_case_id  TEXT,
  status              TEXT NOT NULL DEFAULT 'open',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_requests_type_status ON oe_deal_requests(deal_type, status);
CREATE INDEX IF NOT EXISTS idx_deal_requests_demand ON oe_deal_requests(demand_id);
CREATE INDEX IF NOT EXISTS idx_deal_requests_window ON oe_deal_requests(bid_window_close);
CREATE INDEX IF NOT EXISTS idx_deal_requests_objective ON oe_deal_requests(objective_id);

-- ── Objectives (capital stack / co-funding) ────────────────────────────────────
-- A funding target multiple child deals contribute toward. Each accepted child
-- carrying objective_id advances committed_zar; at funding_target_zar one
-- objective.subscribed fires the single close-chain dispatch (§3.1).
CREATE TABLE IF NOT EXISTS oe_deal_objectives (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL,
  owner_role          TEXT NOT NULL,
  tenant_id           TEXT NOT NULL,
  project_ref         TEXT,
  title               TEXT NOT NULL,
  funding_target_zar  REAL NOT NULL,
  committed_zar       REAL NOT NULL DEFAULT 0,
  stack_plan          TEXT,
  close_chain_key     TEXT,
  close_case_id       TEXT,
  status              TEXT NOT NULL DEFAULT 'forming',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_objectives_owner ON oe_deal_objectives(owner_id);
CREATE INDEX IF NOT EXISTS idx_deal_objectives_status ON oe_deal_objectives(status);

-- ── Links (relationship structures) ────────────────────────────────────────────
-- Typed relationships between deals/objectives: condition_precedent, bundle,
-- substitute, back_to_back, pool, novation, rofr, cross_default, cover_for,
-- renewal_of (§3.2). link_group_id groups members of one structure.
CREATE TABLE IF NOT EXISTS oe_deal_links (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL,
  link_kind           TEXT NOT NULL,
  link_group_id       TEXT,
  from_kind           TEXT NOT NULL,
  from_id             TEXT NOT NULL,
  to_kind             TEXT NOT NULL,
  to_id               TEXT NOT NULL,
  condition_state     TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_deal_links_from ON oe_deal_links(from_kind, from_id);
CREATE INDEX IF NOT EXISTS idx_deal_links_to ON oe_deal_links(to_kind, to_id);
CREATE INDEX IF NOT EXISTS idx_deal_links_group ON oe_deal_links(link_group_id);
CREATE INDEX IF NOT EXISTS idx_deal_links_kind ON oe_deal_links(link_kind);
