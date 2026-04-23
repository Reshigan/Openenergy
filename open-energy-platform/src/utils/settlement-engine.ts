// ═══════════════════════════════════════════════════════════════════════════
// Settlement engine — pure computation of the ZAR owed between parties for a
// given period, based on PPA terms + metering readings.
//
// The engine is deterministic and idempotent: for the same inputs it produces
// the same output. Callers persist the resulting invoices in a single
// transactional pass.
// ═══════════════════════════════════════════════════════════════════════════

export interface PpaContract {
  id: string;
  from_participant_id: string;         // seller / generator
  to_participant_id: string;           // buyer / offtaker
  ppa_volume_mwh_per_period: number | null;
  ppa_price_per_mwh: number;
  floor_price_per_mwh: number | null;
  ceiling_price_per_mwh: number | null;
  take_or_pay_percentage: number | null;   // 0-100
  vat_rate: number;                    // e.g. 0.15
}

export interface PeriodReading {
  contract_id: string;
  delivered_mwh: number;
}

export interface ComputedInvoice {
  contract_id: string;
  from_participant_id: string;
  to_participant_id: string;
  billed_mwh: number;
  unit_price_zar_mwh: number;
  subtotal_zar: number;
  vat_zar: number;
  total_zar: number;
  take_or_pay_uplift_zar: number;
  applied_rule: 'delivered' | 'take_or_pay' | 'ceiling_cap' | 'floor_lift';
}

/**
 * Compute invoices for a period by joining contracts × deliveries.
 */
export function computeSettlementRun(
  contracts: PpaContract[],
  deliveries: PeriodReading[],
): ComputedInvoice[] {
  const deliveryByContract = new Map<string, number>();
  for (const d of deliveries) deliveryByContract.set(d.contract_id, d.delivered_mwh);

  const invoices: ComputedInvoice[] = [];
  for (const c of contracts) {
    const delivered = deliveryByContract.get(c.id) ?? 0;
    let billedMwh = delivered;
    let applied: ComputedInvoice['applied_rule'] = 'delivered';
    let topUplift = 0;

    // Take-or-pay: if delivered < percentage × contracted volume, invoice
    // the percentage × contracted volume at the PPA price.
    if (c.take_or_pay_percentage && c.ppa_volume_mwh_per_period) {
      const minBillable = (c.take_or_pay_percentage / 100) * c.ppa_volume_mwh_per_period;
      if (delivered < minBillable) {
        topUplift = (minBillable - delivered) * c.ppa_price_per_mwh;
        billedMwh = minBillable;
        applied = 'take_or_pay';
      }
    }

    // Price collar: cap at ceiling / floor.
    let unitPrice = c.ppa_price_per_mwh;
    if (c.ceiling_price_per_mwh != null && unitPrice > c.ceiling_price_per_mwh) {
      unitPrice = c.ceiling_price_per_mwh;
      applied = 'ceiling_cap';
    } else if (c.floor_price_per_mwh != null && unitPrice < c.floor_price_per_mwh) {
      unitPrice = c.floor_price_per_mwh;
      applied = 'floor_lift';
    }

    const subtotal = round2(billedMwh * unitPrice);
    const vat = round2(subtotal * (c.vat_rate ?? 0));
    const total = round2(subtotal + vat);

    invoices.push({
      contract_id: c.id,
      from_participant_id: c.from_participant_id,
      to_participant_id: c.to_participant_id,
      billed_mwh: round2(billedMwh),
      unit_price_zar_mwh: round2(unitPrice),
      subtotal_zar: subtotal,
      vat_zar: vat,
      total_zar: total,
      take_or_pay_uplift_zar: round2(topUplift),
      applied_rule: applied,
    });
  }
  return invoices;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
