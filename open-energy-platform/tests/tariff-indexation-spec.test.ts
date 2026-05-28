import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, isDisputeDeclaration, partyForAction, isOfftakerAction,
  type TariffIdxStatus, type TariffIdxTier,
} from '../src/utils/tariff-indexation-spec';

describe('W39 tariff-indexation chain — state machine', () => {
  it('happy path: due→published→calculated→notice→review→agreed→applied', () => {
    let s: TariffIdxStatus = 'indexation_due';
    s = nextStatus(s, 'publish_index')!;        expect(s).toBe('index_published');
    s = nextStatus(s, 'calculate_escalation')!; expect(s).toBe('escalation_calculated');
    s = nextStatus(s, 'issue_notice')!;         expect(s).toBe('notice_issued');
    s = nextStatus(s, 'begin_review')!;         expect(s).toBe('under_review');
    s = nextStatus(s, 'agree_tariff')!;         expect(s).toBe('tariff_agreed');
    s = nextStatus(s, 'apply_tariff')!;         expect(s).toBe('applied');
    expect(isTerminal('applied')).toBe(true);
  });

  it('dispute → recalculate → reissue loop: disputed→recalculated→notice_issued', () => {
    let s: TariffIdxStatus = 'disputed';
    s = nextStatus(s, 'recalculate')!;   expect(s).toBe('recalculated');
    s = nextStatus(s, 'reissue_notice')!; expect(s).toBe('notice_issued');
  });

  it('dispute reachable from notice_issued and under_review', () => {
    expect(nextStatus('notice_issued', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('under_review', 'raise_dispute')).toBe('disputed');
  });

  it('arbitration reachable from disputed and recalculated', () => {
    expect(nextStatus('disputed', 'refer_arbitration')).toBe('arbitrated');
    expect(nextStatus('recalculated', 'refer_arbitration')).toBe('arbitrated');
    expect(isTerminal('arbitrated')).toBe(true);
  });

  it('withdraw reachable from every non-terminal active state', () => {
    const froms: TariffIdxStatus[] = [
      'indexation_due', 'index_published', 'escalation_calculated',
      'notice_issued', 'under_review', 'disputed', 'recalculated',
    ];
    for (const f of froms) {
      expect(nextStatus(f, 'withdraw')).toBe('withdrawn');
    }
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('applied')).toEqual([]);
    expect(allowedActions('arbitrated')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('indexation_due', 'calculate_escalation')).toBeNull();
    expect(nextStatus('index_published', 'issue_notice')).toBeNull();
    expect(nextStatus('notice_issued', 'apply_tariff')).toBeNull();
    expect(nextStatus('tariff_agreed', 'raise_dispute')).toBeNull();
    expect(nextStatus('applied', 'withdraw')).toBeNull();
    expect(nextStatus('escalation_calculated', 'recalculate')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions = [
      'publish_index', 'calculate_escalation', 'issue_notice', 'begin_review',
      'agree_tariff', 'apply_tariff', 'raise_dispute', 'recalculate',
      'reissue_notice', 'refer_arbitration', 'withdraw',
    ] as const;
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });

  it('allowedActions for notice_issued offers review / dispute / withdraw', () => {
    const actions = allowedActions('notice_issued');
    expect(actions).toContain('begin_review');
    expect(actions).toContain('raise_dispute');
    expect(actions).toContain('withdraw');
  });

  it('allowedActions for disputed offers recalculate / refer_arbitration / withdraw', () => {
    const actions = allowedActions('disputed');
    expect(actions).toContain('recalculate');
    expect(actions).toContain('refer_arbitration');
    expect(actions).toContain('withdraw');
  });
});

describe('W39 tariff-indexation chain — MIXED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('machinery windows are uniform across all tiers', () => {
    const machinery: TariffIdxStatus[] = [
      'indexation_due', 'index_published', 'escalation_calculated',
      'notice_issued', 'under_review', 'tariff_agreed',
    ];
    for (const st of machinery) {
      expect(SLA_MINUTES[st].utility_scale).toBe(SLA_MINUTES[st].commercial);
      expect(SLA_MINUTES[st].commercial).toBe(SLA_MINUTES[st].embedded);
    }
  });

  it('dispute windows are materiality-graded with utility_scale tightest', () => {
    const disputeStates: TariffIdxStatus[] = ['disputed', 'recalculated'];
    for (const st of disputeStates) {
      expect(SLA_MINUTES[st].utility_scale).toBeLessThan(SLA_MINUTES[st].commercial);
      expect(SLA_MINUTES[st].commercial).toBeLessThan(SLA_MINUTES[st].embedded);
    }
  });

  it('dispute window: utility 10d, embedded 30d', () => {
    expect(SLA_MINUTES.disputed.utility_scale).toBe(10 * DAY);
    expect(SLA_MINUTES.disputed.embedded).toBe(30 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('disputed', 'utility_scale', base);
    expect(d!.getTime() - base.getTime()).toBe(10 * DAY * 60_000);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('applied', 'utility_scale', base)).toBeNull();
    expect(slaDeadlineFor('arbitrated', 'utility_scale', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'utility_scale', base)).toBeNull();
  });
});

describe('W39 tariff-indexation chain — reportability / regulator crossings', () => {
  const tiers: TariffIdxTier[] = ['utility_scale', 'commercial', 'embedded'];

  it('refer_arbitration crosses for EVERY tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('refer_arbitration', t)).toBe(true);
    }
  });

  it('dispute declarations cross for utility + commercial only', () => {
    expect(crossesIntoRegulator('raise_dispute', 'utility_scale')).toBe(true);
    expect(crossesIntoRegulator('raise_dispute', 'commercial')).toBe(true);
    expect(crossesIntoRegulator('raise_dispute', 'embedded')).toBe(false);
  });

  it('routine actions never cross for any tier', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('publish_index', t)).toBe(false);
      expect(crossesIntoRegulator('calculate_escalation', t)).toBe(false);
      expect(crossesIntoRegulator('issue_notice', t)).toBe(false);
      expect(crossesIntoRegulator('begin_review', t)).toBe(false);
      expect(crossesIntoRegulator('agree_tariff', t)).toBe(false);
      expect(crossesIntoRegulator('apply_tariff', t)).toBe(false);
      expect(crossesIntoRegulator('recalculate', t)).toBe(false);
      expect(crossesIntoRegulator('reissue_notice', t)).toBe(false);
      expect(crossesIntoRegulator('withdraw', t)).toBe(false);
    }
  });

  it('sla_breach crosses utility + commercial only', () => {
    expect(slaBreachCrossesIntoRegulator('utility_scale')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('commercial')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('embedded')).toBe(false);
  });

  it('isReportableTier + isDisputeDeclaration helpers', () => {
    expect(isReportableTier('utility_scale')).toBe(true);
    expect(isReportableTier('embedded')).toBe(false);
    expect(isDisputeDeclaration('raise_dispute')).toBe(true);
    expect(isDisputeDeclaration('refer_arbitration')).toBe(false);
    expect(isDisputeDeclaration('apply_tariff')).toBe(false);
  });
});

describe('W39 tariff-indexation chain — party attribution + offtaker split', () => {
  it('seller drives the indexation machinery', () => {
    expect(partyForAction('publish_index')).toBe('seller');
    expect(partyForAction('calculate_escalation')).toBe('seller');
    expect(partyForAction('issue_notice')).toBe('seller');
    expect(partyForAction('apply_tariff')).toBe('seller');
    expect(partyForAction('recalculate')).toBe('seller');
    expect(partyForAction('reissue_notice')).toBe('seller');
    expect(partyForAction('withdraw')).toBe('seller');
  });

  it('offtaker reviews / agrees / disputes / refers', () => {
    expect(partyForAction('begin_review')).toBe('offtaker');
    expect(partyForAction('agree_tariff')).toBe('offtaker');
    expect(partyForAction('raise_dispute')).toBe('offtaker');
    expect(partyForAction('refer_arbitration')).toBe('offtaker');
  });

  it('offtaker-write set is exactly review / agree / dispute / refer', () => {
    expect(isOfftakerAction('begin_review')).toBe(true);
    expect(isOfftakerAction('agree_tariff')).toBe(true);
    expect(isOfftakerAction('raise_dispute')).toBe(true);
    expect(isOfftakerAction('refer_arbitration')).toBe(true);
    expect(isOfftakerAction('publish_index')).toBe(false);
    expect(isOfftakerAction('apply_tariff')).toBe(false);
  });
});
