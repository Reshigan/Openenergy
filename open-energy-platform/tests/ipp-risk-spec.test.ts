// Wave 133 — IPP Risk Register spec tests
import { describe, it, expect } from 'vitest';
import {
  nextStatus,
  isHardTerminal,
  isTerminal,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  slaHoursFor,
  slaDeadlineFor,
  slaHoursRemaining,
  deriveTierFromScore,
  partyForAction,
  eventTypeFor,
  statusTsCol,
  urgencyBand,
  timeInStateHours,
  TIER_LABELS,
  SLA_HOURS,
  type RiskStatus,
  type RiskAction,
  type RiskTier,
} from '../src/utils/ipp-risk-spec';

// ─── Forward path ─────────────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[RiskStatus, RiskAction, RiskStatus]> = [
    ['identified',       'assess_risk',         'assessed'],
    ['assessed',         'quantify_risk',        'quantified'],
    ['quantified',       'plan_response',        'response_planned'],
    ['response_planned', 'assign_owner',         'owner_assigned'],
    ['owner_assigned',   'activate_monitoring',  'monitoring'],
    ['monitoring',       'flag_triggered',       'triggered'],
    ['triggered',        'start_response',       'responding'],
    ['responding',       'record_outcome',       'outcome_recorded'],
    ['outcome_recorded', 'close_risk',           'closed'],
    ['closed',           'archive_risk',         'archived'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('rejects from archived', () => {
    expect(nextStatus('archived', 'assess_risk')).toBeNull();
  });
  it('rejects from cancelled', () => {
    expect(nextStatus('cancelled', 'assess_risk')).toBeNull();
  });
  it('rejects wrong from-state', () => {
    expect(nextStatus('identified', 'start_response')).toBeNull();
  });
  it('flag_triggered also works from owner_assigned', () => {
    expect(nextStatus('owner_assigned', 'flag_triggered')).toBe('triggered');
  });
});

// ─── Branch states ────────────────────────────────────────────────────────
describe('branch states', () => {
  it('escalate_risk -> escalated', () => {
    expect(nextStatus('identified', 'escalate_risk')).toBe('escalated');
  });
  it('defer_risk -> deferred', () => {
    expect(nextStatus('identified', 'defer_risk')).toBe('deferred');
  });
  it('deferred -> reactivate_risk -> monitoring', () => {
    expect(nextStatus('deferred', 'reactivate_risk')).toBe('monitoring');
  });
  it('escalated -> assign_owner -> owner_assigned', () => {
    expect(nextStatus('escalated', 'assign_owner')).toBe('owner_assigned');
  });
  it('cancel_risk -> cancelled (HARD terminal)', () => {
    expect(nextStatus('responding', 'cancel_risk')).toBe('cancelled');
    expect(isHardTerminal('cancelled')).toBe(true);
  });
  it('flag_overdue returns CURRENT status (cron-only)', () => {
    expect(nextStatus('monitoring', 'flag_overdue')).toBe('monitoring');
    expect(nextStatus('identified', 'flag_overdue')).toBe('identified');
  });
  it('identify_risk only valid from identified', () => {
    expect(nextStatus('identified', 'identify_risk')).toBe('identified');
    expect(nextStatus('assessed', 'identify_risk')).toBeNull();
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('archived and cancelled are hard terminals', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('cancelled')).toBe(true);
  });
  it('isTerminal includes both hard terminals', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('closed')).toBe(false);
    expect(isTerminal('monitoring')).toBe(false);
  });
});

// ─── INVERTED SLA polarity ────────────────────────────────────────────────
describe('INVERTED SLA polarity', () => {
  it('low_impact = 168h (loosest)', () => {
    expect(slaHoursFor('low_impact')).toBe(168);
  });
  it('medium_impact = 336h', () => {
    expect(slaHoursFor('medium_impact')).toBe(336);
  });
  it('high_impact = 720h', () => {
    expect(slaHoursFor('high_impact')).toBe(720);
  });
  it('critical_impact = 1440h', () => {
    expect(slaHoursFor('critical_impact')).toBe(1440);
  });
  it('catastrophic = 2160h (most time)', () => {
    expect(slaHoursFor('catastrophic')).toBe(2160);
  });
  it('INVERTED polarity: low < medium < high < critical < catastrophic', () => {
    const tiers: RiskTier[] = ['low_impact','medium_impact','high_impact','critical_impact','catastrophic'];
    for (let i = 0; i < tiers.length - 1; i++) {
      expect(slaHoursFor(tiers[i])).toBeLessThan(slaHoursFor(tiers[i + 1]));
    }
  });
  it('SLA_HOURS record has all 5 tiers', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(5);
  });
  it('slaDeadlineFor adds correct hours', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('catastrophic', from);
    expect(deadline.getTime()).toBe(from.getTime() + 2160 * 3600 * 1000);
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

// ─── Risk score tier derivation ───────────────────────────────────────────
describe('deriveTierFromScore', () => {
  it('1 -> low_impact', () => expect(deriveTierFromScore(1)).toBe('low_impact'));
  it('3 -> low_impact', () => expect(deriveTierFromScore(3)).toBe('low_impact'));
  it('4 -> medium_impact', () => expect(deriveTierFromScore(4)).toBe('medium_impact'));
  it('8 -> medium_impact', () => expect(deriveTierFromScore(8)).toBe('medium_impact'));
  it('9 -> high_impact', () => expect(deriveTierFromScore(9)).toBe('high_impact'));
  it('12 -> high_impact', () => expect(deriveTierFromScore(12)).toBe('high_impact'));
  it('15 -> critical_impact', () => expect(deriveTierFromScore(15)).toBe('critical_impact'));
  it('19 -> critical_impact', () => expect(deriveTierFromScore(19)).toBe('critical_impact'));
  it('20 -> catastrophic', () => expect(deriveTierFromScore(20)).toBe('catastrophic'));
  it('25 -> catastrophic (P5×I5)', () => expect(deriveTierFromScore(25)).toBe('catastrophic'));
});

// ─── W133 SIGNATURE regulator crossings ──────────────────────────────────
describe('W133 SIGNATURE regulator crossings', () => {
  it('escalate_risk + safety + critical_impact = crosses EVERY tier (W133 SIGNATURE)', () => {
    expect(crossesIntoRegulator('escalate_risk', { risk_category: 'safety', is_safety: 1, risk_tier: 'critical_impact' })).toBe(true);
  });
  it('escalate_risk + safety + catastrophic = crosses EVERY tier (W133 SIGNATURE)', () => {
    expect(crossesIntoRegulator('escalate_risk', { risk_category: 'safety', is_safety: 1, risk_tier: 'catastrophic' })).toBe(true);
  });
  it('escalate_risk + safety + high_impact = does NOT cross (not critical/catastrophic)', () => {
    expect(crossesIntoRegulator('escalate_risk', { risk_category: 'safety', is_safety: 1, risk_tier: 'high_impact' })).toBe(false);
  });
  it('escalate_risk + non-safety + critical = does NOT cross', () => {
    expect(crossesIntoRegulator('escalate_risk', { risk_category: 'financial', is_safety: 0, risk_tier: 'critical_impact' })).toBe(false);
  });
  it('flag_triggered + catastrophic = crosses EVERY tier (universal hard line)', () => {
    expect(crossesIntoRegulator('flag_triggered', { risk_tier: 'catastrophic' })).toBe(true);
  });
  it('flag_triggered + critical_impact = does NOT cross (only catastrophic)', () => {
    expect(crossesIntoRegulator('flag_triggered', { risk_tier: 'critical_impact' })).toBe(false);
  });
  it('close_risk + is_nersa_notifiable = crosses', () => {
    expect(crossesIntoRegulator('close_risk', { is_nersa_notifiable: 1 })).toBe(true);
  });
  it('close_risk + not notifiable = does not cross', () => {
    expect(crossesIntoRegulator('close_risk', { is_nersa_notifiable: 0 })).toBe(false);
  });
  it('assess_risk never crosses regardless of tier', () => {
    expect(crossesIntoRegulator('assess_risk', { risk_category: 'safety', is_safety: 1, risk_tier: 'catastrophic' })).toBe(false);
  });
  it('isReportable delegates correctly', () => {
    expect(isReportable('escalate_risk', { risk_category: 'safety', is_safety: 1, risk_tier: 'catastrophic' })).toBe(true);
    expect(isReportable('plan_response', { risk_category: 'safety', is_safety: 1 })).toBe(false);
  });
});

// ─── SLA breach crossings ─────────────────────────────────────────────────
describe('sla breach crossings', () => {
  it('critical_impact + safety = crosses regulator', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', { risk_category: 'safety', is_safety: 1 })).toBe(true);
  });
  it('catastrophic + regulatory = crosses regulator', () => {
    expect(slaBreachCrossesIntoRegulator('catastrophic', { risk_category: 'regulatory', is_regulatory: 1 })).toBe(true);
  });
  it('high_impact + safety = does NOT cross (only critical/catastrophic)', () => {
    expect(slaBreachCrossesIntoRegulator('high_impact', { risk_category: 'safety', is_safety: 1 })).toBe(false);
  });
  it('critical_impact + financial = does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('critical_impact', { risk_category: 'financial', is_safety: 0, is_regulatory: 0 })).toBe(false);
  });
});

// ─── Authority ladder ─────────────────────────────────────────────────────
describe('authority ladder', () => {
  it('identify_risk = risk_owner', () => expect(partyForAction('identify_risk')).toBe('risk_owner'));
  it('assess_risk = risk_owner', () => expect(partyForAction('assess_risk')).toBe('risk_owner'));
  it('flag_triggered = risk_owner', () => expect(partyForAction('flag_triggered')).toBe('risk_owner'));
  it('plan_response = risk_manager', () => expect(partyForAction('plan_response')).toBe('risk_manager'));
  it('assign_owner = risk_manager', () => expect(partyForAction('assign_owner')).toBe('risk_manager'));
  it('activate_monitoring = risk_manager', () => expect(partyForAction('activate_monitoring')).toBe('risk_manager'));
  it('close_risk = risk_director', () => expect(partyForAction('close_risk')).toBe('risk_director'));
  it('archive_risk = risk_director', () => expect(partyForAction('archive_risk')).toBe('risk_director'));
  it('escalate_risk = risk_director', () => expect(partyForAction('escalate_risk')).toBe('risk_director'));
});

// ─── Event type mapping ───────────────────────────────────────────────────
describe('event types', () => {
  const cases: Array<[RiskAction, string]> = [
    ['identify_risk',       'ipp_risk.identified'],
    ['assess_risk',         'ipp_risk.assessed'],
    ['quantify_risk',       'ipp_risk.quantified'],
    ['plan_response',       'ipp_risk.response_planned'],
    ['assign_owner',        'ipp_risk.owner_assigned'],
    ['activate_monitoring', 'ipp_risk.monitoring'],
    ['flag_triggered',      'ipp_risk.triggered'],
    ['start_response',      'ipp_risk.responding'],
    ['record_outcome',      'ipp_risk.outcome_recorded'],
    ['close_risk',          'ipp_risk.closed'],
    ['archive_risk',        'ipp_risk.archived'],
    ['escalate_risk',       'ipp_risk.escalated'],
    ['defer_risk',          'ipp_risk.deferred'],
    ['reactivate_risk',     'ipp_risk.reactivated'],
    ['cancel_risk',         'ipp_risk.cancelled'],
    ['flag_overdue',        'ipp_risk.sla_breached'],
  ];
  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });
  it('all 16 actions are mapped', () => {
    expect(cases).toHaveLength(16);
  });
});

// ─── statusTsCol ──────────────────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[RiskStatus, string]> = [
    ['identified',       'identified_at'],
    ['assessed',         'assessed_at'],
    ['quantified',       'quantified_at'],
    ['response_planned', 'response_planned_at'],
    ['owner_assigned',   'owner_assigned_at'],
    ['monitoring',       'monitoring_at'],
    ['triggered',        'triggered_at'],
    ['responding',       'responding_at'],
    ['outcome_recorded', 'outcome_recorded_at'],
    ['closed',           'closed_at'],
    ['archived',         'archived_at'],
    ['escalated',        'escalated_at'],
    ['deferred',         'deferred_at'],
    ['cancelled',        'cancelled_at'],
    ['overdue_flagged',  'overdue_flagged_at'],
  ];
  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });
});

// ─── Urgency band ─────────────────────────────────────────────────────────
describe('urgency band', () => {
  it('catastrophic => catastrophic', () => expect(urgencyBand('catastrophic')).toBe('catastrophic'));
  it('critical_impact => critical', () => expect(urgencyBand('critical_impact')).toBe('critical'));
  it('high_impact => high', () => expect(urgencyBand('high_impact')).toBe('high'));
  it('medium_impact => medium', () => expect(urgencyBand('medium_impact')).toBe('medium'));
  it('low_impact => low', () => expect(urgencyBand('low_impact')).toBe('low'));
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

// ─── TIER_LABELS ──────────────────────────────────────────────────────────
describe('TIER_LABELS', () => {
  it('has 5 tier labels', () => {
    expect(Object.keys(TIER_LABELS)).toHaveLength(5);
    expect(TIER_LABELS['catastrophic']).toBe('Catastrophic');
    expect(TIER_LABELS['low_impact']).toBe('Low');
  });
});
