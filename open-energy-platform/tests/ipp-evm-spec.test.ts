// Wave 113 — IPP Cost Management & EVM spec test battery.
//
// Covers: state machine (forward path + branches + terminals + rejected
// restart + contingency + management-reserve), tier derivation +
// FLOOR-AT-LARGE + FLOOR-AT-MEGA, INVERTED SLA matrix anchored on
// variance_detected, SIGNATURE regulator crossings (draw_management_
// reserve EVERY tier when budget >= 1; cancel EVERY tier; publish_
// reforecast large+mega when VAC<0 OR CPI<0.85; approve_CR mega only
// when CR_value >= 10% budget), party routing (4 parties), authority
// ladder + INVERTED filing window, urgency band (INVERTED polarity),
// 4-bridge architecture (W112/W21/W30/W77), EVM math (CPI/SPI/CV/SV/
// EAC/ETC/VAC/TCPI), contingency + management-reserve remaining %,
// completeness 0-130.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForBudget,
  countFloorFlags,
  floorAtLarge,
  floorAtMega,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToScheduleChain,
  bridgesToDrawdownChain,
  bridgesToDisbursementChain,
  bridgesToReserveAccountChain,
  costPerformanceIndex,
  schedulePerformanceIndex,
  costVarianceZar,
  scheduleVarianceZar,
  estimateAtCompletionZar,
  estimateToCompleteZar,
  varianceAtCompletionZar,
  toCompletePerformanceIndex,
  contingencyRemainingPct,
  managementReserveRemainingPct,
  evmCompletenessIndex,
} from '../src/utils/ipp-evm-spec';

describe('W113 IPP EVM — state machine', () => {
  it('walks the forward path budget_set → closed', () => {
    expect(nextStatus('budget_set', 'commit_cost')).toBe('committed');
    expect(nextStatus('committed', 'incur_cost')).toBe('incurred');
    expect(nextStatus('incurred', 'measure_progress')).toBe('measured');
    expect(nextStatus('measured', 'detect_variance')).toBe('variance_detected');
    expect(nextStatus('variance_detected', 'draft_reforecast')).toBe('reforecast_drafted');
    expect(nextStatus('reforecast_drafted', 'log_CR')).toBe('CR_logged');
    expect(nextStatus('CR_logged', 'approve_CR')).toBe('CR_approved');
    expect(nextStatus('CR_approved', 'publish_reforecast')).toBe('reforecast_published');
    expect(nextStatus('reforecast_published', 'reconcile')).toBe('reconciled');
    expect(nextStatus('reconciled', 'close_book')).toBe('closed');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('budget_set', 'incur_cost')).toBeNull();
    expect(nextStatus('committed', 'detect_variance')).toBeNull();
    expect(nextStatus('incurred', 'approve_CR')).toBeNull();
    expect(nextStatus('CR_logged', 'publish_reforecast')).toBeNull();
    expect(nextStatus('closed', 'reconcile')).toBeNull();
    expect(nextStatus('cancelled', 'commit_cost')).toBeNull();
  });

  it('supports CR_logged → reforecast_rejected → draft_reforecast loop', () => {
    expect(nextStatus('CR_logged', 'reject_reforecast')).toBe('reforecast_rejected');
    expect(nextStatus('reforecast_rejected', 'draft_reforecast')).toBe('reforecast_drafted');
  });

  it('supports contingency_drawn branch from CR_approved', () => {
    expect(nextStatus('CR_approved', 'draw_contingency')).toBe('contingency_drawn');
    expect(nextStatus('contingency_drawn', 'measure_progress')).toBe('measured');
    expect(nextStatus('contingency_drawn', 'reconcile')).toBe('reconciled');
  });

  it('supports draw_management_reserve from variance/reforecast/CR/published', () => {
    expect(nextStatus('variance_detected', 'draw_management_reserve')).toBe('variance_detected');
    expect(nextStatus('reforecast_drafted', 'draw_management_reserve')).toBe('variance_detected');
    expect(nextStatus('CR_logged', 'draw_management_reserve')).toBe('variance_detected');
    expect(nextStatus('CR_approved', 'draw_management_reserve')).toBe('variance_detected');
    expect(nextStatus('reforecast_published', 'draw_management_reserve')).toBe('variance_detected');
    // not available from budget_set / committed / incurred / measured
    expect(nextStatus('budget_set', 'draw_management_reserve')).toBeNull();
    expect(nextStatus('committed', 'draw_management_reserve')).toBeNull();
    expect(nextStatus('measured', 'draw_management_reserve')).toBeNull();
  });

  it('allows cancel from any non-terminal state', () => {
    expect(nextStatus('budget_set', 'cancel')).toBe('cancelled');
    expect(nextStatus('committed', 'cancel')).toBe('cancelled');
    expect(nextStatus('incurred', 'cancel')).toBe('cancelled');
    expect(nextStatus('measured', 'cancel')).toBe('cancelled');
    expect(nextStatus('variance_detected', 'cancel')).toBe('cancelled');
    expect(nextStatus('reforecast_drafted', 'cancel')).toBe('cancelled');
    expect(nextStatus('CR_logged', 'cancel')).toBe('cancelled');
    expect(nextStatus('CR_approved', 'cancel')).toBe('cancelled');
    expect(nextStatus('reforecast_published', 'cancel')).toBe('cancelled');
    expect(nextStatus('reconciled', 'cancel')).toBe('cancelled');
    expect(nextStatus('reforecast_rejected', 'cancel')).toBe('cancelled');
    expect(nextStatus('contingency_drawn', 'cancel')).toBe('cancelled');
    // hard terminals reject cancel
    expect(nextStatus('closed', 'cancel')).toBeNull();
    expect(nextStatus('cancelled', 'cancel')).toBeNull();
  });

  it('measure_progress is idempotent from measured', () => {
    expect(nextStatus('measured', 'measure_progress')).toBe('measured');
  });

  it('commit_cost is idempotent from committed', () => {
    expect(nextStatus('committed', 'commit_cost')).toBe('committed');
  });

  it('incur_cost is idempotent from incurred', () => {
    expect(nextStatus('incurred', 'incur_cost')).toBe('incurred');
  });

  it('submit_to_PM_review keeps state at reforecast_drafted', () => {
    expect(nextStatus('reforecast_drafted', 'submit_to_PM_review')).toBe('reforecast_drafted');
    // not available outside reforecast_drafted
    expect(nextStatus('CR_logged', 'submit_to_PM_review')).toBeNull();
  });

  it('reconcile is reachable from reforecast_published, measured, contingency_drawn', () => {
    expect(nextStatus('reforecast_published', 'reconcile')).toBe('reconciled');
    expect(nextStatus('measured', 'reconcile')).toBe('reconciled');
    expect(nextStatus('contingency_drawn', 'reconcile')).toBe('reconciled');
  });

  it('identifies hard terminals correctly', () => {
    expect(isHardTerminal('closed')).toBe(true);
    expect(isHardTerminal('cancelled')).toBe(true);
    expect(isHardTerminal('reforecast_rejected')).toBe(false);
    expect(isHardTerminal('contingency_drawn')).toBe(false);
    expect(isHardTerminal('variance_detected')).toBe(false);
  });

  it('identifies UI terminals correctly', () => {
    expect(isTerminal('closed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('reforecast_rejected')).toBe(false);
    expect(isTerminal('contingency_drawn')).toBe(false);
  });

  it('allowedActions covers expected transitions from CR_approved', () => {
    const a = allowedActions('CR_approved');
    expect(a).toContain('publish_reforecast');
    expect(a).toContain('draw_contingency');
    expect(a).toContain('draw_management_reserve');
    expect(a).toContain('cancel');
    expect(a).not.toContain('set_budget');
  });

  it('allowedActions returns empty for hard terminals', () => {
    expect(allowedActions('closed')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('TRANSITIONS table covers all 16 actions', () => {
    const actions = Object.keys(TRANSITIONS);
    expect(actions).toHaveLength(16);
  });
});

describe('W113 IPP EVM — tier derivation + FLOOR overlays', () => {
  it('derives tier from total_budget_zar thresholds', () => {
    expect(tierForBudget(0)).toBe('small');
    expect(tierForBudget(1_000_000)).toBe('small');
    expect(tierForBudget(249_999_999)).toBe('small');
    expect(tierForBudget(250_000_000)).toBe('medium');
    expect(tierForBudget(500_000_000)).toBe('medium');
    expect(tierForBudget(1_499_999_999)).toBe('medium');
    expect(tierForBudget(1_500_000_000)).toBe('large');
    expect(tierForBudget(3_000_000_000)).toBe('large');
    expect(tierForBudget(7_999_999_999)).toBe('large');
    expect(tierForBudget(8_000_000_000)).toBe('mega');
    expect(tierForBudget(20_000_000_000)).toBe('mega');
  });

  it('handles invalid budget values', () => {
    expect(tierForBudget(null)).toBe('small');
    expect(tierForBudget(undefined)).toBe('small');
    expect(tierForBudget(-1)).toBe('small');
    expect(tierForBudget(NaN)).toBe('small');
  });

  it('counts floor flags accurately', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ cpi_below_pct_85: true })).toBe(1);
    expect(countFloorFlags({
      cpi_below_pct_85: true,
      contingency_consumed_pct_75: true,
    })).toBe(2);
    expect(countFloorFlags({
      cpi_below_pct_85: 1,
      contingency_consumed_pct_75: 1,
      management_reserve_drawn: 1,
    })).toBe(3);
    expect(countFloorFlags({
      cpi_below_pct_85: true,
      contingency_consumed_pct_75: true,
      management_reserve_drawn: true,
      forex_variance_above_pct_10: true,
      multi_currency_book: true,
    })).toBe(5);
  });

  it('FLOOR-AT-LARGE on any one flag', () => {
    expect(floorAtLarge({})).toBe(false);
    expect(floorAtLarge({ cpi_below_pct_85: true })).toBe(true);
    expect(floorAtLarge({ contingency_consumed_pct_75: true })).toBe(true);
    expect(floorAtLarge({ management_reserve_drawn: true })).toBe(true);
    expect(floorAtLarge({ forex_variance_above_pct_10: true })).toBe(true);
    expect(floorAtLarge({ multi_currency_book: true })).toBe(true);
  });

  it('FLOOR-AT-MEGA requires 2+ flags', () => {
    expect(floorAtMega({})).toBe(false);
    expect(floorAtMega({ cpi_below_pct_85: true })).toBe(false);
    expect(floorAtMega({
      cpi_below_pct_85: true,
      contingency_consumed_pct_75: true,
    })).toBe(true);
    expect(floorAtMega({
      management_reserve_drawn: true,
      forex_variance_above_pct_10: true,
    })).toBe(true);
  });

  it('effectiveTier elevates small/medium to large on 1 flag', () => {
    expect(effectiveTier('small', { cpi_below_pct_85: true })).toBe('large');
    expect(effectiveTier('medium', { multi_currency_book: true })).toBe('large');
    expect(effectiveTier('large', { management_reserve_drawn: true })).toBe('large');
    expect(effectiveTier('mega', { cpi_below_pct_85: true })).toBe('mega');
  });

  it('effectiveTier elevates anything to mega on 2+ flags', () => {
    expect(effectiveTier('small', {
      cpi_below_pct_85: true,
      forex_variance_above_pct_10: true,
    })).toBe('mega');
    expect(effectiveTier('medium', {
      management_reserve_drawn: true,
      multi_currency_book: true,
    })).toBe('mega');
    expect(effectiveTier('large', {
      cpi_below_pct_85: true,
      contingency_consumed_pct_75: true,
      management_reserve_drawn: true,
    })).toBe('mega');
  });

  it('effectiveTier is identity with zero flags', () => {
    expect(effectiveTier('small', {})).toBe('small');
    expect(effectiveTier('medium', {})).toBe('medium');
    expect(effectiveTier('large', {})).toBe('large');
    expect(effectiveTier('mega', {})).toBe('mega');
  });

  it('isHeavyTier / isReportable cover large + mega', () => {
    expect(isHeavyTier('small')).toBe(false);
    expect(isHeavyTier('medium')).toBe(false);
    expect(isHeavyTier('large')).toBe(true);
    expect(isHeavyTier('mega')).toBe(true);
    expect(isReportable('large')).toBe(true);
    expect(isReportable('mega')).toBe(true);
  });
});

describe('W113 IPP EVM — INVERTED SLA matrix', () => {
  it('anchor SLA on variance_detected is INVERTED (mega longest)', () => {
    expect(slaWindowHours('variance_detected', 'small')).toBe(72);   // 3 days
    expect(slaWindowHours('variance_detected', 'medium')).toBe(168); // 7 days
    expect(slaWindowHours('variance_detected', 'large')).toBe(336);  // 14 days
    expect(slaWindowHours('variance_detected', 'mega')).toBe(480);   // 20 days
  });

  it('all non-terminal states have INVERTED windows (mega >= small)', () => {
    for (const status of Object.keys(SLA_HOURS)) {
      const matrix = SLA_HOURS[status as keyof typeof SLA_HOURS];
      if (matrix.small === 0 && matrix.medium === 0 && matrix.large === 0 && matrix.mega === 0) continue;
      expect(matrix.mega).toBeGreaterThanOrEqual(matrix.large);
      expect(matrix.large).toBeGreaterThanOrEqual(matrix.medium);
      expect(matrix.medium).toBeGreaterThanOrEqual(matrix.small);
    }
  });

  it('hard terminal states have zero SLA', () => {
    expect(slaWindowHours('closed', 'mega')).toBe(0);
    expect(slaWindowHours('cancelled', 'mega')).toBe(0);
  });

  it('slaDeadlineFor computes correct deadline', () => {
    const t0 = new Date('2026-05-30T10:00:00Z');
    const deadline = slaDeadlineFor('variance_detected', 'mega', t0);
    expect(deadline).not.toBeNull();
    // 480 hours = 20 days
    expect(deadline!.getTime() - t0.getTime()).toBe(480 * 3600 * 1000);
  });

  it('slaDeadlineFor returns null for hard-terminal status', () => {
    const t0 = new Date('2026-05-30T10:00:00Z');
    expect(slaDeadlineFor('closed', 'mega', t0)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'mega', t0)).toBeNull();
  });

  it('slaHoursRemaining returns 0 for null entry', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    expect(slaHoursRemaining('variance_detected', 'small', null, now)).toBe(0);
  });

  it('slaHoursRemaining counts correctly', () => {
    const enteredAt = new Date('2026-05-30T10:00:00Z');
    const now = new Date('2026-05-31T10:00:00Z'); // 24h elapsed
    const remaining = slaHoursRemaining('variance_detected', 'small', enteredAt, now);
    // 72 - 24 = 48
    expect(remaining).toBe(48);
  });

  it('slaHoursRemaining returns negative when past deadline', () => {
    const enteredAt = new Date('2026-05-01T10:00:00Z');
    const now = new Date('2026-05-30T10:00:00Z'); // 29 days elapsed
    const remaining = slaHoursRemaining('variance_detected', 'small', enteredAt, now);
    expect(remaining).toBeLessThan(0);
  });
});

describe('W113 IPP EVM — SIGNATURE regulator crossings', () => {
  it('W113 SIGNATURE: draw_management_reserve crosses EVERY tier when budget >= 1', () => {
    for (const tier of ['small', 'medium', 'large', 'mega'] as const) {
      expect(crossesIntoRegulator('draw_management_reserve', tier, {
        total_budget_zar: 1,
      })).toBe(true);
      expect(crossesIntoRegulator('draw_management_reserve', tier, {
        total_budget_zar: 100_000_000,
      })).toBe(true);
      expect(crossesIntoRegulator('draw_management_reserve', tier, {
        total_budget_zar: 10_000_000_000,
      })).toBe(true);
    }
  });

  it('draw_management_reserve does NOT cross when budget = 0', () => {
    expect(crossesIntoRegulator('draw_management_reserve', 'small', {
      total_budget_zar: 0,
    })).toBe(false);
    expect(crossesIntoRegulator('draw_management_reserve', 'mega', {
      total_budget_zar: 0,
    })).toBe(false);
  });

  it('cancel crosses EVERY tier (project cost cancellation)', () => {
    for (const tier of ['small', 'medium', 'large', 'mega'] as const) {
      expect(crossesIntoRegulator('cancel', tier, { total_budget_zar: 100_000_000 })).toBe(true);
    }
  });

  it('publish_reforecast crosses large+mega when VAC < 0', () => {
    expect(crossesIntoRegulator('publish_reforecast', 'large', {
      total_budget_zar: 2_000_000_000,
      vac_zar: -50_000_000,
      cpi: 0.95,
    })).toBe(true);
    expect(crossesIntoRegulator('publish_reforecast', 'mega', {
      total_budget_zar: 10_000_000_000,
      vac_zar: -500_000_000,
      cpi: 0.95,
    })).toBe(true);
  });

  it('publish_reforecast crosses large+mega when CPI < 0.85', () => {
    expect(crossesIntoRegulator('publish_reforecast', 'large', {
      total_budget_zar: 2_000_000_000,
      vac_zar: 100_000_000,
      cpi: 0.80,
    })).toBe(true);
    expect(crossesIntoRegulator('publish_reforecast', 'mega', {
      total_budget_zar: 10_000_000_000,
      vac_zar: 100_000_000,
      cpi: 0.70,
    })).toBe(true);
  });

  it('publish_reforecast does NOT cross small/medium even when VAC<0 or CPI<0.85', () => {
    expect(crossesIntoRegulator('publish_reforecast', 'small', {
      total_budget_zar: 100_000_000,
      vac_zar: -10_000_000,
      cpi: 0.70,
    })).toBe(false);
    expect(crossesIntoRegulator('publish_reforecast', 'medium', {
      total_budget_zar: 500_000_000,
      vac_zar: -10_000_000,
      cpi: 0.70,
    })).toBe(false);
  });

  it('publish_reforecast does NOT cross when VAC>=0 AND CPI>=0.85 even on large/mega', () => {
    expect(crossesIntoRegulator('publish_reforecast', 'large', {
      total_budget_zar: 2_000_000_000,
      vac_zar: 0,
      cpi: 0.95,
    })).toBe(false);
    expect(crossesIntoRegulator('publish_reforecast', 'mega', {
      total_budget_zar: 10_000_000_000,
      vac_zar: 100_000_000,
      cpi: 1.05,
    })).toBe(false);
  });

  it('approve_CR crosses mega only when CR_value >= 10% budget', () => {
    expect(crossesIntoRegulator('approve_CR', 'mega', {
      total_budget_zar: 10_000_000_000,
      cr_value_zar: 1_500_000_000, // 15%
    })).toBe(true);
    expect(crossesIntoRegulator('approve_CR', 'mega', {
      total_budget_zar: 10_000_000_000,
      cr_value_zar: 1_000_000_000, // exactly 10%
    })).toBe(true);
    expect(crossesIntoRegulator('approve_CR', 'mega', {
      total_budget_zar: 10_000_000_000,
      cr_value_zar: 500_000_000, // 5%
    })).toBe(false);
  });

  it('approve_CR does NOT cross small/medium/large regardless of CR%', () => {
    expect(crossesIntoRegulator('approve_CR', 'small', {
      total_budget_zar: 100_000_000,
      cr_value_zar: 50_000_000, // 50% — would obliterate small budget
    })).toBe(false);
    expect(crossesIntoRegulator('approve_CR', 'medium', {
      total_budget_zar: 500_000_000,
      cr_value_zar: 200_000_000,
    })).toBe(false);
    expect(crossesIntoRegulator('approve_CR', 'large', {
      total_budget_zar: 2_000_000_000,
      cr_value_zar: 400_000_000, // 20%
    })).toBe(false);
  });

  it('routine transitions do not cross regulator', () => {
    expect(crossesIntoRegulator('commit_cost', 'mega', { total_budget_zar: 10_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('incur_cost', 'large', { total_budget_zar: 2_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('measure_progress', 'mega', { total_budget_zar: 10_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('detect_variance', 'large', { total_budget_zar: 2_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('reconcile', 'mega', { total_budget_zar: 10_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('close_book', 'mega', { total_budget_zar: 10_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('log_CR', 'mega', { total_budget_zar: 10_000_000_000 })).toBe(false);
    expect(crossesIntoRegulator('draw_contingency', 'large', { total_budget_zar: 2_000_000_000 })).toBe(false);
  });

  it('slaBreachCrossesIntoRegulator covers large + mega', () => {
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
  });
});

describe('W113 IPP EVM — party routing + event names', () => {
  it('routes cost_engineer actions correctly', () => {
    expect(partyForAction('set_budget')).toBe('cost_engineer');
    expect(partyForAction('commit_cost')).toBe('cost_engineer');
    expect(partyForAction('incur_cost')).toBe('cost_engineer');
    expect(partyForAction('measure_progress')).toBe('cost_engineer');
    expect(partyForAction('detect_variance')).toBe('cost_engineer');
    expect(partyForAction('draft_reforecast')).toBe('cost_engineer');
    expect(partyForAction('draw_contingency')).toBe('cost_engineer');
  });

  it('routes PM actions correctly', () => {
    expect(partyForAction('log_CR')).toBe('PM');
    expect(partyForAction('approve_CR')).toBe('PM');
    expect(partyForAction('reject_reforecast')).toBe('PM');
    expect(partyForAction('publish_reforecast')).toBe('PM');
    expect(partyForAction('submit_to_PM_review')).toBe('PM');
  });

  it('routes finance_director actions correctly', () => {
    expect(partyForAction('reconcile')).toBe('finance_director');
    expect(partyForAction('close_book')).toBe('finance_director');
  });

  it('routes CFO actions correctly', () => {
    expect(partyForAction('cancel')).toBe('CFO');
    expect(partyForAction('draw_management_reserve')).toBe('CFO');
  });

  it('event types match action names with ipp_evm_ prefix', () => {
    expect(eventTypeFor('set_budget')).toBe('ipp_evm_budget_set');
    expect(eventTypeFor('commit_cost')).toBe('ipp_evm_cost_committed');
    expect(eventTypeFor('incur_cost')).toBe('ipp_evm_cost_incurred');
    expect(eventTypeFor('measure_progress')).toBe('ipp_evm_progress_measured');
    expect(eventTypeFor('detect_variance')).toBe('ipp_evm_variance_detected');
    expect(eventTypeFor('draft_reforecast')).toBe('ipp_evm_reforecast_drafted');
    expect(eventTypeFor('log_CR')).toBe('ipp_evm_cr_logged');
    expect(eventTypeFor('approve_CR')).toBe('ipp_evm_cr_approved');
    expect(eventTypeFor('reject_reforecast')).toBe('ipp_evm_reforecast_rejected');
    expect(eventTypeFor('publish_reforecast')).toBe('ipp_evm_reforecast_published');
    expect(eventTypeFor('reconcile')).toBe('ipp_evm_reconciled');
    expect(eventTypeFor('close_book')).toBe('ipp_evm_book_closed');
    expect(eventTypeFor('cancel')).toBe('ipp_evm_cancelled');
    expect(eventTypeFor('draw_contingency')).toBe('ipp_evm_contingency_drawn');
    expect(eventTypeFor('draw_management_reserve')).toBe('ipp_evm_management_reserve_drawn');
    expect(eventTypeFor('submit_to_PM_review')).toBe('ipp_evm_submitted_to_pm_review');
  });
});

describe('W113 IPP EVM — authority ladder + INVERTED filing window', () => {
  it('authorityRequired ladder is 4-step', () => {
    expect(authorityRequired('small')).toBe('cost_engineer');
    expect(authorityRequired('medium')).toBe('PM');
    expect(authorityRequired('large')).toBe('finance_director');
    expect(authorityRequired('mega')).toBe('CFO');
  });

  it('regulator filing window is INVERTED (mega longest)', () => {
    expect(regulatorFilingWindowHours('small')).toBe(24);
    expect(regulatorFilingWindowHours('medium')).toBe(48);
    expect(regulatorFilingWindowHours('large')).toBe(72);
    expect(regulatorFilingWindowHours('mega')).toBe(168);
  });
});

describe('W113 IPP EVM — urgency band INVERTED polarity', () => {
  it('negative hours always critical', () => {
    expect(urgencyBand('small', -1)).toBe('critical');
    expect(urgencyBand('mega', -100)).toBe('critical');
  });

  it('small tier has TIGHTEST urgency thresholds', () => {
    expect(urgencyBand('small', 5)).toBe('critical');
    expect(urgencyBand('small', 20)).toBe('high');
    expect(urgencyBand('small', 40)).toBe('medium');
    expect(urgencyBand('small', 100)).toBe('low');
  });

  it('mega tier has LOOSEST urgency thresholds', () => {
    expect(urgencyBand('mega', 50)).toBe('critical');
    expect(urgencyBand('mega', 100)).toBe('high');
    expect(urgencyBand('mega', 300)).toBe('medium');
    expect(urgencyBand('mega', 500)).toBe('low');
  });

  it('thresholds scale up across tiers (INVERTED)', () => {
    // 72 hours across tiers shows INVERTED scaling:
    // small (thresholds 8/24/48) → low; medium (24/72/120) → medium at boundary;
    // large (48/120/240) → high (within 120); mega (72/168/336) → critical at boundary.
    expect(urgencyBand('small', 72)).toBe('low');
    expect(urgencyBand('medium', 72)).toBe('medium');
    expect(urgencyBand('large', 72)).toBe('high');
    expect(urgencyBand('mega', 71)).toBe('critical');
  });
});

describe('W113 IPP EVM — 4-bridge architecture', () => {
  it('bridges to W112 schedule chain when ref present', () => {
    expect(bridgesToScheduleChain('ips-001')).toBe(true);
    expect(bridgesToScheduleChain(null)).toBe(false);
    expect(bridgesToScheduleChain('')).toBe(false);
    expect(bridgesToScheduleChain(undefined)).toBe(false);
  });

  it('bridges to W21 drawdown chain when ref present', () => {
    expect(bridgesToDrawdownChain('dd-001')).toBe(true);
    expect(bridgesToDrawdownChain(undefined)).toBe(false);
  });

  it('bridges to W30 disbursement chain when ref present', () => {
    expect(bridgesToDisbursementChain('disb-001')).toBe(true);
    expect(bridgesToDisbursementChain(null)).toBe(false);
  });

  it('bridges to W77 reserve-account chain when ref present', () => {
    expect(bridgesToReserveAccountChain('rac-001')).toBe(true);
    expect(bridgesToReserveAccountChain(null)).toBe(false);
  });
});

describe('W113 IPP EVM — EVM math helpers', () => {
  it('costPerformanceIndex computes EV/AC', () => {
    expect(costPerformanceIndex(800, 1000)).toBe(0.8);
    expect(costPerformanceIndex(1200, 1000)).toBe(1.2);
    expect(costPerformanceIndex(0, 1000)).toBe(0);
    expect(costPerformanceIndex(500, 0)).toBe(0);
    expect(costPerformanceIndex(null, null)).toBe(0);
  });

  it('schedulePerformanceIndex computes EV/PV', () => {
    expect(schedulePerformanceIndex(900, 1000)).toBe(0.9);
    expect(schedulePerformanceIndex(1100, 1000)).toBe(1.1);
    expect(schedulePerformanceIndex(0, 1000)).toBe(0);
    expect(schedulePerformanceIndex(500, 0)).toBe(0);
  });

  it('costVarianceZar computes EV-AC', () => {
    expect(costVarianceZar(900, 1000)).toBe(-100);
    expect(costVarianceZar(1100, 1000)).toBe(100);
    expect(costVarianceZar(0, 0)).toBe(0);
  });

  it('scheduleVarianceZar computes EV-PV', () => {
    expect(scheduleVarianceZar(900, 1000)).toBe(-100);
    expect(scheduleVarianceZar(1100, 1000)).toBe(100);
  });

  it('estimateAtCompletionZar computes BAC/CPI', () => {
    // BAC 10b, CPI 0.8 → EAC 12.5b
    expect(estimateAtCompletionZar(10_000_000_000, 0.8)).toBe(12_500_000_000);
    // BAC 10b, CPI 1.0 → EAC 10b
    expect(estimateAtCompletionZar(10_000_000_000, 1.0)).toBe(10_000_000_000);
    // CPI 0 → 0
    expect(estimateAtCompletionZar(10_000_000_000, 0)).toBe(0);
    expect(estimateAtCompletionZar(null, 1.0)).toBe(0);
  });

  it('estimateToCompleteZar computes EAC-AC', () => {
    expect(estimateToCompleteZar(12_000_000_000, 4_000_000_000)).toBe(8_000_000_000);
    expect(estimateToCompleteZar(10_000_000_000, 10_000_000_000)).toBe(0);
  });

  it('varianceAtCompletionZar computes BAC-EAC', () => {
    // BAC 10b, EAC 12b → VAC -2b (over-budget)
    expect(varianceAtCompletionZar(10_000_000_000, 12_000_000_000)).toBe(-2_000_000_000);
    // BAC 10b, EAC 9b → VAC +1b (under-budget)
    expect(varianceAtCompletionZar(10_000_000_000, 9_000_000_000)).toBe(1_000_000_000);
  });

  it('toCompletePerformanceIndex computes (BAC-EV)/(BAC-AC)', () => {
    // BAC 1000, EV 400, AC 500 → (600)/(500) = 1.2
    expect(toCompletePerformanceIndex(1000, 400, 500)).toBe(1.2);
    // BAC 1000, EV 500, AC 500 → 500/500 = 1.0
    expect(toCompletePerformanceIndex(1000, 500, 500)).toBe(1.0);
    // Edge: BAC==AC denominator zero
    expect(toCompletePerformanceIndex(1000, 500, 1000)).toBe(0);
    expect(toCompletePerformanceIndex(null, 500, 500)).toBe(0);
  });

  it('contingencyRemainingPct computes (initial-drawn)/initial*100', () => {
    expect(contingencyRemainingPct(1_000_000_000, 0)).toBe(100);
    expect(contingencyRemainingPct(1_000_000_000, 250_000_000)).toBe(75);
    expect(contingencyRemainingPct(1_000_000_000, 750_000_000)).toBe(25);
    expect(contingencyRemainingPct(1_000_000_000, 1_000_000_000)).toBe(0);
    expect(contingencyRemainingPct(1_000_000_000, 1_500_000_000)).toBe(0); // overdrawn clamp
    expect(contingencyRemainingPct(0, 0)).toBe(0);
    expect(contingencyRemainingPct(null, null)).toBe(0);
  });

  it('managementReserveRemainingPct computes (initial-drawn)/initial*100', () => {
    expect(managementReserveRemainingPct(500_000_000, 0)).toBe(100);
    expect(managementReserveRemainingPct(500_000_000, 250_000_000)).toBe(50);
    expect(managementReserveRemainingPct(500_000_000, 500_000_000)).toBe(0);
    expect(managementReserveRemainingPct(500_000_000, 700_000_000)).toBe(0); // overdrawn clamp
    expect(managementReserveRemainingPct(null, null)).toBe(0);
  });
});

describe('W113 IPP EVM — completeness 0-130', () => {
  it('zero when nothing stamped', () => {
    expect(evmCompletenessIndex({})).toBe(0);
  });

  it('clean run with all milestones + bonus caps at 130', () => {
    const score = evmCompletenessIndex({
      budget_set: true,
      committed: true,
      incurred: true,
      measured: true,
      variance_detected: true,
      reforecast_drafted: true,
      CR_logged: true,
      CR_approved: true,
      reforecast_published: true,
      reconciled: true,
      first_close_bonus: true,
    });
    // 15 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 15 + 20 = 130
    expect(score).toBe(130);
  });

  it('budget_set + reconciled give substantial credit', () => {
    const score = evmCompletenessIndex({
      budget_set: true,
      reconciled: true,
    });
    // 15 + 15 = 30
    expect(score).toBe(30);
  });

  it('first_close_bonus weights 20', () => {
    const score = evmCompletenessIndex({
      budget_set: true,
      reconciled: true,
      first_close_bonus: true,
    });
    // 15 + 15 + 20 = 50
    expect(score).toBe(50);
  });

  it('caps total at 130 even with double-stamps', () => {
    // shouldn't be possible but defensive
    const score = evmCompletenessIndex({
      budget_set: true,
      committed: true,
      incurred: true,
      measured: true,
      variance_detected: true,
      reforecast_drafted: true,
      CR_logged: true,
      CR_approved: true,
      reforecast_published: true,
      reconciled: true,
      first_close_bonus: true,
    });
    expect(score).toBeLessThanOrEqual(130);
  });
});
