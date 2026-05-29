-- Wave 66 — Regulator Complaints & Dispute Resolution seed.
-- 10 complaints cmp_001..cmp_010 spanning 10 distinct lifecycle states and all
-- five affected-party tiers. Three reportable cases prove the W66 signature:
--   - cmp_007 a MAJOR supply-quality ruling issued (issue_ruling crosses major+systemic)
--   - cmp_009 a SYSTEMIC market-conduct complaint dismissed (dismiss crosses systemic)
--   - cmp_010 a MAJOR tariff ruling APPEALED (lodge_appeal crosses for EVERY tier —
--     the W66 signature). reportable_total = 3.
-- No apostrophes anywhere (D1 SQLite). affected_customers drives complaint_tier.

INSERT OR IGNORE INTO oe_regulator_complaints (
  id, complaint_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  complainant_id, complainant_name, complainant_type, respondent_id, respondent_name, respondent_licence_no,
  complaint_category, complaint_tier, affected_customers, jurisdiction_basis,
  complaint_ref, referral_ref, investigation_ref, mediation_ref, hearing_ref, ruling_ref, appeal_ref,
  lodgement_basis, admissibility_basis, referral_basis, settlement_basis, investigation_basis, mediation_basis, hearing_basis, ruling_basis, remedy_basis, dismissal_basis, appeal_basis, reason_code, complaint_summary, remedy_directed,
  chain_status, lodged_at, admissibility_review_at, referred_to_licensee_at, under_investigation_at, mediation_at, adjudication_hearing_at, ruling_issued_at, remedy_monitoring_at, resolved_at, dismissed_at, appealed_at, withdrawn_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- cmp_001 minor billing — just lodged, awaiting admissibility screen
('cmp_001','CMP-2026-0001',
 NULL,NULL,NULL,NULL,
 'cust_001','Thandiwe Mokoena','customer','lic_metro_001','Metro Electricity Distributor','NERSA-DL-0114',
 'billing','minor',1,'ERA 4 of 2006 section 30 dispute over a disputed billing estimate',
 'CMP-DOC-001',NULL,NULL,NULL,NULL,NULL,NULL,
 'Customer disputes three months of estimated billing after a faulty meter; complaint lodged for screening.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'complaint_lodged','2026-05-27 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-01 08:00:00',NULL,0,0,'demo_regulator_001'),

-- cmp_002 moderate metering — admissibility under review
('cmp_002','CMP-2026-0002',
 NULL,NULL,NULL,NULL,
 'cust_002','Eastside Residents Forum','customer','lic_metro_002','Eastside Power Utility','NERSA-DL-0221',
 'metering','moderate',45,'ERA 4 of 2006 section 30 dispute over prepaid meter token shortfalls',
 'CMP-DOC-002',NULL,NULL,NULL,NULL,NULL,NULL,
 'Residents report systematic prepaid token under-crediting across a block of forty five units.','Admissibility and jurisdiction under review by the NERSA complaints office.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'admissibility_review','2026-05-24 08:00:00','2026-05-26 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-31 09:00:00',NULL,0,0,'demo_regulator_001'),

-- cmp_003 significant supply_quality — referred to licensee for first-level resolution
('cmp_003','CMP-2026-0003',
 NULL,NULL,NULL,NULL,
 'cust_003','Riverside Ratepayers Association','customer','lic_metro_003','Riverside Municipal Electricity','NERSA-DL-0309',
 'supply_quality','significant',600,'ERA 4 of 2006 section 30 dispute over sustained low-voltage supply',
 'CMP-DOC-003','REF-003',NULL,NULL,NULL,NULL,NULL,
 'Six hundred households report sustained low voltage damaging appliances over a feeder.','Admissible; clear NERSA jurisdiction over the distribution licensee.','Referred to the licensee for first-level resolution within the prescribed window.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'referred_to_licensee','2026-05-10 08:00:00','2026-05-12 09:00:00','2026-05-15 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-29 10:00:00',NULL,0,0,'demo_regulator_001'),

-- cmp_004 minor connection — escalated to NERSA investigation
('cmp_004','CMP-2026-0004',
 NULL,NULL,NULL,NULL,
 'ipp_dev_004','Klein Karoo Solar SPV','ipp','lic_grid_004','National Transmission Company SA','NERSA-TL-0007',
 'connection','minor',3,'ERA 4 of 2006 section 30 dispute over a delayed connection energisation',
 'CMP-DOC-004','REF-004','INV-004',NULL,NULL,NULL,NULL,
 'A small IPP disputes repeated delays energising a completed connection.','Admissible against the transmission licensee.','Referred to the licensee; first-level resolution did not settle the matter.','','Escalated to a formal NERSA investigation after the referral window lapsed.',NULL,NULL,NULL,NULL,NULL,NULL,'connection_delay',NULL,NULL,
 'under_investigation','2026-04-20 08:00:00','2026-04-22 09:00:00','2026-04-25 10:00:00','2026-05-18 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-17 11:00:00',NULL,0,1,'demo_regulator_001'),

-- cmp_005 moderate service — in mediation
('cmp_005','CMP-2026-0005',
 NULL,NULL,NULL,NULL,
 'off_005','Highveld Agri Offtaker','offtaker','lic_metro_005','Highveld Energy Trader','NERSA-TR-0042',
 'service','moderate',80,'ERA 4 of 2006 section 30 dispute over service-level credits',
 'CMP-DOC-005','REF-005','INV-005','MED-005',NULL,NULL,NULL,
 'An offtaker disputes withheld service-level credits affecting eighty supply points.','Admissible.','Referred; not resolved at first level.','','Investigated; parties agreed to attempt mediation.','Mediation convened between the offtaker and the trader licensee.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'mediation','2026-04-15 08:00:00','2026-04-17 09:00:00','2026-04-20 10:00:00','2026-05-05 11:00:00','2026-05-20 12:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-03 12:00:00',NULL,0,1,'demo_regulator_001'),

-- cmp_006 significant tariff — at an adjudication hearing
('cmp_006','CMP-2026-0006',
 NULL,NULL,NULL,NULL,
 'cust_006','Southern Suburbs Business Chamber','licensee','lic_metro_006','Southern Suburbs Distributor','NERSA-DL-0512',
 'tariff','significant',900,'ERA 4 of 2006 section 30 dispute over an unapproved tariff reclassification',
 'CMP-DOC-006','REF-006','INV-006','MED-006','HEAR-006',NULL,NULL,
 'Business customers dispute a tariff reclassification applied without NERSA approval.','Admissible.','Referred; first-level resolution failed.','','Investigated; material dispute over tariff approval.','Mediation attempted but did not settle.','Adjudication hearing convened before the NERSA panel.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'adjudication_hearing','2026-03-20 08:00:00','2026-03-22 09:00:00','2026-03-25 10:00:00','2026-04-10 11:00:00','2026-04-25 12:00:00','2026-05-15 13:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-29 13:00:00',NULL,0,1,'demo_regulator_001'),

-- cmp_007 major supply_quality — ruling issued (REPORTABLE: issue_ruling crosses major + systemic)
('cmp_007','CMP-2026-0007',
 NULL,NULL,NULL,NULL,
 'cust_007','Northern District Consumer Council','customer','lic_metro_007','Northern District Power','NERSA-DL-0633',
 'supply_quality','major',4500,'ERA 4 of 2006 section 30 dispute over prolonged unplanned interruptions',
 'CMP-DOC-007','REF-007','INV-007','MED-007','HEAR-007','RUL-007',NULL,
 'Four thousand five hundred customers cite prolonged unplanned interruptions breaching the quality of supply standards.','Admissible.','Referred; unresolved at first level.','','Investigated; quality of supply breach substantiated.','Mediation did not settle.','Adjudication hearing held.','Binding ruling issued directing remediation and customer credits; reported to the NERSA Council.',NULL,NULL,NULL,NULL,NULL,'Licensee to restore quality of supply standards and credit affected customers within sixty days.',
 'ruling_issued','2026-02-10 08:00:00','2026-02-12 09:00:00','2026-02-15 10:00:00','2026-03-01 11:00:00','2026-03-20 12:00:00','2026-04-10 13:00:00','2026-05-05 14:00:00',NULL,NULL,NULL,NULL,NULL,
 '2026-05-10 14:00:00',NULL,1,0,'demo_regulator_001'),

-- cmp_008 minor billing — resolved at first level (settle_at_licensee happy-path showcase)
('cmp_008','CMP-2026-0008',
 NULL,NULL,NULL,NULL,
 'cust_008','Pieter van der Merwe','customer','lic_metro_008','Cape Metro Distributor','NERSA-DL-0741',
 'billing','minor',1,'ERA 4 of 2006 section 30 dispute over a duplicate charge',
 'CMP-DOC-008','REF-008',NULL,NULL,NULL,NULL,NULL,
 'Customer disputes a duplicate monthly charge.','Admissible against the distribution licensee.','Referred to the licensee for first-level resolution.','Licensee reversed the duplicate charge and credited the account; complainant satisfied and matter resolved.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'First-level resolution: duplicate charge reversed and account credited.','Account credited; duplicate charge reversed.',
 'resolved','2026-05-01 08:00:00','2026-05-02 09:00:00','2026-05-04 10:00:00',NULL,NULL,NULL,NULL,NULL,'2026-05-12 11:00:00',NULL,NULL,NULL,
 NULL,NULL,0,0,'demo_regulator_001'),

-- cmp_009 systemic market_conduct — dismissed (REPORTABLE: dismiss crosses systemic)
('cmp_009','CMP-2026-0009',
 NULL,NULL,NULL,NULL,
 'cust_009','National Energy Consumers Coalition','customer','lic_trader_009','National Power Exchange Desk','NERSA-TR-0011',
 'market_conduct','systemic',50000,'ERA 4 of 2006 section 30 and Financial Markets Act market-conduct complaint',
 'CMP-DOC-009','REF-009','INV-009',NULL,NULL,NULL,NULL,
 'A national coalition alleges anti-competitive market conduct affecting tens of thousands of consumers.','Admissible for screening; scope and jurisdiction examined.','Referred for response; escalated to investigation given the scale.','','Investigated; the allegations fell outside the conduct standard NERSA administers and lacked supporting evidence.',NULL,NULL,NULL,NULL,'Dismissed for want of jurisdiction and merit; the conduct alleged falls under the competition authority; dismissal of a national-scale complaint reported to the NERSA Council.',NULL,'no_jurisdiction',NULL,NULL,
 'dismissed','2026-03-01 08:00:00','2026-03-03 09:00:00','2026-03-06 10:00:00','2026-03-20 11:00:00',NULL,NULL,NULL,NULL,NULL,'2026-04-15 12:00:00',NULL,NULL,
 NULL,NULL,1,0,'demo_regulator_001'),

-- cmp_010 major tariff — ruling appealed (REPORTABLE: lodge_appeal crosses for EVERY tier — the W66 signature)
('cmp_010','CMP-2026-0010',
 NULL,NULL,NULL,NULL,
 'lic_ipp_010','Coastal Wind Generators','ipp','lic_grid_010','National Transmission Company SA','NERSA-TL-0007',
 'tariff','major',8000,'ERA 4 of 2006 section 30 dispute over a use-of-system tariff determination',
 'CMP-DOC-010','REF-010','INV-010',NULL,'HEAR-010','RUL-010','APP-010',
 'A generator disputes a use-of-system tariff that affects a large connected customer base.','Admissible.','Referred; unresolved at first level.','','Investigated; material tariff dispute requiring adjudication.',NULL,'Adjudication hearing held directly after investigation.','Binding ruling issued upholding the tariff determination.','','','Complainant lodged a judicial-review appeal of the NERSA ruling; appeal referred to the NERSA Council and the High Court roll.','appeal_filed','Ruling upheld the tariff; complainant filed for judicial review.','Use-of-system tariff determination upheld.',
 'appealed','2026-01-15 08:00:00','2026-01-17 09:00:00','2026-01-20 10:00:00','2026-02-05 11:00:00',NULL,'2026-03-01 12:00:00','2026-03-25 13:00:00',NULL,NULL,NULL,'2026-04-20 14:00:00',NULL,
 NULL,NULL,1,1,'demo_regulator_001');

-- Events (transition log). Full first-level path for the resolved showcase (cmp_008)
-- plus key transitions for the rest. actor_party records the functional party:
-- the adjudicator (NERSA) screens / refers / investigates / mediates / convenes /
-- rules / monitors / dismisses; the respondent licensee settles at first level;
-- the complainant lodges the appeal.
INSERT OR IGNORE INTO oe_regulator_complaints_events (
  id, complaint_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at
) VALUES
('cmp_evt_001','cmp_002','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissibility and jurisdiction under review','2026-05-26 09:00:00'),
('cmp_evt_002','cmp_003','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible; NERSA jurisdiction confirmed','2026-05-12 09:00:00'),
('cmp_evt_003','cmp_003','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the licensee for first-level resolution','2026-05-15 10:00:00'),
('cmp_evt_004','cmp_004','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible against the transmission licensee','2026-04-22 09:00:00'),
('cmp_evt_005','cmp_004','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the licensee','2026-04-25 10:00:00'),
('cmp_evt_006','cmp_004','regulator_complaint.escalated','referred_to_licensee','under_investigation','demo_regulator_001','adjudicator','First-level resolution lapsed; escalated to a formal investigation','2026-05-18 11:00:00'),
('cmp_evt_007','cmp_005','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible','2026-04-17 09:00:00'),
('cmp_evt_008','cmp_005','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the trader licensee','2026-04-20 10:00:00'),
('cmp_evt_009','cmp_005','regulator_complaint.escalated','referred_to_licensee','under_investigation','demo_regulator_001','adjudicator','Escalated to investigation','2026-05-05 11:00:00'),
('cmp_evt_010','cmp_005','regulator_complaint.mediating','under_investigation','mediation','demo_regulator_001','adjudicator','Mediation convened between the offtaker and the trader','2026-05-20 12:00:00'),
('cmp_evt_011','cmp_006','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible','2026-03-22 09:00:00'),
('cmp_evt_012','cmp_006','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the distributor','2026-03-25 10:00:00'),
('cmp_evt_013','cmp_006','regulator_complaint.escalated','referred_to_licensee','under_investigation','demo_regulator_001','adjudicator','Escalated to investigation','2026-04-10 11:00:00'),
('cmp_evt_014','cmp_006','regulator_complaint.mediating','under_investigation','mediation','demo_regulator_001','adjudicator','Mediation attempted','2026-04-25 12:00:00'),
('cmp_evt_015','cmp_006','regulator_complaint.hearing_convened','mediation','adjudication_hearing','demo_regulator_001','adjudicator','Adjudication hearing convened before the panel','2026-05-15 13:00:00'),
('cmp_evt_016','cmp_007','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible','2026-02-12 09:00:00'),
('cmp_evt_017','cmp_007','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the distributor','2026-02-15 10:00:00'),
('cmp_evt_018','cmp_007','regulator_complaint.escalated','referred_to_licensee','under_investigation','demo_regulator_001','adjudicator','Escalated to investigation','2026-03-01 11:00:00'),
('cmp_evt_019','cmp_007','regulator_complaint.mediating','under_investigation','mediation','demo_regulator_001','adjudicator','Mediation attempted','2026-03-20 12:00:00'),
('cmp_evt_020','cmp_007','regulator_complaint.hearing_convened','mediation','adjudication_hearing','demo_regulator_001','adjudicator','Adjudication hearing held','2026-04-10 13:00:00'),
('cmp_evt_021','cmp_007','regulator_complaint.ruling_issued','adjudication_hearing','ruling_issued','demo_regulator_001','adjudicator','Binding ruling issued; reported to the NERSA Council','2026-05-05 14:00:00'),
('cmp_evt_022','cmp_008','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible against the distributor','2026-05-02 09:00:00'),
('cmp_evt_023','cmp_008','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the licensee for first-level resolution','2026-05-04 10:00:00'),
('cmp_evt_024','cmp_008','regulator_complaint.resolved','referred_to_licensee','resolved','demo_regulator_001','respondent','Licensee reversed the duplicate charge and credited the account; matter resolved','2026-05-12 11:00:00'),
('cmp_evt_025','cmp_009','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible for screening','2026-03-03 09:00:00'),
('cmp_evt_026','cmp_009','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred for response','2026-03-06 10:00:00'),
('cmp_evt_027','cmp_009','regulator_complaint.escalated','referred_to_licensee','under_investigation','demo_regulator_001','adjudicator','Escalated to investigation given the scale','2026-03-20 11:00:00'),
('cmp_evt_028','cmp_009','regulator_complaint.dismissed','under_investigation','dismissed','demo_regulator_001','adjudicator','Dismissed for want of jurisdiction and merit; national-scale dismissal reported to the NERSA Council','2026-04-15 12:00:00'),
('cmp_evt_029','cmp_010','regulator_complaint.admissibility_review','complaint_lodged','admissibility_review','demo_regulator_001','adjudicator','Admissible','2026-01-17 09:00:00'),
('cmp_evt_030','cmp_010','regulator_complaint.referred','admissibility_review','referred_to_licensee','demo_regulator_001','adjudicator','Referred to the transmission licensee','2026-01-20 10:00:00'),
('cmp_evt_031','cmp_010','regulator_complaint.escalated','referred_to_licensee','under_investigation','demo_regulator_001','adjudicator','Escalated to investigation','2026-02-05 11:00:00'),
('cmp_evt_032','cmp_010','regulator_complaint.hearing_convened','under_investigation','adjudication_hearing','demo_regulator_001','adjudicator','Adjudication hearing held directly after investigation','2026-03-01 12:00:00'),
('cmp_evt_033','cmp_010','regulator_complaint.ruling_issued','adjudication_hearing','ruling_issued','demo_regulator_001','adjudicator','Binding ruling upheld the use-of-system tariff','2026-03-25 13:00:00'),
('cmp_evt_034','cmp_010','regulator_complaint.appealed','ruling_issued','appealed','demo_regulator_001','complainant','Complainant lodged a judicial-review appeal; referred to the NERSA Council and the High Court roll','2026-04-20 14:00:00');
