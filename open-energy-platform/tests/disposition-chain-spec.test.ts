import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isTerminal,
  allowedActions,
  slaDeadlineFor,
  isReportable,
  crossesIntoCouncil,
  slaBreachCrossesIntoCouncil,
  SLA_MINUTES,
  type DispositionStatus,
  type DispositionAction,
  type DispositionTier,
} from '../src/utils/disposition-chain-spec';

describe('disposition-chain-spec — happy path', () => {
  it('drives received → closed through 7 transitions', () => {
    const path: Array<[DispositionStatus, DispositionAction, DispositionStatus]> = [
      ['received',           'triage',              'triaged'],
      ['triaged',            'assign',              'assigned'],
      ['assigned',           'begin_investigation', 'investigating'],
      ['investigating',      'require_action',      'action_required'],
      ['action_required',    'begin_action',        'action_in_progress'],
      ['action_in_progress', 'complete_action',     'action_completed'],
      ['action_completed',   'close',               'closed'],
    ];
    for (const [from, action, expected] of path) {
      expect(nextStatus(from, action)).toBe(expected);
    }
  });
});

describe('disposition-chain-spec — escalate branch', () => {
  it('escalate reachable from triaged/assigned/investigating/action_required/action_in_progress/action_completed', () => {
    const sources: DispositionStatus[] = [
      'triaged', 'assigned', 'investigating', 'action_required', 'action_in_progress', 'action_completed',
    ];
    for (const from of sources) {
      expect(nextStatus(from, 'escalate')).toBe('escalated');
    }
  });
  it('escalate NOT reachable from received', () => {
    expect(nextStatus('received', 'escalate')).toBeNull();
  });
});

describe('disposition-chain-spec — dismiss / refer branches', () => {
  it('dismiss reachable from received/triaged/investigating', () => {
    expect(nextStatus('received',      'dismiss')).toBe('dismissed');
    expect(nextStatus('triaged',       'dismiss')).toBe('dismissed');
    expect(nextStatus('investigating', 'dismiss')).toBe('dismissed');
  });
  it('refer reachable from received/triaged/investigating', () => {
    expect(nextStatus('received',      'refer')).toBe('referred');
    expect(nextStatus('triaged',       'refer')).toBe('referred');
    expect(nextStatus('investigating', 'refer')).toBe('referred');
  });
  it('dismiss/refer NOT reachable from action states', () => {
    expect(nextStatus('action_required',    'dismiss')).toBeNull();
    expect(nextStatus('action_in_progress', 'refer')).toBeNull();
    expect(nextStatus('action_completed',   'dismiss')).toBeNull();
  });
});

describe('disposition-chain-spec — terminals', () => {
  it('marks closed/escalated/dismissed/referred as terminal', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('escalated')).toBe(true);
    expect(isTerminal('dismissed')).toBe(true);
    expect(isTerminal('referred')).toBe(true);
  });
  it('all forward states are non-terminal', () => {
    const forward: DispositionStatus[] = [
      'received', 'triaged', 'assigned', 'investigating',
      'action_required', 'action_in_progress', 'action_completed',
    ];
    for (const s of forward) expect(isTerminal(s)).toBe(false);
  });
  it('any action from a terminal returns null', () => {
    expect(nextStatus('closed',    'triage')).toBeNull();
    expect(nextStatus('escalated', 'assign')).toBeNull();
    expect(nextStatus('dismissed', 'begin_investigation')).toBeNull();
    expect(nextStatus('referred',  'close')).toBeNull();
  });
});

describe('disposition-chain-spec — allowedActions sanity', () => {
  it('received allows triage + dismiss + refer', () => {
    expect(allowedActions('received').sort()).toEqual(['dismiss', 'refer', 'triage'].sort());
  });
  it('triaged allows assign + escalate + dismiss + refer', () => {
    expect(allowedActions('triaged').sort()).toEqual(['assign', 'dismiss', 'escalate', 'refer'].sort());
  });
  it('investigating allows require_action + escalate + dismiss + refer', () => {
    expect(allowedActions('investigating').sort()).toEqual(['dismiss', 'escalate', 'refer', 'require_action'].sort());
  });
  it('action_completed allows close + escalate', () => {
    expect(allowedActions('action_completed').sort()).toEqual(['close', 'escalate'].sort());
  });
});

describe('disposition-chain-spec — INVERTED SLA matrix', () => {
  it('received: critical < high < medium < low', () => {
    const m = SLA_MINUTES.received;
    expect(m.critical).toBeLessThan(m.high);
    expect(m.high).toBeLessThan(m.medium);
    expect(m.medium).toBeLessThan(m.low);
  });
  it('investigating: critical (10d) < medium (45d) < low (90d)', () => {
    expect(SLA_MINUTES.investigating.critical).toBe(10 * 24 * 60);
    expect(SLA_MINUTES.investigating.medium).toBe(45 * 24 * 60);
    expect(SLA_MINUTES.investigating.low).toBe(90 * 24 * 60);
  });
  it('terminal states carry zero SLA', () => {
    const tiers: DispositionTier[] = ['critical', 'high', 'medium', 'low'];
    for (const t of tiers) {
      expect(SLA_MINUTES.closed[t]).toBe(0);
      expect(SLA_MINUTES.escalated[t]).toBe(0);
      expect(SLA_MINUTES.dismissed[t]).toBe(0);
      expect(SLA_MINUTES.referred[t]).toBe(0);
    }
  });
  it('slaDeadlineFor returns null for terminal states', () => {
    const t = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('closed',    'critical', t)).toBeNull();
    expect(slaDeadlineFor('dismissed', 'low',      t)).toBeNull();
  });
  it('slaDeadlineFor adds correct offset for received', () => {
    const t = new Date('2026-05-28T00:00:00Z');
    const d = slaDeadlineFor('received', 'critical', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(4 * 60 * 60 * 1000);
  });
});

describe('disposition-chain-spec — council crossings', () => {
  it('close crosses for critical + high only', () => {
    expect(crossesIntoCouncil('close', 'critical')).toBe(true);
    expect(crossesIntoCouncil('close', 'high')).toBe(true);
    expect(crossesIntoCouncil('close', 'medium')).toBe(false);
    expect(crossesIntoCouncil('close', 'low')).toBe(false);
  });
  it('escalate crosses for critical + high only', () => {
    expect(crossesIntoCouncil('escalate', 'critical')).toBe(true);
    expect(crossesIntoCouncil('escalate', 'high')).toBe(true);
    expect(crossesIntoCouncil('escalate', 'medium')).toBe(false);
    expect(crossesIntoCouncil('escalate', 'low')).toBe(false);
  });
  it('dismiss / refer never cross', () => {
    const tiers: DispositionTier[] = ['critical', 'high', 'medium', 'low'];
    for (const t of tiers) {
      expect(crossesIntoCouncil('dismiss', t)).toBe(false);
      expect(crossesIntoCouncil('refer',   t)).toBe(false);
    }
  });
  it('sla_breached crosses for ALL tiers (Section 10 hard line)', () => {
    const tiers: DispositionTier[] = ['critical', 'high', 'medium', 'low'];
    for (const t of tiers) {
      expect(slaBreachCrossesIntoCouncil(t)).toBe(true);
    }
  });
  it('isReportable mirrors close/escalate reportability', () => {
    expect(isReportable('critical')).toBe(true);
    expect(isReportable('high')).toBe(true);
    expect(isReportable('medium')).toBe(false);
    expect(isReportable('low')).toBe(false);
  });
});
