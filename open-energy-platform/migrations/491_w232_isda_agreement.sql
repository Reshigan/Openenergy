-- W232: Trader ISDA Master Agreement & CSA Negotiation
-- ISDA 2002 Master Agreement + 2016 VM CSA + SARB D3/2023 (Uncleared Margin Rules)
-- Governs OTC energy-derivative exposure between platform participants

CREATE TABLE IF NOT EXISTS oe_isda_agreements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  initiator_id TEXT NOT NULL,  -- trader/admin that opened
  counterparty_id TEXT NOT NULL,  -- other party entity_id
  counterparty_name TEXT NOT NULL,
  counterparty_type TEXT NOT NULL CHECK (counterparty_type IN ('domestic_bank','foreign_bank','broker_dealer','ccpcentral','corporate','sfp')),
  agreement_type TEXT NOT NULL CHECK (agreement_type IN ('isda_2002','isda_1992','isda_2002_with_csa','isda_2002_with_vm_csa')),
  -- Tier drives SLA (INVERTED: larger exposure = longer review)
  counterparty_tier TEXT NOT NULL CHECK (counterparty_tier IN ('bilateral_small','bilateral_medium','bilateral_large','systemic')),
  base_currency TEXT NOT NULL DEFAULT 'ZAR',
  -- VM CSA fields
  vm_csa_included INTEGER NOT NULL DEFAULT 0,
  vm_threshold_zar REAL,
  vm_mta_zar REAL,
  eligible_collateral TEXT,  -- JSON array
  -- UMR (SARB D3/2023)
  umr_applicable INTEGER NOT NULL DEFAULT 0,
  average_notional_zar REAL,  -- 3yr average for UMR phase-in
  -- Legal opinion
  netting_opinion_obtained INTEGER NOT NULL DEFAULT 0,
  netting_opinion_date TEXT,
  netting_opinion_counsel TEXT,
  -- SA Act 32 of 2004 / FICA
  fic_fica_confirmed INTEGER NOT NULL DEFAULT 0,
  -- Status tracking
  chain_status TEXT NOT NULL DEFAULT 'draft' CHECK (chain_status IN (
    'draft','term_sheet_issued','counterparty_review','negotiation',
    'credit_terms_agreed','legal_review','regulatory_notification',
    'executed','active','amendment_requested','terminated','suspended'
  )),
  reason_code TEXT,
  reason_detail TEXT,
  -- SLA
  sla_deadline TEXT,
  -- Amendment tracking
  amendment_number INTEGER NOT NULL DEFAULT 0,
  amendment_reason TEXT,
  -- Audit
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_isda_tenant ON oe_isda_agreements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_isda_status ON oe_isda_agreements(chain_status);
CREATE INDEX IF NOT EXISTS idx_isda_counterparty ON oe_isda_agreements(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_isda_tier ON oe_isda_agreements(counterparty_tier);
