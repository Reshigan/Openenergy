-- W224: IPP Grid Technical Interface Agreement (GTIA)
-- NERSA Grid Code §C-4: protection/SCADA/metering interface between IPP and SO
CREATE TABLE IF NOT EXISTS oe_gtia (
  id                          TEXT PRIMARY KEY,
  participant_id              TEXT NOT NULL,   -- IPP submitting the GTIA

  -- Classification
  gtia_tier                   TEXT NOT NULL CHECK(gtia_tier IN (
    'small','medium','large','bulk'
  )),
  project_ref                 TEXT,            -- W1 IPP-PM project reference
  gca_ref                     TEXT,            -- W28 grid connection agreement ref
  capacity_ref                TEXT,            -- W58 capacity allocation ref
  installed_capacity_mw       REAL,
  connection_voltage_kv       REAL,
  connection_type             TEXT CHECK(connection_type IN (
    'transmission','sub_transmission','distribution','embedded',NULL
  )),
  network_operator_name       TEXT,            -- SO or DSO name

  -- Technical interface details
  protection_relay_type       TEXT,
  protection_settings_ref     TEXT,            -- approved protection settings document
  scada_protocol              TEXT CHECK(scada_protocol IN (
    'iec61850','dnp3','modbus','iec104','proprietary',NULL
  )),
  scada_point_list_ref        TEXT,
  metering_class              TEXT,
  metering_standards_ref      TEXT,

  -- Timeline
  queries_raised_at           TEXT,
  queries_responded_at        TEXT,
  ipp_approved_at             TEXT,
  so_review_commenced_at      TEXT,
  protection_agreed_at        TEXT,
  scada_agreed_at             TEXT,
  gtia_executed_at            TEXT,

  -- Rejection
  rejection_party             TEXT CHECK(rejection_party IN ('ipp','so',NULL)),
  rejection_reason            TEXT,
  rejected_at                 TEXT,

  chain_status                TEXT NOT NULL DEFAULT 'gtia_initiated' CHECK(chain_status IN (
    'gtia_initiated','ipp_under_review','queries_raised','queries_responded',
    'ipp_approved','so_under_review','protection_settings_agreed',
    'scada_interface_agreed','gtia_executed',
    'ipp_rejected','so_rejected','withdrawn'
  )),
  sla_deadline                TEXT NOT NULL,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  regulator_notified          INTEGER NOT NULL DEFAULT 0,

  actor_id                    TEXT,
  reason                      TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gtia_status
  ON oe_gtia(chain_status);

CREATE INDEX IF NOT EXISTS idx_gtia_participant
  ON oe_gtia(participant_id);

CREATE INDEX IF NOT EXISTS idx_gtia_gca
  ON oe_gtia(gca_ref);
