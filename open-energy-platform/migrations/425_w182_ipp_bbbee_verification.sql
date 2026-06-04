-- W182: IPP B-BBEE Verification Lifecycle
-- REIPPPP / DMRE B-BBEE equity certification cycle:
-- verification_triggered → documentation_preparation → agency_engagement →
-- data_submission → agency_assessment → preliminary_score_issued → ipp_review →
-- final_assessment → certificate_issued → bbbee_verified / bbbee_non_compliant /
-- certificate_lapsed.
--
-- 20 columns (id + 19 data columns):
--   id, project_ref, verification_year, bbbee_target_pct, equity_tier,
--   bbbee_score, bbbee_level, agency_name, certificate_expiry,
--   chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_bbbee_verification (
  id                          TEXT    PRIMARY KEY,
  project_ref                 TEXT    NOT NULL,
  verification_year           INTEGER NOT NULL,
  bbbee_target_pct            REAL    NOT NULL,
  equity_tier                 TEXT    NOT NULL
                                      CHECK(equity_tier IN (
                                        'standard',
                                        'enhanced',
                                        'majority',
                                        'transformative',
                                        'exemplary'
                                      )),
  bbbee_score                 REAL,
  bbbee_level                 INTEGER,
  agency_name                 TEXT,
  certificate_expiry          TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'verification_triggered'
                                      CHECK(chain_status IN (
                                        'verification_triggered',
                                        'documentation_preparation',
                                        'agency_engagement',
                                        'data_submission',
                                        'agency_assessment',
                                        'preliminary_score_issued',
                                        'ipp_review',
                                        'final_assessment',
                                        'certificate_issued',
                                        'bbbee_verified',
                                        'bbbee_non_compliant',
                                        'certificate_lapsed'
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

CREATE INDEX IF NOT EXISTS idx_ipp_bbbee_project
  ON oe_ipp_bbbee_verification(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_bbbee_status
  ON oe_ipp_bbbee_verification(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_bbbee_sla
  ON oe_ipp_bbbee_verification(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:verification_year  4:bbbee_target_pct  5:equity_tier
--  6:bbbee_score  7:bbbee_level  8:agency_name  9:certificate_expiry
--  10:chain_status
--  11:sla_due_date  12:sla_breached  13:is_reportable
--  14:actor_party  15:reason  16:notes
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_bbbee_verification VALUES
  (
    -- verification_triggered: standard tier 20MW solar (20% black equity target) —
    -- REIPPPP Implementation Agreement triggers annual B-BBEE verification cycle;
    -- documentation preparation not yet commenced.
    'bbbee_001',
    'SOLAR-COM-NC-001',
    2026,
    20.0,
    'standard',
    NULL,
    NULL,
    NULL,
    NULL,
    'verification_triggered',
    datetime('now', '+60 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'B-BBEE verification cycle triggered for the 20 MW Northern Cape solar project (verification year 2026). Black equity target: 20% (standard tier, below the 26% enhanced threshold) per REIPPPP BW7 bid commitment and Implementation Agreement Schedule 4 paragraph 3.1. Verification triggered by annual compliance calendar event on 2026-05-28 — REIPPPP IPP Office issues annual B-BBEE verification instruction to preferred bidders and operational IPPs by 1 June each year. B-BBEE status: company is privately held; black shareholders (20% ordinary equity) are Kgalagadi Community Investment Trust (15%) and individual black directors (5%). Equity structure confirmed in shareholders register submitted with BW7 bid documents. Annual B-BBEE verification required to maintain REIPPPP compliance status and sustained black ownership equity scoring under the dtic Codes of Good Practice (Ownership scorecard element — 25 points). Verification agent to be appointed from SANAS-accredited verification agencies panel per REIPPPP procurement process. Documentation preparation checklist to be issued to IPP finance team within 5 business days. SLA deadline for documentation preparation: 2026-07-28 per IPP B-BBEE verification procedure schedule.',
    '2026-05-28T08:00:00Z',
    '2026-05-28T09:00:00Z'
  ),
  (
    -- documentation_preparation: enhanced tier 75MW wind (30% black equity target) —
    -- B-BBEE documentation pack being compiled; agency engagement not yet commenced;
    -- target score Level 3 (~72 points).
    'bbbee_002',
    'WIND-EC-SML-002',
    2026,
    30.0,
    'enhanced',
    NULL,
    NULL,
    NULL,
    NULL,
    'documentation_preparation',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'B-BBEE documentation preparation underway for the 75 MW Eastern Cape wind project (verification year 2026, enhanced tier — 30% black equity target). Documentation pack being compiled by IPP finance and legal teams against the dtic Generic B-BBEE Scorecard checklist. Enhanced tier designation: black equity between 26% and 40%; bid commitment 30% black ordinary equity held by uMoya Community Equity Trust (22%) and Thuthuka B-BBEE fund (8%). Documentation items in progress: (1) Shareholders register — certified copy obtained from CIPC on 2026-05-25; (2) Share subscription agreements — certified copies of uMoya and Thuthuka subscription agreements (legal team retrieving from file archive); (3) Funding agreements — Community Trust loan agreement and B-BBEE fund investment agreement to be provided by trust administrators; (4) Latest audited AFS — FY2025 annual financial statements signed off by auditor Nexia SAB&T on 2026-04-30 (obtained); (5) Directors and shareholder ID documents — FICA-certified copies in collection; (6) Organogram and group structure chart — being prepared by CFO; (7) Management control and skills development data — HR records extraction underway. Ratings Afrika pre-selected from SANAS panel for agency engagement — appointment letter to be issued on completion of documentation pack. SLA deadline for documentation submission to agency: 2026-07-18.',
    '2026-05-15T08:00:00Z',
    '2026-06-02T10:00:00Z'
  ),
  (
    -- agency_engagement: majority tier 100MW solar (45% black equity target) —
    -- EmpowerLogic appointed; engagement letter signed; data submission pending.
    'bbbee_003',
    'SOLAR-FS-MED-003',
    2026,
    45.0,
    'majority',
    NULL,
    NULL,
    'EmpowerLogic',
    NULL,
    'agency_engagement',
    datetime('now', '+35 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'EmpowerLogic (SANAS accreditation No. BVA 0034) appointed as B-BBEE verification agency for the 100 MW Free State solar project (verification year 2026, majority tier — 45% black equity target). Appointment confirmed by engagement letter EL-2026-FS-003 signed by both parties on 2026-05-30. Majority tier: black equity between 40% and 51%; bid commitment 45% black ordinary equity held by Kopanang Community Trust (30%), Sedibeng Womens Equity Fund (10%), and individual HDSA directors (5%). EmpowerLogic engagement scope: full generic B-BBEE scorecard verification (all 7 elements: Ownership, Management Control, Skills Development, Enterprise and Supplier Development, Socio-Economic Development, Preferential Procurement, and Bonus points), with priority focus on Ownership element (25 points) to confirm sustained 45% black equity position. Verification methodology: EmpowerLogic will conduct document review, on-site interview, and third-party confirmation (trust deeds, funding agreements, shareholder registers). Engagement letter specifies turnaround: preliminary score within 15 business days of complete data submission. EmpowerLogic verification team assigned: senior verifier T. Mokoena (EL senior analyst, B-BBEE CoGP specialist). Data submission appointment scheduled 2026-06-18 at EmpowerLogic Johannesburg offices. IPP finance team preparing consolidated data pack.',
    '2026-04-20T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- data_submission: transformative tier 150MW wind (60% black equity target) —
    -- Empowerdex data room open; all documents uploaded; agency assessment commencing.
    'bbbee_004',
    'WIND-WC-LRG-004',
    2026,
    60.0,
    'transformative',
    NULL,
    NULL,
    'Empowerdex',
    NULL,
    'data_submission',
    datetime('now', '+28 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'B-BBEE data submission completed to Empowerdex (SANAS accreditation No. BVA 0011) for the 150 MW Western Cape wind project (verification year 2026, transformative tier — 60% black equity target). Submission reference: EDX-2026-WC-004, dated 2026-06-01. Transformative tier: black equity between 51% and 75%; bid commitment 60% black ordinary equity structure: Sikhona Community Trust (35%), Amandla B-BBEE private equity fund (15%), HDSA management co-investors (10%). Data pack submitted to Empowerdex secure portal — 47 documents uploaded: (1) Certified shareholders register (CIPC certified, dated 2026-05-28); (2) Notarised share subscription agreements for all three B-BBEE shareholders; (3) Community Trust deed and SARS exemption letter; (4) Amandla fund investment agreement and limited partnership register; (5) FY2025 audited AFS (auditor: Empowerdex-independent external auditor PwC SA); (6) Management control organogram and board resolution list (HDSA representation: 4/7 board seats = 57%); (7) Skills development levy records (SDL0001234567), WSP and ATR FY2025 (submitted to SETA); (8) Preferential procurement spend data — B-BBEE compliant supplier invoices R84M (62% of qualifying spend); (9) Enterprise and supplier development programme evidence (3 black-owned ESD beneficiaries, total R1.2M spend); (10) SED programme evidence per W181. Empowerdex commenced preliminary review of documents on 2026-06-02. Agency assessment expected to take 12 business days.',
    '2026-04-01T08:00:00Z',
    '2026-06-01T14:00:00Z'
  ),
  (
    -- agency_assessment: exemplary tier 200MW solar (80% black equity target) —
    -- Nexia SAB&T conducting on-site assessment and element scoring.
    'bbbee_005',
    'SOLAR-NC-MAJ-005',
    2026,
    80.0,
    'exemplary',
    NULL,
    NULL,
    'Nexia SAB&T',
    NULL,
    'agency_assessment',
    datetime('now', '+20 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'Nexia SAB&T (IRBA-accredited B-BBEE verification agency, registration No. 015; SANAS BVA 0058) conducting full agency assessment for the 200 MW Northern Cape solar project (verification year 2026, exemplary tier — 80% black equity target). Exemplary tier: black equity above 75%; bid commitment 80% black ordinary equity held by Batho Pele Community Investment Trust (50%), Izwe La Bantu Women''s Fund (20%), and HDSA management shareholders (10%). Nexia SAB&T assigned team: partner P. Dlamini (IRBA registered auditor, B-BBEE specialist) and three analysts. Agency assessment phase commenced 2026-05-28. Assessment workstream status: (1) Ownership — completed; 80% black equity confirmed via shareholders register cross-referenced with trust deed and fund investment agreement; HDSA management equity verified through ID documents and B-BBEE declaration forms; Enhanced Equity Equivalent calculation (Batho Pele trust structure qualifies as Modified Flow-Through per dtic Codes paragraph 3.4.2) — draft scoring 24.5/25 ownership points; (2) Management control — interview with EXCO completed 2026-05-29: 6/7 directors HDSA, CEO and CFO HDSA — 13/15 management points; (3) Skills development — SDL records, WSP/ATR, training invoices reviewed; R4.8M spend (5.8% of leviable amount vs 6% target) — preliminary 19.5/20 skills development points; (4) ESD — 8 enterprise development beneficiaries confirmed, R3.6M spend; (5) SED, procurement — in progress. Preliminary score calculation pending SED and preferential procurement scoring completion. On-site interview with transformation committee 2026-06-05.',
    '2026-03-15T08:00:00Z',
    '2026-06-02T09:00:00Z'
  ),
  (
    -- preliminary_score_issued: standard tier 20MW solar (20% black equity target) —
    -- EmpowerLogic issued preliminary score: Level 4 (~62 points); IPP review period open.
    'bbbee_006',
    'SOLAR-LP-MCR-006',
    2026,
    20.0,
    'standard',
    62.0,
    4,
    'EmpowerLogic',
    NULL,
    'preliminary_score_issued',
    datetime('now', '+15 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'EmpowerLogic issued preliminary B-BBEE score for the 20 MW Limpopo solar project (verification year 2026, standard tier — 20% black equity target). Preliminary score: 62.0 points = B-BBEE Level 4. Preliminary score report reference EL-PRELIM-2026-LP-006, issued 2026-06-01. Score breakdown (preliminary): (1) Ownership (25 pts max): 20% black equity — 12.5 pts; no Black Woman ownership enhancement beyond 4% threshold — 0 bonus; subtotal 12.5/25; (2) Management control (15 pts max): 2/5 board seats HDSA, 1/3 EXCO HDSA (standard governance structure for 20% BEE tier) — 8.0/15; (3) Skills development (20 pts max): SDL expenditure R210k (3.0% of leviable amount vs 6% target), WSP filed FY2025 — 14.0/20; (4) ESD (40 pts max): 1 ESD beneficiary (R120k supplier development); preferential procurement 45% B-BBEE compliant spend — 19.5/40; (5) SED (5 pts max): SED spend R70k (1.0% of revenue, W181 sed_006) — 5.0/5; Total preliminary: 59.0 + 3.0 bonus points (youth employment initiative) = 62.0. EmpowerLogic notes: preliminary score triggers 10-business-day IPP review period per dtic B-BBEE Codes paragraph 11.3 — IPP may submit factual corrections, supporting documents, or query the scoring methodology. IPP finance team and B-BBEE advisors (KBC B-BBEE Consultants) reviewing preliminary report. IPP review due 2026-06-15.',
    '2026-03-01T08:00:00Z',
    '2026-06-01T11:00:00Z'
  ),
  (
    -- ipp_review: enhanced tier 75MW wind (30% black equity target) —
    -- Ratings Afrika preliminary score Level 3 (~72 points); IPP submitting corrections.
    'bbbee_007',
    'WIND-KZN-SML-007',
    2026,
    30.0,
    'enhanced',
    72.0,
    3,
    'Ratings Afrika',
    NULL,
    'ipp_review',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'IPP review of Ratings Afrika preliminary B-BBEE score underway for the 75 MW KwaZulu-Natal wind project (verification year 2026, enhanced tier — 30% black equity target). Preliminary score: 72.0 points = B-BBEE Level 3. Ratings Afrika preliminary report reference RA-PRELIM-2026-KZN-007, issued 2026-05-28. IPP review period: 2026-05-28 to 2026-06-11 (10 business days per dtic Codes). Score breakdown (preliminary): (1) Ownership: 30% black equity — 14.5/25 (Enhanced Equity equivalent for uMoya Trust applied; Ratings Afrika queried adequacy of trust deed — see correction below); (2) Management control: 3/7 board HDSA, 1/2 prescribed officers HDSA — 10.0/15; (3) Skills development: SDL R890k (3.8% of leviable amount) — 17.0/20; (4) ESD: 3 enterprise development beneficiaries, R440k; preferential procurement 55% B-BBEE spend — 28.5/40; (5) SED: R420k (1.5% revenue, W181 sed_007) — 5.0/5; subtotal 75.0 − 3.0 reduction (agency query on ownership trust structure) = 72.0 preliminary. IPP corrections filed 2026-06-02: (1) uMoya Community Equity Trust — Ratings Afrika queried Modified Flow-Through eligibility; IPP submitted supplementary trust deed amendment clause (section 7.4) confirming distribution mechanism and SARS confirmation letter dated 2026-03-14 confirming tax-exempt status — restores 3.0 points to ownership element; (2) Skills development — additional Q4 FY2025 training invoices submitted (R220k overlooked in initial data pack — corrects skills development to 4.1%). Final score expected to improve to ~75 points = Level 2 upon corrections accepted.',
    '2026-04-01T08:00:00Z',
    '2026-06-02T13:00:00Z'
  ),
  (
    -- final_assessment: majority tier 100MW solar (45% black equity target) —
    -- EmpowerLogic conducting final review of IPP corrections; certificate pending.
    'bbbee_008',
    'SOLAR-MPU-MED-008',
    2026,
    45.0,
    'majority',
    82.0,
    2,
    'EmpowerLogic',
    NULL,
    'final_assessment',
    datetime('now', '+7 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'EmpowerLogic conducting final B-BBEE assessment for the 100 MW Mpumalanga solar project (verification year 2026, majority tier — 45% black equity target). Final assessment triggered after IPP review period closed on 2026-05-30 with corrections submitted. Preliminary score: 79.0 points = Level 2. IPP corrections submitted 2026-05-28: (1) Skills development — additional R380k bursary spend submitted (Nkangala TVET engineering artisan programme linked to W181 sed_008; bursary invoices and student enrolment letters provided); (2) Ownership — Kopanang Trust deed amendment filed with Master of the High Court on 2026-04-22 (court receipt provided) — confirms economic interest and voting rights alignment per dtic Codes paragraph 3.2.1. EmpowerLogic final assessment team reviewing corrections: senior verifier T. Mokoena completed ownership correction review on 2026-06-01 — confirmed additional 2.5 ownership points restored on trust deed alignment; skills development correction review underway (Q: whether TVET artisan programme qualifies as absorption training under Codes paragraph 6.5.3 for additional 2-point bonus). Final assessment score expected: 82.0 points = B-BBEE Level 2 (confirmed ownership 20.5/25, management 12.0/15, skills development 22.0/20 with bonus, ESD 22.0/40, SED 5.0/5, preferential procurement 0.5/5). EmpowerLogic quality review sign-off by senior partner due 2026-06-06. Certificate issuance expected 2026-06-09.',
    '2026-03-01T08:00:00Z',
    '2026-06-02T14:00:00Z'
  ),
  (
    -- certificate_issued: transformative tier 150MW wind (60% black equity target) —
    -- Empowerdex issued B-BBEE certificate; Level 1 (~88 points); validity 12 months.
    'bbbee_009',
    'WIND-FS-LRG-009',
    2025,
    60.0,
    'transformative',
    88.0,
    1,
    'Empowerdex',
    '2026-06-01',
    'certificate_issued',
    datetime('now', '+5 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Empowerdex issued B-BBEE compliance certificate for the 150 MW Free State wind project (verification year 2025, transformative tier — 60% black equity). Certificate reference: EDX-CERT-2025-FS-009, dated 2025-06-01; validity 12 months (expiry 2026-06-01). B-BBEE score: 88.0 points = Level 1 Contributor. Score breakdown confirmed in Empowerdex verification report EDX-VER-2025-FS-009: (1) Ownership (25 pts max): 60% black equity — Modified Flow-Through for Sikhona Community Trust fully validated — 22.0/25; Black women ownership 22% (Amandla fund 15% HDSA women investors + 7% from Sikhona Trust beneficiary profile) = 3.0 bonus; subtotal 25.0/25; (2) Management control (15 pts max): 5/7 board HDSA (72%), CEO and CFO HDSA, 2/2 prescribed officers HDSA — 13.0/15; (3) Skills development (20 pts max): SDL R3.2M (4.8% of R66M leviable amount), 4 black employees absorbed post-training — 20.0/20 (with absorption bonus); (4) ESD (40 pts max): 5 enterprise development beneficiaries (R2.4M), 52 supplier development beneficiaries (B-BBEE QSE suppliers), preferential procurement 68% B-BBEE spend — 30.0/40; (5) SED (5 pts max): R1.8M SED programme W181 — 5.0/5; (6) Bonus: township enterprise (1 beneficiary), rural development (1 zone) — 3.0 bonus. Total: 91.0 − 3.0 preferential procurement penalty (qualifying spend shortfall Q4 2025) = 88.0. Certificate lodged with DMRE IPP Office 2025-06-02. Certificate available on dtic B-BBEE Commission portal under entity registration 2020/152341/07.',
    '2025-04-01T08:00:00Z',
    '2025-06-01T15:00:00Z'
  ),
  (
    -- bbbee_verified (terminal): majority tier 250MW wind (45% black equity target) —
    -- Empowerdex certificate confirmed valid; REIPPPP compliance confirmed; is_reportable=1.
    'bbbee_010',
    'WIND-WC-LRG-010',
    2025,
    45.0,
    'majority',
    82.0,
    2,
    'Empowerdex',
    '2026-04-15',
    'bbbee_verified',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'Empowerdex B-BBEE compliance certificate (EDX-CERT-2025-WC-010) confirmed valid. Score 82.0 = Level 2. REIPPPP IPP Office acknowledged B-BBEE compliance for verification year 2025. Certificate valid until 2026-04-15. Black equity: 45% majority tier confirmed.',
    'B-BBEE verification confirmed for the 250 MW Western Cape wind project (verification year 2025, majority tier — 45% black equity target). Empowerdex certificate EDX-CERT-2025-WC-010 accepted by REIPPPP IPP Office on 2025-04-16. Score: 82.0 points = B-BBEE Level 2 Contributor. Score breakdown confirmed: (1) Ownership (25 pts max): 45% black equity — Kopanang Trust (30%), Sedibeng Women''s Equity Fund (10%), HDSA directors (5%); Modified Flow-Through validated for Kopanang Trust; black women ownership 18% (Sedibeng fund + trust women beneficiary profile) = 2.0 bonus; subtotal 22.5/25; (2) Management control: 4/7 board HDSA, CEO HDSA — 11.0/15; (3) Skills development: SDL R2.8M (4.2% leviable), WSP submitted, 2 absorbed — 19.0/20; (4) ESD: 3 enterprise development beneficiaries (R1.6M), 35 supplier development beneficiaries, preferential procurement 60% B-BBEE spend — 26.5/40; (5) SED: R6.4M programme (W181 sed_010) — 5.0/5; bonus 2.0 (township + disabled beneficiary). Total 86.0 − 4.0 (ESD shortfall vs 5% target) = 82.0. is_reportable=1: majority-tier B-BBEE Level 2 certification is a mandatory annual REIPPPP scorecard reportable event — updates DMRE IPP annual B-BBEE performance register for the BW5 programme cohort and REIPPPP transformation dashboard. Certificate validity confirmed through 2026-04-15; renewal verification cycle to commence Q1 2026.',
    '2025-02-01T08:00:00Z',
    '2025-04-16T10:00:00Z'
  ),
  (
    -- bbbee_non_compliant (terminal): standard tier 20MW solar (20% black equity) —
    -- equity structure no longer meets minimum B-BBEE threshold; DMRE notified; sla_breached=1, is_reportable=1.
    'bbbee_011',
    'SOLAR-COM-NW-011',
    2025,
    20.0,
    'standard',
    NULL,
    NULL,
    'Ratings Afrika',
    NULL,
    'bbbee_non_compliant',
    datetime('now', '-5 days'),
    1,
    1,
    'p_ipp_dev_003',
    'Ratings Afrika verification confirmed B-BBEE non-compliance for verification year 2025: black equity holding has fallen below the 20% bid commitment. Kgalagadi Community Investment Trust sold 10% of its 15% equity stake to a non-HDSA investor in November 2024 without DMRE consent, reducing effective black equity to 10%. This falls below the standard tier threshold. B-BBEE certificate cannot be issued. DMRE notified per REIPPPP IA clause 8.4. SLA breach: verification cycle exceeded 90-day annual deadline by 5 days.',
    'Ratings Afrika (SANAS BVA 0022) determined B-BBEE non-compliance for the 20 MW North West solar project (verification year 2025, standard tier). Non-compliance determination reference RA-NC-2025-NW-011, issued 2026-05-28. Root cause: Kgalagadi Community Investment Trust sold 10% of its equity in November 2024 to a non-HDSA infrastructure fund (Horizon Infrastructure Partners) without obtaining REIPPPP IPP Office written consent as required by Implementation Agreement clause 8.3 (equity lock-up and prior approval obligation). Result: effective black equity reduced from 20% to 10% — below the standard tier bid commitment threshold of 20% and below the minimum 10% REIPPPP equity floor for operational projects. Ratings Afrika findings: (1) Ownership element cannot be verified at bid commitment level — effective black equity 10%; (2) Kgalagadi Trust no longer holds controlling beneficial interest in the 15% block; (3) Modified Flow-Through mechanism has lapsed for the transferred 10% stake. SLA breach: annual B-BBEE verification cycle required completion within 90 calendar days of verification year end (2025-12-31); determination issued 2026-05-28 — 148 days, 58-day SLA exceedance due to equity investigation delays. is_reportable=1: B-BBEE non-compliance at any tier is a mandatory REIPPPP reportable event — triggers DMRE IPP Office equity cure process (30-day remedy notice) and may result in Implementation Agreement suspension under ERA 2006 transformation conditions. DMRE formal notification letter DMRE-BBBEE-NC-2025-NW-011 issued 2026-05-29.',
    '2025-06-01T08:00:00Z',
    '2026-05-28T15:00:00Z'
  ),
  (
    -- certificate_lapsed (terminal): enhanced tier 75MW wind (30% black equity) —
    -- prior year certificate expired; renewal not completed in time; sla_breached=1, is_reportable=1.
    'bbbee_012',
    'WIND-EC-SML-012',
    2024,
    30.0,
    'enhanced',
    72.0,
    3,
    'Nexia SAB&T',
    '2025-05-10',
    'certificate_lapsed',
    datetime('now', '-20 days'),
    1,
    1,
    'p_ipp_dev_001',
    'B-BBEE compliance certificate lapsed for verification year 2024: Nexia SAB&T certificate (NST-CERT-2024-EC-012, validity 2024-05-10 to 2025-05-10) expired on 2025-05-10. Renewal verification was not completed within the mandatory 90-day pre-expiry window. Certificate lapse declared on 2026-05-15 after 370 days without a valid certificate. DMRE IPP Office notified. SLA breach: annual renewal SLA of 90 days before certificate expiry missed by 20 days at lapse determination.',
    'B-BBEE certificate lapse declared for the 75 MW Eastern Cape wind project (verification year 2024, enhanced tier — 30% black equity target). Nexia SAB&T certificate NST-CERT-2024-EC-012 (score: 72.0, Level 3, issued 2024-05-10) expired on 2025-05-10 without renewal. Lapse determination reference DMRE-BBBEE-LAPSED-2024-EC-012, dated 2026-05-15. Root cause: IPP project company entered voluntary business rescue in late 2024 (BRP: A. van der Berg, BRP-CIPC-2024-EC-0247). During business rescue, the B-BBEE transformation officer role was left vacant and no agency appointment was made for the 2024 renewal cycle. Business rescue plan did not ring-fence B-BBEE verification budget. uMoya Community Equity Trust (22%) and Thuthuka B-BBEE fund (8%) remained registered shareholders throughout, meaning the equity structure was intact — but no verification was conducted. Renewal was due to commence by 2025-02-09 (90 days before expiry 2025-05-10 per REIPPPP B-BBEE Procedure Note 2023-09 paragraph 4.2). SLA breach: annual renewal SLA missed; certificate lapsed for 370 calendar days as at determination date 2026-05-15. is_reportable=1: certificate lapse is a mandatory REIPPPP programme office reportable event for enhanced-tier projects — triggers 30-day cure notice to IPP (must appoint agency and commence verification) and DMRE watch-list classification. Second consecutive lapse would trigger Implementation Agreement clause 9.11 financial penalty equivalent to 150% of uncertified period B-BBEE value foregone. Business rescue concluded 2026-04-30 (rescue plan successfully implemented); IPP transformation team reconstituted; Nexia SAB&T re-appointed 2026-05-18 to commence lapse remediation verification cycle.',
    '2024-01-01T08:00:00Z',
    '2026-05-15T10:00:00Z'
  );
