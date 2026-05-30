// Wave 94 — REZ Capacity Allocation & Auction spec tests.
import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  SCORE_WEIGHTS,
  LOCAL_CONTENT_THRESHOLD_PCT,
  nextStatus,
  allowedActions,
  isTerminal,
  isCancellable,
  isAllocationClass,
  isFloorAtMegaClass,
  isTier,
  tierFromCapacity,
  tierRank,
  isHighTier,
  effectiveCapacityMw,
  slaDeadlineFor,
  isReportable,
  actionCrossesRegulator,
  authorityFor,
  priceScore,
  localContentScore,
  weightedScore,
  remainingHeadroomMw,
  competitionRatio,
  competitionIntensityBand,
  milestoneCompliancePct,
  forfeitRatePct,
  predictedOperationDate,
  urgencyBand,
  inboxSeverityForTier,
  partyForAction,
  eventTypeFor,
  reasonCodeFor,
} from '../src/utils/rez-capacity-spec';

describe('W94 REZ capacity — state machine', () => {
  it('forward path is announcement → application → compliance → shortlisted → eval → award_proposed → capacity_awarded → financial_close → construction → in_operation', () => {
    expect(nextStatus('announcement_published', 'submit_application')).toBe('application_submitted');
    expect(nextStatus('application_submitted', 'start_compliance')).toBe('compliance_check');
    expect(nextStatus('compliance_check', 'shortlist')).toBe('shortlisted');
    expect(nextStatus('shortlisted', 'complete_evaluation')).toBe('evaluation_complete');
    expect(nextStatus('evaluation_complete', 'propose_award')).toBe('award_proposed');
    expect(nextStatus('award_proposed', 'award_capacity')).toBe('capacity_awarded');
    expect(nextStatus('capacity_awarded', 'confirm_financial_close')).toBe('financial_close_met');
    expect(nextStatus('financial_close_met', 'start_construction')).toBe('construction_in_progress');
    expect(nextStatus('construction_in_progress', 'confirm_operation')).toBe('in_operation');
  });

  it('rejected branch fires at compliance/shortlisted/evaluation/award_proposed', () => {
    expect(nextStatus('compliance_check', 'reject_application')).toBe('rejected');
    expect(nextStatus('shortlisted', 'reject_application')).toBe('rejected');
    expect(nextStatus('evaluation_complete', 'reject_application')).toBe('rejected');
    expect(nextStatus('award_proposed', 'reject_application')).toBe('rejected');
  });

  it('forfeit fires after capacity_awarded / financial_close / construction (milestone failures)', () => {
    expect(nextStatus('capacity_awarded', 'forfeit_allocation')).toBe('forfeit');
    expect(nextStatus('financial_close_met', 'forfeit_allocation')).toBe('forfeit');
    expect(nextStatus('construction_in_progress', 'forfeit_allocation')).toBe('forfeit');
  });

  it('withdraw works from every non-terminal state', () => {
    const nonTerminal = [
      'announcement_published', 'application_submitted', 'compliance_check',
      'shortlisted', 'evaluation_complete', 'award_proposed',
      'capacity_awarded', 'financial_close_met', 'construction_in_progress',
    ] as const;
    for (const s of nonTerminal) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
      expect(isCancellable(s)).toBe(true);
    }
  });

  it('terminals reject further actions', () => {
    expect(isTerminal('in_operation')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isTerminal('forfeit')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(allowedActions('in_operation')).toEqual([]);
    expect(nextStatus('in_operation', 'forfeit_allocation')).toBeNull();
    expect(isCancellable('in_operation')).toBe(false);
  });

  it('rejects invalid actions for current state', () => {
    expect(nextStatus('announcement_published', 'confirm_operation')).toBeNull();
    expect(nextStatus('compliance_check', 'award_capacity')).toBeNull();
    expect(nextStatus('award_proposed', 'confirm_financial_close')).toBeNull();
  });
});

describe('W94 REZ capacity — MW-magnitude tier with floor-at-mega', () => {
  it('minor < 50 MW / standard 50–250 / material 250–500 / mega ≥ 500', () => {
    expect(tierFromCapacity(10, 'standard_zone')).toBe('minor');
    expect(tierFromCapacity(49, 'standard_zone')).toBe('minor');
    expect(tierFromCapacity(50, 'standard_zone')).toBe('standard');
    expect(tierFromCapacity(249, 'standard_zone')).toBe('standard');
    expect(tierFromCapacity(250, 'standard_zone')).toBe('material');
    expect(tierFromCapacity(499, 'standard_zone')).toBe('material');
    expect(tierFromCapacity(500, 'standard_zone')).toBe('mega');
    expect(tierFromCapacity(1000, 'standard_zone')).toBe('mega');
  });

  it('floor-at-mega for priority_zone / constraint_relief_zone / jet_program_zone regardless of MW', () => {
    expect(tierFromCapacity(10, 'priority_zone')).toBe('mega');
    expect(tierFromCapacity(40, 'constraint_relief_zone')).toBe('mega');
    expect(tierFromCapacity(100, 'jet_program_zone')).toBe('mega');
  });

  it('standard / bess_dedicated / transmission_corridor zones do NOT floor', () => {
    expect(tierFromCapacity(10, 'standard_zone')).toBe('minor');
    expect(tierFromCapacity(10, 'bess_dedicated_zone')).toBe('minor');
    expect(tierFromCapacity(10, 'transmission_corridor_zone')).toBe('minor');
    expect(isFloorAtMegaClass('standard_zone')).toBe(false);
    expect(isFloorAtMegaClass('bess_dedicated_zone')).toBe(false);
    expect(isFloorAtMegaClass('transmission_corridor_zone')).toBe(false);
  });

  it('floor classes are recognised', () => {
    expect(isFloorAtMegaClass('priority_zone')).toBe(true);
    expect(isFloorAtMegaClass('constraint_relief_zone')).toBe(true);
    expect(isFloorAtMegaClass('jet_program_zone')).toBe(true);
  });

  it('tierRank orders minor=0 < standard=1 < material=2 < mega=3', () => {
    expect(tierRank('minor')).toBe(0);
    expect(tierRank('standard')).toBe(1);
    expect(tierRank('material')).toBe(2);
    expect(tierRank('mega')).toBe(3);
  });

  it('isHighTier = {material, mega} only', () => {
    expect(isHighTier('minor')).toBe(false);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('material')).toBe(true);
    expect(isHighTier('mega')).toBe(true);
  });

  it('effectiveCapacityMw prefers awarded over requested', () => {
    expect(effectiveCapacityMw(300, 200)).toBe(300);
    expect(effectiveCapacityMw(null, 200)).toBe(200);
    expect(effectiveCapacityMw(0, 200)).toBe(200);
    expect(effectiveCapacityMw(null, null)).toBe(0);
  });

  it('class+tier validators', () => {
    expect(isAllocationClass('priority_zone')).toBe(true);
    expect(isAllocationClass('bogus')).toBe(false);
    expect(isTier('mega')).toBe(true);
    expect(isTier('huge')).toBe(false);
  });
});

describe('W94 REZ capacity — INVERTED SLA', () => {
  it('strictly INCREASING minor → mega at every graded state', () => {
    const graded = [
      'announcement_published', 'application_submitted', 'compliance_check',
      'shortlisted', 'evaluation_complete', 'award_proposed',
      'capacity_awarded', 'financial_close_met', 'construction_in_progress',
    ] as const;
    for (const s of graded) {
      const row = SLA_MINUTES[s];
      expect(row.minor).toBeLessThan(row.standard);
      expect(row.standard).toBeLessThan(row.material);
      expect(row.material).toBeLessThan(row.mega);
    }
  });

  it('NTCSA Rules 2024: compliance_check ≥ 7d minor, mega 30d', () => {
    expect(SLA_MINUTES.compliance_check.minor).toBe(10080); // 7d
    expect(SLA_MINUTES.compliance_check.mega).toBe(43200);  // 30d
  });

  it('construction milestone caps at ~3 yrs for mega', () => {
    const cmega = SLA_MINUTES.construction_in_progress.mega;
    expect(cmega).toBe(1576800); // 1095d = 3 yrs
  });

  it('terminals SLA = 0', () => {
    expect(SLA_MINUTES.in_operation.mega).toBe(0);
    expect(SLA_MINUTES.rejected.mega).toBe(0);
    expect(SLA_MINUTES.forfeit.mega).toBe(0);
    expect(SLA_MINUTES.withdrawn.mega).toBe(0);
  });

  it('slaDeadlineFor returns null for terminals', () => {
    expect(slaDeadlineFor('in_operation', 'mega', new Date())).toBeNull();
    expect(slaDeadlineFor('rejected', 'mega', new Date())).toBeNull();
    expect(slaDeadlineFor('forfeit', 'mega', new Date())).toBeNull();
  });

  it('slaDeadlineFor adds minutes correctly', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('compliance_check', 'standard', t0)!;
    // standard compliance_check = 20160 min = 14d
    expect(d.getTime() - t0.getTime()).toBe(20160 * 60_000);
  });
});

describe('W94 REZ capacity — SIGNATURE reportability', () => {
  it('award_capacity crosses regulator EVERY tier (NERSA s10 + IRP 2023 hard line)', () => {
    for (const t of ['minor', 'standard', 'material', 'mega'] as const) {
      expect(actionCrossesRegulator('award_capacity', t, 'standard_zone')).toBe(true);
    }
  });

  it('forfeit_allocation crosses regulator EVERY tier (capacity-recycling public signal)', () => {
    for (const t of ['minor', 'standard', 'material', 'mega'] as const) {
      expect(actionCrossesRegulator('forfeit_allocation', t, 'standard_zone')).toBe(true);
    }
  });

  it('reject_application crosses material+mega only', () => {
    expect(actionCrossesRegulator('reject_application', 'minor', 'standard_zone')).toBe(false);
    expect(actionCrossesRegulator('reject_application', 'standard', 'standard_zone')).toBe(false);
    expect(actionCrossesRegulator('reject_application', 'material', 'standard_zone')).toBe(true);
    expect(actionCrossesRegulator('reject_application', 'mega', 'standard_zone')).toBe(true);
  });

  it('complete_evaluation crosses mega only', () => {
    expect(actionCrossesRegulator('complete_evaluation', 'material', 'standard_zone')).toBe(false);
    expect(actionCrossesRegulator('complete_evaluation', 'mega', 'standard_zone')).toBe(true);
  });

  it('confirm_operation crosses mega only (security-of-supply milestone)', () => {
    expect(actionCrossesRegulator('confirm_operation', 'material', 'standard_zone')).toBe(false);
    expect(actionCrossesRegulator('confirm_operation', 'mega', 'standard_zone')).toBe(true);
  });

  it('withdraw crosses regulator only when high-tier AND floor-class', () => {
    expect(actionCrossesRegulator('withdraw', 'material', 'priority_zone')).toBe(true);
    expect(actionCrossesRegulator('withdraw', 'mega', 'standard_zone')).toBe(false);
    expect(actionCrossesRegulator('withdraw', 'minor', 'priority_zone')).toBe(false);
  });

  it('isReportable = isHighTier (material, mega)', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('mega')).toBe(true);
  });

  it('inboxSeverityForTier maps mega→critical, material→high, standard→medium, minor→low', () => {
    expect(inboxSeverityForTier('mega')).toBe('critical');
    expect(inboxSeverityForTier('material')).toBe('high');
    expect(inboxSeverityForTier('standard')).toBe('medium');
    expect(inboxSeverityForTier('minor')).toBe('low');
  });
});

describe('W94 REZ capacity — authority', () => {
  it('authority escalates with tier', () => {
    expect(authorityFor('minor')).toBe('compliance_officer');
    expect(authorityFor('standard')).toBe('evaluation_panel');
    expect(authorityFor('material')).toBe('council_subcommittee');
    expect(authorityFor('mega')).toBe('full_council');
  });
});

describe('W94 REZ capacity — multi-criteria score (REIPPPP-style)', () => {
  it('SCORE_WEIGHTS sum to 1.00', () => {
    const total = SCORE_WEIGHTS.price + SCORE_WEIGHTS.bbbee + SCORE_WEIGHTS.ed + SCORE_WEIGHTS.local_content;
    expect(total).toBeCloseTo(1.0, 6);
  });

  it('LOCAL_CONTENT_THRESHOLD_PCT = 40 (DMRE REIPPPP)', () => {
    expect(LOCAL_CONTENT_THRESHOLD_PCT).toBe(40);
  });

  it('priceScore — lower bid = higher score; clamped to [0,100]', () => {
    expect(priceScore(500, 500, 1500)).toBe(100);   // at floor
    expect(priceScore(1500, 500, 1500)).toBe(0);    // at ceiling
    expect(priceScore(1000, 500, 1500)).toBe(50);   // mid
    expect(priceScore(0, 500, 1500)).toBe(0);       // invalid
    expect(priceScore(200, 500, 1500)).toBe(100);   // below floor → clamped
    expect(priceScore(2000, 500, 1500)).toBe(0);    // above ceiling → clamped
  });

  it('localContentScore — ≥40% full credit; linear below', () => {
    expect(localContentScore(40)).toBe(100);
    expect(localContentScore(50)).toBe(100);
    expect(localContentScore(20)).toBe(50);
    expect(localContentScore(0)).toBe(0);
    expect(localContentScore(-1)).toBe(0);
  });

  it('weightedScore composes correctly with REIPPPP weights', () => {
    // all 100 → 100
    expect(weightedScore(100, 100, 100, 100)).toBeCloseTo(100, 6);
    // all 0 → 0
    expect(weightedScore(0, 0, 0, 0)).toBeCloseTo(0, 6);
    // price 100, others 0 → 50 (price weight)
    expect(weightedScore(100, 0, 0, 0)).toBeCloseTo(50, 6);
    // bbbee 100, others 0 → 20
    expect(weightedScore(0, 100, 0, 0)).toBeCloseTo(20, 6);
    // ed 100, others 0 → 15
    expect(weightedScore(0, 0, 100, 0)).toBeCloseTo(15, 6);
    // local 100, others 0 → 15
    expect(weightedScore(0, 0, 0, 100)).toBeCloseTo(15, 6);
  });

  it('weightedScore clamps inputs to [0,100]', () => {
    expect(weightedScore(150, 150, 150, 150)).toBeCloseTo(100, 6);
    expect(weightedScore(-10, -10, -10, -10)).toBeCloseTo(0, 6);
  });
});

describe('W94 REZ capacity — zone-headroom + competition battery', () => {
  it('remainingHeadroomMw = total - allocated; clamped ≥0', () => {
    expect(remainingHeadroomMw(1000, 300)).toBe(700);
    expect(remainingHeadroomMw(500, 600)).toBe(0); // over-allocated → 0
    expect(remainingHeadroomMw(0, 0)).toBe(0);
  });

  it('competitionRatio = applications / lots; 0 when no lots', () => {
    expect(competitionRatio(20, 5)).toBe(4);
    expect(competitionRatio(2, 10)).toBe(0.2);
    expect(competitionRatio(5, 0)).toBe(0);
  });

  it('competitionIntensityBand: high ≥3, moderate ≥1.5, low <1.5', () => {
    expect(competitionIntensityBand(0.5)).toBe('low');
    expect(competitionIntensityBand(1.5)).toBe('moderate');
    expect(competitionIntensityBand(2.9)).toBe('moderate');
    expect(competitionIntensityBand(3)).toBe('high');
    expect(competitionIntensityBand(10)).toBe('high');
  });

  it('milestoneCompliancePct + forfeitRatePct + clamp behaviour', () => {
    expect(milestoneCompliancePct(8, 10)).toBe(80);
    expect(milestoneCompliancePct(0, 10)).toBe(0);
    expect(milestoneCompliancePct(5, 0)).toBe(0);
    expect(forfeitRatePct(50, 200)).toBe(25);
    expect(forfeitRatePct(0, 200)).toBe(0);
    expect(forfeitRatePct(50, 0)).toBe(0);
  });

  it('predictedOperationDate rolls forward through remaining SLA', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    // From announcement_published mega: sum all 9 graded SLAs
    const d = predictedOperationDate('announcement_published', 'mega', t0)!;
    const expectedMinutes =
      SLA_MINUTES.announcement_published.mega +
      SLA_MINUTES.application_submitted.mega +
      SLA_MINUTES.compliance_check.mega +
      SLA_MINUTES.shortlisted.mega +
      SLA_MINUTES.evaluation_complete.mega +
      SLA_MINUTES.award_proposed.mega +
      SLA_MINUTES.capacity_awarded.mega +
      SLA_MINUTES.financial_close_met.mega +
      SLA_MINUTES.construction_in_progress.mega;
    expect(d.getTime() - t0.getTime()).toBe(expectedMinutes * 60_000);
  });

  it('predictedOperationDate from terminal = null', () => {
    expect(predictedOperationDate('in_operation', 'mega', new Date())).toBeNull();
    expect(predictedOperationDate('forfeit', 'mega', new Date())).toBeNull();
  });
});

describe('W94 REZ capacity — urgency band', () => {
  it('terminals → closed', () => {
    expect(urgencyBand('in_operation', new Date(), new Date())).toBe('closed');
    expect(urgencyBand('rejected', new Date(), new Date())).toBe('closed');
  });

  it('no deadline → on_track', () => {
    expect(urgencyBand('compliance_check', null, new Date())).toBe('on_track');
  });

  it('overdue / urgent / due_soon / on_track gradient', () => {
    const now = new Date('2026-05-30T12:00:00Z');
    const past = new Date('2026-05-29T12:00:00Z');
    const in12h = new Date('2026-05-31T00:00:00Z');
    const in48h = new Date('2026-06-01T12:00:00Z');
    const in7d = new Date('2026-06-06T12:00:00Z');
    expect(urgencyBand('compliance_check', past, now)).toBe('overdue');
    expect(urgencyBand('compliance_check', in12h, now)).toBe('urgent');
    expect(urgencyBand('compliance_check', in48h, now)).toBe('due_soon');
    expect(urgencyBand('compliance_check', in7d, now)).toBe('on_track');
  });
});

describe('W94 REZ capacity — party + event-type + reason-code', () => {
  it('party-for-action maps actions to functional party', () => {
    expect(partyForAction('award_capacity')).toBe('council');
    expect(partyForAction('forfeit_allocation')).toBe('council');
    expect(partyForAction('reject_application')).toBe('council');
    expect(partyForAction('complete_evaluation')).toBe('evaluation_panel');
    expect(partyForAction('propose_award')).toBe('evaluation_panel');
    expect(partyForAction('start_compliance')).toBe('compliance_officer');
    expect(partyForAction('shortlist')).toBe('compliance_officer');
    expect(partyForAction('confirm_operation')).toBe('system_operator');
    expect(partyForAction('confirm_financial_close')).toBe('system_operator');
  });

  it('eventTypeFor returns rez_capacity.<status>', () => {
    expect(eventTypeFor('capacity_awarded')).toBe('rez_capacity.capacity_awarded');
    expect(eventTypeFor('forfeit')).toBe('rez_capacity.forfeit');
    expect(eventTypeFor('in_operation')).toBe('rez_capacity.in_operation');
  });

  it('reasonCodeFor returns rez_capacity.<action>', () => {
    expect(reasonCodeFor('award_capacity')).toBe('rez_capacity.award_capacity');
    expect(reasonCodeFor('forfeit_allocation')).toBe('rez_capacity.forfeit_allocation');
  });
});

describe('W94 REZ capacity — TRANSITIONS map sanity', () => {
  it('every non-terminal accepts at least one forward action', () => {
    const nonTerminal = [
      'announcement_published', 'application_submitted', 'compliance_check',
      'shortlisted', 'evaluation_complete', 'award_proposed',
      'capacity_awarded', 'financial_close_met', 'construction_in_progress',
    ] as const;
    for (const s of nonTerminal) {
      const acts = allowedActions(s);
      expect(acts.length).toBeGreaterThan(0);
    }
  });

  it('every transition target is a known status', () => {
    const valid = new Set(Object.keys(TRANSITIONS));
    for (const [, rules] of Object.entries(TRANSITIONS)) {
      for (const [, rule] of Object.entries(rules)) {
        if (rule) expect(valid.has(rule.next)).toBe(true);
      }
    }
  });
});
