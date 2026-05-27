import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  isReportable,
  slaDeadlineFor,
  SLA_MINUTES,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  type HseStatus,
} from '../src/utils/hse-incident-chain-spec';

describe('HSE incident chain spec', () => {
  describe('happy path', () => {
    it('walks reported → triaged → notified_authority → investigating → corrective_actions_planned → corrective_actions_executing → verified → closed', () => {
      expect(nextStatus('reported',                     'triage')).toBe('triaged');
      expect(nextStatus('triaged',                      'notify_authority')).toBe('notified_authority');
      expect(nextStatus('notified_authority',           'begin_investigation')).toBe('investigating');
      expect(nextStatus('investigating',                'complete_rca')).toBe('corrective_actions_planned');
      expect(nextStatus('corrective_actions_planned',   'dispatch_corrective')).toBe('corrective_actions_executing');
      expect(nextStatus('corrective_actions_executing', 'verify_corrective')).toBe('verified');
      expect(nextStatus('verified',                     'close')).toBe('closed');
    });

    it('begin_investigation also reachable from triaged (skip authority notify for minor)', () => {
      expect(nextStatus('triaged', 'begin_investigation')).toBe('investigating');
    });
  });

  describe('escalate branch', () => {
    it('escalate reachable from investigating, corrective_actions_planned, corrective_actions_executing', () => {
      expect(nextStatus('investigating',                'escalate')).toBe('escalated');
      expect(nextStatus('corrective_actions_planned',   'escalate')).toBe('escalated');
      expect(nextStatus('corrective_actions_executing', 'escalate')).toBe('escalated');
    });

    it('escalate NOT reachable from reported/triaged/notified_authority/verified', () => {
      expect(nextStatus('reported',           'escalate')).toBeNull();
      expect(nextStatus('triaged',            'escalate')).toBeNull();
      expect(nextStatus('notified_authority', 'escalate')).toBeNull();
      expect(nextStatus('verified',           'escalate')).toBeNull();
    });

    it('escalated closes via close_escalated', () => {
      expect(nextStatus('escalated', 'close_escalated')).toBe('closed');
      expect(nextStatus('escalated', 'close')).toBeNull();
    });
  });

  describe('false_alarm branch', () => {
    it('mark_false_alarm reachable from reported and triaged only', () => {
      expect(nextStatus('reported', 'mark_false_alarm')).toBe('false_alarm');
      expect(nextStatus('triaged',  'mark_false_alarm')).toBe('false_alarm');
    });

    it('mark_false_alarm NOT reachable after investigation has started', () => {
      expect(nextStatus('investigating',                'mark_false_alarm')).toBeNull();
      expect(nextStatus('corrective_actions_planned',   'mark_false_alarm')).toBeNull();
      expect(nextStatus('corrective_actions_executing', 'mark_false_alarm')).toBeNull();
    });

    it('false_alarm closes via close_false_alarm', () => {
      expect(nextStatus('false_alarm', 'close_false_alarm')).toBe('closed');
      expect(nextStatus('false_alarm', 'close')).toBeNull();
    });
  });

  describe('terminals', () => {
    it('only closed is terminal', () => {
      expect(isTerminal('closed')).toBe(true);
      expect(isTerminal('verified')).toBe(false);
      expect(isTerminal('escalated')).toBe(false);
      expect(isTerminal('false_alarm')).toBe(false);
      expect(isTerminal('reported')).toBe(false);
    });

    it('closed is sticky', () => {
      expect(nextStatus('closed', 'triage')).toBeNull();
      expect(nextStatus('closed', 'close')).toBeNull();
    });
  });

  describe('tier mapping (reportable)', () => {
    it('fatal, major, environmental are reportable', () => {
      expect(isReportable('fatal')).toBe(true);
      expect(isReportable('major')).toBe(true);
      expect(isReportable('environmental')).toBe(true);
    });

    it('minor and near_miss are NOT reportable (internal)', () => {
      expect(isReportable('minor')).toBe(false);
      expect(isReportable('near_miss')).toBe(false);
    });
  });

  describe('SLA matrix (URGENT shape — fatal fastest)', () => {
    it('fatal gets the shortest SLA at every non-zero stage', () => {
      const stages: HseStatus[] = [
        'reported', 'triaged', 'investigating',
        'corrective_actions_planned', 'corrective_actions_executing',
      ];
      for (const s of stages) {
        expect(SLA_MINUTES[s].fatal).toBeLessThanOrEqual(SLA_MINUTES[s].major);
        expect(SLA_MINUTES[s].major).toBeLessThanOrEqual(SLA_MINUTES[s].minor);
        expect(SLA_MINUTES[s].minor).toBeLessThanOrEqual(SLA_MINUTES[s].near_miss);
      }
    });

    it('OHSA Section 24 — fatal triaged within 8h (DEL notification window)', () => {
      expect(SLA_MINUTES.triaged.fatal).toBe(8 * 60);
    });

    it('NEMA Section 30 — environmental triaged within 72h (DFFE notification window)', () => {
      expect(SLA_MINUTES.triaged.environmental).toBe(72 * 60);
    });

    it('fatal report must be triaged within 1 hour', () => {
      expect(SLA_MINUTES.reported.fatal).toBe(1 * 60);
    });

    it('slaDeadlineFor returns null for terminals/no-SLA tiers', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      expect(slaDeadlineFor('closed',      'fatal', t0)).toBeNull();
      expect(slaDeadlineFor('false_alarm', 'major', t0)).toBeNull();
      expect(slaDeadlineFor('notified_authority', 'minor', t0)).toBeNull();
    });

    it('slaDeadlineFor on reported+fatal adds 1 hour', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('reported', 'fatal', t0)!;
      expect(d.toISOString()).toBe('2026-05-28T01:00:00.000Z');
    });

    it('slaDeadlineFor on triaged+environmental adds 72 hours', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('triaged', 'environmental', t0)!;
      expect(d.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    });
  });

  describe('regulator crossings (reportable tiers only)', () => {
    it('fatal notify_authority crosses', () => {
      expect(crossesIntoRegulator('notify_authority', 'fatal')).toBe(true);
    });

    it('fatal escalate crosses', () => {
      expect(crossesIntoRegulator('escalate', 'fatal')).toBe(true);
    });

    it('major close crosses (regulator-grade incident closes need reg visibility)', () => {
      expect(crossesIntoRegulator('close', 'major')).toBe(true);
    });

    it('environmental close_escalated crosses', () => {
      expect(crossesIntoRegulator('close_escalated', 'environmental')).toBe(true);
    });

    it('minor / near_miss never cross regardless of action', () => {
      const actions = ['notify_authority', 'escalate', 'close', 'close_escalated'] as const;
      for (const a of actions) {
        expect(crossesIntoRegulator(a, 'minor')).toBe(false);
        expect(crossesIntoRegulator(a, 'near_miss')).toBe(false);
      }
    });

    it('triage / mark_false_alarm / close_false_alarm never cross regardless of tier', () => {
      expect(crossesIntoRegulator('triage',            'fatal')).toBe(false);
      expect(crossesIntoRegulator('mark_false_alarm',  'fatal')).toBe(false);
      expect(crossesIntoRegulator('close_false_alarm', 'environmental')).toBe(false);
    });

    it('SLA breach crosses only for reportable tiers', () => {
      expect(slaBreachCrossesIntoRegulator('fatal')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('environmental')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('near_miss')).toBe(false);
    });
  });

  describe('allowedActions sanity', () => {
    it('reported offers triage and mark_false_alarm', () => {
      const a = allowedActions('reported');
      expect(a).toContain('triage');
      expect(a).toContain('mark_false_alarm');
      expect(a).not.toContain('escalate');
    });

    it('triaged offers notify_authority, begin_investigation, mark_false_alarm', () => {
      const a = allowedActions('triaged');
      expect(a).toContain('notify_authority');
      expect(a).toContain('begin_investigation');
      expect(a).toContain('mark_false_alarm');
    });

    it('investigating offers complete_rca and escalate', () => {
      const a = allowedActions('investigating');
      expect(a).toContain('complete_rca');
      expect(a).toContain('escalate');
      expect(a).not.toContain('mark_false_alarm');
    });

    it('verified offers only close', () => {
      expect(allowedActions('verified')).toEqual(['close']);
    });

    it('escalated offers only close_escalated', () => {
      expect(allowedActions('escalated')).toEqual(['close_escalated']);
    });

    it('false_alarm offers only close_false_alarm', () => {
      expect(allowedActions('false_alarm')).toEqual(['close_false_alarm']);
    });

    it('closed offers nothing', () => {
      expect(allowedActions('closed')).toEqual([]);
    });
  });
});
