// Wave 134 — IPP Stakeholder Register & Engagement Tracking spec tests
// PMBOK 7 Section 13 + ISO 21500:2021 + REIPPPP S4 + IFC PS1 + EP4.
// URGENT SLA polarity: strategic_ally 24h TIGHTEST.
// SIGNATURE: escalate_engagement EVERY tier; flag_resistant crosses when power_score >= 4.
import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isHardTerminal,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  slaHoursFor,
  slaDeadlineFor,
  slaHoursRemaining,
  deriveTierFromScore,
  eventTypeFor,
  statusTsCol,
  urgencyBand,
  timeInStateHours,
  TIER_LABELS,
  ENGAGEMENT_LEVEL_LABELS,
  SLA_HOURS,
  TRANSITIONS,
  HARD_TERMINALS,
  type StakeholderStatus,
  type StakeholderAction,
  type StakeholderTier,
} from '../src/utils/ipp-stakeholder-spec';

// ─── Forward path ─────────────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[StakeholderStatus, StakeholderAction, StakeholderStatus]> = [
    ['identified',       'analyze_stakeholder',  'analyzed'],
    ['analyzed',         'classify_stakeholder', 'classified'],
    ['classified',       'plan_engagement',      'engagement_planned'],
    ['engagement_planned', 'activate_engagement','active_engagement'],
    ['active_engagement','record_response',      'responsive'],
    ['responsive',       'confirm_supportive',   'supportive'],
    ['supportive',       'elevate_to_champion',  'champion'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('rejects from archived (hard terminal)', () => {
    expect(nextStatus('archived', 'analyze_stakeholder')).toBeNull();
  });

  it('rejects wrong from-state', () => {
    expect(nextStatus('identified', 'elevate_to_champion')).toBeNull();
  });

  it('rejects identified → record_response', () => {
    expect(nextStatus('identified', 'record_response')).toBeNull();
  });

  it('rejects classified → record_response', () => {
    expect(nextStatus('classified', 'record_response')).toBeNull();
  });
});

// ─── Branch: resistant path ───────────────────────────────────────────────
describe('branch: resistant path', () => {
  it('identified + flag_resistant => resistant', () => {
    expect(nextStatus('identified', 'flag_resistant')).toBe('resistant');
  });
  it('analyzed + flag_resistant => resistant', () => {
    expect(nextStatus('analyzed', 'flag_resistant')).toBe('resistant');
  });
  it('active_engagement + flag_resistant => resistant', () => {
    expect(nextStatus('active_engagement', 'flag_resistant')).toBe('resistant');
  });
  it('supportive + flag_resistant => resistant', () => {
    expect(nextStatus('supportive', 'flag_resistant')).toBe('resistant');
  });
  it('champion + flag_resistant => resistant', () => {
    expect(nextStatus('champion', 'flag_resistant')).toBe('resistant');
  });
  it('resistant + escalate_engagement => escalated (W134 SIGNATURE)', () => {
    expect(nextStatus('resistant', 'escalate_engagement')).toBe('escalated');
  });
  it('escalated + re_engage => active_engagement', () => {
    expect(nextStatus('escalated', 're_engage')).toBe('active_engagement');
  });
  it('resistant + re_engage => active_engagement', () => {
    expect(nextStatus('resistant', 're_engage')).toBe('active_engagement');
  });
});

// ─── Branch: disengaged path ──────────────────────────────────────────────
describe('branch: disengaged path', () => {
  it('active_engagement + flag_disengaged => disengaged', () => {
    expect(nextStatus('active_engagement', 'flag_disengaged')).toBe('disengaged');
  });
  it('responsive + flag_disengaged => disengaged', () => {
    expect(nextStatus('responsive', 'flag_disengaged')).toBe('disengaged');
  });
  it('supportive + flag_disengaged => disengaged', () => {
    expect(nextStatus('supportive', 'flag_disengaged')).toBe('disengaged');
  });
  it('identified + flag_disengaged => null (not in from-list)', () => {
    expect(nextStatus('identified', 'flag_disengaged')).toBeNull();
  });
  it('disengaged + escalate_engagement => escalated', () => {
    expect(nextStatus('disengaged', 'escalate_engagement')).toBe('escalated');
  });
  it('disengaged + re_engage => active_engagement', () => {
    expect(nextStatus('disengaged', 're_engage')).toBe('active_engagement');
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('archived is a hard terminal', () => {
    expect(isHardTerminal('archived')).toBe(true);
  });
  it('HARD_TERMINALS array contains archived', () => {
    expect(HARD_TERMINALS).toContain('archived');
  });
  it('champion is NOT a hard terminal', () => {
    expect(isHardTerminal('champion')).toBe(false);
  });
  it('escalated is NOT a hard terminal', () => {
    expect(isHardTerminal('escalated')).toBe(false);
  });
  it('archived blocks all transitions', () => {
    expect(nextStatus('archived', 'analyze_stakeholder')).toBeNull();
    expect(nextStatus('archived', 're_engage')).toBeNull();
    expect(nextStatus('archived', 'flag_resistant')).toBeNull();
  });
  it('archive_stakeholder from champion => archived', () => {
    expect(nextStatus('champion', 'archive_stakeholder')).toBe('archived');
  });
  it('archive_stakeholder from supportive => archived', () => {
    expect(nextStatus('supportive', 'archive_stakeholder')).toBe('archived');
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('strategic_ally = 24h (tightest)', () => {
    expect(slaHoursFor('strategic_ally')).toBe(24);
  });
  it('key_player = 48h', () => {
    expect(slaHoursFor('key_player')).toBe(48);
  });
  it('keep_satisfied = 168h', () => {
    expect(slaHoursFor('keep_satisfied')).toBe(168);
  });
  it('keep_informed = 336h', () => {
    expect(slaHoursFor('keep_informed')).toBe(336);
  });
  it('monitor = 720h (loosest)', () => {
    expect(slaHoursFor('monitor')).toBe(720);
  });
  it('URGENT polarity: strategic_ally < key_player < keep_satisfied < keep_informed < monitor', () => {
    const tiers: StakeholderTier[] = ['strategic_ally','key_player','keep_satisfied','keep_informed','monitor'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(slaHoursFor(tiers[i])).toBeLessThan(slaHoursFor(tiers[i + 1]));
    }
  });
  it('SLA_HOURS has all 5 tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(5);
  });
  it('slaDeadlineFor adds correct hours', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('strategic_ally', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });
  it('slaDeadlineFor monitor = 720h', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('monitor', from);
    expect(deadline.getTime()).toBe(from.getTime() + 720 * 3600 * 1000);
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

// ─── deriveTierFromScore ──────────────────────────────────────────────────
describe('deriveTierFromScore', () => {
  it('P5×I5 => strategic_ally', () => {
    expect(deriveTierFromScore(125, 5, 5)).toBe('strategic_ally');
  });
  it('P5×I4 => strategic_ally (power=5 always qualifies if interest>=5, else key_player path)', () => {
    // power=5 >= 5 but interest=4 < 5 → falls to key_player (power>=4 AND interest>=4)
    expect(deriveTierFromScore(80, 5, 4)).toBe('key_player');
  });
  it('P4×I4 => key_player', () => {
    expect(deriveTierFromScore(48, 4, 4)).toBe('key_player');
  });
  it('P4×I3 => keep_satisfied (power>=4 but interest<4)', () => {
    expect(deriveTierFromScore(36, 4, 3)).toBe('keep_satisfied');
  });
  it('P3×I4 => keep_informed (interest>=4 but power<4)', () => {
    expect(deriveTierFromScore(36, 3, 4)).toBe('keep_informed');
  });
  it('P2×I5 => keep_informed (interest>=4 but power<4)', () => {
    expect(deriveTierFromScore(30, 2, 5)).toBe('keep_informed');
  });
  it('P3×I3 => monitor', () => {
    expect(deriveTierFromScore(27, 3, 3)).toBe('monitor');
  });
  it('P1×I1 => monitor', () => {
    expect(deriveTierFromScore(1, 1, 1)).toBe('monitor');
  });
  it('P2×I3 => monitor (both below threshold)', () => {
    expect(deriveTierFromScore(6, 2, 3)).toBe('monitor');
  });
  it('P5×I5 boundary check (exactly 5 and 5)', () => {
    expect(deriveTierFromScore(125, 5, 5)).toBe('strategic_ally');
  });
});

// ─── W134 SIGNATURE regulator crossings ──────────────────────────────────
describe('W134 SIGNATURE: crossesIntoRegulator', () => {
  it('escalate_engagement EVERY tier always crosses (W134 SIGNATURE)', () => {
    expect(crossesIntoRegulator('escalate_engagement', {})).toBe(true);
  });
  it('escalate_engagement crosses regardless of power_score', () => {
    expect(crossesIntoRegulator('escalate_engagement', { power_score: 1 })).toBe(true);
    expect(crossesIntoRegulator('escalate_engagement', { power_score: 5 })).toBe(true);
  });
  it('flag_resistant + power_score=4 crosses (W134 SIGNATURE threshold)', () => {
    expect(crossesIntoRegulator('flag_resistant', { power_score: 4 })).toBe(true);
  });
  it('flag_resistant + power_score=5 crosses', () => {
    expect(crossesIntoRegulator('flag_resistant', { power_score: 5 })).toBe(true);
  });
  it('flag_resistant + power_score=3 does NOT cross', () => {
    expect(crossesIntoRegulator('flag_resistant', { power_score: 3 })).toBe(false);
  });
  it('flag_resistant + power_score=1 does NOT cross', () => {
    expect(crossesIntoRegulator('flag_resistant', { power_score: 1 })).toBe(false);
  });
  it('flag_resistant + power_score=0 (no score) does NOT cross', () => {
    expect(crossesIntoRegulator('flag_resistant', { power_score: 0 })).toBe(false);
  });
  it('flag_resistant with null power_score does NOT cross', () => {
    expect(crossesIntoRegulator('flag_resistant', { power_score: null })).toBe(false);
  });
  it('flag_resistant with undefined power_score does NOT cross', () => {
    expect(crossesIntoRegulator('flag_resistant', {})).toBe(false);
  });
  it('analyze_stakeholder never crosses', () => {
    expect(crossesIntoRegulator('analyze_stakeholder', { power_score: 5 })).toBe(false);
  });
  it('record_response never crosses', () => {
    expect(crossesIntoRegulator('record_response', { power_score: 5 })).toBe(false);
  });
  it('flag_disengaged never crosses', () => {
    expect(crossesIntoRegulator('flag_disengaged', { power_score: 5 })).toBe(false);
  });
  it('re_engage never crosses', () => {
    expect(crossesIntoRegulator('re_engage', { power_score: 5 })).toBe(false);
  });
  it('isReportable delegates correctly — escalate crosses', () => {
    expect(isReportable('escalate_engagement', {})).toBe(true);
  });
  it('isReportable delegates correctly — classify does not cross', () => {
    expect(isReportable('classify_stakeholder', { power_score: 5 })).toBe(false);
  });
});

// ─── slaBreachCrossesIntoRegulator ────────────────────────────────────────
describe('slaBreachCrossesIntoRegulator', () => {
  it('nersa_required + strategic_ally crosses', () => {
    expect(slaBreachCrossesIntoRegulator('strategic_ally', { floor_nersa_required: 1 })).toBe(true);
  });
  it('nersa_required + key_player crosses', () => {
    expect(slaBreachCrossesIntoRegulator('key_player', { floor_nersa_required: true })).toBe(true);
  });
  it('nersa_required + keep_satisfied does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('keep_satisfied', { floor_nersa_required: 1 })).toBe(false);
  });
  it('nersa_required + keep_informed does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('keep_informed', { floor_nersa_required: 1 })).toBe(false);
  });
  it('nersa_required + monitor does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('monitor', { floor_nersa_required: 1 })).toBe(false);
  });
  it('strategic_ally WITHOUT nersa_required does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('strategic_ally', { floor_nersa_required: 0 })).toBe(false);
  });
  it('strategic_ally with undefined nersa does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('strategic_ally', {})).toBe(false);
  });
});

// ─── flag_overdue (cron-only) ─────────────────────────────────────────────
describe('flag_overdue (cron-only)', () => {
  it('flag_overdue from identified returns current status', () => {
    expect(nextStatus('identified', 'flag_overdue')).toBe('identified');
  });
  it('flag_overdue from active_engagement returns current status', () => {
    expect(nextStatus('active_engagement', 'flag_overdue')).toBe('active_engagement');
  });
  it('flag_overdue from resistant returns current status', () => {
    expect(nextStatus('resistant', 'flag_overdue')).toBe('resistant');
  });
  it('flag_overdue from champion returns current status', () => {
    expect(nextStatus('champion', 'flag_overdue')).toBe('champion');
  });
  it('flag_overdue from archived returns null (hard terminal)', () => {
    expect(nextStatus('archived', 'flag_overdue')).toBeNull();
  });
});

// ─── statusTsCol ──────────────────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[StakeholderStatus, string]> = [
    ['identified',        'identified_at'],
    ['analyzed',          'analyzed_at'],
    ['classified',        'classified_at'],
    ['engagement_planned','engagement_planned_at'],
    ['active_engagement', 'active_engagement_at'],
    ['responsive',        'responsive_at'],
    ['supportive',        'supportive_at'],
    ['champion',          'champion_at'],
    ['resistant',         'resistant_at'],
    ['disengaged',        'disengaged_at'],
    ['escalated',         'escalated_at'],
    ['archived',          'archived_at'],
  ];
  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });
  it('covers all 12 states', () => {
    expect(cases).toHaveLength(12);
  });
});

// ─── eventTypeFor ─────────────────────────────────────────────────────────
describe('eventTypeFor', () => {
  const cases: Array<[StakeholderAction, string]> = [
    ['analyze_stakeholder',  'ipp_stakeholder.analyze_stakeholder'],
    ['classify_stakeholder', 'ipp_stakeholder.classify_stakeholder'],
    ['plan_engagement',      'ipp_stakeholder.plan_engagement'],
    ['activate_engagement',  'ipp_stakeholder.activate_engagement'],
    ['record_response',      'ipp_stakeholder.record_response'],
    ['confirm_supportive',   'ipp_stakeholder.confirm_supportive'],
    ['elevate_to_champion',  'ipp_stakeholder.elevate_to_champion'],
    ['flag_resistant',       'ipp_stakeholder.flag_resistant'],
    ['flag_disengaged',      'ipp_stakeholder.flag_disengaged'],
    ['escalate_engagement',  'ipp_stakeholder.escalate_engagement'],
    ['re_engage',            'ipp_stakeholder.re_engage'],
    ['archive_stakeholder',  'ipp_stakeholder.archive_stakeholder'],
    ['flag_overdue',         'ipp_stakeholder.sla_breached'],
  ];
  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });
  it('all 13 actions are mapped', () => {
    expect(cases).toHaveLength(13);
  });
});

// ─── TIER_LABELS ──────────────────────────────────────────────────────────
describe('TIER_LABELS', () => {
  it('has 5 tier labels', () => {
    expect(Object.keys(TIER_LABELS)).toHaveLength(5);
  });
  it('strategic_ally = Strategic ally', () => {
    expect(TIER_LABELS['strategic_ally']).toBe('Strategic ally');
  });
  it('key_player = Key player', () => {
    expect(TIER_LABELS['key_player']).toBe('Key player');
  });
  it('keep_satisfied = Keep satisfied', () => {
    expect(TIER_LABELS['keep_satisfied']).toBe('Keep satisfied');
  });
  it('keep_informed = Keep informed', () => {
    expect(TIER_LABELS['keep_informed']).toBe('Keep informed');
  });
  it('monitor = Monitor', () => {
    expect(TIER_LABELS['monitor']).toBe('Monitor');
  });
});

// ─── ENGAGEMENT_LEVEL_LABELS ──────────────────────────────────────────────
describe('ENGAGEMENT_LEVEL_LABELS', () => {
  it('has 5 engagement level labels', () => {
    expect(Object.keys(ENGAGEMENT_LEVEL_LABELS)).toHaveLength(5);
  });
  it('unaware = Unaware', () => {
    expect(ENGAGEMENT_LEVEL_LABELS['unaware']).toBe('Unaware');
  });
  it('leading = Leading champion', () => {
    expect(ENGAGEMENT_LEVEL_LABELS['leading']).toBe('Leading champion');
  });
  it('supportive = Supportive', () => {
    expect(ENGAGEMENT_LEVEL_LABELS['supportive']).toBe('Supportive');
  });
  it('resistant = Resistant', () => {
    expect(ENGAGEMENT_LEVEL_LABELS['resistant']).toBe('Resistant');
  });
  it('neutral = Neutral', () => {
    expect(ENGAGEMENT_LEVEL_LABELS['neutral']).toBe('Neutral');
  });
});

// ─── urgencyBand ─────────────────────────────────────────────────────────
describe('urgencyBand', () => {
  it('strategic_ally => urgent', () => expect(urgencyBand('strategic_ally')).toBe('urgent'));
  it('key_player => high', () => expect(urgencyBand('key_player')).toBe('high'));
  it('keep_satisfied => medium', () => expect(urgencyBand('keep_satisfied')).toBe('medium'));
  it('keep_informed => low', () => expect(urgencyBand('keep_informed')).toBe('low'));
  it('monitor => minimal', () => expect(urgencyBand('monitor')).toBe('minimal'));
});

// ─── timeInStateHours ─────────────────────────────────────────────────────
describe('timeInStateHours', () => {
  it('null when stateAt is null', () => {
    expect(timeInStateHours(null, new Date())).toBeNull();
  });
  it('positive hours for past timestamp', () => {
    const past = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const h = timeInStateHours(past, new Date());
    expect(h).toBeGreaterThanOrEqual(4);
    expect(h).toBeLessThanOrEqual(6);
  });
});

// ─── TRANSITIONS completeness ─────────────────────────────────────────────
describe('TRANSITIONS record', () => {
  it('has 13 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(13);
  });
  it('all actions have from and to', () => {
    for (const [, t] of Object.entries(TRANSITIONS)) {
      expect(Array.isArray(t.from)).toBe(true);
      expect(typeof t.to).toBe('string');
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('escalated cannot escalate again', () => {
    // escalate_engagement only from resistant/disengaged
    expect(nextStatus('escalated', 'escalate_engagement')).toBeNull();
  });
  it('champion cannot be elevated again', () => {
    expect(nextStatus('champion', 'elevate_to_champion')).toBeNull();
  });
  it('identified cannot re_engage (not disengaged/resistant/escalated)', () => {
    expect(nextStatus('identified', 're_engage')).toBeNull();
  });
  it('multiple branches from active_engagement: disengaged OR resistant OR responsive', () => {
    expect(nextStatus('active_engagement', 'flag_disengaged')).toBe('disengaged');
    expect(nextStatus('active_engagement', 'flag_resistant')).toBe('resistant');
    expect(nextStatus('active_engagement', 'record_response')).toBe('responsive');
  });
  it('re_engage always leads to active_engagement', () => {
    expect(nextStatus('disengaged', 're_engage')).toBe('active_engagement');
    expect(nextStatus('resistant', 're_engage')).toBe('active_engagement');
    expect(nextStatus('escalated', 're_engage')).toBe('active_engagement');
  });
});
