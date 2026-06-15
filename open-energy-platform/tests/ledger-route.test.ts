import { describe, it, expect } from 'vitest';
import { assembleLedger } from '../src/routes/ledger';
import { getChain } from '../src/utils/chain-registry-meridian';

const chain = getChain('covenant_certificate')!;
const now = Date.parse('2026-06-13T00:00:00Z');
const rows = [
  { id: 'c1', certificate_number: 'CC-1', facility_name: 'Mthatha', chain_status: 'breach_identified',
    sla_deadline_at: '2026-06-12T00:00:00Z', outstanding_principal: 100, borrower_party_name: 'IPP A' },
  { id: 'c2', certificate_number: 'CC-2', facility_name: 'Karoo', chain_status: 'compliant',
    sla_deadline_at: '2026-07-01T00:00:00Z', outstanding_principal: 50, borrower_party_name: 'IPP B' },
];

describe('assembleLedger', () => {
  it('maps rows and computes kpis (count / count_breached / sum_quantum)', () => {
    const out = assembleLedger(chain, rows, 'lender', now);
    expect(out.rows).toHaveLength(2);
    expect(out.chain.key).toBe('covenant_certificate');
    const kpi = Object.fromEntries(out.kpis.map(k => [k.key, k.value]));
    expect(kpi.total).toBe(2);
    expect(kpi.breached).toBe(1);          // CC-1 deadline in past → breached bucket
    // exposure = sum of quantumZar(chain,row); assert it is the sum of the two rows' quantum, and > 0
    expect(kpi.exposure).toBe((out.rows[0].quantum_zar ?? 0) + (out.rows[1].quantum_zar ?? 0));
    expect(kpi.exposure).toBeGreaterThan(0);
  });
  it('row links carry id and a viewer-filtered action set', () => {
    const out = assembleLedger(chain, rows, 'lender', now);
    expect(out.rows[0].id).toBe('c1');
    expect(out.rows.some(r => r.actions.some(a => a.action === 'flag-breach'))).toBe(true);
    const reg = assembleLedger(chain, rows, 'regulator', now);
    expect(reg.rows.every(r => r.actions.every(a => a.action !== 'flag-breach'))).toBe(true); // regulator not in flag-breach roles
  });
});
