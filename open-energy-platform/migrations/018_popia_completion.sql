-- 018_popia_completion.sql
-- PR-Prod-9 — complete POPIA (Protection of Personal Information Act 4 of 2013)
-- coverage: Section 11(3) Right to Object, Section 24 Right to Correction,
-- Section 22 Security Compromise (Breach) notification register.

-- Section 11(3): subject objects to a specific processing purpose.
CREATE TABLE IF NOT EXISTS popia_objections (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  processing_purpose TEXT NOT NULL,
  grounds TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','upheld','rejected','withdrawn')),
  processed_by TEXT REFERENCES participants(id),
  processed_at TEXT,
  resolution_notes TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_popia_objection_status ON popia_objections(status);
CREATE INDEX IF NOT EXISTS idx_popia_objection_participant ON popia_objections(participant_id);

-- Section 24 (correction arm): subject asks for personal info to be corrected.
-- Distinct from erasure: subject wants an edit, not deletion.
CREATE TABLE IF NOT EXISTS popia_corrections (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES participants(id),
  field_name TEXT NOT NULL,
  current_value TEXT,
  requested_value TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','rejected','withdrawn')),
  processed_by TEXT REFERENCES participants(id),
  processed_at TEXT,
  resolution_notes TEXT,
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_popia_correction_status ON popia_corrections(status);
CREATE INDEX IF NOT EXISTS idx_popia_correction_participant ON popia_corrections(participant_id);

-- Section 22: register of security compromises. DPO/admin logs incidents,
-- tracks notification to the Information Regulator and affected data subjects.
CREATE TABLE IF NOT EXISTS popia_breaches (
  id TEXT PRIMARY KEY,
  discovered_at TEXT NOT NULL,
  reported_by TEXT REFERENCES participants(id),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  category TEXT NOT NULL, -- e.g. 'unauthorised_access', 'data_loss', 'malware', 'misdelivery', 'other'
  description TEXT NOT NULL,
  affected_subjects_count INTEGER DEFAULT 0,
  affected_data_categories TEXT, -- JSON array
  containment_actions TEXT,
  regulator_notified_at TEXT,
  subjects_notified_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','contained','closed')),
  root_cause TEXT,
  lessons_learned TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_popia_breach_status ON popia_breaches(status);
CREATE INDEX IF NOT EXISTS idx_popia_breach_severity ON popia_breaches(severity);
CREATE INDEX IF NOT EXISTS idx_popia_breach_discovered ON popia_breaches(discovered_at);

-- PII access log: who viewed a subject's personal data (DSAR exports, support
-- impersonations, admin participant views). Supports audit under Section 19.
CREATE TABLE IF NOT EXISTS popia_pii_access_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES participants(id),
  subject_id TEXT NOT NULL REFERENCES participants(id),
  access_type TEXT NOT NULL, -- 'dsar_export', 'impersonation', 'admin_view', 'support_view'
  justification TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_popia_pii_subject ON popia_pii_access_log(subject_id);
CREATE INDEX IF NOT EXISTS idx_popia_pii_actor ON popia_pii_access_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_popia_pii_created ON popia_pii_access_log(created_at);
