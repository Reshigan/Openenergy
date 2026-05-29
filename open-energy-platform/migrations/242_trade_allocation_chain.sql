-- Wave 76 — Trade Allocation, Give-Up & Confirmation/Affirmation chain (P6).
-- The post-execution institutional trade-processing lifecycle. When a block trade
-- executes on the venue it is the START of a chain, not the end: an asset manager
-- ALLOCATES the block across underlying client / sub-accounts; where the executing
-- broker is not the clearing broker the trade is GIVEN UP to the clearing broker
-- who must ACCEPT it; the executing broker issues a CONFIRMATION; the counterparty
-- AFFIRMS it; central matching reconciles the two sides (DTCC/Omgeo CTM-style); a
-- settlement instruction is released against standing settlement instructions (SSI)
-- and the trade SETTLES at the CSD. Any discrepancy at any step is a BREAK that must
-- be flagged, reasoned and resolved — and under a CSDR-style settlement-discipline
-- regime EVERY break / settlement fail is reportable to the regulator.
--
-- DISTINCT from every other trader chain by SUBJECT:
--   W2 measures the venue's own MARKET risk (VaR); W29 caps regulatory POSITION SIZE;
--   W36 governs ORDER routing / RFQ quality; W3 is the venue's atomic DvP settlement
--   run; W44 reports trades to the trade REPOSITORY; W52 surveils for ABUSE; W60
--   certifies the trading SYSTEMS; W68 manages COLLATERAL / counterparty default.
--   W76 is the ALLOCATION -> CONFIRMATION -> AFFIRMATION -> MATCH -> SETTLEMENT-
--   INSTRUCTION leg that turns one executed block into per-account settled positions.
--
-- 12-state P6 lifecycle:
--   executed -> allocation_pending -> allocated -> give_up_pending -> give_up_accepted
--     -> confirmation_issued -> affirmed -> matched -> settlement_instructed -> settled
--   self-cleared (no give-up): allocated -> confirmation_issued
--   break (CSDR discipline): {allocated, give_up_pending, give_up_accepted,
--     confirmation_issued, affirmed, matched, settlement_instructed}
--       -> break_review -> (resolve_break) -> confirmation_issued
--   cancel (pull before it locks in): {executed, allocation_pending, allocated,
--     give_up_pending, give_up_accepted, confirmation_issued, break_review} -> cancelled
--
-- Tiers (5) by TRADE NOTIONAL (ZAR): micro <R1m / small <R10m / medium <R50m /
-- large <R250m / block >=R250m. LARGE_TIERS = {large, block}.
--
-- SLA matrix is URGENT — the LARGER the notional, the TIGHTER every window
-- (same-day-affirmation discipline: a block trade must affirm/match same day; a micro
-- ticket has days). Same flavour as W68 / W34 / W67.
--
-- Reportability — the W76 SIGNATURE is BREAK-DRIVEN: under settlement discipline every
-- break / settlement fail is notifiable, so flag_break crosses for EVERY tier (the
-- mirror of W68 declare_default / W67 escalate_disconnection). cancel_trade + SLA
-- breaches cross for the LARGE tiers (large + block) only.
--
-- Single write: the trading desk / trade-processing ops drives every step;
-- counterparties affirm / accept give-ups out-of-band. actor_party tags whether a step
-- represents front office, middle office or the counterparty, for the audit trail.

CREATE TABLE IF NOT EXISTS oe_trade_allocations (
  id                       TEXT PRIMARY KEY,
  allocation_number        TEXT UNIQUE NOT NULL,

  -- Provenance (W76 follows execution on the venue)
  source_event             TEXT,
  source_entity_type       TEXT,
  source_entity_id         TEXT,
  source_wave              TEXT,
  trade_ref                TEXT,              -- executed block trade reference
  order_ref                TEXT,              -- originating order

  -- Counterparties / brokers
  executing_party          TEXT NOT NULL,     -- executing broker / desk
  clearing_party           TEXT,              -- clearing broker (give-up target)
  counterparty_name        TEXT NOT NULL,     -- client / fund affirming
  block_account            TEXT,              -- pre-allocation block account

  -- Classification
  instrument               TEXT,              -- energy_forward / rec / carbon / option
  energy_type              TEXT,              -- power / gas / carbon / rec
  side                     TEXT,              -- buy / sell
  quantity                 REAL,              -- contract quantity (MWh / units)
  price                    REAL,              -- execution price
  notional_zar             REAL NOT NULL,     -- trade notional — drives the tier
  allocation_legs          INTEGER,           -- number of sub-account legs
  notional_tier            TEXT NOT NULL CHECK (notional_tier IN (
    'micro','small','medium','large','block'
  )),

  -- Settlement
  settlement_date          TEXT,
  ssi_ref                  TEXT,              -- standing settlement instruction used
  csd_ref                  TEXT,              -- CSD / settlement reference
  break_reason_code        TEXT,              -- structured break classification

  -- Refs
  allocation_ref           TEXT,
  give_up_ref              TEXT,
  confirmation_ref         TEXT,
  affirmation_ref          TEXT,
  match_ref                TEXT,
  settlement_instruction_ref TEXT,
  break_ref                TEXT,
  cancel_ref               TEXT,

  -- Narrative
  allocation_basis         TEXT,
  give_up_basis            TEXT,
  confirmation_basis       TEXT,
  affirmation_basis        TEXT,
  match_basis              TEXT,
  settlement_basis         TEXT,
  break_basis              TEXT,
  resolution_basis         TEXT,
  cancel_basis             TEXT,
  reason_code              TEXT,

  -- State + lifecycle
  chain_status             TEXT NOT NULL CHECK (chain_status IN (
    'executed','allocation_pending','allocated','give_up_pending','give_up_accepted',
    'confirmation_issued','affirmed','matched','settlement_instructed','settled',
    'break_review','cancelled'
  )),
  executed_at                  TEXT NOT NULL,
  allocation_pending_at        TEXT,
  allocated_at                 TEXT,
  give_up_pending_at           TEXT,
  give_up_accepted_at          TEXT,
  confirmation_issued_at       TEXT,
  affirmed_at                  TEXT,
  matched_at                   TEXT,
  settlement_instructed_at     TEXT,
  settled_at                   TEXT,
  break_review_at              TEXT,
  cancelled_at                 TEXT,

  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  is_reportable            INTEGER NOT NULL DEFAULT 0,
  escalation_level         INTEGER NOT NULL DEFAULT 0,

  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_alloc_status   ON oe_trade_allocations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_alloc_tier     ON oe_trade_allocations(notional_tier);
CREATE INDEX IF NOT EXISTS idx_oe_alloc_exec     ON oe_trade_allocations(executing_party);
CREATE INDEX IF NOT EXISTS idx_oe_alloc_instr    ON oe_trade_allocations(instrument);
CREATE INDEX IF NOT EXISTS idx_oe_alloc_sla      ON oe_trade_allocations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_trade_allocation_events (
  id              TEXT PRIMARY KEY,
  allocation_id   TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  actor_party     TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_alloc_events_alloc ON oe_trade_allocation_events(allocation_id);
CREATE INDEX IF NOT EXISTS idx_oe_alloc_events_type  ON oe_trade_allocation_events(event_type);
