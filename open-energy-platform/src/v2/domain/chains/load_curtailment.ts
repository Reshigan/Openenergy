// load_curtailment — grid load-shedding directive lifecycle as data.
//
// A network operator issues a load-curtailment directive (a load-shedding stage)
// to a consumer/large customer; the consumer acknowledges, sheds the nominated
// MW, the operator then restores supply and closes the directive out. Model of
// NERSA Grid Code demand-reduction / Eskom stage load shedding.
//
// Safety spine is STRUCTURAL, not a guard: curtailment_active is reachable ONLY
// via activate_curtailment, whose ONLY `from` is acknowledged. So an operator can
// NEVER record load as shed against a directive the consumer never acknowledged —
// activate from directive_issued is an ILLEGAL_TRANSITION the engine refuses at
// the state check. Likewise complete_curtailment leaves ONLY restoration_pending,
// so a directive cannot close without passing through restoration.
//
// Critical-stage curtailment (stage ≥ 6) crosses to the regulator: activation is
// guarded by regulatorPresentIfCritical (priority is derived from the stage at
// open, so the guard reads it off the carried txn field).
//
// settles:false — a curtailment directive is a grid operational control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure stage → severity tier (Eskom-style stages 0..8). No clock, no env.
const curtailmentTier = (stage: Json | undefined): string => {
  if (typeof stage !== 'number' || stage <= 0) return 'none';
  if (stage <= 2) return 'low';
  if (stage <= 4) return 'moderate';
  if (stage <= 6) return 'high';
  return 'severe';
};

// pure stage → priority. Stage ≥ 6 is critical → regulator must be on the txn.
const priorityOf = (stage: Json | undefined): string =>
  typeof stage === 'number' && stage >= 6 ? 'critical' : 'normal';

export const loadCurtailment: ChainDecl = {
  key: 'load_curtailment',
  noun: 'Load curtailment directive',
  refPrefix: 'LC',
  title: (f) => `Stage ${(f.shedding_stage as number) ?? '?'} load curtailment — ${(f.consumer_name as string) ?? 'unnamed consumer'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operation Code — demand reduction & load shedding', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's34 security of supply directives', effect: 'authorises' },
  ],
  roles: ['operator', 'consumer', 'regulator'],

  fields: {
    directive_number: { type: 'string', label: 'Directive number' },
    consumer_party: { type: 'party', role: 'consumer', label: 'Consumer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    consumer_name: { type: 'string', required: true, label: 'Consumer name' },
    network_zone: { type: 'string', required: true, label: 'Network zone' },
    shedding_stage: { type: 'number', min: 0, max: 8, label: 'Shedding stage (0-8)' },
    mw_to_shed: { type: 'number', min: 0, label: 'MW to shed' },
    mw_shed_actual: { type: 'number', min: 0, label: 'MW actually shed' },
    restoration_window_minutes: { type: 'number', min: 0, label: 'Restoration window (minutes)' },
    curtailment_tier: { type: 'string', label: 'Curtailment tier' },
    priority: { type: 'string', label: 'Priority' },
    // written by derive, never by the client
    directive_issued_at: { type: 'string', label: 'Directive issued at' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    activated_at: { type: 'string', label: 'Curtailment activated at' },
    restoration_started_at: { type: 'string', label: 'Restoration started at' },
    closed_at_lc: { type: 'string', label: 'Directive closed at' },
  },

  initial: 'directive_issued',

  states: {
    directive_issued: { label: 'Directive issued', terminal: false, holder: 'consumer', sla: { hours: 1 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'consumer', sla: { hours: 1 } },
    curtailment_active: { label: 'Curtailment active', terminal: false, holder: 'operator' },
    restoration_pending: { label: 'Restoration pending', terminal: false, holder: 'operator', sla: { hours: 2 } },
    curtailment_complete: { label: 'Curtailment complete', terminal: true, holder: 'none' },
    directive_cancelled: { label: 'Directive cancelled', terminal: true, holder: 'none' },
    non_compliance: { label: 'Non-compliance', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'directive_issued',
      by: ['operator'],
      actorBecomes: 'operator',
      label: 'Issue directive',
      intent: 'primary',
      input: {
        consumer_party: { type: 'party', role: 'consumer' },
        regulator_party: { type: 'party', role: 'regulator' },
        consumer_name: { type: 'string', required: true },
        network_zone: { type: 'string', required: true },
        shedding_stage: { type: 'number', required: true, min: 0, max: 8 },
        mw_to_shed: { type: 'number', min: 0 },
        restoration_window_minutes: { type: 'number', min: 0 },
      },
      guards: [],
      derive: (f, at: Instant) => ({
        directive_issued_at: isoUtc(at),
        curtailment_tier: curtailmentTier(f.shedding_stage),
        priority: priorityOf(f.shedding_stage),
      }),
    },
    {
      id: 'acknowledge',
      from: 'directive_issued',
      to: 'acknowledged',
      by: ['consumer'],
      label: 'Acknowledge directive',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      // structural safety gate: the ONLY edge into curtailment_active, and it can
      // only fire from acknowledged. Load therefore cannot be recorded as shed
      // against an unacknowledged directive. Critical stages need the regulator.
      id: 'activate_curtailment',
      from: 'acknowledged',
      to: 'curtailment_active',
      by: ['consumer', 'operator'],
      label: 'Activate curtailment',
      intent: 'primary',
      input: { mw_shed_actual: { type: 'number', min: 0 } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ activated_at: isoUtc(at) }),
    },
    {
      id: 'begin_restoration',
      from: 'curtailment_active',
      to: 'restoration_pending',
      by: ['operator'],
      label: 'Begin restoration',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ restoration_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_curtailment',
      from: 'restoration_pending',
      to: 'curtailment_complete',
      by: ['operator'],
      label: 'Close directive',
      intent: 'primary',
      input: { mw_shed_actual: { type: 'number', min: 0 } },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_lc: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'cancel_directive',
      from: ['directive_issued', 'acknowledged', 'curtailment_active'],
      to: 'directive_cancelled',
      by: ['operator'],
      label: 'Cancel directive',
      intent: 'destructive',
      requiresReason: ['stage_lifted', 'grid_recovered', 'issued_in_error', 'superseded'],
      guards: [],
    },
    {
      id: 'record_non_compliance',
      from: ['directive_issued', 'acknowledged', 'curtailment_active'],
      to: 'non_compliance',
      by: ['operator', 'regulator'],
      label: 'Record non-compliance',
      intent: 'destructive',
      requiresReason: ['no_acknowledgement', 'failed_to_shed', 'partial_shed', 'directive_ignored'],
      guards: [],
    },
  ],

  // acknowledge/shed time-bar: a directive left un-actioned past its window is a
  // compliance breach. record-only stub; the sweep computes the real bar off
  // state sla hours (permit_to_work pattern).
  timers: [{ onState: 'directive_issued', after: { hours: 0 }, fire: 'record_non_compliance', kind: 'time_bar' }],
};
