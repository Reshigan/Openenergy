import { describe, it, expect } from 'vitest';
import { computeSettlementRun, PpaContract } from '../src/utils/settlement-engine';

const basePpa: PpaContract = {
  id: 'c1',
  from_participant_id: 'gen_a',
  to_participant_id: 'off_a',
  ppa_volume_mwh_per_period: 1000,
  ppa_price_per_mwh: 1200,
  floor_price_per_mwh: null,
  ceiling_price_per_mwh: null,
  take_or_pay_percentage: null,
  vat_rate: 0.15,
};

describe('computeSettlementRun', () => {
  it('invoices delivered volume at PPA price + VAT', () => {
    const [inv] = computeSettlementRun([basePpa], [{ contract_id: 'c1', delivered_mwh: 500 }]);
    expect(inv.billed_mwh).toBe(500);
    expect(inv.unit_price_zar_mwh).toBe(1200);
    expect(inv.subtotal_zar).toBe(600_000);
    expect(inv.vat_zar).toBe(90_000);
    expect(inv.total_zar).toBe(690_000);
    expect(inv.applied_rule).toBe('delivered');
  });

  it('applies take-or-pay when delivered is below the threshold', () => {
    const ppa = { ...basePpa, take_or_pay_percentage: 80 };
    const [inv] = computeSettlementRun([ppa], [{ contract_id: 'c1', delivered_mwh: 400 }]);
    // 80% of 1000 = 800 MWh billable
    expect(inv.billed_mwh).toBe(800);
    expect(inv.applied_rule).toBe('take_or_pay');
    // Uplift = (800 − 400) × 1200 = 480_000
    expect(inv.take_or_pay_uplift_zar).toBe(480_000);
    expect(inv.subtotal_zar).toBe(800 * 1200);
  });

  it('does not apply take-or-pay when delivered exceeds the threshold', () => {
    const ppa = { ...basePpa, take_or_pay_percentage: 80 };
    const [inv] = computeSettlementRun([ppa], [{ contract_id: 'c1', delivered_mwh: 900 }]);
    expect(inv.billed_mwh).toBe(900);
    expect(inv.applied_rule).toBe('delivered');
    expect(inv.take_or_pay_uplift_zar).toBe(0);
  });

  it('enforces the ceiling price when PPA price is above it', () => {
    const ppa = { ...basePpa, ceiling_price_per_mwh: 1000 };
    const [inv] = computeSettlementRun([ppa], [{ contract_id: 'c1', delivered_mwh: 500 }]);
    expect(inv.unit_price_zar_mwh).toBe(1000);
    expect(inv.applied_rule).toBe('ceiling_cap');
  });

  it('lifts to the floor price when PPA price is below it', () => {
    const ppa = { ...basePpa, ppa_price_per_mwh: 800, floor_price_per_mwh: 1000 };
    const [inv] = computeSettlementRun([ppa], [{ contract_id: 'c1', delivered_mwh: 500 }]);
    expect(inv.unit_price_zar_mwh).toBe(1000);
    expect(inv.applied_rule).toBe('floor_lift');
  });

  it('returns zero-value invoice when no delivery and no take-or-pay', () => {
    const [inv] = computeSettlementRun([basePpa], [{ contract_id: 'c1', delivered_mwh: 0 }]);
    expect(inv.billed_mwh).toBe(0);
    expect(inv.subtotal_zar).toBe(0);
    expect(inv.total_zar).toBe(0);
  });

  it('handles multiple contracts in one run', () => {
    const ppa2 = { ...basePpa, id: 'c2', from_participant_id: 'gen_b', ppa_price_per_mwh: 1500 };
    const invs = computeSettlementRun(
      [basePpa, ppa2],
      [
        { contract_id: 'c1', delivered_mwh: 100 },
        { contract_id: 'c2', delivered_mwh: 200 },
      ],
    );
    expect(invs).toHaveLength(2);
    expect(invs[0].subtotal_zar).toBe(120_000);
    expect(invs[1].subtotal_zar).toBe(300_000);
  });
});
