import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  ACTION_PARTY,
  isTerminal,
  nextStatus,
  allowedActions,
  slaWindowMinutes,
  slaDeadlineFor,
  isLargeTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  isObligorAction,
  tierForTransferZarM,
  type LoanTransferStatus,
  type LoanTransferAction,
  type LoanTransferTier,
} from '../src/utils/loan-transfer-spec';

const ALL_TIERS: LoanTransferTier[] = [
  'minor', 'moderate', 'material', 'major', 'systemic',
];

describe('W61 loan-transfer / secondary-participation state machine', () => {
  it('walks the clean completed path transfer_requested → completed', () => {
    let s: LoanTransferStatus = 'transfer_requested';
    const path: LoanTransferAction[] = [
      'begin_screening', 'clear_screening', 'grant_consent',
      'approve_transfer', 'execute_certificate', 'settle', 'complete',
    ];
    const expected: LoanTransferStatus[] = [
      'kyc_screening', 'consent_solicitation', 'regulatory_review',
      'transfer_approved', 'certificate_executed', 'settled', 'completed',
    ];
    path.forEach((a, i) => {
      const n = nextStatus(s, a);
      expect(n).toBe(expected[i]);
      s = n!;
    });
    expect(isTerminal(s)).toBe(true);
  });

  it('KYC remediation loops kyc_screening → screening_remediation → kyc_screening', () => {
    expect(nextStatus('kyc_screening', 'request_remediation')).toBe('screening_remediation');
    expect(nextStatus('screening_remediation', 'resubmit_screening')).toBe('kyc_screening');
  });

  it('fail_screening rejects from kyc_screening (sanctions / AML hit)', () => {
    expect(nextStatus('kyc_screening', 'fail_screening')).toBe('rejected');
    expect(nextStatus('screening_remediation', 'fail_screening')).toBeNull();
    expect(isTerminal('rejected')).toBe(true);
  });

  it('refuse_consent declines from consent_solicitation (obligor)', () => {
    expect(nextStatus('consent_solicitation', 'refuse_consent')).toBe('declined');
    expect(nextStatus('consent_solicitation', 'grant_consent')).toBe('regulatory_review');
    expect(isTerminal('declined')).toBe(true);
  });

  it('withdraw terminates from any pre-completion operative state', () => {
    (['transfer_requested', 'kyc_screening', 'screening_remediation', 'consent_solicitation', 'regulatory_review', 'transfer_approved'] as LoanTransferStatus[]).forEach((s) => {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    });
    // not available after the certificate is executed / settled
    expect(nextStatus('certificate_executed', 'withdraw')).toBeNull();
    expect(nextStatus('settled', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(nextStatus('transfer_requested', 'approve_transfer')).toBeNull();
    expect(nextStatus('consent_solicitation', 'execute_certificate')).toBeNull();
    expect(nextStatus('regulatory_review', 'settle')).toBeNull();
    expect(nextStatus('kyc_screening', 'grant_consent')).toBeNull();
  });

  it('terminals allow no further action', () => {
    (['completed', 'declined', 'rejected', 'withdrawn'] as LoanTransferStatus[]).forEach((t) => {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      Object.keys(TRANSITIONS).forEach((a) => {
        expect(nextStatus(t, a as LoanTransferAction)).toBeNull();
      });
    });
  });

  it('allowedActions reflects the branch fan-out', () => {
    expect(allowedActions('kyc_screening').sort()).toEqual(
      ['request_remediation', 'fail_screening', 'clear_screening', 'withdraw'].sort(),
    );
    expect(allowedActions('consent_solicitation').sort()).toEqual(
      ['refuse_consent', 'grant_consent', 'withdraw'].sort(),
    );
    expect(allowedActions('regulatory_review').sort()).toEqual(
      ['approve_transfer', 'withdraw'].sort(),
    );
    expect(allowedActions('settled')).toEqual(['complete']);
  });
});

describe('W61 INVERTED SLA by transfer size', () => {
  it('larger transfer = longer window (strictly increasing) across operative states', () => {
    ([
      'transfer_requested', 'kyc_screening', 'screening_remediation',
      'consent_solicitation', 'regulatory_review', 'transfer_approved',
      'certificate_executed', 'settled',
    ] as LoanTransferStatus[]).forEach((s) => {
      const mins = ALL_TIERS.map((t) => slaWindowMinutes(s, t));
      for (let i = 1; i < mins.length; i++) {
        expect(mins[i]).toBeGreaterThan(mins[i - 1]);
      }
    });
  });

  it('regulatory_review carries the deepest scrutiny windows', () => {
    // SARB exchange-control + large-exposure review is the longest pipeline gate
    expect(slaWindowMinutes('regulatory_review', 'systemic')).toBeGreaterThan(
      slaWindowMinutes('kyc_screening', 'systemic'),
    );
  });

  it('terminals carry no SLA deadline', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    (['completed', 'declined', 'rejected', 'withdrawn'] as LoanTransferStatus[]).forEach((t) => {
      ALL_TIERS.forEach((tier) => expect(slaWindowMinutes(t, tier)).toBe(0));
      expect(slaDeadlineFor(t, 'systemic', now)).toBeNull();
    });
  });

  it('slaDeadlineFor computes the deadline for operative states', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    // settled / minor = 1440 minutes = 24h
    expect(slaDeadlineFor('settled', 'minor', now))
      .toEqual(new Date('2026-05-29T00:00:00Z'));
  });
});

describe('W61 reportability crossings (residency-driven signature)', () => {
  it('approve_transfer to a NON-RESIDENT transferee crosses for EVERY tier', () => {
    ALL_TIERS.forEach((t) => {
      expect(crossesIntoRegulator('approve_transfer', t, 'non_resident')).toBe(true);
    });
  });

  it('approve_transfer to a RESIDENT transferee never crosses on the approval itself', () => {
    ALL_TIERS.forEach((t) => {
      expect(crossesIntoRegulator('approve_transfer', t, 'resident')).toBe(false);
    });
  });

  it('fail_screening crosses for EVERY tier and residency (FIC sanctions/AML)', () => {
    ALL_TIERS.forEach((t) => {
      expect(crossesIntoRegulator('fail_screening', t, 'resident')).toBe(true);
      expect(crossesIntoRegulator('fail_screening', t, 'non_resident')).toBe(true);
    });
  });

  it('complete crosses for large tiers only (Banks Act large-exposure re-aggregation)', () => {
    expect(crossesIntoRegulator('complete', 'systemic', 'resident')).toBe(true);
    expect(crossesIntoRegulator('complete', 'major', 'resident')).toBe(true);
    expect(crossesIntoRegulator('complete', 'material', 'resident')).toBe(false);
    expect(crossesIntoRegulator('complete', 'moderate', 'resident')).toBe(false);
    expect(crossesIntoRegulator('complete', 'minor', 'resident')).toBe(false);
  });

  it('routine actions never cross', () => {
    (['begin_screening', 'request_remediation', 'resubmit_screening', 'clear_screening', 'grant_consent', 'execute_certificate', 'settle', 'withdraw'] as LoanTransferAction[]).forEach((a) => {
      ALL_TIERS.forEach((t) => {
        expect(crossesIntoRegulator(a, t, 'resident')).toBe(false);
        expect(crossesIntoRegulator(a, t, 'non_resident')).toBe(false);
      });
    });
  });

  it('sla_breach crosses for large tiers; isReportable tracks residency OR large', () => {
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    // reportable on residency alone, even for a small transfer
    expect(isReportable('minor', 'non_resident')).toBe(true);
    // reportable on size alone, even for a resident transfer
    expect(isReportable('major', 'resident')).toBe(true);
    // small resident transfer is not reportable
    expect(isReportable('minor', 'resident')).toBe(false);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('material')).toBe(false);
  });
});

describe('W61 two-party split-write attribution', () => {
  it('the obligor (borrower) consents to or refuses the transfer', () => {
    expect(partyForAction('grant_consent')).toBe('obligor');
    expect(partyForAction('refuse_consent')).toBe('obligor');
    expect(isObligorAction('grant_consent')).toBe(true);
    expect(isObligorAction('refuse_consent')).toBe(true);
    expect(isObligorAction('approve_transfer')).toBe(false);
    expect(isObligorAction('begin_screening')).toBe(false);
  });

  it('the facility agent drives the administration machinery', () => {
    (['begin_screening', 'request_remediation', 'fail_screening', 'clear_screening', 'approve_transfer', 'execute_certificate', 'complete'] as LoanTransferAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('agent');
    });
  });

  it('the transferor initiates remediation resubmission, settlement and withdrawal', () => {
    (['resubmit_screening', 'settle', 'withdraw'] as LoanTransferAction[]).forEach((a) => {
      expect(partyForAction(a)).toBe('transferor');
    });
  });

  it('every action has a party', () => {
    (Object.keys(TRANSITIONS) as LoanTransferAction[]).forEach((a) => {
      expect(ACTION_PARTY[a]).toBeDefined();
    });
  });
});

describe('W61 tier classification by transfer size', () => {
  it('buckets transferred participation (ZAR m) into the right tier', () => {
    expect(tierForTransferZarM(0)).toBe('minor');
    expect(tierForTransferZarM(99.99)).toBe('minor');
    expect(tierForTransferZarM(100)).toBe('moderate');
    expect(tierForTransferZarM(500)).toBe('material');
    expect(tierForTransferZarM(2000)).toBe('major');
    expect(tierForTransferZarM(10000)).toBe('systemic');
    expect(tierForTransferZarM(50000)).toBe('systemic');
  });
});
