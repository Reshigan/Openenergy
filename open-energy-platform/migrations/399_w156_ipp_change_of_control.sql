-- W156: IPP Change of Control & Ownership Notification
-- ERA 4/2006 s.9 + NERSA licence condition 4 (change-of-control notification requirement)
-- INVERTED SLA: larger capacity / higher ownership tier = more regulatory scrutiny = more time
-- SIGNATURE: control_transferred crosses regulator EVERY tier (ownership change always notifiable to NERSA)

CREATE TABLE IF NOT EXISTS oe_ipp_change_of_control (
  id                     TEXT PRIMARY KEY,
  participant_id         TEXT NOT NULL,
  project_id             TEXT NOT NULL,
  capacity_mw            REAL NOT NULL,
  ownership_tier         TEXT NOT NULL CHECK(ownership_tier IN ('minor','moderate','significant','major','material')),
  transaction_type       TEXT CHECK(transaction_type IN ('share_transfer','asset_acquisition','merger_scheme_of_arrangement','management_buyout','fund_recycling','change_of_lender_step_in')),
  transferor_name        TEXT,
  acquirer_name          TEXT NOT NULL,
  acquirer_ownership_pct REAL,
  foreign_ownership_flag TEXT NOT NULL DEFAULT 'domestic' CHECK(foreign_ownership_flag IN ('domestic','sadc_resident','non_sadc_foreign')),
  description            TEXT,
  chain_status           TEXT NOT NULL DEFAULT 'notification_submitted' CHECK(chain_status IN (
                           'notification_submitted','completeness_check','foreign_ownership_screen',
                           'competition_screen','technical_assessment','public_participation',
                           'nersa_evaluation','conditional_approval','control_transferred',
                           'withdrawn','rejected','appeal_filed','appeal_determined')),
  sla_due_at             TEXT,
  sla_breached           INTEGER NOT NULL DEFAULT 0,
  approval_granted_at    TEXT,
  control_transferred_at TEXT,
  rejected_at            TEXT,
  appeal_determined_at   TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ippcoc_participant ON oe_ipp_change_of_control(participant_id);
CREATE INDEX IF NOT EXISTS idx_ippcoc_project     ON oe_ipp_change_of_control(project_id);
CREATE INDEX IF NOT EXISTS idx_ippcoc_status      ON oe_ipp_change_of_control(chain_status);
CREATE INDEX IF NOT EXISTS idx_ippcoc_sla         ON oe_ipp_change_of_control(sla_due_at) WHERE sla_breached = 0;

-- Seed: 12 change-of-control records across ownership tiers, transaction types, and workflow stages
INSERT INTO oe_ipp_change_of_control VALUES
  -- Row 001: control_transferred — 75MW major share_transfer domestic; fully approved and transferred
  -- Cols: id(1) participant_id(2) project_id(3) capacity_mw(4) ownership_tier(5) transaction_type(6)
  --       transferor_name(7) acquirer_name(8) acquirer_ownership_pct(9) foreign_ownership_flag(10)
  --       description(11) chain_status(12) sla_due_at(13) sla_breached(14) approval_granted_at(15)
  --       control_transferred_at(16) rejected_at(17) appeal_determined_at(18) created_at(19) updated_at(20)
  ('coc_001','demo_ipp_001','ip_004',
   75,'major','share_transfer',
   'Greenfield Renewables (Pty) Ltd','Meridian Energy Fund II GP',
   51.0,'domestic',
   'De Aar 75MW Wind — majority share transfer; NERSA licence condition 4 notification; fully approved and control transferred',
   'control_transferred',
   NULL,0,
   datetime('now','-160 days'),datetime('now','-150 days'),
   NULL,NULL,
   datetime('now','-200 days'),datetime('now','-150 days')),

  -- Row 002: notification_submitted — 500MW material merger_scheme_of_arrangement non_sadc_foreign; SLA +210 days
  ('coc_002','demo_ipp_001','proj_nxt_solar_001',
   500,'material','merger_scheme_of_arrangement',
   'SA Solar Holdings Ltd','Nordic Renewables Global AS',
   100.0,'non_sadc_foreign',
   '500MW PV portfolio — cross-border merger scheme; Competition Commission + NERSA + SARB ExCon notifications lodged; SLA 210 days (material)',
   'notification_submitted',
   datetime('now','+210 days'),0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-3 days'),datetime('now','-3 days')),

  -- Row 003: technical_assessment — 100MW significant fund_recycling domestic; SLA +90 days
  ('coc_003','demo_ipp_001','proj_nxt_solar_001',
   100,'significant','fund_recycling',
   'Vantax Infrastructure Fund I','Vantax Infrastructure Fund II',
   49.0,'domestic',
   '100MW Wind — intra-group fund recycling; technical capability assessment of successor fund vehicle underway',
   'technical_assessment',
   datetime('now','+90 days'),0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-45 days'),datetime('now','-12 days')),

  -- Row 004: nersa_evaluation — 300MW major asset_acquisition sadc_resident; SLA +130 days
  ('coc_004','demo_ipp_001','ip_004',
   300,'major','asset_acquisition',
   'Highveld Power Partners (Pty) Ltd','Botswana Power Corporation',
   74.9,'sadc_resident',
   '300MW CSP — SADC parastatal asset acquisition; public participation closed; NERSA Council evaluation in progress',
   'nersa_evaluation',
   datetime('now','+130 days'),0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-75 days'),datetime('now','-8 days')),

  -- Row 005: conditional_approval — 200MW major share_transfer non_sadc_foreign; approval_granted_at set
  ('coc_005','demo_ipp_001','ip_004',
   200,'major','share_transfer',
   'Old Mutual Infrastructure Fund','Masdar Clean Energy B.V.',
   67.0,'non_sadc_foreign',
   '200MW Solar PV — UAE acquirer; NERSA granted conditional approval subject to local content covenant; awaiting condition fulfilment',
   'conditional_approval',
   NULL,0,
   datetime('now','-20 days'),NULL,
   NULL,NULL,
   datetime('now','-110 days'),datetime('now','-20 days')),

  -- Row 006: rejected — 50MW significant management_buyout domestic; sla_breached=1; rejected_at set
  ('coc_006','demo_ipp_002','proj_nxt_solar_001',
   50,'significant','management_buyout',
   'Suncorp Renewables (Pty) Ltd','Suncorp MBO SPV (Pty) Ltd',
   100.0,'domestic',
   '50MW Biomass — management buyout; NERSA rejected on technical competency grounds; SLA breached during evaluation',
   'rejected',
   datetime('now','-10 days'),1,
   NULL,NULL,
   datetime('now','-5 days'),NULL,
   datetime('now','-130 days'),datetime('now','-5 days')),

  -- Row 007: appeal_filed — 120MW significant fund_recycling domestic; rejected_at set from prior rejection
  ('coc_007','demo_ipp_002','ip_004',
   120,'significant','fund_recycling',
   'Empower Renewables Fund A','Empower Renewables Fund B',
   55.0,'domestic',
   '120MW Wind — fund recycling rejected on NERSA licence condition non-disclosure grounds; IPP lodged formal appeal',
   'appeal_filed',
   NULL,0,
   NULL,NULL,
   datetime('now','-50 days'),NULL,
   datetime('now','-160 days'),datetime('now','-50 days')),

  -- Row 008: withdrawn — 20MW moderate share_transfer domestic; no terminal timestamps
  ('coc_008','demo_ipp_002','proj_nxt_solar_001',
   20,'moderate','share_transfer',
   'Agri-Solar Partners CC','Bushveld Energy (Pty) Ltd',
   30.0,'domestic',
   '20MW agri-solar — minority share transfer withdrawn; parties elected to restructure as silent partnership outside licence condition threshold',
   'withdrawn',
   NULL,0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-40 days'),datetime('now','-25 days')),

  -- Row 009: completeness_check — 8MW moderate change_of_lender_step_in domestic; sla_due_at set
  ('coc_009','demo_ipp_001','proj_nxt_solar_001',
   8,'moderate','change_of_lender_step_in',
   'Absa Project Finance','Nedbank Infrastructure Finance',
   NULL,'domestic',
   '8MW C&I rooftop — lender step-in following covenant default; completeness check on notification documentation',
   'completeness_check',
   datetime('now','+35 days'),0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-7 days'),datetime('now','-7 days')),

  -- Row 010: competition_screen — 250MW major asset_acquisition non_sadc_foreign; SLA +115 days
  ('coc_010','demo_ipp_001','ip_004',
   250,'major','asset_acquisition',
   'Umoya Energy (Pty) Ltd','Total Energies Renewables Africa SAS',
   80.0,'non_sadc_foreign',
   '250MW Wind — French acquirer; Competition Commission merger filing lodged; competition screen running in parallel with NERSA review',
   'competition_screen',
   datetime('now','+115 days'),0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-55 days'),datetime('now','-18 days')),

  -- Row 011: control_transferred — 600MW material merger_scheme_of_arrangement sadc_resident; all terminal timestamps set
  ('coc_011','demo_ipp_002','ip_004',
   600,'material','merger_scheme_of_arrangement',
   'ZESCO Renewables Ltd','ZESCO-OE Consortium SPV',
   51.0,'sadc_resident',
   '600MW hybrid portfolio — Zambian parastatal consortium merger; NERSA approved; Competition Commission approved; control fully transferred',
   'control_transferred',
   NULL,0,
   datetime('now','-240 days'),datetime('now','-220 days'),
   NULL,NULL,
   datetime('now','-420 days'),datetime('now','-220 days')),

  -- Row 012: foreign_ownership_screen — 3MW minor share_transfer sadc_resident; sla_due_at +25 days
  ('coc_012','demo_ipp_002','proj_nxt_solar_001',
   3,'minor','share_transfer',
   'Limpopo Agri Solar CC','Mozambique Solar Co-op',
   15.0,'sadc_resident',
   '3MW carport solar — SADC minority stake; foreign ownership screen triggered by cross-border beneficial ownership; fast-track minor tier',
   'foreign_ownership_screen',
   datetime('now','+25 days'),0,
   NULL,NULL,
   NULL,NULL,
   datetime('now','-6 days'),datetime('now','-6 days'));
