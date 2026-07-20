// regulator_inbox — regulator triage queue for materialised surveillance
// crossings (clearing disclosures, carbon Article 6 postings, surveillance
// alerts ≥ medium severity, licence vary/suspend/revoke, enforcement opens).
//
// A crossing lands as `pending`; the regulator either acknowledges it (closed,
// no follow-up needed), escalates it (optionally opening an enforcement case —
// that case row is a downstream side effect, not modelled here), or dismisses
// it as a false positive. `escalated` is deliberately non-terminal: legacy
// route logic allows `ack` from `escalated` too, so an escalated item can
// still be triaged closed later — it is not a dead end.
//
// Structural honesty (no invented guards): none of the 10 registry guards
// answer a real question for this chain — it carries no counterparty (the
// source entity carries that), no capacity/priority field the strategic or
// hazard gates key off, and no compliance-halt concern (triage must always be
// possible, halt or not). The state graph alone enforces the real rule: only
// `pending` (and, for ack, `escalated`) can move, and every terminal state is
// reached by exactly one edge.
//
// No timers: `sla_due_at` in the legacy table is driven by a per-rule
// `sla_minutes` from oe_regulator_escalation_rules, not a fixed chain-wide
// duration — a single hardcoded Duration would misrepresent it, so it's
// omitted rather than guessed (R-timer-audit safety).
//
// settles:false — a triage record, never money or quantum (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const regulatorInbox: ChainDecl = {
  key: 'regulator_inbox',
  noun: 'Regulator inbox item',
  refPrefix: 'RGIN',
  title: (f) => `Regulator inbox — ${(f.title as string) ?? 'untitled crossing'}`,
  visibility: 'party',
  settles: false,
  roles: ['regulator', 'operator'],

  fields: {
    source_event: { type: 'string', label: 'Source cascade event' },
    source_entity_type: { type: 'string', label: 'Source entity type' },
    source_entity_id: { type: 'string', label: 'Source entity id' },
    severity: { type: 'string', label: 'Severity (low/medium/high/critical)' },
    title: { type: 'string', required: true, label: 'Alert title' },
    body_json: { type: 'string', label: 'Alert detail (JSON)' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator' },
    assigned_to: { type: 'string', label: 'Assigned analyst' },
    ack_note: { type: 'string', label: 'Acknowledgement / dismissal note' },
    escalation_reason: { type: 'string', label: 'Escalation reason' },
    open_case: { type: 'boolean', label: 'Open enforcement case' },
    // written by derive, never by the client
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    escalated_at: { type: 'string', label: 'Escalated at' },
    dismissed_at: { type: 'string', label: 'Dismissed at' },
  },

  initial: 'pending',

  states: {
    pending: { label: 'Pending triage', terminal: false, holder: 'regulator' },
    escalated: { label: 'Escalated', terminal: false, holder: 'regulator' },
    acknowledged: { label: 'Acknowledged', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'pending',
      by: ['regulator', 'operator', 'system'],
      actorBecomes: 'regulator',
      label: 'Log inbox item',
      intent: 'primary',
      input: {
        source_event: { type: 'string' },
        source_entity_type: { type: 'string' },
        source_entity_id: { type: 'string' },
        severity: { type: 'string' },
        title: { type: 'string', required: true },
        body_json: { type: 'string' },
      },
      guards: [],
    },
    {
      // ack works from pending OR escalated — escalated is not a dead end.
      id: 'ack',
      from: ['pending', 'escalated'],
      to: 'acknowledged',
      by: ['regulator', 'operator'],
      label: 'Acknowledge',
      intent: 'primary',
      input: { ack_note: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      id: 'escalate',
      from: 'pending',
      to: 'escalated',
      by: ['regulator', 'operator'],
      label: 'Escalate',
      intent: 'secondary',
      input: {
        escalation_reason: { type: 'string' },
        open_case: { type: 'boolean' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ escalated_at: isoUtc(at) }),
    },
    {
      id: 'dismiss',
      from: 'pending',
      to: 'dismissed',
      by: ['regulator', 'operator'],
      label: 'Dismiss',
      intent: 'destructive',
      input: { ack_note: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ dismissed_at: isoUtc(at) }),
    },
  ],
};
