-- W178: IPP Insurance Renewal Lifecycle
-- REIPPPP / lender-covenant insurance renewal cycle per project year:
-- renewal_triggered → coverage_gap_analysis → broker_instruction → market_placement →
-- terms_received → ipp_lender_review → documentation_preparation → documents_submitted →
-- lender_confirmation_requested → confirmed_adequate / confirmed_inadequate / coverage_lapsed.
--
-- 18 columns (id + 17 data columns):
--   id, project_ref, renewal_year, annual_premium_zar, premium_tier,
--   insured_value_zar, line_type, policy_expiry_date, broker_name, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_insurance_renewals (
  id                          TEXT    PRIMARY KEY,
  project_ref                 TEXT    NOT NULL,
  renewal_year                INTEGER NOT NULL,
  annual_premium_zar          REAL    NOT NULL,
  premium_tier                TEXT    NOT NULL
                                      CHECK(premium_tier IN (
                                        'small','medium','large','major','flagship'
                                      )),
  insured_value_zar           REAL,
  line_type                   TEXT    NOT NULL DEFAULT 'comprehensive_package'
                                      CHECK(line_type IN (
                                        'contractors_all_risk',
                                        'operational_all_risk',
                                        'third_party_liability',
                                        'business_interruption',
                                        'directors_officers',
                                        'environmental_impairment',
                                        'comprehensive_package'
                                      )),
  policy_expiry_date          TEXT,
  broker_name                 TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'renewal_triggered'
                                      CHECK(chain_status IN (
                                        'renewal_triggered',
                                        'coverage_gap_analysis',
                                        'broker_instruction',
                                        'market_placement',
                                        'terms_received',
                                        'ipp_lender_review',
                                        'documentation_preparation',
                                        'documents_submitted',
                                        'lender_confirmation_requested',
                                        'confirmed_adequate',
                                        'confirmed_inadequate',
                                        'coverage_lapsed'
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

CREATE INDEX IF NOT EXISTS idx_ipp_insr_project
  ON oe_ipp_insurance_renewals(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_insr_status
  ON oe_ipp_insurance_renewals(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_insr_sla
  ON oe_ipp_insurance_renewals(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:renewal_year  4:annual_premium_zar  5:premium_tier
--  6:insured_value_zar  7:line_type  8:policy_expiry_date  9:broker_name  10:chain_status
--  11:sla_due_date  12:sla_breached  13:is_reportable
--  14:actor_party  15:reason  16:notes
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_insurance_renewals VALUES
  (
    -- renewal_triggered: small 20 MW community solar — 2026 renewal cycle opened 90 days before expiry
    'insr_001',
    'SOLAR-COM-EC-001',
    2026,
    1500000.0,
    'small',
    280000000.0,
    'operational_all_risk',
    '2026-09-30',
    'Aon South Africa',
    'renewal_triggered',
    datetime('now', '+90 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2026 insurance renewal cycle triggered 90 days before policy expiry (2026-09-30). Aon South Africa appointed as placing broker per REIPPPP lender requirements. Operational all-risk line covers solar PV plant, inverter station, and DC cabling at R280M replacement cost. Renewal instruction checklist dispatched to facility manager and O&M contractor for updated asset register and loss history declaration.',
    '2026-06-01T08:00:00Z',
    '2026-06-01T08:00:00Z'
  ),
  (
    -- coverage_gap_analysis: medium 75 MW wind farm — 2026 renewal, broker analysing gaps vs lender schedule
    'insr_002',
    'WIND-NPE-MED-002',
    2026,
    4200000.0,
    'medium',
    920000000.0,
    'business_interruption',
    '2026-10-31',
    'Marsh McLennan',
    'coverage_gap_analysis',
    datetime('now', '+80 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    '2026 coverage gap analysis in progress. Marsh McLennan reviewing current business interruption policy against DBSA lender insurance schedule requirements for this 75 MW wind farm. Key gap items identified: (1) indemnity period 12 months vs lender minimum 18 months for wind; (2) advance loss of profit sublimit R45M vs required R68M based on P90 annual revenue; (3) insurer credit rating downgrade from A to A-minus requires lender waiver or substitute insurer. Gap report to be submitted to lender technical advisor within 10 business days.',
    '2026-05-15T08:00:00Z',
    '2026-05-28T10:00:00Z'
  ),
  (
    -- broker_instruction: large 150 MW solar park — 2026 renewal, broker formally instructed to place
    'insr_003',
    'SOLAR-GAU-LRG-003',
    2026,
    18000000.0,
    'large',
    2100000000.0,
    'comprehensive_package',
    '2026-11-30',
    'Willis Towers Watson',
    'broker_instruction',
    datetime('now', '+65 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2026 broker instruction issued to Willis Towers Watson on 2026-06-02 for comprehensive package renewal covering 150 MW Gauteng solar park. Instruction letter signed by CFO and lender representative. Coverage lines instructed: operational all-risk R2.1B, business interruption 18-month indemnity, third-party liability R500M, directors and officers R100M, and environmental impairment R50M. Willis WTW market submission to Lloyd''s, Munich Re, and Hannover Re syndicates planned for w/c 2026-06-09. Loss run for past 5 policy years attached to submission.',
    '2026-05-10T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- market_placement: major 300 MW wind farm — 2026 renewal, broker in market seeking terms
    'insr_004',
    'WIND-WC-MAJ-004',
    2026,
    45000000.0,
    'major',
    4800000000.0,
    'contractors_all_risk',
    '2026-12-31',
    'Alexander Forbes',
    'market_placement',
    datetime('now', '+55 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    '2026 market placement under way. Alexander Forbes has submitted contractors all-risk renewal to seven international insurers for the 300 MW offshore-transition wind project valued at R4.8B. Placement complexity driven by: offshore turbine foundation works still in progress (CAR cover required through COD plus 24-month defects liability period), storm surge sub-limit negotiation, and SA market capacity constraints above R2B per risk. Lead insurer Hannover Re has requested additional geotechnical survey reports before quoting. Indicative terms expected by 2026-06-20.',
    '2026-05-01T08:00:00Z',
    '2026-06-05T09:00:00Z'
  ),
  (
    -- terms_received: flagship 600 MW solar — 2026 renewal, insurer terms received, under comparison
    'insr_005',
    'SOLAR-NC-FLG-005',
    2026,
    120000000.0,
    'flagship',
    12000000000.0,
    'comprehensive_package',
    '2026-09-30',
    'Howden Africa',
    'terms_received',
    datetime('now', '+45 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    '2026 renewal terms received by Howden Africa from lead insurer consortium (Allianz, Munich Re, Swiss Re) for 600 MW flagship solar project. Comprehensive package premium indication R120M against current expiring R108M — 11.1% increase driven by global energy-sector catastrophe loss loading. Howden preparing terms comparison matrix across three competing indicative slips. Key variables: PV panel warranty exclusion clause wording, SASRIA political risk sublimit (R500M vs R1B requested), and named-storm deductible R25M vs R15M preferred. Comparison report due to IPP and DFI lender group within 5 business days.',
    '2026-05-01T08:00:00Z',
    '2026-06-03T14:00:00Z'
  ),
  (
    -- ipp_lender_review: small 22 MW community solar — 2025 renewal, IPP and lenders reviewing insurer terms
    'insr_006',
    'SOLAR-COM-FS-006',
    2025,
    1480000.0,
    'small',
    265000000.0,
    'third_party_liability',
    '2025-10-31',
    'Aon South Africa',
    'ipp_lender_review',
    datetime('now', '+35 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2025 IPP and lender review of renewal terms in progress. Aon South Africa circulated third-party liability renewal slip (R300M limit, R1.5M deductible) to IPP board and SBSA project finance team on 2026-05-25. Lender insurance consultant raised one query: public liability extension for community engagement events not included in current slip wording. Aon seeking endorsement from underwriter. SBSA response window closes 2026-06-10.',
    '2025-07-15T08:00:00Z',
    '2026-05-25T10:00:00Z'
  ),
  (
    -- documentation_preparation: medium 80 MW wind — 2025 renewal, policy documents being prepared
    'insr_007',
    'WIND-KZN-MED-007',
    2025,
    4800000.0,
    'medium',
    980000000.0,
    'environmental_impairment',
    '2025-11-30',
    'Marsh McLennan',
    'documentation_preparation',
    datetime('now', '+25 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    '2025 documentation preparation phase. Marsh McLennan compiling environmental impairment liability policy schedule, endorsements, and appendices for 80 MW KwaZulu-Natal wind farm following terms agreement. Key documentation items: DFFE-approved environmental impact assessment reference incorporated into policy, noise and shadow-flicker exclusion carve-back endorsement, gradual pollution coverage sub-limit R25M with 72-hour discovery clause, and avifauna impact mitigation protocol annexure. Policy wording to be signed off by Howden legal and lender insurance counsel before submission.',
    '2025-08-01T08:00:00Z',
    '2026-05-18T11:00:00Z'
  ),
  (
    -- documents_submitted: large 160 MW solar — 2025 renewal, signed policy documents submitted to lender
    'insr_008',
    'SOLAR-LIM-LRG-008',
    2025,
    17500000.0,
    'large',
    2050000000.0,
    'directors_officers',
    '2025-12-31',
    'Willis Towers Watson',
    'documents_submitted',
    datetime('now', '+18 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    '2025 policy documents submitted to lender agent (DBSA) on 2026-05-28. Willis Towers Watson submitted directors and officers renewal policy schedule (R150M limit, Side A + B + C cover, FSCA regulatory investigation extension included) together with premium payment confirmation for first instalment R8.75M. DBSA document reference DBSA-INS-2025-LIM-LRG-008. Policy effective date confirmed 2025-12-31 noon South African Standard Time. Lender confirmation of adequacy outstanding.',
    '2025-09-01T08:00:00Z',
    '2026-05-28T14:00:00Z'
  ),
  (
    -- lender_confirmation_requested: major 280 MW wind — 2025 renewal, lender confirmation of adequacy requested
    'insr_009',
    'WIND-EC-MAJ-009',
    2025,
    43000000.0,
    'major',
    4600000000.0,
    'operational_all_risk',
    '2025-12-31',
    'Alexander Forbes',
    'lender_confirmation_requested',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    '2025 lender confirmation of insurance adequacy requested. Alexander Forbes submitted 280 MW Eastern Cape wind farm operational all-risk renewal package to lender agent (IDC + Nedbank project finance consortium) on 2026-05-30. Confirmation request letter issued per loan agreement clause 19.3(b) requiring lender written confirmation within 10 business days of receiving complete insurance documentation. Package includes: policy schedule, certificate of currency, premium receipt, and broker''s letter of undertaking to notify lender 30 days before any cancellation or material change. Lender response deadline 2026-06-13.',
    '2025-08-15T08:00:00Z',
    '2026-05-30T09:00:00Z'
  ),
  (
    -- confirmed_adequate: major 310 MW solar — 2024 renewal, lender confirmed coverage adequate; is_reportable=1
    'insr_010',
    'SOLAR-GAU-MAJ-010',
    2024,
    47000000.0,
    'major',
    5100000000.0,
    'comprehensive_package',
    '2024-12-31',
    'Howden Africa',
    'confirmed_adequate',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'Lender insurance consultant confirmed all coverage lines meet or exceed REIPPPP lender insurance schedule requirements for major-tier project. Operational all-risk, business interruption, third-party liability, D&O, and environmental lines all compliant. Next renewal cycle opens 2025-09-01.',
    '2024 comprehensive insurance package confirmed adequate by lender agent (DBSA + IFC + DEG consortium) on 2024-12-15. Howden Africa placed R5.1B comprehensive package with Allianz lead and Munich Re co-insurer. Premium R47M paid in two instalments. All lender schedule requirements met: operational all-risk replacement value confirmed by independent QS, business interruption 24-month indemnity period, and SASRIA political risk extension included. is_reportable=1 (major tier; lender adequacy confirmation triggers REIPPPP reporting obligation to DMRE). Next renewal instruction date 2025-09-01.',
    '2024-06-01T08:00:00Z',
    '2024-12-15T16:00:00Z'
  ),
  (
    -- confirmed_inadequate: small 18 MW solar — 2025 renewal, coverage inadequate; sla_breached=1, is_reportable=1
    'insr_011',
    'SOLAR-NW-SML-011',
    2025,
    1350000.0,
    'small',
    245000000.0,
    'operational_all_risk',
    '2025-09-30',
    'Aon South Africa',
    'confirmed_inadequate',
    datetime('now', '-5 days'),
    1,
    1,
    'p_ipp_dev_003',
    'Coverage confirmed inadequate: operational all-risk sum insured R245M is 12% below current replacement cost of R278M as assessed by independent QS. Insurer declining to increase limit without reinstatement of gap. SLA breached. IPP directed to place top-up cover or increase sum insured within 14 days or face loan covenant event of default.',
    '2025 Aon South Africa insurance confirmation returned inadequate by SBSA lender insurance consultant on 2026-05-30. Independent QS reinstatement cost assessment R278M (commissioned under loan agreement clause 19.4) exceeds current operational all-risk sum insured R245M by R33M (12% underinsurance). Insurer (Zurich) declining to uplift sum insured mid-term without endorsement premium. SLA breached by 5 days. IPP issued 14-day cure notice by SBSA. is_reportable=1 (lender inadequacy determination on REIPPPP project reportable to DMRE). Escalation to loan covenant breach watch-list initiated.',
    '2025-06-01T08:00:00Z',
    '2026-05-30T11:30:00Z'
  ),
  (
    -- coverage_lapsed: medium 70 MW wind — 2024 renewal, policy lapsed; sla_breached=1, is_reportable=1
    'insr_012',
    'WIND-MPU-MED-012',
    2024,
    3900000.0,
    'medium',
    860000000.0,
    'business_interruption',
    '2024-08-31',
    'Marsh McLennan',
    'coverage_lapsed',
    datetime('now', '-20 days'),
    1,
    1,
    'p_ipp_dev_001',
    'Business interruption policy lapsed on 2024-08-31 due to non-payment of renewal premium. IPP failed to complete renewal placement before expiry date. Lender event of default triggered under loan agreement clause 20.1(f). Emergency cover placement instructed at distressed premium.',
    '2024 Marsh McLennan renewal process failed to complete before policy expiry (2024-08-31). Root cause: IPP board approval for premium payment delayed due to CFO transition; renewal instruction not issued to broker until T-14 days. Business interruption cover for 70 MW Mpumalanga wind farm lapsed at midnight 2024-08-31. Emergency open-market placement instructed 2024-09-01 at distressed premium R4.9M (25.6% above budgeted renewal R3.9M). Lender agent (Investec) declared event of default under clause 20.1(f) on 2024-09-02. DMRE, NERSA, and REIPPPP programme office notified per is_reportable obligation. SLA breached by 20 days. Emergency placement completed 2024-09-05; default cure period running.',
    '2024-06-01T08:00:00Z',
    '2024-09-05T08:00:00Z'
  );
