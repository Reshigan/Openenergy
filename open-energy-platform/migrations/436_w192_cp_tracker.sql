-- Wave 192: IPP Conditions Precedent (CP) Tracker
-- Tracks individual CP items from identification through satisfaction or lapse.
-- Gates downstream drawdown (W21), construction milestones, and grid connection (W28/W75).
-- INVERTED SLA: higher-tier CPs receive more time for regulatory review and sign-off.

CREATE TABLE IF NOT EXISTS oe_cp_tracker (
  id                   TEXT PRIMARY KEY,
  cp_title             TEXT NOT NULL,
  cp_tier              TEXT NOT NULL CHECK (cp_tier IN ('operational', 'commercial', 'financial', 'regulatory', 'strategic')),
  project_ref          TEXT,
  lender_ref           TEXT,
  gate_ref             TEXT,
  description          TEXT,
  chain_status         TEXT NOT NULL DEFAULT 'identified' CHECK (chain_status IN (
                         'identified', 'documented', 'submitted', 'under_verification',
                         'conditional_pass', 'outstanding', 'notice_served', 'cure_underway',
                         'satisfied', 'waived', 'lapsed', 'rejected'
                       )),
  sla_deadline         TEXT,
  sla_breached         INTEGER NOT NULL DEFAULT 0,
  regulator_notified   INTEGER NOT NULL DEFAULT 0,
  actor_id             TEXT,
  reason               TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cp_tracker_status    ON oe_cp_tracker(chain_status);
CREATE INDEX IF NOT EXISTS idx_cp_tracker_tier      ON oe_cp_tracker(cp_tier);
CREATE INDEX IF NOT EXISTS idx_cp_tracker_sla       ON oe_cp_tracker(sla_deadline, sla_breached);
CREATE INDEX IF NOT EXISTS idx_cp_tracker_created   ON oe_cp_tracker(created_at);
CREATE INDEX IF NOT EXISTS idx_cp_tracker_actor     ON oe_cp_tracker(actor_id);
CREATE INDEX IF NOT EXISTS idx_cp_tracker_project   ON oe_cp_tracker(project_ref);

-- ─── Seed data ────────────────────────────────────────────────────────────────
-- 12 rows covering all 12 states, all 5 tiers, mix of sla_breached and regulator_notified

INSERT OR IGNORE INTO oe_cp_tracker
  (id, cp_title, cp_tier, project_ref, lender_ref, gate_ref, description,
   chain_status, sla_deadline, sla_breached, regulator_notified, actor_id, reason, created_at, updated_at)
VALUES

-- identified — operational tier
('cp-t-001',
 'SCADA Connectivity Acceptance Certificate',
 'operational',
 'REIPPPP-BW4-GR-001',
 NULL,
 'COD-GATE-A',
 'NTCSA signed acceptance of SCADA connectivity and control room integration prior to energisation',
 'identified',
 '2026-06-18 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2026-06-04 08:00:00', '2026-06-04 08:00:00'),

-- documented — commercial tier
('cp-t-002',
 'PPA Execution Confirmation from Offtaker',
 'commercial',
 'REIPPPP-BW4-GR-001',
 'LF-2024-001',
 'FC-GATE-B',
 'Signed and dated PPA with Eskom SOC as offtaker confirming take-or-pay schedule',
 'documented',
 '2026-06-25 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'PPA draft reviewed and countersigned by legal advisors',
 '2026-05-20 09:00:00', '2026-06-01 14:30:00'),

-- submitted — financial tier
('cp-t-003',
 'Debt Service Reserve Account Initial Funding',
 'financial',
 'REIPPPP-BW4-GR-001',
 'LF-2024-001',
 'FC-GATE-B',
 'DSRA funded to six months of projected debt service as required under facility agreement schedule 3',
 'submitted',
 '2026-07-04 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Bank confirmation letters submitted to lender agent on 2026-06-03',
 '2026-05-01 11:00:00', '2026-06-03 10:00:00'),

-- under_verification — regulatory tier
('cp-t-004',
 'NERSA Generation Licence Issue',
 'regulatory',
 'REIPPPP-BW4-GR-002',
 NULL,
 'LICENCE-GATE',
 'NERSA licence under ERA section 8 for 50 MW ground-mounted solar facility in Northern Cape',
 'under_verification',
 '2026-07-19 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 NULL,
 '2026-04-15 08:30:00', '2026-06-02 15:00:00'),

-- conditional_pass — strategic tier
('cp-t-005',
 'DMRE Ministerial Consent for Foreign Equity',
 'strategic',
 'REIPPPP-BW4-GR-002',
 'LF-2024-002',
 'FC-GATE-C',
 'Section 34 determination and ministerial consent for equity participation by non-resident investor',
 'conditional_pass',
 '2026-08-03 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Conditional pass granted subject to submission of shareholder register confirmation',
 '2026-03-01 10:00:00', '2026-05-28 16:00:00'),

-- outstanding — operational tier (sla_breached=1)
('cp-t-006',
 'O&M Agreement Execution',
 'operational',
 'REIPPPP-BW4-GR-003',
 NULL,
 'COD-GATE-A',
 'Signed O&M agreement with qualified IEMP service provider covering 20-year performance guarantee',
 'outstanding',
 '2026-05-01 00:00:00',
 1, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Preferred O&M provider withdrew; procurement of replacement provider in progress',
 '2026-03-20 09:00:00', '2026-05-15 11:00:00'),

-- notice_served — commercial tier (regulator_notified=1)
('cp-t-007',
 'REC Registration Confirmation from I-REC Registry',
 'commercial',
 'REIPPPP-BW4-GR-003',
 NULL,
 'COD-GATE-B',
 'Confirmation of I-REC device registration and first issuance readiness from SA-REC tracking system',
 'notice_served',
 '2026-05-10 00:00:00',
 1, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'IPPO notified of outstanding CP; notice served as required under IA clause 11.3',
 '2026-02-28 08:00:00', '2026-05-12 09:30:00'),

-- cure_underway — financial tier (sla_breached=1, regulator_notified=1)
('cp-t-008',
 'Insurance Placement Confirmation',
 'financial',
 'REIPPPP-BW4-GR-001',
 'LF-2024-001',
 'FC-GATE-B',
 'Construction all-risk and contractor liability insurance placed with approved insurer per W23 requirements',
 'cure_underway',
 '2026-04-30 00:00:00',
 1, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'Broker engaged to replace lapsed insurer; cure window commenced after notice served',
 '2026-01-15 10:00:00', '2026-05-05 14:00:00'),

-- satisfied — regulatory tier (TERMINAL +)
('cp-t-009',
 'Environmental Impact Assessment Record of Decision',
 'regulatory',
 'REIPPPP-BW4-GR-001',
 NULL,
 'LICENCE-GATE',
 'DEA Record of Decision under NEMA for the 80 MW solar facility; appeal period lapsed without challenge',
 'satisfied',
 '2025-08-30 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'RoD issued 2025-07-15; 30-day appeal period expired without challenge; CP confirmed satisfied',
 '2025-05-01 08:00:00', '2025-08-15 10:00:00'),

-- waived — financial tier (TERMINAL neutral)
('cp-t-010',
 'Independent Engineer COD Certificate',
 'financial',
 'REIPPPP-BW4-GR-001',
 'LF-2024-001',
 'COD-GATE-A',
 'Independent engineer certification of commercial operation date under W20 COD chain',
 'waived',
 '2025-12-01 00:00:00',
 0, 0,
 'id_7c352b86da89907a85266a250e15db95',
 'Lender agent agreed to waive IE COD certificate requirement in favour of NERSA operational licence confirmation',
 '2025-09-01 09:00:00', '2025-11-28 15:30:00'),

-- lapsed — strategic tier (TERMINAL -, sla_breached=1, regulator_notified=1)
('cp-t-011',
 'REIPPPP Preferred Bidder Award Letter',
 'strategic',
 'REIPPPP-BW5-GR-001',
 NULL,
 'FC-GATE-A',
 'DMRE preferred bidder award letter confirming inclusion in REIPPPP BW5 procurement round',
 'lapsed',
 '2025-06-30 00:00:00',
 1, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'REIPPPP BW5 procurement round delayed by DMRE; CP lapsed after 60-day SLA window expired without award',
 '2025-04-01 08:00:00', '2025-07-05 11:00:00'),

-- rejected — regulatory tier (TERMINAL -, regulator_notified=1)
('cp-t-012',
 'Water Use Licence from DWS',
 'regulatory',
 'REIPPPP-BW4-GR-003',
 NULL,
 'LICENCE-GATE',
 'Water use licence from Department of Water and Sanitation for construction and operational water abstraction',
 'rejected',
 '2025-10-15 00:00:00',
 0, 1,
 'id_7c352b86da89907a85266a250e15db95',
 'DWS rejected application due to insufficient hydrology study and catchment management plan; NERSA notified of CP rejection',
 '2025-06-01 10:00:00', '2025-10-20 14:00:00');
