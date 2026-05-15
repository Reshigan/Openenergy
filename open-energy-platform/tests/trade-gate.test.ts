import { describe, it, expect } from 'vitest';
import { gateStateFor, type GateDeps } from '../src/utils/trade-gate';

function deps(
  row: { gate_close_at: string; status: string } | null,
  now: Date,
): GateDeps {
  return {
    loadCalendar: async () => row,
    now: () => now,
  };
}

describe('trade-gate enforcement', () => {
  it('returns open when no calendar row exists (older deploy)', async () => {
    const state = await gateStateFor('2026-06-01', 'ZA', deps(null, new Date('2026-06-01T10:00:00Z')));
    expect(state.state).toBe('open');
  });

  it('returns open when gate_close_at is still in the future', async () => {
    const state = await gateStateFor(
      '2026-06-01',
      'ZA',
      deps({ gate_close_at: '2026-06-01T18:00:00Z', status: 'scheduled' }, new Date('2026-06-01T15:00:00Z')),
    );
    expect(state.state).toBe('open');
    if (state.state === 'open') expect(state.until).toBe('2026-06-01T18:00:00Z');
  });

  it('returns closed once gate_close_at has passed', async () => {
    const state = await gateStateFor(
      '2026-06-01',
      'ZA',
      deps({ gate_close_at: '2026-06-01T18:00:00Z', status: 'scheduled' }, new Date('2026-06-01T18:30:00Z')),
    );
    expect(state.state).toBe('closed');
  });

  it('returns closed when status moved past scheduled regardless of clock', async () => {
    const state = await gateStateFor(
      '2026-06-01',
      'ZA',
      deps({ gate_close_at: '2026-06-01T18:00:00Z', status: 'gate_closed' }, new Date('2026-06-01T08:00:00Z')),
    );
    expect(state.state).toBe('closed');
  });

  it('treats explicit cancelled status as closed', async () => {
    const state = await gateStateFor(
      '2026-06-01',
      'ZA',
      deps({ gate_close_at: '2026-06-01T18:00:00Z', status: 'cancelled' }, new Date('2026-06-01T08:00:00Z')),
    );
    expect(state.state).toBe('closed');
  });
});
