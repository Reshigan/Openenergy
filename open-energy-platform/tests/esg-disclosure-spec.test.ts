// W103 — ESG Disclosure Lifecycle & Assurance Chain spec tests.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  allowedActions,
  nextStatus,
  isTerminal,
  slaWindowMinutes,
  slaDeadlineFor,
  tierForDisclosure,
  floorAtMaterial,
  effectiveTier,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  scope3Total15CatTco2e,
  totalEmissionsTco2e,
  reductionPctVsBaseline,
  sbtiAlignmentScore,
  tcfdCompletenessPct,
  griCompletenessPct,
  cdpScoreBand,
  jseSrlCompletenessPct,
  kingIvCompletenessPct,
  issbS1S2CompletenessPct,
  assuranceConfidence,
  esgDisclosureIndex,
  slaDaysRemaining,
  regulatorFilingWindowDays,
  urgencyBand,
  authorityRequired,
  eventTypeFor,
} from '../src/utils/esg-disclosure-spec';

describe('W103 ESG Disclosure — state machine', () => {
  it('forward path is clean period_open → archived', () => {
    let s: ReturnType<typeof nextStatus> = 'period_open';
    s = nextStatus('period_open', 'collect_data');                expect(s).toBe('data_collected');
    s = nextStatus(s!, 'verify_boundary');                        expect(s).toBe('boundary_verified');
    s = nextStatus(s!, 'compute_metrics');                        expect(s).toBe('metrics_computed');
    s = nextStatus(s!, 'compile_draft');                          expect(s).toBe('draft_compiled');
    s = nextStatus(s!, 'submit_for_review');                      expect(s).toBe('internal_review');
    s = nextStatus(s!, 'engage_assurance');                       expect(s).toBe('assurance_engaged');
    s = nextStatus(s!, 'start_assurance');                        expect(s).toBe('assurance_in_progress');
    s = nextStatus(s!, 'complete_assurance');                     expect(s).toBe('assured');
    s = nextStatus(s!, 'publish_disclosure');                     expect(s).toBe('published');
    s = nextStatus(s!, 'file_regulator');                         expect(s).toBe('filed');
    s = nextStatus(s!, 'archive_year');                           expect(s).toBe('archived');
  });

  it('raise_dispute fires from draft_compiled / internal_review / assured only', () => {
    expect(nextStatus('draft_compiled', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('internal_review', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('assured', 'raise_dispute')).toBe('disputed');
    expect(nextStatus('period_open', 'raise_dispute')).toBeNull();
    expect(nextStatus('metrics_computed', 'raise_dispute')).toBeNull();
    expect(nextStatus('published', 'raise_dispute')).toBeNull();
  });

  it('resolve_dispute returns to internal_review', () => {
    expect(nextStatus('disputed', 'resolve_dispute')).toBe('internal_review');
  });

  it('compile_draft is reachable from metrics_computed and disputed (re-draft path)', () => {
    expect(nextStatus('metrics_computed', 'compile_draft')).toBe('draft_compiled');
    expect(nextStatus('disputed', 'compile_draft')).toBe('draft_compiled');
  });

  it('restate_disclosure ONLY fires from filed and reopens at draft_compiled', () => {
    expect(nextStatus('filed', 'restate_disclosure')).toBe('draft_compiled');
    expect(nextStatus('published', 'restate_disclosure')).toBeNull();
    expect(nextStatus('archived', 'restate_disclosure')).toBeNull();
    expect(nextStatus('assured', 'restate_disclosure')).toBeNull();
  });

  it('cancel_year fires from any non-terminal', () => {
    const nonTerminal = [
      'period_open', 'data_collected', 'boundary_verified', 'metrics_computed',
      'draft_compiled', 'internal_review', 'assurance_engaged', 'assurance_in_progress',
      'assured', 'published', 'filed', 'disputed',
    ] as const;
    for (const s of nonTerminal) {
      expect(nextStatus(s, 'cancel_year')).toBe('cancelled');
    }
    expect(nextStatus('archived', 'cancel_year')).toBeNull();
    expect(nextStatus('cancelled', 'cancel_year')).toBeNull();
  });

  it('archived + cancelled are terminal', () => {
    expect(isTerminal('archived')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('filed')).toBe(false);
    expect(isTerminal('published')).toBe(false);
  });

  it('nextStatus returns null for terminals and undefined actions', () => {
    expect(nextStatus('archived', 'collect_data')).toBeNull();
    expect(nextStatus('cancelled', 'collect_data')).toBeNull();
  });

  it('allowedActions(period_open) includes collect_data + cancel_year only', () => {
    const a = allowedActions('period_open');
    expect(a).toContain('collect_data');
    expect(a).toContain('cancel_year');
    expect(a).not.toContain('publish_disclosure');
  });

  it('allowedActions(assured) includes publish_disclosure + raise_dispute + cancel_year', () => {
    const a = allowedActions('assured');
    expect(a).toContain('publish_disclosure');
    expect(a).toContain('raise_dispute');
    expect(a).toContain('cancel_year');
  });

  it('allowedActions(filed) includes archive_year + restate_disclosure + cancel_year', () => {
    const a = allowedActions('filed');
    expect(a).toContain('archive_year');
    expect(a).toContain('restate_disclosure');
    expect(a).toContain('cancel_year');
  });
});

describe('W103 ESG Disclosure — tier RE-DERIVATION + FLOOR-AT-MATERIAL', () => {
  it('tierForDisclosure: entity_only + low + none → minor', () => {
    expect(tierForDisclosure('entity_only', 'low', 'none')).toBe('minor');
  });

  it('tierForDisclosure: entity_only + medium + none → standard', () => {
    expect(tierForDisclosure('entity_only', 'medium', 'none')).toBe('standard');
  });

  it('tierForDisclosure: entity_plus_subsidiaries + medium + none → material', () => {
    expect(tierForDisclosure('entity_plus_subsidiaries', 'medium', 'none')).toBe('material');
  });

  it('tierForDisclosure: any + high + any → at least material', () => {
    expect(tierForDisclosure('entity_only', 'high', 'none')).toBe('material');
    expect(tierForDisclosure('entity_only', 'high', 'limited')).toBe('material');
  });

  it('tierForDisclosure: group_consolidated + high + any → strategic', () => {
    expect(tierForDisclosure('group_consolidated', 'high', 'none')).toBe('strategic');
    expect(tierForDisclosure('group_consolidated', 'high', 'reasonable')).toBe('strategic');
  });

  it('tierForDisclosure: group_consolidated + low + reasonable → strategic', () => {
    expect(tierForDisclosure('group_consolidated', 'low', 'reasonable')).toBe('strategic');
  });

  it('floorAtMaterial returns true on any flag set', () => {
    expect(floorAtMaterial({ jse_listed_strict: true })).toBe(true);
    expect(floorAtMaterial({ scope3_inclusive_15cat: 1 })).toBe(true);
    expect(floorAtMaterial({ climate_scenario_required: true })).toBe(true);
    expect(floorAtMaterial({ material_topics_count_8plus: 1 })).toBe(true);
    expect(floorAtMaterial({ sbti_committed_strict: true })).toBe(true);
  });

  it('floorAtMaterial returns false when no flags set', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({
      jse_listed_strict: false,
      scope3_inclusive_15cat: 0,
      climate_scenario_required: null,
      material_topics_count_8plus: false,
      sbti_committed_strict: 0,
    })).toBe(false);
  });

  it('effectiveTier promotes minor + standard up to material when floor set', () => {
    expect(effectiveTier('minor', true)).toBe('material');
    expect(effectiveTier('standard', true)).toBe('material');
  });

  it('effectiveTier preserves material + strategic regardless of floor', () => {
    expect(effectiveTier('material', true)).toBe('material');
    expect(effectiveTier('strategic', true)).toBe('strategic');
    expect(effectiveTier('material', false)).toBe('material');
    expect(effectiveTier('strategic', false)).toBe('strategic');
  });

  it('isHeavyTier returns true for material + strategic only', () => {
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('strategic')).toBe(true);
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
  });

  it('isReportable matches heavy tier predicate', () => {
    expect(isReportable('material')).toBe(true);
    expect(isReportable('strategic')).toBe(true);
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
  });
});

describe('W103 ESG Disclosure — SLA INVERTED polarity', () => {
  it('strategic gets LONGER windows than minor in every non-terminal state', () => {
    for (const status of Object.keys(SLA_MINUTES) as (keyof typeof SLA_MINUTES)[]) {
      const row = SLA_MINUTES[status];
      if (row.minor === 0 && row.strategic === 0) continue;
      expect(row.strategic).toBeGreaterThanOrEqual(row.minor);
    }
  });

  it('terminals (archived + cancelled) carry no SLA', () => {
    expect(SLA_MINUTES.archived.minor).toBe(0);
    expect(SLA_MINUTES.archived.strategic).toBe(0);
    expect(SLA_MINUTES.cancelled.minor).toBe(0);
    expect(SLA_MINUTES.cancelled.strategic).toBe(0);
  });

  it('slaWindowMinutes returns positive for non-terminals', () => {
    expect(slaWindowMinutes('period_open', 'strategic')).toBeGreaterThan(0);
    expect(slaWindowMinutes('assurance_in_progress', 'strategic')).toBeGreaterThan(0);
  });

  it('slaDeadlineFor returns null on terminal states', () => {
    expect(slaDeadlineFor('archived', 'strategic', new Date())).toBeNull();
    expect(slaDeadlineFor('cancelled', 'strategic', new Date())).toBeNull();
  });

  it('slaDeadlineFor produces a future date for non-terminals', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const deadline = slaDeadlineFor('assurance_in_progress', 'strategic', now);
    expect(deadline).not.toBeNull();
    expect(deadline!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('strategic at assurance_in_progress = 120 days (Big-4 engagement runway)', () => {
    expect(SLA_MINUTES.assurance_in_progress.strategic).toBe(120 * 24 * 60);
  });
});

describe('W103 ESG Disclosure — regulator-crossing SIGNATURE', () => {
  it('restate_disclosure crosses regulator EVERY tier (universal hard line)', () => {
    for (const tier of ['minor', 'standard', 'material', 'strategic'] as const) {
      expect(crossesIntoRegulator('restate_disclosure', tier, 'unqualified', false)).toBe(true);
    }
  });

  it('complete_assurance crosses regulator on material+strategic when opinion is qualified/adverse/disclaimer', () => {
    for (const opinion of ['qualified', 'adverse', 'disclaimer'] as const) {
      expect(crossesIntoRegulator('complete_assurance', 'material', opinion, false)).toBe(true);
      expect(crossesIntoRegulator('complete_assurance', 'strategic', opinion, false)).toBe(true);
      expect(crossesIntoRegulator('complete_assurance', 'minor', opinion, false)).toBe(false);
      expect(crossesIntoRegulator('complete_assurance', 'standard', opinion, false)).toBe(false);
    }
  });

  it('complete_assurance does NOT cross regulator when opinion is unqualified/limited', () => {
    for (const tier of ['minor', 'standard', 'material', 'strategic'] as const) {
      expect(crossesIntoRegulator('complete_assurance', tier, 'unqualified', false)).toBe(false);
      expect(crossesIntoRegulator('complete_assurance', tier, 'limited', false)).toBe(false);
    }
  });

  it('cancel_year crosses regulator when year_had_listed_disclosure=true (any tier)', () => {
    for (const tier of ['minor', 'standard', 'material', 'strategic'] as const) {
      expect(crossesIntoRegulator('cancel_year', tier, null, true)).toBe(true);
      expect(crossesIntoRegulator('cancel_year', tier, null, false)).toBe(false);
    }
  });

  it('non-signature actions never cross regulator', () => {
    for (const a of ['collect_data', 'verify_boundary', 'compute_metrics', 'compile_draft', 'submit_for_review', 'engage_assurance', 'start_assurance', 'publish_disclosure', 'file_regulator', 'archive_year', 'raise_dispute', 'resolve_dispute'] as const) {
      for (const tier of ['minor', 'standard', 'material', 'strategic'] as const) {
        expect(crossesIntoRegulator(a, tier, 'adverse', true)).toBe(false);
      }
    }
  });

  it('slaBreachCrossesIntoRegulator: strategic only', () => {
    expect(slaBreachCrossesIntoRegulator('strategic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('material')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W103 ESG Disclosure — party mapping', () => {
  it('esg_analyst owns data + boundary + metrics', () => {
    expect(partyForAction('collect_data')).toBe('esg_analyst');
    expect(partyForAction('verify_boundary')).toBe('esg_analyst');
    expect(partyForAction('compute_metrics')).toBe('esg_analyst');
  });

  it('sustainability_director owns draft + review + file + archive + resolve', () => {
    expect(partyForAction('compile_draft')).toBe('sustainability_director');
    expect(partyForAction('submit_for_review')).toBe('sustainability_director');
    expect(partyForAction('file_regulator')).toBe('sustainability_director');
    expect(partyForAction('archive_year')).toBe('sustainability_director');
    expect(partyForAction('resolve_dispute')).toBe('sustainability_director');
  });

  it('audit_committee_chair owns engage + dispute', () => {
    expect(partyForAction('engage_assurance')).toBe('audit_committee_chair');
    expect(partyForAction('raise_dispute')).toBe('audit_committee_chair');
  });

  it('external_auditor owns assurance execution', () => {
    expect(partyForAction('start_assurance')).toBe('external_auditor');
    expect(partyForAction('complete_assurance')).toBe('external_auditor');
  });

  it('board_chair owns publish + restate + cancel (the existential decisions)', () => {
    expect(partyForAction('publish_disclosure')).toBe('board_chair');
    expect(partyForAction('restate_disclosure')).toBe('board_chair');
    expect(partyForAction('cancel_year')).toBe('board_chair');
  });
});

describe('W103 ESG Disclosure — LIVE battery', () => {
  it('scope3Total15CatTco2e sums all 15 categories ignoring null/undefined', () => {
    const cat = {
      cat1_purchased_goods: 1000,
      cat2_capital_goods: 500,
      cat3_fuel_energy: 300,
      cat4_upstream_transport: 200,
      cat5_waste: 100,
      cat6_business_travel: 150,
      cat7_employee_commuting: 80,
      cat8_upstream_leased: null,
      cat9_downstream_transport: 60,
      cat10_processing_sold: undefined,
      cat11_use_sold: 2000,
      cat12_end_of_life: 40,
      cat13_downstream_leased: 30,
      cat14_franchises: 0,
      cat15_investments: 1500,
    };
    expect(scope3Total15CatTco2e(cat)).toBe(5960);
  });

  it('scope3Total15CatTco2e handles null input', () => {
    expect(scope3Total15CatTco2e(null)).toBe(0);
    expect(scope3Total15CatTco2e(undefined)).toBe(0);
  });

  it('totalEmissionsTco2e = scope1 + scope2_market + scope3_total', () => {
    expect(totalEmissionsTco2e(100, 200, 300)).toBe(600);
    expect(totalEmissionsTco2e(null, null, 0)).toBe(0);
  });

  it('reductionPctVsBaseline computes % reduction (positive = good)', () => {
    expect(reductionPctVsBaseline(800, 1000)).toBe(20);
    expect(reductionPctVsBaseline(1200, 1000)).toBe(-20);
    expect(reductionPctVsBaseline(0, 1000)).toBe(100);
    expect(reductionPctVsBaseline(500, null)).toBe(0);
    expect(reductionPctVsBaseline(500, 0)).toBe(0);
  });

  it('sbtiAlignmentScore composes 5 flags up to 100', () => {
    expect(sbtiAlignmentScore({
      target_set: true,
      target_validated: true,
      interim_progress_on_track: true,
      reduction_above_42pct: true,
      scope3_target_set: true,
    })).toBe(100);
    expect(sbtiAlignmentScore({
      target_set: true,
      target_validated: true,
      interim_progress_on_track: false,
      reduction_above_42pct: false,
      scope3_target_set: false,
    })).toBe(40);
    expect(sbtiAlignmentScore({})).toBe(0);
  });

  it('tcfdCompletenessPct: 4 pillars × 25 = 100', () => {
    expect(tcfdCompletenessPct({
      governance: true, strategy: true, risk_management: true, metrics_targets: true,
    })).toBe(100);
    expect(tcfdCompletenessPct({ governance: true, strategy: true })).toBe(50);
    expect(tcfdCompletenessPct({})).toBe(0);
  });

  it('griCompletenessPct: covered / material × 100', () => {
    expect(griCompletenessPct(8, 10)).toBe(80);
    expect(griCompletenessPct(5, 5)).toBe(100);
    expect(griCompletenessPct(0, 0)).toBe(0);
    expect(griCompletenessPct(5, null)).toBe(0);
  });

  it('cdpScoreBand bands 0-100 → F to A correctly', () => {
    expect(cdpScoreBand(95)).toBe('A');
    expect(cdpScoreBand(85)).toBe('A-');
    expect(cdpScoreBand(75)).toBe('B');
    expect(cdpScoreBand(65)).toBe('B-');
    expect(cdpScoreBand(55)).toBe('C');
    expect(cdpScoreBand(45)).toBe('C-');
    expect(cdpScoreBand(35)).toBe('D');
    expect(cdpScoreBand(25)).toBe('D-');
    expect(cdpScoreBand(15)).toBe('F');
    expect(cdpScoreBand(0)).toBe('F');
    expect(cdpScoreBand(null)).toBe('F');
  });

  it('jseSrlCompletenessPct: covered / total × 100', () => {
    expect(jseSrlCompletenessPct(45, 50)).toBe(90);
    expect(jseSrlCompletenessPct(0, 50)).toBe(0);
    expect(jseSrlCompletenessPct(50, 0)).toBe(0);
  });

  it('kingIvCompletenessPct defaults total to 17 (the King IV principle count)', () => {
    expect(kingIvCompletenessPct(17, null)).toBeCloseTo(100, 1);
    expect(kingIvCompletenessPct(15, null)).toBeCloseTo(88.2, 1);
  });

  it('issbS1S2CompletenessPct combines S1 + S2 weighted by total', () => {
    expect(issbS1S2CompletenessPct(10, 20, 10, 20)).toBe(50);
    expect(issbS1S2CompletenessPct(20, 20, 20, 20)).toBe(100);
    expect(issbS1S2CompletenessPct(null, null, null, null)).toBe(0);
  });

  it('assuranceConfidence: reasonable + unqualified → high', () => {
    expect(assuranceConfidence('reasonable', 'unqualified')).toBe('high');
  });

  it('assuranceConfidence: reasonable + qualified/adverse/disclaimer → low', () => {
    expect(assuranceConfidence('reasonable', 'qualified')).toBe('low');
    expect(assuranceConfidence('reasonable', 'adverse')).toBe('low');
    expect(assuranceConfidence('reasonable', 'disclaimer')).toBe('low');
  });

  it('assuranceConfidence: limited + unqualified → medium', () => {
    expect(assuranceConfidence('limited', 'unqualified')).toBe('medium');
  });

  it('assuranceConfidence: none → none', () => {
    expect(assuranceConfidence('none', null)).toBe('none');
  });

  it('esgDisclosureIndex composes frameworks into a 0-130 score', () => {
    const score = esgDisclosureIndex({
      tcfd_pct: 100,
      gri_pct: 100,
      cdp_band: 'A',
      jse_srl_pct: 100,
      issb_pct: 100,
      king_iv_pct: 100,
      sbti_score: 100,
      assurance_confidence: 'high',
      restated_recently: false,
    });
    expect(score).toBeGreaterThan(125);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('esgDisclosureIndex returns 0 on empty input but adds restated_recently=false bonus', () => {
    // restated_recently defaults to null → treated as "no recent restatement" = +15
    expect(esgDisclosureIndex({})).toBeGreaterThanOrEqual(15);
  });

  it('esgDisclosureIndex penalises recent restatement', () => {
    const clean = esgDisclosureIndex({ tcfd_pct: 100, restated_recently: false });
    const restated = esgDisclosureIndex({ tcfd_pct: 100, restated_recently: true });
    expect(clean).toBeGreaterThan(restated);
  });

  it('slaDaysRemaining positive when deadline in future', () => {
    const enteredAt = new Date('2026-06-01T00:00:00Z');
    const now = new Date('2026-06-15T00:00:00Z');
    const days = slaDaysRemaining('assurance_in_progress', 'strategic', enteredAt, now);
    expect(days).toBeGreaterThan(0);
  });

  it('slaDaysRemaining returns 0 when deadline elapsed', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-12-31T00:00:00Z');
    const days = slaDaysRemaining('internal_review', 'minor', enteredAt, now);
    expect(days).toBe(0);
  });

  it('regulatorFilingWindowDays: 6 months past financial year end', () => {
    const fyEnd = new Date('2026-12-31T00:00:00Z');
    const now = new Date('2027-01-01T00:00:00Z');
    const days = regulatorFilingWindowDays(fyEnd, now);
    // Filing deadline is 2027-06-30 (~181 days from 2027-01-01)
    expect(days).toBeGreaterThan(175);
    expect(days).toBeLessThan(185);
  });

  it('regulatorFilingWindowDays returns 0 when filing deadline elapsed', () => {
    const fyEnd = new Date('2025-12-31T00:00:00Z');
    const now = new Date('2026-12-31T00:00:00Z');
    expect(regulatorFilingWindowDays(fyEnd, now)).toBe(0);
  });

  it('urgencyBand critical when filing window <14 days', () => {
    expect(urgencyBand('minor', 7, 30)).toBe('critical');
    expect(urgencyBand('strategic', 5, 30)).toBe('critical');
  });

  it('urgencyBand critical when SLA <3 days', () => {
    expect(urgencyBand('standard', 100, 2)).toBe('critical');
  });

  it('urgencyBand high when strategic OR filing 14-30 days', () => {
    expect(urgencyBand('strategic', 60, 30)).toBe('high');
    expect(urgencyBand('minor', 20, 30)).toBe('high');
  });

  it('urgencyBand medium when standard OR filing 30-90 days', () => {
    expect(urgencyBand('standard', 100, 30)).toBe('medium');
    expect(urgencyBand('minor', 60, 30)).toBe('medium');
  });

  it('authorityRequired ladder: minor→esg_analyst, standard→sustainability_director, material→audit_committee_chair, strategic→board_chair', () => {
    expect(authorityRequired('minor')).toBe('esg_analyst');
    expect(authorityRequired('standard')).toBe('sustainability_director');
    expect(authorityRequired('material')).toBe('audit_committee_chair');
    expect(authorityRequired('strategic')).toBe('board_chair');
  });
});

describe('W103 ESG Disclosure — event type mapping', () => {
  it('every action maps to a unique event type', () => {
    const actions = Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>;
    const events = new Set<string>();
    for (const a of actions) {
      const e = eventTypeFor(a);
      expect(e).not.toBeNull();
      expect(events.has(e!)).toBe(false);
      events.add(e!);
    }
  });

  it('event names are all prefixed esg_disclosure.', () => {
    const actions = Object.keys(TRANSITIONS) as Array<keyof typeof TRANSITIONS>;
    for (const a of actions) {
      expect(eventTypeFor(a)!.startsWith('esg_disclosure.')).toBe(true);
    }
  });
});
