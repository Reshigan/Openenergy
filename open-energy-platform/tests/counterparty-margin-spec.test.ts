import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForExposureZar, systemicFloor, tierForExposure,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isHighTier, isReportable, partyForAction,
  type MarginStatus, type MarginTier, type MarginAction,
} from '../src/utils/counterparty-margin-spec';

describe('W68 counterparty margin & default-management chain — state machine', () => {
  it('happy cure path: active→warning→call→collateral→cured(active)', () => {
    let s: MarginStatus = 'limit_active';
    s = nextStatus(s, 'issue_warning')!;     expect(s).toBe('exposure_warning');
    s = nextStatus(s, 'issue_margin_call')!; expect(s).toBe('margin_call_issued');
    s = nextStatus(s, 'record_collateral')!; expect(s).toBe('collateral_received');
    s = nextStatus(s, 'cure_breach')!;       expect(s).toBe('limit_active');
  });

  it('default waterfall: restriction→cure_period→default→close_out→fund_draw→written_off', () => {
    let s: MarginStatus = 'margin_call_issued';
    s = nextStatus(s, 'restrict_positions')!; expect(s).toBe('position_restriction');
    s = nextStatus(s, 'open_cure_period')!;   expect(s).toBe('cure_period');
    s = nextStatus(s, 'declare_default')!;    expect(s).toBe('default_declared');
    s = nextStatus(s, 'begin_close_out')!;    expect(s).toBe('close_out');
    s = nextStatus(s, 'draw_default_fund')!;  expect(s).toBe('default_fund_draw');
    s = nextStatus(s, 'write_off')!;          expect(s).toBe('written_off');
    expect(isTerminal('written_off')).toBe(true);
  });

  it('close_out can recover directly without drawing the default fund', () => {
    expect(nextStatus('close_out', 'record_recovery')).toBe('recovered');
    expect(nextStatus('close_out', 'write_off')).toBe('written_off');
    expect(nextStatus('default_fund_draw', 'record_recovery')).toBe('recovered');
    expect(isTerminal('recovered')).toBe(true);
  });

  it('default can be declared from cure_period or straight from position_restriction', () => {
    expect(nextStatus('cure_period', 'declare_default')).toBe('default_declared');
    expect(nextStatus('position_restriction', 'declare_default')).toBe('default_declared');
    expect(nextStatus('exposure_warning', 'declare_default')).toBeNull();
  });

  it('member can post collateral while in cure_period (last-minute cure)', () => {
    expect(nextStatus('cure_period', 'record_collateral')).toBe('collateral_received');
    expect(nextStatus('collateral_received', 'cure_breach')).toBe('limit_active');
  });

  it('restriction reachable from warning or margin call; margin call re-issuable from restriction', () => {
    expect(nextStatus('exposure_warning', 'restrict_positions')).toBe('position_restriction');
    expect(nextStatus('margin_call_issued', 'restrict_positions')).toBe('position_restriction');
    expect(nextStatus('position_restriction', 'issue_margin_call')).toBe('margin_call_issued');
  });

  it('withdraw reachable only from the two early breach states', () => {
    expect(nextStatus('exposure_warning', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('margin_call_issued', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('cure_period', 'withdraw')).toBeNull();
    expect(nextStatus('default_declared', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the early-breach set', () => {
    expect(isWithdrawable('exposure_warning')).toBe(true);
    expect(isWithdrawable('margin_call_issued')).toBe(true);
    expect(isWithdrawable('position_restriction')).toBe(false);
    expect(isWithdrawable('limit_active')).toBe(false);
    expect(isWithdrawable('recovered')).toBe(false);
  });

  it('all three terminals accept no further transitions', () => {
    expect(allowedActions('recovered')).toEqual([]);
    expect(allowedActions('written_off')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('close_out fans out to fund-draw / recovery / write-off', () => {
    const acts = allowedActions('close_out');
    expect(acts).toContain('draw_default_fund');
    expect(acts).toContain('record_recovery');
    expect(acts).toContain('write_off');
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('limit_active', 'issue_margin_call')).toBeNull();
    expect(nextStatus('exposure_warning', 'record_collateral')).toBeNull();
    expect(nextStatus('default_declared', 'draw_default_fund')).toBeNull();
    expect(nextStatus('margin_call_issued', 'declare_default')).toBeNull();
    expect(nextStatus('recovered', 'record_recovery')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: MarginAction[] = [
      'issue_warning', 'issue_margin_call', 'record_collateral', 'cure_breach',
      'restrict_positions', 'open_cure_period', 'declare_default', 'begin_close_out',
      'draw_default_fund', 'record_recovery', 'write_off', 'withdraw',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W68 counterparty margin chain — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('systemic is the TIGHTEST window at every graded stage; minor the longest', () => {
    const graded: MarginStatus[] = [
      'limit_active', 'exposure_warning', 'margin_call_issued', 'collateral_received',
      'position_restriction', 'cure_period', 'default_declared', 'close_out', 'default_fund_draw',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].systemic).toBeLessThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeLessThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeLessThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('cure_period is the tightest grace: minor 48h, systemic 1h', () => {
    expect(SLA_MINUTES.cure_period.minor).toBe(48 * HOUR);
    expect(SLA_MINUTES.cure_period.systemic).toBe(1 * HOUR);
  });

  it('margin_call_issued: minor 3d, systemic 2h', () => {
    expect(SLA_MINUTES.margin_call_issued.minor).toBe(3 * DAY);
    expect(SLA_MINUTES.margin_call_issued.systemic).toBe(2 * HOUR);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('margin_call_issued', 'minor', base);
    expect(d!.getTime() - base.getTime()).toBe(3 * DAY * 60_000);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('exposure_warning', 'minor')).toBe(7 * DAY);
    expect(slaWindowMinutes('recovered', 'systemic')).toBe(0);
  });

  it('all three terminals return null deadline', () => {
    expect(slaDeadlineFor('recovered', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('written_off', 'systemic', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'systemic', base)).toBeNull();
  });
});

describe('W68 counterparty margin chain — exposure tiering', () => {
  it('tierForExposureZar boundaries', () => {
    expect(tierForExposureZar(1000000)).toBe('minor');
    expect(tierForExposureZar(4999999)).toBe('minor');
    expect(tierForExposureZar(5000000)).toBe('moderate');
    expect(tierForExposureZar(49999999)).toBe('moderate');
    expect(tierForExposureZar(50000000)).toBe('material');
    expect(tierForExposureZar(249999999)).toBe('material');
    expect(tierForExposureZar(250000000)).toBe('major');
    expect(tierForExposureZar(999999999)).toBe('major');
    expect(tierForExposureZar(1000000000)).toBe('systemic');
    expect(tierForExposureZar(5000000000)).toBe('systemic');
  });

  it('systemicFloor lifts a SIFI to at least major', () => {
    expect(systemicFloor(true)).toBe('major');
    expect(systemicFloor(false)).toBe('minor');
  });

  it('tierForExposure takes the higher of exposure-tier and SIFI floor', () => {
    // small exposure, systemically-important counterparty → floored to major
    expect(tierForExposure(1000000, true)).toBe('major');
    // small exposure, ordinary counterparty → stays minor
    expect(tierForExposure(1000000, false)).toBe('minor');
    // huge exposure beats the floor → systemic
    expect(tierForExposure(2000000000, true)).toBe('systemic');
    // mid exposure, ordinary → material
    expect(tierForExposure(60000000, false)).toBe('material');
  });

  it('isHighTier — major + systemic only', () => {
    expect(isHighTier('systemic')).toBe(true);
    expect(isHighTier('major')).toBe(true);
    expect(isHighTier('material')).toBe(false);
    expect(isHighTier('moderate')).toBe(false);
    expect(isHighTier('minor')).toBe(false);
  });

  it('isReportable — major + systemic only', () => {
    expect(isReportable('systemic')).toBe(true);
    expect(isReportable('major')).toBe(true);
    expect(isReportable('material')).toBe(false);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W68 counterparty margin chain — reportability (the signature)', () => {
  const tiers: MarginTier[] = ['minor', 'moderate', 'material', 'major', 'systemic'];

  it('declare_default crosses for EVERY tier (the signature — a default is always notifiable)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('declare_default', t)).toBe(true);
    }
  });

  it('draw_default_fund crosses for the high tiers only (major + systemic)', () => {
    expect(crossesIntoRegulator('draw_default_fund', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('draw_default_fund', 'major')).toBe(true);
    expect(crossesIntoRegulator('draw_default_fund', 'material')).toBe(false);
    expect(crossesIntoRegulator('draw_default_fund', 'moderate')).toBe(false);
    expect(crossesIntoRegulator('draw_default_fund', 'minor')).toBe(false);
  });

  it('write_off crosses for the high tiers only (major + systemic)', () => {
    expect(crossesIntoRegulator('write_off', 'systemic')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'major')).toBe(true);
    expect(crossesIntoRegulator('write_off', 'material')).toBe(false);
    expect(crossesIntoRegulator('write_off', 'minor')).toBe(false);
  });

  it('routine workflow actions never cross for any tier', () => {
    const routine: MarginAction[] = [
      'issue_warning', 'issue_margin_call', 'record_collateral', 'cure_breach',
      'restrict_positions', 'open_cure_period', 'begin_close_out', 'record_recovery', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the high tiers only (major + systemic)', () => {
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W68 counterparty margin chain — party attribution', () => {
  it('the clearing house drives every step except the member posting collateral', () => {
    expect(partyForAction('issue_warning')).toBe('clearing_house');
    expect(partyForAction('issue_margin_call')).toBe('clearing_house');
    expect(partyForAction('cure_breach')).toBe('clearing_house');
    expect(partyForAction('restrict_positions')).toBe('clearing_house');
    expect(partyForAction('open_cure_period')).toBe('clearing_house');
    expect(partyForAction('declare_default')).toBe('clearing_house');
    expect(partyForAction('begin_close_out')).toBe('clearing_house');
    expect(partyForAction('draw_default_fund')).toBe('clearing_house');
    expect(partyForAction('record_recovery')).toBe('clearing_house');
    expect(partyForAction('write_off')).toBe('clearing_house');
    expect(partyForAction('withdraw')).toBe('clearing_house');
  });

  it('record_collateral is attributed to the member', () => {
    expect(partyForAction('record_collateral')).toBe('member');
  });
});
