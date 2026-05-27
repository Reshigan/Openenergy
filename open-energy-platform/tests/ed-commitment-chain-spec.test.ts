import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  nextStatus,
  allowedActions,
  isHighScoring,
  slaDeadlineFor,
  SLA_MINUTES,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  type EdStatus,
} from '../src/utils/ed-commitment-chain-spec';

describe('ED commitment chain spec', () => {
  describe('happy path', () => {
    it('walks baseline_locked → monitoring → variance_flagged → cure_plan_required → cure_plan_submitted → cure_executing → verified_compliant → closed', () => {
      expect(nextStatus('baseline_locked',      'activate_monitoring')).toBe('monitoring');
      expect(nextStatus('monitoring',           'detect_variance')).toBe('variance_flagged');
      expect(nextStatus('variance_flagged',     'require_cure_plan')).toBe('cure_plan_required');
      expect(nextStatus('cure_plan_required',   'submit_cure_plan')).toBe('cure_plan_submitted');
      expect(nextStatus('cure_plan_submitted',  'approve_cure_plan')).toBe('cure_executing');
      expect(nextStatus('cure_executing',       'verify_compliance')).toBe('verified_compliant');
      expect(nextStatus('verified_compliant',   'close_compliant')).toBe('closed');
    });
  });

  describe('penalty branch', () => {
    it('cure_executing → penalty_issued → closed', () => {
      expect(nextStatus('cure_executing',  'issue_penalty')).toBe('penalty_issued');
      expect(nextStatus('penalty_issued',  'close_with_penalty')).toBe('closed');
    });

    it('issue_penalty NOT reachable from any state other than cure_executing', () => {
      expect(nextStatus('monitoring',          'issue_penalty')).toBeNull();
      expect(nextStatus('variance_flagged',    'issue_penalty')).toBeNull();
      expect(nextStatus('verified_compliant',  'issue_penalty')).toBeNull();
    });
  });

  describe('escalate branch', () => {
    it('escalate reachable from cure_executing and penalty_issued', () => {
      expect(nextStatus('cure_executing',  'escalate')).toBe('escalated');
      expect(nextStatus('penalty_issued',  'escalate')).toBe('escalated');
    });

    it('escalate NOT reachable from monitoring/variance/cure_plan_required/verified', () => {
      expect(nextStatus('monitoring',         'escalate')).toBeNull();
      expect(nextStatus('variance_flagged',   'escalate')).toBeNull();
      expect(nextStatus('cure_plan_required', 'escalate')).toBeNull();
      expect(nextStatus('verified_compliant', 'escalate')).toBeNull();
    });

    it('escalated closes via close_escalated', () => {
      expect(nextStatus('escalated', 'close_escalated')).toBe('closed');
      expect(nextStatus('escalated', 'close_compliant')).toBeNull();
    });
  });

  describe('false_alarm branch', () => {
    it('mark_false_alarm reachable only from variance_flagged', () => {
      expect(nextStatus('variance_flagged', 'mark_false_alarm')).toBe('false_alarm');
      expect(nextStatus('cure_executing',   'mark_false_alarm')).toBeNull();
      expect(nextStatus('penalty_issued',   'mark_false_alarm')).toBeNull();
    });

    it('false_alarm closes via close_false_alarm', () => {
      expect(nextStatus('false_alarm', 'close_false_alarm')).toBe('closed');
      expect(nextStatus('false_alarm', 'close_compliant')).toBeNull();
    });
  });

  describe('terminals', () => {
    it('only closed is terminal', () => {
      expect(isTerminal('closed')).toBe(true);
      expect(isTerminal('verified_compliant')).toBe(false);
      expect(isTerminal('escalated')).toBe(false);
      expect(isTerminal('false_alarm')).toBe(false);
      expect(isTerminal('penalty_issued')).toBe(false);
      expect(isTerminal('monitoring')).toBe(false);
    });

    it('closed is sticky', () => {
      expect(nextStatus('closed', 'activate_monitoring')).toBeNull();
      expect(nextStatus('closed', 'detect_variance')).toBeNull();
    });
  });

  describe('tier classification (REIPPPP scoring weight)', () => {
    it('ownership and local_content are high-scoring (REIPPPP)', () => {
      expect(isHighScoring('ownership')).toBe(true);
      expect(isHighScoring('local_content')).toBe(true);
    });

    it('jobs / skills / enterprise / SED / community_trust are NOT high-scoring', () => {
      expect(isHighScoring('jobs')).toBe(false);
      expect(isHighScoring('skills')).toBe(false);
      expect(isHighScoring('enterprise_dev')).toBe(false);
      expect(isHighScoring('socio_economic')).toBe(false);
      expect(isHighScoring('community_trust')).toBe(false);
    });
  });

  describe('SLA matrix (high-scoring tightest cure)', () => {
    it('ownership variance_flagged cure window is tightest (14d)', () => {
      const stages: EdStatus[] = ['variance_flagged'];
      for (const s of stages) {
        expect(SLA_MINUTES[s].ownership).toBeLessThanOrEqual(SLA_MINUTES[s].jobs);
        expect(SLA_MINUTES[s].jobs).toBeLessThanOrEqual(SLA_MINUTES[s].socio_economic);
      }
    });

    it('IPPO cure plan window is 30 days for high-scoring + jobs/skills', () => {
      expect(SLA_MINUTES.cure_plan_required.ownership).toBe(30 * 24 * 60);
      expect(SLA_MINUTES.cure_plan_required.local_content).toBe(30 * 24 * 60);
      expect(SLA_MINUTES.cure_plan_required.jobs).toBe(30 * 24 * 60);
      expect(SLA_MINUTES.cure_plan_required.skills).toBe(30 * 24 * 60);
    });

    it('cure_executing for local_content gets 180d (supply-chain lead times)', () => {
      expect(SLA_MINUTES.cure_executing.local_content).toBe(180 * 24 * 60);
    });

    it('socio_economic / community_trust get 270d cure_executing (quarterly cadence)', () => {
      expect(SLA_MINUTES.cure_executing.socio_economic).toBe(270 * 24 * 60);
      expect(SLA_MINUTES.cure_executing.community_trust).toBe(270 * 24 * 60);
    });

    it('slaDeadlineFor returns null for terminals / no-SLA combos', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      expect(slaDeadlineFor('closed',      'ownership', t0)).toBeNull();
      expect(slaDeadlineFor('false_alarm', 'ownership', t0)).toBeNull();
    });

    it('slaDeadlineFor on variance_flagged+ownership adds 14 days', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('variance_flagged', 'ownership', t0)!;
      expect(d.toISOString()).toBe('2026-06-11T00:00:00.000Z');
    });

    it('slaDeadlineFor on cure_plan_required+ownership adds 30 days (IPPO window)', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('cure_plan_required', 'ownership', t0)!;
      expect(d.toISOString()).toBe('2026-06-27T00:00:00.000Z');
    });
  });

  describe('regulator crossings', () => {
    it('any escalate crosses regardless of tier (DTI enforcement referral)', () => {
      expect(crossesIntoRegulator('escalate', 'ownership')).toBe(true);
      expect(crossesIntoRegulator('escalate', 'jobs')).toBe(true);
      expect(crossesIntoRegulator('escalate', 'community_trust')).toBe(true);
    });

    it('require_cure_plan crosses for high-scoring only', () => {
      expect(crossesIntoRegulator('require_cure_plan', 'ownership')).toBe(true);
      expect(crossesIntoRegulator('require_cure_plan', 'local_content')).toBe(true);
      expect(crossesIntoRegulator('require_cure_plan', 'jobs')).toBe(false);
      expect(crossesIntoRegulator('require_cure_plan', 'socio_economic')).toBe(false);
    });

    it('issue_penalty crosses for high-scoring AND mid-tier (jobs/skills)', () => {
      expect(crossesIntoRegulator('issue_penalty', 'ownership')).toBe(true);
      expect(crossesIntoRegulator('issue_penalty', 'jobs')).toBe(true);
      expect(crossesIntoRegulator('issue_penalty', 'skills')).toBe(true);
      expect(crossesIntoRegulator('issue_penalty', 'community_trust')).toBe(false);
    });

    it('close_with_penalty / close_escalated cross for high-scoring only', () => {
      expect(crossesIntoRegulator('close_with_penalty', 'ownership')).toBe(true);
      expect(crossesIntoRegulator('close_escalated',    'local_content')).toBe(true);
      expect(crossesIntoRegulator('close_with_penalty', 'jobs')).toBe(false);
    });

    it('routine transitions never cross', () => {
      expect(crossesIntoRegulator('activate_monitoring', 'ownership')).toBe(false);
      expect(crossesIntoRegulator('detect_variance',     'ownership')).toBe(false);
      expect(crossesIntoRegulator('submit_cure_plan',    'ownership')).toBe(false);
      expect(crossesIntoRegulator('approve_cure_plan',   'ownership')).toBe(false);
      expect(crossesIntoRegulator('verify_compliance',   'ownership')).toBe(false);
      expect(crossesIntoRegulator('close_compliant',     'ownership')).toBe(false);
      expect(crossesIntoRegulator('mark_false_alarm',    'ownership')).toBe(false);
      expect(crossesIntoRegulator('close_false_alarm',   'ownership')).toBe(false);
    });

    it('SLA breach crosses for high-scoring and mid-tier only', () => {
      expect(slaBreachCrossesIntoRegulator('ownership')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('local_content')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('jobs')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('skills')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('enterprise_dev')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('socio_economic')).toBe(false);
      expect(slaBreachCrossesIntoRegulator('community_trust')).toBe(false);
    });
  });

  describe('allowedActions sanity', () => {
    it('baseline_locked offers only activate_monitoring', () => {
      expect(allowedActions('baseline_locked')).toEqual(['activate_monitoring']);
    });

    it('monitoring offers only detect_variance', () => {
      expect(allowedActions('monitoring')).toEqual(['detect_variance']);
    });

    it('variance_flagged offers require_cure_plan and mark_false_alarm', () => {
      const a = allowedActions('variance_flagged');
      expect(a).toContain('require_cure_plan');
      expect(a).toContain('mark_false_alarm');
      expect(a).not.toContain('escalate');
    });

    it('cure_executing offers verify_compliance, issue_penalty, escalate', () => {
      const a = allowedActions('cure_executing');
      expect(a).toContain('verify_compliance');
      expect(a).toContain('issue_penalty');
      expect(a).toContain('escalate');
    });

    it('verified_compliant offers only close_compliant', () => {
      expect(allowedActions('verified_compliant')).toEqual(['close_compliant']);
    });

    it('penalty_issued offers close_with_penalty and escalate', () => {
      const a = allowedActions('penalty_issued');
      expect(a).toContain('close_with_penalty');
      expect(a).toContain('escalate');
    });

    it('closed offers nothing', () => {
      expect(allowedActions('closed')).toEqual([]);
    });
  });
});
