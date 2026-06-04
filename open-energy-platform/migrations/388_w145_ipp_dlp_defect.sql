-- W145 — IPP DLP Defects Register
-- JBCC 6.2 Cl.19/32 Defects + NEC4 Cl.43 + NHBRC + REIPPPP QMP
-- URGENT SLA (critical 24h tightest / cosmetic 720h loosest)
-- SIGNATURE: ie_reject → escalated_to_ncr EVERY tier

CREATE TABLE IF NOT EXISTS oe_ipp_dlp_defects (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  project_name          TEXT,
  participant_id        TEXT NOT NULL,

  -- Identity
  defect_ref            TEXT,
  status                TEXT NOT NULL DEFAULT 'identified',
  severity_class        TEXT NOT NULL DEFAULT 'minor',   -- critical|major|minor|cosmetic
  defect_type           TEXT,                            -- structural|mechanical|electrical|civil|architectural|other
  description           TEXT NOT NULL,
  location_description  TEXT,
  work_package          TEXT,
  responsible_contractor TEXT,

  -- Floor flags
  is_safety_related     INTEGER NOT NULL DEFAULT 0,
  is_structural         INTEGER NOT NULL DEFAULT 0,
  is_hold_point         INTEGER NOT NULL DEFAULT 0,

  -- Timestamps per state
  identified_at         TEXT NOT NULL,
  notified_at           TEXT,
  acknowledged_at       TEXT,
  rectification_started_at TEXT,
  submitted_at          TEXT,
  ie_accepted_at        TEXT,
  closed_at             TEXT,
  disputed_at           TEXT,
  escalated_at          TEXT,
  waived_at             TEXT,
  cancelled_at          TEXT,

  -- Personnel
  identified_by         TEXT,
  ie_inspector          TEXT,
  contractor_rep        TEXT,

  -- Cross-chain refs
  ncr_ref               TEXT,     -- escalated from/to NCR
  ei_ref                TEXT,     -- engineer's instruction ordering rectification
  si_ref                TEXT,     -- site instruction reference (W144)
  dlp_end_date          TEXT,     -- when DLP expires for this defect

  -- Extension tracking
  extension_days        INTEGER DEFAULT 0,

  -- SLA
  sla_hours             INTEGER NOT NULL,
  sla_deadline          TEXT NOT NULL,
  is_sla_breached       INTEGER NOT NULL DEFAULT 0,

  -- Audit
  is_reportable         INTEGER NOT NULL DEFAULT 0,
  regulator_ref         TEXT,
  notes                 TEXT,

  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dlp_defects_project ON oe_ipp_dlp_defects(project_id);
CREATE INDEX IF NOT EXISTS idx_dlp_defects_participant ON oe_ipp_dlp_defects(participant_id);
CREATE INDEX IF NOT EXISTS idx_dlp_defects_status ON oe_ipp_dlp_defects(status);
CREATE INDEX IF NOT EXISTS idx_dlp_defects_severity ON oe_ipp_dlp_defects(severity_class);
CREATE INDEX IF NOT EXISTS idx_dlp_defects_sla ON oe_ipp_dlp_defects(sla_deadline, is_sla_breached);

-- ── Seed rows (12 rows covering all 11 statuses + variety) ────────────────

INSERT OR IGNORE INTO oe_ipp_dlp_defects VALUES
('dlp-001','proj-kakamas-500mw','Kakamas 500MW Solar','id_demo_ipp_001',
 'DFR-KAK-001','identified','critical','structural',
 'Foundation crack on inverter pad H7 — visible spalling','Inverter row H, pad H7','Civil works','Pienaar Construction',
 1,1,1,
 '2026-01-15T08:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Site supervisor B. Nkosi',NULL,NULL,
 NULL,NULL,NULL,'2027-01-15T00:00:00Z',0,
 24,'2026-01-16T08:00:00Z',1,1,NULL,NULL,'2026-01-15T08:00:00Z','2026-01-15T08:00:00Z'),

('dlp-002','proj-kakamas-500mw','Kakamas 500MW Solar','id_demo_ipp_001',
 'DFR-KAK-002','notified','major','electrical',
 'DC isolator label missing on string combiner CB-012','Substation north, CB-012','Electrical','Volt-SA Electricians',
 0,0,0,
 '2026-02-01T09:00:00Z','2026-02-01T14:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'IE J. van Wyk',NULL,'Contractor rep T. Naidoo',
 NULL,'EI-KAK-045',NULL,'2027-02-01T00:00:00Z',0,
 72,'2026-02-04T14:00:00Z',0,0,NULL,NULL,'2026-02-01T09:00:00Z','2026-02-01T14:00:00Z'),

('dlp-003','proj-kakamas-500mw','Kakamas 500MW Solar','id_demo_ipp_001',
 'DFR-KAK-003','acknowledged','major','civil',
 'Cable tray support bracket corroded — section E3','Cable tray run E3-E7','Mechanical','Steel-Pro SA',
 0,0,0,
 '2026-02-10T10:00:00Z','2026-02-11T08:00:00Z','2026-02-12T10:30:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'IE R. Botes',NULL,'Foreman L. Sithole',
 NULL,NULL,NULL,'2027-02-10T00:00:00Z',0,
 72,'2026-02-14T08:00:00Z',0,0,NULL,NULL,'2026-02-10T10:00:00Z','2026-02-12T10:30:00Z'),

('dlp-004','proj-saldanha-wind','Saldanha Bay Wind Farm','id_demo_ipp_001',
 'DFR-SAL-001','in_rectification','minor','mechanical',
 'Gearbox oil seal weeping — turbine WT-07','Turbine WT-07 nacelle','Mechanical','WindTech Services',
 0,0,0,
 '2026-03-01T07:00:00Z','2026-03-02T09:00:00Z','2026-03-03T11:00:00Z','2026-03-05T08:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'O&M technician P. Dlamini',NULL,'WindTech PM',
 NULL,NULL,NULL,'2027-03-01T00:00:00Z',0,
 168,'2026-03-09T09:00:00Z',0,0,NULL,NULL,'2026-03-01T07:00:00Z','2026-03-05T08:00:00Z'),

('dlp-005','proj-saldanha-wind','Saldanha Bay Wind Farm','id_demo_ipp_001',
 'DFR-SAL-002','rectified_pending_inspection','minor','architectural',
 'Weatherseal missing at control room door frame D-02','Control room entry D-02','Civil','Saldanha Builders',
 0,0,0,
 '2026-03-10T11:00:00Z','2026-03-11T08:00:00Z','2026-03-12T09:00:00Z','2026-03-14T10:00:00Z','2026-03-20T15:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,
 'Site inspector M. Govender','IE C. Meyer','Builder rep H. Botha',
 NULL,NULL,NULL,'2027-03-10T00:00:00Z',0,
 168,'2026-03-18T08:00:00Z',0,0,NULL,NULL,'2026-03-10T11:00:00Z','2026-03-20T15:00:00Z'),

('dlp-006','proj-kakamas-500mw','Kakamas 500MW Solar','id_demo_ipp_001',
 'DFR-KAK-004','ie_accepted','cosmetic','architectural',
 'Paint finish incomplete on transformer yard fence posts — section F','Transformer yard, section F','Civil','Pienaar Construction',
 0,0,0,
 '2026-04-01T09:00:00Z','2026-04-02T10:00:00Z','2026-04-03T11:00:00Z','2026-04-05T08:00:00Z','2026-04-12T14:00:00Z','2026-04-14T11:00:00Z',NULL,NULL,NULL,NULL,NULL,
 'IE J. van Wyk','IE J. van Wyk','Pienaar PM D. Ferreira',
 NULL,NULL,NULL,'2027-04-01T00:00:00Z',0,
 720,'2026-05-02T10:00:00Z',0,0,NULL,NULL,'2026-04-01T09:00:00Z','2026-04-14T11:00:00Z'),

('dlp-007','proj-saldanha-wind','Saldanha Bay Wind Farm','id_demo_ipp_001',
 'DFR-SAL-003','closed','minor','electrical',
 'Earth continuity bond loose on MV switchboard panel 3','Substation, panel 3','Electrical','Volt-SA Electricians',
 0,0,0,
 '2026-04-15T08:00:00Z','2026-04-16T09:00:00Z','2026-04-17T08:00:00Z','2026-04-18T07:00:00Z','2026-04-22T16:00:00Z','2026-04-24T10:00:00Z','2026-04-25T09:00:00Z',NULL,NULL,NULL,NULL,
 'IE C. Meyer','IE C. Meyer','Volt-SA supervisor',
 NULL,'EI-SAL-018',NULL,'2027-04-15T00:00:00Z',0,
 168,'2026-04-23T09:00:00Z',0,0,NULL,NULL,'2026-04-15T08:00:00Z','2026-04-25T09:00:00Z'),

('dlp-008','proj-kakamas-500mw','Kakamas 500MW Solar','id_demo_ipp_001',
 'DFR-KAK-005','disputed','major','civil',
 'Drainage channel gradient non-compliant — row A runoff','Row A perimeter drainage','Civil','Pienaar Construction',
 0,0,0,
 '2026-05-01T10:00:00Z','2026-05-02T09:00:00Z','2026-05-03T11:00:00Z','2026-05-05T08:00:00Z',NULL,NULL,NULL,'2026-05-10T14:00:00Z',NULL,NULL,NULL,
 'IE J. van Wyk',NULL,'Pienaar PM D. Ferreira',
 NULL,NULL,NULL,'2027-05-01T00:00:00Z',0,
 72,'2026-05-05T09:00:00Z',1,0,NULL,NULL,'2026-05-01T10:00:00Z','2026-05-10T14:00:00Z'),

('dlp-009','proj-lesotho-hydro','Lesotho Hydro IPP','id_demo_ipp_001',
 'DFR-LES-001','escalated_to_ncr','critical','structural',
 'Turbine anchor bolt torque insufficient — runner unit 2; IE rejected rectification','Powerhouse, runner unit 2','Civil / Mechanical','Hydro-Build Ltd',
 1,1,1,
 '2026-03-15T07:00:00Z','2026-03-15T12:00:00Z','2026-03-16T09:00:00Z','2026-03-17T07:00:00Z','2026-03-24T15:00:00Z',NULL,NULL,NULL,'2026-03-25T11:00:00Z',NULL,NULL,
 'IE P. Mahlaba','IE P. Mahlaba','Hydro-Build site manager',
 'NCR-LES-009','EI-LES-031',NULL,'2027-03-15T00:00:00Z',0,
 24,'2026-03-16T12:00:00Z',1,1,'W145-DFR-IEREJECT-20260325',NULL,'2026-03-15T07:00:00Z','2026-03-25T11:00:00Z'),

('dlp-010','proj-saldanha-wind','Saldanha Bay Wind Farm','id_demo_ipp_001',
 'DFR-SAL-004','waived','cosmetic','architectural',
 'Minor scratch on control panel casing CP-04 — below 5cm² threshold per QMP','Substation, CP-04','Electrical','Volt-SA Electricians',
 0,0,0,
 '2026-04-20T10:00:00Z','2026-04-21T09:00:00Z','2026-04-22T10:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,'2026-04-23T11:00:00Z',NULL,
 'IE C. Meyer','IE C. Meyer',NULL,
 NULL,NULL,NULL,'2027-04-20T00:00:00Z',0,
 720,'2026-05-21T09:00:00Z',0,0,NULL,'IE waived: below QMP cosmetic threshold','2026-04-20T10:00:00Z','2026-04-23T11:00:00Z'),

('dlp-011','proj-lesotho-hydro','Lesotho Hydro IPP','id_demo_ipp_001',
 'DFR-LES-002','cancelled','minor','electrical',
 'Cable routing label error on panel P5 — superseded by re-cabling','Powerhouse, panel P5','Electrical','Hydro-Build Ltd',
 0,0,0,
 '2026-02-20T09:00:00Z','2026-02-21T10:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-25T09:00:00Z',
 'Site clerk S. Tsotetsi',NULL,NULL,
 NULL,NULL,NULL,'2027-02-20T00:00:00Z',0,
 168,'2026-02-28T10:00:00Z',0,0,NULL,'Cancelled: cable re-routed under SI-LES-007; defect no longer applies','2026-02-20T09:00:00Z','2026-02-25T09:00:00Z'),

('dlp-012','proj-kakamas-500mw','Kakamas 500MW Solar','id_demo_ipp_001',
 'DFR-KAK-006','in_rectification','major','mechanical',
 'Tracker actuator arm play exceeds spec on 12 units in row D','Row D, 12 tracker units','Mechanical','SunTrack SA',
 0,0,1,
 '2026-05-15T08:00:00Z','2026-05-16T09:00:00Z','2026-05-17T10:00:00Z','2026-05-19T07:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'IE J. van Wyk',NULL,'SunTrack PM R. Jacobs',
 NULL,'EI-KAK-067',NULL,'2027-05-15T00:00:00Z',7,
 72,'2026-05-26T09:00:00Z',0,0,NULL,NULL,'2026-05-15T08:00:00Z','2026-05-19T07:00:00Z');
