-- Wave 93 — NERSA ERA s35 Enforcement Actions & Administrative Penalties (P6).
-- The ENFORCEMENT-TEETH layer of a best-in-class regulator stack. W5 gave NERSA
-- the inbox (case arrival); W31 gave it disposition (queue/adjudication
-- metadata); W40 produced FINDINGS of non-conformance from compliance
-- inspections. W93 adds what every real regulator needs next — formal
-- administrative-penalty proceedings under ERA s35: charge sheet -> audi
-- alteram partem (representations period) -> optional oral hearing ->
-- Council determination -> penalty notice -> recovery (paid / appealed /
-- enforced via court).
--
-- DISTINCTIVE move (beat FERC Office of Enforcement / Ofgem provisional+final
-- penalty notice / Bundesnetzagentur Bußgeldverfahren / CRE CoRDiS / AER civil
-- penalty undertaking / ACER / BEREC / IBAMA / ANEEL / SEC ALJ admin
-- proceedings / SARS TAA Ch15 admin penalty — most run on spreadsheets and
-- miss procedural windows): every case is LIVE-scored on every fetch against
-- an AUDI-WINDOW COMPLIANCE battery (PAJA s4 reasonable-time + ERA s35(3)
-- audi minimum 21 days), a PROCEDURAL-IRREGULARITY flag fires on representations
-- shorter than 21 days OR a denied hearing without reasoned refusal, the ERA
-- s35 cap of R1m/offence is enforced automatically, prescribed-rate interest
-- (15.5% per Prescribed Rate of Interest Act 55/1975) accrues on unpaid
-- penalty from due date, and a REPEAT-OFFENDER score (count + recency) raises
-- floor-at-severe.
--
-- 12-state P6 lifecycle:
--   case_opened -> allegations_drafted -> allegations_served
--     -> representations_period -> (hearing_held optional)
--     -> determination -> penalty_imposed -> paid                  (terminal)
--   dismissed         -- Council finds no contravention (terminal).
--   appealed          -- Tribunal appeal lodged; re-imposes / dismisses / enforces.
--   enforced_via_court -- writ / sheriff / garnishee / contempt; -> paid / dismissed.
--   withdrawn         -- NERSA elects not to pursue OR admin-cancel (terminal).
--
-- Tier — PENALTY-QUANTUM-DERIVED on every transition from proposed_penalty_zar
--   minor <R100k / standard R100k-R500k / material R500k-R1m / severe >=R1m.
--   FLOOR-AT-SEVERE for allegation_class IN (safety_violation, repeat_offender,
--   systemic_market_abuse).
--
-- INVERTED SLA: the LARGER the penalty, the LONGER each procedural window (audi
--   alteram partem strengthens with magnitude). representations_period >= 21
--   days for every tier (ERA s35(3) + PAJA s4); severe gets 60 days.
--
-- Reportability (the W93 SIGNATURE is DETERMINATION-driven — any penalty
-- notice is publicly registered regardless of quantum):
--   impose_penalty       crosses regulator EVERY tier — the W93 SIGNATURE hard
--                        line (sister of W45 write_off / W77 declare_breach /
--                        W68 declare_default / W86 declare_acceleration /
--                        W89 cancel_campaign / W90 terminate_legacy / W91
--                        deny_ccp_label / W92 realize_risk).
--   initiate_enforcement crosses every tier (court-system signal).
--   lodge_appeal         crosses every tier (Tribunal track).
--   make_determination   crosses every tier on severe; material+ otherwise (if liable).
--   dismiss / withdraw   crosses material+severe only (governance signal).
--   serve_allegations    crosses every tier when allegation_class IN
--                        (safety_violation, repeat_offender, systemic_market_abuse).
--   sla_breached         crosses material+severe (judicial-review risk).
--
-- Single regulator-side write {admin, regulator}. actor_party
-- (enforcement_officer / panel_chair / council / sheriff) records the
-- functional owner per step (NOT an access split). RESPONDENT can read their
-- own case via tenant scoping but cannot write.

CREATE TABLE IF NOT EXISTS oe_enforcement_actions (
  id                                  TEXT PRIMARY KEY,
  case_number                         TEXT UNIQUE NOT NULL,

  -- Provenance — upstream chain that triggered the case
  source_event                        TEXT,
  source_entity_type                  TEXT,
  source_entity_id                    TEXT,
  source_wave                         TEXT,
  trigger_kind                        TEXT CHECK (trigger_kind IN (
    'compliance_inspection','consumer_complaint','consultation_breach',
    'tariff_audit','market_surveillance','self_report','periodic_review',
    'whistleblower','regulator_initiated'
  )),

  -- Respondent identity
  respondent_party_id                 TEXT NOT NULL,
  respondent_party_name               TEXT,
  respondent_licence_no               TEXT,
  respondent_persona                  TEXT,
  respondent_contact                  TEXT,

  -- Allegation classification
  allegation_class                    TEXT NOT NULL CHECK (allegation_class IN (
    'tariff_non_compliance','metering_failure','reporting_failure',
    'licence_condition_breach','grid_code_breach','consumer_protection',
    'safety_violation','environmental_breach','market_abuse',
    'unlicensed_operation','repeat_offender','systemic_market_abuse'
  )),
  allegation_summary                  TEXT,
  era_section_cited                   TEXT,
  offence_count                       INTEGER NOT NULL DEFAULT 1,
  contravention_period_start          TEXT,
  contravention_period_end            TEXT,

  -- Tier + authority (RE-DERIVED on every transition)
  penalty_tier                        TEXT NOT NULL CHECK (penalty_tier IN (
    'minor','standard','material','severe'
  )),
  authority_required                  TEXT CHECK (authority_required IN (
    'enforcement_officer','panel_chair','council_subcommittee','full_council'
  )),

  -- Penalty quantum (ERA s35 cap R1m per offence; can stack)
  proposed_penalty_per_offence_zar    REAL NOT NULL DEFAULT 0,
  proposed_penalty_total_zar          REAL NOT NULL DEFAULT 0,
  imposed_penalty_zar                 REAL,
  recovered_zar                       REAL NOT NULL DEFAULT 0,
  accrued_interest_zar                REAL NOT NULL DEFAULT 0,

  -- Audi (representations period) tracking
  representations_opened_at           TEXT,
  representations_closed_at           TEXT,
  representations_received_flag       INTEGER NOT NULL DEFAULT 0,
  representations_summary             TEXT,
  hearing_requested_flag              INTEGER NOT NULL DEFAULT 0,
  hearing_held_flag                   INTEGER NOT NULL DEFAULT 0,
  reasoned_refusal_flag               INTEGER NOT NULL DEFAULT 0,
  procedural_irregularity_flag        INTEGER NOT NULL DEFAULT 0,

  -- Council determination
  determination_liable_flag           INTEGER,
  determination_basis                 TEXT,
  determination_date                  TEXT,

  -- Recovery / enforcement
  enforcement_step                    TEXT CHECK (enforcement_step IN (
    'none','demand_letter','writ_issued','sheriff_attachment',
    'garnishee','contempt_application'
  )),
  enforcement_step_at                 TEXT,
  payment_due_date                    TEXT,
  days_overdue                        INTEGER NOT NULL DEFAULT 0,

  -- Appeal
  appeal_filed_at                     TEXT,
  appeal_forum                        TEXT,
  appeal_outcome                      TEXT,

  -- Repeat-offender history (denormalised for live battery)
  prior_penalty_count                 INTEGER NOT NULL DEFAULT 0,
  days_since_last_penalty             INTEGER,

  -- Refs
  serve_ref                           TEXT,
  hearing_ref                         TEXT,
  determination_ref                   TEXT,
  penalty_ref                         TEXT,
  payment_ref                         TEXT,
  appeal_ref                          TEXT,
  enforcement_ref                     TEXT,
  regulator_ref                       TEXT,

  -- Narrative
  allegations_basis                   TEXT,
  determination_summary               TEXT,
  penalty_basis                       TEXT,
  appeal_basis                        TEXT,
  enforcement_basis                   TEXT,
  reason_code                         TEXT,

  -- State + lifecycle (12 status states + cancelled handled via withdrawn)
  chain_status                        TEXT NOT NULL CHECK (chain_status IN (
    'case_opened','allegations_drafted','allegations_served',
    'representations_period','hearing_held','determination',
    'penalty_imposed','paid','appealed','enforced_via_court',
    'dismissed','withdrawn'
  )),
  case_opened_at                      TEXT NOT NULL,
  allegations_drafted_at              TEXT,
  allegations_served_at               TEXT,
  representations_period_at           TEXT,
  hearing_held_at                     TEXT,
  determination_at                    TEXT,
  penalty_imposed_at                  TEXT,
  paid_at                             TEXT,
  appealed_at                         TEXT,
  enforced_via_court_at               TEXT,
  dismissed_at                        TEXT,
  withdrawn_at                        TEXT,

  is_reportable                       INTEGER NOT NULL DEFAULT 0,
  sla_deadline_at                     TEXT,
  last_sla_breach_at                  TEXT,
  escalation_level                    INTEGER NOT NULL DEFAULT 0,

  created_by                          TEXT NOT NULL,
  created_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_enf_act_status      ON oe_enforcement_actions(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_tier        ON oe_enforcement_actions(penalty_tier);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_respondent  ON oe_enforcement_actions(respondent_party_id);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_class       ON oe_enforcement_actions(allegation_class);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_opened      ON oe_enforcement_actions(case_opened_at);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_sla         ON oe_enforcement_actions(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_persona     ON oe_enforcement_actions(respondent_persona);

CREATE TABLE IF NOT EXISTS oe_enforcement_actions_events (
  id            TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  from_status   TEXT,
  to_status     TEXT,
  actor_id      TEXT,
  actor_party   TEXT,
  notes         TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_enf_act_events_c    ON oe_enforcement_actions_events(case_id);
CREATE INDEX IF NOT EXISTS idx_oe_enf_act_events_type ON oe_enforcement_actions_events(event_type);
