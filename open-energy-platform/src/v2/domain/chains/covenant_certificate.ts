// covenant_certificate — periodic debt-covenant compliance certificate lifecycle.
//
// A borrower (project SPV) is obliged, each test period, to deliver a compliance
// certificate to the lender/facility agent stating its financial ratios (DSCR,
// LLCR, gearing) against the facility thresholds. The lender reviews, then
// INDEPENDENTLY verifies the ratios, then either affirms compliance or flags a
// breach. A breach routes to waiver, cure, or (uncured) acceleration.
//
// Structural spine: affirm_compliant leaves ONLY ratios_verified, and the ONLY
// path into ratios_verified is verify_ratios (from under_review). So a
// certificate can NEVER be marked compliant on the borrower's self-stated
// numbers — the lender must verify the ratios first. No guard needed; the state
// graph forbids the shortcut. The breach set is computed purely in derive at
// verification, never taken on trust from the submission.
//
// counterpartyDistinct on begin_review: the reviewing lender-of-record must be a
// different legal entity from the borrower (no self-certification).
//
// settles:false — a compliance certificate is a governance record, never a
// payment (R-S5-1).

import type { ChainDecl, Instant, Json } from '../types';
import { isoUtc } from '../time';

// pure covenant evaluation off the snapshot ratios. No clock, no env.
// DSCR/LLCR breach when actual falls BELOW threshold; gearing when it rises ABOVE.
const evalBreaches = (f: Record<string, Json>): string[] => {
  const lt = (a: Json, b: Json): boolean => typeof a === 'number' && typeof b === 'number' && a < b;
  const gt = (a: Json, b: Json): boolean => typeof a === 'number' && typeof b === 'number' && a > b;
  const out: string[] = [];
  if (lt(f.dscr_actual, f.dscr_threshold)) out.push('DSCR');
  if (lt(f.llcr_actual, f.llcr_threshold)) out.push('LLCR');
  if (gt(f.gearing_actual, f.gearing_threshold)) out.push('GEARING');
  return out;
};

export const covenantCertificate: ChainDecl = {
  key: 'covenant_certificate',
  noun: 'Covenant certificate',
  refPrefix: 'CC',
  title: (f) => `${(f.facility_name as string) ?? 'facility'} covenant certificate — ${(f.test_period as string) ?? 'period'}`,
  visibility: 'party',
  settles: false,
  legalBasis: [
    { instrument: 'Common Terms Agreement', provision: 'financial covenants & periodic compliance certificate', effect: 'requires' },
    { instrument: 'Banks Act 1990', provision: 'prudential monitoring of project-finance exposures', effect: 'requires' },
  ],
  roles: ['borrower', 'lender', 'regulator', 'operator'],

  fields: {
    certificate_number: { type: 'string', label: 'Certificate number' },
    borrower_party: { type: 'party', role: 'borrower', label: 'Borrower (SPV)' },
    lender_party: { type: 'party', role: 'lender', label: 'Lender / facility agent' },
    facility_name: { type: 'string', required: true, label: 'Facility' },
    facility_tier: { type: 'string', label: 'Tier (senior_secured/mezzanine/subordinated)' },
    test_period: { type: 'string', required: true, label: 'Test period (e.g. 2026-Q1)' },
    // borrower-stated ratios + facility thresholds
    dscr_actual: { type: 'number', min: 0, label: 'DSCR actual' },
    dscr_threshold: { type: 'number', min: 0, label: 'DSCR threshold' },
    llcr_actual: { type: 'number', min: 0, label: 'LLCR actual' },
    llcr_threshold: { type: 'number', min: 0, label: 'LLCR threshold' },
    gearing_actual: { type: 'number', min: 0, max: 1, label: 'Gearing actual' },
    gearing_threshold: { type: 'number', min: 0, max: 1, label: 'Gearing threshold' },
    certificate_ref: { type: 'string', label: 'Certificate evidence ref' },
    waiver_ref: { type: 'string', label: 'Waiver request ref' },
    cure_ref: { type: 'string', label: 'Cure plan ref' },
    // written by derive, never by the client
    breached_covenants: { type: 'string', label: 'Breached covenants' },
    any_breach: { type: 'boolean', label: 'Any covenant breached' },
    submitted_at: { type: 'string', label: 'Submitted at' },
    verified_at: { type: 'string', label: 'Ratios verified at' },
    compliant_at: { type: 'string', label: 'Affirmed compliant at' },
    breach_at: { type: 'string', label: 'Breach identified at' },
    cured_at: { type: 'string', label: 'Cured at' },
    accelerated_at: { type: 'string', label: 'Accelerated at' },
  },

  initial: 'certificate_due',

  states: {
    certificate_due: { label: 'Certificate due', terminal: false, holder: 'borrower', sla: { days: 30 } },
    certificate_submitted: { label: 'Certificate submitted', terminal: false, holder: 'lender', sla: { hours: 48 } },
    under_review: { label: 'Under review', terminal: false, holder: 'lender', sla: { hours: 72 } },
    ratios_verified: { label: 'Ratios verified', terminal: false, holder: 'lender', sla: { hours: 24 } },
    breach_identified: { label: 'Breach identified', terminal: false, holder: 'borrower', sla: { days: 5 } },
    waiver_requested: { label: 'Waiver requested', terminal: false, holder: 'lender', sla: { days: 10 } },
    cure_period: { label: 'Cure period', terminal: false, holder: 'borrower', sla: { days: 30 } },
    compliant: { label: 'Compliant', terminal: true, holder: 'none' },
    waiver_granted: { label: 'Waiver granted', terminal: true, holder: 'none' },
    cured: { label: 'Cured', terminal: true, holder: 'none' },
    accelerated: { label: 'Accelerated', terminal: true, holder: 'none' },
    certificate_rejected: { label: 'Certificate rejected', terminal: true, holder: 'none' },
    withdrawn: { label: 'Withdrawn', terminal: true, holder: 'none' },
  },

  transitions: [
    {
      id: 'open',
      from: '@new',
      to: 'certificate_due',
      by: ['borrower', 'operator'],
      actorBecomes: 'borrower',
      label: 'Register certificate obligation',
      intent: 'primary',
      input: {
        certificate_number: { type: 'string' },
        facility_name: { type: 'string', required: true },
        facility_tier: { type: 'string' },
        test_period: { type: 'string', required: true },
        lender_party: { type: 'party', role: 'lender' },
        regulator_party: { type: 'party', role: 'regulator' },
      },
      guards: [],
    },
    {
      id: 'submit_certificate',
      from: 'certificate_due',
      to: 'certificate_submitted',
      by: ['borrower'],
      label: 'Submit compliance certificate',
      intent: 'primary',
      input: {
        dscr_actual: { type: 'number', min: 0, required: true },
        dscr_threshold: { type: 'number', min: 0, required: true },
        llcr_actual: { type: 'number', min: 0 },
        llcr_threshold: { type: 'number', min: 0 },
        gearing_actual: { type: 'number', min: 0, max: 1 },
        gearing_threshold: { type: 'number', min: 0, max: 1 },
        certificate_ref: { type: 'string' },
      },
      guards: [],
      derive: (_f, at: Instant) => ({ submitted_at: isoUtc(at) }),
    },
    {
      // the reviewing lender-of-record must not be the borrower (no self-cert).
      id: 'begin_review',
      from: 'certificate_submitted',
      to: 'under_review',
      by: ['lender'],
      label: 'Begin review',
      intent: 'primary',
      guards: ['counterpartyDistinct'],
    },
    {
      // independent verification: the breach set is computed here, NOT trusted
      // from the borrower's submission.
      id: 'verify_ratios',
      from: 'under_review',
      to: 'ratios_verified',
      by: ['lender'],
      label: 'Verify ratios',
      intent: 'primary',
      guards: [],
      derive: (f, at: Instant) => {
        const breached = evalBreaches(f);
        return { breached_covenants: breached.join(','), any_breach: breached.length > 0, verified_at: isoUtc(at) };
      },
    },
    {
      // structural gate: the ONLY edge into compliant, and it can only fire from
      // ratios_verified — which only verify_ratios reaches. A certificate can
      // never be affirmed compliant on unverified, self-stated numbers.
      id: 'affirm_compliant',
      from: 'ratios_verified',
      to: 'compliant',
      by: ['lender'],
      label: 'Affirm compliant',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ compliant_at: isoUtc(at) }),
    },
    {
      id: 'flag_breach',
      from: 'ratios_verified',
      to: 'breach_identified',
      by: ['lender'],
      label: 'Flag covenant breach',
      intent: 'primary',
      requiresReason: ['dscr_shortfall', 'llcr_shortfall', 'gearing_exceeded', 'multiple_covenants'],
      guards: [],
      derive: (_f, at: Instant) => ({ breach_at: isoUtc(at) }),
    },
    {
      id: 'request_waiver',
      from: 'breach_identified',
      to: 'waiver_requested',
      by: ['borrower'],
      label: 'Request waiver',
      intent: 'primary',
      input: { waiver_ref: { type: 'string', required: true } },
      guards: [],
    },
    {
      id: 'grant_waiver',
      from: 'waiver_requested',
      to: 'waiver_granted',
      by: ['lender'],
      label: 'Grant waiver',
      intent: 'primary',
      requiresReason: ['remediation_agreed', 'one_off_relief', 'no_material_adverse_change'],
      guards: [],
    },
    {
      id: 'enter_cure',
      from: 'breach_identified',
      to: 'cure_period',
      by: ['lender', 'borrower'],
      label: 'Enter cure period',
      intent: 'primary',
      input: { cure_ref: { type: 'string' } },
      guards: [],
    },
    {
      id: 'confirm_cure',
      from: 'cure_period',
      to: 'cured',
      by: ['lender'],
      label: 'Confirm cure',
      intent: 'primary',
      guards: [],
      derive: (_f, at: Instant) => ({ cured_at: isoUtc(at) }),
    },

    // --- destructive exits ----------------------------------------------------
    {
      id: 'accelerate',
      from: ['breach_identified', 'waiver_requested', 'cure_period'],
      to: 'accelerated',
      by: ['lender', 'regulator'],
      label: 'Accelerate facility',
      intent: 'destructive',
      requiresReason: ['uncured_breach', 'waiver_denied', 'cross_default', 'insolvency_event'],
      guards: [],
      derive: (_f, at: Instant) => ({ accelerated_at: isoUtc(at) }),
    },
    {
      id: 'reject_certificate',
      from: ['certificate_submitted', 'under_review'],
      to: 'certificate_rejected',
      by: ['lender'],
      label: 'Reject certificate',
      intent: 'destructive',
      requiresReason: ['incomplete_submission', 'unsupported_ratios', 'wrong_period', 'restatement_required'],
      guards: [],
    },
    {
      id: 'withdraw',
      from: 'certificate_due',
      to: 'withdrawn',
      by: ['borrower'],
      label: 'Withdraw obligation',
      intent: 'destructive',
      requiresReason: ['facility_repaid', 'period_reopened', 'filed_in_error'],
      guards: [],
    },
  ],
};
