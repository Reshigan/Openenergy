import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  ACTION_PARTY,
  isTerminal,
  isDismissable,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  isSeriousTier,
  isCriticalTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isRegulatorAction,
  tierForRiskScore,
  type MarketAbuseStatus,
  type MarketAbuseAction,
  type AbuseTier,
} from '../src/utils/market-abuse-spec';

const ALL_TIERS: AbuseTier[] = [
  'info_alert', 'low_risk', 'medium_risk', 'high_risk', 'critical_abuse',
];

describe('W52 market-abuse surveillance state machine', () => {
  it('walks the clean path alert → cleared', () => {
    let s: MarketAbuseStatus = 'alert_raised';
    const path: MarketAbuseAction[] = [
      'triage', 'open_investigation', 'compile_evidence', 'complete_analysis', 'clear',
    ];
    const expected: MarketAbuseStatus[] = [
      'triaged', 'under_investigation', 'evidence_review', 'analysis_complete', 'cleared',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('escalation path: analysis → STOR → referral → enforcement → sanctioned', () => {
    expect(nextStatus('analysis_complete', 'file_stor')).toBe('stor_filed');
    expect(nextStatus('stor_filed', 'refer_regulator')).toBe('regulator_referred');
    expect(nextStatus('regulator_referred', 'commence_enforcement')).toBe('enforcement_action');
    expect(nextStatus('enforcement_action', 'sanction')).toBe('sanctioned');
    expect(isTerminal('sanctioned')).toBe(true);
  });

  it('dismiss is an early exit that shares the cleared terminal', () => {
    expect(nextStatus('alert_raised', 'dismiss')).toBe('cleared');
    expect(nextStatus('triaged', 'dismiss')).toBe('cleared');
    expect(nextStatus('under_investigation', 'dismiss')).toBeNull();
    expect(nextStatus('analysis_complete', 'dismiss')).toBeNull();
  });

  it('dismissable states match the pre-investigation set', () => {
    expect(isDismissable('alert_raised')).toBe(true);
    expect(isDismissable('triaged')).toBe(true);
    expect(isDismissable('under_investigation')).toBe(false);
    expect(isDismissable('cleared')).toBe(false);
  });

  it('dispute branch resolves to a terminal from all escalation states', () => {
    expect(nextStatus('analysis_complete', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('stor_filed', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('regulator_referred', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('enforcement_action', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('dispute_resolved');
    expect(isTerminal('dispute_resolved')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('alert_raised', 'file_stor')).toBeNull();
    expect(nextStatus('triaged', 'sanction')).toBeNull();
    expect(nextStatus('stor_filed', 'clear')).toBeNull();
    expect(nextStatus('under_investigation', 'raise_dispute')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['cleared', 'sanctioned', 'dispute_resolved'] as MarketAbuseStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as MarketAbuseAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('alert_raised').sort()).toEqual(['dismiss', 'triage'].sort());
    expect(allowedActions('triaged').sort()).toEqual(['dismiss', 'open_investigation'].sort());
    expect(allowedActions('analysis_complete').sort()).toEqual(
      ['clear', 'file_stor', 'raise_dispute'].sort(),
    );
  });
});

describe('W52 URGENT SLA by abuse tier', () => {
  it('more severe typology = tighter window (strictly decreasing)', () => {
    ([
      'alert_raised', 'triaged', 'under_investigation', 'evidence_review',
      'analysis_complete', 'stor_filed', 'regulator_referred', 'enforcement_action',
    ] as MarketAbuseStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeLessThan(mins[i - 1]);
      }
    });
  });

  it('critical abuse must be triaged in 2 hours', () => {
    expect(slaWindowMinutes('alert_raised', 'critical_abuse')).toBe(120);
    expect(slaWindowMinutes('alert_raised', 'info_alert')).toBe(1440);
  });

  it('dispute phase is flat across tiers', () => {
    const mins = ALL_TIERS.map((t) => slaWindowMinutes('disputed', t));
    expect(new Set(mins).size).toBe(1);
  });

  it('slaDeadlineFor is null for terminals and zero-window states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    expect(slaDeadlineFor('cleared', 'critical_abuse', now)).toBeNull();
    expect(slaDeadlineFor('alert_raised', 'critical_abuse', now))
      .toEqual(new Date('2026-05-28T02:00:00Z'));
  });
});

describe('W52 reportability crossings', () => {
  it('file_stor crosses for EVERY tier (the STOR signature)', () => {
    ALL_TIERS.forEach((t) => expect(crossesIntoRegulator('file_stor', t)).toBe(true));
  });

  it('sanction crosses for critical tiers only', () => {
    expect(crossesIntoRegulator('sanction', 'critical_abuse')).toBe(true);
    expect(crossesIntoRegulator('sanction', 'high_risk')).toBe(true);
    expect(crossesIntoRegulator('sanction', 'medium_risk')).toBe(false);
    expect(crossesIntoRegulator('sanction', 'low_risk')).toBe(false);
  });

  it('routine actions never cross', () => {
    (['triage', 'open_investigation', 'compile_evidence', 'clear', 'dismiss'] as MarketAbuseAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => expect(crossesIntoRegulator(a, t)).toBe(false));
    });
  });

  it('sla_breach + isReportable track critical tiers', () => {
    expect(slaBreachCrossesIntoRegulator('critical_abuse')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('high_risk')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium_risk')).toBe(false);
    expect(isReportable('critical_abuse')).toBe(true);
    expect(isReportable('low_risk')).toBe(false);
  });

  it('tier sets are consistent', () => {
    expect(isSeriousTier('medium_risk')).toBe(true);
    expect(isCriticalTier('medium_risk')).toBe(false);
    expect(isSeriousTier('low_risk')).toBe(false);
    expect(isCriticalTier('high_risk')).toBe(true);
  });
});

describe('W52 single-party write attribution', () => {
  it('regulator drives referral / enforcement / sanction / resolve', () => {
    (['refer_regulator', 'commence_enforcement', 'sanction', 'resolve_dispute'] as MarketAbuseAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('regulator');
      expect(isRegulatorAction(a)).toBe(true);
    });
  });

  it('the subject only raises a dispute', () => {
    expect(partyForAction('raise_dispute')).toBe('subject');
    expect(isRegulatorAction('raise_dispute')).toBe(false);
  });

  it('surveillance drives the investigation phases', () => {
    (['triage', 'open_investigation', 'compile_evidence', 'complete_analysis', 'clear', 'dismiss', 'file_stor'] as MarketAbuseAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('surveillance');
    });
  });

  it('every action has a party', () => {
    (Object.keys(TRANSITIONS) as MarketAbuseAction[]).forEach((a) => {
      expect(ACTION_PARTY[a]).toBeDefined();
    });
  });
});

describe('W52 tier classification by risk score', () => {
  it('buckets surveillance risk scores into the right tier', () => {
    expect(tierForRiskScore(0)).toBe('info_alert');
    expect(tierForRiskScore(19)).toBe('info_alert');
    expect(tierForRiskScore(20)).toBe('low_risk');
    expect(tierForRiskScore(40)).toBe('medium_risk');
    expect(tierForRiskScore(60)).toBe('high_risk');
    expect(tierForRiskScore(85)).toBe('critical_abuse');
    expect(tierForRiskScore(100)).toBe('critical_abuse');
  });
});
