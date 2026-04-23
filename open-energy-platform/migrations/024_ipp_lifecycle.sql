-- 024_ipp_lifecycle.sql
-- IPP developer project-lifecycle tables beyond the core ipp_projects / milestones:
--   1. EPC contract lifecycle (scope, variations, certs, LDs)
--   2. Environmental Authorisation / EIA / Waste licence tracking
--   3. Land & servitude register
--   4. Insurance register
--   5. Community / stakeholder engagement log (ED + SED tracking)
--
-- Statutory basis: National Environmental Management Act 107 of 1998 (NEMA),
-- EIA Regulations 2014, Heritage Resources Act 25 of 1999,
-- Deeds Registries Act 47/1937, Spatial Planning & Land Use Management
-- Act 16 of 2013 (SPLUMA), REIPPPP BBBEE & Economic Development schedules.

-- ─── EPC contracts ─────────────────────────────────────────────────────────
-- The "master" EPC record; detailed terms live in contract_documents (doctype=epc).
-- This table captures the construction-management view: scope packages, price
-- book, LDs, taking-over certificates.
CREATE TABLE IF NOT EXISTS epc_contracts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  contract_document_id TEXT REFERENCES contract_documents(id),
  epc_contractor_participant_id TEXT REFERENCES participants(id),
  contractor_name TEXT NOT NULL,
  lump_sum_zar REAL,
  target_completion_date TEXT,
  commissioning_date TEXT,
  taking_over_certificate_date TEXT,
  defects_liability_until TEXT,
  performance_security_zar REAL,
  ld_cap_percentage REAL,            -- cap on liquidated damages, typically 10-15%
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','executed','construction','testing','taking_over','defects_period','closed','terminated'
  )),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_epc_project ON epc_contracts(project_id);

CREATE TABLE IF NOT EXISTS epc_variations (
  id TEXT PRIMARY KEY,
  epc_contract_id TEXT NOT NULL REFERENCES epc_contracts(id) ON DELETE CASCADE,
  variation_number TEXT NOT NULL,
  description TEXT NOT NULL,
  value_zar REAL NOT NULL,          -- signed: +ve price up, -ve price down
  time_impact_days INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected','disputed')),
  raised_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by TEXT REFERENCES participants(id)
);
CREATE INDEX IF NOT EXISTS idx_epc_var_contract ON epc_variations(epc_contract_id);

CREATE TABLE IF NOT EXISTS epc_liquidated_damages (
  id TEXT PRIMARY KEY,
  epc_contract_id TEXT NOT NULL REFERENCES epc_contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('delay','performance','availability','guaranteed_output')),
  event_date TEXT NOT NULL,
  description TEXT,
  calculated_amount_zar REAL NOT NULL,
  capped_amount_zar REAL,
  status TEXT DEFAULT 'assessed' CHECK (status IN ('assessed','disputed','paid','waived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Environmental authorisation ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS environmental_authorisations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  authorisation_type TEXT NOT NULL CHECK (authorisation_type IN (
    'environmental_authorisation_s24','waste_licence','water_use_licence','air_emission_licence',
    'heritage_permit','biodiversity_permit','scoping_report','eir_submitted','amendment'
  )),
  reference_number TEXT,
  competent_authority TEXT,          -- e.g. 'DFFE','NWA','SAHRA','Provincial'
  applied_date TEXT,
  decision_date TEXT,
  decision TEXT CHECK (decision IN ('granted','granted_with_conditions','refused','appealed','pending','withdrawn')),
  conditions_text TEXT,
  expiry_date TEXT,
  document_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_env_auth_project ON environmental_authorisations(project_id);
CREATE INDEX IF NOT EXISTS idx_env_auth_decision ON environmental_authorisations(decision);

CREATE TABLE IF NOT EXISTS environmental_compliance (
  id TEXT PRIMARY KEY,
  authorisation_id TEXT NOT NULL REFERENCES environmental_authorisations(id) ON DELETE CASCADE,
  condition_reference TEXT NOT NULL,
  condition_text TEXT NOT NULL,
  due_date TEXT,
  compliance_status TEXT DEFAULT 'pending' CHECK (compliance_status IN (
    'pending','in_progress','compliant','non_compliant','waived'
  )),
  evidence_r2_key TEXT,
  last_tested_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_env_comp_authorisation ON environmental_compliance(authorisation_id);

-- ─── Land & servitude register ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS land_parcels (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  parcel_number TEXT,                -- e.g. 'Rem Ptn 3 of Farm 123'
  sg_diagram TEXT,                   -- Surveyor-General reference
  lpi TEXT,                          -- Land Parcel Identifier
  ownership_type TEXT CHECK (ownership_type IN ('owned','leased','servitude','option','communal','state_land')),
  area_hectares REAL,
  registered_owner TEXT,
  title_deed_number TEXT,
  deed_registration_date TEXT,
  lease_start_date TEXT,
  lease_end_date TEXT,
  monthly_rent_zar REAL,
  splumap_rezoning_status TEXT,      -- 'none','applied','approved','refused'
  status TEXT DEFAULT 'secured' CHECK (status IN ('identified','negotiating','secured','in_dispute','released')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_land_project ON land_parcels(project_id);

CREATE TABLE IF NOT EXISTS servitudes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  servitude_type TEXT NOT NULL CHECK (servitude_type IN ('powerline','access_road','water_pipeline','fibre','other')),
  parcel_number TEXT,
  grantor TEXT,
  consideration_zar REAL,
  registered_at_deeds BOOLEAN DEFAULT 0,
  registration_date TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_servitudes_project ON servitudes(project_id);

-- ─── Insurance register ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insurance_policies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  policy_number TEXT NOT NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN (
    'car','operational_all_risks','business_interruption','public_liability',
    'directors_and_officers','environmental_liability','marine_cargo','delay_in_start_up','other'
  )),
  insurer TEXT NOT NULL,
  broker TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  sum_insured_zar REAL,
  premium_zar REAL,
  deductible_zar REAL,
  lenders_noted BOOLEAN DEFAULT 0,
  document_r2_key TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','lapsed','renewed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ins_project ON insurance_policies(project_id);
CREATE INDEX IF NOT EXISTS idx_ins_expiry ON insurance_policies(period_end);

CREATE TABLE IF NOT EXISTS insurance_claims (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL REFERENCES insurance_policies(id),
  claim_number TEXT NOT NULL,
  loss_event_date TEXT,
  notified_at TEXT,
  quantum_zar REAL,
  paid_amount_zar REAL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','under_assessment','accepted','rejected','paid','closed')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ins_claim_policy ON insurance_claims(policy_id);

-- ─── Community & stakeholder engagement (ED / SED tracking) ────────────────
CREATE TABLE IF NOT EXISTS community_stakeholders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  stakeholder_name TEXT NOT NULL,
  stakeholder_type TEXT CHECK (stakeholder_type IN (
    'municipality','traditional_authority','community_trust','landowner','civic_org','union','ngo','school','clinic','other'
  )),
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_stake_project ON community_stakeholders(project_id);

CREATE TABLE IF NOT EXISTS community_engagements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  stakeholder_id TEXT REFERENCES community_stakeholders(id),
  engagement_type TEXT NOT NULL CHECK (engagement_type IN (
    'public_meeting','one_on_one','notice_issued','complaint_received','grievance','workshop','focus_group','site_visit','ceremony'
  )),
  engagement_date TEXT NOT NULL,
  attendees_count INTEGER,
  topic TEXT,
  outcome TEXT,
  commitments TEXT,
  follow_up_date TEXT,
  evidence_r2_key TEXT,
  logged_by TEXT REFERENCES participants(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comm_eng_project ON community_engagements(project_id, engagement_date DESC);

-- ED / SED spend register — matches REIPPPP Implementation Agreement reporting
CREATE TABLE IF NOT EXISTS ed_sed_spend (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES ipp_projects(id),
  category TEXT NOT NULL CHECK (category IN (
    'ownership','management_control','skills_development','enterprise_development',
    'supplier_development','socio_economic_development','preferential_procurement','localisation','jobs_created'
  )),
  period TEXT NOT NULL,             -- 'Q2-2026'
  amount_zar REAL NOT NULL,
  beneficiary TEXT,
  description TEXT,
  reipppp_bid_window TEXT,
  evidence_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ed_sed_project ON ed_sed_spend(project_id, period);
