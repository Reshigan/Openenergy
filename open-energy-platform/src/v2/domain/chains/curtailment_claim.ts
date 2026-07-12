// curtailment_claim — deemed-energy curtailment compensation claim as data.
//
// A generator (IPP) whose plant was constrained off by the System Operator
// raises a claim for the "deemed energy" it would have produced. The grid
// (System Operator) validates the curtailment event actually happened and was
// grid-instructed, then quantifies the deemed MWh and the ZAR owed; the buyer
// (offtaker) then instructs compensation. A rejected claim gives the generator
// a window to dispute; an operator/regulator either upholds it (back to
// validation for re-quantification) or dismisses it.
//
// STRUCTURAL settlement spine (permit_to_work pattern): compensation can ONLY be
// instructed from `quantified`, and `quantified` is only reachable from
// `validated`, which is only reachable from `raised`. So money can NEVER be
// instructed before the grid has both (a) validated the curtailment event and
// (b) quantified the deemed energy. No guard enforces this — the state graph does.
//
// Strategic gate: for a ≥100 MW plant, instructing compensation crosses a
// regulatory line — regulatorPresentIfStrategic requires NERSA (a live
// `regulator` party) on the txn before the money edge fires. Small plants
// instruct freely (guard is a no-op below 100 MW). The regulator can only be a
// party if attached at open, so regulator_party is an open-input party field.
//
// settles:false — this chain RECORDS a compensation instruction; it moves no
// money. The terminal money state is `compensated_instructed` and export always
// carries the record-only custody notice (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const curtailmentClaim: ChainDecl = {
  key: 'curtailment_claim',
  noun: 'Curtailment compensation claim',
  refPrefix: 'CURT',
  title: (f) =>
    `Curtailment claim — ${(f.plant_name as string) ?? 'unnamed plant'} (${
      typeof f.claimed_mwh === 'number' ? f.claimed_mwh : '?'
    } MWh)`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operations Code — curtailment & constrained-off dispatch', effect: 'authorises' },
    { instrument: 'REIPPPP PPA', provision: 'Deemed Energy compensation for buyer/grid curtailment', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's34 dispatch determination', effect: 'authorises' },
  ],
  roles: ['generator', 'grid', 'offtaker', 'regulator', 'operator'],

  fields: {
    plant_name: { type: 'string', required: true, label: 'Plant' },
    capacity_mw: { type: 'number', required: true, min: 0, label: 'Plant capacity (MW)' },
    curtailment_event_ref: { type: 'string', label: 'SO instruction ref' },
    curtailment_start: { type: 'string', label: 'Curtailment start (ISO)' },
    curtailment_end: { type: 'string', label: 'Curtailment end (ISO)' },
    claimed_mwh: { type: 'number', min: 0, label: 'Claimed deemed energy (MWh)' },
    grid_party: { type: 'party', role: 'grid', label: 'System Operator' },
    offtaker_party: { type: 'party', role: 'offtaker', label: 'Buyer / offtaker' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    validated_mwh: { type: 'number', min: 0, label: 'Validated deemed energy (MWh)' },
    tariff_zar_mwh: { type: 'number', min: 0, label: 'Tariff (ZAR/MWh)' },
    compensation_zar: { type: 'number', min: 0, label: 'Compensation (ZAR)' },
    // written by derive, never by the client
    raised_at: { type: 'string', label: 'Raised at' },
    validated_at: { type: 'string', label: 'Validated at' },
    quantified_at: { type: 'string', label: 'Quantified at' },
    instructed_at: { type: 'string', label: 'Compensation instructed at' },
  },

  initial: 'raised',

  states: {
    raised: { label: 'Raised', terminal: false, holder: 'grid', sla: { hours: 48 } },
    validated: { label: 'Validated', terminal: false, holder: 'grid', sla: { days: 5 } },
    quantified: { label: 'Quantified', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    // NO SETTLEMENT FINALITY — RECORD ONLY
    compensated_instructed: { label: 'Compensation instructed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: false, holder: 'generator', sla: { days: 10 } },
    in_dispute: { label: 'In dispute', terminal: false, holder: 'operator', sla: { days: 30 } },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'raised',
      by: ['generator', 'operator'],
      actorBecomes: 'generator',
      label: 'Raise claim',
      intent: 'primary',
      input: {
        plant_name: { type: 'string', required: true },
        capacity_mw: { type: 'number', required: true, min: 0 },
        curtailment_event_ref: { type: 'string' },
        curtailment_start: { type: 'string' },
        curtailment_end: { type: 'string' },
        claimed_mwh: { type: 'number', min: 0 },
        grid_party: { type: 'party', role: 'grid' },
        offtaker_party: { type: 'party', role: 'offtaker' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ raised_at: isoUtc(at) }),
    },

    // --- validation + quantification (grid / System Operator) ----------------
    {
      id: 'validate',
      from: 'raised',
      to: 'validated',
      by: ['grid', 'operator'],
      label: 'Validate curtailment event',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ validated_at: isoUtc(at) }),
    },
    {
      id: 'quantify',
      from: 'validated',
      to: 'quantified',
      by: ['grid', 'operator'],
      label: 'Quantify deemed energy',
      intent: 'primary',
      input: {
        validated_mwh: { type: 'number', required: true, min: 0 },
        tariff_zar_mwh: { type: 'number', min: 0 },
        compensation_zar: { type: 'number', required: true, min: 0 },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ quantified_at: isoUtc(at) }),
    },
    {
      // structural money edge: only reachable from `quantified`. Strategic-tier
      // (≥100 MW) plants need a regulator party before compensation is instructed.
      id: 'instruct_compensation',
      from: 'quantified',
      to: 'compensated_instructed',
      by: ['offtaker', 'operator'],
      label: 'Instruct compensation (record only)',
      intent: 'primary',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ instructed_at: isoUtc(at) }),
    },

    // --- reject + dispute loop ----------------------------------------------
    {
      id: 'reject',
      from: ['raised', 'validated'],
      to: 'rejected',
      by: ['grid', 'operator'],
      label: 'Reject claim',
      intent: 'destructive',
      requiresReason: ['event_not_grid_instructed', 'plant_unavailable', 'double_claim', 'outside_ppa_terms', 'data_insufficient'],
      guards: [],
    },
    {
      id: 'dispute',
      from: 'rejected',
      to: 'in_dispute',
      by: ['generator', 'operator'],
      label: 'Dispute rejection',
      intent: 'destructive',
      requiresReason: ['dispute_validation', 'dispute_quantum', 'new_evidence'],
      guards: [],
    },
    {
      id: 'uphold_dispute',
      from: 'in_dispute',
      to: 'validated',
      by: ['regulator', 'operator'],
      label: 'Uphold dispute (re-open for quantification)',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ validated_at: isoUtc(at) }),
    },
    {
      id: 'dismiss_dispute',
      from: 'in_dispute',
      to: 'dismissed',
      by: ['regulator', 'operator'],
      label: 'Dismiss dispute',
      intent: 'destructive',
      requiresReason: ['claim_unfounded', 'time_barred', 'withdrawn_by_generator'],
      guards: [],
    },
    // a rejected claim not disputed within the window lapses (time-bar stub;
    // the sweep computes the real bar off the `rejected` state sla — ppa pattern).
    {
      id: 'auto_dismiss',
      from: 'rejected',
      to: 'dismissed',
      by: ['system'],
      label: 'Auto-dismiss (dispute window lapsed)',
      intent: 'secondary',
      guards: [],
    },

    // --- generator-side exit -------------------------------------------------
    {
      id: 'withdraw',
      from: ['raised', 'validated', 'quantified'],
      to: 'withdrawn',
      by: ['generator', 'operator'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['duplicate', 'commercial_settlement', 'raised_in_error'],
      guards: [],
    },
  ],

  timers: [
    { onState: 'rejected', after: { days: 0 }, fire: 'auto_dismiss', kind: 'time_bar' },
  ],
};
