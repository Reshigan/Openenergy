// W111 — Trader Daily P&L Attribution & Risk-Adjusted Returns chain
// spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_HOURS,
  allowedActions,
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaWindowHours,
  slaDeadlineFor,
  tierForNotional,
  countFloorFlags,
  floorAtMaterial,
  floorAtSystemic,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  bridgesToTradingRiskChain,
  bridgesToPretradeCreditChain,
  bridgesToTradeReportingChain,
  sharpeRatio,
  sortinoRatio,
  informationRatio,
  maxDrawdownPct,
  attributionGapPct,
  totalDailyPnlZar,
  ifrs9StageClassification,
  pnlCompletenessIndex,
  isVarianceInvestigationImminent,
  isRestateRisk,
} from '../src/utils/pnl-attribution-spec';

// ─── State machine ──────────────────────────────────────────────────────

describe('W111 P&L Attribution — state machine (12 lifecycle + 3 branches)', () => {
  it('forward path day_open -> archived (clean EOD cycle)', () => {
    let s = nextStatus('day_open', 'run_mtm');                         expect(s).toBe('mtm_run');
    s = nextStatus(s!, 'compute_realised');                            expect(s).toBe('realised_computed');
    s = nextStatus(s!, 'compute_unrealised');                          expect(s).toBe('unrealised_computed');
    s = nextStatus(s!, 'decompose_attribution');                       expect(s).toBe('attribution_decomposed');
    s = nextStatus(s!, 'decompose_risk');                              expect(s).toBe('risk_decomposed');
    s = nextStatus(s!, 'compare_to_benchmark');                        expect(s).toBe('benchmark_compared');
    s = nextStatus(s!, 'submit_to_review');                            expect(s).toBe('reviewed');
    s = nextStatus(s!, 'approve_pnl');                                 expect(s).toBe('approved');
    s = nextStatus(s!, 'publish_pnl');                                 expect(s).toBe('published');
    s = nextStatus(s!, 'reconcile');                                   expect(s).toBe('reconciled');
    s = nextStatus(s!, 'archive_pnl');                                 expect(s).toBe('archived');
    expect(isHardTerminal('archived')).toBe(true);
  });

  it('hold_for_review -> override_hold -> reviewed loop', () => {
    expect(nextStatus('reviewed', 'hold_for_review')).toBe('held_for_review');
    expect(nextStatus('held_for_review', 'override_hold')).toBe('reviewed');
  });

  it('hold_for_review only fires from reviewed', () => {
    expect(nextStatus('approved', 'hold_for_review')).toBeNull();
    expect(nextStatus('benchmark_compared', 'hold_for_review')).toBeNull();
    expect(nextStatus('published', 'hold_for_review')).toBeNull();
  });

  it('flag_variance_investigation -> variance_investigation -> back to attribution_decomposed loop', () => {
    expect(nextStatus('attribution_decomposed', 'flag_variance_investigation')).toBe('variance_investigation');
    expect(nextStatus('variance_investigation', 'decompose_attribution')).toBe('attribution_decomposed');
  });

  it('flag_variance_investigation only fires from attribution_decomposed', () => {
    expect(nextStatus('mtm_run', 'flag_variance_investigation')).toBeNull();
    expect(nextStatus('risk_decomposed', 'flag_variance_investigation')).toBeNull();
    expect(nextStatus('reviewed', 'flag_variance_investigation')).toBeNull();
  });

  it('restate_pnl fires from published OR reconciled and loops to mtm_run via restated', () => {
    expect(nextStatus('published', 'restate_pnl')).toBe('restated');
    expect(nextStatus('reconciled', 'restate_pnl')).toBe('restated');
    expect(nextStatus('restated', 'run_mtm')).toBe('mtm_run');
  });

  it('restate_pnl does NOT fire from pre-publish states', () => {
    expect(nextStatus('day_open', 'restate_pnl')).toBeNull();
    expect(nextStatus('reviewed', 'restate_pnl')).toBeNull();
    expect(nextStatus('approved', 'restate_pnl')).toBeNull();
  });

  it('archive_pnl only from reconciled', () => {
    expect(nextStatus('reconciled', 'archive_pnl')).toBe('archived');
    expect(nextStatus('published', 'archive_pnl')).toBeNull();
    expect(nextStatus('approved', 'archive_pnl')).toBeNull();
  });

  it('hard terminals accept NO actions', () => {
    const terminals = ['archived'] as const;
    const actions = Object.keys(TRANSITIONS);
    for (const t of terminals) {
      expect(isHardTerminal(t)).toBe(true);
      expect(allowedActions(t)).toEqual([]);
      for (const a of actions) {
        expect(nextStatus(t, a as never)).toBeNull();
      }
    }
  });

  it('isTerminal == isHardTerminal for W111 (only archived terminal)', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('held_for_review')).toBe(false);
    expect(isTerminal('variance_investigation')).toBe(false);
    expect(isTerminal('restated')).toBe(false);
    expect(isTerminal('mtm_run')).toBe(false);
  });

  it('allowedActions on reviewed includes approve_pnl + hold_for_review', () => {
    const acts = allowedActions('reviewed');
    expect(acts).toContain('approve_pnl');
    expect(acts).toContain('hold_for_review');
  });

  it('allowedActions on attribution_decomposed includes decompose_risk + flag_variance', () => {
    const acts = allowedActions('attribution_decomposed');
    expect(acts).toContain('decompose_risk');
    expect(acts).toContain('flag_variance_investigation');
  });

  it('allowedActions on published includes reconcile + restate_pnl', () => {
    const acts = allowedActions('published');
    expect(acts).toContain('reconcile');
    expect(acts).toContain('restate_pnl');
  });
});

// ─── Tier derivation + FLOOR ────────────────────────────────────────────

describe('W111 tier derivation (URGENT polarity)', () => {
  it('tierForNotional maps gross notional correctly', () => {
    expect(tierForNotional(1_000_000)).toBe('minor');
    expect(tierForNotional(10_000_000)).toBe('standard');
    expect(tierForNotional(100_000_000)).toBe('standard');
    expect(tierForNotional(500_000_000)).toBe('material');
    expect(tierForNotional(1_000_000_000)).toBe('material');
    expect(tierForNotional(5_000_000_000)).toBe('systemic');
    expect(tierForNotional(50_000_000_000)).toBe('systemic');
  });

  it('tierForNotional edge cases', () => {
    expect(tierForNotional(0)).toBe('minor');
    expect(tierForNotional(null)).toBe('minor');
    expect(tierForNotional(undefined)).toBe('minor');
    expect(tierForNotional(-100)).toBe('minor');
    expect(tierForNotional(9_999_999)).toBe('minor');
    expect(tierForNotional(499_999_999)).toBe('standard');
    expect(tierForNotional(4_999_999_999)).toBe('material');
  });

  it('countFloorFlags counts true/1 flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ stress_period_active: true })).toBe(1);
    expect(countFloorFlags({ stress_period_active: 1, restated_within_30d: 1 })).toBe(2);
    expect(countFloorFlags({
      stress_period_active: true,
      restated_within_30d: true,
      large_attribution_gap_pct_5_plus: true,
      regulatory_book_FRTB_IMA: true,
      cross_border_consolidation: true,
    })).toBe(5);
  });

  it('floorAtMaterial true on any one flag', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({ stress_period_active: true })).toBe(true);
    expect(floorAtMaterial({ restated_within_30d: 1 })).toBe(true);
    expect(floorAtMaterial({ large_attribution_gap_pct_5_plus: true })).toBe(true);
  });

  it('floorAtSystemic true on 2+ flags OR FRTB IMA OR cross-border', () => {
    expect(floorAtSystemic({})).toBe(false);
    expect(floorAtSystemic({ stress_period_active: true })).toBe(false);
    expect(floorAtSystemic({ stress_period_active: true, restated_within_30d: true })).toBe(true);
    expect(floorAtSystemic({ regulatory_book_FRTB_IMA: true })).toBe(true);
    expect(floorAtSystemic({ cross_border_consolidation: true })).toBe(true);
  });

  it('effectiveTier - FLOOR-AT-MATERIAL lifts minor/standard to material on 1 flag', () => {
    expect(effectiveTier('minor', { stress_period_active: true })).toBe('material');
    expect(effectiveTier('standard', { stress_period_active: true })).toBe('material');
    expect(effectiveTier('material', { stress_period_active: true })).toBe('material');
    expect(effectiveTier('systemic', { stress_period_active: true })).toBe('systemic');
  });

  it('effectiveTier - FLOOR-AT-SYSTEMIC lifts to systemic on 2+ flags', () => {
    expect(effectiveTier('minor', { stress_period_active: true, restated_within_30d: true })).toBe('systemic');
    expect(effectiveTier('standard', { large_attribution_gap_pct_5_plus: true, stress_period_active: true })).toBe('systemic');
  });

  it('effectiveTier - FRTB IMA always systemic', () => {
    expect(effectiveTier('minor', { regulatory_book_FRTB_IMA: true })).toBe('systemic');
    expect(effectiveTier('standard', { regulatory_book_FRTB_IMA: true })).toBe('systemic');
    expect(effectiveTier('material', { regulatory_book_FRTB_IMA: true })).toBe('systemic');
  });

  it('effectiveTier - cross-border always systemic', () => {
    expect(effectiveTier('minor', { cross_border_consolidation: true })).toBe('systemic');
    expect(effectiveTier('standard', { cross_border_consolidation: true })).toBe('systemic');
  });

  it('effectiveTier - no flags = raw tier', () => {
    expect(effectiveTier('minor', {})).toBe('minor');
    expect(effectiveTier('standard', {})).toBe('standard');
    expect(effectiveTier('material', {})).toBe('material');
    expect(effectiveTier('systemic', {})).toBe('systemic');
  });

  it('isHeavyTier identifies material + systemic', () => {
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('systemic')).toBe(true);
  });

  it('isReportable matches heavy tier', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('systemic')).toBe(true);
  });
});

// ─── SLA matrix (URGENT polarity, HOURS) ────────────────────────────────

describe('W111 SLA matrix - URGENT polarity stored in HOURS', () => {
  it('day_open anchor: systemic 6h / material 12h / standard 18h / minor 24h', () => {
    expect(SLA_HOURS.day_open.systemic).toBe(6);
    expect(SLA_HOURS.day_open.material).toBe(12);
    expect(SLA_HOURS.day_open.standard).toBe(18);
    expect(SLA_HOURS.day_open.minor).toBe(24);
  });

  it('URGENT polarity: systemic tier always has the shortest window per state', () => {
    const states = [
      'day_open', 'mtm_run', 'realised_computed', 'unrealised_computed',
      'attribution_decomposed', 'risk_decomposed', 'benchmark_compared',
      'reviewed', 'approved', 'published', 'reconciled',
      'held_for_review', 'variance_investigation', 'restated',
    ] as const;
    for (const s of states) {
      const sys = SLA_HOURS[s].systemic;
      const mat = SLA_HOURS[s].material;
      const std = SLA_HOURS[s].standard;
      const min = SLA_HOURS[s].minor;
      expect(sys).toBeLessThanOrEqual(mat);
      expect(mat).toBeLessThanOrEqual(std);
      expect(std).toBeLessThanOrEqual(min);
    }
  });

  it('archived terminal has zero SLA window', () => {
    expect(SLA_HOURS.archived.minor).toBe(0);
    expect(SLA_HOURS.archived.standard).toBe(0);
    expect(SLA_HOURS.archived.material).toBe(0);
    expect(SLA_HOURS.archived.systemic).toBe(0);
  });

  it('slaWindowHours getter agrees with table', () => {
    expect(slaWindowHours('day_open', 'systemic')).toBe(6);
    expect(slaWindowHours('day_open', 'minor')).toBe(24);
    expect(slaWindowHours('archived', 'systemic')).toBe(0);
  });

  it('slaDeadlineFor adds hours to enteredAt', () => {
    const t = new Date('2026-05-30T00:00:00Z');
    const d = slaDeadlineFor('day_open', 'systemic', t);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-05-30T06:00:00.000Z');
  });

  it('slaDeadlineFor returns null on terminal state', () => {
    const t = new Date('2026-05-30T00:00:00Z');
    expect(slaDeadlineFor('archived', 'systemic', t)).toBeNull();
  });

  it('slaHoursRemaining counts down', () => {
    const entered = new Date('2026-05-30T00:00:00Z');
    const now = new Date('2026-05-30T02:00:00Z');
    const left = slaHoursRemaining('day_open', 'systemic', entered, now);
    expect(left).toBe(4);
  });

  it('slaHoursRemaining returns 0 on null enteredAt', () => {
    expect(slaHoursRemaining('day_open', 'systemic', null, new Date())).toBe(0);
  });
});

// ─── Signature regulator crossings ──────────────────────────────────────

describe('W111 SIGNATURE regulator crossings', () => {
  it('restate_pnl crosses EVERY tier when restated_within_30d (W111 signature)', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('restate_pnl', tier, { restated_within_30d: true })).toBe(true);
    }
  });

  it('restate_pnl does NOT cross when not within 30d of previous', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('restate_pnl', tier, { restated_within_30d: false })).toBe(false);
      expect(crossesIntoRegulator('restate_pnl', tier, {})).toBe(false);
    }
  });

  it('flag_variance_investigation crosses material+systemic when gap>=10%', () => {
    expect(crossesIntoRegulator('flag_variance_investigation', 'minor', { attribution_gap_pct: 15 })).toBe(false);
    expect(crossesIntoRegulator('flag_variance_investigation', 'standard', { attribution_gap_pct: 15 })).toBe(false);
    expect(crossesIntoRegulator('flag_variance_investigation', 'material', { attribution_gap_pct: 15 })).toBe(true);
    expect(crossesIntoRegulator('flag_variance_investigation', 'systemic', { attribution_gap_pct: 15 })).toBe(true);
  });

  it('flag_variance_investigation does NOT cross when gap<10%', () => {
    expect(crossesIntoRegulator('flag_variance_investigation', 'material', { attribution_gap_pct: 8 })).toBe(false);
    expect(crossesIntoRegulator('flag_variance_investigation', 'systemic', { attribution_gap_pct: 9.99 })).toBe(false);
  });

  it('approve_pnl crosses systemic only when stress_period_active', () => {
    expect(crossesIntoRegulator('approve_pnl', 'systemic', { stress_period_active: true })).toBe(true);
    expect(crossesIntoRegulator('approve_pnl', 'systemic', { stress_period_active: false })).toBe(false);
    expect(crossesIntoRegulator('approve_pnl', 'material', { stress_period_active: true })).toBe(false);
    expect(crossesIntoRegulator('approve_pnl', 'minor', { stress_period_active: true })).toBe(false);
  });

  it('publish_pnl crosses systemic only when FRTB IMA', () => {
    expect(crossesIntoRegulator('publish_pnl', 'systemic', { regulatory_book_FRTB_IMA: true })).toBe(true);
    expect(crossesIntoRegulator('publish_pnl', 'systemic', { regulatory_book_FRTB_IMA: false })).toBe(false);
    expect(crossesIntoRegulator('publish_pnl', 'material', { regulatory_book_FRTB_IMA: true })).toBe(false);
  });

  it('non-signature actions never cross', () => {
    for (const action of ['open_day', 'run_mtm', 'compute_realised', 'reconcile', 'archive_pnl'] as const) {
      expect(crossesIntoRegulator(action, 'systemic', { restated_within_30d: true, stress_period_active: true, regulatory_book_FRTB_IMA: true, attribution_gap_pct: 50 })).toBe(false);
    }
  });

  it('slaBreachCrossesIntoRegulator crosses material+systemic', () => {
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
  });
});

// ─── Party + event names ────────────────────────────────────────────────

describe('W111 actor_party routing', () => {
  it('trader writes data-gathering actions', () => {
    expect(partyForAction('open_day')).toBe('trader');
    expect(partyForAction('run_mtm')).toBe('trader');
    expect(partyForAction('compute_realised')).toBe('trader');
    expect(partyForAction('compute_unrealised')).toBe('trader');
  });

  it('risk_analyst writes decomposition actions', () => {
    expect(partyForAction('decompose_attribution')).toBe('risk_analyst');
    expect(partyForAction('decompose_risk')).toBe('risk_analyst');
    expect(partyForAction('compare_to_benchmark')).toBe('risk_analyst');
    expect(partyForAction('submit_to_review')).toBe('risk_analyst');
    expect(partyForAction('flag_variance_investigation')).toBe('risk_analyst');
  });

  it('desk_head writes approval-gate actions', () => {
    expect(partyForAction('approve_pnl')).toBe('desk_head');
    expect(partyForAction('hold_for_review')).toBe('desk_head');
    expect(partyForAction('override_hold')).toBe('desk_head');
  });

  it('market_risk_manager writes publish action', () => {
    expect(partyForAction('publish_pnl')).toBe('market_risk_manager');
  });

  it('finance writes wrap-up actions', () => {
    expect(partyForAction('reconcile')).toBe('finance');
    expect(partyForAction('archive_pnl')).toBe('finance');
  });

  it('CFO writes the SIGNATURE restate action', () => {
    expect(partyForAction('restate_pnl')).toBe('CFO');
  });

  it('eventTypeFor returns pnl_attribution prefixed events', () => {
    expect(eventTypeFor('open_day')).toBe('pnl_attribution_day_opened');
    expect(eventTypeFor('run_mtm')).toBe('pnl_attribution_mtm_ran');
    expect(eventTypeFor('approve_pnl')).toBe('pnl_attribution_approved');
    expect(eventTypeFor('restate_pnl')).toBe('pnl_attribution_restated');
    expect(eventTypeFor('publish_pnl')).toBe('pnl_attribution_published');
    expect(eventTypeFor('flag_variance_investigation')).toBe('pnl_attribution_variance_flagged');
    expect(eventTypeFor('archive_pnl')).toBe('pnl_attribution_archived');
  });
});

// ─── Authority + filing-window ──────────────────────────────────────────

describe('W111 4-step authority ladder + regulator filing window', () => {
  it('authorityRequired ladder by tier', () => {
    expect(authorityRequired('minor')).toBe('trader');
    expect(authorityRequired('standard')).toBe('desk_head');
    expect(authorityRequired('material')).toBe('market_risk_manager');
    expect(authorityRequired('systemic')).toBe('CFO');
  });

  it('regulator filing window - systemic TIGHTEST', () => {
    expect(regulatorFilingWindowHours('systemic')).toBe(1);
    expect(regulatorFilingWindowHours('material')).toBe(4);
    expect(regulatorFilingWindowHours('standard')).toBe(24);
    expect(regulatorFilingWindowHours('minor')).toBe(72);
  });
});

// ─── Urgency band ───────────────────────────────────────────────────────

describe('W111 urgency band - URGENT polarity', () => {
  it('systemic tier has the tightest urgency boundaries', () => {
    expect(urgencyBand('systemic', 0.5)).toBe('critical');
    expect(urgencyBand('systemic', 2)).toBe('high');
    expect(urgencyBand('systemic', 5)).toBe('medium');
    expect(urgencyBand('systemic', 100)).toBe('low');
  });

  it('material tier urgency', () => {
    expect(urgencyBand('material', 1)).toBe('critical');
    expect(urgencyBand('material', 5)).toBe('high');
    expect(urgencyBand('material', 10)).toBe('medium');
    expect(urgencyBand('material', 100)).toBe('low');
  });

  it('minor tier urgency - biggest windows', () => {
    expect(urgencyBand('minor', 4)).toBe('critical');
    expect(urgencyBand('minor', 10)).toBe('high');
    expect(urgencyBand('minor', 20)).toBe('medium');
    expect(urgencyBand('minor', 100)).toBe('low');
  });

  it('negative SLA hours always critical regardless of tier', () => {
    for (const t of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(urgencyBand(t, -1)).toBe('critical');
    }
  });
});

// ─── 3-bridge architecture ──────────────────────────────────────────────

describe('W111 3-bridge architecture (W2/W107/W44)', () => {
  it('bridgesToTradingRiskChain true on non-null ref', () => {
    expect(bridgesToTradingRiskChain('tr-123')).toBe(true);
    expect(bridgesToTradingRiskChain(null)).toBe(false);
    expect(bridgesToTradingRiskChain(undefined)).toBe(false);
    expect(bridgesToTradingRiskChain('')).toBe(false);
  });

  it('bridgesToPretradeCreditChain true on non-null ref', () => {
    expect(bridgesToPretradeCreditChain('ptc-456')).toBe(true);
    expect(bridgesToPretradeCreditChain(null)).toBe(false);
  });

  it('bridgesToTradeReportingChain true on non-null ref', () => {
    expect(bridgesToTradeReportingChain('tr-789')).toBe(true);
    expect(bridgesToTradeReportingChain(null)).toBe(false);
  });
});

// ─── LIVE battery computations ──────────────────────────────────────────

describe('W111 LIVE battery - performance ratios (GIPS 2020)', () => {
  it('sharpeRatio = (return - rf) / stdev', () => {
    // r=0.002, rf=0.0001, s=0.01 -> (0.002 - 0.0001) / 0.01 = 0.19
    expect(sharpeRatio(0.002, 0.01, 0.0001)).toBeCloseTo(0.19, 2);
  });

  it('sharpeRatio uses default daily risk-free when not provided', () => {
    // 8.25% / 252 = 0.000327...; r=0.002, s=0.01 -> (0.002 - 0.000327) / 0.01 ~= 0.167
    const v = sharpeRatio(0.002, 0.01);
    expect(v).toBeGreaterThan(0.16);
    expect(v).toBeLessThan(0.18);
  });

  it('sharpeRatio returns 0 on bad inputs', () => {
    expect(sharpeRatio(0.002, 0)).toBe(0);
    expect(sharpeRatio(0.002, -0.01)).toBe(0);
    expect(sharpeRatio(null, 0.01)).not.toBeNaN();
    expect(sharpeRatio(undefined, undefined)).toBe(0);
  });

  it('sortinoRatio = (return - rf) / downside_stdev', () => {
    expect(sortinoRatio(0.002, 0.005, 0.0001)).toBeCloseTo(0.38, 2);
  });

  it('sortinoRatio returns 0 on bad inputs', () => {
    expect(sortinoRatio(0.002, 0)).toBe(0);
    expect(sortinoRatio(0.002, -1)).toBe(0);
  });

  it('informationRatio = (return - benchmark) / tracking_error', () => {
    // r=0.003, b=0.001, te=0.005 -> 0.002 / 0.005 = 0.4
    expect(informationRatio(0.003, 0.001, 0.005)).toBeCloseTo(0.4, 2);
  });

  it('informationRatio returns 0 on zero tracking error', () => {
    expect(informationRatio(0.003, 0.001, 0)).toBe(0);
    expect(informationRatio(0.003, 0.001, null)).toBe(0);
  });

  it('maxDrawdownPct = (peak - trough) / peak * 100', () => {
    expect(maxDrawdownPct(1000, 800)).toBe(20);
    expect(maxDrawdownPct(1_000_000, 850_000)).toBe(15);
    expect(maxDrawdownPct(1000, 1000)).toBe(0);
    expect(maxDrawdownPct(1000, 1200)).toBe(0); // recovered / no DD
    expect(maxDrawdownPct(0, 0)).toBe(0);
  });

  it('attributionGapPct = |residual| / |gross| * 100', () => {
    expect(attributionGapPct(50_000, 1_000_000)).toBe(5);
    expect(attributionGapPct(-50_000, 1_000_000)).toBe(5);
    expect(attributionGapPct(150_000, 1_000_000)).toBe(15);
    expect(attributionGapPct(0, 1_000_000)).toBe(0);
    expect(attributionGapPct(100, 0)).toBe(0);
  });

  it('totalDailyPnlZar = realised + unrealised', () => {
    expect(totalDailyPnlZar(100_000, 50_000)).toBe(150_000);
    expect(totalDailyPnlZar(-100_000, 50_000)).toBe(-50_000);
    expect(totalDailyPnlZar(null, 50_000)).toBe(50_000);
    expect(totalDailyPnlZar(undefined, undefined)).toBe(0);
  });
});

describe('W111 LIVE battery - IFRS 9 stage classification', () => {
  it('Stage 3: second restatement within 30d AND gap>=10%', () => {
    expect(ifrs9StageClassification({
      attribution_gap_pct: 12,
      restated_within_30d: true,
    })).toBe('stage_3');
  });

  it('Stage 3: attribution gap >= 20%', () => {
    expect(ifrs9StageClassification({ attribution_gap_pct: 25 })).toBe('stage_3');
  });

  it('Stage 3: stress + catastrophic loss day', () => {
    expect(ifrs9StageClassification({
      stress_period_active: true,
      total_daily_pnl_zar: -200_000_000,
    })).toBe('stage_3');
  });

  it('Stage 2: gap >= 10% but no second restate', () => {
    expect(ifrs9StageClassification({ attribution_gap_pct: 12 })).toBe('stage_2');
  });

  it('Stage 2: stress period active', () => {
    expect(ifrs9StageClassification({ stress_period_active: true })).toBe('stage_2');
  });

  it('Stage 2: single restatement (not within 30d signature)', () => {
    expect(ifrs9StageClassification({ restated_within_30d: true })).toBe('stage_2');
  });

  it('Stage 2: negative material P&L (<-R10m)', () => {
    expect(ifrs9StageClassification({ total_daily_pnl_zar: -15_000_000 })).toBe('stage_2');
  });

  it('Stage 1: clean day', () => {
    expect(ifrs9StageClassification({
      attribution_gap_pct: 2,
      total_daily_pnl_zar: 500_000,
    })).toBe('stage_1');
    expect(ifrs9StageClassification({})).toBe('stage_1');
  });
});

describe('W111 LIVE battery - completeness + risk flags', () => {
  it('pnlCompletenessIndex 0-130 with bonus headroom', () => {
    expect(pnlCompletenessIndex({})).toBe(0);
    expect(pnlCompletenessIndex({
      mtm_run: true,
      realised_computed: true,
      unrealised_computed: true,
      attribution_decomposed: true,
      risk_decomposed: true,
      benchmark_compared: true,
      reviewed: true,
      approved: true,
      published: true,
      reconciled: true,
      archived: true,
    })).toBe(110);
    expect(pnlCompletenessIndex({
      mtm_run: true,
      realised_computed: true,
      unrealised_computed: true,
      attribution_decomposed: true,
      risk_decomposed: true,
      benchmark_compared: true,
      reviewed: true,
      approved: true,
      published: true,
      reconciled: true,
      archived: true,
      no_hold_bonus: true,
      no_variance_bonus: true,
      no_restate_bonus: true,
      ifrs9_stage1_bonus: true,
    })).toBe(130);
  });

  it('isVarianceInvestigationImminent: within 1pct of 10% threshold', () => {
    expect(isVarianceInvestigationImminent('attribution_decomposed', 9.5)).toBe(true);
    expect(isVarianceInvestigationImminent('attribution_decomposed', 9.99)).toBe(true);
    expect(isVarianceInvestigationImminent('attribution_decomposed', 10)).toBe(false);
    expect(isVarianceInvestigationImminent('attribution_decomposed', 8)).toBe(false);
    expect(isVarianceInvestigationImminent('mtm_run', 9.5)).toBe(false);
  });

  it('isRestateRisk: post-publish AND gap>=5%', () => {
    expect(isRestateRisk('published', 5)).toBe(true);
    expect(isRestateRisk('published', 8)).toBe(true);
    expect(isRestateRisk('reconciled', 5)).toBe(true);
    expect(isRestateRisk('published', 4)).toBe(false);
    expect(isRestateRisk('approved', 10)).toBe(false);
    expect(isRestateRisk('archived', 10)).toBe(false);
  });
});
