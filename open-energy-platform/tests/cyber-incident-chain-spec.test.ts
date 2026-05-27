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
  type CyberStatus,
} from '../src/utils/cyber-incident-chain-spec';

describe('Cyber incident chain spec', () => {
  describe('happy path', () => {
    it('walks detected → triaged → contained → notified_regulator → notified_subjects → investigating → remediation_planned → remediation_executing → verified → closed', () => {
      expect(nextStatus('detected',                'triage')).toBe('triaged');
      expect(nextStatus('triaged',                 'contain')).toBe('contained');
      expect(nextStatus('contained',               'notify_regulator')).toBe('notified_regulator');
      expect(nextStatus('notified_regulator',      'notify_subjects')).toBe('notified_subjects');
      expect(nextStatus('notified_subjects',       'begin_investigation')).toBe('investigating');
      expect(nextStatus('investigating',           'complete_rca')).toBe('remediation_planned');
      expect(nextStatus('remediation_planned',     'dispatch_remediation')).toBe('remediation_executing');
      expect(nextStatus('remediation_executing',   'verify_remediation')).toBe('verified');
      expect(nextStatus('verified',                'close')).toBe('closed');
    });

    it('skip_notify path: contained → investigating (non-reportable tier shortcut)', () => {
      expect(nextStatus('contained', 'skip_notify')).toBe('investigating');
    });
  });

  describe('escalate branch', () => {
    it('escalate reachable from investigating, remediation_planned, remediation_executing', () => {
      expect(nextStatus('investigating',         'escalate')).toBe('escalated');
      expect(nextStatus('remediation_planned',   'escalate')).toBe('escalated');
      expect(nextStatus('remediation_executing', 'escalate')).toBe('escalated');
    });

    it('escalate NOT reachable from detected/triaged/contained/notified_*/verified', () => {
      expect(nextStatus('detected',           'escalate')).toBeNull();
      expect(nextStatus('triaged',            'escalate')).toBeNull();
      expect(nextStatus('contained',          'escalate')).toBeNull();
      expect(nextStatus('notified_regulator', 'escalate')).toBeNull();
      expect(nextStatus('notified_subjects',  'escalate')).toBeNull();
      expect(nextStatus('verified',           'escalate')).toBeNull();
    });

    it('escalated closes via close_escalated', () => {
      expect(nextStatus('escalated', 'close_escalated')).toBe('closed');
      expect(nextStatus('escalated', 'close')).toBeNull();
    });
  });

  describe('false_alarm branch', () => {
    it('mark_false_alarm reachable from detected and triaged only', () => {
      expect(nextStatus('detected', 'mark_false_alarm')).toBe('false_alarm');
      expect(nextStatus('triaged',  'mark_false_alarm')).toBe('false_alarm');
    });

    it('mark_false_alarm NOT reachable once containment has started', () => {
      expect(nextStatus('contained',             'mark_false_alarm')).toBeNull();
      expect(nextStatus('notified_regulator',    'mark_false_alarm')).toBeNull();
      expect(nextStatus('investigating',         'mark_false_alarm')).toBeNull();
      expect(nextStatus('remediation_executing', 'mark_false_alarm')).toBeNull();
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
      expect(isTerminal('detected')).toBe(false);
    });

    it('closed is sticky', () => {
      expect(nextStatus('closed', 'triage')).toBeNull();
      expect(nextStatus('closed', 'close')).toBeNull();
    });
  });

  describe('tier mapping (reportable)', () => {
    it('catastrophic, major, personal_data are reportable', () => {
      expect(isReportable('catastrophic')).toBe(true);
      expect(isReportable('major')).toBe(true);
      expect(isReportable('personal_data')).toBe(true);
    });

    it('operational and low are NOT reportable (internal)', () => {
      expect(isReportable('operational')).toBe(false);
      expect(isReportable('low')).toBe(false);
    });
  });

  describe('SLA matrix (URGENT shape — catastrophic fastest)', () => {
    it('catastrophic gets the shortest SLA at every active stage', () => {
      const stages: CyberStatus[] = [
        'detected', 'triaged', 'investigating',
        'remediation_planned', 'remediation_executing',
      ];
      for (const s of stages) {
        expect(SLA_MINUTES[s].catastrophic).toBeLessThanOrEqual(SLA_MINUTES[s].major);
        expect(SLA_MINUTES[s].major).toBeLessThanOrEqual(SLA_MINUTES[s].operational);
        expect(SLA_MINUTES[s].operational).toBeLessThanOrEqual(SLA_MINUTES[s].low);
      }
    });

    it('POPIA Section 22 — major contained → notify_regulator within 72h', () => {
      expect(SLA_MINUTES.contained.major).toBe(72 * 60);
    });

    it('catastrophic contained → notify_regulator within 24h (market-integrity hard cap)', () => {
      expect(SLA_MINUTES.contained.catastrophic).toBe(24 * 60);
    });

    it('catastrophic detection → triage within 30 minutes', () => {
      expect(SLA_MINUTES.detected.catastrophic).toBe(30);
    });

    it('slaDeadlineFor returns null for terminals / no-SLA tier combos', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      expect(slaDeadlineFor('closed',      'catastrophic', t0)).toBeNull();
      expect(slaDeadlineFor('false_alarm', 'major',        t0)).toBeNull();
      expect(slaDeadlineFor('contained',   'operational',  t0)).toBeNull();
    });

    it('slaDeadlineFor on detected+catastrophic adds 30 minutes', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('detected', 'catastrophic', t0)!;
      expect(d.toISOString()).toBe('2026-05-28T00:30:00.000Z');
    });

    it('slaDeadlineFor on contained+major adds 72 hours (POPIA s22)', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('contained', 'major', t0)!;
      expect(d.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    });
  });

  describe('regulator crossings (reportable tiers only)', () => {
    it('catastrophic notify_regulator crosses', () => {
      expect(crossesIntoRegulator('notify_regulator', 'catastrophic')).toBe(true);
    });

    it('major escalate crosses', () => {
      expect(crossesIntoRegulator('escalate', 'major')).toBe(true);
    });

    it('personal_data close crosses', () => {
      expect(crossesIntoRegulator('close', 'personal_data')).toBe(true);
    });

    it('catastrophic close_escalated crosses', () => {
      expect(crossesIntoRegulator('close_escalated', 'catastrophic')).toBe(true);
    });

    it('operational / low never cross regardless of action', () => {
      const actions = ['notify_regulator', 'escalate', 'close', 'close_escalated'] as const;
      for (const a of actions) {
        expect(crossesIntoRegulator(a, 'operational')).toBe(false);
        expect(crossesIntoRegulator(a, 'low')).toBe(false);
      }
    });

    it('triage / contain / notify_subjects / skip_notify / false_alarm actions never cross regardless of tier', () => {
      expect(crossesIntoRegulator('triage',            'catastrophic')).toBe(false);
      expect(crossesIntoRegulator('contain',           'catastrophic')).toBe(false);
      expect(crossesIntoRegulator('notify_subjects',   'catastrophic')).toBe(false);
      expect(crossesIntoRegulator('skip_notify',       'major')).toBe(false);
      expect(crossesIntoRegulator('mark_false_alarm',  'catastrophic')).toBe(false);
      expect(crossesIntoRegulator('close_false_alarm', 'major')).toBe(false);
    });

    it('SLA breach crosses only for reportable tiers', () => {
      expect(slaBreachCrossesIntoRegulator('catastrophic')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('personal_data')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('operational')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('low')).toBe(false);
    });
  });

  describe('allowedActions sanity', () => {
    it('detected offers triage and mark_false_alarm', () => {
      const a = allowedActions('detected');
      expect(a).toContain('triage');
      expect(a).toContain('mark_false_alarm');
      expect(a).not.toContain('escalate');
    });

    it('triaged offers contain and mark_false_alarm', () => {
      const a = allowedActions('triaged');
      expect(a).toContain('contain');
      expect(a).toContain('mark_false_alarm');
    });

    it('contained offers notify_regulator and skip_notify', () => {
      const a = allowedActions('contained');
      expect(a).toContain('notify_regulator');
      expect(a).toContain('skip_notify');
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
