import { describe, it, expect } from 'vitest';
import { shapeThread } from '../src/routes/thread';
import { getChain } from '../src/utils/chain-registry-meridian';

const cov = getChain('covenant_certificate')!;

describe('shapeThread', () => {
  const row = {
    id: 'cc-1', borrower_name: 'Karusa Wind', chain_status: 'under_review',
    sla_deadline_at: '2026-06-13T09:00:00Z', outstanding_principal: 310_000_000,
  };
  it('returns case envelope with quantum + deadline + status', () => {
    const t = shapeThread(cov, row, [], 'lender');
    expect(t.case.ref).toBe('cc-1');
    expect(t.case.quantum_zar).toBe(310_000_000);
    expect(t.case.status).toBe('under_review');
    expect(t.case.deadline_at).toBe('2026-06-13T09:00:00Z');
  });
  it('two-sided: lender gets write actions, ipp_developer gets none on this chain', () => {
    expect(shapeThread(cov, row, [], 'lender').actions.length).toBeGreaterThan(0);
    expect(shapeThread(cov, row, [], 'ipp_developer').actions).toHaveLength(0);
  });
  it('actions carry cascadeHint (Law 3)', () => {
    const t = shapeThread(cov, row, [], 'lender');
    expect(t.actions[0].cascadeHint.length).toBeGreaterThan(10);
  });
});
