import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportable, stageForGwShed,
  type LoadCurtailmentStatus, type LoadShedStage,
} from '../src/utils/load-curtailment-chain-spec';

describe('W34 load curtailment chain — state machine', () => {
  it('happy path: issued→ack→started→target→lifted→reconciled→pm→closed', () => {
    let s: LoadCurtailmentStatus = 'instruction_issued';
    s = nextStatus(s, 'acknowledge')!;             expect(s).toBe('acknowledged');
    s = nextStatus(s, 'start_curtailment')!;       expect(s).toBe('curtailment_started');
    s = nextStatus(s, 'report_target_achieved')!;  expect(s).toBe('target_achieved');
    s = nextStatus(s, 'lift_instruction')!;        expect(s).toBe('instruction_lifted');
    s = nextStatus(s, 'reconcile')!;               expect(s).toBe('reconciled');
    s = nextStatus(s, 'open_post_mortem')!;        expect(s).toBe('post_mortem');
    s = nextStatus(s, 'close_post_mortem')!;       expect(s).toBe('closed');
  });

  it('partial compliance branch: started→partial→lifted→reconciled→closed', () => {
    let s: LoadCurtailmentStatus = 'curtailment_started';
    s = nextStatus(s, 'report_partial')!;          expect(s).toBe('partial_compliance');
    s = nextStatus(s, 'lift_instruction')!;        expect(s).toBe('instruction_lifted');
    s = nextStatus(s, 'reconcile')!;               expect(s).toBe('reconciled');
    s = nextStatus(s, 'close')!;                   expect(s).toBe('closed');
  });

  it('refuse from instruction_issued or acknowledged is a terminal', () => {
    expect(nextStatus('instruction_issued', 'refuse')).toBe('refused');
    expect(nextStatus('acknowledged', 'refuse')).toBe('refused');
    expect(isTerminal('refused')).toBe(true);
    expect(allowedActions('refused')).toEqual([]);
  });

  it('withdraw is accessible from issued, acknowledged, started — but not after target', () => {
    expect(nextStatus('instruction_issued', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('acknowledged', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('curtailment_started', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('target_achieved', 'withdraw')).toBeNull();
    expect(nextStatus('instruction_lifted', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('refused')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('post_mortem skip allowed from reconciled (small events)', () => {
    expect(nextStatus('reconciled', 'close')).toBe('closed');
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('instruction_issued', 'reconcile')).toBeNull();
    expect(nextStatus('curtailment_started', 'close_post_mortem')).toBeNull();
    expect(nextStatus('post_mortem', 'lift_instruction')).toBeNull();
    expect(nextStatus('target_achieved', 'refuse')).toBeNull();
  });

  it('TRANSITIONS dict is exhaustive across every status', () => {
    const statuses: LoadCurtailmentStatus[] = [
      'instruction_issued', 'acknowledged', 'curtailment_started',
      'target_achieved', 'partial_compliance', 'instruction_lifted',
      'reconciled', 'post_mortem', 'closed', 'refused', 'withdrawn',
    ];
    for (const s of statuses) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('allowedActions for issued offers acknowledge / refuse / withdraw', () => {
    const actions = allowedActions('instruction_issued');
    expect(actions).toContain('acknowledge');
    expect(actions).toContain('refuse');
    expect(actions).toContain('withdraw');
  });

  it('allowedActions for reconciled offers open_post_mortem and close (skip)', () => {
    const actions = allowedActions('reconciled');
    expect(actions).toContain('open_post_mortem');
    expect(actions).toContain('close');
  });
});

describe('W34 load curtailment chain — URGENT SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');

  it('instruction_issued has TIGHTER SLA at higher stages', () => {
    const s12 = slaDeadlineFor('instruction_issued', 'stage_1_2', base);
    const s34 = slaDeadlineFor('instruction_issued', 'stage_3_4', base);
    const s56 = slaDeadlineFor('instruction_issued', 'stage_5_6', base);
    const s78 = slaDeadlineFor('instruction_issued', 'stage_7_8', base);
    expect(s12!.getTime()).toBeGreaterThan(s34!.getTime());
    expect(s34!.getTime()).toBeGreaterThan(s56!.getTime());
    expect(s56!.getTime()).toBeGreaterThan(s78!.getTime());
  });

  it('stage_7_8 acknowledge SLA is 5 minutes — system survival window', () => {
    const d = slaDeadlineFor('instruction_issued', 'stage_7_8', base);
    expect(d!.getTime() - base.getTime()).toBe(5 * 60_000);
  });

  it('stage_1_2 acknowledge SLA is 60 minutes — slowest tier', () => {
    const d = slaDeadlineFor('instruction_issued', 'stage_1_2', base);
    expect(d!.getTime() - base.getTime()).toBe(60 * 60_000);
  });

  it('reconcile SLA inverts: stage_7_8 24h vs stage_1_2 7 days', () => {
    const s78 = SLA_MINUTES.instruction_lifted.stage_7_8;
    const s12 = SLA_MINUTES.instruction_lifted.stage_1_2;
    expect(s78).toBe(24 * 60);
    expect(s12).toBe(7 * 24 * 60);
  });

  it('all terminals + zero-minute states return null deadline', () => {
    expect(slaDeadlineFor('closed', 'stage_5_6', base)).toBeNull();
    expect(slaDeadlineFor('refused', 'stage_5_6', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'stage_5_6', base)).toBeNull();
    expect(slaDeadlineFor('target_achieved', 'stage_5_6', base)).toBeNull();
    expect(slaDeadlineFor('partial_compliance', 'stage_5_6', base)).toBeNull();
    expect(slaDeadlineFor('post_mortem', 'stage_5_6', base)).toBeNull();
  });
});

describe('W34 load curtailment chain — regulator crossings', () => {
  it('refuse crosses for ALL stages (§C-3 mandatory disclosure)', () => {
    expect(crossesIntoRegulator('refuse', 'stage_1_2')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'stage_3_4')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'stage_5_6')).toBe(true);
    expect(crossesIntoRegulator('refuse', 'stage_7_8')).toBe(true);
  });

  it('partial_compliance crosses stage_3_4 and above only', () => {
    expect(crossesIntoRegulator('report_partial', 'stage_1_2')).toBe(false);
    expect(crossesIntoRegulator('report_partial', 'stage_3_4')).toBe(true);
    expect(crossesIntoRegulator('report_partial', 'stage_5_6')).toBe(true);
    expect(crossesIntoRegulator('report_partial', 'stage_7_8')).toBe(true);
  });

  it('target_achieved crosses stage_5_6+ only (national reporting threshold)', () => {
    expect(crossesIntoRegulator('report_target_achieved', 'stage_1_2')).toBe(false);
    expect(crossesIntoRegulator('report_target_achieved', 'stage_3_4')).toBe(false);
    expect(crossesIntoRegulator('report_target_achieved', 'stage_5_6')).toBe(true);
    expect(crossesIntoRegulator('report_target_achieved', 'stage_7_8')).toBe(true);
  });

  it('post_mortem close crosses stage_5_6+ only', () => {
    expect(crossesIntoRegulator('close_post_mortem', 'stage_1_2')).toBe(false);
    expect(crossesIntoRegulator('close_post_mortem', 'stage_3_4')).toBe(false);
    expect(crossesIntoRegulator('close_post_mortem', 'stage_5_6')).toBe(true);
    expect(crossesIntoRegulator('close_post_mortem', 'stage_7_8')).toBe(true);
  });

  it('routine actions (acknowledge, lift, reconcile) never cross', () => {
    for (const stage of ['stage_1_2', 'stage_3_4', 'stage_5_6', 'stage_7_8'] as const) {
      expect(crossesIntoRegulator('acknowledge', stage)).toBe(false);
      expect(crossesIntoRegulator('start_curtailment', stage)).toBe(false);
      expect(crossesIntoRegulator('lift_instruction', stage)).toBe(false);
      expect(crossesIntoRegulator('reconcile', stage)).toBe(false);
    }
  });

  it('sla_breach crosses for stage_5_6+ only', () => {
    expect(slaBreachCrossesIntoRegulator('stage_1_2')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('stage_3_4')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('stage_5_6')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('stage_7_8')).toBe(true);
  });

  it('isReportable: only stage_5_6 and stage_7_8 (national threshold)', () => {
    expect(isReportable('stage_1_2')).toBe(false);
    expect(isReportable('stage_3_4')).toBe(false);
    expect(isReportable('stage_5_6')).toBe(true);
    expect(isReportable('stage_7_8')).toBe(true);
  });
});

describe('W34 load curtailment chain — stage classification', () => {
  it('classifies GW shedding to NERSA stages', () => {
    expect(stageForGwShed(0.5)).toBe('stage_1_2');
    expect(stageForGwShed(2.0)).toBe('stage_1_2');
    expect(stageForGwShed(2.5)).toBe('stage_3_4');
    expect(stageForGwShed(4.0)).toBe('stage_3_4');
    expect(stageForGwShed(4.5)).toBe('stage_5_6');
    expect(stageForGwShed(6.0)).toBe('stage_5_6');
    expect(stageForGwShed(6.5)).toBe('stage_7_8');
    expect(stageForGwShed(8.0)).toBe('stage_7_8');
  });
});
