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
  isHighIntegrityRisk,
  isLargeTier,
  baseTierForVolume,
  tierForAssessment,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  CCP_CRITERIA,
  CRITERION_PASS_THRESHOLD,
  ELIGIBLE_AGGREGATE_THRESHOLD,
  CONDITIONAL_AGGREGATE_THRESHOLD,
  INTEGRITY_FLOOR,
  ccpAggregateScore,
  weakestCriterion,
  gapCount,
  crossesIntegrityFloor,
  labelClassForScores,
  corsiaPhase2Eligible,
  sylveraGradeEquivalent,
  premiumPricingUpliftPct,
  predictedAssessmentDays,
  type CcpAssessmentStatus,
  type CcpAssessmentAction,
  type CcpAssessmentTier,
  type CcpSector,
  type CcpScoreCard,
} from '../src/utils/ccp-assessment-spec';

const GRADED: CcpAssessmentStatus[] = [
  'requested',
  'screening',
  'eligibility_check',
  'assessment_in_progress',
  'vvb_review',
  'ccp_decision_pending',
  'on_hold',
  'returned',
  'disputed',
];
const TERMINAL_STATES: CcpAssessmentStatus[] = ['ccp_label_granted', 'ccp_label_denied', 'withdrawn'];
const TIERS: CcpAssessmentTier[] = ['minor', 'moderate', 'major', 'mega'];
const SECTORS: CcpSector[] = [
  'redd_plus', 'jurisdictional', 'avoidance',
  'arr', 'improved_forest_mgmt', 'cookstove', 'renewable_energy',
  'methane', 'industrial_gas', 'engineered_removal', 'soil_carbon', 'blue_carbon',
];

describe('terminals & withdrawability', () => {
  it('marks the three terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminal graded states are not terminal', () => {
    for (const s of GRADED) expect(isTerminal(s)).toBe(false);
  });
  it('all pre-decision graded states are withdrawable', () => {
    for (const s of GRADED) expect(isWithdrawable(s)).toBe(true);
  });
  it('terminal states are not withdrawable', () => {
    for (const s of TERMINAL_STATES) expect(isWithdrawable(s)).toBe(false);
  });
});

describe('transitions', () => {
  it('clean path: requested → screening → eligibility_check → assessment_in_progress → vvb_review → ccp_decision_pending → ccp_label_granted', () => {
    expect(nextStatus('requested', 'begin_screening')).toBe('screening');
    expect(nextStatus('screening', 'begin_eligibility_check')).toBe('eligibility_check');
    expect(nextStatus('eligibility_check', 'begin_assessment')).toBe('assessment_in_progress');
    expect(nextStatus('assessment_in_progress', 'complete_vvb_review')).toBe('vvb_review');
    expect(nextStatus('vvb_review', 'submit_for_decision')).toBe('ccp_decision_pending');
    expect(nextStatus('ccp_decision_pending', 'grant_ccp_label')).toBe('ccp_label_granted');
  });
  it('denial path: ccp_decision_pending → ccp_label_denied', () => {
    expect(nextStatus('ccp_decision_pending', 'deny_ccp_label')).toBe('ccp_label_denied');
  });
  it('on_hold branch + resume back to screening', () => {
    expect(nextStatus('screening', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('eligibility_check', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('assessment_in_progress', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('vvb_review', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('ccp_decision_pending', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('on_hold', 'resume')).toBe('screening');
  });
  it('return-for-remediation → resubmit returns to screening', () => {
    expect(nextStatus('eligibility_check', 'return_for_remediation')).toBe('returned');
    expect(nextStatus('assessment_in_progress', 'return_for_remediation')).toBe('returned');
    expect(nextStatus('returned', 'resubmit')).toBe('screening');
  });
  it('dispute branch: vvb_review|ccp_decision_pending → disputed → vvb_review', () => {
    expect(nextStatus('vvb_review', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('ccp_decision_pending', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('vvb_review');
  });
  it('withdraw is available from every graded state', () => {
    for (const s of GRADED) expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
  });
  it('returns null from any terminal', () => {
    for (const s of TERMINAL_STATES) {
      for (const a of Object.keys(TRANSITIONS) as CcpAssessmentAction[]) {
        expect(nextStatus(s, a)).toBeNull();
      }
    }
  });
  it('rejects illegal transitions', () => {
    expect(nextStatus('requested', 'grant_ccp_label')).toBeNull();
    expect(nextStatus('screening', 'deny_ccp_label')).toBeNull();
    expect(nextStatus('eligibility_check', 'submit_for_decision')).toBeNull();
    expect(nextStatus('requested', 'raise_dispute')).toBeNull();
  });
  it('allowedActions emits exactly the actions that fire from a state', () => {
    expect(allowedActions('requested').sort()).toEqual(['begin_screening', 'withdraw'].sort());
    expect(allowedActions('vvb_review').sort()).toEqual(['place_on_hold', 'raise_dispute', 'submit_for_decision', 'withdraw'].sort());
    expect(allowedActions('ccp_label_granted')).toEqual([]);
  });
});

describe('SLA matrix (INVERTED — larger tier gets MORE time)', () => {
  it('strictly monotone non-decreasing minor → mega across every graded state', () => {
    for (const status of GRADED) {
      const minor = SLA_MINUTES[status].minor;
      const moderate = SLA_MINUTES[status].moderate;
      const major = SLA_MINUTES[status].major;
      const mega = SLA_MINUTES[status].mega;
      expect(minor).toBeGreaterThan(0);
      expect(moderate).toBeGreaterThan(minor);
      expect(major).toBeGreaterThan(moderate);
      expect(mega).toBeGreaterThan(major);
    }
  });
  it('terminals carry no deadline regardless of tier', () => {
    for (const t of TIERS) {
      expect(SLA_MINUTES.ccp_label_granted[t]).toBe(0);
      expect(SLA_MINUTES.ccp_label_denied[t]).toBe(0);
      expect(SLA_MINUTES.withdrawn[t]).toBe(0);
    }
  });
  it('slaWindowMinutes returns the matrix value', () => {
    expect(slaWindowMinutes('assessment_in_progress', 'mega')).toBe(45 * 24 * 60);
  });
  it('slaDeadlineFor returns null for terminal states', () => {
    expect(slaDeadlineFor('ccp_label_granted', 'major', new Date())).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'minor', new Date())).toBeNull();
  });
  it('slaDeadlineFor advances the timestamp by the matrix minutes', () => {
    const enteredAt = new Date('2026-01-15T08:00:00.000Z');
    const dl = slaDeadlineFor('vvb_review', 'minor', enteredAt);
    expect(dl).not.toBeNull();
    expect(dl!.toISOString()).toBe('2026-01-25T08:00:00.000Z'); // +10 days
  });
});

describe('tier derivation from assessed volume + Article-6 floor', () => {
  it('base tier brackets', () => {
    expect(baseTierForVolume(50_000)).toBe('minor');
    expect(baseTierForVolume(99_999)).toBe('minor');
    expect(baseTierForVolume(100_000)).toBe('moderate');
    expect(baseTierForVolume(499_999)).toBe('moderate');
    expect(baseTierForVolume(500_000)).toBe('major');
    expect(baseTierForVolume(1_999_999)).toBe('major');
    expect(baseTierForVolume(2_000_000)).toBe('mega');
    expect(baseTierForVolume(50_000_000)).toBe('mega');
  });
  it('high-integrity-risk sectors floor at major', () => {
    expect(tierForAssessment(10_000, 'redd_plus')).toBe('major');
    expect(tierForAssessment(10_000, 'jurisdictional')).toBe('major');
    expect(tierForAssessment(10_000, 'avoidance')).toBe('major');
  });
  it('non-risk sectors do not floor', () => {
    expect(tierForAssessment(10_000, 'renewable_energy')).toBe('minor');
    expect(tierForAssessment(10_000, 'engineered_removal')).toBe('minor');
    expect(tierForAssessment(10_000, 'cookstove')).toBe('minor');
  });
  it('mega volume stays mega for risk sector (floor does not lower)', () => {
    expect(tierForAssessment(5_000_000, 'redd_plus')).toBe('mega');
  });
  it('isHighIntegrityRisk identifies the three categories', () => {
    expect(isHighIntegrityRisk('redd_plus')).toBe(true);
    expect(isHighIntegrityRisk('jurisdictional')).toBe(true);
    expect(isHighIntegrityRisk('avoidance')).toBe(true);
    expect(isHighIntegrityRisk('engineered_removal')).toBe(false);
    expect(isHighIntegrityRisk('renewable_energy')).toBe(false);
  });
  it('isLargeTier identifies major and mega', () => {
    expect(isLargeTier('major')).toBe(true);
    expect(isLargeTier('mega')).toBe(true);
    expect(isLargeTier('moderate')).toBe(false);
    expect(isLargeTier('minor')).toBe(false);
  });
});

describe('SIGNATURE crossings (INTEGRITY-MARK driven)', () => {
  it('deny_ccp_label crosses regulator for EVERY tier — W91 signature', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('deny_ccp_label', t, false)).toBe(true);
      expect(crossesIntoRegulator('deny_ccp_label', t, true)).toBe(true);
    }
  });
  it('grant_ccp_label crosses for EVERY tier when conditional', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('grant_ccp_label', t, true)).toBe(true);
    }
  });
  it('grant_ccp_label (unconditional) crosses for major+mega only', () => {
    expect(crossesIntoRegulator('grant_ccp_label', 'minor', false)).toBe(false);
    expect(crossesIntoRegulator('grant_ccp_label', 'moderate', false)).toBe(false);
    expect(crossesIntoRegulator('grant_ccp_label', 'major', false)).toBe(true);
    expect(crossesIntoRegulator('grant_ccp_label', 'mega', false)).toBe(true);
  });
  it('raise_dispute crosses for major+mega only', () => {
    expect(crossesIntoRegulator('raise_dispute', 'minor', false)).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'moderate', false)).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'major', false)).toBe(true);
    expect(crossesIntoRegulator('raise_dispute', 'mega', false)).toBe(true);
  });
  it('other actions do not cross', () => {
    const other: CcpAssessmentAction[] = [
      'begin_screening', 'begin_eligibility_check', 'begin_assessment',
      'complete_vvb_review', 'submit_for_decision', 'place_on_hold',
      'resume', 'return_for_remediation', 'resubmit', 'resolve_dispute', 'withdraw',
    ];
    for (const a of other) {
      for (const t of TIERS) expect(crossesIntoRegulator(a, t)).toBe(false);
    }
  });
  it('sla_breached crosses for major+mega only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
  });
  it('isReportable true for high-risk sectors OR large tiers', () => {
    expect(isReportable('minor', 'redd_plus')).toBe(true);
    expect(isReportable('minor', 'jurisdictional')).toBe(true);
    expect(isReportable('minor', 'renewable_energy')).toBe(false);
    expect(isReportable('major', 'renewable_energy')).toBe(true);
    expect(isReportable('mega', 'engineered_removal')).toBe(true);
  });
});

describe('actor party mapping', () => {
  it('proponent actions: resubmit, raise_dispute, withdraw', () => {
    expect(partyForAction('resubmit')).toBe('proponent');
    expect(partyForAction('raise_dispute')).toBe('proponent');
    expect(partyForAction('withdraw')).toBe('proponent');
  });
  it('icvcm actions: decision + label grant/deny', () => {
    expect(partyForAction('grant_ccp_label')).toBe('icvcm');
    expect(partyForAction('deny_ccp_label')).toBe('icvcm');
    expect(partyForAction('submit_for_decision')).toBe('icvcm');
  });
  it('vvb action: complete_vvb_review', () => {
    expect(partyForAction('complete_vvb_review')).toBe('vvb');
  });
  it('quality_assessor action: begin_assessment', () => {
    expect(partyForAction('begin_assessment')).toBe('quality_assessor');
  });
});

describe('CCP scorecard math (live battery)', () => {
  const fullPass: CcpScoreCard = {
    effective_governance: 90,
    tracking_system: 92,
    transparency: 88,
    robust_quantification: 95,
    no_double_counting: 91,
    permanence: 85,
    additionality: 89,
    sustainable_development: 80,
    transition_to_net_zero: 82,
    safeguards: 87,
  };
  const conditional: CcpScoreCard = {
    effective_governance: 75,
    tracking_system: 78,
    transparency: 72,
    robust_quantification: 80,
    no_double_counting: 74,
    permanence: 71,
    additionality: 76,
    sustainable_development: 70,
    transition_to_net_zero: 73,
    safeguards: 72,
  };
  const oneGap: CcpScoreCard = {
    ...fullPass,
    permanence: 65, // below 70 → gap
  };
  const integrityFloorCross: CcpScoreCard = {
    ...fullPass,
    no_double_counting: 30, // below 50 → integrity-floor cross
  };

  it('lists 10 criteria in stable order', () => {
    expect(CCP_CRITERIA).toHaveLength(10);
    expect(CCP_CRITERIA[0]).toBe('effective_governance');
    expect(CCP_CRITERIA[9]).toBe('safeguards');
  });
  it('thresholds: 70 pass / 80 eligible aggregate / 70 conditional aggregate / 50 integrity floor', () => {
    expect(CRITERION_PASS_THRESHOLD).toBe(70);
    expect(ELIGIBLE_AGGREGATE_THRESHOLD).toBe(80);
    expect(CONDITIONAL_AGGREGATE_THRESHOLD).toBe(70);
    expect(INTEGRITY_FLOOR).toBe(50);
  });
  it('ccpAggregateScore averages the 10 criteria', () => {
    const agg = ccpAggregateScore(fullPass);
    expect(agg).toBeCloseTo(87.9, 1);
  });
  it('ccpAggregateScore clamps out-of-range and ignores missing', () => {
    expect(ccpAggregateScore({ effective_governance: 200 } as Partial<CcpScoreCard>)).toBe(100);
    expect(ccpAggregateScore({})).toBe(0);
  });
  it('weakestCriterion returns the minimum-scored criterion', () => {
    const w = weakestCriterion(fullPass);
    expect(w?.criterion).toBe('sustainable_development');
    expect(w?.score).toBe(80);
  });
  it('weakestCriterion returns null when nothing scored', () => {
    expect(weakestCriterion({})).toBeNull();
  });
  it('gapCount returns 0 when all pass', () => {
    expect(gapCount(fullPass)).toBe(0);
  });
  it('gapCount counts criteria below 70', () => {
    expect(gapCount(oneGap)).toBe(1);
  });
  it('crossesIntegrityFloor true when any criterion < 50', () => {
    expect(crossesIntegrityFloor(fullPass)).toBe(false);
    expect(crossesIntegrityFloor(integrityFloorCross)).toBe(true);
  });
  it('labelClassForScores: eligible / conditional / not_eligible', () => {
    expect(labelClassForScores(fullPass)).toBe('ccp_eligible');
    expect(labelClassForScores(conditional)).toBe('ccp_conditional');
    expect(labelClassForScores(oneGap)).toBe('ccp_not_eligible');
    expect(labelClassForScores(integrityFloorCross)).toBe('ccp_not_eligible');
  });
  it('corsiaPhase2Eligible only for ccp_eligible', () => {
    expect(corsiaPhase2Eligible('ccp_eligible')).toBe(true);
    expect(corsiaPhase2Eligible('ccp_conditional')).toBe(false);
    expect(corsiaPhase2Eligible('ccp_not_eligible')).toBe(false);
  });
  it('sylveraGradeEquivalent letter mapping', () => {
    expect(sylveraGradeEquivalent(95)).toBe('AAA');
    expect(sylveraGradeEquivalent(87)).toBe('AA');
    expect(sylveraGradeEquivalent(82)).toBe('A');
    expect(sylveraGradeEquivalent(77)).toBe('BBB');
    expect(sylveraGradeEquivalent(72)).toBe('BB');
    expect(sylveraGradeEquivalent(67)).toBe('B');
    expect(sylveraGradeEquivalent(57)).toBe('C');
    expect(sylveraGradeEquivalent(47)).toBe('D');
    expect(sylveraGradeEquivalent(20)).toBe('F');
  });
  it('premiumPricingUpliftPct: 30 / 15 / 0', () => {
    expect(premiumPricingUpliftPct('ccp_eligible')).toBe(30);
    expect(premiumPricingUpliftPct('ccp_conditional')).toBe(15);
    expect(premiumPricingUpliftPct('ccp_not_eligible')).toBe(0);
  });
  it('predictedAssessmentDays sums forward path SLA windows for tier', () => {
    // minor: 3+5+7+14+10+7 = 46 days
    expect(predictedAssessmentDays('minor')).toBe(46);
    // mega: 10+14+21+45+30+21 = 141 days
    expect(predictedAssessmentDays('mega')).toBe(141);
    // larger tier ⇒ longer predicted turnaround (INVERTED)
    expect(predictedAssessmentDays('major')).toBeGreaterThan(predictedAssessmentDays('moderate'));
    expect(predictedAssessmentDays('moderate')).toBeGreaterThan(predictedAssessmentDays('minor'));
  });
});

describe('all sectors are typed', () => {
  it('12 sectors compile and isHighIntegrityRisk classifies each', () => {
    for (const s of SECTORS) {
      const cl = isHighIntegrityRisk(s);
      expect(typeof cl).toBe('boolean');
    }
  });
});
