-- Wave 68 seed — 10 counterparty-margin / default-management cases spanning 10 of
-- the 12 lifecycle states and all 5 severity tiers. Exactly 4 are reportable: the
-- four post-default states (default_declared, close_out, default_fund_draw,
-- written_off) — every one passed through declare_default, which crosses to the
-- FSCA / Prudential Authority for EVERY tier (the W68 signature).
--
-- Case 5 demonstrates the SIFI floor: a moderate R40m exposure floored to 'major'
-- because the counterparty is systemically important.
--
-- INSERT OR IGNORE keeps this replay-safe; explicit column lists guard against
-- column drift. Timestamps are illustrative ISO-8601 (UTC).

INSERT OR IGNORE INTO oe_counterparty_margin (
  id, case_number,
  counterparty_id, counterparty_name, member_code, account_type, systemically_important,
  product_class, exposure_zar, collateral_held_zar, margin_call_zar, collateral_posted_zar,
  shortfall_zar, default_fund_draw_zar, recovery_zar, write_off_zar, utilisation_pct, severity_tier,
  clearing_party_id, clearing_party_name, member_party_id, member_party_name,
  warning_ref, margin_call_ref, collateral_ref, restriction_ref, cure_ref, default_ref, close_out_ref, default_fund_ref,
  warning_basis, margin_call_basis, collateral_basis, restriction_basis, cure_basis, default_basis,
  close_out_basis, default_fund_basis, recovery_basis, write_off_basis, reason_code, resolution_summary,
  chain_status,
  limit_active_at, exposure_warning_at, margin_call_issued_at, collateral_received_at, position_restriction_at,
  cure_period_at, default_declared_at, close_out_at, default_fund_draw_at, recovered_at, written_off_at, withdrawn_at,
  cure_round, sla_deadline_at, last_sla_breach_at, is_reportable, escalation_level,
  created_by, created_at, updated_at
) VALUES
-- 1. limit_active / minor — healthy member, exposure within limit
('ccm_001','CCM-2026-0001',
 'cp_helios_cap','Helios Capital Trading','MBR-HEL','house',0,
 'power_forward',3200000,4000000,NULL,NULL,NULL,NULL,NULL,NULL,62.0,'minor',
 'party_clearco','OE Clearing House','party_helios','Helios Capital Pty',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Exposure within limit under continuous mark to market',
 'limit_active',
 '2026-05-01T06:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-07-30T06:00:00Z',NULL,0,0,
 'trader','2026-05-01T06:00:00Z','2026-05-01T06:00:00Z'),

-- 2. exposure_warning / moderate — utilisation breached the warning threshold
('ccm_002','CCM-2026-0002',
 'cp_zenith_pwr','Zenith Power Markets','MBR-ZEN','client',0,
 'power_spot',28000000,30000000,NULL,NULL,NULL,NULL,NULL,NULL,88.0,'moderate',
 'party_clearco','OE Clearing House','party_zenith','Zenith Markets Pty',
 'MW-2026-0002',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 'Intraday utilisation reached 88 pct of the posted credit limit',NULL,NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,'Exposure warning issued pending member action',
 'exposure_warning',
 '2026-04-12T06:00:00Z','2026-05-23T09:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-26T09:00:00Z',NULL,0,0,
 'trader','2026-05-23T09:00:00Z','2026-05-23T09:00:00Z'),

-- 3. margin_call_issued / material — variation margin called after a price move
('ccm_003','CCM-2026-0003',
 'cp_silvermark','Silvermark Energy Desk','MBR-SLV','house',0,
 'financial_derivative',145000000,120000000,32000000,NULL,NULL,NULL,NULL,NULL,94.0,'material',
 'party_clearco','OE Clearing House','party_silvermark','Silvermark Pty',
 'MW-2026-0003','MC-2026-0003',NULL,NULL,NULL,NULL,NULL,NULL,
 'Utilisation breached threshold after adverse mark to market',
 'Variation margin call of R32m issued for the collateral shortfall',NULL,NULL,NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,'Margin call issued awaiting collateral',
 'margin_call_issued',
 '2026-03-20T06:00:00Z','2026-05-18T08:00:00Z','2026-05-24T11:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-25T11:00:00Z',NULL,0,0,
 'trader','2026-05-24T11:00:00Z','2026-05-24T11:00:00Z'),

-- 4. collateral_received / minor — member posted, exposure being cured
('ccm_004','CCM-2026-0004',
 'cp_northwind','Northwind Trading','MBR-NWD','client',0,
 'power_forward',4100000,3500000,1200000,1300000,NULL,NULL,NULL,NULL,90.0,'minor',
 'party_clearco','OE Clearing House','party_northwind','Northwind Pty',
 'MW-2026-0004','MC-2026-0004','COL-2026-0004',NULL,NULL,NULL,NULL,NULL,
 'Exposure approached limit on a small book',
 'Margin call of R1.2m issued',
 'Member posted R1.3m cash collateral against the call','member',NULL,NULL,
 NULL,NULL,NULL,NULL,NULL,'Collateral received pending breach cure confirmation',
 'collateral_received',
 '2026-04-01T06:00:00Z','2026-05-15T08:00:00Z','2026-05-20T10:00:00Z','2026-05-25T14:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-27T14:00:00Z',NULL,0,0,
 'trader','2026-05-25T14:00:00Z','2026-05-25T14:00:00Z'),

-- 5. position_restriction / major (SIFI floor: moderate R40m exposure floored to major)
('ccm_005','CCM-2026-0005',
 'cp_apex_clear','Apex Clearing Member','MBR-APX','omnibus',1,
 'mixed',40000000,35000000,9000000,NULL,NULL,NULL,NULL,NULL,96.0,'major',
 'party_clearco','OE Clearing House','party_apex','Apex Clearing Pty',
 'MW-2026-0005','MC-2026-0005',NULL,'RST-2026-0005',NULL,NULL,NULL,NULL,
 'Repeated threshold breaches on a systemically important member',
 'Margin call of R9m issued and unmet within window',NULL,
 'Position-increasing orders restricted pending collateral as a systemically important member',NULL,NULL,
 NULL,NULL,NULL,NULL,'sifi_unmet_call','Positions restricted on a systemically important member pending cure',
 'position_restriction',
 '2026-03-10T06:00:00Z','2026-05-10T08:00:00Z','2026-05-19T10:00:00Z',NULL,'2026-05-24T12:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-28T12:00:00Z',NULL,0,1,
 'trader','2026-05-24T12:00:00Z','2026-05-24T12:00:00Z'),

-- 6. cure_period / systemic — final grace window on a R1.4bn exposure
('ccm_006','CCM-2026-0006',
 'cp_titan_global','Titan Global Energy','MBR-TTN','house',1,
 'financial_derivative',1400000000,900000000,500000000,NULL,500000000,NULL,NULL,NULL,99.0,'systemic',
 'party_clearco','OE Clearing House','party_titan','Titan Global Pty',
 'MW-2026-0006','MC-2026-0006',NULL,NULL,'CUR-2026-0006',NULL,NULL,NULL,
 'Large adverse move drove utilisation to 99 pct on a systemic counterparty',
 'Variation margin call of R500m issued',NULL,NULL,
 'Final cure period opened ahead of a potential default declaration',NULL,
 NULL,NULL,NULL,NULL,'systemic_shortfall','Final cure period running on a systemic shortfall',
 'cure_period',
 '2026-02-15T06:00:00Z','2026-05-22T06:00:00Z','2026-05-24T18:00:00Z',NULL,NULL,'2026-05-26T06:00:00Z',NULL,NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-26T07:00:00Z',NULL,0,1,
 'trader','2026-05-26T06:00:00Z','2026-05-26T06:00:00Z'),

-- 7. default_declared / material — member failed to cure [REPORTABLE: declare_default crosses every tier]
('ccm_007','CCM-2026-0007',
 'cp_meridian','Meridian Power Trading','MBR-MRD','client',0,
 'power_forward',210000000,150000000,60000000,NULL,60000000,NULL,NULL,NULL,98.0,'material',
 'party_clearco','OE Clearing House','party_meridian','Meridian Power Pty',
 'MW-2026-0007','MC-2026-0007',NULL,NULL,'CUR-2026-0007','DEF-2026-0007',NULL,NULL,
 'Material shortfall after adverse mark to market',
 'Margin call of R60m issued and unmet',NULL,NULL,
 'Cure period elapsed without collateral',
 'Participant default declared after the cure period elapsed without collateral',
 NULL,NULL,NULL,NULL,'cure_elapsed','Default declared notified to the FSCA',
 'default_declared',
 '2026-02-01T06:00:00Z','2026-05-08T06:00:00Z','2026-05-14T10:00:00Z',NULL,NULL,'2026-05-22T08:00:00Z','2026-05-26T09:00:00Z',NULL,NULL,NULL,NULL,NULL,
 0,'2026-05-27T09:00:00Z',NULL,1,2,
 'trader','2026-05-26T09:00:00Z','2026-05-26T09:00:00Z'),

-- 8. close_out / major — defaulted member positions being closed out and netted [REPORTABLE]
('ccm_008','CCM-2026-0008',
 'cp_blackridge','Blackridge Commodities','MBR-BLK','house',0,
 'mixed',620000000,440000000,200000000,NULL,180000000,NULL,NULL,NULL,99.0,'major',
 'party_clearco','OE Clearing House','party_blackridge','Blackridge Pty',
 'MW-2026-0008','MC-2026-0008',NULL,'RST-2026-0008',NULL,'DEF-2026-0008','CLO-2026-0008',NULL,
 'Major exposure with a sustained collateral shortfall',
 'Margin call of R200m issued and unmet',NULL,
 'Positions restricted ahead of the default',NULL,
 'Default declared after the restricted member failed to post',
 'Close-out and netting of the defaulted member positions in progress with a R180m residual shortfall',
 NULL,NULL,NULL,'unmet_call','Close-out under way on the defaulted member book',
 'close_out',
 '2026-01-20T06:00:00Z','2026-04-30T06:00:00Z','2026-05-08T10:00:00Z',NULL,'2026-05-16T12:00:00Z',NULL,'2026-05-22T09:00:00Z','2026-05-25T10:00:00Z',NULL,NULL,NULL,NULL,
 0,'2026-05-28T10:00:00Z',NULL,1,2,
 'trader','2026-05-25T10:00:00Z','2026-05-25T10:00:00Z'),

-- 9. default_fund_draw / systemic — collateral insufficient, mutualised fund drawn [REPORTABLE]
('ccm_009','CCM-2026-0009',
 'cp_polaris','Polaris Clearing Member','MBR-PLR','omnibus',1,
 'financial_derivative',2300000000,1500000000,800000000,NULL,800000000,400000000,NULL,NULL,99.0,'systemic',
 'party_clearco','OE Clearing House','party_polaris','Polaris Clearing Pty',
 'MW-2026-0009','MC-2026-0009',NULL,NULL,'CUR-2026-0009','DEF-2026-0009','CLO-2026-0009','DFD-2026-0009',
 'Systemic counterparty with an R800m residual shortfall after close-out',
 'Variation margin call of R800m issued and unmet',NULL,NULL,
 'Final cure period elapsed without collateral',
 'Default declared on a systemically important counterparty',
 'Close-out completed leaving an R800m residual loss',
 'R400m drawn from the mutualised default fund to cover the residual after pledged collateral',
 NULL,NULL,'systemic_default','Default fund drawn to cover the systemic residual',
 'default_fund_draw',
 '2026-01-10T06:00:00Z','2026-04-20T06:00:00Z','2026-04-28T10:00:00Z',NULL,NULL,'2026-05-08T08:00:00Z','2026-05-12T09:00:00Z','2026-05-18T10:00:00Z','2026-05-24T11:00:00Z',NULL,NULL,NULL,
 0,'2026-05-27T11:00:00Z',NULL,1,2,
 'trader','2026-05-24T11:00:00Z','2026-05-24T11:00:00Z'),

-- 10. written_off / major — residual loss written off after close-out [REPORTABLE]
('ccm_010','CCM-2026-0010',
 'cp_falconcrest','Falconcrest Energy','MBR-FLC','client',0,
 'repo',750000000,560000000,250000000,NULL,95000000,NULL,NULL,95000000,99.0,'major',
 'party_clearco','OE Clearing House','party_falconcrest','Falconcrest Pty',
 'MW-2026-0010','MC-2026-0010',NULL,'RST-2026-0010',NULL,'DEF-2026-0010','CLO-2026-0010',NULL,
 'Major exposure that defaulted after an unmet call',
 'Margin call of R250m issued and unmet',NULL,
 'Positions restricted before the default',NULL,
 'Default declared after the restricted member failed to post',
 'Close-out completed leaving an R95m residual loss after collateral liquidation',
 NULL,NULL,'Residual R95m written off against clearing-house reserves as irrecoverable','default_loss','Residual loss written off after close-out',
 'written_off',
 '2026-01-05T06:00:00Z','2026-04-15T06:00:00Z','2026-04-22T10:00:00Z',NULL,'2026-04-30T12:00:00Z',NULL,'2026-05-06T09:00:00Z','2026-05-12T10:00:00Z',NULL,NULL,'2026-05-20T15:00:00Z',NULL,
 0,NULL,NULL,1,2,
 'trader','2026-05-20T15:00:00Z','2026-05-20T15:00:00Z');

INSERT OR IGNORE INTO oe_counterparty_margin_events (
  id, margin_id, event_type, from_status, to_status, actor_id, actor_party, notes, payload, created_at
) VALUES
('ccm_evt_001','ccm_002','counterparty_margin.exposure_warning','limit_active','exposure_warning','party_clearco','clearing_house','Utilisation reached 88 pct of limit',NULL,'2026-05-23T09:00:00Z'),
('ccm_evt_002','ccm_003','counterparty_margin.margin_call_issued','exposure_warning','margin_call_issued','party_clearco','clearing_house','Variation margin call of R32m issued',NULL,'2026-05-24T11:00:00Z'),
('ccm_evt_003','ccm_004','counterparty_margin.collateral_received','margin_call_issued','collateral_received','party_northwind','member','Member posted R1.3m cash collateral',NULL,'2026-05-25T14:00:00Z'),
('ccm_evt_004','ccm_005','counterparty_margin.position_restriction','margin_call_issued','position_restriction','party_clearco','clearing_house','Positions restricted on a systemically important member',NULL,'2026-05-24T12:00:00Z'),
('ccm_evt_005','ccm_006','counterparty_margin.cure_period','margin_call_issued','cure_period','party_clearco','clearing_house','Final cure period opened on a systemic shortfall',NULL,'2026-05-26T06:00:00Z'),
('ccm_evt_006','ccm_007','counterparty_margin.default_declared','cure_period','default_declared','party_clearco','clearing_house','Participant default declared after cure elapsed',NULL,'2026-05-26T09:00:00Z'),
('ccm_evt_007','ccm_008','counterparty_margin.close_out','default_declared','close_out','party_clearco','clearing_house','Close-out and netting of defaulted positions begun',NULL,'2026-05-25T10:00:00Z'),
('ccm_evt_008','ccm_009','counterparty_margin.default_fund_draw','close_out','default_fund_draw','party_clearco','clearing_house','R400m drawn from the mutualised default fund',NULL,'2026-05-24T11:00:00Z'),
('ccm_evt_009','ccm_010','counterparty_margin.close_out','default_declared','close_out','party_clearco','clearing_house','Close-out of the defaulted member book begun',NULL,'2026-05-12T10:00:00Z'),
('ccm_evt_010','ccm_010','counterparty_margin.written_off','close_out','written_off','party_clearco','clearing_house','Residual R95m written off as irrecoverable',NULL,'2026-05-20T15:00:00Z');
