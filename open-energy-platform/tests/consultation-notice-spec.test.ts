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
  isLargeTier,
  baseTierForAffectedParties,
  isBindingClass,
  tierForAffectedParties,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  daysUntilCommentClose,
  daysInCommentPeriod,
  proceduralValidityOk,
  balanceIndex,
  representativenessIndex,
  coverageCompleteness,
  judicialReviewRiskScore,
  predictedConsultationDays,
  type ConsultationStatus,
  type ConsultationAction,
  type ConsultationTier,
} from '../src/utils/consultation-notice-spec';

const GRADED: ConsultationStatus[] = [
  'drafted',
  'published',
  'open_for_comment',
  'comment_period_closed',
  'hearing_scheduled',
  'hearing_held',
  'analysis',
  'response_drafted',
  'on_hold',
];
const TERMINAL_STATES: ConsultationStatus[] = ['adopted', 'withdrawn', 'cancelled'];
const TIERS: ConsultationTier[] = ['minor', 'standard', 'material', 'landmark'];

describe('terminals & cancellability', () => {
  it('marks the three terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminal graded states are not terminal', () => {
    for (const s of GRADED) expect(isTerminal(s)).toBe(false);
  });
  it('all pre-adopted graded states are cancellable', () => {
    for (const s of GRADED) expect(isCancellable(s)).toBe(true);
  });
  it('terminal states are not cancellable', () => {
    for (const s of TERMINAL_STATES) expect(isCancellable(s)).toBe(false);
  });
});

describe('transitions', () => {
  it('clean path drafted → published → open_for_comment → comment_period_closed → analysis → response_drafted → adopted', () => {
    expect(nextStatus('drafted', 'publish_notice')).toBe('published');
    expect(nextStatus('published', 'open_comment_period')).toBe('open_for_comment');
    expect(nextStatus('open_for_comment', 'close_comment_period')).toBe('comment_period_closed');
    expect(nextStatus('comment_period_closed', 'begin_analysis')).toBe('analysis');
    expect(nextStatus('analysis', 'draft_response')).toBe('response_drafted');
    expect(nextStatus('response_drafted', 'adopt_decision')).toBe('adopted');
  });
  it('hearing branch: comment_period_closed → hearing_scheduled → hearing_held → analysis', () => {
    expect(nextStatus('comment_period_closed', 'schedule_hearing')).toBe('hearing_scheduled');
    expect(nextStatus('hearing_scheduled', 'hold_hearing')).toBe('hearing_held');
    expect(nextStatus('hearing_held', 'begin_analysis')).toBe('analysis');
  });
  it('extension self-loops open_for_comment', () => {
    expect(nextStatus('open_for_comment', 'extend_comment_period')).toBe('open_for_comment');
  });
  it('reopen returns from comment_period_closed back to open_for_comment', () => {
    expect(nextStatus('comment_period_closed', 'reopen_for_comment')).toBe('open_for_comment');
  });
  it('on_hold branch + resume to analysis', () => {
    expect(nextStatus('published', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('open_for_comment', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('analysis', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('on_hold', 'resume')).toBe('analysis');
  });
  it('withdraw_notice from every pre-adopted state', () => {
    for (const s of GRADED) expect(nextStatus(s, 'withdraw_notice')).toBe('withdrawn');
  });
  it('cancel from every pre-adopted state', () => {
    for (const s of GRADED) expect(nextStatus(s, 'cancel')).toBe('cancelled');
  });
  it('terminal states reject every action', () => {
    for (const s of TERMINAL_STATES) {
      for (const a of Object.keys(TRANSITIONS) as ConsultationAction[]) {
        expect(nextStatus(s, a)).toBeNull();
      }
    }
  });
  it('illegal transitions return null', () => {
    expect(nextStatus('drafted', 'open_comment_period')).toBeNull();
    expect(nextStatus('published', 'adopt_decision')).toBeNull();
    expect(nextStatus('analysis', 'publish_notice')).toBeNull();
  });
});

describe('allowedActions', () => {
  it('drafted offers publish_notice + withdraw + cancel', () => {
    const acts = allowedActions('drafted');
    expect(acts).toContain('publish_notice');
    expect(acts).toContain('withdraw_notice');
    expect(acts).toContain('cancel');
  });
  it('open_for_comment offers extend, close, hold, withdraw, cancel', () => {
    const acts = allowedActions('open_for_comment');
    expect(acts).toContain('extend_comment_period');
    expect(acts).toContain('close_comment_period');
    expect(acts).toContain('place_on_hold');
    expect(acts).toContain('withdraw_notice');
    expect(acts).toContain('cancel');
  });
  it('comment_period_closed offers reopen, schedule_hearing, begin_analysis', () => {
    const acts = allowedActions('comment_period_closed');
    expect(acts).toContain('reopen_for_comment');
    expect(acts).toContain('schedule_hearing');
    expect(acts).toContain('begin_analysis');
  });
});

describe('INVERTED SLA matrix', () => {
  it('larger tier has longer window for every graded state', () => {
    const gradedSla: ConsultationStatus[] = [
      'drafted', 'published', 'open_for_comment', 'comment_period_closed',
      'hearing_scheduled', 'hearing_held', 'analysis', 'response_drafted', 'on_hold',
    ];
    for (const s of gradedSla) {
      const minor = SLA_MINUTES[s].minor;
      const standard = SLA_MINUTES[s].standard;
      const material = SLA_MINUTES[s].material;
      const landmark = SLA_MINUTES[s].landmark;
      expect(minor).toBeLessThan(standard);
      expect(standard).toBeLessThan(material);
      expect(material).toBeLessThan(landmark);
    }
  });
  it('terminals carry no SLA', () => {
    for (const s of TERMINAL_STATES) {
      for (const t of TIERS) expect(SLA_MINUTES[s][t]).toBe(0);
    }
  });
  it('slaWindowMinutes matches the matrix', () => {
    expect(slaWindowMinutes('open_for_comment', 'minor')).toBe(SLA_MINUTES.open_for_comment.minor);
    expect(slaWindowMinutes('analysis', 'landmark')).toBe(SLA_MINUTES.analysis.landmark);
    expect(slaWindowMinutes('adopted', 'minor')).toBe(0);
  });
  it('slaDeadlineFor returns null for terminals', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(slaDeadlineFor('adopted', 'minor', t)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'major' as ConsultationTier, t)).toBeNull();
  });
  it('open_for_comment honours the statutory 30-day standard tier floor', () => {
    expect(SLA_MINUTES.open_for_comment.standard).toBeGreaterThanOrEqual(30 * 24 * 60);
  });
  it('open_for_comment landmark tier is at least 60 days', () => {
    expect(SLA_MINUTES.open_for_comment.landmark).toBeGreaterThanOrEqual(60 * 24 * 60);
  });
});

describe('tier derivation by affected parties + binding floor', () => {
  it('base tier brackets', () => {
    expect(baseTierForAffectedParties(0)).toBe('minor');
    expect(baseTierForAffectedParties(49)).toBe('minor');
    expect(baseTierForAffectedParties(50)).toBe('standard');
    expect(baseTierForAffectedParties(499)).toBe('standard');
    expect(baseTierForAffectedParties(500)).toBe('material');
    expect(baseTierForAffectedParties(4999)).toBe('material');
    expect(baseTierForAffectedParties(5000)).toBe('landmark');
    expect(baseTierForAffectedParties(100000)).toBe('landmark');
  });
  it('binding-class floors at material regardless of count', () => {
    expect(tierForAffectedParties(10, 'binding')).toBe('material');
    expect(tierForAffectedParties(100, 'binding')).toBe('material');
    expect(tierForAffectedParties(4999, 'binding')).toBe('material');
    expect(tierForAffectedParties(5000, 'binding')).toBe('landmark');
  });
  it('guidance/consultative classes do not floor', () => {
    expect(tierForAffectedParties(10, 'guidance')).toBe('minor');
    expect(tierForAffectedParties(100, 'consultative')).toBe('standard');
  });
  it('isBindingClass', () => {
    expect(isBindingClass('binding')).toBe(true);
    expect(isBindingClass('guidance')).toBe(false);
    expect(isBindingClass('consultative')).toBe(false);
  });
});

describe('regulator crossings (TRANSPARENCY signature)', () => {
  it('withdraw_notice crosses for EVERY tier — the W83 hard line', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('withdraw_notice', t, false)).toBe(true);
      expect(crossesIntoRegulator('withdraw_notice', t, true)).toBe(true);
    }
  });
  it('adopt_decision crosses for EVERY tier when binding-class', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('adopt_decision', t, true)).toBe(true);
    }
  });
  it('adopt_decision crosses for large tiers only when not binding', () => {
    expect(crossesIntoRegulator('adopt_decision', 'minor', false)).toBe(false);
    expect(crossesIntoRegulator('adopt_decision', 'standard', false)).toBe(false);
    expect(crossesIntoRegulator('adopt_decision', 'material', false)).toBe(true);
    expect(crossesIntoRegulator('adopt_decision', 'landmark', false)).toBe(true);
  });
  it('extend_comment_period crosses for large tiers only', () => {
    expect(crossesIntoRegulator('extend_comment_period', 'minor', false)).toBe(false);
    expect(crossesIntoRegulator('extend_comment_period', 'standard', false)).toBe(false);
    expect(crossesIntoRegulator('extend_comment_period', 'material', false)).toBe(true);
    expect(crossesIntoRegulator('extend_comment_period', 'landmark', false)).toBe(true);
  });
  it('other actions do not cross', () => {
    expect(crossesIntoRegulator('publish_notice', 'landmark', true)).toBe(false);
    expect(crossesIntoRegulator('close_comment_period', 'material', true)).toBe(false);
    expect(crossesIntoRegulator('begin_analysis', 'landmark', false)).toBe(false);
  });
  it('SLA breach crosses for large tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('landmark')).toBe(true);
  });
  it('isReportable: binding OR large tier', () => {
    expect(isReportable('minor', false)).toBe(false);
    expect(isReportable('standard', false)).toBe(false);
    expect(isReportable('material', false)).toBe(true);
    expect(isReportable('landmark', false)).toBe(true);
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('standard', true)).toBe(true);
  });
});

describe('isLargeTier + partyForAction', () => {
  it('isLargeTier flags material+landmark only', () => {
    expect(isLargeTier('minor')).toBe(false);
    expect(isLargeTier('standard')).toBe(false);
    expect(isLargeTier('material')).toBe(true);
    expect(isLargeTier('landmark')).toBe(true);
  });
  it('partyForAction maps actions to functional parties', () => {
    expect(partyForAction('publish_notice')).toBe('secretariat');
    expect(partyForAction('hold_hearing')).toBe('presiding_member');
    expect(partyForAction('adopt_decision')).toBe('presiding_member');
    expect(partyForAction('begin_analysis')).toBe('panel');
    expect(partyForAction('draft_response')).toBe('panel');
    expect(partyForAction('withdraw_notice')).toBe('presiding_member');
    expect(partyForAction('cancel')).toBe('secretariat');
  });
});

describe('live consultation-health battery', () => {
  it('daysUntilCommentClose computes positive when in future, negative when past', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(daysUntilCommentClose(new Date('2026-06-15T00:00:00Z'), now)).toBe(14);
    expect(daysUntilCommentClose(new Date('2026-05-25T00:00:00Z'), now)).toBe(-7);
    expect(daysUntilCommentClose(null, now)).toBeNull();
  });
  it('daysInCommentPeriod clamps to >=0', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(daysInCommentPeriod(new Date('2026-05-15T00:00:00Z'), now)).toBe(17);
    expect(daysInCommentPeriod(new Date('2026-06-10T00:00:00Z'), now)).toBe(0);
    expect(daysInCommentPeriod(null, now)).toBeNull();
  });
  it('proceduralValidityOk honours the statutory minimum + binding hearing', () => {
    // Standard tier requires 30-day comment period.
    const start = new Date('2026-04-01T00:00:00Z');
    const closeFar = new Date('2026-05-15T00:00:00Z'); // ~44 days
    const closeNear = new Date('2026-04-15T00:00:00Z'); // ~14 days
    const hearing = new Date('2026-05-20T00:00:00Z');
    expect(proceduralValidityOk('standard', start, closeFar, hearing, false)).toBe(true);
    expect(proceduralValidityOk('standard', start, closeNear, hearing, false)).toBe(false);
    expect(proceduralValidityOk('standard', start, closeFar, null, true)).toBe(false);
    expect(proceduralValidityOk('standard', start, closeFar, hearing, true)).toBe(true);
    expect(proceduralValidityOk('minor', start, closeNear, null, false)).toBe(true);
  });
  it('balanceIndex: 1 for uniform, 0 for single-bucket', () => {
    expect(balanceIndex({})).toBe(0);
    expect(balanceIndex({ industry: 5, consumer: 5, civil_society: 5, ipp: 5, government: 5 })).toBe(1);
    expect(balanceIndex({ industry: 10 })).toBe(0);
    const mid = balanceIndex({ industry: 8, consumer: 1, civil_society: 1 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it('representativenessIndex blends provinces + sectors', () => {
    expect(representativenessIndex(0, 0)).toBe(0);
    expect(representativenessIndex(9, 8)).toBe(1);
    expect(representativenessIndex(5, 4)).toBeCloseTo((5 / 9 + 4 / 8) / 2, 5);
  });
  it('coverageCompleteness clamps', () => {
    expect(coverageCompleteness(0, 10)).toBe(0);
    expect(coverageCompleteness(5, 10)).toBe(0.5);
    expect(coverageCompleteness(15, 10)).toBe(1);
    expect(coverageCompleteness(5, 0)).toBe(0);
  });
  it('judicialReviewRiskScore accumulates flags', () => {
    expect(judicialReviewRiskScore(true, 0.9, 0.9, 0.9, 0, 100)).toBe(0);
    expect(judicialReviewRiskScore(false, 0.2, 0.4, 0.2, 3, 5)).toBe(100);
    expect(judicialReviewRiskScore(true, 0.2, 0.9, 0.9, 0, 100)).toBe(20);
  });
  it('predictedConsultationDays sums forward-path windows + grows with tier', () => {
    expect(predictedConsultationDays('minor')).toBeGreaterThan(0);
    expect(predictedConsultationDays('standard')).toBeGreaterThan(predictedConsultationDays('minor'));
    expect(predictedConsultationDays('material')).toBeGreaterThan(predictedConsultationDays('standard'));
    expect(predictedConsultationDays('landmark')).toBeGreaterThan(predictedConsultationDays('material'));
  });
});
