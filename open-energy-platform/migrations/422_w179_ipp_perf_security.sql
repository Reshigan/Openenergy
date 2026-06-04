-- W179: IPP Performance Security & Bond Lifecycle
-- REIPPPP / DMRE performance bond and advance payment guarantee management cycle:
-- security_required → bond_application_submitted → bank_assessment → terms_issued →
-- ipp_review → terms_accepted → bond_documentation → bond_issued →
-- dmre_notification_sent → security_confirmed / security_rejected / security_lapsed.
--
-- 18 columns (id + 17 data columns):
--   id, project_ref, bond_reference, bond_quantum_zar, bond_tier,
--   security_type, expiry_date, issuing_bank, beneficiary, chain_status,
--   sla_due_date, sla_breached, is_reportable,
--   actor_party, reason, notes,
--   created_at, updated_at

CREATE TABLE IF NOT EXISTS oe_ipp_perf_securities (
  id                          TEXT    PRIMARY KEY,
  project_ref                 TEXT    NOT NULL,
  bond_reference              TEXT,
  bond_quantum_zar            REAL    NOT NULL,
  bond_tier                   TEXT    NOT NULL
                                      CHECK(bond_tier IN (
                                        'micro','small','medium','large','major'
                                      )),
  security_type               TEXT    NOT NULL DEFAULT 'performance_bond'
                                      CHECK(security_type IN (
                                        'performance_bond',
                                        'advance_payment_guarantee',
                                        'retention_guarantee',
                                        'parent_company_guarantee',
                                        'irrevocable_lc',
                                        'comprehensive_package'
                                      )),
  expiry_date                 TEXT,
  issuing_bank                TEXT,
  beneficiary                 TEXT,
  chain_status                TEXT    NOT NULL DEFAULT 'security_required'
                                      CHECK(chain_status IN (
                                        'security_required',
                                        'bond_application_submitted',
                                        'bank_assessment',
                                        'terms_issued',
                                        'ipp_review',
                                        'terms_accepted',
                                        'bond_documentation',
                                        'bond_issued',
                                        'dmre_notification_sent',
                                        'security_confirmed',
                                        'security_rejected',
                                        'security_lapsed'
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

CREATE INDEX IF NOT EXISTS idx_ipp_psec_project
  ON oe_ipp_perf_securities(project_ref);

CREATE INDEX IF NOT EXISTS idx_ipp_psec_status
  ON oe_ipp_perf_securities(chain_status);

CREATE INDEX IF NOT EXISTS idx_ipp_psec_sla
  ON oe_ipp_perf_securities(sla_due_date)
  WHERE sla_breached = 0;

-- 12 seed rows, one per state.
-- Column order:
--  1:id  2:project_ref  3:bond_reference  4:bond_quantum_zar  5:bond_tier
--  6:security_type  7:expiry_date  8:issuing_bank  9:beneficiary  10:chain_status
--  11:sla_due_date  12:sla_breached  13:is_reportable
--  14:actor_party  15:reason  16:notes
--  17:created_at  18:updated_at

INSERT OR IGNORE INTO oe_ipp_perf_securities VALUES
  (
    -- security_required: micro sub-10MW rooftop solar — DMRE has issued conditional registration, performance bond not yet in place
    'psec_001',
    'SOLAR-COM-NW-001',
    NULL,
    2800000.0,
    'micro',
    'performance_bond',
    NULL,
    NULL,
    'DMRE IPP Office',
    'security_required',
    datetime('now', '+30 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'DMRE IPP Office issued conditional Schedule 2 registration for 8.5 MW rooftop solar aggregation project (North West) on 2026-05-25. Performance bond requirement of R2.8M (2% of estimated EPC contract value R140M) triggered as a condition of full registration. Bond must be issued in favour of DMRE IPP Office within 30 days. ABB subcontractor has been engaged as EPC counterparty. IPP instructed to approach approved surety division to initiate bond application. No bank reference allocated yet.',
    '2026-06-01T08:00:00Z',
    '2026-06-01T08:00:00Z'
  ),
  (
    -- bond_application_submitted: small 50MW wind — bond application lodged with WesBank Surety Division
    'psec_002',
    'WIND-EC-SML-002',
    NULL,
    8500000.0,
    'small',
    'advance_payment_guarantee',
    NULL,
    'WesBank Surety Division',
    'DMRE IPP Office',
    'bond_application_submitted',
    datetime('now', '+25 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Advance payment guarantee application submitted to WesBank Surety Division on 2026-05-28 for the 50 MW Eastern Cape wind project. The R8.5M APG (10% of advance payment R85M due to turbine OEM on contract signature) is required before the EPC contractor will release the mobilisation advance. Application package includes: audited financials FY2024/25, board resolution, REIPPPP preferred bidder letter, and EPC contract draft. WesBank Surety underwriting team acknowledged receipt 2026-05-29, reference application WSB-APG-2026-EC-002 pending. Expected initial response within 10 business days.',
    '2026-05-28T08:00:00Z',
    '2026-05-29T09:00:00Z'
  ),
  (
    -- bank_assessment: medium 120MW solar park — ABSA conducting financial assessment of IPP and EPC contractor
    'psec_003',
    'SOLAR-FS-MED-003',
    'ABSA-BOND-ASS-2026-FS-003',
    45000000.0,
    'medium',
    'retention_guarantee',
    NULL,
    'ABSA',
    'IDC / DBSA (co-lenders)',
    'bank_assessment',
    datetime('now', '+20 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'ABSA Corporate and Investment Banking conducting financial assessment for R45M retention guarantee on the 120 MW Free State solar park (REIPPPP Bid Window 6). Retention guarantee replaces 10% cash retention withheld by IPP from EPC milestone payments — IDC and DBSA as co-lenders require the guarantee in favour of themselves as security agent rather than cash holdback, which preserves EPC contractor liquidity. ABSA assessment team reviewing EPC contractor (Murray & Roberts Energy) balance sheet, bonding capacity utilisation, and project completion risk. ABSA reference ABSA-BOND-ASS-2026-FS-003. Terms expected within 15 business days of assessment start date 2026-05-20.',
    '2026-05-20T08:00:00Z',
    '2026-06-01T10:00:00Z'
  ),
  (
    -- terms_issued: large 250MW wind farm — Investec issued bond terms; IPP reviewing commercial terms
    'psec_004',
    'WIND-WC-LRG-004',
    'INV-PCG-TERMS-2026-WC-004',
    180000000.0,
    'large',
    'parent_company_guarantee',
    NULL,
    'Investec',
    'Standard Bank (as Security Agent)',
    'terms_issued',
    datetime('now', '+15 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Investec Corporate Finance issued indicative terms for R180M parent company guarantee on 2026-05-30 for the 250 MW Western Cape wind farm. PCG is provided by the Murray & Roberts group holding company in favour of Standard Bank as security agent, covering EPC contractor performance obligations through COD plus 24-month defects liability period. Indicative terms: guarantee fee 1.35% per annum (R2.43M/yr), counter-indemnity from Murray & Roberts parent secured on group assets, and step-in rights provision allowing Standard Bank to appoint replacement EPC contractor if Murray & Roberts defaults. IPP and Standard Bank security agent reviewing Investec draft guarantee wording. Legal counsel (Cliffe Dekker Hofmeyr) instructed to review. Response deadline 2026-06-14.',
    '2026-05-30T08:00:00Z',
    '2026-05-30T15:00:00Z'
  ),
  (
    -- ipp_review: major 500MW solar — Standard Bank issued irrevocable LC terms; IPP board review in progress
    'psec_005',
    'SOLAR-NC-MAJ-005',
    'SB-ILC-DRAFT-2026-NC-005',
    620000000.0,
    'major',
    'irrevocable_lc',
    NULL,
    'Standard Bank',
    'DMRE IPP Office',
    'ipp_review',
    datetime('now', '+12 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'Standard Bank Corporate and Investment Banking issued draft irrevocable standby letter of credit terms (R620M) on 2026-05-28 for the 500 MW Northern Cape solar project (REIPPPP BW6, preferred bidder 2024). IPP board reviewing draft LC wording including: drawing conditions (DMRE written demand sufficient vs Independent Engineer certification required), validity period (36 months vs DMRE requirement of COD plus 12 months, estimated 48 months total), partial drawing rights, and automatic extension clause 30 days before expiry. Standard Bank fee: LC issuance fee 0.85% upfront R5.27M plus 0.65% annual maintenance fee. IPP legal team (Norton Rose Fulbright) engaged to review LC wording against REIPPPP Implementation Agreement schedule. Board resolution required before acceptance. Review period closes 2026-06-15.',
    '2026-05-28T08:00:00Z',
    '2026-06-01T09:00:00Z'
  ),
  (
    -- terms_accepted: small 45MW wind — IPP formally accepted WesBank Surety retention guarantee terms
    'psec_006',
    'WIND-KZN-SML-006',
    'WSB-RG-ACC-2026-KZN-006',
    9200000.0,
    'small',
    'retention_guarantee',
    NULL,
    'WesBank Surety Division',
    'Nedbank CIB',
    'terms_accepted',
    datetime('now', '+10 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'IPP formally accepted WesBank Surety Division terms for R9.2M retention guarantee on 2026-06-01 for the 45 MW KwaZulu-Natal wind project. Terms accepted: guarantee fee 1.55% per annum (R142k/yr), validity through COD (estimated 2027-03-31) plus 12-month defects liability period, Nedbank CIB as beneficiary in its capacity as senior lender security agent. IPP signed term acceptance letter and paid commitment fee R23k on 2026-06-01. WesBank Surety proceeding to formal bond documentation phase. Counter-indemnity documents (IPP company bond, supporting director suretyships) being prepared by WesBank legal team. Documentation expected within 10 business days.',
    '2026-06-01T08:00:00Z',
    '2026-06-01T14:00:00Z'
  ),
  (
    -- bond_documentation: medium 95MW solar — Nedbank preparing comprehensive package bond documentation
    'psec_007',
    'SOLAR-MPU-MED-007',
    'NED-COMP-DOC-2026-MPU-007',
    38000000.0,
    'medium',
    'comprehensive_package',
    NULL,
    'Nedbank',
    'IDC / DBSA (co-lenders)',
    'bond_documentation',
    datetime('now', '+7 days'),
    0,
    0,
    'p_ipp_dev_002',
    NULL,
    'Nedbank Corporate and Investment Banking preparing comprehensive security package documentation for the 95 MW Mpumalanga solar project. Package comprises: (1) R20M performance bond (EPC contractor default), (2) R12M advance payment guarantee (turbine/module OEM advance 2026-08-01), (3) R6M retention guarantee replacing 10% cash retention. Total security package R38M. Nedbank documentary requirements: IPP board-certified constitutional documents, consolidated EPC contract signed copy, REIPPPP Implementation Agreement executed copy, Independent Engineer appointment letter, and co-lender facility agreement schedule. IDC and DBSA legal teams reviewing Nedbank standard-form security deed. Execution meeting scheduled 2026-06-10.',
    '2026-05-25T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- bond_issued: large 200MW wind farm — FirstRand issued R145M parent company guarantee; awaiting DMRE notification
    'psec_008',
    'WIND-LIM-LRG-008',
    'FRB-PCG-2026-LIM-A45821',
    145000000.0,
    'large',
    'parent_company_guarantee',
    '2029-06-30',
    'FirstRand Bank',
    'Standard Bank (as Security Agent)',
    'bond_issued',
    datetime('now', '+5 days'),
    0,
    0,
    'p_ipp_dev_003',
    NULL,
    'FirstRand Bank issued R145M parent company guarantee (reference FRB-PCG-2026-LIM-A45821) on 2026-05-30 for the 200 MW Limpopo wind farm. PCG issued by Siemens Energy Africa (Pty) Ltd parent holding company Siemens Energy AG (Munich) as EPC contractor performance security, beneficiary Standard Bank as security agent for the senior lender group. Validity: 2026-06-01 to 2029-06-30 (COD estimate 2028-02-28 plus 16-month defects liability buffer). PCG signed by Siemens Energy AG authorised signatories, bank-certified and apostilled in Germany, delivered to FirstRand as presenting bank. DMRE IPP Office notification package being assembled — must be submitted within 5 business days of bond issuance per Implementation Agreement clause 12.4.',
    '2026-05-30T08:00:00Z',
    '2026-05-30T16:30:00Z'
  ),
  (
    -- dmre_notification_sent: micro 7MW community solar — DMRE notified of performance bond issuance; awaiting confirmation
    'psec_009',
    'SOLAR-COM-EC-009',
    'ABSA-PB-2026-EC-B00312',
    1950000.0,
    'micro',
    'performance_bond',
    '2028-03-31',
    'ABSA',
    'DMRE IPP Office',
    'dmre_notification_sent',
    datetime('now', '+3 days'),
    0,
    0,
    'p_ipp_dev_001',
    NULL,
    'DMRE IPP Office notified of ABSA performance bond issuance on 2026-06-02 for the 7 MW Eastern Cape community solar project (Schedule 2 registration). Notification package submitted: ABSA bond certificate reference ABSA-PB-2026-EC-B00312 (R1.95M, valid through 2028-03-31), certified copy of EPC contract (Siemens subcontractor), REIPPPP Schedule 2 registration certificate, and IPP covering letter per Implementation Agreement pro-forma. DMRE IPP Office acknowledgement reference DMRE-BOND-2026-EC-009 received by email 2026-06-02. DMRE standard response window 5 business days. Formal security confirmation expected by 2026-06-09. is_reportable=0 (micro tier; below DMRE mandatory escalation threshold).',
    '2026-06-01T08:00:00Z',
    '2026-06-02T11:00:00Z'
  ),
  (
    -- security_confirmed: large 240MW wind — Standard Bank LC confirmed; security confirmed by DMRE; is_reportable=1
    'psec_010',
    'WIND-WC-LRG-010',
    'SB-ILC-2025-WC-X77234',
    195000000.0,
    'large',
    'irrevocable_lc',
    '2029-09-30',
    'Standard Bank',
    'DMRE IPP Office',
    'security_confirmed',
    datetime('now', '+365 days'),
    0,
    1,
    'p_ipp_dev_002',
    'DMRE IPP Office confirmed security package fully compliant with Implementation Agreement Schedule 5 requirements. Irrevocable LC R195M meets quantum, validity period, drawing conditions, and extension clause requirements. Security confirmation letter issued DMRE-CONF-2025-WC-010. Lender group notified. Project proceeds to financial close.',
    'DMRE IPP Office issued formal security confirmation letter (DMRE-CONF-2025-WC-010) on 2025-11-20 for the 240 MW Western Cape wind farm. Standard Bank irrevocable standby LC (reference SB-ILC-2025-WC-X77234, R195M, valid 2025-11-01 to 2029-09-30) confirmed fully compliant: quantum equals 5% of R3.9B EPC contract value, validity covers estimated COD 2028-05-31 plus 16-month defects liability period, DMRE demand drawing rights operative, automatic 30-day extension clause included. is_reportable=1 (large-tier project; DMRE security confirmation triggers mandatory REIPPPP programme office reporting and unlocks financial close condition precedent). Nedbank CIB and DBSA (co-lenders) notified of satisfaction of security condition precedent. Financial close meeting scheduled 2025-12-01.',
    '2025-09-01T08:00:00Z',
    '2025-11-20T14:00:00Z'
  ),
  (
    -- security_rejected: micro 6MW solar — ABSA bond rejected by DMRE; non-compliant wording; sla_breached=1, is_reportable=1
    'psec_011',
    'SOLAR-COM-NW-011',
    'ABSA-PB-2026-NW-B00198',
    1600000.0,
    'micro',
    'performance_bond',
    '2027-06-30',
    'ABSA',
    'DMRE IPP Office',
    'security_rejected',
    datetime('now', '-3 days'),
    1,
    1,
    'p_ipp_dev_003',
    'DMRE IPP Office rejected bond: (1) drawing conditions require Independent Engineer certification rather than IPP demand — non-compliant with Implementation Agreement Schedule 5 para 3.2 which requires unconditional on-demand bond; (2) validity period expires 2027-06-30 but estimated COD 2027-03-31 plus mandatory 12-month defects liability period requires validity through 2028-03-31 minimum — 9-month shortfall; (3) ABSA branch stamp not apostilled per DMRE international-standard requirement. IPP must resubmit compliant bond within 14 days or registration will be suspended.',
    'DMRE IPP Office rejected ABSA performance bond (reference ABSA-PB-2026-NW-B00198, R1.6M) for the 6 MW North West community solar project on 2026-06-01. Three non-compliance grounds cited: (1) conditional drawing clause — ABSA standard-form bond requires IE certification before DMRE may draw, contrary to required unconditional on-demand wording per Implementation Agreement Schedule 5 paragraph 3.2; (2) validity shortfall — bond valid through 2027-06-30 but minimum required validity is COD (estimated 2027-03-31) plus 12 months defects liability = 2028-03-31, a 9-month gap; (3) authentication formality — ABSA branch certification stamp requires notarial apostille per DMRE document authentication policy. SLA breach: IPP had 30 days from conditional registration (2026-05-02) to deliver compliant bond; deadline was 2026-06-01, rejected same day — SLA expired. is_reportable=1 (micro-tier security rejection still triggers DMRE register update and IPP cure clock). IPP instructed to re-approach ABSA for amended bond wording within 14 days or face Schedule 2 registration suspension.',
    '2026-05-02T08:00:00Z',
    '2026-06-01T15:30:00Z'
  ),
  (
    -- security_lapsed: small 35MW wind — Nedbank APG expired without renewal; lapsed; sla_breached=1, is_reportable=1
    'psec_012',
    'WIND-KZN-SML-012',
    'NED-APG-2024-KZN-N09841',
    7200000.0,
    'small',
    'advance_payment_guarantee',
    '2025-12-31',
    'Nedbank',
    'Nedbank CIB',
    'security_lapsed',
    datetime('now', '-15 days'),
    1,
    1,
    'p_ipp_dev_001',
    'Advance payment guarantee lapsed on 2025-12-31 without renewal or replacement. Construction programme extended by 4 months due to grid connection delay (W58 capacity queue backlog); IPP failed to instruct Nedbank to extend APG validity before expiry date. Nedbank CIB (as lender security agent and beneficiary) declared a technical event of default under loan agreement clause 20.1(g) on 2026-01-05. DMRE IPP Office notified. Emergency replacement APG placement instructed at higher fee rate.',
    'Nedbank advance payment guarantee (reference NED-APG-2024-KZN-N09841, R7.2M, valid through 2025-12-31) lapsed without renewal for the 35 MW KwaZulu-Natal wind project. Root cause: construction programme extended by 4 months following NTCSA grid connection queue delay (estimated COD moved from 2026-02-28 to 2026-06-30); IPP treasury team did not update bond renewal calendar to reflect the revised programme. Nedbank standard-form APG did not include automatic extension clause. Bond expired midnight 2025-12-31 with no replacement in place. Nedbank CIB (security agent and beneficiary) discovered lapse during quarterly security register review on 2026-01-05 and declared technical event of default under loan agreement clause 20.1(g). DMRE IPP Office notified per Implementation Agreement clause 12.7 (lender event-of-default notification obligation). SLA breached by 15 days at discovery date. Emergency replacement APG placement instructed 2026-01-06 with Nedbank at amended fee rate 1.8% per annum vs original 1.35%. is_reportable=1 (REIPPPP small-tier security lapse reportable to DMRE programme office; triggers watch-list review).',
    '2025-06-01T08:00:00Z',
    '2026-01-06T09:00:00Z'
  );
