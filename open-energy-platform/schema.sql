-- New tables for procurement
CREATE TABLE IF NOT EXISTS rfp_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  requirements TEXT,
  budget_min REAL,
  budget_max REAL,
  deadline TEXT,
  project_type TEXT DEFAULT 'ppa',
  visibility TEXT DEFAULT 'public',
  status TEXT DEFAULT 'open',
  creator_id TEXT,
  awarded_to TEXT,
  awarded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (creator_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS rfp_bids (
  id TEXT PRIMARY KEY,
  rfp_id TEXT NOT NULL,
  bidder_id TEXT NOT NULL,
  proposed_price REAL NOT NULL,
  proposed_terms TEXT,
  timeline TEXT,
  experience TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (rfp_id) REFERENCES rfp_requests(id),
  FOREIGN KEY (bidder_id) REFERENCES participants(id)
);

-- New tables for dealroom
CREATE TABLE IF NOT EXISTS deal_proposals (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  proposer_id TEXT NOT NULL,
  terms TEXT,
  commentary TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (contract_id) REFERENCES contract_documents(id),
  FOREIGN KEY (proposer_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS deal_messages (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (contract_id) REFERENCES contract_documents(id),
  FOREIGN KEY (sender_id) REFERENCES participants(id)
);

-- Module access table
CREATE TABLE IF NOT EXISTS platform_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(participant_id, module_id),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

-- POPIA tables
CREATE TABLE IF NOT EXISTS popia_consents (
  participant_id TEXT PRIMARY KEY,
  marketing INTEGER DEFAULT 0,
  data_sharing INTEGER DEFAULT 0,
  third_party INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS popia_erasure_requests (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  requested_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

-- Ona integration tables
CREATE TABLE IF NOT EXISTS ona_meters (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  meter_number TEXT,
  location TEXT,
  capacity_kw REAL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS ona_readings (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL,
  reading_time TEXT,
  generation_kwh REAL,
  consumption_kwh REAL,
  FOREIGN KEY (meter_id) REFERENCES ona_meters(id)
);

CREATE TABLE IF NOT EXISTS ona_forecasts (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL,
  forecast_date TEXT,
  predicted_generation_kwh REAL,
  confidence REAL,
  FOREIGN KEY (meter_id) REFERENCES ona_meters(id)
);

CREATE TABLE IF NOT EXISTS ona_faults (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL,
  fault_type TEXT,
  severity TEXT,
  detected_at TEXT,
  resolved_at TEXT,
  acknowledged INTEGER DEFAULT 0,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  FOREIGN KEY (meter_id) REFERENCES ona_meters(id)
);

CREATE TABLE IF NOT EXISTS ona_maintenance (
  id TEXT PRIMARY KEY,
  meter_id TEXT NOT NULL,
  scheduled_date TEXT,
  maintenance_type TEXT,
  description TEXT,
  FOREIGN KEY (meter_id) REFERENCES ona_meters(id)
);

-- ESG Reports table
CREATE TABLE IF NOT EXISTS esg_reports (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT,
  period_start TEXT,
  period_end TEXT,
  status TEXT DEFAULT 'generating',
  narrative TEXT,
  r2_key TEXT,
  generated_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);
