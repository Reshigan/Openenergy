// Wave 95 — Sustainability-Linked Loan KPI Compliance & Margin Ratchet spec tests.
import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  RATCHET_STEP_BPS,
  CURE_FAILED_PENALTY_BPS,
  nextStatus,
  allowedActions,
  isTerminal,
  isCancellable,
  isMaterialityClass,
  isFloorAtMaterialClass,
  isTier,
  tierFromVariance,
  tierRank,
  isHighTier,
  effectiveVariancePct,
  slaDeadlineFor,
  isReportable,
  actionCrossesRegulator,
  authorityFor,
  ratchetBpsFor,
  effectiveMarginBps,
  cumulativeRatchetZar,
  tcfdCompletenessPct,
  attestationCompletenessPct,
  sbtiPathwayFromGwp,
  taxonomyAlignmentPct,
  verificationProvenanceBand,
  daysToKpiDue,
  predictedAmendmentDate,
  urgencyBand,
  inboxSeverityForTier,
  partyForAction,
  eventTypeFor,
} from '../src/utils/sll-kpi-spec';

describe('W95 SLL KPI — state machine', () => {
  it('clean forward path period_open → baseline → measurement → verification → attested → ratchet → margin_amended', () => {
    expect(nextStatus('kpi_period_open', 'set_baseline')).toBe('baseline_set');
    expect(nextStatus('baseline_set', 'collect_measurement')).toBe('measurement_collected');
    expect(nextStatus('measurement_collected', 'start_verification')).toBe('independent_verification');
    expect(nextStatus('independent_verification', 'attest_kpi')).toBe('kpi_attested');
    expect(nextStatus('kpi_attested', 'compute_ratchet')).toBe('ratchet_computed');
    expect(nextStatus('ratchet_computed', 'amend_margin')).toBe('margin_amended');
  });

  it('breach branch fires from independent_verification', () => {
    expect(nextStatus('independent_verification', 'record_breach')).toBe('breach_recorded');
    expect(nextStatus('breach_recorded', 'open_cure_period')).toBe('cure_period');
    expect(nextStatus('cure_period', 'validate_cure')).toBe('kpi_attested');
    expect(nextStatus('cure_period', 'fail_cure')).toBe('cure_failed');
  });

  it('restatement branch fires from kpi_attested / ratchet_computed / margin_amended', () => {
    expect(nextStatus('kpi_attested', 'raise_restatement')).toBe('restatement');
    expect(nextStatus('ratchet_computed', 'raise_restatement')).toBe('restatement');
    expect(nextStatus('margin_amended', 'raise_restatement')).toBe('restatement');
    expect(nextStatus('restatement', 're_verify')).toBe('independent_verification');
  });

  it('sustainability_event closes file from any non-terminal except margin_amended', () => {
    const fromStates = [
      'kpi_period_open', 'baseline_set', 'measurement_collected',
      'independent_verification', 'kpi_attested', 'ratchet_computed',
      'breach_recorded', 'cure_period', 'restatement',
    ] as const;
    for (const s of fromStates) {
      expect(nextStatus(s, 'trigger_sustainability_event')).toBe('sustainability_event');
    }
  });

  it('cancel works from every non-terminal except margin_amended', () => {
    const fromStates = [
      'kpi_period_open', 'baseline_set', 'measurement_collected',
      'independent_verification', 'kpi_attested', 'ratchet_computed',
      'breach_recorded', 'cure_period', 'restatement',
    ] as const;
    for (const s of fromStates) {
      expect(nextStatus(s, 'cancel')).toBe('cancelled');
      expect(isCancellable(s)).toBe(true);
    }
  });

  it('terminals reject further actions', () => {
    expect(isTerminal('margin_amended')).toBe(true);
    expect(isTerminal('cure_failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('sustainability_event')).toBe(true);
    expect(allowedActions('cure_failed')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
    expect(allowedActions('sustainability_event')).toEqual([]);
  });

  it('margin_amended only allows raise_restatement (post-period correction)', () => {
    expect(allowedActions('margin_amended')).toEqual(['raise_restatement']);
  });

  it('invalid transitions return null', () => {
    expect(nextStatus('kpi_period_open', 'attest_kpi')).toBe(null);
    expect(nextStatus('measurement_collected', 'fail_cure')).toBe(null);
    expect(nextStatus('cure_failed', 'set_baseline')).toBe(null);
  });

  it('TRANSITIONS covers every status (no orphans)', () => {
    const statuses = [
      'kpi_period_open', 'baseline_set', 'measurement_collected',
      'independent_verification', 'kpi_attested', 'ratchet_computed',
      'margin_amended', 'breach_recorded', 'cure_period', 'cure_failed',
      'restatement', 'cancelled', 'sustainability_event',
    ] as const;
    for (const s of statuses) {
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });
});

describe('W95 SLL KPI — tier derivation (variance × materiality)', () => {
  it('tier from |variance|: <5pp minor, 5-15pp standard, 15-30pp material, ≥30pp severe', () => {
    expect(tierFromVariance(2, 'general_kpi')).toBe('minor');
    expect(tierFromVariance(-3.5, 'general_kpi')).toBe('minor');
    expect(tierFromVariance(5, 'general_kpi')).toBe('standard');
    expect(tierFromVariance(12, 'general_kpi')).toBe('standard');
    expect(tierFromVariance(15, 'general_kpi')).toBe('material');
    expect(tierFromVariance(-25, 'general_kpi')).toBe('material');
    expect(tierFromVariance(30, 'general_kpi')).toBe('severe');
    expect(tierFromVariance(50, 'general_kpi')).toBe('severe');
  });

  it('FLOOR-AT-MATERIAL for climate_kpi / safety_kpi / mandatory_disclosure_kpi', () => {
    expect(tierFromVariance(1, 'climate_kpi')).toBe('material');
    expect(tierFromVariance(3, 'safety_kpi')).toBe('material');
    expect(tierFromVariance(8, 'mandatory_disclosure_kpi')).toBe('material');
    // Severe still wins over floor.
    expect(tierFromVariance(40, 'climate_kpi')).toBe('severe');
  });

  it('non-floor classes (general / governance / supply_chain) keep base tier', () => {
    expect(tierFromVariance(2, 'general_kpi')).toBe('minor');
    expect(tierFromVariance(2, 'governance_kpi')).toBe('minor');
    expect(tierFromVariance(2, 'supply_chain_kpi')).toBe('minor');
  });

  it('isFloorAtMaterialClass set membership', () => {
    expect(isFloorAtMaterialClass('climate_kpi')).toBe(true);
    expect(isFloorAtMaterialClass('safety_kpi')).toBe(true);
    expect(isFloorAtMaterialClass('mandatory_disclosure_kpi')).toBe(true);
    expect(isFloorAtMaterialClass('general_kpi')).toBe(false);
    expect(isFloorAtMaterialClass('governance_kpi')).toBe(false);
    expect(isFloorAtMaterialClass('supply_chain_kpi')).toBe(false);
  });

  it('tierRank monotonic', () => {
    expect(tierRank('minor')).toBeLessThan(tierRank('standard'));
    expect(tierRank('standard')).toBeLessThan(tierRank('material'));
    expect(tierRank('material')).toBeLessThan(tierRank('severe'));
  });

  it('isHighTier covers material+severe', () => {
    expect(isHighTier('minor')).toBe(false);
    expect(isHighTier('standard')).toBe(false);
    expect(isHighTier('material')).toBe(true);
    expect(isHighTier('severe')).toBe(true);
  });

  it('isTier / isMaterialityClass guards', () => {
    expect(isTier('severe')).toBe(true);
    expect(isTier('bogus')).toBe(false);
    expect(isMaterialityClass('climate_kpi')).toBe(true);
    expect(isMaterialityClass('bogus_kpi')).toBe(false);
  });

  it('effectiveVariancePct prefers measured over forecast', () => {
    expect(effectiveVariancePct(10, 5)).toBe(10);
    expect(effectiveVariancePct(null, 5)).toBe(5);
    expect(effectiveVariancePct(undefined, undefined)).toBe(0);
    expect(effectiveVariancePct(0, 12)).toBe(0); // measured 0 still wins
  });
});

describe('W95 SLL KPI — INVERTED SLA polarity (severe > material > standard > minor)', () => {
  it('cure_period: severe is longest (180d) — STRICTLY INCREASING', () => {
    const c = SLA_MINUTES.cure_period;
    expect(c.minor).toBeLessThan(c.standard);
    expect(c.standard).toBeLessThan(c.material);
    expect(c.material).toBeLessThan(c.severe);
    expect(c.severe).toBe(259200); // 180d
  });

  it('independent_verification window also inverted', () => {
    const v = SLA_MINUTES.independent_verification;
    expect(v.minor).toBeLessThan(v.severe);
  });

  it('every non-terminal state has strictly-increasing SLA across tiers', () => {
    const nonTerminals = [
      'kpi_period_open', 'baseline_set', 'measurement_collected',
      'independent_verification', 'kpi_attested', 'ratchet_computed',
      'breach_recorded', 'cure_period', 'restatement',
    ] as const;
    for (const s of nonTerminals) {
      const m = SLA_MINUTES[s];
      expect(m.minor).toBeLessThanOrEqual(m.standard);
      expect(m.standard).toBeLessThanOrEqual(m.material);
      expect(m.material).toBeLessThanOrEqual(m.severe);
    }
  });

  it('slaDeadlineFor returns null on terminals; computes deadline on non-terminals', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(slaDeadlineFor('margin_amended', 'severe', now)).toBe(null);
    expect(slaDeadlineFor('cure_failed', 'minor', now)).toBe(null);
    const d = slaDeadlineFor('cure_period', 'severe', now);
    expect(d).not.toBe(null);
    expect(d!.getTime() - now.getTime()).toBe(259200 * 60 * 1000); // 180d
  });
});

describe('W95 SLL KPI — reportability (SIGNATURE SARB CPS hard line)', () => {
  it('record_breach (breach_recorded) crosses regulator EVERY tier (SIGNATURE)', () => {
    expect(actionCrossesRegulator('record_breach', 'minor',    'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('record_breach', 'standard', 'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('record_breach', 'material', 'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('record_breach', 'severe',   'general_kpi')).toBe(true);
  });

  it('fail_cure (cure_failed) crosses regulator EVERY tier (SIGNATURE)', () => {
    expect(actionCrossesRegulator('fail_cure', 'minor',    'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('fail_cure', 'standard', 'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('fail_cure', 'material', 'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('fail_cure', 'severe',   'general_kpi')).toBe(true);
  });

  it('raise_restatement crosses material + severe only', () => {
    expect(actionCrossesRegulator('raise_restatement', 'minor',    'general_kpi')).toBe(false);
    expect(actionCrossesRegulator('raise_restatement', 'standard', 'general_kpi')).toBe(false);
    expect(actionCrossesRegulator('raise_restatement', 'material', 'general_kpi')).toBe(true);
    expect(actionCrossesRegulator('raise_restatement', 'severe',   'general_kpi')).toBe(true);
  });

  it('amend_margin crosses severe only', () => {
    expect(actionCrossesRegulator('amend_margin', 'material', 'general_kpi')).toBe(false);
    expect(actionCrossesRegulator('amend_margin', 'severe',   'general_kpi')).toBe(true);
  });

  it('attest_kpi: floor-at-material classes always cross; otherwise severe-only', () => {
    expect(actionCrossesRegulator('attest_kpi', 'minor', 'climate_kpi')).toBe(true);
    expect(actionCrossesRegulator('attest_kpi', 'minor', 'safety_kpi')).toBe(true);
    expect(actionCrossesRegulator('attest_kpi', 'minor', 'mandatory_disclosure_kpi')).toBe(true);
    expect(actionCrossesRegulator('attest_kpi', 'standard', 'general_kpi')).toBe(false);
    expect(actionCrossesRegulator('attest_kpi', 'severe', 'general_kpi')).toBe(true);
  });

  it('trigger_sustainability_event crosses high-tier only', () => {
    expect(actionCrossesRegulator('trigger_sustainability_event', 'minor',    'general_kpi')).toBe(false);
    expect(actionCrossesRegulator('trigger_sustainability_event', 'material', 'general_kpi')).toBe(true);
  });

  it('isReportable mirrors isHighTier', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('severe')).toBe(true);
  });
});

describe('W95 SLL KPI — authority & inbox severity', () => {
  it('authority climbs with tier', () => {
    expect(authorityFor('minor')).toBe('esg_analyst');
    expect(authorityFor('standard')).toBe('sustainability_officer');
    expect(authorityFor('material')).toBe('credit_committee');
    expect(authorityFor('severe')).toBe('board_sustainability_committee');
  });

  it('inbox severity climbs with tier', () => {
    expect(inboxSeverityForTier('minor')).toBe('low');
    expect(inboxSeverityForTier('standard')).toBe('medium');
    expect(inboxSeverityForTier('material')).toBe('high');
    expect(inboxSeverityForTier('severe')).toBe('critical');
  });
});

describe('W95 SLL KPI — margin ratchet computation', () => {
  it('step sizes: minor 2.5 / standard 5 / material 10 / severe 15 bps', () => {
    expect(RATCHET_STEP_BPS.minor).toBe(2.5);
    expect(RATCHET_STEP_BPS.standard).toBe(5);
    expect(RATCHET_STEP_BPS.material).toBe(10);
    expect(RATCHET_STEP_BPS.severe).toBe(15);
  });

  it('positive variance (missed) → margin steps UP', () => {
    expect(ratchetBpsFor(20, 'material', false)).toBe(10);  // +10 bps step-up
    expect(ratchetBpsFor(40, 'severe', false)).toBe(15);    // +15 bps step-up
  });

  it('negative variance (beat target) → margin steps DOWN', () => {
    expect(ratchetBpsFor(-10, 'standard', false)).toBe(-5);  // -5 bps step-down
    expect(ratchetBpsFor(-30, 'severe', false)).toBe(-15);   // -15 bps step-down
  });

  it('cure_failed adds +5 bps penalty on top of step-up', () => {
    expect(ratchetBpsFor(20, 'material', true)).toBe(15);    // 10 + 5
    expect(ratchetBpsFor(40, 'severe', true)).toBe(20);      // 15 + 5
    expect(CURE_FAILED_PENALTY_BPS).toBe(5);
  });

  it('effectiveMarginBps = base + cumulative ratchet', () => {
    expect(effectiveMarginBps(250, 15)).toBe(265);
    expect(effectiveMarginBps(250, -7.5)).toBe(242.5);
  });

  it('cumulativeRatchetZar = bps × outstanding × remaining tenor', () => {
    // +15 bps × R500m × 5yr → R375k / yr × 5 = R3.75m approx
    const v = cumulativeRatchetZar(15, 500_000_000, 365 * 5);
    expect(v).toBeCloseTo(3_750_000, 0);
  });

  it('cumulativeRatchetZar handles zero / invalid', () => {
    expect(cumulativeRatchetZar(15, 0, 365)).toBe(0);
    expect(cumulativeRatchetZar(15, 1_000_000, 0)).toBe(0);
    expect(cumulativeRatchetZar(NaN, 1_000_000, 365)).toBe(0);
  });
});

describe('W95 SLL KPI — ESG completeness battery', () => {
  it('TCFD completeness: 4 pillars = 100%', () => {
    expect(tcfdCompletenessPct(4)).toBe(100);
    expect(tcfdCompletenessPct(3)).toBe(75);
    expect(tcfdCompletenessPct(0)).toBe(0);
  });

  it('attestation completeness fraction', () => {
    expect(attestationCompletenessPct(8, 10)).toBe(80);
    expect(attestationCompletenessPct(10, 10)).toBe(100);
    expect(attestationCompletenessPct(0, 0)).toBe(0);
  });

  it('SBTi pathway from reduction trajectory', () => {
    expect(sbtiPathwayFromGwp(4.5)).toBe('1_5C');
    expect(sbtiPathwayFromGwp(3.0)).toBe('well_below_2C');
    expect(sbtiPathwayFromGwp(1.5)).toBe('2C');
    expect(sbtiPathwayFromGwp(0.5)).toBe('not_aligned');
    expect(sbtiPathwayFromGwp(NaN)).toBe('not_aligned');
  });

  it('SA Green Finance Taxonomy alignment %', () => {
    expect(taxonomyAlignmentPct(750_000_000, 1_000_000_000)).toBe(75);
    expect(taxonomyAlignmentPct(0, 0)).toBe(0);
    expect(taxonomyAlignmentPct(1_500_000_000, 1_000_000_000)).toBe(100); // capped
  });

  it('verifier provenance band: big4 / iso14065 / industry / inadequate', () => {
    expect(verificationProvenanceBand('kpmg')).toBe('big4');
    expect(verificationProvenanceBand('PwC')).toBe('big4');
    expect(verificationProvenanceBand('TUV_SUD')).toBe('iso14065_accredited');
    expect(verificationProvenanceBand('dnv')).toBe('iso14065_accredited');
    expect(verificationProvenanceBand('XYZ Consulting')).toBe('industry_specialist');
    expect(verificationProvenanceBand('')).toBe('inadequate');
    expect(verificationProvenanceBand(null)).toBe('inadequate');
  });
});

describe('W95 SLL KPI — countdown & predictive battery', () => {
  it('daysToKpiDue countdown', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const due = new Date('2026-07-01T00:00:00Z');
    expect(daysToKpiDue(due, now)).toBe(30);
    expect(daysToKpiDue(new Date('2026-05-25T00:00:00Z'), now)).toBe(-7);
    expect(daysToKpiDue(null, now)).toBe(null);
  });

  it('predictedAmendmentDate sums remaining clean-path SLA', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    // From kpi_period_open at severe tier: sum of all 6 clean-path SLAs
    const totalSevere =
      SLA_MINUTES.kpi_period_open.severe +
      SLA_MINUTES.baseline_set.severe +
      SLA_MINUTES.measurement_collected.severe +
      SLA_MINUTES.independent_verification.severe +
      SLA_MINUTES.kpi_attested.severe +
      SLA_MINUTES.ratchet_computed.severe;
    const pred = predictedAmendmentDate('kpi_period_open', 'severe', enteredAt);
    expect(pred).not.toBe(null);
    expect(pred!.getTime() - enteredAt.getTime()).toBe(totalSevere * 60 * 1000);
  });

  it('predictedAmendmentDate projects breach/restatement back onto clean path', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    expect(predictedAmendmentDate('breach_recorded', 'material', enteredAt)).not.toBe(null);
    expect(predictedAmendmentDate('cure_period', 'material', enteredAt)).not.toBe(null);
    expect(predictedAmendmentDate('restatement', 'material', enteredAt)).not.toBe(null);
  });

  it('predictedAmendmentDate is null in terminals', () => {
    const t = new Date();
    expect(predictedAmendmentDate('margin_amended', 'minor', t)).toBe(null);
    expect(predictedAmendmentDate('cure_failed', 'severe', t)).toBe(null);
    expect(predictedAmendmentDate('cancelled', 'minor', t)).toBe(null);
  });
});

describe('W95 SLL KPI — urgency band', () => {
  it('overdue / urgent / due_soon / on_track / closed', () => {
    const now = new Date('2026-06-01T12:00:00Z');
    const past = new Date('2026-05-30T12:00:00Z');
    const within24h = new Date('2026-06-02T00:00:00Z');
    const within96h = new Date('2026-06-04T12:00:00Z');
    const farFuture = new Date('2026-07-01T12:00:00Z');

    expect(urgencyBand('cure_period', past, now)).toBe('overdue');
    expect(urgencyBand('cure_period', within24h, now)).toBe('urgent');
    expect(urgencyBand('cure_period', within96h, now)).toBe('due_soon');
    expect(urgencyBand('cure_period', farFuture, now)).toBe('on_track');
    expect(urgencyBand('margin_amended', farFuture, now)).toBe('closed');
    expect(urgencyBand('cure_failed', farFuture, now)).toBe('closed');
  });
});

describe('W95 SLL KPI — actor party & event types', () => {
  it('party is functional, not access-control', () => {
    expect(partyForAction('set_baseline')).toBe('sustainability_officer');
    expect(partyForAction('collect_measurement')).toBe('borrower');
    expect(partyForAction('attest_kpi')).toBe('verifier');
    expect(partyForAction('amend_margin')).toBe('credit_committee');
    expect(partyForAction('validate_cure')).toBe('verifier');
    expect(partyForAction('fail_cure')).toBe('credit_committee');
    expect(partyForAction('raise_restatement')).toBe('verifier');
  });

  it('event types prefixed sll_kpi.*', () => {
    expect(eventTypeFor('kpi_period_open')).toBe('sll_kpi.kpi_period_open');
    expect(eventTypeFor('breach_recorded')).toBe('sll_kpi.breach_recorded');
    expect(eventTypeFor('cure_failed')).toBe('sll_kpi.cure_failed');
    expect(eventTypeFor('margin_amended')).toBe('sll_kpi.margin_amended');
    expect(eventTypeFor('sustainability_event')).toBe('sll_kpi.sustainability_event');
  });
});
