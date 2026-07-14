// eop_activation — Emergency Operating Procedure activation lifecycle as data.
//
// A grid/system operator raises an EOP against a network contingency (line trip,
// generator trip, under-frequency, voltage collapse, black-start …), activates
// it, works restoration, returns the grid to normal, then runs a Post-Event
// Review (PER) before the incident closes.
//
// The review spine is STRUCTURAL: the ONLY edge into post_event_review is
// initiate_review, which fires ONLY from normal_restored, and normal_restored is
// reached ONLY via restore_normal from restoration. So an EOP can NEVER be
// review-closed while the grid is still in the emergency — no guard needed, the
// state graph enforces it.
//
// Severity crosses to NERSA: a severe tier (n2_double / black_start) derives
// priority:'critical' at open, and `activate` is guarded by
// regulatorPresentIfCritical — a major contingency cannot be EOP-activated
// without a regulator (NTCSA/NERSA notification) on the txn.
//
// settles:false — an EOP is a grid safety/reliability control, never a payment
// (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the declared tier. No clock, no env.
const isSevere = (tier: Json | undefined): boolean =>
  tier === 'n2_double' || tier === 'black_start';

export const eopActivation: ChainDecl = {
  key: 'eop_activation',
  noun: 'EOP activation',
  refPrefix: 'EA',
  title: (f) => `EOP ${(f.eop_tier as string) ?? 'unclassified'} — ${(f.affected_region as string) ?? 'grid-wide'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'NERSA Grid Code', provision: 'System Operator emergency operating procedures', effect: 'requires' },
    { instrument: 'ERA 2006', provision: 's34 security of supply directives', effect: 'authorises' },
  ],
  roles: ['operator', 'regulator', 'reviewer'],

  fields: {
    incident_ref: { type: 'string', label: 'Incident ref' },
    operator_party: { type: 'party', role: 'operator', label: 'System operator' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    eop_tier: { type: 'string', required: true, label: 'Tier (n1_minor/n1_significant/n2_double/black_start)' },
    contingency_type: { type: 'string', label: 'Contingency type' },
    contingency_description: { type: 'string', required: true, label: 'Contingency description' },
    affected_mw: { type: 'number', min: 0, label: 'Affected MW' },
    affected_region: { type: 'string', label: 'Affected region' },
    load_shedding_stage: { type: 'number', min: 0, max: 8, label: 'Load-shedding stage (0-8)' },
    nersa_notification_ref: { type: 'string', label: 'NERSA notification ref' },
    root_cause: { type: 'string', label: 'Root cause' },
    lessons_learned: { type: 'string', label: 'Lessons learned' },
    // written by derive, never by the client
    priority: { type: 'string', label: 'Derived priority' },
    contingency_at: { type: 'string', label: 'Contingency detected at' },
    eop_activated_at: { type: 'string', label: 'EOP activated at' },
    restoration_started_at: { type: 'string', label: 'Restoration started at' },
    normal_ops_restored_at: { type: 'string', label: 'Normal ops restored at' },
    per_initiated_at: { type: 'string', label: 'PER initiated at' },
    per_completed_at: { type: 'string', label: 'PER completed at' },
  },

  initial: 'contingency_detected',

  states: {
    contingency_detected: { label: 'Contingency detected', terminal: false, holder: 'operator', sla: { minutes: 15 } },
    eop_active: { label: 'EOP active', terminal: false, holder: 'operator', sla: { hours: 2 } },
    restoration: { label: 'Restoration in progress', terminal: false, holder: 'operator', sla: { hours: 8 } },
    normal_restored: { label: 'Normal ops restored', terminal: false, holder: 'operator', sla: { hours: 24 } },
    post_event_review: { label: 'Post-event review', terminal: false, holder: 'operator', sla: { days: 30 } },
    eop_closed: { label: 'EOP closed', terminal: true, holder: 'none' },
    stood_down: { label: 'Stood down', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'contingency_detected',
      by: ['operator'],
      actorBecomes: 'operator',
      label: 'Raise EOP',
      intent: 'primary',
      input: {
        eop_tier: { type: 'string', required: true },
        contingency_type: { type: 'string' },
        contingency_description: { type: 'string', required: true },
        affected_mw: { type: 'number', min: 0 },
        affected_region: { type: 'string' },
        load_shedding_stage: { type: 'number', min: 0, max: 8 },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      // severe tiers cross to NERSA; priority is what regulatorPresentIfCritical reads.
      derive: (f, at: Instant) => ({
        priority: isSevere(f.eop_tier) ? 'critical' : 'normal',
        contingency_at: isoUtc(at),
      }),
    },
    {
      // severity gate: a severe (priority:'critical') EOP cannot activate without
      // a regulator party on the txn — NTCSA/NERSA notification.
      id: 'activate',
      from: 'contingency_detected',
      to: 'eop_active',
      by: ['operator'],
      label: 'Activate EOP',
      intent: 'primary',
      input: { load_shedding_stage: { type: 'number', min: 0, max: 8 } },
      guards: ['regulatorPresentIfCritical'],
      derive: (_f, at: Instant) => ({ eop_activated_at: isoUtc(at) }),
    },
    {
      id: 'begin_restoration',
      from: 'eop_active',
      to: 'restoration',
      by: ['operator'],
      label: 'Begin restoration',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ restoration_started_at: isoUtc(at) }),
    },
    {
      id: 'restore_normal',
      from: 'restoration',
      to: 'normal_restored',
      by: ['operator'],
      label: 'Restore normal operations',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ normal_ops_restored_at: isoUtc(at) }),
    },
    {
      // structural review gate: the ONLY edge into post_event_review, and it fires
      // ONLY from normal_restored. The PER can never open on a grid still in
      // emergency. No guard.
      id: 'initiate_review',
      from: 'normal_restored',
      to: 'post_event_review',
      by: ['operator', 'reviewer'],
      label: 'Initiate post-event review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ per_initiated_at: isoUtc(at) }),
    },
    {
      id: 'complete_review',
      from: 'post_event_review',
      to: 'eop_closed',
      by: ['operator', 'reviewer'],
      label: 'Complete review & close',
      intent: 'primary',
      input: { root_cause: { type: 'string', required: true }, lessons_learned: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ per_completed_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      // false alarm / self-cleared contingency — stand the EOP down without a
      // full restoration cycle. Destructive: needs a structured reason.
      id: 'stand_down',
      from: ['contingency_detected', 'eop_active'],
      to: 'stood_down',
      by: ['operator', 'regulator', 'system'],
      label: 'Stand down',
      intent: 'destructive',
      requiresReason: ['false_alarm', 'self_cleared', 'superseded_incident', 'no_action_required', 'activation_window_elapsed'],
      guards: [],
    },
  ],

  // a detected contingency left unactioned stales — record-only time-bar stub;
  // the sweep computes the real bar off state sla (permit_to_work pattern).
  timers: [{ onState: 'contingency_detected', after: { hours: 4 }, fire: 'stand_down', kind: 'time_bar', reason: 'activation_window_elapsed' }],
};
