// W107 — Trader Pre-Trade Credit Check & Settlement-Risk Exposure chain spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MS,
  allowedActions,
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaWindowMs,
  slaDeadlineFor,
  tierForNotional,
  countFloorFlags,
  floorAtMaterial,
  floorAtSystemic,
  effectiveTier,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  pretradeGateCompletenessIndex,
  creditLineUtilizationPct,
  settlementRiskScore,
  concentrationRatioPct,
  kycRecencyDays,
  markAgeSeconds,
  haltStatusBand,
  slaSecondsRemaining,
  urgencyBand,
  breachImminentFlag,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToTradingRiskChain,
  bridgesToPositionLimitChain,
  bridgesToCounterpartyMarginChain,
} from '../src/utils/pretrade-credit-spec';

describe('W107 Pre-Trade Credit — state machine (12 lifecycle states)', () => {
  it('forward path order_submitted → archived (clean clear)', () => {
    let s = nextStatus('order_submitted', 'verify_kyc');                    expect(s).toBe('kyc_verified');
    s = nextStatus(s!, 'check_credit_line');                                expect(s).toBe('credit_line_checked');
    s = nextStatus(s!, 'assess_settlement_risk');                           expect(s).toBe('settlement_risk_assessed');
    s = nextStatus(s!, 'check_concentration');                              expect(s).toBe('concentration_checked');
    s = nextStatus(s!, 'verify_halt_status');                               expect(s).toBe('halt_status_verified');
    s = nextStatus(s!, 'validate_mark_age');                                expect(s).toBe('mark_age_validated');
    s = nextStatus(s!, 'clear_order');                                      expect(s).toBe('cleared');
    s = nextStatus(s!, 'archive_check');                                    expect(s).toBe('archived');
  });

  it('held_for_review branch: gate → held_for_review → manually_cleared → cleared', () => {
    let s = nextStatus('credit_line_checked', 'hold_for_review');           expect(s).toBe('held_for_review');
    s = nextStatus(s!, 'manually_clear');                                   expect(s).toBe('manually_cleared');
    s = nextStatus(s!, 'clear_order');                                      expect(s).toBe('cleared');
  });

  it('held_for_review branch: held → manually_rejected → rejected', () => {
    let s = nextStatus('settlement_risk_assessed', 'hold_for_review');      expect(s).toBe('held_for_review');
    s = nextStatus(s!, 'manually_reject');                                  expect(s).toBe('manually_rejected');
    s = nextStatus(s!, 'reject_order');                                     expect(s).toBe('rejected');
  });

  it('rejected → cleared via override_rejection (compliance override)', () => {
    let s: ReturnType<typeof nextStatus> = 'rejected';
    s = nextStatus(s, 'override_rejection');                                expect(s).toBe('cleared');
    // and archive after override
    s = nextStatus(s!, 'archive_check');                                    expect(s).toBe('archived');
  });

  it('reject_order fires from every pre-clear gate AND from held_for_review AND manually_rejected', () => {
    const rejectable = [
      'order_submitted', 'kyc_verified', 'credit_line_checked',
      'settlement_risk_assessed', 'concentration_checked',
      'halt_status_verified', 'mark_age_validated',
      'held_for_review', 'manually_rejected',
    ] as const;
    for (const s of rejectable) {
      expect(nextStatus(s, 'reject_order')).toBe('rejected');
    }
  });

  it('hold_for_review fires from every pre-clear gate', () => {
    const gateable = [
      'order_submitted', 'kyc_verified', 'credit_line_checked',
      'settlement_risk_assessed', 'concentration_checked',
      'halt_status_verified', 'mark_age_validated',
    ] as const;
    for (const s of gateable) {
      expect(nextStatus(s, 'hold_for_review')).toBe('held_for_review');
    }
  });

  it('archive_check fires from cleared OR rejected only', () => {
    expect(nextStatus('cleared', 'archive_check')).toBe('archived');
    expect(nextStatus('rejected', 'archive_check')).toBe('archived');
    expect(nextStatus('manually_cleared', 'archive_check')).toBeNull();
    expect(nextStatus('held_for_review', 'archive_check')).toBeNull();
  });

  it('hard terminal (archived) rejects every action', () => {
    expect(nextStatus('archived', 'verify_kyc')).toBeNull();
    expect(nextStatus('archived', 'override_rejection')).toBeNull();
    expect(nextStatus('archived', 'archive_check')).toBeNull();
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
  });

  it('cleared + rejected are SOFT terminals — UI-terminal but still accept further actions', () => {
    expect(isTerminal('cleared')).toBe(true);
    expect(isTerminal('rejected')).toBe(true);
    expect(isHardTerminal('cleared')).toBe(false);
    expect(isHardTerminal('rejected')).toBe(false);
    expect(nextStatus('cleared', 'archive_check')).toBe('archived');
    expect(nextStatus('rejected', 'override_rejection')).toBe('cleared');
    expect(nextStatus('rejected', 'archive_check')).toBe('archived');
  });

  it('non-terminal states are NOT marked terminal', () => {
    const open = [
      'order_submitted', 'kyc_verified', 'credit_line_checked',
      'settlement_risk_assessed', 'concentration_checked',
      'halt_status_verified', 'mark_age_validated',
      'held_for_review', 'manually_cleared', 'manually_rejected',
    ] as const;
    for (const s of open) {
      expect(isTerminal(s)).toBe(false);
      expect(isHardTerminal(s)).toBe(false);
    }
  });

  it('allowedActions surfaces every legal action per state', () => {
    expect(allowedActions('order_submitted')).toEqual(
      expect.arrayContaining(['verify_kyc', 'hold_for_review', 'reject_order']),
    );
    expect(allowedActions('mark_age_validated')).toEqual(
      expect.arrayContaining(['clear_order', 'hold_for_review', 'reject_order']),
    );
    expect(allowedActions('held_for_review')).toEqual(
      expect.arrayContaining(['manually_clear', 'manually_reject', 'reject_order']),
    );
    expect(allowedActions('rejected')).toEqual(
      expect.arrayContaining(['override_rejection', 'archive_check']),
    );
    expect(allowedActions('archived')).toEqual([]);
  });

  it('TRANSITIONS table covers all 14 actions', () => {
    const actions = Object.keys(TRANSITIONS);
    expect(actions).toHaveLength(14);
    expect(new Set(actions).size).toBe(14);
  });
});

describe('W107 Pre-Trade Credit — URGENT SLA polarity (larger notional = TIGHTER, sub-second)', () => {
  it('SLA decreases strictly micro → systemic for every graded state', () => {
    const graded = [
      'order_submitted', 'kyc_verified', 'credit_line_checked',
      'settlement_risk_assessed', 'concentration_checked',
      'halt_status_verified', 'mark_age_validated', 'held_for_review',
    ] as const;
    for (const s of graded) {
      const row = SLA_MS[s];
      expect(row.micro).toBeGreaterThan(row.standard);
      expect(row.standard).toBeGreaterThan(row.material);
      expect(row.material).toBeGreaterThan(row.systemic);
    }
  });

  it('SIGNATURE: order_submitted systemic 500ms / material 2s / standard 10s / micro 30s', () => {
    expect(SLA_MS.order_submitted.systemic).toBe(500);
    expect(SLA_MS.order_submitted.material).toBe(2000);
    expect(SLA_MS.order_submitted.standard).toBe(10_000);
    expect(SLA_MS.order_submitted.micro).toBe(30_000);
  });

  it('terminals carry no SLA deadline', () => {
    for (const t of ['cleared', 'rejected', 'archived'] as const) {
      expect(slaWindowMs(t, 'systemic')).toBe(0);
      expect(slaDeadlineFor(t, 'systemic', new Date())).toBeNull();
    }
  });

  it('slaDeadlineFor advances by configured window in milliseconds', () => {
    const t0 = new Date('2026-05-30T00:00:00.000Z');
    const d = slaDeadlineFor('order_submitted', 'systemic', t0);
    expect(d).not.toBeNull();
    // 500ms after t0
    expect(d!.getTime() - t0.getTime()).toBe(500);
  });
});

describe('W107 Pre-Trade Credit — tier re-derivation from notional', () => {
  it('tierForNotional band boundaries', () => {
    expect(tierForNotional(0)).toBe('micro');
    expect(tierForNotional(500_000)).toBe('micro');
    expect(tierForNotional(1_000_000)).toBe('standard');
    expect(tierForNotional(9_000_000)).toBe('standard');
    expect(tierForNotional(10_000_000)).toBe('material');
    expect(tierForNotional(50_000_000)).toBe('material');
    expect(tierForNotional(100_000_000)).toBe('systemic');
    expect(tierForNotional(500_000_000)).toBe('systemic');
  });

  it('tierForNotional defends against null / negative / NaN', () => {
    expect(tierForNotional(null)).toBe('micro');
    expect(tierForNotional(undefined)).toBe('micro');
    expect(tierForNotional(-1)).toBe('micro');
    expect(tierForNotional(NaN)).toBe('micro');
  });

  it('countFloorFlags counts truthy floors across all 5', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ cross_border_settlement: true })).toBe(1);
    expect(countFloorFlags({
      cross_border_settlement: true,
      counterparty_credit_grade_below_B: true,
      concentration_above_25pct: true,
      halted_underlying: true,
      first_trade_with_counterparty: true,
    })).toBe(5);
    expect(countFloorFlags({ cross_border_settlement: 1, concentration_above_25pct: 1 })).toBe(2);
  });

  it('floorAtMaterial fires on any one of the five flags', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({ concentration_above_25pct: true })).toBe(true);
    expect(floorAtMaterial({ halted_underlying: true })).toBe(true);
    expect(floorAtMaterial({ first_trade_with_counterparty: true })).toBe(true);
    expect(floorAtMaterial({ counterparty_credit_grade_below_B: true })).toBe(true);
  });

  it('floorAtSystemic fires only on cross_border_settlement OR counterparty_credit_grade_below_B', () => {
    expect(floorAtSystemic({})).toBe(false);
    expect(floorAtSystemic({ concentration_above_25pct: true })).toBe(false);
    expect(floorAtSystemic({ halted_underlying: true })).toBe(false);
    expect(floorAtSystemic({ first_trade_with_counterparty: true })).toBe(false);
    expect(floorAtSystemic({ cross_border_settlement: true })).toBe(true);
    expect(floorAtSystemic({ counterparty_credit_grade_below_B: true })).toBe(true);
  });

  it('effectiveTier: 1 floor flag promotes micro+standard to material', () => {
    expect(effectiveTier('micro', { concentration_above_25pct: true })).toBe('material');
    expect(effectiveTier('standard', { halted_underlying: true })).toBe('material');
    // material stays material with 1 flag
    expect(effectiveTier('material', { first_trade_with_counterparty: true })).toBe('material');
    // systemic stays systemic
    expect(effectiveTier('systemic', { first_trade_with_counterparty: true })).toBe('systemic');
  });

  it('effectiveTier: 2+ floor flags → systemic', () => {
    expect(effectiveTier('micro', {
      concentration_above_25pct: true,
      halted_underlying: true,
    })).toBe('systemic');
    expect(effectiveTier('standard', {
      concentration_above_25pct: true,
      halted_underlying: true,
      first_trade_with_counterparty: true,
    })).toBe('systemic');
  });

  it('effectiveTier: systemic floor flags (cross_border, below_B) force systemic regardless of raw tier', () => {
    expect(effectiveTier('micro', { cross_border_settlement: true })).toBe('systemic');
    expect(effectiveTier('micro', { counterparty_credit_grade_below_B: true })).toBe('systemic');
    expect(effectiveTier('standard', { cross_border_settlement: true })).toBe('systemic');
  });

  it('effectiveTier: no flags returns raw tier', () => {
    expect(effectiveTier('micro', {})).toBe('micro');
    expect(effectiveTier('standard', {})).toBe('standard');
    expect(effectiveTier('material', {})).toBe('material');
    expect(effectiveTier('systemic', {})).toBe('systemic');
  });

  it('isHeavyTier identifies material + systemic only', () => {
    expect(isHeavyTier('micro')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('systemic')).toBe(true);
  });

  it('isReportable matches heavy tiers', () => {
    expect(isReportable('micro')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('systemic')).toBe(true);
  });
});

describe('W107 Pre-Trade Credit — SIGNATURE regulator crossings', () => {
  it('reject_order crosses regulator EVERY tier when counterparty_credit_grade_below_B=TRUE (signature)', () => {
    for (const tier of ['micro', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('reject_order', tier, {
        counterparty_credit_grade_below_B: true,
      })).toBe(true);
    }
  });

  it('reject_order does NOT cross when counterparty_credit_grade_below_B=false', () => {
    for (const tier of ['micro', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('reject_order', tier, {
        counterparty_credit_grade_below_B: false,
      })).toBe(false);
    }
  });

  it('override_rejection crosses regulator EVERY tier (compliance override always reportable)', () => {
    for (const tier of ['micro', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('override_rejection', tier, {})).toBe(true);
    }
  });

  it('hold_for_review crosses regulator on material+systemic when SLA-triggered', () => {
    expect(crossesIntoRegulator('hold_for_review', 'material', { hold_triggered_by_sla: true })).toBe(true);
    expect(crossesIntoRegulator('hold_for_review', 'systemic', { hold_triggered_by_sla: true })).toBe(true);
    expect(crossesIntoRegulator('hold_for_review', 'standard', { hold_triggered_by_sla: true })).toBe(false);
    expect(crossesIntoRegulator('hold_for_review', 'micro', { hold_triggered_by_sla: true })).toBe(false);
  });

  it('hold_for_review does NOT cross when not SLA-triggered', () => {
    expect(crossesIntoRegulator('hold_for_review', 'systemic', { hold_triggered_by_sla: false })).toBe(false);
    expect(crossesIntoRegulator('hold_for_review', 'material', {})).toBe(false);
  });

  it('other actions never cross regulator on their own', () => {
    for (const a of ['verify_kyc', 'check_credit_line', 'clear_order', 'archive_check', 'manually_clear'] as const) {
      for (const tier of ['micro', 'standard', 'material', 'systemic'] as const) {
        expect(crossesIntoRegulator(a, tier, {})).toBe(false);
      }
    }
  });

  it('slaBreachCrossesIntoRegulator on systemic only (BIS PFMI §3.5)', () => {
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('micro')).toBe(false);
  });
});

describe('W107 Pre-Trade Credit — party + event mapping', () => {
  it('trader drives submit_order', () => {
    expect(partyForAction('submit_order')).toBe('trader');
  });

  it('risk_system drives verify_kyc / check_credit_line / settlement / concentration / halt / mark / clear', () => {
    expect(partyForAction('verify_kyc')).toBe('risk_system');
    expect(partyForAction('check_credit_line')).toBe('risk_system');
    expect(partyForAction('assess_settlement_risk')).toBe('risk_system');
    expect(partyForAction('check_concentration')).toBe('risk_system');
    expect(partyForAction('verify_halt_status')).toBe('risk_system');
    expect(partyForAction('validate_mark_age')).toBe('risk_system');
    expect(partyForAction('clear_order')).toBe('risk_system');
  });

  it('compliance drives hold_for_review / manually_clear / manually_reject / reject_order / override_rejection', () => {
    expect(partyForAction('hold_for_review')).toBe('compliance');
    expect(partyForAction('manually_clear')).toBe('compliance');
    expect(partyForAction('manually_reject')).toBe('compliance');
    expect(partyForAction('reject_order')).toBe('compliance');
    expect(partyForAction('override_rejection')).toBe('compliance');
  });

  it('archiver drives archive_check', () => {
    expect(partyForAction('archive_check')).toBe('archiver');
  });

  it('eventTypeFor returns a pretrade_credit event for every action', () => {
    expect(eventTypeFor('submit_order')).toBe('pretrade_credit.order_submitted');
    expect(eventTypeFor('verify_kyc')).toBe('pretrade_credit.kyc_verified');
    expect(eventTypeFor('clear_order')).toBe('pretrade_credit_cleared');
    expect(eventTypeFor('reject_order')).toBe('pretrade_credit_rejected');
    expect(eventTypeFor('hold_for_review')).toBe('pretrade_credit_held_for_review');
    expect(eventTypeFor('override_rejection')).toBe('pretrade_credit_overridden');
    expect(eventTypeFor('archive_check')).toBe('pretrade_credit.archived');
  });
});

describe('W107 Pre-Trade Credit — LIVE battery (14-field decoration)', () => {
  it('pretradeGateCompletenessIndex peaks at 130 with all components', () => {
    expect(pretradeGateCompletenessIndex({
      kyc_verified: true,
      credit_line_checked: true,
      settlement_risk_assessed: true,
      concentration_checked: true,
      halt_status_verified: true,
      mark_age_validated: true,
      cleared: true,
      clean_concentration_bonus: true,
      clean_halt_bonus: true,
      fresh_kyc_bonus: true,
      fresh_mark_bonus: true,
      sub_sla_decision_bonus: true,
    })).toBe(130);
  });

  it('pretradeGateCompletenessIndex partial component sum', () => {
    expect(pretradeGateCompletenessIndex({
      kyc_verified: true,
      credit_line_checked: true,
    })).toBe(30);
    expect(pretradeGateCompletenessIndex({})).toBe(0);
  });

  it('creditLineUtilizationPct computes used / limit %', () => {
    expect(creditLineUtilizationPct(300_000, 1_000_000)).toBe(30);
    expect(creditLineUtilizationPct(950_000, 1_000_000)).toBe(95);
    expect(creditLineUtilizationPct(0, 1_000_000)).toBe(0);
    expect(creditLineUtilizationPct(100_000, 0)).toBe(0);
    expect(creditLineUtilizationPct(null, 1_000_000)).toBe(0);
  });

  it('settlementRiskScore composes counterparty/DvP/currency/tenor into 0-100', () => {
    expect(settlementRiskScore({})).toBe(0);
    expect(settlementRiskScore({ counterparty_credit_grade_below_B: true })).toBe(40);
    expect(settlementRiskScore({
      counterparty_credit_grade_below_B: true,
      dvp_pvp_unavailable: true,
      currency_mismatch: true,
      tenor_days: 60,
    })).toBe(100);
    expect(settlementRiskScore({ tenor_days: 15 })).toBe(0);
    expect(settlementRiskScore({ tenor_days: 31 })).toBe(15);
  });

  it('concentrationRatioPct = single_name / book_value %', () => {
    expect(concentrationRatioPct(250_000, 1_000_000)).toBe(25);
    expect(concentrationRatioPct(150_000, 1_000_000)).toBe(15);
    expect(concentrationRatioPct(0, 1_000_000)).toBe(0);
    expect(concentrationRatioPct(100_000, 0)).toBe(0);
  });

  it('kycRecencyDays counts days since kyc_verified_at', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(kycRecencyDays('2026-05-29T00:00:00Z', now)).toBe(1);
    expect(kycRecencyDays('2026-05-01T00:00:00Z', now)).toBe(29);
    expect(kycRecencyDays(null, now)).toBe(9999);
    expect(kycRecencyDays('2026-06-01T00:00:00Z', now)).toBe(0);
  });

  it('markAgeSeconds counts seconds since last_mark_at', () => {
    const now = new Date('2026-05-30T00:01:00Z');
    expect(markAgeSeconds('2026-05-30T00:00:00Z', now)).toBe(60);
    expect(markAgeSeconds('2026-05-30T00:00:30Z', now)).toBe(30);
    expect(markAgeSeconds(null, now)).toBe(9999);
  });

  it('haltStatusBand: none / partial / full', () => {
    expect(haltStatusBand({})).toBe('none');
    expect(haltStatusBand({ partial_halt_flag: true })).toBe('partial');
    expect(haltStatusBand({ underlying_halted: true })).toBe('full');
    // full overrides partial
    expect(haltStatusBand({ underlying_halted: true, partial_halt_flag: true })).toBe('full');
  });

  it('slaSecondsRemaining can go negative when breached', () => {
    const entered = new Date('2026-05-30T00:00:00.000Z');
    const now = new Date('2026-05-30T00:00:05.000Z'); // 5s later
    // order_submitted × systemic = 500ms → already 4.5s past
    const left = slaSecondsRemaining('order_submitted', 'systemic', entered, now);
    expect(left).toBeLessThan(0);
  });

  it('slaSecondsRemaining counts down', () => {
    const entered = new Date('2026-05-30T00:00:00.000Z');
    const now = new Date('2026-05-30T00:00:01.000Z'); // 1s after entry
    // order_submitted × micro = 30s → 29s left
    const left = slaSecondsRemaining('order_submitted', 'micro', entered, now);
    expect(left).toBeGreaterThan(25);
    expect(left).toBeLessThan(31);
  });

  it('slaSecondsRemaining returns 0 for terminals + null entry', () => {
    expect(slaSecondsRemaining('cleared', 'systemic', new Date(), new Date())).toBe(0);
    expect(slaSecondsRemaining('order_submitted', 'systemic', null, new Date())).toBe(0);
  });

  it('urgencyBand composes tier + SLA seconds into critical/high/medium/low', () => {
    expect(urgencyBand('systemic', 3600)).toBe('critical');
    expect(urgencyBand('material', 3600)).toBe('high');
    expect(urgencyBand('standard', 3600)).toBe('medium');
    expect(urgencyBand('micro', 3600)).toBe('low');
    expect(urgencyBand('micro', -1)).toBe('critical');
    expect(urgencyBand('micro', 1)).toBe('critical');
    expect(urgencyBand('micro', 5)).toBe('high');
    expect(urgencyBand('micro', 20)).toBe('medium');
  });

  it('breachImminentFlag fires within 25% of SLA window', () => {
    // order_submitted × systemic = 500ms window → 25% = 125ms = 0.125s
    expect(breachImminentFlag('order_submitted', 'systemic', 0.1)).toBe(true);
    expect(breachImminentFlag('order_submitted', 'systemic', 0.05)).toBe(true);
    expect(breachImminentFlag('order_submitted', 'systemic', 0.2)).toBe(false);
    expect(breachImminentFlag('order_submitted', 'systemic', -1)).toBe(false);
    // terminal — no SLA window
    expect(breachImminentFlag('cleared', 'systemic', 0.1)).toBe(false);
  });

  it('authorityRequired ladder: junior_trader → CRO', () => {
    expect(authorityRequired('micro')).toBe('junior_trader');
    expect(authorityRequired('standard')).toBe('desk_head');
    expect(authorityRequired('material')).toBe('market_risk_manager');
    expect(authorityRequired('systemic')).toBe('CRO');
  });

  it('regulatorFilingWindowHours tightens with tier', () => {
    expect(regulatorFilingWindowHours('systemic')).toBe(4);
    expect(regulatorFilingWindowHours('material')).toBe(24);
    expect(regulatorFilingWindowHours('standard')).toBe(72);
    expect(regulatorFilingWindowHours('micro')).toBe(168);
  });

  it('bridgesToTradingRiskChain fires when notional > VaR limit (W2 link)', () => {
    expect(bridgesToTradingRiskChain(5_000_000, 1_000_000)).toBe(true);
    expect(bridgesToTradingRiskChain(500_000, 1_000_000)).toBe(false);
    expect(bridgesToTradingRiskChain(5_000_000, 0)).toBe(false);
    expect(bridgesToTradingRiskChain(null, 1_000_000)).toBe(false);
  });

  it('bridgesToPositionLimitChain fires when (current + increment) > limit (W29 link)', () => {
    expect(bridgesToPositionLimitChain(8_000_000, 3_000_000, 10_000_000)).toBe(true);
    expect(bridgesToPositionLimitChain(3_000_000, 3_000_000, 10_000_000)).toBe(false);
    expect(bridgesToPositionLimitChain(0, 0, 0)).toBe(false);
  });

  it('bridgesToCounterpartyMarginChain fires when counterparty_margin_ref is set (W68 link)', () => {
    expect(bridgesToCounterpartyMarginChain(null)).toBe(false);
    expect(bridgesToCounterpartyMarginChain('')).toBe(false);
    expect(bridgesToCounterpartyMarginChain('ccm-001')).toBe(true);
  });
});
