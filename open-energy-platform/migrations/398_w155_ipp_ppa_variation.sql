-- W155: IPP PPA Variation & Amendment
-- ERA 4/2006 s.34 + NERSA Section 34 PPA amendment regime
-- INVERTED SLA: larger capacity / material variation = more regulatory scrutiny = more time
-- SIGNATURE: variation_approved crosses regulator EVERY tier (PPA amendment notifiable to NERSA)

CREATE TABLE IF NOT EXISTS oe_ipp_ppa_variation (
  id                    TEXT PRIMARY KEY,
  participant_id        TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  capacity_mw           REAL NOT NULL,
  variation_tier        TEXT NOT NULL CHECK(variation_tier IN ('minor','moderate','significant','major','material')),
  variation_type        TEXT CHECK(variation_type IN ('capacity_adjustment','tariff_revision','term_extension','offtaker_substitution','technical_parameters')),
  ppa_reference         TEXT,
  description           TEXT,
  chain_status          TEXT NOT NULL DEFAULT 'variation_requested' CHECK(chain_status IN (
                          'variation_requested','regulatory_screen','technical_review',
                          'commercial_review','public_participation','nersa_assessment',
                          'variation_approved','ppa_amended',
                          'withdrawn','rejected','appeal_filed','appeal_determined')),
  sla_due_at            TEXT,
  sla_breached          INTEGER NOT NULL DEFAULT 0,
  variation_approved_at TEXT,
  ppa_amended_at        TEXT,
  rejected_at           TEXT,
  appeal_determined_at  TEXT,
  agreement_reference   TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ippppavar_participant ON oe_ipp_ppa_variation(participant_id);
CREATE INDEX IF NOT EXISTS idx_ippppavar_project     ON oe_ipp_ppa_variation(project_id);
CREATE INDEX IF NOT EXISTS idx_ippppavar_status      ON oe_ipp_ppa_variation(chain_status);
CREATE INDEX IF NOT EXISTS idx_ippppavar_sla         ON oe_ipp_ppa_variation(sla_due_at) WHERE sla_breached = 0;

-- Seed: 12 PPA variation records across tiers, variation types, and workflow stages
INSERT INTO oe_ipp_ppa_variation VALUES
  -- Row 001: ppa_amended — 75MW major capacity_adjustment; fully executed amendment
  ('ppavar_001','demo_ipp_001','ip_004',
   75,'major','capacity_adjustment',
   'PPA-NERSA-2022-0341',
   'De Aar 75MW — capacity upward revision from 50MW to 75MW; NERSA approved and PPA amended',
   'ppa_amended',
   NULL,0,
   datetime('now','-90 days'),datetime('now','-75 days'),
   NULL,NULL,
   'PPA-NERSA-2022-0341-AMD-1',
   datetime('now','-200 days'),datetime('now','-75 days')),

  -- Row 002: variation_requested — 200MW material tariff_revision; SLA +240 days (material = most time)
  ('ppavar_002','demo_ipp_001','proj_nxt_solar_001',
   200,'material','tariff_revision',
   'PPA-NERSA-2023-0119',
   '200MW PV — CPI-linked tariff revision requested following fuel-price index trigger; initial submission',
   'variation_requested',
   datetime('now','+240 days'),0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-2 days'),datetime('now','-2 days')),

  -- Row 003: technical_review — 50MW significant term_extension; SLA +80 days
  ('ppavar_003','demo_ipp_001','proj_nxt_solar_001',
   50,'significant','term_extension',
   'PPA-NERSA-2021-0088',
   '50MW Wind — 5-year PPA term extension; technical life-assessment commissioned; under technical review',
   'technical_review',
   datetime('now','+80 days'),0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-30 days'),datetime('now','-10 days')),

  -- Row 004: public_participation — 120MW major offtaker_substitution; SLA +120 days
  ('ppavar_004','demo_ipp_001','ip_004',
   120,'major','offtaker_substitution',
   'PPA-NERSA-2020-0212',
   '120MW Solar — Eskom offtaker substitution to Rand Water; NERSA s.10 public participation window open',
   'public_participation',
   datetime('now','+120 days'),0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-60 days'),datetime('now','-5 days')),

  -- Row 005: nersa_assessment — 350MW major capacity_adjustment; SLA +100 days
  ('ppavar_005','demo_ipp_001','ip_004',
   350,'major','capacity_adjustment',
   'PPA-NERSA-2019-0057',
   '350MW Wind Phase 2 — capacity deration from 400MW to 350MW following grid constraints; NERSA council assessment',
   'nersa_assessment',
   datetime('now','+100 days'),0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-80 days'),datetime('now','-15 days')),

  -- Row 006: variation_approved — 25MW moderate technical_parameters; approved, awaiting amended PPA execution
  ('ppavar_006','demo_ipp_002','proj_nxt_solar_001',
   25,'moderate','technical_parameters',
   'PPA-NERSA-2023-0405',
   '25MW agri-solar — inverter technology parameters update; variation approved by NERSA; PPA amendment in drafting',
   'variation_approved',
   NULL,0,
   datetime('now','-10 days'),NULL,
   NULL,NULL,
   NULL,
   datetime('now','-55 days'),datetime('now','-10 days')),

  -- Row 007: rejected — 60MW significant tariff_revision; SLA breached; rejected
  ('ppavar_007','demo_ipp_001','ip_004',
   60,'significant','tariff_revision',
   'PPA-NERSA-2022-0331',
   '60MW CSP — tariff uplift request rejected; insufficient substantiation of cost basis; SLA breached',
   'rejected',
   datetime('now','-15 days'),1,
   NULL,NULL,
   datetime('now','-5 days'),NULL,
   NULL,
   datetime('now','-120 days'),datetime('now','-5 days')),

  -- Row 008: appeal_filed — 80MW major capacity_adjustment; rejected previously; appeal lodged
  ('ppavar_008','demo_ipp_001','ip_004',
   80,'major','capacity_adjustment',
   'PPA-NERSA-2021-0198',
   '80MW Biomass — capacity increase rejected; IPP filed appeal to NERSA Disputes Panel',
   'appeal_filed',
   NULL,0,
   NULL,NULL,
   datetime('now','-40 days'),NULL,
   NULL,
   datetime('now','-150 days'),datetime('now','-40 days')),

  -- Row 009: withdrawn — 10MW moderate term_extension; IPP withdrew request
  ('ppavar_009','demo_ipp_002','proj_nxt_solar_001',
   10,'moderate','term_extension',
   'PPA-NERSA-2024-0022',
   '10MW C&I rooftop — term extension withdrawn; off-taker elected to recontract via new PPA process',
   'withdrawn',
   NULL,0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-35 days'),datetime('now','-20 days')),

  -- Row 010: commercial_review — 15MW moderate technical_parameters; SLA +60 days
  ('ppavar_010','demo_ipp_002','proj_nxt_solar_001',
   15,'moderate','technical_parameters',
   'PPA-NERSA-2024-0076',
   '15MW floating solar — tracker system change; under commercial review for PPA schedule updates',
   'commercial_review',
   datetime('now','+60 days'),0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-18 days'),datetime('now','-6 days')),

  -- Row 011: regulatory_screen — 3MW minor capacity_adjustment; SLA +40 days (fast-track minor)
  ('ppavar_011','demo_ipp_002','proj_nxt_solar_001',
   3,'minor','capacity_adjustment',
   'PPA-NERSA-2024-0103',
   '3MW carport — minor capacity adjustment +0.5MW; regulatory screen for Schedule 2 exemption eligibility',
   'regulatory_screen',
   datetime('now','+40 days'),0,
   NULL,NULL,
   NULL,NULL,
   NULL,
   datetime('now','-5 days'),datetime('now','-2 days')),

  -- Row 012: ppa_amended — 500MW material offtaker_substitution; all terminal timestamps set
  ('ppavar_012','demo_ipp_001','ip_004',
   500,'material','offtaker_substitution',
   'PPA-NERSA-2018-0009',
   '500MW Wind — Eskom to NTCSA offtaker substitution; landmark NERSA approved variation; PPA fully amended',
   'ppa_amended',
   NULL,0,
   datetime('now','-200 days'),datetime('now','-185 days'),
   NULL,NULL,
   'PPA-NERSA-2018-0009-AMD-2',
   datetime('now','-400 days'),datetime('now','-185 days'));
