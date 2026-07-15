// asset_prognostics — W71 predictive asset health lifecycle as data.
//
// An ML ensemble (anomaly detector + RUL model + fault fingerprinting) opens
// a prediction record against a physical asset. Field/O&M staff (esco,
// support, operator) triage it into a fault diagnosis, plan and dispatch a
// work order, monitor the intervention, and either resolve it cleanly or
// confirm the predicted failure actually happened. Predictions that don't
// warrant action get dismissed or auto-suppressed (noisy model output); ones
// left untouched past the SLA lapse into expired.
//
// Structural honesty (no invented guards):
//  - operator-side prediction record with NO contractual counterparty
//    (legacy registry: counterpartyCol: null) — visibility is 'owner', not
//    'party', and no counterpartyDistinct guard applies (there is no second
//    party to be distinct from).
//  - none of the 10 registry guards model this domain (no compliance halt,
//    no credit/CP approval, no carbon serial range, no strategic-capacity
//    regulator gate) — every transition below carries guards: [] rather than
//    force-fitting an unrelated guard onto an unrelated field.
//  - reopen_recurrence deliberately excludes confirmed_failure: a confirmed
//    failure is a closed factual record, not a stale guess to re-litigate: a
//    genuine recurrence opens a new prediction.
//
// settles:false — revenue_at_risk_zar is an informational estimate the model
// scores the prediction with, never an amount this chain settles (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const assetPrognostics: ChainDecl = {
  key: 'asset_prognostics',
  noun: 'Asset prognostic',
  refPrefix: 'APG',
  title: (f) =>
    `Prognostic — ${(f.asset_label as string) ?? 'unlabeled asset'}${f.fault_mode ? ` (${f.fault_mode as string})` : ''}`,
  visibility: 'owner',
  settles: false,
  roles: ['esco', 'support', 'operator'],

  fields: {
    asset_label: { type: 'string', required: true, label: 'Asset' },
    fault_mode: { type: 'string', label: 'Fault mode' },
    fault_mode_confidence: { type: 'number', min: 0, max: 1, label: 'Fault-mode confidence' },
    revenue_at_risk_zar: { type: 'number', min: 0, label: 'Revenue at risk (ZAR)' },
    safety_implicated: { type: 'boolean', label: 'Safety implicated' },
    predicted_failure_at: { type: 'string', label: 'Predicted failure date' },
    assigned_to: { type: 'string', label: 'Assigned to' },
    notes: { type: 'string', label: 'Notes' },
    work_order_id: { type: 'string', label: 'Linked work order id' },
    resolution_summary: { type: 'string', label: 'Resolution summary' },
    // written by derive, never by the client
    predicted_at: { type: 'string', label: 'Predicted at' },
    triaged_at: { type: 'string', label: 'Triaged at' },
    resolved_at: { type: 'string', label: 'Resolved at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    failure_confirmed_at: { type: 'string', label: 'Failure confirmed at' },
    expired_at: { type: 'string', label: 'Expired at' },
  },

  initial: 'predicted',

  states: {
    predicted: { label: 'Predicted', terminal: false, holder: 'esco', sla: { days: 2 } },
    triaged: { label: 'Triaged', terminal: false, holder: 'esco', sla: { days: 5 } },
    diagnosed: { label: 'Diagnosed', terminal: false, holder: 'esco', sla: { days: 5 } },
    action_planned: { label: 'Action planned', terminal: false, holder: 'esco', sla: { days: 5 } },
    wo_raised: { label: 'Work order raised', terminal: false, holder: 'esco', sla: { days: 14 } },
    monitoring: { label: 'Monitoring', terminal: false, holder: 'esco', sla: { days: 30 } },
    escalated: { label: 'Escalated', terminal: false, holder: 'support', sla: { days: 3 } },
    resolved: { label: 'Resolved', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    auto_suppressed: { label: 'Auto suppressed', terminal: true, holder: 'none' },
    expired: { label: 'Expired', terminal: true, holder: 'none' },
    confirmed_failure: { label: 'Confirmed failure', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'predicted',
      by: ['esco', 'support', 'operator'],
      actorBecomes: 'esco',
      label: 'Log predicted asset fault',
      intent: 'primary',
      input: {
        asset_label: { type: 'string', required: true },
        revenue_at_risk_zar: { type: 'number', min: 0 },
        safety_implicated: { type: 'boolean' },
        predicted_failure_at: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ predicted_at: isoUtc(at) }),
    },
    {
      id: 'triage_prediction',
      from: 'predicted',
      to: 'triaged',
      by: ['esco', 'support', 'operator'],
      label: 'Triage prediction',
      intent: 'primary',
      input: {
        fault_mode: { type: 'string' },
        fault_mode_confidence: { type: 'number', min: 0, max: 1 },
        revenue_at_risk_zar: { type: 'number', min: 0 },
        safety_implicated: { type: 'boolean' },
        predicted_failure_at: { type: 'string' },
        assigned_to: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ triaged_at: isoUtc(at) }),
    },
    {
      id: 'diagnose_root_cause',
      from: 'triaged',
      to: 'diagnosed',
      by: ['esco', 'support', 'operator'],
      label: 'Diagnose root cause',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'plan_action',
      from: 'diagnosed',
      to: 'action_planned',
      by: ['esco', 'support', 'operator'],
      label: 'Plan action',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'raise_work_order',
      from: 'action_planned',
      to: 'wo_raised',
      by: ['esco', 'support', 'operator'],
      label: 'Raise work order',
      intent: 'primary',
      input: {
        work_order_id: { type: 'string' },
        assigned_to: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'begin_monitoring',
      from: 'wo_raised',
      to: 'monitoring',
      by: ['esco', 'support', 'operator'],
      label: 'Begin monitoring',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'confirm_resolved',
      from: ['monitoring', 'escalated'],
      to: 'resolved',
      by: ['esco', 'support', 'operator'],
      label: 'Confirm resolved',
      intent: 'primary',
      input: { resolution_summary: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ resolved_at: isoUtc(at) }),
    },

    // --- escalation and terminal exits, reachable from any live work state ---
    {
      id: 'escalate_prognostic',
      from: ['triaged', 'diagnosed', 'action_planned', 'wo_raised', 'monitoring'],
      to: 'escalated',
      by: ['esco', 'support', 'operator'],
      label: 'Escalate prognostic',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'record_failure',
      from: ['triaged', 'diagnosed', 'action_planned', 'wo_raised', 'monitoring', 'escalated'],
      to: 'confirmed_failure',
      by: ['esco', 'support', 'operator'],
      label: 'Record failure',
      intent: 'destructive',
      input: {
        fault_mode: { type: 'string' },
        revenue_at_risk_zar: { type: 'number', min: 0 },
        safety_implicated: { type: 'boolean' },
        predicted_failure_at: { type: 'string' },
        notes: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ failure_confirmed_at: isoUtc(at) }),
    },
    {
      id: 'dismiss_prediction',
      from: ['predicted', 'triaged', 'diagnosed', 'action_planned'],
      to: 'dismissed',
      by: ['esco', 'support', 'operator'],
      label: 'Dismiss prediction',
      intent: 'destructive',
      input: { resolution_summary: { type: 'string' } },
      guards: [],
    },
    {
      id: 'auto_suppress',
      from: ['predicted', 'triaged'],
      to: 'auto_suppressed',
      by: ['esco', 'support', 'operator'],
      label: 'Auto suppress',
      intent: 'destructive',
      input: { resolution_summary: { type: 'string' } },
      guards: [],
    },
    // no required input + 'system' in `by` so the SLA time-bar below can fire it.
    {
      id: 'expire_prognostic',
      from: ['predicted', 'triaged', 'diagnosed', 'action_planned', 'wo_raised', 'monitoring', 'escalated'],
      to: 'expired',
      by: ['esco', 'support', 'operator', 'system'],
      label: 'Expire prognostic',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ expired_at: isoUtc(at) }),
    },
    {
      id: 'reopen_recurrence',
      from: ['resolved', 'dismissed', 'auto_suppressed', 'expired'],
      to: 'diagnosed',
      by: ['esco', 'support', 'operator'],
      label: 'Reopen recurrence',
      intent: 'secondary',
      guards: [],
    },
  ],

  // a prediction left untriaged for 14 days is stale ML noise, not an
  // actionable case — the sweep expires it rather than let it sit forever.
  timers: [{ onState: 'predicted', after: { days: 14 }, fire: 'expire_prognostic', kind: 'time_bar' }],
};
