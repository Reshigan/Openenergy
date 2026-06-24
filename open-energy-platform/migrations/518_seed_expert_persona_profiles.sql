-- ═══════════════════════════════════════════════════════════════════════
-- 518_seed_expert_persona_profiles.sql
-- Demo seed: enrich the 11 demo personas to SENIOR-EXPERT grade profiles
--
-- DEMO-ONLY. Targets the open-energy-db demo database. NEVER run against the
-- live cec-energy-db (prod, read-only).
--
-- These 11 demo_*_001 rows already exist (seeded thin by 003_seed.sql,
-- 012_support_role.sql and 494_seed_personas_and_contracts.sql). This
-- migration only fills the thin profile columns (job_title, bio, phone,
-- org_website, org_reg_num, subscription_tier) and normalises status/kyc/
-- verification flags. It does NOT touch password_hash, id, email, role or
-- bbbee_level (existing realistic levels preserved).
--
-- Idempotent: every statement is a plain UPDATE keyed on the existing id,
-- so re-running converges to the same state. No schema changes, no INSERTs.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Admin — demo_admin_001 — System Admin / Open Energy Platform ─────────
UPDATE participants SET
  job_title         = 'Platform Administrator',
  bio               = 'Platform owner and super-administrator for the Open Energy exchange. 15+ years in energy-sector IT operations and identity governance, with deep familiarity of POPIA data-handling and ISO 27001 controls. Maintains tenant isolation, role provisioning and the regulatory audit chain.',
  phone             = '+27 82 451 0099',
  org_website       = 'https://www.openenergy.co.za',
  org_reg_num       = '2019/004821/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_admin_001';

-- ── Trader — demo_trader_001 — Sipho Mkhize / Mkhize Energy Traders ──────
UPDATE participants SET
  job_title         = 'Head of Power Trading',
  bio               = 'Heads the power-trading desk at Mkhize Energy Traders with 14 years across the Southern African Power Pool and SA bilateral market. CFA charterholder; FSCA-registered representative under FAIS. Runs day-ahead, intraday and structured PPA hedging books with disciplined pre-trade credit and exposure controls.',
  phone             = '+27 83 612 7741',
  org_website       = 'https://www.mkhizetraders.co.za',
  org_reg_num       = '2014/118734/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_trader_001';

-- ── IPP (solar) — demo_ipp_001 — Johan van der Berg / RenewCo Solar ──────
UPDATE participants SET
  job_title         = 'Managing Director, Project Development',
  bio               = 'Managing Director leading RenewCo Solar''s utility-scale development pipeline. Pr.Eng registered with ECSA and 18 years in renewable project finance; closed multiple REIPPPP bid-window 4 and BW7 solar projects to financial close. Fluent in NERSA Section 34 determinations, IE certification and DvP settlement.',
  phone             = '+27 82 904 3318',
  org_website       = 'https://www.renewcosolar.co.za',
  org_reg_num       = '2011/072145/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_ipp_001';

-- ── IPP (wind) — demo_ipp_002 — Lerato Moloto / WindCapital ──────────────
UPDATE participants SET
  job_title         = 'Director, Asset Management & Operations',
  bio               = 'Director of asset management at WindCapital, overseeing a 400MW+ operating wind portfolio across Limpopo and the Eastern Cape. 16 years in renewables; Pr.Eng (ECSA) with an MBA. Drives availability-guarantee enforcement, O&M contractor performance and carbon-credit origination under Gold Standard.',
  phone             = '+27 84 227 6650',
  org_website       = 'https://www.windcapital.co.za',
  org_reg_num       = '2012/089463/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_ipp_002';

-- ── Carbon — demo_carbon_001 — Anita Naidoo / GreenFunds Carbon Fund ─────
UPDATE participants SET
  job_title         = 'Head of Carbon Origination',
  bio               = 'Leads carbon origination and ERPA structuring at GreenFunds, with 13 years across voluntary and Article 6 markets. Verra VCS and Gold Standard validated developer; manages buffer-pool integrity, corresponding adjustments and Carbon Tax Act offset eligibility via the DFFE DNA. Closes forward-delivery and make-good carbon deals.',
  phone             = '+27 83 338 9027',
  org_website       = 'https://www.greenfunds.co.za',
  org_reg_num       = '2016/043910/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_carbon_001';

-- ── Offtaker — demo_offtaker_001 — Thabo Molefe / City Energy Municipality
UPDATE participants SET
  job_title         = 'Group Energy Procurement Lead',
  bio               = 'Leads energy procurement for City Energy Municipality, contracting a diversified renewable PPA portfolio to displace Eskom bulk supply. 15 years in municipal energy and demand-side management; familiar with NERSA wheeling frameworks, take-or-pay structuring and REC retirement for Scope 2 market-based accounting.',
  phone             = '+27 82 776 1140',
  org_website       = 'https://www.cityenergy.gov.za',
  org_reg_num       = '2003/011298/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_offtaker_001';

-- ── Lender — demo_lender_001 — Pieter van Zyl / Infrastructure Capital ───
UPDATE participants SET
  job_title         = 'Director, Project & Infrastructure Finance',
  bio               = 'Director of project and infrastructure finance at Infrastructure Capital Partners, with 20 years arranging senior secured debt for SA renewable IPPs. CFA charterholder; applies Equator Principles (EP4), SARB large-exposure (BA 600) and LMA covenant frameworks across multi-billion-rand REIPPPP facilities.',
  phone             = '+27 83 559 2208',
  org_website       = 'https://www.infracapitalpartners.co.za',
  org_reg_num       = '2008/026517/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_lender_001';

-- ── Grid — demo_grid_001 — Nomsa Dlamini / Eskom Holdings ────────────────
UPDATE participants SET
  job_title         = 'System Operations Manager',
  bio               = 'System Operations Manager within the National Transmission Company SA, with 17 years in grid control and dispatch. Pr.Eng (ECSA); expert in NERSA Grid Code, NRS 097 connection requirements, ancillary-services procurement and load-curtailment (CSC-1) governance. Manages connection queues and capacity allocation at GW scale.',
  phone             = '+27 82 318 4477',
  org_website       = 'https://www.ntcsa.co.za',
  org_reg_num       = '2021/735406/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_grid_001';

-- ── Regulator — demo_regulator_001 — Kagiso Tlhotlhalemaje / NERSA ───────
UPDATE participants SET
  job_title         = 'Senior Manager, Electricity Regulation',
  bio               = 'Senior Manager for electricity regulation, with 16 years adjudicating generation licences, Section 34 determinations and MYPD tariff decisions under ERA 4 of 2006. Admitted attorney; oversees public-participation processes, compliance inspections and enforcement, and the regulator inbox for cross-sector escalations.',
  phone             = '+27 82 640 5512',
  org_website       = 'https://www.nersa.org.za',
  org_reg_num       = '2005/009127/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_regulator_001';

-- ── ESCO — demo_esco_001 — Zanele Khumalo / SunServ O&M ──────────────────
UPDATE participants SET
  job_title         = 'O&M Operations Director',
  bio               = 'Operations Director at SunServ O&M, responsible for the maintenance of 600MW+ of solar and wind assets. 14 years in renewable O&M; Pr.Eng (ECSA) applying IEC 61724 and IEC 61400 performance standards. Drives predictive maintenance, availability-guarantee compliance and liquidated-damages exposure management.',
  phone             = '+27 83 471 8806',
  org_website       = 'https://www.sunserv.co.za',
  org_reg_num       = '2017/061204/07',
  subscription_tier = 'enterprise',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_esco_001';

-- ── EPC — demo_epc_001 — Andile Bhengu / BuildSA Energy EPC ──────────────
UPDATE participants SET
  job_title         = 'Construction Director',
  bio               = 'Construction Director at BuildSA Energy EPC, delivering utility-scale solar and BESS projects under FIDIC Silver Book terms. 18 years in EPC delivery; Pr.Eng (ECSA) with CIDB grade 9CE. Manages fixed-price lump-sum delivery, longstop-COD liquidated damages and performance guarantees against P90 generation.',
  phone             = '+27 82 905 6633',
  org_website       = 'https://www.buildsaenergy.co.za',
  org_reg_num       = '2013/094872/07',
  subscription_tier = 'professional',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_epc_001';

-- ── Support — demo_support_001 — Openenergy Support / Openenergy Platform ─
UPDATE participants SET
  job_title         = 'Platform Support Lead',
  bio               = 'Leads the Open Energy platform support desk, running ITIL-aligned incident, problem and change workflows with priority-tiered SLAs. 10 years in fintech and energy-platform operations; first point of escalation for participant onboarding, KYC queries and trading-desk technical issues.',
  phone             = '+27 82 200 4410',
  org_website       = 'https://www.openenergy.co.za',
  org_reg_num       = '2019/004821/07',
  subscription_tier = 'professional',
  kyc_status        = 'approved',
  status            = 'active',
  email_verified    = 1,
  onboarding_completed = 1,
  updated_at        = datetime('now')
WHERE id = 'demo_support_001';
