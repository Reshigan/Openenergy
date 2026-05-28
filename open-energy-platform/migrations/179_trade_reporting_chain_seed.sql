-- Wave 44 — Trader OTC Transaction / Trade-Repository Reporting & Reconciliation seed.
-- 10 prod-realistic transaction reports across 10 of 12 states (omits standalone
-- break_identified + tr_rejected as resting states — both are TRAVERSED inside the
-- trpt_006 break_resolved + trpt_007 corrected flows) + all 3 classes + every branch
-- (rejection→correct→resubmit, recon-break→resolve, exemption, cancellation, full
-- happy arc). Anchored on real SA energy OTC reporting: the desk's reportable power /
-- carbon / REC / gas forwards, swaps + options submitted to a licensed Trade
-- Repository under the FMA / FSCA OTC Derivatives Reporting regulations (T+1 hard
-- deadline, dual-sided reconciliation). actor_party records the post-trade function
-- per step (desk / reporting_ops / trade_repository). Notionals in R-millions.

-- 1) report_due — otc_derivative, OTC power swap just executed, report due (T+1)
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  chain_status, report_due_at, sla_deadline_at, is_reportable, created_by
) VALUES (
  'trpt_001', 'TR-OTC-2026-0001',
  'best_execution.executed', 'best_execution', 'bex_004', 'W36',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0001', 'TRD-2026-05-7741', 'Standard Bank of South Africa Ltd', 'QFC8ZCW3Q5PRXU1XTM60', 'power', 'swap', 'otc_derivative', 'buy', '2026-05-27', '2026-06-30', '2026-05-28 23:59:00',
  85.0, 50000, 1700, 4.25,
  'report_due', '2026-05-27 17:00:00', '2026-05-28 05:00:00', 1, 'demo_trader_001'
);

-- 2) report_generated — physical_forward, carbon physical-delivery forward, report drafted awaiting submit
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, generation_basis,
  chain_status, report_due_at, report_generated_at, sla_deadline_at, is_reportable, created_by
) VALUES (
  'trpt_002', 'TR-PHF-2026-0002',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0002', 'TRD-2026-05-7758', 'Rand Merchant Bank (FirstRand Ltd)', 'NINYL4CRGNKBLW0SU487', 'carbon', 'forward', 'physical_forward', 'sell', '2026-05-26', '2026-12-15', '2026-05-27 23:59:00',
  41.6, 0, 0, 2.08,
  'TR-GEN-2026-0002',
  'Transaction report generated from the executed carbon credit physical-delivery forward (320,000 t at R130/t = R41.6m): UTI minted, counterparty LEI captured, economic + lifecycle fields populated. Awaiting submission to the JSE Trade Repository within the T+1 window.',
  'report_generated', '2026-05-26 17:00:00', '2026-05-26 19:30:00', '2026-05-27 23:59:00', 1, 'demo_trader_001'
);

-- 3) submitted_to_tr — otc_derivative, OTC power option submitted, awaiting TR acknowledgement
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, submission_ref, generation_basis, submission_basis,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, sla_deadline_at, is_reportable, created_by
) VALUES (
  'trpt_003', 'TR-OTC-2026-0003',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0003', 'TRD-2026-05-7763', 'Absa Bank Ltd', 'Z1YLO5MXCWWAUQH5NX67', 'power', 'option', 'otc_derivative', 'buy', '2026-05-25', '2026-09-30', '2026-05-26 23:59:00',
  132.5, 60000, 2208, 9.30,
  'TR-GEN-2026-0003', 'TR-SUB-2026-0003',
  'Transaction report generated for the OTC power call option (60,000 MWh notional, premium + strike economics captured).',
  'Report submitted to the JSE Trade Repository at 14:20 within the T+1 window; awaiting the TR acknowledgement (ACK) message. 4-hour acknowledgement window running.',
  'submitted_to_tr', '2026-05-25 17:00:00', '2026-05-25 18:40:00', '2026-05-26 14:20:00', '2026-05-26 18:20:00', 1, 'demo_trader_001'
);

-- 4) tr_acknowledged — spot_physical, spot block power, TR acked, reconciliation window open
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, submission_ref, acknowledgement_ref, generation_basis, submission_basis,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, tr_acknowledged_at, sla_deadline_at, is_reportable, created_by
) VALUES (
  'trpt_004', 'TR-SPT-2026-0004',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0004', 'TRD-2026-05-7770', 'Vitol SA (Pty) Ltd', '5493001KJTIIGC8Y1R12', 'power', 'spot', 'spot_physical', 'sell', '2026-05-24', '2026-05-25', '2026-05-25 23:59:00',
  18.4, 12000, 1533, 0.0,
  'TR-GEN-2026-0004', 'TR-SUB-2026-0004', 'TR-ACK-2026-0004',
  'Transaction report generated for the spot block power sale (12,000 MWh single-delivery block).',
  'Report submitted and ACKNOWLEDGED by the JSE Trade Repository (ACK-2026-0004). Reconciliation against the counterparty dual-sided submission now open; spot_physical recon window is the lightest (72h).',
  'tr_acknowledged', '2026-05-24 17:00:00', '2026-05-24 18:10:00', '2026-05-24 20:05:00', '2026-05-24 22:40:00', '2026-05-27 22:40:00', 0, 'demo_trader_001'
);

-- 5) reconciled — physical_forward, gas physical forward reconciled, awaiting confirm
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, submission_ref, acknowledgement_ref, reconciliation_ref,
  generation_basis, submission_basis, reconciliation_basis,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, tr_acknowledged_at, reconciled_at, sla_deadline_at, is_reportable, created_by
) VALUES (
  'trpt_005', 'TR-PHF-2026-0005',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0005', 'TRD-2026-05-7751', 'Sasol Ltd', '378900EB75D7D2C73323', 'gas', 'forward', 'physical_forward', 'buy', '2026-05-22', '2026-11-30', '2026-05-23 23:59:00',
  64.8, 36000, 1800, 3.24,
  'TR-GEN-2026-0005', 'TR-SUB-2026-0005', 'TR-ACK-2026-0005', 'TR-REC-2026-0005',
  'Transaction report generated for the gas physical-delivery forward (36,000 MWh-equiv).',
  'Report submitted and acknowledged by the JSE Trade Repository.',
  'RECONCILED: the desk submission matched the Sasol counterparty dual-sided report on all key economic fields (UTI, notional, price, value date, side). Pairing confirmed; awaiting final confirm-complete sign-off (physical_forward confirm window 24h).',
  'reconciled', '2026-05-22 17:00:00', '2026-05-22 18:00:00', '2026-05-22 19:45:00', '2026-05-22 22:10:00', '2026-05-24 09:30:00', '2026-05-25 09:30:00', 1, 'demo_trader_001'
);

-- 6) break_resolved — otc_derivative, OTC carbon swap recon break identified + resolved (crossed FSCA at break) (REPORTABLE)
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, submission_ref, acknowledgement_ref, reconciliation_ref, break_ref, regulator_ref, is_reportable,
  generation_basis, submission_basis, reconciliation_basis, break_basis, resolution_notes, reason_code,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, tr_acknowledged_at, break_identified_at, break_resolved_at, sla_deadline_at, created_by
) VALUES (
  'trpt_006', 'TR-OTC-2026-0006',
  'poslimit.warning', 'poslimit_case', 'pos_004', 'W29',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0006', 'TRD-2026-05-7729', 'Trafigura PTE Ltd', '5493006MHB84DD0ZWV18', 'carbon', 'swap', 'otc_derivative', 'sell', '2026-05-19', '2026-10-31', '2026-05-20 23:59:00',
  97.2, 0, 0, 6.80,
  'TR-GEN-2026-0006', 'TR-SUB-2026-0006', 'TR-ACK-2026-0006', 'TR-REC-2026-0006', 'TR-BRK-2026-0006', 'FSCA-OTC-2026-0006', 1,
  'Transaction report generated for the OTC carbon swap (R97.2m notional).',
  'Report submitted and acknowledged by the JSE Trade Repository.',
  'Dual-sided reconciliation attempted against the Trafigura submission.',
  'RECONCILIATION BREAK IDENTIFIED: the desk reported notional R97.2m / price R270/t against the counterparty R94.5m / R262.50/t — a value-date and price mismatch on an OTC derivative. Flagged by the TR pairing engine; crosses to the FSCA reporting supervisor (a break on an OTC derivative is the EMIR-style systemic-risk concern). otc break window is the tightest (8h).',
  'BREAK RESOLVED: joint investigation with the counterparty confirmed the desk price (R270/t) was correct; the counterparty re-submitted an amended report aligning the price + value date. Re-reconciliation pending to close the pairing.',
  'counterparty_price_value_date_mismatch',
  'break_resolved', '2026-05-19 17:00:00', '2026-05-19 18:20:00', '2026-05-19 20:00:00', '2026-05-19 23:15:00', '2026-05-20 08:40:00', '2026-05-20 15:10:00', '2026-05-21 03:10:00', 'demo_trader_001'
);

-- 7) corrected — otc_derivative, OTC power forward NACK'd by TR, corrected, awaiting re-submit (crossed FSCA at reject) (REPORTABLE)
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, submission_ref, rejection_ref, correction_ref, regulator_ref, is_reportable, resubmission_count,
  generation_basis, submission_basis, rejection_basis, correction_basis, reason_code,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, tr_rejected_at, corrected_at, sla_deadline_at, created_by
) VALUES (
  'trpt_007', 'TR-OTC-2026-0007',
  'best_execution.override_executed', 'best_execution', 'bex_007', 'W36',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0007', 'TRD-2026-05-7714', 'Nedbank Ltd', 'ZAKEN5DS6P21JD5GH489', 'power', 'forward', 'otc_derivative', 'buy', '2026-05-18', '2026-08-31', '2026-05-19 23:59:00',
  76.0, 40000, 1900, 5.32,
  'TR-GEN-2026-0007', 'TR-SUB-2026-0007', 'TR-NACK-2026-0007', 'TR-COR-2026-0007', 'FSCA-OTC-2026-0007', 1, 1,
  'Transaction report generated for the OTC power forward (40,000 MWh, R76.0m notional).',
  'Report submitted to the JSE Trade Repository.',
  'TR REJECTED (NACK code SCHEMA-014): the submission failed TR validation — the counterparty LEI checksum was invalid and the UTI did not match the agreed namespace prefix. A TR rejection on an OTC derivative crosses to the FSCA reporting supervisor (material class).',
  'CORRECTED: LEI re-sourced from GLEIF and validated; UTI re-minted under the agreed namespace. Corrected report staged for re-submission within the 12h correction window.',
  'invalid_lei_checksum_uti_namespace',
  'corrected', '2026-05-18 17:00:00', '2026-05-18 18:05:00', '2026-05-18 19:30:00', '2026-05-18 21:50:00', '2026-05-19 06:15:00', '2026-05-19 18:15:00', 'demo_trader_001'
);

-- 8) exempted — spot_physical, intragroup de-minimis spot, exempted from reporting
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh,
  exemption_ref, generation_basis, exemption_basis, reason_code,
  chain_status, report_due_at, exempted_at, is_reportable, created_by
) VALUES (
  'trpt_008', 'TR-SPT-2026-0008',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0008', 'TRD-2026-05-7702', 'Open Energy SOC — Treasury (intragroup)', 'ZAOEGRP00000000000IG', 'rec', 'spot', 'spot_physical', 'buy', '2026-05-16', '2026-05-17', '2026-05-17 23:59:00',
  2.6, 1500, 1733,
  'TR-EXM-2026-0008',
  'Spot REC purchase from the group treasury book (1,500 RECs).',
  'EXEMPTED: the transaction is an intragroup spot REC transfer below the de-minimis reporting threshold and between entities consolidated under the same group — exempt from the FMA transaction-reporting obligation. Exemption basis recorded (intragroup + de-minimis); no TR submission required.',
  'intragroup_de_minimis_exemption',
  'exempted', '2026-05-16 17:00:00', '2026-05-16 17:45:00', 0, 'demo_trader_001'
);

-- 9) confirmed_complete — otc_derivative, FULL happy arc flagship (REPORTABLE) — generated→submitted→ack→reconciled→confirmed
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  source_event, source_entity_type, source_entity_id, source_wave,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh, collateral_zar_m,
  generation_ref, submission_ref, acknowledgement_ref, reconciliation_ref, regulator_ref, is_reportable,
  generation_basis, submission_basis, reconciliation_basis, resolution_notes, reason_code,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, tr_acknowledged_at, reconciled_at, confirmed_complete_at, created_by
) VALUES (
  'trpt_009', 'TR-OTC-2026-0009',
  'best_execution.closed', 'best_execution', 'bex_009', 'W36',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0009', 'TRD-2026-05-7688', 'Mercuria Energy Trading SA', '549300C2T7Q9OW8YL462', 'power', 'swap', 'otc_derivative', 'sell', '2026-05-12', '2026-12-31', '2026-05-13 23:59:00',
  154.0, 70000, 2200, 10.78,
  'TR-GEN-2026-0009', 'TR-SUB-2026-0009', 'TR-ACK-2026-0009', 'TR-REC-2026-0009', 'FSCA-OTC-2026-0009', 1,
  'Transaction report generated for the OTC power swap (70,000 MWh, R154.0m notional) — the desk''s largest reportable derivative this cycle.',
  'Report submitted to the JSE Trade Repository at T+0 (intraday) and acknowledged within the hour.',
  'RECONCILED: dual-sided match against the Mercuria submission on all key fields; no break.',
  'CONFIRMED COMPLETE: full happy-path arc — report due → generated → submitted → acknowledged → reconciled → confirmed complete. The transaction-reporting obligation for this OTC derivative is discharged and audit-sealed; surfaced to the FSCA register as a completed material report.',
  'reporting_obligation_discharged',
  'confirmed_complete', '2026-05-12 17:00:00', '2026-05-12 17:35:00', '2026-05-12 18:50:00', '2026-05-12 19:40:00', '2026-05-13 08:20:00', '2026-05-13 14:00:00', 'admin'
);

-- 10) cancelled — physical_forward, trade busted post-execution, report withdrawn
INSERT OR IGNORE INTO oe_trade_reports (
  id, report_number,
  desk_party_id, desk_party_name, trade_repository,
  uti, trade_ref, counterparty_name, counterparty_lei, energy_type, product, report_class, side, trade_date, value_date, reporting_deadline,
  notional_zar_m, volume_mwh, price_zar_mwh,
  generation_ref, submission_ref, generation_basis, resolution_notes, reason_code,
  chain_status, report_due_at, report_generated_at, submitted_to_tr_at, cancelled_at, is_reportable, created_by
) VALUES (
  'trpt_010', 'TR-PHF-2026-0010',
  'desk_oe', 'Open Energy SOC — Proprietary Trading Desk', 'JSE Trade Repository (Pty) Ltd',
  'ZAOEDESK0000000000000000000000TR0010', 'TRD-2026-05-7695', 'Glencore Energy UK Ltd', '2138004UKLB1NUSXE564', 'power', 'forward', 'physical_forward', 'buy', '2026-05-14', '2026-07-31', '2026-05-15 23:59:00',
  53.2, 28000, 1900,
  'TR-GEN-2026-0010', 'TR-SUB-2026-0010',
  'Transaction report generated + submitted for the physical power forward (28,000 MWh).',
  'CANCELLED: the underlying trade was busted post-execution under the exchange error-trade policy (mis-keyed volume — 28,000 MWh booked against an intended 2,800 MWh). The transaction report is withdrawn; a cancellation message was sent to the JSE Trade Repository to void the prior submission. No reportable obligation remains for the busted trade.',
  'trade_busted_error_policy',
  'cancelled', '2026-05-14 17:00:00', '2026-05-14 17:50:00', '2026-05-14 19:10:00', '2026-05-14 22:30:00', 0, 'admin'
);

-- ─── EVENTS ────────────────────────────────────────────────────────────────

-- trpt_001 (report_due)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_001_a', 'trpt_001', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'OTC power swap executed (R85.0m) — transaction report due T+1 to the JSE Trade Repository', '2026-05-27 17:00:00');

-- trpt_002 (report_generated)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_002_a', 'trpt_002', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'Carbon physical-delivery forward executed (R41.6m) — report due', '2026-05-26 17:00:00'),
('trptv_002_b', 'trpt_002', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated — UTI minted, counterparty LEI captured; awaiting submission', '2026-05-26 19:30:00');

-- trpt_003 (submitted_to_tr)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_003_a', 'trpt_003', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'OTC power option executed (R132.5m) — report due', '2026-05-25 17:00:00'),
('trptv_003_b', 'trpt_003', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-25 18:40:00'),
('trptv_003_c', 'trpt_003', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository within T+1; awaiting ACK (4h window)', '2026-05-26 14:20:00');

-- trpt_004 (tr_acknowledged)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_004_a', 'trpt_004', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'Spot block power sale executed (R18.4m) — report due', '2026-05-24 17:00:00'),
('trptv_004_b', 'trpt_004', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-24 18:10:00'),
('trptv_004_c', 'trpt_004', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository', '2026-05-24 20:05:00'),
('trptv_004_d', 'trpt_004', 'trade_report.tr_acknowledged', 'submitted_to_tr', 'tr_acknowledged', 'jse_tr', 'trade_repository', 'ACK received (ACK-2026-0004); reconciliation window open (spot 72h)', '2026-05-24 22:40:00');

-- trpt_005 (reconciled)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_005_a', 'trpt_005', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'Gas physical-delivery forward executed (R64.8m) — report due', '2026-05-22 17:00:00'),
('trptv_005_b', 'trpt_005', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-22 18:00:00'),
('trptv_005_c', 'trpt_005', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository', '2026-05-22 19:45:00'),
('trptv_005_d', 'trpt_005', 'trade_report.tr_acknowledged', 'submitted_to_tr', 'tr_acknowledged', 'jse_tr', 'trade_repository', 'ACK received', '2026-05-22 22:10:00'),
('trptv_005_e', 'trpt_005', 'trade_report.reconciled', 'tr_acknowledged', 'reconciled', 'reporting_ops', 'reporting_ops', 'RECONCILED — dual-sided match against Sasol on all key fields; awaiting confirm', '2026-05-24 09:30:00');

-- trpt_006 (break_resolved — traverses break_identified; crossed FSCA at break)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_006_a', 'trpt_006', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'OTC carbon swap executed (R97.2m) — report due', '2026-05-19 17:00:00'),
('trptv_006_b', 'trpt_006', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-19 18:20:00'),
('trptv_006_c', 'trpt_006', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository', '2026-05-19 20:00:00'),
('trptv_006_d', 'trpt_006', 'trade_report.tr_acknowledged', 'submitted_to_tr', 'tr_acknowledged', 'jse_tr', 'trade_repository', 'ACK received', '2026-05-19 23:15:00'),
('trptv_006_e', 'trpt_006', 'trade_report.break_identified', 'tr_acknowledged', 'break_identified', 'jse_tr', 'trade_repository', 'BREAK — price + value-date mismatch vs Trafigura (R270 vs R262.50/t); crosses to FSCA (OTC systemic-risk product)', '2026-05-20 08:40:00'),
('trptv_006_f', 'trpt_006', 'trade_report.break_resolved', 'break_identified', 'break_resolved', 'reporting_ops', 'reporting_ops', 'BREAK RESOLVED — desk price confirmed correct; counterparty re-submitted amended report; re-reconciliation pending', '2026-05-20 15:10:00');

-- trpt_007 (corrected — traverses tr_rejected; crossed FSCA at reject)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_007_a', 'trpt_007', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'OTC power forward executed (R76.0m) — report due', '2026-05-18 17:00:00'),
('trptv_007_b', 'trpt_007', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-18 18:05:00'),
('trptv_007_c', 'trpt_007', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository', '2026-05-18 19:30:00'),
('trptv_007_d', 'trpt_007', 'trade_report.tr_rejected', 'submitted_to_tr', 'tr_rejected', 'jse_tr', 'trade_repository', 'NACK SCHEMA-014 — invalid LEI checksum + UTI namespace; crosses to FSCA (OTC material class)', '2026-05-18 21:50:00'),
('trptv_007_e', 'trpt_007', 'trade_report.corrected', 'tr_rejected', 'corrected', 'reporting_ops', 'reporting_ops', 'CORRECTED — LEI re-sourced from GLEIF + UTI re-minted; staged for re-submission (12h window)', '2026-05-19 06:15:00');

-- trpt_008 (exempted)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_008_a', 'trpt_008', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'Intragroup spot REC purchase (R2.6m) — reportability under review', '2026-05-16 17:00:00'),
('trptv_008_b', 'trpt_008', 'trade_report.exempted', 'report_due', 'exempted', 'desk_oe', 'desk', 'EXEMPTED — intragroup + de-minimis; no FMA reporting obligation; no TR submission required', '2026-05-16 17:45:00');

-- trpt_009 (confirmed_complete — full happy arc flagship; crosses FSCA at completion)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_009_a', 'trpt_009', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'OTC power swap executed (R154.0m) — largest reportable derivative this cycle; report due', '2026-05-12 17:00:00'),
('trptv_009_b', 'trpt_009', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-12 17:35:00'),
('trptv_009_c', 'trpt_009', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository intraday (T+0)', '2026-05-12 18:50:00'),
('trptv_009_d', 'trpt_009', 'trade_report.tr_acknowledged', 'submitted_to_tr', 'tr_acknowledged', 'jse_tr', 'trade_repository', 'ACK received within the hour', '2026-05-12 19:40:00'),
('trptv_009_e', 'trpt_009', 'trade_report.reconciled', 'tr_acknowledged', 'reconciled', 'reporting_ops', 'reporting_ops', 'RECONCILED — dual-sided match against Mercuria; no break', '2026-05-13 08:20:00'),
('trptv_009_f', 'trpt_009', 'trade_report.confirmed_complete', 'reconciled', 'confirmed_complete', 'reporting_ops', 'reporting_ops', 'CONFIRMED COMPLETE — reporting obligation discharged + audit-sealed; surfaced to FSCA register', '2026-05-13 14:00:00');

-- trpt_010 (cancelled — trade busted)
INSERT OR IGNORE INTO oe_trade_reports_events (id, report_id, event_type, from_status, to_status, actor_id, actor_party, notes, created_at) VALUES
('trptv_010_a', 'trpt_010', 'trade_report.report_due', null, 'report_due', 'desk_oe', 'desk', 'Physical power forward executed (R53.2m) — report due', '2026-05-14 17:00:00'),
('trptv_010_b', 'trpt_010', 'trade_report.report_generated', 'report_due', 'report_generated', 'reporting_ops', 'reporting_ops', 'Report generated', '2026-05-14 17:50:00'),
('trptv_010_c', 'trpt_010', 'trade_report.submitted_to_tr', 'report_generated', 'submitted_to_tr', 'reporting_ops', 'reporting_ops', 'Submitted to the JSE Trade Repository', '2026-05-14 19:10:00'),
('trptv_010_d', 'trpt_010', 'trade_report.cancelled', 'submitted_to_tr', 'cancelled', 'desk_oe', 'desk', 'CANCELLED — trade busted under exchange error-trade policy (mis-keyed volume); cancellation message sent to TR to void prior submission', '2026-05-14 22:30:00');
