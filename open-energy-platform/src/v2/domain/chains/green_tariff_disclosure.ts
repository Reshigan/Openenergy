// green_tariff_disclosure — W210 GHG Scope-2 / I-REC additionality labelling
// lifecycle as data.
//
// An offtaker submits a claim that its consumption is covered by a green
// tariff (REC/GOO-backed), platform ops (support) runs eligibility and
// REC/GOO attribute matching against the I-REC registry, an independent
// verifier signs off (approve_review), the verified claim goes to CDP
// Climate Change / SBTi for public Scope-2 credit, a green-label certificate
// is issued, and the offtaker completes the public disclosure.
//
// Structural honesty (no invented guards):
//  - single-party record (legacy registry: counterpartyCol: null) — visibility
//    is 'owner', not 'party'; no counterpartyDistinct guard applies (there is
//    no second party to be distinct from).
//  - issue_label is the edge that mints the actual green-label certificate —
//    the public market claim this whole chain exists to protect against
//    false-green-claim risk. That's the one edge gated by complianceHaltClear,
//    mirroring carbon_issuance's "issue serials" gate: a platform-wide
//    compliance halt blocks minting new public claims, but never blocks
//    reject/withdraw (de-risking must always stay open).
//  - complete_disclosure is reachable ONLY from labelled, and the only edge
//    into labelled is issue_label — so a disclosure can never go public
//    without a halt-checked label having been issued first. No extra guard
//    needed on complete_disclosure itself.
//  - rec_serial_from/rec_serial_to are I-REC certificate references (often
//    alphanumeric), not the numeric tCO2e serial range serialRangeConsistent
//    checks — that guard doesn't fit this field shape, so it's not force-fit
//    here.
//
// settles:false — legacy quantumCol is null (MWh / match-% only, no
// ZAR-at-risk column); this chain never moves money (R-S5-1).

import type { ChainDecl, Instant } from '../types';
import { isoUtc } from '../time';

export const greenTariffDisclosure: ChainDecl = {
  key: 'green_tariff_disclosure',
  noun: 'Green-tariff disclosure',
  refPrefix: 'GTD',
  title: (f) =>
    `Green-tariff disclosure — ${(f.disclosure_period as string) ?? 'undated'}${f.green_tariff_class ? ` (${f.green_tariff_class as string})` : ''}`,
  visibility: 'owner',
  settles: false,
  roles: ['offtaker', 'support', 'admin'],

  fields: {
    disclosure_period: { type: 'string', required: true, label: 'Disclosure period' },
    green_tariff_class: { type: 'string', label: 'Green tariff class (voluntary/corporate_ppa/utility_green_tariff/sbti_aligned)' },
    consumption_mwh: { type: 'number', min: 0, label: 'Consumption (MWh)' },
    contracted_green_mwh: { type: 'number', min: 0, label: 'Contracted green (MWh)' },
    generation_technology: { type: 'string', label: 'Generation technology' },
    additionality_claim: { type: 'boolean', label: 'Additionality claim' },
    ppa_ref: { type: 'string', label: 'PPA ref' },
    tariff_contract_number: { type: 'string', label: 'Tariff contract number' },
    matched_rec_mwh: { type: 'number', min: 0, label: 'Matched REC/GOO (MWh)' },
    match_percentage: { type: 'number', min: 0, max: 100, label: 'Match percentage' },
    rec_serial_from: { type: 'string', label: 'REC/GOO serial (from)' },
    rec_serial_to: { type: 'string', label: 'REC/GOO serial (to)' },
    irec_registry: { type: 'string', label: 'I-REC registry' },
    cdp_submission_ref: { type: 'string', label: 'CDP submission reference' },
    sbti_target_ref: { type: 'string', label: 'SBTi target reference' },
    reviewer_name: { type: 'string', label: 'Reviewer name' },
    reviewer_ref: { type: 'string', label: 'Reviewer reference' },
    label_certificate_number: { type: 'string', label: 'Label certificate number' },
    label_valid_until: { type: 'string', label: 'Label valid until' },
    disclosure_date: { type: 'string', label: 'Disclosure date' },
    // written by derive, never by the client
    submitted_at: { type: 'string', label: 'Submitted at' },
    eligibility_started_at: { type: 'string', label: 'Eligibility check started at' },
    matching_started_at: { type: 'string', label: 'Attribute matching started at' },
    submitted_for_review_at: { type: 'string', label: 'Submitted for review at' },
    reviewed_at: { type: 'string', label: 'Reviewed at' },
    cdp_submitted_at: { type: 'string', label: 'Submitted to CDP/SBTi at' },
    labelled_at: { type: 'string', label: 'Labelled at' },
    disclosed_at: { type: 'string', label: 'Disclosed at' },
    rejected_at: { type: 'string', label: 'Rejected at' },
    withdrawn_at: { type: 'string', label: 'Withdrawn at' },
  },

  initial: 'submitted',

  states: {
    submitted: { label: 'Submitted', terminal: false, holder: 'support', sla: { days: 5 } },
    eligibility_check: { label: 'Eligibility check', terminal: false, holder: 'support', sla: { days: 10 } },
    attribute_matching: { label: 'Attribute matching', terminal: false, holder: 'support', sla: { days: 10 } },
    under_review: { label: 'Under independent review', terminal: false, holder: 'support', sla: { days: 15 } },
    reviewed: { label: 'Reviewed', terminal: false, holder: 'offtaker', sla: { days: 5 } },
    cdp_submitted: { label: 'Submitted to CDP/SBTi', terminal: false, holder: 'offtaker', sla: { days: 10 } },
    labelled: { label: 'Green label issued', terminal: false, holder: 'offtaker', sla: { days: 5 } },
    disclosed: { label: 'Disclosed', terminal: true, holder: 'none' },
    rejected: { label: 'Rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'submitted',
      by: ['offtaker', 'support', 'admin'],
      actorBecomes: 'offtaker',
      label: 'Submit green-tariff disclosure',
      intent: 'primary',
      input: {
        disclosure_period: { type: 'string', required: true },
        green_tariff_class: { type: 'string' },
        consumption_mwh: { type: 'number', min: 0 },
        contracted_green_mwh: { type: 'number', min: 0 },
        generation_technology: { type: 'string' },
        additionality_claim: { type: 'boolean' },
        ppa_ref: { type: 'string' },
        tariff_contract_number: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      id: 'start_eligibility',
      from: 'submitted',
      to: 'eligibility_check',
      by: ['offtaker', 'support', 'admin'],
      label: 'Start eligibility check',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ eligibility_started_at: isoUtc(at) }),
    },
    {
      id: 'begin_attribute_matching',
      from: 'eligibility_check',
      to: 'attribute_matching',
      by: ['offtaker', 'support', 'admin'],
      label: 'Begin attribute matching',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ matching_started_at: isoUtc(at) }),
    },
    {
      id: 'submit_for_review',
      from: 'attribute_matching',
      to: 'under_review',
      by: ['offtaker', 'support', 'admin'],
      label: 'Submit for review',
      intent: 'primary',
      input: {
        matched_rec_mwh: { type: 'number', min: 0 },
        match_percentage: { type: 'number', min: 0, max: 100 },
        rec_serial_from: { type: 'string' },
        rec_serial_to: { type: 'string' },
        irec_registry: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_for_review_at: isoUtc(at) }),
    },
    {
      id: 'approve_review',
      from: 'under_review',
      to: 'reviewed',
      by: ['offtaker', 'support', 'admin'],
      label: 'Approve review',
      intent: 'primary',
      input: {
        reviewer_name: { type: 'string' },
        reviewer_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ reviewed_at: isoUtc(at) }),
    },
    {
      id: 'submit_to_cdp',
      from: 'reviewed',
      to: 'cdp_submitted',
      by: ['offtaker', 'support', 'admin'],
      label: 'Submit to CDP/SBTi',
      intent: 'primary',
      input: {
        cdp_submission_ref: { type: 'string' },
        sbti_target_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ cdp_submitted_at: isoUtc(at) }),
    },
    {
      // mints the actual green-label certificate — the public claim this
      // chain exists to protect. Blocked under a platform-wide compliance
      // halt, mirroring carbon_issuance's "issue serials" gate.
      id: 'issue_label',
      from: 'cdp_submitted',
      to: 'labelled',
      by: ['offtaker', 'support', 'admin'],
      label: 'Issue green label',
      intent: 'primary',
      input: {
        label_certificate_number: { type: 'string' },
        label_valid_until: { type: 'string' },
      },
      guards: ['complianceHaltClear'],
      derive: (_f, at: Instant) => ({ labelled_at: isoUtc(at) }),
    },
    {
      // the only edge into disclosed, and it only fires from labelled — so a
      // disclosure can never go public without a halt-checked label first.
      id: 'complete_disclosure',
      from: 'labelled',
      to: 'disclosed',
      by: ['offtaker', 'support', 'admin'],
      label: 'Complete disclosure',
      intent: 'primary',
      input: { disclosure_date: { type: 'string' } },
      guards: [],
      derive: (_f, at: Instant) => ({ disclosed_at: isoUtc(at) }),
    },

    // --- exits, reachable from any live step before the public claim lands ---
    {
      id: 'reject',
      from: ['submitted', 'eligibility_check', 'attribute_matching', 'under_review', 'reviewed', 'cdp_submitted', 'labelled'],
      to: 'rejected',
      by: ['offtaker', 'support', 'admin'],
      label: 'Reject',
      intent: 'destructive',
      requiresReason: ['ppa_not_aligned', 'rec_goo_not_sourced', 'insufficient_match_percentage', 'registry_verification_failed', 'false_green_claim_suspected'],
      guards: [],
      derive: (_f, at: Instant) => ({ rejected_at: isoUtc(at) }),
    },
    {
      id: 'withdraw',
      from: ['submitted', 'eligibility_check', 'attribute_matching', 'under_review', 'reviewed', 'cdp_submitted', 'labelled'],
      to: 'withdrawn',
      by: ['offtaker', 'support', 'admin'],
      label: 'Withdraw',
      intent: 'destructive',
      requiresReason: ['no_longer_pursuing', 'disclosure_superseded', 'data_error'],
      guards: [],
      derive: (_f, at: Instant) => ({ withdrawn_at: isoUtc(at) }),
    },
  ],
};
