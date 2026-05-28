-- Wave 61 — Lender Loan Transfer / Secondary Participation & Syndication seed.
-- 10 transfers ltr_001..ltr_010 spanning 10 distinct lifecycle states, all five
-- transferred-participation tiers (two per tier), both residencies, and the
-- screening / remediation / consent / regulatory / certificate / settlement /
-- reject branches. The transferor + facility agent drive the machinery; the
-- obligor (borrower) consents.
--
-- Reportable rows (is_reportable = non_resident OR large tier):
--   ltr_003 (moderate non_resident), ltr_005 (material non_resident),
--   ltr_006 (material non_resident), ltr_007 (major resident — large),
--   ltr_008 (major non_resident — both), ltr_009 (systemic resident — large),
--   ltr_010 (systemic non_resident — both).
-- Regulator crossings shown in the event log: ltr_006 approve_transfer to a
-- NON-RESIDENT transferee (SARB Exchange Control — crosses for EVERY tier, the
-- W61 signature), ltr_009 complete of a systemic transfer (Banks Act large-
-- exposure re-aggregation) and ltr_010 fail_screening (FIC sanctions/AML —
-- crosses for EVERY tier).

INSERT OR IGNORE INTO oe_loan_transfers (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  transferor_party_id, transferor_party_name, transferee_party_id, transferee_party_name,
  agent_party_id, agent_party_name, obligor_party_id, obligor_party_name,
  facility_code, facility_name, transfer_type, tranche, borrower_project, facility_currency,
  facility_total_zar_m, transfer_zar_m, transfer_price_pct, settlement_zar_m, transfer_tier,
  transferee_residency, transferee_epfi,
  kyc_cleared, sanctions_cleared, obligor_consent_granted, sarb_approval_required, sarb_approval_obtained, certificate_signed, register_updated,
  request_basis, screening_basis, remediation_basis, consent_basis, regulatory_basis, approval_basis, certificate_basis, settlement_basis, rejection_basis, decline_basis, withdrawal_basis, reason_code,
  remediation_round,
  chain_status, transfer_requested_at, kyc_screening_at, screening_remediation_at, consent_solicitation_at, regulatory_review_at, transfer_approved_at, certificate_executed_at, settled_at, completed_at, declined_at, rejected_at, withdrawn_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- ltr_001 minor / transfer_requested — resident bank-to-bank participation just requested
('ltr_001','LOAN-XFER-2026-0001','lender.secondary_transfer','credit_facility','fac_karoo_term','W53',
 'lend_absa','Absa CIB','lend_nedbank','Nedbank CIB',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_karoo','Karoo Solar One RF (Pty) Ltd',
 'FAC-KAROO-TERM','Karoo Solar One Senior Term Facility','assignment','term','Karoo Solar One','ZAR',
 850.0,45.0,99.5,44.78,'minor',
 'resident',1,
 0,0,0,0,0,0,0,
 'Transferor requests assignment of a minor senior-term participation to an incoming resident bank lender.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'secondary_transfer_request',
 0,
 'transfer_requested','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-28 09:00:00',0,'demo_lender_001'),

-- ltr_002 minor / kyc_screening — resident transferee under KYC/sanctions screening; SLA BREACHED
('ltr_002','LOAN-XFER-2026-0002','lender.secondary_transfer','credit_facility','fac_capewind_rev',NULL,
 'lend_nedbank','Nedbank CIB','lend_rmb','Rand Merchant Bank',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_capewind','Cape West Wind RF (Pty) Ltd',
 'FAC-CAPEWIND-REV','Cape West Wind Revolving Facility','sub_participation','revolving','Cape West Wind','ZAR',
 620.0,80.0,100.0,80.0,'minor',
 'resident',1,
 0,0,0,0,0,0,0,
 'Transferor requests a minor sub-participation to an incoming resident bank.','KYC / sanctions screening of the incoming lender in progress under FIC Act 38 of 2001.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'kyc_screening',
 0,
 'kyc_screening','2026-05-20 09:00:00','2026-05-22 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-25 10:00:00',1,'demo_lender_001'),

-- ltr_003 moderate / screening_remediation — NON-RESIDENT DFI; KYC gap remediation loop (REPORTABLE: non_resident)
('ltr_003','LOAN-XFER-2026-0003','lender.secondary_transfer','credit_facility','fac_solar_north',NULL,
 'lend_rmb','Rand Merchant Bank','lend_proparco','Proparco SA',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_solarnorth','Solar North Cluster RF (Pty) Ltd',
 'FAC-SOLARNORTH-TERM','Solar North Cluster Senior Term Facility','funded_participation','term','Solar North Cluster','ZAR',
 1400.0,250.0,98.75,246.88,'moderate',
 'non_resident',1,
 0,0,0,1,0,0,0,
 'Transferor requests a moderate funded participation to a non-resident development finance institution.','Initial KYC screening flagged an ultimate-beneficial-owner documentation gap on the incoming DFI.','Remediation requested: incoming lender to supply updated UBO register and source-of-funds attestation before screening can be re-run.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'kyc_remediation',
 1,
 'screening_remediation','2026-05-14 09:00:00','2026-05-16 10:00:00','2026-05-21 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-28 11:00:00',0,'demo_lender_001'),

-- ltr_004 moderate / consent_solicitation — resident transferee cleared screening; obligor consent being solicited
('ltr_004','LOAN-XFER-2026-0004','lender.secondary_transfer','credit_facility','fac_battery_one',NULL,
 'lend_stanbic','Standard Bank CIB','lend_investec','Investec Bank',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_batteryone','Battery One Storage RF (Pty) Ltd',
 'FAC-BATTERYONE-TERM','Battery One Storage Term Facility','novation','term','Battery One Storage','ZAR',
 980.0,320.0,99.0,316.8,'moderate',
 'resident',1,
 1,1,0,0,0,0,0,
 'Transferor requests a moderate novation to an incoming resident bank.','KYC / sanctions screening cleared.',NULL,'Obligor consent being solicited: the borrower is reviewing the proposed incoming lender and novation terms under the facility agreement consent provisions.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'obligor_consent_solicitation',
 0,
 'consent_solicitation','2026-05-10 09:00:00','2026-05-12 10:00:00',NULL,'2026-05-18 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-28 11:00:00',0,'demo_lender_001'),

-- ltr_005 material / regulatory_review — NON-RESIDENT DFI in SARB exchange-control review (REPORTABLE: non_resident)
('ltr_005','LOAN-XFER-2026-0005','lender.secondary_transfer','credit_facility','fac_redstone_csp',NULL,
 'lend_nedbank','Nedbank CIB','lend_fmo','FMO Entrepreneurial Development Bank',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_redstone','Redstone CSP RF (Pty) Ltd',
 'FAC-REDSTONE-TERM','Redstone CSP Senior Term Facility','funded_participation','term','Redstone CSP','ZAR',
 4200.0,900.0,98.5,886.5,'material',
 'non_resident',1,
 1,1,1,1,0,0,0,
 'Transferor requests a material funded participation to a non-resident development finance institution.','KYC / sanctions screening cleared.',NULL,'Obligor consent granted.','SARB exchange-control review under way: transfer of a loan participation to a non-resident lender requires Financial Surveillance Department approval before the transfer certificate can be executed.',NULL,NULL,NULL,NULL,NULL,NULL,'sarb_exchange_control_review',
 0,
 'regulatory_review','2026-05-02 09:00:00','2026-05-05 10:00:00',NULL,'2026-05-10 11:00:00','2026-05-16 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-29 09:00:00',0,'demo_lender_001'),

-- ltr_006 material / transfer_approved — NON-RESIDENT approved by SARB (REPORTABLE: approve_transfer to non_resident crosses for EVERY tier — the W61 signature)
('ltr_006','LOAN-XFER-2026-0006','lender.secondary_transfer','credit_facility','fac_kathu_solar',NULL,
 'lend_absa','Absa CIB','lend_ifc','International Finance Corporation',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_kathu','Kathu Solar Park RF (Pty) Ltd',
 'FAC-KATHU-TERM','Kathu Solar Park Senior Term Facility','funded_participation','term','Kathu Solar Park','ZAR',
 5600.0,1500.0,98.25,1473.75,'material',
 'non_resident',1,
 1,1,1,1,1,0,0,
 'Transferor requests a material funded participation to a non-resident development finance institution.','KYC / sanctions screening cleared.',NULL,'Obligor consent granted.','SARB exchange-control review completed.','SARB Financial Surveillance Department approved the transfer to the non-resident lender; approval notified to the supervisor as a reportable exchange-control event.',NULL,NULL,NULL,NULL,NULL,'sarb_approval_obtained',
 0,
 'transfer_approved','2026-04-24 09:00:00','2026-04-27 10:00:00',NULL,'2026-05-02 11:00:00','2026-05-08 09:00:00','2026-05-20 14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-30 14:00:00',0,'demo_lender_001'),

-- ltr_007 major / certificate_executed — resident large transfer; LMA Transfer Certificate executed (REPORTABLE: large tier)
('ltr_007','LOAN-XFER-2026-0007','lender.secondary_transfer','credit_facility','fac_msenge_wind',NULL,
 'lend_stanbic','Standard Bank CIB','lend_dbsa','Development Bank of Southern Africa',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_msenge','Msenge Emoyeni Wind RF (Pty) Ltd',
 'FAC-MSENGE-TERM','Msenge Emoyeni Wind Senior Term Facility','novation','term','Msenge Emoyeni Wind','ZAR',
 9800.0,4500.0,99.25,4466.25,'major',
 'resident',1,
 1,1,1,0,0,1,0,
 'Transferor requests a major novation to an incoming resident development finance institution.','KYC / sanctions screening cleared.',NULL,'Obligor consent granted.','No SARB approval required for a resident transferee.','Transfer approved by the facility agent.','LMA Transfer Certificate executed by the transferor, transferee and facility agent; effective date set for settlement.',NULL,NULL,NULL,NULL,'certificate_executed',
 0,
 'certificate_executed','2026-04-16 09:00:00','2026-04-19 10:00:00',NULL,'2026-04-24 11:00:00','2026-04-30 09:00:00','2026-05-06 14:00:00','2026-05-22 10:00:00',NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-29 10:00:00',0,'demo_lender_001'),

-- ltr_008 major / settled — NON-RESIDENT large transfer settled (REPORTABLE: non_resident + large)
('ltr_008','LOAN-XFER-2026-0008','lender.secondary_transfer','credit_facility','fac_oya_hybrid',NULL,
 'lend_rmb','Rand Merchant Bank','lend_afdb','African Development Bank',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_oya','Oya Energy Hybrid RF (Pty) Ltd',
 'FAC-OYA-TERM','Oya Energy Hybrid Senior Term Facility','funded_participation','term','Oya Energy Hybrid','ZAR',
 12400.0,7200.0,98.0,7056.0,'major',
 'non_resident',1,
 1,1,1,1,1,1,1,
 'Transferor requests a major funded participation to a non-resident development finance institution.','KYC / sanctions screening cleared.',NULL,'Obligor consent granted.','SARB exchange-control review completed.','SARB approved the transfer to the non-resident lender.','LMA Transfer Certificate executed.','Cash settlement of the transferred participation completed; transferee funded the purchase price and the agent updated the participations ledger.',NULL,NULL,NULL,'settlement_completed',
 0,
 'settled','2026-04-06 09:00:00','2026-04-09 10:00:00',NULL,'2026-04-14 11:00:00','2026-04-20 09:00:00','2026-04-28 14:00:00','2026-05-08 10:00:00','2026-05-24 11:00:00',NULL,NULL,NULL,NULL,
 1,'2026-05-30 11:00:00',0,'demo_lender_001'),

-- ltr_009 systemic / completed — resident systemic transfer completed (REPORTABLE: large; complete crosses Banks Act large-exposure)
('ltr_009','LOAN-XFER-2026-0009','lender.secondary_transfer','credit_facility','fac_grid_battery_fleet',NULL,
 'lend_absa','Absa CIB','lend_stanbic','Standard Bank CIB',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_gridbattery','Grid Battery Fleet RF (Pty) Ltd',
 'FAC-GRIDBATTERY-TERM','Grid Battery Fleet Portfolio Facility','novation','term','Grid Battery Fleet','ZAR',
 24000.0,12000.0,99.5,11940.0,'systemic',
 'resident',1,
 1,1,1,0,0,1,1,
 'Transferor requests a systemic novation to an incoming resident bank.','KYC / sanctions screening cleared.',NULL,'Obligor consent granted.','No SARB approval required for a resident transferee.','Transfer approved by the facility agent.','LMA Transfer Certificate executed.','Cash settlement completed; transfer completed and the lender of record updated on the register. Completion of a systemic transfer re-aggregates a single-counterparty exposure and was notified under the Banks Act large-exposure framework.',NULL,NULL,NULL,'transfer_completed',
 0,
 'completed','2026-03-20 09:00:00','2026-03-23 10:00:00',NULL,'2026-03-28 11:00:00','2026-04-03 09:00:00','2026-04-10 14:00:00','2026-04-18 10:00:00','2026-04-28 11:00:00','2026-05-12 16:00:00',NULL,NULL,NULL,
 1,NULL,0,'demo_lender_001'),

-- ltr_010 systemic / rejected — NON-RESIDENT failed KYC/sanctions screening (REPORTABLE: fail_screening crosses FIC for EVERY tier)
('ltr_010','LOAN-XFER-2026-0010','lender.secondary_transfer','credit_facility','fac_coastal_wind_portfolio',NULL,
 'lend_nedbank','Nedbank CIB','lend_offshore_spv','Offshore Energy Credit SPV Ltd',
 'lend_sbsa','Standard Bank CIB (Facility Agent)','ipp_coastalwind','Coastal Wind Portfolio RF (Pty) Ltd',
 'FAC-COASTALWIND-TERM','Coastal Wind Portfolio Senior Term Facility','funded_participation','term','Coastal Wind Portfolio','ZAR',
 28000.0,18000.0,97.5,17550.0,'systemic',
 'non_resident',0,
 0,0,0,1,0,0,0,
 'Transferor requests a systemic funded participation to a non-resident credit vehicle.','KYC / sanctions screening of the incoming lender returned a sanctions-list match against a controlling party of the offshore vehicle.',NULL,NULL,NULL,NULL,NULL,NULL,'Screening failed: a sanctions-list match against a controlling party of the incoming non-resident vehicle. Transfer rejected and filed with the FIC as a reportable sanctions hit; the participation remains with the transferor.',NULL,NULL,'sanctions_screening_failure',
 0,
 'rejected','2026-04-28 09:00:00','2026-05-02 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-10 11:00:00',NULL,
 1,NULL,0,'demo_lender_001');

-- Events (transition log). Full clean arcs for ltr_008/ltr_009, the SARB
-- approval crossing for ltr_006, the KYC remediation loop for ltr_003, the
-- screening-failure reject for ltr_010, and progression markers for the rest.
-- The transferor requests + settles + withdraws; the facility agent drives the
-- machinery; the obligor consents.
INSERT OR IGNORE INTO oe_loan_transfers_events (
  id, transfer_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('ltr_evt_001','ltr_001','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_absa','transferor','Minor senior-term assignment requested to an incoming resident bank','2026-05-26 09:00:00'),
('ltr_evt_002','ltr_002','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_nedbank','transferor','Minor sub-participation requested','2026-05-20 09:00:00'),
('ltr_evt_003','ltr_002','loan_transfer.kyc_screening','transfer_requested','kyc_screening','lend_sbsa','agent','KYC / sanctions screening opened on the incoming lender','2026-05-22 10:00:00'),
('ltr_evt_004','ltr_003','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_rmb','transferor','Moderate funded participation requested to a non-resident DFI','2026-05-14 09:00:00'),
('ltr_evt_005','ltr_003','loan_transfer.kyc_screening','transfer_requested','kyc_screening','lend_sbsa','agent','KYC / sanctions screening opened','2026-05-16 10:00:00'),
('ltr_evt_006','ltr_003','loan_transfer.screening_remediation','kyc_screening','screening_remediation','lend_sbsa','agent','Remediation requested: UBO documentation gap on the incoming DFI','2026-05-21 11:00:00'),
('ltr_evt_007','ltr_004','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_stanbic','transferor','Moderate novation requested','2026-05-10 09:00:00'),
('ltr_evt_008','ltr_004','loan_transfer.kyc_screening','transfer_requested','kyc_screening','lend_sbsa','agent','KYC screening opened','2026-05-12 10:00:00'),
('ltr_evt_009','ltr_004','loan_transfer.consent_solicitation','kyc_screening','consent_solicitation','lend_sbsa','agent','Screening cleared; obligor consent solicitation opened','2026-05-18 11:00:00'),
('ltr_evt_010','ltr_005','loan_transfer.consent_solicitation','kyc_screening','consent_solicitation','lend_sbsa','agent','Screening cleared; obligor consent solicitation opened','2026-05-10 11:00:00'),
('ltr_evt_011','ltr_005','loan_transfer.regulatory_review','consent_solicitation','regulatory_review','ipp_redstone','obligor','Obligor granted consent; SARB exchange-control review opened for the non-resident transferee','2026-05-16 09:00:00'),
-- ltr_006 SARB approval crossing (approve_transfer to a non-resident — crosses for EVERY tier)
('ltr_evt_012','ltr_006','loan_transfer.consent_solicitation','kyc_screening','consent_solicitation','lend_sbsa','agent','Screening cleared; obligor consent solicitation opened','2026-05-02 11:00:00'),
('ltr_evt_013','ltr_006','loan_transfer.regulatory_review','consent_solicitation','regulatory_review','ipp_kathu','obligor','Obligor granted consent; SARB exchange-control review opened','2026-05-08 09:00:00'),
('ltr_evt_014','ltr_006','loan_transfer.transfer_approved','regulatory_review','transfer_approved','lend_sbsa','agent','SARB approved the transfer to the non-resident lender; reportable exchange-control crossing','2026-05-20 14:00:00'),
-- ltr_007 resident large arc through certificate execution
('ltr_evt_015','ltr_007','loan_transfer.consent_solicitation','kyc_screening','consent_solicitation','lend_sbsa','agent','Screening cleared; obligor consent solicitation opened','2026-04-24 11:00:00'),
('ltr_evt_016','ltr_007','loan_transfer.regulatory_review','consent_solicitation','regulatory_review','ipp_msenge','obligor','Obligor granted consent','2026-04-30 09:00:00'),
('ltr_evt_017','ltr_007','loan_transfer.transfer_approved','regulatory_review','transfer_approved','lend_sbsa','agent','Transfer approved (resident transferee — no SARB approval required)','2026-05-06 14:00:00'),
('ltr_evt_018','ltr_007','loan_transfer.certificate_executed','transfer_approved','certificate_executed','lend_sbsa','agent','LMA Transfer Certificate executed','2026-05-22 10:00:00'),
-- ltr_008 full clean arc through settlement (non-resident large)
('ltr_evt_019','ltr_008','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_rmb','transferor','Major funded participation requested to a non-resident DFI','2026-04-06 09:00:00'),
('ltr_evt_020','ltr_008','loan_transfer.kyc_screening','transfer_requested','kyc_screening','lend_sbsa','agent','KYC screening opened','2026-04-09 10:00:00'),
('ltr_evt_021','ltr_008','loan_transfer.consent_solicitation','kyc_screening','consent_solicitation','lend_sbsa','agent','Screening cleared; obligor consent solicitation opened','2026-04-14 11:00:00'),
('ltr_evt_022','ltr_008','loan_transfer.regulatory_review','consent_solicitation','regulatory_review','ipp_oya','obligor','Obligor granted consent; SARB review opened','2026-04-20 09:00:00'),
('ltr_evt_023','ltr_008','loan_transfer.transfer_approved','regulatory_review','transfer_approved','lend_sbsa','agent','SARB approved the transfer to the non-resident lender','2026-04-28 14:00:00'),
('ltr_evt_024','ltr_008','loan_transfer.certificate_executed','transfer_approved','certificate_executed','lend_sbsa','agent','LMA Transfer Certificate executed','2026-05-08 10:00:00'),
('ltr_evt_025','ltr_008','loan_transfer.settled','certificate_executed','settled','lend_rmb','transferor','Cash settlement of the transferred participation completed','2026-05-24 11:00:00'),
-- ltr_009 full clean arc through completion (systemic — complete crosses Banks Act large-exposure)
('ltr_evt_026','ltr_009','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_absa','transferor','Systemic novation requested to an incoming resident bank','2026-03-20 09:00:00'),
('ltr_evt_027','ltr_009','loan_transfer.kyc_screening','transfer_requested','kyc_screening','lend_sbsa','agent','KYC screening opened','2026-03-23 10:00:00'),
('ltr_evt_028','ltr_009','loan_transfer.consent_solicitation','kyc_screening','consent_solicitation','lend_sbsa','agent','Screening cleared; obligor consent solicitation opened','2026-03-28 11:00:00'),
('ltr_evt_029','ltr_009','loan_transfer.regulatory_review','consent_solicitation','regulatory_review','ipp_gridbattery','obligor','Obligor granted consent','2026-04-03 09:00:00'),
('ltr_evt_030','ltr_009','loan_transfer.transfer_approved','regulatory_review','transfer_approved','lend_sbsa','agent','Transfer approved (resident transferee)','2026-04-10 14:00:00'),
('ltr_evt_031','ltr_009','loan_transfer.certificate_executed','transfer_approved','certificate_executed','lend_sbsa','agent','LMA Transfer Certificate executed','2026-04-18 10:00:00'),
('ltr_evt_032','ltr_009','loan_transfer.settled','certificate_executed','settled','lend_absa','transferor','Cash settlement completed','2026-04-28 11:00:00'),
('ltr_evt_033','ltr_009','loan_transfer.completed','settled','completed','lend_sbsa','agent','Transfer completed; register updated; Banks Act large-exposure re-aggregation notified','2026-05-12 16:00:00'),
-- ltr_010 screening-failure reject (fail_screening crosses FIC for EVERY tier)
('ltr_evt_034','ltr_010','loan_transfer.transfer_requested',NULL,'transfer_requested','lend_nedbank','transferor','Systemic funded participation requested to a non-resident credit vehicle','2026-04-28 09:00:00'),
('ltr_evt_035','ltr_010','loan_transfer.kyc_screening','transfer_requested','kyc_screening','lend_sbsa','agent','KYC / sanctions screening opened','2026-05-02 10:00:00'),
('ltr_evt_036','ltr_010','loan_transfer.rejected','kyc_screening','rejected','lend_sbsa','agent','Screening failed: sanctions-list match against a controlling party; rejected and filed with the FIC','2026-05-10 11:00:00');
