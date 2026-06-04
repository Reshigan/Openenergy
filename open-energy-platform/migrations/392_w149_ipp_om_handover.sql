-- W149: IPP O&M Handover Pack & H&S File
-- OHSA §8 + IEC 62446-1 + NERSA Grid Code §C-5
-- INVERTED SLA: larger plant capacity = more docs = more review time
-- SIGNATURE: accept_handover crosses regulator EVERY tier (COD gate);
--            reject_handover crosses major/material

CREATE TABLE IF NOT EXISTS oe_ipp_om_handover (
  id                      TEXT PRIMARY KEY,
  participant_id          TEXT NOT NULL,
  project_id              TEXT NOT NULL,
  capacity_mw             REAL NOT NULL,
  capacity_tier           TEXT NOT NULL CHECK(capacity_tier IN (
                            'minor','moderate','significant','major','material')),
  category                TEXT NOT NULL CHECK(category IN (
                            'hs_file','om_manual','as_built','equipment_data',
                            'warranties','commissioning','training','full_pack')),
  title                   TEXT NOT NULL,
  document_count          INTEGER,
  deficiency_count        INTEGER,
  conditions              TEXT,
  description             TEXT,
  chain_status            TEXT NOT NULL DEFAULT 'compilation' CHECK(chain_status IN (
                            'compilation','internal_review','submitted_to_om','om_review',
                            'deficiencies_raised','deficiencies_resolved',
                            'accepted','conditional_acceptance',
                            'rejected','superseded','archived','withdrawn')),
  sla_due_at              TEXT,
  sla_breached            INTEGER NOT NULL DEFAULT 0,
  -- per-state timestamps
  internal_review_at      TEXT,
  approved_internal_at    TEXT,
  submitted_to_om_at      TEXT,
  deficiencies_raised_at  TEXT,
  deficiencies_resolved_at TEXT,
  accepted_at             TEXT,
  conditional_at          TEXT,
  rejected_at             TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ippomh_participant ON oe_ipp_om_handover(participant_id);
CREATE INDEX IF NOT EXISTS idx_ippomh_project ON oe_ipp_om_handover(project_id);
CREATE INDEX IF NOT EXISTS idx_ippomh_status ON oe_ipp_om_handover(chain_status);
CREATE INDEX IF NOT EXISTS idx_ippomh_sla ON oe_ipp_om_handover(sla_due_at) WHERE sla_breached = 0;

-- Seed: 12 handover packs across categories and stages
INSERT INTO oe_ipp_om_handover VALUES
  -- Full pack accepted: 75MW De Aar
  ('ippomh_001','demo_ipp_001','ip_004',75,'major','full_pack',
   'De Aar 75MW — Full O&M + H&S Handover Pack',247,NULL,NULL,
   'Complete handover: H&S file, O&M manuals, as-builts, equipment data, warranties, commissioning records, training',
   'accepted',NULL,0,
   datetime('now','-90 days'),datetime('now','-85 days'),datetime('now','-82 days'),NULL,NULL,datetime('now','-60 days'),NULL,NULL,
   datetime('now','-95 days'),datetime('now','-60 days')),
  -- H&S file accepted
  ('ippomh_002','demo_ipp_001','ip_004',75,'major','hs_file',
   'De Aar 75MW — OHSA §8 H&S File',84,NULL,NULL,
   'Health & Safety file: risk assessments, method statements, incident log, competency certificates',
   'accepted',NULL,0,
   datetime('now','-100 days'),datetime('now','-95 days'),datetime('now','-92 days'),NULL,NULL,datetime('now','-70 days'),NULL,NULL,
   datetime('now','-105 days'),datetime('now','-70 days')),
  -- O&M manual: under OM review
  ('ippomh_003','demo_ipp_001','proj_nxt_solar_001',20,'significant','om_manual',
   '20MW PV — IEC 62446-1 O&M Manual Rev 3',62,NULL,NULL,
   'O&M manual: corrective and preventive maintenance procedures, spare parts schedule, alarm reference',
   'om_review',datetime('now','+12 days'),0,
   datetime('now','-20 days'),datetime('now','-15 days'),datetime('now','-12 days'),NULL,NULL,NULL,NULL,NULL,
   datetime('now','-22 days'),datetime('now','-12 days')),
  -- As-builts: deficiencies raised
  ('ippomh_004','demo_ipp_001','proj_nxt_solar_001',20,'significant','as_built',
   '20MW PV — As-Built Drawing Set (IFC→Record)',138,14,NULL,
   '14 drawings missing stamps; cable schedule not updated to as-laid routes',
   'deficiencies_raised',datetime('now','+8 days'),0,
   datetime('now','-15 days'),datetime('now','-10 days'),datetime('now','-8 days'),datetime('now','-3 days'),NULL,NULL,NULL,NULL,
   datetime('now','-18 days'),datetime('now','-3 days')),
  -- Commissioning records: deficiencies resolved, pending OM re-review
  ('ippomh_005','demo_ipp_001','proj_nxt_solar_001',20,'significant','commissioning',
   '20MW PV — Commissioning Test Records & FAT Reports',93,6,NULL,
   'LVRT test report updated; protection relay settings sheet added',
   'deficiencies_resolved',datetime('now','+5 days'),0,
   datetime('now','-25 days'),datetime('now','-20 days'),datetime('now','-18 days'),datetime('now','-12 days'),datetime('now','-2 days'),NULL,NULL,NULL,
   datetime('now','-28 days'),datetime('now','-2 days')),
  -- Warranties pack: submitted to OM
  ('ippomh_006','demo_ipp_001','proj_nxt_solar_001',20,'significant','warranties',
   '20MW PV — Equipment Warranties & Performance Guarantees',31,NULL,NULL,
   'Module 25yr, inverter 10yr, tracker 10yr, transformer 5yr warranty registers',
   'submitted_to_om',datetime('now','+25 days'),0,
   datetime('now','-10 days'),datetime('now','-5 days'),datetime('now','-3 days'),NULL,NULL,NULL,NULL,NULL,
   datetime('now','-12 days'),datetime('now','-3 days')),
  -- Training records: internal review
  ('ippomh_007','demo_ipp_001','proj_nxt_solar_001',20,'significant','training',
   '20MW PV — O&M Training Records & Competency Sign-offs',22,NULL,NULL,
   'NXT O&M team: 8 technicians, 2 engineers; inverter & tracker OEM training certificates',
   'internal_review',datetime('now','+27 days'),0,
   datetime('now','-3 days'),NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-5 days'),datetime('now','-3 days')),
  -- Equipment data book: still in compilation
  ('ippomh_008','demo_ipp_001','proj_nxt_solar_001',20,'significant','equipment_data',
   '20MW PV — Equipment Data Books & FAT Records',NULL,NULL,NULL,
   'Compiling: inverter datasheets, transformer test certificates, cable test reports, relay settings',
   'compilation',datetime('now','+28 days'),0,
   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-2 days'),datetime('now','-2 days')),
  -- Full pack: conditional acceptance
  ('ippomh_009','demo_ipp_001','ip_004',10,'significant','full_pack',
   '10MW Agri-Solar — Full Handover Pack (Conditional)',156,NULL,
   'As-built CAD files to be resubmitted as PDF/A within 30 days',
   'As-built PDF/A conversion required; all other sections accepted',
   'conditional_acceptance',datetime('now','+20 days'),0,
   datetime('now','-30 days'),datetime('now','-25 days'),datetime('now','-22 days'),NULL,NULL,NULL,datetime('now','-5 days'),NULL,
   datetime('now','-35 days'),datetime('now','-5 days')),
  -- Rejected: major project
  ('ippomh_010','demo_ipp_001','ip_004',100,'major','om_manual',
   '100MW Wind — O&M Manual Rev 1 (Rejected)',48,22,NULL,
   'O&M manual rejected: missing NERSA Grid Code §C-5 protection philosophy; revenue metering section absent',
   'rejected',NULL,0,
   datetime('now','-50 days'),datetime('now','-45 days'),datetime('now','-43 days'),datetime('now','-35 days'),NULL,NULL,NULL,datetime('now','-15 days'),
   datetime('now','-55 days'),datetime('now','-15 days')),
  -- Superseded: replaced by rev 2
  ('ippomh_011','demo_ipp_001','ip_004',100,'major','om_manual',
   '100MW Wind — O&M Manual Rev 2',48,NULL,NULL,
   'Rev 2: NERSA §C-5 protection philosophy added; revenue metering section complete',
   'superseded',NULL,0,
   datetime('now','-14 days'),datetime('now','-10 days'),datetime('now','-8 days'),NULL,NULL,NULL,NULL,NULL,
   datetime('now','-14 days'),datetime('now','-3 days')),
  -- Material tier: full pack in compilation
  ('ippomh_012','demo_ipp_001','ip_004',250,'material','full_pack',
   '250MW HVDC Interconnect — Full O&M Handover Pack',NULL,NULL,NULL,
   'Assembling: OHSA H&S file, NERSA commissioning test records, STRATE-linked equipment data',
   'compilation',datetime('now','+58 days'),0,
   NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
   datetime('now','-1 days'),datetime('now','-1 days'));
