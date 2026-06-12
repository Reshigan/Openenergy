import { describe, it, expect } from 'vitest';
import { assembleHorizon, type ChainRows } from '../src/routes/horizon';
import { MERIDIAN_CHAINS } from '../src/utils/chain-registry-meridian';

const NOW = Date.parse('2026-06-12T09:40:00Z');
const cov = MERIDIAN_CHAINS.find(d => d.key === 'covenant_certificate')!;

const rows: ChainRows[] = [{
  chain: cov,
  rows: [
    { id: 'cc-1', certificate_number: 'CC-001', facility_name: 'Karusa Wind', borrower_party_name: 'Karusa Wind (Pty) Ltd', chain_status: 'under_review',
      sla_deadline_at: new Date(NOW - 3600_000).toISOString(), outstanding_principal: 310_000_000 },
    { id: 'cc-2', certificate_number: 'CC-002', facility_name: 'Umoyilanga', borrower_party_name: 'Umoyilanga Energy', chain_status: 'certificate_due',
      sla_deadline_at: new Date(NOW + 30 * 3600_000).toISOString(), outstanding_principal: 95_000_000 },
  ],
}];

describe('assembleHorizon', () => {
  const h = assembleHorizon(rows, 'lender', NOW);

  it('groups cases into lanes by registry lane key', () => {
    const lane = h.lanes.find(l => l.key === cov.lanes.lender);
    expect(lane).toBeDefined();
    expect(lane!.cases).toHaveLength(2);
  });
  it('buckets by deadline', () => {
    const lane = h.lanes.find(l => l.key === cov.lanes.lender)!;
    expect(lane.cases.find(c => c.id === 'cc-1')!.bucket).toBe('breached');
    expect(lane.cases.find(c => c.id === 'cc-2')!.bucket).toBe('h48');
  });
  it('duty stream ranks breached R310m first and carries action hints', () => {
    expect(h.duty[0].id).toBe('cc-1');
    expect(h.duty[0].actions.length).toBeGreaterThan(0);
    expect(h.duty[0].actions[0].cascadeHint).toBeTruthy();
  });
  it('caps duty stream at 8', () => {
    expect(h.duty.length).toBeLessThanOrEqual(8);
  });
});
