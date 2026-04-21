-- ============================================================================
-- OPEN ENERGY PLATFORM — Contract Templates (South African law)
-- Migration 004
-- ----------------------------------------------------------------------------
-- All templates reference the applicable South African statutes:
--   • Electricity Regulation Act 4 of 2006 ("ERA 2006")
--   • NERSA Electricity Pricing / Grid Code / Distribution Code
--   • Integrated Resource Plan (IRP 2019, as amended)
--   • REIPPPP / RMI4DP programme rules
--   • Companies Act 71 of 2008
--   • Protection of Personal Information Act 4 of 2013 ("POPIA")
--   • Competition Act 89 of 1998
--   • Value-Added Tax Act 89 of 1991
--   • Carbon Tax Act 15 of 2019
--   • National Environmental Management Act 107 of 1998 ("NEMA")
--   • Promotion of Access to Information Act 2 of 2000 ("PAIA")
-- ============================================================================

CREATE TABLE IF NOT EXISTS contract_templates (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'commercial','financing','operations','grid','carbon','governance','preliminary'
  )),
  document_type TEXT NOT NULL,
  description TEXT,
  sa_law_references TEXT,
  jurisdiction TEXT NOT NULL DEFAULT 'South Africa',
  governing_law TEXT NOT NULL DEFAULT 'Laws of the Republic of South Africa',
  template_body TEXT NOT NULL,
  variables_json TEXT,
  version TEXT DEFAULT 'v1.0',
  published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_category ON contract_templates(category);
CREATE INDEX IF NOT EXISTS idx_contract_templates_code ON contract_templates(code);

-- ---- TEMPLATE 1 — Power Purchase Agreement (Wheeling / Grid-connected) ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_ppa_wheel_001','PPA-WHEEL-SA','Power Purchase Agreement (Wheeling)','commercial','ppa_wheeling',
  'Long-form PPA for energy wheeled across Eskom/municipal networks between an IPP and off-taker. ERA 2006 licensed generation; NERSA-approved use-of-system tariff.',
  'ERA 2006 ss 8-10; NERSA Electricity Pricing Policy; NERSA Grid Code; IRP 2019; Carbon Tax Act 15 of 2019; POPIA; VAT Act 89/1991',
  '# POWER PURCHASE AGREEMENT (WHEELING)

**PARTIES:** {{seller_name}} (Registration No. {{seller_reg}}) ("**Seller**") and {{buyer_name}} (Registration No. {{buyer_reg}}) ("**Buyer**").

**1. DEFINITIONS.** Terms defined in the ERA 2006 and the NERSA Grid Code have the same meanings herein. "COD" means Commercial Operation Date; "Delivery Point" means the Eskom/municipal metering point specified in Schedule A.

**2. SALE & PURCHASE.** Seller will sell and Buyer will purchase {{contract_volume_mwh}} MWh per annum of {{energy_type}} energy generated from the {{project_name}} facility, located at {{location}}, over a tenor of {{tenor_years}} years commencing on COD.

**3. PRICE & INDEXATION.** Base price: ZAR {{price_per_mwh}}/MWh, escalating annually by {{escalation_pct}}% (CPI-linked, capped at 8%). All amounts exclude VAT.

**4. WHEELING & USE-OF-SYSTEM.** Buyer shall be responsible for: (a) securing Use-of-System ("UoS") rights over the Transmission / Distribution Network in accordance with NERSA Tariff Methodology; (b) paying the approved UoS charges. Losses are allocated in accordance with the latest approved NERSA loss factors.

**5. METERING & SETTLEMENT.** Revenue-grade metering to NERSA Metering Code of Practice, verified quarterly. Monthly settlement per invoice issued within 5 business days of month-end, payable within 30 days, aligned with VAT Act 89/1991.

**6. CARBON ATTRIBUTES.** Unless expressly transferred under a separate ERPA, all Environmental Attributes, RECs, and carbon credits remain with Seller. Carbon Tax Act 15 of 2019 tax offsets — {{carbon_share}}% attributable to Buyer.

**7. LICENCES, LEGAL & REGULATORY.** Seller warrants it holds a valid generation licence or registration under ERA 2006 s 8. Buyer warrants compliance with IRP 2019 and any applicable Ministerial Determinations.

**8. FORCE MAJEURE.** Standard Southern African Power Pool (SAPP) FM events including load-shedding directives under NRS 048-9.

**9. POPIA.** Parties shall process personal information only for the purposes of this Agreement in accordance with POPIA and the Information Regulator''s Code of Conduct.

**10. GOVERNING LAW.** This Agreement is governed by the laws of the Republic of South Africa. Disputes shall be referred to arbitration under the AFSA Rules in Johannesburg.

**SIGNED** at ____________ on this ____ day of ________ 20__.

_____________________            _____________________
For and on behalf of Seller       For and on behalf of Buyer',
  '{"seller_name":"","buyer_name":"","project_name":"","contract_volume_mwh":0,"price_per_mwh":0,"escalation_pct":4.5,"tenor_years":20,"energy_type":"solar","carbon_share":0,"location":""}'
);

-- ---- TEMPLATE 2 — PPA Behind-the-Meter / Direct Supply / Private Wire ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_ppa_btm_001','PPA-BTM-SA','Power Purchase Agreement (Behind-the-Meter)','commercial','ppa_btm',
  'Private wire / behind-the-meter PPA. Rooftop or on-site generation supplied directly to off-taker, no wheeling required.',
  'ERA 2006 ss 8(1)(c) [generation under 100 MW exemption]; NERSA Registration Rules 2022; Schedule 2 (as amended 2022); Companies Act 71/2008; POPIA',
  '# POWER PURCHASE AGREEMENT — BEHIND-THE-METER

**PARTIES:** Between {{seller_name}} (the "**Seller**") and {{buyer_name}} (the "**Buyer**").

**1. INSTALLATION.** Seller shall design, install, own, operate and maintain the {{capacity_mw}} MW {{technology}} facility at Buyer''s premises at {{site_address}}. Seller retains title at all times.

**2. ENERGY SUPPLY.** All energy generated at the facility is delivered to Buyer at the Delivery Point being the connection on Buyer''s private network downstream of the Eskom/Municipal meter. Seller is exempt from licensing under ERA 2006 s 8(1)(c) [embedded generation ≤ 100 MW, Schedule 2 as amended 2022] and has registered the facility with NERSA.

**3. PRICE.** Buyer pays for all energy metered at the Delivery Point at ZAR {{price_per_mwh}}/MWh (net of losses), escalating at CPI + {{escalation_real}}%, capped at 8% p.a.

**4. TENOR.** {{tenor_years}} years from COD; Buyer may purchase or extend at end-of-term.

**5. SITE ACCESS & SERVITUDE.** Buyer grants Seller a registered servitude in terms of Deeds Registries Act 47 of 1937 for the full term, permitting access to install, operate, maintain and remove the facility.

**6. STATUTORY COMPLIANCE.** Seller complies with: Occupational Health and Safety Act 85 of 1993, SANS 10142 (wiring), SANS 10400-XA (energy usage), NERSA Small-scale Embedded Generation standards.

**7. POPIA.** Metering data is personal information only to the extent linked to natural persons; all processing is for billing and compliance.

**8. DISPUTE RESOLUTION.** Arbitration under AFSA Rules; seat Johannesburg; English.

**9. GOVERNING LAW.** Laws of the Republic of South Africa.

**SIGNED** at ____________ on ____ _______ 20__.',
  '{"seller_name":"","buyer_name":"","capacity_mw":0,"technology":"solar_pv","site_address":"","price_per_mwh":0,"escalation_real":1.5,"tenor_years":15}'
);

-- ---- TEMPLATE 3 — Direct Supply Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_direct_001','DIRECT-SUPPLY-SA','Direct Supply Agreement','commercial','offtake_agreement',
  'Bilateral direct-supply contract between a licensed generator and an eligible customer, excluding any wheeling.',
  'ERA 2006 ss 8, 10; NERSA Distribution Code; Consumer Protection Act 68/2008 (if applicable); POPIA',
  '# DIRECT SUPPLY AGREEMENT

**BETWEEN** {{seller_name}} (the "**Generator**") **AND** {{buyer_name}} (the "**Customer**").

**1. SCOPE.** Generator shall supply {{volume_mwh}} MWh per annum of {{energy_type}} energy on a firm/as-available basis at ZAR {{price_per_mwh}}/MWh.

**2. DELIVERY POINT.** The point of supply shall be the substation at {{delivery_point}} metered under NERSA Metering Code.

**3. TERM.** {{tenor_years}} years from COD.

**4. TAKE-OR-PAY.** Customer undertakes to purchase at least {{top_pct}}% of the annual Contract Volume. Shortfall payable at the Contract Price.

**5. REGULATORY.** Generator holds a valid licence under ERA 2006 s 8. Customer is an Eligible Customer per NERSA Distribution Code.

**6. BILLING.** Monthly; 30-day payment terms; VAT exclusive.

**7. POPIA & CONFIDENTIALITY.** Usual.

**8. GOVERNING LAW.** RSA. Arbitration per AFSA Rules, seat Johannesburg.',
  '{"seller_name":"","buyer_name":"","volume_mwh":0,"energy_type":"solar","price_per_mwh":0,"tenor_years":10,"delivery_point":"","top_pct":80}'
);

-- ---- TEMPLATE 4 — Letter of Intent (LOI) ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_loi_001','LOI-SA','Letter of Intent','preliminary','loi',
  'Non-binding letter of intent to negotiate a PPA / carbon offtake / project finance facility. No legal commitment except confidentiality.',
  'Common law; POPIA; Companies Act 71/2008',
  '# LETTER OF INTENT

**To:** {{counterparty_name}}
**Date:** {{date}}
**Re:** Proposed {{transaction_type}} — {{project_name}}

Dear Sir / Madam,

This Letter of Intent ("**LOI**") sets out the preliminary, non-binding interest of {{issuer_name}} to enter into a {{transaction_type}} with {{counterparty_name}} on substantially the commercial terms set out below.

**1. INDICATIVE COMMERCIAL TERMS.**
• Energy / Volume: {{volume}}
• Indicative price: {{price}}
• Tenor: {{tenor}}
• Conditions precedent: FC, NERSA approval, board approval, statutory approvals.

**2. EXCLUSIVITY.** The parties agree a mutual exclusivity period of {{exclusivity_days}} days from the date of this LOI.

**3. CONFIDENTIALITY.** Each party shall keep confidential all non-public information obtained from the other, in accordance with POPIA.

**4. NON-BINDING.** Save for clauses 2 (Exclusivity), 3 (Confidentiality), 5 (Costs) and 6 (Law), this LOI is not intended to create any legally binding obligation.

**5. COSTS.** Each party bears its own costs.

**6. LAW.** South African law.

Yours faithfully,

_____________________
For and on behalf of {{issuer_name}}',
  '{"issuer_name":"","counterparty_name":"","transaction_type":"PPA","project_name":"","volume":"","price":"","tenor":"","date":"","exclusivity_days":60}'
);

-- ---- TEMPLATE 5 — Term Sheet ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_termsheet_001','TERM-SHEET-SA','Term Sheet','preliminary','term_sheet',
  'Non-binding term sheet crystallising the key deal terms before drafting a long-form PPA / Facility Agreement.',
  'Common law contract formation principles',
  '# TERM SHEET — {{transaction_type}}

**Project / Facility:** {{project_name}}
**Parties:** {{party_a}} and {{party_b}}
**Date:** {{date}}

| Item | Term |
|------|------|
| Volume / Size | {{volume}} |
| Price / Rate | {{price}} |
| Tenor | {{tenor}} |
| Governing Law | Republic of South Africa |
| Conditions Precedent | FC, licences, board and NERSA approvals |
| Exclusivity | {{exclusivity_days}} days |
| Confidentiality | Binding — POPIA compliant |
| Long-form execution target | {{target_longform_date}} |

This Term Sheet is non-binding save for Confidentiality, Exclusivity, Costs and Governing Law.',
  '{"transaction_type":"PPA","project_name":"","party_a":"","party_b":"","volume":"","price":"","tenor":"","date":"","exclusivity_days":45,"target_longform_date":""}'
);

-- ---- TEMPLATE 6 — NDA ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_nda_001','NDA-SA','Mutual Non-Disclosure Agreement','preliminary','nda',
  'Mutual NDA compliant with POPIA, PAIA, and Competition Act information sharing guidelines.',
  'POPIA; PAIA; Competition Act 89/1998',
  '# MUTUAL NON-DISCLOSURE AGREEMENT

**BETWEEN** {{party_a}} ("Party A") **AND** {{party_b}} ("Party B").

**1. PURPOSE.** Evaluation of a potential {{transaction_type}} transaction.

**2. CONFIDENTIAL INFORMATION.** All non-public information disclosed by one party ("Disclosing Party") to the other ("Receiving Party"), in any form, is confidential.

**3. OBLIGATIONS.** Each Receiving Party shall (a) not disclose Confidential Information to any third party without prior written consent, (b) use it solely for the Purpose, (c) apply the same standard of care it uses with its own information, and in any event not less than a reasonable standard.

**4. POPIA.** Personal information is processed only to the extent necessary for the Purpose, lawful grounds under s 11 POPIA.

**5. COMPETITION LAW.** No competitively sensitive information (prices, customers, volumes) may be exchanged in breach of the Competition Act 89 of 1998.

**6. TERM.** {{term_years}} years from signature; survival of confidentiality for further {{survival_years}} years.

**7. GOVERNING LAW.** RSA.

Signed at ____________ on ____ _______ 20__.',
  '{"party_a":"","party_b":"","transaction_type":"","term_years":2,"survival_years":5}'
);

-- ---- TEMPLATE 7 — EPC Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_epc_001','EPC-SA','Engineering, Procurement & Construction Contract','operations','epc',
  'Turnkey EPC for utility-scale renewable plant. FIDIC Silver-Book inspired but South African law and Occupational Health and Safety compliant.',
  'OHS Act 85/1993; Construction Regulations 2014; NEMA 107/1998; Companies Act 71/2008; ERA 2006',
  '# EPC CONTRACT

**EMPLOYER:** {{employer_name}} — **CONTRACTOR:** {{contractor_name}}

**1. WORKS.** Design, procurement, construction, commissioning and testing of the {{capacity_mw}} MW {{technology}} plant at {{site}}.

**2. CONTRACT PRICE.** Lump-sum turnkey: ZAR {{contract_price}} (excl. VAT), payable per Milestone Schedule.

**3. TIME FOR COMPLETION.** {{construction_months}} months from Commencement Date. LDs at ZAR {{lds_per_day}}/day, capped at {{lds_cap_pct}}%.

**4. PERFORMANCE GUARANTEES.** Energy yield {{guaranteed_yield_mwh}} MWh/yr; availability {{guaranteed_availability_pct}}%. Buy-down LDs at ZAR/kWh as per Schedule.

**5. HEALTH, SAFETY & ENVIRONMENT.** Full compliance with OHS Act 85/1993, Construction Regulations 2014, NEMA 107/1998 and any EIA record of decision.

**6. INSURANCES.** CAR, third-party liability, marine transit, professional indemnity — sums per Schedule.

**7. WARRANTY.** Defects liability 24 months from PAC.

**8. STATUTORY.** CIDB grading required, B-BBEE subcontracting undertakings, NERSA grid-code compliance testing.

**9. DISPUTE.** DAAB followed by AFSA arbitration, Johannesburg.

**10. GOVERNING LAW.** RSA.',
  '{"employer_name":"","contractor_name":"","capacity_mw":0,"technology":"solar_pv","site":"","contract_price":0,"construction_months":18,"lds_per_day":0,"lds_cap_pct":10,"guaranteed_yield_mwh":0,"guaranteed_availability_pct":97}'
);

-- ---- TEMPLATE 8 — O&M Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_om_001','OM-SA','Operations & Maintenance Agreement','operations','om',
  'Long-term O&M agreement with SLA-backed availability and generation warranties.',
  'OHS Act 85/1993; NERSA Grid Code; SANS standards; POPIA',
  '# O&M AGREEMENT

**OWNER:** {{owner_name}} — **OPERATOR:** {{operator_name}}

**1. SERVICES.** Full-scope O&M of the {{facility_name}} ({{capacity_mw}} MW {{technology}}): preventive maintenance, corrective maintenance, remote monitoring, spares, compliance reporting.

**2. TERM.** {{term_years}} years from COD.

**3. FEES.** Fixed fee ZAR {{fixed_fee_annual}} p.a. + variable ZAR {{variable_per_mwh}}/MWh generated, escalated annually at CPI.

**4. SLA.**
• Availability: {{guaranteed_availability_pct}}%
• Response time: ≤ {{response_hours}} hours for critical faults
• Planned outage: ≤ {{planned_outage_hours}} hours / year

**5. STATUTORY.** Operator is responsible for OHS compliance, SANS standards, and NERSA Grid Code.

**6. LIABILITY.** Capped at {{liability_cap_pct}}% of annual fee.

**7. GOVERNING LAW.** RSA.',
  '{"owner_name":"","operator_name":"","facility_name":"","capacity_mw":0,"technology":"solar_pv","term_years":10,"fixed_fee_annual":0,"variable_per_mwh":0,"guaranteed_availability_pct":98,"response_hours":4,"planned_outage_hours":96,"liability_cap_pct":50}'
);

-- ---- TEMPLATE 9 — ERPA / Carbon Sale & Purchase ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_erpa_001','ERPA-SA','Emission Reduction Purchase Agreement (ERPA)','carbon','carbon_purchase',
  'Forward purchase of verified carbon credits (VCUs / CERs / Gold Standard VERs) from a South African project.',
  'Carbon Tax Act 15/2019; Carbon Offsets Regulations; NEMA 107/1998; POPIA',
  '# EMISSION REDUCTION PURCHASE AGREEMENT (ERPA)

**SELLER:** {{seller_name}} ("Project Proponent")
**BUYER:** {{buyer_name}}

**1. PROJECT.** {{project_name}} — methodology {{methodology}} (e.g. ACM0002, VM0042, GS-TCS) registered under {{registry}}.

**2. VOLUME & VINTAGE.** Seller shall deliver {{tco2e_volume}} tCO₂e per annum, Vintage {{vintage_years}}.

**3. PRICE.** ZAR {{price_per_tco2e}} per tCO₂e, FOB registry transfer. Price escalation per Schedule.

**4. CARBON TAX OFFSET.** Where Buyer elects to use the credits to offset its Carbon Tax liability under the Carbon Tax Act 15 of 2019, Seller shall procure serialisation and retirement through the approved Carbon Offset Administration System.

**5. DELIVERY.** Transfer into Buyer''s account on {{registry}} within 10 business days of Verification. Title and risk pass on registry confirmation.

**6. WARRANTIES.** Additionality, no double-counting, environmental integrity, NEMA compliance.

**7. REVENUE SHARING.** {{ipp_carbon_share_pct}}% of Carbon Revenue shared with the generating IPP pursuant to the underlying PPA.

**8. POPIA.** Project documentation redacted of personal information per POPIA.

**9. GOVERNING LAW.** RSA. Arbitration AFSA; seat Johannesburg.',
  '{"seller_name":"","buyer_name":"","project_name":"","methodology":"VM0042","registry":"Verra","tco2e_volume":0,"vintage_years":"2024-2028","price_per_tco2e":0,"ipp_carbon_share_pct":20}'
);

-- ---- TEMPLATE 10 — Facility Agreement (Senior Debt) ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_facility_001','FACILITY-SA','Senior Secured Facility Agreement','financing','facility_agreement',
  'Project finance senior debt facility — LMA form, South African law.',
  'Banks Act 94/1990; FIC Act 38/2001; Companies Act 71/2008; National Credit Act 34/2005 [non-applicable exclusion]; Exchange Control Regulations',
  '# SENIOR SECURED FACILITY AGREEMENT

**BETWEEN** {{borrower_name}} (the "**Borrower**") **AND** {{lender_name}} (the "**Lender**") / the Lenders listed in Schedule 1.

**1. FACILITY.** Term loan facility of ZAR {{committed_amount}}, split into Tranche A (Construction) and Tranche B (Term).

**2. PURPOSE.** Project finance for the {{project_name}} ({{capacity_mw}} MW) facility.

**3. AVAILABILITY.** Availability Period until {{availability_end}}. Drawdown requests per Clause 4.

**4. INTEREST.** JIBAR + {{margin_bps}} bps, payable quarterly.

**5. REPAYMENT.** Amortising from {{first_repayment}} to {{final_maturity}}; target DSCR ≥ {{dscr_covenant}}.

**6. COVENANTS.**
• DSCR ≥ {{dscr_covenant}} (historic & projected);
• LLCR ≥ {{llcr_covenant}};
• Leverage ≤ {{leverage_covenant}}x;
• Reporting (monthly operational, quarterly financial, annual audited).

**7. SECURITY PACKAGE.** First-ranking mortgage bond over the project site; general notarial bond over movables; cession of contract receivables including PPA; cession of insurance proceeds; share pledge.

**8. CONDITIONS PRECEDENT.** Execution of PPA, EPC, O&M; NERSA licence; EIA RoD; equity commitment letter; legal opinions.

**9. EVENTS OF DEFAULT.** Payment default; covenant breach (with cure periods); insolvency; change of control; loss of licence.

**10. STATUTORY.** FIC Act 38/2001 CDD; Exchange Control Regulations for any offshore tranche; Banks Act 94/1990.

**11. GOVERNING LAW.** RSA.',
  '{"borrower_name":"","lender_name":"","project_name":"","capacity_mw":0,"committed_amount":0,"margin_bps":450,"availability_end":"","first_repayment":"","final_maturity":"","dscr_covenant":1.20,"llcr_covenant":1.35,"leverage_covenant":75}'
);

-- ---- TEMPLATE 11 — Intercreditor Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_intercreditor_001','INTERCREDITOR-SA','Intercreditor Agreement','financing','intercreditor',
  'Priority, waterfall and enforcement coordination between senior, mezzanine and hedging creditors.',
  'Insolvency Act 24/1936; Companies Act 71/2008; Security by Means of Movable Property Act 57/1993',
  '# INTERCREDITOR AGREEMENT

**AMONG** the Senior Lenders, Mezzanine Lenders, Hedge Counterparties and the Borrower.

**1. PRIORITY.** Payments from Project Accounts flow per the Project Waterfall: Opex → Senior Debt Service → DSRA → Mezz → Hedge settlements → Distributions.

**2. ENFORCEMENT.** Only Senior Lenders may direct enforcement until Senior Discharge. Mezzanine subject to standstill.

**3. TURNOVER.** Subordinated creditors turn over any amount received in breach of waterfall.

**4. AMENDMENTS.** Senior consent required for fundamental amendments.

**5. GOVERNING LAW.** RSA.',
  '{}'
);

-- ---- TEMPLATE 12 — Security Agreement (Cession in Securitatem Debiti) ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_security_001','SECURITY-SA','Security Agreement (Cession in Securitatem Debiti)','financing','security',
  'Cession of receivables (PPA revenue, carbon revenue, insurance proceeds) as security for the Facility Agreement.',
  'Security by Means of Movable Property Act 57/1993; Common law cession',
  '# SECURITY AGREEMENT — CESSION IN SECURITATEM DEBITI

**Cedent:** {{borrower_name}} — **Cessionary:** {{security_trustee}} (as trustee for the Senior Lenders).

**1. CESSION.** Cedent cedes in securitatem debiti to Cessionary all right, title and interest in and to the Ceded Claims, being all present and future receivables arising from (a) the PPA, (b) the ERPA, (c) Insurance Policies, (d) Project Bank Accounts.

**2. NOTICE.** Cedent shall give written notice of cession to each counterparty.

**3. RECONVEYANCE.** Upon Discharge, Cessionary reconveys the Ceded Claims.

**4. GOVERNING LAW.** RSA.',
  '{"borrower_name":"","security_trustee":""}'
);

-- ---- TEMPLATE 13 — Services Agreement (Generic) ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_services_001','SERVICES-SA','Professional Services Agreement','operations','services',
  'Generic services contract — Owner''s Engineer, Legal Counsel, Financial Advisor, Insurance Broker.',
  'OHS Act 85/1993; Companies Act 71/2008; POPIA; Consumer Protection Act 68/2008 (if applicable)',
  '# SERVICES AGREEMENT

**CLIENT:** {{client_name}} — **SERVICE PROVIDER:** {{service_provider_name}}

**1. SERVICES.** The Service Provider shall provide the services set out in Schedule 1 ("Scope of Services").

**2. FEES.** {{fee_structure}}; invoiced monthly in arrears, payable within 30 days.

**3. STANDARD OF CARE.** Professional standard, consistent with industry best practice.

**4. IP.** All Client IP remains with Client. Deliverables are Client-owned subject to payment.

**5. POPIA.** Service Provider is a Responsible Party / Operator (as applicable) per POPIA.

**6. LIABILITY.** Capped at fees paid in the preceding 12 months.

**7. TERM & TERMINATION.** {{term_months}} months; 30-day termination for convenience.

**8. GOVERNING LAW.** RSA.',
  '{"client_name":"","service_provider_name":"","fee_structure":"time_and_materials","term_months":12}'
);

-- ---- TEMPLATE 14 — Grid Connection Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_grid_conn_001','GRID-CONNECT-SA','Grid Connection Agreement','grid','grid_connection',
  'Agreement with Eskom / Municipal Network Operator regulating physical connection, testing and ongoing obligations.',
  'ERA 2006; NERSA Grid Code; NERSA Distribution Code; NRS 097-2-1/3; SANS 10142',
  '# GRID CONNECTION AGREEMENT

**NETWORK OPERATOR:** {{network_operator}} — **USER:** {{user_name}}

**1. CONNECTION WORKS.** Network Operator shall construct the Connection Works to a capacity of {{capacity_mva}} MVA at the {{substation}} in accordance with the approved Cost Estimate Letter ("CEL").

**2. CONNECTION CHARGES.** ZAR {{connection_charge}} payable per the CEL Milestones.

**3. COMPLIANCE.** User shall comply with NERSA Grid Code (RPPs, LVRT, reactive), NRS 097-2-1/3 and SANS 10142.

**4. COMMISSIONING.** Dynamic and static tests per NERSA Grid Code; no supply until Connection Certificate is issued.

**5. ACCESS.** Network Operator access to the point of connection at reasonable times.

**6. TERM.** Coterminous with the Generation Licence.

**7. GOVERNING LAW.** RSA.',
  '{"network_operator":"Eskom Holdings SOC Ltd","user_name":"","capacity_mva":0,"substation":"","connection_charge":0}'
);

-- ---- TEMPLATE 15 — Use-of-System (UoS) / Wheeling Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_uos_001','UOS-SA','Use-of-System (Wheeling) Agreement','grid','wheeling_agreement',
  'Use-of-system agreement with Eskom Transmission / Distribution for wheeling energy between generator and off-taker.',
  'ERA 2006; NERSA Wheeling Framework; Eskom Tariff Book; NERSA Loss Factor Methodology',
  '# USE-OF-SYSTEM (WHEELING) AGREEMENT

**NETWORK OPERATOR:** {{network_operator}} — **USER:** {{user_name}}

**1. SCOPE.** User may wheel up to {{wheeling_capacity_mw}} MW of energy from the Generation Source ({{generator}}) to the Delivery Point ({{delivery_point}}) using the Network Operator''s system.

**2. CHARGES.** UoS charges per the current NERSA-approved Network-Services Tariff, as applied to Eskom Tariff Book, plus network losses.

**3. METERING.** Generation and consumption metered to NERSA Metering Code.

**4. LOSSES.** Losses allocated as per Loss Factor Methodology then in force.

**5. CURTAILMENT.** System operator may curtail for network-security or NRS 048-9 load-shedding events.

**6. TERM.** Coterminous with the PPA.

**7. GOVERNING LAW.** RSA.',
  '{"network_operator":"","user_name":"","wheeling_capacity_mw":0,"generator":"","delivery_point":""}'
);

-- ---- TEMPLATE 16 — Net-Metering / Small-Scale Embedded Generation ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_netmeter_001','NETMETER-SA','Net-Metering / SSEG Agreement','grid','offtake_agreement',
  'Small-Scale Embedded Generation agreement with Municipality / Eskom allowing bidirectional energy flow.',
  'NERSA Small-Scale Embedded Generation Rules 2022; NRS 097-2-3; SANS 10142-1-2',
  '# SSEG / NET-METERING AGREEMENT

**MUNICIPALITY / DISTRIBUTOR:** {{distributor}} — **CUSTOMER:** {{customer}}

**1. GENERATION CAPACITY.** {{installed_kwp}} kWp SSEG installation at {{site_address}} registered under NERSA Registration No. {{nersa_reg_no}}.

**2. EXPORT COMPENSATION.** Energy exported to the Network is compensated at ZAR {{export_tariff}}/kWh (or credited to the Customer''s bill as per Municipal tariff determination).

**3. TECHNICAL COMPLIANCE.** SSEG unit must comply with NRS 097-2-3, SANS 10142-1-2 and have a Certificate of Compliance.

**4. METERING.** Bi-directional AMI meter installed at Distributor''s cost / Customer''s cost per Tariff.

**5. GOVERNING LAW.** RSA.',
  '{"distributor":"","customer":"","installed_kwp":0,"site_address":"","nersa_reg_no":"","export_tariff":0}'
);

-- ---- TEMPLATE 17 — Joint Venture / Shareholders Agreement ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_jv_001','JV-SA','Joint Venture / Shareholders Agreement','governance','jv_shareholders',
  'Shareholders agreement for a Project Company — governance, reserved matters, deadlock, exits, B-BBEE.',
  'Companies Act 71/2008; B-BBEE Act 53/2003; Competition Act 89/1998; Exchange Control Regulations',
  '# SHAREHOLDERS AGREEMENT — {{projectco_name}}

**PARTIES:** {{party_a}} ({{party_a_pct}}%) and {{party_b}} ({{party_b_pct}}%), together the Shareholders of {{projectco_name}} (Reg No. {{projectco_reg}}).

**1. PURPOSE.** To develop, construct, finance, own and operate the {{project_name}} project.

**2. GOVERNANCE.** Board of {{board_size}} directors, {{party_a_board}} nominated by Party A and {{party_b_board}} by Party B. Quorum: representatives of both Shareholders.

**3. RESERVED MATTERS.** Supermajority (>{{reserved_threshold_pct}}%) required for: PPA/EPC amendments, new debt, dividends, related-party transactions, change of auditors.

**4. B-BBEE.** Party A undertakes to maintain a B-BBEE Level {{target_bbbee_level}} contributor status.

**5. TRANSFERS.** ROFR → Tag-along → Drag-along. No transfer to Competitors.

**6. DEADLOCK.** Escalation → mediation → Russian Roulette / Shotgun.

**7. NON-COMPETE.** Each Shareholder shall not compete with the Project within the Relevant Territory for the duration of shareholding and for 2 years thereafter, subject to Competition Act 89/1998.

**8. GOVERNING LAW.** RSA.',
  '{"projectco_name":"","party_a":"","party_b":"","party_a_pct":50,"party_b_pct":50,"projectco_reg":"","project_name":"","board_size":4,"party_a_board":2,"party_b_board":2,"reserved_threshold_pct":75,"target_bbbee_level":2}'
);

-- ---- TEMPLATE 18 — Heads of Agreement (HoA) ----
INSERT OR REPLACE INTO contract_templates (id, code, name, category, document_type, description, sa_law_references, template_body, variables_json) VALUES (
  'tpl_hoa_001','HOA-SA','Heads of Agreement','preliminary','hoa',
  'Heads of Agreement — pre-long-form commercial agreement memorialising principal terms.',
  'Common law',
  '# HEADS OF AGREEMENT — {{transaction_type}}

**PARTIES:** {{party_a}} and {{party_b}}
**PROJECT / TRANSACTION:** {{project_name}}
**DATE:** {{date}}

**1. KEY COMMERCIAL TERMS.** See Schedule 1.
**2. CONDITIONS PRECEDENT.** FC, Board approvals, NERSA, Competition Commission, NEMA EIA.
**3. EXCLUSIVITY.** {{exclusivity_days}} days.
**4. CONFIDENTIALITY.** Binding; POPIA compliant.
**5. LONG-FORM DRAFTING.** Target execution: {{longform_target}}.
**6. GOVERNING LAW.** RSA.

Save for clauses 3, 4 and 6, this HoA is non-binding.',
  '{"transaction_type":"","party_a":"","party_b":"","project_name":"","date":"","exclusivity_days":60,"longform_target":""}'
);
