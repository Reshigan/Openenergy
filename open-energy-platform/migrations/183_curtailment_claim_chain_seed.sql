-- Wave 46 — Offtaker PPA Curtailment / Deemed-Energy Compensation seed data.
-- 10 prod-realistic cases across 10 of 12 states (omits standalone claim_prepared
-- — traversed inside the cec_003 claim_submitted chain — and quantum_agreed —
-- traversed inside the cec_007 compensation_settled flagship) + 3 tiers.
-- SA REIPPPP IPPs (wind / solar / CSP plants) curtailed for economic / system-
-- security / grid-constraint reasons and claiming PPA deemed-energy compensation.
-- Seller = IPP / generator; buyer = offtaker; arbiter on referral.
-- Cross-wave provenance: a W34 economic-curtailment instruction triggers the
-- cec_006 claim; the W22 ppa_006 Roggeveld PPA (repriced by W39 tidx_009 to
-- R1032.88/MWh) is the contract the cec_007 settlement pays against; a severe
-- W34 stage-7/8 load-shed feeds the cec_008 arbitrated claim.

-- 1) curtailment_logged — utility, fresh economic-curtailment log (SLA breached)
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount,
  log_ref, log_basis,
  chain_status, curtailment_logged_at, sla_deadline_at, created_by
) VALUES (
  'cec_001', 'CEC-2026-0001',
  'spv_kangnas', 'Kangnas Wind Farm (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-KANGNAS-2018', 'Kangnas Wind Farm', 'utility_scale', 140.0, 985.40,
  'economic', 'Economic dispatch-down of an available 140MW wind plant during a low-demand high-renewable midday window', 14.5, 1218.0, 1200217.20,
  'LOG-2026-0001',
  'The System Operator issued an economic curtailment instruction dispatching Kangnas down by ~60% for 14.5 hours during a low-demand, high-renewable midday window on 2026-05-24. The plant was fully available; energy was spilled for system-economic reasons not attributable to the IPP. Deemed-energy claim logged for buyer classification.',
  'curtailment_logged', '2026-05-24 09:00:00', '2026-05-26 09:00:00', 'demo_offtaker_001'
);

-- 2) classification_review — commercial, buyer assessing compensability (SLA breached)
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount,
  log_ref, classification_ref, log_basis, classification_basis,
  chain_status, curtailment_logged_at, classification_review_at, sla_deadline_at, created_by
) VALUES (
  'cec_002', 'CEC-2026-0002',
  'spv_droogfontein', 'Droogfontein Solar Power (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-DROOGFONTEIN-2014', 'Droogfontein Solar', 'commercial', 50.0, 1042.10,
  'grid_constraint', 'Localised network constraint curtailed a 50MW PV plant during a transmission maintenance window', 22.0, 642.0, 669028.20,
  'LOG-2026-0002', 'CLS-2026-0002',
  'A localised 132kV network constraint during a planned transmission maintenance window forced a dispatch-down of Droogfontein over 22 hours. Plant available; claim logged.',
  'Buyer assessing whether the curtailment is compensable: the maintenance window was scheduled and notified 14 days ahead, raising a question of whether it falls under the planned-maintenance carve-out or qualifies as a compensable grid-constraint curtailment. Engineering + legal reviewing the connection agreement.',
  'classification_review', '2026-05-15 09:00:00', '2026-05-18 09:00:00', '2026-05-23 09:00:00', 'demo_offtaker_001'
);

-- 3) claim_submitted — embedded, seller submitted (traverses claim_prepared); embedded does NOT cross
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount,
  log_ref, classification_ref, claim_ref, log_basis, classification_basis, claim_basis,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, sla_deadline_at, created_by
) VALUES (
  'cec_003', 'CEC-2026-0003',
  'spv_kuruman_sseg', 'Kuruman Industrial SSEG (Pty) Ltd', 'Sol Plaatje Municipality',
  'PPA-KURUMAN-SSEG-2025', 'Kuruman 2.5MW Rooftop SSEG', 'embedded', 2.5, 1180.00,
  'network_outage', 'Behind-the-meter SSEG export curtailed during a municipal feeder reconfiguration', 9.0, 14.2, 16756.00,
  'LOG-2026-0003', 'CLS-2026-0003', 'CLM-2026-0003',
  'The municipal distributor reconfigured the feeder serving the Kuruman industrial park, requiring the 2.5MW rooftop SSEG to stop exporting for 9 hours. Plant available; export curtailed.',
  'Buyer confirmed the curtailment is compensable — a network-reconfiguration export limitation outside the SSEG operator control, not a scheduled-maintenance carve-out.',
  'Seller assembled the deemed-energy claim: 14.2 MWh of avoided export over the 9-hour window, derived from the calibrated inverter logs + the irradiance reference, valued at the R1180/MWh embedded tariff. Claim submitted for buyer validation.',
  'claim_submitted', '2026-05-19 09:00:00', '2026-05-21 09:00:00', '2026-05-23 09:00:00', '2026-05-26 09:00:00', '2026-06-02 09:00:00', 'demo_offtaker_001'
);

-- 4) validation_underway — utility, buyer running SCADA + resource-model validation
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount,
  log_ref, classification_ref, claim_ref, validation_ref,
  log_basis, classification_basis, claim_basis, validation_basis,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, validation_underway_at, sla_deadline_at, created_by
) VALUES (
  'cec_004', 'CEC-2026-0004',
  'spv_garob', 'Garob Wind Farm (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-GAROB-2018', 'Garob Wind Farm', 'utility_scale', 138.0, 1008.75,
  'system_security', 'System-security curtailment during a grid-frequency event curtailed a 138MW wind plant', 6.5, 2870.0, 2895112.50,
  'LOG-2026-0004', 'CLS-2026-0004', 'CLM-2026-0004', 'VAL-2026-0004',
  'A system-security curtailment instruction during a grid-frequency excursion dispatched Garob down for 6.5 hours. Plant fully available.',
  'Buyer confirmed compensable — a system-security curtailment not attributable to the IPP under the PPA deemed-energy clause.',
  'Seller submitted a 2,870 MWh deemed-energy claim derived from the pre-curtailment SCADA power curve extrapolated across the curtailment window, valued at the escalated R1008.75/MWh tariff.',
  'Buyer validation underway: reconciling the SCADA active-power telemetry, the nacelle wind-speed measurements, and the WAsP resource model against the seller power-curve extrapolation. Independent engineer cross-checking the availability assertion (no concurrent forced-outage) before a quantum is proposed.',
  'validation_underway', '2026-05-08 09:00:00', '2026-05-11 09:00:00', '2026-05-14 09:00:00', '2026-05-17 09:00:00', '2026-05-21 09:00:00', '2026-05-31 09:00:00', 'demo_offtaker_001'
);

-- 5) quantum_proposed — commercial, buyer proposed a quantum (offer agree/dispute)
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount, proposed_amount,
  log_ref, classification_ref, claim_ref, validation_ref, quantum_ref,
  log_basis, classification_basis, claim_basis, validation_basis, quantum_basis,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, validation_underway_at, quantum_proposed_at, sla_deadline_at, created_by
) VALUES (
  'cec_005', 'CEC-2026-0005',
  'spv_dedeaar', 'De Aar Solar Power (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-DEAAR-2014', 'De Aar Solar', 'commercial', 50.0, 1051.30,
  'economic', 'Repeated midday economic curtailments of a 50MW PV plant over a billing month', 38.0, 1604.0, 1686285.20, 1512190.00,
  'LOG-2026-0005', 'CLS-2026-0005', 'CLM-2026-0005', 'VAL-2026-0005', 'QTM-2026-0005',
  'Repeated midday economic dispatch-downs of De Aar over the billing month totalling 38 curtailed hours during high-renewable low-demand windows.',
  'Buyer confirmed compensable economic curtailment.',
  'Seller claimed 1,604 MWh deemed energy from the clear-sky PVsyst reference model, valued at R1051.30/MWh = R1.686m.',
  'Validation reconciled the inverter telemetry + the satellite irradiance series; buyer accepted ~94% of the claimed MWh after trimming intervals where measured irradiance fell below the model assumption.',
  'Buyer proposed a quantum of R1.512m (1,438 validated MWh × R1051.30) — a ~10% trim of the seller claim, with the deemed-energy MWh reconciled to the measured-irradiance-adjusted PVsyst output. Seller to agree or dispute.',
  'quantum_proposed', '2026-05-01 09:00:00', '2026-05-03 09:00:00', '2026-05-06 09:00:00', '2026-05-10 09:00:00', '2026-05-16 09:00:00', '2026-05-25 09:00:00', '2026-06-01 09:00:00', 'demo_offtaker_001'
);

-- 6) disputed — utility, seller disputed the proposed quantum (W34 economic-curtailment provenance)
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount, proposed_amount,
  log_ref, classification_ref, claim_ref, validation_ref, quantum_ref, dispute_ref,
  log_basis, classification_basis, claim_basis, validation_basis, quantum_basis, dispute_basis,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, validation_underway_at, quantum_proposed_at, disputed_at, dispute_round, sla_deadline_at, created_by
) VALUES (
  'cec_006', 'CEC-2026-0006',
  'load_curtailment.instruction_issued', 'load_curtailment', 'lc_005', 'W34',
  'spv_loeriesfontein', 'Loeriesfontein Wind Farm (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-LOERIESFONTEIN-2017', 'Loeriesfontein 2 Wind Farm', 'utility_scale', 140.0, 1019.60,
  'economic', 'Economic curtailment under a W34 dispatch-down instruction — deemed-energy quantum disputed', 27.0, 5240.0, 5342704.00, 4380140.00,
  'LOG-2026-0006', 'CLS-2026-0006', 'CLM-2026-0006', 'VAL-2026-0006', 'QTM-2026-0006', 'DSP-2026-0006',
  'The W34 economic load-curtailment instruction (lc_005) dispatched Loeriesfontein 2 down by up to 70% across 27 hours of high-wind low-demand conditions. Plant fully available; energy spilled for system-economic reasons.',
  'Buyer confirmed compensable economic curtailment under the PPA deemed-energy clause.',
  'Seller claimed 5,240 MWh deemed energy from the measured nacelle-wind / power-curve method = R5.343m.',
  'Buyer validation applied a wake-loss + availability haircut and a hub-height wind correction, reducing the assessed deemed energy to ~4,296 MWh.',
  'Buyer proposed R4.380m (4,296 MWh × R1019.60). Seller rejected the proposal.',
  'Seller DISPUTED the proposed quantum: contends the buyer applied an excessive wake-loss haircut and used a conservative power curve that understates production in the >12 m/s band that prevailed during the curtailment. Seller demands the IEC-warranted power curve + the as-built wake model. Variance R0.96m (~18%).',
  'disputed', '2026-04-10 09:00:00', '2026-04-12 09:00:00', '2026-04-15 09:00:00', '2026-04-18 09:00:00', '2026-04-25 09:00:00', '2026-05-05 09:00:00', '2026-05-12 09:00:00', 1, '2026-05-27 09:00:00', 'demo_offtaker_001'
);

-- 7) compensation_settled — utility, FULL happy arc flagship (traverses quantum_agreed); crosses regulator (settle utility); W22 ppa_006 Roggeveld + W39 tidx_009 provenance
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount, proposed_amount, agreed_amount, settled_amount,
  log_ref, classification_ref, claim_ref, validation_ref, quantum_ref, settlement_ref,
  log_basis, classification_basis, claim_basis, validation_basis, quantum_basis, settlement_basis, reason_code, rod_notes,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, validation_underway_at, quantum_proposed_at, quantum_agreed_at, compensation_settled_at, created_by
) VALUES (
  'cec_007', 'CEC-2025-0204',
  'ppa_contract.in_force', 'ppa_contract_chain', 'ppa_006', 'W22',
  'spv_roggeveld', 'Roggeveld Wind Farm (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-ROGGEVELD-2019', 'Roggeveld Wind Farm', 'utility_scale', 147.0, 1032.88,
  'system_security', 'Multi-event system-security + economic curtailment over a quarter — fully validated, agreed and PAID', 96.0, 18640.0, 19253027.20, 18420000.00, 18420000.00, 18420000.00,
  'LOG-2025-0204', 'CLS-2025-0204', 'CLM-2025-0204', 'VAL-2025-0204', 'QTM-2025-0204', 'STL-2025-0204',
  'Aggregated deemed-energy claim for the quarter on the W22 Roggeveld PPA (ppa_006): 96 curtailed hours across multiple system-security and economic dispatch-down instructions, plant available throughout.',
  'Buyer confirmed all events compensable under the PPA deemed-energy clause; none attributable to the IPP.',
  'Seller submitted an 18,640 MWh deemed-energy claim from the SCADA power-curve method, valued at the W39-escalated R1032.88/MWh tariff (tidx_009) = R19.253m.',
  'Independent-engineer-supervised validation reconciled SCADA telemetry, nacelle wind data, and the wake model; assessed 17,834 validated MWh after a modest availability + wake adjustment.',
  'Buyer proposed R18.420m (17,834 MWh × R1032.88); seller AGREED the quantum after reviewing the validation workpapers.',
  'Compensation of R18.42m SETTLED and PAID via the quarterly PPA settlement run. NOTIFIED to regulator (settlement crosses utility_scale + commercial — material system-cost). Deemed-energy line reconciled to the W22 PPA invoice.',
  'deemed_energy_settled_paid', 'Full curtailment_logged → classification → prepared → submitted → validation → quantum_proposed → quantum_agreed → compensation_settled arc. Utility-tier settlement — regulator-reportable. Settles against W22 ppa_006 Roggeveld at the W39 tidx_009 escalated tariff (R1032.88/MWh).',
  'compensation_settled', '2025-12-20 09:00:00', '2025-12-23 09:00:00', '2025-12-29 09:00:00', '2026-01-08 09:00:00', '2026-01-20 09:00:00', '2026-02-10 09:00:00', '2026-02-24 09:00:00', '2026-03-31 09:00:00', 'admin'
);

-- 8) arbitrated — utility, FULL dispute arc (traverses recalculate re-loop); crosses ALL tiers; severe W34 stage-7/8 provenance
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  seller_party_id, seller_party_name, buyer_party_name, arbiter_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount, proposed_amount,
  log_ref, classification_ref, claim_ref, validation_ref, quantum_ref, dispute_ref, arbitration_ref,
  log_basis, classification_basis, claim_basis, validation_basis, quantum_basis, dispute_basis, arbitration_basis, reason_code, rod_notes,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, validation_underway_at, quantum_proposed_at, disputed_at, arbitrated_at, dispute_round, created_by
) VALUES (
  'cec_008', 'CEC-2025-0188',
  'load_curtailment.target_achieved', 'load_curtailment', 'lc_009', 'W34',
  'spv_redstone', 'Redstone Solar Thermal Power (RF) (Pty) Ltd', 'Eskom (Single Buyer)', 'AFSA (Arbitration Foundation of Southern Africa)',
  'PPA-REDSTONE-2018', 'Redstone CSP (100MW)', 'utility_scale', 100.0, 2640.50,
  'system_security', 'Severe W34 stage-7/8 load-shed forced a dispatchable CSP plant off-storage — high-value deemed-energy claim referred to arbitration', 31.0, 2480.0, 6548440.00, 4720000.00,
  'LOG-2025-0188', 'CLS-2025-0188', 'CLM-2025-0188', 'VAL-2025-0188', 'QTM-2025-0188', 'DSP-2025-0188', 'ARB-2025-0188',
  'During the W34 stage-7/8 load-shed event (lc_009), the System Operator instructed Redstone — a dispatchable CSP plant with thermal storage — to remain off despite full availability, spilling stored thermal energy. Deemed-energy claim logged at the high CSP tariff.',
  'Buyer confirmed compensable — a system-security curtailment of an available dispatchable plant.',
  'Seller claimed 2,480 MWh deemed energy valued at the R2640.50/MWh CSP tariff = R6.548m, on the basis that the charged thermal store would have been dispatched into the evening peak.',
  'Buyer validation disputed the dispatch assumption, arguing a portion of the stored energy would have been carried over rather than dispatched, and proposed a far lower deemed-energy figure.',
  'Buyer proposed R4.720m (~1,788 MWh). Seller rejected; buyer recalculated once on revised storage-dispatch assumptions but the parties remained ~R1.8m apart after the re-loop.',
  'Seller disputed twice — the core disagreement is the counterfactual storage-dispatch schedule (would the charged store have served the evening peak at the full CSP tariff?). A R1.8m gap on a high-value CSP claim could not be bridged bilaterally.',
  'Referred to AFSA arbitration under the PPA dispute-resolution clause. NOTIFIED to regulator (arbitration referral crosses ALL tiers — the universal hard line). Arbitrator to determine the counterfactual dispatch schedule and the deemed-energy quantum.',
  'csp_storage_dispatch_arbitrated', 'Full dispute arc: quantum_proposed → disputed → recalculate (re-loop) → quantum_proposed → disputed → refer_arbitration. Dispute round 2. High-value CSP deemed-energy claim hinging on the storage-dispatch counterfactual. Referred to AFSA — crosses ALL tiers. Linked to W34 lc_009 stage-7/8 load-shed.',
  'arbitrated', '2025-10-05 09:00:00', '2025-10-08 09:00:00', '2025-10-14 09:00:00', '2025-10-22 09:00:00', '2025-11-05 09:00:00', '2025-11-25 09:00:00', '2025-12-08 09:00:00', '2026-01-15 09:00:00', 2, 'admin'
);

-- 9) non_compensable — commercial, classification gate reject (IPP-fault); crosses utility+commercial
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount,
  log_ref, classification_ref, log_basis, classification_basis, reason_code, rod_notes,
  chain_status, curtailment_logged_at, classification_review_at, non_compensable_at, created_by
) VALUES (
  'cec_009', 'CEC-2026-0009',
  'spv_greefspan', 'Greefspan PV Power Plant (RF) (Pty) Ltd', 'Eskom (Single Buyer)',
  'PPA-GREEFSPAN-2014', 'Greefspan Solar', 'commercial', 10.0, 1063.40,
  'economic', 'Claimed economic curtailment found to be an IPP-side forced outage — NOT compensable', 11.0, 96.0, 102086.40,
  'LOG-2026-0009', 'CLS-2026-0009',
  'IPP logged an economic-curtailment claim for 11 hours of reduced output on 2026-05-06, asserting a System Operator dispatch-down instruction.',
  'Buyer classification REJECTED the claim as non-compensable: SCADA + the SO dispatch log show NO curtailment instruction was issued during the window. The output reduction was an inverter-string forced outage on the IPP side (a tripped combiner box), i.e. plant UNAVAILABILITY — the plant could not have generated the claimed energy. Deemed energy is owed only for an AVAILABLE plant prevented from delivering; an IPP-fault outage is expressly excluded.',
  'ipp_fault_no_deemed_energy', 'Classification gate exercised: reject_non_compensable. The reduction was IPP-side unavailability (inverter-string forced outage), not a buyer/SO curtailment of an available plant — no deemed energy owed. Commercial-tier denial — regulator-reportable (dispute risk).',
  'non_compensable', '2026-05-06 09:00:00', '2026-05-09 09:00:00', '2026-05-13 09:00:00', 'demo_offtaker_001'
);

-- 10) withdrawn — embedded, seller withdrew the claim
INSERT OR IGNORE INTO oe_curtailment_claims (
  id, claim_number,
  seller_party_id, seller_party_name, buyer_party_name,
  ppa_ref, facility_name, facility_tier, contracted_capacity_mw, tariff_per_mwh,
  curtailment_type, curtailment_event, curtailment_hours, deemed_energy_mwh, claimed_amount,
  log_ref, classification_ref, claim_ref, validation_ref, log_basis, classification_basis, claim_basis, validation_basis, reason_code, rod_notes,
  chain_status, curtailment_logged_at, classification_review_at, claim_prepared_at, claim_submitted_at, validation_underway_at, withdrawn_at, created_by
) VALUES (
  'cec_010', 'CEC-2026-0010',
  'spv_sirius', 'Sirius Solar PV (RF) (Pty) Ltd', 'Drakenstein Municipality',
  'PPA-SIRIUS-EMBEDDED-2023', 'Sirius Embedded Solar (4MW)', 'embedded', 4.0, 1155.00,
  'grid_constraint', 'Embedded export curtailment claim withdrawn after the seller reconciled meter data', 7.0, 18.5, 21367.50,
  'LOG-2026-0010', 'CLS-2026-0010', 'CLM-2026-0010', 'VAL-2026-0010',
  'Embedded 4MW PV plant logged a grid-constraint export-curtailment claim for a 7-hour municipal feeder limitation.',
  'Buyer confirmed a feeder limitation occurred and the claim was potentially compensable.',
  'Seller submitted an 18.5 MWh deemed-export claim from the inverter logs.',
  'During validation the buyer flagged that the revenue meter showed continued export through most of the window. Seller re-checked: the limitation only briefly capped export, not a full curtailment.',
  'seller_withdrew_after_meter_reconciliation', 'Seller WITHDREW the claim after reconciling the revenue-meter data against its inverter logs — actual curtailed export was negligible (<2 MWh) and not worth pursuing. Demonstrates the any-active → withdrawn seller path. Embedded tier — not reportable.',
  'withdrawn', '2026-04-28 09:00:00', '2026-04-30 09:00:00', '2026-05-03 09:00:00', '2026-05-06 09:00:00', '2026-05-12 09:00:00', '2026-05-20 09:00:00', 'demo_offtaker_001'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- cec_001 (curtailment_logged)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_001_a', 'cec_001', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'Economic dispatch-down of available 140MW Kangnas Wind for 14.5h logged — 1,218 MWh deemed energy claimed', '2026-05-24 09:00:00');

-- cec_002 (classification_review)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_002_a', 'cec_002', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'Grid-constraint curtailment of Droogfontein Solar during a transmission maintenance window logged', '2026-05-15 09:00:00'),
('cecv_002_b', 'cec_002', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer assessing planned-maintenance carve-out vs compensable grid-constraint curtailment', '2026-05-18 09:00:00');

-- cec_003 (claim_submitted — traverses claim_prepared)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_003_a', 'cec_003', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'SSEG export curtailment during a municipal feeder reconfiguration logged', '2026-05-19 09:00:00'),
('cecv_003_b', 'cec_003', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer reviewing compensability', '2026-05-21 09:00:00'),
('cecv_003_c', 'cec_003', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'demo_offtaker_001', 'buyer', 'Confirmed compensable — network-reconfiguration export limitation', '2026-05-23 09:00:00'),
('cecv_003_d', 'cec_003', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_kuruman_sseg', 'seller', 'Seller submitted a 14.2 MWh deemed-export claim from calibrated inverter logs + irradiance reference', '2026-05-26 09:00:00');

-- cec_004 (validation_underway)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_004_a', 'cec_004', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'System-security curtailment of Garob Wind during a grid-frequency event logged', '2026-05-08 09:00:00'),
('cecv_004_b', 'cec_004', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer reviewing compensability', '2026-05-11 09:00:00'),
('cecv_004_c', 'cec_004', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'demo_offtaker_001', 'buyer', 'Confirmed compensable — system-security curtailment', '2026-05-14 09:00:00'),
('cecv_004_d', 'cec_004', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_garob', 'seller', 'Seller submitted a 2,870 MWh deemed-energy claim from the SCADA power-curve method', '2026-05-17 09:00:00'),
('cecv_004_e', 'cec_004', 'curtailment_claim.validation_underway', 'claim_submitted', 'validation_underway', 'demo_offtaker_001', 'buyer', 'Validation underway — reconciling SCADA, nacelle wind, and the WAsP resource model; IE cross-checking availability', '2026-05-21 09:00:00');

-- cec_005 (quantum_proposed)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_005_a', 'cec_005', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'Repeated midday economic curtailments of De Aar Solar logged', '2026-05-01 09:00:00'),
('cecv_005_b', 'cec_005', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer reviewing compensability', '2026-05-03 09:00:00'),
('cecv_005_c', 'cec_005', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'demo_offtaker_001', 'buyer', 'Confirmed compensable economic curtailment', '2026-05-06 09:00:00'),
('cecv_005_d', 'cec_005', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_dedeaar', 'seller', 'Seller submitted a 1,604 MWh deemed-energy claim from the clear-sky PVsyst reference', '2026-05-10 09:00:00'),
('cecv_005_e', 'cec_005', 'curtailment_claim.validation_underway', 'claim_submitted', 'validation_underway', 'demo_offtaker_001', 'buyer', 'Validation reconciled inverter telemetry + satellite irradiance', '2026-05-16 09:00:00'),
('cecv_005_f', 'cec_005', 'curtailment_claim.quantum_proposed', 'validation_underway', 'quantum_proposed', 'demo_offtaker_001', 'buyer', 'Buyer proposed R1.512m (1,438 validated MWh × R1051.30) — a ~10% trim. Seller to agree or dispute.', '2026-05-25 09:00:00');

-- cec_006 (disputed — W34 lc_005 provenance)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_006_a', 'cec_006', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'Economic curtailment of Loeriesfontein 2 under W34 instruction lc_005 logged', '2026-04-10 09:00:00'),
('cecv_006_b', 'cec_006', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer reviewing compensability', '2026-04-12 09:00:00'),
('cecv_006_c', 'cec_006', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'demo_offtaker_001', 'buyer', 'Confirmed compensable economic curtailment', '2026-04-15 09:00:00'),
('cecv_006_d', 'cec_006', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_loeriesfontein', 'seller', 'Seller submitted a 5,240 MWh deemed-energy claim from the nacelle-wind / power-curve method', '2026-04-18 09:00:00'),
('cecv_006_e', 'cec_006', 'curtailment_claim.validation_underway', 'claim_submitted', 'validation_underway', 'demo_offtaker_001', 'buyer', 'Validation applied a wake-loss + availability haircut and hub-height wind correction', '2026-04-25 09:00:00'),
('cecv_006_f', 'cec_006', 'curtailment_claim.quantum_proposed', 'validation_underway', 'quantum_proposed', 'demo_offtaker_001', 'buyer', 'Buyer proposed R4.380m (4,296 MWh × R1019.60)', '2026-05-05 09:00:00'),
('cecv_006_g', 'cec_006', 'curtailment_claim.disputed', 'quantum_proposed', 'disputed', 'spv_loeriesfontein', 'seller', 'Seller DISPUTED — contends excessive wake-loss haircut + conservative power curve understates the >12 m/s band. Variance R0.96m (~18%).', '2026-05-12 09:00:00');

-- cec_007 (compensation_settled — FULL happy arc, traverses quantum_agreed; W22 ppa_006 provenance)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_007_a', 'cec_007', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'admin', 'seller', 'Aggregated quarterly deemed-energy claim on the W22 Roggeveld PPA (ppa_006) — 96 curtailed hours logged', '2025-12-20 09:00:00'),
('cecv_007_b', 'cec_007', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'admin', 'buyer', 'Buyer reviewing the multi-event claim for compensability', '2025-12-23 09:00:00'),
('cecv_007_c', 'cec_007', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'admin', 'buyer', 'All events confirmed compensable; none IPP-attributable', '2025-12-29 09:00:00'),
('cecv_007_d', 'cec_007', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_roggeveld', 'seller', 'Seller submitted an 18,640 MWh claim at the W39 tidx_009 escalated tariff (R1032.88/MWh) = R19.253m', '2026-01-08 09:00:00'),
('cecv_007_e', 'cec_007', 'curtailment_claim.validation_underway', 'claim_submitted', 'validation_underway', 'admin', 'buyer', 'IE-supervised validation reconciled SCADA, nacelle wind, and the wake model', '2026-01-20 09:00:00'),
('cecv_007_f', 'cec_007', 'curtailment_claim.quantum_proposed', 'validation_underway', 'quantum_proposed', 'admin', 'buyer', 'Buyer proposed R18.420m (17,834 validated MWh × R1032.88)', '2026-02-10 09:00:00'),
('cecv_007_g', 'cec_007', 'curtailment_claim.quantum_agreed', 'quantum_proposed', 'quantum_agreed', 'admin', 'buyer', 'Seller AGREED the R18.420m quantum after reviewing the validation workpapers', '2026-02-24 09:00:00'),
('cecv_007_h', 'cec_007', 'curtailment_claim.compensation_settled', 'quantum_agreed', 'compensation_settled', 'admin', 'buyer', 'Compensation of R18.42m SETTLED + PAID via the quarterly PPA settlement run. NOTIFIED to regulator (settlement crosses utility_scale).', '2026-03-31 09:00:00');

-- cec_008 (arbitrated — FULL dispute arc with recalculate re-loop; W34 lc_009 provenance; crosses ALL)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_008_a', 'cec_008', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'admin', 'seller', 'W34 stage-7/8 load-shed (lc_009) forced Redstone CSP off-storage despite full availability — claim logged', '2025-10-05 09:00:00'),
('cecv_008_b', 'cec_008', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'admin', 'buyer', 'Buyer reviewing compensability', '2025-10-08 09:00:00'),
('cecv_008_c', 'cec_008', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'admin', 'buyer', 'Confirmed compensable — system-security curtailment of an available dispatchable plant', '2025-10-14 09:00:00'),
('cecv_008_d', 'cec_008', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_redstone', 'seller', 'Seller submitted a 2,480 MWh claim at the R2640.50/MWh CSP tariff = R6.548m', '2025-10-22 09:00:00'),
('cecv_008_e', 'cec_008', 'curtailment_claim.validation_underway', 'claim_submitted', 'validation_underway', 'admin', 'buyer', 'Validation disputed the storage-dispatch counterfactual', '2025-11-05 09:00:00'),
('cecv_008_f', 'cec_008', 'curtailment_claim.quantum_proposed', 'validation_underway', 'quantum_proposed', 'admin', 'buyer', 'Buyer proposed R4.720m (~1,788 MWh)', '2025-11-25 09:00:00'),
('cecv_008_g', 'cec_008', 'curtailment_claim.disputed', 'quantum_proposed', 'disputed', 'spv_redstone', 'seller', 'Seller DISPUTED (round 1) — the charged thermal store would have served the evening peak at the full CSP tariff', '2025-12-08 09:00:00'),
('cecv_008_h', 'cec_008', 'curtailment_claim.quantum_proposed', 'disputed', 'quantum_proposed', 'admin', 'buyer', 'Buyer RECALCULATED on revised storage-dispatch assumptions and re-proposed — parties still ~R1.8m apart', '2025-12-20 09:00:00'),
('cecv_008_i', 'cec_008', 'curtailment_claim.disputed', 'quantum_proposed', 'disputed', 'spv_redstone', 'seller', 'Seller DISPUTED again (round 2) — counterfactual storage-dispatch schedule still unresolved', '2026-01-05 09:00:00'),
('cecv_008_j', 'cec_008', 'curtailment_claim.arbitrated', 'disputed', 'arbitrated', 'arbiter_afsa', 'arbiter', 'Referred to AFSA arbitration under the PPA dispute clause. NOTIFIED to regulator (arbitration crosses ALL tiers — universal hard line).', '2026-01-15 09:00:00');

-- cec_009 (non_compensable — classification gate)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_009_a', 'cec_009', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'IPP logged an 11-hour economic-curtailment claim for Greefspan Solar asserting an SO dispatch-down', '2026-05-06 09:00:00'),
('cecv_009_b', 'cec_009', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer cross-checking the SO dispatch log + SCADA against the asserted instruction', '2026-05-09 09:00:00'),
('cecv_009_c', 'cec_009', 'curtailment_claim.non_compensable', 'classification_review', 'non_compensable', 'demo_offtaker_001', 'buyer', 'REJECTED non-compensable — no SO instruction issued; the reduction was an IPP-side inverter-string forced outage (plant unavailability). NOTIFIED to regulator (commercial denial — dispute risk).', '2026-05-13 09:00:00');

-- cec_010 (withdrawn)
INSERT OR IGNORE INTO oe_curtailment_claims_events (id, claim_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('cecv_010_a', 'cec_010', 'curtailment_claim.curtailment_logged', null, 'curtailment_logged', 'demo_offtaker_001', 'seller', 'Embedded 4MW Sirius Solar logged a grid-constraint export-curtailment claim', '2026-04-28 09:00:00'),
('cecv_010_b', 'cec_010', 'curtailment_claim.classification_review', 'curtailment_logged', 'classification_review', 'demo_offtaker_001', 'buyer', 'Buyer confirmed a feeder limitation occurred — potentially compensable', '2026-04-30 09:00:00'),
('cecv_010_c', 'cec_010', 'curtailment_claim.claim_prepared', 'classification_review', 'claim_prepared', 'demo_offtaker_001', 'buyer', 'Claim prepared', '2026-05-03 09:00:00'),
('cecv_010_d', 'cec_010', 'curtailment_claim.claim_submitted', 'claim_prepared', 'claim_submitted', 'spv_sirius', 'seller', 'Seller submitted an 18.5 MWh deemed-export claim from inverter logs', '2026-05-06 09:00:00'),
('cecv_010_e', 'cec_010', 'curtailment_claim.validation_underway', 'claim_submitted', 'validation_underway', 'demo_offtaker_001', 'buyer', 'Validation flagged the revenue meter showed continued export through most of the window', '2026-05-12 09:00:00'),
('cecv_010_f', 'cec_010', 'curtailment_claim.withdrawn', 'validation_underway', 'withdrawn', 'spv_sirius', 'seller', 'Seller WITHDREW after reconciling revenue-meter data — actual curtailed export negligible (<2 MWh)', '2026-05-20 09:00:00');
