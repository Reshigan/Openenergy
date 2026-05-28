-- Wave 62 — Offtaker PPA Termination & Early-Termination Amount (Buy-Out) chain.
-- NERSA ERA 4/2006 + Section 34 ministerial determination (security of supply) +
-- the PPA termination & buy-out provisions (event of default, cure, long-stop FM,
-- change-in-law) + IFRS 9/16 lease-and-debt treatment of the early-termination
-- amount. 12-state P6 lifecycle for a SINGLE termination of an offtake agreement,
-- driven by the offtaker, with the seller (IPP) able to dispute the calculated
-- buy-out and an independent expert resolving the dispute.
--
-- The EXIT of the offtake relationship. Every prior Offtaker chain operates on a
-- LIVE PPA — W22 executes it, W39 reprices it, W7 reconciles delivery, W32
-- enforces minimum offtake, W46 compensates curtailed energy, W54 backstops
-- payment. W62 is how the PPA ENDS before its natural term: a termination event
-- arises, notice is served, a cure window runs, and — if uncured — the PPA
-- terminates and an early-termination amount (the buy-out) is calculated, agreed
-- and settled.
--
-- The buy-out basis turns on the termination CAUSE (the W62 signature):
--   seller_default          — debt only (lenders covered, no equity make-whole)
--   buyer_default           — debt + equity (seller made whole at buyer cost)
--   change_in_law           — debt + equity (government / buyer obligation)
--   prolonged_force_majeure — debt only (shared risk, no equity gain)
--   no_fault                — negotiated (mutual / voluntary termination)
--
-- 12-state P6 lifecycle:
--   termination_triggered → notice_served → cure_period → termination_review
--     → termination_confirmed → eta_assessment → eta_agreed
--     → settlement_pending → closed                          (full buy-out path)
--   cure path:     cure_period → reinstated                  (counterparty cured)
--   no-cure path:  notice_served → termination_review        (no cure offered)
--   dispute path:  eta_assessment / eta_agreed → disputed → eta_agreed
--   withdraw:      any pre-confirmation operative state → withdrawn
--
-- Buy-out tiers (ZAR millions; drive the MIXED SLA + reportability):
--   minor < 50 / moderate < 250 / material < 1000 / major < 5000 / critical >= 5000
--
-- MIXED SLA: notice / review windows roughly fixed (contractual); cure +
-- eta_assessment + dispute windows INVERTED (bigger buy-out = longer, deeper
-- debt-schedule + equity-IRR computation); settlement_pending URGENT (once
-- agreed, a larger buy-out is paid FASTER for security of supply). Terminals 0.
--
-- Reportability (the W62 signature is CAUSE-driven, not size-driven):
--   confirm_termination crosses for EVERY tier when the cause is INVOLUNTARY
--   (seller_default / buyer_default / change_in_law / prolonged_force_majeure) —
--   terminating a licensed generator offtake for fault, illegality or prolonged
--   FM is always a NERSA security-of-supply event; a no_fault mutual termination
--   crosses only for the large tiers. confirm_settlement crosses for the large
--   tiers (major + critical) only. SLA breaches cross for major + critical only.
--
-- Two-party split write: the OFFTAKER side drives the termination machinery; the
-- SELLER / counterparty (IPP) can dispute the calculated buy-out (dispute_eta is
-- the sole counterparty write). actor_party (offtaker / counterparty /
-- independent) records the contractual function per step, not the JWT role.

CREATE TABLE IF NOT EXISTS oe_ppa_terminations (
  id                            TEXT PRIMARY KEY,
  case_number                   TEXT UNIQUE NOT NULL,

  -- Provenance (the live PPA this termination acts on)
  source_event                  TEXT,
  source_entity_type            TEXT,
  source_entity_id              TEXT,
  source_wave                   TEXT,

  -- Parties (two-party split write: offtaker side + seller counterparty + expert)
  offtaker_party_id             TEXT NOT NULL,
  offtaker_party_name           TEXT NOT NULL,
  seller_party_id               TEXT NOT NULL,
  seller_party_name             TEXT NOT NULL,
  independent_party_id          TEXT,
  independent_party_name        TEXT,

  -- The PPA being terminated
  ppa_code                      TEXT,              -- internal PPA code
  ppa_name                      TEXT NOT NULL,     -- human name of the PPA
  plant_name                    TEXT,              -- the underlying generation plant
  technology                    TEXT,              -- solar_pv / wind / csp / battery / hybrid
  ppa_currency                  TEXT,              -- ZAR / USD
  ppa_capacity_mw               REAL,              -- contracted capacity (MW)
  remaining_term_months         INTEGER,           -- months left on the PPA term

  -- Termination cause + buy-out basis (the W62 signature)
  termination_cause             TEXT NOT NULL CHECK (termination_cause IN (
    'seller_default','buyer_default','no_fault','change_in_law','prolonged_force_majeure'
  )),
  eta_basis                     TEXT NOT NULL CHECK (eta_basis IN (
    'debt_only','debt_plus_equity','negotiated'
  )),

  -- Buy-out (early-termination amount) economics
  debt_outstanding_zar_m        REAL,              -- senior debt outstanding (ZAR m)
  equity_makewhole_zar_m        REAL,              -- equity make-whole component (ZAR m)
  buyout_zar_m                  REAL NOT NULL,     -- early-termination amount (ZAR m)
  settlement_zar_m              REAL,              -- amount actually settled (ZAR m)
  termination_tier              TEXT NOT NULL CHECK (termination_tier IN (
    'minor','moderate','material','major','critical'
  )),

  -- Gates
  notice_served_flag            INTEGER NOT NULL DEFAULT 0,
  cure_offered                  INTEGER NOT NULL DEFAULT 0,
  cured                         INTEGER NOT NULL DEFAULT 0,
  termination_confirmed_flag    INTEGER NOT NULL DEFAULT 0,
  eta_calculated                INTEGER NOT NULL DEFAULT 0,
  eta_agreed_flag               INTEGER NOT NULL DEFAULT 0,
  dispute_raised                INTEGER NOT NULL DEFAULT 0,
  dispute_resolved              INTEGER NOT NULL DEFAULT 0,
  settlement_paid               INTEGER NOT NULL DEFAULT 0,

  -- Refs
  trigger_ref                   TEXT,
  notice_ref                    TEXT,
  cure_ref                      TEXT,
  review_ref                    TEXT,
  confirmation_ref              TEXT,
  assessment_ref                TEXT,
  agreement_ref                 TEXT,
  dispute_ref                   TEXT,
  resolution_ref                TEXT,
  settlement_ref                TEXT,
  closure_ref                   TEXT,
  reinstatement_ref             TEXT,
  withdrawal_ref                TEXT,
  regulator_ref                 TEXT,

  -- Narrative
  trigger_basis                 TEXT,
  notice_basis                  TEXT,
  cure_basis                    TEXT,
  review_basis                  TEXT,
  confirmation_basis            TEXT,
  assessment_basis              TEXT,
  agreement_basis               TEXT,
  dispute_basis                 TEXT,
  resolution_basis              TEXT,
  settlement_basis              TEXT,
  reinstatement_basis           TEXT,
  withdrawal_basis              TEXT,
  reason_code                   TEXT,
  notes                         TEXT,

  dispute_round                 INTEGER NOT NULL DEFAULT 0,

  -- State + lifecycle
  chain_status                  TEXT NOT NULL CHECK (chain_status IN (
    'termination_triggered','notice_served','cure_period','termination_review',
    'termination_confirmed','eta_assessment','eta_agreed','disputed',
    'settlement_pending','closed','reinstated','withdrawn'
  )),
  termination_triggered_at      TEXT NOT NULL,
  notice_served_at              TEXT,
  cure_period_at                TEXT,
  termination_review_at         TEXT,
  termination_confirmed_at      TEXT,
  eta_assessment_at             TEXT,
  eta_agreed_at                 TEXT,
  disputed_at                   TEXT,
  settlement_pending_at         TEXT,
  closed_at                     TEXT,
  reinstated_at                 TEXT,
  withdrawn_at                  TEXT,

  is_reportable                 INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at               TEXT,
  last_sla_breach_at            TEXT,
  escalation_level              INTEGER NOT NULL DEFAULT 0,

  created_by                    TEXT NOT NULL,
  created_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pter_status    ON oe_ppa_terminations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_pter_tier      ON oe_ppa_terminations(termination_tier);
CREATE INDEX IF NOT EXISTS idx_oe_pter_cause     ON oe_ppa_terminations(termination_cause);
CREATE INDEX IF NOT EXISTS idx_oe_pter_offtaker  ON oe_ppa_terminations(offtaker_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_pter_ppa       ON oe_ppa_terminations(ppa_code);
CREATE INDEX IF NOT EXISTS idx_oe_pter_triggered ON oe_ppa_terminations(termination_triggered_at);
CREATE INDEX IF NOT EXISTS idx_oe_pter_sla       ON oe_ppa_terminations(sla_deadline_at);

CREATE TABLE IF NOT EXISTS oe_ppa_terminations_events (
  id                 TEXT PRIMARY KEY,
  termination_id     TEXT NOT NULL,
  event_type         TEXT NOT NULL,
  from_status        TEXT,
  to_status          TEXT,
  actor_id           TEXT,
  actor_party        TEXT,
  notes              TEXT,
  payload            TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_pter_events_t    ON oe_ppa_terminations_events(termination_id);
CREATE INDEX IF NOT EXISTS idx_oe_pter_events_type ON oe_ppa_terminations_events(event_type);
