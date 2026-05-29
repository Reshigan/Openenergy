-- Wave 76 — Trade Allocation, Give-Up & Confirmation/Affirmation seed.
-- 10 allocations alloc_001..alloc_010 spanning 10 distinct lifecycle states, all five
-- notional tiers and a mix of instruments. Five reportable cases prove the W76
-- signature and tiering:
--   - alloc_004 (give_up_pending) + alloc_007 (affirmed) on the LARGE tier and
--     alloc_008 (settled) on the BLOCK tier (isReportable true for large + block),
--   - alloc_009 a SMALL-tier break_review (flag_break crosses for EVERY tier — the
--     break-driven signature, proven here on a non-large tier),
--   - alloc_010 a BLOCK-tier cancelled trade (cancel_trade crosses large + block).
-- No apostrophes anywhere (D1 SQLite). notional_zar drives notional_tier.

INSERT OR IGNORE INTO oe_trade_allocations (
  id, allocation_number,
  source_event, source_entity_type, source_entity_id, source_wave, trade_ref, order_ref,
  executing_party, clearing_party, counterparty_name, block_account,
  instrument, energy_type, side, quantity, price, notional_zar, allocation_legs, notional_tier,
  settlement_date, ssi_ref, csd_ref, break_reason_code,
  allocation_ref, give_up_ref, confirmation_ref, affirmation_ref, match_ref, settlement_instruction_ref, break_ref, cancel_ref,
  allocation_basis, give_up_basis, confirmation_basis, affirmation_basis, match_basis, settlement_basis, break_basis, resolution_basis, cancel_basis, reason_code,
  chain_status, executed_at, allocation_pending_at, allocated_at, give_up_pending_at, give_up_accepted_at, confirmation_issued_at, affirmed_at, matched_at, settlement_instructed_at, settled_at, break_review_at, cancelled_at,
  sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level, created_by
) VALUES
-- alloc_001 micro power forward — executed, awaiting allocation
('alloc_001','ALLOC-2026-0001',
 NULL,NULL,NULL,NULL,'TRD-2026-5001','ORD-2026-5001',
 'Nedbank CIB Energy Desk',NULL,'Coronation Balanced Fund',NULL,
 'power_forward','power','buy',5000,120,600000,3,'micro',
 NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'executed','2026-05-28 09:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-31 09:00:00',NULL,0,0,'demo_trader_001'),

-- alloc_002 small power forward — allocation instruction prepared, awaiting block split
('alloc_002','ALLOC-2026-0002',
 NULL,NULL,NULL,NULL,'TRD-2026-5002','ORD-2026-5002',
 'Standard Bank Global Markets',NULL,'Allan Gray Equity Fund','BLK-2026-5002',
 'power_forward','power','sell',20000,250,5000000,5,'small',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0002-ALC',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Allocation instruction prepared splitting the block across five sub-accounts on the standing scheme.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'allocation_pending','2026-05-27 09:00:00','2026-05-27 11:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-28 11:00:00',NULL,0,0,'demo_trader_001'),

-- alloc_003 medium REC forward — block allocated across sub-accounts
('alloc_003','ALLOC-2026-0003',
 NULL,NULL,NULL,NULL,'TRD-2026-5003','ORD-2026-5003',
 'ABSA CIB Markets',NULL,'Old Mutual Multi-Managers',NULL,
 'rec_forward','rec','buy',60000,500,30000000,8,'medium',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0003-ALC',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Block allocated across eight client sub-accounts pro-rata to standing mandates.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'allocated','2026-05-27 08:00:00','2026-05-27 09:00:00','2026-05-27 10:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-27 18:00:00',NULL,0,0,'demo_trader_001'),

-- alloc_004 large power forward — give-up designated, awaiting clearing-broker acceptance (REPORTABLE: large tier)
('alloc_004','ALLOC-2026-0004',
 NULL,NULL,NULL,NULL,'TRD-2026-5004','ORD-2026-5004',
 'JP Morgan SA Markets','RMB Clearing','Investec Asset Management',NULL,
 'power_forward','power','buy',400000,300,120000000,12,'large',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0004-ALC','ALLOC-2026-0004-GUP',NULL,NULL,NULL,NULL,NULL,NULL,
 'Block allocated across twelve institutional sub-accounts.','Trade designated for give-up to the nominated clearing broker; awaiting acceptance.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'give_up_pending','2026-05-28 07:00:00','2026-05-28 07:30:00','2026-05-28 08:00:00','2026-05-28 08:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-28 11:30:00',NULL,1,0,'demo_trader_001'),

-- alloc_005 medium carbon forward — give-up accepted by the clearing broker
('alloc_005','ALLOC-2026-0005',
 NULL,NULL,NULL,NULL,'TRD-2026-5005','ORD-2026-5005',
 'Citi SA Markets','Standard Bank Clearing','Sanlam Investment Management',NULL,
 'carbon_forward','carbon','sell',80000,500,40000000,6,'medium',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0005-ALC','ALLOC-2026-0005-GUP',NULL,NULL,NULL,NULL,NULL,NULL,
 'Block allocated across six sub-accounts.','Give-up accepted by the clearing broker; trade booked to the clearing account.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'give_up_accepted','2026-05-27 07:00:00','2026-05-27 07:30:00','2026-05-27 08:00:00','2026-05-27 08:30:00','2026-05-27 09:30:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-27 15:30:00',NULL,0,0,'demo_trader_001'),

-- alloc_006 small REC forward — self-cleared, confirmation issued (no give-up leg)
('alloc_006','ALLOC-2026-0006',
 NULL,NULL,NULL,NULL,'TRD-2026-5006','ORD-2026-5006',
 'Nedbank CIB Energy Desk',NULL,'Prescient Income Provider Fund',NULL,
 'rec_forward','rec','buy',16000,500,8000000,4,'small',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0006-ALC',NULL,'ALLOC-2026-0006-CNF',NULL,NULL,NULL,NULL,NULL,
 'Block allocated across four sub-accounts; self-cleared so no give-up leg.',NULL,'Confirmation issued to the counterparty detailing economics and settlement instructions.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'confirmation_issued','2026-05-27 06:00:00','2026-05-27 06:30:00','2026-05-27 07:00:00',NULL,NULL,'2026-05-27 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,
 '2026-05-27 16:00:00',NULL,0,0,'demo_trader_001'),

-- alloc_007 large power forward — counterparty affirmed same day (REPORTABLE: large tier)
('alloc_007','ALLOC-2026-0007',
 NULL,NULL,NULL,NULL,'TRD-2026-5007','ORD-2026-5007',
 'Goldman Sachs SA','RMB Clearing','Coronation Global Fund',NULL,
 'power_forward','power','sell',500000,400,200000000,15,'large',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0007-ALC','ALLOC-2026-0007-GUP','ALLOC-2026-0007-CNF','ALLOC-2026-0007-AFF',NULL,NULL,NULL,NULL,
 'Block allocated across fifteen institutional sub-accounts.','Give-up accepted by the clearing broker.','Confirmation issued covering all legs.','Counterparty affirmed the confirmation same day under the affirmation discipline.',NULL,NULL,NULL,NULL,NULL,NULL,
 'affirmed','2026-05-28 06:00:00','2026-05-28 06:15:00','2026-05-28 06:30:00','2026-05-28 06:45:00','2026-05-28 07:00:00','2026-05-28 07:15:00','2026-05-28 07:30:00',NULL,NULL,NULL,NULL,NULL,
 '2026-05-28 09:00:00',NULL,1,0,'demo_trader_001'),

-- alloc_008 block power forward — full happy path settled at the CSD (REPORTABLE: block tier)
('alloc_008','ALLOC-2026-0008',
 NULL,NULL,NULL,NULL,'TRD-2026-5008','ORD-2026-5008',
 'Standard Bank Global Markets','Standard Bank Clearing','Public Investment Corporation',NULL,
 'power_forward','power','buy',1500000,400,600000000,20,'block',
 '2026-05-22','SSI-PIC-0001','CSD-2026-0008',NULL,
 'ALLOC-2026-0008-ALC','ALLOC-2026-0008-GUP','ALLOC-2026-0008-CNF','ALLOC-2026-0008-AFF','ALLOC-2026-0008-MCH','ALLOC-2026-0008-STL',NULL,NULL,
 'Block allocated across twenty sub-accounts.','Give-up accepted by the clearing broker.','Confirmation issued.','Counterparty affirmed.','Both sides matched on the central matching utility.','Settlement instructed against the standing settlement instruction and settled at the CSD on value date.',NULL,NULL,NULL,NULL,
 'settled','2026-05-20 06:00:00','2026-05-20 06:15:00','2026-05-20 06:30:00','2026-05-20 06:45:00','2026-05-20 07:00:00','2026-05-20 07:15:00','2026-05-20 07:30:00','2026-05-20 08:00:00','2026-05-20 09:00:00','2026-05-22 10:00:00',NULL,NULL,
 NULL,NULL,1,0,'demo_trader_001'),

-- alloc_009 small REC forward — break under review on a confirmation mismatch (REPORTABLE: flag_break crosses EVERY tier)
('alloc_009','ALLOC-2026-0009',
 NULL,NULL,NULL,NULL,'TRD-2026-5009','ORD-2026-5009',
 'ABSA CIB Markets',NULL,'Ninety One Diversified Fund',NULL,
 'rec_forward','rec','buy',14000,500,7000000,3,'small',
 NULL,NULL,NULL,'economic_mismatch',
 'ALLOC-2026-0009-ALC',NULL,'ALLOC-2026-0009-CNF',NULL,NULL,NULL,'ALLOC-2026-0009-BRK',NULL,
 'Block allocated across three sub-accounts.',NULL,'Confirmation issued to the counterparty.',NULL,NULL,NULL,'Economic mismatch detected between the issued confirmation and the counterparty records; trade moved to break review and reported under settlement discipline.',NULL,NULL,'economic_mismatch',
 'break_review','2026-05-28 08:00:00','2026-05-28 08:15:00','2026-05-28 08:30:00',NULL,NULL,'2026-05-28 09:00:00',NULL,NULL,NULL,NULL,'2026-05-28 10:00:00',NULL,
 '2026-05-28 18:00:00',NULL,1,1,'demo_trader_001'),

-- alloc_010 block power forward — cancelled before confirmation on a revoked mandate (REPORTABLE: cancel crosses large + block)
('alloc_010','ALLOC-2026-0010',
 NULL,NULL,NULL,NULL,'TRD-2026-5010','ORD-2026-5010',
 'JP Morgan SA Markets',NULL,'Government Employees Pension Fund',NULL,
 'power_forward','power','sell',800000,400,320000000,18,'block',
 NULL,NULL,NULL,NULL,
 'ALLOC-2026-0010-ALC',NULL,NULL,NULL,NULL,NULL,NULL,'ALLOC-2026-0010-CXL',
 'Block allocated across eighteen sub-accounts.',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Client revoked the trading mandate before confirmation; large block trade cancelled and reported.','mandate_revoked',
 'cancelled','2026-05-26 07:00:00','2026-05-26 07:30:00','2026-05-26 08:00:00',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-05-26 12:00:00',
 NULL,NULL,1,0,'demo_trader_001');
