// ipp_fm — IPP Force Majeure Declaration & Relief as data.
//
// An FM event under PPA Schedule 6 opens the moment generation is affected: the
// IPP serves a formal notice, the operator verifies it was served within the
// contractual window, then the event moves into active monitoring while relief
// is worked out. Monitoring is where the lost-generation measure lands and the
// pure `priorityFor` bucketing stamps `priority`, which the later regulator
// gates read — so a dispute or a prolonged-termination declaration raised
// before monitoring ever started simply can't yet be 'critical' (no MWh
// measured), matching the legacy "significant+ tiers cross to the regulator"
// cascade hint without inventing a guard the registry doesn't have.
//
// grant_relief and declare_prolonged instead require the regulator party
// directly on the edge input (not a guard) — the legacy hint says "crosses
// into the regulator inbox for EVERY tier", i.e. unconditionally, which an
// engine-enforced required field expresses more honestly than a conditional
// guard would.
//
// settles:false — despite carrying an estimated_relief_zar figure, this chain
// is the FM negotiation record; any actual quantum flows through the PPA
// tariff-adjustment or settlement chains it authorises (R-S5-1), matching the
// legacy descriptor's "No ZAR quantum (lost MWh)" note (quantumCol: null).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off measured lost generation. No clock, no env.
const priorityFor = (mwh: Json | undefined): string => (typeof mwh === 'number' && mwh >= 50 ? 'critical' : 'normal');

export const ippFm: ChainDecl = {
  key: 'ipp_fm',
  noun: 'IPP force majeure declaration',
  refPrefix: 'IFM',
  title: (f) => `FM — ${(f.project_id as string) ?? 'project'} (${(f.fm_category as string) ?? 'event'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'REIPPPP', provision: 'PPA Schedule 6 force majeure relief', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'generation availability reporting', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'operator', 'regulator'],

  fields: {
    project_id: { type: 'string', required: true, label: 'Project' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP developer' },
    operator_party: { type: 'party', role: 'operator', label: 'Platform operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    fm_category: { type: 'string', required: true, label: 'FM category' },
    relief_type: { type: 'string', required: true, label: 'Relief type' },
    estimated_relief_zar: { type: 'number', min: 0, label: 'Estimated relief (ZAR, indicative)' },
    counterparty_name: { type: 'string', label: 'Counterparty' },
    ie_firm_name: { type: 'string', label: 'IE firm' },
    lost_generation_mwh: { type: 'number', min: 0, label: 'Lost generation (MWh)' },
    // written by derive, never by the client
    priority: { type: 'string', label: 'Priority (normal/critical)' },
    notice_ref: { type: 'string', label: 'FM notice ref' },
    relief_terms_ref: { type: 'string', label: 'Relief terms ref' },
    resolution_notes: { type: 'string', label: 'Resolution notes' },
    dispute_reason: { type: 'string', label: 'Dispute basis' },
    arbitration_ref: { type: 'string', label: 'Arbitration case ref' },
    arbitration_outcome: { type: 'string', label: 'Arbitration determination' },
    prolonged_basis: { type: 'string', label: 'Prolonged-termination basis' },
    notice_issued_at: { type: 'string', label: 'Notice issued at' },
    notice_verified_at: { type: 'string', label: 'Notice verified at' },
    monitoring_started_at: { type: 'string', label: 'Monitoring started at' },
    relief_granted_at: { type: 'string', label: 'Relief granted at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    disputed_at: { type: 'string', label: 'Disputed at' },
    arbitration_commenced_at: { type: 'string', label: 'Arbitration commenced at' },
    arbitration_determined_at: { type: 'string', label: 'Arbitration determined at' },
    prolonged_at: { type: 'string', label: 'Prolonged termination declared at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'fm_event_occurred',

  states: {
    fm_event_occurred: { label: 'FM event occurred', terminal: false, holder: 'ipp_developer', sla: { hours: 48 } },
    fm_notice_issued: { label: 'Notice issued', terminal: false, holder: 'operator', sla: { days: 5 } },
    fm_notice_verified: { label: 'Notice verified', terminal: false, holder: 'ipp_developer', sla: { days: 3 } },
    fm_monitoring: { label: 'Monitoring', terminal: false, holder: 'operator' },
    fm_relief_in_progress: { label: 'Relief in progress', terminal: false, holder: 'ipp_developer' },
    fm_disputed: { label: 'Disputed', terminal: false, holder: 'operator', sla: { days: 10 } },
    fm_arbitration: { label: 'In arbitration', terminal: false, holder: 'operator' },
    fm_resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    fm_prolonged_termination: { label: 'Prolonged — termination', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
    fm_arbitration_determined: { label: 'Arbitration determined', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'declare',
      from: '@new',
      to: 'fm_event_occurred',
      by: ['ipp_developer', 'operator'],
      actorBecomes: 'ipp_developer',
      label: 'Declare force majeure',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        fm_category: { type: 'string', required: true },
        relief_type: { type: 'string', required: true },
        estimated_relief_zar: { type: 'number', min: 0 },
        counterparty_name: { type: 'string' },
        ie_firm_name: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'issue_fm_notice',
      from: 'fm_event_occurred',
      to: 'fm_notice_issued',
      by: ['ipp_developer'],
      label: 'Issue FM notice',
      intent: 'primary',
      input: { notice_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ notice_issued_at: isoUtc(at) }),
    },
    {
      id: 'verify_notice',
      from: 'fm_notice_issued',
      to: 'fm_notice_verified',
      by: ['operator'],
      label: 'Verify notice',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ notice_verified_at: isoUtc(at) }),
    },
    {
      id: 'commence_monitoring',
      from: 'fm_notice_verified',
      to: 'fm_monitoring',
      by: ['ipp_developer', 'operator'],
      label: 'Commence monitoring',
      intent: 'primary',
      input: { lost_generation_mwh: { type: 'number', min: 0 } },
      guards: [],
      // priority stamped here from the measured loss — later regulator gates read it.
      derive: (f, at: Instant) => ({ priority: priorityFor(f.lost_generation_mwh), monitoring_started_at: isoUtc(at) }),
    },
    {
      // "crosses into the regulator inbox for every tier" — enforced as a
      // required party field, not a conditional guard (see file header).
      id: 'grant_relief',
      from: 'fm_monitoring',
      to: 'fm_relief_in_progress',
      by: ['operator'],
      label: 'Grant relief',
      intent: 'primary',
      input: {
        relief_terms_ref: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ relief_granted_at: isoUtc(at) }),
    },
    {
      id: 'resolve_event',
      from: 'fm_relief_in_progress',
      to: 'fm_resolved',
      by: ['ipp_developer', 'operator'],
      label: 'Resolve event',
      intent: 'primary',
      input: { resolution_notes: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- dispute / arbitration spine -------------------------------------------
    {
      // significant+ severity (priority:'critical', stamped by commence_monitoring)
      // crosses to the regulator; a dispute raised before monitoring simply can't
      // be critical yet, so the guard passes it through.
      id: 'dispute_claim',
      from: ['fm_notice_issued', 'fm_notice_verified', 'fm_monitoring', 'fm_relief_in_progress'],
      to: 'fm_disputed',
      by: ['operator', 'ipp_developer'],
      label: 'Dispute claim',
      intent: 'destructive',
      input: { dispute_reason: { type: 'string', required: true } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ disputed_at: isoUtc(at) }),
    },
    {
      id: 'commence_arbitration',
      from: 'fm_disputed',
      to: 'fm_arbitration',
      by: ['operator', 'ipp_developer'],
      label: 'Commence arbitration',
      intent: 'primary',
      input: { arbitration_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ arbitration_commenced_at: isoUtc(at) }),
    },
    {
      id: 'determine_arbitration',
      from: 'fm_arbitration',
      to: 'fm_arbitration_determined',
      by: ['operator'],
      label: 'Determine arbitration',
      intent: 'primary',
      input: { arbitration_outcome: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ arbitration_determined_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'declare_prolonged',
      from: ['fm_monitoring', 'fm_relief_in_progress'],
      to: 'fm_prolonged_termination',
      by: ['operator', 'ipp_developer'],
      label: 'Declare prolonged',
      intent: 'destructive',
      input: {
        prolonged_basis: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ prolonged_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_claim',
      from: ['fm_event_occurred', 'fm_notice_issued', 'fm_notice_verified', 'fm_monitoring', 'fm_relief_in_progress', 'fm_disputed', 'fm_arbitration'],
      to: 'withdrawn',
      by: ['ipp_developer', 'operator'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['claim_no_longer_valid', 'generation_restored', 'commercial_settlement', 'duplicate_declaration', 'data_error'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
