// W106 — NERSA Section 35 Administrative Enforcement Action & Fine Imposition
// chain spec tests. 10th Regulator chain. INVERTED SLA polarity (strategic =
// LONGEST runway for PAJA s5 procedural fairness). FLOOR-AT-MATERIAL on 5
// flags + strategic on licence_revocation_proposed / criminal_referral /
// 2+ flags. SIGNATURE: impose_sanction every tier on licence_revocation_proposed;
// commence_enforcement every tier strategic; mark_settled material+strategic
// on significant sanction_types; sla_breached material+strategic.
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  SLA_MINUTES,
  allowedActions,
  nextStatus,
  isTerminal,
  isHardTerminal,
  slaWindowMinutes,
  deriveSlaDeadline,
  tierForQuantum,
  countFloorFlags,
  effectiveTier,
  deriveTier,
  quantumBase,
  isHeavyTier,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  isReportable,
  partyForAction,
  eventTypeFor,
  appealStatusBand,
  daysToAppealWindowClose,
  adjudicationProgressPct,
  enforcementComplianceIndex,
  pajaFairnessAtRiskFlag,
  gazettePublicationRequired,
  bridgesToInspectionChain,
  bridgesToComplaintChain,
  bridgesToLicenceRenewalChain,
  authorityRequired,
  urgencyBand,
  slaDaysRemaining,
  runLiveBattery,
  type EnfStatus,
  type EnfAction,
  type EnfTier,
} from '../src/utils/enforcement-action-s35-spec';

describe('W106 — 12-state happy path', () => {
  it('triggered -> sanction_imposed -> appeal_window_open -> enforcement -> settled -> archived', () => {
    let s: EnfStatus = 'triggered';
    s = nextStatus(s, 'draft_notice')!;          expect(s).toBe('notice_drafted');
    s = nextStatus(s, 'issue_notice')!;          expect(s).toBe('notice_issued');
    s = nextStatus(s, 'acknowledge_notice')!;    expect(s).toBe('respondent_acknowledged');
    s = nextStatus(s, 'submit_response')!;       expect(s).toBe('response_received');
    s = nextStatus(s, 'start_adjudication')!;    expect(s).toBe('adjudication_in_progress');
    s = nextStatus(s, 'adjudicate')!;             expect(s).toBe('adjudicated');
    s = nextStatus(s, 'impose_sanction')!;        expect(s).toBe('sanction_imposed');
    s = nextStatus(s, 'open_appeal_window')!;     expect(s).toBe('appeal_window_open');
    s = nextStatus(s, 'commence_enforcement')!;   expect(s).toBe('enforcement_in_progress');
    s = nextStatus(s, 'mark_settled')!;           expect(s).toBe('settled');
    s = nextStatus(s, 'archive_action')!;         expect(s).toBe('archived');
  });

  it('submit_response can fire from notice_issued (skipping acknowledge)', () => {
    expect(nextStatus('notice_issued', 'submit_response')).toBe('response_received');
  });

  it('start_adjudication can fire from respondent_acknowledged (no response)', () => {
    expect(nextStatus('respondent_acknowledged', 'start_adjudication')).toBe('adjudication_in_progress');
  });
});

describe('W106 — appeal branch', () => {
  it('appeal_window_open -> appealed -> re_adjudicated -> sanction_imposed', () => {
    let s: EnfStatus = 'appeal_window_open';
    s = nextStatus(s, 'lodge_appeal')!;       expect(s).toBe('appealed');
    s = nextStatus(s, 'decide_appeal')!;      expect(s).toBe('re_adjudicated');
    s = nextStatus(s, 'impose_sanction')!;    expect(s).toBe('sanction_imposed');
  });

  it('re_adjudicated -> commence_enforcement upheld with execution', () => {
    expect(nextStatus('re_adjudicated', 'commence_enforcement')).toBe('enforcement_in_progress');
  });

  it('appeal_window_open allows commence_enforcement (no appeal lodged)', () => {
    expect(nextStatus('appeal_window_open', 'commence_enforcement')).toBe('enforcement_in_progress');
  });

  it('sanction_imposed allows direct commence_enforcement OR mark_settled OR open_appeal_window', () => {
    expect(nextStatus('sanction_imposed', 'open_appeal_window')).toBe('appeal_window_open');
    expect(nextStatus('sanction_imposed', 'commence_enforcement')).toBe('enforcement_in_progress');
    expect(nextStatus('sanction_imposed', 'mark_settled')).toBe('settled');
  });
});

describe('W106 — withdraw and cancel from non-terminal', () => {
  it('withdraw_action fires from every non-terminal state', () => {
    const states: EnfStatus[] = [
      'triggered', 'notice_drafted', 'notice_issued',
      'respondent_acknowledged', 'response_received',
      'adjudication_in_progress', 'adjudicated',
      'sanction_imposed', 'appeal_window_open',
      'appealed', 're_adjudicated', 'enforcement_in_progress',
    ];
    for (const s of states) {
      expect(nextStatus(s, 'withdraw_action')).toBe('withdrawn');
    }
  });

  it('cancel_action fires from every non-terminal state', () => {
    const states: EnfStatus[] = [
      'triggered', 'notice_drafted', 'notice_issued',
      'respondent_acknowledged', 'response_received',
      'adjudication_in_progress', 'adjudicated',
      'sanction_imposed', 'appeal_window_open',
      'appealed', 're_adjudicated', 'enforcement_in_progress',
    ];
    for (const s of states) {
      expect(nextStatus(s, 'cancel_action')).toBe('cancelled');
    }
  });
});

describe('W106 — terminal protection', () => {
  it('hard terminals (archived, withdrawn, cancelled) reject every action', () => {
    for (const t of ['archived', 'withdrawn', 'cancelled'] as EnfStatus[]) {
      expect(nextStatus(t, 'draft_notice')).toBeNull();
      expect(nextStatus(t, 'impose_sanction')).toBeNull();
      expect(nextStatus(t, 'withdraw_action')).toBeNull();
      expect(nextStatus(t, 'cancel_action')).toBeNull();
      expect(nextStatus(t, 'archive_action')).toBeNull();
      expect(isHardTerminal(t)).toBe(true);
      expect(isTerminal(t)).toBe(true);
    }
  });

  it('settled is SOFT terminal — UI-terminal but accepts only archive_action', () => {
    expect(isTerminal('settled')).toBe(true);
    expect(isHardTerminal('settled')).toBe(false);
    expect(nextStatus('settled', 'archive_action')).toBe('archived');
    expect(nextStatus('settled', 'draft_notice')).toBeNull();
    expect(nextStatus('settled', 'impose_sanction')).toBeNull();
    expect(nextStatus('settled', 'withdraw_action')).toBeNull();
    expect(nextStatus('settled', 'cancel_action')).toBeNull();
  });

  it('allowedActions on settled returns only archive_action', () => {
    expect(allowedActions('settled')).toEqual(['archive_action']);
  });

  it('allowedActions on hard terminals returns empty', () => {
    expect(allowedActions('archived')).toEqual([]);
    expect(allowedActions('withdrawn')).toEqual([]);
    expect(allowedActions('cancelled')).toEqual([]);
  });
});

describe('W106 — tier derivation by quantum', () => {
  it('minor < 1m', () => {
    expect(tierForQuantum(0)).toBe('minor');
    expect(tierForQuantum(500000)).toBe('minor');
    expect(tierForQuantum(999999)).toBe('minor');
  });

  it('standard 1m-10m', () => {
    expect(tierForQuantum(1000000)).toBe('standard');
    expect(tierForQuantum(5000000)).toBe('standard');
    expect(tierForQuantum(9999999)).toBe('standard');
  });

  it('material 10m-100m', () => {
    expect(tierForQuantum(10000000)).toBe('material');
    expect(tierForQuantum(50000000)).toBe('material');
    expect(tierForQuantum(99999999)).toBe('material');
  });

  it('strategic >= 100m', () => {
    expect(tierForQuantum(100000000)).toBe('strategic');
    expect(tierForQuantum(500000000)).toBe('strategic');
    expect(tierForQuantum(1000000000)).toBe('strategic');
  });

  it('negative or NaN defaults to minor', () => {
    expect(tierForQuantum(-1)).toBe('minor');
    expect(tierForQuantum(null)).toBe('minor');
    expect(tierForQuantum(undefined)).toBe('minor');
  });
});

describe('W106 — FLOOR-AT-MATERIAL and strategic escalation', () => {
  it('licence_revocation_proposed alone forces strategic regardless of quantum', () => {
    expect(effectiveTier('minor', {
      enforcement_floor_flag_licence_revocation_proposed: 1,
    })).toBe('strategic');
    expect(deriveTier(0, 0, {
      enforcement_floor_flag_licence_revocation_proposed: 1,
    })).toBe('strategic');
  });

  it('criminal_referral_recommended alone forces strategic', () => {
    expect(effectiveTier('minor', {
      enforcement_floor_flag_criminal_referral_recommended: 1,
    })).toBe('strategic');
  });

  it('repeat_offender_within_36mo alone floors at material', () => {
    expect(effectiveTier('minor', {
      enforcement_floor_flag_repeat_offender_within_36mo: 1,
    })).toBe('material');
    expect(effectiveTier('standard', {
      enforcement_floor_flag_repeat_offender_within_36mo: 1,
    })).toBe('material');
  });

  it('public_safety_impact_strict alone floors at material', () => {
    expect(effectiveTier('minor', {
      enforcement_floor_flag_public_safety_impact_strict: 1,
    })).toBe('material');
  });

  it('financial_quantum_over_50m alone floors at material', () => {
    expect(effectiveTier('minor', {
      enforcement_floor_flag_financial_quantum_over_50m: 1,
    })).toBe('material');
  });

  it('2 floor flags forces strategic', () => {
    expect(effectiveTier('minor', {
      enforcement_floor_flag_repeat_offender_within_36mo: 1,
      enforcement_floor_flag_public_safety_impact_strict: 1,
    })).toBe('strategic');
  });

  it('no flags returns raw tier', () => {
    expect(effectiveTier('standard', {})).toBe('standard');
    expect(effectiveTier('material', {})).toBe('material');
  });

  it('countFloorFlags counts all 5 flags', () => {
    expect(countFloorFlags({
      enforcement_floor_flag_licence_revocation_proposed: 1,
      enforcement_floor_flag_repeat_offender_within_36mo: 1,
      enforcement_floor_flag_public_safety_impact_strict: 1,
      enforcement_floor_flag_financial_quantum_over_50m: 1,
      enforcement_floor_flag_criminal_referral_recommended: 1,
    })).toBe(5);
    expect(countFloorFlags({})).toBe(0);
  });
});

describe('W106 — quantumBase coalesces sanction + floor', () => {
  it('returns sanction_quantum_zar when present', () => {
    expect(quantumBase(5000000, 1000000)).toBe(5000000);
  });

  it('falls back to floor when sanction is null/0', () => {
    expect(quantumBase(null, 2000000)).toBe(2000000);
    expect(quantumBase(0, 2000000)).toBe(2000000);
  });

  it('returns 0 when neither set', () => {
    expect(quantumBase(null, null)).toBe(0);
    expect(quantumBase(0, 0)).toBe(0);
  });
});

describe('W106 — INVERTED SLA polarity (strategic LONGEST)', () => {
  it('triggered: strategic 180d > material 120d > standard 60d > minor 30d', () => {
    expect(SLA_MINUTES.triggered.strategic).toBe(180 * 24 * 60);
    expect(SLA_MINUTES.triggered.material).toBe(120 * 24 * 60);
    expect(SLA_MINUTES.triggered.standard).toBe(60 * 24 * 60);
    expect(SLA_MINUTES.triggered.minor).toBe(30 * 24 * 60);
    expect(SLA_MINUTES.triggered.strategic).toBeGreaterThan(SLA_MINUTES.triggered.material);
    expect(SLA_MINUTES.triggered.material).toBeGreaterThan(SLA_MINUTES.triggered.standard);
    expect(SLA_MINUTES.triggered.standard).toBeGreaterThan(SLA_MINUTES.triggered.minor);
  });

  it('strictly INCREASING minor -> strategic at every graded state', () => {
    const graded: EnfStatus[] = [
      'triggered', 'notice_drafted', 'notice_issued',
      'respondent_acknowledged', 'response_received',
      'adjudication_in_progress', 'adjudicated',
      'sanction_imposed', 'appeal_window_open',
      'appealed', 're_adjudicated', 'enforcement_in_progress',
    ];
    for (const st of graded) {
      const row = SLA_MINUTES[st];
      expect(row.standard).toBeGreaterThan(row.minor);
      expect(row.material).toBeGreaterThan(row.standard);
      expect(row.strategic).toBeGreaterThan(row.material);
    }
  });

  it('terminals all zero SLA', () => {
    for (const t of ['settled', 'archived', 'withdrawn', 'cancelled'] as EnfStatus[]) {
      const row = SLA_MINUTES[t];
      expect(row.minor).toBe(0);
      expect(row.standard).toBe(0);
      expect(row.material).toBe(0);
      expect(row.strategic).toBe(0);
    }
  });

  it('deriveSlaDeadline returns null on terminals, fires on graded states', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(deriveSlaDeadline('archived', 'minor', now)).toBeNull();
    expect(deriveSlaDeadline('withdrawn', 'strategic', now)).toBeNull();
    expect(deriveSlaDeadline('settled', 'minor', now)).toBeNull();
    const d = deriveSlaDeadline('triggered', 'strategic', now);
    expect(d).not.toBeNull();
    // 180 days later
    expect(d!.getTime() - now.getTime()).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it('slaWindowMinutes mirrors SLA_MINUTES', () => {
    expect(slaWindowMinutes('triggered', 'strategic')).toBe(SLA_MINUTES.triggered.strategic);
    expect(slaWindowMinutes('archived', 'minor')).toBe(0);
  });

  it('slaDaysRemaining computes negative when past', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-05-01T00:00:00Z'); // 120 days in
    // minor on triggered = 30d. So days remaining = 30 - 120 = -90 (approx).
    const r = slaDaysRemaining('triggered', 'minor', enteredAt, now);
    expect(r).toBeLessThan(0);
  });

  it('slaDaysRemaining 0 when enteredAt null', () => {
    expect(slaDaysRemaining('triggered', 'minor', null, new Date())).toBe(0);
  });
});

describe('W106 — Authority ladder (4-step)', () => {
  it('minor -> nersa_compliance_officer', () => {
    expect(authorityRequired('minor')).toBe('nersa_compliance_officer');
  });
  it('standard -> nersa_legal_advisor', () => {
    expect(authorityRequired('standard')).toBe('nersa_legal_advisor');
  });
  it('material -> nersa_executive_manager_compliance', () => {
    expect(authorityRequired('material')).toBe('nersa_executive_manager_compliance');
  });
  it('strategic -> nersa_full_council (Council reserved for licence-revocation tier)', () => {
    expect(authorityRequired('strategic')).toBe('nersa_full_council');
  });
});

describe('W106 — SIGNATURE regulator crossings', () => {
  it('impose_sanction crosses regulator EVERY tier when licence_revocation_proposed=TRUE', () => {
    for (const t of ['minor', 'standard', 'material', 'strategic'] as EnfTier[]) {
      expect(crossesIntoRegulator('impose_sanction', t, {
        licence_revocation_proposed: 1,
      })).toBe(true);
    }
  });

  it('impose_sanction does NOT cross when licence_revocation_proposed=FALSE (signature)', () => {
    for (const t of ['minor', 'standard', 'material', 'strategic'] as EnfTier[]) {
      expect(crossesIntoRegulator('impose_sanction', t, {
        licence_revocation_proposed: 0,
      })).toBe(false);
    }
  });

  it('commence_enforcement crosses regulator EVERY tier on strategic', () => {
    expect(crossesIntoRegulator('commence_enforcement', 'strategic', {})).toBe(true);
  });

  it('commence_enforcement does NOT cross on minor/standard/material (without criminal_intelligence)', () => {
    expect(crossesIntoRegulator('commence_enforcement', 'minor', {})).toBe(false);
    expect(crossesIntoRegulator('commence_enforcement', 'standard', {})).toBe(false);
    expect(crossesIntoRegulator('commence_enforcement', 'material', {})).toBe(false);
  });

  it('commence_enforcement crosses EVERY tier when triggering_event_type=criminal_intelligence', () => {
    for (const t of ['minor', 'standard', 'material', 'strategic'] as EnfTier[]) {
      expect(crossesIntoRegulator('commence_enforcement', t, {
        triggering_event_type: 'criminal_intelligence',
      })).toBe(true);
    }
  });

  it('mark_settled crosses material+strategic when sanction_type in significant set', () => {
    for (const sig of ['licence_suspended', 'licence_revoked', 'criminal_referral']) {
      expect(crossesIntoRegulator('mark_settled', 'material', { sanction_type: sig })).toBe(true);
      expect(crossesIntoRegulator('mark_settled', 'strategic', { sanction_type: sig })).toBe(true);
      expect(crossesIntoRegulator('mark_settled', 'minor', { sanction_type: sig })).toBe(false);
      expect(crossesIntoRegulator('mark_settled', 'standard', { sanction_type: sig })).toBe(false);
    }
  });

  it('mark_settled does NOT cross for non-significant sanction_types', () => {
    expect(crossesIntoRegulator('mark_settled', 'strategic', { sanction_type: 'fine' })).toBe(false);
    expect(crossesIntoRegulator('mark_settled', 'material', { sanction_type: 'warning' })).toBe(false);
  });

  it('sla_breached crosses regulator material+strategic only (PAJA fairness exposure)', () => {
    expect(slaBreachCrossesIntoRegulator('material')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('strategic')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('minor')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('standard')).toBe(false);
  });

  it('withdraw_action / cancel_action crosses on heavy tier or revocation/criminal flags', () => {
    expect(crossesIntoRegulator('withdraw_action', 'material', {})).toBe(true);
    expect(crossesIntoRegulator('cancel_action', 'strategic', {})).toBe(true);
    expect(crossesIntoRegulator('withdraw_action', 'minor', {
      licence_revocation_proposed: 1,
    })).toBe(true);
    expect(crossesIntoRegulator('cancel_action', 'minor', {})).toBe(false);
  });
});

describe('W106 — isReportable + isHeavyTier', () => {
  it('material + strategic are heavy tiers (reportable)', () => {
    expect(isHeavyTier('material')).toBe(true);
    expect(isHeavyTier('strategic')).toBe(true);
    expect(isHeavyTier('minor')).toBe(false);
    expect(isHeavyTier('standard')).toBe(false);
    expect(isReportable('material')).toBe(true);
    expect(isReportable('strategic')).toBe(true);
    expect(isReportable('minor')).toBe(false);
  });
});

describe('W106 — actor_party derivation', () => {
  it('NERSA writes draft/issue/start_adjudication/commence_enforcement/withdraw/cancel/archive', () => {
    expect(partyForAction('draft_notice')).toBe('nersa');
    expect(partyForAction('issue_notice')).toBe('nersa');
    expect(partyForAction('commence_enforcement')).toBe('nersa');
    expect(partyForAction('withdraw_action')).toBe('nersa');
    expect(partyForAction('cancel_action')).toBe('nersa');
    expect(partyForAction('archive_action')).toBe('archiver');
  });

  it('respondent writes acknowledge_notice / submit_response / lodge_appeal', () => {
    expect(partyForAction('acknowledge_notice')).toBe('respondent');
    expect(partyForAction('submit_response')).toBe('respondent');
    expect(partyForAction('lodge_appeal')).toBe('respondent');
  });

  it('panel/council adjudicate', () => {
    expect(partyForAction('start_adjudication')).toBe('panel');
    expect(partyForAction('adjudicate')).toBe('council');
    expect(partyForAction('impose_sanction')).toBe('council');
    expect(partyForAction('decide_appeal')).toBe('council');
    expect(partyForAction('re_adjudicate')).toBe('council');
  });
});

describe('W106 — event-type mapping', () => {
  it('every action maps to enforcement_action.* event', () => {
    const actions: EnfAction[] = [
      'trigger', 'draft_notice', 'issue_notice', 'acknowledge_notice',
      'submit_response', 'start_adjudication', 'adjudicate', 'impose_sanction',
      'open_appeal_window', 'lodge_appeal', 'decide_appeal', 're_adjudicate',
      'commence_enforcement', 'mark_settled', 'archive_action',
      'withdraw_action', 'cancel_action',
    ];
    for (const a of actions) {
      const e = eventTypeFor(a);
      expect(e).not.toBeNull();
      expect(e!.startsWith('enforcement_action.')).toBe(true);
    }
  });

  it('re_adjudicate maps to sanction_imposed downstream', () => {
    expect(eventTypeFor('re_adjudicate')).toBe('enforcement_action.sanction_imposed');
  });
});

describe('W106 — LIVE battery', () => {
  it('runLiveBattery exposes all 14 LIVE fields', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const out = runLiveBattery({
      status: 'sanction_imposed',
      tier: 'strategic',
      sanction_quantum_zar: 150000000,
      sanction_quantum_zar_floor: 0,
      now,
      sla_days_remaining: 30,
    });
    expect(out.sanction_quantum_zar_live).toBe(150000000);
    expect(out.appeal_status_band_live).toBe('none');
    expect(out.adjudication_progress_pct_live).toBe(75);
    expect(out.authority_required_live).toBe('nersa_full_council');
    expect(out.urgency_band_live).toBe('high');
    expect(out.gazette_publication_required_live).toBe(true);
    expect(out.bridges_to_inspection_chain_live).toBe(false);
    expect(out.bridges_to_complaint_chain_live).toBe(false);
    expect(out.bridges_to_licence_renewal_chain_live).toBe(false);
    expect(out.paja_fairness_at_risk_flag_live).toBe(false);
    expect(out.enforcement_compliance_index_live).toBeGreaterThanOrEqual(0);
  });

  it('appeal_status_band: window_open when status=appeal_window_open', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(appealStatusBand('appeal_window_open', null, null, null, now)).toBe('window_open');
  });

  it('appeal_status_band: appealed when appeal_lodged_at set', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(appealStatusBand('appealed', '2026-05-15T00:00:00Z', null, null, now)).toBe('appealed');
  });

  it('appeal_status_band: decided when appeal_outcome set', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(appealStatusBand('appealed', '2026-05-15T00:00:00Z', 'upheld', null, now)).toBe('decided');
  });

  it('appeal_status_band: past_window when window closed in past with no lodge', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    expect(appealStatusBand('enforcement_in_progress', null, null, '2026-05-15T00:00:00Z', now)).toBe('past_window');
  });

  it('daysToAppealWindowClose computes negative when window past', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const days = daysToAppealWindowClose('2026-05-15T00:00:00Z', now);
    expect(days).toBeLessThan(0);
  });

  it('adjudicationProgressPct: 0/25/50/75/100 ladder', () => {
    expect(adjudicationProgressPct('triggered')).toBe(0);
    expect(adjudicationProgressPct('notice_drafted')).toBe(0);
    expect(adjudicationProgressPct('notice_issued')).toBe(25);
    expect(adjudicationProgressPct('respondent_acknowledged')).toBe(25);
    expect(adjudicationProgressPct('response_received')).toBe(50);
    expect(adjudicationProgressPct('adjudication_in_progress')).toBe(50);
    expect(adjudicationProgressPct('adjudicated')).toBe(75);
    expect(adjudicationProgressPct('sanction_imposed')).toBe(75);
    expect(adjudicationProgressPct('appeal_window_open')).toBe(100);
    expect(adjudicationProgressPct('enforcement_in_progress')).toBe(100);
    expect(adjudicationProgressPct('settled')).toBe(100);
    expect(adjudicationProgressPct('archived')).toBe(100);
  });

  it('enforcementComplianceIndex caps at 130', () => {
    const score = enforcementComplianceIndex({
      notice_issued: 1, response_received: 1, adjudication_completed: 1,
      sanction_imposed: 1, appeal_handled_or_skip: 1, enforcement_started: 1,
      settled: 1, no_withdrawal_bonus: 1, first_pass_clean_bonus: 1,
    });
    expect(score).toBe(130);
  });

  it('enforcementComplianceIndex zero when none set', () => {
    expect(enforcementComplianceIndex({})).toBe(0);
  });

  it('paja_fairness_at_risk_flag: true only when slaBreached AND heavy tier', () => {
    expect(pajaFairnessAtRiskFlag(1, 'material')).toBe(true);
    expect(pajaFairnessAtRiskFlag(1, 'strategic')).toBe(true);
    expect(pajaFairnessAtRiskFlag(1, 'minor')).toBe(false);
    expect(pajaFairnessAtRiskFlag(1, 'standard')).toBe(false);
    expect(pajaFairnessAtRiskFlag(0, 'strategic')).toBe(false);
    expect(pajaFairnessAtRiskFlag(null, 'material')).toBe(false);
  });

  it('gazette_publication_required: true on strategic OR significant sanction_type', () => {
    expect(gazettePublicationRequired('strategic', null)).toBe(true);
    expect(gazettePublicationRequired('material', 'licence_revoked')).toBe(true);
    expect(gazettePublicationRequired('minor', 'licence_suspended')).toBe(true);
    expect(gazettePublicationRequired('minor', 'order_to_cease')).toBe(true);
    expect(gazettePublicationRequired('minor', 'criminal_referral')).toBe(true);
    expect(gazettePublicationRequired('minor', 'fine')).toBe(false);
    expect(gazettePublicationRequired('material', null)).toBe(false);
  });

  it('bridges to W40 / W66 / W33 chains', () => {
    expect(bridgesToInspectionChain('insp-001')).toBe(true);
    expect(bridgesToInspectionChain(null)).toBe(false);
    expect(bridgesToComplaintChain('cmp-001')).toBe(true);
    expect(bridgesToComplaintChain(null)).toBe(false);
    expect(bridgesToLicenceRenewalChain('lic-renew-001')).toBe(true);
    expect(bridgesToLicenceRenewalChain(null)).toBe(false);
  });

  it('runLiveBattery sets paja_fairness flag when slaBreached + heavy tier', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const out = runLiveBattery({
      status: 'adjudication_in_progress',
      tier: 'material',
      sanction_quantum_zar: 50000000,
      sla_breached: 1,
      now,
      sla_days_remaining: -5,
    });
    expect(out.paja_fairness_at_risk_flag_live).toBe(true);
    expect(out.urgency_band_live).toBe('critical');
  });

  it('runLiveBattery sets gazette flag on strategic', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const out = runLiveBattery({
      status: 'sanction_imposed',
      tier: 'strategic',
      sanction_quantum_zar: 200000000,
      sanction_type: 'licence_revoked',
      now,
    });
    expect(out.gazette_publication_required_live).toBe(true);
  });

  it('runLiveBattery bridges reflect upstream refs', () => {
    const now = new Date('2026-05-30T00:00:00Z');
    const out = runLiveBattery({
      status: 'triggered',
      tier: 'minor',
      triggering_inspection_id: 'insp-100',
      triggering_complaint_id: 'cmp-200',
      open_licence_renewal_ref: 'lic-renew-300',
      now,
    });
    expect(out.bridges_to_inspection_chain_live).toBe(true);
    expect(out.bridges_to_complaint_chain_live).toBe(true);
    expect(out.bridges_to_licence_renewal_chain_live).toBe(true);
  });
});

describe('W106 — urgency band thresholds', () => {
  it('overdue (negative days) -> critical at every tier', () => {
    for (const t of ['minor', 'standard', 'material', 'strategic'] as EnfTier[]) {
      expect(urgencyBand(t, -1)).toBe('critical');
    }
  });

  it('strategic always critical/high (depending on days left)', () => {
    expect(urgencyBand('strategic', 2)).toBe('critical');
    expect(urgencyBand('strategic', 10)).toBe('high');
  });

  it('material always critical/high (no medium)', () => {
    expect(urgencyBand('material', 1)).toBe('critical');
    expect(urgencyBand('material', 10)).toBe('high');
  });

  it('standard medium most of the time, high when tight', () => {
    expect(urgencyBand('standard', 1)).toBe('high');
    expect(urgencyBand('standard', 10)).toBe('medium');
  });

  it('minor low usually, high when very tight', () => {
    expect(urgencyBand('minor', 0.5)).toBe('high');
    expect(urgencyBand('minor', 10)).toBe('low');
  });
});

describe('W106 — deriveTier (full composition)', () => {
  it('strategic quantum + 0 flags -> strategic', () => {
    expect(deriveTier(200000000, 0, {})).toBe('strategic');
  });

  it('minor quantum + 1 flag -> material', () => {
    expect(deriveTier(0, 0, {
      enforcement_floor_flag_repeat_offender_within_36mo: 1,
    })).toBe('material');
  });

  it('minor quantum + licence_revocation_proposed -> strategic (signature)', () => {
    expect(deriveTier(0, 0, {
      enforcement_floor_flag_licence_revocation_proposed: 1,
    })).toBe('strategic');
  });

  it('material quantum + 0 flags -> material', () => {
    expect(deriveTier(50000000, 0, {})).toBe('material');
  });

  it('quantum coalesces to floor when zero', () => {
    expect(deriveTier(0, 50000000, {})).toBe('material');
  });
});

describe('W106 — TRANSITIONS matrix', () => {
  it('has 17 actions', () => {
    expect(Object.keys(TRANSITIONS).length).toBe(17);
  });

  it('every TRANSITIONS to-state is a valid EnfStatus', () => {
    const valid = new Set<EnfStatus>([
      'triggered', 'notice_drafted', 'notice_issued',
      'respondent_acknowledged', 'response_received',
      'adjudication_in_progress', 'adjudicated',
      'sanction_imposed', 'appeal_window_open',
      'enforcement_in_progress', 'settled', 'archived',
      'appealed', 're_adjudicated', 'withdrawn', 'cancelled',
    ]);
    for (const t of Object.values(TRANSITIONS)) {
      expect(valid.has(t.to)).toBe(true);
    }
  });
});
