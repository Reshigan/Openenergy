import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, tierForStockoutImpactZar,
  isHighTier, isVital, vitalFloor, provisioningTier,
  isReportable, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  reorderPoint, safetyStock, fillRate, predictiveLeadDays,
  stockoutAvoidanceZar, workingCapitalEfficiency,
  partyForAction,
  type ProvisioningStatus, type ProvisioningTier, type ProvisioningAction,
  type Criticality,
} from '../src/utils/spare-parts-provisioning-spec';

describe('W72 spare-parts-provisioning chain — state machine', () => {
  it('happy path: demand_identified→requisition_raised→requisition_approved→po_issued→in_transit→received→stocked→reserved→issued', () => {
    let s: ProvisioningStatus = 'demand_identified';
    s = nextStatus(s, 'raise_requisition')!;   expect(s).toBe('requisition_raised');
    s = nextStatus(s, 'approve_requisition')!; expect(s).toBe('requisition_approved');
    s = nextStatus(s, 'issue_po')!;            expect(s).toBe('po_issued');
    s = nextStatus(s, 'confirm_shipment')!;    expect(s).toBe('in_transit');
    s = nextStatus(s, 'receive_goods')!;       expect(s).toBe('received');
    s = nextStatus(s, 'pass_inspection')!;     expect(s).toBe('stocked');
    s = nextStatus(s, 'reserve_stock')!;       expect(s).toBe('reserved');
    s = nextStatus(s, 'issue_part')!;          expect(s).toBe('issued');
    expect(isTerminal('issued')).toBe(true);
  });

  it('backorder loop: po_issued → backordered → in_transit (expedite)', () => {
    expect(nextStatus('po_issued', 'flag_backorder')).toBe('backordered');
    expect(nextStatus('backordered', 'expedite_backorder')).toBe('in_transit');
    expect(isTerminal('backordered')).toBe(false);
  });

  it('incoming-QA gate: received → stocked (pass) OR received → returned (reject)', () => {
    expect(nextStatus('received', 'pass_inspection')).toBe('stocked');
    expect(nextStatus('received', 'reject_inspection')).toBe('returned');
    expect(isTerminal('returned')).toBe(true);
    // reject_inspection only from received
    expect(nextStatus('stocked', 'reject_inspection')).toBeNull();
    expect(nextStatus('in_transit', 'reject_inspection')).toBeNull();
  });

  it('cancel reachable from every pre-receipt planning/ordering state, NOT after receipt', () => {
    const froms: ProvisioningStatus[] = [
      'demand_identified', 'requisition_raised', 'requisition_approved',
      'po_issued', 'backordered',
    ];
    for (const f of froms) {
      expect(nextStatus(f, 'cancel_provisioning')).toBe('cancelled');
    }
    expect(isTerminal('cancelled')).toBe(true);
    // not available once goods are in transit / received / stocked / terminal
    expect(nextStatus('in_transit', 'cancel_provisioning')).toBeNull();
    expect(nextStatus('received', 'cancel_provisioning')).toBeNull();
    expect(nextStatus('stocked', 'cancel_provisioning')).toBeNull();
    expect(nextStatus('reserved', 'cancel_provisioning')).toBeNull();
    expect(nextStatus('issued', 'cancel_provisioning')).toBeNull();
  });

  it('confirm_shipment and expedite_backorder both land on in_transit', () => {
    expect(nextStatus('po_issued', 'confirm_shipment')).toBe('in_transit');
    expect(nextStatus('backordered', 'expedite_backorder')).toBe('in_transit');
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('issued')).toEqual([]);
    expect(allowedActions('returned')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('demand_identified', 'issue_po')).toBeNull();
    expect(nextStatus('requisition_raised', 'confirm_shipment')).toBeNull();
    expect(nextStatus('po_issued', 'receive_goods')).toBeNull();
    expect(nextStatus('in_transit', 'pass_inspection')).toBeNull();
    expect(nextStatus('stocked', 'issue_part')).toBeNull();
    expect(nextStatus('reserved', 'reserve_stock')).toBeNull();
    expect(nextStatus('issued', 'flag_backorder')).toBeNull();
  });

  it('TRANSITIONS dict covers every state', () => {
    const states: ProvisioningStatus[] = [
      'demand_identified', 'requisition_raised', 'requisition_approved', 'po_issued',
      'backordered', 'in_transit', 'received', 'stocked', 'reserved', 'issued',
      'returned', 'cancelled',
    ];
    for (const s of states) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('po_issued fans out to confirm_shipment / flag_backorder / cancel', () => {
    const actions = allowedActions('po_issued');
    expect(actions).toContain('confirm_shipment');
    expect(actions).toContain('flag_backorder');
    expect(actions).toContain('cancel_provisioning');
    expect(actions).toHaveLength(3);
  });

  it('received fans out to pass_inspection / reject_inspection', () => {
    const actions = allowedActions('received');
    expect(actions).toContain('pass_inspection');
    expect(actions).toContain('reject_inspection');
    expect(actions).toHaveLength(2);
  });
});

describe('W72 spare-parts-provisioning chain — stockout-impact tiering', () => {
  it('maps stockout-impact ZAR to tiers at the boundaries', () => {
    expect(tierForStockoutImpactZar(0)).toBe('routine');
    expect(tierForStockoutImpactZar(49_999)).toBe('routine');
    expect(tierForStockoutImpactZar(50_000)).toBe('standard');
    expect(tierForStockoutImpactZar(249_999)).toBe('standard');
    expect(tierForStockoutImpactZar(250_000)).toBe('important');
    expect(tierForStockoutImpactZar(999_999)).toBe('important');
    expect(tierForStockoutImpactZar(1_000_000)).toBe('critical');
    expect(tierForStockoutImpactZar(4_999_999)).toBe('critical');
    expect(tierForStockoutImpactZar(5_000_000)).toBe('catastrophic');
    expect(tierForStockoutImpactZar(20_000_000)).toBe('catastrophic');
  });

  it('isHighTier — critical + catastrophic only', () => {
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('catastrophic')).toBe(true);
    expect(isHighTier('important')).toBe(false);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('routine')).toBe(false);
  });

  it('isVital — vital only', () => {
    expect(isVital('vital')).toBe(true);
    expect(isVital('essential')).toBe(false);
    expect(isVital('desirable')).toBe(false);
  });

  it('vitalFloor — vital floors at critical, others null', () => {
    expect(vitalFloor('vital')).toBe('critical');
    expect(vitalFloor('essential')).toBeNull();
    expect(vitalFloor('desirable')).toBeNull();
  });

  it('provisioningTier — vital part can never sit below critical; otherwise rand tier', () => {
    // low rand impact but vital → floored to critical
    expect(provisioningTier(10_000, 'vital')).toBe('critical');
    expect(provisioningTier(300_000, 'vital')).toBe('critical');
    // catastrophic rand impact overrides the vital floor (max-rank wins)
    expect(provisioningTier(6_000_000, 'vital')).toBe('catastrophic');
    // non-vital → straight rand tier
    expect(provisioningTier(10_000, 'essential')).toBe('routine');
    expect(provisioningTier(300_000, 'desirable')).toBe('important');
    expect(provisioningTier(6_000_000, 'essential')).toBe('catastrophic');
  });
});

describe('W72 spare-parts-provisioning chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');

  it('every active state is URGENT (more critical = TIGHTER window)', () => {
    const active: ProvisioningStatus[] = [
      'demand_identified', 'requisition_raised', 'requisition_approved', 'po_issued',
      'backordered', 'in_transit', 'received', 'stocked', 'reserved',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].routine).toBeGreaterThan(SLA_MINUTES[st].standard);
      expect(SLA_MINUTES[st].standard).toBeGreaterThan(SLA_MINUTES[st].important);
      expect(SLA_MINUTES[st].important).toBeGreaterThan(SLA_MINUTES[st].critical);
      expect(SLA_MINUTES[st].critical).toBeGreaterThan(SLA_MINUTES[st].catastrophic);
    }
  });

  it('backordered is the tightest expedite window for catastrophic', () => {
    expect(SLA_MINUTES.backordered.catastrophic).toBe(240);
  });

  it('slaDeadlineFor adds the window minutes; terminals return null', () => {
    const d = slaDeadlineFor('po_issued', 'critical', base);
    expect(d!.getTime() - base.getTime()).toBe(SLA_MINUTES.po_issued.critical * 60_000);
    expect(slaDeadlineFor('issued', 'critical', base)).toBeNull();
    expect(slaDeadlineFor('returned', 'catastrophic', base)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'routine', base)).toBeNull();
  });
});

describe('W72 spare-parts-provisioning chain — AVAILABILITY-RISK-driven reportability (the W72 signature)', () => {
  const tiers: ProvisioningTier[] = ['routine', 'standard', 'important', 'critical', 'catastrophic'];

  it('flag_backorder crosses for catastrophic at any criticality', () => {
    expect(crossesIntoRegulator('flag_backorder', 'catastrophic', 'desirable')).toBe(true);
    expect(crossesIntoRegulator('flag_backorder', 'catastrophic', 'essential')).toBe(true);
    expect(crossesIntoRegulator('flag_backorder', 'catastrophic', 'vital')).toBe(true);
  });

  it('flag_backorder crosses for a VITAL part on a HIGH tier (critical)', () => {
    expect(crossesIntoRegulator('flag_backorder', 'critical', 'vital')).toBe(true);
    // not high tier → no cross even if vital
    expect(crossesIntoRegulator('flag_backorder', 'important', 'vital')).toBe(false);
    expect(crossesIntoRegulator('flag_backorder', 'standard', 'vital')).toBe(false);
    // high tier but not vital and not catastrophic → no cross
    expect(crossesIntoRegulator('flag_backorder', 'critical', 'essential')).toBe(false);
  });

  it('cancel_provisioning crosses only for a VITAL part on a HIGH tier', () => {
    expect(crossesIntoRegulator('cancel_provisioning', 'critical', 'vital')).toBe(true);
    expect(crossesIntoRegulator('cancel_provisioning', 'catastrophic', 'vital')).toBe(true);
    expect(crossesIntoRegulator('cancel_provisioning', 'catastrophic', 'essential')).toBe(false);
    expect(crossesIntoRegulator('cancel_provisioning', 'important', 'vital')).toBe(false);
  });

  it('routine actions never cross for any tier/criticality', () => {
    const routine: ProvisioningAction[] = [
      'raise_requisition', 'approve_requisition', 'issue_po', 'expedite_backorder',
      'confirm_shipment', 'receive_goods', 'pass_inspection', 'reject_inspection',
      'reserve_stock', 'issue_part',
    ];
    const crits: Criticality[] = ['vital', 'essential', 'desirable'];
    for (const t of tiers) {
      for (const a of routine) {
        for (const c of crits) {
          expect(crossesIntoRegulator(a, t, c)).toBe(false);
        }
      }
    }
  });

  it('sla_breach crosses for HIGH tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('catastrophic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('important')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('routine')).toBe(false);
  });

  it('isReportable = catastrophic OR (vital AND high)', () => {
    expect(isReportable('catastrophic', 'desirable')).toBe(true);
    expect(isReportable('critical', 'vital')).toBe(true);
    expect(isReportable('critical', 'essential')).toBe(false);
    expect(isReportable('important', 'vital')).toBe(false);
    expect(isReportable('routine', 'desirable')).toBe(false);
  });
});

describe('W72 spare-parts-provisioning chain — demand & inventory economics', () => {
  it('reorderPoint = dailyDemand × leadTime + safetyStock (ceil, non-negative)', () => {
    expect(reorderPoint(2, 30, 10)).toBe(70);
    expect(reorderPoint(0.5, 14, 3)).toBe(10);   // 7 + 3 = 10
    expect(reorderPoint(0.3, 10, 2)).toBe(5);    // 3 + 2 = 5
    expect(reorderPoint(0, 0, 0)).toBe(0);
  });

  it('safetyStock = z × σ × √L (ceil, non-negative, zero lead time → 0)', () => {
    expect(safetyStock(1.65, 4, 16)).toBe(Math.ceil(1.65 * 4 * 4)); // √16=4 → 26.4 → 27
    expect(safetyStock(1.65, 4, 0)).toBe(0);
    expect(safetyStock(0, 10, 25)).toBe(0);
  });

  it('fillRate clamps to 0..1; no demand → fully filled', () => {
    expect(fillRate(8, 10)).toBeCloseTo(0.8);
    expect(fillRate(10, 10)).toBe(1);
    expect(fillRate(15, 10)).toBe(1);
    expect(fillRate(0, 0)).toBe(1);
    expect(fillRate(-5, 10)).toBe(0);
  });

  it('predictiveLeadDays = RUL − leadTime (positive = staged in time)', () => {
    expect(predictiveLeadDays(120, 30)).toBe(90);   // 90 days of slack
    expect(predictiveLeadDays(20, 45)).toBe(-25);    // already behind
    expect(predictiveLeadDays(30, 30)).toBe(0);
  });

  it('stockoutAvoidanceZar = downtime cost rate × lead-time hours, non-negative', () => {
    expect(stockoutAvoidanceZar(5000, 10)).toBe(5000 * 10 * 24); // 1.2m
    expect(stockoutAvoidanceZar(5000, 0)).toBe(0);
    expect(stockoutAvoidanceZar(-100, 10)).toBe(0);
  });

  it('workingCapitalEfficiency = averted exposure / carried inventory', () => {
    expect(workingCapitalEfficiency(1_200_000, 200_000)).toBe(6);
    expect(workingCapitalEfficiency(1_200_000, 0)).toBe(0);
  });
});

describe('W72 spare-parts-provisioning chain — functional party attribution', () => {
  it('planner owns requisition raise/approve + cancel', () => {
    expect(partyForAction('raise_requisition')).toBe('planner');
    expect(partyForAction('approve_requisition')).toBe('planner');
    expect(partyForAction('cancel_provisioning')).toBe('planner');
  });

  it('buyer owns PO issuance + expedite', () => {
    expect(partyForAction('issue_po')).toBe('buyer');
    expect(partyForAction('expedite_backorder')).toBe('buyer');
  });

  it('supplier owns backorder flag + shipment confirmation', () => {
    expect(partyForAction('flag_backorder')).toBe('supplier');
    expect(partyForAction('confirm_shipment')).toBe('supplier');
  });

  it('warehouse owns goods receipt / inspection / reservation / issue', () => {
    expect(partyForAction('receive_goods')).toBe('warehouse');
    expect(partyForAction('pass_inspection')).toBe('warehouse');
    expect(partyForAction('reject_inspection')).toBe('warehouse');
    expect(partyForAction('reserve_stock')).toBe('warehouse');
    expect(partyForAction('issue_part')).toBe('warehouse');
  });
});
