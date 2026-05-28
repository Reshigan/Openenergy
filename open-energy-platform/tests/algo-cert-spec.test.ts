import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  ACTION_PARTY,
  isTerminal,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  isHighTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isFirmAction,
  isAuthorityAction,
  tierForNotionalZarM,
  type AlgoCertStatus,
  type AlgoCertAction,
  type AlgoTier,
} from '../src/utils/algo-cert-spec';

const ALL_TIERS: AlgoTier[] = [
  'limited', 'standard', 'significant', 'high_impact', 'systemic',
];

describe('W60 algo/DEA certification state machine', () => {
  it('walks the clean go-live path registration → deployed', () => {
    let s: AlgoCertStatus = 'registration_submitted';
    const path: AlgoCertAction[] = [
      'begin_review', 'start_conformance', 'validate_controls',
      'submit_certification', 'grant_certification', 'deploy',
    ];
    const expected: AlgoCertStatus[] = [
      'documentation_review', 'conformance_testing', 'risk_controls_validation',
      'certification_review', 'certified', 'deployed',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(false); // deployed is the live steady state, not terminal
  });

  it('recertification loops deployed → recertification_review → deployed', () => {
    expect(nextStatus('deployed', 'trigger_recertification')).toBe('recertification_review');
    expect(nextStatus('recertification_review', 'complete_recertification')).toBe('deployed');
  });

  it('kill-switch suspends a live system and reinstate returns it', () => {
    expect(nextStatus('deployed', 'invoke_kill_switch')).toBe('suspended');
    expect(nextStatus('suspended', 'reinstate')).toBe('deployed');
    // kill-switch only applies to a live system
    expect(nextStatus('certified', 'invoke_kill_switch')).toBeNull();
    expect(nextStatus('certification_review', 'invoke_kill_switch')).toBeNull();
  });

  it('deploy, complete_recertification and reinstate all converge on deployed', () => {
    expect(nextStatus('certified', 'deploy')).toBe('deployed');
    expect(nextStatus('recertification_review', 'complete_recertification')).toBe('deployed');
    expect(nextStatus('suspended', 'reinstate')).toBe('deployed');
  });

  it('remediation loop sends failed gates back to documentation_review', () => {
    (['documentation_review', 'conformance_testing', 'risk_controls_validation', 'certification_review', 'recertification_review'] as AlgoCertStatus[]).forEach((s) => {
      expect(nextStatus(s, 'require_remediation')).toBe('remediation_required');
    });
    expect(nextStatus('remediation_required', 'resubmit')).toBe('documentation_review');
  });

  it('begin_review and resubmit share the documentation_review destination', () => {
    expect(nextStatus('registration_submitted', 'begin_review')).toBe('documentation_review');
    expect(nextStatus('remediation_required', 'resubmit')).toBe('documentation_review');
  });

  it('reject_certification terminates from the review states', () => {
    expect(nextStatus('documentation_review', 'reject_certification')).toBe('rejected');
    expect(nextStatus('certification_review', 'reject_certification')).toBe('rejected');
    expect(nextStatus('recertification_review', 'reject_certification')).toBe('rejected');
    expect(nextStatus('conformance_testing', 'reject_certification')).toBeNull();
    expect(isTerminal('rejected')).toBe(true);
  });

  it('decommission retires the system from its post-approval states', () => {
    (['certified', 'deployed', 'suspended', 'remediation_required'] as AlgoCertStatus[]).forEach((s) => {
      expect(nextStatus(s, 'decommission')).toBe('decommissioned');
    });
    expect(nextStatus('documentation_review', 'decommission')).toBeNull();
    expect(isTerminal('decommissioned')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('registration_submitted', 'deploy')).toBeNull();
    expect(nextStatus('certified', 'grant_certification')).toBeNull();
    expect(nextStatus('deployed', 'deploy')).toBeNull();
    expect(nextStatus('conformance_testing', 'submit_certification')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['rejected', 'decommissioned'] as AlgoCertStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as AlgoCertAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('documentation_review').sort()).toEqual(
      ['start_conformance', 'require_remediation', 'reject_certification'].sort(),
    );
    expect(allowedActions('deployed').sort()).toEqual(
      ['trigger_recertification', 'invoke_kill_switch', 'decommission'].sort(),
    );
    expect(allowedActions('suspended').sort()).toEqual(
      ['reinstate', 'decommission'].sort(),
    );
    expect(allowedActions('certification_review').sort()).toEqual(
      ['grant_certification', 'require_remediation', 'reject_certification'].sort(),
    );
  });
});

describe('W60 INVERTED SLA by authorised footprint', () => {
  it('larger footprint = longer window (strictly increasing) across pipeline states', () => {
    ([
      'registration_submitted', 'documentation_review', 'conformance_testing',
      'risk_controls_validation', 'certification_review', 'certified',
      'recertification_review', 'remediation_required',
    ] as AlgoCertStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeGreaterThan(mins[i - 1]);
      }
    });
  });

  it('suspended is flat and tight across tiers (a live-system incident)', () => {
    const mins = ALL_TIERS.map((t) => slaWindowMinutes('suspended', t));
    expect(new Set(mins).size).toBe(1);
    expect(mins[0]).toBe(720);
  });

  it('deployed carries no SLA deadline (live steady state)', () => {
    ALL_TIERS.forEach((t) => expect(slaWindowMinutes('deployed', t)).toBe(0));
  });

  it('slaDeadlineFor is null for terminals and zero-window states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('rejected', 'systemic', now)).toBeNull();
    expect(slaDeadlineFor('decommissioned', 'systemic', now)).toBeNull();
    expect(slaDeadlineFor('deployed', 'systemic', now)).toBeNull();
    expect(slaDeadlineFor('suspended', 'limited', now))
      .toEqual(new Date('2026-05-28T12:00:00Z'));
  });
});

describe('W60 reportability crossings', () => {
  it('invoke_kill_switch crosses for EVERY tier (the kill-switch signature)', () => {
    ALL_TIERS.forEach((t) => expect(crossesIntoRegulator('invoke_kill_switch', t)).toBe(true));
  });

  it('reject_certification crosses for high tiers only', () => {
    expect(crossesIntoRegulator('reject_certification', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('reject_certification', 'high_impact')).toBe(true);
    expect(crossesIntoRegulator('reject_certification', 'significant')).toBe(false);
    expect(crossesIntoRegulator('reject_certification', 'standard')).toBe(false);
    expect(crossesIntoRegulator('reject_certification', 'limited')).toBe(false);
  });

  it('routine lifecycle actions never cross', () => {
    (['begin_review', 'start_conformance', 'validate_controls', 'submit_certification', 'grant_certification', 'deploy', 'reinstate', 'decommission'] as AlgoCertAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla_breach + isReportable track high tiers', () => {
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('high_impact')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('significant')).toBe(false);
    expect(isReportable('systemic')).toBe(true);
    expect(isReportable('standard')).toBe(false);
    expect(isHighTier('high_impact')).toBe(true);
    expect(isHighTier('significant')).toBe(false);
  });
});

describe('W60 two-party split-write attribution', () => {
  it('the trading firm owns the system-lifecycle endpoints', () => {
    (['submit_certification', 'deploy', 'resubmit', 'decommission'] as AlgoCertAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('trading_firm');
    });
    // firm-gated actions exclude the emergency kill-switch
    expect(isFirmAction('deploy')).toBe(true);
    expect(isFirmAction('resubmit')).toBe(true);
    expect(isFirmAction('decommission')).toBe(true);
    expect(isFirmAction('submit_certification')).toBe(true);
    expect(isFirmAction('invoke_kill_switch')).toBe(false);
  });

  it('the exchange authority drives the gating machinery', () => {
    (['begin_review', 'start_conformance', 'validate_controls', 'grant_certification', 'trigger_recertification', 'complete_recertification', 'reinstate', 'require_remediation', 'reject_certification'] as AlgoCertAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('exchange_authority');
      expect(isAuthorityAction(a)).toBe(true);
    });
  });

  it('invoke_kill_switch is firm-attributed but neither exclusively firm- nor authority-gated', () => {
    expect(partyForAction('invoke_kill_switch')).toBe('trading_firm');
    expect(isFirmAction('invoke_kill_switch')).toBe(false);
    expect(isAuthorityAction('invoke_kill_switch')).toBe(false);
  });

  it('every action has a party', () => {
    (Object.keys(TRANSITIONS) as AlgoCertAction[]).forEach((a) => {
      expect(ACTION_PARTY[a]).toBeDefined();
    });
  });
});

describe('W60 tier classification by authorised notional', () => {
  it('buckets authorised notional (ZAR m) into the right tier', () => {
    expect(tierForNotionalZarM(0)).toBe('limited');
    expect(tierForNotionalZarM(9.99)).toBe('limited');
    expect(tierForNotionalZarM(10)).toBe('standard');
    expect(tierForNotionalZarM(50)).toBe('significant');
    expect(tierForNotionalZarM(250)).toBe('high_impact');
    expect(tierForNotionalZarM(1000)).toBe('systemic');
    expect(tierForNotionalZarM(5000)).toBe('systemic');
  });
});
