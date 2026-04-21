-- ============================================================================
-- OPEN ENERGY PLATFORM - CORE SCHEMA
-- Migration 001: Auth, Contracts, Trading, Settlement, Platform
-- ============================================================================

-- PARTICIPANTS & AUTH
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  company_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','ipp_developer','trader','carbon_fund','offtaker','lender','grid_operator','regulator')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','rejected')),
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending','in_review','approved','rejected')),
  bbbee_level INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
  subscription_tier TEXT DEFAULT 'starter' CHECK (subscription_tier IN ('free','starter','professional','enterprise')),
  tenant_id TEXT DEFAULT 'default',
  email_verified INTEGER DEFAULT 0,
  otp_code TEXT,
  otp_expires_at TEXT,
  last_login TEXT,
  onboarding_completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

--- CONTRACT DOCUMENTS ----
CREATE TABLE IF NOT EXISTS contract_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'loi','term_sheet','hoa','ppa_wheeling','ppa_btm','carbon_purchase',
    'carbon_option_isda','forward','epc','wheeling_agreement','offtake_agreement','nda'
  )),
  phase TEXT DEFAULT 'draft' CHECK (phase IN (
    'draft','loi','term_sheet','hoa','draft_agreement','legal_review',
    'statutory_check','execution','active','amended','terminated','expired'
  )),
  creator_id TEXT NOT NULL REFERENCES participants(id),
  counterparty_id TEXT NOT NULL REFERENCES participants(id),
  project_id TEXT,
  commercial_terms TEXT,
  r2_key TEXT,
  integrity_seal TEXT,
  template_id TEXT,
  version TEXT DEFAULT 'v1.0',
  tenant_id TEXT DEFAULT 'default',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_signatories (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES contract_documents(id),
  participant_id TEXT NOT NULL REFERENCES participants(id),
  signatory_name TEXT,
  signatory_designation TEXT,
  signed INTEGER DEFAULT 0,
  signed_at TEXT,
  signature_r2_key TEXT,
  document_hash_at_signing TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS statutory_checks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES contract_documents(id),
  check_type TEXT NOT NULL CHECK (check_type IN ('external_legal','board_approval','shareholder','regulator_nersa','competition','foreign_exchange','other')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','approved','rejected','waived')),
  assigned_to TEXT,
  due_date TEXT,
  result TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

--- TRADING ----
CREATE TABLE IF NOT EXISTS trade_orders (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  energy_type TEXT NOT NULL,
  volume_mwh REAL NOT NULL,
  price_min REAL,
  price_max REAL,
  delivery_date TEXT,
  delivery_point TEXT,
  market_type TEXT DEFAULT 'bilateral' CHECK (market_type IN ('bilateral','exchange','spot','derivatives')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','matched','partial','cancelled','expired','closed')),
  parent_order_id TEXT REFERENCES trade_orders(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trade_matches (
  id TEXT PRIMARY KEY,
  buy_order_id TEXT NOT NULL REFERENCES trade_orders(id),
  sell_order_id TEXT NOT NULL REFERENCES trade_orders(id),
  matched_volume_mwh REAL NOT NULL,
  matched_price REAL NOT NULL,
  matched_at TEXT DEFAULT (datetime('now')),
  settlement_id TEXT,
  escrow_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','settling','settled','disputed','cancelled'))
);

CREATE TABLE IF NOT EXISTS trade_history (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES trade_matches(id),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES participants(id),
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

--- ESCROW ----
CREATE TABLE IF NOT EXISTS escrow_accounts (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES trade_matches(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'held' CHECK (status IN ('held','released','refunded','disputed','claim')),
  release_conditions TEXT,
  held_by TEXT,
  release_at TEXT,
  released_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS escrow_movements (
  id TEXT PRIMARY KEY,
  escrow_id TEXT NOT NULL REFERENCES escrow_accounts(id),
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit','release','refund','claim','interest')),
  reference TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

--- SETTLEMENT & INVOICING ----
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  match_id TEXT REFERENCES trade_matches(id),
  project_id TEXT,
  from_participant_id TEXT NOT NULL REFERENCES participants(id),
  to_participant_id TEXT NOT NULL REFERENCES participants(id),
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('energy','capacity','carbon','ancillary','balancing','disbursement','management')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  line_items TEXT NOT NULL,
  subtotal REAL NOT NULL,
  vat_rate REAL DEFAULT 0.15,
  vat_amount REAL NOT NULL,
  total_amount REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','issued','viewed','paid','partial','overdue','cancelled','disputed')),
  due_date TEXT NOT NULL,
  issued_at TEXT,
  paid_at TEXT,
  paid_amount REAL DEFAULT 0,
  r2_invoice_key TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  payment_reference TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'ZAR',
  payment_method TEXT CHECK (payment_method IN ('eft','swift','rtgs','internal')),
  payment_date TEXT NOT NULL,
  bank_reference TEXT,
  reconciled INTEGER DEFAULT 0,
  reconciled_by TEXT,
  reconciled_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settlement_disputes (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  filed_by TEXT NOT NULL REFERENCES participants(id),
  reason TEXT NOT NULL,
  evidence_keys TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','rejected')),
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

--- DELIVERY SCHEDULE ----
CREATE TABLE IF NOT EXISTS delivery_schedule (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES trade_matches(id),
  scheduled_date TEXT NOT NULL,
  scheduled_volume_mwh REAL NOT NULL,
  actual_volume_mwh REAL,
  variance_percent REAL,
  delivery_point TEXT,
  meter_reading_key TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','nomination','confirmed','delivered','disputed','short_delivery')),
  quality_inspection TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

--- PLATFORM CONFIGURATION ----
CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  module_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER DEFAULT 1,
  required_role TEXT,
  price_monthly REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES participants(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  changes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  data TEXT,
  read INTEGER DEFAULT 0,
  email_sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  parent_id TEXT,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS action_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  actor_id TEXT REFERENCES participants(id),
  assignee_id TEXT REFERENCES participants(id),
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  due_date TEXT,
  completed_at TEXT,
  completed_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS intelligence_items (
  id TEXT PRIMARY KEY,
  participant_id TEXT REFERENCES participants(id),
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  title TEXT NOT NULL,
  description TEXT,
  entity_type TEXT,
  entity_id TEXT,
  action_required TEXT,
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_role ON participants(role);
CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);
CREATE INDEX IF NOT EXISTS idx_contract_documents_creator ON contract_documents(creator_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_counterparty ON contract_documents(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_phase ON contract_documents(phase);
CREATE INDEX IF NOT EXISTS idx_trade_orders_participant ON trade_orders(participant_id);
CREATE INDEX IF NOT EXISTS idx_trade_orders_status ON trade_orders(status);
CREATE INDEX IF NOT EXISTS idx_trade_matches_status ON trade_matches(status);
CREATE INDEX IF NOT EXISTS idx_invoices_from ON invoices(from_participant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_to ON invoices(to_participant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_notifications_participant ON notifications(participant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_threads_entity ON threads(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_action_queue_status ON action_queue(status);
CREATE INDEX IF NOT EXISTS idx_intelligence_resolved ON intelligence_items(resolved);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);