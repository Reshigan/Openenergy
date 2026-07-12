// cyber_incident — CSIRT security-incident response lifecycle as data.
//
// A reporter raises a suspected security incident against affected systems; a
// responder (CSIRT lead) runs the NIST-style spine: triage → contain →
// eradicate → recover → close. The response order is structural, not a guard:
// close_incident leaves ONLY `recovered`, recover leaves ONLY `eradicated`,
// eradicate leaves ONLY `contained`. So an incident can NEVER be closed before
// it has been contained, root-caused and recovered — the state graph enforces
// the whole containment discipline; no per-edge check needed.
//
// Critical-priority incidents cross to the regulator: triage is guarded by
// regulatorPresentIfCritical (POPIA §22 breach notification / NERSA directive).
// A critical incident cannot be triaged without a regulator on the txn.
//
// settles:false — an incident record is an operational safety/security control,
// never a payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the numeric score (0..10). No clock, no env.
const severityTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 8) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

export const cyberIncident: ChainDecl = {
  key: 'cyber_incident',
  noun: 'Cyber incident',
  refPrefix: 'CYBE',
  title: (f) =>
    `${(f.incident_category as string) ?? 'security'} incident — ${(f.incident_title as string) ?? 'untitled'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'POPIA 2013', provision: 's22 security-compromise notification', effect: 'requires' },
    { instrument: 'NERSA Grid Code', provision: 'critical-infrastructure cyber directive', effect: 'requires' },
  ],
  roles: ['reporter', 'responder', 'regulator', 'operator'],

  fields: {
    incident_ref: { type: 'string', label: 'Incident ref' },
    reporter_party: { type: 'party', role: 'reporter', label: 'Reporter' },
    responder_party: { type: 'party', role: 'responder', label: 'CSIRT responder' },
    incident_title: { type: 'string', required: true, label: 'Title' },
    incident_description: { type: 'string', required: true, label: 'Description' },
    detection_source: { type: 'string', required: true, label: 'Detection source (SIEM/EDR/report)' },
    affected_systems: { type: 'string', required: true, label: 'Affected systems' },
    suspected_vector: { type: 'string', label: 'Suspected vector' },
    incident_category: { type: 'string', label: 'Category (malware/phishing/dos/breach)' },
    priority: { type: 'string', label: 'Priority (low/medium/high/critical)' },
    severity_score: { type: 'number', min: 0, max: 10, label: 'Severity score (0-10)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    containment_actions: { type: 'string', label: 'Containment actions' },
    root_cause: { type: 'string', label: 'Root cause' },
    eradication_actions: { type: 'string', label: 'Eradication actions' },
    recovery_actions: { type: 'string', label: 'Recovery actions' },
    service_restored: { type: 'boolean', label: 'Service restored' },
    post_incident_review_ref: { type: 'string', label: 'Post-incident review ref' },
    // written by derive, never by the client
    triaged_at: { type: 'string', label: 'Triaged at' },
    contained_at: { type: 'string', label: 'Contained at' },
    eradicated_at: { type: 'string', label: 'Eradicated at' },
    recovered_at: { type: 'string', label: 'Recovered at' },
    closed_at_incident: { type: 'string', label: 'Incident closed at' },
  },

  initial: 'reported',

  states: {
    reported: { label: 'Reported', terminal: false, holder: 'responder', sla: { hours: 1 } },
    triaged: { label: 'Triaged', terminal: false, holder: 'responder', sla: { hours: 4 } },
    contained: { label: 'Contained', terminal: false, holder: 'responder', sla: { hours: 12 } },
    eradicated: { label: 'Eradicated', terminal: false, holder: 'responder', sla: { hours: 24 } },
    recovered: { label: 'Recovered', terminal: false, holder: 'responder', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'reported',
      by: ['reporter', 'operator'],
      actorBecomes: 'reporter',
      label: 'Report incident',
      intent: 'primary',
      input: {
        incident_title: { type: 'string', required: true },
        incident_description: { type: 'string', required: true },
        detection_source: { type: 'string', required: true },
        affected_systems: { type: 'string', required: true },
        suspected_vector: { type: 'string' },
        incident_category: { type: 'string' },
        responder_party: { type: 'party', role: 'responder' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'triage',
      from: 'reported',
      to: 'triaged',
      by: ['responder', 'operator'],
      label: 'Triage incident',
      intent: 'primary',
      input: {
        priority: { type: 'string', required: true },
        severity_score: { type: 'number', min: 0, max: 10 },
        incident_category: { type: 'string' },
      },
      // critical-priority incidents cross to the regulator (POPIA/NERSA).
      guards: ['regulatorPresentIfCritical'],
      derive: (f, at: Instant) => ({ severity_tier: severityTier(f.severity_score), triaged_at: isoUtc(at) }),
    },
    {
      id: 'contain',
      from: 'triaged',
      to: 'contained',
      by: ['responder'],
      label: 'Contain',
      intent: 'primary',
      input: { containment_actions: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ contained_at: isoUtc(at) }),
    },
    {
      id: 'eradicate',
      from: 'contained',
      to: 'eradicated',
      by: ['responder'],
      label: 'Eradicate',
      intent: 'primary',
      input: {
        root_cause: { type: 'string', required: true },
        eradication_actions: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ eradicated_at: isoUtc(at) }),
    },
    {
      id: 'recover',
      from: 'eradicated',
      to: 'recovered',
      by: ['responder'],
      label: 'Recover service',
      intent: 'primary',
      input: {
        recovery_actions: { type: 'string', required: true },
        service_restored: { type: 'boolean' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ recovered_at: isoUtc(at) }),
    },
    {
      // structural gate: the ONLY edge into `closed`, and it can only fire from
      // `recovered` — which recover reaches only from eradicated→contained. An
      // incident therefore cannot be closed before the full response ran.
      id: 'close_incident',
      from: 'recovered',
      to: 'closed',
      by: ['responder'],
      label: 'Close incident',
      intent: 'primary',
      input: { post_incident_review_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_incident: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dismiss',
      from: ['reported', 'triaged'],
      to: 'dismissed',
      by: ['responder'],
      label: 'Dismiss incident',
      intent: 'destructive',
      requiresReason: ['false_positive', 'duplicate', 'not_security_relevant', 'test_activity'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['reported'],
      to: 'withdrawn',
      by: ['reporter'],
      label: 'Withdraw report',
      intent: 'destructive',
      requiresReason: ['raised_in_error', 'superseded', 'no_longer_relevant'],
      guards: [],
    },
  ],

  // triage-SLA time-bar: a reported incident left un-triaged breaches the
  // acknowledgement window (a live compromise cannot sit unowned). record-only
  // stub; the sweep computes the real deadline off state sla hours.
  timers: [{ onState: 'reported', after: { hours: 0 }, fire: 'triage', kind: 'sla' }],
};
