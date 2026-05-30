// Wave 112 — IPP WBS & Gantt Schedule Management spec test battery.
//
// Covers: state machine (forward path + branches + terminals + late
// finish), tier derivation + FLOOR-AT-LARGE + FLOOR-AT-MEGA, INVERTED
// SLA matrix, SIGNATURE regulator crossings (mark_late_finish EVERY
// tier when capacity_mw >= 1; cancel_schedule EVERY tier when capacity
// >= 1; rebaseline_schedule large+mega; suspend_schedule mega only with
// critical_path_breach), party routing, authority ladder + INVERTED
// filing window, urgency band (INVERTED polarity), 4-bridge
// architecture (W19/W20/W23/W25), LIVE battery (EVM CPI/SPI/SPI_t/SV/
// CV/SV%/CV%, critical-path-float, days-to-finish, late-finish-risk,
// rebaseline-imminent, schedule-health-band, completeness 0-130).

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
  tierForCapacity,
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
  bridgesToProcurementChain,
  bridgesToCodChain,
  bridgesToInsuranceClaimChain,
  bridgesToHseIncidentChain,
  costPerformanceIndex,
  schedulePerformanceIndex,
  schedulePerformanceIndexT,
  scheduleVarianceZar,
  costVarianceZar,
  scheduleVariancePct,
  costVariancePct,
  criticalPathFloatDays,
  daysToPlannedFinish,
  daysSinceBaseline,
  isLateFinishRisk,
  isRebaselineImminent,
  scheduleHealthBand,
  scheduleCompletenessIndex,
} from '../src/utils/ipp-schedule-spec';

describe('W112 IPP Schedule — state machine', () => {
  it('walks the forward path', () => {
    expect(nextStatus('wbs_drafted', 'set_baseline')).toBe('baseline_set');
    expect(nextStatus('baseline_set', 'start_execution')).toBe('in_progress');
    expect(nextStatus('in_progress', 'update_progress')).toBe('status_updated');
    expect(nextStatus('status_updated', 'detect_variance')).toBe('variance_detected');
    expect(nextStatus('variance_detected', 'assess_impact')).toBe('impact_assessed');
    expect(nextStatus('impact_assessed', 'rebaseline_schedule')).toBe('rebaselined');
    expect(nextStatus('rebaselined', 'mark_recovered')).toBe('recovered');
    expect(nextStatus('recovered', 'mark_completed')).toBe('completed');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('wbs_drafted', 'start_execution')).toBeNull();
    expect(nextStatus('baseline_set', 'detect_variance')).toBeNull();
    expect(nextStatus('in_progress', 'rebaseline_schedule')).toBeNull();
    expect(nextStatus('completed', 'update_progress')).toBeNull();
    expect(nextStatus('cancelled', 'resume_schedule')).toBeNull();
    expect(nextStatus('late_finish', 'mark_completed')).toBeNull();
  });

  it('allows recovery via propose+recovered path', () => {
    expect(nextStatus('impact_assessed', 'propose_recovery')).toBe('impact_assessed');
    expect(nextStatus('impact_assessed', 'mark_recovered')).toBe('recovered');
  });

  it('supports suspend / resume loop', () => {
    expect(nextStatus('in_progress', 'suspend_schedule')).toBe('suspended');
    expect(nextStatus('status_updated', 'suspend_schedule')).toBe('suspended');
    expect(nextStatus('rebaselined', 'suspend_schedule')).toBe('suspended');
    expect(nextStatus('recovered', 'suspend_schedule')).toBe('suspended');
    expect(nextStatus('suspended', 'resume_schedule')).toBe('in_progress');
  });

  it('supports rebaseline approve/reject from rebaselined', () => {
    expect(nextStatus('rebaselined', 'approve_rebaseline')).toBe('rebaselined');
    expect(nextStatus('rebaselined', 'reject_rebaseline')).toBe('impact_assessed');
  });

  it('allows cancel_schedule from any non-terminal state', () => {
    expect(nextStatus('wbs_drafted', 'cancel_schedule')).toBe('cancelled');
    expect(nextStatus('in_progress', 'cancel_schedule')).toBe('cancelled');
    expect(nextStatus('rebaselined', 'cancel_schedule')).toBe('cancelled');
    expect(nextStatus('suspended', 'cancel_schedule')).toBe('cancelled');
    expect(nextStatus('completed', 'cancel_schedule')).toBeNull();
  });

  it('allows mark_late_finish only from execution states', () => {
    expect(nextStatus('in_progress', 'mark_late_finish')).toBe('late_finish');
    expect(nextStatus('status_updated', 'mark_late_finish')).toBe('late_finish');
    expect(nextStatus('variance_detected', 'mark_late_finish')).toBe('late_finish');
    expect(nextStatus('impact_assessed', 'mark_late_finish')).toBe('late_finish');
    expect(nextStatus('wbs_drafted', 'mark_late_finish')).toBeNull();
    expect(nextStatus('baseline_set', 'mark_late_finish')).toBeNull();
    expect(nextStatus('recovered', 'mark_late_finish')).toBeNull();
  });

  it('identifies hard terminals correctly', () => {
    expect(isHardTerminal('completed')).toBe(true);
    expect(isHardTerminal('cancelled')).toBe(true);
    expect(isHardTerminal('late_finish')).toBe(true);
    expect(isHardTerminal('suspended')).toBe(false);
    expect(isHardTerminal('rebaselined')).toBe(false);
  });

  it('identifies UI terminals correctly', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('late_finish')).toBe(true);
    expect(isTerminal('suspended')).toBe(false);
  });

  it('allowedActions covers expected transitions', () => {
    const a = allowedActions('impact_assessed');
    expect(a).toContain('rebaseline_schedule');
    expect(a).toContain('propose_recovery');
    expect(a).toContain('mark_recovered');
    expect(a).toContain('mark_late_finish');
    expect(a).toContain('suspend_schedule');
    expect(a).toContain('cancel_schedule');
    expect(a).not.toContain('draft_wbs');
  });

  it('allowedActions returns empty for hard terminals', () => {
    expect(allowedActions('completed')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
    expect(allowedActions('late_finish')).toEqual([]);
  });

  it('TRANSITIONS table covers all 16 actions', () => {
    const actions = Object.keys(TRANSITIONS);
    expect(actions).toHaveLength(16);
  });
});

describe('W112 IPP Schedule — tier derivation + FLOOR overlays', () => {
  it('derives tier from project_capacity_mw', () => {
    expect(tierForCapacity(0)).toBe('small');
    expect(tierForCapacity(5)).toBe('small');
    expect(tierForCapacity(9.9)).toBe('small');
    expect(tierForCapacity(10)).toBe('medium');
    expect(tierForCapacity(25)).toBe('medium');
    expect(tierForCapacity(49.9)).toBe('medium');
    expect(tierForCapacity(50)).toBe('large');
    expect(tierForCapacity(100)).toBe('large');
    expect(tierForCapacity(199.9)).toBe('large');
    expect(tierForCapacity(200)).toBe('mega');
    expect(tierForCapacity(500)).toBe('mega');
  });

  it('handles invalid capacity values', () => {
    expect(tierForCapacity(null)).toBe('small');
    expect(tierForCapacity(undefined)).toBe('small');
    expect(tierForCapacity(-10)).toBe('small');
    expect(tierForCapacity(NaN)).toBe('small');
  });

  it('counts floor flags accurately', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ critical_path_breach: true })).toBe(1);
    expect(countFloorFlags({
      critical_path_breach: true,
      resource_constrained_over_pct_25: true,
    })).toBe(2);
    expect(countFloorFlags({
      critical_path_breach: 1,
      weather_window_at_risk: 1,
      community_disruption_threshold_breached: 1,
    })).toBe(3);
    expect(countFloorFlags({
      critical_path_breach: true,
      resource_constrained_over_pct_25: true,
      weather_window_at_risk: true,
      community_disruption_threshold_breached: true,
      EPC_subcontractor_milestone_at_risk: true,
    })).toBe(5);
  });

  it('FLOOR-AT-LARGE on any one flag', () => {
    expect(floorAtLarge({})).toBe(false);
    expect(floorAtLarge({ weather_window_at_risk: true })).toBe(true);
    expect(floorAtLarge({ EPC_subcontractor_milestone_at_risk: 1 })).toBe(true);
  });

  it('FLOOR-AT-MEGA on 2+ flags OR critical_path_breach alone', () => {
    expect(floorAtMega({})).toBe(false);
    expect(floorAtMega({ weather_window_at_risk: true })).toBe(false);
    expect(floorAtMega({ critical_path_breach: true })).toBe(true);
    expect(floorAtMega({
      weather_window_at_risk: true,
      EPC_subcontractor_milestone_at_risk: true,
    })).toBe(true);
  });

  it('effectiveTier elevates small/medium to large on 1 flag', () => {
    expect(effectiveTier('small', { weather_window_at_risk: true })).toBe('large');
    expect(effectiveTier('medium', { EPC_subcontractor_milestone_at_risk: true })).toBe('large');
    expect(effectiveTier('large', { resource_constrained_over_pct_25: true })).toBe('large');
  });

  it('effectiveTier elevates anything to mega on critical_path_breach', () => {
    expect(effectiveTier('small', { critical_path_breach: true })).toBe('mega');
    expect(effectiveTier('medium', { critical_path_breach: true })).toBe('mega');
    expect(effectiveTier('large', { critical_path_breach: true })).toBe('mega');
    expect(effectiveTier('mega', { critical_path_breach: true })).toBe('mega');
  });

  it('effectiveTier elevates to mega on 2+ flags', () => {
    expect(effectiveTier('small', {
      weather_window_at_risk: true,
      community_disruption_threshold_breached: true,
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

describe('W112 IPP Schedule — INVERTED SLA matrix', () => {
  it('anchor SLA on variance_detected is INVERTED (mega longest)', () => {
    expect(slaWindowHours('variance_detected', 'small')).toBe(120);   // 5 days
    expect(slaWindowHours('variance_detected', 'medium')).toBe(240);  // 10 days
    expect(slaWindowHours('variance_detected', 'large')).toBe(480);   // 20 days
    expect(slaWindowHours('variance_detected', 'mega')).toBe(720);    // 30 days
  });

  it('all non-terminal states have INVERTED windows (mega >= small)', () => {
    for (const status of Object.keys(SLA_HOURS)) {
      const matrix = SLA_HOURS[status as keyof typeof SLA_HOURS];
      // Skip hard terminals which have 0 SLA.
      if (matrix.small === 0 && matrix.medium === 0 && matrix.large === 0 && matrix.mega === 0) continue;
      expect(matrix.mega).toBeGreaterThanOrEqual(matrix.large);
      expect(matrix.large).toBeGreaterThanOrEqual(matrix.medium);
      expect(matrix.medium).toBeGreaterThanOrEqual(matrix.small);
    }
  });

  it('terminal states have zero SLA', () => {
    expect(slaWindowHours('completed', 'mega')).toBe(0);
    expect(slaWindowHours('cancelled', 'mega')).toBe(0);
    expect(slaWindowHours('late_finish', 'mega')).toBe(0);
  });

  it('slaDeadlineFor computes correct deadline', () => {
    const t0 = new Date('2026-05-30T10:00:00Z');
    const deadline = slaDeadlineFor('variance_detected', 'mega', t0);
    expect(deadline).not.toBeNull();
    // 720 hours = 30 days
    expect(deadline!.getTime() - t0.getTime()).toBe(720 * 3600 * 1000);
  });

  it('slaDeadlineFor returns null for terminal status', () => {
    const t0 = new Date('2026-05-30T10:00:00Z');
    expect(slaDeadlineFor('completed', 'mega', t0)).toBeNull();
  });

  it('slaHoursRemaining returns 0 for null entry', () => {
    const now = new Date('2026-05-30T10:00:00Z');
    expect(slaHoursRemaining('variance_detected', 'small', null, now)).toBe(0);
  });

  it('slaHoursRemaining counts correctly', () => {
    const enteredAt = new Date('2026-05-30T10:00:00Z');
    const now = new Date('2026-05-31T10:00:00Z'); // 24h elapsed
    const remaining = slaHoursRemaining('variance_detected', 'small', enteredAt, now);
    // 120 - 24 = 96
    expect(remaining).toBe(96);
  });
});

describe('W112 IPP Schedule — SIGNATURE regulator crossings', () => {
  it('W112 SIGNATURE: mark_late_finish crosses EVERY tier when capacity_mw >= 1', () => {
    for (const tier of ['small', 'medium', 'large', 'mega'] as const) {
      expect(crossesIntoRegulator('mark_late_finish', tier, {
        project_capacity_mw: 1,
      })).toBe(true);
      expect(crossesIntoRegulator('mark_late_finish', tier, {
        project_capacity_mw: 50,
      })).toBe(true);
      expect(crossesIntoRegulator('mark_late_finish', tier, {
        project_capacity_mw: 500,
      })).toBe(true);
    }
  });

  it('mark_late_finish does NOT cross under 1 MW (rooftop scale)', () => {
    expect(crossesIntoRegulator('mark_late_finish', 'small', {
      project_capacity_mw: 0.5,
    })).toBe(false);
    expect(crossesIntoRegulator('mark_late_finish', 'small', {
      project_capacity_mw: 0,
    })).toBe(false);
  });

  it('cancel_schedule crosses EVERY tier when capacity_mw >= 1', () => {
    expect(crossesIntoRegulator('cancel_schedule', 'small', {
      project_capacity_mw: 5,
    })).toBe(true);
    expect(crossesIntoRegulator('cancel_schedule', 'mega', {
      project_capacity_mw: 300,
    })).toBe(true);
  });

  it('rebaseline_schedule crosses large + mega only', () => {
    expect(crossesIntoRegulator('rebaseline_schedule', 'small', { project_capacity_mw: 5 })).toBe(false);
    expect(crossesIntoRegulator('rebaseline_schedule', 'medium', { project_capacity_mw: 25 })).toBe(false);
    expect(crossesIntoRegulator('rebaseline_schedule', 'large', { project_capacity_mw: 100 })).toBe(true);
    expect(crossesIntoRegulator('rebaseline_schedule', 'mega', { project_capacity_mw: 300 })).toBe(true);
  });

  it('suspend_schedule crosses mega only when critical_path_breach', () => {
    expect(crossesIntoRegulator('suspend_schedule', 'mega', {
      project_capacity_mw: 300,
      critical_path_breach: true,
    })).toBe(true);
    expect(crossesIntoRegulator('suspend_schedule', 'mega', {
      project_capacity_mw: 300,
      critical_path_breach: false,
    })).toBe(false);
    expect(crossesIntoRegulator('suspend_schedule', 'large', {
      project_capacity_mw: 100,
      critical_path_breach: true,
    })).toBe(false);
  });

  it('routine transitions do not cross regulator', () => {
    expect(crossesIntoRegulator('update_progress', 'mega', { project_capacity_mw: 300 })).toBe(false);
    expect(crossesIntoRegulator('detect_variance', 'large', { project_capacity_mw: 100 })).toBe(false);
    expect(crossesIntoRegulator('mark_completed', 'mega', { project_capacity_mw: 300 })).toBe(false);
    expect(crossesIntoRegulator('start_execution', 'large', { project_capacity_mw: 100 })).toBe(false);
  });

  it('slaBreachCrossesIntoRegulator covers large + mega', () => {
    expect(slaBreachCrossesIntoRegulator('small')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('medium')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('large')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('mega')).toBe(true);
  });
});

describe('W112 IPP Schedule — party routing + event names', () => {
  it('routes actions to correct parties', () => {
    expect(partyForAction('draft_wbs')).toBe('scheduler');
    expect(partyForAction('set_baseline')).toBe('scheduler');
    expect(partyForAction('update_progress')).toBe('scheduler');
    expect(partyForAction('detect_variance')).toBe('scheduler');
    expect(partyForAction('start_execution')).toBe('project_manager');
    expect(partyForAction('assess_impact')).toBe('project_manager');
    expect(partyForAction('propose_recovery')).toBe('project_manager');
    expect(partyForAction('mark_recovered')).toBe('project_manager');
    expect(partyForAction('mark_completed')).toBe('project_manager');
    expect(partyForAction('mark_late_finish')).toBe('project_manager');
    expect(partyForAction('suspend_schedule')).toBe('project_manager');
    expect(partyForAction('resume_schedule')).toBe('project_manager');
    expect(partyForAction('rebaseline_schedule')).toBe('portfolio_director');
    expect(partyForAction('cancel_schedule')).toBe('portfolio_director');
    expect(partyForAction('approve_rebaseline')).toBe('IPP_CEO');
    expect(partyForAction('reject_rebaseline')).toBe('IPP_CEO');
  });

  it('event types match action names with ipp_schedule_ prefix', () => {
    expect(eventTypeFor('draft_wbs')).toBe('ipp_schedule_wbs_drafted');
    expect(eventTypeFor('set_baseline')).toBe('ipp_schedule_baseline_set');
    expect(eventTypeFor('mark_late_finish')).toBe('ipp_schedule_late_finish_marked');
    expect(eventTypeFor('rebaseline_schedule')).toBe('ipp_schedule_rebaselined');
    expect(eventTypeFor('cancel_schedule')).toBe('ipp_schedule_cancelled');
    expect(eventTypeFor('approve_rebaseline')).toBe('ipp_schedule_rebaseline_approved');
  });
});

describe('W112 IPP Schedule — authority ladder + INVERTED filing window', () => {
  it('authorityRequired ladder is 4-step', () => {
    expect(authorityRequired('small')).toBe('scheduler');
    expect(authorityRequired('medium')).toBe('project_manager');
    expect(authorityRequired('large')).toBe('portfolio_director');
    expect(authorityRequired('mega')).toBe('IPP_CEO');
  });

  it('regulator filing window is INVERTED (mega longest)', () => {
    expect(regulatorFilingWindowHours('small')).toBe(24);
    expect(regulatorFilingWindowHours('medium')).toBe(48);
    expect(regulatorFilingWindowHours('large')).toBe(72);
    expect(regulatorFilingWindowHours('mega')).toBe(168);
  });
});

describe('W112 IPP Schedule — urgency band INVERTED polarity', () => {
  it('negative hours always critical', () => {
    expect(urgencyBand('small', -1)).toBe('critical');
    expect(urgencyBand('mega', -100)).toBe('critical');
  });

  it('small tier has TIGHTEST urgency thresholds', () => {
    expect(urgencyBand('small', 5)).toBe('critical');
    expect(urgencyBand('small', 20)).toBe('high');
    expect(urgencyBand('small', 60)).toBe('medium');
    expect(urgencyBand('small', 100)).toBe('low');
  });

  it('mega tier has LOOSEST urgency thresholds', () => {
    expect(urgencyBand('mega', 50)).toBe('critical');
    expect(urgencyBand('mega', 100)).toBe('high');
    expect(urgencyBand('mega', 300)).toBe('medium');
    expect(urgencyBand('mega', 500)).toBe('low');
  });

  it('thresholds scale up across tiers (INVERTED)', () => {
    // 72 hours: low for small (well past), medium for medium (at
    // boundary), medium for large, critical for mega.
    expect(urgencyBand('small', 72)).toBe('low');
    expect(urgencyBand('medium', 72)).toBe('medium');
    expect(urgencyBand('large', 72)).toBe('high');
    expect(urgencyBand('mega', 71)).toBe('critical');
  });
});

describe('W112 IPP Schedule — 4-bridge architecture', () => {
  it('bridges to W19 procurement chain when ref present', () => {
    expect(bridgesToProcurementChain('proc-001')).toBe(true);
    expect(bridgesToProcurementChain(null)).toBe(false);
    expect(bridgesToProcurementChain('')).toBe(false);
  });

  it('bridges to W20 COD chain when ref present', () => {
    expect(bridgesToCodChain('cod-001')).toBe(true);
    expect(bridgesToCodChain(undefined)).toBe(false);
  });

  it('bridges to W23 insurance claim chain when ref present', () => {
    expect(bridgesToInsuranceClaimChain('inscl-001')).toBe(true);
    expect(bridgesToInsuranceClaimChain(null)).toBe(false);
  });

  it('bridges to W25 HSE incident chain when ref present', () => {
    expect(bridgesToHseIncidentChain('hse-001')).toBe(true);
    expect(bridgesToHseIncidentChain(null)).toBe(false);
  });
});

describe('W112 IPP Schedule — LIVE battery EVM helpers', () => {
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

  it('schedulePerformanceIndexT computes ES/AT', () => {
    expect(schedulePerformanceIndexT(90, 100)).toBe(0.9);
    expect(schedulePerformanceIndexT(110, 100)).toBe(1.1);
    expect(schedulePerformanceIndexT(0, 100)).toBe(0);
    expect(schedulePerformanceIndexT(50, 0)).toBe(0);
  });

  it('scheduleVarianceZar computes EV-PV', () => {
    expect(scheduleVarianceZar(900, 1000)).toBe(-100);
    expect(scheduleVarianceZar(1100, 1000)).toBe(100);
  });

  it('costVarianceZar computes EV-AC', () => {
    expect(costVarianceZar(900, 1000)).toBe(-100);
    expect(costVarianceZar(1100, 1000)).toBe(100);
  });

  it('scheduleVariancePct computes (EV-PV)/PV*100', () => {
    expect(scheduleVariancePct(900, 1000)).toBe(-10);
    expect(scheduleVariancePct(1100, 1000)).toBe(10);
    expect(scheduleVariancePct(500, 0)).toBe(0);
  });

  it('costVariancePct computes (EV-AC)/EV*100', () => {
    expect(costVariancePct(1000, 900)).toBe(10);
    expect(costVariancePct(1000, 1100)).toBe(-10);
    expect(costVariancePct(0, 100)).toBe(0);
  });

  it('criticalPathFloatDays rounds correctly', () => {
    expect(criticalPathFloatDays(0)).toBe(0);
    expect(criticalPathFloatDays(5.7)).toBe(6);
    expect(criticalPathFloatDays(-3)).toBe(-3);
    expect(criticalPathFloatDays(null)).toBe(0);
  });

  it('daysToPlannedFinish counts forward / backward', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const future = '2026-06-30T00:00:00Z';
    const past = '2026-04-30T00:00:00Z';
    expect(daysToPlannedFinish(future, now)).toBe(31);
    expect(daysToPlannedFinish(past, now)).toBe(-30);
    expect(daysToPlannedFinish(null, now)).toBeNull();
    expect(daysToPlannedFinish('not-a-date', now)).toBeNull();
  });

  it('daysSinceBaseline counts forward only', () => {
    const baseline = '2026-05-01T00:00:00Z';
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysSinceBaseline(baseline, now)).toBe(29);
    expect(daysSinceBaseline(null, now)).toBe(0);
    expect(daysSinceBaseline('2026-06-30T00:00:00Z', now)).toBe(0);
  });

  it('isLateFinishRisk fires within 7d AND SPI<0.9', () => {
    expect(isLateFinishRisk('in_progress', 5, 0.85)).toBe(true);
    expect(isLateFinishRisk('status_updated', 7, 0.7)).toBe(true);
    // SPI >= 0.9 does not fire
    expect(isLateFinishRisk('in_progress', 5, 0.95)).toBe(false);
    // beyond 7 days does not fire
    expect(isLateFinishRisk('in_progress', 14, 0.5)).toBe(false);
    // terminal states do not fire
    expect(isLateFinishRisk('completed', 5, 0.5)).toBe(false);
    expect(isLateFinishRisk('cancelled', 5, 0.5)).toBe(false);
    // null daysToFinish does not fire
    expect(isLateFinishRisk('in_progress', null, 0.5)).toBe(false);
  });

  it('isRebaselineImminent fires only in impact_assessed AND SPI<0.8 AND CPI<0.85', () => {
    expect(isRebaselineImminent('impact_assessed', 0.7, 0.8)).toBe(true);
    expect(isRebaselineImminent('impact_assessed', 0.75, 0.5)).toBe(true);
    // SPI >= 0.8 does not fire
    expect(isRebaselineImminent('impact_assessed', 0.85, 0.5)).toBe(false);
    // CPI >= 0.85 does not fire
    expect(isRebaselineImminent('impact_assessed', 0.5, 0.9)).toBe(false);
    // other states do not fire
    expect(isRebaselineImminent('variance_detected', 0.5, 0.5)).toBe(false);
    expect(isRebaselineImminent('in_progress', 0.5, 0.5)).toBe(false);
    // zero SPI/CPI does not fire (means uninitialised)
    expect(isRebaselineImminent('impact_assessed', 0, 0.5)).toBe(false);
    expect(isRebaselineImminent('impact_assessed', 0.5, 0)).toBe(false);
  });
});

describe('W112 IPP Schedule — health band', () => {
  it('green when SPI/CPI/float all healthy', () => {
    expect(scheduleHealthBand(1.05, 1.02, 15)).toBe('green');
    expect(scheduleHealthBand(1.0, 1.0, 30)).toBe('green');
  });

  it('amber when one metric slips moderately', () => {
    expect(scheduleHealthBand(0.93, 1.0, 30)).toBe('amber');
    expect(scheduleHealthBand(1.0, 0.93, 30)).toBe('amber');
    expect(scheduleHealthBand(1.0, 1.0, 5)).toBe('amber');
  });

  it('red when one metric slips badly', () => {
    expect(scheduleHealthBand(0.8, 1.0, 30)).toBe('red');
    expect(scheduleHealthBand(1.0, 0.8, 30)).toBe('red');
    expect(scheduleHealthBand(1.0, 1.0, 1)).toBe('red');
  });

  it('critical when negative float or catastrophic indices', () => {
    expect(scheduleHealthBand(1.0, 1.0, -1)).toBe('critical');
    expect(scheduleHealthBand(0.6, 1.0, 30)).toBe('critical');
    expect(scheduleHealthBand(1.0, 0.6, 30)).toBe('critical');
  });
});

describe('W112 IPP Schedule — completeness 0-130', () => {
  it('zero when nothing stamped', () => {
    expect(scheduleCompletenessIndex({})).toBe(0);
  });

  it('clean run with all bonuses caps at 130', () => {
    const score = scheduleCompletenessIndex({
      wbs_drafted: true,
      baseline_set: true,
      in_progress: true,
      status_updated: true,
      variance_detected: true,
      impact_assessed: true,
      rebaselined: true,
      recovered: true,
      completed: true,
      clean_no_variance_bonus: true,
      clean_no_rebaseline_bonus: true,
      clean_no_suspend_bonus: true,
      on_time_finish_bonus: true,
      cpi_above_1_bonus: true,
      spi_above_1_bonus: true,
    });
    expect(score).toBe(130);
  });

  it('baseline + completed give substantial credit', () => {
    const score = scheduleCompletenessIndex({
      baseline_set: true,
      completed: true,
    });
    // 15 + 15 = 30
    expect(score).toBe(30);
  });

  it('on-time finish bonus weights highly', () => {
    const score = scheduleCompletenessIndex({
      wbs_drafted: true,
      baseline_set: true,
      completed: true,
      on_time_finish_bonus: true,
    });
    // 10 + 15 + 15 + 10 = 50
    expect(score).toBe(50);
  });
});
