// ipp_tpa — IPP Third-Party Access & Wheeling Agreement lifecycle as data.
//
// Legacy source: W154 (chain-registry-meridian.ts, table oe_ipp_tpa; ERA §22 +
// Grid Code §C-2). An IPP applies to wheel power over a network owner's
// transmission/distribution infrastructure. The network owner reviews,
// technically assesses, and proposes commercial terms; the two sides
// negotiate to agreement, sign the TPA agreement, and activate wheeling. A
// rejection (on capacity/technical/commercial grounds) is not final — ERA §22
// gives the IPP a dispute-resolution route to NERSA (file_appeal /
// determine_appeal) before the application either reopens negotiation or
// closes as withdrawn. Legacy `terminal` only names `wheeling_active` and
// `withdrawn`, so every other closure (a denied appeal, an unresolved
// rejection) funnels into `withdrawn` rather than inventing a third terminal.
//
// Quantum is MW, never ZAR (legacy quantumCol: null) — wheeling capacity is
// booked, no money changes hands on this chain.
//
// Structural honesty (no invented guards where a required field already does
// the job):
//  - sign_tpa_agreement requires a live regulator_party on the txn as a
//    REQUIRED input field, not a guard — the legacy cascadeHint says this
//    crossing happens "for every tier", so it's unconditional and belongs at
//    the engine's required-field layer, not a conditional guard.
//  - reject_application is guarded by regulatorPresentIfStrategic — legacy:
//    "crosses into the regulator inbox on major/material capacity" — i.e.
//    conditional on capacity_mw, which is exactly what that guard checks.
//  - activate_wheeling (the moment power actually starts flowing over the
//    network — a new grid commitment) is guarded by complianceHaltClear, the
//    same pattern as commissioning's energise.
//  - open is guarded by counterpartyDistinct: the IPP and the network owner
//    named on the application must be different legal entities.
//
// settles:false — this chain books MW capacity and contractual status, never
// a ZAR settlement (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const ippTpa: ChainDecl = {
  key: 'ipp_tpa',
  noun: 'IPP third-party access / wheeling agreement',
  refPrefix: 'TPA',
  title: (f) =>
    `TPA / wheeling — ${(f.project_id as string) ?? 'project'} (${typeof f.capacity_mw === 'number' ? f.capacity_mw : '?'} MW, ${(f.tpa_category as string) ?? 'network'})`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'ERA 2006', provision: 'Section 22 — third-party access to transmission/distribution infrastructure', effect: 'authorises' },
    { instrument: 'NERSA Grid Code', provision: 'Grid Code §C-2 — wheeling & connection charges', effect: 'requires' },
  ],
  roles: ['ipp_developer', 'admin', 'network_owner', 'regulator'],

  fields: {
    tpa_ref: { type: 'string', label: 'TPA reference' },
    ipp_party: { type: 'party', role: 'ipp_developer', label: 'IPP (applicant)' },
    network_owner_party: { type: 'party', role: 'network_owner', label: 'Network owner' },
    regulator_party: { type: 'party', role: 'regulator', label: 'Regulator (NERSA)' },
    project_id: { type: 'string', required: true, label: 'Project' },
    capacity_mw: { type: 'number', min: 0, label: 'Wheeling capacity (MW)' },
    tpa_category: { type: 'string', label: 'TPA category (eskom_transmission/eskom_distribution/municipality/private_network)' },
    network_owner: { type: 'string', label: 'Network owner name' },
    offtaker_reference: { type: 'string', label: 'Off-taker reference' },
    description: { type: 'string', label: 'Description' },
    commercial_terms_ref: { type: 'string', label: 'Commercial terms reference' },
    negotiation_notes: { type: 'string', label: 'Negotiation notes' },
    terms_agreed_ref: { type: 'string', label: 'Agreed terms reference' },
    agreement_reference: { type: 'string', label: 'TPA agreement reference' },
    appeal_ref: { type: 'string', label: 'Appeal reference' },
    appeal_outcome: { type: 'string', label: 'Appeal outcome (upheld/denied)' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Application submitted at' },
    terms_proposed_at: { type: 'string', label: 'Terms proposed at' },
    agreement_signed_at: { type: 'string', label: 'Agreement signed at' },
    wheeling_activated_at: { type: 'string', label: 'Wheeling activated at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    appeal_filed_at: { type: 'string', label: 'Appeal filed at' },
    appeal_determined_at: { type: 'string', label: 'Appeal determined at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'tpa_application_submitted',

  states: {
    tpa_application_submitted: { label: 'Application submitted', terminal: false, holder: 'network_owner', sla: { days: 30 } },
    network_owner_review: { label: 'Network owner review', terminal: false, holder: 'network_owner', sla: { days: 30 } },
    technical_assessment: { label: 'Technical assessment', terminal: false, holder: 'network_owner', sla: { days: 45 } },
    commercial_terms_proposed: { label: 'Commercial terms proposed', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    negotiation_in_progress: { label: 'Negotiation in progress', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    terms_agreed: { label: 'Terms agreed', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    tpa_agreement_signed: { label: 'TPA agreement signed', terminal: false, holder: 'network_owner', sla: { days: 14 } },
    wheeling_active: { label: 'Wheeling active', terminal: true, holder: 'none' },
    application_rejected: { label: 'Application rejected', terminal: false, holder: 'ipp_developer', sla: { days: 30 } },
    appeal_filed: { label: 'Appeal filed (ERA §22)', terminal: false, holder: 'regulator', sla: { days: 60 } },
    appeal_determined: { label: 'Appeal determined', terminal: false, holder: 'ipp_developer', sla: { days: 14 } },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'tpa_application_submitted',
      by: ['admin', 'ipp_developer'],
      actorBecomes: 'ipp_developer',
      label: 'Submit TPA application',
      intent: 'primary',
      input: {
        project_id: { type: 'string', required: true },
        capacity_mw: { type: 'number', min: 0 },
        tpa_category: { type: 'string' },
        network_owner: { type: 'string' },
        offtaker_reference: { type: 'string' },
        description: { type: 'string' },
        network_owner_party: { type: 'party', role: 'network_owner' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      // the IPP and the network owner it's applying to wheel over must be
      // distinct legal entities.
      guards: ['counterpartyDistinct'],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'begin_network_owner_review',
      from: 'tpa_application_submitted',
      to: 'network_owner_review',
      by: ['admin', 'ipp_developer'],
      label: 'Begin network owner review',
      intent: 'primary',
      guards: [],
    },
    {
      id: 'run_technical_assessment',
      from: 'network_owner_review',
      to: 'technical_assessment',
      by: ['admin', 'ipp_developer'],
      label: 'Run technical assessment',
      intent: 'primary',
      guards: [],
    },
    {
      // matches legacy action exactly: "Issues the network owner's commercial
      // wheeling terms, opening negotiation."
      id: 'propose_commercial_terms',
      from: 'technical_assessment',
      to: 'commercial_terms_proposed',
      by: ['admin', 'ipp_developer'],
      label: 'Propose terms',
      intent: 'primary',
      input: { commercial_terms_ref: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ terms_proposed_at: isoUtc(at) }),
    },
    {
      id: 'begin_negotiation',
      from: 'commercial_terms_proposed',
      to: 'negotiation_in_progress',
      by: ['admin', 'ipp_developer'],
      label: 'Begin negotiation',
      intent: 'secondary',
      input: { negotiation_notes: { type: 'string' } },
      guards: [],
    },
    {
      id: 'agree_terms',
      from: 'negotiation_in_progress',
      to: 'terms_agreed',
      by: ['admin', 'ipp_developer'],
      label: 'Agree commercial terms',
      intent: 'primary',
      input: { terms_agreed_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      // matches legacy action exactly. "Crosses into the regulator inbox for
      // every tier" — unconditional, so it's a required field, not a guard.
      id: 'sign_tpa_agreement',
      from: 'terms_agreed',
      to: 'tpa_agreement_signed',
      by: ['admin', 'ipp_developer'],
      label: 'Sign TPA agreement',
      intent: 'primary',
      input: {
        agreement_reference: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ agreement_signed_at: isoUtc(at) }),
    },
    {
      // matches legacy action exactly. The actual grid commitment moment — a
      // compliance halt blocks new wheeling from going live, same as
      // commissioning's energise.
      id: 'activate_wheeling',
      from: 'tpa_agreement_signed',
      to: 'wheeling_active',
      by: ['admin', 'ipp_developer'],
      label: 'Activate wheeling',
      intent: 'primary',
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ wheeling_activated_at: isoUtc(at) }),
    },

    // --- exits / dispute route --------------------------------------------
    {
      // matches legacy action exactly. "Crosses into the regulator inbox on
      // major/material capacity" — conditional on capacity_mw.
      id: 'reject_application',
      from: ['tpa_application_submitted', 'network_owner_review', 'technical_assessment', 'negotiation_in_progress'],
      to: 'application_rejected',
      by: ['admin', 'ipp_developer'],
      label: 'Reject application',
      intent: 'destructive',
      requiresReason: [
        'network_capacity_insufficient',
        'technical_infeasibility',
        'incomplete_application',
        'non_compliant_grid_code',
        'commercial_terms_unresolved',
      ],
      guards: ['regulatorPresentIfStrategic'],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      // ERA §22 dispute route: a rejection is not final, so `application_rejected`
      // is deliberately non-terminal in legacy — the IPP can appeal to NERSA.
      id: 'file_appeal',
      from: 'application_rejected',
      to: 'appeal_filed',
      by: ['admin', 'ipp_developer'],
      label: 'File ERA §22 appeal',
      intent: 'secondary',
      input: {
        appeal_ref: { type: 'string', required: true },
        regulator_party: { type: 'party', role: 'regulator', required: true },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_filed_at: isoUtc(at) }),
    },
    {
      id: 'determine_appeal',
      from: 'appeal_filed',
      to: 'appeal_determined',
      by: ['admin', 'ipp_developer'],
      label: 'Record appeal determination',
      intent: 'primary',
      input: { appeal_outcome: { type: 'string', required: true } },
      guards: [],
      derive: (_f, at: Instant) => ({ appeal_determined_at: isoUtc(at) }),
    },
    {
      // appeal upheld: reopens negotiation from the commercial-terms step.
      id: 'reopen_after_appeal',
      from: 'appeal_determined',
      to: 'commercial_terms_proposed',
      by: ['admin', 'ipp_developer'],
      label: 'Reopen negotiation (appeal upheld)',
      intent: 'secondary',
      guards: [],
    },
    {
      // legacy only ever names two terminals (wheeling_active, withdrawn), so
      // every other closure — a denied appeal, or a voluntary IPP withdrawal
      // at any open step — funnels here.
      id: 'withdraw_application',
      from: [
        'tpa_application_submitted',
        'network_owner_review',
        'technical_assessment',
        'commercial_terms_proposed',
        'negotiation_in_progress',
        'terms_agreed',
        'tpa_agreement_signed',
        'application_rejected',
        'appeal_determined',
      ],
      to: 'withdrawn',
      by: ['admin', 'ipp_developer'],
      label: 'Withdraw application',
      intent: 'destructive',
      requiresReason: [
        'project_cancelled',
        'commercial_terms_unacceptable',
        'alternative_network_secured',
        'financial_close_lapsed',
        'appeal_denied',
      ],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
