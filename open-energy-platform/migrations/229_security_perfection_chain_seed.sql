-- Wave 69 seed — 10 security / collateral perfection cases spanning 10 of the 12
-- lifecycle states and all 5 severity tiers. Exactly 3 are reportable, and between
-- them they prove all three signature crossings:
--   - spf_008 defective / critical (reject_registration crosses for critical only)
--   - spf_009 perfection_overdue / major (flag_overdue crosses for the high tiers)
--   - spf_010 lapsed / critical (mark_lapsed crosses for EVERY tier — the W69 signature)
--
-- Cases 4, 5, 7, 8, 9, 10 demonstrate the CP floor: a condition-precedent-to-
-- drawdown item is floored to at least 'major' regardless of value (spf_004 a
-- R300m mortgage bond that would otherwise be 'material' is floored to 'major').
--
-- INSERT OR IGNORE keeps this replay-safe; explicit column lists guard against
-- column drift. Timestamps are illustrative ISO-8601 (UTC).

INSERT OR IGNORE INTO oe_security_perfection (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  facility_id, facility_name, borrower_id, borrower_name, project_id, project_name,
  security_type, security_description, registry, secured_value_zar, ranking, perfection_critical, cross_border, severity_tier,
  security_agent_id, security_agent_name, grantor_id, grantor_name,
  document_ref, lodgement_ref, registration_ref, perfection_ref, legal_opinion_ref, release_ref,
  documentation_basis, execution_basis, lodgement_basis, registration_basis, defect_basis, perfection_basis, overdue_basis, release_basis, lapse_basis, reason_code, resolution_summary,
  chain_status,
  identified_at, documentation_pending_at, executed_at, lodged_for_registration_at, registered_at, perfection_review_at, perfected_at, defective_at, perfection_overdue_at, released_at, lapsed_at, withdrawn_at,
  perfection_deadline_at, relodge_round, sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES
-- 1. identified / minor — share pledge just identified in the package
('spf_001','SPF-2026-0001',
 NULL,NULL,NULL,NULL,
 'fac_kuruman_solar','Kuruman Solar Senior Facility','brw_kuruman','Kuruman Solar Pty','proj_kuruman','Kuruman Solar PV',
 'share_pledge','Pledge and cession of project company shares','strate',6000000,'first',0,0,'minor',
 'party_agentbank','OE Security Agent','party_kuruman','Kuruman Holdings Pty',
 NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Security item identified in the agreed security package',
 'identified',
 '2026-05-20T06:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-08-01T00:00:00Z',0,'2026-06-19T06:00:00Z',NULL,0,0,
 'lender','2026-05-20T06:00:00Z','2026-05-20T06:00:00Z'),

-- 2. documentation_pending / moderate — account cession deed in negotiation
('spf_002','SPF-2026-0002',
 NULL,NULL,NULL,NULL,
 'fac_dassiesfontein_wind','Dassiesfontein Wind Facility','brw_dassies','Dassiesfontein Wind Pty','proj_dassies','Dassiesfontein Wind',
 'cession_accounts','Cession in securitatem debiti of project bank accounts','contractual',45000000,'first',0,0,'moderate',
 'party_agentbank','OE Security Agent','party_dassies','Dassiesfontein Holdings Pty',
 'DOC-2026-0002',NULL,NULL,NULL,NULL,NULL,
 'Account cession deed in negotiation with the borrower legal team',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Security documentation in progress',
 'documentation_pending',
 '2026-05-10T06:00:00Z','2026-05-22T09:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-07-15T00:00:00Z',0,'2026-06-12T09:00:00Z',NULL,0,0,
 'lender','2026-05-22T09:00:00Z','2026-05-22T09:00:00Z'),

-- 3. executed / material — special notarial bond signed before a notary
('spf_003','SPF-2026-0003',
 NULL,NULL,NULL,NULL,
 'fac_brandvalley_bess','Brandvalley BESS Facility','brw_brandvalley','Brandvalley Storage Pty','proj_brandvalley','Brandvalley Battery Storage',
 'special_notarial_bond','Special notarial bond over the battery and inverter equipment','deeds_office',180000000,'first',0,0,'material',
 'party_agentbank','OE Security Agent','party_brandvalley','Brandvalley Holdings Pty',
 'DOC-2026-0003',NULL,NULL,NULL,NULL,NULL,
 'Special notarial bond drafted over identified movable assets','Bond executed by the grantor before a notary public',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Security document executed pending lodgement',
 'executed',
 '2026-04-25T06:00:00Z','2026-05-05T09:00:00Z','2026-05-23T11:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-07-01T00:00:00Z',0,'2026-06-02T11:00:00Z',NULL,0,0,
 'lender','2026-05-23T11:00:00Z','2026-05-23T11:00:00Z'),

-- 4. lodged_for_registration / major (CP floor: R300m material item floored to major)
('spf_004','SPF-2026-0004',
 NULL,NULL,NULL,NULL,
 'fac_grootspruit_solar','Grootspruit Solar Facility','brw_grootspruit','Grootspruit Solar Pty','proj_grootspruit','Grootspruit Solar PV',
 'mortgage_bond','First mortgage bond over the project land','deeds_office',300000000,'first',1,0,'major',
 'party_agentbank','OE Security Agent','party_grootspruit','Grootspruit Holdings Pty',
 'DOC-2026-0004','LDG-2026-0004',NULL,NULL,NULL,NULL,
 NULL,'Bond executed by the grantor','Mortgage bond lodged at the Deeds Office for registration',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Condition-precedent bond lodged for registration',
 'lodged_for_registration',
 '2026-04-10T06:00:00Z','2026-04-20T09:00:00Z','2026-05-08T11:00:00Z','2026-05-21T10:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-30T00:00:00Z',0,'2026-06-11T10:00:00Z',NULL,0,0,
 'lender','2026-05-21T10:00:00Z','2026-05-21T10:00:00Z'),

-- 5. registered / critical — R2.5bn mortgage bond registered, awaiting opinion
('spf_005','SPF-2026-0005',
 NULL,NULL,NULL,NULL,
 'fac_karoo_solar','Karoo Mega Solar Facility','brw_karoo','Karoo Mega Solar Pty','proj_karoo','Karoo Mega Solar Cluster',
 'mortgage_bond','First mortgage bond over the consolidated project estate','deeds_office',2500000000,'first',1,0,'critical',
 'party_agentbank','OE Security Agent','party_karoo','Karoo Holdings Pty',
 'DOC-2026-0005','LDG-2026-0005','REG-2026-0005',NULL,NULL,NULL,
 NULL,NULL,'Bond lodged at the Deeds Office','Mortgage bond registered in the Deeds Office register',NULL,NULL,NULL,NULL,NULL,NULL,'Bond registered awaiting the perfection legal opinion',
 'registered',
 '2026-03-15T06:00:00Z','2026-03-25T09:00:00Z','2026-04-10T11:00:00Z','2026-04-20T10:00:00Z','2026-05-24T12:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-01T00:00:00Z',0,'2026-05-25T12:00:00Z',NULL,0,0,
 'lender','2026-05-24T12:00:00Z','2026-05-24T12:00:00Z'),

-- 6. perfection_review / material — STRATE share pledge, opinion under review
('spf_006','SPF-2026-0006',
 NULL,NULL,NULL,NULL,
 'fac_olifants_hydro','Olifants Hydro Facility','brw_olifants','Olifants Hydro Pty','proj_olifants','Olifants Run-of-River Hydro',
 'strate_pledge','Pledge of dematerialised shares through the CSDP','strate',250000000,'first',0,0,'material',
 'party_agentbank','OE Security Agent','party_olifants','Olifants Holdings Pty',
 'DOC-2026-0006',NULL,'REG-2026-0006',NULL,'OPN-2026-0006',NULL,
 NULL,NULL,NULL,'Pledge flagged in the STRATE register through the CSDP','Perfection legal opinion under review by external counsel',NULL,NULL,NULL,NULL,NULL,'Perfection legal opinion in review',
 'perfection_review',
 '2026-03-20T06:00:00Z','2026-03-28T09:00:00Z','2026-04-12T11:00:00Z','2026-04-22T10:00:00Z','2026-05-10T12:00:00Z','2026-05-24T09:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-06-10T00:00:00Z',0,'2026-05-29T09:00:00Z',NULL,0,0,
 'lender','2026-05-24T09:00:00Z','2026-05-24T09:00:00Z'),

-- 7. perfected / major — general notarial bond, clean perfection opinion
('spf_007','SPF-2026-0007',
 NULL,NULL,NULL,NULL,
 'fac_namaqua_wind','Namaqua Wind Facility','brw_namaqua','Namaqua Wind Pty','proj_namaqua','Namaqua Wind Farm',
 'general_notarial_bond','General notarial bond over the borrower movable estate','deeds_office',800000000,'first',1,0,'major',
 'party_agentbank','OE Security Agent','party_namaqua','Namaqua Holdings Pty',
 'DOC-2026-0007','LDG-2026-0007','REG-2026-0007','PRF-2026-0007','OPN-2026-0007',NULL,
 NULL,NULL,NULL,NULL,NULL,'Perfection legal opinion delivered clean — security enforceable and first-ranking',NULL,NULL,NULL,NULL,'Security item perfected and first-ranking',
 'perfected',
 '2026-02-10T06:00:00Z','2026-02-20T09:00:00Z','2026-03-05T11:00:00Z','2026-03-15T10:00:00Z','2026-04-10T12:00:00Z','2026-04-20T09:00:00Z','2026-05-15T10:00:00Z',NULL,NULL,NULL,NULL,NULL,
 '2026-05-01T00:00:00Z',0,NULL,NULL,0,0,
 'lender','2026-05-15T10:00:00Z','2026-05-15T10:00:00Z'),

-- 8. defective / critical — Deeds Office rejected the bond [REPORTABLE: reject_registration crosses critical]
('spf_008','SPF-2026-0008',
 NULL,NULL,NULL,NULL,
 'fac_vaal_solar','Vaal Mega Solar Facility','brw_vaal','Vaal Mega Solar Pty','proj_vaal','Vaal Mega Solar',
 'mortgage_bond','First mortgage bond over the project estate','deeds_office',2200000000,'first',1,0,'critical',
 'party_agentbank','OE Security Agent','party_vaal','Vaal Holdings Pty',
 'DOC-2026-0008','LDG-2026-0008',NULL,NULL,NULL,NULL,
 NULL,NULL,'Bond lodged at the Deeds Office','','Deeds Office rejected the bond for a defective property description requiring re-lodgement',NULL,NULL,NULL,NULL,'registry_rejection','Bond rejected by the Deeds Office pending re-lodgement',
 'defective',
 '2026-03-01T06:00:00Z','2026-03-10T09:00:00Z','2026-04-01T11:00:00Z','2026-04-15T10:00:00Z',NULL,NULL,NULL,'2026-05-22T13:00:00Z',NULL,NULL,NULL,NULL,
 '2026-06-05T00:00:00Z',1,'2026-05-23T13:00:00Z',NULL,1,1,
 'lender','2026-05-22T13:00:00Z','2026-05-22T13:00:00Z'),

-- 9. perfection_overdue / major — CS perfection deadline missed [REPORTABLE: flag_overdue crosses high tiers]
('spf_009','SPF-2026-0009',
 NULL,NULL,NULL,NULL,
 'fac_drakensberg_phs','Drakensberg Pumped-Storage Facility','brw_drakensberg','Drakensberg Storage Pty','proj_drakensberg','Drakensberg Pumped Storage',
 'cession_insurance','Cession of insurance proceeds with the lender as first loss payee','contractual',600000000,'first',1,0,'major',
 'party_agentbank','OE Security Agent','party_drakensberg','Drakensberg Holdings Pty',
 'DOC-2026-0009',NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,'Condition-subsequent perfection deadline missed — insurer loss-payee endorsement still outstanding',NULL,NULL,'cs_deadline_missed','Perfection overdue and escalated to the credit committee',
 'perfection_overdue',
 '2026-02-20T06:00:00Z','2026-03-01T09:00:00Z','2026-03-20T11:00:00Z',NULL,NULL,NULL,NULL,NULL,'2026-05-20T08:00:00Z',NULL,NULL,NULL,
 '2026-05-15T00:00:00Z',0,'2026-05-21T08:00:00Z',NULL,1,2,
 'lender','2026-05-20T08:00:00Z','2026-05-20T08:00:00Z'),

-- 10. lapsed / critical — security lost unperfected after two re-lodgements [REPORTABLE: mark_lapsed crosses every tier]
('spf_010','SPF-2026-0010',
 NULL,NULL,NULL,NULL,
 'fac_limpopo_solar','Limpopo Mega Solar Facility','brw_limpopo','Limpopo Mega Solar Pty','proj_limpopo','Limpopo Mega Solar',
 'special_notarial_bond','Special notarial bond over the module and tracker assets','deeds_office',3000000000,'first',1,0,'critical',
 'party_agentbank','OE Security Agent','party_limpopo','Limpopo Holdings Pty',
 'DOC-2026-0010','LDG-2026-0010',NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,'Bond repeatedly rejected for defective asset schedules',NULL,'Perfection deadline elapsed across two re-lodgement attempts',NULL,'Security lapsed unperfected — facility now under-secured and impairment recognised','perfection_failed','Security item lapsed unperfected and notified to the Prudential Authority',
 'lapsed',
 '2026-01-15T06:00:00Z','2026-01-25T09:00:00Z','2026-02-10T11:00:00Z','2026-02-20T10:00:00Z',NULL,NULL,NULL,'2026-03-15T13:00:00Z','2026-04-20T08:00:00Z',NULL,'2026-05-18T15:00:00Z',NULL,
 '2026-04-01T00:00:00Z',2,NULL,NULL,1,3,
 'lender','2026-05-18T15:00:00Z','2026-05-18T15:00:00Z');

INSERT OR IGNORE INTO oe_security_perfection_events (
  id, perfection_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at
) VALUES
('spf_evt_001','spf_002','security_perfection.documentation_pending','identified','documentation_pending','party_agentbank','security_agent','Account cession deed drafting begun',NULL,'2026-05-22T09:00:00Z'),
('spf_evt_002','spf_003','security_perfection.executed','documentation_pending','executed','party_brandvalley','grantor','Special notarial bond executed before a notary public',NULL,'2026-05-23T11:00:00Z'),
('spf_evt_003','spf_004','security_perfection.lodged_for_registration','executed','lodged_for_registration','party_agentbank','security_agent','Mortgage bond lodged at the Deeds Office',NULL,'2026-05-21T10:00:00Z'),
('spf_evt_004','spf_005','security_perfection.registered','lodged_for_registration','registered','party_agentbank','security_agent','Mortgage bond registered in the Deeds Office register',NULL,'2026-05-24T12:00:00Z'),
('spf_evt_005','spf_006','security_perfection.perfection_review','registered','perfection_review','party_agentbank','security_agent','Perfection legal opinion sent to external counsel',NULL,'2026-05-24T09:00:00Z'),
('spf_evt_006','spf_007','security_perfection.perfected','perfection_review','perfected','party_agentbank','security_agent','Clean perfection opinion delivered — first-ranking security confirmed',NULL,'2026-05-15T10:00:00Z'),
('spf_evt_007','spf_008','security_perfection.defective','lodged_for_registration','defective','party_agentbank','security_agent','Deeds Office rejected the bond for a defective property description',NULL,'2026-05-22T13:00:00Z'),
('spf_evt_008','spf_009','security_perfection.perfection_overdue','executed','perfection_overdue','party_agentbank','security_agent','Condition-subsequent perfection deadline missed',NULL,'2026-05-20T08:00:00Z'),
('spf_evt_009','spf_010','security_perfection.lapsed','perfection_overdue','lapsed','party_agentbank','security_agent','Security lapsed unperfected and notified to the Prudential Authority',NULL,'2026-05-18T15:00:00Z');
