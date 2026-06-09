-- ═══════════════════════════════════════════════════════════════════════
-- 494_seed_personas_and_contracts.sql
-- Demo seed: ESCO/EPC personas + contract templates + signed envelopes + PPAs
-- Safe to re-run (INSERT OR IGNORE throughout)
-- ═══════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
-- 494_seed_personas_and_contracts.sql
--
-- 1. Extend participants role CHECK to include 'esco' and 'epc_contractor'
--    (SQLite table-rebuild pattern — same as migration 012)
-- 2. Seed demo_esco_001 and demo_epc_001 participants
-- 3. Seed 12 oe_document_templates (PPA, ISDA, Service Agreement, EPC, GCA,
--    O&M, Wheeling, Loan, Carbon ERPA, Ancillary Service, Insurance, Carbon PPA)
-- 4. Seed 6 oe_document_envelopes (status = 'completed' / fully signed)
-- 5. Seed 2 oe_signatures per envelope (12 total)
-- 6. Seed 3 oe_ppa_contract_chain rows (in_force, executing, negotiation)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Extend participants role CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS participants_new (
  id                       TEXT PRIMARY KEY,
  email                    TEXT UNIQUE NOT NULL,
  password_hash            TEXT NOT NULL,
  name                     TEXT NOT NULL,
  company_name             TEXT,
  role                     TEXT NOT NULL CHECK (role IN (
    'admin','ipp_developer','trader','carbon_fund','offtaker',
    'lender','grid_operator','regulator','support','esco','epc_contractor'
  )),
  status                   TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','rejected')),
  kyc_status               TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending','in_review','approved','rejected')),
  bbbee_level              INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
  subscription_tier        TEXT DEFAULT 'starter' CHECK (subscription_tier IN ('free','starter','professional','enterprise')),
  tenant_id                TEXT DEFAULT 'default',
  email_verified           INTEGER DEFAULT 0,
  otp_code                 TEXT,
  otp_expires_at           TEXT,
  last_login               TEXT,
  onboarding_completed     INTEGER DEFAULT 0,
  created_at               TEXT DEFAULT (datetime('now')),
  updated_at               TEXT DEFAULT (datetime('now')),
  -- columns added by later migrations (377, 378, 472) — preserved here
  phone                    TEXT,
  job_title                TEXT,
  org_website              TEXT,
  org_reg_num              TEXT,
  invited_by               TEXT,
  bio                      TEXT,
  avatar_r2                TEXT,
  onboarding_step          TEXT DEFAULT 'welcome',
  onboarding_data          TEXT DEFAULT '{}',
  onboarding_skipped       INTEGER DEFAULT 0,
  participant_market_access TEXT DEFAULT 'full_trading'
);

INSERT INTO participants_new (
  id, email, password_hash, name, company_name, role, status, kyc_status,
  bbbee_level, subscription_tier, tenant_id, email_verified, otp_code,
  otp_expires_at, last_login, onboarding_completed, created_at, updated_at,
  phone, job_title, org_website, org_reg_num, invited_by, bio, avatar_r2,
  onboarding_step, onboarding_data, onboarding_skipped, participant_market_access
)
SELECT
  id, email, password_hash, name, company_name, role, status, kyc_status,
  bbbee_level, subscription_tier, tenant_id, email_verified, otp_code,
  otp_expires_at, last_login, onboarding_completed, created_at, updated_at,
  phone, job_title, org_website, org_reg_num, invited_by, bio, avatar_r2,
  onboarding_step, onboarding_data, onboarding_skipped, participant_market_access
FROM participants;

DROP TABLE participants;
ALTER TABLE participants_new RENAME TO participants;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_participants_role   ON participants(role);
CREATE INDEX IF NOT EXISTS idx_participants_status ON participants(status);

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: New demo personas — esco and epc_contractor
-- ─────────────────────────────────────────────────────────────────────────────

INSERT OR IGNORE INTO participants (
  id, email, password_hash, name, company_name, role, status, kyc_status,
  bbbee_level, subscription_tier, tenant_id, email_verified, onboarding_completed
) VALUES (
  'demo_esco_001',
  'esco@openenergy.co.za',
  'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
  'Zanele Khumalo',
  'SunServ O&M (Pty) Ltd',
  'esco',
  'active',
  'approved',
  3,
  'professional',
  'default',
  1,
  1
);

INSERT OR IGNORE INTO participants (
  id, email, password_hash, name, company_name, role, status, kyc_status,
  bbbee_level, subscription_tier, tenant_id, email_verified, onboarding_completed
) VALUES (
  'demo_epc_001',
  'epc@openenergy.co.za',
  'pbkdf2$sha256$100000$b3BlbmVuZXJneS1kZW1vLXNhbHQ=$IOJml+OkT8C4tON6R1DA+HDLPXUGnOyqgPF6XBjyYkk=',
  'Andile Bhengu',
  'BuildSA Energy EPC (Pty) Ltd',
  'epc_contractor',
  'active',
  'approved',
  2,
  'professional',
  'default',
  1,
  1
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: oe_document_templates — 12 contract templates
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. ISDA Master Agreement
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_isda_2002_v1',
  'isda.2002.master.v1',
  'ISDA 2002 Master Agreement',
  'other',
  '# ISDA 2002 Master Agreement

**Party A:** {{party_a_name}} (LEI: {{party_a_lei}})
**Party B:** {{party_b_name}} (LEI: {{party_b_lei}})
**Governing Law:** Republic of South Africa (SARB D3/2023 — Uncleared Margin Rules)
**Base Currency:** ZAR
**Early Termination Date:** As per Section 6 of the 2002 ISDA Master Agreement

The Parties agree that transactions entered into from the date hereof shall be
governed by this Agreement, any Schedule hereto, and any Credit Support Annex
(VM CSA) attached as a Confirmation. FSCA FMA Act No. 19 of 2012 applies.',
  '[{"key":"party_a_name","desc":"Legal name of Party A"},{"key":"party_a_lei","desc":"LEI of Party A"},{"key":"party_b_name","desc":"Legal name of Party B"},{"key":"party_b_lei","desc":"LEI of Party B"}]',
  '[{"role":"trader","label":"Party A Authorised Signatory"},{"role":"trader","label":"Party B Authorised Signatory"}]',
  'ZA-FSCA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-60 days')
);

-- 2. Service Agreement
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_service_agreement_v1',
  'service.agreement.standard.v1',
  'Platform Service Agreement',
  'other',
  '# Platform Service Agreement

**Service Provider:** {{provider_name}}
**Client:** {{client_name}}
**Scope of Services:** {{services_description}}
**Monthly Fee:** R{{monthly_fee_zar}} (excl. VAT)
**Term:** {{term_months}} months from {{commencement_date}}
**Notice Period:** 30 calendar days

The Service Provider shall deliver the services described in Schedule A attached hereto.
All work product vests in the Client upon full settlement of fees. POPIA compliance
obligations apply to any personal information processed by either party.',
  '[{"key":"provider_name","desc":"Legal name of service provider"},{"key":"client_name","desc":"Legal name of client"},{"key":"services_description","desc":"Short description of services"},{"key":"monthly_fee_zar","desc":"Monthly fee in ZAR excl. VAT"},{"key":"term_months","desc":"Initial term in months"},{"key":"commencement_date","desc":"YYYY-MM-DD"}]',
  '[{"role":"any","label":"Service Provider"},{"role":"any","label":"Client"}]',
  'ZA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-90 days')
);

-- 3. EPC Contract
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_epc_contract_v1',
  'epc.contract.reipppp.v1',
  'EPC Contract — REIPPPP Standard Form',
  'epc',
  '# Engineering, Procurement and Construction Contract

**Employer:** {{employer_name}}
**EPC Contractor:** {{contractor_name}}
**Project:** {{project_name}} — {{capacity_mw}} MW {{technology}}
**Contract Price:** R{{contract_price_zar}} (fixed-price lump sum)
**Longstop COD:** {{longstop_date}}
**LD Rate:** R{{ld_daily_rate_zar}} per day of delay beyond Longstop COD (capped at {{ld_cap_pct}}% of Contract Price)
**Defects Liability Period:** 12 months from Practical Completion
**Performance Guarantee:** {{perf_guarantee_pct}}% of contracted generation P90

This contract is based on the FIDIC Silver Book (2017 edition) as adapted for
REIPPPP by the Department of Mineral Resources and Energy. SA Construction
Industry Development Board (CIDB) contractor grading 7CE or above required.',
  '[{"key":"employer_name","desc":"Legal name of the employer/developer"},{"key":"contractor_name","desc":"Legal name of EPC contractor"},{"key":"project_name","desc":"Project name"},{"key":"capacity_mw","desc":"Installed capacity MW"},{"key":"technology","desc":"e.g. Solar PV, Wind"},{"key":"contract_price_zar","desc":"Lump sum contract price ZAR"},{"key":"longstop_date","desc":"YYYY-MM-DD"},{"key":"ld_daily_rate_zar","desc":"Daily LD rate ZAR"},{"key":"ld_cap_pct","desc":"LD cap as % of contract price"},{"key":"perf_guarantee_pct","desc":"Performance guarantee threshold %"}]',
  '[{"role":"ipp_developer","label":"Employer"},{"role":"epc_contractor","label":"EPC Contractor"}]',
  'ZA-NERSA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-120 days')
);

-- 4. Grid Connection Agreement
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_gca_v1',
  'gca.nersa.grid_code.v1',
  'Grid Connection Agreement — NERSA Grid Code Form',
  'other',
  '# Grid Connection Agreement

**Connecting Party:** {{connecting_party_name}}
**Network Operator:** {{network_operator_name}} (NERSA Licence: {{nersa_licence_ref}})
**Connection Point:** {{connection_point_name}} ({{voltage_kv}} kV)
**Contracted Capacity:** {{capacity_mw}} MW
**Connection Fee:** R{{connection_fee_zar}} (once-off)
**Annual Use-of-System Charge:** R{{annual_uos_zar}} per MW of contracted capacity
**Effective Date:** {{effective_date}}

This agreement is governed by the NERSA Grid Code (2014 as amended to 2024),
NRS 097 Connection Requirements, and the Electricity Regulation Act 4 of 2006.
The Connecting Party shall maintain LVRT/HVRT capability per Grid Code Clause C-6.',
  '[{"key":"connecting_party_name","desc":"Generator/IPP name"},{"key":"network_operator_name","desc":"Grid operator name"},{"key":"nersa_licence_ref","desc":"Network operator NERSA licence ref"},{"key":"connection_point_name","desc":"Substation / connection point name"},{"key":"voltage_kv","desc":"Connection voltage kV"},{"key":"capacity_mw","desc":"Contracted capacity MW"},{"key":"connection_fee_zar","desc":"Once-off connection fee ZAR"},{"key":"annual_uos_zar","desc":"Annual use-of-system charge ZAR per MW"},{"key":"effective_date","desc":"YYYY-MM-DD"}]',
  '[{"role":"ipp_developer","label":"Connecting Party"},{"role":"grid_operator","label":"Network Operator"}]',
  'ZA-NERSA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-150 days')
);

-- 5. O&M Agreement
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_om_agreement_v1',
  'om.agreement.standard.v1',
  'O&M Services Agreement — Renewable Energy Asset',
  'other',
  '# Operations and Maintenance Services Agreement

**Asset Owner:** {{owner_name}}
**O&M Contractor:** {{contractor_name}}
**Asset:** {{asset_name}} ({{capacity_mw}} MW, COD: {{cod_date}})
**Annual O&M Fee:** R{{annual_fee_zar}} (indexed to CPI annually)
**Availability Guarantee:** {{availability_pct}}% annual average uptime
**LD for Under-Availability:** R{{ld_per_mwh_zar}} per MWh of shortfall
**Term:** {{term_years}} years from Commencement Date

The O&M Contractor shall operate and maintain the asset per IEC 61724-1 (Solar)
or IEC 61400-26 (Wind) performance standards. Preventive maintenance schedules
shall comply with OEM requirements. The Contractor carries full public liability
insurance per OHSA Act 85 of 1993.',
  '[{"key":"owner_name","desc":"Asset owner/IPP name"},{"key":"contractor_name","desc":"O&M contractor name"},{"key":"asset_name","desc":"Asset/plant name"},{"key":"capacity_mw","desc":"Installed capacity MW"},{"key":"cod_date","desc":"Commercial operation date YYYY-MM-DD"},{"key":"annual_fee_zar","desc":"Annual O&M fee ZAR"},{"key":"availability_pct","desc":"Guaranteed availability % e.g. 97"},{"key":"ld_per_mwh_zar","desc":"LD rate per MWh of shortfall"},{"key":"term_years","desc":"Contract term in years"}]',
  '[{"role":"ipp_developer","label":"Asset Owner"},{"role":"esco","label":"O&M Contractor"}]',
  'ZA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-100 days')
);

-- 6. Wheeling Agreement
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_wheeling_agreement_v1',
  'wheeling.agreement.nersa.v1',
  'Wheeling Agreement — Third-Party Access',
  'other',
  '# Energy Wheeling Agreement

**Wheeling Party (Generator):** {{generator_name}}
**Wheeling Party (Offtaker):** {{offtaker_name}}
**Network Operator:** {{network_operator_name}}
**Wheeled Capacity:** {{wheeled_capacity_mw}} MW (maximum)
**Wheeling Tariff:** R{{wheeling_tariff_zar_mwh}}/MWh
**Connection Points:** {{injection_point}} (injection) → {{offtake_point}} (offtake)
**Energy Loss Factor:** {{loss_factor_pct}}%
**Term:** {{term_years}} years

Third-party access is provided pursuant to the Electricity Regulation Act 4 of 2006
Section 22 and NERSA Grid Code Part C (Third-Party Access). The Network Operator
provides no warranty as to available capacity beyond the Contracted Wheeled Capacity.',
  '[{"key":"generator_name","desc":"Generator/IPP name"},{"key":"offtaker_name","desc":"Offtaker name"},{"key":"network_operator_name","desc":"Network operator name"},{"key":"wheeled_capacity_mw","desc":"Maximum wheeling capacity MW"},{"key":"wheeling_tariff_zar_mwh","desc":"Wheeling tariff R/MWh"},{"key":"injection_point","desc":"Grid injection point name"},{"key":"offtake_point","desc":"Grid offtake point name"},{"key":"loss_factor_pct","desc":"Technical energy loss factor %"},{"key":"term_years","desc":"Agreement term years"}]',
  '[{"role":"ipp_developer","label":"Generator"},{"role":"offtaker","label":"Offtaker"},{"role":"grid_operator","label":"Network Operator"}]',
  'ZA-NERSA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-80 days')
);

-- 7. Loan Agreement
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_loan_agreement_v1',
  'loan.agreement.project_finance.v1',
  'Project Finance Loan Agreement',
  'other',
  '# Project Finance Loan Agreement

**Borrower:** {{borrower_name}}
**Lender / Facility Agent:** {{lender_name}}
**Facility Amount:** R{{facility_amount_zar}}
**Facility Type:** {{facility_type}} (e.g. Senior Secured Term Loan)
**Interest Rate:** JIBAR + {{margin_bps}} bps p.a., reset quarterly
**Tenor:** {{tenor_years}} years from first drawdown
**Repayment:** Semi-annual principal repayment commencing 6 months post-COD
**Security:** First-ranking cession and pledge over all project assets, PPA revenues,
insurance proceeds, and offshore reserve accounts

Governed by the Laws of South Africa. SARB Large Exposures framework (BA 600)
applies. Equator Principles (EP4) apply to category A and B projects.',
  '[{"key":"borrower_name","desc":"SPV/project company name"},{"key":"lender_name","desc":"Lender or facility agent name"},{"key":"facility_amount_zar","desc":"Total facility ZAR"},{"key":"facility_type","desc":"Facility type e.g. Senior Secured Term Loan"},{"key":"margin_bps","desc":"Margin above JIBAR in basis points"},{"key":"tenor_years","desc":"Loan tenor years"}]',
  '[{"role":"ipp_developer","label":"Borrower"},{"role":"lender","label":"Lender / Facility Agent"}]',
  'ZA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-110 days')
);

-- 8. Carbon ERPA
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_carbon_erpa_v1',
  'carbon.erpa.unfccc.v1',
  'Carbon Emission Reduction Purchase Agreement (ERPA)',
  'other',
  '# Emission Reduction Purchase Agreement

**Seller (Project Developer):** {{seller_name}}
**Buyer (Carbon Fund):** {{buyer_name}}
**Carbon Standard:** {{carbon_standard}} (e.g. Gold Standard, Verra VCS, Article 6.4)
**Project:** {{project_name}} (ID: {{project_id}})
**Credit Volume:** {{volume_tco2e}} tCO2e per annum (indicative)
**Delivery Price:** USD {{price_usd_per_tco2e}}/tCO2e (vintage {{vintage_year}})
**Delivery Period:** {{delivery_start_date}} to {{delivery_end_date}}
**Make-Good Obligation:** Buffer pool contribution per registry rules

Corresponding adjustments per Paris Agreement Article 6.2 apply where credits are
cross-border. SARS Carbon Tax Act 15 of 2019 offset eligibility confirmed by DFFE
DNA Letter of Authorisation.',
  '[{"key":"seller_name","desc":"Project developer/seller name"},{"key":"buyer_name","desc":"Carbon fund/buyer name"},{"key":"carbon_standard","desc":"e.g. Gold Standard, Verra VCS"},{"key":"project_name","desc":"Project name"},{"key":"project_id","desc":"Registry project ID"},{"key":"volume_tco2e","desc":"Annual credit volume tCO2e"},{"key":"price_usd_per_tco2e","desc":"Price USD per tCO2e"},{"key":"vintage_year","desc":"Credit vintage year"},{"key":"delivery_start_date","desc":"YYYY-MM-DD"},{"key":"delivery_end_date","desc":"YYYY-MM-DD"}]',
  '[{"role":"ipp_developer","label":"Seller"},{"role":"carbon_fund","label":"Buyer"}]',
  'ZA-DFFE',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-70 days')
);

-- 9. Ancillary Service Contract
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_ancillary_service_v1',
  'ancillary.service.ntcsa.v1',
  'Ancillary Services Agreement — Grid Reserve',
  'other',
  '# Ancillary Services Agreement

**Service Provider:** {{provider_name}}
**System Operator:** {{so_name}} (NTCSA)
**Service Type:** {{service_type}} (e.g. Frequency Regulation, Spinning Reserve, Voltage Support)
**Contracted Capacity:** {{contracted_mw}} MW
**Availability Fee:** R{{availability_fee_zar_mwh}}/MWh-h (capacity payment)
**Activation Energy Fee:** R{{activation_fee_zar_mwh}}/MWh (energy dispatched on activation)
**Response Time:** {{response_time_secs}} seconds from activation instruction
**Term:** {{term_months}} months from Commencement Date

Governed by the NERSA Grid Code Chapter 8 (Ancillary Services) and NTCSA
Balancing Mechanism Rules 2023. Under-performance penalties apply per Grid Code
Schedule 10.',
  '[{"key":"provider_name","desc":"Service provider/IPP name"},{"key":"so_name","desc":"System operator name"},{"key":"service_type","desc":"Ancillary service type"},{"key":"contracted_mw","desc":"Contracted capacity MW"},{"key":"availability_fee_zar_mwh","desc":"Availability fee R/MWh-h"},{"key":"activation_fee_zar_mwh","desc":"Activation energy fee R/MWh"},{"key":"response_time_secs","desc":"Required response time seconds"},{"key":"term_months","desc":"Agreement term months"}]',
  '[{"role":"ipp_developer","label":"Service Provider"},{"role":"grid_operator","label":"System Operator"}]',
  'ZA-NERSA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-55 days')
);

-- 10. Insurance Policy Schedule of Cover
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_insurance_policy_v1',
  'insurance.policy.project.v1',
  'Project Insurance — Schedule of Cover',
  'other',
  '# Project Insurance Schedule of Cover

**Insured:** {{insured_name}}
**Insurer:** {{insurer_name}} (FSP No. {{fsp_number}})
**Policy Reference:** {{policy_ref}}
**Asset:** {{asset_name}} ({{capacity_mw}} MW)
**Cover Types:**
- Construction All Risks (CAR): R{{car_sum_insured_zar}} sum insured
- Operational All Risks (OAR): R{{oar_sum_insured_zar}} sum insured
- Third-Party Liability: R{{tpl_limit_zar}} per event
- Business Interruption (BI): R{{bi_sum_insured_zar}} ({{bi_indemnity_months}} months)
- Loss of Revenue: Triggered at >72-hour outage
**Annual Premium:** R{{annual_premium_zar}}
**Policy Period:** {{policy_start_date}} to {{policy_end_date}}

FSCA FAIS Act 37 of 2002 applies. Governed by South African Insurance Act 18 of 2017.',
  '[{"key":"insured_name","desc":"Policyholder name"},{"key":"insurer_name","desc":"Insurer name"},{"key":"fsp_number","desc":"FSCA FSP licence number"},{"key":"policy_ref","desc":"Policy reference number"},{"key":"asset_name","desc":"Asset/project name"},{"key":"capacity_mw","desc":"Installed capacity MW"},{"key":"car_sum_insured_zar","desc":"CAR sum insured ZAR"},{"key":"oar_sum_insured_zar","desc":"OAR sum insured ZAR"},{"key":"tpl_limit_zar","desc":"TPL limit per event ZAR"},{"key":"bi_sum_insured_zar","desc":"BI sum insured ZAR"},{"key":"bi_indemnity_months","desc":"BI indemnity period months"},{"key":"annual_premium_zar","desc":"Annual premium ZAR"},{"key":"policy_start_date","desc":"YYYY-MM-DD"},{"key":"policy_end_date","desc":"YYYY-MM-DD"}]',
  '[{"role":"ipp_developer","label":"Insured"},{"role":"admin","label":"Insurer Representative"}]',
  'ZA-FSCA',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-45 days')
);

-- 11. Carbon PPA (bundled credits)
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_carbon_ppa_v1',
  'ppa.carbon_bundled.v1',
  'Green PPA with Bundled Carbon Credits',
  'ppa',
  '# Green Power Purchase Agreement (Bundled Carbon)

**Generator:** {{generator_name}}
**Offtaker:** {{offtaker_name}}
**Contracted Capacity:** {{capacity_mw}} MW
**Energy Tariff:** R{{energy_tariff_zar_mwh}}/MWh
**Bundled Credits:** {{credits_per_mwh}} I-REC/tCO2e per MWh generated
**Credit Standard:** {{credit_standard}} (I-REC / SAREC / Gold Standard)
**Credit Price:** USD {{credit_price_usd}} per credit (floors at USD {{credit_floor_usd}})
**Term:** {{term_years}} years from COD
**Take-or-Pay:** {{top_pct}}% of contracted generation

The Offtaker acquires full title to bundled I-RECs / carbon credits upon generation.
Credits are retired in the Offtaker name for Scope 2 market-based accounting
per GHG Protocol. DFFE DNA authorisation attached as Schedule B.',
  '[{"key":"generator_name","desc":"Generator/IPP name"},{"key":"offtaker_name","desc":"Offtaker name"},{"key":"capacity_mw","desc":"Contracted capacity MW"},{"key":"energy_tariff_zar_mwh","desc":"Energy tariff R/MWh"},{"key":"credits_per_mwh","desc":"Credits per MWh e.g. 1"},{"key":"credit_standard","desc":"Credit standard e.g. I-REC, Gold Standard"},{"key":"credit_price_usd","desc":"Credit price USD"},{"key":"credit_floor_usd","desc":"Price floor USD"},{"key":"term_years","desc":"Contract term years"},{"key":"top_pct","desc":"Take-or-pay %"}]',
  '[{"role":"ipp_developer","label":"Generator"},{"role":"offtaker","label":"Offtaker"},{"role":"carbon_fund","label":"Registry Custodian"}]',
  'ZA-DFFE',
  1,
  'published',
  'demo_admin_001',
  datetime('now', '-40 days')
);

-- 12. Utility-Scale PPA (strategic REIPPPP form)
INSERT OR IGNORE INTO oe_document_templates (
  id, template_key, display_name, category, body_md, variables_json,
  required_signatories_json, jurisdiction, version, status, created_by, published_at
) VALUES (
  'tpl_ppa_utility_v1',
  'ppa.utility.strategic.v1',
  'Utility-Scale PPA — REIPPPP Strategic Form',
  'ppa',
  '# Power Purchase Agreement — Utility Scale (Strategic)

**Generator (Seller):** {{generator_name}} (NERSA Generation Licence: {{nersa_gen_licence}})
**Single Buyer (Offtaker):** {{offtaker_name}}
**NERSA Section 34 Determination Ref:** {{nersa_s34_ref}}
**Project:** {{project_name}} — {{capacity_mw}} MW {{technology}}
**Initial Tariff:** R{{tariff_zar_mwh}}/MWh (real, {{base_year}} ZAR)
**Indexation:** CPI + {{real_escalation_pct}}% p.a. (capped at 6% real)
**Take-or-Pay Obligation:** {{top_pct}}% of contracted generation
**Deemed Energy:** Paid at 100% tariff for curtailment events > 72 hours
**Term:** {{term_years}} years from COD ({{cod_date}})
**Termination Compensation:** NPV of remaining contracted cash flows discounted at 12.5%

Governed by ERA 4/2006 and REIPPPP standard terms issued by the DMRE.
Dispute resolution: expedited arbitration before the Cape Town International
Arbitration Centre (CTIAC) within 60 days of notice.',
  '[{"key":"generator_name","desc":"Generator/IPP legal name"},{"key":"nersa_gen_licence","desc":"NERSA generation licence number"},{"key":"offtaker_name","desc":"Offtaker legal name"},{"key":"nersa_s34_ref","desc":"NERSA Section 34 determination reference"},{"key":"project_name","desc":"Project name"},{"key":"capacity_mw","desc":"Contracted capacity MW"},{"key":"technology","desc":"e.g. Solar PV, Onshore Wind, BESS"},{"key":"tariff_zar_mwh","desc":"Initial real tariff R/MWh"},{"key":"base_year","desc":"Base year for real tariff e.g. 2026"},{"key":"real_escalation_pct","desc":"Real escalation % above CPI"},{"key":"top_pct","desc":"Take-or-pay % e.g. 92"},{"key":"term_years","desc":"Contract term years e.g. 20"},{"key":"cod_date","desc":"Commercial operation date YYYY-MM-DD"}]',
  '[{"role":"ipp_developer","label":"Generator / Seller"},{"role":"offtaker","label":"Single Buyer / Offtaker"},{"role":"regulator","label":"NERSA (witness)"}]',
  'ZA-NERSA',
  2,
  'published',
  'demo_admin_001',
  datetime('now', '-30 days')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: oe_document_envelopes — 6 completed (signed) envelopes
-- ─────────────────────────────────────────────────────────────────────────────

-- Envelope 1: PPA utility strategic — RenewCo Solar / City Energy
INSERT OR IGNORE INTO oe_document_envelopes (
  id, template_id, raised_by, raised_at, variables_json, body_rendered,
  signatories_json, status, completed_at, r2_signed_key, document_hash
) VALUES (
  'env_ppa_utility_001',
  'tpl_ppa_utility_v1',
  'demo_ipp_001',
  datetime('now', '-45 days'),
  '{"generator_name":"RenewCo Solar (Pty) Ltd","nersa_gen_licence":"NERSA-GEN-2023-0144","offtaker_name":"City Energy Municipality","nersa_s34_ref":"NERSA-S34-2026-0055","project_name":"Klerksdorp 200MW Solar Phase 2","capacity_mw":"200","technology":"Solar PV","tariff_zar_mwh":"985","base_year":"2026","real_escalation_pct":"1.5","top_pct":"92","term_years":"20","cod_date":"2027-06-01"}',
  '# Power Purchase Agreement — Utility Scale (Strategic)

**Generator (Seller):** RenewCo Solar (Pty) Ltd (NERSA Generation Licence: NERSA-GEN-2023-0144)
**Single Buyer (Offtaker):** City Energy Municipality
**NERSA Section 34 Determination Ref:** NERSA-S34-2026-0055
**Project:** Klerksdorp 200MW Solar Phase 2 — 200 MW Solar PV
**Initial Tariff:** R985/MWh (real, 2026 ZAR)
**Indexation:** CPI + 1.5% p.a. (capped at 6% real)
**Take-or-Pay Obligation:** 92% of contracted generation
**Term:** 20 years from COD (2027-06-01)',
  '[{"participant_id":"demo_ipp_001","role":"ipp_developer","label":"Generator / Seller","signed_at":"' || datetime('now', '-30 days') || '"},{"participant_id":"demo_offtaker_001","role":"offtaker","label":"Single Buyer / Offtaker","signed_at":"' || datetime('now', '-28 days') || '"}]',
  'completed',
  datetime('now', '-28 days'),
  'signed-contracts/env_ppa_utility_001.pdf',
  'a3f8c2d1e4b5a6f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1'
);

-- Envelope 2: EPC Contract — BuildSA / RenewCo Solar
INSERT OR IGNORE INTO oe_document_envelopes (
  id, template_id, raised_by, raised_at, variables_json, body_rendered,
  signatories_json, status, completed_at, r2_signed_key, document_hash
) VALUES (
  'env_epc_001',
  'tpl_epc_contract_v1',
  'demo_ipp_001',
  datetime('now', '-50 days'),
  '{"employer_name":"RenewCo Solar (Pty) Ltd","contractor_name":"BuildSA Energy EPC (Pty) Ltd","project_name":"Klerksdorp 200MW Solar Phase 2","capacity_mw":"200","technology":"Solar PV","contract_price_zar":"1950000000","longstop_date":"2027-03-31","ld_daily_rate_zar":"450000","ld_cap_pct":"10","perf_guarantee_pct":"90"}',
  '# Engineering, Procurement and Construction Contract

**Employer:** RenewCo Solar (Pty) Ltd
**EPC Contractor:** BuildSA Energy EPC (Pty) Ltd
**Project:** Klerksdorp 200MW Solar Phase 2 — 200 MW Solar PV
**Contract Price:** R1,950,000,000 (fixed-price lump sum)
**Longstop COD:** 2027-03-31
**LD Rate:** R450,000 per day of delay (capped at 10% of Contract Price)
**Performance Guarantee:** 90% of contracted generation P90',
  '[{"participant_id":"demo_ipp_001","role":"ipp_developer","label":"Employer","signed_at":"' || datetime('now', '-35 days') || '"},{"participant_id":"demo_epc_001","role":"epc_contractor","label":"EPC Contractor","signed_at":"' || datetime('now', '-33 days') || '"}]',
  'completed',
  datetime('now', '-33 days'),
  'signed-contracts/env_epc_001.pdf',
  'b4e9d3c2f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2'
);

-- Envelope 3: O&M Agreement — SunServ / WindCapital
INSERT OR IGNORE INTO oe_document_envelopes (
  id, template_id, raised_by, raised_at, variables_json, body_rendered,
  signatories_json, status, completed_at, r2_signed_key, document_hash
) VALUES (
  'env_om_001',
  'tpl_om_agreement_v1',
  'demo_ipp_002',
  datetime('now', '-40 days'),
  '{"owner_name":"WindCapital (Pty) Ltd","contractor_name":"SunServ O&M (Pty) Ltd","asset_name":"Mookgopong 40MW Wind","capacity_mw":"40","cod_date":"2022-03-01","annual_fee_zar":"12500000","availability_pct":"97","ld_per_mwh_zar":"185","term_years":"5"}',
  '# Operations and Maintenance Services Agreement

**Asset Owner:** WindCapital (Pty) Ltd
**O&M Contractor:** SunServ O&M (Pty) Ltd
**Asset:** Mookgopong 40MW Wind (40 MW, COD: 2022-03-01)
**Annual O&M Fee:** R12,500,000 (indexed to CPI annually)
**Availability Guarantee:** 97% annual average uptime
**LD for Under-Availability:** R185 per MWh of shortfall
**Term:** 5 years from Commencement Date',
  '[{"participant_id":"demo_ipp_002","role":"ipp_developer","label":"Asset Owner","signed_at":"' || datetime('now', '-25 days') || '"},{"participant_id":"demo_esco_001","role":"esco","label":"O&M Contractor","signed_at":"' || datetime('now', '-23 days') || '"}]',
  'completed',
  datetime('now', '-23 days'),
  'signed-contracts/env_om_001.pdf',
  'c5f0e4d3a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3'
);

-- Envelope 4: Loan Agreement — RenewCo / Infrastructure Capital Partners
INSERT OR IGNORE INTO oe_document_envelopes (
  id, template_id, raised_by, raised_at, variables_json, body_rendered,
  signatories_json, status, completed_at, r2_signed_key, document_hash
) VALUES (
  'env_loan_001',
  'tpl_loan_agreement_v1',
  'demo_lender_001',
  datetime('now', '-55 days'),
  '{"borrower_name":"RenewCo Solar Phase 2 SPV (Pty) Ltd","lender_name":"Infrastructure Capital Partners","facility_amount_zar":"1350000000","facility_type":"Senior Secured Term Loan","margin_bps":"285","tenor_years":"18"}',
  '# Project Finance Loan Agreement

**Borrower:** RenewCo Solar Phase 2 SPV (Pty) Ltd
**Lender / Facility Agent:** Infrastructure Capital Partners
**Facility Amount:** R1,350,000,000
**Facility Type:** Senior Secured Term Loan
**Interest Rate:** JIBAR + 285 bps p.a., reset quarterly
**Tenor:** 18 years from first drawdown
**Repayment:** Semi-annual principal repayment commencing 6 months post-COD',
  '[{"participant_id":"demo_ipp_001","role":"ipp_developer","label":"Borrower","signed_at":"' || datetime('now', '-38 days') || '"},{"participant_id":"demo_lender_001","role":"lender","label":"Lender / Facility Agent","signed_at":"' || datetime('now', '-36 days') || '"}]',
  'completed',
  datetime('now', '-36 days'),
  'signed-contracts/env_loan_001.pdf',
  'd6a1f5e4b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4'
);

-- Envelope 5: Carbon ERPA — GreenFunds / WindCapital
INSERT OR IGNORE INTO oe_document_envelopes (
  id, template_id, raised_by, raised_at, variables_json, body_rendered,
  signatories_json, status, completed_at, r2_signed_key, document_hash
) VALUES (
  'env_erpa_001',
  'tpl_carbon_erpa_v1',
  'demo_carbon_001',
  datetime('now', '-35 days'),
  '{"seller_name":"WindCapital (Pty) Ltd","buyer_name":"GreenFunds Carbon Fund","carbon_standard":"Gold Standard","project_name":"Mookgopong 40MW Wind","project_id":"GS-SA-CER-2020-078","volume_tco2e":"32000","price_usd_per_tco2e":"8.50","vintage_year":"2025","delivery_start_date":"2025-01-01","delivery_end_date":"2027-12-31"}',
  '# Emission Reduction Purchase Agreement

**Seller (Project Developer):** WindCapital (Pty) Ltd
**Buyer (Carbon Fund):** GreenFunds Carbon Fund
**Carbon Standard:** Gold Standard
**Project:** Mookgopong 40MW Wind (ID: GS-SA-CER-2020-078)
**Credit Volume:** 32,000 tCO2e per annum (indicative)
**Delivery Price:** USD 8.50/tCO2e (vintage 2025)
**Delivery Period:** 2025-01-01 to 2027-12-31',
  '[{"participant_id":"demo_ipp_002","role":"ipp_developer","label":"Seller","signed_at":"' || datetime('now', '-20 days') || '"},{"participant_id":"demo_carbon_001","role":"carbon_fund","label":"Buyer","signed_at":"' || datetime('now', '-18 days') || '"}]',
  'completed',
  datetime('now', '-18 days'),
  'signed-contracts/env_erpa_001.pdf',
  'e7b2a6f5c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5'
);

-- Envelope 6: Wheeling Agreement — RenewCo / City Energy / Eskom
INSERT OR IGNORE INTO oe_document_envelopes (
  id, template_id, raised_by, raised_at, variables_json, body_rendered,
  signatories_json, status, completed_at, r2_signed_key, document_hash
) VALUES (
  'env_wheeling_001',
  'tpl_wheeling_agreement_v1',
  'demo_ipp_001',
  datetime('now', '-42 days'),
  '{"generator_name":"RenewCo Solar (Pty) Ltd","offtaker_name":"City Energy Municipality","network_operator_name":"Eskom Holdings","wheeled_capacity_mw":"200","wheeling_tariff_zar_mwh":"68","injection_point":"Klerksdorp 132kV Substation","offtake_point":"Vantax Junction 66kV Substation","loss_factor_pct":"2.3","term_years":"20"}',
  '# Energy Wheeling Agreement

**Wheeling Party (Generator):** RenewCo Solar (Pty) Ltd
**Wheeling Party (Offtaker):** City Energy Municipality
**Network Operator:** Eskom Holdings
**Wheeled Capacity:** 200 MW (maximum)
**Wheeling Tariff:** R68/MWh
**Connection Points:** Klerksdorp 132kV Substation (injection) to Vantax Junction 66kV Substation (offtake)
**Energy Loss Factor:** 2.3%
**Term:** 20 years',
  '[{"participant_id":"demo_ipp_001","role":"ipp_developer","label":"Generator","signed_at":"' || datetime('now', '-27 days') || '"},{"participant_id":"demo_offtaker_001","role":"offtaker","label":"Offtaker","signed_at":"' || datetime('now', '-26 days') || '"}]',
  'completed',
  datetime('now', '-26 days'),
  'signed-contracts/env_wheeling_001.pdf',
  'f8c3b7a6d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: oe_signatures — 2 per envelope (12 total)
-- ─────────────────────────────────────────────────────────────────────────────

-- Envelope 1: PPA utility
INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_ppa_util_001_ipp',
  'contract',
  'env_ppa_utility_001',
  'a3f8c2d1e4b5a6f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
  'demo_ipp_001',
  'seller',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1pcHAtMDAxLXBwYS11dGlsaXR5LXYx',
  'dGVzdC1wdWJsaWMta2V5LWlwcC0wMDEtZWQyNTUxOQ==',
  datetime('now', '-30 days'),
  '41.13.88.100',
  'platform_key',
  datetime('now', '-30 days'),
  'Generator authorised signatory: Johan van der Berg'
);

INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_ppa_util_001_offtaker',
  'contract',
  'env_ppa_utility_001',
  'a3f8c2d1e4b5a6f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
  'demo_offtaker_001',
  'buyer',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1vZmZ0YWtlci0wMDEtcHBhLXV0aWxpdHk=',
  'dGVzdC1wdWJsaWMta2V5LW9mZnRha2VyLTAwMS1lZDI1NTE5',
  datetime('now', '-28 days'),
  '196.30.45.212',
  'platform_key',
  datetime('now', '-28 days'),
  'Offtaker authorised signatory: Thabo Molefe'
);

-- Envelope 2: EPC contract
INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_epc_001_ipp',
  'contract',
  'env_epc_001',
  'b4e9d3c2f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
  'demo_ipp_001',
  'buyer',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1pcHAtMDAxLWVwYy0wMDE=',
  'dGVzdC1wdWJsaWMta2V5LWlwcC0wMDEtZWQyNTUxOQ==',
  datetime('now', '-35 days'),
  '41.13.88.100',
  'platform_key',
  datetime('now', '-35 days'),
  'Employer authorised signatory: Johan van der Berg'
);

INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_epc_001_epc',
  'contract',
  'env_epc_001',
  'b4e9d3c2f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
  'demo_epc_001',
  'seller',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1lcGMtMDAxLWVwYy0wMDE=',
  'dGVzdC1wdWJsaWMta2V5LWVwYy0wMDEtZWQyNTUxOQ==',
  datetime('now', '-33 days'),
  '102.209.14.57',
  'platform_key',
  datetime('now', '-33 days'),
  'EPC Contractor authorised signatory: Andile Bhengu'
);

-- Envelope 3: O&M agreement
INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_om_001_ipp',
  'contract',
  'env_om_001',
  'c5f0e4d3a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
  'demo_ipp_002',
  'buyer',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1pcHAtMDAyLW9tLTAwMQ==',
  'dGVzdC1wdWJsaWMta2V5LWlwcC0wMDItZWQyNTUxOQ==',
  datetime('now', '-25 days'),
  '196.30.112.44',
  'platform_key',
  datetime('now', '-25 days'),
  'Asset Owner authorised signatory: Lerato Moloto'
);

INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_om_001_esco',
  'contract',
  'env_om_001',
  'c5f0e4d3a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3',
  'demo_esco_001',
  'seller',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1lc2NvLTAwMS1vbS0wMDE=',
  'dGVzdC1wdWJsaWMta2V5LWVzY28tMDAxLWVkMjU1MTk=',
  datetime('now', '-23 days'),
  '41.79.18.230',
  'platform_key',
  datetime('now', '-23 days'),
  'O&M Contractor authorised signatory: Zanele Khumalo'
);

-- Envelope 4: Loan agreement
INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_loan_001_ipp',
  'contract',
  'env_loan_001',
  'd6a1f5e4b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4',
  'demo_ipp_001',
  'buyer',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1pcHAtMDAxLWxvYW4tMDAx',
  'dGVzdC1wdWJsaWMta2V5LWlwcC0wMDEtZWQyNTUxOQ==',
  datetime('now', '-38 days'),
  '41.13.88.100',
  'platform_key',
  datetime('now', '-38 days'),
  'Borrower authorised signatory: Johan van der Berg'
);

INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_loan_001_lender',
  'contract',
  'env_loan_001',
  'd6a1f5e4b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4',
  'demo_lender_001',
  'seller',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1sZW5kZXItMDAxLWxvYW4tMDAx',
  'dGVzdC1wdWJsaWMta2V5LWxlbmRlci0wMDEtZWQyNTUxOQ==',
  datetime('now', '-36 days'),
  '196.215.107.90',
  'platform_key',
  datetime('now', '-36 days'),
  'Lender authorised signatory: Pieter van Zyl'
);

-- Envelope 5: Carbon ERPA
INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_erpa_001_ipp',
  'contract',
  'env_erpa_001',
  'e7b2a6f5c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5',
  'demo_ipp_002',
  'seller',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1pcHAtMDAyLWVycGEtMDAx',
  'dGVzdC1wdWJsaWMta2V5LWlwcC0wMDItZWQyNTUxOQ==',
  datetime('now', '-20 days'),
  '196.30.112.44',
  'platform_key',
  datetime('now', '-20 days'),
  'Seller authorised signatory: Lerato Moloto'
);

INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_erpa_001_carbon',
  'contract',
  'env_erpa_001',
  'e7b2a6f5c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5',
  'demo_carbon_001',
  'buyer',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1jYXJib24tMDAxLWVycGEtMDAx',
  'dGVzdC1wdWJsaWMta2V5LWNhcmJvbi0wMDEtZWQyNTUxOQ==',
  datetime('now', '-18 days'),
  '41.60.232.15',
  'platform_key',
  datetime('now', '-18 days'),
  'Buyer authorised signatory: Anita Naidoo'
);

-- Envelope 6: Wheeling agreement
INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_wheeling_001_ipp',
  'wheeling_agreement',
  'env_wheeling_001',
  'f8c3b7a6d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6',
  'demo_ipp_001',
  'seller',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1pcHAtMDAxLXdoZWVsaW5nLTAwMQ==',
  'dGVzdC1wdWJsaWMta2V5LWlwcC0wMDEtZWQyNTUxOQ==',
  datetime('now', '-27 days'),
  '41.13.88.100',
  'platform_key',
  datetime('now', '-27 days'),
  'Generator authorised signatory: Johan van der Berg'
);

INSERT OR IGNORE INTO oe_signatures (
  id, document_kind, document_ref, document_hash, signer_id, signer_role,
  signature_b64, public_key_b64, signed_at, ip, signing_method, verified_at, notes
) VALUES (
  'sig_wheeling_001_offtaker',
  'wheeling_agreement',
  'env_wheeling_001',
  'f8c3b7a6d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6',
  'demo_offtaker_001',
  'buyer',
  'dGVzdC1lZDI1NTE5LXNpZ25hdHVyZS1vZmZ0YWtlci0wMDEtd2hlZWxpbmctMDAx',
  'dGVzdC1wdWJsaWMta2V5LW9mZnRha2VyLTAwMS1lZDI1NTE5',
  datetime('now', '-26 days'),
  '196.30.45.212',
  'platform_key',
  datetime('now', '-26 days'),
  'Offtaker authorised signatory: Thabo Molefe'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: oe_ppa_contract_chain — 3 seed PPAs
-- (distinct from the 10 in migration 135 which use p_ipp_* / p_offtaker_* IDs)
-- ─────────────────────────────────────────────────────────────────────────────

-- PPA A: in_force — RenewCo Solar / City Energy (backed by signed envelope above)
INSERT OR IGNORE INTO oe_ppa_contract_chain (
  id, ppa_number, project_id, facility_id,
  participant_id, offtaker_id,
  project_name, offtaker_name,
  contract_term_years, capacity_mw, capacity_tier,
  tariff_zar_per_mwh, indexation, take_or_pay_pct,
  chain_status,
  draft_at, negotiation_at, terms_locked_at, legal_signed_at, executed_at, in_force_at,
  nersa_section34_ref, legal_counterparty_ref, board_approval_ref,
  contract_notes, expiry_date, sla_deadline_at, escalation_level,
  created_by, created_at
) VALUES (
  'seed_ppa_001',
  'PPA-2026-0494-A',
  'proj_klerksdorp_ph2',
  'f_klerksdorp_ph2',
  'demo_ipp_001',
  'demo_offtaker_001',
  'Klerksdorp 200MW Solar Phase 2',
  'City Energy Municipality',
  20,
  200.0,
  'strategic',
  985.00,
  'cpi_+_1.5pct',
  92.0,
  'in_force',
  datetime('now', '-180 days'),
  datetime('now', '-150 days'),
  datetime('now', '-90 days'),
  datetime('now', '-60 days'),
  datetime('now', '-45 days'),
  datetime('now', '-28 days'),
  'NERSA-S34-2026-0055',
  'Webber Wentzel',
  'BR-2026-055',
  'REIPPPP BW7 award; 200MW solar PV; wheeling via Eskom Tx (env_wheeling_001)',
  date('now', '+19 years', '-28 days'),
  NULL,
  0,
  'demo_ipp_001',
  datetime('now', '-180 days')
);

-- PPA B: executed (awaiting COD) — WindCapital / City Energy
INSERT OR IGNORE INTO oe_ppa_contract_chain (
  id, ppa_number, project_id, facility_id,
  participant_id, offtaker_id,
  project_name, offtaker_name,
  contract_term_years, capacity_mw, capacity_tier,
  tariff_zar_per_mwh, indexation, take_or_pay_pct,
  chain_status,
  draft_at, negotiation_at, terms_locked_at, legal_signed_at, executed_at,
  nersa_section34_ref, legal_counterparty_ref, board_approval_ref,
  contract_notes, expiry_date, sla_deadline_at, escalation_level,
  created_by, created_at
) VALUES (
  'seed_ppa_002',
  'PPA-2026-0494-B',
  'proj_lephalale_wind',
  NULL,
  'demo_ipp_002',
  'demo_offtaker_001',
  'Lephalale 80MW Wind Farm',
  'City Energy Municipality',
  20,
  80.0,
  'medium',
  1105.00,
  'cpi_+_1pct',
  88.0,
  'executed',
  datetime('now', '-240 days'),
  datetime('now', '-200 days'),
  datetime('now', '-120 days'),
  datetime('now', '-80 days'),
  datetime('now', '-55 days'),
  'NERSA-S34-2025-0089',
  'Cliffe Dekker Hofmeyr',
  'BR-2025-089',
  'Executed; COD target 2027-04-30 per W20 milestones; O&M contract with SunServ attached',
  date('now', '+19 years', '-55 days'),
  datetime('now', '+365 days'),
  0,
  'demo_ipp_002',
  datetime('now', '-240 days')
);

-- PPA C: in_negotiation — RenewCo Solar / City Energy (BESS augmentation)
INSERT OR IGNORE INTO oe_ppa_contract_chain (
  id, ppa_number, project_id, facility_id,
  participant_id, offtaker_id,
  project_name, offtaker_name,
  contract_term_years, capacity_mw, capacity_tier,
  tariff_zar_per_mwh, indexation, take_or_pay_pct,
  chain_status,
  draft_at, negotiation_at,
  contract_notes, sla_deadline_at, escalation_level,
  created_by, created_at
) VALUES (
  'seed_ppa_003',
  'PPA-2026-0494-C',
  'proj_klerksdorp_bess',
  NULL,
  'demo_ipp_001',
  'demo_offtaker_001',
  'Klerksdorp 50MW / 200MWh BESS Augmentation',
  'City Energy Municipality',
  15,
  50.0,
  'medium',
  1920.00,
  'cpi_+_2pct',
  95.0,
  'in_negotiation',
  datetime('now', '-30 days'),
  datetime('now', '-14 days'),
  'BESS augmentation to Klerksdorp Phase 2 solar; tariff disputed — offtaker seeking CPI-only; arbitration clause under negotiation',
  datetime('now', '+90 days'),
  0,
  'demo_ipp_001',
  datetime('now', '-30 days')
);

-- Audit events for the 3 seed PPAs
INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_001',
  'seed_ppa_001',
  'created',
  NULL,
  'draft',
  'demo_ipp_001',
  'REIPPPP BW7 award template loaded',
  NULL,
  datetime('now', '-180 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_002',
  'seed_ppa_001',
  'negotiation_started',
  'draft',
  'in_negotiation',
  'demo_offtaker_001',
  'Offtaker engaged; City Energy Municipal Council resolution obtained',
  NULL,
  datetime('now', '-150 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_003',
  'seed_ppa_001',
  'terms_locked',
  'in_negotiation',
  'terms_locked',
  'demo_offtaker_001',
  'Tariff R985/MWh + CPI+1.5pct; 92pct take-or-pay; wheeling Schedule 7 agreed',
  NULL,
  datetime('now', '-90 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_004',
  'seed_ppa_001',
  'legal_signed',
  'terms_locked',
  'legal_signed',
  'demo_offtaker_001',
  'Webber Wentzel sign-off; board approval BR-2026-055',
  NULL,
  datetime('now', '-60 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_005',
  'seed_ppa_001',
  'executed',
  'legal_signed',
  'executed',
  'demo_offtaker_001',
  'NERSA-S34-2026-0055 lodged and acknowledged',
  '{"nersa_section34_ref":"NERSA-S34-2026-0055","board_approval_ref":"BR-2026-055"}',
  datetime('now', '-45 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_006',
  'seed_ppa_001',
  'commenced',
  'executed',
  'in_force',
  'demo_offtaker_001',
  'COD achieved; PPA in force',
  NULL,
  datetime('now', '-28 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_007',
  'seed_ppa_002',
  'created',
  NULL,
  'draft',
  'demo_ipp_002',
  'Lephalale 80MW Wind — draft from REIPPPP BW6 template',
  NULL,
  datetime('now', '-240 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_008',
  'seed_ppa_002',
  'negotiation_started',
  'draft',
  'in_negotiation',
  'demo_offtaker_001',
  'Cliffe Dekker Hofmeyr engaged; tariff negotiations commenced',
  NULL,
  datetime('now', '-200 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_009',
  'seed_ppa_002',
  'terms_locked',
  'in_negotiation',
  'terms_locked',
  'demo_offtaker_001',
  'R1105/MWh + CPI+1pct; 88pct take-or-pay; NERSA-S34-2025-0089',
  NULL,
  datetime('now', '-120 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_010',
  'seed_ppa_002',
  'legal_signed',
  'terms_locked',
  'legal_signed',
  'demo_offtaker_001',
  'Legal sign-off; BR-2025-089 board resolution attached',
  NULL,
  datetime('now', '-80 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_011',
  'seed_ppa_002',
  'executed',
  'legal_signed',
  'executed',
  'demo_ipp_002',
  'NERSA-S34-2025-0089 lodged; COD target 2027-04-30',
  '{"nersa_section34_ref":"NERSA-S34-2025-0089"}',
  datetime('now', '-55 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_012',
  'seed_ppa_003',
  'created',
  NULL,
  'draft',
  'demo_ipp_001',
  'BESS augmentation PPA draft — DMRE BESS procurement template',
  NULL,
  datetime('now', '-30 days')
);

INSERT OR IGNORE INTO oe_ppa_contract_chain_events (
  id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at
) VALUES (
  'seed_ppa_evt_013',
  'seed_ppa_003',
  'negotiation_started',
  'draft',
  'in_negotiation',
  'demo_offtaker_001',
  'Offtaker counter-proposes CPI-only indexation; tariff and arbitration clause open items',
  NULL,
  datetime('now', '-14 days')
);
