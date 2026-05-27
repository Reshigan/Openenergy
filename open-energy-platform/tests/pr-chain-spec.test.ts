import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  tierFromCapacityMw,
  slaDeadlineFor,
  SLA_MINUTES,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  type PrStatus,
} from '../src/utils/pr-chain-spec';

describe('pr chain spec', () => {
  describe('happy path', () => {
    it('walks monitoring → warning → investigating → intervention_planned → intervention_executing → verified → closed', () => {
      expect(nextStatus('monitoring',             'start_warning')).toBe('warning');
      expect(nextStatus('warning',                'begin_investigation')).toBe('investigating');
      expect(nextStatus('investigating',          'complete_rca')).toBe('intervention_planned');
      expect(nextStatus('intervention_planned',   'dispatch_intervention')).toBe('intervention_executing');
      expect(nextStatus('intervention_executing', 'verify_recovery')).toBe('verified');
      expect(nextStatus('verified',               'close')).toBe('closed');
    });
  });

  describe('escalation branch', () => {
    it('intervention_executing → escalated → closed', () => {
      expect(nextStatus('intervention_executing', 'escalate')).toBe('escalated');
      expect(nextStatus('escalated', 'close_escalated')).toBe('closed');
    });

    it('investigating can also escalate (RCA shows OEM root cause)', () => {
      expect(nextStatus('investigating', 'escalate')).toBe('escalated');
    });

    it('cannot escalate from monitoring or warning', () => {
      expect(nextStatus('monitoring', 'escalate')).toBeNull();
      expect(nextStatus('warning',    'escalate')).toBeNull();
    });
  });

  describe('false alarm branch', () => {
    it('warning → false_alarm → closed', () => {
      expect(nextStatus('warning',    'mark_false_alarm')).toBe('false_alarm');
      expect(nextStatus('false_alarm','close_false_alarm')).toBe('closed');
    });

    it('investigating can also be marked false_alarm', () => {
      expect(nextStatus('investigating', 'mark_false_alarm')).toBe('false_alarm');
    });

    it('cannot mark false_alarm post-RCA', () => {
      expect(nextStatus('intervention_planned',   'mark_false_alarm')).toBeNull();
      expect(nextStatus('intervention_executing', 'mark_false_alarm')).toBeNull();
    });
  });

  describe('terminals', () => {
    it('closed is the only terminal', () => {
      expect(isTerminal('closed')).toBe(true);
      expect(isTerminal('verified')).toBe(false);
      expect(isTerminal('escalated')).toBe(false);
      expect(isTerminal('false_alarm')).toBe(false);
      expect(isTerminal('monitoring')).toBe(false);
    });

    it('closed accepts no further actions', () => {
      expect(nextStatus('closed', 'start_warning')).toBeNull();
      expect(nextStatus('closed', 'close')).toBeNull();
    });
  });

  describe('tier mapping', () => {
    it('utility ≥50MW', () => {
      expect(tierFromCapacityMw(50)).toBe('utility');
      expect(tierFromCapacityMw(150)).toBe('utility');
    });
    it('midscale ≥10MW', () => {
      expect(tierFromCapacityMw(10)).toBe('midscale');
      expect(tierFromCapacityMw(49.9)).toBe('midscale');
    });
    it('ci ≥1MW', () => {
      expect(tierFromCapacityMw(1)).toBe('ci');
      expect(tierFromCapacityMw(9.9)).toBe('ci');
    });
    it('microgrid <1MW', () => {
      expect(tierFromCapacityMw(0.5)).toBe('microgrid');
      expect(tierFromCapacityMw(0.05)).toBe('microgrid');
    });
  });

  describe('SLA matrix', () => {
    it('warning is URGENT for utility (24h) and shorter for smaller', () => {
      expect(SLA_MINUTES.warning.utility).toBe(24 * 60);
      expect(SLA_MINUTES.warning.midscale).toBe(12 * 60);
      expect(SLA_MINUTES.warning.ci).toBe(6 * 60);
      expect(SLA_MINUTES.warning.microgrid).toBe(2 * 60);
    });

    it('intervention_executing is INVERTED for utility (more time)', () => {
      expect(SLA_MINUTES.intervention_executing.utility).toBeGreaterThan(SLA_MINUTES.intervention_executing.midscale);
      expect(SLA_MINUTES.intervention_executing.midscale).toBeGreaterThan(SLA_MINUTES.intervention_executing.ci);
      expect(SLA_MINUTES.intervention_executing.ci).toBeGreaterThan(SLA_MINUTES.intervention_executing.microgrid);
    });

    it('verified is constant (14d) across all tiers', () => {
      expect(SLA_MINUTES.verified.utility).toBe(14 * 24 * 60);
      expect(SLA_MINUTES.verified.midscale).toBe(14 * 24 * 60);
      expect(SLA_MINUTES.verified.ci).toBe(14 * 24 * 60);
      expect(SLA_MINUTES.verified.microgrid).toBe(14 * 24 * 60);
    });

    it('terminals and monitoring carry 0-minute SLA', () => {
      expect(SLA_MINUTES.closed.utility).toBe(0);
      expect(SLA_MINUTES.monitoring.utility).toBe(0);
      expect(SLA_MINUTES.false_alarm.utility).toBe(0);
    });
  });

  describe('slaDeadlineFor', () => {
    it('returns enteredAt + matrix minutes for active states', () => {
      const t0 = new Date('2026-05-27T00:00:00Z');
      const d = slaDeadlineFor('warning', 'utility', t0);
      expect(d).not.toBeNull();
      expect(d!.getTime() - t0.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('returns null for terminals (zero-minute SLA)', () => {
      const t0 = new Date('2026-05-27T00:00:00Z');
      expect(slaDeadlineFor('closed', 'utility', t0)).toBeNull();
      expect(slaDeadlineFor('monitoring', 'utility', t0)).toBeNull();
    });
  });

  describe('regulator crossings', () => {
    it('escalate from utility crosses', () => {
      expect(crossesIntoRegulator('escalate', 'utility')).toBe(true);
    });
    it('escalate from non-utility does not cross', () => {
      expect(crossesIntoRegulator('escalate', 'midscale')).toBe(false);
      expect(crossesIntoRegulator('escalate', 'ci')).toBe(false);
      expect(crossesIntoRegulator('escalate', 'microgrid')).toBe(false);
    });
    it('non-escalate actions do not cross even at utility', () => {
      expect(crossesIntoRegulator('verify_recovery', 'utility')).toBe(false);
      expect(crossesIntoRegulator('close', 'utility')).toBe(false);
      expect(crossesIntoRegulator('mark_false_alarm', 'utility')).toBe(false);
    });
    it('SLA breach crosses for utility tier only', () => {
      expect(slaBreachCrossesIntoRegulator('utility')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('midscale')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('ci')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('microgrid')).toBe(false);
    });
  });

  describe('allowedActions', () => {
    it('monitoring allows only start_warning', () => {
      expect(allowedActions('monitoring')).toEqual(['start_warning']);
    });
    it('warning allows begin_investigation + mark_false_alarm', () => {
      const a = allowedActions('warning');
      expect(a).toContain('begin_investigation');
      expect(a).toContain('mark_false_alarm');
    });
    it('investigating allows complete_rca + escalate + mark_false_alarm', () => {
      const a = allowedActions('investigating');
      expect(a).toContain('complete_rca');
      expect(a).toContain('escalate');
      expect(a).toContain('mark_false_alarm');
    });
    it('intervention_executing allows verify_recovery + escalate', () => {
      const a = allowedActions('intervention_executing');
      expect(a).toContain('verify_recovery');
      expect(a).toContain('escalate');
    });
    it('closed allows nothing', () => {
      expect(allowedActions('closed')).toEqual([]);
    });
  });
});
