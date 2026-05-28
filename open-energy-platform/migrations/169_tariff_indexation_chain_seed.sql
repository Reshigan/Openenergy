-- Wave 39 — Offtaker PPA Tariff Indexation / CPI Escalation seed data.
-- 10 prod-realistic cases across 10 of 11 states (omits standalone recalculated,
-- which is still traversed inside the tidx_010 arbitrated flagship) + 3 tiers.
-- SA REIPPPP + C&I wheeling + embedded PPAs. Seller = IPP; offtaker reviews /
-- agrees / disputes. Cross-wave provenance: the W22 Roggeveld in-force PPA
-- (ppa_006) drives the flagship applied escalation; the W32 Atlantis Gas
-- take-or-pay dispute (top_009 / ppa_010) reveals an indexation error that
-- escalates to NERSA arbitration.

-- 1) indexation_due — utility, Year-5 CSP anniversary escalation awaited
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period,
  calculation_basis,
  chain_status, indexation_due_at, sla_deadline_at, created_by
) VALUES (
  'tidx_001', 'TIDX-2026-0001',
  'spv_kathu', 'Kathu Solar Park (RF) (Pty) Ltd', 'eskom', 'Eskom Holdings SOC Ltd',
  'PPA-KATHU-CSP', 'Kathu 100MW Solar Park (CSP)', 'utility_scale', 5,
  2105.00, 'CPI', '2026-04 vs 2025-04',
  'Year-5 anniversary escalation due. Stats SA April CPI to be published 22 May; seller to lodge the reference index reading and escalation calc within the indexation window.',
  'indexation_due', '2026-05-01 00:00:00', '2026-06-15 00:00:00', 'demo_offtaker_001'
);

-- 2) index_published — commercial, C&I wheeling, CPI reading published
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value,
  index_ref, calculation_basis,
  chain_status, indexation_due_at, index_published_at, sla_deadline_at, created_by
) VALUES (
  'tidx_002', 'TIDX-2026-0002',
  'spv_sola_secunda', 'SOLA Group (Pty) Ltd', 'sasol', 'Sasol South Africa (Pty) Ltd',
  'PPA-SASOL-WHEEL', 'Sasol Secunda 80MW Solar Wheeling', 'commercial', 3,
  890.00, 'CPI', '2026-04 vs 2025-04', 5.30,
  'IDX-2026-0002', 'Stats SA April 2026 CPI published at 5.30% y/y. Seller to compute the escalation factor against the PPA base of R890/MWh.',
  'index_published', '2026-05-01 00:00:00', '2026-05-22 09:00:00', '2026-06-01 09:00:00', 'demo_offtaker_001'
);

-- 3) escalation_calculated — embedded, rooftop PV, factor computed
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh,
  index_ref, calculation_basis,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, sla_deadline_at, created_by
) VALUES (
  'tidx_003', 'TIDX-2026-0003',
  'spv_solarafrica', 'SolarAfrica Energy (Pty) Ltd', 'va_waterfront', 'V&A Waterfront Holdings (Pty) Ltd',
  'PPA-VANDA-PV', 'V&A Waterfront 4MW Rooftop PV', 'embedded', 2,
  1240.00, 'CPI', '2026-04 vs 2025-04', 5.30, 1.0530, 1305.72,
  'IDX-2026-0003', 'CPI 5.30% applied to base R1240/MWh → factor 1.0530 → proposed R1305.72/MWh. Embedded PPA escalates 1:1 with headline CPI (no spread).',
  'escalation_calculated', '2026-05-01 00:00:00', '2026-05-22 09:00:00', '2026-05-25 09:00:00', '2026-05-30 09:00:00', 'demo_offtaker_001'
);

-- 4) notice_issued — utility, CSP indexation notice issued to offtaker
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh, annual_contract_value_zar,
  index_ref, notice_ref, calculation_basis, notice_basis,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, notice_issued_at, sla_deadline_at, created_by
) VALUES (
  'tidx_004', 'TIDX-2026-0004',
  'spv_redstone', 'Redstone Solar Thermal Power (RF) (Pty) Ltd', 'eskom', 'Eskom Holdings SOC Ltd',
  'PPA-REDSTONE-CSP', 'Redstone 100MW Solar Thermal (CSP)', 'utility_scale', 4,
  2890.00, 'CPI', '2026-04 vs 2025-04', 5.30, 1.0680, 3086.52, 1247000000,
  'IDX-2026-0004', 'NOT-2026-0004', 'CPI 5.30% + 1.50% contractual spread → factor 1.0680 → proposed R3086.52/MWh.', 'Formal indexation notice served on Eskom: new tariff R3086.52/MWh effective on the Year-4 anniversary. 10-business-day review window opens.',
  'notice_issued', '2026-04-01 00:00:00', '2026-04-22 09:00:00', '2026-04-25 09:00:00', '2026-04-28 09:00:00', '2026-05-08 09:00:00', 'demo_offtaker_001'
);

-- 5) under_review — commercial, offtaker reviewing the notice
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh, annual_contract_value_zar,
  index_ref, notice_ref, calculation_basis, notice_basis, review_basis,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, notice_issued_at, under_review_at, sla_deadline_at, created_by
) VALUES (
  'tidx_005', 'TIDX-2026-0005',
  'spv_edf_mogalakwena', 'EDF Renewables SA (Pty) Ltd', 'amplats', 'Anglo American Platinum Ltd',
  'PPA-AMPLATS-SOLAR', 'Mogalakwena 100MW Solar Wheeling', 'commercial', 3,
  845.00, 'CPI', '2026-03 vs 2025-03', 5.10, 1.0510, 888.10, 311000000,
  'IDX-2026-0005', 'NOT-2026-0005', 'CPI 5.10% applied → factor 1.0510 → proposed R888.10/MWh.', 'Indexation notice served on Anglo American Platinum.', 'Offtaker treasury reviewing the CPI reference period — confirming March vs March base is the contractually correct window (not April). Reconciliation of the wheeled-volume base in progress.',
  'under_review', '2026-04-01 00:00:00', '2026-04-18 09:00:00', '2026-04-21 09:00:00', '2026-04-24 09:00:00', '2026-04-27 09:00:00', '2026-05-12 09:00:00', 'demo_offtaker_001'
);

-- 6) tariff_agreed — embedded, parties agreed, awaiting application to invoicing
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh, agreed_tariff_zar_mwh, annual_contract_value_zar,
  index_ref, notice_ref, calculation_basis, notice_basis, review_basis, reason_code,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, notice_issued_at, under_review_at, tariff_agreed_at, sla_deadline_at, created_by
) VALUES (
  'tidx_006', 'TIDX-2026-0006',
  'spv_energy_partners', 'Energy Partners Utilities (Pty) Ltd', 'attacq', 'Attacq Ltd',
  'PPA-ATTACQ-PV', 'Mall of Africa 6MW Rooftop PV', 'embedded', 4,
  1180.00, 'CPI', '2026-03 vs 2025-03', 5.10, 1.0510, 1240.18, 1240.18, 41200000,
  'IDX-2026-0006', 'NOT-2026-0006', 'CPI 5.10% → factor 1.0510 → R1240.18/MWh.', 'Notice served on Attacq.', 'Offtaker confirmed the CPI reading + reference period; no objection.', 'cpi_agreed_clean',
  'tariff_agreed', '2026-04-01 00:00:00', '2026-04-15 09:00:00', '2026-04-18 09:00:00', '2026-04-21 09:00:00', '2026-04-24 09:00:00', '2026-04-29 09:00:00', '2026-05-04 09:00:00', 'demo_offtaker_001'
);

-- 7) disputed — utility, offtaker disputes the CPI reference period (crosses regulator)
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh, annual_contract_value_zar, disputed_amount_zar,
  index_ref, notice_ref, dispute_ref, calculation_basis, notice_basis, dispute_basis, reason_code,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, notice_issued_at, disputed_at, dispute_round, sla_deadline_at, created_by
) VALUES (
  'tidx_007', 'TIDX-2026-0007',
  'spv_tsitsikamma', 'Tsitsikamma Community Wind Farm (RF) (Pty) Ltd', 'eskom', 'Eskom Holdings SOC Ltd',
  'PPA-TSITSI-WIND', 'Tsitsikamma 95MW Community Wind', 'utility_scale', 6,
  1320.00, 'CPI', '2026-04 vs 2025-04', 5.30, 1.0680, 1409.76, 412000000, 18300000,
  'IDX-2026-0007', 'NOT-2026-0007', 'DISP-2026-0007', 'Seller applied CPI 5.30% + 1.50% spread → factor 1.0680.', 'Indexation notice served — proposed R1409.76/MWh.', 'Eskom disputes the index basis: contends the PPA fixes the spread at 1.00% (not 1.50%) and the reference period is March-on-March (not April). Disputed delta R18.3m p.a. Dispute NOTIFIED to NERSA (utility tariff oversight, ERA §4).', 'index_basis_disputed',
  'disputed', '2026-04-01 00:00:00', '2026-04-22 09:00:00', '2026-04-25 09:00:00', '2026-04-28 09:00:00', '2026-05-05 09:00:00', 1, '2026-05-15 09:00:00', 'demo_offtaker_001'
);

-- 8) withdrawn — commercial, indexation superseded by a mid-cycle contract amendment (terminal)
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period,
  index_ref, calculation_basis, reason_code, rod_notes,
  chain_status, indexation_due_at, index_published_at, withdrawn_at, created_by
) VALUES (
  'tidx_008', 'TIDX-2026-0008',
  'spv_distell_adam_tas', 'SolarAfrica Energy (Pty) Ltd', 'distell', 'Distell Group Holdings Ltd',
  'PPA-DISTELL-WHEEL', 'Adam Tas 25MW Solar Wheeling', 'commercial', 2,
  910.00, 'CPI', '2026-04 vs 2025-04',
  'IDX-2026-0008', 'CPI escalation initiated for the Year-2 anniversary.', 'amendment_superseded', 'Indexation WITHDRAWN: the parties renegotiated the escalation formula mid-cycle (moved from headline CPI to a CPI+forex blend reflecting panel-replacement import costs). A fresh indexation will be raised under the amended contract. No tariff applied under this cycle.',
  'withdrawn', '2026-05-01 00:00:00', '2026-05-22 09:00:00', '2026-05-26 09:00:00', 'admin'
);

-- 9) applied — utility, FULL happy path applied (terminal) — W22 Roggeveld ppa_006 provenance
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh, agreed_tariff_zar_mwh, annual_contract_value_zar,
  index_ref, notice_ref, calculation_basis, notice_basis, review_basis, reason_code, rod_notes,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, notice_issued_at, under_review_at, tariff_agreed_at, applied_at, created_by
) VALUES (
  'tidx_009', 'TIDX-2026-0009',
  'ppa.executed', 'ppa_contract', 'ppa_006', 'W22',
  'p_ipp_roggeveld', 'Roggeveld Wind Farm (RF) (Pty) Ltd', 'p_offtaker_eskom', 'Eskom Holdings SOC Ltd',
  'PPA-2026-0006', 'Roggeveld 147MW Wind', 'utility_scale', 1,
  973.50, 'CPI', '2026-03 vs 2025-03', 5.10, 1.0610, 1032.88, 1032.88, 465700000,
  'IDX-2026-0009', 'NOT-2026-0009', 'CPI 5.10% + 1.00% contractual spread (cpi_+_1pct) → factor 1.0610 → R1032.88/MWh.', 'Year-1 indexation notice served on Eskom for the W22-executed Roggeveld PPA (ppa_006).', 'Eskom confirmed the CPI reading + March reference period; no objection.', 'cpi_applied_clean', 'Full happy path: due → CPI published → factor calculated → notice → review → agreed → APPLIED. New tariff R1032.88/MWh applied to invoicing from the Year-1 anniversary. Linked to W22 Roggeveld ppa_006 (in_force).',
  'applied', '2026-03-01 00:00:00', '2026-03-22 09:00:00', '2026-03-25 09:00:00', '2026-03-28 09:00:00', '2026-04-02 09:00:00', '2026-04-09 09:00:00', '2026-04-12 09:00:00', 'admin'
);

-- 10) arbitrated — utility, dispute→recalc→arbitration (terminal, crosses ALL) — W32 top_009 / Atlantis Gas provenance
INSERT OR IGNORE INTO oe_tariff_indexation (
  id, indexation_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  seller_party_id, seller_party_name, offtaker_party_id, offtaker_party_name,
  ppa_ref, project_name, contract_tier, contract_year,
  base_tariff_zar_mwh, index_type, index_reference_period, index_value, escalation_factor, proposed_tariff_zar_mwh, annual_contract_value_zar, disputed_amount_zar,
  index_ref, notice_ref, dispute_ref, recalc_ref, arbitration_ref, calculation_basis, notice_basis, dispute_basis, recalc_basis, arbitration_basis, reason_code, rod_notes,
  chain_status, indexation_due_at, index_published_at, escalation_calculated_at, notice_issued_at, disputed_at, recalculated_at, arbitrated_at, dispute_round, created_by
) VALUES (
  'tidx_010', 'TIDX-2025-0010',
  'top.disputed', 'take_or_pay', 'top_009', 'W32',
  'ipp_atlantis_gas', 'Atlantis Gas Peaking (Pty) Ltd', 'eskom', 'Eskom Holdings SOC Ltd',
  'PPA-2026-0010', 'Atlantis 342MW Gas Peaking', 'utility_scale', 4,
  2440.00, 'CPI+forex', '2024-04 vs 2023-04', 6.40, 1.1120, 2713.28, 928000000, 84500000,
  'IDX-2025-0010', 'NOT-2025-0010', 'DISP-2025-0010', 'RECALC-2025-0010', 'ARB-2025-0010', 'Seller applied CPI 6.40% + USD/ZAR forex pass-through → factor 1.1120 → R2713.28/MWh on the gas-indexed PPA.', 'Indexation notice served — proposed R2713.28/MWh.', 'Eskom disputed the forex pass-through methodology: contends the USD/ZAR reference rate window was cherry-picked. Surfaced during the W32 Y2023 take-or-pay reconciliation (top_009) — the disputed take-or-pay quantum exposed the underlying indexation error. Disputed delta R84.5m p.a.', 'Seller recalculated using the contractual 20-day VWAP forex rate → revised factor 1.0890 → R2657.16/MWh. Eskom still rejected the CPI sub-index used.', 'Both parties referred the indexation dispute to NERSA arbitration alongside the W32 Section 34 panel (NERSA-S34-PANEL-2024-0011). Indexation arbitration ref NERSA-TARIFF-ARB-2025-0004. Crosses regulator (refer_arbitration — universal ERA §4 hard line).', 'forex_passthrough_arbitrated', 'Dispute → recalculation → ARBITRATION arc. Linked to W32 take-or-pay top_009 (Atlantis Gas Y2023) which exposed the indexation error. Indexation + take-or-pay heard together by the NERSA panel.',
  'arbitrated', '2024-04-01 00:00:00', '2024-04-22 09:00:00', '2024-04-25 09:00:00', '2024-04-28 09:00:00', '2024-05-06 09:00:00', '2024-05-20 09:00:00', '2024-06-05 09:00:00', 2, 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- tidx_001 (indexation_due)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_001_a', 'tidx_001', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_kathu', 'seller', 'Year-5 CSP anniversary escalation scheduled — awaiting Stats SA April CPI', '2026-05-01 00:00:00');

-- tidx_002 (index_published)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_002_a', 'tidx_002', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_sola_secunda', 'seller', 'Year-3 escalation scheduled', '2026-05-01 00:00:00'),
('tidxv_002_b', 'tidx_002', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_sola_secunda', 'seller', 'Stats SA April 2026 CPI published at 5.30% y/y', '2026-05-22 09:00:00');

-- tidx_003 (escalation_calculated)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_003_a', 'tidx_003', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_solarafrica', 'seller', 'Year-2 escalation scheduled', '2026-05-01 00:00:00'),
('tidxv_003_b', 'tidx_003', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_solarafrica', 'seller', 'CPI 5.30% published', '2026-05-22 09:00:00'),
('tidxv_003_c', 'tidx_003', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'spv_solarafrica', 'seller', 'Factor 1.0530 → proposed R1305.72/MWh', '2026-05-25 09:00:00');

-- tidx_004 (notice_issued)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_004_a', 'tidx_004', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_redstone', 'seller', 'Year-4 CSP escalation scheduled', '2026-04-01 00:00:00'),
('tidxv_004_b', 'tidx_004', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_redstone', 'seller', 'CPI 5.30% published', '2026-04-22 09:00:00'),
('tidxv_004_c', 'tidx_004', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'spv_redstone', 'seller', 'Factor 1.0680 (CPI+1.50% spread) → R3086.52/MWh', '2026-04-25 09:00:00'),
('tidxv_004_d', 'tidx_004', 'tariff_indexation.notice_issued', 'escalation_calculated', 'notice_issued', 'spv_redstone', 'seller', 'Indexation notice served on Eskom — 10-day review window opens', '2026-04-28 09:00:00');

-- tidx_005 (under_review)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_005_a', 'tidx_005', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_edf_mogalakwena', 'seller', 'Year-3 escalation scheduled', '2026-04-01 00:00:00'),
('tidxv_005_b', 'tidx_005', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_edf_mogalakwena', 'seller', 'CPI 5.10% published', '2026-04-18 09:00:00'),
('tidxv_005_c', 'tidx_005', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'spv_edf_mogalakwena', 'seller', 'Factor 1.0510 → R888.10/MWh', '2026-04-21 09:00:00'),
('tidxv_005_d', 'tidx_005', 'tariff_indexation.notice_issued', 'escalation_calculated', 'notice_issued', 'spv_edf_mogalakwena', 'seller', 'Notice served on Anglo American Platinum', '2026-04-24 09:00:00'),
('tidxv_005_e', 'tidx_005', 'tariff_indexation.under_review', 'notice_issued', 'under_review', 'amplats', 'offtaker', 'Offtaker treasury reviewing CPI reference period (March vs March)', '2026-04-27 09:00:00');

-- tidx_006 (tariff_agreed)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_006_a', 'tidx_006', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_energy_partners', 'seller', 'Year-4 escalation scheduled', '2026-04-01 00:00:00'),
('tidxv_006_b', 'tidx_006', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_energy_partners', 'seller', 'CPI 5.10% published', '2026-04-15 09:00:00'),
('tidxv_006_c', 'tidx_006', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'spv_energy_partners', 'seller', 'Factor 1.0510 → R1240.18/MWh', '2026-04-18 09:00:00'),
('tidxv_006_d', 'tidx_006', 'tariff_indexation.notice_issued', 'escalation_calculated', 'notice_issued', 'spv_energy_partners', 'seller', 'Notice served on Attacq', '2026-04-21 09:00:00'),
('tidxv_006_e', 'tidx_006', 'tariff_indexation.under_review', 'notice_issued', 'under_review', 'attacq', 'offtaker', 'Offtaker reviewing', '2026-04-24 09:00:00'),
('tidxv_006_f', 'tidx_006', 'tariff_indexation.tariff_agreed', 'under_review', 'tariff_agreed', 'attacq', 'offtaker', 'Offtaker agreed R1240.18/MWh — awaiting application to invoicing', '2026-04-29 09:00:00');

-- tidx_007 (disputed — utility, crosses regulator)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_007_a', 'tidx_007', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_tsitsikamma', 'seller', 'Year-6 escalation scheduled', '2026-04-01 00:00:00'),
('tidxv_007_b', 'tidx_007', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_tsitsikamma', 'seller', 'CPI 5.30% published', '2026-04-22 09:00:00'),
('tidxv_007_c', 'tidx_007', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'spv_tsitsikamma', 'seller', 'Factor 1.0680 (CPI+1.50%) → R1409.76/MWh', '2026-04-25 09:00:00'),
('tidxv_007_d', 'tidx_007', 'tariff_indexation.notice_issued', 'escalation_calculated', 'notice_issued', 'spv_tsitsikamma', 'seller', 'Notice served on Eskom', '2026-04-28 09:00:00'),
('tidxv_007_e', 'tidx_007', 'tariff_indexation.disputed', 'notice_issued', 'disputed', 'eskom', 'offtaker', 'Eskom disputes the spread (1.00% not 1.50%) + reference period. Delta R18.3m p.a. NOTIFIED to NERSA (utility tariff oversight).', '2026-05-05 09:00:00');

-- tidx_008 (withdrawn — commercial)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_008_a', 'tidx_008', 'tariff_indexation.indexation_due', null, 'indexation_due', 'spv_distell_adam_tas', 'seller', 'Year-2 escalation scheduled', '2026-05-01 00:00:00'),
('tidxv_008_b', 'tidx_008', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'spv_distell_adam_tas', 'seller', 'CPI 5.30% published', '2026-05-22 09:00:00'),
('tidxv_008_c', 'tidx_008', 'tariff_indexation.withdrawn', 'index_published', 'withdrawn', 'spv_distell_adam_tas', 'seller', 'WITHDRAWN — escalation formula renegotiated mid-cycle (CPI → CPI+forex blend); fresh indexation to be raised under the amended contract', '2026-05-26 09:00:00');

-- tidx_009 (applied — full happy path, W22 Roggeveld provenance)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_009_a', 'tidx_009', 'tariff_indexation.indexation_due', null, 'indexation_due', 'p_ipp_roggeveld', 'seller', 'Year-1 escalation scheduled for the W22-executed Roggeveld PPA (ppa_006)', '2026-03-01 00:00:00'),
('tidxv_009_b', 'tidx_009', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'p_ipp_roggeveld', 'seller', 'CPI 5.10% published', '2026-03-22 09:00:00'),
('tidxv_009_c', 'tidx_009', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'p_ipp_roggeveld', 'seller', 'Factor 1.0610 (CPI+1.00%) → R1032.88/MWh', '2026-03-25 09:00:00'),
('tidxv_009_d', 'tidx_009', 'tariff_indexation.notice_issued', 'escalation_calculated', 'notice_issued', 'p_ipp_roggeveld', 'seller', 'Indexation notice served on Eskom', '2026-03-28 09:00:00'),
('tidxv_009_e', 'tidx_009', 'tariff_indexation.under_review', 'notice_issued', 'under_review', 'p_offtaker_eskom', 'offtaker', 'Eskom reviewing CPI reading + reference period', '2026-04-02 09:00:00'),
('tidxv_009_f', 'tidx_009', 'tariff_indexation.tariff_agreed', 'under_review', 'tariff_agreed', 'p_offtaker_eskom', 'offtaker', 'Eskom agreed R1032.88/MWh — no objection', '2026-04-09 09:00:00'),
('tidxv_009_g', 'tidx_009', 'tariff_indexation.applied', 'tariff_agreed', 'applied', 'p_ipp_roggeveld', 'seller', 'New tariff APPLIED to invoicing from the Year-1 anniversary', '2026-04-12 09:00:00');

-- tidx_010 (arbitrated — dispute→recalc→arbitration, W32 top_009 provenance)
INSERT OR IGNORE INTO oe_tariff_indexation_events (id, indexation_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('tidxv_010_a', 'tidx_010', 'tariff_indexation.indexation_due', null, 'indexation_due', 'ipp_atlantis_gas', 'seller', 'Year-4 gas-indexed escalation scheduled', '2024-04-01 00:00:00'),
('tidxv_010_b', 'tidx_010', 'tariff_indexation.index_published', 'indexation_due', 'index_published', 'ipp_atlantis_gas', 'seller', 'CPI 6.40% + USD/ZAR forex pass-through published', '2024-04-22 09:00:00'),
('tidxv_010_c', 'tidx_010', 'tariff_indexation.escalation_calculated', 'index_published', 'escalation_calculated', 'ipp_atlantis_gas', 'seller', 'Factor 1.1120 → R2713.28/MWh', '2024-04-25 09:00:00'),
('tidxv_010_d', 'tidx_010', 'tariff_indexation.notice_issued', 'escalation_calculated', 'notice_issued', 'ipp_atlantis_gas', 'seller', 'Notice served on Eskom — proposed R2713.28/MWh', '2024-04-28 09:00:00'),
('tidxv_010_e', 'tidx_010', 'tariff_indexation.disputed', 'notice_issued', 'disputed', 'eskom', 'offtaker', 'Eskom disputed forex pass-through methodology — surfaced via W32 take-or-pay top_009. Delta R84.5m p.a. NOTIFIED to NERSA.', '2024-05-06 09:00:00'),
('tidxv_010_f', 'tidx_010', 'tariff_indexation.recalculated', 'disputed', 'recalculated', 'ipp_atlantis_gas', 'seller', 'Recalculated with 20-day VWAP forex → 1.0890 → R2657.16/MWh; Eskom still rejected the CPI sub-index', '2024-05-20 09:00:00'),
('tidxv_010_g', 'tidx_010', 'tariff_indexation.arbitrated', 'recalculated', 'arbitrated', 'eskom', 'offtaker', 'Referred to NERSA arbitration (NERSA-TARIFF-ARB-2025-0004) alongside the W32 Section 34 panel. Crosses regulator (universal ERA §4 hard line).', '2024-06-05 09:00:00');
