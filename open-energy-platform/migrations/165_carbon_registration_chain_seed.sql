-- Wave 37 — Carbon Project Registration / PDD Validation seed data
-- 10 prod-realistic cases across 10 of 11 states (omits withdrawn) + 3 tiers.
-- SA mitigation projects: landfill gas, wind/solar RE, REDD+/thicket/blue-carbon,
-- cookstoves, micro-hydro. Developer = project proponent; VVB = validation body.
-- Cross-wave provenance: a W20-COD-built RE project and a W12-commissioned Esums
-- microgrid can spawn a carbon project registration.

-- 1) pin_submitted — small-scale landfill gas PIN just filed
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, validation_basis,
  chain_status, pin_submitted_at, sla_deadline_at, created_by
) VALUES (
  'creg_001', 'CARB-REG-2026-0001',
  'dev_ethekwini', 'eThekwini Municipality (Durban Solid Waste)',
  'eThekwini Landfill Gas-to-Energy', 'small_scale', 'verra_vcs', 'ACM0001', 'KwaZulu-Natal', 'ZA',
  10, 42000, 420000,
  'PIN-2026-0001', 'Small-scale landfill methane capture + flare-to-power. PIN logged; PDD drafting to follow. Streamlined validation track.',
  'pin_submitted', '2026-05-20 08:00:00', '2026-06-19 08:00:00', 'demo_carbon_001'
);

-- 2) pdd_drafted — large-scale De Aar wind, full PDD drafted
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_basis,
  chain_status, pin_submitted_at, pdd_drafted_at, sla_deadline_at, created_by
) VALUES (
  'creg_002', 'CARB-REG-2026-0002',
  'dev_deaar', 'De Aar Renewable Power (Pty) Ltd', 'TÜV SÜD South Africa',
  'De Aar Wind Carbon (REIPPPP BW4)', 'large_scale', 'gold_standard', 'GS TPDDTEC / ACM0002', 'Northern Cape', 'ZA',
  10, 285000, 2850000,
  'PIN-2026-0002', 'PDD-2026-0002', 'Large-scale grid-connected wind displacing Eskom coal-heavy grid emission factor. Full PDD drafted incl. additionality (investment + barrier analysis) + grid EF. Pending validation submission.',
  'pdd_drafted', '2026-04-25 08:00:00', '2026-05-10 08:00:00', '2026-06-24 08:00:00', 'demo_carbon_001'
);

-- 3) validation_underway — afolu REDD+ thicket restoration under VVB review (high integrity)
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_ref, validation_basis,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, sla_deadline_at, created_by
) VALUES (
  'creg_003', 'CARB-REG-2026-0003',
  'dev_ectrust', 'Eastern Cape Restoration Trust', 'AENOR Internacional',
  'Eastern Cape Subtropical Thicket Restoration (REDD+/ARR)', 'afolu_redd', 'verra_vcs', 'VM0007 / AR-ACM0003', 'Eastern Cape', 'ZA',
  30, 95000, 2850000,
  'PIN-2025-0044', 'PDD-2025-0044', 'VAL-2026-0003', 'Land-use spekboom thicket carbon — permanence (30yr), leakage, additionality under VVB validation. Long-pole 180-day validation window (highest scrutiny). Site visit + remote-sensing baseline review in progress.',
  'validation_underway', '2025-11-01 08:00:00', '2026-02-01 08:00:00', '2026-04-01 08:00:00', '2026-09-28 08:00:00', 'demo_carbon_001'
);

-- 4) corrections_required — large-scale community wind, VVB raised CARs (CAR loop, round 1)
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_ref, car_ref, validation_basis, corrections_basis, reason_code,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, corrections_required_at, car_round, sla_deadline_at, created_by
) VALUES (
  'creg_004', 'CARB-REG-2026-0004',
  'dev_tsitsikamma', 'Tsitsikamma Community Wind Farm', 'TÜV SÜD South Africa',
  'Tsitsikamma Community Wind grid-emission', 'large_scale', 'gold_standard', 'ACM0002', 'Eastern Cape', 'ZA',
  10, 145000, 1450000,
  'PIN-2025-0061', 'PDD-2025-0061', 'VAL-2026-0004', 'CAR-2026-0004', 'Grid-connected community wind; SDG co-benefits claimed.', 'VVB issued 3 Corrective Action Requests (CARs): (1) additionality investment analysis uses outdated WACC, (2) grid emission factor not aligned to latest Eskom build-margin, (3) community benefit-sharing not evidenced. Developer must address + resubmit within 60d.', 'car_round_1',
  'corrections_required', '2025-12-01 08:00:00', '2026-02-15 08:00:00', '2026-04-10 08:00:00', '2026-05-01 08:00:00', 1, '2026-06-30 08:00:00', 'demo_carbon_001'
);

-- 5) public_consultation — small-scale cookstove PoA, GS stakeholder consultation open
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_ref, consultation_ref, validation_basis, consultation_basis,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, public_consultation_at, sla_deadline_at, created_by
) VALUES (
  'creg_005', 'CARB-REG-2026-0005',
  'dev_limpopostoves', 'Limpopo Clean Cooking Initiative', 'Carbon Check (India) Pvt Ltd',
  'Limpopo Improved Cookstoves PoA', 'small_scale', 'gold_standard', 'GS TPDDTEC (Technologies and Practices to Displace Decentralized Thermal Energy Consumption)', 'Limpopo', 'ZA',
  7, 38000, 266000,
  'PIN-2026-0011', 'PDD-2026-0011', 'VAL-2026-0005', 'CONS-2026-0005', 'Programmatic clean-cooking PoA — household fuel-switch from wood/paraffin.', 'Gold Standard local stakeholder consultation OPEN — 30-day comment window. Community meetings held in 4 villages; SDG impact (health, gender, forests) being documented. No objections logged yet.',
  'public_consultation', '2026-03-20 08:00:00', '2026-04-15 08:00:00', '2026-05-01 08:00:00', '2026-05-15 08:00:00', '2026-06-14 08:00:00', 'demo_carbon_001'
);

-- 6) dna_authorization — afolu blue-carbon, DFFE DNA Letter of Approval / Article 6 authorization granted
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_ref, consultation_ref, dna_authorization_ref, validation_basis, dna_basis,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, public_consultation_at, dna_authorization_at, sla_deadline_at, created_by
) VALUES (
  'creg_006', 'CARB-REG-2026-0006',
  'dev_isimangaliso', 'iSimangaliso Wetland Authority', 'AENOR Internacional',
  'KZN Mangrove Blue-Carbon', 'afolu_redd', 'article6', 'VM0033 (Tidal Wetland and Seagrass Restoration)', 'KwaZulu-Natal', 'ZA',
  30, 28000, 840000,
  'PIN-2025-0070', 'PDD-2025-0070', 'VAL-2026-0006', 'CONS-2026-0006', 'DFFE-LOA-2026-0006', 'Mangrove + seagrass blue-carbon restoration; validated; stakeholder consultation closed with support.', 'DFFE Designated National Authority issued Letter of Approval + Article 6.4 host-country authorization (corresponding adjustment committed). Cleared to request registry registration.',
  'dna_authorization', '2025-10-15 08:00:00', '2026-01-15 08:00:00', '2026-03-01 08:00:00', '2026-04-20 08:00:00', '2026-05-05 08:00:00', '2026-06-19 08:00:00', 'demo_carbon_001'
);

-- 7) registration_requested — large-scale CSP, registration requested at registry
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_ref, consultation_ref, dna_authorization_ref, registration_ref, validation_basis, registration_basis,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, public_consultation_at, dna_authorization_at, registration_requested_at, sla_deadline_at, created_by
) VALUES (
  'creg_007', 'CARB-REG-2026-0007',
  'dev_kathu', 'Kathu Solar Park (Pty) Ltd', 'TÜV SÜD South Africa',
  'Northern Cape Solar Thermal (CSP) carbon', 'large_scale', 'verra_vcs', 'ACM0002', 'Northern Cape', 'ZA',
  10, 210000, 2100000,
  'PIN-2025-0080', 'PDD-2025-0080', 'VAL-2026-0007', 'CONS-2026-0007', 'DFFE-LOA-2026-0007', 'REG-REQ-2026-0007', 'CSP with molten-salt storage displacing grid emission; validated + consulted + DNA approved.', 'Registration requested with Verra registry — listing + completeness review underway. Registry decision pending within 60-day window.',
  'registration_requested', '2025-09-20 08:00:00', '2025-12-20 08:00:00', '2026-02-15 08:00:00', '2026-03-25 08:00:00', '2026-04-10 08:00:00', '2026-04-20 08:00:00', '2026-06-19 08:00:00', 'demo_carbon_001'
);

-- 8) registered — afolu savanna fire mgmt REGISTERED (crosses to regulator, afolu high-integrity) — W20 provenance
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e, registered_serial_block,
  pin_ref, pdd_ref, validation_ref, consultation_ref, dna_authorization_ref, registration_ref, validation_basis, registration_basis, reason_code,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, public_consultation_at, dna_authorization_at, registration_requested_at, registered_at, sla_deadline_at, created_by
) VALUES (
  'creg_008', 'CARB-REG-2026-0008',
  'cod.certified', 'cod_chain', 'cod_002', 'W20',
  'dev_k2c', 'Kruger-to-Canyons Biosphere NPC', 'AENOR Internacional',
  'Kruger-to-Canyons Savanna Fire Management (Article 6.4)', 'afolu_redd', 'article6', 'VM0042 / AMS-III.BK (Savanna Burning)', 'Mpumalanga', 'ZA',
  20, 120000, 2400000, 'ZA-A6-2026-K2C-0001..120000',
  'PIN-2024-0090', 'PDD-2025-0010', 'VAL-2025-0090', 'CONS-2025-0090', 'DFFE-LOA-2026-0008', 'REG-2026-0008', 'Early-burning savanna fire management cutting late-dry-season wildfire emissions; permanence + leakage validated.', 'REGISTERED on the Article 6.4 mechanism registry — crediting block ZA-A6-2026-K2C 120,000 tCO2e/yr issued. High-integrity afolu registration NOTIFIED to regulator (corresponding-adjustment tracking). Linked to W20 COD-certified host site.', 'registered_high_integrity',
  'registered', '2024-11-01 08:00:00', '2025-03-01 08:00:00', '2025-06-01 08:00:00', '2025-11-01 08:00:00', '2026-02-01 08:00:00', '2026-03-01 08:00:00', '2026-05-18 08:00:00', '2026-06-17 08:00:00', 'admin'
);

-- 9) crediting_active — small-scale micro-hydro, FULL happy-path lifecycle complete — W12 provenance
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e, registered_serial_block,
  pin_ref, pdd_ref, validation_ref, consultation_ref, dna_authorization_ref, registration_ref, validation_basis, registration_basis, reason_code, rod_notes,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, public_consultation_at, dna_authorization_at, registration_requested_at, registered_at, crediting_active_at, created_by
) VALUES (
  'creg_009', 'CARB-REG-2026-0009',
  'commissioning.energised', 'commissioning_chain', 'comm_004', 'W12',
  'dev_mthatha', 'Mthatha Micro-Hydro Cooperative', 'Carbon Check (India) Pvt Ltd',
  'Mthatha Micro-Hydro PoA', 'small_scale', 'gold_standard', 'AMS-I.D (Grid-connected renewable electricity generation)', 'Eastern Cape', 'ZA',
  7, 18500, 129500, 'GS-2026-MTH-0001..018500',
  'PIN-2025-0020', 'PDD-2025-0020', 'VAL-2025-0050', 'CONS-2025-0050', 'DFFE-LOA-2025-0030', 'REG-2026-0009', 'Run-of-river micro-hydro feeding the Esums-commissioned Mthatha microgrid (W12 comm_004); displaces diesel + grid.', 'Registered + first crediting period ACTIVE. Hands off to MRV (W11) for periodic verification + issuance. Streamlined small-scale track completed cleanly.', 'crediting_period_active', 'Full registration lifecycle complete and documented — PIN→PDD→validation→consultation→DNA→registration→registered→crediting active. No CARs raised. Now in W11 MRV cycle.',
  'crediting_active', '2025-01-15 08:00:00', '2025-04-15 08:00:00', '2025-06-15 08:00:00', '2025-08-15 08:00:00', '2025-10-15 08:00:00', '2025-12-15 08:00:00', '2026-02-15 08:00:00', '2026-03-15 08:00:00', 'admin'
);

-- 10) rejected — afolu soil-carbon REJECTED at validation (non-additionality + inflated baseline) — crosses ALL tiers
INSERT OR IGNORE INTO oe_carbon_registration (
  id, project_number,
  developer_party_id, developer_party_name, vvb_name,
  project_name, project_tier, standard, methodology, province, host_country,
  crediting_years, estimated_annual_tco2e, estimated_total_tco2e,
  pin_ref, pdd_ref, validation_ref, rejection_ref, validation_basis, rejection_basis, reason_code, rod_notes,
  chain_status, pin_submitted_at, pdd_drafted_at, validation_underway_at, rejected_at, created_by
) VALUES (
  'creg_010', 'CARB-REG-2026-0010',
  'dev_karoosoil', 'Karoo Regenerative Agriculture Co', 'AENOR Internacional',
  'Karoo Soil-Carbon Sequestration', 'afolu_redd', 'verra_vcs', 'VM0042 (Improved Agricultural Land Management)', 'Northern Cape', 'ZA',
  20, 65000, 1300000,
  'PIN-2025-0099', 'PDD-2025-0099', 'VAL-2026-0010', 'REJ-2026-0010', 'Soil-organic-carbon sequestration via regenerative grazing on Karoo rangeland.', 'REJECTED — VVB validation failed: (1) additionality not demonstrated (practice already common + financially viable without credits), (2) baseline SOC inflated vs measured soil cores, (3) permanence/reversal risk (drought) inadequately buffered. Non-additional crediting refused. NOTIFIED to regulator (rejection crosses ALL tiers — market-integrity event).', 'non_additionality_inflated_baseline', 'Registration refused at validation. Developer may re-apply with corrected, conservative baseline + buffer pool. Regulator notified per market-integrity protocol.',
  'rejected', '2025-10-01 08:00:00', '2026-01-10 08:00:00', '2026-03-01 08:00:00', '2026-05-12 08:00:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- creg_001 events (pin_submitted)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_001_a', 'creg_001', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_ethekwini', 'developer', 'Small-scale landfill-gas PIN filed — eThekwini, est. 42k tCO2e/yr', '2026-05-20 08:00:00');

-- creg_002 events (pdd_drafted)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_002_a', 'creg_002', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_deaar', 'developer', 'De Aar wind PIN filed', '2026-04-25 08:00:00'),
('cregv_002_b', 'creg_002', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_deaar', 'developer', 'Full PDD drafted incl. additionality + grid EF — pending validation submission', '2026-05-10 08:00:00');

-- creg_003 events (validation_underway, afolu)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_003_a', 'creg_003', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_ectrust', 'developer', 'Thicket restoration REDD+/ARR PIN filed', '2025-11-01 08:00:00'),
('cregv_003_b', 'creg_003', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_ectrust', 'developer', 'PDD drafted — 30yr permanence, leakage, additionality', '2026-02-01 08:00:00'),
('cregv_003_c', 'creg_003', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_ectrust', 'developer', 'Submitted to AENOR for validation — 180-day window (highest scrutiny)', '2026-04-01 08:00:00');

-- creg_004 events (corrections_required — CAR loop, large_scale)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_004_a', 'creg_004', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_tsitsikamma', 'developer', 'Community wind PIN filed', '2025-12-01 08:00:00'),
('cregv_004_b', 'creg_004', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_tsitsikamma', 'developer', 'PDD drafted with SDG co-benefits', '2026-02-15 08:00:00'),
('cregv_004_c', 'creg_004', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_tsitsikamma', 'developer', 'Submitted to TÜV SÜD for validation', '2026-04-10 08:00:00'),
('cregv_004_d', 'creg_004', 'carbon_registration.corrections_required', 'validation_underway', 'corrections_required', 'vvb_tuvsud', 'vvb', 'VVB raised 3 CARs (WACC, grid EF, benefit-sharing) — resubmit within 60d', '2026-05-01 08:00:00');

-- creg_005 events (public_consultation, small_scale)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_005_a', 'creg_005', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_limpopostoves', 'developer', 'Cookstove PoA PIN filed', '2026-03-20 08:00:00'),
('cregv_005_b', 'creg_005', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_limpopostoves', 'developer', 'PDD drafted — household fuel-switch', '2026-04-15 08:00:00'),
('cregv_005_c', 'creg_005', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_limpopostoves', 'developer', 'Submitted to Carbon Check for validation', '2026-05-01 08:00:00'),
('cregv_005_d', 'creg_005', 'carbon_registration.public_consultation', 'validation_underway', 'public_consultation', 'dev_limpopostoves', 'developer', 'GS local stakeholder consultation OPEN — 30-day window, 4 village meetings', '2026-05-15 08:00:00');

-- creg_006 events (dna_authorization, afolu)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_006_a', 'creg_006', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_isimangaliso', 'developer', 'Blue-carbon mangrove PIN filed', '2025-10-15 08:00:00'),
('cregv_006_b', 'creg_006', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_isimangaliso', 'developer', 'PDD drafted — tidal wetland + seagrass', '2026-01-15 08:00:00'),
('cregv_006_c', 'creg_006', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_isimangaliso', 'developer', 'Submitted to AENOR for validation', '2026-03-01 08:00:00'),
('cregv_006_d', 'creg_006', 'carbon_registration.public_consultation', 'validation_underway', 'public_consultation', 'dev_isimangaliso', 'developer', 'Stakeholder consultation closed with support', '2026-04-20 08:00:00'),
('cregv_006_e', 'creg_006', 'carbon_registration.dna_authorization', 'public_consultation', 'dna_authorization', 'dffe_dna', 'authority', 'DFFE DNA Letter of Approval + Article 6.4 host-country authorization (corresponding adjustment committed)', '2026-05-05 08:00:00');

-- creg_007 events (registration_requested, large_scale)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_007_a', 'creg_007', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_kathu', 'developer', 'CSP carbon PIN filed', '2025-09-20 08:00:00'),
('cregv_007_b', 'creg_007', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_kathu', 'developer', 'PDD drafted', '2025-12-20 08:00:00'),
('cregv_007_c', 'creg_007', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_kathu', 'developer', 'Submitted to TÜV SÜD for validation', '2026-02-15 08:00:00'),
('cregv_007_d', 'creg_007', 'carbon_registration.public_consultation', 'validation_underway', 'public_consultation', 'dev_kathu', 'developer', 'Consultation closed', '2026-03-25 08:00:00'),
('cregv_007_e', 'creg_007', 'carbon_registration.dna_authorization', 'public_consultation', 'dna_authorization', 'dffe_dna', 'authority', 'DFFE DNA Letter of Approval issued', '2026-04-10 08:00:00'),
('cregv_007_f', 'creg_007', 'carbon_registration.registration_requested', 'dna_authorization', 'registration_requested', 'dev_kathu', 'developer', 'Registration requested with Verra — completeness review underway', '2026-04-20 08:00:00');

-- creg_008 events (registered — crosses to regulator, afolu, W20 provenance)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_008_a', 'creg_008', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_k2c', 'developer', 'Savanna fire mgmt PIN filed — W20 COD-certified host site', '2024-11-01 08:00:00'),
('cregv_008_b', 'creg_008', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_k2c', 'developer', 'PDD drafted — early-burning methodology', '2025-03-01 08:00:00'),
('cregv_008_c', 'creg_008', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_k2c', 'developer', 'Submitted to AENOR for validation', '2025-06-01 08:00:00'),
('cregv_008_d', 'creg_008', 'carbon_registration.public_consultation', 'validation_underway', 'public_consultation', 'dev_k2c', 'developer', 'Stakeholder consultation closed with support', '2025-11-01 08:00:00'),
('cregv_008_e', 'creg_008', 'carbon_registration.dna_authorization', 'public_consultation', 'dna_authorization', 'dffe_dna', 'authority', 'DFFE DNA + Article 6.4 authorization (corresponding adjustment)', '2026-02-01 08:00:00'),
('cregv_008_f', 'creg_008', 'carbon_registration.registration_requested', 'dna_authorization', 'registration_requested', 'dev_k2c', 'developer', 'Registration requested on Article 6.4 registry', '2026-03-01 08:00:00'),
('cregv_008_g', 'creg_008', 'carbon_registration.registered', 'registration_requested', 'registered', 'registry_a6', 'registry', 'REGISTERED — block ZA-A6-2026-K2C 120k tCO2e/yr. High-integrity afolu registration NOTIFIED to regulator.', '2026-05-18 08:00:00');

-- creg_009 events (crediting_active — full happy path, W12 provenance)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_009_a', 'creg_009', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_mthatha', 'developer', 'Micro-hydro PoA PIN filed — feeds W12 comm_004 microgrid', '2025-01-15 08:00:00'),
('cregv_009_b', 'creg_009', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_mthatha', 'developer', 'PDD drafted — run-of-river renewable', '2025-04-15 08:00:00'),
('cregv_009_c', 'creg_009', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_mthatha', 'developer', 'Submitted to Carbon Check for validation — no CARs', '2025-06-15 08:00:00'),
('cregv_009_d', 'creg_009', 'carbon_registration.public_consultation', 'validation_underway', 'public_consultation', 'dev_mthatha', 'developer', 'Consultation closed with cooperative support', '2025-08-15 08:00:00'),
('cregv_009_e', 'creg_009', 'carbon_registration.dna_authorization', 'public_consultation', 'dna_authorization', 'dffe_dna', 'authority', 'DFFE DNA Letter of Approval issued', '2025-10-15 08:00:00'),
('cregv_009_f', 'creg_009', 'carbon_registration.registration_requested', 'dna_authorization', 'registration_requested', 'dev_mthatha', 'developer', 'Registration requested with Gold Standard', '2025-12-15 08:00:00'),
('cregv_009_g', 'creg_009', 'carbon_registration.registered', 'registration_requested', 'registered', 'registry_gs', 'registry', 'REGISTERED on Gold Standard — block GS-2026-MTH 18.5k tCO2e/yr', '2026-02-15 08:00:00'),
('cregv_009_h', 'creg_009', 'carbon_registration.crediting_active', 'registered', 'crediting_active', 'registry_gs', 'registry', 'First crediting period ACTIVE — hands off to W11 MRV cycle', '2026-03-15 08:00:00');

-- creg_010 events (rejected — crosses ALL tiers, afolu)
INSERT OR IGNORE INTO oe_carbon_registration_events (id, project_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cregv_010_a', 'creg_010', 'carbon_registration.pin_submitted', null, 'pin_submitted', 'dev_karoosoil', 'developer', 'Soil-carbon PIN filed', '2025-10-01 08:00:00'),
('cregv_010_b', 'creg_010', 'carbon_registration.pdd_drafted', 'pin_submitted', 'pdd_drafted', 'dev_karoosoil', 'developer', 'PDD drafted — regenerative grazing SOC', '2026-01-10 08:00:00'),
('cregv_010_c', 'creg_010', 'carbon_registration.validation_underway', 'pdd_drafted', 'validation_underway', 'dev_karoosoil', 'developer', 'Submitted to AENOR for validation', '2026-03-01 08:00:00'),
('cregv_010_d', 'creg_010', 'carbon_registration.rejected', 'validation_underway', 'rejected', 'vvb_aenor', 'vvb', 'REJECTED — non-additionality + inflated baseline + reversal risk. Non-additional crediting refused. NOTIFIED to regulator (crosses ALL tiers).', '2026-05-12 08:00:00');
