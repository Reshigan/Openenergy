-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 13 — Grid operator dispatch nomination chain (P6).
--
-- Wraps the day-ahead BRP nomination → SO acceptance → activation →
-- performance → settlement workflow as a P6 audit chain so NERSA Grid Code
-- compliance and inter-participant disputes have a tamper-evident timeline.
--
-- One row per (participant_id, trading_day) — the natural unit of a
-- nomination submission. References participants(id). Underlying period
-- detail still lives in dispatch_schedule_periods + brp_period_nominations;
-- this table is the lifecycle wrapper, not a replacement.
--
-- States (8): nominated → accepted → activated → performance_recorded →
-- settled → closed, plus terminal nomination_rejected and dispute branches
-- (disputed → resolved → closed_disputed).
--
-- Per-stage SLAs (post-NERSA System Operations Code):
--   nominated → accepted              : 15 minutes (SO must ACK/reject)
--   accepted → activated              : 30 minutes (pre-gate-closure publish)
--   activated → performance_recorded  : 60 minutes post-delivery-end
--   performance_recorded → settled    : 5 days (incl. dispute window open)
--   settled → closed                  : 15 days (assumes no dispute raised)
--   dispute_raised → dispute_resolved : 10 days
--
-- INSERT OR IGNORE + per-column ALTERs make this idempotent for the
-- irregular-band deploy ledger.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS oe_dispatch_nominations (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  trading_day TEXT NOT NULL,                     -- YYYY-MM-DD
  schedule_type TEXT DEFAULT 'day_ahead'
    CHECK (schedule_type IN ('day_ahead','intra_day','re_nomination','balancing')),
  scheduled_mwh REAL,                            -- total nominated MWh
  actual_mwh REAL,                               -- total delivered MWh
  imbalance_mwh REAL,                            -- actual - scheduled
  charge_zar REAL,                               -- imbalance settlement charge
  nomination_status TEXT NOT NULL DEFAULT 'nominated'
    CHECK (nomination_status IN (
      'nominated','accepted','activated','performance_recorded',
      'settled','closed','nomination_rejected',
      'disputed','dispute_resolved','closed_disputed'
    )),
  rejection_reason TEXT,
  dispute_reason TEXT,
  dispute_resolution TEXT,
  -- Stage timestamps (audit chain timeline)
  nominated_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  activated_at TEXT,
  performance_recorded_at TEXT,
  settled_at TEXT,
  closed_at TEXT,
  rejected_at TEXT,
  dispute_raised_at TEXT,
  dispute_resolved_at TEXT,
  -- SLA bookkeeping
  next_sla_due_at TEXT,
  last_sla_breach_at TEXT,
  -- Actor + audit
  submitted_by TEXT,
  accepted_by TEXT,
  activated_by TEXT,
  settled_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (participant_id, trading_day, schedule_type)
);

CREATE INDEX IF NOT EXISTS idx_oe_disp_noms_status ON oe_dispatch_nominations(nomination_status);
CREATE INDEX IF NOT EXISTS idx_oe_disp_noms_part_day ON oe_dispatch_nominations(participant_id, trading_day);
CREATE INDEX IF NOT EXISTS idx_oe_disp_noms_sla ON oe_dispatch_nominations(next_sla_due_at) WHERE next_sla_due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS oe_dispatch_nomination_events (
  id TEXT PRIMARY KEY,
  nomination_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'nominated','accepted','activated','performance_recorded',
    'settled','closed','nomination_rejected',
    'dispute_raised','dispute_resolved','closed_disputed',
    'sla_breached','note'
  )),
  from_status TEXT,
  to_status TEXT,
  actor_id TEXT,
  notes TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_disp_noms_evt_nom ON oe_dispatch_nomination_events(nomination_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oe_disp_noms_evt_type ON oe_dispatch_nomination_events(event_type);
