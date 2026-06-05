-- W205: Grid Demand-Response Programme Participation & Settlement
-- NERSA Grid Code §CSC + NTCSA DSR + IEC 61968 DR Interface
CREATE TABLE IF NOT EXISTS oe_demand_response_events (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,   -- the offtaker / large consumer
  operator_id             TEXT,            -- grid operator (SO) participant
  dr_programme            TEXT NOT NULL CHECK(dr_programme IN ('real_time','day_ahead','interruptible_tariff','frequency_response')),
  activation_ref          TEXT,            -- SO activation instruction ref
  event_date              TEXT NOT NULL,   -- ISO date of the DR event

  -- Notification
  notification_type       TEXT CHECK(notification_type IN ('day_ahead','real_time','test') OR notification_type IS NULL),
  notification_sent_at    TEXT,
  acknowledged_at         TEXT,

  -- Activation
  activated_at            TEXT,
  activation_start        TEXT,
  activation_end          TEXT,
  requested_mw            REAL,            -- MW of curtailment requested

  -- Performance
  actual_mw_shed          REAL,            -- metered MW actually shed
  metering_ref            TEXT,
  verified_at             TEXT,
  performance_pct         REAL,            -- actual/requested * 100

  -- Settlement
  incentive_rate_per_mw   REAL,            -- ZAR per MW
  incentive_amount_zar    REAL,
  non_performance_penalty_zar REAL,
  dispute_description     TEXT,
  settlement_ref          TEXT,
  settled_at              TEXT,

  chain_status            TEXT NOT NULL DEFAULT 'registered' CHECK(chain_status IN (
    'registered','notification_sent','acknowledged','activated','load_shed',
    'performance_metering','performance_verified','settlement_calc',
    'settlement_agreed','settlement_disputed','settled','non_performance','cancelled'
  )),
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,

  actor_id                TEXT,
  reason                  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dr_events_status
  ON oe_demand_response_events(chain_status);

CREATE INDEX IF NOT EXISTS idx_dr_events_participant
  ON oe_demand_response_events(participant_id);

CREATE INDEX IF NOT EXISTS idx_dr_events_date
  ON oe_demand_response_events(event_date);
