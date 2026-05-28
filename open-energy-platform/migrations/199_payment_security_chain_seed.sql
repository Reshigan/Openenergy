-- Wave 54 — Offtaker PPA Payment Security / Credit Support Instrument seed.
-- 10 payment-security instruments ps_001..ps_010 spanning 10 distinct lifecycle
-- states, all five secured-amount tiers (two each), and the drawdown /
-- replenishment / expiry / release / forfeit / reject branches. Offtakers are
-- industrial / municipal PPA buyers; sellers are renewable-energy SPVs; the
-- security agent is OE Security Agent. No apostrophes anywhere (D1 SQLite).

INSERT OR IGNORE INTO oe_ppa_payment_securities (
  id, security_number, source_event, source_entity_type, source_entity_id, source_wave,
  offtaker_party_id, offtaker_party_name, seller_party_name, agent_name,
  security_tier, instrument_name, instrument_type, issuer_name, issuer_rating,
  secured_amount_zar_m, required_amount_zar_m, cover_months, ppa_id, ppa_reference, project_id, project_name, sector, expiry_date,
  drawn_amount_zar_m, outstanding_invoice_zar_m, replenishment_due_zar_m, adequacy_shortfall_zar_m, drawdown_count,
  submission_basis, verification_basis, activation_basis, adequacy_basis, drawdown_basis, replenishment_basis, expiry_basis, release_basis, forfeit_basis, reason_code,
  chain_status, security_required_at, instrument_submitted_at, under_verification_at, active_at, adequacy_review_at,
  drawdown_initiated_at, replenishment_pending_at, expiry_pending_at, substitution_pending_at, released_at, forfeited_at, rejected_at,
  is_reportable, sla_deadline_at, escalation_level, created_by
) VALUES
-- ps_001 minor / LC — security requirement raised, awaiting the offtaker to post
('ps_001','PPA-SEC-2026-0001','ppa.payment_security_required','ppa','ppa_2026_7710',NULL,
 'off_aurora','Aurora Manganese Smelter (Pty) Ltd','Kareebos Solar SPV (Pty) Ltd','OE Security Agent',
 'minor','Kareebos PPA Payment LC','letter_of_credit',NULL,NULL,
 6,6,3,'ppa_2026_7710','PPA-2026-7710','proj_2026_5510','Kareebos 35MW Solar PV','solar_pv','2027-05-31',
 NULL,NULL,NULL,NULL,0,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'security_required','2026-05-27 08:00:00',NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-06-16 08:00:00',0,'demo_admin_001'),

-- ps_002 moderate / bank guarantee — instrument submitted, awaiting verification
('ps_002','PPA-SEC-2026-0002','ppa.payment_security_required','ppa','ppa_2026_7688',NULL,
 'off_saldanha','Saldanha Steel Offtake (Pty) Ltd','Mthatha Wind SPV (Pty) Ltd','OE Security Agent',
 'moderate','Mthatha PPA Payment Guarantee','bank_guarantee','Standard Bank','A',
 35,35,2,'ppa_2026_7688','PPA-2026-7688','proj_2026_5488','Mthatha 90MW Wind','wind','2027-06-30',
 NULL,NULL,NULL,NULL,0,
 'Offtaker submitted an on-demand bank guarantee from Standard Bank for two months of invoice cover.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'instrument_submitted','2026-05-20 08:00:00','2026-05-24 09:00:00',NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-29 09:00:00',0,'demo_admin_001'),

-- ps_003 material / LC — under verification (issuer rating + drawing conditions)
('ps_003','PPA-SEC-2026-0003','ppa.payment_security_required','ppa','ppa_2026_7601',NULL,
 'off_ethekwini','eThekwini Metro Energy Office','Groblersdal BESS SPV (Pty) Ltd','OE Security Agent',
 'material','Groblersdal PPA Payment LC','letter_of_credit','Absa','A-',
 120,120,3,'ppa_2026_7601','PPA-2026-7601','proj_2026_5401','Groblersdal 250MWh BESS','bess','2027-06-30',
 NULL,NULL,NULL,NULL,0,
 'Offtaker posted a confirmed letter of credit; three months of cover.',
 'Verification underway: issuer rating, expiry tenor and on-demand drawing conditions checked against the PPA security schedule.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'under_verification','2026-05-16 08:00:00','2026-05-20 09:00:00','2026-05-24 10:00:00',NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-31 10:00:00',0,'demo_admin_001'),

-- ps_004 major / LC — active and in force (healthy steady state)
('ps_004','PPA-SEC-2026-0004','ppa.payment_security_required','ppa','ppa_2026_7500',NULL,
 'off_sasolburg','Sasolburg Chemicals Offtaker (Pty) Ltd','Kuruman Solar One SPV (Pty) Ltd','OE Security Agent',
 'major','Kuruman PPA Payment LC','letter_of_credit','Nedbank','A',
 600,600,2,'ppa_2026_7500','PPA-2026-7500','proj_2026_5300','Kuruman 400MW Solar Complex','solar_pv','2027-04-30',
 NULL,NULL,NULL,NULL,0,
 'Offtaker posted a confirmed standby letter of credit for two months of invoice cover.',
 'Verified: investment-grade issuer, on-demand wording and tenor conforming to the PPA security schedule.',
 'Instrument activated and in force; PPA payment obligations secured.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'active','2026-04-01 08:00:00','2026-04-05 09:00:00','2026-04-10 10:00:00','2026-04-20 11:00:00',NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,NULL,0,'demo_admin_001'),

-- ps_005 critical / LC — drawdown initiated on an unpaid invoice (REPORTABLE: drawdown + critical)
('ps_005','PPA-SEC-2026-0005','ppa.payment_security_required','ppa','ppa_2026_7400',NULL,
 'off_richardsbay','Richards Bay Minerals Offtake (Pty) Ltd','Redstone CSP SPV (Pty) Ltd','OE Security Agent',
 'critical','Redstone PPA Payment LC','letter_of_credit','FirstRand','A',
 1500,1500,3,'ppa_2026_7400','PPA-2026-7400','proj_2026_4900','Redstone 1.2GW Renewables Platform','solar_pv','2027-12-31',
 250,250,NULL,NULL,1,
 'Offtaker posted a confirmed letter of credit for three months of platform invoice cover.',
 'Verified: investment-grade issuer and conforming on-demand wording.',
 'Instrument activated and in force.',NULL,
 'Offtaker failed to settle the May invoice within the cure window; seller called on the letter of credit for the unpaid amount.',NULL,NULL,NULL,NULL,'invoice_non_payment',
 'drawdown_initiated','2026-02-01 08:00:00','2026-02-05 09:00:00','2026-02-10 10:00:00','2026-02-20 11:00:00',NULL,
 '2026-05-28 06:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 1,'2026-05-29 06:00:00',0,'demo_admin_001'),

-- ps_006 moderate / guarantee — replenishment pending after a drawdown (SLA breached open)
('ps_006','PPA-SEC-2026-0006','ppa.payment_security_required','ppa','ppa_2026_7322',NULL,
 'off_gauteng_dc','Gauteng Data Centres (Pty) Ltd','Bethlehem Solar SPV (Pty) Ltd','OE Security Agent',
 'moderate','Bethlehem PPA Payment Guarantee','bank_guarantee','Investec','BBB+',
 40,40,2,'ppa_2026_7322','PPA-2026-7322','proj_2026_5190','Bethlehem 75MW Solar PV','solar_pv','2027-03-31',
 15,15,15,NULL,1,
 'Offtaker posted an on-demand bank guarantee for two months of cover.',
 'Verified and activated.',
 'Activated and in force.',NULL,
 'Seller drew on the guarantee for an unpaid invoice; instrument reduced below the required cover.',
 'Offtaker required to restore the guarantee to full value; replenishment overdue beyond the cure window.',NULL,NULL,NULL,'replenishment_overdue',
 'replenishment_pending','2026-03-01 08:00:00','2026-03-05 09:00:00','2026-03-10 10:00:00','2026-03-20 11:00:00',NULL,
 '2026-04-20 12:00:00','2026-04-25 13:00:00',NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-02 13:00:00',1,'demo_admin_001'),

-- ps_007 material / LC — expiry pending, renewal overdue (SLA breached open)
('ps_007','PPA-SEC-2026-0007','ppa.payment_security_required','ppa','ppa_2026_7255',NULL,
 'off_citypower','City Power Johannesburg SOC Ltd','Ladysmith Hydro SPV (Pty) Ltd','OE Security Agent',
 'material','Ladysmith PPA Payment LC','letter_of_credit','Standard Bank','A',
 150,150,3,'ppa_2026_7255','PPA-2026-7255','proj_2026_5277','Ladysmith 120MW Hydro','hydro','2026-06-01',
 NULL,NULL,NULL,NULL,0,
 'Offtaker posted a confirmed letter of credit for three months of cover.',
 'Verified and activated.',
 'Activated and in force.',NULL,NULL,NULL,
 'Instrument approaches expiry on 2026-06-01; renewal or replacement required and now overdue beyond the cure window.',NULL,NULL,'renewal_overdue',
 'expiry_pending','2026-01-15 08:00:00','2026-01-20 09:00:00','2026-01-25 10:00:00','2026-02-01 11:00:00',NULL,
 NULL,NULL,'2026-04-25 12:00:00',NULL,NULL,NULL,NULL,
 0,'2026-05-02 12:00:00',1,'demo_admin_001'),

-- ps_008 minor / cash deposit — released at end of PPA term (clean terminal)
('ps_008','PPA-SEC-2026-0008','ppa.payment_security_required','ppa','ppa_2026_7100',NULL,
 'off_mogale','Mogale Industrial Park Offtaker (Pty) Ltd','Calvinia Solar SPV (Pty) Ltd','OE Security Agent',
 'minor','Calvinia PPA Payment Deposit','cash_deposit','OE Security Agent',NULL,
 8,8,2,'ppa_2026_7100','PPA-2026-7100','proj_2026_4760','Calvinia 20MW Solar PV','solar_pv','2026-05-15',
 NULL,NULL,NULL,NULL,0,
 'Offtaker posted a ring-fenced cash deposit for two months of cover.',
 'Verified and activated.',
 'Activated and in force for the PPA term.',NULL,NULL,NULL,NULL,
 'PPA reached end of term with no payment defaults; security released and the cash deposit returned to the offtaker.',NULL,NULL,
 'released','2024-05-01 08:00:00','2024-05-05 09:00:00','2024-05-10 10:00:00','2024-05-15 11:00:00',NULL,
 NULL,NULL,NULL,NULL,'2026-05-15 12:00:00',NULL,NULL,
 0,NULL,0,'demo_admin_001'),

-- ps_009 critical / guarantee — FORFEITED after replenishment default (REPORTABLE: forfeit ANY tier; the W54 signature)
('ps_009','PPA-SEC-2026-0009','ppa.payment_security_required','ppa','ppa_2026_6950',NULL,
 'off_coega','Coega IDZ Energy Buyer (Pty) Ltd','Vredendal Wind SPV (Pty) Ltd','OE Security Agent',
 'critical','Vredendal PPA Payment Guarantee','bank_guarantee','Absa','A',
 2000,2000,3,'ppa_2026_6950','PPA-2026-6950','proj_2026_5055','Vredendal 350MW Wind','wind','2027-01-31',
 2000,480,2000,NULL,2,
 'Offtaker posted an on-demand bank guarantee for three months of cover.',
 'Verified and activated.',
 'Activated and in force.',NULL,
 'Seller drew the full guarantee across two unpaid quarterly invoices.',
 'Offtaker required to restore the full guaranteed amount; replenishment defaulted.',NULL,NULL,
 'Offtaker failed to replenish the exhausted guarantee within the cure window; payment security forfeited and the PPA default escalated to the regulator.','replenishment_default',
 'forfeited','2026-01-10 08:00:00','2026-01-15 09:00:00','2026-01-20 10:00:00','2026-02-01 11:00:00',NULL,
 '2026-04-01 12:00:00','2026-04-10 13:00:00',NULL,NULL,NULL,'2026-05-10 14:00:00',NULL,
 1,NULL,2,'demo_admin_001'),

-- ps_010 major / LC — instrument REJECTED at verification (REPORTABLE: reject + major)
('ps_010','PPA-SEC-2026-0010','ppa.payment_security_required','ppa','ppa_2026_6800',NULL,
 'off_tshwane','Tshwane Metro Energy Office','Kuruman Solar Two SPV (Pty) Ltd','OE Security Agent',
 'major','Kuruman Two PPA Payment LC','letter_of_credit','Capitec Business','BB',
 700,700,2,'ppa_2026_6800','PPA-2026-6800','proj_2026_5300','Kuruman 400MW Solar Complex Phase Two','solar_pv','2027-04-30',
 NULL,NULL,NULL,NULL,0,
 'Offtaker submitted a letter of credit from a non-investment-grade issuer.',
 'Verification failed: issuer rating BB is below the PPA minimum of A-, and the drawing conditions were non-conforming.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'issuer_below_rating_threshold',
 'rejected','2026-05-01 08:00:00','2026-05-05 09:00:00','2026-05-10 10:00:00',NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-18 11:00:00',
 1,NULL,0,'demo_admin_001');

-- Events (transition log). Full lifecycle paths for the showcase cases (ps_005
-- drawdown, ps_008 released, ps_009 forfeited, ps_010 rejected) with the
-- two-party offtaker/seller split; creation markers for the rest. The creation
-- marker uses payment_security.security_required (a marker, not in the event
-- union; the events table column is plain TEXT).
INSERT OR IGNORE INTO oe_ppa_payment_securities_events (
  id, security_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('ps_evt_001','ps_001','payment_security.security_required',NULL,'security_required','off_aurora','seller','Payment-security requirement raised on PPA execution','2026-05-27 08:00:00'),
('ps_evt_002','ps_002','payment_security.security_required',NULL,'security_required','off_saldanha','seller','Payment-security requirement raised','2026-05-20 08:00:00'),
('ps_evt_003','ps_002','payment_security.instrument_submitted','security_required','instrument_submitted','off_saldanha','offtaker','Offtaker submitted an on-demand bank guarantee','2026-05-24 09:00:00'),
('ps_evt_004','ps_003','payment_security.instrument_submitted','security_required','instrument_submitted','off_ethekwini','offtaker','Offtaker posted a confirmed letter of credit','2026-05-20 09:00:00'),
('ps_evt_005','ps_003','payment_security.under_verification','instrument_submitted','under_verification','OE Security Agent','seller','Verification opened on the letter of credit','2026-05-24 10:00:00'),
-- ps_004 active path
('ps_evt_006','ps_004','payment_security.instrument_submitted','security_required','instrument_submitted','off_sasolburg','offtaker','Offtaker posted a standby letter of credit','2026-04-05 09:00:00'),
('ps_evt_007','ps_004','payment_security.under_verification','instrument_submitted','under_verification','OE Security Agent','seller','Verification opened','2026-04-10 10:00:00'),
('ps_evt_008','ps_004','payment_security.active','under_verification','active','OE Security Agent','seller','Instrument verified and activated; PPA payment obligations secured','2026-04-20 11:00:00'),
-- ps_005 drawdown path (REPORTABLE on initiate_drawdown @ critical)
('ps_evt_009','ps_005','payment_security.instrument_submitted','security_required','instrument_submitted','off_richardsbay','offtaker','Offtaker posted a confirmed letter of credit','2026-02-05 09:00:00'),
('ps_evt_010','ps_005','payment_security.under_verification','instrument_submitted','under_verification','OE Security Agent','seller','Verification opened','2026-02-10 10:00:00'),
('ps_evt_011','ps_005','payment_security.active','under_verification','active','OE Security Agent','seller','Instrument verified and activated','2026-02-20 11:00:00'),
('ps_evt_012','ps_005','payment_security.drawdown_initiated','active','drawdown_initiated','Redstone CSP SPV (Pty) Ltd','seller','Seller called on the letter of credit for the unpaid May invoice; large-exposure drawdown notified','2026-05-28 06:00:00'),
-- ps_006 replenishment path
('ps_evt_013','ps_006','payment_security.active','under_verification','active','OE Security Agent','seller','Instrument verified and activated','2026-03-20 11:00:00'),
('ps_evt_014','ps_006','payment_security.drawdown_initiated','active','drawdown_initiated','Bethlehem Solar SPV (Pty) Ltd','seller','Seller drew on the guarantee for an unpaid invoice','2026-04-20 12:00:00'),
('ps_evt_015','ps_006','payment_security.replenishment_pending','drawdown_initiated','replenishment_pending','OE Security Agent','seller','Replenishment required to restore the guarantee to full value','2026-04-25 13:00:00'),
-- ps_007 expiry path
('ps_evt_016','ps_007','payment_security.active','under_verification','active','OE Security Agent','seller','Instrument verified and activated','2026-02-01 11:00:00'),
('ps_evt_017','ps_007','payment_security.expiry_pending','active','expiry_pending','OE Security Agent','seller','Instrument approaching expiry; renewal or replacement required','2026-04-25 12:00:00'),
-- ps_008 released clean terminal
('ps_evt_018','ps_008','payment_security.active','under_verification','active','OE Security Agent','seller','Instrument verified and activated','2024-05-15 11:00:00'),
('ps_evt_019','ps_008','payment_security.released','active','released','OE Security Agent','seller','PPA reached end of term with no defaults; security released','2026-05-15 12:00:00'),
-- ps_009 forfeited path (REPORTABLE on forfeit ANY tier — the W54 signature)
('ps_evt_020','ps_009','payment_security.instrument_submitted','security_required','instrument_submitted','off_coega','offtaker','Offtaker posted an on-demand bank guarantee','2026-01-15 09:00:00'),
('ps_evt_021','ps_009','payment_security.under_verification','instrument_submitted','under_verification','OE Security Agent','seller','Verification opened','2026-01-20 10:00:00'),
('ps_evt_022','ps_009','payment_security.active','under_verification','active','OE Security Agent','seller','Instrument verified and activated','2026-02-01 11:00:00'),
('ps_evt_023','ps_009','payment_security.drawdown_initiated','active','drawdown_initiated','Vredendal Wind SPV (Pty) Ltd','seller','Seller drew the full guarantee across two unpaid quarterly invoices','2026-04-01 12:00:00'),
('ps_evt_024','ps_009','payment_security.replenishment_pending','drawdown_initiated','replenishment_pending','OE Security Agent','seller','Offtaker required to restore the full guaranteed amount','2026-04-10 13:00:00'),
('ps_evt_025','ps_009','payment_security.forfeited','replenishment_pending','forfeited','OE Security Agent','seller','Replenishment defaulted; payment security forfeited and the PPA default escalated to the regulator','2026-05-10 14:00:00'),
-- ps_010 rejected path
('ps_evt_026','ps_010','payment_security.instrument_submitted','security_required','instrument_submitted','off_tshwane','offtaker','Offtaker submitted a letter of credit from a non-investment-grade issuer','2026-05-05 09:00:00'),
('ps_evt_027','ps_010','payment_security.under_verification','instrument_submitted','under_verification','OE Security Agent','seller','Verification opened','2026-05-10 10:00:00'),
('ps_evt_028','ps_010','payment_security.rejected','under_verification','rejected','OE Security Agent','seller','Verification failed: issuer rating BB below the PPA minimum and non-conforming drawing conditions','2026-05-18 11:00:00');
