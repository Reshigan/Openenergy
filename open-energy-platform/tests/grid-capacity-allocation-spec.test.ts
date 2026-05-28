import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  isWithdrawable,
  nextStatus,
  allowedActions,
  slaDeadlineFor,
  slaWindowMinutes,
  SLA_MINUTES,
  tierForCapacityMw,
  isLargeTier,
  mandatorySystemImpactStudy,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  isApplicantAction,
  type GridCapacityStatus,
  type GridCapacityAction,
  type GridCapacityTier,
} from '../src/utils/grid-capacity-allocation-spec';

const ALL_STATUSES: GridCapacityStatus[] = [
  'application_received', 'completeness_screening', 'information_requested',
  'capacity_assessment', 'queue_positioned', 'offer_issued', 'capacity_reserved',
  'capacity_allocated', 'rejected', 'lapsed', 'relinquished', 'withdrawn',
];
const TIERS: GridCapacityTier[] = ['minor', 'small', 'medium', 'large', 'strategic'];
const TERMINAL_STATES: GridCapacityStatus[] = ['capacity_allocated', 'rejected', 'lapsed', 'relinquished', 'withdrawn'];

describe('W58 grid-capacity — terminals', () => {
  it('exactly five terminal states', () => {
    const terminals = ALL_STATUSES.filter(isTerminal);
    expect(terminals.sort()).toEqual([...TERMINAL_STATES].sort());
  });

  it('no action escapes a terminal', () => {
    for (const t of TERMINAL_STATES) {
      for (const a of Object.keys(TRANSITIONS) as GridCapacityAction[]) {
        expect(nextStatus(t, a)).toBeNull();
      }
    }
  });
});

describe('W58 grid-capacity — happy path', () => {
  it('walks application_received → capacity_allocated through every gate', () => {
    let s: GridCapacityStatus = 'application_received';
    const path: [GridCapacityAction, GridCapacityStatus][] = [
      ['begin_screening', 'completeness_screening'],
      ['begin_assessment', 'capacity_assessment'],
      ['assign_queue_position', 'queue_positioned'],
      ['issue_offer', 'offer_issued'],
      ['accept_offer', 'capacity_reserved'],
      ['allocate_capacity', 'capacity_allocated'],
    ];
    for (const [a, expected] of path) {
      const to = nextStatus(s, a);
      expect(to).toBe(expected);
      s = to!;
    }
    expect(isTerminal(s)).toBe(true);
  });
});

describe('W58 grid-capacity — information-gap loop', () => {
  it('request_info then submit_info round-trips back to completeness_screening', () => {
    expect(nextStatus('completeness_screening', 'request_info')).toBe('information_requested');
    expect(nextStatus('information_requested', 'submit_info')).toBe('completeness_screening');
  });

  it('request_info only from completeness_screening', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'request_info');
      if (s === 'completeness_screening') expect(r).toBe('information_requested');
      else expect(r).toBeNull();
    }
  });
});

describe('W58 grid-capacity — rejection (the W58 signature gate)', () => {
  it('reject only from capacity_assessment or queue_positioned', () => {
    const allowed = new Set<GridCapacityStatus>(['capacity_assessment', 'queue_positioned']);
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'reject_application');
      if (allowed.has(s)) expect(r).toBe('rejected');
      else expect(r).toBeNull();
    }
  });
});

describe('W58 grid-capacity — lapse', () => {
  it('lapse only from offer_issued or capacity_reserved', () => {
    const allowed = new Set<GridCapacityStatus>(['offer_issued', 'capacity_reserved']);
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'lapse');
      if (allowed.has(s)) expect(r).toBe('lapsed');
      else expect(r).toBeNull();
    }
  });
});

describe('W58 grid-capacity — relinquishment', () => {
  it('relinquish only from capacity_reserved (before firm allocation)', () => {
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'relinquish');
      if (s === 'capacity_reserved') expect(r).toBe('relinquished');
      else expect(r).toBeNull();
    }
  });

  it('capacity_reserved can allocate, lapse OR relinquish; capacity_allocated is a terminal', () => {
    expect(nextStatus('capacity_reserved', 'allocate_capacity')).toBe('capacity_allocated');
    expect(nextStatus('capacity_reserved', 'lapse')).toBe('lapsed');
    expect(nextStatus('capacity_reserved', 'relinquish')).toBe('relinquished');
    expect(isTerminal('capacity_allocated')).toBe(true);
    expect(allowedActions('capacity_allocated')).toEqual([]);
  });
});

describe('W58 grid-capacity — withdraw', () => {
  it('withdraw allowed from the six pre-reservation states only', () => {
    const allowed = new Set<GridCapacityStatus>([
      'application_received', 'completeness_screening', 'information_requested',
      'capacity_assessment', 'queue_positioned', 'offer_issued',
    ]);
    for (const s of ALL_STATUSES) {
      const r = nextStatus(s, 'withdraw');
      if (allowed.has(s)) expect(r).toBe('withdrawn');
      else expect(r).toBeNull();
    }
  });

  it('isWithdrawable matches the withdraw transition set', () => {
    for (const s of ALL_STATUSES) {
      expect(isWithdrawable(s)).toBe(nextStatus(s, 'withdraw') === 'withdrawn');
    }
  });

  it('cannot withdraw once capacity is reserved or allocated (relinquish instead)', () => {
    expect(nextStatus('capacity_reserved', 'withdraw')).toBeNull();
    expect(nextStatus('capacity_allocated', 'withdraw')).toBeNull();
  });
});

describe('W58 grid-capacity — allowedActions', () => {
  it('capacity_assessment offers assign_queue_position, reject, withdraw', () => {
    expect(allowedActions('capacity_assessment').sort()).toEqual(
      ['assign_queue_position', 'reject_application', 'withdraw'].sort(),
    );
  });

  it('queue_positioned offers issue_offer, reject, withdraw', () => {
    expect(allowedActions('queue_positioned').sort()).toEqual(
      ['issue_offer', 'reject_application', 'withdraw'].sort(),
    );
  });

  it('offer_issued offers accept_offer, lapse, withdraw', () => {
    expect(allowedActions('offer_issued').sort()).toEqual(
      ['accept_offer', 'lapse', 'withdraw'].sort(),
    );
  });

  it('capacity_reserved offers allocate_capacity, lapse, relinquish', () => {
    expect(allowedActions('capacity_reserved').sort()).toEqual(
      ['allocate_capacity', 'lapse', 'relinquish'].sort(),
    );
  });

  it('terminals offer nothing', () => {
    for (const t of TERMINAL_STATES) {
      expect(allowedActions(t)).toEqual([]);
    }
  });
});

describe('W58 grid-capacity — capacity tiers', () => {
  it('classifies by MW thresholds', () => {
    expect(tierForCapacityMw(5)).toBe('minor');
    expect(tierForCapacityMw(9.9)).toBe('minor');
    expect(tierForCapacityMw(10)).toBe('small');
    expect(tierForCapacityMw(49.9)).toBe('small');
    expect(tierForCapacityMw(50)).toBe('medium');
    expect(tierForCapacityMw(99.9)).toBe('medium');
    expect(tierForCapacityMw(100)).toBe('large');
    expect(tierForCapacityMw(249.9)).toBe('large');
    expect(tierForCapacityMw(250)).toBe('strategic');
    expect(tierForCapacityMw(1200)).toBe('strategic');
  });
});

describe('W58 grid-capacity — INVERTED SLA', () => {
  it('strategic ≥ large ≥ medium ≥ small ≥ minor for every non-terminal window', () => {
    for (const s of ALL_STATUSES) {
      if (isTerminal(s)) continue;
      const st = SLA_MINUTES[s].strategic;
      const l = SLA_MINUTES[s].large;
      const m = SLA_MINUTES[s].medium;
      const sm = SLA_MINUTES[s].small;
      const mi = SLA_MINUTES[s].minor;
      expect(st).toBeGreaterThanOrEqual(l);
      expect(l).toBeGreaterThanOrEqual(m);
      expect(m).toBeGreaterThanOrEqual(sm);
      expect(sm).toBeGreaterThanOrEqual(mi);
      expect(mi).toBeGreaterThan(0);
    }
  });

  it('terminal windows are zero', () => {
    for (const t of TERMINAL_STATES) {
      for (const k of TIERS) expect(slaWindowMinutes(t, k)).toBe(0);
    }
  });

  it('slaDeadlineFor adds the window minutes; null for terminals', () => {
    const base = new Date('2026-05-01T00:00:00Z');
    const d = slaDeadlineFor('capacity_assessment', 'strategic', base);
    expect(d!.getTime() - base.getTime()).toBe(75 * 24 * 60 * 60000);
    expect(slaDeadlineFor('capacity_allocated', 'strategic', base)).toBeNull();
  });
});

describe('W58 grid-capacity — reportability', () => {
  it('reject_application crosses for EVERY tier (universal — the W58 signature)', () => {
    for (const k of TIERS) expect(crossesIntoRegulator('reject_application', k)).toBe(true);
  });

  it('relinquish crosses for large + strategic only', () => {
    expect(crossesIntoRegulator('relinquish', 'minor')).toBe(false);
    expect(crossesIntoRegulator('relinquish', 'small')).toBe(false);
    expect(crossesIntoRegulator('relinquish', 'medium')).toBe(false);
    expect(crossesIntoRegulator('relinquish', 'large')).toBe(true);
    expect(crossesIntoRegulator('relinquish', 'strategic')).toBe(true);
  });

  it('routine actions never cross', () => {
    for (const a of ['begin_screening', 'request_info', 'submit_info', 'begin_assessment', 'assign_queue_position', 'issue_offer', 'accept_offer', 'allocate_capacity', 'lapse', 'withdraw'] as GridCapacityAction[]) {
      for (const k of TIERS) expect(crossesIntoRegulator(a, k)).toBe(false);
    }
  });

  it('SLA breach crosses for large + strategic only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('strategic')).toBe(true);
  });

  it('isLargeTier = large or strategic', () => {
    expect(isLargeTier('large')).toBe(true);
    expect(isLargeTier('strategic')).toBe(true);
    expect(isLargeTier('medium')).toBe(false);
  });
});

describe('W58 grid-capacity — system-impact study', () => {
  it('mandatory for large + strategic, headroom check below', () => {
    expect(mandatorySystemImpactStudy('strategic')).toBe(true);
    expect(mandatorySystemImpactStudy('large')).toBe(true);
    expect(mandatorySystemImpactStudy('medium')).toBe(false);
    expect(mandatorySystemImpactStudy('small')).toBe(false);
    expect(mandatorySystemImpactStudy('minor')).toBe(false);
  });
});

describe('W58 grid-capacity — actor party + write split', () => {
  it('committee issues offers, allocates, rejects', () => {
    expect(partyForAction('issue_offer')).toBe('committee');
    expect(partyForAction('allocate_capacity')).toBe('committee');
    expect(partyForAction('reject_application')).toBe('committee');
  });

  it('network runs screening, assessment, queueing, lapse', () => {
    for (const a of ['begin_screening', 'request_info', 'begin_assessment', 'assign_queue_position', 'lapse'] as GridCapacityAction[]) {
      expect(partyForAction(a)).toBe('network');
    }
  });

  it('applicant supplies info, accepts offers, relinquishes, withdraws', () => {
    expect(partyForAction('submit_info')).toBe('applicant');
    expect(partyForAction('accept_offer')).toBe('applicant');
    expect(partyForAction('relinquish')).toBe('applicant');
    expect(partyForAction('withdraw')).toBe('applicant');
  });

  it('isApplicantAction marks exactly submit_info + accept_offer + relinquish + withdraw', () => {
    for (const a of Object.keys(TRANSITIONS) as GridCapacityAction[]) {
      const expected = a === 'submit_info' || a === 'accept_offer' || a === 'relinquish' || a === 'withdraw';
      expect(isApplicantAction(a)).toBe(expected);
    }
  });
});
