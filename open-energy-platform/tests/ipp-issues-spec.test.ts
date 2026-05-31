// Wave 132 — IPP Issues Log spec tests
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
  partyForAction,
  eventTypeFor,
  statusTsCol,
  urgencyBand,
  timeInStateHours,
  PRIORITY_LABELS,
  SLA_HOURS,
  type IssueStatus,
  type IssueAction,
  type IssuePriority,
} from '../src/utils/ipp-issues-spec';

// ─── Forward path ─────────────────────────────────────────────────────────
describe('forward path', () => {
  const path: Array<[IssueStatus, IssueAction, IssueStatus]> = [
    ['raised',         'triage_issue',      'triaged'],
    ['triaged',        'assign_issue',      'assigned'],
    ['assigned',       'acknowledge_issue', 'acknowledged'],
    ['acknowledged',   'start_progress',    'in_progress'],
    ['in_progress',    'submit_for_review', 'under_review'],
    ['under_review',   'resolve_issue',     'resolved'],
    ['resolved',       'verify_resolution', 'verified'],
    ['verified',       'file_evidence',     'evidence_filed'],
    ['evidence_filed', 'close_issue',       'closed'],
    ['closed',         'archive_issue',     'archived'],
  ];

  it.each(path)('%s + %s => %s', (from, action, expected) => {
    expect(nextStatus(from, action)).toBe(expected);
  });

  it('rejects invalid actions from terminal archived', () => {
    expect(nextStatus('archived', 'triage_issue')).toBeNull();
    expect(nextStatus('archived', 'assign_issue')).toBeNull();
    expect(nextStatus('archived', 'close_issue')).toBeNull();
  });

  it('rejects invalid actions from terminal cancelled', () => {
    expect(nextStatus('cancelled', 'triage_issue')).toBeNull();
  });

  it('rejects wrong from-state', () => {
    expect(nextStatus('raised', 'verify_resolution')).toBeNull();
    expect(nextStatus('closed', 'triage_issue')).toBeNull();
  });
});

// ─── Blocked / unblock loop ───────────────────────────────────────────────
describe('blocked / unblock loop', () => {
  it('in_progress -> flag_blocked -> blocked', () => {
    expect(nextStatus('in_progress', 'flag_blocked')).toBe('blocked');
  });
  it('blocked -> unblock_issue -> in_progress', () => {
    expect(nextStatus('blocked', 'unblock_issue')).toBe('in_progress');
  });
  it('acknowledged -> flag_blocked -> blocked', () => {
    expect(nextStatus('acknowledged', 'flag_blocked')).toBe('blocked');
  });
});

// ─── Branch states ────────────────────────────────────────────────────────
describe('branch states', () => {
  it('raise -> escalate_to_regulator -> escalated', () => {
    expect(nextStatus('raised', 'escalate_to_regulator')).toBe('escalated');
  });
  it('in_progress -> defer_issue -> deferred', () => {
    expect(nextStatus('in_progress', 'defer_issue')).toBe('deferred');
  });
  it('triaged -> defer_issue -> deferred', () => {
    expect(nextStatus('triaged', 'defer_issue')).toBe('deferred');
  });
  it('deferred -> triage_issue loops back to triaged', () => {
    expect(nextStatus('deferred', 'triage_issue')).toBe('triaged');
  });
  it('deferred -> start_progress -> in_progress', () => {
    expect(nextStatus('deferred', 'start_progress')).toBe('in_progress');
  });
  it('escalated -> assign_issue -> assigned', () => {
    expect(nextStatus('escalated', 'assign_issue')).toBe('assigned');
  });
  it('resolved -> cancel_issue -> cancelled (HARD terminal)', () => {
    expect(nextStatus('resolved', 'cancel_issue')).toBe('cancelled');
    expect(isHardTerminal('cancelled')).toBe(true);
  });
  it('flag_overdue returns CURRENT status (cron-only)', () => {
    expect(nextStatus('in_progress', 'flag_overdue')).toBe('in_progress');
    expect(nextStatus('triaged', 'flag_overdue')).toBe('triaged');
  });
});

// ─── Hard terminals ───────────────────────────────────────────────────────
describe('hard terminals', () => {
  it('archived and cancelled are hard terminals', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isHardTerminal('cancelled')).toBe(true);
  });
  it('isTerminal matches isHardTerminal for this chain', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('closed')).toBe(false);
    expect(isTerminal('escalated')).toBe(false);
  });
});

// ─── URGENT SLA polarity ──────────────────────────────────────────────────
describe('URGENT SLA polarity', () => {
  it('P1 critical = 24h (tightest)', () => {
    expect(slaHoursFor('p1_critical')).toBe(24);
  });
  it('P2 high = 72h', () => {
    expect(slaHoursFor('p2_high')).toBe(72);
  });
  it('P3 medium = 168h', () => {
    expect(slaHoursFor('p3_medium')).toBe(168);
  });
  it('P4 low = 336h', () => {
    expect(slaHoursFor('p4_low')).toBe(336);
  });
  it('P5 informational = 720h (loosest)', () => {
    expect(slaHoursFor('p5_informational')).toBe(720);
  });
  it('URGENT polarity: P1 < P2 < P3 < P4 < P5', () => {
    const priorities: IssuePriority[] = ['p1_critical','p2_high','p3_medium','p4_low','p5_informational'];
    for (let i = 0; i < priorities.length - 1; i++) {
      expect(slaHoursFor(priorities[i])).toBeLessThan(slaHoursFor(priorities[i + 1]));
    }
  });
  it('SLA_HOURS record has all priorities', () => {
    expect(Object.keys(SLA_HOURS)).toHaveLength(5);
  });
  it('slaDeadlineFor adds correct hours', () => {
    const from = new Date('2026-05-31T12:00:00Z');
    const deadline = slaDeadlineFor('p1_critical', from);
    expect(deadline.getTime()).toBe(from.getTime() + 24 * 3600 * 1000);
  });
  it('slaHoursRemaining positive when not breached', () => {
    const future = new Date(Date.now() + 10 * 3600 * 1000);
    const rem = slaHoursRemaining(future.toISOString(), new Date());
    expect(rem).toBeGreaterThan(0);
  });
  it('slaHoursRemaining negative when breached', () => {
    const past = new Date(Date.now() - 5 * 3600 * 1000);
    const rem = slaHoursRemaining(past.toISOString(), new Date());
    expect(rem).toBeLessThan(0);
  });
  it('slaHoursRemaining null when no deadline', () => {
    expect(slaHoursRemaining(null, new Date())).toBeNull();
  });
});

// ─── W132 SIGNATURE regulator crossings ──────────────────────────────────
describe('W132 SIGNATURE regulator crossings', () => {
  it('escalate_to_regulator + safety = crosses EVERY tier (W132 SIGNATURE)', () => {
    expect(crossesIntoRegulator('escalate_to_regulator', { category: 'safety', is_safety: 1 })).toBe(true);
  });
  it('escalate_to_regulator + regulatory = crosses EVERY tier (W132 SIGNATURE)', () => {
    expect(crossesIntoRegulator('escalate_to_regulator', { category: 'regulatory', is_regulatory: 1 })).toBe(true);
  });
  it('escalate_to_regulator + general category = does NOT cross', () => {
    expect(crossesIntoRegulator('escalate_to_regulator', { category: 'general', is_safety: 0, is_regulatory: 0 })).toBe(false);
  });
  it('escalate_to_regulator + is_safety=1 regardless of category = crosses', () => {
    expect(crossesIntoRegulator('escalate_to_regulator', { category: 'technical', is_safety: 1 })).toBe(true);
  });
  it('close_issue + is_nersa_notifiable = crosses', () => {
    expect(crossesIntoRegulator('close_issue', { is_nersa_notifiable: 1 })).toBe(true);
  });
  it('close_issue + not notifiable = does not cross', () => {
    expect(crossesIntoRegulator('close_issue', { is_nersa_notifiable: 0 })).toBe(false);
  });
  it('assign_issue never crosses', () => {
    expect(crossesIntoRegulator('assign_issue', { category: 'safety', is_safety: 1 })).toBe(false);
  });
  it('resolve_issue never crosses', () => {
    expect(crossesIntoRegulator('resolve_issue', { category: 'regulatory', is_regulatory: 1 })).toBe(false);
  });
  it('isReportable delegates correctly', () => {
    expect(isReportable('escalate_to_regulator', { category: 'safety', is_safety: 1 })).toBe(true);
    expect(isReportable('triage_issue', { category: 'safety' })).toBe(false);
  });
});

// ─── SLA breach crossings ─────────────────────────────────────────────────
describe('sla breach crossings', () => {
  it('P1 safety SLA breach = crosses regulator', () => {
    expect(slaBreachCrossesIntoRegulator('p1_critical', { category: 'safety', is_safety: 1 })).toBe(true);
  });
  it('P1 regulatory SLA breach = crosses regulator', () => {
    expect(slaBreachCrossesIntoRegulator('p1_critical', { category: 'regulatory', is_regulatory: 1 })).toBe(true);
  });
  it('P2 safety SLA breach = crosses regulator', () => {
    expect(slaBreachCrossesIntoRegulator('p2_high', { category: 'safety', is_safety: 1 })).toBe(true);
  });
  it('P1 general SLA breach = does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('p1_critical', { category: 'general', is_safety: 0, is_regulatory: 0 })).toBe(false);
  });
  it('P3 safety SLA breach = does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('p3_medium', { category: 'safety', is_safety: 1 })).toBe(false);
  });
  it('P4 regulatory SLA breach = does NOT cross', () => {
    expect(slaBreachCrossesIntoRegulator('p4_low', { category: 'regulatory', is_regulatory: 1 })).toBe(false);
  });
});

// ─── Authority ladder ─────────────────────────────────────────────────────
describe('authority ladder', () => {
  it('raise_issue = project_coordinator', () => {
    expect(partyForAction('raise_issue')).toBe('project_coordinator');
  });
  it('start_progress = project_coordinator', () => {
    expect(partyForAction('start_progress')).toBe('project_coordinator');
  });
  it('triage_issue = project_manager', () => {
    expect(partyForAction('triage_issue')).toBe('project_manager');
  });
  it('assign_issue = project_manager', () => {
    expect(partyForAction('assign_issue')).toBe('project_manager');
  });
  it('resolve_issue = project_manager', () => {
    expect(partyForAction('resolve_issue')).toBe('project_manager');
  });
  it('verify_resolution = project_manager', () => {
    expect(partyForAction('verify_resolution')).toBe('project_manager');
  });
  it('close_issue = project_director', () => {
    expect(partyForAction('close_issue')).toBe('project_director');
  });
  it('archive_issue = project_director', () => {
    expect(partyForAction('archive_issue')).toBe('project_director');
  });
  it('escalate_to_regulator = project_director', () => {
    expect(partyForAction('escalate_to_regulator')).toBe('project_director');
  });
});

// ─── Event type mapping ───────────────────────────────────────────────────
describe('event types', () => {
  const cases: Array<[IssueAction, string]> = [
    ['raise_issue',            'ipp_issue.raised'],
    ['triage_issue',           'ipp_issue.triaged'],
    ['assign_issue',           'ipp_issue.assigned'],
    ['acknowledge_issue',      'ipp_issue.acknowledged'],
    ['start_progress',         'ipp_issue.in_progress'],
    ['flag_blocked',           'ipp_issue.blocked'],
    ['unblock_issue',          'ipp_issue.unblocked'],
    ['submit_for_review',      'ipp_issue.under_review'],
    ['resolve_issue',          'ipp_issue.resolved'],
    ['verify_resolution',      'ipp_issue.verified'],
    ['file_evidence',          'ipp_issue.evidence_filed'],
    ['close_issue',            'ipp_issue.closed'],
    ['archive_issue',          'ipp_issue.archived'],
    ['escalate_to_regulator',  'ipp_issue.escalated'],
    ['defer_issue',            'ipp_issue.deferred'],
    ['cancel_issue',           'ipp_issue.cancelled'],
    ['flag_overdue',           'ipp_issue.sla_breached'],
  ];
  it.each(cases)('eventTypeFor(%s) = %s', (action, expected) => {
    expect(eventTypeFor(action)).toBe(expected);
  });
  it('all 17 actions are mapped', () => {
    expect(cases).toHaveLength(17);
  });
});

// ─── statusTsCol ──────────────────────────────────────────────────────────
describe('statusTsCol', () => {
  const cases: Array<[IssueStatus, string]> = [
    ['raised',         'raised_at'],
    ['triaged',        'triaged_at'],
    ['assigned',       'assigned_at'],
    ['in_progress',    'in_progress_at'],
    ['blocked',        'blocked_at'],
    ['resolved',       'resolved_at'],
    ['closed',         'closed_at'],
    ['archived',       'archived_at'],
    ['escalated',      'escalated_at'],
    ['deferred',       'deferred_at'],
    ['cancelled',      'cancelled_at'],
    ['overdue_flagged','overdue_flagged_at'],
  ];
  it.each(cases)('statusTsCol(%s) = %s', (status, expected) => {
    expect(statusTsCol(status)).toBe(expected);
  });
});

// ─── Urgency band ─────────────────────────────────────────────────────────
describe('urgency band', () => {
  it('p1_critical => critical', () => expect(urgencyBand('p1_critical')).toBe('critical'));
  it('p2_high => high',         () => expect(urgencyBand('p2_high')).toBe('high'));
  it('p3_medium => medium',     () => expect(urgencyBand('p3_medium')).toBe('medium'));
  it('p4_low => low',           () => expect(urgencyBand('p4_low')).toBe('low'));
  it('p5_informational => informational', () => expect(urgencyBand('p5_informational')).toBe('informational'));
});

// ─── timeInStateHours ─────────────────────────────────────────────────────
describe('timeInStateHours', () => {
  it('returns null when stateAt is null', () => {
    expect(timeInStateHours(null, new Date())).toBeNull();
  });
  it('returns positive hours for past timestamp', () => {
    const past = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const hours = timeInStateHours(past, new Date());
    expect(hours).toBeGreaterThanOrEqual(4);
    expect(hours).toBeLessThanOrEqual(6);
  });
});

// ─── Priority labels ──────────────────────────────────────────────────────
describe('PRIORITY_LABELS', () => {
  it('has all 5 priority labels', () => {
    expect(Object.keys(PRIORITY_LABELS)).toHaveLength(5);
    expect(PRIORITY_LABELS['p1_critical']).toBe('P1 Critical');
    expect(PRIORITY_LABELS['p5_informational']).toBe('P5 Info');
  });
});
