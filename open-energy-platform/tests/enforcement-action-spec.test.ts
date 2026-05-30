import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  isTerminal,
  nextStatus,
  allowedActions,
  isCancellable,
  isFloorAtSevereClass,
  isAllegationClass,
  ERA_S35_CAP_PER_OFFENCE_ZAR,
  cappedPenaltyPerOffenceZar,
  totalPenaltyZar,
  tierFromPenalty,
  isTier,
  tierRank,
  isHighTier,
  SLA_MINUTES,
  slaDeadlineFor,
  isReportable,
  actionCrossesRegulator,
  authorityFor,
  AUDI_MINIMUM_DAYS,
  audiWindowDaysRemaining,
  audiMinimumMetFlag,
  proceduralIrregularityFlag,
  PRESCRIBED_INTEREST_RATE_PCT,
  accruedInterestZar,
  recoveryPct,
  repeatOffenderScore,
  repeatOffenderFlag,
  predictedRecoveryDays,
  urgencyBand,
  partyForAction,
  eventTypeFor,
  reasonCodeFor,
  type EnforcementActionStatus,
  type EnforcementActionTier,
  type AllegationClass,
} from '../src/utils/enforcement-action-spec';

describe('W93 enforcement-action state machine', () => {
  it('forward happy path case_opened → paid', () => {
    expect(nextStatus('case_opened', 'draft_allegations')).toBe('allegations_drafted');
    expect(nextStatus('allegations_drafted', 'serve_allegations')).toBe('allegations_served');
    expect(nextStatus('allegations_served', 'open_representations')).toBe('representations_period');
    expect(nextStatus('representations_period', 'hold_hearing')).toBe('hearing_held');
    expect(nextStatus('hearing_held', 'make_determination')).toBe('determination');
    expect(nextStatus('determination', 'impose_penalty')).toBe('penalty_imposed');
    expect(nextStatus('penalty_imposed', 'record_payment')).toBe('paid');
  });

  it('skip-hearing path: representations_period directly to determination', () => {
    expect(nextStatus('representations_period', 'make_determination')).toBe('determination');
  });

  it('dismissed branch: determination → dismissed (no contravention)', () => {
    expect(nextStatus('determination', 'dismiss')).toBe('dismissed');
  });

  it('appeal branch: penalty_imposed → appealed → impose_penalty | dismiss | enforce', () => {
    expect(nextStatus('penalty_imposed', 'lodge_appeal')).toBe('appealed');
    expect(nextStatus('appealed', 'impose_penalty')).toBe('penalty_imposed');
    expect(nextStatus('appealed', 'dismiss')).toBe('dismissed');
    expect(nextStatus('appealed', 'initiate_enforcement')).toBe('enforced_via_court');
  });

  it('enforcement branch: penalty_imposed → enforced_via_court → paid | dismissed', () => {
    expect(nextStatus('penalty_imposed', 'initiate_enforcement')).toBe('enforced_via_court');
    expect(nextStatus('enforced_via_court', 'record_payment')).toBe('paid');
    expect(nextStatus('enforced_via_court', 'dismiss')).toBe('dismissed');
  });

  it('withdraw branch: any pre-terminal → withdrawn', () => {
    const preTerminals: EnforcementActionStatus[] = [
      'case_opened', 'allegations_drafted', 'allegations_served',
      'representations_period', 'hearing_held', 'determination',
      'penalty_imposed', 'appealed', 'enforced_via_court',
    ];
    for (const s of preTerminals) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    }
  });

  it('cancel routes to withdrawn (admin-cancel surface)', () => {
    expect(nextStatus('case_opened', 'cancel')).toBe('withdrawn');
    expect(nextStatus('penalty_imposed', 'cancel')).toBe('withdrawn');
  });

  it('terminals are terminal and have no outgoing transitions', () => {
    for (const t of ['paid', 'dismissed', 'withdrawn'] as EnforcementActionStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(allowedActions(t)).toHaveLength(0);
    }
  });

  it('non-terminals are not terminal', () => {
    for (const s of ['case_opened', 'allegations_drafted', 'allegations_served',
      'representations_period', 'hearing_held', 'determination',
      'penalty_imposed', 'appealed', 'enforced_via_court'] as EnforcementActionStatus[]) {
      expect(isTerminal(s)).toBe(false);
    }
  });

  it('isCancellable for all pre-terminals', () => {
    expect(isCancellable('case_opened')).toBe(true);
    expect(isCancellable('penalty_imposed')).toBe(true);
    expect(isCancellable('paid')).toBe(false);
  });
});

describe('W93 ERA s35 cap + tier derivation', () => {
  it('ERA s35 cap = R1m per offence', () => {
    expect(ERA_S35_CAP_PER_OFFENCE_ZAR).toBe(1_000_000);
  });

  it('cappedPenaltyPerOffenceZar caps at R1m', () => {
    expect(cappedPenaltyPerOffenceZar(500_000)).toBe(500_000);
    expect(cappedPenaltyPerOffenceZar(1_500_000)).toBe(1_000_000);
    expect(cappedPenaltyPerOffenceZar(0)).toBe(0);
    expect(cappedPenaltyPerOffenceZar(-100)).toBe(0);
  });

  it('totalPenaltyZar stacks across offence count', () => {
    expect(totalPenaltyZar(500_000, 1)).toBe(500_000);
    expect(totalPenaltyZar(500_000, 5)).toBe(2_500_000);
    expect(totalPenaltyZar(1_500_000, 3)).toBe(3_000_000);
    expect(totalPenaltyZar(100_000, 0)).toBe(100_000); // floor 1
  });

  it('tier ladder: minor < R100k / standard R100k-R500k / material R500k-R1m / severe ≥ R1m', () => {
    expect(tierFromPenalty(50_000, 'tariff_non_compliance')).toBe('minor');
    expect(tierFromPenalty(200_000, 'tariff_non_compliance')).toBe('standard');
    expect(tierFromPenalty(700_000, 'tariff_non_compliance')).toBe('material');
    expect(tierFromPenalty(1_500_000, 'tariff_non_compliance')).toBe('severe');
  });

  it('floor-at-severe for safety_violation / repeat_offender / systemic_market_abuse', () => {
    expect(tierFromPenalty(50_000, 'safety_violation')).toBe('severe');
    expect(tierFromPenalty(200_000, 'repeat_offender')).toBe('severe');
    expect(tierFromPenalty(50_000, 'systemic_market_abuse')).toBe('severe');
  });

  it('floor-at-severe classes pass-through helpers', () => {
    expect(isFloorAtSevereClass('safety_violation')).toBe(true);
    expect(isFloorAtSevereClass('repeat_offender')).toBe(true);
    expect(isFloorAtSevereClass('systemic_market_abuse')).toBe(true);
    expect(isFloorAtSevereClass('tariff_non_compliance')).toBe(false);
  });

  it('class + tier guards', () => {
    expect(isAllegationClass('tariff_non_compliance')).toBe(true);
    expect(isAllegationClass('not_a_real_class')).toBe(false);
    expect(isTier('minor')).toBe(true);
    expect(isTier('extreme')).toBe(false);
  });

  it('tier rank monotone minor < standard < material < severe', () => {
    expect(tierRank('minor')).toBeLessThan(tierRank('standard'));
    expect(tierRank('standard')).toBeLessThan(tierRank('material'));
    expect(tierRank('material')).toBeLessThan(tierRank('severe'));
  });

  it('isHighTier = {material, severe}', () => {
    expect(isHighTier('minor')).toBe(false);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('material')).toBe(true);
    expect(isHighTier('severe')).toBe(true);
  });
});

describe('W93 INVERTED SLA polarity', () => {
  it('representations_period satisfies ERA s35(3) 21-day minimum for every tier', () => {
    for (const tier of ['minor', 'standard', 'material', 'severe'] as EnforcementActionTier[]) {
      const days = SLA_MINUTES.representations_period[tier] / (24 * 60);
      expect(days).toBeGreaterThanOrEqual(AUDI_MINIMUM_DAYS);
    }
  });

  it('INVERTED: larger penalty gets MORE time at every graded state', () => {
    const states = Object.keys(SLA_MINUTES) as EnforcementActionStatus[];
    for (const state of states) {
      const row = SLA_MINUTES[state];
      const m = row.minor, s = row.standard, ma = row.material, sv = row.severe;
      if (m === 0 && s === 0 && ma === 0 && sv === 0) continue;
      expect(m).toBeLessThan(s);
      expect(s).toBeLessThan(ma);
      expect(ma).toBeLessThan(sv);
    }
  });

  it('terminals have zero SLA', () => {
    for (const t of ['paid', 'dismissed', 'withdrawn'] as EnforcementActionStatus[]) {
      expect(SLA_MINUTES[t].minor).toBe(0);
      expect(SLA_MINUTES[t].severe).toBe(0);
    }
  });

  it('slaDeadlineFor adds minutes correctly', () => {
    const enteredAt = new Date('2026-05-30T00:00:00.000Z');
    const due = slaDeadlineFor('case_opened', 'severe', enteredAt);
    expect(due).not.toBeNull();
    expect(due!.toISOString()).toBe('2026-06-19T00:00:00.000Z');
  });

  it('slaDeadlineFor null on terminal', () => {
    expect(slaDeadlineFor('paid', 'severe', new Date())).toBeNull();
  });
});

describe('W93 reportability (regulator-inbox crossings)', () => {
  it('isReportable on material+severe', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('severe')).toBe(true);
  });

  it('SIGNATURE: impose_penalty crosses EVERY tier (public register)', () => {
    for (const t of ['minor', 'standard', 'material', 'severe'] as EnforcementActionTier[]) {
      expect(actionCrossesRegulator('impose_penalty', t, 'tariff_non_compliance', true)).toBe(true);
    }
  });

  it('initiate_enforcement crosses every tier (court-system signal)', () => {
    for (const t of ['minor', 'standard', 'material', 'severe'] as EnforcementActionTier[]) {
      expect(actionCrossesRegulator('initiate_enforcement', t, 'tariff_non_compliance', true)).toBe(true);
    }
  });

  it('lodge_appeal crosses every tier (Tribunal track)', () => {
    for (const t of ['minor', 'standard', 'material', 'severe'] as EnforcementActionTier[]) {
      expect(actionCrossesRegulator('lodge_appeal', t, 'tariff_non_compliance', true)).toBe(true);
    }
  });

  it('make_determination crosses on severe always, material if liable', () => {
    expect(actionCrossesRegulator('make_determination', 'severe', 'tariff_non_compliance', true)).toBe(true);
    expect(actionCrossesRegulator('make_determination', 'material', 'tariff_non_compliance', true)).toBe(true);
    expect(actionCrossesRegulator('make_determination', 'minor', 'tariff_non_compliance', true)).toBe(false);
    expect(actionCrossesRegulator('make_determination', 'severe', 'tariff_non_compliance', false)).toBe(false);
  });

  it('dismiss / withdraw cross only material+severe', () => {
    expect(actionCrossesRegulator('dismiss', 'minor', 'tariff_non_compliance', false)).toBe(false);
    expect(actionCrossesRegulator('dismiss', 'material', 'tariff_non_compliance', false)).toBe(true);
    expect(actionCrossesRegulator('withdraw', 'severe', 'tariff_non_compliance', false)).toBe(true);
  });

  it('serve_allegations crosses on floor-at-severe classes', () => {
    expect(actionCrossesRegulator('serve_allegations', 'minor', 'safety_violation', false)).toBe(true);
    expect(actionCrossesRegulator('serve_allegations', 'minor', 'tariff_non_compliance', false)).toBe(false);
  });

  it('other actions do not cross', () => {
    expect(actionCrossesRegulator('draft_allegations', 'severe', 'tariff_non_compliance', false)).toBe(false);
    expect(actionCrossesRegulator('record_payment', 'severe', 'tariff_non_compliance', true)).toBe(false);
  });
});

describe('W93 authority gating', () => {
  it('authorityFor escalates with tier', () => {
    expect(authorityFor('minor')).toBe('enforcement_officer');
    expect(authorityFor('standard')).toBe('panel_chair');
    expect(authorityFor('material')).toBe('council_subcommittee');
    expect(authorityFor('severe')).toBe('full_council');
  });
});

describe('W93 audi-window compliance (PAJA s4 + ERA s35(3))', () => {
  it('AUDI_MINIMUM_DAYS = 21', () => {
    expect(AUDI_MINIMUM_DAYS).toBe(21);
  });

  it('audiMinimumMetFlag true for every tier (all ≥ 21 days)', () => {
    for (const t of ['minor', 'standard', 'material', 'severe'] as EnforcementActionTier[]) {
      expect(audiMinimumMetFlag(t)).toBe(true);
    }
  });

  it('audiWindowDaysRemaining countdown', () => {
    const opened = new Date('2026-05-01T00:00:00.000Z');
    const now = new Date('2026-05-08T00:00:00.000Z'); // 7 days in
    const days = audiWindowDaysRemaining(opened, 'minor', now);
    expect(days).toBeCloseTo(14, 0); // 21 - 7
  });

  it('audiWindowDaysRemaining clamps to 0 after window', () => {
    const opened = new Date('2026-05-01T00:00:00.000Z');
    const now = new Date('2026-08-01T00:00:00.000Z'); // way past
    expect(audiWindowDaysRemaining(opened, 'minor', now)).toBe(0);
  });

  it('proceduralIrregularityFlag false when audi met and no hearing issue', () => {
    expect(proceduralIrregularityFlag('minor', false, false)).toBe(false);
    expect(proceduralIrregularityFlag('minor', true, true)).toBe(false);
  });

  it('proceduralIrregularityFlag true when hearing requested but denied without reasoned refusal', () => {
    expect(proceduralIrregularityFlag('minor', true, false)).toBe(true);
  });
});

describe('W93 penalty recovery battery', () => {
  it('PRESCRIBED_INTEREST_RATE_PCT = 15.5', () => {
    expect(PRESCRIBED_INTEREST_RATE_PCT).toBe(15.5);
  });

  it('accruedInterestZar scales with days overdue', () => {
    expect(accruedInterestZar(1_000_000, 365)).toBeCloseTo(155_000, 0);
    expect(accruedInterestZar(1_000_000, 0)).toBe(0);
    expect(accruedInterestZar(0, 100)).toBe(0);
  });

  it('recoveryPct ratio of recovered / imposed', () => {
    expect(recoveryPct(500_000, 1_000_000)).toBe(50);
    expect(recoveryPct(1_000_000, 1_000_000)).toBe(100);
    expect(recoveryPct(0, 1_000_000)).toBe(0);
    expect(recoveryPct(500_000, 0)).toBe(0);
  });
});

describe('W93 repeat-offender battery', () => {
  it('repeatOffenderScore counts × recency', () => {
    expect(repeatOffenderScore(3, 100)).toBe(3);
    expect(repeatOffenderScore(3, 500)).toBeCloseTo(1.8, 5);
    expect(repeatOffenderScore(3, 1000)).toBeCloseTo(0.9, 5);
    expect(repeatOffenderScore(0, 100)).toBe(0);
  });

  it('repeatOffenderFlag true when ≥2 prior penalties', () => {
    expect(repeatOffenderFlag(2, 100)).toBe(true);
    expect(repeatOffenderFlag(1, 100)).toBe(false);
  });

  it('repeatOffenderFlag true when score ≥ 1.5 (e.g. recency offset)', () => {
    expect(repeatOffenderFlag(1, 100)).toBe(false); // score 1 < 1.5
    expect(repeatOffenderFlag(2, 100)).toBe(true);  // count ≥ 2
  });
});

describe('W93 predicted recovery', () => {
  it('predictedRecoveryDays per enforcement step', () => {
    expect(predictedRecoveryDays('none')).toBe(30);
    expect(predictedRecoveryDays('demand_letter')).toBe(45);
    expect(predictedRecoveryDays('writ_issued')).toBe(90);
    expect(predictedRecoveryDays('sheriff_attachment')).toBe(150);
    expect(predictedRecoveryDays('garnishee')).toBe(180);
    expect(predictedRecoveryDays('contempt_application')).toBe(270);
  });

  it('predictedRecoveryDays unknown step defaults to 90', () => {
    expect(predictedRecoveryDays('xxx')).toBe(90);
  });
});

describe('W93 urgency band + actor party + event types', () => {
  it('urgencyBand closed for terminals', () => {
    expect(urgencyBand('paid', null, new Date())).toBe('closed');
    expect(urgencyBand('dismissed', null, new Date())).toBe('closed');
  });

  it('urgencyBand overdue / urgent / due_soon / on_track', () => {
    const now = new Date('2026-05-30T00:00:00.000Z');
    expect(urgencyBand('case_opened', new Date('2026-05-29T00:00:00.000Z'), now)).toBe('overdue');
    expect(urgencyBand('case_opened', new Date('2026-05-30T12:00:00.000Z'), now)).toBe('urgent');
    expect(urgencyBand('case_opened', new Date('2026-06-01T00:00:00.000Z'), now)).toBe('due_soon');
    expect(urgencyBand('case_opened', new Date('2026-06-10T00:00:00.000Z'), now)).toBe('on_track');
  });

  it('partyForAction maps each action correctly', () => {
    expect(partyForAction('draft_allegations')).toBe('enforcement_officer');
    expect(partyForAction('hold_hearing')).toBe('panel_chair');
    expect(partyForAction('make_determination')).toBe('council');
    expect(partyForAction('impose_penalty')).toBe('council');
    expect(partyForAction('initiate_enforcement')).toBe('sheriff');
  });

  it('eventTypeFor returns "enforcement_action.<status>"', () => {
    expect(eventTypeFor('penalty_imposed')).toBe('enforcement_action.penalty_imposed');
    expect(eventTypeFor('paid')).toBe('enforcement_action.paid');
  });

  it('reasonCodeFor injects allegation_class and tier for impose_penalty', () => {
    expect(reasonCodeFor('impose_penalty', 'tariff_non_compliance', 'severe'))
      .toBe('penalty_imposed_tariff_non_compliance_severe');
  });

  it('reasonCodeFor for other actions', () => {
    expect(reasonCodeFor('initiate_enforcement', 'tariff_non_compliance', 'minor'))
      .toBe('enforcement_initiated_minor');
    expect(reasonCodeFor('lodge_appeal', 'tariff_non_compliance', 'material'))
      .toBe('appeal_lodged_material');
    expect(reasonCodeFor('dismiss', 'tariff_non_compliance', 'standard'))
      .toBe('dismissed_standard');
  });
});

describe('W93 TRANSITIONS shape', () => {
  it('every non-terminal state has at least one outgoing transition', () => {
    for (const [s, t] of Object.entries(TRANSITIONS) as [EnforcementActionStatus, Record<string, unknown>][]) {
      if (!isTerminal(s)) {
        expect(Object.keys(t).length).toBeGreaterThan(0);
      }
    }
  });

  it('every transition target is a valid status', () => {
    const valid = new Set(Object.keys(TRANSITIONS));
    for (const transitions of Object.values(TRANSITIONS)) {
      for (const rule of Object.values(transitions)) {
        expect(valid.has(rule.next)).toBe(true);
      }
    }
  });
});
