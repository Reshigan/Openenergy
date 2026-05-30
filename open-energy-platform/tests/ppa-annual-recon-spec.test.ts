// W101 — Offtaker PPA Annual Reconciliation & True-Up spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  allowedActions,
  nextStatus,
  isTerminal,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForVarianceAndResidual,
  floorAtMaterial,
  effectiveTier,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  reconciliationCompletenessIndex,
  topResidualZar,
  cpiTrueUpZar,
  capacityPaymentYearZar,
  deemedEnergyCreditZar,
  netCashPositionZar,
  mwhContractedPctDelivered,
  slaDaysRemaining,
  daysToSignoff,
  urgencyBand,
  predictedYearCloseDate,
  authorityRequired,
  eventTypeFor,
} from '../src/utils/ppa-annual-recon-spec';

describe('W101 PPA Annual Reconciliation — state machine', () => {
  it('forward path is clean year_opened → settled', () => {
    let s = 'year_opened' as ReturnType<typeof nextStatus>;
    s = nextStatus('year_opened', 'collect_data');           expect(s).toBe('data_collected');
    s = nextStatus(s!, 'classify_variance');                 expect(s).toBe('variance_classified');
    s = nextStatus(s!, 'compute_top_residual');              expect(s).toBe('top_residual_computed');
    s = nextStatus(s!, 'apply_cpi_capacity');                expect(s).toBe('cpi_capacity_applied');
    s = nextStatus(s!, 'reconcile');                         expect(s).toBe('reconciled');
    s = nextStatus(s!, 'sign_off');                          expect(s).toBe('signed_off');
    s = nextStatus(s!, 'invoice');                           expect(s).toBe('invoiced');
    s = nextStatus(s!, 'settle');                            expect(s).toBe('settled');
  });

  it('dispute loop: reconciled → disputed → reconciled', () => {
    expect(nextStatus('reconciled', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('reconciled');
    expect(nextStatus('disputed', 'reconcile')).toBe('reconciled');
  });

  it('restate door: settled → restated only', () => {
    expect(nextStatus('settled', 'restate_year')).toBe('restated');
    expect(nextStatus('reconciled', 'restate_year')).toBeNull();
    expect(nextStatus('invoiced', 'restate_year')).toBeNull();
  });

  it('cancel only from pre-data states', () => {
    expect(nextStatus('year_opened', 'cancel_year')).toBe('cancelled');
    expect(nextStatus('data_collected', 'cancel_year')).toBe('cancelled');
    expect(nextStatus('reconciled', 'cancel_year')).toBeNull();
    expect(nextStatus('settled', 'cancel_year')).toBeNull();
  });

  it('hard terminals reject every action (restated + cancelled)', () => {
    for (const t of ['restated', 'cancelled'] as const) {
      expect(nextStatus(t, 'collect_data')).toBeNull();
      expect(nextStatus(t, 'sign_off')).toBeNull();
      expect(nextStatus(t, 'restate_year')).toBeNull();
      expect(isTerminal(t)).toBe(true);
    }
  });

  it('settled is a rest state, not a hard terminal — restate_year escape works', () => {
    expect(isTerminal('settled')).toBe(false);
    expect(nextStatus('settled', 'restate_year')).toBe('restated');
    expect(nextStatus('settled', 'invoice')).toBeNull();
    expect(nextStatus('settled', 'sign_off')).toBeNull();
  });

  it('allowedActions in year_opened returns collect_data + cancel_year', () => {
    const acts = allowedActions('year_opened');
    expect(acts).toContain('collect_data');
    expect(acts).toContain('cancel_year');
    expect(acts).not.toContain('sign_off');
  });

  it('allowedActions in reconciled returns dispute + signoff', () => {
    const acts = allowedActions('reconciled');
    expect(acts).toContain('raise_dispute');
    expect(acts).toContain('sign_off');
    expect(acts).not.toContain('cancel_year');
  });

  it('every TRANSITIONS from/to list resolves', () => {
    for (const [action, t] of Object.entries(TRANSITIONS)) {
      expect(t.from.length).toBeGreaterThan(0);
      for (const src of t.from) {
        expect(nextStatus(src, action as Parameters<typeof nextStatus>[1])).toBe(t.to);
      }
    }
  });
});

describe('W101 — INVERTED SLA polarity', () => {
  it('every graded state has minor < standard < material < major (terminals 0)', () => {
    for (const [status, byTier] of Object.entries(SLA_MINUTES)) {
      if (['settled', 'restated', 'cancelled'].includes(status)) {
        expect(byTier.minor).toBe(0);
        expect(byTier.major).toBe(0);
        continue;
      }
      expect(byTier.minor).toBeLessThan(byTier.standard);
      expect(byTier.standard).toBeLessThan(byTier.material);
      expect(byTier.material).toBeLessThan(byTier.major);
    }
  });

  it('reconciled major window is at least 30 days', () => {
    expect(SLA_MINUTES.reconciled.major).toBeGreaterThanOrEqual(30 * 24 * 60);
  });

  it('disputed major is the longest non-invoiced window', () => {
    expect(SLA_MINUTES.disputed.major).toBeGreaterThanOrEqual(SLA_MINUTES.reconciled.major);
  });

  it('slaWindowMinutes mirrors SLA_MINUTES table', () => {
    expect(slaWindowMinutes('reconciled', 'minor')).toBe(SLA_MINUTES.reconciled.minor);
    expect(slaWindowMinutes('disputed', 'major')).toBe(SLA_MINUTES.disputed.major);
    expect(slaWindowMinutes('settled', 'major')).toBe(0);
  });

  it('slaDeadlineFor returns null on terminals', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(slaDeadlineFor('settled', 'major', now)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'major', now)).toBeNull();
  });

  it('slaDeadlineFor advances by SLA window minutes', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const dl = slaDeadlineFor('reconciled', 'minor', now)!;
    const expectedMs = now.getTime() + SLA_MINUTES.reconciled.minor * 60 * 1000;
    expect(dl.getTime()).toBe(expectedMs);
  });
});

describe('W101 — tier RE-DERIVATION + FLOOR-AT-MATERIAL', () => {
  it('tierForVarianceAndResidual picks higher of var/residual', () => {
    expect(tierForVarianceAndResidual(2, 0)).toBe('minor');
    expect(tierForVarianceAndResidual(7, 0)).toBe('standard');
    expect(tierForVarianceAndResidual(15, 0)).toBe('material');
    expect(tierForVarianceAndResidual(25, 0)).toBe('major');
    expect(tierForVarianceAndResidual(2, 5_000_000)).toBe('minor');
    expect(tierForVarianceAndResidual(2, 25_000_000)).toBe('standard');
    expect(tierForVarianceAndResidual(2, 100_000_000)).toBe('material');
    expect(tierForVarianceAndResidual(2, 300_000_000)).toBe('major');
  });

  it('tier picks HIGHER of var/residual bands', () => {
    expect(tierForVarianceAndResidual(2, 300_000_000)).toBe('major');
    expect(tierForVarianceAndResidual(25, 1_000)).toBe('major');
    expect(tierForVarianceAndResidual(7, 100_000_000)).toBe('material');
  });

  it('floorAtMaterial drags up on any of four flags', () => {
    expect(floorAtMaterial('minor', {})).toBe('minor');
    expect(floorAtMaterial('minor', { topResidualOverR100m: true })).toBe('material');
    expect(floorAtMaterial('standard', { cpiTrueUpOverR50m: true })).toBe('material');
    expect(floorAtMaterial('minor', { offtakeShortfallOver20Pct: true })).toBe('material');
    expect(floorAtMaterial('minor', { contractYearEndStrict: true })).toBe('material');
    expect(floorAtMaterial('major', { contractYearEndStrict: true })).toBe('major');
  });

  it('effectiveTier composes derivation + floor', () => {
    expect(effectiveTier(2, 1_000, {})).toBe('minor');
    expect(effectiveTier(2, 1_000, { topResidualOverR100m: true })).toBe('material');
    expect(effectiveTier(25, 1_000, {})).toBe('major');
  });

  it('isHeavyTier returns true for material + major', () => {
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('major')).toBe(true);
  });
});

describe('W101 — SIGNATURE financial-close hard line', () => {
  it('restate_year crosses regulator EVERY tier', () => {
    for (const tier of ['minor', 'standard', 'material', 'major'] as const) {
      expect(crossesIntoRegulator('restate_year', tier)).toBe(true);
    }
  });

  it('raise_dispute crosses regulator EVERY tier (sister of W87/W66)', () => {
    for (const tier of ['minor', 'standard', 'material', 'major'] as const) {
      expect(crossesIntoRegulator('raise_dispute', tier)).toBe(true);
    }
  });

  it('sign_off crosses only material + major', () => {
    expect(crossesIntoRegulator('sign_off', 'minor')).toBe(false);
    expect(crossesIntoRegulator('sign_off', 'standard')).toBe(false);
    expect(crossesIntoRegulator('sign_off', 'material')).toBe(true);
    expect(crossesIntoRegulator('sign_off', 'major')).toBe(true);
  });

  it('cancel_year crosses regulator only when year had delivery', () => {
    expect(crossesIntoRegulator('cancel_year', 'major', { yearHadDelivery: false })).toBe(false);
    expect(crossesIntoRegulator('cancel_year', 'major', { yearHadDelivery: true })).toBe(true);
    expect(crossesIntoRegulator('cancel_year', 'minor', { yearHadDelivery: true })).toBe(true);
  });

  it('routine actions do not cross', () => {
    for (const action of ['collect_data', 'classify_variance', 'reconcile', 'invoice', 'settle'] as const) {
      for (const tier of ['minor', 'standard', 'material', 'major'] as const) {
        expect(crossesIntoRegulator(action, tier)).toBe(false);
      }
    }
  });

  it('slaBreachCrossesIntoRegulator on material+major only', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('major')).toBe(true);
  });

  it('isReportable matches material+major', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('material')).toBe(true);
  });
});

describe('W101 — party attribution', () => {
  it('settlement_analyst owns data collection through reconcile', () => {
    expect(partyForAction('collect_data')).toBe('settlement_analyst');
    expect(partyForAction('classify_variance')).toBe('settlement_analyst');
    expect(partyForAction('compute_top_residual')).toBe('settlement_analyst');
    expect(partyForAction('apply_cpi_capacity')).toBe('settlement_analyst');
    expect(partyForAction('reconcile')).toBe('settlement_analyst');
  });

  it('finance_controller owns signoff / invoice / settle / cancel', () => {
    expect(partyForAction('sign_off')).toBe('finance_controller');
    expect(partyForAction('invoice')).toBe('finance_controller');
    expect(partyForAction('settle')).toBe('finance_controller');
    expect(partyForAction('cancel_year')).toBe('finance_controller');
  });

  it('counterparty raises disputes; auditor restates years', () => {
    expect(partyForAction('raise_dispute')).toBe('counterparty');
    expect(partyForAction('restate_year')).toBe('auditor');
  });
});

describe('W101 — LIVE financial-close battery', () => {
  it('reconciliationCompletenessIndex baselines at 100 for year_opened', () => {
    expect(reconciliationCompletenessIndex({ status: 'year_opened' })).toBe(100);
  });

  it('reconciliationCompletenessIndex caps at 130 for settled clean year', () => {
    const idx = reconciliationCompletenessIndex({
      status: 'settled',
      disputeCount: 0,
      restateCount: 0,
      daysInCourt: 0,
    });
    expect(idx).toBe(130);
  });

  it('reconciliationCompletenessIndex penalises disputes + restates + court drag', () => {
    const baseClean = reconciliationCompletenessIndex({ status: 'reconciled', disputeCount: 0, restateCount: 0, daysInCourt: 0 });
    const dirty = reconciliationCompletenessIndex({ status: 'reconciled', disputeCount: 2, restateCount: 2, daysInCourt: 30 });
    expect(dirty).toBeLessThan(baseClean);
  });

  it('topResidualZar = max(0, min-delivered) * tariff', () => {
    expect(topResidualZar(100_000, 80_000, 1_200)).toBe(20_000 * 1_200);
    expect(topResidualZar(100_000, 110_000, 1_200)).toBe(0);
    expect(topResidualZar(0, 0, 1_200)).toBe(0);
  });

  it('cpiTrueUpZar = delivered * (indexed - base)', () => {
    expect(cpiTrueUpZar(100_000, 1_000, 1_100)).toBe(100_000 * 100);
    expect(cpiTrueUpZar(100_000, 1_100, 1_000)).toBe(-10_000_000);
    expect(cpiTrueUpZar(0, 1_000, 1_100)).toBe(0);
  });

  it('capacityPaymentYearZar = capacity * tariff * availability', () => {
    expect(capacityPaymentYearZar(100, 50_000, 0.9)).toBe(100 * 50_000 * 0.9);
  });

  it('deemedEnergyCreditZar = curtailed * deemed tariff', () => {
    expect(deemedEnergyCreditZar(5_000, 800)).toBe(5_000 * 800);
    expect(deemedEnergyCreditZar(0, 800)).toBe(0);
  });

  it('netCashPositionZar sums components minus overpayment', () => {
    const net = netCashPositionZar({
      energyRevenueZar: 100_000_000,
      capacityPaymentZar: 20_000_000,
      deemedEnergyCreditZar: 5_000_000,
      cpiTrueUpZar: 8_000_000,
      topResidualZar: 4_000_000,
      priorYearOverpaymentZar: 2_000_000,
    });
    expect(net).toBe(135_000_000);
  });

  it('mwhContractedPctDelivered handles zero contracted', () => {
    expect(mwhContractedPctDelivered(0, 0)).toBe(0);
    expect(mwhContractedPctDelivered(1000, 750)).toBe(75);
    expect(mwhContractedPctDelivered(1000, 1000)).toBe(100);
  });

  it('slaDaysRemaining: terminals + null entered return 0', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(slaDaysRemaining('settled', 'major', new Date('2026-05-01T00:00:00Z'), now)).toBe(0);
    expect(slaDaysRemaining('reconciled', 'minor', null, now)).toBe(0);
  });

  it('slaDaysRemaining decreases as time advances', () => {
    const opened = new Date('2026-05-01T00:00:00Z');
    const d1 = slaDaysRemaining('reconciled', 'major', opened, new Date('2026-05-10T00:00:00Z'));
    const d2 = slaDaysRemaining('reconciled', 'major', opened, new Date('2026-05-20T00:00:00Z'));
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(0);
  });

  it('daysToSignoff is monotonically nonincreasing as state progresses', () => {
    expect(daysToSignoff('year_opened', 'major')).toBeGreaterThan(daysToSignoff('data_collected', 'major'));
    expect(daysToSignoff('cpi_capacity_applied', 'major')).toBeGreaterThan(daysToSignoff('reconciled', 'major'));
    expect(daysToSignoff('signed_off', 'major')).toBe(0);
    expect(daysToSignoff('settled', 'major')).toBe(0);
  });

  it('urgencyBand graduates by tier+variance+days', () => {
    expect(urgencyBand('major', 0, 10)).toBe('critical');
    expect(urgencyBand('minor', 25, 30)).toBe('critical');
    expect(urgencyBand('minor', 0, 2)).toBe('critical');
    expect(urgencyBand('material', 0, 20)).toBe('high');
    expect(urgencyBand('standard', 0, 20)).toBe('medium');
    expect(urgencyBand('minor', 0, 100)).toBe('low');
  });

  it('predictedYearCloseDate returns a future date for non-terminals', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const dt = predictedYearCloseDate('reconciled', 'minor', now)!;
    expect(dt.getTime()).toBeGreaterThan(now.getTime());
    expect(predictedYearCloseDate('settled', 'major', now)).toBeNull();
  });

  it('authorityRequired ladders by tier', () => {
    expect(authorityRequired('minor')).toBe('settlement_analyst');
    expect(authorityRequired('standard')).toBe('finance_controller');
    expect(authorityRequired('material')).toBe('finance_director');
    expect(authorityRequired('major')).toBe('cfo');
  });
});

describe('W101 — event types', () => {
  it('eventTypeFor returns ppa_annual_recon.* for graded actions', () => {
    expect(eventTypeFor('collect_data')).toBe('ppa_annual_recon.data_collected');
    expect(eventTypeFor('reconcile')).toBe('ppa_annual_recon.reconciled');
    expect(eventTypeFor('sign_off')).toBe('ppa_annual_recon.signed_off');
    expect(eventTypeFor('restate_year')).toBe('ppa_annual_recon.restated');
    expect(eventTypeFor('settle')).toBe('ppa_annual_recon.settled');
  });

  it('resolve_dispute maps to dispute_resolved', () => {
    expect(eventTypeFor('resolve_dispute')).toBe('ppa_annual_recon.dispute_resolved');
  });
});
