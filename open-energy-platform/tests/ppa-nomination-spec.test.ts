import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS, SLA_MINUTES,
  isTerminal, nextStatus, allowedActions,
  slaDeadlineFor, slaWindowMinutes,
  tierForDeviationPct,
  crossesIntoRegulator, slaBreachCrossesIntoRegulator,
  isHeavyTier, isReportable, partyForAction,
  absoluteDeviationMwh, absoluteDeviationPct, signedDeviationMwh,
  deviationValueZar, predictedPenaltyZar, capacityFactorRealized,
  forecastAccuracyPct, weatherNormalizedDeviation, deviationTrend3Period,
  predictedResolutionDays, slaDaysRemaining, urgencyBand,
  type PnomStatus, type PnomTier, type PnomAction,
} from '../src/utils/ppa-nomination-spec';

describe('W87 PPA nomination & deviation settlement — state machine', () => {
  it('clean path: nomination_window_open → da_nominated → da_confirmed → delivery → reconciled → deviation_settled', () => {
    let s: PnomStatus = 'nomination_window_open';
    s = nextStatus(s, 'submit_da_nomination')!; expect(s).toBe('da_nominated');
    s = nextStatus(s, 'confirm_da')!;           expect(s).toBe('da_confirmed');
    s = nextStatus(s, 'close_gate')!;           expect(s).toBe('delivery_in_progress');
    s = nextStatus(s, 'complete_delivery')!;    expect(s).toBe('delivery_complete');
    s = nextStatus(s, 'ingest_meter')!;         expect(s).toBe('meter_data_received');
    s = nextStatus(s, 'reconcile')!;            expect(s).toBe('reconciled');
    s = nextStatus(s, 'settle_deviation')!;     expect(s).toBe('deviation_settled');
    expect(isTerminal('deviation_settled')).toBe(true);
  });

  it('intra-day revision branch: da_confirmed → id_revised → id_revised (re-entrant) → close_gate', () => {
    expect(nextStatus('da_confirmed', 'submit_id_revision')).toBe('id_revised');
    expect(nextStatus('id_revised', 'submit_id_revision')).toBe('id_revised');
    expect(nextStatus('id_revised', 'close_gate')).toBe('delivery_in_progress');
  });

  it('seller rejection: da_nominated → reject_da → nomination_window_open (renominate loop)', () => {
    expect(nextStatus('da_nominated', 'reject_da')).toBe('nomination_window_open');
  });

  it('dispute loop: reconciled → dispute_raised → resolve_dispute → reconciled', () => {
    expect(nextStatus('reconciled', 'raise_dispute')).toBe('dispute_raised');
    expect(nextStatus('dispute_raised', 'resolve_dispute')).toBe('reconciled');
  });

  it('excused branch: any non-terminal → excused', () => {
    expect(nextStatus('nomination_window_open', 'excuse_period')).toBe('excused');
    expect(nextStatus('da_confirmed', 'excuse_period')).toBe('excused');
    expect(nextStatus('reconciled', 'excuse_period')).toBe('excused');
    expect(nextStatus('dispute_raised', 'excuse_period')).toBe('excused');
    expect(isTerminal('excused')).toBe(true);
  });

  it('cancel branch: pre-delivery only', () => {
    expect(nextStatus('nomination_window_open', 'cancel_nomination')).toBe('cancelled');
    expect(nextStatus('da_nominated', 'cancel_nomination')).toBe('cancelled');
    expect(nextStatus('delivery_in_progress', 'cancel_nomination')).toBe(null);
    expect(isTerminal('cancelled')).toBe(true);
  });

  it('terminals reject every action', () => {
    expect(nextStatus('deviation_settled', 'submit_da_nomination')).toBe(null);
    expect(nextStatus('excused', 'reconcile')).toBe(null);
    expect(nextStatus('cancelled', 'submit_da_nomination')).toBe(null);
  });

  it('illegal transitions return null', () => {
    expect(nextStatus('nomination_window_open', 'reconcile')).toBe(null);
    expect(nextStatus('da_nominated', 'settle_deviation')).toBe(null);
    expect(nextStatus('reconciled', 'submit_da_nomination')).toBe(null);
    expect(nextStatus('meter_data_received', 'settle_deviation')).toBe(null);
  });

  it('allowedActions returns the right action set for each state', () => {
    expect(allowedActions('nomination_window_open').sort()).toEqual(
      ['cancel_nomination', 'excuse_period', 'submit_da_nomination'].sort()
    );
    expect(allowedActions('da_nominated').sort()).toEqual(
      ['cancel_nomination', 'confirm_da', 'excuse_period', 'reject_da'].sort()
    );
    expect(allowedActions('reconciled').sort()).toEqual(
      ['excuse_period', 'raise_dispute', 'settle_deviation'].sort()
    );
    expect(allowedActions('deviation_settled')).toEqual(expect.any(Array));
  });
});

describe('W87 tier from absolute deviation pct — RE-DERIVED on every transition', () => {
  it('minor when |dev| < 5%', () => {
    expect(tierForDeviationPct(0)).toBe('minor');
    expect(tierForDeviationPct(4.9)).toBe('minor');
    expect(tierForDeviationPct(-4.9)).toBe('minor');
  });
  it('standard when 5% <= |dev| < 10%', () => {
    expect(tierForDeviationPct(5)).toBe('standard');
    expect(tierForDeviationPct(9.9)).toBe('standard');
    expect(tierForDeviationPct(-7.5)).toBe('standard');
  });
  it('material when 10% <= |dev| < 20%', () => {
    expect(tierForDeviationPct(10)).toBe('material');
    expect(tierForDeviationPct(19.9)).toBe('material');
    expect(tierForDeviationPct(-15)).toBe('material');
  });
  it('major when |dev| >= 20%', () => {
    expect(tierForDeviationPct(20)).toBe('major');
    expect(tierForDeviationPct(50)).toBe('major');
    expect(tierForDeviationPct(-30)).toBe('major');
  });
  it('minor defaults for missing input', () => {
    expect(tierForDeviationPct(null)).toBe('minor');
    expect(tierForDeviationPct(undefined)).toBe('minor');
    expect(tierForDeviationPct(Number.NaN)).toBe('minor');
  });
});

describe('W87 SLA — URGENT polarity (larger deviation = tighter window)', () => {
  it('graded states are strictly decreasing minor → major', () => {
    const graded: PnomStatus[] = [
      'nomination_window_open', 'da_nominated', 'da_confirmed', 'id_revised',
      'delivery_complete', 'meter_data_received', 'reconciled', 'dispute_raised',
    ];
    for (const s of graded) {
      expect(SLA_MINUTES[s].minor).toBeGreaterThan(SLA_MINUTES[s].standard);
      expect(SLA_MINUTES[s].standard).toBeGreaterThan(SLA_MINUTES[s].material);
      expect(SLA_MINUTES[s].material).toBeGreaterThan(SLA_MINUTES[s].major);
    }
  });

  it('terminals have no SLA', () => {
    expect(slaWindowMinutes('deviation_settled', 'major')).toBe(0);
    expect(slaWindowMinutes('excused', 'major')).toBe(0);
    expect(slaWindowMinutes('cancelled', 'minor')).toBe(0);
  });

  it('slaDeadlineFor computes the right minute offset', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const d = slaDeadlineFor('dispute_raised', 'major', start);
    expect(d?.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('slaDeadlineFor returns null when no deadline (terminal)', () => {
    expect(slaDeadlineFor('deviation_settled', 'minor', new Date())).toBe(null);
  });
});

describe('W87 NOMINATION-INTEGRITY signature — the hard line', () => {
  it('raise_dispute crosses regulator EVERY tier', () => {
    for (const t of ['minor', 'standard', 'material', 'major'] as PnomTier[]) {
      expect(crossesIntoRegulator('raise_dispute', t)).toBe(true);
    }
  });

  it('excuse_period crosses regulator for material + major only', () => {
    expect(crossesIntoRegulator('excuse_period', 'minor')).toBe(false);
    expect(crossesIntoRegulator('excuse_period', 'standard')).toBe(false);
    expect(crossesIntoRegulator('excuse_period', 'material')).toBe(true);
    expect(crossesIntoRegulator('excuse_period', 'major')).toBe(true);
  });

  it('settle_deviation crosses regulator for material + major only', () => {
    expect(crossesIntoRegulator('settle_deviation', 'minor')).toBe(false);
    expect(crossesIntoRegulator('settle_deviation', 'standard')).toBe(false);
    expect(crossesIntoRegulator('settle_deviation', 'material')).toBe(true);
    expect(crossesIntoRegulator('settle_deviation', 'major')).toBe(true);
  });

  it('benign actions never cross', () => {
    expect(crossesIntoRegulator('submit_da_nomination', 'major')).toBe(false);
    expect(crossesIntoRegulator('confirm_da', 'major')).toBe(false);
    expect(crossesIntoRegulator('reconcile', 'major')).toBe(false);
    expect(crossesIntoRegulator('ingest_meter', 'major')).toBe(false);
  });

  it('sla_breached crosses regulator for material + major only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
  });

  it('isReportable returns true for material + major', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('major')).toBe(true);
  });

  it('isHeavyTier matches isReportable', () => {
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('minor')).toBe(false);
  });
});

describe('W87 actor party for actions', () => {
  it('seller confirms / rejects DA nominations', () => {
    expect(partyForAction('confirm_da')).toBe('seller');
    expect(partyForAction('reject_da')).toBe('seller');
    expect(partyForAction('complete_delivery')).toBe('seller');
  });
  it('system operator closes the gate', () => {
    expect(partyForAction('close_gate')).toBe('system_operator');
  });
  it('independent meter ingests meter data', () => {
    expect(partyForAction('ingest_meter')).toBe('independent_meter');
  });
  it('offtaker drives nomination + reconciliation + dispute + settle', () => {
    expect(partyForAction('submit_da_nomination')).toBe('offtaker');
    expect(partyForAction('submit_id_revision')).toBe('offtaker');
    expect(partyForAction('reconcile')).toBe('offtaker');
    expect(partyForAction('raise_dispute')).toBe('offtaker');
    expect(partyForAction('settle_deviation')).toBe('offtaker');
    expect(partyForAction('excuse_period')).toBe('offtaker');
  });
});

describe('W87 live nomination-integrity battery', () => {
  it('absolute deviation MWh: gates nulls and forces non-negative', () => {
    expect(absoluteDeviationMwh(100, 110)).toBe(10);
    expect(absoluteDeviationMwh(110, 100)).toBe(10);
    expect(absoluteDeviationMwh(null, 100)).toBe(100);
    expect(absoluteDeviationMwh(100, null)).toBe(100);
  });

  it('absolute deviation pct: gates divide-by-zero', () => {
    expect(absoluteDeviationPct(100, 100)).toBe(0);
    expect(absoluteDeviationPct(90, 100)).toBe(10);
    expect(absoluteDeviationPct(110, 100)).toBe(10);
    expect(absoluteDeviationPct(100, 0)).toBe(0);
  });

  it('signed deviation MWh: positive for under-delivery', () => {
    expect(signedDeviationMwh(90, 100)).toBe(10);
    expect(signedDeviationMwh(110, 100)).toBe(-10);
  });

  it('deviation value ZAR: abs MWh times tariff', () => {
    expect(deviationValueZar(10, 1500)).toBe(15000);
    expect(deviationValueZar(10, 0)).toBe(0);
    expect(deviationValueZar(10, null)).toBe(0);
  });

  it('predicted penalty ZAR: scales with deviation band', () => {
    expect(predictedPenaltyZar(3, 1000)).toBe(1000);    // <5% no multiplier
    expect(predictedPenaltyZar(7, 1000)).toBe(1200);    // 5-10% ×1.2
    expect(predictedPenaltyZar(15, 1000)).toBe(1500);   // 10-20% ×1.5
    expect(predictedPenaltyZar(30, 1000)).toBe(2000);   // 20%+ ×2.0
  });

  it('capacity factor realized: metered over (cap × hours)', () => {
    expect(capacityFactorRealized(7440, 100, 744)).toBe(10);
    expect(capacityFactorRealized(744, 1, 744)).toBe(100);
    expect(capacityFactorRealized(100, 0, 744)).toBe(0);
    expect(capacityFactorRealized(100, 1, 0)).toBe(0);
  });

  it('forecast accuracy pct: 100 - abs deviation, clamped', () => {
    expect(forecastAccuracyPct(0)).toBe(100);
    expect(forecastAccuracyPct(30)).toBe(70);
    expect(forecastAccuracyPct(150)).toBe(0);
  });

  it('weather-normalised deviation strips out weather-attributable pct', () => {
    expect(weatherNormalizedDeviation(15, 10)).toBe(5);
    expect(weatherNormalizedDeviation(15, 20)).toBe(-5);
    expect(weatherNormalizedDeviation(15, null)).toBe(15);
  });

  it('deviation trend 3 periods: rolling mean', () => {
    expect(deviationTrend3Period(10, 20, 30)).toBe(20);
    expect(deviationTrend3Period(null, null, null)).toBe(0);
  });

  it('predicted resolution days from SLA table', () => {
    expect(predictedResolutionDays('dispute_raised', 'major')).toBe(7);
    expect(predictedResolutionDays('deviation_settled', 'major')).toBe(0);
  });

  it('sla days remaining: positive inside window, 0 when expired', () => {
    const entered = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-02T00:00:00Z');
    expect(slaDaysRemaining('dispute_raised', 'major', entered, now)).toBeGreaterThan(0);
    const past = new Date('2027-01-01T00:00:00Z');
    expect(slaDaysRemaining('dispute_raised', 'major', entered, past)).toBe(0);
  });

  it('urgency band ladders by deviation pct + days remaining', () => {
    expect(urgencyBand(25, 100)).toBe('critical');
    expect(urgencyBand(0, 0.5)).toBe('critical');
    expect(urgencyBand(12, 50)).toBe('high');
    expect(urgencyBand(0, 2)).toBe('high');
    expect(urgencyBand(7, 50)).toBe('medium');
    expect(urgencyBand(0, 5)).toBe('medium');
    expect(urgencyBand(0, 30)).toBe('low');
  });
});

describe('W87 state coverage — 12 states, 13 actions', () => {
  it('exactly 12 distinct states', () => {
    const states = new Set<PnomStatus>();
    for (const t of Object.values(TRANSITIONS)) {
      for (const f of t.from) states.add(f);
      states.add(t.to);
    }
    expect(states.size).toBe(12);
  });
  it('exactly 13 actions', () => {
    expect(Object.keys(TRANSITIONS)).toHaveLength(13);
  });
  it('three terminals: deviation_settled, excused, cancelled', () => {
    expect(isTerminal('deviation_settled')).toBe(true);
    expect(isTerminal('excused')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('nomination_window_open')).toBe(false);
    expect(isTerminal('reconciled')).toBe(false);
  });
});
