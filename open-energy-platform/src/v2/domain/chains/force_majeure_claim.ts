// force_majeure_claim — a PPA/EPC force majeure claim lifecycle as data.
//
// An affected party notifies a supervening event (flood, strike, grid outage)
// that impedes performance; the counterparty assesses it and either grants
// relief (suspending/excusing the obligation for the event's duration) or
// denies it. The affected party may withdraw the claim before it is assessed.
//
// The relief spine is STRUCTURAL, not a guard: relief_granted is reachable
// ONLY from assessed (via grant_relief), and assessed is reachable ONLY from
// under_assessment (via complete_assessment). So relief can NEVER be granted on
// a bare notice — the counterparty's assessment must be on record first. Firing
// grant_relief from under_assessment is an ILLEGAL_TRANSITION (engine step-4),
// refused before any guard runs.
//
// counterpartyDistinct blocks self-dealing at @new (an affected party naming
// itself as its own counterparty). completenessEvidencePresent forces a final
// evidence packet ref at grant_relief (Pattern A: present-but-not-required, so
// an absent ref surfaces MISSING_COMPLETENESS_EVIDENCE, not a generic BAD_INPUT).
//
// settles:false — a force majeure claim is a notice/relief record; nothing moves
// through THIS chain. Any tariff adjustment settles on the PPA it excuses (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const forceMajeureClaim: ChainDecl = {
  key: 'force_majeure_claim',
  noun: 'Force majeure claim',
  refPrefix: 'FMAJ',
  title: (f) =>
    `Force majeure — ${(f.affected_party_name as string) ?? 'affected party'} / ${(f.contract_ref as string) ?? 'contract'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'South African common law', provision: 'supervening impossibility of performance (vis maior / casus fortuitus)', effect: 'authorises' },
    { instrument: 'ERA 2006', provision: 'licensed-activity continuity of supply obligations', effect: 'requires' },
  ],
  roles: ['affected_party', 'counterparty', 'operator'],

  fields: {
    contract_ref: { type: 'string', label: 'Underlying contract ref' },
    affected_party_name: { type: 'string', required: true, label: 'Affected party' },
    counterparty_name: { type: 'string', label: 'Counterparty' },
    counterparty_party: { type: 'party', role: 'counterparty', label: 'Counterparty participant' },
    event_description: { type: 'string', label: 'Force majeure event' },
    event_onset_date: { type: 'string', label: 'Event onset date' },
    completeness_ref: { type: 'string', label: 'Relief evidence-packet ref' },
    // written by derive, never by the client
    relief_granted_at: { type: 'string', label: 'Relief granted at' },
  },

  initial: 'notified',

  states: {
    notified: { label: 'Notified', terminal: false, holder: 'counterparty', sla: { days: 7 } },
    under_assessment: { label: 'Under assessment', terminal: false, holder: 'counterparty', sla: { days: 14 } },
    assessed: { label: 'Assessed', terminal: false, holder: 'counterparty', sla: { days: 5 } },
    relief_granted: { label: 'Relief granted', terminal: true, holder: 'none' },
    relief_denied: { label: 'Relief denied', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'notified',
      by: ['affected_party', 'operator'],
      actorBecomes: 'affected_party',
      label: 'Notify force majeure event',
      intent: 'primary',
      input: {
        contract_ref: { type: 'string' },
        affected_party_name: { type: 'string', required: true },
        counterparty_name: { type: 'string' },
        counterparty_party: { type: 'party', role: 'counterparty' },
        // a genuine mandatory payload not read by any guard: an absent event
        // description is a legitimate BAD_INPUT (you cannot claim FM with nothing).
        event_description: { type: 'string', required: true },
        event_onset_date: { type: 'string' },
      },
      // no self-dealing: the affected party and its counterparty must be distinct.
      guards: ['counterpartyDistinct'],
    },

    // --- happy path -----------------------------------------------------------
    {
      id: 'begin_assessment',
      from: 'notified',
      to: 'under_assessment',
      by: ['counterparty', 'operator'],
      label: 'Begin assessment',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_assessment',
      from: 'under_assessment',
      to: 'assessed',
      by: ['counterparty', 'operator'],
      label: 'Complete assessment',
      intent: 'primary',
      guards: [],
    },
    {
      // structural relief gate: the ONLY edge into relief_granted, and it can only
      // fire from assessed — which only complete_assessment reaches. Relief can
      // therefore NEVER be granted on a bare notice. A final evidence-packet ref
      // rides completenessEvidencePresent (Pattern A: present-but-not-required).
      id: 'grant_relief',
      from: 'assessed',
      to: 'relief_granted',
      by: ['counterparty', 'operator'],
      label: 'Grant relief',
      intent: 'primary',
      input: {
        completeness_ref: { type: 'string' },
      },
      guards: ['completenessEvidencePresent'],
      derive: (_f, at: Instant) => ({ relief_granted_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'deny_relief',
      from: 'assessed',
      to: 'relief_denied',
      by: ['counterparty', 'operator'],
      label: 'Deny relief',
      intent: 'destructive',
      requiresReason: ['not_supervening', 'foreseeable_risk', 'self_induced', 'mitigation_available'],
      guards: [],
    },
    {
      id: 'withdraw_claim',
      from: ['notified', 'under_assessment'],
      to: 'withdrawn',
      by: ['affected_party', 'operator'],
      label: 'Withdraw claim',
      intent: 'destructive',
      requiresReason: ['event_resolved', 'performance_resumed', 'claim_in_error'],
      guards: [],
    },
  ],

  // assessment time-bar: an unassessed notice stales out. Record-only stub — the
  // sweep computes the real bar off the state sla days (isda_agreement pattern).
  timers: [{ onState: 'notified', after: { days: 0 }, fire: 'withdraw_claim', kind: 'time_bar' }],
};
