// W102 — Esums Plant Soiling, Cleaning Authorisation & Recovery-Gain Audit spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  allowedActions,
  nextStatus,
  isTerminal,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForSoilingRatio,
  floorAtMaterial,
  effectiveTier,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  prLossPct,
  mwhLossPerDay,
  zarLossPerDay,
  zarLossToDate,
  cleaningRoiRatio,
  daysToBreakeven,
  soilingVelocityPctPerDay,
  predictedNextCleanDate,
  recoveredZar,
  soilingComplianceIndex,
  slaDaysRemaining,
  urgencyBand,
  authorityRequired,
  eventTypeFor,
} from '../src/utils/soiling-audit-spec';

describe('W102 Soiling Audit — state machine', () => {
  it('forward path is clean soiling_period_open → settled (settle_audit)', () => {
    let s = 'soiling_period_open' as ReturnType<typeof nextStatus>;
    s = nextStatus('soiling_period_open', 'schedule_inspection'); expect(s).toBe('inspection_scheduled');
    s = nextStatus(s!, 'record_inspection');                       expect(s).toBe('field_inspected');
    s = nextStatus(s!, 'measure_soiling');                         expect(s).toBe('soiling_measured');
    s = nextStatus(s!, 'assess_economics');                        expect(s).toBe('economic_assessment_done');
    s = nextStatus(s!, 'authorize_cleaning');                      expect(s).toBe('cleaning_authorized');
    s = nextStatus(s!, 'start_cleaning');                          expect(s).toBe('cleaning_in_progress');
    s = nextStatus(s!, 'complete_cleaning');                       expect(s).toBe('post_clean_measured');
    s = nextStatus(s!, 'measure_post_clean');                      expect(s).toBe('gain_validated');
    s = nextStatus(s!, 'settle_audit');                            expect(s).toBe('settled');
  });

  it('validate_gain is an alternate path into settled', () => {
    expect(nextStatus('gain_validated', 'validate_gain')).toBe('settled');
    expect(nextStatus('gain_validated', 'settle_audit')).toBe('settled');
  });

  it('dispute loop: soiling_measured → disputed → economic_assessment_done', () => {
    expect(nextStatus('soiling_measured', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('economic_assessment_done', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('gain_validated', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('economic_assessment_done');
    expect(nextStatus('disputed', 'assess_economics')).toBe('economic_assessment_done');
  });

  it('cancel_audit fires from every non-terminal', () => {
    const cancellable = [
      'soiling_period_open', 'inspection_scheduled', 'field_inspected',
      'soiling_measured', 'economic_assessment_done', 'cleaning_authorized',
      'cleaning_in_progress', 'post_clean_measured', 'gain_validated', 'disputed',
    ] as const;
    for (const s of cancellable) {
      expect(nextStatus(s, 'cancel_audit')).toBe('cancelled');
    }
    expect(nextStatus('settled', 'cancel_audit')).toBeNull();
    expect(nextStatus('cancelled', 'cancel_audit')).toBeNull();
  });

  it('terminals (settled + cancelled) reject every action', () => {
    for (const t of ['settled', 'cancelled'] as const) {
      expect(nextStatus(t, 'schedule_inspection')).toBeNull();
      expect(nextStatus(t, 'raise_dispute')).toBeNull();
      expect(nextStatus(t, 'cancel_audit')).toBeNull();
      expect(isTerminal(t)).toBe(true);
    }
  });

  it('allowedActions surfaces every legal action per state', () => {
    expect(allowedActions('soiling_period_open')).toContain('schedule_inspection');
    expect(allowedActions('soiling_period_open')).toContain('cancel_audit');
    expect(allowedActions('soiling_measured')).toContain('assess_economics');
    expect(allowedActions('soiling_measured')).toContain('raise_dispute');
    expect(allowedActions('disputed')).toContain('resolve_dispute');
    expect(allowedActions('disputed')).toContain('assess_economics');
    expect(allowedActions('gain_validated')).toContain('validate_gain');
    expect(allowedActions('gain_validated')).toContain('settle_audit');
    expect(allowedActions('settled')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });

  it('TRANSITIONS table covers every action exactly once', () => {
    const actionKeys = Object.keys(TRANSITIONS).sort();
    expect(actionKeys).toEqual([
      'assess_economics', 'authorize_cleaning', 'cancel_audit',
      'complete_cleaning', 'measure_post_clean', 'measure_soiling',
      'raise_dispute', 'record_inspection', 'resolve_dispute',
      'schedule_inspection', 'settle_audit', 'start_cleaning',
      'validate_gain',
    ]);
  });
});

describe('W102 Soiling Audit — SLA polarity (URGENT)', () => {
  it('SLA decreases strictly minor → severe for every graded state', () => {
    for (const status of [
      'soiling_period_open', 'inspection_scheduled', 'field_inspected',
      'soiling_measured', 'economic_assessment_done', 'cleaning_authorized',
      'cleaning_in_progress', 'post_clean_measured', 'gain_validated', 'disputed',
    ] as const) {
      const row = SLA_MINUTES[status];
      expect(row.minor).toBeGreaterThan(row.standard);
      expect(row.standard).toBeGreaterThan(row.material);
      expect(row.material).toBeGreaterThan(row.severe);
    }
  });

  it('terminals carry no SLA deadline', () => {
    for (const t of ['settled', 'cancelled'] as const) {
      expect(slaWindowMinutes(t, 'minor')).toBe(0);
      expect(slaWindowMinutes(t, 'severe')).toBe(0);
      expect(slaDeadlineFor(t, 'severe', new Date())).toBeNull();
    }
  });

  it('slaDeadlineFor advances by the configured window', () => {
    const t0 = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('soiling_measured', 'severe', t0)!;
    expect(d.toISOString()).toBe('2026-05-30T06:00:00.000Z');
    const d2 = slaDeadlineFor('soiling_measured', 'minor', t0)!;
    expect(d2.toISOString()).toBe('2026-06-04T00:00:00.000Z');
  });
});

describe('W102 Soiling Audit — tier re-derivation', () => {
  it('tierForSoilingRatio band boundaries', () => {
    expect(tierForSoilingRatio(0)).toBe('minor');
    expect(tierForSoilingRatio(1.99)).toBe('minor');
    expect(tierForSoilingRatio(2)).toBe('standard');
    expect(tierForSoilingRatio(3.99)).toBe('standard');
    expect(tierForSoilingRatio(4)).toBe('material');
    expect(tierForSoilingRatio(7.99)).toBe('material');
    expect(tierForSoilingRatio(8)).toBe('severe');
    expect(tierForSoilingRatio(15)).toBe('severe');
  });

  it('tierForSoilingRatio defends against null / negative / NaN', () => {
    expect(tierForSoilingRatio(null)).toBe('minor');
    expect(tierForSoilingRatio(undefined)).toBe('minor');
    expect(tierForSoilingRatio(-5)).toBe('minor');
    expect(tierForSoilingRatio(Number.NaN)).toBe('minor');
  });

  it('floorAtMaterial fires on any one of the four flags', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({ rainy_season_window_strict: true })).toBe(true);
    expect(floorAtMaterial({ post_dust_storm_event: true })).toBe(true);
    expect(floorAtMaterial({ neighbour_complaint_filed: true })).toBe(true);
    expect(floorAtMaterial({ water_restriction_active: true })).toBe(true);
    expect(floorAtMaterial({
      rainy_season_window_strict: true,
      water_restriction_active: true,
    })).toBe(true);
  });

  it('effectiveTier promotes minor + standard → material when floor', () => {
    expect(effectiveTier('minor', false)).toBe('minor');
    expect(effectiveTier('standard', false)).toBe('standard');
    expect(effectiveTier('material', false)).toBe('material');
    expect(effectiveTier('severe', false)).toBe('severe');

    expect(effectiveTier('minor', true)).toBe('material');
    expect(effectiveTier('standard', true)).toBe('material');
    expect(effectiveTier('material', true)).toBe('material');
    expect(effectiveTier('severe', true)).toBe('severe'); // never demote
  });

  it('isHeavyTier identifies material + severe only', () => {
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('severe')).toBe(true);
  });

  it('isReportable matches heavy tiers', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('severe')).toBe(true);
  });
});

describe('W102 Soiling Audit — regulator crossings (signature)', () => {
  it('raise_dispute ALWAYS crosses regulator (W102 signature)', () => {
    for (const tier of ['minor', 'standard', 'material', 'severe'] as const) {
      expect(crossesIntoRegulator('raise_dispute', tier, 0, 0)).toBe(true);
      expect(crossesIntoRegulator('raise_dispute', tier, 100, 500)).toBe(true);
    }
  });

  it('cancel_audit crosses regulator only on material + severe', () => {
    expect(crossesIntoRegulator('cancel_audit', 'minor', 0, 0)).toBe(false);
    expect(crossesIntoRegulator('cancel_audit', 'standard', 0, 0)).toBe(false);
    expect(crossesIntoRegulator('cancel_audit', 'material', 0, 0)).toBe(true);
    expect(crossesIntoRegulator('cancel_audit', 'severe', 0, 0)).toBe(true);
  });

  it('authorize_cleaning crosses regulator at ≥50MW OR ≥100m³', () => {
    expect(crossesIntoRegulator('authorize_cleaning', 'minor', 49, 99)).toBe(false);
    expect(crossesIntoRegulator('authorize_cleaning', 'minor', 50, 0)).toBe(true);
    expect(crossesIntoRegulator('authorize_cleaning', 'minor', 0, 100)).toBe(true);
    expect(crossesIntoRegulator('authorize_cleaning', 'severe', 200, 250)).toBe(true);
  });

  it('other actions never cross regulator on their own', () => {
    expect(crossesIntoRegulator('schedule_inspection', 'severe', 200, 500)).toBe(false);
    expect(crossesIntoRegulator('measure_soiling', 'severe', 200, 500)).toBe(false);
    expect(crossesIntoRegulator('settle_audit', 'severe', 200, 500)).toBe(false);
    expect(crossesIntoRegulator('complete_cleaning', 'severe', 200, 500)).toBe(false);
  });

  it('slaBreachCrossesIntoRegulator on material + severe', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('severe')).toBe(true);
  });
});

describe('W102 Soiling Audit — party + event mapping', () => {
  it('site_supervisor drives inspection / measurement / assessment', () => {
    expect(partyForAction('schedule_inspection')).toBe('site_supervisor');
    expect(partyForAction('record_inspection')).toBe('site_supervisor');
    expect(partyForAction('measure_soiling')).toBe('site_supervisor');
    expect(partyForAction('assess_economics')).toBe('site_supervisor');
    expect(partyForAction('measure_post_clean')).toBe('site_supervisor');
    expect(partyForAction('validate_gain')).toBe('site_supervisor');
    expect(partyForAction('resolve_dispute')).toBe('site_supervisor');
    expect(partyForAction('cancel_audit')).toBe('site_supervisor');
  });

  it('cleaning_contractor executes the works', () => {
    expect(partyForAction('start_cleaning')).toBe('cleaning_contractor');
    expect(partyForAction('complete_cleaning')).toBe('cleaning_contractor');
  });

  it('plant_owner authorises + settles + disputes', () => {
    expect(partyForAction('authorize_cleaning')).toBe('plant_owner');
    expect(partyForAction('settle_audit')).toBe('plant_owner');
    expect(partyForAction('raise_dispute')).toBe('plant_owner');
  });

  it('eventTypeFor returns a soiling_audit.* event for every action', () => {
    expect(eventTypeFor('schedule_inspection')).toBe('soiling_audit.inspection_scheduled');
    expect(eventTypeFor('record_inspection')).toBe('soiling_audit.field_inspected');
    expect(eventTypeFor('measure_soiling')).toBe('soiling_audit.soiling_measured');
    expect(eventTypeFor('assess_economics')).toBe('soiling_audit.economics_assessed');
    expect(eventTypeFor('authorize_cleaning')).toBe('soiling_audit.cleaning_authorized');
    expect(eventTypeFor('start_cleaning')).toBe('soiling_audit.cleaning_started');
    expect(eventTypeFor('complete_cleaning')).toBe('soiling_audit.cleaning_completed');
    expect(eventTypeFor('measure_post_clean')).toBe('soiling_audit.post_clean_measured');
    expect(eventTypeFor('validate_gain')).toBe('soiling_audit.gain_validated');
    expect(eventTypeFor('settle_audit')).toBe('soiling_audit.settled');
    expect(eventTypeFor('raise_dispute')).toBe('soiling_audit.dispute_raised');
    expect(eventTypeFor('resolve_dispute')).toBe('soiling_audit.dispute_resolved');
    expect(eventTypeFor('cancel_audit')).toBe('soiling_audit.cancelled');
  });
});

describe('W102 Soiling Audit — LIVE battery (yield-loss + cleaning economics)', () => {
  it('prLossPct = expected - dirty, 0 when either missing', () => {
    expect(prLossPct(82, 76)).toBe(6);
    expect(prLossPct(82.5, 78.25)).toBe(4.25);
    expect(prLossPct(null, 76)).toBe(0);
    expect(prLossPct(82, null)).toBe(0);
    expect(prLossPct(0, 0)).toBe(0);
  });

  it('mwhLossPerDay = capacity × hours × prLoss/100', () => {
    // signature: (capacity, prLoss, peakSunHoursPerDay)
    expect(mwhLossPerDay(100, 5, 5)).toBe(25);    // 100 × 5h × 0.05
    expect(mwhLossPerDay(75, 8, 4)).toBe(24);     // 75 × 4h × 0.08
    expect(mwhLossPerDay(100, 5, null)).toBe(25); // default 5h
    expect(mwhLossPerDay(0, 5, 5)).toBe(0);
    expect(mwhLossPerDay(100, 0, 5)).toBe(0);     // no loss
    expect(mwhLossPerDay(100, 5, 0)).toBe(0);     // no sun hours
  });

  it('zarLossPerDay = mwh × tariff (default R1150/MWh)', () => {
    expect(zarLossPerDay(25, null)).toBe(28750);   // 25 × 1150
    expect(zarLossPerDay(10, 1500)).toBe(15000);
    expect(zarLossPerDay(0, 1150)).toBe(0);
  });

  it('zarLossToDate accumulates daily loss over days elapsed', () => {
    const opened = new Date('2026-05-20T00:00:00Z');
    const now = new Date('2026-05-30T00:00:00Z'); // 10 days
    expect(zarLossToDate(10000, opened, now)).toBe(100000);
    expect(zarLossToDate(10000, null, now)).toBe(0);
  });

  it('cleaningRoiRatio = (zarPerDay × horizon) / cost', () => {
    expect(cleaningRoiRatio(10000, 30, 100000)).toBe(3); // 300000 / 100000
    expect(cleaningRoiRatio(5000, null, 100000)).toBe(1.5); // default 30 horizon
    expect(cleaningRoiRatio(10000, 30, 0)).toBe(0);
    expect(cleaningRoiRatio(0, 30, 100000)).toBe(0);
  });

  it('daysToBreakeven = cost / zarPerDay (99 when no loss)', () => {
    expect(daysToBreakeven(100000, 10000)).toBe(10);
    expect(daysToBreakeven(100000, 0)).toBe(99);
    expect(daysToBreakeven(0, 10000)).toBe(0);
  });

  it('soilingVelocityPctPerDay extrapolates rate of accumulation', () => {
    expect(soilingVelocityPctPerDay(6, 2, 10)).toBe(0.4); // (6-2)/10
    expect(soilingVelocityPctPerDay(2, 6, 10)).toBe(-0.4); // recovering
    expect(soilingVelocityPctPerDay(6, 2, 0)).toBe(0);
  });

  it('predictedNextCleanDate extrapolates to 4% threshold', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    // current 2%, velocity 0.5%/day → 4 days to material
    const d1 = predictedNextCleanDate(2, 0.5, now);
    expect(d1).toBe('2026-06-03');
    // current 4.5% → already at/over material → today
    expect(predictedNextCleanDate(4.5, 0.1, now)).toBe('2026-05-30');
    // no velocity → null
    expect(predictedNextCleanDate(2, 0, now)).toBeNull();
    expect(predictedNextCleanDate(2, -0.1, now)).toBeNull();
  });

  it('recoveredZar = post-clean MWh gain × tariff', () => {
    // 100 MW × 5h × (82-76)%/100 × 30 days × 1150 = R1,035,000
    expect(recoveredZar(82, 76, 100, 5, 30, 1150)).toBe(1035000);
    expect(recoveredZar(76, 82, 100, 5, 30, 1150)).toBe(0); // no gain
    expect(recoveredZar(82, 82, 100, 5, 30, 1150)).toBe(0);
    expect(recoveredZar(82, 76, 0, 5, 30, 1150)).toBe(0);
  });

  it('soilingComplianceIndex composes coverage flags, capped at 130', () => {
    expect(soilingComplianceIndex({})).toBe(0);
    expect(soilingComplianceIndex({ inspection_recent: true })).toBe(20);
    expect(soilingComplianceIndex({
      inspection_recent: true,
      measurement_recent: true,
      economics_documented: true,
    })).toBe(55);
    // Hit every component → 130 (sum is 130 exactly)
    expect(soilingComplianceIndex({
      inspection_recent: true,
      measurement_recent: true,
      economics_documented: true,
      water_restriction_checked: true,
      neighbour_notice_logged: true,
      evidence_photo_uploaded: true,
      post_clean_measured: true,
      gain_validated: true,
      recovery_documented: true,
    })).toBe(130);
  });

  it('slaDaysRemaining counts down toward the deadline', () => {
    const entered = new Date('2026-05-30T00:00:00Z');
    const now1 = new Date('2026-05-31T00:00:00Z'); // 1 day in
    // soiling_measured × material = 1 day window → already at deadline
    expect(slaDaysRemaining('soiling_measured', 'material', entered, now1)).toBe(0);
    // soiling_measured × minor = 5 days → 4 left
    expect(slaDaysRemaining('soiling_measured', 'minor', entered, now1)).toBe(4);
    // terminal → 0
    expect(slaDaysRemaining('settled', 'minor', entered, now1)).toBe(0);
    expect(slaDaysRemaining('soiling_period_open', 'minor', null, now1)).toBe(0);
  });

  it('urgencyBand composes tier + breakeven + SLA into critical/high/medium/low', () => {
    expect(urgencyBand('severe', 5, 30)).toBe('critical');
    expect(urgencyBand('minor', 5, 0.5)).toBe('critical'); // sla < 1
    expect(urgencyBand('material', 100, 30)).toBe('high');
    expect(urgencyBand('standard', 5, 30)).toBe('high'); // breakeven < 7
    expect(urgencyBand('minor', 30, 2)).toBe('high'); // sla < 3
    expect(urgencyBand('standard', 30, 30)).toBe('medium');
    expect(urgencyBand('minor', 10, 30)).toBe('medium'); // breakeven < 14
    expect(urgencyBand('minor', 30, 5)).toBe('medium'); // sla < 7
    expect(urgencyBand('minor', 30, 30)).toBe('low');
  });

  it('authorityRequired ladder: site_supervisor → plant_manager → asset_director → cfo', () => {
    expect(authorityRequired('minor')).toBe('site_supervisor');
    expect(authorityRequired('standard')).toBe('plant_manager');
    expect(authorityRequired('material')).toBe('asset_director');
    expect(authorityRequired('severe')).toBe('cfo');
  });
});
