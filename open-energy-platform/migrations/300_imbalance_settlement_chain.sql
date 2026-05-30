-- Wave 105 — Grid Wholesale Imbalance Settlement & MTU Pricing chain (P6).
-- 10th Grid chain. The financial settlement engine of the SO balancing
-- mechanism. Sister of W13 dispatch nominations (the PRE side — nominated
-- MWh per MTU) and W50 reserve activation (the SUPPLY side — instantaneous
-- reserve products that re-balance the system). W105 is the post-fact
-- per-MTU settlement: actual vs nominated imbalance MWh times imbalance
-- price times penalty multiplier, posted to BRPs, with a dispute-window,
-- and settled.
--
-- Beats PJM iMM Imbalance Settlement / ERCOT QSE Real-Time Settlement /
-- CAISO Imbalance Settlement / NEM AEMO Settlement Statements / Nord Pool
-- Imbalance Settlement / ENTSO-E Imbalance Settlement / National Grid ESO
-- BSC Settlement / Hitachi Energy Lumada Market Operations / Open Access
-- Technology / Powel Pulse. Every one of those surfaces imbalance
-- settlement as an after-the-fact CSV dump and a dispute mailbox. W105
-- makes it a live 12-state P6 chain with per-MTU re-pricing, dispute
-- window state machine, completeness index, urgency band, authority
-- ladder, and signature regulator crossings.
--
-- Standards: NERSA Grid Code section 11 (Settlement) + ERA section 35 +
-- NTCSA Settlement Procedures + Eskom Distribution Tariffs Schedule.
--
-- 12-state P6 lifecycle plus 4 branch states:
--   period_open -> receive_meter_data -> meter_data_received
--     -> reconcile_nominations -> nominations_reconciled
--       -> compute_imbalance -> imbalance_computed
--         -> price_imbalance -> priced
--           -> issue_invoice -> invoice_issued
--             -> acknowledge_invoice -> invoice_acknowledged
--               -> open_dispute_window -> dispute_window_open
--                 -> record_payment -> payment_pending
--                   -> mark_settled -> settled (hard terminal)
--                     -> archive_period -> archived (hard terminal)
--   dispute_window_open -> raise_dispute -> disputed
--     -> resolve_dispute -> resolved_dispute
--       -> revise_invoice -> invoice_revised
--         -> issue_invoice -> invoice_issued (re-enters)
--   invoice_issued / invoice_acknowledged / payment_pending -> aged_arrears
--   any non-terminal -> cancel_period -> cancelled (hard terminal)
--
-- Tier RE-DERIVED on every transition from imbalance_quantum_zar:
--   minor    : quantum < 100000
--   standard : 100000 <= quantum < 1000000
--   material : 1000000 <= quantum < 10000000
--   systemic : >= 10000000
-- FLOOR-AT-MATERIAL on any one of 5 floor flags. FLOOR-AT-SYSTEMIC on
-- imbalance_floor_flag_high_voltage_brp OR
-- imbalance_floor_flag_system_critical_period.
--
-- URGENT SLA polarity (higher tier = TIGHTER windows). systemic 12h /
-- material 48h / standard 7d / minor 14d on period_open.
--
-- SIGNATURE regulator crossings (NERSA Grid Code section 11 + ERA section 35
-- + NTCSA Settlement Procedures):
--   raise_dispute    -> regulator EVERY tier when high_voltage_brp=TRUE
--   mark_settled     -> regulator on material + systemic when penalty_zar > 0
--   aged_arrears     -> regulator EVERY tier when arrears_days >= 60
--   cancel_period    -> regulator EVERY tier when imbalance_mwh != 0
--   sla_breached     -> regulator on material + systemic
--
-- Write {admin, grid_operator}. Read all 9 personas. actor_party derived
-- from action: system_operator / settlement_admin / brp / reviewer /
-- archiver.

CREATE TABLE IF NOT EXISTS oe_imbalance_settlement (
  id                                                  TEXT PRIMARY KEY,
  settlement_number                                   TEXT UNIQUE NOT NULL,

  brp_id                                              TEXT NOT NULL,
  brp_label                                           TEXT,
  brp_voltage_class                                   TEXT,

  market_zone                                         TEXT,
  market_time_unit_minutes                            INTEGER NOT NULL DEFAULT 60,
  settlement_period_start_at                          TEXT NOT NULL,
  settlement_period_end_at                            TEXT NOT NULL,

  nominated_mwh                                       REAL NOT NULL DEFAULT 0,
  metered_mwh                                         REAL NOT NULL DEFAULT 0,
  imbalance_mwh                                       REAL NOT NULL DEFAULT 0,
  imbalance_direction                                 TEXT CHECK (imbalance_direction IN ('long','short','balanced')),

  long_price_zar_per_mwh                              REAL NOT NULL DEFAULT 0,
  short_price_zar_per_mwh                             REAL NOT NULL DEFAULT 0,
  price_applied_zar_per_mwh                           REAL NOT NULL DEFAULT 0,
  penalty_multiplier                                  REAL NOT NULL DEFAULT 1,

  imbalance_charge_zar                                REAL NOT NULL DEFAULT 0,
  penalty_zar                                         REAL NOT NULL DEFAULT 0,
  total_owed_zar                                      REAL NOT NULL DEFAULT 0,
  amount_paid_zar                                     REAL NOT NULL DEFAULT 0,
  amount_outstanding_zar                              REAL NOT NULL DEFAULT 0,

  imbalance_quantum_zar                               REAL NOT NULL DEFAULT 0,

  dispatch_nomination_ref                             TEXT,
  reserve_activation_ref                              TEXT,

  invoice_number                                      TEXT,
  invoice_issued_at                                   TEXT,
  invoice_due_at                                      TEXT,
  invoice_revised_count                               INTEGER NOT NULL DEFAULT 0,

  dispute_window_close_at                             TEXT,
  dispute_reason_code                                 TEXT,
  dispute_narrative                                   TEXT,
  dispute_resolution_text                             TEXT,

  payment_method                                      TEXT,
  payment_reference                                   TEXT,
  payment_received_at                                 TEXT,

  arrears_days                                        INTEGER NOT NULL DEFAULT 0,
  arrears_bucket                                      TEXT,
  aged_arrears_at                                     TEXT,

  imbalance_floor_flag_high_voltage_brp               INTEGER NOT NULL DEFAULT 0,
  imbalance_floor_flag_system_critical_period         INTEGER NOT NULL DEFAULT 0,
  imbalance_floor_flag_regulator_audit_period         INTEGER NOT NULL DEFAULT 0,
  imbalance_floor_flag_market_suspension_active       INTEGER NOT NULL DEFAULT 0,
  imbalance_floor_flag_repeated_breach_5plus          INTEGER NOT NULL DEFAULT 0,

  current_tier                                        TEXT NOT NULL CHECK (current_tier IN (
    'minor','standard','material','systemic'
  )),
  authority_required                                  TEXT CHECK (authority_required IN (
    'BRP_back_office','BRP_finance_manager','BRP_treasurer','MO_settlement_admin'
  )),
  urgency_band                                        TEXT,

  title                                               TEXT,
  narrative                                           TEXT,
  cancel_reason                                       TEXT,
  reason_code                                         TEXT,

  current_ball_in_court_party                         TEXT,
  last_responder_party                                TEXT,

  is_reportable                                       INTEGER NOT NULL DEFAULT 0,
  regulator_relevant                                  INTEGER NOT NULL DEFAULT 0,
  regulator_reason_text                               TEXT,

  chain_status                                        TEXT NOT NULL CHECK (chain_status IN (
    'period_open','meter_data_received','nominations_reconciled',
    'imbalance_computed','priced','invoice_issued','invoice_acknowledged',
    'dispute_window_open','payment_pending','settled','archived','cancelled',
    'disputed','resolved_dispute','invoice_revised','aged_arrears'
  )),
  period_opened_at                                    TEXT,
  meter_data_received_at                              TEXT,
  nominations_reconciled_at                           TEXT,
  imbalance_computed_at                               TEXT,
  priced_at                                           TEXT,
  invoice_acknowledged_at                             TEXT,
  dispute_window_opened_at                            TEXT,
  disputed_at                                         TEXT,
  resolved_dispute_at                                 TEXT,
  invoice_revised_at                                  TEXT,
  payment_pending_at                                  TEXT,
  settled_at                                          TEXT,
  archived_at                                         TEXT,
  cancelled_at                                        TEXT,

  regulator_crossed_at                                TEXT,
  regulator_inbox_ref                                 TEXT,
  regulator_ref                                       TEXT,
  sla_deadline_at                                     TEXT,
  last_sla_breach_at                                  TEXT,
  sla_breached                                        INTEGER NOT NULL DEFAULT 0,
  escalation_level                                    INTEGER NOT NULL DEFAULT 0,

  tenant_id                                           TEXT,
  created_by                                          TEXT NOT NULL,
  created_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                                          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_imb_status        ON oe_imbalance_settlement(chain_status);
CREATE INDEX IF NOT EXISTS idx_oe_imb_tier          ON oe_imbalance_settlement(current_tier);
CREATE INDEX IF NOT EXISTS idx_oe_imb_tenant        ON oe_imbalance_settlement(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oe_imb_brp           ON oe_imbalance_settlement(brp_id);
CREATE INDEX IF NOT EXISTS idx_oe_imb_period_start  ON oe_imbalance_settlement(settlement_period_start_at);
CREATE INDEX IF NOT EXISTS idx_oe_imb_sla           ON oe_imbalance_settlement(sla_deadline_at);
CREATE INDEX IF NOT EXISTS idx_oe_imb_reportable    ON oe_imbalance_settlement(is_reportable);
CREATE INDEX IF NOT EXISTS idx_oe_imb_breached      ON oe_imbalance_settlement(sla_breached);
CREATE INDEX IF NOT EXISTS idx_oe_imb_dispatch_ref  ON oe_imbalance_settlement(dispatch_nomination_ref);
CREATE INDEX IF NOT EXISTS idx_oe_imb_reserve_ref   ON oe_imbalance_settlement(reserve_activation_ref);
CREATE INDEX IF NOT EXISTS idx_oe_imb_arrears       ON oe_imbalance_settlement(arrears_days);

CREATE TABLE IF NOT EXISTS oe_imbalance_settlement_events (
  id                  TEXT PRIMARY KEY,
  settlement_id       TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  actor_id            TEXT,
  actor_party         TEXT,
  notes               TEXT,
  payload             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oe_imb_events_set  ON oe_imbalance_settlement_events(settlement_id);
CREATE INDEX IF NOT EXISTS idx_oe_imb_events_type ON oe_imbalance_settlement_events(event_type);
