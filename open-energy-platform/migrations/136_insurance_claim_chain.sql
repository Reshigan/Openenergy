-- Wave 23: Insurance claim chain (FSCA Section 38)
-- 10-state P6 lifecycle for insurance claims on financed/insured assets
-- Tiers: catastrophic ≥R50m, major ≥R10m, minor ≥R500k, small <R500k

CREATE TABLE IF NOT EXISTS oe_insurance_claim_chain (
  id                       TEXT PRIMARY KEY,
  claim_number             TEXT NOT NULL UNIQUE,
  project_id               TEXT,
  facility_id              TEXT,
  participant_id           TEXT NOT NULL,
  insurer_name             TEXT NOT NULL,
  policy_number            TEXT NOT NULL,
  cover_type               TEXT NOT NULL,            -- 'pd_bi', 'cargo', 'liability', 'force_majeure', 'cyber'
  incident_type            TEXT NOT NULL,            -- 'fire', 'lightning', 'flood', 'theft', 'mechanical', 'cyber_intrusion', 'business_interruption'
  incident_date            TEXT NOT NULL,
  asset_description        TEXT NOT NULL,
  claim_value_zar          REAL NOT NULL,            -- claimed amount
  claim_value_tier         TEXT NOT NULL,            -- catastrophic|major|minor|small
  agreed_value_zar         REAL,                     -- adjuster-agreed quantum
  settled_value_zar        REAL,                     -- actual payout
  excess_zar               REAL,
  loss_adjuster_name       TEXT,
  loss_adjuster_ref        TEXT,
  fsca_report_ref          TEXT,                     -- FSCA Section 38 large-loss filing
  reinsurance_layer        TEXT,                     -- 'primary', 'excess_layer_1', etc
  chain_status             TEXT NOT NULL,            -- notified|assessing|adjuster_assigned|quantum_proposed|quantum_agreed|disputed|settled|declined|closed|withdrawn
  notified_at              TEXT,
  assessing_at             TEXT,
  adjuster_assigned_at     TEXT,
  quantum_proposed_at      TEXT,
  quantum_agreed_at        TEXT,
  disputed_at              TEXT,
  resolved_at              TEXT,
  settled_at               TEXT,
  declined_at              TEXT,
  closed_at                TEXT,
  withdrawn_at             TEXT,
  decline_reason           TEXT,
  withdrawal_reason        TEXT,
  dispute_notes            TEXT,
  claim_notes              TEXT,
  sla_deadline_at          TEXT,
  last_sla_breach_at       TEXT,
  escalation_level         INTEGER NOT NULL DEFAULT 0,
  created_by               TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_insclaim_status   ON oe_insurance_claim_chain(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_tier     ON oe_insurance_claim_chain(claim_value_tier);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_part     ON oe_insurance_claim_chain(participant_id);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_proj     ON oe_insurance_claim_chain(project_id);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_fac      ON oe_insurance_claim_chain(facility_id);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_sla      ON oe_insurance_claim_chain(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_incident ON oe_insurance_claim_chain(incident_date);

CREATE TABLE IF NOT EXISTS oe_insurance_claim_chain_events (
  id              TEXT PRIMARY KEY,
  claim_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  actor_id        TEXT,
  notes           TEXT,
  payload         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oe_insclaim_evt_claim ON oe_insurance_claim_chain_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_oe_insclaim_evt_time  ON oe_insurance_claim_chain_events(created_at);
