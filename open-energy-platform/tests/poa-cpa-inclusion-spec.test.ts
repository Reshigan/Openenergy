import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  isWithdrawable,
  nextStatus,
  allowedActions,
  TRANSITIONS,
  SLA_MINUTES,
  slaWindowMinutes,
  slaDeadlineFor,
  requiresCorrespondingAdjustment,
  isLargeTier,
  baseTierForAnnualEr,
  tierForAnnualEr,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eligibilityScore,
  predictedInclusionDays,
  programmeHeadroomTco2e,
  exceedsProgrammeCap,
  overlapsIncludedCpa,
  type CpaStatus,
  type CpaAction,
  type CpaTier,
} from '../src/utils/poa-cpa-inclusion-spec';

const GRADED: CpaStatus[] = [
  'cpa_proposed',
  'eligibility_screening',
  'methodology_check',
  'loa_pending',
  'inclusion_review',
  'included',
  'monitoring',
  'verified',
];
const TERMINAL_STATES: CpaStatus[] = ['rejected', 'excluded', 'withdrawn', 'completed'];
const TIERS: CpaTier[] = ['micro', 'small', 'medium', 'large', 'mega'];

describe('terminals & withdrawable', () => {
  it('marks the four terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('graded states are not terminal', () => {
    for (const s of GRADED) expect(isTerminal(s)).toBe(false);
  });
  it('the five pre-inclusion states are withdrawable', () => {
    for (const s of ['cpa_proposed', 'eligibility_screening', 'methodology_check', 'loa_pending', 'inclusion_review'] as CpaStatus[]) {
      expect(isWithdrawable(s)).toBe(true);
    }
  });
  it('post-inclusion + terminal states are not withdrawable', () => {
    for (const s of ['included', 'monitoring', 'verified', ...TERMINAL_STATES] as CpaStatus[]) {
      expect(isWithdrawable(s)).toBe(false);
    }
  });
});

describe('transitions', () => {
  it('walks the clean forward path', () => {
    expect(nextStatus('cpa_proposed', 'screen_eligibility')).toBe('eligibility_screening');
    expect(nextStatus('eligibility_screening', 'check_methodology')).toBe('methodology_check');
    expect(nextStatus('methodology_check', 'request_loa')).toBe('loa_pending');
    expect(nextStatus('loa_pending', 'submit_inclusion')).toBe('inclusion_review');
    expect(nextStatus('inclusion_review', 'approve_inclusion')).toBe('included');
    expect(nextStatus('included', 'begin_monitoring')).toBe('monitoring');
    expect(nextStatus('monitoring', 'verify_period')).toBe('verified');
  });

  it('loops the monitoring cycle', () => {
    expect(nextStatus('verified', 'continue_monitoring')).toBe('monitoring');
    expect(nextStatus('monitoring', 'verify_period')).toBe('verified');
  });

  it('rejects only from screening / methodology / inclusion_review', () => {
    expect(nextStatus('eligibility_screening', 'reject_cpa')).toBe('rejected');
    expect(nextStatus('methodology_check', 'reject_cpa')).toBe('rejected');
    expect(nextStatus('inclusion_review', 'reject_cpa')).toBe('rejected');
    expect(nextStatus('loa_pending', 'reject_cpa')).toBeNull();
    expect(nextStatus('included', 'reject_cpa')).toBeNull();
  });

  it('excludes only from included / monitoring / verified', () => {
    expect(nextStatus('included', 'exclude_cpa')).toBe('excluded');
    expect(nextStatus('monitoring', 'exclude_cpa')).toBe('excluded');
    expect(nextStatus('verified', 'exclude_cpa')).toBe('excluded');
    expect(nextStatus('inclusion_review', 'exclude_cpa')).toBeNull();
  });

  it('withdraws only from the five pre-inclusion states', () => {
    for (const s of ['cpa_proposed', 'eligibility_screening', 'methodology_check', 'loa_pending', 'inclusion_review'] as CpaStatus[]) {
      expect(nextStatus(s, 'withdraw_cpa')).toBe('withdrawn');
    }
    expect(nextStatus('included', 'withdraw_cpa')).toBeNull();
    expect(nextStatus('monitoring', 'withdraw_cpa')).toBeNull();
  });

  it('completes only from monitoring / verified', () => {
    expect(nextStatus('monitoring', 'complete_cpa')).toBe('completed');
    expect(nextStatus('verified', 'complete_cpa')).toBe('completed');
    expect(nextStatus('included', 'complete_cpa')).toBeNull();
  });

  it('no action escapes a terminal state', () => {
    for (const s of TERMINAL_STATES) {
      for (const a of Object.keys(TRANSITIONS) as CpaAction[]) {
        expect(nextStatus(s, a)).toBeNull();
      }
    }
  });

  it('allowedActions matches the transition map', () => {
    expect(allowedActions('cpa_proposed').sort()).toEqual(['screen_eligibility', 'withdraw_cpa'].sort());
    expect(allowedActions('eligibility_screening').sort()).toEqual(['check_methodology', 'reject_cpa', 'withdraw_cpa'].sort());
    expect(allowedActions('inclusion_review').sort()).toEqual(['approve_inclusion', 'reject_cpa', 'withdraw_cpa'].sort());
    expect(allowedActions('included').sort()).toEqual(['begin_monitoring', 'exclude_cpa'].sort());
    expect(allowedActions('verified').sort()).toEqual(['continue_monitoring', 'exclude_cpa', 'complete_cpa'].sort());
    expect(allowedActions('rejected')).toEqual([]);
  });
});

describe('INVERTED SLA matrix', () => {
  it('is strictly increasing micro -> mega for every graded state', () => {
    for (const s of GRADED) {
      const row = SLA_MINUTES[s];
      expect(row.micro).toBeLessThan(row.small);
      expect(row.small).toBeLessThan(row.medium);
      expect(row.medium).toBeLessThan(row.large);
      expect(row.large).toBeLessThan(row.mega);
    }
  });

  it('terminals carry no deadline', () => {
    for (const s of TERMINAL_STATES) {
      for (const t of TIERS) {
        expect(slaWindowMinutes(s, t)).toBe(0);
        expect(slaDeadlineFor(s, t, new Date())).toBeNull();
      }
    }
  });

  it('computes a deadline for graded states', () => {
    const at = new Date('2026-01-01T00:00:00Z');
    const d = slaDeadlineFor('eligibility_screening', 'micro', at);
    expect(d).not.toBeNull();
    expect(d!.getTime()).toBe(at.getTime() + 5 * 24 * 60 * 60 * 1000);
  });
});

describe('tier classification', () => {
  it('classifies base tier by annual ER', () => {
    expect(baseTierForAnnualEr(500)).toBe('micro');
    expect(baseTierForAnnualEr(5000)).toBe('small');
    expect(baseTierForAnnualEr(50000)).toBe('medium');
    expect(baseTierForAnnualEr(250000)).toBe('large');
    expect(baseTierForAnnualEr(750000)).toBe('mega');
  });

  it('respects bucket boundaries', () => {
    expect(baseTierForAnnualEr(999)).toBe('micro');
    expect(baseTierForAnnualEr(1000)).toBe('small');
    expect(baseTierForAnnualEr(9999)).toBe('small');
    expect(baseTierForAnnualEr(10000)).toBe('medium');
    expect(baseTierForAnnualEr(99999)).toBe('medium');
    expect(baseTierForAnnualEr(100000)).toBe('large');
    expect(baseTierForAnnualEr(499999)).toBe('large');
    expect(baseTierForAnnualEr(500000)).toBe('mega');
  });

  it('article6 floors a small CPA at large', () => {
    expect(tierForAnnualEr(500, 'article6')).toBe('large');
    expect(tierForAnnualEr(50000, 'article6')).toBe('large');
  });

  it('article6 does not lower a mega CPA', () => {
    expect(tierForAnnualEr(750000, 'article6')).toBe('mega');
  });

  it('voluntary / compliance keep the raw base tier', () => {
    expect(tierForAnnualEr(500, 'voluntary')).toBe('micro');
    expect(tierForAnnualEr(50000, 'compliance')).toBe('medium');
  });

  it('isLargeTier covers large + mega only', () => {
    expect(isLargeTier('large')).toBe(true);
    expect(isLargeTier('mega')).toBe(true);
    expect(isLargeTier('micro')).toBe(false);
    expect(isLargeTier('small')).toBe(false);
    expect(isLargeTier('medium')).toBe(false);
  });
});

describe('corresponding adjustment', () => {
  it('only article6 requires a corresponding adjustment', () => {
    expect(requiresCorrespondingAdjustment('article6')).toBe(true);
    expect(requiresCorrespondingAdjustment('voluntary')).toBe(false);
    expect(requiresCorrespondingAdjustment('compliance')).toBe(false);
  });
});

describe('regulator crossings (W73 signature)', () => {
  it('exclude_cpa crosses for EVERY tier', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('exclude_cpa', t, false)).toBe(true);
      expect(crossesIntoRegulator('exclude_cpa', t, true)).toBe(true);
    }
  });

  it('approve_inclusion crosses for every tier when requiresCA', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('approve_inclusion', t, true)).toBe(true);
    }
  });

  it('approve_inclusion crosses only for large tiers when not requiresCA', () => {
    expect(crossesIntoRegulator('approve_inclusion', 'micro', false)).toBe(false);
    expect(crossesIntoRegulator('approve_inclusion', 'medium', false)).toBe(false);
    expect(crossesIntoRegulator('approve_inclusion', 'large', false)).toBe(true);
    expect(crossesIntoRegulator('approve_inclusion', 'mega', false)).toBe(true);
  });

  it('reject_cpa crosses only for large tiers', () => {
    expect(crossesIntoRegulator('reject_cpa', 'micro', false)).toBe(false);
    expect(crossesIntoRegulator('reject_cpa', 'medium', true)).toBe(false);
    expect(crossesIntoRegulator('reject_cpa', 'large', false)).toBe(true);
    expect(crossesIntoRegulator('reject_cpa', 'mega', false)).toBe(true);
  });

  it('non-crossing actions never cross', () => {
    for (const a of ['screen_eligibility', 'check_methodology', 'request_loa', 'submit_inclusion', 'begin_monitoring', 'verify_period', 'continue_monitoring', 'withdraw_cpa', 'complete_cpa'] as CpaAction[]) {
      for (const t of TIERS) {
        expect(crossesIntoRegulator(a, t, true)).toBe(false);
      }
    }
  });

  it('sla breach crosses for large tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('micro')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
  });
});

describe('reportability', () => {
  it('is true when requiresCA regardless of tier', () => {
    expect(isReportable('micro', true)).toBe(true);
    expect(isReportable('small', true)).toBe(true);
  });
  it('is true for large volume regardless of CA', () => {
    expect(isReportable('large', false)).toBe(true);
    expect(isReportable('mega', false)).toBe(true);
  });
  it('is false for small voluntary CPAs', () => {
    expect(isReportable('micro', false)).toBe(false);
    expect(isReportable('medium', false)).toBe(false);
  });
});

describe('action party attribution', () => {
  it('maps the proponent actions', () => {
    expect(partyForAction('submit_inclusion')).toBe('proponent');
    expect(partyForAction('begin_monitoring')).toBe('proponent');
    expect(partyForAction('withdraw_cpa')).toBe('proponent');
  });
  it('maps the coordinating-entity actions', () => {
    for (const a of ['screen_eligibility', 'check_methodology', 'approve_inclusion', 'continue_monitoring', 'reject_cpa', 'exclude_cpa', 'complete_cpa'] as CpaAction[]) {
      expect(partyForAction(a)).toBe('coordinating_entity');
    }
  });
  it('maps the dna and vvb actions', () => {
    expect(partyForAction('request_loa')).toBe('dna');
    expect(partyForAction('verify_period')).toBe('vvb');
  });
});

describe('beat-best-in-class helpers', () => {
  it('eligibilityScore weights inputs to 0-100', () => {
    expect(eligibilityScore({ methodologyApplicability: 1, additionalityStrength: 1, monitoringReadiness: 1, loaConfidence: 1 })).toBe(100);
    expect(eligibilityScore({ methodologyApplicability: 0, additionalityStrength: 0, monitoringReadiness: 0, loaConfidence: 0 })).toBe(0);
    expect(eligibilityScore({ methodologyApplicability: 1, additionalityStrength: 0, monitoringReadiness: 0, loaConfidence: 0 })).toBe(35);
    expect(eligibilityScore({ methodologyApplicability: 0, additionalityStrength: 1, monitoringReadiness: 0, loaConfidence: 0 })).toBe(30);
  });

  it('eligibilityScore clamps out-of-range inputs', () => {
    expect(eligibilityScore({ methodologyApplicability: 2, additionalityStrength: 2, monitoringReadiness: 2, loaConfidence: 2 })).toBe(100);
    expect(eligibilityScore({ methodologyApplicability: -1, additionalityStrength: -1, monitoringReadiness: -1, loaConfidence: -1 })).toBe(0);
  });

  it('predictedInclusionDays is larger for larger tiers (inverted)', () => {
    expect(predictedInclusionDays('micro')).toBeLessThan(predictedInclusionDays('small'));
    expect(predictedInclusionDays('small')).toBeLessThan(predictedInclusionDays('medium'));
    expect(predictedInclusionDays('medium')).toBeLessThan(predictedInclusionDays('large'));
    expect(predictedInclusionDays('large')).toBeLessThan(predictedInclusionDays('mega'));
  });

  it('predictedInclusionDays sums the forward-path windows', () => {
    // micro: 5 + 5 + 7 + 21 + 10 = 48 days
    expect(predictedInclusionDays('micro')).toBe(48);
  });

  it('programmeHeadroomTco2e computes remaining cap', () => {
    expect(programmeHeadroomTco2e(100000, 60000, 30000)).toBe(10000);
    expect(programmeHeadroomTco2e(100000, 60000, 50000)).toBe(-10000);
  });

  it('exceedsProgrammeCap flags an over-cap inclusion', () => {
    expect(exceedsProgrammeCap(100000, 60000, 30000)).toBe(false);
    expect(exceedsProgrammeCap(100000, 60000, 50000)).toBe(true);
  });

  it('overlapsIncludedCpa detects a geographic collision', () => {
    expect(overlapsIncludedCpa('erf-123', ['erf-001', 'erf-123'])).toBe(true);
    expect(overlapsIncludedCpa('erf-999', ['erf-001', 'erf-123'])).toBe(false);
    expect(overlapsIncludedCpa('', ['erf-001'])).toBe(false);
  });
});
