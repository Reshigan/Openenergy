import { describe, it, expect } from 'vitest';
import {
  explainKnown,
  explainViaGateway,
  explainSettlementRunFailure,
  knownFailureCodes,
} from '../src/utils/run-failure-explainer';

describe('settlement run-failure explainer', () => {
  it('returns deterministic resolution for known codes', () => {
    const got = explainKnown('metering_gap');
    expect(got).not.toBeNull();
    expect(got?.source).toBe('deterministic');
    expect(got?.confidence).toBeGreaterThanOrEqual(0.9);
    expect(got?.explanation).toMatch(/meter readings/i);
    expect(got?.suggested_action).toMatch(/asoba|backfill/i);
  });

  it('returns null for unknown codes', () => {
    expect(explainKnown('this_will_never_be_a_code')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(explainKnown(null)).toBeNull();
    expect(explainKnown(undefined)).toBeNull();
    expect(explainKnown('')).toBeNull();
  });

  it('falls back to gateway path for novel codes', async () => {
    const got = await explainViaGateway('weird_new_failure', 'boom');
    expect(got.source).toBe('fallback');
    expect(got.confidence).toBeLessThan(0.7);
    expect(got.explanation).toMatch(/weird_new_failure/);
  });

  it('top-level entry prefers deterministic for known codes', async () => {
    const got = await explainSettlementRunFailure('contract_missing', null);
    expect(got.source).toBe('deterministic');
  });

  it('top-level entry uses gateway for novel codes', async () => {
    const got = await explainSettlementRunFailure('mystery_code', 'no detail');
    expect(got.source).toBe('fallback');
  });

  it('knownFailureCodes covers the documented buckets', () => {
    const codes = knownFailureCodes();
    expect(codes).toContain('metering_gap');
    expect(codes).toContain('contract_missing');
    expect(codes).toContain('price_curve_stale');
    expect(codes).toContain('counterparty_unknown_bank');
    expect(codes).toContain('tariff_validation_failed');
    expect(codes).toContain('duplicate_invoice_period');
    expect(codes).toContain('fx_rate_missing');
  });
});
