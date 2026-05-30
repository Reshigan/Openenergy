-- Wave 94 — NTCSA Renewable-Energy-Zone (REZ) Capacity Allocation & Competitive
-- Auction (P6). The COMPETITIVE-ZONAL-ALLOCATION layer of a best-in-class
-- system-operator stack. W58 grid-capacity-allocation gives a generic
-- first-come-first-served queue; W28 GCA gives the physical connection
-- agreement; W75 connection-energization gives the energization gate. W94
-- adds the COMPETITIVE ZONAL AUCTION between them: announcement →
-- applications → compliance → shortlist → multi-criteria scoring → award →
-- financial-close milestone → construction milestone → commercial operation.
--
-- DISTINCTIVE move (beat AEMO REZ (Australia) / NYISO TPP / CAISO TPP /
-- ERCOT CREZ / EU TYNDP / ENTSO-E TYNDP / NGESO Holistic Network Design /
-- Hydro Quebec MRC — most run REZ auctions in spreadsheets and never recycle
-- forfeit MW): every allocation is LIVE-scored on every fetch against a
-- ZONE-HEADROOM battery (configured ceiling vs allocated-to-date MW), a
-- multi-criteria WEIGHTED SCORE combining price (0.50) + B-BBEE (0.20) +
-- ED (0.15) + local-content (0.15) per the DMRE 40%-local-content REIPPPP
-- rule, a COMPETITION-RATIO from applications-per-lot, a MILESTONE-COMPLIANCE
-- percentage across awarded MW, a FORFEIT-RATE per zone (failures recycled
-- back), and a PREDICTED-OPERATION-DATE rolling forward from current state.
--
-- 12-state P6 lifecycle:
--   announcement_published -> application_submitted -> compliance_check
--     -> shortlisted -> evaluation_complete -> award_proposed
--     -> capacity_awarded -> financial_close_met -> construction_in_progress
--     -> in_operation                                                (terminal)
--   rejected   -- SO denial at compliance / evaluation / award (terminal).
--   forfeit    -- milestone failure (financial-close / construction / operation)
--                 -- capacity recycled back into the zone pool (terminal).
--   withdrawn  -- applicant withdraws OR admin-cancel (terminal).
--
-- Tier — MW-MAGNITUDE-DERIVED on every transition from awarded_capacity_mw
-- (fallback requested_capacity_mw):
--   minor <50MW / standard 50-250MW / material 250-500MW / mega >=500MW.
--   FLOOR-AT-MEGA for allocation_class IN (priority_zone, constraint_relief_zone,
--   jet_program_zone).
--
-- INVERTED SLA: the LARGER the allocation, the LONGER each procedural window
--   (multi-criteria diligence strengthens with magnitude). NTCSA Rules 2024
--   set 30d compliance for sub-100MW; mega gets 120d. Construction milestone
--   caps at 3 yrs for mega.
--
-- Reportability (the W94 SIGNATURE is AWARD/FORFEIT-driven — every capacity
-- award and every forfeit-recycling is publicly registered regardless of MW):
--   award_capacity       crosses regulator EVERY tier — W94 SIGNATURE hard
--                        line (sister of W45 write_off / W77 declare_breach /
--                        W68 declare_default / W86 declare_acceleration /
--                        W89 cancel_campaign / W90 terminate_legacy / W91
--                        deny_ccp_label / W92 realize_risk / W93 impose_penalty).
--   forfeit_allocation   crosses regulator EVERY tier — security-of-supply
--                        public signal (capacity recycled).
--   reject_application   crosses material+mega (governance signal).
--   complete_evaluation  crosses mega only (multi-criteria public scrutiny).
--   confirm_operation    crosses mega only (security-of-supply milestone).
--   sla_breached         crosses material+mega (procedural-window miss risk).
--
-- Single SO-side write {admin, grid_operator}. actor_party
-- (compliance_officer / evaluation_panel / council / system_operator) records
-- the functional owner per step (NOT an access split). APPLICANT can read
-- their own case via tenant scoping but cannot write.

CREATE TABLE IF NOT EXISTS oe_rez_capacity_allocations (
  id                                  TEXT PRIMARY KEY,
  allocation_number                   TEXT UNIQUE NOT NULL,

  -- Provenance — upstream chain that triggered the case
  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,
  trigger_kind                        TEXT CHECK (trigger_kind IN (
    'ntcsa_announcement','irp_capacity_target','jet_program','rez_unlock',
    'transmission_corridor_release','strategic_zone_designation',
    'auction_round_open','round_2_resubmission','re_auction_after_forfeit'
  )),

  -- Applicant identity
  applicant_party_id                  TEXT NOT NULL,
  applicant_party_name                TEXT,
  applicant_persona                   TEXT,
  applicant_contact                   TEXT,
  bbbee_level                         INTEGER,

  -- Allocation classification
  allocation_class                    TEXT NOT NULL CHECK (allocation_class IN (
    'standard_zone','priority_zone','constraint_relief_zone',
    'jet_program_zone','bess_dedicated_zone','transmission_corridor_zone'
  )),
  zone_code                           TEXT NOT NULL,
  zone_name                           TEXT,
  technology                          TEXT CHECK (technology IN (
    'solar_pv','wind_onshore','wind_offshore','bess','csp','hybrid'
  )),

  -- Tier + authority (RE-DERIVED on every transition)
  capacity_tier                       TEXT NOT NULL CHECK (capacity_tier IN (
    'minor','standard','material','mega'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'compliance_officer','evaluation_panel','council_subcommittee','full_council'
  )),

  -- Capacity quantum (MW)
  requested_capacity_mw               REAL NOT NULL DEFAULT 0,
  awarded_capacity_mw                 REAL,
  zone_total_capacity_mw              REAL NOT NULL DEFAULT 0,
  zone_allocated_to_date_mw           REAL NOT NULL DEFAULT 0,
  zone_lots_available                 INTEGER NOT NULL DEFAULT 0,
  zone_applications_in_round          INTEGER NOT NULL DEFAULT 0,
  zone_forfeit_to_date_mw             REAL NOT NULL DEFAULT 0,

  -- Multi-criteria scoring (REIPPPP-style)
  bid_price_zar_per_mwh               REAL NOT NULL DEFAULT 0,
  price_floor_zar_per_mwh             REAL NOT NULL DEFAULT 0,
  price_ceiling_zar_per_mwh           REAL NOT NULL DEFAULT 0,
  bbbee_score                         REAL,
  ed_score                            REAL,
  local_content_pct                   REAL,
  weighted_score                      REAL,
  award_clearance_price_zar_per_mw    REAL,

  -- Milestone tracking
  financial_close_target_at           TEXT,
  financial_close_actual_at           TEXT,
  construction_start_target_at        TEXT,
  construction_start_actual_at        TEXT,
  operation_target_at                 TEXT,
  operation_actual_at                 TEXT,
  milestones_total                    INTEGER NOT NULL DEFAULT 0,
  milestones_met_on_time              INTEGER NOT NULL DEFAULT 0,

  -- Refs (regulator / hand-off)
  announcement_ref                    TEXT,
  evaluation_ref                      TEXT,
  award_ref                           TEXT,
  fc_ref                              TEXT,
  construction_ref                    TEXT,
  operation_ref                       TEXT,
  forfeit_ref                         TEXT,
  rejection_ref                       TEXT,
  regulator_ref                       TEXT,
  gca_ref                             TEXT,
  energization_ref                    TEXT,

  -- Narrative
  application_basis                   TEXT,
  evaluation_basis                    TEXT,
  award_basis                         TEXT,
  rejection_basis                     TEXT,
  forfeit_basis                       TEXT,
  withdrawal_basis                    TEXT,
  reason_code                         TEXT,

  -- State + lifecycle (13 status states; cancelled handled via withdrawn)
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'announcement_published','application_submitted','compliance_check',
    'shortlisted','evaluation_complete','award_proposed','capacity_awarded',
    'financial_close_met','construction_in_progress','in_operation',
    'rejected','forfeit','withdrawn'
  )),
  announcement_published_at           TEXT NOT NULL,
  application_submitted_at            TEXT,
  compliance_check_at                 TEXT,
  shortlisted_at                      TEXT,
  evaluation_complete_at              TEXT,
  award_proposed_at                   TEXT,
  capacity_awarded_at                 TEXT,
  financial_close_met_at              TEXT,
  construction_in_progress_at         TEXT,
  in_operation_at                     TEXT,
  rejected_at                         TEXT,
  forfeit_at                          TEXT,
  withdrawn_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rez_status     ON oe_rez_capacity_allocations(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_rez_tier       ON oe_rez_capacity_allocations(capacity_tier);
CREATE INDEX IF NOT EXISTS idx_oe_rez_applicant  ON oe_rez_capacity_allocations(applicant_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_rez_class      ON oe_rez_capacity_allocations(allocation_class);
CREATE INDEX IF NOT EXISTS idx_oe_rez_zone       ON oe_rez_capacity_allocations(zone_code);
CREATE INDEX IF NOT EXISTS idx_oe_rez_opened     ON oe_rez_capacity_allocations(announcement_published_at);
CREATE INDEX IF NOT EXISTS idx_oe_rez_sla        ON oe_rez_capacity_allocations(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_rez_persona    ON oe_rez_capacity_allocations(applicant_persona);
CREATE INDEX IF NOT EXISTS idx_oe_rez_tech       ON oe_rez_capacity_allocations(technology);

CREATE TABLE IF NOT EXISTS oe_rez_capacity_events (
  id            TEXT PRIMARY KEY,
  allocation_id TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  actor_party   TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_rez_events_a    ON oe_rez_capacity_events(allocation_id);
CREATE INDEX IF NOT EXISTS idx_oe_rez_events_type ON oe_rez_capacity_events(event_type);
