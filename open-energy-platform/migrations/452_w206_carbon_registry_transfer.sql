-- W206: Carbon Registry Transfer & International Registry Notification
-- UNFCCC Art 6.2 + Verra VCUS + Gold Standard + CORSIA
CREATE TABLE IF NOT EXISTS oe_carbon_registry_transfers (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,   -- transferor
  counterparty_id         TEXT,            -- transferee (if on platform)
  transfer_type           TEXT NOT NULL CHECK(transfer_type IN ('domestic','international_art6','corsia','voluntary_crossregistry')),

  -- Credit details
  serial_range_start      TEXT,
  serial_range_end        TEXT,
  quantity_tco2e          REAL NOT NULL,
  vintage_year            INTEGER,
  project_id              TEXT,            -- linked carbon project
  methodology             TEXT,

  -- Registry details
  source_registry         TEXT,            -- 'verra', 'gold_standard', 'isimangaliso', 'dffe'
  destination_registry    TEXT,
  source_account          TEXT,
  destination_account     TEXT,

  -- AML/KYC
  aml_check_ref           TEXT,
  aml_check_passed_at     TEXT,
  aml_rejection_reason    TEXT,

  -- Registry authorization
  registry_auth_ref       TEXT,
  authorized_at           TEXT,
  registry_rejection_reason TEXT,

  -- Transfer tracking
  transfer_initiated_at   TEXT,
  receipt_confirmed_at    TEXT,
  transfer_certificate_ref TEXT,

  -- Corresponding adjustment (Art 6.2)
  ca_required             INTEGER DEFAULT 0,  -- 1 if international_art6 or corsia
  unfccc_notification_ref TEXT,
  dna_notification_ref    TEXT,
  ca_notified_at          TEXT,

  chain_status            TEXT NOT NULL DEFAULT 'transfer_requested' CHECK(chain_status IN (
    'transfer_requested','aml_kyc_check','aml_kyc_passed','registry_review',
    'authorized','transfer_in_flight','destination_receipt','ca_notation_required',
    'ca_notified','completed','aml_rejected','registry_rejected','cancelled'
  )),
  sla_deadline            TEXT NOT NULL,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  regulator_notified      INTEGER NOT NULL DEFAULT 0,

  actor_id                TEXT,
  reason                  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crt_status
  ON oe_carbon_registry_transfers(chain_status);

CREATE INDEX IF NOT EXISTS idx_crt_participant
  ON oe_carbon_registry_transfers(participant_id);

CREATE INDEX IF NOT EXISTS idx_crt_project
  ON oe_carbon_registry_transfers(project_id);
