// W108 — Lender Loan Restructure & Amendment-and-Extend (A&E) / Forbearance
// chain spec tests.
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
  tierForFacility,
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
  restructureCompletenessIndex,
  consentThresholdPct,
  consentMajorityPct,
  daysToConsentDeadline,
  slaHoursRemaining,
  urgencyBand,
  authorityRequired,
  boardEscalationRequired,
  regulatorFilingWindowHours,
  bridgesToCovenantCertificateChain,
  bridgesToDscrMonitoringChain,
  bridgesToDefaultChain,
  ifrs9StageAtTrigger,
  proposedReliefZar,
  principalReschedulePct,
} from '../src/utils/loan-restructure-spec';

describe('W108 Loan Restructure — state machine (12 lifecycle + 3 terminal branches)', () => {
  it('forward path trigger_event → completed (clean restructure)', () => {
    let s = nextStatus('trigger_event', 'start_preliminary_assessment');           expect(s).toBe('preliminary_assessment');
    s = nextStatus(s!, 'draft_proposal');                                          expect(s).toBe('restructure_proposal_drafted');
    s = nextStatus(s!, 'submit_to_credit_committee');                              expect(s).toBe('lender_credit_committee_review');
    s = nextStatus(s!, 'approve_proposal');                                        expect(s).toBe('borrower_term_sheet_negotiation');
    s = nextStatus(s!, 'sign_term_sheet');                                         expect(s).toBe('term_sheet_signed');
    s = nextStatus(s!, 'draft_documentation');                                     expect(s).toBe('legal_documentation_drafted');
    s = nextStatus(s!, 'launch_consent_solicitation');                             expect(s).toBe('consent_solicitation');
    s = nextStatus(s!, 'sign_amendment');                                          expect(s).toBe('signing');
    s = nextStatus(s!, 'mark_effective');                                          expect(s).toBe('effective_date');
    s = nextStatus(s!, 'monitor_compliance');                                      expect(s).toBe('monitoring_period');
    s = nextStatus(s!, 'complete_restructure');                                    expect(s).toBe('completed');
  });

  it('credit_committee_review → revise_proposal loop back to restructure_proposal_drafted', () => {
    const s = nextStatus('lender_credit_committee_review', 'revise_proposal');
    expect(s).toBe('restructure_proposal_drafted');
  });

  it('credit_committee_review → reject_proposal terminal', () => {
    const s = nextStatus('lender_credit_committee_review', 'reject_proposal');
    expect(s).toBe('rejected_by_committee');
    expect(isHardTerminal('rejected_by_committee')).toBe(true);
  });

  it('borrower negotiates without changing status (self-loop on negotiate_term_sheet)', () => {
    const s = nextStatus('borrower_term_sheet_negotiation', 'negotiate_term_sheet');
    expect(s).toBe('borrower_term_sheet_negotiation');
  });

  it('consent_solicitation accumulates consent via record_consent (self-loop)', () => {
    const s = nextStatus('consent_solicitation', 'record_consent');
    expect(s).toBe('consent_solicitation');
  });

  it('monitoring_period accumulates compliance evidence via monitor_compliance (self-loop)', () => {
    const s = nextStatus('monitoring_period', 'monitor_compliance');
    expect(s).toBe('monitoring_period');
  });

  it('abandon fires from every pre-effective state', () => {
    const preEff = [
      'trigger_event', 'preliminary_assessment', 'restructure_proposal_drafted',
      'lender_credit_committee_review', 'borrower_term_sheet_negotiation',
      'term_sheet_signed', 'legal_documentation_drafted', 'consent_solicitation',
      'signing',
    ] as const;
    for (const s of preEff) {
      expect(nextStatus(s, 'abandon')).toBe('abandoned');
    }
  });

  it('abandon does NOT fire from effective_date or monitoring_period', () => {
    expect(nextStatus('effective_date', 'abandon')).toBeNull();
    expect(nextStatus('monitoring_period', 'abandon')).toBeNull();
  });

  it('escalate_to_default fires from every non-terminal state including effective+monitoring', () => {
    const all = [
      'trigger_event', 'preliminary_assessment', 'restructure_proposal_drafted',
      'lender_credit_committee_review', 'borrower_term_sheet_negotiation',
      'term_sheet_signed', 'legal_documentation_drafted', 'consent_solicitation',
      'signing', 'effective_date', 'monitoring_period',
    ] as const;
    for (const s of all) {
      expect(nextStatus(s, 'escalate_to_default')).toBe('escalated_to_default');
    }
  });

  it('hard terminal states reject every action', () => {
    const terminals = ['completed', 'rejected_by_committee', 'abandoned', 'escalated_to_default'] as const;
    for (const t of terminals) {
      expect(nextStatus(t, 'start_preliminary_assessment')).toBeNull();
      expect(nextStatus(t, 'escalate_to_default')).toBeNull();
      expect(nextStatus(t, 'complete_restructure')).toBeNull();
      expect(isHardTerminal(t)).toBe(true);
      expect(isTerminal(t)).toBe(true);
    }
  });

  it('non-terminal states are NOT marked terminal', () => {
    const open = [
      'trigger_event', 'preliminary_assessment', 'restructure_proposal_drafted',
      'lender_credit_committee_review', 'borrower_term_sheet_negotiation',
      'term_sheet_signed', 'legal_documentation_drafted', 'consent_solicitation',
      'signing', 'effective_date', 'monitoring_period',
    ] as const;
    for (const s of open) {
      expect(isTerminal(s)).toBe(false);
      expect(isHardTerminal(s)).toBe(false);
    }
  });

  it('allowedActions surfaces every legal action per state', () => {
    expect(allowedActions('trigger_event')).toEqual(
      expect.arrayContaining(['start_preliminary_assessment', 'abandon', 'escalate_to_default']),
    );
    expect(allowedActions('lender_credit_committee_review')).toEqual(
      expect.arrayContaining(['approve_proposal', 'reject_proposal', 'revise_proposal']),
    );
    expect(allowedActions('signing')).toEqual(
      expect.arrayContaining(['mark_effective', 'abandon', 'escalate_to_default']),
    );
    expect(allowedActions('completed')).toEqual([]);
    expect(allowedActions('escalated_to_default')).toEqual([]);
  });

  it('TRANSITIONS table covers all 18 actions', () => {
    const actions = Object.keys(TRANSITIONS);
    expect(actions).toHaveLength(18);
    expect(new Set(actions).size).toBe(18);
  });
});

describe('W108 Loan Restructure — INVERTED SLA polarity (larger facility = LONGER runway)', () => {
  it('SLA increases strictly minor → systemic for every graded state', () => {
    const graded = [
      'trigger_event', 'preliminary_assessment', 'restructure_proposal_drafted',
      'lender_credit_committee_review', 'borrower_term_sheet_negotiation',
      'term_sheet_signed', 'legal_documentation_drafted', 'consent_solicitation',
      'signing', 'effective_date', 'monitoring_period',
    ] as const;
    for (const s of graded) {
      const row = SLA_HOURS[s];
      expect(row.minor).toBeLessThan(row.standard);
      expect(row.standard).toBeLessThan(row.material);
      expect(row.material).toBeLessThan(row.systemic);
    }
  });

  it('SIGNATURE: trigger_event minor 30d / standard 60d / material 120d / systemic 180d', () => {
    expect(SLA_HOURS.trigger_event.minor).toBe(30 * 24);
    expect(SLA_HOURS.trigger_event.standard).toBe(60 * 24);
    expect(SLA_HOURS.trigger_event.material).toBe(120 * 24);
    expect(SLA_HOURS.trigger_event.systemic).toBe(180 * 24);
  });

  it('terminals carry no SLA deadline', () => {
    for (const t of ['completed', 'rejected_by_committee', 'abandoned', 'escalated_to_default'] as const) {
      expect(slaWindowHours(t, 'systemic')).toBe(0);
      expect(slaDeadlineFor(t, 'systemic', new Date())).toBeNull();
    }
  });

  it('slaDeadlineFor advances by configured window', () => {
    const t0 = new Date('2026-05-30T00:00:00.000Z');
    const d = slaDeadlineFor('trigger_event', 'systemic', t0);
    expect(d).not.toBeNull();
    // 180 days = 180 * 24 * 3600 * 1000 ms
    expect(d!.getTime() - t0.getTime()).toBe(180 * 24 * 3600 * 1000);
  });
});

describe('W108 Loan Restructure — tier re-derivation from facility_amount_zar', () => {
  it('tierForFacility band boundaries', () => {
    expect(tierForFacility(0)).toBe('minor');
    expect(tierForFacility(10_000_000)).toBe('minor');
    expect(tierForFacility(50_000_000)).toBe('standard');
    expect(tierForFacility(400_000_000)).toBe('standard');
    expect(tierForFacility(500_000_000)).toBe('material');
    expect(tierForFacility(4_999_000_000)).toBe('material');
    expect(tierForFacility(5_000_000_000)).toBe('systemic');
    expect(tierForFacility(10_000_000_000)).toBe('systemic');
  });

  it('tierForFacility defends against null / negative / NaN', () => {
    expect(tierForFacility(null)).toBe('minor');
    expect(tierForFacility(undefined)).toBe('minor');
    expect(tierForFacility(-1)).toBe('minor');
    expect(tierForFacility(NaN)).toBe('minor');
  });

  it('countFloorFlags counts truthy floors across all 5', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ cross_border_syndicate: true })).toBe(1);
    expect(countFloorFlags({
      cross_border_syndicate: true,
      sustainability_linked_loan: true,
      public_bondholder_consent_required: true,
      ifrs9_stage_3_at_trigger: true,
      sarb_large_exposure_threshold: true,
    })).toBe(5);
    expect(countFloorFlags({ cross_border_syndicate: 1, ifrs9_stage_3_at_trigger: 1 })).toBe(2);
  });

  it('floorAtMaterial fires on any one of the five flags', () => {
    expect(floorAtMaterial({})).toBe(false);
    expect(floorAtMaterial({ cross_border_syndicate: true })).toBe(true);
    expect(floorAtMaterial({ sustainability_linked_loan: true })).toBe(true);
    expect(floorAtMaterial({ ifrs9_stage_3_at_trigger: true })).toBe(true);
    expect(floorAtMaterial({ public_bondholder_consent_required: true })).toBe(true);
    expect(floorAtMaterial({ sarb_large_exposure_threshold: true })).toBe(true);
  });

  it('floorAtSystemic fires on 2+ flags OR public_bondholder OR sarb_large_exposure', () => {
    expect(floorAtSystemic({})).toBe(false);
    expect(floorAtSystemic({ cross_border_syndicate: true })).toBe(false);
    expect(floorAtSystemic({ sustainability_linked_loan: true })).toBe(false);
    expect(floorAtSystemic({ ifrs9_stage_3_at_trigger: true })).toBe(false);
    // 2 flags promote to systemic
    expect(floorAtSystemic({ cross_border_syndicate: true, sustainability_linked_loan: true })).toBe(true);
    // public bondholder forces systemic
    expect(floorAtSystemic({ public_bondholder_consent_required: true })).toBe(true);
    // sarb large exposure forces systemic
    expect(floorAtSystemic({ sarb_large_exposure_threshold: true })).toBe(true);
  });

  it('effectiveTier: 1 floor flag promotes minor+standard to material', () => {
    expect(effectiveTier('minor', { cross_border_syndicate: true })).toBe('material');
    expect(effectiveTier('standard', { sustainability_linked_loan: true })).toBe('material');
    expect(effectiveTier('material', { ifrs9_stage_3_at_trigger: true })).toBe('material');
    expect(effectiveTier('systemic', { ifrs9_stage_3_at_trigger: true })).toBe('systemic');
  });

  it('effectiveTier: 2+ floor flags → systemic regardless of raw tier', () => {
    expect(effectiveTier('minor', {
      cross_border_syndicate: true,
      sustainability_linked_loan: true,
    })).toBe('systemic');
    expect(effectiveTier('standard', {
      cross_border_syndicate: true,
      ifrs9_stage_3_at_trigger: true,
      sustainability_linked_loan: true,
    })).toBe('systemic');
  });

  it('effectiveTier: public_bondholder forces systemic', () => {
    expect(effectiveTier('minor', { public_bondholder_consent_required: true })).toBe('systemic');
    expect(effectiveTier('standard', { public_bondholder_consent_required: true })).toBe('systemic');
  });

  it('effectiveTier: sarb_large_exposure forces systemic', () => {
    expect(effectiveTier('minor', { sarb_large_exposure_threshold: true })).toBe('systemic');
    expect(effectiveTier('material', { sarb_large_exposure_threshold: true })).toBe('systemic');
  });

  it('effectiveTier: no flags returns raw tier', () => {
    expect(effectiveTier('minor', {})).toBe('minor');
    expect(effectiveTier('standard', {})).toBe('standard');
    expect(effectiveTier('material', {})).toBe('material');
    expect(effectiveTier('systemic', {})).toBe('systemic');
  });

  it('isHeavyTier identifies material + systemic only', () => {
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('systemic')).toBe(true);
  });

  it('isReportable matches heavy tiers', () => {
    expect(isReportable('minor')).toBe(false);
    expect(isReportable('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('systemic')).toBe(true);
  });
});

describe('W108 Loan Restructure — SIGNATURE regulator crossings', () => {
  it('escalate_to_default crosses regulator EVERY tier (W108 SIGNATURE)', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('escalate_to_default', tier, {})).toBe(true);
    }
  });

  it('submit_to_credit_committee crosses regulator EVERY tier on systemic', () => {
    expect(crossesIntoRegulator('submit_to_credit_committee', 'systemic', {})).toBe(true);
  });

  it('submit_to_credit_committee crosses regulator EVERY tier on ifrs9_stage_3', () => {
    for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
      expect(crossesIntoRegulator('submit_to_credit_committee', tier, {
        ifrs9_stage_3_at_trigger: true,
      })).toBe(true);
    }
  });

  it('submit_to_credit_committee does NOT cross on minor/standard/material without ifrs9_3', () => {
    expect(crossesIntoRegulator('submit_to_credit_committee', 'minor', {})).toBe(false);
    expect(crossesIntoRegulator('submit_to_credit_committee', 'standard', {})).toBe(false);
    expect(crossesIntoRegulator('submit_to_credit_committee', 'material', {})).toBe(false);
  });

  it('mark_effective crosses regulator material+systemic only', () => {
    expect(crossesIntoRegulator('mark_effective', 'material', {})).toBe(true);
    expect(crossesIntoRegulator('mark_effective', 'systemic', {})).toBe(true);
    expect(crossesIntoRegulator('mark_effective', 'standard', {})).toBe(false);
    expect(crossesIntoRegulator('mark_effective', 'minor', {})).toBe(false);
  });

  it('launch_consent_solicitation crosses regulator only on public bondholder', () => {
    expect(crossesIntoRegulator('launch_consent_solicitation', 'material', {
      public_bondholder_consent_required: true,
    })).toBe(true);
    expect(crossesIntoRegulator('launch_consent_solicitation', 'systemic', {
      public_bondholder_consent_required: true,
    })).toBe(true);
    expect(crossesIntoRegulator('launch_consent_solicitation', 'minor', {})).toBe(false);
    expect(crossesIntoRegulator('launch_consent_solicitation', 'systemic', {})).toBe(false);
  });

  it('other actions never cross regulator on their own', () => {
    for (const a of ['start_preliminary_assessment', 'draft_proposal', 'approve_proposal',
      'sign_term_sheet', 'sign_amendment', 'complete_restructure', 'abandon'] as const) {
      for (const tier of ['minor', 'standard', 'material', 'systemic'] as const) {
        expect(crossesIntoRegulator(a, tier, {})).toBe(false);
      }
    }
  });

  it('slaBreachCrossesIntoRegulator on material+systemic only', () => {
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('systemic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
  });
});

describe('W108 Loan Restructure — party + event mapping', () => {
  it('borrower drives trigger_restructure / negotiate / sign / abandon / revise', () => {
    expect(partyForAction('trigger_restructure')).toBe('borrower');
    expect(partyForAction('negotiate_term_sheet')).toBe('borrower');
    expect(partyForAction('sign_term_sheet')).toBe('borrower');
    expect(partyForAction('sign_amendment')).toBe('borrower');
    expect(partyForAction('abandon')).toBe('borrower');
    expect(partyForAction('revise_proposal')).toBe('borrower');
  });

  it('lender drives preliminary_assessment / draft / submit / approve / reject / docs / effective / monitor / complete / escalate', () => {
    expect(partyForAction('start_preliminary_assessment')).toBe('lender');
    expect(partyForAction('draft_proposal')).toBe('lender');
    expect(partyForAction('submit_to_credit_committee')).toBe('lender');
    expect(partyForAction('approve_proposal')).toBe('lender');
    expect(partyForAction('reject_proposal')).toBe('lender');
    expect(partyForAction('draft_documentation')).toBe('lender');
    expect(partyForAction('launch_consent_solicitation')).toBe('lender');
    expect(partyForAction('mark_effective')).toBe('lender');
    expect(partyForAction('monitor_compliance')).toBe('lender');
    expect(partyForAction('complete_restructure')).toBe('lender');
    expect(partyForAction('escalate_to_default')).toBe('lender');
  });

  it('syndicate_member drives record_consent', () => {
    expect(partyForAction('record_consent')).toBe('syndicate_member');
  });

  it('eventTypeFor returns a loan_restructure event for every action', () => {
    expect(eventTypeFor('trigger_restructure')).toBe('loan_restructure_triggered');
    expect(eventTypeFor('submit_to_credit_committee')).toBe('loan_restructure_submitted');
    expect(eventTypeFor('approve_proposal')).toBe('loan_restructure_approved');
    expect(eventTypeFor('mark_effective')).toBe('loan_restructure_effective');
    expect(eventTypeFor('escalate_to_default')).toBe('loan_restructure_escalated');
    expect(eventTypeFor('complete_restructure')).toBe('loan_restructure_completed');
    expect(eventTypeFor('abandon')).toBe('loan_restructure_abandoned');
  });
});

describe('W108 Loan Restructure — LIVE battery (16-field decoration)', () => {
  it('restructureCompletenessIndex peaks at 130 with all components', () => {
    expect(restructureCompletenessIndex({
      preliminary_assessment: true,
      proposal_drafted: true,
      credit_committee_review: true,
      term_sheet_signed: true,
      documentation_drafted: true,
      consent_launched: true,
      consent_majority_passed: true,
      amendment_signed: true,
      effective: true,
      monitoring: true,
      first_cure_period_clean: true,
    })).toBe(130);
  });

  it('restructureCompletenessIndex partial sum', () => {
    expect(restructureCompletenessIndex({
      preliminary_assessment: true,
      proposal_drafted: true,
    })).toBe(20);
    expect(restructureCompletenessIndex({})).toBe(0);
  });

  it('consentThresholdPct returns LMA-standard cuts', () => {
    expect(consentThresholdPct('simple_majority')).toBe(50);
    expect(consentThresholdPct('special_majority')).toBe(66.7);
    expect(consentThresholdPct('super_majority')).toBe(75);
    expect(consentThresholdPct('unanimity')).toBe(100);
  });

  it('consentMajorityPct computes consented / syndicate %', () => {
    expect(consentMajorityPct(3, 4)).toBe(75);
    expect(consentMajorityPct(2, 3)).toBe(66.67);
    expect(consentMajorityPct(0, 5)).toBe(0);
    expect(consentMajorityPct(5, 5)).toBe(100);
    expect(consentMajorityPct(null, 5)).toBe(0);
    expect(consentMajorityPct(3, 0)).toBe(0);
  });

  it('daysToConsentDeadline counts days remaining', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(daysToConsentDeadline('2026-06-29T00:00:00Z', now)).toBe(30);
    expect(daysToConsentDeadline('2026-05-29T00:00:00Z', now)).toBe(-1);
    expect(daysToConsentDeadline(null, now)).toBeNull();
  });

  it('slaHoursRemaining can go negative when breached', () => {
    const entered = new Date('2026-05-30T00:00:00.000Z');
    const now = new Date('2026-09-01T00:00:00.000Z'); // ~94 days later
    // minor × trigger_event = 30 days → already past
    const left = slaHoursRemaining('trigger_event', 'minor', entered, now);
    expect(left).toBeLessThan(0);
  });

  it('slaHoursRemaining counts down', () => {
    const entered = new Date('2026-05-30T00:00:00.000Z');
    const now = new Date('2026-06-09T00:00:00.000Z'); // 10 days later
    // systemic × trigger_event = 180 days → 170 days left = 4080 hrs
    const left = slaHoursRemaining('trigger_event', 'systemic', entered, now);
    expect(left).toBeGreaterThan(4000);
    expect(left).toBeLessThan(4100);
  });

  it('slaHoursRemaining returns 0 for terminals + null entry', () => {
    expect(slaHoursRemaining('completed', 'systemic', new Date(), new Date())).toBe(0);
    expect(slaHoursRemaining('trigger_event', 'systemic', null, new Date())).toBe(0);
  });

  it('urgencyBand composes tier + SLA hours into critical/high/medium/low', () => {
    // systemic — long thresholds (board-level urgency on weeks/months)
    expect(urgencyBand('systemic', 200 * 24)).toBe('low');
    expect(urgencyBand('systemic', 60 * 24)).toBe('medium');
    expect(urgencyBand('systemic', 20 * 24)).toBe('high');
    expect(urgencyBand('systemic', 3 * 24)).toBe('critical');
    expect(urgencyBand('systemic', -1)).toBe('critical');
    // minor — tighter thresholds
    expect(urgencyBand('minor', 200 * 24)).toBe('low');
    expect(urgencyBand('minor', 5 * 24)).toBe('medium');
    expect(urgencyBand('minor', 2 * 24)).toBe('high');
    expect(urgencyBand('minor', 12)).toBe('critical');
  });

  it('authorityRequired ladder: relationship_manager → CRO', () => {
    expect(authorityRequired('minor')).toBe('relationship_manager');
    expect(authorityRequired('standard')).toBe('credit_committee');
    expect(authorityRequired('material')).toBe('portfolio_director');
    expect(authorityRequired('systemic')).toBe('CRO');
  });

  it('boardEscalationRequired fires only on systemic + public_bondholder OR sarb_large_exposure', () => {
    expect(boardEscalationRequired('systemic', { public_bondholder_consent_required: true })).toBe(true);
    expect(boardEscalationRequired('systemic', { sarb_large_exposure_threshold: true })).toBe(true);
    expect(boardEscalationRequired('systemic', {})).toBe(false);
    expect(boardEscalationRequired('material', { public_bondholder_consent_required: true })).toBe(false);
    expect(boardEscalationRequired('minor', { sarb_large_exposure_threshold: true })).toBe(false);
  });

  it('regulatorFilingWindowHours: systemic tightest (24h), minor loosest (240h)', () => {
    expect(regulatorFilingWindowHours('systemic')).toBe(24);
    expect(regulatorFilingWindowHours('material')).toBe(72);
    expect(regulatorFilingWindowHours('standard')).toBe(168);
    expect(regulatorFilingWindowHours('minor')).toBe(240);
  });

  it('bridgesToCovenantCertificateChain fires when covenant_breach_ref is set (W38 link)', () => {
    expect(bridgesToCovenantCertificateChain(null)).toBe(false);
    expect(bridgesToCovenantCertificateChain('')).toBe(false);
    expect(bridgesToCovenantCertificateChain('cov-cert-2026-001')).toBe(true);
  });

  it('bridgesToDscrMonitoringChain fires when dscr_shortfall_ref is set (W86 link)', () => {
    expect(bridgesToDscrMonitoringChain(null)).toBe(false);
    expect(bridgesToDscrMonitoringChain('')).toBe(false);
    expect(bridgesToDscrMonitoringChain('dscr-mon-2026-001')).toBe(true);
  });

  it('bridgesToDefaultChain fires when status=escalated OR default_chain_ref set (W45 link)', () => {
    expect(bridgesToDefaultChain('escalated_to_default', null)).toBe(true);
    expect(bridgesToDefaultChain('trigger_event', 'def-2026-001')).toBe(true);
    expect(bridgesToDefaultChain('preliminary_assessment', null)).toBe(false);
    expect(bridgesToDefaultChain('completed', null)).toBe(false);
  });

  it('ifrs9StageAtTrigger: Stage 3 from ifrs9_stage_3, Stage 2 from on_watch, Stage 1 otherwise', () => {
    expect(ifrs9StageAtTrigger(true, false)).toBe(3);
    expect(ifrs9StageAtTrigger(true, true)).toBe(3);
    expect(ifrs9StageAtTrigger(false, true)).toBe(2);
    expect(ifrs9StageAtTrigger(false, false)).toBe(1);
    expect(ifrs9StageAtTrigger(null, null)).toBe(1);
  });

  it('proposedReliefZar composes forbearance + reschedule + maturity-extension', () => {
    // 6 months forbearance × R1m/mo debt service + R10m reschedule
    // + 12 months extension × R1m/mo = 6m + 10m + 12m = R28m
    expect(proposedReliefZar({
      forbearance_period_months: 6,
      principal_reschedule_zar: 10_000_000,
      maturity_extension_months: 12,
      debt_service_per_month_zar: 1_000_000,
    })).toBe(28_000_000);
    expect(proposedReliefZar({})).toBe(0);
    expect(proposedReliefZar({ forbearance_period_months: 6, debt_service_per_month_zar: 500_000 })).toBe(3_000_000);
  });

  it('principalReschedulePct = principal_reschedule / facility %', () => {
    expect(principalReschedulePct(100_000_000, 1_000_000_000)).toBe(10);
    expect(principalReschedulePct(50_000_000, 200_000_000)).toBe(25);
    expect(principalReschedulePct(0, 1_000_000_000)).toBe(0);
    expect(principalReschedulePct(100_000_000, 0)).toBe(0);
  });
});
