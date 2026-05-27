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
  type GcaStatus,
} from '../src/utils/gca-chain-spec';

describe('GCA (Grid Connection Agreement) chain spec', () => {
  describe('happy path — application → in_service', () => {
    it('walks all 9 forward transitions', () => {
      expect(nextStatus('application_filed',            'request_studies')).toBe('studies_required');
      expect(nextStatus('studies_required',             'begin_studies')).toBe('studies_executing');
      expect(nextStatus('studies_executing',            'issue_cost_estimate')).toBe('cost_estimate_issued');
      expect(nextStatus('cost_estimate_issued',         'accept_cost')).toBe('cost_accepted');
      expect(nextStatus('cost_accepted',                'draft_agreement')).toBe('connection_agreement_drafted');
      expect(nextStatus('connection_agreement_drafted', 'execute_agreement')).toBe('executed');
      expect(nextStatus('executed',                     'begin_construction')).toBe('construction');
      expect(nextStatus('construction',                 'energise')).toBe('energised');
      expect(nextStatus('energised',                    'commission')).toBe('in_service');
    });
  });

  describe('reject branch', () => {
    it('reject reachable from application_filed → cost_estimate_issued', () => {
      expect(nextStatus('application_filed',    'reject')).toBe('rejected');
      expect(nextStatus('studies_required',     'reject')).toBe('rejected');
      expect(nextStatus('studies_executing',    'reject')).toBe('rejected');
      expect(nextStatus('cost_estimate_issued', 'reject')).toBe('rejected');
    });

    it('reject NOT reachable from cost_accepted onward', () => {
      expect(nextStatus('cost_accepted',                'reject')).toBeNull();
      expect(nextStatus('connection_agreement_drafted', 'reject')).toBeNull();
      expect(nextStatus('executed',                     'reject')).toBeNull();
      expect(nextStatus('construction',                 'reject')).toBeNull();
      expect(nextStatus('energised',                    'reject')).toBeNull();
    });
  });

  describe('withdraw branch', () => {
    it('withdraw reachable up to connection_agreement_drafted', () => {
      expect(nextStatus('application_filed',            'withdraw')).toBe('withdrawn');
      expect(nextStatus('cost_accepted',                'withdraw')).toBe('withdrawn');
      expect(nextStatus('connection_agreement_drafted', 'withdraw')).toBe('withdrawn');
    });

    it('withdraw NOT reachable from executed onward', () => {
      expect(nextStatus('executed',     'withdraw')).toBeNull();
      expect(nextStatus('construction', 'withdraw')).toBeNull();
      expect(nextStatus('energised',    'withdraw')).toBeNull();
    });
  });

  describe('terminals', () => {
    it('in_service, rejected, withdrawn are terminal', () => {
      expect(isTerminal('in_service')).toBe(true);
      expect(isTerminal('rejected')).toBe(true);
      expect(isTerminal('withdrawn')).toBe(true);
      expect(isTerminal('energised')).toBe(false);
      expect(isTerminal('construction')).toBe(false);
    });

    it('terminals are sticky', () => {
      expect(nextStatus('in_service', 'commission')).toBeNull();
      expect(nextStatus('rejected',   'withdraw')).toBeNull();
      expect(nextStatus('withdrawn',  'request_studies')).toBeNull();
    });
  });

  describe('tier classification', () => {
    it('transmission is reportable; distribution + embedded not', () => {
      expect(isReportable('transmission')).toBe(true);
      expect(isReportable('distribution')).toBe(false);
      expect(isReportable('embedded')).toBe(false);
    });
  });

  describe('SLA matrix (INVERTED — larger gets more time)', () => {
    it('studies_executing transmission > distribution > embedded', () => {
      expect(SLA_MINUTES.studies_executing.transmission).toBeGreaterThan(SLA_MINUTES.studies_executing.distribution);
      expect(SLA_MINUTES.studies_executing.distribution).toBeGreaterThan(SLA_MINUTES.studies_executing.embedded);
    });

    it('construction transmission 730d / distribution 365d / embedded 90d', () => {
      expect(SLA_MINUTES.construction.transmission).toBe(730 * 24 * 60);
      expect(SLA_MINUTES.construction.distribution).toBe(365 * 24 * 60);
      expect(SLA_MINUTES.construction.embedded).toBe(90 * 24 * 60);
    });

    it('studies_executing transmission is 180d, distribution 90d, embedded 45d', () => {
      expect(SLA_MINUTES.studies_executing.transmission).toBe(180 * 24 * 60);
      expect(SLA_MINUTES.studies_executing.distribution).toBe(90 * 24 * 60);
      expect(SLA_MINUTES.studies_executing.embedded).toBe(45 * 24 * 60);
    });

    it('slaDeadlineFor returns null for terminals', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      expect(slaDeadlineFor('in_service', 'transmission', t0)).toBeNull();
      expect(slaDeadlineFor('rejected',   'transmission', t0)).toBeNull();
      expect(slaDeadlineFor('withdrawn',  'transmission', t0)).toBeNull();
    });

    it('slaDeadlineFor on construction+transmission adds 730 days', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('construction', 'transmission', t0)!;
      expect(d.toISOString()).toBe('2028-05-27T00:00:00.000Z');
    });
  });

  describe('regulator crossings', () => {
    it('execute_agreement crosses for transmission only', () => {
      expect(crossesIntoRegulator('execute_agreement', 'transmission')).toBe(true);
      expect(crossesIntoRegulator('execute_agreement', 'distribution')).toBe(false);
      expect(crossesIntoRegulator('execute_agreement', 'embedded')).toBe(false);
    });

    it('energise crosses for transmission only', () => {
      expect(crossesIntoRegulator('energise', 'transmission')).toBe(true);
      expect(crossesIntoRegulator('energise', 'distribution')).toBe(false);
    });

    it('commission crosses for transmission only', () => {
      expect(crossesIntoRegulator('commission', 'transmission')).toBe(true);
      expect(crossesIntoRegulator('commission', 'embedded')).toBe(false);
    });

    it('reject crosses for transmission AND distribution', () => {
      expect(crossesIntoRegulator('reject', 'transmission')).toBe(true);
      expect(crossesIntoRegulator('reject', 'distribution')).toBe(true);
      expect(crossesIntoRegulator('reject', 'embedded')).toBe(false);
    });

    it('routine middle transitions never cross', () => {
      expect(crossesIntoRegulator('request_studies',     'transmission')).toBe(false);
      expect(crossesIntoRegulator('begin_studies',       'transmission')).toBe(false);
      expect(crossesIntoRegulator('issue_cost_estimate', 'transmission')).toBe(false);
      expect(crossesIntoRegulator('accept_cost',         'transmission')).toBe(false);
      expect(crossesIntoRegulator('draft_agreement',     'transmission')).toBe(false);
      expect(crossesIntoRegulator('begin_construction',  'transmission')).toBe(false);
    });

    it('withdraw never crosses', () => {
      expect(crossesIntoRegulator('withdraw', 'transmission')).toBe(false);
      expect(crossesIntoRegulator('withdraw', 'distribution')).toBe(false);
      expect(crossesIntoRegulator('withdraw', 'embedded')).toBe(false);
    });

    it('SLA breach crosses for transmission + distribution only', () => {
      expect(slaBreachCrossesIntoRegulator('transmission')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('distribution')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('embedded')).toBe(false);
    });
  });

  describe('allowedActions sanity', () => {
    it('application_filed offers request_studies, reject, withdraw', () => {
      const a = allowedActions('application_filed');
      expect(a).toContain('request_studies');
      expect(a).toContain('reject');
      expect(a).toContain('withdraw');
    });

    it('connection_agreement_drafted offers execute_agreement and withdraw (no reject)', () => {
      const a = allowedActions('connection_agreement_drafted');
      expect(a).toContain('execute_agreement');
      expect(a).toContain('withdraw');
      expect(a).not.toContain('reject');
    });

    it('executed offers only begin_construction (no withdraw post-execution)', () => {
      const a = allowedActions('executed');
      expect(a).toContain('begin_construction');
      expect(a).not.toContain('withdraw');
      expect(a).not.toContain('reject');
    });

    it('construction offers only energise', () => {
      expect(allowedActions('construction')).toEqual(['energise']);
    });

    it('energised offers only commission', () => {
      expect(allowedActions('energised')).toEqual(['commission']);
    });

    it('terminals offer nothing', () => {
      expect(allowedActions('in_service')).toEqual([]);
      expect(allowedActions('rejected')).toEqual([]);
      expect(allowedActions('withdrawn')).toEqual([]);
    });
  });
});
