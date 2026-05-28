-- Wave 62 — Offtaker PPA Termination & Early-Termination Amount (Buy-Out) seed.
-- 10 terminations pter_001..pter_010 spanning 10 distinct lifecycle states, all
-- five buy-out tiers (two per tier), all five termination causes, and the cure /
-- review / confirmation / assessment / agreement / dispute / settlement branches.
-- The offtaker side drives the machinery; the seller (IPP) disputes the buy-out;
-- an independent expert resolves the dispute.
--
-- Reportable rows (is_reportable = involuntary cause OR large tier):
--   pter_001 (no_fault minor) is NOT reportable; pter_002..pter_010 all are
--   (involuntary cause and/or major+critical tier).
-- Regulator crossings shown in the event log: pter_005 confirm_termination on a
-- change-in-law (involuntary) cause — crosses for EVERY tier, the W62 signature;
-- pter_010 confirm_settlement of a critical buy-out (large-tier fiscal crossing).

INSERT OR IGNORE INTO oe_ppa_terminations (
  id, case_number, source_event, source_entity_type, source_entity_id, source_wave,
  offtaker_party_id, offtaker_party_name, seller_party_id, seller_party_name, independent_party_id, independent_party_name,
  ppa_code, ppa_name, plant_name, technology, ppa_currency, ppa_capacity_mw, remaining_term_months,
  termination_cause, eta_basis,
  debt_outstanding_zar_m, equity_makewhole_zar_m, buyout_zar_m, settlement_zar_m, termination_tier,
  notice_served_flag, cure_offered, cured, termination_confirmed_flag, eta_calculated, eta_agreed_flag, dispute_raised, dispute_resolved, settlement_paid,
  trigger_basis, notice_basis, cure_basis, review_basis, confirmation_basis, assessment_basis, agreement_basis, dispute_basis, resolution_basis, settlement_basis, reinstatement_basis, withdrawal_basis, reason_code,
  dispute_round,
  chain_status, termination_triggered_at, notice_served_at, cure_period_at, termination_review_at, termination_confirmed_at, eta_assessment_at, eta_agreed_at, disputed_at, settlement_pending_at, closed_at, reinstated_at, withdrawn_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- pter_001 minor / termination_triggered — voluntary mutual termination just triggered (NOT reportable)
('pter_001','PPA-TERM-2026-0001','offtaker.ppa_termination','ppa_contract','ppa_karoo_solar','W22',
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_karoo','Karoo Solar One RF (Pty) Ltd',NULL,NULL,
 'PPA-KAROO-001','Karoo Solar One Power Purchase Agreement','Karoo Solar One','solar_pv','ZAR',75.0,84,
 'no_fault','negotiated',
 22.0,8.0,30.0,NULL,'minor',
 0,0,0,0,0,0,0,0,0,
 'Both parties propose a voluntary mutual termination of the PPA on commercial grounds; an early-termination event has been triggered for assessment.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'mutual_termination_trigger',
 0,
 'termination_triggered','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-31 09:00:00',0,'demo_offtaker_001'),

-- pter_002 minor / notice_served — seller-default notice served; SLA BREACHED (involuntary cause; reportable)
('pter_002','PPA-TERM-2026-0002','offtaker.ppa_termination','ppa_contract','ppa_capewind',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_capewind','Cape West Wind RF (Pty) Ltd',NULL,NULL,
 'PPA-CAPEWIND-001','Cape West Wind Power Purchase Agreement','Cape West Wind','wind','ZAR',110.0,96,
 'seller_default','debt_only',
 42.0,0.0,42.0,NULL,'minor',
 1,0,0,0,0,0,0,0,0,
 'Seller in default: prolonged non-delivery below the minimum availability threshold and a missed remedial milestone.','Default notice served on the seller under the PPA event-of-default provisions; the early-termination process is on foot.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'seller_default_notice',
 0,
 'notice_served','2026-05-12 09:00:00','2026-05-15 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-22 10:00:00',1,'demo_offtaker_001'),

-- pter_003 moderate / cure_period — seller-default cure window running (reportable: involuntary)
('pter_003','PPA-TERM-2026-0003','offtaker.ppa_termination','ppa_contract','ppa_solarnorth',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_solarnorth','Solar North Cluster RF (Pty) Ltd',NULL,NULL,
 'PPA-SOLARNORTH-001','Solar North Cluster Power Purchase Agreement','Solar North Cluster','solar_pv','ZAR',120.0,102,
 'seller_default','debt_only',
 180.0,0.0,180.0,NULL,'moderate',
 1,1,0,0,0,0,0,0,0,
 'Seller default: failure to maintain the contracted availability and breach of the O&M performance covenant.','Default notice served.','Cure period opened: the seller has been granted a remediation window to restore availability and cure the default before the offtaker escalates to termination review.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'seller_default_cure',
 0,
 'cure_period','2026-05-02 09:00:00','2026-05-05 10:00:00','2026-05-10 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-30 11:00:00',0,'demo_offtaker_001'),

-- pter_004 moderate / termination_review — buyer-default no-cure path under review (reportable: involuntary)
('pter_004','PPA-TERM-2026-0004','offtaker.ppa_termination','ppa_contract','ppa_batteryone',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_batteryone','Battery One Storage RF (Pty) Ltd',NULL,NULL,
 'PPA-BATTERYONE-001','Battery One Storage Power Purchase Agreement','Battery One Storage','battery','ZAR',80.0,108,
 'buyer_default','debt_plus_equity',
 150.0,70.0,220.0,NULL,'moderate',
 1,0,0,0,0,0,0,0,0,
 'Buyer in persistent non-payment surfaced by the payment-security and take-or-pay chains; the seller invoked the buyer-default termination right.','Buyer-default termination notice served.',NULL,'Termination review under way: the offtaker case panel is assessing whether the buyer default is established and uncured before confirming termination.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'buyer_default_review',
 0,
 'termination_review','2026-05-12 09:00:00','2026-05-16 10:00:00',NULL,'2026-05-24 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-31 11:00:00',0,'demo_offtaker_001'),

-- pter_005 material / termination_confirmed — change-in-law confirmed; involuntary crossing notified (reportable)
('pter_005','PPA-TERM-2026-0005','offtaker.ppa_termination','ppa_contract','ppa_redstone',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_redstone','Redstone CSP RF (Pty) Ltd',NULL,NULL,
 'PPA-REDSTONE-001','Redstone CSP Power Purchase Agreement','Redstone CSP','csp','ZAR',100.0,120,
 'change_in_law','debt_plus_equity',
 480.0,220.0,700.0,NULL,'material',
 1,0,0,1,0,0,0,0,0,
 'A discriminatory change in law rendered continued performance unlawful and uneconomic; a change-in-law termination event was triggered.','Change-in-law termination notice served.',NULL,'Termination review completed: the change-in-law event is established and qualifies under the PPA.','Termination confirmed on change-in-law grounds; as an involuntary termination of a licensed generator offtake this is notified to NERSA as a security-of-supply event.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'change_in_law_confirmed',
 0,
 'termination_confirmed','2026-04-20 09:00:00','2026-04-24 10:00:00',NULL,'2026-05-04 11:00:00','2026-05-22 14:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-06-01 14:00:00',0,'demo_offtaker_001'),

-- pter_006 material / eta_assessment — prolonged-FM debt-only buy-out being computed (reportable: involuntary)
('pter_006','PPA-TERM-2026-0006','offtaker.ppa_termination','ppa_contract','ppa_kathu',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_kathu','Kathu Solar Park RF (Pty) Ltd',NULL,NULL,
 'PPA-KATHU-001','Kathu Solar Park Power Purchase Agreement','Kathu Solar Park','csp','ZAR',100.0,90,
 'prolonged_force_majeure','debt_only',
 920.0,0.0,920.0,NULL,'material',
 1,0,0,1,1,0,0,0,0,
 'A force-majeure event (prolonged transmission unavailability) persisted beyond the long-stop date, triggering a prolonged-FM termination.','Prolonged-FM termination notice served.',NULL,'Review completed: the FM event exceeded the long-stop.','Termination confirmed on prolonged-FM grounds; notified to NERSA.','Early-termination amount assessment under way on a debt-only basis: the outstanding senior debt schedule is being reconciled to derive the buy-out (no equity make-whole for a shared-risk FM termination).',NULL,NULL,NULL,NULL,NULL,NULL,'prolonged_fm_assessment',
 0,
 'eta_assessment','2026-04-05 09:00:00','2026-04-09 10:00:00',NULL,'2026-04-18 11:00:00','2026-04-28 14:00:00','2026-05-10 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-31 09:00:00',0,'demo_offtaker_001'),

-- pter_007 major / eta_agreed — buyer-default debt-plus-equity buy-out agreed (reportable: involuntary + large)
('pter_007','PPA-TERM-2026-0007','offtaker.ppa_termination','ppa_contract','ppa_msenge',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_msenge','Msenge Emoyeni Wind RF (Pty) Ltd',NULL,NULL,
 'PPA-MSENGE-001','Msenge Emoyeni Wind Power Purchase Agreement','Msenge Emoyeni Wind','wind','ZAR',140.0,132,
 'buyer_default','debt_plus_equity',
 2400.0,1100.0,3500.0,NULL,'major',
 1,0,0,1,1,1,0,0,0,
 'Buyer in sustained non-payment; the seller invoked the buyer-default termination right.','Buyer-default termination notice served.',NULL,'Review completed.','Termination confirmed on buyer-default grounds; notified to NERSA.','Early-termination amount assessed on a debt-plus-equity basis: senior debt plus the equity make-whole computed to make the seller whole at the buyer cost.','Buy-out agreed between the parties at the assessed debt-plus-equity amount.',NULL,NULL,NULL,NULL,NULL,'buyer_default_eta_agreed',
 0,
 'eta_agreed','2026-03-28 09:00:00','2026-04-01 10:00:00',NULL,'2026-04-10 11:00:00','2026-04-20 14:00:00','2026-05-01 09:00:00','2026-05-20 10:00:00',NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-30 10:00:00',0,'demo_offtaker_001'),

-- pter_008 major / disputed — seller disputes the debt-only buy-out; independent expert engaged (reportable)
('pter_008','PPA-TERM-2026-0008','offtaker.ppa_termination','ppa_contract','ppa_oya',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_oya','Oya Energy Hybrid RF (Pty) Ltd','exp_psg','PSG Independent Expert Determination',
 'PPA-OYA-001','Oya Energy Hybrid Power Purchase Agreement','Oya Energy Hybrid','hybrid','ZAR',155.0,126,
 'seller_default','debt_only',
 4200.0,0.0,4200.0,NULL,'major',
 1,0,0,1,1,0,1,0,0,
 'Seller default: abandonment of the plant and insolvency proceedings.','Seller-default termination notice served.',NULL,'Review completed.','Termination confirmed on seller-default grounds; notified to NERSA.','Early-termination amount assessed on a debt-only basis.',NULL,'Seller disputes the calculated buy-out: it contends the debt-only basis understates recoverable amounts and has referred the quantum to independent expert determination.',NULL,NULL,NULL,NULL,'eta_dispute',
 1,
 'disputed','2026-03-20 09:00:00','2026-03-24 10:00:00',NULL,'2026-04-02 11:00:00','2026-04-12 14:00:00','2026-04-24 09:00:00',NULL,'2026-05-12 10:00:00',NULL,NULL,NULL,NULL,
 1,'2026-06-26 10:00:00',0,'demo_offtaker_001'),

-- pter_009 critical / settlement_pending — change-in-law buy-out agreed, payment pending (reportable: involuntary + large)
('pter_009','PPA-TERM-2026-0009','offtaker.ppa_termination','ppa_contract','ppa_gridbattery',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_gridbattery','Grid Battery Fleet RF (Pty) Ltd',NULL,NULL,
 'PPA-GRIDBATTERY-001','Grid Battery Fleet Power Purchase Agreement','Grid Battery Fleet','battery','ZAR',200.0,144,
 'change_in_law','debt_plus_equity',
 4300.0,2200.0,6500.0,NULL,'critical',
 1,0,0,1,1,1,0,0,0,
 'A discriminatory change in law made performance unlawful; a change-in-law termination was triggered.','Change-in-law termination notice served.',NULL,'Review completed.','Termination confirmed on change-in-law grounds; notified to NERSA.','Buy-out assessed on a debt-plus-equity basis.','Buy-out agreed.',NULL,NULL,'Settlement pending: the offtaker is arranging payment of the agreed change-in-law buy-out within the security-of-supply settlement window.',NULL,NULL,'change_in_law_settlement_pending',
 0,
 'settlement_pending','2026-03-12 09:00:00','2026-03-16 10:00:00',NULL,'2026-03-26 11:00:00','2026-04-06 14:00:00','2026-04-18 09:00:00','2026-05-04 10:00:00',NULL,'2026-05-22 09:00:00',NULL,NULL,NULL,
 1,'2026-05-29 09:00:00',0,'demo_offtaker_001'),

-- pter_010 critical / closed — buyer-default buy-out paid in full; large-tier settlement crossing (reportable)
('pter_010','PPA-TERM-2026-0010','offtaker.ppa_termination','ppa_contract','ppa_coastalwind',NULL,
 'off_eskom','Eskom Holdings SOC Ltd (Single Buyer)','ipp_coastalwind','Coastal Wind Portfolio RF (Pty) Ltd',NULL,NULL,
 'PPA-COASTALWIND-001','Coastal Wind Portfolio Power Purchase Agreement','Coastal Wind Portfolio','wind','ZAR',220.0,150,
 'buyer_default','debt_plus_equity',
 5200.0,3000.0,8200.0,8200.0,'critical',
 1,0,0,1,1,1,0,0,1,
 'Buyer in sustained material non-payment; the seller invoked the buyer-default termination right.','Buyer-default termination notice served.',NULL,'Review completed.','Termination confirmed on buyer-default grounds; notified to NERSA.','Buy-out assessed on a debt-plus-equity basis.','Buy-out agreed.',NULL,NULL,'Settlement completed: the agreed buy-out was paid in full and the PPA closed. As a large-tier buy-out the settlement was notified to NERSA.',NULL,NULL,'buyer_default_closed',
 0,
 'closed','2026-02-20 09:00:00','2026-02-24 10:00:00',NULL,'2026-03-06 11:00:00','2026-03-18 14:00:00','2026-03-30 09:00:00','2026-04-14 10:00:00',NULL,'2026-04-28 09:00:00','2026-05-14 16:00:00',NULL,NULL,
 1,NULL,0,'demo_offtaker_001');

-- Events (transition log). Full clean arc for pter_010, the involuntary
-- confirm_termination crossing for pter_005, the counterparty dispute for
-- pter_008, and progression markers for the rest. The offtaker drives the
-- machinery; the seller disputes; the independent expert resolves.
INSERT OR IGNORE INTO oe_ppa_terminations_events (
  id, termination_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('pter_evt_001','pter_001','ppa_termination.notice_served',NULL,'termination_triggered','off_eskom','offtaker','Voluntary mutual termination event triggered','2026-05-26 09:00:00'),
('pter_evt_002','pter_002','ppa_termination.notice_served','termination_triggered','notice_served','off_eskom','offtaker','Seller-default notice served under the event-of-default provisions','2026-05-15 10:00:00'),
('pter_evt_003','pter_003','ppa_termination.notice_served','termination_triggered','notice_served','off_eskom','offtaker','Seller-default notice served','2026-05-05 10:00:00'),
('pter_evt_004','pter_003','ppa_termination.cure_period','notice_served','cure_period','off_eskom','offtaker','Cure period opened for the seller to restore availability','2026-05-10 11:00:00'),
('pter_evt_005','pter_004','ppa_termination.notice_served','termination_triggered','notice_served','off_eskom','offtaker','Buyer-default termination notice served','2026-05-16 10:00:00'),
('pter_evt_006','pter_004','ppa_termination.termination_review','notice_served','termination_review','off_eskom','offtaker','Escalated to termination review (no cure offered)','2026-05-24 11:00:00'),
-- pter_005 involuntary confirm_termination crossing (change_in_law — crosses for EVERY tier, the W62 signature)
('pter_evt_007','pter_005','ppa_termination.notice_served','termination_triggered','notice_served','off_eskom','offtaker','Change-in-law termination notice served','2026-04-24 10:00:00'),
('pter_evt_008','pter_005','ppa_termination.termination_review','notice_served','termination_review','off_eskom','offtaker','Escalated to termination review','2026-05-04 11:00:00'),
('pter_evt_009','pter_005','ppa_termination.termination_confirmed','termination_review','termination_confirmed','off_eskom','offtaker','Termination confirmed on change-in-law grounds; involuntary cause notified to NERSA as a security-of-supply event','2026-05-22 14:00:00'),
-- pter_006 to assessment (prolonged FM, debt-only)
('pter_evt_010','pter_006','ppa_termination.termination_confirmed','termination_review','termination_confirmed','off_eskom','offtaker','Termination confirmed on prolonged-FM grounds; notified to NERSA','2026-04-28 14:00:00'),
('pter_evt_011','pter_006','ppa_termination.eta_assessment','termination_confirmed','eta_assessment','off_eskom','offtaker','Early-termination amount assessment opened on a debt-only basis','2026-05-10 09:00:00'),
-- pter_007 to agreed (buyer default, debt + equity)
('pter_evt_012','pter_007','ppa_termination.eta_assessment','termination_confirmed','eta_assessment','off_eskom','offtaker','Buy-out assessment opened on a debt-plus-equity basis','2026-05-01 09:00:00'),
('pter_evt_013','pter_007','ppa_termination.eta_agreed','eta_assessment','eta_agreed','off_eskom','offtaker','Buy-out agreed at the assessed debt-plus-equity amount','2026-05-20 10:00:00'),
-- pter_008 counterparty dispute (the sole seller-side write)
('pter_evt_014','pter_008','ppa_termination.eta_assessment','termination_confirmed','eta_assessment','off_eskom','offtaker','Buy-out assessment opened on a debt-only basis','2026-04-24 09:00:00'),
('pter_evt_015','pter_008','ppa_termination.disputed','eta_assessment','disputed','ipp_oya','counterparty','Seller disputes the debt-only buy-out and refers the quantum to independent expert determination','2026-05-12 10:00:00'),
-- pter_009 to settlement_pending (change in law, critical)
('pter_evt_016','pter_009','ppa_termination.eta_agreed','eta_assessment','eta_agreed','off_eskom','offtaker','Buy-out agreed','2026-05-04 10:00:00'),
('pter_evt_017','pter_009','ppa_termination.settlement_pending','eta_agreed','settlement_pending','off_eskom','offtaker','Settlement initiated; payment of the agreed change-in-law buy-out pending','2026-05-22 09:00:00'),
-- pter_010 full clean arc through closed (confirm_settlement crosses for the large tier)
('pter_evt_018','pter_010','ppa_termination.notice_served','termination_triggered','notice_served','off_eskom','offtaker','Buyer-default termination notice served','2026-02-24 10:00:00'),
('pter_evt_019','pter_010','ppa_termination.termination_review','notice_served','termination_review','off_eskom','offtaker','Escalated to termination review','2026-03-06 11:00:00'),
('pter_evt_020','pter_010','ppa_termination.termination_confirmed','termination_review','termination_confirmed','off_eskom','offtaker','Termination confirmed on buyer-default grounds; notified to NERSA','2026-03-18 14:00:00'),
('pter_evt_021','pter_010','ppa_termination.eta_assessment','termination_confirmed','eta_assessment','off_eskom','offtaker','Buy-out assessment opened on a debt-plus-equity basis','2026-03-30 09:00:00'),
('pter_evt_022','pter_010','ppa_termination.eta_agreed','eta_assessment','eta_agreed','off_eskom','offtaker','Buy-out agreed','2026-04-14 10:00:00'),
('pter_evt_023','pter_010','ppa_termination.settlement_pending','eta_agreed','settlement_pending','off_eskom','offtaker','Settlement initiated','2026-04-28 09:00:00'),
('pter_evt_024','pter_010','ppa_termination.closed','settlement_pending','closed','off_eskom','offtaker','Buy-out paid in full and PPA closed; large-tier settlement notified to NERSA','2026-05-14 16:00:00');
