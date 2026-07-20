// substation_asset — grid transformer / substation asset lifecycle as data.
// NERSA Grid Code Chapter 3 + NRS 048-2 (W211; src/utils/substation-asset-spec.ts
// is the legacy v1 state machine this chain ports 1:1).
//
// A grid operator registers an asset, commissions it, energises it into
// service, then cycles it through periodic condition assessment →
// refurbishment-or-replace decisions → return to service, until either a
// planned decommission or an unplanned failure retires it. Both exits are
// terminal (SAS_HARD_TERMINALS in the v1 spec).
//
// Structural honesty (no invented guards):
//  - This is a single-actor operational record (counterpartyCol: null in the
//    v1 descriptor) — there is no second party to check distinctness against,
//    and no compliance-halt / credit / CP-evidence concept applies to a
//    physical asset's commissioning state. None of the 10 registry guards
//    describe a real rejection rule for this chain, so every edge carries
//    guards: [] — the state graph (SAS_VALID_TRANSITIONS) is the only gate,
//    exactly as it is in the v1 route (`SAS_VALID_TRANSITIONS[currentStatus]`).
//  - Regulator crossings (sasCrossesIntoRegulator in the v1 spec) are
//    record-only: record_failure always notifies the regulator; decommission
//    and take_out_of_service only notify for transmission/critical_node tiers.
//    That's ported as a derived `regulator_notified` flag, not a guard —
//    it never blocks the action, it only flags it (matches v1: the insert
//    into regulator_inbox happens unconditionally after the status write).
//
// settles:false — refurbishment_cost_zar is an informational quantum (like
// ccp_assessment's credit_limit_zar); this chain never moves money (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

const crossesRegulator = (tier: Json | undefined, when: 'critical_node' | 'transmission_or_critical'): boolean => {
  if (typeof tier !== 'string') return false;
  if (when === 'critical_node') return tier === 'critical_node';
  return tier === 'transmission' || tier === 'critical_node';
};

export const substationAsset: ChainDecl = {
  key: 'substation_asset',
  noun: 'Substation asset',
  refPrefix: 'SAS',
  title: (f) => `${(f.name as string) ?? 'Unnamed asset'} — ${(f.asset_number as string) ?? 'no tag'}`,
  visibility: 'owner',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'Chapter 3 — transmission/distribution asset management', effect: 'requires' },
    { instrument: 'NRS 048-2', provision: 'Network performance — asset condition & reliability standards', effect: 'requires' },
  ],
  roles: ['grid_operator', 'operator'],

  fields: {
    asset_number: { type: 'string', required: true, label: 'Asset number' },
    name: { type: 'string', required: true, label: 'Name' },
    asset_type: { type: 'string', label: 'Asset type' },
    asset_tier: { type: 'string', label: 'Asset tier (distribution/subtransmission/transmission/critical_node)' },
    location_name: { type: 'string', label: 'Location' },
    voltage_kv: { type: 'number', min: 0, label: 'Voltage (kV)' },
    rated_mva: { type: 'number', min: 0, label: 'Rated MVA' },
    manufacturer: { type: 'string', label: 'Manufacturer' },
    model: { type: 'string', label: 'Model' },
    serial_number: { type: 'string', label: 'Serial number' },
    year_manufactured: { type: 'number', label: 'Year manufactured' },
    expected_life_years: { type: 'number', min: 1, label: 'Expected life (years)' },
    reason: { type: 'string', label: 'Reason / notes' },
    reason_detail: { type: 'string', label: 'Energisation note' },
    condition_score: { type: 'number', min: 0, label: 'Condition score' },
    remaining_life_years: { type: 'number', min: 0, label: 'Remaining life (years)' },
    refurbishment_type: { type: 'string', label: 'Refurbishment type' },
    refurbishment_cost_zar: { type: 'number', min: 0, label: 'Refurbishment cost (ZAR) — informational' },
    decommission_reason: { type: 'string', label: 'Decommission reason' },
    failure_mode: { type: 'string', label: 'Failure mode' },
    failure_investigation_ref: { type: 'string', label: 'Failure investigation ref' },
    // written by derive, never by the client
    regulator_notified: { type: 'boolean', label: 'Regulator notified' },
    commissioned_at: { type: 'string', label: 'Commissioned (energised) at' },
    last_assessed_at: { type: 'string', label: 'Last condition assessment at' },
    refurbishment_started_at: { type: 'string', label: 'Refurbishment started at' },
    refurbishment_completed_at: { type: 'string', label: 'Refurbishment completed at' },
    decommissioned_at: { type: 'string', label: 'Decommissioned at' },
    failure_reported_at: { type: 'string', label: 'Failure reported at' },
  },

  initial: 'registered',

  states: {
    registered: { label: 'Registered', terminal: false, holder: 'grid_operator' },
    commissioning: { label: 'Commissioning', terminal: false, holder: 'grid_operator' },
    // in-service resting state: no action pending until the next assessment
    // cycle or an out-of-service/failure event (mirrors ccp_assessment's
    // 'approved' — holder: 'none').
    energised: { label: 'Energised', terminal: false, holder: 'none' },
    condition_assessment: { label: 'Condition assessment', terminal: false, holder: 'grid_operator' },
    assessment_complete: { label: 'Assessment complete', terminal: false, holder: 'grid_operator' },
    refurbishment_planned: { label: 'Refurbishment planned', terminal: false, holder: 'grid_operator' },
    out_of_service: { label: 'Out of service', terminal: false, holder: 'grid_operator' },
    refurbishment: { label: 'Refurbishment', terminal: false, holder: 'grid_operator' },
    returned_to_service: { label: 'Returned to service', terminal: false, holder: 'grid_operator' },
    decommission_decision: { label: 'Decommission decision', terminal: false, holder: 'grid_operator' },
    decommissioned: { label: 'Decommissioned', terminal: true, holder: 'none' },
    failed: { label: 'Failed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'registered',
      by: ['grid_operator', 'operator'],
      actorBecomes: 'grid_operator',
      label: 'Register substation asset',
      intent: 'primary',
      input: {
        asset_number: { type: 'string', required: true },
        name: { type: 'string', required: true },
        asset_type: { type: 'string' },
        asset_tier: { type: 'string' },
        location_name: { type: 'string' },
        voltage_kv: { type: 'number', min: 0 },
        rated_mva: { type: 'number', min: 0 },
        manufacturer: { type: 'string' },
        model: { type: 'string' },
        serial_number: { type: 'string' },
        year_manufactured: { type: 'number' },
        expected_life_years: { type: 'number', min: 1 },
        reason: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'start_commissioning',
      from: 'registered',
      to: 'commissioning',
      by: ['grid_operator', 'operator'],
      label: 'Start commissioning',
      intent: 'primary',
      input: { reason: { type: 'string' } },
      guards: [],
    },
    {
      // reachable after initial commissioning, a passed assessment, a
      // completed refurb, or a reversed decommission decision — matches
      // SAS_VALID_TRANSITIONS exactly.
      id: 'energise',
      from: ['commissioning', 'assessment_complete', 'returned_to_service', 'decommission_decision'],
      to: 'energised',
      by: ['grid_operator', 'operator'],
      label: 'Energise asset',
      intent: 'primary',
      input: { reason_detail: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ commissioned_at: isoUtc(at) }),
    },
    {
      id: 'schedule_assessment',
      from: 'energised',
      to: 'condition_assessment',
      by: ['grid_operator', 'operator'],
      label: 'Schedule condition assessment',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ last_assessed_at: isoUtc(at) }),
    },
    {
      id: 'complete_assessment',
      from: 'condition_assessment',
      to: 'assessment_complete',
      by: ['grid_operator', 'operator'],
      label: 'Complete assessment',
      intent: 'primary',
      input: {
        condition_score: { type: 'number', min: 0 },
        remaining_life_years: { type: 'number', min: 0 },
      },
      guards: [],
    },
    {
      id: 'plan_refurbishment',
      from: 'assessment_complete',
      to: 'refurbishment_planned',
      by: ['grid_operator', 'operator'],
      label: 'Plan refurbishment',
      intent: 'primary',
      input: { refurbishment_type: { type: 'string' } },
      guards: [],
    },
    {
      id: 'take_out_of_service',
      from: ['energised', 'refurbishment_planned'],
      to: 'out_of_service',
      by: ['grid_operator', 'operator'],
      label: 'Take out of service',
      intent: 'secondary',
      input: { reason: { type: 'string' } },
      guards: [],
      // critical_node assets crossing out of service notify the regulator
      // (sasCrossesIntoRegulator — take_out_of_service branch).
      derive: (f) => ({ regulator_notified: crossesRegulator(f.asset_tier, 'critical_node') || (f.regulator_notified === true) }),
    },
    {
      id: 'start_refurbishment',
      from: 'out_of_service',
      to: 'refurbishment',
      by: ['grid_operator', 'operator'],
      label: 'Start refurbishment',
      intent: 'primary',
      input: { refurbishment_cost_zar: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ refurbishment_started_at: isoUtc(at) }),
    },
    {
      id: 'return_to_service',
      from: ['out_of_service', 'refurbishment'],
      to: 'returned_to_service',
      by: ['grid_operator', 'operator'],
      label: 'Return to service',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ refurbishment_completed_at: isoUtc(at) }),
    },
    {
      id: 'initiate_decommission',
      from: 'energised',
      to: 'decommission_decision',
      by: ['grid_operator', 'operator'],
      label: 'Initiate decommission decision',
      intent: 'secondary',
      input: { decommission_reason: { type: 'string' } },
      guards: [],
    },
    {
      // the only forward edge into the terminal decommissioned state, and it
      // only fires from decommission_decision — an asset can never be
      // decommissioned without that decision step (structural gate).
      id: 'decommission',
      from: 'decommission_decision',
      to: 'decommissioned',
      by: ['grid_operator', 'operator'],
      label: 'Decommission',
      intent: 'destructive',
      input: { decommission_reason: { type: 'string' } },
      guards: [],
      // transmission/critical_node assets notify the regulator on retirement.
      derive: (f, at: Instant) => ({
        decommissioned_at: isoUtc(at),
        regulator_notified: crossesRegulator(f.asset_tier, 'transmission_or_critical') || (f.regulator_notified === true),
      }),
    },
    {
      id: 'record_failure',
      from: ['commissioning', 'energised', 'condition_assessment', 'out_of_service', 'refurbishment'],
      to: 'failed',
      by: ['grid_operator', 'operator'],
      label: 'Record failure',
      intent: 'destructive',
      input: {
        failure_mode: { type: 'string', required: true },
        failure_investigation_ref: { type: 'string' },
        reason: { type: 'string' },
      },
      guards: [],
      // an unplanned in-service failure is always a reportable grid event.
      derive: (_f, at: Instant) => ({ failure_reported_at: isoUtc(at), regulator_notified: true }),
    },
  ],
};
