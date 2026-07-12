// hse_incident — health-safety-environment incident lifecycle as data.
//
// A reporter (on-site O&M/EPC worker) logs an incident against a site; an HSE
// investigator classifies it, investigates, assigns corrective actions and only
// then closes it. The safety spine is structural: close_incident ONLY leaves
// corrective_actions_verified, and the ONLY path into that state is
// verify_actions. So an incident can NEVER be closed while corrective actions
// are merely assigned-but-unverified — no guard needed, the state graph enforces
// it. A critical-priority incident (OHS Act s24 reportable class) also crosses to
// the regulator: classify is guarded by regulatorPresentIfCritical.
//
// settles:false — an incident record is an operational safety control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure severity bucketing off the numeric score (0..10). No clock, no env.
const severityTier = (score: Json | undefined): string => {
  if (typeof score !== 'number') return 'unassessed';
  if (score >= 8) return 'major';
  if (score >= 4) return 'serious';
  return 'minor';
};

export const hseIncident: ChainDecl = {
  key: 'hse_incident',
  noun: 'HSE incident',
  refPrefix: 'HI',
  title: (f) => `${(f.incident_type as string) ?? 'incident'} — ${(f.site_name as string) ?? 'unnamed site'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'OHS Act 1993', provision: 's24 reporting of certain incidents to the Provincial Director', effect: 'requires' },
    { instrument: 'OHS Act 1993', provision: 'General Administrative Regs — incident investigation & records', effect: 'requires' },
  ],
  roles: ['reporter', 'investigator', 'regulator', 'operator'],

  fields: {
    incident_number: { type: 'string', label: 'Incident number' },
    reporter_party: { type: 'party', role: 'reporter', label: 'Reporter' },
    investigator_party: { type: 'party', role: 'investigator', label: 'HSE investigator' },
    site_name: { type: 'string', required: true, label: 'Site' },
    location: { type: 'string', label: 'Location on site' },
    incident_datetime: { type: 'string', label: 'When it occurred' },
    incident_type: { type: 'string', required: true, label: 'Type (injury/near_miss/environmental/property)' },
    description: { type: 'string', required: true, label: 'What happened' },
    injury_count: { type: 'number', min: 0, label: 'Number injured' },
    severity_score: { type: 'number', min: 0, max: 10, label: 'Severity score (0-10)' },
    severity_tier: { type: 'string', label: 'Severity tier' },
    priority: { type: 'string', label: 'Priority (low/medium/high/critical)' },
    reportable: { type: 'boolean', label: 'OHS s24 reportable' },
    root_cause: { type: 'string', label: 'Root cause' },
    corrective_action_ref: { type: 'string', label: 'Corrective action ref' },
    // written by derive, never by the client
    classified_at: { type: 'string', label: 'Classified at' },
    investigated_at: { type: 'string', label: 'Root cause identified at' },
    verified_at: { type: 'string', label: 'Corrective actions verified at' },
    closed_at_hse: { type: 'string', label: 'Incident closed at' },
  },

  initial: 'reported',

  states: {
    reported: { label: 'Reported', terminal: false, holder: 'investigator', sla: { hours: 24 } },
    triaged: { label: 'Triaged', terminal: false, holder: 'investigator', sla: { hours: 72 } },
    investigating: { label: 'Investigating', terminal: false, holder: 'investigator', sla: { days: 7 } },
    root_cause_identified: { label: 'Root cause identified', terminal: false, holder: 'investigator', sla: { hours: 48 } },
    corrective_actions_assigned: { label: 'Corrective actions assigned', terminal: false, holder: 'investigator', sla: { days: 14 } },
    corrective_actions_verified: { label: 'Corrective actions verified', terminal: false, holder: 'investigator', sla: { hours: 24 } },
    closed: { label: 'Closed', terminal: true, holder: 'none' },
    dismissed: { label: 'Dismissed', terminal: true, holder: 'none' },
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
        site_name: { type: 'string', required: true },
        location: { type: 'string' },
        incident_datetime: { type: 'string' },
        incident_type: { type: 'string', required: true },
        description: { type: 'string', required: true },
        injury_count: { type: 'number', min: 0 },
        investigator_party: { type: 'party', role: 'investigator' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'classify',
      from: 'reported',
      to: 'triaged',
      by: ['investigator', 'operator'],
      label: 'Classify incident',
      intent: 'primary',
      input: {
        priority: { type: 'string', required: true },
        severity_score: { type: 'number', min: 0, max: 10 },
        reportable: { type: 'boolean' },
      },
      // a critical (s24 reportable) incident needs a regulator on the txn.
      guards: ['regulatorPresentIfCritical'],
      derive: (f, at: Instant) => ({ severity_tier: severityTier(f.severity_score), classified_at: isoUtc(at) }),
    },
    {
      id: 'open_investigation',
      from: 'triaged',
      to: 'investigating',
      by: ['investigator'],
      label: 'Open investigation',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'record_root_cause',
      from: 'investigating',
      to: 'root_cause_identified',
      by: ['investigator'],
      label: 'Record root cause',
      intent: 'primary',
      input: { root_cause: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ investigated_at: isoUtc(at) }),
    },
    {
      id: 'assign_actions',
      from: 'root_cause_identified',
      to: 'corrective_actions_assigned',
      by: ['investigator'],
      label: 'Assign corrective actions',
      intent: 'primary',
      input: { corrective_action_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // structural safety gate: the ONLY edge into corrective_actions_verified,
      // and the ONLY edge out of it is close_incident. So an incident cannot be
      // closed while corrective actions are merely assigned but not verified. No
      // guard — the state graph enforces it.
      id: 'verify_actions',
      from: 'corrective_actions_assigned',
      to: 'corrective_actions_verified',
      by: ['investigator'],
      label: 'Verify corrective actions',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'close_incident',
      from: 'corrective_actions_verified',
      to: 'closed',
      by: ['investigator'],
      label: 'Close incident',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ closed_at_hse: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'dismiss',
      from: ['reported', 'triaged'],
      to: 'dismissed',
      by: ['investigator', 'operator'],
      label: 'Dismiss report',
      intent: 'destructive',
      requiresReason: ['not_work_related', 'duplicate_report', 'no_incident_occurred', 'insufficient_information'],
      guards: [],
    },
  ],

  // triage SLA: a reported incident awaiting classification stales out (a fresh
  // report cannot sit unassessed). record-only stub; the sweep computes the real
  // bar off state sla hours (permit_to_work pattern).
  timers: [{ onState: 'reported', after: { hours: 0 }, fire: 'classify', kind: 'sla' }],
};
