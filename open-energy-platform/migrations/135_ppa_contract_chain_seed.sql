-- ═══════════════════════════════════════════════════════════════════════════
-- Wave 22 — PPA contract execution lifecycle seed.
--
-- 10 PPAs across all 9 lifecycle states (one each, plus one extra in_force).
-- Mix of strategic / medium / small tiers + spread of offtaker counterparties.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO oe_ppa_contract_chain (
  id, ppa_number, project_id, facility_id, participant_id, offtaker_id,
  project_name, offtaker_name, contract_term_years, capacity_mw, capacity_tier,
  tariff_zar_per_mwh, indexation, take_or_pay_pct, chain_status,
  draft_at, negotiation_at, terms_locked_at, legal_signed_at, executed_at, in_force_at,
  dispute_at, resolved_at, terminated_at, expired_at, cancelled_at,
  nersa_section34_ref, legal_counterparty_ref, board_approval_ref,
  termination_reason, cancellation_reason, dispute_notes, contract_notes,
  expiry_date, sla_deadline_at, escalation_level, created_by, created_at
) VALUES
  -- 1. draft (strategic) — Mainstream / Eskom
  ('ppa_001','PPA-2026-0001','proj_kuruman_solar',NULL,'p_ipp_mainstream','p_offtaker_eskom',
   'Kuruman 200MW Solar PV','Eskom (single-buyer)',20,200,'strategic',
   985.00,'cpi_+_1.5pct',92,'draft',
   '2026-05-20T08:00:00Z',NULL,NULL,NULL,NULL,NULL,
   NULL,NULL,NULL,NULL,NULL,
   NULL,NULL,NULL, NULL,NULL,NULL,'REIPPPP Bid Window 7 award template',
   NULL,'2026-08-18T08:00:00Z',0,'p_ipp_mainstream','2026-05-20T08:00:00Z'),

  -- 2. in_negotiation (medium) — Engie / City of Cape Town
  ('ppa_002','PPA-2026-0002','proj_atlantis_wind',NULL,'p_ipp_engie','p_offtaker_cct',
   'Atlantis 75MW Wind','City of Cape Town',15,75,'medium',
   1240.00,'cpi_only',88,'in_negotiation',
   '2026-03-01T08:00:00Z','2026-04-15T08:00:00Z',NULL,NULL,NULL,NULL,
   NULL,NULL,NULL,NULL,NULL,
   NULL,NULL,NULL, NULL,NULL,NULL,'Negotiation focused on indexation cap and curtailment compensation',
   NULL,'2026-07-14T08:00:00Z',0,'p_offtaker_cct','2026-03-01T08:00:00Z'),

  -- 3. terms_locked (strategic) — Scatec / Sasol
  ('ppa_003','PPA-2026-0003','proj_secunda_solar',NULL,'p_ipp_scatec','p_offtaker_sasol',
   'Secunda 250MW Solar (Corporate PPA)','Sasol Synfuels',25,250,'strategic',
   875.00,'cpi_+_0.5pct_capped_at_6pct',95,'terms_locked',
   '2026-01-15T08:00:00Z','2026-02-20T08:00:00Z','2026-05-10T16:00:00Z',NULL,NULL,NULL,
   NULL,NULL,NULL,NULL,NULL,
   NULL,'Webber Wentzel + Cliffe Dekker',NULL, NULL,NULL,NULL,'Wheeling agreement with Eskom Tx attached as Schedule 7',
   NULL,'2026-07-09T16:00:00Z',0,'p_offtaker_sasol','2026-01-15T08:00:00Z'),

  -- 4. legal_signed (medium) — Globaleleq / Anglo American
  ('ppa_004','PPA-2026-0004','proj_mogalakwena_solar',NULL,'p_ipp_globaleleq','p_offtaker_anglo',
   'Mogalakwena 90MW Solar (Mining Wheeling)','Anglo American Platinum',20,90,'medium',
   1095.00,'cpi_+_1pct',85,'legal_signed',
   '2025-11-01T08:00:00Z','2025-12-10T08:00:00Z','2026-03-20T08:00:00Z','2026-05-22T14:00:00Z',NULL,NULL,
   NULL,NULL,NULL,NULL,NULL,
   NULL,'Bowmans + ENS',NULL, NULL,NULL,NULL,'Awaiting IPP board sign-off (DBSA + IFC syndicate)',
   NULL,'2026-06-05T14:00:00Z',0,'p_offtaker_anglo','2025-11-01T08:00:00Z'),

  -- 5. executed (strategic) — BioTherm / Eskom
  ('ppa_005','PPA-2026-0005','proj_loeriesfontein2',NULL,'p_ipp_biotherm','p_offtaker_eskom',
   'Loeriesfontein 2 140MW Wind','Eskom',20,140,'strategic',
   962.00,'cpi_+_1.25pct',92,'executed',
   '2025-08-15T08:00:00Z','2025-09-20T08:00:00Z','2025-12-15T08:00:00Z','2026-01-22T14:00:00Z','2026-02-28T11:00:00Z',NULL,
   NULL,NULL,NULL,NULL,NULL,
   'NERSA-S34-2026-0017','Webber Wentzel','BR-2026-019', NULL,NULL,NULL,'COD-driven commencement scheduled 2026-09-30 per W20 milestones',
   '2046-02-28','2027-08-23T11:00:00Z',0,'p_ipp_biotherm','2025-08-15T08:00:00Z'),

  -- 6. in_force (strategic) — IFC syndicate / Eskom (Roggeveld, ties to W21 dd_006)
  ('ppa_006','PPA-2026-0006','proj_roggeveld','f_roggeveld','p_ipp_roggeveld','p_offtaker_eskom',
   'Roggeveld 147MW Wind','Eskom',20,147,'strategic',
   973.50,'cpi_+_1pct',92,'in_force',
   '2024-03-01T08:00:00Z','2024-04-10T08:00:00Z','2024-08-20T08:00:00Z','2024-10-05T14:00:00Z','2024-12-01T11:00:00Z','2025-06-15T12:00:00Z',
   NULL,NULL,NULL,NULL,NULL,
   'NERSA-S34-2024-0042','Cliffe Dekker','BR-2024-088', NULL,NULL,NULL,'Active; 47MW avg dispatch · 100pct uptime YTD',
   '2044-12-01',NULL,0,'p_ipp_roggeveld','2024-03-01T08:00:00Z'),

  -- 7. in_dispute (medium) — EDF / Tronox
  ('ppa_007','PPA-2026-0007','proj_namakwa_solar','f_namakwa','p_ipp_edf','p_offtaker_tronox',
   'Namakwa Sands 60MW Solar','Tronox SA',15,60,'medium',
   1180.00,'cpi_+_1.5pct',80,'in_dispute',
   '2024-06-01T08:00:00Z','2024-07-15T08:00:00Z','2024-10-20T08:00:00Z','2024-11-30T14:00:00Z','2025-01-15T11:00:00Z','2025-08-01T12:00:00Z',
   '2026-04-12T09:30:00Z',NULL,NULL,NULL,NULL,
   NULL,'ENS Africa','BR-2024-051', NULL,NULL,'Tronox disputes deemed-delivery clause during 2026-02 grid curtailment events totalling 17,400MWh','Awaiting arbitration outcome — JAMS Cape Town',
   '2040-01-15','2026-04-26T09:30:00Z',1,'p_offtaker_tronox','2024-06-01T08:00:00Z'),

  -- 8. terminated (strategic) — Defunct / Eskom (early termination after PPA collapse)
  ('ppa_008','PPA-2026-0008','proj_vredendal_bess',NULL,'p_ipp_blackrhino','p_offtaker_eskom',
   'Vredendal 100MW BESS','Eskom',15,100,'strategic',
   1850.00,'cpi_+_2pct',98,'terminated',
   '2025-02-01T08:00:00Z','2025-03-15T08:00:00Z','2025-06-20T08:00:00Z','2025-08-05T14:00:00Z','2025-09-15T11:00:00Z',NULL,
   NULL,NULL,'2026-05-18T16:00:00Z',NULL,NULL,
   'NERSA-S34-2025-0028','Webber Wentzel','BR-2025-067', 'Sponsor walk-away post construction overrun; bond claw-back invoked',NULL,NULL,'Linked to W21 dd_010 cancellation',
   '2040-09-15',NULL,0,'p_ipp_blackrhino','2025-02-01T08:00:00Z'),

  -- 9. expired (small) — Original 2005-vintage REFIT PPA
  ('ppa_009','PPA-2026-0009','proj_darling_wind',NULL,'p_ipp_darling','p_offtaker_eskom',
   'Darling 5.2MW Wind (REFIT vintage)','Eskom',20,5.2,'small',
   1280.00,'cpi_only',75,'expired',
   '2005-07-01T08:00:00Z','2005-08-15T08:00:00Z','2005-11-20T08:00:00Z','2005-12-30T14:00:00Z','2006-02-10T11:00:00Z','2006-05-22T12:00:00Z',
   NULL,NULL,NULL,'2026-05-22T00:00:00Z',NULL,
   NULL,NULL,'BR-2005-003', NULL,NULL,NULL,'Original REFIT contract expired at 20-year term; re-tender pending',
   '2026-05-22',NULL,0,'p_ipp_darling','2005-07-01T08:00:00Z'),

  -- 10. cancelled (medium) — Pre-execution cancellation (sponsor withdrew)
  ('ppa_010','PPA-2026-0010','proj_kangnas_ext',NULL,'p_ipp_lekela','p_offtaker_eskom',
   'Kangnas Ext 30MW Wind','Eskom',20,30,'medium',
   1120.00,'cpi_+_1pct',88,'cancelled',
   '2025-12-01T08:00:00Z','2026-01-20T08:00:00Z','2026-03-15T08:00:00Z',NULL,NULL,NULL,
   NULL,NULL,NULL,NULL,'2026-04-30T16:00:00Z',
   NULL,'Bowmans',NULL, NULL,'Sponsor (Lekela) withdrew post Group Five EPC liquidation; project abandoned',NULL,'Pre-execution cancellation, no termination penalty',
   NULL,NULL,0,'p_offtaker_eskom','2025-12-01T08:00:00Z');

-- ─── Audit chain seed ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO oe_ppa_contract_chain_events (id, ppa_id, event_type, from_status, to_status, actor_id, notes, payload, created_at) VALUES
  -- ppa_001 draft
  ('ppa_evt_001','ppa_001','created',NULL,'draft','p_ipp_mainstream','Initial REIPPPP BW7 template populated',NULL,'2026-05-20T08:00:00Z'),

  -- ppa_002 in_negotiation
  ('ppa_evt_002','ppa_002','created',NULL,'draft','p_offtaker_cct','Draft prepared from CCT IPP procurement template',NULL,'2026-03-01T08:00:00Z'),
  ('ppa_evt_003','ppa_002','negotiation_started','draft','in_negotiation','p_offtaker_cct','Sent to Engie for review',NULL,'2026-04-15T08:00:00Z'),

  -- ppa_003 terms_locked
  ('ppa_evt_004','ppa_003','created',NULL,'draft','p_offtaker_sasol','Corporate PPA draft including wheeling rider',NULL,'2026-01-15T08:00:00Z'),
  ('ppa_evt_005','ppa_003','negotiation_started','draft','in_negotiation','p_ipp_scatec','Scatec engaged Webber Wentzel',NULL,'2026-02-20T08:00:00Z'),
  ('ppa_evt_006','ppa_003','terms_locked','in_negotiation','terms_locked','p_offtaker_sasol','Tariff R875/MWh + CPI+0.5pct capped at 6pct',NULL,'2026-05-10T16:00:00Z'),

  -- ppa_004 legal_signed
  ('ppa_evt_007','ppa_004','created',NULL,'draft','p_offtaker_anglo','Mining wheeling agreement template',NULL,'2025-11-01T08:00:00Z'),
  ('ppa_evt_008','ppa_004','negotiation_started','draft','in_negotiation','p_ipp_globaleleq','Bowmans + ENS engaged',NULL,'2025-12-10T08:00:00Z'),
  ('ppa_evt_009','ppa_004','terms_locked','in_negotiation','terms_locked','p_offtaker_anglo','Tariff agreed R1095/MWh',NULL,'2026-03-20T08:00:00Z'),
  ('ppa_evt_010','ppa_004','legal_signed','terms_locked','legal_signed','p_offtaker_anglo','Both legal teams signed off',NULL,'2026-05-22T14:00:00Z'),

  -- ppa_005 executed (strategic — CROSSES TO REGULATOR)
  ('ppa_evt_011','ppa_005','created',NULL,'draft','p_ipp_biotherm','BW6 award template',NULL,'2025-08-15T08:00:00Z'),
  ('ppa_evt_012','ppa_005','negotiation_started','draft','in_negotiation','p_offtaker_eskom',NULL,NULL,'2025-09-20T08:00:00Z'),
  ('ppa_evt_013','ppa_005','terms_locked','in_negotiation','terms_locked','p_offtaker_eskom','R962/MWh + CPI+1.25pct, 92pct take-or-pay',NULL,'2025-12-15T08:00:00Z'),
  ('ppa_evt_014','ppa_005','legal_signed','terms_locked','legal_signed','p_offtaker_eskom','Webber Wentzel sign-off',NULL,'2026-01-22T14:00:00Z'),
  ('ppa_evt_015','ppa_005','executed','legal_signed','executed','p_offtaker_eskom','NERSA-S34-2026-0017 lodged · BR-2026-019','{"nersa_section34_ref":"NERSA-S34-2026-0017","board_approval_ref":"BR-2026-019"}','2026-02-28T11:00:00Z'),

  -- ppa_006 in_force
  ('ppa_evt_016','ppa_006','created',NULL,'draft','p_ipp_roggeveld','BW5 award template',NULL,'2024-03-01T08:00:00Z'),
  ('ppa_evt_017','ppa_006','negotiation_started','draft','in_negotiation','p_offtaker_eskom',NULL,NULL,'2024-04-10T08:00:00Z'),
  ('ppa_evt_018','ppa_006','terms_locked','in_negotiation','terms_locked','p_offtaker_eskom','R973.50/MWh + CPI+1pct',NULL,'2024-08-20T08:00:00Z'),
  ('ppa_evt_019','ppa_006','legal_signed','terms_locked','legal_signed','p_offtaker_eskom','Cliffe Dekker sign-off',NULL,'2024-10-05T14:00:00Z'),
  ('ppa_evt_020','ppa_006','executed','legal_signed','executed','p_offtaker_eskom','NERSA-S34-2024-0042','{"nersa_section34_ref":"NERSA-S34-2024-0042"}','2024-12-01T11:00:00Z'),
  ('ppa_evt_021','ppa_006','commenced','executed','in_force','p_offtaker_eskom','COD achieved 2025-06-15 (linked W20 cod_006)',NULL,'2025-06-15T12:00:00Z'),

  -- ppa_007 in_dispute
  ('ppa_evt_022','ppa_007','created',NULL,'draft','p_offtaker_tronox','Mining wheeling template',NULL,'2024-06-01T08:00:00Z'),
  ('ppa_evt_023','ppa_007','negotiation_started','draft','in_negotiation','p_ipp_edf',NULL,NULL,'2024-07-15T08:00:00Z'),
  ('ppa_evt_024','ppa_007','terms_locked','in_negotiation','terms_locked','p_offtaker_tronox',NULL,NULL,'2024-10-20T08:00:00Z'),
  ('ppa_evt_025','ppa_007','legal_signed','terms_locked','legal_signed','p_offtaker_tronox',NULL,NULL,'2024-11-30T14:00:00Z'),
  ('ppa_evt_026','ppa_007','executed','legal_signed','executed','p_offtaker_tronox',NULL,NULL,'2025-01-15T11:00:00Z'),
  ('ppa_evt_027','ppa_007','commenced','executed','in_force','p_offtaker_tronox','COD achieved 2025-08-01',NULL,'2025-08-01T12:00:00Z'),
  ('ppa_evt_028','ppa_007','disputed','in_force','in_dispute','p_offtaker_tronox','Deemed-delivery clause dispute on 17,400MWh during 2026-02 grid curtailment',NULL,'2026-04-12T09:30:00Z'),

  -- ppa_008 terminated (strategic — CROSSES TO REGULATOR)
  ('ppa_evt_029','ppa_008','created',NULL,'draft','p_ipp_blackrhino','BESS template',NULL,'2025-02-01T08:00:00Z'),
  ('ppa_evt_030','ppa_008','negotiation_started','draft','in_negotiation','p_offtaker_eskom',NULL,NULL,'2025-03-15T08:00:00Z'),
  ('ppa_evt_031','ppa_008','terms_locked','in_negotiation','terms_locked','p_offtaker_eskom',NULL,NULL,'2025-06-20T08:00:00Z'),
  ('ppa_evt_032','ppa_008','legal_signed','terms_locked','legal_signed','p_offtaker_eskom',NULL,NULL,'2025-08-05T14:00:00Z'),
  ('ppa_evt_033','ppa_008','executed','legal_signed','executed','p_offtaker_eskom','NERSA-S34-2025-0028','{"nersa_section34_ref":"NERSA-S34-2025-0028"}','2025-09-15T11:00:00Z'),
  ('ppa_evt_034','ppa_008','terminated','executed','terminated','p_offtaker_eskom','Sponsor walk-away; bond claw-back invoked (linked W21 dd_010)','{"reason":"Sponsor walk-away post construction overrun; bond claw-back invoked"}','2026-05-18T16:00:00Z'),

  -- ppa_009 expired
  ('ppa_evt_035','ppa_009','created',NULL,'draft','p_ipp_darling','REFIT vintage',NULL,'2005-07-01T08:00:00Z'),
  ('ppa_evt_036','ppa_009','commenced','executed','in_force','p_offtaker_eskom','COD 2006-05-22',NULL,'2006-05-22T12:00:00Z'),
  ('ppa_evt_037','ppa_009','expired','in_force','expired','p_offtaker_eskom','20-year term reached',NULL,'2026-05-22T00:00:00Z'),

  -- ppa_010 cancelled
  ('ppa_evt_038','ppa_010','created',NULL,'draft','p_offtaker_eskom','BW7 template',NULL,'2025-12-01T08:00:00Z'),
  ('ppa_evt_039','ppa_010','negotiation_started','draft','in_negotiation','p_ipp_lekela',NULL,NULL,'2026-01-20T08:00:00Z'),
  ('ppa_evt_040','ppa_010','terms_locked','in_negotiation','terms_locked','p_offtaker_eskom',NULL,NULL,'2026-03-15T08:00:00Z'),
  ('ppa_evt_041','ppa_010','cancelled','terms_locked','cancelled','p_offtaker_eskom','Sponsor (Lekela) withdrew post Group Five EPC liquidation','{"reason":"Sponsor (Lekela) withdrew post Group Five EPC liquidation; project abandoned"}','2026-04-30T16:00:00Z');
