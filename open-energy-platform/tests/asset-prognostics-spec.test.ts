import { describe, expect, it } from 'vitest';
import {
  // Part A — predictive engine
  expectedAcKw, performanceRatio, mean, stddev, zScore,
  ewmaAnomaly, iqrOutlier, persistenceRatio, fleetPercentile,
  detectAnomalyEnsemble, degradationTrend, remainingUsefulLife,
  classifyFailureMode, isSafetyFaultMode, revenueAtRiskZar,
  savingsLedger, healthScore,
  // Part B — prognostic lifecycle
  TRANSITIONS, SLA_MINUTES,
  isTerminal, isDismissable, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForRevenue, safetyFloor, prognosticTier,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isHighTier, isReportable,
  type PrognosticStatus, type PrognosticTier, type PrognosticAction,
} from '../src/utils/asset-prognostics-spec';

// ===========================================================================
// PART A — PREDICTIVE ENGINE
// ===========================================================================

describe('W71 engine — physics expected-power model', () => {
  it('returns rated power at STC (1000 W/m², 25°C)', () => {
    expect(expectedAcKw({ irradianceWm2: 1000, cellTempC: 25, ratedKw: 100 })).toBeCloseTo(100, 5);
  });

  it('scales linearly with irradiance', () => {
    expect(expectedAcKw({ irradianceWm2: 500, cellTempC: 25, ratedKw: 100 })).toBeCloseTo(50, 5);
  });

  it('derates for cell temperature above 25°C (negative temp coefficient)', () => {
    // 1000 W/m², 45°C → 1 + (-0.004)*(20) = 0.92 factor
    expect(expectedAcKw({ irradianceWm2: 1000, cellTempC: 45, ratedKw: 100 })).toBeCloseTo(92, 5);
  });

  it('gains for cell temperature below 25°C (below the rated clamp)', () => {
    // 800 W/m², 15°C → 100 * 0.8 * (1 + (-0.004)*(-10)) = 100 * 0.8 * 1.04 = 83.2
    expect(expectedAcKw({ irradianceWm2: 800, cellTempC: 15, ratedKw: 100 })).toBeCloseTo(83.2, 5);
  });

  it('clamps output to rated capacity (no over-production)', () => {
    expect(expectedAcKw({ irradianceWm2: 1400, cellTempC: 10, ratedKw: 100 })).toBe(100);
  });

  it('returns 0 for zero/negative irradiance or rating', () => {
    expect(expectedAcKw({ irradianceWm2: 0, cellTempC: 25, ratedKw: 100 })).toBe(0);
    expect(expectedAcKw({ irradianceWm2: 500, cellTempC: 25, ratedKw: 0 })).toBe(0);
  });
});

describe('W71 engine — Performance Ratio (IEC 61724)', () => {
  it('PR = 1.0 when actual equals theoretical STC yield', () => {
    // ref = ratedKw * (poa / 1) ; poa 5 kWh/m², rated 100 → ref 500 kWh
    expect(performanceRatio(500, 5, 100)).toBeCloseTo(1.0, 5);
  });

  it('healthy plant PR is below 1 (losses)', () => {
    expect(performanceRatio(410, 5, 100)).toBeCloseTo(0.82, 5);
  });

  it('returns 0 for non-positive reference insolation', () => {
    expect(performanceRatio(400, 0, 100)).toBe(0);
  });

  it('never returns negative', () => {
    expect(performanceRatio(-10, 5, 100)).toBe(0);
  });
});

describe('W71 engine — statistics helpers', () => {
  it('mean / stddev', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(stddev([2, 4, 6])).toBeCloseTo(2, 5);
    expect(stddev([5])).toBe(0);
    expect(mean([])).toBe(0);
  });

  it('zScore', () => {
    expect(zScore(10, 4, 2)).toBe(3);
    expect(zScore(10, 4, 0)).toBe(0);
  });
});

describe('W71 engine — EWMA control chart', () => {
  it('a stable series stays in control', () => {
    const r = ewmaAnomaly([0.82, 0.81, 0.83, 0.82, 0.82, 0.81]);
    expect(r.inControl).toBe(true);
    expect(r.score).toBeLessThan(1);
  });

  it('a downward shift breaches the lower control limit (baseline-calibrated)', () => {
    // healthy baseline (first 6) then a sustained drop; calibrate on the baseline
    const r = ewmaAnomaly([0.82, 0.81, 0.83, 0.82, 0.81, 0.82, 0.70, 0.62, 0.55, 0.50], 0.3, 3, 6);
    expect(r.ewma).toBeLessThan(r.lcl);
    expect(r.inControl).toBe(false);
    expect(r.score).toBeGreaterThan(1);
  });

  it('empty series is a no-op', () => {
    expect(ewmaAnomaly([])).toEqual({ ewma: 0, ucl: 0, lcl: 0, inControl: true, score: 0 });
  });
});

describe('W71 engine — IQR / persistence / fleet percentile', () => {
  it('iqrOutlier flags a value beyond the Tukey fence', () => {
    const hist = [10, 11, 9, 10, 12, 11, 10, 9];
    expect(iqrOutlier(hist, 30)).toBe(true);
    expect(iqrOutlier(hist, 11)).toBe(false);
  });

  it('iqrOutlier needs at least 4 points', () => {
    expect(iqrOutlier([1, 2, 3], 100)).toBe(false);
  });

  it('persistenceRatio is the fraction of flags set', () => {
    expect(persistenceRatio([true, true, false, false])).toBe(0.5);
    expect(persistenceRatio([])).toBe(0);
  });

  it('fleetPercentile ranks a value among peers', () => {
    expect(fleetPercentile(5, [1, 2, 3, 4])).toBe(1); // above all
    expect(fleetPercentile(0, [1, 2, 3, 4])).toBe(0); // below all
    expect(fleetPercentile(7, [])).toBe(0.5); // no peers → neutral
  });
});

describe('W71 engine — anomaly ENSEMBLE (the NTT-beating multi-method)', () => {
  it('a clean stable series triggers no methods, low confidence', () => {
    const r = detectAnomalyEnsemble({
      series: [0.82, 0.81, 0.83, 0.82, 0.82, 0.81, 0.82],
      latest: 0.82,
    });
    expect(r.methodsTriggered.length).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('a clear degradation lights up multiple methods with high confidence', () => {
    const r = detectAnomalyEnsemble({
      series: [0.82, 0.82, 0.82, 0.82, 0.81, 0.70, 0.60, 0.50],
      latest: 0.45,
      faultFlags: [false, false, true, true, true, true],
      peerLatest: [0.82, 0.81, 0.83, 0.80],
      degradeDirection: 'down',
    });
    expect(r.methodsTriggered.length).toBeGreaterThanOrEqual(3);
    expect(r.confidence).toBeGreaterThan(0.4);
    expect(r.score).toBeGreaterThan(0.3);
  });

  it('handles an upward-degrading metric (e.g. temperature)', () => {
    const r = detectAnomalyEnsemble({
      series: [40, 41, 40, 42, 41, 55, 62, 70],
      latest: 78,
      peerLatest: [41, 40, 42, 39],
      degradeDirection: 'up',
    });
    expect(r.methodsTriggered).toContain('fleet_percentile');
    expect(r.confidence).toBeGreaterThan(0);
  });
});

describe('W71 engine — degradation trend & RUL', () => {
  it('detects a degrading downward series', () => {
    const t = degradationTrend([0.85, 0.83, 0.81, 0.79, 0.77], 'down');
    expect(t.slopePerDay).toBeLessThan(0);
    expect(t.rSquared).toBeGreaterThan(0.9);
    expect(t.direction).toBe('degrading');
  });

  it('a flat series is stable', () => {
    expect(degradationTrend([0.82, 0.82, 0.82, 0.82]).direction).toBe('stable');
  });

  it('RUL projects the trend to the failure threshold', () => {
    // value 0.80, losing 0.01/day, fails at 0.70 → ~10 days
    const r = remainingUsefulLife(0.80, -0.01, 0.70, 0.9, 'down');
    expect(r.basis).toBe('trend');
    expect(r.rulDays).toBe(10);
  });

  it('already-failed asset has RUL 0', () => {
    const r = remainingUsefulLife(0.68, -0.01, 0.70, 0.9, 'down');
    expect(r.basis).toBe('already_failed');
    expect(r.rulDays).toBe(0);
  });

  it('stable/improving asset gets the capped RUL', () => {
    const r = remainingUsefulLife(0.82, 0, 0.70, 0.5, 'down');
    expect(r.basis).toBe('stable');
    expect(r.rulDays).toBe(3650);
  });
});

describe('W71 engine — explainable failure-mode fingerprinting', () => {
  it('a tripped arc-fault detector ranks dc_arc_fault top with evidence + safety flag', () => {
    const ranked = classifyFailureMode({ dcArcFlag: true });
    expect(ranked[0].mode).toBe('dc_arc_fault');
    expect(ranked[0].safety).toBe(true);
    expect(ranked[0].evidence.length).toBeGreaterThan(0);
  });

  it('high soiling loss points at panel_soiling', () => {
    const ranked = classifyFailureMode({ soilingLossPct: 6 });
    expect(ranked.some((r) => r.mode === 'panel_soiling')).toBe(true);
  });

  it('comms gaps point at inverter_comms_loss', () => {
    const ranked = classifyFailureMode({ commsGapRatio: 0.5 });
    expect(ranked[0].mode).toBe('inverter_comms_loss');
  });

  it('severe BESS cell imbalance escalates to thermal_runaway (safety)', () => {
    const ranked = classifyFailureMode({ cellImbalancePct: 7 });
    expect(ranked[0].mode).toBe('battery_thermal_runaway');
    expect(ranked[0].safety).toBe(true);
  });

  it('mild BESS cell imbalance is the non-safety cell_imbalance mode', () => {
    const ranked = classifyFailureMode({ cellImbalancePct: 3 });
    expect(ranked[0].mode).toBe('battery_cell_imbalance');
    expect(ranked[0].safety).toBe(false);
  });

  it('no symptoms → empty ranking', () => {
    expect(classifyFailureMode({})).toEqual([]);
  });

  it('isSafetyFaultMode classifies the fire/arc/thermal modes', () => {
    expect(isSafetyFaultMode('dc_arc_fault')).toBe(true);
    expect(isSafetyFaultMode('transformer_thermal')).toBe(true);
    expect(isSafetyFaultMode('panel_hotspot')).toBe(true);
    expect(isSafetyFaultMode('panel_soiling')).toBe(false);
    expect(isSafetyFaultMode('inverter_comms_loss')).toBe(false);
  });
});

describe('W71 engine — revenue-at-risk & O&M savings ledger vs NTT benchmark', () => {
  it('revenueAtRiskZar prices lost generation at the tariff over the horizon', () => {
    // 1000 kWh/day lost, 30 days, R1200/MWh → 30 MWh * 1200 = 36000
    expect(revenueAtRiskZar(1000, 1200, 30)).toBe(36000);
  });

  it('caps the horizon at 365 days', () => {
    const capped = revenueAtRiskZar(1000, 1200, 9999);
    const year = revenueAtRiskZar(1000, 1200, 365);
    expect(capped).toBe(year);
  });

  it('zero for non-positive inputs', () => {
    expect(revenueAtRiskZar(0, 1200, 30)).toBe(0);
    expect(revenueAtRiskZar(1000, 0, 30)).toBe(0);
  });

  it('savingsLedger computes savings AND the incremental advantage over the NTT benchmark', () => {
    const led = savingsLedger({
      revenueAtRiskZar: 200000,
      emergencyRepairZar: 100000,
      plannedRepairZar: 40000,
      rulDays: 45,
    });
    expect(led.reactiveCostZar).toBe(300000);
    expect(led.predictiveCostZar).toBe(40000);
    expect(led.savingsZar).toBe(260000);
    expect(led.savingsPct).toBeCloseTo(260000 / 300000, 5);
    // NTT/industry benchmark is 30% → 90000; we save far more
    expect(led.benchmarkSavingsZar).toBe(90000);
    expect(led.incrementalVsBenchmarkZar).toBe(170000);
    expect(led.leadTimeDays).toBe(45);
  });

  it('our savings percentage beats the 30% benchmark in the typical case', () => {
    const led = savingsLedger({
      revenueAtRiskZar: 200000,
      emergencyRepairZar: 100000,
      plannedRepairZar: 40000,
      rulDays: 45,
    });
    expect(led.savingsPct).toBeGreaterThan(0.45); // beat-by target ≥45%
  });
});

describe('W71 engine — composite health score', () => {
  it('a nominal asset scores near 100', () => {
    expect(healthScore({ performanceRatio: 0.82, anomalyScore: 0, faultModeConfidence: 0, rulDays: 3650 })).toBe(100);
  });

  it('a degraded asset scores low', () => {
    const s = healthScore({ performanceRatio: 0.4, anomalyScore: 0.9, faultModeConfidence: 0.9, rulDays: 5 });
    expect(s).toBeLessThan(40);
  });

  it('clamps to 0–100', () => {
    const s = healthScore({ performanceRatio: 2, anomalyScore: 0, faultModeConfidence: 0, rulDays: 99999 });
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// PART B — PROGNOSTIC LIFECYCLE STATE MACHINE
// ===========================================================================

describe('W71 lifecycle — state machine', () => {
  it('happy path: predicted→triaged→diagnosed→action_planned→wo_raised→monitoring→resolved', () => {
    let s: PrognosticStatus = 'predicted';
    s = nextStatus(s, 'triage_prediction')!;   expect(s).toBe('triaged');
    s = nextStatus(s, 'diagnose_root_cause')!;  expect(s).toBe('diagnosed');
    s = nextStatus(s, 'plan_action')!;          expect(s).toBe('action_planned');
    s = nextStatus(s, 'raise_work_order')!;     expect(s).toBe('wo_raised');
    s = nextStatus(s, 'begin_monitoring')!;     expect(s).toBe('monitoring');
    s = nextStatus(s, 'confirm_resolved')!;     expect(s).toBe('resolved');
    expect(isTerminal('resolved')).toBe(true);
  });

  it('a fresh prediction can be dismissed (false positive) or auto-suppressed', () => {
    expect(nextStatus('predicted', 'dismiss_prediction')).toBe('dismissed');
    expect(nextStatus('triaged', 'dismiss_prediction')).toBe('dismissed');
    expect(nextStatus('predicted', 'auto_suppress')).toBe('auto_suppressed');
    // can't auto-suppress after triage
    expect(nextStatus('triaged', 'auto_suppress')).toBeNull();
    expect(nextStatus('diagnosed', 'dismiss_prediction')).toBeNull();
  });

  it('escalation reachable from the mid-states and feeds a work order', () => {
    expect(nextStatus('triaged', 'escalate_prognostic')).toBe('escalated');
    expect(nextStatus('diagnosed', 'escalate_prognostic')).toBe('escalated');
    expect(nextStatus('action_planned', 'escalate_prognostic')).toBe('escalated');
    expect(nextStatus('monitoring', 'escalate_prognostic')).toBe('escalated');
    expect(nextStatus('predicted', 'escalate_prognostic')).toBeNull();
    expect(nextStatus('escalated', 'raise_work_order')).toBe('wo_raised');
  });

  it('a predicted failure can materialise (confirmed_failure) from any active state', () => {
    for (const s of ['predicted', 'triaged', 'diagnosed', 'action_planned', 'wo_raised', 'monitoring', 'escalated'] as PrognosticStatus[]) {
      expect(nextStatus(s, 'record_failure')).toBe('confirmed_failure');
    }
    expect(isTerminal('confirmed_failure')).toBe(true);
    // not from a terminal
    expect(nextStatus('resolved', 'record_failure')).toBeNull();
  });

  it('monitoring can loop back to diagnosed on recurrence', () => {
    expect(nextStatus('monitoring', 'reopen_recurrence')).toBe('diagnosed');
    // diagnose_root_cause also legal from monitoring (recurrence path)
    expect(nextStatus('monitoring', 'diagnose_root_cause')).toBe('diagnosed');
  });

  it('expiry reachable from the early stale states only', () => {
    expect(nextStatus('predicted', 'expire_prognostic')).toBe('expired');
    expect(nextStatus('triaged', 'expire_prognostic')).toBe('expired');
    expect(nextStatus('diagnosed', 'expire_prognostic')).toBe('expired');
    expect(nextStatus('monitoring', 'expire_prognostic')).toBeNull();
    expect(isTerminal('expired')).toBe(true);
  });

  it('isDismissable matches {predicted, triaged}', () => {
    expect(isDismissable('predicted')).toBe(true);
    expect(isDismissable('triaged')).toBe(true);
    expect(isDismissable('diagnosed')).toBe(false);
  });

  it('all five terminals accept no further transitions', () => {
    for (const t of ['resolved', 'dismissed', 'auto_suppressed', 'expired', 'confirmed_failure'] as PrognosticStatus[]) {
      expect(allowedActions(t)).toEqual([]);
      expect(isTerminal(t)).toBe(true);
    }
  });

  it('rejects illegal skips', () => {
    expect(nextStatus('predicted', 'plan_action')).toBeNull();
    expect(nextStatus('triaged', 'raise_work_order')).toBeNull();
    expect(nextStatus('diagnosed', 'begin_monitoring')).toBeNull();
    expect(nextStatus('wo_raised', 'confirm_resolved')).toBeNull();
  });

  it('TRANSITIONS dict covers every action', () => {
    const actions: PrognosticAction[] = [
      'triage_prediction', 'dismiss_prediction', 'auto_suppress', 'diagnose_root_cause',
      'plan_action', 'raise_work_order', 'begin_monitoring', 'confirm_resolved',
      'escalate_prognostic', 'record_failure', 'expire_prognostic', 'reopen_recurrence',
    ];
    for (const a of actions) expect(TRANSITIONS[a]).toBeDefined();
  });
});

describe('W71 lifecycle — URGENT SLA matrix', () => {
  const base = new Date('2026-02-01T08:00:00Z');
  const HOUR = 60;
  const DAY = 24 * HOUR;

  it('critical is the TIGHTEST window at every graded stage; minor the loosest', () => {
    const graded: PrognosticStatus[] = [
      'predicted', 'triaged', 'diagnosed', 'action_planned', 'wo_raised', 'monitoring', 'escalated',
    ];
    for (const st of graded) {
      expect(SLA_MINUTES[st].critical).toBeLessThan(SLA_MINUTES[st].major);
      expect(SLA_MINUTES[st].major).toBeLessThan(SLA_MINUTES[st].material);
      expect(SLA_MINUTES[st].material).toBeLessThan(SLA_MINUTES[st].moderate);
      expect(SLA_MINUTES[st].moderate).toBeLessThan(SLA_MINUTES[st].minor);
    }
  });

  it('predicted triage window: critical 2h, minor 3d', () => {
    expect(SLA_MINUTES.predicted.critical).toBe(2 * HOUR);
    expect(SLA_MINUTES.predicted.minor).toBe(3 * DAY);
  });

  it('escalated is the tightest graded state (critical 2h)', () => {
    expect(SLA_MINUTES.escalated.critical).toBe(2 * HOUR);
  });

  it('slaWindowMinutes returns matrix value; 0 for terminals', () => {
    expect(slaWindowMinutes('predicted', 'critical')).toBe(2 * HOUR);
    expect(slaWindowMinutes('resolved', 'critical')).toBe(0);
    expect(slaWindowMinutes('confirmed_failure', 'critical')).toBe(0);
  });

  it('slaDeadlineFor adds the window minutes', () => {
    const d = slaDeadlineFor('predicted', 'critical', base);
    expect(d!.getTime() - base.getTime()).toBe(2 * HOUR * 60_000);
  });

  it('all five terminals return null deadline', () => {
    for (const t of ['resolved', 'dismissed', 'auto_suppressed', 'expired', 'confirmed_failure'] as PrognosticStatus[]) {
      expect(slaDeadlineFor(t, 'critical', base)).toBeNull();
    }
  });
});

describe('W71 lifecycle — revenue tiering with safety floor', () => {
  it('tierForRevenue boundaries', () => {
    expect(tierForRevenue(4999)).toBe('minor');
    expect(tierForRevenue(5000)).toBe('moderate');
    expect(tierForRevenue(24999)).toBe('moderate');
    expect(tierForRevenue(25000)).toBe('material');
    expect(tierForRevenue(99999)).toBe('material');
    expect(tierForRevenue(100000)).toBe('major');
    expect(tierForRevenue(499999)).toBe('major');
    expect(tierForRevenue(500000)).toBe('critical');
  });

  it('safetyFloor lifts a safety-implicated fault to at least major', () => {
    expect(safetyFloor(true)).toBe('major');
    expect(safetyFloor(false)).toBe('minor');
  });

  it('prognosticTier takes the higher of revenue-tier and safety floor', () => {
    // tiny rand exposure but safety-implicated → floored to major
    expect(prognosticTier(1000, true)).toBe('major');
    // tiny exposure, no safety → minor
    expect(prognosticTier(1000, false)).toBe('minor');
    // huge exposure beats the floor → critical
    expect(prognosticTier(600000, true)).toBe('critical');
    // mid exposure, no safety → material
    expect(prognosticTier(30000, false)).toBe('material');
  });

  it('isHighTier / isReportable', () => {
    expect(isHighTier('critical')).toBe(true);
    expect(isHighTier('major')).toBe(true);
    expect(isHighTier('material')).toBe(false);
    // reportable when safety-implicated regardless of tier, or high tier
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('minor', false)).toBe(false);
    expect(isReportable('major', false)).toBe(true);
  });
});

describe('W71 lifecycle — reportability (the SAFETY-driven signature)', () => {
  const tiers: PrognosticTier[] = ['minor', 'moderate', 'material', 'major', 'critical'];

  it('record_failure crosses for EVERY tier when safety-implicated (the signature)', () => {
    for (const t of tiers) {
      expect(crossesIntoRegulator('record_failure', t, true)).toBe(true);
    }
  });

  it('record_failure with NO safety implication crosses only the high tiers', () => {
    expect(crossesIntoRegulator('record_failure', 'critical', false)).toBe(true);
    expect(crossesIntoRegulator('record_failure', 'major', false)).toBe(true);
    expect(crossesIntoRegulator('record_failure', 'material', false)).toBe(false);
    expect(crossesIntoRegulator('record_failure', 'moderate', false)).toBe(false);
    expect(crossesIntoRegulator('record_failure', 'minor', false)).toBe(false);
  });

  it('escalate_prognostic crosses only for the high tiers AND when safety-implicated', () => {
    expect(crossesIntoRegulator('escalate_prognostic', 'critical', true)).toBe(true);
    expect(crossesIntoRegulator('escalate_prognostic', 'major', true)).toBe(true);
    // high tier but no safety → no
    expect(crossesIntoRegulator('escalate_prognostic', 'critical', false)).toBe(false);
    // safety but low tier → no
    expect(crossesIntoRegulator('escalate_prognostic', 'material', true)).toBe(false);
  });

  it('routine workflow actions never cross', () => {
    const routine: PrognosticAction[] = [
      'triage_prediction', 'dismiss_prediction', 'auto_suppress', 'diagnose_root_cause',
      'plan_action', 'raise_work_order', 'begin_monitoring', 'confirm_resolved',
      'expire_prognostic', 'reopen_recurrence',
    ];
    for (const t of tiers) {
      for (const a of routine) {
        expect(crossesIntoRegulator(a, t, true)).toBe(false);
        expect(crossesIntoRegulator(a, t, false)).toBe(false);
      }
    }
  });

  it('sla_breach crosses for the high tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('moderate')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});
