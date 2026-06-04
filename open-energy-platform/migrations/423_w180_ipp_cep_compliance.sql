-- W180: IPP Community Equity Programme (CEP) Compliance Lifecycle
-- REIPPPP / DMRE community equity and economic development management cycle:
-- cep_triggered → stakeholder_identification → distribution_calculation → trustee_approval →
-- payment_preparation → distributions_paid → community_dev_verification →
-- documentation_compiled → dmre_submission → cep_compliant / cep_non_compliant / cep_lapsed.
--
-- 18 columns (id + 17 data columns):
--   id, project_ref, compliance_year, project_mw, project_tier,
--   cep_equity_pct, structure_type, distribution_amount_zar, community_dev_spend_zar,
--   trustee_name, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_cep_compliance (
  id                          TEXT    PRIMARY KEY,
  project_ref                 TEXT    NOT NULL,
  compliance_year             INTEGER NOT NULL,
  project_mw                  REAL    NOT NULL,
  project_tier                TEXT    NOT NULL
                                      CHECK(project_tier IN (
                                        'small','medium','large','major','flagship'
                                      )),
  cep_equity_pct              REAL,
  structure_type              TEXT    NOT NULL DEFAULT 'community_trust'
                                      CHECK(structure_type IN (
                                        'community_trust',
                                        'npc',
                                        'spv',
                                        'direct_equity',
                                        'blended'
                                      )),
  distribution_amount_zar     REAL,
  community_dev_spend_zar     REAL,
  trustee_name                TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'cep_triggered'
                                      CHECK(chain_status IN (
                                        'cep_triggered',
                                        'stakeholder_identification',
                                        'distribution_calculation',
                                        'trustee_approval',
                                        'payment_preparation',
                                        'distributions_paid',
                                        'community_dev_verification',
                                        'documentation_compiled',
                                        'dmre_submission',
                                        'cep_compliant',
                                        'cep_non_compliant',
                                        'cep_lapsed'
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

CREATE INDEX IF NOT EXISTS idx_ipp_cep_project
  ON oe_ipp_cep_compliance(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_cep_status
  ON oe_ipp_cep_compliance(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_cep_sla
  ON oe_ipp_cep_compliance(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:compliance_year  4:project_mw  5:project_tier
--  6:cep_equity_pct  7:structure_type  8:distribution_amount_zar  9:community_dev_spend_zar
--  10:trustee_name  11:chain_status
--  12:sla_due_date  13:sla_breached  14:is_reportable
--  15:actor_party  16:reason  17:notes
--  18:created_at  19:updated_at

INSERT OR IGNORE INTO oe_ipp_cep_compliance VALUES
  (
    -- cep_triggered: small 20MW solar — CEP obligation triggered by REIPPPP Implementation Agreement signature; community trust not yet constituted
    'cep_001',
    'SOLAR-COM-NC-001',
    2026,
    20.0,
    'small',
    5.0,
    'community_trust',
    280000.0,
    150000.0,
    NULL,
    'cep_triggered',
    datetime('now', '+60 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'REIPPPP Implementation Agreement signed 2026-05-28 for the 20 MW Northern Cape solar project (BW6 preferred bidder). CEP obligation triggered per Schedule 3 paragraph 2.1: minimum 5% community equity participation by year of first commercial operation. Community equity structure is a community trust to be constituted over the local Riemvasmaak community (±2 200 beneficiaries). Distribution entitlement calculated at R280k per annum based on 5% equity share in project distributable cash. Community development spend commitment R150k per annum. Trust deed drafting instructed with attorneys Mkokeli Inc (Cape Town). IPP project manager M. Dlamini flagged as CEP liaison. Stakeholder identification process to commence within 30 days of IA signature. SLA deadline 2026-07-28.',
    '2026-05-28T08:00:00Z',
    '2026-05-28T10:00:00Z'
  ),
  (
    -- stakeholder_identification: medium 80MW wind — beneficiary households and ward committees identified; representative structures being confirmed
    'cep_002',
    'WIND-EC-MED-002',
    2026,
    80.0,
    'medium',
    10.0,
    'npc',
    1200000.0,
    600000.0,
    NULL,
    'stakeholder_identification',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Stakeholder identification process underway for the 80 MW Eastern Cape wind project (Kouga municipality footprint). CEP structure selected as non-profit company (NPC) representing four ward communities (wards 3, 7, 11, 14; estimated 6 800 beneficiary households). IPP engaged community liaison officer T. Nkosi (NPC Board designate) and SiyaQhuba Development Consultants to facilitate ward-level consultation sessions. Sessions held 2026-05-15 and 2026-05-22; attendance registers signed by ward councillors. Identified: 6 affected ward committees, 2 traditional authority structures, 1 ratepayer association, 3 NPO service providers active in education and health. NPC registration with CIPC in progress (reference CIPC-NPC-2026-EC-0042). 10% equity translates to R1.2M annual distribution at project IRR; community development spend R600k/yr. Representative NPC board composition and community mandate documents being finalised. Next milestone: distribution calculation workshop scheduled 2026-06-20.',
    '2026-05-15T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- distribution_calculation: large 200MW solar park — annual distribution quantum calculated by independent financial adviser; trustee review pending
    'cep_003',
    'SOLAR-FS-LRG-003',
    2026,
    200.0,
    'large',
    15.0,
    'community_trust',
    4800000.0,
    2200000.0,
    'Chairperson: M. Dlamini',
    'distribution_calculation',
    datetime('now', '+35 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Independent financial adviser PricewaterhouseCoopers Advisory Services completed CEP distribution calculation for the 200 MW Free State solar park (compliance year 2026). Calculation basis: 15% community equity held by Thabo Nchu Community Trust (±9 400 beneficiaries); distributable cash after debt service, DSRA top-up, and O&M reserve = R32.0M; trust entitlement 15% = R4.8M. Community development spend commitment R2.2M drawn from project social investment fund per Implementation Agreement Schedule 4 paragraph 5.3. PwC calculation report (reference PwC-CEP-2026-FS-003, dated 2026-05-30) reviewed by independent engineer (WSP South Africa) and confirmed as compliant with REIPPPP Equity Empowerment Framework version 2.3. Calculation report submitted to Thabo Nchu Community Trust for trustee board review. Trust chairperson M. Dlamini acknowledged receipt 2026-06-01. Trustee approval meeting scheduled 2026-06-18. SLA deadline for trustee approval 2026-07-07.',
    '2026-05-01T08:00:00Z',
    '2026-06-02T14:00:00Z'
  ),
  (
    -- trustee_approval: major 400MW wind farm — community trust board approved distribution quantum; payment preparation instructed
    'cep_004',
    'WIND-WC-MAJ-004',
    2026,
    400.0,
    'major',
    30.0,
    'community_trust',
    18000000.0,
    8500000.0,
    'Community Trust Board: T. Nkosi',
    'trustee_approval',
    datetime('now', '+28 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Matzikama Community Trust board (5 trustees) passed unanimous resolution on 2026-06-01 approving the 2026 CEP distribution quantum of R18.0M for the 400 MW Western Cape wind farm. Trust board: chairperson T. Nkosi, deputy S. Hendricks, trustees P. van Zyl, N. Adams, and M. Jacobs. Resolution number MCT-2026-RES-004. PricewaterhouseCoopers distribution calculation report confirmed as basis for approval. R18.0M distribution represents 30% equity entitlement of the R60M project distributable cash flow for FY2026. Community development spend R8.5M approved for allocation to three programmes: early childhood development (R3.2M), bursary fund (R2.8M), and rural electrification matching programme (R2.5M). Trust board instructed IPP to proceed to payment preparation — trust banking details confirmed with Nedbank Private Wealth account MCT-NED-2026-001. DMRE IPP Office notified of trustee approval per Implementation Agreement clause 8.4. Payment preparation to be completed within 28 days.',
    '2026-04-15T08:00:00Z',
    '2026-06-01T16:00:00Z'
  ),
  (
    -- payment_preparation: flagship 750MW solar — payment files being assembled; bank transfer mandate under trustee wet-ink signature process
    'cep_005',
    'SOLAR-NC-FLG-005',
    2026,
    750.0,
    'flagship',
    40.0,
    'blended',
    52000000.0,
    22000000.0,
    'CT Chair: N. Mthembu',
    'payment_preparation',
    datetime('now', '+20 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'Payment preparation in progress for the 750 MW Northern Cape flagship solar project (Kathu Solar Park extension). Blended CEP structure: 40% community equity split between Kalahari Community Trust (25%, chairperson N. Mthembu) and Ubuntu Development NPC (15%). Total distribution R52.0M: Kalahari Community Trust R32.5M, Ubuntu Development NPC R19.5M. Community development spend R22.0M allocated to: school infrastructure (R9.0M), healthcare mobile units (R6.5M), small business incubation (R4.2M), bursaries (R2.3M). Payment file preparation: Standard Bank CIB treasury team assembling EFT batch instructions for DMRE-witnessed transfer on 2026-06-25. Trustee wet-ink signature required on payment authorisation mandate — N. Mthembu and two co-trustees signing in Cape Town on 2026-06-10; Ubuntu NPC board authorisation via circular resolution 2026-06-08. DMRE IPP Office observer invited for payment execution. Independent Engineer (SMEC South Africa) and external auditor (Deloitte) attending for sign-off. SLA deadline for payment execution 2026-06-22.',
    '2026-04-01T08:00:00Z',
    '2026-06-02T09:00:00Z'
  ),
  (
    -- distributions_paid: small 35MW wind — annual distribution paid to community trust; community dev spend awaiting third-party verification
    'cep_006',
    'WIND-KZN-SML-006',
    2026,
    35.0,
    'small',
    5.0,
    'community_trust',
    280000.0,
    150000.0,
    'Trust Chair: R. Botha',
    'distributions_paid',
    datetime('now', '+15 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'Annual CEP distribution of R280k paid to Mfolozi Community Trust on 2026-05-30 for the 35 MW KwaZulu-Natal wind project (compliance year 2026). EFT reference: FNBCORP-2026-KZN-CEP-006, confirmed by Trust chair R. Botha and co-trustee A. Zwane. Trust bank statement excerpt attached to transaction record. Payment witnessed by DMRE IPP Office representative (Mr. K. Naidoo, IPP Programme Manager) per IA clause 8.5. Community development spend of R150k allocated to Eshowe community hall renovation — spend to be executed by appointed contractor Ntuli Construction by 2026-07-31. DMRE third-party verification of community dev spend scheduled for 2026-08-15 (external verifier: KPMG Development Finance Advisory). Until community dev verification complete, case remains open. is_reportable=0 (small-tier; below mandatory DMRE programme office escalation threshold for compliant distributions).',
    '2026-03-01T08:00:00Z',
    '2026-05-30T15:30:00Z'
  ),
  (
    -- community_dev_verification: medium 95MW solar — KPMG verifying community development spend execution on the ground
    'cep_007',
    'SOLAR-MPU-MED-007',
    2026,
    95.0,
    'medium',
    10.0,
    'npc',
    1200000.0,
    600000.0,
    'NPC Board: S. Sithole',
    'community_dev_verification',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'KPMG Development Finance Advisory conducting community development spend verification for the 95 MW Mpumalanga solar project (compliance year 2026). Emalahleni Community Development NPC (board chair S. Sithole) executed R600k community dev spend across three programmes: school computer labs R220k (Steve Tshwete High School, completed 2026-04-30), bursary payments R180k (12 university bursaries disbursed May 2026 through NSFAS top-up), skills training programme R200k (solar PV installation course, 40 participants, Nkangala TVET College, completed 2026-05-15). KPMG field team visited Nkangala on 2026-06-01: attendance certificates, invoices, and beneficiary confirmation letters reviewed on-site. KPMG reference: KPMG-CEP-VER-2026-MPU-007. School computer lab site visit scheduled 2026-06-05; bursary confirmation letters being collated by NPC administrator. KPMG verification report expected 2026-06-12. Documentation compilation to follow immediately.',
    '2026-03-15T08:00:00Z',
    '2026-06-02T13:00:00Z'
  ),
  (
    -- documentation_compiled: large 180MW wind — full compliance dossier compiled; DMRE submission package under final legal review
    'cep_008',
    'WIND-LIM-LRG-008',
    2026,
    180.0,
    'large',
    15.0,
    'spv',
    4800000.0,
    2200000.0,
    'Chairperson: M. Dlamini',
    'documentation_compiled',
    datetime('now', '+7 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'CEP compliance dossier compiled for the 180 MW Limpopo wind project (compliance year 2026). Structure: Limpopo Green Energy SPV (Pty) Ltd — special-purpose vehicle holding 15% community equity on behalf of Vhembe District beneficiary communities (±14 000 households). Dossier contents: (1) SPV constitutional documents and CIPC registration certificate; (2) independent financial adviser calculation report (Deloitte FY2026, R4.8M distribution); (3) SPV board resolution approving distribution (signed 2026-05-20); (4) EFT payment confirmation (distribution R4.8M paid 2026-05-28 to SPV settlement account); (5) community development spend verification report (BDO Advisory, R2.2M spend verified across healthcare clinic support and bursaries, report dated 2026-06-01); (6) independent engineer sign-off (WSP SA, confirming project MW output basis accurate); (7) external auditor (Grant Thornton) attestation of distribution calculation. Cliffe Dekker Hofmeyr undertaking final legal review of dossier completeness against DMRE CEP Compliance Checklist 2024 edition. Review expected by 2026-06-09. DMRE submission to follow.',
    '2026-02-01T08:00:00Z',
    '2026-06-02T16:00:00Z'
  ),
  (
    -- dmre_submission: medium 120MW solar — compliance dossier submitted to DMRE IPP Office; awaiting formal assessment
    'cep_009',
    'SOLAR-FS-MED-009',
    2025,
    120.0,
    'medium',
    10.0,
    'community_trust',
    1200000.0,
    600000.0,
    'NPC Board: S. Sithole',
    'dmre_submission',
    datetime('now', '+5 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'CEP compliance dossier for the 120 MW Free State solar park (compliance year 2025) submitted to DMRE IPP Office on 2026-06-01. Submission reference DMRE-CEP-2025-FS-009 issued by DMRE on receipt. Dossier: Thembeka Community Trust (±7 200 beneficiaries), 10% community equity, R1.2M annual distribution paid 2025-11-28, R600k community development spend verified by EY Advisory (spend on rural water access project Petrusburg, verified 2026-04-15). DMRE IPP Office acknowledged receipt 2026-06-01 and confirmed assessment window of 15 business days per REIPPPP CEP Compliance Procedure note 2023-08. Formal assessment by DMRE empowerment desk underway. IPP project manager S. Sithole available for any queries. Trust chairperson statutory declaration and independent engineer attestation of project MW basis included in dossier. SLA deadline for DMRE determination 2026-06-22. is_reportable=0 (medium-tier compliant submission; no non-compliance flag raised).',
    '2025-10-01T08:00:00Z',
    '2026-06-01T11:00:00Z'
  ),
  (
    -- cep_compliant: major 400MW wind — DMRE confirmed full CEP compliance for FY2025; is_reportable=1
    'cep_010',
    'WIND-WC-MAJ-010',
    2025,
    400.0,
    'major',
    30.0,
    'community_trust',
    18000000.0,
    8500000.0,
    'Community Trust Board: T. Nkosi',
    'cep_compliant',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'DMRE IPP Office confirmed full CEP compliance for compliance year 2025. Distribution of R18.0M paid to Matzikama Community Trust verified. Community development spend of R8.5M independently verified. All documentation in order. Compliance certificate DMRE-CEP-CERT-2025-WC-010 issued. REIPPPP programme office notified.',
    'DMRE IPP Office issued formal CEP compliance certificate (DMRE-CEP-CERT-2025-WC-010) on 2025-12-15 for the 400 MW Western Cape wind farm (compliance year 2025). Assessment confirmed: (1) R18.0M distribution to Matzikama Community Trust (30% equity, ±11 500 beneficiaries) paid 2025-11-25 — verified against bank statements and trustee confirmations; (2) R8.5M community development spend independently verified by PwC Advisory (early childhood development R3.2M, bursaries R2.8M, rural electrification R2.5M, all projects on-the-ground verified by DMRE field officer K. Hendricks on 2025-12-01); (3) SPV governance and trust deed in conformity with REIPPPP Community Equity Framework 2023; (4) independent engineer attested project MW output basis accurate for distribution calculation. is_reportable=1 (major-tier CEP compliance confirmed triggers mandatory REIPPPP programme office reporting and unlocks DMRE annual performance score update for the BW6 programme cohort). IPP licence condition record updated. Compliance certificate valid for compliance year 2025; new cycle for 2026 triggered.',
    '2025-01-15T08:00:00Z',
    '2025-12-15T14:00:00Z'
  ),
  (
    -- cep_non_compliant: small 20MW solar — distribution not paid within SLA; DMRE issued non-compliance notice; sla_breached=1, is_reportable=1
    'cep_011',
    'SOLAR-COM-NW-011',
    2025,
    20.0,
    'small',
    5.0,
    'direct_equity',
    280000.0,
    150000.0,
    'Trust Chair: R. Botha',
    'cep_non_compliant',
    datetime('now', '-5 days'),
    1,
    1,
    'p_ipp_dev_003',
    'DMRE IPP Office determined CEP non-compliance for compliance year 2025: (1) annual distribution of R280k not paid to community beneficiaries by required date of 2025-11-30; (2) community development spend of R150k not executed and no evidence of programme commitment; (3) direct equity transfer documentation not filed with DMRE. Non-compliance notice DMRE-CEP-NC-2025-NW-011 issued. IPP has 30-day cure period to remediate or face Implementation Agreement suspension.',
    'DMRE IPP Office issued non-compliance notice (DMRE-CEP-NC-2025-NW-011) on 2026-05-28 for the 20 MW Northern Cape solar project (compliance year 2025). Three non-compliance findings: (1) required annual distribution of R280k to direct equity community shareholders not paid — deadline was 2025-11-30 per IA Schedule 3 paragraph 4.2, payment still outstanding as at notice date (6 months overdue); (2) community development spend of R150k for 2025 not executed — no programme evidence submitted; (3) direct equity transfer register not updated with CIPC and copy not filed with DMRE per REIPPPP Equity Framework obligation. SLA breach: DMRE internal CEP assessment SLA 15 business days from annual due date; exceeded by 5 days at non-compliance notice issuance. is_reportable=1 (small-tier CEP non-compliance triggers REIPPPP programme office watch-list and DMRE remediation register). IPP issued 30-day cure notice per IA clause 8.9. Failure to cure within 30 days triggers escalation to DMRE legal enforcement.',
    '2025-06-01T08:00:00Z',
    '2026-05-28T15:00:00Z'
  ),
  (
    -- cep_lapsed: medium 80MW wind — CEP obligations not met for two consecutive years; trust dissolved; lapsed; sla_breached=1, is_reportable=1
    'cep_012',
    'WIND-EC-MED-012',
    2024,
    80.0,
    'medium',
    10.0,
    'npc',
    1200000.0,
    600000.0,
    'NPC Board: S. Sithole',
    'cep_lapsed',
    datetime('now', '-20 days'),
    1,
    1,
    'p_ipp_dev_001',
    'CEP obligations lapsed due to NPC deregistration by CIPC following two consecutive years of non-compliance (2023 and 2024). DMRE IPP Office declared CEP lapse on 2026-05-12. NPC board failed to file annual returns; CIPC deregistered NPC 2026-03-15. No alternative community structure in place. DMRE escalated to REIPPPP programme director for implementation agreement remediation review.',
    'DMRE IPP Office declared CEP lapse (DMRE-CEP-LAPSED-2024-EC-012) on 2026-05-12 for the 80 MW Eastern Cape wind project (compliance year 2024). Root cause: Kouga Community Development NPC (NPC board chair S. Sithole) deregistered by CIPC on 2026-03-15 following failure to file annual returns for 2023 and 2024. NPC had been in administrative difficulty since 2023 following chairperson S. Sithole stepping down and no quorate board reconstitution. Distributions of R1.2M for 2023 and R1.2M for 2024 (total R2.4M) were never paid to community beneficiaries. Community development spend of R600k/yr for 2023 and 2024 (total R1.2M) not executed. DMRE issued non-compliance notices for both years (DMRE-CEP-NC-2023-EC-012 and DMRE-CEP-NC-2024-EC-012) with no remediation received. Following NPC deregistration DMRE declared full lapse — Implementation Agreement clause 8.11 provides that a lapsed CEP obligation converts to a financial penalty payable to the REIPPPP Community Development Fund equal to 200% of outstanding distributions (R4.8M penalty). SLA breach 20 days. is_reportable=1 (CEP lapse is a mandatory REIPPPP programme office and DMRE board-level reportable event for medium-tier projects). IPP required to reconstitute community structure within 60 days or face IA termination proceedings.',
    '2024-01-01T08:00:00Z',
    '2026-05-12T10:00:00Z'
  );
