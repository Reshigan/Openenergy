import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isWithdrawable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isReportableTier, offsetAllowancePct, partyForAction,
  type ClaimStatus, type ClaimTier, type ClaimAction,
} from '../src/utils/carbon-offset-claim-spec';

describe('W48 carbon-offset-claim chain — state machine', () => {
  it('happy path: drafted→screening→earmarked→submitted→review→granted→applied→reconciled', () => {
    let s: ClaimStatus = 'claim_drafted';
    s = nextStatus(s, 'screen_eligibility')!; expect(s).toBe('eligibility_screening');
    s = nextStatus(s, 'earmark_credits')!;    expect(s).toBe('credits_earmarked');
    s = nextStatus(s, 'submit_claim')!;        expect(s).toBe('claim_submitted');
    s = nextStatus(s, 'begin_review')!;        expect(s).toBe('sars_review');
    s = nextStatus(s, 'grant_allowance')!;     expect(s).toBe('allowance_granted');
    s = nextStatus(s, 'apply_to_return')!;     expect(s).toBe('applied_to_return');
    s = nextStatus(s, 'reconcile')!;           expect(s).toBe('reconciled');
    expect(isTerminal('reconciled')).toBe(true);
  });

  it('SARS query loop: review→query→(respond)→review', () => {
    expect(nextStatus('sars_review', 'raise_query')).toBe('sars_query');
    expect(nextStatus('sars_query', 'respond_query')).toBe('sars_review');
  });

  it('begin_review and respond_query both land in sars_review', () => {
    expect(nextStatus('claim_submitted', 'begin_review')).toBe('sars_review');
    expect(nextStatus('sars_query', 'respond_query')).toBe('sars_review');
  });

  it('rejected reachable only from sars_review', () => {
    expect(nextStatus('sars_review', 'reject_claim')).toBe('rejected');
    expect(nextStatus('sars_query', 'reject_claim')).toBeNull();
    expect(nextStatus('claim_submitted', 'reject_claim')).toBeNull();
    expect(isTerminal('rejected')).toBe(true);
  });

  it('clawed_back reachable from granted / applied (open against the assessment window)', () => {
    expect(nextStatus('allowance_granted', 'claw_back')).toBe('clawed_back');
    expect(nextStatus('applied_to_return', 'claw_back')).toBe('clawed_back');
    expect(isTerminal('clawed_back')).toBe(true);
  });

  it('claw_back NOT reachable before an allowance is granted, nor after reconcile', () => {
    expect(nextStatus('claim_drafted', 'claw_back')).toBeNull();
    expect(nextStatus('eligibility_screening', 'claw_back')).toBeNull();
    expect(nextStatus('sars_review', 'claw_back')).toBeNull();
    expect(nextStatus('sars_query', 'claw_back')).toBeNull();
    expect(nextStatus('reconciled', 'claw_back')).toBeNull();
  });

  it('reconciled is a hard terminal', () => {
    expect(isTerminal('reconciled')).toBe(true);
    expect(allowedActions('reconciled')).toEqual([]);
    expect(TRANSITIONS.claw_back.from).not.toContain('reconciled');
  });

  it('withdraw reachable only from pre-submission states', () => {
    expect(nextStatus('claim_drafted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('eligibility_screening', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('credits_earmarked', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('claim_submitted', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('sars_review', 'withdraw')).toBeNull();
    expect(nextStatus('allowance_granted', 'withdraw')).toBeNull();
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('isWithdrawable matches the pre-submission set', () => {
    expect(isWithdrawable('claim_drafted')).toBe(true);
    expect(isWithdrawable('eligibility_screening')).toBe(true);
    expect(isWithdrawable('credits_earmarked')).toBe(true);
    expect(isWithdrawable('claim_submitted')).toBe(true);
    expect(isWithdrawable('sars_review')).toBe(false);
    expect(isWithdrawable('allowance_granted')).toBe(false);
    expect(isWithdrawable('reconciled')).toBe(false);
  });

  it('terminal states accept no further transitions', () => {
    expect(allowedActions('reconciled')).toEqual([]);
    expect(allowedActions('rejected')).toEqual([]);
    expect(allowedActions('clawed_back')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
  });

  it('rejects illegal transitions', () => {
    expect(nextStatus('claim_drafted', 'submit_claim')).toBeNull();
    expect(nextStatus('eligibility_screening', 'begin_review')).toBeNull();
    expect(nextStatus('credits_earmarked', 'grant_allowance')).toBeNull();
    expect(nextStatus('claim_submitted', 'apply_to_return')).toBeNull();
    expect(nextStatus('allowance_granted', 'reconcile')).toBeNull();
    expect(nextStatus('reconciled', 'reconcile')).toBeNull();
  });

  it('apply_to_return reachable only from allowance_granted', () => {
    expect(nextStatus('allowance_granted', 'apply_to_return')).toBe('applied_to_return');
    expect(nextStatus('sars_review', 'apply_to_return')).toBeNull();
    expect(nextStatus('applied_to_return', 'apply_to_return')).toBeNull();
  });

  it('sars_review fans out to query / grant / reject', () => {
    const acts = allowedActions('sars_review');
    expect(acts).toContain('raise_query');
    expect(acts).toContain('grant_allowance');
    expect(acts).toContain('reject_claim');
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: ClaimAction[] = [
      'screen_eligibility', 'earmark_credits', 'submit_claim', 'begin_review',
      'raise_query', 'respond_query', 'grant_allowance', 'reject_claim',
      'apply_to_return', 'reconcile', 'claw_back', 'withdraw',
    ];
    for (const a of actions) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
  });
});

describe('W48 carbon-offset-claim chain — INVERTED SLA matrix', () => {
  const base = new Date('2026-01-15T10:00:00Z');
  const DAY = 24 * 60;

  it('major_claim is the LONGEST window at every active stage', () => {
    const active: ClaimStatus[] = [
      'claim_drafted', 'eligibility_screening', 'credits_earmarked', 'claim_submitted',
      'sars_review', 'sars_query', 'allowance_granted', 'applied_to_return',
    ];
    for (const st of active) {
      expect(SLA_MINUTES[st].major_claim).toBeGreaterThan(SLA_MINUTES[st].standard_claim);
      expect(SLA_MINUTES[st].standard_claim).toBeGreaterThan(SLA_MINUTES[st].minor_claim);
    }
  });

  it('sars_review: major 45d, minor 10d', () => {
    expect(SLA_MINUTES.sars_review.major_claim).toBe(45 * DAY);
    expect(SLA_MINUTES.sars_review.minor_claim).toBe(10 * DAY);
  });

  it('claim_submitted: major 30d, minor 7d', () => {
    expect(SLA_MINUTES.claim_submitted.major_claim).toBe(30 * DAY);
    expect(SLA_MINUTES.claim_submitted.minor_claim).toBe(7 * DAY);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('sars_review', 'major_claim', base);
    expect(d!.getTime() - base.getTime()).toBe(45 * DAY * 60_000);
  });

  it('slaWindowMinutes returns the matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('sars_review', 'minor_claim')).toBe(10 * DAY);
    expect(slaWindowMinutes('reconciled', 'major_claim')).toBe(0);
  });

  it('all terminals return null deadline', () => {
    expect(slaDeadlineFor('reconciled', 'major_claim', base)).toBeNull();
    expect(slaDeadlineFor('rejected', 'major_claim', base)).toBeNull();
    expect(slaDeadlineFor('clawed_back', 'major_claim', base)).toBeNull();
    expect(slaDeadlineFor('withdrawn', 'major_claim', base)).toBeNull();
  });
});

describe('W48 carbon-offset-claim chain — reportability matrix', () => {
  const tiers: ClaimTier[] = ['major_claim', 'standard_claim', 'minor_claim'];

  it('claw_back crosses for EVERY tier (understatement / penalty exposure)', () => {
    expect(crossesIntoRegulator('claw_back', 'major_claim')).toBe(true);
    expect(crossesIntoRegulator('claw_back', 'standard_claim')).toBe(true);
    expect(crossesIntoRegulator('claw_back', 'minor_claim')).toBe(true);
  });

  it('reject_claim crosses for material tiers only (major + standard)', () => {
    expect(crossesIntoRegulator('reject_claim', 'major_claim')).toBe(true);
    expect(crossesIntoRegulator('reject_claim', 'standard_claim')).toBe(true);
    expect(crossesIntoRegulator('reject_claim', 'minor_claim')).toBe(false);
  });

  it('grant_allowance crosses for major_claim only', () => {
    expect(crossesIntoRegulator('grant_allowance', 'major_claim')).toBe(true);
    expect(crossesIntoRegulator('grant_allowance', 'standard_claim')).toBe(false);
    expect(crossesIntoRegulator('grant_allowance', 'minor_claim')).toBe(false);
  });

  it('routine taxpayer / registry actions never cross for any tier', () => {
    const routine: ClaimAction[] = [
      'screen_eligibility', 'earmark_credits', 'submit_claim', 'begin_review',
      'raise_query', 'respond_query', 'apply_to_return', 'reconcile', 'withdraw',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for material tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('major_claim')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('standard_claim')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('minor_claim')).toBe(false);
  });

  it('isReportableTier — material tiers only', () => {
    expect(isReportableTier('major_claim')).toBe(true);
    expect(isReportableTier('standard_claim')).toBe(true);
    expect(isReportableTier('minor_claim')).toBe(false);
  });
});

describe('W48 carbon-offset-claim chain — s.13 allowance + party attribution', () => {
  it('offsetAllowancePct: 10% Annex-2, 5% general', () => {
    expect(offsetAllowancePct('annex_2')).toBe(10);
    expect(offsetAllowancePct('general')).toBe(5);
  });

  it('registry (COAS) owns eligibility screening + credit earmark', () => {
    expect(partyForAction('screen_eligibility')).toBe('registry');
    expect(partyForAction('earmark_credits')).toBe('registry');
  });

  it('sars owns review / query / grant / reject / reconcile / claw_back', () => {
    expect(partyForAction('begin_review')).toBe('sars');
    expect(partyForAction('raise_query')).toBe('sars');
    expect(partyForAction('grant_allowance')).toBe('sars');
    expect(partyForAction('reject_claim')).toBe('sars');
    expect(partyForAction('reconcile')).toBe('sars');
    expect(partyForAction('claw_back')).toBe('sars');
  });

  it('taxpayer owns submission / query response / apply-to-return / withdraw', () => {
    expect(partyForAction('submit_claim')).toBe('taxpayer');
    expect(partyForAction('respond_query')).toBe('taxpayer');
    expect(partyForAction('apply_to_return')).toBe('taxpayer');
    expect(partyForAction('withdraw')).toBe('taxpayer');
  });
});
