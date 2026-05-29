-- Wave 70 seed — 10 REC / Guarantee-of-Origin certificate lifecycle cases spanning
-- 10 of the 12 lifecycle states (every state except cancelled and expired) and all
-- 5 severity tiers. Exactly 3 are reportable, and between them they prove all three
-- regulator crossings:
--   - rec_008 disputed / critical (a high-tier SLA breach crosses — last_sla_breach_at set)
--   - rec_009 rejected / critical (reject_issuance crosses for the high tiers)
--   - rec_010 clawed_back / moderate (claw_back crosses for EVERY tier — the W70
--        signature; demonstrated at a NON-high tier to prove it crosses regardless)
--
-- rec_004 demonstrates the COMPLIANCE FLOOR: a 30 000 MWh certificate that would be
-- 'material' by volume is floored to 'major' because it is destined for a
-- carbon-tax-offset compliance claim (compliance_critical = 1).
--
-- INSERT OR IGNORE keeps this replay-safe; explicit column lists guard against
-- column drift. Timestamps are illustrative ISO-8601 (UTC). created_by = offtaker.

INSERT OR IGNORE INTO oe_rec_lifecycle (
  id, case_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  generator_id, generator_name, project_id, project_name, offtaker_id, offtaker_name,
  certificate_standard, energy_source, certificate_serial, vintage_year, generation_period_start, generation_period_end, mwh_represented, registry, claim_purpose, compliance_critical, double_counting_checked, severity_tier,
  issuer_id, issuer_name, holder_id, holder_name,
  issuance_ref, eligibility_ref, transfer_ref, allocation_ref, retirement_ref, dispute_ref, claim_certificate_number,
  eligibility_basis, issuance_basis, transfer_basis, allocation_basis, retirement_basis, dispute_basis, clawback_basis, rejection_basis, reason_code, resolution_summary,
  chain_status,
  issuance_requested_at, eligibility_review_at, issued_at, listed_for_transfer_at, transferred_at, allocated_at, retired_at, cancelled_at, rejected_at, disputed_at, clawed_back_at, expired_at,
  vintage_expiry_at, dispute_round, sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES
-- 1. issuance_requested / minor — small voluntary solar attribute just lodged
('rec_001','REC-2026-0001',
 NULL,NULL,NULL,NULL,
 'gen_aggeneys','Aggeneys Solar Generator','proj_aggeneys','Aggeneys Solar PV','off_voltalpha','Voltalpha Industrial Offtaker',
 'i_rec','solar_pv','IREC-ZA-2026-0001',2026,'2026-04-01','2026-04-30',500,'i_rec_registry','voluntary',0,0,'minor',
 'reg_irecza','I-REC Registry Operator ZA','off_voltalpha','Voltalpha Industrial Offtaker',
 'ISS-2026-0001',NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,'Issuance requested for April 2026 solar generation attribute',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Issuance request lodged with the registry',
 'issuance_requested',
 '2026-05-27T06:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,'2026-05-30T06:00:00Z',NULL,0,0,
 'offtaker','2026-05-27T06:00:00Z','2026-05-27T06:00:00Z'),

-- 2. eligibility_review / moderate — wind attribute under accreditation review
('rec_002','REC-2026-0002',
 NULL,NULL,NULL,NULL,
 'gen_loeriesfontein','Loeriesfontein Wind Generator','proj_loeries','Loeriesfontein Wind','off_metromall','Metromall Retail Group',
 'i_rec','wind','IREC-ZA-2026-0002',2026,'2026-03-01','2026-03-31',6000,'i_rec_registry','scope2_market_based',0,0,'moderate',
 'reg_irecza','I-REC Registry Operator ZA','off_metromall','Metromall Retail Group',
 'ISS-2026-0002','ELG-2026-0002',NULL,NULL,NULL,NULL,NULL,
 'Eligibility review of accreditation, vintage and metering underway','Issuance requested for March 2026 wind generation attribute',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Eligibility review opened on the issuance request',
 'eligibility_review',
 '2026-05-24T06:00:00Z','2026-05-26T08:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,'2026-06-02T08:00:00Z',NULL,0,0,
 'offtaker','2026-05-24T06:00:00Z','2026-05-26T08:00:00Z'),

-- 3. issued / material — SAREC solar attribute issued, awaiting listing
('rec_003','REC-2026-0003',
 NULL,NULL,NULL,NULL,
 'gen_prieska','Prieska Solar Generator','proj_prieska','Prieska Solar PV','off_aurummine','Aurum Gold Mining',
 'sarec','solar_pv','SAREC-2026-0003',2026,'2026-02-01','2026-02-28',35000,'national_registry','re100',0,0,'material',
 'reg_sanrec','SA National REC Registry','off_aurummine','Aurum Gold Mining',
 'ISS-2026-0003','ELG-2026-0003',NULL,NULL,NULL,NULL,NULL,
 'Eligibility verified against the national accreditation register','Certificate issued for verified renewable generation',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Certificate issued and awaiting listing for transfer',
 'issued',
 '2026-05-10T06:00:00Z','2026-05-14T08:00:00Z','2026-05-20T10:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,'2026-07-19T10:00:00Z',NULL,0,0,
 'offtaker','2026-05-10T06:00:00Z','2026-05-20T10:00:00Z'),

-- 4. listed_for_transfer / major (COMPLIANCE FLOOR: 30 000 MWh material floored to major)
('rec_004','REC-2026-0004',
 NULL,NULL,NULL,NULL,
 'gen_kathu','Kathu Solar Generator','proj_kathu','Kathu Solar Park','off_synthpetro','Synthpetro Refineries',
 'arep','solar_pv','AREP-2026-0004',2026,'2026-01-01','2026-01-31',30000,'national_registry','carbon_tax_offset',1,0,'major',
 'reg_sanrec','SA National REC Registry','off_synthpetro','Synthpetro Refineries',
 'ISS-2026-0004','ELG-2026-0004',NULL,NULL,NULL,NULL,NULL,
 'Eligibility verified for a carbon-tax-offset compliance claim','Certificate issued for verified renewable generation',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Compliance-bound certificate listed for transfer to the offtaker',
 'listed_for_transfer',
 '2026-05-05T06:00:00Z','2026-05-09T08:00:00Z','2026-05-16T10:00:00Z','2026-05-22T11:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,'2026-07-06T11:00:00Z',NULL,0,0,
 'offtaker','2026-05-05T06:00:00Z','2026-05-22T11:00:00Z'),

-- 5. transferred / critical — large wind attribute transferred to a hyperscaler
('rec_005','REC-2026-0005',
 NULL,NULL,NULL,NULL,
 'gen_roggeveld','Roggeveld Wind Generator','proj_roggeveld','Roggeveld Wind Farm','off_datacore','Datacore Hyperscale',
 'i_rec','wind','IREC-ZA-2026-0005',2026,'2026-01-01','2026-03-31',250000,'i_rec_registry','re100',0,0,'critical',
 'reg_irecza','I-REC Registry Operator ZA','off_datacore','Datacore Hyperscale',
 'ISS-2026-0005','ELG-2026-0005','TRF-2026-0005',NULL,NULL,NULL,NULL,
 'Eligibility verified against the I-REC accreditation register','Certificate issued for verified renewable generation','Certificate transferred to the holder registry account',NULL,NULL,NULL,NULL,NULL,NULL,'Certificate transferred to the holder pending consumption allocation',
 'transferred',
 '2026-04-20T06:00:00Z','2026-04-28T08:00:00Z','2026-05-08T10:00:00Z','2026-05-14T11:00:00Z','2026-05-18T12:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,'2026-09-15T12:00:00Z',NULL,0,0,
 'offtaker','2026-04-20T06:00:00Z','2026-05-18T12:00:00Z'),

-- 6. allocated / material — guarantee-of-origin hydro attribute allocated to consumption
('rec_006','REC-2026-0006',
 NULL,NULL,NULL,NULL,
 'gen_neusberg','Neusberg Hydro Generator','proj_neusberg','Neusberg Hydro','off_brewco','Brewco Beverages',
 'guarantee_of_origin','hydro','GOO-2026-0006',2025,'2025-10-01','2025-12-31',40000,'contractual','scope2_market_based',0,0,'material',
 'reg_goza','Guarantee of Origin Registry ZA','off_brewco','Brewco Beverages',
 'ISS-2026-0006','ELG-2026-0006','TRF-2026-0006','ALC-2026-0006',NULL,NULL,NULL,
 'Eligibility verified for a cross-border guarantee-of-origin claim','Certificate issued for verified renewable generation','Certificate transferred to the holder account','Consumption allocated against delivered MWh',NULL,NULL,NULL,NULL,NULL,'Consumption allocated and awaiting retirement',
 'allocated',
 '2026-04-10T06:00:00Z','2026-04-16T08:00:00Z','2026-04-26T10:00:00Z','2026-05-02T11:00:00Z','2026-05-08T12:00:00Z','2026-05-15T13:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,'2026-07-14T13:00:00Z',NULL,0,0,
 'offtaker','2026-04-10T06:00:00Z','2026-05-15T13:00:00Z'),

-- 7. retired / major — RE100 solar attribute retired to substantiate the claim
('rec_007','REC-2026-0007',
 NULL,NULL,NULL,NULL,
 'gen_dewildt','De Wildt Solar Generator','proj_dewildt','De Wildt Solar PV','off_telconet','Telconet Networks',
 'i_rec','solar_pv','IREC-ZA-2026-0007',2025,'2025-07-01','2025-12-31',150000,'i_rec_registry','re100',0,0,'major',
 'reg_irecza','I-REC Registry Operator ZA','off_telconet','Telconet Networks',
 'ISS-2026-0007','ELG-2026-0007','TRF-2026-0007','ALC-2026-0007','RET-2026-0007',NULL,'CLAIM-2026-0007',
 'Eligibility verified against the I-REC accreditation register','Certificate issued for verified renewable generation','Certificate transferred to the holder account','Consumption allocated against delivered MWh','Certificate retired under the GHG Protocol Scope 2 market-based method',NULL,NULL,NULL,NULL,'Certificate retired and the renewable-consumption claim substantiated',
 'retired',
 '2026-03-01T06:00:00Z','2026-03-08T08:00:00Z','2026-03-20T10:00:00Z','2026-03-28T11:00:00Z','2026-04-05T12:00:00Z','2026-04-18T13:00:00Z','2026-05-10T14:00:00Z',NULL,NULL,NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,NULL,NULL,0,0,
 'offtaker','2026-03-01T06:00:00Z','2026-05-10T14:00:00Z'),

-- 8. disputed / critical — integrity dispute in flight; high-tier SLA breach crosses [REPORTABLE]
('rec_008','REC-2026-0008',
 NULL,NULL,NULL,NULL,
 'gen_wesley','Wesley Wind Generator','proj_wesley','Wesley Ciskei Wind','off_steelworks','Highveld Steelworks',
 'i_rec','wind','IREC-ZA-2026-0008',2025,'2025-01-01','2025-06-30',300000,'i_rec_registry','compliance_obligation',1,1,'critical',
 'reg_irecza','I-REC Registry Operator ZA','off_steelworks','Highveld Steelworks',
 'ISS-2026-0008','ELG-2026-0008','TRF-2026-0008','ALC-2026-0008',NULL,'DSP-2026-0008',NULL,
 'Eligibility verified against the I-REC accreditation register','Certificate issued for verified renewable generation','Certificate transferred to the holder account','Consumption allocated against delivered MWh',NULL,'Holder raised an integrity dispute alleging a double count against another registry',NULL,NULL,'integrity_dispute','Integrity dispute under investigation by the registry',
 'disputed',
 '2026-02-10T06:00:00Z','2026-02-18T08:00:00Z','2026-03-01T10:00:00Z','2026-03-10T11:00:00Z','2026-03-18T12:00:00Z','2026-03-25T13:00:00Z',NULL,NULL,NULL,'2026-04-01T09:00:00Z',NULL,NULL,
 '2027-12-31T00:00:00Z',1,'2026-05-01T09:00:00Z','2026-05-02T00:00:00Z',1,2,
 'offtaker','2026-02-10T06:00:00Z','2026-05-02T00:00:00Z'),

-- 9. rejected / critical — large CSP issuance failed eligibility [REPORTABLE: reject_issuance crosses high]
('rec_009','REC-2026-0009',
 NULL,NULL,NULL,NULL,
 'gen_redstone','Redstone CSP Generator','proj_redstone','Redstone CSP','off_cementco','Cape Cement',
 'sarec','csp','SAREC-2026-0009',2026,'2026-01-01','2026-03-31',220000,'national_registry','carbon_tax_offset',1,0,'critical',
 'reg_sanrec','SA National REC Registry','off_cementco','Cape Cement',
 'ISS-2026-0009','ELG-2026-0009',NULL,NULL,NULL,NULL,NULL,
 'Eligibility review found unreconciled metering data','Issuance requested for Q1 2026 CSP generation attribute',NULL,NULL,NULL,NULL,NULL,'Issuance rejected for failed metering data eligibility','eligibility_fail','Issuance rejected and notified to the regulator',
 'rejected',
 '2026-04-15T06:00:00Z','2026-04-25T08:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-12T10:00:00Z',NULL,NULL,NULL,
 '2027-12-31T00:00:00Z',0,NULL,NULL,1,1,
 'offtaker','2026-04-15T06:00:00Z','2026-05-12T10:00:00Z'),

-- 10. clawed_back / moderate — dispute upheld, certificate revoked [REPORTABLE: claw_back crosses EVERY tier]
('rec_010','REC-2026-0010',
 NULL,NULL,NULL,NULL,
 'gen_mkuze','Mkuze Biomass Generator','proj_mkuze','Mkuze Biomass','off_textileza','Textile Mills ZA',
 'i_rec','biomass','IREC-ZA-2026-0010',2025,'2025-04-01','2025-06-30',8000,'i_rec_registry','scope2_market_based',0,1,'moderate',
 'reg_irecza','I-REC Registry Operator ZA','off_textileza','Textile Mills ZA',
 'ISS-2026-0010','ELG-2026-0010','TRF-2026-0010',NULL,NULL,'DSP-2026-0010',NULL,
 'Eligibility verified against the I-REC accreditation register','Certificate issued for verified renewable generation','Certificate transferred to the holder account',NULL,NULL,'Double counting confirmed against another registry retirement','Certificate revoked after the integrity dispute was upheld',NULL,'double_counting','Certificate clawed back and the duplicate retirement reversed',
 'clawed_back',
 '2026-01-15T06:00:00Z','2026-01-25T08:00:00Z','2026-02-10T10:00:00Z','2026-02-20T11:00:00Z','2026-03-01T12:00:00Z',NULL,NULL,NULL,NULL,'2026-03-15T09:00:00Z','2026-04-20T15:00:00Z',NULL,
 '2027-12-31T00:00:00Z',1,NULL,NULL,1,3,
 'offtaker','2026-01-15T06:00:00Z','2026-04-20T15:00:00Z');

INSERT OR IGNORE INTO oe_rec_lifecycle_events (
  id, rec_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at
) VALUES
('rec_evt_001','rec_002','rec_lifecycle.eligibility_review','issuance_requested','eligibility_review','reg_irecza','issuer','Eligibility review opened on the issuance request',NULL,'2026-05-26T08:00:00Z'),
('rec_evt_002','rec_003','rec_lifecycle.issued','eligibility_review','issued','reg_sanrec','issuer','Certificate issued after eligibility verification',NULL,'2026-05-20T10:00:00Z'),
('rec_evt_003','rec_004','rec_lifecycle.listed_for_transfer','issued','listed_for_transfer','reg_sanrec','issuer','Compliance-bound certificate listed for transfer',NULL,'2026-05-22T11:00:00Z'),
('rec_evt_004','rec_005','rec_lifecycle.transferred','listed_for_transfer','transferred','reg_irecza','issuer','Certificate transferred to the holder registry account',NULL,'2026-05-18T12:00:00Z'),
('rec_evt_005','rec_006','rec_lifecycle.allocated','transferred','allocated','off_brewco','holder','Consumption allocated against the certificate',NULL,'2026-05-15T13:00:00Z'),
('rec_evt_006','rec_007','rec_lifecycle.retired','allocated','retired','off_telconet','holder','Certificate retired to substantiate the renewable claim',NULL,'2026-05-10T14:00:00Z'),
('rec_evt_007','rec_008','rec_lifecycle.disputed','allocated','disputed','off_steelworks','holder','Integrity dispute raised over a suspected double count',NULL,'2026-04-01T09:00:00Z'),
('rec_evt_008','rec_009','rec_lifecycle.rejected','eligibility_review','rejected','reg_sanrec','issuer','Issuance rejected for failed metering eligibility',NULL,'2026-05-12T10:00:00Z'),
('rec_evt_009','rec_010','rec_lifecycle.clawed_back','disputed','clawed_back','reg_irecza','issuer','Certificate clawed back after the integrity dispute was upheld',NULL,'2026-04-20T15:00:00Z');
