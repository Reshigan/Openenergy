// Wave 121 - Control-Environment Audit spec battery.
//
// Covers: state machine (forward path control_defined -> archived +
// 4 branches + terminals + suspend->assess_deficiency resume +
// initiate_re_test from failed-ToD/ToOE/deficiency/remediation +
// flag_deficient from any non-terminal + 16-action TRANSITIONS map
// coverage), tier derivation from control_classification +
// FLOOR-AT-DIRECTIVE on each of 5 flags + FLOOR-AT-GOVERNANCE on 2+
// flags, INVERTED SLA matrix anchored on control_defined
// (168/240/360/480/720h), SIGNATURE MATERIAL-WEAKNESS-DEFICIENT
// crossings (flag_deficient EVERY tier WHEN material_weakness_suspected;
// accept_with_exception directive+governance only; archive EVERY tier
// WHEN external_auditor_sign_off; complete_remediation never crosses;
// sla_breached HEAVY tiers only), party routing (4-party split:
// control_owner/process_owner/CISO/audit_committee_chair), authority
// ladder, audit window (INVERTED polarity), urgency band (INVERTED -
// governance loosest), 8-bridge architecture
// (W113/W114/W115/W116/W117/W118/W119/W120; W118 mandatory), design
// documentation completeness 0-130, ToD test completeness 0-130, ToOE
// test completeness 0-130, evidence coverage 0-130, external-auditor
// signed-JWT validation, control framework / classification /
// deficiency-severity taxonomy validation, control health band
// composite.

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
  tierForClassification,
  countFloorFlags,
  floorAtDirective,
  floorAtGovernance,
  effectiveTier,
  isHeavyTier,
  isReportable,
  crossesIntoRegulator,
  slaBreachCrossesIntoRegulator,
  partyForAction,
  eventTypeFor,
  urgencyBand,
  authorityRequired,
  auditWindowHours,
  daysToQuarterlyCutoff,
  daysToAnnualAudit,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  bridgesToW118AuditChain,
  bridgesToW119RegulatorExportChain,
  bridgesToW120ReconciliationAttestationChain,
  designDocumentationCompletenessIndex,
  todTestCompletenessIndex,
  tooeTestCompletenessIndex,
  evidenceCoverageIndex,
  isValidExternalAuditorJwtFormat,
  parseExternalAuditorClaims,
  isExternalAuditorClaimsExpired,
  externalAuditorCanReadControl,
  isKnownControlFramework,
  CONTROL_FRAMEWORKS,
  isKnownControlClassification,
  CONTROL_CLASSIFICATIONS,
  isKnownDeficiencySeverity,
  DEFICIENCY_SEVERITIES,
  controlHealthBand,
} from '../src/utils/control-environment-audit-spec';

describe('W121 Control-Environment Audit - state machine', () => {
  it('walks the forward path control_defined -> archived', () => {
    expect(nextStatus('control_defined', 'document_design')).toBe('design_documented');
    expect(nextStatus('design_documented', 'complete_walkthrough')).toBe('walkthrough_completed');
    expect(nextStatus('walkthrough_completed', 'plan_tod_test')).toBe('tod_test_planned');
    expect(nextStatus('tod_test_planned', 'collect_tod_evidence')).toBe('tod_evidence_collected');
    expect(nextStatus('tod_evidence_collected', 'execute_tod_test')).toBe('tod_test_executed');
    expect(nextStatus('tod_test_executed', 'plan_tooe_test')).toBe('tooe_test_planned');
    expect(nextStatus('tooe_test_planned', 'collect_tooe_evidence')).toBe('tooe_evidence_collected');
    expect(nextStatus('tooe_evidence_collected', 'execute_tooe_test')).toBe('tooe_test_executed');
    expect(nextStatus('tooe_test_executed', 'assess_deficiency')).toBe('deficiency_assessed');
    expect(nextStatus('deficiency_assessed', 'complete_remediation')).toBe('remediation_completed');
    expect(nextStatus('remediation_completed', 'archive')).toBe('archived');
  });

  it('blocks invalid forward jumps', () => {
    expect(nextStatus('control_defined', 'complete_walkthrough')).toBeNull();
    expect(nextStatus('design_documented', 'plan_tod_test')).toBeNull();
    expect(nextStatus('walkthrough_completed', 'collect_tod_evidence')).toBeNull();
    expect(nextStatus('tod_test_planned', 'execute_tod_test')).toBeNull();
    expect(nextStatus('tooe_test_planned', 'execute_tooe_test')).toBeNull();
    expect(nextStatus('tooe_evidence_collected', 'assess_deficiency')).toBeNull();
    expect(nextStatus('deficiency_assessed', 'archive')).toBeNull();
  });

  it('treats archived as hard terminal (no further transitions)', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
    expect(nextStatus('archived', 'flag_deficient')).toBeNull();
    expect(nextStatus('archived', 'accept_with_exception')).toBeNull();
    expect(nextStatus('archived', 'initiate_re_test')).toBeNull();
    expect(nextStatus('archived', 'suspend')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
  });

  it('treats deficient as UI terminal but not hard terminal', () => {
    expect(isTerminal('deficient')).toBe(true);
    expect(isHardTerminal('deficient')).toBe(false);
  });

  it('flag_deficient transitions from any non-terminal', () => {
    expect(nextStatus('control_defined', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('design_documented', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('walkthrough_completed', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('tod_test_executed', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('tooe_test_executed', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('deficiency_assessed', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('remediation_completed', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('excepted', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('suspended', 'flag_deficient')).toBe('deficient');
    expect(nextStatus('remediated_re_test', 'flag_deficient')).toBe('deficient');
  });

  it('accept_with_exception transitions from any pre-archive state', () => {
    expect(nextStatus('design_documented', 'accept_with_exception')).toBe('excepted');
    expect(nextStatus('walkthrough_completed', 'accept_with_exception')).toBe('excepted');
    expect(nextStatus('tod_test_executed', 'accept_with_exception')).toBe('excepted');
    expect(nextStatus('tooe_test_executed', 'accept_with_exception')).toBe('excepted');
    expect(nextStatus('deficiency_assessed', 'accept_with_exception')).toBe('excepted');
    expect(nextStatus('remediation_completed', 'accept_with_exception')).toBe('excepted');
  });

  it('suspend transitions from any active state', () => {
    expect(nextStatus('design_documented', 'suspend')).toBe('suspended');
    expect(nextStatus('walkthrough_completed', 'suspend')).toBe('suspended');
    expect(nextStatus('tod_test_planned', 'suspend')).toBe('suspended');
    expect(nextStatus('tod_evidence_collected', 'suspend')).toBe('suspended');
    expect(nextStatus('tooe_test_executed', 'suspend')).toBe('suspended');
    expect(nextStatus('deficiency_assessed', 'suspend')).toBe('suspended');
    expect(nextStatus('remediation_completed', 'suspend')).toBe('suspended');
  });

  it('suspended resumes to deficiency_assessed via assess_deficiency', () => {
    expect(nextStatus('suspended', 'assess_deficiency')).toBe('deficiency_assessed');
  });

  it('initiate_re_test transitions from ToD/ToOE/deficiency/remediation', () => {
    expect(nextStatus('tod_test_executed', 'initiate_re_test')).toBe('remediated_re_test');
    expect(nextStatus('tooe_test_executed', 'initiate_re_test')).toBe('remediated_re_test');
    expect(nextStatus('deficiency_assessed', 'initiate_re_test')).toBe('remediated_re_test');
    expect(nextStatus('remediation_completed', 'initiate_re_test')).toBe('remediated_re_test');
    expect(nextStatus('remediated_re_test', 'initiate_re_test')).toBe('remediated_re_test');
  });

  it('remediated_re_test routes back to plan_tooe_test', () => {
    expect(nextStatus('remediated_re_test', 'plan_tooe_test')).toBe('tooe_test_planned');
  });

  it('archive only from remediation_completed', () => {
    expect(nextStatus('remediation_completed', 'archive')).toBe('archived');
    expect(nextStatus('tooe_test_executed', 'archive')).toBeNull();
    expect(nextStatus('deficiency_assessed', 'archive')).toBeNull();
    expect(nextStatus('excepted', 'archive')).toBeNull();
  });

  it('define_control is create-only - rejected outside control_defined seed', () => {
    expect(nextStatus('control_defined', 'define_control')).toBe('control_defined');
    expect(nextStatus('design_documented', 'define_control')).toBeNull();
    expect(nextStatus('walkthrough_completed', 'define_control')).toBeNull();
  });

  it('TRANSITIONS map covers all 16 actions', () => {
    expect(Object.keys(TRANSITIONS).length).toBe(16);
    const actions = [
      'define_control', 'document_design', 'complete_walkthrough',
      'plan_tod_test', 'collect_tod_evidence', 'execute_tod_test',
      'plan_tooe_test', 'collect_tooe_evidence', 'execute_tooe_test',
      'assess_deficiency', 'complete_remediation', 'archive',
      'flag_deficient', 'accept_with_exception', 'suspend',
      'initiate_re_test',
    ];
    for (const a of actions) {
      expect(TRANSITIONS).toHaveProperty(a);
    }
  });

  it('allowedActions excludes define_control (create-only)', () => {
    const acts = allowedActions('design_documented');
    expect(acts).not.toContain('define_control');
  });
});

describe('W121 tier derivation + FLOOR-AT-DIRECTIVE', () => {
  it('derives tier from control_classification', () => {
    expect(tierForClassification('preventive')).toBe('preventive');
    expect(tierForClassification('detective')).toBe('detective');
    expect(tierForClassification('corrective')).toBe('corrective');
    expect(tierForClassification('directive')).toBe('directive');
    expect(tierForClassification('governance')).toBe('governance');
  });

  it('falls back to detective for unknown classification', () => {
    expect(tierForClassification('unknown')).toBe('detective');
    expect(tierForClassification(null)).toBe('detective');
    expect(tierForClassification(undefined)).toBe('detective');
  });

  it('counts floor flags 0-5', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ material_weakness_suspected: true })).toBe(1);
    expect(countFloorFlags({
      material_weakness_suspected: true,
      regulator_audit_in_progress: true,
    })).toBe(2);
    expect(countFloorFlags({
      material_weakness_suspected: true,
      regulator_audit_in_progress: true,
      soc2_type2_period_open: true,
      iso27001_surveillance_audit_due: true,
      sox_404_attestation_pending: true,
    })).toBe(5);
  });

  it('floorAtDirective triggers on >=1 flag', () => {
    expect(floorAtDirective({})).toBe(false);
    expect(floorAtDirective({ material_weakness_suspected: true })).toBe(true);
    expect(floorAtDirective({ soc2_type2_period_open: true })).toBe(true);
  });

  it('floorAtGovernance triggers on >=2 flags', () => {
    expect(floorAtGovernance({ material_weakness_suspected: true })).toBe(false);
    expect(floorAtGovernance({
      material_weakness_suspected: true,
      regulator_audit_in_progress: true,
    })).toBe(true);
  });

  it('effectiveTier promotes preventive to directive on >=1 flag', () => {
    expect(effectiveTier('preventive', {})).toBe('preventive');
    expect(effectiveTier('preventive', { material_weakness_suspected: true })).toBe('directive');
    expect(effectiveTier('detective', { regulator_audit_in_progress: true })).toBe('directive');
    expect(effectiveTier('corrective', { soc2_type2_period_open: true })).toBe('directive');
  });

  it('effectiveTier keeps directive at directive on 1 flag', () => {
    expect(effectiveTier('directive', { material_weakness_suspected: true })).toBe('directive');
  });

  it('effectiveTier promotes any tier to governance on >=2 flags', () => {
    expect(effectiveTier('preventive', {
      material_weakness_suspected: true,
      regulator_audit_in_progress: true,
    })).toBe('governance');
    expect(effectiveTier('detective', {
      soc2_type2_period_open: true,
      sox_404_attestation_pending: true,
    })).toBe('governance');
    expect(effectiveTier('directive', {
      regulator_audit_in_progress: true,
      iso27001_surveillance_audit_due: true,
    })).toBe('governance');
  });

  it('isHeavyTier identifies directive + governance', () => {
    expect(isHeavyTier('preventive')).toBe(false);
    expect(isHeavyTier('detective')).toBe(false);
    expect(isHeavyTier('corrective')).toBe(false);
    expect(isHeavyTier('directive')).toBe(true);
    expect(isHeavyTier('governance')).toBe(true);
  });

  it('isReportable matches heavy tiers', () => {
    expect(isReportable('preventive')).toBe(false);
    expect(isReportable('directive')).toBe(true);
    expect(isReportable('governance')).toBe(true);
  });
});

describe('W121 INVERTED SLA matrix', () => {
  it('control_defined anchor: 168/240/360/480/720h', () => {
    expect(SLA_HOURS.control_defined.preventive).toBe(168);
    expect(SLA_HOURS.control_defined.detective).toBe(240);
    expect(SLA_HOURS.control_defined.corrective).toBe(360);
    expect(SLA_HOURS.control_defined.directive).toBe(480);
    expect(SLA_HOURS.control_defined.governance).toBe(720);
  });

  it('governance always >= directive >= corrective >= detective >= preventive', () => {
    const states = Object.keys(SLA_HOURS) as Array<keyof typeof SLA_HOURS>;
    for (const s of states) {
      if (s === 'archived' || s === 'deficient') continue;
      expect(SLA_HOURS[s].governance).toBeGreaterThanOrEqual(SLA_HOURS[s].directive);
      expect(SLA_HOURS[s].directive).toBeGreaterThanOrEqual(SLA_HOURS[s].corrective);
      expect(SLA_HOURS[s].corrective).toBeGreaterThanOrEqual(SLA_HOURS[s].detective);
      expect(SLA_HOURS[s].detective).toBeGreaterThanOrEqual(SLA_HOURS[s].preventive);
    }
  });

  it('archived + deficient have zero SLA', () => {
    expect(SLA_HOURS.archived.preventive).toBe(0);
    expect(SLA_HOURS.archived.governance).toBe(0);
    expect(SLA_HOURS.deficient.preventive).toBe(0);
    expect(SLA_HOURS.deficient.governance).toBe(0);
  });

  it('slaWindowHours returns hours', () => {
    expect(slaWindowHours('control_defined', 'governance')).toBe(720);
    expect(slaWindowHours('tooe_evidence_collected', 'preventive')).toBe(168);
    expect(slaWindowHours('archived', 'governance')).toBe(0);
  });

  it('slaDeadlineFor returns deadline date', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    const deadline = slaDeadlineFor('control_defined', 'governance', enteredAt);
    expect(deadline).not.toBeNull();
    expect(deadline!.getTime()).toBe(enteredAt.getTime() + 720 * 3600 * 1000);
  });

  it('slaDeadlineFor returns null for zero SLA', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    expect(slaDeadlineFor('archived', 'governance', enteredAt)).toBeNull();
  });

  it('slaHoursRemaining returns hours until deadline', () => {
    const enteredAt = new Date('2026-01-01T00:00:00Z');
    const now = new Date('2026-01-01T24:00:00Z');
    expect(slaHoursRemaining('control_defined', 'governance', enteredAt, now)).toBe(696);
  });

  it('slaHoursRemaining returns 0 when no entered_at', () => {
    expect(slaHoursRemaining('control_defined', 'governance', null, new Date())).toBe(0);
  });
});

describe('W121 SIGNATURE crossings (MATERIAL-WEAKNESS-DEFICIENT hard line)', () => {
  it('flag_deficient EVERY tier WHEN material_weakness_suspected', () => {
    expect(crossesIntoRegulator('flag_deficient', 'preventive', {
      flags: { material_weakness_suspected: true },
    })).toBe(true);
    expect(crossesIntoRegulator('flag_deficient', 'detective', {
      flags: { material_weakness_suspected: true },
    })).toBe(true);
    expect(crossesIntoRegulator('flag_deficient', 'corrective', {
      flags: { material_weakness_suspected: true },
    })).toBe(true);
    expect(crossesIntoRegulator('flag_deficient', 'directive', {
      flags: { material_weakness_suspected: true },
    })).toBe(true);
    expect(crossesIntoRegulator('flag_deficient', 'governance', {
      flags: { material_weakness_suspected: true },
    })).toBe(true);
  });

  it('flag_deficient does NOT cross without material_weakness_suspected', () => {
    expect(crossesIntoRegulator('flag_deficient', 'preventive', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('flag_deficient', 'governance', { flags: {} })).toBe(false);
  });

  it('accept_with_exception crosses on directive + governance only', () => {
    expect(crossesIntoRegulator('accept_with_exception', 'preventive', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('accept_with_exception', 'detective', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('accept_with_exception', 'corrective', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('accept_with_exception', 'directive', { flags: {} })).toBe(true);
    expect(crossesIntoRegulator('accept_with_exception', 'governance', { flags: {} })).toBe(true);
  });

  it('archive EVERY tier WHEN external_auditor_sign_off=true', () => {
    expect(crossesIntoRegulator('archive', 'preventive', { flags: {}, external_auditor_sign_off: true })).toBe(true);
    expect(crossesIntoRegulator('archive', 'detective', { flags: {}, external_auditor_sign_off: true })).toBe(true);
    expect(crossesIntoRegulator('archive', 'corrective', { flags: {}, external_auditor_sign_off: true })).toBe(true);
    expect(crossesIntoRegulator('archive', 'directive', { flags: {}, external_auditor_sign_off: true })).toBe(true);
    expect(crossesIntoRegulator('archive', 'governance', { flags: {}, external_auditor_sign_off: true })).toBe(true);
  });

  it('archive does NOT cross without external_auditor_sign_off', () => {
    expect(crossesIntoRegulator('archive', 'governance', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('archive', 'preventive', { flags: {} })).toBe(false);
  });

  it('complete_remediation never crosses (normal flow)', () => {
    expect(crossesIntoRegulator('complete_remediation', 'preventive', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('complete_remediation', 'governance', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('complete_remediation', 'governance', {
      flags: { material_weakness_suspected: true },
    })).toBe(false);
  });

  it('suspend + initiate_re_test never cross on their own', () => {
    expect(crossesIntoRegulator('suspend', 'governance', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('initiate_re_test', 'governance', { flags: {} })).toBe(false);
  });

  it('sla_breached crosses on directive + governance only', () => {
    expect(slaBreachCrossesIntoRegulator('preventive')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('detective')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('corrective')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('directive')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('governance')).toBe(true);
  });
});

describe('W121 party routing (4-step authority)', () => {
  it('control_owner owns define + document + walkthrough + ToD/ToOE plan/collect/execute', () => {
    expect(partyForAction('define_control')).toBe('control_owner');
    expect(partyForAction('document_design')).toBe('control_owner');
    expect(partyForAction('complete_walkthrough')).toBe('control_owner');
    expect(partyForAction('plan_tod_test')).toBe('control_owner');
    expect(partyForAction('collect_tod_evidence')).toBe('control_owner');
    expect(partyForAction('execute_tod_test')).toBe('control_owner');
    expect(partyForAction('plan_tooe_test')).toBe('control_owner');
    expect(partyForAction('collect_tooe_evidence')).toBe('control_owner');
    expect(partyForAction('execute_tooe_test')).toBe('control_owner');
  });

  it('process_owner owns deficiency + remediation + suspend + re-test', () => {
    expect(partyForAction('assess_deficiency')).toBe('process_owner');
    expect(partyForAction('complete_remediation')).toBe('process_owner');
    expect(partyForAction('suspend')).toBe('process_owner');
    expect(partyForAction('initiate_re_test')).toBe('process_owner');
  });

  it('CISO owns archive + flag_deficient + accept_with_exception', () => {
    expect(partyForAction('archive')).toBe('CISO');
    expect(partyForAction('flag_deficient')).toBe('CISO');
    expect(partyForAction('accept_with_exception')).toBe('CISO');
  });

  it('authorityRequired ladder matches tier', () => {
    expect(authorityRequired('preventive')).toBe('control_owner');
    expect(authorityRequired('detective')).toBe('process_owner');
    expect(authorityRequired('corrective')).toBe('CISO');
    expect(authorityRequired('directive')).toBe('CISO');
    expect(authorityRequired('governance')).toBe('audit_committee_chair');
  });
});

describe('W121 event types', () => {
  it('eventTypeFor returns the chain event name', () => {
    expect(eventTypeFor('define_control')).toBe('control_environment_audit_defined');
    expect(eventTypeFor('document_design')).toBe('control_environment_audit_design_documented');
    expect(eventTypeFor('complete_walkthrough')).toBe('control_environment_audit_walkthrough_completed');
    expect(eventTypeFor('plan_tod_test')).toBe('control_environment_audit_tod_test_planned');
    expect(eventTypeFor('collect_tod_evidence')).toBe('control_environment_audit_tod_evidence_collected');
    expect(eventTypeFor('execute_tod_test')).toBe('control_environment_audit_tod_test_executed');
    expect(eventTypeFor('plan_tooe_test')).toBe('control_environment_audit_tooe_test_planned');
    expect(eventTypeFor('collect_tooe_evidence')).toBe('control_environment_audit_tooe_evidence_collected');
    expect(eventTypeFor('execute_tooe_test')).toBe('control_environment_audit_tooe_test_executed');
    expect(eventTypeFor('assess_deficiency')).toBe('control_environment_audit_deficiency_assessed');
    expect(eventTypeFor('complete_remediation')).toBe('control_environment_audit_remediation_completed');
    expect(eventTypeFor('archive')).toBe('control_environment_audit_archived');
    expect(eventTypeFor('flag_deficient')).toBe('control_environment_audit_flagged_deficient');
    expect(eventTypeFor('accept_with_exception')).toBe('control_environment_audit_accepted_with_exception');
    expect(eventTypeFor('suspend')).toBe('control_environment_audit_suspended');
    expect(eventTypeFor('initiate_re_test')).toBe('control_environment_audit_re_test_initiated');
  });
});

describe('W121 urgency band (INVERTED polarity)', () => {
  it('negative hours -> critical regardless of tier', () => {
    expect(urgencyBand('preventive', -1)).toBe('critical');
    expect(urgencyBand('governance', -1)).toBe('critical');
  });

  it('governance has loosest thresholds (24/96/240)', () => {
    expect(urgencyBand('governance', 12)).toBe('critical');
    expect(urgencyBand('governance', 48)).toBe('high');
    expect(urgencyBand('governance', 120)).toBe('medium');
    expect(urgencyBand('governance', 300)).toBe('low');
  });

  it('directive thresholds 18/72/168', () => {
    expect(urgencyBand('directive', 12)).toBe('critical');
    expect(urgencyBand('directive', 36)).toBe('high');
    expect(urgencyBand('directive', 96)).toBe('medium');
    expect(urgencyBand('directive', 200)).toBe('low');
  });

  it('corrective thresholds 12/48/96', () => {
    expect(urgencyBand('corrective', 6)).toBe('critical');
    expect(urgencyBand('corrective', 24)).toBe('high');
    expect(urgencyBand('corrective', 60)).toBe('medium');
    expect(urgencyBand('corrective', 120)).toBe('low');
  });

  it('detective thresholds 8/24/48', () => {
    expect(urgencyBand('detective', 4)).toBe('critical');
    expect(urgencyBand('detective', 12)).toBe('high');
    expect(urgencyBand('detective', 36)).toBe('medium');
    expect(urgencyBand('detective', 60)).toBe('low');
  });

  it('preventive has tightest thresholds (4/12/24)', () => {
    expect(urgencyBand('preventive', 2)).toBe('critical');
    expect(urgencyBand('preventive', 8)).toBe('high');
    expect(urgencyBand('preventive', 18)).toBe('medium');
    expect(urgencyBand('preventive', 30)).toBe('low');
  });
});

describe('W121 audit window + quarterly + annual', () => {
  it('auditWindowHours INVERTED - governance 720, preventive 168', () => {
    expect(auditWindowHours('preventive')).toBe(168);
    expect(auditWindowHours('detective')).toBe(240);
    expect(auditWindowHours('corrective')).toBe(360);
    expect(auditWindowHours('directive')).toBe(480);
    expect(auditWindowHours('governance')).toBe(720);
  });

  it('daysToQuarterlyCutoff returns positive days', () => {
    const now = new Date('2026-04-15T00:00:00Z');
    const days = daysToQuarterlyCutoff(now);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(92);
  });

  it('daysToAnnualAudit returns positive days', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const days = daysToAnnualAudit(now);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(366);
  });
});

describe('W121 8-bridge architecture (W118 mandatory)', () => {
  it('detects W113 EVM ref', () => {
    expect(bridgesToW113EvmChain('evm-1')).toBe(true);
    expect(bridgesToW113EvmChain(null)).toBe(false);
    expect(bridgesToW113EvmChain('')).toBe(false);
  });

  it('detects W114 doc-control ref', () => {
    expect(bridgesToW114DocControlChain('doc-1')).toBe(true);
    expect(bridgesToW114DocControlChain(null)).toBe(false);
  });

  it('detects W115 submittal ref', () => {
    expect(bridgesToW115SubmittalChain('sub-1')).toBe(true);
    expect(bridgesToW115SubmittalChain(null)).toBe(false);
  });

  it('detects W116 RFI ref', () => {
    expect(bridgesToW116RfiChain('rfi-1')).toBe(true);
    expect(bridgesToW116RfiChain(null)).toBe(false);
  });

  it('detects W117 change-order ref', () => {
    expect(bridgesToW117ChangeOrderChain('co-1')).toBe(true);
    expect(bridgesToW117ChangeOrderChain(null)).toBe(false);
  });

  it('detects W118 audit-chain block ref (MANDATORY)', () => {
    expect(bridgesToW118AuditChain('block-1')).toBe(true);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });

  it('detects W119 regulator-export pack ref', () => {
    expect(bridgesToW119RegulatorExportChain('rep-1')).toBe(true);
    expect(bridgesToW119RegulatorExportChain(null)).toBe(false);
  });

  it('detects W120 reconciliation-attestation ref', () => {
    expect(bridgesToW120ReconciliationAttestationChain('ratt-1')).toBe(true);
    expect(bridgesToW120ReconciliationAttestationChain(null)).toBe(false);
  });
});

describe('W121 design documentation completeness 0-130', () => {
  it('returns 0 for empty input', () => {
    expect(designDocumentationCompletenessIndex({})).toBe(0);
  });

  it('caps at 130 with all fields set', () => {
    const score = designDocumentationCompletenessIndex({
      control_description: true,
      control_objective: true,
      control_classification: true,
      responsible_party: true,
      frequency_documented: true,
      inputs_documented: true,
      outputs_documented: true,
      ipe_documented: true,
      manual_or_automated: true,
      preventive_or_detective: true,
      coso_principle_mapped: true,
      iso27001_control_mapped: true,
      soc2_criteria_mapped: true,
      walkthrough_evidence: true,
      soa_linked: true,
    });
    expect(score).toBeLessThanOrEqual(130);
    expect(score).toBeGreaterThanOrEqual(120);
  });

  it('walkthrough_evidence is heavy weight (16 points)', () => {
    const score = designDocumentationCompletenessIndex({ walkthrough_evidence: true });
    expect(score).toBe(16);
  });
});

describe('W121 ToD test completeness 0-130', () => {
  it('returns 0 for empty input', () => {
    expect(todTestCompletenessIndex({})).toBe(0);
  });

  it('caps at 130 with all fields set', () => {
    const score = todTestCompletenessIndex({
      tod_test_plan: true,
      tod_sample_size_documented: true,
      tod_sample_population_defined: true,
      tod_evidence_collected: true,
      tod_test_executed: true,
      tod_reviewer_signoff: true,
      tod_pass_rate_pct: 100,
      tod_exceptions_logged: true,
      tod_root_cause_assessed: true,
      tod_remediation_proposed: true,
      tod_passed: true,
    });
    expect(score).toBe(130);
  });

  it('tod_passed is heavy weight (22 points)', () => {
    const score = todTestCompletenessIndex({ tod_passed: true });
    expect(score).toBe(22);
  });
});

describe('W121 ToOE test completeness 0-130', () => {
  it('returns 0 for empty input', () => {
    expect(tooeTestCompletenessIndex({})).toBe(0);
  });

  it('caps at 130 with all fields set', () => {
    const score = tooeTestCompletenessIndex({
      tooe_test_plan: true,
      tooe_sample_size_documented: true,
      tooe_period_defined: true,
      tooe_sample_population_defined: true,
      tooe_evidence_collected: true,
      tooe_test_executed: true,
      tooe_reviewer_signoff: true,
      tooe_pass_rate_pct: 100,
      tooe_exceptions_logged: true,
      tooe_root_cause_assessed: true,
      tooe_remediation_proposed: true,
      tooe_passed: true,
      external_auditor_sign_off: true,
    });
    expect(score).toBeLessThanOrEqual(130);
    expect(score).toBeGreaterThanOrEqual(120);
  });

  it('external_auditor_sign_off is heavy weight (10 points)', () => {
    const score = tooeTestCompletenessIndex({ external_auditor_sign_off: true });
    expect(score).toBe(10);
  });
});

describe('W121 evidence coverage 0-130', () => {
  it('returns 0 for empty input', () => {
    expect(evidenceCoverageIndex({})).toBe(0);
  });

  it('caps at 130 with all bridges + audit artefacts set', () => {
    const score = evidenceCoverageIndex({
      w118_block_range_paired: true,
      w119_export_pack_attached: true,
      w120_attestation_ref_attached: true,
      w113_evm_ref_attached: true,
      w114_doc_control_ref_attached: true,
      w115_submittal_ref_attached: true,
      w116_rfi_ref_attached: true,
      w117_change_order_ref_attached: true,
      walkthrough_evidence: true,
      tod_evidence_collected: true,
      tooe_evidence_collected: true,
      reviewer_signoff: true,
      external_auditor_sign_off: true,
    });
    expect(score).toBe(130);
  });

  it('W118 block-range pairing is heaviest weight (22 points)', () => {
    const score = evidenceCoverageIndex({ w118_block_range_paired: true });
    expect(score).toBe(22);
  });
});

describe('W121 external-auditor signed-JWT validation', () => {
  it('validates JWT format (3 base64url segments)', () => {
    expect(isValidExternalAuditorJwtFormat('abc.def.ghi')).toBe(true);
    expect(isValidExternalAuditorJwtFormat('YWJj.ZGVm.Z2hp')).toBe(true);
    expect(isValidExternalAuditorJwtFormat('abc-def_ghi.jkl-mno_pqr.stu-vwx_yz0')).toBe(true);
  });

  it('rejects invalid JWT format', () => {
    expect(isValidExternalAuditorJwtFormat(null)).toBe(false);
    expect(isValidExternalAuditorJwtFormat('')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('abc.def')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('abc.def.ghi.jkl')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('abc..def')).toBe(false);
    expect(isValidExternalAuditorJwtFormat('abc.def.gh!')).toBe(false);
  });

  it('parses valid external-auditor claims', () => {
    const claims = parseExternalAuditorClaims(JSON.stringify({
      sub: 'pwc-za-2026',
      aud: 'external_auditor',
      scope: ['cea-001', 'cea-002'],
      iat: 1735689600,
      exp: 1738281600,
      audit_firm: 'PwC',
      engagement_ref: 'ENG-2026-001',
    }));
    expect(claims).not.toBeNull();
    expect(claims!.sub).toBe('pwc-za-2026');
    expect(claims!.aud).toBe('external_auditor');
    expect(claims!.scope.length).toBe(2);
  });

  it('rejects claims with wrong aud', () => {
    const claims = parseExternalAuditorClaims(JSON.stringify({
      sub: 'pwc-za-2026',
      aud: 'admin',
      scope: ['cea-001'],
      iat: 1735689600,
      exp: 1738281600,
    }));
    expect(claims).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(parseExternalAuditorClaims('not-json')).toBeNull();
    expect(parseExternalAuditorClaims(null)).toBeNull();
    expect(parseExternalAuditorClaims('')).toBeNull();
  });

  it('detects expired claims', () => {
    const expired = {
      sub: 'pwc-za-2026',
      aud: 'external_auditor' as const,
      scope: ['cea-001'],
      iat: 1735689600,
      exp: 1735689600,
    };
    expect(isExternalAuditorClaimsExpired(expired, new Date('2026-01-01T00:00:00Z'))).toBe(true);
  });

  it('externalAuditorCanReadControl checks scope + expiry', () => {
    const claims = {
      sub: 'pwc-za-2026',
      aud: 'external_auditor' as const,
      scope: ['cea-001', 'cea-002'],
      iat: 1735689600,
      exp: 9999999999,
    };
    const now = new Date('2026-06-01T00:00:00Z');
    expect(externalAuditorCanReadControl(claims, 'cea-001', now)).toBe(true);
    expect(externalAuditorCanReadControl(claims, 'cea-002', now)).toBe(true);
    expect(externalAuditorCanReadControl(claims, 'cea-003', now)).toBe(false);
  });

  it('wildcard scope grants access to any control', () => {
    const claims = {
      sub: 'pwc-za-2026',
      aud: 'external_auditor' as const,
      scope: ['*'],
      iat: 1735689600,
      exp: 9999999999,
    };
    const now = new Date('2026-06-01T00:00:00Z');
    expect(externalAuditorCanReadControl(claims, 'cea-999', now)).toBe(true);
  });
});

describe('W121 taxonomy validation', () => {
  it('isKnownControlFramework accepts all 14 frameworks', () => {
    for (const fw of CONTROL_FRAMEWORKS) {
      expect(isKnownControlFramework(fw)).toBe(true);
    }
    expect(CONTROL_FRAMEWORKS.length).toBe(14);
  });

  it('isKnownControlFramework rejects unknown', () => {
    expect(isKnownControlFramework('unknown')).toBe(false);
    expect(isKnownControlFramework(null)).toBe(false);
    expect(isKnownControlFramework('')).toBe(false);
  });

  it('isKnownControlClassification accepts the 5 classifications', () => {
    for (const c of CONTROL_CLASSIFICATIONS) {
      expect(isKnownControlClassification(c)).toBe(true);
    }
    expect(CONTROL_CLASSIFICATIONS.length).toBe(5);
  });

  it('isKnownDeficiencySeverity accepts the 4 severities', () => {
    for (const d of DEFICIENCY_SEVERITIES) {
      expect(isKnownDeficiencySeverity(d)).toBe(true);
    }
    expect(DEFICIENCY_SEVERITIES.length).toBe(4);
    expect(DEFICIENCY_SEVERITIES).toContain('material_weakness');
    expect(DEFICIENCY_SEVERITIES).toContain('significant_deficiency');
  });
});

describe('W121 control health band composite', () => {
  it('deficient -> critical', () => {
    expect(controlHealthBand(
      'deficient',
      100, 100, 100, 100,
      false, true, false,
      {},
      null,
    )).toBe('critical');
  });

  it('material_weakness severity -> critical', () => {
    expect(controlHealthBand(
      'deficiency_assessed',
      100, 100, 100, 100,
      false, false, false,
      {},
      'material_weakness',
    )).toBe('critical');
  });

  it('material_weakness_suspected flag -> critical', () => {
    expect(controlHealthBand(
      'tooe_test_executed',
      100, 100, 100, 100,
      false, false, false,
      { material_weakness_suspected: true },
      null,
    )).toBe('critical');
  });

  it('archived -> green', () => {
    expect(controlHealthBand(
      'archived',
      100, 100, 100, 100,
      false, false, false,
      {},
      null,
    )).toBe('green');
  });

  it('sla breached -> red', () => {
    expect(controlHealthBand(
      'tooe_test_executed',
      100, 100, 100, 100,
      true, false, false,
      {},
      null,
    )).toBe('red');
  });

  it('excepted -> amber', () => {
    expect(controlHealthBand(
      'excepted',
      100, 100, 100, 100,
      false, false, true,
      {},
      null,
    )).toBe('amber');
  });

  it('significant_deficiency -> red', () => {
    expect(controlHealthBand(
      'deficiency_assessed',
      100, 100, 100, 100,
      false, false, false,
      {},
      'significant_deficiency',
    )).toBe('red');
  });

  it('low design completeness -> red', () => {
    expect(controlHealthBand(
      'design_documented',
      40, 0, 0, 0,
      false, false, false,
      {},
      null,
    )).toBe('red');
  });

  it('all-green case', () => {
    expect(controlHealthBand(
      'remediation_completed',
      100, 100, 100, 100,
      false, false, false,
      {},
      null,
    )).toBe('green');
  });
});
