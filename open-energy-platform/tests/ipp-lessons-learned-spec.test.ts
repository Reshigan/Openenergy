// Wave 135 — IPP Lessons Learned Register spec tests
// PMBOK 7 / ISO 21502:2022 §12.6 dissemination tracking.
// INVERTED SLA: critical_impact 720h MOST time; low_impact 168h LEAST time.
// SIGNATURE: disseminate_finding EVERY tier when lesson_type='safety' OR prevents_fatality=1.
import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isHardTerminal,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  slaDeadlineFor,
  slaHoursRemaining,
  eventTypeFor,
  statusTsCol,
  SLA_HOURS,
  TRANSITIONS,
  HARD_TERMINALS,
  IMPACT_TIER_LABELS,
  LESSON_TYPE_LABELS,
  LESSON_CATEGORY_LABELS,
  LESSON_PHASE_LABELS,
  RCA_METHOD_LABELS,
  type LessonStatus,
  type LessonAction,
  type ImpactTier,
} from '../src/utils/ipp-lessons-learned-spec';

// ─── Forward path ─────────────────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[LessonStatus, LessonAction, LessonStatus]> = [
    ['captured',              'categorize_lesson',    'categorized'],
    ['categorized',           'analyze_root_cause',   'root_cause_analyzed'],
    ['root_cause_analyzed',   'assess_impact',        'impact_assessed'],
    ['impact_assessed',       'draft_recommendation', 'recommendation_drafted'],
    ['recommendation_drafted','submit_for_review',    'peer_reviewed'],
    ['peer_reviewed',         'approve_lesson',       'approved'],
    ['approved',              'disseminate_finding',  'disseminated'],
    ['disseminated',          'confirm_applied',      'applied'],
    ['applied',               'archive_lesson',       'archived'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('full chain has 9 forward steps', () => {
    expect(path).toHaveLength(9);
  });

  it('rejects wrong from-state: captured + analyze_root_cause => null', () => {
    expect(nextStatus('captured', 'analyze_root_cause')).toBeNull();
  });

  it('rejects wrong from-state: captured + disseminate_finding => null', () => {
    expect(nextStatus('captured', 'disseminate_finding')).toBeNull();
  });

  it('rejects wrong from-state: approved + categorize_lesson => null', () => {
    expect(nextStatus('approved', 'categorize_lesson')).toBeNull();
  });
});

// ─── reject_lesson ─────────────────────────────────────────────────────────────
describe('reject_lesson', () => {
  it('peer_reviewed + reject_lesson => rejected', () => {
    expect(nextStatus('peer_reviewed', 'reject_lesson')).toBe('rejected');
  });

  it('approved cannot reject', () => {
    expect(nextStatus('approved', 'reject_lesson')).toBeNull();
  });

  it('captured cannot reject', () => {
    expect(nextStatus('captured', 'reject_lesson')).toBeNull();
  });

  it('rejected is a hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(true);
  });
});

// ─── defer_lesson + restore_lesson cycle ──────────────────────────────────────
describe('defer_lesson + restore_lesson cycle', () => {
  const deferableStates: LessonStatus[] = [
    'captured', 'categorized', 'root_cause_analyzed', 'impact_assessed',
    'recommendation_drafted', 'peer_reviewed', 'approved', 'disseminated', 'applied',
  ];

  it.each(deferableStates)('%s + defer_lesson => deferred', (status) => {
    expect(nextStatus(status, 'defer_lesson')).toBe('deferred');
  });

  it('deferred + restore_lesson => captured', () => {
    expect(nextStatus('deferred', 'restore_lesson')).toBe('captured');
  });

  it('captured cannot restore (not deferred)', () => {
    expect(nextStatus('captured', 'restore_lesson')).toBeNull();
  });

  it('archived cannot defer (hard terminal)', () => {
    expect(nextStatus('archived', 'defer_lesson')).toBeNull();
  });

  it('rejected cannot defer (hard terminal)', () => {
    expect(nextStatus('rejected', 'defer_lesson')).toBeNull();
  });
});

// ─── mark_duplicate ───────────────────────────────────────────────────────────
describe('mark_duplicate', () => {
  const duplicateStates: LessonStatus[] = [
    'captured', 'categorized', 'root_cause_analyzed', 'impact_assessed',
    'recommendation_drafted',
  ];

  it.each(duplicateStates)('%s + mark_duplicate => duplicate', (status) => {
    expect(nextStatus(status, 'mark_duplicate')).toBe('duplicate');
  });

  it('peer_reviewed cannot mark_duplicate (not in from-list)', () => {
    expect(nextStatus('peer_reviewed', 'mark_duplicate')).toBeNull();
  });

  it('approved cannot mark_duplicate', () => {
    expect(nextStatus('approved', 'mark_duplicate')).toBeNull();
  });

  it('duplicate is a hard terminal', () => {
    expect(isHardTerminal('duplicate')).toBe(true);
  });
});

// ─── Hard terminals ────────────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('archived is a hard terminal', () => {
    expect(isHardTerminal('archived')).toBe(true);
  });

  it('rejected is a hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(true);
  });

  it('duplicate is a hard terminal', () => {
    expect(isHardTerminal('duplicate')).toBe(true);
  });

  it('HARD_TERMINALS array has 3 entries', () => {
    expect(HARD_TERMINALS).toHaveLength(3);
  });

  it('HARD_TERMINALS contains archived, rejected, duplicate', () => {
    expect(HARD_TERMINALS).toContain('archived');
    expect(HARD_TERMINALS).toContain('rejected');
    expect(HARD_TERMINALS).toContain('duplicate');
  });

  it('applied is NOT a hard terminal', () => {
    expect(isHardTerminal('applied')).toBe(false);
  });

  it('deferred is NOT a hard terminal', () => {
    expect(isHardTerminal('deferred')).toBe(false);
  });

  it('archived blocks all transitions', () => {
    expect(nextStatus('archived', 'categorize_lesson')).toBeNull();
    expect(nextStatus('archived', 'disseminate_finding')).toBeNull();
    expect(nextStatus('archived', 'defer_lesson')).toBeNull();
    expect(nextStatus('archived', 'restore_lesson')).toBeNull();
  });

  it('rejected blocks all transitions', () => {
    expect(nextStatus('rejected', 'restore_lesson')).toBeNull();
    expect(nextStatus('rejected', 'defer_lesson')).toBeNull();
    expect(nextStatus('rejected', 'categorize_lesson')).toBeNull();
  });

  it('duplicate blocks all transitions', () => {
    expect(nextStatus('duplicate', 'categorize_lesson')).toBeNull();
    expect(nextStatus('duplicate', 'restore_lesson')).toBeNull();
  });
});

// ─── INVERTED SLA polarity ─────────────────────────────────────────────────────
describe('INVERTED SLA polarity', () => {
  it('critical_impact = 720h (most time — INVERTED)', () => {
    expect(SLA_HOURS['critical_impact']).toBe(720);
  });

  it('high_impact = 480h', () => {
    expect(SLA_HOURS['high_impact']).toBe(480);
  });

  it('medium_impact = 336h', () => {
    expect(SLA_HOURS['medium_impact']).toBe(336);
  });

  it('low_impact = 168h (least time — INVERTED)', () => {
    expect(SLA_HOURS['low_impact']).toBe(168);
  });

  it('INVERTED polarity: critical_impact > high_impact > medium_impact > low_impact', () => {
    const tiers: ImpactTier[] = ['critical_impact', 'high_impact', 'medium_impact', 'low_impact'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(SLA_HOURS[tiers[i]]).toBeGreaterThan(SLA_HOURS[tiers[i + 1]]);
    }
  });

  it('SLA_HOURS has all 4 impact tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(4);
  });

  it('slaDeadlineFor critical_impact = 720h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('critical_impact', from);
    expect(deadline.getTime()).toBe(from.getTime() + 720 * 3600 * 1000);
  });

  it('slaDeadlineFor low_impact = 168h from now', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('low_impact', from);
    expect(deadline.getTime()).toBe(from.getTime() + 168 * 3600 * 1000);
  });

  it('slaHoursRemaining positive when not breached', () => {
    const future = new Date(Date.now() + 100 * 3600 * 1000);
    expect(slaHoursRemaining(future.toISOString(), new Date())).toBeGreaterThan(0);
  });

  it('slaHoursRemaining negative when breached', () => {
    const past = new Date(Date.now() - 10 * 3600 * 1000);
    expect(slaHoursRemaining(past.toISOString(), new Date())).toBeLessThan(0);
  });

  it('slaHoursRemaining null when no deadline', () => {
    expect(slaHoursRemaining(null, new Date())).toBeNull();
  });
});

// ─── W135 SIGNATURE: crossesIntoRegulator ────────────────────────────────────
describe('W135 SIGNATURE: crossesIntoRegulator', () => {
  it('disseminate_finding with lesson_type=safety crosses EVERY tier (W135 SIGNATURE)', () => {
    expect(crossesIntoRegulator('disseminate_finding', { lesson_type: 'safety' })).toBe(true);
  });

  it('disseminate_finding with prevents_fatality=1 crosses EVERY tier (W135 SIGNATURE)', () => {
    expect(crossesIntoRegulator('disseminate_finding', { prevents_fatality: 1 })).toBe(true);
  });

  it('disseminate_finding with prevents_fatality=true crosses', () => {
    expect(crossesIntoRegulator('disseminate_finding', { prevents_fatality: true })).toBe(true);
  });

  it('disseminate_finding with lesson_type=positive does NOT cross', () => {
    expect(crossesIntoRegulator('disseminate_finding', { lesson_type: 'positive' })).toBe(false);
  });

  it('disseminate_finding with lesson_type=negative does NOT cross', () => {
    expect(crossesIntoRegulator('disseminate_finding', { lesson_type: 'negative' })).toBe(false);
  });

  it('disseminate_finding with no type and prevents_fatality=0 does NOT cross', () => {
    expect(crossesIntoRegulator('disseminate_finding', { prevents_fatality: 0 })).toBe(false);
  });

  it('disseminate_finding with undefined args does NOT cross', () => {
    expect(crossesIntoRegulator('disseminate_finding', {})).toBe(false);
  });

  it('categorize_lesson never crosses', () => {
    expect(crossesIntoRegulator('categorize_lesson', { lesson_type: 'safety' })).toBe(false);
  });

  it('approve_lesson never crosses even with safety', () => {
    expect(crossesIntoRegulator('approve_lesson', { lesson_type: 'safety' })).toBe(false);
  });

  it('archive_lesson never crosses', () => {
    expect(crossesIntoRegulator('archive_lesson', { lesson_type: 'safety', prevents_fatality: 1 })).toBe(false);
  });

  it('reject_lesson never crosses', () => {
    expect(crossesIntoRegulator('reject_lesson', { lesson_type: 'safety' })).toBe(false);
  });

  it('defer_lesson never crosses', () => {
    expect(crossesIntoRegulator('defer_lesson', { lesson_type: 'safety' })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('safety_critical + critical_impact crosses', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', { floor_safety_critical: 1 })).toBe(true);
  });

  it('safety_critical + high_impact crosses', () => {
    expect(slaBreachCrossesIntoRegulator('high_impact', { floor_safety_critical: 1 })).toBe(true);
  });

  it('safety_critical + medium_impact does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('medium_impact', { floor_safety_critical: 1 })).toBe(false);
  });

  it('safety_critical + low_impact does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('low_impact', { floor_safety_critical: 1 })).toBe(false);
  });

  it('lesson_type=safety ALWAYS crosses regardless of tier', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', { lesson_type: 'safety' })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('high_impact', { lesson_type: 'safety' })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('medium_impact', { lesson_type: 'safety' })).toBe(true);
    expect(slaBreachCrossesIntoRegulator('low_impact', { lesson_type: 'safety' })).toBe(true);
  });

  it('critical_impact WITHOUT safety_critical does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', { floor_safety_critical: 0 })).toBe(false);
  });

  it('critical_impact with undefined floor does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', {})).toBe(false);
  });

  it('positive lesson_type does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', { lesson_type: 'positive' })).toBe(false);
  });
});

// ─── statusTsCol: all 13 states ───────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[LessonStatus, string]> = [
    ['captured',               'captured_at'],
    ['categorized',            'categorized_at'],
    ['root_cause_analyzed',    'root_cause_analyzed_at'],
    ['impact_assessed',        'impact_assessed_at'],
    ['recommendation_drafted', 'recommendation_drafted_at'],
    ['peer_reviewed',          'peer_reviewed_at'],
    ['approved',               'approved_at'],
    ['disseminated',           'disseminated_at'],
    ['applied',                'applied_at'],
    ['archived',               'archived_at'],
    ['rejected',               'rejected_at'],
    ['deferred',               'deferred_at'],
    ['duplicate',              'duplicate_at'],
  ];

  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });

  it('covers all 13 states', () => {
    expect(cases).toHaveLength(13);
  });
});

// ─── eventTypeFor: all 13 actions ────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[LessonAction, string]> = [
    ['categorize_lesson',    'ipp_lessons_learned.categorize_lesson'],
    ['analyze_root_cause',   'ipp_lessons_learned.analyze_root_cause'],
    ['assess_impact',        'ipp_lessons_learned.assess_impact'],
    ['draft_recommendation', 'ipp_lessons_learned.draft_recommendation'],
    ['submit_for_review',    'ipp_lessons_learned.submit_for_review'],
    ['approve_lesson',       'ipp_lessons_learned.approve_lesson'],
    ['disseminate_finding',  'ipp_lessons_learned.disseminate_finding'],
    ['confirm_applied',      'ipp_lessons_learned.confirm_applied'],
    ['archive_lesson',       'ipp_lessons_learned.archive_lesson'],
    ['reject_lesson',        'ipp_lessons_learned.reject_lesson'],
    ['defer_lesson',         'ipp_lessons_learned.defer_lesson'],
    ['mark_duplicate',       'ipp_lessons_learned.mark_duplicate'],
    ['restore_lesson',       'ipp_lessons_learned.restore_lesson'],
  ];

  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });

  it('all 13 actions are mapped', () => {
    expect(cases).toHaveLength(13);
  });
});

// ─── IMPACT_TIER_LABELS ────────────────────────────────────────────────────────
describe('IMPACT_TIER_LABELS', () => {
  it('has 4 tier labels', () => {
    expect(Object.keys(IMPACT_TIER_LABELS)).toHaveLength(4);
  });

  it('critical_impact = Critical impact', () => {
    expect(IMPACT_TIER_LABELS['critical_impact']).toBe('Critical impact');
  });

  it('high_impact = High impact', () => {
    expect(IMPACT_TIER_LABELS['high_impact']).toBe('High impact');
  });

  it('medium_impact = Medium impact', () => {
    expect(IMPACT_TIER_LABELS['medium_impact']).toBe('Medium impact');
  });

  it('low_impact = Low impact', () => {
    expect(IMPACT_TIER_LABELS['low_impact']).toBe('Low impact');
  });
});

// ─── LESSON_TYPE_LABELS ────────────────────────────────────────────────────────
describe('LESSON_TYPE_LABELS', () => {
  it('has 3 type labels', () => {
    expect(Object.keys(LESSON_TYPE_LABELS)).toHaveLength(3);
  });

  it('positive = Positive', () => {
    expect(LESSON_TYPE_LABELS['positive']).toBe('Positive');
  });

  it('negative = Negative', () => {
    expect(LESSON_TYPE_LABELS['negative']).toBe('Negative');
  });

  it('safety = Safety observation', () => {
    expect(LESSON_TYPE_LABELS['safety']).toBe('Safety observation');
  });
});

// ─── LESSON_CATEGORY_LABELS ────────────────────────────────────────────────────
describe('LESSON_CATEGORY_LABELS', () => {
  it('has 12 category labels', () => {
    expect(Object.keys(LESSON_CATEGORY_LABELS)).toHaveLength(12);
  });

  it('technical = Technical', () => {
    expect(LESSON_CATEGORY_LABELS['technical']).toBe('Technical');
  });

  it('schedule = Schedule', () => {
    expect(LESSON_CATEGORY_LABELS['schedule']).toBe('Schedule');
  });

  it('cost = Cost', () => {
    expect(LESSON_CATEGORY_LABELS['cost']).toBe('Cost');
  });

  it('safety = Safety', () => {
    expect(LESSON_CATEGORY_LABELS['safety']).toBe('Safety');
  });

  it('procurement = Procurement', () => {
    expect(LESSON_CATEGORY_LABELS['procurement']).toBe('Procurement');
  });

  it('stakeholder = Stakeholder', () => {
    expect(LESSON_CATEGORY_LABELS['stakeholder']).toBe('Stakeholder');
  });

  it('regulatory = Regulatory', () => {
    expect(LESSON_CATEGORY_LABELS['regulatory']).toBe('Regulatory');
  });

  it('environmental = Environmental', () => {
    expect(LESSON_CATEGORY_LABELS['environmental']).toBe('Environmental');
  });

  it('quality = Quality', () => {
    expect(LESSON_CATEGORY_LABELS['quality']).toBe('Quality');
  });

  it('risk = Risk', () => {
    expect(LESSON_CATEGORY_LABELS['risk']).toBe('Risk');
  });

  it('financial = Financial', () => {
    expect(LESSON_CATEGORY_LABELS['financial']).toBe('Financial');
  });

  it('contractual = Contractual', () => {
    expect(LESSON_CATEGORY_LABELS['contractual']).toBe('Contractual');
  });
});

// ─── LESSON_PHASE_LABELS ───────────────────────────────────────────────────────
describe('LESSON_PHASE_LABELS', () => {
  it('has 7 phase labels', () => {
    expect(Object.keys(LESSON_PHASE_LABELS)).toHaveLength(7);
  });

  it('development = Development', () => {
    expect(LESSON_PHASE_LABELS['development']).toBe('Development');
  });

  it('permitting = Permitting', () => {
    expect(LESSON_PHASE_LABELS['permitting']).toBe('Permitting');
  });

  it('procurement = Procurement', () => {
    expect(LESSON_PHASE_LABELS['procurement']).toBe('Procurement');
  });

  it('construction = Construction', () => {
    expect(LESSON_PHASE_LABELS['construction']).toBe('Construction');
  });

  it('commissioning = Commissioning', () => {
    expect(LESSON_PHASE_LABELS['commissioning']).toBe('Commissioning');
  });

  it('operations = Operations', () => {
    expect(LESSON_PHASE_LABELS['operations']).toBe('Operations');
  });

  it('decommissioning = Decommissioning', () => {
    expect(LESSON_PHASE_LABELS['decommissioning']).toBe('Decommissioning');
  });
});

// ─── RCA_METHOD_LABELS ────────────────────────────────────────────────────────
describe('RCA_METHOD_LABELS', () => {
  it('has 6 RCA method labels', () => {
    expect(Object.keys(RCA_METHOD_LABELS)).toHaveLength(6);
  });

  it('five_whys = 5 Whys', () => {
    expect(RCA_METHOD_LABELS['five_whys']).toBe('5 Whys');
  });

  it('fishbone = Fishbone diagram', () => {
    expect(RCA_METHOD_LABELS['fishbone']).toBe('Fishbone diagram');
  });

  it('fmea = FMEA', () => {
    expect(RCA_METHOD_LABELS['fmea']).toBe('FMEA');
  });

  it('fault_tree = Fault tree analysis', () => {
    expect(RCA_METHOD_LABELS['fault_tree']).toBe('Fault tree analysis');
  });

  it('timeline_analysis = Timeline analysis', () => {
    expect(RCA_METHOD_LABELS['timeline_analysis']).toBe('Timeline analysis');
  });

  it('none = Not yet performed', () => {
    expect(RCA_METHOD_LABELS['none']).toBe('Not yet performed');
  });
});

// ─── TRANSITIONS record completeness ──────────────────────────────────────────
describe('TRANSITIONS record', () => {
  it('has 13 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(13);
  });

  it('all actions have from (array) and to (string)', () => {
    for (const [, t] of Object.entries(TRANSITIONS)) {
      expect(Array.isArray(t.from)).toBe(true);
      expect(typeof t.to).toBe('string');
    }
  });
});

// ─── Cron action: deferred lesson can be restored ────────────────────────────
describe('cron action — deferred restore cycle', () => {
  it('lesson can be deferred from any non-terminal state', () => {
    expect(nextStatus('captured', 'defer_lesson')).toBe('deferred');
    expect(nextStatus('peer_reviewed', 'defer_lesson')).toBe('deferred');
    expect(nextStatus('approved', 'defer_lesson')).toBe('deferred');
    expect(nextStatus('applied', 'defer_lesson')).toBe('deferred');
  });

  it('deferred lesson restored to captured', () => {
    expect(nextStatus('deferred', 'restore_lesson')).toBe('captured');
  });

  it('restored lesson can continue forward path', () => {
    const afterRestore = nextStatus('deferred', 'restore_lesson')!;
    expect(afterRestore).toBe('captured');
    expect(nextStatus(afterRestore, 'categorize_lesson')).toBe('categorized');
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('null from invalid action string', () => {
    expect(nextStatus('captured', 'invalid_action' as LessonAction)).toBeNull();
  });

  it('null when attempting hard terminal transition', () => {
    expect(nextStatus('archived', 'archive_lesson')).toBeNull();
    expect(nextStatus('rejected', 'reject_lesson')).toBeNull();
    expect(nextStatus('duplicate', 'mark_duplicate')).toBeNull();
  });

  it('captured → categorized → root_cause_analyzed: sequential steps enforced', () => {
    expect(nextStatus('captured', 'analyze_root_cause')).toBeNull();
    expect(nextStatus('captured', 'categorize_lesson')).toBe('categorized');
    expect(nextStatus('categorized', 'analyze_root_cause')).toBe('root_cause_analyzed');
  });

  it('disseminate_finding requires approved state', () => {
    expect(nextStatus('captured', 'disseminate_finding')).toBeNull();
    expect(nextStatus('peer_reviewed', 'disseminate_finding')).toBeNull();
    expect(nextStatus('approved', 'disseminate_finding')).toBe('disseminated');
  });

  it('crossesIntoRegulator: both safety type AND prevents_fatality set => crosses once', () => {
    expect(crossesIntoRegulator('disseminate_finding', {
      lesson_type: 'safety',
      prevents_fatality: 1,
    })).toBe(true);
  });

  it('slaHoursRemaining: exact boundary (0h) returns 0', () => {
    const now = new Date();
    expect(slaHoursRemaining(now.toISOString(), now)).toBe(0);
  });
});
