// data_subject_request — POPIA data-subject-request lifecycle as data.
//
// A privacy/information officer receives a request from a data subject (access,
// correction, deletion, objection, portability, restriction), then runs the
// statutory spine: acknowledge → verify identity → map data → legal assessment
// → draft response → fulfil / partial-disclose / refuse / erase.
//
// The safety spine is STRUCTURAL, not a guard: map_data leaves ONLY
// identity_verified, and the only path into identity_verified is verify_identity
// from acknowledged. So personal data can NEVER be mapped or disclosed before
// the requester's identity is verified (POPIA §26) — the state graph enforces
// it, no guard needed. Every disclosure/erasure/refusal exit carries a reason
// code, so the outcome ground is always in the log (POPIA §14 access-log intent).
//
// settles:false — a data-subject request is a compliance obligation, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure statutory-clock bucketing off request_type. No clock, no env, no random.
// POPIA gives access/portability the standard "reasonable time"; deletion &
// objection are shorter because they suspend ongoing processing.
const slaDaysFor = (requestType: Json | undefined): number => {
  switch (requestType) {
    case 'deletion':
    case 'objection':
    case 'restriction':
      return 14;
    case 'correction':
      return 21;
    default:
      return 30; // access, portability
  }
};

export const dataSubjectRequest: ChainDecl = {
  key: 'data_subject_request',
  noun: 'Data-subject request',
  refPrefix: 'DSR',
  title: (f) => `${(f.request_type as string) ?? 'access'} DSR — ${(f.requester_name as string) ?? 'unnamed subject'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'POPIA 2013', provision: 's23–s25 data-subject rights + s26 identity verification', effect: 'requires' },
    { instrument: 'POPIA 2013', provision: 's14 records of processing / access log', effect: 'requires' },
    { instrument: 'PAIA 2000', provision: 's11 grounds for refusal', effect: 'authorises' },
  ],
  roles: ['officer', 'subject', 'regulator'],

  fields: {
    requester_name: { type: 'string', required: true, label: 'Requester name' },
    requester_email: { type: 'string', required: true, label: 'Requester email' },
    requester_id_ref: { type: 'string', label: 'Requester ID/passport ref' },
    relationship: { type: 'string', required: true, label: 'Relationship (data_subject/authorised_representative/guardian)' },
    request_type: { type: 'string', required: true, label: 'Type (access/correction/deletion/objection/portability/restriction)' },
    officer_party: { type: 'party', role: 'officer', label: 'Information officer' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Information Regulator' },
    data_categories: { type: 'string', label: 'Data categories (JSON array)' },
    systems_involved: { type: 'string', label: 'Systems involved (JSON array)' },
    identity_evidence_ref: { type: 'string', label: 'Identity evidence ref' },
    response_ref: { type: 'string', label: 'Response reference issued to subject' },
    legal_ground: { type: 'string', label: 'Legal ground (POPIA/PAIA)' },
    ir_notified: { type: 'boolean', label: 'Information Regulator notified' },
    // computed by derive, never written by the client
    sla_days: { type: 'number', label: 'Statutory SLA (days)' },
    acknowledged_at: { type: 'string', label: 'Acknowledged at' },
    identity_verified_at: { type: 'string', label: 'Identity verified at' },
    fulfilled_at: { type: 'string', label: 'Fulfilled at' },
    erasure_completed_at: { type: 'string', label: 'Erasure completed at' },
  },

  initial: 'received',

  states: {
    received: { label: 'Received', terminal: false, holder: 'officer', sla: { hours: 24 } },
    acknowledged: { label: 'Acknowledged', terminal: false, holder: 'officer', sla: { days: 3 } },
    identity_verified: { label: 'Identity verified', terminal: false, holder: 'officer', sla: { days: 3 } },
    data_mapped: { label: 'Data mapped', terminal: false, holder: 'officer', sla: { days: 7 } },
    legal_assessment: { label: 'Legal assessment', terminal: false, holder: 'officer', sla: { days: 7 } },
    response_drafted: { label: 'Response drafted', terminal: false, holder: 'officer', sla: { days: 5 } },
    fulfilled: { label: 'Fulfilled', terminal: true, holder: 'none' },
    partial_disclosure: { label: 'Partial disclosure', terminal: true, holder: 'none' },
    erasure_completed: { label: 'Erasure completed', terminal: true, holder: 'none' },
    refused: { label: 'Refused', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'received',
      by: ['officer', 'subject'],
      actorBecomes: 'officer',
      label: 'Log request',
      intent: 'primary',
      input: {
        requester_name: { type: 'string', required: true },
        requester_email: { type: 'string', required: true },
        requester_id_ref: { type: 'string' },
        relationship: { type: 'string', required: true },
        request_type: { type: 'string', required: true },
        data_categories: { type: 'string' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
      derive: (f, _at: Instant) => ({ sla_days: slaDaysFor(f.request_type) }),
    },
    {
      id: 'acknowledge',
      from: 'received',
      to: 'acknowledged',
      by: ['officer'],
      label: 'Acknowledge receipt',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ acknowledged_at: isoUtc(at) }),
    },
    {
      // structural POPIA §26 gate: the ONLY edge into identity_verified. Since
      // map_data can only fire from identity_verified, personal data cannot be
      // mapped or disclosed before identity is verified. No guard — the graph is
      // the control.
      id: 'verify_identity',
      from: 'acknowledged',
      to: 'identity_verified',
      by: ['officer'],
      label: 'Verify requester identity',
      intent: 'primary',
      input: { identity_evidence_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ identity_verified_at: isoUtc(at) }),
    },
    {
      id: 'map_data',
      from: 'identity_verified',
      to: 'data_mapped',
      by: ['officer'],
      label: 'Map subject data',
      intent: 'primary',
      input: { systems_involved: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'assess_legal',
      from: 'data_mapped',
      to: 'legal_assessment',
      by: ['officer'],
      label: 'Assess legal grounds',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'draft_response',
      from: 'legal_assessment',
      to: 'response_drafted',
      by: ['officer'],
      label: 'Draft response',
      intent: 'primary',
      input: { response_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'fulfil',
      from: 'response_drafted',
      to: 'fulfilled',
      by: ['officer'],
      label: 'Fulfil request',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ fulfilled_at: isoUtc(at) }),
    },
    {
      id: 'complete_erasure',
      from: 'response_drafted',
      to: 'erasure_completed',
      by: ['officer'],
      label: 'Complete erasure',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ erasure_completed_at: isoUtc(at) }),
    },

    // --- outcome exits (each stamps a ground into the log) --------------------
    {
      id: 'partial_disclose',
      from: 'response_drafted',
      to: 'partial_disclosure',
      by: ['officer'],
      label: 'Partially disclose',
      intent: 'secondary',
      requiresReason: ['third_party_data', 'legal_privilege', 'ongoing_investigation', 'disproportionate_effort'],
      guards: [],
    },
    {
      id: 'refuse',
      from: ['data_mapped', 'legal_assessment'],
      to: 'refused',
      by: ['officer'],
      label: 'Refuse request',
      intent: 'destructive',
      requiresReason: ['paia_s11_exemption', 'identity_unverified', 'manifestly_unfounded', 'excessive_repetitive', 'no_personal_data_held'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['received', 'acknowledged', 'identity_verified', 'data_mapped', 'legal_assessment', 'response_drafted'],
      to: 'withdrawn',
      by: ['officer'],
      label: 'Record withdrawal',
      intent: 'destructive',
      requiresReason: ['subject_withdrew', 'duplicate_request', 'resolved_out_of_band'],
      guards: [],
    },
  ],

  // statutory response clock — a received request left unacknowledged escalates.
  // record-only stub; the sweep computes the real deadline off state sla hours
  // and the derived sla_days (ppa_contract pattern).
  timers: [{ onState: 'received', after: { hours: 0 }, fire: 'acknowledge', kind: 'sla' }],
};
