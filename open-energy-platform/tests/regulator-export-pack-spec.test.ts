// Wave 119 - Certified Regulator Export Packs spec battery.
//
// Covers: state machine (forward path pack_proposed -> archived + branch
// states + terminals + suspend->resume + reject_pack from any non-terminal
// + 16-action TRANSITIONS map coverage), tier derivation from pack_cadence
// + FLOOR-AT-QUARTERLY on each of 5 flags + FLOOR-AT-ANNUAL on 2+ flags,
// INVERTED SLA matrix anchored on pack_proposed (24/72/168/240/480h),
// SIGNATURE REGULATOR-REJECT-PACK crossings (reject_pack EVERY tier;
// withdraw EVERY tier when published_blocks_included; restate
// quarterly_attestation + annual_audit only; lodge_via_api never crosses;
// sla_breached HEAVY tiers only; suspend on regulator_audit_in_progress),
// party routing (5-party split: preparer/controller/CFO/CEO/regulator),
// authority ladder, regulator export window (INVERTED polarity), urgency
// band (INVERTED polarity - annual_audit loosest), 6-bridge architecture
// (W113/W114/W115/W116/W117/W118; W118 mandatory), pack completeness
// 0-130, XBRL conformance 0-130, ESG taxonomy coverage 0-100, controls
// narrative 0-130, integrity index 0-130, mTLS fingerprint validation,
// regulator target validation, pack health band composite.

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
  regulatorExportWindowHours,
  daysToQuarterlyAttestation,
  bridgesToW113EvmChain,
  bridgesToW114DocControlChain,
  bridgesToW115SubmittalChain,
  bridgesToW116RfiChain,
  bridgesToW117ChangeOrderChain,
  bridgesToW118AuditChain,
  packCompletenessIndex,
  xbrlConformanceIndex,
  esgTaxonomyCoverageIndex,
  controlsNarrativeIndex,
  integrityIndex,
  isValidMtlsFingerprint,
  isKnownRegulatorTarget,
  REGULATOR_TARGETS,
  packHealthBand,
} from '../src/utils/regulator-export-pack-spec';

describe('W119 Regulator Export Pack - state machine', () => {
  it('walks the forward path pack_proposed -> archived', () => {
    expect(nextStatus('pack_proposed', 'select_blocks')).toBe('blocks_selected');
    expect(nextStatus('blocks_selected', 'filter_leaves')).toBe('leaves_filtered');
    expect(nextStatus('leaves_filtered', 'assemble_xbrl')).toBe('xbrl_assembled');
    expect(nextStatus('xbrl_assembled', 'attach_narratives')).toBe('narratives_attached');
    expect(nextStatus('narratives_attached', 'run_internal_qa')).toBe('internal_qa');
    expect(nextStatus('internal_qa', 'get_counterparty_signoff')).toBe('counterparty_signoff');
    expect(nextStatus('counterparty_signoff', 'package')).toBe('packaged');
    expect(nextStatus('packaged', 'countersign')).toBe('countersigned');
    expect(nextStatus('countersigned', 'lodge_via_api')).toBe('lodged_via_api');
    expect(nextStatus('lodged_via_api', 'record_acknowledgement')).toBe('acknowledged_by_regulator');
    expect(nextStatus('acknowledged_by_regulator', 'archive')).toBe('archived');
  });

  it('blocks invalid transitions', () => {
    expect(nextStatus('pack_proposed', 'filter_leaves')).toBeNull();
    expect(nextStatus('blocks_selected', 'assemble_xbrl')).toBeNull();
    expect(nextStatus('leaves_filtered', 'attach_narratives')).toBeNull();
    expect(nextStatus('countersigned', 'record_acknowledgement')).toBeNull();
    expect(nextStatus('packaged', 'lodge_via_api')).toBeNull();
  });

  it('treats archived as hard terminal (no further transitions)', () => {
    expect(isHardTerminal('archived')).toBe(true);
    expect(isTerminal('archived')).toBe(true);
    expect(nextStatus('archived', 'reject_pack')).toBeNull();
    expect(nextStatus('archived', 'withdraw')).toBeNull();
    expect(allowedActions('archived')).toEqual([]);
  });

  it('rejected_by_regulator + withdrawn are UI terminals but not hard terminal', () => {
    expect(isHardTerminal('rejected_by_regulator')).toBe(false);
    expect(isHardTerminal('withdrawn')).toBe(false);
    expect(isTerminal('rejected_by_regulator')).toBe(true);
    expect(isTerminal('withdrawn')).toBe(true);
  });

  it('restated + suspended are soft (not terminal)', () => {
    expect(isTerminal('restated')).toBe(false);
    expect(isTerminal('suspended')).toBe(false);
  });

  it('reject_pack can land from any non-terminal state', () => {
    expect(nextStatus('pack_proposed', 'reject_pack')).toBe('rejected_by_regulator');
    expect(nextStatus('xbrl_assembled', 'reject_pack')).toBe('rejected_by_regulator');
    expect(nextStatus('counterparty_signoff', 'reject_pack')).toBe('rejected_by_regulator');
    expect(nextStatus('lodged_via_api', 'reject_pack')).toBe('rejected_by_regulator');
    expect(nextStatus('acknowledged_by_regulator', 'reject_pack')).toBe('rejected_by_regulator');
  });

  it('withdraw can land any time pre-acknowledgement (through lodge)', () => {
    expect(nextStatus('pack_proposed', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('blocks_selected', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('xbrl_assembled', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('countersigned', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('lodged_via_api', 'withdraw')).toBe('withdrawn');
    expect(nextStatus('acknowledged_by_regulator', 'withdraw')).toBeNull();
  });

  it('suspend lands from QA/signoff/lodgement and resume returns to internal_qa', () => {
    expect(nextStatus('internal_qa', 'suspend')).toBe('suspended');
    expect(nextStatus('counterparty_signoff', 'suspend')).toBe('suspended');
    expect(nextStatus('packaged', 'suspend')).toBe('suspended');
    expect(nextStatus('countersigned', 'suspend')).toBe('suspended');
    expect(nextStatus('lodged_via_api', 'suspend')).toBe('suspended');
    expect(nextStatus('suspended', 'run_internal_qa')).toBe('internal_qa');
  });

  it('restate supersedes an acknowledged pack (post-ack correction)', () => {
    expect(nextStatus('acknowledged_by_regulator', 'restate')).toBe('restated');
    // archived is HARD terminal - restate blocked even though it is in RESTATE_FROM.
    expect(nextStatus('archived', 'restate')).toBeNull();
    // restated soft state can be re-restated.
    expect(nextStatus('restated', 'restate')).toBe('restated');
    // restate from pre-ack states is blocked.
    expect(nextStatus('pack_proposed', 'restate')).toBeNull();
    expect(nextStatus('counterparty_signoff', 'restate')).toBeNull();
  });

  it('RESTATE_FROM members verified in TRANSITIONS map', () => {
    expect(TRANSITIONS.restate.from).toContain('acknowledged_by_regulator');
    expect(TRANSITIONS.restate.from).toContain('archived');
    expect(TRANSITIONS.restate.from).toContain('restated');
  });

  it('allowedActions excludes propose_pack (create-only)', () => {
    const acts = allowedActions('pack_proposed');
    expect(acts).not.toContain('propose_pack');
  });

  it('TRANSITIONS map covers all 16 actions', () => {
    const acts: Array<keyof typeof TRANSITIONS> = [
      'propose_pack', 'select_blocks', 'filter_leaves', 'assemble_xbrl',
      'attach_narratives', 'run_internal_qa', 'get_counterparty_signoff',
      'package', 'countersign', 'lodge_via_api', 'record_acknowledgement',
      'archive', 'reject_pack', 'withdraw', 'restate', 'suspend',
    ];
    for (const a of acts) {
      expect(TRANSITIONS[a]).toBeDefined();
    }
    expect(Object.keys(TRANSITIONS)).toHaveLength(16);
  });
});

describe('W119 Regulator Export Pack - tier derivation', () => {
  it('tierForCadence maps cadence to tier', () => {
    expect(tierForCadence('ad_hoc')).toBe('ad_hoc');
    expect(tierForCadence('monthly_return')).toBe('monthly_return');
    expect(tierForCadence('quarterly_attestation')).toBe('quarterly_attestation');
    expect(tierForCadence('half_year')).toBe('half_year');
    expect(tierForCadence('annual_audit')).toBe('annual_audit');
    expect(tierForCadence(null)).toBe('monthly_return');
    expect(tierForCadence(undefined)).toBe('monthly_return');
    expect(tierForCadence('garbage')).toBe('monthly_return');
  });

  it('countFloorFlags counts only truthy flags', () => {
    expect(countFloorFlags({})).toBe(0);
    expect(countFloorFlags({ cross_regulator_pack: true })).toBe(1);
    expect(countFloorFlags({
      cross_regulator_pack: 1,
      material_restatement: 1,
    })).toBe(2);
    expect(countFloorFlags({
      cross_regulator_pack: 1,
      material_restatement: 1,
      esg_double_materiality_trigger: 1,
      lender_distribution_required: 1,
      regulator_audit_in_progress: 1,
    })).toBe(5);
  });

  it('FLOOR-AT-QUARTERLY triggers on any single flag', () => {
    expect(floorAtQuarterly({ cross_regulator_pack: 1 })).toBe(true);
    expect(floorAtQuarterly({ material_restatement: 1 })).toBe(true);
    expect(floorAtQuarterly({ esg_double_materiality_trigger: 1 })).toBe(true);
    expect(floorAtQuarterly({ lender_distribution_required: 1 })).toBe(true);
    expect(floorAtQuarterly({ regulator_audit_in_progress: 1 })).toBe(true);
    expect(floorAtQuarterly({})).toBe(false);
  });

  it('FLOOR-AT-ANNUAL triggers on 2+ flags', () => {
    expect(floorAtAnnual({ cross_regulator_pack: 1 })).toBe(false);
    expect(floorAtAnnual({
      cross_regulator_pack: 1,
      material_restatement: 1,
    })).toBe(true);
  });

  it('effectiveTier lifts to quarterly_attestation on >=1 flag', () => {
    expect(effectiveTier('ad_hoc', { cross_regulator_pack: 1 })).toBe('quarterly_attestation');
    expect(effectiveTier('monthly_return', { regulator_audit_in_progress: 1 })).toBe('quarterly_attestation');
    // Already at quarterly stays quarterly with one flag.
    expect(effectiveTier('quarterly_attestation', { material_restatement: 1 })).toBe('quarterly_attestation');
    // Already at half_year stays half_year with one flag.
    expect(effectiveTier('half_year', { cross_regulator_pack: 1 })).toBe('half_year');
    // Already at annual_audit stays.
    expect(effectiveTier('annual_audit', { material_restatement: 1 })).toBe('annual_audit');
  });

  it('effectiveTier lifts to annual_audit on 2+ flags', () => {
    expect(effectiveTier('ad_hoc', {
      cross_regulator_pack: 1,
      material_restatement: 1,
    })).toBe('annual_audit');
    expect(effectiveTier('monthly_return', {
      esg_double_materiality_trigger: 1,
      lender_distribution_required: 1,
      regulator_audit_in_progress: 1,
    })).toBe('annual_audit');
  });

  it('isHeavyTier matches quarterly_attestation + half_year + annual_audit', () => {
    expect(isHeavyTier('ad_hoc')).toBe(false);
    expect(isHeavyTier('monthly_return')).toBe(false);
    expect(isHeavyTier('quarterly_attestation')).toBe(true);
    expect(isHeavyTier('half_year')).toBe(true);
    expect(isHeavyTier('annual_audit')).toBe(true);
  });

  it('isReportable matches quarterly_attestation + annual_audit only', () => {
    expect(isReportable('ad_hoc')).toBe(false);
    expect(isReportable('monthly_return')).toBe(false);
    expect(isReportable('quarterly_attestation')).toBe(true);
    expect(isReportable('half_year')).toBe(false);
    expect(isReportable('annual_audit')).toBe(true);
  });
});

describe('W119 Regulator Export Pack - INVERTED SLA polarity', () => {
  it('pack_proposed anchor matches spec hours per tier', () => {
    expect(SLA_HOURS.pack_proposed.ad_hoc).toBe(24);
    expect(SLA_HOURS.pack_proposed.monthly_return).toBe(72);
    expect(SLA_HOURS.pack_proposed.quarterly_attestation).toBe(168);
    expect(SLA_HOURS.pack_proposed.half_year).toBe(240);
    expect(SLA_HOURS.pack_proposed.annual_audit).toBe(480);
  });

  it('annual_audit SLA strictly larger than ad_hoc across every non-terminal state', () => {
    const states = [
      'pack_proposed', 'blocks_selected', 'leaves_filtered', 'xbrl_assembled',
      'narratives_attached', 'internal_qa', 'counterparty_signoff', 'packaged',
      'countersigned', 'lodged_via_api', 'acknowledged_by_regulator',
      'restated', 'suspended',
    ] as const;
    for (const s of states) {
      expect(SLA_HOURS[s].annual_audit).toBeGreaterThan(SLA_HOURS[s].ad_hoc);
    }
  });

  it('terminal states have zero SLA window', () => {
    expect(slaWindowHours('archived', 'annual_audit')).toBe(0);
    expect(slaWindowHours('rejected_by_regulator', 'annual_audit')).toBe(0);
    expect(slaWindowHours('withdrawn', 'annual_audit')).toBe(0);
  });

  it('slaDeadlineFor + slaHoursRemaining track INVERTED polarity', () => {
    const enteredAt = new Date('2026-05-31T00:00:00Z');
    const now = new Date('2026-05-31T01:00:00Z');
    const adhocHrs = slaHoursRemaining('pack_proposed', 'ad_hoc', enteredAt, now);
    const annualHrs = slaHoursRemaining('pack_proposed', 'annual_audit', enteredAt, now);
    expect(annualHrs).toBeGreaterThan(adhocHrs);
  });

  it('slaDeadlineFor returns null for terminal/zero windows', () => {
    expect(slaDeadlineFor('archived', 'annual_audit', new Date())).toBeNull();
  });
});

describe('W119 Regulator Export Pack - SIGNATURE crossings', () => {
  it('reject_pack crosses regulator EVERY tier (SIGNATURE REGULATOR-REJECT-PACK)', () => {
    const tiers = ['ad_hoc', 'monthly_return', 'quarterly_attestation', 'half_year', 'annual_audit'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('reject_pack', tier, { flags: {} })).toBe(true);
    }
  });

  it('withdraw crosses regulator EVERY tier WHEN published_blocks_included', () => {
    const tiers = ['ad_hoc', 'monthly_return', 'quarterly_attestation', 'half_year', 'annual_audit'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('withdraw', tier, {
        flags: {},
        published_blocks_included: true,
      })).toBe(true);
    }
  });

  it('withdraw does NOT cross when no published blocks were included', () => {
    const tiers = ['ad_hoc', 'monthly_return', 'quarterly_attestation', 'half_year', 'annual_audit'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('withdraw', tier, {
        flags: {},
        published_blocks_included: false,
      })).toBe(false);
    }
  });

  it('restate crosses regulator quarterly_attestation + annual_audit only', () => {
    expect(crossesIntoRegulator('restate', 'ad_hoc', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('restate', 'monthly_return', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('restate', 'quarterly_attestation', { flags: {} })).toBe(true);
    expect(crossesIntoRegulator('restate', 'half_year', { flags: {} })).toBe(false);
    expect(crossesIntoRegulator('restate', 'annual_audit', { flags: {} })).toBe(true);
  });

  it('lodge_via_api NEVER crosses regulator (normal flow)', () => {
    const tiers = ['ad_hoc', 'monthly_return', 'quarterly_attestation', 'half_year', 'annual_audit'] as const;
    for (const tier of tiers) {
      expect(crossesIntoRegulator('lodge_via_api', tier, {
        flags: { regulator_audit_in_progress: 1 },
      })).toBe(false);
    }
  });

  it('suspend crosses when regulator_audit_in_progress flag set', () => {
    expect(crossesIntoRegulator('suspend', 'ad_hoc', {
      flags: { regulator_audit_in_progress: 1 },
    })).toBe(true);
    expect(crossesIntoRegulator('suspend', 'annual_audit', {
      flags: { regulator_audit_in_progress: 0 },
    })).toBe(false);
  });

  it('record_acknowledgement / archive / package / countersign / lodge / propose / select / filter / assemble / attach / qa / signoff never cross on their own', () => {
    const acts = [
      'record_acknowledgement', 'archive', 'package', 'countersign',
      'lodge_via_api', 'propose_pack', 'select_blocks', 'filter_leaves',
      'assemble_xbrl', 'attach_narratives', 'run_internal_qa',
      'get_counterparty_signoff',
    ] as const;
    for (const a of acts) {
      expect(crossesIntoRegulator(a, 'annual_audit', { flags: {} })).toBe(false);
    }
  });

  it('sla_breach crosses regulator quarterly_attestation + half_year + annual_audit only', () => {
    expect(slaBreachCrossesIntoRegulator('ad_hoc')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('monthly_return')).toBe(false);
    expect(slaBreachCrossesIntoRegulator('quarterly_attestation')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('half_year')).toBe(true);
    expect(slaBreachCrossesIntoRegulator('annual_audit')).toBe(true);
  });
});

describe('W119 Regulator Export Pack - party routing', () => {
  it('preparer writes propose/select/filter/assemble/attach', () => {
    expect(partyForAction('propose_pack')).toBe('preparer');
    expect(partyForAction('select_blocks')).toBe('preparer');
    expect(partyForAction('filter_leaves')).toBe('preparer');
    expect(partyForAction('assemble_xbrl')).toBe('preparer');
    expect(partyForAction('attach_narratives')).toBe('preparer');
  });

  it('controller writes run_internal_qa', () => {
    expect(partyForAction('run_internal_qa')).toBe('controller');
  });

  it('CFO writes signoff/package/countersign/withdraw/restate/suspend', () => {
    expect(partyForAction('get_counterparty_signoff')).toBe('CFO');
    expect(partyForAction('package')).toBe('CFO');
    expect(partyForAction('countersign')).toBe('CFO');
    expect(partyForAction('withdraw')).toBe('CFO');
    expect(partyForAction('restate')).toBe('CFO');
    expect(partyForAction('suspend')).toBe('CFO');
  });

  it('CEO writes lodge_via_api (CEO countersignature at lodgement)', () => {
    expect(partyForAction('lodge_via_api')).toBe('CEO');
  });

  it('regulator writes record_acknowledgement / reject_pack / archive', () => {
    expect(partyForAction('record_acknowledgement')).toBe('regulator');
    expect(partyForAction('reject_pack')).toBe('regulator');
    expect(partyForAction('archive')).toBe('regulator');
  });
});

describe('W119 Regulator Export Pack - authority + filing windows', () => {
  it('authority ladder climbs with tier', () => {
    expect(authorityRequired('ad_hoc')).toBe('preparer');
    expect(authorityRequired('monthly_return')).toBe('controller');
    expect(authorityRequired('quarterly_attestation')).toBe('CFO');
    expect(authorityRequired('half_year')).toBe('CEO');
    expect(authorityRequired('annual_audit')).toBe('CEO');
  });

  it('regulator export window INVERTED - annual_audit longest', () => {
    expect(regulatorExportWindowHours('ad_hoc')).toBe(24);
    expect(regulatorExportWindowHours('monthly_return')).toBe(72);
    expect(regulatorExportWindowHours('quarterly_attestation')).toBe(168);
    expect(regulatorExportWindowHours('half_year')).toBe(240);
    expect(regulatorExportWindowHours('annual_audit')).toBe(480);
  });

  it('daysToQuarterlyAttestation returns positive count toward next quarter end (Jan 31 / Apr 30 / Jul 31 / Oct 31)', () => {
    const may = new Date('2026-05-31T00:00:00Z');
    expect(daysToQuarterlyAttestation(may)).toBeGreaterThan(0);
    expect(daysToQuarterlyAttestation(may)).toBeLessThanOrEqual(95); // ~ to next quarter end Jul 31
  });
});

describe('W119 Regulator Export Pack - INVERTED urgency band', () => {
  it('annual_audit has loosest thresholds (more runway)', () => {
    expect(urgencyBand('annual_audit', 300)).toBe('low');
    expect(urgencyBand('annual_audit', 150)).toBe('medium');
    expect(urgencyBand('annual_audit', 50)).toBe('high');
    expect(urgencyBand('annual_audit', 5)).toBe('critical');
  });

  it('half_year between quarterly and annual', () => {
    expect(urgencyBand('half_year', 200)).toBe('low');
    expect(urgencyBand('half_year', 100)).toBe('medium');
    expect(urgencyBand('half_year', 30)).toBe('high');
    expect(urgencyBand('half_year', 1)).toBe('critical');
  });

  it('quarterly_attestation tighter than half_year', () => {
    expect(urgencyBand('quarterly_attestation', 120)).toBe('low');
    expect(urgencyBand('quarterly_attestation', 60)).toBe('medium');
    expect(urgencyBand('quarterly_attestation', 20)).toBe('high');
    expect(urgencyBand('quarterly_attestation', 5)).toBe('critical');
  });

  it('monthly_return tighter than quarterly', () => {
    expect(urgencyBand('monthly_return', 50)).toBe('low');
    expect(urgencyBand('monthly_return', 30)).toBe('medium');
    expect(urgencyBand('monthly_return', 10)).toBe('high');
    expect(urgencyBand('monthly_return', 1)).toBe('critical');
  });

  it('ad_hoc has TIGHTEST thresholds', () => {
    expect(urgencyBand('ad_hoc', 15)).toBe('low');
    expect(urgencyBand('ad_hoc', 8)).toBe('medium');
    expect(urgencyBand('ad_hoc', 4)).toBe('high');
    expect(urgencyBand('ad_hoc', 1)).toBe('critical');
  });

  it('negative time always critical', () => {
    expect(urgencyBand('ad_hoc', -1)).toBe('critical');
    expect(urgencyBand('annual_audit', -1)).toBe('critical');
  });
});

describe('W119 Regulator Export Pack - event types', () => {
  it('event types map 1:1 with actions (16 distinct actions)', () => {
    expect(eventTypeFor('propose_pack')).toBe('regulator_export_pack_proposed');
    expect(eventTypeFor('select_blocks')).toBe('regulator_export_blocks_selected');
    expect(eventTypeFor('filter_leaves')).toBe('regulator_export_leaves_filtered');
    expect(eventTypeFor('assemble_xbrl')).toBe('regulator_export_xbrl_assembled');
    expect(eventTypeFor('attach_narratives')).toBe('regulator_export_narratives_attached');
    expect(eventTypeFor('run_internal_qa')).toBe('regulator_export_internal_qa');
    expect(eventTypeFor('get_counterparty_signoff')).toBe('regulator_export_counterparty_signoff');
    expect(eventTypeFor('package')).toBe('regulator_export_packaged');
    expect(eventTypeFor('countersign')).toBe('regulator_export_countersigned');
    expect(eventTypeFor('lodge_via_api')).toBe('regulator_export_lodged_via_api');
    expect(eventTypeFor('record_acknowledgement')).toBe('regulator_export_acknowledged_by_regulator');
    expect(eventTypeFor('archive')).toBe('regulator_export_archived');
    expect(eventTypeFor('reject_pack')).toBe('regulator_export_rejected_by_regulator');
    expect(eventTypeFor('withdraw')).toBe('regulator_export_withdrawn');
    expect(eventTypeFor('restate')).toBe('regulator_export_restated');
    expect(eventTypeFor('suspend')).toBe('regulator_export_suspended');
  });
});

describe('W119 Regulator Export Pack - 6 bridge architecture (W118 mandatory)', () => {
  it('all six bridges return true when ref present', () => {
    expect(bridgesToW113EvmChain('ipe-123')).toBe(true);
    expect(bridgesToW114DocControlChain('idc-123')).toBe(true);
    expect(bridgesToW115SubmittalChain('sub-123')).toBe(true);
    expect(bridgesToW116RfiChain('rfi-123')).toBe(true);
    expect(bridgesToW117ChangeOrderChain('co-123')).toBe(true);
    expect(bridgesToW118AuditChain('acb-016')).toBe(true);
  });

  it('all six bridges return false when ref missing', () => {
    expect(bridgesToW113EvmChain(null)).toBe(false);
    expect(bridgesToW114DocControlChain(null)).toBe(false);
    expect(bridgesToW115SubmittalChain(undefined)).toBe(false);
    expect(bridgesToW116RfiChain('')).toBe(false);
    expect(bridgesToW117ChangeOrderChain(null)).toBe(false);
    expect(bridgesToW118AuditChain(null)).toBe(false);
  });
});

describe('W119 Regulator Export Pack - completeness + integrity indexes', () => {
  it('packCompletenessIndex 0-130 range', () => {
    expect(packCompletenessIndex({})).toBe(0);
    expect(packCompletenessIndex({ pack_proposed: 1 })).toBe(3);
    const full = packCompletenessIndex({
      pack_proposed: 1, blocks_selected: 1, leaves_filtered: 1,
      xbrl_assembled: 1, narratives_attached: 1, internal_qa: 1,
      counterparty_signoff: 1, packaged: 1, countersigned: 1,
      lodged_via_api: 1, acknowledged_by_regulator: 1, archived: 1,
      clean_close_bonus: 1,
    });
    expect(full).toBeGreaterThan(100);
    expect(full).toBeLessThanOrEqual(130);
  });

  it('integrityIndex 0-130 range with 6 bridges + QA + signoff + ACK', () => {
    expect(integrityIndex({})).toBe(0);
    const full = integrityIndex({
      bridge_w113_evm: 1,
      bridge_w114_doc: 1,
      bridge_w115_sub: 1,
      bridge_w116_rfi: 1,
      bridge_w117_co: 1,
      bridge_w118_audit: 1,
      internal_qa_passed: 1,
      counterparty_signoff_obtained: 1,
      regulator_ack_received: 1,
    });
    expect(full).toBe(130);
  });

  it('integrityIndex partial - missing bridges drops score', () => {
    const partial = integrityIndex({
      bridge_w118_audit: 1,
      internal_qa_passed: 1,
    });
    expect(partial).toBe(30); // 15 + 15
  });
});

describe('W119 Regulator Export Pack - XBRL conformance index', () => {
  it('xbrlConformanceIndex 0 for empty', () => {
    expect(xbrlConformanceIndex({})).toBe(0);
  });

  it('xbrlConformanceIndex max when all elements present (capped at 130)', () => {
    const full = xbrlConformanceIndex({
      xbrl_assembled: 1,
      taxonomy_version_set: 1,
      schema_well_formed: 1,
      required_element_assets: 1,
      required_element_liabilities: 1,
      required_element_equity: 1,
      required_element_revenue: 1,
      required_element_profit_loss: 1,
      required_element_cash_equivalents: 1,
      required_element_segments_reported: 1,
      ixbrl_inline_html_valid: 1,
      pdf_a3_archival_attached: 1,
      signing_policy_etsi_119312: 1,
      cms_signature_rfc5652: 1,
    });
    // Sum: 8+6+14+8+8+8+8+8+8+8+10+8+10+10 = 122. Cap is 130.
    expect(full).toBe(122);
    expect(full).toBeLessThanOrEqual(130);
  });

  it('xbrlConformanceIndex partial - schema_well_formed contributes 14', () => {
    expect(xbrlConformanceIndex({ schema_well_formed: 1 })).toBe(14);
  });

  it('xbrlConformanceIndex 7 IFRS required elements each contribute', () => {
    const required = xbrlConformanceIndex({
      required_element_assets: 1,
      required_element_liabilities: 1,
      required_element_equity: 1,
      required_element_revenue: 1,
      required_element_profit_loss: 1,
      required_element_cash_equivalents: 1,
      required_element_segments_reported: 1,
    });
    expect(required).toBe(56); // 7 * 8
  });
});

describe('W119 Regulator Export Pack - ESG taxonomy coverage', () => {
  it('esgTaxonomyCoverageIndex 0 for empty', () => {
    expect(esgTaxonomyCoverageIndex({})).toBe(0);
  });

  it('esgTaxonomyCoverageIndex 100 when all four frameworks present', () => {
    const full = esgTaxonomyCoverageIndex({
      gri_standards_attached: 1,
      sasb_standards_attached: 1,
      tcfd_recommendations_attached: 1,
      issb_ifrs_s1_s2_attached: 1,
    });
    expect(full).toBe(100);
  });

  it('each framework contributes 25 points', () => {
    expect(esgTaxonomyCoverageIndex({ gri_standards_attached: 1 })).toBe(25);
    expect(esgTaxonomyCoverageIndex({ sasb_standards_attached: 1 })).toBe(25);
    expect(esgTaxonomyCoverageIndex({ tcfd_recommendations_attached: 1 })).toBe(25);
    expect(esgTaxonomyCoverageIndex({ issb_ifrs_s1_s2_attached: 1 })).toBe(25);
  });
});

describe('W119 Regulator Export Pack - controls narrative index', () => {
  it('controlsNarrativeIndex 0 for empty', () => {
    expect(controlsNarrativeIndex({})).toBe(0);
  });

  it('controlsNarrativeIndex full coverage caps at 130 (actual sum 120)', () => {
    const full = controlsNarrativeIndex({
      coso_control_environment: 1,
      coso_risk_assessment: 1,
      coso_control_activities: 1,
      coso_information_communication: 1,
      coso_monitoring_activities: 1,
      tsc_security: 1,
      tsc_availability: 1,
      tsc_processing_integrity: 1,
      tsc_confidentiality: 1,
      tsc_privacy: 1,
      management_assertion_signed: 1,
      auditor_opinion_attached: 1,
      bridge_letter_attached: 1,
    });
    // Sum: 10+10+10+10+10+10+8+8+8+8+10+12+6 = 120. Cap is 130.
    expect(full).toBe(120);
    expect(full).toBeLessThanOrEqual(130);
  });

  it('all 5 COSO components contribute 10 each', () => {
    const coso = controlsNarrativeIndex({
      coso_control_environment: 1,
      coso_risk_assessment: 1,
      coso_control_activities: 1,
      coso_information_communication: 1,
      coso_monitoring_activities: 1,
    });
    expect(coso).toBe(50);
  });

  it('auditor_opinion_attached contributes highest single weight (12)', () => {
    expect(controlsNarrativeIndex({ auditor_opinion_attached: 1 })).toBe(12);
  });
});

describe('W119 Regulator Export Pack - mTLS fingerprint validation', () => {
  it('rejects empty / null / undefined', () => {
    expect(isValidMtlsFingerprint(null)).toBe(false);
    expect(isValidMtlsFingerprint(undefined)).toBe(false);
    expect(isValidMtlsFingerprint('')).toBe(false);
  });

  it('accepts 64-char lowercase hex SHA-256 fingerprint', () => {
    expect(isValidMtlsFingerprint('a'.repeat(64))).toBe(true);
    expect(isValidMtlsFingerprint('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('accepts fingerprint with colon separators (cleaned out)', () => {
    expect(isValidMtlsFingerprint('AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99')).toBe(true);
  });

  it('rejects too-short or too-long fingerprints', () => {
    expect(isValidMtlsFingerprint('a'.repeat(63))).toBe(false);
    expect(isValidMtlsFingerprint('a'.repeat(65))).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidMtlsFingerprint('g'.repeat(64))).toBe(false);
    expect(isValidMtlsFingerprint('x'.repeat(64))).toBe(false);
  });

  it('accepts uppercase hex (case-insensitive after clean)', () => {
    expect(isValidMtlsFingerprint('A'.repeat(64))).toBe(true);
    expect(isValidMtlsFingerprint('F'.repeat(64))).toBe(true);
  });
});

describe('W119 Regulator Export Pack - regulator target validation', () => {
  it('isKnownRegulatorTarget accepts all 10 supported targets', () => {
    for (const target of REGULATOR_TARGETS) {
      expect(isKnownRegulatorTarget(target)).toBe(true);
    }
  });

  it('rejects unknown / null / empty targets', () => {
    expect(isKnownRegulatorTarget(null)).toBe(false);
    expect(isKnownRegulatorTarget(undefined)).toBe(false);
    expect(isKnownRegulatorTarget('')).toBe(false);
    expect(isKnownRegulatorTarget('garbage')).toBe(false);
    expect(isKnownRegulatorTarget('NERSA')).toBe(false); // case-sensitive
  });

  it('REGULATOR_TARGETS includes all 10 expected: NERSA/IPPO/SARB/DMRE/FSCA/DFFE/DTI/JSE-SRL/SARS/CIPC', () => {
    expect(REGULATOR_TARGETS).toHaveLength(10);
    expect(REGULATOR_TARGETS).toContain('nersa');
    expect(REGULATOR_TARGETS).toContain('ippo');
    expect(REGULATOR_TARGETS).toContain('sarb');
    expect(REGULATOR_TARGETS).toContain('dmre');
    expect(REGULATOR_TARGETS).toContain('fsca');
    expect(REGULATOR_TARGETS).toContain('dffe');
    expect(REGULATOR_TARGETS).toContain('dti');
    expect(REGULATOR_TARGETS).toContain('jse_srl');
    expect(REGULATOR_TARGETS).toContain('sars');
    expect(REGULATOR_TARGETS).toContain('cipc');
  });
});

describe('W119 Regulator Export Pack - health band', () => {
  it('archived = green', () => {
    expect(packHealthBand('archived', 130, 130, 130, false, false, false, false)).toBe('green');
  });

  it('rejected = critical regardless of other state', () => {
    expect(packHealthBand('pack_proposed', 130, 130, 130, false, true, false, false)).toBe('critical');
    expect(packHealthBand('archived', 130, 130, 130, false, true, false, false)).toBe('critical');
  });

  it('sla_breached = red (unless archived/rejected)', () => {
    expect(packHealthBand('lodged_via_api', 130, 130, 130, true, false, false, false)).toBe('red');
  });

  it('withdrawn = amber', () => {
    expect(packHealthBand('withdrawn', 130, 130, 130, false, false, true, false)).toBe('amber');
  });

  it('suspended = amber', () => {
    expect(packHealthBand('suspended', 130, 130, 130, false, false, false, true)).toBe('amber');
  });

  it('low XBRL conformance during assembly states = red', () => {
    expect(packHealthBand('xbrl_assembled', 130, 100, 40, false, false, false, false)).toBe('red');
    expect(packHealthBand('narratives_attached', 130, 100, 40, false, false, false, false)).toBe('red');
    expect(packHealthBand('internal_qa', 130, 100, 40, false, false, false, false)).toBe('red');
  });

  it('low integrity = red', () => {
    expect(packHealthBand('counterparty_signoff', 50, 100, 100, false, false, false, false)).toBe('red');
  });

  it('mid integrity = amber', () => {
    expect(packHealthBand('counterparty_signoff', 80, 100, 100, false, false, false, false)).toBe('amber');
  });

  it('all green when integrity full + completeness >=80 + xbrl ok + clean status', () => {
    expect(packHealthBand('lodged_via_api', 130, 130, 130, false, false, false, false)).toBe('green');
  });
});
