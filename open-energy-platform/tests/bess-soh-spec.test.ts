import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForSoh,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isHeavyTier, isReportable, partyForAction,
  sohHeadroomPct, annualisedFadeRatePct, equivalentFullCycles,
  cycleFadeAttributionPct, capacityShortfallMwh, augmentationCapexZar,
  capacityPaymentAtRiskZar, augmentationNpvZar, warrantyRecoveryEligible,
  predictedDecommissionYears, slaDaysRemaining, urgencyBand,
  type BsohStatus,
} from '../src/utils/bess-soh-spec';

describe('W88 BESS SOH & augmentation programme — state machine', () => {
  it('clean lifecycle: baseline_set → monitoring_active → drift_detected → assess → require → plan → works → complete → recommission', () => {
    let s: BsohStatus = 'baseline_set';
    s = nextStatus(s, 'activate_monitoring')!;  expect(s).toBe('monitoring_active');
    s = nextStatus(s, 'detect_drift')!;          expect(s).toBe('drift_detected');
    s = nextStatus(s, 'assess_cause')!;          expect(s).toBe('assessment_pending');
    s = nextStatus(s, 'require_augmentation')!;  expect(s).toBe('augmentation_required');
    s = nextStatus(s, 'plan_augmentation')!;     expect(s).toBe('augmentation_planned');
    s = nextStatus(s, 'start_works')!;           expect(s).toBe('augmentation_in_progress');
    s = nextStatus(s, 'complete_works')!;        expect(s).toBe('augmentation_complete');
    s = nextStatus(s, 'recommission')!;          expect(s).toBe('recommissioned');
    expect(isTerminal('recommissioned')).toBe(true);
  });

  it('dispute loop: drift_detected → disputed → resolve → assessment_pending', () => {
    expect(nextStatus('drift_detected', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('assessment_pending', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('augmentation_required', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('assessment_pending');
    expect(nextStatus('disputed', 'assess_cause')).toBe('assessment_pending');
  });

  it('decommission branch: any active state → decommissioned', () => {
    expect(nextStatus('monitoring_active', 'decommission')).toBe('decommissioned');
    expect(nextStatus('drift_detected', 'decommission')).toBe('decommissioned');
    expect(nextStatus('augmentation_required', 'decommission')).toBe('decommissioned');
    expect(nextStatus('augmentation_planned', 'decommission')).toBe('decommissioned');
    expect(nextStatus('augmentation_in_progress', 'decommission')).toBe('decommissioned');
    expect(nextStatus('disputed', 'decommission')).toBe('decommissioned');
    expect(isTerminal('decommissioned')).toBe(true);
  });

  it('cancel branch: only from baseline_set', () => {
    expect(nextStatus('baseline_set', 'cancel_programme')).toBe('cancelled');
    expect(nextStatus('monitoring_active', 'cancel_programme')).toBe(null);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('terminals reject every action', () => {
    expect(nextStatus('recommissioned', 'activate_monitoring')).toBe(null);
    expect(nextStatus('decommissioned', 'detect_drift')).toBe(null);
    expect(nextStatus('cancelled', 'activate_monitoring')).toBe(null);
  });

  it('rejects out-of-order transitions', () => {
    expect(nextStatus('baseline_set', 'detect_drift')).toBe(null);
    expect(nextStatus('monitoring_active', 'plan_augmentation')).toBe(null);
    expect(nextStatus('augmentation_planned', 'recommission')).toBe(null);
  });

  it('allowedActions surfaces decommission everywhere active', () => {
    for (const s of ['monitoring_active','drift_detected','assessment_pending','augmentation_required','augmentation_planned','augmentation_in_progress','augmentation_complete','disputed'] as BsohStatus[]) {
      expect(allowedActions(s)).toContain('decommission');
    }
  });

  it('allowedActions on baseline_set offers activate_monitoring + cancel_programme', () => {
    const a = allowedActions('baseline_set');
    expect(a).toContain('activate_monitoring');
    expect(a).toContain('cancel_programme');
  });
});

describe('W88 — tier derivation', () => {
  it('tier nominal when soh >= floor + 10', () => {
    expect(tierForSoh(85, 70)).toBe('nominal');
    expect(tierForSoh(80, 70)).toBe('nominal');
  });

  it('tier watch when floor+5 <= soh < floor+10', () => {
    expect(tierForSoh(79.9, 70)).toBe('watch');
    expect(tierForSoh(75, 70)).toBe('watch');
  });

  it('tier material when floor <= soh < floor+5', () => {
    expect(tierForSoh(74.9, 70)).toBe('material');
    expect(tierForSoh(70, 70)).toBe('material');
  });

  it('tier critical when soh < floor', () => {
    expect(tierForSoh(69.9, 70)).toBe('critical');
    expect(tierForSoh(55, 70)).toBe('critical');
  });

  it('tier nominal for null/zero inputs', () => {
    expect(tierForSoh(null, 70)).toBe('nominal');
    expect(tierForSoh(0, 70)).toBe('nominal');
    expect(tierForSoh(85, null)).toBe('nominal');
  });
});

describe('W88 — SLA matrix URGENT polarity', () => {
  it('every graded state shrinks from nominal to critical', () => {
    for (const s of Object.keys(SLA_MINUTES) as BsohStatus[]) {
      const row = SLA_MINUTES[s];
      if (row.nominal === 0 && row.critical === 0) continue;
      expect(row.nominal).toBeGreaterThanOrEqual(row.watch);
      expect(row.watch).toBeGreaterThanOrEqual(row.material);
      expect(row.material).toBeGreaterThanOrEqual(row.critical);
    }
  });

  it('terminals carry no deadline', () => {
    for (const s of ['recommissioned','decommissioned','cancelled'] as BsohStatus[]) {
      expect(slaWindowMinutes(s, 'nominal')).toBe(0);
      expect(slaWindowMinutes(s, 'critical')).toBe(0);
    }
  });

  it('slaDeadlineFor returns null on terminals', () => {
    const t = new Date('2026-05-30T00:00:00Z');
    expect(slaDeadlineFor('recommissioned', 'critical', t)).toBeNull();
  });

  it('slaDeadlineFor shifts entered_at by window minutes', () => {
    const t = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('drift_detected', 'critical', t)!;
    expect(d.getUTCDate()).toBe(2);
    expect(d.getUTCMonth()).toBe(5);
  });
});

describe('W88 — SECURITY-OF-SUPPLY signature', () => {
  it('require_augmentation crosses regulator EVERY tier when capacity >= 50 MW', () => {
    for (const t of ['nominal','watch','material','critical'] as const) {
      expect(crossesIntoRegulator('require_augmentation', t, 50)).toBe(true);
      expect(crossesIntoRegulator('require_augmentation', t, 100)).toBe(true);
    }
  });

  it('require_augmentation crosses regulator on heavy tiers only when capacity < 50 MW', () => {
    expect(crossesIntoRegulator('require_augmentation', 'nominal', 30)).toBe(false);
    expect(crossesIntoRegulator('require_augmentation', 'watch', 30)).toBe(false);
    expect(crossesIntoRegulator('require_augmentation', 'material', 30)).toBe(true);
    expect(crossesIntoRegulator('require_augmentation', 'critical', 30)).toBe(true);
  });

  it('decommission ALWAYS crosses regulator regardless of tier / capacity', () => {
    for (const t of ['nominal','watch','material','critical'] as const) {
      expect(crossesIntoRegulator('decommission', t, 5)).toBe(true);
      expect(crossesIntoRegulator('decommission', t, 200)).toBe(true);
    }
  });

  it('raise_dispute crosses regulator only on material/critical', () => {
    expect(crossesIntoRegulator('raise_dispute', 'nominal', 100)).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'watch', 100)).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'material', 100)).toBe(true);
    expect(crossesIntoRegulator('raise_dispute', 'critical', 100)).toBe(true);
  });

  it('other actions never cross', () => {
    expect(crossesIntoRegulator('activate_monitoring', 'critical', 100)).toBe(false);
    expect(crossesIntoRegulator('plan_augmentation', 'critical', 100)).toBe(false);
    expect(crossesIntoRegulator('start_works', 'critical', 100)).toBe(false);
    expect(crossesIntoRegulator('recommission', 'critical', 100)).toBe(false);
  });

  it('SLA breach crosses regulator on heavy tiers only', () => {
    expect(slaBreachCrossesIntoRegulator('nominal')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('watch')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('critical')).toBe(true);
  });

  it('isHeavyTier / isReportable behave consistently', () => {
    expect(isHeavyTier('nominal')).toBe(false);
    expect(isReportable('nominal')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isReportable('critical')).toBe(true);
  });
});

describe('W88 — party attribution', () => {
  it('operator drives monitoring + assessment', () => {
    expect(partyForAction('activate_monitoring')).toBe('operator');
    expect(partyForAction('detect_drift')).toBe('operator');
    expect(partyForAction('assess_cause')).toBe('operator');
    expect(partyForAction('require_augmentation')).toBe('operator');
    expect(partyForAction('resolve_dispute')).toBe('operator');
    expect(partyForAction('cancel_programme')).toBe('operator');
  });

  it('owner authorises CapEx + recommission + dispute + decommission', () => {
    expect(partyForAction('plan_augmentation')).toBe('owner');
    expect(partyForAction('recommission')).toBe('owner');
    expect(partyForAction('raise_dispute')).toBe('owner');
    expect(partyForAction('decommission')).toBe('owner');
  });

  it('oem executes the works', () => {
    expect(partyForAction('start_works')).toBe('oem');
    expect(partyForAction('complete_works')).toBe('oem');
  });
});

describe('W88 — live SOH battery', () => {
  it('sohHeadroomPct = soh - floor', () => {
    expect(sohHeadroomPct(85, 70)).toBe(15);
    expect(sohHeadroomPct(65, 70)).toBe(-5);
    expect(sohHeadroomPct(null, 70)).toBe(-70);
  });

  it('annualisedFadeRatePct scales fade % per year', () => {
    expect(annualisedFadeRatePct(90, 100, 5)).toBe(2);
    expect(annualisedFadeRatePct(80, 100, 10)).toBe(2);
    expect(annualisedFadeRatePct(100, 100, 1)).toBe(0);
    expect(annualisedFadeRatePct(null, 100, 5)).toBe(20);
  });

  it('annualisedFadeRatePct returns 0 for null/zero years', () => {
    expect(annualisedFadeRatePct(80, 100, 0)).toBe(0);
    expect(annualisedFadeRatePct(80, 100, null)).toBe(0);
    expect(annualisedFadeRatePct(80, 0, 5)).toBe(0);
  });

  it('equivalentFullCycles = throughput / nameplate', () => {
    expect(equivalentFullCycles(1000, 100)).toBe(10);
    expect(equivalentFullCycles(2500, 100)).toBe(25);
    expect(equivalentFullCycles(0, 100)).toBe(0);
    expect(equivalentFullCycles(1000, 0)).toBe(0);
    expect(equivalentFullCycles(1000, null)).toBe(0);
  });

  it('cycleFadeAttributionPct returns 50 baseline when years zero or cycles zero', () => {
    expect(cycleFadeAttributionPct(0, 5)).toBe(50);
    expect(cycleFadeAttributionPct(1000, 0)).toBe(50);
    expect(cycleFadeAttributionPct(1000, null)).toBe(50);
  });

  it('cycleFadeAttributionPct skews toward cycle for heavy cyclers', () => {
    const heavy = cycleFadeAttributionPct(5000, 5);
    const light = cycleFadeAttributionPct(500, 5);
    expect(heavy).toBeGreaterThan(light);
  });

  it('capacityShortfallMwh returns 0 in-spec, positive when under floor', () => {
    expect(capacityShortfallMwh(85, 70, 100)).toBe(0);
    expect(capacityShortfallMwh(65, 70, 100)).toBe(5);
    expect(capacityShortfallMwh(60, 70, 200)).toBe(20);
  });

  it('augmentationCapexZar = shortfall MWh × 1000 × rate', () => {
    expect(augmentationCapexZar(5, 6500)).toBe(32_500_000);
    expect(augmentationCapexZar(5, null)).toBe(32_500_000);
    expect(augmentationCapexZar(0, 6500)).toBe(0);
  });

  it('capacityPaymentAtRiskZar — default 4hr conversion', () => {
    expect(capacityPaymentAtRiskZar(4, 1_200_000)).toBe(1_200_000);
    expect(capacityPaymentAtRiskZar(40, 1_200_000)).toBe(12_000_000);
  });

  it('augmentationNpvZar positive when CapEx beats discounted recovery', () => {
    const npv = augmentationNpvZar(5_000_000, 20_000_000, 10, 12);
    expect(npv).toBeGreaterThan(0);
  });

  it('augmentationNpvZar negative when residual years zero', () => {
    expect(augmentationNpvZar(1_000_000, 20_000_000, 0, 12)).toBe(-20_000_000);
  });

  it('warrantyRecoveryEligible only when in-breach AND cycle-dominated AND warranty active', () => {
    expect(warrantyRecoveryEligible(65, 70, 5, 75)).toBe(true);
    expect(warrantyRecoveryEligible(85, 70, 5, 75)).toBe(false);
    expect(warrantyRecoveryEligible(65, 70, 0, 75)).toBe(false);
    expect(warrantyRecoveryEligible(65, 70, 5, 40)).toBe(false);
  });

  it('predictedDecommissionYears extrapolates remaining life', () => {
    expect(predictedDecommissionYears(80, 2, 50)).toBe(15);
    expect(predictedDecommissionYears(50, 2, 50)).toBe(0);
    expect(predictedDecommissionYears(40, 2, 50)).toBe(0);
    expect(predictedDecommissionYears(80, 0, 50)).toBe(99);
  });

  it('slaDaysRemaining drops to 0 past the deadline', () => {
    const entered = new Date('2026-05-01T00:00:00Z');
    const now = new Date('2026-05-30T00:00:00Z');
    const r = slaDaysRemaining('drift_detected', 'critical', entered, now);
    expect(r).toBe(0);
  });

  it('slaDaysRemaining positive when window still open', () => {
    const entered = new Date('2026-05-29T00:00:00Z');
    const now = new Date('2026-05-30T00:00:00Z');
    const r = slaDaysRemaining('drift_detected', 'critical', entered, now);
    expect(r).toBeGreaterThan(1);
  });

  it('urgencyBand critical when soh under floor', () => {
    expect(urgencyBand(-1, 5)).toBe('critical');
    expect(urgencyBand(20, 0.5)).toBe('critical');
  });

  it('urgencyBand low when headroom > 10 and days_remaining > 7', () => {
    expect(urgencyBand(15, 14)).toBe('low');
  });

  it('urgencyBand high vs medium graded by headroom', () => {
    expect(urgencyBand(3, 14)).toBe('high');
    expect(urgencyBand(8, 14)).toBe('medium');
  });
});
