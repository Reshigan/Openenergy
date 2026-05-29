import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isTerminal,
  isWithdrawable,
  allowedActions,
  TRANSITIONS,
  SLA_MINUTES,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForConnectionCapacity,
  isLargeTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isFacilityAction,
  eventForAction,
  EVENT_FOR_ACTION,
  type EnergizationStatus,
  type EnergizationAction,
  type EnergizationTier,
} from '../src/utils/connection-energization-spec';

const ALL_STATUSES: EnergizationStatus[] = [
  'connection_ready', 'program_review', 'program_approved', 'pre_energization_inspection',
  'energization_authorized', 'cold_commissioning', 'synchronized', 'trial_operation',
  'compliance_testing', 'commercial_operation', 'commissioning_suspended', 'connection_withdrawn',
];

const ALL_ACTIONS: EnergizationAction[] = [
  'submit_program', 'approve_program', 'conduct_inspection', 'authorize_energization',
  'begin_cold_commissioning', 'authorize_synchronization', 'begin_trial_operation',
  'begin_compliance_testing', 'issue_cod', 'suspend_commissioning', 'resume_commissioning',
  'withdraw_connection',
];

const TIERS: EnergizationTier[] = ['embedded', 'distribution', 'sub_transmission', 'transmission', 'bulk'];

describe('W75 connection-energization — state-machine shape', () => {
  it('has 12 statuses and 12 actions', () => {
    expect(ALL_STATUSES.length).toBe(12);
    expect(ALL_ACTIONS.length).toBe(12);
    expect(Object.keys(TRANSITIONS).length).toBe(12);
  });

  it('terminals are commercial_operation and connection_withdrawn only', () => {
    expect(isTerminal('commercial_operation')).toBe(true);
    expect(isTerminal('connection_withdrawn')).toBe(true);
    for (const s of ALL_STATUSES) {
      if (s !== 'commercial_operation' && s !== 'connection_withdrawn') {
        expect(isTerminal(s)).toBe(false);
      }
    }
  });

  it('every non-terminal status is withdrawable; terminals are not', () => {
    for (const s of ALL_STATUSES) {
      expect(isWithdrawable(s)).toBe(!isTerminal(s));
    }
  });
});

describe('W75 — happy-path forward sequence', () => {
  const path: Array<[EnergizationStatus, EnergizationAction, EnergizationStatus]> = [
    ['connection_ready', 'submit_program', 'program_review'],
    ['program_review', 'approve_program', 'program_approved'],
    ['program_approved', 'conduct_inspection', 'pre_energization_inspection'],
    ['pre_energization_inspection', 'authorize_energization', 'energization_authorized'],
    ['energization_authorized', 'begin_cold_commissioning', 'cold_commissioning'],
    ['cold_commissioning', 'authorize_synchronization', 'synchronized'],
    ['synchronized', 'begin_trial_operation', 'trial_operation'],
    ['trial_operation', 'begin_compliance_testing', 'compliance_testing'],
    ['compliance_testing', 'issue_cod', 'commercial_operation'],
  ];

  it('walks connection_ready → commercial_operation through every hold-point', () => {
    for (const [from, action, to] of path) {
      expect(nextStatus(from, action)).toBe(to);
    }
  });

  it('terminal commercial_operation accepts no further action', () => {
    for (const a of ALL_ACTIONS) {
      expect(nextStatus('commercial_operation', a)).toBeNull();
    }
  });
});

describe('W75 — suspend / resume hold-point loop', () => {
  it('suspend_commissioning is reachable from every witnessed hold-point stage', () => {
    const suspendable: EnergizationStatus[] = [
      'pre_energization_inspection', 'energization_authorized', 'cold_commissioning',
      'synchronized', 'trial_operation', 'compliance_testing',
    ];
    for (const s of suspendable) {
      expect(nextStatus(s, 'suspend_commissioning')).toBe('commissioning_suspended');
    }
  });

  it('cannot suspend from administrative stages (ready / review / approved)', () => {
    for (const s of ['connection_ready', 'program_review', 'program_approved'] as EnergizationStatus[]) {
      expect(nextStatus(s, 'suspend_commissioning')).toBeNull();
    }
  });

  it('resume_commissioning restarts the witnessed sequence from program_approved', () => {
    expect(nextStatus('commissioning_suspended', 'resume_commissioning')).toBe('program_approved');
  });
});

describe('W75 — withdrawal', () => {
  it('withdraw_connection is reachable from every non-terminal state', () => {
    for (const s of ALL_STATUSES) {
      if (!isTerminal(s)) {
        expect(nextStatus(s, 'withdraw_connection')).toBe('connection_withdrawn');
      }
    }
  });
});

describe('W75 — allowedActions', () => {
  it('connection_ready allows submit_program and withdraw_connection', () => {
    expect(allowedActions('connection_ready').sort()).toEqual(['submit_program', 'withdraw_connection'].sort());
  });

  it('compliance_testing allows issue_cod, suspend and withdraw', () => {
    expect(allowedActions('compliance_testing').sort()).toEqual(
      ['issue_cod', 'suspend_commissioning', 'withdraw_connection'].sort(),
    );
  });

  it('terminals allow nothing', () => {
    expect(allowedActions('commercial_operation')).toEqual([]);
    expect(allowedActions('connection_withdrawn')).toEqual([]);
  });
});

describe('W75 — tiering by connection capacity', () => {
  it('maps MW to the right voltage-class tier', () => {
    expect(tierForConnectionCapacity(0.5)).toBe('embedded');
    expect(tierForConnectionCapacity(5)).toBe('distribution');
    expect(tierForConnectionCapacity(30)).toBe('sub_transmission');
    expect(tierForConnectionCapacity(150)).toBe('transmission');
    expect(tierForConnectionCapacity(300)).toBe('bulk');
  });

  it('boundary values fall to the upper tier', () => {
    expect(tierForConnectionCapacity(1)).toBe('distribution');
    expect(tierForConnectionCapacity(10)).toBe('sub_transmission');
    expect(tierForConnectionCapacity(50)).toBe('transmission');
    expect(tierForConnectionCapacity(200)).toBe('bulk');
  });

  it('large tiers are transmission and bulk only', () => {
    expect(isLargeTier('transmission')).toBe(true);
    expect(isLargeTier('bulk')).toBe(true);
    expect(isLargeTier('embedded')).toBe(false);
    expect(isLargeTier('distribution')).toBe(false);
    expect(isLargeTier('sub_transmission')).toBe(false);
  });
});

describe('W75 — INVERTED SLA matrix', () => {
  it('every graded state is strictly increasing embedded → bulk', () => {
    for (const s of ALL_STATUSES) {
      if (isTerminal(s)) continue;
      const w = SLA_MINUTES[s];
      expect(w.embedded).toBeLessThan(w.distribution);
      expect(w.distribution).toBeLessThan(w.sub_transmission);
      expect(w.sub_transmission).toBeLessThan(w.transmission);
      expect(w.transmission).toBeLessThan(w.bulk);
    }
  });

  it('terminals carry no deadline', () => {
    for (const t of TIERS) {
      expect(slaWindowMinutes('commercial_operation', t)).toBe(0);
      expect(slaWindowMinutes('connection_withdrawn', t)).toBe(0);
    }
  });

  it('slaDeadlineFor returns null for terminals and a future date otherwise', () => {
    const now = new Date('2026-05-29T00:00:00Z');
    expect(slaDeadlineFor('commercial_operation', 'bulk', now)).toBeNull();
    const d = slaDeadlineFor('compliance_testing', 'bulk', now);
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('a bulk compliance-testing window is longer than an embedded one', () => {
    expect(slaWindowMinutes('compliance_testing', 'bulk'))
      .toBeGreaterThan(slaWindowMinutes('compliance_testing', 'embedded'));
  });
});

describe('W75 — reportability (COD-driven signature)', () => {
  it('issue_cod crosses into the regulator for EVERY tier', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('issue_cod', t)).toBe(true);
    }
  });

  it('authorize_energization crosses for large tiers only', () => {
    expect(crossesIntoRegulator('authorize_energization', 'transmission')).toBe(true);
    expect(crossesIntoRegulator('authorize_energization', 'bulk')).toBe(true);
    expect(crossesIntoRegulator('authorize_energization', 'embedded')).toBe(false);
    expect(crossesIntoRegulator('authorize_energization', 'distribution')).toBe(false);
    expect(crossesIntoRegulator('authorize_energization', 'sub_transmission')).toBe(false);
  });

  it('suspend_commissioning crosses for large tiers only', () => {
    expect(crossesIntoRegulator('suspend_commissioning', 'bulk')).toBe(true);
    expect(crossesIntoRegulator('suspend_commissioning', 'transmission')).toBe(true);
    expect(crossesIntoRegulator('suspend_commissioning', 'sub_transmission')).toBe(false);
  });

  it('routine machinery actions never cross', () => {
    for (const a of ['submit_program', 'approve_program', 'conduct_inspection',
      'begin_cold_commissioning', 'authorize_synchronization', 'begin_trial_operation',
      'begin_compliance_testing', 'resume_commissioning', 'withdraw_connection'] as EnergizationAction[]) {
      for (const t of TIERS) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla breach crosses for large tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('transmission')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('bulk')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('embedded')).toBe(false);
  });

  it('isReportable mirrors the large-tier set', () => {
    expect(isReportable('transmission')).toBe(true);
    expect(isReportable('bulk')).toBe(true);
    expect(isReportable('distribution')).toBe(false);
  });
});

describe('W75 — split-write party attribution', () => {
  it('facility performs programme submission, cold commissioning, trial op and withdrawal', () => {
    expect(partyForAction('submit_program')).toBe('facility');
    expect(partyForAction('begin_cold_commissioning')).toBe('facility');
    expect(partyForAction('begin_trial_operation')).toBe('facility');
    expect(partyForAction('withdraw_connection')).toBe('facility');
  });

  it('operator drives the witnessed hold-points, COD and suspend/resume', () => {
    for (const a of ['approve_program', 'conduct_inspection', 'authorize_energization',
      'authorize_synchronization', 'begin_compliance_testing', 'issue_cod',
      'suspend_commissioning', 'resume_commissioning'] as EnergizationAction[]) {
      expect(partyForAction(a)).toBe('operator');
    }
  });

  it('isFacilityAction agrees with partyForAction', () => {
    for (const a of ALL_ACTIONS) {
      expect(isFacilityAction(a)).toBe(partyForAction(a) === 'facility');
    }
  });
});

describe('W75 — event mapping', () => {
  it('maps each action to its cascade event', () => {
    expect(eventForAction('submit_program')).toBe('connection_energization.program_review');
    expect(eventForAction('issue_cod')).toBe('connection_energization.commercial_operation');
    expect(eventForAction('withdraw_connection')).toBe('connection_energization.connection_withdrawn');
  });

  it('resume_commissioning shares the program_approved event', () => {
    expect(eventForAction('resume_commissioning')).toBe('connection_energization.program_approved');
    expect(eventForAction('approve_program')).toBe('connection_energization.program_approved');
  });

  it('has an event for every action', () => {
    for (const a of ALL_ACTIONS) {
      expect(EVENT_FOR_ACTION[a]).toBeTruthy();
      expect(EVENT_FOR_ACTION[a].startsWith('connection_energization.')).toBe(true);
    }
  });
});
