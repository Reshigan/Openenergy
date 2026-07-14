// ppa_termination — the notice-and-cure lifecycle for terminating a PPA, as data.
//
// A terminating party (IPP or offtaker) serves a termination notice with a
// structured ground (breach / payment default / insolvency / …). The notice
// opens a contractual cure period; the counterparty may remedy the breach
// within it. If they remedy → cured → the terminating party withdraws the
// notice (or disputes the cure and the clock runs on). If the cure period
// lapses unremedied, the termination is EFFECTED.
//
// STRUCTURAL FAIRNESS GATE: `terminated` has exactly ONE inbound edge, from
// `cure_period`. There is NO edge notified→terminated and NO edge
// cured→terminated. So a termination can never be effected without a cure
// window first being opened, and a breach that has been remedied (cured) can
// never be unilaterally terminated — the notice must be withdrawn or the cure
// disputed back into cure_period. The state graph enforces due process; no
// guard is needed for it.
//
// Strategic PPAs (≥100 MW) cannot be terminated without a regulator on the txn
// — enforced by the existing regulatorPresentIfStrategic guard reading the
// carried capacity_mw field. The regulator party must therefore be attached at
// @new (parties only attach at open).
//
// settles:false — a termination records a change to a bilateral commitment; no
// money moves through this chain. Any break fee / settlement is a downstream
// concern of a separate settlement chain (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc, addDuration } from '../time';

// pure: cure deadline = event instant + cure_period_days (default 30). Uses the
// injected instant only — no clock, no argless Date.
function cureDeadline(fields: Record<string, Json>, at: Instant): string {
  const days = typeof fields.cure_period_days === 'number' ? fields.cure_period_days : 30;
  return isoUtc(addDuration(at, { days }));
}

export const ppaTermination: ChainDecl = {
  key: 'ppa_termination',
  noun: 'PPA termination',
  refPrefix: 'PTRM',
  title: (f) => `PPA termination — ${(f.offtaker_name as string) ?? (f.ppa_ref as string) ?? 'unnamed'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 's34 generation licence conditions', effect: 'restricts' },
    { instrument: 'NERSA Grid Code', provision: 'PPA registration & deregistration', effect: 'requires' },
    { instrument: 'PPA', provision: 'termination for cause & cure period', effect: 'authorises' },
  ],
  roles: ['terminating', 'counterparty', 'regulator', 'operator'],

  fields: {
    ppa_ref: { type: 'string', required: true, label: 'PPA reference' },
    offtaker_name: { type: 'string', label: 'Offtaker' },
    capacity_mw: { type: 'number', min: 0, label: 'Capacity (MW)' },
    cure_period_days: { type: 'number', min: 0, label: 'Cure period (days)' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    remedy_evidence_ref: { type: 'string', label: 'Remedy evidence ref' },
    // written by derive, never by the client
    notified_at: { type: 'string', label: 'Notice served at' },
    cure_started_at: { type: 'string', label: 'Cure period started at' },
    cure_deadline: { type: 'string', label: 'Cure deadline' },
    remedied_at: { type: 'string', label: 'Breach remedied at' },
    terminated_at: { type: 'string', label: 'Terminated at' },
    withdrawn_at: { type: 'string', label: 'Notice withdrawn at' },
  },

  initial: 'notified',

  states: {
    notified: { label: 'Notice served', terminal: false, holder: 'counterparty', sla: { days: 5 } },
    cure_period: { label: 'Cure period running', terminal: false, holder: 'counterparty', sla: { days: 30 } },
    cured: { label: 'Breach remedied', terminal: false, holder: 'terminating', sla: { days: 10 } },
    // terminal states — NO SETTLEMENT FINALITY — RECORD ONLY (any break fee is a
    // downstream settlement chain's concern; this chain moves no money).
    terminated: { label: 'Terminated', terminal: true, holder: 'none' },
    withdrawn: { label: 'Notice withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    // --- notice ---------------------------------------------------------------
    {
      id: 'open',
      from: '@new',
      to: 'notified',
      by: ['terminating', 'operator'],
      actorBecomes: 'terminating',
      label: 'Serve termination notice',
      intent: 'primary',
      input: {
        ppa_ref: { type: 'string', required: true },
        offtaker_name: { type: 'string' },
        capacity_mw: { type: 'number', min: 0 },
        cure_period_days: { type: 'number', min: 0 },
        counterparty_party: { type: 'party', role: 'counterparty' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      requiresReason: [
        'material_breach',
        'payment_default',
        'insolvency',
        'prolonged_force_majeure',
        'regulatory_direction',
        'mutual_agreement',
      ],
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ notified_at: isoUtc(at) }),
    },

    // --- cure loop ------------------------------------------------------------
    {
      id: 'commence_cure',
      from: 'notified',
      to: 'cure_period',
      by: ['terminating', 'operator'],
      label: 'Open cure period',
      intent: 'primary',
      input: { cure_period_days: { type: 'number', min: 0 } },
      guards: [],
      derive: (f, at: Instant) => ({ cure_started_at: isoUtc(at), cure_deadline: cureDeadline(f, at) }),
    },
    {
      id: 'remedy_breach',
      from: 'cure_period',
      to: 'cured',
      by: ['counterparty', 'operator'],
      label: 'Remedy breach',
      intent: 'primary',
      input: { remedy_evidence_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ remedied_at: isoUtc(at) }),
    },
    {
      id: 'reject_cure',
      from: 'cured',
      to: 'cure_period',
      by: ['terminating', 'operator'],
      label: 'Dispute cure',
      intent: 'secondary',
      requiresReason: ['cure_incomplete', 'cure_unverified', 'breach_persists'],
      guards: [],
      // clock re-opens from the dispute instant.
      derive: (f, at: Instant) => ({ cure_started_at: isoUtc(at), cure_deadline: cureDeadline(f, at) }),
    },

    // --- effect (structural gate: ONLY from cure_period) ----------------------
    {
      id: 'effect_termination',
      from: 'cure_period',
      to: 'terminated',
      by: ['terminating', 'regulator', 'operator'],
      label: 'Effect termination',
      intent: 'destructive',
      // strategic PPAs need a regulator on the txn before termination can bite.
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ terminated_at: isoUtc(at) }),
    },
    // cure period lapsed unremedied → system effects the termination on the bar.
    {
      id: 'auto_effect_on_lapse',
      from: 'cure_period',
      to: 'terminated',
      by: ['system'],
      label: 'Auto-effect on cure lapse',
      intent: 'destructive',
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ terminated_at: isoUtc(at) }),
    },

    // --- withdrawal / cure accepted ------------------------------------------
    {
      id: 'accept_cure',
      from: 'cured',
      to: 'withdrawn',
      by: ['terminating', 'operator', 'system'],
      label: 'Accept cure & withdraw notice',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_notice',
      from: ['notified', 'cure_period'],
      to: 'withdrawn',
      by: ['terminating', 'operator'],
      label: 'Withdraw notice',
      intent: 'destructive',
      requiresReason: ['served_in_error', 'notice_defective', 'mutual_resolution', 'commercial_settlement'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],

  // cure-period time_bar: an unremedied cure window lapses and the termination is
  // effected (default cure_period_days = 30); a cure the terminating party sits on
  // for 10 days is deemed accepted and the notice withdraws.
  timers: [
    { onState: 'cure_period', after: { days: 30 }, fire: 'auto_effect_on_lapse', kind: 'time_bar' },
    { onState: 'cured', after: { days: 10 }, fire: 'accept_cure', escalate: 'terminating', kind: 'sla' },
  ],
};
