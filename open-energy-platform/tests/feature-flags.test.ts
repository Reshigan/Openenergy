import { describe, it, expect } from 'vitest';
import { evaluateFlag, coerceFlagValue, percentileFor } from '../src/utils/feature-flags';

const baseFlag = {
  flag_key: 'new_matching_engine',
  default_value: 'false',
  rollout_strategy: 'off' as const,
  rollout_config_json: null,
  enabled: true,
};

describe('evaluateFlag — strategies', () => {
  it('returns default when strategy is off', () => {
    const r = evaluateFlag(baseFlag, [], { tenant_id: 't1' });
    expect(r.value).toBe('false');
    expect(r.strategy).toBe('off');
  });

  it('returns true when strategy is all', () => {
    const r = evaluateFlag({ ...baseFlag, rollout_strategy: 'all' }, [], { tenant_id: 't1' });
    expect(r.value).toBe('true');
  });

  it('returns false when flag is disabled regardless of strategy', () => {
    const r = evaluateFlag({ ...baseFlag, enabled: false, rollout_strategy: 'all' }, [], { tenant_id: 't1' });
    expect(r.value).toBe('false');
    expect(r.strategy).toBe('disabled');
  });

  it('percentage strategy enables when bucket < cutoff', () => {
    // Construct a tenant whose hash bucket is stable across runs; 100% cutoff
    // should always enable, 0% always disable.
    const on100 = evaluateFlag(
      { ...baseFlag, rollout_strategy: 'percentage', rollout_config_json: JSON.stringify({ percentage: 100 }) },
      [], { tenant_id: 't_anything' },
    );
    expect(on100.value).toBe('true');
    const off0 = evaluateFlag(
      { ...baseFlag, rollout_strategy: 'percentage', rollout_config_json: JSON.stringify({ percentage: 0 }) },
      [], { tenant_id: 't_anything' },
    );
    expect(off0.value).toBe('false');
  });

  it('by_tier only enables for listed tiers', () => {
    const flag = {
      ...baseFlag,
      rollout_strategy: 'by_tier' as const,
      rollout_config_json: JSON.stringify({ tiers: ['pro', 'enterprise'] }),
    };
    expect(evaluateFlag(flag, [], { tenant_id: 't1', tier: 'pro' }).value).toBe('true');
    expect(evaluateFlag(flag, [], { tenant_id: 't1', tier: 'standard' }).value).toBe('false');
  });

  it('by_tenant only enables for listed tenants', () => {
    const flag = {
      ...baseFlag,
      rollout_strategy: 'by_tenant' as const,
      rollout_config_json: JSON.stringify({ tenant_ids: ['eskom', 'nersa'] }),
    };
    expect(evaluateFlag(flag, [], { tenant_id: 'eskom' }).value).toBe('true');
    expect(evaluateFlag(flag, [], { tenant_id: 'other' }).value).toBe('false');
  });
});

describe('evaluateFlag — overrides', () => {
  it('participant override beats everything', () => {
    const r = evaluateFlag(
      { ...baseFlag, rollout_strategy: 'all' },
      [{ tenant_id: null, participant_id: 'p1', value: 'false', expires_at: null }],
      { tenant_id: 't1', participant_id: 'p1' },
    );
    expect(r.value).toBe('false');
    expect(r.matched_override).toBe(true);
    expect(r.strategy).toBe('override_participant');
  });

  it('tenant override beats strategy', () => {
    const r = evaluateFlag(
      { ...baseFlag, rollout_strategy: 'off' },
      [{ tenant_id: 't1', participant_id: null, value: 'true', expires_at: null }],
      { tenant_id: 't1' },
    );
    expect(r.value).toBe('true');
    expect(r.strategy).toBe('override_tenant');
  });

  it('expired overrides are ignored', () => {
    const past = '2020-01-01T00:00:00Z';
    const r = evaluateFlag(
      { ...baseFlag, rollout_strategy: 'off' },
      [{ tenant_id: 't1', participant_id: null, value: 'true', expires_at: past }],
      { tenant_id: 't1' },
    );
    expect(r.value).toBe('false');
    expect(r.matched_override).toBe(false);
  });
});

describe('percentileFor', () => {
  it('is deterministic for the same input', () => {
    const a = percentileFor('flag_a', 'tenant_1');
    const b = percentileFor('flag_a', 'tenant_1');
    expect(a).toBe(b);
  });

  it('produces values in 0-99', () => {
    for (let i = 0; i < 100; i++) {
      const p = percentileFor('f', `t${i}`);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(100);
    }
  });
});

describe('coerceFlagValue', () => {
  it('parses JSON scalars', () => {
    expect(coerceFlagValue('true')).toBe(true);
    expect(coerceFlagValue('false')).toBe(false);
    expect(coerceFlagValue('42')).toBe(42);
    expect(coerceFlagValue('"hello"')).toBe('hello');
  });

  it('returns raw string for non-JSON values', () => {
    expect(coerceFlagValue('abc')).toBe('abc');
  });
});
