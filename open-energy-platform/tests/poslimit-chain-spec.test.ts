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
} from '../src/utils/poslimit-chain-spec';

describe('Position Limit Compliance chain spec (Wave 29)', () => {
  describe('happy path — within_limit → cured', () => {
    it('walks full warning → margin call → reduction → cured', () => {
      expect(nextStatus('within_limit',         'raise_warning')).toBe('warning');
      expect(nextStatus('warning',              'escalate_intraday')).toBe('soft_breach');
      expect(nextStatus('soft_breach',          'escalate_overnight')).toBe('hard_breach');
      expect(nextStatus('hard_breach',          'issue_margin_call')).toBe('margin_call_issued');
      expect(nextStatus('margin_call_issued',   'require_reduction')).toBe('reduction_required');
      expect(nextStatus('reduction_required',   'begin_reduction')).toBe('reduction_executing');
      expect(nextStatus('reduction_executing',  'accept_cure')).toBe('cured');
    });
  });

  describe('cure shortcuts', () => {
    it('accept_cure reachable from warning + every breach state', () => {
      expect(nextStatus('warning',             'accept_cure')).toBe('cured');
      expect(nextStatus('soft_breach',         'accept_cure')).toBe('cured');
      expect(nextStatus('hard_breach',         'accept_cure')).toBe('cured');
      expect(nextStatus('margin_call_issued',  'accept_cure')).toBe('cured');
      expect(nextStatus('reduction_required',  'accept_cure')).toBe('cured');
      expect(nextStatus('reduction_executing', 'accept_cure')).toBe('cured');
    });

    it('accept_cure NOT reachable from within_limit', () => {
      expect(nextStatus('within_limit', 'accept_cure')).toBeNull();
    });
  });

  describe('forced liquidation branch', () => {
    it('force_liquidate reachable from margin_call onward', () => {
      expect(nextStatus('margin_call_issued',  'force_liquidate')).toBe('escalated');
      expect(nextStatus('reduction_required',  'force_liquidate')).toBe('escalated');
      expect(nextStatus('reduction_executing', 'force_liquidate')).toBe('escalated');
    });

    it('force_liquidate NOT reachable before margin call', () => {
      expect(nextStatus('within_limit', 'force_liquidate')).toBeNull();
      expect(nextStatus('warning',      'force_liquidate')).toBeNull();
      expect(nextStatus('soft_breach',  'force_liquidate')).toBeNull();
      expect(nextStatus('hard_breach',  'force_liquidate')).toBeNull();
    });
  });

  describe('false alarm branch', () => {
    it('mark_false_alarm reachable from warning + soft_breach only', () => {
      expect(nextStatus('warning',     'mark_false_alarm')).toBe('false_alarm');
      expect(nextStatus('soft_breach', 'mark_false_alarm')).toBe('false_alarm');
    });

    it('mark_false_alarm NOT reachable once hard_breach is recorded', () => {
      expect(nextStatus('hard_breach',         'mark_false_alarm')).toBeNull();
      expect(nextStatus('margin_call_issued',  'mark_false_alarm')).toBeNull();
      expect(nextStatus('reduction_executing', 'mark_false_alarm')).toBeNull();
    });
  });

  describe('terminals', () => {
    it('cured, escalated, false_alarm are terminal', () => {
      expect(isTerminal('cured')).toBe(true);
      expect(isTerminal('escalated')).toBe(true);
      expect(isTerminal('false_alarm')).toBe(true);
      expect(isTerminal('within_limit')).toBe(false);
      expect(isTerminal('hard_breach')).toBe(false);
    });

    it('terminals are sticky', () => {
      expect(nextStatus('cured',       'raise_warning')).toBeNull();
      expect(nextStatus('escalated',   'accept_cure')).toBeNull();
      expect(nextStatus('false_alarm', 'escalate_intraday')).toBeNull();
    });
  });

  describe('tier classification', () => {
    it('prop + market_maker are FSCA-breach-reportable; retail not', () => {
      expect(isReportable('prop')).toBe(true);
      expect(isReportable('market_maker')).toBe(true);
      expect(isReportable('retail')).toBe(false);
    });
  });

  describe('SLA matrix (MIXED — FSCA hard windows + INVERTED cure)', () => {
    it('soft_breach is 24h across all tiers (FSCA T+1 hard rule)', () => {
      expect(SLA_MINUTES.soft_breach.prop).toBe(24 * 60);
      expect(SLA_MINUTES.soft_breach.market_maker).toBe(24 * 60);
      expect(SLA_MINUTES.soft_breach.retail).toBe(24 * 60);
    });

    it('hard_breach is 4h across all tiers (immediate margin-call window)', () => {
      expect(SLA_MINUTES.hard_breach.prop).toBe(4 * 60);
      expect(SLA_MINUTES.hard_breach.market_maker).toBe(4 * 60);
      expect(SLA_MINUTES.hard_breach.retail).toBe(4 * 60);
    });

    it('margin_call_issued cure window INVERTED — prop 72h > mm 48h > retail 24h', () => {
      expect(SLA_MINUTES.margin_call_issued.prop).toBe(72 * 60);
      expect(SLA_MINUTES.margin_call_issued.market_maker).toBe(48 * 60);
      expect(SLA_MINUTES.margin_call_issued.retail).toBe(24 * 60);
      expect(SLA_MINUTES.margin_call_issued.prop)
        .toBeGreaterThan(SLA_MINUTES.margin_call_issued.market_maker);
      expect(SLA_MINUTES.margin_call_issued.market_maker)
        .toBeGreaterThan(SLA_MINUTES.margin_call_issued.retail);
    });

    it('reduction_executing INVERTED — prop 72h > mm 48h > retail 24h', () => {
      expect(SLA_MINUTES.reduction_executing.prop).toBe(72 * 60);
      expect(SLA_MINUTES.reduction_executing.market_maker).toBe(48 * 60);
      expect(SLA_MINUTES.reduction_executing.retail).toBe(24 * 60);
    });

    it('slaDeadlineFor returns null for terminals', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      expect(slaDeadlineFor('cured',       'prop',   t0)).toBeNull();
      expect(slaDeadlineFor('escalated',   'retail', t0)).toBeNull();
      expect(slaDeadlineFor('false_alarm', 'prop',   t0)).toBeNull();
    });

    it('slaDeadlineFor on margin_call_issued+prop adds 72h', () => {
      const t0 = new Date('2026-05-28T00:00:00Z');
      const d  = slaDeadlineFor('margin_call_issued', 'prop', t0)!;
      expect(d.toISOString()).toBe('2026-05-31T00:00:00.000Z');
    });
  });

  describe('regulator crossings', () => {
    it('escalate_overnight crosses for prop + market_maker only', () => {
      expect(crossesIntoRegulator('escalate_overnight', 'prop')).toBe(true);
      expect(crossesIntoRegulator('escalate_overnight', 'market_maker')).toBe(true);
      expect(crossesIntoRegulator('escalate_overnight', 'retail')).toBe(false);
    });

    it('issue_margin_call crosses for prop + market_maker only', () => {
      expect(crossesIntoRegulator('issue_margin_call', 'prop')).toBe(true);
      expect(crossesIntoRegulator('issue_margin_call', 'market_maker')).toBe(true);
      expect(crossesIntoRegulator('issue_margin_call', 'retail')).toBe(false);
    });

    it('force_liquidate crosses for ALL tiers (hard line)', () => {
      expect(crossesIntoRegulator('force_liquidate', 'prop')).toBe(true);
      expect(crossesIntoRegulator('force_liquidate', 'market_maker')).toBe(true);
      expect(crossesIntoRegulator('force_liquidate', 'retail')).toBe(true);
    });

    it('routine progressions never cross', () => {
      expect(crossesIntoRegulator('raise_warning',     'prop')).toBe(false);
      expect(crossesIntoRegulator('escalate_intraday', 'prop')).toBe(false);
      expect(crossesIntoRegulator('require_reduction', 'prop')).toBe(false);
      expect(crossesIntoRegulator('begin_reduction',   'prop')).toBe(false);
      expect(crossesIntoRegulator('accept_cure',       'prop')).toBe(false);
      expect(crossesIntoRegulator('mark_false_alarm',  'prop')).toBe(false);
    });

    it('SLA breach crosses for ALL tiers (forced-liquidation precursor)', () => {
      expect(slaBreachCrossesIntoRegulator('prop')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('market_maker')).toBe(true);
      expect(slaBreachCrossesIntoRegulator('retail')).toBe(true);
    });
  });

  describe('allowedActions sanity', () => {
    it('within_limit offers only raise_warning', () => {
      expect(allowedActions('within_limit')).toEqual(['raise_warning']);
    });

    it('warning offers escalate + cure + false_alarm', () => {
      const a = allowedActions('warning');
      expect(a).toContain('escalate_intraday');
      expect(a).toContain('accept_cure');
      expect(a).toContain('mark_false_alarm');
    });

    it('hard_breach offers issue_margin_call + accept_cure (no false_alarm escape)', () => {
      const a = allowedActions('hard_breach');
      expect(a).toContain('issue_margin_call');
      expect(a).toContain('accept_cure');
      expect(a).not.toContain('mark_false_alarm');
    });

    it('reduction_executing offers cure + force_liquidate', () => {
      const a = allowedActions('reduction_executing');
      expect(a).toContain('accept_cure');
      expect(a).toContain('force_liquidate');
    });

    it('terminals offer nothing', () => {
      expect(allowedActions('cured')).toEqual([]);
      expect(allowedActions('escalated')).toEqual([]);
      expect(allowedActions('false_alarm')).toEqual([]);
    });
  });
});
