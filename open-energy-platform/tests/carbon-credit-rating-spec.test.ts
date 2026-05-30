// W109 — Carbon Credit Quality Rating & Continuous Re-rating chain spec tests.
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
  tierForScale,
  countFloorFlags,
  floorAtPremium,
  floorAtInstitutional,
  effectiveTier,
  isHeavyTier,
  isReportable,
  computeCompositeScore,
  deriveRatingBand,
  isInvestmentGrade,
  isDistressedBand,
  compositeDropPct,
  downgradeImminent,
  isMaterialDowngrade,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  regulatorFilingWindowHours,
  vintageAgeYears,
  monitoringFreshnessDays,
  monitoringDataStale,
  MONITORING_STALE_DAYS,
  bridgesToRegistrationChain,
  bridgesToMrvChain,
  bridgesToReversalChain,
  reratingTriggerCount30d,
  ratingCompletenessIndex,
} from '../src/utils/carbon-credit-rating-spec';

// ─── State machine ──────────────────────────────────────────────────────

describe('W109 Carbon Credit Rating — state machine (12 lifecycle + 3 terminal branches)', () => {
  it('forward path rating_requested → re_rated (clean rating cycle)', () => {
    let s = nextStatus('rating_requested', 'start_desk_review');         expect(s).toBe('desk_review');
    s = nextStatus(s!, 'score_methodology');                              expect(s).toBe('methodology_score');
    s = nextStatus(s!, 'score_additionality');                            expect(s).toBe('additionality_score');
    s = nextStatus(s!, 'score_permanence');                               expect(s).toBe('permanence_score');
    s = nextStatus(s!, 'score_leakage');                                  expect(s).toBe('leakage_score');
    s = nextStatus(s!, 'score_cobenefits');                               expect(s).toBe('cobenefit_score');
    s = nextStatus(s!, 'compute_composite');                              expect(s).toBe('composite_score');
    s = nextStatus(s!, 'publish_rating');                                 expect(s).toBe('published');
    s = nextStatus(s!, 'start_monitoring');                               expect(s).toBe('monitoring');
    s = nextStatus(s!, 'trigger_rerating');                               expect(s).toBe('re_rating_triggered');
    s = nextStatus(s!, 'rerate');                                         expect(s).toBe('re_rated');
    expect(isHardTerminal('re_rated')).toBe(true);
  });

  it('downgrade fires from monitoring + re_rating_triggered → downgraded (soft terminal)', () => {
    expect(nextStatus('monitoring', 'downgrade')).toBe('downgraded');
    expect(nextStatus('re_rating_triggered', 'downgrade')).toBe('downgraded');
    expect(isTerminal('downgraded')).toBe(true);
    expect(isHardTerminal('downgraded')).toBe(false);
  });

  it('remediate fires from downgraded → monitoring (re-entry)', () => {
    expect(nextStatus('downgraded', 'remediate')).toBe('monitoring');
  });

  it('withdraw fires from every pre-published state → withdrawn (hard terminal)', () => {
    const pre = [
      'rating_requested', 'desk_review', 'methodology_score',
      'additionality_score', 'permanence_score', 'leakage_score',
      'cobenefit_score', 'composite_score',
    ] as const;
    for (const s of pre) {
      expect(nextStatus(s, 'withdraw')).toBe('withdrawn');
    }
    expect(isHardTerminal('withdrawn')).toBe(true);
  });

  it('withdraw does NOT fire from published, monitoring, or terminals', () => {
    expect(nextStatus('published', 'withdraw')).toBeNull();
    expect(nextStatus('monitoring', 'withdraw')).toBeNull();
    expect(nextStatus('re_rated', 'withdraw')).toBeNull();
  });

  it('escalate_to_integrity fires from every non-terminal state', () => {
    const all = [
      'rating_requested', 'desk_review', 'methodology_score',
      'additionality_score', 'permanence_score', 'leakage_score',
      'cobenefit_score', 'composite_score', 'published', 'monitoring',
      're_rating_triggered',
    ] as const;
    for (const s of all) {
      expect(nextStatus(s, 'escalate_to_integrity')).toBe('escalated_to_integrity');
    }
    expect(isHardTerminal('escalated_to_integrity')).toBe(true);
  });

  it('hard terminals reject ALL actions', () => {
    const terms = ['re_rated', 'withdrawn', 'escalated_to_integrity'] as const;
    const acts = [
      'start_desk_review', 'rerate', 'downgrade', 'withdraw',
      'escalate_to_integrity', 'remediate',
    ] as const;
    for (const t of terms) {
      for (const a of acts) {
        expect(nextStatus(t, a)).toBeNull();
      }
    }
  });

  it('downgraded (soft terminal) accepts only remediate', () => {
    expect(nextStatus('downgraded', 'remediate')).toBe('monitoring');
    expect(nextStatus('downgraded', 'rerate')).toBeNull();
    expect(nextStatus('downgraded', 'start_desk_review')).toBeNull();
  });

  it('invalid transitions return null', () => {
    expect(nextStatus('rating_requested', 'score_methodology')).toBeNull();
    expect(nextStatus('desk_review', 'publish_rating')).toBeNull();
    expect(nextStatus('published', 'downgrade')).toBeNull();
    expect(nextStatus('rating_requested', 'remediate')).toBeNull();
  });

  it('request_rating only valid when current = rating_requested', () => {
    expect(nextStatus('rating_requested', 'request_rating')).toBe('rating_requested');
    expect(nextStatus('desk_review', 'request_rating')).toBeNull();
  });

  it('allowedActions skips request_rating and only returns valid forward actions', () => {
    const acts = allowedActions('desk_review');
    expect(acts).toContain('score_methodology');
    expect(acts).toContain('withdraw');
    expect(acts).toContain('escalate_to_integrity');
    expect(acts).not.toContain('request_rating');
    expect(acts).not.toContain('publish_rating');
  });

  it('allowedActions empty for hard terminals', () => {
    expect(allowedActions('re_rated')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
    expect(allowedActions('escalated_to_integrity')).toEqual([]);
  });

  it('allowedActions for downgraded returns only remediate', () => {
    const acts = allowedActions('downgraded');
    expect(acts).toEqual(['remediate']);
  });

  it('isTerminal includes all 4 terminal-ish states (UI semantics)', () => {
    expect(isTerminal('re_rated')).toBe(true);
    expect(isTerminal('downgraded')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
    expect(isTerminal('escalated_to_integrity')).toBe(true);
    expect(isTerminal('monitoring')).toBe(false);
  });

  it('TRANSITIONS map has exactly 16 actions', () => {
    expect(Object.keys(TRANSITIONS).length).toBe(16);
  });
});

// ─── Tier re-derivation + FLOOR-AT-PREMIUM / FLOOR-AT-INSTITUTIONAL ─────

describe('W109 — tier re-derivation (scale + multi-vintage)', () => {
  it('basic: <50k single-vintage', () => {
    expect(tierForScale(10_000, false)).toBe('basic');
    expect(tierForScale(49_999, false)).toBe('basic');
    expect(tierForScale(0, false)).toBe('basic');
  });

  it('standard: 50k-500k OR multi-vintage', () => {
    expect(tierForScale(50_000, false)).toBe('standard');
    expect(tierForScale(100_000, false)).toBe('standard');
    expect(tierForScale(499_999, false)).toBe('standard');
    expect(tierForScale(10_000, true)).toBe('standard');
  });

  it('premium: 500k-5m', () => {
    expect(tierForScale(500_000, false)).toBe('premium');
    expect(tierForScale(1_000_000, false)).toBe('premium');
    expect(tierForScale(4_999_999, false)).toBe('premium');
  });

  it('institutional: >=5m', () => {
    expect(tierForScale(5_000_000, false)).toBe('institutional');
    expect(tierForScale(50_000_000, false)).toBe('institutional');
  });

  it('null / negative defaults to basic', () => {
    expect(tierForScale(null, false)).toBe('basic');
    expect(tierForScale(-1000, false)).toBe('basic');
    expect(tierForScale(undefined, undefined)).toBe('basic');
  });
});

describe('W109 — FLOOR-AT-PREMIUM (5 floor flags + Article 6)', () => {
  it('no flags → not floored', () => {
    expect(floorAtPremium({})).toBe(false);
  });

  it('any single floor flag → floored to premium', () => {
    expect(floorAtPremium({ afolu_high_reversal_risk: true })).toBe(true);
    expect(floorAtPremium({ methodology_under_review: true })).toBe(true);
    expect(floorAtPremium({ external_credit_red_flag: true })).toBe(true);
    expect(floorAtPremium({ ccp_aligned_project: true })).toBe(true);
    expect(floorAtPremium({ article_6_authorised: true })).toBe(true);
  });

  it('countFloorFlags counts correctly', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ afolu_high_reversal_risk: true })).toBe(1);
    expect(countFloorFlags({ afolu_high_reversal_risk: true, methodology_under_review: true })).toBe(2);
    expect(countFloorFlags({
      afolu_high_reversal_risk: true,
      methodology_under_review: true,
      external_credit_red_flag: true,
      ccp_aligned_project: true,
      article_6_authorised: true,
    })).toBe(5);
  });

  it('effectiveTier: basic + any flag → premium', () => {
    expect(effectiveTier('basic', { afolu_high_reversal_risk: true })).toBe('premium');
    expect(effectiveTier('basic', { article_6_authorised: true })).toBe('premium');
    expect(effectiveTier('standard', { external_credit_red_flag: true })).toBe('premium');
  });

  it('effectiveTier: institutional stays institutional even with flags', () => {
    expect(effectiveTier('institutional', { afolu_high_reversal_risk: true })).toBe('institutional');
  });

  it('effectiveTier: premium stays premium with 1 flag (no upgrade)', () => {
    expect(effectiveTier('premium', { afolu_high_reversal_risk: true })).toBe('premium');
  });
});

describe('W109 — FLOOR-AT-INSTITUTIONAL (2+ flags / CCP / institutional buyer)', () => {
  it('2+ floor flags → institutional', () => {
    expect(floorAtInstitutional(
      { afolu_high_reversal_risk: true, methodology_under_review: true },
      false,
    )).toBe(true);
  });

  it('ccp_aligned_project alone → institutional', () => {
    expect(floorAtInstitutional({ ccp_aligned_project: true }, false)).toBe(true);
  });

  it('institutional_buyer alone → institutional', () => {
    expect(floorAtInstitutional({}, true)).toBe(true);
  });

  it('single non-CCP flag NOT enough for institutional floor', () => {
    expect(floorAtInstitutional({ afolu_high_reversal_risk: true }, false)).toBe(false);
  });

  it('effectiveTier: basic + 2 flags → institutional', () => {
    expect(effectiveTier('basic',
      { afolu_high_reversal_risk: true, methodology_under_review: true })).toBe('institutional');
  });

  it('effectiveTier: standard + ccp_aligned → institutional', () => {
    expect(effectiveTier('standard', { ccp_aligned_project: true })).toBe('institutional');
  });

  it('effectiveTier: premium + institutional_buyer → institutional', () => {
    expect(effectiveTier('premium', {}, true)).toBe('institutional');
  });
});

// ─── INVERTED SLA polarity ──────────────────────────────────────────────

describe('W109 — INVERTED SLA polarity (institutional = LONGEST)', () => {
  it('rating_requested: institutional > premium > standard > basic', () => {
    const r = SLA_HOURS.rating_requested;
    expect(r.institutional).toBeGreaterThan(r.premium);
    expect(r.premium).toBeGreaterThan(r.standard);
    expect(r.standard).toBeGreaterThan(r.basic);
  });

  it('rating_requested hours match spec (30/60/120/180 days)', () => {
    const r = SLA_HOURS.rating_requested;
    expect(r.basic).toBe(30 * 24);
    expect(r.standard).toBe(60 * 24);
    expect(r.premium).toBe(120 * 24);
    expect(r.institutional).toBe(180 * 24);
  });

  it('re_rating window tighter than initial rating window (data already in-hand)', () => {
    expect(SLA_HOURS.re_rating_triggered.basic).toBeLessThan(SLA_HOURS.rating_requested.basic);
    expect(SLA_HOURS.re_rating_triggered.institutional).toBeLessThan(SLA_HOURS.rating_requested.institutional);
    expect(SLA_HOURS.re_rating_triggered.basic).toBe(14 * 24);
    expect(SLA_HOURS.re_rating_triggered.institutional).toBe(90 * 24);
  });

  it('all non-terminal scoring states preserve INVERTED polarity', () => {
    const scoringStates = [
      'desk_review', 'methodology_score', 'additionality_score',
      'permanence_score', 'leakage_score', 'cobenefit_score',
      'composite_score',
    ] as const;
    for (const s of scoringStates) {
      const r = SLA_HOURS[s];
      expect(r.institutional).toBeGreaterThanOrEqual(r.premium);
      expect(r.premium).toBeGreaterThanOrEqual(r.standard);
      expect(r.standard).toBeGreaterThanOrEqual(r.basic);
    }
  });

  it('terminals have zero SLA', () => {
    expect(SLA_HOURS.re_rated.basic).toBe(0);
    expect(SLA_HOURS.withdrawn.institutional).toBe(0);
    expect(SLA_HOURS.escalated_to_integrity.premium).toBe(0);
    expect(SLA_HOURS.downgraded.standard).toBe(0);
  });

  it('slaWindowHours returns SLA_HOURS table value', () => {
    expect(slaWindowHours('rating_requested', 'institutional')).toBe(180 * 24);
    expect(slaWindowHours('re_rated', 'basic')).toBe(0);
  });

  it('slaDeadlineFor returns deadline N hours after enteredAt', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    const d = slaDeadlineFor('rating_requested', 'basic', t);
    expect(d).not.toBeNull();
    expect(d!.getTime() - t.getTime()).toBe(30 * 24 * 3600 * 1000);
  });

  it('slaDeadlineFor returns null for terminal states', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(slaDeadlineFor('re_rated', 'basic', t)).toBeNull();
  });
});

// ─── Composite scoring + S&P-style 8-band ───────────────────────────────

describe('W109 — composite score (weighted 25/25/20/15/15 + ICROA bonus)', () => {
  it('all 100, no ICROA → 100', () => {
    expect(computeCompositeScore({
      methodology_score: 100,
      additionality_score: 100,
      permanence_score: 100,
      leakage_score: 100,
      cobenefit_score: 100,
      icroa_aligned: false,
    })).toBe(100);
  });

  it('all 80, no ICROA → 80', () => {
    expect(computeCompositeScore({
      methodology_score: 80,
      additionality_score: 80,
      permanence_score: 80,
      leakage_score: 80,
      cobenefit_score: 80,
      icroa_aligned: false,
    })).toBe(80);
  });

  it('all 90 + ICROA → 95 (90 base + 5 bonus)', () => {
    expect(computeCompositeScore({
      methodology_score: 90,
      additionality_score: 90,
      permanence_score: 90,
      leakage_score: 90,
      cobenefit_score: 90,
      icroa_aligned: true,
    })).toBe(95);
  });

  it('all 100 + ICROA → 100 (capped)', () => {
    expect(computeCompositeScore({
      methodology_score: 100,
      additionality_score: 100,
      permanence_score: 100,
      leakage_score: 100,
      cobenefit_score: 100,
      icroa_aligned: true,
    })).toBe(100);
  });

  it('weighted formula respects 25/25/20/15/15 weights', () => {
    // methodology 100, others 0 → 25 base
    expect(computeCompositeScore({
      methodology_score: 100,
      additionality_score: 0,
      permanence_score: 0,
      leakage_score: 0,
      cobenefit_score: 0,
    })).toBe(25);
    // additionality 100, others 0 → 25 base
    expect(computeCompositeScore({
      methodology_score: 0,
      additionality_score: 100,
      permanence_score: 0,
      leakage_score: 0,
      cobenefit_score: 0,
    })).toBe(25);
    // permanence 100, others 0 → 20 base
    expect(computeCompositeScore({
      methodology_score: 0,
      additionality_score: 0,
      permanence_score: 100,
      leakage_score: 0,
      cobenefit_score: 0,
    })).toBe(20);
    // leakage 100, others 0 → 15 base
    expect(computeCompositeScore({
      methodology_score: 0,
      additionality_score: 0,
      permanence_score: 0,
      leakage_score: 100,
      cobenefit_score: 0,
    })).toBe(15);
    // cobenefit 100, others 0 → 15 base
    expect(computeCompositeScore({
      methodology_score: 0,
      additionality_score: 0,
      permanence_score: 0,
      leakage_score: 0,
      cobenefit_score: 100,
    })).toBe(15);
  });

  it('null inputs treated as 0', () => {
    expect(computeCompositeScore({
      methodology_score: null,
      additionality_score: null,
      permanence_score: null,
      leakage_score: null,
      cobenefit_score: null,
    })).toBe(0);
  });

  it('over-range scores clamped to 100', () => {
    expect(computeCompositeScore({
      methodology_score: 150,
      additionality_score: 150,
      permanence_score: 150,
      leakage_score: 150,
      cobenefit_score: 150,
    })).toBe(100);
  });
});

describe('W109 — S&P-style 8-band derivation', () => {
  it('AAA: 95+', () => {
    expect(deriveRatingBand(100)).toBe('AAA');
    expect(deriveRatingBand(95)).toBe('AAA');
  });
  it('AA: 90-94', () => {
    expect(deriveRatingBand(94.99)).toBe('AA');
    expect(deriveRatingBand(90)).toBe('AA');
  });
  it('A: 80-89', () => {
    expect(deriveRatingBand(89.99)).toBe('A');
    expect(deriveRatingBand(80)).toBe('A');
  });
  it('BBB: 70-79', () => {
    expect(deriveRatingBand(79.99)).toBe('BBB');
    expect(deriveRatingBand(70)).toBe('BBB');
  });
  it('BB: 60-69', () => {
    expect(deriveRatingBand(69.99)).toBe('BB');
    expect(deriveRatingBand(60)).toBe('BB');
  });
  it('B: 50-59', () => {
    expect(deriveRatingBand(59.99)).toBe('B');
    expect(deriveRatingBand(50)).toBe('B');
  });
  it('CCC: 40-49', () => {
    expect(deriveRatingBand(49.99)).toBe('CCC');
    expect(deriveRatingBand(40)).toBe('CCC');
  });
  it('D: <40', () => {
    expect(deriveRatingBand(39.99)).toBe('D');
    expect(deriveRatingBand(0)).toBe('D');
  });

  it('investment-grade floor at BBB', () => {
    expect(isInvestmentGrade('AAA')).toBe(true);
    expect(isInvestmentGrade('AA')).toBe(true);
    expect(isInvestmentGrade('A')).toBe(true);
    expect(isInvestmentGrade('BBB')).toBe(true);
    expect(isInvestmentGrade('BB')).toBe(false);
    expect(isInvestmentGrade('CCC')).toBe(false);
    expect(isInvestmentGrade('D')).toBe(false);
  });

  it('distressed band: CCC + D', () => {
    expect(isDistressedBand('CCC')).toBe(true);
    expect(isDistressedBand('D')).toBe(true);
    expect(isDistressedBand('BB')).toBe(false);
    expect(isDistressedBand('AAA')).toBe(false);
  });
});

// ─── Drop detection ─────────────────────────────────────────────────────

describe('W109 — composite drop + material downgrade detection', () => {
  it('compositeDropPct: 20% drop returns 20', () => {
    expect(compositeDropPct(100, 80)).toBe(20);
  });

  it('compositeDropPct: 10% drop returns 10', () => {
    expect(compositeDropPct(100, 90)).toBe(10);
  });

  it('compositeDropPct: no drop returns 0', () => {
    expect(compositeDropPct(100, 100)).toBe(0);
  });

  it('compositeDropPct: upgrade (current > prior) returns negative', () => {
    expect(compositeDropPct(80, 100)).toBe(-25);
  });

  it('compositeDropPct: prior 0/null returns 0', () => {
    expect(compositeDropPct(0, 50)).toBe(0);
    expect(compositeDropPct(null, 50)).toBe(0);
  });

  it('downgradeImminent: 10-19% drop', () => {
    expect(downgradeImminent(10)).toBe(true);
    expect(downgradeImminent(15)).toBe(true);
    expect(downgradeImminent(19.99)).toBe(true);
    expect(downgradeImminent(20)).toBe(false);
    expect(downgradeImminent(9.99)).toBe(false);
  });

  it('isMaterialDowngrade: drop >=20% true', () => {
    expect(isMaterialDowngrade(20, 'A')).toBe(true);
    expect(isMaterialDowngrade(50, 'AAA')).toBe(true);
  });

  it('isMaterialDowngrade: distressed band true even with small drop', () => {
    expect(isMaterialDowngrade(5, 'CCC')).toBe(true);
    expect(isMaterialDowngrade(0, 'D')).toBe(true);
  });

  it('isMaterialDowngrade: <20% and non-distressed false', () => {
    expect(isMaterialDowngrade(15, 'BBB')).toBe(false);
    expect(isMaterialDowngrade(10, 'BB')).toBe(false);
  });
});

// ─── SIGNATURE crossings ────────────────────────────────────────────────

describe('W109 — SIGNATURE regulator crossings', () => {
  it('SIGNATURE: downgrade crosses EVERY tier on material drop (>=20%)', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('downgrade', tier, {
        composite_drop_pct: 25,
        rating_band: 'BB',
      })).toBe(true);
    }
  });

  it('SIGNATURE: downgrade crosses EVERY tier when landed in distressed band (even <20% drop)', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('downgrade', tier, {
        composite_drop_pct: 5,
        rating_band: 'CCC',
      })).toBe(true);
      expect(crossesIntoRegulator('downgrade', tier, {
        composite_drop_pct: 5,
        rating_band: 'D',
      })).toBe(true);
    }
  });

  it('downgrade does NOT cross when drop <20% and non-distressed', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('downgrade', tier, {
        composite_drop_pct: 10,
        rating_band: 'A',
      })).toBe(false);
    }
  });

  it('SIGNATURE: escalate_to_integrity crosses EVERY tier (fraud hands off to W42)', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('escalate_to_integrity', tier, {})).toBe(true);
    }
  });

  it('SIGNATURE: publish_rating crosses premium+institutional on Article 6', () => {
    expect(crossesIntoRegulator('publish_rating', 'basic', { article_6_authorised: true })).toBe(false);
    expect(crossesIntoRegulator('publish_rating', 'standard', { article_6_authorised: true })).toBe(false);
    expect(crossesIntoRegulator('publish_rating', 'premium', { article_6_authorised: true })).toBe(true);
    expect(crossesIntoRegulator('publish_rating', 'institutional', { article_6_authorised: true })).toBe(true);
  });

  it('publish_rating does NOT cross when not Article 6', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('publish_rating', tier, { article_6_authorised: false })).toBe(false);
    }
  });

  it('SIGNATURE: withdraw crosses EVERY tier when issuer_disputed=TRUE', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('withdraw', tier, { issuer_disputed: true })).toBe(true);
    }
  });

  it('withdraw does NOT cross when not disputed', () => {
    for (const tier of ['basic', 'standard', 'premium', 'institutional'] as const) {
      expect(crossesIntoRegulator('withdraw', tier, { issuer_disputed: false })).toBe(false);
    }
  });

  it('non-signature actions do not cross', () => {
    expect(crossesIntoRegulator('start_desk_review', 'institutional', {})).toBe(false);
    expect(crossesIntoRegulator('score_methodology', 'institutional', {})).toBe(false);
    expect(crossesIntoRegulator('compute_composite', 'institutional', {})).toBe(false);
    expect(crossesIntoRegulator('rerate', 'institutional', {})).toBe(false);
    expect(crossesIntoRegulator('remediate', 'institutional', {})).toBe(false);
  });

  it('SLA breach crosses premium+institutional only', () => {
    expect(slaBreachCrossesIntoRegulator('basic')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('premium')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('institutional')).toBe(true);
  });

  it('isReportable matches premium+institutional', () => {
    expect(isReportable('basic')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('premium')).toBe(true);
    expect(isReportable('institutional')).toBe(true);
    expect(isHeavyTier('institutional')).toBe(true);
  });
});

// ─── Party + event mapping ──────────────────────────────────────────────

describe('W109 — actor party mapping', () => {
  it('rater writes all scoring + monitoring + rating-state actions', () => {
    const raterActions = [
      'start_desk_review', 'score_methodology', 'score_additionality',
      'score_permanence', 'score_leakage', 'score_cobenefits',
      'compute_composite', 'publish_rating', 'start_monitoring',
      'trigger_rerating', 'rerate', 'downgrade', 'withdraw',
      'escalate_to_integrity',
    ] as const;
    for (const a of raterActions) {
      expect(partyForAction(a)).toBe('rater');
    }
  });

  it('issuer writes request_rating + remediate', () => {
    expect(partyForAction('request_rating')).toBe('issuer');
    expect(partyForAction('remediate')).toBe('issuer');
  });

  it('eventTypeFor maps every action to a prefixed event', () => {
    expect(eventTypeFor('request_rating')).toBe('carbon_rating_requested');
    expect(eventTypeFor('start_desk_review')).toBe('carbon_rating_desk_review_started');
    expect(eventTypeFor('downgrade')).toBe('carbon_rating_downgraded');
    expect(eventTypeFor('escalate_to_integrity')).toBe('carbon_rating_escalated_integrity');
    expect(eventTypeFor('remediate')).toBe('carbon_rating_remediated');
    expect(eventTypeFor('rerate')).toBe('carbon_rating_rerated');
  });
});

// ─── Authority + regulator window + urgency ─────────────────────────────

describe('W109 — authority ladder + urgency band + filing windows', () => {
  it('authority ladder by tier', () => {
    expect(authorityRequired('basic')).toBe('junior_analyst');
    expect(authorityRequired('standard')).toBe('senior_analyst');
    expect(authorityRequired('premium')).toBe('ratings_committee_chair');
    expect(authorityRequired('institutional')).toBe('board_rating_committee');
  });

  it('regulator filing window INVERTED: institutional tightest (24h), basic loosest (240h)', () => {
    expect(regulatorFilingWindowHours('institutional')).toBe(24);
    expect(regulatorFilingWindowHours('premium')).toBe(72);
    expect(regulatorFilingWindowHours('standard')).toBe(168);
    expect(regulatorFilingWindowHours('basic')).toBe(240);
  });

  it('urgencyBand: negative hours = critical', () => {
    expect(urgencyBand('institutional', -1)).toBe('critical');
    expect(urgencyBand('basic', -1)).toBe('critical');
  });

  it('urgencyBand institutional: <7d=critical, <30d=high, <90d=medium, else low', () => {
    expect(urgencyBand('institutional', 6 * 24)).toBe('critical');
    expect(urgencyBand('institutional', 20 * 24)).toBe('high');
    expect(urgencyBand('institutional', 60 * 24)).toBe('medium');
    expect(urgencyBand('institutional', 120 * 24)).toBe('low');
  });

  it('urgencyBand basic: <1d=critical, <3d=high, <10d=medium, else low', () => {
    expect(urgencyBand('basic', 12)).toBe('critical');
    expect(urgencyBand('basic', 2 * 24)).toBe('high');
    expect(urgencyBand('basic', 8 * 24)).toBe('medium');
    expect(urgencyBand('basic', 20 * 24)).toBe('low');
  });

  it('slaHoursRemaining returns deadline - now', () => {
    const entered = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-10T00:00:00Z'); // 9 days in
    // basic rating_requested = 30 days = 720 hours; 9 days = 216 hours used
    const left = slaHoursRemaining('rating_requested', 'basic', entered, now);
    expect(left).toBe(720 - 216);
  });

  it('slaHoursRemaining returns 0 for terminal status', () => {
    const t = new Date('2026-01-01T00:00:00Z');
    expect(slaHoursRemaining('re_rated', 'basic', t, t)).toBe(0);
  });

  it('slaHoursRemaining handles null enteredAt', () => {
    expect(slaHoursRemaining('rating_requested', 'basic', null, new Date())).toBe(0);
  });
});

// ─── Vintage age + monitoring freshness ─────────────────────────────────

describe('W109 — vintage age + monitoring freshness + auto re-rating', () => {
  it('vintageAgeYears returns current_year - vintage_year', () => {
    expect(vintageAgeYears(2020, new Date('2026-05-30T00:00:00Z'))).toBe(6);
    expect(vintageAgeYears(2026, new Date('2026-05-30T00:00:00Z'))).toBe(0);
  });

  it('vintageAgeYears handles null', () => {
    expect(vintageAgeYears(null, new Date())).toBe(0);
  });

  it('monitoringFreshnessDays returns days since lastDataAt', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const d10 = new Date('2026-05-20T00:00:00Z');
    expect(monitoringFreshnessDays(d10, now)).toBe(10);
  });

  it('monitoringFreshnessDays returns null on null input', () => {
    expect(monitoringFreshnessDays(null, new Date())).toBeNull();
  });

  it('MONITORING_STALE_DAYS is 90', () => {
    expect(MONITORING_STALE_DAYS).toBe(90);
  });

  it('monitoringDataStale: >=90 days stale → true', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const tooOld = new Date('2026-02-01T00:00:00Z'); // ~118 days
    expect(monitoringDataStale(tooOld, now)).toBe(true);
  });

  it('monitoringDataStale: <90 days fresh → false', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const recent = new Date('2026-05-01T00:00:00Z'); // 29 days
    expect(monitoringDataStale(recent, now)).toBe(false);
  });

  it('monitoringDataStale: null lastDataAt → false', () => {
    expect(monitoringDataStale(null, new Date())).toBe(false);
  });
});

// ─── Bridges (W37 / W11 / W42) ──────────────────────────────────────────

describe('W109 — 3-bridge architecture (W37 / W11 / W42)', () => {
  it('bridgesToRegistrationChain when registrationRef set', () => {
    expect(bridgesToRegistrationChain('reg-001')).toBe(true);
    expect(bridgesToRegistrationChain(null)).toBe(false);
    expect(bridgesToRegistrationChain('')).toBe(false);
  });

  it('bridgesToMrvChain when mrvRef set', () => {
    expect(bridgesToMrvChain('mrv-001')).toBe(true);
    expect(bridgesToMrvChain(null)).toBe(false);
  });

  it('bridgesToReversalChain on downgraded or escalated_to_integrity (signature crossings)', () => {
    expect(bridgesToReversalChain('downgraded', null)).toBe(true);
    expect(bridgesToReversalChain('escalated_to_integrity', null)).toBe(true);
  });

  it('bridgesToReversalChain when reversalChainRef set (explicit)', () => {
    expect(bridgesToReversalChain('monitoring', 'rev-001')).toBe(true);
  });

  it('bridgesToReversalChain false when monitoring + no ref', () => {
    expect(bridgesToReversalChain('monitoring', null)).toBe(false);
  });
});

// ─── LIVE battery helpers ───────────────────────────────────────────────

describe('W109 — LIVE battery helpers', () => {
  it('ratingCompletenessIndex: all 8 complete = 100', () => {
    expect(ratingCompletenessIndex({
      methodology: true, additionality: true, permanence: true, leakage: true,
      cobenefit: true, composite: true, published: true, monitoring: true,
    })).toBe(100);
  });

  it('ratingCompletenessIndex: none → 0', () => {
    expect(ratingCompletenessIndex({})).toBe(0);
  });

  it('ratingCompletenessIndex: 5 sub-scores complete = 60', () => {
    expect(ratingCompletenessIndex({
      methodology: true, additionality: true, permanence: true, leakage: true,
      cobenefit: true,
    })).toBe(60); // 15+15+10+10+10
  });

  it('reratingTriggerCount30d: counts rerating events in last 30d', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const events = [
      { event_type: 'carbon_rating_rerating_triggered', created_at: '2026-05-25T00:00:00Z' },
      { event_type: 'carbon_rating_rerating_triggered', created_at: '2026-05-10T00:00:00Z' },
      { event_type: 'carbon_rating_rerating_triggered', created_at: '2026-03-01T00:00:00Z' }, // >30d
      { event_type: 'carbon_rating_published', created_at: '2026-05-26T00:00:00Z' }, // wrong type
    ];
    expect(reratingTriggerCount30d(events, now)).toBe(2);
  });

  it('reratingTriggerCount30d: empty list = 0', () => {
    expect(reratingTriggerCount30d([], new Date())).toBe(0);
  });
});
