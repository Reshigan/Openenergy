-- W208: Support SLA Escalation & Customer Satisfaction (CSAT) Lifecycle
-- ITIL 4 CSM + ISO 20000-1 CSI
CREATE TABLE IF NOT EXISTS oe_csat_records (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,   -- support requestor / customer
  ticket_id               TEXT,            -- reference to oe_support_tickets (W14)
  support_tier            TEXT NOT NULL CHECK(support_tier IN ('p1_critical','p2_high','p3_medium','p4_low')),
  resolved_at             TEXT,            -- when the ticket was resolved

  -- Survey
  survey_sent_at          TEXT,
  survey_expires_at       TEXT,
  survey_responded_at     TEXT,
  csat_score              INTEGER CHECK(csat_score BETWEEN 1 AND 5 OR csat_score IS NULL),
  csat_comment            TEXT,

  -- Follow-up
  follow_up_reason        TEXT,            -- why follow-up was needed
  follow_up_sent_at       TEXT,
  follow_up_responded_at  TEXT,
  follow_up_score         INTEGER CHECK(follow_up_score BETWEEN 1 AND 5 OR follow_up_score IS NULL),

  -- Escalation
  escalation_reason       TEXT,
  escalated_at            TEXT,
  escalation_resolved_at  TEXT,
  escalation_resolution   TEXT,

  -- Aggregate
  resolution_time_minutes INTEGER,        -- actual resolution time
  sla_target_minutes      INTEGER,        -- SLA target for this tier
  sla_met                 INTEGER,        -- 0/1

  chain_status            TEXT NOT NULL DEFAULT 'survey_pending' CHECK(chain_status IN (
    'survey_pending','survey_sent','survey_completed','score_analysis',
    'follow_up_sent','follow_up_received','escalated',
    'closed_satisfied','closed_escalated','no_response'
  )),
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,

  actor_id                TEXT,
  reason                  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_csat_status
  ON oe_csat_records(chain_status);

CREATE INDEX IF NOT EXISTS idx_csat_participant
  ON oe_csat_records(participant_id);

CREATE INDEX IF NOT EXISTS idx_csat_ticket
  ON oe_csat_records(ticket_id);
