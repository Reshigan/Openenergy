-- Wave 36 — Trader Best-Execution / RFQ Compliance seed data
-- 10 prod-realistic cases across 10 of 11 states (omits rfq_expired) + 3 FSCA tiers.
-- SA energy-exchange RFQs (day-ahead / forward power, RECs, carbon allowances).
-- Desk = Open Energy Exchange trading desk; clients = SA market participants.
-- Cross-wave provenance: W9 MM compliance + W29 position-limit cases can spawn
-- a best-ex review (override to reduce a flagged position; exception on MM duty).

-- 1) rfq_received — retail municipality day-ahead buy RFQ just arrived
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  notional_zar, best_ex_basis,
  chain_status, rfq_received_at, sla_deadline_at, created_by
) VALUES (
  'bex_001', 'RFQ-2026-0001',
  'oe_desk', 'Open Energy Exchange Desk', 'client_drakenstein', 'Drakenstein Local Municipality', 'retail',
  'Day-ahead baseload buy', 'baseload', 'buy', 480, '2026-05-29',
  624000, 'Retail municipal offtaker — full best-ex protection (total consideration). RFQ logged, quote solicitation pending.',
  'rfq_received', '2026-05-28 06:05:00', '2026-05-28 06:35:00', 'demo_trader_001'
);

-- 2) quotes_solicited — professional trading house forward wind block
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  notional_zar, rfq_ref, best_ex_basis,
  chain_status, rfq_received_at, quotes_solicited_at, sla_deadline_at, created_by
) VALUES (
  'bex_002', 'RFQ-2026-0002',
  'oe_desk', 'Open Energy Exchange Desk', 'client_enpower', 'Enpower Trading (Pty) Ltd', 'professional',
  'Q3 forward wind block sell', 'wind', 'sell', 2400, '2026-07-01',
  2952000, 'RFQ-REF-2026-0002', 'Professional counterparty — best-ex applies (lighter). Solicited quotes from 5 liquidity providers; awaiting responses within 15-min market window.',
  'quotes_solicited', '2026-05-28 05:40:00', '2026-05-28 05:48:00', '2026-05-28 06:03:00', 'demo_trader_001'
);

-- 3) quotes_received — eligible counterparty (bank) REC parcel
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, notional_zar, rfq_ref, best_ex_basis,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, sla_deadline_at, created_by
) VALUES (
  'bex_003', 'RFQ-2026-0003',
  'oe_desk', 'Open Energy Exchange Desk', 'client_rmb', 'Rand Merchant Bank (RMB Markets)', 'eligible_counterparty',
  'REC parcel buy (I-REC)', 'solar', 'buy', 6000, '2026-06-15',
  6, 142.50, 'GreenCape Trading', 855000, 'RFQ-REF-2026-0003', 'ECP — best-ex largely waived. 6 quotes received; best R142.50/REC from GreenCape. ECP confirmed own-assessment of execution venues.',
  'quotes_received', '2026-05-28 04:30:00', '2026-05-28 04:40:00', '2026-05-28 05:05:00', '2026-05-28 06:30:00', 'demo_trader_001'
);

-- 4) best_ex_evaluated — retail C&I offtaker peaking cover (total-consideration evaluation done)
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, total_consideration_zar, notional_zar,
  rfq_ref, evaluation_ref, best_ex_basis,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, sla_deadline_at, created_by
) VALUES (
  'bex_004', 'RFQ-2026-0004',
  'oe_desk', 'Open Energy Exchange Desk', 'client_coegapack', 'Coega Packaging (C&I offtaker)', 'retail',
  'Peaking cover buy', 'peaking', 'buy', 120, '2026-05-29',
  4, 1820.00, 'Vitol Energy SA', 218400, 218400,
  'RFQ-REF-2026-0004', 'BEX-EVAL-2026-0004', 'Retail — total consideration evaluated across 4 quotes: price + clearing fee + speed + fill likelihood. Vitol R1820/MWh wins on total cost despite not being headline-cheapest. Awaiting compliance approval.',
  'best_ex_evaluated', '2026-05-28 03:00:00', '2026-05-28 03:12:00', '2026-05-28 03:35:00', '2026-05-28 04:10:00', '2026-05-28 05:10:00', 'demo_trader_001'
);

-- 5) execution_approved — professional utility forward solar (compliance approved, awaiting fill)
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, total_consideration_zar, notional_zar,
  rfq_ref, evaluation_ref, approval_ref, best_ex_basis, approval_basis,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, execution_approved_at, sla_deadline_at, created_by
) VALUES (
  'bex_005', 'RFQ-2026-0005',
  'oe_desk', 'Open Energy Exchange Desk', 'client_citypower', 'City Power Johannesburg', 'professional',
  'Forward solar block buy', 'solar', 'buy', 3600, '2026-08-01',
  5, 1185.00, 'Sasol Energy Markets', 4266000, 4266000,
  'RFQ-REF-2026-0005', 'BEX-EVAL-2026-0005', 'BEX-APPR-2026-0005', 'Professional — Sasol R1185/MWh best total consideration over 5 quotes. Compliance pre-execution sign-off complete.', 'Compliance approved — best-ex evaluation documented; venue selection consistent with execution policy. Cleared to execute within 30-min window.',
  'execution_approved', '2026-05-28 02:00:00', '2026-05-28 02:10:00', '2026-05-28 02:35:00', '2026-05-28 03:10:00', '2026-05-28 03:30:00', '2026-05-28 04:00:00', 'demo_trader_001'
);

-- 6) executed — eligible counterparty large baseload (executed, awaiting TCA review)
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, executed_price_zar, executed_counterparty,
  total_consideration_zar, notional_zar, price_improvement_bps, slippage_bps,
  rfq_ref, evaluation_ref, approval_ref, execution_ref, best_ex_basis,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, execution_approved_at, executed_at, sla_deadline_at, created_by
) VALUES (
  'bex_006', 'RFQ-2026-0006',
  'oe_desk', 'Open Energy Exchange Desk', 'client_standardbank', 'Standard Bank Energy Trading', 'eligible_counterparty',
  'Baseload forward sell', 'baseload', 'sell', 12000, '2026-09-01',
  7, 1095.00, 'Eskom Wholesale', 1097.50, 'Eskom Wholesale',
  13170000, 13140000, 2.3, 0.0,
  'RFQ-REF-2026-0006', 'BEX-EVAL-2026-0006', 'BEX-APPR-2026-0006', 'EXE-2026-0006', 'ECP — executed at R1097.50 (2.3bps improvement vs working benchmark) with Eskom Wholesale, best of 7 quotes. ECP best-ex waived but TCA still run for venue analytics.',
  'executed', '2026-05-27 09:00:00', '2026-05-27 09:12:00', '2026-05-27 09:40:00', '2026-05-27 10:15:00', '2026-05-27 10:40:00', '2026-05-27 11:05:00', '2026-06-03 11:05:00', 'demo_trader_001'
);

-- 7) override_executed — retail, executed AWAY from best quote (documented size/likelihood basis) — W29 provenance
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, executed_price_zar, executed_counterparty,
  total_consideration_zar, notional_zar, slippage_bps,
  rfq_ref, evaluation_ref, execution_ref, override_ref, best_ex_basis, override_basis, reason_code,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, override_executed_at, sla_deadline_at, created_by
) VALUES (
  'bex_007', 'RFQ-2026-0007',
  'poslimit.reduction_required', 'poslimit_case', 'pos_007', 'W29',
  'oe_desk', 'Open Energy Exchange Desk', 'client_msunduzi', 'Msunduzi Municipality', 'retail',
  'Day-ahead wind sell (position unwind)', 'wind', 'sell', 900, '2026-05-28',
  4, 1240.00, 'BTE Renewables', 1218.00, 'Eskom Wholesale',
  1096200, 1116000, 17.7,
  'RFQ-REF-2026-0007', 'BEX-EVAL-2026-0007', 'EXE-2026-0007', 'OVR-2026-0007', 'Retail — headline best quote R1240 (BTE) for only 400MWh; insufficient size + low fill likelihood for full 900MWh unwind tied to W29 position-limit reduction.', 'DOCUMENTED OVERRIDE — executed full 900MWh with Eskom at R1218 (17.7bps below headline) to guarantee same-day fill of the position-limit reduction (W29 pos_007). Size + certainty of execution outweighed marginal price. Crosses to FSCA per retail best-ex.', 'override_size_likelihood',
  'override_executed', '2026-05-28 04:00:00', '2026-05-28 04:08:00', '2026-05-28 04:30:00', '2026-05-28 05:00:00', '2026-05-28 05:25:00', '2026-05-28 09:25:00', 'demo_trader_001'
);

-- 8) tca_reviewed — professional, post-trade TCA complete (awaiting close)
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, executed_price_zar, executed_counterparty,
  total_consideration_zar, notional_zar, price_improvement_bps, slippage_bps,
  rfq_ref, evaluation_ref, approval_ref, execution_ref, tca_ref, best_ex_basis, tca_findings,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, execution_approved_at, executed_at, tca_reviewed_at, sla_deadline_at, created_by
) VALUES (
  'bex_008', 'RFQ-2026-0008',
  'oe_desk', 'Open Energy Exchange Desk', 'client_vitol', 'Vitol Energy SA', 'professional',
  'Carbon allowance forward buy', 'carbon', 'buy', 5000, '2026-12-01',
  6, 159.00, 'Promethium Carbon', 158.50, 'Promethium Carbon',
  792500, 795000, 3.1, 0.0,
  'RFQ-REF-2026-0008', 'BEX-EVAL-2026-0008', 'BEX-APPR-2026-0008', 'EXE-2026-0008', 'TCA-2026-0008', 'Professional — best of 6, executed R158.50 vs R159.00 headline (3.1bps improvement) with Promethium Carbon.', 'TCA complete: execution beat arrival benchmark by 3.1bps; venue selection consistent with policy; no information leakage detected. Best-ex obligation satisfied.',
  'tca_reviewed', '2026-05-26 08:00:00', '2026-05-26 08:10:00', '2026-05-26 08:35:00', '2026-05-26 09:10:00', '2026-05-26 09:35:00', '2026-05-26 10:00:00', '2026-05-27 09:00:00', '2026-05-29 09:00:00', 'demo_trader_001'
);

-- 9) closed — retail, full happy-path best-ex lifecycle complete
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, executed_price_zar, executed_counterparty,
  total_consideration_zar, notional_zar, price_improvement_bps, slippage_bps,
  rfq_ref, evaluation_ref, approval_ref, execution_ref, tca_ref, best_ex_basis, tca_findings, reason_code, rod_notes,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, execution_approved_at, executed_at, tca_reviewed_at, closed_at, created_by
) VALUES (
  'bex_009', 'RFQ-2026-0009',
  'oe_desk', 'Open Energy Exchange Desk', 'client_stellenbosch', 'Stellenbosch Municipality', 'retail',
  'Day-ahead solar buy', 'solar', 'buy', 360, '2026-05-26',
  5, 1010.00, 'SOLA Group', 1004.00, 'SOLA Group',
  361440, 363600, 5.9, 0.0,
  'RFQ-REF-2026-0009', 'BEX-EVAL-2026-0009', 'BEX-APPR-2026-0009', 'EXE-2026-0009', 'TCA-2026-0009', 'Retail — total-consideration evaluation across 5 quotes; SOLA Group best on price + fee + speed. Executed R1004 (5.9bps improvement).', 'TCA complete: 5.9bps price improvement vs arrival; full fill; venue consistent. Best-ex fully satisfied for retail client.', 'best_ex_satisfied', 'Closed — retail best-ex lifecycle complete and documented. R1.44k clearing cost; no exceptions.',
  'closed', '2026-05-25 07:00:00', '2026-05-25 07:10:00', '2026-05-25 07:30:00', '2026-05-25 08:00:00', '2026-05-25 08:20:00', '2026-05-25 08:45:00', '2026-05-26 08:00:00', '2026-05-26 14:00:00', 'admin'
);

-- 10) exception_escalated — retail best-ex breach escalated to compliance/FSCA — W9 provenance
INSERT OR IGNORE INTO oe_best_execution (
  id, rfq_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  desk_party_id, desk_party_name, client_party_id, client_party_name, client_tier,
  instrument, energy_type, side, quantity_mwh, delivery_day,
  quotes_count, best_quote_price_zar, best_quote_counterparty, executed_price_zar, executed_counterparty,
  total_consideration_zar, notional_zar, slippage_bps,
  rfq_ref, evaluation_ref, exception_ref, best_ex_basis, exception_basis, reason_code, rod_notes,
  chain_status, rfq_received_at, quotes_solicited_at, quotes_received_at, best_ex_evaluated_at, exception_escalated_at, created_by
) VALUES (
  'bex_010', 'RFQ-2026-0010',
  'market_maker.breach_confirmed', 'mm_compliance', 'mm_004', 'W9',
  'oe_desk', 'Open Energy Exchange Desk', 'client_overstrand', 'Overstrand Municipality', 'retail',
  'Day-ahead baseload buy', 'baseload', 'buy', 240, '2026-05-28',
  3, 1150.00, 'Eskom Wholesale', 1198.00, 'Sasol Energy Markets',
  287520, 287520, 41.7,
  'RFQ-REF-2026-0010', 'BEX-EVAL-2026-0010', 'FSCA-BEX-EXC-2026-0011', 'Retail — best quote R1150 (Eskom) was available and fillable, but order was routed to Sasol at R1198 (41.7bps worse) with no documented size/likelihood justification.', 'BEST-EX BREACH — retail client filled 41.7bps away from a fillable best quote with no override basis. Surveillance flagged via W9 MM-compliance breach mm_004 (same desk). Escalated to compliance + FSCA per Conduct Standard 1 of 2020. Client remediation + venue-routing review ordered.', 'unjustified_away_execution', 'Escalated — potential best-ex duty breach for retail client. FSCA notification FSCA-BEX-EXC-2026-0011. Linked to W9 mm_004.',
  'exception_escalated', '2026-05-28 05:00:00', '2026-05-28 05:08:00', '2026-05-28 05:25:00', '2026-05-28 05:55:00', '2026-05-28 07:30:00', 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- bex_001 events (rfq_received)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_001_a', 'bex_001', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Retail municipal day-ahead buy RFQ logged — 480MWh Drakenstein', '2026-05-28 06:05:00');

-- bex_002 events (quotes_solicited)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_002_a', 'bex_002', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Professional forward wind sell RFQ logged — 2400MWh Enpower', '2026-05-28 05:40:00'),
('bexv_002_b', 'bex_002', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited quotes from 5 liquidity providers — 15-min window', '2026-05-28 05:48:00');

-- bex_003 events (quotes_received)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_003_a', 'bex_003', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'ECP REC parcel buy RFQ logged — 6000 RECs RMB', '2026-05-28 04:30:00'),
('bexv_003_b', 'bex_003', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 6 venues', '2026-05-28 04:40:00'),
('bexv_003_c', 'bex_003', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '6 quotes received — best R142.50/REC GreenCape', '2026-05-28 05:05:00');

-- bex_004 events (best_ex_evaluated)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_004_a', 'bex_004', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Retail peaking cover buy RFQ — 120MWh Coega Packaging', '2026-05-28 03:00:00'),
('bexv_004_b', 'bex_004', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 4 venues', '2026-05-28 03:12:00'),
('bexv_004_c', 'bex_004', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '4 quotes received', '2026-05-28 03:35:00'),
('bexv_004_d', 'bex_004', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Total-consideration evaluation — Vitol R1820 best on total cost; awaiting compliance approval', '2026-05-28 04:10:00');

-- bex_005 events (execution_approved)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_005_a', 'bex_005', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Professional forward solar buy RFQ — 3600MWh City Power', '2026-05-28 02:00:00'),
('bexv_005_b', 'bex_005', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 5 venues', '2026-05-28 02:10:00'),
('bexv_005_c', 'bex_005', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '5 quotes — best Sasol R1185', '2026-05-28 02:35:00'),
('bexv_005_d', 'bex_005', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Best-ex evaluation documented', '2026-05-28 03:10:00'),
('bexv_005_e', 'bex_005', 'best_execution.execution_approved', 'best_ex_evaluated', 'execution_approved', 'oe_compliance', 'compliance', 'Compliance pre-execution sign-off — cleared to execute within 30-min window', '2026-05-28 03:30:00');

-- bex_006 events (executed)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_006_a', 'bex_006', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'ECP baseload forward sell RFQ — 12000MWh Standard Bank', '2026-05-27 09:00:00'),
('bexv_006_b', 'bex_006', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 7 venues', '2026-05-27 09:12:00'),
('bexv_006_c', 'bex_006', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '7 quotes — best Eskom R1095', '2026-05-27 09:40:00'),
('bexv_006_d', 'bex_006', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Evaluation done (ECP — best-ex waived; TCA still scheduled)', '2026-05-27 10:15:00'),
('bexv_006_e', 'bex_006', 'best_execution.execution_approved', 'best_ex_evaluated', 'execution_approved', 'oe_compliance', 'compliance', 'Compliance approved', '2026-05-27 10:40:00'),
('bexv_006_f', 'bex_006', 'best_execution.executed', 'execution_approved', 'executed', 'oe_desk_trader', 'desk', 'Executed R1097.50 Eskom Wholesale — 2.3bps improvement', '2026-05-27 11:05:00');

-- bex_007 events (override_executed — W29 provenance, full evaluated→override path)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_007_a', 'bex_007', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Retail day-ahead wind sell RFQ — 900MWh unwind tied to W29 pos_007', '2026-05-28 04:00:00'),
('bexv_007_b', 'bex_007', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 4 venues', '2026-05-28 04:08:00'),
('bexv_007_c', 'bex_007', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '4 quotes — best R1240 (BTE) only fillable for 400MWh', '2026-05-28 04:30:00'),
('bexv_007_d', 'bex_007', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Headline best insufficient size + low fill likelihood for full 900MWh', '2026-05-28 05:00:00'),
('bexv_007_e', 'bex_007', 'best_execution.override_executed', 'best_ex_evaluated', 'override_executed', 'oe_desk_trader', 'desk', 'DOCUMENTED OVERRIDE — full 900MWh Eskom R1218 (17.7bps below headline) for same-day fill certainty. OVR-2026-0007. Crosses to FSCA (retail).', '2026-05-28 05:25:00');

-- bex_008 events (tca_reviewed)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_008_a', 'bex_008', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Professional carbon allowance forward buy — 5000 Vitol', '2026-05-26 08:00:00'),
('bexv_008_b', 'bex_008', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 6 venues', '2026-05-26 08:10:00'),
('bexv_008_c', 'bex_008', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '6 quotes — best Promethium R159', '2026-05-26 08:35:00'),
('bexv_008_d', 'bex_008', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Evaluation done', '2026-05-26 09:10:00'),
('bexv_008_e', 'bex_008', 'best_execution.execution_approved', 'best_ex_evaluated', 'execution_approved', 'oe_compliance', 'compliance', 'Compliance approved', '2026-05-26 09:35:00'),
('bexv_008_f', 'bex_008', 'best_execution.executed', 'execution_approved', 'executed', 'oe_desk_trader', 'desk', 'Executed R158.50 Promethium — 3.1bps improvement', '2026-05-26 10:00:00'),
('bexv_008_g', 'bex_008', 'best_execution.tca_reviewed', 'executed', 'tca_reviewed', 'oe_compliance', 'compliance', 'TCA complete — beat arrival by 3.1bps; no leakage; best-ex satisfied', '2026-05-27 09:00:00');

-- bex_009 events (closed — full happy path)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_009_a', 'bex_009', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Retail day-ahead solar buy — 360MWh Stellenbosch', '2026-05-25 07:00:00'),
('bexv_009_b', 'bex_009', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 5 venues', '2026-05-25 07:10:00'),
('bexv_009_c', 'bex_009', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '5 quotes — best SOLA R1010', '2026-05-25 07:30:00'),
('bexv_009_d', 'bex_009', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Total-consideration evaluation — SOLA best', '2026-05-25 08:00:00'),
('bexv_009_e', 'bex_009', 'best_execution.execution_approved', 'best_ex_evaluated', 'execution_approved', 'oe_compliance', 'compliance', 'Compliance approved', '2026-05-25 08:20:00'),
('bexv_009_f', 'bex_009', 'best_execution.executed', 'execution_approved', 'executed', 'oe_desk_trader', 'desk', 'Executed R1004 SOLA Group — 5.9bps improvement', '2026-05-25 08:45:00'),
('bexv_009_g', 'bex_009', 'best_execution.tca_reviewed', 'executed', 'tca_reviewed', 'oe_compliance', 'compliance', 'TCA complete — best-ex fully satisfied for retail', '2026-05-26 08:00:00'),
('bexv_009_h', 'bex_009', 'best_execution.closed', 'tca_reviewed', 'closed', 'oe_compliance', 'compliance', 'Closed — retail best-ex lifecycle documented, no exceptions', '2026-05-26 14:00:00');

-- bex_010 events (exception_escalated — W9 provenance)
INSERT OR IGNORE INTO oe_best_execution_events (id, rfq_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('bexv_010_a', 'bex_010', 'best_execution.rfq_received', null, 'rfq_received', 'oe_desk_trader', 'desk', 'Retail day-ahead baseload buy — 240MWh Overstrand', '2026-05-28 05:00:00'),
('bexv_010_b', 'bex_010', 'best_execution.quotes_solicited', 'rfq_received', 'quotes_solicited', 'oe_desk_trader', 'desk', 'Solicited 3 venues', '2026-05-28 05:08:00'),
('bexv_010_c', 'bex_010', 'best_execution.quotes_received', 'quotes_solicited', 'quotes_received', 'oe_desk_trader', 'desk', '3 quotes — best R1150 Eskom (fillable)', '2026-05-28 05:25:00'),
('bexv_010_d', 'bex_010', 'best_execution.best_ex_evaluated', 'quotes_received', 'best_ex_evaluated', 'oe_desk_trader', 'desk', 'Evaluation flagged — order routed to Sasol R1198 (41.7bps worse) without documented basis', '2026-05-28 05:55:00'),
('bexv_010_e', 'bex_010', 'best_execution.exception_escalated', 'best_ex_evaluated', 'exception_escalated', 'oe_compliance', 'compliance', 'BEST-EX BREACH escalated to FSCA — FSCA-BEX-EXC-2026-0011; linked to W9 mm_004; client remediation + routing review ordered', '2026-05-28 07:30:00');
