-- ════════════════════════════════════════════════════════════════════════
-- RBAC — permissions, role_permissions, invitations, registrations
-- ════════════════════════════════════════════════════════════════════════

-- Fine-grained permission catalogue
CREATE TABLE IF NOT EXISTS rbac_permissions (
  key          TEXT PRIMARY KEY,   -- e.g. 'trading.write'
  domain       TEXT NOT NULL,      -- trading | settlement | carbon | ipp | lender | offtaker | grid | regulator | esums | documents | audit | users
  action       TEXT NOT NULL,      -- read | write | approve | export | invite
  display_name TEXT NOT NULL,
  description  TEXT
);

-- Canonical role→permission assignments (seed below)
CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role           TEXT NOT NULL,
  permission_key TEXT NOT NULL REFERENCES rbac_permissions(key),
  PRIMARY KEY (role, permission_key)
);

-- Invitation tokens (any role can invite within their allowed_roles)
CREATE TABLE IF NOT EXISTS rbac_invitations (
  id              TEXT PRIMARY KEY,
  token           TEXT UNIQUE NOT NULL,
  invited_by      TEXT NOT NULL REFERENCES participants(id),
  email           TEXT,                 -- pre-fill email on registration form; null = open link
  role            TEXT NOT NULL,        -- role the invitee will get on acceptance
  organization    TEXT,
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','expired','revoked')),
  expires_at      TEXT NOT NULL,
  accepted_by     TEXT REFERENCES participants(id),
  accepted_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rbac_inv_token  ON rbac_invitations(token);
CREATE INDEX IF NOT EXISTS idx_rbac_inv_by     ON rbac_invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_rbac_inv_email  ON rbac_invitations(email);

-- Self-registration queue (public, no invitation required)
CREATE TABLE IF NOT EXISTS rbac_registrations (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  company_name    TEXT,
  requested_role  TEXT NOT NULL,
  organization_type TEXT,
  reg_number      TEXT,   -- company/CIPC reg number
  phone           TEXT,
  motivation      TEXT,   -- why they need this role
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','converted')),
  reviewed_by     TEXT REFERENCES participants(id),
  reviewed_at     TEXT,
  rejection_reason TEXT,
  invitation_id   TEXT REFERENCES rbac_invitations(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rbac_reg_status ON rbac_registrations(status);
CREATE INDEX IF NOT EXISTS idx_rbac_reg_role   ON rbac_registrations(requested_role);

-- Extended profile fields (additive columns to participants)
ALTER TABLE participants ADD COLUMN phone        TEXT;
ALTER TABLE participants ADD COLUMN job_title    TEXT;
ALTER TABLE participants ADD COLUMN org_website  TEXT;
ALTER TABLE participants ADD COLUMN org_reg_num  TEXT;
ALTER TABLE participants ADD COLUMN invited_by   TEXT REFERENCES participants(id);
ALTER TABLE participants ADD COLUMN bio          TEXT;
ALTER TABLE participants ADD COLUMN avatar_r2    TEXT;   -- R2 key for profile photo

-- ─── Permission catalogue ──────────────────────────────────────────────────

INSERT OR IGNORE INTO rbac_permissions VALUES
  -- Trading
  ('trading.read',      'trading',    'read',    'View orders & trades',        'Read order book, trade history, positions'),
  ('trading.write',     'trading',    'write',   'Place & manage orders',       'Submit, amend, cancel orders'),
  ('trading.approve',   'trading',    'approve', 'Approve trading limits',      'Set/approve pre-trade guards and credit limits'),
  -- Settlement
  ('settlement.read',   'settlement', 'read',    'View settlement',             'View settlement runs, invoices, netting'),
  ('settlement.write',  'settlement', 'write',   'Run settlement',              'Trigger settlement cycles, approve netting'),
  ('settlement.export', 'settlement', 'export',  'Export settlement data',      'Download settlement statements'),
  -- Carbon
  ('carbon.read',       'carbon',     'read',    'View carbon credits',         'View credits, retirements, MRV reports'),
  ('carbon.write',      'carbon',     'write',   'Manage carbon portfolio',     'Create retirements, submit MRV, trade credits'),
  ('carbon.approve',    'carbon',     'approve', 'Certify carbon credits',      'Approve MRV verification, issue certificates'),
  -- IPP
  ('ipp.read',          'ipp',        'read',    'View IPP projects',           'View project details, stage gates, procurement'),
  ('ipp.write',         'ipp',        'write',   'Manage IPP projects',         'Create/update projects, submit stage gates'),
  ('ipp.approve',       'ipp',        'approve', 'Approve IPP stage gates',     'Approve stage gate decisions, IE certifications'),
  -- Lender
  ('lender.read',       'lender',     'read',    'View credit facilities',      'View facilities, covenants, drawdowns'),
  ('lender.write',      'lender',     'write',   'Manage credit facilities',    'Create facilities, submit drawdown requests'),
  ('lender.approve',    'lender',     'approve', 'Approve lending decisions',   'Approve drawdowns, set covenant thresholds'),
  -- Offtaker
  ('offtaker.read',     'offtaker',   'read',    'View PPA obligations',        'View PPA terms, delivery, curtailment events'),
  ('offtaker.write',    'offtaker',   'write',   'Manage PPA obligations',      'Submit curtailment claims, change-in-law'),
  -- Grid
  ('grid.read',         'grid',       'read',    'View grid operations',        'View dispatch, wheeling charges, curtailment'),
  ('grid.write',        'grid',       'write',   'Manage grid operations',      'Dispatch nominations, issue capacity allocations'),
  ('grid.approve',      'grid',       'approve', 'Approve grid connections',    'Approve GCA, energization hold-points'),
  -- Regulator
  ('regulator.read',    'regulator',  'read',    'View regulatory data',        'View compliance cases, licences, levies'),
  ('regulator.write',   'regulator',  'write',   'Issue regulatory decisions',  'Grant licences, issue enforcement notices'),
  ('regulator.export',  'regulator',  'export',  'Export regulatory reports',   'Download NERSA-format audit exports'),
  -- Esums O&M
  ('esums.read',        'esums',      'read',    'View O&M data',               'View sites, devices, work orders, health'),
  ('esums.write',       'esums',      'write',   'Manage O&M operations',       'Create work orders, log incidents, update assets'),
  -- Documents
  ('documents.read',    'documents',  'read',    'View documents',              'Read templates, envelopes, generated PDFs'),
  ('documents.write',   'documents',  'write',   'Manage document templates',   'Create/publish templates, raise envelopes'),
  ('documents.export',  'documents',  'export',  'Download documents',          'Generate and download branded PDFs'),
  -- Audit
  ('audit.read',        'audit',      'read',    'View audit chain',            'View tamper-evident audit blocks'),
  ('audit.export',      'audit',      'export',  'Export audit data',           'Download NERSA audit block export'),
  -- Users & Invitations
  ('users.read',        'users',      'read',    'View user directory',         'List and view participant profiles'),
  ('users.write',       'users',      'write',   'Manage users',                'Activate, suspend, edit any user account'),
  ('users.invite',      'users',      'invite',  'Invite users',                'Generate invitation links within allowed roles');

-- ─── Role → permission assignments ────────────────────────────────────────

-- admin: full access
INSERT OR IGNORE INTO rbac_role_permissions SELECT 'admin', key FROM rbac_permissions;

-- support: everything except write-approvals and user.write
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('support', 'trading.read'), ('support', 'settlement.read'), ('support', 'settlement.export'),
  ('support', 'carbon.read'), ('support', 'ipp.read'), ('support', 'lender.read'),
  ('support', 'offtaker.read'), ('support', 'grid.read'), ('support', 'regulator.read'),
  ('support', 'esums.read'), ('support', 'esums.write'), ('support', 'documents.read'),
  ('support', 'documents.write'), ('support', 'documents.export'), ('support', 'audit.read'),
  ('support', 'users.read'), ('support', 'users.invite');

-- trader
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('trader', 'trading.read'), ('trader', 'trading.write'), ('trader', 'settlement.read'),
  ('trader', 'settlement.export'), ('trader', 'documents.read'), ('trader', 'documents.export'),
  ('trader', 'users.invite');

-- ipp_developer
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('ipp_developer', 'ipp.read'), ('ipp_developer', 'ipp.write'), ('ipp_developer', 'settlement.read'),
  ('ipp_developer', 'settlement.export'), ('ipp_developer', 'lender.read'),
  ('ipp_developer', 'offtaker.read'), ('ipp_developer', 'grid.read'),
  ('ipp_developer', 'esums.read'), ('ipp_developer', 'esums.write'),
  ('ipp_developer', 'documents.read'), ('ipp_developer', 'documents.export'),
  ('ipp_developer', 'users.invite');

-- lender
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('lender', 'lender.read'), ('lender', 'lender.write'), ('lender', 'lender.approve'),
  ('lender', 'ipp.read'), ('lender', 'settlement.read'), ('lender', 'esums.read'),
  ('lender', 'documents.read'), ('lender', 'documents.export'), ('lender', 'users.invite');

-- offtaker
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('offtaker', 'offtaker.read'), ('offtaker', 'offtaker.write'), ('offtaker', 'settlement.read'),
  ('offtaker', 'settlement.export'), ('offtaker', 'ipp.read'), ('offtaker', 'carbon.read'),
  ('offtaker', 'documents.read'), ('offtaker', 'documents.export'), ('offtaker', 'users.invite');

-- carbon_fund
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('carbon_fund', 'carbon.read'), ('carbon_fund', 'carbon.write'), ('carbon_fund', 'carbon.approve'),
  ('carbon_fund', 'ipp.read'), ('carbon_fund', 'documents.read'),
  ('carbon_fund', 'documents.export'), ('carbon_fund', 'users.invite');

-- grid_operator
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('grid_operator', 'grid.read'), ('grid_operator', 'grid.write'), ('grid_operator', 'grid.approve'),
  ('grid_operator', 'ipp.read'), ('grid_operator', 'esums.read'),
  ('grid_operator', 'documents.read'), ('grid_operator', 'documents.export'),
  ('grid_operator', 'users.invite');

-- regulator
INSERT OR IGNORE INTO rbac_role_permissions VALUES
  ('regulator', 'regulator.read'), ('regulator', 'regulator.write'), ('regulator', 'regulator.export'),
  ('regulator', 'trading.read'), ('regulator', 'settlement.read'), ('regulator', 'carbon.read'),
  ('regulator', 'ipp.read'), ('regulator', 'lender.read'), ('regulator', 'offtaker.read'),
  ('regulator', 'grid.read'), ('regulator', 'esums.read'), ('regulator', 'documents.read'),
  ('regulator', 'documents.export'), ('regulator', 'audit.read'), ('regulator', 'audit.export'),
  ('regulator', 'users.invite');
