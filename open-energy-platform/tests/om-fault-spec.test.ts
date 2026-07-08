import { describe, it, expect } from 'vitest';
import {
  canTransitionFault,
  FAULT_TRANSITIONS,
  FAULT_RESOLVABLE_STATUSES,
  type OmFaultStatus,
} from '../src/utils/om-fault-spec';

describe('om fault transition guard', () => {
  it('allows the working path open → acknowledged → in_progress → resolved → closed', () => {
    expect(canTransitionFault('open', 'acknowledged').ok).toBe(true);
    expect(canTransitionFault('acknowledged', 'in_progress').ok).toBe(true);
    expect(canTransitionFault('in_progress', 'resolved').ok).toBe(true);
    expect(canTransitionFault('resolved', 'closed').ok).toBe(true);
  });

  it('allows direct resolve and false_positive from any live status', () => {
    for (const from of ['open', 'acknowledged', 'in_progress'] as OmFaultStatus[]) {
      expect(canTransitionFault(from, 'resolved').ok, `${from}→resolved`).toBe(true);
      expect(canTransitionFault(from, 'false_positive').ok, `${from}→false_positive`).toBe(true);
    }
  });

  it('blocks re-resolving and mutation of terminal faults', () => {
    const bad: Array<[OmFaultStatus, OmFaultStatus]> = [
      ['resolved', 'resolved'],
      ['closed', 'resolved'],
      ['false_positive', 'resolved'],
      ['closed', 'open'],
      ['resolved', 'in_progress'],
    ];
    for (const [from, to] of bad) {
      const r = canTransitionFault(from, to);
      expect(r.ok, `${from}→${to}`).toBe(false);
      expect(r.reason_code).toBe('FAULT_INVALID_TRANSITION');
    }
  });

  it('closed and false_positive are terminal', () => {
    expect(FAULT_TRANSITIONS.closed).toEqual([]);
    expect(FAULT_TRANSITIONS.false_positive).toEqual([]);
  });

  it('rejects unknown from-status (defensive on dirty rows)', () => {
    expect(canTransitionFault('garbage' as OmFaultStatus, 'resolved').ok).toBe(false);
  });

  it('resolvable-status list matches the transition map', () => {
    const resolvable = (Object.keys(FAULT_TRANSITIONS) as OmFaultStatus[])
      .filter((s) => FAULT_TRANSITIONS[s].includes('resolved'));
    expect([...FAULT_RESOLVABLE_STATUSES].sort()).toEqual(resolvable.sort());
  });
});
