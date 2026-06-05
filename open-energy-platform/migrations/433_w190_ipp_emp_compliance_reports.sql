-- Migration 433: Wave 190 — IPP Environmental Management Plan Annual Compliance Report
-- Table: oe_emp_compliance_reports
-- 12-state chain covering the annual EMP compliance reporting lifecycle for IPP entities
-- Regulatory basis: NEMA s24N + NEMA s24O + DEA EMP Guideline 2010 + REIPPPP Schedule 5

CREATE TABLE IF NOT EXISTS oe_emp_compliance_reports (
  id TEXT PRIMARY KEY,
  ipp_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  plant_mw REAL NOT NULL DEFAULT 0,
  annual_revenue_zar REAL NOT NULL DEFAULT 0,
  report_year INTEGER NOT NULL,
  eco_name TEXT,
  incident_count INTEGER NOT NULL DEFAULT 0,
  mitigation_status TEXT NOT NULL DEFAULT 'on_track',
  chain_status TEXT NOT NULL DEFAULT 'report_period_opened',
  tier TEXT NOT NULL DEFAULT 'small',
  sla_deadline TEXT,
  sla_breached INTEGER NOT NULL DEFAULT 0,
  regulator_notified INTEGER NOT NULL DEFAULT 0,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_emp_compliance_reports_ipp    ON oe_emp_compliance_reports(ipp_id);
CREATE INDEX IF NOT EXISTS idx_emp_compliance_reports_status ON oe_emp_compliance_reports(chain_status);
CREATE INDEX IF NOT EXISTS idx_emp_compliance_reports_tier   ON oe_emp_compliance_reports(tier);
CREATE INDEX IF NOT EXISTS idx_emp_compliance_reports_sla    ON oe_emp_compliance_reports(sla_deadline, sla_breached);

-- ─── Seed: 12 rows covering all 5 tiers and all 3 terminal states ─────────────

-- empr-001 · report_period_opened · small · 4.8 MW · ZAR 6 200 000 · 2025
-- Loeriesfontein small battery-backed solar farm; Northern Cape; 45-day SLA
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-001','ipp-001','Loeriesfontein Solar Holdings (Pty) Ltd',4.8,6200000.00,
   2025,'Dr A Steenkamp',0,'on_track',
   'report_period_opened','small','2025-03-16',0,0,
   'admin-seed',
   'Annual EMP compliance reporting period opened for calendar year 2025; NEMA s24N obligation triggered on 31 January 2025; ECO appointed Dr A Steenkamp from Green Audit Solutions; site inspection scheduled for 14 February 2025; ECO data collection request issued to site manager; 45-day SLA runs to 16 March 2025; plant is a 4.8 MW ground-mounted PV facility in the Northern Cape');

-- empr-002 · eco_data_collection · small · 7.2 MW · ZAR 9 400 000 · 2025
-- Dreunberg Solar; Eastern Cape; 45-day SLA; on track
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-002','ipp-002','Dreunberg Solar (Pty) Ltd',7.2,9400000.00,
   2025,'Ms B Fourie',1,'on_track',
   'eco_data_collection','small','2025-04-05',0,0,
   'admin-seed',
   'ECO Ms B Fourie from Enviro Africa conducting annual data collection at Dreunberg 7.2 MW solar farm near Pearston Eastern Cape; one minor incident logged in October 2024 involving a topsoil stockpile boundary exceedance; photographic evidence and GPS coordinates compiled; water quality monitoring results from Sundays River tributary forwarded by field technician; biodiversity transect surveys complete; 45-day SLA deadline 5 April 2025');

-- empr-003 · report_lapsed · small · 6.1 MW · ZAR 7 800 000 · 2024
-- Soutpan Wind Energy; Free State; SLA breached; terminal lapsed
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-003','ipp-003','Soutpan Wind Energy (Pty) Ltd',6.1,7800000.00,
   2024,'Mr C van Wyk',2,'delayed',
   'report_lapsed','small','2024-03-15',1,1,
   'admin-seed',
   'Annual EMP compliance report for 2024 lapsed without submission; ECO Mr C van Wyk resigned in January 2024 and a replacement was not appointed before the 15 March 2024 SLA deadline; two recorded incidents including a stormwater channel erosion event at turbine T-04 and an oil spill from a transformer at the collector substation; DFFE provincial office notified of the lapse on 20 March 2024; REIPPPP unit at DPME also notified; corrective action plan to be submitted within 30 days of ECO replacement appointment; SLA breached');

-- empr-004 · monitoring_results_compilation · medium · 18.5 MW · ZAR 28 000 000 · 2025
-- Cookhouse Wind Farm; Eastern Cape; 60-day SLA; on track
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-004','ipp-004','Cookhouse Wind Farm (Pty) Ltd',18.5,28000000.00,
   2025,'Dr P Erasmus',0,'on_track',
   'monitoring_results_compilation','medium','2025-04-30',0,0,
   'admin-seed',
   'ECO Dr P Erasmus from SRK Consulting compiling 12-month monitoring dataset for Cookhouse Wind Farm 18.5 MW facility near Adelaide Eastern Cape; avifauna collision monitoring results covering 4 bat and 8 raptor monitoring transects being tabulated; acoustic monitoring at the R337 noise sensitive receptor confirms compliance with SANS 10103; dust fallout bucket results for Q1 to Q4 2025 within DEA threshold; 60-day SLA deadline 30 April 2025; no incidents recorded for 2025');

-- empr-005 · incident_review · medium · 32.0 MW · ZAR 46 500 000 · 2024
-- Amakhala Emoyeni Wind; Eastern Cape; 60-day SLA; incidents under review
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-005','ipp-005','Amakhala Emoyeni Wind (Pty) Ltd',32.0,46500000.00,
   2024,'Ms D Naidoo',3,'under_review',
   'incident_review','medium','2024-05-31',0,0,
   'admin-seed',
   'ECO Ms D Naidoo from CSIR reviewing three incidents recorded at Amakhala Emoyeni 32 MW wind farm for 2024: incident 1 is a raptor fatality (African Fish Eagle) at turbine T-07 on 3 April 2024 requiring DFFE notification under the Threatened or Protected Species Regulations; incident 2 is a fuel bunker overflow at the O and M yard on 17 July 2024; incident 3 is a construction access track erosion event following the October 2024 cut-off low; mitigation adequacy assessment in progress; 60-day SLA deadline 31 May 2024');

-- empr-006 · draft_report_preparation · large · 65.0 MW · ZAR 92 000 000 · 2025
-- Jeffreys Bay Wind Farm; Eastern Cape; 75-day SLA; on track
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-006','ipp-006','Jeffreys Bay Wind Farm (Pty) Ltd',65.0,92000000.00,
   2025,'Prof E Joubert',1,'on_track',
   'draft_report_preparation','large','2025-05-16',0,0,
   'admin-seed',
   'Prof E Joubert from NMU Environmental Institute preparing the draft EMP compliance report for Jeffreys Bay Wind Farm 65 MW facility; all monitoring datasets received and verified; one minor incident recorded being a temporary stormwater diversion blockage cleared within 48 hours; report structure follows DEA EMP Guideline 2010 format: Part A site description, Part B monitoring results per EMPr mitigation measure, Part C incident register, Part D corrective action register, Part E recommendations; draft expected for internal review by 25 April 2025; 75-day SLA deadline 16 May 2025');

-- empr-007 · internal_review · large · 80.0 MW · ZAR 116 000 000 · 2024
-- Nxuba Wind Energy; Eastern Cape; 75-day SLA; on track
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-007','ipp-007','Nxuba Wind Energy (Pty) Ltd',80.0,116000000.00,
   2024,'Dr F Motsepe',2,'on_track',
   'internal_review','large','2024-06-14',0,0,
   'admin-seed',
   'Draft EMP compliance report submitted by ECO Dr F Motsepe for Nxuba Wind Farm 80 MW facility near Adelaide Eastern Cape; internal review by IPP environmental manager and legal counsel underway; two incidents reviewed: a temporary noise exceedance at Receiver R2 during maintenance operations and a vegetation clearance buffer infringement at the eastern haul road; both incidents have documented corrective actions and close-out evidence; report being checked for compliance with REIPPPP Part C Annex 6 formatting requirements before submission to the competent authority; 75-day SLA deadline 14 June 2024');

-- empr-008 · eco_sign_off · large · 72.0 MW · ZAR 104 000 000 · 2025
-- Graaf-Reinet Solar Park; Eastern Cape; 75-day SLA; on track
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-008','ipp-008','Graaf-Reinet Solar Park (Pty) Ltd',72.0,104000000.00,
   2025,'Ms G Liebenberg',0,'on_track',
   'eco_sign_off','large','2025-06-05',0,0,
   'admin-seed',
   'ECO Ms G Liebenberg from Aurecon signing off the final draft EMP compliance report for Graaf-Reinet Solar Park 72 MW facility; all internal review comments from the IPP environmental manager incorporated; corrective action register updated with close-out dates and responsible persons for each item; no incidents recorded for 2025; ECO declaration of professional independence signed; report cover page, executive summary and ECO curriculum vitae attached; 75-day SLA deadline 5 June 2025; package ready for competent authority submission on Monday');

-- empr-009 · report_accepted · major · 140.0 MW · ZAR 195 000 000 · 2024
-- Perdekraal East Wind Farm; Western Cape; 90-day SLA; terminal positive
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-009','ipp-009','Perdekraal East Wind Farm (Pty) Ltd',140.0,195000000.00,
   2024,'Dr H Swanepoel',1,'closed_out',
   'report_accepted','major','2024-06-30',0,1,
   'admin-seed',
   'DFFE Western Cape provincial office accepted the 2024 EMP compliance report for Perdekraal East Wind Farm 140 MW facility on 18 June 2024; acceptance letter reference WC/EMP/2024/0412 received; one incident (short-duration turbidity spike in the Breede River tributary during the October 2023 rains) was reviewed and the corrective action (silt fence upgrade at crossing WR-03) was accepted as adequate; DFFE noted full compliance with all 47 EMPr conditions for 2024; REIPPPP unit and lender agent Nedbank CIB notified per facility agreement Schedule 12; report archived in the project document management system; 90-day SLA met with 12 days to spare');

-- empr-010 · competent_authority_submission · major · 165.0 MW · ZAR 228 000 000 · 2025
-- Roggeveld Wind Farm; Western Cape / Northern Cape; 90-day SLA; on track
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-010','ipp-010','Roggeveld Wind Farm (Pty) Ltd',165.0,228000000.00,
   2025,'Prof J Barnard',0,'on_track',
   'competent_authority_submission','major','2025-07-15',0,0,
   'admin-seed',
   'EMP compliance report for Roggeveld Wind Farm 165 MW facility submitted to DFFE Northern Cape and Western Cape provincial offices on 16 April 2025 via the SAWS-linked DEA GreenBook online submission portal; submission reference NC/EMP/2025/0187; no incidents recorded for 2025; Prof J Barnard from the University of the Free State served as ECO; report package: 148-page compliance report, 6 annexures, 312 photographic records, GPS-referenced bird and bat monitoring data from 18 monitoring stations; 90-day SLA deadline 15 July 2025; acknowledgement of receipt awaited');

-- empr-011 · report_rejected · flagship · 220.0 MW · ZAR 308 000 000 · 2024
-- Kangnas Wind Farm; Northern Cape; 120-day SLA; terminal negative; regulator notified
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-011','ipp-011','Kangnas Wind Farm (Pty) Ltd',220.0,308000000.00,
   2024,'Dr K Olivier',4,'non_compliant',
   'report_rejected','flagship','2024-07-30',0,1,
   'admin-seed',
   'DFFE Northern Cape provincial office rejected the 2024 EMP compliance report for Kangnas Wind Farm 220 MW on 22 July 2024; rejection reference NC/EMP/REJ/2024/0031; grounds for rejection: four incidents were inadequately described with insufficient corrective action evidence, the avifauna monitoring data for Q3 2024 was missing due to a field data logger malfunction, the groundwater monitoring section omitted results from boreholes GW-07 and GW-08, and the ECO independence declaration was not notarially confirmed as required by the updated DFFE guideline circular of March 2024; IPP has 30 calendar days to resubmit a corrected report; NERSA notified per operating licence condition OL-NC-2018-W-004 clause 14; lender agent Rand Merchant Bank notified per covenant schedule');

-- empr-012 · ca_review_in_progress · flagship · 285.0 MW · ZAR 398 000 000 · 2025
-- Loeriesfontein 2 Wind Farm; Northern Cape; 120-day SLA; under review
INSERT OR IGNORE INTO oe_emp_compliance_reports
  (id, ipp_id, project_name, plant_mw, annual_revenue_zar,
   report_year, eco_name, incident_count, mitigation_status,
   chain_status, tier, sla_deadline, sla_breached, regulator_notified,
   actor_id, reason)
VALUES
  ('empr-012','ipp-012','Loeriesfontein 2 Wind Farm (Pty) Ltd',285.0,398000000.00,
   2025,'Ms L Daniels',2,'on_track',
   'ca_review_in_progress','flagship','2025-09-28',0,0,
   'admin-seed',
   'DFFE Northern Cape provincial office conducting technical review of the 2025 EMP compliance report for Loeriesfontein 2 Wind Farm 285 MW facility; submission acknowledged under reference NC/EMP/2025/0094 on 9 June 2025; two incidents under review: a bat fatality cluster at turbine T-22 in June 2025 requiring population-level assessment by a chiropterologist, and a soil contamination event at the main transformer yard requiring a Phase 1 environmental site assessment; Ms L Daniels from WSP South Africa is ECO; DFFE reviewer Ms M Jacobs has 30 days from acknowledgement to issue a decision; 120-day SLA deadline 28 September 2025; lender consortium aware per quarterly reporting');
