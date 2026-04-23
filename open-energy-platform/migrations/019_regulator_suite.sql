-- 019_regulator_suite.sql
-- National regulator workstream: licence register, tariff determinations,
-- enforcement cases, market surveillance, published determinations (gazette).
-- Statutory basis: Electricity Regulation Act 4 of 2006 (ERA 2006) ss. 8–17
-- (licensing, tariff approval, penalties), NERSA Rules on Penalties (2018),
-- Competition Act 89 of 1998 (for cross-regulator referrals), Promotion of
-- Access to Information Act 2 of 2000 (PAIA) for public determinations.
--
-- The existing regulator_filings table (migration 017) stays as-is and covers
-- returns submitted BY licensees. This migration models the regulator's OWN
-- workflows issuing, enforcing, and publishing.

-- ─── Licence register ──────────────────────────────────────────────────────
-- One row per licence issued under ERA 2006 s.8 (generation/distribution/
-- trading/transmission/import/export). Licence conditions are tracked in a
-- 1:N child table so their individual status can be tested against generation
-- reports or tariff applications.
CREATE TABLE IF NOT EXISTS regulator_licences (
  id TEXT PRIMARY KEY,
  licence_number TEXT UNIQUE NOT NULL,
  licensee_participant_id TEXT REFERENCES participants(id),
  licensee_name TEXT NOT NULL,
  licence_type TEXT NOT NULL CHECK (licence_type IN (
    'generation','distribution','trading','transmission','import','export','reticulation'
  )),
  technology TEXT,              -- solar_pv | wind | hydro | thermal | storage | hybrid | n/a
  capacity_mw REAL DEFAULT 0,
  location TEXT,                -- e.g. 'De Aar, NC' or 'ZA-GP-02'
  issue_date TEXT NOT NULL,
  effective_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'pending','active','varied','suspended','revoked','expired','surrendered'
  )),
  notes TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_lic_licensee ON regulator_licences(licensee_participant_id);
CREATE INDEX IF NOT EXISTS idx_reg_lic_status ON regulator_licences(status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_reg_lic_type ON regulator_licences(licence_type);

CREATE TABLE IF NOT EXISTS regulator_licence_conditions (
  id TEXT PRIMARY KEY,
  licence_id TEXT NOT NULL REFERENCES regulator_licences(id) ON DELETE CASCADE,
  condition_number TEXT NOT NULL,
  condition_text TEXT NOT NULL,
  category TEXT,                -- technical | financial | reporting | community | env
  compliance_status TEXT NOT NULL DEFAULT 'compliant' CHECK (compliance_status IN (
    'compliant','in_review','breached','waived'
  )),
  last_tested_at TEXT,
  evidence_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_lic_cond_licence ON regulator_licence_conditions(licence_id);
CREATE INDEX IF NOT EXISTS idx_reg_lic_cond_status ON regulator_licence_conditions(compliance_status);

CREATE TABLE IF NOT EXISTS regulator_licence_events (
  id TEXT PRIMARY KEY,
  licence_id TEXT NOT NULL REFERENCES regulator_licences(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'granted','varied','renewed','suspended','revoked','surrendered','expired','condition_breach'
  )),
  event_date TEXT NOT NULL,
  details TEXT,
  actor_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_lic_evt_licence ON regulator_licence_events(licence_id, event_date DESC);

-- ─── Tariff approval workflow ──────────────────────────────────────────────
-- MYPD-style tariff submissions under ERA 2006 s.16 and the Electricity
-- Pricing Policy. A licensee submits, NERSA runs a public hearing, then
-- publishes a determination. We keep submission and determination separate
-- because determinations can amend multiple submissions.
CREATE TABLE IF NOT EXISTS regulator_tariff_submissions (
  id TEXT PRIMARY KEY,
  reference_number TEXT UNIQUE NOT NULL,
  licensee_participant_id TEXT NOT NULL REFERENCES participants(id),
  licence_id TEXT REFERENCES regulator_licences(id),
  submission_title TEXT NOT NULL,
  tariff_period_start TEXT NOT NULL,    -- e.g. '2026-04-01'
  tariff_period_end TEXT NOT NULL,
  requested_revenue_zar REAL,
  requested_tariff_c_per_kwh REAL,
  methodology TEXT,                     -- 'MYPD4' | 'bilateral' | 'wheeling' | ...
  supporting_docs_json TEXT,            -- R2 keys
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'draft','submitted','public_hearing','determined','withdrawn','rejected'
  )),
  public_hearing_date TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_tariff_sub_status ON regulator_tariff_submissions(status);
CREATE INDEX IF NOT EXISTS idx_reg_tariff_sub_licensee ON regulator_tariff_submissions(licensee_participant_id);

CREATE TABLE IF NOT EXISTS regulator_tariff_decisions (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES regulator_tariff_submissions(id),
  decision_number TEXT UNIQUE NOT NULL,
  decision_date TEXT NOT NULL,
  approved_revenue_zar REAL,
  approved_tariff_c_per_kwh REAL,
  variance_percentage REAL,             -- computed off requested vs approved
  reasons TEXT,                         -- reasons for determination (PAJA-compliant)
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  published_in_gazette BOOLEAN DEFAULT 0,
  gazette_reference TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_tariff_dec_sub ON regulator_tariff_decisions(submission_id);

-- ─── Published determinations (gazette) ────────────────────────────────────
-- Publicly accessible determinations, rules, and notices issued by the
-- regulator. PAIA s.14 requires a manual of publicly available records; this
-- table is the canonical public register.
CREATE TABLE IF NOT EXISTS regulator_determinations (
  id TEXT PRIMARY KEY,
  reference_number TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'tariff','licence','rule','notice','enforcement','code_of_conduct','methodology'
  )),
  statutory_basis TEXT,                 -- e.g. 'ERA 2006 s.4'
  summary TEXT,
  body_md TEXT,
  publication_date TEXT NOT NULL,
  gazette_reference TEXT,
  document_r2_key TEXT,
  published_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_det_category ON regulator_determinations(category, publication_date DESC);

-- ─── Enforcement cases ─────────────────────────────────────────────────────
-- Investigation → finding → penalty → appeal, tracked from first complaint
-- to close-out. Referenced NERSA Rules on Penalties (2018) sets penalty caps.
CREATE TABLE IF NOT EXISTS regulator_enforcement_cases (
  id TEXT PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  respondent_participant_id TEXT REFERENCES participants(id),
  respondent_name TEXT NOT NULL,
  related_licence_id TEXT REFERENCES regulator_licences(id),
  alleged_contravention TEXT NOT NULL,
  statutory_provision TEXT,             -- e.g. 'ERA 2006 s.24(1)'
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','investigating','hearing','finding','penalty_imposed','appealed','closed','withdrawn'
  )),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  lead_investigator_id TEXT REFERENCES participants(id),
  finding TEXT,
  finding_date TEXT,
  penalty_amount_zar REAL,
  penalty_description TEXT,
  appeal_filed_at TEXT,
  appeal_outcome TEXT,
  closed_at TEXT,
  created_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_enf_status ON regulator_enforcement_cases(status);
CREATE INDEX IF NOT EXISTS idx_reg_enf_respondent ON regulator_enforcement_cases(respondent_participant_id);
CREATE INDEX IF NOT EXISTS idx_reg_enf_severity ON regulator_enforcement_cases(severity);

-- Case events: investigation steps, hearings, correspondence, etc.
CREATE TABLE IF NOT EXISTS regulator_enforcement_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES regulator_enforcement_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,             -- 'complaint','hearing_notice','evidence_submitted','decision','appeal_filed'
  event_date TEXT NOT NULL,
  description TEXT,
  evidence_r2_key TEXT,
  actor_id TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_enf_evt_case ON regulator_enforcement_events(case_id, event_date DESC);

-- ─── Market surveillance ───────────────────────────────────────────────────
-- Rule definitions the regulator runs over trade_orders / trade_matches to
-- detect wash trades, layering, spoofing, and concentration abuse.
CREATE TABLE IF NOT EXISTS regulator_surveillance_rules (
  id TEXT PRIMARY KEY,
  rule_code TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'wash_trade','layering','spoofing','concentration','price_manipulation',
    'circular_trade','front_running','market_abuse_generic'
  )),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  parameters_json TEXT,                 -- window_hours, threshold_pct, etc.
  enabled BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Each alert raised against a participant / trade / order.
CREATE TABLE IF NOT EXISTS regulator_surveillance_alerts (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES regulator_surveillance_rules(id),
  rule_code TEXT NOT NULL,              -- denormalised so alerts survive rule rename
  participant_id TEXT REFERENCES participants(id),
  entity_type TEXT,                     -- 'trade_orders' | 'trade_matches' | 'participants'
  entity_id TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  details_json TEXT,                    -- evidence metrics (e.g. { matches: 12, volume: 400 })
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open','investigating','escalated','false_positive','confirmed','resolved'
  )),
  escalated_case_id TEXT REFERENCES regulator_enforcement_cases(id),
  assigned_to TEXT REFERENCES participants(id),
  raised_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  resolution_notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_surv_status ON regulator_surveillance_alerts(status, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_reg_surv_participant ON regulator_surveillance_alerts(participant_id);
CREATE INDEX IF NOT EXISTS idx_reg_surv_rule ON regulator_surveillance_alerts(rule_code);

-- Seed the standard surveillance rules so the UI has something to switch on.
INSERT OR IGNORE INTO regulator_surveillance_rules (id, rule_code, rule_name, description, rule_type, severity, parameters_json, enabled) VALUES
  ('rsr_wash_1',   'WASH_TRADE_01',   'Self-match within 24h',            'Same participant appears as both buyer and seller on a match inside 24h — likely wash trade.',        'wash_trade',        'high',     '{"window_hours":24}', 1),
  ('rsr_circ_1',   'CIRCULAR_01',     'Circular trade chain (A→B→A)',      'Chain of matches returning value to the originating participant inside 72h.',                       'circular_trade',    'high',     '{"window_hours":72,"min_legs":2}', 1),
  ('rsr_conc_1',   'CONCENTRATION_01','Single-participant market share > 40%', 'Participant executed volume exceeds 40% of total traded volume in rolling 30-day window.',         'concentration',     'medium',   '{"window_days":30,"threshold_pct":40}', 1),
  ('rsr_lyr_1',    'LAYERING_01',     'Rapid cancel-and-replace layering','Participant placed and cancelled >20 opposing-side orders in 1h — layering pattern.',                'layering',          'high',     '{"window_minutes":60,"cancel_count":20}', 1),
  ('rsr_spoof_1',  'SPOOFING_01',     'Spoofing — large order cancelled pre-match', 'Single order > 5x participant''s median order size cancelled within 5m of opposite-side match.', 'spoofing',          'critical', '{"size_multiple":5,"window_minutes":5}', 1),
  ('rsr_price_1',  'PRICE_MAN_01',    'Price deviation > 3σ vs 30-day mean', 'Trade price deviates >3 standard deviations from 30-day mean for same energy_type.',               'price_manipulation','high',     '{"window_days":30,"sigma":3}', 1);

-- ─── Regulator staff workbench (assignments) ───────────────────────────────
-- Let the regulator assign cases/alerts to specific investigators. Audit
-- accountability for PAJA.
CREATE TABLE IF NOT EXISTS regulator_case_assignments (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN (
    'licence','tariff_submission','enforcement_case','surveillance_alert'
  )),
  subject_id TEXT NOT NULL,
  assignee_id TEXT NOT NULL REFERENCES participants(id),
  assigned_by TEXT NOT NULL REFERENCES participants(id),
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  role TEXT DEFAULT 'lead',             -- 'lead','reviewer','observer'
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_assign_subject ON regulator_case_assignments(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_reg_assign_assignee ON regulator_case_assignments(assignee_id);
