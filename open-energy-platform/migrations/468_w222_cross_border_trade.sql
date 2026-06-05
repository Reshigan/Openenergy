-- W222: Trader Cross-Border Transaction & Regulatory Pre-Approval
-- FMA §17 + SARB ExCon / Currency & Exchanges Act — cross-border energy trade pre-approval
CREATE TABLE IF NOT EXISTS oe_cross_border_trades (
  id                        TEXT PRIMARY KEY,
  participant_id            TEXT NOT NULL,   -- trader submitting for pre-approval

  -- Transaction classification
  cbt_tier                  TEXT NOT NULL CHECK(cbt_tier IN (
    'small','standard','large','systemic'
  )),
  counterparty_jurisdiction TEXT,            -- ISO 3166 country code
  counterparty_type         TEXT CHECK(counterparty_type IN (
    'non_resident_firm','foreign_gov','multilateral','sadc_member','eu_firm','other',NULL
  )),
  trade_type                TEXT CHECK(trade_type IN (
    'spot_energy','forward_contract','option','swap','emissions_credit',NULL
  )),
  notional_zar              REAL,
  notional_currency         TEXT DEFAULT 'ZAR',

  -- Underlying references
  underlying_trade_ref      TEXT,            -- linked trade from W44
  algo_cert_ref             TEXT,            -- W60 algo certification if algorithmic

  -- FSCA approval
  fsca_application_ref      TEXT,
  fsca_submitted_at         TEXT,
  fsca_review_started_at    TEXT,
  fsca_approval_ref         TEXT,
  fsca_approved_at          TEXT,
  fsca_rejection_reason     TEXT,

  -- SARB ExCon approval
  sarb_application_ref      TEXT,
  sarb_submitted_at         TEXT,
  sarb_review_started_at    TEXT,
  sarb_approval_ref         TEXT,
  sarb_approved_at          TEXT,
  sarb_rejection_reason     TEXT,

  -- Execution
  trade_executed_at         TEXT,
  trade_settlement_date     TEXT,

  chain_status              TEXT NOT NULL DEFAULT 'pre_approval_required' CHECK(chain_status IN (
    'pre_approval_required','fsca_application','sarb_excon_application',
    'fsca_under_review','sarb_under_review','fsca_approved','fully_approved',
    'trade_executed','fsca_rejected','sarb_rejected','withdrawn','expired'
  )),
  sla_deadline              TEXT NOT NULL,
  sla_breached              INTEGER NOT NULL DEFAULT 0,
  regulator_notified        INTEGER NOT NULL DEFAULT 0,

  actor_id                  TEXT,
  reason                    TEXT,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cbt_status
  ON oe_cross_border_trades(chain_status);

CREATE INDEX IF NOT EXISTS idx_cbt_participant
  ON oe_cross_border_trades(participant_id);

CREATE INDEX IF NOT EXISTS idx_cbt_jurisdiction
  ON oe_cross_border_trades(counterparty_jurisdiction);
