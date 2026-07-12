// facility_amendment — project-finance facility (loan) amendment consent
// lifecycle as data.
//
// A borrower requests an amendment to a syndicated facility agreement; the
// facility agent assesses eligibility, circulates to lenders, and gathers the
// required consent (majority-vote or unanimous, per amendment_class) before the
// amendment can be documented, executed and made effective.
//
// The consent spine is structural, not guarded: make_effective leaves ONLY
// execution_signed, and the ONLY path into execution_signed is sign_execution
// from documentation_prepared, which in turn is reachable ONLY from
// consent_obtained. So an amendment can NEVER become effective before lender
// consent has actually been obtained and the deed executed — the state graph
// enforces it. On top of that, sign_execution is guarded by
// executionEvidencePresent: an executed amendment deed needs a board-approval
// ref and a named legal counterparty.
//
// settles:false — an amendment records a change to contractual terms, it does
// not itself move money (R-S5-1). Any resulting fee/prepayment settles on the
// facility chain, not here.

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure: which consent regime an amendment class demands. Unanimous-class and
// security variations bind every lender; everything else is a majority vote.
const consentMode = (cls: Json | undefined): string =>
  cls === 'unanimous_consent' ? 'unanimous' : 'majority';

export const facilityAmendment: ChainDecl = {
  key: 'facility_amendment',
  noun: 'Facility amendment',
  refPrefix: 'FA',
  title: (f) =>
    `${(f.amendment_class as string) ?? 'amendment'} — facility ${(f.facility_id as string) ?? 'unknown'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Common Terms Agreement', provision: 'amendment & waiver — required lender consent thresholds', effect: 'requires' },
    { instrument: 'NCA 2005', provision: 's50 change to a credit agreement', effect: 'requires' },
  ],
  roles: ['borrower', 'agent', 'regulator'],

  fields: {
    amendment_ref: { type: 'string', label: 'Amendment ref' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower' },
    agent_party: { type: 'party', role: 'agent', label: 'Facility agent' },
    facility_id: { type: 'string', required: true, label: 'Facility' },
    amendment_class: { type: 'string', required: true, label: 'Class (unanimous_consent/majority_consent/technical_amendment/administrative_amendment/clerical_correction)' },
    amendment_type: { type: 'string', label: 'Amendment type' },
    description: { type: 'string', required: true, label: 'Description' },
    majority_threshold_pct: { type: 'number', min: 0, max: 100, label: 'Majority threshold (%)' },
    security_variation: { type: 'boolean', label: 'Varies security package' },
    pricing_change_bps: { type: 'number', label: 'Pricing change (bps)' },
    consent_deadline: { type: 'string', label: 'Consent deadline' },
    effective_date: { type: 'string', label: 'Requested effective date' },
    // execution evidence, supplied at sign_execution
    board_approval_ref: { type: 'string', label: 'Board approval ref' },
    legal_counterparty_ref: { type: 'string', label: 'Legal counterparty ref' },
    // written by derive, never by the client
    consent_mode: { type: 'string', label: 'Consent mode' },
    consent_obtained_at: { type: 'string', label: 'Consent obtained at' },
    effective_at: { type: 'string', label: 'Effective at' },
  },

  initial: 'amendment_requested',

  states: {
    amendment_requested: { label: 'Amendment requested', terminal: false, holder: 'agent', sla: { hours: 48 } },
    eligibility_assessed: { label: 'Eligibility assessed', terminal: false, holder: 'agent', sla: { hours: 24 } },
    lender_circulated: { label: 'Circulated to lenders', terminal: false, holder: 'agent', sla: { days: 10 } },
    majority_response: { label: 'Majority response', terminal: false, holder: 'agent', sla: { days: 5 } },
    unanimous_required: { label: 'Unanimous consent required', terminal: false, holder: 'agent', sla: { days: 10 } },
    consent_obtained: { label: 'Consent obtained', terminal: false, holder: 'agent', sla: { hours: 48 } },
    documentation_prepared: { label: 'Documentation prepared', terminal: false, holder: 'agent', sla: { hours: 48 } },
    execution_signed: { label: 'Execution signed', terminal: false, holder: 'agent', sla: { hours: 24 } },
    effective: { label: 'Effective', terminal: true, holder: 'none' },
    refused: { label: 'Refused', terminal: true, holder: 'none' },
    lapsed: { label: 'Lapsed', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'amendment_requested',
      by: ['borrower'],
      actorBecomes: 'borrower',
      label: 'Request amendment',
      intent: 'primary',
      input: {
        facility_id: { type: 'string', required: true },
        amendment_class: { type: 'string', required: true },
        amendment_type: { type: 'string' },
        description: { type: 'string', required: true },
        security_variation: { type: 'boolean' },
        pricing_change_bps: { type: 'number' },
        consent_deadline: { type: 'string' },
        effective_date: { type: 'string' },
        agent_party: { type: 'party', role: 'agent' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'assess_eligibility',
      from: 'amendment_requested',
      to: 'eligibility_assessed',
      by: ['agent'],
      label: 'Assess eligibility',
      intent: 'primary',
      input: { majority_threshold_pct: { type: 'number', min: 0, max: 100 } },
      guards: [],
      derive: (f, _at: Instant) => ({ consent_mode: consentMode(f.amendment_class) }),
    },
    {
      id: 'circulate_to_lenders',
      from: 'eligibility_assessed',
      to: 'lender_circulated',
      by: ['agent'],
      label: 'Circulate to lenders',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'record_majority',
      from: 'lender_circulated',
      to: 'majority_response',
      by: ['agent'],
      label: 'Record majority response',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'escalate_unanimous',
      from: 'lender_circulated',
      to: 'unanimous_required',
      by: ['agent'],
      label: 'Escalate to unanimous consent',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'obtain_consent',
      from: ['majority_response', 'unanimous_required'],
      to: 'consent_obtained',
      by: ['agent'],
      label: 'Confirm consent obtained',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ consent_obtained_at: isoUtc(at) }),
    },
    {
      id: 'prepare_documentation',
      from: 'consent_obtained',
      to: 'documentation_prepared',
      by: ['agent'],
      label: 'Prepare amendment documentation',
      intent: 'primary',
      guards: [],
    },
    {
      // structural consent gate: the ONLY edge into execution_signed, reachable
      // ONLY from documentation_prepared (⇐ consent_obtained). An amendment
      // therefore cannot be executed before consent was obtained. Guarded on top
      // by execution evidence (board approval + named legal counterparty).
      id: 'sign_execution',
      from: 'documentation_prepared',
      to: 'execution_signed',
      by: ['agent', 'borrower'],
      label: 'Sign execution',
      intent: 'primary',
      // not `required` at the coercion layer on purpose: executionEvidencePresent
      // is the single enforcer of both refs (present + well-formed), so a missing
      // one surfaces as MISSING_BOARD_APPROVAL / MISSING_LEGAL_COUNTERPARTY.
      input: {
        board_approval_ref: { type: 'string' },
        legal_counterparty_ref: { type: 'string' },
      },
      guards: ['executionEvidencePresent'],
    },
    {
      // structural gate: make_effective leaves ONLY execution_signed. No path
      // skips consent → documentation → execution.
      id: 'make_effective',
      from: 'execution_signed',
      to: 'effective',
      by: ['agent'],
      label: 'Make effective',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ effective_at: isoUtc(at) }),
    },

    // --- exits ----------------------------------------------------------------
    {
      id: 'refuse',
      from: ['lender_circulated', 'majority_response', 'unanimous_required'],
      to: 'refused',
      by: ['agent'],
      label: 'Refuse amendment',
      intent: 'destructive',
      requiresReason: ['insufficient_consent', 'threshold_not_met', 'security_impact', 'credit_committee_declined'],
      guards: [],
    },
    {
      id: 'lapse',
      from: ['amendment_requested', 'eligibility_assessed', 'lender_circulated', 'majority_response', 'unanimous_required'],
      to: 'lapsed',
      by: ['agent'],
      label: 'Lapse (consent deadline passed)',
      intent: 'destructive',
      requiresReason: ['consent_deadline_passed', 'quorum_not_reached', 'no_response'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: ['amendment_requested', 'eligibility_assessed'],
      to: 'withdrawn',
      by: ['borrower'],
      label: 'Withdraw request',
      intent: 'destructive',
      requiresReason: ['no_longer_required', 'superseded', 'commercial_change'],
      guards: [],
    },
  ],

  // consent-deadline time-bar: a circulation left unresolved past the deadline
  // lapses. record-only stub; the sweep computes the real bar off state sla.
  timers: [{ onState: 'lender_circulated', after: { days: 0 }, fire: 'lapse', kind: 'time_bar' }],
};
