// Wave 120 - ICFR Reconciliation Attestation spec battery.
//
// Covers: state machine (forward path attestation_proposed -> archived +
// 4 branches + terminals + suspend->resume to remediation_proposed +
// escalate->lift to remediation_proposed + reject from any non-terminal
// + 18-action TRANSITIONS map coverage), tier derivation from cadence +
// FLOOR-AT-QUARTERLY on each of 5 flags + FLOOR-AT-ANNUAL on 2+ flags,
// INVERTED SLA matrix anchored on attestation_proposed
// (24/96/168/360/720h), SIGNATURE ICFR-DEFICIENCY-ATTEST crossings
// (escalate_to_audit_committee EVERY tier; reject EVERY tier WHEN
// material_variance_unresolved AND icfr_deficiency_suspected; restate
// quarterly+annual only; sign_attestation never crosses; sla_breached
// HEAVY tiers only; suspend on regulator_audit_in_progress), party
// routing (4-party split: reconciler/controller/CFO/audit_committee_chair),
// authority ladder, attestation window (INVERTED polarity), urgency band
// (INVERTED polarity - annual_audit loosest), 7-bridge architecture
// (W113/W114/W115/W116/W117/W118/W119; W118 + W119 mandatory),
// reconciliation completeness 0-130, ICFR control effectiveness 0-130,
// variance score 0-130, remediation progress 0-130,
// external-auditor signed-JWT validation, feed source / break / root
// cause taxonomy validation, attestation health band composite.

import { describe, expect, it } from 'vitest';
import {
  TRANSITIONS,
  nextStatus,
  allowedActions,
  isTerminal,
  isHardTerminal,
  SLA_HOURS,
  slaWindowHours,
  slaDeadlineFor,
  slaHoursRemaining,
  tierForCadence,
  countFloorFlags,
  floorAtQuarterly,
  floorAtAnnual,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  attestationWindowHours,
  daysToQuarterlyAttestation,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  bridgesToW118AuditChain,
  bridgesToW119RegulatorExportChain,
  reconciliationCompletenessIndex,
  icfrControlEffectivenessIndex,
  varianceScoreIndex,
  remediationProgressIndex,
  isValidExternalAuditorJwtFormat,
  parseExternalAuditorClaims,
  isExternalAuditorClaimsExpired,
  externalAuditorCanReadAttestation,
  isKnownFeedSource,
  FEED_SOURCES,
  isKnownBreakClassification,
  BREAK_CLASSIFICATIONS,
  isKnownRootCauseTaxonomy,
  ROOT_CAUSE_TAXONOMIES,
  attestationHealthBand,
} from '../src/utils/reconciliation-attestation-spec';

describe('W120 ICFR Reconciliation Attestation - state machine', () => {
  it('walks the forward path attestation_proposed -> archived', () => {
    expect(nextStatus('attestation_proposed', 'define_scope')).toBe('scope_defined');
    expect(nextStatus('scope_defined', 'ingest_feeds')).toBe('feeds_ingested');
    expect(nextStatus('feeds_ingested', 'pair_blocks')).toBe('blocks_paired');
    expect(nextStatus('blocks_paired', 'compute_variance')).toBe('variance_computed');
    expect(nextStatus('variance_computed', 'classify_break')).toBe('break_classified');
    expect(nextStatus('break_classified', 'log_root_cause')).toBe('root_cause_logged');
    expect(nextStatus('root_cause_logged', 'propose_remediation')).toBe('remediation_proposed');
    expect(nextStatus('remediation_proposed', 'get_counter_party_signoff')).toBe('counter_party_signoff');
    expect(nextStatus('counter_party_signoff', 'run_independent_review')).toBe('independent_review');
    expect(nextStatus('independent_review', 'sign_attestation')).toBe('attestation_signed');
    expect(nextStatus('attestation_signed', 'archive')).toBe('archived');
  });

  it('blocks invalid forward jumps', () => {
    expect(nextStatus('attestation_proposed', 'ingest_feeds')).toBeNull();
    expect(nextStatus('scope_defined', 'pair_blocks')).toBeNull();
    expect(nextStatus('feeds_ingested', 'compute_variance')).toBeNull();
    expect(nextStatus('variance_computed', 'log_root_cause')).toBeNull();
    expect(nextStatus('counter_party_signoff', 'sign_attestation')).toBeNull();
  });

  it('treats archived as hard terminal (no further transitions)', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
    expect(nextStatus('archived', 'reject')).toBeNull();
    expect(nextStatus('archived', 'restate')).toBeNull();
    expect(nextStatus('archived', 'escalate_to_audit_committee')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
  });

  it('rejected is UI terminal but not hard terminal', () => {
    expect(isHardTerminal('rejected')).toBe(false);
    expect(isTerminal('rejected')).toBe(true);
  });

  it('suspend flow: any active state -> suspended -> resume to remediation_proposed', () => {
    expect(nextStatus('variance_computed', 'suspend')).toBe('suspended');
    expect(nextStatus('counter_party_signoff', 'suspend')).toBe('suspended');
    expect(nextStatus('independent_review', 'suspend')).toBe('suspended');
    expect(nextStatus('suspended', 'resume_from_suspend')).toBe('remediation_proposed');
    // suspend not allowed from attestation_proposed (pre-feed) or signed states
    expect(nextStatus('attestation_proposed', 'suspend')).toBeNull();
    expect(nextStatus('attestation_signed', 'suspend')).toBeNull();
    // ingest_feeds allowed from suspended (resume path mid-feed)
    expect(nextStatus('suspended', 'ingest_feeds')).toBe('feeds_ingested');
  });

  it('escalate flow: pre-sign work states -> escalated -> lift to remediation_proposed', () => {
    expect(nextStatus('variance_computed', 'escalate_to_audit_committee')).toBe('escalated_to_audit_committee');
    expect(nextStatus('break_classified', 'escalate_to_audit_committee')).toBe('escalated_to_audit_committee');
    expect(nextStatus('remediation_proposed', 'escalate_to_audit_committee')).toBe('escalated_to_audit_committee');
    expect(nextStatus('counter_party_signoff', 'escalate_to_audit_committee')).toBe('escalated_to_audit_committee');
    expect(nextStatus('independent_review', 'escalate_to_audit_committee')).toBe('escalated_to_audit_committee');
    expect(nextStatus('escalated_to_audit_committee', 'lift_escalation')).toBe('remediation_proposed');
    // escalate not allowed from early states or signed/archived
    expect(nextStatus('attestation_proposed', 'escalate_to_audit_committee')).toBeNull();
    expect(nextStatus('scope_defined', 'escalate_to_audit_committee')).toBeNull();
    expect(nextStatus('feeds_ingested', 'escalate_to_audit_committee')).toBeNull();
    expect(nextStatus('attestation_signed', 'escalate_to_audit_committee')).toBeNull();
  });

  it('restate flow: only from signed or archived', () => {
    expect(nextStatus('attestation_signed', 'restate')).toBe('restated');
    // archived is hard terminal so restate blocked there
    expect(nextStatus('archived', 'restate')).toBeNull();
    expect(nextStatus('restated', 'restate')).toBe('restated');
    // restate not allowed from work states
    expect(nextStatus('variance_computed', 'restate')).toBeNull();
    expect(nextStatus('remediation_proposed', 'restate')).toBeNull();
  });

  it('reject is allowed from every non-terminal', () => {
    const nonTerminals = [
      'attestation_proposed', 'scope_defined', 'feeds_ingested', 'blocks_paired',
      'variance_computed', 'break_classified', 'root_cause_logged',
      'remediation_proposed', 'counter_party_signoff', 'independent_review',
      'attestation_signed', 'restated', 'suspended', 'escalated_to_audit_committee',
    ] as const;
    for (const s of nonTerminals) {
      expect(nextStatus(s, 'reject')).toBe('rejected');
    }
    // not from hard terminal
    expect(nextStatus('archived', 'reject')).toBeNull();
  });

  it('TRANSITIONS map covers all 18 actions', () => {
    const actions = Object.keys(TRANSITIONS);
    expect(actions.length).toBe(18);
    expect(actions).toContain('propose_attestation');
    expect(actions).toContain('escalate_to_audit_committee');
    expect(actions).toContain('lift_escalation');
    expect(actions).toContain('resume_from_suspend');
  });

  it('propose_attestation is create-only (only from attestation_proposed)', () => {
    expect(nextStatus('attestation_proposed', 'propose_attestation')).toBe('attestation_proposed');
    expect(nextStatus('scope_defined', 'propose_attestation')).toBeNull();
    expect(nextStatus('variance_computed', 'propose_attestation')).toBeNull();
    // also excluded from allowedActions
    expect(allowedActions('attestation_proposed')).not.toContain('propose_attestation');
  });

  it('allowedActions returns valid next steps from each state', () => {
    expect(allowedActions('attestation_proposed')).toContain('define_scope');
    expect(allowedActions('attestation_proposed')).toContain('reject');
    expect(allowedActions('variance_computed')).toContain('classify_break');
    expect(allowedActions('variance_computed')).toContain('suspend');
    expect(allowedActions('variance_computed')).toContain('escalate_to_audit_committee');
    expect(allowedActions('attestation_signed')).toContain('archive');
    expect(allowedActions('attestation_signed')).toContain('restate');
  });
});

describe('W120 - tier derivation + FLOOR-AT-QUARTERLY', () => {
  it('tierForCadence maps cadence to tier', () => {
    expect(tierForCadence('daily_tactical')).toBe('daily_tactical');
    expect(tierForCadence('weekly_management')).toBe('weekly_management');
    expect(tierForCadence('monthly_management')).toBe('monthly_management');
    expect(tierForCadence('quarterly_attestation')).toBe('quarterly_attestation');
    expect(tierForCadence('annual_audit')).toBe('annual_audit');
    expect(tierForCadence(null)).toBe('monthly_management');
    expect(tierForCadence('garbage')).toBe('monthly_management');
  });

  it('countFloorFlags counts each of the 5 flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ material_variance_unresolved: true })).toBe(1);
    expect(countFloorFlags({ external_auditor_request_active: true, regulator_audit_in_progress: true })).toBe(2);
    expect(countFloorFlags({
      material_variance_unresolved: true,
      external_auditor_request_active: true,
      regulator_audit_in_progress: true,
      cross_border_feed_break: true,
      icfr_deficiency_suspected: true,
    })).toBe(5);
  });

  it('floorAtQuarterly fires on each individual flag', () => {
    expect(floorAtQuarterly({ material_variance_unresolved: true })).toBe(true);
    expect(floorAtQuarterly({ external_auditor_request_active: true })).toBe(true);
    expect(floorAtQuarterly({ regulator_audit_in_progress: true })).toBe(true);
    expect(floorAtQuarterly({ cross_border_feed_break: true })).toBe(true);
    expect(floorAtQuarterly({ icfr_deficiency_suspected: true })).toBe(true);
    expect(floorAtQuarterly({})).toBe(false);
  });

  it('floorAtAnnual fires on 2+ flags', () => {
    expect(floorAtAnnual({ material_variance_unresolved: true })).toBe(false);
    expect(floorAtAnnual({ material_variance_unresolved: true, icfr_deficiency_suspected: true })).toBe(true);
    expect(floorAtAnnual({ external_auditor_request_active: true, regulator_audit_in_progress: true, cross_border_feed_break: true })).toBe(true);
  });

  it('effectiveTier lifts daily/weekly/monthly to quarterly when 1 flag', () => {
    expect(effectiveTier('daily_tactical', { material_variance_unresolved: true })).toBe('quarterly_attestation');
    expect(effectiveTier('weekly_management', { regulator_audit_in_progress: true })).toBe('quarterly_attestation');
    expect(effectiveTier('monthly_management', { cross_border_feed_break: true })).toBe('quarterly_attestation');
  });

  it('effectiveTier preserves quarterly + annual when 1 flag', () => {
    expect(effectiveTier('quarterly_attestation', { material_variance_unresolved: true })).toBe('quarterly_attestation');
    expect(effectiveTier('annual_audit', { material_variance_unresolved: true })).toBe('annual_audit');
  });

  it('effectiveTier lifts to annual_audit when 2+ flags', () => {
    expect(effectiveTier('daily_tactical', { material_variance_unresolved: true, icfr_deficiency_suspected: true })).toBe('annual_audit');
    expect(effectiveTier('weekly_management', { external_auditor_request_active: true, cross_border_feed_break: true })).toBe('annual_audit');
    expect(effectiveTier('monthly_management', { material_variance_unresolved: true, icfr_deficiency_suspected: true, regulator_audit_in_progress: true })).toBe('annual_audit');
  });

  it('effectiveTier passes through when no flags', () => {
    expect(effectiveTier('daily_tactical', {})).toBe('daily_tactical');
    expect(effectiveTier('monthly_management', {})).toBe('monthly_management');
    expect(effectiveTier('annual_audit', {})).toBe('annual_audit');
  });
});

describe('W120 - INVERTED SLA matrix', () => {
  it('attestation_proposed anchor: 24/96/168/360/720h INVERTED polarity', () => {
    expect(SLA_HOURS.attestation_proposed.daily_tactical).toBe(24);
    expect(SLA_HOURS.attestation_proposed.weekly_management).toBe(96);
    expect(SLA_HOURS.attestation_proposed.monthly_management).toBe(168);
    expect(SLA_HOURS.attestation_proposed.quarterly_attestation).toBe(360);
    expect(SLA_HOURS.attestation_proposed.annual_audit).toBe(720);
  });

  it('SLA is INVERTED: annual_audit window is LONGEST for every active status', () => {
    const activeStates = [
      'attestation_proposed', 'scope_defined', 'feeds_ingested', 'blocks_paired',
      'variance_computed', 'break_classified', 'root_cause_logged',
      'remediation_proposed', 'counter_party_signoff', 'independent_review',
      'attestation_signed', 'suspended', 'restated', 'escalated_to_audit_committee',
    ] as const;
    for (const s of activeStates) {
      const row = SLA_HOURS[s];
      expect(row.annual_audit).toBeGreaterThanOrEqual(row.quarterly_attestation);
      expect(row.quarterly_attestation).toBeGreaterThanOrEqual(row.monthly_management);
      expect(row.monthly_management).toBeGreaterThanOrEqual(row.weekly_management);
      expect(row.weekly_management).toBeGreaterThanOrEqual(row.daily_tactical);
    }
  });

  it('terminal states have zero SLA across all tiers', () => {
    for (const t of ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit'] as const) {
      expect(slaWindowHours('archived', t)).toBe(0);
      expect(slaWindowHours('rejected', t)).toBe(0);
    }
  });

  it('slaDeadlineFor returns null for zero SLA and a future date otherwise', () => {
    const start = new Date('2026-05-31T00:00:00Z');
    expect(slaDeadlineFor('archived', 'annual_audit', start)).toBeNull();
    const d = slaDeadlineFor('attestation_proposed', 'monthly_management', start);
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-06-07T00:00:00.000Z'); // +168h
  });

  it('slaHoursRemaining computes correctly', () => {
    const start = new Date('2026-05-31T00:00:00Z');
    const now = new Date('2026-05-31T12:00:00Z');
    // 24h window, 12h elapsed = 12h left.
    expect(slaHoursRemaining('attestation_proposed', 'daily_tactical', start, now)).toBe(12);
  });
});

describe('W120 SIGNATURE crossings - ICFR-DEFICIENCY-ATTEST hard line', () => {
  it('escalate_to_audit_committee crosses EVERY tier - SIGNATURE LINE', () => {
    for (const t of ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit'] as const) {
      expect(crossesIntoRegulator('escalate_to_audit_committee', t, {})).toBe(true);
      expect(crossesIntoRegulator('escalate_to_audit_committee', t, { flags: { material_variance_unresolved: true } })).toBe(true);
    }
  });

  it('reject crosses EVERY tier when material_variance_unresolved AND icfr_deficiency_suspected', () => {
    const both = { flags: { material_variance_unresolved: true, icfr_deficiency_suspected: true } };
    for (const t of ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit'] as const) {
      expect(crossesIntoRegulator('reject', t, both)).toBe(true);
    }
  });

  it('reject does NOT cross when only one flag set', () => {
    expect(crossesIntoRegulator('reject', 'monthly_management', { flags: { material_variance_unresolved: true } })).toBe(false);
    expect(crossesIntoRegulator('reject', 'monthly_management', { flags: { icfr_deficiency_suspected: true } })).toBe(false);
    expect(crossesIntoRegulator('reject', 'daily_tactical', {})).toBe(false);
  });

  it('restate crosses quarterly_attestation + annual_audit only', () => {
    expect(crossesIntoRegulator('restate', 'daily_tactical', {})).toBe(false);
    expect(crossesIntoRegulator('restate', 'weekly_management', {})).toBe(false);
    expect(crossesIntoRegulator('restate', 'monthly_management', {})).toBe(false);
    expect(crossesIntoRegulator('restate', 'quarterly_attestation', {})).toBe(true);
    expect(crossesIntoRegulator('restate', 'annual_audit', {})).toBe(true);
  });

  it('sign_attestation NEVER crosses (normal completion)', () => {
    for (const t of ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit'] as const) {
      expect(crossesIntoRegulator('sign_attestation', t, {})).toBe(false);
      expect(crossesIntoRegulator('sign_attestation', t, { flags: { material_variance_unresolved: true, icfr_deficiency_suspected: true } })).toBe(false);
    }
  });

  it('archive never crosses', () => {
    for (const t of ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit'] as const) {
      expect(crossesIntoRegulator('archive', t, {})).toBe(false);
    }
  });

  it('suspend crosses when regulator_audit_in_progress', () => {
    expect(crossesIntoRegulator('suspend', 'monthly_management', { flags: { regulator_audit_in_progress: true } })).toBe(true);
    expect(crossesIntoRegulator('suspend', 'monthly_management', { flags: {} })).toBe(false);
  });

  it('sla_breached crosses on quarterly_attestation + annual_audit only', () => {
    expect(slaBreachCrossesIntoRegulator('daily_tactical')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('weekly_management')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('monthly_management')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('quarterly_attestation')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('annual_audit')).toBe(true);
  });

  it('heavy + reportable tier helpers', () => {
    expect(isHeavyTier('annual_audit')).toBe(true);
    expect(isHeavyTier('quarterly_attestation')).toBe(true);
    expect(isHeavyTier('monthly_management')).toBe(false);
    expect(isReportable('quarterly_attestation')).toBe(true);
    expect(isReportable('annual_audit')).toBe(true);
    expect(isReportable('weekly_management')).toBe(false);
  });
});

describe('W120 - party routing (4-step authority)', () => {
  it('reconciler owns scope + ingest + pair + variance + classify + root_cause + remediation', () => {
    expect(partyForAction('propose_attestation')).toBe('reconciler');
    expect(partyForAction('define_scope')).toBe('reconciler');
    expect(partyForAction('ingest_feeds')).toBe('reconciler');
    expect(partyForAction('pair_blocks')).toBe('reconciler');
    expect(partyForAction('compute_variance')).toBe('reconciler');
    expect(partyForAction('classify_break')).toBe('reconciler');
    expect(partyForAction('log_root_cause')).toBe('reconciler');
    expect(partyForAction('propose_remediation')).toBe('reconciler');
  });

  it('controller owns counterparty signoff + independent review + suspend/resume', () => {
    expect(partyForAction('get_counter_party_signoff')).toBe('controller');
    expect(partyForAction('run_independent_review')).toBe('controller');
    expect(partyForAction('suspend')).toBe('controller');
    expect(partyForAction('resume_from_suspend')).toBe('controller');
  });

  it('CFO owns sign + archive + reject + restate', () => {
    expect(partyForAction('sign_attestation')).toBe('CFO');
    expect(partyForAction('archive')).toBe('CFO');
    expect(partyForAction('reject')).toBe('CFO');
    expect(partyForAction('restate')).toBe('CFO');
  });

  it('audit_committee_chair owns escalation + lift', () => {
    expect(partyForAction('escalate_to_audit_committee')).toBe('audit_committee_chair');
    expect(partyForAction('lift_escalation')).toBe('audit_committee_chair');
  });

  it('authorityRequired ladder by tier', () => {
    expect(authorityRequired('daily_tactical')).toBe('reconciler');
    expect(authorityRequired('weekly_management')).toBe('controller');
    expect(authorityRequired('monthly_management')).toBe('CFO');
    expect(authorityRequired('quarterly_attestation')).toBe('CFO');
    expect(authorityRequired('annual_audit')).toBe('audit_committee_chair');
  });

  it('attestation window hours INVERTED', () => {
    expect(attestationWindowHours('daily_tactical')).toBe(24);
    expect(attestationWindowHours('weekly_management')).toBe(96);
    expect(attestationWindowHours('monthly_management')).toBe(168);
    expect(attestationWindowHours('quarterly_attestation')).toBe(360);
    expect(attestationWindowHours('annual_audit')).toBe(720);
  });
});

describe('W120 - event types', () => {
  it('eventTypeFor maps every action to a reconciliation_attestation_* event', () => {
    expect(eventTypeFor('propose_attestation')).toBe('reconciliation_attestation_proposed');
    expect(eventTypeFor('define_scope')).toBe('reconciliation_attestation_scope_defined');
    expect(eventTypeFor('ingest_feeds')).toBe('reconciliation_attestation_feeds_ingested');
    expect(eventTypeFor('pair_blocks')).toBe('reconciliation_attestation_blocks_paired');
    expect(eventTypeFor('compute_variance')).toBe('reconciliation_attestation_variance_computed');
    expect(eventTypeFor('classify_break')).toBe('reconciliation_attestation_break_classified');
    expect(eventTypeFor('log_root_cause')).toBe('reconciliation_attestation_root_cause_logged');
    expect(eventTypeFor('propose_remediation')).toBe('reconciliation_attestation_remediation_proposed');
    expect(eventTypeFor('get_counter_party_signoff')).toBe('reconciliation_attestation_counter_party_signoff');
    expect(eventTypeFor('run_independent_review')).toBe('reconciliation_attestation_independent_review');
    expect(eventTypeFor('sign_attestation')).toBe('reconciliation_attestation_signed');
    expect(eventTypeFor('archive')).toBe('reconciliation_attestation_archived');
    expect(eventTypeFor('reject')).toBe('reconciliation_attestation_rejected');
    expect(eventTypeFor('suspend')).toBe('reconciliation_attestation_suspended');
    expect(eventTypeFor('resume_from_suspend')).toBe('reconciliation_attestation_resumed');
    expect(eventTypeFor('restate')).toBe('reconciliation_attestation_restated');
    expect(eventTypeFor('escalate_to_audit_committee')).toBe('reconciliation_attestation_escalated_to_audit_committee');
    expect(eventTypeFor('lift_escalation')).toBe('reconciliation_attestation_lift_escalation');
  });
});

describe('W120 - urgency band (INVERTED polarity)', () => {
  it('negative hours always critical', () => {
    for (const t of ['daily_tactical', 'weekly_management', 'monthly_management', 'quarterly_attestation', 'annual_audit'] as const) {
      expect(urgencyBand(t, -1)).toBe('critical');
    }
  });

  it('annual_audit loosest thresholds (240/96/24)', () => {
    expect(urgencyBand('annual_audit', 250)).toBe('low');
    expect(urgencyBand('annual_audit', 100)).toBe('medium');
    expect(urgencyBand('annual_audit', 50)).toBe('high');
    expect(urgencyBand('annual_audit', 12)).toBe('critical');
  });

  it('quarterly_attestation 168/72/18', () => {
    expect(urgencyBand('quarterly_attestation', 200)).toBe('low');
    expect(urgencyBand('quarterly_attestation', 100)).toBe('medium');
    expect(urgencyBand('quarterly_attestation', 36)).toBe('high');
    expect(urgencyBand('quarterly_attestation', 10)).toBe('critical');
  });

  it('monthly_management 96/48/12', () => {
    expect(urgencyBand('monthly_management', 100)).toBe('low');
    expect(urgencyBand('monthly_management', 60)).toBe('medium');
    expect(urgencyBand('monthly_management', 24)).toBe('high');
    expect(urgencyBand('monthly_management', 5)).toBe('critical');
  });

  it('weekly_management 48/24/8', () => {
    expect(urgencyBand('weekly_management', 100)).toBe('low');
    expect(urgencyBand('weekly_management', 30)).toBe('medium');
    expect(urgencyBand('weekly_management', 12)).toBe('high');
    expect(urgencyBand('weekly_management', 4)).toBe('critical');
  });

  it('daily_tactical TIGHTEST 12/6/2', () => {
    expect(urgencyBand('daily_tactical', 20)).toBe('low');
    expect(urgencyBand('daily_tactical', 8)).toBe('medium');
    expect(urgencyBand('daily_tactical', 3)).toBe('high');
    expect(urgencyBand('daily_tactical', 1)).toBe('critical');
  });
});

describe('W120 - 7-bridge architecture (W113-W119; W118 + W119 MANDATORY)', () => {
  it('every bridge fires on truthy ref', () => {
    expect(bridgesToW113EvmChain('evm-001')).toBe(true);
    expect(bridgesToW114DocControlChain('doc-001')).toBe(true);
    expect(bridgesToW115SubmittalChain('sub-001')).toBe(true);
    expect(bridgesToW116RfiChain('rfi-001')).toBe(true);
    expect(bridgesToW117ChangeOrderChain('co-001')).toBe(true);
    expect(bridgesToW118AuditChain('acb-016')).toBe(true);
    expect(bridgesToW119RegulatorExportChain('rep-016')).toBe(true);
  });

  it('every bridge returns false on null/empty ref', () => {
    expect(bridgesToW113EvmChain(null)).toBe(false);
    expect(bridgesToW114DocControlChain(undefined)).toBe(false);
    expect(bridgesToW115SubmittalChain('')).toBe(false);
    expect(bridgesToW116RfiChain(null)).toBe(false);
    expect(bridgesToW117ChangeOrderChain('')).toBe(false);
    expect(bridgesToW118AuditChain(null)).toBe(false);
    expect(bridgesToW119RegulatorExportChain(undefined)).toBe(false);
  });
});

describe('W120 - reconciliationCompletenessIndex 0-130', () => {
  it('empty returns 0', () => {
    expect(reconciliationCompletenessIndex({})).toBe(0);
  });

  it('caps at 130', () => {
    const score = reconciliationCompletenessIndex({
      attestation_proposed: 1,
      scope_defined: 1,
      feeds_ingested: 1,
      blocks_paired: 1,
      variance_computed: 1,
      break_classified: 1,
      root_cause_logged: 1,
      remediation_proposed: 1,
      counter_party_signoff: 1,
      independent_review: 1,
      attestation_signed: 1,
      archived: 1,
      clean_close_bonus: 1,
    });
    expect(score).toBe(130);
  });

  it('signed without close bonus scores high but below cap', () => {
    const score = reconciliationCompletenessIndex({
      attestation_proposed: 1,
      scope_defined: 1,
      feeds_ingested: 1,
      blocks_paired: 1,
      variance_computed: 1,
      break_classified: 1,
      independent_review: 1,
      attestation_signed: 1,
    });
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThan(130);
  });
});

describe('W120 - icfrControlEffectivenessIndex 0-130', () => {
  it('empty returns 0', () => {
    expect(icfrControlEffectivenessIndex({})).toBe(0);
  });

  it('caps at 130 with full controls', () => {
    const score = icfrControlEffectivenessIndex({
      coso_components_tested: 5,
      tsc_categories_tested: 5,
      feeds_paired_pct: 100,
      variance_explained_pct: 100,
      break_classified_pct: 100,
      remediation_closed_pct: 100,
      counter_party_signed_off: 1,
      independent_review_passed: 1,
      cfo_attestation_signed: 1,
      audit_committee_briefed: 1,
    });
    // 20 + 20 + 15 + 15 + 10 + 10 + 8 + 10 + 10 + 5 = 123 - high, near cap.
    expect(score).toBeGreaterThanOrEqual(120);
    expect(score).toBeLessThanOrEqual(130);
  });

  it('deducts for icfr_deficiency_suspected', () => {
    const a = icfrControlEffectivenessIndex({ coso_components_tested: 5, tsc_categories_tested: 5 });
    const b = icfrControlEffectivenessIndex({ coso_components_tested: 5, tsc_categories_tested: 5, icfr_deficiency_suspected: 1 });
    expect(b).toBeLessThan(a);
  });

  it('deducts heavier for material_weakness_open', () => {
    const a = icfrControlEffectivenessIndex({ coso_components_tested: 5, tsc_categories_tested: 5 });
    const b = icfrControlEffectivenessIndex({ coso_components_tested: 5, tsc_categories_tested: 5, material_weakness_open: 1 });
    expect(b).toBeLessThan(a);
    expect(a - b).toBeGreaterThanOrEqual(20);
  });

  it('clamps coso + tsc counts to 5', () => {
    const a = icfrControlEffectivenessIndex({ coso_components_tested: 5 });
    const b = icfrControlEffectivenessIndex({ coso_components_tested: 99 });
    expect(b).toBe(a);
  });

  it('never goes negative', () => {
    const score = icfrControlEffectivenessIndex({
      icfr_deficiency_suspected: 1,
      material_weakness_open: 1,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe('W120 - varianceScoreIndex 0-130', () => {
  it('zero materiality returns 0 (unmeasurable)', () => {
    expect(varianceScoreIndex({ materiality_threshold_zar: 0 })).toBe(0);
  });

  it('zero variance + materiality set = full marks', () => {
    const score = varianceScoreIndex({
      total_variance_zar: 0,
      materiality_threshold_zar: 1000000,
      net_variance_explained_zar: 0,
      unresolved_variance_zar: 0,
    });
    expect(score).toBe(130);
  });

  it('large unresolved variance crushes score', () => {
    const score = varianceScoreIndex({
      total_variance_zar: 5000000,
      materiality_threshold_zar: 1000000,
      net_variance_explained_zar: 0,
      unresolved_variance_zar: 5000000,
    });
    expect(score).toBeLessThan(40);
  });

  it('explained variance recovers some score', () => {
    const unresolvedHeavy = varianceScoreIndex({
      total_variance_zar: 2000000,
      materiality_threshold_zar: 1000000,
      net_variance_explained_zar: 0,
      unresolved_variance_zar: 2000000,
    });
    const mostlyExplained = varianceScoreIndex({
      total_variance_zar: 2000000,
      materiality_threshold_zar: 1000000,
      net_variance_explained_zar: 1900000,
      unresolved_variance_zar: 100000,
    });
    expect(mostlyExplained).toBeGreaterThan(unresolvedHeavy);
  });
});

describe('W120 - remediationProgressIndex 0-130', () => {
  it('empty returns 0', () => {
    expect(remediationProgressIndex({})).toBe(0);
  });

  it('caps at 130 with full plan + 100% progress', () => {
    const score = remediationProgressIndex({
      root_cause_logged: 1,
      action_plan_drafted: 1,
      owner_assigned: 1,
      target_date_set: 1,
      evidence_attached: 1,
      controller_reviewed: 1,
      cfo_signed_off: 1,
      audit_committee_briefed: 1,
      remediation_closed: 1,
      followup_test_passed: 1,
      remediation_progress_pct: 100,
    });
    expect(score).toBe(130);
  });

  it('partial progress yields proportional score', () => {
    const half = remediationProgressIndex({
      root_cause_logged: 1,
      action_plan_drafted: 1,
      owner_assigned: 1,
      remediation_progress_pct: 50,
    });
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(80);
  });
});

describe('W120 - external-auditor signed-JWT validation', () => {
  it('isValidExternalAuditorJwtFormat accepts well-formed 3-segment base64url', () => {
    expect(isValidExternalAuditorJwtFormat('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwd2MifQ.signature_here')).toBe(true);
  });

  it('rejects malformed JWTs', () => {
    expect(isValidExternalAuditorJwtFormat(null)).toBe(false);
    expect(isValidExternalAuditorJwtFormat('')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('only.two')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('a..b')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('with spaces.invalid.token')).toBe(false);
  });

  it('parseExternalAuditorClaims accepts valid claims', () => {
    const json = JSON.stringify({
      sub: 'pwc-sa',
      aud: 'external_auditor',
      scope: ['ratt-016'],
      iat: 1700000000,
      exp: 1800000000,
      audit_firm: 'PwC South Africa',
      engagement_ref: 'PWC-2026-ICFR-0001',
    });
    const parsed = parseExternalAuditorClaims(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.sub).toBe('pwc-sa');
    expect(parsed!.aud).toBe('external_auditor');
    expect(parsed!.scope).toEqual(['ratt-016']);
  });

  it('parseExternalAuditorClaims rejects invalid claims', () => {
    expect(parseExternalAuditorClaims(null)).toBeNull();
    expect(parseExternalAuditorClaims('not-json')).toBeNull();
    expect(parseExternalAuditorClaims(JSON.stringify({ sub: 'x', aud: 'wrong_aud', scope: [], iat: 0, exp: 0 }))).toBeNull();
    expect(parseExternalAuditorClaims(JSON.stringify({ sub: '', aud: 'external_auditor', scope: [], iat: 0, exp: 0 }))).toBeNull();
    expect(parseExternalAuditorClaims(JSON.stringify({ aud: 'external_auditor', scope: [], iat: 0, exp: 0 }))).toBeNull();
  });

  it('isExternalAuditorClaimsExpired detects expiry', () => {
    const claims = { sub: 's', aud: 'external_auditor' as const, scope: ['*'], iat: 1700000000, exp: 1700000010 };
    expect(isExternalAuditorClaimsExpired(claims, new Date(1700000005 * 1000))).toBe(false);
    expect(isExternalAuditorClaimsExpired(claims, new Date(1700000020 * 1000))).toBe(true);
  });

  it('externalAuditorCanReadAttestation enforces scope + expiry', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 86400;
    const claimsScoped = { sub: 's', aud: 'external_auditor' as const, scope: ['ratt-016'], iat: 0, exp: futureExp };
    const claimsWildcard = { sub: 's', aud: 'external_auditor' as const, scope: ['*'], iat: 0, exp: futureExp };
    const now = new Date();
    expect(externalAuditorCanReadAttestation(claimsScoped, 'ratt-016', now)).toBe(true);
    expect(externalAuditorCanReadAttestation(claimsScoped, 'ratt-001', now)).toBe(false);
    expect(externalAuditorCanReadAttestation(claimsWildcard, 'ratt-001', now)).toBe(true);
    // expired
    const expiredClaims = { ...claimsScoped, exp: 1000 };
    expect(externalAuditorCanReadAttestation(expiredClaims, 'ratt-016', now)).toBe(false);
  });
});

describe('W120 - feed source / break / root cause taxonomies', () => {
  it('FEED_SOURCES includes platform-wide + external + W118', () => {
    expect(FEED_SOURCES).toContain('sap_s4hana');
    expect(FEED_SOURCES).toContain('oracle_financials');
    expect(FEED_SOURCES).toContain('sage_300');
    expect(FEED_SOURCES).toContain('workday');
    expect(FEED_SOURCES).toContain('strate');
    expect(FEED_SOURCES).toContain('swift_mt940');
    expect(FEED_SOURCES).toContain('nersa_inbox');
    expect(FEED_SOURCES).toContain('ippo_inbox');
    expect(FEED_SOURCES).toContain('dmre_inbox');
    expect(FEED_SOURCES).toContain('bank_statement');
    expect(FEED_SOURCES).toContain('w118_audit_chain');
    expect(isKnownFeedSource('sap_s4hana')).toBe(true);
    expect(isKnownFeedSource('garbage')).toBe(false);
    expect(isKnownFeedSource(null)).toBe(false);
  });

  it('BREAK_CLASSIFICATIONS covers single + composite forms', () => {
    expect(BREAK_CLASSIFICATIONS).toContain('timing');
    expect(BREAK_CLASSIFICATIONS).toContain('quantum');
    expect(BREAK_CLASSIFICATIONS).toContain('missing');
    expect(BREAK_CLASSIFICATIONS).toContain('timing+quantum+missing');
    expect(isKnownBreakClassification('timing')).toBe(true);
    expect(isKnownBreakClassification('timing+quantum+missing')).toBe(true);
    expect(isKnownBreakClassification('foo')).toBe(false);
    expect(isKnownBreakClassification(null)).toBe(false);
  });

  it('ROOT_CAUSE_TAXONOMIES covers control + process + external + composites', () => {
    expect(ROOT_CAUSE_TAXONOMIES).toContain('control');
    expect(ROOT_CAUSE_TAXONOMIES).toContain('external');
    expect(ROOT_CAUSE_TAXONOMIES).toContain('control+external');
    expect(isKnownRootCauseTaxonomy('control')).toBe(true);
    expect(isKnownRootCauseTaxonomy('control+external')).toBe(true);
    expect(isKnownRootCauseTaxonomy('garbage')).toBe(false);
  });
});

describe('W120 - daysToQuarterlyAttestation', () => {
  it('returns positive days for a mid-quarter date', () => {
    const days = daysToQuarterlyAttestation(new Date('2026-02-15T00:00:00Z'));
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(95);
  });
});

describe('W120 - attestationHealthBand composite', () => {
  it('rejected always critical', () => {
    expect(attestationHealthBand('rejected', 100, 100, 100, 100, false, true, false, {})).toBe('critical');
  });

  it('escalated always critical', () => {
    expect(attestationHealthBand('escalated_to_audit_committee', 100, 100, 100, 100, false, false, true, {})).toBe('critical');
  });

  it('material variance unresolved + icfr deficiency suspected -> critical', () => {
    expect(attestationHealthBand('remediation_proposed', 80, 80, 80, 80, false, false, false, {
      material_variance_unresolved: true,
      icfr_deficiency_suspected: true,
    })).toBe('critical');
  });

  it('archived green', () => {
    expect(attestationHealthBand('archived', 100, 100, 100, 100, false, false, false, {})).toBe('green');
  });

  it('SLA breached -> red', () => {
    expect(attestationHealthBand('variance_computed', 100, 100, 100, 100, true, false, false, {})).toBe('red');
  });

  it('low ICFR effectiveness -> red', () => {
    expect(attestationHealthBand('variance_computed', 100, 50, 100, 100, false, false, false, {})).toBe('red');
  });

  it('low variance score -> red', () => {
    expect(attestationHealthBand('variance_computed', 100, 100, 30, 100, false, false, false, {})).toBe('red');
  });

  it('suspended amber', () => {
    expect(attestationHealthBand('suspended', 80, 100, 100, 100, false, false, false, {})).toBe('amber');
  });

  it('restated amber', () => {
    expect(attestationHealthBand('restated', 80, 100, 100, 100, false, false, false, {})).toBe('amber');
  });

  it('clean signed-in-flight green', () => {
    expect(attestationHealthBand('attestation_signed', 110, 110, 110, 110, false, false, false, {})).toBe('green');
  });
});
