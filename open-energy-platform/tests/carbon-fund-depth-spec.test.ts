import { describe, it, expect } from 'vitest';
import {
  canTransitionMrv,
  canAdvanceVintage,
  certIssueGuard,
  certRevokeGuard,
  MRV_TRANSITIONS,
  VINTAGE_STAGES,
  type MrvStatus,
  type VintageStage,
} from '../src/utils/carbon-fund-depth-spec';

describe('MRV transition guard', () => {
  it('allows the clean path draft → submitted → under_verification → verified → published', () => {
    expect(canTransitionMrv('draft', 'submitted').ok).toBe(true);
    expect(canTransitionMrv('submitted', 'under_verification').ok).toBe(true);
    expect(canTransitionMrv('under_verification', 'verified').ok).toBe(true);
    expect(canTransitionMrv('verified', 'published').ok).toBe(true);
  });

  it('allows rejection from under_verification with a reason', () => {
    const r = canTransitionMrv('under_verification', 'rejected', { rejection_reason: 'data gap' });
    expect(r.ok).toBe(true);
  });

  it('requires a reason to reject', () => {
    const r = canTransitionMrv('under_verification', 'rejected');
    expect(r.ok).toBe(false);
    expect(r.reason_code).toBe('MRV_REJECTION_REASON_REQUIRED');
  });

  it('allows resubmit after rejection', () => {
    expect(canTransitionMrv('rejected', 'submitted').ok).toBe(true);
  });

  it('blocks backward and skip transitions with MRV_INVALID_TRANSITION', () => {
    const bad: Array<[MrvStatus, MrvStatus]> = [
      ['published', 'submitted'],
      ['verified', 'draft' as MrvStatus],
      ['draft', 'verified'],
      ['draft', 'published'],
      ['submitted', 'published'],
      ['published', 'rejected'],
    ];
    for (const [from, to] of bad) {
      const r = canTransitionMrv(from, to, { rejection_reason: 'x' });
      expect(r.ok, `${from}→${to}`).toBe(false);
      expect(r.reason_code).toBe('MRV_INVALID_TRANSITION');
    }
  });

  it('published is terminal', () => {
    expect(MRV_TRANSITIONS.published).toEqual([]);
  });

  it('rejects unknown from-status (defensive on dirty rows)', () => {
    const r = canTransitionMrv('garbage' as MrvStatus, 'submitted');
    expect(r.ok).toBe(false);
  });
});

describe('vintage advance guard', () => {
  it('stage order is the documented lifecycle', () => {
    expect(VINTAGE_STAGES).toEqual([
      'validated', 'listed', 'traded', 'retired_partial', 'retired_full', 'expired',
    ]);
  });

  it('allows forward moves (single and multi step)', () => {
    expect(canAdvanceVintage('validated', 'listed').ok).toBe(true);
    expect(canAdvanceVintage('listed', 'retired_full').ok).toBe(true);
  });

  it('blocks backward and same-stage moves', () => {
    expect(canAdvanceVintage('traded', 'listed').reason_code).toBe('VINTAGE_NOT_FORWARD');
    expect(canAdvanceVintage('listed', 'listed').reason_code).toBe('VINTAGE_NOT_FORWARD');
  });

  it('blocks unknown stages with VINTAGE_INVALID_STAGE', () => {
    expect(canAdvanceVintage('validated', 'moon' as VintageStage).reason_code).toBe('VINTAGE_INVALID_STAGE');
    expect(canAdvanceVintage('moon' as VintageStage, 'listed').reason_code).toBe('VINTAGE_INVALID_STAGE');
  });
});

describe('certificate issue guard', () => {
  const retirement = { id: 'r1', quantity: 100 };

  it('issues within the retired quantity', () => {
    expect(certIssueGuard({ retirement, alreadyIssuedTco2e: 0, requestedTco2e: 100 }).ok).toBe(true);
    expect(certIssueGuard({ retirement, alreadyIssuedTco2e: 40, requestedTco2e: 60 }).ok).toBe(true);
  });

  it('rejects when retirement not found', () => {
    const r = certIssueGuard({ retirement: null, alreadyIssuedTco2e: 0, requestedTco2e: 10 });
    expect(r.ok).toBe(false);
    expect(r.reason_code).toBe('CERT_RETIREMENT_NOT_FOUND');
  });

  it('rejects zero / negative / NaN volumes', () => {
    for (const v of [0, -5, NaN]) {
      const r = certIssueGuard({ retirement, alreadyIssuedTco2e: 0, requestedTco2e: v });
      expect(r.ok, String(v)).toBe(false);
      expect(r.reason_code).toBe('CERT_VOLUME_INVALID');
    }
  });

  it('rejects over-issuance across the sum of prior certificates', () => {
    const r = certIssueGuard({ retirement, alreadyIssuedTco2e: 90, requestedTco2e: 20 });
    expect(r.ok).toBe(false);
    expect(r.reason_code).toBe('CERT_VOLUME_EXCEEDS_RETIRED');
  });

  it('tolerates float epsilon at the boundary', () => {
    expect(certIssueGuard({
      retirement: { id: 'r1', quantity: 0.3 },
      alreadyIssuedTco2e: 0.1 + 0.2 - 0.3, // tiny float residue
      requestedTco2e: 0.3,
    }).ok).toBe(true);
  });
});

describe('certificate revoke guard', () => {
  it('issued and delivered are revocable', () => {
    expect(certRevokeGuard('issued').ok).toBe(true);
    expect(certRevokeGuard('delivered').ok).toBe(true);
  });

  it('queued and revoked are not', () => {
    expect(certRevokeGuard('queued').reason_code).toBe('CERT_NOT_REVOCABLE');
    expect(certRevokeGuard('revoked').reason_code).toBe('CERT_NOT_REVOCABLE');
  });
});
