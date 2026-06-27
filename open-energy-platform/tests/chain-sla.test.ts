// ═══════════════════════════════════════════════════════════════════════════
// resolveNextStatus — the sla_breach hold-in-place invariant (defect-hunt TDD).
//
// Dozens of governed chains compute their next state as
// `STATE_TRANSITIONS[action]`. For the `sla_breach` action those flat maps point
// at a FIXED state (often the chain's start, or even a terminal). Applied
// unconditionally that REWINDS an in-flight chain to an earlier state — or kills
// it outright — whenever a cron SLA sweep fires `sla_breach`. The documented
// intent across the codebase ("stays in place, flag set", "no-move") is that
// sla_breach is a flag event, not a transition: the chain holds its position.
import { describe, it, expect } from 'vitest';
import { resolveNextStatus } from '../src/utils/chain-sla';

const MAP = {
  start_measurement: 'kpi_measurement',
  certify_kpi: 'kpi_certified',
  sla_breach: 'kpi_pending', // the buggy fixed target — must be ignored
} as const;

describe('resolveNextStatus', () => {
  it('holds the current status on sla_breach (never the mapped target)', () => {
    expect(resolveNextStatus('sla_breach', 'kpi_verification', MAP)).toBe('kpi_verification');
    expect(resolveNextStatus('sla_breach', 'ratchet_agreed', MAP)).toBe('ratchet_agreed');
  });

  it('never rewinds to the mapped start state on sla_breach', () => {
    // The defect: would return MAP.sla_breach === 'kpi_pending' (start).
    expect(resolveNextStatus('sla_breach', 'arbitration', MAP)).not.toBe('kpi_pending');
  });

  it('applies the mapped target for every other action', () => {
    expect(resolveNextStatus('start_measurement', 'kpi_pending', MAP)).toBe('kpi_measurement');
    expect(resolveNextStatus('certify_kpi', 'kpi_verification', MAP)).toBe('kpi_certified');
  });
});
