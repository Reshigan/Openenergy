// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for src/utils/lender-escalation-spec.ts (Wave 6).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  DUNNING_CYCLE_DAYS,
  CYCLE_TO_TIER,
  normaliseSignal,
  nextDunningCycle,
  initialDunningCycle,
  escalationSeverity,
  eclStageForSignal,
} from '../src/utils/lender-escalation-spec';

const NOW = new Date('2026-05-27T10:00:00Z');

describe('signal normalisation', () => {
  it('returns known signals untouched', () => {
    expect(normaliseSignal('covenant_breach')).toBe('covenant_breach');
    expect(normaliseSignal('dscr_warning')).toBe('dscr_warning');
  });
  it('maps unknown / nullish signals to manual', () => {
    expect(normaliseSignal('something_else')).toBe('manual');
    expect(normaliseSignal(null)).toBe('manual');
    expect(normaliseSignal(undefined)).toBe('manual');
  });
});

describe('cycle progression', () => {
  it('initial cycle is 1 with a 14-day cure window', () => {
    const r = initialDunningCycle(NOW);
    expect(r.cycle).toBe(1);
    expect(r.cure_days).toBe(14);
    expect(r.tier).toBe(1);
    expect(r.terminal).toBe(false);
    expect(r.cure_deadline_at).toBe(new Date(NOW.getTime() + 14 * 86_400_000).toISOString());
  });

  it('cycle 1 → 2 narrows the window to 7 days and tier 2', () => {
    const r = nextDunningCycle(1, NOW);
    expect(r.cycle).toBe(2);
    expect(r.cure_days).toBe(7);
    expect(r.tier).toBe(2);
    expect(r.terminal).toBe(false);
  });

  it('cycle 2 → 3 narrows to 3 days and tier 3', () => {
    const r = nextDunningCycle(2, NOW);
    expect(r.cycle).toBe(3);
    expect(r.cure_days).toBe(3);
    expect(r.tier).toBe(3);
    expect(r.terminal).toBe(false);
  });

  it('cycle 3 is terminal — next stays 3 but flags terminal', () => {
    const r = nextDunningCycle(3, NOW);
    expect(r.cycle).toBe(3);
    expect(r.terminal).toBe(true);
  });

  it('out-of-range cycles clamp safely', () => {
    expect(nextDunningCycle(0, NOW).cycle).toBe(2);
    expect(nextDunningCycle(99, NOW).cycle).toBe(3);
    expect(nextDunningCycle(-5, NOW).cycle).toBe(2);
  });

  it('cycle constants are consistent with the day map', () => {
    expect(DUNNING_CYCLE_DAYS[1]).toBe(14);
    expect(DUNNING_CYCLE_DAYS[2]).toBe(7);
    expect(DUNNING_CYCLE_DAYS[3]).toBe(3);
    expect(CYCLE_TO_TIER[1]).toBe(1);
    expect(CYCLE_TO_TIER[2]).toBe(2);
    expect(CYCLE_TO_TIER[3]).toBe(3);
  });
});

describe('escalation severity', () => {
  it('cycle 3 maps to high (Wave 5 inbox)', () => {
    expect(escalationSeverity(3)).toBe('high');
  });
  it('cycle 2 maps to medium', () => {
    expect(escalationSeverity(2)).toBe('medium');
  });
  it('cycles 0/1 map to low', () => {
    expect(escalationSeverity(1)).toBe('low');
    expect(escalationSeverity(0)).toBe('low');
  });
});

describe('IFRS 9 stage transitions', () => {
  it('stage 1 + covenant_breach → stage 2', () => {
    const r = eclStageForSignal(1, 'covenant_breach');
    expect(r.stage).toBe(2);
    expect(r.reason).toBe('covenant_breach');
  });
  it('stage 1 + dscr_warning → stage 2', () => {
    expect(eclStageForSignal(1, 'dscr_warning').stage).toBe(2);
  });
  it('stage 2 + covenant_breach → stage 3', () => {
    const r = eclStageForSignal(2, 'covenant_breach');
    expect(r.stage).toBe(3);
    expect(r.reason).toBe('covenant_breach');
  });
  it('stage 2 + credit_deterioration → stage 3', () => {
    expect(eclStageForSignal(2, 'credit_deterioration').stage).toBe(3);
  });
  it('stage 3 + anything stays stage 3 with no reason', () => {
    const r = eclStageForSignal(3, 'covenant_breach');
    expect(r.stage).toBe(3);
    expect(r.reason).toBe(null);
  });
  it('unknown signals do not transition', () => {
    const r = eclStageForSignal(1, 'something_unknown');
    expect(r.stage).toBe(1);
    expect(r.reason).toBe(null);
  });
  it('invalid current stage defaults to 1', () => {
    const r = eclStageForSignal(99 as any, 'covenant_breach');
    expect(r.stage).toBe(2);
  });
});
