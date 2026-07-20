// kyc_verification — Wave 198 participant KYC / FICA entity-verification
// lifecycle as data (legacy: src/routes/kyc-chain.ts + src/utils/kyc-spec.ts,
// table oe_kyc_verifications).
//
// Distinct from the `kyc` chain: `kyc` is a compliance officer's case-opening
// due-diligence assessment (vendor screening → risk rating → admit/decline).
// `kyc_verification` is the participant-facing document/screening pipeline
// that produces the input the `kyc` case ultimately decides on — a
// document-submission and screening state machine, not a case file.
//
// Regulatory basis: FICA 38/2001 s21 (risk-based customer due diligence),
// FIC Guidance Note 7 (electronic ID verification), POPIA (lawful processing
// of biometric/identity data).
//
// Structural honesty (no invented guards):
//  - `verify`/`lift_conditions` are the ONLY edges into `verified`, and both
//    are reachable ONLY from `compliance_review` or `conditionally_approved` —
//    which in turn are reachable only after documents_received (confirmed
//    receipt of a submitted document set) and a screening/EDD step. So a
//    participant can NEVER be verified without submitting documents and
//    passing through screening — the state graph enforces it, no guard
//    required.
//  - `verify`, `lift_conditions`, `approve_conditionally` and `reinstate`
//    (every edge that admits or re-admits a participant) are guarded by
//    complianceHaltClear: a platform-wide compliance halt (FIC/NERSA
//    directive) blocks new admissions. `reject`/`suspend`/`mark_lapsed`
//    (de-risking) are never blocked by a halt.
//  - v1's transition table lists `suspend` as reachable from `verified`, but
//    v1's route checks KYC_HARD_TERMINALS (which includes `verified`) BEFORE
//    consulting that table, so that path is dead code in production. This
//    chain keeps `verified` terminal (matching the legacy descriptor's
//    `terminal` list) and omits it from `suspend.from`, matching what v1
//    actually executes rather than what its transition table merely lists.
//
// settles:false — a KYC verification is a compliance/admission record; it
// never moves money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc, addDuration } from '../time';

// INVERTED SLA — higher risk gets MORE time for deeper scrutiny (mirrors
// KYC_SLA_DAYS in src/utils/kyc-spec.ts). Pure over the risk_level field.
const slaDaysForRisk = (riskLevel: unknown): number => {
  switch (riskLevel) {
    case 'medium': return 10;
    case 'high_risk': return 20;
    case 'pep': return 30;
    default: return 5; // standard
  }
};

export const kycVerification: ChainDecl = {
  key: 'kyc_verification',
  noun: 'KYC verification',
  refPrefix: 'KYCV',
  title: (f) =>
    `KYC verification — ${(f.participant_name as string) ?? 'unnamed participant'} (${(f.risk_level as string) ?? 'standard'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Financial Intelligence Centre Act 38 of 2001', provision: 's21 customer due diligence + s21B beneficial ownership', effect: 'requires' },
    { instrument: 'Protection of Personal Information Act 4 of 2013', provision: 'lawful processing of identity/biometric verification data', effect: 'restricts' },
  ],
  roles: ['participant', 'compliance', 'operator'],

  fields: {
    participant_party: { type: 'party', role: 'participant', label: 'Participant' },
    participant_name: { type: 'string', label: 'Participant name' },
    entity_type: { type: 'string', label: 'Entity type (individual/company/trust/fund/foreign_entity)' },
    risk_level: { type: 'string', label: 'Risk level (standard/medium/high_risk/pep)' },
    edd_report_ref: { type: 'string', label: 'EDD report reference' },
    conditions_text: { type: 'string', label: 'Conditions (for conditional approval)' },
    pep_match: { type: 'boolean', label: 'PEP match' },
    sanctions_match: { type: 'boolean', label: 'Sanctions match' },
    adverse_media_match: { type: 'boolean', label: 'Adverse media match' },
    notes: { type: 'string', label: 'Notes' },
    // written by derive, never by the client
    sla_deadline: { type: 'string', label: 'SLA deadline (derived from risk level)' },
    submitted_at: { type: 'string', label: 'Documents submitted at' },
    documents_received_at: { type: 'string', label: 'Documents received at' },
    screening_started_at: { type: 'string', label: 'Screening started at' },
    edd_started_at: { type: 'string', label: 'EDD started at' },
    review_started_at: { type: 'string', label: 'Compliance review started at' },
    conditionally_approved_at: { type: 'string', label: 'Conditionally approved at' },
    verified_at: { type: 'string', label: 'Verified at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    suspended_at: { type: 'string', label: 'Suspended at' },
    reinstated_at: { type: 'string', label: 'Reinstated at' },
    lapsed_at: { type: 'string', label: 'Lapsed at' },
  },

  initial: 'pending_submission',

  states: {
    pending_submission: { label: 'Pending submission', terminal: false, holder: 'participant', sla: { days: 5 } },
    documents_submitted: { label: 'Documents submitted', terminal: false, holder: 'compliance', sla: { hours: 48 } },
    documents_incomplete: { label: 'Documents incomplete', terminal: false, holder: 'participant', sla: { days: 5 } },
    documents_received: { label: 'Documents received', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    automated_screening: { label: 'Automated screening', terminal: false, holder: 'compliance', sla: { hours: 24 } },
    enhanced_due_diligence: { label: 'Enhanced due diligence', terminal: false, holder: 'compliance', sla: { days: 5 } },
    compliance_review: { label: 'Compliance review', terminal: false, holder: 'compliance', sla: { hours: 48 } },
    conditionally_approved: { label: 'Conditionally approved', terminal: false, holder: 'compliance', sla: { days: 30 } },
    verified: { label: 'Verified', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    suspended: { label: 'Suspended', terminal: false, holder: 'compliance', sla: { days: 30 } },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'pending_submission',
      by: ['compliance', 'operator'],
      actorBecomes: 'compliance',
      label: 'Open KYC verification',
      intent: 'primary',
      input: {
        participant_party: { type: 'party', role: 'participant' },
        participant_name: { type: 'string' },
        entity_type: { type: 'string' },
        risk_level: { type: 'string' },
      },
      guards: [],
      derive: (f, at: Instant) => ({ sla_deadline: isoUtc(addDuration(at, { days: slaDaysForRisk(f.risk_level) })) }),
    },

    // --- document intake --------------------------------------------------
    {
      id: 'submit_documents',
      from: ['pending_submission', 'documents_incomplete'],
      to: 'documents_submitted',
      by: ['participant', 'compliance', 'operator'],
      label: 'Submit documents',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'request_more_documents',
      from: ['documents_submitted', 'documents_received'],
      to: 'documents_incomplete',
      by: ['compliance', 'operator'],
      label: 'Request more documents',
      intent: 'secondary',
      input: { notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'confirm_documents_received',
      from: 'documents_submitted',
      to: 'documents_received',
      by: ['compliance', 'operator'],
      label: 'Confirm documents received',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ documents_received_at: isoUtc(at) }),
    },

    // --- screening ----------------------------------------------------------
    {
      id: 'run_screening',
      from: 'documents_received',
      to: 'automated_screening',
      by: ['compliance', 'operator'],
      label: 'Run screening',
      intent: 'primary',
      input: {
        pep_match: { type: 'boolean' },
        sanctions_match: { type: 'boolean' },
        adverse_media_match: { type: 'boolean' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ screening_started_at: isoUtc(at) }),
    },
    {
      // high-risk/PEP branch: escalate to enhanced due diligence before review.
      id: 'trigger_edd',
      from: ['automated_screening', 'documents_received'],
      to: 'enhanced_due_diligence',
      by: ['compliance'],
      label: 'Trigger EDD',
      intent: 'secondary',
      guards: [],
      derive: (_f, at: Instant) => ({ edd_started_at: isoUtc(at) }),
    },
    {
      id: 'complete_edd',
      from: 'enhanced_due_diligence',
      to: 'compliance_review',
      by: ['compliance'],
      label: 'Complete EDD',
      intent: 'primary',
      input: { edd_report_ref: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ review_started_at: isoUtc(at) }),
    },
    {
      // standard/medium branch: straight into compliance review, no EDD needed.
      id: 'start_review',
      from: ['automated_screening', 'enhanced_due_diligence', 'documents_received'],
      to: 'compliance_review',
      by: ['compliance', 'operator'],
      label: 'Start compliance review',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ review_started_at: isoUtc(at) }),
    },

    // --- decision -------------------------------------------------------------
    {
      id: 'approve_conditionally',
      from: 'compliance_review',
      to: 'conditionally_approved',
      by: ['compliance'],
      label: 'Approve conditionally',
      intent: 'primary',
      input: { conditions_text: { type: 'string', required: true } },
      // conditional approval still admits the participant — no admission
      // under a platform-wide compliance halt.
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ conditionally_approved_at: isoUtc(at) }),
    },
    {
      id: 'lift_conditions',
      from: 'conditionally_approved',
      to: 'verified',
      by: ['compliance'],
      label: 'Lift conditions',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'verify',
      from: ['compliance_review', 'conditionally_approved'],
      to: 'verified',
      by: ['compliance'],
      label: 'Verify',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ verified_at: isoUtc(at) }),
    },
    {
      id: 'reject',
      from: ['documents_received', 'automated_screening', 'enhanced_due_diligence', 'compliance_review', 'conditionally_approved'],
      to: 'rejected',
      by: ['compliance'],
      label: 'Reject',
      intent: 'destructive',
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },

    // --- post-verification / non-cooperation exits ----------------------------
    {
      // v1's transition table lists 'verified' as a from-state too, but v1's
      // route always blocks the hard-terminal check first when current is
      // 'verified' — that path never actually fires. Kept out here to match
      // real behaviour rather than the merely-declared (dead) table entry.
      id: 'suspend',
      from: ['conditionally_approved', 'compliance_review'],
      to: 'suspended',
      by: ['compliance'],
      label: 'Suspend',
      intent: 'destructive',
      requiresReason: ['sar_filed', 'ongoing_cdd_concern', 'adverse_media_post_verification', 'sanctions_hit_post_verification', 'regulatory_direction'],
      guards: [],
      derive: (_f, at: Instant) => ({ suspended_at: isoUtc(at) }),
    },
    {
      id: 'reinstate',
      from: 'suspended',
      to: 'compliance_review',
      by: ['compliance'],
      label: 'Reinstate',
      intent: 'primary',
      input: { notes: { type: 'string' } },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ reinstated_at: isoUtc(at) }),
    },
    {
      id: 'mark_lapsed',
      from: ['pending_submission', 'documents_submitted', 'documents_incomplete'],
      to: 'lapsed',
      by: ['compliance'],
      label: 'Mark lapsed',
      intent: 'destructive',
      requiresReason: ['submission_deadline_missed', 'non_responsive', 'documents_withdrawn'],
      guards: [],
      derive: (_f, at: Instant) => ({ lapsed_at: isoUtc(at) }),
    },
  ],
};
