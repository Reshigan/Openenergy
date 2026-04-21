-- ============================================================================
-- OPEN ENERGY PLATFORM — Contract Signatory Roster for Demo Contracts
-- Migration 006
-- ----------------------------------------------------------------------------
-- Registers the required signatories on each seeded contract so the contract
-- detail page can show a real signing roster and the /contracts/:id/sign flow
-- (already implemented in src/routes/contracts.ts) resolves the caller.
--
-- Seeding pattern per contract:
--   • two signatories — one per party (creator + counterparty)
--   • already-executed contracts (phase='active') ship pre-signed by both
--   • legal_review contracts ship pre-signed only by the creator (so the
--     counterparty still has something to sign in the demo)
--   • LOI / term-sheet contracts use a single countersign from the counterparty
-- ============================================================================

-- ---- EXECUTED CONTRACTS (fully signed on both sides) ------------------------
INSERT OR IGNORE INTO document_signatories (
  id, document_id, participant_id, signatory_name, signatory_designation, signed, signed_at, document_hash_at_signing
) VALUES
-- doc_001 Klerksdorp Solar PPA (phase=active)
('sig_001a','doc_001','demo_ipp_001','Johan van der Berg','Chief Executive Officer, RenewCo Solar (Pty) Ltd',1,'2025-09-12 10:30:00','sha256:8f3a1c9b2d7e4f11'),
('sig_001b','doc_001','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',1,'2025-09-15 14:22:00','sha256:2b7c9f1e8a4d6302'),
-- doc_002 Mookgopong Wind PPA (phase=active)
('sig_002a','doc_002','demo_ipp_002','Lerato Moloto','Managing Director, WindCapital (Pty) Ltd',1,'2025-07-08 09:15:00','sha256:a1c3e5b7d9f02468'),
('sig_002b','doc_002','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',1,'2025-07-10 16:05:00','sha256:4d6f8a2c0e7b1359'),
-- doc_005 Jeffreys Bay Wind Wheeling (phase=active)
('sig_005a','doc_005','demo_ipp_002','Lerato Moloto','Managing Director, WindCapital (Pty) Ltd',1,'2025-11-22 11:45:00','sha256:9b2e4f7a1c5d8036'),
('sig_005b','doc_005','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',1,'2025-11-25 13:10:00','sha256:3e7c0a5b8d2f4691');

-- ---- CONTRACTS AWAITING OFFTAKER COUNTERSIGN (creator signed; offtaker owes) -
INSERT OR IGNORE INTO document_signatories (
  id, document_id, participant_id, signatory_name, signatory_designation, signed, signed_at, document_hash_at_signing
) VALUES
-- doc_003 Term Sheet Brits Rooftop (phase=hoa) — only counterparty needs to sign
('sig_003a','doc_003','demo_ipp_001','Johan van der Berg','Chief Executive Officer, RenewCo Solar (Pty) Ltd',1,'2026-03-18 08:00:00','sha256:7a9c1e3b5d7f9024'),
('sig_003b','doc_003','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',0,NULL,NULL),
-- doc_004 De Aar Solar PPA Wheeling (phase=legal_review) — creator signed, counterparty to sign
('sig_004a','doc_004','demo_ipp_001','Johan van der Berg','Chief Executive Officer, RenewCo Solar (Pty) Ltd',1,'2026-04-10 14:30:00','sha256:5c8d0e2a4b6f8013'),
('sig_004b','doc_004','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',0,NULL,NULL),
-- doc_006 Gqeberha Wind PPA (phase=legal_review)
('sig_006a','doc_006','demo_ipp_002','Lerato Moloto','Managing Director, WindCapital (Pty) Ltd',1,'2026-04-14 09:45:00','sha256:6b9d1f3c5e7a9024'),
('sig_006b','doc_006','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',0,NULL,NULL),
-- doc_007 LOI Upington CSP (phase=legal_review) — offtaker drafted, IPP to countersign
('sig_007a','doc_007','demo_ipp_001','Johan van der Berg','Chief Executive Officer, RenewCo Solar (Pty) Ltd',0,NULL,NULL),
('sig_007b','doc_007','demo_offtaker_001','Thabo Molefe','Head of Energy Procurement, City Energy Municipality',1,'2026-04-12 11:20:00','sha256:2f4a6c8e0b1d3579');

-- ---- BACKFILL TEMPLATE REFERENCES ON LEGACY CONTRACTS -----------------------
-- Phase-aligned PPA-BTM template for doc_001 / doc_002 (seeded in 003 without template_code)
UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'), '$.template_code', 'PPA-BTM-SA')
WHERE id IN ('doc_001','doc_002') AND commercial_terms NOT LIKE '%template_code%';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'), '$.template_code', 'TERM-SHEET-SA')
WHERE id = 'doc_003' AND commercial_terms NOT LIKE '%template_code%';

-- ---- LOCATION METADATA for body interpolation -------------------------------
UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'Klerksdorp, North West Province',
  '$.seller_reg', '2019/123456/07',
  '$.buyer_reg', '1999/000087/09')
WHERE id = 'doc_001';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'Mookgopong, Limpopo',
  '$.seller_reg', '2020/555112/07',
  '$.buyer_reg', '1999/000087/09')
WHERE id = 'doc_002';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'Brits, North West Province',
  '$.seller_reg', '2019/123456/07',
  '$.buyer_reg', '1999/000087/09')
WHERE id = 'doc_003';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'De Aar, Northern Cape',
  '$.seller_reg', '2019/123456/07',
  '$.buyer_reg', '1999/000087/09',
  '$.energy_type', 'solar_pv',
  '$.carbon_share', '25')
WHERE id = 'doc_004';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'Jeffreys Bay, Eastern Cape',
  '$.seller_reg', '2020/555112/07',
  '$.buyer_reg', '1999/000087/09',
  '$.energy_type', 'onshore_wind',
  '$.carbon_share', '30')
WHERE id = 'doc_005';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'Gqeberha, Eastern Cape',
  '$.seller_reg', '2020/555112/07',
  '$.buyer_reg', '1999/000087/09',
  '$.energy_type', 'onshore_wind',
  '$.carbon_share', '20')
WHERE id = 'doc_006';

UPDATE contract_documents
SET commercial_terms = json_set(COALESCE(commercial_terms, '{}'),
  '$.location', 'Upington, Northern Cape',
  '$.seller_reg', '2019/123456/07',
  '$.buyer_reg', '1999/000087/09',
  '$.energy_type', 'csp')
WHERE id = 'doc_007';
