-- W183: IPP Lender Reporting Lifecycle
-- REIPPPP / Finance Docs lender reporting cycle:
-- reporting_triggered -> data_collection -> financial_model_update ->
-- technical_review -> document_compilation -> ipp_sign_off ->
-- agent_bank_submission -> lender_distribution -> acknowledgement_pending ->
-- package_acknowledged / package_disputed / covenant_breach.
--
-- 20 columns (id + 19 data columns):
--   id, project_ref, report_period, lender_count, lender_tier,
--   report_type, agent_bank, due_date,
--   chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_lender_reporting (
  id                          TEXT    PRIMARY KEY,
  project_ref                 TEXT    NOT NULL,
  report_period               TEXT    NOT NULL,
  lender_count                INTEGER NOT NULL,
  lender_tier                 TEXT    NOT NULL
                                      CHECK(lender_tier IN (
                                        'sole',
                                        'bilateral',
                                        'club',
                                        'syndicated',
                                        'consortium'
                                      )),
  report_type                 TEXT    NOT NULL DEFAULT 'quarterly_report'
                                      CHECK(report_type IN (
                                        'quarterly_report',
                                        'semi_annual_report',
                                        'annual_report',
                                        'special_purpose_report',
                                        'drawdown_report'
                                      )),
  agent_bank                  TEXT,
  due_date                    TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'reporting_triggered'
                                      CHECK(chain_status IN (
                                        'reporting_triggered',
                                        'data_collection',
                                        'financial_model_update',
                                        'technical_review',
                                        'document_compilation',
                                        'ipp_sign_off',
                                        'agent_bank_submission',
                                        'lender_distribution',
                                        'acknowledgement_pending',
                                        'package_acknowledged',
                                        'package_disputed',
                                        'covenant_breach'
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

CREATE INDEX IF NOT EXISTS idx_ipp_lrep_project
  ON oe_ipp_lender_reporting(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_lrep_status
  ON oe_ipp_lender_reporting(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_lrep_sla
  ON oe_ipp_lender_reporting(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:report_period  4:lender_count  5:lender_tier
--  6:report_type  7:agent_bank  8:due_date
--  9:chain_status
--  10:sla_due_date  11:sla_breached  12:is_reportable
--  13:actor_party  14:reason  15:notes
--  16:created_at  17:updated_at

INSERT OR IGNORE INTO oe_ipp_lender_reporting VALUES
  (
    -- reporting_triggered: sole lender (DBSA only), R350M facility, quarterly report —
    -- Finance Documents annual reporting calendar triggers Q1 2026 lender report cycle;
    -- data collection not yet commenced.
    'lrep_001',
    'SOLAR-COM-NC-001',
    'Q1 2026',
    1,
    'sole',
    'quarterly_report',
    NULL,
    '2026-05-15',
    'reporting_triggered',
    datetime('now', '+30 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Q1 2026 lender reporting cycle triggered for the 20 MW Northern Cape solar project (sole lender: DBSA, R350M senior debt facility, reference DBSA-SF-2022-NC-001). Reporting cycle triggered automatically by the Finance Documents annual compliance calendar on 2026-05-01 — the Senior Facility Agreement clause 18.4 requires the borrower to deliver a quarterly compliance certificate and financial report to the lender within 45 days of each quarter end. Q1 2026 quarter end: 2026-03-31; contractual due date: 2026-05-15. DBSA is sole lender; no agent bank is appointed for bilateral sole-lender facilities per DBSA SF template. Report package required per DBSA SF clause 18.4 and Schedule 6 (Information Undertakings): (1) Compliance Certificate signed by CFO confirming no Event of Default, no Material Adverse Effect, and covenant compliance as at Q1 2026; (2) Management accounts for Q1 2026 (unaudited P&L, balance sheet, cash flow); (3) Updated financial model run — base case and downside scenario outputs for remaining debt tenor; (4) Technical report from Independent Engineer confirming plant availability and generation performance vs P50 (Q1 2026 actual generation: 8.2 GWh vs P50 of 8.0 GWh); (5) Insurance certificate confirming all required covers remain in place; (6) B-BBEE compliance status update (W182 bbbee_001 verification triggered). Data collection team being assembled; IPP CFO assigning finance analyst to data gathering role. SLA deadline for complete package delivery to DBSA: 2026-05-15.',
    '2026-05-01T08:00:00Z',
    '2026-05-01T09:00:00Z'
  ),
  (
    -- data_collection: bilateral lenders (IDC + DBSA), R680M facility, quarterly report —
    -- Q1 2026 report data gathering underway; management accounts and plant data in collection;
    -- financial model update not yet commenced.
    'lrep_002',
    'WIND-EC-SML-002',
    'Q1 2026',
    2,
    'bilateral',
    'quarterly_report',
    NULL,
    '2026-05-30',
    'data_collection',
    datetime('now', '+25 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Q1 2026 lender reporting data collection underway for the 75 MW Eastern Cape wind project (bilateral lenders: IDC R340M + DBSA R340M = R680M total senior debt, Common Terms Agreement reference CTA-2021-EC-002). Data collection phase commenced 2026-05-03 following reporting cycle trigger. Bilateral facility: IDC and DBSA hold equal tranches; both are party to the CTA and inter-creditor deed; DBSA acts as technical lender representative for engineering matters per CTA clause 4.3. No independent agent bank is appointed (bilateral structures use lead-lender coordination — DBSA coordinates). Report package due 2026-05-30 per CTA Schedule 7 (Information Covenants) clause 7.1(a): 60 days after quarter end for bilateral quarterly compliance. Data collection status: (1) Management accounts Q1 2026 — IPP finance team extracting from Sage accounting system; unaudited P&L complete; balance sheet 90% complete; cash flow statement in preparation; (2) Quarterly generation report — Scatec asset management team pulling SCADA data (Q1 2026 actual: 47.3 GWh vs P50 48.1 GWh, P90 performance confirmed); (3) Insurance certificates — broker Willis Towers Watson obtaining updated certificates (all-risk property, DSU, third-party liability, EL); (4) B-BBEE status update — W182 bbbee_002 documentation preparation in progress; (5) Covenant compliance pre-check — treasury analyst running preliminary DSCR calculation (Q1 2026 DSCR estimate: 1.42x vs 1.20x covenant minimum — comfortable headroom); (6) Environmental and social monitoring report — ESIA O&M quarterly report being prepared by E&S officer (IFC PS4 bird and bat mortality monitoring, noise levels, community liaison). Financial model update to commence on receipt of complete management accounts.',
    '2026-05-03T08:00:00Z',
    '2026-06-02T10:00:00Z'
  ),
  (
    -- financial_model_update: club lenders (DBSA + IDC + Nedbank + Standard Bank),
    -- R1.2B facility, annual report —
    -- FY2025 annual lender report; management accounts finalised; base case financial model
    -- being reforecast for remaining debt tenor.
    'lrep_003',
    'SOLAR-FS-MED-003',
    'Annual 2025',
    4,
    'club',
    'annual_report',
    'Nedbank CIB (Agent Bank)',
    '2026-04-30',
    'financial_model_update',
    datetime('now', '+20 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'FY2025 annual lender report financial model update underway for the 100 MW Free State solar project (club lenders: DBSA R360M + IDC R240M + Nedbank R300M + Standard Bank R300M = R1.2B total senior debt, Common Terms Agreement CTA-2020-FS-003). Nedbank CIB appointed as agent bank per CTA clause 5.1 — all lender reporting is routed through Nedbank CIB as facility agent. Annual report due 2026-04-30 per CTA Schedule 7 clause 7.1(b): 120 days after FY2025 year-end (2025-12-31). Data collection completed 2026-03-15; management accounts for FY2025 finalised by auditor Deloitte SA on 2026-03-28 (unqualified opinion, audit report reference D-AR-2025-FS-003). Financial model update commenced 2026-04-01. Financial model update scope: (1) Base case — actual FY2025 inputs locked in (generation 198.4 GWh vs P50 201 GWh, O&M cost R18.2M vs R17.8M budget, insurance R3.1M, land lease R1.4M); (2) Downside scenario — P90 generation (-8%), O&M +15%, grid curtailment +2% (ESKOM load shedding tail risk); (3) DSCR model recalibration for remaining 12 years of 17-year debt tenor: base case DSCR range 1.38x–1.52x; downside DSCR floor 1.21x (above 1.10x covenant minimum — no covenant concern); (4) Debt service waterfall update — DSRA balance R44.2M (6-month reserve funded); MRA balance R8.8M (3-month maintenance reserve); distributions waterfall Q4 2025 distribution R12.4M to equity (cleared DSCR and lock-up tests); (5) Macro sensitivity table — carbon price, tariff escalation, ZAR/USD for inverter replacement spares. PricewaterhouseCoopers independent model auditor reviewing final outputs. Technical review to commence on model completion.',
    '2026-01-15T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- technical_review: syndicated lenders (DBSA + IDC + 4 commercial banks + DFI = 7),
    -- R2.8B facility, semi-annual report —
    -- H1 2025 semi-annual report; financial model complete; Independent Engineer
    -- technical review in progress.
    'lrep_004',
    'WIND-WC-LRG-004',
    'H1 2025',
    7,
    'syndicated',
    'semi_annual_report',
    'Rand Merchant Bank (Agent Bank)',
    '2025-08-31',
    'technical_review',
    datetime('now', '+15 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'H1 2025 semi-annual lender report technical review underway for the 150 MW Western Cape wind project (syndicated lenders: DBSA R560M + IDC R420M + Rand Merchant Bank R350M + Standard Bank R350M + Nedbank R280M + ABSA R420M + KfW DEG R420M = R2.8B total, Syndicated Facility Agreement SFA-2019-WC-004). Rand Merchant Bank appointed as agent bank and security trustee per SFA clause 6.1. Semi-annual report due 2025-08-31 per SFA Schedule 8 clause 8.2(a): 60 days after H1 2025 period end (2025-06-30). Financial model update completed 2025-07-18; base case H1 2025 DSCR 1.44x; downside 1.26x — within covenant thresholds. Technical review commenced 2025-07-21. Independent Engineer appointed: WSP South Africa (IE firm reference WSP-IE-SFA-WC-004). Technical review workstream: (1) Generation performance — H1 2025 actual generation 188.4 GWh vs P50 191.2 GWh (98.5% of P50; within contractual performance threshold of 95% P50); turbine availability 96.8% (vs 95% REIPPPP minimum); capacity factor 28.4%; (2) O&M contractor performance — Vestas SA O&M contract KPIs: turbine MTBF 2,840 hours (above 2,500 threshold), major corrective maintenance 3 events (within 6/year limit); (3) Grid curtailment — Eskom curtailment log H1 2025: 12 curtailment events totalling 1,840 MWh (1.0% of generation; below 2.5% deemed-energy trigger threshold); curtailment compensation claim R4.1M filed against Eskom under PPA clause 14 (W46 curtailment_004 in progress); (4) Environmental and social — ESIA monitoring report H1 2025: bird and bat mortality within IFC PS6 thresholds; community noise complaint (1 event, resolved); (5) Insurance — all required covers confirmed in place with Santam and Munich Re; (6) DSRA and MRA balances confirmed with agent bank. IE technical report draft due 2025-08-14; final due 2025-08-25.',
    '2025-06-15T08:00:00Z',
    '2026-06-02T09:00:00Z'
  ),
  (
    -- document_compilation: consortium lenders (12 lenders), R6.5B facility, annual report —
    -- Annual 2025 report; financial model and technical review complete; full report
    -- package being compiled for agent bank submission.
    'lrep_005',
    'SOLAR-NC-MAJ-005',
    'Annual 2025',
    12,
    'consortium',
    'annual_report',
    'Standard Bank (Agent Bank)',
    '2026-04-30',
    'document_compilation',
    datetime('now', '+12 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'Annual 2025 lender report document compilation underway for the 200 MW Northern Cape solar project (consortium lenders: DBSA R975M + IDC R780M + IFC R650M + KfW R650M + Standard Bank R520M + Rand Merchant Bank R520M + Nedbank R455M + ABSA R455M + FirstRand R390M + Investec R390M + Societe Generale R390M + BNP Paribas R325M = R6.5B total, Consortium Facility Agreement ConFA-2018-NC-005). Standard Bank appointed as agent bank, security trustee, and account bank per ConFA clause 7.1; IFC acts as parallel lender with independent reporting rights under IFC Disclosure Policy. Annual report due 2026-04-30 per ConFA Schedule 9 clause 9.2(b): 120 days after FY2025 year-end. Financial model update completed 2026-02-28 (PwC model audit confirmed); FY2025 DSCR 1.51x base case, 1.34x downside. Independent Engineer WSP annual report completed 2026-03-15 (FY2025 generation: 472.8 GWh vs P50 480 GWh; availability 97.2%). Document compilation commenced 2026-03-20. Package items being compiled: (1) Compliance Certificate (draft prepared by CFO; legal review by Edward Nathan Sonnenbergs in progress); (2) Annual audited financial statements FY2025 (KPMG, unqualified opinion signed 2026-03-28); (3) IE annual report — WSP final version received; (4) Updated financial model — PwC-audited outputs included; (5) Insurance report — Marsh annual insurance review completed (all covers confirmed: CEAR, DSU, ISR, BI, TPL, EL); (6) Environmental and social annual report — IFC PS1/2/4/5/6/7/8 compliance report prepared by Aurecon; (7) B-BBEE annual compliance certificate — W182 bbbee_005 Nexia SAB&T assessment in progress; (8) DSRA and MRA confirmation from Standard Bank account bank (DSRA R312M funded; MRA R78M funded); (9) Equity distribution notice for FY2025 (R68M distribution cleared all waterfall tests per ConFA clause 22.5); (10) IFC-specific environmental and social action plan update (ESAP-2018-NC-005 items 12–18 completed; items 19–21 on track). Compilation lead: IPP CFO with support from ENS and Deloitte.',
    '2026-02-01T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- ipp_sign_off: bilateral lenders (IDC + DBSA), R680M facility, drawdown report —
    -- Tranche 3 drawdown report; document package complete; awaiting IPP CEO and
    -- CFO signatures before agent bank submission.
    'lrep_006',
    'WIND-KZN-SML-007',
    'Q2 2026',
    2,
    'bilateral',
    'drawdown_report',
    NULL,
    '2026-06-10',
    'ipp_sign_off',
    datetime('now', '+8 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Tranche 3 drawdown report IPP sign-off in progress for the 75 MW KwaZulu-Natal wind project (bilateral lenders: IDC R340M + DBSA R340M = R680M total, CTA-2021-KZN-007). Drawdown report required per CTA Schedule 6 clause 6.4 as a condition precedent to each drawdown — borrower must certify use of proceeds, confirmation of no Event of Default, and satisfaction of all conditions precedent listed in Schedule 4 of the CTA. Tranche 3 drawdown amount: R185M (construction progress milestone: turbine foundation completion and tower erection — 24 of 25 WTGs erected per EPC contractor Vestas certificate of construction progress VCA-T3-KZN-007, dated 2026-05-30). Document package assembled 2026-06-01: (1) Utilisation Request (Form A, CTA Schedule 6 clause 6.2) — confirmed Tranche 3 drawdown date 2026-06-15, drawdown amount R185M, drawdown purpose: EPC Tranche 3 milestone payment per EPC Contract clause 7.3(c); (2) Drawdown report narrative — confirming construction progress, use of proceeds to date (Tranches 1+2 totalling R340M utilised per the approved budget), no cost overrun (EPC budget R2.2B; spend to date R1.1B; contingency R110M untouched); (3) No Default Certificate — CEO and CFO co-sign confirming: no Event of Default under CTA, no material adverse effect, all representations and warranties remain true; (4) Updated sources and uses table — certified by IPP CFO; (5) Conditions precedent checklist — Schedule 4 items 1–22 confirmed satisfied (environmental authorisation, grid connection agreement, REIPPPP IA, insurance certificates, etc.); (6) Construction progress report — IE Aurecon interim site inspection report AIR-T3-KZN-007 confirms 96% EPC physical progress on target for COD 2026-09-15. IPP CEO and CFO sign-off meeting scheduled 2026-06-05. Submission to IDC and DBSA due 2026-06-10.',
    '2026-04-15T08:00:00Z',
    '2026-06-02T13:00:00Z'
  ),
  (
    -- agent_bank_submission: club lenders (DBSA + IDC + Nedbank + Standard Bank = 4),
    -- R1.2B facility, semi-annual report —
    -- H1 2025 semi-annual report; IPP sign-off complete; package submitted to
    -- Nedbank CIB as agent bank; lender distribution pending.
    'lrep_007',
    'SOLAR-MPU-MED-008',
    'H1 2025',
    4,
    'club',
    'semi_annual_report',
    'Nedbank CIB (Agent Bank)',
    '2025-08-31',
    'agent_bank_submission',
    datetime('now', '+5 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'H1 2025 semi-annual lender report submitted to Nedbank CIB (agent bank) for the 100 MW Mpumalanga solar project (club lenders: DBSA R360M + IDC R240M + Nedbank R300M + Standard Bank R300M = R1.2B total, CTA-2020-MPU-008). Agent bank submission reference NBI-LREP-H12025-MPU-008, received by Nedbank CIB lender portal on 2025-08-28 — 3 days ahead of contractual due date 2025-08-31. H1 2025 semi-annual report package contents (9 documents, 142 pages): (1) Compliance Certificate signed by CEO T. Nkosi and CFO P. Govender on 2025-08-25 — confirms: no Event of Default, no Potential Event of Default, no Material Adverse Effect, all representations and warranties remain true and correct in all material respects as at 2025-06-30; (2) Management accounts H1 2025 (unaudited, prepared by IPP finance team, reviewed by Grant Thornton): revenue R112.4M, EBITDA R98.8M (margin 87.9%), DSCR 1.48x (covenant minimum 1.20x — compliant with 23.3% headroom); (3) Updated financial model (base case DSCR remaining tenor 1.41x–1.56x; downside floor 1.22x); (4) IE semi-annual report — WSP H1 2025: generation 201.4 GWh (100.2% of P50; outperforming), availability 97.4%, no major equipment failures; (5) DSRA account statement (Nedbank CIB account bank, balance R68.4M = 6 months DSCR fully funded); (6) MRA account statement (balance R14.2M = 3 months funded); (7) Insurance certificate confirming all covers (CEAR waiver period ended; now ISR + BI + TPL in operations phase); (8) B-BBEE update: W182 bbbee_008 EmpowerLogic Level 2 certificate in final assessment; (9) Environmental and social H1 monitoring report. Nedbank CIB confirms receipt; agent bank review period 2 business days per CTA clause 16.3; lender distribution to commence after agent bank clearance.',
    '2025-07-01T08:00:00Z',
    '2025-08-28T15:00:00Z'
  ),
  (
    -- lender_distribution: sole lender (DBSA), R350M facility, special purpose report —
    -- Insurance claim special purpose report; agent bank review complete; DBSA
    -- distribution package sent; acknowledgement pending.
    'lrep_008',
    'SOLAR-LP-MCR-006',
    'Q2 2026',
    1,
    'sole',
    'special_purpose_report',
    NULL,
    '2026-05-20',
    'lender_distribution',
    datetime('now', '+3 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Special purpose insurance claim lender report distributed to DBSA for the 20 MW Limpopo solar project (sole lender: DBSA R350M senior debt, DBSA-SF-2022-LP-006). Special purpose report triggered by W23 insurance claim ins_006 (hail damage event 2026-04-15; estimated loss R18.4M, insurance claim lodged with Santam under all-risk property policy). DBSA Senior Facility Agreement clause 20.7 requires borrower to notify lender within 5 business days of any material insurance event and to provide a special purpose report within 15 business days covering: (1) Event description and cause; (2) Estimated financial impact and insurance recovery timeline; (3) Construction and repair plan with timeline; (4) Plant availability and generation impact during repair period; (5) Insurance policy details, deductible exposure, and broker confirmation of claim notification. Special purpose report prepared 2026-05-02 (within 15 business days of 2026-04-15 event): event description confirmed (Category 3 hail storm, 25mm diameter hailstones, 34-minute duration per SA Weather Service data SAWS-2026-LP-042); Santam claim reference SSP-INS-2026-LP-006 lodged 2026-04-17; OEM Jinko Solar module replacement quotation R16.8M (including installation); plant availability during repair: 60% (22 of 50 string inverters operational, 12 of 20 MW available); generation impact April 2026: 1.2 GWh loss vs P50; repair timeline: 8 weeks (module delivery and installation by 2026-06-10 per Jinko Solar delivery commitment). DBSA distribution package sent via secure DBSA lending portal (upload reference DBSA-DOC-2026-LP-006-SPR) on 2026-05-28. DBSA confirmation of receipt pending.',
    '2026-05-03T08:00:00Z',
    '2026-05-28T16:00:00Z'
  ),
  (
    -- acknowledgement_pending: syndicated (7 lenders), R2.8B facility, quarterly report —
    -- Q1 2026 quarterly report; distributed by Rand Merchant Bank to all 7 lenders;
    -- awaiting lender acknowledgement confirmations.
    'lrep_009',
    'WIND-FS-LRG-009',
    'Q1 2026',
    7,
    'syndicated',
    'quarterly_report',
    'Rand Merchant Bank (Agent Bank)',
    '2026-05-15',
    'acknowledgement_pending',
    datetime('now', '+2 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Q1 2026 quarterly lender report acknowledgement pending for the 150 MW Free State wind project (syndicated lenders: DBSA R560M + IDC R420M + Rand Merchant Bank R350M + Standard Bank R350M + Nedbank R280M + ABSA R420M + KfW DEG R420M = R2.8B total, SFA-2019-FS-009). Rand Merchant Bank (agent bank) distributed Q1 2026 report package to all 7 lenders on 2026-05-13 via RMB lender portal (SFA clause 6.5 distribution mechanism). Distribution reference RMB-DIST-Q12026-FS-009, portal batch upload confirmed at 14:22 SAST on 2026-05-13. Each lender received: compliance certificate, management accounts, financial model, IE quarterly report, DSRA/MRA statements, insurance certificates, E&S monitoring report. SFA clause 18.6 requires all lenders to acknowledge receipt within 5 business days of distribution; acknowledgement deadline: 2026-05-20. Acknowledgement status as at 2026-06-02: (1) DBSA — acknowledged via portal 2026-05-14 (within 1 business day); (2) IDC — acknowledged 2026-05-15; (3) Rand Merchant Bank (as lender, separate from agent role) — acknowledged 2026-05-14; (4) Standard Bank — acknowledged 2026-05-16; (5) Nedbank — acknowledged 2026-05-19; (6) ABSA — not yet acknowledged (relationship manager unresponsive; RMB chasing); (7) KfW DEG — acknowledged 2026-05-16 (KfW DEG semi-annual review team, Frankfurt). ABSA acknowledgement outstanding; RMB agent bank escalating to ABSA Head of Project Finance. Q1 2026 key metrics: generation 47.3 GWh (98.5% of P50); DSCR 1.44x; DSRA R212M (fully funded); no covenant breach; plant availability 96.8%.',
    '2026-04-01T08:00:00Z',
    '2026-06-02T10:00:00Z'
  ),
  (
    -- package_acknowledged (terminal): club tier (4 lenders), R1.2B facility,
    -- annual report — FY2025 annual report; all lenders acknowledged receipt and
    -- confirmed no queries; is_reportable=1.
    'lrep_010',
    'SOLAR-FS-MED-010',
    'Annual 2025',
    4,
    'club',
    'annual_report',
    'ABSA (Agent Bank)',
    '2026-04-30',
    'package_acknowledged',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'All 4 club lenders acknowledged the FY2025 annual report package via ABSA agent bank portal on or before 2026-05-12. No queries or objections raised. DSCR 1.52x (base case), 1.33x (downside) — well above 1.20x covenant minimum. FY2025 distribution R28.4M cleared all waterfall tests. is_reportable=1: annual report acknowledgement with DSCR confirmation is a mandatory REIPPPP and lender compliance reportable event per SFA annual certification requirements.',
    'FY2025 annual lender report package acknowledged by all 4 club lenders for the 100 MW Free State solar project (DBSA R360M + IDC R240M + Nedbank R300M + Standard Bank R300M = R1.2B, CTA-2020-FS-010). ABSA CIB appointed agent bank; annual report submitted 2026-04-28 (2 days ahead of 2026-04-30 due date). ABSA distributed package to all 4 lenders on 2026-04-29. Acknowledgement log: (1) DBSA — acknowledged 2026-04-30; (2) IDC — acknowledged 2026-05-02; (3) Nedbank — acknowledged 2026-05-06 (Nedbank in-house review noted Q4 2025 DSCR dip to 1.38x during grid maintenance period — confirmed within covenant threshold; no query raised); (4) Standard Bank — acknowledged 2026-05-12 (Standard Bank project finance team was on public holiday queue — acknowledged after bank returned). All 4 lenders confirmed: no Event of Default, no covenant breach, no outstanding information requests. FY2025 compliance certification complete. Package acknowledged status recorded — next semi-annual report due 2026-08-31 (H1 2026 period). REIPPPP IPP Office notified of FY2025 lender reporting completion per IA clause 12.4 annual compliance milestone notification. is_reportable=1: club lender annual acknowledgement is a mandatory REIPPPP compliance milestone — updates IPP performance dashboard and triggers equity distribution clearance confirmation for FY2025 R28.4M distribution.',
    '2026-01-15T08:00:00Z',
    '2026-05-12T11:00:00Z'
  ),
  (
    -- package_disputed (terminal): sole tier (1 lender), R350M facility,
    -- quarterly report — Q4 2025 quarterly report disputed by DBSA;
    -- is_reportable=1; sla_breached=1.
    'lrep_011',
    'SOLAR-COM-NW-011',
    'Q4 2025',
    1,
    'sole',
    'quarterly_report',
    NULL,
    '2026-02-15',
    'package_disputed',
    datetime('now', '-5 days'),
    1,
    1,
    'p_ipp_dev_003',
    'DBSA raised a formal dispute on the Q4 2025 quarterly compliance certificate on 2026-02-20: (1) DBSA internal credit team disputes the borrower DSCR calculation methodology — borrower included R8.4M insurance proceeds in the numerator of the DSCR calculation; DBSA position is that one-off insurance proceeds must be excluded per SF clause 18.2(d) definition of Cash Available for Debt Service; on DBSA methodology, DSCR falls from 1.28x to 1.19x, triggering a breach of the 1.20x covenant minimum; (2) DBSA identified a discrepancy in the Q4 2025 management accounts: cost of R2.1M booked to capital expenditure account (inverter replacement classified as capex) which DBSA argues is an operational expense that should reduce CFADS — further reduces DSCR by 0.02x. On DBSA corrected basis: DSCR Q4 2025 = 1.17x — below 1.20x covenant minimum. DBSA issued Reservation of Rights letter DBSA-ROR-2026-NW-011 on 2026-02-25. SLA breach: response to DBSA dispute was due within 10 business days (2026-03-11); borrower response not provided until 2026-03-20 — 7 business days late.',
    'Q4 2025 quarterly lender report formally disputed by DBSA (sole lender, R350M SF, DBSA-SF-2022-NW-011) for the 20 MW North West solar project. Dispute lodged 2026-02-20 via DBSA relationship manager email and DBSA lender portal dispute flag. DBSA dispute reference DBSA-DISP-Q42025-NW-011. Root issue: DSCR calculation dispute with potential covenant breach implication. Borrower submitted Q4 2025 compliance certificate on 2026-02-14 (1 day before due date) reporting DSCR 1.28x — above the 1.20x covenant minimum by 6.7% headroom. DBSA credit analysis team reviewed the certificate on 2026-02-19 and identified two items: (1) Insurance proceeds inclusion: R8.4M hail damage insurance payout (W23 ins_011) was included in CFADS by the borrower per its interpretation of SF clause 18.2(d); DBSA interprets the SF definition to exclude non-recurring insurance proceeds from CFADS — if excluded, DSCR falls to 1.19x (below covenant); (2) Capex vs opex classification: R2.1M inverter string replacement classified by borrower as capital expenditure (excluded from operating costs in CFADS calculation); DBSA position is that partial inverter string replacement is a maintenance expense (opex) under the SF maintenance reserve waterfall provisions — reclassification reduces DSCR by further 0.02x to 1.17x. Borrower response submitted 2026-03-20 (late): ENS legal opinion confirming borrower CFADS interpretation; alternative: borrower proposes SF amendment or waiver letter addressing insurance proceeds carve-out. DBSA reviewing borrower response; dispute resolution meeting scheduled. sla_breached=1: response SLA exceeded. is_reportable=1: formal DBSA dispute with potential covenant breach implication is a REIPPPP reportable event.',
    '2025-10-01T08:00:00Z',
    '2026-03-20T14:00:00Z'
  ),
  (
    -- covenant_breach (terminal): bilateral tier (2 lenders), R680M facility,
    -- quarterly report — Q3 2025 report confirmed DSCR covenant breach;
    -- is_reportable=1; sla_breached=1.
    'lrep_012',
    'WIND-EC-SML-012',
    'Q3 2025',
    2,
    'bilateral',
    'quarterly_report',
    NULL,
    '2025-11-15',
    'covenant_breach',
    datetime('now', '-20 days'),
    1,
    1,
    'p_ipp_dev_001',
    'Q3 2025 quarterly compliance certificate confirmed DSCR covenant breach: actual Q3 2025 DSCR 1.09x (below 1.20x covenant minimum by 9.2%). Root cause: sustained Eskom load shedding Stage 6 (August 2025) curtailed actual generation to 24.1 GWh vs P50 38.2 GWh (63.1% of P50) in Q3 2025. Grid curtailment loss R11.2M in Q3 2025 (W46 curtailment_012 filed). O&M cost overrun R1.8M in Q3 2025 (gearbox replacement WTG-08 unbudgeted event per W16 wo_012). Combined effect: CFADS reduced from projected R28.4M to R19.8M; debt service Q3 2025 R18.2M (IDC + DBSA principal and interest); DSCR = 19.8/18.2 = 1.09x. IDC issued Covenant Breach Notice CBN-IDC-Q32025-EC-012 on 2025-11-20; DBSA issued Reservation of Rights DBSA-ROR-Q32025-EC-012 on 2025-11-22. Both lenders invoked standstill period (90 days per CTA clause 29.3) pending cure plan. SLA breach: borrower cure plan was due within 20 business days of breach notice (2025-12-18); plan submitted 2025-12-22 — 3 business days late.',
    'Q3 2025 DSCR covenant breach confirmed for the 75 MW Eastern Cape wind project (bilateral lenders: IDC R340M + DBSA R340M = R680M, CTA-2021-EC-012). Covenant breach formally declared by IDC and DBSA on 2025-11-20 following receipt and review of the Q3 2025 quarterly compliance certificate (submitted 2025-11-13). Compliance certificate Q3 2025: DSCR 1.09x — 9.2% below the 1.20x quarterly DSCR maintenance covenant minimum per CTA clause 17.4(a). Covenant breach is the most severe terminal state of the lender reporting chain and triggers the W45 loan default and enforcement lifecycle (loan_default_012). Root cause analysis: (1) Generation shortfall — Q3 2025 actual generation 24.1 GWh vs P50 38.2 GWh due to sustained Eskom Stage 6 load shedding in August 2025 (ESKOM LSO-2025-AUG-6 issued 2025-08-04 for 26 consecutive days); WTG curtailment per Eskom dispatch instruction 680 hours during Q3 2025; deemed energy compensation claim R11.2M filed under PPA clause 14 (W46 curtailment_012 — claim under negotiation); (2) Unbudgeted O&M — gearbox failure on WTG-08 (Siemens Gamesa SG-3.0-132) required emergency gearbox replacement R3.8M; budgeted maintenance reserve R2.0M was insufficient (R1.8M overrun); maintenance reserve account fully drawn; (3) Insurance recovery timeline — gearbox claim submitted to Santam (W23 ins_012) but insurance proceeds not yet received (recovery expected Q1 2026 per Santam adjuster estimate). Cure plan submitted 2025-12-22 (3 days late per CTA standstill): (a) curtailment compensation R11.2M expected Q1 2026 from Eskom; (b) gearbox insurance recovery R3.4M expected Q1 2026; (c) DSRA drawdown R6.8M (3 months reserve available) to bolster CFADS; (d) DSCR projected to recover to 1.24x in Q4 2025 and 1.38x in Q1 2026 post-insurance recovery. IDC and DBSA reviewing cure plan; standstill expires 2026-02-17. is_reportable=1: DSCR covenant breach is a mandatory REIPPPP reportable event per IA clause 10.3 material adverse event notification.',
    '2025-07-01T08:00:00Z',
    '2025-12-22T15:00:00Z'
  );
