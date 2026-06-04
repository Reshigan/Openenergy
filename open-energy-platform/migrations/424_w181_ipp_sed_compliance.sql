-- W181: IPP Socio-Economic Development (SED) Compliance Lifecycle
-- REIPPPP / DMRE SED spend obligation management cycle:
-- sed_triggered → beneficiary_identification → programme_planning → board_approval →
-- spend_execution → expenditure_verification → independent_audit → audit_complete →
-- dmre_submission → sed_compliant / sed_non_compliant / sed_lapsed.
--
-- 18 columns (id + 17 data columns):
--   id, project_ref, compliance_year, annual_revenue_zar, revenue_tier,
--   sed_spend_zar, sed_spend_pct, focus_area,
--   auditor_name, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_sed_compliance (
  id                          TEXT    PRIMARY KEY,
  project_ref                 TEXT    NOT NULL,
  compliance_year             INTEGER NOT NULL,
  annual_revenue_zar          REAL    NOT NULL,
  revenue_tier                TEXT    NOT NULL
                                      CHECK(revenue_tier IN (
                                        'micro','small','medium','large','major'
                                      )),
  sed_spend_zar               REAL,
  sed_spend_pct               REAL,
  focus_area                  TEXT    NOT NULL DEFAULT 'comprehensive'
                                      CHECK(focus_area IN (
                                        'education',
                                        'healthcare',
                                        'infrastructure',
                                        'skills_development',
                                        'enterprise_development',
                                        'environmental',
                                        'comprehensive'
                                      )),
  auditor_name                TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'sed_triggered'
                                      CHECK(chain_status IN (
                                        'sed_triggered',
                                        'beneficiary_identification',
                                        'programme_planning',
                                        'board_approval',
                                        'spend_execution',
                                        'expenditure_verification',
                                        'independent_audit',
                                        'audit_complete',
                                        'dmre_submission',
                                        'sed_compliant',
                                        'sed_non_compliant',
                                        'sed_lapsed'
                                      )),
  sla_due_date                TEXT,
  sla_breached                INTEGER NOT NULL DEFAULT 0,
  is_reportable               INTEGER NOT NULL DEFAULT 0,
  actor_party                 TEXT,
  reason                      TEXT,
  notes                       TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ipp_sed_project
  ON oe_ipp_sed_compliance(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_sed_status
  ON oe_ipp_sed_compliance(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_sed_sla
  ON oe_ipp_sed_compliance(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:compliance_year  4:annual_revenue_zar  5:revenue_tier
--  6:sed_spend_zar  7:sed_spend_pct  8:focus_area
--  9:auditor_name  10:chain_status
--  11:sla_due_date  12:sla_breached  13:is_reportable
--  14:actor_party  15:reason  16:notes
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_sed_compliance VALUES
  (
    -- sed_triggered: micro 20MW solar (R7M revenue) — SED obligation triggered by REIPPPP Implementation Agreement signature; 1% SED = R70k; beneficiary identification not yet commenced
    'sed_001',
    'SOLAR-COM-NC-001',
    2026,
    7000000.0,
    'micro',
    70000.0,
    1.0,
    'education',
    NULL,
    'sed_triggered',
    datetime('now', '+60 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'REIPPPP Implementation Agreement signed 2026-05-28 for the 20 MW Northern Cape solar project (BW7 preferred bidder). SED obligation triggered per Schedule 5 paragraph 2.1: minimum 1% of annual revenue must be spent on approved SED activities per compliance year. Annual revenue basis R7.0M; SED commitment R70k. Focus area designated as education per IPP socio-economic development plan submitted with bid documents. Programme to benefit learners in Riemvasmaak and Kakamas communities (approximately 1 400 school-age beneficiaries across 4 primary schools). SED programme manager appointed internally — project manager M. Dlamini designated as SED liaison and reporting officer for DMRE IPP Office. Beneficiary identification process to commence within 30 days of IA signature per REIPPPP SED Compliance Procedure 2023. Community liaison officer to be appointed from local ward committee. SLA deadline for beneficiary identification 2026-07-28.',
    '2026-05-28T08:00:00Z',
    '2026-05-28T10:00:00Z'
  ),
  (
    -- beneficiary_identification: small 75MW wind (R28M revenue) — community beneficiaries and target institutions identified; programme planning not yet commenced; 1.5% SED = R420k
    'sed_002',
    'WIND-EC-SML-002',
    2026,
    28000000.0,
    'small',
    420000.0,
    1.5,
    'healthcare',
    NULL,
    'beneficiary_identification',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Beneficiary identification process underway for the 75 MW Eastern Cape wind project (Kouga municipality footprint). SED commitment: 1.5% of R28M annual revenue = R420k, focus area healthcare. Identified beneficiaries: Humansdorp Community Health Centre (primary), Kouga sub-district mobile clinic programme (secondary), and three rural clinic satellite nodes serving farm worker communities (wards 4, 8, 12; approximately 3 200 beneficiary households). Community liaison officer T. Nkosi (ward 4 representative) engaged by IPP to facilitate beneficiary consultation sessions. Sessions held 2026-05-18 and 2026-05-25; attendance registers signed by ward health committee representatives and local clinic managers. Identified: 1 district hospital, 3 community health centres, 2 mobile clinic routes, 1 farmworker health access programme. SED programme design brief submitted to IPP board for review. Healthcare equipment procurement list under preparation with input from Kouga sub-district health management team. Next milestone: programme planning workshop with beneficiary institutions scheduled 2026-06-22.',
    '2026-05-10T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- programme_planning: medium 100MW solar (R85M revenue) — SED programme plan drafted; board approval pending; 1.5% SED = R1.275M; focus: skills_development
    'sed_003',
    'SOLAR-FS-MED-003',
    2026,
    85000000.0,
    'medium',
    1275000.0,
    1.5,
    'skills_development',
    NULL,
    'programme_planning',
    datetime('now', '+35 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'SED programme plan drafted for the 100 MW Free State solar park (compliance year 2026). Annual revenue R85M; SED commitment 1.5% = R1.275M. Focus area: skills development aligned with the IPP bid commitment and local municipal IDP priority. Programme plan developed by SiyaQhuba Development Consultants (reference SQ-SED-2026-FS-003, dated 2026-05-28) covering three workstreams: (1) Solar PV installation and maintenance artisan programme — R600k, 48 participants, Goldfields TVET College, 6-month accredited course SAQA ID 67465; (2) Electrical engineering bursary scheme — R400k, 8 bursaries for University of the Free State engineering faculty, targeting local Matric 2025 graduates; (3) Entrepreneurship and small-contractor development — R275k, 20 SMME participants, 3-month programme with SEDA accredited facilitator. Beneficiary confirmation letters received from Goldfields TVET College (signed principal B. van der Merwe) and UFS Faculty of Engineering (signed HOD Prof. T. Mokoena). Programme plan submitted to IPP board of directors for approval. Board meeting scheduled 2026-06-20 with SED sub-committee review 2026-06-15. DMRE IPP Office notified of programme planning milestone per IA clause 9.2.',
    '2026-04-15T08:00:00Z',
    '2026-06-02T14:00:00Z'
  ),
  (
    -- board_approval: large 250MW wind (R320M revenue) — IPP board approved SED programme and budget; spend execution commencing; 2% SED = R6.4M; focus: infrastructure
    'sed_004',
    'WIND-WC-LRG-004',
    2026,
    320000000.0,
    'large',
    6400000.0,
    2.0,
    'infrastructure',
    NULL,
    'board_approval',
    datetime('now', '+28 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'IPP board of directors passed resolution on 2026-06-02 approving the 2026 SED programme and budget of R6.4M for the 250 MW Western Cape wind farm. Resolution number WC-WIND-BRD-2026-RES-007. SED budget breakdown: (1) Infrastructure — rural school WASH facilities (Matzikama district, 6 primary schools): R2.8M; (2) Infrastructure — community access road rehabilitation (Doringbaai–Papendorp, 3.2 km gravel): R1.9M; (3) Infrastructure — community hall renovation and solar mini-grid (Strandfontein community centre): R1.2M; (4) SED programme management and M&E: R500k. Programme implementation partners appointed: Techno-Build Infrastructure (Pty) Ltd (WASH facilities, roads), SolarAid SA (mini-grid), SiyaQhuba (M&E). DMRE IPP Office notified of board approval per IA clause 9.3. Spend execution authorised to commence 2026-06-10 upon contractor SLA signing. Procurement and contracting for school WASH facilities underway — tender awarded to Techno-Build Infrastructure at R2.79M (within budget). SMEC South Africa engaged as independent engineer to oversee infrastructure works and confirm completion milestones. SLA deadline for expenditure completion 2026-10-31.',
    '2026-03-01T08:00:00Z',
    '2026-06-02T16:00:00Z'
  ),
  (
    -- spend_execution: major 500MW solar (R820M revenue) — SED programme R16.4M in active delivery; contractors on site; 2% SED; focus: comprehensive
    'sed_005',
    'SOLAR-NC-MAJ-005',
    2026,
    820000000.0,
    'major',
    16400000.0,
    2.0,
    'comprehensive',
    NULL,
    'spend_execution',
    datetime('now', '+20 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'SED programme for the 500 MW Northern Cape solar park (Kathu extension) in active delivery. Annual revenue R820M; SED spend R16.4M (2% commitment). Comprehensive programme across all focus areas per REIPPPP BW6 bid commitment. Programme workstreams in execution: (1) Education — R4.2M: 3 school lab upgrades (John Taolo Gaetsewe district), 20 bursaries, 1 early childhood centre construction (Deben community); (2) Healthcare — R2.8M: mobile clinic vehicle procurement for John Taolo Gaetsewe district sub-district, medication storage facility renovation at Kuruman hospital; (3) Infrastructure — R3.5M: borehole rehabilitation (14 boreholes, Kalahari communities), solar water pumping systems (8 sites); (4) Skills development — R2.9M: solar O&M technician training (60 participants, NCAP TVET), electrical artisan RPL programme (30 participants); (5) Enterprise development — R1.8M: SMME incubation hub Kathu (20 businesses, 18-month programme); (6) Environmental — R1.2M: indigenous fynbos rehabilitation programme (500ha, partnered with SANParks). All contractors mobilised; 40% of programme spend committed via signed SLAs and invoices as at 2026-06-02. Programme M&E by Grant Thornton Sustainability Advisory (monthly milestone reports). DMRE IPP Office programme officer N. Mthembu conducting quarterly site visits.',
    '2026-02-01T08:00:00Z',
    '2026-06-02T09:00:00Z'
  ),
  (
    -- expenditure_verification: micro 20MW solar (R7M revenue) — SED spend R70k completed; third-party expenditure verification in progress; focus: education
    'sed_006',
    'SOLAR-LP-MCR-006',
    2026,
    7000000.0,
    'micro',
    70000.0,
    1.0,
    'education',
    'BDO South Africa',
    'expenditure_verification',
    datetime('now', '+15 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'SED expenditure of R70k completed for the 20 MW Limpopo solar project (compliance year 2026; 1% of R7M annual revenue). Focus: education. Programme executed: (1) School stationery and textbooks supply pack programme for Mokopane Circuit primary schools — R45k (4 schools, 820 learners; supplier Baobab Educational Supplies, invoice BSS-2026-LP-004, paid 2026-05-20); (2) Grade 12 mathematics support camp — R25k (Thabo Mbeki Secondary School, 38 learners, 3-day camp facilitated by Khumba Tutoring Services, invoice KTS-2026-LP-011, paid 2026-05-28). All invoices stamped and certified by programme manager. BDO South Africa (reference BDO-SED-VER-2026-LP-006) appointed as third-party expenditure verifier per IA clause 9.5. BDO desk review commenced 2026-06-01: invoices, payment confirmations, and beneficiary attendance registers submitted. BDO field visit to Thabo Mbeki Secondary scheduled 2026-06-08 to confirm programme delivery with school principal. BDO verification report expected by 2026-06-18. Upon BDO sign-off, independent audit to commence immediately (same firm for audit, per DMRE micro-tier single-step approval process).',
    '2026-02-15T08:00:00Z',
    '2026-06-02T13:00:00Z'
  ),
  (
    -- independent_audit: small 75MW wind (R28M revenue) — BDO verifying expenditure; KPMG independent audit of SED programme in progress; R420k; focus: healthcare
    'sed_007',
    'WIND-KZN-SML-007',
    2026,
    28000000.0,
    'small',
    420000.0,
    1.5,
    'healthcare',
    'KPMG',
    'independent_audit',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'KPMG conducting independent SED audit for the 75 MW KwaZulu-Natal wind project (compliance year 2026). SED spend R420k (1.5% of R28M annual revenue), focus healthcare. Programme executed and expenditure verified: (1) Eshowe District Hospital paediatric ward equipment — R180k (3 infant warmers, 2 phototherapy units, 1 portable ultrasound; medical equipment supplier MedEquip KZN, all installed and commissioned 2026-04-28; expenditure verified by BDO on 2026-05-20); (2) Community health worker training stipend programme — R140k (20 CHWs, 4-month placement stipends, Ugu sub-district health department partnership, final stipend payments 2026-05-31); (3) Mobile clinic fuel and consumables grant — R100k (iLembe District mobile clinic unit, quarterly fuel and consumables April–June 2026, verified against district fleet records). KPMG audit team (engagement manager: A. Moodley, KPMG Durban) commenced field audit 2026-06-01. Audit scope: expenditure substantiation, beneficiary verification, programme delivery confirmation, compliance with DMRE SED Audit Standard 2023. Hospital site visit completed 2026-06-02; CHW beneficiary sample interview conducted. KPMG draft audit report expected 2026-06-12.',
    '2026-03-01T08:00:00Z',
    '2026-06-02T13:00:00Z'
  ),
  (
    -- audit_complete: medium 100MW solar (R85M revenue) — Deloitte independent audit complete; DMRE submission package under final review; R1.275M; focus: skills_development
    'sed_008',
    'SOLAR-MPU-MED-008',
    2026,
    85000000.0,
    'medium',
    1275000.0,
    1.5,
    'skills_development',
    'Deloitte',
    'audit_complete',
    datetime('now', '+7 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'Deloitte independent SED audit completed for the 100 MW Mpumalanga solar project (compliance year 2026). Audit reference: DEL-SED-AUD-2026-MPU-008, signed off by Deloitte partner T. van Niekerk on 2026-06-01. SED spend R1.275M (1.5% of R85M revenue), focus skills development. Three programme workstreams audited and confirmed compliant: (1) Solar PV artisan programme — R580k: 42 participants completed SAQA-accredited course at Nkangala TVET; certificates issued; Deloitte confirmed delivery via TVET principal sign-off and student records review; (2) Engineering bursary scheme — R395k: 7 bursaries paid to UNISA Engineering faculty learners from Steve Tshwete LM; student enrolment and academic progress confirmed; (3) SMME contractor development — R300k: 18 participants completed 3-month SED programme with SEDA facilitator; business plans filed. Deloitte audit opinion: unqualified — all expenditure substantiated, all programme outputs delivered, beneficiaries verified. SED audit report incorporated into DMRE submission package. Submission package under final legal review by Cliffe Dekker Hofmeyr (CDH) against DMRE SED Compliance Checklist 2024 edition. CDH review completion expected 2026-06-09; DMRE submission to follow immediately.',
    '2026-02-01T08:00:00Z',
    '2026-06-02T16:00:00Z'
  ),
  (
    -- dmre_submission: large 250MW wind (R320M revenue) — SED compliance dossier submitted to DMRE IPP Office; awaiting formal assessment; R6.4M; focus: infrastructure
    'sed_009',
    'WIND-FS-LRG-009',
    2025,
    320000000.0,
    'large',
    6400000.0,
    2.0,
    'infrastructure',
    'PwC South Africa',
    'dmre_submission',
    datetime('now', '+5 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'SED compliance dossier for the 250 MW Free State wind project (compliance year 2025) submitted to DMRE IPP Office on 2026-06-01. Submission reference DMRE-SED-2025-FS-009 issued by DMRE on receipt. Dossier contents: (1) SED programme plan and board approval resolution; (2) programme implementation evidence — Thaba Nchu rural school WASH upgrades (5 schools, R3.1M, completion certificates from Mangaung Metro Works Department); community access road (4.5 km, R2.1M, engineering sign-off by WSP South Africa); Springfontein community centre solar mini-grid (R1.2M, NERSA connection notice); (3) independent expenditure verification report (PwC South Africa, reference PwC-SED-VER-2025-FS-009, dated 2026-04-30, unqualified opinion); (4) independent audit report (PwC, dated 2026-05-20, signed partner R. Pretorius, unqualified opinion); (5) SMEC independent engineer attestation of infrastructure quality and community acceptance. DMRE IPP Office acknowledged receipt 2026-06-01 and confirmed 15-business-day assessment window per REIPPPP SED Procedure note 2023-09. Formal assessment by DMRE empowerment desk underway. SLA deadline for DMRE determination 2026-06-22.',
    '2025-10-01T08:00:00Z',
    '2026-06-01T11:00:00Z'
  ),
  (
    -- sed_compliant: large 250MW wind (R320M revenue) — DMRE confirmed full SED compliance for FY2025; is_reportable=1
    'sed_010',
    'WIND-WC-LRG-010',
    2025,
    320000000.0,
    'large',
    6400000.0,
    2.0,
    'infrastructure',
    'Grant Thornton',
    'sed_compliant',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'DMRE IPP Office confirmed full SED compliance for compliance year 2025. SED spend of R6.4M (2% of R320M revenue) independently audited and verified. All infrastructure programme outputs delivered and accepted. SED compliance certificate DMRE-SED-CERT-2025-WC-010 issued. REIPPPP programme office notified.',
    'DMRE IPP Office issued formal SED compliance certificate (DMRE-SED-CERT-2025-WC-010) on 2025-12-18 for the 250 MW Western Cape wind farm (compliance year 2025). Assessment confirmed: (1) SED spend R6.4M (2% of R320M annual revenue) — fully substantiated against invoices and payment records; (2) infrastructure focus area programmes delivered: Matzikama rural WASH upgrades (6 schools, R2.8M, community acceptance reports signed); Doringbaai access road (3.2 km, R1.9M, engineering completion certificate WSP SA); Strandfontein community centre mini-grid (R1.2M, operational); (3) Grant Thornton independent audit confirmed unqualified opinion on expenditure and delivery; (4) independent engineer (SMEC SA) physical inspection reports on-file confirming all infrastructure built to specification and handed over to community. is_reportable=1 (large-tier SED compliance confirmation triggers mandatory REIPPPP programme office reporting and updates DMRE IPP annual performance scorecard for the BW5 programme cohort). SED compliance certificate valid for compliance year 2025; new 2026 SED cycle triggered per IA Schedule 5 paragraph 6.1.',
    '2025-01-15T08:00:00Z',
    '2025-12-18T14:00:00Z'
  ),
  (
    -- sed_non_compliant: micro 20MW solar (R7M revenue) — SED spend not made within SLA; DMRE non-compliance notice issued; sla_breached=1, is_reportable=1
    'sed_011',
    'SOLAR-COM-NW-011',
    2025,
    7000000.0,
    'micro',
    NULL,
    NULL,
    'education',
    NULL,
    'sed_non_compliant',
    datetime('now', '-5 days'),
    1,
    1,
    'p_ipp_dev_003',
    'DMRE IPP Office determined SED non-compliance for compliance year 2025: (1) no SED spend executed against the R70k (1% of R7M) annual commitment; (2) no beneficiary identification completed; (3) no SED programme plan filed with DMRE. Non-compliance notice DMRE-SED-NC-2025-NW-011 issued. IPP has 30-day cure period to remediate or face Implementation Agreement suspension.',
    'DMRE IPP Office issued non-compliance notice (DMRE-SED-NC-2025-NW-011) on 2026-05-28 for the 20 MW North West solar project (compliance year 2025). Three non-compliance findings: (1) required SED spend of R70k (1% of R7M annual revenue) not executed — no programme plan filed, no beneficiary identification undertaken, no spend commitment made for compliance year 2025; (2) no SED programme documentation submitted to DMRE by the required annual deadline of 2025-11-30 per IA Schedule 5 paragraph 3.4; (3) no independent audit or third-party verification obtained. SLA breach: DMRE internal SED assessment SLA 15 business days from annual filing deadline; exceeded by 5 days at non-compliance notice issuance. is_reportable=1 (micro-tier SED non-compliance triggers REIPPPP programme office watch-list and DMRE remediation register — first instance; second instance triggers IA cure process per clause 9.9). IPP issued 30-day cure notice. Failure to cure within 30 days triggers escalation to DMRE legal enforcement unit.',
    '2025-06-01T08:00:00Z',
    '2026-05-28T15:00:00Z'
  ),
  (
    -- sed_lapsed: small 75MW wind (R28M revenue) — SED obligations not met for two consecutive years; compliance lapsed; sla_breached=1, is_reportable=1
    'sed_012',
    'WIND-EC-SML-012',
    2024,
    28000000.0,
    'small',
    NULL,
    NULL,
    'healthcare',
    NULL,
    'sed_lapsed',
    datetime('now', '-20 days'),
    1,
    1,
    'p_ipp_dev_001',
    'SED obligations lapsed following two consecutive years of non-compliance (2023 and 2024). DMRE IPP Office declared SED lapse on 2026-05-12. Required SED spend of R420k (1.5% of R28M revenue) for both 2023 and 2024 not executed. Non-compliance notices issued for both years with no remediation received. DMRE escalated to REIPPPP programme director for Implementation Agreement remediation review and penalty assessment.',
    'DMRE IPP Office declared SED lapse (DMRE-SED-LAPSED-2024-EC-012) on 2026-05-12 for the 75 MW Eastern Cape wind project (compliance year 2024). Root cause: IPP project company entered voluntary business rescue in 2023 (BRP: A. van der Berg, BRP-CIPC-2023-EC-0189); SED budget ringfencing waived under business rescue plan by BRP without DMRE consent. No SED programme executed and no spend made for compliance years 2023 or 2024. Required SED spend: R420k (2023) + R420k (2024) = R840k total unspent. DMRE issued non-compliance notices for both years (DMRE-SED-NC-2023-EC-012 and DMRE-SED-NC-2024-EC-012) with no remediation received within cure periods. Business rescue plan concluded without restoring SED commitment. DMRE declared full SED lapse — Implementation Agreement clause 9.11 provides that a lapsed SED obligation converts to a financial penalty payable to the REIPPPP Community Development Fund equal to 150% of cumulative unspent SED obligation (R1.26M penalty). SLA breach 20 days. is_reportable=1 (SED lapse is a mandatory REIPPPP programme office and DMRE board-level reportable event for small-tier projects). IPP required to file a remediation plan within 60 days or face IA termination proceedings.',
    '2024-01-01T08:00:00Z',
    '2026-05-12T10:00:00Z'
  );
