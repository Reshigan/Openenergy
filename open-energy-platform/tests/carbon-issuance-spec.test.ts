import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  isCancellable,
  nextStatus,
  allowedActions,
  TRANSITIONS,
  SLA_MINUTES,
  slaWindowMinutes,
  slaDeadlineFor,
  requiresCorrespondingAdjustment,
  isLargeTier,
  baseTierForQuantity,
  tierForQuantity,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  defaultBufferPctFor,
  bufferContributionTco2e,
  netIssuableTco2e,
  projectVintageHeadroomTco2e,
  isOverIssuance,
  doubleIssuanceGuardOk,
  serialBlockEnd,
  predictedIssuanceDays,
  type IssuanceStatus,
  type IssuanceAction,
  type IssuanceTier,
} from '../src/utils/carbon-issuance-spec';

const GRADED: IssuanceStatus[] = [
  'requested',
  'screening',
  'verification_check',
  'serialization',
  'pending_registry',
  'on_hold',
  'returned',
  'disputed',
];
const TERMINAL_STATES: IssuanceStatus[] = ['issued', 'rejected', 'withdrawn', 'cancelled'];
const TIERS: IssuanceTier[] = ['minor', 'moderate', 'major', 'mega'];

describe('terminals & cancellability', () => {
  it('marks the four terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminal graded states are not terminal', () => {
    for (const s of GRADED) expect(isTerminal(s)).toBe(false);
  });
  it('all pre-issued graded states are cancellable', () => {
    for (const s of GRADED) expect(isCancellable(s)).toBe(true);
  });
  it('terminal states are not cancellable', () => {
    for (const s of TERMINAL_STATES) expect(isCancellable(s)).toBe(false);
  });
});

describe('transitions', () => {
  it('clean path requested → screening → verification_check → serialization → pending_registry → issued', () => {
    expect(nextStatus('requested', 'begin_screening')).toBe('screening');
    expect(nextStatus('screening', 'verify_against_mrv')).toBe('verification_check');
    expect(nextStatus('verification_check', 'assign_serials')).toBe('serialization');
    expect(nextStatus('serialization', 'submit_to_registry')).toBe('pending_registry');
    expect(nextStatus('pending_registry', 'confirm_issuance')).toBe('issued');
  });
  it('on_hold branch + resume back to screening', () => {
    expect(nextStatus('screening', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('verification_check', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('serialization', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('on_hold', 'resume')).toBe('screening');
  });
  it('return-for-correction → resubmit returns to screening', () => {
    expect(nextStatus('verification_check', 'return_for_correction')).toBe('returned');
    expect(nextStatus('serialization', 'return_for_correction')).toBe('returned');
    expect(nextStatus('returned', 'resubmit')).toBe('screening');
  });
  it('dispute branch: pending_registry → disputed → serialization', () => {
    expect(nextStatus('pending_registry', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('serialization');
  });
  it('reject is reachable from every graded pre-terminal state', () => {
    for (const s of GRADED) {
      if (s === 'requested') {
        // reject does not apply pre-screening — only via screening onward
        expect(nextStatus(s, 'reject')).toBe(null);
      } else {
        expect(nextStatus(s, 'reject')).toBe('rejected');
      }
    }
  });
  it('withdraw + cancel are reachable from every pre-issued state', () => {
    for (const s of GRADED) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
      expect(nextStatus(s, 'cancel')).toBe('cancelled');
    }
  });
  it('terminal states have no outgoing transitions', () => {
    for (const s of TERMINAL_STATES) {
      for (const a of Object.keys(TRANSITIONS) as IssuanceAction[]) {
        expect(nextStatus(s, a)).toBe(null);
      }
    }
  });
  it('allowedActions only returns valid transitions for current state', () => {
    expect(allowedActions('requested').sort()).toEqual(['begin_screening', 'cancel', 'withdraw'].sort());
    expect(allowedActions('pending_registry').sort()).toEqual(
      ['cancel', 'confirm_issuance', 'raise_dispute', 'reject', 'withdraw'].sort(),
    );
    expect(allowedActions('issued')).toEqual([]);
  });
});

describe('tiers from quantity (with Article-6 floor)', () => {
  it('base tier brackets by raw quantity', () => {
    expect(baseTierForQuantity(0)).toBe('minor');
    expect(baseTierForQuantity(9999)).toBe('minor');
    expect(baseTierForQuantity(10000)).toBe('moderate');
    expect(baseTierForQuantity(99999)).toBe('moderate');
    expect(baseTierForQuantity(100000)).toBe('major');
    expect(baseTierForQuantity(499999)).toBe('major');
    expect(baseTierForQuantity(500000)).toBe('mega');
    expect(baseTierForQuantity(1_000_000)).toBe('mega');
  });
  it('Article-6 issuance floors at major regardless of small quantity', () => {
    expect(tierForQuantity(500, 'article6')).toBe('major');
    expect(tierForQuantity(50000, 'article6')).toBe('major');
  });
  it('Article-6 does not lower a mega tier', () => {
    expect(tierForQuantity(750_000, 'article6')).toBe('mega');
  });
  it('voluntary + compliance follow the raw tier ladder', () => {
    expect(tierForQuantity(5_000, 'voluntary')).toBe('minor');
    expect(tierForQuantity(20_000, 'compliance')).toBe('moderate');
    expect(tierForQuantity(300_000, 'voluntary')).toBe('major');
  });
  it('isLargeTier matches major + mega only', () => {
    expect(isLargeTier('minor')).toBe(false);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('mega')).toBe(true);
  });
});

describe('SLA matrix is strictly INVERTED across graded states', () => {
  it('every graded state has strictly increasing windows minor → mega', () => {
    const graded: IssuanceStatus[] = [
      'requested',
      'screening',
      'verification_check',
      'serialization',
      'pending_registry',
      'on_hold',
      'returned',
      'disputed',
    ];
    for (const s of graded) {
      const m = SLA_MINUTES[s];
      expect(m.minor).toBeGreaterThan(0);
      expect(m.moderate).toBeGreaterThan(m.minor);
      expect(m.major).toBeGreaterThan(m.moderate);
      expect(m.mega).toBeGreaterThan(m.major);
    }
  });
  it('terminals carry no SLA deadline', () => {
    for (const s of TERMINAL_STATES) {
      for (const t of TIERS) expect(slaWindowMinutes(s, t)).toBe(0);
    }
  });
  it('slaDeadlineFor returns null for terminals and a future Date for graded states', () => {
    const now = new Date('2026-05-29T00:00:00Z');
    expect(slaDeadlineFor('issued', 'minor', now)).toBe(null);
    const d = slaDeadlineFor('screening', 'moderate', now);
    expect(d).toBeInstanceOf(Date);
    if (d) expect(d.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('reportability (INTEGRITY-driven signature)', () => {
  it('raise_dispute crosses for EVERY tier', () => {
    for (const t of TIERS) expect(crossesIntoRegulator('raise_dispute', t)).toBe(true);
  });
  it('confirm_issuance crosses for EVERY tier when CA required', () => {
    for (const t of TIERS) expect(crossesIntoRegulator('confirm_issuance', t, true)).toBe(true);
  });
  it('confirm_issuance crosses only for major + mega when CA not required', () => {
    expect(crossesIntoRegulator('confirm_issuance', 'minor', false)).toBe(false);
    expect(crossesIntoRegulator('confirm_issuance', 'moderate', false)).toBe(false);
    expect(crossesIntoRegulator('confirm_issuance', 'major', false)).toBe(true);
    expect(crossesIntoRegulator('confirm_issuance', 'mega', false)).toBe(true);
  });
  it('reject crosses only for major + mega', () => {
    expect(crossesIntoRegulator('reject', 'minor')).toBe(false);
    expect(crossesIntoRegulator('reject', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('reject', 'major')).toBe(true);
    expect(crossesIntoRegulator('reject', 'mega')).toBe(true);
  });
  it('sla_breach crosses only for major + mega', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
  });
  it('isReportable true for major/mega OR ca_required', () => {
    expect(isReportable('minor', false)).toBe(false);
    expect(isReportable('moderate', false)).toBe(false);
    expect(isReportable('major', false)).toBe(true);
    expect(isReportable('mega', false)).toBe(true);
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('moderate', true)).toBe(true);
  });
  it('most non-signature actions do not cross', () => {
    for (const a of ['begin_screening', 'verify_against_mrv', 'assign_serials', 'submit_to_registry', 'resume', 'resubmit', 'resolve_dispute', 'withdraw', 'cancel'] as IssuanceAction[]) {
      for (const t of TIERS) expect(crossesIntoRegulator(a, t)).toBe(false);
    }
  });
});

describe('party attribution', () => {
  it('proponent owns resubmit + withdraw', () => {
    expect(partyForAction('resubmit')).toBe('proponent');
    expect(partyForAction('withdraw')).toBe('proponent');
  });
  it('vvb owns the MRV cross-check', () => {
    expect(partyForAction('verify_against_mrv')).toBe('vvb');
  });
  it('registry owns the rest of the lifecycle', () => {
    for (const a of [
      'begin_screening', 'assign_serials', 'submit_to_registry',
      'confirm_issuance', 'place_on_hold', 'resume', 'return_for_correction',
      'raise_dispute', 'resolve_dispute', 'reject', 'cancel',
    ] as IssuanceAction[]) {
      expect(partyForAction(a)).toBe('registry');
    }
  });
});

describe('Article-6 corresponding-adjustment binding', () => {
  it('article6 transfers require a corresponding adjustment', () => {
    expect(requiresCorrespondingAdjustment('article6')).toBe(true);
  });
  it('voluntary + compliance do not', () => {
    expect(requiresCorrespondingAdjustment('voluntary')).toBe(false);
    expect(requiresCorrespondingAdjustment('compliance')).toBe(false);
  });
});

describe('issuance-integrity helpers (the W82 beats-best-in-class layer)', () => {
  it('default buffer pct is 20% for AFOLU and zero for others', () => {
    expect(defaultBufferPctFor('afolu')).toBe(0.20);
    expect(defaultBufferPctFor('energy')).toBe(0);
    expect(defaultBufferPctFor('engineered')).toBe(0);
    expect(defaultBufferPctFor('waste')).toBe(0);
  });
  it('buffer contribution is quantity * pct, clamped 0..1', () => {
    expect(bufferContributionTco2e(100000, 0.20)).toBe(20000);
    expect(bufferContributionTco2e(50000, 0)).toBe(0);
    expect(bufferContributionTco2e(50000, 1.5)).toBe(50000);
    expect(bufferContributionTco2e(50000, -0.1)).toBe(0);
  });
  it('net issuable = quantity - buffer', () => {
    expect(netIssuableTco2e(100000, 0.20)).toBe(80000);
    expect(netIssuableTco2e(50000, 0)).toBe(50000);
  });
  it('project+vintage headroom and over-issuance flag', () => {
    expect(projectVintageHeadroomTco2e(100000, 30000, 40000)).toBe(30000);
    expect(projectVintageHeadroomTco2e(100000, 90000, 20000)).toBe(-10000);
    expect(isOverIssuance(100000, 30000, 40000)).toBe(false);
    expect(isOverIssuance(100000, 90000, 20000)).toBe(true);
  });
  it('double-issuance guard returns false when key already exists', () => {
    expect(doubleIssuanceGuardOk('project-1::2024', ['project-2::2024'])).toBe(true);
    expect(doubleIssuanceGuardOk('project-1::2024', ['project-1::2024'])).toBe(false);
    expect(doubleIssuanceGuardOk('', ['project-1::2024'])).toBe(true);
  });
  it('serial block end maps a net-issuable count to an inclusive serial range', () => {
    expect(serialBlockEnd(1_000_001, 100000)).toBe(1_100_000);
    expect(serialBlockEnd(1_000_001, 1)).toBe(1_000_001);
    expect(serialBlockEnd(1_000_001, 0)).toBe(1_000_001);
  });
  it('predicted issuance days strictly increases minor → mega', () => {
    const d0 = predictedIssuanceDays('minor');
    const d1 = predictedIssuanceDays('moderate');
    const d2 = predictedIssuanceDays('major');
    const d3 = predictedIssuanceDays('mega');
    expect(d1).toBeGreaterThan(d0);
    expect(d2).toBeGreaterThan(d1);
    expect(d3).toBeGreaterThan(d2);
  });
});
