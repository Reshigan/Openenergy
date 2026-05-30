import { describe, it, expect } from 'vitest';
import {
  isTerminal,
  isOpen,
  nextStatus,
  allowedActions,
  TRANSITIONS,
  SLA_MINUTES,
  slaWindowMinutes,
  slaDeadlineFor,
  isLargeTier,
  baseTierForNotional,
  isSystemicCarrier,
  tierForNotional,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  ISDA_SPREAD_BPS,
  pv01Zar,
  valueTransferZar,
  fallbackBasisBps,
  daysToCessation,
  counterpartyResponseRate,
  protocolAdherenceFlag,
  compoundedZaroniaRate,
  urgencyBand,
  disputeConcentration,
  predictedResolutionDays,
  hedgeEffectivenessFlag,
  type BenchmarkTransitionStatus,
  type BenchmarkTransitionAction,
  type BenchmarkTransitionTier,
  type LegacyBenchmark,
  type FallbackClass,
  type InstrumentType,
} from '../src/utils/benchmark-transition-spec';

const OPEN_NON_TERMINAL: BenchmarkTransitionStatus[] = [
  'inventoried',
  'impact_assessed',
  'classified',
  'notified',
  'responded',
  'amendment_drafted',
  'amendment_executed',
  'vt_settled',
  'disputed',
  'on_hold',
];
const TERMINAL_STATES: BenchmarkTransitionStatus[] = [
  'transitioned_clean',
  'terminated_legacy',
  'cancelled',
];
const TIERS: BenchmarkTransitionTier[] = ['minor', 'standard', 'material', 'systemic'];

describe('terminals', () => {
  it('marks the three terminal states', () => {
    for (const s of TERMINAL_STATES) expect(isTerminal(s)).toBe(true);
  });
  it('non-terminals are not terminal', () => {
    for (const s of OPEN_NON_TERMINAL) expect(isTerminal(s)).toBe(false);
  });
  it('isOpen flags non-terminals only', () => {
    for (const s of OPEN_NON_TERMINAL) expect(isOpen(s)).toBe(true);
    for (const s of TERMINAL_STATES) expect(isOpen(s)).toBe(false);
  });
});

describe('TRANSITIONS', () => {
  it('every action has at least one from-state', () => {
    for (const [, t] of Object.entries(TRANSITIONS)) {
      expect(t.from.length).toBeGreaterThan(0);
      expect(typeof t.to).toBe('string');
    }
  });
  it('terminal states have no outbound transitions', () => {
    for (const t of TERMINAL_STATES) {
      expect(allowedActions(t).length).toBe(0);
      expect(nextStatus(t, 'terminate_legacy')).toBeNull();
      expect(nextStatus(t, 'complete_transition')).toBeNull();
    }
  });
  it('happy path: inventoried -> impact_assessed -> classified -> notified -> responded -> amendment_drafted -> amendment_executed -> vt_settled -> transitioned_clean', () => {
    expect(nextStatus('inventoried', 'assess_impact')).toBe('impact_assessed');
    expect(nextStatus('impact_assessed', 'classify_fallback')).toBe('classified');
    expect(nextStatus('classified', 'notify_counterparty')).toBe('notified');
    expect(nextStatus('notified', 'record_response')).toBe('responded');
    expect(nextStatus('responded', 'draft_amendment')).toBe('amendment_drafted');
    expect(nextStatus('amendment_drafted', 'execute_amendment')).toBe('amendment_executed');
    expect(nextStatus('amendment_executed', 'settle_vt')).toBe('vt_settled');
    expect(nextStatus('vt_settled', 'complete_transition')).toBe('transitioned_clean');
  });
  it('dispute loop: classified/notified/responded/amendment_* -> disputed -> classified', () => {
    expect(nextStatus('classified', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('notified', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('responded', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('amendment_drafted', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('amendment_executed', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('classified');
  });
  it('on_hold loop: open early states -> on_hold -> classified', () => {
    expect(nextStatus('impact_assessed', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('classified', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('notified', 'place_on_hold')).toBe('on_hold');
    expect(nextStatus('on_hold', 'resume')).toBe('classified');
  });
  it('terminate_legacy accepts a wide open band (post-classified)', () => {
    for (const s of ['classified', 'notified', 'responded', 'amendment_drafted', 'disputed', 'on_hold'] as BenchmarkTransitionStatus[]) {
      expect(nextStatus(s, 'terminate_legacy')).toBe('terminated_legacy');
    }
  });
  it('cancel only allowed at the entry states', () => {
    expect(nextStatus('inventoried', 'cancel')).toBe('cancelled');
    expect(nextStatus('impact_assessed', 'cancel')).toBe('cancelled');
    expect(nextStatus('classified', 'cancel')).toBeNull();
    expect(nextStatus('notified', 'cancel')).toBeNull();
  });
});

describe('SLA matrix (URGENT)', () => {
  it('every non-terminal/non-cancelled state x tier has a positive window', () => {
    const ZERO_OK: BenchmarkTransitionStatus[] = ['transitioned_clean', 'terminated_legacy', 'cancelled'];
    for (const s of Object.keys(SLA_MINUTES) as BenchmarkTransitionStatus[]) {
      for (const t of TIERS) {
        const w = slaWindowMinutes(s, t);
        if (ZERO_OK.includes(s)) {
          expect(w).toBe(0);
        } else {
          expect(w).toBeGreaterThan(0);
        }
      }
    }
  });
  it('URGENT polarity: systemic tier window is the TIGHTEST at every open status', () => {
    const ZERO_OK = new Set<BenchmarkTransitionStatus>(['transitioned_clean', 'terminated_legacy', 'cancelled']);
    for (const s of Object.keys(SLA_MINUTES) as BenchmarkTransitionStatus[]) {
      if (ZERO_OK.has(s)) continue;
      const m = SLA_MINUTES[s];
      expect(m.systemic).toBeLessThanOrEqual(m.material);
      expect(m.material).toBeLessThanOrEqual(m.standard);
      expect(m.standard).toBeLessThanOrEqual(m.minor);
    }
  });
  it('slaDeadlineFor returns null at terminal states', () => {
    const at = new Date('2026-05-30T00:00:00Z');
    expect(slaDeadlineFor('transitioned_clean', 'minor', at)).toBeNull();
    expect(slaDeadlineFor('terminated_legacy', 'systemic', at)).toBeNull();
    expect(slaDeadlineFor('cancelled', 'systemic', at)).toBeNull();
  });
  it('slaDeadlineFor adds the window in minutes correctly', () => {
    const at = new Date('2026-05-30T00:00:00Z');
    const window = SLA_MINUTES.notified.systemic;
    const d = slaDeadlineFor('notified', 'systemic', at);
    expect(d).not.toBeNull();
    expect(d!.getTime() - at.getTime()).toBe(window * 60 * 1000);
  });
});

describe('tier derivation', () => {
  it('isLargeTier flags material+systemic', () => {
    expect(isLargeTier('minor')).toBe(false);
    expect(isLargeTier('standard')).toBe(false);
    expect(isLargeTier('material')).toBe(true);
    expect(isLargeTier('systemic')).toBe(true);
  });
  it('baseTierForNotional bands', () => {
    expect(baseTierForNotional(5_000_000)).toBe('minor');
    expect(baseTierForNotional(50_000_000)).toBe('standard');
    expect(baseTierForNotional(500_000_000)).toBe('material');
    expect(baseTierForNotional(5_000_000_000)).toBe('systemic');
    expect(baseTierForNotional(-5_000_000_000)).toBe('systemic');
  });
  it('isSystemicCarrier: interbank or <30d-to-cessation', () => {
    expect(isSystemicCarrier(true, 365)).toBe(true);
    expect(isSystemicCarrier(false, 29)).toBe(true);
    expect(isSystemicCarrier(false, 30)).toBe(false);
    expect(isSystemicCarrier(false, 365)).toBe(false);
    expect(isSystemicCarrier(false, -1)).toBe(false);
  });
  it('tierForNotional floors at material for systemic-carriers', () => {
    expect(tierForNotional(5_000_000, true, 365)).toBe('material');
    expect(tierForNotional(50_000_000, false, 20)).toBe('material');
    expect(tierForNotional(50_000_000, false, 365)).toBe('standard');
    expect(tierForNotional(5_000_000_000, true, 365)).toBe('systemic');
  });
});

describe('reportability SIGNATURE — TRANSITION-INTEGRITY', () => {
  it('terminate_legacy crosses for EVERY tier (W90 hard line)', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('terminate_legacy', t)).toBe(true);
    }
  });
  it('complete_transition crosses for material + systemic only', () => {
    expect(crossesIntoRegulator('complete_transition', 'minor')).toBe(false);
    expect(crossesIntoRegulator('complete_transition', 'standard')).toBe(false);
    expect(crossesIntoRegulator('complete_transition', 'material')).toBe(true);
    expect(crossesIntoRegulator('complete_transition', 'systemic')).toBe(true);
  });
  it('raise_dispute crosses for systemic only', () => {
    expect(crossesIntoRegulator('raise_dispute', 'minor')).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'standard')).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'material')).toBe(false);
    expect(crossesIntoRegulator('raise_dispute', 'systemic')).toBe(true);
  });
  it('routine actions do not cross', () => {
    for (const t of TIERS) {
      expect(crossesIntoRegulator('assess_impact', t)).toBe(false);
      expect(crossesIntoRegulator('classify_fallback', t)).toBe(false);
      expect(crossesIntoRegulator('notify_counterparty', t)).toBe(false);
      expect(crossesIntoRegulator('record_response', t)).toBe(false);
      expect(crossesIntoRegulator('draft_amendment', t)).toBe(false);
      expect(crossesIntoRegulator('execute_amendment', t)).toBe(false);
      expect(crossesIntoRegulator('settle_vt', t)).toBe(false);
      expect(crossesIntoRegulator('resolve_dispute', t)).toBe(false);
      expect(crossesIntoRegulator('place_on_hold', t)).toBe(false);
      expect(crossesIntoRegulator('resume', t)).toBe(false);
      expect(crossesIntoRegulator('cancel', t)).toBe(false);
    }
  });
  it('slaBreachCrossesIntoRegulator: material + systemic', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
  });
  it('isReportable true on systemic carrier OR large tier', () => {
    expect(isReportable('minor', false)).toBe(false);
    expect(isReportable('minor', true)).toBe(true);
    expect(isReportable('standard', false)).toBe(false);
    expect(isReportable('material', false)).toBe(true);
    expect(isReportable('systemic', false)).toBe(true);
  });
});

describe('actor_party (audit attribution only)', () => {
  it('maps each action to a functional party', () => {
    expect(partyForAction('assess_impact')).toBe('risk_validation');
    expect(partyForAction('classify_fallback')).toBe('transition_desk');
    expect(partyForAction('notify_counterparty')).toBe('counterparty_credit');
    expect(partyForAction('record_response')).toBe('counterparty_credit');
    expect(partyForAction('draft_amendment')).toBe('docs_legal');
    expect(partyForAction('execute_amendment')).toBe('docs_legal');
    expect(partyForAction('settle_vt')).toBe('transition_desk');
    expect(partyForAction('complete_transition')).toBe('transition_desk');
    expect(partyForAction('raise_dispute')).toBe('counterparty_credit');
    expect(partyForAction('resolve_dispute')).toBe('counterparty_credit');
    expect(partyForAction('place_on_hold')).toBe('transition_desk');
    expect(partyForAction('resume')).toBe('transition_desk');
    expect(partyForAction('terminate_legacy')).toBe('transition_desk');
    expect(partyForAction('cancel')).toBe('transition_desk');
  });
});

describe('live battery — transition integrity', () => {
  it('ISDA fallback spreads are positive and monotonic in tenor', () => {
    expect(ISDA_SPREAD_BPS.jibar_1m).toBeGreaterThan(0);
    expect(ISDA_SPREAD_BPS.jibar_1m).toBeLessThan(ISDA_SPREAD_BPS.jibar_3m);
    expect(ISDA_SPREAD_BPS.jibar_3m).toBeLessThan(ISDA_SPREAD_BPS.jibar_6m);
    expect(ISDA_SPREAD_BPS.jibar_6m).toBeLessThan(ISDA_SPREAD_BPS.jibar_12m);
  });
  it('pv01Zar: linear in notional * remaining years', () => {
    expect(pv01Zar(100_000_000, 5, 'irs')).toBe(50_000);
    expect(pv01Zar(100_000_000, 0, 'irs')).toBe(0);
    expect(pv01Zar(100_000_000, -1, 'irs')).toBe(0);
    expect(pv01Zar(100_000_000, 5, 'basis_swap')).toBe(25_000);
  });
  it('valueTransferZar: notional * spread/10000 * remaining years', () => {
    const vt = valueTransferZar(100_000_000, 5, 'jibar_3m');
    expect(vt).toBeCloseTo(100_000_000 * (ISDA_SPREAD_BPS.jibar_3m / 10000) * 5, 2);
    expect(valueTransferZar(100_000_000, 0, 'jibar_3m')).toBe(0);
  });
  it('fallbackBasisBps returns the ISDA spread', () => {
    expect(fallbackBasisBps('jibar_3m')).toBe(ISDA_SPREAD_BPS.jibar_3m);
  });
  it('daysToCessation: positive when future, negative when past', () => {
    const cessation = new Date('2027-12-31T00:00:00Z');
    const earlyDate = new Date('2026-05-30T00:00:00Z');
    expect(daysToCessation(cessation, earlyDate)).toBeGreaterThan(0);
    const lateDate = new Date('2028-01-15T00:00:00Z');
    expect(daysToCessation(cessation, lateDate)).toBeLessThan(0);
  });
  it('counterpartyResponseRate clamps to [0, 1]', () => {
    expect(counterpartyResponseRate(5, 10)).toBe(0.5);
    expect(counterpartyResponseRate(0, 0)).toBe(0);
    expect(counterpartyResponseRate(20, 10)).toBe(1);
  });
  it('protocolAdherenceFlag: only true for isda_protocol', () => {
    expect(protocolAdherenceFlag('isda_protocol')).toBe(true);
    expect(protocolAdherenceFlag('bilateral_amendment')).toBe(false);
    expect(protocolAdherenceFlag('tough_legacy')).toBe(false);
    expect(protocolAdherenceFlag('pre_cessation')).toBe(false);
  });
  it('compoundedZaroniaRate = ZARONIA + spread/10000', () => {
    expect(compoundedZaroniaRate(0.0825, 'jibar_3m')).toBeCloseTo(0.0825 + ISDA_SPREAD_BPS.jibar_3m / 10000, 6);
  });
  it('urgencyBand cessation-aware', () => {
    expect(urgencyBand(-1, 'minor')).toBe('critical');
    expect(urgencyBand(20, 'minor')).toBe('critical');
    expect(urgencyBand(60, 'systemic')).toBe('critical');
    expect(urgencyBand(60, 'minor')).toBe('red');
    expect(urgencyBand(150, 'minor')).toBe('amber');
    expect(urgencyBand(365, 'minor')).toBe('green');
  });
  it('disputeConcentration clamps to [0, 1]', () => {
    expect(disputeConcentration(40, 100)).toBe(0.4);
    expect(disputeConcentration(40, 0)).toBe(0);
    expect(disputeConcentration(200, 100)).toBe(1);
  });
  it('predictedResolutionDays sums remaining windows', () => {
    expect(predictedResolutionDays('inventoried', 'minor')).toBe(0);
    const days = predictedResolutionDays('impact_assessed', 'systemic');
    expect(days).toBeGreaterThan(0);
    const minorDays = predictedResolutionDays('impact_assessed', 'minor');
    expect(minorDays).toBeGreaterThan(days);
    expect(predictedResolutionDays('transitioned_clean', 'minor')).toBe(0);
    expect(predictedResolutionDays('terminated_legacy', 'minor')).toBe(0);
  });
  it('hedgeEffectivenessFlag: true when ISDA spread <= 50bps', () => {
    expect(hedgeEffectivenessFlag('jibar_1m')).toBe(true);
    expect(hedgeEffectivenessFlag('jibar_3m')).toBe(true);
    expect(hedgeEffectivenessFlag('jibar_6m')).toBe(true);
    expect(hedgeEffectivenessFlag('jibar_12m')).toBe(true);
  });
});
