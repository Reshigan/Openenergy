// kyc — FICA customer due-diligence lifecycle as data.
//
// A condition_of child of participant_onboarding. A compliance officer opens a
// KYC case against a subject, requests external screening, and records the
// vendor's verdict as an INPUT EVENT (receive_verdict + report_hash) — never a
// state jump. FICA does not let us delegate the consequential calls: risk
// rating, beneficial-owner determination, EDD, and admit/decline stay platform
// transitions with a named human actor.
//
// The FICA gate is structural, not a guard: admit_participant leaves ONLY
// decision_pending, and the ONLY path into decision_pending runs through
// risk_rated → verdict_received → receive_verdict. So a participant can NEVER be
// admitted before a vendor verdict is on the log — the state graph enforces it.
//
// settles:false — an admission decision is a compliance control, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure canonicalisation of the client-supplied rating. No clock, no env.
const riskTier = (rating: Json | undefined): string =>
  rating === 'low' || rating === 'medium' || rating === 'high' ? rating : 'unrated';

export const kyc: ChainDecl = {
  key: 'kyc',
  noun: 'KYC case',
  refPrefix: 'KYC',
  title: (f) => `KYC — ${(f.subject_legal_name as string) ?? 'unnamed subject'} (${(f.entity_type as string) ?? 'entity'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'FICA 2001', provision: 's21 customer due diligence + s21B beneficial ownership', effect: 'requires' },
    { instrument: 'POPIA 2013', provision: 'lawful processing of screening data', effect: 'restricts' },
  ],
  roles: ['subject', 'compliance', 'operator'],

  fields: {
    case_ref: { type: 'string', label: 'Case ref' },
    subject_party: { type: 'party', role: 'subject', label: 'Subject participant' },
    subject_legal_name: { type: 'string', required: true, label: 'Subject legal name' },
    entity_type: { type: 'string', required: true, label: 'Entity type (natural_person/juristic)' },
    registration_number: { type: 'string', label: 'Registration / ID number' },
    source_of_funds: { type: 'string', label: 'Declared source of funds' },
    vendor_name: { type: 'string', label: 'Screening vendor' },
    vendor_verdict: { type: 'string', label: 'Vendor verdict (clear/refer/hit)' },
    report_hash: { type: 'string', label: 'Vendor report hash' },
    risk_rating: { type: 'string', label: 'Risk rating (low/medium/high)' },
    risk_tier: { type: 'string', label: 'Risk tier (derived)' },
    edd_required: { type: 'boolean', label: 'EDD required (derived)' },
    edd_evidence_ref: { type: 'string', label: 'EDD evidence ref' },
    beneficial_owners: { type: 'string', label: 'Beneficial owners' },
    bo_verified: { type: 'boolean', label: 'BO verified' },
    // written by derive, never by the client
    verdict_received_at: { type: 'string', label: 'Vendor verdict received at' },
    risk_rated_at: { type: 'string', label: 'Risk rated at' },
    decided_at: { type: 'string', label: 'Decided at' },
  },

  initial: 'kyc_initiated',

  states: {
    kyc_initiated: { label: 'KYC initiated', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    screening_pending: { label: 'Screening pending', terminal: false, holder: 'compliance', sla: { hours: 72 } },
    verdict_received: { label: 'Vendor verdict received', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    risk_rated: { label: 'Risk rated', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    edd_in_progress: { label: 'EDD in progress', terminal: false, holder: 'compliance', sla: { hours: 120 } },
    decision_pending: { label: 'Decision pending', terminal: false, holder: 'compliance', sla: { hours: 48 } },
    admitted: { label: 'Admitted', terminal: true, holder: 'none' },
    declined: { label: 'Declined', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'kyc_initiated',
      by: ['compliance', 'operator'],
      actorBecomes: 'compliance',
      label: 'Open KYC case',
      intent: 'primary',
      input: {
        subject_party: { type: 'party', role: 'subject' },
        subject_legal_name: { type: 'string', required: true },
        entity_type: { type: 'string', required: true },
        registration_number: { type: 'string' },
        source_of_funds: { type: 'string' },
      },
      guards: [],
    },
    {
      id: 'request_screening',
      from: 'kyc_initiated',
      to: 'screening_pending',
      by: ['compliance', 'operator'],
      label: 'Request external screening',
      intent: 'primary',
      input: { vendor_name: { type: 'string', required: true } },
      guards: [],
    },
    {
      // the vendor verdict enters HERE as an input event (+ report hash) — it is
      // recorded, it never decides. The platform decides downstream.
      id: 'receive_verdict',
      from: 'screening_pending',
      to: 'verdict_received',
      by: ['compliance', 'operator'],
      label: 'Record vendor verdict',
      intent: 'primary',
      input: {
        vendor_verdict: { type: 'string', required: true },
        report_hash: { type: 'string', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ verdict_received_at: isoUtc(at) }),
    },
    {
      id: 'assign_risk_rating',
      from: 'verdict_received',
      to: 'risk_rated',
      by: ['compliance'],
      label: 'Assign risk rating',
      intent: 'primary',
      input: { risk_rating: { type: 'string', required: true } },
      guards: [],
      derive: (f, at: Instant) => ({
        risk_tier: riskTier(f.risk_rating),
        edd_required: f.risk_rating === 'high',
        risk_rated_at: isoUtc(at),
      }),
    },
    {
      // low/medium path: beneficial-owner determination straight to decision.
      id: 'determine_bo',
      from: 'risk_rated',
      to: 'decision_pending',
      by: ['compliance'],
      label: 'Determine beneficial owners',
      intent: 'primary',
      input: {
        beneficial_owners: { type: 'string', required: true },
        bo_verified: { type: 'boolean' },
      },
      guards: [],
    },
    {
      // high-risk path: enhanced due diligence before a decision may be reached.
      id: 'begin_edd',
      from: 'risk_rated',
      to: 'edd_in_progress',
      by: ['compliance'],
      label: 'Begin enhanced due diligence',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'complete_edd',
      from: 'edd_in_progress',
      to: 'decision_pending',
      by: ['compliance'],
      label: 'Complete enhanced due diligence',
      intent: 'primary',
      input: {
        edd_evidence_ref: { type: 'string', required: true },
        beneficial_owners: { type: 'string', required: true },
        bo_verified: { type: 'boolean' },
      },
      guards: [],
    },
    {
      // structural FICA gate: the ONLY edge into admitted, and it can only fire
      // from decision_pending — reachable only after a recorded vendor verdict,
      // a risk rating, and BO determination. No guard; the graph is the control.
      id: 'admit_participant',
      from: 'decision_pending',
      to: 'admitted',
      by: ['compliance'],
      label: 'Admit participant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ decided_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'decline_kyc',
      from: ['verdict_received', 'risk_rated', 'edd_in_progress', 'decision_pending'],
      to: 'declined',
      by: ['compliance'],
      label: 'Decline participant',
      intent: 'destructive',
      requiresReason: ['sanctions_hit', 'adverse_media', 'bo_unverifiable', 'source_of_funds_unexplained', 'fraudulent_documents', 'risk_appetite_exceeded'],
      guards: [],
      derive: (_f, at: Instant) => ({ decided_at: isoUtc(at) }),
    },
    {
      id: 'withdraw_case',
      from: ['kyc_initiated', 'screening_pending'],
      to: 'withdrawn',
      by: ['subject', 'compliance', 'operator'],
      label: 'Withdraw case',
      intent: 'destructive',
      requiresReason: ['duplicate_application', 'applicant_request', 'onboarding_abandoned'],
      guards: [],
    },
  ],
};
